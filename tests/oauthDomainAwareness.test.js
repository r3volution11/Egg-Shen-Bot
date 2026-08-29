/**
 * Tests for OAuth domain-awareness in src/api/server.js — the same bot
 * process can serve the event-request form from more than one domain
 * (e.g. a prod + dev deployment), so the OAuth redirect_uri and the
 * post-login redirect target must be derived from whichever domain the
 * login flow actually started on, not a single static env var. Previously
 * both were hardcoded to process.env.OAUTH_REDIRECT_URI/FORM_URL, which
 * would bounce a dev-domain login back to the prod domain after
 * authenticating.
 *
 * Run with: npx jest tests/oauthDomainAwareness.test.js --verbose
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';

let app;
let mockClient;

function decodeState(authUrl) {
  const url = new URL(authUrl);
  const state = url.searchParams.get('state');
  return JSON.parse(Buffer.from(state, 'base64').toString());
}

beforeEach(async () => {
  const mockMember = { id: 'user-1' };
  const mockGuild = {
    id: 'guild-1',
    name: 'Test Guild',
    members: { fetch: jest.fn().mockResolvedValue(mockMember) },
  };

  mockClient = {
    user: { tag: 'TestBot#1234' },
    guilds: { cache: new Map([['guild-1', mockGuild]]) },
    channels: { fetch: jest.fn() },
  };

  const { createApiServer } = await import('../src/api/server.js');
  app = createApiServer(mockClient);
});

describe('GET /api/auth/discord — redirect_uri derived from the request', () => {
  test('uses the request\'s own Host header, not OAUTH_REDIRECT_URI, when building the Discord authorize URL', async () => {
    const request = await import('supertest');

    const response = await request.default(app)
      .get('/api/auth/discord?guildId=guild-1')
      .set('Host', 'dev.example.com')
      .set('X-Forwarded-Proto', 'https');

    expect(response.status).toBe(302);
    const authUrl = response.headers.location;
    expect(authUrl).toContain(encodeURIComponent('https://dev.example.com/api/auth/discord/callback'));
  });

  test('embeds the originating domain in state so the callback can send the user back to it', async () => {
    const request = await import('supertest');

    const response = await request.default(app)
      .get('/api/auth/discord?guildId=guild-1')
      .set('Host', 'dev.example.com')
      .set('X-Forwarded-Proto', 'https');

    const decoded = decodeState(response.headers.location);
    expect(decoded.guildId).toBe('guild-1');
    expect(decoded.origin).toBe('https://dev.example.com');
  });

  test('a request from a different domain produces a different redirect_uri and origin', async () => {
    const request = await import('supertest');

    const prodResponse = await request.default(app)
      .get('/api/auth/discord?guildId=guild-1')
      .set('Host', 'shudderdrivein.com')
      .set('X-Forwarded-Proto', 'https');
    const devResponse = await request.default(app)
      .get('/api/auth/discord?guildId=guild-1')
      .set('Host', 'dev.shudderdrivein.com')
      .set('X-Forwarded-Proto', 'https');

    const prodState = decodeState(prodResponse.headers.location);
    const devState = decodeState(devResponse.headers.location);

    expect(prodState.origin).toBe('https://shudderdrivein.com');
    expect(devState.origin).toBe('https://dev.shudderdrivein.com');
    expect(prodState.origin).not.toBe(devState.origin);
  });
});

describe('GET /api/auth/discord/callback — redirects back to the originating domain', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockDiscordApiSuccess() {
    global.fetch = jest.fn((url) => {
      if (url === 'https://discord.com/api/oauth2/token') {
        return Promise.resolve({ ok: true, json: async () => ({ access_token: 'fake-token' }) });
      }
      if (url === 'https://discord.com/api/users/@me') {
        return Promise.resolve({ ok: true, json: async () => ({ id: 'user-1', username: 'tester', discriminator: '0', avatar: null }) });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });
  }

  function makeState({ guildId = 'guild-1', origin } = {}) {
    return Buffer.from(JSON.stringify({ guildId, origin })).toString('base64');
  }

  test('a successful login redirects back to the domain the flow started on, not a different one', async () => {
    mockDiscordApiSuccess();
    const request = await import('supertest');

    const state = makeState({ origin: 'https://dev.example.com' });
    const response = await request.default(app)
      .get(`/api/auth/discord/callback?code=fake-code&state=${state}`);

    expect(response.status).toBe(302);
    expect(response.headers.location).toMatch(/^https:\/\/dev\.example\.com\?/);
  });

  test('a different origin in state redirects back to that different domain', async () => {
    mockDiscordApiSuccess();
    const request = await import('supertest');

    const state = makeState({ origin: 'https://shudderdrivein.com' });
    const response = await request.default(app)
      .get(`/api/auth/discord/callback?code=fake-code&state=${state}`);

    expect(response.headers.location).toMatch(/^https:\/\/shudderdrivein\.com\?/);
  });

  test('the token-exchange redirect_uri matches the same origin used at the authorize step', async () => {
    mockDiscordApiSuccess();
    const request = await import('supertest');

    const state = makeState({ origin: 'https://dev.example.com' });
    await request.default(app).get(`/api/auth/discord/callback?code=fake-code&state=${state}`);

    const tokenCall = global.fetch.mock.calls.find(call => call[0] === 'https://discord.com/api/oauth2/token');
    expect(tokenCall).toBeDefined();
    const body = tokenCall[1].body;
    expect(body.get('redirect_uri')).toBe('https://dev.example.com/api/auth/discord/callback');
  });

  test('falls back to OAUTH_REDIRECT_URI/FORM_URL when state has no origin (older links / local dev)', async () => {
    mockDiscordApiSuccess();
    const request = await import('supertest');

    const state = makeState({ origin: undefined });
    const response = await request.default(app)
      .get(`/api/auth/discord/callback?code=fake-code&state=${state}`);

    expect(response.status).toBe(302);
    // Falls back to whatever FORM_URL/localhost default the process has,
    // not throwing/erroring for missing origin.
    expect(response.headers.location).toMatch(/\?guildId=guild-1&auth=success$/);
  });
});

/**
 * The event request form's login cookie is signed (src/utils/sessionCookie.js),
 * and the API takes who's asking from it alone. Before 2.55.1 the cookie
 * was plain base64 JSON anyone could write, and the submit route trusted a
 * submitter id from the request body: anyone could request as any member.
 *
 * Run with: npm test -- tests/session-cookie.test.js
 */

import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { Collection } from 'discord.js';
import { signSession, readSession, SESSION_MAX_AGE_MS } from '../src/utils/sessionCookie.js';
import { saveGuildConfig } from '../src/utils/guildConfig.js';
import { sessionCookieFor } from './harness/sessionCookie.js';

const unsigned = (session) => Buffer.from(JSON.stringify({ timestamp: Date.now(), ...session })).toString('base64');

describe('signing and reading', () => {
  test('a signed session reads back as itself', () => {
    const s = readSession(signSession({ userId: '42', username: 'sam', discriminator: '0' }));
    expect(s).toMatchObject({ userId: '42', username: 'sam', discriminator: '0' });
  });

  test('refused: the old unsigned kind, a tampered one, garbage, and nothing', () => {
    expect(readSession(unsigned({ userId: '42' }))).toBeNull();
    const [payload, sig] = signSession({ userId: '42', username: 'sam' }).split('.');
    const forged = Buffer.from(JSON.stringify({ userId: '1', username: 'admin', timestamp: Date.now() })).toString('base64url');
    expect(readSession(`${forged}.${sig}`)).toBeNull();
    expect(readSession(`${payload}.${sig}x`)).toBeNull();
    expect(readSession(`${payload}.${sig}.extra`)).toBeNull();
    expect(readSession('...')).toBeNull();
    expect(readSession(undefined)).toBeNull();
  });

  test('refused after 24 hours, or dated in the future', () => {
    const now = Date.now();
    const cookie = signSession({ userId: '42' }, now);
    expect(readSession(cookie, now + SESSION_MAX_AGE_MS - 1000)).not.toBeNull();
    expect(readSession(cookie, now + SESSION_MAX_AGE_MS + 1000)).toBeNull();
    expect(readSession(signSession({ userId: '42' }, now + 3600e3), now)).toBeNull();
  });

  describe('the secret', () => {
    const saved = { ...process.env };
    afterEach(() => { process.env.SESSION_SECRET = saved.SESSION_SECRET; process.env.DISCORD_CLIENT_SECRET = saved.DISCORD_CLIENT_SECRET; });

    test('another secret\'s cookie is refused', () => {
      const cookie = signSession({ userId: '42' });
      process.env.SESSION_SECRET = 'a-different-secret';
      expect(readSession(cookie)).toBeNull();
    });

    test('without SESSION_SECRET, one derived from DISCORD_CLIENT_SECRET (so existing installs keep working)', () => {
      delete process.env.SESSION_SECRET;
      process.env.DISCORD_CLIENT_SECRET = 'client-secret-a';
      const cookie = signSession({ userId: '42' });
      expect(readSession(cookie)).not.toBeNull();
      process.env.DISCORD_CLIENT_SECRET = 'client-secret-b';
      expect(readSession(cookie)).toBeNull();
    });

    test('with neither, signing refuses rather than using a guessable secret', () => {
      delete process.env.SESSION_SECRET;
      delete process.env.DISCORD_CLIENT_SECRET;
      expect(() => signSession({ userId: '42' })).toThrow(/SESSION_SECRET/);
      expect(readSession('a.b')).toBeNull();
    });
  });
});

describe('the API', () => {
  const GUILD = '900000000000000066';
  let app;
  let request;
  let modChannel;
  beforeEach(async () => {
    request = (await import('supertest')).default;
    modChannel = { id: 'mod-1', name: 'mod', isTextBased: () => true, send: jest.fn().mockResolvedValue({ id: 'm1' }) };
    const members = new Set(['42', 'victim']);
    const g = {
      id: GUILD, name: 'T', channels: { cache: new Collection([['mod-1', modChannel]]) }, scheduledEvents: { create: jest.fn() },
      members: { fetch: jest.fn(async (id) => (members.has(id) ? { id } : null)) },
    };
    const client = { user: { tag: 'B#1' }, guilds: { cache: new Map([[GUILD, g]]) }, channels: { fetch: jest.fn().mockResolvedValue(modChannel) } };
    const { createApiServer } = await import('../src/api/server.js');
    app = createApiServer(client);
    await saveGuildConfig(GUILD, { eventRequests: { enabled: true, moderationChannel: 'mod-1' } });
  });

  const submit = (cookie, body = {}) => {
    const r = request(app).post('/api/event-request');
    return (cookie ? r.set('Cookie', cookie) : r).send({
      guildId: GUILD, title: 'Movie Night', startTime: new Date(Date.now() + 864e5).toISOString(), ...body,
    });
  };

  test('/api/auth/session: a forged cookie is not a login, and is cleared', async () => {
    const forged = await request(app).get('/api/auth/session').set('Cookie', `discord_session=${unsigned({ userId: 'victim', username: 'victim' })}`);
    expect(forged.body).toEqual({ authenticated: false });
    expect(forged.headers['set-cookie']?.[0]).toMatch(/^discord_session=;/);

    const real = await request(app).get('/api/auth/session').set('Cookie', sessionCookieFor('42', { username: 'sam' }));
    expect(real.body).toMatchObject({ authenticated: true, user: { id: '42', username: 'sam' } });
  });

  test('submitting needs a real login', async () => {
    expect((await submit(null, { submitterDiscordId: 'victim', submitterUsername: 'victim' })).status).toBe(401);
    expect((await submit(`discord_session=${unsigned({ userId: 'victim', username: 'victim' })}`)).status).toBe(401);
    expect(modChannel.send).not.toHaveBeenCalled();
  });

  test('the submitter is whoever is logged in, whatever the body claims', async () => {
    const res = await submit(sessionCookieFor('42', { username: 'sam' }), { submitterDiscordId: 'victim', submitterUsername: 'victim' });
    expect(res.status).toBe(200);
    const fields = modChannel.send.mock.calls[0][0].embeds[0].toJSON().fields;
    const who = fields.find(f => f.value.includes('<@'));
    expect(who.value).toBe('<@42> (sam)');
    expect(global.eventRequests.get(res.body.requestId)).toMatchObject({ submitterDiscordId: '42', submitterUsername: 'sam' });
  });
});

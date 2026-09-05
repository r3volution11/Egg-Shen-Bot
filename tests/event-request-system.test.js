/**
 * Event Request System Unit Tests
 * Tests API endpoints, OAuth flow, and configuration
 *
 * Uses the REAL guildConfig.js (backed by a cleaned-up guild_configs/
 * directory, same pattern as eventCropRoute.test.js) rather than partial
 * per-test jest.unstable_mockModule mocks. The previous version mocked
 * guildConfig.js from inside individual test bodies with only 1-3 of its
 * 14 real exports stubbed — since Jest's ESM module registry is shared for
 * the whole file and nothing ever called jest.resetModules() between
 * tests, one test's incomplete mock leaked forward and broke every later
 * test that dynamically imported anything depending on guildConfig.js
 * (buttonHandler.js, eggshen-config-events.js, server.js), in an
 * order-dependent way. loadGuildConfig's real behavior for an
 * unconfigured guild is a deterministic, side-effect-free default — using
 * it directly, with saveGuildConfig to set up specific states where a test
 * needs one, is simpler and doesn't have this failure mode.
 */

import { jest } from '@jest/globals';
import { Collection } from 'discord.js';
import fs from 'fs';
import path from 'path';

const CONFIG_DIR = path.join(process.cwd(), 'guild_configs');

function cleanupGuildConfigs() {
  if (fs.existsSync(CONFIG_DIR)) {
    fs.rmSync(CONFIG_DIR, { recursive: true, force: true });
  }
}

describe('Event Request System', () => {
  let mockClient;
  let mockGuild;
  let mockChannel;
  let app;

  beforeEach(async () => {
    cleanupGuildConfigs();

    // Mock Discord client
    mockChannel = {
      id: '123456789',
      name: 'event-requests',
      isTextBased: () => true,
      send: jest.fn().mockResolvedValue({ id: 'msg123' })
    };

    mockGuild = {
      id: '900000000000000099',
      name: 'Test Server',
      channels: {
        // A real Collection (discord.js's Map subclass), not a plain Map —
        // server.js's /api/channels/:guildId route calls .filter()/.map()
        // on guild.channels.cache, which only a Collection supports.
        cache: new Collection([
          ['123456789', mockChannel],
          ['voice123', {
            id: 'voice123',
            name: 'Watch Party Room',
            type: 2 // Voice channel
          }],
          ['stage123', {
            id: 'stage123',
            name: 'Stage Room',
            type: 13 // Stage channel
          }]
        ])
      },
      scheduledEvents: {
        create: jest.fn().mockResolvedValue({
          id: 'event123',
          url: 'https://discord.com/events/123'
        })
      },
      // POST /api/event-request's checkGuildMembership() calls
      // guild.members.fetch(userId) to revalidate the submitter is still a
      // member at submission time — without this, that call throws (no
      // .members on the mock), which checkGuildMembership silently
      // swallows and reports as isMember: false, masking real test
      // failures behind an unrelated "not_member" 403.
      members: {
        fetch: jest.fn().mockResolvedValue({ id: 'member-1' })
      }
    };

    mockClient = {
      user: { tag: 'TestBot#1234' },
      guilds: {
        cache: new Map([['900000000000000099', mockGuild]])
      },
      channels: {
        fetch: jest.fn().mockResolvedValue(mockChannel)
      }
    };

    // Import the server module
    const { createApiServer } = await import('../src/api/server.js');
    app = createApiServer(mockClient);
  });

  afterEach(cleanupGuildConfigs);

  describe('API Health Check', () => {
    test('should return health status', async () => {
      const request = await import('supertest');
      const response = await request.default(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('bot');
      expect(response.body).toHaveProperty('guilds');
    });
  });

  describe('Guild Configuration', () => {
    test('should return guild config when enabled', async () => {
      const { saveGuildConfig } = await import('../src/utils/guildConfig.js');
      await saveGuildConfig('900000000000000099', {
        eventRequests: {
          enabled: true,
          serverName: 'Test Server',
          inviteUrl: 'https://discord.gg/test',
        },
        website: { url: 'http://localhost:8080' }
      });

      const request = await import('supertest');
      const response = await request.default(app)
        .get('/api/guild-config/900000000000000099');

      expect(response.status).toBe(200);
      expect(response.body.config).toHaveProperty('serverName', 'Test Server');
      expect(response.body.config).toHaveProperty('inviteUrl');
      expect(response.body.config).toHaveProperty('websiteUrl');
    });

    test('should return 404 when event requests disabled', async () => {
      // No config saved — loadGuildConfig falls back to its real default,
      // which has eventRequests.enabled: false.
      const request = await import('supertest');
      const response = await request.default(app)
        .get('/api/guild-config/900000000000000099');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Channel Listing', () => {
    test('should return voice and stage channels', async () => {
      const request = await import('supertest');
      const response = await request.default(app)
        .get('/api/channels/900000000000000099');

      expect(response.status).toBe(200);
      expect(response.body.channels).toBeInstanceOf(Array);
      expect(response.body.channels.length).toBeGreaterThan(0);

      const channel = response.body.channels[0];
      expect(channel).toHaveProperty('id');
      expect(channel).toHaveProperty('name');
      expect(channel).toHaveProperty('type');
    });

    test('should return 404 for unknown guild', async () => {
      const request = await import('supertest');
      const response = await request.default(app)
        .get('/api/channels/999999999999999999');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Guild not found');
    });
  });

  describe('Event Request Submission', () => {
    test('should accept valid event request', async () => {
      const { saveGuildConfig } = await import('../src/utils/guildConfig.js');
      await saveGuildConfig('900000000000000099', {
        // moderationChannel must point at a real, text-based channel in
        // the mock guild — mockChannel (id 123456789) is that channel,
        // see the outer beforeEach.
        eventRequests: { enabled: true, moderationChannel: '123456789' }
      });

      const request = await import('supertest');
      const response = await request.default(app)
        .post('/api/event-request')
        .send({
          guildId: '900000000000000099',
          title: 'Friday Night Movie',
          description: 'A movie night',
          channelId: 'voice123',
          startTime: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
          submitterUsername: 'TestUser',
          submitterDiscordId: '123456789'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('requestId');
      expect(mockChannel.send).toHaveBeenCalled();
    });

    test('should reject request with missing required fields', async () => {
      const { saveGuildConfig } = await import('../src/utils/guildConfig.js');
      await saveGuildConfig('900000000000000099', {
        eventRequests: { enabled: true }
      });

      const request = await import('supertest');
      const response = await request.default(app)
        .post('/api/event-request')
        .send({
          guildId: '900000000000000099',
          title: 'Friday Night Movie'
          // Missing channelId, startTime, submitterUsername
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    test('should reject request for disabled guild', async () => {
      // No config saved — loadGuildConfig falls back to its real default,
      // which has eventRequests.enabled: false.
      const request = await import('supertest');
      const response = await request.default(app)
        .post('/api/event-request')
        .send({
          guildId: '900000000000000099',
          title: 'Friday Night Movie',
          channelId: 'voice123',
          startTime: new Date(Date.now() + 86400000).toISOString(),
          submitterUsername: 'TestUser',
          submitterDiscordId: '123456789'
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('not enabled');
    });
  });

  describe('OAuth Flow', () => {
    test('should redirect to Discord authorization', async () => {
      const request = await import('supertest');
      const response = await request.default(app)
        .get('/api/auth/discord?guildId=900000000000000099');

      expect(response.status).toBe(302);
      expect(response.headers.location).toContain('discord.com/api/oauth2/authorize');
      expect(response.headers.location).toContain('client_id');
      expect(response.headers.location).toContain('state');
    });

    test('should require guildId parameter', async () => {
      const request = await import('supertest');
      const response = await request.default(app)
        .get('/api/auth/discord');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Session Management', () => {
    test('should return unauthenticated when no session', async () => {
      const request = await import('supertest');
      const response = await request.default(app)
        .get('/api/auth/session');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('authenticated', false);
    });

    test('should logout and clear cookie', async () => {
      const request = await import('supertest');
      const response = await request.default(app)
        .post('/api/auth/logout');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.headers['set-cookie']).toBeDefined();
    });
  });

  describe('Rate Limiting', () => {
    test('should rate limit event submissions', async () => {
      const { saveGuildConfig } = await import('../src/utils/guildConfig.js');
      await saveGuildConfig('900000000000000099', {
        eventRequests: { enabled: true, moderationChannel: '123456789' }
      });

      const request = await import('supertest');

      // The rate limiter is keyed on Host header + IP (see
      // hostAndIpKeyGenerator in server.js), not IP alone — supertest binds
      // each request to a fresh ephemeral local port with no explicit Host
      // header, so without pinning one here, Express's default host
      // (127.0.0.1:<random port>) differs between the two calls below and
      // they'd never share a rate-limit bucket. A real browser always sends
      // a stable Host header, so this only matters for the test itself.
      const HOST = 'example.com';

      // First request should succeed
      const response1 = await request.default(app)
        .post('/api/event-request')
        .set('Host', HOST)
        .send({
          guildId: '900000000000000099',
          title: 'Event 1',
          channelId: 'voice123',
          startTime: new Date(Date.now() + 86400000).toISOString(),
          submitterUsername: 'TestUser',
          submitterDiscordId: '123456789'
        });

      expect(response1.status).toBe(200);

      // Second request from same host+IP should be rate limited
      const response2 = await request.default(app)
        .post('/api/event-request')
        .set('Host', HOST)
        .send({
          guildId: '900000000000000099',
          title: 'Event 2',
          channelId: 'voice123',
          startTime: new Date(Date.now() + 86400000).toISOString(),
          submitterUsername: 'TestUser',
          submitterDiscordId: '123456789'
        });

      expect(response2.status).toBe(429); // Too Many Requests
    });
  });

  describe('CORS Configuration', () => {
    test('should allow configured origins', async () => {
      // server.js's cors() middleware allows origins from ALLOWED_ORIGINS,
      // falling back to http://localhost:3000 when that env var isn't
      // set — send an Origin matching whichever is actually in effect so
      // this test is deterministic regardless of the runner's .env state.
      const allowedOrigin = process.env.ALLOWED_ORIGINS?.split(',')[0] || 'http://localhost:3000';

      const request = await import('supertest');
      const response = await request.default(app)
        .get('/api/health')
        .set('Origin', allowedOrigin);

      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });
  });
});

describe('Event Request Configuration Commands', () => {
  let mockInteraction;
  const GUILD_ID = '900000000000000099';

  beforeEach(async () => {
    cleanupGuildConfigs();

    mockInteraction = {
      guildId: GUILD_ID,
      member: {
        permissions: {
          has: jest.fn(() => true) // Mock as admin
        }
      },
      options: {
        getSubcommandGroup: jest.fn(() => 'event-requests'),
        getSubcommand: jest.fn(() => 'toggle'),
        getBoolean: jest.fn(() => true),
        getString: jest.fn(() => 'Test Value'),
        getChannel: jest.fn(() => ({ id: '123', isTextBased: () => true }))
      },
      reply: jest.fn(),
      guild: {
        name: 'Test Server'
      }
    };
  });

  afterEach(cleanupGuildConfigs);

  test('should toggle event requests on', async () => {
    const { execute } = await import('../src/commands/eggshen-config-events.js');

    await execute(mockInteraction);

    expect(mockInteraction.reply).toHaveBeenCalled();
    const replyContent = mockInteraction.reply.mock.calls[0][0].content;
    expect(replyContent).toContain('enabled');
  });

  test('should set moderation channel', async () => {
    mockInteraction.options.getSubcommand = jest.fn(() => 'moderation-channel');

    const { execute } = await import('../src/commands/eggshen-config-events.js');
    await execute(mockInteraction);

    expect(mockInteraction.reply).toHaveBeenCalled();
    const replyContent = mockInteraction.reply.mock.calls[0][0].content;
    expect(replyContent).toContain('moderation channel');
  });

  test('should generate event request link', async () => {
    const { saveGuildConfig } = await import('../src/utils/guildConfig.js');
    await saveGuildConfig(GUILD_ID, {
      eventRequests: { enabled: true },
      website: { url: 'http://localhost:8080' }
    });
    mockInteraction.options.getSubcommand = jest.fn(() => 'get-link');

    const { execute } = await import('../src/commands/eggshen-config-events.js');
    await execute(mockInteraction);

    expect(mockInteraction.reply).toHaveBeenCalled();
    const replyArgs = mockInteraction.reply.mock.calls[0][0];
    expect(replyArgs.embeds).toBeDefined();
    // The command's real reply shows the plain configured websiteUrl in
    // the first field (no query string), and the guildId separately in
    // the second field's public/config.js setup snippet — it never
    // appends a "?guild=" param anywhere (that assertion tested behavior
    // the command has never actually had).
    expect(replyArgs.embeds[0].data.fields[0].value).toBe('http://localhost:8080');
    expect(replyArgs.embeds[0].data.fields[1].value).toContain(GUILD_ID);
  });

  test('should reject non-admin users', async () => {
    mockInteraction.member.permissions.has = jest.fn(() => false);

    const { execute } = await import('../src/commands/eggshen-config-events.js');
    await execute(mockInteraction);

    expect(mockInteraction.reply).toHaveBeenCalled();
    const replyContent = mockInteraction.reply.mock.calls[0][0].content;
    expect(replyContent).toContain('Administrator');
  });
});

describe('Event Request Button Handlers', () => {
  let mockInteraction;
  let mockGuild;
  let mockChannel;

  beforeEach(() => {
    global.eventRequests = new Map();

    mockChannel = {
      send: jest.fn().mockResolvedValue({ id: 'msg123' })
    };

    mockGuild = {
      id: '900000000000000099',
      name: 'Test Server',
      // createScheduledEventFromRequest (eventRequestApproval.js) looks up
      // the request's text/voice channel via guild.channels.cache.get(...)
      // to build the event description — needs a real Collection, same
      // reasoning as the outer describe block's mockGuild above.
      channels: {
        cache: new Collection([
          ['voice123', { id: 'voice123', name: 'Watch Party Room', type: 2 }],
        ])
      },
      scheduledEvents: {
        create: jest.fn().mockResolvedValue({
          id: 'event123',
          url: 'https://discord.com/events/123'
        })
      }
    };

    mockInteraction = {
      customId: 'approve_event_123',
      guild: mockGuild,
      guildId: mockGuild.id,
      member: {
        permissions: {
          has: jest.fn(() => true) // Mock as moderator
        }
      },
      user: { id: 'moderator-1', tag: 'Moderator#0001' },
      channel: {
        send: jest.fn().mockResolvedValue({ id: 'announce-msg-1' }),
        messages: {
          fetch: jest.fn().mockResolvedValue(null)
        }
      },
      // The approve path reads/edits the original moderation-channel
      // message: interaction.message.embeds[0] (for buildApprovedEmbed)
      // and interaction.message.edit(...) (to mark it approved).
      message: {
        embeds: [{ data: { title: 'Friday Movie Night', fields: [] } }],
        components: [],
        edit: jest.fn().mockResolvedValue(undefined)
      },
      reply: jest.fn(),
      update: jest.fn(),
      followUp: jest.fn(),
      deferReply: jest.fn().mockResolvedValue(undefined),
      editReply: jest.fn().mockResolvedValue(undefined),
      client: {
        channels: {
          fetch: jest.fn().mockResolvedValue(mockChannel)
        }
      }
    };

    // Mock event request data
    global.eventRequests.set('123', {
      guildId: '900000000000000099',
      title: 'Friday Movie Night',
      description: 'A movie night',
      channelId: 'voice123',
      startTime: new Date(Date.now() + 86400000).toISOString(),
      endTime: null,
      submitterUsername: 'TestUser',
      submitterDiscordId: '123456789'
    });
  });

  afterEach(() => {
    delete global.eventRequests;
  });

  test('should approve event request and create Discord event', async () => {
    const { handleButtonInteraction } = await import('../src/handlers/buttonHandler.js');

    await handleButtonInteraction(mockInteraction);

    expect(mockGuild.scheduledEvents.create).toHaveBeenCalled();
    // The approve path defers then edits the reply (deferReply/editReply),
    // never calls reply() directly on success.
    expect(mockInteraction.deferReply).toHaveBeenCalled();
    expect(mockInteraction.editReply).toHaveBeenCalled();
    expect(global.eventRequests.has('123')).toBe(false); // Should be deleted after approval
  });

  test('should deny event request', async () => {
    mockInteraction.customId = 'deny_event_123';
    mockInteraction.showModal = jest.fn().mockResolvedValue(undefined);

    const { handleButtonInteraction } = await import('../src/handlers/buttonHandler.js');
    await handleButtonInteraction(mockInteraction);

    // Clicking Deny shows a modal collecting an optional reason — it
    // doesn't deny/delete the request immediately. That only happens once
    // the modal is submitted (index.js's deny_event_modal_ handler, not
    // buttonHandler.js at all); see tests/eventRequestDeny.test.js for
    // full coverage of both steps.
    expect(mockGuild.scheduledEvents.create).not.toHaveBeenCalled();
    expect(mockInteraction.showModal).toHaveBeenCalled();
    expect(global.eventRequests.has('123')).toBe(true);
  });

  test('should reject approval from non-moderator', async () => {
    mockInteraction.member.permissions.has = jest.fn(() => false);

    const { handleButtonInteraction } = await import('../src/handlers/buttonHandler.js');
    await handleButtonInteraction(mockInteraction);

    expect(mockGuild.scheduledEvents.create).not.toHaveBeenCalled();
    const replyContent = mockInteraction.reply.mock.calls[0][0].content;
    expect(replyContent).toContain('moderators');
  });

  test('should handle expired request gracefully', async () => {
    global.eventRequests.delete('123'); // Simulate expired/processed request

    const { handleButtonInteraction } = await import('../src/handlers/buttonHandler.js');
    await handleButtonInteraction(mockInteraction);

    expect(mockInteraction.reply).toHaveBeenCalled();
    const replyContent = mockInteraction.reply.mock.calls[0][0].content;
    expect(replyContent).toContain('expired');
  });
});

describe('OAuth Configuration Validation', () => {
  // These tests validate the *logic* used to sanity-check an OAuth config,
  // not this specific machine's .env — they previously asserted directly
  // on process.env with no guard, so they only passed on a machine that
  // happened to have a real .env configured (e.g. a deploy target), and
  // failed unconditionally in a clean checkout or CI. Stubbing a known-
  // valid set of values here (saved/restored around this describe block
  // only) makes the assertions deterministic everywhere, while still
  // exercising the same real env-var-shaped checks.
  const ENV_KEYS = ['OAUTH_REDIRECT_URI', 'DISCORD_CLIENT_SECRET', 'FORM_URL', 'ALLOWED_ORIGINS', 'API_PORT'];
  let originalValues;

  beforeAll(() => {
    originalValues = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));
    process.env.OAUTH_REDIRECT_URI = 'https://example.com/api/auth/discord/callback';
    process.env.DISCORD_CLIENT_SECRET = 'a-fake-client-secret-for-testing';
    process.env.FORM_URL = 'https://example.com';
    process.env.ALLOWED_ORIGINS = 'https://example.com,https://dev.example.com';
    process.env.API_PORT = '3000';
  });

  afterAll(() => {
    for (const key of ENV_KEYS) {
      if (originalValues[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalValues[key];
      }
    }
  });

  test('should validate OAUTH_REDIRECT_URI is set', () => {
    const redirectUri = process.env.OAUTH_REDIRECT_URI;
    expect(redirectUri).toBeDefined();
    expect(redirectUri).toMatch(/^https?:\/\/.+\/api\/auth\/discord\/callback$/);
  });

  test('should validate DISCORD_CLIENT_SECRET is set', () => {
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    expect(clientSecret).toBeDefined();
    expect(clientSecret.length).toBeGreaterThan(10);
  });

  test('should validate FORM_URL matches ALLOWED_ORIGINS', () => {
    const formUrl = process.env.FORM_URL;
    const allowedOrigins = process.env.ALLOWED_ORIGINS;

    expect(formUrl).toBeDefined();
    expect(allowedOrigins).toBeDefined();

    if (formUrl && allowedOrigins) {
      const origins = allowedOrigins.split(',').map(o => o.trim());
      expect(origins).toContain(formUrl);
    }
  });

  test('should validate production URLs use HTTPS', () => {
    const redirectUri = process.env.OAUTH_REDIRECT_URI;
    const formUrl = process.env.FORM_URL;

    // If not localhost, should use HTTPS
    if (redirectUri && !redirectUri.includes('localhost')) {
      expect(redirectUri).toMatch(/^https:\/\//);
    }

    if (formUrl && !formUrl.includes('localhost')) {
      expect(formUrl).toMatch(/^https:\/\//);
    }
  });

  test('should validate redirect URI domain matches form URL domain', () => {
    const redirectUri = process.env.OAUTH_REDIRECT_URI;
    const formUrl = process.env.FORM_URL;

    if (redirectUri && formUrl && !redirectUri.includes('localhost')) {
      const redirectDomain = new URL(redirectUri).hostname;
      const formDomain = new URL(formUrl).hostname;
      expect(redirectDomain).toBe(formDomain);
    }
  });

  test('should validate API_PORT is a valid number', () => {
    const apiPort = process.env.API_PORT;
    if (apiPort) {
      const port = parseInt(apiPort, 10);
      expect(port).toBeGreaterThan(0);
      expect(port).toBeLessThan(65536);
    }
  });
});

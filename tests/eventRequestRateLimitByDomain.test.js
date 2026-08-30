/**
 * Regression test for the event-request rate limiter being keyed on IP
 * alone. A dev subdomain and the production domain are served by the same
 * bot process (see EVENT_REQUEST_SETUP.md's per-domain deployment model),
 * so an IP-only key made a submission on one domain burn the other
 * domain's budget too — reported after a real submission on a dev
 * deployment blocked an immediate follow-up submission on production. The
 * limiter now keys on (Host header + IP), via supertest's
 * `.set('Host', ...)` to simulate each domain.
 *
 * Run with: npx jest tests/eventRequestRateLimitByDomain.test.js --verbose
 */

import { jest } from '@jest/globals';

jest.unstable_mockModule('../src/utils/guildConfig.js', () => ({
  loadGuildConfig: jest.fn().mockResolvedValue({
    eventRequests: {
      enabled: true,
      moderationChannel: '123456789',
    },
  }),
}));

describe('Event request rate limiting is scoped per domain', () => {
  let app;

  function validPayload(title) {
    return {
      guildId: '900000000000000099',
      title,
      description: 'Watch The Thing together',
      channelId: 'voice123',
      startTime: new Date(Date.now() + 86400000).toISOString(),
      submitterUsername: 'TestUser',
      submitterDiscordId: '123456789',
    };
  }

  beforeEach(async () => {
    const mockChannel = {
      id: '123456789',
      name: 'event-requests',
      isTextBased: () => true,
      send: jest.fn().mockResolvedValue({ id: 'msg123' }),
    };

    const mockGuild = {
      id: '900000000000000099',
      name: 'Test Server',
      channels: {
        cache: new Map([
          ['123456789', mockChannel],
          ['voice123', { id: 'voice123', name: 'Watch Party Room', type: 2 }],
        ]),
      },
      members: {
        fetch: jest.fn().mockResolvedValue({ id: '123456789' }),
      },
      scheduledEvents: {
        create: jest.fn().mockResolvedValue({ id: 'event123', url: 'https://discord.com/events/123' }),
      },
    };

    const mockClient = {
      user: { tag: 'TestBot#1234' },
      guilds: { cache: new Map([['900000000000000099', mockGuild]]) },
      channels: { fetch: jest.fn().mockResolvedValue(mockChannel) },
    };

    const { createApiServer } = await import('../src/api/server.js');
    app = createApiServer(mockClient);
  });

  test('a submission on dev.example.com does not rate-limit a submission on example.com', async () => {
    const request = await import('supertest');

    const devResponse = await request.default(app)
      .post('/api/event-request')
      .set('Host', 'dev.example.com')
      .send(validPayload('Dev Domain Event'));

    expect(devResponse.status).toBe(200);

    const prodResponse = await request.default(app)
      .post('/api/event-request')
      .set('Host', 'example.com')
      .send(validPayload('Prod Domain Event'));

    expect(prodResponse.status).toBe(200);
  });

  test('a second submission on the same domain is still rate-limited (regression guard)', async () => {
    const request = await import('supertest');

    const first = await request.default(app)
      .post('/api/event-request')
      .set('Host', 'example.com')
      .send(validPayload('Event 1'));
    expect(first.status).toBe(200);

    const second = await request.default(app)
      .post('/api/event-request')
      .set('Host', 'example.com')
      .send(validPayload('Event 2'));
    expect(second.status).toBe(429);
  });
});

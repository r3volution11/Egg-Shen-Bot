/**
 * Event Request System Unit Tests
 * Tests API endpoints, OAuth flow, and configuration
 */

import { jest } from '@jest/globals';

describe('Event Request System', () => {
  let mockClient;
  let mockGuild;
  let mockChannel;
  let app;

  beforeEach(async () => {
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
        cache: new Map([
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
      // Mock loadGuildConfig to return enabled config
      jest.unstable_mockModule('../src/utils/guildConfig.js', () => ({
        loadGuildConfig: jest.fn(() => ({
          eventRequests: {
            enabled: true,
            serverName: 'Test Server',
            inviteUrl: 'https://discord.gg/test',
            websiteUrl: 'http://localhost:8080'
          }
        }))
      }));

      const request = await import('supertest');
      const response = await request.default(app)
        .get('/api/guild-config/900000000000000099');
      
      expect(response.status).toBe(200);
      expect(response.body.config).toHaveProperty('serverName', 'Test Server');
      expect(response.body.config).toHaveProperty('inviteUrl');
      expect(response.body.config).toHaveProperty('websiteUrl');
    });

    test('should return 404 when event requests disabled', async () => {
      jest.unstable_mockModule('../src/utils/guildConfig.js', () => ({
        loadGuildConfig: jest.fn(() => ({
          eventRequests: {
            enabled: false
          }
        }))
      }));

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
      const request = await import('supertest');
      const response = await request.default(app)
        .post('/api/event-request')
        .send({
          guildId: '900000000000000099',
          title: 'Friday Night Movie',
          description: 'Watch The Thing together',
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
      jest.unstable_mockModule('../src/utils/guildConfig.js', () => ({
        loadGuildConfig: jest.fn(() => ({
          eventRequests: {
            enabled: false
          }
        }))
      }));

      const request = await import('supertest');
      const response = await request.default(app)
        .post('/api/event-request')
        .send({
          guildId: '900000000000000099',
          title: 'Friday Night Movie',
          channelId: 'voice123',
          startTime: new Date(Date.now() + 86400000).toISOString(),
          submitterUsername: 'TestUser'
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
      const request = await import('supertest');
      
      // First request should succeed
      const response1 = await request.default(app)
        .post('/api/event-request')
        .send({
          guildId: '900000000000000099',
          title: 'Event 1',
          channelId: 'voice123',
          startTime: new Date(Date.now() + 86400000).toISOString(),
          submitterUsername: 'TestUser'
        });
      
      expect(response1.status).toBe(200);
      
      // Second request from same IP should be rate limited
      const response2 = await request.default(app)
        .post('/api/event-request')
        .send({
          guildId: '900000000000000099',
          title: 'Event 2',
          channelId: 'voice123',
          startTime: new Date(Date.now() + 86400000).toISOString(),
          submitterUsername: 'TestUser'
        });
      
      expect(response2.status).toBe(429); // Too Many Requests
    });
  });

  describe('CORS Configuration', () => {
    test('should allow configured origins', async () => {
      const request = await import('supertest');
      const response = await request.default(app)
        .get('/api/health')
        .set('Origin', 'http://localhost:8080');
      
      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });
  });
});

describe('Event Request Configuration Commands', () => {
  let mockInteraction;
  let mockGuildConfig;

  beforeEach(async () => {
    mockGuildConfig = {
      eventRequests: {
        enabled: false,
        moderationChannel: null,
        serverName: null,
        inviteUrl: null,
        websiteUrl: null
      }
    };

    mockInteraction = {
      guildId: '900000000000000099',
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

  test('should toggle event requests on', async () => {
    const { execute } = await import('../src/commands/eggshen-config.js');
    
    // Mock loadGuildConfig and saveGuildConfig
    jest.unstable_mockModule('../src/utils/guildConfig.js', () => ({
      loadGuildConfig: jest.fn(() => mockGuildConfig),
      saveGuildConfig: jest.fn(),
      isAdmin: jest.fn(() => true)
    }));

    await execute(mockInteraction);
    
    expect(mockInteraction.reply).toHaveBeenCalled();
    const replyContent = mockInteraction.reply.mock.calls[0][0].content;
    expect(replyContent).toContain('enabled');
  });

  test('should set moderation channel', async () => {
    mockInteraction.options.getSubcommand = jest.fn(() => 'moderation-channel');
    
    const { execute } = await import('../src/commands/eggshen-config.js');
    await execute(mockInteraction);
    
    expect(mockInteraction.reply).toHaveBeenCalled();
    const replyContent = mockInteraction.reply.mock.calls[0][0].content;
    expect(replyContent).toContain('moderation channel');
  });

  test('should generate event request link', async () => {
    mockGuildConfig.eventRequests.enabled = true;
    mockGuildConfig.eventRequests.websiteUrl = 'http://localhost:8080';
    mockInteraction.options.getSubcommand = jest.fn(() => 'get-link');
    
    const { execute } = await import('../src/commands/eggshen-config.js');
    await execute(mockInteraction);
    
    expect(mockInteraction.reply).toHaveBeenCalled();
    const replyArgs = mockInteraction.reply.mock.calls[0][0];
    expect(replyArgs.embeds).toBeDefined();
    expect(replyArgs.embeds[0].data.fields[0].value).toContain('?guild=');
  });

  test('should reject non-admin users', async () => {
    mockInteraction.member.permissions.has = jest.fn(() => false);
    
    const { execute } = await import('../src/commands/eggshen-config.js');
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
      member: {
        permissions: {
          has: jest.fn(() => true) // Mock as moderator
        }
      },
      reply: jest.fn(),
      update: jest.fn(),
      followUp: jest.fn(),
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
      description: 'Watch The Thing',
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
    expect(mockInteraction.reply).toHaveBeenCalled();
    expect(global.eventRequests.has('123')).toBe(false); // Should be deleted after approval
  });

  test('should deny event request', async () => {
    mockInteraction.customId = 'deny_event_123';
    
    const { handleButtonInteraction } = await import('../src/handlers/buttonHandler.js');
    await handleButtonInteraction(mockInteraction);
    
    expect(mockGuild.scheduledEvents.create).not.toHaveBeenCalled();
    expect(mockInteraction.reply).toHaveBeenCalled();
    expect(global.eventRequests.has('123')).toBe(false); // Should be deleted after denial
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

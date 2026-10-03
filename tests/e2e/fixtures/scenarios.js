/**
 * Fixture guild/channel/member data for the Event Request e2e suite.
 *
 * These are entirely made-up example IDs — not tied to any real Discord server.
 * Anyone self-hosting this bot can run this suite as-is against their own local
 * checkout; nothing here depends on a specific deployment.
 */

const TEXT = 0;
const VOICE = 2;

export const GUILD_SIMPLE = {
  id: '900000000000000001',
  name: 'Example Simple-Mode Server',
  channels: [
    { id: '900000000000000011', name: 'mod-queue', type: TEXT },
    { id: '900000000000000012', name: 'general', type: TEXT },
  ],
  memberIds: ['800000000000000001', '800000000000000002'],
  config: {
    enabled: true,
    moderationChannel: '900000000000000011',
    serverName: 'Example Simple-Mode Server',
    inviteUrl: 'https://discord.gg/example-simple',
    allowUserChannelSelection: false,
  },
};

export const GUILD_ADVANCED = {
  id: '900000000000000002',
  name: 'Example Advanced-Mode Server',
  channels: [
    { id: '900000000000000021', name: 'mod-queue', type: TEXT },
    { id: '900000000000000022', name: 'movie-night', type: TEXT },
    { id: '900000000000000023', name: 'book-club', type: TEXT },
    { id: '900000000000000024', name: 'Watch Party VC', type: VOICE },
  ],
  memberIds: ['800000000000000001', '800000000000000002'],
  config: {
    enabled: true,
    moderationChannel: '900000000000000021',
    serverName: 'Example Advanced-Mode Server',
    inviteUrl: 'https://discord.gg/example-advanced',
    allowUserChannelSelection: true,
    // Explicit allow-lists so the moderation channel never leaks into the
    // user-facing channel picker (empty arrays would mean "all channels").
    allowedTextChannels: ['900000000000000022', '900000000000000023'],
    allowedVoiceChannels: ['900000000000000024'],
  },
};

// A guild the stub client knows about, but with no fixture config written for
// it — loadGuildConfig() falls back to its built-in default (eventRequests
// disabled), so the "disabled" scenario needs no config file at all.
export const GUILD_NO_CONFIG = {
  id: '900000000000000003',
  name: 'Example Server With Event Requests Off',
  channels: [{ id: '900000000000000031', name: 'general', type: TEXT }],
  memberIds: ['800000000000000001'],
  config: null,
};

// A server with its own form guidance (eventRequests.guidance), like
// Shudder's: its own text for some pieces, one hidden, one left to its
// default — and one that tries to inject markup, which must show as text.
export const GUILD_GUIDANCE = {
  id: '900000000000000004',
  name: 'Example Server With Guidance',
  channels: [{ id: '900000000000000041', name: 'mod-queue', type: TEXT }],
  memberIds: ['800000000000000001'],
  config: {
    enabled: true,
    moderationChannel: '900000000000000041',
    serverName: 'Example Server With Guidance',
    allowUserChannelSelection: false,
    guidance: {
      intro: 'Login is only used to check you\'re a member.\n\n**Before requesting:**\n• Check the Events tab first.\n• Approved events use **#cineplex**.',
      footer: '**Questions?** See https://example.com/faq.',
      fields: {
        title: 'Keep it horror. <img src=x onerror="window.__pwned=1">',
        when: 'Schedule within 2 weeks.',
        frequency: 'Ask a mod about recurring events.',
        image: false, // hidden; description is left to its default
      },
    },
  },
};

// A known-good "golden path" member present in every guild above.
export const MEMBER_ID = '800000000000000001';
export const MEMBER_USERNAME = 'e2e-test-user';

// A Discord user ID that is NOT in any guild's memberIds list, for the
// not-a-member scenario.
export const NON_MEMBER_ID = '800000000000009999';

export const ALL_GUILDS = [GUILD_SIMPLE, GUILD_ADVANCED, GUILD_NO_CONFIG, GUILD_GUIDANCE];

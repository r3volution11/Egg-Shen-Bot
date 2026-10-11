/**
 * Regression tests for two bugs in /image's message-based generation mode:
 *
 * 1. Combining `message` + `prompt` silently dropped `prompt` — generateFromMessage()
 *    never accepted or used it, so users had no way to add extra detail on top of a
 *    message-derived image (unlike the title1/title2 and matchup modes, which both
 *    honor a customPrompt via buildVersusPrompt's "Additional details:" suffix).
 * 2. A bad/nonexistent message ID let discord.js's raw fetch error (e.g.
 *    "Unknown Message") propagate up to the generic top-level catch, surfacing a
 *    cryptic `❌ Failed to generate AI image: Unknown Message` instead of a clear
 *    "could not find that message" reply.
 *
 * Also covers `user:` persona mode, which must build its image from profile
 * details as text and never touch the target's avatar.
 *
 * Run with: npx jest tests/image-command.test.js --verbose
 */

import { describe, test, expect, jest, beforeAll, beforeEach } from '@jest/globals';

jest.unstable_mockModule('../src/services/tmdbService.js', () => ({
  getPosterUrl: jest.fn(() => null),
  searchMovies: jest.fn().mockResolvedValue([]),
  searchTVShows: jest.fn().mockResolvedValue([]),
}));
jest.unstable_mockModule('../src/services/rawgService.js', () => ({
  searchGames: jest.fn().mockResolvedValue([]),
}));
jest.unstable_mockModule('../src/services/bggService.js', () => ({
  searchBoardGames: jest.fn().mockResolvedValue([]),
}));
jest.unstable_mockModule('../src/services/googleBooksService.js', () => ({
  searchBooks: jest.fn().mockResolvedValue([]),
}));
jest.unstable_mockModule('../src/utils/aiImageTracker.js', () => ({
  canGenerateImage: jest.fn().mockResolvedValue({ allowed: true }),
  recordImageGeneration: jest.fn().mockResolvedValue(undefined),
}));
jest.unstable_mockModule('../src/utils/guildConfig.js', () => ({
  getEpisodeBufferMinutes: jest.fn(() => 5),
  getAutoDetectMode: jest.fn().mockReturnValue('ask'),
  isTrueAdmin: jest.fn().mockResolvedValue(false),
  isModerator: jest.fn().mockResolvedValue(false),
}));
const mockLoadGuildStats = jest.fn().mockResolvedValue({ searches: [] });
jest.unstable_mockModule('../src/utils/statsTracker.js', () => ({
  loadGuildStats: mockLoadGuildStats,
}));
const mockGetWatchlist = jest.fn().mockResolvedValue([]);
jest.unstable_mockModule('../src/utils/watchlistManager.js', () => ({
  getWatchlist: mockGetWatchlist,
}));
jest.unstable_mockModule('../src/utils/bracketManager.js', () => ({
  loadTournament: jest.fn().mockReturnValue(null),
}));

const { config: realConfig } = await import('../src/config.js');
jest.unstable_mockModule('../src/config.js', () => ({
  config: {
    ...realConfig,
    apis: {
      ...realConfig.apis,
      openai: { apiKey: 'test-openai-key' },
    },
  },
}));

let execute;
let capturedGeneratedPrompt;
let fetchedUrls;

beforeAll(async () => {
  ({ execute } = await import('../src/commands/image.js'));

  // Intercept the OpenAI call so we can inspect the exact prompt string that
  // was built, without actually generating an image.
  global.fetch = jest.fn(async (url, opts) => {
    fetchedUrls.push(String(url));
    if (url === 'https://api.openai.com/v1/images/generations') {
      capturedGeneratedPrompt = JSON.parse(opts.body).prompt;
      return {
        ok: true,
        json: async () => ({ data: [{ b64_json: Buffer.from('fake-image').toString('base64') }] }),
      };
    }
    throw new Error(`Unexpected fetch to ${url}`);
  });
});

function makeInteraction({ prompt = null, message = null, user = null, member = null } = {}) {
  return {
    guildId: 'guild-1',
    user: { id: 'user-1', username: 'tester' },
    member: {},
    channel: {
      id: 'channel-1',
      messages: {
        fetch: jest.fn(),
      },
      send: jest.fn().mockResolvedValue(undefined),
    },
    options: {
      getString: (name) => {
        if (name === 'prompt') return prompt;
        if (name === 'message') return message;
        return null;
      },
      getBoolean: () => false,
      getUser: (name) => (name === 'user' ? user : null),
      getMember: (name) => (name === 'user' ? member : null),
    },
    deferred: false,
    replied: false,
    deferReply: jest.fn().mockImplementation(function () { this.deferred = true; return Promise.resolve(); }),
    editReply: jest.fn().mockResolvedValue(undefined),
    deleteReply: jest.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  capturedGeneratedPrompt = undefined;
  fetchedUrls = [];
  mockLoadGuildStats.mockResolvedValue({ searches: [] });
  mockGetWatchlist.mockResolvedValue([]);
});

describe('/image message + prompt combined', () => {
  test('includes both the message content and the extra prompt detail', async () => {
    const interaction = makeInteraction({ message: '123456789012345678', prompt: 'in the style of a watercolor painting' });
    interaction.channel.messages.fetch.mockResolvedValue({
      content: 'A haunted lighthouse at midnight',
      author: { username: 'someuser' },
    });

    await execute(interaction);

    expect(capturedGeneratedPrompt).toContain('A haunted lighthouse at midnight');
    expect(capturedGeneratedPrompt).toContain('Additional details: in the style of a watercolor painting');
  });

  test('uses just the message content when no extra prompt is given', async () => {
    const interaction = makeInteraction({ message: '123456789012345678' });
    interaction.channel.messages.fetch.mockResolvedValue({
      content: 'A haunted lighthouse at midnight',
      author: { username: 'someuser' },
    });

    await execute(interaction);

    expect(capturedGeneratedPrompt).toBe('A haunted lighthouse at midnight');
  });
});

describe('/image message with a bad message ID', () => {
  test('shows a clear "could not find" message instead of leaking the raw discord.js error', async () => {
    const interaction = makeInteraction({ message: '999999999999999999' });
    interaction.channel.messages.fetch.mockRejectedValue(new Error('Unknown Message'));

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining('Could not find a message with ID')
    );
    expect(interaction.editReply).not.toHaveBeenCalledWith(
      expect.stringContaining('Unknown Message')
    );
  });
});

describe('/image user: persona from profile details', () => {
  function makeTarget({ fetchRejects = false } = {}) {
    const avatarSpy = jest.fn(() => 'https://cdn.discordapp.com/avatars/target-1/abc.png');
    const user = {
      id: 'target-1',
      username: 'mothman',
      globalName: 'Mothman',
      displayAvatarURL: avatarSpy,
      avatarURL: avatarSpy,
      bannerURL: avatarSpy,
      fetch: fetchRejects
        ? jest.fn().mockRejectedValue(new Error('Unknown User'))
        : jest.fn().mockResolvedValue({ hexAccentColor: '#ff5500' }),
    };
    const roles = new Map([
      ['guild-1', { id: 'guild-1', name: '@everyone', position: 0, hexColor: '#000000' }],
      ['r1', { id: 'r1', name: 'Projectionist', position: 5, hexColor: '#00aaff' }],
      ['r2', { id: 'r2', name: 'Creature Feature Club', position: 3, hexColor: '#33cc33' }],
    ]);
    const member = { nickname: 'Moth', roles: { cache: roles }, displayAvatarURL: avatarSpy };
    return { user, member, avatarSpy };
  }

  test('builds the prompt from accent color, roles and their own interests — never the avatar', async () => {
    const { user, member, avatarSpy } = makeTarget();
    mockLoadGuildStats.mockResolvedValue({
      searches: [
        { userId: 'target-1', type: 'movie', title: 'The Mothman Prophecies' },
        { userId: 'someone-else', type: 'movie', title: 'Paddington 2' },
        { userId: 'target-1', type: 'random', title: 'Ignored Random Pick' },
        { userId: 'target-1', type: 'tv', title: 'The X-Files' },
      ],
    });
    mockGetWatchlist.mockResolvedValue([
      { title: 'Tremors', wantedBy: ['target-1'] },
      { title: 'Notting Hill', wantedBy: ['someone-else'] },
    ]);

    const interaction = makeInteraction({ user, member, prompt: 'a Lego minifig version of them' });
    await execute(interaction);

    expect(capturedGeneratedPrompt).toContain('"Moth"');
    expect(capturedGeneratedPrompt).toContain('Signature colors: #ff5500, #00aaff, #33cc33');
    expect(capturedGeneratedPrompt).toContain('Roles in the community: Projectionist, Creature Feature Club');
    expect(capturedGeneratedPrompt).not.toContain('@everyone');
    expect(capturedGeneratedPrompt).toContain('Favorite movies and shows: The X-Files, The Mothman Prophecies, Tremors');
    expect(capturedGeneratedPrompt).not.toContain('Paddington 2');
    expect(capturedGeneratedPrompt).not.toContain('Notting Hill');
    expect(capturedGeneratedPrompt).not.toContain('Ignored Random Pick');
    expect(capturedGeneratedPrompt).toMatch(/Request: a Lego minifig version of them$/);

    // The avatar is off-limits: never read, never fetched, never sent as an edit.
    expect(avatarSpy).not.toHaveBeenCalled();
    expect(fetchedUrls).toEqual(['https://api.openai.com/v1/images/generations']);
    expect(capturedGeneratedPrompt).not.toContain('cdn.discordapp.com');
  });

  test('still generates from the name when the profile fetch fails and nothing else is known', async () => {
    const { user } = makeTarget({ fetchRejects: true });
    const interaction = makeInteraction({ user, prompt: 'as a drive-in mascot' });
    interaction.guild = { members: { fetch: jest.fn().mockRejectedValue(new Error('Unknown Member')) } };

    await execute(interaction);

    expect(capturedGeneratedPrompt).toBe(
      'An original illustrated character representing a Discord community member called "Mothman". ' +
        'This is a visual persona, not a likeness of a real person. Build it from these details:\n' +
        'Request: as a drive-in mascot'
    );
  });

  test('requires a prompt and spends nothing without one', async () => {
    const { user, member } = makeTarget();
    const interaction = makeInteraction({ user, member });

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('prompt:make them a Lego minifig'));
    expect(fetchedUrls).toEqual([]);
  });

  test('cannot be combined with message', async () => {
    const { user, member } = makeTarget();
    const interaction = makeInteraction({ user, member, message: '123456789012345678', prompt: 'x' });

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('`message`, or `user`'));
    expect(fetchedUrls).toEqual([]);
  });
});

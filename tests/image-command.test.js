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
 * Run with: npx jest tests/image-command.test.js --verbose
 */

import { describe, test, expect, jest, beforeAll, beforeEach } from '@jest/globals';

jest.unstable_mockModule('../src/services/tmdbService.js', () => ({
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
  isTrueAdmin: jest.fn().mockResolvedValue(false),
  isModerator: jest.fn().mockResolvedValue(false),
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

beforeAll(async () => {
  ({ execute } = await import('../src/commands/image.js'));

  // Intercept the OpenAI call so we can inspect the exact prompt string that
  // was built, without actually generating an image.
  global.fetch = jest.fn(async (url, opts) => {
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

function makeInteraction({ prompt = null, message = null } = {}) {
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

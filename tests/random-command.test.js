/**
 * Regression test for /random game and /random boardgame when the discovery
 * service finds nothing matching the filters.
 *
 * discoverRandomGame() (rawgService) and getRandomBoardGame() (bggService)
 * both throw rather than return null on no results, but random.js's game/
 * boardgame branches had no try/catch around the call and no null-check on
 * the result (unlike /random book, which explicitly checks `if (!book)`).
 * A thrown error fell through to the generic catch-all "An error occurred"
 * message instead of the friendly "no results, try adjusting your filters"
 * message every other /random subcommand gives. Fixed by wrapping the calls
 * and matching book's UX.
 *
 * Run with: npx jest tests/random-command.test.js --verbose
 */

import { describe, test, expect, jest, beforeAll, beforeEach } from '@jest/globals';

const mockDiscoverRandomGame = jest.fn();
const mockGetRandomBoardGame = jest.fn();

jest.unstable_mockModule('../src/services/rawgService.js', () => ({
  discoverRandomGame: mockDiscoverRandomGame,
}));

jest.unstable_mockModule('../src/services/bggService.js', () => ({
  getRandomBoardGame: mockGetRandomBoardGame,
}));

jest.unstable_mockModule('../src/utils/embedBuilder.js', () => ({
  createDetailedEmbed: jest.fn(async () => ({ embeds: [] })),
  createGameDetailedEmbed: jest.fn(async (game) => ({ embeds: [{ title: game.name }] })),
  createBoardGameDetailedEmbed: jest.fn(async (game) => ({ embeds: [{ title: game.name }] })),
}));

jest.unstable_mockModule('../src/utils/statsTracker.js', () => ({
  trackSearch: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../src/utils/guildConfig.js', () => ({
  getEpisodeBufferMinutes: jest.fn(() => 5),
  getAutoDetectMode: jest.fn().mockReturnValue('ask'),
  getEnabledServices: jest.fn().mockResolvedValue({}),
  getEmojis: jest.fn().mockResolvedValue({}),
  loadGuildConfig: jest.fn().mockResolvedValue({ maxSearchResults: 20 }),
  canUseCommand: jest.fn().mockResolvedValue(true),
}));

const { config: realConfig } = await import('../src/config.js');

jest.unstable_mockModule('../src/config.js', () => ({
  config: {
    ...realConfig,
    apis: {
      ...realConfig.apis,
      rawg: { ...realConfig.apis.rawg, apiKey: 'test-rawg-key' },
      bgg: { ...realConfig.apis.bgg, clientId: 'test-bgg-client' },
    },
  },
}));

let execute;

beforeAll(async () => {
  ({ execute } = await import('../src/commands/random.js'));
});

function makeInteraction(subcommand, options = {}) {
  return {
    guildId: 'guild-1',
    user: { id: 'user-1', username: 'tester' },
    member: { permissions: { has: () => false } },
    options: {
      getSubcommand: () => subcommand,
      getString: (name) => options[name] ?? null,
    },
    deferReply: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  mockDiscoverRandomGame.mockReset();
  mockGetRandomBoardGame.mockReset();
});

describe('/random game', () => {
  test('shows a friendly message instead of a generic error when nothing matches', async () => {
    mockDiscoverRandomGame.mockRejectedValue(new Error('No games found matching the specified filters'));
    const interaction = makeInteraction('game');

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('No games found matching your filters') })
    );
  });

  test('reports an outage rather than blaming the filters when the API fails', async () => {
    // rawgService throws for BOTH no-results and a real failure (an expired
    // key, a 500, a timeout), and this branch swallowed the error either way.
    // "No games found matching your filters" sent people off adjusting filters
    // that were never the problem, with nothing in the logs to explain it.
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockDiscoverRandomGame.mockRejectedValue(new Error('Failed to discover random game'));
    const interaction = makeInteraction('game');

    await execute(interaction);

    const content = interaction.editReply.mock.calls.at(-1)[0].content;
    expect(content).not.toContain('matching your filters');
    expect(content).toContain('Couldn\'t reach');
    expect(errorSpy).toHaveBeenCalled(); // the operator can actually see it
    errorSpy.mockRestore();
  });

  test('logs the underlying error even on the no-results path', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockDiscoverRandomGame.mockRejectedValue(new Error('No games found matching the specified filters'));

    await execute(makeInteraction('game'));

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test('renders the embed when a game is found', async () => {
    mockDiscoverRandomGame.mockResolvedValue({ name: 'Portal 2', released: '2011-04-19' });
    const interaction = makeInteraction('game');

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: [{ title: 'Portal 2' }] })
    );
  });
});

describe('/random boardgame', () => {
  test('shows a friendly message instead of a generic error when the lookup fails', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetRandomBoardGame.mockRejectedValue(new Error('Failed to get random board game'));
    const interaction = makeInteraction('boardgame');

    await execute(interaction);

    // Not the catch-all "An error occurred", and it mentions both possible
    // causes because BGG's message cannot distinguish them (see below).
    const content = interaction.editReply.mock.calls.at(-1)[0].content;
    expect(content).toContain('BoardGameGeek');
    expect(content).toContain('filters');
    expect(content).not.toContain('An error occurred');
    errorSpy.mockRestore();
  });

  test('logs the real error, since BGG\'s message cannot be trusted', async () => {
    // bggService.js:218 replaces every message with "Failed to get random board
    // game" — including the genuine no-results case at :179. So this branch
    // cannot tell an empty result set from an outage, and swallowing the error
    // left no way to find out. The log is the only diagnostic there is.
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetRandomBoardGame.mockRejectedValue(new Error('Failed to get random board game'));

    await execute(makeInteraction('boardgame'));

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test('renders the embed when a board game is found', async () => {
    mockGetRandomBoardGame.mockResolvedValue({ name: 'Wingspan', yearPublished: 2019 });
    const interaction = makeInteraction('boardgame');

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: [{ title: 'Wingspan' }] })
    );
  });
});

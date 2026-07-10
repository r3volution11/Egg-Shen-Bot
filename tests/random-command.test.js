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
  test('shows a friendly message instead of a generic error when nothing matches', async () => {
    mockGetRandomBoardGame.mockRejectedValue(new Error('Failed to get random board game'));
    const interaction = makeInteraction('boardgame');

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('No board games found matching your filters') })
    );
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

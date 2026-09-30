/**
 * Length caps on free-text slash options, and the stored-value clamps that
 * back them up.
 *
 * An uncapped option is a latent embed-build failure: Discord caps an embed
 * title at 256 and a description at 4096, and discord.js throws when you
 * exceed one. Where that build happens inside a background scheduler, the
 * throw is swallowed by an outer try/catch and the feature silently stops —
 * `/bracket create` with a long name made group voting never auto-close, with
 * only a console.error to show for it.
 *
 * An option cap alone isn't enough, because it only governs NEW input. Values
 * stored before the cap existed (or restored from an export) still render, so
 * the durable guards are tested here too.
 *
 * Run with: npm test -- tests/option-length-caps.test.js
 */

import { describe, test, expect, jest, beforeAll, beforeEach } from '@jest/globals';

jest.unstable_mockModule('../src/utils/guildConfig.js', () => ({
  getPublicBotUrl: (c) => (c?.website?.botUrl || process.env.PUBLIC_BOT_URL || '').replace(/\/+$/, '') || null,
  loadGuildConfig: jest.fn().mockResolvedValue({}),
  isAdmin: jest.fn().mockReturnValue(false),
  isModerator: jest.fn().mockReturnValue(false),
  canUseCommand: jest.fn().mockReturnValue(true),
}));

jest.unstable_mockModule('../src/services/tmdbService.js', () => ({
  getPosterUrl: jest.fn(() => null),
  searchMovies: jest.fn().mockResolvedValue([]),
  searchTVShows: jest.fn().mockResolvedValue([]),
  getMovieDetails: jest.fn().mockResolvedValue(null),
  getTVShowDetails: jest.fn().mockResolvedValue(null),
  getMovieAlternativeTitles: jest.fn().mockResolvedValue([]),
  getTVAlternativeTitles: jest.fn().mockResolvedValue([]),
  getSeasonDetails: jest.fn().mockResolvedValue(null),
  sumEpisodeRuntimes: jest.fn(),
  getUnifiedMovieWatchProviders: jest.fn().mockResolvedValue(null),
  getUnifiedTVWatchProviders: jest.fn().mockResolvedValue(null),
  getGenres: jest.fn().mockResolvedValue([]),
  searchPeople: jest.fn().mockResolvedValue([]),
  getPersonById: jest.fn().mockResolvedValue(null),
  discoverTitles: jest.fn().mockResolvedValue([]),
  getSimilarMovies: jest.fn().mockResolvedValue([]),
  getSimilarTV: jest.fn().mockResolvedValue([]),
  getBackdropUrl: jest.fn(() => null),
}));

let bracketData, watchlistData, noteForDisplay;
let saveTournament, loadTournament, MAX_TOURNAMENT_NAME_LENGTH;

beforeAll(async () => {
  ({ data: bracketData } = await import('../src/commands/bracket.js'));
  ({ data: watchlistData, noteForDisplay } = await import('../src/commands/watchlist.js'));
  ({ saveTournament, loadTournament, MAX_TOURNAMENT_NAME_LENGTH } =
    await import('../src/utils/bracketManager.js'));
});

/** The JSON definition of one option on one subcommand. */
function option(commandData, subcommandName, optionName) {
  const sub = commandData.toJSON().options.find(o => o.name === subcommandName);
  expect(sub).toBeDefined();
  const opt = sub.options?.find(o => o.name === optionName);
  expect(opt).toBeDefined();
  return opt;
}

describe('free-text options that land in an embed are capped', () => {
  // Each of these is interpolated into an embed title or description. Without
  // a cap, a long enough value makes the embed fail to build.
  test.each([
    ['bracket', 'create', 'name', 100],
    ['bracket', 'edit-name', 'name', 100],
    ['bracket', 'announce', 'message', 1000],
    ['watchlist', 'add', 'note', 200],
  ])('/%s %s %s is capped at %i', (command, sub, opt, expected) => {
    const data = command === 'bracket' ? bracketData : watchlistData;

    expect(option(data, sub, opt).max_length).toBe(expected);
  });

  test('a capped tournament name still fits an embed title with its prefix', () => {
    // The longest prefix is tournamentScheduler's "📊 Group A Results - ".
    const cap = option(bracketData, 'create', 'name').max_length;
    const longestPrefix = '📊 Group A Results - ';

    expect(longestPrefix.length + cap).toBeLessThanOrEqual(256);
  });

  test('a capped note fits an embed field on its own', () => {
    // 25 notes at this cap do NOT fit one description (25 × 200 alone exceeds
    // 4096), which is why /watchlist show bounds the description itself rather
    // than relying on the per-note cap. See the handleList tests below.
    expect(option(watchlistData, 'add', 'note').max_length).toBeLessThanOrEqual(1024);
  });
});

describe('stored tournament names are clamped, not just new input', () => {
  const GUILD_ID = 'option-caps-guild';

  test('saveTournament truncates a name that is over the limit', () => {
    // How a long name gets in despite the option cap: a tournament created
    // before the cap existed, or one restored from /bracket export.
    saveTournament(GUILD_ID, { id: 'x', name: 'Z'.repeat(400) });

    expect(loadTournament(GUILD_ID).name).toHaveLength(MAX_TOURNAMENT_NAME_LENGTH);
  });

  test('a name within the limit is stored untouched', () => {
    saveTournament(GUILD_ID, { id: 'x', name: 'The Ultimate Horror Cup' });

    expect(loadTournament(GUILD_ID).name).toBe('The Ultimate Horror Cup');
  });

  test('a clamped name builds an embed title that Discord accepts', async () => {
    const { EmbedBuilder } = await import('discord.js');
    saveTournament(GUILD_ID, { id: 'x', name: 'Z'.repeat(400) });
    const tournament = loadTournament(GUILD_ID);

    // The exact call that throws in tournamentScheduler's auto-close path.
    expect(() =>
      new EmbedBuilder().setTitle(`📊 Group A Results - ${tournament.name}`)
    ).not.toThrow();
  });

  test('a tournament with no name at all is still saved', () => {
    expect(saveTournament(GUILD_ID, { id: 'x' })).toBe(true);
    expect(saveTournament(GUILD_ID, { id: 'x', name: null })).toBe(true);
  });
});

describe('noteForDisplay guards notes stored before the cap', () => {
  test('truncates an over-long note and marks it as cut', () => {
    const result = noteForDisplay('n'.repeat(500));

    expect(result).toHaveLength(200);
    expect(result.endsWith('…')).toBe(true);
  });

  test('leaves a normal note exactly as written', () => {
    expect(noteForDisplay('Recommended by three people in chat')).toBe(
      'Recommended by three people in chat'
    );
  });

  test('passes through a missing note rather than inventing one', () => {
    expect(noteForDisplay(undefined)).toBeUndefined();
    expect(noteForDisplay(null)).toBeNull();
    expect(noteForDisplay('')).toBe('');
  });

});

describe('/watchlist list survives entries long enough to overflow a description', () => {
  // The per-note cap is NOT sufficient on its own: 25 notes at 200 characters
  // is 5000 before any title lines. handleList has to bound the description
  // itself, or discord.js throws and the user gets no listing at all.
  const GUILD_ID = 'watchlist-overflow-guild';

  beforeEach(async () => {
    const { clearWatchlist } = await import('../src/utils/watchlistManager.js');
    await clearWatchlist(GUILD_ID).catch(() => {});
  });

  /** 25 entries whose notes predate the cap, as stored data can. */
  async function seedOverflowingWatchlist() {
    const { addToWatchlist, getWatchlist } = await import('../src/utils/watchlistManager.js');

    for (let i = 0; i < 25; i++) {
      await addToWatchlist(GUILD_ID, {
        tmdbId: 1000 + i,
        type: 'movie',
        title: `A Fairly Long Motion Picture Title Number ${i}`,
        year: '1999',
        addedBy: 'someuserwithalongname',
        addedById: 'user-1',
        note: 'n'.repeat(500), // stored before the option cap existed
      });
    }

    return getWatchlist(GUILD_ID);
  }

  function makeListInteraction() {
    return {
      guildId: GUILD_ID,
      channelId: 'channel-1',
      guild: { id: GUILD_ID, name: 'Shudder Drive-In' },
      user: { id: 'user-1', username: 'tester' },
      member: { permissions: { has: () => false } },
      options: {
        getSubcommand: () => 'list',
        getString: () => null,
        getBoolean: () => null,
        getInteger: () => null,
      },
      reply: jest.fn().mockResolvedValue(undefined),
      deferReply: jest.fn().mockResolvedValue(undefined),
      editReply: jest.fn().mockResolvedValue(undefined),
      followUp: jest.fn().mockResolvedValue(undefined),
    };
  }

  test('renders a listing instead of throwing', async () => {
    const { execute } = await import('../src/commands/watchlist.js');
    const seeded = await seedOverflowingWatchlist();
    expect(seeded).toHaveLength(25); // the fixture is actually in place

    const interaction = makeListInteraction();
    await execute(interaction);

    const call = interaction.editReply.mock.calls.find(c => c[0]?.embeds?.length);
    expect(call).toBeDefined();

    const description = call[0].embeds[0].data.description;
    expect(description.length).toBeLessThanOrEqual(4096);
    // Default sort is newest-first, so the last-added entry leads the list.
    expect(description).toContain('A Fairly Long Motion Picture Title Number 24');
    // Whole lines only — a truncated note ends with the ellipsis, never mid-run.
    expect(description.endsWith('n')).toBe(false);
  });

  test('says how many of the total it managed to show', async () => {
    const { execute } = await import('../src/commands/watchlist.js');
    await seedOverflowingWatchlist();

    const interaction = makeListInteraction();
    await execute(interaction);

    const call = interaction.editReply.mock.calls.find(c => c[0]?.embeds?.length);
    const embed = call[0].embeds[0].data;

    // Fewer than 25 fit, so the footer must not claim otherwise.
    expect(embed.footer.text).toMatch(/Showing \d+ of 25/);
    const shown = Number(embed.footer.text.match(/Showing (\d+) of/)[1]);
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(25);
  });
});

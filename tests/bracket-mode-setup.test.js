/**
 * Setup-phase coverage for bracket mode (2-32 titles, no groups), plus the
 * groups-mode paths that share the same code.
 *
 * Bracket mode was nearly unusable to set up, and nothing here was tested:
 *   - picking from the multi-result menu always failed with "Invalid group"
 *     (the picker called the groups-only addGroupTitle);
 *   - titles could not be removed (removal read only `groups`);
 *   - `/bracket open` rejected the setup status, although every add-title
 *     reply said to run it;
 *   - the tournament's type was never saved, so movies and games could mix.
 *
 * The picker test drives the real command to build the menu, then feeds that
 * menu's own customId and option value into the real select handler. Only the
 * external search/details APIs are mocked.
 *
 * Run with: npx jest tests/bracket-mode-setup.test.js --verbose
 */

import { describe, test, expect, jest, beforeAll, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const mockHybridSearch = jest.fn();
const mockGetMovieDetails = jest.fn();
const mockSearchGames = jest.fn();

jest.unstable_mockModule('../src/services/tmdbService.js', () => ({
  searchMovies: jest.fn(),
  searchTVShows: jest.fn(),
  getMovieAlternativeTitles: jest.fn().mockResolvedValue([]),
  getTVAlternativeTitles: jest.fn().mockResolvedValue([]),
  getMovieDetails: mockGetMovieDetails,
  getTVShowDetails: jest.fn(),
  getUnifiedMovieWatchProviders: jest.fn().mockResolvedValue(null),
  getUnifiedTVWatchProviders: jest.fn().mockResolvedValue(null),
  getPosterUrl: jest.fn(() => null),
}));

jest.unstable_mockModule('../src/services/aiService.js', () => ({
  hybridSearch: mockHybridSearch,
}));

jest.unstable_mockModule('../src/services/rawgService.js', () => ({
  searchGames: mockSearchGames,
  getGameDetails: jest.fn(),
}));

jest.unstable_mockModule('../src/services/bggService.js', () => ({
  searchBoardGames: jest.fn(),
  getBoardGameDetails: jest.fn(),
}));

jest.unstable_mockModule('../src/services/googleBooksService.js', () => ({
  searchBooks: jest.fn(),
  getBookDetails: jest.fn(),
}));

jest.unstable_mockModule('../src/services/omdbService.js', () => ({ getOMDBData: jest.fn() }));
jest.unstable_mockModule('../src/services/traktService.js', () => ({ getMovieRating: jest.fn(), getShowRating: jest.fn() }));
jest.unstable_mockModule('../src/services/letterboxdService.js', () => ({ getLetterboxdRating: jest.fn() }));
jest.unstable_mockModule('../src/services/urlService.js', () => ({
  getIMDbUrl: () => null,
  getLetterboxdUrl: () => null,
  getTraktMovieUrl: () => null,
  getTraktShowUrl: () => null,
  getRottenTomatoesUrl: () => null,
  getJustWatchUrl: () => null,
}));
jest.unstable_mockModule('../src/utils/embedBuilder.js', () => ({ createDetailedEmbed: jest.fn() }));
jest.unstable_mockModule('../src/utils/statsTracker.js', () => ({ trackSearch: jest.fn() }));
jest.unstable_mockModule('../src/api/server.js', () => ({ saveEventChannelSelections: jest.fn() }));
jest.unstable_mockModule('../src/utils/guildConfig.js', () => ({
  canUseCommand: jest.fn().mockResolvedValue(true),
  isAdmin: jest.fn().mockReturnValue(true),
  loadGuildConfig: jest.fn().mockResolvedValue({ maxSearchResults: 20 }),
  getEnabledServices: jest.fn().mockResolvedValue({}),
  getEmojis: jest.fn().mockResolvedValue({}),
  getStatsConfig: jest.fn().mockResolvedValue({ enabled: false }),
}));

const { PermissionFlagsBits } = await import('discord.js');

let bracketManager;
let execute;
let handleSelectInteraction;

const GUILD_ID = 'bracket-mode-setup-guild';
const USER_ID = 'admin-1';

beforeAll(async () => {
  bracketManager = await import('../src/utils/bracketManager.js');
  ({ execute } = await import('../src/commands/bracket.js'));
  ({ handleSelectInteraction } = await import('../src/handlers/selectHandler.js'));
});

function tournamentFile() {
  const dir = process.env.GUILD_TOURNAMENTS_DIR || path.join(process.cwd(), 'guild_tournaments');
  return path.join(dir, `${GUILD_ID}.json`);
}

function cleanup() {
  if (fs.existsSync(tournamentFile())) fs.unlinkSync(tournamentFile());
}

beforeEach(() => {
  cleanup();
  mockHybridSearch.mockReset();
  mockGetMovieDetails.mockReset();
  mockSearchGames.mockReset();
});
afterEach(cleanup);

function movie(id, title, year) {
  return { id, title, year: String(year), type: 'movie', posterUrl: null };
}

function commandInteraction({ subcommand, strings = {}, integers = {} }) {
  return {
    guildId: GUILD_ID,
    channelId: 'channel-1',
    user: { id: USER_ID, username: 'admin' },
    member: { permissions: { has: (flag) => flag === PermissionFlagsBits.Administrator } },
    deferred: false,
    replied: false,
    options: {
      getSubcommand: () => subcommand,
      getString: (name) => (name in strings ? strings[name] : null),
      getInteger: (name) => (name in integers ? integers[name] : null),
      getAttachment: () => null,
      getBoolean: () => null,
    },
    deferReply: jest.fn().mockImplementation(function () { this.deferred = true; return Promise.resolve(); }),
    editReply: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn().mockResolvedValue(undefined),
    followUp: jest.fn().mockResolvedValue(undefined),
  };
}

/** Everything the bot sent, as plain JSON: content plus embed titles/descriptions/footers. */
function sentText(interaction) {
  return [...interaction.reply.mock.calls, ...interaction.editReply.mock.calls]
    .map(([payload]) => {
      if (typeof payload === 'string') return payload;
      const embeds = (payload.embeds || []).map(e => JSON.stringify(e.toJSON ? e.toJSON() : e));
      return [payload.content || '', ...embeds].join(' ');
    })
    .join('\n');
}

describe('multi-result picker, driven end to end', () => {
  const searchResults = [
    { id: 1091, title: 'The Thing', release_date: '1982-06-25', poster_path: '/thing82.jpg' },
    { id: 60935, title: 'The Thing', release_date: '2011-10-14', poster_path: '/thing11.jpg' },
  ];

  async function pickSecondResult() {
    mockHybridSearch.mockResolvedValue(searchResults);
    mockGetMovieDetails.mockResolvedValue({
      id: 60935, title: 'The Thing', release_date: '2011-10-14', poster_path: '/thing11.jpg',
    });

    const add = commandInteraction({
      subcommand: 'manage-titles',
      strings: { action: 'add', type: 'movie', title: 'The Thing', group: 'B' },
    });
    await execute(add);

    // The real command built this menu; use its own customId and option value
    const [payload] = add.editReply.mock.calls.at(-1);
    const menu = payload.components[0].toJSON().components[0];
    expect(menu.options).toHaveLength(2);

    const pick = {
      customId: menu.custom_id,
      values: [menu.options[1].value],
      guildId: GUILD_ID,
      user: { id: USER_ID },
      replied: false,
      deferred: false,
      deferUpdate: jest.fn().mockImplementation(function () { this.deferred = true; return Promise.resolve(); }),
      editReply: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
    };
    await handleSelectInteraction(pick);
    return pick;
  }

  test('bracket mode: the picked title is stored in the tournament', async () => {
    bracketManager.createTournament(GUILD_ID, 'Remake Cup', USER_ID, 8);

    const pick = await pickSecondResult();

    const saved = bracketManager.loadTournament(GUILD_ID);
    expect(saved.titles).toHaveLength(1);
    expect(saved.titles[0]).toMatchObject({ id: 60935, title: 'The Thing', year: '2011' });
    expect(sentText(pick)).toContain('Added to Tournament');
    expect(sentText(pick)).not.toContain('Invalid group');
    expect(sentText(pick)).toContain('1/8 titles');
  });

  test('groups mode: the picked title still lands in the chosen group', async () => {
    bracketManager.createTournament(GUILD_ID, 'Group Cup', USER_ID, 36);

    const pick = await pickSecondResult();

    const saved = bracketManager.loadTournament(GUILD_ID);
    expect(saved.groups.B.movies).toHaveLength(1);
    expect(saved.groups.B.movies[0]).toMatchObject({ id: 60935, year: '2011' });
    expect(sentText(pick)).toContain('Added to Group B');
  });
});

describe('removing titles', () => {
  test('bracket mode removes the numbered title and renumbers the rest', async () => {
    bracketManager.createTournament(GUILD_ID, 'Remove Cup', USER_ID, 8);
    bracketManager.addTitle(GUILD_ID, 'A', 'movie', movie(1, 'Alien', 1979));
    bracketManager.addTitle(GUILD_ID, 'A', 'movie', movie(2, 'Aliens', 1986));
    bracketManager.addTitle(GUILD_ID, 'A', 'movie', movie(3, 'Alien 3', 1992));

    const remove = commandInteraction({ subcommand: 'manage-titles', strings: { action: 'remove' }, integers: { position: 2 } });
    await execute(remove);

    const saved = bracketManager.loadTournament(GUILD_ID);
    expect(saved.titles.map(t => t.title)).toEqual(['Alien', 'Alien 3']);
    expect(saved.titles.map(t => t.index)).toEqual([0, 1]);
    expect(sentText(remove)).toContain('Aliens');
    expect(sentText(remove)).toContain('2/8 titles');
  });

  test('bracket mode rejects a number past the end without changing anything', async () => {
    bracketManager.createTournament(GUILD_ID, 'Remove Cup', USER_ID, 8);
    bracketManager.addTitle(GUILD_ID, 'A', 'movie', movie(1, 'Alien', 1979));

    const remove = commandInteraction({ subcommand: 'manage-titles', strings: { action: 'remove' }, integers: { position: 5 } });
    await execute(remove);

    expect(bracketManager.loadTournament(GUILD_ID).titles).toHaveLength(1);
    expect(sentText(remove)).toContain('Invalid title number');
  });

  test('groups mode still removes from the named group', async () => {
    bracketManager.createTournament(GUILD_ID, 'Group Cup', USER_ID, 36);
    bracketManager.addTitle(GUILD_ID, 'C', 'movie', movie(1, 'Alien', 1979));
    bracketManager.addTitle(GUILD_ID, 'C', 'movie', movie(2, 'Aliens', 1986));

    const remove = commandInteraction({ subcommand: 'manage-titles', strings: { action: 'remove', group: 'C' }, integers: { position: 1 } });
    await execute(remove);

    expect(bracketManager.loadTournament(GUILD_ID).groups.C.movies.map(m => m.title)).toEqual(['Aliens']);
  });
});

describe('/bracket open from setup', () => {
  test('bracket mode generates the bracket and opens round one', async () => {
    bracketManager.createTournament(GUILD_ID, 'Open Cup', USER_ID, 4);
    ['Alien', 'Aliens', 'Alien 3', 'Prometheus'].forEach((t, i) =>
      bracketManager.addTitle(GUILD_ID, 'A', 'movie', movie(i + 1, t, 1979 + i)));

    const open = commandInteraction({ subcommand: 'open', strings: { duration: '1h' } });
    await execute(open);

    const saved = bracketManager.loadTournament(GUILD_ID);
    expect(saved.status).toBe('knockout');
    const roundOne = saved.knockoutBracket.filter(m => m.round === saved.phase);
    expect(roundOne).toHaveLength(2);
    expect(roundOne.every(m => m.status === 'voting')).toBe(true);
    expect(sentText(open)).toContain('Voting Opened');
  });

  test('bracket mode with one title refuses and stays in setup', async () => {
    bracketManager.createTournament(GUILD_ID, 'Open Cup', USER_ID, 4);
    bracketManager.addTitle(GUILD_ID, 'A', 'movie', movie(1, 'Alien', 1979));

    const open = commandInteraction({ subcommand: 'open' });
    await execute(open);

    expect(bracketManager.loadTournament(GUILD_ID).status).toBe('setup');
    expect(sentText(open)).toContain('at least 2 titles');
  });

  test('groups mode refuses while a group is short, and names it', async () => {
    bracketManager.createTournament(GUILD_ID, 'Group Cup', USER_ID, 36);
    bracketManager.resizeTournament(GUILD_ID, 4);
    for (const g of 'ABC') {
      for (let i = 0; i < 4; i++) bracketManager.addTitle(GUILD_ID, g, 'movie', movie(`${g}${i}`, `${g}${i}`, 2000));
    }
    bracketManager.addTitle(GUILD_ID, 'D', 'movie', movie('D0', 'D0', 2000));

    const open = commandInteraction({ subcommand: 'open' });
    await execute(open);

    expect(bracketManager.loadTournament(GUILD_ID).status).toBe('setup');
    expect(sentText(open)).toContain('D (1/4)');
  });

  test('groups mode opens every group once all are full', async () => {
    bracketManager.createTournament(GUILD_ID, 'Group Cup', USER_ID, 36);
    bracketManager.resizeTournament(GUILD_ID, 4);
    for (const g of 'ABCD') {
      for (let i = 0; i < 4; i++) bracketManager.addTitle(GUILD_ID, g, 'movie', movie(`${g}${i}`, `${g}${i}`, 2000));
    }

    const open = commandInteraction({ subcommand: 'open' });
    await execute(open);

    const saved = bracketManager.loadTournament(GUILD_ID);
    expect(saved.status).toBe('group_stage');
    expect(Object.values(saved.groups).every(g => g.votingOpen)).toBe(true);
  });
});

describe('tournament type in bracket mode', () => {
  test('the first title sets the type, and a different type is then rejected', async () => {
    bracketManager.createTournament(GUILD_ID, 'Type Cup', USER_ID, 8);
    expect(bracketManager.addTitle(GUILD_ID, 'A', 'movie', movie(1, 'Alien', 1979)).success).toBe(true);

    const mixed = bracketManager.addTitle(GUILD_ID, 'A', 'game', { id: 9, title: 'Alien: Isolation', year: '2014', type: 'game' });

    expect(mixed.success).toBe(false);
    expect(mixed.error).toContain('type mismatch');
    const saved = bracketManager.loadTournament(GUILD_ID);
    expect(saved.type).toBe('movie');
    expect(saved.titles).toHaveLength(1);
  });
});

describe('/bracket list-groups in bracket mode', () => {
  test('shows the numbered list that removal uses', async () => {
    bracketManager.createTournament(GUILD_ID, 'List Cup', USER_ID, 8);
    bracketManager.addTitle(GUILD_ID, 'A', 'movie', movie(1, 'Alien', 1979));
    bracketManager.addTitle(GUILD_ID, 'A', 'movie', movie(2, 'Aliens', 1986));

    const list = commandInteraction({ subcommand: 'list-groups' });
    await execute(list);

    const text = sentText(list);
    expect(text).toContain('1. Alien (1979)');
    expect(text).toContain('2. Aliens (1986)');
    expect(text).toContain('2/8 titles');
  });
});

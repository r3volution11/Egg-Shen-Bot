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
  getPublicBotUrl: (c) => (c?.website?.botUrl || process.env.PUBLIC_BOT_URL || '').replace(/\/+$/, '') || null,
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

describe('/bracket open during the group stage opens the next round', () => {
  // It used to open every group not currently voting, which included groups
  // already closed with results. So once the group stage was over, "open the
  // next round" reopened finished groups instead of starting the knockout.
  function fullGroupStage() {
    bracketManager.createTournament(GUILD_ID, 'Group Cup', USER_ID, 36);
    bracketManager.resizeTournament(GUILD_ID, 4);
    for (const g of 'ABCD') {
      for (let i = 0; i < 4; i++) bracketManager.addTitle(GUILD_ID, g, 'movie', movie(`${g}${i}`, `${g}${i}`, 2000));
    }
  }

  function voteNoTies(groupIds) {
    for (const g of groupIds) {
      bracketManager.voteGroupStage(GUILD_ID, 'v1', g, [0, 1]);
      bracketManager.voteGroupStage(GUILD_ID, 'v2', g, [0, 1]);
      bracketManager.voteGroupStage(GUILD_ID, 'v3', g, [0, 2]);
    }
  }

  test('opens only groups that have not voted yet, never a closed one', async () => {
    fullGroupStage();
    bracketManager.openGroupVoting(GUILD_ID, ['A', 'B']);
    voteNoTies(['A', 'B']);
    bracketManager.closeGroupVoting(GUILD_ID, ['A', 'B']);

    const open = commandInteraction({ subcommand: 'open' });
    await execute(open);

    const saved = bracketManager.loadTournament(GUILD_ID);
    expect(saved.groups.A.status).toBe('closed');
    expect(saved.groups.B.status).toBe('closed');
    expect(saved.groups.C.votingOpen).toBe(true);
    expect(saved.groups.D.votingOpen).toBe(true);
    expect(sentText(open)).toContain('C, D');
  });

  test('once every group is closed, it starts the knockout', async () => {
    fullGroupStage();
    bracketManager.openGroupVoting(GUILD_ID, ['A', 'B', 'C', 'D']);
    voteNoTies(['A', 'B', 'C', 'D']);
    bracketManager.closeGroupVoting(GUILD_ID, ['A', 'B', 'C', 'D']);

    const open = commandInteraction({ subcommand: 'open', strings: { duration: '1h' } });
    await execute(open);

    const saved = bracketManager.loadTournament(GUILD_ID);
    expect(saved.status).toBe('knockout');
    expect(Object.values(saved.groups).every(g => g.status === 'closed')).toBe(true);
    const roundOne = saved.knockoutBracket.filter(m => m.round === saved.phase && m.movie1 && m.movie2);
    expect(roundOne.length).toBeGreaterThan(0);
    expect(roundOne.every(m => m.status === 'voting')).toBe(true);
  });

  test('while groups are still voting, it says so and changes nothing', async () => {
    fullGroupStage();
    bracketManager.openGroupVoting(GUILD_ID, ['A', 'B', 'C', 'D']);

    const open = commandInteraction({ subcommand: 'open' });
    await execute(open);

    const saved = bracketManager.loadTournament(GUILD_ID);
    expect(saved.status).toBe('group_stage');
    expect(sentText(open)).toContain('/bracket close');
  });
});

describe('adding without the optional `type`', () => {
  // Production logged this crashing three times: no type meant no search,
  // then building the "not found" message threw, so the user got no reply.
  test('before any title: asks for a type instead of crashing', async () => {
    bracketManager.createTournament(GUILD_ID, 'Type Cup', USER_ID, 8);

    const add = commandInteraction({ subcommand: 'manage-titles', strings: { action: 'add', title: 'Alien' } });
    await execute(add);

    expect(sentText(add)).toContain('Choose a `type`');
    expect(mockHybridSearch).not.toHaveBeenCalled();
    expect(bracketManager.loadTournament(GUILD_ID).titles).toHaveLength(0);
  });

  test("after the first title: uses the tournament's type", async () => {
    bracketManager.createTournament(GUILD_ID, 'Type Cup', USER_ID, 8);
    bracketManager.addTitle(GUILD_ID, 'A', 'movie', movie(1, 'Alien', 1979));
    mockHybridSearch.mockResolvedValue([{ id: 679, title: 'Aliens', release_date: '1986-07-18' }]);

    const add = commandInteraction({ subcommand: 'manage-titles', strings: { action: 'add', title: 'Aliens' } });
    await execute(add);

    expect(mockHybridSearch).toHaveBeenCalledWith('Aliens', expect.any(Function), 'movie', expect.any(Function));
    const saved = bracketManager.loadTournament(GUILD_ID);
    expect(saved.titles.map(t => t.title)).toEqual(['Alien', 'Aliens']);
  });
});

describe('settings saved by the setup form', () => {
  // The form stores these on the tournament; the commands must actually use
  // them when their own option is left out, and a typed option must still win.
  test('/bracket open uses the tournament\'s voting time when duration is left out', async () => {
    bracketManager.createTournament(GUILD_ID, 'Timed Cup', USER_ID, 4);
    ['Alien', 'Aliens'].forEach((t, i) => bracketManager.addTitle(GUILD_ID, 'A', 'movie', movie(i + 1, t, 1979 + i)));
    const t = bracketManager.loadTournament(GUILD_ID);
    t.votingDuration = '3d';
    bracketManager.saveTournament(GUILD_ID, t);

    const before = Date.now();
    await execute(commandInteraction({ subcommand: 'open' }));

    const deadline = bracketManager.loadTournament(GUILD_ID).knockoutBracket.find(m => m.status === 'voting').votingDeadline;
    const threeDays = 3 * 24 * 60 * 60 * 1000;
    expect(deadline - before).toBeGreaterThanOrEqual(threeDays - 1000);
    expect(deadline - before).toBeLessThan(threeDays + 60 * 1000);
  });

  test('a typed duration still wins over the saved one', async () => {
    bracketManager.createTournament(GUILD_ID, 'Timed Cup', USER_ID, 4);
    ['Alien', 'Aliens'].forEach((t, i) => bracketManager.addTitle(GUILD_ID, 'A', 'movie', movie(i + 1, t, 1979 + i)));
    const t = bracketManager.loadTournament(GUILD_ID);
    t.votingDuration = '3d';
    bracketManager.saveTournament(GUILD_ID, t);

    const before = Date.now();
    await execute(commandInteraction({ subcommand: 'open', strings: { duration: '1h' } }));

    const deadline = bracketManager.loadTournament(GUILD_ID).knockoutBracket.find(m => m.status === 'voting').votingDeadline;
    expect(deadline - before).toBeLessThan(2 * 60 * 60 * 1000);
  });

  test('/bracket announce posts the saved message and banner, and counts a straight bracket\'s titles', async () => {
    bracketManager.createTournament(GUILD_ID, 'Announce Cup', USER_ID, 8);
    ['Alien', 'Aliens', 'Alien 3'].forEach((t, i) => bracketManager.addTitle(GUILD_ID, 'A', 'movie', movie(i + 1, t, 1979 + i)));
    const t = bracketManager.loadTournament(GUILD_ID);
    t.announcement = { message: 'In space, no one can hear you vote.', imageUrl: 'https://img.example/banner.png' };
    bracketManager.saveTournament(GUILD_ID, t);

    const announce = commandInteraction({ subcommand: 'announce' });
    await execute(announce);

    const embed = announce.reply.mock.calls[0][0].embeds[0].toJSON();
    expect(embed.description).toBe('In space, no one can hear you vote.');
    expect(embed.image.url).toBe('https://img.example/banner.png');
    const fields = Object.fromEntries(embed.fields.map(f => [f.name, f.value]));
    expect(fields['Total Entries']).toBe('3 titles');
    expect(fields.Format).toBe('Straight bracket');
    expect(JSON.stringify(embed)).not.toContain('null');
  });
});

describe('/bracket setup-link and export', () => {
  const ORIGINAL_URL = process.env.PUBLIC_BOT_URL;
  afterEach(() => {
    if (ORIGINAL_URL === undefined) delete process.env.PUBLIC_BOT_URL;
    else process.env.PUBLIC_BOT_URL = ORIGINAL_URL;
  });

  test('setup-link replies privately with a link whose token names this server and user', async () => {
    process.env.PUBLIC_BOT_URL = 'https://bot.example';
    const { verifySetupToken } = await import('../src/utils/tournamentSetupLinkToken.js');

    const link = commandInteraction({ subcommand: 'setup-link' });
    await execute(link);

    const payload = link.reply.mock.calls[0][0];
    expect(payload.ephemeral).toBe(true);
    const url = new URL(payload.components[0].toJSON().components[0].url);
    expect(url.origin + url.pathname).toBe('https://bot.example/tournament-setup');
    expect(verifySetupToken(url.searchParams.get('token'))).toMatchObject({ valid: true, guildId: GUILD_ID, userId: USER_ID });
  });

  test('setup-link uses this server\'s own bot URL when it has one', async () => {
    process.env.PUBLIC_BOT_URL = 'https://live.example';
    const { loadGuildConfig } = await import('../src/utils/guildConfig.js');
    loadGuildConfig.mockResolvedValueOnce({ website: { botUrl: 'https://dev.example/' } });

    const link = commandInteraction({ subcommand: 'setup-link' });
    await execute(link);

    const url = new URL(link.reply.mock.calls[0][0].components[0].toJSON().components[0].url);
    expect(url.origin).toBe('https://dev.example');
  });

  test('setup-link without PUBLIC_BOT_URL explains what to set instead of posting a broken link', async () => {
    delete process.env.PUBLIC_BOT_URL;
    const link = commandInteraction({ subcommand: 'setup-link' });
    await execute(link);
    expect(sentText(link)).toContain('PUBLIC_BOT_URL');
    expect(link.reply.mock.calls[0][0].components).toBeUndefined();
  });

  test('export format:json is the import format, without voter ids', async () => {
    bracketManager.createTournament(GUILD_ID, 'Export Cup', USER_ID, 4);
    ['Alien', 'Aliens'].forEach((t, i) => bracketManager.addTitle(GUILD_ID, 'A', 'movie', movie(i + 1, t, 1979 + i)));
    const t = bracketManager.loadTournament(GUILD_ID);
    t.votes = { 'voter-555': {} };
    bracketManager.saveTournament(GUILD_ID, t);

    const exp = commandInteraction({ subcommand: 'export', strings: { format: 'json' } });
    await execute(exp);

    const file = exp.editReply.mock.calls[0][0].files[0];
    const text = file.attachment.toString('utf8');
    const parsed = JSON.parse(text);
    expect(parsed).toMatchObject({ format: 'eggshen-tournament', version: 1, name: 'Export Cup', type: 'movie' });
    expect(parsed.titles.map(x => x.title)).toEqual(['Alien', 'Aliens']);
    expect(text).not.toContain('voter-555');
  });

  test('advance-knockout is gone from the command definition', async () => {
    const { data } = await import('../src/commands/bracket.js');
    const names = data.toJSON().options.map(o => o.name);
    expect(names).not.toContain('advance-knockout');
    expect(names.indexOf('setup-link')).toBe(names.indexOf('create') + 1);
  });
});

describe('opening matchups never touches ones already voting or decided', () => {
  // There were five separate "open a matchup" paths. Most reset whatever they
  // were given: a live matchup lost its votes, and a decided one lost its
  // result while its winner stayed seated in the next round.
  function knockoutOf(n) {
    bracketManager.createTournament(GUILD_ID, 'KO Cup', USER_ID, n <= 8 ? 8 : 16);
    for (let i = 0; i < n; i++) bracketManager.addTitle(GUILD_ID, 'A', 'movie', movie(i + 1, `M${i + 1}`, 1970 + i));
    bracketManager.generateKnockoutBracket(GUILD_ID);
    return bracketManager.loadTournament(GUILD_ID);
  }
  const round = (t) => t.knockoutBracket.filter(m => m.round === t.phase).sort((a, b) => a.position - b.position);

  /** Decide a matchup for movie1 with one vote. */
  function decide(matchupId) {
    bracketManager.voteKnockout(GUILD_ID, 'voter-1', matchupId, 1);
    return bracketManager.closeKnockoutMatchup(GUILD_ID, matchupId);
  }

  test('openKnockoutMatchups opens only fresh matchups and reports the rest', () => {
    const t = knockoutOf(8);
    const [a, b, c, d] = round(t);
    bracketManager.openKnockoutMatchups(GUILD_ID, [a.id, b.id], null);
    bracketManager.voteKnockout(GUILD_ID, 'voter-9', b.id, 2);
    decide(a.id);

    const result = bracketManager.openKnockoutMatchups(GUILD_ID, [a.id, b.id, c.id, d.id], null);

    expect(result.opened.map(m => m.id)).toEqual([c.id, d.id]);
    expect(result.alreadyOpen.map(m => m.id)).toEqual([b.id]);
    expect(result.decided.map(m => m.id)).toEqual([a.id]);
    const after = bracketManager.loadTournament(GUILD_ID);
    const byId = (id) => after.knockoutBracket.find(m => m.id === id);
    expect(byId(a.id)).toMatchObject({ status: 'closed', winner: expect.objectContaining({ title: a.movie1.title }) });
    expect(byId(b.id).votes.movie2).toEqual(['voter-9']);
  });

  test('/bracket open after some matchups were decided keeps their results', async () => {
    const t = knockoutOf(8);
    const [a] = round(t);
    bracketManager.openKnockoutMatchups(GUILD_ID, [a.id], null);
    decide(a.id);
    const winnerBefore = bracketManager.loadTournament(GUILD_ID).knockoutBracket.find(m => m.id === a.id).winner;

    const open = commandInteraction({ subcommand: 'open', strings: { duration: '1h' } });
    await execute(open);

    const after = bracketManager.loadTournament(GUILD_ID);
    const aAfter = after.knockoutBracket.find(m => m.id === a.id);
    expect(aAfter.status).toBe('closed');
    expect(aAfter.winner).toEqual(winnerBefore);
    expect(after.knockoutResults[a.id]).toBeDefined();
    expect(round(after).filter(m => m.status === 'voting')).toHaveLength(3);
    expect(sentText(open)).not.toContain('1A,');
  });

  test('open-matchup region:N leaves live votes and decided results alone, and says so', async () => {
    const t = knockoutOf(16);
    const regionOne = round(t).slice(0, 2); // 8 matchups, 2 per region

    await execute(commandInteraction({ subcommand: 'open-matchup', integers: { region: 1 }, strings: { duration: '1h' } }));
    bracketManager.voteKnockout(GUILD_ID, 'voter-7', regionOne[1].id, 1);
    decide(regionOne[0].id);

    const again = commandInteraction({ subcommand: 'open-matchup', integers: { region: 1 }, strings: { duration: '1h' } });
    await execute(again);

    const after = bracketManager.loadTournament(GUILD_ID);
    const byId = (id) => after.knockoutBracket.find(m => m.id === id);
    expect(byId(regionOne[0].id).status).toBe('closed');
    expect(byId(regionOne[0].id).winner).toBeTruthy();
    expect(byId(regionOne[1].id).votes.movie1).toContain('voter-7');
    const text = sentText(again);
    expect(text).toContain('Nothing to open in Region 1');
    expect(text).toContain('Already decided: 1A');
    expect(text).toContain('Already open: 1B');
  });

  test('the region announcement shows line breaks, not a literal \\n', async () => {
    knockoutOf(16);
    const open = commandInteraction({ subcommand: 'open-matchup', integers: { region: 2 }, strings: { duration: '1h' } });
    await execute(open);
    const embed = open.editReply.mock.calls[0][0].embeds[0].toJSON();
    expect(embed.description).not.toContain('\\n');
    expect(embed.description).toContain('Opened matchups:');
  });

  test('open-matchup by label refuses a decided matchup', async () => {
    const t = knockoutOf(8);
    const [a] = round(t);
    bracketManager.openKnockoutMatchups(GUILD_ID, [a.id], null);
    decide(a.id);

    const open = commandInteraction({ subcommand: 'open-matchup', strings: { matchup: '1A', duration: '1h' } });
    await execute(open);

    expect(sentText(open)).toContain('Matchup 1A is already decided');
    expect(bracketManager.loadTournament(GUILD_ID).knockoutBracket.find(m => m.id === a.id).status).toBe('closed');
  });
});

describe('tiebreaker times are 5m to 7d everywhere', () => {
  test('/bracket close refuses 8d (it used to accept anything)', async () => {
    bracketManager.createTournament(GUILD_ID, 'Tie Cup', USER_ID, 4);
    ['Alien', 'Aliens'].forEach((t, i) => bracketManager.addTitle(GUILD_ID, 'A', 'movie', movie(i + 1, t, 1979 + i)));
    await execute(commandInteraction({ subcommand: 'open', strings: { duration: '1h' } }));

    const close = commandInteraction({ subcommand: 'close', strings: { 'tiebreaker-duration': '8d' } });
    await execute(close);

    expect(sentText(close)).toContain('between 5 minutes (5m) and 7 days (7d)');
    expect(bracketManager.loadTournament(GUILD_ID).knockoutBracket.some(m => m.status === 'voting')).toBe(true);
  });

  test('close-groups refuses 8d too (it checked the 30-day voting limit)', async () => {
    bracketManager.createTournament(GUILD_ID, 'Tie Cup', USER_ID, 36);
    const close = commandInteraction({ subcommand: 'close-groups', strings: { groups: 'A', 'tiebreaker-duration': '8d' } });
    await execute(close);
    expect(sentText(close)).toContain('7 days (7d)');
  });

  test('the setup form refuses an 8d tiebreaker', async () => {
    const { validateSettings } = await import('../src/utils/tournamentImport.js');
    expect(validateSettings({ tiebreakerDuration: '8d' })).toEqual([
      expect.objectContaining({ field: 'tiebreakerDuration', message: 'Tiebreaker time must be between 5m and 7d.' }),
    ]);
    expect(validateSettings({ tiebreakerDuration: '7d' })).toEqual([]);
  });
});

describe('small corrections', () => {
  test('resize keeps capacity in step with the group count', () => {
    bracketManager.createTournament(GUILD_ID, 'Resize Cup', USER_ID, 36);
    expect(bracketManager.resizeTournament(GUILD_ID, 5).success).toBe(true);
    expect(bracketManager.loadTournament(GUILD_ID)).toMatchObject({ groupCount: 5, maxTitles: 20 });
  });

  test('starting the knockout too early names commands that exist', () => {
    bracketManager.createTournament(GUILD_ID, 'Early Cup', USER_ID, 36);
    const result = bracketManager.generateKnockoutBracket(GUILD_ID);
    expect(result.success).toBe(false);
    expect(result.error).toContain('`/bracket close`');
    expect(result.error).not.toContain('close-group`');
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

/**
 * The tournament import format (src/utils/tournamentImport.js): reading
 * CSV/JSON, the rules it checks, matching rows to titles, saving, and the
 * export that round-trips back in. Also Ordered seeding, which the format
 * introduced.
 *
 * The shipped templates in docs/public/templates/tournaments/ are parsed here
 * too: a template that the importer rejects would be the first thing every
 * user hits.
 *
 * Only the external search/details APIs are mocked; bracketManager is real and
 * writes to this worker's scratch directory.
 *
 * Run with: npm test -- tests/tournament-import.test.js
 */

import { describe, test, expect, jest, beforeAll, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const mockHybridSearch = jest.fn();
const mockGetMovieDetails = jest.fn();

jest.unstable_mockModule('../src/services/tmdbService.js', () => ({
  searchMovies: jest.fn(),
  searchTVShows: jest.fn(),
  getMovieAlternativeTitles: jest.fn().mockResolvedValue([]),
  getTVAlternativeTitles: jest.fn().mockResolvedValue([]),
  getMovieDetails: mockGetMovieDetails,
  getTVShowDetails: jest.fn(),
}));
jest.unstable_mockModule('../src/services/aiService.js', () => ({ hybridSearch: mockHybridSearch }));
jest.unstable_mockModule('../src/services/rawgService.js', () => ({ searchGames: jest.fn(), getGameDetails: jest.fn() }));
jest.unstable_mockModule('../src/services/bggService.js', () => ({ searchBoardGames: jest.fn(), getBoardGameDetails: jest.fn() }));
jest.unstable_mockModule('../src/services/googleBooksService.js', () => ({ searchBooks: jest.fn(), getBookDetails: jest.fn() }));

let imp;
let bracketManager;

beforeAll(async () => {
  imp = await import('../src/utils/tournamentImport.js');
  bracketManager = await import('../src/utils/bracketManager.js');
});

const GUILD_ID = 'tournament-import-guild';
const TEMPLATE_DIR = path.join(process.cwd(), 'docs/public/templates/tournaments');

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
});
afterEach(cleanup);

/** `n` distinct resolved rows, as the routes hand them to saveImportedTournament. */
function entries(n, groupOf = () => '') {
  return Array.from({ length: n }, (_, i) => ({
    entry: { id: 1000 + i, title: `Film ${i + 1}`, year: String(1970 + i), type: 'movie', posterUrl: null, metadata: {} },
    group: groupOf(i),
    imageUrl: '',
  }));
}

const SETTINGS = { name: 'Import Cup', type: 'movie', seeding: 'random' };

// ─── parsing ──────────────────────────────────────────────────────────────────

describe('parseImportFile', () => {
  test.each(['straight-bracket.csv', 'groups.csv', 'tournament.json'])('the shipped template %s reads with no errors', (file) => {
    const result = imp.parseImportFile(fs.readFileSync(path.join(TEMPLATE_DIR, file), 'utf8'));
    expect(result.errors).toEqual([]);
    expect(imp.planLineup(result.rows).errors).toEqual([]);
    expect(result.rows.length).toBeGreaterThan(0);
  });

  test('the groups template makes a 4-group tournament; the straight one an 8-slot bracket', () => {
    const groups = imp.planLineup(imp.parseImportFile(fs.readFileSync(path.join(TEMPLATE_DIR, 'groups.csv'), 'utf8')).rows);
    expect(groups).toMatchObject({ mode: 'groups', groupCount: 4 });
    const straight = imp.planLineup(imp.parseImportFile(fs.readFileSync(path.join(TEMPLATE_DIR, 'straight-bracket.csv'), 'utf8')).rows);
    expect(straight).toMatchObject({ mode: 'bracket', bracketSize: 8, byes: 0 });
  });

  test('CSV: quoted commas and quotes, CRLF, a BOM, any column order and case', () => {
    const text = '﻿Year,Title,IMAGE_URL\r\n1984,"Gremlins, the first",\r\n2002,"The ""Ring""",https://img.example/r.png\r\n';
    const { rows, errors } = imp.parseImportFile(text);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { title: 'Gremlins, the first', year: '1984', group: '', id: '', imageUrl: '' },
      { title: 'The "Ring"', year: '2002', group: '', id: '', imageUrl: 'https://img.example/r.png' },
    ]);
  });

  test('a year on the end of a title moves into year', () => {
    const { rows } = imp.parseImportFile('title\nThe Covenant (2006)\nThe Fly - 1986\n');
    expect(rows.map(r => [r.title, r.year])).toEqual([['The Covenant', '2006'], ['The Fly', '1986']]);
  });

  test('an unknown column stops the read and names it', () => {
    const { rows, errors } = imp.parseImportFile('titel,year\nAlien,1979\n');
    expect(rows).toEqual([]);
    expect(errors.map(e => e.message).join(' ')).toContain('Unknown column "titel"');
  });

  test('bad cells are reported against their row', () => {
    const { errors } = imp.parseImportFile('title,year,group,image_url\n,1979,,\nAlien,79,,\nAliens,1986,M,\nPrometheus,2012,,not a link\n');
    expect(errors).toEqual([
      expect.objectContaining({ row: 1, message: 'Row 1 has no title.' }),
      expect.objectContaining({ row: 2, field: 'year' }),
      expect.objectContaining({ row: 3, message: 'Row 3: "M" isn\'t a group. Groups run A to L.' }),
      expect.objectContaining({ row: 4, field: 'imageUrl' }),
    ]);
  });

  test('JSON: settings come through, and unknown fields are errors rather than ignored', () => {
    const file = JSON.stringify({
      format: 'eggshen-tournament', version: 1, name: 'X', type: 'tv', seedng: 'ordered',
      announcement: { message: 'Hi', banner: 'x' },
      titles: [{ title: 'Severance', year: 2022, rating: 5 }],
    });
    const { settings, rows, errors } = imp.parseImportFile(file);
    expect(settings).toMatchObject({ name: 'X', type: 'tv', announcement: { message: 'Hi', imageUrl: '' } });
    expect(rows[0]).toMatchObject({ title: 'Severance', year: '2022' });
    const messages = errors.map(e => e.message);
    expect(messages).toContain('Unknown field "seedng".');
    expect(messages).toContain('Unknown field "announcement.banner".');
    expect(messages).toContain('Row 1: unknown field "rating".');
  });

  test('JSON without the format marker is refused', () => {
    const { errors } = imp.parseImportFile('{"titles": []}');
    expect(errors[0].message).toContain("isn't a tournament file");
  });
});

// ─── rules ────────────────────────────────────────────────────────────────────

describe('planLineup', () => {
  const row = (title, group = '', id = '') => ({ title, year: '', group, id, imageUrl: '' });

  test('straight bracket: size and byes', () => {
    const rows = Array.from({ length: 12 }, (_, i) => row(`T${i}`));
    expect(imp.planLineup(rows)).toMatchObject({ mode: 'bracket', bracketSize: 16, byes: 4, errors: [] });
  });

  test('straight bracket: 33 titles is too many and says how to fix it', () => {
    const rows = Array.from({ length: 33 }, (_, i) => row(`T${i}`));
    expect(imp.planLineup(rows).errors[0].message).toContain('holds 2 to 32 titles; this has 33');
  });

  test('groups: empty group cells fill the first group with room', () => {
    const rows = [
      ...'AAAA'.split('').map((g, i) => row(`A${i}`, g)),
      ...Array.from({ length: 12 }, (_, i) => row(`X${i}`)),
    ];
    const plan = imp.planLineup(rows);
    expect(plan.errors).toEqual([]);
    expect(plan.groupCount).toBe(4);
    expect(plan.groups.slice(4)).toEqual(['B', 'B', 'B', 'B', 'C', 'C', 'C', 'C', 'D', 'D', 'D', 'D']);
  });

  test('groups: a short group and a gap are both named', () => {
    const rows = [
      ...'AAAA'.split('').map((g, i) => row(`A${i}`, g)),
      ...'BBB'.split('').map((g, i) => row(`B${i}`, g)),
      ...'DDDD'.split('').map((g, i) => row(`D${i}`, g)),
      ...'EEEE'.split('').map((g, i) => row(`E${i}`, g)),
    ];
    const messages = imp.planLineup(rows).errors.map(e => e.message);
    expect(messages).toContain('Group B has 3 titles; every group needs exactly 4.');
    expect(messages).toContain('Group C is empty. Groups must run from A to E with no gaps.');
  });

  test('groups: fewer than 4 groups is refused', () => {
    const rows = 'AAAABBBB'.split('').map((g, i) => row(`T${i}`, g));
    expect(imp.planLineup(rows).errors[0].message).toContain('at least 4 groups');
  });

  test('duplicates: by id when there is one, otherwise title and year', () => {
    const plan = imp.planLineup([row('Alien', '', '348'), row('Alien (director\'s cut)', '', '348'), row('Heat'), row('heat')]);
    expect(plan.errors.map(e => e.message)).toEqual([
      'Row 2 is the same title as row 1.',
      'Row 4 is the same title as row 3.',
    ]);
  });
});

describe('validateSettings', () => {
  test('saving needs a name and a type', () => {
    const fields = imp.validateSettings({}, { forSave: true }).map(e => e.field);
    expect(fields).toEqual(['name', 'type']);
  });

  test('durations, seeding and announcement length are checked', () => {
    const errors = imp.validateSettings({
      name: 'X', type: 'movie', seeding: 'best', votingDuration: '2w', tiebreakerDuration: '1m',
      announcement: { message: 'x'.repeat(1001), imageUrl: 'nope' },
    }, { forSave: true });
    expect(errors.map(e => e.field)).toEqual(['seeding', 'votingDuration', 'tiebreakerDuration', 'announcement.message', 'announcement.imageUrl']);
  });
});

// ─── matching ─────────────────────────────────────────────────────────────────

describe('resolveRow', () => {
  const results = [
    { id: 1091, title: 'The Thing', release_date: '1982-06-25' },
    { id: 60935, title: 'The Thing', release_date: '2011-10-14' },
  ];

  test('a year that matches exactly one result settles it', async () => {
    mockHybridSearch.mockResolvedValue(results);
    const r = await imp.resolveRow('movie', { title: 'The Thing', year: '2011', id: '' });
    expect(r).toMatchObject({ status: 'matched', entry: { id: 60935 } });
  });

  test('no year and several results: a pick', async () => {
    mockHybridSearch.mockResolvedValue(results);
    const r = await imp.resolveRow('movie', { title: 'The Thing', year: '', id: '' });
    expect(r.status).toBe('choose');
    expect(r.candidates.map(c => c.id)).toEqual([1091, 60935]);
  });

  test('an id skips the search entirely', async () => {
    mockGetMovieDetails.mockResolvedValue({ id: 1091, title: 'The Thing', release_date: '1982-06-25' });
    const r = await imp.resolveRow('movie', { title: 'anything', year: '', id: '1091' });
    expect(mockHybridSearch).not.toHaveBeenCalled();
    expect(r).toMatchObject({ status: 'matched', entry: { id: 1091, year: '1982' } });
  });

  test('a search failure is an error, not "nothing found"', async () => {
    mockHybridSearch.mockRejectedValue(new Error('503'));
    const r = await imp.resolveRow('movie', { title: 'Alien', year: '', id: '' });
    expect(r.status).toBe('error');
  });
});

// ─── seeding ──────────────────────────────────────────────────────────────────

describe('Ordered seeding', () => {
  test('standardSeedOrder is the usual layout', () => {
    expect(bracketManager.standardSeedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    expect(bracketManager.standardSeedOrder(4)).toEqual([1, 4, 2, 3]);
  });

  function firstRound(tournament) {
    return tournament.knockoutBracket
      .filter(m => m.round === tournament.phase)
      .sort((a, b) => a.position - b.position)
      .map(m => [m.movie1?.title ?? null, m.movie2?.title ?? null]);
  }

  test('8 titles: best plays worst, and seeds 1 and 2 are in opposite halves', () => {
    const saved = imp.saveImportedTournament(GUILD_ID, { settings: { ...SETTINGS, seeding: 'ordered' }, rows: entries(8), creatorId: 'u1' });
    expect(saved.success).toBe(true);
    const gen = bracketManager.generateKnockoutBracket(GUILD_ID);
    expect(firstRound(gen.tournament)).toEqual([
      ['Film 1', 'Film 8'], ['Film 4', 'Film 5'], ['Film 2', 'Film 7'], ['Film 3', 'Film 6'],
    ]);
  });

  test('5 titles: the byes go to seeds 1, 2 and 3', () => {
    imp.saveImportedTournament(GUILD_ID, { settings: { ...SETTINGS, seeding: 'ordered' }, rows: entries(5), creatorId: 'u1' });
    const t = bracketManager.generateKnockoutBracket(GUILD_ID).tournament;
    const byes = t.knockoutBracket.filter(m => m.round === 'quarterfinals' && m.isBye).map(m => m.movie1.title);
    expect(byes.sort()).toEqual(['Film 1', 'Film 2', 'Film 3']);
    expect(firstRound(t)).toContainEqual(['Film 4', 'Film 5']);
  });

  test('Random still shuffles (the order differs from the list at least once in 20 builds)', () => {
    let differed = false;
    for (let i = 0; i < 20 && !differed; i++) {
      imp.saveImportedTournament(GUILD_ID, { settings: SETTINGS, rows: entries(8), creatorId: 'u1' });
      const round = firstRound(bracketManager.generateKnockoutBracket(GUILD_ID).tournament).flat();
      differed = round.join() !== ['Film 1', 'Film 2', 'Film 3', 'Film 4', 'Film 5', 'Film 6', 'Film 7', 'Film 8'].join();
      cleanup();
    }
    expect(differed).toBe(true);
  });
});

// ─── saving ───────────────────────────────────────────────────────────────────

describe('saveImportedTournament', () => {
  test('straight bracket: titles in order, settings stored', () => {
    const rows = entries(6);
    rows[2].imageUrl = 'https://img.example/3.png';
    const result = imp.saveImportedTournament(GUILD_ID, {
      settings: { ...SETTINGS, votingDuration: '2d', announcement: { message: 'Go', imageUrl: '' } },
      rows, creatorId: 'u1',
    });
    expect(result.success).toBe(true);
    const t = bracketManager.loadTournament(GUILD_ID);
    expect(t).toMatchObject({ mode: 'bracket', maxTitles: 8, type: 'movie', status: 'setup', votingDuration: '2d', tiebreakerDuration: '1h', seeding: 'random' });
    expect(t.titles.map(x => x.title)).toEqual(['Film 1', 'Film 2', 'Film 3', 'Film 4', 'Film 5', 'Film 6']);
    expect(t.titles[2].customImageUrl).toBe('https://img.example/3.png');
    expect(t.announcement.message).toBe('Go');
  });

  test('groups: 5 groups of 4', () => {
    const result = imp.saveImportedTournament(GUILD_ID, { settings: SETTINGS, rows: entries(20, i => 'ABCDE'[Math.floor(i / 4)]), creatorId: 'u1' });
    expect(result.success).toBe(true);
    const t = bracketManager.loadTournament(GUILD_ID);
    expect(t).toMatchObject({ mode: 'groups', groupCount: 5, maxTitles: 20 });
    expect(Object.keys(t.groups).sort()).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(t.groups.E.movies.map(m => m.title)).toEqual(['Film 17', 'Film 18', 'Film 19', 'Film 20']);
  });

  test('replacing a setup tournament keeps its creator and drops its old titles', () => {
    imp.saveImportedTournament(GUILD_ID, { settings: SETTINGS, rows: entries(4), creatorId: 'original' });
    imp.saveImportedTournament(GUILD_ID, { settings: { ...SETTINGS, name: 'Second' }, rows: entries(2), creatorId: 'someone-else' });
    const t = bracketManager.loadTournament(GUILD_ID);
    expect(t).toMatchObject({ name: 'Second', creatorId: 'original' });
    expect(t.titles).toHaveLength(2);
  });

  test('a tournament that has started voting is left alone', () => {
    imp.saveImportedTournament(GUILD_ID, { settings: SETTINGS, rows: entries(4), creatorId: 'u1' });
    bracketManager.generateKnockoutBracket(GUILD_ID);
    const result = imp.saveImportedTournament(GUILD_ID, { settings: SETTINGS, rows: entries(2), creatorId: 'u1' });
    expect(result.success).toBe(false);
    expect(result.errors[0].message).toContain('already started voting');
    expect(bracketManager.loadTournament(GUILD_ID).status).toBe('knockout');
  });

  test('any problem means nothing is written, and every problem is listed', () => {
    imp.saveImportedTournament(GUILD_ID, { settings: SETTINGS, rows: entries(4), creatorId: 'u1' });
    const before = fs.readFileSync(tournamentFile(), 'utf8');
    const rows = entries(3);
    rows[2] = { entry: null, group: '', imageUrl: '' };
    const result = imp.saveImportedTournament(GUILD_ID, { settings: { type: 'movie' }, rows, creatorId: 'u1' });
    expect(result.success).toBe(false);
    expect(result.errors.map(e => e.message)).toEqual(expect.arrayContaining([
      'Give the tournament a name.',
      "Row 3 hasn't been matched to a title yet.",
    ]));
    expect(fs.readFileSync(tournamentFile(), 'utf8')).toBe(before);
  });
});

// ─── export ───────────────────────────────────────────────────────────────────

describe('buildExport', () => {
  test('round-trips: export, parse, plan and save give back the same tournament', () => {
    const rows = entries(16, i => 'ABCD'[Math.floor(i / 4)]);
    imp.saveImportedTournament(GUILD_ID, { settings: { ...SETTINGS, seeding: 'ordered', votingDuration: '3d' }, rows, creatorId: 'u1' });
    const exported = imp.buildExport(bracketManager.loadTournament(GUILD_ID));

    expect(exported).toMatchObject({ format: 'eggshen-tournament', version: 1, name: 'Import Cup', type: 'movie', seeding: 'ordered', votingDuration: '3d' });
    expect(exported.titles[0]).toEqual({ title: 'Film 1', year: 1970, group: 'A', id: 1000 });

    const parsed = imp.parseImportFile(JSON.stringify(exported));
    expect(parsed.errors).toEqual([]);
    const plan = imp.planLineup(parsed.rows);
    expect(plan).toMatchObject({ mode: 'groups', groupCount: 4, errors: [] });
    expect(parsed.rows.map(r => r.id)).toEqual(rows.map(r => String(r.entry.id)));
  });

  test('carries no votes or voter ids', () => {
    imp.saveImportedTournament(GUILD_ID, { settings: SETTINGS, rows: entries(4), creatorId: 'u1' });
    const t = bracketManager.loadTournament(GUILD_ID);
    t.votes = { 'user-123': { A: [0] } };
    const text = JSON.stringify(imp.buildExport(t));
    expect(text).not.toContain('user-123');
    expect(text).not.toContain('votes');
  });
});

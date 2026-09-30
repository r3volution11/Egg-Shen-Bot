/**
 * The setup form's HTTP side (src/api/tournamentSetupRoutes.js), driven the
 * way the page drives it: a token from `/bracket setup-link`, then parse →
 * resolve → save → state → export. Only the external search APIs are mocked.
 *
 * The security properties get their own tests because the routes are the only
 * thing between a link and a server's tournament: the guild always comes from
 * the token, the page can only send ids (never entry data), and a person who
 * has lost their admin/mod role can't save with an old link.
 *
 * Run with: npm test -- tests/tournament-setup-routes.test.js
 */

import { describe, test, expect, jest, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
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

const { PermissionFlagsBits } = await import('discord.js');
const express = (await import('express')).default;
const request = (await import('supertest')).default;

let registerTournamentSetupRoutes;
let signSetupToken;
let bracketManager;

const GUILD_ID = 'setup-routes-guild';
const OTHER_GUILD = 'setup-routes-other-guild';
const USER_ID = 'admin-1';

// Jest reuses a worker's process across test files, so put the env back
const ORIGINAL_SECRET = process.env.TOURNAMENT_SETUP_LINK_SECRET;
afterAll(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.TOURNAMENT_SETUP_LINK_SECRET;
  else process.env.TOURNAMENT_SETUP_LINK_SECRET = ORIGINAL_SECRET;
});

beforeAll(async () => {
  process.env.TOURNAMENT_SETUP_LINK_SECRET = 'test-setup-secret';
  ({ registerTournamentSetupRoutes } = await import('../src/api/tournamentSetupRoutes.js'));
  ({ signSetupToken } = await import('../src/utils/tournamentSetupLinkToken.js'));
  bracketManager = await import('../src/utils/bracketManager.js');
});

function fileFor(guildId) {
  const dir = process.env.GUILD_TOURNAMENTS_DIR || path.join(process.cwd(), 'guild_tournaments');
  return path.join(dir, `${guildId}.json`);
}
function cleanup() {
  for (const g of [GUILD_ID, OTHER_GUILD]) if (fs.existsSync(fileFor(g))) fs.unlinkSync(fileFor(g));
}

/** An app with only these routes, and a guild whose member is (or isn't) a manager. */
function makeApp({ isManager = true } = {}) {
  const member = { permissions: { has: (flag) => isManager && flag === PermissionFlagsBits.Administrator } };
  const guild = { name: 'Drive-In', members: { fetch: jest.fn().mockResolvedValue(member) } };
  const client = { guilds: { cache: new Map([[GUILD_ID, guild]]) } };
  const app = express();
  app.use(express.json());
  registerTournamentSetupRoutes(app, client);
  return app;
}

let app;
let token;

beforeEach(() => {
  cleanup();
  mockHybridSearch.mockReset();
  mockGetMovieDetails.mockReset();
  app = makeApp();
  token = signSetupToken({ guildId: GUILD_ID, userId: USER_ID });
});
afterEach(cleanup);

const movies = [
  { id: 348, title: 'Alien', release_date: '1979-05-25', poster_path: '/alien.jpg' },
  { id: 679, title: 'Aliens', release_date: '1986-07-18' },
  { id: 8077, title: 'Alien³', release_date: '1992-05-22' },
  { id: 8078, title: 'Alien Resurrection', release_date: '1997-11-12' },
];

/** Search returns the one movie whose title matches the query exactly. */
function searchByTitle() {
  mockHybridSearch.mockImplementation(async (query) => movies.filter(m => m.title === query));
}

describe('the link', () => {
  test('the page needs a valid token', async () => {
    const res = await request(app).get('/tournament-setup?token=nope');
    expect(res.status).toBe(403);
    expect(res.text).toContain('/bracket setup-link');
  });

  test('the page is served, themed, with a valid token', async () => {
    const res = await request(app).get(`/tournament-setup?token=${token}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Tournament Setup');
    expect(res.text).toContain('/shared-assets/themes/default/bootstrap.min.css');
  });

  test('an expired token is refused with a message saying so', async () => {
    const expired = signSetupToken({ guildId: GUILD_ID, userId: USER_ID }, { ttlMs: -1000 });
    const res = await request(app).get('/api/tournament-setup/state').set('X-Setup-Token', expired);
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('expired');
  });

  test('a tampered token is refused', async () => {
    const [payload, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ guildId: OTHER_GUILD, userId: USER_ID, exp: Date.now() + 60000, jti: 'x' })).toString('base64url');
    const res = await request(app).get('/api/tournament-setup/state').set('X-Setup-Token', `${forged}.${sig}`);
    expect(res.status).toBe(403);
    expect(payload).not.toBe(forged);
  });
});

describe('parse → resolve → save, as the page does it', () => {
  test('a CSV becomes a straight bracket with the right titles', async () => {
    searchByTitle();
    const csv = 'title,year\nAlien,1979\nAliens\nAlien³\nAlien Resurrection\n';

    const parsed = await request(app).post('/api/tournament-setup/parse').set('X-Setup-Token', token).send({ text: csv });
    expect(parsed.body.errors).toEqual([]);
    expect(parsed.body.rows).toHaveLength(4);

    const resolved = await request(app).post('/api/tournament-setup/resolve').set('X-Setup-Token', token)
      .send({ type: 'movie', rows: parsed.body.rows });
    expect(resolved.body.results.map(r => r.status)).toEqual(['matched', 'matched', 'matched', 'matched']);
    expect(resolved.body.results[0].entry).toEqual(expect.objectContaining({ id: 348, title: 'Alien', year: '1979', posterUrl: expect.stringContaining('/alien.jpg') }));

    const saved = await request(app).post('/api/tournament-setup/save').set('X-Setup-Token', token).send({
      settings: { name: 'Alien Cup', type: 'movie', seeding: 'ordered' },
      rows: resolved.body.results.map(r => ({ id: String(r.entry.id), group: '', imageUrl: '' })),
    });
    expect(saved.status).toBe(200);
    expect(saved.body.summary).toEqual({ name: 'Alien Cup', mode: 'bracket', titleCount: 4, groupCount: null });

    const t = bracketManager.loadTournament(GUILD_ID);
    expect(t.titles.map(x => x.id)).toEqual([348, 679, 8077, 8078]);
    expect(t).toMatchObject({ creatorId: USER_ID, seeding: 'ordered', status: 'setup' });
    // Everything came from the cache filled while resolving: no second lookup
    expect(mockGetMovieDetails).not.toHaveBeenCalled();
  });

  test('state then shows the saved tournament, ready to edit', async () => {
    searchByTitle();
    const resolved = await request(app).post('/api/tournament-setup/resolve').set('X-Setup-Token', token)
      .send({ type: 'movie', rows: [{ title: 'Alien' }, { title: 'Aliens' }] });
    await request(app).post('/api/tournament-setup/save').set('X-Setup-Token', token).send({
      settings: { name: 'Two', type: 'movie' },
      rows: resolved.body.results.map(r => ({ id: String(r.entry.id), group: '' })),
    });

    const state = await request(app).get('/api/tournament-setup/state').set('X-Setup-Token', token);
    expect(state.body).toMatchObject({ guildName: 'Drive-In', editable: true });
    expect(state.body.tournament.settings).toMatchObject({ name: 'Two', type: 'movie', seeding: 'random', votingDuration: '24h' });
    expect(state.body.tournament.rows.map(r => [r.title, r.id, r.match.status])).toEqual([['Alien', '348', 'matched'], ['Aliens', '679', 'matched']]);
  });

  test('save errors come back per row, and nothing is written', async () => {
    const res = await request(app).post('/api/tournament-setup/save').set('X-Setup-Token', token).send({
      settings: { name: 'X', type: 'movie' },
      rows: [{ id: '' }, { id: '' }],
    });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ row: 1, message: "Row 1 hasn't been matched to a title yet." })]));
    expect(bracketManager.loadTournament(GUILD_ID)).toBeNull();
  });

  test('export is the import format and downloads as a file', async () => {
    searchByTitle();
    const resolved = await request(app).post('/api/tournament-setup/resolve').set('X-Setup-Token', token)
      .send({ type: 'movie', rows: [{ title: 'Alien' }, { title: 'Aliens' }] });
    await request(app).post('/api/tournament-setup/save').set('X-Setup-Token', token).send({
      settings: { name: 'Backup Me', type: 'movie' },
      rows: resolved.body.results.map(r => ({ id: String(r.entry.id) })),
    });

    const res = await request(app).get('/api/tournament-setup/export').set('X-Setup-Token', token);
    expect(res.headers['content-disposition']).toContain('attachment; filename="Backup_Me.json"');
    expect(res.body).toMatchObject({ format: 'eggshen-tournament', name: 'Backup Me', titles: [{ title: 'Alien', id: 348 }, { title: 'Aliens', id: 679 }] });
  });
});

describe('what a link can and cannot do', () => {
  test('the guild comes from the token: another guild\'s tournament is never touched', async () => {
    bracketManager.createTournament(OTHER_GUILD, 'Theirs', 'someone', 4);
    searchByTitle();
    const resolved = await request(app).post('/api/tournament-setup/resolve').set('X-Setup-Token', token)
      .send({ type: 'movie', rows: [{ title: 'Alien' }, { title: 'Aliens' }] });
    await request(app).post('/api/tournament-setup/save').set('X-Setup-Token', token).send({
      guildId: OTHER_GUILD,
      settings: { name: 'Mine', type: 'movie' },
      rows: resolved.body.results.map(r => ({ id: String(r.entry.id) })),
    });
    expect(bracketManager.loadTournament(OTHER_GUILD).name).toBe('Theirs');
    expect(bracketManager.loadTournament(GUILD_ID).name).toBe('Mine');
  });

  test('the page sends ids only: entry data in the request is ignored, and an unseen id is looked up', async () => {
    mockGetMovieDetails.mockImplementation(async (id) => ({ id, title: `Real ${id}`, release_date: '2000-01-01' }));
    await request(app).post('/api/tournament-setup/save').set('X-Setup-Token', token).send({
      settings: { name: 'Ids', type: 'movie' },
      rows: [{ id: '11', title: 'Injected', posterUrl: 'https://evil.example/x.png' }, { id: '12' }],
    });
    const t = bracketManager.loadTournament(GUILD_ID);
    expect(t.titles.map(x => x.title)).toEqual(['Real 11', 'Real 12']);
    expect(JSON.stringify(t)).not.toContain('evil.example');
  });

  test('someone who is no longer an admin or mod cannot save with an old link', async () => {
    const demoted = makeApp({ isManager: false });
    const res = await request(demoted).post('/api/tournament-setup/save').set('X-Setup-Token', token).send({
      settings: { name: 'X', type: 'movie' }, rows: [{ id: '1' }, { id: '2' }],
    });
    expect(res.status).toBe(403);
    expect(bracketManager.loadTournament(GUILD_ID)).toBeNull();
  });

  test('once voting has started the lineup is read-only, but the backup still works', async () => {
    mockGetMovieDetails.mockImplementation(async (id) => ({ id, title: `T${id}`, release_date: '2000-01-01' }));
    await request(app).post('/api/tournament-setup/save').set('X-Setup-Token', token)
      .send({ settings: { name: 'Live', type: 'movie' }, rows: [{ id: '1' }, { id: '2' }] });
    bracketManager.generateKnockoutBracket(GUILD_ID);

    const state = await request(app).get('/api/tournament-setup/state').set('X-Setup-Token', token);
    expect(state.body.editable).toBe(false);

    const res = await request(app).post('/api/tournament-setup/save').set('X-Setup-Token', token)
      .send({ settings: { name: 'Changed', type: 'movie' }, rows: [{ id: '3' }, { id: '4' }] });
    expect(res.status).toBe(400);
    expect(bracketManager.loadTournament(GUILD_ID).name).toBe('Live');

    const backup = await request(app).get('/api/tournament-setup/export').set('X-Setup-Token', token);
    expect(backup.body.name).toBe('Live');
  });
});

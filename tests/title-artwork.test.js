/**
 * Artwork suggestions for an event request (src/utils/titleArtwork.js and
 * GET /api/event-request/title-art): which titles get a row, which images,
 * and who may ask. Plus the shortcut it enables — a request whose artwork
 * was picked tells the where-to-watch lookup exactly which title it is.
 *
 * TMDB is mocked; the matcher and aiService run for real, OpenAI off.
 * How the form shows and uses them: tests/e2e/artwork-suggestions.spec.js.
 *
 * Run with: npm test -- tests/title-artwork.test.js
 */

import { jest, describe, test, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';
import { Collection } from 'discord.js';
import { sessionCookieFor } from './harness/sessionCookie.js';

process.env.OPENAI_API_KEY = '';

const tmdb = {
  searchMovies: jest.fn(async () => []),
  searchTVShows: jest.fn(async () => []),
  getMovieAlternativeTitles: jest.fn(async () => []),
  getTVAlternativeTitles: jest.fn(async () => []),
  getTitleImages: jest.fn(async () => ({ backdrops: [], posters: [] })),
  getBackdropUrl: (p, size) => `https://image.tmdb.org/t/p/${size}${p}`,
  getPosterUrl: (p, size) => `https://image.tmdb.org/t/p/${size}${p}`,
  getMovieDetails: jest.fn(async () => ({ external_ids: { imdb_id: 'tt1' } })),
  getTVShowDetails: jest.fn(async () => ({ external_ids: { imdb_id: 'tt2' } })),
  getUnifiedMovieWatchProviders: jest.fn(async () => null),
  getUnifiedTVWatchProviders: jest.fn(async () => null),
};
jest.unstable_mockModule('../src/services/tmdbService.js', () => tmdb);

let findTitleArtwork;
let guildConfig;
beforeAll(async () => {
  ({ findTitleArtwork } = await import('../src/utils/titleArtwork.js'));
  guildConfig = await import('../src/utils/guildConfig.js');
});
beforeEach(() => {
  for (const fn of Object.values(tmdb)) if (fn.mockClear) fn.mockClear();
  tmdb.searchMovies.mockImplementation(async () => []);
  tmdb.searchTVShows.mockImplementation(async () => []);
  tmdb.getTitleImages.mockImplementation(async () => ({ backdrops: [], posters: [] }));
});

const movie = (id, title, date, extra = {}) => ({ id, title, release_date: date, backdrop_path: `/b${id}.jpg`, poster_path: `/p${id}.jpg`, ...extra });
const show = (id, name, date, extra = {}) => ({ id, name, first_air_date: date, backdrop_path: `/b${id}.jpg`, poster_path: `/p${id}.jpg`, ...extra });
const paths = (prefix, n) => Array.from({ length: n }, (_, i) => `/${prefix}${i}.jpg`);

describe('which artwork is suggested', () => {
  test('one confident title: up to 8 backdrops, then 2 posters, each with a full image and a thumbnail', async () => {
    tmdb.searchMovies.mockImplementation(async (q) => (q === 'Tragedy Girls' ? [movie(1, 'Tragedy Girls', '2017-10-20')] : []));
    tmdb.getTitleImages.mockImplementation(async () => ({ backdrops: paths('bd', 12), posters: paths('po', 5) }));
    const { titles } = await findTitleArtwork('Tragedy Girls (2017)');
    expect(titles).toHaveLength(1);
    expect(titles[0]).toMatchObject({ tmdbId: 1, type: 'movie', label: 'Tragedy Girls', year: '2017' });
    expect(titles[0].images.map(i => i.kind)).toEqual([...Array(8).fill('backdrop'), 'poster', 'poster']);
    expect(titles[0].images[0]).toEqual({ kind: 'backdrop', url: 'https://image.tmdb.org/t/p/w1280/bd0.jpg', thumb: 'https://image.tmdb.org/t/p/w300/bd0.jpg' });
    expect(titles[0].images[8]).toEqual({ kind: 'poster', url: 'https://image.tmdb.org/t/p/w780/po0.jpg', thumb: 'https://image.tmdb.org/t/p/w185/po0.jpg' });
    expect(tmdb.getTitleImages).toHaveBeenCalledWith('movie', 1);
  });

  test('not sure which: a row for each of the top few, the same title first, labelled with the year', async () => {
    tmdb.searchMovies.mockImplementation(async () => [movie(5, 'Fargo', '1996-03-08', { popularity: 10 }), movie(7, 'Fargo Nights', '2001-01-01', { popularity: 99 })]);
    tmdb.searchTVShows.mockImplementation(async () => [show(6, 'Fargo', '2014-04-15', { popularity: 50 }), show(8, 'Fargo Again', '2020-01-01', { popularity: 1 })]);
    tmdb.getTitleImages.mockImplementation(async () => ({ backdrops: paths('bd', 10), posters: paths('po', 3) }));
    const { titles } = await findTitleArtwork('Fargo');
    expect(titles.map(t => `${t.label} ${t.year} ${t.type}`)).toEqual(['Fargo 2014 tv', 'Fargo 1996 movie', 'Fargo Nights 2001 movie']);
    expect(titles[0].images.filter(i => i.kind === 'backdrop')).toHaveLength(4);
  });

  test('no image list: the search result\'s own backdrop and poster; no artwork at all: no row', async () => {
    tmdb.searchMovies.mockImplementation(async () => [movie(1, 'Obscure', '1980-01-01'), movie(2, 'Bare', '1981-01-01', { backdrop_path: null, poster_path: null })]);
    const { titles } = await findTitleArtwork('Ob');
    expect(titles.map(t => t.tmdbId)).toEqual([1]);
    expect(titles[0].images.map(i => i.url)).toEqual(['https://image.tmdb.org/t/p/w1280/b1.jpg', 'https://image.tmdb.org/t/p/w780/p1.jpg']);
  });

  test('nothing found: nothing suggested', async () => {
    expect(await findTitleArtwork('Board Game Night')).toEqual({ titles: [] });
  });
});

describe('the API', () => {
  const GUILD = '900000000000000088';
  let app;
  let request;
  const cookie = (userId, timestamp = Date.now()) => sessionCookieFor(userId, { timestamp });
  beforeEach(async () => {
    process.env.EVENT_STREAMING_LOOKUP = 'on';
    request = (await import('supertest')).default;
    const modChannel = { id: 'mod-1', name: 'mod', isTextBased: () => true, send: jest.fn().mockResolvedValue({ id: 'm1' }) };
    const g = {
      id: GUILD, name: 'T', channels: { cache: new Collection([['mod-1', modChannel]]) }, scheduledEvents: { create: jest.fn() },
      members: { fetch: jest.fn(async (id) => (id === 'member' ? { id } : null)) },
    };
    const client = { user: { tag: 'B#1' }, guilds: { cache: new Map([[GUILD, g]]) }, channels: { fetch: jest.fn().mockResolvedValue(modChannel) } };
    const { createApiServer } = await import('../src/api/server.js');
    app = createApiServer(client);
    app.modChannel = modChannel;
  });
  afterEach(() => { process.env.EVENT_STREAMING_LOOKUP = 'off'; });

  const art = (title, c) => {
    const r = request(app).get(`/api/event-request/title-art?guildId=${GUILD}&title=${encodeURIComponent(title)}`);
    return c ? r.set('Cookie', c) : r;
  };

  test('logged-in members get suggestions; anyone else is turned away', async () => {
    tmdb.searchMovies.mockImplementation(async () => [movie(1, 'Tragedy Girls', '2017-10-20')]);
    expect((await art('Tragedy Girls')).status).toBe(401);
    expect((await art('Tragedy Girls', cookie('member', Date.now() - 25 * 3600e3))).status).toBe(401);
    expect((await art('Tragedy Girls', cookie('stranger'))).status).toBe(403);
    expect((await art('T', cookie('member'))).status).toBe(400);
    const ok = await art('Tragedy Girls', cookie('member'));
    expect(ok.status).toBe(200);
    expect(ok.body.titles[0].label).toBe('Tragedy Girls');
  });

  test('a request whose artwork was picked names its title: where-to-watch uses it instead of guessing', async () => {
    await guildConfig.saveGuildConfig(GUILD, { eventRequests: { enabled: true, moderationChannel: 'mod-1' } });
    tmdb.getUnifiedTVWatchProviders.mockImplementation(async () => ({ link: 'L', flatrate: [{ provider_name: 'Hulu' }] }));
    const res = await request(app).post('/api/event-request').set('Cookie', sessionCookieFor('member')).send({
      guildId: GUILD, title: 'Fargo', startTime: new Date(Date.now() + 864e5).toISOString(),
      submitterUsername: 'u', submitterDiscordId: 'member',
      tmdbTitle: { tmdbId: 6, type: 'tv', label: 'Fargo' },
    });
    expect(res.status).toBe(200);
    expect(tmdb.searchMovies).not.toHaveBeenCalled(); // no guessing
    expect(tmdb.getUnifiedTVWatchProviders).toHaveBeenCalledWith(6, 'tt2', 'US');
    const field = app.modChannel.send.mock.calls[0][0].embeds[0].toJSON().fields.find(f => f.name === '📺 Where to watch');
    expect(field.value).toBe('📺 Streaming on Hulu\nMore places to watch: L');
  });

  test('a malformed picked title is ignored, and the typed title is matched as usual', async () => {
    await guildConfig.saveGuildConfig(GUILD, { eventRequests: { enabled: true, moderationChannel: 'mod-1' } });
    await request(app).post('/api/event-request').set('Cookie', sessionCookieFor('member')).send({
      guildId: GUILD, title: 'Fargo', startTime: new Date(Date.now() + 864e5).toISOString(),
      submitterUsername: 'u', submitterDiscordId: 'member',
      tmdbTitle: { tmdbId: '../../etc', type: 'person' },
    });
    expect(tmdb.searchMovies).toHaveBeenCalled();
  });
});

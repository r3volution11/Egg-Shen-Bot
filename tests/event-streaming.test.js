/**
 * Where an event request's title streams (src/utils/eventStreaming.js):
 * matching each server's own service names to the providers' names, the
 * title lookup, the description it builds within Discord's limit, and the
 * two places it shows — the moderators' request card at submit, and the
 * scheduled event's description at approval.
 *
 * TMDB is mocked; the matcher (watchTitle.js) and aiService run for real,
 * with OpenAI off so results keep TMDB's order. tests/jest.setup.js turns
 * the lookup off for every other suite; this one turns it on.
 *
 * Run with: npm test -- tests/event-streaming.test.js
 */

import { jest, describe, test, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';
import { Collection } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { sessionCookieFor } from './harness/sessionCookie.js';

process.env.OPENAI_API_KEY = '';

const tmdb = {
  searchMovies: jest.fn(),
  searchTVShows: jest.fn(),
  getMovieAlternativeTitles: jest.fn(async () => []),
  getTVAlternativeTitles: jest.fn(async () => []),
  getMovieDetails: jest.fn(async () => ({ external_ids: { imdb_id: 'tt0001' } })),
  getTVShowDetails: jest.fn(async () => ({ external_ids: { imdb_id: 'tt0002' } })),
  getUnifiedMovieWatchProviders: jest.fn(),
  getUnifiedTVWatchProviders: jest.fn(),
};
jest.unstable_mockModule('../src/services/tmdbService.js', () => tmdb);

let streaming;
let approval;
let guildConfig;
beforeAll(async () => {
  streaming = await import('../src/utils/eventStreaming.js');
  approval = await import('../src/utils/eventRequestApproval.js');
  guildConfig = await import('../src/utils/guildConfig.js');
});

const GUILD = '900000000000000077';
const p = (...names) => names.map(provider_name => ({ provider_name }));
const movie = (id, title, date = '2017-01-01') => ({ id, title, release_date: date });
const show = (id, name, date = '2014-01-01') => ({ id, name, first_air_date: date });

/** What TMDB "has": search results per query, and providers per title */
function catalog({ movies = {}, shows = {}, providers = {} }) {
  tmdb.searchMovies.mockImplementation(async (q) => movies[q] || []);
  tmdb.searchTVShows.mockImplementation(async (q) => shows[q] || []);
  tmdb.getUnifiedMovieWatchProviders.mockImplementation(async (id) => providers[`movie:${id}`] ?? null);
  tmdb.getUnifiedTVWatchProviders.mockImplementation(async (id) => providers[`tv:${id}`] ?? null);
}

beforeEach(() => {
  process.env.EVENT_STREAMING_LOOKUP = 'on';
  for (const fn of Object.values(tmdb)) fn.mockClear();
  const file = path.join(process.env.GUILD_CONFIGS_DIR, `${GUILD}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  delete global.eventRequests;
});
afterEach(() => { process.env.EVENT_STREAMING_LOOKUP = 'off'; });

describe('matching a server\'s services to the providers\' names', () => {
  const NINE = ['Shudder', 'AMC+', 'Tubi', 'Plex', 'Roku', 'Prime Video', 'Hulu', 'Peacock', 'Hoopla'];

  test('each provider variant counts as its service, in the server\'s order', () => {
    const providers = {
      flatrate: p('Peacock Premium Plus', 'Amazon Prime Video with Ads', 'Shudder Amazon Channel', 'AMC+ Roku Premium Channel', 'Hulu'),
      free: p('Tubi TV', 'The Roku Channel', 'Plex Channel', 'Hoopla'),
    };
    expect(streaming.pickServices(providers, NINE)).toEqual([
      'Shudder', 'AMC+', 'Tubi (free)', 'Plex (free)', 'Roku (free)', 'Prime Video', 'Hulu', 'Peacock', 'Hoopla (free)',
    ]);
  });

  test('AMC is not AMC+, a Roku premium channel is not Roku, and rent or buy don\'t count', () => {
    const providers = { flatrate: p('AMC Amazon Channel', 'AMC+ Roku Premium Channel'), rent: p('Hulu'), buy: p('Shudder') };
    expect(streaming.pickServices(providers, ['AMC+'])).toEqual(['AMC+']);
    expect(streaming.pickServices({ flatrate: p('AMC Amazon Channel') }, ['AMC+'])).toEqual([]);
    expect(streaming.pickServices(providers, ['Roku', 'Hulu', 'Shudder'])).toEqual([]);
  });

  test('a service listed only by Watchmode as free is in both lists, and is marked free once', () => {
    expect(streaming.pickServices({ flatrate: p('Tubi TV'), free: p('Tubi TV') }, ['Tubi'])).toEqual(['Tubi (free)']);
  });

  test('a server\'s own list replaces the default; "default" brings it back; junk is ignored', () => {
    expect(streaming.getStreamingSettings({})).toEqual({ enabled: true, services: NINE });
    expect(streaming.getStreamingSettings({ eventRequests: { streaming: { enabled: false, services: [' Netflix ', 'Netflix', 3, ''] } } }))
      .toEqual({ enabled: false, services: ['Netflix'] });
    expect(streaming.parseServiceList('Netflix, Max\nShudder')).toEqual(['Netflix', 'Max', 'Shudder']);
    expect(streaming.parseServiceList(' Default ')).toEqual(NINE);
    expect(streaming.isKnownService('amc+')).toBe(true);
    expect(streaming.isKnownService('Shuder')).toBe(false);
  });
});

describe('looking a title up', () => {
  test('an exact match: its services and its own watch link', async () => {
    catalog({
      movies: { 'Tragedy Girls': [movie(1, 'Tragedy Girls')] },
      providers: { 'movie:1': { link: 'https://www.themoviedb.org/movie/1/watch?locale=US', flatrate: p('Shudder'), free: p('Tubi TV') } },
    });
    const r = await streaming.lookupEventStreaming('Tragedy Girls (2017)');
    expect(r).toEqual({ label: 'Tragedy Girls', type: 'movie', tmdbId: 1, services: ['Shudder', 'Tubi (free)'], link: 'https://www.themoviedb.org/movie/1/watch?locale=US' });
    expect(tmdb.getUnifiedMovieWatchProviders).toHaveBeenCalledWith(1, 'tt0001', 'US');
    expect(streaming.formatStreaming(r)).toBe('📺 Streaming on Shudder and Tubi (free)\nMore places to watch: https://www.themoviedb.org/movie/1/watch?locale=US');
  });

  test('nowhere: says so, and the link is built for the title and region', async () => {
    catalog({ shows: { 'Slasher': [show(9, 'Slasher')] } });
    const r = await streaming.lookupEventStreaming('Slasher', { region: 'CA' });
    expect(streaming.formatStreaming(r)).toBe('📺 Not streaming on the usual services\nMore places to watch: https://www.themoviedb.org/tv/9/watch?locale=CA');
  });

  test('a movie and a show by the same name: no guess, unless the year settles it', async () => {
    catalog({
      movies: { Fargo: [movie(5, 'Fargo', '1996-03-08')] },
      shows: { Fargo: [show(6, 'Fargo', '2014-04-15')] },
      providers: { 'movie:5': { flatrate: p('Hulu') } },
    });
    expect(await streaming.lookupEventStreaming('Fargo')).toBeNull();
    expect((await streaming.lookupEventStreaming('Fargo (1996)')).tmdbId).toBe(5);
  });

  test('two films and a show by the same name: no guess (it used to pick the show); the year still settles it', async () => {
    catalog({
      movies: { Fargo: [movie(5, 'Fargo', '1996-03-08'), movie(9, 'Fargo', '1952-01-01')] },
      shows: { Fargo: [show(6, 'Fargo', '2014-04-15')] },
    });
    expect(await streaming.lookupEventStreaming('Fargo')).toBeNull();
    expect((await streaming.lookupEventStreaming('Fargo (2014)')).tmdbId).toBe(6);
    expect((await streaming.lookupEventStreaming('Fargo (1952)')).tmdbId).toBe(9);
  });

  test('several results and none exact: no guess', async () => {
    catalog({ movies: { 'Halloween': [movie(1, 'Halloween II'), movie(2, 'Halloween III')] } });
    expect(await streaming.lookupEventStreaming('Halloween')).toBeNull();
  });

  test('switched off, by the server or the environment: no lookup at all', async () => {
    catalog({ movies: { 'Tragedy Girls': [movie(1, 'Tragedy Girls')] } });
    expect(await streaming.streamingTextFor('Tragedy Girls', { eventRequests: { streaming: { enabled: false } } })).toBeNull();
    process.env.EVENT_STREAMING_LOOKUP = 'off';
    expect(await streaming.streamingTextFor('Tragedy Girls', {})).toBeNull();
    expect(tmdb.searchMovies).not.toHaveBeenCalled();
  });

  test('a failing lookup gives no line, not an error', async () => {
    tmdb.searchMovies.mockRejectedValue(new Error('down'));
    tmdb.searchTVShows.mockResolvedValue([show(3, 'Only Show')]);
    tmdb.getTVShowDetails.mockRejectedValueOnce(new Error('down'));
    expect(await streaming.streamingTextFor('Only Show', {})).toBeNull();
  });
});

describe('the event description', () => {
  const STREAM = '📺 Streaming on Shudder\nMore places to watch: https://www.themoviedb.org/movie/1/watch?locale=US';

  test('the person\'s text, then where to watch, then the coordination line', () => {
    expect(streaming.buildEventDescription({ description: 'Bring snacks.', streaming: STREAM, coordination: '💬 Coordination: <#1>' }))
      .toBe(`Bring snacks.\n\n${STREAM}\n\n💬 Coordination: <#1>`);
    expect(streaming.buildEventDescription({ description: '' })).toBeUndefined();
  });

  test('within 1000 characters, trimming only the person\'s text', () => {
    const d = streaming.buildEventDescription({ description: 'x'.repeat(2000), streaming: STREAM, coordination: '💬 Coordination: <#1>' });
    expect(d).toHaveLength(1000);
    expect(d.endsWith(`…\n\n${STREAM}\n\n💬 Coordination: <#1>`)).toBe(true);
  });
});

describe('approving a request', () => {
  const guild = () => ({
    id: GUILD,
    name: 'Test Guild',
    channels: { cache: new Map([['text-1', { id: 'text-1', name: 'watch-party' }]]) },
    scheduledEvents: { create: jest.fn().mockResolvedValue({ id: 'e1', url: 'https://discord.com/events/e1' }) },
  });
  const request = (over = {}) => ({
    title: 'Tragedy Girls (2017)', description: 'Bring snacks.', startTime: new Date(Date.now() + 864e5).toISOString(),
    endTime: null, channelId: 'text-1', voiceChannelId: null, ...over,
  });

  test('what was found at submit is used, without asking TMDB again', async () => {
    const g = guild();
    await approval.createScheduledEventFromRequest({
      guild: g, requestId: 'r1', approvalType: 'text',
      requestData: request({ streaming: { forTitle: 'Tragedy Girls (2017)', text: '📺 Streaming on Shudder\nMore places to watch: L' } }),
    });
    expect(g.scheduledEvents.create.mock.calls[0][0].description).toBe('Bring snacks.\n\n📺 Streaming on Shudder\nMore places to watch: L');
    expect(tmdb.searchMovies).not.toHaveBeenCalled();
  });

  test('a moderator changed the title: it\'s looked up again', async () => {
    catalog({
      movies: { 'Tragedy Girls': [movie(1, 'Tragedy Girls')] },
      providers: { 'movie:1': { link: 'L2', free: p('Tubi TV') } },
    });
    const g = guild();
    const data = request({ streaming: { forTitle: 'Tradegy Girls', text: null } });
    await approval.createScheduledEventFromRequest({ guild: g, requestId: 'r2', approvalType: 'text', requestData: data });
    expect(g.scheduledEvents.create.mock.calls[0][0].description).toBe('Bring snacks.\n\n📺 Streaming on Tubi (free)\nMore places to watch: L2');
    expect(data.streaming).toEqual({ forTitle: 'Tragedy Girls (2017)', text: '📺 Streaming on Tubi (free)\nMore places to watch: L2' });
  });

  test('switched off since the request came in: nothing added', async () => {
    await guildConfig.saveGuildConfig(GUILD, { eventRequests: { enabled: true, streaming: { enabled: false } } });
    const g = guild();
    await approval.createScheduledEventFromRequest({
      guild: g, requestId: 'r3', approvalType: 'text',
      requestData: request({ streaming: { forTitle: 'Tragedy Girls (2017)', text: '📺 Streaming on Shudder' } }),
    });
    expect(g.scheduledEvents.create.mock.calls[0][0].description).toBe('Bring snacks.');
  });
});

describe('submitting a request', () => {
  let app;
  let modChannel;
  beforeEach(async () => {
    modChannel = { id: 'mod-1', name: 'mod-queue', isTextBased: () => true, send: jest.fn().mockResolvedValue({ id: 'msg-1' }) };
    const g = {
      id: GUILD, name: 'Test', channels: { cache: new Collection([['mod-1', modChannel]]) },
      scheduledEvents: { create: jest.fn() }, members: { fetch: jest.fn().mockResolvedValue({ id: 'u1' }) },
    };
    const client = { user: { tag: 'Bot#1' }, guilds: { cache: new Map([[GUILD, g]]) }, channels: { fetch: jest.fn().mockResolvedValue(modChannel) } };
    const { createApiServer } = await import('../src/api/server.js');
    app = createApiServer(client);
  });

  const submit = async (title, description = 'Bring snacks.') => {
    const request = (await import('supertest')).default;
    return request(app).post('/api/event-request').set('Cookie', sessionCookieFor('u1')).send({
      guildId: GUILD, title, description, startTime: new Date(Date.now() + 864e5).toISOString(),
      submitterUsername: 'u', submitterDiscordId: 'u1',
    });
  };
  const fields = () => modChannel.send.mock.calls[0][0].embeds[0].toJSON().fields;

  test('moderators see where it streams, and the request remembers it', async () => {
    await guildConfig.saveGuildConfig(GUILD, { eventRequests: { enabled: true, moderationChannel: 'mod-1', streaming: { services: ['Tubi', 'Shudder'] } } });
    catalog({
      movies: { 'Tragedy Girls': [movie(1, 'Tragedy Girls')] },
      providers: { 'movie:1': { link: 'L', flatrate: p('Shudder'), free: p('Tubi TV') } },
    });
    const res = await submit('Tragedy Girls (2017)');
    expect(res.status).toBe(200);
    expect(fields().find(f => f.name === '📺 Where to watch').value).toBe('📺 Streaming on Tubi (free) and Shudder\nMore places to watch: L');
    expect(global.eventRequests.get(res.body.requestId).streaming).toEqual({ forTitle: 'Tragedy Girls (2017)', text: '📺 Streaming on Tubi (free) and Shudder\nMore places to watch: L' });
  });

  test('a title it can\'t pin down says so; switched off, no field at all', async () => {
    await guildConfig.saveGuildConfig(GUILD, { eventRequests: { enabled: true, moderationChannel: 'mod-1' } });
    catalog({});
    await submit('Board Game Night');
    expect(fields().find(f => f.name === '📺 Where to watch').value).toMatch(/^Couldn't identify the title/);

    modChannel.send.mockClear();
    await guildConfig.saveGuildConfig(GUILD, { eventRequests: { enabled: true, moderationChannel: 'mod-1', streaming: { enabled: false } } });
    await submit('Board Game Night');
    expect(fields().map(f => f.name)).not.toContain('📺 Where to watch');
  });

  test('a description past Discord\'s field limit no longer fails the request', async () => {
    await guildConfig.saveGuildConfig(GUILD, { eventRequests: { enabled: true, moderationChannel: 'mod-1', streaming: { enabled: false } } });
    const res = await submit('Long One', 'y'.repeat(3000));
    expect(res.status).toBe(200);
    expect(fields().find(f => f.name === '📝 Description').value).toHaveLength(1024);
  });
});

describe('/eggshen-config-events event-requests streaming', () => {
  let discord;
  let events;
  beforeEach(async () => {
    const { FakeDiscord } = await import('./harness/fakeDiscord.js');
    events = await import('../src/commands/eggshen-config-events.js');
    discord = new FakeDiscord({ guildId: GUILD });
    discord.addUser('admin', { admin: true });
    discord.addUser('member');
  });
  const run = async (userId, options = {}) => {
    const i = discord.command(userId, 'eggshen-config-events', { group: 'event-requests', subcommand: 'streaming', options });
    await events.execute(i);
    return i.replyMessage.content;
  };

  test('shows the default; sets a list in order; flags a name it doesn\'t know; "default" restores', async () => {
    expect(await run('admin')).toContain('• Services, in this order: Shudder, AMC+, Tubi, Plex, Roku, Prime Video, Hulu, Peacock, Hoopla');

    const set = await run('admin', { services: 'Netflix, Shuder, Tubi' });
    expect(set).toContain('✅ **Where-to-watch line saved**');
    expect(set).toContain('• Services, in this order: Netflix, Shuder, Tubi');
    expect(set).toContain('⚠️ Not a service I know: Shuder.');
    expect((await guildConfig.loadGuildConfig(GUILD)).eventRequests.streaming).toEqual({ enabled: true, services: ['Netflix', 'Shuder', 'Tubi'] });

    await run('admin', { enabled: false });
    expect((await guildConfig.loadGuildConfig(GUILD)).eventRequests.streaming).toEqual({ enabled: false, services: ['Netflix', 'Shuder', 'Tubi'] });

    await run('admin', { services: 'default' });
    expect(streaming.getStreamingSettings(await guildConfig.loadGuildConfig(GUILD)).services[0]).toBe('Shudder');
  });

  test('members can\'t change it', async () => {
    expect(await run('member', { enabled: false })).toMatch(/need Administrator/);
    expect((await guildConfig.loadGuildConfig(GUILD)).eventRequests?.streaming).toBeUndefined();
  });
});

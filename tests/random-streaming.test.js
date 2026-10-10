/**
 * /random movie|tv streaming: — only titles on the services named.
 *
 * Two TMDB behaviors this has to get right, both silent when wrong:
 * - `with_watch_providers` without `watch_region` is ignored outright
 *   (Shudder alone: 20,001 results with no region, the unfiltered count;
 *   761 with US). A missing region looks exactly like a working filter.
 * - One service is listed once per storefront ("Shudder", "Shudder Amazon
 *   Channel", "Shudder Apple TV channel"). Asking for Shudder has to send
 *   all three, or most of what's on Shudder via Prime never comes up.
 *
 * The provider list is a recorded subset of TMDB's real US list
 * (tests/fixtures/tmdb-watch-providers-movie-us.json), so the grouping is
 * tested against the names TMDB actually uses, misspellings included.
 *
 * Run with: npm test -- tests/random-streaming.test.js
 */

import { describe, test, expect, jest, beforeAll, beforeEach } from '@jest/globals';
import fs from 'fs';

const PROVIDERS = JSON.parse(fs.readFileSync(new URL('./fixtures/tmdb-watch-providers-movie-us.json', import.meta.url), 'utf8'));
const idOf = (name) => PROVIDERS.results.find(p => p.provider_name === name).provider_id;

const mockGet = jest.fn();
jest.unstable_mockModule('axios', () => ({
  default: { create: () => ({ get: mockGet, post: jest.fn() }) },
}));

const mockLoadGuildConfig = jest.fn();
jest.unstable_mockModule('../src/utils/guildConfig.js', () => ({
  getEpisodeBufferMinutes: jest.fn(() => 5),
  getAutoDetectMode: jest.fn().mockReturnValue('ask'),
  getEnabledServices: jest.fn().mockResolvedValue({}),
  getEmojis: jest.fn().mockResolvedValue({}),
  loadGuildConfig: mockLoadGuildConfig,
  canUseCommand: jest.fn().mockResolvedValue(true),
}));

jest.unstable_mockModule('../src/utils/embedBuilder.js', () => ({
  createDetailedEmbed: jest.fn(async ({ tmdb }) => ({ embeds: [{ title: tmdb.title || tmdb.name }] })),
}));
jest.unstable_mockModule('../src/utils/statsTracker.js', () => ({ trackSearch: jest.fn() }));
jest.unstable_mockModule('../src/services/omdbService.js', () => ({ getOMDBData: jest.fn() }));
jest.unstable_mockModule('../src/services/traktService.js', () => ({ getMovieRating: jest.fn(), getShowRating: jest.fn() }));
jest.unstable_mockModule('../src/services/letterboxdService.js', () => ({ getLetterboxdRating: jest.fn() }));
jest.unstable_mockModule('../src/services/watchmodeService.js', () => ({ getWatchmodeProvidersByImdbId: jest.fn() }));

let tmdb;
let random;

beforeAll(async () => {
  tmdb = await import('../src/services/tmdbService.js');
  random = await import('../src/commands/random.js');
});

/** Fake TMDB: the recorded provider list, one discover hit, its details. */
function routeTmdb({ discoverResults = [{ id: 948, title: 'Halloween' }] } = {}) {
  mockGet.mockImplementation(async (url) => {
    if (url.startsWith('/watch/providers/')) return { data: PROVIDERS };
    if (url.startsWith('/discover/')) return { data: { total_pages: discoverResults.length ? 1 : 0, results: discoverResults } };
    if (/^\/(movie|tv)\/\d+$/.test(url)) return { data: { id: 948, title: 'Halloween', name: 'Halloween', external_ids: {} } };
    return { data: { results: {} } };
  });
}

/** The params of every /discover request made */
const discoverCalls = () => mockGet.mock.calls.filter(([url]) => url.startsWith('/discover/')).map(([, o]) => o.params);

function command(subcommand, options = {}) {
  return {
    guildId: 'g1',
    user: { id: 'u1', username: 'tester' },
    member: { permissions: { has: () => false } },
    options: {
      getSubcommand: () => subcommand,
      getString: (name) => options[name] ?? null,
    },
    deferReply: jest.fn(),
    editReply: jest.fn(),
    reply: jest.fn(),
  };
}

function typing(subcommand, value) {
  const i = {
    guildId: 'g1',
    options: {
      getSubcommand: () => subcommand,
      getFocused: () => ({ name: 'streaming', value }),
    },
    respond: jest.fn(async (choices) => { i.choices = choices; }),
  };
  return i;
}

beforeEach(() => {
  mockGet.mockReset();
  tmdb._resetProviderListCache();
  mockLoadGuildConfig.mockResolvedValue({ region: 'US' });
  routeTmdb();
});

describe('the discover request', () => {
  test.each(['discoverRandomMovie', 'discoverRandomTV'])('%s sends the providers with their region', async (fn) => {
    await tmdb[fn]({ providerIds: [99, 204], region: 'CA' });
    const [params] = discoverCalls();
    expect(params.with_watch_providers).toBe('99|204'); // pipe = on any of them
    expect(params.watch_region).toBe('CA');
  });

  test('no streaming filter sends neither parameter', async () => {
    await tmdb.discoverRandomMovie({ genre: '27' });
    const [params] = discoverCalls();
    expect(params).not.toHaveProperty('with_watch_providers');
    expect(params).not.toHaveProperty('watch_region');
  });
});

describe('resolving names to services', () => {
  test('a service includes its Amazon and Apple TV channels', async () => {
    const r = await tmdb.resolveStreamingServices('movie', 'US', 'Shudder');
    expect(r.unknown).toEqual([]);
    expect(r.ids.sort()).toEqual([
      idOf('Shudder'), idOf('Shudder Amazon Channel'), idOf('Shudder Apple TV channel'),
    ].sort());
  });

  test('tiers fold in too, and "+" and "Plus" are the same', async () => {
    const paramount = await tmdb.resolveStreamingServices('movie', 'US', 'paramount+');
    expect(paramount.ids.sort()).toEqual([
      idOf('Paramount Plus Premium'), idOf('Paramount Plus Essential'), idOf('Paramount+ Amazon Channel'),
    ].sort());

    const peacock = await tmdb.resolveStreamingServices('movie', 'US', 'Peacock');
    expect(peacock.ids.sort()).toEqual([idOf('Peacock Premium'), idOf('Peacock Premium Plus')].sort());
  });

  test('AMC+ and AMC stay apart', async () => {
    const amcPlus = await tmdb.resolveStreamingServices('movie', 'US', 'AMC+');
    expect(amcPlus.ids).not.toContain(idOf('AMC'));
    expect(amcPlus.ids).toContain(idOf('AMC Plus Apple TV channel'));
    const amc = await tmdb.resolveStreamingServices('movie', 'US', 'AMC');
    expect(amc.ids).toEqual([idOf('AMC')]);
  });

  test('several names are a union, and a unique prefix is enough ("Tubi" → "Tubi TV")', async () => {
    const r = await tmdb.resolveStreamingServices('movie', 'US', ' shudder ,Tubi ');
    expect(r.services.map(s => s.label)).toEqual(['Shudder', 'Tubi TV']);
    expect(r.ids).toContain(idOf('Tubi TV'));
    expect(r.ids).toHaveLength(4);
  });

  test('an unknown or ambiguous name is reported, not dropped', async () => {
    const r = await tmdb.resolveStreamingServices('movie', 'US', 'Shudder, Netflx, A');
    expect(r.unknown).toEqual(['Netflx', 'A']); // "A" begins AMC, AMC+, Amazon…
  });

  test('the provider list is fetched once, not per keystroke', async () => {
    await tmdb.getStreamingServices('movie', 'US');
    await tmdb.getStreamingServices('movie', 'US');
    expect(mockGet.mock.calls.filter(([url]) => url.startsWith('/watch/providers/'))).toHaveLength(1);
  });
});

describe('/random movie streaming: end to end', () => {
  test('the picked suggestion goes back in and filters the discover call', async () => {
    // What the user sees while typing the second name…
    const ac = typing('movie', 'Shudder, tu');
    await random.autocomplete(ac);
    const pick = ac.choices.find(c => c.name === 'Shudder, Tubi TV');
    expect(pick).toBeDefined();

    // …and that choice's own value, submitted as the option
    const i = command('movie', { streaming: pick.value, genre: '27' });
    await random.execute(i);

    const [params] = discoverCalls();
    expect(params.with_watch_providers.split('|').map(Number).sort()).toEqual([
      idOf('Shudder'), idOf('Shudder Amazon Channel'), idOf('Shudder Apple TV channel'), idOf('Tubi TV'),
    ].sort());
    expect(params.watch_region).toBe('US');
    expect(params.with_genres).toBe('27');
    expect(i.editReply.mock.calls.at(-1)[0].embeds[0].title).toBe('Halloween');
  });

  test('uses the server\'s region', async () => {
    mockLoadGuildConfig.mockResolvedValue({ region: 'GB' });
    await random.execute(command('tv', { streaming: 'Shudder' }));
    expect(mockGet.mock.calls.find(([url]) => url === '/watch/providers/tv')[1].params.watch_region).toBe('GB');
    expect(discoverCalls()[0].watch_region).toBe('GB');
  });

  test('an unknown service is named back and nothing is searched', async () => {
    const i = command('movie', { streaming: 'Shudder, Shuder Plus' });
    await random.execute(i);
    const { content } = i.editReply.mock.calls.at(-1)[0];
    expect(content).toContain('"Shuder Plus"');
    expect(content).toContain('in US');
    expect(discoverCalls()).toHaveLength(0);
  });

  test('nothing found says which services were searched', async () => {
    routeTmdb({ discoverResults: [] });
    const i = command('tv', { streaming: 'Shudder, Tubi, Peacock' });
    await random.execute(i);
    expect(i.editReply.mock.calls.at(-1)[0].content)
      .toBe('Could not find a random TV show on Shudder, Tubi TV or Peacock with those filters. Try different options.');
  });
});

describe('suggestions', () => {
  test('an empty box lists services by prominence, each once', async () => {
    const ac = typing('movie', '');
    await random.autocomplete(ac);
    const names = ac.choices.map(c => c.name);
    expect(names[0]).toBe('Netflix');
    expect(names.filter(n => n === 'Shudder')).toHaveLength(1);
    expect(names.some(n => /(amazon|apple tv) channel/i.test(n))).toBe(false); // "The Roku Channel" is a real name
    expect(ac.choices.length).toBeLessThanOrEqual(25);
  });

  test('names already in the list aren\'t offered again', async () => {
    const ac = typing('movie', 'Shudder, ');
    await random.autocomplete(ac);
    expect(ac.choices.map(c => c.name)).not.toContain('Shudder, Shudder');
    expect(ac.choices.every(c => c.value.startsWith('Shudder, '))).toBe(true);
  });

  test('a choice too long for Discord is left out rather than cut', async () => {
    const ac = typing('movie', `${'x'.repeat(92)}, Shu`); // + ", Shudder" = 101
    await random.autocomplete(ac);
    expect(ac.choices).toEqual([]);
  });
});

test('both subcommands offer the option with autocomplete', () => {
  const json = random.data.toJSON();
  for (const name of ['movie', 'tv']) {
    const opt = json.options.find(o => o.name === name).options.find(o => o.name === 'streaming');
    expect(opt).toMatchObject({ autocomplete: true, required: false });
  }
});

/**
 * Scheduled watch-party announcements and the automatic "starting soon"
 * card, end to end: /announce schedule's autocomplete builds the event
 * choices, its OWN option value is fed back into the command, and scheduler
 * passes at controlled times decide what posts.
 *
 * Run with: npm test -- tests/announce-schedule.test.js
 */

import { describe, test, expect, jest, beforeAll, beforeEach } from '@jest/globals';

const mockSearchMovies = jest.fn();
const mockSearchTVShows = jest.fn();
const mockGetMovieDetails = jest.fn();
const mockGetTVShowDetails = jest.fn();

jest.unstable_mockModule('../src/services/tmdbService.js', () => ({
  getPosterUrl: jest.fn(p => (p ? `https://image.tmdb.org/t/p/w342${p}` : null)),
  getBackdropUrl: jest.fn(p => (p ? `https://image.tmdb.org/t/p/w780${p}` : null)),
  searchMovies: mockSearchMovies,
  searchTVShows: mockSearchTVShows,
  getMovieDetails: mockGetMovieDetails,
  getTVShowDetails: mockGetTVShowDetails,
  getUnifiedMovieWatchProviders: jest.fn().mockResolvedValue({ flatrate: [{ provider_name: 'Shudder' }] }),
  getUnifiedTVWatchProviders: jest.fn().mockResolvedValue(null),
  getMovieAlternativeTitles: jest.fn().mockResolvedValue([]),
  getTVAlternativeTitles: jest.fn().mockResolvedValue([]),
}));

jest.unstable_mockModule('../src/services/aiService.js', () => ({
  hybridSearch: jest.fn(async (query, searchFn) => searchFn(query)),
  pickExactTitleMatch: jest.fn((results, q) => results.find(r => (r.title || r.name || '').toLowerCase() === String(q).toLowerCase()) || null),
  generateAnnouncementText: jest.fn().mockResolvedValue(null), // template text
}));

let announce, scheduler, store, upcoming, guildConfig;

const MIN = 60_000;
const HOUR = 60 * MIN;
const NOW = Date.parse('2026-10-31T18:00:00Z');
const STATUS = { Scheduled: 1, Active: 2, Completed: 3, Canceled: 4 };

beforeAll(async () => {
  announce = await import('../src/commands/announce.js');
  scheduler = await import('../src/utils/announcementScheduler.js');
  store = await import('../src/utils/announcementStore.js');
  upcoming = await import('../src/utils/upcomingEvents.js');
  guildConfig = await import('../src/utils/guildConfig.js');
});

let world;

/** A server with channels and scheduled events, and a client that can reach it. */
function makeWorld() {
  const events = new Map();
  const channels = new Map();
  const guild = {
    id: 'g1',
    members: { me: {} },
    channels: { cache: channels },
    scheduledEvents: { fetch: jest.fn(async () => new Map(events)) },
  };
  const client = {
    guilds: { cache: new Map([['g1', guild]]), fetch: async (id) => (id === 'g1' ? guild : null) },
    channels: {
      fetch: async (id) => {
        if (!channels.has(id)) throw new Error('Unknown Channel');
        return channels.get(id);
      },
    },
  };
  const addChannel = (id, name = id) => {
    const ch = {
      id,
      name,
      toString: () => `<#${id}>`,
      posts: [],
      send: jest.fn(async (payload) => { ch.posts.push(payload); return { id: `msg-${ch.posts.length}` }; }),
      permissionsFor: () => ({ has: () => true }),
    };
    channels.set(id, ch);
    return ch;
  };
  const addEvent = (id, name, startsAt, extra = {}) => {
    const ev = {
      id,
      guildId: 'g1',
      name,
      description: null,
      status: STATUS.Scheduled,
      scheduledStartTimestamp: startsAt,
      channelId: 'voice-1',
      entityMetadata: null,
      url: `https://discord.com/events/g1/${id}`,
      coverImageURL: () => null,
      ...extra,
    };
    events.set(id, ev);
    return ev;
  };
  return { guild, client, events, channels, addChannel, addEvent };
}

function interaction({ subcommand = 'schedule', options = {}, admin = true, channel, focused } = {}) {
  const i = {
    guildId: 'g1',
    guild: world.guild,
    channel: channel || world.channels.get('here'),
    member: { permissions: { has: () => admin } },
    user: { id: 'mod-1', username: 'mod' },
    options: {
      getSubcommand: () => subcommand,
      getString: (n) => options[n] ?? null,
      getInteger: (n) => options[n] ?? null,
      getChannel: (n) => options[n] ?? null,
      getRole: (n) => options[n] ?? null,
      getFocused: () => focused,
    },
    reply: jest.fn(async (p) => { i.replied = p; }),
    deferReply: jest.fn(async () => {}),
    editReply: jest.fn(async (p) => { i.edited = p; }),
    respond: jest.fn(async (choices) => { i.choices = choices; }),
  };
  return i;
}

const text = (i) => (i.edited?.content ?? i.replied?.content ?? '');
const tick = (now) => scheduler.checkAnnouncements(world.client, now, { only: 'g1' });

beforeEach(async () => {
  jest.restoreAllMocks();
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  store._resetAnnouncements();
  scheduler._resetAnnouncementScheduler();
  upcoming._clearEventCache();
  world = makeWorld();
  world.addChannel('here', 'general');
  world.addChannel('announcements', 'announcements');
  world.addChannel('voice-1', 'Movie Night');
  const cfg = await guildConfig.loadGuildConfig('g1');
  cfg.announceStartingSoon = true;
  await guildConfig.saveGuildConfig('g1', cfg);
  mockSearchMovies.mockReset().mockResolvedValue([{ id: 10331, title: 'Night of the Living Dead' }]);
  mockSearchTVShows.mockReset().mockResolvedValue([]);
  mockGetMovieDetails.mockReset().mockResolvedValue({
    id: 10331, title: 'Night of the Living Dead', overview: 'Ghouls.', backdrop_path: '/notld.jpg', external_ids: {},
  });
});

/** Pick the event the way a moderator does: from autocomplete's own choices. */
async function pickEvent(typed = '') {
  const ac = interaction({ focused: { name: 'event', value: typed } });
  await announce.autocomplete(ac);
  return ac.choices;
}

describe('/announce schedule', () => {
  test('autocomplete lists upcoming events, soonest first, and filters by what\'s typed', async () => {
    world.addEvent('e2', 'Halloween (1978)', NOW + 5 * HOUR);
    world.addEvent('e1', 'Night of the Living Dead', NOW + 2 * HOUR);
    world.addEvent('past', 'Already Over', NOW - HOUR);
    world.addEvent('gone', 'Cancelled Thing', NOW + HOUR, { status: STATUS.Canceled });

    const choices = await pickEvent();
    expect(choices.map(c => c.value)).toEqual(['e1', 'e2']);
    expect(choices[0].name).toBe('Night of the Living Dead · in 2h (Oct 31, 8:00 PM UTC)');
    expect(choices.every(c => c.name.length <= 100)).toBe(true);

    upcoming._clearEventCache();
    expect((await pickEvent('hallo')).map(c => c.value)).toEqual(['e2']);
  });

  test('posts the full card at its time before the event, in the chosen channel', async () => {
    world.addEvent('e1', 'Night of the Living Dead (1968)', NOW + 3 * HOUR);
    const [choice] = await pickEvent('night');

    const cmd = interaction({ options: { event: choice.value, hours: 1, minutes: 30, channel: world.channels.get('announcements'), role: { id: 'r-horror' } } });
    await announce.execute(cmd);
    expect(text(cmd)).toContain('✅ Scheduled');
    expect(text(cmd)).toContain(`<t:${(NOW + 90 * MIN) / 1000}:F>`);
    expect(text(cmd)).toContain('1h 30m before');

    const ann = world.channels.get('announcements');
    await tick(NOW + 89 * MIN);
    expect(ann.posts).toHaveLength(0);

    await tick(NOW + 90 * MIN);
    expect(ann.posts).toHaveLength(1);
    const post = ann.posts[0];
    // The year a host adds to an event name is dropped before searching TMDB
    expect(mockSearchMovies).toHaveBeenCalledWith('Night of the Living Dead');
    expect(post.content).toContain('<@&r-horror>');
    expect(post.allowedMentions).toEqual({ roles: ['r-horror'] });
    expect(post.content).toContain('https://discord.com/events/g1/e1');
    const start = (NOW + 3 * HOUR) / 1000;
    const card = post.embeds[0].toJSON();
    expect(card.fields.find(f => f.name === '🕒 Starts').value).toBe(`<t:${start}:F> (<t:${start}:R>)`);
    expect(card.fields.find(f => f.name === '📺 Where to watch').value).toContain('Shudder');

    await tick(NOW + 91 * MIN);
    expect(ann.posts).toHaveLength(1); // once
    expect(store.listAnnouncements('g1')[0].status).toBe('posted');
  });

  test('follows the event when it\'s moved', async () => {
    const ev = world.addEvent('e1', 'Night of the Living Dead', NOW + 3 * HOUR);
    const [choice] = await pickEvent();
    await announce.execute(interaction({ options: { event: choice.value, hours: 1, channel: world.channels.get('announcements') } }));

    ev.scheduledStartTimestamp = NOW + 5 * HOUR; // pushed back two hours
    await tick(NOW + 2 * HOUR); // the original posting time
    expect(world.channels.get('announcements').posts).toHaveLength(0);

    await tick(NOW + 4 * HOUR);
    expect(world.channels.get('announcements').posts).toHaveLength(1);
  });

  test('two overlapping passes post it once', async () => {
    // A slow pass still running when the next minute's starts
    world.addEvent('e1', 'Night of the Living Dead', NOW + 3 * HOUR);
    const [choice] = await pickEvent();
    await announce.execute(interaction({ options: { event: choice.value, hours: 1, channel: world.channels.get('announcements') } }));

    await Promise.all([tick(NOW + 2 * HOUR), tick(NOW + 2 * HOUR)]);
    expect(world.channels.get('announcements').posts).toHaveLength(1);
  });

  test('is cancelled with its event', async () => {
    world.addEvent('e1', 'Night of the Living Dead', NOW + 3 * HOUR);
    const [choice] = await pickEvent();
    await announce.execute(interaction({ options: { event: choice.value, hours: 1, channel: world.channels.get('announcements') } }));

    world.events.delete('e1');
    await tick(NOW + 2 * HOUR);
    expect(world.channels.get('announcements').posts).toHaveLength(0);
    expect(store.listAnnouncements('g1')[0]).toMatchObject({ status: 'cancelled' });
  });

  test('is skipped, not posted late, if the bot was down past the start', async () => {
    world.addEvent('e1', 'Night of the Living Dead', NOW + 3 * HOUR);
    const [choice] = await pickEvent();
    await announce.execute(interaction({ options: { event: choice.value, hours: 1, channel: world.channels.get('announcements') } }));

    await tick(NOW + 3 * HOUR + 5 * MIN);
    expect(world.channels.get('announcements').posts).toHaveLength(0);
    expect(store.listAnnouncements('g1')[0].status).toMatch(/missed/);
  });

  test('refuses a time that has already passed', async () => {
    world.addEvent('e1', 'Night of the Living Dead', NOW + 30 * MIN);
    const [choice] = await pickEvent();
    const cmd = interaction({ options: { event: choice.value, hours: 1 } });
    await announce.execute(cmd);
    expect(text(cmd)).toContain('already passed');
    expect(store.listAnnouncements('g1')).toHaveLength(0);
  });

  test('says so when the event name isn\'t a findable title, and suggests title1', async () => {
    world.addEvent('e1', 'Spooky Saturday', NOW + 3 * HOUR);
    mockSearchMovies.mockResolvedValue([]);
    const [choice] = await pickEvent();
    const cmd = interaction({ options: { event: choice.value, hours: 1 } });
    await announce.execute(cmd);
    expect(text(cmd)).toContain('title1');
    expect(store.listAnnouncements('g1')).toHaveLength(0);
  });

  test('a scheduled one can be cancelled from the list, by a moderator only', async () => {
    world.addEvent('e1', 'Night of the Living Dead', NOW + 3 * HOUR);
    const [choice] = await pickEvent();
    await announce.execute(interaction({ options: { event: choice.value, hours: 1, channel: world.channels.get('announcements') } }));

    const list = interaction({ subcommand: 'scheduled' });
    await announce.execute(list);
    const buttonId = list.replied.components[0].toJSON().components[0].custom_id;
    expect(buttonId).toMatch(/^ann_cancel_/);

    const stranger = { customId: buttonId, guildId: 'g1', member: { permissions: { has: () => false } }, reply: jest.fn(), update: jest.fn() };
    await announce.handleCancelButton(stranger);
    expect(stranger.update).not.toHaveBeenCalled();
    expect(store.listAnnouncements('g1')[0].status).toBe('pending');

    const mod = { customId: buttonId, guildId: 'g1', member: { permissions: { has: () => true } }, reply: jest.fn(), update: jest.fn() };
    await announce.handleCancelButton(mod);
    expect(mod.update.mock.calls[0][0].embeds[0].toJSON().description).toContain('Cancelled the announcement');

    await tick(NOW + 2 * HOUR);
    expect(world.channels.get('announcements').posts).toHaveLength(0);
  });
});

describe('the automatic "starting soon" card', () => {
  test('posts once, 10 minutes before every event, in the event\'s own channel', async () => {
    world.addEvent('e1', 'Night of the Living Dead', NOW + 30 * MIN);
    const voice = world.channels.get('voice-1');

    await tick(NOW + 19 * MIN);
    expect(voice.posts).toHaveLength(0);

    await tick(NOW + 20 * MIN);
    expect(voice.posts).toHaveLength(1);
    const start = (NOW + 30 * MIN) / 1000;
    expect(voice.posts[0].content).toBe(`🎬 **Night of the Living Dead** starts <t:${start}:R>!`);
    expect(voice.posts[0].embeds[0].toJSON().url).toBe('https://discord.com/events/g1/e1');

    await tick(NOW + 21 * MIN);
    await tick(NOW + 29 * MIN);
    expect(voice.posts).toHaveLength(1);
  });

  test('finds the channel named in an external event\'s location', async () => {
    world.addChannel('123456789012345678', 'watch-party');
    world.addEvent('e1', 'Halloween', NOW + 5 * MIN, { channelId: null, entityMetadata: { location: 'In <#123456789012345678>' } });
    await tick(NOW);
    expect(world.channels.get('123456789012345678').posts).toHaveLength(1);
  });

  test('a moved event gets a card for its new start', async () => {
    const ev = world.addEvent('e1', 'Halloween', NOW + 5 * MIN);
    await tick(NOW);
    ev.scheduledStartTimestamp = NOW + 65 * MIN;
    await tick(NOW + 56 * MIN);
    expect(world.channels.get('voice-1').posts).toHaveLength(2);
  });

  test('can be turned off for the server', async () => {
    const cfg = await guildConfig.loadGuildConfig('g1');
    cfg.announceStartingSoon = false;
    await guildConfig.saveGuildConfig('g1', cfg);
    world.addEvent('e1', 'Halloween', NOW + 5 * MIN);
    // A queued announcement for a later event keeps the server in the
    // scheduler's pass, so this checks the switch itself
    world.addEvent('e2', 'Night of the Living Dead', NOW + 5 * HOUR);
    const [later] = await pickEvent('night');
    await announce.execute(interaction({ options: { event: later.value, hours: 1, channel: world.channels.get('announcements') } }));
    await tick(NOW);
    expect(world.channels.get('voice-1').posts).toHaveLength(0);
  });

  test('is on for a server whose config predates the switch', () => {
    expect(guildConfig.getStartingSoonEnabled({})).toBe(true);
    expect(guildConfig.getStartingSoonEnabled({ announceStartingSoon: false })).toBe(false);
  });
});

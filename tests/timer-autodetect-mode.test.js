/**
 * Tests for watchPartyAutoDetectMode — how much /timer start does on its own
 * with a watch-party channel's active scheduled event.
 *
 * The default, 'ask', exists because watch-party hosts were abandoning this
 * bot's timer rather than work through a 25-option TMDB picker. The lookup
 * itself is worth keeping — for a movie it produces a correct runtime with no
 * input at all — so 'ask' keeps it and only replaces the *picker* with a
 * two-button choice when the title genuinely can't be pinned down.
 *
 * Run with: npm test -- tests/timer-autodetect-mode.test.js
 */

import { describe, test, expect, jest, beforeAll, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const mockSearchMovies = jest.fn();
const mockSearchTVShows = jest.fn();
const mockGetMovieDetails = jest.fn();
const mockGetTVShowDetails = jest.fn();
const mockSearchBoardGames = jest.fn();
const mockGetBoardGameDetails = jest.fn();
const mockGetSeasonDetails = jest.fn();

jest.unstable_mockModule('../src/services/tmdbService.js', () => ({
  getPosterUrl: jest.fn(() => null),
  searchMovies: mockSearchMovies,
  searchTVShows: mockSearchTVShows,
  getMovieDetails: mockGetMovieDetails,
  getTVShowDetails: mockGetTVShowDetails,
  getMovieAlternativeTitles: jest.fn().mockResolvedValue([]),
  getTVAlternativeTitles: jest.fn().mockResolvedValue([]),
  getSeasonDetails: mockGetSeasonDetails,
  // The real implementation — the range path depends on it summing properly.
  sumEpisodeRuntimes: (seasonDetails, episodeStart, episodeEnd, fallback) => {
    const episodes = (seasonDetails?.episodes || []).filter(
      ep => ep.episode_number >= episodeStart && ep.episode_number <= episodeEnd
    );
    if (episodes.length === 0) return null;
    const breakdown = episodes.map(ep => ({
      episodeNumber: ep.episode_number,
      runtime: ep.runtime ?? fallback ?? null,
      estimated: ep.runtime == null,
    }));
    if (breakdown.some(ep => ep.runtime == null)) return null;
    return {
      episodeCount: breakdown.length,
      totalRuntime: breakdown.reduce((sum, ep) => sum + ep.runtime, 0),
      breakdown,
    };
  },
}));

jest.unstable_mockModule('../src/services/bggService.js', () => ({
  searchBoardGames: mockSearchBoardGames,
  getBoardGameDetails: mockGetBoardGameDetails,
}));

// Only loadGuildConfig is faked (it does real fs I/O, which stalls under
// fake timers). getAutoDetectMode is the REAL implementation, so the
// normalization tests below exercise production behavior rather than a stub.
const mockLoadGuildConfig = jest.fn();
const realGuildConfig = await import('../src/utils/guildConfig.js');

jest.unstable_mockModule('../src/utils/guildConfig.js', () => ({
  ...realGuildConfig,
  loadGuildConfig: mockLoadGuildConfig,
}));

let execute;
let getTimerStatus, clearAllTimers;
const { getAutoDetectMode } = realGuildConfig;

const TIMERS_FILE = process.env.ACTIVE_TIMERS_FILE || path.join(process.cwd(), 'active_timers.json');
const WATCH_PARTY_CHANNEL = 'channel-1';

function cleanupTimerFile() {
  if (fs.existsSync(TIMERS_FILE)) fs.unlinkSync(TIMERS_FILE);
}

beforeAll(async () => {
  ({ execute } = await import('../src/commands/timer.js'));
  ({ getTimerStatus, clearAllTimers } = await import('../src/utils/timerManager.js'));
});

/** An Active scheduled event bound directly to the watch-party channel. */
function makeEvent({ name, description = null }) {
  return {
    name,
    description,
    status: 2, // GuildScheduledEventStatus.Active
    channelId: WATCH_PARTY_CHANNEL,
    entityMetadata: null,
  };
}

function makeGuild(events = []) {
  const collection = new Map(events.map((e, i) => [String(i), e]));
  collection.filter = function (fn) {
    return new Map([...this.entries()].filter(([k, v]) => fn(v, k)));
  };
  return {
    scheduledEvents: { fetch: jest.fn().mockResolvedValue(collection) },
    channels: { cache: new Map() },
  };
}

function makeInteraction({ event = null, guildConfig = {}, label = null } = {}) {
  const message = { edit: jest.fn().mockResolvedValue(undefined) };
  return {
    channelId: WATCH_PARTY_CHANNEL,
    guildId: 'guild-1',
    guild: makeGuild(event ? [event] : []),
    channel: { id: WATCH_PARTY_CHANNEL, send: jest.fn().mockResolvedValue(message) },
    client: {},
    user: { id: 'user-1', username: 'tester' },
    options: {
      getSubcommand: () => 'start',
      getString: (name) => (name === 'label' ? label : null),
      getInteger: () => null,
    },
    deferReply: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    followUp: jest.fn().mockResolvedValue(undefined),
    _guildConfig: guildConfig,
  };
}

/** Config with the channel registered, plus whatever mode is under test. */
function config(extra = {}) {
  return { watchPartyChannels: [WATCH_PARTY_CHANNEL], ...extra };
}

beforeEach(() => {
  clearAllTimers();
  cleanupTimerFile();
  mockSearchMovies.mockReset().mockResolvedValue([]);
  mockSearchTVShows.mockReset().mockResolvedValue([]);
  mockGetMovieDetails.mockReset();
  mockGetTVShowDetails.mockReset();
  mockSearchBoardGames.mockReset().mockResolvedValue([]);
  mockGetBoardGameDetails.mockReset();
  mockGetSeasonDetails.mockReset();
  mockLoadGuildConfig.mockReset();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  clearAllTimers();
  cleanupTimerFile();
});

async function runExecute(interaction) {
  mockLoadGuildConfig.mockResolvedValue(interaction._guildConfig);
  const promise = execute(interaction);
  await jest.advanceTimersByTimeAsync(15000);
  await promise;
}

/** Did the bot interrupt with a picker/confirmation screen? */
function showedAPicker(interaction) {
  return interaction.editReply.mock.calls.some(c => c[0]?.components?.length > 0);
}

describe('getAutoDetectMode normalization', () => {
  test.each([
    ['an unset key (configs predating this feature)', {}, 'ask'],
    ['an explicit ask', { watchPartyAutoDetectMode: 'ask' }, 'ask'],
    ['an explicit full', { watchPartyAutoDetectMode: 'full' }, 'full'],
    ['an explicit off', { watchPartyAutoDetectMode: 'off' }, 'off'],
    ['a hand-edited garbage string', { watchPartyAutoDetectMode: 'yes' }, 'ask'],
    ['a retired mode name', { watchPartyAutoDetectMode: 'title-only' }, 'ask'],
    ['a boolean', { watchPartyAutoDetectMode: true }, 'ask'],
    ['null', { watchPartyAutoDetectMode: null }, 'ask'],
    ['a missing config entirely', null, 'ask'],
    ['an undefined config', undefined, 'ask'],
  ])('%s resolves to %s', (_label, cfg, expected) => {
    expect(getAutoDetectMode(cfg)).toBe(expected);
  });
});

describe("'ask' (the default): look it up, but never trap anyone in a list", () => {
  test('a confidently-matched movie sets its runtime and just starts', async () => {
    // The case the lookup is genuinely good at: one match, real runtime,
    // nobody asked anything. This is why 'ask' keeps the search.
    mockSearchMovies.mockResolvedValue([{ id: 620, title: 'Juno', release_date: '2007-12-05' }]);
    mockGetMovieDetails.mockResolvedValue({ runtime: 96 });

    const interaction = makeInteraction({
      event: makeEvent({ name: 'Juno' }),
      guildConfig: config(),
    });
    await runExecute(interaction);

    const status = getTimerStatus(WATCH_PARTY_CHANNEL);
    expect(status.duration).toBe(106); // 96 + 10 buffer
    expect(status.isFallbackDuration).toBe(false);
    expect(status.label).toBe('Juno');
    expect(showedAPicker(interaction)).toBe(false);
  });

  test('an exact title match resolves without asking, even among siblings', async () => {
    // The production case: TMDB returns the show plus its near-identical
    // siblings, whose similar names drag the semantic gap to nearly zero. An
    // exact title match settles it without a prompt. (Only the TV search
    // returns an exact match here, so there's exactly one.)
    mockSearchTVShows.mockResolvedValue([
      { id: 3, name: 'Tales from the Crypt', first_air_date: '1989-06-10' },
      { id: 4, name: 'Tales from the Cryptkeeper', first_air_date: '1993-09-18' },
    ]);
    mockGetTVShowDetails.mockResolvedValue({ name: 'Tales from the Crypt', episode_run_time: [26] });

    const interaction = makeInteraction({
      event: makeEvent({ name: 'Tales From the Crypt' }),
      guildConfig: config(),
    });
    await runExecute(interaction);

    const status = getTimerStatus(WATCH_PARTY_CHANNEL);
    expect(status).not.toBeNull();
    expect(status.tmdbId).toBe(3); // the show, not the Cryptkeeper spin-off
    expect(showedAPicker(interaction)).toBe(false);
  });

  test('an ambiguous title offers two buttons instead of a picker', async () => {
    mockSearchMovies.mockResolvedValue([
      { id: 1, title: 'Tales from the Crypt', release_date: '1972-03-08' },
      { id: 2, title: 'Demon Knight', release_date: '1995-01-13' },
    ]);
    mockSearchTVShows.mockResolvedValue([
      { id: 3, name: 'Tales from the Crypt', first_air_date: '1989-06-10' },
    ]);

    const interaction = makeInteraction({
      event: makeEvent({ name: 'Tales From the Crypt' }),
      guildConfig: config(),
    });
    await runExecute(interaction);

    expect(getTimerStatus(WATCH_PARTY_CHANNEL)).toBeNull(); // awaiting the choice

    const call = interaction.editReply.mock.calls.find(c => c[0]?.components?.length);
    const buttons = call[0].components[0].components;
    expect(buttons).toHaveLength(2);
    expect(buttons[0].data.custom_id).toBe('timer_start_now_modern');
    expect(buttons[0].data.label).toBe('▶️ Start Now');
    expect(buttons[1].data.custom_id).toBe('timer_lookup_modern');
    expect(buttons[1].data.label).toBe('🔎 Look Up Title');

    // No select menu anywhere — that's the whole point.
    expect(call[0].components.some(row => row.components.some(c => c.options))).toBe(false);
  });

  test('the prompt names the title so the buttons can recover it', async () => {
    mockSearchMovies.mockResolvedValue([
      { id: 1, title: 'Match A', release_date: '2020-01-01' },
      { id: 2, title: 'Match B', release_date: '2021-01-01' },
    ]);

    const interaction = makeInteraction({
      event: makeEvent({ name: 'Match' }),
      guildConfig: config(),
    });
    await runExecute(interaction);

    const call = interaction.editReply.mock.calls.find(c => c[0]?.components?.length);
    expect(call[0].embeds[0].data.title).toBe('🎬 Start the timer for "Match"?');
  });

  test('sums a range split across the event name and description — zero clicks', async () => {
    // The motivating case: name "Tales From the Crypt", description
    // "Season 6 episodes 4 - 7". One show match, so no prompt is needed.
    mockSearchTVShows.mockResolvedValue([
      { id: 3, name: 'Tales from the Crypt', first_air_date: '1989-06-10' },
    ]);
    mockGetTVShowDetails.mockResolvedValue({ name: 'Tales from the Crypt', episode_run_time: [26] });
    mockGetSeasonDetails.mockResolvedValue({
      episodes: [
        { episode_number: 4, runtime: 26 },
        { episode_number: 5, runtime: 26 },
        { episode_number: 6, runtime: 25 },
        { episode_number: 7, runtime: 26 },
      ],
    });

    const interaction = makeInteraction({
      event: makeEvent({ name: 'Tales From the Crypt', description: 'Season 6 episodes 4 - 7' }),
      guildConfig: config(),
    });
    await runExecute(interaction);

    const status = getTimerStatus(WATCH_PARTY_CHANNEL);
    expect(status.duration).toBe(113); // 103 summed + 10 buffer
    expect(status.isFallbackDuration).toBe(false); // a real, informed duration
    expect(status.label).toBe('Tales From the Crypt'); // the friendly event name
    expect(showedAPicker(interaction)).toBe(false);
  });

  test('posts the episode breakdown so the total can be sanity-checked', async () => {
    mockSearchTVShows.mockResolvedValue([
      { id: 3, name: 'Tales from the Crypt', first_air_date: '1989-06-10' },
    ]);
    mockGetTVShowDetails.mockResolvedValue({ name: 'Tales from the Crypt', episode_run_time: [26] });
    mockGetSeasonDetails.mockResolvedValue({
      episodes: [
        { episode_number: 4, runtime: 26 },
        { episode_number: 5, runtime: 26 },
      ],
    });

    const interaction = makeInteraction({
      event: makeEvent({ name: 'Tales From the Crypt', description: 'Season 6 episodes 4 - 5' }),
      guildConfig: config(),
    });
    await runExecute(interaction);

    expect(interaction.followUp).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('2 episodes'),
        ephemeral: true,
      })
    );
  });

  test('an ambiguous show carries its episode range through the buttons', async () => {
    // The range came from the description, so it isn't recoverable from the
    // label — it has to ride along in the button ids or "Look Up Title"
    // would silently lose the episodes the host specified.
    mockSearchTVShows.mockResolvedValue([
      { id: 3, name: 'The Office', first_air_date: '2005-03-24' },
      { id: 4, name: 'The Office', first_air_date: '2001-07-09' },
    ]);

    const interaction = makeInteraction({
      event: makeEvent({ name: 'The Office', description: 'Season 2 episodes 1 - 3' }),
      guildConfig: config(),
    });
    await runExecute(interaction);

    const call = interaction.editReply.mock.calls.find(c => c[0]?.components?.length);
    const buttons = call[0].components[0].components;
    expect(buttons[0].data.custom_id).toBe('timer_start_now_modern_range_2_1_3');
    expect(buttons[1].data.custom_id).toBe('timer_lookup_modern_range_2_1_3');
  });

  test('a manually-typed label goes straight to the picker, no prompt', async () => {
    // The setting governs what the bot does unprompted. Typing a label IS
    // asking for a lookup, so it should not be second-guessed.
    mockSearchMovies.mockResolvedValue([
      { id: 1, title: 'Match A', release_date: '2020-01-01' },
      { id: 2, title: 'Match B', release_date: '2021-01-01' },
    ]);

    const interaction = makeInteraction({ guildConfig: config(), label: 'Match' });
    await runExecute(interaction);

    expect(showedAPicker(interaction)).toBe(true);
    const call = interaction.editReply.mock.calls.find(c => c[0]?.components?.length);
    expect(call[0].components[0].components[0].options[0].data.value).toBe('timer_skip_modern');
  });
});

describe("'full': ambiguity goes straight to the list", () => {
  test('shows the picker rather than the two-button prompt', async () => {
    // No exact title match, so neither the scores nor the exact-match path
    // can resolve it — this is the genuinely ambiguous case.
    mockSearchMovies.mockResolvedValue([
      { id: 1, title: 'Tales from the Crypt: Demon Knight', release_date: '1995-01-13' },
      { id: 2, title: 'Tales from the Cryptkeeper', release_date: '1993-09-18' },
    ]);

    const interaction = makeInteraction({
      event: makeEvent({ name: 'Tales From the Crypt' }),
      guildConfig: config({ watchPartyAutoDetectMode: 'full' }),
    });
    await runExecute(interaction);

    expect(getTimerStatus(WATCH_PARTY_CHANNEL)).toBeNull(); // awaiting a choice
    const call = interaction.editReply.mock.calls.find(c => c[0]?.components?.length);
    const options = call[0].components[0].components[0].options;
    expect(options).toBeDefined();
    // The skip option still leads it.
    expect(options[0].data.value).toBe('timer_skip_modern');
  });

  test('a confident movie match still just starts', async () => {
    mockSearchMovies.mockResolvedValue([{ id: 620, title: 'Juno', release_date: '2007-12-05' }]);
    mockGetMovieDetails.mockResolvedValue({ runtime: 96 });

    const interaction = makeInteraction({
      event: makeEvent({ name: 'Juno' }),
      guildConfig: config({ watchPartyAutoDetectMode: 'full' }),
    });
    await runExecute(interaction);

    expect(getTimerStatus(WATCH_PARTY_CHANNEL).duration).toBe(106);
  });
});

describe("'off': scheduled events are ignored", () => {
  test('starts an unlabeled timer and never fetches events', async () => {
    const interaction = makeInteraction({
      event: makeEvent({ name: 'Tales From the Crypt' }),
      guildConfig: config({ watchPartyAutoDetectMode: 'off' }),
    });
    await runExecute(interaction);

    const status = getTimerStatus(WATCH_PARTY_CHANNEL);
    expect(status).not.toBeNull();
    expect(status.label).toBe('');
    expect(interaction.guild.scheduledEvents.fetch).not.toHaveBeenCalled();
  });
});

describe('channels that are not watch-party channels', () => {
  test('are left alone even in ask mode', async () => {
    const interaction = makeInteraction({
      event: makeEvent({ name: 'Tales From the Crypt' }),
      guildConfig: { watchPartyChannels: ['some-other-channel'] },
    });
    await runExecute(interaction);

    expect(interaction.guild.scheduledEvents.fetch).not.toHaveBeenCalled();
    expect(getTimerStatus(WATCH_PARTY_CHANNEL).label).toBe('');
  });
});

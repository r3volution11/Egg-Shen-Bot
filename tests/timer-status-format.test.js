/**
 * Tests for /timer status's compact display.
 *
 * The status embed used to spread four fields, a description, a footer and a
 * timestamp down the channel for a question people ask in passing ("how far
 * in are we?"). It now answers that in two lines, and reports durations the
 * way a person would say them rather than as H:MM:SS — "2:43:32" reads as a
 * clock time, and "5:32" is ambiguous between hours and minutes.
 *
 * Run with: npm test -- tests/timer-status-format.test.js
 */

import { describe, test, expect, jest, beforeAll, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';

jest.unstable_mockModule('../src/services/tmdbService.js', () => ({
  getPosterUrl: jest.fn(() => null),
  searchMovies: jest.fn().mockResolvedValue([]),
  searchTVShows: jest.fn().mockResolvedValue([]),
  getMovieDetails: jest.fn(),
  getTVShowDetails: jest.fn(),
  getMovieAlternativeTitles: jest.fn().mockResolvedValue([]),
  getTVAlternativeTitles: jest.fn().mockResolvedValue([]),
  getSeasonDetails: jest.fn(),
  sumEpisodeRuntimes: jest.fn(),
}));

jest.unstable_mockModule('../src/services/bggService.js', () => ({
  searchBoardGames: jest.fn().mockResolvedValue([]),
  getBoardGameDetails: jest.fn(),
}));

jest.unstable_mockModule('../src/utils/guildConfig.js', () => ({
  getAutoDetectMode: jest.fn().mockReturnValue('ask'),
  loadGuildConfig: jest.fn().mockResolvedValue({}),
  isAdmin: jest.fn().mockReturnValue(false),
}));

let execute;
let startTimer, pauseTimer, clearAllTimers;
let formatDurationHuman, formatMinutesHuman;

const TIMERS_FILE = process.env.ACTIVE_TIMERS_FILE || path.join(process.cwd(), 'active_timers.json');

function cleanupTimerFile() {
  if (fs.existsSync(TIMERS_FILE)) fs.unlinkSync(TIMERS_FILE);
}

beforeAll(async () => {
  ({ execute } = await import('../src/commands/timer.js'));
  ({ startTimer, pauseTimer, clearAllTimers, formatDurationHuman, formatMinutesHuman } =
    await import('../src/utils/timerManager.js'));
});

beforeEach(() => {
  clearAllTimers();
  cleanupTimerFile();
});

afterEach(() => {
  clearAllTimers();
  cleanupTimerFile();
});

function makeStatusInteraction({ isPublic = false } = {}) {
  return {
    channelId: 'channel-1',
    guildId: 'guild-1',
    options: {
      getSubcommand: () => 'status',
      getBoolean: () => isPublic,
    },
    reply: jest.fn().mockResolvedValue(undefined),
  };
}

async function status(interaction) {
  await execute(interaction);
  return interaction.reply.mock.calls[0][0];
}

describe('formatDurationHuman', () => {
  test.each([
    [0, '0s'],
    [48_000, '48s'],
    [332_000, '5m'],
    [3_600_000, '1h'],
    [9_812_000, '2h 43m'],
    [21_600_000, '6h'],
  ])('%sms reads as %s without seconds', (ms, expected) => {
    expect(formatDurationHuman(ms)).toBe(expected);
  });

  test.each([
    [0, '0s'],
    [48_000, '48s'],
    [60_000, '1m 0s'],
    [332_000, '5m 32s'],
    [3_605_000, '1h 0m 5s'],
    [9_812_000, '2h 43m 32s'],
  ])('%sms reads as %s with seconds', (ms, expected) => {
    expect(formatDurationHuman(ms, { showSeconds: true })).toBe(expected);
  });

  test('keeps the minutes column once hours are shown', () => {
    // "1h 5s" reads as though a column is missing.
    expect(formatDurationHuman(3_605_000, { showSeconds: true })).toBe('1h 0m 5s');
  });

  test('never renders a negative span', () => {
    expect(formatDurationHuman(-5000)).toBe('0s');
  });

  test('formatMinutesHuman converts whole minutes', () => {
    expect(formatMinutesHuman(107)).toBe('1h 47m');
    expect(formatMinutesHuman(360)).toBe('6h');
    expect(formatMinutesHuman(45)).toBe('45m');
  });
});

describe('/timer status is compact', () => {
  test('renders one title line and one stats line, nothing else', async () => {
    startTimer('channel-1', 'user-1', 'tester', 'The Thing', 120, null, false);

    const reply = await status(makeStatusInteraction());
    const embed = reply.embeds[0].data;

    // No fields, no footer, no timestamp — the whole point of the rework.
    expect(embed.fields).toBeUndefined();
    expect(embed.footer).toBeUndefined();
    expect(embed.timestamp).toBeUndefined();
    expect(embed.description.split('\n')).toHaveLength(2);
  });

  test('puts the title in the heading, at a smaller size than an embed title', async () => {
    startTimer('channel-1', 'user-1', 'tester', 'The Thing', 120, null, false);

    const embed = (await status(makeStatusInteraction())).embeds[0].data;

    expect(embed.title).toBeUndefined(); // not a full-size embed title
    expect(embed.description).toContain('### ⏱️ Timer: The Thing');
  });

  test('shows elapsed and duration on the same line', async () => {
    startTimer('channel-1', 'user-1', 'tester', 'The Thing', 107, null, false);

    const embed = (await status(makeStatusInteraction())).embeds[0].data;
    const statsLine = embed.description.split('\n')[1];

    expect(statsLine).toContain('**Elapsed:**');
    expect(statsLine).toContain('**Duration:** 1h 47m');
  });

  test('elapsed carries seconds — people sync a watch party against it', async () => {
    startTimer('channel-1', 'user-1', 'tester', 'The Thing', 107, null, false);

    const embed = (await status(makeStatusInteraction())).embeds[0].data;
    const statsLine = embed.description.split('\n')[1];

    // A freshly started timer reads in seconds.
    expect(statsLine).toMatch(/\*\*Elapsed:\*\* \d+s/);
  });

  test('duration does NOT carry seconds — a runtime is a fixed figure', async () => {
    startTimer('channel-1', 'user-1', 'tester', 'The Thing', 107, null, false);

    const embed = (await status(makeStatusInteraction())).embeds[0].data;
    const durationPart = embed.description.split('**Duration:**')[1];

    expect(durationPart.trim()).toBe('1h 47m');
  });

  test('omits the separator when a timer has no label', async () => {
    startTimer('channel-1', 'user-1', 'tester', '', 60, null, false);

    const embed = (await status(makeStatusInteraction())).embeds[0].data;

    expect(embed.description).toContain('### ⏱️ Timer\n');
    expect(embed.description).not.toContain('Timer:');
  });

  test('reports a paused timer as paused', async () => {
    startTimer('channel-1', 'user-1', 'tester', 'The Thing', 120, null, false);
    pauseTimer('channel-1');

    const embed = (await status(makeStatusInteraction())).embeds[0].data;

    expect(embed.description).toContain('⏸️ Paused');
  });

  test('stays private by default and public on request', async () => {
    startTimer('channel-1', 'user-1', 'tester', 'The Thing', 60, null, false);

    const priv = await status(makeStatusInteraction());
    expect(priv.ephemeral).toBe(true);

    clearAllTimers();
    startTimer('channel-1', 'user-1', 'tester', 'The Thing', 60, null, false);
    const pub = await status(makeStatusInteraction({ isPublic: true }));
    expect(pub.ephemeral).toBe(false);
  });
});

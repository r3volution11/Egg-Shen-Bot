/**
 * Regression test: a fallback duration (nothing typed, nothing auto-detected)
 * must NOT be displayed as if it were a real, known duration — it's an
 * internal auto-stop safety net only. Previously, once fallback durations
 * became real numbers (so they could auto-stop and warn), they started
 * showing up in /timer status and the "Timer Started" embed as e.g.
 * "Total Duration: 360 minutes", which reads as though the bot detected or
 * the user set a 6-hour runtime — it did neither.
 *
 * A real duration (typed manually or auto-detected from a movie/TV/board
 * game runtime) must still display normally.
 *
 * Run with: npx jest tests/timer-fallback-duration-display.test.js --verbose
 */

import { describe, test, expect, jest, beforeAll, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';

jest.unstable_mockModule('../src/services/tmdbService.js', () => ({
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

// loadGuildConfig does real fs I/O; under fake timers that can stall
// indefinitely, so it's mocked to return the default config synchronously
// (matches tests/timer-duration-detection.test.js's pattern).
jest.unstable_mockModule('../src/utils/guildConfig.js', () => ({
  loadGuildConfig: jest.fn().mockResolvedValue({}),
  isAdmin: jest.fn().mockReturnValue(false),
}));

let execute;
let startTimer, getTimerStatus, clearAllTimers;

const TIMERS_FILE = path.join(process.cwd(), 'active_timers.json');

function cleanupTimerFile() {
  if (fs.existsSync(TIMERS_FILE)) fs.unlinkSync(TIMERS_FILE);
}

beforeAll(async () => {
  ({ execute } = await import('../src/commands/timer.js'));
  ({ startTimer, getTimerStatus, clearAllTimers } = await import('../src/utils/timerManager.js'));
});

beforeEach(() => {
  clearAllTimers();
  cleanupTimerFile();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  clearAllTimers();
  cleanupTimerFile();
});

function makeChannel() {
  const message = { edit: jest.fn().mockResolvedValue(undefined) };
  return {
    id: 'channel-1',
    send: jest.fn().mockResolvedValue(message),
  };
}

function makeStartInteraction({ label = null, duration = null, theme = null } = {}) {
  return {
    channelId: 'channel-1',
    guildId: 'guild-1',
    channel: makeChannel(),
    client: {},
    user: { id: 'user-1', username: 'tester' },
    options: {
      getSubcommand: () => 'start',
      getString: (name) => {
        if (name === 'label') return label;
        if (name === 'theme') return theme;
        return null;
      },
      getInteger: (name) => (name === 'duration' ? duration : null),
    },
    deferReply: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    followUp: jest.fn().mockResolvedValue(undefined),
  };
}

async function runStart(interaction) {
  const promise = execute(interaction);
  await jest.advanceTimersByTimeAsync(15000);
  await promise;
  return interaction.channel.send.mock.results[0]?.value;
}

function makeStatusInteraction() {
  return {
    channelId: 'channel-1',
    options: {
      getSubcommand: () => 'status',
      getBoolean: () => false,
    },
    reply: jest.fn().mockResolvedValue(undefined),
  };
}

describe('/timer start — fallback duration is never shown in the "Timer Started" embed', () => {
  test('no label at all: no Duration field, footer says "Use /timer stop"', async () => {
    const interaction = makeStartInteraction({});
    const message = await runStart(interaction);

    const finalCall = message.edit.mock.calls.at(-1)[0];
    const embed = finalCall.embeds[0];
    const fieldNames = (embed.data.fields || []).map(f => f.name);

    expect(fieldNames).not.toContain('Duration');
    expect(embed.data.footer.text).toBe('Use /timer stop to end the timer');

    const status = getTimerStatus('channel-1');
    expect(status.duration).toBe(360);
    expect(status.isFallbackDuration).toBe(true);
  });

  test('a manually-typed duration IS shown normally', async () => {
    const interaction = makeStartInteraction({ duration: 45 });
    const message = await runStart(interaction);

    const finalCall = message.edit.mock.calls.at(-1)[0];
    const embed = finalCall.embeds[0];
    const durationField = (embed.data.fields || []).find(f => f.name === 'Duration');

    expect(durationField).toBeDefined();
    expect(durationField.value).toContain('45 minutes');
    expect(embed.data.footer.text).toBe('Timer will auto-stop when complete');
  });
});

describe('/timer status — fallback duration is never shown', () => {
  test('a fallback-duration timer shows no Remaining Time / Total Duration fields', async () => {
    startTimer('channel-1', 'user-1', 'tester', '', 360, null, true);

    const interaction = makeStatusInteraction();
    await execute(interaction);

    const embed = interaction.reply.mock.calls[0][0].embeds[0];
    const fieldNames = (embed.data.fields || []).map(f => f.name);

    expect(fieldNames).not.toContain('Remaining Time');
    expect(fieldNames).not.toContain('Total Duration');
    expect(embed.data.footer.text).toBe('Use /timer stop to end the timer');
  });

  test('a real duration (not a fallback) still shows Remaining Time / Total Duration', async () => {
    startTimer('channel-1', 'user-1', 'tester', '', 90, null, false);

    const interaction = makeStatusInteraction();
    await execute(interaction);

    const embed = interaction.reply.mock.calls[0][0].embeds[0];
    const fieldNames = (embed.data.fields || []).map(f => f.name);

    expect(fieldNames).toContain('Remaining Time');
    expect(fieldNames).toContain('Total Duration');
    expect(embed.data.footer.text).toBe('Auto-stop enabled');
  });

  test('a timer with autostop disabled (no duration at all) shows no duration fields either', async () => {
    startTimer('channel-1', 'user-1', 'tester', '', null, null, false);

    const interaction = makeStatusInteraction();
    await execute(interaction);

    const embed = interaction.reply.mock.calls[0][0].embeds[0];
    const fieldNames = (embed.data.fields || []).map(f => f.name);

    expect(fieldNames).not.toContain('Remaining Time');
    expect(fieldNames).not.toContain('Total Duration');
  });
});

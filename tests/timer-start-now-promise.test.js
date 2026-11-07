/**
 * The auto-detect prompt's "Start Now" says what pressing it really does.
 *
 * It said the timer "runs until someone stops it", but a timer started with
 * no duration gets the server's fallback limit (6 hours unless the server
 * changed it), and stops on its own there after a warning. Only a server
 * that made such timers unlimited gets one that runs until stopped.
 *
 * The real /timer start offers the prompt for an ambiguous watch-party
 * title; the prompt's own Start Now button is then pressed through the real
 * button handler, and the timer it starts must be the one the prompt
 * described.
 *
 * Run with: npm test -- tests/timer-start-now-promise.test.js
 */

import { describe, test, expect, jest, beforeAll, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';

const mockSearchMovies = jest.fn();
const mockSearchTVShows = jest.fn();

jest.unstable_mockModule('../src/services/tmdbService.js', () => ({
  getPosterUrl: jest.fn(() => null),
  getBackdropUrl: jest.fn(() => null),
  searchMovies: mockSearchMovies,
  searchTVShows: mockSearchTVShows,
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

// Only loadGuildConfig is faked (real fs I/O stalls under fake timers); the
// rest of guildConfig is the real thing
const mockLoadGuildConfig = jest.fn();
const realGuildConfig = await import('../src/utils/guildConfig.js');
jest.unstable_mockModule('../src/utils/guildConfig.js', () => ({
  ...realGuildConfig,
  loadGuildConfig: mockLoadGuildConfig,
}));

const CHANNEL = 'start-now-channel';
const TIMERS_FILE = process.env.ACTIVE_TIMERS_FILE;

let timer;
let handleButtonInteraction;
let getTimerStatus;
let clearAllTimers;

beforeAll(async () => {
  timer = await import('../src/commands/timer.js');
  ({ handleButtonInteraction } = await import('../src/handlers/buttonHandler.js'));
  ({ getTimerStatus, clearAllTimers } = await import('../src/utils/timerManager.js'));
});

beforeEach(() => {
  clearAllTimers();
  if (TIMERS_FILE && fs.existsSync(TIMERS_FILE)) fs.unlinkSync(TIMERS_FILE);
  // Two films and a show share the name: ambiguous, so 'ask' offers the prompt
  mockSearchMovies.mockReset().mockResolvedValue([
    { id: 1, title: 'Tales from the Crypt', release_date: '1972-03-08' },
    { id: 2, title: 'Demon Knight', release_date: '1995-01-13' },
  ]);
  mockSearchTVShows.mockReset().mockResolvedValue([{ id: 3, name: 'Tales from the Crypt', first_air_date: '1989-06-10' }]);
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  clearAllTimers();
  if (TIMERS_FILE && fs.existsSync(TIMERS_FILE)) fs.unlinkSync(TIMERS_FILE);
});

function scheduledEvents() {
  const events = new Map([['1', { name: 'Tales From the Crypt', description: null, status: 2, channelId: CHANNEL, entityMetadata: null }]]);
  events.filter = function filter(fn) { return new Map([...this.entries()].filter(([k, v]) => fn(v, k))); };
  return events;
}

function baseInteraction() {
  return {
    channelId: CHANNEL,
    guildId: 'start-now-guild',
    guild: { scheduledEvents: { fetch: jest.fn().mockResolvedValue(scheduledEvents()) }, channels: { cache: new Map() } },
    channel: { id: CHANNEL, send: jest.fn().mockResolvedValue({ edit: jest.fn().mockResolvedValue(undefined) }) },
    client: {},
    user: { id: 'host', username: 'host' },
    member: { permissions: { has: () => false } },
    deferReply: jest.fn().mockResolvedValue(undefined),
    deferUpdate: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    followUp: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn().mockResolvedValue(undefined),
  };
}

async function settle(promise) {
  await jest.advanceTimersByTimeAsync(15000);
  await promise;
}

/** /timer start in the watch-party channel; returns the prompt it showed */
async function promptFor(guildConfig) {
  mockLoadGuildConfig.mockResolvedValue({ watchPartyChannels: [CHANNEL], ...guildConfig });
  const interaction = {
    ...baseInteraction(),
    options: { getSubcommand: () => 'start', getString: () => null, getInteger: () => null },
  };
  await settle(timer.execute(interaction));
  const call = interaction.editReply.mock.calls.find(c => c[0]?.components?.length);
  expect(call).toBeTruthy();
  return call[0];
}

/** Press the prompt's own Start Now button */
async function pressStartNow(prompt) {
  const button = prompt.components[0].components.find(b => b.data.label === '▶️ Start Now');
  const interaction = {
    ...baseInteraction(),
    customId: button.data.custom_id,
    isButton: () => true,
    message: { embeds: [{ title: prompt.embeds[0].data.title }] },
  };
  await settle(handleButtonInteraction(interaction));
  return getTimerStatus(CHANNEL);
}

describe('▶️ Start Now on the auto-detect prompt', () => {
  test('says the timer stops at the server\'s fallback limit, and it does (default 360 minutes)', async () => {
    const prompt = await promptFor({});
    const text = prompt.embeds[0].data.description;
    expect(text).not.toContain('runs until someone stops it');
    expect(text).toContain('it stops on its own after 360 minutes');

    const status = await pressStartNow(prompt);
    expect(status.duration).toBe(360);
    expect(status.isFallbackDuration).toBe(true); // the warning, with Extend, before it ends
  });

  test('a server with a 240-minute fallback is told 240, and gets 240', async () => {
    const prompt = await promptFor({ maxTimerDurationMinutes: 240 });
    expect(prompt.embeds[0].data.description).toContain('it stops on its own after 240 minutes');
    expect((await pressStartNow(prompt)).duration).toBe(240);
  });

  test('a server that made such timers unlimited is told it runs until stopped, and it has no end', async () => {
    const prompt = await promptFor({ maxTimerDurationUnlimited: true });
    expect(prompt.embeds[0].data.description).toContain('the timer runs until someone stops it');

    const status = await pressStartNow(prompt);
    expect(status).not.toBeNull();
    expect(status.duration ?? null).toBeNull();
    expect(status.isFallbackDuration).toBeFalsy(); // nothing to warn before
  });
});

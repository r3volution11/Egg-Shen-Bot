/**
 * Regression tests: the countdown has to actually be noticeable.
 *
 * The whole timer lifecycle used to happen inside ONE message — a single
 * channel.send followed by seven edits. Discord only notifies on new
 * messages, never on edits, so unless someone happened to be looking at the
 * channel during those six seconds there was no signal at all. People
 * routinely missed both that a watch party had started and that it had
 * finished.
 *
 * The countdown card still edits in place (that animation is the point), but
 * the final seconds and the start itself now post real messages.
 *
 * Run with: npm test -- tests/timer-countdown-visibility.test.js
 */

import { describe, test, expect, jest, beforeAll, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const mockGetMovieDetails = jest.fn();
const mockGetTVShowDetails = jest.fn();
const mockGetPosterUrl = jest.fn();

jest.unstable_mockModule('../src/services/tmdbService.js', () => ({
  getPosterUrl: mockGetPosterUrl,
  searchMovies: jest.fn().mockResolvedValue([]),
  searchTVShows: jest.fn().mockResolvedValue([]),
  getMovieDetails: mockGetMovieDetails,
  getTVShowDetails: mockGetTVShowDetails,
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

let startTimerCountdown;
let clearAllTimers;

const TIMERS_FILE = process.env.ACTIVE_TIMERS_FILE || path.join(process.cwd(), 'active_timers.json');

function cleanupTimerFile() {
  if (fs.existsSync(TIMERS_FILE)) fs.unlinkSync(TIMERS_FILE);
}

beforeAll(async () => {
  ({ startTimerCountdown } = await import('../src/commands/timer.js'));
  ({ clearAllTimers } = await import('../src/utils/timerManager.js'));
});

beforeEach(() => {
  clearAllTimers();
  cleanupTimerFile();
  mockGetMovieDetails.mockReset().mockResolvedValue({ poster_path: '/poster.jpg' });
  mockGetTVShowDetails.mockReset().mockResolvedValue({ poster_path: '/show.jpg' });
  mockGetPosterUrl.mockReset().mockImplementation(p => p ? `https://image.tmdb.org/t/p/w500${p}` : null);
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  clearAllTimers();
  cleanupTimerFile();
});

function makeInteraction() {
  const message = { edit: jest.fn().mockResolvedValue(undefined) };
  return {
    channelId: 'channel-1',
    guildId: 'guild-1',
    channel: { id: 'channel-1', send: jest.fn().mockResolvedValue(message) },
    client: {},
    user: { id: 'user-1', username: 'tester' },
    editReply: jest.fn().mockResolvedValue(undefined),
    followUp: jest.fn().mockResolvedValue(undefined),
    _message: message,
  };
}

async function runCountdown(interaction, { label = 'Halloween', media = null } = {}) {
  const promise = startTimerCountdown(
    interaction, 'channel-1', 'user-1', 'tester', label, 100, 'modern', {}, false, media
  );
  await jest.advanceTimersByTimeAsync(15000);
  await promise;
}

/** Everything actually posted to the channel (not edits). */
function sends(interaction) {
  return interaction.channel.send.mock.calls.map(c => c[0]);
}

describe('the countdown produces real notifications', () => {
  test('posts new messages for the final seconds, not just edits', async () => {
    const interaction = makeInteraction();
    await runCountdown(interaction);

    const contents = sends(interaction)
      .map(s => (typeof s === 'string' ? s : s.content))
      .filter(Boolean);

    // 3, 2 and 1 each get their own message so the channel actually pings.
    expect(contents.some(c => c.includes('3'))).toBe(true);
    expect(contents.some(c => c.includes('2'))).toBe(true);
    expect(contents.some(c => c.includes('1'))).toBe(true);
  });

  test('counts down red → yellow → green, like a starting light', async () => {
    const interaction = makeInteraction();
    await runCountdown(interaction);

    const countdownPosts = sends(interaction)
      .map(s => (typeof s === 'string' ? s : s.content))
      .filter(c => c && /### /.test(c));

    const emojiFor = n => countdownPosts.find(c => c.endsWith(` ${n}`));

    expect(emojiFor(3)).toContain('🔴');
    expect(emojiFor(2)).toContain('🟡');
    expect(emojiFor(1)).toContain('🟢');
  });

  test('uses a modest heading, not a full-size one', async () => {
    // A full h1 per second dwarfed the countdown card it accompanies.
    const interaction = makeInteraction();
    await runCountdown(interaction);

    const countdownPosts = sends(interaction)
      .map(s => (typeof s === 'string' ? s : s.content))
      .filter(c => c && /^#+ /.test(c));

    expect(countdownPosts.length).toBeGreaterThan(0);
    for (const post of countdownPosts) {
      expect(post.startsWith('### ')).toBe(true);
    }
  });

  test('still animates the countdown card in place', async () => {
    const interaction = makeInteraction();
    await runCountdown(interaction);

    // 5→4→3→2→1 plus GO — the animation is why the card exists.
    expect(interaction._message.edit.mock.calls.length).toBeGreaterThanOrEqual(5);
  });

  test('announces the start as its own message, so it notifies', async () => {
    const interaction = makeInteraction();
    await runCountdown(interaction);

    const withEmbed = sends(interaction).filter(s => s?.embeds?.length);
    const started = withEmbed.at(-1);

    expect(started).toBeDefined();
    expect(started.embeds[0].data.title).toContain('NOW PLAYING');
  });

  test('mentions the starter in the message content, where it actually pings', async () => {
    const interaction = makeInteraction();
    await runCountdown(interaction);

    const started = sends(interaction).filter(s => s?.embeds?.length).at(-1);

    // A mention inside an embed never notifies anyone — it has to be content.
    expect(started.content).toContain('<@user-1>');
    expect(started.content).toContain('Halloween');
  });
});

describe('the card has visual weight', () => {
  test('shows poster art when the title is known', async () => {
    const interaction = makeInteraction();
    await runCountdown(interaction, { media: { tmdbId: 948, type: 'movie' } });

    const started = sends(interaction).filter(s => s?.embeds?.length).at(-1);
    expect(started.embeds[0].data.image?.url).toContain('poster.jpg');
  });

  test('uses the poster as a thumbnail during the countdown itself', async () => {
    const interaction = makeInteraction();
    await runCountdown(interaction, { media: { tmdbId: 948, type: 'movie' } });

    const firstCard = interaction.channel.send.mock.calls[0][0];
    expect(firstCard.embeds[0].data.thumbnail?.url).toContain('poster.jpg');
  });

  test('includes the title and a full-width rule so the card is not cramped', async () => {
    const interaction = makeInteraction();
    await runCountdown(interaction, { label: 'The Thing' });

    const firstCard = interaction.channel.send.mock.calls[0][0];
    const description = firstCard.embeds[0].data.description;

    expect(description).toContain('The Thing');
    expect(description).toContain('━');
  });

  test('runs fine with no poster at all', async () => {
    const interaction = makeInteraction();
    await runCountdown(interaction, { media: null });

    const started = sends(interaction).filter(s => s?.embeds?.length).at(-1);
    expect(started.embeds[0].data.image).toBeUndefined();
    expect(started.content).toContain('<@user-1>');
  });

  test('a failed poster lookup never blocks the countdown', async () => {
    mockGetMovieDetails.mockRejectedValue(new Error('TMDB down'));
    const interaction = makeInteraction();

    await runCountdown(interaction, { media: { tmdbId: 948, type: 'movie' } });

    const started = sends(interaction).filter(s => s?.embeds?.length).at(-1);
    expect(started.embeds[0].data.title).toContain('NOW PLAYING');
  });

  test('handles an unlabeled timer without rendering an empty heading', async () => {
    const interaction = makeInteraction();
    await runCountdown(interaction, { label: '' });

    const firstCard = interaction.channel.send.mock.calls[0][0];
    expect(firstCard.embeds[0].data.description).toContain('Watch Party');
  });
});

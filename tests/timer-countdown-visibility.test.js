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
const mockGetBackdropUrl = jest.fn();

jest.unstable_mockModule('../src/services/tmdbService.js', () => ({
  getPosterUrl: mockGetPosterUrl,
  getBackdropUrl: mockGetBackdropUrl,
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
  getEpisodeBufferMinutes: jest.fn(() => 5),
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
  mockGetMovieDetails.mockReset().mockResolvedValue({ poster_path: '/poster.jpg', backdrop_path: '/backdrop.jpg' });
  mockGetTVShowDetails.mockReset().mockResolvedValue({ poster_path: '/show.jpg', backdrop_path: '/show-backdrop.jpg' });
  mockGetPosterUrl.mockReset().mockImplementation(p => p ? `https://image.tmdb.org/t/p/w342${p}` : null);
  mockGetBackdropUrl.mockReset().mockImplementation(p => p ? `https://image.tmdb.org/t/p/w780${p}` : null);
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  clearAllTimers();
  cleanupTimerFile();
});

function makeInteraction() {
  const message = {};
  message.edit = jest.fn().mockResolvedValue(message);
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

/**
 * The spoken countdown's final text.
 *
 * It posts once at "3" and then edits itself for each later tick, so the
 * last content it was given is what the channel ends up showing.
 */
function finalTickerContent(interaction) {
  const edits = interaction._message.edit.mock.calls
    .map(c => c[0]?.content)
    .filter(Boolean);
  if (edits.length) return edits.at(-1);

  const posted = sends(interaction).filter(s => s?.content && !s.embeds);
  return posted.at(-1)?.content || '';
}

describe('the countdown produces real notifications', () => {
  test('speaks the countdown as a real message, so the channel notifies', async () => {
    const interaction = makeInteraction();
    await runCountdown(interaction);

    // A genuinely new message (not an edit of the card) is what notifies —
    // it appears at "3" and then grows for "2" and "1".
    const posted = sends(interaction).filter(s => s?.content && !s.embeds);
    expect(posted).toHaveLength(1);
    expect(posted[0].content).toContain('3');

    const ticker = finalTickerContent(interaction);
    expect(ticker).toContain('3');
    expect(ticker).toContain('2');
    expect(ticker).toContain('1');
  });

  test('counts down red → yellow → green, like a starting light', async () => {
    const interaction = makeInteraction();
    await runCountdown(interaction);

    const ticker = finalTickerContent(interaction);

    expect(ticker).toContain('🔴 **3**');
    expect(ticker).toContain('🟡 **2**');
    expect(ticker).toContain('🟢 **1**');
  });

  test('stacks the ticks into one message instead of one per number', async () => {
    // A separate message per number repeats the bot's author header above
    // each one, so three numbers cost six lines of channel. The classic
    // theme appends to a single message; this matches it.
    const interaction = makeInteraction();
    await runCountdown(interaction);

    const contentOnlySends = sends(interaction).filter(s => s?.content && !s.embeds);
    expect(contentOnlySends).toHaveLength(1);

    // …and that one message ends up holding every tick.
    const ticker = finalTickerContent(interaction);
    expect(ticker.split('\n').length).toBeGreaterThanOrEqual(3);
  });

  test('the ticker ends on GO', async () => {
    const interaction = makeInteraction();
    await runCountdown(interaction);

    expect(finalTickerContent(interaction)).toContain('GO!');
  });

  test('the card, its emoji and its blocks agree at every step', async () => {
    // These drifted apart once: the emoji said red at 3 while the embed
    // stripe was orange and the blocks were yellow, so nothing read as a
    // single countdown. All three must carry the same colour per step.
    const RED = 0xFF0000;
    const YELLOW = 0xFFCC00;
    const GREEN = 0x00FF00;

    const interaction = makeInteraction();
    await runCountdown(interaction);

    // The first card is sent; the rest are edits of it.
    const cards = [
      interaction.channel.send.mock.calls[0][0].embeds[0],
      ...interaction._message.edit.mock.calls
        .map(c => c[0].embeds?.[0])
        .filter(Boolean),
    ];

    const cardFor = n =>
      cards.find(e => new RegExp(`# ${n}\\b`).test(e.data.description || ''));

    expect(cardFor(3).data.color).toBe(RED);
    expect(cardFor(3).data.title).toContain('🔴');
    expect(cardFor(3).data.description).toContain('🟥');

    expect(cardFor(2).data.color).toBe(YELLOW);
    expect(cardFor(2).data.title).toContain('🟡');
    expect(cardFor(2).data.description).toContain('🟨');

    expect(cardFor(1).data.color).toBe(GREEN);
    expect(cardFor(1).data.title).toContain('🟢');
    expect(cardFor(1).data.description).toContain('🟩');
  });

  test('stays red through the early steps', async () => {
    const interaction = makeInteraction();
    await runCountdown(interaction);

    const first = interaction.channel.send.mock.calls[0][0].embeds[0];
    expect(first.data.color).toBe(0xFF0000);
    expect(first.data.title).toContain('🔴');
  });

  test('keeps the ticks compact — no oversized headings', async () => {
    // A heading per number dwarfed the countdown card it accompanies.
    const interaction = makeInteraction();
    await runCountdown(interaction);

    expect(finalTickerContent(interaction)).not.toMatch(/^#+ /m);
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
  test('features the LANDSCAPE backdrop on the Now Playing card', async () => {
    // Discord gives no control over an embed image's display size — setImage
    // always fills the card width — so aspect ratio is the only real lever on
    // how much channel the card occupies. At a fixed width a 16:9 backdrop is
    // about half the height of a 2:3 poster, which is what stops the card
    // dominating the channel.
    const interaction = makeInteraction();
    await runCountdown(interaction, { media: { tmdbId: 948, type: 'movie' } });

    const started = sends(interaction).filter(s => s?.embeds?.length).at(-1);
    expect(started.embeds[0].data.image?.url).toContain('backdrop.jpg');
    expect(started.embeds[0].data.image?.url).not.toContain('poster.jpg');
  });

  test('falls back to the poster when a title has no backdrop', async () => {
    // Plenty of older or obscure titles have no backdrop, and losing the art
    // entirely would be worse than a taller card.
    mockGetMovieDetails.mockResolvedValue({ poster_path: '/poster.jpg', backdrop_path: null });
    const interaction = makeInteraction();
    await runCountdown(interaction, { media: { tmdbId: 948, type: 'movie' } });

    const started = sends(interaction).filter(s => s?.embeds?.length).at(-1);
    expect(started.embeds[0].data.image?.url).toContain('poster.jpg');
  });

  test('looks the title up once, not once per shape', async () => {
    const interaction = makeInteraction();
    await runCountdown(interaction, { media: { tmdbId: 948, type: 'movie' } });

    expect(mockGetMovieDetails).toHaveBeenCalledTimes(1);
  });

  test('keeps the PORTRAIT poster as the countdown thumbnail', async () => {
    // The countdown thumbnail is a small right-aligned corner image, where a
    // poster reads better than a backdrop — so the two cards deliberately use
    // different shapes of the same title's art.
    const interaction = makeInteraction();
    await runCountdown(interaction, { media: { tmdbId: 948, type: 'movie' } });

    const firstCard = interaction.channel.send.mock.calls[0][0];
    expect(firstCard.embeds[0].data.thumbnail?.url).toContain('poster.jpg');
    expect(firstCard.embeds[0].data.thumbnail?.url).not.toContain('backdrop.jpg');
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

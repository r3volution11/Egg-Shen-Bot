/**
 * /watchparty ready — a ready check: ✅ Ready / ⏳ Need a minute, tallied on a
 * public card; compared with the event's Interested list when the channel
 * has a watch party around now; closed by /watchparty ready-close, by a
 * timer starting, or by the event going live.
 *
 * Driven through the fake Discord: the real command posts the card, and
 * clicks use the card's own buttons through the real button handler. What's
 * checked is the card's text, what's stored, and what was posted.
 *
 * Run with: npm test -- tests/watchparty-ready.test.js
 */

import { describe, test, expect, jest, beforeAll, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import { Collection, GuildScheduledEventStatus } from 'discord.js';

// /timer start's countdown pulls in TMDB and guild config; keep them quiet
jest.unstable_mockModule('../src/services/tmdbService.js', () => ({
  getPosterUrl: jest.fn(() => null),
  getBackdropUrl: jest.fn(() => null),
  searchMovies: jest.fn().mockResolvedValue([]),
  searchTVShows: jest.fn().mockResolvedValue([]),
  getMovieDetails: jest.fn().mockResolvedValue(null),
  getTVShowDetails: jest.fn().mockResolvedValue(null),
  getMovieAlternativeTitles: jest.fn().mockResolvedValue([]),
  getTVAlternativeTitles: jest.fn().mockResolvedValue([]),
  getSeasonDetails: jest.fn(),
  sumEpisodeRuntimes: jest.fn(),
}));

let FakeDiscord;
let watchparty;
let handleButtonInteraction;
let readyChecks;
let timer;
let timerManager;
let discord;

const CHECKS_FILE = process.env.READY_CHECKS_FILE;
const HOUR = 60 * 60 * 1000;

beforeAll(async () => {
  ({ FakeDiscord } = await import('./harness/fakeDiscord.js'));
  watchparty = await import('../src/commands/watchparty.js');
  ({ handleButtonInteraction } = await import('../src/handlers/buttonHandler.js'));
  readyChecks = await import('../src/utils/readyCheckManager.js');
  timer = await import('../src/commands/timer.js');
  timerManager = await import('../src/utils/timerManager.js');
});

beforeEach(() => {
  if (fs.existsSync(CHECKS_FILE)) fs.unlinkSync(CHECKS_FILE);
  discord = new FakeDiscord({ guildId: 'ready-guild', channelId: 'party' });
  for (const id of ['host', 'ann', 'bo', 'cy', 'di', 'ed', 'stranger']) discord.addUser(id);
  discord.addUser('mod', { admin: true });
});

/**
 * Give the fake guild scheduled events, the way discord.js returns them:
 * fetch() → a Collection; fetch(id) → one event. `interested` is who
 * marked it Interested; `failSubscribers` makes that lookup throw.
 */
function withEvent({ status = GuildScheduledEventStatus.Scheduled, startsIn = 10 * 60 * 1000, interested = [], failSubscribers = false, name = 'Friday Frights' } = {}) {
  const event = {
    id: 'ev1',
    name,
    status,
    channelId: 'party',
    entityMetadata: null,
    scheduledStartTimestamp: Date.now() + startsIn,
    userCount: interested.length,
    fetchSubscribers: jest.fn(async () => {
      if (failSubscribers) throw new Error('Missing Access');
      return new Collection(interested.map(id => [id, { user: { id } }]));
    }),
  };
  discord.guild.scheduledEvents = {
    fetch: async (id) => (id ? event : new Collection([[event.id, event]])),
  };
  return event;
}

async function command(userId, subcommand, options = {}) {
  const i = discord.command(userId, 'watchparty', { subcommand, options });
  await watchparty.execute(i);
  return i;
}

/** /watchparty ready → the card it posted */
async function postCheck(userId = 'host', options = {}) {
  const i = await command(userId, 'ready', options);
  return i.replyMessage;
}

async function press(userId, card, kind) {
  const button = card.allComponents.find(c => c.customId.endsWith(`_${kind}`));
  const i = discord.button(userId, card, button.customId);
  await handleButtonInteraction(i);
  return i;
}

const text = (card) => card.text;

describe('a plain tally (no watch party around now)', () => {
  test('answers land on the card and in the record; switching moves you between lists', async () => {
    const card = await postCheck('host', { message: 'Starting in 5!' });
    expect(text(card)).toContain('Starting in 5!');
    expect(text(card)).toContain('✅ Ready (0)');

    await press('ann', card, 'ready');
    await press('bo', card, 'ready');
    await press('cy', card, 'minute');
    expect(text(card)).toContain('✅ Ready (2)');
    expect(text(card)).toContain('⏳ Need a minute (1)');
    expect(text(card)).toMatch(/Ready \(2\)\n<@ann> <@bo>/);
    expect(text(card)).not.toContain('Interested');

    await press('bo', card, 'minute');
    expect(text(card)).toContain('✅ Ready (1)');
    expect(text(card)).toContain('⏳ Need a minute (2)');
    expect(readyChecks.getCheck('party').answers).toEqual({ ann: 'ready', bo: 'minute', cy: 'minute' });
  });

  test('the role ping is in the message text, where mentions ping', async () => {
    const role = { id: 'r1', toString: () => '<@&r1>' };
    const card = await postCheck('host', { role });
    expect(card.content).toContain('<@&r1>');
  });
});

describe('compared with the event\'s Interested list', () => {
  test('a party starting soon: who of the Interested are ready, and who hasn\'t checked in', async () => {
    withEvent({ interested: ['ann', 'bo', 'cy', 'di'] });
    const card = await postCheck();
    expect(text(card)).toContain('Ready check — Friday Frights');

    await press('ann', card, 'ready');
    await press('bo', card, 'minute');
    await press('stranger', card, 'ready');
    expect(text(card)).toContain('👀 Interested in the event: 4');
    expect(text(card)).toContain('1 ready, 1 needs a minute');
    expect(text(card)).toContain('Not checked in yet: <@cy> <@di>');
    expect(text(card)).toContain('Also ready: 1 who didn\'t mark Interested');
  });

  test('next week\'s party for the channel isn\'t tonight\'s: plain tally', async () => {
    withEvent({ startsIn: 7 * 24 * HOUR, interested: ['ann'] });
    const card = await postCheck();
    expect(text(card)).not.toContain('Interested');
    expect(text(card)).not.toContain('Friday Frights');
  });

  test('when the Interested list can\'t be read, the card still posts as a plain tally', async () => {
    withEvent({ failSubscribers: true });
    const card = await postCheck();
    await press('ann', card, 'ready');
    expect(text(card)).toContain('✅ Ready (1)');
    expect(text(card)).not.toContain('👀');
  });
});

describe('telling the host', () => {
  test('when the last "Need a minute" turns Ready, one new message mentions the host', async () => {
    const card = await postCheck();
    await press('ann', card, 'ready');
    await press('bo', card, 'minute');
    await press('cy', card, 'minute');
    const before = discord.channel.posted.length;

    await press('bo', card, 'ready');
    expect(discord.channel.posted.length).toBe(before); // still waiting on cy
    await press('cy', card, 'ready');
    const pings = discord.channel.posted.slice(before);
    expect(pings).toHaveLength(1);
    expect(pings[0].content).toBe('<@host> ✅ Everyone who asked for a minute is ready (3 ready).');

    // Nobody waiting: more Ready clicks send nothing
    await press('di', card, 'ready');
    expect(discord.channel.posted.length).toBe(before + 1);
  });
});

describe('stopping answers', () => {
  test('/watchparty ready-close: the host closes it, and the card freezes with the count', async () => {
    const card = await postCheck();
    await press('ann', card, 'ready');
    const denied = await command('bo', 'ready-close');
    expect(denied.replyMessage.content).toContain('Only <@host>');
    expect(readyChecks.getCheck('party').closed).toBeNull();

    const closed = await command('host', 'ready-close');
    expect(closed.replyMessage.content).toContain('1 ready, 0 needed a minute');
    expect(text(card)).toContain('🔒 **Closed** — 1 was ready.');
    expect(card.allComponents.every(c => c.disabled)).toBe(true);
  });

  test('a moderator can close someone else\'s', async () => {
    await postCheck();
    await command('mod', 'ready-close');
    expect(readyChecks.getCheck('party').closed.reason).toBe('host');
  });

  test('a newer check replaces the old one, whose card stops taking answers', async () => {
    const first = await postCheck();
    await press('ann', first, 'ready');
    const second = await postCheck();
    expect(text(first)).toContain('Replaced by a newer ready check');
    expect(first.allComponents.every(c => c.disabled)).toBe(true);
    await press('bo', second, 'ready');
    expect(readyChecks.getCheck('party').answers).toEqual({ bo: 'ready' });
  });

  test('a click on a card closed under it is refused privately and changes nothing', async () => {
    const card = await postCheck();
    // Closed in the store, but this card still shows live buttons (the
    // click raced the close)
    readyChecks.closeCheck('party', 'timer');
    const i = await press('ann', card, 'ready');
    expect(readyChecks.getCheck('party').answers).toEqual({});
    expect(i.responses.at(-1).content).toContain('The timer has started');
    expect(card.allComponents.every(c => c.disabled)).toBe(true);
  });

  test('the event going live closes a check posted before it started', async () => {
    const event = withEvent({ interested: ['ann'] });
    const card = await postCheck();
    await press('ann', card, 'ready');
    event.status = GuildScheduledEventStatus.Active;
    const i = await press('bo', card, 'ready');
    expect(i.responses.at(-1).content).toContain('The watch party has started');
    expect(readyChecks.getCheck('party').answers).toEqual({ ann: 'ready' });
    expect(text(card)).toContain('🎬 **The watch party has started** — 1 was ready.');
  });

  test('a check posted during a live party stays open', async () => {
    withEvent({ status: GuildScheduledEventStatus.Active, startsIn: -30 * 60 * 1000 });
    const card = await postCheck();
    await press('ann', card, 'ready');
    expect(text(card)).toContain('✅ Ready (1)');
  });

  describe('a timer starting in the channel', () => {
    beforeEach(() => { timerManager.clearAllTimers(); jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] }); });
    afterEach(() => { jest.useRealTimers(); timerManager.clearAllTimers(); });

    test('closes the check, and the card shows how many were ready', async () => {
      const card = await postCheck();
      await press('ann', card, 'ready');
      await press('bo', card, 'ready');

      const i = discord.command('host', 'timer', { subcommand: 'start', options: {} });
      await i.deferReply({ ephemeral: true });
      const run = timer.startTimerCountdown(i, 'party', 'host', 'host', 'Halloween', 90, 'modern', {}, false, null);
      await jest.advanceTimersByTimeAsync(15000);
      await run;

      expect(readyChecks.getCheck('party').closed.reason).toBe('timer');
      expect(text(card)).toContain('🎬 **Timer started** — 2 were ready.');
      expect(card.allComponents.every(c => c.disabled)).toBe(true);
    });
  });
});

describe('restarts', () => {
  test('the check is on disk, so a card from before a restart keeps counting', async () => {
    const card = await postCheck();
    await press('ann', card, 'ready');
    jest.resetModules();
    const fresh = await import('../src/handlers/buttonHandler.js');
    const button = card.allComponents.find(c => c.customId.endsWith('_minute'));
    await fresh.handleButtonInteraction(discord.button('bo', card, button.customId));
    expect(text(card)).toContain('✅ Ready (1)');
    expect(text(card)).toContain('⏳ Need a minute (1)');
  });
});

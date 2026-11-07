/**
 * "Log to Watch History": the button on a stopped timer's card, and its form,
 * driven end to end.
 *
 * The real /timer stop (or auto-stop) posts the card; the card's own button
 * customId is clicked through the real button dispatcher; the form that
 * opens is submitted with its own customId and its own boxes, pre-filled
 * values and all, through the real submit handler; and what's checked is
 * the watch history actually saved. TMDB is mocked (every export stubbed,
 * read from the module's source); the watch history, timers and stats are
 * the real modules on the test worker's scratch files.
 *
 * What these caught:
 * - A timer with no label offered "Timer has been stopped" (or "Timer has
 *   completed") as the title — the card's first line, whatever it said —
 *   so the form had no title box and searched TMDB for that sentence.
 * - The title rode in the form's customId as base64. With real 19-digit
 *   ids, anything over ~33 bytes passed Discord's 100-character cap and the
 *   form couldn't even be built.
 * - A card could be logged twice: the auto-logged card carried the button
 *   too, and two forms opened from one card each saved an entry.
 * - A moderator could open the form but never submit it: the submit
 *   required the timer's starter.
 *
 * Run with: npm test -- tests/watch-history-log-button.test.js
 */

import { describe, test, expect, jest, beforeAll, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { FakeDiscord } from './harness/fakeDiscord.js';

const TMDB_SOURCE = fs.readFileSync(path.join(process.cwd(), 'src/services/tmdbService.js'), 'utf8');
const TMDB_EXPORTS = [...TMDB_SOURCE.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map(m => m[1]);
const tmdb = Object.fromEntries(TMDB_EXPORTS.map(name => [name, jest.fn()]));
jest.unstable_mockModule('../src/services/tmdbService.js', () => tmdb);

// What TMDB knows, by lowercase query
const MOVIES = { alien: { id: 348, title: 'Alien', release_date: '1979-05-25' } };
const SHOWS = { 'buffy the vampire slayer': { id: 95, name: 'Buffy the Vampire Slayer', first_air_date: '1997-03-10' } };

// Real-length snowflakes: the customId cap only bites with these
const CHANNEL = '9876543210987654321';
const STARTER = '1234567890123456789';
const MOD = '1111111111111111111';
const MEMBER = '2222222222222222222';

let timer;
let timerManager;
let handleButtonInteraction;
let handleWatchedModalSubmit;
let getWatchHistory;
let clearWatchHistory;
let discord;
let guildCounter = 0;

beforeAll(async () => {
  timer = await import('../src/commands/timer.js');
  timerManager = await import('../src/utils/timerManager.js');
  ({ handleButtonInteraction } = await import('../src/handlers/buttonHandler.js'));
  ({ handleWatchedModalSubmit } = await import('../src/handlers/watchHistoryLog.js'));
  ({ getWatchHistory, clearWatchHistory } = await import('../src/utils/watchHistoryManager.js'));
});

beforeEach(async () => {
  timerManager.clearAllTimers();
  for (const fn of Object.values(tmdb)) fn.mockReset();
  tmdb.searchMovies.mockImplementation(async (q) => (MOVIES[q.toLowerCase()] ? [MOVIES[q.toLowerCase()]] : []));
  tmdb.searchTVShows.mockImplementation(async (q) => (SHOWS[q.toLowerCase()] ? [SHOWS[q.toLowerCase()]] : []));
  tmdb.getMovieDetails.mockImplementation(async (id) => Object.values(MOVIES).find(m => m.id === id) || null);
  tmdb.getTVShowDetails.mockImplementation(async (id) => Object.values(SHOWS).find(s => s.id === id) || null);

  // A fresh guild each test, its history file emptied: the scratch
  // directory outlives the run, and the worker is shared with other suites
  discord = new FakeDiscord({ guildId: `watch-log-guild-${++guildCounter}`, channelId: CHANNEL });
  await clearWatchHistory(discord.guild.id);
  discord.addUser(STARTER);
  discord.addUser(MOD, { permissions: ['ModerateMembers'] });
  discord.addUser(MEMBER);
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  timerManager.clearAllTimers();
});

const history = () => getWatchHistory(discord.guild.id, 'all', Infinity);

/** Start a timer, then the real /timer stop: the card it posts */
async function stopCard(label = '') {
  timerManager.startTimer(CHANNEL, STARTER, STARTER, label);
  const i = discord.command(STARTER, 'timer', { subcommand: 'stop' });
  await timer.execute(i);
  expect(discord.violations).toEqual([]);
  return i.replyMessage;
}

const logButtonId = (card) => card.allComponents.find(c => c.customId?.startsWith('log_watched_'))?.customId;

/** Click the card's own Log button as `user`: the interaction (with .modal if a form opened) */
async function clickLog(user, card) {
  const i = discord.button(user, card, logButtonId(card));
  await handleButtonInteraction(i);
  return i;
}

/** The form's text boxes as { customId: { value, required } } */
function boxes(modal) {
  return Object.fromEntries(modal.components.flatMap(row => row.components)
    .map(c => [c.custom_id, { value: c.value, required: c.required }]));
}

/**
 * Submit a form as Discord would: its own customId, every box it has, a
 * pre-filled box sent as filled unless `typed` changes it. Like discord.js,
 * a form opened from a button carries that button's message.
 */
async function submit(user, card, modal, typed = {}) {
  const values = Object.fromEntries(Object.entries(boxes(modal)).map(([id, box]) => [id, typed[id] ?? box.value ?? '']));
  const i = discord.modalSubmit(user, modal.custom_id, values);
  i.message = card;
  await handleWatchedModalSubmit(i);
  return i;
}

describe('a card with no title', () => {
  test('/timer stop with no label: the form asks for the title, empty — and what\'s typed is what\'s logged', async () => {
    const card = await stopCard();
    expect(card.embeds[0].description).toBe('Timer has been stopped');

    const click = await clickLog(STARTER, card);
    const form = boxes(click.modal);
    expect(form.title).toEqual({ value: undefined, required: true }); // not "Timer has been stopped"

    const done = await submit(STARTER, card, click.modal, { title: 'Alien', notes: 'Chestburster got everyone' });

    const saved = await history();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ tmdbId: 348, type: 'movie', title: 'Alien', year: '1979', notes: 'Chestburster got everyone', savedById: STARTER, channelId: CHANNEL, cardMessageId: card.id });
    expect(done.replyMessage.embeds[0].title).toBe('✅ Added to Watch History');
    expect(done.replyMessage.ephemeralFor).toBeNull();
    expect(logButtonId(card)).toBeUndefined(); // logged: the button went
    expect(discord.violations).toEqual([]);
  });

  test('an auto-stopped timer with no label: the form\'s title box is empty, not "Timer has completed"', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    timerManager.startTimer(CHANNEL, STARTER, STARTER, '', 1, discord.client);
    await jest.advanceTimersByTimeAsync(60_000);
    jest.useRealTimers();
    // The auto-stop sends, then saves timers; let its awaits finish
    await new Promise(r => setTimeout(r, 50));

    const card = discord.channel.posted.at(-1);
    expect(card.embeds[0].description).toBe('Timer has completed');

    const click = await clickLog(STARTER, card);
    expect(boxes(click.modal).title.value).toBeUndefined();
  });
});

describe('a card with a title', () => {
  test('a long label TMDB can\'t find: the form fits Discord\'s limits, shows the label to correct, and logs the correction', async () => {
    const label = 'Buffy the Vampire Slayer - S3: E1-E4 (Marathon Night, Part Two)';
    const card = await stopCard(label);
    expect(card.embeds[0].description).toContain('Could not find this title on TMDB');

    const click = await clickLog(STARTER, card);
    expect(click.modal).toBeDefined(); // the old base64 customId was over 100 and couldn't be built
    expect(click.modal.custom_id).toBe(`watched_modal_${CHANNEL}_${STARTER}`);
    expect(click.modal.custom_id.length).toBeLessThanOrEqual(100);
    expect(boxes(click.modal).title.value).toBe(label);

    // As typed, it still isn't on TMDB: nothing saved, and the button stays to try again
    const miss = await submit(STARTER, card, click.modal);
    expect(miss.replyMessage.content).toBe(`Could not find "${label}" on TMDB. Check the spelling and press **Log to Watch History** again, or search with \`/watched add\`.`);
    expect(await history()).toHaveLength(0);
    expect(logButtonId(card)).toBeDefined();

    const retry = await clickLog(STARTER, card);
    await submit(STARTER, card, retry.modal, { title: 'Buffy the Vampire Slayer' });
    const saved = await history();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ tmdbId: 95, type: 'tv', title: 'Buffy the Vampire Slayer', year: '1997' });
    expect(discord.violations).toEqual([]);
  });
});

describe('logging a card only once', () => {
  test('/timer stop that logged itself posts no Log button: one entry', async () => {
    const card = await stopCard('Alien');
    expect(card.embeds[0].title).toBe('⏹️ Timer Stopped & Logged 🛑📝');
    expect(logButtonId(card)).toBeUndefined();
    expect(await history()).toHaveLength(1);
  });

  test('an auto-stop that logged itself posts no Log button: one entry', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    timerManager.startTimer(CHANNEL, STARTER, STARTER, 'Alien', 1, discord.client);
    await jest.advanceTimersByTimeAsync(60_000);
    jest.useRealTimers();
    await new Promise(r => setTimeout(r, 50));

    const card = discord.channel.posted.at(-1);
    expect(card.embeds[0].title).toBe('⏰ Timer Completed & Logged 🛑📝');
    expect(logButtonId(card)).toBeUndefined();
    expect(await history()).toHaveLength(1);
  });

  test('an auto-logged card from before this fix, still carrying the button: says it\'s logged, opens no form', async () => {
    const logged = await stopCard('Alien');
    // As the previous version posted it: the same card, plus the button
    const legacy = await discord.channel.send({
      embeds: logged.embeds,
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`log_watched_${CHANNEL}_${STARTER}`).setLabel('Log to Watch History').setStyle(ButtonStyle.Secondary)
      )],
    });

    const click = await clickLog(STARTER, legacy);

    expect(click.modal).toBeUndefined();
    expect(click.replyMessage.content).toBe('✅ This watch party is already in the watch history as **Alien (1979)**. `/watched history` shows it.');
    expect(click.replyMessage.ephemeralFor).toBe(STARTER);
    expect(await history()).toHaveLength(1);
  });

  test('two forms opened from one card: the first submit logs, the second is told it\'s already logged', async () => {
    const card = await stopCard();
    const starterClick = await clickLog(STARTER, card);
    const modClick = await clickLog(MOD, card); // both open before either submits

    await submit(STARTER, card, starterClick.modal, { title: 'Alien' });
    const second = await submit(MOD, card, modClick.modal, { title: 'Alien' });

    expect(await history()).toHaveLength(1);
    expect(second.replyMessage.content).toBe('✅ This watch party is already in the watch history as **Alien (1979)**. `/watched history` shows it.');
    expect(second.replyMessage.ephemeralFor).toBe(MOD);
  });

  test('two submits at the same moment: one entry', async () => {
    const card = await stopCard();
    const a = await clickLog(STARTER, card);
    const b = await clickLog(MOD, card);

    const both = await Promise.all([
      submit(STARTER, card, a.modal, { title: 'Alien' }),
      submit(MOD, card, b.modal, { title: 'Alien' }),
    ]);

    expect(await history()).toHaveLength(1);
    // One logged it; the other was told so. (The history count alone can't
    // tell: two saves racing can lose one, leaving one entry and two
    // "Added" confirmations.)
    const answers = both.map(i => i.replyMessage.embeds[0]?.title || i.replyMessage.content);
    expect(answers.filter(a => a === '✅ Added to Watch History')).toHaveLength(1);
    expect(answers).toContain('⏳ This watch party is being logged right now.');
  });

  test('a card whose button outlived its log (the edit removing it failed): says it\'s logged', async () => {
    const card = await stopCard();
    const click = await clickLog(STARTER, card);
    await submit(STARTER, card, click.modal, { title: 'Alien' });
    // Put the button back, as if removing it had failed
    await card.edit({ components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`log_watched_${CHANNEL}_${STARTER}`).setLabel('Log to Watch History').setStyle(ButtonStyle.Primary)
    )] });

    const again = await clickLog(STARTER, card);

    expect(again.modal).toBeUndefined();
    expect(again.replyMessage.content).toContain('already in the watch history as **Alien (1979)**');
    expect(await history()).toHaveLength(1);
  });
});

describe('who can log', () => {
  test('a moderator who didn\'t start the timer can open the form and submit it', async () => {
    const card = await stopCard();
    const click = await clickLog(MOD, card);
    const done = await submit(MOD, card, click.modal, { title: 'Alien' });

    expect(done.replyMessage.embeds[0].title).toBe('✅ Added to Watch History');
    const saved = await history();
    expect(saved).toHaveLength(1);
    expect(saved[0].savedById).toBe(MOD);
  });

  test('a plain member can neither open the form nor submit one', async () => {
    const card = await stopCard();
    const click = await clickLog(MEMBER, card);
    expect(click.modal).toBeUndefined();
    expect(click.replyMessage.content).toMatch(/^❌ Only the person who started the timer/);

    const forged = discord.modalSubmit(MEMBER, `watched_modal_${CHANNEL}_${STARTER}`, { title: 'Alien', notes: '' });
    forged.message = card;
    await handleWatchedModalSubmit(forged);
    expect(forged.replyMessage.content).toMatch(/^❌ Only the person who started the timer/);
    expect(await history()).toHaveLength(0);
  });
});

describe('a form opened before this fix, submitted after the deploy', () => {
  test('its title in the old customId (no title box) still logs', async () => {
    const card = await stopCard();
    const legacyId = `watched_modal_${CHANNEL}_${STARTER}_${Buffer.from('Alien').toString('base64')}`;
    const i = discord.modalSubmit(STARTER, legacyId, { notes: '' });
    i.message = card;

    await handleWatchedModalSubmit(i);

    const saved = await history();
    expect(saved).toHaveLength(1);
    expect(saved[0].title).toBe('Alien');
  });
});

describe('index.js routes the form to the handler', () => {
  test('watched_modal_ submits go to handleWatchedModalSubmit', () => {
    // index.js logs a bot in when imported, so its dispatcher is read, not run
    const source = fs.readFileSync(path.join(process.cwd(), 'src/index.js'), 'utf8');
    const start = source.indexOf("customId.startsWith('watched_modal_')");
    const branch = source.slice(start, source.indexOf('} else if', start));
    expect(branch).toContain("await import('./handlers/watchHistoryLog.js')");
    expect(branch).toContain('await handleWatchedModalSubmit(interaction)');
  });
});

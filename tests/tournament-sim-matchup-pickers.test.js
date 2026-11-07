/**
 * The buttons `/bracket open-matchup` and `/bracket close-matchup` post when
 * no matchup is named: who may press them, and how long they last.
 *
 * - Who: the command admits Administrator or Timeout Members only, but its
 *   buttons used isAdmin(), which also admits Manage Server, Kick Members
 *   and Ban Members. Such a member was refused the command and could still
 *   open or close matchups from a picker someone else posted. Both now use
 *   tournamentManagers.isTournamentManager.
 * - How long: the pickers' footer always said "Buttons expire after 15
 *   minutes", and nothing checked. A picker left in the channel opened or
 *   closed matchups hours later. Now a click on a picker older than 15
 *   minutes changes nothing and says to run the command again.
 *
 * Through the tournament simulator (tests/harness/tournamentSim.js): the real
 * /bracket command posts the picker, and its own buttons are pressed. Split
 * from tournament-sim.test.js so the two run in parallel.
 *
 * Run with: npm test -- tests/tournament-sim-matchup-pickers.test.js
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { loadSim, finishSim, clock, favorite } from './harness/tournamentSim.js';

let Sim;

beforeAll(async () => {
  ({ Sim } = await loadSim());
  clock.install();
});

afterAll(() => finishSim());

const MINUTE = 60 * 1000;

const HORROR_8 = [
  ['Alien', 1979], ['The Thing', 1982], ['Halloween', 1978], ['Jaws', 1975],
  ['The Shining', 1980], ['Scream', 1996], ['Get Out', 2017], ['Hereditary', 2018],
];
const HORROR_16 = [
  ...HORROR_8,
  ['Psycho', 1960], ['The Exorcist', 1973], ['Poltergeist', 1982], ['The Fly', 1986],
  ['Carrie', 1976], ['It Follows', 2015], ['The Babadook', 2014], ['Midsommar', 2019],
];

async function straightBracket(sim, name, size, titles) {
  await sim.bracket('admin', 'create', { name, 'max-titles': size });
  for (const [title, year] of titles) await sim.addTitle('movie', title, year);
}

const buttons = (message, prefix) => message.allComponents.filter(c => (c.customId || '').startsWith(prefix));
const statusOf = (sim, matchupId) => sim.tournament().knockoutBracket.find(m => m.id === matchupId).status;
const matchupOf = (button) => button.customId.split('_')[2];
const answer = (i) => i.replyMessage.text;

/** Members isAdmin() accepts who aren't tournament managers */
const NOT_MANAGERS = [
  ['manager', 'ManageGuild'],
  ['kicker', 'KickMembers'],
  ['banner', 'BanMembers'],
];

function addStaff(sim) {
  for (const [id, permission] of NOT_MANAGERS) sim.discord.addUser(id, { permissions: [permission] });
  sim.discord.addUser('mod', { permissions: ['ModerateMembers'] }); // Timeout Members
}

describe('who can press a matchup picker\'s buttons: whoever can run the command', () => {
  test('Manage Server, Kick or Ban alone is refused the command and its buttons; Timeout Members is let in', async () => {
    const sim = new Sim('sim-picker-who');
    addStaff(sim);
    await straightBracket(sim, 'Who Presses', 8, HORROR_8);
    await sim.bracket('admin', 'open', { matchups: 1, duration: '1d' }); // builds the bracket, opens 1A

    const picker = await sim.bracket('admin', 'open-matchup', { duration: '1d' });
    const [button] = buttons(picker.reply, 'open_matchup_');
    expect(button).toBeTruthy();

    for (const [who] of NOT_MANAGERS) {
      const ran = await sim.bracket(who, 'open-matchup', { duration: '1d' });
      expect(answer(ran)).toBe('❌ Only administrators and moderators can manage tournaments.');

      const pressed = await sim.click(who, picker.reply, button.customId);
      expect(answer(pressed)).toBe('❌ Only administrators and moderators can open matchups for voting.');
      expect(statusOf(sim, matchupOf(button))).toBe('pending');
    }

    // A moderator with only Timeout Members runs the command, and presses
    const own = await sim.bracket('mod', 'open-matchup', { duration: '1d' });
    expect(buttons(own.reply, 'open_matchup_').length).toBeGreaterThan(0);
    await sim.click('mod', picker.reply, button.customId);
    expect(statusOf(sim, matchupOf(button))).toBe('voting');

    // The close picker the same way
    await sim.everyoneVotes(favorite);
    const closer = await sim.bracket('admin', 'close-matchup', {});
    const [close] = buttons(closer.reply, 'close_matchup_');
    for (const [who] of NOT_MANAGERS) {
      const pressed = await sim.click(who, closer.reply, close.customId);
      expect(answer(pressed)).toBe('❌ Only administrators and moderators can close matchups.');
      expect(statusOf(sim, matchupOf(close))).toBe('voting');
    }
    await sim.click('mod', closer.reply, close.customId);
    expect(statusOf(sim, matchupOf(close))).toBe('closed');
  });
});

describe('a matchup picker\'s buttons expire after 15 minutes, as its footer says', () => {
  test('open-matchup: a press at 14 minutes opens; at 16 nothing opens and it says to run the command again', async () => {
    const sim = new Sim('sim-picker-expiry-open');
    await straightBracket(sim, 'Clock Watching', 8, HORROR_8);
    await sim.bracket('admin', 'open', { matchups: 1, duration: '1d' });

    const picker = await sim.bracket('admin', 'open-matchup', { duration: '1d' });
    expect(picker.reply.embeds[0].toJSON().footer.text).toBe('Buttons expire after 15 minutes');
    const [first, second] = buttons(picker.reply, 'open_matchup_');

    clock.now += 14 * MINUTE;
    await sim.click('admin', picker.reply, first.customId);
    expect(statusOf(sim, matchupOf(first))).toBe('voting');

    clock.now += 2 * MINUTE;
    const late = await sim.click('admin', picker.reply, second.customId);
    expect(answer(late)).toBe('⌛ These buttons expired after 15 minutes; run `/bracket open-matchup` again for fresh ones.');
    expect(statusOf(sim, matchupOf(second))).toBe('pending');

    // A fresh picker's button for the same matchup works
    const fresh = await sim.bracket('admin', 'open-matchup', { duration: '1d' });
    await sim.click('admin', fresh.reply, buttons(fresh.reply, `open_matchup_${matchupOf(second)}_`)[0].customId);
    expect(statusOf(sim, matchupOf(second))).toBe('voting');
  });

  test('close-matchup: an old picker closes nothing', async () => {
    const sim = new Sim('sim-picker-expiry-close');
    await straightBracket(sim, 'Too Late', 8, HORROR_8);
    await sim.bracket('admin', 'open', { matchups: 1, duration: '1d' });
    await sim.everyoneVotes(favorite);

    const closer = await sim.bracket('admin', 'close-matchup', {});
    expect(closer.reply.embeds[0].toJSON().footer.text).toBe('Buttons expire after 15 minutes');
    const [close] = buttons(closer.reply, 'close_matchup_');

    clock.now += 16 * MINUTE;
    const late = await sim.click('admin', closer.reply, close.customId);
    expect(answer(late)).toBe('⌛ These buttons expired after 15 minutes; run `/bracket close-matchup` again for fresh ones.');
    expect(statusOf(sim, matchupOf(close))).toBe('voting');
  });

  test('the region picker: an old one opens no region', async () => {
    const sim = new Sim('sim-picker-expiry-region');
    await straightBracket(sim, 'Region Clock', 16, HORROR_16);
    await sim.bracket('admin', 'open', { duration: '1d' }); // builds the bracket; 8 matchups won't fit one ballot
    const openBefore = sim.openMatchups().map(m => m.id);

    const picker = await sim.bracket('admin', 'open-matchup', { duration: '1d' });
    expect(picker.reply.embeds[0].toJSON().footer.text).toBe('Buttons expire after 15 minutes');
    const [region] = buttons(picker.reply, 'open_region_');
    expect(region).toBeTruthy();

    clock.now += 20 * MINUTE;
    const late = await sim.click('admin', picker.reply, region.customId);
    expect(answer(late)).toBe('⌛ These buttons expired after 15 minutes; run `/bracket open-matchup` again for fresh ones.');
    expect(sim.openMatchups().map(m => m.id)).toEqual(openBefore);
  });
});

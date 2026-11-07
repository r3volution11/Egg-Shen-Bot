/**
 * /siege across bot restarts. Deploys restart the bot mid-fight (CLAUDE.md),
 * and a siege is several Discord calls strung out over the better part of
 * an hour: the arrival, a card edit a minute, the results. Everything must
 * come back from the files, and the promise for each message is "a restart
 * can drop it, never post it twice" — and nothing may be left stuck.
 *
 * The bot is killed at the worst moments with the simulator's faults
 * (tests/harness/siegeSim.js): just before a Discord call reaches Discord
 * (`crash-before`), or just after Discord took it but before the bot heard
 * back (`crash-after`). The step is abandoned mid-flight, and the bot
 * restarts from its files; every invariant is checked after every step.
 *
 * Run: npm test -- tests/siege-sim-restarts.test.js
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadSim, clock, MINUTE, Sim } from './harness/siegeSim.js';

const SEC = 1000;
const T0 = Date.UTC(2026, 10, 9, 20, 0, 0);
let mods;

beforeAll(async () => {
  clock.install();
  mods = await loadSim();
});

function fresh(name, seed = 3) {
  clock.now = T0;
  return new Sim(name, { seed });
}

/** Two members beat the monster down to 0 HP (it's finished on the next pass) */
async function beat(sim) {
  await sim.attack('ana', 'doom', { force: 'smite' });
  await sim.attack('ben', 'doom', { force: 'smite' });
  while (sim.siege().hp > 0) {
    await sim.advance(21 * SEC);
    await sim.attack('ana', 'doom', { force: 'smite' });
    if (sim.siege().hp > 0) await sim.attack('ben', 'doom', { force: 'smite' });
  }
}

const cardOf = (sim) => sim.channel('games').messageList.find(m => m.id === sim.siege().card?.messageId);

describe('a restart between the spawn and the arrival', () => {
  test('died before the arrival reached Discord: never two cards; 2 minutes on, the pass finds no card and calls the siege off quietly (R6 #9a)', async () => {
    const sim = fresh('rs-spawn-before');
    sim.fault({ on: 'send', kind: 'card', mode: 'crash-before' });
    const start = await sim.start({ monster: 'klowns' });
    // Deferred before any send (review, 2026-11-06), then the bot died: the
    // admin's "thinking…" is never filled in, and Discord gives up on it
    expect(start.answered()).toBe(true);
    expect(start.reply.content).toBe('');
    expect(sim.crashes).toBe(1);
    const s = sim.siege();
    expect(s).toMatchObject({ status: 'live', card: { messageId: null } });
    // The claim was saved with the spawn: a second start can't post a second card
    const again = await sim.start({ monster: 'blob' });
    expect(again.reply.content).toBe('❌ Killer Klowns is already attacking <#games>. One siege at a time: end it with `/siege end` first.');
    // The pass a minute in leaves it (the card could still be on its way); the one past 2 minutes looks, finds nothing, calls it off
    await sim.advance(MINUTE + 5 * SEC);
    expect(sim.siege().status).toBe('live');
    await sim.advance(MINUTE);
    expect(sim.siege()).toMatchObject({ id: s.id, status: 'ended', result: { grants: [], unannounced: 'no-card' } });
    expect(sim.messagesFor(s.id, 'card')).toHaveLength(0);
    expect(sim.messagesFor(s.id, 'results')).toHaveLength(0);
    expect((await sim.start({ monster: 'blob' })).reply.content).toMatch(/is attacking/);
    sim.finalChecks();
  });

  test('died after Discord posted the arrival, before its id was saved: the pass finds the card and adopts it — one card, edited and frozen like any other (R6 #9b)', async () => {
    const sim = fresh('rs-spawn-after');
    sim.fault({ on: 'send', kind: 'card', mode: 'crash-after' });
    await sim.start({ monster: 'klowns' });
    const s = sim.siege();
    expect(sim.messagesFor(s.id, 'card')).toHaveLength(1);
    expect(s.card.messageId).toBeNull();
    await sim.advance(2 * MINUTE + 5 * SEC);
    expect(sim.siege().card.messageId).toBe(sim.messagesFor(s.id, 'card')[0].id);
    await beat(sim);
    await sim.advance(2 * MINUTE);
    expect(sim.siege().status).toBe('won');
    expect(sim.messagesFor(s.id, 'results')).toHaveLength(1);
    expect(sim.messagesFor(s.id, 'card')).toHaveLength(1);
    expect(cardOf(sim).embeds[0].toJSON().title).toBe('👹 Killer Klowns is beaten!');
    sim.finalChecks();
  });

  test('a card send that timed out after Discord posted it: the siege stays on, the admin is told, the card is adopted (R6 #9b)', async () => {
    const sim = fresh('rs-spawn-abort');
    sim.fault({ on: 'send', kind: 'card', mode: 'abort-after' });
    const start = await sim.start({ monster: 'klowns' });
    expect(start.reply.content).toBe('⚠️ Discord didn\'t confirm the monster\'s card. If it\'s in <#games>, the fight\'s on; if it isn\'t, the siege is called off by itself within a few minutes.');
    const s = sim.siege();
    expect(s.status).toBe('live');
    await sim.advance(2 * MINUTE + 5 * SEC);
    expect(sim.siege().card.messageId).toBe(sim.messagesFor(s.id, 'card')[0].id);
    sim.finalChecks();
  });

});

describe('a restart mid-siege', () => {
  test('HP, the fighters and a running poison carry on; the next pass resumes the ticks, credited as before', async () => {
    const sim = fresh('rs-mid');
    await sim.start({ monster: 'klowns' });
    await sim.attack('ana', 'potion', { force: 'poisoned' }); // 45 → 41, poison until +5 min
    await sim.attack('ben', 'doom', { force: 'smite' }); // 90 → 86 − 16 = 70
    await sim.advance(2 * MINUTE + 10 * SEC); // two ticks: 66
    const before = sim.siege();
    expect([before.hp, before.participants.ana.damage]).toEqual([66, 8]);

    await sim.restart();
    const after = sim.siege();
    expect(after).toEqual(before);
    // The next pass is a minute after the restart (20:03:10): one whole minute owed since 20:02
    await sim.advance(MINUTE);
    expect(sim.siege().participants.ana.damage).toBe(10);
    await sim.advance(5 * MINUTE);
    expect([sim.siege().participants.ana.damage, sim.siege().participants.ana.poison]).toEqual([14, null]);
    expect(sim.siege().hp).toBe(90 - 14 - 16);
    // And the fight goes on: the card follows
    await sim.attack('cat', 'doom', { force: 'smite' });
    await sim.advance(MINUTE);
    expect(cardOf(sim).embeds[0].toJSON().description.split('\n')[1]).toMatch(new RegExp(`\`${sim.siege().hp}/135\` HP$`));
  });

  test('a card edit cut short, before or after Discord took it: the next pass edits again, and the card shows the store', async () => {
    for (const mode of ['crash-before', 'crash-after']) {
      const sim = fresh(`rs-edit-${mode}`);
      await sim.start({ monster: 'klowns' });
      await sim.attack('ana', 'doom', { force: 'smite' });
      sim.fault({ on: 'edit', kind: 'card', mode });
      await sim.advance(MINUTE); // the pass dies mid-edit
      expect(sim.crashes).toBe(1);
      expect(sim.siege().card.dirty).toBe(true);
      await sim.advance(MINUTE + 5 * SEC); // the first pass after the restart
      expect(sim.siege().card.dirty).toBe(false);
      expect(cardOf(sim).embeds[0].toJSON().description.split('\n')[1]).toMatch(/`29\/45` HP$/);
    }
  });
});

describe('a restart between the finish and the results', () => {
  test('died before the card was frozen: the next pass freezes it and posts the results, once, paid once', async () => {
    const sim = fresh('rs-freeze');
    await sim.start({ monster: 'klowns' });
    await beat(sim);
    sim.fault({ on: 'edit', kind: 'card', mode: 'crash-before' });
    await sim.advance(MINUTE);
    const s = sim.siege();
    expect(s.status).toBe('won');
    expect(sim.messagesFor(s.id, 'results')).toHaveLength(0);
    const paid = JSON.stringify(sim.scores().siegesPaid);
    await sim.advance(MINUTE + 5 * SEC);
    expect(sim.messagesFor(s.id, 'results')).toHaveLength(1);
    expect(cardOf(sim).embeds[0].toJSON().title).toBe('👹 Killer Klowns is beaten!');
    expect(JSON.stringify(sim.scores().siegesPaid)).toBe(paid);
    sim.finalChecks();
  });

  test('died mid-send of the results (claimed, never recorded): never posted twice — and after 2 minutes given up, so the next siege can start (#1)', async () => {
    for (const mode of ['crash-before', 'crash-after']) {
      const sim = fresh(`rs-results-${mode}`);
      await sim.start({ monster: 'klowns' });
      await beat(sim);
      sim.fault({ on: 'send', kind: 'results', mode });
      await sim.advance(MINUTE);
      const s = sim.siege();
      expect(s.result).toMatchObject({ claimedAt: expect.any(Number), announcedAt: null });
      expect(sim.messagesFor(s.id, 'results')).toHaveLength(mode === 'crash-after' ? 1 : 0);
      // Within the window it might still be on its way
      const early = await sim.start({ monster: 'blob' });
      expect(early.reply.content).toBe('❌ The last siege\'s results haven\'t been posted yet. Try again in a minute.');
      // The passes after: never re-sent; given up once the claim is 2 minutes old
      await sim.advance(3 * MINUTE);
      expect(sim.siege().result).toMatchObject({ unannounced: 'restart', announcedAt: expect.any(Number) });
      expect(sim.messagesFor(s.id, 'results')).toHaveLength(mode === 'crash-after' ? 1 : 0);
      const next = await sim.start({ monster: 'blob' });
      expect(next.reply.content).toMatch(/^🟢 \*\*The Blob\*\* is attacking/);
      sim.finalChecks();
    }
  });

  test('restarts at every pass of a whole siege: the same one card, one results message, one payout', async () => {
    const sim = fresh('rs-every-pass');
    await sim.start({ monster: 'blob' });
    await sim.attack('ana', 'potion', { force: 'poisoned' });
    await sim.attack('ben', 'doom', { force: 'smite' });
    for (let i = 0; i < 6; i++) {
      await sim.advance(MINUTE);
      await sim.restart();
      await sim.attack(i % 2 ? 'ana' : 'ben', 'doom', { force: 'smite' });
    }
    await beat(sim);
    await sim.advance(MINUTE);
    await sim.restart();
    await sim.advance(2 * MINUTE);
    const s = sim.siege();
    expect(s.status).toBe('won');
    expect(sim.messagesFor(s.id, 'card')).toHaveLength(1);
    expect(sim.messagesFor(s.id, 'results')).toHaveLength(1);
    expect(Object.keys(sim.scores().siegesPaid)).toEqual([s.id]);
    sim.finalChecks();
  });
});

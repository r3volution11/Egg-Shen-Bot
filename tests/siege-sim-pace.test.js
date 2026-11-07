/**
 * Pace (2.74.0), end to end through the simulator (tests/harness/siegeSim.js):
 * the real /siege, /rescue, /potion, /doom and /eggshen-config-games and the
 * real scheduler, against the strict fake Discord, with every invariant —
 * the pace's own (busy-only actions and digest pings, the allowance, one
 * report a night pinging nobody, held results, night-boundary ends) among
 * them — checked after every step.
 *
 * A server that never chose a pace is on week (Doug, 2026-11-04). Each
 * preset gets a win and an escape; a week campaign gets the things a week
 * brings: 3 a.m., the daily report (and a restart in the middle of one),
 * the allowance, the pot, a day out after a digest, per-night growth, and
 * a quick siege that was running when 2.74 deployed.
 *
 * Long gaps are jumped (sim.jumpTo: the bot asleep, no passes between):
 * a week minute by minute is 10,000 passes.
 *
 * Run:        npm test -- tests/siege-sim-pace.test.js
 * Transcript: SIM_REPORT=/tmp/siege-sim npm test -- tests/siege-sim-pace.test.js
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadSim, clock, MINUTE, Sim } from './harness/siegeSim.js';
import { HAPPENINGS } from '../src/data/gameHappenings.js';

const SEC = 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 10, 9, 20, 0, 0); // Monday 20:00 UTC: the night of 2026-11-09
const sec = (ms) => Math.floor(ms / 1000);
let mods;

beforeAll(async () => {
  clock.install();
  mods = await loadSim();
});

const PACES = () => mods.rewards.SIEGE_PACES;
const fighter = (sim, id) => sim.siege().participants[id];
const lines = (m) => m.content.split('\n');
const embedText = (m) => JSON.stringify(m.embeds.map(e => (typeof e.toJSON === 'function' ? e.toJSON() : e)));

/**
 * A siege at `pace`, game twists, random happenings and sieges off, and
 * `fighters` each in it with one smite. `active`: members who played in the
 * week before (A7) — a fresh server has none, and its monster starts at the
 * 40-HP floor; a real server's campaign is mostly that base.
 */
async function campaign(name, pace, { monster = 'blob', fighters = ['ana', 'ben', 'cat'], length = null, seed = 7, config = {}, at = T0, active = 0 } = {}) {
  clock.now = at;
  const sim = new Sim(name, { seed, pace });
  for (let i = 0; i < active; i++) mods.happenings.noteActivity(sim.guildId, { channelId: 'games', userId: `regular${i}` }, at - 2 * DAY);
  await sim.configure({ twists: false, happeningFrequency: 'off', siegeFrequency: 'off', ...config });
  // The admin's /siege start, its reply kept for the tests that read it
  sim.started = await sim.start({ monster, length: length ?? PACES()[pace].span });
  for (const u of fighters) await sim.attack(u, 'doom', { force: 'smite' });
  return sim;
}

/** Attack round after round (21 s apart, past the cooldown) until it's at 0 HP or `who` have no attacks left today */
async function beat(sim, who = ['ana', 'ben', 'cat']) {
  for (let round = 0; round < 40 && sim.siege().hp > 0; round++) {
    await sim.advance(21 * SEC);
    for (const u of who) {
      if (sim.siege().hp <= 0) break;
      const p = fighter(sim, u);
      const t = mods.pace.timingsOf(sim.siege());
      if (t.allowance && mods.store.attacksTonight(p, clock.now) >= t.allowance) continue;
      await sim.attack(u, 'doom', { force: 'smite' });
    }
  }
}

/** The siege's points each member holds in the scores file (siege game, all time) */
const siegePoints = (sim) => sim.siegePoints();

// ── the default ─────────────────────────────────────────────────────────

describe('a server that never chose a pace is on week', () => {
  test('/siege start with no length: a week campaign to the night boundary, its timings on the record; the card and the settings say so', async () => {
    clock.now = T0;
    const sim = new Sim('pace-default', { seed: 3, pace: null });
    const shown = await sim.command('admin', 'eggshen-config-games', { subcommand: 'happenings' });
    expect(shown.reply.content).toContain('• Happenings: **on** · random ones: **Normal (about one a week when busy)**');
    expect(shown.reply.content).toContain('• Pace: **Week** (the default) · a siege lasts **a week**, ending at 12:00 UTC');
    expect(shown.reply.content).toContain('• Random sieges: **normal**: the next comes 3 days after the last one ends, while people play');
    expect(shown.reply.content).toContain('-# Happenings last 24× as long (about a day), at most 2 a week');
    expect(shown.reply.content).toContain('-# The monster acts every 30 minutes while people fight · 22 hours to free a grabbed fighter · 8 attacks a night each · attacks pay into the pot · a report each night');
    const start = await sim.start({ monster: 'blob' });
    const s = sim.siege();
    // Monday 20:00: its first night ends Tuesday 12:00 (16 hours on, a night of its own), its seventh Monday the 16th
    expect(s.endsAt).toBe(Date.UTC(2026, 10, 16, 12));
    expect(s.t).toMatchObject({ key: 'week', allowance: 8, pot: true, report: true, nightEnd: true, freeMinutes: 1320, N: 7 });
    expect(start.reply.content).toBe(`🟢 **The Blob** is attacking <#games> until <t:${sec(s.endsAt)}:f> (<t:${sec(s.endsAt)}:R>) with \`${s.hp}\` HP.\n-# Week pace: the monster acts every 30 minutes of fighting · 22 hours to free someone it grabs · 8 attacks a night each · attacks pay into the pot · a report each night.`);
    const card = sim.messagesFor(s.id, 'card')[0];
    expect(card.embeds[0].toJSON().description).toContain(`Ends <t:${sec(s.endsAt)}:f> (<t:${sec(s.endsAt)}:R>)`);
    expect(card.embeds[0].toJSON().description).toContain('⚔️ `8` attacks a night each · 🍯 Pot: `24`, paid out when it\'s beaten');
    expect(card.embeds[0].toJSON().footer.text).toBe('Siege · the card updates every 10 minutes');
    sim.finalChecks();
  });

  test('an admin picks the pace; any length takes the nearest preset (5 days is a week\'s), and a running siege never changes', async () => {
    clock.now = T0;
    const sim = new Sim('pace-pick', { seed: 3, pace: 'quick' });
    const saved = await sim.command('admin', 'eggshen-config-games', { subcommand: 'happenings', options: { pace: 'day' } });
    expect(saved.reply.content).toContain('• Pace: **Day** · a siege lasts **a day**');
    expect((await sim.start({ monster: 'blob', length: 5 * 1440 })).reply.content).toContain('Week pace:');
    const s = sim.siege();
    expect(s.t).toMatchObject({ key: 'week', N: 5 });
    expect(s.endsAt).toBe(Date.UTC(2026, 10, 14, 12)); // its 5th night ends Saturday 12:00
    await sim.command('admin', 'eggshen-config-games', { subcommand: 'happenings', options: { pace: 'quick' } });
    await sim.attack('ana', 'doom', { force: 'smite' });
    expect(sim.siege().t).toEqual(s.t);
    expect(sim.siege().endsAt).toBe(s.endsAt);
    sim.finalChecks();
  });
});

// ── every preset: a win and an escape ───────────────────────────────────

describe.each(['quick', 'evening', 'day', 'days3', 'week'])('at %s pace', (pace) => {
  test('a win: posted at once, the pool paid per fighter-night (the pot from day on), the MVP +5 × its honour', async () => {
    const sim = await campaign(`pace-win-${pace}`, pace);
    const t = PACES()[pace];
    const s0 = sim.siege();
    expect(s0.t.key).toBe(pace);
    // An attack's own points: into the pot from day on, the attacker's before
    const before = siegePoints(sim);
    if (t.pot) for (const u of ['ana', 'ben', 'cat']) expect(before[u] ?? 0).toBe(0);
    else for (const u of ['ana', 'ben', 'cat']) expect(before[u]).toBeGreaterThan(0);
    await beat(sim);
    expect(sim.siege().hp).toBe(0);
    await sim.advance(MINUTE);
    const s = sim.siege();
    expect(s.status).toBe('won');
    expect(s.result.holdUntil).toBeUndefined();
    expect(sim.messagesFor(s.id, 'results')).toHaveLength(1);
    // The pool, worked out here from the rules: per fighter (quick) or fighter-night, clamped, split by contribution
    const fighters = mods.store.fightersOf(s);
    const units = t.growthPer === 'night' ? fighters.reduce((n, f) => n + Math.max(1, Object.keys(f.nights || {}).length), 0) : fighters.length;
    const pool = Math.min(t.pool.poolMax, Math.max(t.pool.poolMin, t.pool.perFighter * units));
    const total = fighters.reduce((n, f) => n + f.contribution, 0);
    expect(s.result.grants.map(g => g.points)).toEqual(fighters.map((f, i) => Math.min(t.pool.eachMax, Math.max(2, Math.round(pool * f.contribution / total))) + (i === 0 ? 5 * t.honour : 0)));
    const head = sim.messagesFor(s.id, 'results')[0].embeds[0].toJSON().description.split('\n')[0];
    expect(head).toContain(`the MVP gets +${5 * t.honour} and loot`);
    if (t.pot) expect(head).toContain(`The pot (${pool}, ${t.pool.perFighter} a fighter a night) was split by what each did`);
    sim.finalChecks();
  });

  test('an escape: at its end (a night boundary at 3 days and a week), −3 each; from day on the results wait for someone to play', async () => {
    const sim = await campaign(`pace-escape-${pace}`, pace, { fighters: ['ana', 'ben'] });
    const t = PACES()[pace];
    const s0 = sim.siege();
    if (t.nightEnd) expect(new Date(s0.endsAt).getUTCHours()).toBe(12);
    else expect(s0.endsAt).toBe(T0 + t.span * MINUTE);
    // What each has this month: an escape takes 3, never below 0 for the month
    const month = mods.scores.periodKeys(clock.now).month;
    const had = (u) => Object.values(sim.scores().users[u]?.games || {}).reduce((n, g) => n + (g?.[month]?.points || 0), 0);
    const want = ['ana', 'ben'].map(u => -Math.min(3, had(u)) || 0);
    sim.jumpTo(s0.endsAt);
    await sim.tick();
    const s = sim.siege();
    expect(s.status).toBe('escaped');
    expect(s.result.grants.map(g => [g.loss, g.points])).toEqual(want.map(w => [3, w]));
    if (!t.holdResults) {
      expect(sim.messagesFor(s.id, 'results')).toHaveLength(1);
      sim.finalChecks();
      return;
    }
    // Held: nobody's been playing since it got away, so nobody's pinged yet
    expect(s.result.holdUntil).toBe(s.finishedAt + 12 * HOUR);
    await sim.advance(10 * MINUTE);
    expect(sim.messagesFor(s.id, 'results')).toHaveLength(0);
    // Someone plays a game: the next pass posts them, once
    await sim.play('cat', 'doom', 'ana');
    await sim.advance(MINUTE);
    const posted = sim.messagesFor(s.id, 'results');
    expect(posted).toHaveLength(1);
    expect(posted[0].allowedMentions.users.sort()).toEqual(['ana', 'ben']);
    await sim.advance(5 * MINUTE);
    expect(sim.messagesFor(s.id, 'results')).toHaveLength(1);
    sim.finalChecks();
  });
});

test('held results nobody plays for are posted 12 hours after the escape', async () => {
  const sim = await campaign('pace-held-12h', 'week', { fighters: ['ana', 'ben'] });
  const s0 = sim.siege();
  sim.jumpTo(s0.endsAt);
  await sim.tick();
  const until = sim.siege().result.holdUntil;
  sim.jumpTo(until - MINUTE);
  await sim.tick();
  expect(sim.messagesFor(s0.id, 'results')).toHaveLength(0);
  await sim.advance(MINUTE);
  expect(sim.messagesFor(s0.id, 'results')).toHaveLength(1);
  sim.finalChecks();
});

test('an admin starting the next siege while an escape\'s results are held posts them first', async () => {
  const sim = await campaign('pace-held-admin', 'week', { fighters: ['ana', 'ben'] });
  const s0 = sim.siege();
  sim.jumpTo(s0.endsAt);
  await sim.tick();
  const next = await sim.start({ monster: 'gremlins' });
  expect(next.reply.content).toMatch(/^🦎|is attacking/);
  expect(sim.messagesFor(s0.id, 'results')).toHaveLength(1);
  expect(sim.siege().monster).toBe('gremlins');
  sim.finalChecks();
});

// ── a week ──────────────────────────────────────────────────────────────

describe('a week campaign, as members live it', () => {
  test('3 a.m.: with nobody fighting the monster does nothing, however due; it acts once someone is', async () => {
    const sim = await campaign('pace-3am', 'week');
    const acted = sim.siege().lastAction;
    // The evening's over: 03:00 the next morning, its action brought right up to date
    sim.jumpTo(Date.UTC(2026, 10, 10, 3, 0));
    sim.luckQueue.push(0.1, 0.5, 0.5);
    sim.hurry();
    await sim.advance(45 * MINUTE);
    expect(sim.siege().lastAction).toEqual(acted);
    expect(sim.siege().pending).toBeNull();
    expect(sim.sends().filter(m => m.kindTag === 'action')).toHaveLength(0);
    sim.luckQueue.length = 0;
    // Tuesday evening: ana and ben are back, and it's busy again
    sim.jumpTo(Date.UTC(2026, 10, 10, 20, 0));
    await sim.attack('ana', 'doom', { force: 'smite' });
    await sim.attack('ben', 'doom', { force: 'smite' });
    const msg = await sim.act('grab', ['ben']);
    expect(msg?.kindTag).toBe('action');
    expect(msg.allowedMentions.users).toEqual(['ben']);
    expect(lines(msg).at(-1)).toBe('-# 🪤 Free them with `/rescue attempt target:@ben` within 22 hours, or the monster digests them: −5 and out for a day. A grabbed fighter can\'t attack.');
    sim.finalChecks();
  });

  test('its clock is busy minutes: with people fighting it first acts 30 minutes of fighting in', async () => {
    const sim = await campaign('pace-busy', 'week', { fighters: ['ana'], active: 10 });
    const first = clock.now;
    // ana and ben trade attacks every 5 minutes (their 8 a day last 40 minutes)
    let n = 0;
    while (!sim.siege().lastAction && n < 14) {
      await sim.advance(5 * MINUTE);
      await sim.attack(n % 2 ? 'ana' : 'ben', 'doom', { force: 'smite' });
      n += 1;
    }
    const last = sim.siege().lastAction;
    expect(last).not.toBeNull();
    // Not before 30 busy minutes; by 35 at the latest (the pass after an attack)
    expect(last.at - first).toBeGreaterThanOrEqual(30 * MINUTE);
    expect(last.at - first).toBeLessThanOrEqual(35 * MINUTE);
    sim.finalChecks();
  });

  test('the allowance: the 9th attack tonight is refused for nothing — 00:00 UTC is the same night; freeing stays unlimited; the next night (12:00 UTC) brings 8 more', async () => {
    const sim = await campaign('pace-allowance', 'week', { fighters: ['ana', 'ben'], monster: 'klowns', active: 10 });
    for (let i = 1; i < 8; i++) {
      await sim.advance(21 * SEC);
      const hit = await sim.attack('ana', 'food', { force: 'splash' });
      expect(hit.reply.content).toContain(`⚔️ ${8 - i - 1} of 8 attacks left tonight`);
    }
    await sim.advance(21 * SEC);
    const refused = await sim.attack('ana', 'food');
    const noon = sec(Date.UTC(2026, 10, 10, 12));
    expect([refused.reply.ephemeralFor, refused.reply.content]).toEqual(['ana', `⚔️ You've made your 8 attacks tonight. The next 8 come <t:${noon}:R> (12:00 UTC). Freeing a grabbed fighter with \`/rescue\` and curing with a helpful \`/potion\` are unlimited.`]);
    const status = await sim.status('ana');
    expect(status.reply.content).toContain('⚔️ attacks tonight `8/8`');
    // Freeing isn't an attack
    await sim.act('grab', ['ben']);
    const freed = await sim.rescue('ana', 'ben', { force: 'rescued' });
    expect(lines(freed.reply).at(-1)).toBe('-# 🛟 ana freed ben from Killer Klowns: +12 to their share of the fight.');
    // Past 00:00 UTC it's still Monday's night: no more (it once gave 16 in a quarter of an hour)
    sim.jumpTo(Date.UTC(2026, 10, 10, 0, 1));
    const still = await sim.attack('ana', 'food', { force: 'splat' });
    expect(still.reply.ephemeralFor).toBe('ana');
    // Tuesday's night, from 12:00 UTC: 8 more
    sim.jumpTo(Date.UTC(2026, 10, 10, 12, 1));
    const again = await sim.attack('ana', 'food', { force: 'splat' });
    expect(again.reply.ephemeralFor).toBeNull();
    expect(again.reply.content).toContain('⚔️ 7 of 8 attacks left tonight');
    sim.finalChecks();
  });

  test('a sacrifice holds the rescuer for the week\'s window too, and the reply says until when', async () => {
    const sim = await campaign('pace-sacrifice', 'week', { active: 10 });
    await sim.act('grab', ['ben']);
    sim.calm();
    const swapped = await sim.rescue('ana', 'ben', { force: 'sacrificed' });
    const ana = fighter(sim, 'ana');
    expect(ana.caught).toMatchObject({ by: 'sacrifice', at: clock.now, until: clock.now + 22 * HOUR });
    expect(lines(swapped.reply).at(-1)).toContain(`by <t:${sec(ana.caught.until)}:t>`);
    sim.finalChecks();
  });

  test('the pot: an attack scores nothing itself, and says where its points went — and that the pot is per fighter-night, not its points', async () => {
    const sim = await campaign('pace-pot', 'week', { fighters: ['ana'], active: 10 });
    const hit = await sim.attack('ben', 'doom', { force: 'smite' });
    const pot = mods.store.potOf(sim.siege());
    // "Into the pot (24)" read as if the attack's points should have moved
    // it; they don't — the pot is 4 a fighter-night (review, 2026-11-06)
    expect(lines(hit.reply)).toContain(`-# 🍯 Your points go to the pot (now ${pot}): paid out when it's beaten · ⚔️ 7 of 8 attacks left tonight`);
    expect(hit.reply.content).toMatch(/ben ±0 \(0 pts\)/);
    await sim.advance(21 * SEC);
    const again = await sim.attack('ben', 'doom', { force: 'smite' });
    expect(mods.store.potOf(sim.siege())).toBe(pot);
    expect(lines(again.reply)).toContain(`-# 🍯 Your points go to the pot (now ${pot}): paid out when it's beaten · ⚔️ 6 of 8 attacks left tonight`);
    // The pot moves on a fighter-night: 4 each, above its floor of 24
    expect(pot).toBe(Math.max(PACES().week.pool.poolMin, PACES().week.pool.perFighter * 2));
    sim.finalChecks();
  });

  test('HP: each member\'s first attack of each night grows it; none in its last day', async () => {
    const sim = await campaign('pace-growth', 'week', { fighters: ['ana'], active: 10 });
    const t = mods.pace.timingsOf(sim.siege());
    // Above the floor, each fighter-night is growth × dial × the monster's hp (the Blob's is 1)
    const grow = () => Math.round(t.growth * sim.siege().dial * 1);
    expect(sim.siege().a7).toBe(10);
    const max0 = sim.siege().maxHp;
    // ana again tonight: nothing
    await sim.advance(21 * SEC);
    await sim.attack('ana', 'doom', { force: 'smite' });
    expect(sim.siege().maxHp).toBe(max0);
    // Tuesday night (after 12:00 UTC): ana's first attack of it grows it
    sim.jumpTo(Date.UTC(2026, 10, 10, 20, 0));
    const hit = await sim.attack('ana', 'doom', { force: 'smite' });
    expect(sim.siege().maxHp).toBe(max0 + grow());
    expect(lines(hit.reply)).toContain(`-# 📈 ana is back for another night: The Blob grows +${grow()} HP.`);
    expect(sim.siege().log.at(-2).text).toBe(`📈 ana is back for another night · +${grow()} HP`);
    // Its last day (the 24 hours before it ends, Monday the 16th, 12:00): nobody grows it
    expect(sim.siege().endsAt).toBe(Date.UTC(2026, 10, 16, 12));
    sim.jumpTo(Date.UTC(2026, 10, 15, 20, 0));
    const late = sim.siege().maxHp;
    await sim.attack('ben', 'doom', { force: 'smite' });
    expect(sim.siege().maxHp).toBe(late);
    sim.finalChecks();
  });

  test('digested: −5 and out for a day — then back in the fight', async () => {
    const sim = await campaign('pace-out', 'week', { active: 10 });
    await sim.act('grab', ['ben']);
    // Nothing else from the monster: this is about ben
    sim.calm();
    const until = fighter(sim, 'ben').caught.until;
    // ana and cat keep it busy until ben's 22 hours are up
    sim.jumpTo(until - 5 * MINUTE);
    await sim.attack('ana', 'doom', { force: 'smite' });
    await sim.advance(6 * MINUTE);
    const ben = fighter(sim, 'ben');
    expect(ben).toMatchObject({ out: true, caught: null });
    // Out for 24 hours from the pass that digested him (the first at or after his deadline)
    expect(ben.outUntil - until).toBeGreaterThanOrEqual(24 * HOUR);
    expect(ben.outUntil - until).toBeLessThan(24 * HOUR + MINUTE);
    const digest = sim.sends().find(m => m.kindTag === 'digest');
    expect(digest.content).toContain('nobody freed them in time. Out for a day: back <t:');
    expect(digest.allowedMentions.users).toEqual(['ben']);
    const refused = await sim.attack('ben', 'doom');
    expect(refused.reply.content).toBe(`😋 The Blob digested you: you're out until <t:${sec(ben.outUntil)}:t> (<t:${sec(ben.outUntil)}:R>).`);
    sim.jumpTo(ben.outUntil);
    await sim.tick();
    expect(fighter(sim, 'ben')).toMatchObject({ out: false, outUntil: null });
    expect(sim.siege().log.at(-1).text).toBe('🔙 ben is back in the fight');
    expect((await sim.attack('ben', 'doom', { force: 'smite' })).reply.ephemeralFor).toBeNull();
    sim.finalChecks();
  });
});

// ── the daily report ────────────────────────────────────────────────────

describe('the daily report', () => {
  /** A Monday-night campaign: ben grabbed, cat poisoned, at 20:30 */
  async function night1(name, seed = 7) {
    const sim = await campaign(name, 'week', { seed });
    await sim.act('poison', ['cat']);
    await sim.act('grab', ['ben']);
    return sim;
  }

  test('one NEW message a night, with the first game played after 12:00 UTC: held, poisoned, last night\'s best — pinging nobody', async () => {
    const sim = await night1('pace-report');
    const s = sim.siege();
    // Tuesday 12:00 UTC: a new night, but nobody's played yet
    sim.jumpTo(Date.UTC(2026, 10, 10, 12, 0));
    await sim.advance(30 * MINUTE);
    expect(sim.messagesFor(s.id, 'report')).toHaveLength(0);
    // A game played (anywhere, any game): the next pass posts it
    await sim.play('ana', 'doom', 'cat');
    await sim.advance(MINUTE);
    const reports = sim.messagesFor(s.id, 'report');
    expect(reports).toHaveLength(1);
    const r = reports[0];
    expect(r.content).toBe('📰 **Night 1 is over** and The Blob is still here. Who needs help tonight:');
    expect(r.allowedMentions).toEqual({ parse: [] });
    const e = r.embeds[0].toJSON();
    expect(e.title).toBe('👹 The Blob: night 1 report');
    const tally = s.nightly['2026-11-09'];
    expect(e.description).toContain(`\`−${tally.damage}\` last night`);
    const field = (name) => e.fields.find(f => f.name.endsWith(name))?.value;
    expect(field('Still held')).toBe(`ben · free them with \`/rescue\` by <t:${sec(fighter(sim, 'ben').caught.until)}:R>`);
    expect(field('Poisoned')).toBe(`cat · a helpful \`/potion give\` cures them (it wears off <t:${sec(fighter(sim, 'cat').poisoned.until)}:R>)`);
    expect(field('Last night').split('\n')).toHaveLength(3);
    expect(field('Tonight')).toContain('Everyone has `8` fresh attacks tonight (a night runs 12:00 to 12:00 UTC)');
    // Not again tonight
    await sim.play('ben', 'doom', 'ana');
    await sim.advance(30 * MINUTE);
    expect(sim.messagesFor(s.id, 'report')).toHaveLength(1);
    sim.finalChecks();
  });

  test('with nobody playing, it posts 12 hours after the boundary; a digest nobody was around for is in it, unpinged', async () => {
    const sim = await night1('pace-report-quiet');
    const s = sim.siege();
    const until = fighter(sim, 'ben').caught.until;
    // Tuesday: nobody plays. ben's 22 hours run out Tuesday evening with nobody fighting
    sim.jumpTo(until - MINUTE);
    await sim.advance(2 * MINUTE);
    expect(fighter(sim, 'ben').out).toBe(true);
    expect(sim.sends().filter(m => m.kindTag === 'digest')).toHaveLength(0);
    expect(sim.siege().unreported.map(d => d.userId)).toEqual(['ben']);
    // With nobody playing, Tuesday's report (the night from 12:00 Tuesday) goes out at 00:00 Wednesday, naming him
    sim.jumpTo(Date.UTC(2026, 10, 11, 0, 0));
    await sim.tick();
    const reports = sim.messagesFor(s.id, 'report');
    expect(reports).toHaveLength(1);
    expect(reports[0].night).toBe('2026-11-10');
    expect(embedText(reports[0])).toContain('Digested while nobody was around');
    // −5, never below 0 for the month: at week pace his attack's points went into the pot
    expect(embedText(reports[0])).toMatch(/ben (−\d|±0) · back <t:\d+:R>/);
    expect(sim.siege().unreported).toEqual([]);
    // Wednesday's: at 00:00 Thursday at the latest
    sim.jumpTo(Date.UTC(2026, 10, 12, 0, 0));
    await sim.tick();
    expect(sim.messagesFor(s.id, 'report').map(m => m.night)).toEqual(['2026-11-10', '2026-11-11']);
    sim.finalChecks();
  });

  test.each([['crash-after', 1], ['crash-before', 0]])('a restart in the middle of one (%s): never a second report that night, and the next night\'s goes out', async (mode, sent) => {
    const sim = await night1(`pace-report-${mode}`);
    const s = sim.siege();
    sim.jumpTo(Date.UTC(2026, 10, 10, 13, 0));
    await sim.play('ana', 'doom', 'cat');
    sim.fault({ on: 'send', kind: 'report', mode });
    await sim.advance(MINUTE);
    expect(sim.crashes).toBe(1);
    expect(sim.messagesFor(s.id, 'report')).toHaveLength(sent);
    await sim.advance(10 * MINUTE);
    expect(sim.messagesFor(s.id, 'report')).toHaveLength(sent);
    expect(sim.siege().report.night).toBe('2026-11-10');
    sim.jumpTo(Date.UTC(2026, 10, 11, 13, 0));
    await sim.play('ana', 'doom', 'cat');
    await sim.advance(MINUTE);
    expect(sim.messagesFor(s.id, 'report').map(m => m.night)).toEqual([...(sent ? ['2026-11-10'] : []), '2026-11-11']);
    sim.finalChecks();
  });

  test('a day siege reports too; a quick or evening one never does', async () => {
    const day = await campaign('pace-report-day', 'day');
    day.jumpTo(Date.UTC(2026, 10, 10, 13, 0));
    await day.play('ana', 'doom', 'cat');
    await day.advance(MINUTE);
    expect(day.messagesFor(day.siege().id, 'report')).toHaveLength(1);
    day.finalChecks();
    const evening = await campaign('pace-report-evening', 'evening', { at: Date.UTC(2026, 10, 9, 10, 0) });
    evening.jumpTo(Date.UTC(2026, 10, 9, 12, 30)); // across the boundary, still live (4 hours)
    await evening.play('ana', 'doom', 'cat');
    await evening.advance(5 * MINUTE);
    expect(evening.messagesFor(evening.siege().id, 'report')).toHaveLength(0);
    evening.finalChecks();
  });
});

// ── the deploy ──────────────────────────────────────────────────────────

describe('migrating at deploy', () => {
  test('a quick siege running when 2.74 deploys finishes on its old rules; its dial was the old one; the next is a week campaign on a dial of its own', async () => {
    clock.now = T0;
    const sim = new Sim('pace-migrate', { seed: 5, pace: 'quick' });
    await sim.configure({ twists: false, happeningFrequency: 'off', siegeFrequency: 'off' });
    await sim.start({ monster: 'blob', minutes: 45 });
    for (const u of ['ana', 'ben']) await sim.attack(u, 'doom', { force: 'smite' });
    // The record as 2.73 wrote it: no timings, no busy clock, no tallies — and a dial moved by sieges past
    mods.happenings.mutate(sim.guildId, (d) => {
      for (const k of ['t', 'nextActionBusy', 'busy', 'lastAttackAt', 'fn', 'nightly', 'report', 'unreported']) delete d.siege[k];
      d.siegeDial = 1.1;
    });
    // The deploy: the server never chose a pace (it's week now), and the bot restarts
    const { loadGuildConfig, saveGuildConfig } = await import('../src/utils/guildConfig.js');
    const cfg = await loadGuildConfig(sim.guildId);
    delete cfg.games.pace;
    await saveGuildConfig(sim.guildId, cfg);
    const endsAt = sim.siege().endsAt;
    const maxHp = sim.siege().maxHp;
    await sim.restart();
    // Quick rules: the monster acts on the wall clock with a 10-minute window, no allowance, no pot
    const grab = await sim.act('grab', ['ben']);
    expect(lines(grab).at(-1)).toContain('within 10 minutes, or the monster digests them: −5 and out of the fight');
    expect(fighter(sim, 'ben').caught.until - fighter(sim, 'ben').caught.at).toBe(10 * MINUTE);
    const hit = await sim.attack('ana', 'doom', { force: 'smite' });
    expect(hit.reply.content).not.toContain('🍯');
    expect(hit.reply.content).not.toContain('attacks left today');
    expect(hit.reply.content).toMatch(/ana \+2 \(/);
    expect(sim.siege().maxHp).toBe(maxHp);
    // Nothing added to the record makes it anything but quick
    expect(sim.siege().t).toBeUndefined();
    await beat(sim, ['ana', 'cat']);
    await sim.advance(MINUTE);
    const won = sim.siege();
    expect(won.status).toBe('won');
    expect(won.finishedAt).toBeLessThan(endsAt);
    expect(sim.messagesFor(won.id, 'results')).toHaveLength(1);
    // The old dial was the quick one, and moved by the quick step
    const state = sim.state();
    expect(state.siegeDial).toBeCloseTo(1.1 * 1.05, 6);
    expect(state.siegeDials).toBeUndefined();
    // The next one: a week campaign, on week's own dial (1)
    await sim.start({ monster: 'gremlins' });
    expect(sim.siege().t.key).toBe('week');
    expect(sim.siege().dial).toBe(1);
    await sim.restart();
    await sim.advance(2 * MINUTE);
    expect(sim.messagesFor(won.id, 'results')).toHaveLength(1);
    sim.finalChecks();
  });
});

// ── where it all goes ───────────────────────────────────────────────────

describe('channels', () => {
  test('the siege\'s channel taken off the games list mid-campaign: the monster stops acting there, no report goes there, and the results go to the games channel', async () => {
    const sim = await campaign('pace-channels', 'week', { fighters: ['ana', 'ben'], active: 10 });
    const s = sim.siege();
    await sim.configure({ channelMode: 'only', channels: ['lobby'] });
    // A pending grab can't be announced where the games aren't played: void
    sim.luckQueue.push(0.1, 0.5, 0.5);
    sim.hurry();
    await sim.advance(2 * MINUTE);
    sim.luckQueue.length = 0;
    expect(sim.sends().filter(m => m.kindTag === 'action')).toHaveLength(0);
    sim.jumpTo(Date.UTC(2026, 10, 10, 13, 0));
    await sim.play('ana', 'doom', 'ben', { channel: 'lobby' });
    await sim.advance(MINUTE);
    expect(sim.siege().report).toMatchObject({ night: '2026-11-10', claimedAt: null, tries: 1 });
    // Tried PACE_RULES.reportTries times (one a pass), never sent there, then that night is given up
    await sim.advance((mods.rewards.PACE_RULES.reportTries - 1) * MINUTE);
    expect(sim.messagesFor(s.id, 'report')).toHaveLength(0);
    expect(sim.siege().report).toMatchObject({ night: '2026-11-10', unannounced: 'no-channel', tries: mods.rewards.PACE_RULES.reportTries });
    await sim.advance(5 * MINUTE);
    expect(sim.messagesFor(s.id, 'report')).toHaveLength(0);
    sim.jumpTo(s.endsAt);
    await sim.tick();
    await sim.advance(MINUTE);
    await sim.play('ana', 'doom', 'ben', { channel: 'lobby' });
    await sim.advance(MINUTE);
    const results = sim.messagesFor(s.id, 'results');
    expect(results).toHaveLength(1);
    expect(results[0].channelId).toBe('lobby');
    sim.finalChecks();
  });
});

// ── happenings and campaigns side by side ───────────────────────────────

describe('happenings and campaigns', () => {
  test.each([['week', true], ['quick', false]])('at %s pace, a random siege during a happening: %s', async (pace, starts) => {
    clock.now = T0;
    const sim = new Sim(`pace-together-${pace}`, { seed: 9, pace });
    await sim.configure({ twists: false, happeningFrequency: 'off', siegeFrequency: 'normal' });
    const on = await sim.command('admin', 'eggshen-config-games', { subcommand: 'happenings', options: { start: 'fullmoon' } });
    expect(on.reply.content).toContain('🌕 **Full Moon** is on until');
    // At week pace it lasts a day, at quick an hour
    const h = sim.state().happening;
    expect(h.endsAt - h.startedAt).toBe(pace === 'week' ? 24 * HOUR : HOUR);
    // People are playing, and the dice say yes
    for (const [u, v] of [['ana', 'ben'], ['ben', 'cat'], ['cat', 'ana']]) await sim.play(u, 'doom', v);
    sim.luckQueue.push(0, 0.5);
    await sim.advance(MINUTE);
    sim.luckQueue.length = 0;
    const s = sim.siege();
    if (starts) {
      expect(s).toMatchObject({ status: 'live', source: 'random' });
      expect(s.t.key).toBe('week');
      // …and an attack in it is the fight alone: the Full Moon's ×2 never touches it
      const hit = await sim.attack('ana', 'doom', { force: 'smite' });
      expect(hit.reply.content).not.toContain('🌕');
    } else {
      expect(s).toBeNull();
    }
    sim.finalChecks();
  });
});

// ── the review's findings (2026-11-04) ──────────────────────────────────

describe('the review\'s findings', () => {
  test('#2 a fighter who isn\'t here is never grabbed or poisoned: dev fought Monday, and Wednesday the monster takes only ana and ben', async () => {
    const sim = await campaign('pace-r-absent', 'week', { fighters: ['ana', 'ben', 'dev'], active: 10 });
    sim.calm();
    sim.jumpTo(Date.UTC(2026, 10, 12, 1, 0));
    const taken = new Set();
    for (let i = 0; i < 6; i++) {
      await sim.attack('ana', 'doom', { force: 'smite' });
      await sim.attack('ben', 'doom', { force: 'smite' });
      // Due now, any kind, the victim draw spread over the list
      sim.luckQueue.push((i % 3) / 3 + 0.05, (i + 0.5) / 6, 0.5);
      sim.hurry();
      await sim.advance(MINUTE);
      sim.luckQueue.length = 0;
      for (const v of sim.siege().lastAction?.victims || []) taken.add(v);
      // Whoever it took is freed (or cured), so it has someone to pick next time
      for (const id of ['ana', 'ben']) {
        const other = id === 'ana' ? 'ben' : 'ana';
        if (fighter(sim, id).caught) await sim.rescue(other, id, { force: 'rescued' });
      }
      sim.calm();
      await sim.advance(21 * SEC);
    }
    expect(taken.size).toBeGreaterThan(0); // it did take people: just never dev
    expect(taken.has('dev')).toBe(false);
    expect(sim.sends().filter(m => m.kindTag === 'action').some(m => (m.allowedMentions.users || []).includes('dev'))).toBe(false);
    sim.finalChecks();
  });

  test('#3 at evening pace, a fighter digested with nobody attacking is still told: a NEW message pinging them', async () => {
    const sim = await campaign('pace-r-evening-digest', 'evening', { fighters: ['ana', 'ben'], active: 10 });
    await sim.act('grab', ['ben']);
    sim.calm();
    // ana tries and fails to free ben; nobody attacks, so the drive-in isn't busy when the 30 minutes are up
    for (let i = 0; i < 3; i++) {
      await sim.advance(5 * MINUTE);
      await sim.rescue('ana', 'ben', { force: 'caught' });
    }
    await sim.advance(20 * MINUTE);
    expect(fighter(sim, 'ben').out).toBe(true);
    expect(mods.store.isBusy(sim.siege(), clock.now)).toBe(false);
    const digest = sim.sends().filter(m => m.kindTag === 'digest');
    expect(digest).toHaveLength(1);
    expect(digest[0].allowedMentions.users).toEqual(['ben']);
    expect(sim.siege().unreported).toEqual([]);
    sim.finalChecks();
  });

  test.each([['11:59', 11, 59, 168 + 1 / 60], ['12:01', 12, 1, 168 - 1 / 60]])('#5 a week started at %s UTC: seven nights, no "Night 1 is over" minutes later', async (label, h, m, hours) => {
    const at = Date.UTC(2026, 10, 10, h, m);
    const sim = await campaign(`pace-r-start-${h}${m}`, 'week', { fighters: ['ana', 'ben'], active: 10, at });
    const s = sim.siege();
    expect((s.endsAt - s.startedAt) / HOUR).toBeCloseTo(hours, 6);
    expect(s.endsAt).toBe(Date.UTC(2026, 10, 17, 12));
    await sim.advance(3 * MINUTE);
    await sim.play('cat', 'doom', 'ana');
    await sim.advance(2 * MINUTE);
    expect(sim.messagesFor(s.id, 'report')).toHaveLength(0);
    // Its first night ends at Wednesday's boundary: that report is night 1's
    sim.jumpTo(Date.UTC(2026, 10, 11, 13, 0));
    await sim.play('cat', 'doom', 'ana');
    await sim.advance(MINUTE);
    const reports = sim.messagesFor(s.id, 'report');
    expect(reports).toHaveLength(1);
    expect(reports[0].content).toMatch(/^📰 \*\*Night 1 is over\*\*/);
    // …with everything since the start: ana's and ben's attacks, either side of 12:00 on Tuesday
    const tallied = JSON.stringify(reports[0].embeds[0].toJSON().fields[0]);
    expect(tallied).toContain('ana');
    expect(tallied).toContain('ben');
    sim.finalChecks();
  });

  test('#6 freed at noon with nobody attacking: the card shows it within the 10 minutes, not the next evening', async () => {
    const sim = await campaign('pace-r-card', 'week', { fighters: ['ana', 'ben'], active: 10 });
    await sim.act('grab', ['ben']);
    sim.calm();
    await sim.advance(11 * MINUTE);
    sim.jumpTo(Date.UTC(2026, 10, 10, 13, 0));
    await sim.rescue('ana', 'ben', { force: 'rescued' });
    expect(mods.store.isBusy(sim.siege(), clock.now)).toBe(false);
    await sim.advance(11 * MINUTE);
    const s = sim.siege();
    expect(s.card.dirty).toBe(false);
    const card = sim.channel('games').messageList.find(x => x.id === s.card.messageId).snapshot();
    expect(JSON.stringify(card.embeds[0].fields)).not.toContain('🪤 Caught');
    sim.finalChecks();
  });

  test('found re-tuning: Gremlins and the Wolfman heal per event, scaled by the pace — a week has ~10× the misses and ~5× the actions of 45 minutes', async () => {
    const heal = PACES().week.heal;
    expect(PACES().quick.heal).toEqual({ miss: 1, act: 1 });
    // Gremlins: a missed throw heals 2% × 0.15 of max HP (the harness checks the store's number against the rules every step too)
    const g = await campaign('pace-r-heal-gremlins', 'week', { monster: 'gremlins', fighters: ['ana', 'ben'], active: 40 });
    const gs = g.siege();
    await g.advance(21 * SEC);
    const miss = await g.attack('ana', 'food', { force: 'splash' });
    const fed = Math.round(g.monster('gremlins').traits.missHeal * heal.miss * gs.maxHp);
    expect(fed).toBeGreaterThan(0);
    expect(fed).toBeLessThan(Math.round(g.monster('gremlins').traits.missHeal * gs.maxHp));
    expect(lines(miss.reply)).toContain(`-# 💚 Gremlins feeds on the miss and heals ${fed} HP.`);
    expect(g.siege().healed).toBe(fed);
    g.finalChecks();
    // The Wolfman: each action heals 1.5% × 0.2 — and the message says what the store did
    const w = await campaign('pace-r-heal-wolfman', 'week', { monster: 'wolfman', fighters: ['ana', 'ben', 'cat'], active: 40 });
    const before = w.siege().hp;
    const msg = await w.act('roar');
    const s = w.siege();
    const healed = Math.min(Math.round(w.monster('wolfman').traits.actHeal * heal.act * s.maxHp), s.maxHp - before);
    expect(healed).toBeGreaterThan(0);
    expect(healed).toBeLessThan(Math.round(w.monster('wolfman').traits.actHeal * s.maxHp));
    expect(lines(msg)).toContain(`-# 💚 The Wolfman heals ${healed} HP.`);
    expect([s.hp, s.healed]).toEqual([before + healed, healed]);
    w.finalChecks();
  });

  describe('#7 a report Discord refuses', () => {
    /** Monday: ben grabbed and digested with nobody around (kept for the report); Tuesday after 12:00, a game is played */
    async function digestedBen(name) {
      const sim = await campaign(name, 'week', { fighters: ['ana', 'ben'], active: 10 });
      await sim.act('grab', ['ben']);
      sim.calm();
      sim.jumpTo(fighter(sim, 'ben').caught.until);
      await sim.tick();
      expect(sim.siege().unreported.map(d => d.userId)).toEqual(['ben']);
      sim.jumpTo(Date.UTC(2026, 10, 10, 20, 0));
      await sim.play('ana', 'doom', 'cat');
      return sim;
    }

    test('for now (a 503): the claim is released, the next pass posts it, once, naming the digest', async () => {
      const sim = await digestedBen('pace-r-report-503');
      const s = sim.siege();
      sim.fault({ on: 'send', kind: 'report', mode: 'fail' });
      await sim.advance(MINUTE);
      expect(sim.messagesFor(s.id, 'report')).toHaveLength(0);
      expect(sim.siege().report).toMatchObject({ night: '2026-11-10', claimedAt: null, tries: 1 });
      expect(sim.siege().unreported.map(d => d.userId)).toEqual(['ben']);
      await sim.advance(MINUTE);
      const reports = sim.messagesFor(s.id, 'report');
      expect(reports).toHaveLength(1);
      expect(embedText(reports[0])).toContain('Digested while nobody was around');
      expect(sim.siege().unreported).toEqual([]);
      await sim.advance(10 * MINUTE);
      expect(sim.messagesFor(s.id, 'report')).toHaveLength(1);
      sim.finalChecks();
    });

    test('nowhere to post it for a minute (Send Messages taken away): tried again, and posted once, when it\'s back', async () => {
      const sim = await digestedBen('pace-r-report-perm');
      const s = sim.siege();
      sim.grant(s.channelId, ['ViewChannel', 'EmbedLinks']);
      await sim.advance(MINUTE);
      expect(sim.messagesFor(s.id, 'report')).toHaveLength(0);
      // Released for the next pass, not given up: that night's report and ben still wait
      expect(sim.siege().report).toMatchObject({ night: '2026-11-10', claimedAt: null, tries: 1, unannounced: null });
      expect(sim.siege().unreported.map(d => d.userId)).toEqual(['ben']);
      sim.grant(s.channelId, ['ViewChannel', 'SendMessages', 'EmbedLinks']);
      await sim.advance(MINUTE);
      const reports = sim.messagesFor(s.id, 'report');
      expect(reports.map(r => r.night)).toEqual(['2026-11-10']);
      expect(lines(reports[0])[0]).toContain('**Night 1 is over**');
      expect(embedText(reports[0])).toContain('Digested while nobody was around');
      expect(sim.siege().unreported).toEqual([]);
      await sim.advance(10 * MINUTE);
      expect(sim.messagesFor(s.id, 'report')).toHaveLength(1);
      sim.finalChecks();
    });

    test('for good (the channel gone for it): that night is given up, and the digest waits for the next', async () => {
      const sim = await digestedBen('pace-r-report-gone');
      const s = sim.siege();
      sim.fault({ on: 'send', kind: 'report', mode: 'gone' });
      await sim.advance(5 * MINUTE);
      expect(sim.messagesFor(s.id, 'report')).toHaveLength(0);
      expect(sim.siege().report).toMatchObject({ night: '2026-11-10', unannounced: 'refused' });
      expect(sim.siege().unreported.map(d => d.userId)).toEqual(['ben']);
      sim.jumpTo(Date.UTC(2026, 10, 11, 20, 0));
      await sim.play('ana', 'doom', 'cat');
      await sim.advance(MINUTE);
      const reports = sim.messagesFor(s.id, 'report');
      expect(reports.map(r => r.night)).toEqual(['2026-11-11']);
      expect(embedText(reports[0])).toContain('ben');
      sim.finalChecks();
    });

    test('a timeout (it may have gone): never tried again, and the digest isn\'t repeated', async () => {
      const sim = await digestedBen('pace-r-report-timeout');
      const s = sim.siege();
      sim.fault({ on: 'send', kind: 'report', mode: 'abort-after' });
      await sim.advance(5 * MINUTE);
      expect(sim.messagesFor(s.id, 'report')).toHaveLength(1);
      expect(sim.siege().report).toMatchObject({ night: '2026-11-10', unannounced: 'send-unknown' });
      expect(sim.siege().unreported).toEqual([]);
      sim.finalChecks();
    });

    test('a digest notice Discord refuses goes into the next report instead', async () => {
      const sim = await campaign('pace-r-digest-503', 'week', { fighters: ['ana', 'ben'], active: 10 });
      await sim.act('grab', ['ben']);
      sim.calm();
      // ana keeps it busy as ben's 22 hours run out, but the notice fails
      sim.jumpTo(fighter(sim, 'ben').caught.until - 5 * MINUTE);
      await sim.attack('ana', 'doom', { force: 'smite' });
      sim.fault({ on: 'send', kind: 'other', mode: 'fail' });
      await sim.advance(6 * MINUTE);
      expect(fighter(sim, 'ben').out).toBe(true);
      expect(sim.sends().filter(m => m.kindTag === 'digest')).toHaveLength(0);
      expect(sim.siege().unreported.map(d => d.userId)).toEqual(['ben']);
      sim.finalChecks();
    });
  });
});

// ── the second review's findings (2026-11-06) ───────────────────────────

describe('the second review\'s findings (2026-11-06)', () => {
  const UNLIMITED = 'Freeing a grabbed fighter with `/rescue` and curing with a helpful `/potion` are unlimited.';
  const reportNights = (sim, s) => sim.messagesFor(s.id, 'report').map(m => m.night);
  const resultsOf = (sim, s) => sim.messagesFor(s.id, 'results');

  test('#1b a digest on a campaign\'s last night with nobody around is told at once: there\'s no report left to keep it for', async () => {
    const sim = await campaign('pace-r2-last-night', 'week', { fighters: ['ana', 'ben'], active: 10 });
    const s = sim.siege();
    // Saturday 22:50 (night 6 of 7): ana and ben fight, and the monster grabs ana: 22 hours to free her
    sim.jumpTo(Date.UTC(2026, 10, 14, 22, 50));
    await sim.attack('ana', 'doom', { force: 'smite' });
    await sim.attack('ben', 'doom', { force: 'smite' });
    await sim.act('grab', ['ana']);
    sim.calm();
    const until = fighter(sim, 'ana').caught.until;
    // Sunday after 12:00: night 6's report, the last there is, with ana still held
    sim.jumpTo(Date.UTC(2026, 10, 15, 13, 0));
    await sim.play('ben', 'doom', 'cat');
    await sim.advance(MINUTE);
    expect(reportNights(sim, s)).toContain('2026-11-15');
    // Sunday evening, the last night: nobody is fighting when her time runs out
    expect(until).toBeLessThan(s.endsAt);
    sim.jumpTo(until);
    await sim.tick();
    expect(fighter(sim, 'ana').out).toBe(true);
    // Told at once, in a NEW message pinging her — it waited in `unreported` for a report that never came
    const digests = sim.sends().filter(m => m.kindTag === 'digest');
    expect(digests).toHaveLength(1);
    expect(digests[0].allowedMentions.users).toEqual(['ana']);
    expect(lines(digests[0])[0]).toContain('😋 **The Blob** digested **ana**: nobody freed them in time.');
    expect(sim.siege().unreported).toEqual([]);
    // The end: nothing left untold (the simulator fails any kept digest the results don't name)
    sim.jumpTo(s.endsAt);
    await sim.tick();
    await sim.advance(5 * MINUTE);
    await sim.play('ben', 'doom', 'cat');
    await sim.advance(MINUTE);
    expect(resultsOf(sim, s)).toHaveLength(1);
    expect(resultsOf(sim, s)[0].content).not.toContain('Digested while nobody was around');
    sim.finalChecks();
  });

  test('#1a a digest kept for the next report, and the monster beaten before it: the results name it and ping them, and it\'s cleared', async () => {
    const sim = await campaign('pace-r2-won-digest', 'week');
    const s = sim.siege();
    await sim.act('grab', ['ana']);
    sim.calm();
    // Tuesday 13:00: a game played, night 1's report goes out (ana still held)
    sim.jumpTo(Date.UTC(2026, 10, 10, 13, 0));
    await sim.play('cat', 'doom', 'ben');
    await sim.advance(MINUTE);
    expect(reportNights(sim, s)).toEqual(['2026-11-10']);
    // Tuesday evening her 22 hours run out with nobody fighting: kept for Wednesday's report
    sim.jumpTo(fighter(sim, 'ana').caught.until);
    await sim.tick();
    const kept = sim.siege().unreported;
    expect(kept.map(d => d.userId)).toEqual(['ana']);
    expect(sim.sends().filter(m => m.kindTag === 'digest')).toHaveLength(0);
    // 21:00: ben and cat beat it — a win is posted at once, before Wednesday's report
    sim.jumpTo(Date.UTC(2026, 10, 10, 21, 0));
    await beat(sim, ['ben', 'cat']);
    await sim.advance(MINUTE);
    const done = sim.siege();
    expect(done.status).toBe('won');
    const [results] = resultsOf(sim, s);
    const lost = kept[0].points < 0 ? `−${-kept[0].points}` : '±0';
    expect(lines(results)[1]).toBe(`😋 Digested while nobody was around: ana ${lost}`);
    expect(results.allowedMentions.users).toContain('ana');
    expect(results.content).toContain('<@ana>');
    expect(done.result.told).toEqual(['ana']);
    expect(done.unreported).toEqual([]);
    expect(reportNights(sim, s)).toEqual(['2026-11-10']);
    sim.finalChecks();
  });

  test('#1a an escape whose last report Discord refused for good: its held results name the digest', async () => {
    const sim = await campaign('pace-r2-escape-digest', 'week', { fighters: ['ana', 'ben'], active: 10 });
    const s = sim.siege();
    // Saturday 13:30 (night 6): grabbed; 22 hours on, Sunday 11:30, nobody's around — Sunday's report is still to come
    sim.jumpTo(Date.UTC(2026, 10, 14, 13, 30));
    await sim.attack('ana', 'doom', { force: 'smite' });
    await sim.attack('ben', 'doom', { force: 'smite' });
    await sim.act('grab', ['ana']);
    sim.calm();
    sim.jumpTo(fighter(sim, 'ana').caught.until);
    await sim.tick();
    expect(sim.siege().unreported.map(d => d.userId)).toEqual(['ana']);
    // Sunday 13:00: that report is refused for good (the channel gone for it), so she waits for "the next" — there is none
    sim.jumpTo(Date.UTC(2026, 10, 15, 13, 0));
    await sim.play('ben', 'doom', 'cat');
    sim.fault({ on: 'send', kind: 'report', mode: 'gone' });
    await sim.advance(MINUTE);
    expect(sim.siege().report).toMatchObject({ night: '2026-11-15', unannounced: 'refused' });
    expect(sim.siege().unreported.map(d => d.userId)).toEqual(['ana']);
    // Monday 12:00 it gets away; its results wait for a game played, then name her
    sim.jumpTo(s.endsAt);
    await sim.tick();
    await sim.advance(5 * MINUTE);
    expect(resultsOf(sim, s)).toHaveLength(0);
    await sim.play('ben', 'doom', 'cat');
    await sim.advance(MINUTE);
    const [results] = resultsOf(sim, s);
    expect(results.content.split('\n').find(l => l.startsWith('😋'))).toMatch(/^😋 Digested while nobody was around: ana (−\d|±0)$/);
    expect(results.allowedMentions.users).toContain('ana');
    expect(sim.siege().unreported).toEqual([]);
    sim.finalChecks();
  });

  test('#2 a day siege started 08:00 UTC reports at 12:00, as /siege start says; one started 11:30 says no report, gets none, and tells a digest at once', async () => {
    const noon = Date.UTC(2026, 10, 9, 12, 0);
    const early = await campaign('pace-r2-day-0800', 'day', { at: Date.UTC(2026, 10, 9, 8, 0), fighters: ['ana', 'ben'] });
    expect(early.started.reply.content).toContain(`· a report at <t:${sec(noon)}:t>.`);
    // The settings say the same of the pace: not "a report each night"
    const shown = await early.command('admin', 'eggshen-config-games', { subcommand: 'happenings' });
    expect(shown.reply.content).toContain('· attacks pay into the pot · a report at 12:00 UTC (unless it started in the hour before)');
    early.jumpTo(noon + 30 * MINUTE);
    await early.play('ana', 'doom', 'ben');
    await early.advance(MINUTE);
    const [report] = early.messagesFor(early.siege().id, 'report');
    expect(report?.content).toBe('📰 **Night 1 is over** and The Blob is still here. Who needs help tonight:');
    early.finalChecks();

    const late = await campaign('pace-r2-day-1130', 'day', { at: noon - 30 * MINUTE, fighters: ['ana', 'ben'] });
    const s = late.siege();
    expect(late.started.reply.content).not.toMatch(/report/);
    await late.act('grab', ['ana']);
    late.calm();
    // 3 hours on, nobody fighting: no report is coming, so she's told now
    late.jumpTo(fighter(late, 'ana').caught.until);
    await late.tick();
    const digests = late.sends().filter(m => m.kindTag === 'digest');
    expect(digests.map(m => m.allowedMentions.users)).toEqual([['ana']]);
    expect(late.siege().unreported).toEqual([]);
    // Noon the next day: still no report (its 12:00 came 30 minutes after it started), and then it's over
    late.jumpTo(s.endsAt - 10 * MINUTE);
    await late.play('ben', 'doom', 'ana');
    await late.advance(5 * MINUTE);
    expect(late.messagesFor(s.id, 'report')).toHaveLength(0);
    late.finalChecks();
  });

  test('#3 a pass whose clock is older than one already run (a slow pass on another server): never an old night\'s report again, never reportedThrough back', async () => {
    const sim = await campaign('pace-r2-stale', 'week', { fighters: ['ana', 'ben'], active: 10 });
    const s = sim.siege();
    for (const day of [10, 11]) {
      sim.jumpTo(Date.UTC(2026, 10, day, 13, 0));
      await sim.play('ana', 'doom', 'ben');
      await sim.advance(MINUTE);
    }
    expect(reportNights(sim, s)).toEqual(['2026-11-10', '2026-11-11']);
    const through = sim.siege().reportedThrough;
    expect(through).toBe('2026-11-10');
    // Read its clock at Wednesday 11:59, reaches this server after the 13:01 pass
    await sim.step('⏱️ a stale pass @ Wednesday 11:59', () => mods.scheduler.checkHappenings(sim.discord.client, Date.UTC(2026, 10, 11, 11, 59), { only: sim.guildId }), { kind: 'tick' });
    expect(reportNights(sim, s)).toEqual(['2026-11-10', '2026-11-11']);
    expect(sim.siege().reportedThrough).toBe(through);
    expect(sim.siege().report.night).toBe('2026-11-11');
    // …and the next ordinary pass doesn't post Wednesday's again either
    await sim.advance(5 * MINUTE);
    expect(reportNights(sim, s)).toEqual(['2026-11-10', '2026-11-11']);
    sim.finalChecks();
  });

  test('#4 a week campaign started 07:00 UTC: its first night runs to Tuesday 12:00 — one allowance, one growth, and the refusal says the next 8 come then', async () => {
    const sim = await campaign('pace-r2-first-night', 'week', { at: Date.UTC(2026, 10, 9, 7, 0), fighters: ['ana'], active: 10 });
    const tue = Date.UTC(2026, 10, 10, 12);
    expect(sim.siege().endsAt).toBe(tue + 6 * DAY);
    const max1 = sim.siege().maxHp;
    for (let i = 1; i < 8; i++) {
      await sim.advance(21 * SEC);
      await sim.attack('ana', 'food', { force: 'splash' });
    }
    // A 9th at once (still before 12:00 Monday): refused, for nothing, with the right time
    const spent = `⚔️ You've made your 8 attacks tonight. The next 8 come <t:${sec(tue)}:R> (12:00 UTC). ${UNLIMITED}`;
    await sim.advance(21 * SEC);
    expect((await sim.attack('ana', 'food')).reply.content).toBe(spent);
    // 12:30 Monday: past a 12:00 UTC, but still the campaign's night 1 — it had 8 attacks, not 16
    sim.jumpTo(Date.UTC(2026, 10, 9, 12, 30));
    const refused = await sim.attack('ana', 'food');
    expect(refused.reply.content).toBe(spent);
    expect(Object.keys(fighter(sim, 'ana').nights)).toEqual(['2026-11-09']);
    expect([sim.siege().fn, sim.siege().maxHp]).toEqual([1, max1]);
    // Tuesday 12:30, night 2: fresh attacks, and the monster grows for her second night
    sim.jumpTo(tue + 30 * MINUTE);
    const hit = await sim.attack('ana', 'food', { force: 'splash' });
    expect(lines(hit.reply).at(-1)).toContain('⚔️ 7 of 8 attacks left tonight');
    expect(Object.keys(fighter(sim, 'ana').nights)).toEqual(['2026-11-09', '2026-11-10']);
    expect(sim.siege().fn).toBe(2);
    sim.finalChecks();
  });

  test('#5 happenings and sieges hold each other back by the siege\'s own pace: a quick server with a week campaign gets happenings; a week server with a quick siege doesn\'t', async () => {
    const spawnTry = async (sim) => {
      for (const [u, v] of [['ana', 'ben'], ['ben', 'cat'], ['cat', 'ana']]) await sim.play(u, 'doom', v);
      sim.luckQueue.push(0, 0.5);
      await sim.advance(MINUTE);
      sim.luckQueue.length = 0;
      return sim.state().happening;
    };
    // A week campaign, then the admin switches the server to quick
    const sim = await campaign('pace-r2-happen-quick', 'week', { active: 10, config: { happeningFrequency: 'normal' } });
    sim.calm();
    await sim.command('admin', 'eggshen-config-games', { subcommand: 'happenings', options: { pace: 'quick' } });
    const h = await spawnTry(sim);
    expect(h).toMatchObject({ source: 'random' });
    expect(sim.siege()).toMatchObject({ status: 'live', t: { key: 'week' } });
    sim.finalChecks();
    // A week server where an admin started a 45-minute siege: none while it's on
    const quick = await campaign('pace-r2-happen-week', 'week', { length: 45, config: { happeningFrequency: 'normal' } });
    quick.calm();
    expect(quick.siege().t.key).toBe('quick');
    expect(await spawnTry(quick)).toBeNull();
    quick.finalChecks();
  });

  test('#6 at a pot pace, a win past today\'s 2 rewarded sieges pays what the attacks would have scored, as the limit leaves at quick', async () => {
    clock.now = T0;
    const sim = new Sim('pace-r2-pot-limit', { seed: 5, pace: 'day' });
    await sim.configure({ twists: false, happeningFrequency: 'off', siegeFrequency: 'off' });
    let s = null;
    for (let n = 0; n < 3; n++) {
      await sim.start({ monster: 'blob' });
      s = sim.siege();
      await beat(sim, ['ana', 'ben']);
      await sim.advance(MINUTE);
      expect(sim.siege()).toMatchObject({ id: s.id, status: 'won' });
      await sim.advance(MINUTE);
    }
    const done = sim.siege();
    const ana = done.result.grants.find(g => g.userId === 'ana');
    // Every attack a smite: +2 each on its own, into the pot here
    const own = done.participants.ana.attacks * 2;
    expect(done.participants.ana.own).toBe(own);
    expect([ana.limited, ana.win, ana.loot, ana.points, ana.total]).toEqual([true, false, null, own, own]);
    const row = resultsOf(sim, done)[0].embeds[0].toJSON().description.split('\n').find(l => l.includes(' ana '));
    expect(row).toMatch(new RegExp(`· \`\\+${own}\` · reward limit reached \\(2 sieges a day\\): just what the attacks scored$`));
    sim.finalChecks();
  });

  test('#7 a report after two lost nights (the bot down across both boundaries) says "the last 2 nights", their damage added up', async () => {
    const sim = await campaign('pace-r2-two-nights', 'week', { fighters: ['ana', 'ben'], active: 10 });
    const s = sim.siege();
    // Tuesday evening: more fighting; no passes from Monday to Wednesday
    sim.jumpTo(Date.UTC(2026, 10, 10, 20, 0));
    await sim.attack('ana', 'doom', { force: 'smite' });
    sim.jumpTo(Date.UTC(2026, 10, 11, 13, 0));
    await sim.play('ana', 'doom', 'ben');
    await sim.advance(MINUTE);
    const [report] = sim.messagesFor(s.id, 'report');
    const n = sim.siege().nightly;
    const damage = n['2026-11-09'].damage + n['2026-11-10'].damage;
    expect(report.content).toBe('📰 **Night 2 is over** and The Blob is still here. Who needs help tonight:');
    const e = report.embeds[0].toJSON();
    expect(e.description).toContain(`\`−${damage}\` in the last 2 nights ·`);
    expect(e.fields[0].name).toMatch(/The last 2 nights$/);
    expect(embedText(report)).not.toContain('last night');
    sim.finalChecks();
  });

  test('#9 attacks used up when no night is left before the end: "that\'s all your attacks for this siege" — an evening\'s only night, a week\'s last', async () => {
    const evening = await campaign('pace-r2-spent-evening', 'evening', { fighters: ['ana'], active: 10 });
    evening.calm();
    for (let i = 1; i < PACES().evening.allowance; i++) {
      await evening.advance(21 * SEC);
      await evening.attack('ana', 'food', { force: 'splash' });
    }
    await evening.advance(21 * SEC);
    const done = await evening.attack('ana', 'food');
    expect(done.reply.content).toBe(`⚔️ That's all your attacks for this siege: you've made your 20 for tonight, and it's over before the next night. ${UNLIMITED}`);
    evening.finalChecks();

    const week = await campaign('pace-r2-spent-week', 'week', { fighters: ['ana'], active: 10 });
    week.calm();
    // Wednesday: the next night comes while it's on
    const spend = async (sim, at) => {
      sim.jumpTo(at);
      for (let i = 0; i < 8; i++) {
        await sim.advance(21 * SEC);
        await sim.attack('ana', 'food', { force: 'splash' });
      }
      await sim.advance(21 * SEC);
      return sim.attack('ana', 'food');
    };
    const wed = await spend(week, Date.UTC(2026, 10, 11, 20, 0));
    expect(wed.reply.content).toBe(`⚔️ You've made your 8 attacks tonight. The next 8 come <t:${sec(Date.UTC(2026, 10, 12, 12))}:R> (12:00 UTC). ${UNLIMITED}`);
    // Sunday, its last night: none come
    const sun = await spend(week, Date.UTC(2026, 10, 15, 20, 0));
    expect(sun.reply.content).toBe(`⚔️ That's all your attacks for this siege: you've made your 8 for tonight, and it's over before the next night. ${UNLIMITED}`);
    week.finalChecks();
  });

  test('#10 a happening\'s announcement during a campaign doesn\'t promise siege attacks anything: Double Feature and Be Kind, Rewind say so — and an attack in one is the plain fight', async () => {
    const sim = await campaign('pace-r2-double', 'week', { fighters: ['ana'], active: 10 });
    sim.calm();
    await sim.command('admin', 'eggshen-config-games', { subcommand: 'happenings', options: { start: 'doublefeature' } });
    const announced = sim.sends().filter(m => m.content.startsWith('🎞️ **DOUBLE FEATURE!**'));
    expect(announced).toHaveLength(1);
    expect(lines(announced[0])[0]).toBe('🎞️ **DOUBLE FEATURE!** Every point in every game counts twice for the next 12 hours (not siege attacks).');
    expect(embedText(announced[0])).toContain('Every point counts twice (not siege attacks).');
    for (const kind of ['rewind', 'fog', 'madscience']) expect(`${HAPPENINGS[kind].about} ${HAPPENINGS[kind].announce}`.match(/\(not siege attacks\)/g)).toHaveLength(2);
    // At quick pace (where an attack does score itself), Double Feature leaves a smite at +2
    const q = await campaign('pace-r2-double-quick', 'quick', { fighters: [] });
    await q.command('admin', 'eggshen-config-games', { subcommand: 'happenings', options: { start: 'doublefeature' } });
    const hit = await q.attack('ana', 'doom', { force: 'smite' });
    expect(hit.reply.content).not.toContain('🎞️');
    expect(hit.reply.content).toMatch(/ana \+2 \(2 pts\)/);
    sim.finalChecks();
    q.finalChecks();
  });

  test('#12 /siege end names the channel the results actually went to — or says they couldn\'t be posted', async () => {
    const finish = async (name, perms) => {
      const sim = await campaign(name, 'quick', { monster: 'klowns', fighters: ['ana', 'ben'] });
      // Beaten, and no pass since to finish it…
      while (sim.siege().hp > 0) {
        await sim.advance(21 * SEC);
        await sim.attack('ana', 'doom', { force: 'smite' });
        if (sim.siege().hp > 0) await sim.attack('ben', 'doom', { force: 'smite' });
      }
      // …when its channel comes off the games list: the results go where a happening would be announced (the lobby)
      await sim.configure({ channelMode: 'only', channels: ['lobby'] });
      if (perms) sim.grant('lobby', perms);
      return { sim, end: await sim.end() };
    };
    const { sim, end } = await finish('pace-r2-end-lobby', null);
    expect(end.reply.content).toBe('🏆 Killer Klowns was already beaten, so it counts as a win: the results are in <#lobby>.');
    expect(resultsOf(sim, sim.siege())[0].channelId).toBe('lobby');
    sim.finalChecks();
    const { sim: none, end: end2 } = await finish('pace-r2-end-nowhere', ['ViewChannel']);
    expect(end2.reply.content).toBe('🏆 Killer Klowns was already beaten, so it counts as a win: I couldn\'t post the results just now, and will keep trying.');
    expect(resultsOf(none, none.siege())).toHaveLength(0);
    none.finalChecks();
  });

  test('#14 /siege start answers (privately) before it sends anything: a held escape\'s results and the card come after the defer', async () => {
    const sim = await campaign('pace-r2-defer', 'week', { fighters: ['ana', 'ben'] });
    const s = sim.siege();
    sim.jumpTo(s.endsAt);
    await sim.tick();
    expect(sim.siege().result.holdUntil).toBeTruthy();
    const from = sim.discord.events.length;
    const next = await sim.start({ monster: 'blob' });
    const kinds = sim.discord.events.slice(from).map(e => (e.kind === 'send' ? `send:${e.message.kindTag}` : e.kind));
    expect(kinds).toEqual(['ephemeral', 'send:results', 'send:card', 'editReply']);
    expect(next.reply.ephemeralFor).toBe('admin');
    expect(next.reply.content).toMatch(/^🟢 \*\*The Blob\*\* is attacking <#games>/);
    sim.finalChecks();
  });
});

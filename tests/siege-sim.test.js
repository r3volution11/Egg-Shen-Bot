/**
 * /siege, end to end: whole sieges through the real commands (dispatched as
 * production does), the real scheduler and the strict fake Discord
 * (tests/harness/siegeSim.js), with every invariant checked after every
 * step. Each scenario then asserts what members would see and what's
 * stored — exact numbers, worked out here, not read back from the code.
 *
 * Restarts are in tests/siege-sim-restarts.test.js; random sequences in
 * tests/fuzz/siege.fuzz.js (npm run test:fuzz).
 *
 * Run:        npm test -- tests/siege-sim.test.js
 * Transcript: SIM_REPORT=/tmp/siege-sim npm test -- tests/siege-sim.test.js
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadSim, clock, MINUTE, Sim } from './harness/siegeSim.js';

const SEC = 1000;
const T0 = Date.UTC(2026, 10, 9, 20, 0, 0); // a Monday evening: no calendar happening
const sec = (ms) => Math.floor(ms / 1000);
let mods;

beforeAll(async () => {
  clock.install();
  mods = await loadSim();
});

function fresh(name, seed = 1) {
  clock.now = T0;
  return new Sim(name, { seed });
}

const lines = (m) => m.content.split('\n');
const monster = (key) => mods.monsters.MONSTERS[key];
const SIEGE = () => mods.rewards.SIEGE;

/** The win's payout, worked out here from the stored damage: pool 8 a fighter (24–200), split, 2–30 each, the MVP +5 */
function expectedPoints(fighters) {
  const { perFighter, poolMin, poolMax, eachMin, eachMax, mvpBonus } = SIEGE().rewards;
  const pool = Math.min(poolMax, Math.max(poolMin, perFighter * fighters.length));
  const total = fighters.reduce((n, f) => n + f.damage, 0);
  return fighters.map((f, i) => Math.min(eachMax, Math.max(eachMin, Math.round(pool * (f.damage / total)))) + (i === 0 && fighters.length > 1 ? mvpBonus : 0));
}

/** ana and ben smite it down to 0 HP (the next pass finishes it) */
async function beatDown(sim) {
  await sim.attack('ana', 'doom', { force: 'smite' });
  await sim.attack('ben', 'doom', { force: 'smite' });
  while (sim.siege().hp > 0) {
    await sim.advance(21 * SEC);
    await sim.attack('ana', 'doom', { force: 'smite' });
    if (sim.siege().hp > 0) await sim.attack('ben', 'doom', { force: 'smite' });
  }
}

/** Fighters best first, as the results rank them: damage, then who joined first */
const ranked = (s) => Object.entries(s.participants).map(([userId, p]) => ({ userId, ...p }))
  .sort((a, b) => b.damage - a.damage || a.firstAt - b.firstAt);

describe('a whole siege', () => {
  test('1. The Blob, beaten by three with all three weapons: half-damage pies, ×1.25 dooms, a poison ticking, the killing blow, one results message', async () => {
    const sim = fresh('sim-blob');
    const blob = monster('blob');
    const start = await sim.start({ monster: 'blob' });
    sim.calm(); // R5's arithmetic: the monster fighting back is tests/siege-sim-fights-back.test.js
    expect(start.reply.content).toBe(`🟢 **The Blob** is attacking <#games> until <t:${sec(T0 + 45 * MINUTE)}:t> (<t:${sec(T0 + 45 * MINUTE)}:R>) with \`40\` HP.`);
    const arrival = sim.messagesFor(sim.siege().id, 'card')[0];
    expect(arrival.content).toBe(`${blob.lines.arrive}\nFight it with \`/siege attack\`!`);

    // A quiet server (nobody played this week): 40, then the formula with each fighter
    let a = await sim.attack('ana', 'food', { force: 'splat' });
    expect(lines(a.reply).slice(1)).toEqual([
      '-# 💥 Splat! ana +1 (1 pts)',
      '-# 💥 4 damage · The Blob 41/45', // 8 × 0.5: pies sink in
      '-# 📈 ana joined the fight: The Blob grows +5 HP.',
    ]);
    a = await sim.attack('ben', 'doom', { force: 'smite' });
    expect(lines(a.reply).slice(1)).toEqual([
      '-# ⚡ Smite! ben +2 (2 pts)',
      '-# 💥 20 damage · The Blob 66/90', // 16 × 1.25
      '-# 📈 ben joined the fight: The Blob grows +45 HP.',
    ]);
    a = await sim.attack('cat', 'potion', { force: 'poisoned' });
    expect(lines(a.reply).slice(1)).toEqual([
      '-# 🧪 Poisoned! cat +1 (1 pts)',
      '-# 💥 4 damage · The Blob 107/135',
      '-# 📈 cat joined the fight: The Blob grows +45 HP.',
      '-# 🧪 The Blob is poisoned: 2 a minute for 5 minutes, credited to cat.',
    ]);

    // The poison ticks down over five minutes, credited to cat; the card follows at most once a minute
    await sim.advance(5 * MINUTE + 30 * SEC);
    expect([sim.siege().hp, sim.siege().participants.cat.damage, sim.siege().participants.cat.poison]).toEqual([97, 14, null]);
    const card = sim.channel('games').messageList.find(m => m.id === sim.siege().card.messageId);
    expect(card.embeds[0].toJSON().description.split('\n')[1]).toMatch(/`97\/135` HP$/);

    // Smites and splats until a smite can finish it
    while (sim.siege().hp > 20) {
      await sim.attack('ben', 'doom', { force: 'smite' });
      if (sim.siege().hp > 20) await sim.attack('ana', 'food', { force: 'splat' });
      await sim.advance(21 * SEC);
    }
    const left = sim.siege().hp;
    const kill = await sim.attack('ben', 'doom', { force: 'smite' });
    expect(lines(kill.reply).slice(-2)).toEqual([
      `-# 💥 ${left} damage · The Blob 0/135`, // only what was left
      '-# 🏆 ben landed the killing blow on The Blob!',
    ]);
    expect(sim.siege().status).toBe('live'); // until the scheduler's next pass
    const late = await sim.attack('cat', 'food');
    expect([late.reply.ephemeralFor, late.reply.content]).toEqual(['cat', '🏆 The Blob is already beaten! The results are on their way.']);

    await sim.advance(MINUTE);
    const s = sim.siege();
    expect(s.status).toBe('won');
    expect(s.killingBlow).toMatchObject({ userId: 'ben', by: 'doom' });

    // One results message, with the payout the store holds, worked out here
    const results = sim.messagesFor(s.id, 'results');
    expect(results).toHaveLength(1);
    const order = ranked(s);
    expect(order.map(f => f.userId)).toEqual(['ben', 'ana', 'cat']);
    const pts = expectedPoints(order);
    const grants = s.result.grants;
    expect(grants.map(g => [g.userId, g.damage, g.points])).toEqual(order.map((f, i) => [f.userId, f.damage, pts[i]]));
    expect(results[0].content).toBe(`${blob.lines.defeat.split('{mvp}').join('ben')}\n<@ben> <@ana> <@cat>`);
    expect(results[0].allowedMentions).toEqual({ parse: [], users: ['ben', 'ana', 'cat'] });
    const rows = results[0].embeds[0].toJSON().description.split('\n');
    expect(rows[0]).toBe('🟢 Beaten with `3` fighters. The pool was split by damage; the MVP gets +5 and loot.');
    const mvpLoot = mods.rewards.ITEMS[grants[0].loot.item];
    expect(rows[2]).toBe(`🥇 ben · \`${order[0].damage}\` damage · \`+${pts[0]}\` · ${grants[0].loot.overflow ? `+2 (Glovebox full of ${mvpLoot.name})` : `${mvpLoot.emoji} ${mvpLoot.name}`} · 📜 🏆 Siege MVP`);

    // Stored: the MVP's loot in the Glovebox, every fighter's win, the MVP's MVP and title
    const users = sim.scores().users;
    expect(users.ben.glovebox?.[grants[0].loot.item]).toBe(1);
    expect(users.ben.titles.earned).toHaveProperty('siege-mvp');
    expect(['ben', 'ana', 'cat'].map(u => users[u].lifetime.siege)).toEqual([
      { wins: 1, mvps: 1, kaiju: 0 }, { wins: 1, mvps: 0, kaiju: 0 }, { wins: 1, mvps: 0, kaiju: 0 },
    ]);
    // Siege points: every attack's own, plus the payout once (the simulator's ledger checked each step)
    const smites = users.ben.games.siege.all.counts.smite;
    expect(users.ben.games.siege.all.points).toBe(2 * smites + grants[0].total);
    expect(grants[0].total).toBe(pts[0] + 10);
    expect(sim.state().siegeDial).toBe(1.05);

    // The card: frozen as beaten, its "Fight it" gone, and it stays that way
    const frozen = JSON.stringify(card.snapshot());
    expect(card.content).toBe(blob.lines.arrive);
    expect(card.embeds[0].toJSON().title).toBe('👹 The Blob is beaten!');
    expect(card.embeds[0].toJSON().description.split('\n')).toContain('🏆 MVP: **ben**');
    await sim.advance(5 * MINUTE);
    expect(JSON.stringify(card.snapshot())).toBe(frozen);
    expect(sim.messagesFor(s.id, 'results')).toHaveLength(1);
    sim.finalChecks();
    sim.writeTranscript('1-blob-won');
  });
});

describe('the monsters\' traits, through the real commands', () => {
  test('2a. Gremlins: a missed throw heals them 2% of their max HP; a doom that misses doesn\'t', async () => {
    const sim = fresh('sim-gremlins');
    await sim.start({ monster: 'gremlins' });
    await sim.attack('ana', 'food', { force: 'splat' }); // 45 → 37
    const miss = await sim.attack('ben', 'food', { force: 'splash' }); // joins: 82/90, −3 → 79, heals round(1.8) = 2
    expect(lines(miss.reply).slice(1)).toEqual([
      '-# 💨 Splash! ben ±0 (0 pts)',
      '-# 💥 3 damage · Gremlins 81/90',
      '-# 📈 ben joined the fight: Gremlins grows +45 HP.',
      '-# 💚 Gremlins feeds on the miss and heals 2 HP.',
    ]);
    const dodge = await sim.attack('cat', 'doom', { force: 'dodged' }); // joins: 126/135
    expect(lines(dodge.reply).slice(1, 3)).toEqual(['-# 💨 Dodged! cat ±0 (0 pts)', '-# 💥 No damage · Gremlins 126/135']);
    expect(dodge.reply.content).not.toMatch(/heals/);
    // Credit is what came off: the heal isn't anyone's damage (the simulator's sum checks it every step)
    expect(Object.values(sim.siege().participants).map(p => p.damage)).toEqual([8, 3, 0]);
    sim.writeTranscript('2a-gremlins');
  });

  test('2b. THEM!: ×1.3 HP, and +2 on every hit that does damage (a miss too), none on one that does none', async () => {
    const sim = fresh('sim-them');
    const start = await sim.start({ monster: 'them' });
    expect(start.reply.content).toMatch(/with `52` HP\.$/); // round(40 × 1.3)
    let a = await sim.attack('ana', 'food', { force: 'splat' });
    expect(lines(a.reply)[2]).toBe('-# 💥 10 damage · THEM! 49/59'); // 8 + 2; 45 × 1.3 = 58.5 → 59
    a = await sim.attack('ben', 'doom', { force: 'smite' });
    expect(lines(a.reply)[2]).toBe('-# 💥 18 damage · THEM! 89/117'); // 16 + 2; 49 + 58 − 18
    a = await sim.attack('cat', 'food', { force: 'splash' });
    expect(lines(a.reply)[2]).toBe('-# 💥 5 damage · THEM! 143/176'); // 3 + 2; 135 × 1.3 = 175.5 → 176
    a = await sim.attack('dev', 'doom', { force: 'spooked' });
    expect(lines(a.reply)[2]).toBe(`-# 💥 No damage · THEM! ${sim.siege().hp}/${sim.siege().maxHp}`);
  });

  test('2c. The Wolfman: a Silver Bullet from the Glovebox, picked from the autocomplete\'s own value, hits ×5', async () => {
    const sim = fresh('sim-wolfman');
    sim.giveItem('ana', 'silver');
    await sim.start({ monster: 'wolfman' });
    const choices = await sim.suggestItems('ana', 'food');
    expect(choices).toEqual([{ name: '🥈 Silver Bullet ×1 · can\'t backfire, damage ×3', value: 'silver' }]);
    const a = await sim.attack('ana', 'food', { item: choices[0].value, force: 'splat' });
    expect(lines(a.reply).slice(1)).toEqual([
      '-# 💥 Splat! ana +1 (1 pts)',
      '-# 💥 40 damage (🥈 ×5) · The Wolfman 5/45',
      '-# 📈 ana joined the fight: The Wolfman grows +5 HP.',
      '-# 🥈 Silver Bullet: no backfire, and extra damage.',
    ]);
    expect(sim.scores().users.ana.glovebox).toEqual({});
    // None left: the autocomplete says so, and its placeholder plays without one
    expect((await sim.suggestItems('ana', 'food')).map(c => c.value)).toEqual(['none']);
  });
});

describe('how a siege ends', () => {
  test('3. Time runs out: it escapes; −3 each with 2+ fighters, never below 0 for the month; the dial ×0.88; a lone fighter loses nothing', async () => {
    const sim = fresh('sim-escape');
    const klowns = monster('klowns');
    const role = { kind: 'role', pingUserIds: [] };
    // Earlier this month: ana +6 (two hits), cat nothing, ben nothing
    for (let i = 0; i < 2; i++) mods.scores.recordPlay('sim-escape', { game: 'foodfight', actor: { id: 'ana', name: 'ana' }, target: role, outcome: 'hit' }, T0 - (i + 1) * MINUTE);
    await sim.start({ monster: 'klowns', minutes: 30 });
    sim.calm();
    // Five smites from ana (80 of 135: past half its HP), a splat from cat, a spooked doom from ben
    await sim.attack('cat', 'food', { force: 'splat' });
    await sim.attack('ben', 'doom', { force: 'spooked' });
    for (let i = 0; i < 5; i++) {
      await sim.attack('ana', 'doom', { force: 'smite' });
      await sim.advance(21 * SEC);
    }
    expect(sim.siege().hp).toBe(135 - 88);
    // Its time: the pass at endsAt lets it go
    await sim.advance(T0 + 30 * MINUTE - clock.now);
    const s = sim.siege();
    expect(s.status).toBe('escaped');
    const [results] = sim.messagesFor(s.id, 'results');
    expect(results.content).toBe(`${klowns.lines.escape}\n<@ana> <@cat> <@ben>`);
    expect(results.embeds[0].toJSON().description.split('\n')).toEqual([
      `🤡 It got away. Everyone who fought loses ${SIEGE().escape.loss} (never below 0 for the month).`,
      '',
      '🥇 ana · `80` damage · `−3`',
      '🥈 cat · `8` damage · `−1`', // cat had 1 this month: down to 0, not below
      '🥉 ben · `0` damage', // ben's spooked doom left him at −2: nothing to lose
    ]);
    const pts = (u) => sim.scores().users[u].games.siege.all.points;
    expect([pts('ana'), pts('cat'), pts('ben')]).toEqual([10 - 3, 1 - 1, -2]);
    expect(sim.state().siegeDial).toBe(0.88);
    const card = sim.channel('games').messageList.find(m => m.id === s.card.messageId);
    expect(card.embeds[0].toJSON().title).toBe('👹 Killer Klowns got away!');
    expect(card.embeds[0].toJSON().description.split('\n')[2]).toBe(`Got away <t:${sec(T0 + 30 * MINUTE)}:R>`);

    // A lone fighter isn't penalised, and doesn't move the dial
    await sim.start({ monster: 'klowns', minutes: 30 });
    sim.calm();
    await sim.attack('ana', 'doom', { force: 'smite' });
    await sim.advance(31 * MINUTE);
    const lone = sim.siege();
    expect(lone.result.grants.map(g => [g.userId, g.points])).toEqual([['ana', 0]]);
    expect(sim.messagesFor(lone.id, 'results')[0].embeds[0].toJSON().description.split('\n')[0]).toBe('🤡 It got away. With so few fighters, nobody loses anything.');
    expect(pts('ana')).toBe(7 + 2);
    expect(sim.state().siegeDial).toBe(0.88);
    sim.finalChecks();
    sim.writeTranscript('3-escape');
  });

  test('4a. The killing blow, then an admin\'s end in the same minute: one finish (won), one results message, posted by the end', async () => {
    const sim = fresh('sim-race-a');
    await sim.start({ monster: 'klowns' });
    await sim.attack('ana', 'doom', { force: 'smite' }); // 45 → 29
    await sim.attack('ben', 'doom', { force: 'smite' }); // 90 → 74 − 16 = 58
    while (sim.siege().hp > 16) {
      await sim.advance(21 * SEC);
      await sim.attack('ana', 'doom', { force: 'smite' });
      if (sim.siege().hp > 16) await sim.attack('ben', 'doom', { force: 'smite' });
    }
    await sim.advance(21 * SEC);
    const kill = await sim.attack('ben', 'doom', { force: 'smite' });
    expect(kill.reply.content).toMatch(/landed the killing blow/);
    const end = await sim.end();
    expect(end.deferred).toBe(true); // it defers before its Discord work (#9)
    expect(end.reply.content).toBe('🏆 Killer Klowns was already beaten, so it counts as a win: the results are in <#games>.');
    const s = sim.siege();
    expect(s.status).toBe('won');
    expect(sim.messagesFor(s.id, 'results')).toHaveLength(1);
    await sim.advance(2 * MINUTE);
    expect(sim.messagesFor(s.id, 'results')).toHaveLength(1);
    expect(sim.siege().finishedAt).toBe(s.finishedAt);
  });

  test('4b. The end first, then what would have been the final blow: ended, the attack refused for free, no results', async () => {
    const sim = fresh('sim-race-b');
    await sim.start({ monster: 'klowns' });
    await sim.attack('ana', 'doom', { force: 'smite' });
    const end = await sim.end();
    expect(end.reply.content).toBe('⏹️ Ended the siege: Killer Klowns slinks off. No rewards, no penalties.');
    const late = await sim.attack('ben', 'doom', { force: 'smite' });
    expect([late.reply.ephemeralFor, late.reply.content]).toEqual(['ben', '👹 No monster is attacking right now.']);
    await sim.advance(2 * MINUTE);
    expect(sim.siege().status).toBe('ended');
    expect(sim.messagesFor(sim.siege().id, 'results')).toHaveLength(0);
    // The refusal cost ben nothing: his next play goes straight through
    const doom = await sim.play('ben', 'doom', 'cat');
    expect(doom.reply.ephemeralFor).toBeNull();
  });

  test('4c. Truly at once: an attack past its first check, an admin\'s end landing before its second — one finish, the attack records nothing', async () => {
    const sim = fresh('sim-race-c');
    await sim.start({ monster: 'klowns' });
    await sim.attack('ana', 'doom', { force: 'smite' });
    await sim.advance(21 * SEC);
    const attack = sim.interaction('ana', 'siege', { subcommand: 'attack', options: { weapon: 'doom' }, channel: 'games' });
    const end = sim.interaction('admin', 'siege', { subcommand: 'end' });
    // ana's 3rd config read comes right after the attack's first check (live, here, HP left)
    const pause = sim.pause('config-read', 3);
    await sim.race('ana attacks while the admin ends it', { a: { interaction: attack }, pause, b: { interaction: end } });
    expect(end.reply.content).toBe('⏹️ Ended the siege: Killer Klowns slinks off. No rewards, no penalties.');
    expect([attack.reply.ephemeralFor, attack.reply.content]).toEqual(['ana', '⏹️ The fight with Killer Klowns ended a moment before your attack landed.']);
    const s = sim.siege();
    expect([s.status, s.participants.ana.attacks, s.participants.ana.damage]).toEqual(['ended', 1, 16]);
    expect(sim.scores().users.ana.games.siege.all.plays).toBe(1);
    expect(sim.messagesFor(s.id, 'results')).toHaveLength(0);
  });

  test('4d. The scheduler finishing a win and an admin\'s end at once, either way round: one results message', async () => {
    for (const first of ['pass', 'end']) {
      const sim = fresh(`sim-race-d-${first}`);
      await sim.start({ monster: 'klowns' });
      await sim.attack('ana', 'doom', { force: 'smite' });
      await sim.attack('ben', 'doom', { force: 'smite' });
      while (sim.siege().hp > 0) {
        await sim.advance(21 * SEC);
        await sim.attack('ana', 'doom', { force: 'smite' });
        if (sim.siege().hp > 0) await sim.attack('ben', 'doom', { force: 'smite' });
      }
      clock.now = sim.nextTickAt;
      sim.nextTickAt += MINUTE;
      const end = sim.interaction('admin', 'siege', { subcommand: 'end' });
      // The first is held at its first Discord call (after its finish was saved), the other runs to the end
      const pause = sim.pause('channel-fetch', 1);
      await sim.race(`${first} first`, first === 'pass'
        ? { a: { tick: true }, pause, b: { interaction: end } }
        : { a: { interaction: end }, pause, b: { tick: true } });
      const s = sim.siege();
      expect(s.status).toBe('won');
      expect(sim.messagesFor(s.id, 'results')).toHaveLength(1);
      expect(end.reply.content).toBe(first === 'pass'
        ? 'No monster is attacking right now, so there was nothing to end.'
        : '🏆 Killer Klowns was already beaten, so it counts as a win: the results are in <#games>.');
      await sim.advance(2 * MINUTE);
      expect(sim.messagesFor(s.id, 'results')).toHaveLength(1);
    }
  });

  test('3b (fuzz). Beaten, or its time up, before the pass that finishes it: /siege status says so, as an attack would, not a live card saying how to fight', async () => {
    const sim = fresh('sim-status-late');
    await sim.start({ monster: 'klowns', minutes: 30 });
    await sim.attack('ana', 'doom', { force: 'smite' });
    clock.now = T0 + 30 * MINUTE + 10 * SEC;
    sim.nextTickAt = clock.now + 30 * SEC;
    const late = await sim.attack('ben', 'doom');
    expect(late.reply.content).toBe('💨 Killer Klowns is getting away: it\'s too late to attack.');
    const status = await sim.status('ana');
    expect([status.reply.embeds.length, status.reply.content]).toEqual([0, '💨 Killer Klowns is getting away: its time is up. The results are on their way.']);
    await sim.advance(MINUTE);
    expect(sim.siege().status).toBe('escaped');

    await sim.start({ monster: 'klowns' });
    await beatDown(sim);
    const beaten = await sim.status('cat');
    expect(beaten.reply.content).toBe('🏆 Killer Klowns is already beaten! The results are on their way.');
  });

  test('6 (review). /siege end after its time ran out, before the pass: the escape it was, penalties and all', async () => {
    const sim = fresh('sim-end-late');
    const role = { kind: 'role', pingUserIds: [] };
    for (const u of ['ana', 'ben']) mods.scores.recordPlay('sim-end-late', { game: 'doom', actor: { id: u, name: u }, target: role, outcome: 'doomed' }, T0 - MINUTE);
    await sim.start({ monster: 'blob', minutes: 30 });
    await sim.attack('ana', 'food', { force: 'splat' });
    await sim.attack('ben', 'food', { force: 'splat' });
    // 30 s past its end; the pass hasn't run yet
    clock.now = T0 + 30 * MINUTE + 30 * SEC;
    sim.nextTickAt = clock.now + 30 * SEC;
    const end = await sim.end();
    expect(end.reply.content).toBe('💨 The Blob\'s time was already up, so it got away: the results are in <#games>.');
    const s = sim.siege();
    expect(s.status).toBe('escaped');
    expect(s.result.grants.map(g => [g.userId, g.points])).toEqual([['ana', -3], ['ben', -3]]);
    expect(sim.messagesFor(s.id, 'results')).toHaveLength(1);
  });
});

describe('switching things off, and where you fight from', () => {
  test('5. A weapon\'s game off mid-siege: that weapon refused privately for free, the others fine, admins unaffected. /siege off: members refused, the next pass calls it off, no new one starts', async () => {
    const sim = fresh('sim-toggles');
    await sim.start({ monster: 'klowns' });
    await sim.attack('ana', 'doom', { force: 'smite' });
    await sim.toggle('foodfight', false);
    const food = await sim.attack('ben', 'food');
    expect([food.reply.ephemeralFor, food.reply.content]).toEqual(['ben', '❌ /foodfight is turned off on this server, so food can\'t be used on the monster. Try another weapon!']);
    const doom = await sim.attack('ben', 'doom', { force: 'smite' }); // straight away: the refusal spent nothing
    expect(doom.reply.ephemeralFor).toBeNull();
    const admin = await sim.attack('admin', 'food', { force: 'splat' });
    expect(admin.reply.ephemeralFor).toBeNull();
    await sim.toggle('foodfight', true);
    await sim.advance(21 * SEC);
    expect((await sim.attack('ben', 'food', { force: 'splat' })).reply.ephemeralFor).toBeNull();

    // The siege itself off: members can't fight or look; the next pass calls it off (no penalties)
    await sim.toggle('siege', false);
    await sim.advance(5 * SEC);
    const off = await sim.attack('cat', 'doom');
    expect([off.reply.ephemeralFor, off.reply.content]).toEqual(['cat', '❌ /siege is turned off on this server.']);
    expect((await sim.status('cat')).reply.content).toBe('❌ /siege is turned off on this server.');
    const id = sim.siege().id;
    await sim.advance(MINUTE);
    expect(sim.siege()).toMatchObject({ id, status: 'ended', result: { grants: [] } });
    expect(sim.messagesFor(id, 'results')).toHaveLength(0);
    const card = sim.channel('games').messageList.find(m => m.id === sim.siege().card.messageId);
    expect(card.embeds[0].toJSON().title).toBe('👹 Killer Klowns: the siege was called off');
    const refused = await sim.start({ monster: 'blob' });
    expect(refused.reply.content).toMatch(/^❌ \/siege is turned off for members on this server/);
    await sim.toggle('siege', true);
    expect((await sim.start({ monster: 'blob' })).reply.content).toMatch(/^🟢 \*\*The Blob\*\* is attacking/);
    sim.finalChecks();
  });

  test('6. From a thread of the siege\'s channel, cached or not, an attack lands; from another channel it\'s refused for free', async () => {
    const sim = fresh('sim-channels');
    await sim.start({ monster: 'klowns' });
    const thread = await sim.attack('ana', 'food', { channel: 'thread', force: 'splat' });
    expect(thread.reply.ephemeralFor).toBeNull();
    // discord.js gives an uncached thread as a null channel: fetched, not refused (#11)
    const uncached = await sim.attack('ben', 'food', { channel: 'thread', uncached: true, force: 'splat' });
    expect(uncached.reply.ephemeralFor).toBeNull();
    const lobby = await sim.attack('cat', 'food', { channel: 'lobby' });
    expect([lobby.reply.ephemeralFor, lobby.reply.content]).toEqual(['cat', '👹 Killer Klowns is attacking in <#games>: fight it there!']);
    expect((await sim.attack('cat', 'food', { force: 'splat' })).reply.ephemeralFor).toBeNull();
    expect(Object.keys(sim.siege().participants)).toEqual(['ana', 'ben', 'cat']);
  });

  test('7. The 30-a-day cap: the 31st attack still does its damage, scores 0, and leaves the Silver Bullet in the Glovebox', async () => {
    const sim = fresh('sim-cap');
    // A busy week (500 members played): a monster that lasts 31 attacks
    mods.happenings.mutate('sim-cap', (d) => { for (let i = 0; i < 500; i++) d.activity.recent[`x${i}`] = T0 - 60 * MINUTE; });
    sim.giveItem('ana', 'silver');
    await sim.start({ monster: 'klowns', minutes: 60 });
    sim.calm();
    expect(sim.siege().maxHp).toBe(1000);
    for (let i = 0; i < SIEGE().scoredPerDay; i++) {
      await sim.attack('ana', 'food', { force: 'splat' });
      await sim.advance(21 * SEC);
    }
    const all = () => sim.scores().users.ana.games.siege.all;
    expect([all().scoredPlays, all().counts.splat]).toEqual([30, 30]);
    const pointsBefore = all().points;
    const hpBefore = sim.siege().hp;
    const capped = await sim.attack('ana', 'food', { item: 'silver', force: 'splat' });
    expect(lines(capped.reply).slice(1)).toEqual([
      '-# ana reached today\'s Siege scoring cap: just for fun now.',
      `-# 💥 8 damage · Killer Klowns ${hpBefore - 8}/1045`,
      '-# 🥈 Silver Bullet stayed in ana\'s Glovebox: plays past today\'s scoring cap don\'t use items.',
    ]);
    expect([all().points, all().plays, all().scoredPlays]).toEqual([pointsBefore, 31, 30]);
    expect(sim.scores().users.ana.glovebox).toEqual({ silver: 1 });
  });

  test('8. /scoreboard and /leaderboard: the fight on now with its HP while it lasts; after the win, the payout and the server\'s count of sieges', async () => {
    const sim = fresh('sim-cards');
    await sim.start({ monster: 'klowns' });
    await sim.attack('ana', 'doom', { force: 'smite' });
    await sim.attack('ben', 'food', { force: 'splat' });
    const end = sec(T0 + 45 * MINUTE);
    const card = await sim.command('ana', 'scoreboard');
    const d = card.reply.embeds[0].toJSON();
    expect(d.description.split('\n').at(-1)).toBe(`🤡 **Killer Klowns** is attacking! 🟩🟩🟩🟩⬜⬜ \`66/90\` HP · ends <t:${end}:R> · you: \`16\` damage, 1st`);
    expect(d.fields.find(f => f.name === '👹 Siege').value.split('\n')[0]).toBe('`2` pts · #1');
    const board = await sim.command('ben', 'leaderboard');
    expect(board.reply.embeds[0].toJSON().fields.at(-1)).toEqual({
      name: '⏰ In progress', value: `🤡 Killer Klowns is attacking! 🟩🟩🟩🟩🟩🟩⬜⬜ \`66/90\` HP · ends <t:${end}:R>`, inline: false,
    });
    while (sim.siege().hp > 0) {
      await sim.advance(21 * SEC);
      await sim.attack('ana', 'doom', { force: 'smite' });
      if (sim.siege().hp > 0) await sim.attack('ben', 'doom', { force: 'smite' });
    }
    await sim.advance(MINUTE);
    const s = sim.siege();
    expect(s.status).toBe('won');
    await sim.advance(21 * SEC); // past /leaderboard's own 20 s limit for ben
    const after = (await sim.command('ben', 'leaderboard')).reply.embeds[0].toJSON();
    expect(after.fields.map(f => f.name)).not.toContain('⏰ In progress');
    expect(after.fields.find(f => f.name === '📊 Server stats').value.split('\n').at(-1)).toBe('👹 Sieges: `1` won · `0` got away');
    const mine = (await sim.command('ana', 'scoreboard')).reply.embeds[0].toJSON();
    expect(mine.description).not.toMatch(/is attacking/);
    const g = s.result.grants.find(x => x.userId === 'ana');
    const smites = sim.scores().users.ana.games.siege.all.counts.smite;
    expect(mine.fields.find(f => f.name === '👹 Siege').value.split('\n')[0]).toBe(`\`${2 * smites + g.total}\` pts · #1`);
  });
});

describe('the review\'s findings, in the simulator', () => {
  test('2a/2b. One admin and a friend, sieges back to back: alone the friend gets the pool only (no titles, no loot); two of them are rewarded twice a day, then told the limit is reached', async () => {
    const sim = fresh('sim-farm');
    // The friend alone, four sieges in a row
    for (let n = 0; n < 4; n++) {
      await sim.start({ monster: 'blob', minutes: 30 });
      while (sim.siege().status === 'live' && sim.siege().hp > 0) {
        await sim.attack('ana', 'doom', { force: 'smite' });
        await sim.advance(21 * SEC);
      }
      await sim.advance(MINUTE);
      expect(sim.siege().status).toBe('won');
    }
    let ana = sim.scores().users.ana;
    expect(ana.lifetime.siege).toEqual({ wins: 0, mvps: 0, kaiju: 0 });
    expect(Object.keys(ana.titles.earned).filter(k => ['monster-hunter', 'siege-mvp', 'legend', 'kaiju-killer'].includes(k))).toEqual([]);
    expect(ana.glovebox || {}).toEqual({});
    // Rewarded for 2 a day: the first two paid 24 each, the next two nothing
    const paid = Object.values(sim.scores().siegesPaid).map(p => p.grants[0]);
    expect(paid.map(g => [g.points, !!g.limited])).toEqual([[24, false], [24, false], [0, true], [0, true]]);
    const [results] = sim.messagesFor(sim.siege().id, 'results');
    expect(results.embeds[0].toJSON().description.split('\n').at(-1)).toBe(`🥇 ana · \`${sim.siege().participants.ana.damage}\` damage · reward limit reached (2 sieges a day)`);
    // The next UTC day: a pair, rewarded with the win on their record
    clock.now = Date.UTC(2026, 10, 10, 20, 0);
    sim.nextTickAt = clock.now + MINUTE;
    await sim.start({ monster: 'blob', minutes: 30 });
    while (sim.siege().hp > 0) {
      await sim.attack('ana', 'doom', { force: 'smite' });
      if (sim.siege().hp > 0) await sim.attack('ben', 'doom', { force: 'smite' });
      await sim.advance(21 * SEC);
    }
    await sim.advance(MINUTE);
    ana = sim.scores().users.ana;
    expect(ana.lifetime.siege.wins).toBe(1);
    sim.finalChecks();
    sim.writeTranscript('review-farm');
  });

  test('2c. Two members letting ten sieges escape without trying leave the dial where it was', async () => {
    const sim = fresh('sim-grief');
    for (let n = 0; n < 10; n++) {
      await sim.start({ monster: 'blob', minutes: 30 });
      await sim.attack('ana', 'food', { force: 'splatback' });
      await sim.attack('ben', 'food', { force: 'splatback' });
      await sim.advance(31 * MINUTE);
      expect(sim.siege().status).toBe('escaped');
    }
    expect(sim.state().siegeDial).toBe(1);
    await sim.start({ monster: 'blob', minutes: 30 });
    expect(sim.siege().maxHp).toBe(40 * 1);
  });

  test('4. Results that time out after Discord posted them are never posted again; a refusal Discord answered is retried, once', async () => {
    const sim = fresh('sim-results-faults');
    for (const [mode, unannounced] of [['abort-after', 'send-unknown'], ['fail', null]]) {
      await sim.start({ monster: 'klowns' });
      await sim.attack('ana', 'doom', { force: 'smite' });
      await sim.attack('ben', 'doom', { force: 'smite' });
      while (sim.siege().hp > 0) {
        await sim.advance(21 * SEC);
        await sim.attack('ana', 'doom', { force: 'smite' });
        if (sim.siege().hp > 0) await sim.attack('ben', 'doom', { force: 'smite' });
      }
      sim.fault({ on: 'send', kind: 'results', mode });
      sim.nextTickAt = clock.now + MINUTE;
      await sim.advance(MINUTE);
      await sim.advance(MINUTE);
      const s = sim.siege();
      expect(sim.messagesFor(s.id, 'results')).toHaveLength(1);
      expect(s.result.unannounced).toBe(unannounced);
      await sim.advance(3 * MINUTE);
      expect(sim.messagesFor(s.id, 'results')).toHaveLength(1);
    }
  });

  test('5. One failed card edit is tried again on the next pass; a card that\'s gone (deleted) is left alone', async () => {
    const sim = fresh('sim-card-faults');
    await sim.start({ monster: 'klowns' });
    await sim.attack('ana', 'doom', { force: 'smite' });
    sim.fault({ on: 'edit', kind: 'card', mode: 'fail' });
    await sim.advance(MINUTE); // the edit fails
    expect(sim.siege().card).toMatchObject({ dirty: true, gone: false });
    await sim.advance(MINUTE); // and goes through
    expect(sim.siege().card).toMatchObject({ dirty: false, gone: false });
    await sim.attack('ben', 'doom', { force: 'smite' });
    sim.fault({ on: 'edit', kind: 'card', mode: 'gone' });
    await sim.advance(MINUTE);
    expect(sim.siege().card.gone).toBe(true);
    const edits = sim.discord.events.filter(e => e.kind === 'edit').length;
    await sim.attack('cat', 'doom', { force: 'smite' });
    await sim.advance(2 * MINUTE);
    expect(sim.discord.events.filter(e => e.kind === 'edit').length).toBe(edits);
  });

  test('7/8. The Horseman in November is the admin\'s call (the reply says out of season); a newcomer in the last 5 minutes doesn\'t grow the monster', async () => {
    const sim = fresh('sim-season');
    const start = await sim.start({ monster: 'horseman', minutes: 30 });
    expect(start.reply.content).toMatch(/^🎃 \*\*Headless Horseman\*\* \(out of season\) is attacking <#games>/);
    await sim.attack('ana', 'doom', { force: 'smite' }); // 45 → 33 (×0.75 = 12)
    while (sim.siege().hp > 12) {
      await sim.advance(21 * SEC);
      await sim.attack('ana', 'doom', { force: 'smite' });
    }
    // 10 seconds left: a newcomer's dodged doom adds no HP
    clock.now = T0 + 30 * MINUTE - 10 * SEC;
    sim.nextTickAt = clock.now + 20 * SEC;
    const before = sim.siege();
    const late = await sim.attack('ben', 'doom', { force: 'dodged' });
    expect(late.reply.content).not.toMatch(/joined the fight/);
    expect([sim.siege().hp, sim.siege().maxHp]).toEqual([before.hp, before.maxHp]);
  });

  test('10. A live siege whose monster was renamed away: the next pass closes it, and /siege end and start work', async () => {
    const sim = fresh('sim-orphan');
    await sim.start({ monster: 'klowns' });
    await sim.attack('ana', 'doom', { force: 'smite' });
    mods.happenings.mutate('sim-orphan', (d) => { d.siege.monster = 'retired'; });
    const end = await sim.end();
    expect(end.reply.content).toBe('⏹️ Ended a siege whose monster no longer exists. No rewards, no penalties.');
    expect(sim.state().siege).toMatchObject({ status: 'ended', result: { unannounced: 'unknown-monster' } });
    await sim.start({ monster: 'blob' });
    expect(sim.siege().monster).toBe('blob');
    // …and the scheduler closes one on its own
    mods.happenings.mutate('sim-orphan', (d) => { d.siege.monster = 'retired'; });
    await sim.advance(MINUTE);
    expect(sim.state().siege.status).toBe('ended');
    expect((await sim.start({ monster: 'klowns' })).reply.content).toMatch(/is attacking/);
  });
});

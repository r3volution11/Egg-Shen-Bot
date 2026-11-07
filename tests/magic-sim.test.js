/**
 * The Six-Demon Bag in a whole evening (2.76.0): casts, plays and a siege
 * through the real commands (dispatched as production does), the real
 * scheduler and the strict fake Discord (tests/harness/siegeSim.js), with
 * every invariant checked after every step — the siege's own (its points
 * move only by attacks and payouts, so a charm can't touch them) and the
 * bag's (a refused cast changes nothing, no hex lands on a fighter, Chi and
 * hexes received stay in bounds). Each scenario then asserts what members
 * would see and what's stored.
 *
 * Run: npm test -- tests/magic-sim.test.js
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadSim, clock, MINUTE, Sim, restartBot } from './harness/siegeSim.js';

const HOUR = 60 * MINUTE;
const T0 = Date.UTC(2026, 10, 9, 20, 0, 0); // a Monday evening: no calendar happening
let mods;
let CHI;
let MAGIC;
let B;

beforeAll(async () => {
  clock.install();
  mods = await loadSim();
  ({ CHI, MAGIC } = mods.rewards);
  B = mods.btilc;
});

function fresh(name, { seed = 1, pace = 'quick' } = {}) {
  clock.now = T0;
  const sim = new Sim(name, { seed, pace });
  for (const m of ['ana', 'ben', 'cat', 'dev', 'eve']) sim.regular(m);
  return sim;
}
const tail = (i) => i.reply.content.split('\n').filter(l => l.startsWith('-# '));
const user = (sim, id) => sim.scores().users[id];
const PAY_TEXT = () => (MAGIC.casterPayIn === 'chi' ? `+${MAGIC.casterPay} Chi` : `+${MAGIC.casterPay}`);

/** /foodfight throw food:pie at a member, the line pinned onto `outcome` (from the real pie lines) */
function throwAt(sim, userId, targetId, outcome) {
  const pie = mods.commands.get('foodfight').ACTIONS.throw.lines.pie;
  let r = null;
  for (let k = 0; k < 4000 && r === null; k++) {
    const x = (k + 0.5) / 4000;
    if (mods.rules.pickLine(pie, {}, () => x).outcome === outcome) r = x;
  }
  const target = sim.discord.who(targetId);
  return sim.command(userId, 'foodfight', { subcommand: 'throw', options: { target: { user: target.user, member: target.member }, food: 'pie' }, force: { outcome, r }, kind: 'play' });
}

describe('a blessing over an evening', () => {
  test('🔥 Fired Up through 3 real throws: +1 on each hit (not the miss), its caster paid once — and a restart in the middle keeps it', async () => {
    const sim = fresh('magic-fired-up');
    sim.giveChi('ana', 20);
    await sim.cast('ana', 'bless', 'ben', 'fire');
    clock.now += MINUTE;
    const first = await throwAt(sim, 'ben', 'cat', 'hit');
    expect(tail(first)).toContain('-# 🔥 Fired Up: ben +1 (2 more).');
    expect(tail(first)).toContain(`-# ✨ ana's 🔥 Fired Up paid off: ana ${PAY_TEXT()}.`);
    // The bot restarts (a deploy): the blessing is in the scores file, not in memory
    await sim.restart();
    clock.now += MINUTE;
    const miss = await throwAt(sim, 'ben', 'cat', 'miss');
    expect(tail(miss).some(l => l.includes('Fired Up'))).toBe(false);
    expect(user(sim, 'ben').charms.bless.left).toBe(1);
    clock.now += MINUTE;
    const last = await throwAt(sim, 'ben', 'cat', 'hit');
    expect(tail(last)).toContain('-# 🔥 Fired Up: ben +1 (the last one).');
    expect(tail(last).some(l => l.includes('paid off'))).toBe(false);
    expect(user(sim, 'ben').charms).toBeUndefined();
    expect(user(sim, 'ben').games.foodfight.all.bonus).toBe(2 + 2); // two Fired Ups, and a regular's nights buff on each hit
    expect(user(sim, 'ana').lifetime.magic).toEqual({ paid: 1, paidElements: ['fire'] });
  });
});

describe('a hex over an evening', () => {
  test('🔥 Scorched bites, is shrugged off; a third member is refused by the ward, and its caster, once the ward is over, by the 72 hours', async () => {
    const sim = fresh('magic-scorched', { seed: 2 });
    sim.giveChi('cat', 20);
    sim.giveChi('dev', 20);
    await sim.cast('cat', 'hex', 'ana', 'fire');
    clock.now += MINUTE;
    const bitten = await throwAt(sim, 'ana', 'ben', 'hit');
    expect(tail(bitten)).toContain('-# 🔥 Scorched: ana −1 (2 more).');
    const shrug = await sim.bag('ana', 'shrug');
    expect(shrug.reply.content.split('\n')[1]).toBe(`-# 🔥 Scorched is gone. No hex can land on ana until <t:${Math.floor((clock.now + MAGIC.wardHours * HOUR) / 1000)}:t>.`);
    const ward = clock.now + MAGIC.wardHours * HOUR;
    const byDev = await sim.cast('dev', 'hex', 'ana', 'wind');
    expect(byDev.reply.content).toBe(B.fill(B.SIX_DEMON_BAG.refusals.warded, { target: 'ana', when: `<t:${Math.floor(ward / 1000)}:R>` }));
    clock.now = ward;
    const again = await sim.cast('cat', 'hex', 'ana', 'wind');
    expect(again.reply.content).toBe(B.fill(B.SIX_DEMON_BAG.refusals.pairLimit, { target: 'ana', when: `<t:${Math.floor((T0 + MAGIC.hexPairHours * HOUR) / 1000)}:R>` }));
    // dev, whose refusal cost nothing, can now
    expect((await sim.cast('dev', 'hex', 'ana', 'wind')).reply.ephemeralFor).toBeNull();
  });
});

describe('the siege is co-op', () => {
  test('a hex on a fighter is refused; a blessing on one is an ordinary blessing that never touches an attack (siege points move only by attacks)', async () => {
    const sim = fresh('magic-fighter', { seed: 3 });
    sim.giveChi('cat', 20);
    await sim.start({ monster: 'blob' });
    sim.calm();
    await sim.attack('ben', 'doom', { force: 'smite' });
    const hex = await sim.cast('cat', 'hex', 'ben', 'fire');
    expect(hex.reply.content).toBe(B.fill(B.SIX_DEMON_BAG.refusals.fighting, { target: 'ben' }));
    const bless = await sim.cast('cat', 'bless', 'ben', 'lightning');
    expect(bless.reply.ephemeralFor).toBeNull();
    clock.now += MINUTE;
    const attack = await sim.attack('ben', 'doom', { force: 'smite' });
    expect(attack.reply.content).not.toContain('Lightning Strike');
    expect(user(sim, 'ben').charms.bless).toMatchObject({ el: 'lightning', left: 1 });
    // …and earns its Chi like any good play
    expect(user(sim, 'ben').chi.n).toBe(2);
    // Off the battlefield, it strikes
    clock.now += MINUTE;
    const play = await throwAt(sim, 'ben', 'dev', 'hit');
    expect(tail(play)).toContain('-# ⚡ Lightning Strike: ben\'s points ×2.');
  });

  test('🌫️ Lost in the Smoke never loses a /rescue of a grabbed fighter: they\'re freed, and the hex keeps its plays', async () => {
    const sim = fresh('magic-lost', { seed: 4 });
    sim.giveChi('cat', 20);
    await sim.cast('cat', 'hex', 'ana', 'smoke');
    await sim.start({ monster: 'blob' });
    await sim.attack('ben', 'food', { force: 'splat' });
    await sim.attack('dev', 'food', { force: 'splat' });
    await sim.act('grab', ['ben']);
    expect(mods.store.isCaught(sim.siege().participants.ben)).toBe(true);
    const free = await sim.rescue('ana', 'ben', { force: 'rescued' });
    expect(tail(free).some(l => l.startsWith('-# 🛟 ana freed ben from'))).toBe(true);
    expect(free.reply.allowedMentions.users).toContain('ben');
    expect(mods.store.isCaught(sim.siege().participants.ben)).toBe(false);
    expect(user(sim, 'ana').charms.hex.left).toBe(2);
    // The help earned its Chi (+2), apart from the play's
    expect(sim.scores().daily.ana.helpChi).toBe(CHI.help);
    // A throw at someone the monster doesn't hold: lost, and only ana is pinged
    clock.now += MINUTE;
    const lost = await throwAt(sim, 'ana', 'eve', 'hit');
    expect(tail(lost)).toContain('-# 🌫️ Lost in the Smoke: ana\'s play loses its target (1 more).');
    expect(lost.reply.allowedMentions).toEqual({ parse: [], users: ['ana'] });
    expect(user(sim, 'eve').games?.foodfight).toBeUndefined();
  });

  test('🀄 Ching Dai\'s Curse never lands on the play that makes its player a fighter: a credited free, or a cure', async () => {
    const sim = fresh('magic-chingdai', { seed: 4 });
    // The luck that draws Ching Dai: a twist fires, the pool's last (Ching
    // Dai's Curse, while it can land), its element, its line
    const CURSE = [0, 0.9999, 0.5, 0.5];
    // Off the battlefield it lands — so below, it's the guard that stops it
    sim.luckQueue.push(...CURSE);
    const control = await throwAt(sim, 'eve', 'dev', 'hit');
    expect(tail(control).some(l => l.startsWith('-# 🎲 Twist! 🀄 Ching Dai\'s Curse:'))).toBe(true);
    expect(user(sim, 'eve').charms.hex).toMatchObject({ by: null, at: clock.now });

    await sim.start({ monster: 'blob' });
    await sim.attack('ben', 'food', { force: 'splat' });
    await sim.attack('dev', 'food', { force: 'splat' });
    // A free: cat joins the fight with it — the twist was rolled before she
    // did (the R3 review: the curse landed on her)
    await sim.act('grab', ['ben']);
    expect(mods.store.fightingNow(sim.siege(), 'cat', clock.now)).toBe(false);
    clock.now += 30 * 1000;
    sim.luckQueue.push(...CURSE);
    const free = await sim.rescue('cat', 'ben', { force: 'rescued' });
    expect(tail(free).some(l => l.startsWith('-# 🛟 cat freed ben from'))).toBe(true);
    expect(mods.store.fightingNow(sim.siege(), 'cat', clock.now)).toBe(true);
    expect(free.reply.content).not.toContain('Ching Dai');
    expect(user(sim, 'cat').charms?.hex).toBeUndefined();
    expect(sim.scores().daily.cat.hexRecv || 0).toBe(0);
    // A cure: ana joins the fight with it
    await sim.act('poison', ['dev']);
    expect(mods.store.fightingNow(sim.siege(), 'ana', clock.now)).toBe(false);
    sim.luckQueue.push(...CURSE);
    const cure = await sim.cure('ana', 'dev', { force: 'worked' });
    expect(tail(cure).some(l => l.startsWith('-# 🧪 ana cured dev of'))).toBe(true);
    expect(mods.store.fightingNow(sim.siege(), 'ana', clock.now)).toBe(true);
    expect(cure.reply.content).not.toContain('Ching Dai');
    expect(user(sim, 'ana').charms?.hex).toBeUndefined();
    expect(sim.scores().daily.ana?.hexRecv || 0).toBe(0);
  });

  test('a week campaign: an attack paid into the pot still earns its Chi', async () => {
    const sim = fresh('magic-week', { seed: 5, pace: 'week' });
    await sim.start({ monster: 'blob' });
    const a = await sim.attack('ana', 'doom', { force: 'smite' });
    // (2.75.0's wording for an attack paid into the pot)
    expect(a.reply.content).toContain('🍯 Your points go to the pot');
    expect(user(sim, 'ana').chi).toEqual({ n: CHI.earn });
    expect(sim.scores().daily.ana.chi).toBe(CHI.earn);
  });

  test('freeing a grabbed fighter earns 2 Chi, at most 6 a day from help — and the one that fills it says so', async () => {
    const sim = fresh('magic-help', { seed: 5 });
    await sim.start({ monster: 'blob' });
    await sim.attack('ben', 'food', { force: 'splat' });
    await sim.attack('dev', 'food', { force: 'splat' });
    const frees = [];
    for (let k = 0; k < 4; k++) {
      await sim.act('grab', ['ben']);
      expect(mods.store.isCaught(sim.siege().participants.ben)).toBe(true);
      clock.now += 30 * 1000;
      frees.push(await sim.rescue('cat', 'ben', { force: 'rescued' }));
    }
    expect(frees.map(f => tail(f).some(l => l.startsWith('-# 🛟 cat freed ben')))).toEqual([true, true, true, true]);
    // The 3rd free fills the day's help Chi (6); the 4th earns none from help, and is the day's 4th good
    // play, which fills the PLAY Chi — each cap says so on the play that reaches it
    expect(frees.map(f => tail(f).filter(l => l.startsWith('-# ☯️')))).toEqual([
      [], [], [`-# ☯️ cat +${CHI.help} Chi · ${B.SIX_DEMON_BAG.notes.capped}`], [`-# ☯️ cat +${CHI.earn} Chi · ${B.SIX_DEMON_BAG.notes.capped}`],
    ]);
    expect(sim.scores().daily.cat.helpChi).toBe(CHI.helpPerDay);
    // Each rescue was a good play too: its own Chi, within its own cap
    expect(user(sim, 'cat').chi.n).toBe(CHI.helpPerDay + 4 * CHI.earn);
  });
});

describe('a restart between a cast and the plays it shapes', () => {
  test('a deploy after a hex: it stands (once — a second is refused), and acts on the next play', async () => {
    const sim = fresh('magic-restart', { seed: 6 });
    sim.giveChi('ana', 20);
    await restartBot();
    await sim.cast('ana', 'hex', 'ben', 'thunder');
    await sim.restart();
    clock.now += MINUTE;
    // A second hex on ben is refused (already hexed) — the first survived the restart
    sim.giveChi('cat', 20);
    const second = await sim.cast('cat', 'hex', 'ben', 'fire');
    expect(second.reply.content).toBe(B.fill(B.SIX_DEMON_BAG.refusals.alreadyHexed, { target: 'ben' }));
    // Deafened works across it: ben's good play earns no Chi, and uses one of the five
    const play = await throwAt(sim, 'ben', 'dev', 'hit');
    expect(tail(play)).toContain('-# 🌩️ Deafened: no Chi for ben this time (4 more).');
    expect(user(sim, 'ben').chi).toBeUndefined();
  });
});

// ── Doug's decisions, 2026-11-07 ────────────────────────────────────────

describe('a harmful /potion a defence stopped', () => {
  test('💊 the Antidote or a 🌫️ Smoke Screen: the giver still scores its +1 but earns no Chi (as a stopped doom or throw), and a Deafened hex isn\'t spent on it', async () => {
    const sim = fresh('magic-stopped-potion', { seed: 7 });
    const chiOf = (id) => user(sim, id).chi?.n ?? 0;
    const chiToday = (id) => sim.scores().daily[id]?.chi ?? 0;
    // The control: a harmful potion that lands earns its Chi
    const landed = await sim.cure('ana', 'eve', { type: 'poison', force: 'worked' });
    expect(tail(landed).some(l => l.includes('Antidote') || l.includes('Smoke Screen'))).toBe(false);
    expect([chiOf('ana'), chiToday('ana')]).toEqual([CHI.earn, CHI.earn]);

    // The Antidote turns it aside: used up from ben's Glovebox, and no Chi for ana
    sim.giveItem('ben', 'antid');
    clock.now += MINUTE;
    const antidote = await sim.cure('ana', 'ben', { type: 'poison', force: 'worked' });
    expect(tail(antidote).some(l => l.startsWith('-# 💊 ben\'s Antidote: no harm done'))).toBe(true);
    expect(user(sim, 'ben').glovebox?.antid ?? 0).toBe(0);
    expect([chiOf('ana'), chiToday('ana')]).toEqual([CHI.earn, CHI.earn]);
    expect(tail(antidote).some(l => l.startsWith('-# ☯️'))).toBe(false);

    // A Smoke Screen turns it aside: gone from cat, its caster paid — and no Chi for ana
    sim.giveChi('dev', 20);
    await sim.cast('dev', 'bless', 'cat', 'smoke');
    const devChi = chiOf('dev');
    clock.now += MINUTE;
    const smoke = await sim.cure('ana', 'cat', { type: 'poison', force: 'worked' });
    expect(tail(smoke)).toContain('-# 🌫️ Smoke Screen: the play aimed at cat is lost in the smoke.');
    expect(tail(smoke)).toContain(`-# ✨ dev's 🌫️ Smoke Screen paid off: dev ${PAY_TEXT()}.`);
    expect(user(sim, 'cat').charms).toBeUndefined();
    expect(chiOf('dev')).toBe(devChi + (MAGIC.casterPayIn === 'chi' ? MAGIC.casterPay : 0));
    expect([chiOf('ana'), chiToday('ana')]).toEqual([CHI.earn, CHI.earn]);

    // Deafened blocks only Chi that would have been earned: a stopped potion leaves its five plays alone
    sim.giveChi('eve', 20);
    clock.now += MINUTE;
    await sim.cast('eve', 'hex', 'ana', 'thunder');
    sim.giveItem('dev', 'antid');
    clock.now += MINUTE;
    const deafStopped = await sim.cure('ana', 'dev', { type: 'poison', force: 'worked' });
    expect(tail(deafStopped).some(l => l.startsWith('-# 💊 dev\'s Antidote: no harm done'))).toBe(true);
    expect(tail(deafStopped).some(l => l.includes('Deafened'))).toBe(false);
    expect(user(sim, 'ana').charms.hex).toMatchObject({ el: 'thunder', left: mods.rewards.CHARMS.thunder.hex.plays });
    clock.now += MINUTE;
    const deafLanded = await sim.cure('ana', 'ben', { type: 'poison', force: 'worked' });
    expect(tail(deafLanded)).toContain(`-# 🌩️ Deafened: no Chi for ana this time (${mods.rewards.CHARMS.thunder.hex.plays - 1} more).`);
    expect([chiOf('ana'), chiToday('ana')]).toEqual([CHI.earn, CHI.earn]);
  });
});

describe('🚗 a Car Break-In and the 🧿 Jade Charm', () => {
  /** The r that lands the twist draw on `key`, every twist in the pool (as on these plays) */
  const rTwist = (key) => {
    const { TWISTS } = mods.rewards;
    const total = Object.values(TWISTS).reduce((n, t) => n + t.weight, 0);
    let before = 0;
    for (const [k, t] of Object.entries(TWISTS)) {
      if (k === key) return (before + t.weight / 2) / total;
      before += t.weight;
    }
    throw new Error(`no twist ${key}`);
  };

  test('the Jade Charm is never stolen, like the Night Light: beside Garlic the Garlic goes; with only those two held, the mosquitoes come instead', async () => {
    const sim = fresh('magic-breakin', { seed: 8 });
    // A twist fires, the draw lands on Car Break-In, and the item pick takes the last that can go
    // (the Jade Charm is the Glovebox's last item: were it stealable, this would take it)
    sim.giveItem('ana', 'garlic');
    sim.giveItem('ana', 'jade');
    sim.luckQueue.push(0, rTwist('breakin'), 0.9999);
    const robbed = await throwAt(sim, 'ana', 'ben', 'hit');
    expect(tail(robbed)).toContain('-# 🎲 Twist! 🚗 Car Break-In: Someone jimmied ana\'s glovebox and swiped the 🧄 Garlic. They left half a corn dog.');
    expect(user(sim, 'ana').glovebox).toEqual({ jade: 1 });
    // The break-in never touches the bag: the hit's own Chi is there
    expect(user(sim, 'ana').chi).toEqual({ n: CHI.earn });

    // Only safe things in the Glovebox: nothing to take, so a Mosquito Swarm instead
    sim.giveItem('cat', 'nlight');
    sim.giveItem('cat', 'jade');
    clock.now += MINUTE;
    sim.luckQueue.push(0, rTwist('breakin'));
    const swarmed = await throwAt(sim, 'cat', 'ben', 'hit');
    expect(tail(swarmed).some(l => l.startsWith('-# 🎲 Twist! 🦟 Mosquito Swarm:'))).toBe(true);
    expect(swarmed.reply.content).not.toContain('Car Break-In');
    expect(user(sim, 'cat').glovebox).toEqual({ nlight: 1, jade: 1 });
    expect(user(sim, 'cat').effects.mosquito).toMatchObject({ playsLeft: mods.rewards.TWISTS.mosquito.plays });
    expect(user(sim, 'cat').chi).toEqual({ n: CHI.earn });
  });
});

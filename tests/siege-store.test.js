/**
 * /siege's rules and state (R5), store-level: the HP formula and its
 * growth, the difficulty dial, damage per weapon with every monster
 * multiplier, Spooked, the Silver Bullet, poison ticks, no overkill, the
 * HP floor, finishing exactly once, and the exact reward maths with seeded
 * luck — checked against the stored numbers, not that "something
 * happened". The card's worst case is measured against Discord's limits at
 * the end.
 *
 * The commands, the scheduler and the fake Discord are in
 * tests/siege-commands.test.js.
 *
 * Run with: npm test -- tests/siege-store.test.js
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import * as store from '../src/utils/siegeStore.js';
import { loadState, mutate } from '../src/utils/happeningStore.js';
import { loadScores, deleteScores, recordPlay, mutateScores, applySiegeResult, resetScores, applySiegePenalty } from '../src/utils/gameScores.js';
import { renderSiegeCard, resultsPayload, cardPayload } from '../src/utils/siegeCard.js';
import { createKit, KIT_CODES } from '../src/utils/emojiKit.js';
import { messageProblems } from '../src/utils/embedFit.js';
import { SIEGE, RANDOM_PRIZE_ITEMS, SIEGE_PACES, PACE_RULES } from '../src/data/gameRewards.js';
import { siegeTimings } from '../src/utils/gamePace.js';
import { MONSTERS } from '../src/data/siegeMonsters.js';
import { HAPPENINGS } from '../src/data/gameHappenings.js';
import { _setLuck } from '../src/utils/gameLuck.js';

const GUILD = 'siege-store-guild';
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * 60 * MIN;
// A Monday evening in November 2026: no calendar happening to bend anything
const T = Date.UTC(2026, 10, 9, 20, 0);
const NAMES = { sam: 'Sam', alex: 'Alex', kim: 'Kim' };

/** A monster with every multiplier at 1 and no traits: the plain arithmetic */
const PLAIN = { name: 'Plain', emoji: '🟥', hp: 1, damage: { food: 1, doom: 1, potion: 1 }, traits: {} };

function happeningFiles() {
  const dir = process.env.GUILD_HAPPENINGS_DIR;
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.startsWith(`${GUILD}.json`)).map(f => path.join(dir, f)) : [];
}

beforeEach(() => {
  // This suite's files only: the directories are shared with the worker's other suites
  for (const f of happeningFiles()) fs.unlinkSync(f);
  deleteScores(GUILD);
});

/** Another guild of this suite's, its files cleared first (the scratch directory outlives a run) */
function otherGuild(suffix) {
  const id = `${GUILD}-${suffix}`;
  const dir = process.env.GUILD_HAPPENINGS_DIR;
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (f.startsWith(`${id}.json`)) fs.unlinkSync(path.join(dir, f));
  return id;
}

/** `n` members who played within the week (A7) */
function active(n, at = T) {
  mutate(GUILD, (d) => { for (let i = 0; i < n; i++) d.activity.recent[`m${i}`] = at - DAY; });
}

const spawn = (monster = 'klowns', { minutes = 45, at = T } = {}) => {
  const out = store.spawnSiege(GUILD, { monster, minutes, channelId: 'games', startedBy: 'admin' }, at);
  if (out.error) throw new Error(out.error);
  return out.siege;
};
const hit = (s, userId, weapon, outcome, at = T + MIN, extra = {}) =>
  store.siegeAttack(GUILD, s.id, { userId, name: NAMES[userId] || userId, weapon, outcome, ...extra }, at);
const now = () => loadState(GUILD).siege;
const tick = (s, at) => store.siegeTick(GUILD, s.id, at);

/** A fighter as siegeAttack writes one, with the numbers a test wants */
const fighter = (name, damage, firstAt, attacks = 3) => ({
  name, damage, attacks, frees: 0, cures: 0, firstAt, firstAttackAt: attacks > 0 ? firstAt : null, lastAt: firstAt,
  spooked: false, poison: null, caught: null, poisoned: null, out: false,
});
function setFighters(list, hp = 0) {
  mutate(GUILD, (d) => {
    d.siege.participants = Object.fromEntries(list.map(([id, name, dmg, attacks = 3], i) => [id, fighter(name, dmg, T + i, attacks)]));
    d.siege.hp = hp;
  });
}

/** Luck that hands out exactly these draws, and fails the test if asked for one more */
function scripted(draws) {
  const left = [...draws];
  const fn = () => {
    if (!left.length) throw new Error('luck asked for more draws than the test scripted');
    return left.shift();
  };
  fn.left = () => left.length;
  return fn;
}

/** Mark a finished siege's results as posted, so the next one may start */
function settle(s) {
  store.claimResults(GUILD, s.id, T);
  store.recordResults(GUILD, s.id, 'msg', T);
}

const siegeStats = (userId) => loadScores(GUILD).users[userId]?.games?.siege;

describe('the monster the plain tests use', () => {
  test('Killer Klowns: every multiplier 1, none of R5\'s traits (else the numbers below are wrong, not the code)', () => {
    expect(MONSTERS.klowns).toMatchObject({ hp: 1, damage: { food: 1, doom: 1, potion: 1 } });
    for (const t of ['missHeal', 'hitBonus', 'poisonMult', 'silverMult', 'loot']) expect(MONSTERS.klowns.traits).not.toHaveProperty(t);
  });
});

// ── HP ──────────────────────────────────────────────────────────────────

describe('HP', () => {
  test('round(clamp((2·A7 + 45·F)·D, 40, 2000) · monster.hp)', () => {
    expect(store.siegeHp({ a7: 0 })).toBe(40);
    expect(store.siegeHp({ a7: 19 })).toBe(40); // 38: the floor
    expect(store.siegeHp({ a7: 30 })).toBe(60);
    expect(store.siegeHp({ a7: 30, dial: 1.5 })).toBe(90);
    expect(store.siegeHp({ a7: 30, monsterHp: 1.3 })).toBe(78);
    expect(store.siegeHp({ a7: 0, monsterHp: 1.15 })).toBe(46); // the floor, then × hp
    expect(store.siegeHp({ a7: 5000 })).toBe(2000);
    expect(store.siegeHp({ a7: 5000, monsterHp: 1.15 })).toBe(2300);
    expect(store.siegeHp({ a7: 10, fighters: 2 })).toBe(110);
    expect(store.siegeHp({ a7: 30, dial: 0.3 })).toBe(40); // 18: the floor is after D
  });

  test('a new fighter makes max HP the formula\'s with them counted: the floor and the ceiling are on the whole sum', () => {
    // A quiet server: 40 is the floor, and the first fighter's 45 replaces
    // it rather than stacking on it (85 was the bug: above the spec)
    expect(store.joinGrowth(40, { a7: 0, fighters: 1 })).toBe(5);
    expect(store.joinGrowth(45, { a7: 0, fighters: 2 })).toBe(45);
    expect(store.joinGrowth(40, { a7: 10, fighters: 1 })).toBe(25); // 20 + 45
    expect(store.joinGrowth(60, { a7: 30, fighters: 1 })).toBe(45);
    expect(store.joinGrowth(120, { a7: 30, fighters: 1, dial: 2 })).toBe(90);
    expect(store.joinGrowth(78, { a7: 30, fighters: 1, monsterHp: 1.3 })).toBe(59); // 136.5 → 137
    expect(store.joinGrowth(1980, { fighters: 45 })).toBe(20); // 2025: the ceiling
    expect(store.joinGrowth(2000, { fighters: 46 })).toBe(0);
    expect(store.joinGrowth(2580, { fighters: 45, monsterHp: 1.3 })).toBe(20); // ceiling 2600
  });

  test('on a quiet server the fighters set the HP, as the spec says: 40, then 45, 90, 225 for 0, 1, 2, 5', () => {
    const s = spawn('klowns');
    const maxes = [now().maxHp];
    for (const id of ['f1', 'f2', 'f3', 'f4', 'f5']) {
      hit(s, id, 'food', 'splatback');
      maxes.push(now().maxHp);
    }
    expect(maxes).toEqual([40, 45, 90, 135, 180, 225]);
    expect(maxes.map((m, f) => m === store.siegeHp({ a7: 0, fighters: f }))).toEqual(Array(6).fill(true));
  });

  test('a fighter who joins in the last 5 minutes doesn\'t grow it (a newcomer\'s last-second attack can\'t save it)', () => {
    const s = spawn('klowns', { minutes: 30 });
    hit(s, 'sam', 'doom', 'smite', T + MIN); // 45 → 29
    const late = hit(s, 'troll', 'doom', 'dodged', T + 25 * MIN + 1).hit;
    expect(late).toMatchObject({ joined: 0, hp: 29, maxHp: 45 });
    expect(now().participants.troll.attacks).toBe(1);
    // The minute before the window still grows it
    const s2 = (() => { store.finishSiege(GUILD, s.id, 'ended', T + 26 * MIN, scripted([])); return spawn('klowns', { minutes: 30, at: T + 30 * MIN }); })();
    expect(hit(s2, 'sam', 'food', 'splatback', T + 54 * MIN).hit.joined).toBe(5);
  });

  test('a spawn reads A7 from who played in the last 7 days; each NEW fighter\'s first attack grows max and current HP', () => {
    mutate(GUILD, (d) => {
      for (let i = 0; i < 30; i++) d.activity.recent[`m${i}`] = T - 6 * DAY;
      d.activity.recent.stale = T - 7 * DAY - 1;
      d.activity.recent.older = T - 30 * DAY;
    });
    const s = spawn('klowns');
    expect([s.a7, s.hp, s.maxHp, s.dial, s.status, s.endsAt]).toEqual([30, 60, 60, 1, 'live', T + 45 * MIN]);
    expect(loadState(GUILD).lastSiegeAt).toBe(T);

    expect(hit(s, 'sam', 'food', 'splat').hit).toMatchObject({ joined: 45, damage: 8, hp: 97, maxHp: 105 });
    expect(hit(s, 'sam', 'food', 'splat', T + 2 * MIN).hit).toMatchObject({ joined: 0, damage: 8, hp: 89, maxHp: 105 });
    expect(hit(s, 'alex', 'doom', 'dodged', T + 3 * MIN).hit).toMatchObject({ joined: 45, damage: 0, hp: 134, maxHp: 150 });
    expect(now().participants).toEqual({
      sam: { ...fighter('Sam', 16, T + MIN, 2), lastAt: T + 2 * MIN },
      alex: { ...fighter('Alex', 0, T + 3 * MIN, 1) },
    });
  });

  test('one siege at a time, and not while the last one\'s results wait to be posted', () => {
    const s = spawn('klowns');
    expect(store.spawnSiege(GUILD, { monster: 'blob', minutes: 30 }, T + MIN)).toMatchObject({ error: 'in-progress' });
    store.finishSiege(GUILD, s.id, 'escaped', T + 2 * MIN, scripted([]));
    expect(store.spawnSiege(GUILD, { monster: 'blob', minutes: 30 }, T + 3 * MIN)).toMatchObject({ error: 'results-pending' });
    settle(s);
    expect(store.spawnSiege(GUILD, { monster: 'blob', minutes: 30 }, T + 4 * MIN).siege.monster).toBe('blob');
    expect(store.spawnSiege(GUILD, { monster: 'nope', minutes: 30 }, T)).toEqual({ error: 'unknown-monster' });
  });
});

// ── the dial ────────────────────────────────────────────────────────────

describe('the difficulty dial', () => {
  test('×1.05 after a win and ×0.88 after an escape that took half its HP, with 2+ fighters; clamped to 0.5–2.5', () => {
    expect(store.nextDial(1, 'won', 2)).toBe(1.05);
    expect(store.nextDial(1, 'escaped', 2)).toBe(0.88);
    expect(store.nextDial(1, 'escaped', 2, 0.5)).toBe(0.88);
    // Fighters who barely touched it don't make the next one easier
    expect(store.nextDial(1, 'escaped', 2, 0.49)).toBe(1);
    expect(store.nextDial(1, 'escaped', 2, 0)).toBe(1);
    expect(store.nextDial(1, 'won', 2, 0)).toBe(1.05);
    expect(store.nextDial(1, 'won', 1)).toBe(1);
    expect(store.nextDial(1, 'escaped', 1)).toBe(1);
    expect(store.nextDial(1, 'ended', 9)).toBe(1);
    expect(store.nextDial(2.45, 'won', 3)).toBe(2.5);
    expect(store.nextDial(0.55, 'escaped', 3)).toBe(0.5);
    expect(SIEGE.dial.min).toBe(0.5);
  });

  test('two members letting sieges walk away untouched can\'t drive it down at all', () => {
    let at = T;
    for (let n = 0; n < 10; n++) {
      const s = spawn('blob', { minutes: 30, at });
      hit(s, 'a', 'food', 'splatback', at + 1000);
      hit(s, 'b', 'food', 'splatback', at + 2000);
      store.finishSiege(GUILD, s.id, 'escaped', at + 31 * MIN, scripted([]));
      settle(s);
      at += 32 * MIN;
    }
    expect(loadState(GUILD).siegeDial).toBe(1);
  });

  test('a finish moves the stored dial, and the next siege\'s HP and growth use it', () => {
    active(30);
    let s = spawn('klowns');
    hit(s, 'sam', 'food', 'splat');
    hit(s, 'alex', 'food', 'splat');
    store.finishSiege(GUILD, s.id, 'won', T + 5 * MIN, scripted([0.99, 0.99, 0.99]));
    expect(loadState(GUILD).siegeDial).toBe(1.05);
    settle(s);

    s = spawn('klowns', { at: T + 10 * MIN });
    expect([s.hp, s.dial]).toEqual([63, 1.05]);
    expect(hit(s, 'sam', 'food', 'splat', T + 11 * MIN).hit.joined).toBe(47); // 47.25

    // An escape with one fighter leaves it; so does one two fought that
    // they dealt under half its HP; with half dealt, ×0.88
    store.finishSiege(GUILD, s.id, 'escaped', T + 20 * MIN, scripted([]));
    expect(loadState(GUILD).siegeDial).toBe(1.05);
    settle(s);
    s = spawn('klowns', { at: T + 30 * MIN });
    hit(s, 'sam', 'food', 'splash', T + 31 * MIN);
    hit(s, 'kim', 'food', 'splash', T + 31 * MIN);
    store.finishSiege(GUILD, s.id, 'escaped', T + 80 * MIN, scripted([]));
    expect(loadState(GUILD).siegeDial).toBe(1.05);
    settle(s);
    s = spawn('klowns', { at: T + 90 * MIN });
    hit(s, 'sam', 'food', 'splash', T + 91 * MIN);
    hit(s, 'kim', 'food', 'splash', T + 91 * MIN);
    const max = now().maxHp;
    setFighters([['sam', 'Sam', Math.ceil(max / 2)], ['kim', 'Kim', 0]], max - Math.ceil(max / 2));
    store.finishSiege(GUILD, s.id, 'escaped', T + 140 * MIN, scripted([]));
    expect(loadState(GUILD).siegeDial).toBe(0.924);
  });
});

// ── damage ──────────────────────────────────────────────────────────────

describe('damage', () => {
  const dmg = (outcome, weapon, monster = PLAIN, extra = {}) => store.attackDamage({ outcome, weapon, monster, ...extra });

  test('per outcome: splat 8, splash 3, smite 16, poisoned 4 now; backfires and dodges 0', () => {
    expect([dmg('splat', 'food'), dmg('splash', 'food'), dmg('splatback', 'food')]).toEqual([8, 3, 0]);
    expect([dmg('smite', 'doom'), dmg('dodged', 'doom'), dmg('spooked', 'doom')]).toEqual([16, 0, 0]);
    expect([dmg('poisoned', 'potion'), dmg('fizzled', 'potion')]).toEqual([4, 0]);
  });

  test('× the monster\'s weapon multiplier (rounded), then its hitBonus on every hit that does damage', () => {
    const blobby = { ...PLAIN, damage: { food: 0.5, doom: 1.25, potion: 1 } };
    expect([dmg('splat', 'food', blobby), dmg('splash', 'food', blobby), dmg('smite', 'doom', blobby)]).toEqual([4, 2, 20]);
    const swarm = { ...PLAIN, traits: { hitBonus: 2 } };
    expect([dmg('splat', 'food', swarm), dmg('splash', 'food', swarm), dmg('splatback', 'food', swarm), dmg('poisoned', 'potion', swarm)])
      .toEqual([10, 5, 0, 6]);
    // A weapon a monster shrugs off stays shrugged off (×0 isn't "unset")
    expect(dmg('smite', 'doom', { ...PLAIN, damage: { food: 1, doom: 0, potion: 1 } })).toBe(0);
  });

  test('Spooked halves the whole attack; the Silver Bullet ×3, or the monster\'s own silverMult', () => {
    expect(dmg('smite', 'doom', PLAIN, { spooked: true })).toBe(8);
    expect(dmg('smite', 'doom', { ...PLAIN, traits: { hitBonus: 2 } }, { spooked: true })).toBe(9); // (16+2)/2
    expect(dmg('splat', 'food', PLAIN, { silver: true })).toBe(24);
    expect(dmg('splat', 'food', { ...PLAIN, traits: { silverMult: 5 } }, { silver: true })).toBe(40);
    expect(dmg('splat', 'food', PLAIN, { silver: true, spooked: true })).toBe(12);
    expect(dmg('splatback', 'food', PLAIN, { silver: true })).toBe(0);
  });

  test('the real monsters: The Blob\'s soft food, THEM!\'s bonus, the Wolfman\'s silver', () => {
    expect(dmg('splat', 'food', MONSTERS.blob)).toBe(Math.round(8 * MONSTERS.blob.damage.food));
    expect(dmg('splat', 'food', MONSTERS.them)).toBe(8 + MONSTERS.them.traits.hitBonus);
    expect(dmg('splat', 'food', MONSTERS.wolfman, { silver: true })).toBe(8 * MONSTERS.wolfman.traits.silverMult);
  });

  test('Spooked, in the store: a spooked doom sets it, the next attack is halved and spends it', () => {
    active(30);
    const s = spawn('klowns');
    expect(hit(s, 'kim', 'doom', 'spooked').hit).toMatchObject({ damage: 0, spooked: true, wasSpooked: false });
    expect(now().participants.kim.spooked).toBe(true);
    expect(hit(s, 'kim', 'doom', 'smite', T + 2 * MIN).hit).toMatchObject({ damage: 8, spooked: false, wasSpooked: true });
    expect(hit(s, 'kim', 'doom', 'smite', T + 3 * MIN).hit).toMatchObject({ damage: 16, wasSpooked: false });
    expect(now().participants.kim.damage).toBe(24);
  });

  test('the Silver Bullet in the store says what it multiplied', () => {
    active(30);
    const s = spawn('klowns');
    expect(hit(s, 'sam', 'food', 'splat', T + MIN, { silver: true }).hit).toMatchObject({ damage: 24, silverMult: 3 });
    expect(hit(s, 'alex', 'food', 'splat', T + MIN).hit).toMatchObject({ damage: 8, silverMult: null });
  });

  test('Gremlins heal a share of max HP on a food miss, never past max', () => {
    active(30);
    const s = spawn('gremlins');
    hit(s, 'sam', 'food', 'splat'); // 60 + 45 = 105, −8 → 97
    const heal = Math.round(MONSTERS.gremlins.traits.missHeal * 105);
    expect(hit(s, 'sam', 'food', 'splash', T + 2 * MIN).hit).toMatchObject({ damage: 3, healed: heal, hp: 97 - 3 + heal });
    // A doom that misses feeds nobody
    expect(hit(s, 'sam', 'doom', 'dodged', T + 3 * MIN).hit.healed).toBe(0);
    // Never past max: a big monster's 2% is 20, but only the 3 just lost can come back
    mutate(GUILD, (d) => { d.siege.maxHp = 1000; d.siege.hp = 1000; });
    expect(hit(s, 'sam', 'food', 'splash', T + 4 * MIN).hit).toMatchObject({ damage: 3, healed: 3, hp: 1000 });
  });
});

// ── poison ──────────────────────────────────────────────────────────────

describe('poison', () => {
  test('4 now, then 2 a minute for 5 minutes, credited to the poisoner; a late pass catches up exactly', () => {
    active(30);
    const s = spawn('klowns');
    const r = hit(s, 'sam', 'potion', 'poisoned', T);
    expect(r.hit).toMatchObject({ damage: 4, hp: 101, poison: { perMin: 2, minutes: 5, restarted: false } });
    expect(now().participants.sam.poison).toEqual({ perMin: 2, until: T + 5 * MIN, lastTickAt: T });

    expect(tick(s, T + 30_000)).toEqual({ error: 'nothing-due' });
    expect(tick(s, T + MIN).dealt).toBe(2);
    expect(tick(s, T + 3 * MIN).dealt).toBe(4);
    expect(tick(s, T + 10 * MIN).dealt).toBe(4); // only to its end: 5 ticks in all
    expect(tick(s, T + 11 * MIN)).toEqual({ error: 'nothing-due' });
    expect([now().hp, now().participants.sam.damage, now().participants.sam.poison]).toEqual([91, 14, null]);
  });

  test('one poison per fighter: a new one deals what the old one owed, then starts over', () => {
    active(30);
    const s = spawn('klowns');
    hit(s, 'sam', 'potion', 'poisoned', T);
    // No pass ran for 3½ minutes: the restart deals the 3 owed ticks first
    expect(hit(s, 'sam', 'potion', 'poisoned', T + 3.5 * MIN).hit.poison).toEqual({ perMin: 2, minutes: 5, restarted: true });
    expect(now().participants.sam.poison).toEqual({ perMin: 2, until: T + 8.5 * MIN, lastTickAt: T + 3.5 * MIN });
    expect(tick(s, T + 30 * MIN).dealt).toBe(10);
    expect(now().participants.sam.damage).toBe(4 + 6 + 4 + 10);
  });

  test('each poison is its own fighter\'s; poisonMult changes the ticks; none past the siege\'s end', () => {
    active(30);
    let s = spawn('klowns', { minutes: 30 });
    hit(s, 'sam', 'potion', 'poisoned', T);
    hit(s, 'alex', 'potion', 'poisoned', T + 28 * MIN);
    expect(tick(s, T + 40 * MIN).dealt).toBe(10 + 4); // alex's: T+29 and T+30 only
    expect([now().participants.sam.damage, now().participants.alex.damage]).toEqual([14, 8]);
    store.finishSiege(GUILD, s.id, 'escaped', T + 41 * MIN, scripted([]));
    settle(s);

    s = spawn('count', { at: T + 50 * MIN });
    expect(store.poisonPerMinute(MONSTERS.count)).toBe(Math.round(2 * MONSTERS.count.traits.poisonMult));
    hit(s, 'kim', 'potion', 'poisoned', T + 50 * MIN);
    expect(tick(s, T + 70 * MIN).dealt).toBe(5 * store.poisonPerMinute(MONSTERS.count));
  });
});

// ── the floor, and attacks that come too late ───────────────────────────

describe('no overkill, and nothing after the end', () => {
  test('credit is the HP actually removed; at 0 the killing blow is kept and later attacks are refused', () => {
    const s = spawn('klowns'); // a7 0: 40, then sam's 45
    hit(s, 'sam', 'food', 'splat'); // 85 → 77
    mutate(GUILD, (d) => { d.siege.hp = 5; });
    const r = hit(s, 'sam', 'doom', 'smite', T + 2 * MIN);
    expect(r.hit).toMatchObject({ raw: 16, damage: 5, hp: 0, killingBlow: true });
    expect(now().participants.sam.damage).toBe(13);
    expect(now().killingBlow).toEqual({ userId: 'sam', name: 'Sam', at: T + 2 * MIN, by: 'doom' });
    expect(hit(s, 'alex', 'food', 'splat', T + 3 * MIN)).toMatchObject({ error: 'beaten' });
    expect(now().participants).not.toHaveProperty('alex');
    expect(now().hp).toBe(0);
  });

  test('a poison can land the killing blow, and takes only what was left', () => {
    const s = spawn('klowns');
    hit(s, 'kim', 'potion', 'poisoned', T);
    mutate(GUILD, (d) => { d.siege.hp = 1; });
    expect(tick(s, T + 2 * MIN).dealt).toBe(1);
    expect(now().killingBlow).toEqual({ userId: 'kim', name: 'Kim', at: T + MIN, by: 'poison' });
  });

  test('refused: after an admin end, after its time, and for a siege that\'s been replaced', () => {
    const s = spawn('klowns', { minutes: 30 });
    expect(hit(s, 'sam', 'food', 'splat', T + 30 * MIN)).toMatchObject({ error: 'time-up' });
    store.finishSiege(GUILD, s.id, 'ended', T + 10 * MIN, scripted([]));
    expect(hit(s, 'sam', 'food', 'splat', T + 11 * MIN)).toMatchObject({ error: 'not-live' });
    const next = spawn('blob', { at: T + 20 * MIN });
    expect(hit(s, 'sam', 'food', 'splat', T + 21 * MIN)).toEqual({ error: 'not-current' });
    expect(now().id).toBe(next.id);
    expect(now().participants).toEqual({});
  });
});

// ── finishing ───────────────────────────────────────────────────────────

describe('finishSiege', () => {
  test('runs exactly once: a second call is `not-live` and pays nothing', () => {
    const s = spawn('klowns');
    setFighters([['sam', 'Sam', 40], ['alex', 'Alex', 20]]);
    expect(store.finishSiege(GUILD, s.id, 'won', T + 5 * MIN, scripted([0.99, 0.99, 0.99])).siege.status).toBe('won');
    const paid = JSON.stringify(loadScores(GUILD));
    expect(store.finishSiege(GUILD, s.id, 'won', T + 6 * MIN, scripted([]))).toMatchObject({ error: 'not-live' });
    expect(store.finishSiege(GUILD, s.id, 'escaped', T + 6 * MIN, scripted([]))).toMatchObject({ error: 'not-live' });
    expect(JSON.stringify(loadScores(GUILD))).toBe(paid);
    expect(loadState(GUILD).siegeDial).toBe(1.05);
    expect(now()).toMatchObject({ status: 'won', finishedAt: T + 5 * MIN });
  });

  test('a win: the pool split by share, 2–30 each, the MVP +5 and loot, others 25% at ≥5% — exactly', () => {
    const s = spawn('klowns');
    setFighters([['sam', 'Sam', 60], ['alex', 'Alex', 30], ['kim', 'Kim', 10]]);
    // MVP: 0.5 → not silver, 0 → the first prize item. Alex (30%): 0.2 → loot,
    // 0.1 → silver. Kim (10%): 0.9 → none.
    const luck = scripted([0.5, 0, 0.2, 0.1, 0.9]);
    const at = T + 5 * MIN;
    store.finishSiege(GUILD, s.id, 'won', at, luck);
    expect(luck.left()).toBe(0);

    const { result } = now();
    expect(result).toMatchObject({ status: 'won', mvp: { userId: 'sam', name: 'Sam' }, announcedAt: null, messageId: null });
    // pool = clamp(8·3, 24, 200) = 24: 14.4 → 14 (+5), 7.2 → 7, 2.4 → 2
    expect(result.grants.map(g => [g.userId, g.points, g.loot, g.titles, g.total, g.mvp])).toEqual([
      ['sam', 19, { item: RANDOM_PRIZE_ITEMS[0], overflow: false }, ['siege-mvp'], 29, true],
      ['alex', 7, { item: 'silver', overflow: false }, [], 7, false],
      ['kim', 2, null, [], 2, false],
    ]);
    const scores = loadScores(GUILD);
    expect(siegeStats('sam').all).toMatchObject({ points: 29, bonus: 29, plays: 0 });
    expect(siegeStats('sam')[`m2026-11`]).toMatchObject({ points: 29, bonus: 29 });
    expect(siegeStats('alex').y2026).toMatchObject({ points: 7, bonus: 7 });
    expect(siegeStats('kim').all.points).toBe(2);
    expect(scores.users.sam.glovebox).toEqual({ [RANDOM_PRIZE_ITEMS[0]]: 1 });
    expect(scores.users.alex.glovebox).toEqual({ silver: 1 });
    expect(scores.users.kim.glovebox).toBeUndefined();
    expect(scores.users.sam.lifetime.siege).toEqual({ wins: 1, mvps: 1, kaiju: 0 });
    expect(scores.users.kim.lifetime.siege).toEqual({ wins: 1, mvps: 0, kaiju: 0 });
    expect(scores.users.sam.titles.earned['siege-mvp']).toBe(at);
  });

  test('a full stack is +2 instead; the 30 cap; nobody under 5% is rolled for at all', () => {
    const s = spawn('klowns');
    const many = [['sam', 'Sam', 1000], ...Array.from({ length: 25 }, (_, i) => [`f${i}`, `F${i}`, 1])];
    setFighters(many);
    mutateScores(GUILD, (d) => { d.users.sam = { name: 'Sam', games: {}, glovebox: { silver: 2 } }; });
    // One draw: the MVP's 0.1 → silver. 25 fighters on 0.1% each draw nothing.
    const luck = scripted([0.1]);
    store.finishSiege(GUILD, s.id, 'won', T + 5 * MIN, luck);
    expect(luck.left()).toBe(0);
    const { grants } = now().result;
    // pool = clamp(8·26, 24, 200) = 200: Sam's 97.6% is 195 → 30, +5
    expect(grants[0]).toMatchObject({ userId: 'sam', points: 35, loot: { item: 'silver', overflow: true }, total: 35 + 2 + 10 });
    expect(grants.slice(1).map(g => g.points)).toEqual(Array(25).fill(2));
    expect(grants.slice(1).every(g => g.loot === null)).toBe(true);
    expect(loadScores(GUILD).users.sam.glovebox).toEqual({ silver: 2 });
    expect(siegeStats('sam').all.points).toBe(47);
  });

  test('loot × the monster\'s traits.loot; beating the kaiju counts for everyone (Kaiju Killer)', () => {
    expect(SIEGE.kaiju).toBe('lizard');
    const s = spawn('lizard');
    setFighters([['sam', 'Sam', 50], ['alex', 'Alex', 50]]);
    // Alex's 0.4 is loot at 25% × 2, where it wouldn't be at 25%
    const luck = scripted([0.9, 0.999, 0.4, 0.2]);
    store.finishSiege(GUILD, s.id, 'won', T + 5 * MIN, luck);
    const { grants } = now().result;
    expect(MONSTERS.lizard.traits.loot).toBe(2);
    expect(grants.map(g => [g.userId, g.points, g.loot?.item ?? null, g.titles])).toEqual([
      // Equal damage: the one who joined first is MVP. 24 split 12/12.
      ['sam', 17, RANDOM_PRIZE_ITEMS.at(-1), ['siege-mvp', 'kaiju-killer']],
      ['alex', 12, 'silver', ['kaiju-killer']],
    ]);
    expect(loadScores(GUILD).users.alex.lifetime.siege).toEqual({ wins: 1, mvps: 0, kaiju: 1 });
  });

  test('the same 0.4 is no loot against a monster without the trait', () => {
    const s = spawn('klowns');
    setFighters([['sam', 'Sam', 50], ['alex', 'Alex', 50]]);
    store.finishSiege(GUILD, s.id, 'won', T + 5 * MIN, scripted([0.9, 0.999, 0.4]));
    expect(now().result.grants[1].loot).toBeNull();
  });

  test('an escape: −3 for everyone who attacked when 2+ fought, never taking a month below 0', () => {
    const role = { kind: 'role', pingUserIds: [] };
    for (let i = 0; i < 4; i++) recordPlay(GUILD, { game: 'foodfight', actor: { id: 'sam', name: 'Sam' }, target: role, outcome: 'hit' }, T + i); // +12
    recordPlay(GUILD, { game: 'potion', actor: { id: 'alex', name: 'Alex' }, target: role, outcome: 'worked', effect: 'harmful' }, T); // +2
    const s = spawn('klowns');
    // 20 of its 40 HP: half, so the dial moves too
    setFighters([['sam', 'Sam', 12], ['alex', 'Alex', 6], ['kim', 'Kim', 2]], 20);
    store.finishSiege(GUILD, s.id, 'escaped', T + 50 * MIN, scripted([]));
    const { result } = now();
    expect(result).toMatchObject({ status: 'escaped', mvp: null, announcedAt: null });
    expect(result.grants.map(g => [g.userId, g.points])).toEqual([['sam', -3], ['alex', -2], ['kim', 0]]);
    expect(siegeStats('sam').all).toMatchObject({ points: -3, bonus: -3 });
    expect(siegeStats('alex').all.points).toBe(-2);
    // Kim had nothing this month to lose
    expect(siegeStats('kim')?.all?.points ?? 0).toBe(0);
    expect(loadScores(GUILD).users.sam.lifetime.siege).toEqual({ wins: 0, mvps: 0, kaiju: 0 });
    expect(loadState(GUILD).siegeDial).toBe(0.88);
  });

  test('an escape with one fighter costs nothing; an admin end gives and takes nothing', () => {
    recordPlay(GUILD, { game: 'foodfight', actor: { id: 'sam', name: 'Sam' }, target: { kind: 'role', pingUserIds: [] }, outcome: 'hit' }, T);
    let s = spawn('klowns');
    setFighters([['sam', 'Sam', 10]], 30);
    store.finishSiege(GUILD, s.id, 'escaped', T + 50 * MIN, scripted([]));
    expect(now().result.grants.map(g => g.points)).toEqual([0]);
    expect(siegeStats('sam')?.all?.points ?? 0).toBe(0);
    settle(s);

    s = spawn('klowns', { at: T + 60 * MIN });
    setFighters([['sam', 'Sam', 10], ['alex', 'Alex', 10]], 30);
    const before = JSON.stringify(loadScores(GUILD));
    store.finishSiege(GUILD, s.id, 'ended', T + 70 * MIN, scripted([]));
    expect(now().result).toMatchObject({ status: 'ended', grants: [], mvp: null, announcedAt: T + 70 * MIN });
    expect(JSON.stringify(loadScores(GUILD))).toBe(before);
    expect(loadState(GUILD).siegeDial).toBe(1);
  });

  test('titles: Monster Hunter at 10 wins, Legend of the Drive-In at 10 MVPs, +10 each', () => {
    mutateScores(GUILD, (d) => {
      d.users.sam = {
        name: 'Sam', games: {},
        lifetime: { do: {}, got: {}, streak: {}, bestStreak: 0, siege: { wins: 9, mvps: 9, kaiju: 0 } },
        titles: { earned: { 'siege-mvp': T - DAY }, shown: null },
      };
    });
    const s = spawn('klowns');
    setFighters([['sam', 'Sam', 30], ['alex', 'Alex', 10]]);
    // Sam's loot: not silver, the first item; Alex (25%): no loot
    store.finishSiege(GUILD, s.id, 'won', T + 5 * MIN, scripted([0.99, 0, 0.99]));
    // 24 · 0.75 = 18, +5
    expect(now().result.grants[0]).toMatchObject({ points: 23, titles: ['monster-hunter', 'legend'], total: 43 });
    expect(loadScores(GUILD).users.sam.lifetime.siege).toEqual({ wins: 10, mvps: 10, kaiju: 0 });
    expect(siegeStats('sam').all.points).toBe(43);

    // An admin's reset of the siege game starts its counters over; the titles stay earned
    resetScores(GUILD, { game: 'siege', userId: 'sam' });
    const sam = loadScores(GUILD).users.sam;
    expect([sam.games.siege, sam.lifetime.siege]).toEqual([undefined, undefined]);
    expect(Object.keys(sam.titles.earned).sort()).toEqual(['legend', 'monster-hunter', 'siege-mvp']);
  });

  test('paying a siege twice pays once, and hands back the first payout', () => {
    const grants = [{ userId: 'sam', name: 'Sam', points: 10, loss: 0, loot: 'gpie', win: true, mvp: true }];
    const first = applySiegeResult(GUILD, { siegeId: 'abc', grants, now: T });
    const again = applySiegeResult(GUILD, { siegeId: 'abc', grants, now: T + MIN });
    expect(again).toEqual({ grants: first.grants, repeat: true });
    expect(siegeStats('sam').all.points).toBe(20); // 10, and Siege MVP's 10 — once
    expect(loadScores(GUILD).users.sam.glovebox).toEqual({ gpie: 1 });
  });
});

// ── farming, and getting stuck ──────────────────────────────────────────

describe('what one admin and a friend could farm, and what a restart could lock', () => {
  /** A siege `who` win (Sam the MVP), finished at `at`, its results posted */
  function win(who, at, luck = [0.99, 0, 0.99, 0.99, 0.99]) {
    const s = spawn('klowns', { at });
    setFighters(who.map(([id, dmg], i) => [id, NAMES[id] || id, dmg]));
    store.finishSiege(GUILD, s.id, 'won', at + MIN, scripted(luck));
    settle(s);
    return now().result.grants;
  }

  test('alone: the pool share only — no MVP bonus, no loot, no win on the record — and no luck drawn', () => {
    const s = spawn('lizard');
    setFighters([['sam', 'Sam', 50]]);
    const luck = scripted([]);
    store.finishSiege(GUILD, s.id, 'won', T + 5 * MIN, luck);
    expect(now().result.grants).toEqual([expect.objectContaining({ userId: 'sam', points: 24, loot: null, titles: [], total: 24, win: false, mvp: false, kaiju: false, solo: true })]);
    expect(loadScores(GUILD).users.sam.lifetime.siege).toEqual({ wins: 0, mvps: 0, kaiju: 0 });
    expect(loadScores(GUILD).users.sam.glovebox).toBeUndefined();
    const embed = resultsPayload(now(), { kit: createKit(new Map()) }).embeds[0].toJSON();
    expect(embed.description.split('\n')).toEqual([
      '🦖 Beaten by one fighter alone: the pool, but no MVP bonus or loot. Siege titles need company.',
      '',
      '🥇 Sam · `50` damage · `+24`',
    ]);
  });

  test('rewards for 2 sieges a member a day: the third pays nothing and says so; the next UTC day pays again', () => {
    const pair = [['sam', 30], ['alex', 10]];
    const first = win(pair, T);
    const second = win(pair, T + 10 * MIN);
    expect([first[0].total, second[0].total]).toEqual([33, 23]); // 18 + 5, and Siege MVP's 10 the first time
    const third = win(pair, T + 20 * MIN);
    expect(third.map(g => [g.userId, g.points, g.loot, g.total, g.limited])).toEqual([['sam', 0, null, 0, true], ['alex', 0, null, 0, true]]);
    expect(loadScores(GUILD).users.sam.lifetime.siege).toEqual({ wins: 2, mvps: 2, kaiju: 0 });
    expect(siegeStats('sam').all.points).toBe(33 + 23);
    const rows = resultsPayload(now(), { kit: createKit(new Map()) }).embeds[0].toJSON().description.split('\n').slice(2);
    expect(rows).toEqual([
      '🥇 Sam · `30` damage · reward limit reached (2 sieges a day)',
      '🥈 Alex · `10` damage · reward limit reached (2 sieges a day)',
    ]);
    // A new UTC day (04:00 the next morning): paid again
    const next = win(pair, Date.UTC(2026, 10, 10, 4, 0));
    expect(next.map(g => g.limited || false)).toEqual([false, false]);
    expect(loadScores(GUILD).users.sam.lifetime.siege.wins).toBe(3);
  });

  test('the limit holds back rewards, not losses: an escape past it still costs', () => {
    const role = { kind: 'role', pingUserIds: [] };
    for (let i = 0; i < 4; i++) recordPlay(GUILD, { game: 'foodfight', actor: { id: 'sam', name: 'Sam' }, target: role, outcome: 'hit' }, T + i);
    win([['sam', 30], ['alex', 10]], T);
    win([['sam', 30], ['alex', 10]], T + 10 * MIN);
    const s = spawn('klowns', { at: T + 20 * MIN });
    setFighters([['sam', 'Sam', 12], ['alex', 'Alex', 8]], 20);
    store.finishSiege(GUILD, s.id, 'escaped', T + 70 * MIN, scripted([]));
    const sam = now().result.grants.find(g => g.userId === 'sam');
    expect([sam.points, sam.limited]).toEqual([-3, undefined]);
  });

  test('the leaderboard\'s count of sieges won and escaped, per period, once per siege', () => {
    win([['sam', 30], ['alex', 10]], T);
    const s = spawn('klowns', { at: T + 10 * MIN });
    store.finishSiege(GUILD, s.id, 'escaped', T + 60 * MIN, scripted([])); // nobody fought: still counted
    store.finishSiege(GUILD, s.id, 'escaped', T + 61 * MIN, scripted([]));
    settle(s);
    const ended = spawn('klowns', { at: T + 70 * MIN });
    store.finishSiege(GUILD, ended.id, 'ended', T + 71 * MIN, scripted([]));
    expect(loadScores(GUILD).siegeStats).toEqual({ all: { won: 1, escaped: 1 }, y2026: { won: 1, escaped: 1 }, 'm2026-11': { won: 1, escaped: 1 } });
  });

  test('a results claim a restart cut short holds the next start for 2 minutes, then is given up', () => {
    const s = spawn('klowns');
    setFighters([['sam', 'Sam', 40], ['alex', 'Alex', 10]], 0);
    store.finishSiege(GUILD, s.id, 'won', T + 5 * MIN, scripted([0.99, 0, 0.99]));
    store.claimResults(GUILD, s.id, T + 6 * MIN);
    // …the bot dies mid-send. Within the window it may still be sending:
    expect(store.spawnSiege(GUILD, { monster: 'blob', minutes: 30 }, T + 7 * MIN)).toMatchObject({ error: 'results-pending' });
    // Past it, it's given up, never sent again, and the start goes ahead
    const next = store.spawnSiege(GUILD, { monster: 'blob', minutes: 30 }, T + 8 * MIN);
    expect(next.siege?.monster).toBe('blob');
  });

  test('the scheduler\'s side of it: a stale claim is marked given up (restart), never re-sent', () => {
    const s = spawn('klowns');
    store.finishSiege(GUILD, s.id, 'escaped', T + 50 * MIN, scripted([]));
    store.claimResults(GUILD, s.id, T + 50 * MIN);
    expect(store.resultsClaimStale(now(), T + 51 * MIN)).toBe(false);
    expect(store.resultsClaimStale(now(), T + 52 * MIN)).toBe(true);
    store.giveUpResults(GUILD, s.id, 'restart', T + 52 * MIN);
    expect(now().result).toMatchObject({ announcedAt: T + 52 * MIN, unannounced: 'restart', messageId: null });
    expect(store.claimResults(GUILD, s.id, T + 53 * MIN)).toMatchObject({ error: 'already-claimed' });
  });

  test('a live siege whose monster no longer exists is closed — by a start, or closeOrphanSiege — not left blocking', () => {
    const s = spawn('klowns');
    setFighters([['sam', 'Sam', 10]], 30);
    mutate(GUILD, (d) => { d.siege.monster = 'retired-monster'; });
    expect(store.currentSiege(GUILD)).toBeNull();
    expect(store.siegeAttack(GUILD, s.id, { userId: 'sam', name: 'Sam', weapon: 'food', outcome: 'splat' }, T + MIN)).toEqual({ error: 'not-current' });
    expect(store.closeOrphanSiege(GUILD, T + 2 * MIN).siege).toMatchObject({ status: 'ended', result: { grants: [], unannounced: 'unknown-monster' } });
    expect(store.closeOrphanSiege(GUILD, T + 3 * MIN)).toEqual({ error: 'none' });
    // …and a start just goes ahead, closing one itself if it must
    mutate(GUILD, (d) => { d.siege.status = 'live'; d.siege.result = null; });
    expect(store.spawnSiege(GUILD, { monster: 'blob', minutes: 30 }, T + 4 * MIN).siege?.monster).toBe('blob');
  });
});

// ── R6: the monster fights back ─────────────────────────────────────────

describe('the monster fights back (R6): its rules, store-level', () => {
  /** A siege with these fighters (each one attack), the clock at its first action */
  function fight(monster, ids, { minutes = 45 } = {}) {
    const s = spawn(monster, { minutes });
    for (const id of ids) hit(s, id, 'doom', 'smite', T + MIN);
    return s;
  }
  const at = T + 5 * MIN;
  const decide = (s, luck, opts = {}) => store.decideAction(GUILD, s.id, { rescueOn: true, potionOn: true, ...opts }, at, scripted(luck));

  test('nobody has fought yet: no action, the clock moves on; not due before its time, nor with one pending', () => {
    const s = spawn('blob');
    expect(store.decideAction(GUILD, s.id, {}, at - 1, scripted([]))).toEqual({ error: 'not-due' });
    expect(decide(s, [])).toMatchObject({ action: null });
    expect(now().nextActionAt).toBe(at + 5 * MIN);
    hit(s, 'sam', 'doom', 'smite', at + MIN);
    const a = store.decideAction(GUILD, s.id, {}, at + 5 * MIN, scripted([0.9, 0.5]));
    expect(a.action).toMatchObject({ kind: 'roar', victims: [] });
    expect(store.decideAction(GUILD, s.id, {}, at + 10 * MIN, scripted([]))).toEqual({ error: 'not-due' }); // still pending
  });

  test('never the last free fighter; /rescue off: no grab; /potion off or nobody to poison: a roar', () => {
    let s = fight('blob', ['sam']);
    expect(decide(s, [0.1, 0, 0.5]).action).toMatchObject({ kind: 'poison', victims: ['sam'] }); // a grab of the only one: a poison
    store.finishSiege(GUILD, s.id, 'ended', at, scripted([]));
    s = fight('blob', ['sam', 'alex'], {});
    expect(decide(s, [0.1, 0.5], { rescueOn: false }).action).toMatchObject({ kind: 'roar', victims: [] });
    store.finishSiege(GUILD, s.id, 'ended', at, scripted([]));
    s = fight('blob', ['sam', 'alex']);
    expect(decide(s, [0.6, 0.5], { potionOn: false }).action).toMatchObject({ kind: 'roar' });
  });

  test('announced: the window starts then; voided: nothing happens; digested once, however often it\'s asked', () => {
    const s = fight('blob', ['sam', 'alex']);
    const { action } = decide(s, [0.1, 0, 0.5]);
    expect(now().participants[action.victims[0]].caught).toBeNull(); // not before the ping
    store.markAnnounced(GUILD, s.id, action.id, 'm1', at + 20 * 1000);
    const caught = now().participants[action.victims[0]].caught;
    expect(caught).toMatchObject({ at: at + 20 * 1000, until: at + 20 * 1000 + 10 * MIN, actionId: action.id, by: 'monster' });
    expect(store.voidAction(GUILD, s.id, action.id, 'late', at)).toEqual({ error: 'not-pending' });
    recordPlay(GUILD, { game: 'foodfight', actor: { id: action.victims[0], name: 'X' }, target: { kind: 'role', pingUserIds: [] }, outcome: 'hit' }, T);
    const victim = action.victims[0];
    const first = store.digestDue(GUILD, s.id, caught.until);
    // Only the hit's +3 is this month's (a store-level attack scores nothing): −3, not −5
    expect(first.digested).toEqual([{ userId: victim, name: NAMES[victim], points: -3 }]);
    expect(now().participants[victim]).toMatchObject({ out: true, caught: null });
    expect(store.digestDue(GUILD, s.id, caught.until + MIN)).toEqual({ error: 'none' });
    // A pass that died between the two saves and ran again pays the same key once
    const key = `${s.id}:${victim}:${action.id}`;
    expect(applySiegePenalty(GUILD, { key, userId: victim, name: NAMES[victim], loss: 5, now: caught.until })).toEqual({ points: -3, repeat: true });
    expect(siegeStats(victim).all.points).toBe(-3);
  });

  test('an assist: only another member, not held themselves; a grab not yet announced can\'t be freed', () => {
    const s = fight('blob', ['sam', 'alex', 'kim']);
    const { action } = decide(s, [0.1, 0, 0.5]);
    const victim = action.victims[0];
    const other = ['sam', 'alex', 'kim'].find(u => u !== victim);
    const rescue = (actorId, outcome, extra = {}) => store.siegeAssist(GUILD, { game: 'rescue', actor: { id: actorId, name: NAMES[actorId] }, targetId: victim, outcome, ...extra }, at + MIN);
    expect(rescue(other, 'rescued')).toEqual({ error: 'none' }); // pending, not announced: nobody's caught yet
    store.markAnnounced(GUILD, s.id, action.id, 'm1', at);
    expect(store.siegeAssist(GUILD, { game: 'rescue', actor: { id: victim, name: 'x' }, targetId: victim, outcome: 'rescued' }, at + MIN)).toEqual({ error: 'none' });
    expect(rescue(other, 'sacrificed', { holyWater: true }).assist.kind).toBe('freed');
    expect(now().participants[other]).toMatchObject({ frees: 1, caught: null });
  });

  test('random sieges: each rule, the pool scale, and the chance (quick pace)', () => {
    const settings = { siegeFrequency: 'normal', pace: 'quick' };
    const ok = { activity: { recent: { a: T - MIN, b: T - 2 * MIN, c: T - 5 * HOUR } }, siege: null, happening: null };
    expect(store.randomSiegeEligibility(ok, settings, T)).toEqual({ ok: true });
    const reason = (patch, s2 = settings) => store.randomSiegeEligibility({ ...ok, ...patch }, s2, T).reason;
    expect(reason({}, { siegeFrequency: 'off', pace: 'quick' })).toBe('off');
    expect(reason({ siege: { status: 'live' } })).toBe('siege');
    expect(reason({ siege: { status: 'won', result: { announcedAt: null } } })).toBe('results-pending');
    expect(reason({ siege: { status: 'won', finishedAt: T - 19 * HOUR, result: { announcedAt: T } } })).toBe('gap');
    expect(reason({ siege: { status: 'won', finishedAt: T - 20 * HOUR, result: { announcedAt: T } } })).toBeUndefined();
    expect(reason({ happening: { endedAt: null, endsAt: T + MIN } })).toBe('happening');
    expect(reason({ activity: { recent: { a: T - MIN, b: T - 40 * MIN, c: T - HOUR } } })).toBe('too-few-now');
    expect(reason({ activity: { recent: { a: T - MIN, b: T - 2 * MIN, c: T - 25 * HOUR } } })).toBe('too-few-today');
    expect(['rare', 'normal', 'often', 'off'].map(store.randomPoolScale)).toEqual([1, 1, 0.6, 1]);
    // A day of 240 active minutes sees one with chance R / 7 (p = −ln(1 − R/7) / 240)
    for (const [f, perWeek] of [['rare', 1.5], ['normal', 3], ['often', 5]]) {
      expect(1 - (1 - store.randomSiegeChance(f)) ** 240).toBeCloseTo(perWeek / 7, 3);
    }
    expect(store.randomSiegeChance('off')).toBe(0);
  });
});

// ── a play like no other ────────────────────────────────────────────────

describe('a siege attack is the fight, not a game of chance', () => {
  test('no twist fires on it, no status acts on it, no happening bends it — even handed one', () => {
    const role = { kind: 'role', pingUserIds: [] };
    const doubled = [{ kind: 'doublefeature', name: 'Double Feature', mods: HAPPENINGS.doublefeature.mods, endsAt: T + 60 * MIN }];
    mutateScores(GUILD, (d) => {
      d.users.sam = { name: 'Sam', games: {}, effects: { dcut: { at: T - MIN, until: T + DAY } } };
    });
    _setLuck(() => 0); // every twist check would fire
    try {
      const r = recordPlay(GUILD, {
        game: 'siege', action: 'food', actor: { id: 'sam', name: 'Sam' }, target: store.monsterTarget(MONSTERS.klowns),
        outcome: 'splat', happenings: doubled,
      }, T);
      expect([r.actorDelta, r.targetDelta, r.twist, r.statuses, r.happenings]).toEqual([1, null, null, [], []]);
      const sam = loadScores(GUILD).users.sam;
      expect(sam.effects.dcut).toBeDefined();
      expect(sam.lifetime.twists || 0).toBe(0);
      expect(sam.games.siege.all).toMatchObject({ points: 1, streak: 1, counts: { splat: 1 } });

      // The same luck, status and happening on a food fight all act — so the above means something
      const ff = recordPlay(GUILD, { game: 'foodfight', action: 'throw', actor: { id: 'sam', name: 'Sam' }, target: role, outcome: 'hit', happenings: doubled }, T + 1);
      expect(ff.twist).not.toBeNull();
      expect(ff.statuses.map(s => s.key)).toContain('dcut');
      expect(ff.happenings.map(h => h.kind)).toEqual(['doublefeature']);
    } finally {
      _setLuck(null);
    }
  });
});

// ── the card ────────────────────────────────────────────────────────────

describe('the card fits Discord in the worst case', () => {
  // The longest an uploaded emoji can be (`<:es_xxxxxx_ab12:19 digits>`)
  const longest = createKit(new Map(Object.keys(KIT_CODES).map((c, i) => [c, { id: `1${String(i).padStart(18, '0')}`, name: 'es_xxxxxx_ab12' }])));
  const plain = createKit(null);
  // 32 characters that all need escaping: twice as long once escaped
  const longName = (i) => `*_~|${i}`.padEnd(32, '_');

  function worst() {
    active(5000);
    const s = spawn('lizard');
    mutate(GUILD, (d) => {
      d.siege.participants = Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`u${i}`, fighter(longName(i), 99999 - i, T + i)]));
      // R6: a hundred grabbed and a hundred poisoned, all with the longest names
      for (let i = 0; i < 100; i++) d.siege.participants[`u${i}`].caught = { at: T, until: T + 10 * MIN + i, actionId: 'a', by: 'monster' };
      for (let i = 100; i < 200; i++) d.siege.participants[`u${i}`].poisoned = { at: T, until: i % 2 ? null : T + 15 * MIN, actionId: 'a', by: 'monster' };
      d.siege.log = Array.from({ length: SIEGE.logKeep }, (_, i) => ({ at: T, text: `🧪 ${'x'.repeat(400)} ${i}` }));
      d.siege.hp = 1234;
    });
    return s;
  }

  test.each([['the live card', 'live'], ['a frozen win', 'won']])('%s, in plain and the longest custom emoji', (_, status) => {
    const s = worst();
    if (status === 'won') store.finishSiege(GUILD, s.id, 'won', T + 5 * MIN, () => 0.99);
    for (const kit of [plain, longest]) {
      const payload = cardPayload(now(), { kit });
      expect(messageProblems(payload)).toEqual([]);
      const card = payload.embeds[0].toJSON();
      // The title is plain text, whatever the kit
      expect(card.title).not.toMatch(/<:/);
      // R6: who's caught and poisoned, five at most and "…and N more" (only while it's on)
      const caught = card.fields.find(f => f.name === '🪤 Caught');
      if (status === 'live') expect(caught.value.split('\n').at(-1)).toBe('…and 95 more');
      else expect(caught).toBeUndefined();
    }
  });

  test('the results with 300 fighters, every one with loot and titles, fit — and ping at most 20', () => {
    const s = worst();
    store.finishSiege(GUILD, s.id, 'won', T + 5 * MIN, () => 0); // everyone over 5% gets loot: only the top few
    mutate(GUILD, (d) => {
      for (const g of d.siege.result.grants) {
        g.loot = { item: 'silver', overflow: true };
        g.titles = ['monster-hunter', 'siege-mvp', 'legend', 'kaiju-killer'];
      }
    });
    for (const kit of [plain, longest]) {
      const payload = resultsPayload(now(), { kit });
      expect(messageProblems(payload)).toEqual([]);
      expect(payload.allowedMentions.users).toHaveLength(SIEGE.pingMax);
      expect(payload.content.split('\n')[1].match(/<@u\d+>/g)).toHaveLength(SIEGE.pingMax);
    }
  });

  test('a fresh card, line by line (fallback kit)', () => {
    active(30);
    const s = spawn('blob');
    const card = renderSiegeCard(store.siegeView(now()), { kit: plain }).toJSON();
    expect(card).toEqual({
      color: 0xC0392B,
      title: '👹 The Blob is attacking the drive-in!',
      description: [
        `🟢 ${MONSTERS.blob.about}`,
        '🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩 `60/60` HP',
        `Ends <t:${Math.floor(s.endsAt / 1000)}:R>`,
      ].join('\n'),
      fields: [
        { name: '👥 Fighters', value: '`0` fighters', inline: true },
        { name: '🏆 Top fighters', value: 'Nobody yet: be the first!', inline: true },
        { name: '👹 How to fight', value: '`/siege attack weapon:food|doom|potion`\n`/siege status` shows your own damage', inline: false },
      ],
      footer: { text: 'Siege · the card updates about once a minute' },
    });
  });

  test('the bar turns gold under half and orange under a quarter', () => {
    active(30);
    spawn('klowns');
    const bar = (hp) => {
      mutate(GUILD, (d) => { d.siege.hp = hp; });
      return renderSiegeCard(store.siegeView(now()), { kit: plain }).toJSON().description.split('\n')[1];
    };
    expect(bar(31)).toBe('🟩🟩🟩🟩🟩⬜⬜⬜⬜⬜ `31/60` HP');
    expect(bar(30)).toBe('🟨🟨🟨🟨🟨⬜⬜⬜⬜⬜ `30/60` HP');
    expect(bar(15)).toBe('🟧🟧🟧⬜⬜⬜⬜⬜⬜⬜ `15/60` HP');
    expect(bar(0)).toBe('⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ `0/60` HP');
  });
});

// ── 2.74.0: pace, store-level ───────────────────────────────────────────

describe('pace (2.74.0): the rewards, the dial and the HP by the siege\'s own preset', () => {
  const nights = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`2026-11-${String(9 + i).padStart(2, '0')}`, T + i * DAY]));
  /** A finished-looking siege at `key` pace: fighters with their damage and the nights they fought */
  const at = (key, list) => ({
    id: 'p', monster: 'blob', status: 'live', poolScale: 1, t: siegeTimings(SIEGE_PACES[key].span),
    participants: Object.fromEntries(list.map(([id, damage, n], i) => [id, { name: id, damage, attacks: 4, frees: 0, cures: 0, firstAt: T + i, nights: nights(n) }])),
  });

  test('the pool counts fighter-nights from evening on; each share is capped by the preset; the MVP\'s bonus is ×honour', () => {
    // Six fighters, five nights each: 30 fighter-nights. ana did most of it.
    const list = [['ana', 600, 5], ['ben', 30, 5], ['cat', 30, 5], ['dev', 30, 5], ['eve', 30, 5], ['fay', 30, 5]];
    const week = store.planSiegeRewards(at('week', list), 'won', () => 0.99);
    const total = 600 + 5 * 30;
    const pool = Math.min(SIEGE_PACES.week.pool.poolMax, SIEGE_PACES.week.pool.perFighter * 30); // 120
    expect(store.potOf(at('week', list))).toBe(pool);
    expect(week.grants.map(g => g.points)).toEqual([
      Math.min(SIEGE_PACES.week.pool.eachMax, Math.round(pool * 600 / total)) + SIEGE.rewards.mvpBonus * SIEGE_PACES.week.honour,
      ...Array(5).fill(Math.max(SIEGE.rewards.eachMin, Math.round(pool * 30 / total))),
    ]);
    expect(week.grants[0].points).toBe(60 + 15); // 96 of the pot, capped at week's 60, +5 × 3
    // At quick the same fight is 6 fighters, whatever the nights: 48, the share capped at 30, +5
    const quick = store.planSiegeRewards(at('quick', list), 'won', () => 0.99);
    expect(store.potOf(at('quick', list))).toBe(48);
    expect(quick.grants[0].points).toBe(30 + 5);
    // 3 days: 5 a fighter-night, capped at 45, +5 × 2
    const days3 = store.planSiegeRewards(at('days3', list), 'won', () => 0.99);
    expect(store.potOf(at('days3', list))).toBe(150);
    expect(days3.grants[0].points).toBe(45 + 10);
    // A helper who never attacked counts one fighter-night
    expect(store.potOf(at('week', [['ana', 100, 2], ['ben', 0, 0]]))).toBe(Math.max(24, 4 * 3));
  });

  test('the dial steps by the siege\'s preset, and each preset keeps its own (quick\'s is the old siegeDial)', () => {
    expect(store.nextDial(1, 'won', 3, 1, SIEGE_PACES.week)).toBeCloseTo(1.1, 9);
    expect(store.nextDial(1, 'escaped', 3, 0.6, SIEGE_PACES.week)).toBeCloseTo(0.78, 9);
    expect(store.nextDial(1, 'won', 3, 1, SIEGE_PACES.day)).toBeCloseTo(1.08, 9);
    expect(store.nextDial(1, 'won', 3)).toBeCloseTo(SIEGE.dial.win, 9);
    const data = { siegeDial: 1.3, siegeDials: { week: 0.8 } };
    expect([store.dialOf(data), store.dialOf(data, 'quick'), store.dialOf(data, 'week'), store.dialOf(data, 'day')]).toEqual([1.3, 1.3, 0.8, 1]);
    // A week siege finishing moves week's dial alone (a server past its first
    // campaign at week, sized for the 2 who come)
    active(10);
    mutate(GUILD, (d) => { d.siegeParticipation = { week: 0.2 }; });
    const s = spawn('klowns', { minutes: SIEGE_PACES.week.span });
    expect(s.expected).toBe(2);
    mutate(GUILD, (d) => { d.siegeDial = 1.3; });
    for (const [u, k] of [['sam', 0], ['alex', 1]]) store.siegeAttack(GUILD, s.id, { userId: u, name: NAMES[u], weapon: 'doom', outcome: 'smite' }, T + k * MIN);
    mutate(GUILD, (d) => { d.siege.hp = 0; });
    store.finishSiege(GUILD, s.id, 'won', T + 5 * MIN, () => 0.99);
    const after = loadState(GUILD);
    expect(after.siegeDial).toBe(1.3);
    expect(after.siegeDials).toEqual({ week: 1.1 });
  });

  test('the allowance: past tonight\'s attacks the store refuses one and saves nothing (a race past the command\'s own check); the next night (12:00 UTC) has more', () => {
    active(3);
    const s = spawn('klowns', { minutes: SIEGE_PACES.week.span });
    const { allowance } = SIEGE_PACES.week;
    for (let i = 0; i < allowance; i++) {
      const r = store.siegeAttack(GUILD, s.id, { userId: 'sam', name: 'Sam', weapon: 'food', outcome: 'splash' }, T + i * MIN);
      expect(r.hit.attacks).toEqual({ used: i + 1, of: allowance });
    }
    const before = JSON.stringify(loadState(GUILD));
    expect(store.siegeAttack(GUILD, s.id, { userId: 'sam', name: 'Sam', weapon: 'food', outcome: 'splat' }, T + 30 * MIN)).toMatchObject({ error: 'spent' });
    expect(JSON.stringify(loadState(GUILD))).toBe(before);
    expect(store.attacksTonight(now().participants.sam, T + 30 * MIN)).toBe(allowance);
    // 00:00 UTC is the same night; 12:00 UTC a new one
    const midnight = Date.UTC(2026, 10, 10);
    const noon = Date.UTC(2026, 10, 10, 12);
    expect(store.allowanceResetsAt(T)).toBe(noon);
    expect(store.attacksTonight(now().participants.sam, midnight)).toBe(allowance);
    expect(store.siegeAttack(GUILD, s.id, { userId: 'sam', name: 'Sam', weapon: 'food', outcome: 'splat' }, midnight)).toMatchObject({ error: 'spent' });
    expect(store.attacksTonight(now().participants.sam, noon)).toBe(0);
    expect(store.siegeAttack(GUILD, s.id, { userId: 'sam', name: 'Sam', weapon: 'food', outcome: 'splat' }, noon).hit.attacks).toEqual({ used: 1, of: allowance });
    // No allowance at quick: no count kept
    const qg = otherGuild('quick-allowance');
    const q = store.spawnSiege(qg, { monster: 'klowns', minutes: 45, channelId: 'games' }, T);
    const hitQ = store.siegeAttack(qg, q.siege.id, { userId: 'sam', name: 'Sam', weapon: 'food', outcome: 'splat' }, T + MIN);
    expect(hitQ.hit.attacks).toBeNull();
    expect(loadState(qg).siege.participants.sam.nightAttacks).toBeUndefined();
  });

  test('HP: a base of the fighters it expects × nights, then each fighter-night; a week-long siege\'s timings are copied onto it', () => {
    active(10);
    const s = spawn('klowns', { minutes: SIEGE_PACES.week.span });
    const t = SIEGE_PACES.week;
    expect(s.t).toMatchObject({ key: 'week', N: 7, hpBase: 'fighters', base: t.base, growth: t.growth });
    // A server with no campaign behind it expects 35% of its 10: 4 (3.5, rounded)
    expect(s.expected).toBe(4);
    expect(s.hp).toBe(Math.round(t.base * 4 * 7));
    // sam's first attack, then another the same night, then the next night's first
    const first = store.siegeAttack(GUILD, s.id, { userId: 'sam', name: 'Sam', weapon: 'food', outcome: 'splash' }, T + MIN);
    expect(first.hit.joined).toBe(t.growth);
    expect(store.siegeAttack(GUILD, s.id, { userId: 'sam', name: 'Sam', weapon: 'food', outcome: 'splash' }, T + 2 * MIN).hit.joined).toBe(0);
    const next = store.siegeAttack(GUILD, s.id, { userId: 'sam', name: 'Sam', weapon: 'food', outcome: 'splash' }, T + DAY);
    expect([next.hit.joined, next.hit.again]).toEqual([t.growth, true]);
    expect(now().fn).toBe(2);
    expect(now().maxHp).toBe(Math.round(t.base * 4 * 7 + 2 * t.growth));
  });
});

// ── 2.74.0 review: a big server where few fight ─────────────────────────

describe('pace review (2026-11-04): the base counts the fighters a server can expect, and learns them', () => {
  const week = SIEGE_PACES.week;
  /** `n` fighters each make every one of their 8 attacks on each of `nights` nights (a food miss: 3 damage — trying, not winning) */
  function campaignOf(s, n, nights, outcome = 'splash', from = 0) {
    for (let k = 0; k < nights; k++) {
      for (let u = 0; u < n; u++) {
        for (let i = 0; i < week.allowance; i++) {
          store.siegeAttack(GUILD, s.id, { userId: `f${u}`, name: `F${u}`, weapon: 'food', outcome }, T + from + k * DAY + (u * week.allowance + i) * 1000);
        }
      }
    }
  }

  test('A7 60, 8 fighters for 4 nights who tried: the first expects 21, not 60; it learns who comes; once sized right, an escape they tried at eases the dial', () => {
    const { start, first: f, weight: w } = PACE_RULES.participation;
    const learn = (p, k, came) => Math.round((p + k * (came / 60 - p)) * 1e4) / 1e4;
    let at = T;
    const next = () => {
      mutate(GUILD, (d) => { if (d.siege?.result) d.siege.result.announcedAt = at; });
      active(60, at - HOUR);
      return store.spawnSiege(GUILD, { monster: 'klowns', minutes: week.span, channelId: 'games' }, at).siege;
    };
    const escape = (s, n = 8, nights = 4) => {
      campaignOf(s, n, nights, 'splash', s.startedAt - T);
      const fought = now();
      // Under half its HP gone: the old rule ("dealt half") froze the dial for good
      expect((fought.maxHp - fought.hp) / fought.maxHp).toBeLessThan(0.5);
      const done = store.finishSiege(GUILD, s.id, 'escaped', s.endsAt, () => 0.99);
      expect(done.effort).toBe(1);
      at = s.endsAt + 3 * DAY;
      return done;
    };
    active(60);
    const first = store.spawnSiege(GUILD, { monster: 'klowns', minutes: week.span, channelId: 'games' }, T).siege;
    expect([first.a7, first.expected, first.hp]).toEqual([60, 21, Math.round(week.base * 21 * 7)]);
    escape(first);
    // Sized for 21, 8 came: the estimate's error, so the estimate moves and the dial doesn't.
    // The first campaign replaces the starting guess outright (f = 1): 8 of 60
    const p1 = learn(start, f, 8);
    expect(p1).toBe(0.1333);
    expect(loadState(GUILD).siegeParticipation.week).toBe(p1);
    expect(store.dialOf(loadState(GUILD), 'week')).toBe(1);
    const second = next();
    expect(second.expected).toBe(8);
    expect(store.turnoutExplains(second, 'escaped', 8)).toBe(false);
    expect(second.hp).toBe(Math.round(week.base * 8 * 7));
    escape(second);
    // Sized right, and they tried: the dial eases
    expect(store.dialOf(loadState(GUILD), 'week')).toBeCloseTo(week.dial.escape, 9);
    // From then on each campaign moves it `w` of the way: 12 come to one sized for 8
    const third = next();
    expect(third.expected).toBe(8);
    // Had they won, 4 more than expected would explain it; an escape with them doesn't
    expect([store.turnoutExplains(third, 'won', 12), store.turnoutExplains(third, 'escaped', 12)]).toEqual([true, false]);
    escape(third, 12, 1);
    expect(loadState(GUILD).siegeParticipation.week).toBe(learn(p1, w, 12)); // 0.18
    expect(learn(p1, w, 12)).toBe(0.18);
    // …and more came than it expected and it still got away: that's the monster,
    // not the count, so the dial eases again as the estimate rises (turnoutExplains)
    expect(store.dialOf(loadState(GUILD), 'week')).toBeCloseTo(week.dial.escape ** 2, 9);
    // A quick siege on the same server still counts all of A7, as 2.73 did
    expect(store.siegeHp({ a7: 60, expected: 0, fighters: 0, dial: 1, t: { ...SIEGE_PACES.quick, N: 1 } })).toBe(120);
  });

  test('the dial and the learning never pull against the outcome: a turnout miss that explains the end moves only the estimate; one that doesn\'t moves the dial too', () => {
    const { weight: w } = PACE_RULES.participation;
    // A server that has learned 8 of its 60 fight: each campaign expects 8, at dial 1
    const fresh = (suffix) => {
      const g = otherGuild(suffix);
      mutate(g, (d) => {
        for (let i = 0; i < 60; i++) d.activity.recent[`m${i}`] = T - DAY;
        d.siegeParticipation = { week: 0.1333 };
      });
      const s = store.spawnSiege(g, { monster: 'klowns', minutes: week.span, channelId: 'games' }, T).siege;
      expect(s.expected).toBe(8);
      return [g, s];
    };
    /** `n` fighters each make every attack of `nights` nights, then it ends `status` */
    const run = (suffix, n, nights, status) => {
      const [g, s] = fresh(suffix);
      for (let k = 0; k < nights; k++) for (let u = 0; u < n; u++) for (let i = 0; i < week.allowance; i++) {
        store.siegeAttack(g, s.id, { userId: `f${u}`, name: `F${u}`, weapon: 'food', outcome: 'splash' }, T + k * DAY + (u * week.allowance + i) * 1000);
      }
      const done = store.finishSiege(g, s.id, status, s.endsAt, () => 0.99);
      expect(done.effort).toBe(1);
      const after = loadState(g);
      return { dial: store.dialOf(after, 'week'), p: after.siegeParticipation.week, explains: store.turnoutExplains(s, status, n) };
    };
    const learned = (came) => Math.round((0.1333 + w * (came / 60 - 0.1333)) * 1e4) / 1e4;

    // 12 came to a campaign sized for 8 and it still got away: too strong for more than it
    // planned for. The estimate rises AND the dial eases, so the same 12 for 4 nights face
    // less HP next time — with the dial left alone the bigger estimate made it MORE
    const moreLost = run('more-lost', 12, 4, 'escaped');
    expect([moreLost.explains, moreLost.dial, moreLost.p]).toEqual([false, week.dial.escape, learned(12)]);
    expect(store.expectedFighters(60, moreLost.p)).toBe(11);
    const hpFor = (expected, dial) => store.siegeHp({ expected, fighters: 12 * 4, dial, t: { ...week, N: 7 } });
    expect(hpFor(11, moreLost.dial)).toBeLessThan(hpFor(8, 1));
    expect(hpFor(11, 1)).toBeGreaterThan(hpFor(8, 1));
    // 4 came to one sized for 8 and still won: too weak even for half. Both move the other way
    const fewerWon = run('fewer-won', 4, 4, 'won');
    expect([fewerWon.explains, fewerWon.dial, fewerWon.p]).toEqual([false, week.dial.win, learned(4)]);
    // The miss explains the end: only the estimate moves
    const fewerLost = run('fewer-lost', 4, 4, 'escaped');
    expect([fewerLost.explains, fewerLost.dial, fewerLost.p]).toEqual([true, 1, learned(4)]);
    const moreWon = run('more-won', 12, 2, 'won');
    expect([moreWon.explains, moreWon.dial, moreWon.p]).toEqual([true, 1, learned(12)]);
    // Sized right (9 for 8): the dial moves as it always does
    const sized = run('sized-lost', 9, 4, 'escaped');
    expect([sized.explains, sized.dial]).toEqual([false, week.dial.escape]);
  });

  test('the turnout slack leans the players\' way: 4 came to a first campaign sized for 2 (the floor) and won — the turnout explains it, the dial stays; the next, sized on what it learned, moves it; a guess that was right moves it at once', () => {
    active(5);
    const first = spawn('klowns', { minutes: week.span });
    expect(first.expected).toBe(2);
    const fourWin = (s, at) => {
      for (const u of ['sam', 'alex', 'kim', 'lee']) store.siegeAttack(GUILD, s.id, { userId: u, name: u, weapon: 'doom', outcome: 'smite' }, at);
      mutate(GUILD, (d) => { d.siege.hp = 0; });
      store.finishSiege(GUILD, s.id, 'won', at + MIN, () => 0.99);
    };
    // A win is the turnout's past 1 over (with 2 of slack this easy win raised the dial)…
    expect([store.turnoutExplains(first, 'won', 4), store.turnoutExplains(first, 'won', 3)]).toEqual([true, false]);
    // …an escape only past 2 short: on a server where 2 or 3 fight, one fewer still eases it
    const eight = { expected: 8 };
    expect([5, 6, 7].map(n => store.turnoutExplains(eight, 'escaped', n))).toEqual([true, false, false]);
    expect(store.turnoutExplains({ expected: 3 }, 'escaped', 1)).toBe(false);
    expect(store.turnoutExplains({ expected: 20 }, 'escaped', 14)).toBe(true); // 6 short of 20: past 25% of 14
    expect(store.turnoutExplains({ expected: 20 }, 'escaped', 16)).toBe(false);
    expect(store.turnoutExplains({}, 'won', 9)).toBe(false); // no estimate (quick, evening): never
    fourWin(first, T + MIN);
    expect(store.dialOf(loadState(GUILD), 'week')).toBe(1);
    expect(loadState(GUILD).siegeParticipation.week).toBe(0.8);
    // The second expects the 4, and they win it too: now the dial moves
    mutate(GUILD, (d) => { d.siege.result.announcedAt = T + 2 * MIN; });
    const second = store.spawnSiege(GUILD, { monster: 'klowns', minutes: week.span, channelId: 'games' }, T + DAY).siege;
    expect(second.expected).toBe(4);
    fourWin(second, T + DAY + MIN);
    expect(store.dialOf(loadState(GUILD), 'week')).toBeCloseTo(week.dial.win, 9);
    // A7 20: the guess is 7, and 7 come and win. It was right, so its outcome says
    // how hard the monster was: the first campaign moves the dial
    const g = otherGuild('first-right');
    mutate(g, (d) => { for (let i = 0; i < 20; i++) d.activity.recent[`m${i}`] = T - DAY; });
    const right = store.spawnSiege(g, { monster: 'klowns', minutes: week.span, channelId: 'games' }, T).siege;
    expect(right.expected).toBe(7);
    for (let u = 0; u < 7; u++) store.siegeAttack(g, right.id, { userId: `f${u}`, name: `F${u}`, weapon: 'doom', outcome: 'smite' }, T + MIN);
    mutate(g, (d) => { d.siege.hp = 0; });
    store.finishSiege(g, right.id, 'won', T + 2 * MIN, () => 0.99);
    expect(store.dialOf(loadState(g), 'week')).toBeCloseTo(week.dial.win, 9);
    expect(loadState(g).siegeParticipation.week).toBe(0.35);
  });

  test('two who join and walk away from a campaign sized for them: the escape doesn\'t ease the dial (they used under 60% of their attacks)', () => {
    active(5);
    // Past its first campaign at week (which only learns the turnout): 40% of 5 come
    mutate(GUILD, (d) => { d.siegeParticipation = { week: 0.4 }; });
    const s = spawn('klowns', { minutes: week.span });
    expect(s.expected).toBe(2);
    store.siegeAttack(GUILD, s.id, { userId: 'sam', name: 'Sam', weapon: 'food', outcome: 'splat' }, T + MIN);
    store.siegeAttack(GUILD, s.id, { userId: 'alex', name: 'Alex', weapon: 'food', outcome: 'splat' }, T + 2 * MIN);
    const done = store.finishSiege(GUILD, s.id, 'escaped', s.endsAt, () => 0.99);
    expect(store.turnoutExplains(now(), 'escaped', 2)).toBe(false);
    expect(done.effort).toBe(Math.round((2 / (2 * week.allowance)) * 1e4) / 1e4);
    expect(loadState(GUILD).siegeDials.week).toBe(1);
    // Tried: 60% of their attacks, or half its HP taken; neither, and the dial stays
    expect(store.nextDial(1, 'escaped', 2, 0, week, 0.6)).toBeCloseTo(week.dial.escape, 9);
    expect(store.nextDial(1, 'escaped', 2, 0.5, week, 0)).toBeCloseTo(week.dial.escape, 9);
    expect(store.nextDial(1, 'escaped', 2, 0.49, week, 0.59)).toBe(1);
    // At quick, damage decides, as it always did
    expect(store.nextDial(1, 'escaped', 2, 0.5, SIEGE_PACES.quick, 0)).toBeCloseTo(SIEGE.dial.escape, 9);
    expect(store.nextDial(1, 'escaped', 2, 0.49, SIEGE_PACES.quick, 1)).toBe(1);
  });

  test('evening: an escape its fighters took most of eases the dial, though a 4-hour siege leaves most of a night\'s 20 attacks unused', () => {
    const evening = SIEGE_PACES.evening;
    active(10);
    const s = spawn('klowns', { minutes: evening.span });
    // Three fighters, 6 food hits each in turn: 18 of the 60 attacks their night allowed
    for (let round = 0; round < 6; round++) {
      for (const [k, u] of ['sam', 'alex', 'kim'].entries()) hit(s, u, 'food', 'splat', T + MIN + (round * 3 + k) * 30_000);
    }
    const fought = now();
    expect(fought.hp).toBeGreaterThan(0);
    const dealt = (fought.maxHp - fought.hp) / fought.maxHp;
    expect(dealt).toBeGreaterThanOrEqual(SIEGE.dialEscapeMinDamage);
    const done = store.finishSiege(GUILD, s.id, 'escaped', s.endsAt, () => 0.99);
    expect(done.effort).toBe(0.3);
    // They plainly tried: the dial eases. On effort alone it never did at evening pace,
    // and its wins kept raising it (1.0 to 1.3 in a month of the balance sim)
    expect(store.dialOf(loadState(GUILD), 'evening')).toBeCloseTo(evening.dial.escape, 9);
  });

  test('participation counts attackers, of the members active as it ends — a helper who only freed someone isn\'t one', () => {
    active(10);
    const s = spawn('klowns', { minutes: week.span });
    for (const u of ['sam', 'alex']) store.siegeAttack(GUILD, s.id, { userId: u, name: u, weapon: 'food', outcome: 'splash' }, T + MIN);
    // kim only helps (a free's contribution), as a /rescue would
    mutate(GUILD, (d) => { d.siege.participants.kim = { name: 'kim', damage: 0, attacks: 0, frees: 1, cures: 0, firstAt: T, lastAt: T }; });
    expect(store.fightersOf(now()).length).toBe(3);
    store.finishSiege(GUILD, s.id, 'escaped', s.endsAt, () => 0.99);
    // Its first campaign: what it saw replaces the guess (2 of 10)
    const { start, first } = PACE_RULES.participation;
    expect(loadState(GUILD).siegeParticipation.week).toBe(Math.round((start + first * (2 / 10 - start)) * 1e4) / 1e4);
    expect(loadState(GUILD).siegeParticipation.week).toBe(0.2);
  });

  test('a new server\'s A7 grows through its first campaign: participation is of the members active as it ends', () => {
    active(3);
    const s = spawn('klowns', { minutes: week.span });
    expect([s.a7, s.expected]).toEqual([3, 2]);
    for (const u of ['sam', 'alex']) store.siegeAttack(GUILD, s.id, { userId: u, name: u, weapon: 'food', outcome: 'splash' }, T + MIN);
    // Seven more find the bot that week (the first three's week has lapsed by its end)
    mutate(GUILD, (d) => { for (let i = 0; i < 7; i++) d.activity.recent[`new${i}`] = s.endsAt - DAY; });
    expect(store.activeMembers(loadState(GUILD), s.endsAt)).toBe(7);
    store.finishSiege(GUILD, s.id, 'escaped', s.endsAt, () => 0.99);
    // 2 of the 7 active as it ends, not 2 of the 3 there were at the start
    expect(loadState(GUILD).siegeParticipation.week).toBe(Math.round((2 / 7) * 1e4) / 1e4);
  });

  test('expected fighters: at least 2 (or A7, if fewer), at most A7; a file with no participation reads the start', () => {
    expect([0, 1, 2, 3, 5, 10, 60].map(a7 => store.expectedFighters(a7, 0.35))).toEqual([0, 1, 2, 2, 2, 4, 21]);
    expect(store.expectedFighters(10, 1)).toBe(10);
    expect(store.participationOf({}, 'week')).toBe(0.35);
    expect(store.participationOf({ siegeParticipation: { day: 0.8 } }, 'week')).toBe(0.35);
    expect(store.participationOf({ siegeParticipation: { week: 0.8 } }, 'week')).toBe(0.8);
  });
});

describe('pace review (2026-11-04): the monster only takes fighters who are here', () => {
  test('a fighter who last fought two nights ago is never picked; with nobody here and free, it roars', () => {
    active(10);
    const s = spawn('klowns', { minutes: SIEGE_PACES.week.span });
    const attack = (userId, at) => store.siegeAttack(GUILD, s.id, { userId, name: userId, weapon: 'food', outcome: 'splash' }, at);
    attack('dev', T);
    const wed = T + 2 * DAY;
    attack('sam', wed);
    attack('alex', wed + MIN);
    expect(store.targetsOf(now(), wed + 2 * MIN).map(f => f.userId).sort()).toEqual(['alex', 'sam']);
    expect(store.freeFighters(now(), wed + 2 * MIN).map(f => f.userId)).toContain('dev');
    // Due, a grab, and the victim draw at the very end of the list (where dev would be)
    mutate(GUILD, (d) => { d.siege.nextActionBusy = 0; });
    const grab = store.decideAction(GUILD, s.id, {}, wed + 2 * MIN, scripted([0.1, 0.999, 0]));
    expect(grab.action.kind).toBe('grab');
    expect(['sam', 'alex']).toContain(grab.action.victims[0]);
    store.markAnnounced(GUILD, s.id, grab.action.id, 'm1', wed + 2 * MIN);
    // The other one wanders off for 40 minutes; the grabbed one is held: nobody here is free
    const other = grab.action.victims[0] === 'sam' ? 'alex' : 'sam';
    mutate(GUILD, (d) => { d.siege.participants[other].lastAt = wed - 40 * MIN; d.siege.nextActionBusy = 0; });
    const roar = store.decideAction(GUILD, s.id, {}, wed + 5 * MIN, scripted([0.1, 0, 0]));
    expect(roar.action).toMatchObject({ kind: 'roar', victims: [] });
    // At quick, every free fighter, as before
    const qg = otherGuild('quick-targets');
    const q = store.spawnSiege(qg, { monster: 'klowns', minutes: 45, channelId: 'games' }, T).siege;
    store.siegeAttack(qg, q.id, { userId: 'sam', name: 'Sam', weapon: 'food', outcome: 'splash' }, T);
    expect(store.targetsOf(loadState(qg).siege, T + 40 * MIN).map(f => f.userId)).toEqual(['sam']);
  });
});

// ── 2.74.0 review #2 (2026-11-06) ───────────────────────────────────────

describe('pace review #2 (2026-11-06): the rules behind the findings', () => {
  const week = SIEGE_PACES.week;
  const at = (d, h, m = 0) => Date.UTC(2026, 10, d, h, m);
  const played = (when) => mutate(GUILD, (d) => { d.activity.at = when; });
  /** Claim and post night `night`'s report at `when` */
  function report(s, when) {
    played(when);
    const night = store.reportDue(now(), loadState(GUILD), when);
    expect(night).toBeTruthy();
    const c = store.claimReport(GUILD, s.id, night, when);
    expect(c.error).toBeUndefined();
    store.recordReport(GUILD, s.id, night, { messageId: `r-${night}` });
    return c.report;
  }

  test('#3 a pass with an older clock never claims an older night than one already claimed, and reportedThrough never moves back', () => {
    active(5);
    const s = spawn('klowns', { minutes: week.span });
    expect(report(s, at(10, 13)).night).toBe('2026-11-10');
    expect(report(s, at(11, 13)).night).toBe('2026-11-11');
    expect(now().reportedThrough).toBe('2026-11-10');
    // A pass that read its clock at Wednesday 11:59: night '2026-11-10' again — refused
    expect(store.reportDue(now(), loadState(GUILD), at(11, 11, 59))).toBeNull();
    expect(store.claimReport(GUILD, s.id, '2026-11-10', at(11, 11, 59))).toEqual({ error: 'not-due' });
    // Recorded late, out of order: reportedThrough stays where it got to
    mutate(GUILD, (d) => { d.siege.report = { ...d.siege.report, night: '2026-11-10', last: '2026-11-09', messageId: null }; });
    store.recordReport(GUILD, s.id, '2026-11-10', { messageId: 'late' });
    expect(now().reportedThrough).toBe('2026-11-10');
    mutate(GUILD, (d) => { d.siege.report = { night: '2026-11-10', last: '2026-11-09', claimedAt: null, messageId: null, unannounced: null, tries: PACE_RULES.reportTries - 1 }; });
    store.releaseReport(GUILD, s.id, '2026-11-10');
    expect(now().reportedThrough).toBe('2026-11-10');
  });

  test('#4 a week campaign started 07:00 UTC: its hours to Tuesday 12:00 are night 1 — one allowance, one fighter-night — and it has seven windows in all', () => {
    active(5);
    const s = spawn('klowns', { minutes: week.span, at: at(9, 7) });
    expect(s.endsAt).toBe(at(16, 12));
    const attack = (when, outcome = 'splash') => store.siegeAttack(GUILD, s.id, { userId: 'sam', name: 'Sam', weapon: 'food', outcome }, when);
    for (let i = 0; i < week.allowance; i++) expect(attack(at(9, 8, i)).hit.attacks.used).toBe(i + 1);
    // Before 12:00 Monday too it's all one night: a 9th is refused
    expect(attack(at(9, 11))).toMatchObject({ error: 'spent' });
    // Monday 12:00 comes 5 hours in: not one of its nights, so no fresh 8
    expect(store.siegeNight(now(), at(9, 12, 30))).toBe(store.siegeNight(now(), at(9, 8)));
    expect(store.attacksTonight(now().participants.sam, at(9, 12, 30), now())).toBe(week.allowance);
    expect(attack(at(9, 12, 30))).toMatchObject({ error: 'spent' });
    // When the next 8 come: Tuesday 12:00, its first counted boundary (12:00 Monday without the siege)
    expect(store.allowanceResetsAt(at(9, 9), now())).toBe(at(10, 12));
    expect(store.allowanceResetsAt(at(9, 9))).toBe(at(9, 12));
    expect([Object.keys(now().participants.sam.nights), now().fn]).toEqual([['2026-11-09'], 1]);
    expect(attack(at(10, 12, 30)).hit).toMatchObject({ attacks: { used: 1, of: week.allowance }, again: true });
    expect(now().fn).toBe(2);
    // Seven nights, seven windows, from its start to its end
    const keys = new Set();
    for (let t = s.startedAt; t < s.endsAt; t += 15 * MIN) keys.add(store.siegeNight(now(), t));
    expect(keys.size).toBe(7);
    // A day siege isn't folded: its 12:00 report opens a fresh night (and says so)
    const dg = otherGuild('day-night');
    const d = store.spawnSiege(dg, { monster: 'klowns', minutes: 1440, channelId: 'games' }, at(9, 8)).siege;
    expect([store.siegeNight(d, at(9, 9)), store.siegeNight(d, at(9, 12, 30))]).toEqual(['2026-11-08', '2026-11-09']);
  });

  test('#1b/#2 a digest nobody saw is kept only while a report is still to come — tonight\'s owed, or a counted boundary before the end; else it\'s told', () => {
    active(5);
    const s = spawn('klowns', { minutes: week.span });
    for (const u of ['sam', 'alex']) store.siegeAttack(GUILD, s.id, { userId: u, name: u, weapon: 'food', outcome: 'splash' }, T);
    const grabUntil = (until) => mutate(GUILD, (d) => { d.siege.participants.sam.caught = { at: until - week.freeMinutes * MIN, until, actionId: `a${until}`, by: 'monster' }; d.siege.participants.sam.out = false; d.siege.participants.sam.outUntil = null; });
    // Wednesday 21:00: Thursday's boundary is still to come — kept, unpinged
    grabUntil(at(11, 21));
    expect(store.digestDue(GUILD, s.id, at(11, 21))).toMatchObject({ tell: false });
    expect(now().unreported.map(d => d.userId)).toEqual(['sam']);
    mutate(GUILD, (d) => { d.siege.unreported = []; });
    // Sunday 13:00, nobody's played since 12:00: no boundary is left before the end, but
    // that night's report is still owed (it posts by 00:00) and will carry it
    played(at(15, 11));
    grabUntil(at(15, 13));
    expect(store.reportToCome(now(), at(15, 13))).toBe(true);
    expect(store.digestDue(GUILD, s.id, at(15, 13))).toMatchObject({ tell: false });
    const sunday = report(s, at(15, 14));
    expect(sunday.digested.map(d => d.userId)).toEqual(['sam']);
    expect(now().unreported).toEqual([]);
    // Sunday 21:00, the last night, its report out: Monday 12:00 is its end — told at once
    grabUntil(at(15, 21));
    expect(store.reportToCome(now(), at(15, 21))).toBe(false);
    expect(store.digestDue(GUILD, s.id, at(15, 21))).toMatchObject({ tell: true });
    expect(now().unreported).toEqual([]);
    // A day siege from 08:00 reports at 12:00 the same day (4 hours on): from 13:00 nothing's left once it's out
    const dg = otherGuild('day-report');
    const d = store.spawnSiege(dg, { monster: 'klowns', minutes: 1440, channelId: 'games' }, at(9, 8)).siege;
    expect(store.firstReportAt(d)).toBe(at(9, 12));
    expect(store.reportToCome(d, at(9, 10))).toBe(true);
    mutate(dg, (x) => { x.siege.hp = 1; x.activity.at = at(9, 12, 30); });
    expect(store.reportDue(loadState(dg).siege, loadState(dg), at(9, 12, 31))).toBe('2026-11-09');
    store.claimReport(dg, d.id, '2026-11-09', at(9, 12, 31));
    expect(store.reportToCome(loadState(dg).siege, at(9, 13))).toBe(false);
    // …and from 11:00 exactly (an hour before), still; from 11:01 (or 11:30) there's no report at all
    for (const [h, m, want] of [[11, 0, at(9, 12)], [11, 1, null], [11, 30, null], [12, 0, null], [18, 0, at(10, 12)]]) {
      const g = otherGuild(`day-${h}-${m}`);
      expect(store.firstReportAt(store.spawnSiege(g, { monster: 'klowns', minutes: 1440, channelId: 'games' }, at(9, h, m)).siege)).toBe(want);
    }
    // A week or 3 days keeps its 6 hours: an 07:00 start's first report closes Tuesday's night
    expect(store.firstReportAt(store.spawnSiege(otherGuild('week-0700'), { monster: 'klowns', minutes: week.span, channelId: 'games' }, at(9, 7)).siege)).toBe(at(10, 12));
  });

  test('#1a the results ping every digest no report reached, within 20: the best fighters give way to them', async () => {
    const { pingList } = await import('../src/utils/siegeCard.js');
    const ids = Array.from({ length: 30 }, (_, i) => `u${i}`);
    expect(pingList(ids.slice(0, 5), ['u2'])).toEqual(ids.slice(0, 5));
    expect(pingList(ids, [])).toEqual(ids.slice(0, 20));
    // u19 and u25 untold: u25 takes the last place, u18 gives way (u19 is in it anyway)
    const out = pingList(ids, ['u19', 'u25']);
    expect(out).toHaveLength(20);
    expect(out).toEqual([...ids.slice(0, 18), 'u19', 'u25']);
    // Someone untold who isn't a fighter any more (a defensive case): after the fighters
    expect(pingList(['a', 'b'], ['z'])).toEqual(['a', 'b', 'z']);
  });

  test('#6 at a pot pace a win past the reward limit pays what its attacks would have scored (never below 0); quick\'s grants carry no `own`', () => {
    const pair = [['sam', 30], ['alex', 10]];
    for (const at2 of [T, T + 10 * MIN]) {
      const q = spawn('klowns', { at: at2 });
      setFighters(pair.map(([id, dmg]) => [id, NAMES[id], dmg]));
      store.finishSiege(GUILD, q.id, 'won', at2 + MIN, scripted([0.99, 0, 0.99, 0.99, 0.99]));
      expect(now().result.grants.every(g => !('own' in g))).toBe(true);
      settle(q);
    }
    const s = spawn('klowns', { minutes: SIEGE_PACES.day.span, at: T + 20 * MIN });
    // As /siege attack does: the attack, recordPlay with pot, then what it would have scored kept
    const attack = (userId, outcome, when) => {
      expect(store.siegeAttack(GUILD, s.id, { userId, name: NAMES[userId], weapon: 'doom', outcome }, when).error).toBeUndefined();
      const r = recordPlay(GUILD, { game: 'siege', action: 'doom', actor: { id: userId, name: NAMES[userId] }, target: store.monsterTarget(MONSTERS.klowns), outcome, settings: { dailyScoredPlays: SIEGE.scoredPerDay, twists: false }, pot: true }, when);
      expect(r.actorDelta).toBe(0);
      store.notePotPoints(GUILD, s.id, userId, r.potPoints);
      return r.potPoints;
    };
    const samOwn = [attack('sam', 'smite', T + 21 * MIN), attack('sam', 'smite', T + 22 * MIN), attack('sam', 'spooked', T + 23 * MIN)].reduce((a, b) => a + b, 0);
    const alexOwn = attack('alex', 'spooked', T + 21 * MIN);
    expect([samOwn, alexOwn]).toEqual([2 + 2 - 2, -2]);
    expect([now().participants.sam.own, now().participants.alex.own]).toEqual([2, -2]);
    const before = siegeStats('sam').all.points;
    mutate(GUILD, (d) => { d.siege.hp = 0; });
    store.finishSiege(GUILD, s.id, 'won', T + 30 * MIN, () => 0.99);
    const grants = now().result.grants;
    expect(grants.map(g => [g.userId, g.limited, g.points, g.total, g.win, g.loot])).toEqual([['sam', true, 2, 2, false, null], ['alex', true, 0, 0, false, null]]);
    expect(siegeStats('sam').all.points).toBe(before + 2);
    const rows = resultsPayload(now(), { kit: createKit(new Map()) }).embeds[0].toJSON().description.split('\n').slice(2);
    expect(rows[0]).toMatch(/^🥇 Sam · `\d+` damage · `\+2` · reward limit reached \(2 sieges a day\): just what the attacks scored$/);
    expect(rows[1]).toMatch(/^🥈 Alex · `\d+` damage · reward limit reached \(2 sieges a day\)$/);
  });
});

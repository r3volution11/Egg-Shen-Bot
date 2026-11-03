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
import { SIEGE, RANDOM_PRIZE_ITEMS } from '../src/data/gameRewards.js';
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

  test('random sieges: each rule, the pool scale, and the chance', () => {
    const settings = { siegeFrequency: 'normal' };
    const ok = { activity: { recent: { a: T - MIN, b: T - 2 * MIN, c: T - 5 * HOUR } }, siege: null, happening: null };
    expect(store.randomSiegeEligibility(ok, settings, T)).toEqual({ ok: true });
    const reason = (patch, s2 = settings) => store.randomSiegeEligibility({ ...ok, ...patch }, s2, T).reason;
    expect(reason({}, { siegeFrequency: 'off' })).toBe('off');
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

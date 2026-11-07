/**
 * Happenings' state (src/utils/happeningStore.js): what's active (by the
 * clock, never by whether the scheduler got round to ending it), activity
 * stamps, starting and ending, and every rule a random spawn has to pass —
 * including how often one starts over a simulated day, measured against the
 * formula in spawnChance().
 *
 * Run with: npm test -- tests/happening-store.test.js
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import {
  activeHappenings, noteActivity, recentPlayers, startHappening, endHappening, recordHappeningMessage,
  claimAnnouncement, markUnannounced, maybeSpawn, loadState, mutate, spawnChance, spawnEligibility, moonAge, isRealFullMoon,
  ACTIVE_MINUTES_PER_DAY, _happeningsDir,
} from '../src/utils/happeningStore.js';
import { HAPPENINGS, CALENDAR_HAPPENINGS, HAPPENING_RULES } from '../src/data/gameHappenings.js';
import { getGameSettings } from '../src/utils/gameScores.js';
import { LUCK_OFF, luck as defaultLuck } from '../src/utils/gameLuck.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
// A Monday in November 2026: no calendar happening, and no full moon
// (the 2026-11-24 one is weeks away)
const PLAIN = Date.UTC(2026, 10, 9, 20, 0);
// These are quick-pace happenings, as they were before 2.74 (the paces: tests/happening-pace.test.js)
const settings = (games = {}) => getGameSettings({ games: { pace: 'quick', ...games } });
const NORMAL = settings();

let n = 0;
let guild;
const fileOf = (g) => path.join(_happeningsDir, `${g}.json`);

beforeEach(() => {
  guild = `hs-${process.pid}-${++n}`;
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  // Only this test's files: the directory is shared with other suites in the worker
  if (fs.existsSync(_happeningsDir)) {
    for (const f of fs.readdirSync(_happeningsDir)) if (f.startsWith(`${guild}.json`)) fs.unlinkSync(path.join(_happeningsDir, f));
  }
});

/** `count` members played in `channel` at `at` */
function players(count, at, channel = 'games') {
  for (let i = 0; i < count; i++) noteActivity(guild, { channelId: channel, userId: `p${i}` }, at);
}

/** A luck source that hands out these values in turn (then repeats the last) */
const seq = (...values) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
};

/** A seeded PRNG (mulberry32): the same draws every run */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('activeHappenings', () => {
  test('nothing on a plain day', () => {
    expect(activeHappenings(guild, PLAIN)).toEqual([]);
  });

  test('a started one is active until its endsAt, checked by the clock — nobody has to end it', () => {
    const { happening } = startHappening(guild, 'fullmoon', { source: 'admin', startedBy: 'admin' }, PLAIN);
    expect(happening.endsAt).toBe(PLAIN + 60 * MIN);
    const full = HAPPENINGS.fullmoon;
    expect(activeHappenings(guild, PLAIN + 59 * MIN)).toEqual([{
      kind: 'fullmoon', name: full.name, emoji: full.emoji, tag: full.tag, about: full.about, mods: full.mods,
      endsAt: PLAIN + 60 * MIN, calendar: false,
    }]);
    expect(activeHappenings(guild, PLAIN + 60 * MIN)).toEqual([]);
    // Still not ended in the file: the time alone stopped it
    expect(loadState(guild).happening.endedAt).toBeNull();
  });

  test('one ended early is over at once', () => {
    const { happening } = startHappening(guild, 'fog', {}, PLAIN);
    endHappening(guild, happening.id, PLAIN + 5 * MIN);
    expect(activeHappenings(guild, PLAIN + 6 * MIN)).toEqual([]);
  });

  test('Halloween and Friday the 13th come from the date, all day, alongside a random one', () => {
    const halloween = Date.UTC(2026, 9, 31, 23, 59);
    expect(activeHappenings(guild, halloween)).toEqual([{
      kind: 'halloween', ...pickShown(CALENDAR_HAPPENINGS.halloween), endsAt: null, calendar: true,
    }]);
    expect(activeHappenings(guild, Date.UTC(2026, 10, 1, 0, 0))).toEqual([]);
    // 2026-02-13 is a Friday; 2026-08-13 a Thursday
    expect(activeHappenings(guild, Date.UTC(2026, 1, 13, 0, 0)).map(h => h.kind)).toEqual(['friday13']);
    expect(activeHappenings(guild, Date.UTC(2026, 7, 13, 12, 0))).toEqual([]);
    startHappening(guild, 'intermission', {}, halloween - 10 * MIN);
    expect(activeHappenings(guild, halloween).map(h => h.kind)).toEqual(['intermission', 'halloween']);
  });

  test('switched off in the settings, nothing is active — calendar ones included', () => {
    startHappening(guild, 'fog', {}, Date.UTC(2026, 9, 31, 20));
    expect(activeHappenings(guild, Date.UTC(2026, 9, 31, 20, 5), settings({ happenings: false }))).toEqual([]);
    expect(activeHappenings(guild, Date.UTC(2026, 9, 31, 20, 5), NORMAL)).toHaveLength(2);
  });

  test('a damaged file never throws: calendar only, or the .bak if there is one', () => {
    const halloween = Date.UTC(2026, 9, 31, 20);
    fs.mkdirSync(_happeningsDir, { recursive: true });
    fs.writeFileSync(fileOf(guild), '{"happening": {"kind": "fullm');
    expect(activeHappenings(guild, halloween).map(h => h.kind)).toEqual(['halloween']);

    // With a good .bak, the previous save is recovered
    startHappening(guild, 'fog', {}, halloween); // first save: no .bak yet
    noteActivity(guild, { channelId: 'c', userId: 'u' }, halloween); // second save: .bak holds the fog
    fs.writeFileSync(fileOf(guild), 'not json');
    expect(activeHappenings(guild, halloween + MIN).map(h => h.kind)).toEqual(['fog', 'halloween']);
  });
});

const pickShown = (def) => ({ name: def.name, emoji: def.emoji, tag: def.tag, about: def.about, mods: def.mods });

describe('activity', () => {
  test('a member\'s stamp is written at most once a minute, unless the channel changes', () => {
    expect(noteActivity(guild, { channelId: 'games', userId: 'sam' }, PLAIN)).toBe(true);
    expect(noteActivity(guild, { channelId: 'games', userId: 'sam' }, PLAIN + 59_999)).toBe(false);
    expect(loadState(guild).activity).toEqual({ channelId: 'games', at: PLAIN, recent: { sam: PLAIN } });
    // Another member is their own stamp
    expect(noteActivity(guild, { channelId: 'games', userId: 'alex' }, PLAIN + 1000)).toBe(true);
    // A new channel is worth writing at once: it's where an announcement may go
    expect(noteActivity(guild, { channelId: 'lobby', userId: 'sam' }, PLAIN + 2000)).toBe(true);
    expect(loadState(guild).activity).toEqual({ channelId: 'lobby', at: PLAIN + 2000, recent: { sam: PLAIN + 2000, alex: PLAIN + 1000 } });
    expect(noteActivity(guild, { channelId: 'lobby', userId: 'sam' }, PLAIN + 2000 + MIN)).toBe(true);
  });

  test('stamps over a week old are pruned on the next write', () => {
    noteActivity(guild, { channelId: 'games', userId: 'old' }, PLAIN);
    noteActivity(guild, { channelId: 'games', userId: 'week' }, PLAIN + MIN);
    noteActivity(guild, { channelId: 'games', userId: 'new' }, PLAIN + 7 * DAY + 30_000);
    expect(Object.keys(loadState(guild).activity.recent).sort()).toEqual(['new', 'week']);
  });

  test('recentPlayers counts distinct members inside the window', () => {
    noteActivity(guild, { channelId: 'games', userId: 'a' }, PLAIN);
    noteActivity(guild, { channelId: 'games', userId: 'b' }, PLAIN + 10 * MIN);
    noteActivity(guild, { channelId: 'games', userId: 'a' }, PLAIN + 20 * MIN);
    expect(recentPlayers(guild, 30, PLAIN + 20 * MIN)).toBe(2);
    expect(recentPlayers(guild, 30, PLAIN + 40 * MIN + 1)).toBe(1); // b's stamp is 30 min old
    expect(recentPlayers(guild, 30, PLAIN + 51 * MIN)).toBe(0);
    expect(recentPlayers('no-such-guild', 30, PLAIN)).toBe(0);
  });
});

describe('starting and ending', () => {
  test('one at a time; an unknown kind is refused (inherited names too)', () => {
    for (const kind of ['nope', 'toString', '__proto__', 'constructor', undefined]) {
      expect(startHappening(guild, kind, {}, PLAIN)).toEqual({ error: 'unknown-kind' });
    }
    const first = startHappening(guild, 'fog', { source: 'admin', startedBy: 'admin' }, PLAIN);
    expect(first.happening).toMatchObject({ kind: 'fog', source: 'admin', startedBy: 'admin', startedAt: PLAIN, endsAt: PLAIN + 45 * MIN, messageId: null, endedAt: null });
    const second = startHappening(guild, 'sunrise', {}, PLAIN + MIN);
    expect(second.error).toBe('in-progress');
    expect(second.happening.id).toBe(first.happening.id);
    // Once it's run out (even unended), the next can start; the old one goes to history at its endsAt
    const third = startHappening(guild, 'sunrise', {}, PLAIN + 45 * MIN);
    expect(third.happening.kind).toBe('sunrise');
    expect(loadState(guild).history).toEqual([{ kind: 'fog', source: 'admin', startedAt: PLAIN, endedAt: PLAIN + 45 * MIN }]);
    expect(loadState(guild).spawned).toEqual({ day: '2026-11-09', count: 2, week: '2026-11-09', weekCount: 2 });
  });

  test('endHappening is keyed by id and only ends once; the gap counts from when it stopped', () => {
    const { happening } = startHappening(guild, 'fullmoon', {}, PLAIN);
    expect(endHappening(guild, 'someone-else', PLAIN + MIN)).toEqual({ error: 'not-current' });
    const ended = endHappening(guild, happening.id, PLAIN + 10 * MIN);
    expect(ended.ended).toBe(true);
    expect(ended.happening.endedAt).toBe(PLAIN + 10 * MIN);
    expect(endHappening(guild, happening.id, PLAIN + 20 * MIN).error).toBe('already-ended');
    expect(loadState(guild).lastEndedAt).toBe(PLAIN + 10 * MIN);
    expect(loadState(guild).history).toHaveLength(1);

    // Ended late by a slow scheduler: it stopped at its endsAt, not when noticed
    const { happening: late } = startHappening(guild, 'fog', {}, PLAIN + HOUR);
    endHappening(guild, late.id, PLAIN + 5 * HOUR);
    expect(loadState(guild).lastEndedAt).toBe(PLAIN + HOUR + 45 * MIN);
  });

  test('the history keeps the last 20', () => {
    for (let i = 0; i < 25; i++) {
      const { happening } = startHappening(guild, 'fog', {}, PLAIN + i * HOUR);
      endHappening(guild, happening.id, PLAIN + i * HOUR + MIN);
    }
    const { history } = loadState(guild);
    expect(history).toHaveLength(20);
    expect(history[19].startedAt).toBe(PLAIN + 24 * HOUR);
  });

  test('the message id is recorded against its own happening, never a newer one', () => {
    const { happening: old } = startHappening(guild, 'fog', {}, PLAIN);
    endHappening(guild, old.id, PLAIN + MIN);
    const { happening: now } = startHappening(guild, 'sunrise', {}, PLAIN + 2 * MIN);
    expect(recordHappeningMessage(guild, old.id, 'msg-old')).toEqual({ error: 'not-current' });
    expect(loadState(guild).happening).toMatchObject({ id: now.id, messageId: null });
    recordHappeningMessage(guild, now.id, 'msg-new');
    expect(loadState(guild).happening).toMatchObject({ id: now.id, messageId: 'msg-new' });
  });

  test('an announcement can be claimed once; an ended or unannounced one not at all', () => {
    const { happening } = startHappening(guild, 'fog', {}, PLAIN);
    expect(claimAnnouncement(guild, happening.id, 'games', PLAIN).happening).toMatchObject({ claimedAt: PLAIN, channelId: 'games' });
    expect(claimAnnouncement(guild, happening.id, 'games', PLAIN).error).toBe('already-claimed');

    const { happening: other } = startHappening(guild, 'sunrise', {}, PLAIN + HOUR);
    markUnannounced(guild, other.id, 'no-channel');
    expect(claimAnnouncement(guild, other.id, 'games', PLAIN + HOUR).error).toBe('already-claimed');
    endHappening(guild, other.id, PLAIN + HOUR + MIN);
    expect(claimAnnouncement(guild, other.id, 'games', PLAIN + HOUR + MIN).error).toBe('ended');
  });
});

describe('the real moon', () => {
  // Total lunar eclipses happen only at full moon; total solar eclipses only at new moon
  test.each([
    ['2024-01-25T17:54Z'], ['2025-03-14T06:55Z'], ['2025-09-07T18:09Z'], ['2026-03-03T11:38Z'], ['2026-11-24T14:53Z'],
  ])('full on %s', (when) => {
    expect(isRealFullMoon(Date.parse(when))).toBe(true);
    // The night before and after count; two days off doesn't
    expect(isRealFullMoon(Date.parse(when) - 0.5 * DAY)).toBe(true);
    expect(isRealFullMoon(Date.parse(when) + 0.5 * DAY)).toBe(true);
    expect(isRealFullMoon(Date.parse(when) + 2 * DAY)).toBe(false);
    expect(isRealFullMoon(Date.parse(when) - 2 * DAY)).toBe(false);
  });

  test.each([['2024-04-08T18:18Z'], ['2026-08-12T17:46Z'], ['2026-11-09T20:00Z']])('not full on %s', (when) => {
    expect(isRealFullMoon(Date.parse(when))).toBe(false);
  });

  test('the age wraps at a synodic month', () => {
    const t = Date.parse('2025-03-14T06:55Z');
    expect(moonAge(t + 29.530588 * DAY)).toBeCloseTo(moonAge(t), 6);
  });
});

describe('maybeSpawn: every rule', () => {
  const ALWAYS = () => 0; // fires, and picks the first kind

  test('it starts one when every rule passes, and announces nothing itself', () => {
    players(2, PLAIN);
    const spawned = maybeSpawn(guild, NORMAL, PLAIN + MIN, ALWAYS);
    expect(spawned.happening).toMatchObject({ kind: 'fullmoon', source: 'random', startedAt: PLAIN + MIN, messageId: null, claimedAt: null });
    expect(loadState(guild).spawned).toEqual({ day: '2026-11-09', count: 1, week: '2026-11-09', weekCount: 1 });
  });

  test('switched off, or frequency off: never', () => {
    players(3, PLAIN);
    expect(maybeSpawn(guild, settings({ happenings: false }), PLAIN, ALWAYS)).toBeNull();
    expect(maybeSpawn(guild, settings({ happeningFrequency: 'off' }), PLAIN, ALWAYS)).toBeNull();
    expect(loadState(guild).happening).toBeNull();
    // Refused by the rules, not just by a zero chance
    for (const games of [{ happenings: false }, { happeningFrequency: 'off' }]) {
      expect(spawnEligibility(loadState(guild), settings(games), PLAIN)).toEqual({ ok: false, reason: 'off' });
    }
  });

  test('GAME_LUCK=off: nothing starts by chance (the default luck)', () => {
    expect(process.env.GAME_LUCK).toBe('off');
    expect(defaultLuck()).toBe(LUCK_OFF);
    players(3, PLAIN);
    // Math.random at 0 would fire every check: luck isn't Math.random
    jest.spyOn(Math, 'random').mockReturnValue(0);
    for (let i = 0; i < 30; i++) expect(maybeSpawn(guild, settings({ happeningFrequency: 'often' }), PLAIN + i * MIN)).toBeNull();
  });

  test('one at a time', () => {
    players(2, PLAIN);
    startHappening(guild, 'fog', {}, PLAIN);
    expect(maybeSpawn(guild, NORMAL, PLAIN + 44 * MIN, ALWAYS)).toBeNull();
    expect(spawnEligibility(loadState(guild), NORMAL, PLAIN + 44 * MIN)).toEqual({ ok: false, reason: 'in-progress' });
  });

  test('a 2-hour gap from the end of the last one — even one nobody ended', () => {
    const { happening } = startHappening(guild, 'fog', {}, PLAIN - 3 * HOUR);
    endHappening(guild, happening.id, PLAIN - 2 * HOUR); // noticed late: it ended at its endsAt
    const endedAt = loadState(guild).lastEndedAt;
    players(2, endedAt + 119 * MIN);
    expect(maybeSpawn(guild, NORMAL, endedAt + 119 * MIN, ALWAYS)).toBeNull();
    expect(spawnEligibility(loadState(guild), NORMAL, endedAt + 119 * MIN).reason).toBe('gap');
    expect(maybeSpawn(guild, NORMAL, endedAt + 120 * MIN, ALWAYS)).not.toBeNull();

    // Ran out at its endsAt but never ended (the scheduler was down): the gap counts from endsAt
    const g2 = `${guild}-b`;
    startHappening(g2, 'fog', {}, PLAIN);
    for (let i = 0; i < 2; i++) noteActivity(g2, { channelId: 'games', userId: `p${i}` }, PLAIN + 164 * MIN);
    expect(maybeSpawn(g2, NORMAL, PLAIN + 164 * MIN, ALWAYS)).toBeNull(); // 45 + 119
    expect(maybeSpawn(g2, NORMAL, PLAIN + 165 * MIN, ALWAYS)).not.toBeNull();
    expect(loadState(g2).history).toEqual([{ kind: 'fog', source: 'admin', startedAt: PLAIN, endedAt: PLAIN + 45 * MIN }]);
    fs.unlinkSync(fileOf(g2));
    if (fs.existsSync(`${fileOf(g2)}.bak`)) fs.unlinkSync(`${fileOf(g2)}.bak`);
  });

  test('at most 3 started in a UTC day — admin starts count — then a new day', () => {
    const day = Date.UTC(2026, 10, 9, 0, 30);
    for (let i = 0; i < 3; i++) {
      const { happening } = startHappening(guild, 'fog', {}, day + i * 3 * HOUR);
      endHappening(guild, happening.id, day + i * 3 * HOUR + 45 * MIN);
    }
    const late = Date.UTC(2026, 10, 9, 23, 0);
    players(3, late);
    expect(maybeSpawn(guild, NORMAL, late, ALWAYS)).toBeNull();
    expect(spawnEligibility(loadState(guild), NORMAL, late).reason).toBe('daily-limit');
    const tomorrow = Date.UTC(2026, 10, 10, 0, 1);
    players(3, tomorrow);
    expect(maybeSpawn(guild, NORMAL, tomorrow, ALWAYS)).not.toBeNull();
    // The week (from Monday the 9th) counts all four
    expect(loadState(guild).spawned).toEqual({ day: '2026-11-10', count: 1, week: '2026-11-09', weekCount: 4 });
  });

  test('enough members: 2 for most, 3 for a Double Feature; stamps older than 30 minutes don\'t count', () => {
    players(1, PLAIN);
    expect(spawnEligibility(loadState(guild), NORMAL, PLAIN).reason).toBe('too-few-players');
    expect(maybeSpawn(guild, NORMAL, PLAIN, ALWAYS)).toBeNull();

    players(2, PLAIN);
    const two = spawnEligibility(loadState(guild), NORMAL, PLAIN);
    expect(two.kinds).toEqual(Object.keys(HAPPENINGS).filter(k => k !== 'doublefeature'));
    // The last kind by weight is never a Double Feature with two around
    expect(maybeSpawn(guild, NORMAL, PLAIN, seq(0, 0.999)).happening.kind).toBe('intermission');

    const g3 = `${guild}-3`;
    for (let i = 0; i < 3; i++) noteActivity(g3, { channelId: 'games', userId: `p${i}` }, PLAIN);
    expect(spawnEligibility(loadState(g3), NORMAL, PLAIN).kinds).toContain('doublefeature');
    expect(spawnEligibility(loadState(g3), NORMAL, PLAIN + 30 * MIN).reason).toBe('too-few-players');
    for (const f of fs.readdirSync(_happeningsDir)) if (f.startsWith(`${g3}.json`)) fs.unlinkSync(path.join(_happeningsDir, f));
  });

  test('the chance per check is Σ rate × frequency / ACTIVE_MINUTES_PER_DAY, exactly', () => {
    players(3, PLAIN);
    const all = Object.keys(HAPPENINGS);
    const sum = all.reduce((s, k) => s + HAPPENINGS[k].rate, 0);
    expect(sum).toBeCloseTo(1.93, 10);
    for (const [frequency, mult] of [['rare', 0.5], ['normal', 1], ['often', 2]]) {
      const p = (sum * mult) / ACTIVE_MINUTES_PER_DAY;
      expect(spawnChance(all, settings({ happeningFrequency: frequency }), PLAIN)).toBeCloseTo(p, 12);
      // Just over the line: nothing; just under: one
      expect(maybeSpawn(guild, settings({ happeningFrequency: frequency }), PLAIN, seq(p + 1e-9, 0))).toBeNull();
      const got = maybeSpawn(guild, settings({ happeningFrequency: frequency }), PLAIN, seq(p - 1e-9, 0));
      expect(got.happening.kind).toBe('fullmoon');
      fs.unlinkSync(fileOf(guild));
      fs.rmSync(`${fileOf(guild)}.bak`, { force: true });
      players(3, PLAIN);
    }
  });

  test('which kind: drawn by rate', () => {
    players(3, PLAIN);
    const kinds = Object.keys(HAPPENINGS);
    const total = kinds.reduce((s, k) => s + HAPPENINGS[k].rate, 0);
    let before = 0;
    for (const kind of kinds) {
      const share = HAPPENINGS[kind].rate / total;
      const r = before + share / 2; // the middle of its slice
      before += share;
      expect(`${r.toFixed(3)} → ${maybeSpawn(guild, NORMAL, PLAIN, seq(0, r)).happening.kind}`).toBe(`${r.toFixed(3)} → ${kind}`);
      fs.unlinkSync(fileOf(guild));
      fs.rmSync(`${fileOf(guild)}.bak`, { force: true });
      players(3, PLAIN);
    }
  });

  test('on a real full moon, Full Moon is 4× as likely: in the chance and in the pick', () => {
    const fullNight = Date.parse('2025-03-14T06:55Z');
    const newNight = Date.parse('2024-04-08T18:18Z');
    const kinds = Object.keys(HAPPENINGS).filter(k => k !== 'doublefeature');
    const base = kinds.reduce((s, k) => s + HAPPENINGS[k].rate, 0); // 1.85
    expect(spawnChance(kinds, NORMAL, newNight)).toBeCloseTo(base / ACTIVE_MINUTES_PER_DAY, 12);
    expect(spawnChance(kinds, NORMAL, fullNight)).toBeCloseTo((base + 3 * HAPPENINGS.fullmoon.rate) / ACTIVE_MINUTES_PER_DAY, 12);

    // The same "which" draw: Full Moon on the full night, not on the new one
    const r = 0.3; // Full Moon's slice: 0.25/1.85 = 13.5% normally, 1.00/2.60 = 38.5% when full
    for (const [at, kind] of [[fullNight, 'fullmoon'], [newNight, 'happyhour']]) {
      const g = `${guild}-${kind}`;
      for (let i = 0; i < 2; i++) noteActivity(g, { channelId: 'games', userId: `p${i}` }, at);
      expect(maybeSpawn(g, NORMAL, at, seq(0, r)).happening.kind).toBe(kind);
      for (const f of fs.readdirSync(_happeningsDir)) if (f.startsWith(`${g}.json`)) fs.unlinkSync(path.join(_happeningsDir, f));
    }
  });

  test('a check that doesn\'t start one writes nothing', () => {
    players(2, PLAIN);
    const before = fs.readFileSync(fileOf(guild), 'utf8');
    const mtime = fs.statSync(fileOf(guild)).mtimeMs;
    expect(maybeSpawn(guild, NORMAL, PLAIN, () => 0.99)).toBeNull();
    expect(fs.readFileSync(fileOf(guild), 'utf8')).toBe(before);
    expect(fs.statSync(fileOf(guild)).mtimeMs).toBe(mtime);
  });
});

describe('how often, over simulated days', () => {
  /**
   * `days` active evenings: three members play every few minutes from
   * 18:00 until 30 minutes before `until` (UTC), so 2+ have played in the
   * last 30 minutes for every minute from 18:00 to `until` — by default
   * ACTIVE_MINUTES_PER_DAY (240) of them. The scheduler's pass runs once a
   * minute through them: end what's run out, then maybeSpawn, with seeded
   * luck. `unthrottled` clears each one the moment it starts, so the one-
   * at-a-time, gap and daily rules never apply: what's left is the dice.
   */
  function simulate({ days, frequency, from = 18 * 60, until = 22 * 60, seed = 7, unthrottled = false }) {
    const s = settings({ happeningFrequency: frequency });
    const all = Object.keys(HAPPENINGS);
    const luck = seeded(seed);
    let spawns = 0;
    let expected = 0; // Σ of the formula's chance over every minute that could spawn
    const perDay = [];
    const start = Date.UTC(2026, 10, 2);
    for (let d = 0; d < days; d++) {
      let today = 0;
      for (let m = from; m < until; m++) {
        const now = start + d * DAY + m * MIN;
        if (m <= until - 30 && (m - from) % 10 === 0) players(3, now);
        const h = loadState(guild).happening;
        if (h && !h.endedAt && now >= h.endsAt) endHappening(guild, h.id, now);
        if (spawnEligibility(loadState(guild), s, now).ok) expected += spawnChance(all, s, now);
        if (maybeSpawn(guild, s, now, luck)) {
          spawns++;
          today++;
          if (unthrottled) mutate(guild, (data) => { data.happening = null; data.lastEndedAt = 0; data.spawned = { day: null, count: 0 }; });
        }
      }
      perDay.push(today);
    }
    return { spawns, expected, perDay, mean: spawns / days };
  }

  test('normal, unthrottled: an active day holds Σ rate × frequency ≈ 1.93 starts, as the formula says', () => {
    const { spawns, expected, mean } = simulate({ days: 200, frequency: 'normal', unthrottled: true });
    // ~390 starts, so the count's own noise is ~5%
    expect(spawns / expected).toBeGreaterThan(0.85);
    expect(spawns / expected).toBeLessThan(1.15);
    // Σ rate is 1.93; real full moons add a little on a few nights
    expect(expected / 200).toBeGreaterThan(1.93);
    expect(expected / 200).toBeLessThan(2.0);
    console.info(`[rate] normal, unthrottled: ${mean.toFixed(2)} a day measured, ${(expected / 200).toFixed(2)} by the formula`);
  });

  test('normal, with the limits: about one a day really happens, never over 3', () => {
    const { perDay, mean } = simulate({ days: 60, frequency: 'normal', seed: 5 });
    expect(mean).toBeGreaterThan(0.7);
    expect(mean).toBeLessThan(1.3);
    expect(Math.max(...perDay)).toBeLessThanOrEqual(HAPPENING_RULES.maxPerDay);
    console.info(`[rate] normal, limited: ${mean.toFixed(2)} a day over ${perDay.length} active evenings`);
  });

  test('often, on a server busy all day: the daily limit holds at 3', () => {
    const { perDay, mean } = simulate({ days: 8, frequency: 'often', from: 6 * 60, until: 24 * 60, seed: 3 });
    expect(Math.max(...perDay)).toBe(HAPPENING_RULES.maxPerDay);
    console.info(`[rate] often, busy 18 h a day: ${mean.toFixed(2)} a day, at most ${Math.max(...perDay)}`);
  });
});

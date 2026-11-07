/**
 * Pace (2.74.0) for happenings and random campaigns, store-level: how long
 * a happening lasts at each pace, the weekly limits from `day` on (and a
 * file written before them), happenings and campaigns side by side, and
 * how often each really comes on a server that plays every evening —
 * measured, as tests/happening-store.test.js measures the quick pace.
 *
 * Run with: npm test -- tests/happening-pace.test.js
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  startHappening, endHappening, maybeSpawn, loadState, mutate, spawnEligibility, spawnChance, noteActivity, weekKey,
} from '../src/utils/happeningStore.js';
import { HAPPENINGS, HAPPENING_RULES } from '../src/data/gameHappenings.js';
import { SIEGE, SIEGE_PACES, PACE_RULES } from '../src/data/gameRewards.js';
import { getGameSettings } from '../src/utils/gameScores.js';
import { announcementPayload } from '../src/utils/happeningScheduler.js';
import {
  randomSiegeEligibility, randomSiegeChance, randomPoolScale,
} from '../src/utils/siegeStore.js';
import {
  happeningMinutes, randomGapHours, nearestPace, siegeTimings, siegeEndsAt, timingsOf, defaultSiegeMinutes, paceOf,
  campaignNight, firstNightBoundary,
} from '../src/utils/gamePace.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const PLAIN = Date.UTC(2026, 10, 9, 20, 0); // a Monday: no calendar happening, no full moon
const settings = (games = {}) => getGameSettings({ games });

/** mulberry32 (as the simulators): a seeded draw, so a measured rate replays exactly */
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

let n = 0;
let guild;
beforeEach(() => {
  guild = `hp-${process.pid}-${++n}`;
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const players = (count, now) => {
  for (let i = 0; i < count; i++) noteActivity(guild, { channelId: 'games', userId: `p${i}` }, now);
};

// ── the settings ────────────────────────────────────────────────────────

describe('the setting', () => {
  test('a server that never chose a pace is on week; an unknown value reads as week; the five are kept', () => {
    expect(settings().pace).toBe('week');
    expect(getGameSettings({}).pace).toBe('week');
    expect(getGameSettings(null).pace).toBe('week');
    expect(settings({ pace: 'fortnight' }).pace).toBe('week');
    for (const p of ['quick', 'evening', 'day', 'days3', 'week']) expect(settings({ pace: p }).pace).toBe(p);
    expect(paceOf({})).toBe('week');
  });

  test('a siege nobody chose a length for: siege-minutes (or the monster\'s own) at quick, the pace\'s length otherwise', () => {
    expect(defaultSiegeMinutes(settings({ pace: 'quick', siegeMinutes: 55 }))).toBe(55);
    expect(defaultSiegeMinutes(settings({ pace: 'quick' }), { minutes: 60 })).toBe(60);
    expect(defaultSiegeMinutes(settings({ pace: 'evening', siegeMinutes: 55 }), { minutes: 60 })).toBe(240);
    expect(defaultSiegeMinutes(settings())).toBe(7 * 24 * 60);
  });

  test('any length takes the nearest preset on a log scale, and its HP counts its whole days', () => {
    const cases = [[30, 'quick', 1], [45, 'quick', 1], [60, 'quick', 1], [240, 'evening', 1], [1440, 'day', 1],
      [4320, 'days3', 3], [7200, 'week', 5], [10080, 'week', 7], [14400, 'week', 10]];
    for (const [minutes, key, N] of cases) {
      expect([minutes, nearestPace(minutes), siegeTimings(minutes).N]).toEqual([minutes, key, N]);
    }
    // The boundaries sit at the geometric means between neighbours
    expect(nearestPace(Math.floor(Math.sqrt(45 * 240)))).toBe('quick');
    expect(nearestPace(Math.ceil(Math.sqrt(45 * 240)))).toBe('evening');
  });

  test('a 3-day or week campaign ends at the boundary closing its Nth night — a boundary in its first 6 hours isn\'t a night; a day siege at its length', () => {
    const at = Date.UTC(2026, 10, 9, 20, 30); // Monday evening: night 1 ends Tuesday 12:00
    expect(siegeEndsAt(at, 10080, siegeTimings(10080))).toBe(Date.UTC(2026, 10, 16, 12));
    expect(siegeEndsAt(at, 4320, siegeTimings(4320))).toBe(Date.UTC(2026, 10, 12, 12));
    expect(siegeEndsAt(at, 1440, siegeTimings(1440))).toBe(at + DAY);
    expect(siegeEndsAt(at, 45, siegeTimings(45))).toBe(at + 45 * MIN);
    // 11:59 and 12:01 are the same week now (the review found 168 h and 192 h)
    const week = (h, m) => (siegeEndsAt(Date.UTC(2026, 10, 10, h, m), 10080, siegeTimings(10080)) - Date.UTC(2026, 10, 10, h, m)) / HOUR;
    expect(week(11, 59)).toBeCloseTo(168 + 1 / 60, 6);
    expect(week(12, 1)).toBeCloseTo(168 - 1 / 60, 6);
    // A start 6 hours before a boundary counts that night; a minute later doesn't: 150–174 hours, always 7 nights
    expect(week(6, 0)).toBe(150);
    expect(week(6, 1)).toBeCloseTo(174 - 1 / 60, 6);
    for (let h = 0; h < 24; h++) {
      const len = week(h, 17);
      expect(len).toBeGreaterThanOrEqual(150);
      expect(len).toBeLessThanOrEqual(174);
    }
    expect(campaignNight(Date.UTC(2026, 10, 10, 11, 59), Date.UTC(2026, 10, 10, 12, 2))).toBe(1);
    expect(campaignNight(Date.UTC(2026, 10, 10, 11, 59), Date.UTC(2026, 10, 11, 12, 2))).toBe(2);
    expect(firstNightBoundary(Date.UTC(2026, 10, 10, 11, 59))).toBe(Date.UTC(2026, 10, 11, 12));
    // HP's N is the nights it runs, whenever it starts: its last minute is in night N.
    // A week is 150 to just under 174 hours, 3 days 54 to just under 78
    for (const [span, n, lo, hi] of [[10080, 7, 150, 174], [4320, 3, 54, 78]]) {
      expect(siegeTimings(span).N).toBe(n);
      for (let h = 0; h < 24; h++) {
        for (const m of [0, 1, 59]) {
          const start = Date.UTC(2026, 10, 10, h, m);
          const end = siegeEndsAt(start, span, siegeTimings(span));
          expect(campaignNight(start, end - 1)).toBe(n);
          expect(campaignNight(start, end)).toBe(n + 1);
          expect((end - start) / HOUR).toBeGreaterThanOrEqual(lo);
          expect((end - start) / HOUR).toBeLessThan(hi);
        }
      }
    }
  });

  test('a siege from before 2.74 (no `t`) reads quick, every timing as it was; a copy missing a key reads it from its preset', () => {
    const old = timingsOf({ id: 'x' });
    expect(old).toMatchObject({
      key: 'quick', busy: false, actEvery: SIEGE.actions.everyMinutes, freeMinutes: SIEGE.grab.freeMinutes,
      poisonMinutes: SIEGE.poisoned.minutes, outMinutes: null, noGrowth: SIEGE.noGrowthLastMinutes, allowance: null, pot: false,
      hpBase: 'members', base: SIEGE.hp.perActive, growth: SIEGE.hp.perFighter, growthPer: 'fighter', honour: 1, report: false, nightEnd: false, N: 1,
      cardEditSeconds: SIEGE.cardEditSeconds,
    });
    expect(old.pool).toEqual({ perFighter: SIEGE.rewards.perFighter, poolMin: SIEGE.rewards.poolMin, poolMax: SIEGE.rewards.poolMax, eachMax: SIEGE.rewards.eachMax });
    expect(old.dial).toEqual({ win: SIEGE.dial.win, escape: SIEGE.dial.escape });
    const partial = timingsOf({ t: { key: 'week', allowance: 5, pool: { eachMax: 50 } } });
    expect(partial).toMatchObject({ key: 'week', allowance: 5, freeMinutes: SIEGE_PACES.week.freeMinutes, N: 1 });
    expect(partial.pool).toEqual({ ...SIEGE_PACES.week.pool, eachMax: 50 });
  });
});

// ── happenings ──────────────────────────────────────────────────────────

describe('how long a happening lasts', () => {
  test('its own minutes at quick, ×4 at evening, from day on ×24 to at most a day', () => {
    const want = {
      quick: { fullmoon: 60, fog: 45, doublefeature: 30 },
      evening: { fullmoon: 240, fog: 180, doublefeature: 120 },
      day: { fullmoon: 1440, fog: 1080, doublefeature: 720 },
      days3: { fullmoon: 1440, fog: 1080, doublefeature: 720 },
      week: { fullmoon: 1440, fog: 1080, doublefeature: 720 },
    };
    for (const [pace, kinds] of Object.entries(want)) {
      for (const [kind, minutes] of Object.entries(kinds)) {
        expect([pace, kind, happeningMinutes(HAPPENINGS[kind], pace)]).toEqual([pace, kind, minutes]);
        const g = `${guild}-${pace}-${kind}`;
        const { happening } = startHappening(g, kind, { pace }, PLAIN);
        expect([pace, kind, (happening.endsAt - happening.startedAt) / MIN]).toEqual([pace, kind, minutes]);
      }
    }
    // Every kind, at week: never over a day
    for (const h of Object.values(HAPPENINGS)) expect(happeningMinutes(h, 'week')).toBeLessThanOrEqual(24 * 60);
  });

  test('the announcement says how long, from the happening\'s own start and end', () => {
    const { happening } = startHappening(guild, 'fullmoon', { pace: 'week' }, PLAIN);
    expect(announcementPayload(happening).content).toBe('🌕 **The moon is full over the Drive-In.** For the next 24 hours every /doom scores double, both ways. Lock your car doors.');
    const fog = { ...happening, kind: 'fog', endsAt: happening.startedAt + 45 * MIN };
    expect(announcementPayload(fog).content).toContain('For the next 45 minutes you can\'t see the screen');
    for (const h of Object.values(HAPPENINGS)) expect(h.announce).toContain('{for}');
  });

  test('changing the pace never moves one that\'s on: its end was set when it started', () => {
    const { happening } = startHappening(guild, 'fullmoon', { pace: 'quick' }, PLAIN);
    // A week-pace pass later sees the same end
    expect(spawnEligibility(loadState(guild), settings(), PLAIN + 30 * MIN)).toEqual({ ok: false, reason: 'in-progress' });
    expect(loadState(guild).happening.endsAt).toBe(happening.endsAt);
    expect(happening.endsAt).toBe(PLAIN + 60 * MIN);
  });
});

describe('how often, from day on: by the week', () => {
  const WEEK = settings({ happeningFrequency: 'often' });

  test('a day apart, at most 2 a (UTC, Monday) week — admin starts count — then a new week', () => {
    players(3, PLAIN);
    const always = () => 0;
    // Monday: one starts, a day long
    expect(maybeSpawn(guild, WEEK, PLAIN, always).happening.endsAt).toBe(PLAIN + DAY);
    // It ends Tuesday 20:00; the next waits a day after that
    players(3, PLAIN + 2 * DAY - MIN);
    expect(spawnEligibility(loadState(guild), WEEK, PLAIN + 2 * DAY - MIN)).toEqual({ ok: false, reason: 'gap' });
    players(3, PLAIN + 2 * DAY);
    expect(maybeSpawn(guild, WEEK, PLAIN + 2 * DAY, always)).not.toBeNull();
    // Two this week: no third, however far apart
    players(3, PLAIN + 5 * DAY);
    expect(spawnEligibility(loadState(guild), WEEK, PLAIN + 5 * DAY)).toEqual({ ok: false, reason: 'weekly-limit' });
    expect(loadState(guild).spawned).toMatchObject({ week: '2026-11-09', weekCount: 2 });
    // The next Monday
    const monday = Date.UTC(2026, 10, 16, 20);
    players(3, monday);
    expect(maybeSpawn(guild, WEEK, monday, always)).not.toBeNull();
    expect(loadState(guild).spawned).toMatchObject({ week: '2026-11-16', weekCount: 1 });
    expect(weekKey(Date.UTC(2026, 10, 15, 23, 59))).toBe('2026-11-09'); // Sunday belongs to Monday's week
  });

  test('a file written before 2.74 (no week counter) reads as none this week', () => {
    mutate(guild, (d) => { d.spawned = { day: '2026-11-09', count: 3 }; });
    players(3, PLAIN);
    // At quick its 3 today hold it back; at week the week has none
    expect(spawnEligibility(loadState(guild), settings({ pace: 'quick' }), PLAIN)).toEqual({ ok: false, reason: 'daily-limit' });
    expect(spawnEligibility(loadState(guild), WEEK, PLAIN).ok).toBe(true);
  });

  test('a happening may start during a campaign (day on), never during a quick or evening siege — by the siege\'s own timings, whatever the server\'s pace', () => {
    players(3, PLAIN);
    // Review, 2026-11-06: it read the server's pace, so a quick server with a
    // week campaign from before its change of pace got no happenings for a week
    const ALL = ['quick', 'evening', 'day', 'days3', 'week'];
    for (const key of ['day', 'days3', 'week']) {
      mutate(guild, (d) => { d.siege = { id: `s-${key}`, status: 'live', t: { ...SIEGE_PACES[key], N: 1 } }; });
      for (const pace of ALL) expect(spawnEligibility(loadState(guild), settings({ pace }), PLAIN).ok).toBe(true);
    }
    for (const key of ['quick', 'evening']) {
      mutate(guild, (d) => { d.siege = { id: `s-${key}`, status: 'live', t: { ...SIEGE_PACES[key], N: 1 } }; });
      for (const pace of ALL) expect(spawnEligibility(loadState(guild), settings({ pace }), PLAIN)).toEqual({ ok: false, reason: 'siege' });
    }
    // A siege from before 2.74 (no `t`) is quick: it holds them back, as it always did
    mutate(guild, (d) => { d.siege = { id: 's-old', status: 'live' }; });
    for (const pace of ALL) expect(spawnEligibility(loadState(guild), settings({ pace }), PLAIN)).toEqual({ ok: false, reason: 'siege' });
  });

  test('measured: about one a week at normal on a server that plays 4 hours every evening (half that at rare), never over 2 — half a year', () => {
    const rate = (frequency, seed) => {
      const g = `${guild}-${frequency}`;
      const s = settings({ happeningFrequency: frequency });
      const luck = seeded(seed);
      const perWeek = [];
      const start = Date.UTC(2026, 10, 2); // a Monday
      for (let w = 0; w < 26; w++) {
        let count = 0;
        for (let d = 0; d < 7; d++) {
          for (let m = 18 * 60; m < 22 * 60; m++) {
            const now = start + (w * 7 + d) * DAY + m * MIN;
            if ((m - 18 * 60) % 10 === 0 && m <= 22 * 60 - 30) {
              for (const u of ['a', 'b', 'c']) noteActivity(g, { channelId: 'games', userId: u }, now);
            }
            const h = loadState(g).happening;
            if (h && !h.endedAt && now >= h.endsAt) endHappening(g, h.id, now);
            if (maybeSpawn(g, s, now, luck)) count += 1;
          }
        }
        perWeek.push(count);
      }
      return { mean: perWeek.reduce((a, b) => a + b, 0) / perWeek.length, max: Math.max(...perWeek) };
    };
    // Measured at normal (each week is 1,680 store checks: rare, half the chance, measured
    // 0.65 a week over a year when the spread was tuned, is checked by its formula below)
    const normal = rate('normal', 11);
    console.info(`[rate] week pace: ${normal.mean.toFixed(2)} a week at normal`);
    expect(normal.mean).toBeGreaterThan(0.8);
    expect(normal.mean).toBeLessThan(1.3);
    expect(normal.max).toBeLessThanOrEqual(HAPPENING_RULES.weekly.maxPerWeek);
    const kinds = Object.keys(HAPPENINGS);
    expect(spawnChance(kinds, settings({ happeningFrequency: 'rare' }), PLAIN)).toBeCloseTo(spawnChance(kinds, settings(), PLAIN) / 2, 12);
    // …and a week's chance is a day's spread over HAPPENING_RULES.weekly.spreadDays
    expect(spawnChance(kinds, settings(), PLAIN)).toBeCloseTo(spawnChance(kinds, settings({ pace: 'quick' }), PLAIN) / HAPPENING_RULES.weekly.spreadDays, 12);
  }, 120_000);
});

// ── random campaigns ────────────────────────────────────────────────────

describe('random sieges at each pace', () => {
  const ok = { activity: { recent: { a: PLAIN - MIN, b: PLAIN - 2 * MIN, c: PLAIN - 5 * HOUR } }, siege: null, happening: null };
  const ended = (hoursAgo) => ({ siege: { status: 'escaped', finishedAt: PLAIN - hoursAgo * HOUR, result: { announcedAt: PLAIN } } });
  const reason = (patch, games) => randomSiegeEligibility({ ...ok, ...patch }, settings(games), PLAIN).reason;

  test('the gap after the last ends: 20 h at quick and evening whatever the frequency; 48 h at day and 3 days, 72 h at week — rare ×2, often ×½', () => {
    const want = { quick: [20, 20, 20], evening: [20, 20, 20], day: [96, 48, 24], days3: [96, 48, 24], week: [144, 72, 36] };
    for (const [pace, [rare, normal, often]] of Object.entries(want)) {
      expect([pace, ['rare', 'normal', 'often'].map(f => randomGapHours(pace, f))]).toEqual([pace, [rare, normal, often]]);
      for (const [f, h] of [['rare', rare], ['normal', normal], ['often', often]]) {
        expect(reason(ended(h - 0.1), { pace, siegeFrequency: f })).toBe('gap');
        expect(reason(ended(h), { pace, siegeFrequency: f })).toBeUndefined();
      }
    }
  });

  test('a happening holds one back at quick and evening; from day on it doesn\'t', () => {
    const on = { happening: { endedAt: null, endsAt: PLAIN + HOUR } };
    expect(reason(on, { pace: 'quick' })).toBe('happening');
    expect(reason(on, { pace: 'evening' })).toBe('happening');
    for (const pace of ['day', 'days3', 'week']) expect(reason(on, { pace })).toBeUndefined();
  });

  test('the chance: quick and evening by the frequency, as before; from day on 0.5% a busy minute (≈70% in a 4-hour evening), and the pool unscaled', () => {
    for (const pace of ['day', 'days3', 'week']) {
      for (const f of ['rare', 'normal', 'often']) expect(randomSiegeChance(f, pace)).toBe(PACE_RULES.randomChance);
      expect(randomSiegeChance('off', pace)).toBe(0);
      expect(['rare', 'normal', 'often'].map(f => randomPoolScale(f, pace))).toEqual([1, 1, 1]);
    }
    expect(1 - (1 - PACE_RULES.randomChance) ** 240).toBeCloseTo(0.7, 1);
    expect(randomSiegeChance('normal', 'evening')).toBe(randomSiegeChance('normal', 'quick'));
    expect(randomPoolScale('often', 'evening')).toBe(randomPoolScale('often', 'quick'));
  });

  test('measured at week pace: a server that plays 4 hours every evening sees about 3 campaigns a month at normal, 2 at rare — 12 months', () => {
    const month = (frequency) => {
      const s = settings({ siegeFrequency: frequency });
      const luck = seeded(99);
      const state = { activity: { recent: {} }, siege: null, happening: null };
      let count = 0;
      const start = Date.UTC(2026, 0, 5);
      for (let day = 0; day < 360; day++) {
        for (let m = 0; m < 240; m++) {
          const now = start + day * DAY + 18 * HOUR + m * MIN;
          if (m % 5 === 0) for (const u of ['a', 'b', 'c']) state.activity.recent[u] = now;
          // A campaign runs to the night boundary a week on, then ends; its results posted
          if (state.siege?.status === 'live' && now >= state.siege.endsAt) state.siege = { status: 'escaped', startedAt: state.siege.startedAt, finishedAt: state.siege.endsAt, result: { announcedAt: state.siege.endsAt } };
          if (!randomSiegeEligibility(state, s, now).ok) continue;
          if (!(luck() < randomSiegeChance(frequency, 'week'))) continue;
          count += 1;
          state.siege = { status: 'live', startedAt: now, endsAt: siegeEndsAt(now, 10080, siegeTimings(10080)) };
        }
      }
      return count / 12;
    };
    const normal = month('normal');
    const rare = month('rare');
    console.info(`[rate] week pace: ${normal.toFixed(2)} campaigns a month at normal, ${rare.toFixed(2)} at rare`);
    expect(normal).toBeGreaterThan(2.3);
    expect(normal).toBeLessThan(3.3);
    expect(rare).toBeGreaterThan(1.5);
    expect(rare).toBeLessThan(normal);
  });
});

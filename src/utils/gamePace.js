/**
 * Pace (2.74.0): how long the games' events take on a server. The numbers
 * are SIEGE_PACES and PACE_RULES (src/data/gameRewards.js) and
 * HAPPENING_RULES.weekly (gameHappenings.js); these are the small pure
 * helpers every reader shares — the siege and happening stores, the
 * scheduler, /siege, /eggshen-config-games and /how-to-play — so a timing
 * is worked out in one place.
 *
 * The server's pace is getGameSettings(config).pace (default `week`). It
 * decides the length of a siege nobody chose a length for, how often a
 * random one comes and how long happenings last. A siege's own timings are
 * its preset's, copied onto the record at the start (siegeTimings), and
 * read back with timingsOf — never from the settings — so changing the pace
 * never touches a siege in progress.
 *
 * No imports from the stores: they import this.
 */

import { SIEGE, SIEGE_PACES, SIEGE_PACE_KEYS, PACE_RULES, NIGHT_START_HOUR } from '../data/gameRewards.js';
import { HAPPENING_RULES } from '../data/gameHappenings.js';
// gameRules imports only data files, so this is no cycle
import { nightKey } from './gameRules.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const isObject = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

/** The pace a server is on when it never chose one (Doug, 2026-11-04: everyone moves to week) */
export const DEFAULT_PACE = 'week';

/** A pace key as stored, or the default: an unknown or missing value is `week` */
export const paceKey = (value) => (SIEGE_PACE_KEYS.includes(value) ? value : DEFAULT_PACE);

/** The server's pace, from its game settings */
export const paceOf = (settings) => paceKey(settings?.pace);

/** A preset by key (quick for anything unknown: it's the rules every old siege ran on) */
export const pacePreset = (key) => SIEGE_PACES[key] || SIEGE_PACES.quick;

/** Is this pace's siege a campaign over days, with a daily report? */
export const isLongPace = (key) => !!pacePreset(key).report;

/**
 * The preset nearest a length, on a log scale: 4 hours is `evening`, 5 days
 * is `week`, 60 minutes is `quick`. A tie goes to the shorter.
 */
export function nearestPace(minutes) {
  let best = 'quick';
  let distance = Infinity;
  for (const key of SIEGE_PACE_KEYS) {
    const d = Math.abs(Math.log(minutes / SIEGE_PACES[key].span));
    if (d < distance) {
      distance = d;
      best = key;
    }
  }
  return best;
}

/** Whole days in a siege of `minutes`, at least 1: its HP's N */
export const daysIn = (minutes) => Math.max(1, Math.floor(minutes / (24 * 60)));

/**
 * The timings copied onto a siege when it starts (`siege.t`): its preset's
 * numbers, plus N. Plain data — the file keeps it as it was, whatever the
 * presets become in a later release.
 */
export function siegeTimings(minutes) {
  const key = nearestPace(minutes);
  return { ...structuredClone(pacePreset(key)), N: daysIn(minutes) };
}

/**
 * A siege's timings, from its own copy. A siege from before 2.74 has none
 * and reads `quick` (today's rules, exactly); a copy missing a key (written
 * by another version) reads that key from its preset.
 */
export function timingsOf(siege) {
  const t = siege?.t;
  if (!isObject(t)) return { ...pacePreset('quick'), N: 1 };
  const base = pacePreset(t.key);
  return {
    ...base,
    ...t,
    pool: { ...base.pool, ...(isObject(t.pool) ? t.pool : {}) },
    dial: { ...base.dial, ...(isObject(t.dial) ? t.dial : {}) },
    N: Number.isFinite(t.N) && t.N >= 1 ? t.N : 1,
  };
}

/**
 * How long a siege lasts when nobody picks a length: at quick pace the
 * server's siege-minutes setting (or the monster's own — the Atomic
 * Lizard's hour); at any other, the pace's own length.
 */
export function defaultSiegeMinutes(settings, monster = null) {
  const key = paceOf(settings);
  if (key === 'quick') return monster?.minutes ?? settings?.siegeMinutes ?? SIEGE.minutes.default;
  return pacePreset(key).span;
}

/** The next night boundary (NIGHT_START_HOUR UTC) at or after `t` */
export function nightBoundaryAtOrAfter(t) {
  const d = new Date(t);
  const boundary = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), NIGHT_START_HOUR);
  return boundary >= t ? boundary : boundary + DAY;
}

/** The night boundary that started the night `t` is in */
export const nightBoundaryBefore = (t) => {
  const next = nightBoundaryAtOrAfter(t);
  return next === t ? t : next - DAY;
};

/**
 * The boundary that ends a siege's first night — the first of its night
 * boundaries that counts. One sooner isn't a night of its own: those first
 * hours belong to night 1, so an 11:59 start doesn't report "Night 1 is
 * over" a minute later.
 *
 * How soon is too soon depends on the pace (`t`; none: a 3-day or week
 * campaign's rule, as the length tests ask):
 *   - 3 days and a week (`nightEnd`): PACE_RULES.firstNightMinHours (6).
 *     It decides the length too (siegeEndsAt), so a campaign never runs a
 *     day short, and a week is always seven evenings.
 *   - `day`: PACE_RULES.dayReportMinHours (1). A day siege holds exactly one
 *     12:00 UTC, and the 6 hours left any started 06:00–12:00 UTC with no
 *     report at all, while every place that describes the pace promised one
 *     (review, 2026-11-06). It only decides whether that 12:00 gets a report.
 */
export const firstNightBoundary = (startedAt, t = null) => nightBoundaryAtOrAfter(startedAt + firstNightHours(t) * HOUR);
const firstNightHours = (t) => (t && !t.nightEnd ? PACE_RULES.dayReportMinHours : PACE_RULES.firstNightMinHours);

/**
 * Which of a campaign's nights `at` falls in (1 from the start to the
 * first boundary that counts), and which night a report posted after
 * boundary `b` is about: the one it closed.
 */
export const campaignNight = (startedAt, at, t = null) => {
  const first = firstNightBoundary(startedAt, t);
  return at < first ? 1 : Math.floor((at - first) / DAY) + 2;
};

/**
 * The night key (nightKey: 12:00 to 12:00 UTC) a siege counts `at` toward:
 * its allowance, its fighter-nights and its report's tallies. At 3 days and
 * a week (`nightEnd`) the hours before its first counted boundary are night
 * 1's, under the key of the night that boundary closes — the report and the
 * length already folded a boundary in the first 6 hours into night 1, but
 * the allowance didn't, and a campaign started 06:00–12:00 UTC gave everyone
 * two allowances and two growths in its first night, eight windows for its
 * seven nights (review, 2026-11-06). Now a campaign has exactly N. Any other
 * pace: nightKey, as every night in the games counts.
 */
export function campaignNightKey(startedAt, at, t) {
  if (t?.nightEnd && Number.isFinite(startedAt)) {
    const first = firstNightBoundary(startedAt, t);
    if (at < first) return nightKey(first - 1);
  }
  return nightKey(at);
}

/**
 * When the night after `at`'s begins for a siege at timings `t` that
 * started at `startedAt`: the next night boundary — or, in a 3-day or week
 * campaign's folded first hours (campaignNightKey), its first counted one.
 */
export function nextNightAt(startedAt, at, t) {
  if (t?.nightEnd && Number.isFinite(startedAt)) {
    const first = firstNightBoundary(startedAt, t);
    if (at < first) return first;
  }
  return nightBoundaryAtOrAfter(at + 1);
}

/**
 * When a siege starting at `now` for `minutes` ends. A 3-day or week
 * campaign (`nightEnd`) ends at the night boundary that closes its Nth
 * night (N = its whole days), counting nights as campaignNight does: a
 * week runs 150–174 hours, always seven evenings' worth. Any other, its
 * length on the clock.
 */
export function siegeEndsAt(now, minutes, t) {
  if (!t?.nightEnd) return now + Math.round(minutes * MINUTE);
  return firstNightBoundary(now, t) + (daysIn(minutes) - 1) * DAY;
}

/**
 * Is there a report boundary left in siege `s` after `now`: a night
 * boundary that counts (firstNightBoundary), after now and before it ends
 * (a boundary AT its end is the end: results, not a report)? Without one, a
 * digest nobody was around for has no report to wait for, and is told at
 * once (siegeStore.digestDue). Pure on the siege's own fields and timings.
 */
export function reportBoundaryLeft(startedAt, endsAt, t, now) {
  if (!t?.report) return false;
  const next = Math.max(firstNightBoundary(startedAt, t), nightBoundaryAtOrAfter(now + 1));
  return next < endsAt;
}

/** The random-siege frequency's effect on the gap at the long paces: rare ×2, often ×½ */
const GAP_FACTOR = Object.freeze({ rare: 2, normal: 1, often: 0.5 });

/**
 * Hours a random siege waits after the last one ended, on a server at
 * `key` pace with `frequency`. Quick and evening wait SIEGE.random.gapHours
 * whatever the frequency (it sets their chance instead); from day on the
 * frequency stretches or halves the gap.
 */
export function randomGapHours(key, frequency) {
  const preset = pacePreset(key);
  if (!preset.report) return preset.gapHours;
  return preset.gapHours * (GAP_FACTOR[frequency] ?? 1);
}

// ── happenings ─────────────────────────────────────────────────────────

/**
 * How happenings run at a pace: `k` × each one's minutes (at most
 * HAPPENING_RULES.weekly.maxMinutes), and per day (quick, evening: today's
 * 2-hour gap and 3 a day) or per week (day on: a day apart, 2 a week,
 * about one a week at normal).
 */
export function happeningPace(key) {
  const h = pacePreset(key).happenings;
  if (h.per === 'week') {
    const w = HAPPENING_RULES.weekly;
    return { k: h.k, per: 'week', gapMinutes: w.gapMinutes, max: w.maxPerWeek, spreadDays: w.spreadDays, maxMinutes: w.maxMinutes };
  }
  return { k: h.k, per: 'day', gapMinutes: HAPPENING_RULES.gapMinutes, max: HAPPENING_RULES.maxPerDay, spreadDays: 1, maxMinutes: Infinity };
}

/** How long happening `def` lasts at this pace, in minutes */
export function happeningMinutes(def, key) {
  const p = happeningPace(key);
  return Math.min(def.minutes * p.k, p.maxMinutes);
}

// ── words ──────────────────────────────────────────────────────────────

/** "45 minutes", "an hour", "4 hours", "a day", "3 days", "a week", "10 days" */
export function lengthWords(minutes) {
  if (minutes % (7 * 24 * 60) === 0 && minutes / (7 * 24 * 60) === 1) return 'a week';
  if (minutes >= 24 * 60 && minutes % (24 * 60) === 0) return minutes === 24 * 60 ? 'a day' : `${minutes / (24 * 60)} days`;
  if (minutes >= 60 && minutes % 60 === 0) return minutes === 60 ? 'an hour' : `${minutes / 60} hours`;
  return `${minutes} minutes`;
}

/**
 * When a pace's sieges report, for the places that describe a pace
 * (/eggshen-config-games, /how-to-play): each night of a campaign over
 * days; a day siege's one 12:00 UTC — skipped when it started too close
 * before it (firstNightBoundary). "A report each night" said so of a day
 * siege that started 06:00–12:00 UTC and never got one (review,
 * 2026-11-06). Null at a pace with no report.
 */
export function reportWords(t) {
  if (!t?.report) return null;
  if (t.nightEnd) return 'a report each night';
  const h = PACE_RULES.dayReportMinHours;
  return `a report at 12:00 UTC (unless it started in the ${h === 1 ? 'hour' : `${h} hours`} before)`;
}

/** "For the next hour", "for the next 24 hours": a happening's announcement */
export function forTheNext(minutes) {
  if (minutes === 60) return 'the next hour';
  if (minutes >= 60 && minutes % 60 === 0) return `the next ${minutes / 60} hours`;
  return `the next ${minutes} minutes`;
}

export { PACE_RULES };

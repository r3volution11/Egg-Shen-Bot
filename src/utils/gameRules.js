/**
 * The games' rules that need no storage: how a line is drawn, what an item
 * does to a play, how multipliers are capped, how a happening's `mods`
 * match a play (R4), how nights are counted, and how far a member is
 * toward a title. Pure functions, so recordPlay
 * (gameScores.js), resolvePlay (gamePlay.js) and the card
 * (gameCardData.js) all read the same rule instead of three copies of it.
 *
 * The numbers are in src/data/gameRewards.js.
 */

import {
  ITEMS, ITEM_EFFECTS, MULTIPLIER_CAPS, NIGHT_START_HOUR, NIGHT_TIERS, NIGHT_LIGHT_PRIZE,
} from '../data/gameRewards.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * Outcomes that extend a streak; any other (but `blocked`) ends it. Also
 * what the nights-in-a-row buff pays on. Lives here, not in gameScores.js
 * (which re-exports it), so the happening and twist rules below can use it
 * without a circular import.
 */
export const GOOD = new Set(['hit', 'tasty', 'doomed', 'rescued', 'helped', 'hurt']);

/**
 * Is a LINE's outcome good for the player? Potion lines are tagged
 * `worked`/`backfired` until recordPlay scores them as helped/hurt, so a
 * potion that works is good whichever way it works. `blocked` is neither
 * good nor bad: nothing happened.
 */
export const goodLine = (game, outcome) => GOOD.has(outcome) || (game === 'potion' && outcome === 'worked');
export const badLine = (game, outcome) => outcome !== 'blocked' && !goodLine(game, outcome);

// ── drawing a line ──────────────────────────────────────────────────────

/**
 * Draw one line, with one random number, over per-line weights: a line's
 * weight is weights[line.outcome] (1 when unlisted; below 0 counts as 0).
 *
 * With every weight 1 this returns exactly lines[Math.floor(r * n)] — what
 * pick() did before items existed — so the many tests that stub
 * Math.random to land on a chosen line still land on it. That's also why
 * it's ONE draw: a second draw (say, outcome first, then a line within
 * it) would move every stubbed test onto a different line.
 * tests/game-rules.test.js holds it to that over a grid of r values.
 *
 * A line weighted 0 is never drawn. If every line is weighted 0 (an item
 * narrowed a server's custom-only pool to nothing), the draw is even
 * rather than empty: a play always posts a line.
 *
 * @param {Array<{outcome: string}>} lines
 * @param {Object<string, number>} [weights] - outcome → weight
 * @param {() => number} [random] - [0, 1)
 */
export function pickLine(lines, weights = {}, random = Math.random) {
  if (!lines?.length) return undefined;
  let w = lines.map(l => Math.max(0, Number(weights?.[l?.outcome] ?? 1) || 0));
  let total = w.reduce((a, b) => a + b, 0);
  if (!(total > 0)) {
    w = lines.map(() => 1);
    total = lines.length;
  }
  const at = random() * total;
  let sum = 0;
  let last = 0;
  for (let i = 0; i < lines.length; i++) {
    if (w[i] <= 0) continue;
    sum += w[i];
    last = i;
    if (sum > at) return lines[i];
  }
  // r * total rounded up to total (r a hair under 1): the last drawable line
  return lines[last];
}

// ── items ───────────────────────────────────────────────────────────────

const FEED_OUTCOMES = new Set(['tasty', 'gross', 'spill']);

/**
 * The action a play was, from its outcome — for callers (and tests) that
 * hand recordPlay a bare outcome. Commands pass their action explicitly.
 */
export function actionFor(game, outcome) {
  if (game === 'foodfight') return FEED_OUTCOMES.has(outcome) ? 'feed' : 'throw';
  return { doom: 'fate', rescue: 'attempt', potion: 'give' }[game] || null;
}

/**
 * Is `key` one of `table`'s own entries? Item and title keys arrive from
 * an autocomplete, which Discord doesn't check: `table[key]` alone would
 * accept "constructor" or "__proto__" (an object's inherited keys) as an
 * item, a title or an outcome.
 */
export const owns = (table, key) => typeof key === 'string' && !!table && Object.hasOwn(table, key);

/** What an active item does to this play, or null when it doesn't fit it */
export function itemEffect(key, game, action) {
  const item = owns(ITEMS, key) ? ITEMS[key] : null;
  if (!item || item.passive || item.game !== game) return null;
  const effects = owns(ITEM_EFFECTS, key) ? ITEM_EFFECTS[key] : null;
  return owns(effects, action) ? effects[action] : null;
}

/**
 * A play's points after its multipliers. Your gains are multiplied up to
 * ×3, your losses up to ×2, the target's points up to ×2, whatever asks
 * for more. Items only ever pass `gain`, so an item can't make a target
 * lose more (R4's happenings pass `target`).
 * @param {[number, number]} points - [actor, target]
 * @returns {[number, number]}
 */
export function scalePoints([actor, target], { gain = 1, loss = 1, target: onTarget = 1 } = {}) {
  const times = (n, f, cap) => Math.round(n * Math.min(cap, f)) || 0; // || 0: no −0
  const a = actor > 0 ? times(actor, gain, MULTIPLIER_CAPS.gain) : times(actor, loss, MULTIPLIER_CAPS.loss);
  return [a, times(target, onTarget, MULTIPLIER_CAPS.target)];
}

// ── happenings (R4) ─────────────────────────────────────────────────────

/**
 * The happenings that count NOW. The store's activeHappenings already
 * leaves out a random one past its end, but the list is fetched once per
 * play and handed down, and a stored one a late scheduler hasn't cleared
 * yet must not stretch past its endsAt — so the rules check the clock
 * themselves. A calendar happening has endsAt null: it's on all day.
 */
export function liveHappenings(list, now = Date.now()) {
  return (Array.isArray(list) ? list : []).filter(h => h && typeof h === 'object'
    && !(Number.isFinite(h.endsAt) && now >= h.endsAt));
}

/**
 * Does one `mods.weights` or `mods.points` rule (gameHappenings.js) match
 * this play? Each of game/action/outcome narrows it when given; `bad: true`
 * matches every outcome that isn't good (and isn't `blocked`).
 */
export function ruleMatches(rule, { game, action, outcome }) {
  if (!rule) return false;
  if (rule.game && rule.game !== game) return false;
  if (rule.action && rule.action !== action) return false;
  if (rule.bad) return badLine(game, outcome);
  return !rule.outcome || rule.outcome === outcome;
}

/** A multiplier from a happening's data: a finite number ≥ 0, or null to skip it */
const factor = (v) => {
  const f = Number(v);
  return Number.isFinite(f) && f >= 0 ? f : null;
};

/**
 * The happenings' weight multipliers for each line outcome in a draw, and
 * which happenings touched it (a rule matched an outcome actually in the
 * pool) — those get their tag on the play's label.
 * @returns {{mult: Object<string, number>, touched: string[]}}
 */
export function happeningWeights(live, { game, action, outcomes }) {
  const mult = {};
  const touched = new Set();
  for (const outcome of outcomes) {
    let m = 1;
    for (const h of live) {
      for (const rule of h.mods?.weights || []) {
        const f = factor(rule?.mult);
        if (f === null || !ruleMatches(rule, { game, action, outcome })) continue;
        m *= f;
        touched.add(h.kind);
      }
    }
    mult[outcome] = m;
  }
  return { mult, touched: [...touched] };
}

/**
 * The happenings' points multiplier for a play (both sides), before the
 * caps, and which happenings it came from. Double Feature × Full Moon is ×4
 * here; scalePoints caps it.
 * @returns {{mult: number, kinds: string[]}}
 */
export function happeningPoints(live, play) {
  let mult = 1;
  const kinds = [];
  for (const h of live) {
    for (const rule of h.mods?.points || []) {
      const f = factor(rule?.mult);
      if (f === null || !ruleMatches(rule, play)) continue;
      mult *= f;
      if (!kinds.includes(h.kind)) kinds.push(h.kind);
    }
  }
  return { mult, kinds };
}

/**
 * A number-valued mod across the live happenings — multiplied (shieldMult,
 * twistMult) or added (goodBonus, `add: true`) — and the kinds that gave
 * it. A mod that changes nothing (×1, +0) gives no kind, so it never earns
 * a tag on the label.
 * @returns {{value: number, kinds: string[]}}
 */
export function happeningMod(live, key, { add = false } = {}) {
  let value = add ? 0 : 1;
  const kinds = [];
  for (const h of live) {
    const v = factor(h.mods?.[key]);
    if (v === null || v === (add ? 0 : 1)) continue;
    value = add ? value + v : value * v;
    kinds.push(h.kind);
  }
  return { value, kinds };
}

/** The live happenings that keep streaks through a bad outcome (Be Kind, Rewind) */
export const streakKeepers = (live) => live.filter(h => h.mods?.keepStreaks === true).map(h => h.kind);

// ── nights in a row ─────────────────────────────────────────────────────

/**
 * The night a moment belongs to, named by the UTC date it starts on: a
 * night runs 12:00 UTC to 12:00 UTC, so 23:00 and 02:00 UTC the next day
 * are the same night, and 13:00 is the next one.
 */
export const nightKey = (now) => new Date(now - NIGHT_START_HOUR * HOUR).toISOString().slice(0, 10);

/** Nights from one key to another: 1 = the next night, 0 = the same */
export const nightsBetween = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);

/** The night `n` nights after (or before, n < 0) a key */
export const shiftNight = (key, n) => new Date(Date.parse(key) + n * DAY).toISOString().slice(0, 10);

/** The tier a row of `n` nights is in, or null under the first */
export function nightTier(n) {
  let tier = null;
  for (const t of NIGHT_TIERS) if (n >= t.at) tier = t;
  return tier;
}

/** The next tier up from `n` nights, or null at the top */
export const nextNightTier = (n) => NIGHT_TIERS.find(t => n < t.at) || null;

/** Does reaching `n` nights in a row earn a Night Light? (3, then 10, 17, 24…) */
export function earnsNightLight(n) {
  const { first, every } = NIGHT_LIGHT_PRIZE;
  return n === first || (n > first && (n - first) % every === 0);
}

/** The row length that earns the next Night Light after `n` */
export function nextNightLightAt(n) {
  const { first, every } = NIGHT_LIGHT_PRIZE;
  if (n < first) return first;
  return first + every * (Math.floor((n - first) / every) + 1);
}

// ── titles ──────────────────────────────────────────────────────────────

/**
 * What titles count: a member's SCORED plays only, kept in
 * users[uid].lifetime = {
 *   do:  { game: { outcome: n } }   // their own scored plays
 *   got: { game: { outcome: n } }   // done to them by someone's scored play
 *   streak: { game: n }, bestStreak  // good outcomes in a row, scored plays only
 *   twists: n                        // R4: twists that happened to them, scored plays only
 * }
 *
 * Why not the all-time stats every card shows? Those count capped plays
 * too (a capped play still happens, for 0 points), and capped plays are
 * free: a member past the cap could throw 150 hits at a friend in an
 * afternoon and both would collect a +10 title. A capped play neither adds
 * to these counts nor extends or breaks this streak.
 *
 * A member with no `lifetime` yet (everyone, the day R3 arrives) starts
 * from their all-time stats — so veterans keep their credit, and get the
 * titles it already earns quietly (seedTitles in gameScores.js) — and
 * from then on only scored plays move it.
 */
export function lifetimeFrom(user) {
  const life = { do: {}, got: {}, streak: {}, bestStreak: 0 };
  for (const [game, periods] of Object.entries(user?.games || {})) {
    const all = periods?.all;
    if (!all) continue;
    if (Object.keys(all.counts || {}).length) life.do[game] = { ...all.counts };
    if (Object.keys(all.received || {}).length) life.got[game] = { ...all.received };
    if (all.streak) life.streak[game] = all.streak;
    life.bestStreak = Math.max(life.bestStreak, all.bestStreak || 0);
  }
  return life;
}

/** A member's title counts: stored, or what they'd start from */
export const lifetimeOf = (user) => user?.lifetime || lifetimeFrom(user);

/** Sum game → outcomes over one side ('do' or 'got') of the counts */
function summed(side, map) {
  let n = 0;
  for (const [game, outcomes] of Object.entries(map)) {
    for (const o of outcomes) n += side?.[game]?.[o] || 0;
  }
  return n;
}

/**
 * How far a member is toward a title (see TITLES in gameRewards.js for
 * what each kind reads), from their scored plays only (lifetimeFrom).
 */
export function titleProgress(user, title) {
  if (title.nights) return user?.nights?.best || 0;
  const life = lifetimeOf(user);
  if (title.streak) return life.bestStreak || 0;
  // R4: twists start at 0 for everyone (lifetimeFrom has none to find)
  if (title.twists) return life.twists || 0;
  return title.did ? summed(life.do, title.did) : summed(life.got, title.got || {});
}

export const qualifiesFor = (user, title) => titleProgress(user, title) >= title.need;

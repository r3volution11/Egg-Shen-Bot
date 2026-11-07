/**
 * The Six-Demon Bag's rules that need no storage (2.76.0, design §2–§3):
 * which blessing and hex are running on a member, the ward a hex leaves,
 * whether a cast may go ahead (and why not), what cancels what, and the
 * `element:` autocomplete. Pure, so the casting (gameScores.castCharm), the
 * play (gamePlay.resolvePlay, gameScores.recordPlay), the card and
 * /six-demon-bag status all read one rule instead of four copies of it.
 *
 * The numbers are gameRewards.js' CHI, MAGIC and CHARMS; the words
 * btilcLines.js' ELEMENTS and SIX_DEMON_BAG.
 *
 * A member's magic, in the scores file (gameScores.js keeps it):
 *   users[uid].chi      = { n }                    0..CHI.bag
 *   users[uid].charms   = { bless?, hex?, wardUntil?, peace?: {on, since} }
 *     bless = { el, by, byName, at, until, left, paid, endedAt? }
 *     hex   = { el, by|null, byName|null, at, until, left, endedAt? }
 *     (a separate slot from a twist's `effects`: a status and a charm of
 *     the same kind both wait their turn, design §3.3)
 *   users[uid].castLog  = [{ to, kind, el, at }]   the last MAGIC.castLogDays days
 *   users[uid].lifetime.magic = { paid, paidElements: [] }   blessings of yours that paid off
 *   daily[uid]: chi (play Chi today), helpChi, casts, hexes, hexRecv, shrugs
 * Everything missing reads as 0 or empty: there are no migrations.
 */

import { CHI, MAGIC, CHARMS, ELEMENT_OPPOSITE } from '../data/gameRewards.js';
import { ELEMENTS, ELEMENT_KEYS } from '../data/btilcLines.js';
import { owns, happeningMod, typedForm, resolveTyped } from './gameRules.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const CHARM_KINDS = Object.freeze(['bless', 'hex']);

/**
 * Is the bag on here? `settings.magic` is getGameSettings': the member
 * toggle (`/eggshen-config commands toggle setting:magic`). A settings
 * object without the key (a test's, DEFAULT_GAME_SETTINGS) reads as on, as
 * a config without the toggle does.
 */
export const magicOn = (settings) => settings?.magic !== false;
/** Can hexes land and act here? The bag on, and the admin's `hexes` switch (default on) */
export const hexesOn = (settings) => magicOn(settings) && settings?.hexes !== false;

/** 'Fired Up' / 'Scorched' */
export const charmName = (kind, el) => ELEMENTS[el][kind === 'bless' ? 'blessName' : 'hexName'];
/** '🔥 Fired Up': the {charm} placeholder */
export const charmLabel = (kind, el) => `${ELEMENTS[el].emoji} ${charmName(kind, el)}`;
/** One plain sentence: what it does */
export const charmAbout = (kind, el) => ELEMENTS[el][kind === 'bless' ? 'blessAbout' : 'hexAbout'];
/** How many uses a fresh charm has (CHARMS) */
export const charmPlays = (kind, el) => CHARMS[el][kind].plays;

/** A blessing and a hex cancel when their elements are the same or opposed (§3.2) */
export const cancels = (a, b) => owns(ELEMENT_OPPOSITE, a) && (a === b || ELEMENT_OPPOSITE[a] === b);

const isCharm = (c) => !!c && typeof c === 'object' && owns(ELEMENTS, c.el);

/** Still working: before its `until`, with a use left */
export const charmRunning = (c, now = Date.now()) => isCharm(c) && c.until > now && c.left > 0;

/**
 * The blessing and hex working on a member NOW: { bless?, hex? }. One past
 * its time, or used up, is over whether or not a save has pruned it. None
 * at all when the bag is switched off, and no hex while hexes are off — so
 * a switch takes effect on the very next play, not when a file is cleaned.
 * Read-only: the card and resolvePlay call it too.
 */
export function activeCharms(user, now = Date.now(), settings = null) {
  if (!magicOn(settings)) return {};
  const c = user?.charms;
  const out = {};
  if (charmRunning(c?.bless, now)) out.bless = c.bless;
  if (hexesOn(settings) && charmRunning(c?.hex, now)) out.hex = c.hex;
  return out;
}

/** When an ended charm ended: used up (`endedAt`, written as it happened), else its time */
const endedAt = (c) => (Number.isFinite(c?.endedAt) ? c.endedAt : c.until);

/**
 * Until when no hex can land on this member: the stored ward, or — for a
 * hex that's over but not yet pruned — when it ended plus MAGIC.wardHours.
 * So a hex that ran out at 3 a.m. wards its member until 6 whether or not
 * anything has saved their file since.
 */
export function wardOf(user, now = Date.now()) {
  const c = user?.charms;
  let ward = Number(c?.wardUntil) || 0;
  if (isCharm(c?.hex) && !charmRunning(c.hex, now)) ward = Math.max(ward, endedAt(c.hex) + MAGIC.wardHours * HOUR);
  return ward;
}

/** Use one of a charm's uses; the last one marks when it ended (for the ward) */
export function useCharm(c, now) {
  c.left = Math.max(0, (Number(c.left) || 0) - 1);
  if (c.left <= 0) c.endedAt = now;
  return c.left;
}

/** End a member's hex now (a shrug, a lift, a spoil, peace): gone, and warded MAGIC.wardHours from now */
export function endHex(user, now) {
  const c = user?.charms;
  if (!c?.hex) return null;
  const hex = c.hex;
  delete c.hex;
  c.wardUntil = Math.max(Number(c.wardUntil) || 0, now + MAGIC.wardHours * HOUR);
  return hex;
}

/**
 * Drop the charms that are over, writing the ward an ended hex leaves, so
 * the file only holds what's running. Returns those that ran out of TIME
 * unused, for the play line's "wore off" note: a blessing that never did a
 * thing, or a hex that ran its course.
 * @returns {Array<{kind, el, by, byName}>}
 */
export function pruneCharms(user, now = Date.now()) {
  const c = user?.charms;
  if (!c || typeof c !== 'object') return [];
  const expired = [];
  for (const kind of CHARM_KINDS) {
    const charm = c[kind];
    if (!charm) continue;
    if (charmRunning(charm, now)) continue;
    if (!isCharm(charm)) {
      delete c[kind];
      continue;
    }
    const timedOut = !Number.isFinite(charm.endedAt) && charm.left > 0;
    if (timedOut && (kind === 'hex' || charm.left >= charmPlays(kind, charm.el))) {
      expired.push({ kind, el: charm.el, by: charm.by ?? null, byName: charm.byName ?? null });
    }
    if (kind === 'hex') c.wardUntil = Math.max(Number(c.wardUntil) || 0, endedAt(charm) + MAGIC.wardHours * HOUR);
    delete c[kind];
  }
  if (Number(c.wardUntil) <= now) delete c.wardUntil;
  if (!c.peace?.on) delete c.peace;
  if (!Object.keys(c).length) delete user.charms;
  return expired;
}

/**
 * The caster's pay as the paid-off line says it: "+1", or "+1 Chi" with
 * MAGIC.casterPayIn 'chi' — and "+0 Chi" when their bag was already full
 * (the Chi can't fit; the blessing still counts as paid off)
 */
export const payText = (pay) => (Number.isFinite(pay?.chi) ? `+${pay.chi} Chi` : `+${pay?.points ?? 0}`);

/** At peace: no hexes either way (§3.4) */
export const atPeace = (user) => user?.charms?.peace?.on === true;

/** Chi in the bag */
export const chiOf = (user) => Math.max(0, Math.min(CHI.bag, Number(user?.chi?.n) || 0));

/**
 * What a cast costs now: CHI.cost less any happening's castDiscount (R6's
 * Tour Bus; none yet, so ×1 and 0 until then), never below 0
 */
export function castCost(kind, live = []) {
  const discount = happeningMod(live, 'castDiscount', { add: true }).value;
  return Math.max(0, CHI.cost[kind] - discount);
}

/** A caster's log, from `since` on */
const logSince = (user, since) => (Array.isArray(user?.castLog) ? user.castLog : []).filter(e => e && e.at > since);

/** Drop log entries past MAGIC.castLogDays (every write does this) */
export function pruneCastLog(user, now) {
  if (!Array.isArray(user?.castLog)) return;
  user.castLog = logSince(user, now - MAGIC.castLogDays * DAY);
  if (!user.castLog.length) delete user.castLog;
}

/** Would a blessing of `el` lift the hex on this member (same or opposed element)? */
export function wouldLift(target, el, now, settings) {
  const hex = activeCharms(target, now, settings).hex;
  return !!hex && cancels(el, hex.el);
}

/** Would a hex of `el` spoil this member's blessing? */
export function wouldSpoil(target, el, now, settings) {
  const bless = activeCharms(target, now, settings).bless;
  return !!bless && cancels(el, bless.el);
}

/**
 * Why this cast can't go ahead, or null — every refusal the design names,
 * in the brief's order (§5), each costing nothing: the command asks first,
 * read-only, and castCharm asks again inside its save.
 *   hex:   self, bot, hexesOff, peaceSelf, peaceTarget, inactive, fighting,
 *          alreadyHexed, warded, receivedLimit, pairLimit, castLimit,
 *          hexLimit, noChi
 *   bless: self, bot, fighterBless (only with MAGIC.fighterBlessing
 *          'refuse'), alreadyBlessed (not when it would lift a hex),
 *          blessPair, castLimit, noChi
 * @param {object} c
 * @param {'bless'|'hex'} c.kind
 * @param {string} c.el - an ELEMENTS key
 * @param {string} c.casterId
 * @param {string} c.targetId
 * @param {boolean} [c.targetBot]
 * @param {?object} c.caster - users[casterId] (or undefined)
 * @param {?object} c.target - users[targetId] (or undefined)
 * @param {{casts?: number, hexes?: number}} c.casterDay - the caster's counters today
 * @param {{hexRecv?: number}} c.targetDay - the target's counters today
 * @param {number} c.targetNights - nights the target played in the last MAGIC.inactiveDays
 * @param {boolean} [c.fighting] - the target is fighting a live siege
 * @param {object} [c.settings]
 * @param {number} c.cost - castCost(kind, …)
 * @param {object} [c.rules] - MAGIC by default (tests flip fighterBlessing / blessPair)
 * @returns {?{reason: string, when?: number, count?: number, chi?: number, need?: number}}
 */
export function castProblem(c, now = Date.now()) {
  const M = c.rules || MAGIC;
  if (c.casterId === c.targetId) return { reason: 'self' };
  if (c.targetBot) return { reason: 'bot' };
  const casts = c.casterDay?.casts || 0;
  const chi = chiOf(c.caster);
  if (c.kind === 'hex') {
    if (!hexesOn(c.settings)) return { reason: 'hexesOff' };
    if (atPeace(c.caster)) return { reason: 'peaceSelf' };
    if (atPeace(c.target)) return { reason: 'peaceTarget' };
    if (!(c.targetNights > 0)) return { reason: 'inactive' };
    if (c.fighting) return { reason: 'fighting' };
    if (activeCharms(c.target, now, c.settings).hex) return { reason: 'alreadyHexed' };
    const ward = wardOf(c.target, now);
    if (ward > now) return { reason: 'warded', when: ward };
    if ((c.targetDay?.hexRecv || 0) >= M.hexesReceivedPerDay) return { reason: 'receivedLimit', count: c.targetDay.hexRecv };
    const last = logSince(c.caster, now - M.hexPairHours * HOUR).filter(e => e.to === c.targetId && e.kind === 'hex').sort((a, b) => b.at - a.at)[0];
    if (last) return { reason: 'pairLimit', when: last.at + M.hexPairHours * HOUR };
    if (casts >= M.castsPerDay) return { reason: 'castLimit', count: casts };
    if ((c.casterDay?.hexes || 0) >= M.hexesPerDay) return { reason: 'hexLimit' };
  } else {
    if (c.fighting && M.fighterBlessing === 'refuse') return { reason: 'fighterBless' };
    if (activeCharms(c.target, now, c.settings).bless && !wouldLift(c.target, c.el, now, c.settings)) return { reason: 'alreadyBlessed' };
    if (M.blessPair) {
      const mine = logSince(c.caster, now - M.blessPair.days * DAY).filter(e => e.to === c.targetId && e.kind === 'bless').sort((a, b) => a.at - b.at);
      if (mine.length >= M.blessPair.max) return { reason: 'blessPair', count: mine.length, when: mine[mine.length - M.blessPair.max].at + M.blessPair.days * DAY };
    }
    if (casts >= M.castsPerDay) return { reason: 'castLimit', count: casts };
  }
  if (chi < c.cost) return { reason: 'noChi', chi, need: c.cost };
  return null;
}

// ── the autocomplete ────────────────────────────────────────────────────

/**
 * The `element:` choices for /six-demon-bag bless|hex: all six, each with
 * its charm and cost — `🔥 Fire · Fired Up (5 Chi)` — and, once the member
 * is picked, what it would do to THEM (§3.2): `🌧️ Rain · lifts Sam's 🔥
 * Scorched`, `💨 Wind · spoils Sam's 🌫️ Smoke Screen`. Never the full about
 * text (Thunder's is 113 characters; a choice name holds 100). Narrowed by
 * what's typed; typing something that matches nothing still shows all six.
 * The value is always the element's key.
 * @param {object} o
 * @param {'bless'|'hex'} o.kind
 * @param {string} [o.typed]
 * @param {?object} [o.target] - the member's stored user (for the hint), if picked
 * @param {?string} [o.targetName]
 * @param {number} [o.cost]
 * @param {object} [o.settings]
 * @returns {Array<{name: string, value: string}>}
 */
export function elementChoices({ kind, typed = '', target = null, targetName = null, cost = CHI.cost[kind], settings = null }, now = Date.now()) {
  const on = activeCharms(target, now, settings);
  const who = String(targetName || 'them').slice(0, 32);
  const choices = ELEMENT_KEYS.map((el) => {
    const e = ELEMENTS[el];
    let hint = `${charmName(kind, el)} (${cost} Chi)`;
    if (kind === 'bless' && on.hex && cancels(el, on.hex.el)) hint = `lifts ${who}'s ${charmLabel('hex', on.hex.el)}`;
    if (kind === 'hex' && on.bless && cancels(el, on.bless.el)) hint = `spoils ${who}'s ${charmLabel('bless', on.bless.el)}`;
    return { name: `${e.emoji} ${e.name} · ${hint}`.slice(0, 100), value: el };
  });
  const q = typedForm(typed);
  const matching = q ? choices.filter(ch => typedForm(ch.name).includes(q) || ch.value.includes(q)) : choices;
  return matching.length ? matching : choices;
}

/**
 * The element someone meant: the key, a name ("fire", "🔥 Fire"), a picked
 * choice's label pasted back, or the charm's own name ("Tailwind" for a
 * blessing, "Ill Wind" for a hex). Null for anything else.
 */
export function elementOf(value, kind) {
  const byName = resolveTyped(value, ELEMENTS, (e) => e.name);
  if (byName) return byName;
  return resolveTyped(value, ELEMENTS, (e) => (kind === 'hex' ? e.hexName : e.blessName));
}

/**
 * What's on a member, as the card and the status show it, blessing first:
 * [{ kind, el, label, about, byName, by, left, counts, until }] — `counts`
 * says whether `left` means plays (the ones that act more than once).
 */
export function charmsOn(user, now = Date.now(), settings = null) {
  const on = activeCharms(user, now, settings);
  return CHARM_KINDS.filter(k => on[k]).map((kind) => {
    const c = on[kind];
    return {
      kind, el: c.el, label: charmLabel(kind, c.el), about: charmAbout(kind, c.el),
      by: c.by ?? null, byName: c.byName ?? null, left: c.left, counts: charmPlays(kind, c.el) > 1, until: c.until,
    };
  });
}

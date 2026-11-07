/**
 * What R4's twists and happenings say: the `-#` lines under a play's points
 * line, the card's note for each status, and the one-liners the cards use
 * for a happening in progress. The numbers are in gameRewards.js (TWISTS,
 * TWIST_RULES) and the happenings themselves in gameHappenings.js; the
 * lines read them, so turning a tunable never leaves a sentence saying the
 * old number.
 *
 * Tone: PG-13 horror-comedy, the drive-in's own voice. Names are display
 * names, never mentions — the play's own line already pinged whoever it
 * should (gamePlay.js), and these are subtext.
 */

import { TWISTS, ITEMS, FULL_STACK_POINTS, MULTIPLIER_CAPS } from './gameRewards.js';
import { itemLabel } from './gameRewardLines.js';
import { TWISTS_BTILC, ELEMENTS, fill as fillBtilc } from './btilcLines.js';

/** +3, −3, ±0 — the points line's own signs */
const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '±0');

/**
 * "(2 more)" after a counting status fires; "(the last one)" when it's
 * spent. Exported for the Six-Demon Bag's counting charms (2.76.0), whose
 * lines take it as {left}.
 */
export const left = (n) => (n > 0 ? ` (${n} more)` : ' (the last one)');

/** {user} and {item} filled in. A function replacer: a name with "$&" in it stays as typed. */
const fill = (text, { user = 'Someone', item = '' } = {}) => text
  .replace(/\{user\}/g, () => user)
  .replace(/\{item\}/g, () => item);

// ── twists ──────────────────────────────────────────────────────────────

/** Each twist's flavour, {user} the player's name and {item} an item's */
export const TWIST_FLAVOUR = Object.freeze({
  loose: '{user} digs through the seat cushions and finds a few bucks and a Junior Mint of unknown age.',
  fan: 'The back row starts chanting {user}\'s name. Nobody knows why.',
  find: '{user} pops the glovebox and finds a {item} that definitely wasn\'t there before.',
  luckybreak: 'A black cat crosses {user}\'s path… backwards. That cancels out, right?',
  refill: 'The concession guy winks at {user}. Free refills all night.',
  dcut: 'The projectionist slips in {user}\'s extended cut.',
  secondwind: '{user} catches their breath behind the snack bar.',
  ghost: 'A friendly ghost starts following {user} around. It mostly just hums.',
  pickpocket: 'A raccoon in a tiny trench coat lifts {user}\'s wallet.',
  call: '{user} answers the snack-bar phone. Big mistake.',
  breakin: 'Someone jimmied {user}\'s glovebox and swiped the {item}. They left half a corn dog.',
  bitten: 'Something in the back seat bites {user}. It\'s probably fine.',
  jinxed: 'A black cat crosses {user}\'s path. Forwards. That\'s the bad one.',
  mosquito: 'Every mosquito in the county finds {user}.',
  reel: 'The film snaps mid-scene. Whatever {user} just earned goes up in projector smoke.',
  brainfreeze: '{user} chugs the slushie too fast. EVERYTHING HURTS.',
});

/** A loss a cap trimmed (the day's TWIST_RULES.dailyLoss, or the month's floor at 0) */
const trimmed = (t, key) => (t.points !== TWISTS[key].points ? ' (all a twist can take)' : '');

/**
 * What a twist did, after its flavour. `t` is recordPlay's result.twist;
 * a loss a cap trimmed (TWIST_RULES.dailyLoss, the month's floor at 0)
 * says so, rather than a "−3" line beside a −1 total.
 */
const TWIST_EFFECT = {
  loose: (t, u) => `${u} ${signed(t.points)}.`,
  fan: (t, u) => `${u} ${signed(t.points)}.`,
  find: (t, u) => (t.overflow ? `The Glovebox already holds ${ITEMS[t.item]?.cap}, so ${u} +${FULL_STACK_POINTS} instead.` : ''),
  luckybreak: (t, u) => `${u}'s next play can only go well.`,
  refill: (t, u) => `${signed(TWISTS.refill.points)} on each of ${u}'s good plays for the next ${TWISTS.refill.plays}.`,
  dcut: (t, u) => `${u}'s next good play scores double.`,
  secondwind: (t, u) => `${u}'s next bad play won't break their streak.`,
  ghost: (t, u) => `${u} is safe from /doom until <t:${Math.floor(t.until / 1000)}:t>.`,
  pickpocket: (t, u) => `${u} ${signed(t.points)}${trimmed(t, 'pickpocket')}.`,
  call: (t, u) => `${u} ${signed(t.points)}${trimmed(t, 'call')}.`,
  breakin: () => '',
  bitten: (t, u) => `${u}'s gains are halved for the next ${TWISTS.bitten.plays} plays.`,
  jinxed: (t, u) => `${u}'s next play rolls twice and keeps the worse.`,
  mosquito: (t, u) => `${u} ${signed(TWISTS.mosquito.points)} on each of the next ${TWISTS.mosquito.plays} plays.`,
  reel: (t, u) => `${u}'s ${signed(t.cancelled)} is gone.`,
  brainfreeze: (t, u) => `${u}'s ${t.gameName} streak of ${t.streak} is over.`,
  // 2.76.0 (3B): their words are btilcLines.TWISTS_BTILC's
  redEnvelope: (t, u) => fillBtilc(TWISTS_BTILC.redEnvelope.effect, { user: u, chi: t.chi }),
  chingDai: (t, u) => (ELEMENTS[t.el] ? fillBtilc(TWISTS_BTILC.chingDai.effect, { user: u, charm: `${ELEMENTS[t.el].emoji} ${ELEMENTS[t.el].hexName}` }) : ''),
};

/**
 * A twist's flavour: TWIST_FLAVOUR's one line, or (2.76.0) one of a Big
 * Trouble twist's three, by the index recordPlay drew (`t.line`)
 */
const flavourOf = (t) => TWIST_FLAVOUR[t.key] ?? TWISTS_BTILC[t.key]?.lines?.[Number(t.line) || 0] ?? '';

/**
 * The twist's line: "🎲 Twist! 💰 Loose Change: Sam digs through… Sam +3."
 * @param {object} t - recordPlay's result.twist
 * @param {string} user - the player's display name
 */
export function twistLine(t, user) {
  const twist = TWISTS[t.key];
  if (!twist) return '';
  const flavour = fill(flavourOf(t), { user, item: t.item ? itemLabel(t.item) : '' });
  const effect = TWIST_EFFECT[t.key]?.(t, user) || '';
  return `🎲 Twist! ${twist.emoji} ${twist.name}: ${[flavour, effect].filter(Boolean).join(' ')}`;
}

// ── statuses: what they do on a later play, and on the card ────────────

/**
 * The card's note for each status (gameCardData.js → "🌀 In effect").
 * The card is anyone's, so it says what the status does, not who has it.
 */
export const STATUS_NOTES = Object.freeze({
  luckybreak: 'the next play can only go well',
  refill: `${signed(TWISTS.refill.points)} on each good play`,
  dcut: 'the next good play scores double',
  secondwind: 'the next bad play keeps the streak',
  bitten: 'gains are halved',
  jinxed: 'the next play rolls twice and keeps the worse',
  mosquito: `${signed(TWISTS.mosquito.points)} on each play`,
});

/**
 * A status that acted on this play, as a line under it. `s` is one of
 * recordPlay's result.statuses; `u` the player's name.
 */
export const STATUS_USED = Object.freeze({
  luckybreak: (s, u) => `🍀 Lucky Break: ${u}'s play could only go well.`,
  jinxed: (s, u) => `🐈‍⬛ Jinxed: two draws, and ${u} got the worse one.`,
  dcut: (s, u) => (s.wasted
    ? `🎬 Director's Cut: used, but ${u}'s points were already at the ×${MULTIPLIER_CAPS.gain} most.`
    : `🎬 Director's Cut: ${u}'s points ×2.`),
  secondwind: (s, u) => `🔥 Second Wind: ${u}'s streak survives.`,
  refill: (s, u) => `🍿 Free Refill: ${u} ${signed(s.points)}${left(s.left)}.`,
  bitten: (s, u) => `🧛 Bitten: ${u}'s ${signed(s.before)} is halved to ${signed(s.after)}${left(s.left)}.`,
  mosquito: (s, u) => `🦟 Mosquito Swarm: ${u} ${signed(s.points)}${left(s.left)}.`,
});

// ── happenings ──────────────────────────────────────────────────────────

/** What a happening did to this play, under it */
export const HAPPENING_LINES = Object.freeze({
  // goodBonus (Friday the 13th): "🔪 Friday the 13th: Sam +1."
  goodBonus: (h, u, n) => `${h.emoji} ${h.name}: ${u} ${signed(n)}.`,
  // keepStreaks (Be Kind, Rewind)
  keptStreak: (h, u) => `${h.emoji} ${h.name}: ${u}'s streak survives.`,
});

/**
 * A calendar happening, said once per member per UTC day on their first
 * play: "🎃 Halloween Night: twists are twice as likely today."
 */
export const CALENDAR_TODAY = Object.freeze({
  halloween: 'twists are twice as likely today',
  friday13: 'bad luck is likelier today, but every good play scores +1',
});

export const calendarLine = (h) =>
  `${h.emoji} ${h.name}: ${CALENDAR_TODAY[h.kind] || shortOf(h)}.`;

/** A few words for each happening, for the cards' one-liners */
export const HAPPENING_SHORT = Object.freeze({
  fullmoon: 'dooms score double',
  happyhour: 'feeds are tastier',
  fog: 'throws miss more',
  doublefeature: 'every point counts twice',
  sunrise: 'rescues rarely get caught, shields last 2×',
  madscience: 'potions backfire half as often',
  rewind: 'bad plays don\'t break streaks',
  intermission: 'twists are 3× as likely',
  halloween: 'twists are twice as likely',
  friday13: 'bad luck is likelier, good plays +1',
});

/** A happening's few words: its own, or its `about` without the full stop */
function shortOf(h) {
  if (Object.hasOwn(HAPPENING_SHORT, h?.kind)) return HAPPENING_SHORT[h.kind];
  const about = String(h?.about || '').trim().replace(/\.$/, '');
  return about ? about[0].toLowerCase() + about.slice(1) : 'something\'s going on';
}

/**
 * One line for a happening in progress, on the game card and the
 * leaderboard: "🌕 Full Moon: dooms score double · ends <t:…:R>". A
 * calendar one has no end time: it's on all day.
 */
export function happeningLine(h) {
  const when = Number.isFinite(h?.endsAt) ? `ends <t:${Math.floor(h.endsAt / 1000)}:R>` : 'all day';
  return `${[h?.emoji, h?.name].filter(Boolean).join(' ')}: ${shortOf(h)} · ${when}`;
}

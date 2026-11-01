/**
 * The games' rewards (R3): items, recurring prizes, titles, nights in a
 * row, and the caps that keep them in proportion. Every number Doug might
 * want to turn is here; the words are in gameRewardLines.js; the rules
 * that use them are in src/utils/gameRules.js (pure) and
 * src/utils/gameScores.js (recordPlay, one save per play).
 *
 * The numbers come from the balance simulation in the plan (80 runs of a
 * 15-player server over 30 days, on the real outcome odds in the line
 * files): a typical member gets an item about every 2.2 days and about 28%
 * of their points from bonuses. Change one and the other moves.
 */

// ── items ───────────────────────────────────────────────────────────────

/**
 * The Glovebox items, in the order the card lists them.
 *   cap      - how many one member can hold; a prize past it becomes
 *              FULL_STACK_POINTS instead
 *   passive  - fires by itself (a defence, or the Night Light); active
 *              items are chosen with a play's `item:` option
 *   game     - the one game an active item works in
 *   kit      - its emoji kit code (src/utils/emojiKit.js KIT_CODES)
 *   about    - one short line for the card's Glovebox
 * Items can't be traded: there is deliberately no way to move one.
 */
export const ITEMS = Object.freeze({
  gpie: { name: 'Golden Pie', emoji: '🥧', cap: 3, passive: false, game: 'foodfight', kit: 'gpie', about: 'Throw: a sure hit, your points ×2. Feed: sure tasty, +2 each.' },
  vhs: { name: 'Cursed VHS', emoji: '📼', cap: 2, passive: false, game: 'doom', kit: 'vhs', about: 'A doom that can\'t backfire; cuts through Garlic and shields. Your points ×2.' },
  garlic: { name: 'Garlic', emoji: '🧄', cap: 1, passive: true, game: null, kit: 'garlic', about: 'Turns a doom on you into an escape. 12 h cooldown.' },
  holyw: { name: 'Holy Water', emoji: '💧', cap: 2, passive: false, game: 'rescue', kit: 'holyw', about: 'A rescue that can\'t be caught: +2 more, and a shield 3× as long.' },
  penny: { name: 'Lucky Penny', emoji: '🍀', cap: 3, passive: false, game: 'potion', kit: 'penny', about: 'The potion works, and your points ×2.' },
  antid: { name: 'Antidote', emoji: '💊', cap: 2, passive: true, game: null, kit: 'antid', about: 'A harmful potion does you no harm. 6 h cooldown.' },
  // Defined now so the card can show it; nothing gives one or uses one
  // until /siege (R5/R6). Never offered outside a siege.
  silver: { name: 'Silver Bullet', emoji: '🥈', cap: 2, passive: false, game: 'siege', kit: 'silver', about: 'Siege only: can\'t backfire, damage ×3.' },
  nlight: { name: 'Night Light', emoji: '🔦', cap: 1, passive: true, game: null, kit: 'nlight', about: 'Saves your nights row when you miss a night. Once a week.' },
});

/**
 * What an active item does, per play (the game's action). Absent = the
 * item doesn't fit that play.
 *   weights     - outcome weights for pickLine: 0 takes those lines out
 *                 of the draw, anything unlisted stays at 1, so what's
 *                 left keeps the line file's own odds
 *   gain        - multiplies YOUR gains (never your losses, never the
 *                 target's points), capped with everything else at
 *                 MULTIPLIER_CAPS.gain
 *   actorPlus / targetPlus - flat points added after the multipliers
 *   shieldTimes - a rescue's shield lasts this many times as long
 *   ignoresDefences - goes through the rescue shield (using it up) and Garlic
 *   short       - the autocomplete's few words ("🥧 Golden Pie ×2 · can't miss")
 */
export const ITEM_EFFECTS = Object.freeze({
  gpie: {
    throw: { weights: { miss: 0, backfire: 0 }, gain: 2, short: 'can\'t miss, points ×2' },
    feed: { weights: { gross: 0, spill: 0 }, actorPlus: 2, targetPlus: 2, short: 'always tasty, +2 each' },
  },
  vhs: {
    fate: { weights: { backfired: 0 }, gain: 2, ignoresDefences: true, short: 'can\'t backfire, beats shields, points ×2' },
  },
  holyw: {
    attempt: { weights: { caught: 0 }, actorPlus: 2, shieldTimes: 3, short: 'can\'t be caught, +2, shield 3×' },
  },
  penny: {
    // Potion lines are tagged worked/backfired before they're scored
    give: { weights: { backfired: 0 }, gain: 2, short: 'always works, points ×2' },
  },
});

/** Garlic and the Antidote: what fires them is in gameScores.js */
export const DEFENCES = Object.freeze({
  garlic: { cooldownHours: 12 },
  // A harmful potion that works on an Antidote holder: [giver, receiver]
  // instead of POINTS.potion.hurt's [2, −2]
  antid: { cooldownHours: 6, points: [1, 0] },
});

// ── caps ────────────────────────────────────────────────────────────────

export const DAILY = Object.freeze({
  itemUses: 3, // active items used, per member per UTC day
  prizes: 2, // recurring prizes (not Night Lights), per member per UTC day
  // Defences fired for one member per UTC day — the rescue shield, Garlic
  // and the Antidote together — so nobody becomes immune
  defences: 3,
});

/** A prize item that doesn't fit the stack becomes this many points */
export const FULL_STACK_POINTS = 2;

/** Each title is worth this, once, when it's earned */
export const TITLE_POINTS = 10;

/**
 * However many things multiply a play (items now; R4's happenings and
 * Director's Cut later), the product is capped: your gains at ×3, your
 * losses at ×2, the target's points at ×2. Items never make a target lose
 * more.
 */
export const MULTIPLIER_CAPS = Object.freeze({ gain: 3, loss: 2, target: 2 });

// ── recurring prizes ────────────────────────────────────────────────────

/**
 * Counters in users[uid].progress, each counting toward its next prize
 * and starting at 0 for everyone (no retroactive items). Only the member's
 * OWN scored plays count, except `points`, which also counts the positive
 * points a member gains as a target. Listed in the card's order.
 *   outcomes - which of `game`'s outcomes count one each
 *   item     - the prize; null = a random one of RANDOM_PRIZE_ITEMS (luck)
 *   points   - given with the item
 */
export const PRIZES = Object.freeze([
  { key: 'hits', game: 'foodfight', label: 'Hits', noun: 'hits', outcomes: ['hit'], need: 25, item: 'gpie', points: 3 },
  { key: 'tasty', game: 'foodfight', label: 'Tasty feeds', noun: 'tasty feeds', outcomes: ['tasty'], need: 15, item: 'garlic', points: 3 },
  { key: 'dooms', game: 'doom', label: 'Dooms', noun: 'dooms', outcomes: ['doomed'], need: 25, item: 'vhs', points: 3 },
  { key: 'rescues', game: 'rescue', label: 'Rescues', noun: 'rescues', outcomes: ['rescued', 'sacrificed'], need: 15, item: 'holyw', points: 3 },
  { key: 'helpful', game: 'potion', label: 'Helpful potions', noun: 'helpful potions', outcomes: ['helped'], need: 15, item: 'antid', points: 3 },
  { key: 'harmful', game: 'potion', label: 'Harmful potions', noun: 'harmful potions', outcomes: ['hurt'], need: 20, item: 'penny', points: 3 },
  // Positive play points, as the player or the target. Not prizes,
  // titles, nights or overflow: a bonus can't feed the counter that pays
  // bonuses.
  { key: 'points', game: null, label: 'Points', noun: 'points', outcomes: [], need: 750, item: null, points: 0 },
]);

/** What the 750-points prize draws from (luck) */
export const RANDOM_PRIZE_ITEMS = Object.freeze(['gpie', 'garlic', 'vhs', 'holyw', 'antid', 'penny']);

// ── nights in a row ─────────────────────────────────────────────────────

/**
 * A night runs NIGHT_START_HOUR to NIGHT_START_HOUR UTC, so a US evening
 * watch party, which crosses midnight UTC, is one night.
 */
export const NIGHT_START_HOUR = 12;

/** The card's row of nights, and how many night keys are kept */
export const NIGHTS_SHOWN = 14;

/** A Night Light burns at most once in any this many days */
export const NIGHT_LIGHT_DAYS = 7;

/** The row earns a Night Light on reaching `first`, then every `every` more (3, 10, 17, 24…) */
export const NIGHT_LIGHT_PRIZE = Object.freeze({ first: 3, every: 7 });

/**
 * Tiers by nights in a row. Each gives +1 on your first `buffs` GOOD
 * outcomes each UTC day.
 */
export const NIGHT_TIERS = Object.freeze([
  { key: 'regular', name: 'Regular', emoji: '🌙', at: 3, buffs: 3 },
  { key: 'owl', name: 'Night Owl', emoji: '🦉', at: 7, buffs: 4 },
  { key: 'creature', name: 'Creature of the Night', emoji: '🌕', at: 14, buffs: 5 },
]);

// ── titles ──────────────────────────────────────────────────────────────

/**
 * Titles, checked against what's already stored all-time: `did` counts
 * your own outcomes (games[g].all.counts), `got` what was done to you
 * (games[g].all.received), `streak` your best streak in any game, and
 * `nights` your best nights in a row. Each maps game → outcomes summed.
 * Siege and twist titles join in the releases that create them: one entry
 * each.
 */
export const TITLES = Object.freeze([
  { key: 'pie-sniper', title: 'Pie Sniper', badge: '🥧', need: 150, did: { foodfight: ['hit'] } },
  { key: 'lunch-lady', title: 'Lunch Lady', badge: '🍳', need: 75, did: { foodfight: ['tasty'] } },
  { key: 'grim-reaper', title: 'The Grim Reaper', badge: '💀', need: 1000, did: { doom: ['doomed'] } },
  { key: 'final-girl', title: 'Final Girl', badge: '🔪', need: 100, did: { rescue: ['rescued', 'sacrificed'] } },
  { key: 'martyr', title: 'Martyr Complex', badge: '🕯️', need: 30, did: { rescue: ['sacrificed'] } },
  { key: 'mad-scientist', title: 'Mad Scientist', badge: '🧪', need: 150, did: { potion: ['helped', 'hurt'] } },
  { key: 'night-nurse', title: 'Night Nurse', badge: '🩺', need: 75, did: { potion: ['helped'] } },
  { key: 'boomerang', title: 'Boomerang', badge: '🔄', need: 150, did: { foodfight: ['backfire', 'spill'], doom: ['backfired'], potion: ['backfired'] } },
  { key: 'dartboard', title: 'Human Dartboard', badge: '🎯', need: 150, got: { foodfight: ['hit'] } },
  { key: 'red-shirt', title: 'Red Shirt', badge: '👕', need: 100, got: { doom: ['doomed'] } },
  { key: 'taster', title: 'Designated Taster', badge: '🍽️', need: 50, got: { foodfight: ['tasty', 'gross'] } },
  { key: 'guinea-pig', title: 'Guinea Pig', badge: '🐹', need: 150, got: { potion: ['helped', 'hurt'] } },
  { key: 'hostage', title: 'Professional Hostage', badge: '🪢', need: 100, got: { rescue: ['rescued', 'sacrificed'] } },
  { key: 'cockroach', title: 'Cockroach', badge: '🪳', need: 50, got: { doom: ['escaped'] } },
  { key: 'on-fire', title: 'On Fire', badge: '🔥', need: 10, streak: true },
  { key: 'unstoppable', title: 'Unstoppable', badge: '🌋', need: 15, streak: true },
  { key: 'night-owl', title: 'Night Owl', badge: '🦉', need: 7, nights: true },
  { key: 'creature', title: 'Creature of the Night', badge: '🌕', need: 14, nights: true },
  { key: 'undead', title: 'Undead Regular', badge: '🧟', need: 30, nights: true },
]);

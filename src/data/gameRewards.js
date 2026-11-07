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

// The Big Trouble titles' words (key, title, badge) live with the rest of
// the expansion's words; their numbers (need, counter) are here
import { TITLES_BTILC, ITEMS_BTILC, TWISTS_BTILC } from './btilcLines.js';

/**
 * 2.76.0, OPEN QUESTION 1 for Doug (R3 brief §13), the one switch: does R3
 * ship "3B" — the 🧿 Jade Charm item and its Blessings prize (12 blessings
 * that paid off), the "All That Kind of Thing" title, and the 🧧 Red
 * Envelope / 🀄 Ching Dai's Curse twists? The default is yes: they were in
 * the design's measured economy (§8.2: Jade Charms add ~0.7 items a month).
 * false leaves every one of them out of ITEMS, DEFENCES, PRIZES, TITLES and
 * TWISTS (the twist pool goes back to 72 good / 60 bad), and nothing else
 * reads them: the engine only ever looks them up through those tables.
 */
export const BAG_3B = true;

/** (3B) Blessings that paid off for a Jade Charm: the Blessings prize's `need`, and MAGIC.jadeNeed */
const JADE_NEED = 12;

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
  // Won as siege loot (R5) and used only in `/siege attack`: never offered
  // outside a siege (SIEGE_ITEM_EFFECTS says what it does there)
  silver: { name: 'Silver Bullet', emoji: '🥈', cap: 2, passive: false, game: 'siege', kit: 'silver', about: 'Siege only: can\'t backfire, damage ×3.' },
  nlight: { name: 'Night Light', emoji: '🔦', cap: 1, passive: true, game: null, kit: 'nlight', about: 'Saves your nights row when you miss a night. Once a week.' },
  // 2.76.0 (3B): turns aside the next hex cast on its holder — fired by
  // castCharm, never by a play — then a DEFENCES.jade cooldown. Only from
  // the Blessings prize: not in RANDOM_PRIZE_ITEMS, so no Glovebox Find or
  // siege loot turns one up
  ...(BAG_3B ? { jade: { name: ITEMS_BTILC.jadeCharm.name, emoji: ITEMS_BTILC.jadeCharm.emoji, cap: 1, passive: true, game: null, kit: 'jade', about: ITEMS_BTILC.jadeCharm.about } } : {}),
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
  // 2.76.0 (3B): the Jade Charm, fired by a hex cast at its holder (castCharm)
  ...(BAG_3B ? { jade: { cooldownHours: 24 } } : {}),
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
 * However many things multiply a play (items, R4's happenings and
 * Director's Cut), the product is capped: your gains at ×3, your losses at
 * ×2, the target's points at ×2. Items never make a target lose more. A
 * rescue's shield is capped the same way: Holy Water's 3× and Sunrise's 2×
 * would be 6× anyway, but a third shield-stretcher mustn't make it 12×.
 */
export const MULTIPLIER_CAPS = Object.freeze({ gain: 3, loss: 2, target: 2, shield: 6 });

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
  // 2.76.0 (3B): blessings YOU cast that paid off (the caster's pay, §3.1),
  // counted for the caster when they pay — never by a play's outcome, and
  // hexes never count. Inside the daily prize cap like any prize; the card
  // and /how-to-play leave it out where /six-demon-bag is switched off
  ...(BAG_3B ? [{ key: 'blessings', game: null, label: 'Blessings paid off', noun: 'blessings', outcomes: [], need: JADE_NEED, item: 'jade', points: 3 }] : []),
  // R6: siege wins (lifetime.siege.wins), counted by applySiegeResult when
  // a win is paid — outside the daily prize cap, as a win is rare enough
  { key: 'siegewins', game: 'siege', label: 'Siege wins', noun: 'siege wins', outcomes: [], need: 4, item: 'silver', points: 10 },
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
 * (games[g].all.received), `streak` your best streak in any game,
 * `nights` your best nights in a row, `twists` (R4) the twists that
 * happened to you, and `siege` (R5) one of the siege counters. Each
 * `did`/`got` maps game → outcomes summed.
 */

/** A Big Trouble title's words — key, title, badge — from btilcLines.TITLES_BTILC (its `about` is the docs') */
function btilcTitle(key) {
  const t = TITLES_BTILC.find(x => x.key === key);
  if (!t) throw new Error(`No Big Trouble title "${key}" in btilcLines.TITLES_BTILC`);
  return { key: t.key, title: t.title, badge: t.badge };
}

/**
 * OPEN QUESTION 2 for Doug (R2 brief §9), the one switch: does the Wang Chi
 * title (5) count the MVPs a member earned BEFORE 2.75.0?
 *   'mvps'     (the default, the design's counter): yes — a veteran with 5
 *              MVPs earns it, +10, at their next title check
 *   'wangChis' no — only Wang Chis from 2.75.0 on (applySiegeResult counts
 *              them beside `mvps` from the deploy, so this can be flipped
 *              later without losing any)
 * Siege MVP and Legend keep `mvps` either way: titles already earned stay.
 */
export const WANG_CHI_TITLE_COUNTER = 'mvps';

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
  // R4: twists that happened to you, scored plays only (lifetime.twists)
  { key: 'plot-twist', title: 'Plot Twist', badge: '🎲', need: 30, twists: true },
  // R5: sieges (lifetime.siege, moved only by finishSiege): `siege` names
  // the counter — wins (every fighter of a monster beaten), mvps, and kaiju
  // (every fighter of a beaten SIEGE.kaiju). 2.75.0: the MVP became the
  // Wang Chi (most help, design §5), and `mvps` counts Wang Chis from then
  // on, so Siege MVP and Legend carry on with "be the Wang Chi" as their
  // requirement (btilcLines.TITLE_ABOUT_UPDATES); `jacks` counts the Jack
  // Burton (the killing blow of a won siege)
  { key: 'monster-hunter', title: 'Monster Hunter', badge: '🗡️', need: 10, siege: 'wins' },
  { key: 'siege-mvp', title: 'Siege MVP', badge: '🏆', need: 1, siege: 'mvps' },
  { ...btilcTitle('wang-chi'), need: 5, siege: WANG_CHI_TITLE_COUNTER },
  { key: 'legend', title: 'Legend of the Drive-In', badge: '👑', need: 10, siege: 'mvps' },
  { ...btilcTitle('everybody-relax'), need: 10, siege: 'jacks' },
  { key: 'kaiju-killer', title: 'Kaiju Killer', badge: '🦖', need: 1, siege: 'kaiju' },
  // R6: fighters freed plus poisons cured, from scored /rescue and /potion
  // plays (lifetime.siege.assists); and times the monster grabbed you
  // (lifetime.siege.grabbed, counted when the grab is announced)
  { key: 'field-medic', title: 'Field Medic', badge: '🩹', need: 15, siege: 'assists' },
  { key: 'monster-chow', title: 'Monster Chow', badge: '🍖', need: 10, siege: 'grabbed' },
  // 2.76.0 (3B): blessings of every element that paid off for their caster
  // (lifetime.magic.paidElements, a set kept as a list). `magic` names the
  // counter; a list counts its length. Hexes earn no title (design §3.4)
  ...(BAG_3B ? [{ ...btilcTitle('wind-fire'), need: 6, magic: 'paidElements' }] : []),
]);

// ── sieges (R5) ─────────────────────────────────────────────────────────

/**
 * /siege: a monster the whole server fights together. The monsters (HP
 * and damage multipliers, traits, words) are in siegeMonsters.js; the
 * rules that use these numbers in src/utils/siegeStore.js. Every number
 * below is binding from the plan's balance run (it settles at 64–75% wins
 * on servers of 5 to 43 players) — change one and the win rate moves.
 */
export const SIEGE = Object.freeze({
  /**
   * An attack reuses a game's own lines, re-tagged: `weapon:food` draws a
   * random food's THROW lines, `doom` a random trope's, `potion` a random
   * harmful potion type's. A line whose outcome isn't listed (a custom
   * feed line, say) can't be drawn in a siege.
   */
  outcomes: Object.freeze({
    food: Object.freeze({ hit: 'splat', miss: 'splash', backfire: 'splatback' }),
    doom: Object.freeze({ doomed: 'smite', escaped: 'dodged', backfired: 'spooked' }),
    potion: Object.freeze({ worked: 'poisoned', backfired: 'fizzled' }),
  }),
  /** The game each weapon is: switched off for a member, it can't be used on the monster */
  weaponGame: Object.freeze({ food: 'foodfight', doom: 'doom', potion: 'potion' }),
  /**
   * Damage before the monster's multipliers. A backfire does none, and a
   * spooked doom leaves its thrower Spooked (the next attack does
   * `spookedMult` of its damage).
   */
  damage: Object.freeze({ splat: 8, splash: 3, splatback: 0, smite: 16, dodged: 0, spooked: 0, poisoned: 4, fizzled: 0 }),
  spookedMult: 0.5,
  /**
   * A potion that works also poisons the monster: `perMinute` damage for
   * `minutes`, credited to whoever gave it. One poison per fighter; a new
   * one restarts theirs. Only the monster's traits.poisonMult changes it.
   */
  poison: Object.freeze({ perMinute: 2, minutes: 5 }),
  /** The Silver Bullet's damage multiplier, unless the monster has its own (traits.silverMult) */
  silverMult: 3,
  /** Attacks a day that score points, per member (UTC); later ones still do damage */
  scoredPerDay: 30,
  /**
   * HP = round(clamp((perActive·A7 + perFighter·F)·D, min, max) · monster.hp)
   * A7: members with a play in the last `activeDays` days; F: fighters so
   * far (0 at the start); D: the server's dial. Each new fighter's first
   * attack adds round(perFighter·D·monster.hp) to max and current HP, never
   * past the `max` ceiling.
   */
  hp: Object.freeze({ perActive: 2, perFighter: 45, min: 40, max: 2000, activeDays: 7 }),
  /**
   * A fighter who joins in the last this-many minutes doesn't grow the
   * monster: a newcomer's last-second first attack (even one that does no
   * damage) mustn't hand the monster the HP it needs to get away.
   */
  noGrowthLastMinutes: 5,
  /**
   * The difficulty dial, per server, kept next to the siege. After a win or
   * an escape with at least `minFighters`, ×win or ×escape, clamped. An
   * escape lowers it only when the fighters dealt at least
   * `dialEscapeMinDamage` of its max HP: two members who let sieges walk
   * away without trying mustn't make every later monster trivial (and the
   * floor is 0.5, not lower, for the same reason).
   */
  dial: Object.freeze({ start: 1, win: 1.05, escape: 0.88, min: 0.5, max: 2.5, minFighters: 2 }),
  dialEscapeMinDamage: 0.5,
  /** How long a siege lasts, unless the monster says (monster.minutes) or the admin picks */
  minutes: Object.freeze({ default: 45, min: 30, max: 60 }),
  /**
   * A win: a pool of `perFighter` points per fighter (between poolMin and
   * poolMax) split by each one's share of the contribution, each between
   * eachMin and eachMax. Then the honours (2.75.0, design §5: "the flashy
   * one gets a laugh, and the helper gets paid"), each × the siege's pace
   * (`t.honour`, H: 1 at quick, evening and day, 2 at 3 days, 3 at a week):
   *   the Wang Chi    the fighter with the most HELP (siegeStore.helpOf:
   *                   frees, cures, boosts), at least `wangChiMinHelp` (one
   *                   cure) — or, when nobody helped that much, the top
   *                   contributor, who "held the line" — gets `wangChiBonus`
   *                   and loot for sure. The old MVP's +5 is gone: the MVP
   *                   BECAME the Wang Chi (Doug, 2026-11-03), and
   *                   lifetime.siege.mvps counts Wang Chis
   *   the Jack Burton the killing blow (an attack or a poison tick): a laugh
   *                   and `jackBonus`. The Wang Chi can be both.
   * Anyone else with at least `lootShare` of the contribution has a
   * `lootChance` (× the monster's traits.loot). Loot is a Silver Bullet
   * `silverChance` of the time, else one of RANDOM_PRIZE_ITEMS. A siege won
   * by ONE fighter pays the pool share only — no honours, no loot, and no
   * win, Wang Chi or kaiju on their record: siege titles need company.
   */
  rewards: Object.freeze({
    perFighter: 8, poolMin: 24, poolMax: 200, eachMin: 2, eachMax: 30,
    wangChiBonus: 8, jackBonus: 3, wangChiMinHelp: 8,
    silverChance: 0.3, lootChance: 0.25, lootShare: 0.05,
  }),
  /**
   * Win rewards (the pool share, the honours, loot, and the siege counters
   * titles are earned from) are paid for at most this many sieges per
   * member per UTC day. Admins can start sieges back to back, and one
   * friend fighting alone earned every siege title in under an hour; past
   * the limit an attack still does damage and scores its own points. At a
   * pot pace (2.74.0) those points went into the pot, so a win held back is
   * paid what its attacks would have scored instead (applySiegeResult). A
   * backer's stake and payout aren't rewards (it's their own points): never
   * held back.
   */
  rewardedPerDay: 2,
  /** An escape costs every fighter who attacked this much — only when at least `minFighters` fought */
  escape: Object.freeze({ loss: 3, minFighters: 2 }),
  /**
   * Contribution (the pool share) = damage + help; help (the Wang Chi's
   * measure, siegeStore.helpOf) = free × fighters freed + cure × poisons
   * cured + boost × boosted attacks that landed (R4's blessings; none
   * before then).
   *
   * `unscoredPerNight` (2.75.0): a free or cure from a /rescue or /potion
   * play past the game's daily scoring cap still frees or cures — saving a
   * friend is never blocked — but only this many a member a NIGHT (12:00
   * UTC) count toward their share and their help. Without it, help was the
   * one part of a siege nothing capped, and the Wang Chi's +8×H and sure
   * loot could be farmed by two friends taking turns to be grabbed (the R1
   * review). OPEN QUESTION 1 for Doug (R2 brief §9): 2 is the default; 0
   * credits none past the cap.
   */
  credit: Object.freeze({ free: 12, cure: 8, boost: 3, unscoredPerNight: 2 }),
  /**
   * Backing a fighter (2.75.0, design §4.3): `/siege back fighter: points:`
   * stakes `min`–`max` of your own points on someone else in the fight,
   * taken at once (the siege game, as bonus). Only in the first `window` of
   * the siege's time (its own start to end, so a week campaign's ends with
   * its night boundary, not "3½ days"), nobody backs the obvious leader at
   * the end. `perDay` backing a UTC day and one a siege; you need the stake
   * in this month's points and `activeNights` of the last `activeWindow`
   * nights played (a regular, not an alt made for it). Settled at the finish:
   *   won, ≥ `minFighters`: the Wang Chi → `payout` × the stake back (net
   *     +stake), and the fighter +⌈largest stake on them × `fighterShare`⌉,
   *     once a siege; top 3 by contribution or the Jack Burton → the stake
   *     back (a push); anyone else → lost
   *   escaped, ≥ `minFighters`: lost
   *   called off, or fewer than `minFighters` fought: the stake back
   * EV is slightly negative unless you spot the real hero (the design's
   * sim: a typical member −0.9 a month).
   */
  backing: Object.freeze({
    min: 2, max: 10, window: 0.5, perDay: 1, minFighters: 3, activeNights: 3, activeWindow: 7, payout: 2, fighterShare: 0.5,
  }),
  /**
   * R6: the monster fights back. Every `everyMinutes` (the first that long
   * after the start) it acts: a grab, a poison or a roar, by `weights`
   * (or the monster's traits.actWeights). A grab needs /rescue on for
   * members and a poison /potion; otherwise it roars. It only acts on
   * fighters who have attacked and are free, never grabs the last free one,
   * and an action whose ping wasn't sent within `voidSeconds` is void.
   */
  actions: Object.freeze({
    everyMinutes: 5,
    weights: Object.freeze({ grab: 50, poison: 35, roar: 15 }),
    voidSeconds: 90,
  }),
  /** A grabbed fighter can't attack; not freed (by another member's /rescue) in `freeMinutes`: −`loss` (month floor 0) and out */
  grab: Object.freeze({ freeMinutes: 10, loss: 5 }),
  /** A poisoned fighter's attacks do `mult` damage until cured (another member's helpful /potion, or an Antidote) or `minutes` pass */
  poisoned: Object.freeze({ mult: 0.5, minutes: 15 }),
  /**
   * Random sieges (the scheduler), by the server's siegeFrequency: about
   * `perWeek` a week on a server that plays most evenings. At least
   * `gapHours` after the last one ended, never during a happening, and only
   * with `minRecent` members who played in the last `recentMinutes` and
   * `minDay` in the last 24 hours. A random siege's win pool is scaled by
   * min(1, poolScaleAt / perWeek), so `often` doesn't simply pay more.
   */
  random: Object.freeze({
    perWeek: Object.freeze({ off: 0, rare: 1.5, normal: 3, often: 5 }),
    gapHours: 20,
    recentMinutes: 30,
    minRecent: 2,
    minDay: 3,
    poolScaleAt: 3,
  }),
  /** The monster whose defeat counts toward Kaiju Killer */
  kaiju: 'lizard',
  /** The card is edited at most this often while the fight goes on */
  cardEditSeconds: 60,
  /** Lines kept in the card's log */
  logKeep: 5,
  /** Fighters pinged by the results message, at most */
  pingMax: 20,
  /** Tries at posting the results before giving up (a channel gone, permissions lost) */
  resultTries: 10,
  /**
   * A results claim older than this with no message recorded was cut short
   * by a restart mid-send: it's given up (never sent twice), as a
   * happening's late announcement is, so the next siege can start.
   */
  resultClaimMinutes: 2,
  /**
   * An arrival card claimed this long ago with no message recorded: the
   * bot died (or Discord timed out) around the send. The pass looks for the
   * card in the channel; if it isn't there, nobody saw the monster, and the
   * siege is called off quietly.
   */
  cardClaimMinutes: 2,
});

/**
 * 2.75.0 at deploy. A siege that started on 2.74 has no `honours` stamp
 * (spawnSiege sets it from 2.75.0 on). OPEN QUESTION 3 for Doug (R2 brief
 * §9), the one switch — when it finishes it pays:
 *   'wangChi' (the default) the Wang Chi rules, like every siege after it:
 *             its frees and cures already count, its H is on `s.t`, and it
 *             has no backers (backing opened with the deploy)
 *   'mvp'     the old MVP's: the top contributor +`mvpBonus` × H and loot
 *             for sure; no Wang Chi chosen by help, no Jack Burton
 */
export const SIEGE_R2_DEPLOY = Object.freeze({ liveAtDeploy: 'wangChi', mvpBonus: 5 });

// ── pace (2.74.0): how long the games' events take ─────────────────────

/**
 * Doug, 2026-11-03: "the game is happening too quickly." Each server picks a
 * pace (`/eggshen-config-games happenings pace:`, read through
 * getGameSettings; a server that never chose is on `week`), and every
 * siege and happening timing comes from it. Twists, cooldowns, the daily
 * caps and statuses stay per play at every pace.
 *
 * A siege takes the preset NEAREST its length on a log scale
 * (gamePace.siegeTimings: 5 days takes week's), and that preset is copied
 * onto the siege record when it starts (`siege.t`). A running siege reads
 * only its copy, so changing the pace never touches one in progress — and
 * a siege from before 2.74 has no copy, and reads `quick`: today's rules,
 * exactly, which is why quick's numbers point at SIEGE's.
 *
 * The derivation (design §0.2) — `S` is the length:
 *   actEvery    the monster acts every clamp(S/16, 5, 30) minutes; from
 *               `evening` on, BUSY minutes: its clock only runs while
 *               someone has attacked in the last `busyMinutes`, so every
 *               grab and poison lands while people are playing, never at
 *               3 a.m. (quick keeps the wall clock: in 45 minutes it's the same)
 *   freeMinutes a grabbed fighter must be freed within ≈ S/7 (10 min–22 h)
 *   poisonMinutes a poisoning wears off after ≈ 1.5 × that (15 min–22 h)
 *   outMinutes  a digested fighter is out for this long, then back in;
 *               null: out for the rest of the siege (as before 2.74)
 *   noGrowth    no growth from fighters in the last ≈ S/9 (5 min–24 h)
 *   allowance   attacks a member may make a NIGHT (12:00 to 12:00 UTC, as
 *               fighter-nights and the report count them; null: no limit,
 *               the first SIEGE.scoredPerDay a UTC day score); freeing and
 *               curing are /rescue and /potion plays, with those games' own
 *               caps, and never count. Doug set week's to 8 (2026-11-04;
 *               designed at 4).
 *   pot         an attack's own points go into the pot — the win pool,
 *               paid at the end by contribution — instead of to the
 *               attacker. Still a scored play (items, streak, nights).
 *   hp          HP = round(clamp((base·B·N + growth·FN)·D, min, max·N) ·
 *               monster.hp): N the nights in the siege (≥ 1), FN fighters
 *               (`growthPer: 'fighter'`, quick: each once) or fighter-nights
 *               (`'night'`: each member's first attack each night), D the
 *               dial, and B, by `hpBase`:
 *                 'members'  A7, members who played in the last 7 days
 *                            (quick and evening: a small base, the HP is
 *                            the fighters'; quick's is 2.73's formula)
 *                 'fighters' E, the fighters the server can expect:
 *                            clamp(round(A7 × participation), 2, A7), the
 *                            participation learned from its own finished
 *                            campaigns (PACE_RULES.participation)
 *               A long siege's damage per fighter-night is capped by the
 *               allowance, so its HP is mostly base: with growth alone, win
 *               or lose was a cliff (+20% HP took wins from 52% to 4%). But
 *               a base on A7 assumed every member fights: a fighter-night of
 *               8 attacks deals at most ~96, a week's base was 94.5 per
 *               member, and a server of 60 with 8 fighters could never win
 *               (review, 2026-11-04). So from `day` on the base counts the
 *               fighters it expects, and learns how many come.
 *   pool        the win pool: `perFighter` points a fighter (quick) or a
 *               fighter-night, between poolMin and poolMax, each fighter's
 *               share at most eachMax
 *   honour      H: the Wang Chi's and the Jack Burton's bonuses × this
 *               (2.75.0; the MVP's before), stored on the siege with the
 *               rest of `t`: about 3 campaigns a month at week pace against
 *               10 quick sieges, so each honour is worth more
 *   dial        the server's dial for this preset (siegeDials) moves ×win
 *               or ×escape; bigger steps where sieges are rarer, chosen so
 *               the long-run win rate ln(1/esc)/(ln win + ln(1/esc)) ≈ 72%.
 *               An escape only eases it when the fighters tried: they
 *               dealt SIEGE.dialEscapeMinDamage of its HP (at quick the only
 *               test, as before) or, with an allowance, used
 *               PACE_RULES.escapeEffort of the attacks their fighter-nights
 *               allowed. From `day` on a campaign whose turnout explains
 *               its end leaves it alone: that teaches the participation
 *   gapHours    a random siege waits this long after the last one ended
 *               (rare ×2, often ×½ — see gamePace.randomGapHours); quick
 *               and evening keep SIEGE.random.perWeek's chance instead
 *   report      a daily report each night (a NEW message, pinging nobody)
 *   nightEnd    the siege ends at the night boundary (NIGHT_START_HOUR UTC)
 *               after its length: a week-long campaign never escapes at 4 a.m.
 *   holdResults an escape's results wait for the next game played on the
 *               server (or `holdResultsHours`); a win posts at once
 *   cardEditSeconds the card is edited at most this often: edits never
 *               notify, so a campaign's card needn't move every minute
 *   happenings  how long a random happening lasts (`k` × its minutes, at
 *               most 24 h) and whether its limits are per day or per week
 *   heal        × a monster's per-event heals: Gremlins' traits.missHeal
 *               (each missed throw) and the Wolfman's traits.actHeal (each
 *               action). They were sized for a 45-minute siege's ~40
 *               attacks and ~9 actions; a week has ~300 and ~50, and healed
 *               about half its HP back (review sweep, 2026-11-04). Scaled
 *               so a whole siege heals about what a quick one does.
 *
 * The HP numbers were tuned on the real engine (tests/harness/balanceSim.js,
 * whose campaigns run over days): 26 months of a 15-player server and 52 of
 * a 5-player one per preset, with the allowances Doug set (week 8 a night),
 * re-tuned after the review (2026-11-05). Wins in a fresh server's first
 * month, 15 / 5 players — from its second campaign on in brackets, as a
 * fresh server's first is sized on a guess — and a typical member's bonus +
 * siege share:
 *   quick   81% / 59%, 24% (2.73.0's game, unchanged: the fuzz's baseline)
 *   evening 77% / 69%, 27% / 27%
 *   day     70% / 72% (66% / 69%), 24% / 28%
 *   3 days  74% / 65% (69% / 60%), 25% / 26%
 *   week    83% / 80% (77% / 70%), 25% / 26%
 * and over 90 days with the dial free: evening 72% / 71%, day 71% / 72%,
 * 3 days 74% / 73%, week 78% / 76%, shares 28–30% (targets: 55–85%,
 * ≤ 35%). A fresh server's first campaign is easy (it expects 35% of A7 to
 * fight); it has learned by the third. With 15%, 35% or 70% of A7 fighting,
 * on 15- and 60-member servers, a week campaign wins 61–75% from the third
 * on (pooled; 39 seeds a cell, 78 for 60 members at 70%), each campaign
 * number within a few points of that as the dial's ×1.10 / ×0.78 steps
 * settle (the table is in the 2.74 report).
 * `npm run test:fuzz -- --testPathPattern game-balance` holds week and quick
 * to the targets; BALANCE_PACES=all all five.
 */
export const SIEGE_PACE_KEYS = Object.freeze(['quick', 'evening', 'day', 'days3', 'week']);

const quickPace = Object.freeze({
  key: 'quick', name: 'Quick', span: SIEGE.minutes.default,
  busy: false, actEvery: SIEGE.actions.everyMinutes,
  freeMinutes: SIEGE.grab.freeMinutes, poisonMinutes: SIEGE.poisoned.minutes, outMinutes: null,
  noGrowth: SIEGE.noGrowthLastMinutes, allowance: null, pot: false,
  hpBase: 'members', base: SIEGE.hp.perActive, growth: SIEGE.hp.perFighter, growthPer: 'fighter',
  pool: Object.freeze({ perFighter: SIEGE.rewards.perFighter, poolMin: SIEGE.rewards.poolMin, poolMax: SIEGE.rewards.poolMax, eachMax: SIEGE.rewards.eachMax }),
  honour: 1, dial: Object.freeze({ win: SIEGE.dial.win, escape: SIEGE.dial.escape }),
  gapHours: SIEGE.random.gapHours, report: false, nightEnd: false, holdResults: false,
  cardEditSeconds: SIEGE.cardEditSeconds,
  happenings: Object.freeze({ k: 1, per: 'day' }),
  heal: Object.freeze({ miss: 1, act: 1 }),
});

export const SIEGE_PACES = Object.freeze({
  quick: quickPace,
  evening: Object.freeze({
    key: 'evening', name: 'Evening', span: 240,
    busy: true, actEvery: 15,
    freeMinutes: 30, poisonMinutes: 45, outMinutes: null,
    noGrowth: 30, allowance: 20, pot: false,
    hpBase: 'members', base: 2, growth: 60, growthPer: 'night',
    pool: Object.freeze({ perFighter: 6, poolMin: 24, poolMax: 200, eachMax: 30 }),
    honour: 1, dial: Object.freeze({ win: 1.05, escape: 0.88 }),
    gapHours: 20, report: false, nightEnd: false, holdResults: false,
    cardEditSeconds: 60,
    happenings: Object.freeze({ k: 4, per: 'day' }),
    heal: Object.freeze({ miss: 0.5, act: 0.9 }),
  }),
  day: Object.freeze({
    key: 'day', name: 'Day', span: 1440,
    busy: true, actEvery: 30,
    freeMinutes: 180, poisonMinutes: 240, outMinutes: null,
    noGrowth: 180, allowance: 12, pot: true,
    hpBase: 'fighters', base: 53, growth: 40, growthPer: 'night',
    pool: Object.freeze({ perFighter: 6, poolMin: 24, poolMax: 200, eachMax: 30 }),
    honour: 1, dial: Object.freeze({ win: 1.08, escape: 0.82 }),
    gapHours: 48, report: true, nightEnd: false, holdResults: true,
    cardEditSeconds: 600,
    happenings: Object.freeze({ k: 24, per: 'week' }),
    heal: Object.freeze({ miss: 0.3, act: 0.5 }),
  }),
  days3: Object.freeze({
    key: 'days3', name: '3 days', span: 3 * 1440,
    busy: true, actEvery: 30,
    freeMinutes: 600, poisonMinutes: 900, outMinutes: 1440,
    noGrowth: 480, allowance: 10, pot: true,
    hpBase: 'fighters', base: 18, growth: 34, growthPer: 'night',
    pool: Object.freeze({ perFighter: 5, poolMin: 24, poolMax: 600, eachMax: 45 }),
    honour: 2, dial: Object.freeze({ win: 1.10, escape: 0.78 }),
    gapHours: 48, report: true, nightEnd: true, holdResults: true,
    cardEditSeconds: 600,
    happenings: Object.freeze({ k: 24, per: 'week' }),
    heal: Object.freeze({ miss: 0.2, act: 0.3 }),
  }),
  week: Object.freeze({
    key: 'week', name: 'Week', span: 7 * 1440,
    busy: true, actEvery: 30,
    freeMinutes: 1320, poisonMinutes: 1320, outMinutes: 1440,
    noGrowth: 1440, allowance: 8, pot: true,
    hpBase: 'fighters', base: 13.5, growth: 27, growthPer: 'night',
    pool: Object.freeze({ perFighter: 4, poolMin: 24, poolMax: 1400, eachMax: 60 }),
    honour: 3, dial: Object.freeze({ win: 1.10, escape: 0.78 }),
    gapHours: 72, report: true, nightEnd: true, holdResults: true,
    cardEditSeconds: 600,
    happenings: Object.freeze({ k: 24, per: 'week' }),
    heal: Object.freeze({ miss: 0.15, act: 0.2 }),
  }),
});

/**
 * What every pace shares. `busyMinutes`: an attack this recent makes the
 * siege busy. `holdResultsHours`: an escape's held results post by then
 * even if nobody plays. `reportLatestHours`: the daily report waits for the
 * first game played after the night boundary, or this long at the latest
 * (12:00 UTC + 12 h = 00:00 UTC, a US evening).
 */
export const PACE_RULES = Object.freeze({
  busyMinutes: 30,
  /**
   * From `day` on, how many of A7 a campaign can expect to fight (hpBase
   * 'fighters'): learned per server and pace from its finished campaigns —
   * an EWMA of the members who attacked ÷ A7 as it ended, `weight` the
   * newest's — kept beside the dials (siegeParticipation). It starts low
   * (`start`): a first campaign that's too easy costs a few points, one
   * that's unwinnable costs everyone 3 and teaches nothing. The first
   * finished campaign replaces that guess outright (`first`): at 0.7 a
   * small server where everyone fights still expected 75% of them in its
   * second campaign, won it 98 times in 100, and raised the dial for its
   * third (re-tune, 2026-11-05). A campaign whose turnout missed by more
   * than `sized` of who came, and more than `slack` fighters, the way that
   * explains its end — it escaped with fewer than expected, or was won with
   * more — leaves the dial alone: that's the estimate's to learn
   * (siegeStore.turnoutExplains; the slack leans the players' way).
   */
  participation: Object.freeze({ start: 0.35, first: 1, weight: 0.7, min: 0.02, sized: 0.25, slack: Object.freeze({ escaped: 2, won: 1 }) }),
  /**
   * With an allowance, an escape eases the dial when the fighters used at
   * least this share of the attacks their fighter-nights allowed — or took
   * SIEGE.dialEscapeMinDamage of its HP (siegeStore.nextDial): two members
   * who join and walk away mustn't make every monster trivial
   */
  escapeEffort: 0.6,
  /**
   * A night boundary this soon after a 3-day or week campaign starts isn't
   * one of its nights (gamePace.campaignNight): an 11:59 start would
   * otherwise report "Night 1 is over" a minute later, and run a day short.
   * Its hours before the first boundary that counts are its night 1 for the
   * allowance and growth too (gamePace.campaignNightKey).
   */
  firstNightMinHours: 6,
  /**
   * A day siege's one 12:00 UTC gets a report if it comes at least this
   * long after the start. The 6 hours above left one started 06:00–12:00
   * UTC with no report at all (review, 2026-11-06); a day siege's length
   * doesn't hang on it, so only the minutes-old report is ruled out.
   */
  dayReportMinHours: 1,
  holdResultsHours: 12,
  reportLatestHours: 12,
  // The last few nights' tallies kept on a siege for its daily report
  nightsKept: 3,
  // Tries at a night's report Discord refused for now (429, 5xx) before giving that night up
  reportTries: 3,
  // From `day` on, once the gap has passed, a random campaign starts with
  // this chance a busy minute: 1 − (1 − p)^240 ≈ 70% within an evening
  randomChance: 0.005,
});

/**
 * What an item does in a siege attack, by weapon — like ITEM_EFFECTS, but
 * for the siege's own outcomes. The game items narrow the draw exactly as
 * they do in their own game (a Golden Pie can't miss) and nothing more: a
 * siege's points come from the fight, not the item. The Silver Bullet only
 * works here: it can't backfire, and its damage is SIEGE.silverMult (or
 * the monster's traits.silverMult).
 *   weights - outcome weights for pickLine, as ITEM_EFFECTS
 *   silver  - the damage multiplier applies
 *   short   - the autocomplete's few words
 */
export const SIEGE_ITEM_EFFECTS = Object.freeze({
  gpie: Object.freeze({ food: Object.freeze({ weights: { splash: 0, splatback: 0 }, short: 'a sure splat' }) }),
  vhs: Object.freeze({ doom: Object.freeze({ weights: { spooked: 0 }, short: 'can\'t backfire' }) }),
  penny: Object.freeze({ potion: Object.freeze({ weights: { fizzled: 0 }, short: 'the poison always works' }) }),
  silver: Object.freeze({
    food: Object.freeze({ weights: { splatback: 0 }, silver: true, short: 'can\'t backfire, damage ×3' }),
    doom: Object.freeze({ weights: { spooked: 0 }, silver: true, short: 'can\'t backfire, damage ×3' }),
    potion: Object.freeze({ weights: { fizzled: 0 }, silver: true, short: 'can\'t backfire, damage ×3' }),
  }),
});

// ── twists (R4) ─────────────────────────────────────────────────────────

/**
 * Twists: on a scored play, a small chance (settings.twistPercent, 4% by
 * default, ×twistMult during some happenings) that something happens to
 * the PLAYER — never their target. One luck() draw decides whether one
 * fires, one which (by `weight`), and one more picks an item where a twist
 * needs one. Good ones weigh 72 and bad ones 60 in all (78 and 65 with
 * 2.76.0's two, BAG_3B), so a bit over half are good before "the twist
 * after a bad one is always good" tips it further.
 *   good    - which pool it's in (and what lastTwistBad remembers)
 *   weight  - its share of the draw among the twists that can fire now
 *   points  - flat points now (loose, fan, pickpocket, call), or per play
 *             while the status lasts (refill +1 on good plays, mosquito −1)
 *   status  - leaves a status in users[uid].effects for later plays; a
 *             repeat refreshes it (playsLeft back to `plays`, 24 h again)
 *             rather than stacking
 *   plays   - how many scored plays a counting status lasts
 *   opposite - setting this status clears that one (Lucky Break and
 *             Jinxed can't both shape the same draw)
 * The words — flavour, what it did, the card's note — are in
 * gameEventLines.js.
 */
export const TWISTS = Object.freeze({
  // Good [72]
  loose: { name: 'Loose Change', emoji: '💰', good: true, weight: 16, points: 3 },
  fan: { name: 'Fan Favorite', emoji: '🌟', good: true, weight: 6, points: 5 },
  find: { name: 'Glovebox Find', emoji: '🎁', good: true, weight: 6 },
  luckybreak: { name: 'Lucky Break', emoji: '🍀', good: true, weight: 10, status: true, opposite: 'jinxed' },
  refill: { name: 'Free Refill', emoji: '🍿', good: true, weight: 10, status: true, plays: 3, points: 1 },
  dcut: { name: 'Director\'s Cut', emoji: '🎬', good: true, weight: 8, status: true },
  secondwind: { name: 'Second Wind', emoji: '🔥', good: true, weight: 8, status: true },
  ghost: { name: 'Friendly Ghost', emoji: '👻', good: true, weight: 8 },
  // 2.76.0 (3B): CHI.redEnvelope Chi, outside the day's Chi cap (good [78])
  ...(BAG_3B ? { redEnvelope: { name: TWISTS_BTILC.redEnvelope.name, emoji: TWISTS_BTILC.redEnvelope.emoji, good: true, weight: 6 } } : {}),
  // Bad [60]
  pickpocket: { name: 'Pickpocketed', emoji: '🦝', good: false, weight: 10, points: -3 },
  call: { name: 'The Call Is Coming From Inside the House', emoji: '📞', good: false, weight: 5, points: -4 },
  breakin: { name: 'Car Break-In', emoji: '🚗', good: false, weight: 4 },
  bitten: { name: 'Bitten', emoji: '🧛', good: false, weight: 10, status: true, plays: 3 },
  jinxed: { name: 'Jinxed', emoji: '🐈‍⬛', good: false, weight: 9, status: true, opposite: 'luckybreak' },
  mosquito: { name: 'Mosquito Swarm', emoji: '🦟', good: false, weight: 8, status: true, plays: 3, points: -1 },
  reel: { name: 'Reel Change', emoji: '🎞️', good: false, weight: 7 },
  brainfreeze: { name: 'Brain Freeze', emoji: '🧊', good: false, weight: 7 },
  // 2.76.0 (3B): a hex of a random element for MAGIC.hexHours, with no
  // caster (bad [65]: the pool keeps its 54% good share)
  ...(BAG_3B ? { chingDai: { name: TWISTS_BTILC.chingDai.name, emoji: TWISTS_BTILC.chingDai.emoji, good: false, weight: 5 } } : {}),
});

export const TWIST_RULES = Object.freeze({
  perDay: 3, // twists per member per UTC day (daily[uid].twists)
  // Points twists can take from a member per UTC day, all twists together
  // (Pickpocketed, The Call, each Mosquito bite) — and never below 0 for
  // the month: a twist is a joke at your expense, not a way to lose a month
  dailyLoss: 8,
  statusHours: 24, // an unused status runs out after this
  ghostMinutes: 30, // Friendly Ghost's shield from /doom
  // What a Glovebox Find can turn up: the prize items (no Silver Bullet
  // before /siege, no Night Light — that's the nights row's own prize)
  findItems: RANDOM_PRIZE_ITEMS,
  // What a Car Break-In can never take: the Night Light is the row's
  // safety net, and losing it to a raccoon would undo weeks of nights.
  // 2.76.0 (Doug, 2026-11-07): the Jade Charm too — it takes 12 blessings
  // that paid off to earn, and is never a random prize or loot to replace
  safe: Object.freeze(['nlight', 'jade']),
});

// ── the Six-Demon Bag (2.76.0) ──────────────────────────────────────────

/**
 * Chi: the bag's fuel (design §2). Earned by playing well and, most of all,
 * by helping in a siege; spent on /six-demon-bag. Every number here was in
 * the design's measured economy (§8.2), and none is scaled by the pace: a
 * week server's allowance (8 attacks a night) only reaches the daily cap a
 * little sooner.
 *   earn / earnOutcomes  +earn on a SCORED play with one of these outcomes,
 *                        in any game — a siege attack too, pot or not. A
 *                        sacrifice is a good deed even though it costs you
 *   help / helpPerDay    +help for freeing or curing a siege fighter (a
 *                        credited assist), at most helpPerDay a UTC day —
 *                        apart from the play's own Chi and its cap
 *   perDay               play Chi a UTC day (daily[uid].chi), × a
 *                        happening's chiMult (none yet: R6's Tour Bus)
 *   bag                  the most a member holds; Chi past it is lost
 *   cost                 Chi a cast takes (− a happening's castDiscount);
 *                        a shrug after the day's free one; magic is R4's
 *   redEnvelope          the 🧧 twist's Chi, outside the day's cap (3B)
 * There's no decay: the bag's ceiling is the sink.
 */
export const CHI = Object.freeze({
  earn: 1,
  earnOutcomes: Object.freeze(['hit', 'tasty', 'doomed', 'rescued', 'sacrificed', 'helped', 'hurt', 'splat', 'smite', 'poisoned']),
  help: 2,
  helpPerDay: 6,
  perDay: 4,
  bag: 20,
  cost: Object.freeze({ bless: 6, hex: 7, shrug: 2, magic: 2 /* R4: /siege attack weapon:magic */ }),
  redEnvelope: 4,
});

/**
 * Casting, and what keeps hexes from becoming harassment (design §3.1, §3.4).
 * Daily counts are per UTC day (daily[uid]), like every games cap — the
 * siege's allowance resets at 12:00 UTC (2.74.0) instead; that's deliberate.
 *   castsPerDay, hexesPerDay  a member's casts a day, and how many of them may be hexes
 *   blessHours, hexHours      how long an unused blessing / hex lasts
 *   wardHours                 after a hex on someone ENDS (used, shrugged,
 *                             expired, lifted, spoiled), no hex can land on
 *                             them for this long
 *   hexPairHours              one caster hexes one member at most once in this
 *   blessPair                 OPEN QUESTION 2 for Doug (R3 brief §13): one
 *                             caster blesses one member at most `max` times
 *                             in `days` (design §8.3's anti-farming limit for
 *                             two alts). null switches it off
 *   hexesReceivedPerDay       hexes one member can take in a UTC day
 *   peaceLockDays             peace, once made, can't be unmade for this long
 *   inactiveDays              nobody is hexed who hasn't had a scored play in this many nights
 *   casterPay / casterPayIn   a blessing that does something pays its caster,
 *                             once: `casterPay` bonus points (in that play's
 *                             game, or for a cast-time payoff the caster's
 *                             home game) — or, with casterPayIn 'chi', that
 *                             much Chi instead (the brief's first balance
 *                             knob, if a share ran past 35%)
 *   freeShrugsPerDay          shrugs a UTC day that cost nothing
 *   castLogDays               how long a caster's casts are remembered (the pair limits)
 *   smokePotionPoints         a harmful potion lost in a Smoke Screen: [giver,
 *                             receiver], as the Antidote's
 *   jadeNeed                  (3B) blessings paid off for a Jade Charm: PRIZES' own `need`
 *   fighterBlessing           OPEN QUESTION 3 for Doug (R3 brief §13): until
 *                             R4's boosts, a blessing on a live siege fighter
 *                             is an ordinary blessing ('ordinary', the
 *                             default: it never touches their attacks), or is
 *                             refused at no cost ('refuse')
 */
export const MAGIC = Object.freeze({
  castsPerDay: 2,
  hexesPerDay: 1,
  blessHours: 24,
  hexHours: 12,
  wardHours: 3,
  hexPairHours: 72,
  blessPair: Object.freeze({ max: 3, days: 7 }),
  hexesReceivedPerDay: 2,
  peaceLockDays: 7,
  inactiveDays: 7,
  casterPay: 1,
  casterPayIn: 'chi',
  freeShrugsPerDay: 1,
  castLogDays: 7,
  smokePotionPoints: Object.freeze([1, 0]),
  jadeNeed: JADE_NEED,
  fighterBlessing: 'ordinary',
});

/** The three opposed pairs: a blessing and a hex of the same element or its opposite cancel (§3.2) */
export const ELEMENT_OPPOSITE = Object.freeze({ rain: 'fire', fire: 'rain', wind: 'smoke', smoke: 'wind', lightning: 'thunder', thunder: 'lightning' });

/** Each element's emoji-kit code (src/utils/emojiKit.js KIT_CODES) */
export const ELEMENT_KIT = Object.freeze({ lightning: 'elite', thunder: 'ethund', rain: 'erain', wind: 'ewind', fire: 'efire', smoke: 'esmoke' });

/**
 * What each charm does, by element and kind (§3.1; the words are
 * btilcLines.ELEMENTS). `plays` is how many uses it has — what counts as one
 * is the element's (gameMagic.js says, and recordPlay applies):
 *   wind      Tailwind: the next acting play's bad lines are out of the draw ·
 *             Ill Wind: the next acting play is drawn twice, the worse kept
 *   fire      Fired Up: `points` on each good one of the next 3 acting plays ·
 *             Scorched: `points` on each of the next 3 (a twist loss)
 *   lightning Lightning Strike: the next GOOD acting play's gain × `gain` ·
 *             Static: gains halved on the next 2 acting plays
 *   thunder   Thunderous Applause: the next good help at a member × `target`
 *             for whoever is helped · Deafened: the next 5 plays that would
 *             earn Chi earn none
 *   rain      Cleansing Rain: washes `wash` off at the cast, then keeps the
 *             streak through the next bad play that has one · Rained Out: the
 *             next 2 good acting plays don't grow the streak
 *   smoke     Smoke Screen: the next harmful play aimed at its holder is lost
 *             (a defence) · Lost in the Smoke: the next 2 acting plays aimed
 *             at a member score only the player
 */
export const CHARMS = Object.freeze({
  wind: Object.freeze({ bless: Object.freeze({ plays: 1 }), hex: Object.freeze({ plays: 1 }) }),
  fire: Object.freeze({ bless: Object.freeze({ plays: 3, points: 1 }), hex: Object.freeze({ plays: 3, points: -1 }) }),
  lightning: Object.freeze({ bless: Object.freeze({ plays: 1, gain: 2 }), hex: Object.freeze({ plays: 2 }) }),
  thunder: Object.freeze({ bless: Object.freeze({ plays: 1, target: 2 }), hex: Object.freeze({ plays: 5 }) }),
  rain: Object.freeze({ bless: Object.freeze({ plays: 1, wash: Object.freeze(['bitten', 'jinxed', 'mosquito']) }), hex: Object.freeze({ plays: 2 }) }),
  smoke: Object.freeze({ bless: Object.freeze({ plays: 1 }), hex: Object.freeze({ plays: 2 }) }),
});

/**
 * Happenings: server-wide events that bend the games for a while — a Full
 * Moon doubles dooms, The Fog makes throws miss. Random ones are started by
 * the happening scheduler (src/utils/happeningScheduler.js) and announced
 * with a NEW message (edits never notify); calendar ones (Halloween, Friday
 * the 13th) just are, all day, worked out from the date.
 *
 * This file is the shared contract between the scheduler (which starts,
 * announces and ends them) and the play rules (gamePlay.resolvePlay /
 * gameScores.recordPlay, which apply `mods`). Numbers come from the balance
 * simulation in the plan (80 runs of a 15-player server): at `normal`
 * frequency a busy server sees about one random happening a day.
 *
 * `mods`, all optional:
 * - weights: [{ game?, action?, outcome? | bad?: true, mult }] — multiply
 *   the draw weight of matching lines (resolvePlay). `bad: true` matches
 *   every outcome not in GOOD (and not 'blocked').
 * - points:  [{ game?, action?, outcome?, mult }] — multiply BOTH sides'
 *   points on a matching play (recordPlay; inside MULTIPLIER_CAPS).
 * - goodBonus: n — the player gets +n on a good outcome.
 * - shieldMult: n — a rescue's shield lasts n× as long.
 * - keepStreaks: true — a bad outcome doesn't end a streak.
 * - twistMult: n — twists are n× as likely (R4 twists).
 *
 * `minutes` is how long one lasts at quick pace; at a slower pace it's ×k
 * (gamePace.happeningMinutes: an evening's 4×, a day+ pace's 24×, at most
 * 24 hours). An `announce` line says how long with `{for}` ("the next
 * hour"), filled in from the happening's own start and end.
 *
 * A siege attack never sees a happening (siege.js passes none), and from
 * day pace on happenings run during campaigns, so a line whose words would
 * take one in — every point, throws, potions, your streak — says "(not
 * siege attacks)". Double Feature promised twice the points to a server in
 * the middle of a week's siege (review, 2026-11-06).
 */

export const HAPPENINGS = Object.freeze({
  fullmoon: {
    name: 'Full Moon', emoji: '🌕', minutes: 60, rate: 0.25, minPlayers: 2,
    tag: '🌕×2',
    about: 'Dooms score double, both ways.',
    announce: '🌕 **The moon is full over the Drive-In.** For {for} every /doom scores double, both ways. Lock your car doors.',
    ended: '🌕 The moon slips behind the clouds. Dooms are back to normal.',
    mods: { points: [{ game: 'doom', mult: 2 }] },
  },
  happyhour: {
    name: 'Happy Hour', emoji: '🍻', minutes: 60, rate: 0.35, minPlayers: 2,
    tag: '🍻',
    about: 'Feeds are tastier: fewer gross or spilled, tasty scores double.',
    announce: '🍻 **Happy Hour at the snack bar!** For {for}, /foodfight feed is tastier and nobody\'s dropping their tray.',
    ended: '🍻 Last call. Happy Hour is over.',
    mods: {
      weights: [
        { game: 'foodfight', action: 'feed', outcome: 'gross', mult: 0.5 },
        { game: 'foodfight', action: 'feed', outcome: 'spill', mult: 0.5 },
      ],
      points: [{ game: 'foodfight', outcome: 'tasty', mult: 2 }],
    },
  },
  fog: {
    name: 'The Fog', emoji: '🌫️', minutes: 45, rate: 0.25, minPlayers: 2,
    tag: '🌫️',
    about: 'Throws miss far more often (not siege attacks).',
    announce: '🌫️ **A thick fog rolls over the lot.** For {for} you can\'t see the screen, or who you\'re throwing at. Throws miss a lot more (not siege attacks).',
    ended: '🌫️ The fog lifts. You can see who you\'re aiming at again.',
    mods: {
      weights: [
        { game: 'foodfight', action: 'throw', outcome: 'hit', mult: 0.6 },
        { game: 'foodfight', action: 'throw', outcome: 'miss', mult: 2 },
      ],
    },
  },
  doublefeature: {
    name: 'Double Feature', emoji: '🎞️', minutes: 30, rate: 0.08, minPlayers: 3,
    tag: '🎞️×2',
    about: 'Every point counts twice (not siege attacks).',
    announce: '🎞️ **DOUBLE FEATURE!** Every point in every game counts twice for {for} (not siege attacks).',
    ended: '🎞️ The second feature\'s over. Points are back to normal.',
    mods: { points: [{ mult: 2 }] },
  },
  sunrise: {
    name: 'Sunrise', emoji: '🌅', minutes: 60, rate: 0.25, minPlayers: 2,
    tag: '🌅',
    about: 'Rescues rarely get caught, and shields last twice as long.',
    announce: '🌅 **Sunrise!** Monsters hate it. For {for} rescues rarely get caught, and shields last twice as long.',
    ended: '🌅 The sun\'s gone behind the screen again.',
    mods: { weights: [{ game: 'rescue', outcome: 'caught', mult: 0.5 }], shieldMult: 2 },
  },
  madscience: {
    name: 'Mad Scientist Hour', emoji: '🧪', minutes: 60, rate: 0.25, minPlayers: 2,
    tag: '🧪',
    about: 'Potions backfire half as often (not siege attacks).',
    announce: '🧪 **The mad scientist is in.** For {for} potions are steadier: half as many backfire (not siege attacks).',
    ended: '🧪 The lab is closed. Mind your potions.',
    mods: { weights: [{ game: 'potion', outcome: 'backfired', mult: 0.5 }] },
  },
  rewind: {
    name: 'Be Kind, Rewind', emoji: '📼', minutes: 60, rate: 0.2, minPlayers: 2,
    tag: '📼',
    about: 'A bad outcome won\'t break your streak (not siege attacks).',
    announce: '📼 **Be Kind, Rewind.** For {for} a bad outcome won\'t break your streak (not siege attacks).',
    ended: '📼 Tape\'s rewound. Streaks can break again.',
    mods: { keepStreaks: true },
  },
  intermission: {
    name: 'Intermission', emoji: '🎪', minutes: 45, rate: 0.3, minPlayers: 2,
    tag: '🎪',
    about: 'Twists are three times as likely.',
    announce: '🎪 **Let\'s all go to the lobby!** Twists are three times as likely for {for}.',
    ended: '🎪 Intermission\'s over. Back to your seats.',
    mods: { twistMult: 3 },
  },
});

/**
 * All-day happenings, by date (UTC). No state, no announcement: the first
 * play of the day mentions it in its result line.
 */
export const CALENDAR_HAPPENINGS = Object.freeze({
  halloween: {
    name: 'Halloween Night', emoji: '🎃', tag: '🎃',
    about: 'Twists are twice as likely all day.',
    on: (d) => d.getUTCMonth() === 9 && d.getUTCDate() === 31,
    mods: { twistMult: 2 },
  },
  friday13: {
    name: 'Friday the 13th', emoji: '🔪', tag: '🔪',
    about: 'Bad outcomes are more likely, but every good one scores +1.',
    on: (d) => d.getUTCDay() === 5 && d.getUTCDate() === 13,
    mods: { weights: [{ bad: true, mult: 1.25 }], goodBonus: 1 },
  },
});

/** How often random happenings come, and the limits on them */
export const HAPPENING_RULES = Object.freeze({
  // Admin frequency → multiplier on every rate
  frequency: Object.freeze({ off: 0, rare: 0.5, normal: 1, often: 2 }),
  // At most one at a time, this far apart (end of one to start of the next)
  gapMinutes: 120,
  maxPerDay: 3, // UTC day
  // Someone has to be around: this many members who played in the last…
  activeWindowMinutes: 30,
  // A full moon (by the real lunar calendar) makes Full Moon this much likelier
  realFullMoonBoost: 4,
  /**
   * Pace (2.74.0): from the `day` pace on, a happening lasts about a day
   * (gamePace.happeningMinutes, at most `maxMinutes`), so the limits are a
   * week's: at least `gapMinutes` apart, at most `maxPerWeek` a week (an ISO
   * week, UTC), and the rates are spread over `spreadDays` days of active
   * minutes instead of one — about one a week at normal on a busy server
   * (tests/happening-store.test.js measures it). It can run during a
   * campaign (a siege attack is never touched by a happening anyway).
   */
  weekly: Object.freeze({ gapMinutes: 24 * 60, maxPerWeek: 2, spreadDays: 9, maxMinutes: 24 * 60 }),
});

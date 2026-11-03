/**
 * Balance simulator: a seeded month of a whole server playing the games, on
 * the REAL rules — the numbers in src/data/gameRewards.js, the line files'
 * own outcome odds, and the engine that applies them:
 *
 *   - every play goes through the commands' own path: beginPlay (cooldowns,
 *     the item check) → finishPlay (happeningsNow → resolvePlay, which
 *     draws the line with the item, happening, statuses and defences →
 *     recordPlay, one save → siegeHelp, which frees a grabbed fighter or
 *     cures a poisoned one → noteActivity). The line pools are built the
 *     way /foodfight, /doom, /rescue and /potion build them (a random food,
 *     trope or potion type, with the server's custom lines first).
 *   - a siege attack is siege.js attack()'s synchronous block, call for call:
 *     resolvePlay → siegeAttack → recordPlay → noteActivity. (attack() itself
 *     returns nothing, and the split below needs recordPlay's result. Keep
 *     attackPlay in step with it.)
 *   - the siege's minute is happeningScheduler.checkSiege's store calls in its
 *     order — siegeTick → digestDue → finishSiege (won / escaped) →
 *     decideAction → markAnnounced, then the results (claimResults →
 *     recordResults) — minus Discord: every ping and the results are taken
 *     to have gone out at once.
 *   - random sieges start by the scheduler's own rules and dice: when
 *     randomSiegeEligibility allows it, with luck() < randomSiegeChance, a
 *     randomMonster for its own minutes and randomPoolScale.
 *   - twists, loot, prize items and monster actions draw from gameLuck,
 *     seeded; the line draws from Math.random, seeded separately.
 *
 * What it does NOT model is people, so the people are assumptions, all in
 * PROFILES and the constants below them: how many play, how often, for how
 * long, what they pick, how fast they attack a monster and how quickly they
 * come to a grabbed friend's rescue. The rules are measured; the behaviour
 * is a guess, written down where it can be argued with.
 *
 * A month is December 2026 (1st–30th): no calendar happening falls in it
 * (Friday 13 November and Halloween are the nearest), and the Headless
 * Horseman is out of season. Every night's session runs 00:30–04:30 UTC,
 * a US evening, so it never crosses a UTC day (the daily caps) or the 12:00
 * UTC night boundary (nights in a row).
 *
 * Used by tests/fuzz/game-balance.fuzz.js. The caller sets GUILD_GAMES_DIR,
 * GUILD_HAPPENINGS_DIR and GUILD_CONFIGS_DIR before loadBalance(): every src
 * module is imported here dynamically, after them.
 */

import { jest } from '@jest/globals';
import path from 'path';

const SRC = path.join(process.cwd(), 'src');
const src = (p) => path.join(SRC, p);

export const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** The month: day 0 is 1 December 2026; each night's session starts SESSION_START after midnight UTC */
export const MONTH_START = Date.UTC(2026, 11, 1);
const SESSION_START = 30 * MINUTE;
/** How long the evening is, in minutes: the window everyone's sessions fall in */
const EVENING = 240;
const CHANNEL = 'games';

/**
 * The people. Per profile:
 *   activeP  - the chance they play on a given night
 *   plays    - how many regular plays on a night they play
 *   session  - how many minutes of the evening they're around (placed at random in it)
 *   pace     - minutes between their siege attacks while they're in a fight
 *              (each gap ×0.5–1.5 at random)
 */
export const PROFILES = Object.freeze({
  grinder: { activeP: 1, plays: () => 80, session: 240, pace: 1.5 },
  heavy: { activeP: 0.9, plays: (r) => 26 + r.int(9), session: 180, pace: 2.5 },
  typical: { activeP: 4.5 / 7, plays: (r) => 10 + r.int(6), session: 120, pace: 4 },
  casual: { activeP: 3 / 7, plays: () => 6, session: 75, pace: 6 },
  dropin: { activeP: 1.5 / 7, plays: () => 3, session: 45, pace: 8 },
});

/** BALANCE_PACE=2: everyone attacks a monster half as often (a what-if for the siege numbers) */
const PACE = Number(process.env.BALANCE_PACE) > 0 ? Number(process.env.BALANCE_PACE) : 1;

export const SERVER_15 = Object.freeze([
  'grinder', 'heavy', 'heavy', 'typical', 'typical', 'typical', 'typical', 'typical',
  'casual', 'casual', 'casual', 'casual', 'dropin', 'dropin', 'dropin',
]);
export const SERVER_5 = Object.freeze(['heavy', 'typical', 'typical', 'casual', 'dropin']);

/** What a regular play is: the game mix */
const GAME_MIX = [
  ['throw', 0.25], ['feed', 0.10], ['doom', 0.25], ['rescue', 0.15], ['helpful', 0.12], ['harmful', 0.13],
];
/** Plays aimed at a role or @everyone (only the player is scored) */
const GROUP_TARGET = 0.10;
/** Of the plays aimed at a member, how many go to someone around right now (the rest: anyone) */
const TARGET_AROUND = 0.7;
/** A held item that fits the play is used this often */
const ITEM_USE = 0.5;
/** A night with a (random) happening, started at a random point in the evening when the rules allow */
const HAPPENING_NIGHTS = 0.3;
/** Minutes before a member who's around notices a fight, or a friend in trouble */
const JOIN_DELAY = [0.5, 5];
const RESCUE_DELAY = [1, 5];
const RESCUE_RETRY = [1, 3];
/** A poisoned fighter gets a cure attempt this often (a grab always draws a rescue attempt) */
const CURE_CHANCE = 0.75;
const CURE_DELAY = [1, 6];
const WEAPONS = ['food', 'doom', 'potion'];

/** mulberry32: a small seeded PRNG, so a run replays exactly (as siegeSim.js) */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rngOf(seed) {
  const next = seeded(seed);
  return {
    float: next,
    int: (n) => Math.floor(next() * n),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
    between: ([lo, hi]) => lo + next() * (hi - lo),
  };
}

let mods = null;

/** Import the bot's modules, once, after the caller has pointed the file paths at its own directories */
export async function loadBalance() {
  if (mods) return mods;
  mods = {
    gamePlay: await import(src('utils/gamePlay.js')),
    scores: await import(src('utils/gameScores.js')),
    rules: await import(src('utils/gameRules.js')),
    luck: await import(src('utils/gameLuck.js')),
    siege: await import(src('utils/siegeStore.js')),
    happenings: await import(src('utils/happeningStore.js')),
    rewards: await import(src('data/gameRewards.js')),
    happeningData: await import(src('data/gameHappenings.js')),
    attackLines: (await import(src('data/siegeAttackLines.js'))).SIEGE_ATTACK_LINES,
    rescueData: await import(src('data/rescueLines.js')),
    potionLines: (await import(src('data/potionLines.js'))).POTION_LINES,
    foodfight: await import(src('commands/foodfight.js')),
    doom: await import(src('commands/doom.js')),
    rescue: await import(src('commands/rescue.js')),
    potion: await import(src('commands/potion.js')),
  };
  return mods;
}

/** A min-heap of events by time (then by the order they were queued) */
class Queue {
  constructor() { this.items = []; this.seq = 0; }
  get size() { return this.items.length; }
  push(at, event) {
    const items = this.items;
    // A re-queued event carries its old `at`: the new one wins
    items.push({ ...event, at, seq: this.seq++ });
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(items[i], items[parent])) break;
      [items[i], items[parent]] = [items[parent], items[i]];
      i = parent;
    }
  }
  pop() {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < items.length && this.less(items[l], items[m])) m = l;
        if (r < items.length && this.less(items[r], items[m])) m = r;
        if (m === i) break;
        [items[i], items[m]] = [items[m], items[i]];
        i = m;
      }
    }
    return top;
  }
  less(a, b) { return a.at < b.at || (a.at === b.at && a.seq < b.seq); }
}

/** A member's running tally: points by where they came from, items, prizes */
function emptyLedger(id, profile) {
  return {
    id,
    profile,
    activeNights: 0,
    plays: 0, // regular plays recorded (rescues and cures in a siege included)
    attacks: 0, // siege attacks recorded
    refused: 0, // plays the bot refused (a cooldown, the item limit): should stay near 0
    points: { play: 0, siegeAttack: 0, prizes: 0, titles: 0, nights: 0, twists: 0, happenings: 0, siegePayout: 0 },
    prizes: 0, // recurring prizes (PRIZES, not Night Lights), as player or target
    siegePrizes: 0, // the siege-wins prize (PRIZES 'siegewins')
    items: { prize: 0, nightlight: 0, find: 0, loot: 0, siegePrize: 0, overflow: 0 },
    used: 0, // active items used
    defences: 0, // Garlic and Antidotes that fired for them
    stolen: 0, // lost to a Car Break-In
    twists: 0,
    sieges: 0, // sieges they attacked in
  };
}

/**
 * One month of one server. Returns every member's ledger (and what the
 * scores file says, to check the ledger adds up) and every siege.
 * @param {object} p
 * @param {number} p.seed
 * @param {string[]} p.roster - a PROFILES key per member
 * @param {string} p.guildId - its own: each run is a fresh server
 * @param {number} [p.days]
 */
export async function runMonth({ seed, roster, guildId, days = 30 }) {
  const m = await loadBalance();
  const { gamePlay, scores, rules, siege: store, happenings: hs, rewards } = m;
  const { SIEGE, TITLE_POINTS, FULL_STACK_POINTS } = rewards;
  const r = rngOf(seed);
  const lineRandom = seeded(seed ^ 0x5bd1e995);
  const luckRandom = seeded(seed ^ 0x27d4eb2d);

  const clock = { now: MONTH_START };
  const spies = [
    jest.spyOn(Date, 'now').mockImplementation(() => clock.now),
    jest.spyOn(Math, 'random').mockImplementation(() => lineRandom()),
  ];
  m.luck._setLuck(luckRandom);
  const luck = m.luck.luck;

  const players = roster.map((profile, i) => ({ id: `${profile}${i}`, name: `${profile}${i}`, profile }));
  const ledger = Object.fromEntries(players.map(pl => [pl.id, emptyLedger(pl.id, pl.profile)]));
  const byId = Object.fromEntries(players.map(pl => [pl.id, pl]));
  const sieges = [];
  let happeningsStarted = 0;
  const config = { games: {} };
  const settings = scores.getGameSettings(config);
  // potion.js keeps its helpful set to itself: every potion type that isn't harmful
  const helpfulTypes = Object.keys(m.potionLines).filter(t => !m.potion.HARMFUL_POTIONS.includes(t));

  const credit = (userId, kind, pts) => {
    if (pts && ledger[userId]) ledger[userId].points[kind] += pts;
  };

  /** Book a recordPlay result: whose points moved, and why */
  function book(result, actorId, game) {
    const me = ledger[actorId];
    if (game === 'siege') me.attacks += 1;
    else me.plays += 1;
    credit(actorId, game === 'siege' ? 'siegeAttack' : 'play', result.actorDelta);
    if (result.targetId) credit(result.targetId, 'play', result.targetDelta);
    for (const rw of result.rewards || []) {
      const who = ledger[rw.userId];
      if (rw.kind === 'prize') {
        credit(rw.userId, 'prizes', rw.points + (rw.overflow ? FULL_STACK_POINTS : 0));
        who.prizes += 1;
        who.items.prize += 1;
        if (rw.overflow) who.items.overflow += 1;
      } else if (rw.kind === 'nightlight') {
        who.items.nightlight += 1;
        if (rw.overflow) {
          who.items.overflow += 1;
          credit(rw.userId, 'nights', FULL_STACK_POINTS);
        }
      }
    }
    if (result.nights?.buff) credit(actorId, 'nights', 1);
    const tw = result.twist;
    if (tw) {
      me.twists += 1;
      if (tw.points) credit(actorId, 'twists', tw.points);
      if (tw.key === 'find') {
        me.items.find += 1;
        if (tw.overflow) {
          me.items.overflow += 1;
          credit(actorId, 'twists', FULL_STACK_POINTS);
        }
      }
      if (tw.key === 'breakin') me.stolen += 1;
    }
    for (const st of result.statuses || []) {
      if ((st.key === 'refill' || st.key === 'mosquito') && st.points) credit(actorId, 'twists', st.points);
    }
    for (const hl of result.happeningLines || []) {
      if (hl.kind === 'goodBonus' && hl.points) credit(actorId, 'happenings', hl.points);
    }
    if (result.item?.used) me.used += 1;
    if (result.targetId && (result.defence?.key === 'garlic' || result.defence?.key === 'antid')) ledger[result.targetId].defences += 1;
  }

  /** A finished siege's payout, as applySiegeResult stored it */
  function bookGrants(grants) {
    for (const g of grants || []) {
      const who = ledger[g.userId];
      if (!who) continue;
      credit(g.userId, 'siegePayout', (g.points || 0) + (g.loot?.overflow ? FULL_STACK_POINTS : 0));
      if (g.loot) {
        who.items.loot += 1;
        if (g.loot.overflow) who.items.overflow += 1;
      }
      if (g.prize) {
        credit(g.userId, 'prizes', g.prize.points + (g.prize.overflow ? FULL_STACK_POINTS : 0));
        who.siegePrizes += 1;
        who.items.siegePrize += 1;
        if (g.prize.overflow) who.items.overflow += 1;
      }
    }
  }

  const interactionFor = (pl) => ({
    guildId, channelId: CHANNEL, channel: { id: CHANNEL, parentId: null },
    user: { id: pl.id, username: pl.name, globalName: pl.name, bot: false },
    member: { displayName: pl.name },
    refusal: null,
    async reply(payload) {
      if (payload?.ephemeral || payload?.flags) this.refusal = payload.content;
      return {};
    },
  });

  const memberTarget = (pl) => ({ kind: 'member', mention: `<@${pl.id}>`, pingUserIds: [pl.id], isBot: false, name: pl.name });
  const groupTarget = () => (r.chance(0.5)
    ? { kind: 'everyone', mention: '@everyone', pingUserIds: [], isBot: false, name: 'everyone' }
    : { kind: 'role', mention: '<@&movie-night>', pingUserIds: [], isBot: false, name: 'Movie Night' });

  /** An item this member holds that fits this play, half the time (the autocomplete's own list) */
  function chooseItem(pl, game, action) {
    const usable = gamePlay.itemChoices(guildId, pl.id, { game, action }, '', clock.now).filter(c => c.value !== 'none');
    return usable.length && r.chance(ITEM_USE) ? r.pick(usable).value : null;
  }

  // ── a regular play: the commands' own path ──────────────────────────

  /**
   * @returns {Promise<?object>} recordPlay's result, or null if the bot refused it
   */
  async function play(pl, kind, target) {
    const game = kind === 'throw' || kind === 'feed' ? 'foodfight' : kind === 'helpful' || kind === 'harmful' ? 'potion' : kind;
    const action = { throw: 'throw', feed: 'feed', doom: 'fate', rescue: 'attempt', helpful: 'give', harmful: 'give' }[kind];
    const interaction = interactionFor(pl);
    const started = await gamePlay.beginPlay(interaction, game, { item: chooseItem(pl, game, action), action });
    if (!started) {
      ledger[pl.id].refused += 1;
      return null;
    }
    const cfg = started.config;
    let lines;
    let effect;
    let blockedLines = [];
    if (game === 'foodfight') {
      const spec = m.foodfight.ACTIONS[action];
      const food = gamePlay.pick(m.foodfight.FOODS).value;
      lines = [...gamePlay.tagged(m.foodfight.getFoodfightLines(cfg, action)[food], spec.fallback), ...(spec.lines[food] || [])];
    } else if (game === 'doom') {
      const trope = gamePlay.pick(m.doom.TROPES).value;
      lines = [...gamePlay.tagged(m.doom.getDoomLines(cfg)[trope], 'doomed'), ...(m.doom.DEFAULT_DOOM_LINES[trope] || [])];
      blockedLines = gamePlay.tagged(m.rescueData.DOOM_BLOCKED_LINES, 'blocked');
    } else if (game === 'rescue') {
      const trope = gamePlay.pick(m.rescue.RESCUE_TROPES).value;
      lines = [...gamePlay.tagged(m.rescue.getRescueLines(cfg)[trope], 'rescued'), ...(m.rescueData.RESCUE_LINES[trope] || [])];
    } else {
      effect = kind;
      const type = kind === 'helpful' ? r.pick(helpfulTypes) : r.pick(m.potion.HARMFUL_POTIONS);
      lines = (await m.potion.getPotionResponses(guildId, type)).map(l => ({ ...l, outcome: l.outcome || 'worked' }));
    }
    const result = await gamePlay.finishPlay(interaction, { game, action, target, lines, blockedLines, effect, item: started.item, settings: started.settings });
    book(result, pl.id, game);
    return result;
  }

  // ── the evening: sessions, plays, the scheduler's minute ────────────

  const sessions = {}; // today's: id → { from, to } (absolute ms)
  const around = (t) => players.filter(pl => sessions[pl.id] && sessions[pl.id].from <= t && t < sessions[pl.id].to);

  function pickTarget(pl, t) {
    if (r.chance(GROUP_TARGET)) return groupTarget();
    const here = around(t).filter(x => x.id !== pl.id);
    const others = players.filter(x => x.id !== pl.id);
    const pool = here.length && r.chance(TARGET_AROUND) ? here : others;
    return memberTarget(r.pick(pool));
  }

  function pickKind() {
    let x = r.float();
    for (const [kind, p] of GAME_MIX) {
      x -= p;
      if (x < 0) return kind;
    }
    return GAME_MIX[GAME_MIX.length - 1][0];
  }

  // ── a siege ─────────────────────────────────────────────────────────

  let fight = null; // the live siege's bookkeeping: { id, endsAt, fighters: Set }

  const fighterState = (userId) => store.currentSiege(guildId)?.participants?.[userId] || null;
  const free = (userId) => {
    const p = fighterState(userId);
    return !store.isCaught(p) && !store.isOut(p);
  };

  /** siege.js attack(), from the live check to noteActivity (see the top of this file) */
  async function attackPlay(pl, weapon) {
    const s = store.currentSiege(guildId);
    if (!s || s.status !== 'live' || !(s.hp > 0) || !store.isLive(s, clock.now)) return null;
    const mine = s.participants?.[pl.id];
    if (store.isOut(mine) || store.isCaught(mine)) return null;
    const interaction = interactionFor(pl);
    const started = await gamePlay.beginPlay(interaction, 'siege', { item: chooseItem(pl, 'siege', weapon), action: weapon, channel: interaction.channel });
    if (!started) {
      ledger[pl.id].refused += 1;
      return null;
    }
    const monster = store.monsterOf(s.monster);
    const table = SIEGE.outcomes[weapon];
    const lines = (m.attackLines[weapon] || []).filter(l => l?.text && rules.owns(table, l.outcome)).map(l => ({ text: l.text, outcome: table[l.outcome] }));
    const actor = { id: pl.id, name: pl.name };
    const target = store.monsterTarget(monster);
    const cfg = { ...started.settings, dailyScoredPlays: SIEGE.scoredPerDay, twists: false };
    const now = Date.now();
    const again = store.currentSiege(guildId);
    if (!again || again.id !== s.id || again.status !== 'live' || !(again.hp > 0) || !store.isLive(again, now)) return null;
    const drawn = gamePlay.resolvePlay(guildId, { game: 'siege', action: weapon, actor, target, lines, item: started.item, settings: cfg, happenings: [] }, now);
    const fx = drawn.usable ? rules.itemEffect(drawn.item, 'siege', weapon) : null;
    const landed = store.siegeAttack(guildId, s.id, { userId: actor.id, name: actor.name, weapon, outcome: drawn.outcome, silver: !!fx?.silver }, now);
    if (landed.error) return null;
    const result = scores.recordPlay(guildId, {
      game: 'siege', action: weapon, actor, target, outcome: drawn.outcome, settings: cfg, item: drawn.item, mods: drawn.mods, happenings: [],
    }, now);
    hs.noteActivity(guildId, { channelId: CHANNEL, userId: actor.id }, now);
    book(result, pl.id, 'siege');
    if (landed.hit.selfPoisoned?.antidote) ledger[pl.id].defences += 1;
    fight.fighters.add(pl.id);
    return landed;
  }

  const sumOf = (list, key) => list.reduce((n, x) => n + (Number(x[key]) || 0), 0);

  /** Someone around (not `victim`, not held by the monster) to help */
  function helperFor(victimId, t) {
    const here = around(t).filter(x => x.id !== victimId && free(x.id));
    return here.length ? r.pick(here) : null;
  }

  function startFight(q, s) {
    fight = { id: s.id, endsAt: s.endsAt, monster: s.monster, dial: s.dial, fighters: new Set(), grabbed: 0, poisoned: 0, digested: 0 };
    for (const pl of players) {
      const sess = sessions[pl.id];
      if (!sess) continue;
      const join = Math.max(s.startedAt, sess.from) + r.between(JOIN_DELAY) * MINUTE;
      if (join < Math.min(sess.to, s.endsAt)) q.push(join, { kind: 'attack', who: pl.id });
    }
    for (let t = s.startedAt + MINUTE; t <= s.endsAt + MINUTE; t += MINUTE) q.push(t, { kind: 'siegeMinute', siegeId: s.id });
  }

  /** The scheduler's minute for a live siege (checkSiege's store calls, in order) */
  function siegeMinute(q, siegeId, t) {
    let s = store.currentSiege(guildId);
    if (!s || s.id !== siegeId || s.status !== 'live') return;
    store.siegeTick(guildId, s.id, t);
    const eaten = store.digestDue(guildId, s.id, t);
    for (const d of eaten.digested || []) {
      credit(d.userId, 'siegePayout', d.points);
      fight.digested += 1;
    }
    s = store.currentSiege(guildId);
    let status = null;
    if (!(s.hp > 0)) status = 'won';
    else if (t >= s.endsAt) status = 'escaped';
    if (status) {
      const done = store.finishSiege(guildId, s.id, status, t, luck);
      // The results are posted (postSiegeResults: claim, send, record).
      // Until they are, no other siege can start.
      if (!done.error && !store.claimResults(guildId, s.id, t).error) store.recordResults(guildId, s.id, `results-${s.id}`, t);
      if (!done.error) {
        bookGrants(done.siege.result.grants);
        const fought = store.fightersOf(done.siege);
        for (const f of fought) if (ledger[f.userId] && (f.attacks || 0) > 0) ledger[f.userId].sieges += 1;
        sieges.push({
          status, monster: s.monster, fighters: fought.length, maxHp: done.siege.maxHp, hpLeft: Math.max(0, done.siege.hp),
          dial: fight.dial, dialAfter: done.dial, minutes: Math.round((t - s.startedAt) / MINUTE),
          grabbed: fight.grabbed, poisoned: fight.poisoned, digested: fight.digested,
          freed: sumOf(fought, 'frees'), cured: sumOf(fought, 'cures'),
        });
      }
      fight = null;
      return;
    }
    const decided = store.decideAction(guildId, s.id, { rescueOn: true, potionOn: true }, t, luck);
    if (!decided.action) return;
    const applied = store.markAnnounced(guildId, s.id, decided.action.id, `msg-${decided.action.id}`, t).applied;
    if (!applied) return;
    fight.grabbed += applied.grabbed.length;
    fight.poisoned += applied.poisoned.length;
    for (const id of applied.grabbed) q.push(t + r.between(RESCUE_DELAY) * MINUTE, { kind: 'rescue', victim: id });
    for (const id of applied.poisoned) if (r.chance(CURE_CHANCE)) q.push(t + r.between(CURE_DELAY) * MINUTE, { kind: 'cure', victim: id, tries: 0 });
    for (const id of applied.antidote) if (ledger[id]) ledger[id].defences += 1;
  }

  // ── the month ───────────────────────────────────────────────────────

  try {
    for (let day = 0; day < days; day++) {
      const evening = MONTH_START + day * DAY + SESSION_START;
      const q = new Queue();
      for (const key of Object.keys(sessions)) delete sessions[key];

      for (const pl of players) {
        const prof = PROFILES[pl.profile];
        if (!r.chance(prof.activeP)) continue;
        ledger[pl.id].activeNights += 1;
        const from = evening + r.int(EVENING - prof.session + 1) * MINUTE;
        const to = from + prof.session * MINUTE;
        sessions[pl.id] = { from, to };
        const n = prof.plays(r);
        const slot = (to - from) / n;
        // Spread over their session, never closer than a fifth of a slot:
        // a grinder's 80 a night are ~3 minutes apart, well clear of the
        // 20-second cooldowns and the six a minute
        for (let i = 0; i < n; i++) q.push(from + (i + 0.1 + 0.8 * r.float()) * slot, { kind: 'play', who: pl.id, retry: 0 });
      }
      const happeningAt = r.chance(HAPPENING_NIGHTS) ? evening + r.int(EVENING - 40) * MINUTE : null;
      let happeningDone = false;
      for (let i = 0; i < EVENING; i++) q.push(evening + i * MINUTE, { kind: 'tick' });

      const dayStarted = performance.now();
      let events = 0;
      while (q.size) {
        events += 1;
        const ev = q.pop();
        if (process.env.BALANCE_VERBOSE === '2') process.stderr.write(`${events} ${ev.kind} ${ev.who || ''} ${new Date(ev.at).toISOString()}\n`);
        clock.now = Math.max(clock.now, Math.round(ev.at));
        const t = clock.now;
        const pl = ev.who ? byId[ev.who] : null;
        if (ev.kind === 'play') {
          const result = await play(pl, pickKind(), pickTarget(pl, t));
          // A cooldown refusal (two plays of a game too close): once more a little later
          if (!result && ev.retry < 1) q.push(t + 25_000, { ...ev, retry: ev.retry + 1 });
        } else if (ev.kind === 'tick') {
          // The scheduler's order (checkGuild): a happening may start, else maybe a monster
          if (store.currentSiege(guildId)?.status === 'live') continue;
          if (happeningAt !== null && !happeningDone && t >= happeningAt) {
            const state = hs.loadState(guildId);
            const ok = hs.spawnEligibility(state, settings, t);
            if (ok.ok) {
              const weights = ok.kinds.map(k => hs.kindRate(k, t));
              let x = r.float() * weights.reduce((a, b) => a + b, 0);
              const kind = ok.kinds.find((k, i) => (x -= weights[i]) < 0) || ok.kinds[ok.kinds.length - 1];
              if (!hs.startHappening(guildId, kind, { source: 'random', channelId: CHANNEL }, t).error) {
                happeningsStarted += 1;
                happeningDone = true;
                continue;
              }
            }
          }
          const state = hs.loadState(guildId);
          if (!store.randomSiegeEligibility(state, settings, t).ok) continue;
          if (!(luck() < store.randomSiegeChance(settings.siegeFrequency))) continue;
          const key = store.randomMonster(t, luck);
          const monster = store.monsterOf(key);
          const spawned = store.spawnSiege(guildId, {
            monster: key,
            minutes: monster.minutes ?? settings.siegeMinutes,
            channelId: CHANNEL,
            source: 'random',
            poolScale: store.randomPoolScale(settings.siegeFrequency),
            check: (data) => {
              const again = store.randomSiegeEligibility(data, settings, t);
              return again.ok ? null : again.reason;
            },
          }, t);
          if (!spawned.error) startFight(q, spawned.siege);
        } else if (ev.kind === 'siegeMinute') {
          siegeMinute(q, ev.siegeId, t);
        } else if (ev.kind === 'attack') {
          if (!fight) continue;
          const sess = sessions[pl.id];
          await attackPlay(pl, r.pick(WEAPONS));
          const next = t + PROFILES[pl.profile].pace * PACE * (0.5 + r.float()) * MINUTE;
          if (fight && !store.isOut(fighterState(pl.id)) && next < Math.min(sess.to, fight.endsAt)) q.push(next, ev);
        } else if (ev.kind === 'rescue') {
          const s = store.currentSiege(guildId);
          const p = s?.participants?.[ev.victim];
          if (!s || s.status !== 'live' || !store.isCaught(p) || t >= p.caught.until) continue;
          const helper = helperFor(ev.victim, t);
          if (!helper) continue;
          const result = await play(helper, 'rescue', memberTarget(byId[ev.victim]));
          // Still in its grip (caught, or the rescue was refused): someone tries again
          if (store.isCaught(fighterState(ev.victim))) q.push(t + r.between(RESCUE_RETRY) * MINUTE, ev);
          // A sacrifice: now the rescuer needs rescuing
          if (result && store.isCaught(fighterState(helper.id))) q.push(t + r.between(RESCUE_DELAY) * MINUTE, { kind: 'rescue', victim: helper.id });
        } else if (ev.kind === 'cure') {
          const s = store.currentSiege(guildId);
          const p = s?.participants?.[ev.victim];
          if (!s || s.status !== 'live' || !store.poisonedNow(p, t)) continue;
          const helper = helperFor(ev.victim, t);
          if (!helper) continue;
          await play(helper, 'helpful', memberTarget(byId[ev.victim]));
          if (store.poisonedNow(fighterState(ev.victim), t) && ev.tries < 1 && r.chance(0.5)) {
            q.push(t + r.between(RESCUE_RETRY) * MINUTE, { ...ev, tries: ev.tries + 1 });
          }
        }
      }
      if (process.env.BALANCE_VERBOSE) process.stderr.write(`[balance] ${guildId} day ${day + 1}: ${events} events in ${(performance.now() - dayStarted).toFixed(0)} ms\n`);
    }

    // What the scores file says: every member's total, and titles (+TITLE_POINTS each, all earned this month)
    const data = scores.loadScores(guildId);
    const stored = {};
    for (const pl of players) {
      const user = data.users[pl.id];
      const total = Object.values(user?.games || {}).reduce((n, g) => n + (g?.all?.points || 0), 0);
      const titles = Object.keys(user?.titles?.earned || {}).length;
      ledger[pl.id].points.titles = titles * TITLE_POINTS;
      ledger[pl.id].titleCount = titles;
      ledger[pl.id].heldAtEnd = Object.values(user?.glovebox || {}).reduce((n, c) => n + c, 0);
      stored[pl.id] = total;
    }
    return { ledger, stored, sieges, happenings: happeningsStarted, dial: store.dialOf(hs.loadState(guildId)) };
  } finally {
    m.luck._setLuck(null);
    for (const spy of spies) spy.mockRestore();
  }
}

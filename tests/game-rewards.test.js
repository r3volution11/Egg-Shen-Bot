/**
 * The games' rewards (R3): recurring prizes, Glovebox items, defences,
 * nights in a row, titles, and what a reset clears — clock-driven through
 * recordPlay and resolvePlay (the same two steps finishPlay takes), and
 * end to end through the real commands with the fake Discord where it's
 * the command's behaviour under test.
 *
 * What's checked is what's stored (points, the Glovebox, shields,
 * counters) and the exact lines posted, not that "something happened".
 * Lines are chosen with a random number found in the real line data
 * (rWhere), so a reshuffled data file doesn't break the tests.
 *
 * Run with: npm test -- tests/game-rewards.test.js
 */

import { describe, test, expect, jest, beforeAll, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { FakeDiscord } from './harness/fakeDiscord.js';
import {
  DEFAULT_GAME_SETTINGS, recordPlay, loadScores, mutateScores, deleteScores, resetScores, resetPlayLimits,
  extraLines, itemProblem, setShownTitle, getLeaderboard,
} from '../src/utils/gameScores.js';
import { resolvePlay, finishPlay, itemChoices, tagged } from '../src/utils/gamePlay.js';
import { pickLine } from '../src/utils/gameRules.js';
import { _setLuck } from '../src/utils/gameLuck.js';
import { getPlayerCardExtras } from '../src/utils/gameCardData.js';
import { saveGuildConfig, loadGuildConfig } from '../src/utils/guildConfig.js';
import { ITEM_REFUSALS, ITEM_PLACEHOLDERS } from '../src/data/gameRewardLines.js';
import { FOODFIGHT_LINES } from '../src/data/foodfightLines.js';
import { FOODFIGHT_FEED_LINES } from '../src/data/foodfightFeedLines.js';
import { DOOM_LINES } from '../src/data/doomLines.js';
import { RESCUE_LINES, DOOM_BLOCKED_LINES } from '../src/data/rescueLines.js';
import { POTION_LINES } from '../src/data/potionLines.js';

const GUILD = 'rewards-guild';
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
/** Monday 2 Nov 2026, 18:00 UTC: an evening, six hours into a night */
const T = Date.UTC(2026, 10, 2, 18, 0);
/** The same day at 01:00 UTC, for anything that must stay inside one UTC day for hours */
const EARLY = Date.UTC(2026, 10, 2, 1, 0);
/** 18:00 UTC on the `d`th of November */
const night = (d, h = 18) => Date.UTC(2026, 10, d, h, 0);

const SAM = { id: 'sam', name: 'Sam' };
const KIM = { id: 'kim', name: 'Kim' };
const ALEX = { kind: 'member', pingUserIds: ['alex'], name: 'Alex', mention: '<@alex>' };
const ROLE = { kind: 'role', pingUserIds: [], name: 'Mods', mention: '<@&mods>' };
// Room for dozens of scored plays in a day
const SETTINGS = { ...DEFAULT_GAME_SETTINGS, dailyScoredPlays: 1000 };

const ZOMBIE = DOOM_LINES.zombie;
const POISON = POTION_LINES.poison;
const BLOCKED = tagged(DOOM_BLOCKED_LINES, 'blocked');

const play = (game, outcome, { actor = SAM, target = ROLE, settings = SETTINGS, now = T, effect, item } = {}) =>
  recordPlay(GUILD, { game, actor, target, outcome, effect, settings, item }, now);

/** What finishPlay does, with the line draw's random number given */
function draw(game, action, lines, { actor = SAM, target = ALEX, blockedLines = [], item = null, effect, settings = SETTINGS, now = T, r = 0.5 } = {}) {
  const drawn = resolvePlay(GUILD, { game, action, actor, target, lines, blockedLines, item, effect, settings }, now, () => r);
  const result = recordPlay(GUILD, { game, action, actor, target, outcome: drawn.outcome, effect, settings, item: drawn.item, mods: drawn.mods }, now);
  return { drawn, result, extras: extraLines(result, { actor: actor.name, target: result.targetId ? target.name : null }) };
}

const user = (id) => loadScores(GUILD).users[id];
/** Change one member's stored record directly (what earlier plays would have left) */
const seed = (id, fn) => mutateScores(GUILD, (d) => fn((d.users[id] ||= { name: id, games: {} }), d));
/** Already checked since R3, so no title is granted silently */
const checked = (u, earned = {}) => { u.titles = { earned, shown: null }; };
/** A random number whose draw passes `ok` */
function rWhere(ok) {
  for (let i = 0; i < 1000; i++) {
    const r = (i + 0.5) / 1000;
    if (ok(r)) return r;
  }
  throw new Error('no r draws that');
}
/** One game's all-time stats, as earlier plays would have stored them */
const stats = (over) => ({ points: 0, plays: 0, scoredPlays: 0, counts: {}, received: {}, receivedPoints: 0, bestStreak: 0, ...over });
const rOn = (lines, outcome, weights = {}) => rWhere(r => pickLine(lines, weights, () => r).outcome === outcome);

beforeEach(() => {
  deleteScores(GUILD);
  resetPlayLimits();
});
afterEach(() => {
  jest.restoreAllMocks();
  _setLuck(null);
});

// ── recurring prizes ────────────────────────────────────────────────────

describe('recurring prizes', () => {
  // The streak titles would fire at 10 and 15 hits in a row; they're not under test here
  beforeEach(() => seed('sam', u => checked(u, { 'on-fire': 1, unstoppable: 1 })));

  test('the 25th scored hit gives exactly one Golden Pie and +3; the 24th gives nothing', () => {
    for (let i = 0; i < 24; i++) play('foodfight', 'hit', { now: T + i * MIN });
    expect(user('sam').glovebox).toBeUndefined();
    expect(user('sam').progress).toEqual({ hits: 24, points: 72 });

    const r = play('foodfight', 'hit', { now: T + 24 * MIN });
    expect(r.rewards).toEqual([{ kind: 'prize', who: 'actor', userId: 'sam', prize: 'hits', item: 'gpie', points: 3, overflow: false }]);
    expect([r.actorDelta, r.bonus, r.actorPoints]).toEqual([3, 3, 78]);
    const sam = user('sam');
    expect(sam.glovebox).toEqual({ gpie: 1 });
    // The counter starts again; the prize's +3 is not counted toward the points prize
    expect(sam.progress).toEqual({ hits: 0, points: 75 });
    expect(sam.games.foodfight.all).toMatchObject({ points: 78, bonus: 3 });
    expect(sam.games.foodfight['m2026-11']).toMatchObject({ points: 78, bonus: 3 });
    expect(loadScores(GUILD).daily.sam.prizes).toBe(1);
    expect(extraLines(r, { actor: 'Sam', target: null })).toEqual(['-# 🎁 25 hits! Sam gets a 🥧 Golden Pie and +3.']);
  });

  test('capped plays don\'t count', () => {
    const capped = { ...DEFAULT_GAME_SETTINGS, dailyScoredPlays: 2 };
    for (let i = 0; i < 5; i++) play('foodfight', 'hit', { settings: capped, now: T + i * MIN });
    expect(user('sam').progress).toEqual({ hits: 2, points: 6 });
  });

  test('a 3rd prize in a UTC day waits at 24/25, and comes with the next day\'s first qualifying play', () => {
    seed('sam', u => { u.progress = { hits: 24, tasty: 14, dooms: 24 }; });
    expect(play('foodfight', 'hit').rewards.map(x => x.item)).toEqual(['gpie']);
    expect(play('foodfight', 'tasty', { now: T + MIN }).rewards.map(x => x.item)).toEqual(['garlic']);

    const held = play('doom', 'doomed', { now: T + 2 * MIN });
    expect(held.rewards).toEqual([{ kind: 'held', who: 'actor', userId: 'sam', prize: 'dooms' }]);
    expect(held.bonus).toBe(0);
    expect(extraLines(held, { actor: 'Sam', target: null })).toEqual([
      '-# 🎁 Dooms 24/25 · the prize counter\'s full tonight (2 a day). Sam\'s next one tomorrow (UTC) brings it.',
    ]);
    expect(user('sam').progress.dooms).toBe(24);
    expect(user('sam').glovebox).toEqual({ gpie: 1, garlic: 1 });

    // Another today: still waiting, and not said again
    expect(play('doom', 'doomed', { now: T + 3 * MIN }).rewards).toEqual([]);
    expect(user('sam').progress.dooms).toBe(24);
    expect(getPlayerCardExtras(GUILD, 'sam', { now: T + 4 * MIN }).progress.find(p => p.key === 'dooms'))
      .toMatchObject({ have: 24, need: 25, waiting: true });

    // Past midnight UTC (the same night): the first doom brings it
    const next = play('doom', 'doomed', { now: Date.UTC(2026, 10, 3, 0, 30) });
    expect(next.rewards).toEqual([{ kind: 'prize', who: 'actor', userId: 'sam', prize: 'dooms', item: 'vhs', points: 3, overflow: false }]);
    expect(user('sam').progress.dooms).toBe(0);
    expect(user('sam').glovebox).toEqual({ gpie: 1, garlic: 1, vhs: 1 });
    expect(getPlayerCardExtras(GUILD, 'sam', { now: Date.UTC(2026, 10, 3, 0, 31) }).progress.find(p => p.key === 'dooms'))
      .toMatchObject({ have: 0, waiting: false });
  });

  test('a full stack turns the item into +2', () => {
    seed('sam', u => { u.glovebox = { gpie: 3 }; u.progress = { hits: 24 }; });
    const r = play('foodfight', 'hit');
    expect(r.rewards).toEqual([{ kind: 'prize', who: 'actor', userId: 'sam', prize: 'hits', item: 'gpie', points: 3, overflow: true }]);
    expect(user('sam').glovebox).toEqual({ gpie: 3 });
    expect(r.bonus).toBe(5);
    expect(user('sam').games.foodfight.all).toMatchObject({ points: 8, bonus: 5 });
    expect(extraLines(r, { actor: 'Sam', target: null })).toEqual(['-# 🎁 25 hits! Sam gets +2 instead of a 🥧 Golden Pie (the Glovebox holds 3) and +3.']);
  });

  test('750 points: a random item, drawn with luck — not with the line draw\'s Math.random', () => {
    seed('sam', u => { u.progress = { points: 748 }; });
    jest.spyOn(Math, 'random').mockReturnValue(0); // were the item drawn from this, it'd be the first: a Golden Pie
    _setLuck(() => 0.4); // 0.4 × 6 items → the third: a Cursed VHS
    const r = play('foodfight', 'hit');
    expect(r.rewards).toEqual([{ kind: 'prize', who: 'actor', userId: 'sam', prize: 'points', item: 'vhs', points: 0, overflow: false }]);
    expect(user('sam').progress.points).toBe(1);
    expect(user('sam').glovebox).toEqual({ vhs: 1 });
    expect(r.bonus).toBe(0);
    expect(extraLines(r, { actor: 'Sam', target: null })).toEqual(['-# 🎁 750 points! A random item for Sam: a 📼 Cursed VHS.']);
  });

  test('points a member gains as the target count toward their own random item', () => {
    seed('alex', u => { checked(u); u.progress = { points: 749 }; });
    const r = play('foodfight', 'tasty', { target: ALEX }); // Sam +1, Alex +2
    // GAME_LUCK=off: the last of the six
    expect(r.rewards).toEqual([{ kind: 'prize', who: 'target', userId: 'alex', prize: 'points', item: 'penny', points: 0, overflow: false }]);
    expect(user('alex').progress).toEqual({ points: 1 });
    expect(user('alex').glovebox).toEqual({ penny: 1 });
    expect(user('sam').progress).toEqual({ tasty: 1, points: 1 });
    expect(extraLines(r, { actor: 'Sam', target: 'Alex' })).toEqual(['-# 🎁 750 points! A random item for Alex: a 🍀 Lucky Penny.']);
  });
});

// ── items and defences, in the store ────────────────────────────────────

describe('items', () => {
  beforeEach(() => {
    seed('sam', u => checked(u));
    seed('alex', u => checked(u));
    seed('kim', u => checked(u));
  });

  test('Golden Pie on a feed: always tasty, and +2 more each (you +3, them +4)', () => {
    const taco = FOODFIGHT_FEED_LINES.taco;
    seed('sam', u => { u.glovebox = { gpie: 1 }; });
    const r = rOn(taco, 'spill');
    const { drawn, result, extras } = draw('foodfight', 'feed', taco, { item: 'gpie', r });
    expect(drawn.line).toBe(pickLine(taco, { gross: 0, spill: 0 }, () => r));
    expect(result).toMatchObject({ outcome: 'tasty', actorDelta: 3, targetDelta: 4, item: { key: 'gpie', used: true, note: null } });
    expect(user('sam').games.foodfight.all.points).toBe(3);
    expect(user('alex').games.foodfight.all.points).toBe(4);
    expect(user('sam').glovebox).toEqual({});
    expect(loadScores(GUILD).daily.sam.itemUses).toBe(1);
    expect(extras).toEqual(['-# 🥧 Golden Pie: sure to be tasty. Sam +2 more, Alex +2 more.']);
  });

  test('Golden Pie on a throw: an r that lands on a backfire lands on a hit instead, for +6', () => {
    const pie = FOODFIGHT_LINES.pie;
    seed('sam', u => { u.glovebox = { gpie: 2 }; });
    const r = rOn(pie, 'backfire');
    const { result } = draw('foodfight', 'throw', pie, { item: 'gpie', r });
    expect(result).toMatchObject({ outcome: 'hit', actorDelta: 6, targetDelta: -1 });
    expect(user('sam').glovebox).toEqual({ gpie: 1 });
  });

  test('3 items a day: a 4th stays in the Glovebox, and works again the next UTC day', () => {
    const pie = FOODFIGHT_LINES.pie;
    seed('sam', u => { u.glovebox = { gpie: 3, vhs: 2 }; });
    for (let i = 0; i < 3; i++) expect(draw('foodfight', 'throw', pie, { item: 'gpie', now: T + i * MIN }).result.item.used).toBe(true);
    expect(loadScores(GUILD).daily.sam.itemUses).toBe(3);
    expect(itemChoices(GUILD, 'sam', { game: 'doom', action: 'fate' }, '', T + 3 * MIN)).toEqual([{ name: ITEM_PLACEHOLDERS.limit, value: 'none' }]);

    const fourth = draw('doom', 'fate', ZOMBIE, { item: 'vhs', now: T + 4 * MIN });
    expect(fourth.result.item).toEqual({ key: 'vhs', used: false, note: 'limit' });
    expect(fourth.extras).toEqual(['-# 📼 Cursed VHS stayed in Sam\'s Glovebox: that\'s 3 items today already.']);
    expect(user('sam').glovebox).toEqual({ vhs: 2 });

    const tomorrow = Date.UTC(2026, 10, 3, 0, 5);
    expect(itemChoices(GUILD, 'sam', { game: 'doom', action: 'fate' }, '', tomorrow))
      .toEqual([{ name: '📼 Cursed VHS ×2 · can\'t backfire, beats shields, points ×2', value: 'vhs' }]);
    expect(draw('doom', 'fate', ZOMBIE, { item: 'vhs', now: tomorrow }).result.item.used).toBe(true);
  });

  test('two plays race for the last item: the second plays without it, and says so', () => {
    seed('sam', u => { u.glovebox = { penny: 1 }; });
    const give = { game: 'potion', action: 'give' };
    // Both plays passed beginPlay's check while one Penny was held…
    expect(itemProblem(loadScores(GUILD), 'sam', 'penny', give, T)).toBeNull();
    const r = rOn(POISON, 'backfired');
    expect(draw('potion', 'give', POISON, { item: 'penny', effect: 'harmful', r }).result.outcome).toBe('hurt');
    // …and the second, drawn after the first was saved, can't use it
    const second = draw('potion', 'give', POISON, { item: 'penny', effect: 'harmful', r, now: T + 1 });
    expect(second.drawn.line.outcome).toBe('backfired');
    expect(second.result).toMatchObject({ outcome: 'backfired', actorDelta: -2, item: { key: 'penny', used: false, note: 'missing' } });
    expect(second.extras).toEqual(['-# Sam\'s 🍀 Lucky Penny was already used up, so this play went ahead without it.']);
    expect(loadScores(GUILD).daily.sam.itemUses).toBe(1);
  });
});

describe('defences', () => {
  beforeEach(() => {
    seed('alex', u => checked(u));
    seed('kim', u => checked(u));
  });
  const rDoomed = () => rOn(ZOMBIE, 'doomed');
  const rWorked = () => rOn(POISON, 'worked');

  test('Garlic turns a doom that rolls doomed into an escape — the line too — then can\'t fire for 12 h', () => {
    seed('alex', u => { u.glovebox = { garlic: 1 }; });
    const r = rDoomed();
    const first = draw('doom', 'fate', ZOMBIE, { actor: KIM, r, now: EARLY });
    expect(first.drawn).toMatchObject({ outcome: 'escaped', mods: { defence: 'garlic' } });
    expect(first.drawn.line).toBe(pickLine(ZOMBIE.filter(l => l.outcome === 'escaped'), {}, () => r));
    expect(first.result).toMatchObject({ outcome: 'escaped', actorDelta: -1, targetDelta: 2, defence: { key: 'garlic', readyAt: EARLY + 12 * HOUR } });
    expect(user('alex').glovebox).toEqual({});
    expect(user('alex').cooldowns).toEqual({ garlic: EARLY + 12 * HOUR });
    expect(first.extras).toEqual(['-# 🧄 Alex\'s Garlic turned the doom into an escape. It\'s used up, and another can\'t work for 12 h.']);

    // A new clove, but the last one worked under 12 h ago
    seed('alex', u => { u.glovebox = { garlic: 1 }; });
    const early = draw('doom', 'fate', ZOMBIE, { actor: KIM, r, now: EARLY + 12 * HOUR - 1 });
    expect(early.result).toMatchObject({ outcome: 'doomed', targetDelta: -1, defence: null });
    expect(user('alex').glovebox).toEqual({ garlic: 1 });
    expect(draw('doom', 'fate', ZOMBIE, { actor: KIM, r, now: EARLY + 12 * HOUR }).result.defence).toMatchObject({ key: 'garlic' });
  });

  test('Garlic never against your own doom, or a play past the daily cap', () => {
    seed('alex', u => { u.glovebox = { garlic: 1 }; });
    const r = rDoomed();
    const self = draw('doom', 'fate', ZOMBIE, { actor: { id: 'alex', name: 'Alex' }, r });
    expect(self.result.outcome).toBe('doomed');
    const capped = draw('doom', 'fate', ZOMBIE, { actor: KIM, r, settings: { ...SETTINGS, dailyScoredPlays: 0 } });
    expect(capped.result).toMatchObject({ outcome: 'doomed', capped: true, defence: null });
    expect(user('alex').glovebox).toEqual({ garlic: 1 });
  });

  test('the Antidote: a harmful potion that works does no harm (giver +1), then 6 h before another can', () => {
    seed('alex', u => { u.glovebox = { antid: 2 }; });
    const r = rWorked();
    const first = draw('potion', 'give', POISON, { actor: KIM, effect: 'harmful', r, now: EARLY });
    expect(first.result).toMatchObject({ outcome: 'hurt', actorDelta: 1, targetDelta: 0, defence: { key: 'antid', readyAt: EARLY + 6 * HOUR } });
    expect(first.extras).toEqual(['-# 💊 Alex\'s Antidote: no harm done, and Kim gets less for it. It\'s used up, and another can\'t work for 6 h.']);
    expect(user('alex').glovebox).toEqual({ antid: 1 });

    expect(draw('potion', 'give', POISON, { actor: KIM, effect: 'harmful', r, now: EARLY + 6 * HOUR - 1 }).result)
      .toMatchObject({ actorDelta: 2, targetDelta: -2, defence: null });
    expect(draw('potion', 'give', POISON, { actor: KIM, effect: 'harmful', r, now: EARLY + 6 * HOUR }).result.defence).toMatchObject({ key: 'antid' });
    expect(user('alex').glovebox).toEqual({});
    // A helpful potion is never "cured"
    seed('alex', u => { u.glovebox = { antid: 1 }; u.cooldowns = {}; });
    expect(draw('potion', 'give', POTION_LINES.health, { actor: KIM, effect: 'helpful', r: 0, now: EARLY + 13 * HOUR }).result)
      .toMatchObject({ outcome: 'helped', defence: null });
  });

  test('a capped doom on a shielded member is just a 0-point doom: the shield and the day\'s defences are untouched', () => {
    play('rescue', 'rescued', { target: ALEX, now: EARLY });
    const until = loadScores(GUILD).shields.alex;
    const capped = { ...SETTINGS, dailyScoredPlays: 0 };
    for (let i = 1; i <= 3; i++) {
      const { drawn, result } = draw('doom', 'fate', ZOMBIE, { actor: KIM, r: rDoomed(), blockedLines: BLOCKED, settings: capped, now: EARLY + i * MIN });
      expect(drawn.line.outcome).toBe('doomed');
      expect(result).toMatchObject({ outcome: 'doomed', capped: true, actorDelta: 0, targetDelta: 0, defence: null });
    }
    // Even told it was blocked, a capped play uses up nothing
    expect(play('doom', 'blocked', { actor: KIM, target: ALEX, settings: capped, now: EARLY + 4 * MIN }).defence).toBeNull();
    expect(loadScores(GUILD).shields.alex).toBe(until);
    expect(loadScores(GUILD).daily.alex?.defences).toBeUndefined();

    // A scoring doom is still blocked by it
    expect(draw('doom', 'fate', ZOMBIE, { actor: KIM, r: rDoomed(), blockedLines: BLOCKED, now: EARLY + 5 * MIN }).result)
      .toMatchObject({ outcome: 'blocked', defence: { key: 'shield' } });
    expect(loadScores(GUILD).shields.alex).toBeUndefined();
  });

  test('3 defences a day, the shield included: then nothing defends until the next UTC day', () => {
    seed('alex', u => { u.glovebox = { garlic: 1, antid: 2 }; });
    const doom = (now) => draw('doom', 'fate', ZOMBIE, { actor: KIM, r: rDoomed(), blockedLines: BLOCKED, now });
    const poison = (now) => draw('potion', 'give', POISON, { actor: KIM, effect: 'harmful', r: rWorked(), now });

    play('rescue', 'rescued', { target: ALEX, now: EARLY });
    expect(doom(EARLY + MIN).result).toMatchObject({ outcome: 'blocked', defence: { key: 'shield' } });
    expect(doom(EARLY + 2 * MIN).result.defence).toMatchObject({ key: 'garlic' });
    expect(poison(EARLY + 3 * MIN).result.defence).toMatchObject({ key: 'antid' });
    expect(loadScores(GUILD).daily.alex.defences).toBe(3);

    // The second Antidote is off cooldown, but that's three today
    expect(poison(EARLY + 6 * HOUR + 3 * MIN).result).toMatchObject({ targetDelta: -2, defence: null });
    expect(user('alex').glovebox).toEqual({ antid: 1 });
    // …and a fresh shield doesn't block either: it stays up
    play('rescue', 'rescued', { target: ALEX, now: EARLY + 6 * HOUR + 4 * MIN });
    const until = loadScores(GUILD).shields.alex;
    expect(doom(EARLY + 6 * HOUR + 5 * MIN).result).toMatchObject({ outcome: 'doomed', defence: null });
    expect(loadScores(GUILD).shields.alex).toBe(until);

    // A new UTC day, a new three
    expect(poison(Date.UTC(2026, 10, 3, 0, 10)).result.defence).toMatchObject({ key: 'antid' });
  });
});

// ── the items through the real commands ─────────────────────────────────

describe('items through the real commands', () => {
  const commands = {};
  let discord;
  beforeAll(async () => {
    for (const name of ['foodfight', 'doom', 'rescue', 'potion']) commands[name] = await import(`../src/commands/${name}.js`);
  });
  beforeEach(async () => {
    const file = path.join(process.env.GUILD_CONFIGS_DIR, `${GUILD}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
    discord = new FakeDiscord({ guildId: GUILD });
    discord.addUser('sam', { nickname: 'Sam' });
    discord.addUser('alex', { nickname: 'Alex' });
    discord.addUser('kim', { nickname: 'Kim' });
    jest.spyOn(Date, 'now').mockReturnValue(T);
    seed('sam', u => checked(u));
    seed('alex', u => checked(u));
  });
  const openPlay = async (games = {}) => saveGuildConfig(GUILD, { ...(await loadGuildConfig(GUILD)), games: { cooldownSeconds: 0, perMinute: 60, ...games } });
  const member = (id) => ({ user: discord.who(id).user, member: discord.who(id).member });
  async function run(name, userId, subcommand, options) {
    const i = discord.command(userId, name, { subcommand, options });
    await commands[name].execute(i);
    return i.replyMessage;
  }
  const said = (m) => m.content.split('\n')[0];
  const under = (m) => m.content.split('\n').slice(1);
  const fill = (line, user = 'sam', target = '<@alex>') => line.text.replace(/{user}/g, `<@${user}>`).replace(/{target}/g, target);

  test('/doom fate item:vhs — no backfire, ×2, and straight through a shield and Garlic (the shield is used up)', async () => {
    await openPlay();
    play('rescue', 'rescued', { actor: KIM, target: ALEX, now: T - MIN });
    seed('alex', u => { u.glovebox = { garlic: 1 }; });
    seed('sam', u => { u.glovebox = { vhs: 1 }; });
    const r = rWhere(x => pickLine(ZOMBIE, {}, () => x).outcome === 'backfired' && pickLine(ZOMBIE, { backfired: 0 }, () => x).outcome === 'doomed');
    jest.spyOn(Math, 'random').mockReturnValue(r);

    const m = await run('doom', 'sam', 'fate', { target: member('alex'), trope: 'zombie', item: 'vhs' });
    expect(said(m)).toBe(fill(pickLine(ZOMBIE, { backfired: 0 }, () => r)));
    expect(under(m)).toEqual([
      '-# 💀 Doomed! Sam +6 (6 pts) · Alex −1',
      '-# 📼 Cursed VHS: no backfire, and Sam\'s points ×2.',
      '-# 📼 The Cursed VHS tore through Alex\'s shield. The shield is gone.',
    ]);
    const d = loadScores(GUILD);
    expect(d.shields.alex).toBeUndefined();
    expect(d.users.alex.glovebox).toEqual({ garlic: 1 });
    expect(d.users.sam.glovebox).toEqual({});
    expect(d.users.alex.games.doom.all.points).toBe(-1);
  });

  test('/rescue attempt item:holyw — can\'t be caught, +2 more, and a shield 3× as long', async () => {
    await openPlay();
    seed('sam', u => { u.glovebox = { holyw: 1 }; });
    const lines = RESCUE_LINES['final-girl'];
    const r = rOn(lines, 'caught');
    jest.spyOn(Math, 'random').mockReturnValue(r);
    const landed = pickLine(lines, { caught: 0 }, () => r);
    expect(landed.outcome).toBe('rescued');

    const m = await run('rescue', 'sam', 'attempt', { target: member('alex'), trope: 'final-girl', item: 'holyw' });
    expect(said(m)).toBe(fill(landed));
    const until = T + 3 * HOUR;
    expect(under(m)).toEqual([
      `-# 🛟 Rescued! Sam +3 (3 pts) · Alex +2 · 🛡️ Alex is shielded from /doom until <t:${Math.floor(until / 1000)}:t>`,
      '-# 💧 Holy Water: no getting caught, and Sam +2 more. The shield lasts 3× as long.',
    ]);
    expect(loadScores(GUILD).shields.alex).toBe(until);
  });

  test('/potion give item:penny — it works, ×2; and the receiver\'s Antidote still applies', async () => {
    await openPlay();
    seed('sam', u => { u.glovebox = { penny: 2 }; });
    const r = rOn(POISON, 'backfired');
    jest.spyOn(Math, 'random').mockReturnValue(r);
    const give = () => run('potion', 'sam', 'give', { user: member('alex'), type: 'poison', item: 'penny' });

    const first = await give();
    expect(said(first)).toBe(pickLine(POISON, { backfired: 0 }, () => r).text.replace(/{giver}/g, '<@sam>').replace(/{receiver}/g, '<@alex>'));
    expect(under(first)).toEqual([
      '-# ☠️ It worked! Sam +4 (4 pts) · Alex −2',
      '-# 🍀 Lucky Penny: the potion works, and Sam\'s points ×2.',
    ]);

    seed('alex', u => { u.glovebox = { antid: 1 }; });
    const second = await give();
    expect(under(second)).toEqual([
      '-# ☠️ It worked! Sam +2 (6 pts · 🔥 2 in a row) · Alex ±0',
      '-# 🍀 Lucky Penny: the potion works, and Sam\'s points ×2.',
      '-# 💊 Alex\'s Antidote: no harm done, and Sam gets less for it. It\'s used up, and another can\'t work for 6 h.',
    ]);
    const d = loadScores(GUILD);
    expect([d.users.sam.games.potion.all.points, d.users.alex.games.potion.all.points]).toEqual([6, -2]);
    expect([d.users.sam.glovebox, d.users.alex.glovebox, d.users.alex.cooldowns]).toEqual([{}, {}, { antid: T + 6 * HOUR }]);
    expect([d.daily.sam.itemUses, d.daily.alex.defences]).toEqual([2, 1]);
  });

  test('past the daily cap an item is ignored completely: not applied, not used up, and the reply says so', async () => {
    await openPlay({ dailyScoredPlays: 0 });
    seed('sam', u => { u.glovebox = { gpie: 1 }; });
    const pie = FOODFIGHT_LINES.pie;
    const r = rOn(pie, 'backfire');
    jest.spyOn(Math, 'random').mockReturnValue(r);

    const m = await run('foodfight', 'sam', 'throw', { target: member('alex'), food: 'pie', item: 'gpie' });
    expect(said(m)).toBe(pie[Math.floor(r * pie.length)].text.replace(/{thrower}/g, '<@sam>').replace(/{target}/g, '<@alex>'));
    expect(under(m)).toEqual([
      '-# Sam reached today\'s Food Fight scoring cap: just for fun now.',
      '-# 🥧 Golden Pie stayed in Sam\'s Glovebox: plays past today\'s scoring cap don\'t use items.',
    ]);
    expect(user('sam').glovebox).toEqual({ gpie: 1 });
    expect(loadScores(GUILD).daily.sam.itemUses).toBeUndefined();
  });

  test('a 4th item in a day is refused privately, before the cooldown is spent', async () => {
    await saveGuildConfig(GUILD, { ...(await loadGuildConfig(GUILD)), games: { perMinute: 60 } }); // the usual 20 s cooldown
    seed('sam', u => { u.glovebox = { vhs: 1 }; });
    mutateScores(GUILD, d => { d.daily.sam = { day: '2026-11-02', plays: {}, itemUses: 3 }; });

    const refused = await run('doom', 'sam', 'fate', { target: member('alex'), item: 'vhs' });
    expect([refused.ephemeralFor, refused.content]).toEqual(['sam', ITEM_REFUSALS.limit()]);
    expect(user('sam').games).toEqual({});
    // No cooldown started: the same doom without the item goes straight through
    const played = await run('doom', 'sam', 'fate', { target: member('alex') });
    expect(played.ephemeralFor).toBeNull();
    expect(user('sam').glovebox).toEqual({ vhs: 1 });
  });

  test('two /potion gives racing for the last Lucky Penny use it exactly once', async () => {
    await openPlay();
    seed('sam', u => { u.glovebox = { penny: 1 }; });
    jest.spyOn(Math, 'random').mockReturnValue(rOn(POISON, 'backfired'));
    const give = () => run('potion', 'sam', 'give', { user: member('alex'), type: 'poison', item: 'penny' });
    const [a, b] = await Promise.all([give(), give()]);
    const posted = [a, b].filter(m => !m.ephemeralFor);
    // One used it (it worked, ×2). The other either lost the race inside
    // the play (posted without it, and says so) or before it (refused
    // privately) — never a second use.
    expect(posted.filter(m => under(m)[0] === '-# ☠️ It worked! Sam +4 (4 pts) · Alex −2')).toHaveLength(1);
    const loser = [a, b].find(m => m.ephemeralFor || under(m)[0] !== '-# ☠️ It worked! Sam +4 (4 pts) · Alex −2');
    if (loser.ephemeralFor) {
      expect(loser.content).toBe(ITEM_REFUSALS.missing('penny'));
    } else {
      // Drawn from the whole pool, as if no item was asked for: the backfire
      // the random number lands on, not the Penny's sure thing
      expect(under(loser)).toEqual([
        '-# 🔄 Backfired! Sam −2 (2 pts) · Alex +1',
        '-# Sam\'s 🍀 Lucky Penny was already used up, so this play went ahead without it.',
      ]);
    }
    expect(loadScores(GUILD).daily.sam.itemUses).toBe(1);
    expect(user('sam').glovebox).toEqual({});
  });

  test('a long line is trimmed to fit 2000 characters — never the points or what the play earned', async () => {
    seed('sam', u => { u.progress = { hits: 24 }; });
    const i = discord.command('sam', 'foodfight', { subcommand: 'throw', options: {} });
    await finishPlay(i, { game: 'foodfight', action: 'throw', target: ROLE, lines: [{ text: `<@sam> ${'🥧'.repeat(1200)}`, outcome: 'hit' }], settings: SETTINGS });
    const content = i.replyMessage.content;
    expect(content.length).toBeLessThanOrEqual(2000);
    expect(content.split('\n').slice(1)).toEqual(['-# 🎯 Hit! Sam +3 (6 pts)', '-# 🎁 25 hits! Sam gets a 🥧 Golden Pie and +3.']);
    expect(said(i.replyMessage)).toMatch(/^<@sam> (🥧)+…$/);
  });
});

// ── nights in a row ─────────────────────────────────────────────────────

describe('nights in a row', () => {
  beforeEach(() => seed('sam', u => checked(u)));
  const nights = () => user('sam').nights;

  test('a night runs 12:00 to 12:00 UTC: 23:00 and 02:00 the next day are one night; 13:00 is the next', () => {
    play('foodfight', 'miss', { now: Date.UTC(2026, 10, 2, 23, 0) });
    play('foodfight', 'miss', { now: Date.UTC(2026, 10, 3, 2, 0) });
    expect(nights()).toMatchObject({ last: '2026-11-02', current: 1, best: 1, recent: ['2026-11-02'] });
    play('foodfight', 'miss', { now: Date.UTC(2026, 10, 3, 13, 0) });
    expect(nights()).toMatchObject({ last: '2026-11-03', current: 2, best: 2, recent: ['2026-11-02', '2026-11-03'] });
  });

  test('3 nights: a Night Light and the Regular tier, whose +1 is on the first 3 good outcomes of the day only', () => {
    play('foodfight', 'hit', { now: night(2) });
    play('foodfight', 'hit', { now: night(3) });
    const third = play('foodfight', 'hit', { now: night(4) });
    const regular = { key: 'regular', name: 'Regular', emoji: '🌙', at: 3, buffs: 3 };
    expect(third.nights).toEqual({ current: 3, best: 3, saved: false, milestone: regular, buff: { tier: regular, used: 1 } });
    expect(third.rewards).toEqual([{ kind: 'nightlight', who: 'actor', userId: 'sam', current: 3, overflow: false }]);
    expect([third.actorDelta, third.bonus]).toEqual([3, 1]);
    expect(extraLines(third, { actor: 'Sam', target: null })).toEqual([
      '-# 🌙 3 nights in a row: Sam is a Regular now, +1 on the first 3 good plays each day.',
      '-# 🌙 Regular: +1 (1 of 3 today)',
      '-# 🔦 3 nights in a row! A Night Light for Sam\'s Glovebox: it saves the row if a night is missed.',
    ]);
    expect(user('sam').glovebox).toEqual({ nlight: 1 });
    // A Night Light isn't one of the day's 2 prizes
    expect(loadScores(GUILD).daily.sam.prizes).toBeUndefined();

    const buffs = ['hit', 'miss', 'hit', 'hit'].map((o, i) => play('foodfight', o, { now: night(4) + (i + 1) * MIN }).bonus);
    expect(buffs).toEqual([1, 0, 1, 0]); // a miss neither earns one nor uses one up
    expect(user('sam').games.foodfight.all.bonus).toBe(3);
  });

  test('a Night Light saves exactly one missed night, at most once in any 7 days', () => {
    for (const d of [2, 3, 4]) play('foodfight', 'miss', { now: night(d) }); // a Night Light at 3
    // The 5th is missed
    const saved = play('foodfight', 'miss', { now: night(6) });
    expect(saved.nights).toMatchObject({ current: 4, saved: true });
    expect(extraLines(saved, { actor: 'Sam', target: null })).toEqual(['-# 🔦 Sam\'s Night Light saved the night they missed: 4 nights in a row.']);
    expect(nights()).toMatchObject({ current: 4, saved: ['2026-11-05'], lightUsedAt: night(6) });
    expect(user('sam').glovebox).toEqual({});
    expect(getPlayerCardExtras(GUILD, 'sam', { now: night(6) + MIN }).nights).toEqual({
      current: 4,
      best: 4,
      tier: { key: 'regular', name: 'Regular', emoji: '🌙' },
      next: { at: 7, name: 'Night Owl' },
      row: [...Array(9).fill('missed'), 'played', 'played', 'played', 'saved', 'played'],
    });

    // Another light, but the last one burned 3 days ago: the row breaks, the light stays
    seed('sam', u => { u.glovebox = { nlight: 1 }; });
    play('foodfight', 'miss', { now: night(7) });
    expect(play('foodfight', 'miss', { now: night(9) }).nights).toMatchObject({ current: 1, saved: false });
    expect(user('sam').glovebox).toEqual({ nlight: 1 });

    // Rebuilt to 3: another light, but one's held, so +2
    play('foodfight', 'miss', { now: night(10) });
    const full = play('foodfight', 'miss', { now: night(11) });
    expect(full.rewards).toEqual([{ kind: 'nightlight', who: 'actor', userId: 'sam', current: 3, overflow: true }]);
    expect(full.bonus).toBe(2);
    // A week after the last one burned, it can save a night again
    expect(play('foodfight', 'miss', { now: night(13) }).nights).toMatchObject({ current: 4, saved: true });

    // Two missed nights break the row, whatever's held
    seed('sam', u => { u.glovebox = { nlight: 1 }; });
    expect(play('foodfight', 'miss', { now: night(16) }).nights).toMatchObject({ current: 1, saved: false });
    expect(user('sam').glovebox).toEqual({ nlight: 1 });
  });

  test('the card shows the row as it stands now: tonight unplayed, and 0 once it\'s broken', () => {
    for (const d of [2, 3, 4]) play('foodfight', 'miss', { now: night(d) });
    seed('sam', u => { u.glovebox = {}; });
    const at = (now) => getPlayerCardExtras(GUILD, 'sam', { now }).nights;
    expect(at(Date.UTC(2026, 10, 5, 13, 0))).toMatchObject({ current: 3, row: [...Array(10).fill('missed'), 'played', 'played', 'played', 'tonight'] });
    // The 5th missed and no light: broken
    expect(at(Date.UTC(2026, 10, 6, 13, 0))).toMatchObject({ current: 0, best: 3, tier: null, next: { at: 3, name: 'Regular' } });
    // …unless a Night Light can still save it
    seed('sam', u => { u.glovebox = { nlight: 1 }; });
    expect(at(Date.UTC(2026, 10, 6, 13, 0)).current).toBe(3);
  });
});

// ── titles ──────────────────────────────────────────────────────────────

describe('titles', () => {
  test('crossing a title\'s line earns it once, for +10', () => {
    seed('sam', u => { checked(u); u.games.foodfight = { all: stats({ plays: 149, counts: { hit: 149 }, bestStreak: 1 }) }; });
    const r = play('foodfight', 'hit');
    expect(r.titles).toEqual([{ who: 'actor', userId: 'sam', key: 'pie-sniper' }]);
    expect([r.actorDelta, r.bonus, r.actorPoints]).toEqual([3, 10, 13]);
    expect(user('sam').titles.earned).toEqual({ 'pie-sniper': T });
    expect(extraLines(r, { actor: 'Sam', target: null })).toEqual(['-# 📜 Sam earned a title: 🥧 Pie Sniper (+10). Show it with /scoreboard title:']);
    expect(play('foodfight', 'hit', { now: T + MIN }).titles).toEqual([]);
  });

  test('a target earns theirs too: splatted for the 150th time', () => {
    seed('alex', u => { checked(u); u.games.foodfight = { all: stats({ received: { hit: 149 } }) }; });
    const r = play('foodfight', 'hit', { target: ALEX });
    expect(r.titles).toEqual([{ who: 'target', userId: 'alex', key: 'dartboard' }]);
    expect(r.targetBonus).toBe(10);
    expect(user('alex').games.foodfight.all).toMatchObject({ points: 9, receivedPoints: -1, bonus: 10 });
    expect(extraLines(r, { actor: 'Sam', target: 'Alex' })).toEqual(['-# 📜 Alex earned a title: 🎯 Human Dartboard (+10). Show it with /scoreboard title:']);
  });

  test('capped plays count toward no title: 165 capped hits on a friend, then a scored play, pays nobody', () => {
    const capped = { ...DEFAULT_GAME_SETTINGS, dailyScoredPlays: 5 };
    for (let i = 0; i < 170; i++) play('foodfight', 'hit', { target: ALEX, settings: capped, now: EARLY + i * 21000 });
    // The card's stats count every play, as they always have…
    expect(user('alex').games.foodfight.all.received.hit).toBe(170);
    expect(user('sam').games.foodfight.all).toMatchObject({ counts: { hit: 170 }, bestStreak: 170 });
    // …titles count the 5 that scored
    expect(user('sam').lifetime).toEqual({ do: { foodfight: { hit: 5 } }, got: {}, streak: { foodfight: 5 }, bestStreak: 5 });
    expect(user('alex').lifetime.got).toEqual({ foodfight: { hit: 5 } });
    expect(user('sam').titles.earned).toEqual({});

    // Alex's next scored play checks them both: no Human Dartboard, no Pie Sniper, no streak titles
    const r = play('foodfight', 'tasty', { actor: { id: 'alex', name: 'Alex' }, target: { kind: 'member', pingUserIds: ['sam'], name: 'Sam' }, settings: capped, now: EARLY + 200 * 21000 });
    expect([r.titles, r.bonus, r.targetBonus]).toEqual([[], 0, 0]);
    expect([user('alex').titles.earned, user('sam').titles.earned]).toEqual([{}, {}]);
  });

  test('a capped play neither extends nor breaks the streak the streak titles count', () => {
    const capped = { ...DEFAULT_GAME_SETTINGS, dailyScoredPlays: 9 };
    for (let i = 0; i < 9; i++) play('foodfight', 'hit', { settings: capped, now: EARLY + i * MIN });
    play('foodfight', 'miss', { settings: capped, now: EARLY + 10 * MIN }); // capped: would end it
    play('foodfight', 'hit', { settings: capped, now: EARLY + 11 * MIN }); // capped: would be the 10th
    expect(user('sam').lifetime.streak.foodfight).toBe(9);
    expect(user('sam').titles.earned).toEqual({});
    // Tomorrow's first hit scores: the 10th in a row that counts
    const r = play('foodfight', 'hit', { settings: capped, now: Date.UTC(2026, 10, 3, 1, 0) });
    expect(r.titles).toEqual([{ who: 'actor', userId: 'sam', key: 'on-fire' }]);
    // The card's streak still counts every play: the capped miss broke it there
    expect(user('sam').games.foodfight.all.streak).toBe(2);
  });

  test('a veteran\'s titles from before R3 are granted silently, with no points', () => {
    seed('sam', u => { u.games.foodfight = { all: stats({ points: 500, plays: 200, counts: { hit: 200 }, bestStreak: 12 }) }; });
    // Not yet checked: the card shows what they'd be granted
    expect(getPlayerCardExtras(GUILD, 'sam', { now: T }).titles.earned.map(t => [t.key, t.at])).toEqual([['pie-sniper', null], ['on-fire', null]]);
    const r = play('foodfight', 'miss');
    expect([r.titles, r.bonus]).toEqual([[], 0]);
    expect(user('sam').titles).toEqual({ earned: { 'pie-sniper': T, 'on-fire': T }, shown: null });
    // Their title counts start from the all-time stats, once; then only scored plays move them
    expect(user('sam').lifetime).toEqual({ do: { foodfight: { hit: 200, miss: 1 } }, got: {}, streak: { foodfight: 0 }, bestStreak: 12 });
    expect(user('sam').games.foodfight.all.points).toBe(499);
    expect(extraLines(r, { actor: 'Sam', target: null })).toEqual([]);
  });

  test('a shown title must be earned; it rides on the leaderboard row', () => {
    seed('sam', u => checked(u, { 'pie-sniper': T }));
    play('foodfight', 'hit');
    expect(setShownTitle(GUILD, 'sam', 'pie-sniper')).toEqual({ ok: true, shown: 'pie-sniper' });
    expect(getLeaderboard(GUILD, 'all', 'all-time', {}, T).rows[0].shownTitle).toEqual({ key: 'pie-sniper', title: 'Pie Sniper', badge: '🥧' });
    expect(setShownTitle(GUILD, 'sam', 'dartboard')).toEqual({ ok: false, reason: 'notEarned' });
    expect(setShownTitle(GUILD, 'sam', 'nonsense')).toEqual({ ok: false, reason: 'unknown' });
    expect(setShownTitle(GUILD, 'nobody', 'pie-sniper')).toEqual({ ok: false, reason: 'notEarned' });
    expect(loadScores(GUILD).users.nobody).toBeUndefined();
    expect(setShownTitle(GUILD, 'sam', null)).toEqual({ ok: true, shown: null });
    expect(getLeaderboard(GUILD, 'all', 'all-time', {}, T).rows[0].shownTitle).toBeNull();
  });
});

describe('keys an object inherits are not items, titles or outcomes', () => {
  const INHERITED = ['constructor', '__proto__', 'toString', 'hasOwnProperty'];

  test('refused as unknown, whatever the member holds or has earned', () => {
    seed('sam', u => { checked(u, { 'pie-sniper': T }); u.glovebox = { gpie: 1 }; u.games.foodfight = { all: stats({ points: 3, plays: 1, counts: { hit: 1 } }) }; });
    const data = loadScores(GUILD);
    for (const key of INHERITED) {
      expect(`${key}: ${itemProblem(data, 'sam', key, { game: 'foodfight', action: 'throw' }, T)}`).toBe(`${key}: unknown`);
      expect(`${key}: ${JSON.stringify(setShownTitle(GUILD, 'sam', key))}`).toBe(`${key}: {"ok":false,"reason":"unknown"}`);
      expect(() => play('foodfight', key)).toThrow(/Unknown outcome/);
    }
    expect(user('sam').titles.shown).toBeNull();
    // A file that somehow holds one shows no title rather than a broken one
    seed('sam', u => { u.titles.shown = 'toString'; });
    expect(getLeaderboard(GUILD, 'all', 'all-time', {}, T).rows[0].shownTitle).toBeNull();
    expect(getPlayerCardExtras(GUILD, 'sam', { now: T }).titles.shown).toBeNull();
  });
});

// ── the card's data ─────────────────────────────────────────────────────

describe('getPlayerCardExtras', () => {
  test('progress, the Glovebox with cooldowns, and the closest titles', () => {
    seed('sam', u => {
      checked(u, { 'on-fire': T });
      u.progress = { hits: 7, rescues: 3, points: 120 };
      u.glovebox = { garlic: 1, gpie: 2, nlight: 1 };
      u.cooldowns = { garlic: T + HOUR, antid: T - HOUR };
      u.nights = { last: '2026-11-02', current: 2, best: 5, recent: ['2026-11-01', '2026-11-02'], saved: [], lightUsedAt: T - 2 * 24 * HOUR };
      u.titles.shown = 'on-fire';
      u.games.doom = { all: stats({ counts: { doomed: 500 }, received: { escaped: 40 } }) };
    });
    const x = getPlayerCardExtras(GUILD, 'sam', { now: T });
    expect(x.progress.map(p => [p.key, p.game, p.icon, p.have, p.need, p.prize.item, p.prize.points, p.waiting])).toEqual([
      ['hits', 'foodfight', 'gpie', 7, 25, 'gpie', 3, false],
      ['tasty', 'foodfight', 'garlic', 0, 15, 'garlic', 3, false],
      ['dooms', 'doom', 'vhs', 0, 25, 'vhs', 3, false],
      ['rescues', 'rescue', 'holyw', 3, 15, 'holyw', 3, false],
      ['helpful', 'potion', 'antid', 0, 15, 'antid', 3, false],
      ['harmful', 'potion', 'penny', 0, 20, 'penny', 3, false],
      ['points', null, 'gift', 120, 750, null, 0, false],
      ['nights', null, 'nlight', 2, 3, 'nlight', 0, false],
    ]);
    expect(x.progress[6].prize).toEqual({ item: null, name: 'A random item', icon: 'gift', points: 0 });
    expect(x.glovebox).toEqual([
      { item: 'gpie', name: 'Golden Pie', icon: 'gpie', count: 2, cap: 3, passive: false, about: 'Throw: a sure hit, your points ×2. Feed: sure tasty, +2 each.', readyAt: null },
      { item: 'garlic', name: 'Garlic', icon: 'garlic', count: 1, cap: 1, passive: true, about: 'Turns a doom on you into an escape. 12 h cooldown.', readyAt: T + HOUR },
      { item: 'nlight', name: 'Night Light', icon: 'nlight', count: 1, cap: 1, passive: true, about: 'Saves your nights row when you miss a night. Once a week.', readyAt: T + 5 * 24 * HOUR },
    ]);
    expect(x.titles.shown).toEqual({ key: 'on-fire', title: 'On Fire', badge: '🔥' });
    expect(x.titles.earned).toEqual([{ key: 'on-fire', title: 'On Fire', badge: '🔥', at: T }]);
    // Cockroach 40/50, Night Owl 5/7, Grim Reaper 500/1000
    expect(x.titles.next.map(t => [t.key, t.have, t.need])).toEqual([['cockroach', 40, 50], ['night-owl', 5, 7], ['grim-reaper', 500, 1000]]);
  });

  test('someone who has never played: zeros, an empty row but tonight, no titles', () => {
    const x = getPlayerCardExtras(GUILD, 'nobody', { now: T });
    expect(x.glovebox).toEqual([]);
    expect(x.nights).toEqual({ current: 0, best: 0, tier: null, next: { at: 3, name: 'Regular' }, row: [...Array(13).fill('missed'), 'tonight'] });
    expect(x.titles).toMatchObject({ shown: null, earned: [] });
    expect(x.progress.every(p => p.have === 0)).toBe(true);
  });
});

// ── resets and the file ─────────────────────────────────────────────────

describe('resets', () => {
  beforeEach(() => {
    seed('sam', u => {
      checked(u, { 'pie-sniper': T });
      u.glovebox = { gpie: 1, garlic: 1 };
      u.progress = { hits: 5, tasty: 2, dooms: 3, points: 40 };
      u.waiting = { hits: '2026-11-02', dooms: '2026-11-02' };
      u.cooldowns = { garlic: T + HOUR };
    });
    play('foodfight', 'miss');
    play('doom', 'escaped');
    play('rescue', 'rescued', { target: { kind: 'member', pingUserIds: ['sam'], name: 'Sam' }, actor: KIM });
  });

  test('one game: its stats and its prize counters go; titles, the Glovebox and the points counter stay', () => {
    expect(resetScores(GUILD, { game: 'foodfight', userId: 'sam' })).toBe(1);
    const sam = user('sam');
    expect(sam.games.foodfight).toBeUndefined();
    // 40, and the +2 Kim's rescue gave him: points as a target count
    expect(sam.progress).toEqual({ dooms: 3, points: 42 });
    expect(sam.waiting).toEqual({ dooms: '2026-11-02' });
    expect(sam.glovebox).toEqual({ gpie: 1, garlic: 1 });
    expect(sam.titles.earned).toEqual({ 'pie-sniper': T });
    expect(sam.nights.current).toBe(1);
  });

  test('a person: everything of theirs, the day\'s counters and their shield included', () => {
    expect(loadScores(GUILD).shields.sam).toBeGreaterThan(T);
    expect(resetScores(GUILD, { userId: 'sam' })).toBe(1);
    const d = loadScores(GUILD);
    expect([d.users.sam, d.daily.sam, d.shields.sam]).toEqual([undefined, undefined, undefined]);
    expect(d.users.kim).toBeDefined();
  });
});

describe('the scores file', () => {
  // The worker's directory outlives this file (tests/jest.setup.js): a
  // damaged copy left by an earlier, failed run must not count in this one
  const dir = process.env.GUILD_GAMES_DIR;
  const damaged = () => fs.readdirSync(dir).filter(f => f.startsWith(`${GUILD}.json.damaged-`));
  const clearDamaged = () => { for (const f of damaged()) fs.unlinkSync(path.join(dir, f)); };

  test('a damaged file is recovered from the .bak the last save kept, and moved aside', () => {
    clearDamaged();
    try {
      play('foodfight', 'hit');
      play('foodfight', 'hit', { now: T + MIN });
      const file = path.join(dir, `${GUILD}.json`);
      fs.writeFileSync(file, '{"users": {"sam"'); // a half-written save
      const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      // The .bak is the save before the last one: one hit
      expect(loadScores(GUILD).users.sam.games.foodfight.all.points).toBe(3);
      expect(spy).toHaveBeenCalledWith(expect.stringMatching(/restored the previous save/));
      expect(JSON.parse(fs.readFileSync(file, 'utf8')).users.sam.games.foodfight.all.points).toBe(3);
      expect(damaged()).toHaveLength(1);
    } finally {
      clearDamaged();
    }
  });
});

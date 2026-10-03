/**
 * The game score store (src/utils/gameScores.js): the points table, who gets
 * scored, the daily cap, periods, streaks, shields, play limits, channel
 * rules, the leaderboard and resets. Clock-driven: every call takes `now`.
 *
 * The commands that use it are driven end to end in
 * tests/game-commands.test.js.
 *
 * Run with: npm test -- tests/game-scores.test.js
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import {
  POINTS, DEFAULT_GAME_SETTINGS, getGameSettings, channelAllowed, recordPlay, loadScores,
  shieldedUntil, getScoreboard, getLeaderboard, resetScores, deleteScores,
  checkPlayLimit, resetPlayLimits, resultLine,
} from '../src/utils/gameScores.js';
import { tagged } from '../src/utils/gamePlay.js';

const GUILD = 'scores-guild';
const NOW = Date.UTC(2026, 9, 15, 12, 0, 0); // 15 Oct 2026, noon UTC
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

const member = (id) => ({ kind: 'member', pingUserIds: [id], name: id.toUpperCase(), mention: `<@${id}>` });
const ROLE = { kind: 'role', pingUserIds: [], name: 'Mods', mention: '<@&mods>' };
const EVERYONE = { kind: 'everyone', pingUserIds: [], name: '@everyone', mention: '@everyone' };
const sam = { id: 'sam', name: 'Sam' };

const play = (game, outcome, { actor = sam, target = member('alex'), effect, settings, now = NOW } = {}) =>
  recordPlay(GUILD, { game, actor, target, outcome, effect, settings }, now);
const allPoints = (userId, game) => loadScores(GUILD).users[userId]?.games?.[game]?.all?.points ?? null;

beforeEach(() => {
  deleteScores(GUILD);
  resetPlayLimits();
});

describe('the points table', () => {
  // Every row Doug signed off on, actor and target
  const rows = Object.entries(POINTS).flatMap(([game, outcomes]) =>
    Object.entries(outcomes).map(([outcome, [a, t]]) => [game, outcome, a, t]));

  test.each(rows)('%s %s: actor %i, target %i', (game, outcome, a, t) => {
    const r = play(game, outcome);
    expect(r.actorDelta).toBe(a);
    expect(r.targetDelta).toBe(t);
    expect(allPoints('sam', game)).toBe(a);
    expect(allPoints('alex', game)).toBe(t);
  });

  test('the table is the one agreed', () => {
    expect(POINTS).toEqual({
      foodfight: { hit: [3, -1], miss: [-1, 1], backfire: [-2, 2], tasty: [1, 2], gross: [-1, -1], spill: [-2, 1] },
      doom: { doomed: [3, -1], escaped: [-1, 2], backfired: [-2, 1], blocked: [0, 0] },
      rescue: { rescued: [1, 2], caught: [-1, -1], sacrificed: [-2, 3] },
      potion: { helped: [1, 2], hurt: [2, -2], backfired: [-2, 1] },
    });
  });

  test('a potion that worked scores by what it does', () => {
    expect(play('potion', 'worked', { effect: 'helpful' }).outcome).toBe('helped');
    expect(play('potion', 'worked', { effect: 'harmful', target: member('kim') }).outcome).toBe('hurt');
    expect(allPoints('alex', 'potion')).toBe(2);
    expect(allPoints('kim', 'potion')).toBe(-2);
    expect(allPoints('sam', 'potion')).toBe(3);
  });

  test('an unknown outcome is an error, not a silent zero', () => {
    expect(() => play('doom', 'hit')).toThrow(/Unknown outcome/);
  });
});

describe('who gets scored', () => {
  test.each([['a role', ROLE], ['@everyone', EVERYONE], ['yourself', member('sam')]])('at %s: only the player', (_, target) => {
    const r = play('foodfight', 'hit', { target });
    expect(r.actorDelta).toBe(3);
    expect(r.targetDelta).toBeNull();
    expect(r.targetId).toBeNull();
    expect(Object.keys(loadScores(GUILD).users)).toEqual(['sam']);
  });

  test('what a target received is counted for them', () => {
    play('foodfight', 'hit');
    play('foodfight', 'hit', { now: NOW + 1 });
    const alex = loadScores(GUILD).users.alex.games.foodfight.all;
    expect(alex.received).toEqual({ hit: 2 });
    expect(alex.receivedPoints).toBe(-2);
    expect(alex.plays).toBe(0); // received, never played
  });
});

describe('the daily cap', () => {
  const settings = { ...DEFAULT_GAME_SETTINGS, dailyScoredPlays: 2 };

  test('plays past the cap count, unscored, and the next UTC day scores again', () => {
    expect(play('foodfight', 'hit', { settings }).scored).toBe(true);
    expect(play('foodfight', 'hit', { settings }).scored).toBe(true);
    const third = play('foodfight', 'hit', { settings });
    expect(third).toMatchObject({ scored: false, capped: true, actorDelta: 0, targetDelta: 0 });
    expect(allPoints('sam', 'foodfight')).toBe(6);
    expect(allPoints('alex', 'foodfight')).toBe(-2);
    const s = loadScores(GUILD).users.sam.games.foodfight.all;
    expect(s.plays).toBe(3);
    expect(s.scoredPlays).toBe(2);

    // Another game has its own cap
    expect(play('doom', 'doomed', { settings }).scored).toBe(true);

    // Midnight UTC resets it (noon + 12h)
    expect(play('foodfight', 'hit', { settings, now: NOW + 12 * 60 * MIN }).scored).toBe(true);
    expect(allPoints('sam', 'foodfight')).toBe(9);
  });

  test('the cap note says so', () => {
    const r = play('foodfight', 'hit', { settings: { ...settings, dailyScoredPlays: 0 } });
    expect(resultLine('foodfight', r, { actor: 'Sam', target: 'ALEX' })).toBe('-# Sam reached today\'s Food Fight scoring cap: just for fun now.');
  });
});

describe('periods', () => {
  test('month, year and all time are kept apart, in UTC', () => {
    const dec = Date.UTC(2026, 11, 31, 23, 30);
    const jan = Date.UTC(2027, 0, 1, 0, 30); // an hour later, a new year
    play('foodfight', 'hit', { now: dec });
    play('foodfight', 'miss', { now: jan });

    expect(getScoreboard(GUILD, 'sam', 'all-time', jan).total).toBe(2);
    expect(getScoreboard(GUILD, 'sam', 'year', jan).total).toBe(-1);
    expect(getScoreboard(GUILD, 'sam', 'month', jan).total).toBe(-1);
    expect(getScoreboard(GUILD, 'sam', 'year', dec).total).toBe(3);
    // Nothing yet in February
    expect(getScoreboard(GUILD, 'sam', 'month', Date.UTC(2027, 1, 2)).games.foodfight).toBeNull();
  });
});

describe('streaks', () => {
  test('good outcomes extend it, bad ones end it, a blocked doom does neither', () => {
    play('foodfight', 'hit');
    expect(play('foodfight', 'hit').streak).toBe(2);
    expect(play('foodfight', 'miss').streak).toBe(0);
    expect(play('foodfight', 'hit').streak).toBe(1);
    expect(loadScores(GUILD).users.sam.games.foodfight.all.bestStreak).toBe(2);

    play('doom', 'doomed');
    play('doom', 'doomed');
    expect(play('doom', 'blocked').streak).toBe(2);
    expect(play('doom', 'doomed').streak).toBe(3);
  });

  test('two in a row shows on the points line', () => {
    play('foodfight', 'hit');
    const r = play('foodfight', 'hit');
    expect(resultLine('foodfight', r, { actor: 'Sam', target: 'Alex' }, { label: '🎯 Hit!' }))
      .toBe('-# 🎯 Hit! Sam +3 (6 pts · 🔥 2 in a row) · Alex −1');
  });
});

describe('shields', () => {
  test('a rescue shields the member for the set minutes; the next doom is blocked and uses it up', () => {
    const r = play('rescue', 'rescued');
    expect(r.shieldedUntil).toBe(NOW + 60 * MIN);
    expect(shieldedUntil(GUILD, 'alex', NOW + 59 * MIN)).toBe(NOW + 60 * MIN);
    expect(shieldedUntil(GUILD, 'alex', NOW + 60 * MIN)).toBeNull(); // expired

    const blocked = play('doom', 'blocked', { actor: { id: 'kim', name: 'Kim' }, now: NOW + MIN });
    expect(blocked).toMatchObject({ actorDelta: 0, targetDelta: 0 });
    expect(shieldedUntil(GUILD, 'alex', NOW + 2 * MIN)).toBeNull();
  });

  test('a sacrifice shields too; being caught does not', () => {
    play('rescue', 'sacrificed');
    play('rescue', 'caught', { target: member('kim') });
    expect(shieldedUntil(GUILD, 'alex', NOW)).not.toBeNull();
    expect(shieldedUntil(GUILD, 'kim', NOW)).toBeNull();
  });

  test('rescuing a role shields no one; shield-minutes 0 turns shields off', () => {
    expect(play('rescue', 'rescued', { target: ROLE }).shieldedUntil).toBeNull();
    expect(play('rescue', 'rescued', { settings: { ...DEFAULT_GAME_SETTINGS, shieldMinutes: 0 } }).shieldedUntil).toBeNull();
    expect(loadScores(GUILD).shields).toEqual({});
  });

  test('a shield is in the file, so a restart keeps it', () => {
    play('rescue', 'rescued');
    const file = path.join(process.env.GUILD_GAMES_DIR, `${GUILD}.json`);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).shields.alex).toBe(NOW + 60 * MIN);
  });
});

describe('play limits', () => {
  const settings = DEFAULT_GAME_SETTINGS;

  test('the same game waits out its cooldown; another game does not', () => {
    expect(checkPlayLimit(GUILD, 'sam', 'doom', settings, NOW).ok).toBe(true);
    const again = checkPlayLimit(GUILD, 'sam', 'doom', settings, NOW + 5000);
    expect(again).toEqual({ ok: false, message: '⏳ Doom cooldown: 15s. Try another game meanwhile!' });
    expect(checkPlayLimit(GUILD, 'sam', 'potion', settings, NOW + 5000).ok).toBe(true);
    expect(checkPlayLimit(GUILD, 'sam', 'doom', settings, NOW + 20000).ok).toBe(true);
    // Someone else isn't held up by Sam
    expect(checkPlayLimit(GUILD, 'kim', 'doom', settings, NOW + 5000).ok).toBe(true);
  });

  test('at most perMinute plays across all games; a refusal does not use one up', () => {
    const s = { ...settings, cooldownSeconds: 0, perMinute: 3 };
    for (let i = 0; i < 3; i++) expect(checkPlayLimit(GUILD, 'sam', 'foodfight', s, NOW + i * 1000).ok).toBe(true);
    const refused = checkPlayLimit(GUILD, 'sam', 'potion', s, NOW + 10000);
    expect(refused.ok).toBe(false);
    expect(refused.message).toBe('⏳ Easy there: 3 plays a minute. Next one in 50s.');
    // The first play ages out at NOW + 60s, freeing exactly one slot
    expect(checkPlayLimit(GUILD, 'sam', 'potion', s, NOW + 60000).ok).toBe(true);
    expect(checkPlayLimit(GUILD, 'sam', 'potion', s, NOW + 60500).ok).toBe(false);
  });
});

describe('settings and channel rules', () => {
  test('a config without games, or with nonsense, gets the defaults', () => {
    expect(getGameSettings({})).toEqual(DEFAULT_GAME_SETTINGS);
    expect(getGameSettings({ games: { cooldownSeconds: -5, perMinute: 'lots', channelMode: 'some', channels: 'x' } })).toEqual(DEFAULT_GAME_SETTINGS);
    expect(getGameSettings({ games: { cooldownSeconds: 0, dailyScoredPlays: 5 } })).toMatchObject({ cooldownSeconds: 0, dailyScoredPlays: 5 });
  });

  test('only / except / all, and a thread counts as its channel', () => {
    const only = { ...DEFAULT_GAME_SETTINGS, channelMode: 'only', channels: ['games'] };
    expect(channelAllowed(only, 'games').ok).toBe(true);
    expect(channelAllowed(only, 'thread-1', 'games').ok).toBe(true);
    expect(channelAllowed(only, 'general')).toEqual({ ok: false, message: '🎲 Games are played in <#games> on this server.' });
    expect(channelAllowed({ ...only, channels: [] }, 'games').message).toMatch(/switched off in every channel/);

    const except = { ...DEFAULT_GAME_SETTINGS, channelMode: 'except', channels: ['serious'] };
    expect(channelAllowed(except, 'serious').ok).toBe(false);
    expect(channelAllowed(except, 'thread-2', 'serious').ok).toBe(false);
    expect(channelAllowed(except, 'general').ok).toBe(true);

    expect(channelAllowed({ ...DEFAULT_GAME_SETTINGS, channels: ['serious'] }, 'serious').ok).toBe(true);
  });
});

describe('the leaderboard and resets', () => {
  beforeEach(() => {
    const kim = { id: 'kim', name: 'Kim' };
    play('foodfight', 'hit'); // sam +3, alex −1
    play('foodfight', 'hit', { now: NOW + 1 }); // sam +6, alex −2
    play('doom', 'doomed', { actor: kim }); // kim +3, alex −1
    play('rescue', 'rescued', { actor: kim, target: member('sam') }); // kim +4, sam +8
  });

  test('top players by points, with who received the most', () => {
    const board = getLeaderboard(GUILD, 'all', 'all-time', {}, NOW);
    expect(board.rows.map(r => [r.userId, r.points, r.plays])).toEqual([['sam', 8, 2], ['kim', 4, 2], ['alex', -3, 0]]);
    expect(board.received).toEqual([
      { label: '🎯 Most splatted', userId: 'alex', name: 'ALEX', count: 2 },
      { label: '💀 Most doomed', userId: 'alex', name: 'ALEX', count: 1 },
      { label: '🛟 Most rescued', userId: 'sam', name: 'SAM', count: 1 },
    ]);
    expect(board.bestStreak).toMatchObject({ userId: 'sam', game: 'foodfight', count: 2 });
  });

  test('one game only', () => {
    expect(getLeaderboard(GUILD, 'doom', 'all-time', {}, NOW).rows.map(r => [r.userId, r.points])).toEqual([['kim', 3], ['alex', -1]]);
  });

  test('ranks on the scoreboard follow the same order', () => {
    expect(getScoreboard(GUILD, 'kim', 'all-time', NOW).rank).toBe(2);
    expect(getScoreboard(GUILD, 'kim', 'all-time', NOW).games.doom.rank).toBe(1);
  });

  test('reset one person\'s game, one person, then everyone', () => {
    expect(resetScores(GUILD, { game: 'foodfight', userId: 'sam' })).toBe(1);
    expect(allPoints('sam', 'foodfight')).toBeNull();
    expect(allPoints('sam', 'rescue')).toBe(2);
    expect(allPoints('alex', 'foodfight')).toBe(-2);

    expect(resetScores(GUILD, { userId: 'alex' })).toBe(1);
    expect(loadScores(GUILD).users.alex).toBeUndefined();

    expect(resetScores(GUILD)).toBe(2);
    expect(loadScores(GUILD).users).toEqual({});
    expect(loadScores(GUILD).shields).toEqual({});
  });
});

describe('custom lines saved before outcomes', () => {
  test('a plain string counts as the fallback outcome', () => {
    expect(tagged(['{user} bites {target}', { text: 'x', outcome: 'escaped' }, null, ''], 'doomed'))
      .toEqual([{ text: '{user} bites {target}', outcome: 'doomed' }, { text: 'x', outcome: 'escaped' }]);
  });
});

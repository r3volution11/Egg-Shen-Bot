/**
 * The demo seeder (scripts/game-demo.js) against the real engine: the
 * state it writes must be what the card reads, and "one play away" must be
 * true — the next scored hit really earns the Golden Pie and Pie Sniper,
 * and tonight's play really makes 14 nights. A demo that drifted from the
 * engine would show Doug something the bot would never do.
 *
 * Run with: npm test -- tests/game-demo.test.js
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { runDemo, demoRecord } from '../scripts/game-demo.js';
import { loadScores, deleteScores, recordPlay, mutateScores, resetPlayLimits } from '../src/utils/gameScores.js';
import { getPlayerCardExtras } from '../src/utils/gameCardData.js';
import { layoutGameCard, gameCardData } from '../src/utils/gameCard.js';
import { getScoreboard, GAMES } from '../src/utils/gameScores.js';
import { messageProblems } from '../src/utils/embedFit.js';

const GUILD = 'demo-guild';
const DOUG = 'doug';
const NOW = Date.UTC(2026, 10, 2, 2, 0); // 02:00 UTC: an evening watch party's night
const backup = () => path.join(process.env.GUILD_GAMES_DIR, `${GUILD}.demo-backup.json`);

beforeEach(() => {
  resetPlayLimits();
  deleteScores(GUILD);
  if (fs.existsSync(backup())) fs.unlinkSync(backup());
});

const hit = (now = NOW + 60_000) => recordPlay(GUILD, {
  game: 'foodfight', action: 'throw',
  actor: { id: DOUG, name: 'Doug' },
  target: { kind: 'member', pingUserIds: ['kim'], name: 'Kim' },
  outcome: 'hit',
}, now);

describe('seeding', () => {
  test('the card shows a full Glovebox, titles, a 13-night row, near-complete prizes and statuses', () => {
    expect(runDemo({ guildId: GUILD, userId: DOUG, name: 'Doug', now: NOW }).ok).toBe(true);
    const x = getPlayerCardExtras(GUILD, DOUG, { now: NOW });

    expect(x.glovebox.map(i => [i.item, i.count])).toEqual(expect.arrayContaining([['gpie', 2], ['vhs', 1], ['garlic', 1], ['holyw', 1], ['penny', 2], ['antid', 1], ['nlight', 1]]));
    expect(x.titles.shown).toMatchObject({ key: 'red-shirt' });
    expect(x.titles.earned.map(t => t.key).sort()).toEqual(['cockroach', 'martyr', 'night-owl', 'on-fire', 'red-shirt']);
    expect(x.nights.current).toBe(13);
    expect(x.nights.row.filter(s => s === 'saved')).toHaveLength(1);
    expect(x.nights.row.at(-1)).toBe('tonight');
    expect(x.progress.find(p => p.key === 'hits')).toMatchObject({ have: 24, need: 25 });
    // The streak the card shows agrees with the one titles count
    const board = getScoreboard(GUILD, DOUG, 'all-time', NOW, { games: GAMES });
    expect(board.games.foodfight).toMatchObject({ streak: 14, bestStreak: 14 });
  });

  test('the full card fits Discord\'s limits', () => {
    runDemo({ guildId: GUILD, userId: DOUG, name: 'Doug', now: NOW });
    const board = getScoreboard(GUILD, DOUG, 'all-time', NOW, { games: GAMES });
    const data = gameCardData(board, {
      player: { id: DOUG, name: 'Doug', avatarUrl: null }, shown: GAMES, now: NOW,
      extras: getPlayerCardExtras(GUILD, DOUG, { now: NOW }),
    });
    const { embed } = layoutGameCard(data, { now: NOW });
    expect(messageProblems({ embeds: [embed] })).toEqual([]);
    const fields = embed.data.fields.map(f => f.name).join(' | ');
    expect(fields).toMatch(/Rewards in progress/);
    expect(fields).toMatch(/Nights in a row/);
    expect(fields).toMatch(/Glovebox/);
  });
});

describe('one play away, as the script promises', () => {
  test('the next scored hit earns the Golden Pie, Pie Sniper, 14 nights and Unstoppable', () => {
    runDemo({ guildId: GUILD, userId: DOUG, name: 'Doug', now: NOW });
    const r = hit();
    expect(r.rewards).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'prize', prize: 'hits', item: 'gpie' })]));
    expect(r.titles.map(t => t.key)).toEqual(expect.arrayContaining(['pie-sniper', 'creature', 'unstoppable']));
    expect(r.nights.current).toBe(14);
    expect(loadScores(GUILD).users[DOUG].glovebox.gpie).toBe(3);
  });
});

describe('safety and restoring', () => {
  test('refuses a server where more than three others have played, unless forced', () => {
    for (const id of ['a', 'b', 'c', 'd']) {
      recordPlay(GUILD, { game: 'doom', actor: { id, name: id }, target: { kind: 'everyone', pingUserIds: [], name: '@everyone' }, outcome: 'doomed' }, NOW);
    }
    const res = runDemo({ guildId: GUILD, userId: DOUG, now: NOW });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/real server/);
    expect(loadScores(GUILD).users[DOUG]).toBeUndefined();
    expect(runDemo({ guildId: GUILD, userId: DOUG, force: true, now: NOW }).ok).toBe(true);
  });

  test('--clear puts the member\'s original record back exactly', () => {
    recordPlay(GUILD, { game: 'doom', actor: { id: DOUG, name: 'Doug' }, target: { kind: 'everyone', pingUserIds: [], name: '@everyone' }, outcome: 'doomed' }, NOW - 3600_000);
    const before = JSON.parse(JSON.stringify(loadScores(GUILD)));
    runDemo({ guildId: GUILD, userId: DOUG, now: NOW });
    expect(loadScores(GUILD).users[DOUG].glovebox).toBeDefined();
    expect(runDemo({ guildId: GUILD, userId: DOUG, clear: true, now: NOW }).ok).toBe(true);
    const after = loadScores(GUILD);
    expect(after.users[DOUG]).toEqual(before.users[DOUG]);
    expect(after.daily[DOUG]).toEqual(before.daily[DOUG]);
    expect(after.shields?.[DOUG]).toEqual(before.shields?.[DOUG]);
    expect(fs.existsSync(backup())).toBe(false);
  });

  test('a member who had never played is removed again by --clear', () => {
    runDemo({ guildId: GUILD, userId: DOUG, now: NOW });
    runDemo({ guildId: GUILD, userId: DOUG, clear: true, now: NOW });
    expect(loadScores(GUILD).users[DOUG]).toBeUndefined();
  });

  test('seeding twice keeps the FIRST backup, so --clear still restores the real record', () => {
    mutateScores(GUILD, (d) => { d.users[DOUG] = { name: 'Doug', games: {}, marker: 'original' }; });
    runDemo({ guildId: GUILD, userId: DOUG, now: NOW });
    runDemo({ guildId: GUILD, userId: DOUG, now: NOW });
    runDemo({ guildId: GUILD, userId: DOUG, clear: true, now: NOW });
    expect(loadScores(GUILD).users[DOUG].marker).toBe('original');
  });

  test('the record is a pure function of name and time', () => {
    expect(demoRecord('Doug', NOW)).toEqual(demoRecord('Doug', NOW));
  });
});

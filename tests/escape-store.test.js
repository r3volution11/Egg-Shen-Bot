/**
 * Escape Velocity's event store: the ladder, the run lifecycle, one run a
 * day, the shared daily draw, and the transitions that must happen exactly
 * once across restarts.
 *
 * Run with: npm test -- tests/escape-store.test.js
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import {
  LADDER, bankedAfter, keptOnFailure, tierForStage,
  loadEvent, createDraft, setDraftSelection, scheduleEvent, addQuestions, poolReady,
  markLaunched, rolloverDay, finishEvent, cancelEvent,
  startRun, answer, abortRun, standings, playerStatus, recordCard, markCardDirty,
  listEventGuilds, _deleteEvent, _escapeDir,
} from '../src/utils/escapeStore.js';

const G = 'guild-1';
const DAY = 86_400_000;
const T0 = Date.parse('2026-10-20T12:00:00Z');

/** A pool with `perTier` questions in each tier, each about its own title. */
function makePool(perTier = 8) {
  const qs = [];
  for (let tier = 1; tier <= 5; tier++) {
    for (let i = 0; i < perTier; i++) {
      const sourceId = tier * 1000 + i;
      qs.push({
        key: `year:movie:${sourceId}`,
        media: 'movie',
        genre: 'horror',
        subgenre: i % 2 ? 'slasher' : null,
        tier,
        template: 'year',
        text: `Q${sourceId}?`,
        options: ['a', 'b', 'c', 'd'],
        correctIndex: 0,
        source: { type: 'movie', id: sourceId, title: `T${sourceId}`, year: 2000 },
      });
    }
  }
  return qs;
}

/** A live event with a full pool. */
function liveEvent() {
  createDraft(G, { name: 'Test', startsAt: T0, endsAt: T0 + 7 * DAY, channelId: 'c1', createdBy: 'admin' }, T0 - DAY);
  setDraftSelection(G, { media: ['movie'], genres: ['horror'] });
  scheduleEvent(G);
  addQuestions(G, makePool());
  expect(markLaunched(G, T0).launched).toBe(true);
}

/** Answer the current question right (or wrong). */
function play(userId, { right = true, now = T0 } = {}) {
  const run = Object.values(loadEvent(G).runs).find(r => r.userId === userId && r.status === 'active');
  const q = loadEvent(G).questions[run.questionId];
  const choice = right ? q.correctIndex : (q.correctIndex + 1) % 4;
  return answer(G, { runId: run.id, userId, stage: run.stage, choice }, now);
}

beforeEach(() => {
  _deleteEvent(G);
  for (const f of fs.readdirSync(_escapeDir)) fs.unlinkSync(path.join(_escapeDir, f));
});

describe('the ladder', () => {
  test('clearing a stage banks its value', () => {
    expect(bankedAfter(0)).toBe(0);
    expect(bankedAfter(5)).toBe(1000);
    expect(bankedAfter(15)).toBe(1_000_000);
  });

  test('failing keeps only the last stage separation cleared', () => {
    expect(keptOnFailure(5)).toBe(0); // failed AT 5: separation not cleared
    expect(keptOnFailure(6)).toBe(1000);
    expect(keptOnFailure(10)).toBe(1000);
    expect(keptOnFailure(11)).toBe(32000);
    expect(keptOnFailure(15)).toBe(32000);
  });

  test('three stages per tier, 15 stages over 5 tiers', () => {
    expect([1, 3, 4, 6, 7, 13, 15].map(tierForStage)).toEqual([1, 1, 2, 2, 3, 5, 5]);
    expect(LADDER).toHaveLength(15);
  });
});

describe('launching', () => {
  beforeEach(() => {
    createDraft(G, { name: 'Test', startsAt: T0, endsAt: T0 + 7 * DAY, channelId: 'c1', createdBy: 'admin' }, T0 - DAY);
    setDraftSelection(G, { media: ['movie'], genres: ['horror'] });
  });

  test('needs media and genres before it can be scheduled', () => {
    setDraftSelection(G, { genres: [] });
    expect(scheduleEvent(G).error).toBe('incomplete');
  });

  test('waits for its start time and a ready pool', () => {
    scheduleEvent(G);
    addQuestions(G, makePool(3)); // below the floor
    expect(markLaunched(G, T0 - 1).error).toBe('too-early');
    expect(markLaunched(G, T0).error).toBe('pool-not-ready');
    addQuestions(G, makePool(8));
    expect(poolReady(loadEvent(G))).toBe(true);
    expect(markLaunched(G, T0).launched).toBe(true);
  });

  test('reports the launch exactly once, so the card is posted once', () => {
    scheduleEvent(G);
    addQuestions(G, makePool());
    expect(markLaunched(G, T0).launched).toBe(true);
    expect(markLaunched(G, T0 + 60_000).launched).toBeUndefined();
  });

  test('does not add the same question twice', () => {
    scheduleEvent(G);
    expect(addQuestions(G, makePool()).added).toBe(40);
    expect(addQuestions(G, makePool()).added).toBe(0);
  });

  test('refuses a second event while one is running', () => {
    scheduleEvent(G);
    const again = createDraft(G, { name: 'Two', startsAt: T0, endsAt: T0 + DAY, channelId: 'c1', createdBy: 'a' });
    expect(again.error).toBe('event-exists');
  });
});

describe('a run', () => {
  beforeEach(liveEvent);

  test('starts at stage 1 and joins the player', () => {
    const { run, question, joined } = startRun(G, 'u1', T0);
    expect(joined).toBe(true);
    expect(run.stage).toBe(1);
    expect(question.tier).toBe(1);
    expect(playerStatus(loadEvent(G), 'u1', T0)).toBe('flying');
  });

  test('a right answer banks the stage and moves on', () => {
    startRun(G, 'u1', T0);
    const result = play('u1');
    expect(result.outcome).toBe('correct');
    expect(result.run.stage).toBe(2);
    expect(result.run.banked).toBe(100);
    expect(result.next).toBeTruthy();
  });

  test('a wrong answer after separation 5 keeps 1,000', () => {
    startRun(G, 'u1', T0);
    for (let i = 0; i < 6; i++) play('u1');
    const result = play('u1', { right: false }); // fails at stage 7
    expect(result.outcome).toBe('failed');
    expect(result.run.final).toBe(1000);
    const best = loadEvent(G).players.u1.bestRun;
    expect(best).toMatchObject({ winnings: 1000, stage: 6 });
  });

  test('aborting keeps everything banked', () => {
    startRun(G, 'u1', T0);
    for (let i = 0; i < 7; i++) play('u1');
    const run = Object.values(loadEvent(G).runs)[0];
    const result = abortRun(G, { runId: run.id, userId: 'u1', stage: 8 }, T0);
    expect(result.run.final).toBe(4000);
    expect(playerStatus(loadEvent(G), 'u1', T0)).toBe('aborted');
  });

  test('clearing all 15 stages reaches orbit with 1,000,000', () => {
    startRun(G, 'u1', T0);
    let result;
    for (let i = 0; i < 15; i++) result = play('u1');
    expect(result.outcome).toBe('orbit');
    expect(result.run.final).toBe(1_000_000);
    expect(loadEvent(G).players.u1.bestRun.stage).toBe(15);
  });

  test('a stale or doubled click changes nothing', () => {
    const { run } = startRun(G, 'u1', T0);
    const q = loadEvent(G).questions[run.questionId];
    answer(G, { runId: run.id, userId: 'u1', stage: 1, choice: q.correctIndex }, T0);
    // The same stage-1 click again, e.g. Discord retrying it
    const again = answer(G, { runId: run.id, userId: 'u1', stage: 1, choice: (q.correctIndex + 1) % 4 }, T0);
    expect(again.error).toBe('stale');
    expect(loadEvent(G).runs[run.id]).toMatchObject({ status: 'active', stage: 2 });
  });

  test('nobody else can answer your question', () => {
    const { run } = startRun(G, 'u1', T0);
    expect(answer(G, { runId: run.id, userId: 'u2', stage: 1, choice: 0 }, T0).error).toBe('not-yours');
  });

  test('records the pick, who got it right, and the per-genre record', () => {
    const { question } = startRun(G, 'u1', T0);
    play('u1');
    const data = loadEvent(G);
    expect(data.questions[question.id].stats.picks[question.correctIndex]).toBe(1);
    expect(data.questions[question.id].correctBy).toEqual(['u1']);
    expect(data.players.u1.record.horror).toEqual({ r: 1, w: 0 });
  });
});

describe('one run a day', () => {
  beforeEach(liveEvent);

  test('a finished run means no second launch today', () => {
    startRun(G, 'u1', T0);
    play('u1', { right: false });
    expect(startRun(G, 'u1', T0 + 60_000).error).toBe('done-today');
  });

  test('an unfinished run resumes instead of starting over', () => {
    const first = startRun(G, 'u1', T0);
    play('u1');
    const again = startRun(G, 'u1', T0 + 60_000);
    expect(again.resumed).toBe(true);
    expect(again.run.id).toBe(first.run.id);
    expect(again.run.stage).toBe(2);
  });

  test('the next UTC day allows a new launch, and the best run counts', () => {
    startRun(G, 'u1', T0);
    for (let i = 0; i < 6; i++) play('u1');
    play('u1', { right: false }); // keeps 1,000
    rolloverDay(G, T0 + DAY);
    startRun(G, 'u1', T0 + DAY);
    play('u1', { right: false, now: T0 + DAY }); // keeps 0
    expect(loadEvent(G).players.u1.bestRun.winnings).toBe(1000);
  });

  test('the rollover aborts yesterday\'s unfinished run, keeping its bank', () => {
    startRun(G, 'u1', T0);
    play('u1');
    play('u1');
    const result = rolloverDay(G, T0 + DAY);
    expect(result.rolled).toBe(true);
    expect(result.aborted).toEqual(['u1']);
    expect(loadEvent(G).players.u1.bestRun.winnings).toBe(200);
    expect(rolloverDay(G, T0 + DAY + 60_000).rolled).toBeUndefined(); // once
  });

  test('a streak counts consecutive days launched', () => {
    for (let d = 0; d < 3; d++) {
      rolloverDay(G, T0 + d * DAY);
      startRun(G, 'u1', T0 + d * DAY);
      play('u1', { right: false, now: T0 + d * DAY });
    }
    rolloverDay(G, T0 + 4 * DAY); // skipped day 3
    startRun(G, 'u1', T0 + 4 * DAY);
    const { streak } = loadEvent(G).players.u1;
    expect(streak).toEqual({ current: 1, best: 3, lastDay: '2026-10-24' });
  });
});

describe('the shared daily draw', () => {
  beforeEach(liveEvent);

  test('players get stage-1 questions from the same small draw', () => {
    // Questions recurring across players is what Poll and Hail rely on
    const firsts = new Set();
    for (const u of ['u1', 'u2', 'u3', 'u4', 'u5', 'u6']) firsts.add(startRun(G, u, T0).question.id);
    expect(firsts.size).toBeLessThanOrEqual(3);
    expect(loadEvent(G).draws['2026-10-20'][1]).toHaveLength(3);
  });

  test('a player never gets a question they have already answered', () => {
    let seen = [];
    for (let d = 0; d < 4; d++) {
      rolloverDay(G, T0 + d * DAY);
      const { question } = startRun(G, 'u1', T0 + d * DAY);
      expect(seen).not.toContain(question.id);
      seen.push(question.id);
      play('u1', { right: false, now: T0 + d * DAY });
    }
  });

  test('a run never asks two questions about the same title', () => {
    // Two templates for every title in tier 1
    const extra = makePool().filter(q => q.tier === 1).map(q => ({ ...q, key: q.key.replace('year', 'director'), template: 'director' }));
    addQuestions(G, extra);
    startRun(G, 'u1', T0);
    play('u1');
    play('u1');
    const run = Object.values(loadEvent(G).runs)[0];
    const titles = run.asked.map(id => loadEvent(G).questions[id].source.id);
    expect(new Set(titles).size).toBe(titles.length);
  });
});

describe('standings and finishing', () => {
  beforeEach(liveEvent);

  test('ranks by score, then stage reached', () => {
    startRun(G, 'u1', T0);
    for (let i = 0; i < 6; i++) play('u1');
    play('u1', { right: false }); // 1,000, cleared 6
    startRun(G, 'u2', T0);
    for (let i = 0; i < 9; i++) play('u2');
    play('u2', { right: false }); // 1,000, cleared 9
    startRun(G, 'u3', T0);
    play('u3', { right: false }); // 0
    expect(standings(loadEvent(G)).map(s => s.userId)).toEqual(['u2', 'u1', 'u3']);
  });

  test('finishing ends open runs, keeping their banks', () => {
    startRun(G, 'u1', T0);
    play('u1');
    const result = finishEvent(G, T0 + DAY);
    expect(result.finished).toBe(true);
    expect(result.standings[0]).toMatchObject({ userId: 'u1', score: 100 });
    expect(startRun(G, 'u2', T0 + DAY).error).toBe('not-live');
  });

  test('a cancelled event cannot be played', () => {
    cancelEvent(G);
    expect(startRun(G, 'u1', T0).error).toBe('not-live');
  });

  test('a finished run flags the card for a refresh', () => {
    recordCard(G, { messageId: 'm1', day: '2026-10-20' }, T0);
    startRun(G, 'u1', T0);
    play('u1', { right: false });
    expect(loadEvent(G).event.card.dirty).toBe(true);
    expect(markCardDirty(G).error).toBe('already-dirty');
  });
});

describe('storage', () => {
  test('a damaged file is recovered from the previous save', () => {
    liveEvent();
    startRun(G, 'u1', T0); // a second save, so the .bak holds the first
    fs.writeFileSync(path.join(_escapeDir, `${G}.json`), '{"cut off');
    expect(loadEvent(G).event.status).toBe('live');
  });

  test('the scheduler sees current events, not archives or backups', () => {
    liveEvent();
    finishEvent(G, T0 + DAY);
    createDraft(G, { name: 'Next', startsAt: T0 + 2 * DAY, endsAt: T0 + 3 * DAY, channelId: 'c1', createdBy: 'a' });
    expect(listEventGuilds()).toEqual([G]);
  });
});

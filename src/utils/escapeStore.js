/**
 * Escape Velocity's state: one event per guild, in guild_escape/<guildId>.json.
 *
 * Everything that must survive a restart lives here — runs, the question
 * pool, the standings card's message id — because deploys restart the bot
 * mid-event (CLAUDE.md). Every change is ONE synchronous load-modify-save
 * with no await inside, so two players answering at once can't overwrite
 * each other: never save an event object that was loaded before an await.
 *
 * Saving is atomic with a .bak, the same as bracketManager.js's
 * saveTournament/loadTournament.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, copyFileSync, unlinkSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { dayKey } from './gameScores.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Overridable so each Jest worker gets its own directory (tests/jest.setup.js)
const escapeDir = process.env.GUILD_ESCAPE_DIR || join(__dirname, '../../guild_escape');

if (!existsSync(escapeDir)) {
  mkdirSync(escapeDir, { recursive: true });
}

// ── the ladder ──────────────────────────────────────────────────────────

/** Points for clearing each stage, 1-15. */
export const LADDER = [100, 200, 300, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 250000, 500000, 1000000];
export const STAGES = LADDER.length;
/** Stage separations: clear one and a later failure can't take it back. */
export const SAFE_STAGES = [5, 10];

/** Which difficulty tier (1-5) a stage draws from: three stages per tier. */
export function tierForStage(stage) {
  return Math.min(5, Math.ceil(stage / 3));
}

/** What a run banks after clearing `cleared` stages. */
export function bankedAfter(cleared) {
  return cleared > 0 ? LADDER[cleared - 1] : 0;
}

/** What a run keeps when it fails on `stage`: the last separation it cleared. */
export function keptOnFailure(stage) {
  const passed = SAFE_STAGES.filter(s => s < stage);
  return passed.length ? LADDER[passed[passed.length - 1] - 1] : 0;
}

/** Questions per tier before an event may launch. */
export const POOL_FLOOR = 6;
/** How many candidates each stage gets in a day's shared draw. */
const DRAW_SIZE = 3;

export { dayKey };

// ── storage ─────────────────────────────────────────────────────────────

function filePath(guildId) {
  return join(escapeDir, `${guildId}.json`);
}

/**
 * The guild's event, or null. A damaged file is recovered from the .bak the
 * last save kept, and the damaged one moved aside (as loadTournament does).
 */
export function loadEvent(guildId) {
  const path = filePath(guildId);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    try {
      const restored = JSON.parse(readFileSync(`${path}.bak`, 'utf8'));
      renameSync(path, `${path}.damaged-${Date.now()}`);
      copyFileSync(`${path}.bak`, path);
      console.warn(`[Escape] Event file for ${guildId} was damaged (${error.message}); restored the previous save`);
      return restored;
    } catch {
      console.error(`[Escape] Event file for ${guildId} is damaged with no usable backup; moved aside:`, error.message);
      try { renameSync(path, `${path}.damaged-${Date.now()}`); } catch { /* already gone */ }
      return null;
    }
  }
}

function saveEvent(guildId, data) {
  const path = filePath(guildId);
  // Write-then-rename: a kill mid-save leaves the old file or the new one,
  // never half of one. The replaced version is kept as .bak.
  writeFileSync(`${path}.tmp`, JSON.stringify(data));
  if (existsSync(path)) copyFileSync(path, `${path}.bak`);
  renameSync(`${path}.tmp`, path);
}

/** Every guild with a current event file — what the scheduler walks. */
export function listEventGuilds() {
  try {
    // <guildId>.json only: not .bak/.tmp, nor archived <guildId>-<eventId>.done.json
    return readdirSync(escapeDir)
      .filter(f => f.endsWith('.json') && !f.endsWith('.done.json'))
      .map(f => f.slice(0, -5));
  } catch {
    return [];
  }
}

/** Load, change, save — synchronously. `fn` returns the result to hand back. */
function mutate(guildId, fn) {
  const data = loadEvent(guildId);
  if (!data) return { error: 'no-event' };
  const result = fn(data);
  if (result?.error) return result; // nothing changed
  saveEvent(guildId, data);
  return result ?? {};
}

const newId = () => crypto.randomBytes(5).toString('hex'); // 10 chars, no underscores

// ── setup and lifecycle ─────────────────────────────────────────────────

/**
 * Start a new event as a draft. Refuses while another is scheduled or live;
 * a finished or cancelled one is archived first so its results aren't lost.
 */
export function createDraft(guildId, { name, startsAt, endsAt, channelId, createdBy }, now = Date.now()) {
  const existing = loadEvent(guildId);
  if (existing && ['scheduled', 'live'].includes(existing.event.status)) {
    return { error: 'event-exists', event: existing.event };
  }
  if (existing) {
    copyFileSync(filePath(guildId), join(escapeDir, `${guildId}-${existing.event.id}.done.json`));
  }

  const data = {
    version: 1,
    event: {
      id: newId(),
      name,
      status: 'draft',
      createdBy,
      createdAt: now,
      startsAt,
      endsAt,
      channelId,
      media: [],
      genres: [],
      lastResetDay: null,
      card: null, // { messageId, day, dirty, editedAt }
    },
    players: {},
    runs: {},
    questions: {},
    hints: {},
    draws: {},
  };
  saveEvent(guildId, data);
  return { event: data.event };
}

/** Record the draft's media and/or genre choices from the setup menus. */
export function setDraftSelection(guildId, { media, genres }) {
  return mutate(guildId, (data) => {
    if (data.event.status !== 'draft') return { error: 'not-draft' };
    if (media) data.event.media = media;
    if (genres) data.event.genres = genres;
    return { event: data.event };
  });
}

/** Draft → scheduled, once media and genres are both chosen. */
export function scheduleEvent(guildId) {
  return mutate(guildId, (data) => {
    if (data.event.status !== 'draft') return { error: 'not-draft' };
    if (!data.event.media.length || !data.event.genres.length) return { error: 'incomplete' };
    data.event.status = 'scheduled';
    return { event: data.event };
  });
}

/**
 * Add generated questions, skipping any already in the pool (same template,
 * media and title). Allowed until the event ends — the scheduler tops up.
 * @returns {{added: number}}
 */
export function addQuestions(guildId, questions) {
  return mutate(guildId, (data) => {
    if (['finished', 'cancelled'].includes(data.event.status)) return { error: 'closed' };
    const keys = new Set(Object.values(data.questions).map(q => q.key));
    let added = 0;
    for (const q of questions) {
      if (keys.has(q.key)) continue;
      const id = newId();
      data.questions[id] = {
        ...q,
        id,
        stats: { picks: [0, 0, 0, 0] },
        correctBy: [],
        wrongBy: [],
      };
      keys.add(q.key);
      added++;
    }
    return { added };
  });
}

/** Questions per tier, 1-5. */
export function poolCounts(data) {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const q of Object.values(data.questions)) counts[q.tier] = (counts[q.tier] || 0) + 1;
  return counts;
}

/** Whether every tier has enough questions to launch. */
export function poolReady(data) {
  return Object.values(poolCounts(data)).every(n => n >= POOL_FLOOR);
}

/**
 * Scheduled → live once its start time has come and the pool is ready.
 * Returns {launched: true} ONLY on the transition, so the caller posts the
 * mission card exactly once: a restart between this and the post can skip
 * the post, never repeat it.
 */
export function markLaunched(guildId, now = Date.now()) {
  return mutate(guildId, (data) => {
    if (data.event.status !== 'scheduled') return { error: 'not-scheduled' };
    if (now < data.event.startsAt) return { error: 'too-early' };
    if (!poolReady(data)) return { error: 'pool-not-ready' };
    data.event.status = 'live';
    data.event.lastResetDay = dayKey(now);
    return { launched: true, event: data.event };
  });
}

/**
 * A new UTC day: runs left unfinished on an earlier day are aborted (they
 * keep what they banked — nobody is punished for going to bed), and pending
 * hails expire. Returns {rolled: true} only on the change.
 */
export function rolloverDay(guildId, now = Date.now()) {
  const today = dayKey(now);
  return mutate(guildId, (data) => {
    if (data.event.status !== 'live') return { error: 'not-live' };
    if (data.event.lastResetDay === today) return { error: 'same-day' };
    const aborted = [];
    for (const run of Object.values(data.runs)) {
      if (run.status === 'active' && run.day !== today) {
        endRun(data, run, 'aborted', run.banked, now);
        aborted.push(run.userId);
      }
    }
    data.event.lastResetDay = today;
    return { rolled: true, aborted, event: data.event };
  });
}

/** Live → finished. Active runs end as aborted, keeping what they banked. */
export function finishEvent(guildId, now = Date.now()) {
  return mutate(guildId, (data) => {
    if (data.event.status !== 'live') return { error: 'not-live' };
    for (const run of Object.values(data.runs)) {
      if (run.status === 'active') endRun(data, run, 'aborted', run.banked, now);
    }
    data.event.status = 'finished';
    data.event.finishedAt = now;
    return { finished: true, event: data.event, standings: standings(data) };
  });
}

/** Cancel a draft, scheduled or live event. Nothing is posted. */
export function cancelEvent(guildId, now = Date.now()) {
  return mutate(guildId, (data) => {
    if (['finished', 'cancelled'].includes(data.event.status)) return { error: 'closed' };
    data.event.status = 'cancelled';
    data.event.finishedAt = now;
    return { event: data.event };
  });
}

/** Move the end date (for /escape-setup extend). */
export function extendEvent(guildId, endsAt) {
  return mutate(guildId, (data) => {
    if (!['scheduled', 'live'].includes(data.event.status)) return { error: 'not-running' };
    if (endsAt <= data.event.startsAt) return { error: 'before-start' };
    data.event.endsAt = endsAt;
    return { event: data.event };
  });
}

// ── the public card ─────────────────────────────────────────────────────

/** The mission card just posted for `day` — so a restart edits it rather than posting another. */
export function recordCard(guildId, { messageId, day }, now = Date.now()) {
  return mutate(guildId, (data) => {
    data.event.card = { messageId, day, dirty: false, editedAt: now };
    return { card: data.event.card };
  });
}

/** Standings changed; the scheduler edits the card on its next pass. */
export function markCardDirty(guildId) {
  return mutate(guildId, (data) => {
    if (!data.event.card) return { error: 'no-card' };
    if (data.event.card.dirty) return { error: 'already-dirty' };
    data.event.card.dirty = true;
    return {};
  });
}

export function markCardEdited(guildId, now = Date.now()) {
  return mutate(guildId, (data) => {
    if (!data.event.card) return { error: 'no-card' };
    data.event.card.dirty = false;
    data.event.card.editedAt = now;
    return {};
  });
}

// ── playing ─────────────────────────────────────────────────────────────

function ensurePlayer(data, userId, now) {
  if (!data.players[userId]) {
    data.players[userId] = {
      joinedAt: now,
      bestRun: null,
      penalties: [],
      penaltyTotal: 0,
      streak: { current: 0, best: 0, lastDay: null },
      record: {},
      seen: [],
    };
  }
  return data.players[userId];
}

/** Today's run for a player, or null. */
export function todaysRun(data, userId, now = Date.now()) {
  const today = dayKey(now);
  return Object.values(data.runs).find(r => r.userId === userId && r.day === today) || null;
}

/** The run a player is in the middle of, from any day, or null. */
function activeRunOf(data, userId) {
  return Object.values(data.runs).find(r => r.userId === userId && r.status === 'active') || null;
}

/**
 * Today's shared draw for a stage: the same few candidates for everyone, so
 * questions recur across players — which is what lets Poll mission control
 * and Hail a crewmate work at all. Drawn the first time anyone reaches that
 * stage today.
 */
function drawFor(data, day, stage, random) {
  data.draws[day] ||= {};
  if (data.draws[day][stage]) return data.draws[day][stage];

  const tier = tierForStage(stage);
  const usedToday = new Set(Object.values(data.draws[day]).flat());
  const candidates = Object.values(data.questions)
    .filter(q => q.tier === tier && !usedToday.has(q.id))
    .map(q => q.id);
  const picked = [];
  while (picked.length < DRAW_SIZE && candidates.length) {
    picked.push(candidates.splice(Math.floor(random() * candidates.length), 1)[0]);
  }
  data.draws[day][stage] = picked;
  return picked;
}

/**
 * The question a run gets at `stage`: today's draw first, then anything in
 * the tier, then neighbouring tiers. Never one the player has seen before,
 * and never a second question about a title already asked in this run,
 * unless nothing else is left.
 */
function pickQuestion(data, run, stage, random) {
  const player = data.players[run.userId];
  const seen = new Set(player.seen);
  const titlesThisRun = new Set(run.asked.map(id => data.questions[id]?.source?.id));
  const fresh = id => {
    const q = data.questions[id];
    return q && !seen.has(id) && !titlesThisRun.has(q.source?.id);
  };
  const pick = ids => (ids.length ? ids[Math.floor(random() * ids.length)] : null);

  const draw = drawFor(data, run.day, stage, random).filter(fresh);
  if (draw.length) return pick(draw);

  const tier = tierForStage(stage);
  for (const t of [tier, tier - 1, tier + 1, tier - 2, tier + 2]) {
    const inTier = Object.values(data.questions).filter(q => q.tier === t && fresh(q.id)).map(q => q.id);
    if (inTier.length) return pick(inTier);
  }
  // A player who has seen the whole pool still gets a question
  return pick(Object.values(data.questions).filter(q => !titlesThisRun.has(q.source?.id)).map(q => q.id))
    || pick(Object.keys(data.questions));
}

function bumpStreak(player, day) {
  const yesterday = dayKey(Date.parse(`${day}T00:00:00Z`) - 86400000);
  player.streak.current = player.streak.lastDay === yesterday ? player.streak.current + 1 : 1;
  player.streak.best = Math.max(player.streak.best, player.streak.current);
  player.streak.lastDay = day;
}

function endRun(data, run, status, final, now) {
  run.status = status;
  run.final = final;
  run.endedAt = now;
  run.questionId = null;

  const player = data.players[run.userId];
  const best = player.bestRun;
  // Stages actually cleared: failing or aborting at stage n cleared n-1
  const reached = status === 'orbit' ? STAGES : run.stage - 1;
  if (!best || final > best.winnings || (final === best.winnings && reached > best.stage)) {
    player.bestRun = { runId: run.id, winnings: final, stage: reached, day: run.day, at: now };
  }
  if (data.event.card) data.event.card.dirty = true;
}

/**
 * Launch (or resume) a player's run for today. Joins them to the event if
 * they're new.
 *
 * @returns {{run, question, joined}} | {error: 'not-live'|'done-today', run}
 */
export function startRun(guildId, userId, now = Date.now(), random = Math.random) {
  return mutate(guildId, (data) => {
    if (data.event.status !== 'live') return { error: 'not-live', event: data.event };
    const joined = !data.players[userId];
    const player = ensurePlayer(data, userId, now);
    const today = dayKey(now);

    // A run left open (today's, or yesterday's before the rollover ran)
    const open = activeRunOf(data, userId);
    if (open && open.day === today) {
      return { run: open, question: data.questions[open.questionId], joined, resumed: true };
    }
    if (open) endRun(data, open, 'aborted', open.banked, now);

    const done = todaysRun(data, userId, now);
    if (done) return { error: 'done-today', run: done };

    const run = {
      id: newId(),
      userId,
      day: today,
      startedAt: now,
      endedAt: null,
      status: 'active',
      stage: 1,
      banked: 0,
      final: null,
      questionId: null,
      asked: [],
      answers: [],
      lifelines: {},
    };
    data.runs[run.id] = run;
    bumpStreak(player, today);

    const qid = pickQuestion(data, run, 1, random);
    if (!qid) return { error: 'empty-pool' };
    run.questionId = qid;
    run.asked.push(qid);
    return { run, question: data.questions[qid], joined };
  });
}

/**
 * Answer the current question. `stage` comes from the clicked button: a
 * stale or doubled click (the stage has moved on) changes nothing.
 *
 * @returns {{outcome: 'correct'|'failed'|'orbit', run, question, correctIndex, next}}
 *   | {error: 'no-run'|'not-yours'|'stale'}
 */
export function answer(guildId, { runId, userId, stage, choice }, now = Date.now(), random = Math.random) {
  return mutate(guildId, (data) => {
    const run = data.runs[runId];
    if (!run) return { error: 'no-run' };
    if (run.userId !== userId) return { error: 'not-yours' };
    if (run.status !== 'active' || run.stage !== stage) return { error: 'stale', run };

    const question = data.questions[run.questionId];
    const correct = choice === question.correctIndex;
    const player = data.players[userId];

    question.stats.picks[choice] = (question.stats.picks[choice] || 0) + 1;
    (correct ? question.correctBy : question.wrongBy).push(userId);
    if (!player.seen.includes(question.id)) player.seen.push(question.id);
    for (const key of [question.genre, question.subgenre && `${question.genre}/${question.subgenre}`].filter(Boolean)) {
      player.record[key] ||= { r: 0, w: 0 };
      player.record[key][correct ? 'r' : 'w']++;
    }
    run.answers.push({ qid: question.id, choice, correct, at: now });

    if (!correct) {
      endRun(data, run, 'failed', keptOnFailure(stage), now);
      return { outcome: 'failed', run, question, correctIndex: question.correctIndex };
    }

    run.banked = bankedAfter(stage);
    if (stage === STAGES) {
      endRun(data, run, 'orbit', run.banked, now);
      return { outcome: 'orbit', run, question, correctIndex: question.correctIndex };
    }

    run.stage = stage + 1;
    const qid = pickQuestion(data, run, run.stage, random);
    run.questionId = qid;
    run.asked.push(qid);
    if (data.event.card) data.event.card.dirty = true;
    return { outcome: 'correct', run, question, correctIndex: question.correctIndex, next: data.questions[qid] };
  });
}

/** Abort: stop before answering `stage`, keeping what's banked. */
export function abortRun(guildId, { runId, userId, stage }, now = Date.now()) {
  return mutate(guildId, (data) => {
    const run = data.runs[runId];
    if (!run) return { error: 'no-run' };
    if (run.userId !== userId) return { error: 'not-yours' };
    if (run.status !== 'active' || run.stage !== stage) return { error: 'stale', run };
    endRun(data, run, 'aborted', run.banked, now);
    return { run };
  });
}

// ── reading ─────────────────────────────────────────────────────────────

/** A player's event score: best run, less any hint penalties. */
export function scoreOf(player) {
  return (player.bestRun?.winnings || 0) - (player.penaltyTotal || 0);
}

/**
 * Everyone, best first: score, then the furthest stage reached, then who got
 * there first.
 */
export function standings(data) {
  return Object.entries(data.players)
    .map(([userId, p]) => ({
      userId,
      score: scoreOf(p),
      stage: p.bestRun?.stage || 0,
      at: p.bestRun?.at ?? Infinity,
      streak: p.streak.current,
    }))
    .sort((a, b) => b.score - a.score || b.stage - a.stage || a.at - b.at);
}

/**
 * Where a player stands today, for the card and their dashboard.
 * @returns {'joined'|'flying'|'failed'|'aborted'|'orbit'}
 */
export function playerStatus(data, userId, now = Date.now()) {
  const run = todaysRun(data, userId, now);
  if (!run) return 'joined';
  if (run.status === 'active') return 'flying';
  return run.status;
}

/** Test-only: remove a guild's files. */
export function _deleteEvent(guildId) {
  for (const f of [filePath(guildId), `${filePath(guildId)}.bak`, `${filePath(guildId)}.tmp`]) {
    if (existsSync(f)) unlinkSync(f);
  }
}

export { escapeDir as _escapeDir };

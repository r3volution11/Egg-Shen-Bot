/**
 * Scheduled watch-party announcements, and which events have had their
 * "starting soon" card — on disk, because deploys restart the bot and a
 * scheduled announcement held only in memory would silently never post.
 *
 * Every change is one synchronous load-modify-save (no await inside), so the
 * scheduler and a moderator cancelling at the same moment can't overwrite
 * each other. A post is claimed BEFORE it's sent (claimForPosting), so a
 * restart mid-send can skip that post but never repeat it.
 */

import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = process.env.SCHEDULED_ANNOUNCEMENTS_FILE || path.join(__dirname, '../../scheduled_announcements.json');

/** How long a finished record is kept, for /announce scheduled's history. */
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;

function loadAll() {
  if (!existsSync(FILE)) return { scheduled: {}, startingSoon: {} };
  try {
    const data = JSON.parse(readFileSync(FILE, 'utf8'));
    return { scheduled: data.scheduled || {}, startingSoon: data.startingSoon || {} };
  } catch (error) {
    console.error('[Announce] Scheduled announcements file is unreadable; starting empty:', error.message);
    return { scheduled: {}, startingSoon: {} };
  }
}

function saveAll(all) {
  const tmp = `${FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(all, null, 2));
  renameSync(tmp, FILE);
}

function mutate(fn) {
  const all = loadAll();
  const result = fn(all);
  saveAll(all);
  return result;
}

/**
 * Queue an announcement for `offsetMs` before an event starts.
 * @param {object} a - { guildId, eventId, eventName, startsAt, offsetMs, channelId, createdBy, post }
 *   `post` is what to build the card from: { segments, host, tone, manualMessage, roleId }
 * @returns {object} the stored record
 */
export function scheduleAnnouncement(a, now = Date.now()) {
  return mutate((all) => {
    const id = crypto.randomBytes(5).toString('hex');
    all.scheduled[id] = { id, ...a, status: 'pending', createdAt: now };
    return all.scheduled[id];
  });
}

/** When a pending announcement is due to post, from its event's current start. */
export function dueAt(record) {
  return record.startsAt - record.offsetMs;
}

/** A guild's announcements, soonest first. `pendingOnly` hides ones already done. */
export function listAnnouncements(guildId, { pendingOnly = false } = {}) {
  return Object.values(loadAll().scheduled)
    .filter(a => a.guildId === guildId && (!pendingOnly || a.status === 'pending'))
    .sort((a, b) => dueAt(a) - dueAt(b));
}

/** Every guild with something pending — what the scheduler walks. */
export function pendingByGuild() {
  const out = new Map();
  for (const a of Object.values(loadAll().scheduled)) {
    if (a.status !== 'pending') continue;
    if (!out.has(a.guildId)) out.set(a.guildId, []);
    out.get(a.guildId).push(a);
  }
  return out;
}

/** Follow the event: it was moved, so the announcement moves with it. */
export function updateStart(id, startsAt) {
  return mutate((all) => {
    const a = all.scheduled[id];
    if (!a || a.status !== 'pending' || a.startsAt === startsAt) return false;
    a.startsAt = startsAt;
    return true;
  });
}

/**
 * Take a pending announcement for posting. True only for the caller that
 * moves it out of 'pending', so two passes (or a restart) can't both post it.
 */
export function claimForPosting(id, now = Date.now()) {
  return mutate((all) => {
    const a = all.scheduled[id];
    if (!a || a.status !== 'pending') return false;
    a.status = 'posting';
    a.claimedAt = now;
    return true;
  });
}

/**
 * Record how an announcement ended: 'posted', 'failed', 'cancelled' (by a
 * moderator, or because its event was cancelled), or 'missed' (the bot was
 * down until after the event started — a late "starts at 8" post is worse
 * than none).
 */
export function finishAnnouncement(id, status, { reason = null, messageId = null } = {}, now = Date.now()) {
  return mutate((all) => {
    const a = all.scheduled[id];
    if (!a) return null;
    a.status = status;
    a.finishedAt = now;
    if (reason) a.reason = reason;
    if (messageId) a.messageId = messageId;
    return { ...a };
  });
}

/** A moderator cancels one. Only a pending announcement can be. */
export function cancelAnnouncement(guildId, id, now = Date.now()) {
  return mutate((all) => {
    const a = all.scheduled[id];
    if (!a || a.guildId !== guildId) return { error: 'not-found' };
    if (a.status !== 'pending') return { error: 'not-pending', announcement: { ...a } };
    a.status = 'cancelled';
    a.reason = 'cancelled by a moderator';
    a.finishedAt = now;
    return { announcement: { ...a } };
  });
}

/**
 * Mark an event's "starting soon" card as posted, for the start time it has
 * now. True only the first time — a moved event gets its own card for its
 * new start, a restart never a second one for the same start.
 */
export function claimStartingSoon(guildId, eventId, startsAt, now = Date.now()) {
  return mutate((all) => {
    const key = `${guildId}:${eventId}:${startsAt}`;
    if (all.startingSoon[key]) return false;
    all.startingSoon[key] = now;
    return true;
  });
}

/** Drop records old enough that nothing will ask about them again. */
export function pruneAnnouncements(now = Date.now()) {
  return mutate((all) => {
    let removed = 0;
    for (const [id, a] of Object.entries(all.scheduled)) {
      if (a.status !== 'pending' && now - (a.finishedAt || a.createdAt) > KEEP_MS) {
        delete all.scheduled[id];
        removed++;
      }
    }
    for (const [key, at] of Object.entries(all.startingSoon)) {
      if (now - at > KEEP_MS) {
        delete all.startingSoon[key];
        removed++;
      }
    }
    return removed;
  });
}

/** Test-only: forget everything. */
export function _resetAnnouncements() {
  saveAll({ scheduled: {}, startingSoon: {} });
}

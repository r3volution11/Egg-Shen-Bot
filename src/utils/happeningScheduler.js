/**
 * Happenings' clock: once a minute, for every server, end the happening
 * that's run out (and edit its announcement to say so), announce one that
 * hasn't been, and maybe start a random one (happeningStore.maybeSpawn).
 *
 * Modeled on escapeScheduler.js. Each transition is decided by a
 * synchronous happeningStore helper keyed by the happening's id, and the
 * Discord work happens after:
 *   start (saved) → claimAnnouncement (saved) → send a NEW message → record
 * so a restart can drop an announcement but never send two: once the claim
 * is saved the send is never tried again, and a happening that has waited
 * more than ANNOUNCE_WITHIN_MS for its first try (the bot was down) is
 * never announced late. An unannounced happening still applies — every
 * play it changes carries its tag.
 *
 * Announcements are new messages because edits never notify (CLAUDE.md);
 * the end of one is only an edit of that announcement, because nobody needs
 * to be summoned to hear that things are back to normal.
 *
 * Wired in src/index.js: initialize(client) once the client is ready, and
 * shutdown() beside the other schedulers'.
 */

import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { loadGuildConfig } from './guildConfig.js';
import { getGameSettings, channelAllowed } from './gameScores.js';
import { HAPPENINGS } from '../data/gameHappenings.js';
import {
  loadState, inProgress, endHappening, claimAnnouncement, recordHappeningMessage, markUnannounced,
  recordEndNotice, maybeSpawn,
} from './happeningStore.js';
import { luck as gameLuck } from './gameLuck.js';

const CHECK_INTERVAL_MS = 60_000;
/** A happening not announced within this long of starting is never announced (no late news) */
export const ANNOUNCE_WITHIN_MS = 2 * 60_000;

/** Each happening's embed colour */
export const HAPPENING_COLORS = Object.freeze({
  fullmoon: 0xF4E3A1,
  happyhour: 0xF5A623,
  fog: 0x9AA5B1,
  doublefeature: 0xE74C3C,
  sunrise: 0xFF8C42,
  madscience: 0x2ECC71,
  rewind: 0x8E44AD,
  intermission: 0x3498DB,
});
/** An ended happening's announcement is greyed */
export const ENDED_COLOR = 0x4F545C;

let interval = null;
// A slow pass (Discord taking its time) mustn't overlap the next one for the
// same server. In memory on purpose: a restart starts with no pass running.
const running = new Set();

const unix = (ms) => Math.floor(ms / 1000);

// ── messages ────────────────────────────────────────────────────────────

/** The announcement: the kind's own words, and an embed saying what changes and until when */
export function announcementPayload(happening) {
  const def = HAPPENINGS[happening.kind];
  const embed = new EmbedBuilder()
    .setColor(HAPPENING_COLORS[happening.kind] ?? 0x5865F2)
    .setTitle(`${def.emoji} ${def.name}`)
    .setDescription(`${def.about}\nEnds <t:${unix(happening.endsAt)}:R>`);
  return { content: def.announce, embeds: [embed], allowedMentions: { parse: [] } };
}

/** The same announcement once it's over */
export function endedPayload(happening) {
  const def = HAPPENINGS[happening.kind];
  const embed = new EmbedBuilder()
    .setColor(ENDED_COLOR)
    .setTitle(`${def.emoji} ${def.name}`)
    .setDescription(`~~${def.about}~~\nEnded <t:${unix(happening.endedAt)}:R>`);
  return { content: def.ended, embeds: [embed], allowedMentions: { parse: [] } };
}

// ── where to announce ───────────────────────────────────────────────────

/**
 * May the bot post an announcement here? View, Send (in a thread: Send in
 * Threads) and Embed Links, checked up front: if it can't tell, it doesn't
 * try.
 */
export async function botCanPost(guild, channel) {
  if (typeof channel?.send !== 'function' || typeof channel.permissionsFor !== 'function') return false;
  const me = guild.members?.me ?? await guild.members?.fetchMe?.().catch(() => null) ?? null;
  if (!me) return false;
  const perms = channel.permissionsFor(me);
  if (!perms) return false;
  const send = channel.isThread?.() ? PermissionFlagsBits.SendMessagesInThreads : PermissionFlagsBits.SendMessages;
  return [PermissionFlagsBits.ViewChannel, send, PermissionFlagsBits.EmbedLinks].every(flag => perms.has(flag));
}

/**
 * The channel a happening is announced in — the first that works of:
 *   1. the happenings channel an admin chose
 *   2. the games channel, when the games are limited to just one
 *   3. the last channel anyone played in
 *   4. `fallback` (an admin start: the channel they ran the command in)
 * Each must be one the games may be played in, and one the bot can post in.
 * @returns {Promise<object|null>} the channel, or null if none will do
 */
export async function chooseChannel(guild, settings, state, fallback = null) {
  const candidates = [
    settings.happeningChannel,
    settings.channelMode === 'only' && settings.channels.length === 1 ? settings.channels[0] : null,
    state?.activity?.channelId,
    fallback?.id ?? fallback,
  ];
  const tried = new Set();
  for (const id of candidates) {
    if (!id || typeof id !== 'string' || tried.has(id)) continue;
    tried.add(id);
    const channel = fallback?.id === id ? fallback : await guild.channels.fetch(id).catch(() => null);
    if (!channel) continue;
    if (!channelAllowed(settings, channel.id, channel.parentId || null).ok) continue;
    if (await botCanPost(guild, channel)) return channel;
  }
  return null;
}

/**
 * Announce happening `happening` with a NEW message, at most once ever.
 * @param {object} options
 * @param {number} options.now
 * @param {object} [options.fallback] - a channel to try last (admin start)
 * @returns {Promise<{channel, message} | {error: 'late'|'no-channel'|'send-failed'|string}>}
 */
export async function announceHappening(guild, settings, happening, { now = Date.now(), fallback = null } = {}) {
  const def = HAPPENINGS[happening.kind];
  if (now - happening.startedAt > ANNOUNCE_WITHIN_MS) {
    // The bot was down when it started: old news is worse than none
    markUnannounced(guild.id, happening.id, 'late');
    console.warn(`[Happenings] ${def.name} in ${guild.id} started ${Math.round((now - happening.startedAt) / 60_000)} min ago and was never announced; not announcing it late`);
    return { error: 'late' };
  }
  const channel = await chooseChannel(guild, settings, loadState(guild.id), fallback);
  if (!channel) {
    // Logged once: an unannounced happening isn't tried again
    if (!markUnannounced(guild.id, happening.id, 'no-channel').error) {
      console.warn(`[Happenings] No channel to announce ${def.name} in for guild ${guild.id} (the bot needs View, Send and Embed Links in a games channel); it applies unannounced`);
    }
    return { error: 'no-channel' };
  }
  // Saved before the send: from here on this happening is never sent again,
  // even if the bot dies before the message id is recorded
  const claim = claimAnnouncement(guild.id, happening.id, channel.id, now);
  if (claim.error) return { error: claim.error };
  let message;
  try {
    message = await channel.send(announcementPayload(claim.happening));
  } catch (error) {
    markUnannounced(guild.id, happening.id, 'send-failed');
    console.error(`[Happenings] Couldn't announce ${def.name} in ${channel.id} (guild ${guild.id}):`, error.message);
    return { error: 'send-failed' };
  }
  recordHappeningMessage(guild.id, happening.id, message.id);
  return { channel, message };
}

/** Edit an ended happening's announcement to say it's over. An edit: it needn't notify. */
async function editEnded(guild, happening) {
  try {
    const channel = await guild.channels.fetch(happening.channelId);
    const message = await channel.messages.fetch(happening.messageId);
    await message.edit(endedPayload(happening));
    recordEndNotice(guild.id, happening.id, happening.messageId);
  } catch (error) {
    // Deleted message or channel: nothing to edit, and no point retrying
    recordEndNotice(guild.id, happening.id, 'gone');
    console.warn(`[Happenings] Couldn't mark ${happening.kind} over in guild ${guild.id}:`, error.message);
  }
}

/**
 * End the current happening if it's run out (or happenings were switched
 * off), and make sure an ended one's announcement says so.
 * @param {boolean} [force] - end it now even if it hasn't run out (admin `end:`)
 * @returns {Promise<object|null>} the happening it ended, if it ended one
 */
export async function settleHappening(guild, settings, now = Date.now(), { force = false } = {}) {
  let h = loadState(guild.id).happening;
  if (!h) return null;
  let ended = null;
  if (!h.endedAt && (force || now >= h.endsAt || settings.happenings === false)) {
    const result = endHappening(guild.id, h.id, now);
    if (result.ended) ended = result.happening;
    h = loadState(guild.id).happening;
    if (!h) return ended;
  }
  if (h.endedAt && h.messageId && !h.endNoticeId) await editEnded(guild, h);
  return ended;
}

// ── the pass ────────────────────────────────────────────────────────────

async function checkGuild(guild, now, luck) {
  const settings = getGameSettings(await loadGuildConfig(guild.id));

  // 1. End what's run out
  await settleHappening(guild, settings, now);

  // 2. Announce one that hasn't been tried (it started just before a restart)
  const h = loadState(guild.id).happening;
  if (inProgress(h, now)) {
    if (!h.messageId && !h.claimedAt && !h.unannounced) await announceHappening(guild, settings, h, { now });
    return;
  }

  // 3. Maybe start one
  const spawned = maybeSpawn(guild.id, settings, now, luck);
  if (spawned) await announceHappening(guild, settings, spawned.happening, { now });
}

/**
 * One pass over every server the bot is in. Exported so tests can drive it
 * with a clock: `only` limits it to one guild, `luck` replaces the dice.
 */
export async function checkHappenings(client, now = Date.now(), { only = null, luck = gameLuck } = {}) {
  const guilds = [...(client.guilds?.cache?.values?.() ?? [])];
  for (const guild of guilds) {
    if (only && guild.id !== only) continue;
    if (running.has(guild.id)) continue;
    running.add(guild.id);
    try {
      await checkGuild(guild, now, luck);
    } catch (error) {
      console.error(`[Happenings] Scheduler pass failed for guild ${guild.id}:`, error.message);
    } finally {
      running.delete(guild.id);
    }
  }
}

export function initialize(client) {
  if (interval) return;
  interval = setInterval(() => {
    checkHappenings(client).catch(err => console.error('[Happenings] Scheduler error:', err.message));
  }, CHECK_INTERVAL_MS);
  interval.unref?.();
  console.log('[Happenings] Scheduler started');
}

export function shutdown() {
  if (interval) clearInterval(interval);
  interval = null;
}

/** Test-only: forget which passes are running (a "restart") */
export function _resetScheduler() {
  running.clear();
}

/**
 * Posts watch-party announcements on time, tied to Discord scheduled events:
 *
 *   - Announcements queued with /announce schedule, at their chosen time
 *     before the event. They follow the event: moved, and the announcement
 *     moves; cancelled, and it's cancelled; already started (the bot was
 *     down), and it's skipped rather than posted late.
 *   - A short "starting soon" card 10 minutes before EVERY scheduled event,
 *     in the event's own channel, unless the server turned it off
 *     (/eggshen-config-watch-party watch-party starting-soon).
 *
 * Every post is claimed in announcementStore before it's sent, so a restart
 * can skip a post but never repeat one.
 */

import { EmbedBuilder, GuildScheduledEventStatus } from 'discord.js';
import { loadGuildConfig, getStartingSoonEnabled } from './guildConfig.js';
import {
  pendingByGuild, dueAt, updateStart, claimForPosting, finishAnnouncement, claimStartingSoon, pruneAnnouncements,
} from './announcementStore.js';
import { composePartyPost, channelProblem, fitTitle } from './announcementCompose.js';
import { eventChannelId, eventUrl } from './upcomingEvents.js';
import { resolveWatchTitle } from './watchTitle.js';
import { getBackdropUrl } from '../services/tmdbService.js';

const CHECK_INTERVAL_MS = 60_000;
export const STARTING_SOON_MS = 10 * 60_000;
/** Events are re-fetched at least this often, and every pass when something is close. */
const EVENTS_STALE_MS = 5 * 60_000;
const CLOSE_MS = 15 * 60_000;
const PRUNE_MS = 60 * 60_000;

let interval = null;
let lastPrune = 0;
// In memory: losing it on restart just costs one extra fetch
const eventCache = new Map(); // guildId -> { at, events: Map<id, event> }

/** "Saturday, October 31 at 7:00 PM (in 2 hours)" in each reader's own timezone. */
export function startText(startsAt) {
  const unix = Math.floor(startsAt / 1000);
  return `<t:${unix}:F> (<t:${unix}:R>)`;
}

async function eventsFor(guild, now, { soonest }) {
  const hit = eventCache.get(guild.id);
  const close = (t) => t != null && t - now <= CLOSE_MS;
  const stale = !hit || now - hit.at >= EVENTS_STALE_MS
    || close(soonest)
    || [...hit.events.values()].some(e => close(e.scheduledStartTimestamp));
  if (!stale) return hit.events;
  const fetched = await guild.scheduledEvents.fetch();
  const events = new Map([...fetched.values()].map(e => [e.id, e]));
  eventCache.set(guild.id, { at: now, events });
  return events;
}

async function fetchChannel(client, id) {
  try {
    return await client.channels.fetch(id);
  } catch {
    return null;
  }
}

/** Post one queued announcement, if it's due. */
async function handleScheduled(client, guild, a, events, guildConfig, now) {
  const event = events.get(a.eventId);
  if (!event || event.status === GuildScheduledEventStatus.Canceled) {
    finishAnnouncement(a.id, 'cancelled', { reason: 'its event was cancelled or deleted' }, now);
    return;
  }
  if (event.status !== GuildScheduledEventStatus.Scheduled) {
    finishAnnouncement(a.id, 'missed', { reason: 'its event had already started' }, now);
    return;
  }

  // Follow a moved event
  let startsAt = a.startsAt;
  if (event.scheduledStartTimestamp !== startsAt) {
    startsAt = event.scheduledStartTimestamp;
    updateStart(a.id, startsAt);
  }

  if (now < dueAt({ ...a, startsAt })) return;
  if (now >= startsAt) {
    // The bot was down through the posting time and the event has begun: a
    // "starts at 8" card arriving at 8:20 helps nobody
    finishAnnouncement(a.id, 'missed', { reason: 'the bot was offline until after the event started' }, now);
    return;
  }
  if (!claimForPosting(a.id, now)) return;

  try {
    const channel = await fetchChannel(client, a.channelId);
    const problem = channelProblem(channel, guild.members?.me);
    if (problem) {
      finishAnnouncement(a.id, 'failed', { reason: problem.replace(/^❌ /, '') }, now);
      return;
    }
    const built = await composePartyPost({
      segments: a.post.segments,
      timeText: startText(startsAt),
      host: a.post.host,
      tone: a.post.tone,
      manualMessage: a.post.manualMessage,
      role: a.post.roleId ? `<@&${a.post.roleId}>` : null,
      guildConfig,
      eventUrl: eventUrl(event),
    });
    if (built.notFound) {
      finishAnnouncement(a.id, 'failed', { reason: `couldn't find ${built.notFound.join(', ')} on TMDB` }, now);
      return;
    }
    const message = await channel.send({
      ...built.payload,
      allowedMentions: { roles: a.post.roleId ? [a.post.roleId] : [] },
    });
    finishAnnouncement(a.id, 'posted', { messageId: message?.id || null }, now);
  } catch (error) {
    console.error(`[Announce] Scheduled announcement ${a.id} failed:`, error.message);
    finishAnnouncement(a.id, 'failed', { reason: error.message }, now);
  }
}

/** The short card: what's starting, when, and the event's art. */
async function startingSoonCard(event) {
  let art = typeof event.coverImageURL === 'function' ? event.coverImageURL({ size: 1024 }) : null;
  if (!art) {
    const match = await resolveWatchTitle(event.name).catch(() => null);
    if (match?.backdrop_path) art = getBackdropUrl(match.backdrop_path, 'w780');
  }
  const unix = Math.floor(event.scheduledStartTimestamp / 1000);
  const embed = new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle(fitTitle('🎬 Starting soon: ', event.name))
    .setURL(eventUrl(event))
    .setDescription(`Starts <t:${unix}:R>, at <t:${unix}:t>. Grab your snacks!`);
  if (art) embed.setImage(art);
  return {
    content: `🎬 **${event.name}** starts <t:${unix}:R>!`,
    embeds: [embed],
    allowedMentions: { parse: [] },
  };
}

/** Post the 10-minute card for any event about to start. */
async function handleStartingSoon(client, guild, events, now) {
  for (const event of events.values()) {
    if (event.status !== GuildScheduledEventStatus.Scheduled) continue;
    const until = event.scheduledStartTimestamp - now;
    if (until <= 0 || until > STARTING_SOON_MS) continue;

    const channelId = eventChannelId(guild, event);
    // Claimed whether or not it can post, so a channel-less event isn't
    // retried (and logged) every minute until it starts
    if (!claimStartingSoon(guild.id, event.id, event.scheduledStartTimestamp, now)) continue;
    if (!channelId) {
      console.log(`[Announce] "${event.name}" has no channel to post its starting-soon card in`);
      continue;
    }
    const channel = await fetchChannel(client, channelId);
    if (!channel || channelProblem(channel, guild.members?.me)) {
      console.log(`[Announce] Can't post the starting-soon card for "${event.name}" in ${channelId}`);
      continue;
    }
    try {
      await channel.send(await startingSoonCard(event));
    } catch (error) {
      console.error(`[Announce] Starting-soon card for "${event.name}" failed:`, error.message);
    }
  }
}

/**
 * One pass. Exported so tests can drive it with a clock; `only` limits it to
 * one guild.
 */
export async function checkAnnouncements(client, now = Date.now(), { only = null } = {}) {
  const pending = pendingByGuild();
  const guildIds = new Set([...pending.keys(), ...(client.guilds?.cache?.keys?.() || [])]);

  for (const guildId of guildIds) {
    if (only && guildId !== only) continue;
    try {
      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) continue;
      const queued = pending.get(guildId) || [];
      const guildConfig = await loadGuildConfig(guildId);
      const startingSoon = getStartingSoonEnabled(guildConfig);
      if (!queued.length && !startingSoon) continue;

      const soonest = queued.length ? Math.min(...queued.map(dueAt)) : null;
      const events = await eventsFor(guild, now, { soonest });

      for (const a of queued) await handleScheduled(client, guild, a, events, guildConfig, now);
      if (startingSoon) await handleStartingSoon(client, guild, events, now);
    } catch (error) {
      console.error(`[Announce] Scheduler pass failed for guild ${guildId}:`, error.message);
    }
  }

  if (now - lastPrune >= PRUNE_MS) {
    lastPrune = now;
    pruneAnnouncements(now);
  }
}

export function initialize(client) {
  if (interval) return;
  interval = setInterval(() => {
    checkAnnouncements(client).catch(err => console.error('[Announce] Scheduler error:', err.message));
  }, CHECK_INTERVAL_MS);
  interval.unref?.();
  console.log('[Announce] Scheduler started');
}

export function shutdown() {
  if (interval) clearInterval(interval);
  interval = null;
}

/** Test-only. */
export function _resetAnnouncementScheduler() {
  eventCache.clear();
  lastPrune = 0;
}

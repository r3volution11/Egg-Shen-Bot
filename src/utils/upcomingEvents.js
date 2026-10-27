/**
 * A server's scheduled events — for /announce schedule's event picker, the
 * announcement scheduler, and finding the channel an event happens in.
 *
 * Fetched over REST (guild.scheduledEvents.fetch), which needs no extra
 * gateway intent — but Discord rate-limits that endpoint hard: measured in
 * production, a second fetch within seconds of the first waited ~12s, and
 * discord.js waits silently. Autocomplete must answer within 3 seconds, so
 * an uncached picker simply never showed its list. Hence:
 *
 *   - one cache per guild, shared by the picker and the scheduler (whose
 *     every-minute passes keep it warm)
 *   - one fetch in flight per guild; everyone else waits on that one
 *   - callers that can't wait (autocomplete) give up after `waitMs` and use
 *     what's cached, however old, rather than nothing
 */

import { GuildScheduledEventStatus } from 'discord.js';

const cache = new Map(); // guildId -> { at, events: Map<id, event> }
const inflight = new Map(); // guildId -> Promise<Map>

/**
 * All of a guild's events (any status), from cache when fresh enough.
 *
 * @param {object} opts
 * @param {number} opts.maxAgeMs - how old a cached list may be
 * @param {number} [opts.waitMs] - give up on a fetch after this long; then
 *   the cached list is returned even if stale, or null if there's none yet
 *   (the fetch carries on and fills the cache for next time)
 * @returns {Promise<Map<string, object>|null>}
 */
export async function guildEvents(guild, { maxAgeMs = 60_000, waitMs = Infinity, now = Date.now() } = {}) {
  const hit = cache.get(guild.id);
  if (hit && now - hit.at < maxAgeMs) return hit.events;

  let pending = inflight.get(guild.id);
  if (!pending) {
    pending = guild.scheduledEvents.fetch({ withUserCount: false })
      .then((fetched) => {
        const events = new Map([...fetched.values()].map(e => [e.id, e]));
        cache.set(guild.id, { at: Date.now(), events });
        return events;
      })
      .finally(() => inflight.delete(guild.id));
    inflight.set(guild.id, pending);
  }
  if (waitMs === Infinity) return pending;

  // A caller that gave up still leaves the fetch running; don't let its
  // failure surface as an unhandled rejection
  pending.catch(() => {});
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), waitMs);
    timer.unref?.();
  });
  try {
    const events = await Promise.race([pending, timeout]);
    return events || hit?.events || null;
  } catch (error) {
    if (hit) return hit.events;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Events that haven't started, soonest first — or null when they're still
 * loading (only possible with `waitMs`).
 */
export async function fetchUpcomingEvents(guild, now = Date.now(), { maxAgeMs = 60_000, waitMs = Infinity } = {}) {
  const events = await guildEvents(guild, { maxAgeMs, waitMs, now });
  if (!events) return null;
  return [...events.values()]
    .filter(e => e.status === GuildScheduledEventStatus.Scheduled && e.scheduledStartTimestamp > now)
    .sort((a, b) => a.scheduledStartTimestamp - b.scheduledStartTimestamp);
}

/** "in 2d 4h" — autocomplete labels are plain text, so no Discord timestamps. */
export function inWords(ms) {
  const mins = Math.max(0, Math.round(ms / 60_000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d) return `in ${d}d${h ? ` ${h}h` : ''}`;
  if (h) return `in ${h}h${m ? ` ${m}m` : ''}`;
  return `in ${m}m`;
}

/** An autocomplete choice for an event: name, how soon, and the UTC start (≤ 100 chars). */
export function eventChoice(event, now = Date.now()) {
  const start = new Date(event.scheduledStartTimestamp);
  const when = start.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
  const suffix = ` · ${inWords(event.scheduledStartTimestamp - now)} (${when} UTC)`;
  const room = 100 - suffix.length;
  const name = event.name.length > room ? `${event.name.slice(0, room - 1)}…` : event.name;
  return { name: `${name}${suffix}`, value: event.id };
}

/**
 * The id of the channel an event happens in, or null.
 *
 * A voice or stage event carries its channel directly (and a voice channel
 * has its own text chat). An "external" event only has a free-text location,
 * which servers fill with a channel mention ("<#123>"), a bare id, or a name
 * ("#watch-party") — the same forms scheduledEventLookup.js matches.
 */
export function eventChannelId(guild, event) {
  if (event.channelId) return event.channelId;
  const location = event.entityMetadata?.location || '';
  const mention = location.match(/<#(\d+)>/) || location.match(/\b(\d{17,20})\b/);
  if (mention) return mention[1];
  const name = location.match(/#([\w-]+)/)?.[1]?.toLowerCase();
  if (name) {
    const byName = [...(guild.channels?.cache?.values() || [])].find(c => c.name?.toLowerCase() === name);
    if (byName) return byName.id;
  }
  return null;
}

/** The event's own link; Discord renders it as the event card with an Interested button. */
export function eventUrl(event) {
  return event.url || `https://discord.com/events/${event.guildId}/${event.id}`;
}

/** Test-only. */
export function _clearEventCache() {
  cache.clear();
  inflight.clear();
}

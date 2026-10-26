/**
 * A server's upcoming scheduled events — for /announce schedule's event
 * picker, and for finding the channel an event happens in.
 *
 * Fetched over REST (guild.scheduledEvents.fetch), which needs no extra
 * gateway intent. Autocomplete must answer within 3 seconds and fires on
 * every keystroke, so the list is cached briefly per guild.
 */

import { GuildScheduledEventStatus } from 'discord.js';

const CACHE_MS = 30_000;
const cache = new Map(); // guildId -> { at, events }

/**
 * Events that haven't started, soonest first.
 * @returns {Promise<Array>} discord.js GuildScheduledEvent objects
 */
export async function fetchUpcomingEvents(guild, now = Date.now(), { fresh = false } = {}) {
  const hit = cache.get(guild.id);
  let events;
  if (!fresh && hit && now - hit.at < CACHE_MS) {
    events = hit.events;
  } else {
    const fetched = await guild.scheduledEvents.fetch();
    events = [...fetched.values()];
    cache.set(guild.id, { at: now, events });
  }
  return events
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
}

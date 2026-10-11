/**
 * Finding the scheduled event tied to a channel, and looking up what it's
 * for on TMDB.
 *
 * This lived in two places. `/timer remind` and `/watchparty remind` are the
 * same feature reached by two names, and each carried its own byte-for-byte
 * copy of these three helpers — so a fix applied to one silently skipped the
 * other. That is exactly what happened with the year-suffix handling: an
 * event named "The Covenant (2006)" searched TMDB literally, found nothing,
 * and both announcements lost their poster and runtime.
 */

import { GuildScheduledEventStatus } from 'discord.js';
import { searchMovies, searchTVShows } from '../services/tmdbService.js';
import { stripTrailingYear } from './episodeRangeParser.js';

/**
 * Find the scheduled event tied to a channel.
 *
 * A voice/stage event carries the channel directly in `channelId`; an
 * External event (what eventRequestApproval.js creates for a text-only
 * party) can only point at one through its free-text location, so both the
 * raw ID/mention and the "#channel-name" form are checked.
 *
 * @param {import('discord.js').Guild} guild
 * @param {string} channelId
 * @param {object} [options]
 * @param {boolean} [options.includeScheduled=true] - also match events that
 *   haven't started yet. Both remind paths want those (they run before the
 *   party); `/timer start` does NOT, since labelling a timer with a party
 *   that isn't happening would be wrong.
 * @param {number} [options.startsWithinMs] - when set, a Scheduled event
 *   only counts if it starts within this long of now (either side). Without
 *   it, next week's party for the channel matches tonight; the ready check
 *   wants the one happening around now. Active events always match.
 * @param {string} [options.logPrefix='Event Lookup']
 * @returns {Promise<import('discord.js').GuildScheduledEvent|null>}
 */
export async function findEventForChannel(guild, channelId, { includeScheduled = true, startsWithinMs, logPrefix = 'Event Lookup' } = {}) {
  try {
    console.log(`[${logPrefix}] Checking for events in channel ${channelId}...`);

    const events = await guild.scheduledEvents.fetch();
    console.log(`[${logPrefix}] Found ${events.size} total scheduled event(s)`);

    const startsSoon = (event) => startsWithinMs === undefined
      || Math.abs((event.scheduledStartTimestamp ?? Infinity) - Date.now()) <= startsWithinMs;
    const relevantEvents = events.filter(event =>
      event.status === GuildScheduledEventStatus.Active ||
      (includeScheduled && event.status === GuildScheduledEventStatus.Scheduled && startsSoon(event))
    );
    console.log(`[${logPrefix}] Found ${relevantEvents.size} relevant event(s)`);

    if (relevantEvents.size === 0) {
      console.log(`[${logPrefix}] No relevant events found`);
      return null;
    }

    for (const [, event] of relevantEvents) {
      console.log(`[${logPrefix}] Checking event: "${event.name}"`);
      console.log(`[${logPrefix}] - Event status: ${event.status}`);
      console.log(`[${logPrefix}] - Event channelId: ${event.channelId}`);
      console.log(`[${logPrefix}] - Event location: ${event.entityMetadata?.location || 'none'}`);

      // A channel-based (voice/stage) event names the channel outright.
      if (event.channelId === channelId) {
        console.log(`[${logPrefix}] ✅ Found matching event: "${event.name}" (channel-based)`);
        return event;
      }

      // An External event can only reference a channel in free text.
      if (event.entityMetadata?.location) {
        const location = event.entityMetadata.location.toLowerCase();
        const channelMention = `<#${channelId}>`;

        if (location.includes(channelId) || location.includes(channelMention.toLowerCase())) {
          console.log(`[${logPrefix}] ✅ Found matching event: "${event.name}" (location mentions channel)`);
          return event;
        }

        const channel = guild.channels.cache.get(channelId);
        if (channel) {
          const channelNamePattern = `#${channel.name}`.toLowerCase();
          if (location === channelNamePattern || location.includes(channelNamePattern)) {
            console.log(`[${logPrefix}] ✅ Found matching event: "${event.name}" (location matches channel name)`);
            return event;
          }
        }
      }
    }

    console.log(`[${logPrefix}] ❌ No matching events found for channel ${channelId}`);
    return null;
  } catch (error) {
    console.error(`[${logPrefix}] Error fetching scheduled events:`, error);
    return null;
  }
}

/**
 * Who marked the event Interested, as user ids. Discord pages these 100 at a
 * time; a watch party rarely has more, so this stops at `max`. REST only —
 * no gateway intent needed. Never throws: null means "couldn't tell", and
 * callers fall back to not comparing.
 * @param {import('discord.js').GuildScheduledEvent} event
 * @param {number} [max=500]
 * @returns {Promise<string[]|null>}
 */
export async function fetchInterestedUserIds(event, max = 500) {
  try {
    const ids = [];
    let after;
    while (ids.length < max) {
      const page = await event.fetchSubscribers({ limit: 100, ...(after ? { after } : {}) });
      const users = [...page.values()].map(s => s.user?.id).filter(Boolean);
      ids.push(...users);
      if (users.length < 100) break;
      after = users[users.length - 1];
    }
    return ids.slice(0, max);
  } catch (error) {
    console.error('[Event Lookup] Couldn\'t fetch interested users:', error.message);
    return null;
  }
}

/**
 * Look up what an event is for, across movies and TV.
 *
 * Strips a trailing year before searching: hosts routinely disambiguate an
 * event name as "The Covenant (2006)", and TMDB matches that literally and
 * returns nothing at all.
 *
 * @param {string} title - the event name, as written
 * @param {string} [logPrefix='Event Lookup']
 * @returns {Promise<Array>} up to 10 results, most popular first; [] on failure
 */
export async function searchEventTitle(title, logPrefix = 'Event Lookup') {
  const { title: searchable } = stripTrailingYear(title);

  try {
    const [movieResults, tvResults] = await Promise.all([
      searchMovies(searchable),
      searchTVShows(searchable),
    ]);

    return [
      ...(movieResults || []).map(m => ({ ...m, type: 'movie' })),
      ...(tvResults || []).map(t => ({ ...t, type: 'tv' })),
    ]
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
      .slice(0, 10);
  } catch (error) {
    console.error(`[${logPrefix}] Error searching TMDB:`, error);
    return [];
  }
}

/**
 * Render a runtime in minutes as "1h 47m".
 */
export function formatRuntime(minutes) {
  if (!minutes) return 'Unknown';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

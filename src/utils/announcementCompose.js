/**
 * Building watch-party announcements — shared by /announce party, which
 * posts one now, and the announcement scheduler, which posts one at a set
 * time before a scheduled event (announcementScheduler.js).
 *
 * Moved out of commands/announce.js so a scheduled announcement is the same
 * card a moderator would have posted by hand.
 */

import { EmbedBuilder, PermissionsBitField } from 'discord.js';
import {
  searchMovies,
  searchTVShows,
  getMovieDetails,
  getTVShowDetails,
  getUnifiedMovieWatchProviders,
  getUnifiedTVWatchProviders,
  getBackdropUrl,
  getPosterUrl,
} from '../services/tmdbService.js';
import { hybridSearch, generateAnnouncementText } from '../services/aiService.js';
import { normalizeProviders } from './embedBuilder.js';
import { getAiTextEnabled } from './guildConfig.js';

/** Discord's embed title cap, which discord.js throws past. */
const MAX_EMBED_TITLE = 256;

/**
 * Resolve a title to its TMDB details + streaming availability, or null if
 * nothing was found. Always uses the top search result — an announcement
 * posts in one shot, so there's no picker step for ambiguous titles.
 */
export async function resolveSegment(title, episodes, region) {
  const [movieResults, tvResults] = await Promise.all([
    hybridSearch(title, searchMovies, 'movie'),
    hybridSearch(title, searchTVShows, 'tv'),
  ]);

  // If episodes were given, prefer a TV match (that's clearly the intent);
  // otherwise prefer whichever type matched first/best.
  const preferTV = !!episodes;
  const tvMatch = tvResults?.[0];
  const movieMatch = movieResults?.[0];
  const type = preferTV && tvMatch ? 'tv' : (movieMatch ? 'movie' : (tvMatch ? 'tv' : null));

  if (!type) {
    return null;
  }

  if (type === 'movie') {
    const details = await getMovieDetails(movieMatch.id);
    const imdbId = details.external_ids?.imdb_id;
    const watchProviders = await getUnifiedMovieWatchProviders(movieMatch.id, imdbId, region);
    return {
      type: 'movie',
      title: details.title,
      overview: details.overview,
      episodes: null,
      artUrl: pickArtUrl(details),
      streamingText: buildStreamingLine(watchProviders),
    };
  }

  const details = await getTVShowDetails(tvMatch.id);
  const imdbId = details.external_ids?.imdb_id;
  const watchProviders = await getUnifiedTVWatchProviders(tvMatch.id, imdbId, region);
  return {
    type: 'tv',
    title: details.name,
    overview: details.overview,
    episodes: episodes || null,
    artUrl: pickArtUrl(details),
    streamingText: buildStreamingLine(watchProviders),
  };
}

/**
 * The image for an announcement card, preferring the 16:9 backdrop.
 *
 * Discord gives no control over an embed image's display size — setImage
 * always fills the card width — so aspect ratio is the only lever on how much
 * channel the card occupies. At a fixed width a backdrop is roughly half the
 * height of a 2:3 poster. Falls back to the poster, since plenty of older or
 * obscure titles have no backdrop and losing the art would be worse than a
 * taller card.
 */
function pickArtUrl(details) {
  if (details?.backdrop_path) return getBackdropUrl(details.backdrop_path, 'w780');
  if (details?.poster_path) return getPosterUrl(details.poster_path, 'w342');
  return null;
}

/**
 * Build a single "Available to stream on X, Y" line from unified watch
 * provider data — a shorter, single-line variant of embedBuilder.js's
 * buildStreamingText (which includes rent/buy/link sections not wanted here).
 */
function buildStreamingLine(watchProviders) {
  if (!watchProviders?.flatrate || watchProviders.flatrate.length === 0) {
    return null;
  }
  // Cap at 4 services for a clean single line — TMDB/Watchmode often list many
  // near-duplicate storefronts (e.g. "Amazon Prime Video" vs "Prime Video");
  // showing all of them would read as noise rather than a helpful summary.
  const services = normalizeProviders(watchProviders.flatrate).slice(0, 4).join(' and ');
  return `Available to stream on ${services}`;
}

/**
 * Plain, non-AI template. Used whenever AI text isn't in play: the server
 * disabled it, the operator set no API key, or the call failed.
 */
function buildFallbackText(segments, timeText, host) {
  const titles = segments.map(s => s.episodes ? `*${s.title}* (${s.episodes})` : `*${s.title}*`).join(' and ');
  const hostLine = host ? ` Hosted by ${host}.` : '';
  return `Join us for a watch party! Tonight we're watching ${titles}.${hostLine}\n\nStarts at **${timeText}**.`;
}

/**
 * Whether the bot can post an announcement in `channel`, checked up front
 * rather than letting send() throw — so a missing permission reports itself
 * as "I can't post there", and nobody is told an announcement went out (or
 * will) when it can't.
 *
 * @returns {string|null} what's missing, as an error line, or null when fine
 */
export function channelProblem(channel, me) {
  if (!channel) {
    return '❌ Couldn\'t work out which channel to post in. Try passing `channel` explicitly.';
  }
  if (me && typeof channel.permissionsFor === 'function') {
    const perms = channel.permissionsFor(me);
    const needed = [
      [PermissionsBitField.Flags.ViewChannel, 'view'],
      [PermissionsBitField.Flags.SendMessages, 'send messages in'],
      [PermissionsBitField.Flags.EmbedLinks, 'embed links in'],
    ];
    for (const [flag, what] of needed) {
      if (perms && !perms.has(flag)) {
        return `❌ I don't have permission to ${what} ${channel}. Give me access there, or pick another channel.`;
      }
    }
  }
  return null;
}

/**
 * The ping line. A mention inside an embed NEVER notifies anyone — only
 * message content does — so anything meant to get attention goes here.
 */
export function buildPingContent(role, headline) {
  const ping = role ? `${role} ` : '';
  return `${ping}${headline}`;
}

/** Trim a title to what an embed title can hold, leaving room for a prefix. */
export function fitTitle(prefix, text) {
  const room = MAX_EMBED_TITLE - prefix.length;
  return `${prefix}${text.length > room ? `${text.slice(0, room - 1)}…` : text}`;
}

/**
 * The full watch-party card: titles, start time, where to stream, and the
 * text — the moderator's own, AI flavor, or the plain template.
 *
 * @param {object} opts
 * @param {Array<{title, episodes}>} opts.segments - what's being watched
 * @param {string} opts.timeText - the start time as shown (free text, or a Discord <t:…> timestamp)
 * @param {string|null} opts.role - a role mention (`<@&id>` or a Role), pinged in content
 * @param {string|null} opts.eventUrl - a scheduled event's link; Discord shows it as the event's card
 * @returns {Promise<{notFound: string[]} | {payload, usedAi: boolean}>}
 */
export async function composePartyPost({ segments, timeText, host = null, tone = null, customTone = null, manualMessage = null, role = null, guildConfig = {}, eventUrl = null }) {
  const region = guildConfig.region || 'US';
  const resolvedSegments = await Promise.all(
    segments.map(s => resolveSegment(s.title, s.episodes, region))
  );

  const notFound = segments
    .map((s, i) => (resolvedSegments[i] ? null : s.title))
    .filter(Boolean);
  if (notFound.length > 0) return { notFound };

  // A manual message is the point of the option: post it as written, make no
  // AI call, spend nothing. AI only fills in when nothing was written AND the
  // server wants it.
  let bodyText = manualMessage;
  let usedAi = false;

  if (!bodyText) {
    if (getAiTextEnabled(guildConfig)) {
      const flavorText = await generateAnnouncementText({
        segments: resolvedSegments,
        tone,
        customTone,
        timeText,
        host,
      });
      if (flavorText) {
        bodyText = flavorText;
        usedAi = true;
      }
    }
    bodyText = bodyText || buildFallbackText(resolvedSegments, timeText, host);
  }

  const titles = resolvedSegments
    .map(s => (s.episodes ? `${s.title} (${s.episodes})` : s.title))
    .join(' + ');

  const streamingLines = resolvedSegments
    .map(s => s.streamingText)
    .filter(Boolean)
    .join('\n');

  const embed = new EmbedBuilder()
    .setColor(0xFF6B9D)
    .setTitle(fitTitle('🍿 Watch Party: ', titles))
    .setDescription(bodyText)
    .addFields({
      name: '🕒 Starts',
      value: timeText,
      inline: true,
    })
    .setTimestamp();

  if (host) {
    embed.addFields({ name: '🎤 Hosted by', value: host, inline: true });
  }
  if (streamingLines) {
    embed.addFields({ name: '📺 Where to watch', value: streamingLines.slice(0, 1024), inline: false });
  }

  const artUrl = resolvedSegments.find(s => s.artUrl)?.artUrl;
  if (artUrl) embed.setImage(artUrl);

  // The event link goes in content, where Discord turns it into the event's
  // own card — with the Interested button people use to get reminded
  const headline = `🍿 **Watch party:** ${titles} — starts at **${timeText}**${eventUrl ? `\n${eventUrl}` : ''}`;

  return {
    usedAi,
    payload: {
      content: buildPingContent(role, headline),
      embeds: [embed],
    },
  };
}

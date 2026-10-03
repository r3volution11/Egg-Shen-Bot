/**
 * Where an event request's title can be streamed, for its description
 * (Doug, 2026-10-03): "📺 Streaming on Shudder, AMC+ and Tubi (free)" plus a
 * link to every other place to watch it.
 *
 * Only the services a server cares about are named. Each server sets its
 * own list (`eventRequests.streaming.services`); the default is the nine
 * Doug picked for Shudder. Any other install, or any other server on one
 * install, sets its own.
 *
 * The title is matched with resolveWatchTitle (watchTitle.js), which only
 * answers when it's confident. No confident match, no line: a wrong
 * "streaming on" is worse than none.
 *
 * Imported dynamically by server.js and eventRequestApproval.js, so suites
 * that stub tmdbService with only the functions they use aren't affected.
 * Tests switch the lookup off with EVENT_STREAMING_LOOKUP=off
 * (tests/jest.setup.js) so a submit never reaches the real TMDB; the
 * suites for this file switch it back on.
 */

import { getMovieDetails, getTVShowDetails, getUnifiedMovieWatchProviders, getUnifiedTVWatchProviders } from '../services/tmdbService.js';
import { resolveWatchTitle } from './watchTitle.js';

export const DEFAULT_STREAMING_SERVICES = ['Shudder', 'AMC+', 'Tubi', 'Plex', 'Roku', 'Prime Video', 'Hulu', 'Peacock', 'Hoopla'];

/** How long a lookup may take before the request goes ahead without it */
export const LOOKUP_TIMEOUT_MS = 5000;

/** The server's streaming-line settings. Configs predating the key lack it. */
export function getStreamingSettings(config) {
  const s = config?.eventRequests?.streaming || {};
  const services = Array.isArray(s.services)
    ? [...new Set(s.services.filter(x => typeof x === 'string').map(x => x.trim()).filter(Boolean))].slice(0, 20)
    : [];
  return {
    enabled: s.enabled !== false,
    services: services.length ? services : [...DEFAULT_STREAMING_SERVICES],
  };
}

/** "Shudder, AMC+" → ['Shudder', 'AMC+']; "default" → the default list */
export function parseServiceList(text) {
  if (String(text).trim().toLowerCase() === 'default') return [...DEFAULT_STREAMING_SERVICES];
  return [...new Set(String(text).split(/[,\n]/).map(x => x.trim()).filter(Boolean))].slice(0, 20);
}

// ── matching a service to the providers' own names ──────────────────────

/**
 * A provider's name as words, "+" kept so "AMC+" is never "AMC".
 * "AMC+ Amazon Channel" → ['amc+', 'amazon', 'channel']
 */
const words = (name) => String(name).toLowerCase().replace(/[^a-z0-9+\s]/g, ' ').split(/\s+/).filter(Boolean);

/** Does `name` start with every word of `prefix`, in order? */
const startsWithWords = (name, prefix) => {
  const n = words(name);
  const p = words(prefix);
  return p.length > 0 && p.every((w, i) => n[i] === w);
};

/**
 * Other names the providers use for a service. Everything else matches by
 * leading words: "Shudder" matches "Shudder Amazon Channel", "Tubi" matches
 * "Tubi TV", "Peacock" matches "Peacock Premium Plus".
 */
const ALIASES = {
  'prime video': ['Amazon Prime Video'],
  roku: ['The Roku Channel', 'Roku Channel'],
  'amc+': ['AMC Plus'],
  'apple tv+': ['Apple TV Plus'],
  'disney+': ['Disney Plus'],
  'paramount+': ['Paramount Plus'],
  max: ['HBO Max'],
};

/** Names a server can list that the bot already knows (for the setup reply) */
export const KNOWN_SERVICES = [
  ...DEFAULT_STREAMING_SERVICES,
  'Netflix', 'Max', 'Disney+', 'Paramount+', 'Apple TV+', 'MGM+', 'Starz', 'Criterion Channel', 'Pluto TV',
  'Kanopy', 'Crunchyroll', 'Screambox', 'Mubi', 'Philo', 'Sling TV', 'fuboTV', 'BritBox', 'Arrow',
];

export const isKnownService = (name) => KNOWN_SERVICES.some(k => words(k).join(' ') === words(name).join(' '));

export function serviceMatches(service, providerName) {
  return [service, ...(ALIASES[words(service).join(' ')] || [])].some(n => startsWithWords(providerName, n));
}

/**
 * Which of a server's services carry it, in the server's order, free ones
 * marked. Rent and buy don't count.
 */
export function pickServices(providers, services) {
  const names = (list) => (list || []).map(p => p.provider_name);
  const free = names(providers?.free);
  const streaming = [...names(providers?.flatrate), ...free];
  return services
    .filter(s => streaming.some(p => serviceMatches(s, p)))
    .map(s => (free.some(p => serviceMatches(s, p)) ? `${s} (free)` : s));
}

// ── the lookup ──────────────────────────────────────────────────────────

const joinNames = (list) => (list.length <= 1 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`);

/**
 * Where a title streams, among the server's services.
 * @returns {Promise<{label, type, tmdbId, services: string[], link: string} | null>} null when the title isn't confidently known
 */
export async function lookupEventStreaming(title, { region = 'US', services = DEFAULT_STREAMING_SERVICES } = {}) {
  const match = await resolveWatchTitle(title);
  if (!match) return null;

  const details = match.type === 'movie' ? await getMovieDetails(match.tmdbId) : await getTVShowDetails(match.tmdbId);
  const imdbId = details?.external_ids?.imdb_id || null;
  const providers = match.type === 'movie'
    ? await getUnifiedMovieWatchProviders(match.tmdbId, imdbId, region)
    : await getUnifiedTVWatchProviders(match.tmdbId, imdbId, region);

  return {
    label: match.label,
    type: match.type,
    tmdbId: match.tmdbId,
    services: pickServices(providers, services),
    // TMDB's watch page for this exact title and region (JustWatch's data)
    link: providers?.link || `https://www.themoviedb.org/${match.type}/${match.tmdbId}/watch?locale=${region}`,
  };
}

/** The lines added to the event's description */
export function formatStreaming(result) {
  if (!result) return null;
  const first = result.services.length
    ? `📺 Streaming on ${joinNames(result.services)}`
    : '📺 Not streaming on the usual services';
  return `${first}\nMore places to watch: ${result.link}`;
}

/** Will this server's requests be looked up at all? */
export function streamingLookupOn(config) {
  return getStreamingSettings(config).enabled && process.env.EVENT_STREAMING_LOOKUP !== 'off';
}

/**
 * The streaming lines for a request's title, or null: switched off, not
 * confidently known, failed, or too slow. Never throws.
 * @returns {Promise<string|null>}
 */
export async function streamingTextFor(title, config) {
  if (!streamingLookupOn(config)) return null;
  const settings = getStreamingSettings(config);
  try {
    let timer;
    const timeout = new Promise(resolve => { timer = setTimeout(() => resolve(null), LOOKUP_TIMEOUT_MS); });
    const result = await Promise.race([
      lookupEventStreaming(title, { region: config?.region || 'US', services: settings.services }),
      timeout,
    ]).finally(() => clearTimeout(timer));
    return formatStreaming(result);
  } catch (error) {
    console.error('[EventStreaming] Lookup failed:', error.message);
    return null;
  }
}

/**
 * The scheduled event's description: the person's text, then the
 * streaming lines, then (voice events) the coordination line — within
 * Discord's 1000 characters. The person's text is what gets trimmed; the
 * streaming lines and the coordination line are kept whole.
 */
export const EVENT_DESCRIPTION_MAX = 1000;

export function buildEventDescription({ description, streaming, coordination }) {
  const tail = [streaming, coordination].filter(Boolean).join('\n\n');
  let body = String(description || '').trim();
  const room = EVENT_DESCRIPTION_MAX - (tail ? tail.length + 2 : 0);
  if (body.length > room) body = room > 1 ? `${body.slice(0, room - 1).trimEnd()}…` : '';
  const text = [body, tail].filter(Boolean).join('\n\n');
  return text ? text.slice(0, EVENT_DESCRIPTION_MAX) : undefined;
}

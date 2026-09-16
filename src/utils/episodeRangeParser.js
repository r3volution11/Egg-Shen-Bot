/**
 * Parses a season/episode(-range) notation out of a free-text label — e.g. a
 * Discord scheduled event name or watch-party channel label like
 * "Tales from the Crypt - S5: E5 - E8" — and returns both the structured
 * season/episode-range and the show name with the notation stripped out.
 *
 * Unlike src/commands/episode.js's parseSeasonEpisode (which anchors against
 * a whole, dedicated episode-only field and has no range support), this
 * scans an arbitrary longer string for an embedded pattern and needs to
 * recover the show name around it, so it's a different kind of parser
 * entirely — kept in its own file rather than extending that one.
 */

// Matches: (Season|S) <num>[: ,]? [Episode(s)|Ep|E] <num> [- to – (Episode|Ep|E)? <num>]
// e.g. "S5E5-E8", "S5: E5 - E8", "Season 5 Episode 5-8", "Season 5, Episodes 5-8".
const VERBOSE_RANGE_PATTERN = /(?:season\s*(\d+)|s(\d+))\s*[:,]?\s*(?:episodes?|ep|e)\s*(\d+)(?:\s*(?:-|to|–)\s*(?:episodes?|ep|e)?\s*(\d+))?/i;

// Matches the shorthand "3x11" form (no range support — same single-episode
// coverage as episode.js's parseSeasonEpisode, just scanned instead of
// anchored, so a label like "Show Name 3x11" still resolves).
const SHORTHAND_PATTERN = /(\d+)x(\d+)/i;

/**
 * @param {string} label - Free-text label to scan, e.g. an event/channel name
 * @returns {{season: number, episodeStart: number, episodeEnd: number, showName: string}|null}
 *   null when no season/episode pattern is found, or when stripping it would
 *   leave no show name to search for.
 */
export function parseEpisodeRange(label) {
  if (!label || typeof label !== 'string') return null;

  // Try the verbose (S#E#[-E#], Season # Episode #[-#]) pattern first — it's
  // more specific and less prone to false-positive matches than the bare
  // "<n>x<n>" shorthand, which could otherwise misfire on unrelated numbers.
  let match = label.match(VERBOSE_RANGE_PATTERN);
  let season, episodeStart, episodeEnd;

  if (match) {
    season = parseInt(match[1] ?? match[2], 10);
    episodeStart = parseInt(match[3], 10);
    episodeEnd = match[4] ? parseInt(match[4], 10) : episodeStart;
  } else {
    match = label.match(SHORTHAND_PATTERN);
    if (!match) return null;
    season = parseInt(match[1], 10);
    episodeStart = parseInt(match[2], 10);
    episodeEnd = episodeStart;
  }

  if (!Number.isInteger(season) || !Number.isInteger(episodeStart) || !Number.isInteger(episodeEnd)) {
    return null;
  }

  // episodeEnd before episodeStart isn't a valid range (e.g. mangled input) —
  // treat as unparseable rather than guessing which number was meant.
  if (episodeEnd < episodeStart) return null;

  // Only the text BEFORE the matched notation is treated as the show name —
  // anything after (e.g. "The Office S9E23 - The Finale") is very unlikely
  // to be part of the title, so keeping only the prefix avoids gluing an
  // unrelated trailing phrase back onto the show name.
  const showName = label
    .slice(0, match.index)
    .replace(/[\s\-:,]+$/, '')
    .trim();

  if (!showName) return null;

  return { season, episodeStart, episodeEnd, showName };
}

/**
 * Resolves a show + episode range from a Discord scheduled event's name and
 * description, which watch-party hosts overwhelmingly split across the two
 * fields — name "Tales From the Crypt", description "Season 6 episodes 4 - 7".
 * parseEpisodeRange can't read that shape on its own: the description has no
 * show-name prefix, so it bails, and the name has no range notation at all.
 *
 * Deliberately restricted to the verbose pattern when reading a description.
 * Descriptions are free-form prose, where the bare "<n>x<n>" shorthand
 * misfires badly — "Join us at 8x30 pm" would otherwise parse as season 8,
 * episode 30 and send the timer off summing runtimes for a season that
 * probably doesn't exist. An event name is a much more constrained field, so
 * it keeps the full parseEpisodeRange treatment including the shorthand.
 *
 * @param {string} name - Scheduled event name
 * @param {string} [description] - Scheduled event description (nullable in Discord's API)
 * @returns {{season: number, episodeStart: number, episodeEnd: number, showName: string}|null}
 */
export function parseEventEpisodeRange(name, description) {
  // The name alone may already carry the whole notation
  // (e.g. "Severance - S2: E1-E3"), which is the case parseEpisodeRange
  // was built for.
  const fromName = parseEpisodeRange(name);
  if (fromName) return fromName;

  if (!name || typeof name !== 'string' || !name.trim()) return null;
  if (!description || typeof description !== 'string') return null;

  const match = description.match(VERBOSE_RANGE_PATTERN);
  if (!match) return null;

  const season = parseInt(match[1] ?? match[2], 10);
  const episodeStart = parseInt(match[3], 10);
  const episodeEnd = match[4] ? parseInt(match[4], 10) : episodeStart;

  if (!Number.isInteger(season) || !Number.isInteger(episodeStart) || !Number.isInteger(episodeEnd)) {
    return null;
  }

  if (episodeEnd < episodeStart) return null;

  // The whole event name is the show name here — unlike the single-string
  // case, there's no notation embedded in it that needs stripping out.
  return { season, episodeStart, episodeEnd, showName: name.trim() };
}

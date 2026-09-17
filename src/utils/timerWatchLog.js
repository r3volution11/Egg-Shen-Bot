/**
 * Shared helpers for turning a finished timer into a watch-history entry,
 * used by both copies of autoLogTimerToWatchHistory (the interaction-based
 * one in commands/timer.js for /timer stop, and the channel-based one in
 * utils/timerManager.js for auto-stop).
 *
 * The two copies exist because they post to different places and have
 * different callers; the *logic* for deciding what was watched should not
 * also be duplicated, so it lives here.
 */

/**
 * Work out which TMDB title a finished timer was for.
 *
 * Prefers the id the start flow already resolved and stored on the timer.
 * Falling back to a fresh title search is a guess: the search concatenates
 * movies ahead of TV and takes allResults[0], so a show that shares a name
 * with a movie ("Fargo", "Watchmen", "Hannibal") logs as the wrong title
 * entirely. The stored id removes the guess — and the round-trip.
 *
 * @param {object} timer - the stopped timer record
 * @param {string} title - the timer's label, used only for the fallback search
 * @param {object} tmdb - { searchMovies, searchTVShows, getMovieDetails, getTVShowDetails }
 * @returns {Promise<{tmdbId: number, type: string, details: object}|null>}
 *   null when nothing could be identified (caller should offer manual logging)
 */
export async function resolveWatchedTitle(timer, title, tmdb) {
  const { searchMovies, searchTVShows, getMovieDetails, getTVShowDetails } = tmdb;

  // The start flow identified this already — use it.
  if (timer?.tmdbId && (timer.type === 'movie' || timer.type === 'tv')) {
    try {
      const details = timer.type === 'movie'
        ? await getMovieDetails(timer.tmdbId)
        : await getTVShowDetails(timer.tmdbId);

      if (details) {
        return { tmdbId: timer.tmdbId, type: timer.type, details };
      }
      console.warn(`[Timer] Stored ${timer.type} id ${timer.tmdbId} returned no details; falling back to a title search`);
    } catch (error) {
      console.error('[Timer] Failed to fetch details for the stored title, falling back to a search:', error);
    }
  }

  // Board games have no watch-history equivalent, so they're never logged.
  if (timer?.type === 'boardgame') return null;

  if (!title) return null;

  const [movieResults, tvResults] = await Promise.all([
    searchMovies(title).catch(() => []),
    searchTVShows(title).catch(() => []),
  ]);

  const allResults = [
    ...(movieResults || []).map(r => ({ ...r, type: 'movie' })),
    ...(tvResults || []).map(r => ({ ...r, type: 'tv' })),
  ];

  if (allResults.length === 0) return null;

  const result = allResults[0];
  const details = result.type === 'movie'
    ? await getMovieDetails(result.id)
    : await getTVShowDetails(result.id);

  if (!details) return null;

  return { tmdbId: result.id, type: result.type, details };
}

/**
 * The note stored alongside a watch-history entry.
 *
 * Watch history is title-level — there's no season/episode anywhere in its
 * schema — so a multi-episode party is deliberately ONE show-level row, with
 * the range recorded here. That keeps "how often do we watch this show"
 * answerable by counting rows per tmdbId, instead of four identical-looking
 * rows crowding out everything else in /watched history.
 *
 * @param {string} elapsedTime - formatted elapsed time
 * @param {object|null} episodeRange - {season, episodeStart, episodeEnd}
 * @param {string} [suffix] - e.g. ' (auto-completed)'
 */
export function buildWatchLogNotes(elapsedTime, episodeRange, suffix = '') {
  const base = `Watch party timer: ${elapsedTime}${suffix}`;

  if (!episodeRange) return base;

  const { season, episodeStart, episodeEnd } = episodeRange;
  const episodes = episodeStart === episodeEnd
    ? `E${episodeStart}`
    : `E${episodeStart}-${episodeEnd}`;

  return `${base} • S${season} ${episodes}`;
}

/**
 * Nudge people toward /timer pause instead of stopping and restarting.
 *
 * Multi-episode watch parties are the case that actually suffers: people
 * stop the timer during a break between episodes and start a fresh one
 * afterward, which loses the running total for the party. The TV/range
 * wording says so explicitly; everything else gets the short version, since
 * intermissions happen during movies too.
 *
 * @param {object|null} timer - the stopped timer record (may lack type/range)
 * @returns {string}
 */
export function buildPauseHint(timer) {
  const isMultiEpisode = timer?.episodeRange
    && timer.episodeRange.episodeEnd > timer.episodeRange.episodeStart;

  if (isMultiEpisode || timer?.type === 'tv') {
    return 'Watching several episodes? Use /timer pause between them instead of stopping — it keeps the total for the whole party.';
  }

  return 'Tip: use /timer pause during breaks instead of stopping — it keeps your elapsed time.';
}

/**
 * Turns a guild's watch history into recommendations.
 *
 * The aggregation half is deliberately pure — it takes an array of history
 * entries and returns plain data, with no file or network I/O — so the logic
 * that actually decides what the server likes can be tested directly against
 * fixtures rather than through Discord and TMDB mocks.
 */

import {
  getSimilarMovies,
  getSimilarTV,
} from '../services/tmdbService.js';

/**
 * Identity for a watched title.
 *
 * Watch-history rows disagree about the type of `tmdbId`: commands/watched.js
 * stores the number TMDB returned, while handlers/selectHandler.js stores the
 * string it parsed out of a customId. Keying on the raw value would put 550
 * and "550" in different buckets and silently halve a rewatch count, so
 * everything is normalized to a string here.
 *
 * @param {string} type - 'movie' | 'tv'
 * @param {string|number} tmdbId
 */
export function watchKey(type, tmdbId) {
  return `${type}:${String(tmdbId)}`;
}

/**
 * Collapse raw history rows into per-title records with play counts.
 *
 * Pure — pass it entries, get back data. No I/O.
 *
 * @param {Array} entries - rows as stored by watchHistoryManager
 * @returns {{
 *   list: Array<{key, tmdbId, type, title, year, count, lastWatchedAt}>,
 *   byKey: Map, watchedKeys: Set<string>, maxCount: number, repeatCount: number
 * }}
 */
export function aggregateWatchHistory(entries) {
  const byKey = new Map();

  for (const entry of entries || []) {
    if (!entry || entry.tmdbId === undefined || entry.tmdbId === null) continue;
    if (entry.type !== 'movie' && entry.type !== 'tv') continue;

    const key = watchKey(entry.type, entry.tmdbId);
    const existing = byKey.get(key);
    const watchedAt = Number(entry.watchedAt) || 0;

    if (existing) {
      existing.count += 1;
      // Rows arrive newest-first, but don't rely on that — take the max.
      if (watchedAt > existing.lastWatchedAt) {
        existing.lastWatchedAt = watchedAt;
      }
    } else {
      byKey.set(key, {
        key,
        tmdbId: entry.tmdbId,
        type: entry.type,
        title: entry.title || 'Unknown',
        year: entry.year || '',
        count: 1,
        lastWatchedAt: watchedAt,
      });
    }
  }

  const list = [...byKey.values()];
  const maxCount = list.reduce((max, item) => Math.max(max, item.count), 0);
  const repeatCount = list.filter(item => item.count >= 2).length;

  return {
    list,
    byKey,
    watchedKeys: new Set(byKey.keys()),
    maxCount,
    repeatCount,
  };
}

/**
 * Order titles by how much the server evidently likes them.
 *
 * Play count first, recency as the tiebreak. On a young server where nothing
 * has been rewatched yet, every count is 1 and this degrades cleanly to
 * "most recent first" — which is still a reasonable statement of taste.
 */
export function sortByAffinity(list) {
  return [...list].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return b.lastWatchedAt - a.lastWatchedAt;
  });
}

/** The titles to ask TMDB "what's like this?" about. */
export function pickSeeds(aggregate, limit = 8) {
  return sortByAffinity(aggregate.list).slice(0, limit);
}

/**
 * Fetch TMDB's similar titles for each seed and merge them.
 *
 * getSimilarMovies/getSimilarTV THROW on failure (unlike the watch-provider
 * functions, which return null), so this uses allSettled — one dead seed
 * must not take down the whole recommendation.
 *
 * `seedCount` records how many different seeds surfaced a candidate, which
 * is a free co-occurrence signal: something similar to four things the
 * server watched is a better bet than something similar to one.
 */
export async function gatherCandidates(seeds, type) {
  const fetchSimilar = type === 'movie' ? getSimilarMovies : getSimilarTV;

  const settled = await Promise.allSettled(
    seeds.map(seed => fetchSimilar(seed.tmdbId))
  );

  const candidates = new Map();

  settled.forEach((outcome, index) => {
    if (outcome.status !== 'fulfilled' || !Array.isArray(outcome.value)) return;

    for (const result of outcome.value) {
      if (!result || !result.id) continue;

      const key = watchKey(type, result.id);
      const existing = candidates.get(key);

      if (existing) {
        existing.seedCount += 1;
        existing.seedTitles.push(seeds[index].title);
      } else {
        candidates.set(key, {
          ...result,
          key,
          type,
          seedCount: 1,
          seedTitles: [seeds[index].title],
        });
      }
    }
  });

  return [...candidates.values()];
}

/**
 * Drop candidates the server has already watched.
 */
export function excludeWatched(candidates, watchedKeys) {
  return candidates.filter(candidate => !watchedKeys.has(candidate.key));
}

/**
 * Keep only candidates carrying a genre.
 *
 * TMDB list results (from /similar and /discover) carry `genre_ids`, so this
 * costs nothing — no extra API calls. Entries missing the field can't be
 * shown to match, so they're excluded whenever a genre is actually requested.
 */
export function filterByGenre(candidates, genreId) {
  if (!genreId) return candidates;
  const wanted = Number(genreId);

  return candidates.filter(candidate =>
    Array.isArray(candidate.genre_ids) && candidate.genre_ids.includes(wanted)
  );
}

/**
 * Keep only candidates released in a decade.
 */
export function filterByDecade(candidates, decade) {
  if (!decade) return candidates;
  const start = parseInt(decade, 10);
  if (!Number.isInteger(start)) return candidates;

  return candidates.filter(candidate => {
    const date = candidate.release_date || candidate.first_air_date;
    if (!date) return false;
    const year = parseInt(String(date).slice(0, 4), 10);
    return Number.isInteger(year) && year >= start && year <= start + 9;
  });
}

const MIN_VOTES = 50;

/**
 * Rank candidates, preferring things that several seeds agreed on.
 *
 * The vote floor keeps obscure one-vote entries out, but is relaxed rather
 * than enforced when it would leave too few results — a short list of
 * plausible picks beats an empty one.
 */
export function scoreCandidates(candidates, minResults = 5) {
  const score = candidate =>
    candidate.seedCount * 2 +
    (candidate.vote_average || 0) +
    Math.log10((candidate.vote_count || 0) + 1);

  const wellKnown = candidates.filter(c => (c.vote_count || 0) >= MIN_VOTES);
  const pool = wellKnown.length >= minResults ? wellKnown : candidates;

  return [...pool]
    .map(candidate => ({ ...candidate, score: score(candidate) }))
    .sort((a, b) => b.score - a.score);
}

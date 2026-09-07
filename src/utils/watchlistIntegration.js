/**
 * Watchlist integrations with other subsystems.
 *
 * Kept separate from watchlistManager so that module stays pure storage, and
 * separate from bracketManager, which is synchronous while watchlist writes
 * are async.
 */

import { loadGuildConfig } from './guildConfig.js';
import { addToWatchlist, DEFAULT_MAX_SIZE } from './watchlistManager.js';

/**
 * Add a finished tournament's champion to the watchlist, when the guild has
 * opted in. A tournament exists to decide what to watch, so the result should
 * land on the queue rather than needing to be retyped.
 *
 * Only titles the watchlist can actually represent are added: a champion needs
 * a TMDb id and a movie/tv type. Tournaments can also run on games, board games
 * and books, which the watchlist does not cover — those are skipped silently.
 *
 * Never throws: a watchlist failure must not disrupt announcing a winner.
 *
 * @param {string} guildId
 * @param {Object} tournament - The completed tournament
 * @returns {Promise<{added: boolean, title?: string, reason?: string}>}
 */
export async function addChampionToWatchlist(guildId, tournament) {
  try {
    const champion = tournament?.winner || tournament?.champion;
    if (!champion) return { added: false, reason: 'no champion' };

    const config = await loadGuildConfig(guildId);
    if (!config.watchlist?.autoAddChampion) {
      return { added: false, reason: 'disabled' };
    }

    // The watchlist is TMDb-backed; other tournament types have no entry there.
    if (champion.type !== 'movie' && champion.type !== 'tv') {
      return { added: false, reason: 'unsupported type' };
    }
    if (!champion.id && !champion.tmdbId) {
      return { added: false, reason: 'no tmdb id' };
    }

    const result = await addToWatchlist(
      guildId,
      {
        tmdbId: champion.tmdbId || champion.id,
        type: champion.type,
        title: champion.title,
        year: champion.year || null,
        posterUrl: champion.customImageUrl || champion.posterUrl || null,
        note: null,
        addedBy: 'Egg Shen Bot',
        addedById: null,
        source: `🏆 Won ${tournament.name}`,
      },
      config.watchlist?.maxSize || DEFAULT_MAX_SIZE
    );

    return result.success
      ? { added: true, title: champion.title }
      : { added: false, reason: result.error };
  } catch (error) {
    console.error('Error adding champion to watchlist:', error);
    return { added: false, reason: 'error' };
  }
}

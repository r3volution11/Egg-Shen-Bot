/**
 * How many results a search picker may offer.
 *
 * A Discord select menu holds at most 25 options; discord.js throws building
 * a 26th ("Invalid number value"), and the command fails with its generic
 * error. `/eggshen-config settings max-results` used to accept 1-50 and every
 * picker sliced its results to that number unchecked, so on a server set
 * above 25 any search with more than 25 matches failed: `/similar` with no
 * type (movies, shows and up to 40 books together), Google Books (40),
 * BoardGameGeek, `/soundtrack` (iTunes plus Spotify). TMDB's pages of 20
 * hid it for `/movie` and `/tv`.
 *
 * The setting is capped at 25 now, but a config saved before then can still
 * hold up to 50 (there are no config migrations), so every picker reads the
 * setting through here rather than directly.
 */

/** Discord's limit on the options in one select menu. */
export const MAX_SELECT_OPTIONS = 25;

/** What a server gets when it never set max-results (guildConfig.js defaultConfig). */
const DEFAULT_SEARCH_RESULTS = 20;

/**
 * The number of results this server's pickers show: its max-results setting,
 * at most 25. A missing, nonsense or below-1 value is the default, 20.
 *
 * @param {object} guildConfig
 * @returns {number} 1-25
 */
export function searchResultLimit(guildConfig) {
  const value = Math.floor(Number(guildConfig?.maxSearchResults));
  if (!Number.isFinite(value) || value < 1) return DEFAULT_SEARCH_RESULTS;
  return Math.min(MAX_SELECT_OPTIONS, value);
}

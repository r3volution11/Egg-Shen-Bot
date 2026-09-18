import axios from 'axios';
import { config } from '../config.js';

const tmdbApi = axios.create({
  baseURL: config.apis.tmdb.baseUrl,
  params: {
    api_key: config.apis.tmdb.apiKey,
  },
});

/**
 * Search for movies
 */
export async function searchMovies(query) {
  try {
    const response = await tmdbApi.get('/search/movie', {
      params: { query, language: 'en-US', page: 1 },
    });
    return response.data.results.slice(0, 50); // Return top 50 results (commands will slice based on guild config)
  } catch (error) {
    console.error('TMDB movie search error:', error.message);
    throw new Error('Failed to search for movies');
  }
}

/**
 * Search for TV shows
 */
export async function searchTVShows(query) {
  try {
    const response = await tmdbApi.get('/search/tv', {
      params: { query, language: 'en-US', page: 1 },
    });
    return response.data.results.slice(0, 50); // Return top 50 results (commands will slice based on guild config)
  } catch (error) {
    console.error('TMDB TV search error:', error.message);
    throw new Error('Failed to search for TV shows');
  }
}

/**
 * Get alternative/AKA titles for a movie, with region/type metadata intact
 * (e.g. reissue titles like "I Spit on Your Grave" for a film TMDB's
 * primary title still lists as "Day of the Woman"). Returns [] on failure —
 * this is a supplementary lookup, not a critical path.
 */
export async function getMovieAlternativeTitlesDetailed(movieId) {
  try {
    const response = await tmdbApi.get(`/movie/${movieId}/alternative_titles`);
    return response.data.titles || [];
  } catch (error) {
    console.error('TMDB movie alternative titles error:', error.message);
    return [];
  }
}

/**
 * Get alternative/AKA titles for a TV show, with region/type metadata
 * intact. See getMovieAlternativeTitlesDetailed.
 */
export async function getTVAlternativeTitlesDetailed(tvId) {
  try {
    const response = await tmdbApi.get(`/tv/${tvId}/alternative_titles`);
    return response.data.results || [];
  } catch (error) {
    console.error('TMDB TV alternative titles error:', error.message);
    return [];
  }
}

/**
 * Get alternative/AKA titles for a movie as a flat, deduped array of title
 * strings. Used for query matching, where region/type don't matter — see
 * getMovieAlternativeTitlesDetailed for the full metadata.
 */
export async function getMovieAlternativeTitles(movieId) {
  const titles = await getMovieAlternativeTitlesDetailed(movieId);
  return [...new Set(titles.map(t => t.title))];
}

/**
 * Get alternative/AKA titles for a TV show as a flat, deduped array of
 * title strings. See getMovieAlternativeTitles.
 */
export async function getTVAlternativeTitles(tvId) {
  const titles = await getTVAlternativeTitlesDetailed(tvId);
  return [...new Set(titles.map(t => t.title))];
}

/**
 * Pick the single best "also known as" title to show alongside a media
 * item's primary title, or null if there's no good candidate. Prioritizes
 * US-region titles (this bot's primary audience), then any non-region-
 * specific title, skipping ones identical to the primary title.
 * @param {string} primaryTitle - The title already being displayed
 * @param {Array<{iso_3166_1: string, title: string, type?: string}>} alternativeTitles
 * @returns {string|null}
 */
export function pickKnownAsTitle(primaryTitle, alternativeTitles) {
  if (!alternativeTitles || alternativeTitles.length === 0) {
    return null;
  }

  const normalizedPrimary = (primaryTitle || '').trim().toLowerCase();
  const isDifferent = (t) => t.title && t.title.trim().toLowerCase() !== normalizedPrimary;

  const usTitle = alternativeTitles.find(t => t.iso_3166_1 === 'US' && isDifferent(t));
  if (usTitle) return usTitle.title;

  const anyTitle = alternativeTitles.find(isDifferent);
  return anyTitle ? anyTitle.title : null;
}

/**
 * Get detailed movie information including external IDs
 */
export async function getMovieDetails(movieId) {
  try {
    const [details, externalIds] = await Promise.all([
      tmdbApi.get(`/movie/${movieId}`, { params: { language: 'en-US' } }),
      tmdbApi.get(`/movie/${movieId}/external_ids`),
    ]);
    
    return {
      ...details.data,
      external_ids: externalIds.data,
    };
  } catch (error) {
    console.error('TMDB movie details error:', error.message);
    throw new Error('Failed to get movie details');
  }
}

/**
 * Get detailed TV show information including external IDs
 */
export async function getTVShowDetails(tvId) {
  try {
    const [details, externalIds] = await Promise.all([
      tmdbApi.get(`/tv/${tvId}`, { params: { language: 'en-US' } }),
      tmdbApi.get(`/tv/${tvId}/external_ids`),
    ]);
    
    return {
      ...details.data,
      external_ids: externalIds.data,
    };
  } catch (error) {
    console.error('TMDB TV details error:', error.message);
    throw new Error('Failed to get TV show details');
  }
}

/**
 * Get season details including all episodes
 */
export async function getSeasonDetails(tvId, seasonNumber) {
  try {
    const response = await tmdbApi.get(
      `/tv/${tvId}/season/${seasonNumber}`,
      { params: { language: 'en-US' } }
    );
    return response.data;
  } catch (error) {
    console.error('TMDB season details error:', error.message);
    return null;
  }
}

/**
 * Sum episode runtimes across a range within one season, for multi-episode
 * watch-party timers (e.g. "S5 E5-E8"). TMDB's per-episode runtime is
 * sometimes missing — rather than silently undercounting or aborting the
 * whole calculation, a missing episode's runtime falls back to the show's
 * average episode_run_time and is flagged `estimated` for transparent
 * display, rather than being hidden inside the total.
 * @param {object} seasonDetails - Result of getSeasonDetails()
 * @param {number} episodeStart - First episode number in the range (inclusive)
 * @param {number} episodeEnd - Last episode number in the range (inclusive)
 * @param {number|null} fallbackPerEpisodeRuntime - Show's average episode
 *   runtime, used for episodes with no runtime data of their own
 * @returns {{episodeCount: number, breakdown: Array<{episodeNumber: number, runtime: number|null, estimated: boolean}>, totalRuntime: number}|null}
 *   null if no episodes in the season fall within the requested range
 */
export function sumEpisodeRuntimes(seasonDetails, episodeStart, episodeEnd, fallbackPerEpisodeRuntime = null) {
  const episodes = (seasonDetails?.episodes || []).filter(
    ep => ep.episode_number >= episodeStart && ep.episode_number <= episodeEnd
  );

  if (episodes.length === 0) return null;

  const breakdown = episodes
    .sort((a, b) => a.episode_number - b.episode_number)
    .map(ep => {
      const hasRealRuntime = typeof ep.runtime === 'number' && ep.runtime > 0;
      return {
        episodeNumber: ep.episode_number,
        runtime: hasRealRuntime ? ep.runtime : fallbackPerEpisodeRuntime,
        estimated: !hasRealRuntime,
      };
    });

  const totalRuntime = breakdown.reduce((sum, ep) => sum + (ep.runtime || 0), 0);

  return { episodeCount: episodes.length, breakdown, totalRuntime };
}

/**
 * Get episode details for a specific TV show episode
 */
export async function getEpisodeDetails(tvId, seasonNumber, episodeNumber) {
  try {
    const [details, externalIds] = await Promise.all([
      tmdbApi.get(
        `/tv/${tvId}/season/${seasonNumber}/episode/${episodeNumber}`,
        { params: { language: 'en-US' } }
      ),
      tmdbApi.get(
        `/tv/${tvId}/season/${seasonNumber}/episode/${episodeNumber}/external_ids`
      ).catch(() => ({ data: {} })) // Gracefully handle if external_ids aren't available
    ]);
    
    return {
      ...details.data,
      external_ids: externalIds.data,
    };
  } catch (error) {
    console.error('TMDB episode details error:', error.message);
    throw new Error('Failed to get episode details');
  }
}

/**
 * Search for an episode by name across all seasons of a show
 */
export async function searchEpisodeByName(tvId, episodeName) {
  try {
    console.log(`Searching for episode "${episodeName}" in show ID ${tvId}...`);
    
    // First get show details to know how many seasons
    const showDetails = await getTVShowDetails(tvId);
    
    if (!showDetails || !showDetails.number_of_seasons) {
      console.log('Could not get show details or no seasons found');
      return null;
    }
    
    console.log(`Show has ${showDetails.number_of_seasons} seasons. Searching...`);
    
    // Search through each season
    for (let seasonNum = 1; seasonNum <= showDetails.number_of_seasons; seasonNum++) {
      console.log(`Checking season ${seasonNum}...`);
      const seasonDetails = await getSeasonDetails(tvId, seasonNum);
      
      if (!seasonDetails || !seasonDetails.episodes) {
        console.log(`Season ${seasonNum} has no episodes data`);
        continue;
      }
      
      console.log(`Season ${seasonNum} has ${seasonDetails.episodes.length} episodes`);
      
      // Log first few episode names for debugging
      if (seasonNum === 1) {
        console.log(`First 5 episodes: ${seasonDetails.episodes.slice(0, 5).map(e => e.name).join(', ')}`);
      }
      
      // Search episodes in this season
      const episode = seasonDetails.episodes.find(ep => 
        ep.name && ep.name.toLowerCase().includes(episodeName.toLowerCase())
      );
      
      if (episode) {
        console.log(`Found match: ${episode.name} (S${seasonNum}E${episode.episode_number})`);
        
        // Fetch detailed episode info including external IDs
        const episodeDetails = await getEpisodeDetails(tvId, seasonNum, episode.episode_number);
        
        return {
          ...episodeDetails,
          show: showDetails,
          season_number: seasonNum,
        };
      }
    }
    
    console.log(`No episode found matching "${episodeName}"`);
    return null;
  } catch (error) {
    console.error('TMDB episode search error:', error.message);
    return null;
  }
}

/**
 * Get poster URL
 */
export function getPosterUrl(posterPath, size = 'w500') {
  if (!posterPath) return null;
  return `${config.apis.tmdb.imageBaseUrl}/${size}${posterPath}`;
}

/**
 * Get backdrop URL
 */
export function getBackdropUrl(backdropPath, size = 'w1280') {
  if (!backdropPath) return null;
  return `${config.apis.tmdb.imageBaseUrl}/${size}${backdropPath}`;
}

/**
 * Discover random movies with optional filters
 * @param {Object} filters - Optional filters { genre, decade, minRating, maxRating }
 * @returns {Object} Random movie result
 */
export async function discoverRandomMovie(filters = {}) {
  try {
    const params = {
      language: 'en-US',
      sort_by: 'popularity.desc',
      include_adult: false,
      include_video: false,
      page: Math.floor(Math.random() * 50) + 1, // Random page 1-50
    };

    if (filters.genre) {
      params.with_genres = filters.genre;
    }
    
    if (filters.decade) {
      const startYear = parseInt(filters.decade);
      params['primary_release_date.gte'] = `${startYear}-01-01`;
      params['primary_release_date.lte'] = `${startYear + 9}-12-31`;
    }
    
    if (filters.minRating) {
      params['vote_average.gte'] = parseFloat(filters.minRating);
      params.vote_count_gte = 100; // Ensure sufficient votes
    }
    
    if (filters.maxRating) {
      params['vote_average.lte'] = parseFloat(filters.maxRating);
    }

    const response = await tmdbApi.get('/discover/movie', { params });
    const results = response.data.results;
    
    if (!results || results.length === 0) {
      return null;
    }
    
    // Pick a random movie from the page
    const randomIndex = Math.floor(Math.random() * results.length);
    return results[randomIndex];
  } catch (error) {
    console.error('TMDB discover movie error:', error.message);
    throw new Error('Failed to discover random movie');
  }
}

/**
 * Discover random TV show with optional filters
 * @param {Object} filters - Optional filters { genre, year, minRating, maxRating }
 * @returns {Object} Random TV show result
 */
export async function discoverRandomTV(filters = {}) {
  try {
    const params = {
      language: 'en-US',
      sort_by: 'popularity.desc',
      include_adult: false,
      page: Math.floor(Math.random() * 50) + 1, // Random page 1-50
    };

    if (filters.genre) {
      params.with_genres = filters.genre;
    }
    
    if (filters.decade) {
      const startYear = parseInt(filters.decade);
      params['first_air_date.gte'] = `${startYear}-01-01`;
      params['first_air_date.lte'] = `${startYear + 9}-12-31`;
    }
    
    if (filters.year) {
      params.first_air_date_year = parseInt(filters.year);
    }
    
    if (filters.minRating) {
      params['vote_average.gte'] = parseFloat(filters.minRating);
      params.vote_count_gte = 100; // Ensure sufficient votes
    }
    
    if (filters.maxRating) {
      params['vote_average.lte'] = parseFloat(filters.maxRating);
    }

    const response = await tmdbApi.get('/discover/tv', { params });
    const results = response.data.results;
    
    if (!results || results.length === 0) {
      return null;
    }
    
    // Pick a random show from the page
    const randomIndex = Math.floor(Math.random() * results.length);
    return results[randomIndex];
  } catch (error) {
    console.error('TMDB discover TV error:', error.message);
    throw new Error('Failed to discover random TV show');
  }
}

/**
 * Get similar movies
 * @param {string} movieId - TMDB movie ID
 * @returns {Array} Array of similar movies
 */
export async function getSimilarMovies(movieId) {
  try {
    const response = await tmdbApi.get(`/movie/${movieId}/similar`, {
      params: { language: 'en-US', page: 1 },
    });
    return response.data.results.slice(0, 10); // Return top 10
  } catch (error) {
    console.error('TMDB similar movies error:', error.message);
    throw new Error('Failed to get similar movies');
  }
}

/**
 * Get similar TV shows
 * @param {string} tvId - TMDB TV show ID
 * @returns {Array} Array of similar TV shows
 */
export async function getSimilarTV(tvId) {
  try {
    const response = await tmdbApi.get(`/tv/${tvId}/similar`, {
      params: { language: 'en-US', page: 1 },
    });
    return response.data.results.slice(0, 10); // Return top 10
  } catch (error) {
    console.error('TMDB similar TV error:', error.message);
    throw new Error('Failed to get similar TV shows');
  }
}

/**
 * Get watch providers for a movie
 * @param {string} movieId - TMDB movie ID
 * @param {string} region - ISO 3166-1 country code (default: 'US')
 * @returns {Object} Watch provider data with flatrate, rent, and buy options
 */
export async function getMovieWatchProviders(movieId, region = 'US') {
  try {
    const response = await tmdbApi.get(`/movie/${movieId}/watch/providers`);
    const providers = response.data.results[region];
    
    if (!providers) {
      return null;
    }
    
    return {
      link: providers.link,
      flatrate: providers.flatrate || [], // Streaming services
      rent: providers.rent || [], // Rental options
      buy: providers.buy || [], // Purchase options
    };
  } catch (error) {
    console.error('TMDB movie watch providers error:', error.message);
    return null; // Return null on error, don't throw
  }
}

/**
 * Get watch providers for a TV show
 * @param {string} tvId - TMDB TV show ID
 * @param {string} region - ISO 3166-1 country code (default: 'US')
 * @returns {Object} Watch provider data with flatrate, rent, and buy options
 */
export async function getTVWatchProviders(tvId, region = 'US') {
  try {
    const response = await tmdbApi.get(`/tv/${tvId}/watch/providers`);
    const providers = response.data.results[region];
    
    if (!providers) {
      return null;
    }
    
    return {
      link: providers.link,
      flatrate: providers.flatrate || [], // Streaming services
      rent: providers.rent || [], // Rental options
      buy: providers.buy || [], // Purchase options
    };
  } catch (error) {
    console.error('TMDB TV watch providers error:', error.message);
    return null; // Return null on error, don't throw
  }
}

/**
 * Merge watch provider data from TMDB and Watchmode, removing duplicates
 * @param {Object} tmdbProviders - TMDB provider data
 * @param {Object} watchmodeProviders - Watchmode provider data
 * @returns {Object} Merged provider data with duplicates removed
 */
function mergeWatchProviders(tmdbProviders, watchmodeProviders) {
  if (!tmdbProviders && !watchmodeProviders) {
    return null;
  }

  const merged = {
    link: tmdbProviders?.link || null,
    flatrate: [],
    rent: [],
    buy: [],
  };

  // Helper to normalize provider names for comparison
  const normalize = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Helper to add providers without duplicates
  const addProviders = (target, providers) => {
    if (!providers) return;
    
    for (const provider of providers) {
      const normalizedName = normalize(provider.provider_name);
      const isDuplicate = target.some(p => normalize(p.provider_name) === normalizedName);
      
      if (!isDuplicate) {
        target.push(provider);
      }
    }
  };

  // Add TMDB providers first (they have better logos from TMDB's CDN)
  addProviders(merged.flatrate, tmdbProviders?.flatrate);
  addProviders(merged.rent, tmdbProviders?.rent);
  addProviders(merged.buy, tmdbProviders?.buy);

  // Add Watchmode providers (may include services TMDB doesn't have)
  addProviders(merged.flatrate, watchmodeProviders?.flatrate);
  addProviders(merged.rent, watchmodeProviders?.rent);
  addProviders(merged.buy, watchmodeProviders?.buy);

  // Return null if no providers found
  if (merged.flatrate.length === 0 && merged.rent.length === 0 && merged.buy.length === 0) {
    return null;
  }

  return merged;
}

/**
 * Get unified watch providers for a movie (TMDB + Watchmode)
 * @param {string} movieId - TMDB movie ID
 * @param {string} imdbId - IMDB ID for Watchmode lookup
 * @param {string} region - ISO 3166-1 country code (default: 'US')
 * @returns {Object} Unified watch provider data
 */
export async function getUnifiedMovieWatchProviders(movieId, imdbId, region = 'US') {
  const { getWatchmodeProvidersByImdbId } = await import('./watchmodeService.js');

  const [tmdbProviders, watchmodeProviders] = await Promise.all([
    getMovieWatchProviders(movieId, region),
    imdbId ? getWatchmodeProvidersByImdbId(imdbId, region) : null,
  ]);

  return mergeWatchProviders(tmdbProviders, watchmodeProviders);
}

/**
 * Get unified watch providers for a TV show (TMDB + Watchmode)
 * @param {string} tvId - TMDB TV show ID
 * @param {string} imdbId - IMDB ID for Watchmode lookup
 * @param {string} region - ISO 3166-1 country code (default: 'US')
 * @returns {Object} Unified watch provider data
 */
export async function getUnifiedTVWatchProviders(tvId, imdbId, region = 'US') {
  const { getWatchmodeProvidersByImdbId } = await import('./watchmodeService.js');

  const [tmdbProviders, watchmodeProviders] = await Promise.all([
    getTVWatchProviders(tvId, region),
    imdbId ? getWatchmodeProvidersByImdbId(imdbId, region) : null,
  ]);

  return mergeWatchProviders(tmdbProviders, watchmodeProviders);
}


// ---------------------------------------------------------------------------
// Genre lists
// ---------------------------------------------------------------------------

// TMDB's genre taxonomies are effectively immutable, so one fetch per process
// is plenty. Caching also matters for autocomplete, which fires on every
// keystroke — that must never become a TMDB request per character typed.
const genreListCache = new Map(); // 'movie' | 'tv' -> [{id, name}]

/**
 * Fetch TMDB's genre list for a media type.
 *
 * Movie and TV have DIFFERENT taxonomies, and the difference is not cosmetic:
 * TV has no Horror and no Romance at all, while movies do. Hardcoding the
 * lists (as /random did) let two movie-only IDs sit in the TV list, where
 * they silently returned zero results. Reading them from TMDB means the
 * options offered are always exactly the ones TMDB will accept.
 *
 * @param {'movie'|'tv'} type
 * @returns {Promise<Array<{id: number, name: string}>>} empty array on failure
 */
export async function getGenres(type) {
  if (genreListCache.has(type)) {
    return genreListCache.get(type);
  }

  try {
    const response = await tmdbApi.get(`/genre/${type}/list`, {
      params: { language: 'en-US' },
    });
    const genres = response.data?.genres || [];
    // Only cache a real answer — an empty list from a transient failure
    // shouldn't poison the cache for the life of the process.
    if (genres.length > 0) {
      genreListCache.set(type, genres);
    }
    return genres;
  } catch (error) {
    console.error(`TMDB ${type} genre list error:`, error.message);
    return [];
  }
}

export const getMovieGenres = () => getGenres('movie');
export const getTVGenres = () => getGenres('tv');

/** Test-only: drop the cached genre lists. */
export function _resetGenreCache() {
  genreListCache.clear();
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

/**
 * Search TMDB for a person, ranking directors first.
 *
 * Names collide across departments — "John Carpenter" is both a director
 * (11770) and an actor (2244869) — and for a director: filter the wrong one
 * yields nothing. TMDB's own ordering doesn't account for that, so known
 * directors are promoted ahead of equally-popular actors.
 *
 * @param {string} query
 * @returns {Promise<Array>} up to 10 people, directors first; [] on failure
 */
export async function searchPeople(query) {
  try {
    const response = await tmdbApi.get('/search/person', {
      params: { query, language: 'en-US', include_adult: false },
    });

    const results = response.data?.results || [];
    return [...results]
      .sort((a, b) => {
        const aDir = a.known_for_department === 'Directing' ? 1 : 0;
        const bDir = b.known_for_department === 'Directing' ? 1 : 0;
        if (aDir !== bDir) return bDir - aDir;
        return (b.popularity || 0) - (a.popularity || 0);
      })
      .slice(0, 10);
  } catch (error) {
    console.error('TMDB person search error:', error.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Discover (list-returning)
// ---------------------------------------------------------------------------

/**
 * Build /discover query params from a filter object.
 *
 * Shared by the list-returning discover below and kept deliberately separate
 * from discoverRandomMovie/discoverRandomTV's inline params, which also
 * randomize the page. Exported for testing — these keys are easy to typo and
 * TMDB silently ignores unrecognized ones rather than erroring (which is how
 * `vote_count_gte` went unnoticed).
 *
 * @param {'movie'|'tv'} type
 * @param {object} filters - {genre, decade, minRating, personId}
 */
export function buildDiscoverParams(type, filters = {}) {
  const params = {
    language: 'en-US',
    sort_by: 'popularity.desc',
    include_adult: false,
    'vote_count.gte': 50, // keep 1-vote curios out of recommendations
  };

  if (type === 'movie') {
    params.include_video = false;
  }

  if (filters.genre) {
    params.with_genres = String(filters.genre);
  }

  if (filters.decade) {
    const startYear = parseInt(filters.decade, 10);
    if (Number.isInteger(startYear)) {
      const dateKey = type === 'movie' ? 'primary_release_date' : 'first_air_date';
      params[`${dateKey}.gte`] = `${startYear}-01-01`;
      params[`${dateKey}.lte`] = `${startYear + 9}-12-31`;
    }
  }

  if (filters.minRating) {
    params['vote_average.gte'] = parseFloat(filters.minRating);
  }

  if (filters.personId) {
    // Movies credit a director in the crew; TV credits are modelled as
    // creators and per-episode directors, so with_crew finds almost nothing
    // there — with_people (cast OR crew) is the workable equivalent.
    if (type === 'movie') {
      params.with_crew = String(filters.personId);
    } else {
      params.with_people = String(filters.personId);
    }
  }

  return params;
}

/**
 * Discover a LIST of titles matching filters.
 *
 * discoverRandomMovie/discoverRandomTV return a single item from a randomly
 * chosen page, which is right for /random and wrong for recommendations —
 * this returns the ranked page so callers can score and pick.
 *
 * @param {'movie'|'tv'} type
 * @param {object} filters
 * @returns {Promise<Array>} [] on failure
 */
export async function discoverTitles(type, filters = {}) {
  try {
    const params = buildDiscoverParams(type, filters);
    const response = await tmdbApi.get(`/discover/${type}`, { params });
    return response.data?.results || [];
  } catch (error) {
    console.error(`TMDB discover ${type} error:`, error.message);
    return [];
  }
}

/**
 * Look up a person by TMDB id, for turning an autocomplete value back into a
 * display name.
 *
 * @returns {Promise<{id: number, name: string}|null>} null on failure
 */
export async function getPersonById(personId) {
  try {
    const response = await tmdbApi.get(`/person/${personId}`, {
      params: { language: 'en-US' },
    });
    return response.data || null;
  } catch (error) {
    console.error('TMDB person lookup error:', error.message);
    return null;
  }
}

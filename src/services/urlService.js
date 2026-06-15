import { config } from '../config.js';

/**
 * Generate IMDb URL
 */
export function getIMDbUrl(imdbId) {
  if (!imdbId) return null;
  return `${config.serviceUrls.imdb}/${imdbId}`;
}

/**
 * Generate Letterboxd URL (uses IMDb ID)
 */
export function getLetterboxdUrl(imdbId) {
  if (!imdbId) return null;
  // Letterboxd uses IMDb IDs in their URLs
  return `${config.serviceUrls.letterboxd}/${imdbId}`;
}

/**
 * Generate Trakt movie URL
 */
export function getTraktMovieUrl(slug) {
  if (!slug) return null;
  return `${config.serviceUrls.trakt.movie}/${slug}`;
}

/**
 * Generate Trakt TV show URL
 */
export function getTraktShowUrl(slug) {
  if (!slug) return null;
  return `${config.serviceUrls.trakt.show}/${slug}`;
}

/**
 * Generate Trakt episode URL
 */
export function getTraktEpisodeUrl(slug, season, episode) {
  if (!slug || season === undefined || episode === undefined) return null;
  return `${config.serviceUrls.trakt.show}/${slug}/seasons/${season}/episodes/${episode}`;
}

/**
 * Generate IMDb episode URL
 * If episodeImdbId is provided, link to specific episode page
 * Otherwise, link to show's episode list for that season/episode
 */
export function getIMDbEpisodeUrl(showImdbId, season, episode, episodeImdbId = null) {
  if (episodeImdbId) {
    return `${config.serviceUrls.imdb}/${episodeImdbId}`;
  }
  if (!showImdbId || season === undefined || episode === undefined) return null;
  return `${config.serviceUrls.imdb}/${showImdbId}/episodes?season=${season}&episode=${episode}`;
}

/**
 * Generate Rotten Tomatoes URL
 * Note: RT URLs are tricky to construct; may need scraping or manual lookup
 * This creates a best-guess URL that may need refinement
 */
export function getRottenTomatoesUrl(title, year, type = 'movie') {
  if (!title) return null;
  
  // Clean and format title for URL
  const cleanTitle = title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/-+/g, '_'); // Replace hyphens with underscores
  
  if (type === 'tv') {
    return `${config.serviceUrls.rottenTomatoes}/tv/${cleanTitle}`;
  }
  
  // For movies, RT sometimes includes year
  const urlWithYear = year ? `${cleanTitle}_${year}` : cleanTitle;
  return `${config.serviceUrls.rottenTomatoes}/m/${urlWithYear}`;
}

/**
 * Generate JustWatch URL
 * Note: JustWatch URLs vary by country; defaulting to US
 */
export function getJustWatchUrl(title, type = 'movie') {
  if (!title) return null;
  
  // Clean and format title for URL
  const cleanTitle = title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
  
  const mediaType = type === 'tv' ? 'tv-show' : 'movie';
  return `${config.serviceUrls.justWatch}/us/${mediaType}/${cleanTitle}`;
}

/**
 * Extract Trakt slug from Trakt data
 */
export function getTraktSlug(traktData) {
  if (!traktData) return null;
  
  if (traktData.movie && traktData.movie.ids) {
    return traktData.movie.ids.slug;
  }
  
  if (traktData.show && traktData.show.ids) {
    return traktData.show.ids.slug;
  }
  
  return null;
}

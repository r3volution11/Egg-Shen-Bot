import { getMovieDetails, getTVShowDetails } from '../services/tmdbService.js';
import { getOMDBData } from '../services/omdbService.js';
import { getMovieRating, getShowRating } from '../services/traktService.js';
import {
  getIMDbUrl,
  getLetterboxdUrl,
  getTraktMovieUrl,
  getTraktShowUrl,
  getRottenTomatoesUrl,
  getJustWatchUrl,
} from '../services/urlService.js';
import { createDetailedEmbed } from '../utils/embedBuilder.js';
import { getEnabledServices, getEmojis } from '../utils/guildConfig.js';

/**
 * Handle select menu interactions for choosing search results
 */
export async function handleSelectInteraction(interaction) {
  if (interaction.customId !== 'select_result' && interaction.customId !== 'select_episode_show') return;
  
  await interaction.deferUpdate();
  
  try {
    const value = interaction.values[0];
    const guildId = interaction.guildId;
    
    // Fetch guild configuration for service toggles and emojis
    const [enabledServices, guildEmojis] = await Promise.all([
      getEnabledServices(guildId),
      getEmojis(guildId),
    ]);
    
    // Handle episode selection
    if (value.startsWith('episode_')) {
      const parts = value.split('_');
      const showId = parts[1];
      const episodeName = parts.slice(2).join('_');
      
      console.log(`Searching for episode "${episodeName}" in show ID ${showId}...`);
      
      // Import the modules we need
      const { searchEpisodeByName, getTVShowDetails } = await import('../services/tmdbService.js');
      const { getOMDBData } = await import('../services/omdbService.js');
      const { getEpisodeRating } = await import('../services/traktService.js');
      const {
        getIMDbEpisodeUrl,
        getTraktEpisodeUrl,
        getJustWatchUrl,
      } = await import('../services/urlService.js');
      const { createEpisodeEmbed } = await import('../utils/embedBuilder.js');
      
      // Search for the episode in the selected show
      const episode = await searchEpisodeByName(showId, episodeName);
      
      if (!episode) {
        const showDetails = await getTVShowDetails(showId);
        await interaction.editReply({
          content: `Couldn't find episode "${episodeName}" in **${showDetails.name}**. The episode might not be in TMDB's database, or try a different spelling.`,
          embeds: [],
          components: [],
        });
        return;
      }
      
      console.log(`Found episode: S${episode.season_number}E${episode.episode_number} - ${episode.name}`);
      
      // Fetch episode-specific data
      const showImdbId = episode.show.external_ids?.imdb_id;
      const episodeImdbId = episode.external_ids?.imdb_id;
      
      // Fetch episode-specific ratings
      const [omdb, trakt] = await Promise.all([
        episodeImdbId ? getOMDBData(episodeImdbId) : null, // Use episode IMDb ID for episode-specific rating
        showImdbId ? getEpisodeRating(showImdbId, episode.season_number, episode.episode_number) : null,
      ]);
      
      // Build episode-specific URLs
      const urls = {
        imdb: getIMDbEpisodeUrl(showImdbId, episode.season_number, episode.episode_number, episodeImdbId),
        letterboxd: null, // Letterboxd is movies only
        trakt: getTraktEpisodeUrl(showImdbId, episode.season_number, episode.episode_number),
        rottenTomatoes: null, // RT doesn't have episode-specific ratings
        justWatch: getJustWatchUrl(episode.show.name, 'tv'),
      };
      
      const response = await createEpisodeEmbed({ episode, omdb, trakt, urls }, enabledServices, guildEmojis);
      await interaction.editReply(response);
      return;
    }
    
    // Handle movie/TV selection
    const [type, id] = value.split('_');
    
    // Fetch all data in parallel
    let tmdb, omdb, trakt;
    
    if (type === 'movie') {
      tmdb = await getMovieDetails(id);
      
      const imdbId = tmdb.external_ids?.imdb_id;
      
      [omdb, trakt] = await Promise.all([
        imdbId ? getOMDBData(imdbId) : null,
        imdbId ? getMovieRating(imdbId) : null,
      ]);
      
      // Build URLs
      const urls = {
        imdb: getIMDbUrl(imdbId),
        letterboxd: getLetterboxdUrl(imdbId),
        trakt: getTraktMovieUrl(tmdb.external_ids?.imdb_id), // Trakt accepts IMDb IDs
        rottenTomatoes: getRottenTomatoesUrl(tmdb.title, tmdb.release_date?.split('-')[0], 'movie'),
        justWatch: getJustWatchUrl(tmdb.title, 'movie'),
      };
      
      const response = await createDetailedEmbed({ tmdb, omdb, trakt, urls }, 'movie', enabledServices, guildEmojis);
      await interaction.editReply(response);
      
    } else if (type === 'tv') {
      tmdb = await getTVShowDetails(id);
      
      const imdbId = tmdb.external_ids?.imdb_id;
      
      [omdb, trakt] = await Promise.all([
        imdbId ? getOMDBData(imdbId) : null,
        imdbId ? getShowRating(imdbId) : null,
      ]);
      
      // Build URLs
      const urls = {
        imdb: getIMDbUrl(imdbId),
        letterboxd: null, // Letterboxd is movies only
        trakt: getTraktShowUrl(tmdb.external_ids?.imdb_id), // Trakt accepts IMDb IDs
        rottenTomatoes: getRottenTomatoesUrl(tmdb.name, tmdb.first_air_date?.split('-')[0], 'tv'),
        justWatch: getJustWatchUrl(tmdb.name, 'tv'),
      };
      
      const response = await createDetailedEmbed({ tmdb, omdb, trakt, urls }, 'tv', enabledServices, guildEmojis);
      await interaction.editReply(response);
    }
    
  } catch (error) {
    console.error('Select interaction error:', error);
    await interaction.editReply({
      content: 'An error occurred while fetching details. Please try again.',
      embeds: [],
      components: [],
    });
  }
}

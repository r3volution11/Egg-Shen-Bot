import { SlashCommandBuilder } from 'discord.js';
import { searchMovies } from '../services/tmdbService.js';
import { createSearchResults } from '../utils/embedBuilder.js';
import { canUseCommand, loadGuildConfig } from '../utils/guildConfig.js';

export const data = new SlashCommandBuilder()
  .setName('movie')
  .setDescription('Search for a movie and get ratings from multiple services')
  .addStringOption(option =>
    option
      .setName('query')
      .setDescription('Movie title to search for')
      .setRequired(true)
  );

export async function execute(interaction) {
  // Check if user has permission to use this command
  const hasPermission = await canUseCommand(interaction.guildId, interaction.member, 'movie');
  if (!hasPermission) {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ The `/movie` command is currently disabled for regular users. Contact a server administrator for more information.',
        ephemeral: true,
      });
    }
    return;
  }

  const query = interaction.options.getString('query');
  
  // Safely defer reply if not already acknowledged
  if (!interaction.replied && !interaction.deferred) {
    await interaction.deferReply({ ephemeral: true });
  }
  
  try {
    const results = await searchMovies(query);
    
    if (!results || results.length === 0) {
      await interaction.editReply({
        content: `No movies found matching "${query}". Try a different search term.`,
      });
      return;
    }
    
    // If only one result, display it directly
    if (results.length === 1) {
      const { getMovieDetails } = await import('../services/tmdbService.js');
      const { getOMDBData } = await import('../services/omdbService.js');
      const { getMovieRating } = await import('../services/traktService.js');
      const { getLetterboxdRating } = await import('../services/letterboxdService.js');
      const {
        getIMDbUrl,
        getLetterboxdUrl,
        getTraktMovieUrl,
        getRottenTomatoesUrl,
        getJustWatchUrl,
      } = await import('../services/urlService.js');
      const { createDetailedEmbed } = await import('../utils/embedBuilder.js');
      const { getEnabledServices, getEmojis, getStatsConfig } = await import('../utils/guildConfig.js');
      const { trackSearch } = await import('../utils/statsTracker.js');
      
      const movieId = results[0].id;
      const tmdb = await getMovieDetails(movieId);
      const imdbId = tmdb.external_ids?.imdb_id;
      
      const [omdb, trakt, letterboxd, enabledServices, guildEmojis, statsConfig] = await Promise.all([
        imdbId ? getOMDBData(imdbId) : null,
        imdbId ? getMovieRating(imdbId) : null,
        imdbId ? getLetterboxdRating(imdbId) : null,
        getEnabledServices(interaction.guildId),
        getEmojis(interaction.guildId),
        getStatsConfig(interaction.guildId),
      ]);
      
      const urls = {
        imdb: getIMDbUrl(imdbId),
        letterboxd: getLetterboxdUrl(imdbId),
        trakt: getTraktMovieUrl(tmdb.external_ids?.imdb_id),
        rottenTomatoes: getRottenTomatoesUrl(tmdb.title, tmdb.release_date?.split('-')[0], 'movie'),
        justWatch: getJustWatchUrl(tmdb.title, 'movie'),
      };
      
      if (statsConfig.enabled && statsConfig.trackMovies) {
        const year = tmdb.release_date?.split('-')[0];
        await trackSearch(
          interaction.guildId,
          interaction.user.id,
          interaction.user.username,
          'movie',
          tmdb.title,
          year
        ).catch(err => console.error('Stats tracking error:', err));
      }
      
      const response = await createDetailedEmbed({ tmdb, omdb, trakt, letterboxd, urls }, 'movie', enabledServices, guildEmojis);
      await interaction.editReply(response);
      return;
    }
    
    // Load guild config to get maxSearchResults
    const guildConfig = await loadGuildConfig(interaction.guildId);
    const maxResults = guildConfig.maxSearchResults || 20;
    const limitedResults = results.slice(0, maxResults);

    // Create the selection interface (ephemeral for privacy)
    const response = await createSearchResults(limitedResults, 'movie', query);
    await interaction.editReply(response);
    
  } catch (error) {
    console.error('Movie command error:', error);
    await interaction.editReply({
      content: 'An error occurred while searching for movies. Please try again later.',
    });
  }
}

import { SlashCommandBuilder } from 'discord.js';
import { searchMovies, getMovieAlternativeTitles } from '../services/tmdbService.js';
import { hybridSearch } from '../services/aiService.js';
import { createSearchResults } from '../utils/embedBuilder.js';
import { canUseCommand, loadGuildConfig } from '../utils/guildConfig.js';
import { deliverResult, encodePrivateFlag } from '../utils/interactionResponse.js';

export const data = new SlashCommandBuilder()
  .setName('movie')
  .setDescription('Search for a movie and get ratings from multiple services')
  .addStringOption(option =>
    option
      .setName('query')
      .setDescription('Movie title to search for')
      .setRequired(true)
  )
  .addBooleanOption(option =>
    option
      .setName('private')
      .setDescription('Only show the result to you instead of the whole channel (default: false)')
      .setRequired(false)
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
  const isPrivate = interaction.options.getBoolean('private') || false;

  // Always defer ephemeral — a multi-result picker shouldn't clutter the
  // channel while narrowing down results. The final answer is posted
  // publicly (via deliverResult) unless the user asked to keep it private.
  if (!interaction.replied && !interaction.deferred) {
    await interaction.deferReply({ ephemeral: true });
  }

  try {
    // Use hybrid search (keyword + semantic) if OpenAI available, otherwise keyword only
    const results = await hybridSearch(query, searchMovies, 'movie', getMovieAlternativeTitles);
    
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
      const { loadGuildConfig, getEnabledServices, getEmojis, getStatsConfig } = await import('../utils/guildConfig.js');
      const { trackSearch } = await import('../utils/statsTracker.js');
      const { getUnifiedMovieWatchProviders } = await import('../services/tmdbService.js');
      
      const { getMovieAlternativeTitlesDetailed, pickKnownAsTitle } = await import('../services/tmdbService.js');

      const movieId = results[0].id;
      const tmdb = await getMovieDetails(movieId);
      const imdbId = tmdb.external_ids?.imdb_id;

      const [omdb, trakt, letterboxd, enabledServices, guildEmojis, statsConfig, guildConfig, alternativeTitles] = await Promise.all([
        imdbId ? getOMDBData(imdbId) : null,
        imdbId ? getMovieRating(imdbId) : null,
        imdbId ? getLetterboxdRating(imdbId) : null,
        getEnabledServices(interaction.guildId),
        getEmojis(interaction.guildId),
        getStatsConfig(interaction.guildId),
        loadGuildConfig(interaction.guildId),
        getMovieAlternativeTitlesDetailed(movieId),
      ]);
      const knownAs = pickKnownAsTitle(tmdb.title, alternativeTitles);
      
      // Get unified watch providers (TMDB + Watchmode)
      const watchProviders = await getUnifiedMovieWatchProviders(movieId, imdbId, guildConfig.region || 'US');
      
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
      
      const response = await createDetailedEmbed({ tmdb, omdb, trakt, letterboxd, urls, knownAs }, 'movie', enabledServices, guildEmojis, watchProviders);
      await deliverResult(interaction, response, isPrivate);
      return;
    }

    // Load guild config to get maxSearchResults
    const guildConfig = await loadGuildConfig(interaction.guildId);
    const maxResults = guildConfig.maxSearchResults || 20;
    const limitedResults = results.slice(0, maxResults);

    // The picker itself always stays ephemeral (no channel clutter while
    // narrowing down results) — the private flag travels with the
    // selection so the eventual result can still be posted publicly.
    const response = await createSearchResults(limitedResults, 'movie', query, isPrivate);
    await interaction.editReply(response);
    
  } catch (error) {
    console.error('Movie command error:', error);
    await interaction.editReply({
      content: 'An error occurred while searching for movies. Please try again later.',
    });
  }
}

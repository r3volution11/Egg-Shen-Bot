import { SlashCommandBuilder } from 'discord.js';
import { searchTVShows } from '../services/tmdbService.js';
import { createSearchResults } from '../utils/embedBuilder.js';
import { canUseCommand, loadGuildConfig } from '../utils/guildConfig.js';

export const data = new SlashCommandBuilder()
  .setName('tv')
  .setDescription('Search for a TV show and get ratings from multiple services')
  .addStringOption(option =>
    option
      .setName('query')
      .setDescription('TV show title to search for (optionally include episode name)')
      .setRequired(true)
  );

export async function execute(interaction) {
  // Check if user has permission to use this command
  const hasPermission = await canUseCommand(interaction.guildId, interaction.member, 'tv');
  if (!hasPermission) {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ The `/tv` command is currently disabled for regular users. Contact a server administrator for more information.',
        ephemeral: true,
      });
    }
    return;
  }

  const query = interaction.options.getString('query');
  
  if (!interaction.replied && !interaction.deferred) {
    await interaction.deferReply({ ephemeral: true });
  }
  
  try {
    // Note: Currently searches for TV series only
    // Future enhancement: Parse query to detect episode names/numbers
    // Example: "The Outer Limits Sandkings" could search for specific episode
    // For now, returns series results with series poster (per requirements)
    const results = await searchTVShows(query);
    
    if (!results || results.length === 0) {
      await interaction.editReply({
        content: `No TV shows found matching "${query}". Try a different search term.`,
      });
      return;
    }
    
    // If only one result, display it directly
    if (results.length === 1) {
      const { getTVShowDetails } = await import('../services/tmdbService.js');
      const { getOMDBData } = await import('../services/omdbService.js');
      const { getShowRating } = await import('../services/traktService.js');
      const {
        getIMDbUrl,
        getTraktShowUrl,
        getRottenTomatoesUrl,
        getJustWatchUrl,
      } = await import('../services/urlService.js');
      const { createDetailedEmbed } = await import('../utils/embedBuilder.js');
      const { getEnabledServices, getEmojis, getStatsConfig } = await import('../utils/guildConfig.js');
      const { trackSearch } = await import('../utils/statsTracker.js');
      
      const showId = results[0].id;
      const tmdb = await getTVShowDetails(showId);
      const imdbId = tmdb.external_ids?.imdb_id;
      
      const [omdb, trakt, enabledServices, guildEmojis, statsConfig] = await Promise.all([
        imdbId ? getOMDBData(imdbId) : null,
        imdbId ? getShowRating(imdbId) : null,
        getEnabledServices(interaction.guildId),
        getEmojis(interaction.guildId),
        getStatsConfig(interaction.guildId),
      ]);
      
      const urls = {
        imdb: getIMDbUrl(imdbId),
        letterboxd: null,
        trakt: getTraktShowUrl(tmdb.external_ids?.imdb_id),
        rottenTomatoes: getRottenTomatoesUrl(tmdb.name, tmdb.first_air_date?.split('-')[0], 'tv'),
        justWatch: getJustWatchUrl(tmdb.name, 'tv'),
      };
      
      if (statsConfig.enabled && statsConfig.trackShows) {
        const year = tmdb.first_air_date?.split('-')[0];
        await trackSearch(
          interaction.guildId,
          interaction.user.id,
          interaction.user.username,
          'tv',
          tmdb.name,
          year
        ).catch(err => console.error('Stats tracking error:', err));
      }
      
      const response = await createDetailedEmbed({ tmdb, omdb, trakt, letterboxd: null, urls }, 'tv', enabledServices, guildEmojis);
      await interaction.editReply(response);
      return;
    }
    
    // Load guild config to get maxSearchResults
    const guildConfig = await loadGuildConfig(interaction.guildId);
    const maxResults = guildConfig.maxSearchResults || 20;
    const limitedResults = results.slice(0, maxResults);

    // Create the selection interface (ephemeral for privacy)
    const response = await createSearchResults(limitedResults, 'tv', query);
    await interaction.editReply(response);
    
  } catch (error) {
    console.error('TV command error:', error);
    await interaction.editReply({
      content: 'An error occurred while searching for TV shows. Please try again later.',
    });
  }
}

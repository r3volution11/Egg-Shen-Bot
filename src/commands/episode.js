import { SlashCommandBuilder } from 'discord.js';
import { searchTVShows } from '../services/tmdbService.js';
import { createEpisodeSearchResults } from '../utils/embedBuilder.js';
import { canUseCommand, loadGuildConfig } from '../utils/guildConfig.js';
export const data = new SlashCommandBuilder()
  .setName('episode')
  .setDescription('Search for a TV show episode and get ratings from multiple services')
  .addStringOption(option =>
    option
      .setName('show')
      .setDescription('TV show name (e.g., "The Outer Limits")')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('episode')
      .setDescription('Episode name (e.g., "Sandkings")')
      .setRequired(true)
  );

export async function execute(interaction) {
  // Check if user has permission to use this command
  const hasPermission = await canUseCommand(interaction.guildId, interaction.member, 'episode');
  if (!hasPermission) {
    await interaction.reply({
      content: '❌ The `/episode` command is currently disabled for regular users. Contact a server administrator for more information.',
      ephemeral: true,
    });
    return;
  }

  const showQuery = interaction.options.getString('show');
  const episodeQuery = interaction.options.getString('episode');
  
  await interaction.deferReply({ ephemeral: true });
  
  try {
    // First, search for the TV show
    const showResults = await searchTVShows(showQuery);
    
    if (!showResults || showResults.length === 0) {
      await interaction.editReply({
        content: `No TV shows found matching "${showQuery}". Try a different search term.`,
      });
      return;
    }
    
    // If only one show result, search for the episode directly
    if (showResults.length === 1) {
      const { searchEpisodeByName, getTVShowDetails } = await import('../services/tmdbService.js');
      const { getOMDBData } = await import('../services/omdbService.js');
      const { getEpisodeRating } = await import('../services/traktService.js');
      const {
        getIMDbEpisodeUrl,
        getTraktEpisodeUrl,
        getJustWatchUrl,
      } = await import('../services/urlService.js');
      const { createEpisodeEmbed } = await import('../utils/embedBuilder.js');
      const { getEnabledServices, getEmojis, getStatsConfig } = await import('../utils/guildConfig.js');
      const { trackSearch } = await import('../utils/statsTracker.js');
      
      const showId = showResults[0].id;
      const episode = await searchEpisodeByName(showId, episodeQuery);
      
      if (!episode) {
        const showDetails = await getTVShowDetails(showId);
        await interaction.editReply({
          content: `Couldn't find episode "${episodeQuery}" in **${showDetails.name}**. The episode might not be in TMDB's database, or try a different spelling.`,
        });
        return;
      }
      
      const showImdbId = episode.show.external_ids?.imdb_id;
      const episodeImdbId = episode.external_ids?.imdb_id;
      
      const [omdb, trakt, enabledServices, guildEmojis, statsConfig] = await Promise.all([
        episodeImdbId ? getOMDBData(episodeImdbId) : null,
        showImdbId ? getEpisodeRating(showImdbId, episode.season_number, episode.episode_number) : null,
        getEnabledServices(interaction.guildId),
        getEmojis(interaction.guildId),
        getStatsConfig(interaction.guildId),
      ]);
      
      const urls = {
        imdb: getIMDbEpisodeUrl(showImdbId, episode.season_number, episode.episode_number, episodeImdbId),
        letterboxd: null,
        trakt: getTraktEpisodeUrl(showImdbId, episode.season_number, episode.episode_number),
        rottenTomatoes: null,
        justWatch: getJustWatchUrl(episode.show.name, 'tv'),
      };
      
      if (statsConfig.enabled && statsConfig.trackEpisodes) {
        const episodeTitle = `${episode.show.name} - ${episode.name}`;
        await trackSearch(
          interaction.guildId,
          interaction.user.id,
          interaction.user.username,
          'episode',
          episodeTitle
        ).catch(err => console.error('Stats tracking error:', err));
      }
      
      const response = await createEpisodeEmbed({ episode, omdb, trakt, urls }, enabledServices, guildEmojis);
      await interaction.editReply(response);
      return;
    }
    
    // Load guild config to get maxSearchResults
    const guildConfig = await loadGuildConfig(interaction.guildId);
    const maxResults = guildConfig.maxSearchResults || 8;
    const limitedResults = showResults.slice(0, maxResults);

    // Create the selection interface with episode name stored (ephemeral for privacy)
    const response = await createEpisodeSearchResults(limitedResults, showQuery, episodeQuery);
    await interaction.editReply(response);
    
  } catch (error) {
    console.error('Episode command error:', error);
    await interaction.editReply({
      content: 'An error occurred while searching for TV shows. Please try again later.',
    });
  }
}


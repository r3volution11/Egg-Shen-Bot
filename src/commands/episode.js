import { SlashCommandBuilder } from 'discord.js';
import { searchTVShows } from '../services/tmdbService.js';
import { createEpisodeSearchResults } from '../utils/embedBuilder.js';
import { canUseCommand, loadGuildConfig } from '../utils/guildConfig.js';
import { deliverResult } from '../utils/interactionResponse.js';

/**
 * Parse season/episode notation (s3e11, 3x11, etc.)
 * @param {string} query - User input
 * @returns {Object|null} - { season: number, episode: number } or null if not a valid format
 */
function parseSeasonEpisode(query) {
  // Remove all spaces and convert to lowercase
  const normalized = query.trim().toLowerCase().replace(/\s/g, '');
  
  // Try various formats:
  // s3e11, s03e11, S3E11
  let match = normalized.match(/^s(\d+)e(\d+)$/);
  if (match) return { season: parseInt(match[1]), episode: parseInt(match[2]) };
  
  // 3x11, 03x11
  match = normalized.match(/^(\d+)x(\d+)$/);
  if (match) return { season: parseInt(match[1]), episode: parseInt(match[2]) };
  
  // 3-11
  match = normalized.match(/^(\d+)-(\d+)$/);
  if (match) return { season: parseInt(match[1]), episode: parseInt(match[2]) };
  
  return null;
}

export const data = new SlashCommandBuilder()
  .setName('episode')
  .setDescription('Search for a TV show episode by title or number (s3e11)')
  .addStringOption(option =>
    option
      .setName('show')
      .setDescription('TV show name (e.g., "The Outer Limits")')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('episode')
      .setDescription('Episode title (e.g., "Sandkings") or number (e.g., "s3e11", "3x11")')
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
  const isPrivate = interaction.options.getBoolean('private') || false;

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
      const { searchEpisodeByName, getEpisodeDetails, getTVShowDetails } = await import('../services/tmdbService.js');
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
      
      // Check if episode query is in season/episode notation (s3e11)
      const parsedSeasonEpisode = parseSeasonEpisode(episodeQuery);
      let episode;
      
      if (parsedSeasonEpisode) {
        // Search by season/episode number
        console.log(`Searching for S${parsedSeasonEpisode.season}E${parsedSeasonEpisode.episode}...`);
        try {
          const episodeDetails = await getEpisodeDetails(showId, parsedSeasonEpisode.season, parsedSeasonEpisode.episode);
          const showDetails = await getTVShowDetails(showId);
          
          // Match the structure from searchEpisodeByName
          episode = {
            ...episodeDetails,
            show: showDetails,
            season_number: parsedSeasonEpisode.season,
          };
        } catch (error) {
          console.error('Episode lookup error:', error.message);
          episode = null;
        }
      } else {
        // Search by episode title (original behavior)
        episode = await searchEpisodeByName(showId, episodeQuery);
        
        // If not found and query is just a number, try Season 1, Episode [number]
        if (!episode && /^\d+$/.test(episodeQuery.trim())) {
          const episodeNumber = parseInt(episodeQuery);
          console.log(`No title match found for "${episodeQuery}", trying S1E${episodeNumber}...`);
          try {
            const episodeDetails = await getEpisodeDetails(showId, 1, episodeNumber);
            const showDetails = await getTVShowDetails(showId);
            episode = {
              ...episodeDetails,
              show: showDetails,
              season_number: 1,
            };
          } catch (error) {
            console.error(`S1E${episodeNumber} lookup error:`, error.message);
          }
        }
      }
      
      if (!episode) {
        const showDetails = await getTVShowDetails(showId);
        const searchType = parsedSeasonEpisode 
          ? `S${parsedSeasonEpisode.season}E${parsedSeasonEpisode.episode}`
          : `"${episodeQuery}"`;
        await interaction.editReply({
          content: `Couldn't find episode ${searchType} in **${showDetails.name}**. The episode might not be in TMDB's database, or try a different search term.`,
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
      await deliverResult(interaction, response, isPrivate);
      return;
    }

    // Load guild config to get maxSearchResults
    const guildConfig = await loadGuildConfig(interaction.guildId);
    const maxResults = guildConfig.maxSearchResults || 20;
    const limitedResults = showResults.slice(0, maxResults);

    // The picker itself always stays ephemeral — the private flag travels
    // with the selection so the eventual episode result can still be public.
    const response = await createEpisodeSearchResults(limitedResults, showQuery, episodeQuery, isPrivate);
    await interaction.editReply(response);
    
  } catch (error) {
    console.error('Episode command error:', error);
    await interaction.editReply({
      content: 'An error occurred while searching for TV shows. Please try again later.',
    });
  }
}


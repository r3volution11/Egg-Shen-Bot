import { getMovieDetails, getTVShowDetails, getMovieWatchProviders, getTVWatchProviders } from '../services/tmdbService.js';
import { getOMDBData } from '../services/omdbService.js';
import { getMovieRating, getShowRating } from '../services/traktService.js';
import { getLetterboxdRating } from '../services/letterboxdService.js';
import {
  getIMDbUrl,
  getLetterboxdUrl,
  getTraktMovieUrl,
  getTraktShowUrl,
  getRottenTomatoesUrl,
  getJustWatchUrl,
} from '../services/urlService.js';
import { createDetailedEmbed } from '../utils/embedBuilder.js';
import { getEnabledServices, getEmojis, getStatsConfig, loadGuildConfig } from '../utils/guildConfig.js';
import { trackSearch } from '../utils/statsTracker.js';

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

/**
 * Handle select menu interactions for choosing search results
 */
export async function handleSelectInteraction(interaction) {
  if (interaction.customId !== 'select_result' && 
      interaction.customId !== 'select_episode_show' && 
      interaction.customId !== 'select_watched' &&
      interaction.customId !== 'select_random_episode' &&
      interaction.customId !== 'select_similar') return;
  
  // Defer the update to acknowledge the interaction
  await interaction.deferUpdate();
  
  // Handle random episode selection
  if (interaction.customId === 'select_random_episode') {
    const value = interaction.values[0];
    const [, , showId] = value.split('_');
    
    const { handleRandomEpisodeSelection } = await import('../commands/random.js');
    await handleRandomEpisodeSelection(showId, interaction);
    return;
  }
  
  // Handle similar selection
  if (interaction.customId === 'select_similar') {
    const value = interaction.values[0];
    const [, type, tmdbId] = value.split('_');
    
    const { handleSimilarSelection } = await import('../commands/similar.js');
    await handleSimilarSelection(type, tmdbId, interaction);
    return;
  }
  
  // Handle watched selection
  if (interaction.customId === 'select_watched') {
    const value = interaction.values[0];
    const [, type, tmdbId, encodedData] = value.split('_');
    
    try {
      // Decode the stored data
      const dataStr = Buffer.from(encodedData, 'base64').toString('utf-8');
      const { rating, notes, userId, username } = JSON.parse(dataStr);
      
      // Only allow the person who initiated to select
      if (interaction.user.id !== userId) {
        await interaction.followUp({
          content: '❌ Only the person who ran the command can make this selection.',
          ephemeral: true,
        });
        return;
      }
      
      const { saveWatchHistory } = await import('../utils/watchHistoryManager.js');
      const { getMovieDetails, getTVShowDetails } = await import('../services/tmdbService.js');
      const { EmbedBuilder } = await import('discord.js');
      
      // Get full details
      const details = type === 'movie' 
        ? await getMovieDetails(tmdbId)
        : await getTVShowDetails(tmdbId);
      
      const fullTitle = details.title || details.name;
      const year = details.release_date || details.first_air_date;
      const yearStr = year ? year.split('-')[0] : '';
      
      // Save to history
      await saveWatchHistory(interaction.guildId, {
        tmdbId: tmdbId,
        type: type,
        title: fullTitle,
        year: yearStr,
        rating: rating ? parseFloat(rating) : null,
        notes: notes || null,
        watchedBy: username,
        watchedById: userId,
        watchedAt: Date.now(),
      });
      
      // Track watched log in statistics
      await trackSearch(
        interaction.guildId,
        userId,
        username,
        'watched',
        fullTitle,
        yearStr
      );
      
      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('✅ Added to Watch History')
        .setDescription(`**${fullTitle}** (${yearStr})`)
        .addFields({
          name: 'Type',
          value: type === 'movie' ? 'Movie' : 'TV Show',
          inline: true,
        });
      
      if (rating) {
        embed.addFields({
          name: 'Your Rating',
          value: `${rating}/10`,
          inline: true,
        });
      }
      
      if (notes) {
        embed.addFields({
          name: 'Notes',
          value: notes,
          inline: false,
        });
      }
      
      embed.setFooter({ text: `Added by ${username}` });
      embed.setTimestamp();
      
      await interaction.message.delete().catch(() => {});
      await interaction.channel.send({ embeds: [embed] });
      
    } catch (error) {
      console.error('Watched selection error:', error);
      await interaction.followUp({
        content: 'An error occurred while adding to watch history.',
        ephemeral: true,
      });
    }
    return;
  }
  
  try {
    const value = interaction.values[0];
    const guildId = interaction.guildId;
    
    // Fetch guild configuration for service toggles, emojis, stats, and region
    const [enabledServices, guildEmojis, statsConfig, guildConfig] = await Promise.all([
      getEnabledServices(guildId),
      getEmojis(guildId),
      getStatsConfig(guildId),
      loadGuildConfig(guildId),
    ]);
    
    const region = guildConfig.region || 'US';
    
    // Handle episode selection
    if (value.startsWith('episode_')) {
      const parts = value.split('_');
      const showId = parts[1];
      const episodeName = parts.slice(2).join('_');
      
      console.log(`Searching for episode "${episodeName}" in show ID ${showId}...`);
      
      // Import the modules we need
      const { searchEpisodeByName, getEpisodeDetails, getTVShowDetails } = await import('../services/tmdbService.js');
      const { getOMDBData } = await import('../services/omdbService.js');
      const { getEpisodeRating } = await import('../services/traktService.js');
      const {
        getIMDbEpisodeUrl,
        getTraktEpisodeUrl,
        getJustWatchUrl,
      } = await import('../services/urlService.js');
      const { createEpisodeEmbed } = await import('../utils/embedBuilder.js');
      
      // Check if episode query is in season/episode notation (s3e11)
      const parsedSeasonEpisode = parseSeasonEpisode(episodeName);
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
        episode = await searchEpisodeByName(showId, episodeName);
      }
      
      if (!episode) {
        const showDetails = await getTVShowDetails(showId);
        const searchType = parsedSeasonEpisode 
          ? `S${parsedSeasonEpisode.season}E${parsedSeasonEpisode.episode}`
          : `"${episodeName}"`;
        await interaction.message.delete().catch(() => {});
        await interaction.channel.send({
          content: `Couldn't find episode ${searchType} in **${showDetails.name}**. The episode might not be in TMDB's database, or try a different search term.`,
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
      
      // Track episode search
      if (statsConfig.enabled && statsConfig.trackEpisodes) {
        const episodeTitle = `${episode.show.name} - ${episode.name}`;
        await trackSearch(
          guildId,
          interaction.user.id,
          interaction.user.username,
          'episode',
          episodeTitle
        ).catch(err => console.error('Stats tracking error:', err));
      }
      
      const response = await createEpisodeEmbed({ episode, omdb, trakt, urls }, enabledServices, guildEmojis);
      // Delete ephemeral menu and send public result
      await interaction.message.delete().catch(() => {});
      await interaction.channel.send(response);
      return;
    }
    
    // Handle movie/TV selection
    const [type, id] = value.split('_');
    
    // Fetch all data in parallel
    let tmdb, omdb, trakt, letterboxd;
    
    if (type === 'movie') {
      tmdb = await getMovieDetails(id);
      
      const imdbId = tmdb.external_ids?.imdb_id;
      
      [omdb, trakt, letterboxd] = await Promise.all([
        imdbId ? getOMDBData(imdbId) : null,
        imdbId ? getMovieRating(imdbId) : null,
        imdbId ? getLetterboxdRating(imdbId) : null,
      ]);
      
      // Fetch watch providers
      const watchProviders = await getMovieWatchProviders(id, region);
      
      // Build URLs
      const urls = {
        imdb: getIMDbUrl(imdbId),
        letterboxd: getLetterboxdUrl(imdbId),
        trakt: getTraktMovieUrl(tmdb.external_ids?.imdb_id), // Trakt accepts IMDb IDs
        rottenTomatoes: getRottenTomatoesUrl(tmdb.title, tmdb.release_date?.split('-')[0], 'movie'),
        justWatch: getJustWatchUrl(tmdb.title, 'movie'),
      };
      
      // Track movie search
      if (statsConfig.enabled && statsConfig.trackMovies) {
        const year = tmdb.release_date?.split('-')[0];
        await trackSearch(
          guildId,
          interaction.user.id,
          interaction.user.username,
          'movie',
          tmdb.title,
          year
        ).catch(err => console.error('Stats tracking error:', err));
      }
      
      const response = await createDetailedEmbed({ tmdb, omdb, trakt, letterboxd, urls }, 'movie', enabledServices, guildEmojis, watchProviders);
      // Delete ephemeral menu and send public result
      await interaction.message.delete().catch(() => {});
      await interaction.channel.send(response);
      
    } else if (type === 'tv') {
      tmdb = await getTVShowDetails(id);
      
      const imdbId = tmdb.external_ids?.imdb_id;
      
      [omdb, trakt] = await Promise.all([
        imdbId ? getOMDBData(imdbId) : null,
        imdbId ? getShowRating(imdbId) : null,
      ]);
      
      // Fetch watch providers
      const watchProviders = await getTVWatchProviders(id, region);
      
      // Build URLs
      const urls = {
        imdb: getIMDbUrl(imdbId),
        letterboxd: null, // Letterboxd is movies only
        trakt: getTraktShowUrl(tmdb.external_ids?.imdb_id), // Trakt accepts IMDb IDs
        rottenTomatoes: getRottenTomatoesUrl(tmdb.name, tmdb.first_air_date?.split('-')[0], 'tv'),
        justWatch: getJustWatchUrl(tmdb.name, 'tv'),
      };
      
      // Track TV show search
      if (statsConfig.enabled && statsConfig.trackShows) {
        const year = tmdb.first_air_date?.split('-')[0];
        await trackSearch(
          guildId,
          interaction.user.id,
          interaction.user.username,
          'tv',
          tmdb.name,
          year
        ).catch(err => console.error('Stats tracking error:', err));
      }
      
      const response = await createDetailedEmbed({ tmdb, omdb, trakt, urls }, 'tv', enabledServices, guildEmojis, watchProviders);
      // Delete ephemeral menu and send public result
      await interaction.message.delete().catch(() => {});
      await interaction.channel.send(response);
      
    } else if (type === 'game') {
      const { getGameDetails } = await import('../services/rawgService.js');
      const { createGameDetailedEmbed } = await import('../utils/embedBuilder.js');
      
      const game = await getGameDetails(id);
      
      // Track game search
      if (statsConfig.enabled && statsConfig.trackGames) {
        const year = game.released?.split('-')[0];
        await trackSearch(
          guildId,
          interaction.user.id,
          interaction.user.username,
          'game',
          game.name,
          year
        ).catch(err => console.error('Stats tracking error:', err));
      }
      
      const response = await createGameDetailedEmbed(game);
      // Delete ephemeral menu and send public result
      await interaction.message.delete().catch(() => {});
      await interaction.channel.send(response);
      
    } else if (type === 'boardgame') {
      const { getBoardGameDetails } = await import('../services/bggService.js');
      const { createBoardGameDetailedEmbed } = await import('../utils/embedBuilder.js');
      
      const boardGame = await getBoardGameDetails(id);
      
      // Track board game search
      if (statsConfig.enabled && statsConfig.trackBoardGames) {
        await trackSearch(
          guildId,
          interaction.user.id,
          interaction.user.username,
          'boardgame',
          boardGame.name,
          boardGame.yearPublished
        ).catch(err => console.error('Stats tracking error:', err));
      }
      
      const response = await createBoardGameDetailedEmbed(boardGame);
      // Delete ephemeral menu and send public result
      await interaction.message.delete().catch(() => {});
      await interaction.channel.send(response);
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

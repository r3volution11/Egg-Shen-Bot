import { SlashCommandBuilder, EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder } from 'discord.js';
import { searchTVShows, getSeasonDetails, getTVShowDetails } from '../services/tmdbService.js';
import { loadGuildConfig } from '../utils/guildConfig.js';

export const data = new SlashCommandBuilder()
  .setName('episode-list')
  .setDescription('Get a list of all episodes in a TV season with ratings')
  .addStringOption(option =>
    option
      .setName('series')
      .setDescription('The TV series name')
      .setRequired(true)
  )
  .addIntegerOption(option =>
    option
      .setName('season')
      .setDescription('The season number')
      .setRequired(true)
      .setMinValue(1)
  );

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const seriesQuery = interaction.options.getString('series');
  const seasonNumber = interaction.options.getInteger('season');

  try {
    // Search for the TV show
    const searchResults = await searchTVShows(seriesQuery);

    if (!searchResults || searchResults.length === 0) {
      await interaction.editReply({
        content: `No TV series found matching "${seriesQuery}". Try a different search term.`,
      });
      return;
    }

    // If multiple results, show selection menu
    if (searchResults.length > 1) {
      // Load guild config to get maxSearchResults
      const guildConfig = await loadGuildConfig(interaction.guildId);
      const maxResults = guildConfig.maxSearchResults || 20;
      const limitedResults = searchResults.slice(0, maxResults);
      
      // Create selection menu
      const options = limitedResults.map((result) => {
        const title = result.name;
        const year = result.first_air_date;
        const yearStr = year ? ` (${year.split('-')[0]})` : '';
        const overview = result.overview ? result.overview.substring(0, 97) + '...' : 'No description';
        
        return {
          label: `${title}${yearStr}`.substring(0, 100),
          description: overview.substring(0, 100),
          value: `episode-list_${result.id}_${seasonNumber}`,
        };
      });
      
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('select_episode_list_show')
        .setPlaceholder('Select the correct show')
        .addOptions(options);
      
      const row = new ActionRowBuilder().addComponents(selectMenu);
      
      const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle(`Select the show for season ${seasonNumber}`)
        .setDescription(`Found ${limitedResults.length} show${limitedResults.length > 1 ? 's' : ''} matching "${seriesQuery}". Select the correct one below.`)
        .setFooter({ text: 'Select a show from the menu below' });
      
      await interaction.editReply({
        embeds: [embed],
        components: [row],
      });
      return;
    }

    // Only one result - proceed directly
    const show = searchResults[0];
    const showId = show.id;

    // Get show details to verify season exists
    const showDetails = await getTVShowDetails(showId);
    
    if (seasonNumber > showDetails.number_of_seasons) {
      await interaction.editReply({
        content: `**${showDetails.name}** only has ${showDetails.number_of_seasons} season${showDetails.number_of_seasons === 1 ? '' : 's'}. Season ${seasonNumber} doesn't exist.`,
      });
      return;
    }

    // Get season details with all episodes
    const seasonData = await getSeasonDetails(showId, seasonNumber);

    if (!seasonData || !seasonData.episodes || seasonData.episodes.length === 0) {
      await interaction.editReply({
        content: `No episodes found for **${showDetails.name}** Season ${seasonNumber}.`,
      });
      return;
    }

    const episodes = seasonData.episodes;
    const episodeCount = episodes.length;

    // Check if we need pagination (Discord max 25 fields)
    if (episodeCount > 25) {
      await interaction.editReply({
        content: `**${showDetails.name}** Season ${seasonNumber} has ${episodeCount} episodes, which exceeds Discord's 25 field limit. Pagination support coming soon! For now, try searching individual episodes with \`/episode\`.`,
      });
      return;
    }

    // Fetch external IDs (including IMDb IDs) for all episodes in parallel
    const { getEpisodeDetails } = await import('../services/tmdbService.js');
    const episodeDetailsPromises = episodes.map(ep => 
      getEpisodeDetails(showId, seasonNumber, ep.episode_number)
        .catch(err => {
          console.error(`Failed to get details for S${seasonNumber}E${ep.episode_number}:`, err);
          return null;
        })
    );
    const episodeDetailsArray = await Promise.all(episodeDetailsPromises);

    // Create embed
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`${showDetails.name} - Season ${seasonNumber}`)
      .setDescription(`${episodeCount} episode${episodeCount === 1 ? '' : 's'}`)
      .setThumbnail(showDetails.poster_path 
        ? `https://image.tmdb.org/t/p/w300${showDetails.poster_path}` 
        : null);

    // Add fields for each episode
    for (let i = 0; i < episodes.length; i++) {
      const episode = episodes[i];
      const episodeDetails = episodeDetailsArray[i];
      const episodeNum = episode.episode_number;
      const title = episode.name || 'Untitled';
      const airDate = episode.air_date 
        ? new Date(episode.air_date).toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
          })
        : 'TBA';
      
      // Get TMDB rating (vote_average is out of 10)
      const tmdbRating = episode.vote_average 
        ? episode.vote_average.toFixed(1) 
        : 'N/A';

      // Build field value in 3 lines: title, season/episode, air date/rating
      let fieldValue = '';
      
      // Line 1: [Title](link)
      if (episodeDetails?.external_ids?.imdb_id) {
        fieldValue += `**[${title}](https://www.imdb.com/title/${episodeDetails.external_ids.imdb_id}/)**\n`;
      } else {
        fieldValue += `**${title}**\n`;
      }
      
      // Line 2: Season X • Episode Y
      fieldValue += `Season ${seasonNumber} • Episode ${episodeNum}\n`;
      
      // Line 3: air date and rating
      fieldValue += `${airDate}`;
      if (tmdbRating !== 'N/A') {
        fieldValue += ` • TMDB: ${tmdbRating}/10`;
      }

      embed.addFields({
        name: '\u200B', // Zero-width space for minimal visual separator
        value: fieldValue,
        inline: true, // Display in 2 columns
      });
    }

    // Add footer with series link
    let footerText = `Use /episode to view full details for any episode`;
    if (showDetails.external_ids?.imdb_id) {
      embed.setDescription(
        `${episodeCount} episode${episodeCount === 1 ? '' : 's'}\n\n` +
        `[View season on IMDb](https://www.imdb.com/title/${showDetails.external_ids.imdb_id}/episodes?season=${seasonNumber})`
      );
    }
    embed.setFooter({ text: footerText });

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('Episode list error:', error);
    await interaction.editReply({
      content: 'An error occurred while fetching the episode list. Please try again.',
    });
  }
}

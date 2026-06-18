import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { searchTVShows, getSeasonDetails, getTVShowDetails } from '../services/tmdbService.js';

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
  await interaction.deferReply();

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

    // Use the first/best match
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

    // Create embed
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`${showDetails.name} - Season ${seasonNumber}`)
      .setDescription(`${episodeCount} episode${episodeCount === 1 ? '' : 's'}`)
      .setThumbnail(showDetails.poster_path 
        ? `https://image.tmdb.org/t/p/w300${showDetails.poster_path}` 
        : null);

    // Add fields for each episode
    for (const episode of episodes) {
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

      // Build field value
      let fieldValue = `**Air Date:** ${airDate}\n`;
      
      if (tmdbRating !== 'N/A') {
        fieldValue += `**TMDB Rating:** ${tmdbRating}/10`;
      } else {
        fieldValue += `**Rating:** Not yet rated`;
      }

      embed.addFields({
        name: `${episodeNum}. ${title}`,
        value: fieldValue,
        inline: false,
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

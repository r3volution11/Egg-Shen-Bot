import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { searchMovies, searchTVShows, getSimilarMovies, getSimilarTV, getMovieDetails, getTVShowDetails } from '../services/tmdbService.js';
import { canUseCommand } from '../utils/guildConfig.js';
import { trackSearch } from '../utils/statsTracker.js';

export const data = new SlashCommandBuilder()
  .setName('similar')
  .setDescription('Find similar movies or TV shows')
  .addStringOption(option =>
    option
      .setName('title')
      .setDescription('Movie or TV show title')
      .setRequired(true)
  );

export async function execute(interaction) {
  const title = interaction.options.getString('title');

  await interaction.deferReply({ ephemeral: true });

  try {
    // Search for both movies and TV shows
    const [movieResults, tvResults] = await Promise.all([
      searchMovies(title),
      searchTVShows(title),
    ]);

    const allResults = [
      ...(movieResults || []).map(r => ({ ...r, type: 'movie' })),
      ...(tvResults || []).map(r => ({ ...r, type: 'tv' })),
    ];

    if (allResults.length === 0) {
      await interaction.editReply({
        content: `No movies or TV shows found matching "${title}".`,
      });
      return;
    }

    // If only one result, use it directly
    if (allResults.length === 1) {
      const result = allResults[0];
      const fullTitle = result.title || result.name;
      const year = result.release_date || result.first_air_date;
      const yearStr = year ? ` (${year.split('-')[0]})` : '';

      // Get similar content
      const similar = result.type === 'movie'
        ? await getSimilarMovies(result.id)
        : await getSimilarTV(result.id);

      if (!similar || similar.length === 0) {
        await interaction.editReply({
          content: `No similar recommendations found for **${fullTitle}${yearStr}**.`,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`📺 Similar to ${fullTitle}${yearStr}`)
        .setDescription(`Here are ${similar.length} recommendations similar to this ${result.type === 'movie' ? 'movie' : 'TV show'}:\n\n`);

      const recommendations = similar.slice(0, 10).map((item, index) => {
        const title = item.title || item.name;
        const year = item.release_date || item.first_air_date;
        const yearStr = year ? ` (${year.split('-')[0]})` : '';
        const rating = item.vote_average ? ` • ⭐ ${item.vote_average.toFixed(1)}/10` : '';
        
        return `**${index + 1}.** ${title}${yearStr}${rating}`;
      }).join('\n');

      embed.setDescription(embed.data.description + recommendations);
      embed.setFooter({ text: `Use /${result.type === 'movie' ? 'movie' : 'tv'} to see full details and ratings` });

      // Track the similar search
      await trackSearch(
        interaction.guildId,
        interaction.user.id,
        interaction.user.username,
        'similar',
        fullTitle,
        yearStr.replace(/[()\s]/g, '')
      );

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Multiple results - show selection menu
    const { StringSelectMenuBuilder, ActionRowBuilder } = await import('discord.js');
    
    const options = allResults.slice(0, 5).map((result) => {
      const title = result.title || result.name;
      const year = result.release_date || result.first_air_date;
      const yearStr = year ? ` (${year.split('-')[0]})` : '';
      const overview = result.overview ? result.overview.substring(0, 50) + '...' : 'No description';
      
      return {
        label: `${title}${yearStr}`.substring(0, 100),
        description: `${result.type === 'movie' ? '🎬' : '📺'} ${overview}`.substring(0, 100),
        value: `similar_${result.type}_${result.id}`,
      };
    });
    
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select_similar')
      .setPlaceholder('Select the movie or TV show')
      .addOptions(options);
    
    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    const embed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle(`Select Title`)
      .setDescription(`Found ${allResults.length} result${allResults.length > 1 ? 's' : ''} for "${title}". Select the correct one to see similar recommendations.`)
      .setFooter({ text: 'Select from the menu below' });
    
    await interaction.editReply({
      embeds: [embed],
      components: [row],
    });

  } catch (error) {
    console.error('Similar command error:', error);
    await interaction.editReply({
      content: 'An error occurred while finding similar content. Please try again later.',
    });
  }
}

// Helper function to handle similar selection (called by selectHandler)
export async function handleSimilarSelection(type, tmdbId, interaction) {
  try {
    const { getMovieDetails, getTVShowDetails, getSimilarMovies, getSimilarTV } = await import('../services/tmdbService.js');
    const { trackSearch } = await import('../utils/statsTracker.js');
    const { EmbedBuilder } = await import('discord.js');
    
    // Get details
    const details = type === 'movie' 
      ? await getMovieDetails(tmdbId)
      : await getTVShowDetails(tmdbId);
    
    const fullTitle = details.title || details.name;
    const year = details.release_date || details.first_air_date;
    const yearStr = year ? ` (${year.split('-')[0]})` : '';

    // Get similar content
    const similar = type === 'movie'
      ? await getSimilarMovies(tmdbId)
      : await getSimilarTV(tmdbId);

    if (!similar || similar.length === 0) {
      await interaction.followUp({
        content: `No similar recommendations found for **${fullTitle}${yearStr}**.`,
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`📺 Similar to ${fullTitle}${yearStr}`)
      .setDescription(`Here are ${similar.length} recommendations similar to this ${type === 'movie' ? 'movie' : 'TV show'}:\n\n`);

    const recommendations = similar.slice(0, 10).map((item, index) => {
      const title = item.title || item.name;
      const year = item.release_date || item.first_air_date;
      const yearStr = year ? ` (${year.split('-')[0]})` : '';
      const rating = item.vote_average ? ` • ⭐ ${item.vote_average.toFixed(1)}/10` : '';
      
      return `**${index + 1}.** ${title}${yearStr}${rating}`;
    }).join('\n');

    embed.setDescription(embed.data.description + recommendations);
    embed.setFooter({ text: `Use /${type === 'movie' ? 'movie' : 'tv'} to see full details and ratings` });

    // Track the similar search
    await trackSearch(
      interaction.guildId,
      interaction.user.id,
      interaction.user.username,
      'similar',
      fullTitle,
      yearStr.replace(/[()\s]/g, '')
    );

    // Delete the selection menu
    await interaction.message.delete().catch(() => {});

    // Post the result publicly
    await interaction.channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Similar selection error:', error);
    await interaction.followUp({
      content: 'An error occurred while finding similar content.',
      ephemeral: true,
    });
  }
}

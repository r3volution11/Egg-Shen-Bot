import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { searchMovies, searchTVShows, getSimilarMovies, getSimilarTV, getMovieDetails, getTVShowDetails } from '../services/tmdbService.js';
import { searchGames } from '../services/rawgService.js';
import { searchBoardGames } from '../services/bggService.js';
import { canUseCommand } from '../utils/guildConfig.js';
import { trackSearch } from '../utils/statsTracker.js';

export const data = new SlashCommandBuilder()
  .setName('similar')
  .setDescription('Find similar movies, TV shows, games, or board games')
  .addStringOption(option =>
    option
      .setName('title')
      .setDescription('Movie, TV show, game, or board game title')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('type')
      .setDescription('Specify media type (optional - searches all types if not specified)')
      .setRequired(false)
      .addChoices(
        { name: 'Movie', value: 'movie' },
        { name: 'TV Show', value: 'tv' },
        { name: 'Video Game', value: 'game' },
        { name: 'Board Game', value: 'boardgame' }
      )
  );

export async function execute(interaction) {
  const title = interaction.options.getString('title');
  const mediaType = interaction.options.getString('type');

  await interaction.deferReply();

  try {
    // Search based on specified media type, or all types if not specified
    let allResults = [];
    
    if (!mediaType || mediaType === 'movie') {
      const movieResults = await searchMovies(title);
      allResults.push(...(movieResults || []).map(r => ({ ...r, type: 'movie' })));
    }
    
    if (!mediaType || mediaType === 'tv') {
      const tvResults = await searchTVShows(title);
      allResults.push(...(tvResults || []).map(r => ({ ...r, type: 'tv' })));
    }
    
    if (!mediaType || mediaType === 'game') {
      const gameResults = await searchGames(title);
      allResults.push(...(gameResults || []).map(r => ({ ...r, type: 'game' })));
    }
    
    if (!mediaType || mediaType === 'boardgame') {
      const boardGameResults = await searchBoardGames(title);
      allResults.push(...(boardGameResults || []).map(r => ({ ...r, type: 'boardgame' })));
    }

    if (allResults.length === 0) {
      const typeText = mediaType ? `${mediaType}s` : 'content';
      await interaction.editReply({
        content: `No ${typeText} found matching "${title}".`,
      });
      return;
    }

    // If only one result, use it directly
    if (allResults.length === 1) {
      const result = allResults[0];
      const fullTitle = result.title || result.name;
      const year = result.release_date || result.first_air_date || result.released;
      const yearStr = year ? ` (${year.split('-')[0]})` : '';

      // Get similar content based on type
      let similar;
      if (result.type === 'game') {
        const { getSimilarGames } = await import('../services/rawgService.js');
        similar = await getSimilarGames(result.id);
      } else if (result.type === 'boardgame') {
        const { getSimilarBoardGames } = await import('../services/bggService.js');
        similar = await getSimilarBoardGames(result.id);
      } else {
        similar = result.type === 'movie'
          ? await getSimilarMovies(result.id)
          : await getSimilarTV(result.id);
      }

      if (!similar || similar.length === 0) {
        await interaction.editReply({
          content: `No similar recommendations found for **${fullTitle}${yearStr}**.`,
        });
        return;
      }

      const mediaIcon = result.type === 'game' ? '🎮' : result.type === 'boardgame' ? '🎲' : '📺';
      const mediaColor = result.type === 'game' ? 0x9147FF : result.type === 'boardgame' ? 0xFF5733 : 0x5865F2;
      const mediaName = result.type === 'movie' ? 'movie' : result.type === 'tv' ? 'TV show' : result.type === 'game' ? 'game' : 'board game';
      
      const embed = new EmbedBuilder()
        .setColor(mediaColor)
        .setTitle(`${mediaIcon} Similar to ${fullTitle}${yearStr}`)
        .setDescription(`Here are ${similar.length} recommendations similar to this ${mediaName}:\n\n`);

      const recommendations = similar.slice(0, 10).map((item, index) => {
        const title = item.title || item.name;
        const year = item.release_date || item.first_air_date || item.released || item.yearPublished;
        const yearStr = year ? ` (${year.toString().split('-')[0]})` : '';
        let rating = '';
        
        if (result.type === 'game') {
          rating = item.rating ? ` • ⭐ ${item.rating.toFixed(1)}/5` : '';
        } else if (result.type === 'boardgame') {
          rating = item.rating?.average ? ` • ⭐ ${parseFloat(item.rating.average).toFixed(1)}/10` : '';
        } else {
          rating = item.vote_average ? ` • ⭐ ${item.vote_average.toFixed(1)}/10` : '';
        }
        
        return `**${index + 1}.** ${title}${yearStr}${rating}`;
      }).join('\n');

      embed.setDescription(embed.data.description + recommendations);
      const footerCommand = result.type === 'boardgame' ? 'boardgame' : result.type;
      embed.setFooter({ text: `Use /${footerCommand} to see full details and ratings` });

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
      const year = result.release_date || result.first_air_date || result.released || result.yearPublished;
      const yearStr = year ? ` (${year.toString().split('-')[0]})` : '';
      const overview = result.overview ? result.overview.substring(0, 50) + '...' : 'No description';
      const icon = result.type === 'movie' ? '🎬' : result.type === 'tv' ? '📺' : result.type === 'game' ? '🎮' : '🎲';
      
      return {
        label: `${title}${yearStr}`.substring(0, 100),
        description: `${icon} ${overview}`.substring(0, 100),
        value: `similar_${result.type}_${result.id}`,
      };
    });
    
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select_similar')
      .setPlaceholder('Select the content')
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
export async function handleSimilarSelection(type, itemId, interaction) {
  try {
    const { trackSearch } = await import('../utils/statsTracker.js');
    const { EmbedBuilder } = await import('discord.js');
    
    let fullTitle, yearStr, similar;
    
    if (type === 'game') {
      const { getGameDetails, getSimilarGames } = await import('../services/rawgService.js');
      
      // Get game details
      const details = await getGameDetails(itemId);
      fullTitle = details.name;
      const year = details.released;
      yearStr = year ? ` (${year.split('-')[0]})` : '';
      
      // Get similar games
      similar = await getSimilarGames(itemId);
    } else if (type === 'boardgame') {
      const { getBoardGameDetails, getSimilarBoardGames } = await import('../services/bggService.js');
      
      // Get board game details
      const details = await getBoardGameDetails(itemId);
      fullTitle = details.name;
      const year = details.yearPublished;
      yearStr = year ? ` (${year})` : '';
      
      // Get similar board games
      similar = await getSimilarBoardGames(itemId);
    } else {
      const { getMovieDetails, getTVShowDetails, getSimilarMovies, getSimilarTV } = await import('../services/tmdbService.js');
      
      // Get details
      const details = type === 'movie' 
        ? await getMovieDetails(itemId)
        : await getTVShowDetails(itemId);
      
      fullTitle = details.title || details.name;
      const year = details.release_date || details.first_air_date;
      yearStr = year ? ` (${year.split('-')[0]})` : '';

      // Get similar content
      similar = type === 'movie'
        ? await getSimilarMovies(itemId)
        : await getSimilarTV(itemId);
    }

    if (!similar || similar.length === 0) {
      await interaction.followUp({
        content: `No similar recommendations found for **${fullTitle}${yearStr}**.`,
        ephemeral: true,
      });
      return;
    }

    const mediaIcon = type === 'game' ? '🎮' : type === 'boardgame' ? '🎲' : '📺';
    const mediaColor = type === 'game' ? 0x9147FF : type === 'boardgame' ? 0xFF5733 : 0x5865F2;
    const mediaName = type === 'movie' ? 'movie' : type === 'tv' ? 'TV show' : type === 'game' ? 'game' : 'board game';
    
    const embed = new EmbedBuilder()
      .setColor(mediaColor)
      .setTitle(`${mediaIcon} Similar to ${fullTitle}${yearStr}`)
      .setDescription(`Here are ${similar.length} recommendations similar to this ${mediaName}:\n\n`);

    const recommendations = similar.slice(0, 10).map((item, index) => {
      const title = item.title || item.name;
      const year = item.release_date || item.first_air_date || item.released || item.yearPublished;
      const yearStr = year ? ` (${year.toString().split('-')[0]})` : '';
      let rating = '';
      
      if (type === 'game') {
        rating = item.rating ? ` • ⭐ ${item.rating.toFixed(1)}/5` : '';
      } else if (type === 'boardgame') {
        rating = item.rating?.average ? ` • ⭐ ${parseFloat(item.rating.average).toFixed(1)}/10` : '';
      } else {
        rating = item.vote_average ? ` • ⭐ ${item.vote_average.toFixed(1)}/10` : '';
      }
      
      return `**${index + 1}.** ${title}${yearStr}${rating}`;
    }).join('\n');

    embed.setDescription(embed.data.description + recommendations);
    const footerCommand = type === 'boardgame' ? 'boardgame' : type;
    embed.setFooter({ text: `Use /${footerCommand} to see full details and ratings` });

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

import { SlashCommandBuilder } from 'discord.js';
import { searchBoardGames } from '../services/bggService.js';
import { createBoardGameSearchResults } from '../utils/embedBuilder.js';
import { canUseCommand, loadGuildConfig } from '../utils/guildConfig.js';
import { config } from '../config.js';
import { deliverResult } from '../utils/interactionResponse.js';

export const data = new SlashCommandBuilder()
  .setName('boardgame')
  .setDescription('Search for a board game and get ratings and information')
  .addStringOption(option =>
    option
      .setName('query')
      .setDescription('Board game title to search for')
      .setRequired(true)
  )
  .addBooleanOption(option =>
    option
      .setName('private')
      .setDescription('Only show the result to you instead of the whole channel (default: false)')
      .setRequired(false)
  );

export async function execute(interaction) {
  // Check if BGG API key is configured
  if (!config.apis.bgg.clientId) {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ The BoardGameGeek API is not configured. Please contact the server administrator to set up the `BGG_CLIENT_ID` environment variable.',
        ephemeral: true,
      });
    }
    return;
  }

  // Check if user has permission to use this command
  const hasPermission = await canUseCommand(interaction.guildId, interaction.member, 'boardgame');
  if (!hasPermission) {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ The `/boardgame` command is currently disabled for regular users. Contact a server administrator for more information.',
        ephemeral: true,
      });
    }
    return;
  }

  const query = interaction.options.getString('query');
  const isPrivate = interaction.options.getBoolean('private') || false;

  if (!interaction.replied && !interaction.deferred) {
    await interaction.deferReply({ ephemeral: true });
  }
  
  try {
    const results = await searchBoardGames(query);
    
    if (!results || results.length === 0) {
      await interaction.editReply({
        content: `No board games found matching "${query}". Try a different search term.`,
      });
      return;
    }
    
    // If only one result, display it directly
    if (results.length === 1) {
      const { getBoardGameDetails } = await import('../services/bggService.js');
      const { createBoardGameDetailedEmbed } = await import('../utils/embedBuilder.js');
      const { getStatsConfig } = await import('../utils/guildConfig.js');
      const { trackSearch } = await import('../utils/statsTracker.js');
      
      const gameId = results[0].id;
      const game = await getBoardGameDetails(gameId);
      
      const statsConfig = await getStatsConfig(interaction.guildId);
      
      if (statsConfig.enabled && statsConfig.trackBoardGames) {
        await trackSearch(
          interaction.guildId,
          interaction.user.id,
          interaction.user.username,
          'boardgame',
          game.name,
          game.yearPublished
        ).catch(err => console.error('Stats tracking error:', err));
      }
      
      const response = await createBoardGameDetailedEmbed(game);
      await deliverResult(interaction, response, isPrivate);
      return;
    }

    // Load guild config to get maxSearchResults
    const guildConfig = await loadGuildConfig(interaction.guildId);
    const maxResults = guildConfig.maxSearchResults || 20;
    const limitedResults = results.slice(0, maxResults);

    // The picker itself always stays ephemeral — the private flag travels
    // with the selection so the eventual result can still be public.
    const response = await createBoardGameSearchResults(limitedResults, query, isPrivate);
    await interaction.editReply(response);
    
  } catch (error) {
    console.error('Board game command error:', error);
    await interaction.editReply({
      content: 'An error occurred while searching for board games. Please try again later.',
    });
  }
}

import { SlashCommandBuilder } from 'discord.js';
import { searchGames } from '../services/rawgService.js';
import { createGameSearchResults } from '../utils/embedBuilder.js';
import { canUseCommand, loadGuildConfig } from '../utils/guildConfig.js';

export const data = new SlashCommandBuilder()
  .setName('game')
  .setDescription('Search for a game and get ratings and information')
  .addStringOption(option =>
    option
      .setName('query')
      .setDescription('Game title to search for')
      .setRequired(true)
  );

export async function execute(interaction) {
  // Check if user has permission to use this command
  const hasPermission = await canUseCommand(interaction.guildId, interaction.member, 'game');
  if (!hasPermission) {
    await interaction.reply({
      content: '❌ The `/game` command is currently disabled for regular users. Contact a server administrator for more information.',
      ephemeral: true,
    });
    return;
  }

  const query = interaction.options.getString('query');
  
  await interaction.deferReply({ ephemeral: true });
  
  try {
    const results = await searchGames(query);
    
    if (!results || results.length === 0) {
      await interaction.editReply({
        content: `No games found matching "${query}". Try a different search term.`,
      });
      return;
    }
    
    // If only one result, display it directly
    if (results.length === 1) {
      const { getGameDetails } = await import('../services/rawgService.js');
      const { createGameDetailedEmbed } = await import('../utils/embedBuilder.js');
      const { getStatsConfig } = await import('../utils/guildConfig.js');
      const { trackSearch } = await import('../utils/statsTracker.js');
      
      const gameId = results[0].id;
      const game = await getGameDetails(gameId);
      
      const statsConfig = await getStatsConfig(interaction.guildId);
      
      if (statsConfig.enabled && statsConfig.trackGames) {
        const year = game.released?.split('-')[0];
        await trackSearch(
          interaction.guildId,
          interaction.user.id,
          interaction.user.username,
          'game',
          game.name,
          year
        ).catch(err => console.error('Stats tracking error:', err));
      }
      
      const response = await createGameDetailedEmbed(game);
      await interaction.editReply(response);
      return;
    }
    
    // Load guild config to get maxSearchResults
    const guildConfig = await loadGuildConfig(interaction.guildId);
    const maxResults = guildConfig.maxSearchResults || 20;
    const limitedResults = results.slice(0, maxResults);

    // Create the selection interface (ephemeral for privacy)
    const response = await createGameSearchResults(limitedResults, query);
    await interaction.editReply(response);
    
  } catch (error) {
    console.error('Game command error:', error);
    await interaction.editReply({
      content: 'An error occurred while searching for games. Please try again later.',
    });
  }
}

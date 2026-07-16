import { SlashCommandBuilder } from 'discord.js';
import { searchBooks } from '../services/googleBooksService.js';
import { createBookSearchResults } from '../utils/embedBuilder.js';
import { canUseCommand, loadGuildConfig } from '../utils/guildConfig.js';
import { deliverResult } from '../utils/interactionResponse.js';

export const data = new SlashCommandBuilder()
  .setName('book')
  .setDescription('Search for a book and get information from Google Books')
  .addStringOption(option =>
    option
      .setName('query')
      .setDescription('Book title or author to search for')
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
  const hasPermission = await canUseCommand(interaction.guildId, interaction.member, 'book');
  if (!hasPermission) {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ The `/book` command is currently disabled for regular users. Contact a server administrator for more information.',
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
    const results = await searchBooks(query);
    
    if (!results || results.length === 0) {
      await interaction.editReply({
        content: `No books found matching "${query}". Try a different search term.`,
      });
      return;
    }
    
    // If only one result, display it directly
    if (results.length === 1) {
      const { getBookDetails } = await import('../services/googleBooksService.js');
      const { createBookDetailedEmbed } = await import('../utils/embedBuilder.js');
      const { getStatsConfig } = await import('../utils/guildConfig.js');
      const { trackSearch } = await import('../utils/statsTracker.js');
      
      const bookId = results[0].id;
      const book = await getBookDetails(bookId);
      
      const statsConfig = await getStatsConfig(interaction.guildId);
      
      if (statsConfig.enabled && statsConfig.trackBooks) {
        const year = book.publishedDate?.split('-')[0];
        await trackSearch(
          interaction.guildId,
          interaction.user.id,
          interaction.user.username,
          'book',
          book.title,
          year
        ).catch(err => console.error('Stats tracking error:', err));
      }
      
      const response = await createBookDetailedEmbed(book);
      await deliverResult(interaction, response, isPrivate);
      return;
    }

    // Load guild config to get maxSearchResults
    const guildConfig = await loadGuildConfig(interaction.guildId);
    const maxResults = guildConfig.maxSearchResults || 20;
    const limitedResults = results.slice(0, maxResults);

    // The picker itself always stays ephemeral — the private flag travels
    // with the selection so the eventual result can still be public.
    const response = await createBookSearchResults(limitedResults, query, isPrivate);
    await interaction.editReply(response);
    
  } catch (error) {
    console.error('Book command error:', error);
    const errorMessage = error.message === 'Rate limit exceeded. Please try again in a moment.'
      ? 'Rate limit exceeded. Please try again in a moment.'
      : 'An error occurred while searching for books. Please try again later.';
    await interaction.editReply({
      content: errorMessage,
    });
  }
}

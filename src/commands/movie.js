import { SlashCommandBuilder } from 'discord.js';
import { searchMovies } from '../services/tmdbService.js';
import { createSearchResults } from '../utils/embedBuilder.js';

export const data = new SlashCommandBuilder()
  .setName('movie')
  .setDescription('Search for a movie and get ratings from multiple services')
  .addStringOption(option =>
    option
      .setName('query')
      .setDescription('Movie title to search for')
      .setRequired(true)
  );

export async function execute(interaction) {
  const query = interaction.options.getString('query');
  
  await interaction.deferReply();
  
  try {
    const results = await searchMovies(query);
    
    if (!results || results.length === 0) {
      await interaction.editReply({
        content: `No movies found matching "${query}". Try a different search term.`,
      });
      return;
    }
    
    // Create the selection interface
    const response = await createSearchResults(results, 'movie', query);
    await interaction.editReply(response);
    
  } catch (error) {
    console.error('Movie command error:', error);
    await interaction.editReply({
      content: 'An error occurred while searching for movies. Please try again later.',
    });
  }
}

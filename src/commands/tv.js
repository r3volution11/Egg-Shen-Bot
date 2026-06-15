import { SlashCommandBuilder } from 'discord.js';
import { searchTVShows } from '../services/tmdbService.js';
import { createSearchResults } from '../utils/embedBuilder.js';

export const data = new SlashCommandBuilder()
  .setName('tv')
  .setDescription('Search for a TV show and get ratings from multiple services')
  .addStringOption(option =>
    option
      .setName('query')
      .setDescription('TV show title to search for (optionally include episode name)')
      .setRequired(true)
  );

export async function execute(interaction) {
  const query = interaction.options.getString('query');
  
  await interaction.deferReply();
  
  try {
    // Note: Currently searches for TV series only
    // Future enhancement: Parse query to detect episode names/numbers
    // Example: "The Outer Limits Sandkings" could search for specific episode
    // For now, returns series results with series poster (per requirements)
    const results = await searchTVShows(query);
    
    if (!results || results.length === 0) {
      await interaction.editReply({
        content: `No TV shows found matching "${query}". Try a different search term.`,
      });
      return;
    }
    
    // Create the selection interface
    const response = await createSearchResults(results, 'tv', query);
    await interaction.editReply(response);
    
  } catch (error) {
    console.error('TV command error:', error);
    await interaction.editReply({
      content: 'An error occurred while searching for TV shows. Please try again later.',
    });
  }
}

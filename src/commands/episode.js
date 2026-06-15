import { SlashCommandBuilder } from 'discord.js';
import { searchTVShows } from '../services/tmdbService.js';
import { createEpisodeSearchResults } from '../utils/embedBuilder.js';

export const data = new SlashCommandBuilder()
  .setName('episode')
  .setDescription('Search for a TV show episode and get ratings from multiple services')
  .addStringOption(option =>
    option
      .setName('show')
      .setDescription('TV show name (e.g., "The Outer Limits")')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('episode')
      .setDescription('Episode name (e.g., "Sandkings")')
      .setRequired(true)
  );

export async function execute(interaction) {
  const showQuery = interaction.options.getString('show');
  const episodeQuery = interaction.options.getString('episode');
  
  await interaction.deferReply();
  
  try {
    // First, search for the TV show
    const showResults = await searchTVShows(showQuery);
    
    if (!showResults || showResults.length === 0) {
      await interaction.editReply({
        content: `No TV shows found matching "${showQuery}". Try a different search term.`,
      });
      return;
    }
    
    // Create the selection interface with episode name stored
    const response = await createEpisodeSearchResults(showResults, showQuery, episodeQuery);
    await interaction.editReply(response);
    
  } catch (error) {
    console.error('Episode command error:', error);
    await interaction.editReply({
      content: 'An error occurred while searching for TV shows. Please try again later.',
    });
  }
}


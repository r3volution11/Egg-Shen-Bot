import { SlashCommandBuilder } from 'discord.js';
import { searchMovies, searchTVShows } from '../services/tmdbService.js';
import { hybridSearch } from '../services/aiService.js';
import { createSoundtrackSearchResults } from '../utils/embedBuilder.js';
import { canUseCommand, loadGuildConfig } from '../utils/guildConfig.js';

export const data = new SlashCommandBuilder()
  .setName('soundtrack')
  .setDescription('Search for movie and TV show soundtracks')
  .addStringOption(option =>
    option
      .setName('query')
      .setDescription('Movie or TV show title to find soundtrack for')
      .setRequired(true)
  );

export async function execute(interaction) {
  // Check if user has permission to use this command
  const hasPermission = await canUseCommand(interaction.guildId, interaction.member, 'soundtrack');
  if (!hasPermission) {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ The `/soundtrack` command is currently disabled for regular users. Contact a server administrator for more information.',
        ephemeral: true,
      });
    }
    return;
  }

  const query = interaction.options.getString('query');
  
  // Safely defer reply if not already acknowledged
  if (!interaction.replied && !interaction.deferred) {
    await interaction.deferReply({ ephemeral: true });
  }
  
  try {
    // Search both movies and TV shows
    const [movieResults, tvResults] = await Promise.all([
      hybridSearch(query, searchMovies, 'movie'),
      hybridSearch(query, searchTVShows, 'tv'),
    ]);
    
    // Combine results, prioritizing exact matches
    const allResults = [
      ...(movieResults || []).map(r => ({ ...r, type: 'movie' })),
      ...(tvResults || []).map(r => ({ ...r, type: 'tv' })),
    ];
    
    if (allResults.length === 0) {
      await interaction.editReply({
        content: `No movies or TV shows found matching "${query}". Try a different search term.`,
      });
      return;
    }
    
    // Load guild config for max results
    const guildConfig = await loadGuildConfig(interaction.guildId);
    const maxResults = guildConfig?.maxSearchResults || 20;
    
    // Limit results
    const limitedResults = allResults.slice(0, maxResults);
    
    // If only one result, search for its soundtrack directly
    if (limitedResults.length === 1) {
      await searchAndDisplaySoundtrack(interaction, limitedResults[0]);
      return;
    }
    
    // Create selection menu for multiple results
    const embed = createSoundtrackSearchResults(limitedResults, query);
    
    await interaction.editReply(embed);
    
  } catch (error) {
    console.error('Error in soundtrack command:', error);
    await interaction.editReply({
      content: 'An error occurred while searching. Please try again.',
    });
  }
}

/**
 * Search for and display soundtrack for a specific title
 */
async function searchAndDisplaySoundtrack(interaction, result) {
  const { EmbedBuilder } = await import('discord.js');
  const { searchSoundtrack } = await import('../services/itunesService.js');
  const { trackSearch } = await import('../utils/statsTracker.js');
  
  // Track the search in statistics
  const guildConfig = await loadGuildConfig(interaction.guildId);
  const statsConfig = guildConfig?.stats;
  
  if (statsConfig?.enabled) {
    await trackSearch(
      interaction.guildId,
      interaction.user.id,
      interaction.user.username,
      'soundtrack',
      result.title || result.name,
      (result.release_date || result.first_air_date || '').split('-')[0]
    );
  }
  
  // Search iTunes for the soundtrack
  const title = result.title || result.name;
  const type = result.type;
  
  const soundtracks = await searchSoundtrack(title, type, 5);
  
  if (!soundtracks || soundtracks.length === 0) {
    await interaction.editReply({
      content: `🎵 No soundtracks found for **${title}**.\n\nThis could mean:\n• The soundtrack isn't available on iTunes\n• Try searching with a different variation of the title\n• The soundtrack might be available on other platforms like Spotify`,
    });
    return;
  }
  
  // If multiple soundtracks found, show the first one with a note
  const soundtrack = soundtracks[0];
  
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`🎵 ${soundtrack.collectionName}`)
    .setDescription(`Soundtrack for **${title}**`)
    .setThumbnail(soundtrack.artworkUrl600 || soundtrack.artworkUrl100);
  
  // Artist/Composer
  if (soundtrack.artistName) {
    embed.addFields({
      name: 'Artist/Composer',
      value: soundtrack.artistName,
      inline: true,
    });
  }
  
  // Track Count
  if (soundtrack.trackCount) {
    embed.addFields({
      name: 'Tracks',
      value: soundtrack.trackCount.toString(),
      inline: true,
    });
  }
  
  // Release Date
  if (soundtrack.releaseDate) {
    const releaseDate = new Date(soundtrack.releaseDate);
    embed.addFields({
      name: 'Released',
      value: releaseDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      inline: true,
    });
  }
  
  // Genre
  if (soundtrack.primaryGenreName) {
    embed.addFields({
      name: 'Genre',
      value: soundtrack.primaryGenreName,
      inline: true,
    });
  }
  
  // Price
  if (soundtrack.collectionPrice !== undefined) {
    const priceText = soundtrack.collectionPrice === 0 
      ? 'Free' 
      : `${soundtrack.currency || '$'}${soundtrack.collectionPrice.toFixed(2)}`;
    
    embed.addFields({
      name: 'Price',
      value: priceText,
      inline: true,
    });
  }
  
  // iTunes Link
  if (soundtrack.collectionViewUrl) {
    embed.addFields({
      name: 'Listen & Buy',
      value: `[View on iTunes](${soundtrack.collectionViewUrl})`,
      inline: false,
    });
  }
  
  // Copyright
  if (soundtrack.copyright) {
    embed.setFooter({ text: soundtrack.copyright });
  }
  
  // Note if there are more soundtracks available
  if (soundtracks.length > 1) {
    embed.addFields({
      name: 'ℹ️ Multiple Soundtracks Available',
      value: `Found ${soundtracks.length} soundtracks. Showing the most relevant match.`,
      inline: false,
    });
  }
  
  await interaction.editReply({ embeds: [embed], components: [] });
}

/**
 * Export function to be called from selectHandler
 */
export { searchAndDisplaySoundtrack };

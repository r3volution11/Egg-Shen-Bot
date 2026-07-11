import { SlashCommandBuilder } from 'discord.js';
import { searchMovies, searchTVShows, getMovieAlternativeTitles, getTVAlternativeTitles } from '../services/tmdbService.js';
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
      hybridSearch(query, searchMovies, 'movie', getMovieAlternativeTitles),
      hybridSearch(query, searchTVShows, 'tv', getTVAlternativeTitles),
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
      await searchAndDisplaySoundtrack(interaction, limitedResults[0], false);
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
 * @param {Object} interaction - Discord interaction
 * @param {Object} result - Title details
 * @param {boolean} deleteEphemeral - Whether to delete ephemeral message and send publicly
 */
async function searchAndDisplaySoundtrack(interaction, result, deleteEphemeral = false) {
  const { EmbedBuilder } = await import('discord.js');
  const { searchSoundtrack: searchITunes } = await import('../services/itunesService.js');
  const { searchSoundtrack: searchSpotify, isConfigured: isSpotifyConfigured } = await import('../services/spotifyService.js');
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
  
  const title = result.title || result.name;
  const type = result.type;
  
  // Search both services in parallel if Spotify is configured
  const searchPromises = [
    searchITunes(title, type, 5),
  ];
  
  if (isSpotifyConfigured()) {
    searchPromises.push(searchSpotify(title, type, 5));
  }
  
  const [itunesResults, spotifyResult] = await Promise.all(searchPromises);
  
  // Check if we found any results
  if ((!itunesResults || itunesResults.length === 0) && !spotifyResult) {
    const servicesText = isSpotifyConfigured() ? 'iTunes or Spotify' : 'iTunes';
    
    if (deleteEphemeral && interaction.message) {
      await interaction.message.delete().catch(() => {});
      await interaction.channel.send({
        content: `🎵 No soundtracks found for **${title}** on ${servicesText}.\n\nThis could mean:\n• The soundtrack isn't available on these services yet\n• Try searching with a different variation of the title\n• The soundtrack might be available on other platforms`,
      });
    } else {
      await interaction.editReply({
        content: `🎵 No soundtracks found for **${title}** on ${servicesText}.\n\nThis could mean:\n• The soundtrack isn't available on these services yet\n• Try searching with a different variation of the title\n• The soundtrack might be available on other platforms`,
      });
    }
    return;
  }
  
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`🎵 Soundtrack for ${title}`)
    .setDescription(`Found ${itunesResults?.length > 0 ? '✓' : ''} iTunes${spotifyResult ? ', ✓ Spotify' : ''}`);
  
  // Set thumbnail (prefer Spotify's higher quality artwork, fallback to iTunes)
  if (spotifyResult?.imageUrl) {
    embed.setThumbnail(spotifyResult.imageUrl);
  } else if (itunesResults?.[0]?.artworkUrl600) {
    embed.setThumbnail(itunesResults[0].artworkUrl600 || itunesResults[0].artworkUrl100);
  }
  
  // Add iTunes information if available
  if (itunesResults && itunesResults.length > 0) {
    const itunes = itunesResults[0];
    
    let itunesInfo = `**[${itunes.collectionName}](${itunes.collectionViewUrl})**\n`;
    itunesInfo += `Artist: ${itunes.artistName}\n`;
    itunesInfo += `Tracks: ${itunes.trackCount}\n`;
    
    if (itunes.releaseDate) {
      const releaseDate = new Date(itunes.releaseDate);
      itunesInfo += `Released: ${releaseDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}\n`;
    }
    
    if (itunes.collectionPrice !== undefined) {
      const priceText = itunes.collectionPrice === 0 
        ? 'Free' 
        : `${itunes.currency || '$'}${itunes.collectionPrice.toFixed(2)}`;
      itunesInfo += `Price: ${priceText}`;
    }
    
    embed.addFields({
      name: '🎵 Apple Music / iTunes',
      value: itunesInfo,
      inline: false,
    });
    
    // Add copyright footer from iTunes
    if (itunes.copyright) {
      embed.setFooter({ text: itunes.copyright });
    }
  }
  
  // Add Spotify information if available
  if (spotifyResult) {
    let spotifyInfo = `**[${spotifyResult.name}](${spotifyResult.albumUrl})**\n`;
    spotifyInfo += `Artist: ${spotifyResult.artists}\n`;
    spotifyInfo += `Tracks: ${spotifyResult.totalTracks}\n`;
    
    if (spotifyResult.releaseDate) {
      const releaseDate = new Date(spotifyResult.releaseDate);
      spotifyInfo += `Released: ${releaseDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}`;
    }
    
    embed.addFields({
      name: '🎵 Spotify',
      value: spotifyInfo,
      inline: false,
    });
  }
  
  // Note if there are more iTunes soundtracks available
  if (itunesResults && itunesResults.length > 1) {
    embed.addFields({
      name: 'ℹ️ Multiple iTunes Soundtracks Available',
      value: `Found ${itunesResults.length} soundtracks on iTunes. Showing the most relevant match.`,
      inline: false,
    });
  }
  
  // If called from single result or selection, delete ephemeral and send publicly
  if (deleteEphemeral && interaction.message) {
    await interaction.message.delete().catch(() => {});
    await interaction.channel.send({ embeds: [embed] });
  } else {
    await interaction.editReply({ embeds: [embed], components: [] });
  }
}

/**
 * Export function to be called from selectHandler
 */
export { searchAndDisplaySoundtrack };

import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { searchMovies, searchTVShows } from '../services/tmdbService.js';
import { searchGames } from '../services/rawgService.js';
import { searchBoardGames } from '../services/bggService.js';
import { searchBooks } from '../services/googleBooksService.js';
import { config } from '../config.js';
import { canGenerateImage, recordImageGeneration } from '../utils/aiImageTracker.js';
import { isTrueAdmin, isModerator } from '../utils/guildConfig.js';

export const data = new SlashCommandBuilder()
  .setName('versus-image')
  .setDescription('Generate AI "versus" battle image comparing two titles')
  .addStringOption(option =>
    option
      .setName('title1')
      .setDescription('First title (movie, show, game, book, etc.)')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('title2')
      .setDescription('Second title to compare against')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('prompt')
      .setDescription('Additional details for the image generation (optional)')
      .setRequired(false)
  );

export async function execute(interaction) {
  // Defer with ephemeral to hide command from other users
  await interaction.deferReply({ ephemeral: true });
  
  // Check permissions and feature enabled
  const userIsTrueAdmin = await isTrueAdmin(interaction.member);
  const userIsMod = await isModerator(interaction.member) || userIsTrueAdmin;
  const rateCheck = canGenerateImage(interaction.guildId, interaction.user.id, userIsTrueAdmin, userIsMod);
  
  if (!rateCheck.allowed) {
    return await interaction.editReply(`❌ ${rateCheck.reason}`);
  }
  
  const title1 = interaction.options.getString('title1');
  const title2 = interaction.options.getString('title2');
  const customPrompt = interaction.options.getString('prompt');
  
  // Check if OpenAI is configured first
  if (!config.apis.openai?.apiKey) {
    await interaction.editReply('❌ OpenAI API is not configured. AI image generation requires an OpenAI API key.');
    return;
  }
  
  // Search for both titles across all APIs
  const [result1, result2] = await Promise.all([
    searchForTitleUniversal(title1),
    searchForTitleUniversal(title2)
  ]);
  
  // Check if either title wasn't found
  if (result1.status === 'none' || result2.status === 'none') {
    const notFound = [];
    if (result1.status === 'none') notFound.push(`**${title1}**`);
    if (result2.status === 'none') notFound.push(`**${title2}**`);
    
    await interaction.editReply({
      content: `❌ Could not find: ${notFound.join(', ')}\n\n` +
        `Please check spelling or try different search terms. The bot searches movies, TV shows, video games, board games, and books.`,
    });
    return;
  }
  
  // Handle multiple matches - take first result but inform user
  let firstEntry, secondEntry;
  let disambiguationNote = '';
  
  if (result1.status === 'multiple') {
    firstEntry = buildEntryFromResult(result1.results[0], result1.results[0].searchType);
    const typeLabel = getTypeLabel(firstEntry.type);
    const yearStr = firstEntry.year ? ` (${firstEntry.year})` : '';
    disambiguationNote += `\n📌 Multiple matches for "${title1}" - using: **${firstEntry.title}${yearStr}** (${typeLabel})`;
    disambiguationNote += `\n   _Be more specific next time: \`title1:"${firstEntry.title} ${firstEntry.year}"\`_`;
  } else {
    firstEntry = result1.entry;
  }
  
  if (result2.status === 'multiple') {
    secondEntry = buildEntryFromResult(result2.results[0], result2.results[0].searchType);
    const typeLabel = getTypeLabel(secondEntry.type);
    const yearStr = secondEntry.year ? ` (${secondEntry.year})` : '';
    disambiguationNote += `\n📌 Multiple matches for "${title2}" - using: **${secondEntry.title}${yearStr}** (${typeLabel})`;
    disambiguationNote += `\n   _Be more specific next time: \`title2:"${secondEntry.title} ${secondEntry.year}"\`_`;
  } else {
    secondEntry = result2.entry;
  }
  
  const firstTitle = firstEntry.title;
  const secondTitle = secondEntry.title;
  
  // Show disambiguation note if needed
  if (disambiguationNote) {
    await interaction.editReply({
      content: `🔍 **Search Results:**${disambiguationNote}\n\n_Generating image in 2-3 minutes..._`,
    });
    // Wait a moment so user can read the message
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  // Generate the AI image
  try {
    // Create a dramatic prompt with type-specific context
    // Use "inspired by" language to comply with OpenAI content policy
    let promptBase = 'Original poster artwork inspired by';
    let promptDetails = '';
    
    // Add type-specific context
    if (firstEntry.type === 'movie' && secondEntry.type === 'movie') {
      promptBase = 'Original movie poster artwork inspired by the themes of';
    } else if (firstEntry.type === 'tv' && secondEntry.type === 'tv') {
      promptBase = 'Original TV show poster artwork inspired by the themes of';
    } else if (firstEntry.type === 'game' && secondEntry.type === 'game') {
      promptBase = 'Original video game cover artwork inspired by the themes of';
    } else {
      // Cross-type matchup
      const type1 = getTypeLabel(firstEntry.type).toLowerCase();
      const type2 = getTypeLabel(secondEntry.type).toLowerCase();
      promptBase = `Original artwork inspired by the themes of a ${type1} and a ${type2}`;
    }
    
    // Add descriptive details if available (helps guide the AI without copying)
    if (firstEntry.metadata?.overview) {
      promptDetails += ` Concept for first side: ${firstEntry.metadata.overview.substring(0, 100)}.`;
    }
    if (secondEntry.metadata?.overview) {
      promptDetails += ` Concept for second side: ${secondEntry.metadata.overview.substring(0, 100)}.`;
    }
    
    const prompt = `${promptBase} "${firstTitle}" and "${secondTitle}". IMPORTANT: Create a versus battle composition with strict left-right layout. LEFT HALF: "${firstTitle}" theme and imagery. CENTER: Bold "VS" text divider. RIGHT HALF: "${secondTitle}" theme and imagery. Split-screen battle poster with dramatic lighting, cinematic style, high contrast. Professional design, 4K quality. Do not replicate existing poster art - create something new inspired by these titles.${promptDetails}${customPrompt ? ` Additional details: ${customPrompt}` : ''}`;
    
    // Log the prompt for debugging
    console.log(`[/versus-image] User: ${interaction.user.username} (${interaction.user.id})`);
    console.log(`[/versus-image] Guild: ${interaction.guildId}`);
    console.log(`[/versus-image] Title 1: "${title1}" -> "${firstTitle}" (${firstEntry.type})`);
    console.log(`[/versus-image] Title 2: "${title2}" -> "${secondTitle}" (${secondEntry.type})`);
    console.log(`[/versus-image] Custom prompt: ${customPrompt || 'none'}`);
    console.log(`[/versus-image] Generated prompt: ${prompt.substring(0, 300)}...`);
    
    await interaction.editReply(`🎨 Generating AI image for **${firstTitle}** vs **${secondTitle}**...\n\n_This may take 2-3 minutes..._`);
    
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apis.openai.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-image-2', // OpenAI's latest image model (formerly dall-e-3)
        prompt: prompt,
        n: 1,
        size: '1792x1024', // Wide format for vs layout
        quality: 'medium', // Options: 'low', 'medium', 'high', or 'auto'
      }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      console.error(`[/versus-image] OpenAI API Error:`, error);
      throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
    }
    
    const data = await response.json();
    console.log('[/versus-image] OpenAI Response:', JSON.stringify(data, null, 2));
    
    // Check for different response formats
    let imageBuffer;
    if (data.data && data.data[0]) {
      if (data.data[0].url) {
        console.log('[/versus-image] Found URL, downloading...');
        const imageUrl = data.data[0].url;
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
          throw new Error('Failed to download generated image');
        }
        imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
      } else if (data.data[0].b64_json) {
        console.log('[/versus-image] Received base64 data, converting to buffer...');
        imageBuffer = Buffer.from(data.data[0].b64_json, 'base64');
      } else {
        console.error('[/versus-image] Unknown format:', data);
        throw new Error('Invalid response from OpenAI - unexpected format');
      }
    } else {
      console.error('[/versus-image] Missing data array:', data);
      throw new Error('Invalid response from OpenAI - missing data');
    }
    
    // Record the image generation
    recordImageGeneration(interaction.guildId, interaction.user.id, 'versus-image', {
      title1: firstTitle,
      title2: secondTitle,
      customPrompt: customPrompt || null,
      type1: firstEntry.type,
      type2: secondEntry.type,
    });
    
    // Create embed with the generated image
    const embed = new EmbedBuilder()
      .setColor(0xFEE75C)
      .setTitle(`🎨 ${firstTitle} vs ${secondTitle}`)
      .setImage('attachment://versus.png')
      .setFooter({ text: interaction.user.username })
      .setTimestamp();
    
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'versus.png' });
    
    // Send the image publicly to the channel
    await interaction.channel.send({
      embeds: [embed],
      files: [attachment]
    });
    
    // Update the ephemeral reply to confirm
    await interaction.editReply('✅ Image generated and posted to the channel!');
    
  } catch (error) {
    console.error('[/versus-image] Error generating AI image:', error);
    await interaction.editReply(`❌ Failed to generate AI image: ${error.message}`);
  }
}

/**
 * Search for a title across all available APIs (movies, TV, games, board games, books)
 * Returns: { status: 'found'|'multiple'|'none', entry: {...}|null, results: [...], count: number }
 */
async function searchForTitleUniversal(title) {
  try {
    // Search all APIs in parallel
    const [movieResults, tvResults, gameResults, boardGameResults, bookResults] = await Promise.all([
      searchMovies(title).catch(() => []),
      searchTVShows(title).catch(() => []),
      searchGames(title).catch(() => []),
      searchBoardGames(title).catch(() => []),
      searchBooks(title).catch(() => []),
    ]);
    
    // Tag each result with its search type
    const taggedMovies = (movieResults || []).map(r => ({ ...r, searchType: 'movie' }));
    const taggedTV = (tvResults || []).map(r => ({ ...r, searchType: 'tv' }));
    const taggedGames = (gameResults || []).map(r => ({ ...r, searchType: 'game' }));
    const taggedBoardGames = (boardGameResults || []).map(r => ({ ...r, searchType: 'boardgame' }));
    const taggedBooks = (bookResults || []).map(r => ({ ...r, searchType: 'book' }));
    
    // Combine all results
    const allResults = [
      ...taggedMovies,
      ...taggedTV,
      ...taggedGames,
      ...taggedBoardGames,
      ...taggedBooks
    ];
    
    if (allResults.length === 0) {
      return { status: 'none', entry: null, results: [], count: 0 };
    }
    
    if (allResults.length === 1) {
      const entry = buildEntryFromResult(allResults[0], allResults[0].searchType);
      return { status: 'found', entry, results: allResults, count: 1 };
    }
    
    // Multiple results - return first one with disambiguation info
    const entry = buildEntryFromResult(allResults[0], allResults[0].searchType);
    return { status: 'multiple', entry, results: allResults, count: allResults.length };
    
  } catch (error) {
    console.error(`[Universal Search] Error searching for "${title}":`, error);
    return { status: 'none', entry: null, results: [], count: 0 };
  }
}

/**
 * Build a standardized entry object from search result
 */
function buildEntryFromResult(result, type) {
  const entry = {
    type: type,
    title: result.title || result.name || 'Unknown',
    year: null,
    metadata: {}
  };
  
  // Extract year based on type
  if (type === 'movie' || type === 'tv') {
    const dateStr = result.release_date || result.first_air_date;
    if (dateStr) {
      entry.year = parseInt(dateStr.substring(0, 4));
    }
    entry.metadata.overview = result.overview;
  } else if (type === 'game') {
    if (result.released) {
      entry.year = parseInt(result.released.substring(0, 4));
    }
    entry.metadata.overview = result.description_raw;
  } else if (type === 'boardgame') {
    entry.year = result.yearpublished;
    entry.metadata.overview = result.description;
  } else if (type === 'book') {
    if (result.publishedDate) {
      entry.year = parseInt(result.publishedDate.substring(0, 4));
    }
    entry.metadata.overview = result.description;
  }
  
  return entry;
}

/**
 * Get human-readable type label
 */
function getTypeLabel(type) {
  const labels = {
    'movie': 'Movie',
    'tv': 'TV Show',
    'game': 'Video Game',
    'boardgame': 'Board Game',
    'book': 'Book'
  };
  return labels[type] || type;
}

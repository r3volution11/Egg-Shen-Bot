import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { searchMovies, searchTVShows } from '../services/tmdbService.js';
import { searchGames } from '../services/rawgService.js';
import { searchBoardGames } from '../services/bggService.js';
import { searchBooks } from '../services/googleBooksService.js';
import { config } from '../config.js';
import { canGenerateImage, recordImageGeneration } from '../utils/aiImageTracker.js';
import { isTrueAdmin, isModerator } from '../utils/guildConfig.js';
import * as bracketManager from '../utils/bracketManager.js';

export const data = new SlashCommandBuilder()
  .setName('image')
  .setDescription('Generate AI images: freeform, from a message, or a versus battle between two titles')
  .addStringOption(option =>
    option
      .setName('prompt')
      .setDescription('Describe the image you want (or add extra detail alongside title1/title2 or matchup)')
      .setRequired(false)
  )
  .addStringOption(option =>
    option
      .setName('message')
      .setDescription('Username or message ID to generate an image from')
      .setRequired(false)
  )
  .addStringOption(option =>
    option
      .setName('title1')
      .setDescription('First title for a versus battle image (movie, show, game, board game, or book)')
      .setRequired(false)
  )
  .addStringOption(option =>
    option
      .setName('title2')
      .setDescription('Second title for a versus battle image')
      .setRequired(false)
  )
  .addStringOption(option =>
    option
      .setName('matchup')
      .setDescription('Generate from an active tournament matchup instead of searching (e.g., "1A")')
      .setRequired(false)
  );

export async function execute(interaction) {
  // Defer with ephemeral to hide the command from other users
  await interaction.deferReply({ ephemeral: true });

  // Check permissions and feature enabled
  const userIsTrueAdmin = await isTrueAdmin(interaction.member);
  const userIsMod = await isModerator(interaction.member) || userIsTrueAdmin;
  const rateCheck = canGenerateImage(interaction.guildId, interaction.user.id, userIsTrueAdmin, userIsMod);

  if (!rateCheck.allowed) {
    return await interaction.editReply(`❌ ${rateCheck.reason}`);
  }

  // Check if OpenAI is configured
  if (!config.apis.openai?.apiKey) {
    await interaction.editReply('❌ OpenAI API is not configured. AI image generation requires an OpenAI API key.');
    return;
  }

  const prompt = interaction.options.getString('prompt');
  const messageInput = interaction.options.getString('message');
  const title1 = interaction.options.getString('title1');
  const title2 = interaction.options.getString('title2');
  const matchupInput = interaction.options.getString('matchup');

  // title1/title2 must be provided together
  if ((title1 && !title2) || (title2 && !title1)) {
    return await interaction.editReply('❌ Please provide both `title1` and `title2` for a versus battle image.');
  }

  const hasVersusTitles = !!(title1 && title2);
  const primaryModes = [hasVersusTitles, !!matchupInput, !!messageInput].filter(Boolean);

  if (primaryModes.length > 1) {
    return await interaction.editReply(
      '❌ Please choose only one of: `title1`+`title2`, `matchup`, or `message` — not more than one.'
    );
  }

  // No mode selected at all — show usage help (and current tournament matchups, if any)
  if (!hasVersusTitles && !matchupInput && !messageInput && !prompt) {
    return await interaction.editReply({ content: buildHelpMessage(interaction.guildId) });
  }

  try {
    if (hasVersusTitles) {
      await generateVersusFromSearch(interaction, title1, title2, prompt);
    } else if (matchupInput) {
      await generateVersusFromMatchup(interaction, matchupInput, prompt);
    } else if (messageInput) {
      await generateFromMessage(interaction, messageInput);
    } else {
      await generateFromPrompt(interaction, prompt);
    }
  } catch (error) {
    console.error('[/image] Error generating AI image:', error);
    await interaction.editReply(`❌ Failed to generate AI image: ${error.message}`);
  }
}

function buildHelpMessage(guildId) {
  let helpMessage = '🎨 **AI Image Generation**\n\n';

  const tournament = bracketManager.loadTournament(guildId);
  if (tournament && tournament.knockoutBracket && tournament.knockoutBracket.length > 0) {
    const matchupList = tournament.knockoutBracket
      .filter(m => m.movie1 && m.movie2)
      .map((m, idx) => `${idx + 1}. **${m.movie1.title}** vs **${m.movie2.title}** (${m.round.replace(/_/g, ' ')})`)
      .join('\n');

    helpMessage += `**Tournament Matchups:**\n${matchupList}\n\n💡 Generate an image:\n\`/image matchup:"Movie A vs Movie B"\`\n\n`;
  }

  helpMessage += '**Create a versus battle image with smart search:**\n`/image title1:"The Thing" title2:"Alien"`\n\n';
  helpMessage += '**Or generate freeform:**\n`/image prompt:"a haunted lighthouse at midnight"`\n\n';
  helpMessage += '**Or generate from a recent message:**\n`/image message:"username or message ID"`\n\n';
  helpMessage += '✨ **Features:**\n';
  helpMessage += '• Versus mode searches movies, TV shows, video games, board games, and books\n';
  helpMessage += '• Validates titles exist before generating\n';
  helpMessage += '• Works with cross-type comparisons (e.g., book vs movie)\n';
  helpMessage += '• Generates in 2-3 minutes ($0.04 per image)';

  return helpMessage;
}

/**
 * Search for a title across all available APIs (movies, TV, games, board games, books)
 * Returns: { status: 'found'|'multiple'|'none', entry: {...}|null, results: [...], count: number }
 */
async function searchForTitleUniversal(title) {
  try {
    const [movieResults, tvResults, gameResults, boardGameResults, bookResults] = await Promise.all([
      searchMovies(title).catch(() => []),
      searchTVShows(title).catch(() => []),
      searchGames(title).catch(() => []),
      searchBoardGames(title).catch(() => []),
      searchBooks(title).catch(() => []),
    ]);

    const taggedMovies = (movieResults || []).map(r => ({ ...r, searchType: 'movie' }));
    const taggedTV = (tvResults || []).map(r => ({ ...r, searchType: 'tv' }));
    const taggedGames = (gameResults || []).map(r => ({ ...r, searchType: 'game' }));
    const taggedBoardGames = (boardGameResults || []).map(r => ({ ...r, searchType: 'boardgame' }));
    const taggedBooks = (bookResults || []).map(r => ({ ...r, searchType: 'book' }));

    const allResults = [...taggedMovies, ...taggedTV, ...taggedGames, ...taggedBoardGames, ...taggedBooks];

    if (allResults.length === 0) {
      return { status: 'none', entry: null, results: [], count: 0 };
    }

    if (allResults.length === 1) {
      const entry = buildEntryFromResult(allResults[0], allResults[0].searchType);
      return { status: 'found', entry, results: allResults, count: 1 };
    }

    const entry = buildEntryFromResult(allResults[0], allResults[0].searchType);
    return { status: 'multiple', entry, results: allResults, count: allResults.length };
  } catch (error) {
    console.error(`[Universal Search] Error searching for "${title}":`, error);
    return { status: 'none', entry: null, results: [], count: 0 };
  }
}

/** Build a standardized entry object from a search result. */
function buildEntryFromResult(result, type) {
  const entry = {
    type,
    title: result.title || result.name || 'Unknown',
    year: null,
    metadata: {},
  };

  if (type === 'movie' || type === 'tv') {
    const dateStr = result.release_date || result.first_air_date;
    if (dateStr) entry.year = parseInt(dateStr.substring(0, 4));
    entry.metadata.overview = result.overview;
  } else if (type === 'game') {
    if (result.released) entry.year = parseInt(result.released.substring(0, 4));
    entry.metadata.overview = result.description_raw;
  } else if (type === 'boardgame') {
    entry.year = result.yearpublished;
    entry.metadata.overview = result.description;
  } else if (type === 'book') {
    if (result.publishedDate) entry.year = parseInt(result.publishedDate.substring(0, 4));
    entry.metadata.overview = result.description;
  }

  return entry;
}

function getTypeLabel(type) {
  const labels = {
    movie: 'Movie',
    tv: 'TV Show',
    game: 'Video Game',
    boardgame: 'Board Game',
    book: 'Book',
  };
  return labels[type] || type;
}

function buildVersusPrompt(firstTitle, secondTitle, firstEntry, secondEntry, customPrompt) {
  let promptBase = 'Original poster artwork inspired by';
  let promptDetails = '';

  if (firstEntry && secondEntry) {
    if (firstEntry.type === 'movie' && secondEntry.type === 'movie') {
      promptBase = 'Original movie poster artwork inspired by the themes of';
    } else if (firstEntry.type === 'tv' && secondEntry.type === 'tv') {
      promptBase = 'Original TV show poster artwork inspired by the themes of';
    } else if (firstEntry.type === 'game' && secondEntry.type === 'game') {
      promptBase = 'Original video game cover artwork inspired by the themes of';
    } else {
      const type1 = getTypeLabel(firstEntry.type).toLowerCase();
      const type2 = getTypeLabel(secondEntry.type).toLowerCase();
      promptBase = `Original artwork inspired by the themes of a ${type1} and a ${type2}`;
    }

    if (firstEntry.metadata?.overview) {
      promptDetails += ` Concept for first side: ${firstEntry.metadata.overview.substring(0, 100)}.`;
    }
    if (secondEntry.metadata?.overview) {
      promptDetails += ` Concept for second side: ${secondEntry.metadata.overview.substring(0, 100)}.`;
    }
  }

  return (
    `${promptBase} "${firstTitle}" and "${secondTitle}". IMPORTANT: Create a versus battle composition with strict ` +
    `left-right layout. LEFT HALF: "${firstTitle}" theme and imagery. CENTER: Bold "VS" text divider. RIGHT HALF: ` +
    `"${secondTitle}" theme and imagery. Split-screen battle poster with dramatic lighting, cinematic style, high ` +
    `contrast. Professional design, 4K quality. Do not replicate existing poster art - create something new ` +
    `inspired by these titles.${promptDetails}${customPrompt ? ` Additional details: ${customPrompt}` : ''}`
  );
}

async function generateAndPostImage(interaction, prompt, { size, embedTitle, filename, recordType, recordMeta }) {
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apis.openai.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-image-2', // OpenAI's latest image model (formerly dall-e-3)
      prompt,
      n: 1,
      size,
      quality: 'medium', // Options: 'low', 'medium', 'high', or 'auto'
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('[/image] OpenAI API Error:', error);
    throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
  }

  const data = await response.json();

  let imageBuffer;
  if (data.data && data.data[0]) {
    if (data.data[0].url) {
      const imageResponse = await fetch(data.data[0].url);
      if (!imageResponse.ok) throw new Error('Failed to download generated image');
      imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    } else if (data.data[0].b64_json) {
      imageBuffer = Buffer.from(data.data[0].b64_json, 'base64');
    } else {
      console.error('[/image] Unknown format:', data);
      throw new Error('Invalid response from OpenAI - unexpected format');
    }
  } else {
    console.error('[/image] Missing data array:', data);
    throw new Error('Invalid response from OpenAI - missing data');
  }

  recordImageGeneration(interaction.guildId, interaction.user.id, recordType, recordMeta);

  const embed = new EmbedBuilder()
    .setColor(0xFEE75C)
    .setTitle(embedTitle)
    .setImage(`attachment://${filename}`)
    .setFooter({ text: interaction.user.username })
    .setTimestamp();

  const attachment = new AttachmentBuilder(imageBuffer, { name: filename });

  await interaction.channel.send({ embeds: [embed], files: [attachment] });
  await interaction.editReply('✅ Image generated and posted to the channel!');
}

async function generateVersusFromSearch(interaction, title1, title2, customPrompt) {
  const [result1, result2] = await Promise.all([searchForTitleUniversal(title1), searchForTitleUniversal(title2)]);

  if (result1.status === 'none' || result2.status === 'none') {
    const notFound = [];
    if (result1.status === 'none') notFound.push(`**${title1}**`);
    if (result2.status === 'none') notFound.push(`**${title2}**`);

    await interaction.editReply({
      content:
        `❌ Could not find: ${notFound.join(', ')}\n\n` +
        `Please check spelling or try different search terms. The bot searches movies, TV shows, video games, board games, and books.`,
    });
    return;
  }

  let firstEntry, secondEntry;
  let disambiguationNote = '';

  if (result1.status === 'multiple') {
    firstEntry = buildEntryFromResult(result1.results[0], result1.results[0].searchType);
    const yearStr = firstEntry.year ? ` (${firstEntry.year})` : '';
    disambiguationNote += `\n📌 Multiple matches for "${title1}" - using: **${firstEntry.title}${yearStr}** (${getTypeLabel(firstEntry.type)})`;
    disambiguationNote += `\n   _Be more specific next time: \`title1:"${firstEntry.title} ${firstEntry.year}"\`_`;
  } else {
    firstEntry = result1.entry;
  }

  if (result2.status === 'multiple') {
    secondEntry = buildEntryFromResult(result2.results[0], result2.results[0].searchType);
    const yearStr = secondEntry.year ? ` (${secondEntry.year})` : '';
    disambiguationNote += `\n📌 Multiple matches for "${title2}" - using: **${secondEntry.title}${yearStr}** (${getTypeLabel(secondEntry.type)})`;
    disambiguationNote += `\n   _Be more specific next time: \`title2:"${secondEntry.title} ${secondEntry.year}"\`_`;
  } else {
    secondEntry = result2.entry;
  }

  const firstTitle = firstEntry.title;
  const secondTitle = secondEntry.title;

  if (disambiguationNote) {
    await interaction.editReply({
      content: `🔍 **Search Results:**${disambiguationNote}\n\n_Generating image in 2-3 minutes..._`,
    });
    await new Promise(resolve => setTimeout(resolve, 3000));
  } else {
    await interaction.editReply(`🎨 Generating AI image for **${firstTitle}** vs **${secondTitle}**...\n\n_This may take 2-3 minutes..._`);
  }

  const prompt = buildVersusPrompt(firstTitle, secondTitle, firstEntry, secondEntry, customPrompt);

  await generateAndPostImage(interaction, prompt, {
    size: '1792x1024',
    embedTitle: `🎨 ${firstTitle} vs ${secondTitle}`,
    filename: 'versus.png',
    recordType: 'versus-image',
    recordMeta: { title1: firstTitle, title2: secondTitle, customPrompt: customPrompt || null, type1: firstEntry.type, type2: secondEntry.type },
  });
}

async function generateVersusFromMatchup(interaction, matchupInput, customPrompt) {
  const tournament = bracketManager.loadTournament(interaction.guildId);

  if (!tournament) {
    await interaction.editReply('❌ No active tournament found. To generate a versus image, use: `/image title1:"Movie A" title2:"Movie B"`');
    return;
  }

  if (!tournament.knockoutBracket || tournament.knockoutBracket.length === 0) {
    await interaction.editReply('❌ No tournament matchups found. To generate a versus image, use: `/image title1:"Movie A" title2:"Movie B"`');
    return;
  }

  const matchup = tournament.knockoutBracket.find(m => {
    if (!m.movie1 || !m.movie2) return false;
    const matchupStr = `${m.movie1.title} vs ${m.movie2.title}`.toLowerCase();
    const reverseStr = `${m.movie2.title} vs ${m.movie1.title}`.toLowerCase();
    const input = matchupInput.toLowerCase();
    return (
      matchupStr.includes(input) ||
      reverseStr.includes(input) ||
      (input.includes(m.movie1.title.toLowerCase()) && input.includes(m.movie2.title.toLowerCase()))
    );
  });

  if (!matchup) {
    await interaction.editReply(
      `❌ Could not find matchup: "${matchupInput}". Use \`/image\` without parameters to see available matchups, or use: \`/image title1:"Movie A" title2:"Movie B"\``
    );
    return;
  }

  const firstTitle = matchup.movie1.title;
  const secondTitle = matchup.movie2.title;
  const context = `Tournament: ${matchup.round.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`;

  await interaction.editReply(`🎨 Generating AI image for **${firstTitle}** vs **${secondTitle}**...\n\n_This may take 2-3 minutes..._`);

  const prompt = buildVersusPrompt(firstTitle, secondTitle, null, null, customPrompt ? `${context}. ${customPrompt}` : context);

  await generateAndPostImage(interaction, prompt, {
    size: '1792x1024',
    embedTitle: `🎨 ${firstTitle} vs ${secondTitle}`,
    filename: 'bracket-vs.png',
    recordType: 'bracket-image',
    recordMeta: { title1: firstTitle, title2: secondTitle, customPrompt: customPrompt || null, matchup: matchupInput },
  });
}

async function generateFromMessage(interaction, messageInput) {
  let targetMessage = null;

  if (/^\d{17,19}$/.test(messageInput)) {
    targetMessage = await interaction.channel.messages.fetch(messageInput);
  } else {
    const messages = await interaction.channel.messages.fetch({ limit: 100 });
    const username = messageInput.toLowerCase();
    targetMessage = messages.find(
      msg =>
        msg.author.username.toLowerCase() === username ||
        msg.author.tag.toLowerCase() === username ||
        msg.author.displayName?.toLowerCase() === username
    );

    if (!targetMessage) {
      await interaction.editReply(`❌ Could not find a recent message from user "${messageInput}". Try using a message ID instead.`);
      return;
    }
  }

  if (!targetMessage.content || targetMessage.content.trim() === '') {
    await interaction.editReply('❌ The selected message has no text content to generate an image from.');
    return;
  }

  const finalPrompt = targetMessage.content;

  await interaction.editReply(
    `🎨 Generating image from **${targetMessage.author.username}**'s message...\n\n_Message: "${finalPrompt.substring(0, 200)}${finalPrompt.length > 200 ? '...' : ''}"_\n\n_This may take 2-3 minutes..._`
  );

  await generateAndPostImage(interaction, finalPrompt, {
    size: '1024x1024',
    embedTitle: '🎨 AI Generated Image',
    filename: 'ai-image.png',
    recordType: 'image',
    recordMeta: { prompt: finalPrompt.substring(0, 200), messageSource: messageInput },
  });
}

async function generateFromPrompt(interaction, prompt) {
  await interaction.editReply(`🎨 Generating image...\n\n_Prompt: "${prompt.substring(0, 200)}${prompt.length > 200 ? '...' : ''}"_\n\n_This may take 2-3 minutes..._`);

  await generateAndPostImage(interaction, prompt, {
    size: '1024x1024',
    embedTitle: '🎨 AI Generated Image',
    filename: 'ai-image.png',
    recordType: 'image',
    recordMeta: { prompt: prompt.substring(0, 200), messageSource: null },
  });
}

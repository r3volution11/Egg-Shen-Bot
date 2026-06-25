import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, AttachmentBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import * as bracketManager from '../utils/bracketManager.js';
import * as bracketVisualizer from '../utils/bracketVisualizer.js';
import { searchMovies, searchTVShows, getMovieDetails, getTVShowDetails } from '../services/tmdbService.js';
import { searchGames } from '../services/rawgService.js';
import { searchBoardGames } from '../services/bggService.js';
import { searchBooks } from '../services/googleBooksService.js';
import { config } from '../config.js';
import { canGenerateImage, recordImageGeneration } from '../utils/aiImageTracker.js';
import { isAdmin } from '../utils/guildConfig.js';

const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

export const data = new SlashCommandBuilder()
  .setName('bracket')
  .setDescription('Tournament bracket system for movie competitions')
  .addSubcommand(subcommand =>
    subcommand
      .setName('create')
      .setDescription('Create a new tournament (Admin/Mod only)')
      .addStringOption(option =>
        option
          .setName('name')
          .setDescription('Tournament name (e.g., "The Shudder Discord Gore Cup")')
          .setRequired(true)
      )
      .addIntegerOption(option =>
        option
          .setName('groups')
          .setDescription('Number of groups (4-12, each with 4 movies)')
          .setRequired(false)
          .setMinValue(4)
          .setMaxValue(12)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('add-group')
      .setDescription('Add 4 titles to a group (Admin/Mod only)')
      .addStringOption(option =>
        option
          .setName('group')
          .setDescription('Group letter (A-L)')
          .setRequired(true)
          .addChoices(...GROUP_LETTERS.map(letter => ({ name: `Group ${letter}`, value: letter })))
      )
      .addStringOption(option =>
        option
          .setName('type')
          .setDescription('Tournament type')
          .setRequired(true)
          .addChoices(
            { name: 'Movies', value: 'movie' },
            { name: 'TV Shows', value: 'tv' },
            { name: 'Video Games', value: 'game' },
            { name: 'Board Games', value: 'boardgame' },
            { name: 'Books', value: 'book' }
          )
      )
      .addStringOption(option =>
        option.setName('title1').setDescription('First title').setRequired(true)
      )
      .addStringOption(option =>
        option.setName('title2').setDescription('Second title').setRequired(true)
      )
      .addStringOption(option =>
        option.setName('title3').setDescription('Third title').setRequired(true)
      )
      .addStringOption(option =>
        option.setName('title4').setDescription('Fourth title').setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('open-groups')
      .setDescription('Open groups for voting (Admin/Mod only)')
      .addStringOption(option =>
        option
          .setName('groups')
          .setDescription('Groups to open (e.g., "A,B,C,D")')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('close-groups')
      .setDescription('Close group voting and calculate results (Admin/Mod only)')
      .addStringOption(option =>
        option
          .setName('groups')
          .setDescription('Groups to close (e.g., "A,B,C,D")')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('vote-group')
      .setDescription('Vote for your top 2 movies in a group')
      .addStringOption(option =>
        option
          .setName('group')
          .setDescription('Group letter')
          .setRequired(true)
          .addChoices(...GROUP_LETTERS.map(letter => ({ name: `Group ${letter}`, value: letter })))
      )
      .addIntegerOption(option =>
        option
          .setName('choice1')
          .setDescription('Your first choice (1-4)')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(4)
      )
      .addIntegerOption(option =>
        option
          .setName('choice2')
          .setDescription('Your second choice (1-4)')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(4)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('advance-knockout')
      .setDescription('Generate knockout bracket from group results (Admin/Mod only)')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('status')
      .setDescription('View tournament status and standings')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('view')
      .setDescription('View visual bracket (knockout phase only)')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('image')
      .setDescription('Generate AI image for any title vs title matchup')
      .addStringOption(option =>
        option
          .setName('title1')
          .setDescription('First title (movie, show, game, etc.)')
          .setRequired(false)
      )
      .addStringOption(option =>
        option
          .setName('title2')
          .setDescription('Second title to compare against')
          .setRequired(false)
      )
      .addStringOption(option =>
        option
          .setName('matchup')
          .setDescription('Or choose from active tournament matchups')
          .setRequired(false)
      )
      .addStringOption(option =>
        option
          .setName('prompt')
          .setDescription('Additional details for the image generation (optional)')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('cancel')
      .setDescription('Cancel the tournament (Admin/Mod only)')
  );

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();
  
  // Check admin/mod permissions for management commands
  const requiresAdmin = ['create', 'add-group', 'open-groups', 'close-groups', 'advance-knockout', 'cancel'];
  if (requiresAdmin.includes(subcommand)) {
    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
    const isMod = interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers);
    
    if (!isAdmin && !isMod) {
      await interaction.reply({
        content: '❌ Only administrators and moderators can manage tournaments.',
        ephemeral: true,
      });
      return;
    }
  }
  
  try {
    switch (subcommand) {
      case 'create':
        await handleCreate(interaction);
        break;
      case 'add-group':
        await handleAddGroup(interaction);
        break;
      case 'open-groups':
        await handleOpenGroups(interaction);
        break;
      case 'close-groups':
        await handleCloseGroups(interaction);
        break;
      case 'vote-group':
        await handleVoteGroup(interaction);
        break;
      case 'advance-knockout':
        await handleAdvanceKnockout(interaction);
        break;
      case 'status':
        await handleStatus(interaction);
        break;
      case 'view':
        await handleView(interaction);
        break;
      case 'image':
        await handleImage(interaction);
        break;
      case 'cancel':
        await handleCancel(interaction);
        break;
      default:
        await interaction.reply({ content: '❌ Unknown subcommand', ephemeral: true });
    }
  } catch (error) {
    console.error('Error in bracket command:', error);
    await interaction.reply({
      content: '❌ An error occurred. Please try again.',
      ephemeral: true,
    });
  }
}

async function handleCreate(interaction) {
  const name = interaction.options.getString('name');
  const groupCount = interaction.options.getInteger('groups') || 8; // Default to 8 groups
  const guildId = interaction.guildId;
  
  // Check if tournament already exists
  const existing = bracketManager.loadTournament(guildId);
  if (existing && existing.status !== 'completed' && existing.status !== 'cancelled') {
    await interaction.reply({
      content: `❌ A tournament "${existing.name}" is already in progress. Cancel it first to create a new one.`,
      ephemeral: true,
    });
    return;
  }
  
  const tournament = bracketManager.createTournament(guildId, name, interaction.user.id, groupCount);
  
  if (!tournament) {
    await interaction.reply({
      content: '❌ Failed to create tournament.',
      ephemeral: true,
    });
    return;
  }
  
  const totalMovies = groupCount * 4;
  const embed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle(`🏆 ${name}`)
    .setDescription(`Tournament created! Now add movies to ${groupCount} groups.`)
    .addFields(
      { name: 'Status', value: 'Setup', inline: true },
      { name: 'Groups', value: `0/${groupCount}`, inline: true },
      { name: 'Total Movies', value: `${totalMovies}`, inline: true },
      { name: 'Creator', value: `<@${interaction.user.id}>`, inline: false }
    )
    .setFooter({ text: 'Use /bracket add-group to add movies' });
  
  await interaction.reply({ embeds: [embed] });
}

async function handleAddGroup(interaction) {
  await interaction.deferReply();
  
  const group = interaction.options.getString('group');
  const type = interaction.options.getString('type');
  const titles = [
    interaction.options.getString('title1'),
    interaction.options.getString('title2'),
    interaction.options.getString('title3'),
    interaction.options.getString('title4'),
  ];
  
  // Search for each title and build rich entries
  const searchResults = await Promise.all(
    titles.map(async (title) => await searchForTitle(title, type))
  );
  
  // Check if any searches returned multiple results (need clarification)
  const needsClarification = searchResults.some(r => r.status === 'multiple');
  
  if (needsClarification) {
    // Build a list of titles that need clarification
    const ambiguousTitles = searchResults
      .map((r, idx) => r.status === 'multiple' ? `**${titles[idx]}** (${r.count} matches)` : null)
      .filter(t => t !== null)
      .join(', ');
    
    await interaction.editReply({
      content: `❌ Some titles have multiple matches: ${ambiguousTitles}\n\n` +
        `Please be more specific with these titles (include year or more details).`,
      ephemeral: true,
    });
    return;
  }
  
  // Check if any searches failed (no results)
  const failed = searchResults.some(r => r.status === 'none');
  
  if (failed) {
    const notFoundTitles = searchResults
      .map((r, idx) => r.status === 'none' ? `**${titles[idx]}**` : null)
      .filter(t => t !== null)
      .join(', ');
    
    await interaction.editReply({
      content: `❌ Could not find these titles: ${notFoundTitles}\n\n` +
        `Please check spelling or try different search terms.`,
      ephemeral: true,
    });
    return;
  }
  
  // All titles have exactly one match - build the entries array
  const entries = searchResults.map(r => r.entry);
  
  const result = bracketManager.addGroupMovies(interaction.guildId, group, type, entries);
  
  if (!result.success) {
    await interaction.editReply({
      content: `❌ ${result.error}`,
    });
    return;
  }
  
  const groupsComplete = Object.keys(result.tournament.groups).length;
  const totalGroups = result.tournament.groupCount;
  
  const embed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle(`Group ${group} Added (${getTypeLabel(type)})`)
    .setDescription(entries.map((entry, i) => {
      const yearStr = entry.year ? ` (${entry.year})` : '';
      return `${i + 1}. ${entry.title}${yearStr}`;
    }).join('\n'))
    .addFields(
      { name: 'Progress', value: `${groupsComplete}/${totalGroups} groups added`, inline: true }
    )
    .setFooter({ text: groupsComplete === totalGroups ? 'All groups added! Use /bracket open-groups to start voting.' : 'Add more groups with /bracket add-group' });
  
  await interaction.editReply({ embeds: [embed] });
}

/**
 * Search for a title using the appropriate service based on type
 * Returns: { status: 'found'|'multiple'|'none', entry: {...}, count: number }
 */
async function searchForTitle(title, type) {
  try {
    let results = [];
    
    switch (type) {
      case 'movie':
        results = await searchMovies(title);
        break;
      case 'tv':
        results = await searchTVShows(title);
        break;
      case 'game':
        results = await searchGames(title);
        break;
      case 'boardgame':
        results = await searchBoardGames(title);
        break;
      case 'book':
        results = await searchBooks(title);
        break;
    }
    
    if (!results || results.length === 0) {
      return { status: 'none', entry: null, count: 0 };
    }
    
    if (results.length > 1) {
      return { status: 'multiple', entry: null, count: results.length };
    }
    
    // Exactly one result - build entry object
    const result = results[0];
    const entry = buildEntryFromResult(result, type);
    
    return { status: 'found', entry, count: 1 };
  } catch (error) {
    console.error(`[Bracket] Error searching for "${title}" (${type}):`, error);
    return { status: 'none', entry: null, count: 0 };
  }
}

/**
 * Build a tournament entry object from a search result
 */
function buildEntryFromResult(result, type) {
  const entry = {
    type,
    title: result.title || result.name || result.Name || result.volumeInfo?.title || 'Unknown',
    id: null,
    year: null,
    posterUrl: null,
    metadata: {},
  };
  
  // Extract type-specific data
  if (type === 'movie') {
    entry.id = result.id;
    entry.year = result.release_date?.split('-')[0];
    entry.posterUrl = result.poster_path ? `https://image.tmdb.org/t/p/w500${result.poster_path}` : null;
    entry.metadata = {
      overview: result.overview,
      vote_average: result.vote_average,
    };
  } else if (type === 'tv') {
    entry.id = result.id;
    entry.year = result.first_air_date?.split('-')[0];
    entry.posterUrl = result.poster_path ? `https://image.tmdb.org/t/p/w500${result.poster_path}` : null;
    entry.metadata = {
      overview: result.overview,
      vote_average: result.vote_average,
    };
  } else if (type === 'game') {
    entry.id = result.id;
    entry.year = result.released?.split('-')[0];
    entry.posterUrl = result.background_image;
    entry.metadata = {
      rating: result.rating,
      platforms: result.platforms?.map(p => p.platform.name),
    };
  } else if (type === 'boardgame') {
    entry.id = result.id;
    entry.year = result.YearPublished;
    entry.posterUrl = result.thumbnail;
    entry.metadata = {
      minPlayers: result.MinPlayers,
      maxPlayers: result.MaxPlayers,
    };
  } else if (type === 'book') {
    entry.id = result.id;
    entry.year = result.volumeInfo?.publishedDate?.split('-')[0];
    entry.posterUrl = result.volumeInfo?.imageLinks?.thumbnail;
    entry.metadata = {
      authors: result.volumeInfo?.authors,
      pageCount: result.volumeInfo?.pageCount,
    };
  }
  
  return entry;
}

/**
 * Get human-readable label for type
 */
function getTypeLabel(type) {
  const labels = {
    movie: 'Movies',
    tv: 'TV Shows',
    game: 'Video Games',
    boardgame: 'Board Games',
    book: 'Books',
  };
  return labels[type] || type;
}

/**
 * Search for a title across ALL APIs (universal search)
 * Returns: { status: 'found'|'multiple'|'none', entry: {...}, results: [], count: number }
 */
async function searchForTitleUniversal(title) {
  try {
    const allResults = [];
    
    // Search movies
    const movies = await searchMovies(title);
    if (movies && movies.length > 0) {
      movies.forEach(m => allResults.push({ ...m, searchType: 'movie' }));
    }
    
    // Search TV shows
    const tvShows = await searchTVShows(title);
    if (tvShows && tvShows.length > 0) {
      tvShows.forEach(tv => allResults.push({ ...tv, searchType: 'tv' }));
    }
    
    // Search video games
    const games = await searchGames(title);
    if (games && games.length > 0) {
      games.forEach(g => allResults.push({ ...g, searchType: 'game' }));
    }
    
    // Search board games
    const boardGames = await searchBoardGames(title);
    if (boardGames && boardGames.length > 0) {
      boardGames.forEach(bg => allResults.push({ ...bg, searchType: 'boardgame' }));
    }
    
    // Search books
    const books = await searchBooks(title);
    if (books && books.length > 0) {
      books.forEach(b => allResults.push({ ...b, searchType: 'book' }));
    }
    
    if (allResults.length === 0) {
      return { status: 'none', entry: null, results: [], count: 0 };
    }
    
    if (allResults.length > 1) {
      return { status: 'multiple', entry: null, results: allResults, count: allResults.length };
    }
    
    // Exactly one result - build entry object
    const result = allResults[0];
    const entry = buildEntryFromResult(result, result.searchType);
    
    return { status: 'found', entry, results: allResults, count: 1 };
  } catch (error) {
    console.error(`[Bracket Image] Error searching for "${title}":`, error);
    return { status: 'none', entry: null, results: [], count: 0 };
  }
}

async function handleOpenGroups(interaction) {
  await interaction.deferReply();
  
  const groupsStr = interaction.options.getString('groups');
  const groupIds = groupsStr.split(',').map(g => g.trim().toUpperCase());
  
  const result = bracketManager.openGroupVoting(interaction.guildId, groupIds);
  
  if (!result.success) {
    await interaction.editReply(`❌ ${result.error}`);
    return;
  }
  
  const embed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle(`📊 Voting Opened for Groups ${groupIds.join(', ')}`)
    .setDescription('Members can now vote for their top 2 movies in each group!')
    .setFooter({ text: 'Vote using /bracket vote-group • Voting open for 24+ hours' });
  
  // Show each group's movies
  groupIds.forEach(groupId => {
    const group = result.tournament.groups[groupId];
    if (group) {
      const movieList = group.movies.map((m, i) => `${i + 1}. ${m.title}`).join('\n');
      embed.addFields({ name: `Group ${groupId}`, value: movieList, inline: true });
    }
  });
  
  await interaction.editReply({ embeds: [embed] });
}

async function handleVoteGroup(interaction) {
  const group = interaction.options.getString('group');
  const choice1 = interaction.options.getInteger('choice1') - 1; // Convert to 0-indexed
  const choice2 = interaction.options.getInteger('choice2') - 1;
  
  if (choice1 === choice2) {
    await interaction.reply({
      content: '❌ You must choose 2 different movies.',
      ephemeral: true,
    });
    return;
  }
  
  const result = bracketManager.voteGroupStage(
    interaction.guildId,
    interaction.user.id,
    group,
    [choice1, choice2]
  );
  
  if (!result.success) {
    await interaction.reply({
      content: `❌ ${result.error}`,
      ephemeral: true,
    });
    return;
  }
  
  const groupData = result.tournament.groups[group];
  const votedMovies = [choice1, choice2].map(i => groupData.movies[i].title);
  
  await interaction.reply({
    content: `✅ Vote recorded for Group ${group}!\n\nYour choices:\n1. ${votedMovies[0]}\n2. ${votedMovies[1]}\n\nYou can change your vote anytime before voting closes.`,
    ephemeral: true,
  });
}

async function handleCloseGroups(interaction) {
  await interaction.deferReply();
  
  const groupsStr = interaction.options.getString('groups');
  const groupIds = groupsStr.split(',').map(g => g.trim().toUpperCase());
  
  const result = bracketManager.closeGroupVoting(interaction.guildId, groupIds);
  
  if (!result.success) {
    await interaction.editReply(`❌ ${result.error}`);
    return;
  }
  
  const embed = new EmbedBuilder()
    .setColor(0xFF9900)
    .setTitle(`🏁 Group ${groupIds.join(', ')} Results`)
    .setDescription('Voting closed! Here are the results:');
  
  groupIds.forEach(groupId => {
    const groupResult = result.tournament.groupResults[groupId];
    if (groupResult) {
      const resultText = [
        `🥇 **${groupResult.first.title}** (${groupResult.first.voteCount} votes)`,
        `🥈 **${groupResult.second.title}** (${groupResult.second.voteCount} votes)`,
        groupResult.third ? `🥉 **${groupResult.third.title}** (${groupResult.third.voteCount} votes)` : '',
      ].filter(Boolean).join('\n');
      
      embed.addFields({ name: `Group ${groupId}`, value: resultText, inline: false });
    }
  });
  
  const wildcardsNeeded = Math.pow(2, Math.ceil(Math.log2(result.tournament.groupCount * 2))) - (result.tournament.groupCount * 2);
  embed.setFooter({ text: wildcardsNeeded > 0 ? `Top 2 advance automatically • Best ${wildcardsNeeded} third-place finishers will be wildcards` : 'Top 2 advance automatically to knockout stage' });
  
  await interaction.editReply({ embeds: [embed] });
}

async function handleAdvanceKnockout(interaction) {
  await interaction.deferReply();
  
  // Calculate wildcards
  const wildcardsResult = bracketManager.calculateWildcards(interaction.guildId);
  if (!wildcardsResult.success) {
    await interaction.editReply(`❌ ${wildcardsResult.error}`);
    return;
  }
  
  // Generate bracket
  const bracketResult = bracketManager.generateKnockoutBracket(interaction.guildId);
  if (!bracketResult.success) {
    await interaction.editReply(`❌ ${bracketResult.error}`);
    return;
  }
  
  const totalParticipants = bracketResult.matchups.length * 2;
  const roundName = bracketResult.tournament.phase.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  const wildcardsCount = wildcardsResult.wildcards.length;
  
  const embed = new EmbedBuilder()
    .setColor(0xFF0000)
    .setTitle(`🏆 ${roundName} - Knockout Stage Begins!`)
    .setDescription(`**${bracketResult.matchups.length} matchups created**\n\nThe tournament advances to single elimination!`);
  
  // Show wildcards if any
  if (wildcardsCount > 0) {
    const wildcardsText = wildcardsResult.wildcards
      .map((w, i) => `${i + 1}. ${w.title} (${w.voteCount} votes, Group ${w.groupId})`)
      .join('\n');
    
    embed.addFields({ name: `🎟️ Wildcards (Best ${wildcardsCount} Third-Place)`, value: wildcardsText, inline: false });
  }
  
  embed.setFooter({ text: `${totalParticipants} movies remain • Use /bracket status to view bracket` });
  
  await interaction.editReply({ embeds: [embed] });
}

async function handleStatus(interaction) {
  await interaction.deferReply();
  
  const result = bracketManager.getTournamentStatus(interaction.guildId);
  
  if (!result.success) {
    await interaction.editReply('❌ No active tournament found.');
    return;
  }
  
  const tournament = result.tournament;
  
  const embed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle(`🏆 ${tournament.name}`)
    .addFields(
      { name: 'Status', value: tournament.status, inline: true },
      { name: 'Phase', value: tournament.phase, inline: true },
      { name: 'Creator', value: `<@${tournament.creatorId}>`, inline: true }
    );
  
  if (tournament.status === 'setup') {
    const groupsAdded = Object.keys(tournament.groups).length;
    embed.setDescription(`Tournament is being set up.\n\n**Groups Added:** ${groupsAdded}/${tournament.groupCount}`);
  } else if (tournament.status === 'group_stage') {
    const openGroups = Object.entries(tournament.groups)
      .filter(([_, g]) => g.status === 'voting')
      .map(([id, _]) => id)
      .join(', ');
    const closedGroups = Object.keys(tournament.groupResults).length;
    
    embed.setDescription(`Group stage in progress!\n\n**Open for voting:** ${openGroups || 'None'}\n**Completed:** ${closedGroups}/${tournament.groupCount} groups`);
  } else if (tournament.status === 'knockout') {
    const currentRound = tournament.phase.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const openMatchups = tournament.knockoutBracket.filter(m => m.status === 'voting').length;
    const closedMatchups = Object.keys(tournament.knockoutResults).length;
    
    embed.setDescription(`**${currentRound}**\n\nSingle elimination bracket\n\n**Open matchups:** ${openMatchups}\n**Completed:** ${closedMatchups}`);
  } else if (tournament.status === 'completed') {
    embed.setDescription(`🎉 **Tournament Complete!**\n\n**Winner:** ${tournament.winner.title}`);
  }
  
  await interaction.editReply({ embeds: [embed] });
}

async function handleView(interaction) {
  await interaction.deferReply();
  
  const tournament = bracketManager.loadTournament(interaction.guildId);
  
  if (!tournament) {
    await interaction.editReply('❌ No active tournament found.');
    return;
  }
  
  // Check if tournament is in knockout phase
  if (tournament.status !== 'knockout' && tournament.status !== 'completed') {
    await interaction.editReply('❌ Visual bracket is only available during the knockout phase. Complete the group stage first using `/bracket advance-knockout`.');
    return;
  }
  
  if (!tournament.knockoutBracket || tournament.knockoutBracket.length === 0) {
    await interaction.editReply('❌ No knockout bracket data available.');
    return;
  }
  
  try {
    // Generate bracket image
    const imageBuffer = await bracketVisualizer.generateBracketImage(tournament);
    
    // Create attachment
    const attachment = new AttachmentBuilder(imageBuffer, { 
      name: 'bracket.png',
      description: `${tournament.name} - Tournament Bracket`
    });
    
    // Create embed
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`🏆 ${tournament.name} - Bracket View`)
      .setDescription(`**Phase:** ${tournament.phase.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}\n**Participants:** ${tournament.knockoutBracket.length * 2}`)
      .setImage('attachment://bracket.png')
      .setFooter({ text: 'Use /bracket status for detailed standings' })
      .setTimestamp();
    
    await interaction.editReply({ 
      embeds: [embed],
      files: [attachment]
    });
    
  } catch (error) {
    console.error('Error generating bracket view:', error);
    await interaction.editReply('❌ Failed to generate bracket visualization. Error: ' + error.message);
  }
}

async function handleImage(interaction) {
  // Defer with ephemeral to hide command from other users
  await interaction.deferReply({ ephemeral: true });
  
  // Check rate limits
  const userIsAdmin = await isAdmin(interaction.member);
  const rateCheck = canGenerateImage(interaction.guildId, interaction.user.id, userIsAdmin);
  
  if (!rateCheck.allowed) {
    return await interaction.editReply(`❌ ${rateCheck.reason}`);
  }
  
  const title1 = interaction.options.getString('title1');
  const title2 = interaction.options.getString('title2');
  const customPrompt = interaction.options.getString('prompt');
  const matchupInput = interaction.options.getString('matchup');
  
  // Check if OpenAI is configured first
  if (!config.apis.openai?.apiKey) {
    await interaction.editReply('❌ OpenAI API is not configured. AI image generation requires an OpenAI API key.');
    return;
  }
  
  let firstTitle, secondTitle, firstEntry, secondEntry, context = null;
  
  // OPTION 1: User provided title1 and title2 (freeform generation with search)
  if (title1 && title2) {
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
    
    firstTitle = firstEntry.title;
    secondTitle = secondEntry.title;
    
    const type1Label = getTypeLabel(firstEntry.type);
    const type2Label = getTypeLabel(secondEntry.type);
    const year1 = firstEntry.year ? ` (${firstEntry.year})` : '';
    const year2 = secondEntry.year ? ` (${secondEntry.year})` : '';
    
    context = `${type1Label}${year1} vs ${type2Label}${year2}`;
    
    // Show disambiguation note if needed
    if (disambiguationNote) {
      await interaction.editReply({
        content: `🔍 **Search Results:**${disambiguationNote}\n\n_Generating image in 2-3 minutes..._`,
      });
      // Wait a moment so user can read the message
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
  // OPTION 2: User provided a matchup from tournament
  } else if (matchupInput) {
    const tournament = bracketManager.loadTournament(interaction.guildId);
    
    if (!tournament) {
      await interaction.editReply('❌ No active tournament found. To generate a custom image, use: `/bracket image title1:"Movie A" title2:"Movie B"`');
      return;
    }
    
    if (!tournament.knockoutBracket || tournament.knockoutBracket.length === 0) {
      await interaction.editReply('❌ No tournament matchups found. To generate a custom image, use: `/bracket image title1:"Movie A" title2:"Movie B"`');
      return;
    }
    
    // Find the matchup based on user input
    const matchup = tournament.knockoutBracket.find(m => {
      if (!m.movie1 || !m.movie2) return false;
      const matchupStr = `${m.movie1.title} vs ${m.movie2.title}`.toLowerCase();
      const reverseStr = `${m.movie2.title} vs ${m.movie1.title}`.toLowerCase();
      const input = matchupInput.toLowerCase();
      return matchupStr.includes(input) || reverseStr.includes(input) || 
             input.includes(m.movie1.title.toLowerCase()) && input.includes(m.movie2.title.toLowerCase());
    });
    
    if (!matchup) {
      await interaction.editReply(`❌ Could not find matchup: "${matchupInput}". Use \`/bracket image\` without parameters to see available matchups, or use: \`/bracket image title1:"Movie A" title2:"Movie B"\``);
      return;
    }
    
    firstTitle = matchup.movie1.title;
    secondTitle = matchup.movie2.title;
    context = `Tournament: ${matchup.round.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`;
    
  // OPTION 3: No parameters - show help
  } else {
    const tournament = bracketManager.loadTournament(interaction.guildId);
    
    let helpMessage = '🎨 **AI Image Generation**\n\n';
    
    // If there's an active tournament with matchups, show them
    if (tournament && tournament.knockoutBracket && tournament.knockoutBracket.length > 0) {
      const matchupList = tournament.knockoutBracket
        .filter(m => m.movie1 && m.movie2)
        .map((m, idx) => `${idx + 1}. **${m.movie1.title}** vs **${m.movie2.title}** (${m.round.replace(/_/g, ' ')})`)
        .join('\n');
      
      helpMessage += `**Tournament Matchups:**\n${matchupList}\n\n💡 Generate an image:\n\`/bracket image matchup:"Movie A vs Movie B"\`\n\n`;
    }
    
    helpMessage += '**Create custom matchups with smart search:**\n\`/bracket image title1:"The Thing" title2:"Alien"\`\n\n';
    helpMessage += '✨ **Features:**\n';
    helpMessage += '• Searches movies, TV shows, video games, board games, and books\n';
    helpMessage += '• Validates titles exist before generating\n';
    helpMessage += '• Shows selection menu if multiple matches found\n';
    helpMessage += '• Works with cross-type comparisons (e.g., book vs movie)\n';
    helpMessage += '• Generates in 2-3 minutes ($0.04 per image)\n\n';
    helpMessage += '_No tournament needed - works anytime!_';
    
    await interaction.editReply({ content: helpMessage });
    return;
  }
  
  // Generate the AI image
  try {
    // Create a dramatic prompt with type-specific context
    // Use "inspired by" language to comply with OpenAI content policy
    let promptBase = 'Original poster artwork inspired by';
    let promptDetails = '';
    
    // Add type-specific context if we have metadata
    if (firstEntry && secondEntry) {
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
    } else {
      promptBase = 'Original poster artwork inspired by';
    }
    
    const prompt = `${promptBase} "${firstTitle}" and "${secondTitle}". IMPORTANT: Create a versus battle composition with strict left-right layout. LEFT HALF: "${firstTitle}" theme and imagery. CENTER: Bold "VS" text divider. RIGHT HALF: "${secondTitle}" theme and imagery. Split-screen battle poster with dramatic lighting, cinematic style, high contrast. Professional design, 4K quality. Do not replicate existing poster art - create something new inspired by these titles.${promptDetails}${customPrompt ? ` Additional details: ${customPrompt}` : ''}`;
    
    // Log request details for debugging
    console.log(`[/bracket image] User: ${interaction.user.username} (${interaction.user.id})`);
    console.log(`[/bracket image] Guild: ${interaction.guildId}`);
    console.log(`[/bracket image] Title 1: "${firstTitle}" (${firstEntry?.type || 'unknown'})`);
    console.log(`[/bracket image] Title 2: "${secondTitle}" (${secondEntry?.type || 'unknown'})`);
    console.log(`[/bracket image] Custom prompt: ${customPrompt || 'none'}`);
    console.log(`[/bracket image] Generated prompt: ${prompt.substring(0, 300)}...`);
    
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
      console.error(`[/bracket image] OpenAI API Error:`, error);
      throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
    }
    
    const data = await response.json();
    console.log('[/bracket image] OpenAI Response:', JSON.stringify(data, null, 2));
    
    // Check for different response formats
    let imageBuffer;
    if (data.data && data.data[0]) {
      if (data.data[0].url) {
        console.log('[/bracket image] Found URL, downloading...');
        const imageUrl = data.data[0].url;
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
          throw new Error('Failed to download generated image');
        }
        imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
      } else if (data.data[0].b64_json) {
        console.log('[/bracket image] Received base64 data, converting to buffer...');
        imageBuffer = Buffer.from(data.data[0].b64_json, 'base64');
      } else {
        console.error('[/bracket image] Unknown format:', data);
        throw new Error('Invalid response from OpenAI - unexpected format');
      }
    } else {
      console.error('[/bracket image] Missing data array:', data);
      throw new Error('Invalid response from OpenAI - missing data');
    }
    
    // Record the image generation
    recordImageGeneration(interaction.guildId, interaction.user.id, 'bracket-image', {
      title1: firstTitle,
      title2: secondTitle,
      customPrompt: customPrompt || null,
      type1: firstEntry?.type || null,
      type2: secondEntry?.type || null,
    });
    
    // Create embed with the generated image
    const embed = new EmbedBuilder()
      .setColor(0xFEE75C)
      .setTitle(`🎨 ${firstTitle} vs ${secondTitle}`)
      .setImage('attachment://bracket-vs.png')
      .setFooter({ text: interaction.user.username })
      .setTimestamp();
    
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'bracket-vs.png' });
    
    // Send the image publicly to the channel
    await interaction.channel.send({
      embeds: [embed],
      files: [attachment]
    });
    
    // Update the ephemeral reply to confirm
    await interaction.editReply('✅ Image generated and posted to the channel!');
    
  } catch (error) {
    console.error('[/bracket image] Error generating AI image:', error);
    await interaction.editReply(`❌ Failed to generate AI image: ${error.message}`);
  }
}

async function handleCancel(interaction) {
  const result = bracketManager.cancelTournament(interaction.guildId);
  
  if (!result.success) {
    await interaction.reply({
      content: `❌ ${result.error}`,
      ephemeral: true,
    });
    return;
  }
  
  await interaction.reply({
    content: `❌ Tournament "${result.tournament.name}" has been cancelled.`,
  });
}

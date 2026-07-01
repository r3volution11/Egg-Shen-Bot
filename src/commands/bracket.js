import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, AttachmentBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import * as bracketManager from '../utils/bracketManager.js';
import * as bracketVisualizer from '../utils/bracketVisualizer.js';
import { searchMovies, searchTVShows, getMovieDetails, getTVShowDetails } from '../services/tmdbService.js';
import { searchGames } from '../services/rawgService.js';
import { searchBoardGames } from '../services/bggService.js';
import { searchBooks } from '../services/googleBooksService.js';
import { hybridSearch } from '../services/aiService.js';
import { createSearchResults } from '../utils/embedBuilder.js';
import { loadGuildConfig, isTrueAdmin, isModerator } from '../utils/guildConfig.js';
import { config } from '../config.js';
import { canGenerateImage, recordImageGeneration } from '../utils/aiImageTracker.js';
import { isAdmin } from '../utils/guildConfig.js';

const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

// Temporary storage for custom images during selection process
export const customImageCache = new Map();

/**
 * Parse duration string (e.g., "24h", "3d", "45m") to milliseconds
 * @param {string} durationStr - Duration string
 * @returns {number|null} Duration in milliseconds, or null if invalid
 */
function parseDuration(durationStr) {
  if (!durationStr) return null;
  
  const match = durationStr.match(/^(\d+)([mhd])$/i);
  if (!match) return null;
  
  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  
  const multipliers = {
    'm': 60 * 1000,        // minutes
    'h': 60 * 60 * 1000,   // hours
    'd': 24 * 60 * 60 * 1000  // days
  };
  
  return value * multipliers[unit];
}

/**
 * Validate duration is within allowed range (5 minutes to 30 days)
 * @param {number} durationMs - Duration in milliseconds
 * @returns {boolean}
 */
function isValidDuration(durationMs) {
  const MIN_DURATION = 5 * 60 * 1000; // 5 minutes
  const MAX_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days
  return durationMs >= MIN_DURATION && durationMs <= MAX_DURATION;
}

/**
 * Format time remaining until deadline
 * @param {number} deadline - Timestamp in milliseconds
 * @returns {string} Formatted string like "23h 45m" or "2d 5h"
 */
function formatTimeRemaining(deadline) {
  const now = Date.now();
  const remaining = deadline - now;
  
  if (remaining <= 0) return 'Voting closed';
  
  const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
  const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
  
  if (days > 0) {
    return `${days}d ${hours}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

/**
 * Get regional label for a matchup (e.g., "1A", "2C")
 * @param {number} position - Matchup position (0-based)
 * @param {string} round - Round name
 * @returns {string} Regional label
 */
function getRegionalLabel(position, round) {
  // Finals has no region
  if (round === 'finals') {
    return 'Finals';
  }
  
  // Determine total matchups in this round
  const roundSizes = {
    'round_of_32': 16,
    'round_of_16': 8,
    'quarterfinals': 4,
    'semifinals': 2
  };
  
  const totalMatchups = roundSizes[round];
  if (!totalMatchups) return String(position + 1);
  
  // Left region: positions 0 to (totalMatchups/2 - 1)
  // Right region: positions (totalMatchups/2) to (totalMatchups - 1)
  const midpoint = totalMatchups / 2;
  const isLeftRegion = position < midpoint;
  const region = isLeftRegion ? '1' : '2';
  
  // Letter within region (A, B, C, D...)
  const positionInRegion = isLeftRegion ? position : position - midpoint;
  const letter = String.fromCharCode(65 + positionInRegion); // 65 = 'A'
  
  return `${region}${letter}`;
}

/**
 * Parse regional label to position (e.g., "1A" → 0, "2B" → 5 in Round of 16)
 * @param {string} label - Regional label like "1A" or "2C"
 * @param {string} round - Round name
 * @returns {number|null} Position or null if invalid
 */
function parseRegionalLabel(label, round) {
  if (label === 'Finals' || label === 'finals') return 0;
  
  const match = label.match(/^([12])([A-Z])$/i);
  if (!match) return null;
  
  const region = parseInt(match[1]);
  const letter = match[2].toUpperCase();
  const letterIndex = letter.charCodeAt(0) - 65; // A=0, B=1, etc.
  
  const roundSizes = {
    'round_of_32': 16,
    'round_of_16': 8,
    'quarterfinals': 4,
    'semifinals': 2
  };
  
  const totalMatchups = roundSizes[round];
  if (!totalMatchups) return null;
  
  const midpoint = totalMatchups / 2;
  
  // Validate letter is within range for this region
  if (letterIndex < 0 || letterIndex >= midpoint) return null;
  
  // Calculate position
  if (region === 1) {
    return letterIndex; // Left region: 0-based from start
  } else if (region === 2) {
    return midpoint + letterIndex; // Right region: offset by midpoint
  }
  
  return null;
}

export const data = new SlashCommandBuilder()
  .setName('bracket')
  .setDescription('🏆 Tournament system - Click buttons to vote, track standings, export results')
  .addSubcommand(subcommand =>
    subcommand
      .setName('help')
      .setDescription('📖 View tournament guide and command overview')
  )
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
      .setName('add-title')
      .setDescription('Add a title to a group (Admin/Mod only)')
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
        option.setName('title').setDescription('Title to search for and add').setRequired(true)
      )
      .addAttachmentOption(option =>
        option
          .setName('image')
          .setDescription('Optional: Custom image for this title (overrides API poster)')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('remove-title')
      .setDescription('Remove a title from a group (Admin/Mod only)')
      .addStringOption(option =>
        option
          .setName('group')
          .setDescription('Group letter (A-L)')
          .setRequired(true)
          .addChoices(...GROUP_LETTERS.map(letter => ({ name: `Group ${letter}`, value: letter })))
      )
      .addIntegerOption(option =>
        option
          .setName('position')
          .setDescription('Position of title to remove (1-4)')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(4)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('announce')
      .setDescription('Announce the tournament to the channel (Admin/Mod only)')
      .addStringOption(option =>
        option
          .setName('message')
          .setDescription('Announcement message to the server')
          .setRequired(false)
      )
      .addAttachmentOption(option =>
        option
          .setName('image')
          .setDescription('Optional tournament banner/image')
          .setRequired(false)
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
      .addStringOption(option =>
        option
          .setName('duration')
          .setDescription('Voting duration (e.g., "24h", "3d", "45m") - Default: 24h, Range: 5m-30d')
          .setRequired(false)
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
      .setName('advance-knockout')
      .setDescription('Generate knockout bracket from group results (Admin/Mod only)')
      .addStringOption(option =>
        option
          .setName('duration')
          .setDescription('How long voting stays open (e.g., "24h", "3d", "45m") - Default: 24h')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('regenerate')
      .setDescription('Regenerate knockout bracket tree structure (fixes bracket issues)')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('open-knockout')
      .setDescription('Open ALL matchups in current knockout round (use round-specific commands for clarity)')
      .addStringOption(option =>
        option
          .setName('duration')
          .setDescription('Voting duration (e.g., "24h", "3d", "45m") - Default: 24h, Range: 5m-30d')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('close-knockout')
      .setDescription('Close current round and advance winners (use round-specific commands for clarity)')
  )
  // Round-specific aliases for common rounds (Round of 16 uses open-knockout)
  .addSubcommand(subcommand =>
    subcommand
      .setName('open-quarters')
      .setDescription('Open Quarterfinals matchups (4 matchups)')
      .addStringOption(option =>
        option
          .setName('duration')
          .setDescription('Voting duration (e.g., "24h", "3d", "45m") - Default: 24h, Range: 5m-30d')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('close-quarters')
      .setDescription('Close Quarterfinals and advance to Semifinals')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('open-semis')
      .setDescription('Open Semifinals matchups (2 matchups)')
      .addStringOption(option =>
        option
          .setName('duration')
          .setDescription('Voting duration (e.g., "24h", "3d", "45m") - Default: 24h, Range: 5m-30d')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('close-semis')
      .setDescription('Close Semifinals and advance to Finals')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('open-finals')
      .setDescription('Open the Finals matchup (1 matchup)')
      .addStringOption(option =>
        option
          .setName('duration')
          .setDescription('Voting duration (e.g., "24h", "3d", "45m") - Default: 24h, Range: 5m-30d')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('close-finals')
      .setDescription('Close Finals and declare tournament winner!')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('open-matchup')
      .setDescription('Open matchup(s) for voting (Admin/Mod only)')
      .addStringOption(option =>
        option
          .setName('matchup')
          .setDescription('Matchup ID (e.g., "1A", "2B", "1A,1B,1C") - Leave blank to select from buttons')
          .setRequired(false)
      )
      .addStringOption(option =>
        option
          .setName('duration')
          .setDescription('Voting duration (e.g., "24h", "3d", "45m") - Default: 24h, Range: 5m-30d')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('close-matchup')
      .setDescription('Close matchup(s) and advance winner(s) (Admin/Mod only)')
      .addStringOption(option =>
        option
          .setName('matchup')
          .setDescription('Matchup ID(s) - Single: "1A" or Multiple: "1A,1B,2C". Leave blank to select from buttons')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('extend-voting')
      .setDescription('Extend or change voting deadline (Admin/Mod only)')
      .addStringOption(option =>
        option
          .setName('type')
          .setDescription('Voting type to extend')
          .setRequired(true)
          .addChoices(
            { name: 'Group Voting', value: 'group' },
            { name: 'Knockout Round', value: 'knockout' }
          )
      )
      .addStringOption(option =>
        option
          .setName('duration')
          .setDescription('New duration to add (e.g., "24h", "3d", "45m")')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('group')
          .setDescription('Group letter (only for group voting)')
          .setRequired(false)
      )
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
      .setName('my-votes')
      .setDescription('View your voting history and available votes')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('export')
      .setDescription('Export tournament results')
      .addStringOption(option =>
        option
          .setName('format')
          .setDescription('Export format')
          .setRequired(true)
          .addChoices(
            { name: 'Markdown', value: 'markdown' },
            { name: 'JSON', value: 'json' }
          )
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('cancel')
      .setDescription('Cancel the tournament (Admin/Mod only)')
  );

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();
  console.log('[/bracket] Subcommand received:', subcommand);
  
  // Check admin/mod permissions for management commands
  const requiresAdmin = ['create', 'add-title', 'remove-title', 'announce', 'open-groups', 'close-groups', 'advance-knockout', 'regenerate', 'open-knockout', 'close-knockout', 'open-quarters', 'close-quarters', 'open-semis', 'close-semis', 'open-finals', 'close-finals', 'open-matchup', 'close-matchup', 'extend-voting', 'cancel'];
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
      case 'help':
        await handleHelp(interaction);
        break;
      case 'create':
        await handleCreate(interaction);
        break;
      case 'add-title':
        await handleAddTitle(interaction);
        break;
      case 'remove-title':
        await handleRemoveTitle(interaction);
        break;
      case 'announce':
        await handleAnnounce(interaction);
        break;
      case 'open-groups':
        await handleOpenGroups(interaction);
        break;
      case 'close-groups':
        await handleCloseGroups(interaction);
        break;
      case 'advance-knockout':
        await handleAdvanceKnockout(interaction);
        break;
      case 'regenerate':
        await handleRegenerate(interaction);
        break;
      case 'open-knockout':
        await handleOpenKnockout(interaction);
        break;
      case 'close-knockout':
        await handleCloseKnockout(interaction);
        break;
      // Round-specific aliases (Round of 16 uses open-knockout)
      case 'open-quarters':
      case 'open-semis':
      case 'open-finals':
        await handleOpenKnockout(interaction);
        break;
      case 'close-quarters':
      case 'close-semis':
      case 'close-finals':
        await handleCloseKnockout(interaction);
        break;
      case 'open-matchup':
        await handleOpenMatchup(interaction);
        break;
      case 'close-matchup':
        await handleCloseMatchup(interaction);
        break;
      case 'extend-voting':
        await handleExtendVoting(interaction);
        break;
      case 'status':
        await handleStatus(interaction);
        break;
      case 'view':
        await handleView(interaction);
        break;
      case 'my-votes':
        await handleMyVotes(interaction);
        break;
      case 'export':
        await handleExport(interaction);
        break;
      case 'cancel':
        await handleCancel(interaction);
        break;
      default:
        console.log('[/bracket] Unknown subcommand hit with value:', subcommand);
        await interaction.reply({ content: '❌ Unknown subcommand', ephemeral: true });
    }
  } catch (error) {
    console.error('Error in bracket command:', error);
    
    // Handle error response based on interaction state
    const errorMessage = {
      content: '❌ An error occurred. Please try again.',
      ephemeral: true
    };
    
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    } catch (replyError) {
      console.error('Failed to send error message:', replyError);
    }
  }
}

/**
 * Display comprehensive tournament help and guide
 */
async function handleHelp(interaction) {
  const embed = new EmbedBuilder()
    .setColor(0x4EC5ED)
    .setTitle('🏆 Tournament System Guide')
    .setDescription(
      '**Welcome to the Button-Based Tournament System!**\n\n' +
      'Run tournaments for movies, TV shows, games, books, or board games. ' +
      'Members vote using interactive buttons - no typing required!'
    )
    .addFields(
      {
        name: '📋 Quick Start (Admin)',
        value:
          '1️⃣ `/bracket create name:"My Tournament"` - Create tournament\n' +
          '2️⃣ `/bracket add-title` - Add 4 titles to each group (A-L)\n' +
          '3️⃣ `/bracket open-groups groups:"A,B,C,D"` - Open voting\n' +
          '4️⃣ *Members click buttons to vote!*\n' +
          '5️⃣ Wait for auto-close or `/bracket close-groups`\n' +
          '6️⃣ `/bracket advance-knockout duration:"24h"` - Start bracket (auto-opens voting)\n' +
          '7️⃣ Repeat until winner!',
        inline: false
      },
      {
        name: '🗳️ How to Vote (Everyone)',
        value:
          '**Group Stage:**\n' +
          '• Click **2 buttons** to select your favorites\n' +
          '• Your personal dashboard shows checkmarks for your votes ✅\n' +
          '• Dashboard updates in real-time (only you see it)\n' +
          '• Click again to deselect\n' +
          '• Change votes anytime before deadline\n\n' +
          '**Knockout Stage:**\n' +
          '• Click **1 button** to pick the winner\n' +
          '• One vote per matchup',
        inline: false
      },
      {
        name: '🎮 Opening Rounds (Admin)',
        value:
          '**Round-Specific Commands:**\n' +
          '• `/bracket open-quarters` - Open Quarterfinals (4 matchups)\n' +
          '• `/bracket open-semis` - Open Semifinals (2 matchups)\n' +
          '• `/bracket open-finals` - Open Finals (1 matchup)\n' +
          '• `/bracket open-knockout` - Generic (any round)\n\n' +
          '**Advanced:**\n' +
          '• `/bracket open-matchup matchup:"1A,2A"` - Open specific matchups\n' +
          '• `/bracket regenerate` - Fix bracket structure issues',
        inline: false
      },
      {
        name: '✅ Closing Rounds (Admin)',
        value:
          '• `/bracket close-quarters` - Close Quarters → Semis\n' +
          '• `/bracket close-semis` - Close Semis → Finals\n' +
          '• `/bracket close-finals` - Declare winner!\n' +
          '• `/bracket close-knockout` - Generic (any round)\n' +
          '• `/bracket close-matchup` - Close specific matchup(s)',
        inline: false
      },
      {
        name: '👥 Other Commands',
        value:
          '**Everyone:**\n' +
          '• `/bracket status` - View standings\n' +
          '• `/bracket view` - See bracket visual\n' +
          '• `/bracket my-votes` - Your votes\n\n' +
          '**Admin:**\n' +
          '• `/bracket extend-voting` - Add time\n' +
          '• `/bracket export` - Save results\n' +
          '• `/bracket cancel` - Cancel',
        inline: false
      },
      {
        name: '⚡ Auto-Features',
        value:
          '✅ **Auto-close** - Voting closes at deadline\n' +
          '✅ **1-hour warnings** - Automatic reminders\n' +
          '✅ **Results posted** - Winners announced\n' +
          '✅ **Live vote counts** - Updates in real-time\n' +
          '✅ **Button feedback** - Green = selected',
        inline: false
      },
      {
        name: '💡 Pro Tips',
        value:
          '• Set voting duration: `duration:"48h"` (5m-30d)\n' +
          '• Use wildcards for uneven brackets\n' +
          '• Upload custom images with `/bracket add-title`\n' +
          '• Export results in Markdown or JSON\n' +
          '• Check logs with `/eggshen-logs category:bracket`',
        inline: false
      }
    )
    .setFooter({ text: 'Need help? Ask an admin or check the docs at eggshenbot.com' });
  
  await interaction.reply({ embeds: [embed], ephemeral: true });
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
    .setDescription(`Tournament created! Now add titles to ${groupCount} groups.`)
    .addFields(
      { name: 'Status', value: 'Setup', inline: true },
      { name: 'Groups', value: `0/${groupCount}`, inline: true },
      { name: 'Total Capacity', value: `${totalMovies} titles`, inline: true },
      { name: 'Creator', value: `<@${interaction.user.id}>`, inline: false }
    )
    .setFooter({ text: 'Use /bracket add-title to add titles • Use /bracket announce when ready to share with server' });
  
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleAddTitle(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  const group = interaction.options.getString('group');
  const type = interaction.options.getString('type');
  const title = interaction.options.getString('title');
  const imageAttachment = interaction.options.getAttachment('image');
  const customImage = imageAttachment?.url;
  
  // Check if tournament exists
  const tournament = bracketManager.loadTournament(interaction.guildId);
  if (!tournament || tournament.status !== 'setup') {
    await interaction.editReply({
      content: '❌ No tournament in setup phase. Create one with `/bracket create` first.',
      ephemeral: true,
    });
    return;
  }
  
  // Search for the title using the appropriate API
  let results = [];
  try {
    switch (type) {
      case 'movie':
        results = await hybridSearch(title, searchMovies, 'movie');
        break;
      case 'tv':
        results = await hybridSearch(title, searchTVShows, 'tv');
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
  } catch (error) {
    console.error(`[Bracket] Error searching for "${title}" (${type}):`, error);
    await interaction.editReply({
      content: '❌ An error occurred while searching. Please try again.',
      ephemeral: true,
    });
    return;
  }
  
  // No results found
  if (!results || results.length === 0) {
    await interaction.editReply({
      content: `❌ Could not find any ${getTypeLabel(type).toLowerCase()} matching "${title}"\n\nPlease check spelling or try different search terms.`,
      ephemeral: true,
    });
    return;
  }
  
  // If only one result, add it directly
  if (results.length === 1) {
    const entry = buildEntryFromResult(results[0], type);
    
    // Apply custom image if provided
    if (customImage) {
      entry.customImageUrl = customImage;
    }
    
    const result = bracketManager.addGroupTitle(interaction.guildId, group, type, entry);
    
    if (!result.success) {
      await interaction.editReply({
        content: `❌ ${result.error}`,
        ephemeral: true,
      });
      return;
    }
    
    // Success - show what was added and progress
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle(`✅ Added to Group ${group}`)
      .setDescription(`**${entry.title}**${entry.year ? ` (${entry.year})` : ''}`)
      .addFields(
        { name: 'Type', value: getTypeLabel(type), inline: true },
        { name: 'Group Progress', value: `${result.titleCount}/4 titles`, inline: true }
      );
    
    // Use custom image if provided, otherwise use API poster
    const imageUrl = entry.customImageUrl || entry.posterUrl;
    if (imageUrl) {
      embed.setThumbnail(imageUrl);
    }
    
    if (result.titleCount < 4) {
      embed.setFooter({ text: `Add ${4 - result.titleCount} more title(s) to Group ${group} with /bracket add-title` });
    } else {
      embed.setFooter({ text: `Group ${group} is complete! Add more groups or use /bracket open-groups to start voting.` });
    }
    
    await interaction.editReply({ embeds: [embed] });
    return;
  }
  
  // Multiple results - show selection menu
  const guildConfig = await loadGuildConfig(interaction.guildId);
  const maxResults = guildConfig.maxSearchResults || 20;
  const limitedResults = results.slice(0, maxResults);
  
  // Store custom image in cache if provided
  if (customImage) {
    const cacheKey = `${interaction.user.id}_${group}`;
    customImageCache.set(cacheKey, customImage);
    // Auto-cleanup after 5 minutes
    setTimeout(() => customImageCache.delete(cacheKey), 5 * 60 * 1000);
  }
  
  // Create selection menu with bracket context
  const options = limitedResults.map((result) => {
    const displayTitle = result.title || result.name || result.Name || result.volumeInfo?.title;
    let year = null;
    if (result.release_date) year = result.release_date.split('-')[0];
    else if (result.first_air_date) year = result.first_air_date.split('-')[0];
    else if (result.released) year = result.released.split('-')[0];
    else if (result.YearPublished) year = result.YearPublished;
    else if (result.volumeInfo?.publishedDate) year = result.volumeInfo.publishedDate.split('-')[0];
    
    const yearStr = year ? ` (${year})` : '';
    const overview = result.overview || result.volumeInfo?.description || 'No description';
    const truncatedOverview = overview.length > 97 ? overview.substring(0, 97) + '...' : overview;
    
    return {
      label: `${displayTitle}${yearStr}`.substring(0, 100),
      description: truncatedOverview.substring(0, 100),
      value: `bracket_${group}_${type}_${result.id}`,
    };
  });
  
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`select_bracket_title_${interaction.user.id}`)
    .setPlaceholder('Select the correct title')
    .addOptions(options);
  
  const row = new ActionRowBuilder().addComponents(selectMenu);
  
  const embed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle(`🏆 Select Title for Group ${group}`)
    .setDescription(`Found ${results.length} ${getTypeLabel(type).toLowerCase()} matching "${title}". Select the correct one to add to the bracket.`)
    .setFooter({ text: `Adding to Group ${group} • ${getTypeLabel(type)}` });
  
  await interaction.editReply({
    embeds: [embed],
    components: [row],
  });
}

async function handleRemoveTitle(interaction) {
  const group = interaction.options.getString('group');
  const position = interaction.options.getInteger('position');
  const guildId = interaction.guildId;
  
  // Check if tournament exists
  const tournament = bracketManager.loadTournament(guildId);
  if (!tournament || tournament.status !== 'setup') {
    await interaction.reply({
      content: '❌ No tournament in setup phase. Create one with `/bracket create` first.',
      ephemeral: true,
    });
    return;
  }
  
  // Check if group has titles
  const groupData = tournament.groups[group];
  if (!groupData || groupData.movies.length === 0) {
    await interaction.reply({
      content: `❌ Group ${group} has no titles to remove.`,
      ephemeral: true,
    });
    return;
  }
  
  // Remove the title
  const result = bracketManager.removeGroupTitle(guildId, group, position);
  
  if (!result.success) {
    await interaction.reply({
      content: `❌ ${result.error}`,
      ephemeral: true,
    });
    return;
  }
  
  // Success - show what was removed and current progress
  const embed = new EmbedBuilder()
    .setColor(0xFF0000)
    .setTitle(`🗑️ Removed from Group ${group}`)
    .setDescription(`**${result.removedTitle.title}**${result.removedTitle.year ? ` (${result.removedTitle.year})` : ''}`)
    .addFields(
      { name: 'Group Progress', value: `${result.titleCount}/4 titles`, inline: true }
    );
  
  // Use custom image if provided, otherwise use API poster
  const imageUrl = result.removedTitle.customImageUrl || result.removedTitle.posterUrl;
  if (imageUrl) {
    embed.setThumbnail(imageUrl);
  }
  
  // Provide guidance based on remaining titles
  if (result.titleCount === 0) {
    // Group is now empty - suggest next steps
    const filledGroups = Object.keys(tournament.groups).filter(
      key => tournament.groups[key].movies && tournament.groups[key].movies.length > 0
    ).length;
    
    const suggestedGroupCount = Math.max(4, filledGroups); // Minimum 4 groups
    
    embed.addFields({
      name: '⚠️ Group Empty',
      value: `Group ${group} now has no titles. Choose an option:\n\n` +
             `1️⃣ Add 4 titles to Group ${group} with \`/bracket add-title\`\n` +
             `2️⃣ Resize tournament to ${suggestedGroupCount} groups with \`/bracket resize groups:${suggestedGroupCount}\``,
      inline: false
    });
  } else if (result.titleCount < 4) {
    embed.setFooter({ text: `Add ${4 - result.titleCount} more title(s) to Group ${group} with /bracket add-title` });
  }
  
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleResize(interaction) {
  const newGroupCount = interaction.options.getInteger('groups');
  const guildId = interaction.guildId;
  
  // Check if tournament exists
  const tournament = bracketManager.loadTournament(guildId);
  if (!tournament) {
    await interaction.reply({
      content: '❌ No tournament found. Create one with `/bracket create` first.',
      ephemeral: true,
    });
    return;
  }
  
  if (tournament.status !== 'setup') {
    await interaction.reply({
      content: '❌ Tournament can only be resized during the setup phase, before voting begins.',
      ephemeral: true,
    });
    return;
  }
  
  // Check if current tournament already has this size
  if (tournament.groupCount === newGroupCount) {
    await interaction.reply({
      content: `❌ Tournament is already set to ${newGroupCount} groups.`,
      ephemeral: true,
    });
    return;
  }
  
  // Resize the tournament
  const result = bracketManager.resizeTournament(guildId, newGroupCount);
  
  if (!result.success) {
    // If error contains formatting (multi-line with options), send as embed
    if (result.error.includes('\n')) {
      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Cannot Resize Tournament')
        .setDescription(result.error)
        .setFooter({ text: 'Fix these issues before resizing' });
      
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } else {
      await interaction.reply({
        content: `❌ ${result.error}`,
        ephemeral: true,
      });
    }
    return;
  }
  
  // Success - show what changed
  const oldCount = result.oldGroupCount;
  const oldRange = 'ABCDEFGHIJKL'.slice(0, oldCount);
  const newRange = 'ABCDEFGHIJKL'.slice(0, newGroupCount);
  const action = newGroupCount > oldCount ? 'expanded' : 'contracted';
  const emoji = newGroupCount > oldCount ? '📈' : '📉';
  
  const embed = new EmbedBuilder()
    .setColor(newGroupCount > oldCount ? 0x00FF00 : 0xFFA500)
    .setTitle(`${emoji} Tournament Resized`)
    .setDescription(`**${tournament.name}**`)
    .addFields(
      { name: 'Previous Size', value: `${oldCount} groups (${oldRange})`, inline: true },
      { name: 'New Size', value: `${newGroupCount} groups (${newRange})`, inline: true },
      { name: 'Total Capacity', value: `${newGroupCount * 4} titles`, inline: true }
    );
  
  if (result.filledGroups > 0) {
    embed.addFields({
      name: 'Progress',
      value: `${result.filledGroups} group${result.filledGroups !== 1 ? 's' : ''} already filled with titles`,
      inline: false,
    });
  }
  
  if (newGroupCount > oldCount) {
    const newGroups = 'ABCDEFGHIJKL'.slice(oldCount, newGroupCount);
    embed.setFooter({ text: `New groups available: ${newGroups.split('').join(', ')}` });
  }
  
  await interaction.reply({ embeds: [embed] });
}

async function handleAnnounce(interaction) {
  const customMessage = interaction.options.getString('message');
  const imageAttachment = interaction.options.getAttachment('image');
  const guildId = interaction.guildId;
  
  // Check if tournament exists
  const tournament = bracketManager.loadTournament(guildId);
  if (!tournament) {
    await interaction.reply({
      content: '❌ No tournament found. Create one with `/bracket create` first.',
      ephemeral: true,
    });
    return;
  }
  
  // Count filled groups
  const filledGroups = Object.keys(tournament.groups).filter(
    key => tournament.groups[key].movies && tournament.groups[key].movies.length === 4
  ).length;
  
  const totalGroups = tournament.groupCount;
  const allowedGroupLetters = 'ABCDEFGHIJKL'.slice(0, tournament.groupCount);
  
  // Build announcement embed
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`🏆 ${tournament.name}`)
    .setDescription(
      customMessage || 
      `A new tournament has been created! Get ready to vote for your favorites.`
    )
    .addFields(
      { name: 'Tournament Type', value: tournament.type ? getTypeLabel(tournament.type) : 'Not set yet', inline: true },
      { name: 'Groups', value: `${allowedGroupLetters.split('').join(', ')} (${totalGroups} groups)`, inline: true },
      { name: 'Total Entries', value: `${filledGroups * 4} titles`, inline: true }
    );
  
  // Add status based on phase
  if (tournament.status === 'setup') {
    embed.addFields({
      name: 'Status',
      value: `⚙️ Setup Phase - ${filledGroups}/${totalGroups} groups filled`,
      inline: false
    });
    embed.setFooter({ text: 'Voting will begin soon! Stay tuned for announcements.' });
  } else if (tournament.status === 'group_stage') {
    embed.addFields({
      name: 'Status',
      value: '🗳️ Group Stage Voting - Vote for your top 2 in each group!',
      inline: false
    });
    embed.setFooter({ text: 'Use /bracket vote-group to cast your votes' });
  } else if (tournament.status === 'knockout') {
    embed.addFields({
      name: 'Status',
      value: `⚔️ Knockout Stage - ${tournament.phase}`,
      inline: false
    });
    embed.setFooter({ text: 'Head-to-head battles! Vote for your favorites.' });
  }
  
  // Add custom image if provided
  if (imageAttachment) {
    embed.setImage(imageAttachment.url);
  }
  
  // Send public announcement
  await interaction.reply({ embeds: [embed] });
}

/**
 * Search for a title using the appropriate service based on type
 * Returns: { status: 'found'|'none', entry: {...}, count: number }
 * Note: When multiple results are found, returns the first (best) match
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
    
    // Take the first (best) result - APIs return results sorted by relevance
    const result = results[0];
    const entry = buildEntryFromResult(result, type);
    
    return { status: 'found', entry, count: results.length };
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
  const durationStr = interaction.options.getString('duration') || '24h';
  
  // Parse and validate duration
  const durationMs = parseDuration(durationStr);
  if (!durationMs) {
    await interaction.editReply('❌ Invalid duration format. Use format like "24h", "3d", "45m"');
    return;
  }
  
  if (!isValidDuration(durationMs)) {
    await interaction.editReply('❌ Duration must be between 5 minutes (5m) and 30 days (30d)');
    return;
  }
  
  const deadline = Date.now() + durationMs;
  
  const result = bracketManager.openGroupVoting(interaction.guildId, groupIds, deadline);
  
  if (!result.success) {
    await interaction.editReply(`❌ ${result.error}`);
    return;
  }
  
  const timeRemaining = formatTimeRemaining(deadline);
  
  // Create leaderboard embeds (public - no voting buttons)
  const embeds = [];
  
  // Main announcement embed
  const mainEmbed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle(`�️ Group Stage Voting is Now Open!`)
    .setDescription(
      `Voting is now open for **Groups ${groupIds.join(', ')}**!\n\n` +
      `**📝 How to Vote:**\n` +
      `1️⃣ Click "Start Voting" button below\n` +
      `2️⃣ Your personal voting dashboard appears with all groups\n` +
      `3️⃣ Click 2 buttons per group to vote (shown in purple when selected)\n` +
      `4️⃣ Dashboard updates in real-time as you vote (only you see it)\n` +
      `5️⃣ Vote before the deadline!\n\n` +
      `⏰ **Voting closes in:** ${timeRemaining}\n` +
      `💡 **Tip:** You can change votes anytime before it closes!`
    )
    .setFooter({ text: `Deadline: <t:${Math.floor(deadline / 1000)}:f>` });
  
  embeds.push(mainEmbed);
  
  // Create leaderboard embeds for each group (read-only, shows vote counts)
  groupIds.forEach((groupId) => {
    const group = result.tournament.groups[groupId];
    if (!group) return;
    
    const groupEmbed = new EmbedBuilder()
      .setColor(0x4EC5ED)
      .setTitle(`Group ${groupId}`)
      .setDescription('📊 **Current Standings:**');
    
    // Add fields for each movie with vote counts
    group.movies.forEach((movie, index) => {
      const voteCount = movie.votes.length;
      groupEmbed.addFields({
        name: `${index + 1}. ${movie.title}`,
        value: `${voteCount} vote${voteCount !== 1 ? 's' : ''}`,
        inline: true
      });
    });
    
    embeds.push(groupEmbed);
  });
  
  // Add single "Start Voting" button
  const startButton = new ButtonBuilder()
    .setCustomId(`start_group_voting_${groupIds.join(',')}`)
    .setLabel('🗳️ Start Voting')
    .setStyle(ButtonStyle.Primary);
  
  const buttonRow = new ActionRowBuilder().addComponents(startButton);
  
  const votingMessage = await interaction.editReply({ 
    embeds: [leaderboardEmbed], 
    components: [buttonRow]
  });
  
  // Store message IDs for each group so scheduler can update/close them
  for (const groupId of groupIds) {
    bracketManager.storeGroupVotingMessage(
      interaction.guildId,
      groupId,
      interaction.channelId,
      votingMessage.id
    );
  }
}

// DEPRECATED: Group voting is now button-based via handleOpenGroups
// This function is no longer used but kept for reference
// async function handleVoteGroup(interaction) { ... }

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
  
  // Get duration parameter (default to 24h if not specified)
  const durationStr = interaction.options.getString('duration') || '24h';
  
  // Parse and validate duration
  const durationMs = parseDuration(durationStr);
  if (!durationMs) {
    await interaction.editReply('❌ Invalid duration format. Use format like "24h", "3d", "45m"');
    return;
  }
  
  if (!isValidDuration(durationMs)) {
    await interaction.editReply('❌ Duration must be between 5 minutes (5m) and 30 days (30d)');
    return;
  }
  
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
  
  const tournament = bracketResult.tournament;
  const totalParticipants = bracketResult.matchups.length * 2;
  const roundName = tournament.phase.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  const wildcardsCount = wildcardsResult.wildcards.length;
  
  // Automatically open voting for first round with specified duration
  const deadline = Date.now() + durationMs;
  const openResult = bracketManager.openKnockoutRound(interaction.guildId, tournament.phase, deadline);
  
  if (!openResult.success) {
    // If opening voting fails, still show bracket was created
    await interaction.editReply(`✅ Knockout bracket created, but failed to open voting: ${openResult.error}\n\nUse \`/bracket open-knockout\` to manually open voting.`);
    return;
  }
  
  const timeRemaining = formatTimeRemaining(deadline);
  
  // Get current round matchups
  const currentRoundMatchups = tournament.knockoutBracket.filter(m => 
    m.round === tournament.phase && m.movie1 && m.movie2
  );
  
  // Build response with voting buttons
  const embeds = [];
  const components = [];
  
  // Main announcement embed
  const mainEmbed = new EmbedBuilder()
    .setColor(0xFF0000)
    .setTitle(`🏆 ${roundName} - Knockout Stage Begins!`)
    .setDescription(
      `**${bracketResult.matchups.length} matchups created** • ${totalParticipants} titles remain\n\n` +
      `The tournament advances to single elimination!\n\n` +
      `**🗳️ Voting is now open!**\n` +
      `Vote for ONE title in each matchup below.\n\n` +
      `⏰ **Voting closes in:** ${timeRemaining}`
    )
    .setFooter({ text: `Deadline: <t:${Math.floor(deadline / 1000)}:f>` });
  
  // Show wildcards if any
  if (wildcardsCount > 0) {
    const wildcardsText = wildcardsResult.wildcards
      .map((w, i) => `${i + 1}. ${w.title} (${w.voteCount} votes, Group ${w.groupId})`)
      .join('\n');
    
    mainEmbed.addFields({ name: `🎟️ Wildcards (Best ${wildcardsCount} Third-Place)`, value: wildcardsText, inline: false });
  }
  
  embeds.push(mainEmbed);
  
  // Add "Start Voting" button
  const startVotingButton = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`start_knockout_voting_${tournament.phase}`)
      .setLabel('🗳️ Start Voting')
      .setStyle(ButtonStyle.Success)
  );
  
  await interaction.editReply({ embeds, components: [startVotingButton] });
  
  // Send each matchup as a separate card (NO voting buttons)
  for (const matchup of currentRoundMatchups) {
    const votes1 = matchup.votes?.movie1?.length || 0;
    const votes2 = matchup.votes?.movie2?.length || 0;
    const regionalLabel = getRegionalLabel(matchup.position, tournament.phase);
    
    const embed = new EmbedBuilder()
      .setColor(0x4EC5ED)
      .setTitle(`${roundName} - Matchup ${regionalLabel}`)
      .setDescription(`**${regionalLabel}:** ${matchup.movie1.title} vs ${matchup.movie2.title}`)
      .addFields(
        { 
          name: `${matchup.movie1.title}`, 
          value: `${votes1} vote${votes1 !== 1 ? 's' : ''}`, 
          inline: true 
        },
        { name: '\u200B', value: 'vs', inline: true },
        { 
          name: `${matchup.movie2.title}`, 
          value: `${votes2} vote${votes2 !== 1 ? 's' : ''}`, 
          inline: true 
        }
      );
    
    // No buttons on shared message - users vote via personal dashboard
    const votingMessage = await interaction.channel.send({ embeds: [embed] });
    
    // Store message ID for scheduler to track
    bracketManager.storeMatchupVotingMessage(
      interaction.guildId,
      matchup.id,
      interaction.channelId,
      votingMessage.id
    );
  }
}

async function handleRegenerate(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  const result = bracketManager.regenerateKnockoutBracket(interaction.guildId);
  
  if (!result.success) {
    await interaction.editReply(`❌ ${result.error}`);
    return;
  }
  
  const roundName = result.tournament.phase.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  const embed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle('✅ Knockout Bracket Regenerated')
    .setDescription(
      (result.warning ? `${result.warning}\n\n` : '') +
      `Successfully rebuilt the knockout bracket from all ${Object.keys(result.tournament.groupResults).length} closed groups.\n\n` +
      `**${result.matchups.length} matchups** created in ${roundName}\n` +
      `**${result.totalMatchups} total matchups** across all rounds\n` +
      `**${result.wildcards.length} wildcards** included`
    )
    .setFooter({ text: 'Use /bracket view to see the complete bracket tree!' });
  
  // Show wildcards if any
  if (result.wildcards.length > 0) {
    const wildcardsText = result.wildcards
      .map((w, i) => `${i + 1}. ${w.title} (${w.voteCount} votes, Group ${w.groupId})`)
      .join('\n');
    embed.addFields({ name: '🎟️ Wildcards', value: wildcardsText, inline: false });
  }
  
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
    .setThumbnail(interaction.client.user.displayAvatarURL())
    .addFields(
      { name: 'Status', value: tournament.status, inline: true },
      { name: 'Phase', value: tournament.phase, inline: true },
      { name: 'Creator', value: `<@${tournament.creatorId}>`, inline: true }
    );
  
  if (tournament.status === 'setup') {
    const groupsAdded = Object.keys(tournament.groups).length;
    const totalTitles = Object.values(tournament.groups).reduce((sum, g) => sum + (g.movies?.length || 0), 0);
    embed.setDescription(`Tournament is being set up.\n\n**Groups Added:** ${groupsAdded}/${tournament.groupCount}\n**Titles Added:** ${totalTitles}`);
    
  } else if (tournament.status === 'group_stage') {
    const openGroups = Object.entries(tournament.groups)
      .filter(([_, g]) => g.status === 'voting' || g.votingOpen);
    
    const closedGroups = Object.keys(tournament.groupResults).length;
    
    let description = `Group stage in progress!\n\n**Completed:** ${closedGroups}/${tournament.groupCount} groups\n`;
    
    if (openGroups.length > 0) {
      description += `\n**📊 Active Voting:**\n`;
      
      for (const [groupId, group] of openGroups) {
        // Count unique voters
        const voterSet = new Set();
        group.movies.forEach(movie => {
          movie.votes.forEach(voterId => voterSet.add(voterId));
        });
        const voterCount = voterSet.size;
        
        // Calculate time remaining
        const timeRemaining = group.votingDeadline ? formatTimeRemaining(group.votingDeadline) : 'No deadline';
        const deadlineEmoji = group.votingDeadline && Date.now() > group.votingDeadline - (60 * 60 * 1000) ? '⚠️' : '⏰';
        
        // Show leading titles
        const sortedMovies = [...group.movies].sort((a, b) => b.votes.length - a.votes.length);
        const topTwo = sortedMovies.slice(0, 2);
        const leaderText = topTwo.map((m, i) => `  ${i === 0 ? '🥇' : '🥈'} ${m.title} (${m.votes.length})`).join('\n');
        
        description += `\n**Group ${groupId}** - ${voterCount} voter${voterCount !== 1 ? 's' : ''}\n`;
        description += `${deadlineEmoji} ${timeRemaining}\n${leaderText}\n`;
      }
    } else {
      description += `\n*No groups currently open for voting*`;
    }
    
    embed.setDescription(description);
    
  } else if (tournament.status === 'knockout') {
    const currentRound = tournament.phase.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const votingMatchups = tournament.knockoutBracket.filter(m => m.status === 'voting');
    const closedMatchups = Object.keys(tournament.knockoutResults).length;
    
    let description = `**${currentRound}**\n\nSingle elimination bracket\n\n`;
    
    if (votingMatchups.length > 0) {
      description += `**📊 Active Matchups:**\n`;
      
      for (const matchup of votingMatchups) {
        const votes1 = matchup.votes?.movie1?.length || 0;
        const votes2 = matchup.votes?.movie2?.length || 0;
        const totalVotes = votes1 + votes2;
        const timeRemaining = matchup.votingDeadline ? formatTimeRemaining(matchup.votingDeadline) : 'No deadline';
        const deadlineEmoji = matchup.votingDeadline && Date.now() > matchup.votingDeadline - (60 * 60 * 1000) ? '⚠️' : '⏰';
        const regionalLabel = getRegionalLabel(matchup.position, tournament.phase);
        
        const leader = votes1 > votes2 ? matchup.movie1.title : votes2 > votes1 ? matchup.movie2.title : 'Tied';
        const leaderVotes = Math.max(votes1, votes2);
        
        description += `\n**Matchup ${regionalLabel}** - ${totalVotes} vote${totalVotes !== 1 ? 's' : ''}\n`;
        description += `${deadlineEmoji} ${timeRemaining}\n`;
        description += `  Leading: ${leader} (${leaderVotes})\n`;
      }
    } else {
      description += `*No matchups currently open for voting*\n\n`;
    }
    
    description += `\n**Completed:** ${closedMatchups} matchup${closedMatchups !== 1 ? 's' : ''}`;
    embed.setDescription(description);
    
  } else if (tournament.status === 'completed') {
    const champion = tournament.champion || tournament.winner;
    embed.setDescription(`🎉 **Tournament Complete!**\n\n**Winner:** ${champion?.title || 'Unknown'}`);
    embed.setColor(0xFFD700); // Gold
  }
  
  await interaction.editReply({ embeds: [embed] });
}

async function handleListGroups(interaction) {
  await interaction.deferReply();
  
  const tournament = bracketManager.loadTournament(interaction.guildId);
  
  if (!tournament) {
    await interaction.editReply('❌ No active tournament found.');
    return;
  }
  
  const embed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle(`🏆 ${tournament.name} - Groups`);
  
  // Get all group letters that exist
  const groupLetters = Object.keys(tournament.groups).sort();
  
  if (groupLetters.length === 0) {
    embed.setDescription('No groups have been created yet.');
    await interaction.editReply({ embeds: [embed] });
    return;
  }
  
  // Add each group as a field
  groupLetters.forEach(groupId => {
    const group = tournament.groups[groupId];
    const movies = group.movies || [];
    
    let groupText;
    if (movies.length === 0) {
      groupText = '*Empty - no titles added yet*';
    } else {
      groupText = movies.map((m, i) => `${i + 1}. ${m.title}`).join('\n');
    }
    
    // Add status indicator if group is open or closed
    let statusEmoji = '';
    if (group.status === 'voting') {
      statusEmoji = ' 🗳️ *(voting open)*';
    } else if (group.status === 'closed') {
      statusEmoji = ' ✅ *(closed)*';
    }
    
    embed.addFields({
      name: `Group ${groupId}${statusEmoji}`,
      value: groupText,
      inline: true
    });
  });
  
  embed.setFooter({ text: `${groupLetters.length} of ${tournament.groupCount} groups created` });
  
  await interaction.editReply({ embeds: [embed] });
}

async function handleView(interaction) {
  await interaction.deferReply();
  
  const tournament = bracketManager.loadTournament(interaction.guildId);
  
  if (!tournament) {
    await interaction.editReply('❌ No active tournament found.');
    return;
  }
  
  try {
    // Generate appropriate visualization based on tournament phase
    let imageBuffer;
    let description;
    
    if (tournament.status === 'knockout' || tournament.status === 'completed') {
      // Knockout phase: Show traditional bracket tree
      if (!tournament.knockoutBracket || tournament.knockoutBracket.length === 0) {
        await interaction.editReply('❌ No knockout bracket data available.');
        return;
      }
      
      imageBuffer = await bracketVisualizer.generateBracketImage(tournament);
      description = `**Phase:** ${tournament.phase.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}\n**Participants:** ${tournament.knockoutBracket.length * 2}`;
      
    } else {
      // Setup or Group stage: Show full tournament structure
      imageBuffer = await bracketVisualizer.generateFullTournamentView(tournament);
      description = `**Phase:** ${tournament.status === 'setup' ? 'Setup' : 'Group Stage'}\n**Groups:** ${Object.keys(tournament.groups).length}\n**Total Titles:** ${Object.keys(tournament.groups).length * 4}`;
    }
    
    // Create attachment
    const attachment = new AttachmentBuilder(imageBuffer, { 
      name: 'tournament.png',
      description: `${tournament.name} - Tournament View`
    });
    
    // Create embed
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`🏆 ${tournament.name}`)
      .setDescription(description)
      .setImage('attachment://tournament.png')
      .setFooter({ text: 'Use /bracket status for detailed standings' })
      .setTimestamp();
    
    await interaction.editReply({ 
      embeds: [embed],
      files: [attachment]
    });
    
  } catch (error) {
    console.error('Error generating tournament view:', error);
    await interaction.editReply('❌ Failed to generate tournament visualization. Error: ' + error.message);
  }
}

async function handleImage(interaction) {
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

async function handleOpenKnockout(interaction) {
  await interaction.deferReply();
  
  const durationStr = interaction.options.getString('duration') || '24h';
  
  // Parse and validate duration
  const durationMs = parseDuration(durationStr);
  if (!durationMs) {
    await interaction.editReply('❌ Invalid duration format. Use format like "24h", "3d", "45m"');
    return;
  }
  
  if (!isValidDuration(durationMs)) {
    await interaction.editReply('❌ Duration must be between 5 minutes (5m) and 30 days (30d)');
    return;
  }
  
  const deadline = Date.now() + durationMs;
  
  const tournament = bracketManager.loadTournament(interaction.guildId);
  
  if (!tournament || tournament.status !== 'knockout') {
    await interaction.editReply('❌ No knockout bracket found. Use `/bracket advance-knockout` first.');
    return;
  }
  
  // Get matchups for current round
  const currentRoundMatchups = tournament.knockoutBracket.filter(m => 
    m.round === tournament.phase && m.movie1 && m.movie2
  );
  
  if (currentRoundMatchups.length === 0) {
    await interaction.editReply(`❌ No matchups ready for ${tournament.phase.replace(/_/g, ' ')}. Winners need to be advanced first.`);
    return;
  }
  
  // Open matchups for voting
  const result = bracketManager.openKnockoutRound(interaction.guildId, tournament.phase, deadline);
  
  if (!result.success) {
    await interaction.editReply(`❌ ${result.error}`);
    return;
  }
  
  const roundName = tournament.phase.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  const timeRemaining = formatTimeRemaining(deadline);
  
  // Create embeds for each matchup
  const embeds = [];
  const components = [];
  
  // Send main summary message with Start Voting button
  const mainEmbed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle(`📊 ${roundName} - ${currentRoundMatchups.length} Matchups Opened!`)
    .setDescription(
      `**Opened matchups:** ${currentRoundMatchups.map(m => getRegionalLabel(m.position, tournament.phase)).join(', ')}\n\n` +
      `**📝 How to Vote:**\n` +
      `🔹 Click the "Start Voting" button below\n` +
      `🔹 You'll get your own personal voting dashboard\n` +
      `🔹 Your choices are saved instantly\n` +
      `🔹 Only you can see your selections\n\n` +
      `⏰ **Voting closes in:** ${timeRemaining}\n` +
      `💡 **Tip:** You can change your votes anytime!`
    )
    .setFooter({ text: `Deadline: <t:${Math.floor(deadline / 1000)}:f>` });
  
  const startVotingButton = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`start_knockout_voting_${tournament.phase}`)
      .setLabel('🗳️ Start Voting')
      .setStyle(ButtonStyle.Success)
  );
  
  await interaction.editReply({ embeds: [mainEmbed], components: [startVotingButton] });
  
  // Send each matchup as a separate card (NO voting buttons)
  for (const matchup of currentRoundMatchups) {
    const votes1 = matchup.votes?.movie1?.length || 0;
    const votes2 = matchup.votes?.movie2?.length || 0;
    const regionalLabel = getRegionalLabel(matchup.position, tournament.phase);
    
    const embed = new EmbedBuilder()
      .setColor(0x4EC5ED)
      .setTitle(`${roundName} - Matchup ${regionalLabel}`)
      .setDescription(`**${regionalLabel}:** ${matchup.movie1.title} vs ${matchup.movie2.title}`)
      .addFields(
        { 
          name: `${matchup.movie1.title}`, 
          value: `${votes1} vote${votes1 !== 1 ? 's' : ''}`, 
          inline: true 
        },
        { name: '\u200B', value: 'vs', inline: true },
        { 
          name: `${matchup.movie2.title}`, 
          value: `${votes2} vote${votes2 !== 1 ? 's' : ''}`, 
          inline: true 
        }
      );
    
    // No buttons on shared message - users vote via personal dashboard
    await interaction.channel.send({ embeds: [embed] });
  }
}

async function handleCloseKnockout(interaction) {
  await interaction.deferReply();
  
  const tournament = bracketManager.loadTournament(interaction.guildId);
  
  if (!tournament || tournament.status !== 'knockout') {
    await interaction.editReply('❌ No active knockout bracket found.');
    return;
  }
  
  // Get voting matchups for current round
  const votingMatchups = tournament.knockoutBracket.filter(m => 
    m.round === tournament.phase && m.status === 'voting'
  );
  
  if (votingMatchups.length === 0) {
    await interaction.editReply(`❌ No voting matchups found for ${tournament.phase.replace(/_/g, ' ')}.`);
    return;
  }
  
  // Close all matchups and advance winners
  const results = [];
  for (const matchup of votingMatchups) {
    const result = bracketManager.closeKnockoutMatchup(interaction.guildId, matchup.id);
    if (result.success) {
      results.push({
        matchup,
        winner: result.winner,
        votes1: matchup.votes.movie1.length,
        votes2: matchup.votes.movie2.length
      });
    }
  }
  
  // Check if round is complete
  const currentRound = tournament.phase;
  const updatedTournament = bracketManager.loadTournament(interaction.guildId);
  
  const roundName = currentRound.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  // Create results embed
  const embed = new EmbedBuilder()
    .setColor(0xFF9900)
    .setTitle(`🏁 ${roundName} Complete!`)
    .setThumbnail(interaction.client.user.displayAvatarURL())
    .setDescription(`**${results.length} matchup${results.length !== 1 ? 's' : ''}** closed. Here are the winners:\n`);
  
  results.forEach((r) => {
    const loser = r.winner.title === r.matchup.movie1.title ? r.matchup.movie2 : r.matchup.movie1;
    const regionalLabel = getRegionalLabel(r.matchup.position, currentRound);
    embed.addFields({
      name: `Matchup ${regionalLabel}`,
      value: `**${r.winner.title}** (${r.votes1} vs ${r.votes2}) defeats ${loser.title}`,
      inline: false
    });
  });
  
  // Check if tournament is complete
  if (currentRound === 'finals') {
    const champion = results[0]?.winner;
    embed.setColor(0xFFD700);
    embed.setTitle('🏆 Tournament Complete!');
    embed.setDescription(`**${champion?.title}** is the champion!\n\nCongratulations! 🎉`);
    embed.setFooter({ text: 'Tournament has ended. Use /bracket view to see the final bracket.' });
  } else {
    // Advance to next round
    const nextRound = updatedTournament.phase;
    const nextRoundName = nextRound.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    
    // Suggest the appropriate round-specific command
    let nextCommand = '/bracket open-knockout';
    if (nextRound === 'quarterfinals') nextCommand = '/bracket open-quarters';
    else if (nextRound === 'semifinals') nextCommand = '/bracket open-semis';
    else if (nextRound === 'finals') nextCommand = '/bracket open-finals';
    
    embed.setFooter({ text: `Winners have advanced to ${nextRoundName}. Run ${nextCommand} to start voting!` });
  }
  
  await interaction.editReply({ embeds: [embed] });
}

/**
 * Show interactive region selector when no region specified
 */
async function showRegionSelector(interaction, tournament, durationMs) {
  const roundName = tournament.phase.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  // Get all matchups in current round
  const currentRoundMatchups = tournament.knockoutBracket.filter(m => 
    m.round === tournament.phase && m.movie1 && m.movie2
  );
  
  if (currentRoundMatchups.length === 0) {
    await interaction.editReply(`❌ No matchups ready for ${roundName}.`);
    return;
  }
  
  // Count matchups by region
  const midpoint = currentRoundMatchups.length / 2;
  const region1Matchups = currentRoundMatchups.filter(m => m.position < midpoint);
  const region2Matchups = currentRoundMatchups.filter(m => m.position >= midpoint);
  
  const timeRemaining = formatTimeRemaining(Date.now() + durationMs);
  
  // Build embed
  const embed = new EmbedBuilder()
    .setColor(0x4EC5ED)
    .setTitle(`🏆 Select Region to Open - ${roundName}`)
    .setThumbnail(interaction.client.user.displayAvatarURL())
    .setDescription(
      `Choose which side of the bracket to open for voting:\n\n` +
      `**Region 1 (Left Side):** ${region1Matchups.length} matchup${region1Matchups.length !== 1 ? 's' : ''}\n` +
      `**Region 2 (Right Side):** ${region2Matchups.length} matchup${region2Matchups.length !== 1 ? 's' : ''}\n\n` +
      `⏰ **Voting duration:** ${timeRemaining}\n` +
      `💡 **Tip:** Opening by region helps manage voting flow and build anticipation!`
    )
    .setFooter({ text: 'Buttons expire after 15 minutes' });
  
  // Create region buttons
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`open_region_1_${durationMs}`)
      .setLabel('Region 1 (Left Side)')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('⬅️'),
    new ButtonBuilder()
      .setCustomId(`open_region_2_${durationMs}`)
      .setLabel('Region 2 (Right Side)')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('➡️')
  );
  
  await interaction.editReply({ embeds: [embed], components: [row] });
}

async function handleOpenRegion(interaction) {
  await interaction.deferReply();
  
  const region = interaction.options.getInteger('region');
  const durationStr = interaction.options.getString('duration') || '24h';
  
  // Parse and validate duration
  const durationMs = parseDuration(durationStr);
  if (!durationMs) {
    await interaction.editReply('❌ Invalid duration format. Use format like "24h", "3d", "45m"');
    return;
  }
  
  if (!isValidDuration(durationMs)) {
    await interaction.editReply('❌ Duration must be between 5 minutes (5m) and 30 days (30d)');
    return;
  }
  
  const tournament = bracketManager.loadTournament(interaction.guildId);
  
  if (!tournament || tournament.status !== 'knockout') {
    await interaction.editReply('❌ No knockout bracket found. Use `/bracket advance-knockout` first.');
    return;
  }
  
  // If no region specified, show interactive selector
  if (region === null || region === undefined) {
    return await showRegionSelector(interaction, tournament, durationMs);
  }
  
  const deadline = Date.now() + durationMs;
  
  // Get all matchups in current round
  const currentRoundMatchups = tournament.knockoutBracket.filter(m => 
    m.round === tournament.phase && m.movie1 && m.movie2
  );
  
  if (currentRoundMatchups.length === 0) {
    await interaction.editReply(`❌ No matchups ready for ${tournament.phase.replace(/_/g, ' ')}.`);
    return;
  }
  
  // Filter by region (region 1 = left side, region 2 = right side)
  const midpoint = currentRoundMatchups.length / 2;
  const regionMatchups = currentRoundMatchups.filter(m => {
    if (region === 1) {
      return m.position < midpoint; // Left side
    } else {
      return m.position >= midpoint; // Right side
    }
  });
  
  if (regionMatchups.length === 0) {
    await interaction.editReply(`❌ No matchups found in Region ${region}.`);
    return;
  }
  
  // Open all matchups in this region
  for (const matchup of regionMatchups) {
    matchup.status = 'voting';
    matchup.votingOpened = Date.now();
    matchup.votingDeadline = deadline;
    if (!matchup.votes) {
      matchup.votes = { movie1: [], movie2: [] };
    }
  }
  
  bracketManager.saveTournament(interaction.guildId, tournament);
  
  const roundName = tournament.phase.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  const timeRemaining = formatTimeRemaining(deadline);
  const regionName = region === 1 ? 'Left Side' : 'Right Side';
  
  // Build matchup embeds
  const embeds = [];
  const components = [];
  
  for (const matchup of regionMatchups) {
    const votes1 = matchup.votes.movie1.length;
    const votes2 = matchup.votes.movie2.length;
    const regionalLabel = getRegionalLabel(matchup.position, tournament.phase);
    
    const embed = new EmbedBuilder()
      .setColor(0x4EC5ED)
      .setTitle(`${roundName} - Matchup ${regionalLabel}`)
      .setDescription(`**${regionalLabel}:** ${matchup.movie1.title} vs ${matchup.movie2.title}`)
      .addFields(
        { 
          name: `${matchup.movie1.title}`, 
          value: `${votes1} vote${votes1 !== 1 ? 's' : ''}`, 
          inline: true 
        },
        { name: '\u200B', value: 'vs', inline: true },
        { 
          name: `${matchup.movie2.title}`, 
          value: `${votes2} vote${votes2 !== 1 ? 's' : ''}`, 
          inline: true 
        }
      );
    
    // No buttons on shared message - users vote via personal dashboard
    await interaction.channel.send({ embeds: [embed] });
  }
  
  // Send main summary message with Start Voting button
  const mainEmbed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle(`📊 ${roundName} - Region ${region} - ${regionMatchups.length} Matchups Opened!`)
    .setDescription(
      `**Opened matchups:** ${regionMatchups.map(m => getRegionalLabel(m.position, tournament.phase)).join(', ')}\n\n` +
      `**📝 How to Vote:**\n` +
      `🔹 Click the "Start Voting" button below\n` +
      `🔹 You'll get your own personal voting dashboard\n` +
      `🔹 Your choices are saved instantly\n` +
      `🔹 Only you can see your selections\n\n` +
      `⏰ **Voting closes in:** ${timeRemaining}\n` +
      `💡 **Tip:** You can change your votes anytime!`
    )
    .setFooter({ text: `Deadline: <t:${Math.floor(deadline / 1000)}:f>` });
  
  const startVotingButton = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`start_knockout_voting_${tournament.phase}`)
      .setLabel('🗳️ Start Voting')
      .setStyle(ButtonStyle.Success)
  );
  
  await interaction.editReply({ embeds: [mainEmbed], components: [startVotingButton] });
}

/**
 * Show interactive matchup selector when no matchup specified
 */
async function showMatchupSelector(interaction, tournament, durationMs) {
  const roundName = tournament.phase.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  // Get all pending matchups in current round
  const pendingMatchups = tournament.knockoutBracket
    .filter(m => m.round === tournament.phase && m.status === 'pending' && m.movie1 && m.movie2)
    .sort((a, b) => a.position - b.position);
  
  if (pendingMatchups.length === 0) {
    await interaction.editReply('❌ No pending matchups found in current round. All matchups may already be open or closed.');
    return;
  }
  
  const timeRemaining = formatTimeRemaining(Date.now() + durationMs);
  
  // Build embed
  const embed = new EmbedBuilder()
    .setColor(0x4EC5ED)
    .setTitle(`🏆 Select Matchups to Open - ${roundName}`)
    .setDescription(
      `**${pendingMatchups.length} matchup${pendingMatchups.length !== 1 ? 's' : ''} available**\n\n` +
      `Click button(s) below to open matchup(s) for voting.\n\n` +
      `⏰ **Voting duration:** ${timeRemaining}\n` +
      `💡 **Tip:** You can click multiple buttons to open several matchups at once!`
    )
    .setFooter({ text: 'Buttons expire after 15 minutes' });
  
  // Create buttons (max 25 buttons, 5 per row)
  const components = [];
  for (let i = 0; i < pendingMatchups.length; i += 5) {
    const row = new ActionRowBuilder();
    const rowMatchups = pendingMatchups.slice(i, i + 5);
    
    for (const matchup of rowMatchups) {
      const regionalLabel = getRegionalLabel(matchup.position, tournament.phase);
      const label = `${regionalLabel}: ${matchup.movie1.title.substring(0, 15)}... vs ${matchup.movie2.title.substring(0, 15)}...`;
      
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`open_matchup_${matchup.id}_${durationMs}`)
          .setLabel(label.length > 80 ? regionalLabel : label)
          .setStyle(ButtonStyle.Primary)
      );
    }
    components.push(row);
  }
  
  await interaction.editReply({ embeds: [embed], components });
}

/**
 * Show interactive matchup selector for closing open matchups
 */
async function showCloseMatchupSelector(interaction, tournament) {
  if (!tournament || tournament.status !== 'knockout') {
    await interaction.editReply('❌ No knockout bracket found.');
    return;
  }
  
  const roundName = tournament.phase.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  // Get all voting matchups in current round
  const votingMatchups = tournament.knockoutBracket
    .filter(m => m.round === tournament.phase && m.status === 'voting' && m.movie1 && m.movie2)
    .sort((a, b) => a.position - b.position);
  
  if (votingMatchups.length === 0) {
    await interaction.editReply('❌ No open matchups found in current round. Use `/bracket open-matchup` to open voting first.');
    return;
  }
  
  // Build embed
  const embed = new EmbedBuilder()
    .setColor(0xFF6B6B)
    .setTitle(`🏁 Select Matchups to Close - ${roundName}`)
    .setDescription(
      `**${votingMatchups.length} matchup${votingMatchups.length !== 1 ? 's' : ''} currently open**\n\n` +
      `Click button(s) below to close matchup(s) and advance winner(s).\n\n` +
      `💡 **Tip:** You can click multiple buttons to close several matchups at once!`
    )
    .setFooter({ text: 'Buttons expire after 15 minutes' });
  
  // Create buttons (max 25 buttons, 5 per row)
  const components = [];
  for (let i = 0; i < votingMatchups.length; i += 5) {
    const row = new ActionRowBuilder();
    const rowMatchups = votingMatchups.slice(i, i + 5);
    
    for (const matchup of rowMatchups) {
      const regionalLabel = getRegionalLabel(matchup.position, tournament.phase);
      const votes1 = matchup.votes?.movie1?.length || 0;
      const votes2 = matchup.votes?.movie2?.length || 0;
      const label = `${regionalLabel}: ${matchup.movie1.title.substring(0, 12)}(${votes1}) vs ${matchup.movie2.title.substring(0, 12)}(${votes2})`;
      
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`close_matchup_${matchup.id}`)
          .setLabel(label.length > 80 ? `${regionalLabel} (${votes1}-${votes2})` : label)
          .setStyle(ButtonStyle.Danger)
      );
    }
    components.push(row);
  }
  
  await interaction.editReply({ embeds: [embed], components });
}

async function handleOpenMatchup(interaction) {
  await interaction.deferReply();
  
  const matchupInput = interaction.options.getString('matchup');
  const durationStr = interaction.options.getString('duration') || '24h';
  
  // Parse and validate duration
  const durationMs = parseDuration(durationStr);
  if (!durationMs) {
    await interaction.editReply('❌ Invalid duration format. Use format like "24h", "3d", "45m"');
    return;
  }
  
  if (!isValidDuration(durationMs)) {
    await interaction.editReply('❌ Duration must be between 5 minutes (5m) and 30 days (30d)');
    return;
  }
  
  const tournament = bracketManager.loadTournament(interaction.guildId);
  
  if (!tournament || tournament.status !== 'knockout') {
    await interaction.editReply('❌ No knockout bracket found. Use `/bracket advance-knockout` first.');
    return;
  }
  
  // If no matchup provided, show interactive selection
  if (!matchupInput || matchupInput.trim().length === 0) {
    return await showMatchupSelector(interaction, tournament, durationMs);
  }
  
  const deadline = Date.now() + durationMs;
  
  // Parse comma-separated matchup labels
  const matchupLabels = matchupInput.toUpperCase().split(',').map(l => l.trim()).filter(l => l.length > 0);
  
  if (matchupLabels.length === 0) {
    await interaction.editReply('❌ No valid matchup labels provided.');
    return;
  }
  
  // Track opened matchups and errors
  const openedMatchups = [];
  const errors = [];
  
  for (const matchupLabel of matchupLabels) {
    // Parse regional label to position
    const position = parseRegionalLabel(matchupLabel, tournament.phase);
    if (position === null) {
      errors.push(`❌ Invalid label "${matchupLabel}"`);
      continue;
    }
    
    // Find the matchup by position in current round
    const matchup = tournament.knockoutBracket.find(m => 
      m.round === tournament.phase && m.position === position && m.movie1 && m.movie2
    );
    
    if (!matchup) {
      errors.push(`❌ Matchup ${matchupLabel} not found or incomplete`);
      continue;
    }
    
    if (matchup.status === 'voting') {
      errors.push(`⚠️ Matchup ${matchupLabel} already open`);
      continue;
    }
    
    // Open this specific matchup
    matchup.status = 'voting';
    matchup.votingOpened = Date.now();
    matchup.votingDeadline = deadline;
    if (!matchup.votes) {
      matchup.votes = { movie1: [], movie2: [] };
    }
    
    openedMatchups.push({ label: matchupLabel, matchup });
  }
  
  if (openedMatchups.length === 0) {
    await interaction.editReply(`❌ No matchups were opened.\n\n${errors.join('\n')}`);
    return;
  }
  
  bracketManager.saveTournament(interaction.guildId, tournament);
  
  const roundName = tournament.phase.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  const timeRemaining = formatTimeRemaining(deadline);
  
  // If only one matchup, use detailed embed
  if (openedMatchups.length === 1) {
    const { label: matchupLabel, matchup } = openedMatchups[0];
    const position = parseRegionalLabel(matchupLabel, tournament.phase);
    const votes1 = matchup.votes.movie1.length;
    const votes2 = matchup.votes.movie2.length;
    
    // Get regional label for display
    const regionalLabel = getRegionalLabel(position, tournament.phase);
    const regionNum = parseInt(matchupLabel[0]);
    const regionName = regionNum === 1 ? 'Left Side' : 'Right Side';
    
    const embed = new EmbedBuilder()
      .setColor(0x4EC5ED)
      .setTitle(`${roundName} - Matchup ${regionalLabel}`)
      .setDescription(`**${regionalLabel}:** ${matchup.movie1.title} vs ${matchup.movie2.title}`)
      .addFields(
        { 
          name: `${matchup.movie1.title}`, 
          value: `${votes1} vote${votes1 !== 1 ? 's' : ''}`, 
          inline: true 
        },
        { name: '\u200B', value: 'vs', inline: true },
        { 
          name: `${matchup.movie2.title}`, 
          value: `${votes2} vote${votes2 !== 1 ? 's' : ''}`, 
          inline: true 
        }
      );
    
    const mainEmbed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle(`🏆 ${roundName} - Matchup ${regionalLabel} Open!`)
      .setDescription(
        `**📝 How to Vote:**\n` +
        `🔹 Click the "Start Voting" button below\n` +
        `🔹 You'll get your own personal voting dashboard\n` +
        `🔹 Your choices are saved instantly\n` +
        `🔹 Only you can see your selections\n\n` +
        `⏰ **Voting closes in:** ${timeRemaining}\n` +
        `💡 **Tip:** You can change your vote anytime!`
    )
    .setFooter({ text: `Deadline: <t:${Math.floor(deadline / 1000)}:f>` });
  
    const startVotingButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`start_knockout_voting_${tournament.phase}`)
        .setLabel('🗳️ Start Voting')
        .setStyle(ButtonStyle.Success)
    );
  
    await interaction.editReply({ embeds: [mainEmbed], components: [startVotingButton] });
    
    // Send matchup card WITHOUT buttons
    const votingMessage = await interaction.channel.send({ embeds: [embed] });
    
    // Store message ID so scheduler can update/close it
    bracketManager.storeMatchupVotingMessage(
      interaction.guildId,
      matchup.id,
      interaction.channelId,
      votingMessage.id
    );
    
    if (errors.length > 0) {
      await interaction.followUp({ content: errors.join('\n'), ephemeral: true });
    }
    return;
  }
  
  // Multiple matchups - send main announcement, then each matchup as separate message
  
  // Main announcement embed (sent as reply)
  const mainEmbed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle(`🏆 ${roundName} - ${openedMatchups.length} Matchups Opened!`)
    .setDescription(
      `**Opened matchups:** ${openedMatchups.map(m => m.label).join(', ')}\n\n` +
      `**📝 How to Vote:**\n` +
      `🔹 Click the "Start Voting" button below\n` +
      `🔹 You'll get your own personal voting dashboard\n` +
      `🔹 Your choices are saved instantly\n` +
      `🔹 Only you can see your selections\n\n` +
      `⏰ **Voting closes in:** ${timeRemaining}\n` +
      `💡 **Tip:** You can change your votes anytime!`
    )
    .setFooter({ text: `Deadline: <t:${Math.floor(deadline / 1000)}:f>` });
  
  // Add "Start Voting" button
  const startVotingButton = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`start_knockout_voting_${tournament.phase}`)
      .setLabel('🗳️ Start Voting')
      .setStyle(ButtonStyle.Success)
  );
  
  await interaction.editReply({ embeds: [mainEmbed], components: [startVotingButton] });
  
  // Send each matchup as a separate message with its own buttons
  for (const { label: matchupLabel, matchup } of openedMatchups) {
    const position = parseRegionalLabel(matchupLabel, tournament.phase);
    const votes1 = matchup.votes.movie1.length;
    const votes2 = matchup.votes.movie2.length;
    const regionalLabel = getRegionalLabel(position, tournament.phase);
    
    const embed = new EmbedBuilder()
      .setColor(0x4EC5ED)
      .setTitle(`${roundName} - Matchup ${regionalLabel}`)
      .setDescription(`**${regionalLabel}:** ${matchup.movie1.title} vs ${matchup.movie2.title}`)
      .addFields(
        { 
          name: `${matchup.movie1.title}`, 
          value: `${votes1} vote${votes1 !== 1 ? 's' : ''}`, 
          inline: true 
        },
        { name: '\u200B', value: 'vs', inline: true },
        { 
          name: `${matchup.movie2.title}`, 
          value: `${votes2} vote${votes2 !== 1 ? 's' : ''}`, 
          inline: true 
        }
      );
    
    // No buttons on shared message - users will vote via personal dashboard
    const votingMessage = await interaction.channel.send({ embeds: [embed] });
    
    // Store message ID so scheduler can update/close it
    bracketManager.storeMatchupVotingMessage(
      interaction.guildId,
      matchup.id,
      interaction.channelId,
      votingMessage.id
    );
  }
  
  if (errors.length > 0) {
    await interaction.followUp({ content: `⚠️ Some issues:\n${errors.join('\n')}`, ephemeral: true });
  }
}

async function handleCloseMatchup(interaction) {
  await interaction.deferReply();
  
  const matchupInput = interaction.options.getString('matchup');
  const tournament = bracketManager.loadTournament(interaction.guildId);
  
  // If no matchup specified, show interactive selector
  if (!matchupInput || matchupInput.trim().length === 0) {
    return await showCloseMatchupSelector(interaction, tournament);
  }
  
  // Support comma-separated multiple matchups
  const matchupLabels = matchupInput.toUpperCase().split(',').map(m => m.trim()).filter(m => m.length > 0);
  
  if (!tournament || tournament.status !== 'knockout') {
    await interaction.editReply('❌ No knockout bracket found.');
    return;
  }
  
  // Process each matchup
  const successes = [];
  const errors = [];
  
  for (const matchupLabel of matchupLabels) {
    // Parse regional label to position
    const position = parseRegionalLabel(matchupLabel, tournament.phase);
    if (position === null) {
      errors.push(`❌ Invalid matchup label "${matchupLabel}"`);
      continue;
    }
    
    // Find the matchup by position in current round
    const matchup = tournament.knockoutBracket.find(m => 
      m.round === tournament.phase && m.position === position
    );
    
    if (!matchup) {
      errors.push(`❌ Matchup ${matchupLabel} not found`);
      continue;
    }
    
    if (matchup.status !== 'voting') {
      errors.push(`❌ Matchup ${matchupLabel} is not open for voting`);
      continue;
    }
    
    // Close this matchup
    const result = bracketManager.closeKnockoutMatchup(interaction.guildId, matchup.id);
    
    if (!result.success) {
      errors.push(`❌ ${matchupLabel}: ${result.error}`);
      continue;
    }
    
    const updatedTournament = result.tournament;
    const updatedMatchup = updatedTournament.knockoutBracket.find(m => m.id === matchup.id);
    
    const votes1 = updatedMatchup.votes.movie1.length;
    const votes2 = updatedMatchup.votes.movie2.length;
    const regionalLabel = getRegionalLabel(position, tournament.phase);
    
    successes.push({
      label: regionalLabel,
      winner: updatedMatchup.winner.title,
      movie1: updatedMatchup.movie1.title,
      movie2: updatedMatchup.movie2.title,
      votes1,
      votes2,
      autoAdvanced: result.autoAdvanced
    });
  }
  
  // Build response
  if (successes.length === 0) {
    await interaction.editReply(errors.join('\n') || '❌ No matchups were closed.');
    return;
  }
  
  const roundName = tournament.phase.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  const reloadedTournament = bracketManager.loadTournament(interaction.guildId);
  
  // Single matchup closed
  if (successes.length === 1) {
    const s = successes[0];
    const regionNum = parseInt(matchupLabels[0][0]);
    const regionName = regionNum === 1 ? 'Left Side' : 'Right Side';
    
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle(`🏁 ${roundName} - Matchup ${s.label} Complete! (${regionName})`)
      .setDescription(
        `**${s.winner}** wins!\n\n` +
        `**${s.movie1}** (${s.votes1} votes) vs **${s.movie2}** (${s.votes2} votes)`
      );
    
    if (s.autoAdvanced) {
      embed.addFields({
        name: '✅ Auto-Advanced',
        value: `${s.winner} has been placed in the next round matchup.`
      });
    }
    
    // Check if all matchups in round are closed
    const roundMatchups = reloadedTournament.knockoutBracket.filter(m => m.round === tournament.phase);
    const allClosed = roundMatchups.every(m => m.status === 'closed');
    
    if (allClosed) {
      if (reloadedTournament.phase !== tournament.phase) {
        const nextRoundName = reloadedTournament.phase.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        embed.setFooter({ text: `All matchups complete! Tournament has advanced to ${nextRoundName}.` });
      } else if (reloadedTournament.status === 'completed') {
        embed.setFooter({ text: '🏆 Tournament complete! Check /bracket status for champion.' });
      }
    }
    
    if (errors.length > 0) {
      embed.addFields({ name: '⚠️ Some Issues', value: errors.join('\n') });
    }
    
    await interaction.editReply({ embeds: [embed] });
  } else {
    // Multiple matchups closed
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle(`🏁 ${roundName} - ${successes.length} Matchup${successes.length !== 1 ? 's' : ''} Closed!`)
      .setDescription(
        successes.map(s => `**${s.label}**: ${s.winner} wins (${s.votes1} vs ${s.votes2})`).join('\n')
      );
    
    const autoAdvanced = successes.filter(s => s.autoAdvanced);
    if (autoAdvanced.length > 0) {
      embed.addFields({
        name: '✅ Auto-Advanced',
        value: autoAdvanced.map(s => `${s.label}: ${s.winner}`).join('\n')
      });
    }
    
    // Check if all matchups in round are closed
    const roundMatchups = reloadedTournament.knockoutBracket.filter(m => m.round === tournament.phase);
    const allClosed = roundMatchups.every(m => m.status === 'closed');
    
    if (allClosed) {
      if (reloadedTournament.phase !== tournament.phase) {
        const nextRoundName = reloadedTournament.phase.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        embed.setFooter({ text: `All matchups complete! Tournament has advanced to ${nextRoundName}.` });
      } else if (reloadedTournament.status === 'completed') {
        embed.setFooter({ text: '🏆 Tournament complete! Check /bracket status for champion.' });
      }
    }
    
    if (errors.length > 0) {
      embed.addFields({ name: '⚠️ Some Issues', value: errors.join('\n') });
    }
    
    await interaction.editReply({ embeds: [embed] });
  }
}

async function handleExtendVoting(interaction) {
  await interaction.deferReply();
  
  const type = interaction.options.getString('type');
  const durationStr = interaction.options.getString('duration');
  const groupId = interaction.options.getString('group')?.toUpperCase();
  
  // Parse and validate duration
  const durationMs = parseDuration(durationStr);
  if (!durationMs) {
    await interaction.editReply('❌ Invalid duration format. Use format like "24h", "3d", "45m"');
    return;
  }
  
  if (!isValidDuration(durationMs)) {
    await interaction.editReply('❌ Duration must be between 5 minutes (5m) and 30 days (30d)');
    return;
  }
  
  const tournament = bracketManager.loadTournament(interaction.guildId);
  
  if (!tournament) {
    await interaction.editReply('❌ No tournament found');
    return;
  }
  
  if (type === 'group') {
    // Extend group voting
    if (!groupId) {
      await interaction.editReply('❌ Please specify which group to extend using the `group` parameter');
      return;
    }
    
    const group = tournament.groups[groupId];
    if (!group) {
      await interaction.editReply(`❌ Group ${groupId} not found`);
      return;
    }
    
    if (group.status !== 'voting') {
      await interaction.editReply(`❌ Group ${groupId} is not currently open for voting`);
      return;
    }
    
    // Extend the deadline
    const newDeadline = Date.now() + durationMs;
    group.votingDeadline = newDeadline;
    
    bracketManager.saveTournament(interaction.guildId, tournament);
    
    const timeRemaining = formatTimeRemaining(newDeadline);
    await interaction.editReply(
      `✅ Extended voting for Group ${groupId}\n\n` +
      `⏰ **New deadline:** ${timeRemaining}\n` +
      `📅 **Exact time:** <t:${Math.floor(newDeadline / 1000)}:f>`
    );
    
  } else if (type === 'knockout') {
    // Extend knockout voting
    if (tournament.status !== 'knockout') {
      await interaction.editReply('❌ Tournament is not in knockout phase');
      return;
    }
    
    // Get current round matchups
    const currentRoundMatchups = tournament.knockoutBracket.filter(m => 
      m.round === tournament.phase && m.status === 'voting'
    );
    
    if (currentRoundMatchups.length === 0) {
      await interaction.editReply('❌ No voting is currently open in the knockout round');
      return;
    }
    
    // Extend the deadline for all matchups in current round
    const newDeadline = Date.now() + durationMs;
    currentRoundMatchups.forEach(m => {
      m.votingDeadline = newDeadline;
    });
    
    bracketManager.saveTournament(interaction.guildId, tournament);
    
    const roundName = tournament.phase.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const timeRemaining = formatTimeRemaining(newDeadline);
    
    await interaction.editReply(
      `✅ Extended voting for ${roundName} (${currentRoundMatchups.length} matchup${currentRoundMatchups.length !== 1 ? 's' : ''})\n\n` +
      `⏰ **New deadline:** ${timeRemaining}\n` +
      `📅 **Exact time:** <t:${Math.floor(newDeadline / 1000)}:f>`
    );
  }
}

async function handleMyVotes(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  const result = bracketManager.getUserVotingStatus(interaction.guildId, interaction.user.id);
  
  if (!result.success) {
    await interaction.editReply(`❌ ${result.error}`);
    return;
  }
  
  const { status } = result;
  
  // Helper function to format time remaining
  const formatTime = (ms) => {
    if (!ms || ms <= 0) return 'Expired';
    const days = Math.floor(ms / (24 * 60 * 60 * 1000));
    const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };
  
  const embed = new EmbedBuilder()
    .setColor(0x4EC5ED)
    .setTitle(`📊 Your Voting Status`)
    .setDescription(`**${status.tournament.name}**\\nPhase: ${status.tournament.phase.replace(/_/g, ' ').replace(/\\b\\w/g, l => l.toUpperCase())}\\n`);
  
  // Group votes cast
  if (status.groupVotes.length > 0) {
    const groupText = status.groupVotes.map(v => {
      const timeLeft = formatTime(v.timeRemaining);
      return `**Group ${v.group}** - Voted for #${v.choices[0].position} (${v.choices[0].title}) and #${v.choices[1].position} (${v.choices[1].title})\\n⏰ ${timeLeft} remaining`;
    }).join('\\n\\n');
    
    embed.addFields({ 
      name: `✅ Groups Voted (${status.groupVotes.length})`, 
      value: groupText, 
      inline: false 
    });
  }
  
  // Available group votes
  if (status.availableGroupVotes.length > 0) {
    const availText = status.availableGroupVotes.map(v => {
      const timeLeft = formatTime(v.timeRemaining);
      return `**Group ${v.group}** - ⏰ ${timeLeft} remaining`;
    }).join('\\n');
    
    embed.addFields({ 
      name: `🗳️ Groups Available (${status.availableGroupVotes.length})`, 
      value: availText + '\\n\\nUse `/bracket vote-group` to vote', 
      inline: false 
    });
  }
  
  // Knockout votes cast
  if (status.knockoutVotes.length > 0) {
    const knockoutText = status.knockoutVotes.map(v => {
      const roundName = v.round.replace(/_/g, ' ').replace(/\\b\\w/g, l => l.toUpperCase());
      const timeLeft = formatTime(v.timeRemaining);
      return `**${roundName} #${v.position}** - Voted for **${v.votedFor}** vs ${v.opponent}\\n⏰ ${timeLeft} remaining`;
    }).join('\\n\\n');
    
    embed.addFields({ 
      name: `✅ Knockout Votes Cast (${status.knockoutVotes.length})`, 
      value: knockoutText, 
      inline: false 
    });
  }
  
  // Available knockout votes
  if (status.availableKnockoutVotes.length > 0) {
    const availKnockoutText = status.availableKnockoutVotes.map(v => {
      const roundName = v.round.replace(/_/g, ' ').replace(/\\b\\w/g, l => l.toUpperCase());
      const timeLeft = formatTime(v.timeRemaining);
      return `**${roundName} #${v.position}** - ${v.movie1} vs ${v.movie2}\\n⏰ ${timeLeft} remaining`;
    }).join('\\n\\n');
    
    embed.addFields({ 
      name: `🗳️ Knockout Matchups Available (${status.availableKnockoutVotes.length})`, 
      value: availKnockoutText + '\\n\\nClick buttons on matchup messages to vote', 
      inline: false 
    });
  }
  
  // No voting activity
  if (status.groupVotes.length === 0 && status.availableGroupVotes.length === 0 && 
      status.knockoutVotes.length === 0 && status.availableKnockoutVotes.length === 0) {
    embed.setDescription(
      `**${status.tournament.name}**\\nPhase: ${status.tournament.phase.replace(/_/g, ' ').replace(/\\b\\w/g, l => l.toUpperCase())}\\n\\n` +
      `No voting currently available. Check back when admins open voting!`
    );
  }
  
  await interaction.editReply({ embeds: [embed] });
}

async function handleEditName(interaction) {
  const newName = interaction.options.getString('name');
  
  const tournament = bracketManager.loadTournament(interaction.guildId);
  if (!tournament) {
    await interaction.reply({
      content: '❌ No tournament found.',
      ephemeral: true
    });
    return;
  }
  
  const oldName = tournament.name;
  tournament.name = newName;
  
  const saved = bracketManager.saveTournament(interaction.guildId, tournament);
  if (!saved) {
    await interaction.reply({
      content: '❌ Failed to save tournament changes.',
      ephemeral: true
    });
    return;
  }
  
  const embed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle('✅ Tournament Name Updated')
    .setDescription(`**Old Name:** ${oldName}\n**New Name:** ${newName}`)
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed] });
}

async function handleExport(interaction) {
  await interaction.deferReply();
  
  const format = interaction.options.getString('format');
  
  const tournament = bracketManager.loadTournament(interaction.guildId);
  if (!tournament) {
    await interaction.editReply('❌ No tournament found.');
    return;
  }
  
  if (format === 'json') {
    // Export as JSON
    const jsonData = JSON.stringify(tournament, null, 2);
    const buffer = Buffer.from(jsonData, 'utf-8');
    const attachment = new AttachmentBuilder(buffer, { name: `${tournament.name.replace(/\s+/g, '_')}_export.json` });
    
    await interaction.editReply({
      content: `📦 **${tournament.name}** - JSON Export`,
      files: [attachment]
    });
    
  } else if (format === 'markdown') {
    // Export as Markdown
    let markdown = `# ${tournament.name}\n\n`;
    markdown += `**Status:** ${tournament.status}\n`;
    markdown += `**Phase:** ${tournament.phase}\n`;
    markdown += `**Created:** ${new Date(tournament.createdAt).toLocaleDateString()}\n\n`;
    
    // Group stage results
    if (Object.keys(tournament.groupResults).length > 0) {
      markdown += `## Group Stage Results\n\n`;
      for (const [groupId, result] of Object.entries(tournament.groupResults)) {
        markdown += `### Group ${groupId}\n\n`;
        markdown += `1. 🥇 **${result.first.title}** (${result.first.voteCount} votes)\n`;
        markdown += `2. 🥈 **${result.second.title}** (${result.second.voteCount} votes)\n`;
        if (result.third) {
          markdown += `3. 🥉 **${result.third.title}** (${result.third.voteCount} votes)\n`;
        }
        if (result.fourth) {
          markdown += `4. **${result.fourth.title}** (${result.fourth.voteCount} votes)\n`;
        }
        markdown += `\n`;
      }
    }
    
    // Knockout results
    if (tournament.knockoutBracket && tournament.knockoutBracket.length > 0) {
      markdown += `## Knockout Stage\n\n`;
      
      const rounds = ['finals', 'semifinals', 'quarterfinals', 'round_of_16', 'round_of_32'];
      for (const round of rounds) {
        const matchups = tournament.knockoutBracket.filter(m => m.round === round);
        if (matchups.length === 0) continue;
        
        const roundName = round.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        markdown += `### ${roundName}\n\n`;
        
        for (const matchup of matchups) {
          if (matchup.movie1 && matchup.movie2) {
            const votes1 = matchup.votes?.movie1?.length || 0;
            const votes2 = matchup.votes?.movie2?.length || 0;
            const winner = matchup.winner ? matchup.winner.title : 'TBD';
            
            markdown += `**Match ${matchup.position + 1}:** ${matchup.movie1.title} (${votes1}) vs ${matchup.movie2.title} (${votes2})\n`;
            markdown += `  Winner: **${winner}**\n\n`;
          }
        }
      }
    }
    
    // Winner
    if (tournament.winner) {
      markdown += `## 🏆 Champion\n\n**${tournament.winner.title}**\n\n`;
    }
    
    // Stats
    markdown += `## Statistics\n\n`;
    markdown += `- **Total Groups:** ${tournament.groupCount}\n`;
    if (tournament.knockoutBracket) {
      markdown += `- **Total Matchups:** ${tournament.knockoutBracket.length}\n`;
    }
    const totalVoters = new Set(Object.keys(tournament.votes || {})).size;
    markdown += `- **Total Voters:** ${totalVoters}\n`;
    
    const buffer = Buffer.from(markdown, 'utf-8');
    const attachment = new AttachmentBuilder(buffer, { name: `${tournament.name.replace(/\s+/g, '_')}_export.md` });
    
    await interaction.editReply({
      content: `📄 **${tournament.name}** - Markdown Export`,
      files: [attachment]
    });
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

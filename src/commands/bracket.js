import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, AttachmentBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { setTitleThumbnail, matchupLabel } from '../utils/tournamentUI.js';
import * as bracketManager from '../utils/bracketManager.js';
import * as bracketVisualizer from '../utils/bracketVisualizer.js';
import { searchTitleCandidates, buildEntryFromResult, completeEntry, getTypeLabel } from '../utils/bracketTitles.js';
import { avatarOf } from '../utils/personCard.js';
import { parseDuration, isValidDuration, isValidTiebreakerDuration, buildExport, DEFAULT_VOTING_DURATION, DEFAULT_TIEBREAKER_DURATION } from '../utils/tournamentImport.js';
import { signSetupToken, SETUP_LINK_TTL_MS } from '../utils/tournamentSetupLinkToken.js';
import { loadGuildConfig, isAdmin, canUseCommand, getPublicBotUrl } from '../utils/guildConfig.js';
import { config } from '../config.js';
import { closeMatchupsNow, afterKnockoutDecided } from '../utils/tournamentScheduler.js';

const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

// Subcommands only admins and moderators can run. Exported so /eggshen-ask
// can say when an answer needs one, from the same list that enforces it.
export const ADMIN_SUBCOMMANDS = ['create', 'setup-link', 'manage-titles', 'resize', 'edit-name', 'announce', 'open', 'close', 'open-groups', 'close-groups', 'regenerate', 'resolve-tiebreaker', 'open-matchup', 'close-matchup', 'extend-voting', 'cancel'];

// Temporary storage for custom images during selection process
export const customImageCache = new Map();

/**
 * The voting time to use when `duration` is left out: the tournament's own
 * default (set on the setup form), else 24h.
 */
function votingDurationFor(interaction) {
  return interaction.options.getString('duration')
    || bracketManager.loadTournament(interaction.guildId)?.votingDuration
    || DEFAULT_VOTING_DURATION;
}

/** Same for `tiebreaker-duration`: the tournament's default, else 1h. */
function tiebreakerDurationFor(interaction) {
  return interaction.options.getString('tiebreaker-duration')
    || bracketManager.loadTournament(interaction.guildId)?.tiebreakerDuration
    || DEFAULT_TIEBREAKER_DURATION;
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
 * Build a tiebreaker voting embed showing current vote counts
 * @param {object} tiebreaker
 * @returns {EmbedBuilder}
 */
function buildTiebreakerVotingEmbed(tiebreaker) {
  const voteCounts = {};
  tiebreaker.tiedOptions.forEach((_, i) => { voteCounts[i] = 0; });
  Object.values(tiebreaker.votes || {}).forEach(idx => {
    voteCounts[idx] = (voteCounts[idx] || 0) + 1;
  });
  const totalVotes = Object.values(voteCounts).reduce((a, b) => a + b, 0);

  const optionsText = tiebreaker.tiedOptions.map((opt, i) => {
    const votes = voteCounts[i] || 0;
    const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 10) : 0;
    const bar = '█'.repeat(pct) + '░'.repeat(10 - pct);
    return `**${i + 1}.** ${opt.title}\n${bar} ${votes} vote${votes !== 1 ? 's' : ''}`;
  }).join('\n\n');

  const isKnockout = tiebreaker.position === 'knockout';
  const contextLabel = isKnockout
    ? 'Knockout Matchup'
    : `Group ${tiebreaker.groupId} — ${tiebreaker.position} place`;
  const deadline = `<t:${Math.floor(tiebreaker.deadline / 1000)}:R>`;

  return new EmbedBuilder()
    .setColor(0xFFAA00)
    .setTitle(`🔀 Tiebreaker: ${contextLabel}`)
    .setDescription(`Click a button below to cast your vote!\n\n${optionsText}`)
    .addFields(
      { name: '⏰ Closes', value: deadline, inline: true },
      { name: '🗳️ Total Votes', value: `${totalVotes}`, inline: true }
    )
    .setFooter({ text: `Tiebreaker ID: ${tiebreaker.id}` });
}

/**
 * Build action row buttons for a tiebreaker vote
 * @param {object} tiebreaker
 * @returns {ActionRowBuilder[]}
 */
function buildTiebreakerButtons(tiebreaker) {
  const buttons = tiebreaker.tiedOptions.map((opt, i) =>
    new ButtonBuilder()
      .setCustomId(`tiebreaker_vote_${tiebreaker.id}_${i}`)
      .setLabel(opt.title.length > 80 ? opt.title.substring(0, 77) + '...' : opt.title)
      .setStyle(ButtonStyle.Primary)
  );
  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
  }
  return rows;
}

/**
 * Get regional label for a matchup (e.g., "1A", "2C", "3B", "4A")
 * March Madness style: 4 regions numbered 1-4
 * @param {number} position - Matchup position (0-based)
 * @param {string} round - Round name
 * @returns {string} Regional label
 */
/**
 * Close the current round's matchups that are still voting — except
 * `keepIds`, the ones about to open — exactly as their deadline would.
 *
 * Opening the next matchup ends voting on earlier ones (Doug, 2026-10-01).
 * Before, they stayed open until their own deadline, so with one matchup
 * opened after another people could keep changing votes on matchups that
 * had, as far as everyone could see, moved on.
 *
 * @returns {Promise<string>} A note for the reply, or '' if nothing closed
 */
async function closeEarlierMatchups(interaction, keepIds = []) {
  const tournament = bracketManager.loadTournament(interaction.guildId);
  if (!tournament || tournament.status !== 'knockout') return '';
  const keep = new Set(keepIds);
  const ids = tournament.knockoutBracket
    .filter(m => m.round === tournament.phase && m.status === 'voting' && !keep.has(m.id))
    .map(m => m.id);
  if (ids.length === 0) return '';

  // Results and tiebreakers are posted in each matchup's channel; a stand-in
  // guild just means nowhere to post (tests, or a guild not cached)
  const guild = interaction.guild || { id: interaction.guildId, channels: { fetch: async () => null } };
  const closed = await closeMatchupsNow(guild, ids);
  if (closed.length === 0) return '';

  const lines = closed.map(c => {
    const m = tournament.knockoutBracket.find(x => x.id === c.id);
    const label = getRegionalLabel(m.position, m.round);
    if (c.tied) return `${label}: tied — tiebreaker vote posted`;
    const high = Math.max(c.votes1, c.votes2);
    const low = Math.min(c.votes1, c.votes2);
    return `${label}: **${c.winner?.title}** wins ${high}–${low}`;
  });
  return `🔒 Voting closed on the earlier matchup${closed.length === 1 ? '' : 's'}:\n${lines.join('\n')}`;
}

// The "1A"/"2B"/"Finals" labels, shared with /image (see tournamentUI.js)
const getRegionalLabel = matchupLabel;

/**
 * Parse regional label to position (e.g., "1A" → 0, "3B" → 9 in Round of 16)
 * @param {string} label - Regional label like "1A", "2C", "3B", or "4D"
 * @param {string} round - Round name
 * @returns {number|null} Position or null if invalid
 */
function parseRegionalLabel(label, round) {
  // Any case: every caller upper-cases the input first, so this used to see
  // "FINALS", which matched neither 'Finals' nor 'finals' — the final could
  // not be opened or closed by label, though the suggestions offered it.
  // And only in the final: "Finals" during an earlier round meant 1A.
  if (/^finals?$/i.test(String(label).trim())) return round === 'finals' ? 0 : null;
  
  const match = label.match(/^([1-4])([A-Z])$/i);
  if (!match) return null;
  
  const region = parseInt(match[1]); // 1-4
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
  
  const matchupsPerRegion = totalMatchups / 4;
  
  // Validate letter is within range for this region
  if (letterIndex < 0 || letterIndex >= matchupsPerRegion) return null;
  
  // Calculate position: (region - 1) * matchupsPerRegion + letterIndex
  return (region - 1) * matchupsPerRegion + letterIndex;
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
          .setDescription('Tournament name (e.g., "The Ultimate Horror Cup")')
          .setRequired(true)
          // The name is interpolated into embed titles, which Discord caps at
          // 256 — and the longest of those prefixes it with "📊 Group A
          // Results - ". Without a cap, an over-long name makes .setTitle()
          // throw inside tournamentScheduler's auto-close, where the outer
          // try/catch swallows it and group voting silently never closes.
          .setMaxLength(100)
      )
      .addIntegerOption(option =>
        option
          .setName('max-titles')
          .setDescription('Max titles (2-32: bracket, 36-48: groups)')
          .setRequired(false)
          .addChoices(
            { name: '2 titles (Finals only)', value: 2 },
            { name: '4 titles (Semifinals)', value: 4 },
            { name: '8 titles (Quarterfinals)', value: 8 },
            { name: '16 titles (Round of 16)', value: 16 },
            { name: '32 titles (Round of 32)', value: 32 },
            { name: '36 titles (9 groups)', value: 36 },
            { name: '40 titles (10 groups)', value: 40 },
            { name: '44 titles (11 groups)', value: 44 },
            { name: '48 titles (12 groups)', value: 48 }
          )
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('setup-link')
      .setDescription('Private link to set up the tournament on the web, from a CSV/JSON file (Admin/Mod only)')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('manage-titles')
      .setDescription('Add or remove titles from groups (Admin/Mod only)')
      .addStringOption(option =>
        option
          .setName('action')
          .setDescription('Action to perform')
          .setRequired(true)
          .addChoices(
            { name: 'Add Title', value: 'add' },
            { name: 'Remove Title', value: 'remove' }
          )
      )
      .addStringOption(option =>
        option
          .setName('group')
          .setDescription('Group letter (auto-assigned in bracket mode)')
          .setRequired(false)
          .addChoices(...GROUP_LETTERS.map(letter => ({ name: `Group ${letter}`, value: letter })))
      )
      .addStringOption(option =>
        option
          .setName('type')
          .setDescription('Tournament type (required for adding)')
          .setRequired(false)
          .addChoices(
            { name: 'Movies', value: 'movie' },
            { name: 'TV Shows', value: 'tv' },
            { name: 'Video Games', value: 'game' },
            { name: 'Board Games', value: 'boardgame' },
            { name: 'Books', value: 'book' }
          )
      )
      .addStringOption(option =>
        option.setName('title').setDescription('Title to search for and add (required for adding)').setRequired(false)
      )
      .addIntegerOption(option =>
        option
          .setName('position')
          .setDescription('Number to remove, from /bracket list-groups (required for removing)')
          .setRequired(false)
          .setMinValue(1)
          // 32, not 4: bracket mode numbers its whole list; groups mode validates 1-4 itself
          .setMaxValue(32)
      )
      .addAttachmentOption(option =>
        option
          .setName('image')
          .setDescription('Optional: Custom image (for adding only)')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('resize')
      .setDescription('Change the number of groups before voting begins (Admin/Mod only)')
      .addIntegerOption(option =>
        option
          .setName('groups')
          .setDescription('New number of groups (4-12)')
          .setRequired(true)
          .setMinValue(4)
          .setMaxValue(12)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('edit-name')
      .setDescription('Rename the tournament (Admin/Mod only)')
      .addStringOption(option =>
        option
          .setName('name')
          .setDescription('New tournament name')
          .setRequired(true)
          .setMaxLength(100) // Same embed-title ceiling as `create`.
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
          .setMaxLength(1000) // Goes into an embed description (Discord caps at 4096).
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
      .addStringOption(option =>
        option
          .setName('tiebreaker-duration')
          .setDescription('Duration for tiebreaker votes if needed (e.g., "1h", "30m", "2h") - Default: 1h')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('regenerate')
      .setDescription('Rebuild the knockout bracket from group results (Admin/Mod only, fixes bracket structure issues)')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('resolve-tiebreaker')
      .setDescription('Manually resolve a tiebreaker (Admin/Mod/Creator only)')
      .addStringOption(option =>
        option
          .setName('tiebreaker-id')
          .setDescription('ID of the tiebreaker to resolve')
          .setRequired(true)
      )
      .addIntegerOption(option =>
        option
          .setName('winner')
          .setDescription('Pick a winner manually (1-4). Leave blank to resolve by current vote tallies.')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(4)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('open')
      .setDescription('Open voting for next round (auto-detects phase) (Admin/Mod only)')
      .addStringOption(option =>
        option
          .setName('duration')
          .setDescription('Voting duration (e.g., "24h", "3d", "45m") - Default: 24h, Range: 5m-30d')
          .setRequired(false)
      )
      .addIntegerOption(option =>
        option
          .setName('matchups')
          .setDescription('Knockout: open just the next N matchups, in order (1 = one at a time)')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(5)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('close')
      .setDescription('Close current round voting and advance (auto-detects phase) (Admin/Mod only)')
      .addStringOption(option =>
        option
          .setName('tiebreaker-duration')
          .setDescription('Duration for tiebreaker votes if needed (e.g., "1h", "30m") - Default: 1h')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('open-matchup')
      .setDescription('Open matchup(s) for voting (Admin/Mod only)')
      .addIntegerOption(option =>
        option
          .setName('region')
          .setDescription('Region number (1-4) to open all matchups in that region')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(4)
      )
      .addStringOption(option =>
        option
          .setName('matchup')
          .setDescription('Matchup(s) to open — pick from the list, or type several: "1A,1B"')
          .setRequired(false)
          .setAutocomplete(true)
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
          .setDescription('Matchup(s) to close — pick from the list, or type several: "1A,1B"')
          .setRequired(false)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('tiebreaker-duration')
          .setDescription('Duration for tiebreaker votes if needed (e.g., "1h", "30m", "2h") - Default: 1h')
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
      .setName('list-groups')
      .setDescription('List all groups and their titles')
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

/**
 * Suggestions for open-matchup / close-matchup's `matchup`: nobody remembers
 * "2C". Opening lists the current round's matchups nobody has voted on yet;
 * closing lists the ones voting now; each shows both titles. A typed comma
 * list keeps working — suggestions complete its last entry.
 */
export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== 'matchup') return interaction.respond([]);

  const subcommand = interaction.options.getSubcommand();
  const tournament = bracketManager.loadTournament(interaction.guildId);
  if (!tournament || tournament.status !== 'knockout') return interaction.respond([]);

  const wanted = subcommand === 'close-matchup'
    ? (m) => m.status === 'voting'
    : (m) => m.status === 'pending' && !m.winner;

  const typed = String(focused.value || '');
  const parts = typed.split(',');
  const last = parts.pop().trim().toLowerCase();
  const already = new Set(parts.map(p => p.trim().toUpperCase()).filter(Boolean));
  const prefix = parts.length ? `${parts.map(p => p.trim()).join(',')},` : '';

  const short = (t) => (t.length > 30 ? `${t.slice(0, 29)}…` : t);
  const choices = tournament.knockoutBracket
    .filter(m => m.round === tournament.phase && m.movie1 && m.movie2 && wanted(m))
    .sort((a, b) => a.position - b.position)
    .map(m => ({ m, label: getRegionalLabel(m.position, m.round) }))
    // "2" or "2b" is a label being typed — matching titles too would offer
    // every matchup with a 2 in a title; anything else searches titles
    .filter(({ m, label }) => !already.has(label.toUpperCase())
      && (!last || (/^[1-4][a-h]?$/.test(last) || last.startsWith('fin')
        ? label.toLowerCase().startsWith(last)
        : m.movie1.title.toLowerCase().includes(last) || m.movie2.title.toLowerCase().includes(last))))
    .slice(0, 25)
    .map(({ m, label }) => ({
      name: `${prefix}${label} · ${short(m.movie1.title)} vs ${short(m.movie2.title)}`.slice(0, 100),
      value: `${prefix}${label}`.slice(0, 100),
    }));

  return interaction.respond(choices);
}

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();
  console.log('[/bracket] Subcommand received:', subcommand);

  // Check if the /bracket command is enabled at all for this server
  const hasPermission = await canUseCommand(interaction.guildId, interaction.member, 'bracket');
  if (!hasPermission) {
    await interaction.reply({
      content: '❌ The `/bracket` command is currently disabled for regular users. Contact a server administrator for more information.',
      ephemeral: true,
    });
    return;
  }

  // Check admin/mod permissions for management commands
  const requiresAdmin = ADMIN_SUBCOMMANDS;
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
      case 'setup-link':
        await handleSetupLink(interaction);
        break;
      case 'manage-titles':
        await handleManageTitles(interaction);
        break;
      case 'resize':
        await handleResize(interaction);
        break;
      case 'edit-name':
        await handleEditName(interaction);
        break;
      case 'announce':
        await handleAnnounce(interaction);
        break;
      case 'open':
        await handleSmartOpen(interaction);
        break;
      case 'close':
        await handleSmartClose(interaction);
        break;
      case 'open-groups':
        await handleOpenGroups(interaction);
        break;
      case 'close-groups':
        await handleCloseGroups(interaction);
        break;
      case 'regenerate':
        await handleRegenerate(interaction);
        break;
      case 'resolve-tiebreaker':
        await handleResolveTiebreaker(interaction);
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
      case 'list-groups':
        await handleListGroups(interaction);
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
    .setTitle('🏆 Tournament System - Complete Guide')
    .setDescription(
      '**Host professional tournaments** for movies, TV shows, games, books, or board games!\n\n' +
      '✨ **Button-based voting** • 🤖 **Auto-detection** • 📊 **Live results**'
    )
    .addFields(
      {
        name: '📋 Quick Start (Admin)',
        value:
          '1️⃣ `/bracket create name:"Tournament Name" max-titles:32`\n' +
          '2️⃣ Bot auto-selects bracket or group mode based on size\n' +
          '3️⃣ `/bracket manage-titles action:add` - Add titles, or `/bracket setup-link` to upload a file\n' +
          '4️⃣ `/bracket announce` - Announce to members\n' +
          '5️⃣ `/bracket open` - Smart command opens next round\n' +
          '6️⃣ Members vote using buttons!\n' +
          '7️⃣ `/bracket close` - Smart command closes & advances\n' +
          '8️⃣ Repeat until winner declared! 🎉',
        inline: false
      },
      {
        name: '🎯 Tournament Sizes',
        value:
          '**Bracket Mode** (Direct single-elimination):\n' +
          '• 2 titles (Finals only)\n' +
          '• 4 titles (Semifinals)\n' +
          '• 8 titles (Quarterfinals)\n' +
          '• 16 titles (Round of 16)\n' +
          '• 32 titles (Round of 32)\n\n' +
          '**Group Mode** (Groups → Knockout):\n' +
          '• 36 titles (9 groups)\n' +
          '• 40 titles (10 groups)\n' +
          '• 44 titles (11 groups)\n' +
          '• 48 titles (12 groups)\n\n' +
          '💡 **Bot automatically picks the best format!**',
        inline: false
      },
      {
        name: '🗳️ How to Vote (Everyone)',
        value:
          '**Group Stage** (if applicable):\n' +
          '• Click **"Start Voting"** button\n' +
          '• Get your personal voting dashboard (only you see it)\n' +
          '• Select **top 2 favorites** - checkmarks show your picks ✅\n' +
          '• Change votes anytime before deadline\n\n' +
          '**Knockout Stage:**\n' +
          '• Click **"Start Voting"** button\n' +
          '• Vote for **1 winner per matchup**\n' +
          '• Dashboard shows all open matchups',
        inline: false
      },
      {
        name: '🎮 Smart Commands (Admin)',
        value:
          '**🤖 Auto-Detection Commands:**\n' +
          '• `/bracket open` - Opens next round (any phase)\n' +
          '• `/bracket close` - Closes current round (any phase)\n\n' +
          '**Granular Control:**\n' +
          '• `/bracket open-groups groups:"A,B,C"` - Open specific groups\n' +
          '• `/bracket close-groups groups:"A,B,C"` - Close specific groups\n' +
          '• `/bracket open-matchup matchup:"1A,2B"` - Open matchups\n' +
          '• `/bracket close-matchup matchup:"1A"` - Close matchups\n\n' +
          '💡 Leave parameters blank for **interactive selectors**!',
        inline: false
      },
      {
        name: '👥 Everyone Commands',
        value:
          '• `/bracket status` - Live standings & vote counts\n' +
          '• `/bracket view` - Visual bracket diagram\n' +
          '• `/bracket my-votes` - Your voting history\n' +
          '• `/bracket help` - This guide',
        inline: false
      },
      {
        name: '⚙️ Admin Commands',
        value:
          '• `/bracket manage-titles` - Add/remove titles\n' +
          '• `/bracket setup-link` - Set up from a CSV/JSON file on the web\n' +
          '• `/bracket extend-voting` - Add more time\n' +
          '• `/bracket resolve-tiebreaker` - Manually resolve ties\n' +
          '• `/bracket export` - Save results (JSON/Markdown)\n' +
          '• `/bracket cancel` - Cancel tournament',
        inline: false
      },
      {
        name: '⚡ Automatic Features',
        value:
          '✅ **Auto-close voting** at deadline\n' +
          '✅ **1-hour warnings** before deadline\n' +
          '✅ **Live vote counts** update in real-time\n' +
          '✅ **Tiebreaker voting** for tied results\n' +
          '✅ **Results announcement** when rounds close\n' +
          '✅ **Button feedback** - selected votes show blue\n' +
          '✅ **Interactive selectors** - click to choose regions/matchups',
        inline: false
      },
      {
        name: '💡 Pro Tips',
        value:
          '• **Duration syntax:** `"24h"`, `"3d"`, `"30m"` (5min-30days)\n' +
          '• **Multi-input:** `groups:"A,B,C"` or `matchup:"1A,2B,3C"`\n' +
          '• **Region selector:** For large brackets (>5 matchups), bot shows regions\n' +
          '• **Search integration:** Bot auto-searches when adding titles\n' +
          '• **Custom images:** Upload your own when adding titles\n' +
          '• **AI images:** Generate matchup images with `/bracket image`\n' +
          '• **Export options:** Markdown for Discord, JSON for a backup you can re-import',
        inline: false
      },
      {
        name: '📊 Vote Tracking',
        value:
          '**Participation Stats:**\n' +
          '• Voting streaks tracked per user\n' +
          '• Total votes counted (group + knockout)\n' +
          '• Last voted timestamp\n' +
          '• View with `/bracket my-votes`\n\n' +
          '**Server Stats:**\n' +
          '• Total tournaments run\n' +
          '• Total votes cast\n' +
          '• Popular tournament types\n' +
          '• View with `/eggshen-stats`',
        inline: false
      }
    )
    .setFooter({ text: `Full documentation: ${config.docsUrl.replace(/^https?:\/\//, '')}/commands/brackets` });
  
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

/**
 * A private link to the setup form, where a tournament can be built from an
 * uploaded CSV/JSON file or filled in by hand. Ephemeral: the link is a
 * credential for this server's tournament until it expires.
 */
async function handleSetupLink(interaction) {
  // This server's own address when it has one, so a test server's links
  // go to its test site (see getPublicBotUrl)
  const botUrl = getPublicBotUrl(await loadGuildConfig(interaction.guildId));
  if (!botUrl) {
    await interaction.reply({
      content: '❌ No address is set for links to this bot, so a working link can\'t be built. Set one with `/eggshen-config-website bot-url`, or `PUBLIC_BOT_URL` in `.env`.',
      ephemeral: true,
    });
    return;
  }

  let token;
  try {
    token = signSetupToken({ guildId: interaction.guildId, userId: interaction.user.id });
  } catch (error) {
    await interaction.reply({ content: `❌ ${error.message}`, ephemeral: true });
    return;
  }

  const url = `${botUrl}/tournament-setup?token=${token}`;
  const button = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('Open Tournament Setup').setStyle(ButtonStyle.Link).setURL(url).setEmoji('🏆')
  );

  const tournament = bracketManager.loadTournament(interaction.guildId);
  const running = tournament && !['setup', 'completed', 'cancelled'].includes(tournament.status);
  const minutes = Math.round(SETUP_LINK_TTL_MS / 60000);

  await interaction.reply({
    content:
      `🔒 This link is just for you and works for ${minutes} minutes. Anyone you give it to can change this server's tournament setup.\n` +
      (running
        ? `\n"${tournament.name}" is already voting, so the form can only download a backup of it.`
        : '\nUpload a CSV or JSON file, or fill the form in by hand. You can keep editing until voting opens.'),
    components: [button],
    ephemeral: true,
  });
}

async function handleCreate(interaction) {
  const name = interaction.options.getString('name');
  const maxTitles = interaction.options.getInteger('max-titles') || 32; // Default to 32 titles
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
  
  const tournament = bracketManager.createTournament(guildId, name, interaction.user.id, maxTitles);
  
  if (!tournament) {
    await interaction.reply({
      content: `❌ Failed to create tournament. Max titles must be between 2 and 48.`,
      ephemeral: true,
    });
    return;
  }
  
  // Build description based on mode
  let description, modeInfo;
  if (tournament.mode === 'bracket') {
    description = `Tournament created in **Bracket Mode**! Add up to ${maxTitles} titles, then generate the bracket.`;
    modeInfo = `Direct matchup voting (A vs B)`;
  } else {
    description = `Tournament created in **Group Stage Mode**! Add titles to ${tournament.groupCount} groups (4 per group).`;
    modeInfo = `Groups → Knockout (${tournament.groupCount} groups)`;
  }
  
  const embed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle(`🏆 ${name}`)
    .setDescription(description)
    .addFields(
      { name: 'Status', value: 'Setup', inline: true },
      { name: 'Mode', value: modeInfo, inline: true },
      { name: 'Max Titles', value: `${maxTitles} titles`, inline: true },
      { name: 'Creator', value: `<@${interaction.user.id}>`, inline: false }
    )
    .setFooter({ text: tournament.mode === 'bracket' 
      ? 'Use /bracket manage-titles to add titles • Auto-selects groups if not specified'
      : 'Use /bracket manage-titles to add titles to groups A-' + String.fromCharCode(64 + tournament.groupCount) 
    });
  
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

/**
 * Unified title management (add or remove)
 */
async function handleManageTitles(interaction) {
  const action = interaction.options.getString('action');
  
  if (action === 'add') {
    await handleAddTitle(interaction);
  } else if (action === 'remove') {
    await handleRemoveTitle(interaction);
  } else {
    await interaction.reply({
      content: '❌ Invalid action. Choose "Add Title" or "Remove Title".',
      ephemeral: true,
    });
  }
}

async function handleAddTitle(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  let group = interaction.options.getString('group');
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

  // `type` and `title` are optional in the schema because removal shares this
  // subcommand. Leaving out `type` used to crash with no reply at all (seen in
  // production). After the first title the tournament's type is fixed anyway,
  // so fall back to it.
  const type = interaction.options.getString('type') || tournament.type;
  if (!type || !title) {
    await interaction.editReply({
      content: !title
        ? '❌ Choose a `title` to search for.'
        : '❌ Choose a `type` (movie, TV, game, board game or book). The first title sets it for the whole tournament; after that you can leave it out.',
      ephemeral: true,
    });
    return;
  }
  
  // Auto-assign group for bracket mode, or if not specified in group mode
  if (!group || tournament.mode === 'bracket') {
    if (tournament.mode === 'bracket') {
      group = 'A'; // Placeholder - won't be used in bracket mode
    } else {
      // Group mode: find first available group
      const allowedGroups = 'ABCDEFGHIJKL'.slice(0, tournament.groupCount);
      for (const g of allowedGroups) {
        const currentGroup = tournament.groups[g];
        if (!currentGroup || currentGroup.movies.length < 4) {
          group = g;
          break;
        }
      }
      if (!group) {
        await interaction.editReply({
          content: '❌ All groups are full! Generate the bracket to proceed.',
          ephemeral: true,
        });
        return;
      }
    }
  }
  
  // Search for the title using the appropriate API
  let results = [];
  try {
    results = await searchTitleCandidates(type, title);
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
    const entry = await completeEntry(buildEntryFromResult(results[0], type));
    
    // Apply custom image if provided
    if (customImage) {
      entry.customImageUrl = customImage;
    }
    
    const result = bracketManager.addTitle(interaction.guildId, group, type, entry);

    if (!result.success) {
      await interaction.editReply({
        content: `❌ ${result.error}`,
        ephemeral: true,
      });
      return;
    }

    await interaction.editReply({ embeds: [buildTitleAddedEmbed(tournament, group, entry, result.titleCount)] });
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
    // The year as buildEntryFromResult reads it. This read raw-API names
    // (`YearPublished`, `volumeInfo.publishedDate`) the services don't
    // return, so board game and book lists showed no years — and "Catan"
    // lists dozens of editions and spin-offs.
    const year = buildEntryFromResult(result, type).year;
    
    const yearStr = year ? ` (${year})` : '';
    const overview = result.overview || result.description || 'No description';
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
  
  // In bracket mode `group` is only a placeholder, so don't show it
  const target = tournament.mode === 'bracket' ? 'the Tournament' : `Group ${group}`;
  const embed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle(`🏆 Select Title for ${target}`)
    .setDescription(`Found ${results.length} ${getTypeLabel(type).toLowerCase()} matching "${title}". Select the correct one to add to the bracket.`)
    .setFooter({ text: `Adding to ${target} • ${getTypeLabel(type)}` });
  
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
  
  if (!position) {
    await interaction.reply({
      content: '❌ Choose a `position` to remove. `/bracket list-groups` shows each title\'s number.',
      ephemeral: true,
    });
    return;
  }

  if (tournament.mode === 'bracket') {
    const result = bracketManager.removeTitle(guildId, null, position);
    if (!result.success) {
      await interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('🗑️ Removed from Tournament')
      .setDescription(`**${result.removedTitle.title}**${result.removedTitle.year ? ` (${result.removedTitle.year})` : ''}`)
      .addFields({ name: 'Progress', value: `${result.titleCount}/${tournament.maxTitles} titles`, inline: true })
      // Later titles shift up one, so a second removal by the old number would hit the wrong one
      .setFooter({ text: 'Titles after it moved up one position — check /bracket list-groups before removing another' });

    const imageUrl = result.removedTitle.customImageUrl || result.removedTitle.posterUrl;
    if (imageUrl) {
      embed.setThumbnail(imageUrl);
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  // Check if group has titles
  const groupData = tournament.groups[group];
  if (!groupData || groupData.movies.length === 0) {
    await interaction.reply({
      content: group ? `❌ Group ${group} has no titles to remove.` : '❌ Choose the `group` to remove a title from.',
      ephemeral: true,
    });
    return;
  }

  // Remove the title
  const result = bracketManager.removeTitle(guildId, group, position);

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
             `1️⃣ Add 4 titles to Group ${group} with \`/bracket manage-titles action:add\`\n` +
             `2️⃣ Resize tournament to ${suggestedGroupCount} groups with \`/bracket resize groups:${suggestedGroupCount}\``,
      inline: false
    });
  } else if (result.titleCount < 4) {
    embed.setFooter({ text: `Add ${4 - result.titleCount} more title(s) to Group ${group} with /bracket manage-titles action:add` });
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
  
  // A straight bracket has no groups: count its titles instead. This used
  // to show "(null groups)" and 0 entries for every straight bracket.
  const isBracket = tournament.mode === 'bracket';
  const filledGroups = Object.keys(tournament.groups).filter(
    key => tournament.groups[key].movies && tournament.groups[key].movies.length === 4
  ).length;
  const totalGroups = tournament.groupCount;
  const allowedGroupLetters = 'ABCDEFGHIJKL'.slice(0, tournament.groupCount || 0);
  const titleCount = isBracket
    ? tournament.titles.length
    : Object.values(tournament.groups).reduce((sum, g) => sum + (g.movies?.length || 0), 0);
  
  // The setup form can save a default message and banner; typed options win
  const message = customMessage || tournament.announcement?.message;
  const imageUrl = imageAttachment?.url || tournament.announcement?.imageUrl;
  
  // Build announcement embed
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`🏆 ${tournament.name}`)
    .setDescription(
      message || 
      `A new tournament has been created! Get ready to vote for your favorites.`
    )
    .addFields(
      { name: 'Tournament Type', value: tournament.type ? getTypeLabel(tournament.type) : 'Not set yet', inline: true },
      isBracket
        ? { name: 'Format', value: 'Straight bracket', inline: true }
        : { name: 'Groups', value: `${allowedGroupLetters.split('').join(', ')} (${totalGroups} groups)`, inline: true },
      { name: 'Total Entries', value: `${titleCount} titles`, inline: true }
    );
  
  // Add status based on phase
  if (tournament.status === 'setup') {
    embed.addFields({
      name: 'Status',
      value: isBracket
        ? `⚙️ Setup Phase - ${titleCount}/${tournament.maxTitles} titles added`
        : `⚙️ Setup Phase - ${filledGroups}/${totalGroups} groups filled`,
      inline: false
    });
    embed.setFooter({ text: 'Voting will begin soon! Stay tuned for announcements.' });
  } else if (tournament.status === 'group_stage') {
    embed.addFields({
      name: 'Status',
      value: '🗳️ Group Stage Voting - Vote for your top 2 in each group!',
      inline: false
    });
    embed.setFooter({ text: 'Click the buttons on the group voting message to cast your votes' });
  } else if (tournament.status === 'knockout') {
    embed.addFields({
      name: 'Status',
      value: `⚔️ Knockout Stage - ${tournament.phase}`,
      inline: false
    });
    embed.setFooter({ text: 'Head-to-head battles! Vote for your favorites.' });
  }
  
  // Add custom image if provided
  if (imageUrl) {
    embed.setImage(imageUrl);
  }
  
  // Send public announcement
  await interaction.reply({ embeds: [embed] });
}

/**
 * The confirmation shown after a title is added — shared by the direct add
 * here and the multi-result picker in selectHandler.js, which used to build
 * its own and said "Group A" even in bracket mode.
 */
export function buildTitleAddedEmbed(tournament, group, entry, titleCount) {
  const embed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setDescription(`**${entry.title}**${entry.year ? ` (${entry.year})` : ''}`);
  
  if (tournament.mode === 'bracket') {
    embed
      .setTitle('✅ Added to Tournament')
      .addFields(
        { name: 'Type', value: getTypeLabel(entry.type), inline: true },
        { name: 'Progress', value: `${titleCount}/${tournament.maxTitles} titles`, inline: true }
      );
    
    if (titleCount < tournament.maxTitles) {
      embed.setFooter({ text: `Add ${tournament.maxTitles - titleCount} more title(s) or use /bracket open to start` });
    } else {
      embed.setFooter({ text: 'All titles added! Use /bracket open to generate the bracket' });
    }
  } else {
    embed
      .setTitle(`✅ Added to Group ${group}`)
      .addFields(
        { name: 'Type', value: getTypeLabel(entry.type), inline: true },
        { name: 'Group Progress', value: `${titleCount}/4 titles`, inline: true }
      );
    
    if (titleCount < 4) {
      embed.setFooter({ text: `Add ${4 - titleCount} more title(s) to Group ${group}` });
    } else {
      embed.setFooter({ text: `Group ${group} is complete! Fill every group, then use /bracket open to start` });
    }
  }
  
  // Use custom image if provided, otherwise use API poster
  const imageUrl = entry.customImageUrl || entry.posterUrl;
  if (imageUrl) {
    embed.setThumbnail(imageUrl);
  }
  
  return embed;
}

async function handleOpenGroups(interaction) {
  await interaction.deferReply();
  
  const groupsStr = interaction.options.getString('groups');
  const groupIds = groupsStr.split(',').map(g => g.trim().toUpperCase());
  const durationStr = votingDurationFor(interaction);
  
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
  
  const result = bracketManager.openGroupVoting(interaction.guildId, groupIds, deadline, interaction.channelId);
  
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
    .setFooter({ text: 'Voting closes' })
    .setTimestamp(deadline); // a footer can't render <t:…>; this shows in each viewer's time zone
  
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
    embeds: embeds, 
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
  
  // Get tiebreaker duration (default to 1 hour)
  const tiebreakerDurationStr = tiebreakerDurationFor(interaction);
  const tiebreakerDurationMs = parseDuration(tiebreakerDurationStr);
  
  if (!tiebreakerDurationMs) {
    await interaction.editReply('❌ Invalid tiebreaker duration format. Use format like "1h", "30m", "2h"');
    return;
  }
  
  if (!isValidTiebreakerDuration(tiebreakerDurationMs)) {
    await interaction.editReply('❌ Tiebreaker duration must be between 5 minutes (5m) and 7 days (7d)');
    return;
  }
  
  const result = bracketManager.closeGroupVoting(interaction.guildId, groupIds, tiebreakerDurationMs);

  if (!result.success) {
    await interaction.editReply(`❌ ${result.error}`);
    return;
  }

  // Build partial-vote warning if any users had incomplete votes that were discarded
  let partialVoteWarning = '';
  if (result.partialVotersDiscarded?.length > 0) {
    const byGroup = {};
    for (const { groupId, userId } of result.partialVotersDiscarded) {
      if (!byGroup[groupId]) byGroup[groupId] = [];
      byGroup[groupId].push(`<@${userId}>`);
    }
    const lines = Object.entries(byGroup)
      .map(([gid, users]) => `Group ${gid}: ${users.join(', ')}`)
      .join('\n');
    partialVoteWarning = `\n\n⚠️ **Partial votes discarded (1/2 selections):**\n${lines}\nThese users started voting but didn't select their second title. Their votes were removed to ensure fair results.`;
  }

  // Check if tiebreakers were created
  if (result.tiebreakersCreated && result.tiebreakersCreated.length > 0) {
    const tiebreakerInfo = result.tiebreakersCreated.map(tb => {
      const optionNames = tb.tiebreaker.tiedOptions.map(o => o.title).join(' vs ');
      return `**Group ${tb.groupId}** - ${tb.position} place tie: ${optionNames}`;
    }).join('\n');

    const tiebreakerDuration = formatTimeRemaining(Date.now() + tiebreakerDurationMs);

    const summaryEmbed = new EmbedBuilder()
      .setColor(0xFFAA00)
      .setTitle('🔀 Tiebreaker Voting Started')
      .setDescription(`Some groups have ties! Tiebreaker voting is now open.\n\n${tiebreakerInfo}${partialVoteWarning}`)
      .addFields({ name: '⏰ Time Remaining', value: tiebreakerDuration, inline: false })
      .setFooter({ text: 'See below to cast your vote!' });

    await interaction.editReply({ embeds: [summaryEmbed] });

    // Post individual voting embeds with buttons for each tiebreaker
    for (const tb of result.tiebreakersCreated) {
      const tiebreaker = tb.tiebreaker;
      const votingEmbed = buildTiebreakerVotingEmbed(tiebreaker);
      const buttons = buildTiebreakerButtons(tiebreaker);
      const msg = await interaction.followUp({ embeds: [votingEmbed], components: buttons });
      bracketManager.storeTiebreakerMessage(interaction.guildId, tiebreaker.id, interaction.channelId, msg.id);
    }
    return;
  }
  
  const embed = new EmbedBuilder()
    .setColor(0xFF9900)
    .setTitle(`🏁 Group ${groupIds.join(', ')} Results`)
    .setDescription(`Voting closed! Here are the results:${partialVoteWarning}`);
  
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
  
  const wildcardsNeeded = bracketManager.calculateWildcardCount(result.tournament.groupCount);
  embed.setFooter({ text: wildcardsNeeded > 0 ? `Top 2 advance automatically • Best ${wildcardsNeeded} third-place finishers will be wildcards` : 'Top 2 advance automatically to knockout stage' });
  
  await interaction.editReply({ embeds: [embed] });
}

/**
 * Seed the knockout from the finished group stage and open its first round.
 * Reached from `/bracket open` once every group is closed (it replaced the
 * separate `advance-knockout` subcommand). The interaction must already be
 * deferred.
 */
async function startKnockout(interaction, durationMs, { openCount = null } = {}) {
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

  if (openCount) {
    await openNextMatchups(interaction, openCount, Date.now() + durationMs);
    return;
  }

  // A ballot shows at most 5 matchups. Opening a bigger first round whole
  // (6+ groups give 8 or 16 matchups) left every voter with "Too many
  // matchups open" — so build it, and let the admin open it in parts.
  const playable = bracketResult.matchups.filter(m => m.movie1 && m.movie2).length;
  if (playable > 5) {
    await interaction.editReply(
      `✅ **Knockout bracket built:** ${roundName}, ${playable} matchups` +
      (wildcardsCount ? ` (including ${wildcardsCount} wildcard${wildcardsCount === 1 ? '' : 's'})` : '') + `.\n\n` +
      `A ballot holds up to 5 matchups, so open them a few at a time:\n` +
      `• \`/bracket open matchups:1\`: one at a time, in order\n` +
      `• \`/bracket open matchups:4\`: four at once\n` +
      `• \`/bracket open-matchup region:1\`: one region (${Math.ceil(playable / 4)} matchups)`
    );
    return;
  }
  
  // Automatically open voting for first round with specified duration
  const deadline = Date.now() + durationMs;
  const openResult = bracketManager.openKnockoutRound(interaction.guildId, tournament.phase, deadline, interaction.channelId);
  
  if (!openResult.success) {
    // If opening voting fails, still show bracket was created
    await interaction.editReply(`✅ Knockout bracket created, but failed to open voting: ${openResult.error}\n\nUse \`/bracket open\` to manually open voting.`);
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
    .setFooter({ text: 'Voting closes' })
    .setTimestamp(deadline); // a footer can't render <t:…>; this shows in each viewer's time zone
  
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
  
  // Users vote via personal dashboard - no individual matchup cards needed
  // Prevents channel flooding with one card per matchup
}

async function handleResolveTiebreaker(interaction) {
  await interaction.deferReply();

  const tiebreakerId = interaction.options.getString('tiebreaker-id');
  const winnerOption = interaction.options.getInteger('winner'); // null if not provided

  let resolveResult;
  let resolutionMethod;

  if (winnerOption !== null) {
    // Manual override: admin picked a winner
    const winnerIndex = winnerOption - 1;
    resolveResult = bracketManager.manuallyResolveTiebreaker(interaction.guildId, tiebreakerId, winnerIndex);
    resolutionMethod = 'Manual (Admin Override)';
  } else {
    // Close by vote tally — picks highest-voted option, random if still tied
    resolveResult = bracketManager.closeTiebreaker(interaction.guildId, tiebreakerId);
    resolutionMethod = resolveResult.tiebreaker?.manuallyResolved ? 'Random (no votes cast)' : 'Vote Tally';
  }

  if (!resolveResult.success) {
    await interaction.editReply(`❌ ${resolveResult.error}`);
    return;
  }

  const tiebreaker = resolveResult.tiebreaker;
  const winner = resolveResult.winner;

  // Finalize the associated group or knockout matchup
  let finalizeResult;
  if (tiebreaker.position === 'knockout') {
    finalizeResult = bracketManager.finalizeKnockoutMatchupAfterTiebreaker(interaction.guildId, tiebreakerId);
  } else {
    finalizeResult = bracketManager.finalizeGroupAfterTiebreaker(interaction.guildId, tiebreakerId);
  }

  if (!finalizeResult.success) {
    await interaction.editReply(`✅ Tiebreaker resolved, but failed to finalize: ${finalizeResult.error}`);
    return;
  }

  // Disable buttons on the voting embed if we have a message reference
  if (tiebreaker.messageChannelId && tiebreaker.messageId) {
    try {
      const channel = await interaction.client.channels.fetch(tiebreaker.messageChannelId);
      const msg = await channel.messages.fetch(tiebreaker.messageId);
      const closedEmbed = buildTiebreakerVotingEmbed(tiebreaker)
        .setColor(0x808080)
        .setTitle(`🔒 Tiebreaker Closed: ${tiebreaker.position === 'knockout' ? 'Knockout Matchup' : `Group ${tiebreaker.groupId} — ${tiebreaker.position} place`}`)
        .setDescription(`**Winner: ${winner.title}**\n\nResolution: ${resolutionMethod}`);
      setTitleThumbnail(closedEmbed, winner);
      const disabledRows = buildTiebreakerButtons(tiebreaker).map(row => {
        const newRow = new ActionRowBuilder();
        row.components.forEach(btn => newRow.addComponents(ButtonBuilder.from(btn).setDisabled(true)));
        return newRow;
      });
      await msg.edit({ embeds: [closedEmbed], components: disabledRows });
    } catch (_) { /* message may have been deleted — that's fine */ }
  }

  // Build vote summary if resolved by tally
  let voteDetails = '';
  if (winnerOption === null && tiebreaker.voteCounts) {
    voteDetails = tiebreaker.tiedOptions.map((opt, i) => {
      const votes = tiebreaker.voteCounts[i] || 0;
      return `${opt.title}: ${votes} vote${votes !== 1 ? 's' : ''}`;
    }).join('\n');
  }

  const contextLabel = tiebreaker.position === 'knockout'
    ? 'knockout matchup'
    : `Group ${tiebreaker.groupId} ${tiebreaker.position} place`;

  const embed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle('✅ Tiebreaker Resolved')
    .setDescription(`Resolved tiebreaker for ${contextLabel}`)
    .addFields(
      { name: '🏆 Winner', value: winner.title, inline: false },
      { name: '⚖️ Resolution Method', value: resolutionMethod, inline: true }
    )
    .setTimestamp();
  setTitleThumbnail(embed, winner);

  if (voteDetails) {
    embed.addFields({ name: '📊 Vote Breakdown', value: voteDetails, inline: false });
  }

  await interaction.editReply({ embeds: [embed] });

  // A knockout tiebreaker decides a matchup: the bracket, and a champion
  if (tiebreaker.position === 'knockout') {
    const guild = interaction.guild || { id: interaction.guildId, channels: { fetch: async () => null } };
    await afterKnockoutDecided(guild, tiebreaker.messageChannelId || interaction.channelId);
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

/**
 * `/bracket open matchups:N`: open the next N matchups of the knockout round,
 * in bracket order — "one at a time" is matchups:1, run again for each.
 * Earlier matchups still voting close first (as with every open). When the
 * round has nothing left to open, its last matchups close, which advances
 * the bracket, and the next round's first matchups open.
 *
 * Without this, a small bracket couldn't be run one matchup at a time:
 * `/bracket open` opened its whole first round, and open-matchup only works
 * once a bracket exists.
 */
async function openNextMatchups(interaction, count, deadline) {
  const unopened = (t) => t.knockoutBracket
    .filter(m => m.round === t.phase && m.movie1 && m.movie2 && m.status === 'pending' && !m.winner)
    .sort((a, b) => a.position - b.position);

  let tournament = bracketManager.loadTournament(interaction.guildId);
  let pending = unopened(tournament);
  const notes = [];

  if (pending.length === 0) {
    // Round fully opened: close what's still voting so the bracket advances
    const closed = await closeEarlierMatchups(interaction, []);
    if (closed) notes.push(closed);
    tournament = bracketManager.loadTournament(interaction.guildId);
    if (tournament.status === 'completed') {
      const champion = tournament.champion || tournament.winner;
      await interaction.editReply([...notes, `🏆 **${tournament.name}** is over. Champion: **${champion?.title || 'unknown'}**`].join('\n\n'));
      return;
    }
    pending = unopened(tournament);
    if (pending.length === 0) {
      const ties = tournament.knockoutBracket.filter(m => m.round === tournament.phase && m.status === 'tiebreaker');
      await interaction.editReply([...notes, ties.length
        ? `⏳ Waiting on the tiebreaker for ${ties.map(m => getRegionalLabel(m.position, m.round)).join(', ')} before the next round can open.`
        : '❌ Nothing left to open in this round.'].join('\n\n'));
      return;
    }
  }

  const next = pending.slice(0, count);
  const closedNow = await closeEarlierMatchups(interaction, next.map(m => m.id));
  if (closedNow) notes.push(closedNow);

  const result = bracketManager.openKnockoutMatchups(interaction.guildId, next.map(m => m.id), deadline, interaction.channelId);
  if (!result.success || result.opened.length === 0) {
    await interaction.editReply([...notes, `❌ ${result.error || 'Nothing could be opened.'}`].join('\n\n'));
    return;
  }

  tournament = result.tournament;
  const roundName = tournament.phase.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  const left = unopened(tournament).length;
  const lines = result.opened.map(m => `**${getRegionalLabel(m.position, m.round)}** · ${m.movie1.title} vs ${m.movie2.title}`);

  const embed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle(`📊 ${roundName} - ${result.opened.length === 1 ? 'Matchup' : 'Matchups'} Open!`)
    .setDescription(
      `${lines.join('\n')}\n\n` +
      `**📝 How to Vote:** click "Start Voting" below and pick one title per matchup.\n\n` +
      `⏰ **Voting closes** <t:${Math.floor(deadline / 1000)}:R>`
    )
    .setFooter({ text: left > 0 ? `${left} more in this round • /bracket open matchups:${count} opens the next` : 'Last of this round • /bracket open matchups:1 moves on to the next round' });

  const startVotingButton = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`start_knockout_voting_${tournament.phase}`)
      .setLabel('🗳️ Start Voting')
      .setStyle(ButtonStyle.Success)
  );

  await interaction.editReply({ content: notes.join('\n\n') || undefined, embeds: [embed], components: [startVotingButton] });
}

/**
 * Smart open - auto-detects tournament phase and opens next appropriate round
 */
async function handleSmartOpen(interaction) {
  await interaction.deferReply();

  let tournament = bracketManager.loadTournament(interaction.guildId);
  
  if (!tournament) {
    await interaction.editReply('❌ No tournament found. Create one with `/bracket create` first.');
    return;
  }
  
  const durationStr = votingDurationFor(interaction);
  
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

  // Starting from setup. Every add-title reply tells people to run
  // `/bracket open` here, but this used to reject the setup status outright,
  // leaving the since-removed `advance-knockout` as the only way to start.
  let bracketJustGenerated = false;
  if (tournament.status === 'setup' && tournament.mode === 'bracket') {
    const generated = bracketManager.generateKnockoutBracket(interaction.guildId);
    if (!generated.success) {
      await interaction.editReply(`❌ ${generated.error}`);
      return;
    }
    tournament = generated.tournament;
    bracketJustGenerated = true;
  } else if (tournament.status === 'setup') {
    // A group with fewer than 4 titles would open with a lopsided vote
    const incomplete = 'ABCDEFGHIJKL'.slice(0, tournament.groupCount).split('')
      .map(id => ({ id, count: tournament.groups[id]?.movies?.length || 0 }))
      .filter(g => g.count < 4);
    if (incomplete.length > 0) {
      await interaction.editReply(
        `❌ Every group needs 4 titles before voting can open.\n\n` +
        `**Not full yet:** ${incomplete.map(g => `${g.id} (${g.count}/4)`).join(', ')}`
      );
      return;
    }
    // Only routes into the branch below; openGroupVoting persists the status
    tournament.status = 'group_stage';
  }

  // `matchups:N` paces a knockout round: the next N matchups in order
  const matchupsWanted = interaction.options.getInteger('matchups');
  if (matchupsWanted && tournament.status === 'knockout') {
    await openNextMatchups(interaction, matchupsWanted, deadline);
    return;
  }

  // Auto-detect phase
  if (tournament.status === 'group_stage') {
    // "Open the next round": groups that haven't voted yet, then the knockout.
    // This used to select every group not currently voting — including ones
    // already closed with results — so after the group stage it reopened
    // finished groups instead of moving on.
    const groups = Object.entries(tournament.groups);
    const closedGroups = groups
      .filter(([_, g]) => !g.votingOpen && g.status !== 'closed' && g.status !== 'tiebreaker')
      .map(([id, _]) => id);

    if (closedGroups.length === 0) {
      const unfinished = groups
        .filter(([_, g]) => g.status !== 'closed')
        .map(([id, g]) => `${id}${g.status === 'tiebreaker' ? ' (tiebreaker)' : ''}`);
      if (unfinished.length > 0) {
        await interaction.editReply(
          `❌ Nothing new to open. Still in progress: ${unfinished.join(', ')}\n\n` +
          `Close them with \`/bracket close\` (and settle any tiebreakers), then run \`/bracket open\` again to start the knockout.`
        );
        return;
      }
      await startKnockout(interaction, durationMs, { openCount: matchupsWanted });
      return;
    }

    const result = bracketManager.openGroupVoting(interaction.guildId, closedGroups, deadline, interaction.channelId);
    
    if (!result.success) {
      await interaction.editReply(`❌ ${result.error}`);
      return;
    }
    
    const timeRemaining = formatTimeRemaining(deadline);
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('📊 Group Stage Voting Opened')
      .setDescription(
        `**Opened groups:** ${closedGroups.join(', ')}\n\n` +
        `**📝 How to Vote:**\n` +
        `🔹 Click the "Start Voting" button below\n` +
        `🔹 Select your top 2 favorites in each group\n` +
        `🔹 Your choices are saved instantly\n\n` +
        `⏰ **Voting closes in:** ${timeRemaining}`
      )
      .setFooter({ text: 'Top 2 from each group advance to knockout bracket' });
    
    const startVotingButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        // The handler routes on the `start_group_voting_` prefix and reads the
        // groups after it; a bare 'start_group_voting' matched nothing, so this
        // button failed for everyone.
        .setCustomId(`start_group_voting_${closedGroups.join(',')}`)
        .setLabel('🗳️ Start Voting')
        .setStyle(ButtonStyle.Success)
    );
    
    await interaction.editReply({ embeds: [embed], components: [startVotingButton] });
    
  } else if (tournament.status === 'knockout') {
    // Open knockout round matchups
    const currentRoundMatchups = tournament.knockoutBracket.filter(m => 
      m.round === tournament.phase && m.movie1 && m.movie2
    );
    
    if (currentRoundMatchups.length === 0) {
      await interaction.editReply(`❌ No matchups ready for ${tournament.phase.replace(/_/g, ' ')}. Winners need to be advanced first.`);
      return;
    }
    
    // Check if too many for one message
    if (currentRoundMatchups.length > 5) {
      const roundName = tournament.phase.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const matchupsPerRegion = Math.ceil(currentRoundMatchups.length / 4);
      await interaction.editReply(
        (bracketJustGenerated
          ? `✅ **Bracket generated!** ${roundName} has ${currentRoundMatchups.length} matchups - too many for one voting session.\n\n`
          : `❌ **${roundName} has ${currentRoundMatchups.length} matchups** - too many for one voting session.\n\n`) +
        `A ballot holds up to 5 matchups, so open them a few at a time:\n` +
        `• \`/bracket open matchups:1\`: one at a time, in order\n` +
        `• \`/bracket open matchups:4\`: four at once\n` +
        `• \`/bracket open-matchup region:1\`: one region (~${matchupsPerRegion} matchup${matchupsPerRegion !== 1 ? 's' : ''})`
      );
      return;
    }
    
    const closedNote = await closeEarlierMatchups(interaction);
    const result = bracketManager.openKnockoutRound(interaction.guildId, tournament.phase, deadline, interaction.channelId);
    
    if (!result.success) {
      await interaction.editReply(`❌ ${result.error}`);
      return;
    }
    
    const roundName = tournament.phase.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const timeRemaining = formatTimeRemaining(deadline);
    
    const mainEmbed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle(`📊 ${roundName} - Voting Opened!`)
      .setDescription(
        `**Opened matchups:** ${result.matchups.map(m => getRegionalLabel(m.position, tournament.phase)).join(', ')}\n\n` +
        `**📝 How to Vote:**\n` +
        `🔹 Click the "Start Voting" button below\n` +
        `🔹 Choose ONE winner from each matchup\n` +
        `🔹 Your choices are saved instantly\n\n` +
        `⏰ **Voting closes in:** ${timeRemaining}`
      )
      .setFooter({ text: 'Voting closes' })
    .setTimestamp(deadline); // a footer can't render <t:…>; this shows in each viewer's time zone
    
    const startVotingButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`start_knockout_voting_${tournament.phase}`)
        .setLabel('🗳️ Start Voting')
        .setStyle(ButtonStyle.Success)
    );
    
    await interaction.editReply({ content: closedNote || undefined, embeds: [mainEmbed], components: [startVotingButton] });
    
  } else {
    await interaction.editReply(`❌ Tournament is in "${tournament.status}" phase. Cannot open voting.`);
  }
}

/**
 * Smart close - auto-detects tournament phase and closes current round
 */
async function handleSmartClose(interaction) {
  await interaction.deferReply();
  
  const tournament = bracketManager.loadTournament(interaction.guildId);
  
  if (!tournament) {
    await interaction.editReply('❌ No tournament found.');
    return;
  }
  
  const tiebreakerDurationStr = tiebreakerDurationFor(interaction);
  const tiebreakerDurationMs = parseDuration(tiebreakerDurationStr);
  
  if (!tiebreakerDurationMs) {
    await interaction.editReply('❌ Invalid tiebreaker duration format. Use format like "1h", "30m", "2h"');
    return;
  }
  
  if (!isValidTiebreakerDuration(tiebreakerDurationMs)) {
    await interaction.editReply('❌ Tiebreaker duration must be between 5 minutes (5m) and 7 days (7d)');
    return;
  }
  
  // Auto-detect phase
  if (tournament.status === 'group_stage') {
    // Close all groups that are voting
    const votingGroups = Object.entries(tournament.groups)
      .filter(([_, g]) => g.status === 'voting' || g.votingOpen)
      .map(([id, _]) => id);
    
    if (votingGroups.length === 0) {
      await interaction.editReply('❌ No groups are currently open for voting.');
      return;
    }
    
    const result = bracketManager.closeGroupVoting(interaction.guildId, votingGroups, tiebreakerDurationMs);
    
    if (!result.success) {
      await interaction.editReply(`❌ ${result.error}`);
      return;
    }
    
    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('✅ Group Voting Closed')
      .setDescription(`Closed groups: ${votingGroups.join(', ')}`);
    
    if (result.tiebreakersCreated && result.tiebreakersCreated.length > 0) {
      // Each entry is { groupId, position, tiebreaker }: reading tb.tiedOptions
      // threw after the groups had closed, so the admin saw an error and no
      // tiebreaker vote was ever posted
      const tiebreakerText = result.tiebreakersCreated
        .map(tb => `• Group ${tb.groupId} ${tb.position} place: ${tb.tiebreaker.tiedOptions.map(o => o.title).join(' vs ')}`)
        .join('\n');
      embed.addFields({
        name: '⚖️ Tiebreakers Created',
        value: tiebreakerText + `\n\nVoting duration: ${tiebreakerDurationStr}`,
        inline: false
      });
    }
    
    await interaction.editReply({ embeds: [embed] });

    // Post each tiebreaker's vote, as /bracket close-groups does
    for (const { tiebreaker } of result.tiebreakersCreated || []) {
      const msg = await interaction.followUp({ embeds: [buildTiebreakerVotingEmbed(tiebreaker)], components: buildTiebreakerButtons(tiebreaker) });
      bracketManager.storeTiebreakerMessage(interaction.guildId, tiebreaker.id, interaction.channelId, msg.id);
    }
    
  } else if (tournament.status === 'knockout') {
    // Close all voting matchups in current round
    const votingMatchups = tournament.knockoutBracket.filter(m => 
      m.round === tournament.phase && m.status === 'voting'
    );
    
    if (votingMatchups.length === 0) {
      await interaction.editReply(`❌ No voting matchups found for ${tournament.phase.replace(/_/g, ' ')}.`);
      return;
    }
    
    // Close exactly as the deadline would. Closing each matchup here on its
    // own posted no tiebreaker vote for a tie, so it sat waiting forever,
    // and skipped the results post and the champion's watchlist entry.
    const guild = interaction.guild || { id: interaction.guildId, channels: { fetch: async () => null } };
    const closed = await closeMatchupsNow(guild, votingMatchups.map(m => m.id), { tiebreakerDurationMs });
    const results = closed.filter(c => !c.tied).map(c => ({
      matchup: votingMatchups.find(m => m.id === c.id),
      winner: c.winner,
      votes1: c.votes1,
      votes2: c.votes2,
    }));
    const tiebreakersCreated = closed.filter(c => c.tied).map(c => c.tiebreaker);
    
    const roundName = tournament.phase.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle(`✅ ${roundName} Closed`)
      .setDescription(`Closed ${votingMatchups.length} matchup${votingMatchups.length !== 1 ? 's' : ''}`);
    
    if (results.length > 0) {
      const winnersText = results
        .map(r => `• ${getRegionalLabel(r.matchup.position, tournament.phase)}: **${r.winner.title}** (${r.votes1} vs ${r.votes2})`)
        .join('\n');
      embed.addFields({ name: '🏆 Winners', value: winnersText, inline: false });
    }
    
    if (tiebreakersCreated.length > 0) {
      const tiebreakerText = tiebreakersCreated
        .map(tb => `• ${tb.tiedOptions.map(o => o.title).join(' vs ')}`)
        .join('\n');
      embed.addFields({
        name: '⚖️ Tiebreakers Created',
        value: tiebreakerText + `\n\nVoting duration: ${tiebreakerDurationStr}`,
        inline: false
      });
    }
    
    await interaction.editReply({ embeds: [embed] });
    
  } else {
    await interaction.editReply(`❌ Tournament is in "${tournament.status}" phase. Cannot close voting.`);
  }
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
  
  if (tournament.status === 'setup' && tournament.mode === 'bracket') {
    embed.setDescription(`Tournament is being set up.\n\n**Titles Added:** ${tournament.titles.length}/${tournament.maxTitles}`);

  } else if (tournament.status === 'setup') {
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
  
  // Bracket mode has no groups — its titles are one numbered list, and those
  // numbers are what `manage-titles action:remove position:` expects
  if (tournament.mode === 'bracket') {
    const titles = tournament.titles || [];
    const embed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle(`🏆 ${tournament.name} - Titles`)
      .setDescription(titles.length === 0
        ? '*No titles added yet*'
        : titles.map((t, i) => `${i + 1}. ${t.title}${t.year ? ` (${t.year})` : ''}`).join('\n'))
      .setFooter({ text: `${titles.length}/${tournament.maxTitles} titles` });
    await interaction.editReply({ embeds: [embed] });
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

/**
 * Open all matchups in a specific region
 */
async function openRegionMatchups(interaction, tournament, regionNum, durationMs) {
  const deadline = Date.now() + durationMs;
  
  // Get all matchups in current round
  const currentRoundMatchups = tournament.knockoutBracket.filter(m => 
    m.round === tournament.phase && m.movie1 && m.movie2
  );
  
  if (currentRoundMatchups.length === 0) {
    await interaction.editReply(`❌ No matchups ready for ${tournament.phase.replace(/_/g, ' ')}.`);
    return;
  }
  
  // Filter by region (4 regions, March Madness style)
  const matchupsPerRegion = currentRoundMatchups.length / 4;
  const regionMatchups = currentRoundMatchups.filter((m, i) => {
    const regionStart = (regionNum - 1) * matchupsPerRegion;
    const regionEnd = regionNum * matchupsPerRegion;
    return i >= regionStart && i < regionEnd;
  });
  
  if (regionMatchups.length === 0) {
    await interaction.editReply(`❌ No matchups found in Region ${regionNum}.`);
    return;
  }
  
  // Opens only matchups nobody has voted on. This used to reset every
  // matchup in the region — wiping live votes and undoing decided results.
  const closedNote = await closeEarlierMatchups(interaction, regionMatchups.map(m => m.id));
  const result = bracketManager.openKnockoutMatchups(interaction.guildId, regionMatchups.map(m => m.id), deadline, interaction.channelId);
  if (!result.success) {
    await interaction.editReply(`❌ ${result.error}`);
    return;
  }
  const label = (m) => getRegionalLabel(m.position, tournament.phase);
  const skipped = [
    result.alreadyOpen.length ? `Already open: ${result.alreadyOpen.map(label).join(', ')}` : '',
    result.decided.length ? `Already decided: ${result.decided.map(label).join(', ')}` : '',
  ].filter(Boolean).join('\n');
  if (result.opened.length === 0) {
    await interaction.editReply(`❌ Nothing to open in Region ${regionNum}.\n\n${skipped}`);
    return;
  }
  const openedMatchups = result.opened;
  
  const roundName = tournament.phase.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  const timeRemaining = formatTimeRemaining(deadline);
  
  const mainEmbed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle(`📊 ${roundName} - Region ${regionNum} - ${openedMatchups.length} Matchups Opened!`)
    .setDescription(
      `**Opened matchups:** ${openedMatchups.map(label).join(', ')}\n\n` +
      (skipped ? `${skipped}\n\n` : '') +
      `**📝 How to Vote:**\n` +
      `🔹 Click the "Start Voting" button below\n` +
      `🔹 You'll get your own personal voting dashboard\n` +
      `🔹 Your choices are saved instantly\n` +
      `🔹 Only you can see your selections\n\n` +
      `⏰ **Voting closes in:** ${timeRemaining}\n` +
      `💡 **Tip:** You can change your votes anytime!`
    )
    .setFooter({ text: 'Voting closes' })
    .setTimestamp(deadline); // a footer can't render <t:…>; this shows in each viewer's time zone
  
  const startVotingButton = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`start_knockout_voting_${tournament.phase}`)
      .setLabel('🗳️ Start Voting')
      .setStyle(ButtonStyle.Success)
  );
  
  await interaction.editReply({ content: closedNote || undefined, embeds: [mainEmbed], components: [startVotingButton] });
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
  
  // Count matchups by region (4 regions, March Madness style)
  const matchupsPerRegion = currentRoundMatchups.length / 4;
  const region1Matchups = currentRoundMatchups.filter((m, i) => i < matchupsPerRegion);
  const region2Matchups = currentRoundMatchups.filter((m, i) => i >= matchupsPerRegion && i < matchupsPerRegion * 2);
  const region3Matchups = currentRoundMatchups.filter((m, i) => i >= matchupsPerRegion * 2 && i < matchupsPerRegion * 3);
  const region4Matchups = currentRoundMatchups.filter((m, i) => i >= matchupsPerRegion * 3);
  
  const timeRemaining = formatTimeRemaining(Date.now() + durationMs);
  
  // Build embed
  const embed = new EmbedBuilder()
    .setColor(0x4EC5ED)
    .setTitle(`🏆 Select Region to Open - ${roundName}`)
    .setThumbnail(interaction.client.user.displayAvatarURL())
    .setDescription(
      `Choose which region of the bracket to open for voting:\n\n` +
      `**Region 1:** ${region1Matchups.length} matchup${region1Matchups.length !== 1 ? 's' : ''}\n` +
      `**Region 2:** ${region2Matchups.length} matchup${region2Matchups.length !== 1 ? 's' : ''}\n` +
      `**Region 3:** ${region3Matchups.length} matchup${region3Matchups.length !== 1 ? 's' : ''}\n` +
      `**Region 4:** ${region4Matchups.length} matchup${region4Matchups.length !== 1 ? 's' : ''}\n\n` +
      `⏰ **Voting duration:** ${timeRemaining}\n` +
      `💡 **Tip:** Opening by region keeps voting manageable and builds anticipation!`
    )
    .setFooter({ text: 'Buttons expire after 15 minutes' });
  
  // Create region buttons (2 rows of 2 buttons each)
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`open_region_1_${durationMs}`)
      .setLabel(`Region 1 (${region1Matchups.length})`)
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🟦'),
    new ButtonBuilder()
      .setCustomId(`open_region_2_${durationMs}`)
      .setLabel(`Region 2 (${region2Matchups.length})`)
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🟩')
  );
  
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`open_region_3_${durationMs}`)
      .setLabel(`Region 3 (${region3Matchups.length})`)
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🟪'),
    new ButtonBuilder()
      .setCustomId(`open_region_4_${durationMs}`)
      .setLabel(`Region 4 (${region4Matchups.length})`)
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🟫')
  );
  
  await interaction.editReply({ embeds: [embed], components: [row1, row2] });
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
  
  const regionParam = interaction.options.getInteger('region');
  const matchupInput = interaction.options.getString('matchup');
  const durationStr = votingDurationFor(interaction);
  
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
    await interaction.editReply('❌ No knockout bracket yet. Close every group, then run `/bracket open` to start the knockout.');
    return;
  }
  
  // If region specified, open all matchups in that region
  if (regionParam) {
    return await openRegionMatchups(interaction, tournament, regionParam, durationMs);
  }
  
  // Get all matchups in current round
  const currentRoundMatchups = tournament.knockoutBracket.filter(m => 
    m.round === tournament.phase && m.movie1 && m.movie2
  );
  
  // If no matchup/region provided and too many matchups, show region selector
  if ((!matchupInput || matchupInput.trim().length === 0) && currentRoundMatchups.length > 5) {
    return await showRegionSelector(interaction, tournament, durationMs);
  }
  
  // If no matchup provided, show interactive matchup selection
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
    
    openedMatchups.push({ label: matchupLabel, matchup });
  }
  
  // Open through the shared path, which leaves matchups already voting or
  // decided untouched. This used to reopen a decided matchup — deleting its
  // result while its winner stayed seated in the next round.
  const labelById = new Map(openedMatchups.map(o => [o.matchup.id, o.label]));
  // Close the earlier matchups only if something new will open. This closed
  // them first, so a typo ("Invalid label") or a matchup already open still
  // ended whatever was voting, then said "No matchups were opened".
  const openable = openedMatchups.filter(o => o.matchup.status === 'pending' && !o.matchup.winner);
  if (openable.length === 0) {
    for (const { label, matchup } of openedMatchups) {
      errors.push(matchup.status === 'voting' ? `⚠️ Matchup ${label} already open` : `⚠️ Matchup ${label} is already decided`);
    }
    await interaction.editReply(`❌ No matchups were opened.\n\n${errors.join('\n')}`);
    return;
  }
  const closedNote = await closeEarlierMatchups(interaction, openedMatchups.map(o => o.matchup.id));
  const result = bracketManager.openKnockoutMatchups(interaction.guildId, openedMatchups.map(o => o.matchup.id), deadline, interaction.channelId);
  if (!result.success) {
    await interaction.editReply(`❌ ${result.error}`);
    return;
  }
  result.alreadyOpen.forEach(m => errors.push(`⚠️ Matchup ${labelById.get(m.id)} already open`));
  result.decided.forEach(m => errors.push(`⚠️ Matchup ${labelById.get(m.id)} is already decided`));
  openedMatchups.length = 0;
  result.opened.forEach(m => openedMatchups.push({ label: labelById.get(m.id), matchup: m }));
  
  if (openedMatchups.length === 0) {
    await interaction.editReply(`❌ No matchups were opened.\n\n${errors.join('\n')}`);
    return;
  }
  
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
    .setFooter({ text: 'Voting closes' })
    .setTimestamp(deadline); // a footer can't render <t:…>; this shows in each viewer's time zone
  
    const startVotingButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`start_knockout_voting_${tournament.phase}`)
        .setLabel('🗳️ Start Voting')
        .setStyle(ButtonStyle.Success)
    );
  
    await interaction.editReply({ content: closedNote || undefined, embeds: [mainEmbed], components: [startVotingButton] });
    
    // Users vote via personal dashboard - no individual matchup card needed
    
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
    .setFooter({ text: 'Voting closes' })
    .setTimestamp(deadline); // a footer can't render <t:…>; this shows in each viewer's time zone
  
  // Add "Start Voting" button
  const startVotingButton = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`start_knockout_voting_${tournament.phase}`)
      .setLabel('🗳️ Start Voting')
      .setStyle(ButtonStyle.Success)
  );
  
  await interaction.editReply({ content: closedNote || undefined, embeds: [mainEmbed], components: [startVotingButton] });
  
  // Users vote via personal dashboard - no individual matchup cards needed
  // Prevents channel flooding with one card per matchup
  
  if (errors.length > 0) {
    await interaction.followUp({ content: `⚠️ Some issues:\n${errors.join('\n')}`, ephemeral: true });
  }
}

async function handleCloseMatchup(interaction) {
  await interaction.deferReply();
  
  const matchupInput = interaction.options.getString('matchup');
  const tournament = bracketManager.loadTournament(interaction.guildId);
  
  // Get tiebreaker duration (default to 1 hour)
  const tiebreakerDurationStr = tiebreakerDurationFor(interaction);
  const tiebreakerDurationMs = parseDuration(tiebreakerDurationStr);
  
  if (!tiebreakerDurationMs) {
    await interaction.editReply('❌ Invalid tiebreaker duration format. Use format like "1h", "30m", "2h"');
    return;
  }
  
  if (!isValidTiebreakerDuration(tiebreakerDurationMs)) {
    await interaction.editReply('❌ Tiebreaker duration must be between 5 minutes (5m) and 7 days (7d)');
    return;
  }
  
  // If no matchup specified, show interactive selector
  if (!matchupInput || matchupInput.trim() === '') {
    return await showCloseMatchupSelector(interaction, tournament, tiebreakerDurationMs);
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
  const tiebreakersCreated = [];
  
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
    const result = bracketManager.closeKnockoutMatchup(interaction.guildId, matchup.id, tiebreakerDurationMs);
    
    if (!result.success) {
      errors.push(`❌ ${matchupLabel}: ${result.error}`);
      continue;
    }
    
    // Check if tiebreaker was created
    if (result.tiebreakerCreated) {
      const regionalLabel = getRegionalLabel(position, tournament.phase);
      tiebreakersCreated.push({
        label: regionalLabel,
        tiebreaker: result.tiebreaker
      });
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
      winnerEntry: updatedMatchup.winner,
      movie1: updatedMatchup.movie1.title,
      movie2: updatedMatchup.movie2.title,
      votes1,
      votes2,
      autoAdvanced: result.autoAdvanced
    });
  }
  
  // Build response
  
  // Check if tiebreakers were created
  if (tiebreakersCreated.length > 0) {
    const tiebreakerInfo = tiebreakersCreated.map(tb => {
      const optionNames = tb.tiebreaker.tiedOptions.map(o => o.title).join(' vs ');
      return `**Matchup ${tb.label}** - ${optionNames}`;
    }).join('\n');

    const tiebreakerDuration = formatTimeRemaining(Date.now() + tiebreakerDurationMs);

    const summaryEmbed = new EmbedBuilder()
      .setColor(0xFFAA00)
      .setTitle('🔀 Tiebreaker Voting Started')
      .setDescription(`Some matchups ended in ties! Tiebreaker voting is now open.\n\n${tiebreakerInfo}`)
      .addFields({ name: '⏰ Time Remaining', value: tiebreakerDuration, inline: false })
      .setFooter({ text: 'See below to cast your vote!' });

    await interaction.editReply({ embeds: [summaryEmbed] });

    // Post individual voting embeds with buttons for each tiebreaker
    for (const tb of tiebreakersCreated) {
      const tiebreaker = tb.tiebreaker;
      const votingEmbed = buildTiebreakerVotingEmbed(tiebreaker);
      const buttons = buildTiebreakerButtons(tiebreaker);
      const msg = await interaction.followUp({ embeds: [votingEmbed], components: buttons });
      bracketManager.storeTiebreakerMessage(interaction.guildId, tiebreaker.id, interaction.channelId, msg.id);
    }
    return;
  }
  
  if (successes.length === 0) {
    await interaction.editReply(errors.join('\n') || '❌ No matchups were closed.');
    return;
  }
  
  const roundName = tournament.phase.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  const reloadedTournament = bracketManager.loadTournament(interaction.guildId);
  
  // Single matchup closed
  if (successes.length === 1) {
    const s = successes[0];
    
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle(`🏁 ${roundName} - Matchup ${s.label} Complete!`)
      .setDescription(
        `**${s.winner}** wins!\n\n` +
        `**${s.movie1}** (${s.votes1} votes) vs **${s.movie2}** (${s.votes2} votes)`
      );
    setTitleThumbnail(embed, s.winnerEntry);
    
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

  // The bracket as it now stands, and the champion's watchlist entry if that
  // was the final (closeMatchupsNow does both on its own path)
  const guild = interaction.guild || { id: interaction.guildId, channels: { fetch: async () => null } };
  await afterKnockoutDecided(guild, interaction.channelId);
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
    .setThumbnail(avatarOf(interaction))
    .setDescription(`**${status.tournament.name}**\nPhase: ${status.tournament.phase.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}\n`);
  
  // Group votes cast
  if (status.groupVotes.length > 0) {
    const groupText = status.groupVotes.map(v => {
      const timeLeft = formatTime(v.timeRemaining);
      return `**Group ${v.group}** - Voted for #${v.choices[0].position} (${v.choices[0].title}) and #${v.choices[1].position} (${v.choices[1].title})\n⏰ ${timeLeft} remaining`;
    }).join('\n\n');
    
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
    }).join('\n');
    
    embed.addFields({ 
      name: `🗳️ Groups Available (${status.availableGroupVotes.length})`, 
      value: availText + '\n\nClick the buttons on the group voting message to vote',
      inline: false 
    });
  }
  
  // Knockout votes cast
  if (status.knockoutVotes.length > 0) {
    const knockoutText = status.knockoutVotes.map(v => {
      const roundName = v.round.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const timeLeft = formatTime(v.timeRemaining);
      return `**${roundName} #${v.position}** - Voted for **${v.votedFor}** vs ${v.opponent}\n⏰ ${timeLeft} remaining`;
    }).join('\n\n');
    
    embed.addFields({ 
      name: `✅ Knockout Votes Cast (${status.knockoutVotes.length})`, 
      value: knockoutText, 
      inline: false 
    });
  }
  
  // Available knockout votes
  if (status.availableKnockoutVotes.length > 0) {
    const availKnockoutText = status.availableKnockoutVotes.map(v => {
      const roundName = v.round.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const timeLeft = formatTime(v.timeRemaining);
      return `**${roundName} #${v.position}** - ${v.movie1} vs ${v.movie2}\n⏰ ${timeLeft} remaining`;
    }).join('\n\n');
    
    embed.addFields({ 
      name: `🗳️ Knockout Matchups Available (${status.availableKnockoutVotes.length})`, 
      value: availKnockoutText + '\n\nClick buttons on matchup messages to vote', 
      inline: false 
    });
  }
  
  // No voting activity
  if (status.groupVotes.length === 0 && status.availableGroupVotes.length === 0 && 
      status.knockoutVotes.length === 0 && status.availableKnockoutVotes.length === 0) {
    embed.setDescription(
      `**${status.tournament.name}**\nPhase: ${status.tournament.phase.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}\n\n` +
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
    // The setup form's import format: lineup and settings, re-importable with
    // /bracket setup-link. It used to dump the stored tournament whole —
    // which couldn't be imported, and put every voter's Discord id in a
    // public channel (export isn't admin-only).
    const jsonData = JSON.stringify(buildExport(tournament), null, 2);
    const buffer = Buffer.from(jsonData, 'utf-8');
    const attachment = new AttachmentBuilder(buffer, { name: `${tournament.name.replace(/\s+/g, '_')}_backup.json` });

    await interaction.editReply({
      content: `📦 **${tournament.name}** - lineup and settings. Upload it to \`/bracket setup-link\` to run it again.`,
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

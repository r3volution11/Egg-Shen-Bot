import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, AttachmentBuilder } from 'discord.js';
import * as bracketManager from '../utils/bracketManager.js';
import * as bracketVisualizer from '../utils/bracketVisualizer.js';

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
      .setDescription('Add 4 movies to a group (Admin/Mod only)')
      .addStringOption(option =>
        option
          .setName('group')
          .setDescription('Group letter (A-L)')
          .setRequired(true)
          .addChoices(...GROUP_LETTERS.map(letter => ({ name: `Group ${letter}`, value: letter })))
      )
      .addStringOption(option =>
        option.setName('movie1').setDescription('First movie title').setRequired(true)
      )
      .addStringOption(option =>
        option.setName('movie2').setDescription('Second movie title').setRequired(true)
      )
      .addStringOption(option =>
        option.setName('movie3').setDescription('Third movie title').setRequired(true)
      )
      .addStringOption(option =>
        option.setName('movie4').setDescription('Fourth movie title').setRequired(true)
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
  const group = interaction.options.getString('group');
  const movies = [
    interaction.options.getString('movie1'),
    interaction.options.getString('movie2'),
    interaction.options.getString('movie3'),
    interaction.options.getString('movie4'),
  ];
  
  const result = bracketManager.addGroupMovies(interaction.guildId, group, movies);
  
  if (!result.success) {
    await interaction.reply({
      content: `❌ ${result.error}`,
      ephemeral: true,
    });
    return;
  }
  
  const groupsComplete = Object.keys(result.tournament.groups).length;
  const totalGroups = result.tournament.groupCount;
  
  const embed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle(`Group ${group} Added`)
    .setDescription(movies.map((movie, i) => `${i + 1}. ${movie}`).join('\n'))
    .addFields(
      { name: 'Progress', value: `${groupsComplete}/${totalGroups} groups added`, inline: true }
    )
    .setFooter({ text: groupsComplete === totalGroups ? 'All groups added! Use /bracket open-groups to start voting.' : 'Add more groups with /bracket add-group' });
  
  await interaction.reply({ embeds: [embed] });
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

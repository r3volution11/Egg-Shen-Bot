/**
 * Handle button interactions with comprehensive error handling
 */
import * as logger from '../utils/logger.js';
import { EmbedBuilder } from 'discord.js';

// In-memory cache for tracking ephemeral voting dashboard messages per user
// For group stage: Key format: `${guildId}_${userId}_group_${groupId}`
// For knockout: Key format: `${guildId}_${userId}_knockout_${round}`
// Value: { messageId, channelId, timestamp }
const userVotingDashboards = new Map();

// In-memory cache for tracking public "All Votes" leaderboard messages
// Key format: `${guildId}_knockout_${round}` or `${guildId}_group_${groupId}`
// Value: { messageId, channelId, timestamp }
const publicLeaderboards = new Map();

// Clean up old dashboard entries (older than 1 hour) every 10 minutes
setInterval(() => {
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  for (const [key, value] of userVotingDashboards.entries()) {
    if (value.timestamp < oneHourAgo) {
      userVotingDashboards.delete(key);
    }
  }
  for (const [key, value] of publicLeaderboards.entries()) {
    if (value.timestamp < oneHourAgo) {
      publicLeaderboards.delete(key);
    }
  }
}, 10 * 60 * 1000);

export async function handleButtonInteraction(interaction) {
  const startTime = Date.now();
  
  try {
    // Defer update for buttons to prevent "interaction failed" errors
    // This gives us 15 minutes to process instead of 3 seconds
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate().catch(() => {
        // If defer fails, we'll handle it in the catch block
      });
    }
    
    // Handle group stage voting buttons
    if (interaction.customId.startsWith('group_vote_')) {
      await handleGroupVote(interaction);
      
      // Log successful button interaction
      const duration = Date.now() - startTime;
      logger.logButton(interaction.customId, interaction.user, interaction.guild, true);
      
      if (duration > 2000) {
        logger.logPerformance('Button: group_vote', duration, {
          userId: interaction.user.id,
          guildId: interaction.guild?.id
        });
      }
      return;
    }
    
    // Handle knockout voting buttons
    if (interaction.customId.startsWith('knockout_vote_')) {
      await handleKnockoutVote(interaction);
      
      // Log successful button interaction
      const duration = Date.now() - startTime;
      logger.logButton(interaction.customId, interaction.user, interaction.guild, true);
      
      if (duration > 2000) {
        logger.logPerformance('Button: knockout_vote', duration, {
          userId: interaction.user.id,
          guildId: interaction.guild?.id
        });
      }
      return;
    }
    
    // Handle open matchup buttons
    if (interaction.customId.startsWith('open_matchup_')) {
      await handleOpenMatchupButton(interaction);
      
      // Log successful button interaction
      const duration = Date.now() - startTime;
      logger.logButton(interaction.customId, interaction.user, interaction.guild, true);
      
      if (duration > 2000) {
        logger.logPerformance('Button: open_matchup', duration, {
          userId: interaction.user.id,
          guildId: interaction.guild?.id
        });
      }
      return;
    }
    
    // Handle close matchup buttons
    if (interaction.customId.startsWith('close_matchup_')) {
      await handleCloseMatchupButton(interaction);
      
      // Log successful button interaction
      const duration = Date.now() - startTime;
      logger.logButton(interaction.customId, interaction.user, interaction.guild, true);
      
      if (duration > 2000) {
        logger.logPerformance('Button: close_matchup', duration, {
          userId: interaction.user.id,
          guildId: interaction.guild?.id
        });
      }
      return;
    }
    
    // Handle open region buttons
    if (interaction.customId.startsWith('open_region_')) {
      await handleOpenRegionButton(interaction);
      
      // Log successful button interaction
      const duration = Date.now() - startTime;
      logger.logButton(interaction.customId, interaction.user, interaction.guild, true);
      
      if (duration > 2000) {
        logger.logPerformance('Button: open_region', duration, {
          userId: interaction.user.id,
          guildId: interaction.guild?.id
        });
      }
      return;
    }
    
    // Unknown button type
    console.warn(`[ButtonHandler] Unknown button interaction: ${interaction.customId}`);
    logger.warning(logger.LogCategory.BUTTON, 'Unknown button interaction', {
      customId: interaction.customId,
      userId: interaction.user.id,
      guildId: interaction.guild?.id
    });
    
  } catch (error) {
    console.error('[ButtonHandler] Error handling button interaction:', error);
    console.error('[ButtonHandler] CustomId:', interaction.customId);
    console.error('[ButtonHandler] Guild:', interaction.guild?.id);
    console.error('[ButtonHandler] User:', interaction.user?.id);
    
    // Log button error
    logger.logButton(interaction.customId, interaction.user, interaction.guild, false, error);
    
    // Try to send error message to user
    try {
      const errorMessage = {
        content: '❌ An error occurred while processing your vote. Please try again or contact a tournament admin.',
        ephemeral: true
      };
      
      if (interaction.deferred) {
        await interaction.followUp(errorMessage);
      } else if (!interaction.replied) {
        await interaction.reply(errorMessage);
      }
    } catch (replyError) {
      console.error('[ButtonHandler] Failed to send error message:', replyError.message);
      logger.error(logger.LogCategory.BUTTON, 'Failed to send error message after button error', {
        originalError: error.message,
        replyError: replyError.message,
        customId: interaction.customId
      });
    }
  }
}

/**
 * Handle group stage voting button clicks
 */
async function handleGroupVote(interaction) {
  const [, , groupId, movieIndexStr] = interaction.customId.split('_');
    const movieIndex = parseInt(movieIndexStr);
  
  // Dynamically import bracketManager
  const bracketManager = await import('../utils/bracketManager.js');
  const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = await import('discord.js');
  
  // Load tournament to check current votes
  const tournament = bracketManager.loadTournament(interaction.guild.id);
  if (!tournament) {
    await interaction.followUp({
      content: '❌ No tournament found.',
      ephemeral: true
    });
    return;
  }
  
  const group = tournament.groups[groupId];
  
  if (!group || !group.votingOpen) {
    await interaction.followUp({
      content: `❌ Group ${groupId} is not open for voting.`,
      ephemeral: true
    });
    return;
  }
  
  // Check if voting deadline has passed
  if (group.votingDeadline && Date.now() > group.votingDeadline) {
    await interaction.followUp({
      content: '❌ Voting for this group has ended.',
      ephemeral: true
    });
    return;
  }
  
  // Get user's current votes for this group
  const userVotes = tournament.votes?.[interaction.user.id]?.[groupId] || [];
  let newVotes = [...userVotes];
  
  // Toggle selection
  if (newVotes.includes(movieIndex)) {
    // Deselect
    newVotes = newVotes.filter(i => i !== movieIndex);
  } else {
    // Select
    if (newVotes.length >= 2) {
      await interaction.followUp({
        content: '❌ You can only vote for 2 titles per group. Deselect one first.',
        ephemeral: true
      });
      return;
    }
    newVotes.push(movieIndex);
  }
  
  // Save the vote
  const result = bracketManager.voteGroupStage(
    interaction.guild.id,
    interaction.user.id,
    groupId,
    newVotes
  );
  
  if (!result.success) {
    await interaction.followUp({
      content: `❌ ${result.error}`,
      ephemeral: true
    });
    return;
  }
  
  // Get updated group data
  const updatedGroup = result.tournament.groups[groupId];
  
  // Build persistent voting dashboard for this user
  // This shows their current selections with visual indicators
  const dashboardEmbed = buildVotingDashboard(updatedGroup, groupId, newVotes);
  
  // Check if user has an existing voting dashboard for this group
  const dashboardKey = `${interaction.guild.id}_${interaction.user.id}_group_${groupId}`;
  const existingDashboard = userVotingDashboards.get(dashboardKey);
  
  try {
    if (existingDashboard) {
      // Update existing dashboard
      const channel = await interaction.client.channels.fetch(existingDashboard.channelId).catch(() => null);
      if (channel) {
        const message = await channel.messages.fetch(existingDashboard.messageId).catch(() => null);
        if (message) {
          await message.edit({ embeds: [dashboardEmbed] });
        } else {
          // Message was deleted, create a new one
          const newMessage = await interaction.followUp({
            embeds: [dashboardEmbed],
            ephemeral: true,
            fetchReply: true
          });
          userVotingDashboards.set(dashboardKey, {
            messageId: newMessage.id,
            channelId: interaction.channelId,
            timestamp: Date.now()
          });
        }
      } else {
        // Channel not accessible, create new message
        const newMessage = await interaction.followUp({
          embeds: [dashboardEmbed],
          ephemeral: true,
          fetchReply: true
        });
        userVotingDashboards.set(dashboardKey, {
          messageId: newMessage.id,
          channelId: interaction.channelId,
          timestamp: Date.now()
        });
      }
    } else {
      // Create new dashboard
      const newMessage = await interaction.followUp({
        embeds: [dashboardEmbed],
        ephemeral: true,
        fetchReply: true
      });
      userVotingDashboards.set(dashboardKey, {
        messageId: newMessage.id,
        channelId: interaction.channelId,
        timestamp: Date.now()
      });
    }
  } catch (dashboardError) {
    console.error('[ButtonHandler] Error managing voting dashboard:', dashboardError);
    // Fallback to simple confirmation if dashboard fails
    await interaction.followUp({
      content: newVotes.length === 0 
        ? `✅ Votes removed from Group ${groupId}` 
        : `✅ Vote recorded for Group ${groupId} (${newVotes.length}/2 selected)`,
      ephemeral: true
    });
  }
  
  // Update the message to show new vote counts
  try {
    const messageEmbeds = interaction.message.embeds;
    const groupEmbedIndex = messageEmbeds.findIndex(e => 
      e.title && e.title === `Group ${groupId}`
    );
    
    if (groupEmbedIndex !== -1 && groupEmbedIndex > 0) {
      const updatedEmbed = EmbedBuilder.from(messageEmbeds[groupEmbedIndex]);
      
      // Update fields with new vote counts
      updatedEmbed.setFields(
        updatedGroup.movies.map((movie, index) => {
          const voteCount = movie.votes.length;
          return {
            name: `${index + 1}. ${movie.title}`,
            value: `${voteCount} vote${voteCount !== 1 ? 's' : ''}`,
            inline: true
          };
        })
      );
      
      const newEmbeds = [...messageEmbeds];
      newEmbeds[groupEmbedIndex] = updatedEmbed;
      
      // DO NOT update button styles in the shared message - Discord messages are global
      // and button style changes affect all users, not just the voter. This causes
      // User A's selections to appear as selected for User B, User C, etc.
      // Users see their selection feedback in the ephemeral response instead.
      
      await interaction.message.edit({ 
        embeds: newEmbeds
        // components unchanged - keep all buttons as default ButtonStyle.Secondary
      });
    }
  } catch (updateError) {
    console.error('[ButtonHandler] Error updating voting message:', updateError);
    // Don't throw - vote was already recorded successfully
  }
}

/**
 * Handle knockout voting button clicks
 */
async function handleKnockoutVote(interaction) {
  const [, , matchupId, choice] = interaction.customId.split('_');
  
  // Dynamically import bracketManager
  const bracketManager = await import('../utils/bracketManager.js');
  const { EmbedBuilder } = await import('discord.js');
  
  const result = bracketManager.voteKnockout(
    interaction.guild.id,
    interaction.user.id,
    matchupId,
    parseInt(choice)
  );
  
  if (!result.success) {
    await interaction.followUp({
      content: `❌ ${result.error}`,
      ephemeral: true
    });
    return;
  }
  
  const tournament = result.tournament;
  
  // Find the matchup to get current round
  const matchup = tournament.knockoutBracket.find(m => m.id === matchupId);
  const currentRound = matchup.round;
  
  // Get all matchups in current round that are voting
  const currentRoundMatchups = tournament.knockoutBracket.filter(m => 
    m.round === currentRound && m.status === 'voting'
  );
  
  // Build persistent knockout dashboard for this user
  const dashboardEmbed = buildKnockoutVotingDashboard(tournament, currentRound, currentRoundMatchups, interaction.user.id);
  
  // Check if user has an existing voting dashboard for this round
  const dashboardKey = `${interaction.guild.id}_${interaction.user.id}_knockout_${currentRound}`;
  const existingDashboard = userVotingDashboards.get(dashboardKey);
  
  try {
    if (existingDashboard) {
      // Try to update existing dashboard
      try {
        const channel = await interaction.client.channels.fetch(existingDashboard.channelId);
        const message = await channel.messages.fetch(existingDashboard.messageId);
        await message.edit({ embeds: [dashboardEmbed] });
        // Dashboard updated successfully
        console.log(`[ButtonHandler] Updated knockout dashboard for user ${interaction.user.id}`);
      } catch (fetchError) {
        // Message no longer exists, remove from cache and create new one
        console.log(`[ButtonHandler] Dashboard message not found, creating new one for user ${interaction.user.id}`);
        userVotingDashboards.delete(dashboardKey);
        const newMessage = await interaction.followUp({
          embeds: [dashboardEmbed],
          ephemeral: true
        });
        userVotingDashboards.set(dashboardKey, {
          messageId: newMessage.id,
          channelId: interaction.channelId,
          timestamp: Date.now()
        });
      }
    } else {
      // First vote - create new dashboard
      console.log(`[ButtonHandler] Creating first knockout dashboard for user ${interaction.user.id}`);
      const newMessage = await interaction.followUp({
        embeds: [dashboardEmbed],
        ephemeral: true
      });
      userVotingDashboards.set(dashboardKey, {
        messageId: newMessage.id,
        channelId: interaction.channelId,
        timestamp: Date.now()
      });
    }
  } catch (dashboardError) {
    console.error('[ButtonHandler] Error managing knockout voting dashboard:', dashboardError);
    // Fallback to simple confirmation if dashboard fails
    await interaction.followUp({
      content: `✅ Vote recorded for ${matchup.movie1.title} vs ${matchup.movie2.title}`,
      ephemeral: true
    }).catch(() => {});
  }
  
  // Update or create public "All Votes" leaderboard
  const leaderboardKey = `${interaction.guild.id}_knockout_${currentRound}`;
  const existingLeaderboard = publicLeaderboards.get(leaderboardKey);
  const leaderboardEmbed = buildPublicKnockoutLeaderboard(tournament, currentRound, currentRoundMatchups);
  
  try {
    if (existingLeaderboard) {
      // Try to update existing leaderboard
      try {
        const channel = await interaction.client.channels.fetch(existingLeaderboard.channelId);
        const message = await channel.messages.fetch(existingLeaderboard.messageId);
        await message.edit({ embeds: [leaderboardEmbed] });
        console.log(`[ButtonHandler] Updated public knockout leaderboard for round ${currentRound}`);
      } catch (fetchError) {
        // Leaderboard message no longer exists, remove from cache and create new one
        console.log(`[ButtonHandler] Public leaderboard not found, creating new one for round ${currentRound}`);
        publicLeaderboards.delete(leaderboardKey);
        const newLeaderboard = await interaction.channel.send({ embeds: [leaderboardEmbed] });
        publicLeaderboards.set(leaderboardKey, {
          messageId: newLeaderboard.id,
          channelId: interaction.channelId,
          timestamp: Date.now()
        });
      }
    } else {
      // First vote in this round - create new public leaderboard
      console.log(`[ButtonHandler] Creating first public knockout leaderboard for round ${currentRound}`);
      const newLeaderboard = await interaction.channel.send({ embeds: [leaderboardEmbed] });
      publicLeaderboards.set(leaderboardKey, {
        messageId: newLeaderboard.id,
        channelId: interaction.channelId,
        timestamp: Date.now()
      });
    }
  } catch (leaderboardError) {
    console.error('[ButtonHandler] Error managing public knockout leaderboard:', leaderboardError);
    // Don't throw - leaderboard is nice-to-have, not critical
  }
  
  // Update the embed to show new vote counts
  try {
    const votes1 = matchup.votes.movie1.length;
    const votes2 = matchup.votes.movie2.length;
    
    // Find the embed for this matchup in the original message
    const messageEmbeds = interaction.message.embeds;
    const matchupEmbedIndex = messageEmbeds.findIndex(e => 
      e.title && (
        e.title.includes(`Matchup ${matchup.position + 1}`) ||
        e.title.includes(matchup.round.replace(/_/g, ' '))
      )
    );
    
    if (matchupEmbedIndex !== -1) {
      const updatedEmbed = EmbedBuilder.from(messageEmbeds[matchupEmbedIndex])
        .setFields(
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
      
      const newEmbeds = [...messageEmbeds];
      newEmbeds[matchupEmbedIndex] = updatedEmbed;
      
      await interaction.message.edit({ embeds: newEmbeds });
    }
  } catch (updateError) {
    console.error('[ButtonHandler] Error updating knockout voting message:', updateError);
    // Don't throw - vote was already recorded successfully
  }
}

/**
 * Handle open matchup button clicks from interactive selector
 */
async function handleOpenMatchupButton(interaction) {
  // Parse button customId: open_matchup_{matchupId}_{durationMs}
  const [, , matchupId, durationMs] = interaction.customId.split('_');
  
  // Dynamically import bracketManager and Discord components
  const bracketManager = await import('../utils/bracketManager.js');
  const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
  
  const tournament = bracketManager.loadTournament(interaction.guild.id);
  
  if (!tournament || tournament.status !== 'knockout') {
    await interaction.followUp({
      content: '❌ Tournament not in knockout phase.',
      ephemeral: true
    });
    return;
  }
  
  // Find the matchup
  const matchup = tournament.knockoutBracket.find(m => m.id === matchupId);
  
  if (!matchup) {
    await interaction.followUp({
      content: '❌ Matchup not found.',
      ephemeral: true
    });
    return;
  }
  
  if (matchup.status === 'voting') {
    await interaction.followUp({
      content: '⚠️ This matchup is already open for voting.',
      ephemeral: true
    });
    return;
  }
  
  if (matchup.status === 'closed') {
    await interaction.followUp({
      content: '❌ This matchup has already been closed.',
      ephemeral: true
    });
    return;
  }
  
  // Open the matchup
  const deadline = Date.now() + parseInt(durationMs);
  matchup.status = 'voting';
  matchup.votingOpened = Date.now();
  matchup.votingDeadline = deadline;
  if (!matchup.votes) {
    matchup.votes = { movie1: [], movie2: [] };
  }
  
  bracketManager.saveTournament(interaction.guild.id, tournament);
  
  // Format time remaining helper
  function formatTimeRemaining(deadline) {
    const remaining = deadline - Date.now();
    const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
    const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }
  
  // Get regional label helper
  function getRegionalLabel(position, round) {
    const roundSizes = {
      'round_of_32': 16,
      'round_of_16': 8,
      'quarterfinals': 4,
      'semifinals': 2,
      'finals': 1
    };
    
    if (round === 'finals') return 'Finals';
    
    const totalMatchups = roundSizes[round];
    if (!totalMatchups) return String(position + 1);
    
    const midpoint = totalMatchups / 2;
    const isLeftRegion = position < midpoint;
    const region = isLeftRegion ? '1' : '2';
    const positionInRegion = isLeftRegion ? position : position - midpoint;
    const letter = String.fromCharCode(65 + positionInRegion);
    
    return `${region}${letter}`;
  }
  
  const roundName = tournament.phase.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  const timeRemaining = formatTimeRemaining(deadline);
  const regionalLabel = getRegionalLabel(matchup.position, tournament.phase);
  const votes1 = matchup.votes.movie1.length;
  const votes2 = matchup.votes.movie2.length;
  
  // Create voting embed and buttons
  const embed = new EmbedBuilder()
    .setColor(0x4EC5ED)
    .setTitle(`${roundName} - Matchup ${regionalLabel}`)
    .setDescription(`**${regionalLabel}:** Vote for your pick!`)
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
    )
    .setFooter({ text: 'Click a button below to vote' });
  
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`knockout_vote_${matchup.id}_1`)
      .setLabel(matchup.movie1.title.length > 80 ? matchup.movie1.title.substring(0, 77) + '...' : matchup.movie1.title)
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`knockout_vote_${matchup.id}_2`)
      .setLabel(matchup.movie2.title.length > 80 ? matchup.movie2.title.substring(0, 77) + '...' : matchup.movie2.title)
      .setStyle(ButtonStyle.Primary)
  );
  
  // Send to channel (not ephemeral so everyone can vote)
  const votingMessage = await interaction.channel.send({ 
    content: `✅ **Matchup ${regionalLabel} opened!** ⏰ Voting closes in: ${timeRemaining}`,
    embeds: [embed], 
    components: [row] 
  });
  
  // Store message ID for scheduler
  bracketManager.storeMatchupVotingMessage(
    interaction.guild.id,
    matchup.id,
    interaction.channel.id,
    votingMessage.id
  );
  
  // Send confirmation to button clicker
  await interaction.followUp({
    content: `✅ Opened matchup ${regionalLabel} for voting!`,
    ephemeral: true
  });
}

/**
 * Handle close matchup button clicks from interactive selector
 */
async function handleCloseMatchupButton(interaction) {
  // Parse button customId: close_matchup_{matchupId}
  const [, , matchupId] = interaction.customId.split('_');
  
  // Dynamically import bracketManager and Discord components
  const bracketManager = await import('../utils/bracketManager.js');
  const { EmbedBuilder } = await import('discord.js');
  
  const tournament = bracketManager.loadTournament(interaction.guild.id);
  
  if (!tournament || tournament.status !== 'knockout') {
    await interaction.followUp({
      content: '❌ Tournament not in knockout phase.',
      ephemeral: true
    });
    return;
  }
  
  // Find the matchup
  const matchup = tournament.knockoutBracket.find(m => m.id === matchupId);
  
  if (!matchup) {
    await interaction.followUp({
      content: '❌ Matchup not found.',
      ephemeral: true
    });
    return;
  }
  
  if (matchup.status !== 'voting') {
    await interaction.followUp({
      content: '⚠️ This matchup is not currently open for voting.',
      ephemeral: true
    });
    return;
  }
  
  // Get regional label helper
  function getRegionalLabel(position, round) {
    const roundSizes = {
      'round_of_32': 16,
      'round_of_16': 8,
      'quarterfinals': 4,
      'semifinals': 2,
      'finals': 1
    };
    
    if (round === 'finals') return 'Finals';
    
    const totalMatchups = roundSizes[round];
    if (!totalMatchups) return String(position + 1);
    
    const midpoint = totalMatchups / 2;
    const isLeftRegion = position < midpoint;
    const region = isLeftRegion ? '1' : '2';
    const positionInRegion = isLeftRegion ? position : position - midpoint;
    const letter = String.fromCharCode(65 + positionInRegion);
    
    return `${region}${letter}`;
  }
  
  const regionalLabel = getRegionalLabel(matchup.position, tournament.phase);
  
  // Close this matchup
  const result = bracketManager.closeKnockoutMatchup(interaction.guild.id, matchup.id);
  
  if (!result.success) {
    await interaction.followUp({
      content: `❌ Failed to close matchup: ${result.error}`,
      ephemeral: true
    });
    return;
  }
  
  const updatedTournament = result.tournament;
  const updatedMatchup = updatedTournament.knockoutBracket.find(m => m.id === matchup.id);
  
  const votes1 = updatedMatchup.votes.movie1.length;
  const votes2 = updatedMatchup.votes.movie2.length;
  const roundName = tournament.phase.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  // Post result to channel
  const embed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle(`🏁 ${roundName} - Matchup ${regionalLabel} Complete!`)
    .setDescription(
      `**${updatedMatchup.winner.title}** wins!\n\n` +
      `**${updatedMatchup.movie1.title}** (${votes1} votes) vs **${updatedMatchup.movie2.title}** (${votes2} votes)`
    );
  
  if (result.autoAdvanced) {
    embed.addFields({
      name: '✅ Auto-Advanced',
      value: `${updatedMatchup.winner.title} has been placed in the next round matchup.`
    });
  }
  
  // Check if all matchups in round are closed
  const reloadedTournament = bracketManager.loadTournament(interaction.guild.id);
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
  
  await interaction.channel.send({ embeds: [embed] });
  
  // Send confirmation to button clicker
  await interaction.followUp({
    content: `✅ Closed matchup ${regionalLabel}!`,
    ephemeral: true
  });
}

/**
 * Handle open region button clicks from interactive selector
 */
async function handleOpenRegionButton(interaction) {
  // Parse button customId: open_region_{region}_{durationMs}
  const [, , region, durationMs] = interaction.customId.split('_');
  const regionNum = parseInt(region);
  
  // Dynamically import bracketManager and Discord components
  const bracketManager = await import('../utils/bracketManager.js');
  const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
  
  const tournament = bracketManager.loadTournament(interaction.guild.id);
  
  if (!tournament || tournament.status !== 'knockout') {
    await interaction.followUp({
      content: '❌ Tournament not in knockout phase.',
      ephemeral: true
    });
    return;
  }
  
  const deadline = Date.now() + parseInt(durationMs);
  
  // Get all matchups in current round
  const currentRoundMatchups = tournament.knockoutBracket.filter(m => 
    m.round === tournament.phase && m.movie1 && m.movie2
  );
  
  if (currentRoundMatchups.length === 0) {
    await interaction.followUp({
      content: `❌ No matchups ready for ${tournament.phase.replace(/_/g, ' ')}.`,
      ephemeral: true
    });
    return;
  }
  
  // Filter by region (region 1 = left side, region 2 = right side)
  const midpoint = currentRoundMatchups.length / 2;
  const regionMatchups = currentRoundMatchups.filter(m => {
    if (regionNum === 1) {
      return m.position < midpoint; // Left side
    } else {
      return m.position >= midpoint; // Right side
    }
  });
  
  if (regionMatchups.length === 0) {
    await interaction.followUp({
      content: `❌ No matchups found in Region ${regionNum}.`,
      ephemeral: true
    });
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
  
  bracketManager.saveTournament(interaction.guild.id, tournament);
  
  // Format time remaining helper
  function formatTimeRemaining(deadline) {
    const remaining = deadline - Date.now();
    const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
    const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }
  
  // Get regional label helper
  function getRegionalLabel(position, round) {
    const roundSizes = {
      'round_of_32': 16,
      'round_of_16': 8,
      'quarterfinals': 4,
      'semifinals': 2,
      'finals': 1
    };
    
    if (round === 'finals') return 'Finals';
    
    const totalMatchups = roundSizes[round];
    if (!totalMatchups) return String(position + 1);
    
    const midpoint = totalMatchups / 2;
    const isLeftRegion = position < midpoint;
    const region = isLeftRegion ? '1' : '2';
    const positionInRegion = isLeftRegion ? position : position - midpoint;
    const letter = String.fromCharCode(65 + positionInRegion);
    
    return `${region}${letter}`;
  }
  
  const roundName = tournament.phase.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  const timeRemaining = formatTimeRemaining(deadline);
  const regionName = regionNum === 1 ? 'Left Side' : 'Right Side';
  
  // Send main announcement to channel
  const mainEmbed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle(`📊 ${roundName} - Region ${regionNum} Voting Open! (${regionName})`)
    .setDescription(
      `**${regionMatchups.length} matchup${regionMatchups.length !== 1 ? 's' : ''}** in Region ${regionNum} are now open for voting.\n\n` +
      `Vote for ONE title in each matchup below. You can change your vote anytime before voting closes.\n\n` +
      `⏰ **Voting closes in:** ${timeRemaining}`
    )
    .setFooter({ text: `Deadline: ${new Date(deadline).toLocaleString()}` });
  
  await interaction.channel.send({ embeds: [mainEmbed] });
  
  // Send each matchup as a separate message with its own buttons
  for (const matchup of regionMatchups) {
    const votes1 = matchup.votes.movie1.length;
    const votes2 = matchup.votes.movie2.length;
    const regionalLabel = getRegionalLabel(matchup.position, tournament.phase);
    
    const embed = new EmbedBuilder()
      .setColor(0x4EC5ED)
      .setTitle(`${roundName} - Matchup ${regionalLabel}`)
      .setDescription(`**${regionalLabel}:** Vote for your pick!`)
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
      )
      .setFooter({ text: 'Click a button below to vote' });
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`knockout_vote_${matchup.id}_1`)
        .setLabel(matchup.movie1.title.length > 80 ? matchup.movie1.title.substring(0, 77) + '...' : matchup.movie1.title)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`knockout_vote_${matchup.id}_2`)
        .setLabel(matchup.movie2.title.length > 80 ? matchup.movie2.title.substring(0, 77) + '...' : matchup.movie2.title)
        .setStyle(ButtonStyle.Primary)
    );
    
    // Send each matchup as its own message
    const votingMessage = await interaction.channel.send({ embeds: [embed], components: [row] });
    
    // Store message ID for this matchup
    bracketManager.storeMatchupVotingMessage(
      interaction.guild.id,
      matchup.id,
      interaction.channel.id,
      votingMessage.id
    );
  }
  
  // Send confirmation to button clicker
  await interaction.followUp({
    content: `✅ Opened Region ${regionNum} (${regionName}) for voting!`,
    ephemeral: true
  });
}

/**
 * Build a visual voting dashboard showing all movies with selection indicators
 * @param {Object} group - The group data
 * @param {string} groupId - Group ID (e.g., "A", "B")
 * @param {number[]} userVotes - Array of movie indexes the user has selected
 * @returns {EmbedBuilder} Dashboard embed
 */
function buildVotingDashboard(group, groupId, userVotes) {
  // Determine color and status based on vote count
  let color, statusText, statusEmoji;
  if (userVotes.length === 0) {
    color = 0x888888; // Gray
    statusText = 'No votes selected';
    statusEmoji = '⬜';
  } else if (userVotes.length === 1) {
    color = 0x4EC5ED; // Blue
    statusText = '1 of 2 selected';
    statusEmoji = '🔵';
  } else {
    color = 0x00FF00; // Green
    statusText = 'Vote complete!';
    statusEmoji = '✅';
  }
  
  // Build description with all movies and selection indicators
  let description = `**${statusEmoji} ${statusText}**\n\n`;
  
  group.movies.forEach((movie, index) => {
    const isSelected = userVotes.includes(index);
    const indicator = isSelected ? '✅' : '⬜';
    const titleText = movie.title.length > 45 ? movie.title.substring(0, 42) + '...' : movie.title;
    description += `${indicator} **${index + 1}.** ${titleText}\n`;
  });
  
  description += `\n💡 *Click buttons to select/deselect*`;
  if (userVotes.length < 2) {
    description += `\n📝 *Select ${2 - userVotes.length} more to complete*`;
  } else {
    description += `\n🎉 *You can still change your vote*`;
  }
  
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`🗳️ Group ${groupId} - Your Votes`)
    .setDescription(description)
    .setFooter({ text: 'This message updates as you vote • Only you can see this' })
    .setTimestamp();
  
  return embed;
}

/**
 * Build a visual knockout voting dashboard showing all matchups in current round
 * @param {Object} tournament - Tournament data
 * @param {string} currentRound - Current round name
 * @param {Array} matchups - Array of matchups in current round
 * @param {string} userId - User ID
 * @returns {EmbedBuilder} Dashboard embed
 */
function buildKnockoutVotingDashboard(tournament, currentRound, matchups, userId) {
  // Get user's votes for all matchups in this round
  const userVotes = tournament.votes?.[userId] || {};
  const votedCount = matchups.filter(m => userVotes[m.id] !== undefined).length;
  const totalCount = matchups.length;
  
  // Determine color and status
  let color, statusText, statusEmoji;
  if (votedCount === 0) {
    color = 0x888888; // Gray
    statusText = 'No votes cast';
    statusEmoji = '⬜';
  } else if (votedCount < totalCount) {
    color = 0x4EC5ED; // Blue
    statusText = `${votedCount} of ${totalCount} voted`;
    statusEmoji = '🔵';
  } else {
    color = 0x00FF00; // Green
    statusText = 'All matchups voted!';
    statusEmoji = '✅';
  }
  
  const roundName = currentRound.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  // Build description with all matchups and vote indicators
  let description = `**${statusEmoji} ${statusText}**\n\n`;
  
  matchups.forEach((matchup) => {
    const userChoice = userVotes[matchup.id];
    const hasVoted = userChoice !== undefined;
    const indicator = hasVoted ? '✅' : '⬜';
    
    let matchupText = '';
    if (hasVoted) {
      const votedTitle = userChoice === 1 ? matchup.movie1.title : matchup.movie2.title;
      const truncated = votedTitle.length > 35 ? votedTitle.substring(0, 32) + '...' : votedTitle;
      matchupText = `${indicator} **Matchup ${matchup.position + 1}:** ${truncated}`;
    } else {
      const title1 = matchup.movie1.title.length > 18 ? matchup.movie1.title.substring(0, 15) + '...' : matchup.movie1.title;
      const title2 = matchup.movie2.title.length > 18 ? matchup.movie2.title.substring(0, 15) + '...' : matchup.movie2.title;
      matchupText = `${indicator} **Matchup ${matchup.position + 1}:** ${title1} vs ${title2}`;
    }
    description += matchupText + '\n';
  });
  
  description += `\n💡 *Click matchup buttons to vote*`;
  if (votedCount < totalCount) {
    description += `\n📝 *${totalCount - votedCount} matchup${totalCount - votedCount !== 1 ? 's' : ''} remaining*`;
  } else {
    description += `\n🎉 *You can still change your votes*`;
  }
  
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`🏆 ${roundName} - Your Votes`)
    .setDescription(description)
    .setFooter({ text: 'This message updates as you vote • Only you can see this' })
    .setTimestamp();
  
  return embed;
}

/**
 * Build public "All Votes" leaderboard for knockout round
 * @param {Object} tournament - Tournament data
 * @param {string} currentRound - Current round name
 * @param {Array} matchups - Array of matchups in current round
 * @returns {EmbedBuilder} Public leaderboard embed
 */
function buildPublicKnockoutLeaderboard(tournament, currentRound, matchups) {
  const roundName = currentRound.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  // Count total votes across all matchups
  let totalVotes = 0;
  matchups.forEach(matchup => {
    totalVotes += (matchup.votes.movie1.length + matchup.votes.movie2.length);
  });
  
  // Build description with all matchup vote tallies
  let description = `**📊 Live Vote Counts**\n\n`;
  
  // Helper function to get regional label
  function getRegionalLabel(position, round) {
    const roundSizes = {
      'round_of_32': 16,
      'round_of_16': 8,
      'quarterfinals': 4,
      'semifinals': 2,
      'finals': 1
    };
    
    if (round === 'finals') return 'Finals';
    
    const totalMatchups = roundSizes[round];
    if (!totalMatchups) return String(position + 1);
    
    const midpoint = totalMatchups / 2;
    const isLeftRegion = position < midpoint;
    const region = isLeftRegion ? '1' : '2';
    const positionInRegion = isLeftRegion ? position : position - midpoint;
    const letter = String.fromCharCode(65 + positionInRegion);
    
    return `${region}${letter}`;
  }
  
  matchups.forEach((matchup) => {
    const votes1 = matchup.votes.movie1.length;
    const votes2 = matchup.votes.movie2.length;
    const regionalLabel = getRegionalLabel(matchup.position, currentRound);
    
    // Truncate titles if needed
    const title1 = matchup.movie1.title.length > 20 ? matchup.movie1.title.substring(0, 17) + '...' : matchup.movie1.title;
    const title2 = matchup.movie2.title.length > 20 ? matchup.movie2.title.substring(0, 17) + '...' : matchup.movie2.title;
    
    // Determine leader
    let leaderIndicator = '';
    if (votes1 > votes2) {
      leaderIndicator = ' 🔥';
    } else if (votes2 > votes1) {
      leaderIndicator = ' 🔥';
    } else if (votes1 > 0 && votes2 > 0) {
      leaderIndicator = ' 🤝';
    }
    
    description += `**${regionalLabel}:** ${title1} (**${votes1}**) vs ${title2} (**${votes2}**)${leaderIndicator}\n`;
  });
  
  description += `\n📈 **Total votes cast:** ${totalVotes}`;
  description += `\n🎯 **Matchups open:** ${matchups.length}`;
  
  const embed = new EmbedBuilder()
    .setColor(0x4EC5ED)
    .setTitle(`🏆 ${roundName} - All Votes`)
    .setDescription(description)
    .setFooter({ text: 'This leaderboard updates in real-time as votes are cast' })
    .setTimestamp();
  
  return embed;
}

/**
 * Clear voting dashboard entries for a specific group or knockout round
 * @param {string} guildId - Guild ID
 * @param {string} identifier - Group ID or round name
 * @param {string} type - 'group' or 'knockout'
 */
export function clearVotingDashboards(guildId, identifier, type = 'group') {
  const keysToDelete = [];
  const searchPattern = type === 'knockout' 
    ? `${guildId}_.*_knockout_${identifier}`
    : `${guildId}_.*_group_${identifier}`;
  
  for (const key of userVotingDashboards.keys()) {
    if (type === 'knockout') {
      if (key.includes(`${guildId}_`) && key.includes(`_knockout_${identifier}`)) {
        keysToDelete.push(key);
      }
    } else {
      if (key.startsWith(`${guildId}_`) && key.includes(`_group_${identifier}`)) {
        keysToDelete.push(key);
      }
    }
  }
  keysToDelete.forEach(key => userVotingDashboards.delete(key));
  console.log(`[ButtonHandler] Cleared ${keysToDelete.length} voting dashboard(s) for ${type === 'knockout' ? 'Round' : 'Group'} ${identifier}`);
}

// Handle "Log to Watch History" button from timer stop
export async function handleWatchHistoryButton(interaction) {
  if (interaction.customId.startsWith('log_watched_')) {
    const [, , channelId, starterUserId] = interaction.customId.split('_');
    
    // Check if user is the timer starter OR has admin/mod permissions
    const isModerator = interaction.member.permissions.has('Administrator') || 
                       interaction.member.permissions.has('ManageGuild') ||
                       interaction.member.permissions.has('ModerateMembers');
    
    if (interaction.user.id !== starterUserId && !isModerator) {
      await interaction.reply({
        content: '❌ Only the person who started the timer or server administrators/moderators can log it to watch history.',
        ephemeral: true,
      });
      return;
    }
    
    // Get the timer label from the message
    const embed = interaction.message.embeds[0];
    const title = embed.description?.replace(/\*\*/g, '') || null;
    
    if (!title) {
      await interaction.reply({
        content: '❌ No title found. The timer needs a label to be logged to watch history.',
        ephemeral: true,
      });
      return;
    }
    
    // Prompt for rating and notes
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');
    
    const modal = new ModalBuilder()
      .setCustomId(`watched_modal_${channelId}_${starterUserId}_${Buffer.from(title).toString('base64')}`)
      .setTitle('Log to Watch History');
    
    const notesInput = new TextInputBuilder()
      .setCustomId('notes')
      .setLabel('Notes (optional)')
      .setPlaceholder('Optional - notes about this watch party')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false);
    
    const notesRow = new ActionRowBuilder().addComponents(notesInput);
    
    modal.addComponents(notesRow);
    
    await interaction.showModal(modal);
  }
}

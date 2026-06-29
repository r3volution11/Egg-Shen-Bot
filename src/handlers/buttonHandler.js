/**
 * Handle button interactions with comprehensive error handling
 */
import * as logger from '../utils/logger.js';

// In-memory cache for tracking ephemeral voting dashboard messages per user per group
// Key format: `${guildId}_${userId}_${groupId}`
// Value: { messageId, channelId, timestamp }
const userVotingDashboards = new Map();

// Clean up old dashboard entries (older than 1 hour) every 10 minutes
setInterval(() => {
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  for (const [key, value] of userVotingDashboards.entries()) {
    if (value.timestamp < oneHourAgo) {
      userVotingDashboards.delete(key);
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
  const dashboardKey = `${interaction.guild.id}_${interaction.user.id}_${groupId}`;
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
  
  // Find the matchup to get movie titles
  const matchup = result.tournament.knockoutBracket.find(m => m.id === matchupId);
  const votedMovie = choice === '1' ? matchup.movie1 : matchup.movie2;
  
  // Create visual feedback embed
  const responseEmbed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle('✅ Vote Recorded!')
    .setDescription(
      `**Your selection:**\n🏆 ${votedMovie.title}\n\n` +
      `💡 You can change your vote anytime before voting closes.`
    )
    .setFooter({ text: `Matchup: ${matchup.id || matchup.position + 1}` });
  
  await interaction.followUp({
    embeds: [responseEmbed],
    ephemeral: true
  });
  
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
 * Build a visual voting dashboard showing all movies with selection indicators
 * @param {Object} group - The group data
 * @param {string} groupId - Group ID (e.g., "A", "B")
 * @param {number[]} userVotes - Array of movie indexes the user has selected
 * @returns {EmbedBuilder} Dashboard embed
 */
function buildVotingDashboard(group, groupId, userVotes) {
  const { EmbedBuilder } = require('discord.js');
  
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
 * Clear voting dashboard entries for a specific group (called when voting closes)
 * @param {string} guildId - Guild ID
 * @param {string} groupId - Group ID
 */
export function clearVotingDashboards(guildId, groupId) {
  const keysToDelete = [];
  for (const key of userVotingDashboards.keys()) {
    if (key.startsWith(`${guildId}_`) && key.endsWith(`_${groupId}`)) {
      keysToDelete.push(key);
    }
  }
  keysToDelete.forEach(key => userVotingDashboards.delete(key));
  console.log(`[ButtonHandler] Cleared ${keysToDelete.length} voting dashboard(s) for Group ${groupId}`);
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

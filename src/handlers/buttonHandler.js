/**
 * Handle button interactions with comprehensive error handling
 */
import * as logger from '../utils/logger.js';

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
  
  // Build response message
  let responseMsg;
  if (newVotes.length === 0) {
    responseMsg = `✅ Removed all votes from Group ${groupId}`;
  } else if (newVotes.length === 1) {
    const selectedTitle = updatedGroup.movies[newVotes[0]].title;
    responseMsg = `✅ Selected **${selectedTitle}** (1 of 2)\n\nSelect one more title to complete your vote.`;
  } else {
    const selectedTitles = newVotes.map(i => updatedGroup.movies[i].title);
    responseMsg = `✅ Vote recorded for Group ${groupId}!\n\n` +
      `Your selections:\n1. ${selectedTitles[0]}\n2. ${selectedTitles[1]}\n\n` +
      `You can change your vote anytime before voting closes.`;
  }
  
  await interaction.followUp({
    content: responseMsg,
    ephemeral: true
  });
  
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
      
      // Update buttons to show user's selection (highlight selected buttons)
      const components = interaction.message.components;
      const updatedComponents = components.map(row => {
        const newRow = new ActionRowBuilder();
        row.components.forEach(button => {
          if (button.customId && button.customId.startsWith(`group_vote_${groupId}_`)) {
            const [, , , idx] = button.customId.split('_');
            const buttonMovieIndex = parseInt(idx);
            const isSelected = newVotes.includes(buttonMovieIndex);
            
            newRow.addComponents(
              ButtonBuilder.from(button)
                .setStyle(isSelected ? ButtonStyle.Success : ButtonStyle.Secondary)
            );
          } else {
            newRow.addComponents(ButtonBuilder.from(button));
          }
        });
        return newRow;
      });
      
      await interaction.message.edit({ 
        embeds: newEmbeds,
        components: updatedComponents
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
  
  await interaction.followUp({
    content: `✅ Vote recorded for **${votedMovie.title}**!\n\nYou can change your vote anytime before voting closes.`,
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

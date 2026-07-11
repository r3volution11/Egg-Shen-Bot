/**
 * Handle button interactions with comprehensive error handling
 */
import * as logger from '../utils/logger.js';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import * as tournamentUI from '../utils/tournamentUI.js';
import { saveEventRequests, saveEventChannelSelections } from '../api/server.js';
import { createScheduledEventFromRequest, buildApprovedEmbed, cleanupEventRequestState } from '../utils/eventRequestApproval.js';

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
    // DON'T defer update - we'll use interaction.update() to show per-user button states
    
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
    
    // Handle "Start Voting" button for group stage
    if (interaction.customId.startsWith('start_group_voting_')) {
      await handleStartGroupVoting(interaction);
      
      // Log successful button interaction
      const duration = Date.now() - startTime;
      logger.logButton(interaction.customId, interaction.user, interaction.guild, true);
      
      if (duration > 2000) {
        logger.logPerformance('Button: start_group_voting', duration, {
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
    
    // Handle "Start Voting" button for knockout rounds
    if (interaction.customId.startsWith('start_knockout_voting_')) {
      await handleStartKnockoutVoting(interaction);
      
      // Log successful button interaction
      const duration = Date.now() - startTime;
      logger.logButton(interaction.customId, interaction.user, interaction.guild, true);
      
      if (duration > 2000) {
        logger.logPerformance('Button: start_knockout_voting', duration, {
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
    
    // Handle event request edit (title/description) before approval/denial
    if (interaction.customId.startsWith('edit_event_')) {
      const requestId = interaction.customId.replace('edit_event_', '');

      // Check if user has moderation permissions
      if (!interaction.member.permissions.has('ManageEvents') &&
          !interaction.member.permissions.has('Administrator')) {
        await interaction.reply({
          content: '❌ Only moderators and administrators can edit event requests.',
          flags: MessageFlags.Ephemeral
        });

        logger.logButton(interaction.customId, interaction.user, interaction.guild, true);
        return;
      }

      // Get stored request data
      if (!global.eventRequests || !global.eventRequests.has(requestId)) {
        await interaction.reply({
          content: '❌ This event request has expired or was already processed.',
          flags: MessageFlags.Ephemeral
        });

        logger.logButton(interaction.customId, interaction.user, interaction.guild, true);
        return;
      }

      const requestData = global.eventRequests.get(requestId);

      const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');

      const titleInput = new TextInputBuilder()
        .setCustomId('title')
        .setLabel('Event Title')
        .setStyle(TextInputStyle.Short)
        .setValue(requestData.title)
        .setMaxLength(100)
        .setRequired(true);

      const descriptionInput = new TextInputBuilder()
        .setCustomId('description')
        .setLabel('Description (optional)')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(requestData.description || '')
        .setRequired(false);

      const modal = new ModalBuilder()
        .setCustomId(`edit_event_modal_${requestId}`)
        .setTitle('Edit Event Details')
        .addComponents(
          new ActionRowBuilder().addComponents(titleInput),
          new ActionRowBuilder().addComponents(descriptionInput)
        );

      await interaction.showModal(modal);

      logger.logButton(interaction.customId, interaction.user, interaction.guild, true);
      return;
    }

    // Handle event request approval/denial
    if (interaction.customId.startsWith('approve_event_') || interaction.customId.startsWith('deny_event_')) {
      // Import at the top of the function since we're inside an async function
      const { EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');
      
      const isDenial = interaction.customId.startsWith('deny_event_');
      let requestId;
      let approvalType = 'full'; // full, both, text
      
      if (!isDenial) {
        if (interaction.customId.startsWith('approve_event_both_')) {
          requestId = interaction.customId.replace('approve_event_both_', '');
          approvalType = 'both';
        } else if (interaction.customId.startsWith('approve_event_text_')) {
          requestId = interaction.customId.replace('approve_event_text_', '');
          approvalType = 'text';
        } else {
          requestId = interaction.customId.replace('approve_event_', '');
          approvalType = 'full';
        }
      } else {
        requestId = interaction.customId.replace('deny_event_', '');
      }
      
      // Check if user has moderation permissions
      if (!interaction.member.permissions.has('ManageEvents') && 
          !interaction.member.permissions.has('Administrator')) {
        await interaction.reply({
          content: '❌ Only moderators and administrators can approve/deny event requests.',
          flags: MessageFlags.Ephemeral
        });
        
        const duration = Date.now() - startTime;
        logger.logButton(interaction.customId, interaction.user, interaction.guild, true);
        return;
      }
      
      // Get stored request data
      if (!global.eventRequests || !global.eventRequests.has(requestId)) {
        await interaction.reply({
          content: '❌ This event request has expired or was already processed.',
          flags: MessageFlags.Ephemeral
        });
        
        const duration = Date.now() - startTime;
        logger.logButton(interaction.customId, interaction.user, interaction.guild, true);
        return;
      }
      
      const requestData = global.eventRequests.get(requestId);

      // Denial goes through a modal to collect an optional reason before
      // actually denying, so this must be the interaction's first response
      // (showModal cannot follow a defer).
      if (isDenial) {
        const denyModal = new ModalBuilder()
          .setCustomId(`deny_event_modal_${requestId}`)
          .setTitle('Deny Event Request')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('reason')
                .setLabel('Reason (optional, sent to the submitter)')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false)
            )
          );

        await interaction.showModal(denyModal);

        logger.logButton(interaction.customId, interaction.user, interaction.guild, true);
        return;
      }

      // If approving and no channels provided by user, show channel selection interface
      if (!isDenial && !requestData.channelId) {
        const { ChannelSelectMenuBuilder, ChannelType, ButtonBuilder, ButtonStyle } = await import('discord.js');
        
        // Create channel select menus
        const textChannelSelect = new ChannelSelectMenuBuilder()
          .setCustomId(`select_text_channel_${requestId}`)
          .setPlaceholder('Select text channel for event')
          .addChannelTypes(ChannelType.GuildText)
          .setMinValues(1)
          .setMaxValues(1);
        
        const voiceChannelSelect = new ChannelSelectMenuBuilder()
          .setCustomId(`select_voice_channel_${requestId}`)
          .setPlaceholder('Select voice channel (optional)')
          .addChannelTypes(ChannelType.GuildVoice)
          .setMinValues(0)
          .setMaxValues(1);
        
        const confirmButton = new ButtonBuilder()
          .setCustomId(`confirm_event_channels_${requestId}_${approvalType}`)
          .setLabel('Create Event')
          .setStyle(ButtonStyle.Success)
          .setEmoji('✅');
        
        const cancelButton = new ButtonBuilder()
          .setCustomId(`cancel_event_channels_${requestId}`)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary);
        
        const textRow = new ActionRowBuilder().addComponents(textChannelSelect);
        const voiceRow = new ActionRowBuilder().addComponents(voiceChannelSelect);
        const buttonRow = new ActionRowBuilder().addComponents(confirmButton, cancelButton);
        
        await interaction.reply({
          content: `📍 **Select Channels for Event**\n**${requestData.title}**\n\nChoose the text channel where this event will take place, and optionally a voice channel.`,
          components: [textRow, voiceRow, buttonRow],
          flags: MessageFlags.Ephemeral
        });
        
        const duration = Date.now() - startTime;
        logger.logButton(interaction.customId, interaction.user, interaction.guild, true);
        return;
      }
      
      try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Handle approval - create Discord scheduled event
        // (isDenial is always false here — denial is handled entirely by
        // the deny_event_modal_ submission path in index.js instead.)
        const guild = interaction.guild;

        const { scheduledEvent, useVoiceChannel } = await createScheduledEventFromRequest({
          guild, requestId, requestData, approvalType,
        });

        const originalEmbed = interaction.message.embeds[0];
        const approvedEmbed = buildApprovedEmbed(originalEmbed, {
          approvedByTag: interaction.user.tag,
          approvalType,
        });

        await interaction.message.edit({
          embeds: [approvedEmbed],
          components: []
        });

        await cleanupEventRequestState({ guildId: interaction.guildId, requestId });

        const eventTypeText = useVoiceChannel ? 'voice channel event' : 'text-only event';
        await interaction.editReply({
          content: `✅ Event created successfully as ${eventTypeText}!\n**${requestData.title}**\n\nEvent ID: ${scheduledEvent.id}\nEvent URL: ${scheduledEvent.url}`
        });

        const duration = Date.now() - startTime;
        logger.logButton(interaction.customId, interaction.user, interaction.guild, true);

      } catch (error) {
        console.error('[EventRequest] Error processing event request:', error);
        await interaction.editReply({
          content: `❌ Failed to process event request: ${error.message}`
        });

        logger.logButton(interaction.customId, interaction.user, interaction.guild, false, error);
      }
      
      return;
    }
    
    // Handle confirm event channels button
    if (interaction.customId.startsWith('confirm_event_channels_')) {
      const customIdParts = interaction.customId.replace('confirm_event_channels_', '').split('_');
      const approvalType = customIdParts.pop(); // Get last element (approvalType)
      const requestId = customIdParts.join('_'); // Rejoin the rest
      
      // Check if user has moderation permissions
      if (!interaction.member.permissions.has('ManageEvents') && 
          !interaction.member.permissions.has('Administrator')) {
        await interaction.update({
          content: '❌ Only moderators and administrators can approve event requests.',
          components: [],
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      
      // Get stored request data
      if (!global.eventRequests || !global.eventRequests.has(requestId)) {
        await interaction.update({
          content: '❌ This event request has expired or was already processed.',
          components: [],
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      
      // Get selected channels from global storage
      const selectionKey = `${interaction.guildId}_${requestId}`;
      const selections = global.eventChannelSelections?.get(selectionKey);

      if (!selections || !selections.textChannelId) {
        await interaction.update({
          content: '❌ Your channel selection wasn\'t found (the bot may have restarted since you selected it). Please reselect the text channel below and try again.',
          components: interaction.message.components,
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      
      const textChannelId = selections.textChannelId;
      const voiceChannelId = selections.voiceChannelId || null;
      
      const requestData = global.eventRequests.get(requestId);
      
      try {
        await interaction.deferUpdate();
        
        const { EmbedBuilder } = await import('discord.js');
        const guild = interaction.guild;
        
        // Get channel objects
        const textChannel = guild.channels.cache.get(textChannelId);
        const voiceChannel = voiceChannelId ? guild.channels.cache.get(voiceChannelId) : null;
        
        // Create Discord scheduled event
        const eventConfig = {
          name: requestData.title,
          description: requestData.description || undefined,
          scheduledStartTime: requestData.startTime,
          scheduledEndTime: requestData.endTime || undefined,
          privacyLevel: 2
        };
        
        if (voiceChannel) {
          // Voice channel event
          eventConfig.channel = voiceChannel.id;
          eventConfig.entityType = 2;
          
          const channelMention = `<#${textChannel.id}>`;
          eventConfig.description = (requestData.description ? requestData.description + '\n\n' : '') + 
            `💬 Coordination: ${channelMention}`;
        } else {
          // External event (text-only)
          const channelMention = `<#${textChannel.id}>`;
          eventConfig.description = (requestData.description ? requestData.description + '\n\n' : '') + 
            `📍 Location: ${channelMention}`;
          eventConfig.entityType = 3;
          eventConfig.entityMetadata = { location: 'Discord Server' };
        }
        
        const scheduledEvent = await guild.scheduledEvents.create(eventConfig);
        
        // Update the original approval message
        const originalMessage = await interaction.channel.messages.fetch(interaction.message.reference?.messageId).catch(() => null);
        if (originalMessage) {
          const originalEmbed = originalMessage.embeds[0];
          const approvedEmbed = new EmbedBuilder(originalEmbed)
            .setColor(0x00FF00)
            .setTitle(`✅ Event Request Approved`)
            .setFooter({ text: `Approved by ${interaction.user.tag} • ${originalEmbed.footer?.text || ''}` });
          
          await originalMessage.edit({
            embeds: [approvedEmbed],
            components: []
          }).catch(() => {});
        }
        
        // Clean up stored data
        global.eventRequests.delete(requestId);
        if (global.eventChannelSelections) {
          global.eventChannelSelections.delete(`${interaction.guildId}_${requestId}`);
          await saveEventChannelSelections();
        }
        await saveEventRequests();
        
        const eventTypeText = voiceChannel ? 'voice channel event' : 'text-only event';
        const channelInfo = voiceChannel 
          ? `📍 Text: <#${textChannel.id}>\n🔊 Voice: <#${voiceChannel.id}>`
          : `📍 Location: <#${textChannel.id}>`;
        
        await interaction.editReply({
          content: `✅ Event created successfully as ${eventTypeText}!\n**${requestData.title}**\n\n${channelInfo}\n\nEvent ID: ${scheduledEvent.id}\nEvent URL: ${scheduledEvent.url}`,
          components: []
        });
        
        const duration = Date.now() - startTime;
        logger.logButton(interaction.customId, interaction.user, interaction.guild, true);
        
      } catch (error) {
        console.error('[EventRequest] Error creating event:', error);
        await interaction.editReply({
          content: `❌ Failed to create event: ${error.message}`,
          components: []
        });
        
        logger.logButton(interaction.customId, interaction.user, interaction.guild, false, error);
      }
      
      return;
    }
    
    // Handle cancel event channels button
    if (interaction.customId.startsWith('cancel_event_channels_')) {
      const requestId = interaction.customId.replace('cancel_event_channels_', '');
      if (global.eventChannelSelections) {
        global.eventChannelSelections.delete(`${interaction.guildId}_${requestId}`);
        await saveEventChannelSelections();
      }

      await interaction.update({
        content: '❌ Event approval cancelled.',
        components: [],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    // Handle tiebreaker voting buttons
    if (interaction.customId.startsWith('tiebreaker_vote_')) {
      await handleTiebreakerVote(interaction);

      const duration = Date.now() - startTime;
      logger.logButton(interaction.customId, interaction.user, interaction.guild, true);

      if (duration > 2000) {
        logger.logPerformance('Button: tiebreaker_vote', duration, {
          userId: interaction.user.id,
          guildId: interaction.guild?.id
        });
      }
      return;
    }

    // Handle "Log to Watch History" button from timer stop
    if (interaction.customId.startsWith('log_watched_')) {
      await handleWatchHistoryButton(interaction);

      const duration = Date.now() - startTime;
      logger.logButton(interaction.customId, interaction.user, interaction.guild, true);

      if (duration > 2000) {
        logger.logPerformance('Button: log_watched', duration, {
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
        flags: MessageFlags.Ephemeral
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
/**
 * Handle "Start Voting" button for group stage
 * Sends user a personal voting dashboard with all open groups
 */
async function handleStartGroupVoting(interaction) {
  const groupIdsStr = interaction.customId.replace('start_group_voting_', '');
  const groupIds = groupIdsStr.split(',');
  
  // Dynamically import bracketManager
  const bracketManager = await import('../utils/bracketManager.js');
  const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = await import('discord.js');
  
  // Load tournament
  const tournament = bracketManager.loadTournament(interaction.guild.id);
  if (!tournament) {
    await interaction.reply({
      content: '❌ No tournament found.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  
  // Get user's current votes
  const userVotes = tournament.votes?.[interaction.user.id] || {};
  
  // Build personal voting dashboard
  const embed = new EmbedBuilder()
    .setColor(0x4EC5ED)
    .setTitle('🗳️ Your Group Voting Dashboard')
    .setDescription(
      `Vote for your **top 2** in each group below.\n` +
      `Your selections are shown in **purple**.\n\n` +
      `💡 Click any button to cast or change your vote!`
    )
    .setThumbnail(interaction.client.user.displayAvatarURL())
    .setFooter({ text: 'Only you can see this • Your votes update in real-time' })
    .setTimestamp();
  
  // Create buttons for each group
  const components = [];
  
  for (const groupId of groupIds) {
    const group = tournament.groups[groupId];
    if (!group || !group.votingOpen) continue;
    
    // Check deadline
    if (group.votingDeadline && Date.now() > group.votingDeadline) continue;
    
    const userGroupVotes = userVotes[groupId] || [];
    
    // Add separator text
    const groupLabel = `\n**Group ${groupId}** - Select 2:`;
    embed.addFields({ name: '\u200b', value: groupLabel, inline: false });
    
    // Create buttons for each movie in this group
    const buttons = group.movies.map((movie, index) => {
      const isSelected = userGroupVotes.includes(index);
      return new ButtonBuilder()
        .setCustomId(`group_vote_${groupId}_${index}`)
        .setLabel(`${index + 1}. ${movie.title.length > 50 ? movie.title.substring(0, 47) + '...' : movie.title}`)
        .setStyle(isSelected ? ButtonStyle.Primary : ButtonStyle.Secondary);
    });
    
    // Split into rows (5 buttons max per row)
    for (let i = 0; i < buttons.length; i += 5) {
      const row = new ActionRowBuilder().addComponents(buttons.slice(i, i + 5));
      components.push(row);
    }
  }
  
  if (components.length === 0) {
    await interaction.reply({
      content: '❌ No groups are currently open for voting.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  
  // Send ephemeral (private) voting dashboard
  await interaction.reply({
    embeds: [embed],
    components: components,
    flags: MessageFlags.Ephemeral
  });
}

/**
 * Handle group stage voting button clicks
 */
async function handleGroupVote(interaction) {
  // Acknowledge the interaction immediately
  await interaction.deferUpdate();
  
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
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  
  const group = tournament.groups[groupId];
  
  if (!group || !group.votingOpen) {
    await interaction.followUp({
      content: `❌ Group ${groupId} is not open for voting.`,
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  
  // Check if voting deadline has passed
  if (group.votingDeadline && Date.now() > group.votingDeadline) {
    await interaction.followUp({
      content: '❌ Voting for this group has ended.',
      flags: MessageFlags.Ephemeral
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
        flags: MessageFlags.Ephemeral
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
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  
  // Update the PUBLIC leaderboard message with new vote counts
  const updatedGroup = result.tournament.groups[groupId];
  if (updatedGroup.votingMessageChannelId && updatedGroup.votingMessageId) {
    try {
      const channel = await interaction.client.channels.fetch(updatedGroup.votingMessageChannelId);
      const publicMessage = await channel.messages.fetch(updatedGroup.votingMessageId);
      
      // Rebuild the single public leaderboard embed
      const leaderboardEmbed = EmbedBuilder.from(publicMessage.embeds[0]);
      
      // Get all groups from tournament to rebuild all fields
      const tournament = result.tournament;
      const allGroups = Object.keys(tournament.groups).filter(gId => {
        const g = tournament.groups[gId];
        return g.votingOpen && g.votingMessageId === updatedGroup.votingMessageId;
      }).sort();
      
      // Clear existing fields and rebuild with updated vote counts
      leaderboardEmbed.setFields([]);
      
      allGroups.forEach((gId) => {
        const g = tournament.groups[gId];
        if (!g) return;
        
        // Build standings text for this group
        const standingsText = g.movies.map((movie, index) => {
          const voteCount = movie.votes.length;
          return `${index + 1}. ${movie.title} - ${voteCount} vote${voteCount !== 1 ? 's' : ''}`;
        }).join('\n');
        
        leaderboardEmbed.addFields({
          name: `📊 Group ${gId} - Current Standings`,
          value: standingsText || 'No votes yet',
          inline: false
        });
      });
      
      // Update the public message with rebuilt embed
      await publicMessage.edit({ embeds: [leaderboardEmbed] });
    } catch (error) {
      console.error('[ButtonHandler] Error updating public leaderboard:', error);
      // Don't fail the vote if leaderboard update fails
    }
  }
  
  // Vote feedback is provided by button color change in dashboard - no need for additional messages
  
  // Rebuild the entire personal voting dashboard with all groups
  const updatedTournament = result.tournament;
  const allUserVotes = updatedTournament.votes?.[interaction.user.id] || {};
  
  // Get all open groups (from the original dashboard)
  const originalEmbed = interaction.message.embeds[0];
  const openGroups = [];
  for (const gId in updatedTournament.groups) {
    const g = updatedTournament.groups[gId];
    if (g.votingOpen && (!g.votingDeadline || Date.now() <= g.votingDeadline)) {
      openGroups.push(gId);
    }
  }
  
  openGroups.sort();
  
  // Rebuild embed
  const embed = EmbedBuilder.from(originalEmbed);
  embed.setFields([]); // Clear fields
  
  // Rebuild buttons for all open groups
  const components = [];
  
  for (const gId of openGroups) {
    const g = updatedTournament.groups[gId];
    if (!g) continue;
    
    const userGroupVotes = allUserVotes[gId] || [];
    const voteStatus = userGroupVotes.length === 2 ? '✅' : `${userGroupVotes.length}/2`;
    
    // Add group label
    embed.addFields({ 
      name: '\u200b', 
      value: `\n**Group ${gId}** - ${voteStatus}`, 
      inline: false 
    });
    
    // Create buttons
    const buttons = g.movies.map((movie, index) => {
      const isSelected = userGroupVotes.includes(index);
      return new ButtonBuilder()
        .setCustomId(`group_vote_${gId}_${index}`)
        .setLabel(`${index + 1}. ${movie.title.length > 50 ? movie.title.substring(0, 47) + '...' : movie.title}`)
        .setStyle(isSelected ? ButtonStyle.Primary : ButtonStyle.Secondary);
    });
    
    // Split into rows
    for (let i = 0; i < buttons.length; i += 5) {
      components.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    }
  }
  
  // Update user's personal dashboard (use editReply because we already deferred)
  await interaction.editReply({
    embeds: [embed],
    components: components
  });
}

/**
 * Handle knockout voting button clicks
 */
async function handleKnockoutVote(interaction) {
  const [, , matchupId, choice] = interaction.customId.split('_');
  
  // Dynamically import bracketManager
  const bracketManager = await import('../utils/bracketManager.js');
  const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = await import('discord.js');
  
  const result = bracketManager.voteKnockout(
    interaction.guild.id,
    interaction.user.id,
    matchupId,
    parseInt(choice)
  );
  
  if (!result.success) {
    await interaction.reply({
      content: `❌ ${result.error}`,
      flags: MessageFlags.Ephemeral
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
  
  // Safety check: Discord has a 5 ActionRow limit
  if (currentRoundMatchups.length > 5) {
    await interaction.reply({
      content: `❌ **Too many matchups open** (${currentRoundMatchups.length})\\n\\nAsk an admin to close some matchups and reopen by region.`,
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  
  // Get user's current votes for ALL matchups
  const userVotes = tournament.votes?.[interaction.user.id] || {};
  
  // Get user participation stats
  const userStats = tournament.participation?.[interaction.user.id];
  const statsText = userStats 
    ? `🔥 **Streak:** ${userStats.streak} rounds | 📊 **Total votes:** ${userStats.totalVotes}`
    : '✨ This is your first vote!';
  
  // Rebuild all buttons with updated states
  const components = [];
  const embed = new EmbedBuilder()
    .setColor(0x4EC5ED)
    .setTitle('🗳️ Your Voting Dashboard')
    .setDescription(
      `Vote for ONE title in each matchup below.\n` +
      `Your selections are shown in **purple**.\n\n` +
      `💡 Click any button to cast or change your vote!\n\n` +
      statsText
    )
    .setThumbnail(interaction.client.user.displayAvatarURL())
    .setFooter({ text: 'Only you can see this • Your votes update in real-time' })
    .setTimestamp();
  
  for (const m of currentRoundMatchups) {
    const regionalLabel = getRegionalLabel(m.position, currentRound);
    const vote = userVotes[m.id];
    
    const button1 = new ButtonBuilder()
      .setCustomId(`knockout_vote_${m.id}_1`)
      .setLabel(`${regionalLabel}: ${m.movie1.title.length > 50 ? m.movie1.title.substring(0, 47) + '...' : m.movie1.title}`)
      .setStyle(vote === 1 ? ButtonStyle.Primary : ButtonStyle.Secondary);
    
    const button2 = new ButtonBuilder()
      .setCustomId(`knockout_vote_${m.id}_2`)
      .setLabel(`${regionalLabel}: ${m.movie2.title.length > 50 ? m.movie2.title.substring(0, 47) + '...' : m.movie2.title}`)
      .setStyle(vote === 2 ? ButtonStyle.Primary : ButtonStyle.Secondary);
    
    const row = new ActionRowBuilder().addComponents(button1, button2);
    components.push(row);
  }
  
  // Update user's personal voting dashboard
  await interaction.update({
    embeds: [embed],
    components: components
  });
  
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
    
    // Divide into 4 regions (March Madness style)
    const matchupsPerRegion = totalMatchups / 4;
    const region = Math.floor(position / matchupsPerRegion) + 1; // 1-4
    const positionInRegion = position % matchupsPerRegion;
    const letter = String.fromCharCode(65 + positionInRegion);
    
    return `${region}${letter}`;
  }
  
  // Update or create public "All Votes" leaderboard
  const leaderboardKey = `${interaction.guild.id}_knockout_${currentRound}`;
  const existingLeaderboard = publicLeaderboards.get(leaderboardKey);
  const leaderboardEmbed = buildPublicKnockoutLeaderboard(tournament, currentRound, currentRoundMatchups, interaction.client);
  
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
}

/**
 * Handle "Start Voting" button click - sends personal voting dashboard to user
 */
async function handleStartKnockoutVoting(interaction) {
  // Extract round from customId (e.g., 'start_knockout_voting_round_of_32' -> 'round_of_32')
  const round = interaction.customId.replace('start_knockout_voting_', '');
  
  // Dynamically import bracketManager
  const bracketManager = await import('../utils/bracketManager.js');
  const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
  
  const tournament = bracketManager.loadTournament(interaction.guild.id);
  
  if (!tournament || tournament.status !== 'knockout') {
    await interaction.reply({
      content: '❌ No active knockout tournament found.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  
  // Get voting matchups for the current round
  const votingMatchups = tournament.knockoutBracket.filter(m => 
    m.round === round && m.status === 'voting'
  );
  
  console.log(`[Knockout Dashboard] Round: ${round}, Total matchups: ${votingMatchups.length}`);
  
  if (votingMatchups.length === 0) {
    await interaction.reply({
      content: '❌ No voting matchups found for this round.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  
  // Discord has a 5 ActionRow limit - enforce it
  if (votingMatchups.length > 5) {
    await interaction.reply({
      content: `❌ **Too many matchups open** (${votingMatchups.length})\\n\\nDiscord limits voting dashboards to 5 matchups at a time.\\nAsk an admin to close some matchups and reopen by region instead.`,
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  
  // Get user's current votes
  const userVotes = tournament.votes?.[interaction.user.id] || {};
  
  // Get user participation stats
  const userStats = tournament.participation?.[interaction.user.id];
  const statsText = userStats 
    ? `🔥 **Streak:** ${userStats.streak} rounds | 📊 **Total votes:** ${userStats.totalVotes}`
    : '✨ This is your first vote!';
  
  // Build voting dashboard with all matchups
  const embed = new EmbedBuilder()
    .setColor(0x4EC5ED)
    .setTitle('🗳️ Your Voting Dashboard')
    .setDescription(
      `Vote for ONE title in each matchup below.\n` +
      `Your selections are shown in **purple**.\n\n` +
      `💡 Click any button to cast or change your vote!\n\n` +
      statsText
    )
    .setThumbnail(interaction.client.user.displayAvatarURL())
    .setFooter({ text: 'Only you can see this • Your votes update in real-time' })
    .setTimestamp();
  
  // Create buttons for each matchup (one row per matchup)
  const components = [];
  
  console.log(`[Knockout Dashboard] Round: ${round}, Creating dashboard for ${votingMatchups.length} matchups`);
  
  for (const matchup of votingMatchups) {
    // Get regional label
    const regionalLabel = getRegionalLabel(matchup.position, round);
    const userVote = userVotes[matchup.id];
    
    const button1 = new ButtonBuilder()
      .setCustomId(`knockout_vote_${matchup.id}_1`)
      .setLabel(`${regionalLabel}: ${matchup.movie1.title.length > 45 ? matchup.movie1.title.substring(0, 42) + '...' : matchup.movie1.title}`)
      .setStyle(userVote === 1 ? ButtonStyle.Primary : ButtonStyle.Secondary);
    
    const button2 = new ButtonBuilder()
      .setCustomId(`knockout_vote_${matchup.id}_2`)
      .setLabel(`${regionalLabel}: ${matchup.movie2.title.length > 45 ? matchup.movie2.title.substring(0, 42) + '...' : matchup.movie2.title}`)
      .setStyle(userVote === 2 ? ButtonStyle.Primary : ButtonStyle.Secondary);
    
    // Create one row per matchup
    const row = new ActionRowBuilder().addComponents(button1, button2);
    components.push(row);
  }
  
  console.log(`[Knockout Dashboard] Created ${components.length} component rows`);
  
  // Send ephemeral dashboard
  const dashboardMessage = await interaction.reply({
    embeds: [embed],
    components: components,
    flags: MessageFlags.Ephemeral,
    fetchReply: true
  });
  
  // Store dashboard message ID for this user so we can update it
  const dashboardKey = `${interaction.guild.id}_${interaction.user.id}_knockout_${round}`;
  userVotingDashboards.set(dashboardKey, {
    messageId: dashboardMessage.id,
    channelId: interaction.channelId,
    timestamp: Date.now()
  });
  
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
    
    // Divide into 4 regions (March Madness style)
    const matchupsPerRegion = totalMatchups / 4;
    const region = Math.floor(position / matchupsPerRegion) + 1; // 1-4
    const positionInRegion = position % matchupsPerRegion;
    const letter = String.fromCharCode(65 + positionInRegion);
    
    return `${region}${letter}`;
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
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  
  // Find the matchup
  const matchup = tournament.knockoutBracket.find(m => m.id === matchupId);
  
  if (!matchup) {
    await interaction.followUp({
      content: '❌ Matchup not found.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  
  if (matchup.status === 'voting') {
    await interaction.followUp({
      content: '⚠️ This matchup is already open for voting.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  
  if (matchup.status === 'closed') {
    await interaction.followUp({
      content: '❌ This matchup has already been closed.',
      flags: MessageFlags.Ephemeral
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
    
    // Divide into 4 regions (March Madness style)
    const matchupsPerRegion = totalMatchups / 4;
    const region = Math.floor(position / matchupsPerRegion) + 1; // 1-4
    const positionInRegion = position % matchupsPerRegion;
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
    flags: MessageFlags.Ephemeral
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
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  
  // Find the matchup
  const matchup = tournament.knockoutBracket.find(m => m.id === matchupId);
  
  if (!matchup) {
    await interaction.followUp({
      content: '❌ Matchup not found.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  
  if (matchup.status !== 'voting') {
    await interaction.followUp({
      content: '⚠️ This matchup is not currently open for voting.',
      flags: MessageFlags.Ephemeral
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
    
    // Divide into 4 regions (March Madness style)
    const matchupsPerRegion = totalMatchups / 4;
    const region = Math.floor(position / matchupsPerRegion) + 1; // 1-4
    const positionInRegion = position % matchupsPerRegion;
    const letter = String.fromCharCode(65 + positionInRegion);
    
    return `${region}${letter}`;
  }
  
  const regionalLabel = getRegionalLabel(matchup.position, tournament.phase);
  
  // Close this matchup
  const result = bracketManager.closeKnockoutMatchup(interaction.guild.id, matchup.id);
  
  if (!result.success) {
    await interaction.followUp({
      content: `❌ Failed to close matchup: ${result.error}`,
      flags: MessageFlags.Ephemeral
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
    flags: MessageFlags.Ephemeral
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
      flags: MessageFlags.Ephemeral
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
      flags: MessageFlags.Ephemeral
    });
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
    await interaction.followUp({
      content: `❌ No matchups found in Region ${regionNum}.`,
      flags: MessageFlags.Ephemeral
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
    
    // Divide into 4 regions (March Madness style)
    const matchupsPerRegion = totalMatchups / 4;
    const region = Math.floor(position / matchupsPerRegion) + 1; // 1-4
    const positionInRegion = position % matchupsPerRegion;
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
    .setFooter({ text: `Deadline: <t:${Math.floor(deadline / 1000)}:f>` });
  
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
    flags: MessageFlags.Ephemeral
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
  
  // Build description showing status
  let description = `**${statusEmoji} ${statusText}**\n\n`;
  
  if (userVotes.length < 2) {
    description += `📝 *Select ${2 - userVotes.length} more to complete*\n`;
  } else {
    description += `🎉 *You can still change your vote*\n`;
  }
  
  description += `💡 *Click buttons below to select/deselect*`;
  
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`🗳️ Group ${groupId} - Your Votes`)
    .setDescription(description)
    .setFooter({ text: 'This message updates as you vote • Only you can see this' })
    .setTimestamp();
  
  // Build buttons with visual state feedback (Primary = purple/selected, Secondary = gray/unselected)
  // Disabled buttons are display-only, actual voting happens via the main message buttons
  const buttons = group.movies.map((movie, index) => {
    const isSelected = userVotes.includes(index);
    const titleText = movie.title.length > 80 ? movie.title.substring(0, 77) + '...' : movie.title;
    
    return new ButtonBuilder()
      .setCustomId(`group_vote_${groupId}_${index}_display`)
      .setLabel(`${index + 1}. ${titleText}`)
      .setStyle(isSelected ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(true); // Display only
  });
  
  // Split buttons into rows (max 5 per row)
  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    const rowButtons = buttons.slice(i, i + 5);
    rows.push(new ActionRowBuilder().addComponents(rowButtons));
  }
  
  return { embed, components: rows };
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
 * @param {Object} client - Discord client (for bot avatar)
 * @returns {EmbedBuilder} Public leaderboard embed
 */
function buildPublicKnockoutLeaderboard(tournament, currentRound, matchups, client = null) {
  const roundName = currentRound.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  // Count total votes across all matchups
  let totalVotes = 0;
  matchups.forEach(matchup => {
    totalVotes += (matchup.votes.movie1.length + matchup.votes.movie2.length);
  });
  
  // Get tournament stats
  const uniqueVoters = tournament.statistics?.uniqueVoters || Object.keys(tournament.votes || {}).length;
  
  // Build description with all matchup vote tallies WITH PROGRESS BARS
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
    
    // Divide into 4 regions (March Madness style)
    const matchupsPerRegion = totalMatchups / 4;
    const region = Math.floor(position / matchupsPerRegion) + 1; // 1-4
    const positionInRegion = position % matchupsPerRegion;
    const letter = String.fromCharCode(65 + positionInRegion);
    
    return `${region}${letter}`;
  }
  
  matchups.forEach((matchup) => {
    const votes1 = matchup.votes.movie1.length;
    const votes2 = matchup.votes.movie2.length;
    const totalMatchupVotes = votes1 + votes2;
    const regionalLabel = getRegionalLabel(matchup.position, currentRound);
    
    // Truncate titles if needed (shorter for progress bar layout)
    const title1 = matchup.movie1.title.length > 25 ? matchup.movie1.title.substring(0, 22) + '...' : matchup.movie1.title;
    const title2 = matchup.movie2.title.length > 25 ? matchup.movie2.title.substring(0, 22) + '...' : matchup.movie2.title;
    
    // Create progress bars
    const bar1 = tournamentUI.createVoteBar(votes1, totalMatchupVotes, 12);
    const bar2 = tournamentUI.createVoteBar(votes2, totalMatchupVotes, 12);
    
    // Determine leader emoji
    let leader1 = votes1 > votes2 ? ' 🔥' : '';
    let leader2 = votes2 > votes1 ? ' 🔥' : '';
    const tie = votes1 === votes2 && votes1 > 0 ? ' 🤝' : '';
    
    description += `**${regionalLabel}**\n`;
    description += `${title1}${leader1}\n${bar1}\n`;
    description += `${title2}${leader2}${tie}\n\n`;
  });
  
  description += `📈 **Total votes:** ${totalVotes}`;
  description += `\n👥 **Voters:** ${uniqueVoters}`;
  description += `\n🎯 **Matchups:** ${matchups.length}`;
  
  const embed = new EmbedBuilder()
    .setColor(0x4EC5ED)
    .setTitle(`🏆 ${roundName} - Live Standings`)
    .setDescription(description)
    .setThumbnail(client?.user?.displayAvatarURL() || null)
    .setFooter({ text: 'Updates in real-time as votes are cast' })
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
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    
    // Get the timer label from the message
    // Get the timer label from the message (if available)
    const embed = interaction.message.embeds[0];
    const description = embed.description?.split('\n')[0] || ''; // Get first line
    const title = description.replace(/\*\*/g, '').trim() || null;
    
    // Prompt for title (if needed) and notes
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');
    
    const modal = new ModalBuilder()
      .setCustomId(`watched_modal_${channelId}_${starterUserId}_${title ? Buffer.from(title).toString('base64') : 'notitle'}`)
      .setTitle('Log to Watch History');
    
    // If no title, add a title search field
    if (!title) {
      const titleInput = new TextInputBuilder()
        .setCustomId('title')
        .setLabel('Movie or TV Show Title')
        .setPlaceholder('Enter the title of what you watched')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      
      const titleRow = new ActionRowBuilder().addComponents(titleInput);
      modal.addComponents(titleRow);
    }
    
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

/**
 * Handle tiebreaker vote button clicks
 * Button ID format: tiebreaker_vote_{tiebreakerId}_{optionIndex}
 */
async function handleTiebreakerVote(interaction) {
  await interaction.deferUpdate();

  // Parse: ['tiebreaker', 'vote', tiebreakerId, optionIndex]
  // Note: tiebreakerId is a hex string with no underscores
  const parts = interaction.customId.split('_');
  const optionIndex = parseInt(parts[parts.length - 1]);
  const tiebreakerId = parts.slice(2, parts.length - 1).join('_');

  const bracketManager = await import('../utils/bracketManager.js');

  const tournament = bracketManager.loadTournament(interaction.guild.id);
  if (!tournament) {
    await interaction.followUp({ content: '❌ No tournament found.', flags: MessageFlags.Ephemeral });
    return;
  }

  const tiebreaker = tournament.tiebreakers?.find(t => t.id === tiebreakerId);
  if (!tiebreaker || tiebreaker.status !== 'active') {
    await interaction.followUp({ content: '❌ This tiebreaker is no longer active.', flags: MessageFlags.Ephemeral });
    return;
  }

  if (Date.now() > tiebreaker.deadline) {
    await interaction.followUp({ content: '❌ Tiebreaker voting has expired.', flags: MessageFlags.Ephemeral });
    return;
  }

  // Record the vote
  const result = bracketManager.voteInTiebreaker(interaction.guild.id, tiebreakerId, interaction.user.id, optionIndex);
  if (!result.success) {
    await interaction.followUp({ content: `❌ ${result.error}`, flags: MessageFlags.Ephemeral });
    return;
  }

  const updatedTiebreaker = result.tiebreaker;
  const selectedOption = updatedTiebreaker.tiedOptions[optionIndex];

  // Rebuild vote counts for the embed
  const voteCounts = {};
  updatedTiebreaker.tiedOptions.forEach((_, i) => { voteCounts[i] = 0; });
  Object.values(updatedTiebreaker.votes).forEach(idx => {
    voteCounts[idx] = (voteCounts[idx] || 0) + 1;
  });
  const totalVotes = Object.values(voteCounts).reduce((a, b) => a + b, 0);

  const optionsText = updatedTiebreaker.tiedOptions.map((opt, i) => {
    const votes = voteCounts[i] || 0;
    const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 10) : 0;
    const bar = '█'.repeat(pct) + '░'.repeat(10 - pct);
    return `**${i + 1}.** ${opt.title}\n${bar} ${votes} vote${votes !== 1 ? 's' : ''}`;
  }).join('\n\n');

  const isKnockout = updatedTiebreaker.position === 'knockout';
  const contextLabel = isKnockout
    ? 'Knockout Matchup'
    : `Group ${updatedTiebreaker.groupId} — ${updatedTiebreaker.position} place`;
  const deadline = `<t:${Math.floor(updatedTiebreaker.deadline / 1000)}:R>`;

  const embed = new EmbedBuilder()
    .setColor(0xFFAA00)
    .setTitle(`🔀 Tiebreaker: ${contextLabel}`)
    .setDescription(`Click a button below to cast your vote!\n\n${optionsText}`)
    .addFields(
      { name: '⏰ Closes', value: deadline, inline: true },
      { name: '🗳️ Total Votes', value: `${totalVotes}`, inline: true }
    )
    .setFooter({ text: `Tiebreaker ID: ${updatedTiebreaker.id}` });

  // Rebuild buttons (all Primary — no per-user coloring on a public message)
  const buttons = updatedTiebreaker.tiedOptions.map((opt, i) =>
    new ButtonBuilder()
      .setCustomId(`tiebreaker_vote_${tiebreakerId}_${i}`)
      .setLabel(opt.title.length > 80 ? opt.title.substring(0, 77) + '...' : opt.title)
      .setStyle(ButtonStyle.Primary)
  );
  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
  }

  // Update the public voting message with refreshed counts
  await interaction.editReply({ embeds: [embed], components: rows });

  // Private confirmation
  await interaction.followUp({
    content: `✅ Your vote for **${selectedOption.title}** has been recorded! You can change it anytime before voting closes.`,
    flags: MessageFlags.Ephemeral
  });
}

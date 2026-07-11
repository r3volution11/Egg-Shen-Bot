import { Client, GatewayIntentBits, Partials, Options, Collection, EmbedBuilder, MessageFlags } from 'discord.js';
import { config } from './config.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdirSync } from 'fs';
import { loadTimers, getTimerStatus, restoreTimerTimeouts } from './utils/timerManager.js';
import * as logger from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Log system startup
logger.logSystem('Bot starting up', {
  nodeVersion: process.version,
  platform: process.platform,
  arch: process.arch,
  env: process.env.NODE_ENV || 'development'
});

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
  ],
  // GuildMessages is only needed so reaction events resolve messages the bot
  // hasn't personally sent/fetched this session (e.g. survey/poll messages
  // from before a restart) — the bot doesn't read message content, so cap
  // the message cache instead of accepting discord.js's 200-per-channel
  // default, keeping memory bounded as the bot sees more channel traffic.
  partials: [Partials.Message, Partials.Reaction],
  makeCache: Options.cacheWithLimits({
    ...Options.DefaultMakeCacheSettings,
    MessageManager: 50,
  }),
});

// Collection to store commands
client.commands = new Collection();

// Define API requirements for commands
const commandRequirements = {
  'game': { key: 'RAWG_API_KEY', service: 'RAWG' },
  'boardgame': { key: 'BGG_CLIENT_ID', service: 'BoardGameGeek' },
};

// Load commands
const commandsPath = join(__dirname, 'commands');
const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = join(commandsPath, file);
  const command = await import(`file://${filePath}`);
  
  if ('data' in command && 'execute' in command) {
    const commandName = command.data.name;
    
    // Check if this command has API requirements
    if (commandRequirements[commandName]) {
      const requirement = commandRequirements[commandName];
      let hasApiKey = false;
      
      if (requirement.key === 'RAWG_API_KEY') {
        hasApiKey = !!config.apis.rawg.apiKey;
      } else if (requirement.key === 'BGG_CLIENT_ID') {
        hasApiKey = !!config.apis.bgg.clientId;
      }
      
      if (!hasApiKey) {
        console.log(`⊘ Skipped command: ${commandName} (${requirement.service} API not configured)`);
        continue;
      }
    }
    
    client.commands.set(command.data.name, command);
    console.log(`✓ Loaded command: ${command.data.name}`);
  } else {
    console.warn(`⚠ Command at ${filePath} is missing required "data" or "execute" property`);
  }
}

// Event: Bot ready
client.once('clientReady', async () => {
  console.log(`✓ Logged in as ${client.user.tag}`);
  console.log(`✓ Serving ${client.guilds.cache.size} guilds`);
  
  // Log successful connection
  logger.logSystem('Bot connected to Discord', {
    botTag: client.user.tag,
    botId: client.user.id,
    guildCount: client.guilds.cache.size,
    commandCount: client.commands.size
  });
  
  // Load persisted timers from previous session
  const restoredTimers = await loadTimers();
  
  // Send restart announcements to channels with active timers (if enabled)
  if (restoredTimers.size > 0) {
    const { loadGuildConfig } = await import('./utils/guildConfig.js');
    
    for (const [channelId, timerData] of restoredTimers) {
      try {
        const channel = await client.channels.fetch(channelId);
        
        if (channel && channel.isTextBased()) {
          // Check if restart announcements are enabled for this guild
          const guildConfig = await loadGuildConfig(channel.guildId);
          if (!guildConfig.notifications?.restartAnnouncements) {
            continue; // Skip if notifications are disabled
          }
          const currentStatus = getTimerStatus(channelId);
          
          const embedFields = [
            {
              name: 'Timer',
              value: timerData.label || 'No label',
              inline: true,
            },
            {
              name: 'Elapsed Time',
              value: currentStatus.elapsedFormatted,
              inline: true,
            },
            {
              name: 'Started by',
              value: timerData.username,
              inline: true,
            }
          ];

          // Add remaining time if duration is set
          if (currentStatus.duration && currentStatus.remainingFormatted) {
            embedFields.push({
              name: 'Remaining Time',
              value: currentStatus.remainingFormatted,
              inline: true,
            });
          }

          const embed = new EmbedBuilder()
            .setColor(0xFFA500)
            .setTitle('🔄 Bot Restarted')
            .setDescription('The bot has been restarted and your timer has been restored.')
            .addFields(embedFields)
            .setFooter({ text: currentStatus.duration ? 'Auto-stop enabled' : 'Use /timer stop to end the timer' })
            .setTimestamp();
          
          await channel.send({ embeds: [embed] });
        }
      } catch (error) {
        console.error(`Failed to send restart announcement to channel ${channelId}:`, error);
      }
    }
  }
  
  // Restore auto-stop timeouts for timers with durations
  await restoreTimerTimeouts(client);
  
  // Initialize tournament voting scheduler
  const { initialize: initTournamentScheduler } = await import('./utils/tournamentScheduler.js');
  initTournamentScheduler(client);

  // Initialize survey auto-expiry scheduler
  const { initialize: initPollScheduler } = await import('./utils/pollScheduler.js');
  initPollScheduler(client);

  // Start API server for event requests
  const { startApiServer } = await import('./api/server.js');
  const apiPort = process.env.API_PORT || 3000;
  startApiServer(client, apiPort);
});

// Event: Interaction (slash commands)
client.on('interactionCreate', async (interaction) => {
  // Handle slash commands
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);

    if (!command) {
      console.error(`No command matching ${interaction.commandName} was found.`);
      return;
    }

    try {
      // Check rate limits
      const { checkRateLimit } = await import('./utils/rateLimiter.js');
      
      // Serialize command arguments for pattern detection
      const commandArgs = interaction.options.data
        .map(opt => `${opt.name}:${opt.value}`)
        .join(' ');
      
      const rateCheck = await checkRateLimit(
        interaction.guildId,
        interaction.user.id,
        interaction.commandName,
        interaction.member,
        commandArgs
      );
      
      if (rateCheck.limited) {
        await interaction.reply({
          content: `⏱️ ${rateCheck.message}`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      
      const startTime = Date.now();
      await command.execute(interaction);
      const duration = Date.now() - startTime;
      
      // Log successful command execution
      logger.logCommand(
        interaction.commandName,
        interaction.user,
        interaction.guild,
        {
          subcommand: interaction.options.getSubcommand?.(false),
          channelId: interaction.channelId,
          duration
        },
        true
      );
      
      // Log slow commands
      if (duration > 3000) {
        logger.logPerformance(
          `Command: /${interaction.commandName}`,
          duration,
          {
            userId: interaction.user.id,
            guildId: interaction.guild?.id
          }
        );
      }
    } catch (error) {
      console.error('Command execution error:', error);
      
      // Log command error
      logger.logCommand(
        interaction.commandName,
        interaction.user,
        interaction.guild,
        {
          subcommand: interaction.options.getSubcommand?.(false),
          channelId: interaction.channelId
        },
        false,
        error
      );
      
      const errorMessage = { content: 'There was an error executing this command!', flags: MessageFlags.Ephemeral };
      
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(errorMessage);
        } else {
          await interaction.reply(errorMessage);
        }
      } catch (replyError) {
        console.error('Failed to send error message to user:', replyError.message);
        logger.error(logger.LogCategory.COMMAND, 'Failed to send error message to user', {
          originalError: error.message,
          replyError: replyError.message,
          userId: interaction.user.id
        });
      }
    }
  }
  
  // Handle button interactions (for result selection)
  else if (interaction.isButton()) {
    const { handleButtonInteraction } = await import('./handlers/buttonHandler.js');
    await handleButtonInteraction(interaction);
  }
  
  // Handle select menu interactions (string selects like search results, and
  // channel selects like the event-approval text/voice channel pickers)
  else if (interaction.isStringSelectMenu() || interaction.isChannelSelectMenu()) {
    const { handleSelectInteraction } = await import('./handlers/selectHandler.js');
    await handleSelectInteraction(interaction);
  }
  
  // Handle modal submissions
  else if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('watched_modal_')) {
      const [, , channelId, userId, encodedTitle] = interaction.customId.split('_');
      
      // Only allow the person who opened the modal
      if (interaction.user.id !== userId) {
        await interaction.reply({
          content: '❌ Only the person who opened this form can submit it.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      
      // Get title either from customId (pre-filled) or from modal input (user searched)
      let title;
      if (encodedTitle === 'notitle') {
        // Timer had no label - user must provide title
        title = interaction.fields.getTextInputValue('title');
      } else {
        // Timer had label - title was pre-filled
        title = Buffer.from(encodedTitle, 'base64').toString('utf-8');
      }
      
      const notes = interaction.fields.getTextInputValue('notes') || null;
      
      // Defer reply publicly so everyone can see the watch history entry
      await interaction.deferReply();
      
      try {
        const { searchMovies, searchTVShows } = await import('./services/tmdbService.js');
        
        // Search for the title
        const [movieResults, tvResults] = await Promise.all([
          searchMovies(title),
          searchTVShows(title),
        ]);
        
        const allResults = [
          ...(movieResults || []).map(r => ({ ...r, type: 'movie' })),
          ...(tvResults || []).map(r => ({ ...r, type: 'tv' })),
        ];
        
        if (allResults.length === 0) {
          await interaction.editReply({
            content: `Could not find "${title}" in the database. Try using \`/watched add\` to search manually.`,
          });
          
          // Remove the button from the original message
          await interaction.message.edit({ components: [] }).catch(() => {});
          return;
        }
        
        // Use the first result
        const result = allResults[0];
        const { getMovieDetails, getTVShowDetails } = await import('./services/tmdbService.js');
        const { saveWatchHistory } = await import('./utils/watchHistoryManager.js');
        const { EmbedBuilder } = await import('discord.js');
        
        const details = result.type === 'movie' 
          ? await getMovieDetails(result.id)
          : await getTVShowDetails(result.id);
        
        const fullTitle = details.title || details.name;
        const year = details.release_date || details.first_air_date;
        const yearStr = year ? year.split('-')[0] : '';
        
        // Save to history
        await saveWatchHistory(interaction.guildId, {
          tmdbId: result.id,
          type: result.type,
          title: fullTitle,
          year: yearStr,
          notes: notes || null,
          savedBy: interaction.user.username,
          savedById: interaction.user.id,
          watchedAt: Date.now(),
          channelId: channelId,
          channelName: interaction.channel?.name || 'Unknown Channel',
        });
        
        // Track watched log in statistics
        const { trackSearch } = await import('./utils/statsTracker.js');
        await trackSearch(
          interaction.guildId,
          interaction.user.id,
          interaction.user.username,
          'watched',
          fullTitle,
          yearStr
        );
        
        const embed = new EmbedBuilder()
          .setColor(0x00FF00)
          .setTitle('✅ Added to Watch History')
          .setDescription(`**${fullTitle}** (${yearStr})`)
          .addFields(
            {
              name: 'Type',
              value: result.type === 'movie' ? 'Movie' : 'TV Show',
              inline: true,
            },
            {
              name: 'Watch Party Channel',
              value: `<#${channelId}>`,
              inline: true,
            }
          );
        
        if (notes) {
          embed.addFields({
            name: 'Notes',
            value: notes,
            inline: false,
          });
        }
        
        embed.setFooter({ text: `Saved by ${interaction.user.username}` });
        embed.setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        
        // Remove the button from the original message
        await interaction.message.edit({ components: [] }).catch(() => {});
        
      } catch (error) {
        console.error('Modal submission error:', error);
        await interaction.editReply({
          content: 'An error occurred while adding to watch history.',
        });
      }
    } else if (interaction.customId.startsWith('edit_event_modal_')) {
      const requestId = interaction.customId.replace('edit_event_modal_', '');

      if (!interaction.member.permissions.has('ManageEvents') &&
          !interaction.member.permissions.has('Administrator')) {
        await interaction.reply({
          content: '❌ Only moderators and administrators can edit event requests.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (!global.eventRequests || !global.eventRequests.has(requestId)) {
        await interaction.reply({
          content: '❌ This event request has expired or was already processed.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const requestData = global.eventRequests.get(requestId);
      requestData.title = interaction.fields.getTextInputValue('title');
      requestData.description = interaction.fields.getTextInputValue('description') || null;

      const { saveEventRequests } = await import('./api/server.js');
      await saveEventRequests();

      // Reflect the edited title/description on the moderation-channel
      // embed. When a channel is already known this gets immediately
      // overwritten by the "Approved" embed below; when it isn't, this is
      // what stays visible while the channel picker is shown.
      const originalEmbedForEdit = interaction.message?.embeds[0];
      let editedEmbed = null;
      if (originalEmbedForEdit) {
        editedEmbed = new EmbedBuilder(originalEmbedForEdit)
          .setTitle('🎬 New Event Request')
          .setDescription(`**${requestData.title}**`);

        const descriptionFieldIndex = editedEmbed.data.fields?.findIndex(f => f.name === '📝 Description');
        if (descriptionFieldIndex !== undefined && descriptionFieldIndex !== -1) {
          editedEmbed.data.fields[descriptionFieldIndex].value = requestData.description || 'No description provided';
        }

        await interaction.message.edit({ embeds: [editedEmbed] }).catch(() => {});
      }

      // Saving an edit immediately approves the request — no separate
      // Approve click needed. If a channel isn't known yet, show the same
      // channel-picker the Approve button uses instead of creating the
      // event outright.
      if (!requestData.channelId) {
        const { ChannelSelectMenuBuilder, ChannelType, ButtonBuilder, ButtonStyle, ActionRowBuilder } = await import('discord.js');

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
          .setCustomId(`confirm_event_channels_${requestId}_full`)
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
          content: `✅ Updated the request's title/description.\n\n📍 **Select Channels for Event**\n**${requestData.title}**\n\nChoose the text channel where this event will take place, and optionally a voice channel.`,
          components: [textRow, voiceRow, buttonRow],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const { createScheduledEventFromRequest, buildApprovedEmbed, cleanupEventRequestState, postApprovalAnnouncement } = await import('./utils/eventRequestApproval.js');

      try {
        const approvalType = requestData.voiceChannelId ? 'both' : 'full';
        const { scheduledEvent, useVoiceChannel } = await createScheduledEventFromRequest({
          guild: interaction.guild,
          requestId,
          requestData,
          approvalType,
        });

        if (editedEmbed) {
          const approvedEmbed = buildApprovedEmbed(editedEmbed, {
            approvedByTag: interaction.user.tag,
            approvalType,
          });
          await interaction.message.edit({ embeds: [approvedEmbed], components: [] }).catch(() => {});
        }

        await cleanupEventRequestState({ guildId: interaction.guildId, requestId });
        await postApprovalAnnouncement(interaction.channel, {
          guildId: interaction.guildId,
          outcome: 'approved',
          title: requestData.title,
          actorTag: interaction.user.tag,
          scheduledEvent,
        });

        const eventTypeText = useVoiceChannel ? 'voice channel event' : 'text-only event';
        await interaction.editReply({
          content: `✅ Updated and approved as ${eventTypeText}!\n**${requestData.title}**\n\nEvent ID: ${scheduledEvent.id}\nEvent URL: ${scheduledEvent.url}`,
        });
      } catch (error) {
        console.error('[EventRequest] Error auto-approving edited request:', error);
        await interaction.editReply({
          content: `❌ Saved the edit, but failed to create the event: ${error.message}`,
        });
      }
    } else if (interaction.customId.startsWith('deny_event_modal_')) {
      const requestId = interaction.customId.replace('deny_event_modal_', '');

      if (!interaction.member.permissions.has('ManageEvents') &&
          !interaction.member.permissions.has('Administrator')) {
        await interaction.reply({
          content: '❌ Only moderators and administrators can approve/deny event requests.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (!global.eventRequests || !global.eventRequests.has(requestId)) {
        await interaction.reply({
          content: '❌ This event request has expired or was already processed.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const requestData = global.eventRequests.get(requestId);
      const reason = interaction.fields.getTextInputValue('reason') || null;

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const { saveEventRequests, saveEventChannelSelections } = await import('./api/server.js');
      const { postApprovalAnnouncement } = await import('./utils/eventRequestApproval.js');

      const originalEmbed = interaction.message?.embeds[0];
      if (originalEmbed) {
        const deniedEmbed = new EmbedBuilder(originalEmbed)
          .setColor(0xFF0000)
          .setTitle('❌ Event Request Denied')
          .setFooter({ text: `Denied by ${interaction.user.tag} • ${originalEmbed.footer?.text || ''}` });

        if (reason) {
          deniedEmbed.addFields({ name: '📄 Reason', value: reason, inline: false });
        }

        await interaction.message.edit({
          embeds: [deniedEmbed],
          components: [],
        }).catch(() => {});
      }

      global.eventRequests.delete(requestId);
      if (global.eventChannelSelections) {
        global.eventChannelSelections.delete(`${interaction.guildId}_${requestId}`);
        await saveEventChannelSelections();
      }
      await saveEventRequests();

      await postApprovalAnnouncement(interaction.channel, {
        guildId: interaction.guildId,
        outcome: 'denied',
        title: requestData.title,
        actorTag: interaction.user.tag,
        reason,
      });

      let dmSucceeded = false;
      try {
        const submitter = await interaction.client.users.fetch(requestData.submitterDiscordId);
        const dmEmbed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('❌ Your Event Request Was Denied')
          .setDescription(`**${requestData.title}**`)
          .setTimestamp();

        if (reason) {
          dmEmbed.addFields({ name: 'Reason', value: reason, inline: false });
        }

        await submitter.send({ embeds: [dmEmbed] });
        dmSucceeded = true;
      } catch (dmError) {
        console.error('[EventRequest] Failed to DM submitter about denial:', dmError.message);
      }

      await interaction.editReply({
        content: dmSucceeded
          ? '✅ Request denied and the user was notified.'
          : '✅ Request denied. (Could not DM the user — they may have DMs disabled.)',
      });
    }
  }
});

// Event: Message Reaction Add (for polls)
client.on('messageReactionAdd', async (reaction, user) => {
  // Ignore bot reactions
  if (user.bot) return;
  
  try {
    // Fetch the reaction if it's partial
    if (reaction.partial) {
      await reaction.fetch();
    }
    
    // Fetch the message if it's partial
    if (reaction.message.partial) {
      await reaction.message.fetch();
    }
    
    const { getPollByMessageId, addVote, createPollEmbed, VOTE_EMOJIS } = await import('./utils/pollManager.js');

    // Check if this message is a poll
    const poll = getPollByMessageId(reaction.message.guildId, reaction.message.id);

    if (!poll) return;

    // Check if poll is still active
    if (poll.status !== 'active') {
      // Remove reaction from closed poll
      await reaction.users.remove(user.id);
      return;
    }

    // Check if the emoji is valid for this poll
    const emojiIndex = VOTE_EMOJIS.indexOf(reaction.emoji.name);

    if (emojiIndex === -1 || emojiIndex >= poll.options.length) {
      // Invalid emoji for this poll
      await reaction.users.remove(user.id);
      return;
    }

    // Add the vote
    try {
      const updatedPoll = addVote(reaction.message.guildId, poll.pollId, emojiIndex, user.id);

      // If multiple votes are not allowed, remove user's reactions from other options
      if (!poll.allowMultipleVotes) {
        for (let i = 0; i < poll.options.length; i++) {
          if (i !== emojiIndex) {
            const otherReaction = reaction.message.reactions.cache.find(r => r.emoji.name === VOTE_EMOJIS[i]);
            if (otherReaction) {
              await otherReaction.users.remove(user.id);
            }
          }
        }
      }

      // Reflect the new vote counts on the survey message itself.
      await reaction.message.edit({ embeds: [createPollEmbed(updatedPoll, true)] }).catch(error => {
        console.error('Error updating poll message after vote:', error.message);
      });

    } catch (error) {
      console.error('Error adding vote:', error);
      await reaction.users.remove(user.id);
    }

  } catch (error) {
    console.error('Error handling reaction add:', error);
  }
});

// Event: Message Reaction Remove (for polls)
client.on('messageReactionRemove', async (reaction, user) => {
  // Ignore bot reactions
  if (user.bot) return;
  
  try {
    // Fetch the reaction if it's partial
    if (reaction.partial) {
      await reaction.fetch();
    }
    
    // Fetch the message if it's partial
    if (reaction.message.partial) {
      await reaction.message.fetch();
    }
    
    const { getPollByMessageId, removeVote, createPollEmbed, VOTE_EMOJIS } = await import('./utils/pollManager.js');

    // Check if this message is a poll
    const poll = getPollByMessageId(reaction.message.guildId, reaction.message.id);

    if (!poll) return;

    // A closed poll's reactions were already stripped via removeAll() when
    // it closed — nothing to reflect on the message here.
    if (poll.status !== 'active') return;

    // Check if the emoji is valid for this poll
    const emojiIndex = VOTE_EMOJIS.indexOf(reaction.emoji.name);

    if (emojiIndex === -1 || emojiIndex >= poll.options.length) {
      return;
    }

    // Remove the vote
    try {
      const updatedPoll = removeVote(reaction.message.guildId, poll.pollId, emojiIndex, user.id);

      // Reflect the new vote counts on the survey message itself.
      await reaction.message.edit({ embeds: [createPollEmbed(updatedPoll, true)] }).catch(error => {
        console.error('Error updating poll message after vote removal:', error.message);
      });
    } catch (error) {
      console.error('Error removing vote:', error);
    }

  } catch (error) {
    console.error('Error handling reaction remove:', error);
  }
});

// Login
client.login(config.discord.token);

// Graceful shutdown handlers
async function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  
  logger.logSystem(`Graceful shutdown initiated: ${signal}`, {
    signal,
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage()
  });
  
  // Stop tournament scheduler
  const { shutdown: shutdownScheduler } = await import('./utils/tournamentScheduler.js');
  shutdownScheduler();

  // Stop poll scheduler
  const { shutdown: shutdownPollScheduler } = await import('./utils/pollScheduler.js');
  shutdownPollScheduler();

  // Destroy Discord client
  client.destroy();
  
  console.log('✓ Shutdown complete');
  logger.logSystem('Bot shutdown complete');
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.emergency(logger.LogCategory.SYSTEM, 'Uncaught exception', {
    error: error.message,
    stack: error.stack,
    memory: process.memoryUsage()
  });
  console.error('Uncaught exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.critical(logger.LogCategory.SYSTEM, 'Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
    memory: process.memoryUsage()
  });
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
});

// Handle Discord.js errors
client.on('error', (error) => {
  logger.error(logger.LogCategory.SYSTEM, 'Discord client error', {
    error: error.message,
    stack: error.stack
  });
  console.error('Discord client error:', error);
});

// Handle Discord.js warnings
client.on('warn', (warning) => {
  logger.warning(logger.LogCategory.SYSTEM, 'Discord client warning', {
    warning
  });
  console.warn('Discord client warning:', warning);
});

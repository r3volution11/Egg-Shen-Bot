import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, GuildScheduledEventStatus, StringSelectMenuBuilder } from 'discord.js';
import { startTimer, stopTimer, getTimerStatus } from '../utils/timerManager.js';
import { loadGuildConfig } from '../utils/guildConfig.js';
import { searchMovies, searchTVShows, getMovieDetails, getTVShowDetails } from '../services/tmdbService.js';

/**
 * Auto-detect event title from scheduled events
 * Looks for active events where the event location matches the current channel
 */
async function getEventTitleForChannel(guild, channelId) {
  try {
    console.log(`[Timer Auto-Detection] Checking for events in channel ${channelId}...`);
    
    // Fetch all scheduled events
    const events = await guild.scheduledEvents.fetch();
    console.log(`[Timer Auto-Detection] Found ${events.size} total scheduled event(s)`);
    
    // Find active events
    const activeEvents = events.filter(event => event.status === GuildScheduledEventStatus.Active);
    console.log(`[Timer Auto-Detection] Found ${activeEvents.size} ACTIVE event(s)`);
    
    if (activeEvents.size === 0) {
      console.log(`[Timer Auto-Detection] No active events found`);
      return null;
    }
    
    // Look for an event where the channel matches
    // Discord events can have a channel property if it's a voice/stage event
    // or entityMetadata.location for external events (we check both)
    for (const [, event] of activeEvents) {
      console.log(`[Timer Auto-Detection] Checking event: "${event.name}"`);
      console.log(`[Timer Auto-Detection] - Event status: ${event.status}`);
      console.log(`[Timer Auto-Detection] - Event channelId: ${event.channelId}`);
      console.log(`[Timer Auto-Detection] - Event location: ${event.entityMetadata?.location || 'none'}`);
      
      // Check if it's a channel-based event and matches our channel
      if (event.channelId === channelId) {
        console.log(`[Timer Auto-Detection] ✅ Found matching event: "${event.name}" (channel-based)`);
        return event.name;
      }
      
      // Check if the location field mentions this channel
      // Users might write "#movie-night" or the channel ID in the location
      if (event.entityMetadata?.location) {
        const location = event.entityMetadata.location.toLowerCase();
        const channelMention = `<#${channelId}>`;
        
        console.log(`[Timer Auto-Detection] - Checking if location contains channel ID or mention...`);
        console.log(`[Timer Auto-Detection] - Looking for: "${channelId}" or "${channelMention}"`);
        
        // Check if location contains channel mention or ID
        if (location.includes(channelId) || location.includes(channelMention.toLowerCase())) {
          console.log(`[Timer Auto-Detection] ✅ Found matching event: "${event.name}" (location mentions channel)`);
          return event.name;
        }
        
        // Also check if location matches channel name (e.g., "#general", "#movie-night")
        // Get the actual channel to compare names
        const channel = guild.channels.cache.get(channelId);
        if (channel) {
          const channelNamePattern = `#${channel.name}`.toLowerCase();
          console.log(`[Timer Auto-Detection] - Also checking channel name: "${channelNamePattern}"`);
          
          if (location === channelNamePattern || location.includes(channelNamePattern)) {
            console.log(`[Timer Auto-Detection] ✅ Found matching event: "${event.name}" (location matches channel name)`);
            return event.name;
          }
        }
      }
    }
    
    console.log(`[Timer Auto-Detection] ❌ No matching events found for channel ${channelId}`);
    return null;
  } catch (error) {
    console.error('[Timer Auto-Detection] Error fetching scheduled events:', error);
    return null;
  }
}

/**
 * Get full event object for remind subcommand
 * Returns the event object instead of just the title
 */
async function getEventForChannel(guild, channelId) {
  try {
    console.log(`[Timer Remind] Checking for events in channel ${channelId}...`);
    
    // Fetch all scheduled events
    const events = await guild.scheduledEvents.fetch();
    console.log(`[Timer Remind] Found ${events.size} total scheduled event(s)`);
    
    // Find active or scheduled events (not just active)
    const relevantEvents = events.filter(event => 
      event.status === GuildScheduledEventStatus.Active || 
      event.status === GuildScheduledEventStatus.Scheduled
    );
    console.log(`[Timer Remind] Found ${relevantEvents.size} active/scheduled event(s)`);
    
    if (relevantEvents.size === 0) {
      console.log(`[Timer Remind] No relevant events found`);
      return null;
    }
    
    // Look for an event where the channel matches
    for (const [, event] of relevantEvents) {
      console.log(`[Timer Remind] Checking event: "${event.name}"`);
      console.log(`[Timer Remind] - Event status: ${event.status}`);
      console.log(`[Timer Remind] - Event channelId: ${event.channelId}`);
      console.log(`[Timer Remind] - Event location: ${event.entityMetadata?.location || 'none'}`);
      
      // Check if it's a channel-based event and matches our channel
      if (event.channelId === channelId) {
        console.log(`[Timer Remind] ✅ Found matching event: "${event.name}" (channel-based)`);
        return event;
      }
      
      // Check if the location field mentions this channel
      if (event.entityMetadata?.location) {
        const location = event.entityMetadata.location.toLowerCase();
        const channelMention = `<#${channelId}>`;
        
        console.log(`[Timer Remind] - Checking if location contains channel ID or mention...`);
        
        // Check if location contains channel mention or ID
        if (location.includes(channelId) || location.includes(channelMention.toLowerCase())) {
          console.log(`[Timer Remind] ✅ Found matching event: "${event.name}" (location mentions channel)`);
          return event;
        }
        
        // Also check if location matches channel name
        const channel = guild.channels.cache.get(channelId);
        if (channel) {
          const channelNamePattern = `#${channel.name}`.toLowerCase();
          console.log(`[Timer Remind] - Also checking channel name: "${channelNamePattern}"`);
          
          if (location === channelNamePattern || location.includes(channelNamePattern)) {
            console.log(`[Timer Remind] ✅ Found matching event: "${event.name}" (location matches channel name)`);
            return event;
          }
        }
      }
    }
    
    console.log(`[Timer Remind] ❌ No matching events found for channel ${channelId}`);
    return null;
  } catch (error) {
    console.error('[Timer Remind] Error fetching scheduled events:', error);
    return null;
  }
}

/**
 * Search for content on TMDB and return results
 */
async function searchContent(title) {
  try {
    // Search both movies and TV shows
    const [movieResults, tvResults] = await Promise.all([
      searchMovies(title),
      searchTVShows(title)
    ]);
    
    // Combine and sort by popularity
    const allResults = [
      ...movieResults.map(m => ({ ...m, type: 'movie' })),
      ...tvResults.map(t => ({ ...t, type: 'tv' }))
    ].sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    
    return allResults.slice(0, 10); // Return top 10
  } catch (error) {
    console.error('[Timer Remind] Error searching TMDB:', error);
    return [];
  }
}

/**
 * Format runtime for display
 */
function formatRuntime(minutes) {
  if (!minutes) return 'Unknown';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export const data = new SlashCommandBuilder()
  .setName('timer')
  .setDescription('Start, stop, or check a timer in this channel')
  .addSubcommand(subcommand =>
    subcommand
      .setName('start')
      .setDescription('🟢 Start a timer in this channel')
      .addStringOption(option =>
        option
          .setName('label')
          .setDescription('Optional label for the timer (e.g., "Movie night", "Break time")')
          .setRequired(false)
      )
      .addIntegerOption(option =>
        option
          .setName('duration')
          .setDescription('Optional duration in minutes (e.g., 120 for 2 hours)')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(600) // 10 hours max
      )
      .addStringOption(option =>
        option
          .setName('theme')
          .setDescription('Timer countdown theme (default: modern)')
          .setRequired(false)
          .addChoices(
            { name: 'Modern (Default)', value: 'modern' },
            { name: 'Classic', value: 'classic' }
          )
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('stop')
      .setDescription('🛑 Stop the active timer in this channel')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('status')
      .setDescription('ℹ️ Check the current timer status in this channel')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('check')
      .setDescription('ℹ️ Check the current timer status in this channel (alias for status)')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('remind')
      .setDescription('⏱️ Announce that the timer is about to start')
      .addStringOption(option =>
        option
          .setName('message')
          .setDescription('Optional custom message (e.g., "Everyone ready?")')
          .setRequired(false)
          .setMaxLength(200)
      )
      .addRoleOption(option =>
        option
          .setName('role')
          .setDescription('Optional role to ping')
          .setRequired(false)
      )
  );

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const channelId = interaction.channelId;

  if (subcommand === 'start') {
    // Defer reply immediately to prevent timeout (ephemeral so selection menu is private)
    await interaction.deferReply({ ephemeral: true });
    
    let label = interaction.options.getString('label') || '';
    let duration = interaction.options.getInteger('duration'); // Duration in minutes
    const theme = interaction.options.getString('theme') || 'modern';
    const userId = interaction.user.id;
    const username = interaction.user.username;
    let autoDetectedLabel = false;

    // Auto-detect event title if no manual label provided
    if (!label) {
      const config = await loadGuildConfig(interaction.guildId);
      const watchPartyChannels = config.watchPartyChannels || [];
      
      console.log(`[Timer] No manual label provided. Checking for auto-detection...`);
      console.log(`[Timer] Configured watch party channels:`, watchPartyChannels);
      console.log(`[Timer] Current channel ID: ${channelId}`);
      
      // Check if this channel is configured for watch party auto-detection
      if (watchPartyChannels.includes(channelId)) {
        console.log(`[Timer] ✅ Channel is configured for auto-detection. Fetching events...`);
        const autoDetectedTitle = await getEventTitleForChannel(interaction.guild, channelId);
        if (autoDetectedTitle) {
          label = autoDetectedTitle;
          autoDetectedLabel = true;
          console.log(`[Timer] ✅ Auto-detected event title: "${label}"`);
        } else {
          console.log(`[Timer] ❌ No matching event found for auto-detection`);
        }
      } else {
        console.log(`[Timer] ❌ Channel ${channelId} is not in configured watch party channels`);
      }
    } else {
      console.log(`[Timer] Manual label provided: "${label}"`);
    }

    // Auto-detect runtime if duration not provided and we have a label
    if (!duration && label && autoDetectedLabel) {
      console.log(`[Timer] Auto-detected label, attempting to detect runtime for: "${label}"`);
      try {
        // Search for the movie/TV show
        const [movieResults, tvResults] = await Promise.all([
          searchMovies(label).catch(() => []),
          searchTVShows(label).catch(() => []),
        ]);

        const allResults = [
          ...(movieResults || []).slice(0, 10).map(r => ({ ...r, type: 'movie' })),
          ...(tvResults || []).slice(0, 10).map(r => ({ ...r, type: 'tv' })),
        ];

        if (allResults.length === 0) {
          console.log(`[Timer] No TMDB results found for "${label}", continuing without duration`);
        } else if (allResults.length === 1) {
          // Only one result, use it automatically
          const result = allResults[0];
          console.log(`[Timer] Found single ${result.type} match: ${result.title || result.name}`);
          
          let runtime = null;
          if (result.type === 'movie') {
            const details = await getMovieDetails(result.id);
            runtime = details?.runtime;
          } else {
            const details = await getTVShowDetails(result.id);
            runtime = details?.episode_run_time?.[0];
          }

          if (runtime && runtime > 0) {
            duration = runtime + 10;
            console.log(`[Timer] ✅ Auto-detected duration: ${runtime}min + 10min buffer = ${duration}min`);
          }
        } else {
          // Multiple results - show selection menu
          console.log(`[Timer] Found ${allResults.length} TMDB results, showing selection menu`);
          
          const options = allResults.map((result) => {
            const title = result.title || result.name;
            const year = result.release_date || result.first_air_date;
            const yearStr = year ? ` (${year.split('-')[0]})` : '';
            const overview = result.overview ? result.overview.substring(0, 97) + '...' : 'No description';
            
            return {
              label: `${title}${yearStr}`.substring(0, 100),
              description: overview.substring(0, 100),
              value: `timer_${result.type}_${result.id}_${theme}`,
            };
          });

          // Add "Skip - No Duration" option
          options.push({
            label: '⏭️ Skip - Start Timer Without Duration',
            description: 'Timer will run continuously until manually stopped',
            value: `timer_skip_${theme}`,
          });

          const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('timer_select_runtime')
            .setPlaceholder('Select the correct title to auto-detect runtime')
            .addOptions(options);

          const row = new ActionRowBuilder().addComponents(selectMenu);

          const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle(`🎬 Confirm Title for "${label}"`)
            .setDescription(
              `Found ${allResults.length} possible matches on TMDB.\n\n` +
              `**Select the correct title** to auto-detect runtime and add a 10-minute buffer.\n\n` +
              `Or choose "Skip" to start the timer without a duration (continuous until stopped).`
            )
            .setFooter({ text: 'Select from the menu below' });

          await interaction.editReply({
            embeds: [embed],
            components: [row],
          });
          
          // Return early - timer will start after user selects
          return;
        }
      } catch (error) {
        console.error('[Timer] Error detecting runtime:', error);
      }
    }

    // Check if timer already exists and start countdown
    await startTimerCountdown(interaction, channelId, userId, username, label, duration, theme);
  } else if (subcommand === 'stop') {
    const result = stopTimer(channelId);

    if (result) {
      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('⏹️ Timer Stopped 🛑')
        .setDescription(result.label ? `**${result.label}**` : 'Timer has been stopped')
        .addFields(
          {
            name: 'Total Time',
            value: result.elapsedFormatted,
            inline: true,
          },
          {
            name: 'Started by',
            value: result.username,
            inline: true,
          },
          {
            name: 'Stopped by',
            value: interaction.user.username,
            inline: true,
          }
        )
        .setFooter({ text: 'Use /timer start to begin a new timer' })
        .setTimestamp();

      // Add button to log to watch history if there's a label
      if (result.label) {
        const logButton = new ButtonBuilder()
          .setCustomId(`log_watched_${channelId}_${result.userId}`)
          .setLabel('📝 Log to Watch History')
          .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(logButton);

        await interaction.reply({ 
          embeds: [embed],
          components: [row],
        });
      } else {
        await interaction.reply({ embeds: [embed] });
      }
    } else {
      await interaction.reply({
        content: '❌ No active timer in this channel. Use `/timer start` to begin one.',
        ephemeral: true,
      });
    }
  } else if (subcommand === 'status' || subcommand === 'check') {
    const timer = getTimerStatus(channelId);

    if (timer) {
      const fields = [
        {
          name: 'Elapsed Time',
          value: timer.elapsedFormatted,
          inline: true,
        },
        {
          name: 'Started by',
          value: timer.username,
          inline: true,
        }
      ];

      // Add remaining time if duration is set
      if (timer.duration) {
        fields.push({
          name: 'Remaining Time',
          value: timer.isExpired ? 'Expired (stopping...)' : timer.remainingFormatted,
          inline: true,
        });
        fields.push({
          name: 'Total Duration',
          value: `${timer.duration} minutes`,
          inline: true,
        });
      }

      const embed = new EmbedBuilder()
        .setColor(timer.isExpired ? 0xFF0000 : 0x5865F2)
        .setTitle(timer.isExpired ? '⏰ Timer Expired' : '⏱️ Timer Status')
        .setDescription(timer.label ? `**${timer.label}**` : 'Active timer')
        .addFields(fields)
        .setFooter({ text: timer.duration ? 'Auto-stop enabled' : 'Use /timer stop to end the timer' })
        .setTimestamp(timer.startTime);

      await interaction.reply({ embeds: [embed] });
    } else {
      await interaction.reply({
        content: '❌ No active timer in this channel. Use `/timer start` to begin one.',
        ephemeral: true,
      });
    }
  } else if (subcommand === 'remind') {
    await interaction.deferReply();
    
    try {
      const customMessage = interaction.options.getString('message');
      const roleToMention = interaction.options.getRole('role');
      
      // Try to detect event from Discord scheduled events
      const event = await getEventForChannel(interaction.guild, interaction.channel.id);
      
      if (!event) {
        return await interaction.editReply({
          content: '❌ No scheduled event found for this channel!\n\nMake sure you have a Discord scheduled event set up for this channel (or with this channel mentioned in the location).',
          ephemeral: true
        });
      }
      
      const eventTitle = event.name;
      console.log(`[Timer Remind] Auto-detected event: "${eventTitle}"`);
      
      // Search TMDB for this title
      const results = await searchContent(eventTitle);
      
      if (results.length === 0) {
        // No TMDB results - just show a basic announcement
        const embed = new EmbedBuilder()
          .setColor('#FF6B9D')
          .setTitle('⏱️ Starting Timer Now!')
          .setDescription(`**${eventTitle}**\n\nTimer starting - get ready!`)
          .setFooter({ text: `Hosted by ${interaction.user.username}` })
          .setTimestamp();
        
        if (customMessage) {
          embed.addFields({ name: '💬 Host', value: customMessage });
        }
        
        // Add voice channel button if event has a voice channel
        const components = [];
        if (event.channelId) {
          const voiceChannel = interaction.guild.channels.cache.get(event.channelId);
          if (voiceChannel && (voiceChannel.type === 2 || voiceChannel.type === 13)) { // Voice or Stage
            const button = new ButtonBuilder()
              .setLabel('Join Voice Channel')
              .setStyle(ButtonStyle.Link)
              .setURL(`https://discord.com/channels/${interaction.guild.id}/${event.channelId}`);
            
            components.push(new ActionRowBuilder().addComponents(button));
          }
        }
        
        const messageContent = roleToMention ? `${roleToMention}` : null;
        
        return await interaction.editReply({ 
          content: messageContent,
          embeds: [embed],
          components
        });
      }
      
      // If only one result, use it directly
      // If multiple results, use the first one (most popular)
      const selectedContent = results[0];
      
      // Get full details
      let details;
      if (selectedContent.type === 'movie') {
        details = await getMovieDetails(selectedContent.id);
      } else {
        details = await getTVShowDetails(selectedContent.id);
      }
      
      // Build the announcement embed
      const embed = new EmbedBuilder()
        .setColor('#FF6B9D')
        .setTitle(`⏱️ Starting Timer Now!`)
        .setDescription(`**${details.title || details.name}**${details.tagline ? `\n*${details.tagline}*` : ''}\n\nGet ready - timer starting!`)
        .setFooter({ text: `Hosted by ${interaction.user.username}` })
        .setTimestamp();
      
      // Add poster if available
      if (details.poster_path) {
        embed.setThumbnail(`https://image.tmdb.org/t/p/w500${details.poster_path}`);
      }
      
      // Add fields
      const fields = [];
      
      // Runtime
      if (details.runtime) {
        fields.push({ 
          name: '⏱️ Runtime', 
          value: formatRuntime(details.runtime),
          inline: true
        });
      } else if (details.episode_run_time && details.episode_run_time.length > 0) {
        fields.push({ 
          name: '⏱️ Episode Length', 
          value: formatRuntime(details.episode_run_time[0]),
          inline: true
        });
      }
      
      // Release year
      const year = details.release_date?.split('-')[0] || details.first_air_date?.split('-')[0];
      if (year) {
        fields.push({ 
          name: '📅 Year', 
          value: year,
          inline: true
        });
      }
      
      // Overview (truncated)
      if (details.overview) {
        const truncatedOverview = details.overview.length > 200 
          ? details.overview.substring(0, 197) + '...' 
          : details.overview;
        fields.push({ 
          name: '📖 Overview', 
          value: truncatedOverview
        });
      }
      
      // Custom message from host
      if (customMessage) {
        fields.push({ 
          name: '💬 Host', 
          value: customMessage
        });
      }
      
      embed.addFields(fields);
      
      // Add buttons
      const components = [];
      const buttons = [];
      
      // TMDB link
      const tmdbUrl = selectedContent.type === 'movie' 
        ? `https://www.themoviedb.org/movie/${selectedContent.id}`
        : `https://www.themoviedb.org/tv/${selectedContent.id}`;
      
      buttons.push(
        new ButtonBuilder()
          .setLabel('View on TMDB')
          .setStyle(ButtonStyle.Link)
          .setURL(tmdbUrl)
      );
      
      // Voice channel button if event has a voice channel
      if (event.channelId) {
        const voiceChannel = interaction.guild.channels.cache.get(event.channelId);
        if (voiceChannel && (voiceChannel.type === 2 || voiceChannel.type === 13)) { // Voice or Stage
          buttons.push(
            new ButtonBuilder()
              .setLabel('Join Voice Channel')
              .setStyle(ButtonStyle.Link)
              .setURL(`https://discord.com/channels/${interaction.guild.id}/${event.channelId}`)
          );
        }
      }
      
      if (buttons.length > 0) {
        components.push(new ActionRowBuilder().addComponents(buttons));
      }
      
      const messageContent = roleToMention ? `${roleToMention}` : null;
      
      await interaction.editReply({
        content: messageContent,
        embeds: [embed],
        components
      });
      
    } catch (error) {
      console.error('[Timer Remind] Error executing remind command:', error);
      
      if (interaction.deferred) {
        await interaction.editReply({ 
          content: '❌ An error occurred while creating the timer reminder.',
          ephemeral: true 
        });
      } else {
        await interaction.reply({ 
          content: '❌ An error occurred while creating the timer reminder.',
          ephemeral: true 
        });
      }
    }
  }
}

/**
 * Start timer countdown and begin timer (always posts publicly to channel)
 * Exported function that can be called from selectHandler
 * @param {object} interaction - Discord interaction
 * @param {string} channelId - Channel ID
 * @param {string} userId - User ID
 * @param {string} username - Username
 * @param {string} label - Timer label
 * @param {number} duration - Duration in minutes (optional)
 * @param {string} theme - Timer theme (modern/classic)
 * @param {boolean} fromSelection - Deprecated parameter (always posts publicly now)
 */
export async function startTimerCountdown(interaction, channelId, userId, username, label, duration, theme, fromSelection = false) {
  // Check if timer already exists
  const existingTimer = getTimerStatus(channelId);
  if (existingTimer) {
    const embed = new EmbedBuilder()
      .setColor(0xFF9900)
      .setTitle('⚠️ Timer Already Running')
      .setDescription('There is already an active timer in this channel.')
      .addFields(
        {
          name: 'Current Timer',
          value: existingTimer.label || 'No label',
          inline: true,
        },
        {
          name: 'Elapsed Time',
          value: existingTimer.elapsedFormatted,
          inline: true,
        },
        {
          name: 'Started by',
          value: existingTimer.username,
          inline: true,
        }
      )
      .setFooter({ text: 'Use /timer stop to end the current timer first' });

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // If coming from selection menu, dismiss the ephemeral message and post publicly
  // Always post countdown publicly to channel (not ephemeral)
  // Dismiss the ephemeral interaction reply first
  try {
    await interaction.editReply({ content: '⏱️ Starting timer...', embeds: [], components: [] });
  } catch (error) {
    // If edit fails, ignore - might already be deleted
  }
  
  // Post countdown publicly to channel
  const channel = interaction.channel;
  const titleLine = label ? `**${label}**` : '**The Overlord of Time**';
  
  if (theme === 'classic') {
      // Classic theme - post to channel
      let message = await channel.send(`${titleLine} **COUNTDOWN STARTING**`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await message.edit(`${titleLine} **COUNTDOWN STARTING**\n${titleLine} **HIT PLAY AT** 🚨**:regional_indicator_g::regional_indicator_o:**🚨`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const countdownMessages = [
        `${titleLine} **COUNTDOWN STARTING**\n${titleLine} **HIT PLAY AT** 🚨**:regional_indicator_g::regional_indicator_o:**🚨\n${titleLine} :five:`,
        `${titleLine} **COUNTDOWN STARTING**\n${titleLine} **HIT PLAY AT** 🚨**:regional_indicator_g::regional_indicator_o:**🚨\n${titleLine} :five:\n${titleLine} :four:`,
        `${titleLine} **COUNTDOWN STARTING**\n${titleLine} **HIT PLAY AT** 🚨**:regional_indicator_g::regional_indicator_o:**🚨\n${titleLine} :five:\n${titleLine} :four:\n${titleLine} :three:`,
        `${titleLine} **COUNTDOWN STARTING**\n${titleLine} **HIT PLAY AT** 🚨**:regional_indicator_g::regional_indicator_o:**🚨\n${titleLine} :five:\n${titleLine} :four:\n${titleLine} :three:\n${titleLine} :two:`,
        `${titleLine} **COUNTDOWN STARTING**\n${titleLine} **HIT PLAY AT** 🚨**:regional_indicator_g::regional_indicator_o:**🚨\n${titleLine} :five:\n${titleLine} :four:\n${titleLine} :three:\n${titleLine} :two:\n${titleLine} :one:`,
        `${titleLine} **COUNTDOWN STARTING**\n${titleLine} **HIT PLAY AT** 🚨**:regional_indicator_g::regional_indicator_o:**🚨\n${titleLine} :five:\n${titleLine} :four:\n${titleLine} :three:\n${titleLine} :two:\n${titleLine} :one:\n${titleLine} 🚨**:regional_indicator_g::regional_indicator_o:**🚨`,
        `${titleLine} **COUNTDOWN STARTING**\n${titleLine} **HIT PLAY AT** 🚨**:regional_indicator_g::regional_indicator_o:**🚨\n${titleLine} :five:\n${titleLine} :four:\n${titleLine} :three:\n${titleLine} :two:\n${titleLine} :one:\n${titleLine} 🚨**:regional_indicator_g::regional_indicator_o:**🚨\n${titleLine} **Timer started**`
      ];
      
      for (const msg of countdownMessages) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await message.edit(msg);
      }
      
      startTimer(channelId, userId, username, label, duration, interaction.client);
      return;
      
    } else {
      // Modern theme - post to channel
      const countdownSteps = [
        { num: 5, color: 0xFF0000, emoji: '🔴', blocks: '🟥🟥🟥🟥🟥' },
        { num: 4, color: 0xFF4400, emoji: '🟠', blocks: '🟧🟧🟧🟧⬜' },
        { num: 3, color: 0xFF8800, emoji: '🟡', blocks: '🟨🟨🟨⬜⬜' },
        { num: 2, color: 0xFFCC00, emoji: '🟢', blocks: '🟩🟩⬜⬜⬜' },
        { num: 1, color: 0x00FF00, emoji: '🟢', blocks: '🟩⬜⬜⬜⬜' },
      ];
      
      const countdownEmbed = new EmbedBuilder()
        .setColor(countdownSteps[0].color)
        .setTitle(`${countdownSteps[0].emoji} STARTING TIMER ${countdownSteps[0].emoji}`)
        .setDescription(`# ${countdownSteps[0].num}\n${countdownSteps[0].blocks}`)
        .setFooter({ text: '🎬 Get ready!' });
      
      let message = await channel.send({ embeds: [countdownEmbed] });
      
      for (let i = 1; i < countdownSteps.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const step = countdownSteps[i];
        countdownEmbed
          .setColor(step.color)
          .setTitle(`${step.emoji} STARTING TIMER ${step.emoji}`)
          .setDescription(`# ${step.num}\n${step.blocks}`);
        await message.edit({ embeds: [countdownEmbed] });
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      countdownEmbed
        .setColor(0x00FF00)
        .setTitle('🎬 🎥 🍿 GO! 🍿 🎥 🎬')
        .setDescription('# 🟢 START!\n🟩🟩🟩🟩🟩\n\n**Timer is now running!**')
        .setFooter({ text: '⏱️ Timer started!' });
      await message.edit({ embeds: [countdownEmbed] });
      
      startTimer(channelId, userId, username, label, duration, interaction.client);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const timerFields = [{
        name: 'Started by',
        value: `<@${userId}>`,
        inline: true,
      }];

      if (duration) {
        timerFields.push({
          name: 'Duration',
          value: `${duration} minutes (auto-stop enabled)`,
          inline: true,
        });
      }

      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('⏱️ Timer Started 🟩')
        .setDescription(label ? `**${label}**` : 'Timer is now running')
        .addFields(timerFields)
        .setFooter({ text: duration ? 'Timer will auto-stop when complete' : 'Use /timer stop to end the timer' })
        .setTimestamp();

      await message.edit({ embeds: [embed] });
      return;
    }
}

import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, GuildScheduledEventStatus } from 'discord.js';
import { startTimer, stopTimer, getTimerStatus } from '../utils/timerManager.js';
import { loadGuildConfig } from '../utils/guildConfig.js';

/**
 * Auto-detect event title from scheduled events
 * Looks for active events where the event location matches the current channel
 */
async function getEventTitleForChannel(guild, channelId) {
  try {
    // Fetch all scheduled events
    const events = await guild.scheduledEvents.fetch();
    
    // Find active events
    const activeEvents = events.filter(event => event.status === GuildScheduledEventStatus.Active);
    
    if (activeEvents.size === 0) {
      return null;
    }
    
    // Look for an event where the channel matches
    // Discord events can have a channel property if it's a voice/stage event
    // or entityMetadata.location for external events (we check both)
    for (const [, event] of activeEvents) {
      // Check if it's a channel-based event and matches our channel
      if (event.channelId === channelId) {
        console.log(`Found matching event: "${event.name}" (channel-based)`);
        return event.name;
      }
      
      // Check if the location field mentions this channel
      // Users might write "#movie-night" or the channel ID in the location
      if (event.entityMetadata?.location) {
        const location = event.entityMetadata.location.toLowerCase();
        const channelMention = `<#${channelId}>`;
        
        // Check if location contains channel mention or ID
        if (location.includes(channelId) || location.includes(channelMention)) {
          console.log(`Found matching event: "${event.name}" (location mentions channel)`);
          return event.name;
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching scheduled events:', error);
    return null;
  }
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
  );

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const channelId = interaction.channelId;

  if (subcommand === 'start') {
    let label = interaction.options.getString('label') || '';
    const userId = interaction.user.id;
    const username = interaction.user.username;

    // Auto-detect event title if no manual label provided
    if (!label) {
      const config = await loadGuildConfig(interaction.guildId);
      const watchPartyChannels = config.watchPartyChannels || [];
      
      // Check if this channel is configured for watch party auto-detection
      if (watchPartyChannels.includes(channelId)) {
        const autoDetectedTitle = await getEventTitleForChannel(interaction.guild, channelId);
        if (autoDetectedTitle) {
          label = autoDetectedTitle;
          console.log(`Auto-detected event title: "${label}"`);
        }
      }
    }

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

      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    // Show countdown before starting with pizzazz!
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
    
    await interaction.reply({ embeds: [countdownEmbed] });
    
    // Countdown from 4 to 1 with visual flair
    for (let i = 1; i < countdownSteps.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const step = countdownSteps[i];
      countdownEmbed
        .setColor(step.color)
        .setTitle(`${step.emoji} STARTING TIMER ${step.emoji}`)
        .setDescription(`# ${step.num}\n${step.blocks}`);
      await interaction.editReply({ embeds: [countdownEmbed] });
    }
    
    // Wait 1 more second then show GO!
    await new Promise(resolve => setTimeout(resolve, 1000));
    countdownEmbed
      .setColor(0x00FF00)
      .setTitle('🎬 🎥 🍿 GO! 🍿 🎥 🎬')
      .setDescription('# 🟢 START!\n🟩🟩🟩🟩🟩\n\n**Timer is now running!**')
      .setFooter({ text: '⏱️ Timer started!' });
    await interaction.editReply({ embeds: [countdownEmbed] });
    
    // NOW start the actual timer
    startTimer(channelId, userId, username, label);
    
    // Wait another second then show the final timer started message
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('⏱️ Timer Started 🟩')
      .setDescription(label ? `**${label}**` : 'Timer is now running')
      .addFields({
        name: 'Started by',
        value: `${interaction.user}`,
        inline: true,
      })
      .setFooter({ text: 'Use /timer stop to end the timer' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
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
          .setCustomId(`log_watched_${channelId}_${interaction.user.id}`)
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
  } else if (subcommand === 'status') {
    const timer = getTimerStatus(channelId);

    if (timer) {
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('⏱️ Timer Status')
        .setDescription(timer.label ? `**${timer.label}**` : 'Active timer')
        .addFields(
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
        )
        .setFooter({ text: 'Use /timer stop to end the timer' })
        .setTimestamp(timer.startTime);

      await interaction.reply({ embeds: [embed] });
    } else {
      await interaction.reply({
        content: '❌ No active timer in this channel. Use `/timer start` to begin one.',
        ephemeral: true,
      });
    }
  }
}

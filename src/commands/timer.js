import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { startTimer, stopTimer, getTimerStatus } from '../utils/timerManager.js';

export const data = new SlashCommandBuilder()
  .setName('timer')
  .setDescription('Start, stop, or check a timer in this channel')
  .addSubcommand(subcommand =>
    subcommand
      .setName('start')
      .setDescription('Start a timer in this channel')
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
      .setDescription('Stop the active timer in this channel')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('status')
      .setDescription('Check the current timer status in this channel')
  );

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const channelId = interaction.channelId;

  if (subcommand === 'start') {
    const label = interaction.options.getString('label') || '';
    const userId = interaction.user.id;
    const username = interaction.user.username;

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

    // Show countdown before starting
    const countdownEmbed = new EmbedBuilder()
      .setColor(0xFFAA00)
      .setTitle('⏱️ Starting Timer...')
      .setDescription('**5**')
      .setFooter({ text: 'Get ready!' });
    
    await interaction.reply({ embeds: [countdownEmbed] });
    
    // Countdown from 5 to 1
    for (let i = 4; i >= 1; i--) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      countdownEmbed.setDescription(`**${i}**`);
      await interaction.editReply({ embeds: [countdownEmbed] });
    }
    
    // Wait 1 more second then show GO!
    await new Promise(resolve => setTimeout(resolve, 1000));
    countdownEmbed
      .setColor(0x00FF00)
      .setTitle('⏱️ GO! 🟩')
      .setDescription('Timer is running!');
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

      await interaction.reply({ embeds: [embed] });
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

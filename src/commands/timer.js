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

    const started = startTimer(channelId, userId, username, label);

    if (started) {
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

      await interaction.reply({ embeds: [embed] });
    } else {
      // Timer already exists
      const currentTimer = getTimerStatus(channelId);
      
      const embed = new EmbedBuilder()
        .setColor(0xFF9900)
        .setTitle('⚠️ Timer Already Running')
        .setDescription('There is already an active timer in this channel.')
        .addFields(
          {
            name: 'Current Timer',
            value: currentTimer.label || 'No label',
            inline: true,
          },
          {
            name: 'Elapsed Time',
            value: currentTimer.elapsedFormatted,
            inline: true,
          },
          {
            name: 'Started by',
            value: currentTimer.username,
            inline: true,
          }
        )
        .setFooter({ text: 'Use /timer stop to end the current timer first' });

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
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

import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import * as logger from '../utils/logger.js';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const logsDir = join(__dirname, '../../logs');

export const data = new SlashCommandBuilder()
  .setName('eggshen-logs')
  .setDescription('View bot logs and diagnostics (Admin only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(subcommand =>
    subcommand
      .setName('stats')
      .setDescription('View log file statistics')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('errors')
      .setDescription('View recent errors')
      .addIntegerOption(option =>
        option
          .setName('count')
          .setDescription('Number of errors to show (default: 10)')
          .setMinValue(1)
          .setMaxValue(50)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('category')
      .setDescription('View recent logs for a category')
      .addStringOption(option =>
        option
          .setName('category')
          .setDescription('Log category')
          .setRequired(true)
          .addChoices(
            { name: 'System', value: 'system' },
            { name: 'Commands', value: 'command' },
            { name: 'Buttons', value: 'button' },
            { name: 'Scheduler', value: 'scheduler' },
            { name: 'Bracket', value: 'bracket' },
            { name: 'API', value: 'api' },
            { name: 'Performance', value: 'performance' }
          )
      )
      .addIntegerOption(option =>
        option
          .setName('count')
          .setDescription('Number of entries to show (default: 10)')
          .setMinValue(1)
          .setMaxValue(50)
      )
  );

export async function execute(interaction) {
  // Only administrators can view logs
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: '❌ Only administrators can view bot logs.',
      ephemeral: true
    });
    return;
  }
  
  const subcommand = interaction.options.getSubcommand();
  
  try {
    switch (subcommand) {
      case 'stats':
        await handleStats(interaction);
        break;
      case 'errors':
        await handleErrors(interaction);
        break;
      case 'category':
        await handleCategory(interaction);
        break;
      default:
        await interaction.reply({
          content: '❌ Unknown subcommand',
          ephemeral: true
        });
    }
  } catch (error) {
    console.error('Error in eggshen-logs command:', error);
    logger.error(logger.LogCategory.COMMAND, 'Error in logs command', {
      subcommand,
      error: error.message,
      userId: interaction.user.id
    });
    
    await interaction.reply({
      content: '❌ An error occurred while fetching logs.',
      ephemeral: true
    });
  }
}

async function handleStats(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  const stats = logger.getLogStats();
  
  if (!stats) {
    await interaction.editReply('❌ Failed to get log statistics.');
    return;
  }
  
  const embed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle('📊 Log Statistics')
    .setDescription('Overview of bot logging system')
    .addFields(
      {
        name: 'Log Files',
        value: `${stats.fileCount} file${stats.fileCount !== 1 ? 's' : ''}`,
        inline: true
      },
      {
        name: 'Total Size',
        value: `${stats.totalSizeMB} MB`,
        inline: true
      },
      {
        name: 'Directory',
        value: `\`${stats.logsDir}\``,
        inline: false
      }
    )
    .setFooter({ text: 'Use /eggshen-logs errors to view recent errors' })
    .setTimestamp();
  
  if (stats.newestFile) {
    embed.addFields({
      name: 'Latest Log File',
      value: stats.newestFile,
      inline: false
    });
  }
  
  await interaction.editReply({ embeds: [embed] });
}

async function handleErrors(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  const count = interaction.options.getInteger('count') || 10;
  
  try {
    // Find the most recent error log file
    const files = readdirSync(logsDir).filter(f => f.endsWith('.log'));
    
    if (files.length === 0) {
      await interaction.editReply('No log files found.');
      return;
    }
    
    // Sort by modification time (newest first)
    const sortedFiles = files
      .map(f => ({ name: f, path: join(logsDir, f), mtime: statSync(join(logsDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    
    // Collect errors from recent log files
    const errors = [];
    
    for (const file of sortedFiles) {
      if (errors.length >= count) break;
      
      try {
        const content = readFileSync(file.path, 'utf8');
        const lines = content.trim().split('\n');
        
        for (const line of lines.reverse()) {
          if (errors.length >= count) break;
          
          try {
            const entry = JSON.parse(line);
            
            // Filter for ERROR, CRITICAL, ALERT, EMERGENCY levels
            if (entry.levelNum <= logger.LogLevel.ERROR) {
              errors.push(entry);
            }
          } catch (parseError) {
            // Skip invalid JSON lines
            continue;
          }
        }
      } catch (readError) {
        console.error(`Failed to read log file ${file.name}:`, readError);
        continue;
      }
    }
    
    if (errors.length === 0) {
      await interaction.editReply('✅ No errors found in recent logs!');
      return;
    }
    
    // Format errors for display
    let description = '';
    
    for (const error of errors.slice(0, count)) {
      const time = new Date(error.timestamp).toLocaleString();
      const emoji = error.levelNum === 0 ? '🚨' : error.levelNum === 1 ? '🔴' : error.levelNum === 2 ? '💥' : '❌';
      description += `${emoji} **${error.level}** [${error.category}]\n`;
      description += `\`${time}\`\n`;
      description += `${error.message.substring(0, 100)}${error.message.length > 100 ? '...' : ''}\n\n`;
      
      if (description.length > 3500) {
        description += `*...and more errors. Check log files for full details.*`;
        break;
      }
    }
    
    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle(`❌ Recent Errors (${errors.length} found)`)
      .setDescription(description || 'No errors to display')
      .setFooter({ text: `Showing ${Math.min(count, errors.length)} most recent errors` })
      .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
    
  } catch (error) {
    console.error('Error reading error logs:', error);
    await interaction.editReply('❌ Failed to read error logs.');
  }
}

async function handleCategory(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  const category = interaction.options.getString('category');
  const count = interaction.options.getInteger('count') || 10;
  
  try {
    // Get today's log file for the category
    const today = new Date().toISOString().split('T')[0];
    const logFile = join(logsDir, `${category}-${today}.log`);
    
    const { existsSync } = await import('fs');
    
    if (!existsSync(logFile)) {
      await interaction.editReply(`No logs found for category "${category}" today.`);
      return;
    }
    
    const content = readFileSync(logFile, 'utf8');
    const lines = content.trim().split('\n');
    
    const entries = [];
    
    for (const line of lines.slice(-count).reverse()) {
      try {
        const entry = JSON.parse(line);
        entries.push(entry);
      } catch (parseError) {
        continue;
      }
    }
    
    if (entries.length === 0) {
      await interaction.editReply(`No valid log entries found for category "${category}".`);
      return;
    }
    
    let description = '';
    
    for (const entry of entries) {
      const time = new Date(entry.timestamp).toLocaleString();
      const emoji = {
        0: '🚨', 1: '🔴', 2: '💥', 3: '❌',
        4: '⚠️', 5: '📢', 6: 'ℹ️', 7: '🐛'
      }[entry.levelNum] || 'ℹ️';
      
      description += `${emoji} **${entry.level}** \`${time}\`\n`;
      description += `${entry.message.substring(0, 80)}${entry.message.length > 80 ? '...' : ''}\n\n`;
      
      if (description.length > 3500) {
        description += `*...and more entries. Check log files for full details.*`;
        break;
      }
    }
    
    const embed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle(`📝 Recent Logs: ${category}`)
      .setDescription(description)
      .setFooter({ text: `Showing ${entries.length} most recent entries` })
      .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
    
  } catch (error) {
    console.error('Error reading category logs:', error);
    await interaction.editReply(`❌ Failed to read logs for category "${category}".`);
  }
}

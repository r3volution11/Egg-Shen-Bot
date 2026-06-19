import { Client, GatewayIntentBits, Collection, EmbedBuilder } from 'discord.js';
import { config } from './config.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdirSync } from 'fs';
import { loadTimers, getTimerStatus } from './utils/timerManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create Discord client
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// Collection to store commands
client.commands = new Collection();

// Load commands
const commandsPath = join(__dirname, 'commands');
const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = join(commandsPath, file);
  const command = await import(`file://${filePath}`);
  
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
    console.log(`✓ Loaded command: ${command.data.name}`);
  } else {
    console.warn(`⚠ Command at ${filePath} is missing required "data" or "execute" property`);
  }
}

// Event: Bot ready
client.once('ready', async () => {
  console.log(`✓ Logged in as ${client.user.tag}`);
  console.log(`✓ Serving ${client.guilds.cache.size} guilds`);
  
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
          
          const embed = new EmbedBuilder()
            .setColor(0xFFA500)
            .setTitle('🔄 Bot Restarted')
            .setDescription('The bot has been restarted and your timer has been restored.')
            .addFields(
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
            )
            .setFooter({ text: 'Use /timer stop to end the timer' })
            .setTimestamp();
          
          await channel.send({ embeds: [embed] });
        }
      } catch (error) {
        console.error(`Failed to send restart announcement to channel ${channelId}:`, error);
      }
    }
  }
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
          ephemeral: true,
        });
        return;
      }
      
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      const errorMessage = { content: 'There was an error executing this command!', ephemeral: true };
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    }
  }
  
  // Handle button interactions (for result selection)
  else if (interaction.isButton()) {
    const { handleButtonInteraction } = await import('./handlers/buttonHandler.js');
    await handleButtonInteraction(interaction);
  }
  
  // Handle select menu interactions
  else if (interaction.isStringSelectMenu()) {
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
          ephemeral: true,
        });
        return;
      }
      
      const title = Buffer.from(encodedTitle, 'base64').toString('utf-8');
      const rating = interaction.fields.getTextInputValue('rating') || null;
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
          rating: rating ? parseFloat(rating) : null,
          notes: notes || null,
          watchedBy: interaction.user.username,
          watchedById: interaction.user.id,
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
          .addFields({
            name: 'Type',
            value: result.type === 'movie' ? 'Movie' : 'TV Show',
            inline: true,
          });
        
        if (rating) {
          embed.addFields({
            name: 'Your Rating',
            value: `${rating}/10`,
            inline: true,
          });
        }
        
        // Add channel information
        embed.addFields({
          name: 'Watch Party Channel',
          value: `<#${channelId}>`,
          inline: true,
        });
        
        if (notes) {
          embed.addFields({
            name: 'Notes',
            value: notes,
            inline: false,
          });
        }
        
        embed.setFooter({ text: `Added by ${interaction.user.username}` });
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
    }
  }
});

// Login
client.login(config.discord.token);

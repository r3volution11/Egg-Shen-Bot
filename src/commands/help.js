import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { isAdmin } from '../utils/guildConfig.js';

export const data = new SlashCommandBuilder()
  .setName('eggshen-help')
  .setDescription('Learn how to use Egg Shen, your mystical guide to movies and TV shows');

export async function execute(interaction) {
  const userIsAdmin = isAdmin(interaction.member);
  
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🎬 Egg Shen - Help')
    .setDescription('Your mystical guide to movies, TV shows, episodes, and games with ratings from multiple services!')
    .addFields(
      {
        name: '🔍 Search Commands',
        value: '**📺 /movie** - Search for a movie\n**📺 /tv** - Search for a TV show\n**🎞️ /episode** - Search for a specific episode by name\n**🎮 /game** - Search for a video game',
        inline: false,
      },
      {
        name: '🎲 Watch Party Features',
        value: '**🎲 /random** - Get random movie, TV show, episode, or game (with filters)\n**📝 /watched** - Log or view watch history with ratings and notes\n**🔍 /similar** - Find similar content recommendations',
        inline: false,
      },
      {
        name: '⏱️ /timer',
        value: 'Start, stop, or check a timer in the current channel.\n\n**Start:** `/timer start label:Movie night`\n**Remind:** `/timer remind message:Everyone ready? role:@Movie Night`\n**Stop:** `/timer stop` (shows watch history button if labeled)\n**Status:** `/timer status`',
        inline: false,
      },
      {
        name: '📊 /stats',
        value: 'View server or personal statistics.\n\n**Server stats:** `/stats type:server filter:all-time`\n**Personal stats:** `/stats type:personal`',
        inline: false,
      },
      {
        name: '❓ /eggshen-help',
        value: 'Display this help message.',
        inline: false,
      }
    );

  // Add admin-only commands if user has permissions
  if (userIsAdmin) {
    embed.addFields(
      {
        name: '⚙️ /eggshen-config (Admin/Moderator Only)',
        value: 'Configure Egg Shen settings for your server.\n\n**View settings:** `/eggshen-config view`\n**Toggle service:** `/eggshen-config toggle service:<service> enabled:<true/false>`\n**Set emoji:** `/eggshen-config emoji service:<service> emoji:<emoji>`\n**Toggle stats:** `/eggshen-config stats-toggle setting:<setting> enabled:<true/false>`\n**Clear stats:** `/eggshen-config stats-clear`\n**Toggle commands:** `/eggshen-config commands-toggle setting:<setting> enabled:<true/false>`\n\n*Services: IMDb, Letterboxd, Trakt, Rotten Tomatoes, JustWatch*',
        inline: false,
      },
      {
        name: '📊 /eggshen-stats (Admin/Moderator Only)',
        value: 'View usage statistics for your server.\n\n**Example:** `/eggshen-stats filter:month`\n\n*Filters: all-time, month, week, today*',
        inline: false,
      },
      {
        name: '🔄 /eggshen-restart (Admin/Moderator Only)',
        value: 'Restart the bot (requires PM2 or similar process manager).\n\n**Note:** The bot will exit and automatically restart if running under a process manager.',
        inline: false,
      }
    );
  }

  embed.addFields(
    {
      name: '\u200B',
      value: '**How it works:**\n1️⃣ Use a command to search\n2️⃣ Select from up to 5 results in the dropdown\n3️⃣ View detailed info with ratings and links!',
      inline: false,
    },
    {
      name: '⭐ Available Ratings & Links',
      value: '• **IMDb** - User ratings (episode-specific for /episode)\n• **Letterboxd** - Film community (movies only)\n• **Trakt** - Community ratings (episode-specific for /episode)\n• **RT Critics** - Rotten Tomatoes critic scores\n• **JustWatch** - Streaming availability',
      inline: false,
    }
  );
  
  embed.setFooter({ text: 'Egg Shen • Your mystical guide to ratings and streaming' });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

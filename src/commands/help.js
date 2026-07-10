import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { isAdmin } from '../utils/guildConfig.js';

export const data = new SlashCommandBuilder()
  .setName('eggshen-help')
  .setDescription('Learn how to use Egg Shen, your mystical guide to movies and TV shows');

export async function execute(interaction) {
  const userIsAdmin = isAdmin(interaction.member);
  
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🧙 Egg Shen Bot - Complete Command List')
    .setDescription('Your mystical guide to movies, TV shows, games, music, books, and more!\n\n💡 **Tip:** Some commands have detailed help - try `/bracket help`.')
    .addFields(
      {
        name: '🎬 Movies & TV Shows',
        value: 
          '**🎥 /movie** - Search for movies with ratings\n' +
          '**📺 /tv** - Search for TV shows with ratings\n' +
          '**🎞️ /episode** - Search for specific episodes by name\n' +
          '**📋 /episode-list** - List all episodes in a season\n' +
          '**🔍 /similar** - Find similar movies or TV shows\n' +
          '**📝 /watched** - Log or view watch history',
        inline: false,
      },
      {
        name: '🎮 Games & Entertainment',
        value:
          '**🎮 /game** - Search for video games (RAWG)\n' +
          '**🎲 /boardgame** - Search for board games (BoardGameGeek)\n' +
          '**📚 /book** - Search for books (Google Books)\n' +
          '**🎵 /soundtrack** - Search for soundtracks (iTunes)',
        inline: false,
      },
      {
        name: '🎲 Random & Discovery',
        value:
          '**🎲 /random** - Get random movie, TV, episode, game, board game, or book\n' +
          '**🔀 Filters:** genre, decade, rating, platform, etc.',
        inline: false,
      },
      {
        name: '🏆 Tournaments & Polls',
        value:
          '**🏆 /bracket** - Run tournaments (movies, TV, games, books, boardgames)\n' +
          '**📊 /survey** - Create polls with up to 10 options\n' +
          '**💡 Pro Tip:** Use `/bracket help` for tournament guide',
        inline: false,
      },
      {
        name: '🎨 AI Image Generation',
        value:
          '**🎨 /image** - Generate AI images: freeform, from a message, or a versus battle between two titles\n' +
          '**🧪 /potion** - Give someone a mystical potion with a flavorful response',
        inline: false,
      },
      {
        name: '⏱️ Watch Party Tools',
        value:
          '**⏱️ /timer** - Start, stop, or check channel timers\n' +
          '**🎉 /watchparty** - Announce that a scheduled watch party is starting\n' +
          '**📊 /stats** - View server or personal statistics',
        inline: false,
      },
      {
        name: '❓ Help & Info',
        value:
          '**❓ /eggshen-help** - This help message\n' +
          '**📖 Full Documentation:** [eggshenbot.com](https://eggshenbot.com)',
        inline: false,
      }
    );

  // Add admin-only commands if user has permissions
  if (userIsAdmin) {
    embed.addFields(
      {
        name: '⚙️ Admin & Moderation',
        value:
          '**⚙️ /eggshen-config** - Configure bot settings\n' +
          '  • Toggle services (IMDb, Letterboxd, Trakt, RT, JustWatch)\n' +
          '  • Set custom emojis\n' +
          '  • Toggle stats tracking\n' +
          '  • Configure commands\n\n' +
          '**📊 /eggshen-stats** - View detailed usage statistics\n' +
          '**📋 /eggshen-logs** - View bot activity logs\n' +
          '**🔄 /eggshen-restart** - Restart the bot (requires PM2)',
        inline: false,
      }
    );
  }

  embed.addFields(
    {
      name: '💡 How It Works',
      value: 
        '1️⃣ Use a command to search\n' +
        '2️⃣ Select from results in the dropdown menu\n' +
        '3️⃣ View detailed info with ratings, links, and streaming!\n' +
        '4️⃣ Click buttons for interactive features',
      inline: false,
    },
    {
      name: '⭐ Ratings & Services',
      value: 
        '• **IMDb** - User ratings\n' +
        '• **Letterboxd** - Film community (movies)\n' +
        '• **Trakt** - Community ratings (movies & TV)\n' +
        '• **Rotten Tomatoes** - Critics & audience scores\n' +
        '• **TMDB** - Streaming availability\n' +
        '• **RAWG** - Game ratings\n' +
        '• **BoardGameGeek** - Board game ratings',
      inline: false,
    }
  );
  
  embed.setFooter({ text: 'Egg Shen Bot • Your mystical entertainment companion' });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

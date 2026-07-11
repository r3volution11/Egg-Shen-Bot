import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { isAdmin, canUseCommand, loadGuildConfig } from '../utils/guildConfig.js';

export const data = new SlashCommandBuilder()
  .setName('eggshen-help')
  .setDescription('Learn how to use Egg Shen, your mystical guide to movies and TV shows');

export async function execute(interaction) {
  const userIsAdmin = isAdmin(interaction.member);

  const [
    movieAllowed,
    tvAllowed,
    episodeAllowed,
    gameAllowed,
    boardgameAllowed,
    bookAllowed,
    soundtrackAllowed,
    surveyAllowed,
    bracketAllowed,
    config,
  ] = await Promise.all([
    canUseCommand(interaction.guildId, interaction.member, 'movie'),
    canUseCommand(interaction.guildId, interaction.member, 'tv'),
    canUseCommand(interaction.guildId, interaction.member, 'episode'),
    canUseCommand(interaction.guildId, interaction.member, 'game'),
    canUseCommand(interaction.guildId, interaction.member, 'boardgame'),
    canUseCommand(interaction.guildId, interaction.member, 'book'),
    canUseCommand(interaction.guildId, interaction.member, 'soundtrack'),
    canUseCommand(interaction.guildId, interaction.member, 'survey'),
    canUseCommand(interaction.guildId, interaction.member, 'bracket'),
    loadGuildConfig(interaction.guildId),
  ]);

  // AI image generation has its own separate config block (not part of
  // commandPermissions) - mirror canGenerateImage's own fallback exactly so
  // this never disagrees with the real enforcement logic.
  const aiConfig = config.aiImages || { enabled: true, permissions: 'everyone' };
  const imageAllowed = aiConfig.enabled;

  function buildCategory(entries) {
    return entries
      .filter(entry => entry.enabled)
      .map(entry => entry.line)
      .join('\n');
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🧙 Egg Shen Bot - Complete Command List')
    .setDescription('Your mystical guide to movies, TV shows, games, music, books, and more!\n\n💡 **Tip:** Some commands have detailed help - try `/bracket help`.');

  const moviesAndTV = buildCategory([
    { enabled: movieAllowed, line: '**🎥 /movie** - Search for movies with ratings' },
    { enabled: tvAllowed, line: '**📺 /tv** - Search for TV shows with ratings' },
    { enabled: episodeAllowed, line: '**🎞️ /episode** - Search for specific episodes by name' },
    { enabled: true, line: '**📋 /episode-list** - List all episodes in a season' },
    { enabled: true, line: '**🔍 /similar** - Find similar movies or TV shows' },
    { enabled: true, line: '**📝 /watched** - Log or view watch history' },
  ]);
  if (moviesAndTV) {
    embed.addFields({ name: '🎬 Movies & TV Shows', value: moviesAndTV, inline: false });
  }

  const gamesAndEntertainment = buildCategory([
    { enabled: gameAllowed, line: '**🎮 /game** - Search for video games (RAWG)' },
    { enabled: boardgameAllowed, line: '**🎲 /boardgame** - Search for board games (BoardGameGeek)' },
    { enabled: bookAllowed, line: '**📚 /book** - Search for books (Google Books)' },
    { enabled: soundtrackAllowed, line: '**🎵 /soundtrack** - Search for soundtracks (iTunes)' },
  ]);
  if (gamesAndEntertainment) {
    embed.addFields({ name: '🎮 Games & Entertainment', value: gamesAndEntertainment, inline: false });
  }

  // /random's own subcommands are individually gated, but the command as a
  // whole is meaningful even if some of its subcommands are restricted -
  // always show it rather than modeling subcommand-level detail here.
  embed.addFields({
    name: '🎲 Random & Discovery',
    value:
      '**🎲 /random** - Get random movie, TV, episode, game, board game, or book\n' +
      '**🔀 Filters:** genre, decade, rating, platform, etc.',
    inline: false,
  });

  const tournamentsAndPolls = buildCategory([
    { enabled: bracketAllowed, line: '**🏆 /bracket** - Run tournaments (movies, TV, games, books, boardgames)\n**💡 Pro Tip:** Use `/bracket help` for tournament guide' },
    { enabled: surveyAllowed, line: '**📊 /survey** - Create polls with up to 10 options' },
  ]);
  if (tournamentsAndPolls) {
    embed.addFields({ name: '🏆 Tournaments & Polls', value: tournamentsAndPolls, inline: false });
  }

  // /potion isn't gated by aiImages at all (it's flavor-text responses, not
  // real image generation), so it stays visible even when /image is hidden.
  const aiImageGeneration = buildCategory([
    { enabled: imageAllowed, line: '**🎨 /image** - Generate AI images: freeform, from a message, or a versus battle between two titles' },
    { enabled: true, line: '**🧪 /potion** - Give someone a mystical potion with a flavorful response' },
  ]);
  if (aiImageGeneration) {
    embed.addFields({ name: '🎨 AI Image Generation', value: aiImageGeneration, inline: false });
  }

  embed.addFields(
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

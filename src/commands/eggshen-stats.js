import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { isAdmin } from '../utils/guildConfig.js';
import { getStats } from '../utils/statsTracker.js';

export const data = new SlashCommandBuilder()
  .setName('eggshen-stats')
  .setDescription('View server statistics for bot usage (Admin/Moderator only)')
  .addStringOption(option =>
    option
      .setName('filter')
      .setDescription('Time period to view stats for')
      .addChoices(
        { name: 'All Time', value: 'all-time' },
        { name: 'This Month', value: 'month' },
        { name: 'This Week', value: 'week' },
        { name: 'Today', value: 'today' }
      )
  );

export async function execute(interaction) {
  // Check if user has admin permissions
  if (!isAdmin(interaction.member)) {
    await interaction.reply({
      content: '❌ You need Administrator, Manage Server, or Moderator permissions to view statistics.',
      ephemeral: true,
    });
    return;
  }

  const filter = interaction.options.getString('filter') || 'all-time';
  const guildId = interaction.guildId;

  await interaction.deferReply({ ephemeral: true });

  try {
    const stats = await getStats(guildId, filter);

    // Build filter title
    const filterTitles = {
      'all-time': 'All Time',
      'month': 'This Month',
      'week': 'This Week',
      'today': 'Today',
    };

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`📊 Egg Shen Statistics - ${filterTitles[filter]}`)
      .setDescription(`Total searches: **${stats.totalSearches}**`);

    // Top Movies
    if (stats.topMovies.length > 0) {
      const moviesList = stats.topMovies
        .map((item, index) => `${index + 1}. ${item.name} (${item.count} searches)`)
        .join('\n');
      embed.addFields({
        name: '🎬 Top Movies',
        value: moviesList || 'No movies searched yet',
        inline: false,
      });
    }

    // Top TV Shows
    if (stats.topShows.length > 0) {
      const showsList = stats.topShows
        .map((item, index) => `${index + 1}. ${item.name} (${item.count} searches)`)
        .join('\n');
      embed.addFields({
        name: '📺 Top TV Shows',
        value: showsList || 'No shows searched yet',
        inline: false,
      });
    }

    // Top Episodes
    if (stats.topEpisodes.length > 0) {
      const episodesList = stats.topEpisodes
        .map((item, index) => `${index + 1}. ${item.name} (${item.count} searches)`)
        .join('\n');
      embed.addFields({
        name: '🎞️ Top Episodes',
        value: episodesList || 'No episodes searched yet',
        inline: false,
      });
    }

    // Top Users
    if (stats.topUsers.length > 0) {
      const usersList = stats.topUsers
        .map((user, index) => {
          const breakdown = [];
          if (user.movies > 0) breakdown.push(`${user.movies}M`);
          if (user.shows > 0) breakdown.push(`${user.shows}S`);
          if (user.episodes > 0) breakdown.push(`${user.episodes}E`);
          const breakdownText = breakdown.length > 0 ? ` (${breakdown.join('/')})` : '';
          return `${index + 1}. ${user.username}: ${user.totalSearches} searches${breakdownText}`;
        })
        .join('\n');
      embed.addFields({
        name: '👥 Top Users',
        value: usersList || 'No users yet',
        inline: false,
      });
    }

    // Add note if no stats
    if (stats.totalSearches === 0) {
      embed.setDescription('No statistics available yet. Start searching for movies, shows, and episodes to see stats!');
    } else {
      embed.setFooter({ text: 'M = Movies, S = Shows, E = Episodes' });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Stats command error:', error);
    await interaction.editReply({
      content: '❌ An error occurred while fetching statistics. Please try again.',
    });
  }
}

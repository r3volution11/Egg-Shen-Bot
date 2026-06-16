import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getStats } from '../utils/statsTracker.js';

export const data = new SlashCommandBuilder()
  .setName('stats')
  .setDescription('View server statistics for bot usage')
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
  )
  .addStringOption(option =>
    option
      .setName('type')
      .setDescription('Type of stats to view')
      .addChoices(
        { name: 'Server Stats', value: 'server' },
        { name: 'My Stats', value: 'personal' }
      )
  );

export async function execute(interaction) {
  const filter = interaction.options.getString('filter') || 'all-time';
  const type = interaction.options.getString('type') || 'server';
  const guildId = interaction.guildId;

  await interaction.deferReply();

  try {
    const stats = await getStats(guildId, filter);

    // Build filter title
    const filterTitles = {
      'all-time': 'All Time',
      'month': 'This Month',
      'week': 'This Week',
      'today': 'Today',
    };

    // Personal stats view
    if (type === 'personal') {
      const userStats = stats.userStats[interaction.user.id];

      if (!userStats || userStats.totalSearches === 0) {
        await interaction.editReply({
          content: `You haven't used any commands yet! Try searching for movies, shows, or using the random/watched features.`,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`📊 Your Stats - ${filterTitles[filter]}`)
        .setDescription(`**Total Commands Used: ${userStats.totalSearches}**`)
        .addFields(
          {
            name: '🎬 Movies Searched',
            value: `${userStats.movies || 0}`,
            inline: true,
          },
          {
            name: '📺 TV Shows Searched',
            value: `${userStats.shows || 0}`,
            inline: true,
          },
          {
            name: '🎞️ Episodes Searched',
            value: `${userStats.episodes || 0}`,
            inline: true,
          },
          {
            name: '🎲 Random Commands',
            value: `${userStats.random || 0}`,
            inline: true,
          },
          {
            name: '📝 Watch History Logs',
            value: `${userStats.watched || 0}`,
            inline: true,
          },
          {
            name: '🔍 Similar Searches',
            value: `${userStats.similar || 0}`,
            inline: true,
          }
        )
        .setFooter({ text: `${interaction.user.username}'s activity` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Server stats view
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`📊 ${interaction.guild.name} Stats - ${filterTitles[filter]}`)
      .setDescription(`**Total searches: ${stats.totalSearches}**`);

    // Top Movies
    if (stats.topMovies.length > 0) {
      const moviesList = stats.topMovies
        .map((item, index) => `${index + 1}. ${item.name} (${item.count}×)`)
        .join('\n');
      embed.addFields({
        name: '🎬 Top Movies',
        value: moviesList,
        inline: false,
      });
    }

    // Top TV Shows
    if (stats.topShows.length > 0) {
      const showsList = stats.topShows
        .map((item, index) => `${index + 1}. ${item.name} (${item.count}×)`)
        .join('\n');
      embed.addFields({
        name: '📺 Top TV Shows',
        value: showsList,
        inline: false,
      });
    }

    // Top Episodes
    if (stats.topEpisodes.length > 0) {
      const episodesList = stats.topEpisodes
        .map((item, index) => `${index + 1}. ${item.name} (${item.count}×)`)
        .join('\n');
      embed.addFields({
        name: '🎞️ Top Episodes',
        value: episodesList,
        inline: false,
      });
    }

    // Command Usage Summary
    const commandStats = [];
    if (stats.commandCounts.random > 0) commandStats.push(`🎲 Random: ${stats.commandCounts.random}`);
    if (stats.commandCounts.watched > 0) commandStats.push(`📝 Watched: ${stats.commandCounts.watched}`);
    if (stats.commandCounts.similar > 0) commandStats.push(`🔍 Similar: ${stats.commandCounts.similar}`);
    
    if (commandStats.length > 0) {
      embed.addFields({
        name: '🎮 Other Commands',
        value: commandStats.join(' • '),
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
          if (user.random > 0) breakdown.push(`${user.random}R`);
          if (user.watched > 0) breakdown.push(`${user.watched}W`);
          if (user.similar > 0) breakdown.push(`${user.similar}Si`);
          const breakdownText = breakdown.length > 0 ? ` (${breakdown.join('/')})` : '';
          return `${index + 1}. ${user.username}: ${user.totalSearches}${breakdownText}`;
        })
        .join('\n');
      embed.addFields({
        name: '👥 Most Active Users',
        value: usersList,
        inline: false,
      });
    }

    // Add note if no stats
    if (stats.totalSearches === 0) {
      embed.setDescription('No statistics available yet. Start using the bot to see stats!');
    } else {
      embed.setFooter({ text: 'M=Movies S=Shows E=Episodes R=Random W=Watched Si=Similar • Use /stats type:My Stats to see your personal stats' });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Stats command error:', error);
    await interaction.editReply({
      content: '❌ An error occurred while fetching statistics. Please try again.',
    });
  }
}

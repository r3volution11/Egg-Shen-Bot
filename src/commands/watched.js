import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { searchMovies, searchTVShows, getMovieDetails, getTVShowDetails } from '../services/tmdbService.js';
import { createSearchResults } from '../utils/embedBuilder.js';
import { saveWatchHistory, getWatchHistory } from '../utils/watchHistoryManager.js';
import { trackSearch } from '../utils/statsTracker.js';
import { loadGuildConfig } from '../utils/guildConfig.js';

export const data = new SlashCommandBuilder()
  .setName('watched')
  .setDescription('Log what you watched or view watch history')
  .addSubcommand(subcommand =>
    subcommand
      .setName('add')
      .setDescription('Add a movie or TV show to watch history')
      .addStringOption(option =>
        option
          .setName('title')
          .setDescription('Movie or TV show title')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('notes')
          .setDescription('Optional notes about the watch party')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('history')
      .setDescription('View the server watch history')
      .addStringOption(option =>
        option
          .setName('filter')
          .setDescription('Filter by type')
          .setRequired(false)
          .addChoices(
            { name: 'All', value: 'all' },
            { name: 'Movies Only', value: 'movie' },
            { name: 'TV Shows Only', value: 'tv' }
          )
      )
      .addIntegerOption(option =>
        option
          .setName('limit')
          .setDescription('Number of entries to show (default: 10)')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(25)
      )
  );

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'add') {
    const title = interaction.options.getString('title');
    const notes = interaction.options.getString('notes');

    await interaction.deferReply({ ephemeral: true });

    try {
      // Search for both movies and TV shows
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
          content: `No movies or TV shows found matching "${title}".`,
        });
        return;
      }

      // If only one result, add it directly
      if (allResults.length === 1) {
        const result = allResults[0];
        const fullTitle = result.title || result.name;
        const year = result.release_date || result.first_air_date;
        const yearStr = year ? ` (${year.split('-')[0]})` : '';

        await saveWatchHistory(interaction.guildId, {
          tmdbId: result.id,
          type: result.type,
          title: fullTitle,
          year: yearStr.replace(/[()]/g, '').trim(),
          notes: notes || null,
          savedBy: interaction.user.username,
          savedById: interaction.user.id,
          watchedAt: Date.now(),
        });

        const embed = new EmbedBuilder()
          .setColor(0x00FF00)
          .setTitle('✅ Added to Watch History')
          .setDescription(`**${fullTitle}${yearStr}**`)
          .addFields({
            name: 'Type',
            value: result.type === 'movie' ? 'Movie' : 'TV Show',
            inline: true,
          });

        if (notes) {
          embed.addFields({
            name: 'Notes',
            value: notes,
            inline: false,
          });
        }

        embed.setFooter({ text: `Saved by ${interaction.user.username}` });
        embed.setTimestamp();

        // Track the watched log
        await trackSearch(
          interaction.guildId,
          interaction.user.id,
          interaction.user.username,
          'watched',
          fullTitle,
          yearStr
        );

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Multiple results - show selection menu
      // Store the notes in the custom ID for later
      const selectionData = JSON.stringify({ notes, userId: interaction.user.id, username: interaction.user.username });
      
      // Load guild config to get maxSearchResults
      const guildConfig = await loadGuildConfig(interaction.guildId);
      const maxResults = guildConfig.maxSearchResults || 20;
      
      const options = allResults.slice(0, maxResults).map((result) => {
        const title = result.title || result.name;
        const year = result.release_date || result.first_air_date;
        const yearStr = year ? ` (${year.split('-')[0]})` : '';
        const overview = result.overview ? result.overview.substring(0, 94) + '...' : 'No description';
        
        return {
          label: `${title}${yearStr}`.substring(0, 100),
          description: `${result.type === 'movie' ? '🎬' : '📺'} ${overview}`.substring(0, 100),
          value: `watched_${result.type}_${result.id}_${Buffer.from(selectionData).toString('base64').substring(0, 50)}`,
        };
      });

      const { StringSelectMenuBuilder, ActionRowBuilder } = await import('discord.js');
      
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('select_watched')
        .setPlaceholder('Select the movie or TV show you watched')
        .addOptions(options);
      
      const row = new ActionRowBuilder().addComponents(selectMenu);
      
      const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle(`Select what you watched`)
        .setDescription(`Found ${allResults.length} result${allResults.length > 1 ? 's' : ''} for "${title}". Select the correct one below.`)
        .setFooter({ text: 'Select from the menu below' });
      
      await interaction.editReply({
        embeds: [embed],
        components: [row],
      });

    } catch (error) {
      console.error('Watched add error:', error);
      await interaction.editReply({
        content: 'An error occurred while adding to watch history. Please try again later.',
      });
    }

  } else if (subcommand === 'history') {
    const filter = interaction.options.getString('filter') || 'all';
    const limit = interaction.options.getInteger('limit') || 10;

    await interaction.deferReply();

    try {
      const history = await getWatchHistory(interaction.guildId, filter, limit);

      if (!history || history.length === 0) {
        await interaction.editReply({
          content: 'No watch history found for this server.',
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`📺 ${interaction.guild.name} Watch History`)
        .setDescription(`Showing ${history.length} most recent ${filter === 'all' ? 'entries' : filter === 'movie' ? 'movies' : 'TV shows'}`);

      const historyText = history.map((entry, index) => {
        const icon = entry.type === 'movie' ? '🎬' : '📺';
        const yearStr = entry.year ? ` (${entry.year})` : '';
        const date = new Date(entry.watchedAt).toLocaleDateString();
        const channelStr = entry.channelId ? ` • <#${entry.channelId}>` : '';
        const savedBy = entry.savedBy || entry.watchedBy || 'Unknown';
        
        return `**${index + 1}.** ${icon} **${entry.title}**${yearStr}\n👤 Saved by ${savedBy} • ${date}${channelStr}${entry.notes ? `\n💭 ${entry.notes}` : ''}`;
      }).join('\n\n');

      embed.setDescription(`${embed.data.description}\n\n${historyText}`);
      embed.setFooter({ text: `Total entries: ${history.length}` });

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('Watched history error:', error);
      await interaction.editReply({
        content: 'An error occurred while fetching watch history. Please try again later.',
      });
    }
  }
}

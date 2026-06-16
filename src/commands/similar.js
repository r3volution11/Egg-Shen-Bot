import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { searchMovies, searchTVShows, getSimilarMovies, getSimilarTV, getMovieDetails, getTVShowDetails } from '../services/tmdbService.js';
import { canUseCommand } from '../utils/guildConfig.js';

export const data = new SlashCommandBuilder()
  .setName('similar')
  .setDescription('Find similar movies or TV shows')
  .addStringOption(option =>
    option
      .setName('title')
      .setDescription('Movie or TV show title')
      .setRequired(true)
  );

export async function execute(interaction) {
  const title = interaction.options.getString('title');

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

    // Use the first result (most relevant)
    const result = allResults[0];
    const fullTitle = result.title || result.name;
    const year = result.release_date || result.first_air_date;
    const yearStr = year ? ` (${year.split('-')[0]})` : '';

    // Get similar content
    const similar = result.type === 'movie'
      ? await getSimilarMovies(result.id)
      : await getSimilarTV(result.id);

    if (!similar || similar.length === 0) {
      await interaction.editReply({
        content: `No similar recommendations found for **${fullTitle}${yearStr}**.`,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`📺 Similar to ${fullTitle}${yearStr}`)
      .setDescription(`Here are ${similar.length} recommendations similar to this ${result.type === 'movie' ? 'movie' : 'TV show'}:\n\n`);

    const recommendations = similar.slice(0, 10).map((item, index) => {
      const title = item.title || item.name;
      const year = item.release_date || item.first_air_date;
      const yearStr = year ? ` (${year.split('-')[0]})` : '';
      const rating = item.vote_average ? ` • ⭐ ${item.vote_average.toFixed(1)}/10` : '';
      
      return `**${index + 1}.** ${title}${yearStr}${rating}`;
    }).join('\n');

    embed.setDescription(embed.data.description + recommendations);
    embed.setFooter({ text: `Use /${result.type === 'movie' ? 'movie' : 'tv'} to see full details and ratings` });

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('Similar command error:', error);
    await interaction.editReply({
      content: 'An error occurred while finding similar content. Please try again later.',
    });
  }
}

import { SlashCommandBuilder } from 'discord.js';
import { discoverRandomMovie, discoverRandomTV, getMovieDetails, getTVShowDetails, searchTVShows, getSeasonDetails } from '../services/tmdbService.js';
import { getOMDBData } from '../services/omdbService.js';
import { getMovieRating, getShowRating } from '../services/traktService.js';
import {
  getIMDbUrl,
  getLetterboxdUrl,
  getTraktMovieUrl,
  getTraktShowUrl,
  getRottenTomatoesUrl,
  getJustWatchUrl,
} from '../services/urlService.js';
import { createDetailedEmbed } from '../utils/embedBuilder.js';
import { getEnabledServices, getEmojis } from '../utils/guildConfig.js';
import { canUseCommand } from '../utils/guildConfig.js';

export const data = new SlashCommandBuilder()
  .setName('random')
  .setDescription('Get a random movie, TV show, or episode')
  .addSubcommand(subcommand =>
    subcommand
      .setName('movie')
      .setDescription('Get a random movie with optional filters')
      .addStringOption(option =>
        option
          .setName('genre')
          .setDescription('Filter by genre')
          .setRequired(false)
          .addChoices(
            { name: 'Horror', value: '27' },
            { name: 'Thriller', value: '53' },
            { name: 'Science Fiction', value: '878' },
            { name: 'Fantasy', value: '14' },
            { name: 'Mystery', value: '9648' },
            { name: 'Action', value: '28' },
            { name: 'Comedy', value: '35' },
            { name: 'Drama', value: '18' },
            { name: 'Crime', value: '80' }
          )
      )
      .addStringOption(option =>
        option
          .setName('decade')
          .setDescription('Filter by decade')
          .setRequired(false)
          .addChoices(
            { name: '2020s', value: '2020' },
            { name: '2010s', value: '2010' },
            { name: '2000s', value: '2000' },
            { name: '1990s', value: '1990' },
            { name: '1980s', value: '1980' },
            { name: '1970s', value: '1970' },
            { name: '1960s', value: '1960' },
            { name: '1950s', value: '1950' }
          )
      )
      .addStringOption(option =>
        option
          .setName('min-rating')
          .setDescription('Minimum rating (0-10)')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('tv')
      .setDescription('Get a random TV show with optional filters')
      .addStringOption(option =>
        option
          .setName('genre')
          .setDescription('Filter by genre')
          .setRequired(false)
          .addChoices(
            { name: 'Horror', value: '27' },
            { name: 'Sci-Fi & Fantasy', value: '10765' },
            { name: 'Mystery', value: '9648' },
            { name: 'Crime', value: '80' },
            { name: 'Drama', value: '18' },
            { name: 'Comedy', value: '35' },
            { name: 'Action & Adventure', value: '10759' }
          )
      )
      .addStringOption(option =>
        option
          .setName('min-rating')
          .setDescription('Minimum rating (0-10)')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('episode')
      .setDescription('Get a random episode from a TV show')
      .addStringOption(option =>
        option
          .setName('show')
          .setDescription('TV show name')
          .setRequired(true)
      )
  );

export async function execute(interaction) {
  // Check if user has permission to use this command
  const commandType = interaction.options.getSubcommand();
  const hasPermission = await canUseCommand(interaction.guildId, interaction.member, commandType === 'episode' ? 'episode' : commandType === 'movie' ? 'movie' : 'tv');
  if (!hasPermission) {
    await interaction.reply({
      content: `❌ The \`/${commandType}\` command is currently disabled for regular users. Contact a server administrator for more information.`,
      ephemeral: true,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  await interaction.deferReply();

  try {
    if (subcommand === 'movie') {
      const genre = interaction.options.getString('genre');
      const decade = interaction.options.getString('decade');
      const minRating = interaction.options.getString('min-rating');

      const filters = {};
      if (genre) filters.genre = genre;
      if (decade) filters.decade = decade;
      if (minRating) filters.minRating = minRating;

      const randomMovie = await discoverRandomMovie(filters);

      if (!randomMovie) {
        await interaction.editReply({
          content: 'Could not find a random movie with those filters. Try different options.',
        });
        return;
      }

      // Get full details
      const tmdb = await getMovieDetails(randomMovie.id);
      const imdbId = tmdb.external_ids?.imdb_id;

      const [omdb, trakt, enabledServices, guildEmojis] = await Promise.all([
        imdbId ? getOMDBData(imdbId) : null,
        imdbId ? getMovieRating(imdbId) : null,
        getEnabledServices(interaction.guildId),
        getEmojis(interaction.guildId),
      ]);

      const urls = {
        imdb: getIMDbUrl(imdbId),
        letterboxd: getLetterboxdUrl(imdbId),
        trakt: getTraktMovieUrl(tmdb.external_ids?.imdb_id),
        rottenTomatoes: getRottenTomatoesUrl(tmdb.title, tmdb.release_date?.split('-')[0], 'movie'),
        justWatch: getJustWatchUrl(tmdb.title, 'movie'),
      };

      const response = await createDetailedEmbed({ tmdb, omdb, trakt, urls }, 'movie', enabledServices, guildEmojis);
      await interaction.editReply(response);

    } else if (subcommand === 'tv') {
      const genre = interaction.options.getString('genre');
      const minRating = interaction.options.getString('min-rating');

      const filters = {};
      if (genre) filters.genre = genre;
      if (minRating) filters.minRating = minRating;

      const randomTV = await discoverRandomTV(filters);

      if (!randomTV) {
        await interaction.editReply({
          content: 'Could not find a random TV show with those filters. Try different options.',
        });
        return;
      }

      // Get full details
      const tmdb = await getTVShowDetails(randomTV.id);
      const imdbId = tmdb.external_ids?.imdb_id;

      const [omdb, trakt, enabledServices, guildEmojis] = await Promise.all([
        imdbId ? getOMDBData(imdbId) : null,
        imdbId ? getShowRating(imdbId) : null,
        getEnabledServices(interaction.guildId),
        getEmojis(interaction.guildId),
      ]);

      const urls = {
        imdb: getIMDbUrl(imdbId),
        letterboxd: null,
        trakt: getTraktShowUrl(tmdb.external_ids?.imdb_id),
        rottenTomatoes: getRottenTomatoesUrl(tmdb.name, tmdb.first_air_date?.split('-')[0], 'tv'),
        justWatch: getJustWatchUrl(tmdb.name, 'tv'),
      };

      const response = await createDetailedEmbed({ tmdb, omdb, trakt, urls }, 'tv', enabledServices, guildEmojis);
      await interaction.editReply(response);

    } else if (subcommand === 'episode') {
      const showQuery = interaction.options.getString('show');

      // Search for the show
      const showResults = await searchTVShows(showQuery);

      if (!showResults || showResults.length === 0) {
        await interaction.editReply({
          content: `No TV shows found matching "${showQuery}".`,
        });
        return;
      }

      // Use the first result
      const showId = showResults[0].id;
      const showDetails = await getTVShowDetails(showId);

      if (!showDetails.number_of_seasons) {
        await interaction.editReply({
          content: 'Could not find episodes for this show.',
        });
        return;
      }

      // Pick a random season
      const randomSeason = Math.floor(Math.random() * showDetails.number_of_seasons) + 1;
      const seasonDetails = await getSeasonDetails(showId, randomSeason);

      if (!seasonDetails || !seasonDetails.episodes || seasonDetails.episodes.length === 0) {
        await interaction.editReply({
          content: `Could not find episodes in season ${randomSeason} of ${showDetails.name}.`,
        });
        return;
      }

      // Pick a random episode
      const randomEpisode = seasonDetails.episodes[Math.floor(Math.random() * seasonDetails.episodes.length)];

      await interaction.editReply({
        content: `🎲 **Random Episode:** ${showDetails.name} - S${randomSeason}E${randomEpisode.episode_number}: ${randomEpisode.name}\n\n${randomEpisode.overview || 'No description available.'}\n\nUse \`/episode show:${showDetails.name} episode:${randomEpisode.name}\` to see full details and ratings.`,
      });
    }
  } catch (error) {
    console.error('Random command error:', error);
    await interaction.editReply({
      content: 'An error occurred while getting random content. Please try again later.',
    });
  }
}

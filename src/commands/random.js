import { SlashCommandBuilder } from 'discord.js';
import { discoverRandomMovie, discoverRandomTV, getMovieDetails, getTVShowDetails, searchTVShows, getSeasonDetails, getMovieWatchProviders, getTVWatchProviders } from '../services/tmdbService.js';
import { getOMDBData } from '../services/omdbService.js';
import { getMovieRating, getShowRating } from '../services/traktService.js';
import { getLetterboxdRating } from '../services/letterboxdService.js';
import {
  getIMDbUrl,
  getLetterboxdUrl,
  getTraktMovieUrl,
  getTraktShowUrl,
  getRottenTomatoesUrl,
  getJustWatchUrl,
} from '../services/urlService.js';
import { createDetailedEmbed } from '../utils/embedBuilder.js';
import { getEnabledServices, getEmojis, loadGuildConfig } from '../utils/guildConfig.js';
import { canUseCommand } from '../utils/guildConfig.js';
import { trackSearch } from '../utils/statsTracker.js';
import { config } from '../config.js';

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
            { name: 'Action', value: '28' },
            { name: 'Adventure', value: '12' },
            { name: 'Animation', value: '16' },
            { name: 'Comedy', value: '35' },
            { name: 'Crime', value: '80' },
            { name: 'Documentary', value: '99' },
            { name: 'Drama', value: '18' },
            { name: 'Family', value: '10751' },
            { name: 'Fantasy', value: '14' },
            { name: 'Horror', value: '27' },
            { name: 'Music', value: '10402' },
            { name: 'Mystery', value: '9648' },
            { name: 'Romance', value: '10749' },
            { name: 'Science Fiction', value: '878' },
            { name: 'Thriller', value: '53' },
            { name: 'War', value: '10752' },
            { name: 'Western', value: '37' }
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
            { name: 'Action & Adventure', value: '10759' },
            { name: 'Animation', value: '16' },
            { name: 'Comedy', value: '35' },
            { name: 'Crime', value: '80' },
            { name: 'Documentary', value: '99' },
            { name: 'Drama', value: '18' },
            { name: 'Family', value: '10751' },
            { name: 'Horror', value: '27' },
            { name: 'Mystery', value: '9648' },
            { name: 'News', value: '10763' },
            { name: 'Reality', value: '10764' },
            { name: 'Romance', value: '10749' },
            { name: 'Sci-Fi & Fantasy', value: '10765' },
            { name: 'War & Politics', value: '10768' },
            { name: 'Western', value: '37' }
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
      .setName('episode')
      .setDescription('Get a random episode from a TV show')
      .addStringOption(option =>
        option
          .setName('show')
          .setDescription('TV show name')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('game')
      .setDescription('Get a random game with optional filters')
      .addStringOption(option =>
        option
          .setName('genre')
          .setDescription('Filter by genre')
          .setRequired(false)
          .addChoices(
            { name: 'Horror', value: '3,5' }, // Adventure + Horror tags
            { name: 'Action', value: '4' },
            { name: 'RPG', value: '5' },
            { name: 'Strategy', value: '10' },
            { name: 'Shooter', value: '2' },
            { name: 'Indie', value: '51' },
            { name: 'Puzzle', value: '7' },
            { name: 'Platformer', value: '83' }
          )
      )
      .addStringOption(option =>
        option
          .setName('platform')
          .setDescription('Filter by platform')
          .setRequired(false)
          .addChoices(
            { name: 'PC', value: '4' },
            { name: 'PlayStation', value: '187,18,16,15' }, // PS5, PS4, PS3, PS2
            { name: 'Xbox', value: '186,1,14,80' }, // Series X/S, Xbox One, Xbox 360, Xbox
            { name: 'Nintendo Switch', value: '7' },
            { name: 'Mobile', value: '21,3' } // Android, iOS
          )
      )
      .addStringOption(option =>
        option
          .setName('min-rating')
          .setDescription('Minimum rating (1-5)')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('boardgame')
      .setDescription('Get a random board game with optional filters')
      .addStringOption(option =>
        option
          .setName('category')
          .setDescription('Filter by category')
          .setRequired(false)
          .addChoices(
            { name: 'Horror', value: 'Horror' },
            { name: 'Fantasy', value: 'Fantasy' },
            { name: 'Science Fiction', value: 'Science Fiction' },
            { name: 'Adventure', value: 'Adventure' },
            { name: 'Cooperative', value: 'Cooperative' },
            { name: 'Strategy', value: 'Strategy' },
            { name: 'Card Game', value: 'Card Game' },
            { name: 'Party Game', value: 'Party Game' }
          )
      )
      .addStringOption(option =>
        option
          .setName('min-rating')
          .setDescription('Minimum BGG rating (1-10)')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('book')
      .setDescription('Get a random book with optional filters')
      .addStringOption(option =>
        option
          .setName('subject')
          .setDescription('Filter by subject/genre')
          .setRequired(false)
          .addChoices(
            { name: 'Horror', value: 'subject:horror' },
            { name: 'Fantasy', value: 'subject:fantasy' },
            { name: 'Science Fiction', value: 'subject:science+fiction' },
            { name: 'Mystery', value: 'subject:mystery' },
            { name: 'Thriller', value: 'subject:thriller' },
            { name: 'Fiction', value: 'subject:fiction' },
            { name: 'Non-Fiction', value: 'subject:non-fiction' },
            { name: 'Biography', value: 'subject:biography' }
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
            { name: '1970s', value: '1970' }
          )
      )
      .addStringOption(option =>
        option
          .setName('min-rating')
          .setDescription('Minimum rating (1-5)')
          .setRequired(false)
      )
  );

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();
  
  // Check if required API keys are configured
  if (subcommand === 'game' && !config.apis.rawg.apiKey) {
    await interaction.reply({
      content: '❌ The RAWG API is not configured. Please contact the server administrator to set up the `RAWG_API_KEY` environment variable.',
      ephemeral: true,
    });
    return;
  }
  
  if (subcommand === 'boardgame' && !config.apis.bgg.clientId) {
    await interaction.reply({
      content: '❌ The BoardGameGeek API is not configured. Please contact the server administrator to set up the `BGG_CLIENT_ID` environment variable.',
      ephemeral: true,
    });
    return;
  }

  // Check if user has permission to use this command
  const commandType = interaction.options.getSubcommand();
  const permissionMap = {
    'movie': 'movie',
    'tv': 'tv',
    'episode': 'episode',
    'game': 'game',
    'boardgame': 'boardgame',
    'book': 'book'
  };
  const hasPermission = await canUseCommand(interaction.guildId, interaction.member, permissionMap[commandType] || 'movie');
  if (!hasPermission) {
    await interaction.reply({
      content: `❌ The \`/${commandType}\` command is currently disabled for regular users. Contact a server administrator for more information.`,
      ephemeral: true,
    });
    return;
  }

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

      const [omdb, trakt, letterboxd, enabledServices, guildEmojis, guildConfig] = await Promise.all([
        imdbId ? getOMDBData(imdbId) : null,
        imdbId ? getMovieRating(imdbId) : null,
        imdbId ? getLetterboxdRating(imdbId) : null,
        getEnabledServices(interaction.guildId),
        getEmojis(interaction.guildId),
        loadGuildConfig(interaction.guildId),
      ]);

      // Get watch providers
      const region = guildConfig.region || 'US';
      const watchProviders = await getMovieWatchProviders(randomMovie.id, region);

      const urls = {
        imdb: getIMDbUrl(imdbId),
        letterboxd: getLetterboxdUrl(imdbId),
        trakt: getTraktMovieUrl(tmdb.external_ids?.imdb_id),
        rottenTomatoes: getRottenTomatoesUrl(tmdb.title, tmdb.release_date?.split('-')[0], 'movie'),
        justWatch: getJustWatchUrl(tmdb.title, 'movie'),
      };

      const response = await createDetailedEmbed({ tmdb, omdb, trakt, letterboxd, urls }, 'movie', enabledServices, guildEmojis, watchProviders);
      
      // Track the random movie search
      await trackSearch(
        interaction.guildId,
        interaction.user.id,
        interaction.user.username,
        'random',
        'Random Movie',
        null
      );
      
      await interaction.editReply(response);

    } else if (subcommand === 'tv') {
      const genre = interaction.options.getString('genre');
      const decade = interaction.options.getString('decade');
      const minRating = interaction.options.getString('min-rating');

      const filters = {};
      if (genre) filters.genre = genre;
      if (decade) filters.decade = decade;
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

      const [omdb, trakt, enabledServices, guildEmojis, guildConfig] = await Promise.all([
        imdbId ? getOMDBData(imdbId) : null,
        imdbId ? getShowRating(imdbId) : null,
        getEnabledServices(interaction.guildId),
        getEmojis(interaction.guildId),
        loadGuildConfig(interaction.guildId),
      ]);

      // Get watch providers
      const region = guildConfig.region || 'US';
      const watchProviders = await getTVWatchProviders(randomTV.id, region);

      const urls = {
        imdb: getIMDbUrl(imdbId),
        letterboxd: null,
        trakt: getTraktShowUrl(tmdb.external_ids?.imdb_id),
        rottenTomatoes: getRottenTomatoesUrl(tmdb.name, tmdb.first_air_date?.split('-')[0], 'tv'),
        justWatch: getJustWatchUrl(tmdb.name, 'tv'),
      };

      const response = await createDetailedEmbed({ tmdb, omdb, trakt, letterboxd: null, urls }, 'tv', enabledServices, guildEmojis, watchProviders);
      
      // Track the random TV search
      await trackSearch(
        interaction.guildId,
        interaction.user.id,
        interaction.user.username,
        'random',
        'Random TV Show',
        null
      );
      
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

      // If only one result, use it directly
      if (showResults.length === 1) {
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

        // Track the random episode search
        await trackSearch(
          interaction.guildId,
          interaction.user.id,
          interaction.user.username,
          'random',
          `Random Episode - ${showDetails.name}`,
          null
        );

        await interaction.editReply({
          content: `🎲 **Random Episode:** ${showDetails.name} - S${randomSeason}E${randomEpisode.episode_number}: ${randomEpisode.name}\n\n${randomEpisode.overview || 'No description available.'}\n\nUse \`/episode show:${showDetails.name} episode:${randomEpisode.name}\` to see full details and ratings.`,
        });
        return;
      }

      // Multiple results - show selection menu
      const { StringSelectMenuBuilder, ActionRowBuilder, EmbedBuilder } = await import('discord.js');
      
      // Load guild config to get maxSearchResults
      const guildConfig = await loadGuildConfig(interaction.guildId);
      const maxResults = guildConfig.maxSearchResults || 20;
      
      const options = showResults.slice(0, maxResults).map((show) => {
        const year = show.first_air_date ? ` (${show.first_air_date.split('-')[0]})` : '';
        const overview = show.overview ? show.overview.substring(0, 97) + '...' : 'No description';
        
        return {
          label: `${show.name}${year}`.substring(0, 100),
          description: overview.substring(0, 100),
          value: `random_episode_${show.id}`,
        };
      });
      
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('select_random_episode')
        .setPlaceholder('Select the TV show')
        .addOptions(options);
      
      const row = new ActionRowBuilder().addComponents(selectMenu);
      
      const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle(`Select TV Show`)
        .setDescription(`Found ${showResults.length} result${showResults.length > 1 ? 's' : ''} for "${showQuery}". Select the correct show to get a random episode.`)
        .setFooter({ text: 'Select from the menu below' });
      
      await interaction.editReply({
        embeds: [embed],
        components: [row],
      });
      return;
      
    } else if (subcommand === 'game') {
      const { discoverRandomGame } = await import('../services/rawgService.js');
      const { createGameDetailedEmbed } = await import('../utils/embedBuilder.js');
      
      const genreFilter = interaction.options.getString('genre');
      const platformFilter = interaction.options.getString('platform');
      const minRating = interaction.options.getString('min-rating');
      
      // Validate min-rating
      if (minRating && (isNaN(minRating) || parseFloat(minRating) < 1 || parseFloat(minRating) > 5)) {
        await interaction.editReply({
          content: '❌ Minimum rating must be a number between 1 and 5.',
        });
        return;
      }
      
      // Build filter object
      const filters = {};
      if (genreFilter) filters.genres = genreFilter;
      if (platformFilter) filters.platforms = platformFilter;
      if (minRating) filters.minRating = parseFloat(minRating);
      
      // Get random game
      const game = await discoverRandomGame(filters);
      
      // Track the random game search
      await trackSearch(
        interaction.guildId,
        interaction.user.id,
        interaction.user.username,
        'random',
        `Random Game - ${game.name}`,
        game.released?.split('-')[0]
      );
      
      const response = await createGameDetailedEmbed(game);
      await interaction.editReply(response);
      
    } else if (subcommand === 'boardgame') {
      const { getRandomBoardGame } = await import('../services/bggService.js');
      const { createBoardGameDetailedEmbed } = await import('../utils/embedBuilder.js');
      
      const categoryFilter = interaction.options.getString('category');
      const minRating = interaction.options.getString('min-rating');
      
      // Validate min-rating
      if (minRating && (isNaN(minRating) || parseFloat(minRating) < 1 || parseFloat(minRating) > 10)) {
        await interaction.editReply({
          content: '❌ Minimum rating must be a number between 1 and 10.',
        });
        return;
      }
      
      // Build filter object
      const filters = {};
      if (categoryFilter) filters.category = categoryFilter;
      if (minRating) filters.minRating = parseFloat(minRating);
      
      // Get random board game
      const boardGame = await getRandomBoardGame(filters);
      
      // Track the random board game search
      await trackSearch(
        interaction.guildId,
        interaction.user.id,
        interaction.user.username,
        'random',
        `Random Board Game - ${boardGame.name}`,
        boardGame.yearPublished
      );
      
      const response = await createBoardGameDetailedEmbed(boardGame);
      await interaction.editReply(response);
      
    } else if (subcommand === 'book') {
      const { getRandomBook } = await import('../services/googleBooksService.js');
      const { createBookDetailedEmbed } = await import('../utils/embedBuilder.js');
      
      const subject = interaction.options.getString('subject');
      const decade = interaction.options.getString('decade');
      const minRating = interaction.options.getString('min-rating');
      
      // Validate min-rating
      if (minRating && (isNaN(minRating) || parseFloat(minRating) < 1 || parseFloat(minRating) > 5)) {
        await interaction.editReply({
          content: '❌ Minimum rating must be a number between 1 and 5.',
        });
        return;
      }
      
      // Build filter object
      const filters = {};
      if (subject) filters.subject = subject;
      if (decade) filters.publishedAfter = decade;
      if (minRating) filters.minRating = parseFloat(minRating);
      
      // Get random book
      const book = await getRandomBook(filters);
      
      if (!book) {
        await interaction.editReply({
          content: 'No books found matching your filters. Try adjusting them.',
        });
        return;
      }
      
      // Track the random book search
      await trackSearch(
        interaction.guildId,
        interaction.user.id,
        interaction.user.username,
        'random',
        `Random Book - ${book.title}`,
        book.publishedDate?.split('-')[0]
      );
      
      const response = await createBookDetailedEmbed(book);
      await interaction.editReply(response);
    }
  } catch (error) {
    console.error('Random command error:', error);
    await interaction.editReply({
      content: 'An error occurred while getting random content. Please try again later.',
    });
  }
}

// Helper function to handle random episode selection (called by selectHandler)
export async function handleRandomEpisodeSelection(showId, interaction) {
  try {
    const { getTVShowDetails, getSeasonDetails } = await import('../services/tmdbService.js');
    const { trackSearch } = await import('../utils/statsTracker.js');
    
    const showDetails = await getTVShowDetails(showId);

    if (!showDetails.number_of_seasons) {
      await interaction.followUp({
        content: 'Could not find episodes for this show.',
        ephemeral: true,
      });
      return;
    }

    // Pick a random season
    const randomSeason = Math.floor(Math.random() * showDetails.number_of_seasons) + 1;
    const seasonDetails = await getSeasonDetails(showId, randomSeason);

    if (!seasonDetails || !seasonDetails.episodes || seasonDetails.episodes.length === 0) {
      await interaction.followUp({
        content: `Could not find episodes in season ${randomSeason} of ${showDetails.name}.`,
        ephemeral: true,
      });
      return;
    }

    // Pick a random episode
    const randomEpisode = seasonDetails.episodes[Math.floor(Math.random() * seasonDetails.episodes.length)];

    // Track the random episode search
    await trackSearch(
      interaction.guildId,
      interaction.user.id,
      interaction.user.username,
      'random',
      `Random Episode - ${showDetails.name}`,
      null
    );

    // Delete the selection menu
    await interaction.message.delete().catch(() => {});

    // Post the result publicly
    await interaction.channel.send({
      content: `🎲 **Random Episode:** ${showDetails.name} - S${randomSeason}E${randomEpisode.episode_number}: ${randomEpisode.name}\n\n${randomEpisode.overview || 'No description available.'}\n\nUse \`/episode show:${showDetails.name} episode:${randomEpisode.name}\` to see full details and ratings.`,
    });
  } catch (error) {
    console.error('Random episode selection error:', error);
    await interaction.followUp({
      content: 'An error occurred while getting a random episode.',
      ephemeral: true,
    });
  }
}

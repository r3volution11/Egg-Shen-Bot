import { ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } from 'discord.js';
import { getPosterUrl } from '../services/tmdbService.js';
import { config } from '../config.js';

/**
 * Format runtime in minutes to human-readable format
 * @param {number} minutes - Runtime in minutes
 * @returns {string} Formatted runtime (e.g., "1 hour 37 minutes")
 */
function formatRuntime(minutes) {
  if (!minutes) return 'N/A';
  
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (hours === 0) {
    return `${mins} minute${mins !== 1 ? 's' : ''}`;
  } else if (mins === 0) {
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  } else {
    return `${hours} hour${hours !== 1 ? 's' : ''} ${mins} minute${mins !== 1 ? 's' : ''}`;
  }
}

/**
 * Create a search results message with a select menu
 */
export async function createSearchResults(results, type, query) {
  const options = results.map((result, index) => {
    const title = result.title || result.name;
    const year = result.release_date || result.first_air_date;
    const yearStr = year ? ` (${year.split('-')[0]})` : '';
    const overview = result.overview ? result.overview.substring(0, 97) + '...' : 'No description';
    
    return {
      label: `${title}${yearStr}`.substring(0, 100),
      description: overview.substring(0, 100),
      value: `${type}_${result.id}`,
    };
  });
  
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('select_result')
    .setPlaceholder('Select a result to display')
    .addOptions(options);
  
  const row = new ActionRowBuilder().addComponents(selectMenu);
  
  const embed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle(`Search Results for "${query}"`)
    .setDescription(`Found ${results.length} result${results.length > 1 ? 's' : ''}. Select one below to view details and ratings.`)
    .setFooter({ text: 'Select a result from the menu below' });
  
  return {
    embeds: [embed],
    components: [row],
  };
}

/**
 * Create episode search results with show selection
 */
export async function createEpisodeSearchResults(results, showQuery, episodeQuery) {
  const options = results.map((result, index) => {
    const title = result.name;
    const year = result.first_air_date;
    const yearStr = year ? ` (${year.split('-')[0]})` : '';
    const overview = result.overview ? result.overview.substring(0, 97) + '...' : 'No description';
    
    return {
      label: `${title}${yearStr}`.substring(0, 100),
      description: overview.substring(0, 100),
      value: `episode_${result.id}_${episodeQuery}`,
    };
  });
  
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('select_episode_show')
    .setPlaceholder('Select the correct show')
    .addOptions(options);
  
  const row = new ActionRowBuilder().addComponents(selectMenu);
  
  const embed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle(`Step 1: Select the show for episode "${episodeQuery}"`)
    .setDescription(`Found ${results.length} show${results.length > 1 ? 's' : ''} matching "${showQuery}". Select the correct one below.`)
    .setFooter({ text: 'Select a show from the menu below' });
  
  return {
    embeds: [embed],
    components: [row],
  };
}

/**
 * Create soundtrack search results with movie/TV selection
 */
export function createSoundtrackSearchResults(results, query) {
  const options = results.map((result, index) => {
    const title = result.title || result.name;
    const year = result.release_date || result.first_air_date;
    const yearStr = year ? ` (${year.split('-')[0]})` : '';
    const overview = result.overview ? result.overview.substring(0, 97) + '...' : 'No description';
    const mediaType = result.type === 'movie' ? '🎬 Movie' : '📺 TV Show';
    
    return {
      label: `${mediaType}: ${title}${yearStr}`.substring(0, 100),
      description: overview.substring(0, 100),
      value: `soundtrack_${result.type}_${result.id}`,
    };
  });
  
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('select_soundtrack')
    .setPlaceholder('Select the correct title')
    .addOptions(options);
  
  const row = new ActionRowBuilder().addComponents(selectMenu);
  
  const embed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle(`🎵 Select Title to Find Soundtrack`)
    .setDescription(`Found ${results.length} result${results.length > 1 ? 's' : ''} matching "${query}". Select the correct title below to search for its soundtrack.`)
    .setFooter({ text: 'Select a title from the menu below' });
  
  return {
    embeds: [embed],
    components: [row],
  };
}

/**
 * Create a detailed result embed with ratings
 */
export async function createDetailedEmbed(data, type, enabledServices = null, guildEmojis = null, watchProviders = null) {
  const {
    tmdb,
    omdb,
    trakt,
    letterboxd,
    urls,
    knownAs,
  } = data;

  const title = type === 'movie' ? tmdb.title : tmdb.name;
  const year = type === 'movie'
    ? tmdb.release_date?.split('-')[0]
    : tmdb.first_air_date?.split('-')[0];

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`${title}${year ? ` (${year})` : ''}`)
    .setURL(urls.imdb || 'https://imdb.com')
    .setThumbnail(getPosterUrl(tmdb.poster_path) || null);

  // Surface a well-known alternate/reissue title when TMDB's title of
  // record differs from how the title is actually known (e.g. "Day of the
  // Woman" (1978), better known as "I Spit on Your Grave").
  if (knownAs) {
    embed.addFields({
      name: 'Also Known As',
      value: knownAs,
      inline: false,
    });
  }

  // Add description/synopsis
  if (tmdb.overview) {
    embed.setDescription(tmdb.overview);
  }
  
  // Add ratings field - compact inline format
  const ratingsText = buildRatingsText(data, enabledServices, guildEmojis);
  if (ratingsText) {
    embed.addFields({
      name: '⭐ Ratings',
      value: ratingsText,
      inline: false,
    });
  }
  
  // Add streaming availability if available
  if (watchProviders) {
    const streamingText = buildStreamingText(watchProviders);
    if (streamingText) {
      embed.addFields({
        name: '📺 Streaming Availability',
        value: streamingText,
        inline: false,
      });
    }
  }
  
  // Add additional info
  if (type === 'movie') {
    embed.addFields({
      name: 'Runtime',
      value: formatRuntime(tmdb.runtime),
      inline: true,
    });
  } else {
    embed.addFields({
      name: 'Status',
      value: tmdb.status || 'N/A',
      inline: true,
    });
    
    if (tmdb.number_of_seasons) {
      embed.addFields({
        name: 'Seasons',
        value: tmdb.number_of_seasons.toString(),
        inline: true,
      });
    }
  }
  
  if (tmdb.genres && tmdb.genres.length > 0) {
    embed.addFields({
      name: 'Genres',
      value: tmdb.genres.map(g => g.name).join(', '),
      inline: false,
    });
  }
  
  // Add language information
  if (tmdb.spoken_languages && tmdb.spoken_languages.length > 0) {
    const languages = tmdb.spoken_languages.map(l => l.english_name).join(', ');
    embed.addFields({
      name: 'Languages',
      value: languages,
      inline: true,
    });
  } else if (tmdb.original_language) {
    // Fallback to original language if spoken_languages not available
    embed.addFields({
      name: 'Language',
      value: tmdb.original_language.toUpperCase(),
      inline: true,
    });
  }
  
  return { embeds: [embed], components: [] };
}

/**
 * Create a detailed episode embed with ratings
 */
export async function createEpisodeEmbed(data, enabledServices = null, guildEmojis = null) {
  const { episode, omdb, trakt, urls } = data;
  
  const showName = episode.show.name;
  const episodeName = episode.name;
  const seasonEpisode = `Season ${episode.season_number}, Episode ${episode.episode_number}`;
  
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`${showName} · ${episodeName}`)
    .setURL(urls.imdb || 'https://imdb.com')
    .setDescription(`**${seasonEpisode}**\n\n${episode.overview || 'No description available.'}`)
    .setThumbnail(getPosterUrl(episode.show.poster_path) || null); // Use show poster, not episode still
  
  // Add episode info
  if (episode.air_date) {
    embed.addFields({
      name: 'Air Date',
      value: episode.air_date,
      inline: true,
    });
  }
  
  if (episode.runtime) {
    embed.addFields({
      name: 'Runtime',
      value: formatRuntime(episode.runtime),
      inline: true,
    });
  }
  
  // Add ratings field - Episode-specific ratings from IMDb and Trakt
  const ratingsText = buildRatingsText(data, enabledServices, guildEmojis);
  if (ratingsText) {
    embed.addFields({
      name: '⭐ Episode Ratings & Streaming',
      value: ratingsText,
      inline: false,
    });
  }
  
  embed.setFooter({ text: `${showName}` });
  
  return { embeds: [embed], components: [] };
}

/**
 * Build the ratings text with links and icons - compact inline format
 * @param {Object} data - Contains omdb, trakt, letterboxd, and urls data
 * @param {Object} enabledServices - Object mapping service names to boolean (enabled/disabled)
 * @param {Object} guildEmojis - Guild-specific emoji configuration
 */
function buildRatingsText(data, enabledServices = null, guildEmojis = null) {
  const { omdb, trakt, letterboxd, urls } = data;
  const badges = [];
  
  // If no service config provided, enable all services
  const services = enabledServices || {
    imdb: true,
    letterboxd: true,
    trakt: true,
    rottenTomatoes: true,
    justWatch: true,
  };
  
  // Use guild emojis if provided, otherwise fall back to global config
  const emojis = guildEmojis || config.emojis;
  
  // IMDb
  if (services.imdb) {
    if (omdb && omdb.imdbRating && omdb.imdbRating !== 'N/A' && urls.imdb) {
      const icon = emojis.imdb ? `${emojis.imdb} ` : '';
      badges.push(`[${icon}**IMDb:** ${omdb.imdbRating}](${urls.imdb})`);
    } else if (urls.imdb) {
      const icon = emojis.imdb ? `${emojis.imdb} ` : '';
      badges.push(`[${icon}**IMDb**](${urls.imdb})`);
    }
  }
  
  // Letterboxd
  if (services.letterboxd && urls.letterboxd) {
    const icon = emojis.letterboxd ? `${emojis.letterboxd} ` : '';
    if (letterboxd && letterboxd.rating) {
      badges.push(`[${icon}**Letterboxd:** ${letterboxd.rating.toFixed(1)}](${urls.letterboxd})`);
    } else {
      badges.push(`[${icon}**Letterboxd**](${urls.letterboxd})`);
    }
  }
  
  // Trakt
  if (services.trakt) {
    if (trakt && trakt.rating && urls.trakt) {
      const icon = emojis.trakt ? `${emojis.trakt} ` : '';
      badges.push(`[${icon}**Trakt:** ${trakt.rating.toFixed(1)}](${urls.trakt})`);
    } else if (urls.trakt) {
      const icon = emojis.trakt ? `${emojis.trakt} ` : '';
      badges.push(`[${icon}**Trakt**](${urls.trakt})`);
    }
  }
  
  // Rotten Tomatoes - Critics score only (OMDB limitation)
  if (services.rottenTomatoes) {
    if (omdb && omdb.Ratings && urls.rottenTomatoes) {
      const rtRating = omdb.Ratings.find(r => r.Source === 'Rotten Tomatoes');
      if (rtRating) {
        const criticsIcon = emojis.rtCritics ? `${emojis.rtCritics} ` : '';
        badges.push(`[${criticsIcon}**RT Critics:** ${rtRating.Value}](${urls.rottenTomatoes})`);
      } else {
        const criticsIcon = emojis.rtCritics ? `${emojis.rtCritics} ` : '';
        badges.push(`[${criticsIcon}**RT Critics**](${urls.rottenTomatoes})`);
      }
    } else if (urls.rottenTomatoes) {
      const criticsIcon = emojis.rtCritics ? `${emojis.rtCritics} ` : '';
      badges.push(`[${criticsIcon}**Rotten Tomatoes**](${urls.rottenTomatoes})`);
    }
  }
  
  // JustWatch - Streaming availability
  if (services.justWatch && urls.justWatch) {
    const icon = emojis.justWatch ? `${emojis.justWatch} ` : '';
    badges.push(`[${icon}**JustWatch**](${urls.justWatch})`);
  }
  
  // Join all badges with separator
  return badges.length > 0 ? badges.join(' • ') : 'No ratings available.';
}

/**
 * Normalize streaming provider names and remove duplicates
 * @param {Array} providers - Array of provider objects with provider_name
 * @returns {Array} Normalized unique provider names
 */
function normalizeProviders(providers) {
  const nameMap = {
    'Peacock Premium': 'Peacock',
    'Peacock Premium Plus': 'Peacock',
    'Apple TV Store': 'Apple TV',
    'Google Play Movies': 'Google Play',
    'Fandango At Home': 'Fandango',
    'Amazon Video': 'Amazon',
    'AMC+ Amazon Channel': 'AMC+',
    'Shudder Amazon Channel': 'Shudder',
    'Shudder Apple TV Channel': 'Shudder',
    'AMC Amazon Channel': 'AMC',
    'AMC Apple TV Channel': 'AMC',
  };
  
  const normalized = providers.map(p => {
    const name = p.provider_name;
    return nameMap[name] || name; // Use mapped name or original
  });
  
  // Remove duplicates while preserving order
  return [...new Set(normalized)];
}

/**
 * Build streaming availability text from TMDB watch providers
 * @param {Object} watchProviders - Watch provider data from TMDB
 * @returns {string} Formatted streaming text with service names
 */
function buildStreamingText(watchProviders) {
  if (!watchProviders) {
    return null;
  }
  
  const lines = [];
  
  // Streaming services (subscription)
  if (watchProviders.flatrate && watchProviders.flatrate.length > 0) {
    const services = normalizeProviders(watchProviders.flatrate).join(' • ');
    lines.push(`**Stream:** ${services}`);
  }
  
  // Rental options
  if (watchProviders.rent && watchProviders.rent.length > 0) {
    const services = normalizeProviders(watchProviders.rent.slice(0, 8)).join(' • ');
    lines.push(`**Rent:** ${services}`);
  }
  
  // Purchase options
  if (watchProviders.buy && watchProviders.buy.length > 0) {
    const services = normalizeProviders(watchProviders.buy.slice(0, 8)).join(' • ');
    lines.push(`**Buy:** ${services}`);
  }
  
  // Add TMDB link for full details
  if (watchProviders.link && lines.length > 0) {
    lines.push(`\n**[View all streaming links →](${watchProviders.link})**`);
  }
  
  return lines.length > 0 ? lines.join('\n') : null;
}


/**
 * Create a game search results message with a select menu
 */
export async function createGameSearchResults(results, query) {
  const options = results.map((result) => {
    const title = result.name;
    const year = result.released;
    const yearStr = year ? ` (${year.split('-')[0]})` : '';
    const platforms = result.platforms?.slice(0, 2).map(p => p.platform.name).join(', ') || 'Multiple platforms';
    
    return {
      label: `${title}${yearStr}`.substring(0, 100),
      description: platforms.substring(0, 100),
      value: `game_${result.id}`,
    };
  });
  
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('select_result')
    .setPlaceholder('Select a game to display')
    .addOptions(options);
  
  const row = new ActionRowBuilder().addComponents(selectMenu);
  
  const embed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle(`Game Search Results for "${query}"`)
    .setDescription(`Found ${results.length} result${results.length > 1 ? 's' : ''}. Select one below to view details and ratings.`)
    .setFooter({ text: 'Select a game from the menu below' });
  
  return {
    embeds: [embed],
    components: [row],
  };
}

/**
 * Create a detailed game embed with ratings and information
 */
export async function createGameDetailedEmbed(game) {
  const title = game.name;
  const year = game.released?.split('-')[0];
  
  const embed = new EmbedBuilder()
    .setColor(0x9147FF) // Purple color for games
    .setTitle(`${title}${year ? ` (${year})` : ''}`)
    .setURL(game.website || `https://rawg.io/games/${game.slug}`)
    .setThumbnail(game.background_image || null);
  
  // Add description
  if (game.description_raw) {
    const description = game.description_raw.length > 400 
      ? game.description_raw.substring(0, 397) + '...' 
      : game.description_raw;
    embed.setDescription(description);
  }
  
  // Add ratings and platforms
  const ratingsInfo = [];
  
  if (game.metacritic) {
    ratingsInfo.push(`🎮 **Metacritic:** ${game.metacritic}/100`);
  }
  
  if (game.rating && game.ratings_count) {
    ratingsInfo.push(`⭐ **RAWG:** ${game.rating}/5 (${game.ratings_count.toLocaleString()} ratings)`);
  }
  
  if (ratingsInfo.length > 0) {
    embed.addFields({
      name: '⭐ Ratings',
      value: ratingsInfo.join('\n'),
      inline: false,
    });
  }
  
  // Add platforms
  if (game.platforms && game.platforms.length > 0) {
    const platformNames = game.platforms.map(p => p.platform.name).join(', ');
    embed.addFields({
      name: '🎮 Platforms',
      value: platformNames.length > 1024 ? platformNames.substring(0, 1021) + '...' : platformNames,
      inline: false,
    });
  }
  
  // Add genres
  if (game.genres && game.genres.length > 0) {
    embed.addFields({
      name: '🏷️ Genres',
      value: game.genres.map(g => g.name).join(', '),
      inline: true,
    });
  }
  
  // Add release date
  if (game.released) {
    embed.addFields({
      name: '📅 Released',
      value: game.released,
      inline: true,
    });
  }
  
  // Add developers
  if (game.developers && game.developers.length > 0) {
    embed.addFields({
      name: '👨‍💻 Developers',
      value: game.developers.map(d => d.name).join(', '),
      inline: false,
    });
  }
  
  // Add publishers
  if (game.publishers && game.publishers.length > 0) {
    embed.addFields({
      name: '🏢 Publishers',
      value: game.publishers.map(p => p.name).join(', '),
      inline: false,
    });
  }
  
  // Add ESRB rating
  if (game.esrb_rating) {
    embed.addFields({
      name: '🔞 ESRB Rating',
      value: game.esrb_rating.name,
      inline: true,
    });
  }
  
  // Add stores/links
  const links = [];
  if (game.website) {
    links.push(`[Official Website](${game.website})`);
  }
  links.push(`[View on RAWG](https://rawg.io/games/${game.slug})`);
  
  if (game.metacritic_url) {
    links.push(`[Metacritic](${game.metacritic_url})`);
  }
  
  if (links.length > 0) {
    embed.addFields({
      name: '🔗 Links',
      value: links.join(' • '),
      inline: false,
    });
  }
  
  return { embeds: [embed], components: [] };
}

/**
 * Create a board game search results message with a select menu
 */
export async function createBoardGameSearchResults(results, query) {
  const options = results.map((result) => {
    const title = result.name;
    const year = result.yearPublished;
    const yearStr = year ? ` (${year})` : '';
    
    return {
      label: `${title}${yearStr}`.substring(0, 100),
      description: 'Board Game'.substring(0, 100),
      value: `boardgame_${result.id}`,
    };
  });
  
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('select_result')
    .setPlaceholder('Select a board game to display')
    .addOptions(options);
  
  const row = new ActionRowBuilder().addComponents(selectMenu);
  
  const embed = new EmbedBuilder()
    .setColor(0xFF5733) // Orange color for board games
    .setTitle(`Board Game Search Results for "${query}"`)
    .setDescription(`Found ${results.length} result${results.length > 1 ? 's' : ''}. Select one below to view details and ratings.`)
    .setFooter({ text: 'Select a board game from the menu below' });
  
  return {
    embeds: [embed],
    components: [row],
  };
}

/**
 * Create a detailed board game embed with ratings and information
 */
export async function createBoardGameDetailedEmbed(game) {
  const title = game.name;
  const year = game.yearPublished;
  
  const embed = new EmbedBuilder()
    .setColor(0xFF5733) // Orange color for board games
    .setTitle(`${title}${year ? ` (${year})` : ''}`)
    .setURL(`https://boardgamegeek.com/boardgame/${game.id}`)
    .setThumbnail(game.thumbnail || game.image || null);
  
  // Add description (truncate if too long)
  if (game.description) {
    const description = game.description.length > 400 
      ? game.description.substring(0, 397) + '...' 
      : game.description;
    embed.setDescription(description);
  }
  
  // Add ratings and stats
  const ratingsInfo = [];
  
  if (game.rating.average) {
    const usersRated = game.rating.usersRated || 'N/A';
    ratingsInfo.push(`⭐ **BGG Rating:** ${parseFloat(game.rating.average).toFixed(2)}/10 (${usersRated} ratings)`);
  }
  
  if (game.rating.bayesAverage) {
    ratingsInfo.push(`🏆 **Geek Rating:** ${parseFloat(game.rating.bayesAverage).toFixed(2)}/10`);
  }
  
  if (game.rating.rank && game.rating.rank !== 'Not Ranked') {
    ratingsInfo.push(`📊 **Rank:** #${game.rating.rank}`);
  }
  
  if (ratingsInfo.length > 0) {
    embed.addFields({
      name: '⭐ Ratings',
      value: ratingsInfo.join('\n'),
      inline: false,
    });
  }
  
  // Add player count and time
  const gameInfo = [];
  
  if (game.minPlayers && game.maxPlayers) {
    const playerCount = game.minPlayers === game.maxPlayers 
      ? `${game.minPlayers} players` 
      : `${game.minPlayers}-${game.maxPlayers} players`;
    gameInfo.push(`👥 **Players:** ${playerCount}`);
  }
  
  if (game.playingTime) {
    gameInfo.push(`⏱️ **Playing Time:** ${formatRuntime(game.playingTime)}`);
  }
  
  if (game.minAge) {
    gameInfo.push(`🔞 **Age:** ${game.minAge}+`);
  }
  
  if (game.complexity) {
    gameInfo.push(`🧩 **Complexity:** ${parseFloat(game.complexity).toFixed(2)}/5`);
  }
  
  if (gameInfo.length > 0) {
    embed.addFields({
      name: '📋 Game Info',
      value: gameInfo.join('\n'),
      inline: false,
    });
  }
  
  // Add categories
  if (game.categories && game.categories.length > 0) {
    embed.addFields({
      name: '🏷️ Categories',
      value: game.categories.slice(0, 8).map(c => c.name).join(', '),
      inline: false,
    });
  }
  
  // Add mechanics
  if (game.mechanics && game.mechanics.length > 0) {
    embed.addFields({
      name: '⚙️ Mechanics',
      value: game.mechanics.slice(0, 8).map(m => m.name).join(', '),
      inline: false,
    });
  }
  
  // Add designers
  if (game.designers && game.designers.length > 0) {
    embed.addFields({
      name: '👨‍🎨 Designers',
      value: game.designers.join(', '),
      inline: true,
    });
  }
  
  // Add publishers
  if (game.publishers && game.publishers.length > 0) {
    embed.addFields({
      name: '🏢 Publishers',
      value: game.publishers.join(', '),
      inline: true,
    });
  }
  
  // Add links
  const links = [];
  links.push(`[View on BoardGameGeek](https://boardgamegeek.com/boardgame/${game.id})`);
  
  embed.addFields({
    name: '🔗 Links',
    value: links.join(' • '),
    inline: false,
  });
  
  return { embeds: [embed], components: [] };
}

/**
 * Create a book search results message with a select menu
 */
export async function createBookSearchResults(results, query) {
  const options = results.map((result) => {
    const title = result.title;
    const authors = result.authors.length > 0 ? result.authors.join(', ') : 'Unknown Author';
    const year = result.publishedDate ? result.publishedDate.split('-')[0] : '';
    const yearStr = year ? ` (${year})` : '';
    
    return {
      label: `${title}${yearStr}`.substring(0, 100),
      description: `by ${authors}`.substring(0, 100),
      value: `book_${result.id}`,
    };
  });
  
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('select_result')
    .setPlaceholder('Select a book to display')
    .addOptions(options);
  
  const row = new ActionRowBuilder().addComponents(selectMenu);
  
  const embed = new EmbedBuilder()
    .setColor(0xFF6B35) // Orange/rust color for books
    .setTitle(`Book Search Results for "${query}"`)
    .setDescription(`Found ${results.length} book${results.length !== 1 ? 's' : ''}. Select one to view details.`);
  
  return { embeds: [embed], components: [row] };
}

/**
 * Create a detailed book embed
 */
export async function createBookDetailedEmbed(book) {
  const title = book.title;
  const subtitle = book.subtitle ? `: ${book.subtitle}` : '';
  const year = book.publishedDate?.split('-')[0];
  
  const embed = new EmbedBuilder()
    .setColor(0xFF6B35) // Orange/rust color for books
    .setTitle(`${title}${subtitle}${year ? ` (${year})` : ''}`)
    .setURL(book.canonicalVolumeLink || book.infoLink)
    .setThumbnail(book.thumbnail || null);
  
  // Add description
  if (book.description) {
    // Strip HTML tags from description
    const plainDescription = book.description.replace(/<[^>]*>/g, '');
    const description = plainDescription.length > 500 
      ? plainDescription.substring(0, 497) + '...' 
      : plainDescription;
    embed.setDescription(description);
  }
  
  // Add authors
  if (book.authors && book.authors.length > 0) {
    embed.addFields({
      name: '✍️ Author(s)',
      value: book.authors.join(', '),
      inline: false,
    });
  }
  
  // Add ratings
  const ratingsInfo = [];
  if (book.averageRating && book.ratingsCount) {
    ratingsInfo.push(`⭐ **Google Books:** ${book.averageRating}/5 (${book.ratingsCount.toLocaleString()} ratings)`);
  }
  
  if (ratingsInfo.length > 0) {
    embed.addFields({
      name: '⭐ Ratings',
      value: ratingsInfo.join('\n'),
      inline: false,
    });
  }
  
  // Add categories/genres
  if (book.categories && book.categories.length > 0) {
    const categoriesText = book.categories.join(', ');
    embed.addFields({
      name: '🏷️ Categories',
      value: categoriesText.length > 1024 ? categoriesText.substring(0, 1021) + '...' : categoriesText,
      inline: false,
    });
  }
  
  // Add publication info
  const pubInfo = [];
  if (book.publisher) {
    pubInfo.push(`**Publisher:** ${book.publisher}`);
  }
  if (book.publishedDate) {
    pubInfo.push(`**Published:** ${book.publishedDate}`);
  }
  if (book.pageCount) {
    pubInfo.push(`**Pages:** ${book.pageCount}`);
  }
  
  if (pubInfo.length > 0) {
    embed.addFields({
      name: '📚 Publication Info',
      value: pubInfo.join('\n'),
      inline: true,
    });
  }
  
  // Add ISBN info
  const isbnInfo = [];
  if (book.isbn13) {
    isbnInfo.push(`**ISBN-13:** ${book.isbn13}`);
  }
  if (book.isbn10) {
    isbnInfo.push(`**ISBN-10:** ${book.isbn10}`);
  }
  if (book.language) {
    isbnInfo.push(`**Language:** ${book.language.toUpperCase()}`);
  }
  
  if (isbnInfo.length > 0) {
    embed.addFields({
      name: '🔢 Details',
      value: isbnInfo.join('\n'),
      inline: true,
    });
  }
  
  // Add purchase/availability links
  const links = [];
  
  // Google Books preview/info
  if (book.previewLink) {
    links.push(`[Preview on Google Books](${book.previewLink})`);
  }
  
  // Purchase link if available
  if (book.saleability === 'FOR_SALE' && book.buyLink) {
    links.push(`[Buy Book](${book.buyLink})`);
  }
  
  // Add Goodreads and Open Library links if we have ISBN
  const isbn = book.isbn13 || book.isbn10;
  if (isbn) {
    links.push(`[Goodreads](https://www.goodreads.com/search?q=${isbn})`);
    links.push(`[Open Library](https://openlibrary.org/isbn/${isbn})`);
  }
  
  if (links.length > 0) {
    embed.addFields({
      name: '🔗 Links',
      value: links.join(' • '),
      inline: false,
    });
  }
  
  // Add price info if available
  if (book.saleability === 'FOR_SALE' && book.retailPrice) {
    const price = `${book.retailPrice.amount} ${book.retailPrice.currencyCode}`;
    embed.setFooter({ text: `Available for purchase: ${price}` });
  }
  
  return { embeds: [embed], components: [] };
}

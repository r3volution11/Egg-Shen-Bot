import { ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } from 'discord.js';
import { getPosterUrl } from '../services/tmdbService.js';
import { config } from '../config.js';

/**
 * Create a search results message with a select menu
 */
export async function createSearchResults(results, type, query) {
  const options = results.map((result, index) => {
    const title = result.title || result.name;
    const year = result.release_date || result.first_air_date;
    const yearStr = year ? ` (${year.split('-')[0]})` : '';
    const overview = result.overview ? result.overview.substring(0, 50) + '...' : 'No description';
    
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
    const overview = result.overview ? result.overview.substring(0, 50) + '...' : 'No description';
    
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
 * Create a detailed result embed with ratings
 */
export async function createDetailedEmbed(data, type, enabledServices = null, guildEmojis = null) {
  const {
    tmdb,
    omdb,
    trakt,
    urls,
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
  
  // Add description/synopsis
  if (tmdb.overview) {
    embed.setDescription(tmdb.overview);
  }
  
  // Add ratings field - compact inline format
  const ratingsText = buildRatingsText(data, enabledServices, guildEmojis);
  if (ratingsText) {
    embed.addFields({
      name: '⭐ Ratings & Streaming',
      value: ratingsText,
      inline: false,
    });
  }
  
  // Add additional info
  if (type === 'movie') {
    embed.addFields({
      name: 'Runtime',
      value: tmdb.runtime ? `${tmdb.runtime} minutes` : 'N/A',
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
      value: `${episode.runtime} minutes`,
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
 * @param {Object} data - Contains omdb, trakt, and urls data
 * @param {Object} enabledServices - Object mapping service names to boolean (enabled/disabled)
 * @param {Object} guildEmojis - Guild-specific emoji configuration
 */
function buildRatingsText(data, enabledServices = null, guildEmojis = null) {
  const { omdb, trakt, urls } = data;
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
  
  // Letterboxd (no rating available via API)
  if (services.letterboxd && urls.letterboxd) {
    const icon = emojis.letterboxd ? `${emojis.letterboxd} ` : '';
    badges.push(`[${icon}**Letterboxd**](${urls.letterboxd})`);
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
    gameInfo.push(`⏱️ **Playing Time:** ${game.playingTime} minutes`);
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

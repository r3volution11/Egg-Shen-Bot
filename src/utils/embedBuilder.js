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

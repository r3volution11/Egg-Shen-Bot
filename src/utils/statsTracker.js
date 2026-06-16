import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const statsDir = path.join(__dirname, '../../guild_stats');

/**
 * Ensure the stats directory exists
 */
async function ensureStatsDir() {
  try {
    await fs.access(statsDir);
  } catch {
    await fs.mkdir(statsDir, { recursive: true });
  }
}

/**
 * Get the stats file path for a guild
 */
function getStatsPath(guildId) {
  return path.join(statsDir, `${guildId}_stats.json`);
}

/**
 * Load guild statistics
 */
export async function loadGuildStats(guildId) {
  await ensureStatsDir();
  const statsPath = getStatsPath(guildId);
  
  try {
    const data = await fs.readFile(statsPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // If stats don't exist, return empty structure
    return {
      totalSearches: 0,
      searches: [], // Array of search records
      topMovies: {}, // { "Movie Title (Year)": count }
      topShows: {}, // { "Show Title (Year)": count }
      topEpisodes: {}, // { "Show Title - Episode Name": count }
      commandCounts: { random: 0, watched: 0, similar: 0 }, // Command usage counts
      userStats: {}, // { userId: { username, totalSearches, movies, shows, episodes, random, watched, similar } }
    };
  }
}

/**
 * Save guild statistics
 */
export async function saveGuildStats(guildId, stats) {
  await ensureStatsDir();
  const statsPath = getStatsPath(guildId);
  await fs.writeFile(statsPath, JSON.stringify(stats, null, 2), 'utf8');
}

/**
 * Track a search event
 */
export async function trackSearch(guildId, userId, username, type, title, year = null) {
  const stats = await loadGuildStats(guildId);
  
  // Increment total searches
  stats.totalSearches++;
  
  // Create search record
  const searchRecord = {
    userId,
    username,
    type, // 'movie', 'tv', 'episode'
    title,
    year,
    timestamp: new Date().toISOString(),
  };
  
  // Add to searches array
  stats.searches.push(searchRecord);
  
  // Update top content counters
  const contentKey = year ? `${title} (${year})` : title;
  
  if (type === 'movie') {
    stats.topMovies[contentKey] = (stats.topMovies[contentKey] || 0) + 1;
  } else if (type === 'tv') {
    stats.topShows[contentKey] = (stats.topShows[contentKey] || 0) + 1;
  } else if (type === 'episode') {
    stats.topEpisodes[contentKey] = (stats.topEpisodes[contentKey] || 0) + 1;
  }
  
  // Track command-specific counts
  if (type === 'random' || type === 'watched' || type === 'similar') {
    if (!stats.commandCounts) {
      stats.commandCounts = { random: 0, watched: 0, similar: 0 };
    }
    stats.commandCounts[type] = (stats.commandCounts[type] || 0) + 1;
  }
  
  // Update user stats
  if (!stats.userStats[userId]) {
    stats.userStats[userId] = {
      username,
      totalSearches: 0,
      movies: 0,
      shows: 0,
      episodes: 0,
      random: 0,
      watched: 0,
      similar: 0,
    };
  }
  
  stats.userStats[userId].username = username; // Update in case username changed
  stats.userStats[userId].totalSearches++;
  
  if (type === 'movie') {
    stats.userStats[userId].movies++;
  } else if (type === 'tv') {
    stats.userStats[userId].shows++;
  } else if (type === 'episode') {
    stats.userStats[userId].episodes++;
  } else if (type === 'random') {
    stats.userStats[userId].random++;
  } else if (type === 'watched') {
    stats.userStats[userId].watched++;
  } else if (type === 'similar') {
    stats.userStats[userId].similar++;
  }
  
  // Save updated stats
  await saveGuildStats(guildId, stats);
}

/**
 * Get top items from a stats object
 */
function getTopItems(statsObject, limit = 10) {
  return Object.entries(statsObject)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

/**
 * Get top users
 */
function getTopUsers(userStatsObject, limit = 10) {
  return Object.entries(userStatsObject)
    .sort(([, a], [, b]) => b.totalSearches - a.totalSearches)
    .slice(0, limit)
    .map(([userId, stats]) => ({
      userId,
      username: stats.username,
      totalSearches: stats.totalSearches,
      movies: stats.movies || 0,
      shows: stats.shows || 0,
      episodes: stats.episodes || 0,
      random: stats.random || 0,
      watched: stats.watched || 0,
      similar: stats.similar || 0,
    }));
}

/**
 * Get formatted statistics for display
 */
export async function getStats(guildId, filter = 'all-time') {
  const stats = await loadGuildStats(guildId);
  
  // Apply time filter if needed
  let filteredSearches = stats.searches;
  
  if (filter !== 'all-time') {
    const now = new Date();
    const cutoffDate = new Date();
    
    if (filter === 'today') {
      cutoffDate.setHours(0, 0, 0, 0);
    } else if (filter === 'week') {
      cutoffDate.setDate(now.getDate() - 7);
    } else if (filter === 'month') {
      cutoffDate.setMonth(now.getMonth() - 1);
    }
    
    filteredSearches = stats.searches.filter(search => 
      new Date(search.timestamp) >= cutoffDate
    );
    
    // Rebuild stats from filtered searches
    const filteredStats = {
      totalSearches: filteredSearches.length,
      topMovies: {},
      topShows: {},
      topEpisodes: {},
      commandCounts: { random: 0, watched: 0, similar: 0 },
      userStats: {},
    };
    
    for (const search of filteredSearches) {
      const contentKey = search.year ? `${search.title} (${search.year})` : search.title;
      
      // Track content
      if (search.type === 'movie') {
        filteredStats.topMovies[contentKey] = (filteredStats.topMovies[contentKey] || 0) + 1;
      } else if (search.type === 'tv') {
        filteredStats.topShows[contentKey] = (filteredStats.topShows[contentKey] || 0) + 1;
      } else if (search.type === 'episode') {
        filteredStats.topEpisodes[contentKey] = (filteredStats.topEpisodes[contentKey] || 0) + 1;
      }
      
      // Track command counts
      if (search.type === 'random' || search.type === 'watched' || search.type === 'similar') {
        filteredStats.commandCounts[search.type] = (filteredStats.commandCounts[search.type] || 0) + 1;
      }
      
      // Track users
      if (!filteredStats.userStats[search.userId]) {
        filteredStats.userStats[search.userId] = {
          username: search.username,
          totalSearches: 0,
          movies: 0,
          shows: 0,
          episodes: 0,
          random: 0,
          watched: 0,
          similar: 0,
        };
      }
      
      filteredStats.userStats[search.userId].totalSearches++;
      if (search.type === 'movie') filteredStats.userStats[search.userId].movies++;
      if (search.type === 'tv') filteredStats.userStats[search.userId].shows++;
      if (search.type === 'episode') filteredStats.userStats[search.userId].episodes++;
      if (search.type === 'random') filteredStats.userStats[search.userId].random++;
      if (search.type === 'watched') filteredStats.userStats[search.userId].watched++;
      if (search.type === 'similar') filteredStats.userStats[search.userId].similar++;
    }
    
    return {
      totalSearches: filteredStats.totalSearches,
      topMovies: getTopItems(filteredStats.topMovies),
      topShows: getTopItems(filteredStats.topShows),
      topEpisodes: getTopItems(filteredStats.topEpisodes),
      commandCounts: filteredStats.commandCounts,
      topUsers: getTopUsers(filteredStats.userStats),
      userStats: filteredStats.userStats,
    };
  }
  
  // All-time stats
  return {
    totalSearches: stats.totalSearches,
    topMovies: getTopItems(stats.topMovies),
    topShows: getTopItems(stats.topShows),
    topEpisodes: getTopItems(stats.topEpisodes),
    commandCounts: stats.commandCounts || { random: 0, watched: 0, similar: 0 },
    topUsers: getTopUsers(stats.userStats),
    userStats: stats.userStats,
  };
}

/**
 * Clear all statistics for a guild
 */
export async function clearStats(guildId) {
  const emptyStats = {
    totalSearches: 0,
    searches: [],
    topMovies: {},
    topShows: {},
    topEpisodes: {},
    commandCounts: { random: 0, watched: 0, similar: 0 },
    userStats: {},
  };
  
  await saveGuildStats(guildId, emptyStats);
}

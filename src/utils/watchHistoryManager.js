/**
 * Watch History Management System
 * Tracks what the server has watched together
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HISTORY_DIR = path.join(__dirname, '../../guild_watch_history');

/**
 * Ensure the history directory exists
 */
async function ensureHistoryDir() {
  try {
    await fs.mkdir(HISTORY_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating watch history directory:', error);
  }
}

/**
 * Get the history file path for a guild
 */
function getHistoryPath(guildId) {
  return path.join(HISTORY_DIR, `${guildId}_history.json`);
}

/**
 * Save a watch history entry
 * @param {string} guildId - Discord guild ID
 * @param {Object} entry - Watch history entry
 */
export async function saveWatchHistory(guildId, entry) {
  await ensureHistoryDir();
  
  try {
    const historyPath = getHistoryPath(guildId);
    let history = [];
    
    // Try to load existing history
    try {
      const data = await fs.readFile(historyPath, 'utf8');
      history = JSON.parse(data);
    } catch (error) {
      // File doesn't exist yet, that's fine
      if (error.code !== 'ENOENT') {
        console.error('Error reading watch history:', error);
      }
    }
    
    // Add new entry to the beginning
    history.unshift(entry);
    
    // Save updated history
    await fs.writeFile(historyPath, JSON.stringify(history, null, 2), 'utf8');
    
    console.log(`✓ Saved watch history entry for guild ${guildId}`);

    // Once something is watched it no longer belongs on the watchlist. This
    // lives here rather than in each caller so every path — /watched add, the
    // select-menu flow, and an auto-completing watch party timer — stays in
    // sync. Never let a watchlist problem fail the history write.
    await syncWatchlistAfterWatch(guildId, entry).catch(error => {
      console.error('Error syncing watchlist after watch:', error);
    });
  } catch (error) {
    console.error('Error saving watch history:', error);
    throw error;
  }
}

/**
 * Drop a newly-watched title from the watchlist, when the guild has that
 * behavior enabled (it is on by default).
 * @param {string} guildId
 * @param {Object} entry - The watch history entry just saved
 */
async function syncWatchlistAfterWatch(guildId, entry) {
  if (!entry?.tmdbId || !entry?.type) return;

  const { loadGuildConfig } = await import('./guildConfig.js');
  const config = await loadGuildConfig(guildId);

  // Default on, but respect an explicit opt-out.
  if (config.watchlist?.autoRemoveWatched === false) return;

  const { removeFromWatchlist } = await import('./watchlistManager.js');
  const result = await removeFromWatchlist(guildId, entry.tmdbId, entry.type);

  if (result.success) {
    console.log(`✓ Removed "${result.removed.title}" from watchlist for guild ${guildId} (now watched)`);
  }
}

/**
 * Get watch history for a guild
 * @param {string} guildId - Discord guild ID
 * @param {string} filter - Filter by type ('all', 'movie', 'tv')
 * @param {number} limit - Maximum number of entries to return
 * @returns {Array} Array of watch history entries
 */
export async function getWatchHistory(guildId, filter = 'all', limit = 10) {
  try {
    const historyPath = getHistoryPath(guildId);
    const data = await fs.readFile(historyPath, 'utf8');
    let history = JSON.parse(data);
    
    // Apply filter
    if (filter !== 'all') {
      history = history.filter(entry => entry.type === filter);
    }
    
    // Apply limit
    return history.slice(0, limit);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // No history file yet
      return [];
    }
    console.error('Error reading watch history:', error);
    throw error;
  }
}

/**
 * Clear all watch history for a guild (admin function)
 * @param {string} guildId - Discord guild ID
 */
export async function clearWatchHistory(guildId) {
  try {
    const historyPath = getHistoryPath(guildId);
    await fs.unlink(historyPath);
    console.log(`✓ Cleared watch history for guild ${guildId}`);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Error clearing watch history:', error);
      throw error;
    }
  }
}

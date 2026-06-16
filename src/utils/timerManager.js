/**
 * Timer Management System
 * Manages channel-specific timers (one active timer per channel)
 * Timers are persisted to disk and restored on bot restart
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store active timers: { channelId: { startTime, userId, username, label } }
const activeTimers = new Map();

// Path to persist timers
const TIMERS_FILE = path.join(__dirname, '../../active_timers.json');

/**
 * Save active timers to disk
 */
async function saveTimers() {
  try {
    const timersData = {};
    for (const [channelId, timer] of activeTimers.entries()) {
      timersData[channelId] = timer;
    }
    await fs.writeFile(TIMERS_FILE, JSON.stringify(timersData, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving timers:', error);
  }
}

/**
 * Load timers from disk on bot startup
 * @returns {Map} - Map of channelId to timer data for channels that had active timers
 */
export async function loadTimers() {
  try {
    const data = await fs.readFile(TIMERS_FILE, 'utf8');
    const timersData = JSON.parse(data);
    
    const restoredTimers = new Map();
    
    for (const [channelId, timer] of Object.entries(timersData)) {
      activeTimers.set(channelId, timer);
      restoredTimers.set(channelId, timer);
    }
    
    console.log(`✓ Restored ${restoredTimers.size} active timer(s) from previous session`);
    return restoredTimers;
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist yet, that's fine
      return new Map();
    }
    console.error('Error loading timers:', error);
    return new Map();
  }
}

/**
 * Start a timer in a channel
 * @param {string} channelId - Discord channel ID
 * @param {string} userId - User who started the timer
 * @param {string} username - Username of who started it
 * @param {string} label - Optional label/description for the timer
 * @returns {boolean} - True if started, false if timer already exists
 */
export function startTimer(channelId, userId, username, label = '') {
  // Check if timer already exists for this channel
  if (activeTimers.has(channelId)) {
    return false;
  }

  activeTimers.set(channelId, {
    startTime: Date.now(),
    userId,
    username,
    label: label || '',
  });

  // Save to disk
  saveTimers().catch(err => console.error('Failed to save timers:', err));

  return true;
}

/**
 * Stop a timer in a channel
 * @param {string} channelId - Discord channel ID
 * @returns {object|null} - Timer data with elapsed time, or null if no timer
 */
export function stopTimer(channelId) {
  const timer = activeTimers.get(channelId);
  
  if (!timer) {
    return null;
  }

  const elapsedMs = Date.now() - timer.startTime;
  activeTimers.delete(channelId);

  // Save to disk
  saveTimers().catch(err => console.error('Failed to save timers:', err));

  return {
    ...timer,
    elapsedMs,
    elapsedFormatted: formatElapsedTime(elapsedMs),
  };
}

/**
 * Get the current timer status for a channel
 * @param {string} channelId - Discord channel ID
 * @returns {object|null} - Current timer data with elapsed time, or null if no timer
 */
export function getTimerStatus(channelId) {
  const timer = activeTimers.get(channelId);
  
  if (!timer) {
    return null;
  }

  const elapsedMs = Date.now() - timer.startTime;

  return {
    ...timer,
    elapsedMs,
    elapsedFormatted: formatElapsedTime(elapsedMs),
  };
}

/**
 * Format elapsed time in a human-readable format
 * @param {number} ms - Milliseconds elapsed
 * @returns {string} - Formatted time string
 */
function formatElapsedTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remainingHours = hours % 24;
    const remainingMinutes = minutes % 60;
    const remainingSeconds = seconds % 60;
    return `${days}d ${remainingHours}h ${remainingMinutes}m ${remainingSeconds}s`;
  } else if (hours > 0) {
    const remainingMinutes = minutes % 60;
    const remainingSeconds = seconds % 60;
    return `${hours}h ${remainingMinutes}m ${remainingSeconds}s`;
  } else if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Get all active timers (for debugging)
 * @returns {Map} - Map of all active timers
 */
export function getAllTimers() {
  return activeTimers;
}

/**
 * Clear all timers (for testing/admin purposes)
 */
export function clearAllTimers() {
  activeTimers.clear();
}

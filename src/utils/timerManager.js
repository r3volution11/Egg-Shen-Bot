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

// Store active timers: { channelId: { startTime, userId, username, label, duration, endTime, autoStopTimeout } }
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
      // Exclude autoStopTimeout which can't be serialized
      const { autoStopTimeout, ...serializableTimer } = timer;
      timersData[channelId] = serializableTimer;
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
 * Restore auto-stop timeouts for timers with durations after bot restart
 * Call this after the bot is ready and can fetch channels
 * @param {object} client - Discord client
 */
export async function restoreTimerTimeouts(client) {
  for (const [channelId, timer] of activeTimers.entries()) {
    if (timer.duration && timer.endTime) {
      const remainingMs = timer.endTime - Date.now();
      
      // If timer has expired while bot was down, stop it now
      if (remainingMs <= 0) {
        console.log(`[Timer] Timer in channel ${channelId} expired during downtime, stopping now`);
        const result = stopTimer(channelId);
        
        if (result) {
          try {
            const channel = await client.channels.fetch(channelId);
            if (channel && channel.isTextBased()) {
              await channel.send({
                content: `⏰ Timer completed while bot was offline. Duration: ${result.elapsedFormatted}`,
              });
            }
          } catch (error) {
            console.error('[Timer] Error sending expired timer message:', error);
          }
        }
      } else {
        // Set up auto-stop timeout for remaining time
        console.log(`[Timer] Restoring auto-stop timeout for channel ${channelId}, remaining: ${Math.round(remainingMs / 1000)}s`);
        const autoStopTimeout = setTimeout(async () => {
          console.log(`[Timer] Auto-stopping restored timer in channel ${channelId}`);
          const result = stopTimer(channelId);
          
          if (result) {
            try {
              const channel = await client.channels.fetch(channelId);
              if (channel && channel.isTextBased()) {
                await channel.send({
                  content: `⏰ Timer completed! Duration: ${result.elapsedFormatted}`,
                });
              }
            } catch (error) {
              console.error('[Timer] Error sending auto-stop message:', error);
            }
          }
        }, remainingMs);
        
        timer.autoStopTimeout = autoStopTimeout;
      }
    }
  }
}

/**
 * Start a timer in a channel
 * @param {string} channelId - Discord channel ID
 * @param {string} userId - User who started the timer
 * @param {string} username - Username of who started it
 * @param {string} label - Optional label/description for the timer
 * @param {number} durationMinutes - Optional duration in minutes
 * @param {object} client - Discord client for auto-stop functionality
 * @returns {boolean} - True if started, false if timer already exists
 */
export function startTimer(channelId, userId, username, label = '', durationMinutes = null, client = null) {
  // Check if timer already exists for this channel
  if (activeTimers.has(channelId)) {
    return false;
  }

  const startTime = Date.now();
  const timerData = {
    startTime,
    userId,
    username,
    label: label || '',
  };

  // Add duration if specified
  if (durationMinutes && durationMinutes > 0) {
    timerData.duration = durationMinutes;
    timerData.endTime = startTime + (durationMinutes * 60 * 1000);
    
    // Set up auto-stop if client is provided
    if (client) {
      const timeoutMs = durationMinutes * 60 * 1000;
      const autoStopTimeout = setTimeout(async () => {
        console.log(`[Timer] Auto-stopping timer in channel ${channelId} after ${durationMinutes} minutes`);
        const result = stopTimer(channelId);
        
        if (result) {
          try {
            const channel = await client.channels.fetch(channelId);
            if (channel && channel.isTextBased()) {
              await channel.send({
                content: `⏰ Timer completed! Duration: ${result.elapsedFormatted}`,
              });
            }
          } catch (error) {
            console.error('[Timer] Error sending auto-stop message:', error);
          }
        }
      }, timeoutMs);
      
      timerData.autoStopTimeout = autoStopTimeout;
    }
  }

  activeTimers.set(channelId, timerData);

  // Save to disk (exclude timeout which can't be serialized)
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

  // Clear auto-stop timeout if it exists
  if (timer.autoStopTimeout) {
    clearTimeout(timer.autoStopTimeout);
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
  const result = {
    ...timer,
    elapsedMs,
    elapsedFormatted: formatElapsedTime(elapsedMs),
  };

  // Add remaining time if duration is set
  if (timer.duration && timer.endTime) {
    const remainingMs = Math.max(0, timer.endTime - Date.now());
    result.remainingMs = remainingMs;
    result.remainingFormatted = formatElapsedTime(remainingMs);
    result.isExpired = remainingMs <= 0;
  }

  return result;
}

/**
 * Format elapsed time in video player format (H:MM:SS or M:SS)
 * @param {number} ms - Milliseconds elapsed
 * @returns {string} - Formatted time string like "2:43:32" or "5:32" or "0:32"
 */
function formatElapsedTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    // Format: H:MM:SS (e.g., "2:43:32")
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  } else {
    // Format: M:SS (e.g., "5:32" or "0:32")
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
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

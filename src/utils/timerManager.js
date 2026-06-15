/**
 * Timer Management System
 * Manages channel-specific timers (one active timer per channel)
 * Timers are stored in memory and reset when the bot restarts
 */

// Store active timers: { channelId: { startTime, userId, username, label } }
const activeTimers = new Map();

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

import { loadGuildConfig } from './guildConfig.js';

/**
 * Rate limiter storage
 * Structure: Map<guildId, Map<userId, Map<commandName, timestamp[]>>>
 */
const rateLimitCache = new Map();

/**
 * Clean up old timestamps periodically (runs every 5 minutes)
 */
setInterval(() => {
  const now = Date.now();
  const maxAge = 5 * 60 * 1000; // 5 minutes
  
  for (const [guildId, guildCache] of rateLimitCache) {
    for (const [userId, userCommands] of guildCache) {
      for (const [commandName, timestamps] of userCommands) {
        // Remove timestamps older than 5 minutes
        const filtered = timestamps.filter(ts => now - ts < maxAge);
        if (filtered.length === 0) {
          userCommands.delete(commandName);
        } else {
          userCommands.set(commandName, filtered);
        }
      }
      // Remove user if no commands left
      if (userCommands.size === 0) {
        guildCache.delete(userId);
      }
    }
    // Remove guild if no users left
    if (guildCache.size === 0) {
      rateLimitCache.delete(guildId);
    }
  }
}, 5 * 60 * 1000);

/**
 * Check if user has administrator or moderator permissions
 */
function hasModeratorPermissions(member) {
  if (!member) return false;
  
  // Check for Administrator permission
  if (member.permissions.has('Administrator')) {
    return true;
  }
  
  // Check for moderator-like permissions
  const moderatorPermissions = [
    'ManageMessages',
    'ManageChannels',
    'ManageGuild',
    'KickMembers',
    'BanMembers',
  ];
  
  return moderatorPermissions.some(perm => member.permissions.has(perm));
}

/**
 * Check if a user is rate limited for a specific command
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {string} commandName - Command name
 * @param {object} member - Guild member object (for permission checks)
 * @returns {Promise<{limited: boolean, retryAfter?: number, message?: string}>}
 */
export async function checkRateLimit(guildId, userId, commandName, member = null) {
  // Load guild config to get rate limit settings
  const config = await loadGuildConfig(guildId);
  
  // Check if rate limiting is enabled
  if (!config.rateLimits?.enabled) {
    return { limited: false };
  }
  
  // Bypass rate limits for moderators/admins if configured
  if (config.rateLimits.bypassForModerators && hasModeratorPermissions(member)) {
    return { limited: false };
  }
  
  // Get rate limit settings for this command (or use global default)
  const commandLimits = config.rateLimits.commands?.[commandName] || config.rateLimits.global;
  
  if (!commandLimits) {
    return { limited: false };
  }
  
  const { maxRequests, windowSeconds } = commandLimits;
  const windowMs = windowSeconds * 1000;
  const now = Date.now();
  
  // Get or create guild cache
  if (!rateLimitCache.has(guildId)) {
    rateLimitCache.set(guildId, new Map());
  }
  const guildCache = rateLimitCache.get(guildId);
  
  // Get or create user cache
  if (!guildCache.has(userId)) {
    guildCache.set(userId, new Map());
  }
  const userCommands = guildCache.get(userId);
  
  // Get or create command timestamps
  if (!userCommands.has(commandName)) {
    userCommands.set(commandName, []);
  }
  const timestamps = userCommands.get(commandName);
  
  // Remove timestamps outside the window
  const validTimestamps = timestamps.filter(ts => now - ts < windowMs);
  userCommands.set(commandName, validTimestamps);
  
  // Check if user exceeded the limit
  if (validTimestamps.length >= maxRequests) {
    const oldestTimestamp = validTimestamps[0];
    const retryAfter = Math.ceil((windowMs - (now - oldestTimestamp)) / 1000);
    
    return {
      limited: true,
      retryAfter,
      message: `You're using commands too quickly! Please wait ${retryAfter} second${retryAfter !== 1 ? 's' : ''} before using **/${commandName}** again.`
    };
  }
  
  // Add current timestamp
  validTimestamps.push(now);
  
  return { limited: false };
}

/**
 * Clear rate limit cache for a specific user (for admin override)
 */
export function clearRateLimitForUser(guildId, userId) {
  const guildCache = rateLimitCache.get(guildId);
  if (guildCache) {
    guildCache.delete(userId);
    return true;
  }
  return false;
}

/**
 * Clear all rate limits for a guild (for admin override)
 */
export function clearRateLimitsForGuild(guildId) {
  return rateLimitCache.delete(guildId);
}

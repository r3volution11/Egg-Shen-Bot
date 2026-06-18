import { loadGuildConfig } from './guildConfig.js';

/**
 * Rate limiter storage
 * Structure: Map<guildId, Map<userId, Map<commandName, timestamp[]>>>
 */
const rateLimitCache = new Map();

/**
 * Guild-wide rate limit storage
 * Structure: Map<guildId, timestamp[]>
 */
const guildWideLimitCache = new Map();

/**
 * Pattern detection storage for suspicious activity
 * Structure: Map<guildId, Array<{userId, commandName, args, timestamp}>>
 */
const patternDetectionCache = new Map();

/**
 * Flagged suspicious activity log
 * Structure: Map<guildId, Array<{pattern, users, timestamp, commandName, details}>>
 */
const suspiciousActivityLog = new Map();

/**
 * Clean up old timestamps periodically (runs every 5 minutes)
 */
setInterval(() => {
  const now = Date.now();
  const maxAge = 5 * 60 * 1000; // 5 minutes
  
  // Clean up per-user rate limits
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
  
  // Clean up guild-wide rate limits
  for (const [guildId, timestamps] of guildWideLimitCache) {
    const filtered = timestamps.filter(ts => now - ts < maxAge);
    if (filtered.length === 0) {
      guildWideLimitCache.delete(guildId);
    } else {
      guildWideLimitCache.set(guildId, filtered);
    }
  }
  
  // Clean up pattern detection cache
  for (const [guildId, commands] of patternDetectionCache) {
    const filtered = commands.filter(cmd => now - cmd.timestamp < maxAge);
    if (filtered.length === 0) {
      patternDetectionCache.delete(guildId);
    } else {
      patternDetectionCache.set(guildId, filtered);
    }
  }
  
  // Clean up suspicious activity log (keep for 24 hours)
  const logMaxAge = 24 * 60 * 60 * 1000; // 24 hours
  for (const [guildId, activities] of suspiciousActivityLog) {
    const filtered = activities.filter(activity => now - activity.timestamp < logMaxAge);
    if (filtered.length === 0) {
      suspiciousActivityLog.delete(guildId);
    } else {
      suspiciousActivityLog.set(guildId, filtered);
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
 * @param {string} commandArgs - Command arguments for pattern detection (optional)
 * @returns {Promise<{limited: boolean, retryAfter?: number, message?: string, guildWide?: boolean}>}
 */
export async function checkRateLimit(guildId, userId, commandName, member = null, commandArgs = '') {
  // Load guild config to get rate limit settings
  const config = await loadGuildConfig(guildId);
  
  // Check if rate limiting is enabled
  if (!config.rateLimits?.enabled) {
    return { limited: false };
  }
  
  // Bypass rate limits for moderators/admins if configured
  const isModerator = config.rateLimits.bypassForModerators && hasModeratorPermissions(member);
  if (isModerator) {
    return { limited: false };
  }
  
  const now = Date.now();
  
  // Check guild-wide rate limit first (if enabled)
  if (config.rateLimits.guildWide?.enabled) {
    const guildLimit = config.rateLimits.guildWide.maxRequests;
    const guildWindow = config.rateLimits.guildWide.windowSeconds * 1000;
    
    if (!guildWideLimitCache.has(guildId)) {
      guildWideLimitCache.set(guildId, []);
    }
    
    const guildTimestamps = guildWideLimitCache.get(guildId);
    const validGuildTimestamps = guildTimestamps.filter(ts => now - ts < guildWindow);
    guildWideLimitCache.set(guildId, validGuildTimestamps);
    
    if (validGuildTimestamps.length >= guildLimit) {
      const oldestGuildTimestamp = validGuildTimestamps[0];
      const retryAfter = Math.ceil((guildWindow - (now - oldestGuildTimestamp)) / 1000);
      
      return {
        limited: true,
        guildWide: true,
        retryAfter,
        message: `⚠️ Server-wide rate limit reached! This server is currently receiving too many commands. Please wait ${retryAfter} second${retryAfter !== 1 ? 's' : ''} before trying again.`
      };
    }
  }
  
  // Get rate limit settings for this command (or use global default)
  const commandLimits = config.rateLimits.commands?.[commandName] || config.rateLimits.global;
  
  if (!commandLimits) {
    return { limited: false };
  }
  
  const { maxRequests, windowSeconds } = commandLimits;
  const windowMs = windowSeconds * 1000;
  
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
  
  // Add to guild-wide tracking if enabled
  if (config.rateLimits.guildWide?.enabled) {
    const guildTimestamps = guildWideLimitCache.get(guildId) || [];
    guildTimestamps.push(now);
    guildWideLimitCache.set(guildId, guildTimestamps);
  }
  
  // Pattern detection (if enabled and not a moderator)
  if (config.rateLimits.patternDetection?.enabled && !isModerator) {
    detectSuspiciousPatterns(guildId, userId, commandName, commandArgs, config);
  }
  
  return { limited: false };
}

/**
 * Detect suspicious command patterns
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {string} commandName - Command name
 * @param {string} commandArgs - Command arguments
 * @param {object} config - Guild config
 */
function detectSuspiciousPatterns(guildId, userId, commandName, commandArgs, config) {
  const now = Date.now();
  const detectionWindow = (config.rateLimits.patternDetection?.windowSeconds || 60) * 1000;
  const minUsers = config.rateLimits.patternDetection?.minUsers || 3;
  
  // Initialize pattern detection cache for this guild
  if (!patternDetectionCache.has(guildId)) {
    patternDetectionCache.set(guildId, []);
  }
  
  const guildCommands = patternDetectionCache.get(guildId);
  
  // Add current command
  guildCommands.push({
    userId,
    commandName,
    args: commandArgs,
    timestamp: now,
  });
  
  // Filter to recent commands within detection window
  const recentCommands = guildCommands.filter(cmd => now - cmd.timestamp < detectionWindow);
  patternDetectionCache.set(guildId, recentCommands);
  
  // Detect pattern: Multiple different users using same command with same args
  if (commandArgs) {
    const matchingCommands = recentCommands.filter(
      cmd => cmd.commandName === commandName && cmd.args === commandArgs
    );
    
    const uniqueUsers = new Set(matchingCommands.map(cmd => cmd.userId));
    
    if (uniqueUsers.size >= minUsers) {
      // Suspicious pattern detected!
      logSuspiciousActivity(guildId, {
        pattern: 'identical_commands',
        users: Array.from(uniqueUsers),
        timestamp: now,
        commandName,
        details: `${uniqueUsers.size} users ran /${commandName} with identical arguments within ${detectionWindow / 1000}s`,
        args: commandArgs,
      });
    }
  }
  
  // Detect pattern: Rapid-fire commands from multiple new users
  const rapidCommands = recentCommands.filter(cmd => now - cmd.timestamp < 10000); // 10 seconds
  const rapidUsers = new Set(rapidCommands.map(cmd => cmd.userId));
  
  if (rapidUsers.size >= minUsers && rapidCommands.length >= minUsers * 2) {
    logSuspiciousActivity(guildId, {
      pattern: 'coordinated_burst',
      users: Array.from(rapidUsers),
      timestamp: now,
      commandName,
      details: `${rapidUsers.size} users fired ${rapidCommands.length} commands within 10 seconds`,
    });
  }
}

/**
 * Log suspicious activity for admin review
 * @param {string} guildId - Guild ID
 * @param {object} activity - Activity details
 */
function logSuspiciousActivity(guildId, activity) {
  if (!suspiciousActivityLog.has(guildId)) {
    suspiciousActivityLog.set(guildId, []);
  }
  
  const log = suspiciousActivityLog.get(guildId);
  
  // Avoid duplicate logs for the same pattern within 5 minutes
  const recentSimilar = log.find(
    entry =>
      entry.pattern === activity.pattern &&
      entry.commandName === activity.commandName &&
      Date.now() - entry.timestamp < 5 * 60 * 1000
  );
  
  if (!recentSimilar) {
    log.push(activity);
    console.log(`[Pattern Detection] Suspicious activity in guild ${guildId}:`, activity.details);
  }
}

/**
 * Get suspicious activity log for a guild
 * @param {string} guildId - Guild ID
 * @param {number} limit - Maximum number of entries to return
 * @returns {Array} Suspicious activities
 */
export function getSuspiciousActivity(guildId, limit = 10) {
  const log = suspiciousActivityLog.get(guildId) || [];
  return log.slice(-limit).reverse(); // Most recent first
}

/**
 * Clear suspicious activity log for a guild
 * @param {string} guildId - Guild ID
 */
export function clearSuspiciousActivity(guildId) {
  return suspiciousActivityLog.delete(guildId);
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

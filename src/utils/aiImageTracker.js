import { loadGuildConfig } from './guildConfig.js';

/**
 * AI Image Generation Tracker
 * Tracks usage, enforces limits, and provides statistics
 */

/**
 * Per-user cooldowns
 * Structure: Map<guildId, Map<userId, timestamp>>
 */
const userCooldowns = new Map();

/**
 * Per-user daily usage
 * Structure: Map<guildId, Map<userId, {count: number, date: string}>>
 */
const userDailyUsage = new Map();

/**
 * Per-guild daily usage
 * Structure: Map<guildId, {count: number, date: string, cost: number}>
 */
const guildDailyUsage = new Map();

/**
 * Check if a user can generate an image
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {boolean} isAdmin - Whether user is admin/moderator
 * @returns {Object} { allowed: boolean, reason?: string, retryAfter?: number, userUsage?: number, guildUsage?: number, whitelisted?: boolean }
 */
export function canGenerateImage(guildId, userId, isAdmin = false) {
  const config = loadGuildConfig(guildId);
  const limits = config.rateLimits?.aiImages || {
    enabled: true,
    perUserCooldown: 300,
    perUserDailyLimit: 10,
    perGuildDailyLimit: 50,
    adminsBypassCooldown: true,
    whitelistedUsers: [],
  };

  // Check if user is whitelisted (bypasses ALL limits)
  if (limits.whitelistedUsers && limits.whitelistedUsers.includes(userId)) {
    return { allowed: true, whitelisted: true };
  }

  if (!limits.enabled) {
    return { allowed: true };
  }

  const now = Date.now();
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // Check per-user cooldown (admins can bypass if configured)
  if (!(isAdmin && limits.adminsBypassCooldown)) {
    const guildCooldowns = userCooldowns.get(guildId);
    if (guildCooldowns) {
      const lastUsage = guildCooldowns.get(userId);
      if (lastUsage) {
        const cooldownMs = limits.perUserCooldown * 1000;
        const timeSinceLastUsage = now - lastUsage;
        if (timeSinceLastUsage < cooldownMs) {
          const retryAfter = Math.ceil((cooldownMs - timeSinceLastUsage) / 1000);
          return {
            allowed: false,
            reason: `Please wait ${formatDuration(retryAfter)} before generating another image.`,
            retryAfter,
          };
        }
      }
    }
  }

  // Check per-user daily limit
  const guildUserUsage = userDailyUsage.get(guildId);
  let userUsageCount = 0;
  if (guildUserUsage) {
    const userUsage = guildUserUsage.get(userId);
    if (userUsage) {
      // Reset if it's a new day
      if (userUsage.date !== today) {
        userUsage.count = 0;
        userUsage.date = today;
      }
      userUsageCount = userUsage.count;
      if (userUsageCount >= limits.perUserDailyLimit) {
        return {
          allowed: false,
          reason: `You've reached your daily limit of ${limits.perUserDailyLimit} AI images. Resets at midnight.`,
          userUsage: userUsageCount,
        };
      }
    }
  }

  // Check per-guild daily limit
  const guildUsage = guildDailyUsage.get(guildId);
  let guildUsageCount = 0;
  if (guildUsage) {
    // Reset if it's a new day
    if (guildUsage.date !== today) {
      guildUsage.count = 0;
      guildUsage.date = today;
      guildUsage.cost = 0;
    }
    guildUsageCount = guildUsage.count;
    if (guildUsageCount >= limits.perGuildDailyLimit) {
      return {
        allowed: false,
        reason: `This server has reached its daily limit of ${limits.perGuildDailyLimit} AI images. Resets at midnight.`,
        guildUsage: guildUsageCount,
      };
    }
  }

  return {
    allowed: true,
    userUsage: userUsageCount,
    guildUsage: guildUsageCount,
  };
}

/**
 * Record an image generation
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {string} commandName - Command name (image or bracket-image)
 * @param {Object} metadata - Additional metadata (titles, prompt, etc.)
 */
export function recordImageGeneration(guildId, userId, commandName, metadata = {}) {
  const config = loadGuildConfig(guildId);
  const limits = config.rateLimits?.aiImages || {};
  const costPerImage = limits.costPerImage || 0.04;

  const now = Date.now();
  const today = new Date().toISOString().split('T')[0];

  // Record cooldown
  if (!userCooldowns.has(guildId)) {
    userCooldowns.set(guildId, new Map());
  }
  userCooldowns.get(guildId).set(userId, now);

  // Record per-user daily usage
  if (!userDailyUsage.has(guildId)) {
    userDailyUsage.set(guildId, new Map());
  }
  const guildUserUsage = userDailyUsage.get(guildId);
  if (!guildUserUsage.has(userId)) {
    guildUserUsage.set(userId, { count: 0, date: today });
  }
  const userUsage = guildUserUsage.get(userId);
  if (userUsage.date !== today) {
    userUsage.count = 0;
    userUsage.date = today;
  }
  userUsage.count++;

  // Record per-guild daily usage
  if (!guildDailyUsage.has(guildId)) {
    guildDailyUsage.set(guildId, { count: 0, date: today, cost: 0 });
  }
  const guildUsage = guildDailyUsage.get(guildId);
  if (guildUsage.date !== today) {
    guildUsage.count = 0;
    guildUsage.date = today;
    guildUsage.cost = 0;
  }
  guildUsage.count++;
  guildUsage.cost += costPerImage;

  // Log for analytics
  console.log(`[AI Image] ${commandName} - Guild: ${guildId}, User: ${userId}, Cost: $${costPerImage.toFixed(2)}, User Today: ${userUsage.count}, Guild Today: ${guildUsage.count}, Guild Cost Today: $${guildUsage.cost.toFixed(2)}`);
}

/**
 * Get usage statistics for a guild
 * @param {string} guildId - Guild ID
 * @returns {Object} Usage statistics
 */
export function getGuildImageStats(guildId) {
  const config = loadGuildConfig(guildId);
  const limits = config.rateLimits?.aiImages || {
    perUserDailyLimit: 10,
    perGuildDailyLimit: 50,
    costPerImage: 0.04,
  };

  const today = new Date().toISOString().split('T')[0];
  const guildUsage = guildDailyUsage.get(guildId);

  let count = 0;
  let cost = 0;
  if (guildUsage && guildUsage.date === today) {
    count = guildUsage.count;
    cost = guildUsage.cost;
  }

  return {
    todayCount: count,
    todayCost: cost,
    dailyLimit: limits.perGuildDailyLimit,
    remaining: Math.max(0, limits.perGuildDailyLimit - count),
    percentUsed: limits.perGuildDailyLimit > 0 ? (count / limits.perGuildDailyLimit * 100).toFixed(1) : 0,
  };
}

/**
 * Get usage statistics for a user
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @returns {Object} Usage statistics
 */
export function getUserImageStats(guildId, userId) {
  const config = loadGuildConfig(guildId);
  const limits = config.rateLimits?.aiImages || {
    perUserDailyLimit: 10,
    perUserCooldown: 300,
  };

  const now = Date.now();
  const today = new Date().toISOString().split('T')[0];

  // Get daily usage
  const guildUserUsage = userDailyUsage.get(guildId);
  let count = 0;
  if (guildUserUsage) {
    const userUsage = guildUserUsage.get(userId);
    if (userUsage && userUsage.date === today) {
      count = userUsage.count;
    }
  }

  // Get cooldown status
  const guildCooldowns = userCooldowns.get(guildId);
  let cooldownRemaining = 0;
  if (guildCooldowns) {
    const lastUsage = guildCooldowns.get(userId);
    if (lastUsage) {
      const cooldownMs = limits.perUserCooldown * 1000;
      const timeSinceLastUsage = now - lastUsage;
      if (timeSinceLastUsage < cooldownMs) {
        cooldownRemaining = Math.ceil((cooldownMs - timeSinceLastUsage) / 1000);
      }
    }
  }

  return {
    todayCount: count,
    dailyLimit: limits.perUserDailyLimit,
    remaining: Math.max(0, limits.perUserDailyLimit - count),
    cooldownRemaining,
    cooldownDuration: limits.perUserCooldown,
  };
}

/**
 * Reset usage for a user (admin command)
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 */
export function resetUserImageUsage(guildId, userId) {
  const guildUserUsage = userDailyUsage.get(guildId);
  if (guildUserUsage && guildUserUsage.has(userId)) {
    guildUserUsage.delete(userId);
  }

  const guildCooldowns = userCooldowns.get(guildId);
  if (guildCooldowns && guildCooldowns.has(userId)) {
    guildCooldowns.delete(userId);
  }
}

/**
 * Reset guild usage (admin command)
 * @param {string} guildId - Guild ID
 */
export function resetGuildImageUsage(guildId) {
  if (guildDailyUsage.has(guildId)) {
    const guildUsage = guildDailyUsage.get(guildId);
    guildUsage.count = 0;
    guildUsage.cost = 0;
    guildUsage.date = new Date().toISOString().split('T')[0];
  }
}

/**
 * Format duration in human-readable format
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration
 */
function formatDuration(seconds) {
  if (seconds < 60) {
    return `${seconds} second${seconds !== 1 ? 's' : ''}`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (remainingSeconds === 0) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }
  return `${minutes} minute${minutes !== 1 ? 's' : ''} and ${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
}

/**
 * Clean up old data periodically
 */
setInterval(() => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  // Clean up old daily usage data
  for (const [guildId, guildUserUsage] of userDailyUsage) {
    for (const [userId, usage] of guildUserUsage) {
      if (usage.date < yesterdayStr) {
        guildUserUsage.delete(userId);
      }
    }
  }

  for (const [guildId, usage] of guildDailyUsage) {
    if (usage.date < yesterdayStr) {
      usage.count = 0;
      usage.cost = 0;
      usage.date = new Date().toISOString().split('T')[0];
    }
  }

  // Clean up old cooldowns (older than 1 hour)
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  for (const [guildId, guildCooldowns] of userCooldowns) {
    for (const [userId, timestamp] of guildCooldowns) {
      if (timestamp < oneHourAgo) {
        guildCooldowns.delete(userId);
      }
    }
  }
}, 5 * 60 * 1000); // Run every 5 minutes

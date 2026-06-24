import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configDir = path.join(__dirname, '../../guild_configs');

// Default configuration for new guilds
const defaultConfig = {
  services: {
    imdb: true,
    letterboxd: true,
    trakt: true,
    rottenTomatoes: true,
    justWatch: true,
  },
  emojis: {
    imdb: '',
    letterboxd: '',
    trakt: '',
    rtCritics: '',
    justWatch: '',
  },
  region: 'US', // Default region for streaming availability (ISO 3166-1 country code)
  maxSearchResults: 20, // Maximum number of search results to display in selection menus (1-50)
  stats: {
    enabled: true,
    trackMovies: true,
    trackShows: true,
    trackEpisodes: true,
    trackGames: true,
    trackBoardGames: true,
    trackBooks: true,
  },
  commandPermissions: {
    enabled: true, // Master switch - when false, only admin commands work
    movie: true,
    tv: true,
    episode: true,
    game: true,
    boardgame: true,
    book: true,
    survey: true,
    soundtrack: true,
    bracket: true,
  },
  notifications: {
    restartAnnouncements: false, // Send announcements when bot restarts with active timers
  },
  watchPartyChannels: [], // Channel IDs where watch party timers can auto-detect event titles
  administrators: [], // Will be populated with server owner/admins
  rateLimits: {
    enabled: true, // Master switch for rate limiting
    bypassForModerators: true, // Allow moderators/admins to bypass rate limits
    global: {
      maxRequests: 1, // Maximum number of requests
      windowSeconds: 20, // Time window in seconds
    },
    commands: {
      // Per-command overrides (optional)
      // 'movie': { maxRequests: 3, windowSeconds: 30 },
      // 'episode-list': { maxRequests: 2, windowSeconds: 60 },
    },
    guildWide: {
      enabled: true, // Server-wide rate limiting (prevents multi-account flooding)
      maxRequests: 10, // Maximum total commands across all users
      windowSeconds: 60, // Time window in seconds
    },
    patternDetection: {
      enabled: true, // Detect suspicious coordinated activity
      windowSeconds: 60, // Window for detecting patterns
      minUsers: 3, // Minimum users needed to flag as suspicious
    },
  },
  moderation: {
    enabled: false, // Master switch for all moderation features
    whitelist: {
      enabled: false, // Whitelist mode - only allow specific roles/users
      allowedRoles: [], // Role IDs that can use commands
      allowedUsers: [], // User IDs that can use commands
    },
    autoBan: {
      enabled: false, // Auto-notify when users exceed violation threshold
      violationCount: 20, // Number of violations to trigger notification
      windowHours: 24, // Time window in hours
    },
  },
  potionResponses: {
    // Custom potion responses by type
    // Format: { type: [response1, response2, ...] }
    // Responses use {giver} and {receiver} as placeholders
    // Example: { health: ["Custom healing message!"] }
  },
  potionThemes: null, // null = all themes active, or array of active theme keys
};

/**
 * Ensure the config directory exists
 */
async function ensureConfigDir() {
  try {
    await fs.access(configDir);
  } catch {
    await fs.mkdir(configDir, { recursive: true });
  }
}

/**
 * Get the config file path for a guild
 */
function getConfigPath(guildId) {
  return path.join(configDir, `${guildId}.json`);
}

/**
 * Load guild configuration
 */
export async function loadGuildConfig(guildId) {
  await ensureConfigDir();
  const configPath = getConfigPath(guildId);
  
  try {
    const data = await fs.readFile(configPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // If config doesn't exist, return default
    return { ...defaultConfig };
  }
}

/**
 * Save guild configuration
 */
export async function saveGuildConfig(guildId, config) {
  await ensureConfigDir();
  const configPath = getConfigPath(guildId);
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
}

/**
 * Check if a user is an administrator or moderator
 * Users with these Discord permissions are considered admins for bot configuration:
 * - Administrator (full server control)
 * - ManageGuild (Manage Server - can modify server settings)
 * - ModerateMembers (Timeout Members - typical moderator permission)
 * - KickMembers (can kick users)
 * - BanMembers (can ban users)
 */
export function isAdmin(member) {
  if (!member) return false;
  
  // Check Discord permissions - admins and typical moderator permissions
  return member.permissions.has('Administrator') ||
         member.permissions.has('ManageGuild') ||
         member.permissions.has('ModerateMembers') ||
         member.permissions.has('KickMembers') ||
         member.permissions.has('BanMembers');
}

/**
 * Update service toggle
 */
export async function toggleService(guildId, serviceName, enabled) {
  const config = await loadGuildConfig(guildId);
  
  if (config.services.hasOwnProperty(serviceName)) {
    config.services[serviceName] = enabled;
    await saveGuildConfig(guildId, config);
    return true;
  }
  
  return false;
}

/**
 * Get enabled services for a guild
 */
export async function getEnabledServices(guildId) {
  const config = await loadGuildConfig(guildId);
  return config.services;
}

/**
 * Update emoji for a service
 */
export async function setEmoji(guildId, serviceName, emojiId) {
  const config = await loadGuildConfig(guildId);
  
  if (config.emojis.hasOwnProperty(serviceName)) {
    config.emojis[serviceName] = emojiId;
    await saveGuildConfig(guildId, config);
    return true;
  }
  
  return false;
}

/**
 * Get emojis configuration for a guild
 */
export async function getEmojis(guildId) {
  const config = await loadGuildConfig(guildId);
  return config.emojis;
}

/**
 * Get stats configuration for a guild
 */
export async function getStatsConfig(guildId) {
  const config = await loadGuildConfig(guildId);
  return config.stats;
}

/**
 * Update stats tracking setting
 */
export async function updateStatsTracking(guildId, setting, enabled) {
  const config = await loadGuildConfig(guildId);
  
  if (setting === 'enabled') {
    config.stats.enabled = enabled;
  } else if (setting === 'trackMovies') {
    config.stats.trackMovies = enabled;
  } else if (setting === 'trackShows') {
    config.stats.trackShows = enabled;
  } else if (setting === 'trackEpisodes') {
    config.stats.trackEpisodes = enabled;
  } else if (setting === 'trackGames') {
    config.stats.trackGames = enabled;
  } else if (setting === 'trackBoardGames') {
    config.stats.trackBoardGames = enabled;
  } else if (setting === 'trackBooks') {
    config.stats.trackBooks = enabled;
  } else {
    return false;
  }
  
  await saveGuildConfig(guildId, config);
  return true;
}

/**
 * Get command permissions configuration for a guild
 */
export async function getCommandPermissions(guildId) {
  const config = await loadGuildConfig(guildId);
  return config.commandPermissions;
}

/**
 * Update command permission setting
 */
export async function updateCommandPermission(guildId, setting, enabled) {
  const config = await loadGuildConfig(guildId);
  
  if (setting === 'enabled') {
    config.commandPermissions.enabled = enabled;
  } else if (setting === 'movie' || setting === 'tv' || setting === 'episode' || setting === 'game' || setting === 'boardgame' || setting === 'book' || setting === 'survey') {
    config.commandPermissions[setting] = enabled;
  } else {
    return false;
  }
  
  await saveGuildConfig(guildId, config);
  return true;
}

/**
 * Check if a user can use a specific command
 * Admins can always use commands
 */
export async function canUseCommand(guildId, member, commandName) {
  // Admins can always use commands
  if (isAdmin(member)) {
    return true;
  }
  
  const config = await loadGuildConfig(guildId);
  
  // If commands are disabled entirely, regular users can't use them
  if (!config.commandPermissions.enabled) {
    return false;
  }
  
  // Check specific command permission
  if (commandName === 'movie' || commandName === 'tv' || commandName === 'episode' || commandName === 'survey') {
    return config.commandPermissions[commandName] === true;
  }
  
  // Admin-only commands (eggshen-config, eggshen-stats) are handled by isAdmin check above
  // Other commands (eggshen-help) are always allowed
  return true;
}

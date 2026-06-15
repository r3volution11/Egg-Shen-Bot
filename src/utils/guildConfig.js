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
  administrators: [], // Will be populated with server owner/admins
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
 * Check if a user is an administrator
 * Users with Discord "Manage Server" or "Administrator" permissions are always admins
 */
export function isAdmin(member) {
  if (!member) return false;
  
  // Check Discord permissions
  return member.permissions.has('ManageGuild') || member.permissions.has('Administrator');
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

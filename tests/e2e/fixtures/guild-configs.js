import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Matches guildConfig.js's configDir: <repo root>/guild_configs
const GUILD_CONFIGS_DIR = path.join(__dirname, '../../../guild_configs');

function configPath(guildId) {
  return path.join(GUILD_CONFIGS_DIR, `${guildId}.json`);
}

/**
 * Writes real guild_configs/<id>.json files for each guild that has a
 * `config` (guilds with `config: null`, e.g. GUILD_NO_CONFIG, are
 * intentionally skipped so loadGuildConfig() falls back to its default).
 */
export async function writeFixtureGuildConfigs(guilds) {
  await fs.mkdir(GUILD_CONFIGS_DIR, { recursive: true });
  for (const guild of guilds) {
    if (!guild.config) continue;
    const body = { eventRequests: guild.config };
    await fs.writeFile(configPath(guild.id), JSON.stringify(body, null, 2), 'utf8');
  }
}

/** Removes any fixture config files this harness wrote, for every guild in the list. */
export async function removeFixtureGuildConfigs(guilds) {
  for (const guild of guilds) {
    await fs.rm(configPath(guild.id), { force: true });
  }
}

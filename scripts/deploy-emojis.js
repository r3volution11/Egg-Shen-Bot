/**
 * Upload the emoji kit to this bot's application by hand.
 *
 * The bot already does this on startup (src/utils/emojiSync.js), so most
 * operators never need it. It's here to check what's uploaded without
 * starting the bot, and to prune: old versions of the art are never
 * deleted automatically, because messages already posted point at them by
 * id and would show raw `:es_…:` text if they vanished.
 *
 *   npm run deploy-emojis                 upload whatever is missing
 *   npm run deploy-emojis -- --dry-run    only report
 *   npm run deploy-emojis -- --prune      also delete superseded versions
 *                                         older than 30 days
 *
 * Use a separate Discord application for development if you can: emojis
 * belong to the application, so a dev bot sharing prod's application
 * uploads its experiments into prod's emoji list.
 */

import { REST, Routes } from 'discord.js';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig();
const { config } = await import('../src/config.js');
const { syncKit, loadManifest, restEmojiManager, kitName } = await import('../src/utils/emojiSync.js');

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const prune = args.has('--prune');

const manifest = loadManifest();
if (!manifest) {
  console.error('No assets/emojis/manifest.json. Run `npm run build:emojis` first.');
  process.exit(1);
}
if (!config.discord.token || !config.discord.clientId) {
  console.error('DISCORD_TOKEN and DISCORD_CLIENT_ID must be set (see .env.example).');
  process.exit(1);
}

const rest = new REST().setToken(config.discord.token);
const manager = restEmojiManager(rest, Routes, config.discord.clientId);

const res = await syncKit(manager, { manifest, upload: !dryRun, prune: prune && !dryRun, log: (m) => console.warn(m) });
const total = Object.keys(manifest).length;

console.log(`Kit: ${total} emojis · ${res.resolved.size} uploaded${dryRun ? '' : ` (${res.created.length} just now${res.adopted.length ? `, ${res.adopted.length} adopted` : ''})`}`);
if (res.missing.length) console.log(`Missing: ${res.missing.map(c => kitName(c, manifest[c].hash)).join(', ')}`);
for (const f of res.failed) console.log(`Failed: ${f.code}: ${f.message}`);
if (res.stale.length) {
  console.log(`Older versions kept: ${res.stale.length}${prune ? '' : ' (delete those older than 30 days with --prune)'}`);
}
if (res.deleted.length) console.log(`Deleted: ${res.deleted.map(e => e.name).join(', ')}`);
process.exit(res.failed.length ? 1 : 0);

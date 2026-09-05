#!/usr/bin/env node
/**
 * One-time migration: moves eventRequests.websiteUrl/webTheme (introduced in
 * v2.29.0) into the new top-level website.url/theme namespace (v2.29.1+),
 * across every guild_configs/*.json on disk. Safe to run more than once —
 * a file with neither field set is left untouched.
 *
 * Usage: node scripts/migrate-website-config.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_DIR = path.join(__dirname, '../guild_configs');

export function main() {
  if (!fs.existsSync(CONFIG_DIR)) {
    console.log('No guild_configs/ directory — nothing to migrate.');
    return;
  }

  const files = fs.readdirSync(CONFIG_DIR).filter(f => f.endsWith('.json'));
  let migrated = 0;

  for (const file of files) {
    const filePath = path.join(CONFIG_DIR, file);
    const config = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const eventRequests = config.eventRequests || {};

    if (eventRequests.websiteUrl === undefined && eventRequests.webTheme === undefined) {
      continue;
    }

    config.website = config.website || {};
    if (eventRequests.websiteUrl !== undefined) {
      config.website.url = eventRequests.websiteUrl;
      delete config.eventRequests.websiteUrl;
    }
    if (eventRequests.webTheme !== undefined) {
      config.website.theme = eventRequests.webTheme;
      delete config.eventRequests.webTheme;
    }

    fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
    console.log(`✓ Migrated ${file} — website.url=${JSON.stringify(config.website.url)} website.theme=${JSON.stringify(config.website.theme)}`);
    migrated++;
  }

  console.log(`Done. ${migrated} of ${files.length} guild config(s) migrated.`);
}

main();

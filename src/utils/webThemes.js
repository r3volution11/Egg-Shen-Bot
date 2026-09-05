/**
 * Reads scripts/web-themes.json — the manifest of named color themes a
 * self-hoster can assign per-guild (see /eggshen-config-events event-requests
 * web-theme). Kept separate from scripts/generate-palette.js's own
 * loadThemeManifest (which resolves each theme's actual color for the build
 * step) since runtime code here only needs the set of valid theme names.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MANIFEST_PATH = path.join(__dirname, '../../scripts/web-themes.json');

/**
 * @returns {string[]} valid theme names, e.g. ['default', 'shudder']
 */
export function listThemeNames() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  return Object.keys(manifest);
}

/**
 * @param {string} name
 * @returns {boolean}
 */
export function isValidTheme(name) {
  return listThemeNames().includes(name);
}

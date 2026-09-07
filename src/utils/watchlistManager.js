/**
 * Watchlist Management System
 *
 * The server's queue of things it intends to watch — the step between
 * deciding (a bracket champion, a survey result) and watching (/watched).
 * One JSON file per guild, mirroring watchHistoryManager's storage shape.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Overridable via GUILD_WATCHLISTS_DIR so parallel Jest workers (each test file
// runs in its own process) can point at a unique directory instead of racing on
// the same real one — unset in production, where the default applies.
const WATCHLIST_DIR = process.env.GUILD_WATCHLISTS_DIR || path.join(__dirname, '../../guild_watchlists');

/** Hard ceiling regardless of guild config, to keep a file readable and embeds sane. */
export const MAX_WATCHLIST_SIZE = 500;

/** Default cap when a guild hasn't configured one. */
export const DEFAULT_MAX_SIZE = 100;

async function ensureWatchlistDir() {
  try {
    await fs.mkdir(WATCHLIST_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating watchlist directory:', error);
  }
}

function getWatchlistPath(guildId) {
  return path.join(WATCHLIST_DIR, `${guildId}_watchlist.json`);
}

/**
 * Read a guild's watchlist.
 * @param {string} guildId
 * @returns {Promise<Array>} Entries, newest first. Empty array if none yet.
 */
export async function getWatchlist(guildId) {
  try {
    const data = await fs.readFile(getWatchlistPath(guildId), 'utf8');
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    console.error('Error reading watchlist:', error);
    return [];
  }
}

async function writeWatchlist(guildId, entries) {
  await ensureWatchlistDir();
  await fs.writeFile(getWatchlistPath(guildId), JSON.stringify(entries, null, 2), 'utf8');
}

/**
 * Identity for a watchlist entry. TMDb ids are only unique within a media
 * type — a movie and a show can share id 1396 — so the type is part of the key.
 */
function sameTitle(entry, tmdbId, type) {
  return String(entry.tmdbId) === String(tmdbId) && entry.type === type;
}

/**
 * Add a title to the watchlist.
 * @param {string} guildId
 * @param {Object} entry - { tmdbId, type, title, year, posterUrl, note, addedBy, addedById }
 * @param {number} maxSize - Guild's configured cap
 * @returns {Promise<{success: boolean, error?: string, entry?: Object, total?: number}>}
 */
export async function addToWatchlist(guildId, entry, maxSize = DEFAULT_MAX_SIZE) {
  const entries = await getWatchlist(guildId);

  const duplicate = entries.find(e => sameTitle(e, entry.tmdbId, entry.type));
  if (duplicate) {
    return {
      success: false,
      error: `**${duplicate.title}** is already on the watchlist — added by ${duplicate.addedBy}.`,
    };
  }

  const cap = Math.min(maxSize || DEFAULT_MAX_SIZE, MAX_WATCHLIST_SIZE);
  if (entries.length >= cap) {
    return {
      success: false,
      error: `The watchlist is full (${cap} titles). Remove something first, or raise the cap with \`/eggshen-config-watch-party watchlist max-size\`.`,
    };
  }

  const newEntry = {
    tmdbId: entry.tmdbId,
    type: entry.type,
    title: entry.title,
    year: entry.year || null,
    posterUrl: entry.posterUrl || null,
    note: entry.note || null,
    addedBy: entry.addedBy,
    addedById: entry.addedById,
    addedAt: Date.now(),
    // User IDs who have voted this up via /watchlist want.
    wantedBy: [],
    // Set when the title arrives from somewhere other than a manual add
    // (currently a tournament champion), so the list can show why it's there.
    source: entry.source || null,
  };

  entries.unshift(newEntry);
  await writeWatchlist(guildId, entries);

  return { success: true, entry: newEntry, total: entries.length };
}

/**
 * Remove a title by TMDb id + type.
 * @returns {Promise<{success: boolean, error?: string, removed?: Object}>}
 */
export async function removeFromWatchlist(guildId, tmdbId, type) {
  const entries = await getWatchlist(guildId);
  const index = entries.findIndex(e => sameTitle(e, tmdbId, type));

  if (index === -1) {
    return { success: false, error: 'That title is not on the watchlist.' };
  }

  const [removed] = entries.splice(index, 1);
  await writeWatchlist(guildId, entries);

  return { success: true, removed };
}

/**
 * Toggle a "want to watch" vote for a user.
 * @returns {Promise<{success: boolean, error?: string, entry?: Object, added?: boolean}>}
 */
export async function toggleWant(guildId, tmdbId, type, userId) {
  const entries = await getWatchlist(guildId);
  const entry = entries.find(e => sameTitle(e, tmdbId, type));

  if (!entry) {
    return { success: false, error: 'That title is not on the watchlist.' };
  }

  // Older entries predate this field.
  if (!Array.isArray(entry.wantedBy)) entry.wantedBy = [];

  const existing = entry.wantedBy.indexOf(userId);
  const added = existing === -1;

  if (added) {
    entry.wantedBy.push(userId);
  } else {
    entry.wantedBy.splice(existing, 1);
  }

  await writeWatchlist(guildId, entries);
  return { success: true, entry, added };
}

/** Vote count, tolerating entries written before wantedBy existed. */
export function wantCount(entry) {
  return Array.isArray(entry.wantedBy) ? entry.wantedBy.length : 0;
}

/**
 * Filter and sort a watchlist for display.
 * @param {Array} entries
 * @param {Object} options - { filter: 'all'|'movie'|'tv', sort: 'recent'|'oldest'|'votes' }
 * @returns {Array} A new array; the input is not mutated.
 */
export function sortWatchlist(entries, { filter = 'all', sort = 'recent' } = {}) {
  let result = filter === 'all' ? [...entries] : entries.filter(e => e.type === filter);

  if (sort === 'votes') {
    // Ties fall back to recency so the order is stable and predictable.
    result.sort((a, b) => (wantCount(b) - wantCount(a)) || (b.addedAt - a.addedAt));
  } else if (sort === 'oldest') {
    result.sort((a, b) => a.addedAt - b.addedAt);
  } else {
    result.sort((a, b) => b.addedAt - a.addedAt);
  }

  return result;
}

/**
 * Pick one title to watch.
 * @param {Array} entries
 * @param {Object} options - { method: 'random'|'votes'|'oldest', filter }
 * @returns {Object|null} The picked entry, or null if nothing matches.
 */
export function pickFromWatchlist(entries, { method = 'random', filter = 'all' } = {}) {
  const pool = filter === 'all' ? entries : entries.filter(e => e.type === filter);
  if (pool.length === 0) return null;

  if (method === 'random') {
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // 'votes' and 'oldest' are just the head of the corresponding sort.
  return sortWatchlist(pool, { filter: 'all', sort: method })[0];
}

/**
 * Remove every entry for a guild.
 * @returns {Promise<number>} How many entries were cleared.
 */
export async function clearWatchlist(guildId) {
  const entries = await getWatchlist(guildId);
  if (entries.length === 0) return 0;

  await writeWatchlist(guildId, []);
  return entries.length;
}

/**
 * Find watchlist entries whose title loosely matches a query.
 * Backs the autocomplete on /watchlist remove and /watchlist want.
 * @param {string} guildId
 * @param {string} query
 * @param {number} limit - Discord accepts at most 25 autocomplete choices
 * @returns {Promise<Array>}
 */
export async function searchWatchlist(guildId, query, limit = 25) {
  const entries = await getWatchlist(guildId);
  const needle = (query || '').trim().toLowerCase();

  const matches = needle
    ? entries.filter(e => e.title.toLowerCase().includes(needle))
    : entries;

  return matches.slice(0, limit);
}

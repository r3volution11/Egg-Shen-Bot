/**
 * Rotating status quote store — backs the same content presenceScheduler.js
 * used to read from a static movieQuotes.js array. Kept in a gitignored JSON
 * file (mirrors guildConfig.js/eventImageStore.js's read/write shape) so it
 * can be edited at runtime — via /quotes-admin or the eggshen-config-quotes
 * command, see server.js/eggshen-config-quotes.js — without a code change or
 * redeploy. movieQuotes.js's array is now only the seed used the first time
 * this file doesn't exist yet.
 *
 * Each quote is stored as { title?, text, author? } — text is the only
 * required field; title/author are omitted (not empty strings) when unset.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { MOVIE_QUOTES as DEFAULT_QUOTES } from './movieQuotes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Overridable via MOVIE_QUOTES_FILE so parallel Jest workers (each test file
// runs in its own process) can point at a unique path instead of racing on
// the same real file — unset in production, where the default applies.
const QUOTES_FILE = process.env.MOVIE_QUOTES_FILE || path.join(__dirname, '../../movie_quotes.json');

/**
 * Normalizes a single quote entry into the canonical { title?, text, author? }
 * shape, trimming strings and dropping empty optional fields. Throws if the
 * entry has no usable quote text.
 * @param {any} entry
 * @returns {{ title?: string, text: string, author?: string }}
 */
function normalizeQuote(entry) {
  // Migration path: entries written before the structured upgrade are plain
  // strings.
  if (typeof entry === 'string') {
    entry = { text: entry };
  }

  if (!entry || typeof entry !== 'object' || typeof entry.text !== 'string' || !entry.text.trim()) {
    throw new Error('Each quote must have non-empty text');
  }

  const normalized = { text: entry.text.trim() };
  if (typeof entry.title === 'string' && entry.title.trim()) {
    normalized.title = entry.title.trim();
  }
  if (typeof entry.author === 'string' && entry.author.trim()) {
    normalized.author = entry.author.trim();
  }
  return normalized;
}

async function saveQuotes(quotes) {
  if (!Array.isArray(quotes)) {
    throw new Error('Quotes must be an array');
  }
  const normalized = quotes.map(normalizeQuote);
  await fs.writeFile(QUOTES_FILE, JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
}

/**
 * Loads the quote list, seeding it from movieQuotes.js's default array the
 * first time the file doesn't exist yet. Transparently upgrades any
 * plain-string entries left over from before the structured-quote upgrade,
 * persisting the migrated shape back so this only happens once.
 * @returns {Promise<{ title?: string, text: string, author?: string }[]>}
 */
export async function loadQuotes() {
  try {
    const data = await fs.readFile(QUOTES_FILE, 'utf8');
    const quotes = JSON.parse(data);
    if (Array.isArray(quotes) && quotes.some(q => typeof q === 'string')) {
      return saveQuotes(quotes);
    }
    return quotes;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Error reading movie quotes file:', error);
      return [];
    }
    return saveQuotes(DEFAULT_QUOTES);
  }
}

/**
 * Replaces the entire quote list.
 * @param {Array} quotes
 * @returns {Promise<{ title?: string, text: string, author?: string }[]>}
 */
export async function setQuotes(quotes) {
  return saveQuotes(quotes);
}

/**
 * Replaces the entire quote list atomically — validates every entry before
 * writing anything, so a single bad row doesn't partially apply. Used by the
 * quotes-admin bulk editor.
 * @param {Array} quotes
 * @returns {Promise<{ title?: string, text: string, author?: string }[]>}
 */
export async function replaceAllQuotes(quotes) {
  if (!Array.isArray(quotes)) {
    throw new Error('Quotes must be an array');
  }
  return saveQuotes(quotes);
}

/**
 * Appends a new quote.
 * @param {{ title?: string, text: string, author?: string }} quote
 * @returns {Promise<{ title?: string, text: string, author?: string }[]>} The full, updated list
 */
export async function addQuote(quote) {
  const normalized = normalizeQuote(quote);
  const quotes = await loadQuotes();
  quotes.push(normalized);
  return saveQuotes(quotes);
}

/**
 * Replaces the quote at the given index.
 * @param {number} index
 * @param {{ title?: string, text: string, author?: string }} quote
 * @returns {Promise<{ title?: string, text: string, author?: string }[]>} The full, updated list
 */
export async function updateQuote(index, quote) {
  const normalized = normalizeQuote(quote);
  const quotes = await loadQuotes();
  if (!Number.isInteger(index) || index < 0 || index >= quotes.length) {
    throw new Error('No quote exists at that index');
  }
  quotes[index] = normalized;
  return saveQuotes(quotes);
}

/**
 * Removes the quote at the given index.
 * @param {number} index
 * @returns {Promise<{ title?: string, text: string, author?: string }[]>} The full, updated list
 */
export async function deleteQuote(index) {
  const quotes = await loadQuotes();
  if (!Number.isInteger(index) || index < 0 || index >= quotes.length) {
    throw new Error('No quote exists at that index');
  }
  quotes.splice(index, 1);
  return saveQuotes(quotes);
}

/**
 * Rotating status quote store — backs the same content presenceScheduler.js
 * used to read from a static movieQuotes.js array. Kept in a gitignored JSON
 * file (mirrors guildConfig.js/eventImageStore.js's read/write shape) so it
 * can be edited at runtime — via /quotes-admin, see server.js — without a
 * code change or redeploy. movieQuotes.js's array is now only the seed used
 * the first time this file doesn't exist yet.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { MOVIE_QUOTES as DEFAULT_QUOTES } from './movieQuotes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const QUOTES_FILE = path.join(__dirname, '../../movie_quotes.json');

async function saveQuotes(quotes) {
  if (!Array.isArray(quotes) || quotes.some(q => typeof q !== 'string' || !q.trim())) {
    throw new Error('Quotes must be an array of non-empty strings');
  }
  await fs.writeFile(QUOTES_FILE, JSON.stringify(quotes, null, 2), 'utf8');
  return quotes;
}

/**
 * Loads the quote list, seeding it from movieQuotes.js's default array the
 * first time the file doesn't exist yet.
 * @returns {Promise<string[]>}
 */
export async function loadQuotes() {
  try {
    const data = await fs.readFile(QUOTES_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Error reading movie quotes file:', error);
      return [];
    }
    await saveQuotes(DEFAULT_QUOTES);
    return DEFAULT_QUOTES;
  }
}

/**
 * Replaces the entire quote list.
 * @param {string[]} quotes
 * @returns {Promise<string[]>}
 */
export async function setQuotes(quotes) {
  return saveQuotes(quotes);
}

/**
 * Appends a new quote.
 * @param {string} text
 * @returns {Promise<string[]>} The full, updated list
 */
export async function addQuote(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Quote text must be a non-empty string');
  }
  const quotes = await loadQuotes();
  quotes.push(text.trim());
  return saveQuotes(quotes);
}

/**
 * Replaces the quote at the given index.
 * @param {number} index
 * @param {string} text
 * @returns {Promise<string[]>} The full, updated list
 */
export async function updateQuote(index, text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Quote text must be a non-empty string');
  }
  const quotes = await loadQuotes();
  if (!Number.isInteger(index) || index < 0 || index >= quotes.length) {
    throw new Error('No quote exists at that index');
  }
  quotes[index] = text.trim();
  return saveQuotes(quotes);
}

/**
 * Removes the quote at the given index.
 * @param {number} index
 * @returns {Promise<string[]>} The full, updated list
 */
export async function deleteQuote(index) {
  const quotes = await loadQuotes();
  if (!Number.isInteger(index) || index < 0 || index >= quotes.length) {
    throw new Error('No quote exists at that index');
  }
  quotes.splice(index, 1);
  return saveQuotes(quotes);
}

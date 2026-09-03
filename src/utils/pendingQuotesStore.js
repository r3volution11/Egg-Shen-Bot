/**
 * Pending quote-suggestion queue — backs /suggest-quote. Suggestions land
 * here (not directly in movieQuotesStore.js's live rotation) until a
 * moderator approves or rejects them, either via the Discord moderation-
 * channel buttons (buttonHandler.js) or the /quotes-admin web page's
 * pending-suggestions section. Same gitignored-JSON read/write shape as
 * movieQuotesStore.js, kept as a separate file/store since suggestions are
 * a distinct, transient queue rather than part of the live quote list.
 *
 * Each entry carries a stable `id` (not just its array position) so a
 * Discord moderation button clicked after other suggestions have been
 * approved/rejected still resolves to the right entry, mirroring the
 * timestamp+random requestId pattern the event-request system uses for the
 * same reason.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { addQuote } from './movieQuotesStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Overridable via MOVIE_QUOTES_PENDING_FILE — see movieQuotesStore.js's
// MOVIE_QUOTES_FILE for why (parallel Jest workers need distinct paths).
const PENDING_FILE = process.env.MOVIE_QUOTES_PENDING_FILE || path.join(__dirname, '../../movie_quotes_pending.json');

function generateId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function savePending(pending) {
  await fs.writeFile(PENDING_FILE, JSON.stringify(pending, null, 2), 'utf8');
  return pending;
}

/**
 * Loads the pending-suggestion list.
 * @returns {Promise<Array<{ id: string, title?: string, text: string, author?: string, suggestedBy: string, guildId: string }>>}
 */
export async function loadPending() {
  try {
    const data = await fs.readFile(PENDING_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Error reading pending quotes file:', error);
    }
    return [];
  }
}

/**
 * Adds a new suggestion to the queue.
 * @param {{ title?: string, text: string, author?: string, suggestedBy: string, guildId: string }} suggestion
 * @returns {Promise<string>} The new entry's id, for use in moderation-message button custom IDs
 */
export async function addPending(suggestion) {
  if (typeof suggestion.text !== 'string' || !suggestion.text.trim()) {
    throw new Error('Quote text must be a non-empty string');
  }

  const entry = { id: generateId(), text: suggestion.text.trim() };
  if (typeof suggestion.title === 'string' && suggestion.title.trim()) {
    entry.title = suggestion.title.trim();
  }
  if (typeof suggestion.author === 'string' && suggestion.author.trim()) {
    entry.author = suggestion.author.trim();
  }
  entry.suggestedBy = suggestion.suggestedBy;
  entry.guildId = suggestion.guildId;

  const pending = await loadPending();
  pending.push(entry);
  await savePending(pending);
  return entry.id;
}

/**
 * Finds a pending suggestion by id.
 * @param {string} id
 * @returns {Promise<{ entry: object, pending: object[] } | null>}
 */
async function findPending(id) {
  const pending = await loadPending();
  const index = pending.findIndex(entry => entry.id === id);
  if (index === -1) return null;
  return { entry: pending[index], pending, index };
}

/**
 * Approves a pending suggestion: moves it into the live quote store (with
 * any moderator edits applied) and removes it from the queue.
 * @param {string} id
 * @param {{ title?: string, text?: string, author?: string }} [overrides] Moderator edits from the Edit modal
 * @returns {Promise<{ title?: string, text: string, author?: string }>} The quote as added to the live store
 */
export async function approvePending(id, overrides = {}) {
  const found = await findPending(id);
  if (!found) {
    throw new Error('No pending suggestion exists with that id');
  }
  const { entry, pending, index } = found;

  const quote = {
    title: overrides.title !== undefined ? overrides.title : entry.title,
    text: overrides.text !== undefined ? overrides.text : entry.text,
    author: overrides.author !== undefined ? overrides.author : entry.author,
  };

  const updatedQuotes = await addQuote(quote);
  pending.splice(index, 1);
  await savePending(pending);
  return updatedQuotes[updatedQuotes.length - 1];
}

/**
 * Rejects a pending suggestion: removes it from the queue without adding it
 * to the live store.
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function rejectPending(id) {
  const found = await findPending(id);
  if (!found) {
    throw new Error('No pending suggestion exists with that id');
  }
  const { pending, index } = found;
  pending.splice(index, 1);
  await savePending(pending);
}

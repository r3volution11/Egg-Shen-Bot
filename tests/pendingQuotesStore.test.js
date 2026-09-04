/**
 * Tests for src/utils/pendingQuotesStore.js — the review queue backing
 * /suggest-quote. Suggestions land here (not directly in the live quote
 * store) until a moderator approves or rejects them.
 *
 * Run with: npx jest tests/pendingQuotesStore.test.js --verbose
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';

// Distinct path per test file — see movieQuotesStore.test.js's comment for
// why (parallel Jest workers would otherwise race on the real file).
const QUOTES_FILE = path.join(process.cwd(), 'movie_quotes.pendingQuotesStore.test.json');
const PENDING_FILE = path.join(process.cwd(), 'movie_quotes_pending.pendingQuotesStore.test.json');
process.env.MOVIE_QUOTES_FILE = QUOTES_FILE;
process.env.MOVIE_QUOTES_PENDING_FILE = PENDING_FILE;

const { loadQuotes } = await import('../src/utils/movieQuotesStore.js');
const { loadPending, addPending, approvePending, rejectPending, countPendingBySuggester } = await import('../src/utils/pendingQuotesStore.js');

function cleanup() {
  if (fs.existsSync(QUOTES_FILE)) fs.rmSync(QUOTES_FILE);
  if (fs.existsSync(PENDING_FILE)) fs.rmSync(PENDING_FILE);
}

beforeEach(cleanup);
afterEach(cleanup);

function suggestion(overrides = {}) {
  return {
    text: 'A suggested quote.',
    suggestedBy: 'tester#0001',
    suggestedById: 'user-1',
    guildId: 'guild-1',
    ...overrides,
  };
}

describe('loadPending', () => {
  test('returns an empty array when no file exists yet', async () => {
    expect(await loadPending()).toEqual([]);
  });
});

describe('addPending', () => {
  test('adds an entry and returns its id', async () => {
    const id = await addPending(suggestion());

    expect(typeof id).toBe('string');
    const pending = await loadPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ id, text: 'A suggested quote.', suggestedBy: 'tester#0001', guildId: 'guild-1' });
  });

  test('stores title/author when given and omits them when blank', async () => {
    await addPending(suggestion({ title: 'The Thing', author: 'MacReady' }));
    await addPending(suggestion({ text: 'No metadata.', title: '', author: '' }));

    const pending = await loadPending();
    expect(pending[0]).toMatchObject({ title: 'The Thing', author: 'MacReady' });
    expect(pending[1].title).toBeUndefined();
    expect(pending[1].author).toBeUndefined();
  });

  test('assigns distinct ids to entries added in quick succession', async () => {
    const id1 = await addPending(suggestion({ text: 'First.' }));
    const id2 = await addPending(suggestion({ text: 'Second.' }));

    expect(id1).not.toBe(id2);
  });

  test('rejects a suggestion with no text', async () => {
    await expect(addPending(suggestion({ text: '   ' }))).rejects.toThrow();
  });
});

describe('approvePending', () => {
  test('moves the suggestion into the live quote store and removes it from pending', async () => {
    const id = await addPending(suggestion({ title: 'The Thing', text: 'Trust no one.', author: 'MacReady' }));

    const quote = await approvePending(id);

    expect(quote).toEqual({ title: 'The Thing', text: 'Trust no one.', author: 'MacReady' });
    expect(await loadPending()).toEqual([]);
    const liveQuotes = await loadQuotes();
    expect(liveQuotes).toContainEqual({ title: 'The Thing', text: 'Trust no one.', author: 'MacReady' });
  });

  test('applies moderator overrides (from the Edit modal) instead of the original values', async () => {
    const id = await addPending(suggestion({ title: 'Original Title', text: 'Original text.', author: 'Original Author' }));

    const quote = await approvePending(id, { title: 'Edited Title', text: 'Edited text.', author: '' });

    expect(quote).toEqual({ title: 'Edited Title', text: 'Edited text.' });
    const liveQuotes = await loadQuotes();
    expect(liveQuotes).toContainEqual({ title: 'Edited Title', text: 'Edited text.' });
  });

  test('resolves the correct entry by id even after another entry was already removed', async () => {
    const idA = await addPending(suggestion({ text: 'Suggestion A.' }));
    const idB = await addPending(suggestion({ text: 'Suggestion B.' }));

    await approvePending(idA);
    const quote = await approvePending(idB);

    expect(quote.text).toBe('Suggestion B.');
  });

  test('rejects an unknown id', async () => {
    await expect(approvePending('does-not-exist')).rejects.toThrow();
  });
});

describe('rejectPending', () => {
  test('removes the suggestion without adding it to the live store', async () => {
    const id = await addPending(suggestion({ text: 'Should be dropped.' }));

    await rejectPending(id);

    expect(await loadPending()).toEqual([]);
    const liveQuotes = await loadQuotes();
    expect(liveQuotes.some(q => q.text === 'Should be dropped.')).toBe(false);
  });

  test('resolves the correct entry by id among several pending suggestions', async () => {
    const idA = await addPending(suggestion({ text: 'Keep this one.' }));
    const idB = await addPending(suggestion({ text: 'Reject this one.' }));

    await rejectPending(idB);

    const pending = await loadPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe(idA);
  });

  test('rejects an unknown id', async () => {
    await expect(rejectPending('does-not-exist')).rejects.toThrow();
  });
});

describe('countPendingBySuggester', () => {
  test('returns 0 when the user has no pending suggestions', async () => {
    expect(await countPendingBySuggester('guild-1', 'user-1')).toBe(0);
  });

  test('counts only the given user\'s suggestions in the given guild', async () => {
    await addPending(suggestion({ text: 'A.', suggestedById: 'user-1', guildId: 'guild-1' }));
    await addPending(suggestion({ text: 'B.', suggestedById: 'user-1', guildId: 'guild-1' }));
    await addPending(suggestion({ text: 'C.', suggestedById: 'user-2', guildId: 'guild-1' }));
    await addPending(suggestion({ text: 'D.', suggestedById: 'user-1', guildId: 'guild-2' }));

    expect(await countPendingBySuggester('guild-1', 'user-1')).toBe(2);
    expect(await countPendingBySuggester('guild-1', 'user-2')).toBe(1);
    expect(await countPendingBySuggester('guild-2', 'user-1')).toBe(1);
  });

  test('drops back to a lower count once a suggestion is approved or rejected', async () => {
    const idA = await addPending(suggestion({ text: 'A.', suggestedById: 'user-1' }));
    await addPending(suggestion({ text: 'B.', suggestedById: 'user-1' }));
    expect(await countPendingBySuggester('guild-1', 'user-1')).toBe(2);

    await approvePending(idA);
    expect(await countPendingBySuggester('guild-1', 'user-1')).toBe(1);
  });
});

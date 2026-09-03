/**
 * Tests for src/utils/movieQuotesStore.js — the JSON-file-backed status
 * quote list editable through /quotes-admin, seeded from movieQuotes.js's
 * default array the first time the file doesn't exist yet. Each quote is
 * stored as { title?, text, author? }.
 *
 * Run with: npx jest tests/movieQuotesStore.test.js --verbose
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';

// Distinct path per test file — Jest runs test files in separate worker
// processes, and several other test files also exercise movieQuotesStore.js
// against the real (default) file; a shared path would race between them.
const QUOTES_FILE = path.join(process.cwd(), 'movie_quotes.movieQuotesStore.test.json');
process.env.MOVIE_QUOTES_FILE = QUOTES_FILE;

const { MOVIE_QUOTES: DEFAULT_QUOTES } = await import('../src/utils/movieQuotes.js');
const {
  loadQuotes,
  setQuotes,
  addQuote,
  updateQuote,
  deleteQuote,
  replaceAllQuotes,
} = await import('../src/utils/movieQuotesStore.js');

function cleanup() {
  if (fs.existsSync(QUOTES_FILE)) {
    fs.rmSync(QUOTES_FILE);
  }
}

beforeEach(cleanup);
afterEach(cleanup);

describe('loadQuotes', () => {
  test('seeds the file from movieQuotes.js\'s default array on first run, upgraded to object shape', async () => {
    expect(fs.existsSync(QUOTES_FILE)).toBe(false);

    const quotes = await loadQuotes();

    expect(quotes).toEqual(DEFAULT_QUOTES.map(text => ({ text })));
    expect(fs.existsSync(QUOTES_FILE)).toBe(true);
    expect(JSON.parse(fs.readFileSync(QUOTES_FILE, 'utf8'))).toEqual(DEFAULT_QUOTES.map(text => ({ text })));
  });

  test('returns whatever is already on disk without reseeding, once a file exists', async () => {
    await setQuotes([{ text: 'Custom quote A.' }, { text: 'Custom quote B.' }]);

    const quotes = await loadQuotes();

    expect(quotes).toEqual([{ text: 'Custom quote A.' }, { text: 'Custom quote B.' }]);
  });

  test('migrates a legacy plain-string quote file to object shape and persists it', async () => {
    fs.writeFileSync(QUOTES_FILE, JSON.stringify(['Legacy A.', 'Legacy B.']));

    const quotes = await loadQuotes();

    expect(quotes).toEqual([{ text: 'Legacy A.' }, { text: 'Legacy B.' }]);
    expect(JSON.parse(fs.readFileSync(QUOTES_FILE, 'utf8'))).toEqual([{ text: 'Legacy A.' }, { text: 'Legacy B.' }]);
  });
});

describe('setQuotes', () => {
  test('overwrites the full list and persists it', async () => {
    await setQuotes([{ text: 'First.' }, { text: 'Second.' }]);
    const quotes = await loadQuotes();
    expect(quotes).toEqual([{ text: 'First.' }, { text: 'Second.' }]);
  });

  test('stores title/author when given and omits them when blank', async () => {
    await setQuotes([{ title: 'The Thing', text: 'Trust no one.', author: 'MacReady' }, { text: 'No metadata.', title: '  ', author: '' }]);
    const quotes = await loadQuotes();
    expect(quotes).toEqual([
      { title: 'The Thing', text: 'Trust no one.', author: 'MacReady' },
      { text: 'No metadata.' },
    ]);
  });

  test('rejects a non-array value', async () => {
    await expect(setQuotes('not an array')).rejects.toThrow();
  });

  test('rejects an array containing an entry with no text', async () => {
    await expect(setQuotes([{ text: 'Valid.' }, { title: 'No text here' }])).rejects.toThrow();
  });

  test('rejects an array containing an empty/whitespace-only text field', async () => {
    await expect(setQuotes([{ text: 'Valid.' }, { text: '   ' }])).rejects.toThrow();
  });
});

describe('addQuote', () => {
  test('appends to the existing list and trims whitespace', async () => {
    await setQuotes([{ text: 'Existing.' }]);

    const quotes = await addQuote({ text: '  New one.  ' });

    expect(quotes).toEqual([{ text: 'Existing.' }, { text: 'New one.' }]);
  });

  test('stores title/author when given', async () => {
    await setQuotes([]);
    const quotes = await addQuote({ title: 'The Thing', text: 'Trust no one.', author: 'MacReady' });
    expect(quotes).toEqual([{ title: 'The Thing', text: 'Trust no one.', author: 'MacReady' }]);
  });

  test('rejects an empty string', async () => {
    await expect(addQuote({ text: '   ' })).rejects.toThrow();
  });
});

describe('updateQuote', () => {
  test('replaces the quote at the given index', async () => {
    await setQuotes([{ text: 'One.' }, { text: 'Two.' }, { text: 'Three.' }]);

    const quotes = await updateQuote(1, { text: 'Two, edited.' });

    expect(quotes).toEqual([{ text: 'One.' }, { text: 'Two, edited.' }, { text: 'Three.' }]);
  });

  test('rejects an out-of-range index', async () => {
    await setQuotes([{ text: 'One.' }]);
    await expect(updateQuote(5, { text: 'Nope.' })).rejects.toThrow();
  });

  test('rejects an empty replacement text', async () => {
    await setQuotes([{ text: 'One.' }]);
    await expect(updateQuote(0, { text: '' })).rejects.toThrow();
  });
});

describe('deleteQuote', () => {
  test('removes the quote at the given index, shifting the rest down', async () => {
    await setQuotes([{ text: 'One.' }, { text: 'Two.' }, { text: 'Three.' }]);

    const quotes = await deleteQuote(1);

    expect(quotes).toEqual([{ text: 'One.' }, { text: 'Three.' }]);
  });

  test('rejects an out-of-range index', async () => {
    await setQuotes([{ text: 'One.' }]);
    await expect(deleteQuote(5)).rejects.toThrow();
  });
});

describe('replaceAllQuotes', () => {
  test('validates every entry before writing anything', async () => {
    await setQuotes([{ text: 'Original.' }]);

    await expect(replaceAllQuotes([{ text: 'Valid.' }, { title: 'Missing text' }])).rejects.toThrow();

    // The original list is untouched since validation failed atomically.
    const quotes = await loadQuotes();
    expect(quotes).toEqual([{ text: 'Original.' }]);
  });

  test('overwrites the entire list on success', async () => {
    await setQuotes([{ text: 'Original.' }]);

    const quotes = await replaceAllQuotes([
      { title: 'A', text: 'Quote A.' },
      { text: 'Quote B.', author: 'B Author' },
    ]);

    expect(quotes).toEqual([
      { title: 'A', text: 'Quote A.' },
      { text: 'Quote B.', author: 'B Author' },
    ]);
  });
});

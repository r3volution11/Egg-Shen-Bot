/**
 * Tests for src/utils/movieQuotesStore.js — the JSON-file-backed status
 * quote list editable through /quotes-admin, seeded from movieQuotes.js's
 * default array the first time the file doesn't exist yet.
 *
 * Run with: npx jest tests/movieQuotesStore.test.js --verbose
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { MOVIE_QUOTES as DEFAULT_QUOTES } from '../src/utils/movieQuotes.js';
import {
  loadQuotes,
  setQuotes,
  addQuote,
  updateQuote,
  deleteQuote,
} from '../src/utils/movieQuotesStore.js';

const QUOTES_FILE = path.join(process.cwd(), 'movie_quotes.json');

function cleanup() {
  if (fs.existsSync(QUOTES_FILE)) {
    fs.rmSync(QUOTES_FILE);
  }
}

beforeEach(cleanup);
afterEach(cleanup);

describe('loadQuotes', () => {
  test('seeds the file from movieQuotes.js\'s default array on first run', async () => {
    expect(fs.existsSync(QUOTES_FILE)).toBe(false);

    const quotes = await loadQuotes();

    expect(quotes).toEqual(DEFAULT_QUOTES);
    expect(fs.existsSync(QUOTES_FILE)).toBe(true);
    expect(JSON.parse(fs.readFileSync(QUOTES_FILE, 'utf8'))).toEqual(DEFAULT_QUOTES);
  });

  test('returns whatever is already on disk without reseeding, once a file exists', async () => {
    await setQuotes(['Custom quote A.', 'Custom quote B.']);

    const quotes = await loadQuotes();

    expect(quotes).toEqual(['Custom quote A.', 'Custom quote B.']);
  });
});

describe('setQuotes', () => {
  test('overwrites the full list and persists it', async () => {
    await setQuotes(['First.', 'Second.']);
    const quotes = await loadQuotes();
    expect(quotes).toEqual(['First.', 'Second.']);
  });

  test('rejects a non-array value', async () => {
    await expect(setQuotes('not an array')).rejects.toThrow();
  });

  test('rejects an array containing a non-string entry', async () => {
    await expect(setQuotes(['Valid.', 42])).rejects.toThrow();
  });

  test('rejects an array containing an empty/whitespace-only string', async () => {
    await expect(setQuotes(['Valid.', '   '])).rejects.toThrow();
  });
});

describe('addQuote', () => {
  test('appends to the existing list and trims whitespace', async () => {
    await setQuotes(['Existing.']);

    const quotes = await addQuote('  New one.  ');

    expect(quotes).toEqual(['Existing.', 'New one.']);
  });

  test('rejects an empty string', async () => {
    await expect(addQuote('   ')).rejects.toThrow();
  });
});

describe('updateQuote', () => {
  test('replaces the quote at the given index', async () => {
    await setQuotes(['One.', 'Two.', 'Three.']);

    const quotes = await updateQuote(1, 'Two, edited.');

    expect(quotes).toEqual(['One.', 'Two, edited.', 'Three.']);
  });

  test('rejects an out-of-range index', async () => {
    await setQuotes(['One.']);
    await expect(updateQuote(5, 'Nope.')).rejects.toThrow();
  });

  test('rejects an empty replacement string', async () => {
    await setQuotes(['One.']);
    await expect(updateQuote(0, '')).rejects.toThrow();
  });
});

describe('deleteQuote', () => {
  test('removes the quote at the given index, shifting the rest down', async () => {
    await setQuotes(['One.', 'Two.', 'Three.']);

    const quotes = await deleteQuote(1);

    expect(quotes).toEqual(['One.', 'Three.']);
  });

  test('rejects an out-of-range index', async () => {
    await setQuotes(['One.']);
    await expect(deleteQuote(5)).rejects.toThrow();
  });
});

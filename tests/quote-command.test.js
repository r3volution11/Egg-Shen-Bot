/**
 * Tests for /quote — posts a random status quote into the channel, with
 * optional title/author filters combined as OR.
 *
 * Run with: npx jest tests/quote-command.test.js --verbose
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';

// Distinct path per test file — see movieQuotesStore.test.js's comment for
// why (parallel Jest workers would otherwise race on the real file).
const QUOTES_FILE = path.join(process.cwd(), 'movie_quotes.quote-command.test.json');
process.env.MOVIE_QUOTES_FILE = QUOTES_FILE;

const { execute, autocomplete } = await import('../src/commands/quote.js');
const { setQuotes } = await import('../src/utils/movieQuotesStore.js');

function cleanup() {
  if (fs.existsSync(QUOTES_FILE)) fs.rmSync(QUOTES_FILE);
}

beforeEach(cleanup);
afterEach(cleanup);

function makeInteraction({ title = null, author = null, focused = '' } = {}) {
  const options = {
    getString: (name) => (name === 'title' ? title : name === 'author' ? author : null),
    getFocused: () => focused,
  };
  return {
    guildId: 'quote-test-guild',
    member: { permissions: { has: () => false } },
    options,
    reply: async () => undefined,
    respond: async () => undefined,
  };
}

async function runAndCapture(interaction) {
  let captured;
  interaction.reply = async (payload) => { captured = payload; };
  await execute(interaction);
  return captured;
}

describe('/quote', () => {
  test('replies with an embed containing the quote text when no filters given', async () => {
    await setQuotes([{ text: 'Trust no one.' }]);

    const result = await runAndCapture(makeInteraction());

    expect(result.embeds).toHaveLength(1);
    expect(result.embeds[0].data.description).toContain('Trust no one.');
  });

  test('omits the footer when neither title nor author is present', async () => {
    await setQuotes([{ text: 'No metadata here.' }]);

    const result = await runAndCapture(makeInteraction());

    expect(result.embeds[0].data.footer).toBeUndefined();
  });

  test('footer shows both title and author when present', async () => {
    await setQuotes([{ title: 'The Thing', text: 'Trust no one.', author: 'MacReady' }]);

    const result = await runAndCapture(makeInteraction());

    expect(result.embeds[0].data.footer.text).toBe('— MacReady, "The Thing"');
  });

  test('footer shows only author when title is absent', async () => {
    await setQuotes([{ text: 'Trust no one.', author: 'MacReady' }]);

    const result = await runAndCapture(makeInteraction());

    expect(result.embeds[0].data.footer.text).toBe('— MacReady');
  });

  test('footer shows only title when author is absent', async () => {
    await setQuotes([{ title: 'The Thing', text: 'Trust no one.' }]);

    const result = await runAndCapture(makeInteraction());

    expect(result.embeds[0].data.footer.text).toBe('"The Thing"');
  });

  test('title filter narrows to matching quotes (case-insensitive)', async () => {
    await setQuotes([
      { title: 'The Thing', text: 'Quote from The Thing.' },
      { title: 'Halloween', text: 'Quote from Halloween.' },
    ]);

    const result = await runAndCapture(makeInteraction({ title: 'the thing' }));

    expect(result.embeds[0].data.description).toContain('Quote from The Thing.');
  });

  test('author filter narrows to matching quotes (case-insensitive)', async () => {
    await setQuotes([
      { text: 'Quote by MacReady.', author: 'MacReady' },
      { text: 'Quote by Laurie.', author: 'Laurie' },
    ]);

    const result = await runAndCapture(makeInteraction({ author: 'macready' }));

    expect(result.embeds[0].data.description).toContain('Quote by MacReady.');
  });

  test('title and author together match with OR, not AND', async () => {
    await setQuotes([
      { title: 'The Thing', text: 'Matches by title only.', author: 'Someone Else' },
      { title: 'Unrelated', text: 'Matches by author only.', author: 'MacReady' },
      { title: 'Nothing', text: 'Matches neither.', author: 'Nobody' },
    ]);

    // Run many times since the pick is random — both matches should appear
    // across repeated calls, and the non-matching quote should never appear.
    const seen = new Set();
    for (let i = 0; i < 30; i++) {
      const result = await runAndCapture(makeInteraction({ title: 'The Thing', author: 'MacReady' }));
      seen.add(result.embeds[0].data.description);
    }

    expect([...seen].some(d => d.includes('Matches by title only.'))).toBe(true);
    expect([...seen].some(d => d.includes('Matches by author only.'))).toBe(true);
    expect([...seen].some(d => d.includes('Matches neither.'))).toBe(false);
  });

  test('replies ephemerally with an error when nothing matches the filter', async () => {
    await setQuotes([{ title: 'The Thing', text: 'Trust no one.' }]);

    const result = await runAndCapture(makeInteraction({ title: 'Nonexistent Movie' }));

    expect(result.embeds).toBeUndefined();
    expect(result.ephemeral).toBe(true);
    expect(result.content).toMatch(/no quotes found/i);
  });
});

describe('/quote autocomplete', () => {
  test('suggests distinct titles matching the focused text', async () => {
    await setQuotes([
      { title: 'The Thing', text: 'A.' },
      { title: 'The Thing', text: 'B.' },
      { title: 'Halloween', text: 'C.' },
    ]);

    let responded;
    const interaction = makeInteraction({ focused: 'the' });
    interaction.respond = async (choices) => { responded = choices; };

    await autocomplete(interaction);

    expect(responded).toEqual([{ name: 'The Thing', value: 'The Thing' }]);
  });
});

/**
 * Discord rejects an over-limit message outright, so embedFit's helpers have
 * to be exact — most of all clipText, which must never cut a piece of markup
 * in half (raw `<:name:id>` on screen, a pill that swallows the card).
 *
 * Run with: npm test -- tests/embed-fit.test.js
 */

import { describe, test, expect } from '@jest/globals';
import { EmbedBuilder } from 'discord.js';
import { LIMITS, embedTextLength, messageProblems, clipText, chooseLayout, fieldsFromLines } from '../src/utils/embedFit.js';

describe('clipText', () => {
  test('text that already fits comes back unchanged', () => {
    expect(clipText('hello', 5)).toBe('hello');
    expect(clipText('', 3)).toBe('');
  });

  test('a plain cut ends in the ellipsis and totals exactly max', () => {
    expect(clipText('abcdefghij', 6)).toBe('abcde…');
    expect(clipText('abcdefghij', 6)).toHaveLength(6);
  });

  test('a custom emoji is dropped whole, never cut', () => {
    const emoji = '<:es_pie_3fa9:123456789012345678>';
    const text = `ab${emoji}cd`;
    // every cut point inside the token falls back to before it
    for (let max = 4; max < 2 + emoji.length + 1; max++) {
      expect(clipText(text, max)).toBe('ab…');
    }
    // once the whole token fits, it is kept
    expect(clipText(text, 2 + emoji.length + 1)).toBe(`ab${emoji}…`);
  });

  test('an animated emoji is dropped whole', () => {
    expect(clipText('go <a:spin:99887766> now please', 12)).toBe('go…');
  });

  test('a timestamp is dropped whole', () => {
    expect(clipText('ends <t:1700000000:R> sharp', 12)).toBe('ends…');
    expect(clipText('ends <t:1700000000> sharp', 12)).toBe('ends…');
  });

  test.each([
    ['user mention', '<@123456789>'],
    ['nickname-style user mention', '<@!123456789>'],
    ['role mention', '<@&123456789>'],
    ['channel mention', '<#123456789>'],
    ['slash-command mention', '</bracket vote:123456789>'],
  ])('a %s is dropped whole', (_name, token) => {
    const text = `hi ${token} there`;
    expect(clipText(text, 3 + 1 + 5)).toBe('hi…');
    // …and kept when it fits with room for the ellipsis
    expect(clipText(`${text} and more`, 3 + token.length + 1)).toBe(`hi ${token}…`);
  });

  test('a surrogate pair (most emoji) is never left half', () => {
    // 'ab' + 🎬 (2 units) + 'cd': cutting after 3 units would strand the high surrogate
    expect(clipText('ab🎬cd', 4)).toBe('ab…');
    expect(clipText('ab🎬cdef', 5)).toBe('ab🎬…');
  });

  test('a backtick pill is never left open', () => {
    expect(clipText('score `12/20` more', 10)).toBe('score…');
    expect(clipText('score `12/20` more words here', 14)).toBe('score `12/20`…');
  });

  test('never exceeds max, whatever the content', () => {
    const text = 'x <:a_b:1> `p` <t:1:R> 🎬 <@5> '.repeat(40);
    for (let max = 1; max < 120; max++) expect(clipText(text, max).length).toBeLessThanOrEqual(max);
  });

  test('a max no bigger than the ellipsis gives just the ellipsis (or less)', () => {
    expect(clipText('abcdef', 1)).toBe('…');
    expect(clipText('abcdef', 0)).toBe('');
  });

  test('a custom ellipsis is honoured', () => {
    expect(clipText('abcdefghij', 6, '...')).toBe('abc...');
  });
});

describe('embedTextLength', () => {
  test('counts title, description, field names and values, footer and author — not the url', () => {
    const embed = new EmbedBuilder()
      .setTitle('abc')
      .setDescription('defg')
      .setURL('https://example.com/very/long')
      .addFields({ name: 'hi', value: 'there' }, { name: 'x', value: 'yz' })
      .setFooter({ text: '12345' })
      .setAuthor({ name: '67' });
    expect(embedTextLength(embed)).toBe(3 + 4 + 2 + 5 + 1 + 2 + 5 + 2);
  });

  test('reads plain JSON the same as a builder', () => {
    expect(embedTextLength({ title: 'abc', fields: [{ name: 'a', value: 'bb' }] })).toBe(6);
    expect(embedTextLength({})).toBe(0);
  });
});

describe('messageProblems', () => {
  const field = (n = 'n', v = 'v') => ({ name: n, value: v });

  test('a valid message has no problems', () => {
    expect(messageProblems({ content: 'x'.repeat(2000), embeds: [{ title: 't'.repeat(256), description: 'd'.repeat(4096) }] })).toEqual([]);
    expect(messageProblems()).toEqual([]);
  });

  test('content over 2000', () => {
    expect(messageProblems({ content: 'x'.repeat(2001) })).toEqual(['content is 2001 characters (limit 2000)']);
  });

  test('more than 10 embeds', () => {
    expect(messageProblems({ embeds: Array.from({ length: 11 }, () => ({ title: 'a' })) })).toEqual(['11 embeds (limit 10)']);
  });

  test('title, description, footer and author', () => {
    expect(messageProblems({ embeds: [{ title: 'x'.repeat(257) }] })).toEqual(['embed 1 title is 257 characters (limit 256)']);
    expect(messageProblems({ embeds: [{ description: 'x'.repeat(4097) }] })).toEqual(['embed 1 description is 4097 characters (limit 4096)']);
    expect(messageProblems({ embeds: [{ footer: { text: 'x'.repeat(2049) } }] })).toEqual(['embed 1 footer is 2049 characters (limit 2048)']);
    expect(messageProblems({ embeds: [{ author: { name: 'x'.repeat(257) } }] })).toEqual(['embed 1 author name is 257 characters (limit 256)']);
  });

  test('more than 25 fields', () => {
    const fields = Array.from({ length: 26 }, () => field());
    expect(messageProblems({ embeds: [{ fields }] })).toEqual(['embed 1 has 26 fields (limit 25)']);
  });

  test('field name over 256 and value over 1024', () => {
    expect(messageProblems({ embeds: [{ fields: [field('n'.repeat(257))] }] })).toEqual(['embed 1 field 1 name is 257 characters (limit 256)']);
    expect(messageProblems({ embeds: [{ fields: [field('n'), field('n', 'v'.repeat(1025))] }] })).toEqual(['embed 1 field 2 value is 1025 characters (limit 1024)']);
  });

  test('an empty field name or value is rejected', () => {
    expect(messageProblems({ embeds: [{ fields: [field('', 'v')] }] })).toEqual(['embed 1 field 1 has no name']);
    expect(messageProblems({ embeds: [{ fields: [field('n', '')] }] })).toEqual(['embed 1 field 1 has no value']);
  });

  test('6000 characters is the total across all embeds together', () => {
    const half = { description: 'x'.repeat(3000) };
    expect(messageProblems({ embeds: [half, half] })).toEqual([]);
    expect(messageProblems({ embeds: [half, { description: 'x'.repeat(3001) }] })).toEqual(['embeds total 6001 characters (limit 6000)']);
  });

  test('reads EmbedBuilder objects, not just JSON', () => {
    // The builder refuses an over-long description itself, so use a field it accepts
    const e = new EmbedBuilder().setTitle('x'.repeat(256)).addFields({ name: 'n', value: 'v' });
    e.data.title += 'y'; // as if code had edited the JSON underneath
    expect(messageProblems({ embeds: [e] })).toEqual(['embed 1 title is 257 characters (limit 256)']);
  });

  test('every problem is reported, not just the first', () => {
    expect(messageProblems({ content: 'x'.repeat(2001), embeds: [{ title: 'x'.repeat(257) }] })).toHaveLength(2);
  });
});

describe('fieldsFromLines', () => {
  test('lines that fit share one field under the given name', () => {
    expect(fieldsFromLines('Top', ['a', 'b', 'c'])).toEqual([{ name: 'Top', value: 'a\nb\nc', inline: false }]);
  });

  test('an overflow continues in a field with an invisible name', () => {
    const lines = ['x'.repeat(6), 'y'.repeat(6), 'z'.repeat(6)];
    expect(fieldsFromLines('Top', lines, { max: 13 })).toEqual([
      { name: 'Top', value: 'xxxxxx\nyyyyyy', inline: false },
      { name: '​', value: 'zzzzzz', inline: false },
    ]);
  });

  test('every value is within max, and no line is lost or reordered', () => {
    const lines = Array.from({ length: 60 }, (_, i) => `line ${i} ${'.'.repeat(i % 17)}`);
    const fields = fieldsFromLines('Top', lines, { max: 100, inline: true });
    for (const f of fields) {
      expect(f.value.length).toBeLessThanOrEqual(100);
      expect(f.inline).toBe(true);
    }
    expect(fields.map(f => f.value).join('\n').split('\n')).toEqual(lines);
  });

  test('a single line longer than max is clipped, not dropped', () => {
    expect(fieldsFromLines('Top', ['x'.repeat(50)], { max: 10 })).toEqual([{ name: 'Top', value: 'xxxxxxxxx…', inline: false }]);
  });

  test('no lines, no fields', () => {
    expect(fieldsFromLines('Top', [])).toEqual([]);
  });

  test('defaults to the 1024 field limit', () => {
    const fields = fieldsFromLines('Top', Array.from({ length: 30 }, () => 'x'.repeat(100)));
    expect(fields.length).toBe(3); // ten 100-char lines (1009 chars) per field
    for (const f of fields) expect(f.value.length).toBeLessThanOrEqual(LIMITS.fieldValue);
  });
});

describe('chooseLayout', () => {
  test('keeps the first step whose output fits', () => {
    const steps = [30, 20, 10, 5];
    const { out, step } = chooseLayout(steps, n => 'x'.repeat(n), o => o.length <= 12);
    expect(step).toBe(2);
    expect(out).toBe('x'.repeat(10));
  });

  test('stops rendering once something fits', () => {
    const seen = [];
    chooseLayout([1, 2, 3], (n) => { seen.push(n); return n; }, () => true);
    expect(seen).toEqual([1]);
  });

  test('when nothing fits, the last (tightest) step is returned', () => {
    const { out, step } = chooseLayout([30, 20], n => 'x'.repeat(n), () => false);
    expect(step).toBe(1);
    expect(out).toBe('x'.repeat(20));
  });

  test('the render function is told the step index too', () => {
    const idx = [];
    chooseLayout(['a', 'b'], (s, i) => { idx.push(i); return s; }, () => false);
    expect(idx).toEqual([0, 1]);
  });
});

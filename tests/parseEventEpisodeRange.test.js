/**
 * Tests for parseEventEpisodeRange — resolving a season/episode range from a
 * scheduled event's name and description, which hosts usually split across
 * the two fields rather than cramming into the name.
 */

import { parseEventEpisodeRange } from '../src/utils/episodeRangeParser.js';

describe('parseEventEpisodeRange', () => {
  describe('range in the description (the common watch-party shape)', () => {
    it('parses the real-world Tales From the Crypt event', () => {
      // The exact event that motivated this: the name is the show, the
      // description carries the range, and neither field parses alone.
      expect(parseEventEpisodeRange('Tales From the Crypt', 'Season 6 episodes 4 - 7')).toEqual({
        season: 6,
        episodeStart: 4,
        episodeEnd: 7,
        showName: 'Tales From the Crypt',
      });
    });

    it.each([
      ['Season 6 episodes 4 - 7', 6, 4, 7],
      ['Season 6 episodes 4-7', 6, 4, 7],
      ['S6: E4 - E8', 6, 4, 8],
      ['Season 2, Episodes 1 to 3', 2, 1, 3],
      ['season 3 ep 5', 3, 5, 5],
      ['S1E1', 1, 1, 1],
    ])('parses description %s', (description, season, episodeStart, episodeEnd) => {
      expect(parseEventEpisodeRange('Some Show', description)).toEqual({
        season,
        episodeStart,
        episodeEnd,
        showName: 'Some Show',
      });
    });

    it('finds the range embedded in surrounding prose', () => {
      expect(parseEventEpisodeRange('Severance', 'Come hang out! Season 2 episodes 1-3, snacks provided.')).toEqual({
        season: 2,
        episodeStart: 1,
        episodeEnd: 3,
        showName: 'Severance',
      });
    });

    it('trims whitespace from the event name', () => {
      expect(parseEventEpisodeRange('  Severance  ', 'Season 2 episodes 1-3')?.showName).toBe('Severance');
    });
  });

  describe('range in the name takes precedence', () => {
    it('parses the name when it carries the full notation', () => {
      expect(parseEventEpisodeRange('Severance - S2: E1 - E3', null)).toEqual({
        season: 2,
        episodeStart: 1,
        episodeEnd: 3,
        showName: 'Severance',
      });
    });

    it('prefers the name over a conflicting description', () => {
      // The name is the more deliberate field; if a host bothered to put the
      // range there, that's the one they mean.
      const result = parseEventEpisodeRange('The Office S9E23', 'Season 1 episodes 1-5');
      expect(result).toEqual({
        season: 9,
        episodeStart: 23,
        episodeEnd: 23,
        showName: 'The Office',
      });
    });

    it('accepts shorthand in the name, where the field is constrained', () => {
      expect(parseEventEpisodeRange('Firefly 1x11', null)?.season).toBe(1);
    });
  });

  describe('description shorthand is rejected (prose false positives)', () => {
    it.each([
      ['Join us at 8x30 pm', 'a start time'],
      ['Watching at 1x speed', 'a playback speed'],
      ['We have 2x as many snacks', 'a multiplier'],
    ])('ignores %s in a description (%s)', (description) => {
      // parseEpisodeRange's SHORTHAND_PATTERN would happily read "8x30" as
      // season 8 episode 30. Descriptions are prose, so only the verbose
      // "Season N episode M" form is trusted there.
      expect(parseEventEpisodeRange('Tales From the Crypt', description)).toBeNull();
    });
  });

  describe('returns null when there is nothing to parse', () => {
    it.each([
      ['no range anywhere', 'Tales From the Crypt', 'Spooky stories, bring snacks'],
      ['null description', 'Tales From the Crypt', null],
      ['undefined description', 'Tales From the Crypt', undefined],
      ['empty description', 'Tales From the Crypt', ''],
      ['non-string description', 'Tales From the Crypt', 42],
      ['blank name with a valid range', '   ', 'Season 6 episodes 4 - 7'],
      ['empty name', '', 'Season 6 episodes 4 - 7'],
      ['null name', null, 'Season 6 episodes 4 - 7'],
      ['both missing', null, null],
    ])('%s', (_label, name, description) => {
      expect(parseEventEpisodeRange(name, description)).toBeNull();
    });

    it('rejects an inverted range', () => {
      // Mangled input — guessing which number was meant is worse than
      // falling through to the no-duration path.
      expect(parseEventEpisodeRange('Tales From the Crypt', 'Season 6 episodes 7 - 4')).toBeNull();
    });
  });
});

describe('stripTrailingYear', () => {
  test.each([
    ['The Covenant (2006)', 'The Covenant', '2006'],
    ['The Covenant [2006]', 'The Covenant', '2006'],
    ['The Covenant - 2006', 'The Covenant', '2006'],
    ['Halloween (1978)', 'Halloween', '1978'],
    ['The Thing ( 1982 )', 'The Thing', '1982'],
  ])('strips the year from %s', async (input, title, year) => {
    const { stripTrailingYear } = await import('../src/utils/episodeRangeParser.js');
    expect(stripTrailingYear(input)).toEqual({ title, year });
  });

  test.each([
    ['Blade Runner 2049'],
    ['Summer of 1984'],
    ['1917'],
    ['2012'],
    ['The Thing'],
  ])('leaves %s alone — the number is part of the title', async (input) => {
    const { stripTrailingYear } = await import('../src/utils/episodeRangeParser.js');
    expect(stripTrailingYear(input)).toEqual({ title: input, year: null });
  });

  test('handles empty and non-string input', async () => {
    const { stripTrailingYear } = await import('../src/utils/episodeRangeParser.js');
    expect(stripTrailingYear('')).toEqual({ title: '', year: null });
    expect(stripTrailingYear(null)).toEqual({ title: '', year: null });
    expect(stripTrailingYear(undefined)).toEqual({ title: '', year: null });
  });

  test('does not strip a year that is the entire title', async () => {
    const { stripTrailingYear } = await import('../src/utils/episodeRangeParser.js');
    // "(2006)" alone leaves nothing to search for, so it stays as-is.
    expect(stripTrailingYear('(2006)').title).toBe('(2006)');
  });
});

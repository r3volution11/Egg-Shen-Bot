/**
 * Unit tests for episodeRangeParser.js's parseEpisodeRange — scans a
 * free-text label (e.g. a Discord event/channel name) for embedded
 * season/episode(-range) notation and returns the structured range plus the
 * show name with the notation stripped out.
 *
 * Run with: npx jest tests/episodeRangeParser.test.js --verbose
 */

import { describe, test, expect } from '@jest/globals';
import { parseEpisodeRange } from '../src/utils/episodeRangeParser.js';

describe('parseEpisodeRange — format coverage', () => {
  test('verbose range with colon and spaces: "S5: E5 - E8"', () => {
    expect(parseEpisodeRange('Tales from the Crypt - S5: E5 - E8')).toEqual({
      season: 5, episodeStart: 5, episodeEnd: 8, showName: 'Tales from the Crypt',
    });
  });

  test('compact range: "S5E5-E8"', () => {
    expect(parseEpisodeRange('Tales from the Crypt S5E5-E8')).toEqual({
      season: 5, episodeStart: 5, episodeEnd: 8, showName: 'Tales from the Crypt',
    });
  });

  test('zero-padded compact range: "S05E05-E08"', () => {
    expect(parseEpisodeRange('Tales from the Crypt S05E05-E08')).toEqual({
      season: 5, episodeStart: 5, episodeEnd: 8, showName: 'Tales from the Crypt',
    });
  });

  test('verbose "Season N Episode N-N"', () => {
    expect(parseEpisodeRange('Tales from the Crypt Season 5 Episode 5-8')).toEqual({
      season: 5, episodeStart: 5, episodeEnd: 8, showName: 'Tales from the Crypt',
    });
  });

  test('verbose plural "Season N, Episodes N-N"', () => {
    expect(parseEpisodeRange('Tales from the Crypt Season 5, Episodes 5-8')).toEqual({
      season: 5, episodeStart: 5, episodeEnd: 8, showName: 'Tales from the Crypt',
    });
  });

  test('single episode, no range: "S3E1"', () => {
    expect(parseEpisodeRange('Tales from the Crypt S3E1')).toEqual({
      season: 3, episodeStart: 1, episodeEnd: 1, showName: 'Tales from the Crypt',
    });
  });

  test('single episode with spaces: "S3 E1"', () => {
    expect(parseEpisodeRange('Tales from the Crypt S3 E1')).toEqual({
      season: 3, episodeStart: 1, episodeEnd: 1, showName: 'Tales from the Crypt',
    });
  });

  test('shorthand "NxN" form', () => {
    expect(parseEpisodeRange('Tales from the Crypt 3x11')).toEqual({
      season: 3, episodeStart: 11, episodeEnd: 11, showName: 'Tales from the Crypt',
    });
  });

  test('case-insensitive matching', () => {
    expect(parseEpisodeRange('tales from the crypt s5e5-e8')).toEqual({
      season: 5, episodeStart: 5, episodeEnd: 8, showName: 'tales from the crypt',
    });
  });
});

describe('parseEpisodeRange — show name extraction', () => {
  test('only text BEFORE the match becomes the show name, not text after', () => {
    expect(parseEpisodeRange('The Office S9E23 - The Finale')).toEqual({
      season: 9, episodeStart: 23, episodeEnd: 23, showName: 'The Office',
    });
  });

  test('strips dangling separator punctuation and whitespace', () => {
    expect(parseEpisodeRange('Tales from the Crypt -- S5E5-E8')).toEqual(
      expect.objectContaining({ showName: 'Tales from the Crypt' })
    );
  });
});

describe('parseEpisodeRange — negative cases', () => {
  test('returns null for a label with no season/episode pattern at all', () => {
    expect(parseEpisodeRange('Just a movie title with no range')).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(parseEpisodeRange('')).toBeNull();
  });

  test('returns null for non-string input', () => {
    expect(parseEpisodeRange(null)).toBeNull();
    expect(parseEpisodeRange(undefined)).toBeNull();
    expect(parseEpisodeRange(42)).toBeNull();
  });

  test('returns null when stripping the match leaves no show name', () => {
    expect(parseEpisodeRange('S5E5-E8')).toBeNull();
  });

  test('returns null when the range is backwards (end before start)', () => {
    expect(parseEpisodeRange('Some Show S5 E8 - E5')).toBeNull();
  });
});

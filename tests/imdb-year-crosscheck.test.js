/**
 * Coverage for embedBuilder.js's OMDB year cross-check on picker options:
 * when a multi-result picker is built, the top few candidates get their
 * IMDb year cross-referenced against TMDB's year, showing both only when
 * they disagree (e.g. "It (1990) (IMDb: 1991)"). Capped at the top 5
 * candidates regardless of total result count, and degrades gracefully
 * (TMDB-only year) whenever OMDB/IMDb data can't be resolved.
 *
 * Run with: npx jest tests/imdb-year-crosscheck.test.js --verbose
 */

import { describe, test, expect, jest, beforeAll, beforeEach } from '@jest/globals';

const mockGetMovieDetails = jest.fn();
const mockGetOMDBData = jest.fn();

jest.unstable_mockModule('../src/services/tmdbService.js', () => ({
  getPosterUrl: jest.fn(),
  getMovieDetails: mockGetMovieDetails,
  getTVShowDetails: jest.fn(),
}));

jest.unstable_mockModule('../src/services/omdbService.js', () => ({
  getOMDBData: mockGetOMDBData,
}));

let createSearchResults;

beforeAll(async () => {
  ({ createSearchResults } = await import('../src/utils/embedBuilder.js'));
});

beforeEach(() => {
  mockGetMovieDetails.mockReset();
  mockGetOMDBData.mockReset();
});

function movieResult(id, title, releaseDate) {
  return { id, title, release_date: releaseDate, overview: 'An overview.' };
}

function getOptionLabels(response) {
  return response.components[0].components[0].options.map(o => o.data.label);
}

describe('createSearchResults — IMDb year cross-check', () => {
  test('shows both years when TMDB and OMDB years disagree', async () => {
    mockGetMovieDetails.mockResolvedValue({ external_ids: { imdb_id: 'tt0000001' } });
    mockGetOMDBData.mockResolvedValue({ Year: '1991' });

    const results = [movieResult(1, 'It', '1990-11-18')];
    const response = await createSearchResults(results, 'movie', 'it');

    expect(getOptionLabels(response)[0]).toBe('It (1990 (IMDb: 1991))');
  });

  test('shows only one year when TMDB and OMDB years agree', async () => {
    mockGetMovieDetails.mockResolvedValue({ external_ids: { imdb_id: 'tt0000001' } });
    mockGetOMDBData.mockResolvedValue({ Year: '1990' });

    const results = [movieResult(1, 'It', '1990-11-18')];
    const response = await createSearchResults(results, 'movie', 'it');

    expect(getOptionLabels(response)[0]).toBe('It (1990)');
  });

  test('degrades to TMDB-only year when the movie has no IMDb ID', async () => {
    mockGetMovieDetails.mockResolvedValue({ external_ids: {} });

    const results = [movieResult(1, 'It', '1990-11-18')];
    const response = await createSearchResults(results, 'movie', 'it');

    expect(mockGetOMDBData).not.toHaveBeenCalled();
    expect(getOptionLabels(response)[0]).toBe('It (1990)');
  });

  test('degrades to TMDB-only year when the TMDB details fetch fails', async () => {
    mockGetMovieDetails.mockRejectedValue(new Error('TMDB down'));

    const results = [movieResult(1, 'It', '1990-11-18')];
    const response = await createSearchResults(results, 'movie', 'it');

    expect(getOptionLabels(response)[0]).toBe('It (1990)');
  });

  test('degrades to TMDB-only year when OMDB has no Year field', async () => {
    mockGetMovieDetails.mockResolvedValue({ external_ids: { imdb_id: 'tt0000001' } });
    mockGetOMDBData.mockResolvedValue(null);

    const results = [movieResult(1, 'It', '1990-11-18')];
    const response = await createSearchResults(results, 'movie', 'it');

    expect(getOptionLabels(response)[0]).toBe('It (1990)');
  });

  test('only cross-checks the top 5 candidates, not the full result list', async () => {
    mockGetMovieDetails.mockResolvedValue({ external_ids: { imdb_id: 'tt0000001' } });
    mockGetOMDBData.mockResolvedValue({ Year: '1999' }); // deliberately mismatched, to prove it wasn't checked

    const results = Array.from({ length: 10 }, (_, i) => movieResult(i, `Movie ${i}`, '1990-01-01'));
    const response = await createSearchResults(results, 'movie', 'movie');

    expect(mockGetMovieDetails).toHaveBeenCalledTimes(5);
    const labels = getOptionLabels(response);
    // First 5 got cross-checked (mismatched year shown); the rest kept the plain TMDB year.
    expect(labels.slice(0, 5).every(l => l.includes('IMDb: 1999'))).toBe(true);
    expect(labels.slice(5).every(l => !l.includes('IMDb'))).toBe(true);
  });
});

/**
 * Tests for /recommend — the command surface, source selection, filters and
 * fallbacks.
 *
 * Every option is optional, so the important cases are the defaults: a bare
 * invocation has to do something sensible whether or not the server has any
 * watch history, and the AI step has to be entirely skippable.
 *
 * Run with: npm test -- tests/recommend-command.test.js
 */

import { describe, test, expect, jest, beforeAll, beforeEach } from '@jest/globals';

const mockGetWatchHistory = jest.fn();
const mockGetGenres = jest.fn();
const mockSearchPeople = jest.fn();
const mockGetPersonById = jest.fn();
const mockDiscoverTitles = jest.fn();
const mockGetMovieDetails = jest.fn();
const mockGetTVShowDetails = jest.fn();
const mockGetSimilarMovies = jest.fn();
const mockGetSimilarTV = jest.fn();
const mockGenerateRanking = jest.fn();
const mockDeliverResult = jest.fn();
const mockTrackSearch = jest.fn();
const mockCanUseCommand = jest.fn();

jest.unstable_mockModule('../src/services/tmdbService.js', () => ({
  getPosterUrl: jest.fn(() => null),
  getGenres: mockGetGenres,
  searchPeople: mockSearchPeople,
  getPersonById: mockGetPersonById,
  discoverTitles: mockDiscoverTitles,
  getMovieDetails: mockGetMovieDetails,
  getTVShowDetails: mockGetTVShowDetails,
  getSimilarMovies: mockGetSimilarMovies,
  getSimilarTV: mockGetSimilarTV,
}));

jest.unstable_mockModule('../src/services/aiService.js', () => ({
  generateRecommendationRanking: mockGenerateRanking,
}));

jest.unstable_mockModule('../src/utils/watchHistoryManager.js', () => ({
  getWatchHistory: mockGetWatchHistory,
}));

jest.unstable_mockModule('../src/utils/guildConfig.js', () => ({
  canUseCommand: mockCanUseCommand,
}));

jest.unstable_mockModule('../src/utils/statsTracker.js', () => ({
  trackSearch: mockTrackSearch,
}));

jest.unstable_mockModule('../src/utils/interactionResponse.js', () => ({
  deliverResult: mockDeliverResult,
}));

let execute, autocomplete, data;
let resetGenreCache;

beforeAll(async () => {
  ({ execute, autocomplete, data } = await import('../src/commands/recommend.js'));
  ({ _resetGenreCache: resetGenreCache } = await import('../src/utils/genreCache.js'));
});

const MOVIE_GENRES = [
  { id: 27, name: 'Horror' }, { id: 35, name: 'Comedy' }, { id: 10749, name: 'Romance' },
];
const TV_GENRES = [
  { id: 10765, name: 'Sci-Fi & Fantasy' }, { id: 35, name: 'Comedy' },
];

beforeEach(() => {
  jest.clearAllMocks();
  resetGenreCache();

  mockCanUseCommand.mockResolvedValue(true);
  mockGetWatchHistory.mockResolvedValue([]);
  mockGetGenres.mockImplementation(type =>
    Promise.resolve(type === 'movie' ? MOVIE_GENRES : TV_GENRES));
  mockDiscoverTitles.mockResolvedValue([]);
  mockGetSimilarMovies.mockResolvedValue([]);
  mockGetSimilarTV.mockResolvedValue([]);
  mockGenerateRanking.mockResolvedValue(null);
  mockTrackSearch.mockResolvedValue(undefined);
  mockDeliverResult.mockResolvedValue(undefined);
  mockGetMovieDetails.mockResolvedValue({ external_ids: { imdb_id: 'tt0000001' } });
  mockGetTVShowDetails.mockResolvedValue({ external_ids: { imdb_id: 'tt0000002' } });
  mockGetPersonById.mockResolvedValue({ id: 11770, name: 'John Carpenter' });
});

function makeInteraction(options = {}) {
  return {
    guildId: 'guild-1',
    member: {},
    user: { id: 'user-1', username: 'tester' },
    options: {
      getString: name => options[name] ?? null,
      getBoolean: name => options[name] ?? null,
    },
    deferReply: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn().mockResolvedValue(undefined),
  };
}

function historyEntry(overrides = {}) {
  return {
    tmdbId: 1, type: 'movie', title: 'A Film', year: '1999',
    watchedAt: 1000, ...overrides,
  };
}

/** The embed handed to deliverResult. */
function deliveredEmbed() {
  expect(mockDeliverResult).toHaveBeenCalled();
  return mockDeliverResult.mock.calls[0][1].embeds[0].data;
}

describe('command definition', () => {
  test('every option is optional, so a bare /recommend works', () => {
    const json = data.toJSON();
    expect(json.options.every(o => !o.required)).toBe(true);
  });

  test('genre and director use autocomplete', () => {
    const json = data.toJSON();
    const byName = Object.fromEntries(json.options.map(o => [o.name, o]));
    expect(byName.genre.autocomplete).toBe(true);
    expect(byName.director.autocomplete).toBe(true);
  });
});

describe('permission gate', () => {
  test('refuses when the command is disabled for regular users', async () => {
    mockCanUseCommand.mockResolvedValue(false);
    const interaction = makeInteraction();

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('currently disabled') })
    );
    expect(mockDeliverResult).not.toHaveBeenCalled();
  });
});

describe('source defaults', () => {
  test('uses Discover when the server has no history', async () => {
    mockGetWatchHistory.mockResolvedValue([]);
    mockDiscoverTitles.mockResolvedValue([
      { id: 10, title: 'Something', release_date: '2001-01-01', vote_average: 7 },
    ]);

    await execute(makeInteraction());

    expect(mockDiscoverTitles).toHaveBeenCalled();
    expect(mockGetSimilarMovies).not.toHaveBeenCalled();
  });

  test('uses Watch History when the server has history', async () => {
    mockGetWatchHistory.mockResolvedValue([historyEntry()]);
    mockGetSimilarMovies.mockResolvedValue([
      { id: 99, title: 'Similar Film', release_date: '2003-01-01', vote_average: 7, vote_count: 900 },
    ]);

    await execute(makeInteraction());

    expect(mockGetSimilarMovies).toHaveBeenCalled();
  });

  test('a director filter forces Discover, since history says nothing about crew', async () => {
    mockGetWatchHistory.mockResolvedValue([historyEntry()]);
    mockDiscoverTitles.mockResolvedValue([
      { id: 11, title: 'The Thing', release_date: '1982-01-01', vote_average: 8.1 },
    ]);

    await execute(makeInteraction({ director: '11770' }));

    expect(mockDiscoverTitles).toHaveBeenCalledWith('movie', expect.objectContaining({ personId: '11770' }));
  });
});

describe('most-watched', () => {
  test('falls back to "Recently Watched" when nothing has been rewatched', async () => {
    mockGetWatchHistory.mockResolvedValue([
      historyEntry({ tmdbId: 1, title: 'One', watchedAt: 300 }),
      historyEntry({ tmdbId: 2, title: 'Two', watchedAt: 200 }),
    ]);

    await execute(makeInteraction({ source: 'most-watched' }));

    const embed = deliveredEmbed();
    expect(embed.title).toContain('Recently Watched');
    expect(embed.description).toContain('more than once');
  });

  test('shows a real ranking once something has been rewatched', async () => {
    mockGetWatchHistory.mockResolvedValue([
      historyEntry({ tmdbId: 1, title: 'Rewatched', watchedAt: 300 }),
      historyEntry({ tmdbId: 1, title: 'Rewatched', watchedAt: 200 }),
      historyEntry({ tmdbId: 2, title: 'Once', watchedAt: 100 }),
    ]);

    await execute(makeInteraction({ source: 'most-watched' }));

    const embed = deliveredEmbed();
    expect(embed.title).toContain('Most Watched');
    expect(embed.fields[0].name).toContain('Rewatched');
    expect(embed.fields[0].value).toContain('2 plays');
    // The single-play entry gets no count badge.
    expect(embed.fields[1].value).not.toContain('plays');
  });

  test('guides the user when there is no history at all', async () => {
    mockGetWatchHistory.mockResolvedValue([]);
    const interaction = makeInteraction({ source: 'most-watched' });

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('/watched add') })
    );
    expect(mockDeliverResult).not.toHaveBeenCalled();
  });
});

describe('AI ranking', () => {
  const seeded = [historyEntry({ tmdbId: 1, title: 'Seed' })];
  const similar = Array.from({ length: 6 }, (_, i) => ({
    id: 100 + i, title: `Candidate ${i}`, release_date: '2000-01-01',
    vote_average: 7, vote_count: 500, genre_ids: [27], overview: 'x',
  }));

  test('uses the AI order and reasons when available', async () => {
    mockGetWatchHistory.mockResolvedValue(seeded);
    mockGetSimilarMovies.mockResolvedValue(similar);
    mockGenerateRanking.mockResolvedValue([
      { index: 2, reason: 'Tonally spot on.' },
      { index: 0, reason: 'A close cousin.' },
    ]);

    await execute(makeInteraction({ type: 'movie' }));

    const embed = deliveredEmbed();
    expect(embed.fields[0].name).toContain('Candidate 2');
    expect(embed.fields[0].value).toContain('Tonally spot on.');
    expect(embed.footer.text).toContain('AI');
  });

  test('still returns results when the AI is unavailable', async () => {
    mockGetWatchHistory.mockResolvedValue(seeded);
    mockGetSimilarMovies.mockResolvedValue(similar);
    mockGenerateRanking.mockResolvedValue(null);

    await execute(makeInteraction({ type: 'movie' }));

    const embed = deliveredEmbed();
    expect(embed.fields.length).toBe(5);
    expect(embed.footer.text).toContain('popularity and similarity');
    expect(embed.fields[0].value).not.toContain('*');
  });

  test('excludes titles the server already watched', async () => {
    mockGetWatchHistory.mockResolvedValue([historyEntry({ tmdbId: 100 })]);
    mockGetSimilarMovies.mockResolvedValue(similar);

    await execute(makeInteraction({ type: 'movie' }));

    const embed = deliveredEmbed();
    expect(embed.fields.map(f => f.name).join(' ')).not.toContain('Candidate 0');
  });
});

describe('links', () => {
  test('movies get IMDb and Letterboxd', async () => {
    mockGetWatchHistory.mockResolvedValue([historyEntry()]);
    mockGetSimilarMovies.mockResolvedValue([
      { id: 50, title: 'Film', release_date: '1999-01-01', vote_average: 7, vote_count: 900 },
    ]);

    await execute(makeInteraction({ type: 'movie' }));

    const value = deliveredEmbed().fields[0].value;
    expect(value).toContain('imdb.com/title/tt0000001');
    expect(value).toContain('letterboxd.com/imdb/tt0000001');
  });

  test('TV gets IMDb but never Letterboxd', async () => {
    mockGetWatchHistory.mockResolvedValue([historyEntry({ type: 'tv', tmdbId: 7 })]);
    mockGetSimilarTV.mockResolvedValue([
      { id: 60, name: 'A Show', first_air_date: '1989-01-01', vote_average: 8, vote_count: 900 },
    ]);

    await execute(makeInteraction({ type: 'tv' }));

    const value = deliveredEmbed().fields[0].value;
    expect(value).toContain('imdb.com/title');
    expect(value).not.toContain('letterboxd');
  });

  test('a failed details lookup still renders the entry, without links', async () => {
    mockGetWatchHistory.mockResolvedValue([historyEntry()]);
    mockGetSimilarMovies.mockResolvedValue([
      { id: 50, title: 'Film', release_date: '1999-01-01', vote_average: 7, vote_count: 900 },
    ]);
    mockGetMovieDetails.mockRejectedValue(new Error('TMDB down'));

    await execute(makeInteraction({ type: 'movie' }));

    const embed = deliveredEmbed();
    expect(embed.fields[0].name).toContain('Film');
    expect(embed.fields[0].value).not.toContain('imdb.com');
  });
});

describe('privacy', () => {
  test('defers ephemerally so the work is never half-public', async () => {
    const interaction = makeInteraction();
    await execute(interaction);
    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
  });

  test.each([[true], [false]])('passes private:%s through to deliverResult', async (isPrivate) => {
    mockGetWatchHistory.mockResolvedValue([historyEntry()]);
    mockGetSimilarMovies.mockResolvedValue([
      { id: 50, title: 'Film', release_date: '1999-01-01', vote_average: 7, vote_count: 900 },
    ]);

    await execute(makeInteraction({ type: 'movie', private: isPrivate }));

    expect(mockDeliverResult).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), isPrivate
    );
  });
});

describe('stats', () => {
  test('tracks only the top pick, not all five', async () => {
    mockGetWatchHistory.mockResolvedValue([historyEntry()]);
    mockGetSimilarMovies.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({
        id: 200 + i, title: `Film ${i}`, release_date: '2000-01-01',
        vote_average: 7, vote_count: 900,
      }))
    );

    await execute(makeInteraction({ type: 'movie' }));

    expect(mockTrackSearch).toHaveBeenCalledTimes(1);
  });
});

describe('autocomplete', () => {
  function autoInteraction(focusedName, value, options = {}) {
    return {
      options: {
        getFocused: () => ({ name: focusedName, value }),
        getString: name => options[name] ?? null,
      },
      respond: jest.fn().mockResolvedValue(undefined),
    };
  }

  test('offers no Horror for TV, because TMDB has no TV horror genre', async () => {
    const interaction = autoInteraction('genre', '', { type: 'tv' });

    await autocomplete(interaction);

    const names = interaction.respond.mock.calls[0][0].map(c => c.name);
    expect(names).not.toContain('Horror');
    expect(names).toContain('Sci-Fi & Fantasy');
  });

  test('offers Horror for movies', async () => {
    const interaction = autoInteraction('genre', 'hor', { type: 'movie' });

    await autocomplete(interaction);

    expect(interaction.respond.mock.calls[0][0][0].name).toBe('Horror');
  });

  test('never returns more than Discord allows', async () => {
    mockGetGenres.mockResolvedValue(
      Array.from({ length: 40 }, (_, i) => ({ id: i, name: `Genre ${i}` }))
    );
    const interaction = autoInteraction('genre', '', { type: 'movie' });

    await autocomplete(interaction);

    expect(interaction.respond.mock.calls[0][0].length).toBeLessThanOrEqual(25);
  });

  test('waits for enough characters before searching people', async () => {
    const interaction = autoInteraction('director', 'jo');

    await autocomplete(interaction);

    expect(mockSearchPeople).not.toHaveBeenCalled();
    expect(interaction.respond).toHaveBeenCalledWith([]);
  });

  test('labels people with their department so directors are distinguishable', async () => {
    mockSearchPeople.mockResolvedValue([
      { id: 11770, name: 'John Carpenter', known_for_department: 'Directing' },
      { id: 2244869, name: 'John Carpenter', known_for_department: 'Acting' },
    ]);
    const interaction = autoInteraction('director', 'john carpenter');

    await autocomplete(interaction);

    const choices = interaction.respond.mock.calls[0][0];
    expect(choices[0].name).toContain('Directing');
    expect(choices[0].value).toBe('11770');
  });

  test('responds empty rather than erroring when TMDB fails', async () => {
    mockGetGenres.mockRejectedValue(new Error('TMDB down'));
    const interaction = autoInteraction('genre', 'x', { type: 'movie' });

    await autocomplete(interaction);

    expect(interaction.respond).toHaveBeenCalledWith([]);
  });
});

describe('failure handling', () => {
  test('reports a friendly error instead of throwing', async () => {
    mockGetWatchHistory.mockRejectedValue(new Error('disk on fire'));
    const interaction = makeInteraction();

    await expect(execute(interaction)).resolves.toBeUndefined();

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Something went wrong') })
    );
  });

  test('explains an empty discover result', async () => {
    mockDiscoverTitles.mockResolvedValue([]);
    const interaction = makeInteraction({ source: 'discover', genre: '27' });

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Nothing found') })
    );
  });
});

/**
 * Tests for /announce — generates watch party announcement text and hands
 * it back as a private (ephemeral) code block for the moderator to copy and
 * post themselves. Never posts anywhere publicly, never touches config, and
 * doesn't integrate with /timer (deliberately cut-down scope — see the
 * approved plan for the larger design this replaced).
 *
 * Run with: npx jest tests/announce-command.test.js --verbose
 */

import { describe, test, expect, jest, beforeAll, beforeEach } from '@jest/globals';

const mockSearchMovies = jest.fn();
const mockSearchTVShows = jest.fn();
const mockGetMovieDetails = jest.fn();
const mockGetTVShowDetails = jest.fn();
const mockGetUnifiedMovieWatchProviders = jest.fn();
const mockGetUnifiedTVWatchProviders = jest.fn();
const mockGenerateAnnouncementText = jest.fn();
const mockLoadGuildConfig = jest.fn();

jest.unstable_mockModule('../src/services/tmdbService.js', () => ({
  searchMovies: mockSearchMovies,
  searchTVShows: mockSearchTVShows,
  getMovieDetails: mockGetMovieDetails,
  getTVShowDetails: mockGetTVShowDetails,
  getUnifiedMovieWatchProviders: mockGetUnifiedMovieWatchProviders,
  getUnifiedTVWatchProviders: mockGetUnifiedTVWatchProviders,
}));

jest.unstable_mockModule('../src/services/aiService.js', () => ({
  hybridSearch: jest.fn(async (query, searchFn) => searchFn(query)),
  generateAnnouncementText: mockGenerateAnnouncementText,
}));

jest.unstable_mockModule('../src/utils/embedBuilder.js', () => ({
  normalizeProviders: (providers) => [...new Set(providers.map(p => p.provider_name))],
}));

jest.unstable_mockModule('../src/utils/guildConfig.js', () => ({
  isAdmin: (member) => member?.isAdmin === true,
  loadGuildConfig: mockLoadGuildConfig,
}));

let execute;

beforeAll(async () => {
  ({ execute } = await import('../src/commands/announce.js'));
});

beforeEach(() => {
  mockSearchMovies.mockReset().mockResolvedValue([]);
  mockSearchTVShows.mockReset().mockResolvedValue([]);
  mockGetMovieDetails.mockReset();
  mockGetTVShowDetails.mockReset();
  mockGetUnifiedMovieWatchProviders.mockReset().mockResolvedValue(null);
  mockGetUnifiedTVWatchProviders.mockReset().mockResolvedValue(null);
  mockGenerateAnnouncementText.mockReset().mockResolvedValue('A spooky tale awaits...');
  mockLoadGuildConfig.mockReset().mockResolvedValue({ region: 'US' });
});

function makeInteraction({ isAdmin = true, options = {} } = {}) {
  return {
    guildId: 'guild-1',
    member: { isAdmin },
    replied: false,
    deferred: false,
    options: {
      getString: (name) => options[name] ?? null,
    },
    reply: jest.fn().mockResolvedValue(undefined),
    deferReply: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
  };
}

describe('/announce — permissions', () => {
  test('rejects a non-admin/moderator user without deferring', async () => {
    const interaction = makeInteraction({ isAdmin: false, options: { title1: 'Hellraiser', time: '8:00 PM' } });

    await execute(interaction);

    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('permissions'), ephemeral: true })
    );
  });
});

describe('/announce — single title', () => {
  test('resolves a movie, includes streaming availability and AI text in the reply', async () => {
    mockSearchMovies.mockResolvedValue([{ id: 1 }]);
    mockGetMovieDetails.mockResolvedValue({
      title: 'Hellraiser', overview: 'A puzzle box.', external_ids: { imdb_id: 'tt0093177' },
    });
    mockGetUnifiedMovieWatchProviders.mockResolvedValue({
      flatrate: [{ provider_name: 'Shudder' }, { provider_name: 'AMC+' }],
    });

    const interaction = makeInteraction({ options: { title1: 'Hellraiser', time: '8:00 PM EST' } });
    await execute(interaction);

    const replyArg = interaction.editReply.mock.calls[0][0];
    expect(replyArg.content).toContain('A spooky tale awaits...');
    expect(replyArg.content).toContain('8:00 PM EST');
    expect(replyArg.content).toContain('Shudder and AMC+');
  });

  test('reports a clear error when the title cannot be found', async () => {
    mockSearchMovies.mockResolvedValue([]);
    mockSearchTVShows.mockResolvedValue([]);

    const interaction = makeInteraction({ options: { title1: 'Nonexistent Movie XYZ', time: '8:00 PM' } });
    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("Couldn't find") })
    );
    expect(mockGenerateAnnouncementText).not.toHaveBeenCalled();
  });

  test('falls back to a plain template and notes AI was unavailable when generateAnnouncementText returns null', async () => {
    mockSearchMovies.mockResolvedValue([{ id: 1 }]);
    mockGetMovieDetails.mockResolvedValue({ title: 'Hellraiser', overview: 'A puzzle box.', external_ids: {} });
    mockGenerateAnnouncementText.mockResolvedValue(null);

    const interaction = makeInteraction({ options: { title1: 'Hellraiser', time: '8:00 PM' } });
    await execute(interaction);

    const replyArg = interaction.editReply.mock.calls[0][0];
    expect(replyArg.content).toContain('Hellraiser');
    expect(replyArg.content).toContain('AI generation was unavailable');
  });
});

describe('/announce — two titles', () => {
  test('resolves both a TV episode range and a movie in one announcement', async () => {
    mockSearchTVShows.mockResolvedValue([{ id: 10 }]);
    mockGetTVShowDetails.mockResolvedValue({
      name: 'Tales from the Crypt', overview: 'A horror anthology.', external_ids: {},
    });
    mockSearchMovies
      .mockResolvedValueOnce([]) // title1 also gets a movie search — no match, it's a TV show
      .mockResolvedValueOnce([{ id: 1 }]); // title2 movie search
    mockGetMovieDetails.mockResolvedValue({ title: 'Hellraiser', overview: 'A puzzle box.', external_ids: {} });

    const interaction = makeInteraction({
      options: {
        title1: 'Tales from the Crypt', episodes1: 'S3E9-E12',
        title2: 'Hellraiser',
        time: '8:00 PM EST',
      },
    });
    await execute(interaction);

    expect(mockGenerateAnnouncementText).toHaveBeenCalledWith(
      expect.objectContaining({
        segments: [
          expect.objectContaining({ type: 'tv', title: 'Tales from the Crypt', episodes: 'S3E9-E12' }),
          expect.objectContaining({ type: 'movie', title: 'Hellraiser' }),
        ],
      })
    );
  });
});

describe('/announce — tone', () => {
  test('passes tone and customTone through to generateAnnouncementText', async () => {
    mockSearchMovies.mockResolvedValue([{ id: 1 }]);
    mockGetMovieDetails.mockResolvedValue({ title: 'Hellraiser', overview: 'x', external_ids: {} });

    const interaction = makeInteraction({
      options: { title1: 'Hellraiser', time: '8:00 PM', tone: 'scary', 'custom-tone': 'like a noir detective' },
    });
    await execute(interaction);

    expect(mockGenerateAnnouncementText).toHaveBeenCalledWith(
      expect.objectContaining({ tone: 'scary', customTone: 'like a noir detective' })
    );
  });
});

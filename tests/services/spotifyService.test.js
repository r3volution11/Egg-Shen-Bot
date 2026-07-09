import { jest } from '@jest/globals';

// A mutable config object — tests toggle clientId/clientSecret to simulate missing creds.
const mockConfig = {
  apis: {
    spotify: { clientId: 'test-client-id', clientSecret: 'test-client-secret' },
  },
};

jest.unstable_mockModule('../../src/config.js', () => ({ config: mockConfig }));

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

const TOKEN_RESPONSE = jsonResponse({ access_token: 'tok-123', expires_in: 3600 });

/**
 * spotifyService caches accessToken/tokenExpiry/premiumRequired at module scope with
 * no exported reset function, so tests that depend on a clean slate for that state
 * must get a fresh module instance via resetModules() + re-import rather than share
 * the module-level import used by the rest of this file.
 */
async function freshSpotifyService() {
  jest.resetModules();
  return import('../../src/services/spotifyService.js');
}

let spotifyService;
beforeAll(async () => {
  spotifyService = await import('../../src/services/spotifyService.js');
});

beforeEach(() => {
  global.fetch = jest.fn();
  mockConfig.apis.spotify.clientId = 'test-client-id';
  mockConfig.apis.spotify.clientSecret = 'test-client-secret';
});

describe('searchSoundtrack', () => {
  test('returns null (not throw) when credentials are missing', async () => {
    const svc = await freshSpotifyService();
    mockConfig.apis.spotify.clientId = null;
    mockConfig.apis.spotify.clientSecret = null;

    const result = await svc.searchSoundtrack('The Thing');

    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('filters results by soundtrack keywords when a match exists', async () => {
    const svc = await freshSpotifyService();
    global.fetch
      .mockResolvedValueOnce(TOKEN_RESPONSE)
      .mockResolvedValueOnce(
        jsonResponse({
          albums: {
            items: [
              { name: 'The Thing (Unrelated Remix)', artists: [{ name: 'DJ X' }], release_date: '2020', total_tracks: 1, external_urls: { spotify: 'url1' }, images: [] },
              { name: 'The Thing - Original Motion Picture Soundtrack', artists: [{ name: 'Ennio Morricone' }], release_date: '1982', total_tracks: 12, external_urls: { spotify: 'url2' }, images: [{ url: 'img.jpg' }] },
            ],
          },
        })
      );

    const result = await svc.searchSoundtrack('The Thing');

    expect(result.name).toBe('The Thing - Original Motion Picture Soundtrack');
    expect(result.artists).toBe('Ennio Morricone');
    expect(result.imageUrl).toBe('img.jpg');
  });

  test('falls back to unfiltered items when nothing matches soundtrack keywords', async () => {
    const svc = await freshSpotifyService();
    global.fetch
      .mockResolvedValueOnce(TOKEN_RESPONSE)
      .mockResolvedValueOnce(
        jsonResponse({
          albums: {
            items: [
              { name: 'Totally Unrelated Album', artists: [{ name: 'Someone' }], release_date: '2020', total_tracks: 1, external_urls: { spotify: 'url1' }, images: [] },
            ],
          },
        })
      );

    const result = await svc.searchSoundtrack('Obscure Movie');

    expect(result.name).toBe('Totally Unrelated Album');
  });

  test('returns null when the search returns no albums', async () => {
    const svc = await freshSpotifyService();
    global.fetch.mockResolvedValueOnce(TOKEN_RESPONSE).mockResolvedValueOnce(jsonResponse({ albums: { items: [] } }));

    const result = await svc.searchSoundtrack('Nonexistent Movie');

    expect(result).toBeNull();
  });

  test('a 403 on search sets premiumRequired and returns null instead of throwing', async () => {
    const svc = await freshSpotifyService();
    global.fetch.mockResolvedValueOnce(TOKEN_RESPONSE).mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 403 }));

    const result = await svc.searchSoundtrack('The Thing');

    expect(result).toBeNull();
    expect(svc.isConfigured()).toBe(false); // premiumRequired now short-circuits isConfigured()
  });

  test('a generic (non-403) failure returns null instead of throwing', async () => {
    const svc = await freshSpotifyService();
    global.fetch.mockResolvedValueOnce(TOKEN_RESPONSE).mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 500 }));

    const result = await svc.searchSoundtrack('The Thing');

    expect(result).toBeNull();
  });

  test('caches the access token across calls within the same module instance', async () => {
    const svc = await freshSpotifyService();
    global.fetch
      .mockResolvedValueOnce(TOKEN_RESPONSE) // token fetch (1st call only)
      .mockResolvedValueOnce(jsonResponse({ albums: { items: [] } } ))
      .mockResolvedValueOnce(jsonResponse({ albums: { items: [] } } ));

    await svc.searchSoundtrack('Movie One');
    await svc.searchSoundtrack('Movie Two');

    // 1 token fetch + 2 search fetches = 3 total; token endpoint not hit twice.
    expect(global.fetch).toHaveBeenCalledTimes(3);
    const tokenCalls = global.fetch.mock.calls.filter(([url]) => url.includes('accounts.spotify.com'));
    expect(tokenCalls).toHaveLength(1);
  });
});

describe('getAlbumDetails', () => {
  test('returns full album + track shape, formatting durations as m:ss', async () => {
    const svc = await freshSpotifyService();
    global.fetch.mockResolvedValueOnce(TOKEN_RESPONSE).mockResolvedValueOnce(
      jsonResponse({
        name: 'The Thing - OST',
        artists: [{ name: 'Ennio Morricone' }],
        release_date: '1982',
        total_tracks: 2,
        external_urls: { spotify: 'album-url' },
        images: [{ url: 'cover.jpg' }],
        label: 'Varese Sarabande',
        tracks: {
          items: [
            { track_number: 1, name: 'Humanity (Part 1)', duration_ms: 65000, artists: [{ name: 'Ennio Morricone' }], preview_url: null },
            { track_number: 2, name: 'Contamination', duration_ms: 9000, artists: [{ name: 'Ennio Morricone' }], preview_url: 'preview-url' },
          ],
        },
      })
    );

    const result = await svc.getAlbumDetails('album-1');

    expect(result.name).toBe('The Thing - OST');
    expect(result.tracks).toHaveLength(2);
    expect(result.tracks[0].duration).toBe('1:05');
    expect(result.tracks[1].duration).toBe('0:09'); // sub-10-second padding
  });

  test('a 403 sets premiumRequired and returns null', async () => {
    const svc = await freshSpotifyService();
    global.fetch.mockResolvedValueOnce(TOKEN_RESPONSE).mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 403 }));

    const result = await svc.getAlbumDetails('album-1');

    expect(result).toBeNull();
    expect(svc.isConfigured()).toBe(false);
  });

  test('a generic failure returns null instead of throwing', async () => {
    const svc = await freshSpotifyService();
    global.fetch.mockResolvedValueOnce(TOKEN_RESPONSE).mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 500 }));

    const result = await svc.getAlbumDetails('album-1');

    expect(result).toBeNull();
  });
});

describe('isConfigured', () => {
  test('true when both credentials are set and premium is not required', async () => {
    const svc = await freshSpotifyService();
    expect(svc.isConfigured()).toBe(true);
  });

  test('false when credentials are missing', async () => {
    const svc = await freshSpotifyService();
    mockConfig.apis.spotify.clientId = null;
    expect(svc.isConfigured()).toBe(false);
  });

  test('false once premiumRequired has been set by a prior 403, even with valid credentials', async () => {
    const svc = await freshSpotifyService();
    global.fetch.mockResolvedValueOnce(TOKEN_RESPONSE).mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 403 }));
    await svc.searchSoundtrack('The Thing');

    expect(svc.isConfigured()).toBe(false);
  });
});

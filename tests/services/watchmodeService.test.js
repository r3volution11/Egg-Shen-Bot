/**
 * Watchmode's sources, sorted into the lists the bot uses. Free sources
 * stay in `flatrate` (where /movie's "Stream" line has always shown them)
 * and are also listed in `free`, so the event-request streaming line can
 * mark them free (src/utils/eventStreaming.js).
 *
 * Run with: npm test -- tests/services/watchmodeService.test.js
 */
import { jest, describe, test, expect, beforeAll } from '@jest/globals';

const mockGet = jest.fn();
jest.unstable_mockModule('axios', () => ({
  default: { create: jest.fn(() => ({ get: mockGet })) },
}));
jest.unstable_mockModule('../../src/config.js', () => ({
  config: { apis: { watchmode: { baseUrl: 'https://api.watchmode.test', apiKey: 'test-key' } } },
}));

let watchmode;
beforeAll(async () => {
  watchmode = await import('../../src/services/watchmodeService.js');
});

describe('getWatchmodeProvidersByImdbId', () => {
  test('sources are sorted by type; free ones are in both flatrate and free', async () => {
    mockGet.mockResolvedValueOnce({ data: [
      { source_id: 1, name: 'Shudder', type: 'sub' },
      { source_id: 2, name: 'Tubi TV', type: 'free' },
      { source_id: 3, name: 'Apple TV', type: 'rent' },
      { source_id: 4, name: 'Vudu', type: 'buy' },
    ] });
    const r = await watchmode.getWatchmodeProvidersByImdbId('tt1', 'US');
    const names = (list) => list.map(p => p.provider_name);
    expect(names(r.flatrate)).toEqual(['Shudder', 'Tubi TV']);
    expect(names(r.free)).toEqual(['Tubi TV']);
    expect(names(r.rent)).toEqual(['Apple TV']);
    expect(names(r.buy)).toEqual(['Vudu']);
  });
});

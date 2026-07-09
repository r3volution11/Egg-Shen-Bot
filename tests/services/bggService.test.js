import { jest } from '@jest/globals';

const mockGet = jest.fn();
const mockAxiosInstance = { get: mockGet };

jest.unstable_mockModule('axios', () => ({
  default: { create: jest.fn(() => mockAxiosInstance) },
}));

jest.unstable_mockModule('../../src/config.js', () => ({
  config: {
    apis: {
      bgg: { clientId: null, baseUrl: 'https://boardgamegeek.com/xmlapi2' },
    },
  },
}));

let bggService;
beforeAll(async () => {
  bggService = await import('../../src/services/bggService.js');
});

beforeEach(() => {
  mockGet.mockReset();
});

// fast-xml-parser is NOT mocked — these fixtures exercise the real XML->object
// normalization logic, which is the highest-value/most-complex part of this service.

const SEARCH_MULTI_XML = `
<items total="2">
  <item type="boardgame" id="13">
    <name type="primary" value="Catan"/>
    <yearpublished value="1995"/>
  </item>
  <item type="boardgame" id="822">
    <name type="primary" value="Carcassonne"/>
    <yearpublished value="2000"/>
  </item>
</items>`;

const SEARCH_SINGLE_XML = `
<items total="1">
  <item type="boardgame" id="13">
    <name type="primary" value="Catan"/>
    <yearpublished value="1995"/>
  </item>
</items>`;

const SEARCH_EMPTY_XML = `<items total="0"></items>`;

const DETAILS_FULL_XML = `
<items>
  <item type="boardgame" id="13">
    <name type="primary" value="Catan"/>
    <name type="alternate" value="Die Siedler von Catan"/>
    <description>Classic trading and building game.</description>
    <image>https://example.com/catan.jpg</image>
    <thumbnail>https://example.com/catan-thumb.jpg</thumbnail>
    <yearpublished value="1995"/>
    <minplayers value="3"/>
    <maxplayers value="4"/>
    <playingtime value="90"/>
    <minplaytime value="60"/>
    <maxplaytime value="90"/>
    <minage value="10"/>
    <link type="boardgamecategory" id="1021" value="Negotiation"/>
    <link type="boardgamecategory" id="1030" value="Territory Building"/>
    <link type="boardgamemechanic" id="2015" value="Trading"/>
    <link type="boardgamedesigner" id="8" value="Klaus Teuber"/>
    <link type="boardgamepublisher" id="4" value="KOSMOS"/>
    <statistics>
      <ratings>
        <average value="7.15"/>
        <bayesaverage value="7.01"/>
        <usersrated value="100000"/>
        <ranks>
          <rank value="15"/>
        </ranks>
        <averageweight value="2.32"/>
      </ratings>
    </statistics>
  </item>
</items>`;

// Only ONE <link> total (a category), to exercise the non-array single-link edge case.
const DETAILS_SINGLE_LINK_XML = `
<items>
  <item type="boardgame" id="99">
    <name type="primary" value="Solo Game"/>
    <description>A game with only one category link.</description>
    <yearpublished value="2020"/>
    <link type="boardgamecategory" id="1021" value="Solo / Solitaire Game"/>
    <statistics>
      <ratings>
        <average value="6.5"/>
        <bayesaverage value="6.0"/>
        <usersrated value="500"/>
        <ranks><rank value="2000"/></ranks>
        <averageweight value="1.5"/>
      </ratings>
    </statistics>
  </item>
</items>`;

const DETAILS_NOT_FOUND_XML = `<items></items>`;

describe('searchBoardGames', () => {
  test('parses a multi-item XML response into an array', async () => {
    mockGet.mockResolvedValueOnce({ data: SEARCH_MULTI_XML });

    const result = await bggService.searchBoardGames('catan');

    expect(result).toEqual([
      { id: '13', name: 'Catan', yearPublished: '1995' },
      { id: '822', name: 'Carcassonne', yearPublished: '2000' },
    ]);
  });

  test('coerces a single-item response (BGG returns a bare object, not an array)', async () => {
    mockGet.mockResolvedValueOnce({ data: SEARCH_SINGLE_XML });

    const result = await bggService.searchBoardGames('catan');

    expect(result).toEqual([{ id: '13', name: 'Catan', yearPublished: '1995' }]);
  });

  test('returns [] when there are no results', async () => {
    mockGet.mockResolvedValueOnce({ data: SEARCH_EMPTY_XML });
    const result = await bggService.searchBoardGames('zzzznonexistent');
    expect(result).toEqual([]);
  });

  test('throws a wrapped error on request failure', async () => {
    mockGet.mockRejectedValueOnce(new Error('network down'));
    await expect(bggService.searchBoardGames('catan')).rejects.toThrow('Failed to search for board games');
  });
});

describe('getBoardGameDetails', () => {
  test('fully normalizes a details response: name, links bucketed by type, nested rating', async () => {
    mockGet.mockResolvedValueOnce({ data: DETAILS_FULL_XML });

    const result = await bggService.getBoardGameDetails(13);

    expect(result.id).toBe('13');
    expect(result.name).toBe('Catan');
    expect(result.description).toBe('Classic trading and building game.');
    expect(result.minPlayers).toBe('3');
    expect(result.maxPlayers).toBe('4');
    expect(result.categories).toEqual([
      { id: '1021', name: 'Negotiation' },
      { id: '1030', name: 'Territory Building' },
    ]);
    expect(result.mechanics).toEqual([{ id: '2015', name: 'Trading' }]);
    expect(result.designers).toEqual(['Klaus Teuber']);
    expect(result.publishers).toEqual(['KOSMOS']);
    expect(result.rating).toEqual({
      average: '7.15',
      bayesAverage: '7.01',
      usersRated: '100000',
      rank: '15',
    });
    expect(result.complexity).toBe('2.32');
  });

  test('coerces a single non-array <link> the same way as multiple links', async () => {
    mockGet.mockResolvedValueOnce({ data: DETAILS_SINGLE_LINK_XML });

    const result = await bggService.getBoardGameDetails(99);

    expect(result.categories).toEqual([{ id: '1021', name: 'Solo / Solitaire Game' }]);
    expect(result.mechanics).toEqual([]);
    expect(result.designers).toEqual([]);
    expect(result.publishers).toEqual([]);
  });

  test('throws a wrapped "not found" error when the item is missing', async () => {
    mockGet.mockResolvedValueOnce({ data: DETAILS_NOT_FOUND_XML });
    await expect(bggService.getBoardGameDetails(999999)).rejects.toThrow('Failed to get board game details');
  });

  test('throws a wrapped error on request failure', async () => {
    mockGet.mockRejectedValueOnce(new Error('network down'));
    await expect(bggService.getBoardGameDetails(13)).rejects.toThrow('Failed to get board game details');
  });
});

describe('getRandomBoardGame', () => {
  const HOT_XML = `
    <items>
      <item id="13"/>
      <item id="99"/>
    </items>`;

  test('picks from the hot games list and returns full details', async () => {
    mockGet
      .mockResolvedValueOnce({ data: HOT_XML }) // getHotBoardGames
      .mockResolvedValueOnce({ data: DETAILS_FULL_XML }); // getBoardGameDetails for whichever id is picked

    const result = await bggService.getRandomBoardGame({});

    expect(['13', '99']).toContain(result.id);
  });

  test('throws when the hot games list is empty', async () => {
    mockGet.mockResolvedValueOnce({ data: `<items></items>` }); // getHotBoardGames -> []
    await expect(bggService.getRandomBoardGame({})).rejects.toThrow('Failed to get random board game');
  });

  test('retries with a different game when the first pick fails the minPlayers filter', async () => {
    // Catan requires 3 players; filter demands minPlayers <= 2, so it should retry.
    mockGet
      .mockResolvedValueOnce({ data: HOT_XML }) // getHotBoardGames
      .mockResolvedValueOnce({ data: DETAILS_FULL_XML }) // first pick: Catan (minPlayers=3, fails filter)
      .mockResolvedValueOnce({ data: DETAILS_SINGLE_LINK_XML }); // retry pick

    const result = await bggService.getRandomBoardGame({ minPlayers: 2 });

    expect(mockGet).toHaveBeenCalledTimes(3);
    expect(result.id).toBe('99');
  });
});

describe('getSimilarBoardGames', () => {
  test('returns games sharing at least one category, sorted by shared-category count', async () => {
    mockGet
      .mockResolvedValueOnce({ data: DETAILS_FULL_XML }) // getBoardGameDetails(13) - the source game
      .mockResolvedValueOnce({ data: `<items><item id="99"/></items>` }) // getHotBoardGames
      .mockResolvedValueOnce({ data: DETAILS_SINGLE_LINK_XML }); // getBoardGameDetails(99) - shares no category with 13

    const result = await bggService.getSimilarBoardGames(13);

    // DETAILS_SINGLE_LINK_XML's category (1021 "Solo") IS also present on game 13, so it should match.
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('99');
    expect(result[0].sharedCategories).toBe(1);
  });

  test('throws a wrapped error when the source game lookup fails', async () => {
    mockGet.mockRejectedValueOnce(new Error('network down'));
    await expect(bggService.getSimilarBoardGames(13)).rejects.toThrow('Failed to get similar board games');
  });
});

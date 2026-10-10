/**
 * Public results say which command produced them.
 *
 * Search commands defer ephemeral and post their public answer as a plain
 * channel message, which loses Discord's own "used /command" header. The
 * header is how people watching learn the commands, so commandEcho.js puts
 * one back: a clickable command mention plus the option names used (not
 * their values — it advertises how, not what this person searched for).
 *
 * The end-to-end case runs a real ambiguous /movie through the real command,
 * then feeds the picker's own option value into the real select handler:
 * that path is where the original options are no longer on the interaction.
 *
 * Run with: npx jest tests/command-echo.test.js --verbose
 */

import { describe, test, expect, jest, beforeAll, beforeEach } from '@jest/globals';

const mockSearchMovies = jest.fn();
const mockGetMovieDetails = jest.fn();

jest.unstable_mockModule('../src/services/tmdbService.js', () => ({
  getPosterUrl: jest.fn(() => null),
  searchMovies: mockSearchMovies,
  getMovieAlternativeTitles: jest.fn().mockResolvedValue([]),
  getMovieAlternativeTitlesDetailed: jest.fn().mockResolvedValue([]),
  pickKnownAsTitle: jest.fn().mockReturnValue(null),
  getMovieDetails: mockGetMovieDetails,
  getTVShowDetails: jest.fn(),
  getUnifiedMovieWatchProviders: jest.fn().mockResolvedValue(null),
  getUnifiedTVWatchProviders: jest.fn().mockResolvedValue(null),
}));

jest.unstable_mockModule('../src/services/aiService.js', () => ({
  hybridSearch: jest.fn(async (query, searchFn) => searchFn(query)),
  pickLandslideWinner: jest.fn().mockReturnValue(null),
}));

jest.unstable_mockModule('../src/services/omdbService.js', () => ({
  getOMDBData: jest.fn().mockResolvedValue(null),
}));

jest.unstable_mockModule('../src/services/traktService.js', () => ({
  getMovieRating: jest.fn().mockResolvedValue(null),
  getShowRating: jest.fn().mockResolvedValue(null),
}));

jest.unstable_mockModule('../src/services/letterboxdService.js', () => ({
  getLetterboxdRating: jest.fn().mockResolvedValue(null),
}));

jest.unstable_mockModule('../src/services/bggService.js', () => ({
  getBoardGameDetails: jest.fn(),
}));

jest.unstable_mockModule('../src/utils/guildConfig.js', () => ({
  getEpisodeBufferMinutes: jest.fn(() => 5),
  getAutoDetectMode: jest.fn().mockReturnValue('ask'),
  canUseCommand: jest.fn().mockResolvedValue(true),
  loadGuildConfig: jest.fn().mockResolvedValue({ region: 'US', maxSearchResults: 20 }),
  getEnabledServices: jest.fn().mockResolvedValue({}),
  getEmojis: jest.fn().mockResolvedValue({}),
  getStatsConfig: jest.fn().mockResolvedValue({ enabled: false }),
}));

jest.unstable_mockModule('../src/utils/statsTracker.js', () => ({
  trackSearch: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../src/api/server.js', () => ({
  saveEventChannelSelections: jest.fn().mockResolvedValue(undefined),
}));

let movie, handleSelectInteraction, echo, deliverResult;

beforeAll(async () => {
  movie = await import('../src/commands/movie.js');
  ({ handleSelectInteraction } = await import('../src/handlers/selectHandler.js'));
  echo = await import('../src/utils/commandEcho.js');
  ({ deliverResult } = await import('../src/utils/interactionResponse.js'));
});

beforeEach(() => {
  echo._resetCommandEcho();
  mockSearchMovies.mockReset();
  mockGetMovieDetails.mockReset().mockResolvedValue({
    id: 1091, title: 'The Thing', release_date: '1982-06-25', external_ids: {},
  });
});

let nextId = 1;

/** A slash interaction shaped like discord.js's: options.data is the raw tree. */
function slash(commandName, data, { user = { id: 'user-1', username: 'tester' } } = {}) {
  const flat = [];
  const walk = (opts) => (opts || []).forEach(o => (o.options ? walk(o.options) : flat.push(o)));
  walk(data);
  const get = (name) => flat.find(o => o.name === name)?.value ?? null;
  return {
    id: `slash-${nextId++}`,
    commandName,
    commandId: `cmd-${commandName}`,
    isChatInputCommand: () => true,
    guildId: 'guild-1',
    channelId: 'channel-1',
    user,
    member: {},
    replied: false,
    deferred: false,
    options: { data, getString: get, getBoolean: get, getInteger: get },
    deferReply: jest.fn().mockImplementation(function () { this.deferred = true; return Promise.resolve(); }),
    editReply: jest.fn().mockResolvedValue(undefined),
    deleteReply: jest.fn().mockResolvedValue(undefined),
    channel: { send: jest.fn().mockResolvedValue(undefined) },
  };
}

describe('formatCommandLine / echoFor', () => {
  test('subcommand groups and subcommands join the mention, options follow by name', () => {
    const i = slash('config', [{
      name: 'stats', type: 2, options: [{
        name: 'set', type: 1, options: [{ name: 'enabled', type: 5, value: true }],
      }],
    }]);
    echo.rememberCommand(i);
    expect(echo.echoFor(i)).toBe('-# <@user-1> used </config stats set:cmd-config> `enabled`');
  });

  test('values never appear, and private is left out', () => {
    const i = slash('movie', [
      { name: 'query', type: 3, value: 'the thing' },
      { name: 'year', type: 4, value: 1982 },
      { name: 'private', type: 5, value: false },
    ]);
    echo.rememberCommand(i);
    expect(echo.echoFor(i)).toBe('-# <@user-1> used </movie:cmd-movie> `query` `year`');
  });

  test('a command with no options is just its name', () => {
    const i = slash('stats', []);
    echo.rememberCommand(i);
    expect(echo.echoFor(i)).toBe('-# <@user-1> used </stats:cmd-stats>');
  });

  test('after a restart a picker still names its command, in bold since the id is gone', () => {
    const select = {
      isChatInputCommand: () => false,
      user: { id: 'user-1' },
      message: { interactionMetadata: { id: 'forgotten' }, interaction: { commandName: 'movie' } },
    };
    expect(echo.echoFor(select)).toBe('-# <@user-1> used **/movie**');
  });
});

describe('deliverResult stamps the public post, never the private one', () => {
  test('public: header leads the content, mentions are suppressed', async () => {
    const i = slash('book', [{ name: 'query', type: 3, value: 'dune' }]);
    echo.rememberCommand(i);
    i.deferred = true;

    await deliverResult(i, { content: 'Dune', embeds: [{ title: 'Dune' }] });

    expect(i.channel.send).toHaveBeenCalledWith({
      content: '-# <@user-1> used </book:cmd-book> `query`\nDune',
      embeds: [{ title: 'Dune' }],
      allowedMentions: { parse: [] },
    });
  });

  test('private: the ephemeral reply is left exactly as given', async () => {
    const i = slash('book', [{ name: 'query', type: 3, value: 'dune' }]);
    echo.rememberCommand(i);
    i.deferred = true;

    await deliverResult(i, { embeds: [{ title: 'Dune' }] }, true);

    expect(i.editReply).toHaveBeenCalledWith({ embeds: [{ title: 'Dune' }] });
  });

  test('content already near the 2000 limit drops the header, not the result', async () => {
    const i = slash('book', [{ name: 'query', type: 3, value: 'dune' }]);
    echo.rememberCommand(i);
    i.deferred = true;
    const long = 'x'.repeat(1990);

    await deliverResult(i, { content: long });

    expect(i.channel.send).toHaveBeenCalledWith({ content: long });
  });
});

describe('end to end: /movie picker → selection', () => {
  test('the public result names the original /movie and its option', async () => {
    mockSearchMovies.mockResolvedValue([
      { id: 1091, title: 'The Thing', release_date: '1982-06-25' },
      { id: 60935, title: 'The Thing', release_date: '2011-10-12' },
    ]);

    const cmd = slash('movie', [{ name: 'query', type: 3, value: 'the thing' }]);
    echo.rememberCommand(cmd); // what src/index.js does before execute
    await movie.execute(cmd);

    // The real picker the command built
    const picker = cmd.editReply.mock.calls.at(-1)[0];
    const menu = picker.components[0].toJSON().components[0];
    const value = menu.options[0].value;

    const select = {
      customId: menu.custom_id,
      values: [value],
      isChatInputCommand: () => false,
      guildId: 'guild-1',
      user: { id: 'user-1', username: 'tester' },
      replied: false,
      deferred: false,
      message: { interactionMetadata: { id: cmd.id }, delete: jest.fn().mockResolvedValue(undefined) },
      deferUpdate: jest.fn().mockImplementation(function () { this.deferred = true; return Promise.resolve(); }),
      editReply: jest.fn().mockResolvedValue(undefined),
      deleteReply: jest.fn().mockResolvedValue(undefined),
      channel: { send: jest.fn().mockResolvedValue(undefined) },
    };
    await handleSelectInteraction(select);

    expect(select.channel.send).toHaveBeenCalledTimes(1);
    const posted = select.channel.send.mock.calls[0][0];
    expect(posted.content.split('\n')[0]).toBe('-# <@user-1> used </movie:cmd-movie> `query`');
    expect(posted.allowedMentions).toEqual({ parse: [] });
    expect(posted.embeds.length).toBeGreaterThan(0);
  });
});

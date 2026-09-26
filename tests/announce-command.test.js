/**
 * Tests for /announce — the two announcements a watch party needs.
 *
 *   /announce party    the advance notice, an hour or more ahead
 *   /announce starting the short nudge minutes before the timer starts
 *
 * Both POST publicly. An earlier version handed back an ephemeral code block
 * for a moderator to copy and paste, so the bot's nicest output depended on
 * someone doing clerical work first.
 *
 * The behaviour most worth pinning is the text precedence, because it decides
 * whether an OpenAI call is made at all:
 *
 *   message given            -> posted verbatim, NO AI call
 *   no message + AI enabled  -> generateAnnouncementText, template on failure
 *   no message + AI disabled -> template, NO AI call
 *
 * Run with: npm test -- tests/announce-command.test.js
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
const mockGetAiTextEnabled = jest.fn();

jest.unstable_mockModule('../src/services/tmdbService.js', () => ({
  getPosterUrl: jest.fn(p => (p ? `https://image.tmdb.org/t/p/w342${p}` : null)),
  getBackdropUrl: jest.fn(p => (p ? `https://image.tmdb.org/t/p/w780${p}` : null)),
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
  getEpisodeBufferMinutes: jest.fn(() => 5),
  getAutoDetectMode: jest.fn().mockReturnValue('ask'),
  getAiTextEnabled: mockGetAiTextEnabled,
  isAdmin: (member) => member?.isAdmin === true,
  loadGuildConfig: mockLoadGuildConfig,
}));

let execute, data;

beforeAll(async () => {
  ({ execute, data } = await import('../src/commands/announce.js'));
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
  mockGetAiTextEnabled.mockReset().mockReturnValue(true);
});

/** A channel the bot is allowed to post in. */
function makeChannel(name = 'watch-party') {
  return {
    name,
    toString: () => `#${name}`,
    send: jest.fn().mockResolvedValue(undefined),
    permissionsFor: () => ({ has: () => true }),
  };
}

function makeInteraction({
  subcommand = 'party',
  isAdmin = true,
  options = {},
  channel = makeChannel(),
  targetChannel = null,
  role = null,
} = {}) {
  return {
    guildId: 'guild-1',
    member: { isAdmin },
    user: { id: 'user-1', username: 'tester' },
    guild: { members: { me: {} } },
    channel,
    replied: false,
    deferred: false,
    options: {
      getSubcommand: () => subcommand,
      getString: (name) => options[name] ?? null,
      getChannel: () => targetChannel,
      getRole: () => role,
    },
    reply: jest.fn().mockResolvedValue(undefined),
    deferReply: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
  };
}

/** What was actually posted to the channel. */
function posted(interaction, channel) {
  const target = channel || interaction.channel;
  expect(target.send).toHaveBeenCalled();
  return target.send.mock.calls.at(-1)[0];
}

/** A resolvable movie, so a test can focus on something else. */
function seedMovie({ title = 'Hellraiser', providers = null, backdrop = '/bd.jpg' } = {}) {
  mockSearchMovies.mockResolvedValue([{ id: 1 }]);
  mockGetMovieDetails.mockResolvedValue({
    title,
    overview: 'A puzzle box.',
    backdrop_path: backdrop,
    poster_path: '/p.jpg',
    external_ids: { imdb_id: 'tt0093177' },
  });
  mockGetUnifiedMovieWatchProviders.mockResolvedValue(providers);
}

describe('/announce — permissions', () => {
  test('rejects a non-admin/moderator user without deferring', async () => {
    const interaction = makeInteraction({
      isAdmin: false,
      options: { title1: 'Hellraiser', time: '8:00 PM' },
    });

    await execute(interaction);

    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('permissions'), ephemeral: true })
    );
  });

  test('a non-admin cannot post via the starting subcommand either', async () => {
    const interaction = makeInteraction({
      subcommand: 'starting',
      isAdmin: false,
      options: { message: 'Starting in 10 minutes' },
    });

    await execute(interaction);

    expect(interaction.channel.send).not.toHaveBeenCalled();
  });
});

describe('/announce party — it actually posts', () => {
  test('posts to the channel rather than handing back text to copy', async () => {
    seedMovie();
    const interaction = makeInteraction({ options: { title1: 'Hellraiser', time: '8:00 PM EST' } });

    await execute(interaction);

    const message = posted(interaction);
    expect(message.embeds).toHaveLength(1);
    expect(interaction.editReply.mock.calls.at(-1)[0].content).toContain('posted');
  });

  test('posts to a named channel when one is given', async () => {
    seedMovie();
    const elsewhere = makeChannel('announcements');
    const interaction = makeInteraction({
      options: { title1: 'Hellraiser', time: '8:00 PM' },
      targetChannel: elsewhere,
    });

    await execute(interaction);

    expect(elsewhere.send).toHaveBeenCalled();
    expect(interaction.channel.send).not.toHaveBeenCalled();
  });

  test('puts the role ping in the message CONTENT, where it notifies', async () => {
    // A mention inside an embed never pings anyone — only content does.
    seedMovie();
    const role = { toString: () => '<@&role-1>' };
    const interaction = makeInteraction({
      options: { title1: 'Hellraiser', time: '8:00 PM' },
      role,
    });

    await execute(interaction);

    expect(posted(interaction).content).toContain('<@&role-1>');
  });

  test('includes the title, time and streaming availability', async () => {
    seedMovie({ providers: { flatrate: [{ provider_name: 'Shudder' }, { provider_name: 'AMC+' }] } });
    const interaction = makeInteraction({ options: { title1: 'Hellraiser', time: '8:00 PM EST' } });

    await execute(interaction);

    const embed = posted(interaction).embeds[0].data;
    expect(embed.title).toContain('Hellraiser');
    expect(JSON.stringify(embed.fields)).toContain('8:00 PM EST');
    expect(JSON.stringify(embed.fields)).toContain('Shudder and AMC+');
  });

  test('features the landscape backdrop, not the taller poster', async () => {
    seedMovie({ backdrop: '/bd.jpg' });
    const interaction = makeInteraction({ options: { title1: 'Hellraiser', time: '8:00 PM' } });

    await execute(interaction);

    expect(posted(interaction).embeds[0].data.image.url).toContain('bd.jpg');
  });

  test('falls back to the poster when there is no backdrop', async () => {
    seedMovie({ backdrop: null });
    const interaction = makeInteraction({ options: { title1: 'Hellraiser', time: '8:00 PM' } });

    await execute(interaction);

    expect(posted(interaction).embeds[0].data.image.url).toContain('p.jpg');
  });

  test('reports a clear error and posts nothing when the title cannot be found', async () => {
    mockSearchMovies.mockResolvedValue([]);
    mockSearchTVShows.mockResolvedValue([]);
    const interaction = makeInteraction({
      options: { title1: 'Nonexistent Movie XYZ', time: '8:00 PM' },
    });

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("Couldn't find") })
    );
    expect(interaction.channel.send).not.toHaveBeenCalled();
    expect(mockGenerateAnnouncementText).not.toHaveBeenCalled();
  });

  test('refuses to post where it lacks permission, and says so', async () => {
    // Checked up front rather than letting send() throw, so we never report
    // success for an announcement that didn't go out.
    seedMovie();
    const forbidden = makeChannel('locked');
    forbidden.permissionsFor = () => ({ has: () => false });
    const interaction = makeInteraction({
      options: { title1: 'Hellraiser', time: '8:00 PM' },
      targetChannel: forbidden,
    });

    await execute(interaction);

    expect(forbidden.send).not.toHaveBeenCalled();
    expect(interaction.editReply.mock.calls.at(-1)[0].content).toContain('permission');
  });
});

describe('/announce party — manual message is the primary path', () => {
  test('a manual message posts verbatim and makes NO AI call', async () => {
    seedMovie();
    const interaction = makeInteraction({
      options: {
        title1: 'Hellraiser',
        time: '8:00 PM',
        message: 'Bring your own puzzle box.',
      },
    });

    await execute(interaction);

    expect(posted(interaction).embeds[0].data.description).toBe('Bring your own puzzle box.');
    expect(mockGenerateAnnouncementText).not.toHaveBeenCalled();
  });

  test('a manual message wins even when AI is enabled and working', async () => {
    seedMovie();
    mockGetAiTextEnabled.mockReturnValue(true);
    const interaction = makeInteraction({
      options: { title1: 'Hellraiser', time: '8:00 PM', message: 'My own words.' },
    });

    await execute(interaction);

    const description = posted(interaction).embeds[0].data.description;
    expect(description).toBe('My own words.');
    expect(description).not.toContain('spooky tale');
  });
});

describe('/announce party — AI is optional flair', () => {
  test('uses AI text when the server has it enabled and nothing was typed', async () => {
    seedMovie();
    mockGetAiTextEnabled.mockReturnValue(true);
    const interaction = makeInteraction({ options: { title1: 'Hellraiser', time: '8:00 PM' } });

    await execute(interaction);

    expect(posted(interaction).embeds[0].data.description).toContain('A spooky tale awaits...');
  });

  test('makes NO AI call when the server disabled it', async () => {
    // The point of the per-guild switch: a disabled server must not be billed
    // for a call it opted out of.
    seedMovie();
    mockGetAiTextEnabled.mockReturnValue(false);
    const interaction = makeInteraction({ options: { title1: 'Hellraiser', time: '8:00 PM' } });

    await execute(interaction);

    expect(mockGenerateAnnouncementText).not.toHaveBeenCalled();
    expect(posted(interaction).embeds[0].data.description).toContain('Hellraiser');
    expect(interaction.editReply.mock.calls.at(-1)[0].content).toContain('turned off');
  });

  test('still posts when the AI call fails, using the plain template', async () => {
    seedMovie();
    mockGenerateAnnouncementText.mockResolvedValue(null);
    const interaction = makeInteraction({ options: { title1: 'Hellraiser', time: '8:00 PM' } });

    await execute(interaction);

    expect(posted(interaction).embeds[0].data.description).toContain('Hellraiser');
    expect(interaction.editReply.mock.calls.at(-1)[0].content).toContain('wasn\'t available');
  });

  test('passes tone and customTone through to the generator', async () => {
    seedMovie();
    const interaction = makeInteraction({
      options: {
        title1: 'Hellraiser',
        time: '8:00 PM',
        tone: 'scary',
        'custom-tone': 'like a noir detective',
      },
    });

    await execute(interaction);

    expect(mockGenerateAnnouncementText).toHaveBeenCalledWith(
      expect.objectContaining({ tone: 'scary', customTone: 'like a noir detective' })
    );
  });
});

describe('/announce party — two titles', () => {
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

    expect(posted(interaction).embeds[0].data.title).toContain('Tales from the Crypt');
    expect(posted(interaction).embeds[0].data.title).toContain('Hellraiser');
  });
});

describe('/announce starting', () => {
  test('posts the timing message as written', async () => {
    const interaction = makeInteraction({
      subcommand: 'starting',
      options: { message: 'Starting in 10 minutes' },
    });

    await execute(interaction);

    expect(posted(interaction).embeds[0].data.description).toBe('Starting in 10 minutes');
  });

  test('never calls AI — a timing claim must not be paraphrased', async () => {
    const interaction = makeInteraction({
      subcommand: 'starting',
      options: { message: 'Starting at 9:35 pm' },
    });

    await execute(interaction);

    expect(mockGenerateAnnouncementText).not.toHaveBeenCalled();
    expect(posted(interaction).content).toContain('Starting at 9:35 pm');
  });

  test('works with no title at all', async () => {
    const interaction = makeInteraction({
      subcommand: 'starting',
      options: { message: 'Starting in 5 minutes' },
    });

    await execute(interaction);

    expect(mockSearchMovies).not.toHaveBeenCalled();
    expect(posted(interaction).embeds[0].data.title).toBe('🎬 Starting soon');
  });

  test('adds the artwork and canonical title when a title is given', async () => {
    seedMovie({ title: 'Hellraiser' });
    const interaction = makeInteraction({
      subcommand: 'starting',
      options: { message: 'Starting in 10 minutes', title: 'hellraiser' },
    });

    await execute(interaction);

    const embed = posted(interaction).embeds[0].data;
    expect(embed.title).toContain('Hellraiser');
    expect(embed.image.url).toContain('bd.jpg');
  });

  test('still posts when the title matches nothing', async () => {
    // The timing is the message; the artwork is decoration. An unrecognised
    // title must not lose the announcement.
    mockSearchMovies.mockResolvedValue([]);
    mockSearchTVShows.mockResolvedValue([]);
    const interaction = makeInteraction({
      subcommand: 'starting',
      options: { message: 'Starting in 10 minutes', title: 'Some Obscure Short' },
    });

    await execute(interaction);

    const message = posted(interaction);
    expect(message.embeds[0].data.description).toBe('Starting in 10 minutes');
    expect(message.embeds[0].data.title).toContain('Some Obscure Short');
  });

  test('pings the role in content', async () => {
    const role = { toString: () => '<@&role-1>' };
    const interaction = makeInteraction({
      subcommand: 'starting',
      options: { message: 'Starting in 10 minutes' },
      role,
    });

    await execute(interaction);

    expect(posted(interaction).content).toContain('<@&role-1>');
  });
});

describe('/announce — command definition', () => {
  test('exposes both subcommands', () => {
    expect(data.toJSON().options.map(o => o.name).sort()).toEqual(['party', 'starting']);
  });

  test('starting requires a message, party requires a title and time', () => {
    const subs = Object.fromEntries(data.toJSON().options.map(o => [o.name, o]));

    const required = (sub) => sub.options.filter(o => o.required).map(o => o.name).sort();
    expect(required(subs.starting)).toEqual(['message']);
    expect(required(subs.party)).toEqual(['time', 'title1']);
  });

  test('every free-text option is length-capped', () => {
    // These land in embed titles and descriptions, which discord.js throws past.
    for (const sub of data.toJSON().options) {
      for (const option of sub.options) {
        if (option.type === 3 && !option.choices) {
          expect(option.max_length).toBeDefined();
        }
      }
    }
  });
});

/**
 * Two promises the TV commands made and didn't keep.
 *
 * - /episode-list, for a season of more than 25 episodes, said "Pagination
 *   support coming soon!" Nothing was building it: an embed holds 25 fields,
 *   one per episode, so a longer season is refused. It now says that, and
 *   points at /episode — with that command's real options — for any single
 *   one. Both places it's said are driven: the direct answer (one show
 *   matched) and the show picker's (several did), the picker fed its own
 *   option value back through the real select handler.
 * - /tv's query option said "optionally include episode name". tv.js
 *   searches series only; an episode name is just more words to match
 *   against show titles. The description now points at /episode instead.
 *
 * TMDB is mocked: every export of tmdbService is stubbed (read from the
 * module's source, so a module that imports one this test doesn't care
 * about still links), with the season data a test needs.
 *
 * Run with: npm test -- tests/tv-episode-list-promises.test.js
 */

import { describe, test, expect, jest, beforeAll, beforeEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { FakeDiscord } from './harness/fakeDiscord.js';

const TMDB_SOURCE = fs.readFileSync(path.join(process.cwd(), 'src/services/tmdbService.js'), 'utf8');
const TMDB_EXPORTS = [...TMDB_SOURCE.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map(m => m[1]);

const tmdb = Object.fromEntries(TMDB_EXPORTS.map(name => [name, jest.fn()]));
jest.unstable_mockModule('../src/services/tmdbService.js', () => tmdb);

const SHOW = { id: 4242, name: 'Dark Shadows', first_air_date: '1966-06-27', overview: 'A gothic soap.' };
const OTHER = { id: 4343, name: 'Dark Shadows', first_air_date: '1991-01-13', overview: 'The revival.' };
const LONG_SEASON = { episodes: Array.from({ length: 30 }, (_, n) => ({ episode_number: n + 1, name: `Episode ${n + 1}` })) };

let episodeList;
let tv;
let episode;
let handleSelectInteraction;
let discord;

beforeAll(async () => {
  episodeList = await import('../src/commands/episode-list.js');
  tv = await import('../src/commands/tv.js');
  episode = await import('../src/commands/episode.js');
  ({ handleSelectInteraction } = await import('../src/handlers/selectHandler.js'));
});

beforeEach(() => {
  for (const fn of Object.values(tmdb)) fn.mockReset();
  tmdb.getTVShowDetails.mockResolvedValue({ ...SHOW, number_of_seasons: 3 });
  tmdb.getSeasonDetails.mockResolvedValue(LONG_SEASON);
  tmdb.getEpisodeDetails.mockResolvedValue(null);
  discord = new FakeDiscord({ guildId: 'tv-episode-list-guild', channelId: 'tv-talk' });
  discord.addUser('viewer');
});

/** What a season too long to list must say, and must not */
function expectHonestRefusal(text) {
  expect(text).toBe(
    '**Dark Shadows** Season 1 has 30 episodes — more than the 25 one message can list, so I can\'t show this season. ' +
    'Look up any one of them with `/episode`, by title or number (e.g. `/episode show:Dark Shadows episode:s1e1`).'
  );
  expect(text).not.toMatch(/coming soon|pagination/i);
}

describe('/episode-list on a season of more than 25 episodes', () => {
  test('one show matched: says it can\'t list the season and points at /episode, promising nothing', async () => {
    tmdb.searchTVShows.mockResolvedValue([SHOW]);
    const i = discord.command('viewer', 'episode-list', { options: { series: 'dark shadows', season: 1 } });

    await episodeList.execute(i);

    expectHonestRefusal(i.replyMessage.content);
    expect(tmdb.getEpisodeDetails).not.toHaveBeenCalled(); // refused before fetching 30 episodes
    expect(discord.violations).toEqual([]);
  });

  test('picked from the show menu: the same answer, from the select handler', async () => {
    tmdb.searchTVShows.mockResolvedValue([SHOW, OTHER]);
    const cmd = discord.command('viewer', 'episode-list', { options: { series: 'dark shadows', season: 1 } });
    await episodeList.execute(cmd);

    // The real picker, and its own first option fed back
    const picker = cmd.replyMessage;
    const menu = picker.findComponent('select_episode_list_show');
    expect(menu).not.toBeNull();
    const pick = discord.select('viewer', picker, 'select_episode_list_show', [menu.options[0].value]);
    await handleSelectInteraction(pick);

    const said = pick.responses.map(m => m.content).filter(Boolean);
    expect(said).toHaveLength(1);
    expectHonestRefusal(said[0]);
    expect(tmdb.getTVShowDetails).toHaveBeenCalledWith(SHOW.id);
    expect(discord.violations).toEqual([]);
  });

  test('the /episode it suggests is a real command with those options', () => {
    const json = episode.data.toJSON();
    expect(json.name).toBe('episode');
    expect(json.options.map(o => o.name)).toEqual(expect.arrayContaining(['show', 'episode']));
  });
});

describe('/tv query option', () => {
  test('doesn\'t promise episode names, and points at /episode', () => {
    const query = tv.data.toJSON().options.find(o => o.name === 'query');
    expect(query.description).not.toMatch(/episode name/i);
    expect(query.description).toContain('/episode');
    expect(query.description.length).toBeLessThanOrEqual(100);
  });
});

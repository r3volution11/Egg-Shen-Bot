/**
 * `/eggshen-config stats toggle` must stop stats being recorded — for every
 * command, not just the ones that remembered to check.
 *
 * Only /movie, /tv and /episode (and their pickers) checked the setting
 * before calling trackSearch, so with tracking switched off /random,
 * /watched, /similar, /recommend, /watchlist, /soundtrack and the timer kept
 * recording. trackSearch now checks it itself.
 *
 * Run with: npm test -- tests/stats-tracking-switch.test.js
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { trackSearch, loadGuildStats, clearStats } from '../src/utils/statsTracker.js';
import { updateStatsTracking } from '../src/utils/guildConfig.js';
import * as configCommand from '../src/commands/eggshen-config.js';

const GUILD = 'stats-switch-guild';
const record = (type) => trackSearch(GUILD, 'user-1', 'tester', type, `A ${type}`, null);
const recordedTypes = async () => (await loadGuildStats(GUILD)).searches.map(s => s.type);

beforeEach(async () => {
  await clearStats(GUILD).catch(() => {});
  for (const s of ['enabled', 'trackMovies', 'trackShows', 'trackEpisodes', 'trackGames', 'trackBoardGames', 'trackBooks']) {
    await updateStatsTracking(GUILD, s, true);
  }
});

describe('the stats tracking switch', () => {
  test('on (the default): everything is recorded', async () => {
    for (const t of ['movie', 'random', 'watched', 'similar']) await record(t);
    expect(await recordedTypes()).toEqual(['movie', 'random', 'watched', 'similar']);
  });

  test('all tracking off: nothing is recorded, from any command', async () => {
    await updateStatsTracking(GUILD, 'enabled', false);
    for (const t of ['movie', 'random', 'watched', 'similar', 'recommend', 'watchlist', 'soundtrack']) await record(t);
    const stats = await loadGuildStats(GUILD);
    expect(stats.searches).toEqual([]);
    expect(stats.totalSearches).toBe(0);
  });

  test('movie tracking off: movies stop, everything else carries on', async () => {
    await updateStatsTracking(GUILD, 'trackMovies', false);
    for (const t of ['movie', 'tv', 'random']) await record(t);
    expect(await recordedTypes()).toEqual(['tv', 'random']);
  });
});

/** Run the real /eggshen-config as an admin; returns what it replied. */
async function runConfig(group, subcommand, { setting, enabled } = {}) {
  const interaction = {
    guildId: GUILD,
    member: { permissions: { has: () => true } },
    options: {
      getSubcommandGroup: () => group,
      getSubcommand: () => subcommand,
      getString: (name) => (name === 'setting' ? setting : null),
      getBoolean: (name) => (name === 'enabled' ? enabled : null),
    },
    reply: jest.fn(),
  };
  await configCommand.execute(interaction);
  return JSON.stringify(interaction.reply.mock.calls[0][0]);
}

/** The value of a stats-toggle choice, read from the command's own definition. */
function statsChoice(label) {
  const stats = configCommand.data.toJSON().options.find(o => o.name === 'stats');
  const setting = stats.options.find(o => o.name === 'toggle').options.find(o => o.name === 'setting');
  return setting.choices.find(c => c.name === label)?.value;
}

describe('game, board game and book tracking switches', () => {
  test('the toggle offers them', () => {
    expect(statsChoice('Game Tracking')).toBe('trackGames');
    expect(statsChoice('Board Game Tracking')).toBe('trackBoardGames');
    expect(statsChoice('Book Tracking')).toBe('trackBooks');
  });

  test('switching one off through the command stops just that type', async () => {
    const reply = await runConfig('stats', 'toggle', { setting: statsChoice('Book Tracking'), enabled: false });
    expect(reply).toContain('Book tracking** has been disabled');
    for (const t of ['book', 'game', 'boardgame']) await record(t);
    expect(await recordedTypes()).toEqual(['game', 'boardgame']);
  });

  test('a config from before the key existed tracks it, and says so', async () => {
    // Both production configs lack trackBooks: /book checked it by
    // truthiness, so book lookups were never counted there
    const file = path.join(process.env.GUILD_CONFIGS_DIR, `${GUILD}.json`);
    const config = JSON.parse(fs.readFileSync(file, 'utf8'));
    delete config.stats.trackBooks;
    fs.writeFileSync(file, JSON.stringify(config));

    await record('book');
    expect(await recordedTypes()).toEqual(['book']);
    expect(await runConfig('settings', 'view')).toContain('✅ **Books:** Enabled');
  });
});

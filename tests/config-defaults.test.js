/**
 * Older server configs read the defaults a new server gets.
 *
 * There are no config migrations, and loadGuildConfig returned a saved file
 * exactly as saved, so a server configured before a setting existed simply
 * lacked it, and code reading it directly saw `undefined`, usually "off".
 * On those servers the Metacritic badge never showed and `settings toggle`
 * refused it, /recommend and /suggest-quote fell back to the general rate
 * limit, and the server-wide limit and pattern detection were off, while a
 * server set up the next day had all of it. Loading now fills in every
 * missing key with its default (guildConfig.withDefaults), and keeps every
 * key a server has, whatever its value.
 *
 * One exception, Doug's call (2026-11-07): a saved config that never set
 * `rateLimits.enabled` keeps rate limiting off, as it always read. Both live
 * servers are like that; filling the default would have started refusing
 * their members' commands. A new server, with no file yet, still starts
 * with it on.
 *
 * The fixtures in tests/fixtures/guild-configs are configs as older
 * releases wrote them. shudder-ai-off.json is shaped like the production
 * Shudder server's: AI images turned off with a top-level `aiImages`, no
 * `rateLimits` at all, no `aiText`, and six command switches.
 * ai-limits-only.json is shaped like the production test server's: a
 * `rateLimits` holding only `aiImages`.
 *
 * Run with: npm test -- tests/config-defaults.test.js
 */

import { describe, test, expect, jest, beforeAll, beforeEach, afterAll } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { FakeDiscord } from './harness/fakeDiscord.js';
import { loadGuildConfig, withDefaults, missingDefaults, getAiTextEnabled } from '../src/utils/guildConfig.js';
import { checkRateLimit } from '../src/utils/rateLimiter.js';
import { dispatchCommand } from '../src/handlers/commandDispatch.js';

const FIXTURES = path.join(process.cwd(), 'tests/fixtures/guild-configs');
const CONFIG_DIR = process.env.GUILD_CONFIGS_DIR;
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), 'utf8'));
const configFile = (guildId) => path.join(CONFIG_DIR, `${guildId}.json`);

/** Save a config file as an older release would have, bypassing the bot */
function writeRaw(guildId, config) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(configFile(guildId), JSON.stringify(config, null, 2));
}
const readRaw = (guildId) => JSON.parse(fs.readFileSync(configFile(guildId), 'utf8'));

/** Every leaf of a saved config as [path, value]; arrays and empty objects are leaves */
function leaves(obj, prefix = []) {
  return Object.entries(obj).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length
    ? leaves(v, [...prefix, k])
    : [[[...prefix, k], v]]));
}
const at = (obj, keys) => keys.reduce((o, k) => (o == null ? undefined : o[k]), obj);

const DEFAULTS = structuredClone(await loadGuildConfig('config-defaults-never-saved'));

let n = 0;
const freshGuild = (name) => `config-defaults-${name}-${process.pid}-${++n}`;

/**
 * The defaults report for one config, as the script prints it and as JSON.
 * In a folder of its own, as guild_configs/ is on the server, with a
 * leftover beside it that the report must skip.
 */
function runReport(saved, guildId = '1100000000000000000') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-defaults-report-'));
  const files = [path.join(dir, `${guildId}.json`), path.join(dir, `${guildId}.json.bak`)];
  fs.writeFileSync(files[0], JSON.stringify(saved, null, 2));
  fs.writeFileSync(files[1], '{}'); // a leftover the report skips: not a config
  try {
    const json = JSON.parse(execFileSync(process.execPath, ['scripts/config-defaults-report.js', '--json', dir], { encoding: 'utf8' }));
    const text = execFileSync(process.execPath, ['scripts/config-defaults-report.js', dir], { encoding: 'utf8' });
    expect(json).toHaveLength(1);
    expect(json[0].guildId).toBe(guildId);
    return { guild: json[0], byPath: Object.fromEntries(json[0].missing.map(m => [m.path, m])), text };
  } finally {
    for (const f of files) fs.unlinkSync(f);
    fs.rmdirSync(dir);
  }
}

afterAll(() => {
  for (const name of fs.readdirSync(CONFIG_DIR)) if (name.startsWith('config-defaults-')) fs.unlinkSync(path.join(CONFIG_DIR, name));
});

describe('a config saved before later settings existed', () => {
  test('reads every missing key as the default a new server gets', async () => {
    const guild = freshGuild('old');
    writeRaw(guild, fixture('pre-metacritic'));
    const config = await loadGuildConfig(guild);

    expect(config.services.metacritic).toBe(true);
    expect(config.emojis.metacritic).toBe('');
    expect(config.rateLimits.commands.recommend).toEqual({ maxRequests: 2, windowSeconds: 120 });
    expect(config.rateLimits.commands['suggest-quote']).toEqual({ maxRequests: 1, windowSeconds: 60 });
    expect(config.rateLimits.guildWide).toEqual({ enabled: true, maxRequests: 10, windowSeconds: 60 });
    expect(config.rateLimits.patternDetection).toEqual({ enabled: true, windowSeconds: 60, minUsers: 3 });
    expect(config.commandPermissions.doom).toBe(true);
    expect(config.stats.trackBooks).toBe(true);
    // And nothing anywhere is left missing
    expect(missingDefaults(config)).toEqual([]);
  });

  test('what it saved comes back exactly as saved', async () => {
    const guild = freshGuild('kept');
    const saved = fixture('pre-metacritic');
    writeRaw(guild, saved);
    const config = await loadGuildConfig(guild);

    const all = leaves(saved);
    expect(all.length).toBeGreaterThan(40);
    for (const [keys, value] of all) {
      expect([keys.join('.'), at(config, keys)]).toEqual([keys.join('.'), value]);
    }
  });

  test('/recommend gets its own limit, 2 per 120 s, instead of the general 1 per 20 s', async () => {
    const guild = freshGuild('recommend');
    writeRaw(guild, fixture('pre-metacritic'));

    expect((await checkRateLimit(guild, 'member-1', 'recommend')).limited).toBe(false);
    expect((await checkRateLimit(guild, 'member-1', 'recommend')).limited).toBe(false);
    const third = await checkRateLimit(guild, 'member-1', 'recommend');
    expect(third.limited).toBe(true);
    expect(third.retryAfter).toBeGreaterThan(100); // the 120 s window, not 20 s
    expect(third.message).toContain('/recommend');
  });

  test('the server-wide limit applies: the 11th command in a minute, from anyone, waits', async () => {
    const guild = freshGuild('guild-wide');
    writeRaw(guild, fixture('pre-metacritic'));

    for (let i = 1; i <= 10; i++) {
      expect((await checkRateLimit(guild, `member-${i}`, 'tv')).limited).toBe(false);
    }
    const eleventh = await checkRateLimit(guild, 'member-11', 'tv');
    expect(eleventh.limited).toBe(true);
    expect(eleventh.guildWide).toBe(true);
  });

  test('loading writes nothing; a change saves the config whole, defaults included, as a new server\'s is', async () => {
    const guild = freshGuild('write');
    writeRaw(guild, fixture('pre-metacritic'));
    const before = fs.readFileSync(configFile(guild), 'utf8');

    await loadGuildConfig(guild);
    await loadGuildConfig(guild);
    expect(fs.readFileSync(configFile(guild), 'utf8')).toBe(before);

    const { updateCommandPermission } = await import('../src/utils/guildConfig.js');
    await updateCommandPermission(guild, 'tv', false);
    const written = readRaw(guild);
    expect(written.commandPermissions.tv).toBe(false);
    expect(written.services.metacritic).toBe(true);
    expect(missingDefaults(written)).toEqual([]);
    expect(written.region).toBe('GB'); // and what it had is still there
  });

  test('defaults are copies: changing one server\'s loaded config changes no other server\'s', async () => {
    const a = freshGuild('copy-a');
    const b = freshGuild('copy-b');
    writeRaw(a, fixture('pre-metacritic'));
    writeRaw(b, fixture('pre-metacritic'));

    const first = await loadGuildConfig(a);
    first.rateLimits.guildWide.maxRequests = 999;
    first.rateLimits.commands.recommend.maxRequests = 999;
    first.aiText.enabled = false;

    const second = await loadGuildConfig(b);
    expect(second.rateLimits.guildWide.maxRequests).toBe(10);
    expect(second.rateLimits.commands.recommend.maxRequests).toBe(2);
    expect(second.aiText.enabled).toBe(true);
    expect((await loadGuildConfig(freshGuild('never-saved'))).rateLimits.guildWide.maxRequests).toBe(10);
  });
});

describe('what an admin set survives', () => {
  test('an explicit false, 0 or empty string is kept, not replaced by the default', async () => {
    const guild = freshGuild('falsy');
    writeRaw(guild, {
      services: { imdb: false },
      emojis: { imdb: '' },
      episodeBufferMinutes: 0,
      stats: { enabled: false },
      commandPermissions: { enabled: false },
      watchlist: { autoRemoveWatched: false },
      announceStartingSoon: false,
      rateLimits: { enabled: false, bypassForModerators: false, guildWide: { enabled: false } },
    });
    const config = await loadGuildConfig(guild);

    expect(config.services.imdb).toBe(false);
    expect(config.services.metacritic).toBe(true); // the missing one beside it is filled in
    expect(config.emojis.imdb).toBe('');
    expect(config.episodeBufferMinutes).toBe(0);
    expect(config.stats.enabled).toBe(false);
    expect(config.commandPermissions.enabled).toBe(false);
    expect(config.watchlist.autoRemoveWatched).toBe(false);
    expect(config.watchlist.maxSize).toBe(100);
    expect(config.announceStartingSoon).toBe(false);
    expect(config.rateLimits.enabled).toBe(false);
    expect(config.rateLimits.bypassForModerators).toBe(false);
    expect(config.rateLimits.guildWide).toEqual({ enabled: false, maxRequests: 10, windowSeconds: 60 });

    // Rate limiting stays off: nothing is ever refused
    for (let i = 0; i < 12; i++) {
      expect((await checkRateLimit(guild, 'member-1', 'movie')).limited).toBe(false);
    }
  });

  test('null means "set to nothing" and is kept, even where the default is something', () => {
    const merged = withDefaults(
      { channel: null, settings: null, list: null },
      { channel: '1200000000000000001', settings: { on: true }, list: ['a'] },
    );
    expect(merged).toEqual({ channel: null, settings: null, list: null });
  });
});

describe('arrays and maps come back exactly as saved', () => {
  test('arrays are used whole, never merged item by item', async () => {
    const guild = freshGuild('arrays');
    writeRaw(guild, {
      moderation: { whitelist: { allowedUsers: ['1300000000000000001'] } },
      watchPartyChannels: ['1200000000000000009'],
      potionThemes: ['classic', 'gothic'], // the default is null
      rateLimits: { aiImages: { whitelistedUsers: ['1300000000000000002'] } },
    });
    const config = await loadGuildConfig(guild);

    expect(config.moderation.whitelist.allowedUsers).toEqual(['1300000000000000001']);
    expect(Array.isArray(config.moderation.whitelist.allowedUsers)).toBe(true);
    expect(config.moderation.whitelist.allowedRoles).toEqual([]);
    expect(config.watchPartyChannels).toEqual(['1200000000000000009']);
    expect(config.potionThemes).toEqual(['classic', 'gothic']);
    expect(config.rateLimits.aiImages.whitelistedUsers).toEqual(['1300000000000000002']);
    expect(config.rateLimits.aiImages.perUserDailyLimit).toBe(10);

    // A non-empty default list is replaced, not added to or overlaid
    expect(withDefaults({ list: ['x'] }, { list: ['a', 'b'] })).toEqual({ list: ['x'] });
  });

  test('maps keyed by id or name get nothing added, and keys the defaults lack are kept', async () => {
    const guild = freshGuild('maps');
    const saved = fixture('pre-metacritic');
    writeRaw(guild, saved);
    const config = await loadGuildConfig(guild);

    expect(config.potionResponses).toEqual(saved.potionResponses);
    expect(config.doomLines).toEqual(saved.doomLines);
    expect(config.games).toEqual(saved.games);
    expect(config.website.botUrl).toBe('https://bot.example.org');
    expect(config.website.theme).toBe('shudder');
    // The commands map keeps its own entry beside the two built-in ones
    expect(Object.keys(config.rateLimits.commands).sort()).toEqual(['movie', 'recommend', 'suggest-quote']);
    expect(config.rateLimits.commands.movie).toEqual({ maxRequests: 3, windowSeconds: 30 });
  });
});

describe('Metacritic on a config saved before it existed', () => {
  let configCommand;
  let discord;
  let guild;

  beforeAll(async () => {
    configCommand = await import('../src/commands/eggshen-config.js');
  });

  async function run(subcommand, options) {
    guild = freshGuild('metacritic');
    writeRaw(guild, fixture('pre-metacritic'));
    discord = new FakeDiscord({ guildId: guild });
    discord.addUser('admin', { admin: true });
    const i = discord.command('admin', 'eggshen-config', { group: 'settings', subcommand, options });
    await configCommand.execute(i);
    expect(discord.violations).toEqual([]);
    return i.replyMessage.content;
  }

  test('settings toggle names it and stores the switch', async () => {
    const reply = await run('toggle', { service: 'metacritic', enabled: false });
    expect(reply).toBe('❌ **Metacritic** has been disabled for this server.');
    expect(readRaw(guild).services.metacritic).toBe(false);
  });

  test('settings emoji names it and stores the emoji', async () => {
    const reply = await run('emoji', { service: 'metacritic', emoji: '<:mc:1100000000000000099>' });
    expect(reply).toBe('✅ Emoji for **Metacritic** has been set to <:mc:1100000000000000099>');
    expect(readRaw(guild).emojis.metacritic).toBe('<:mc:1100000000000000099>');
  });

  test('every service the two commands offer has a name in their replies', async () => {
    const json = configCommand.data.toJSON().options.find(o => o.name === 'settings').options;
    for (const sub of ['toggle', 'emoji']) {
      const choices = json.find(o => o.name === sub).options.find(o => o.name === 'service').choices;
      for (const { value } of choices) {
        const reply = await run(sub, sub === 'toggle' ? { service: value, enabled: true } : { service: value, emoji: '' });
        expect(reply).not.toMatch(/undefined|Failed/);
      }
    }
  });
});

describe('production-shaped: the Shudder server, with AI images turned off', () => {

  test('the loaded config keeps AI images off; the missing AI keys read as defaults beside it', async () => {
    const guild = freshGuild('shudder');
    writeRaw(guild, fixture('shudder-ai-off'));
    const config = await loadGuildConfig(guild);

    expect(config.aiImages).toEqual({ enabled: false, permissions: 'everyone' });
    expect(config.rateLimits.aiImages.enabled).toBe(true); // the limits, not the switch
    expect(getAiTextEnabled(config)).toBe(true);
    expect(config.commandPermissions).toMatchObject({ enabled: true, movie: true, tv: true, episode: true, game: true, boardgame: true, siege: true });
  });

  test('/image is still refused: AI image generation is disabled on this server', async () => {
    const guild = freshGuild('shudder-image');
    writeRaw(guild, fixture('shudder-ai-off'));
    // If the switch were lost, the command must still stop short of OpenAI
    const { config } = await import('../src/config.js');
    const key = config.apis.openai.apiKey;
    config.apis.openai.apiKey = '';
    try {
      const image = await import('../src/commands/image.js');
      const discord = new FakeDiscord({ guildId: guild });
      discord.addUser('member');
      discord.addUser('admin', { admin: true });
      for (const who of ['member', 'admin']) {
        const i = discord.command(who, 'image', { options: { prompt: 'a drive-in at midnight' } });
        await image.execute(i);
        expect(i.replyMessage.content).toBe('❌ AI image generation is disabled on this server. Contact a server administrator if you believe this is an error.');
      }
    } finally {
      config.apis.openai.apiKey = key;
    }
  });

  test('the defaults report lists exactly the keys it now reads as defaults, and not aiImages', () => {
    const { guild, byPath, text } = runReport(fixture('shudder-ai-off'));

    expect(guild.missing.map(m => m.path)).toEqual([
      'services.metacritic',
      'emojis.metacritic',
      'maxTimerDurationUnlimited',
      'timerCeilingMinutes',
      'timerCeilingEnabled',
      'allowAnyonePauseStopTimer',
      'stats.trackGames',
      'stats.trackBoardGames',
      'stats.trackBooks',
      ...['book', 'survey', 'soundtrack', 'bracket', 'quote', 'suggestQuote', 'watchlist', 'potion', 'foodfight', 'doom', 'rescue', 'siege', 'magic', 'escape'].map(k => `commandPermissions.${k}`),
      'watchlist',
      'watchPartyAutoDetectMode',
      'announceStartingSoon',
      'episodeBufferMinutes',
      'aiText',
      // No rateLimits at all: listed key by key, its switch staying off
      'rateLimits.enabled',
      'rateLimits.bypassForModerators',
      'rateLimits.global',
      'rateLimits.commands',
      'rateLimits.guildWide',
      'rateLimits.patternDetection',
      'rateLimits.aiImages',
      'eventRequests.announceDecisions',
      'eventRequests.announcementChannel',
      'quoteSuggestions',
      'website',
    ]);
    expect(byPath.aiText.value).toEqual({ enabled: true });
    expect(byPath['rateLimits.aiImages'].value).toEqual(DEFAULTS.rateLimits.aiImages);
    // Behavior that changes is called out; the AI limits were already read as these defaults
    expect(byPath['services.metacritic'].note).toMatch(/now shown/);
    expect(byPath['rateLimits.aiImages'].note).toBeNull();
    expect(byPath.aiText.note).toBeNull();

    // And the text report says the same
    expect(text).toContain('  rateLimits.aiImages = {"enabled":true');
    expect(text).not.toMatch(/^ {2}aiImages/m);
  });
});

describe('rate limiting on a saved config that never set it stays off (Doug\'s call, 2026-11-07)', () => {
  const TURN_ON = '/eggshen-config-watch-party rate-limit toggle enabled:true';
  const STAYS_OFF = `rate limiting stays off (never set; turn on with ${TURN_ON})`;
  // The keys each config lacks under rateLimits, besides the switch: they
  // read as the defaults but do nothing while rate limiting is off
  const INERT = ['rateLimits.bypassForModerators', 'rateLimits.global', 'rateLimits.commands', 'rateLimits.guildWide', 'rateLimits.patternDetection'];

  let configCommand;
  let watchPartyCommand;
  let moderationCommand;

  beforeAll(async () => {
    configCommand = await import('../src/commands/eggshen-config.js');
    watchPartyCommand = await import('../src/commands/eggshen-config-watch-party.js');
    moderationCommand = await import('../src/commands/eggshen-config-moderation.js');
  });

  beforeEach(() => {
    jest.restoreAllMocks();
    // The logger prints every command the dispatcher records
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  /**
   * One member runs /tv `times` times in a row through the real command
   * dispatcher and rate limiter; a stub stands in for the command itself.
   * Twelve is past both the default per-member limit (1 per 20 s) and the
   * server-wide one (10 per 60 s), so with limiting on all but the first is
   * refused.
   */
  async function runTv(guild, times = 12) {
    const discord = new FakeDiscord({ guildId: guild });
    discord.addUser('member');
    let ran = 0;
    const commands = new Map([['tv', { execute: async (i) => { ran++; await i.reply({ content: 'ran', ephemeral: true }); } }]]);
    const refused = [];
    for (let k = 0; k < times; k++) {
      const i = discord.command('member', 'tv');
      await dispatchCommand(i, commands);
      if (i.replyMessage.content !== 'ran') refused.push(i.replyMessage.content);
    }
    expect(discord.violations).toEqual([]);
    return { ran, refused };
  }

  /** An admin's config command on `guild`: the reply */
  async function asAdmin(guild, command, group, subcommand, options = {}) {
    const discord = new FakeDiscord({ guildId: guild });
    discord.addUser('admin', { admin: true });
    const i = discord.command('admin', command.data.name, { group, subcommand, options });
    await command.execute(i);
    expect(discord.violations).toEqual([]);
    return i.replyMessage;
  }

  /** What the settings view and the rate-limit view say about the switch */
  async function views(guild) {
    const settings = await asAdmin(guild, configCommand, 'settings', 'view');
    const rateLimits = await asAdmin(guild, watchPartyCommand, 'rate-limit', 'view');
    return {
      settings: settings.embeds[0].data.fields.find(f => f.name === 'Rate Limiting').value.split('\n')[0],
      rateLimits: rateLimits.embeds[0].data.description.split('\n').slice(0, 2).join('\n'),
    };
  }

  const LIMITED = /^⏱️ You're using commands too quickly! Please wait \d+ seconds? before using \*\*\/tv\*\* again\.$/;

  test.each([
    ['no rateLimits at all (the Shudder server)', 'shudder-ai-off'],
    ['only rateLimits.aiImages (the test server)', 'ai-limits-only'],
  ])('%s: never limited, and the views say off', async (shape, name) => {
    const guild = freshGuild(name);
    writeRaw(guild, fixture(name));

    const config = await loadGuildConfig(guild);
    expect(config.rateLimits.enabled).toBe(false);
    // Everything else under it reads as the defaults, ready for when it's on
    expect(config.rateLimits.guildWide).toEqual(DEFAULTS.rateLimits.guildWide);
    expect(config.rateLimits.global).toEqual(DEFAULTS.rateLimits.global);

    expect(await runTv(guild)).toEqual({ ran: 12, refused: [] });
    expect((await checkRateLimit(guild, 'member-2', 'recommend')).limited).toBe(false);
    expect((await checkRateLimit(guild, 'member-2', 'recommend')).limited).toBe(false);
    expect((await checkRateLimit(guild, 'member-2', 'recommend')).limited).toBe(false);

    expect(await views(guild)).toEqual({
      settings: '❌ **Rate Limiting:** Disabled',
      rateLimits: `**Rate Limiting:** ❌ Disabled\nWhile it's off, none of the rate limits below are applied. Turn it on with \`${TURN_ON}\``,
    });

    // /eggshen-config-moderation doesn't promise rate limits that aren't there
    await asAdmin(guild, moderationCommand, 'moderation', 'toggle', { enabled: true });
    const whitelistOff = await asAdmin(guild, moderationCommand, 'moderation', 'whitelist-toggle', { enabled: false });
    expect(whitelistOff.content).toBe('✅ Whitelist mode has been **disabled**.\n\nEveryone can use bot commands again.');

    // That change saved the config whole, and the switch went with it, written out as off
    expect(readRaw(guild).rateLimits.enabled).toBe(false);
    expect((await runTv(guild, 3)).refused).toEqual([]);
  });

  test.each([
    ['no rateLimits at all (the Shudder server)', 'shudder-ai-off', []],
    ['only rateLimits.aiImages (the test server)', 'ai-limits-only', ['rateLimits.aiImages']],
  ])('%s: the defaults report says rate limiting stays off', (shape, name, present) => {
    const { guild, byPath, text } = runReport(fixture(name));

    expect(guild.rateLimitingOn).toBe(false);
    expect(byPath['rateLimits.enabled']).toEqual({ path: 'rateLimits.enabled', value: false, effect: 'stays-off', note: STAYS_OFF });
    for (const key of INERT) {
      expect([key, byPath[key].effect, byPath[key].note]).toEqual([key, 'no-effect', 'no effect while rate limiting is off']);
    }
    // Nothing under rateLimits is said to change behavior, and nothing it had is listed
    const rateLimitKeys = guild.missing.filter(m => m.path.startsWith('rateLimits'));
    expect(rateLimitKeys.filter(m => m.effect === 'changes')).toEqual([]);
    for (const key of present) expect(byPath[key]).toBeUndefined();

    expect(text).toContain(`  rateLimits.enabled = false\n      ${STAYS_OFF}\n`);
    expect(text).toContain('  rateLimits.guildWide = {"enabled":true,"maxRequests":10,"windowSeconds":60}\n      no effect while rate limiting is off\n');
    expect(text).not.toMatch(/now on/);
    expect(text).toMatch(/1 where rate limiting stays off because it was never set\.$/m);
  });

  test('with moderation on, the moderator bypass still changes something: manual cooldowns', () => {
    const { byPath, text } = runReport({ moderation: { enabled: true } });

    expect(byPath['rateLimits.enabled'].effect).toBe('stays-off');
    expect(byPath['rateLimits.bypassForModerators'].effect).toBe('changes');
    expect(text).toContain('      changes behavior: admins and moderators were held by manual cooldowns (missing read as off); now they skip them, and the rate limits too once rate limiting is on\n');
    expect(byPath['rateLimits.guildWide'].effect).toBe('no-effect');
  });

  test('explicitly on: limited as before', async () => {
    const guild = freshGuild('explicit-on');
    writeRaw(guild, { ...fixture('shudder-ai-off'), rateLimits: { enabled: true } });

    const { ran, refused } = await runTv(guild);
    expect(ran).toBe(1);
    expect(refused).toHaveLength(11);
    for (const message of refused) expect(message).toMatch(LIMITED);

    // And the report calls out what changes now that the rest fills in
    const { byPath } = runReport(fixture('pre-metacritic')); // rateLimits.enabled: true, no guildWide
    expect(byPath['rateLimits.enabled']).toBeUndefined();
    expect(byPath['rateLimits.guildWide'].effect).toBe('changes');
    expect(byPath['rateLimits.guildWide'].note).toMatch(/10 commands per 60 s/);
  });

  test('a brand-new server, with no saved config: limited, as the defaults say', async () => {
    const guild = freshGuild('brand-new');
    expect(fs.existsSync(configFile(guild))).toBe(false);

    expect((await loadGuildConfig(guild)).rateLimits.enabled).toBe(true);
    const { ran, refused } = await runTv(guild);
    expect(ran).toBe(1);
    expect(refused[0]).toMatch(LIMITED);

    expect(await views(freshGuild('brand-new-views'))).toEqual({
      settings: '✅ **Rate Limiting:** Enabled',
      rateLimits: '**Rate Limiting:** ✅ Enabled\n**Moderation Features:** ❌ Disabled',
    });
  });

  test('an admin turns it on with the rate-limit toggle, and members are limited from then on', async () => {
    const guild = freshGuild('turned-on');
    writeRaw(guild, fixture('shudder-ai-off'));

    const reply = await asAdmin(guild, watchPartyCommand, 'rate-limit', 'toggle', { enabled: true });
    expect(reply.content).toMatch(/^✅ Rate limiting has been \*\*enabled\*\*/);
    expect(readRaw(guild).rateLimits.enabled).toBe(true);

    const { ran, refused } = await runTv(guild);
    expect(ran).toBe(1);
    expect(refused[0]).toMatch(LIMITED);
  });
});

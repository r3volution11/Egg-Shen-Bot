import { SlashCommandBuilder, ChannelType } from 'discord.js';
import { loadGuildConfig, saveGuildConfig, isAdmin } from '../utils/guildConfig.js';
import {
  getGameSettings, resetScores, channelAllowed, GAMES, GAME_NAMES, HAPPENING_FREQUENCIES, TWIST_PERCENT_MAX, SIEGE_FREQUENCIES, GAME_PACES, endAllHexes,
} from '../utils/gameScores.js';
import { SIEGE } from '../data/gameRewards.js';
import { pacePreset, randomGapHours, happeningPace, lengthWords, defaultSiegeMinutes, reportWords } from '../utils/gamePace.js';
import { HAPPENINGS } from '../data/gameHappenings.js';
import { loadState, inProgress, startHappening, calendarHappenings } from '../utils/happeningStore.js';
import { announceHappening, settleHappening, botCanPost } from '../utils/happeningScheduler.js';

/**
 * /eggshen-config-games — the game settings for /potion, /foodfight, /doom
 * and /rescue: play limits, where they can be played, and wiping scores.
 * Turning a game off entirely stays with /eggshen-config commands toggle,
 * beside every other command switch.
 *
 * Its own file because /eggshen-config is near Discord's 8000-byte limit.
 * Each subcommand shows the current settings when given no options, so
 * there's no separate "view".
 *
 * `happenings` (R4) also holds the twist settings, and lets an admin start
 * or end a happening by hand; since R6, random sieges' frequency and how
 * long a siege lasts too (the siege's announcements go where a
 * happening's do). Its name sorts it ahead of `limits` in
 * Discord's picker, which lists subcommands alphabetically.
 *
 * 2.74.0: `happenings pace:` sets how long the games' events take on the
 * server (SIEGE_PACES: quick · evening · day · 3 days · week, the default).
 * `siege-minutes` is still the length of a QUICK siege; at any other pace
 * a siege lasts the pace's own length. Changing the pace never touches a
 * siege or a happening that's already on.
 */

const LIMITS = [
  { option: 'cooldown-seconds', key: 'cooldownSeconds', min: 0, max: 3600, about: 'Seconds between plays of the same game, per person' },
  { option: 'per-minute', key: 'perMinute', min: 1, max: 60, about: 'Plays per minute across all games, per person' },
  { option: 'daily-scored-plays', key: 'dailyScoredPlays', min: 0, max: 1000, about: 'Scored plays per game per person each day (UTC)' },
  { option: 'shield-minutes', key: 'shieldMinutes', min: 0, max: 1440, about: 'How long a rescue shields someone from /doom (0: off)' },
];

/**
 * The frequency choices, as offered — and as the summary names them at
 * quick and evening pace. From day pace on (2.74.0) a happening lasts about
 * a day and normal is about one a week (WEEKLY_FREQUENCY_TEXT): an option's
 * name can't change with the server, so it says both.
 */
const FREQUENCY_TEXT = {
  off: 'Off (only when an admin starts one)',
  rare: 'Rare',
  normal: 'Normal (about one a day when busy)',
  often: 'Often',
};
const FREQUENCY_CHOICE = { ...FREQUENCY_TEXT, normal: 'Normal (about one a day when busy; one a week from day pace on)' };
const WEEKLY_FREQUENCY_TEXT = { ...FREQUENCY_TEXT, normal: 'Normal (about one a week when busy)' };

/** 2.74.0: the pace choices, as offered (a choice's name is at most 100 characters) */
export const PACE_TEXT = Object.freeze({
  quick: 'Quick: 45-minute sieges, hour-long happenings',
  evening: 'Evening: 4-hour sieges, happenings for the night',
  day: 'Day: day-long sieges, happenings about weekly',
  days3: '3 days: sieges over 3 days, a report each night',
  week: 'Week (default): sieges over a week, a report each night',
});

/** R6: random sieges' frequency at quick and evening pace, with their rate a week (the summary's words) */
const SIEGE_FREQUENCY_TEXT = Object.fromEntries(SIEGE_FREQUENCIES.map(f => [f, f === 'off'
  ? 'Off (only when an admin starts one)'
  : `${f[0].toUpperCase()}${f.slice(1)} (about ${SIEGE.random.perWeek[f]} a week)`]));

/**
 * The choices as offered: by 2.74.0 the frequency means a rate a week at
 * quick and evening pace, and a gap after the last one from day pace on
 * (rare twice as long, often half), so the names say how it compares
 */
const SIEGE_FREQUENCY_CHOICE = Object.freeze({
  off: 'Off (only when an admin starts one)',
  rare: 'Rare (about half as often)',
  normal: 'Normal (the default)',
  often: 'Often (about twice as often)',
});

const MODE_TEXT = {
  all: 'Every channel',
  only: 'Only the listed channels',
  except: 'Every channel except the listed ones',
};

export const data = new SlashCommandBuilder()
  .setName('eggshen-config-games')
  .setDescription('Game settings for /potion, /foodfight, /doom, /rescue, /siege (Admin/Moderator only)')
  .addSubcommand(sub => {
    sub.setName('limits').setDescription('Play limits and the rescue shield. No options: show them');
    for (const l of LIMITS) {
      sub.addIntegerOption(o => o.setName(l.option).setDescription(l.about).setMinValue(l.min).setMaxValue(l.max));
    }
    return sub;
  })
  .addSubcommand(sub => sub
    .setName('channels')
    .setDescription('Where the games can be played. No options: show it')
    .addStringOption(o => o
      .setName('mode')
      .setDescription('Every channel, only the listed ones, or all but the listed ones')
      .addChoices(
        { name: 'Every channel', value: 'all' },
        { name: 'Only listed channels', value: 'only' },
        { name: 'All except listed channels', value: 'except' },
      ))
    .addChannelOption(o => o
      .setName('add')
      .setDescription('Add a channel to the list (its threads count too)')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildVoice))
    .addChannelOption(o => o
      .setName('remove')
      .setDescription('Take a channel off the list')))
  .addSubcommand(sub => sub
    .setName('happenings')
    .setDescription('Twists, happenings and random sieges: settings, or start/end a happening. No options: show them')
    .addBooleanOption(o => o.setName('enabled').setDescription('Happenings on or off (Halloween and Friday the 13th too)'))
    .addStringOption(o => o
      .setName('frequency')
      .setDescription('How often random happenings start')
      .addChoices(...HAPPENING_FREQUENCIES.map(f => ({ name: FREQUENCY_CHOICE[f], value: f }))))
    .addChannelOption(o => o
      .setName('channel')
      .setDescription('Where happenings are announced (default: your games channel, else where people last played)')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addBooleanOption(o => o.setName('twists').setDescription('Twists on or off'))
    .addIntegerOption(o => o
      .setName('twist-percent')
      .setDescription(`Chance of a twist on a scored play, 0-${TWIST_PERCENT_MAX}%`)
      .setMinValue(0)
      .setMaxValue(TWIST_PERCENT_MAX))
    .addStringOption(o => o
      .setName('start')
      .setDescription('Start one now, and announce it')
      .addChoices(...Object.entries(HAPPENINGS).map(([kind, h]) => ({ name: `${h.emoji} ${h.name}`, value: kind }))))
    .addBooleanOption(o => o.setName('end').setDescription('End the current one now'))
    .addStringOption(o => o
      .setName('siege-frequency')
      .setDescription('How often a monster attacks by itself while people play')
      .addChoices(...SIEGE_FREQUENCIES.map(f => ({ name: SIEGE_FREQUENCY_CHOICE[f], value: f }))))
    .addIntegerOption(o => o
      .setName('siege-minutes')
      .setDescription(`How long a siege lasts at quick pace, ${SIEGE.minutes.min}-${SIEGE.minutes.max} minutes`)
      .setMinValue(SIEGE.minutes.min)
      .setMaxValue(SIEGE.minutes.max))
    .addStringOption(o => o
      .setName('pace')
      .setDescription('How long sieges and happenings take (default: week)')
      .addChoices(...GAME_PACES.map(p => ({ name: PACE_TEXT[p], value: p }))))
    // 2.76.0 (design §1's admin switch): off ends every hex in place
    .addBooleanOption(o => o.setName('hexes').setDescription('Hexes from /six-demon-bag on or off (off ends every hex now; blessings stay)')))
  .addSubcommand(sub => sub
    .setName('reset-scores')
    .setDescription('Erase scores: everyone\'s, one game\'s, or one person\'s. Cannot be undone')
    .addStringOption(o => o
      .setName('confirm')
      .setDescription('This erases scores for good')
      .setRequired(true)
      .addChoices({ name: 'Yes, erase them', value: 'yes' }))
    .addStringOption(o => o
      .setName('game')
      .setDescription('Just one game (default: all of them)')
      .addChoices(...GAMES.map(g => ({ name: GAME_NAMES[g], value: g }))))
    .addUserOption(o => o
      .setName('user')
      .setDescription('Just one person (default: everyone)')));

export async function execute(interaction) {
  if (!isAdmin(interaction.member)) {
    await interaction.reply({ content: '❌ Only administrators and moderators can change the game settings.', ephemeral: true });
    return;
  }
  const sub = interaction.options.getSubcommand();
  if (sub === 'limits') return limits(interaction);
  if (sub === 'channels') return channels(interaction);
  if (sub === 'happenings') return happenings(interaction);
  return reset(interaction);
}

const reply = (interaction, content) => interaction.reply({ content, ephemeral: true, allowedMentions: { parse: [] } });

async function limits(interaction) {
  const config = await loadGuildConfig(interaction.guildId);
  const changes = LIMITS
    .map(l => ({ ...l, value: interaction.options.getInteger(l.option) }))
    .filter(l => l.value !== null);
  if (changes.length) {
    config.games = { ...(config.games || {}) };
    for (const c of changes) config.games[c.key] = c.value;
    await saveGuildConfig(interaction.guildId, config);
  }
  const s = getGameSettings(config);
  const lines = [
    changes.length ? '✅ **Game limits saved**' : '🎲 **Game limits**',
    `• Same game again after: **${s.cooldownSeconds}s**`,
    `• Plays per minute, all games: **${s.perMinute}**`,
    `• Scored plays per game per day: **${s.dailyScoredPlays}** (more still play, for 0 points)`,
    `• Rescue shield: **${s.shieldMinutes ? `${s.shieldMinutes} min` : 'off'}**`,
  ];
  await reply(interaction, lines.join('\n'));
}

async function channels(interaction) {
  const config = await loadGuildConfig(interaction.guildId);
  const mode = interaction.options.getString('mode');
  const add = interaction.options.getChannel('add');
  const remove = interaction.options.getChannel('remove');
  const before = getGameSettings(config);
  let list = [...before.channels];
  if (add && !list.includes(add.id)) list.push(add.id);
  if (remove) list = list.filter(id => id !== remove.id);
  const changed = mode || add || remove;
  if (changed) {
    config.games = { ...(config.games || {}), channelMode: mode || before.channelMode, channels: list };
    await saveGuildConfig(interaction.guildId, config);
  }
  const s = getGameSettings(config);
  const listed = s.channels.length ? s.channels.map(id => `<#${id}>`).join(', ') : 'none';
  const lines = [
    changed ? '✅ **Game channels saved**' : '🎲 **Game channels**',
    `• Where: **${MODE_TEXT[s.channelMode]}**`,
    `• Listed: ${listed}`,
  ];
  // The two settings that quietly do nothing, or block everything
  if (s.channelMode === 'all' && s.channels.length) lines.push('-# The list only matters with mode "Only listed channels" or "All except listed channels".');
  if (s.channelMode === 'only' && !s.channels.length) lines.push('⚠️ No channels are listed, so the games can\'t be played anywhere.');
  await reply(interaction, lines.join('\n'));
}

const unix = (ms) => Math.floor(ms / 1000);
const kindName = (kind) => `${HAPPENINGS[kind].emoji} **${HAPPENINGS[kind].name}**`;
const until = (endsAt) => `until <t:${unix(endsAt)}:t> (<t:${unix(endsAt)}:R>)`;

/** Settings changes from the options, as config.games keys */
function happeningChanges(options) {
  const changes = {};
  const enabled = options.getBoolean('enabled');
  if (enabled !== null) changes.happenings = enabled;
  const frequency = options.getString('frequency');
  if (frequency) changes.happeningFrequency = frequency;
  const channel = options.getChannel('channel');
  if (channel) changes.happeningChannel = channel.id;
  const twists = options.getBoolean('twists');
  if (twists !== null) changes.twists = twists;
  const percent = options.getInteger('twist-percent');
  if (percent !== null) changes.twistPercent = percent;
  // R6: random sieges
  const siegeFrequency = options.getString('siege-frequency');
  if (siegeFrequency) changes.siegeFrequency = siegeFrequency;
  const siegeMinutes = options.getInteger('siege-minutes');
  if (siegeMinutes !== null) changes.siegeMinutes = siegeMinutes;
  // 2.74.0
  const pace = options.getString('pace');
  if (pace) changes.pace = pace;
  // 2.76.0
  const hexes = options.getBoolean('hexes');
  if (hexes !== null) changes.hexes = hexes;
  return changes;
}

/**
 * Settings, then `end`, then `start` — so `end:True start:…` swaps one
 * happening for another. A start or end talks to Discord (an announcement
 * is a new message; the end edits it), so those defer first.
 */
async function happenings(interaction) {
  const { guildId, guild } = interaction;
  const options = interaction.options;
  const changes = happeningChanges(options);
  const start = options.getString('start');
  const end = options.getBoolean('end') === true;
  const changed = Object.keys(changes).length > 0;
  const deferred = !!start || end || changes.happenings === false;
  if (deferred) await interaction.deferReply({ ephemeral: true });

  const config = await loadGuildConfig(guildId);
  if (changed) {
    config.games = { ...(config.games || {}), ...changes };
    await saveGuildConfig(guildId, config);
  }
  const settings = getGameSettings(config);
  const now = Date.now();
  const notes = [];

  if (changes.happeningChannel) notes.push(...await channelWarnings(guild, settings, changes.happeningChannel));
  // 2.76.0: hexes off ends every hex in place at once (no ward: none can come while they're off)
  if (changes.hexes === false) {
    const ended = endAllHexes(guildId);
    notes.push(ended ? `⏹️ Ended ${ended} ${ended === 1 ? 'hex' : 'hexes'} in place.` : 'No hexes were in place.');
  }

  // Ends one that's run out too (so a start isn't refused by it), and one
  // that's on while happenings are off. Only when deferred: it may edit.
  const ended = deferred ? await settleHappening(guild, settings, now, { force: end }) : null;
  if (ended && (end || !settings.happenings)) notes.push(`⏹️ Ended ${kindName(ended.kind)}.`);
  else if (end) notes.push('Nothing is happening right now, so there was nothing to end.');

  if (start) notes.push(await startNow(interaction, settings, start, now));

  const content = [
    ...notes,
    ...(notes.length ? [''] : []),
    changed ? '✅ **Happenings saved**' : '🎪 **Happenings**',
    ...happeningSummary(guildId, settings, now),
  ].join('\n');
  if (deferred) await interaction.editReply({ content, allowedMentions: { parse: [] } });
  else await reply(interaction, content);
}

/** Start `kind` now as an admin, and announce it. @returns the line saying how it went */
async function startNow(interaction, settings, kind, now) {
  const h = HAPPENINGS[kind];
  if (!h) return '❌ There\'s no such happening.';
  if (!settings.happenings) return '❌ Happenings are switched off. Turn them on with `enabled:True` to start one.';
  // How long it lasts is the server's pace's (an hour at quick, about a day from `day` on)
  const started = startHappening(interaction.guildId, kind, { source: 'admin', startedBy: interaction.user.id, pace: settings.pace }, now);
  if (started.error === 'in-progress') {
    return `❌ ${kindName(started.happening.kind)} is on ${until(started.happening.endsAt)}. They run one at a time: end it with \`end:True\` first.`;
  }
  if (started.error) return '❌ Couldn\'t start it.';
  const on = `${kindName(kind)} is on ${until(started.happening.endsAt)}`;
  const sent = await announceHappening(interaction.guild, settings, started.happening, { now, fallback: interaction.channel });
  if (sent.channel) return `${on}, announced in <#${sent.channel.id}>.`;
  const why = sent.error === 'no-channel'
    ? 'there\'s no games channel where I can View, Send and Embed Links'
    : 'the announcement didn\'t send';
  return `${on}. I couldn't announce it: ${why}. It applies anyway, and changed plays show ${h.tag}.`;
}

/** The two ways a chosen happenings channel quietly does nothing */
async function channelWarnings(guild, settings, channelId) {
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channelAllowed(settings, channel.id, channel.parentId || null).ok) {
    return [`⚠️ The games aren't played in <#${channelId}>, so happenings won't be announced there.`];
  }
  if (!(await botCanPost(guild, channel))) {
    return [`⚠️ I can't post in <#${channelId}> yet: I need View Channel, Send Messages and Embed Links there.`];
  }
  return [];
}

/** The settings, what's on now, and the last few, as summary lines */
function happeningSummary(guildId, settings, now) {
  const state = loadState(guildId);
  const lines = [
    settings.happenings
      ? `• Happenings: **on** · random ones: **${(happeningPace(settings.pace).per === 'week' ? WEEKLY_FREQUENCY_TEXT : FREQUENCY_TEXT)[settings.happeningFrequency]}**`
      : '• Happenings: **off**',
  ];
  const games = settings.channelMode === 'only' && settings.channels.length === 1 ? settings.channels[0] : null;
  lines.push(`• Announced in: ${settings.happeningChannel
    ? `<#${settings.happeningChannel}>`
    : games ? `<#${games}> (the games channel)` : 'the channel the games were last played in'}`);
  lines.push(settings.twists ? `• Twists: **on**, **${settings.twistPercent}%** of scored plays` : '• Twists: **off**');
  // 2.76.0: the Six-Demon Bag's hexes (the bag itself is /eggshen-config commands toggle setting:magic)
  lines.push(settings.magic ? `• Hexes: **${settings.hexes ? 'on' : 'off'}**` : '• Hexes: **off** (the Six-Demon Bag is switched off)');
  lines.push(...paceLines(settings));
  const h = state.happening;
  lines.push(inProgress(h, now)
    ? `• Now: ${kindName(h.kind)}, ${until(h.endsAt)}${h.unannounced ? ' · not announced' : ''}`
    : '• Now: nothing');
  if (settings.happenings) {
    for (const c of calendarHappenings(now)) lines.push(`• Today: ${c.emoji} **${c.name}**: ${c.about}`);
  }
  const recent = state.history.slice(-3).reverse();
  if (recent.length) {
    lines.push(`• Lately: ${recent.map(r => `${HAPPENINGS[r.kind]?.emoji ?? ''} ${HAPPENINGS[r.kind]?.name ?? r.kind} <t:${unix(r.endedAt)}:R>`).join(' · ')}`);
  }
  return lines;
}

/**
 * 2.74.0: the pace and what it means here — the numbers every member
 * plays by, read from the preset (and the random-siege frequency's gap).
 * A siege already on keeps the timings it started with.
 */
function paceLines(settings) {
  const key = settings.pace;
  const p = pacePreset(key);
  const h = happeningPace(key);
  const length = lengthWords(defaultSiegeMinutes(settings));
  const random = settings.siegeFrequency === 'off'
    ? '**off** (only when an admin starts one)'
    : p.report
      ? `**${settings.siegeFrequency}**: the next comes ${lengthWords(randomGapHours(key, settings.siegeFrequency) * 60)} after the last one ends, while people play`
      : `**${SIEGE_FREQUENCY_TEXT[settings.siegeFrequency]}**`;
  return [
    `• Pace: **${p.name}**${key === 'week' ? ' (the default)' : ''} · a siege lasts **${length}**${p.nightEnd ? ', ending at 12:00 UTC' : ''}`,
    `-# The monster acts every ${p.actEvery} ${p.busy ? 'minutes while people fight' : 'minutes'} · ${lengthWords(p.freeMinutes)} to free a grabbed fighter · ${p.allowance ? `${p.allowance} attacks a night each` : 'no attack limit'}${p.pot ? ' · attacks pay into the pot' : ''}${p.report ? ` · ${reportWords(p)}` : ''}`,
    `• Random sieges: ${random}`,
    `-# Happenings last ${h.k === 1 ? 'their usual time' : `${h.k}× as long${h.per === 'week' ? ' (about a day)' : ''}`}, at most ${h.max} a ${h.per}`,
  ];
}

async function reset(interaction) {
  const game = interaction.options.getString('game');
  const user = interaction.options.getUser('user');
  const changed = resetScores(interaction.guildId, { game, userId: user?.id || null });
  const what = game ? `${GAME_NAMES[game]} scores` : 'all game scores';
  const whose = user ? ` for ${user.globalName || user.username}` : '';
  await reply(interaction, changed
    ? `🗑️ Erased ${what}${whose} (${changed} ${changed === 1 ? 'person' : 'people'}).`
    : `Nothing to erase: no ${what}${whose}.`);
}

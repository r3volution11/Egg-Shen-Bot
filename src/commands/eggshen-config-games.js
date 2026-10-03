import { SlashCommandBuilder, ChannelType } from 'discord.js';
import { loadGuildConfig, saveGuildConfig, isAdmin } from '../utils/guildConfig.js';
import { getGameSettings, resetScores, GAMES, GAME_NAMES } from '../utils/gameScores.js';

/**
 * /eggshen-config-games — the game settings for /potion, /foodfight, /doom
 * and /rescue: play limits, where they can be played, and wiping scores.
 * Turning a game off entirely stays with /eggshen-config commands toggle,
 * beside every other command switch.
 *
 * Its own file because /eggshen-config is near Discord's 8000-byte limit.
 * Each subcommand shows the current settings when given no options, so
 * there's no separate "view".
 */

const LIMITS = [
  { option: 'cooldown-seconds', key: 'cooldownSeconds', min: 0, max: 3600, about: 'Seconds between plays of the same game, per person' },
  { option: 'per-minute', key: 'perMinute', min: 1, max: 60, about: 'Plays per minute across all games, per person' },
  { option: 'daily-scored-plays', key: 'dailyScoredPlays', min: 0, max: 1000, about: 'Scored plays per game per person each day (UTC)' },
  { option: 'shield-minutes', key: 'shieldMinutes', min: 0, max: 1440, about: 'How long a rescue shields someone from /doom (0: off)' },
];

const MODE_TEXT = {
  all: 'Every channel',
  only: 'Only the listed channels',
  except: 'Every channel except the listed ones',
};

export const data = new SlashCommandBuilder()
  .setName('eggshen-config-games')
  .setDescription('Game settings for /potion, /foodfight, /doom, /rescue (Admin/Moderator only)')
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

import { SlashCommandBuilder } from 'discord.js';
import { loadGuildConfig, saveGuildConfig, isAdmin, canUseCommand } from '../utils/guildConfig.js';
import { resolveSocialTarget } from '../utils/socialTarget.js';
import { beginPlay, finishPlay, tagged, pick } from '../utils/gamePlay.js';
import { RESCUE_LINES } from '../data/rescueLines.js';

/**
 * /rescue — /doom's helpful counterpart (Doug, 2026-10-02): save someone,
 * horror-movie style. A Final Girl drags them out of the cabin, holy water,
 * the boomstick, the dog that always survives. A game with points
 * (src/utils/gameScores.js); each line is tagged rescued, caught or
 * sacrificed, and a rescue (or a heroic sacrifice) shields the one saved:
 * the next /doom aimed at them is blocked.
 *
 * Rescuing yourself is refused — it would hand you a shield on demand.
 * The main subcommand is `attempt`, which sorts ahead of `lines` in
 * Discord's alphabetical picker.
 */

export const RESCUE_TROPES = [
  { value: 'final-girl', name: '🔪 Final Girl' },
  { value: 'holy-water', name: '💧 Holy Water' },
  { value: 'ghostbusters', name: '👻 Ghostbusters' },
  { value: 'boomstick', name: '🔫 Boomstick' },
  { value: 'salt-circle', name: '🧂 Salt Circle' },
  { value: 'silver-bullet', name: '🥈 Silver Bullet' },
  { value: 'sunrise', name: '🌅 Sunrise' },
  { value: 'getaway-car', name: '🚗 Getaway Car' },
  { value: 'van-helsing', name: '🗡️ Van Helsing' },
  { value: 'survival-rules', name: '📜 Survival Rules' },
  { value: 'garlic', name: '🧄 Garlic' },
  { value: 'the-dog', name: '🐕 The Dog' },
];

const OUTCOMES = ['rescued', 'caught', 'sacrificed'];

/** Custom lines for this server, per trope. Configs predating the key lack it. */
export function getRescueLines(config) {
  const lines = config?.rescueLines;
  return lines && typeof lines === 'object' ? lines : {};
}

const tropeName = (value) => RESCUE_TROPES.find(t => t.value === value)?.name || value;

const tropeOption = (required) => (option) => option
  .setName('trope')
  .setDescription(required ? 'Which rescue' : 'How to save them (default: whatever works)')
  .setRequired(required)
  .addChoices(...RESCUE_TROPES.map(t => ({ name: t.name, value: t.value })));

export const data = new SlashCommandBuilder()
  .setName('rescue')
  .setDescription('Save someone from a horror movie, and shield them from /doom')
  .addSubcommand(sub => sub
    .setName('attempt')
    .setDescription('Rescue someone, a role, or @everyone: Final Girl, holy water, the boomstick…')
    .addMentionableOption(option => option
      .setName('target')
      .setDescription('Who to save: a member, a role, or @everyone')
      .setRequired(true))
    .addStringOption(tropeOption(false)))
  .addSubcommandGroup(group => group
    .setName('lines')
    .setDescription('Manage this server\'s own rescue lines (Admin/Mod only)')
    .addSubcommand(sub => sub
      .setName('add')
      .setDescription('Add a line. Use {user} and {target}')
      .addStringOption(tropeOption(true))
      .addStringOption(option => option
        .setName('outcome')
        .setDescription('What happens (scores points)')
        .setRequired(true)
        .addChoices(...OUTCOMES.map(o => ({ name: o, value: o }))))
      .addStringOption(option => option
        .setName('line')
        .setDescription('e.g. "{user} drags {target} out the window just in time!"')
        .setRequired(true)
        .setMaxLength(500)))
    .addSubcommand(sub => sub
      .setName('remove')
      .setDescription('Remove one of this server\'s lines')
      .addStringOption(tropeOption(true))
      .addIntegerOption(option => option
        .setName('number')
        .setDescription('Its number in /rescue lines list')
        .setRequired(true)
        .setMinValue(1)))
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('Show a rescue\'s lines')
      .addStringOption(tropeOption(true)))
    .addSubcommand(sub => sub
      .setName('reset')
      .setDescription('Remove all of this server\'s lines for a rescue')
      .addStringOption(tropeOption(true))));

export async function execute(interaction) {
  if (!await canUseCommand(interaction.guildId, interaction.member, 'rescue')) {
    await interaction.reply({ content: '❌ /rescue is turned off on this server.', ephemeral: true });
    return;
  }

  if (interaction.options.getSubcommandGroup() === 'lines') {
    if (!isAdmin(interaction.member)) {
      await interaction.reply({ content: '❌ Only administrators and moderators can change the rescue lines.', ephemeral: true });
      return;
    }
    await manageLines(interaction);
    return;
  }

  await attempt(interaction);
}

async function attempt(interaction) {
  const target = resolveSocialTarget(interaction, 'target');
  if (!target || target.isBot) {
    await interaction.reply({ content: '🤖 Bots don\'t need rescuing. They\'re the ones who survive the robot uprising.', ephemeral: true });
    return;
  }
  if (target.kind === 'member' && target.pingUserIds[0] === interaction.user.id) {
    await interaction.reply({ content: '🔪 Final Girls don\'t save themselves for points. Rescue someone else!', ephemeral: true });
    return;
  }

  const started = await beginPlay(interaction, 'rescue');
  if (!started) return;

  const trope = interaction.options.getString('trope') || pick(RESCUE_TROPES).value;
  const line = pick([...tagged(getRescueLines(started.config)[trope], 'rescued'), ...(RESCUE_LINES[trope] || [])]);
  const text = line.text.replace(/{user}/g, `<@${interaction.user.id}>`).replace(/{target}/g, target.mention);
  await finishPlay(interaction, { game: 'rescue', target, text, outcome: line.outcome, settings: started.settings });
}

async function manageLines(interaction) {
  const sub = interaction.options.getSubcommand();
  const trope = interaction.options.getString('trope');
  const config = await loadGuildConfig(interaction.guildId);
  const all = getRescueLines(config);
  const custom = tagged(all[trope], 'rescued');
  const save = async (next) => {
    config.rescueLines = { ...all, [trope]: next };
    if (next.length === 0) delete config.rescueLines[trope];
    await saveGuildConfig(interaction.guildId, config);
  };
  const reply = (content) => interaction.reply({ content, ephemeral: true, allowedMentions: { parse: [] } });

  if (sub === 'add') {
    const line = interaction.options.getString('line').trim();
    const outcome = interaction.options.getString('outcome') || 'rescued';
    if (!line.includes('{user}') || !line.includes('{target}')) {
      await reply('❌ A line needs both `{user}` and `{target}`, e.g. `{user} drags {target} out the window just in time!`');
      return;
    }
    await save([...custom, { text: line, outcome }]);
    await reply(`✅ Added to ${tropeName(trope)} as **${outcome}**:\n${line}`);
    return;
  }

  if (sub === 'remove') {
    const n = interaction.options.getInteger('number');
    if (n > custom.length) {
      await reply(`❌ ${tropeName(trope)} has ${custom.length} line${custom.length === 1 ? '' : 's'} of this server's own. See \`/rescue lines list\`.`);
      return;
    }
    const [removed] = custom.splice(n - 1, 1);
    await save(custom);
    await reply(`🗑️ Removed from ${tropeName(trope)}:\n${removed.text}`);
    return;
  }

  if (sub === 'reset') {
    await save([]);
    await reply(`✅ ${tropeName(trope)} is back to the built-in lines only.`);
    return;
  }

  const defaults = RESCUE_LINES[trope] || [];
  const short = (t) => (t.length > 90 ? `${t.slice(0, 90)}…` : t);
  const parts = [`**${tropeName(trope)}**`];
  if (custom.length) {
    parts.push(`\n**This server's lines (${custom.length}):**`, ...custom.map((l, i) => `${i + 1}. [${l.outcome}] ${short(l.text)}`));
  }
  parts.push(`\n**Built-in lines (${defaults.length}):**`, ...defaults.map(l => `• [${l.outcome}] ${short(l.text)}`));
  await reply(parts.join('\n').slice(0, 2000));
}

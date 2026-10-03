import { SlashCommandBuilder } from 'discord.js';
import { loadGuildConfig, saveGuildConfig, isAdmin, canUseCommand } from '../utils/guildConfig.js';
import { resolveSocialTarget } from '../utils/socialTarget.js';
import { beginPlay, finishPlay, tagged, pick, isShielded } from '../utils/gamePlay.js';
import { DOOM_LINES } from '../data/doomLines.js';
import { DOOM_BLOCKED_LINES } from '../data/rescueLines.js';

/**
 * /doom — deal someone, a role, or @everyone a horror-movie fate: a zombie
 * bite, a monkey's paw, a cursed tape. /foodfight's horror sibling, built the
 * same way (Doug's call, 2026-10-02): one fate, one line, no state.
 * Horror-comedy: gore is fine when it's played for laughs (Evil Dead II, not
 * Saw); nothing sexual, no self-harm, no real people.
 *
 * The main subcommand is `fate`, not `throw`-style verbs: Discord lists a
 * command's subcommands alphabetically, so /foodfight shows its four `lines`
 * admin entries before `throw`. `fate` sorts ahead of `lines`.
 *
 * Lines use {user} and {target}. {target} may be one person, a role, or
 * @everyone, so lines read for any of them. Admins add their own per trope
 * with /doom lines, stored in the server config as `doomLines`.
 *
 * A game with points (src/utils/gameScores.js): each line is tagged doomed,
 * escaped or backfired. /rescue is its helpful counterpart, and a rescue
 * shields someone: the next /doom aimed at them is blocked.
 */

const OUTCOMES = ['doomed', 'escaped', 'backfired'];

/** The tropes. One list, used by every subcommand's `trope` option. */
export const TROPES = [
  { value: 'zombie', name: '🧟 Zombie' },
  { value: 'monkey-paw', name: '🐒 Monkey\'s Paw' },
  { value: 'slasher', name: '🪓 Slasher' },
  { value: 'possession', name: '😈 Possession' },
  { value: 'cursed-tape', name: '📼 Cursed Tape' },
  { value: 'haunted-doll', name: '🪆 Haunted Doll' },
  { value: 'vampire', name: '🧛 Vampire' },
  { value: 'werewolf', name: '🐺 Werewolf' },
  { value: 'killer-clown', name: '🤡 Killer Clown' },
  { value: 'necronomicon', name: '📖 Necronomicon' },
  { value: 'ouija', name: '🔮 Ouija Board' },
  { value: 'bloody-mary', name: '🪞 Bloody Mary' },
];

/** Built-in lines, tagged with their outcome: doomed / escaped / backfired */
export const DEFAULT_DOOM_LINES = DOOM_LINES;

/** Custom lines for this server, per trope. Configs predating the key lack it. */
export function getDoomLines(config) {
  const lines = config?.doomLines;
  return lines && typeof lines === 'object' ? lines : {};
}

const tropeName = (value) => TROPES.find(t => t.value === value)?.name || value;

/** The `trope` option, the same for every subcommand */
const tropeOption = (required) => (option) => option
  .setName('trope')
  .setDescription(required ? 'Which horror trope' : 'Which horror trope (default: fate decides)')
  .setRequired(required)
  .addChoices(...TROPES.map(t => ({ name: t.name, value: t.value })));

export const data = new SlashCommandBuilder()
  .setName('doom')
  .setDescription('Deal someone, a role, or @everyone a horror-movie fate')
  .addSubcommand(sub => sub
    .setName('fate')
    .setDescription('Deal a horror-movie fate: a zombie, a monkey\'s paw, a cursed tape…')
    .addMentionableOption(option => option
      .setName('target')
      .setDescription('Who\'s doomed: a member, a role, or @everyone')
      .setRequired(true))
    .addStringOption(tropeOption(false)))
  .addSubcommandGroup(group => group
    .setName('lines')
    .setDescription('Manage this server\'s own doom lines (Admin/Mod only)')
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
        .setDescription('e.g. "{user} sends {target} a cursed casserole!"')
        .setRequired(true)
        .setMaxLength(500)))
    .addSubcommand(sub => sub
      .setName('remove')
      .setDescription('Remove one of this server\'s lines')
      .addStringOption(tropeOption(true))
      .addIntegerOption(option => option
        .setName('number')
        .setDescription('Its number in /doom lines list')
        .setRequired(true)
        .setMinValue(1)))
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('Show a trope\'s lines')
      .addStringOption(tropeOption(true)))
    .addSubcommand(sub => sub
      .setName('reset')
      .setDescription('Remove all of this server\'s lines for a trope')
      .addStringOption(tropeOption(true))));

export async function execute(interaction) {
  if (!await canUseCommand(interaction.guildId, interaction.member, 'doom')) {
    await interaction.reply({ content: '❌ /doom is turned off on this server.', ephemeral: true });
    return;
  }

  if (interaction.options.getSubcommandGroup() === 'lines') {
    if (!isAdmin(interaction.member)) {
      await interaction.reply({ content: '❌ Only administrators and moderators can change the doom lines.', ephemeral: true });
      return;
    }
    await manageLines(interaction);
    return;
  }

  await dealFate(interaction);
}

async function dealFate(interaction) {
  const target = resolveSocialTarget(interaction, 'target');
  if (!target || target.isBot) {
    await interaction.reply({ content: '🤖 Bots are already undead. Nothing happens.', ephemeral: true });
    return;
  }

  const started = await beginPlay(interaction, 'doom');
  if (!started) return;

  const fill = (text) => text.replace(/{user}/g, `<@${interaction.user.id}>`).replace(/{target}/g, target.mention);

  // A recent rescue shields them: this doom is blocked, and uses the shield up
  if (isShielded(interaction, target) && target.pingUserIds[0] !== interaction.user.id) {
    await finishPlay(interaction, { game: 'doom', target, text: fill(pick(DOOM_BLOCKED_LINES)), outcome: 'blocked', settings: started.settings });
    return;
  }

  const trope = interaction.options.getString('trope') || pick(TROPES).value;
  const lines = [...tagged(getDoomLines(started.config)[trope], 'doomed'), ...(DOOM_LINES[trope] || [])];
  const line = pick(lines);
  await finishPlay(interaction, { game: 'doom', target, text: fill(line.text), outcome: line.outcome, settings: started.settings });
}

async function manageLines(interaction) {
  const sub = interaction.options.getSubcommand();
  const trope = interaction.options.getString('trope');
  const config = await loadGuildConfig(interaction.guildId);
  const all = getDoomLines(config);
  const custom = tagged(all[trope], 'doomed');
  const save = async (next) => {
    config.doomLines = { ...all, [trope]: next };
    if (next.length === 0) delete config.doomLines[trope];
    await saveGuildConfig(interaction.guildId, config);
  };
  const reply = (content) => interaction.reply({ content, ephemeral: true, allowedMentions: { parse: [] } });

  if (sub === 'add') {
    const line = interaction.options.getString('line').trim();
    if (!line.includes('{user}') || !line.includes('{target}')) {
      await reply('❌ A line needs both `{user}` and `{target}`, e.g. `{user} sends {target} a cursed casserole!`');
      return;
    }
    const outcome = interaction.options.getString('outcome') || 'doomed';
    await save([...custom, { text: line, outcome }]);
    await reply(`✅ Added to ${tropeName(trope)} as **${outcome}**:\n${line}`);
    return;
  }

  if (sub === 'remove') {
    const n = interaction.options.getInteger('number');
    if (n > custom.length) {
      await reply(`❌ ${tropeName(trope)} has ${custom.length} line${custom.length === 1 ? '' : 's'} of this server's own. See \`/doom lines list\`.`);
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

  // list
  const defaults = DEFAULT_DOOM_LINES[trope] || [];
  const short = (t) => (t.length > 90 ? `${t.slice(0, 90)}…` : t);
  const parts = [`**${tropeName(trope)}**`];
  if (custom.length) {
    parts.push(`\n**This server's lines (${custom.length}):**`, ...custom.map((l, i) => `${i + 1}. [${l.outcome}] ${short(l.text)}`));
  }
  parts.push(`\n**Built-in lines (${defaults.length}):**`, ...defaults.map(l => `• [${l.outcome}] ${short(l.text)}`));
  await reply(parts.join('\n').slice(0, 2000));
}

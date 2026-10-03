import { SlashCommandBuilder } from 'discord.js';
import { loadGuildConfig, saveGuildConfig, isAdmin, canUseCommand } from '../utils/guildConfig.js';
import { resolveSocialTarget } from '../utils/socialTarget.js';
import { beginPlay, finishPlay, tagged, pick } from '../utils/gamePlay.js';
import { FOODFIGHT_LINES } from '../data/foodfightLines.js';
import { FOODFIGHT_FEED_LINES } from '../data/foodfightFeedLines.js';

/**
 * /foodfight — throw food at someone, a role, or @everyone, after the
 * classic BBS door game — or feed them instead. A game with points
 * (src/utils/gameScores.js): every line is tagged with what happened.
 *   throw: hit / miss / backfire        feed: tasty / gross / spill
 * `feed` is the helpful side (Doug, 2026-10-02), so the game isn't only
 * about hurting people.
 *
 * Subcommand names sort `feed`, `lines …`, `throw` in Discord's picker,
 * which lists them alphabetically.
 *
 * Lines use {thrower}/{feeder} and {target}; {target} may be one person, a
 * role, or @everyone. Admins add their own with /foodfight lines, stored in
 * the server config as `foodfightLines` and `foodfightFeedLines`.
 */

/** The menu. One list, used by every subcommand's `food` option. */
export const FOODS = [
  { value: 'pie', name: '🥧 Cream Pie' },
  { value: 'spaghetti', name: '🍝 Spaghetti' },
  { value: 'pudding', name: '🍮 Pudding' },
  { value: 'mashed-potatoes', name: '🥔 Mashed Potatoes' },
  { value: 'jello', name: '🟩 Jell-O' },
  { value: 'meatloaf', name: '🍖 Meatloaf' },
  { value: 'creamed-corn', name: '🌽 Creamed Corn' },
  { value: 'tapioca', name: '🥣 Tapioca' },
  { value: 'pizza', name: '🍕 Pizza' },
  { value: 'taco', name: '🌮 Taco' },
  { value: 'fish-sticks', name: '🐟 Fish Sticks' },
  { value: 'pea-soup', name: '🥬 Split Pea Soup' },
];

/** Throw and feed: their lines, placeholder, outcomes, and config key */
export const ACTIONS = {
  throw: { lines: FOODFIGHT_LINES, actorTag: '{thrower}', outcomes: ['hit', 'miss', 'backfire'], fallback: 'hit', configKey: 'foodfightLines' },
  feed: { lines: FOODFIGHT_FEED_LINES, actorTag: '{feeder}', outcomes: ['tasty', 'gross', 'spill'], fallback: 'tasty', configKey: 'foodfightFeedLines' },
};

/** Custom lines for this server, per action and food. Configs predating a key lack it. */
export function getFoodfightLines(config, action = 'throw') {
  const lines = config?.[ACTIONS[action].configKey];
  return lines && typeof lines === 'object' ? lines : {};
}

const foodName = (value) => FOODS.find(f => f.value === value)?.name || value;

/** The `food` option, the same for every subcommand */
const foodOption = (required, verb = 'throw') => (option) => option
  .setName('food')
  .setDescription(required ? 'Which food' : `What to ${verb} (default: whatever's on the tray)`)
  .setRequired(required)
  .addChoices(...FOODS.map(f => ({ name: f.name, value: f.value })));

const actionOption = (option) => option
  .setName('action')
  .setDescription('Throw lines or feed lines')
  .setRequired(true)
  .addChoices({ name: 'Throw', value: 'throw' }, { name: 'Feed', value: 'feed' });

const targetOption = (description) => (option) => option
  .setName('target')
  .setDescription(description)
  .setRequired(true);

export const data = new SlashCommandBuilder()
  .setName('foodfight')
  .setDescription('Food fight! Throw food at someone, or feed them')
  .addSubcommand(sub => sub
    .setName('feed')
    .setDescription('Feed someone, a role, or @everyone (the nice way to play)')
    .addMentionableOption(targetOption('Who to feed: a member, a role, or @everyone'))
    .addStringOption(foodOption(false, 'feed')))
  .addSubcommandGroup(group => group
    .setName('lines')
    .setDescription('Manage this server\'s own food fight lines (Admin/Mod only)')
    .addSubcommand(sub => sub
      .setName('add')
      .setDescription('Add a line: {thrower} or {feeder}, and {target}')
      .addStringOption(actionOption)
      .addStringOption(foodOption(true))
      .addStringOption(option => option
        .setName('outcome')
        .setDescription('What happens (scores points)')
        .setRequired(true)
        .addChoices(
          { name: 'Throw: hit', value: 'hit' }, { name: 'Throw: miss', value: 'miss' }, { name: 'Throw: backfire', value: 'backfire' },
          { name: 'Feed: tasty', value: 'tasty' }, { name: 'Feed: gross', value: 'gross' }, { name: 'Feed: spill', value: 'spill' },
        ))
      .addStringOption(option => option
        .setName('line')
        .setDescription('e.g. "{thrower} hurls nachos at {target}!"')
        .setRequired(true)
        .setMaxLength(500)))
    .addSubcommand(sub => sub
      .setName('remove')
      .setDescription('Remove one of this server\'s lines')
      .addStringOption(actionOption)
      .addStringOption(foodOption(true))
      .addIntegerOption(option => option
        .setName('number')
        .setDescription('Its number in /foodfight lines list')
        .setRequired(true)
        .setMinValue(1)))
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('Show a food\'s lines')
      .addStringOption(actionOption)
      .addStringOption(foodOption(true)))
    .addSubcommand(sub => sub
      .setName('reset')
      .setDescription('Remove all of this server\'s lines for a food')
      .addStringOption(actionOption)
      .addStringOption(foodOption(true))))
  .addSubcommand(sub => sub
    .setName('throw')
    .setDescription('Throw food at someone, a role, or @everyone')
    .addMentionableOption(targetOption('Who to hit: a member, a role, or @everyone'))
    .addStringOption(foodOption(false)));

export async function execute(interaction) {
  if (!await canUseCommand(interaction.guildId, interaction.member, 'foodfight')) {
    await interaction.reply({ content: '❌ /foodfight is turned off on this server.', ephemeral: true });
    return;
  }

  if (interaction.options.getSubcommandGroup() === 'lines') {
    if (!isAdmin(interaction.member)) {
      await interaction.reply({ content: '❌ Only administrators and moderators can change the food fight lines.', ephemeral: true });
      return;
    }
    await manageLines(interaction);
    return;
  }

  await play(interaction, interaction.options.getSubcommand() === 'feed' ? 'feed' : 'throw');
}

async function play(interaction, action) {
  const target = resolveSocialTarget(interaction, 'target');
  if (!target || target.isBot) {
    await interaction.reply({
      content: action === 'feed' ? '🤖 Bots don\'t eat. It just sits there, judging you.' : '🤖 Bots have excellent reflexes. It sails right past.',
      ephemeral: true,
    });
    return;
  }

  const started = await beginPlay(interaction, 'foodfight');
  if (!started) return;

  const spec = ACTIONS[action];
  const food = interaction.options.getString('food') || pick(FOODS).value;
  const lines = [
    ...tagged(getFoodfightLines(started.config, action)[food], spec.fallback),
    ...(spec.lines[food] || []),
  ];
  const line = pick(lines);
  const text = line.text
    .split(spec.actorTag).join(`<@${interaction.user.id}>`)
    .replace(/{target}/g, target.mention);

  await finishPlay(interaction, { game: 'foodfight', target, text, outcome: line.outcome, settings: started.settings });
}

async function manageLines(interaction) {
  const sub = interaction.options.getSubcommand();
  const action = interaction.options.getString('action') || 'throw';
  const spec = ACTIONS[action];
  const food = interaction.options.getString('food');
  const config = await loadGuildConfig(interaction.guildId);
  const all = getFoodfightLines(config, action);
  const custom = tagged(all[food], spec.fallback);
  const save = async (next) => {
    config[spec.configKey] = { ...all, [food]: next };
    if (next.length === 0) delete config[spec.configKey][food];
    await saveGuildConfig(interaction.guildId, config);
  };
  const reply = (content) => interaction.reply({ content, ephemeral: true, allowedMentions: { parse: [] } });
  const where = `${foodName(food)} (${action})`;

  if (sub === 'add') {
    const line = interaction.options.getString('line').trim();
    const outcome = interaction.options.getString('outcome');
    if (!spec.outcomes.includes(outcome)) {
      await reply(`❌ A ${action} line's outcome is one of: ${spec.outcomes.join(', ')}.`);
      return;
    }
    if (!line.includes(spec.actorTag) || !line.includes('{target}')) {
      await reply(`❌ A ${action} line needs both \`${spec.actorTag}\` and \`{target}\`, e.g. \`${spec.actorTag} hurls nachos at {target}!\``);
      return;
    }
    await save([...custom, { text: line, outcome }]);
    await reply(`✅ Added to ${where} as **${outcome}**:\n${line}`);
    return;
  }

  if (sub === 'remove') {
    const n = interaction.options.getInteger('number');
    if (n > custom.length) {
      await reply(`❌ ${where} has ${custom.length} line${custom.length === 1 ? '' : 's'} of this server's own. See \`/foodfight lines list\`.`);
      return;
    }
    const [removed] = custom.splice(n - 1, 1);
    await save(custom);
    await reply(`🗑️ Removed from ${where}:\n${removed.text}`);
    return;
  }

  if (sub === 'reset') {
    await save([]);
    await reply(`✅ ${where} is back to the built-in lines only.`);
    return;
  }

  // list
  const defaults = spec.lines[food] || [];
  const short = (t) => (t.length > 90 ? `${t.slice(0, 90)}…` : t);
  const parts = [`**${where}**`];
  if (custom.length) {
    parts.push(`\n**This server's lines (${custom.length}):**`, ...custom.map((l, i) => `${i + 1}. [${l.outcome}] ${short(l.text)}`));
  }
  parts.push(`\n**Built-in lines (${defaults.length}):**`, ...defaults.map(l => `• [${l.outcome}] ${short(l.text)}`));
  await reply(parts.join('\n').slice(0, 2000));
}

import { SlashCommandBuilder } from 'discord.js';
import { loadGuildConfig, saveGuildConfig, isAdmin, canUseCommand } from '../utils/guildConfig.js';
import { resolveSocialTarget, allowedMentionsFor } from '../utils/socialTarget.js';

/**
 * /foodfight — throw food at someone, a role, or @everyone, after the
 * classic BBS door game. One throw, one line: it hits, misses, or backfires.
 * No scores, no state (Doug's call, 2026-10-02): the fun is the line.
 *
 * Lines use {thrower} and {target}. {target} may be one person, a role, or
 * @everyone, so lines read for any of them ("{target} is wearing it").
 * Admins add their own lines per food with /foodfight lines, stored in the
 * server config as `foodfightLines` (see getFoodfightLines).
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

export const DEFAULT_FOODFIGHT_LINES = {
  pie: [
    '🥧 {thrower} winds up like a Three Stooges short and lands a cream pie square on {target}. *Nyuk nyuk nyuk.*',
    '🥧 {thrower} hurls a banana cream pie. {target} ducks, and it hits the wall with a sound like Gallagher\'s final show.',
    '🥧 {thrower} serves {target} a pie to the face. "Just one more thing…" says Columbo, licking his finger.',
    '🥧 {thrower} aims a pie at {target}, slips on whipped cream, and wears it themselves. Instant karma.',
    '🥧 Direct hit! {target} is now 40% meringue. {thrower} is legally a pastry chef.',
    '🥧 {thrower} throws the pie. {target} catches it, takes a bite, and says "Thank you." Unsettling.',
  ],
  spaghetti: [
    '🍝 {thrower} launches a plate of spaghetti. {target} is now wearing it like Lady and the Tramp\'s worst date.',
    '🍝 {thrower} flings a meatball. It rolls off the table, onto the floor, and out the door. {target} is untouched.',
    '🍝 {thrower} upends the noodle bowl. Noodles everywhere! {target} looks like a Muppet who lost a fight with Swedish Chef.',
    '🍝 {thrower} twirls a forkful like a sling and lands it on {target}. "Mom\'s spaghetti," someone whispers.',
    '🍝 {thrower} throws spaghetti at {target}. Some sticks to the wall. It\'s done!',
    '🍝 {thrower} grabs the whole pot, misses {target}, and buries the lunch monitor. Detention for everyone.',
  ],
  pudding: [
    '🍮 {thrower} catapults chocolate pudding with a spoon. SPLAT. {target} has pudding in places pudding shouldn\'t be.',
    '🍮 "I see you shiver with antici… pudding!" {thrower} gets {target} mid-Rocky Horror monologue.',
    '🍮 {thrower} squeezes the pudding cup too hard and paints their own shirt. {target} wasn\'t even looking.',
    '🍮 Butterscotch pudding, right on {target}. {thrower} calls it a Snack Pack attack.',
    '🍮 {thrower} lobs a pudding cup at {target}. It bounces off and lands upright. Perfect ten from the judges.',
    '🍮 {target} dodges the pudding Matrix-style. {thrower} demands a rematch.',
  ],
  'mashed-potatoes': [
    '🥔 {thrower} sculpts Devil\'s Tower out of mashed potatoes, then throws it at {target}. "This means something."',
    '🥔 {thrower}\'s scoop of mashed potatoes hits {target} like a snowball. With gravy. Brutal.',
    '🥔 {thrower} flicks mashed potatoes at {target}. They land on {thrower}\'s own glasses.',
    '🥔 {target} takes a full scoop from {thrower} to the face and becomes the Pillsbury Doughboy\'s cousin.',
    '🥔 {thrower} throws mashed potatoes. {target} blocks with a lunch tray like Captain America.',
    '🥔 Gravy boat broadside! {thrower} sinks {target} in brown.',
  ],
  jello: [
    '🟩 {thrower} launches lime Jell-O. It wobbles through the air like The Blob and engulfs {target}.',
    '🟩 There\'s always room for Jell-O, and {thrower} just found room down {target}\'s collar.',
    '🟩 {thrower} throws a Jell-O mold at {target}. It jiggles, wobbles, and slides gracefully off the table. Nobody hit.',
    '🟩 {thrower} gets {target} with cherry Jell-O. {target} looks like a Ghostbusters slime victim. "I feel so funky."',
    '🟩 {thrower} fires the Jell-O at {target}. It ricochets off a lunch tray and comes straight back. Physics!',
    '🟩 {thrower} scores a direct hit on {target}. The Jell-O is still wobbling. So is {target}.',
  ],
  meatloaf: [
    '🍖 {thrower} heaves a slab of meatloaf at {target}. It lands with a THUD you can hear across the cafeteria.',
    '🍖 "I would do anything for meatloaf, but I won\'t do that," says {target}, ducking. {thrower} misses.',
    '🍖 {thrower} throws mystery meatloaf. It hits {target}. Nobody knows what was in it. Nobody wants to.',
    '🍖 {target} catches the meatloaf like a football and spikes it. Touchdown. {thrower} is stunned.',
    '🍖 The meatloaf sails past {target} and knocks over the trophy case. {thrower} is going to the principal\'s office.',
    '🍖 {thrower} lands ketchup-glazed meatloaf, center mass. {target} goes down like a Bond villain.',
  ],
  'creamed-corn': [
    '🌽 {thrower} flings creamed corn. It\'s like a scene from a Cronenberg movie, and {target} is the star.',
    '🌽 {thrower}\'s creamed corn splatters across {target}. Somewhere, the Children of the Corn nod approvingly.',
    '🌽 {thrower} throws creamed corn at {target} and slips on the puddle it left. Down goes {thrower}.',
    '🌽 {target} is hit with {thrower}\'s creamed corn and will be finding kernels for a week.',
    '🌽 {thrower} misses {target} by a mile and hits a poster of the food pyramid. Fitting.',
    '🌽 "He who walks behind the rows…" {thrower} appears from nowhere and corns {target}.',
  ],
  tapioca: [
    '🥣 {thrower} slings tapioca. {target} is now coated in what looks like a Gremlin\'s nest. Don\'t get it wet.',
    '🥣 {thrower}\'s tapioca hits {target} with the consistency of a Ghostbusters ectoplasm sample.',
    '🥣 {thrower} throws tapioca at {target}. It sticks to the spoon and won\'t let go. Throw cancelled.',
    '🥣 {target} takes {thrower}\'s tapioca to the hair and looks like they survived an Alien chestburster scene.',
    '🥣 {thrower} catapults the tapioca cup. {target} catches it in a bowl, perfectly. Show-off.',
    '🥣 {thrower} sets off bubble-tea-grade tapioca shrapnel. {target} took the worst of it.',
  ],
  pizza: [
    '🍕 {thrower} throws a slice frisbee-style. It lands cheese-side down on {target}. Every time.',
    '🍕 "Cowabunga!" {thrower} launches a pizza at {target} like a Ninja Turtle.',
    '🍕 {thrower} throws a whole pizza. {target} catches it and eats it. Turtle power wins this round.',
    '🍕 Pepperoni shrapnel from {thrower}! {target} is wearing three slices and a crust.',
    '🍕 {thrower} throws the pizza box instead of the pizza. Rookie mistake. {target} laughs.',
    '🍕 Kevin McCallister would be proud: {thrower} gets {target} with a cheese pizza, all for them.',
  ],
  taco: [
    '🌮 {thrower} throws a hard-shell taco. It shatters on {target} like a Die Hard window.',
    '🌮 {thrower} declares Taco Tuesday! {target} is wearing lettuce, cheese, and regret.',
    '🌮 {thrower} throws a taco at {target}; the shell flies, the filling doesn\'t. Only {thrower} gets hit.',
    '🌮 "Why not both?" {thrower} throws a hard and a soft taco at {target}. Both land.',
    '🌮 {target} dodges {thrower}\'s taco, and it takes out the hot sauce bottle. Everyone\'s eyes water.',
    '🌮 {thrower} throws a taco with the precision of a Mortal Kombat fatality. FLAWLESS VICTORY over {target}.',
  ],
  'fish-sticks': [
    '🐟 {thrower} fires fish sticks like throwing stars. {target} is pinned to the wall, ninja-style.',
    '🐟 {thrower} throws a fish stick. {target} catches it in their mouth like a seal at SeaWorld.',
    '🐟 "Do you like fish sticks?" {thrower} asks, then throws them at {target}. Classic.',
    '🐟 Tartar sauce barrage from {thrower}! {target} smells like a Jaws remake.',
    '🐟 {thrower} throws a fish stick at {target}, and it boomerangs back. {thrower} needs a bigger boat.',
    '🐟 {thrower} throws three fish sticks: three hits. {target} looks like a breaded porcupine.',
  ],
  'pea-soup': [
    '🥬 {thrower} lets loose split pea soup at {target}, Exorcist style. The power of Christ compels you to duck.',
    '🥬 {thrower}\'s pea soup hits {target} and keeps going. Somebody call Father Merrin.',
    '🥬 {thrower} tries projectile pea soup on {target}, but it\'s too thick. It just slides down {thrower}\'s chin.',
    '🥬 {thrower} coats {target} green, like a Ghostbusters run-in with Slimer.',
    '🥬 {thrower} throws a bowl of pea soup. {target} sidesteps; the soup hits the cafeteria ceiling and stays there.',
    '🥬 Hot pea soup all over {target}, whose head does a full 360 looking for {thrower}.',
  ],
};

/** Custom lines for this server, per food. Configs predating the key lack it. */
export function getFoodfightLines(config) {
  const lines = config?.foodfightLines;
  return lines && typeof lines === 'object' ? lines : {};
}

const foodName = (value) => FOODS.find(f => f.value === value)?.name || value;

/** The `food` option, the same for every subcommand */
const foodOption = (required) => (option) => option
  .setName('food')
  .setDescription(required ? 'Which food' : 'What to throw (default: whatever\'s on the tray)')
  .setRequired(required)
  .addChoices(...FOODS.map(f => ({ name: f.name, value: f.value })));

export const data = new SlashCommandBuilder()
  .setName('foodfight')
  .setDescription('Start a food fight with someone, a role, or @everyone')
  .addSubcommand(sub => sub
    .setName('throw')
    .setDescription('Throw food at someone, a role, or @everyone')
    .addMentionableOption(option => option
      .setName('target')
      .setDescription('Who to hit: a member, a role, or @everyone')
      .setRequired(true))
    .addStringOption(foodOption(false)))
  .addSubcommandGroup(group => group
    .setName('lines')
    .setDescription('Manage this server\'s own food fight lines (Admin/Mod only)')
    .addSubcommand(sub => sub
      .setName('add')
      .setDescription('Add a line. Use {thrower} and {target}')
      .addStringOption(foodOption(true))
      .addStringOption(option => option
        .setName('line')
        .setDescription('e.g. "{thrower} hurls nachos at {target}!"')
        .setRequired(true)
        .setMaxLength(500)))
    .addSubcommand(sub => sub
      .setName('remove')
      .setDescription('Remove one of this server\'s lines')
      .addStringOption(foodOption(true))
      .addIntegerOption(option => option
        .setName('number')
        .setDescription('Its number in /foodfight lines list')
        .setRequired(true)
        .setMinValue(1)))
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('Show a food\'s lines')
      .addStringOption(foodOption(true)))
    .addSubcommand(sub => sub
      .setName('reset')
      .setDescription('Remove all of this server\'s lines for a food')
      .addStringOption(foodOption(true))));

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

  await throwFood(interaction);
}

async function throwFood(interaction) {
  const target = resolveSocialTarget(interaction, 'target');
  if (!target || target.isBot) {
    await interaction.reply({ content: '🤖 Bots have excellent reflexes. It sails right past.', ephemeral: true });
    return;
  }

  const food = interaction.options.getString('food') || FOODS[Math.floor(Math.random() * FOODS.length)].value;
  const config = await loadGuildConfig(interaction.guildId);
  const lines = [...(getFoodfightLines(config)[food] || []), ...(DEFAULT_FOODFIGHT_LINES[food] || [])];
  const line = lines[Math.floor(Math.random() * lines.length)];

  await interaction.reply({
    content: line
      .replace(/{thrower}/g, `<@${interaction.user.id}>`)
      .replace(/{target}/g, target.mention),
    // Pings the thrower and a member target; a role or @everyone is shown, not pinged
    allowedMentions: allowedMentionsFor(interaction.user.id, target),
  });
}

async function manageLines(interaction) {
  const sub = interaction.options.getSubcommand();
  const food = interaction.options.getString('food');
  const config = await loadGuildConfig(interaction.guildId);
  const all = getFoodfightLines(config);
  const custom = all[food] || [];
  const save = async (next) => {
    config.foodfightLines = { ...all, [food]: next };
    if (next.length === 0) delete config.foodfightLines[food];
    await saveGuildConfig(interaction.guildId, config);
  };
  const reply = (content) => interaction.reply({ content, ephemeral: true, allowedMentions: { parse: [] } });

  if (sub === 'add') {
    const line = interaction.options.getString('line').trim();
    if (!line.includes('{thrower}') || !line.includes('{target}')) {
      await reply('❌ A line needs both `{thrower}` and `{target}`, e.g. `{thrower} hurls nachos at {target}!`');
      return;
    }
    await save([...custom, line]);
    await reply(`✅ Added to ${foodName(food)}:\n${line}`);
    return;
  }

  if (sub === 'remove') {
    const n = interaction.options.getInteger('number');
    if (n > custom.length) {
      await reply(`❌ ${foodName(food)} has ${custom.length} line${custom.length === 1 ? '' : 's'} of this server's own. See \`/foodfight lines list\`.`);
      return;
    }
    const [removed] = custom.splice(n - 1, 1);
    await save(custom);
    await reply(`🗑️ Removed from ${foodName(food)}:\n${removed}`);
    return;
  }

  if (sub === 'reset') {
    await save([]);
    await reply(`✅ ${foodName(food)} is back to the built-in lines only.`);
    return;
  }

  // list
  const defaults = DEFAULT_FOODFIGHT_LINES[food] || [];
  const short = (t) => (t.length > 100 ? `${t.slice(0, 100)}…` : t);
  const parts = [`**${foodName(food)}**`];
  if (custom.length) {
    parts.push(`\n**This server's lines (${custom.length}):**`, ...custom.map((t, i) => `${i + 1}. ${short(t)}`));
  }
  parts.push(`\n**Built-in lines (${defaults.length}):**`, ...defaults.map(t => `• ${short(t)}`));
  await reply(parts.join('\n').slice(0, 2000));
}

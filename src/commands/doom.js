import { SlashCommandBuilder } from 'discord.js';
import { loadGuildConfig, saveGuildConfig, isAdmin, canUseCommand } from '../utils/guildConfig.js';
import { resolveSocialTarget, allowedMentionsFor } from '../utils/socialTarget.js';

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
 */

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

export const DEFAULT_DOOM_LINES = {
  zombie: [
    '🧟 {target} gets bitten, turns, and immediately eats {user}. Somebody should have aimed for the head.',
    '🧟 {user} unleashes a zombie horde on {target}, who survives by acting exactly like a zombie. Shaun of the Dead rules apply.',
    '🧟 {user} tries to sneak past {target}\'s zombies with a trolley full of beer, Winchester-style. It goes about as well as it did in the movie.',
    '🧟 {target} becomes a zombie and shuffles toward {user}… slowly. Very slowly. {user} has time to finish their sandwich.',
    '🧟 {user} sets a zombie on {target}. The zombie takes one look at {target} and goes for {user} instead. Braaaains, it explains.',
    '🧟 {target} is surrounded at the mall. {user} watches from the escalator, eating a pretzel. Dawn of the Dead, but make it lunch.',
  ],
  'monkey-paw': [
    '🐒 {user} gives {target} a monkey\'s paw. {target} wishes for a million dollars. One finger curls. A million pennies fall from the sky.',
    '🐒 {target} accepts {user}\'s monkey\'s paw and wishes {user} would stop talking. A finger curls. The silence is… permanent-ish.',
    '🐒 {user} hands {target} a monkey\'s paw and wishes {target} would get what they deserve. The paw points back at {user}.',
    '🐒 {target} wishes for eternal youth on {user}\'s monkey\'s paw. {target} is now an extremely confused toddler.',
    '🐒 {user} offers {target} a monkey\'s paw. {target} wisely declines. The paw sulks in a drawer forever.',
    '🐒 {target} wishes to be famous with {user}\'s monkey\'s paw and becomes the subject of a very popular true-crime podcast.',
  ],
  slasher: [
    '🪓 {user} hurls an axe at {target}. It thunks into the cabin door an inch from {target}\'s head. Ki ki ki, ma ma ma.',
    '🪓 {target} says "I\'ll be right back." {user} nods slowly. {target} is not right back.',
    '🪓 {user} stalks {target} in a hockey mask but trips over a tent rope. {target} escapes and becomes the Final Girl.',
    '🪓 {target} goes into the basement to investigate a noise. {user} sighs and hands them a flashlight. It\'s a short movie.',
    '🪓 {user} chases {target} with a machete, but {target} runs. {user} walks. {user} still catches up. Horror physics.',
    '🪓 {user} swings at {target}, gets the machete stuck in a log, and has to watch {target} paddle away across Crystal Lake.',
  ],
  possession: [
    '😈 {target} is possessed by a demon {user} summoned. Their head does a full 360 to give {user} a dirty look.',
    '😈 {user} tries to exorcise {target} but reads the ritual backwards. Now {user} is speaking Latin and levitating.',
    '😈 {target} is possessed and projectile-vomits pea soup all over {user}. The power of laundry compels you.',
    '😈 {user} sets a deadite loose in {target}. {target} grins: "Join us." Groovy, says nobody.',
    '😈 {target}\'s possession turns out to be just a weird mood. {user} calls the priest anyway, just in case.',
    '😈 {user} says "Your soul is mine!" to {target}. {target}\'s soul files a restraining order.',
  ],
  'cursed-tape': [
    '📼 {user} mails {target} a cursed videotape. The phone rings. "Seven days." {target} asks if they deliver.',
    '📼 {target} watches {user}\'s cursed tape, then makes a copy and gives it right back to {user}. Rules are rules.',
    '📼 Samara crawls out of the TV for {target}, but {user} never adjusted the tracking. She\'s stuck halfway, flickering.',
    '📼 {user} sends {target} a cursed tape. {target} doesn\'t own a VCR. The curse is very disappointed.',
    '📼 {target} gets {user}\'s tape. Seven days later, the only casualty is {target}\'s Blockbuster late fee.',
    '📼 {user} forgets to "be kind, rewind." {target} watches the curse backwards and gets seven extra days.',
  ],
  'haunted-doll': [
    '🪆 {user} leaves a doll on {target}\'s pillow. It says "Hi, I\'m Chucky! Wanna play?" {target} does not want to play.',
    '🪆 {target} receives a vintage doll from {user}. It moves between rooms. It\'s now in {user}\'s room. Watching.',
    '🪆 {user} gifts {target} a M3GAN unit. It dances menacingly down the hall, then bonds with {target} and turns on {user}.',
    '🪆 {target} locks {user}\'s haunted doll in a glass case, Annabelle-style. The doll knocks. Politely. Every night.',
    '🪆 {user} sends {target} a ventriloquist dummy. It insults {target}\'s haircut. It isn\'t wrong.',
    '🪆 {target} throws {user}\'s haunted doll in the trash. It\'s back on the shelf in the morning, holding the trash.',
  ],
  vampire: [
    '🧛 {target} invites {user} in. Rookie mistake. {user} is a vampire and now lives in {target}\'s guest room.',
    '🧛 {user} goes for {target}\'s neck, but {target} had garlic bread for lunch. {user} retreats, coughing.',
    '🧛 {target} is bitten by {user} and immediately complains about the sun, the mirrors, and having to sleep in a box.',
    '🧛 {user} tries to hypnotize {target} with a Dracula stare. {target} stares back until {user} blinks first.',
    '🧛 {target} gets turned by {user}, joins the Lost Boys, and now can\'t stop eating noodles that are actually worms.',
    '🧛 {user} sneaks up on {target} at night. {target} opens the blinds. Sunrise. {user} is now a small pile of dust and regret.',
  ],
  werewolf: [
    '🐺 {user} drags {target} onto the moors on a full moon. "Stay on the road!" {target} does not stay on the road.',
    '🐺 {target} is bitten by {user} and spends the full moon chasing cars and eating {user}\'s shoes.',
    '🐺 {user} turns into a werewolf to scare {target}. The transformation takes so long that {target} goes home.',
    '🐺 {target} wakes up naked in the London Zoo wolf enclosure. {user} took photos. Lots of photos.',
    '🐺 {user} howls at {target} under the full moon. {target} throws a stick. {user} fetches. It\'s complicated.',
    '🐺 {target} fights werewolf {user} with a silver spoon. It works. Barely. Everyone is surprised.',
  ],
  'killer-clown': [
    '🤡 {user} lures {target} to a storm drain with a red balloon. "We all float down here!" {target} brought a pin.',
    '🤡 {target} is chased by {user}\'s killer clown, who honks a tiny horn the entire time. It\'s worse than the knife.',
    '🤡 {user} sends a clown car after {target}. Forty-seven clowns climb out. {target} runs. Forty-seven clowns follow.',
    '🤡 {target} laughs at {user}\'s killer clown. The clown cries. Now {target} feels terrible.',
    '🤡 {user} gives {target} a balloon animal. It\'s a werewolf. It bites.',
    '🤡 {target} is Pennywised by {user}, but the Losers Club shows up and bullies the clown into retirement.',
  ],
  necronomicon: [
    '📖 {user} hands {target} the Necronomicon and says "read this out loud." {target} does. The trees get grabby.',
    '📖 {target} reads the Necronomicon to {user}: "Klaatu barada… nec… necktie?" The dead rise. Deeply annoyed.',
    '📖 {user} summons a deadite to get {target}, but {target} has a chainsaw for a hand now. Hail to the king, baby.',
    '📖 {target} borrows the Necronomicon from {user} and returns it overdue. The library sends the Evil Dead.',
    '📖 {user} opens the Book of the Dead at {target}\'s birthday party. The cake is possessed. It\'s delicious anyway.',
    '📖 {target} swallows {user}\'s eyeball, Evil Dead II style. Nobody asked how. Nobody wants to know.',
  ],
  ouija: [
    '🔮 {user} asks the Ouija board about {target}. The planchette spells "R-U-N." {target} runs.',
    '🔮 {target} accuses {user} of moving the planchette. {user} lifts both hands. It keeps moving.',
    '🔮 {user} contacts the spirit of {target}\'s great-grandmother. She just wants to know why {target} never calls.',
    '🔮 The Ouija board tells {target} that {user} is the one who ate their leftovers. The ghost was right.',
    '🔮 {user} forgets to say goodbye to the Ouija board. Now a ghost follows {target} around, asking for snacks.',
    '🔮 {target} and {user} summon a demon. The demon spells "L-O-L" and leaves.',
  ],
  'bloody-mary': [
    '🪞 {user} dares {target} to say "Bloody Mary" three times in the mirror. Mary shows up, looks at {target}\'s hair, and leaves.',
    '🪞 {target} says Candyman five times to impress {user}. The bees arrive first. {user} is allergic.',
    '🪞 {user} chants "Bloody Mary" at {target}\'s bathroom mirror. Mary just fixes her makeup and asks to borrow a towel.',
    '🪞 {target} breaks {user}\'s haunted mirror. Seven years of bad luck and one very angry reflection.',
    '🪞 {user} hides behind {target} in the mirror. {target} turns around. Nobody\'s there. The mirror waves.',
    '🪞 {target}\'s reflection stops copying them and starts copying {user}. Both of them are deeply uncomfortable.',
  ],
};

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

  const trope = interaction.options.getString('trope') || TROPES[Math.floor(Math.random() * TROPES.length)].value;
  const config = await loadGuildConfig(interaction.guildId);
  const lines = [...(getDoomLines(config)[trope] || []), ...(DEFAULT_DOOM_LINES[trope] || [])];
  const line = lines[Math.floor(Math.random() * lines.length)];

  await interaction.reply({
    content: line
      .replace(/{user}/g, `<@${interaction.user.id}>`)
      .replace(/{target}/g, target.mention),
    // Pings the user and a member target; a role or @everyone is shown, not pinged
    allowedMentions: allowedMentionsFor(interaction.user.id, target),
  });
}

async function manageLines(interaction) {
  const sub = interaction.options.getSubcommand();
  const trope = interaction.options.getString('trope');
  const config = await loadGuildConfig(interaction.guildId);
  const all = getDoomLines(config);
  const custom = all[trope] || [];
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
    await save([...custom, line]);
    await reply(`✅ Added to ${tropeName(trope)}:\n${line}`);
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
    await reply(`🗑️ Removed from ${tropeName(trope)}:\n${removed}`);
    return;
  }

  if (sub === 'reset') {
    await save([]);
    await reply(`✅ ${tropeName(trope)} is back to the built-in lines only.`);
    return;
  }

  // list
  const defaults = DEFAULT_DOOM_LINES[trope] || [];
  const short = (t) => (t.length > 100 ? `${t.slice(0, 100)}…` : t);
  const parts = [`**${tropeName(trope)}**`];
  if (custom.length) {
    parts.push(`\n**This server's lines (${custom.length}):**`, ...custom.map((t, i) => `${i + 1}. ${short(t)}`));
  }
  parts.push(`\n**Built-in lines (${defaults.length}):**`, ...defaults.map(t => `• ${short(t)}`));
  await reply(parts.join('\n').slice(0, 2000));
}

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { loadGuildConfig, saveGuildConfig, isAdmin } from '../utils/guildConfig.js';

// Available potion themes
const POTION_THEMES = {
  horror: { name: 'Horror Movies & TV', emoji: '🎃' },
  comedy: { name: 'Comedy Movies & TV', emoji: '😂' },
  fantasy: { name: 'Fantasy & Magic', emoji: '🧙' },
  scifi: { name: 'Sci-Fi & Futuristic', emoji: '🚀' },
  gaming: { name: 'Video Games', emoji: '🎮' },
  action: { name: 'Action & Superhero', emoji: '💥' },
  classics: { name: '80s & 90s Classics', emoji: '📼' },
  animation: { name: 'Animation & Cartoons', emoji: '🎨' },
  drama: { name: 'Drama & Thriller', emoji: '🎭' },
};

// Default potion responses with pop culture, horror, and comedy references
// Each response has text and themes array
const DEFAULT_POTION_RESPONSES = {
  health: [
    { text: "🧪 {giver} hands {receiver} a suspicious red liquid. 'This... is my BOOMSTICK of healing!' 💚 +50 HP (Army of Darkness approved)", themes: ['horror', 'comedy', 'classics'] },
    { text: "🍯 {giver} gives {receiver} a flask of miruvor. The elvish cordial burns with an inner fire! 💚 +75 HP (Elrond's recipe)", themes: ['fantasy'] },
    { text: "🧃 {giver} tosses {receiver} an Estus Flask. 'Praise the sun!' 💚 +100 HP (Don't you dare go hollow)", themes: ['gaming'] },
    { text: "🥤 {giver} slides {receiver} a Nuka-Cola Quantum. It glows ominously... 💚 +60 HP (What could go wrong?)", themes: ['gaming', 'scifi'] },
    { text: "🍺 {giver} gives {receiver} a pint at the Winchester. 'Wait for all this to blow over.' 💚 +40 HP (Shaun of the Dead)", themes: ['horror', 'comedy'] },
    { text: "💊 {giver} hands {receiver} the blue pill. 'Welcome back to the real world.' 💚 +80 HP (The Matrix)", themes: ['scifi', 'action', 'classics'] },
    { text: "🏪 {giver} gives {receiver} a potion found in an empty mall. 'The whole place is ours!' 💚 +90 HP (Night of the Comet survivor)", themes: ['scifi', 'horror', 'classics'] },
  ],
  mana: [
    { text: "✨ {giver} gives {receiver} a shimmering blue potion. 'Fly, you fools!' 💙 +100 MP (Gandalf's backup stash)", themes: ['fantasy'] },
    { text: "🌟 {giver} hands {receiver} an Everything Bagel. Suddenly, everything makes sense... and also doesn't. 💙 +∞ MP (EEAAO)", themes: ['scifi', 'comedy', 'drama'] },
    { text: "🔮 {giver} slides {receiver} a glowing purple drink. 'I put a spell on you!' 💙 +75 MP (Hocus Pocus certified)", themes: ['fantasy', 'comedy', 'horror'] },
    { text: "🧙 {giver} gives {receiver} Felix Felicis. 'Liquid luck, my friend.' 💙 +50 MP (Slughorn's finest)", themes: ['fantasy'] },
    { text: "🌙 {giver} hands {receiver} a Witch's Brew. 'Double, double toil and trouble!' 💙 +90 MP (Macbeth style)", themes: ['fantasy', 'drama'] },
    { text: "⚗️ {giver} gives {receiver} a Cat potion. 'Toss a coin to your Witcher!' 💙 +85 MP (White Wolf approved)", themes: ['fantasy', 'gaming'] },
  ],
  strength: [
    { text: "💪 {giver} gives {receiver} a vial of Red Bull. They grow wings... and also muscles? 🔴 +50 STR", themes: ['comedy'] },
    { text: "🍺 {giver} hands {receiver} Butterbeer (spiked edition). 'FOR THE GREATER GOOD!' 🔴 +60 STR (Hot Fuzz energy)", themes: ['comedy', 'action'] },
    { text: "🥩 {giver} tosses {receiver} some Fight Milk. 'CAW!' 🔴 +75 STR (For bodyguards, by bodyguards)", themes: ['comedy'] },
    { text: "💉 {giver} gives {receiver} Captain America's super soldier serum. 'I can do this all day.' 🔴 +100 STR", themes: ['action'] },
    { text: "🍖 {giver} hands {receiver} a Krabby Patty with jellyfish jelly. UNLIMITED POWER! 🔴 +85 STR", themes: ['animation'] },
    { text: "🥤 {giver} gives {receiver} Popeye's spinach. *Toot toot!* 🔴 +70 STR", themes: ['animation', 'classics'] },
    { text: "🔫 {giver} hands {receiver} a military-grade potion. 'Daddy would have gotten us Uzis.' 🔴 +95 STR (Night of the Comet)", themes: ['scifi', 'horror', 'classics'] },
  ],
  speed: [
    { text: "⚡ {giver} gives {receiver} a Speed Potion. They become a blur! 💨 +100 SPD (Gotta go fast!)", themes: ['gaming'] },
    { text: "☕ {giver} hands {receiver} a vial of pure espresso. They can now see time in slow motion. 💨 +80 SPD", themes: ['comedy'] },
    { text: "🏃 {giver} gives {receiver} Dash's energy drink. 'That was totally wicked!' 💨 +90 SPD (Incredibles)", themes: ['animation', 'action'] },
    { text: "⚡ {giver} tosses {receiver} a lightning bolt. 'Run, Barry, run!' 💨 +95 SPD (The Flash)", themes: ['action', 'scifi'] },
    { text: "🌪️ {giver} gives {receiver} Sonic's chili dog... wait, that's not right. 💨 +75 SPD (Gotta go fast anyway)", themes: ['gaming'] },
    { text: "💨 {giver} hands {receiver} Road Runner's secret formula. *MEEP MEEP* 💨 +85 SPD", themes: ['animation', 'classics'] },
  ],
  invisibility: [
    { text: "👻 {giver} hands {receiver} an Invisibility Cloak. 'Mischief managed!' 👁️ Stealth +100 (Marauder's approved)", themes: ['fantasy'] },
    { text: "🫥 {giver} gives {receiver} a vial of Nothing. They drink it and become... nothing. 👁️ Stealth +80 (The Invisible Man)", themes: ['horror', 'scifi', 'classics'] },
    { text: "🌑 {giver} slides {receiver} a shadow potion. They become one with the darkness. 👁️ Stealth +90 (Literally Get Out)", themes: ['horror', 'drama'] },
    { text: "🦇 {giver} hands {receiver} Dracula's mist form potion. 'Bleh bleh bleh!' 👁️ Stealth +85 (Hotel Transylvania)", themes: ['animation', 'comedy', 'horror'] },
    { text: "👤 {giver} gives {receiver} a potion that smells like the Sunken Place. They disappear from perception... 👁️ Stealth +95", themes: ['horror', 'drama'] },
    { text: "🎭 {giver} hands {receiver} a Predator cloaking device in potion form. *clicking sounds* 👁️ Stealth +100", themes: ['scifi', 'action', 'horror'] },
  ],
  luck: [
    { text: "🍀 {giver} gives {receiver} Felix Felicis. Everything just... works out. 🎲 LUCK +100 (Harry Potter)", themes: ['fantasy'] },
    { text: "🎰 {giver} hands {receiver} a four-leaf clover smoothie. The universe smiles upon them. 🎲 LUCK +80", themes: ['fantasy'] },
    { text: "🌟 {giver} gives {receiver} an ancient talisman in liquid form. 'May the Force be with you.' 🎲 LUCK +90", themes: ['scifi', 'action', 'classics'] },
    { text: "🎲 {giver} slides {receiver} D&D dice liquified. They just rolled a nat 20 on luck! 🎲 LUCK +95", themes: ['gaming', 'fantasy'] },
    { text: "🐰 {giver} hands {receiver} a rabbit's foot potion. 'Feeling lucky, punk?' 🎲 LUCK +85 (Dirty Harry)", themes: ['action', 'classics'] },
    { text: "✨ {giver} gives {receiver} Domino's probability manipulation... in potion form! 🎲 LUCK +100 (Deadpool 2)", themes: ['action', 'comedy'] },
    { text: "☄️ {giver} hands {receiver} an anti-comet serum. They were in the steel basement when it happened. 🎲 LUCK +100 (Night of the Comet survivor)", themes: ['scifi', 'horror', 'classics'] },
  ],
  confusion: [
    { text: "🌀 {giver} gives {receiver} a mystery potion. They suddenly can't remember why they walked into this room. 😵 -50 INT", themes: ['comedy'] },
    { text: "🤪 {giver} hands {receiver} the Somebody's Been Drinking My Kool-Aid potion. Everything is sideways now. 😵 CONFUSED", themes: ['comedy'] },
    { text: "🎪 {giver} gives {receiver} a potion from Willy Wonka's reject pile. Colors taste like sounds! 😵 -60 INT", themes: ['fantasy', 'classics'] },
    { text: "🌈 {giver} slides {receiver} the Midsommar special. They're smiling but also crying but also dancing? 😵 -70 INT", themes: ['horror', 'drama'] },
    { text: "🍄 {giver} hands {receiver} a Mario mushroom that went bad. They're now the size of confusion. 😵 -80 INT", themes: ['gaming'] },
    { text: "📺 {giver} gives {receiver} a TV static potion. Their brain is now buffering... 😵 -75 INT (Poltergeist vibes)", themes: ['horror', 'classics'] },
    { text: "🎮 {giver} hands {receiver} a potion that tastes like the '80s. They can only speak in valley girl. Like, totally! 😵 -65 INT (Night of the Comet)", themes: ['scifi', 'horror', 'comedy', 'classics'] },
  ],
  love: [
    { text: "💖 {giver} gives {receiver} a Love Potion No. 9. Smooth jazz starts playing from nowhere... 💕 CHARM +100", themes: ['classics'] },
    { text: "💘 {giver} hands {receiver} Cupid's arrow in liquid form. 'As you wish.' 💕 +95 CHARM (Princess Bride)", themes: ['fantasy', 'comedy', 'classics'] },
    { text: "🌹 {giver} gives {receiver} the Enchantress's rose essence. 'Tale as old as time...' 💕 +90 CHARM (Beauty and the Beast)", themes: ['fantasy', 'animation'] },
    { text: "💝 {giver} slides {receiver} a potion that smells like their soulmate. Red string appears! 💕 +85 CHARM (Kimi no Na wa)", themes: ['animation', 'fantasy', 'drama'] },
    { text: "💗 {giver} hands {receiver} Eros's special blend. Greek gods are taking notes. 💕 +100 CHARM", themes: ['fantasy'] },
    { text: "💓 {giver} gives {receiver} the Eternal Sunshine formula. Love without the pain! ...Or memory. 💕 +80 CHARM", themes: ['scifi', 'drama'] },
  ],
  poison: [
    { text: "☠️ {giver} 'accidentally' gives {receiver} a bubbling green potion. 'Drink me,' it whispers... 💀 -50 HP (Whoops)", themes: ['fantasy'] },
    { text: "🤢 {giver} hands {receiver} the milk from The Stuff. 'Are you eating it, or is it eating you?' 💀 -60 HP", themes: ['horror', 'classics'] },
    { text: "🧪 {giver} gives {receiver} Joffrey's wine. Should've gone to the wedding... 💀 -75 HP (Game of Thrones)", themes: ['fantasy', 'drama'] },
    { text: "🍷 {giver} slides {receiver} the Bride's special blend. 'My name is Inigo Montoya...' 💀 -80 HP (Revenge served cold)", themes: ['action', 'classics'] },
    { text: "🫖 {giver} hands {receiver} the Get Out tea. 'Sink into the floor...' 💀 -90 HP (Sunken Place Special)", themes: ['horror', 'drama'] },
    { text: "☕ {giver} gives {receiver} the Midsommar May Queen's brew. It's beautiful and terrifying. 💀 -70 HP", themes: ['horror', 'drama'] },
    { text: "🔴 {giver} hands {receiver} a potion that shimmers like red dust. They start to disintegrate... 💀 -95 HP (Night of the Comet)", themes: ['scifi', 'horror', 'classics'] },
  ],
  weakness: [
    { text: "🫠 {giver} gives {receiver} a potion that tastes like regret. Their muscles turn to jelly! 💔 -75 STR (Oof)", themes: ['comedy'] },
    { text: "🦴 {giver} hands {receiver} the Reverse Spinach. Popeye would be so disappointed. 💔 -60 STR", themes: ['animation', 'comedy', 'classics'] },
    { text: "😰 {giver} slides {receiver} Kryptonite smoothie. Superman feels your pain. 💔 -85 STR", themes: ['action'] },
    { text: "🫥 {giver} gives {receiver} the Thanos Snap Protein Shake. Half their gains disappear... 💔 -100 STR (I don't feel so good)", themes: ['action', 'comedy'] },
    { text: "🧻 {giver} hands {receiver} a wet noodle potion. All strength has left the chat. 💔 -70 STR", themes: ['comedy'] },
    { text: "💀 {giver} gives {receiver} the opposite of Fight Milk. Now they're weak as a bird. 💔 -80 STR (Reverse CAW)", themes: ['comedy'] },
    { text: "🧟 {giver} hands {receiver} comet zombie juice. Their eyes cloud over... 💔 -90 STR (Night of the Comet)", themes: ['scifi', 'horror', 'classics'] },
  ],
  curse: [
    { text: "👹 {giver} 'accidentally' gives {receiver} the Cursed Videotape Juice. Seven days... 📼 CURSED (The Ring)", themes: ['horror'] },
    { text: "🎃 {giver} hands {receiver} a potion that smells like ancient evil. 'You're my number one guy!' 👺 CURSED (Child's Play)", themes: ['horror', 'classics'] },
    { text: "😈 {giver} gives {receiver} the Necronomicon elixir. 'Klaatu Barada Nik—cough' 👿 CURSED (Army of Darkness)", themes: ['horror', 'comedy', 'classics'] },
    { text: "🕷️ {giver} slides {receiver} a spider-infused potion. Shelob sends her regards. 👺 CURSED (LOTR)", themes: ['fantasy'] },
    { text: "🪦 {giver} hands {receiver} Pet Sematary soil water. Sometimes dead is better... 👹 CURSED (Stephen King)", themes: ['horror', 'classics'] },
    { text: "🦇 {giver} gives {receiver} the Babadook's bedtime drink. 'You can't get rid of it!' 👿 CURSED", themes: ['horror'] },
    { text: "☄️ {giver} hands {receiver} a potion made from comet tail dust. The sky is orange and everyone's gone... 👹 CURSED (Night of the Comet)", themes: ['scifi', 'horror', 'classics'] },
  ],
  slow: [
    { text: "🐌 {giver} gives {receiver} anti-speed juice. They move like Internet Explorer loading. 🦥 -90 SPD", themes: ['comedy'] },
    { text: "⏰ {giver} hands {receiver} a potion made of molasses and regret. Time to embrace the sloth life! 🦥 -80 SPD", themes: ['comedy'] },
    { text: "🧊 {giver} slides {receiver} the Frozen Elsa Special. 'Let it go... slowly.' 🦥 -85 SPD (But why so slow?)", themes: ['animation', 'comedy'] },
    { text: "🐢 {giver} gives {receiver} the opposite of Sonic. Gotta go... eventually. 🦥 -95 SPD", themes: ['gaming', 'comedy'] },
    { text: "💤 {giver} hands {receiver} Zootopia sloth potion. 'What... do... you... call... a...' 🦥 -100 SPD (Flash Flash Hundred Yard Dash)", themes: ['animation', 'comedy'] },
    { text: "🦕 {giver} gives {receiver} 'Ancient Slowing Draught'. They're stuck in slow-motion Matrix time. 🦥 -75 SPD", themes: ['scifi', 'action'] },
  ],
  energy: [
    { text: "⚡ {giver} hands {receiver} a can of Slurm. 'It's highly addictive!' 🔋 +100 ENERGY (Futurama)", themes: ['animation', 'scifi', 'comedy'] },
    { text: "🥤 {giver} gives {receiver} a Brawndo. 'It's got electrolytes!' 🔋 +85 ENERGY (Idiocracy)", themes: ['scifi', 'comedy'] },
    { text: "☕ {giver} slides {receiver} Dale Cooper's black coffee. 'Damn fine energy boost!' 🔋 +90 ENERGY (Twin Peaks)", themes: ['drama', 'classics'] },
    { text: "🔌 {giver} hands {receiver} pure Potterverse Pepper-Up Potion. Steam comes out of their ears! 🔋 +95 ENERGY", themes: ['fantasy'] },
    { text: "⚡ {giver} gives {receiver} a lightning bolt from Zeus's energy drink line. 🔋 +100 ENERGY (Hercules approved)", themes: ['fantasy', 'animation'] },
    { text: "🌩️ {giver} hands {receiver} Thor's pre-workout. 'Another!' 🔋 +100 ENERGY (Bring me Thanos!)", themes: ['action', 'fantasy'] },
  ],
};

const POTION_TYPES = ['health', 'mana', 'strength', 'speed', 'invisibility', 'luck', 'confusion', 'love', 'poison', 'energy', 'weakness', 'curse', 'slow'];

export const data = new SlashCommandBuilder()
  .setName('potion')
  .setDescription('Give magical potions or manage custom responses')
  .addSubcommand(subcommand =>
    subcommand
      .setName('give')
      .setDescription('Give a magical potion to another user')
      .addUserOption(option =>
        option
          .setName('user')
          .setDescription('The user to give the potion to')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('type')
          .setDescription('Type of potion to give')
          .setRequired(true)
          .addChoices(
            { name: '💚 Health Potion', value: 'health' },
            { name: '💙 Mana Potion', value: 'mana' },
            { name: '🔴 Strength Potion', value: 'strength' },
            { name: '💨 Speed Potion', value: 'speed' },
            { name: '👁️ Invisibility Potion', value: 'invisibility' },
            { name: '🍀 Luck Potion', value: 'luck' },
            { name: '😵 Confusion Potion', value: 'confusion' },
            { name: '💕 Love Potion', value: 'love' },
            { name: '☠️ Poison', value: 'poison' },
            { name: '⚡ Energy Potion', value: 'energy' },
            { name: '💔 Weakness Potion', value: 'weakness' },
            { name: '👹 Curse', value: 'curse' },
            { name: '🦥 Slow Potion', value: 'slow' },
          )
      )
  )
  .addSubcommandGroup(group =>
    group
      .setName('responses')
      .setDescription('Manage custom potion responses (Admin/Mod only)')
      .addSubcommand(subcommand =>
        subcommand
          .setName('add')
          .setDescription('Add a custom potion response')
          .addStringOption(option =>
            option
              .setName('type')
              .setDescription('Potion type to add response to')
              .setRequired(true)
              .addChoices(
                { name: '💚 Health', value: 'health' },
                { name: '💙 Mana', value: 'mana' },
                { name: '🔴 Strength', value: 'strength' },
                { name: '💨 Speed', value: 'speed' },
                { name: '👁️ Invisibility', value: 'invisibility' },
                { name: '🍀 Luck', value: 'luck' },
                { name: '😵 Confusion', value: 'confusion' },
                { name: '💕 Love', value: 'love' },
                { name: '☠️ Poison', value: 'poison' },
                { name: '⚡ Energy', value: 'energy' },
                { name: '💔 Weakness', value: 'weakness' },
                { name: '👹 Curse', value: 'curse' },
                { name: '🦥 Slow', value: 'slow' },
              )
          )
          .addStringOption(option =>
            option
              .setName('response')
              .setDescription('Response text (use {giver} and {receiver} as placeholders)')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('remove')
          .setDescription('Remove a custom potion response')
          .addStringOption(option =>
            option
              .setName('type')
              .setDescription('Potion type')
              .setRequired(true)
              .addChoices(
                { name: '💚 Health', value: 'health' },
                { name: '💙 Mana', value: 'mana' },
                { name: '🔴 Strength', value: 'strength' },
                { name: '💨 Speed', value: 'speed' },
                { name: '👁️ Invisibility', value: 'invisibility' },
                { name: '🍀 Luck', value: 'luck' },
                { name: '😵 Confusion', value: 'confusion' },
                { name: '💕 Love', value: 'love' },
                { name: '☠️ Poison', value: 'poison' },
                { name: '⚡ Energy', value: 'energy' },
                { name: '💔 Weakness', value: 'weakness' },
                { name: '👹 Curse', value: 'curse' },
                { name: '🦥 Slow', value: 'slow' },
              )
          )
          .addIntegerOption(option =>
            option
              .setName('index')
              .setDescription('Response number to remove (use /potion responses list to see)')
              .setRequired(true)
              .setMinValue(1)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('list')
          .setDescription('List all responses for a potion type')
          .addStringOption(option =>
            option
              .setName('type')
              .setDescription('Potion type to list')
              .setRequired(true)
              .addChoices(
                { name: '💚 Health', value: 'health' },
                { name: '💙 Mana', value: 'mana' },
                { name: '🔴 Strength', value: 'strength' },
                { name: '💨 Speed', value: 'speed' },
                { name: '👁️ Invisibility', value: 'invisibility' },
                { name: '🍀 Luck', value: 'luck' },
                { name: '😵 Confusion', value: 'confusion' },
                { name: '💕 Love', value: 'love' },
                { name: '☠️ Poison', value: 'poison' },
                { name: '⚡ Energy', value: 'energy' },
                { name: '💔 Weakness', value: 'weakness' },
                { name: '👹 Curse', value: 'curse' },
                { name: '🦥 Slow', value: 'slow' },
              )
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('reset')
          .setDescription('Reset potion type to default responses')
          .addStringOption(option =>
            option
              .setName('type')
              .setDescription('Potion type to reset')
              .setRequired(true)
              .addChoices(
                { name: '💚 Health', value: 'health' },
                { name: '💙 Mana', value: 'mana' },
                { name: '🔴 Strength', value: 'strength' },
                { name: '💨 Speed', value: 'speed' },
                { name: '👁️ Invisibility', value: 'invisibility' },
                { name: '🍀 Luck', value: 'luck' },
                { name: '😵 Confusion', value: 'confusion' },
                { name: '💕 Love', value: 'love' },
                { name: '☠️ Poison', value: 'poison' },
                { name: '⚡ Energy', value: 'energy' },
                { name: '💔 Weakness', value: 'weakness' },
                { name: '👹 Curse', value: 'curse' },
                { name: '🦥 Slow', value: 'slow' },
              )
          )
      )
  )
  .addSubcommandGroup(group =>
    group
      .setName('theme')
      .setDescription('Manage potion response themes (Admin/Mod only)')
      .addSubcommand(subcommand =>
        subcommand
          .setName('set')
          .setDescription('Set active themes (replaces current themes)')
          .addStringOption(option =>
            option
              .setName('themes')
              .setDescription('Comma-separated theme keys (horror,comedy,fantasy,scifi,gaming,action,classics,animation,drama)')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('add')
          .setDescription('Add a theme to active themes')
          .addStringOption(option =>
            option
              .setName('theme')
              .setDescription('Theme to add')
              .setRequired(true)
              .addChoices(
                ...Object.keys(POTION_THEMES).map(key => ({
                  name: `${POTION_THEMES[key].emoji} ${POTION_THEMES[key].name}`,
                  value: key
                }))
              )
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('remove')
          .setDescription('Remove a theme from active themes')
          .addStringOption(option =>
            option
              .setName('theme')
              .setDescription('Theme to remove')
              .setRequired(true)
              .addChoices(
                ...Object.keys(POTION_THEMES).map(key => ({
                  name: `${POTION_THEMES[key].emoji} ${POTION_THEMES[key].name}`,
                  value: key
                }))
              )
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('list')
          .setDescription('List all available themes and active themes')
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('reset')
          .setDescription('Reset to all themes (default)')
      )
  );

/**
 * Get all responses for a potion type (defaults + custom), filtered by active themes
 */
async function getPotionResponses(guildId, potionType) {
  const config = await loadGuildConfig(guildId);
  const customResponses = config.potionResponses?.[potionType] || [];
  const activeThemes = config.potionThemes || null; // null = all themes active
  
  // Filter default responses by active themes
  let defaultResponses = DEFAULT_POTION_RESPONSES[potionType] || [];
  if (activeThemes !== null && activeThemes.length > 0 && activeThemes.length < Object.keys(POTION_THEMES).length) {
    // Filter only if themes are actively restricted (not all themes)
    defaultResponses = defaultResponses.filter(response => 
      response.themes && response.themes.some(theme => activeThemes.includes(theme))
    );
  }
  
  // Combine custom and filtered default responses
  // Note: Custom responses are always included regardless of themes
  return [...customResponses.map(text => ({ text, themes: [] })), ...defaultResponses];
}

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const subcommandGroup = interaction.options.getSubcommandGroup();

  // Handle /potion give (available to everyone)
  if (subcommand === 'give') {
    await handleGivePotion(interaction);
    return;
  }

  // All other commands require admin/mod permissions
  if (subcommandGroup === 'responses') {
    // Check permissions
    if (!isAdmin(interaction.member)) {
      await interaction.reply({
        content: '❌ Only administrators and moderators can manage custom potion responses.',
        ephemeral: true,
      });
      return;
    }

    switch (subcommand) {
      case 'add':
        await handleAddResponse(interaction);
        break;
      case 'remove':
        await handleRemoveResponse(interaction);
        break;
      case 'list':
        await handleListResponses(interaction);
        break;
      case 'reset':
        await handleResetResponses(interaction);
        break;
    }
  } else if (subcommandGroup === 'theme') {
    // Check permissions
    if (!isAdmin(interaction.member)) {
      await interaction.reply({
        content: '❌ Only administrators and moderators can manage potion themes.',
        ephemeral: true,
      });
      return;
    }

    switch (subcommand) {
      case 'set':
        await handleSetThemes(interaction);
        break;
      case 'add':
        await handleAddTheme(interaction);
        break;
      case 'remove':
        await handleRemoveTheme(interaction);
        break;
      case 'list':
        await handleListThemes(interaction);
        break;
      case 'reset':
        await handleResetThemes(interaction);
        break;
    }
  }
}

/**
 * Handle /potion give - Give a potion to another user
 */
async function handleGivePotion(interaction) {
  const targetUser = interaction.options.getUser('user');
  const potionType = interaction.options.getString('type');
  const giver = interaction.user;

  // Don't allow giving potions to bots
  if (targetUser.bot) {
    await interaction.reply({
      content: '❌ Bots are immune to potions! They run on ones and zeros, not magic.',
      ephemeral: true,
    });
    return;
  }

  // Get responses for the potion type
  const responses = await getPotionResponses(interaction.guildId, potionType);
  
  if (!responses || responses.length === 0) {
    await interaction.reply({
      content: '❌ No responses configured for this potion type!',
      ephemeral: true,
    });
    return;
  }

  // Pick a random response
  const responseObj = responses[Math.floor(Math.random() * responses.length)];
  const responseText = responseObj.text || responseObj; // Support both object and string formats
  
  // Replace placeholders
  const finalMessage = responseText
    .replace(/{giver}/g, `<@${giver.id}>`)
    .replace(/{receiver}/g, `<@${targetUser.id}>`);

  // Send the potion message publicly
  await interaction.reply({
    content: finalMessage,
    allowedMentions: { users: [giver.id, targetUser.id] },
  });
}

/**
 * Handle /potion responses add - Add a custom response
 */
async function handleAddResponse(interaction) {
  const potionType = interaction.options.getString('type');
  const response = interaction.options.getString('response');

  // Validate placeholders exist
  if (!response.includes('{giver}') || !response.includes('{receiver}')) {
    await interaction.reply({
      content: '❌ Response must include both `{giver}` and `{receiver}` placeholders!',
      ephemeral: true,
    });
    return;
  }

  // Load config and add response
  const config = await loadGuildConfig(interaction.guildId);
  if (!config.potionResponses) {
    config.potionResponses = {};
  }
  if (!config.potionResponses[potionType]) {
    config.potionResponses[potionType] = [];
  }

  config.potionResponses[potionType].push(response);
  await saveGuildConfig(interaction.guildId, config);

  await interaction.reply({
    content: `✅ Added custom ${potionType} potion response!\n\nPreview: ${response.replace('{giver}', '@Giver').replace('{receiver}', '@Receiver')}`,
    ephemeral: true,
  });
}

/**
 * Handle /potion responses remove - Remove a custom response
 */
async function handleRemoveResponse(interaction) {
  const potionType = interaction.options.getString('type');
  const index = interaction.options.getInteger('index');

  const config = await loadGuildConfig(interaction.guildId);
  const customResponses = config.potionResponses?.[potionType] || [];

  if (customResponses.length === 0) {
    await interaction.reply({
      content: `❌ No custom responses for ${potionType} potions to remove.`,
      ephemeral: true,
    });
    return;
  }

  if (index < 1 || index > customResponses.length) {
    await interaction.reply({
      content: `❌ Invalid index. Must be between 1 and ${customResponses.length}.`,
      ephemeral: true,
    });
    return;
  }

  const removed = customResponses.splice(index - 1, 1)[0];
  config.potionResponses[potionType] = customResponses;
  await saveGuildConfig(interaction.guildId, config);

  await interaction.reply({
    content: `✅ Removed custom ${potionType} potion response #${index}:\n\`\`\`${removed}\`\`\``,
    ephemeral: true,
  });
}

/**
 * Handle /potion responses list - List all responses for a type
 */
async function handleListResponses(interaction) {
  const potionType = interaction.options.getString('type');

  const config = await loadGuildConfig(interaction.guildId);
  const customResponses = config.potionResponses?.[potionType] || [];
  const defaultResponses = DEFAULT_POTION_RESPONSES[potionType] || [];

  let message = `**${potionType.charAt(0).toUpperCase() + potionType.slice(1)} Potion Responses**\n\n`;

  if (customResponses.length > 0) {
    message += `**Custom Responses (${customResponses.length}):**\n`;
    customResponses.forEach((resp, index) => {
      const preview = resp.length > 100 ? resp.substring(0, 100) + '...' : resp;
      message += `${index + 1}. ${preview}\n`;
    });
    message += '\n';
  }

  message += `**Default Responses (${defaultResponses.length}):**\n`;
  defaultResponses.slice(0, 3).forEach((resp, index) => {
    const preview = resp.length > 100 ? resp.substring(0, 100) + '...' : resp;
    message += `• ${preview}\n`;
  });
  if (defaultResponses.length > 3) {
    message += `... and ${defaultResponses.length - 3} more\n`;
  }

  message += `\n**Total: ${customResponses.length + defaultResponses.length} responses**`;

  await interaction.reply({
    content: message,
    ephemeral: true,
  });
}

/**
 * Handle /potion responses reset - Reset to default responses
 */
async function handleResetResponses(interaction) {
  const potionType = interaction.options.getString('type');

  const config = await loadGuildConfig(interaction.guildId);
  if (config.potionResponses && config.potionResponses[potionType]) {
    const count = config.potionResponses[potionType].length;
    delete config.potionResponses[potionType];
    await saveGuildConfig(interaction.guildId, config);

    await interaction.reply({
      content: `✅ Reset ${potionType} potions to defaults. Removed ${count} custom response(s).`,
      ephemeral: true,
    });
  } else {
    await interaction.reply({
      content: `ℹ️ ${potionType.charAt(0).toUpperCase() + potionType.slice(1)} potions are already using default responses.`,
      ephemeral: true,
    });
  }
}

/**
 * Handle /potion theme set - Set active themes
 */
async function handleSetThemes(interaction) {
  const themesInput = interaction.options.getString('themes');
  const themeKeys = themesInput.split(',').map(t => t.trim().toLowerCase());
  
  // Validate theme keys
  const validKeys = themeKeys.filter(key => POTION_THEMES[key]);
  const invalidKeys = themeKeys.filter(key => !POTION_THEMES[key]);
  
  if (validKeys.length === 0) {
    await interaction.reply({
      content: `❌ No valid themes provided. Available themes: ${Object.keys(POTION_THEMES).join(', ')}`,
      ephemeral: true,
    });
    return;
  }
  
  const config = await loadGuildConfig(interaction.guildId);
  config.potionThemes = validKeys;
  await saveGuildConfig(interaction.guildId, config);
  
  let message = `✅ Set active potion themes to: ${validKeys.map(key => `${POTION_THEMES[key].emoji} ${POTION_THEMES[key].name}`).join(', ')}`;
  if (invalidKeys.length > 0) {
    message += `\n⚠️ Ignored invalid themes: ${invalidKeys.join(', ')}`;
  }
  
  await interaction.reply({
    content: message,
    ephemeral: true,
  });
}

/**
 * Handle /potion theme add - Add a theme to active themes
 */
async function handleAddTheme(interaction) {
  const theme = interaction.options.getString('theme');
  const config = await loadGuildConfig(interaction.guildId);
  
  const activeThemes = config.potionThemes || Object.keys(POTION_THEMES); // null means all
  
  if (activeThemes.includes(theme)) {
    await interaction.reply({
      content: `ℹ️ ${POTION_THEMES[theme].emoji} ${POTION_THEMES[theme].name} is already active.`,
      ephemeral: true,
    });
    return;
  }
  
  config.potionThemes = [...activeThemes, theme];
  await saveGuildConfig(interaction.guildId, config);
  
  await interaction.reply({
    content: `✅ Added ${POTION_THEMES[theme].emoji} ${POTION_THEMES[theme].name} to active themes.`,
    ephemeral: true,
  });
}

/**
 * Handle /potion theme remove - Remove a theme from active themes
 */
async function handleRemoveTheme(interaction) {
  const theme = interaction.options.getString('theme');
  const config = await loadGuildConfig(interaction.guildId);
  
  const activeThemes = config.potionThemes || Object.keys(POTION_THEMES); // null means all
  
  if (!activeThemes.includes(theme)) {
    await interaction.reply({
      content: `ℹ️ ${POTION_THEMES[theme].emoji} ${POTION_THEMES[theme].name} is not currently active.`,
      ephemeral: true,
    });
    return;
  }
  
  const updatedThemes = activeThemes.filter(t => t !== theme);
  
  if (updatedThemes.length === 0) {
    await interaction.reply({
      content: `❌ Cannot remove all themes. At least one theme must be active. Use \`/potion theme reset\` to restore all themes.`,
      ephemeral: true,
    });
    return;
  }
  
  config.potionThemes = updatedThemes;
  await saveGuildConfig(interaction.guildId, config);
  
  await interaction.reply({
    content: `✅ Removed ${POTION_THEMES[theme].emoji} ${POTION_THEMES[theme].name} from active themes.`,
    ephemeral: true,
  });
}

/**
 * Handle /potion theme list - List all themes and active themes
 */
async function handleListThemes(interaction) {
  const config = await loadGuildConfig(interaction.guildId);
  const activeThemes = config.potionThemes || Object.keys(POTION_THEMES); // null means all
  
  const allThemesText = Object.keys(POTION_THEMES).map(key => {
    const isActive = activeThemes.includes(key);
    return `${isActive ? '✅' : '⬜'} ${POTION_THEMES[key].emoji} **${POTION_THEMES[key].name}** (\`${key}\`)`;
  }).join('\n');
  
  const activeCount = activeThemes.length;
  const totalCount = Object.keys(POTION_THEMES).length;
  const statusText = activeCount === totalCount ? '(All themes active)' : `(${activeCount}/${totalCount} active)`;
  
  await interaction.reply({
    content: `**Potion Response Themes** ${statusText}\n\n${allThemesText}\n\n*Use \`/potion theme set themes:horror,comedy,gaming\` to set specific themes.*\n*Use \`/potion theme add\` or \`/potion theme remove\` for individual changes.*\n*Use \`/potion theme reset\` to enable all themes.*`,
    ephemeral: true,
  });
}

/**
 * Handle /potion theme reset - Reset to all themes
 */
async function handleResetThemes(interaction) {
  const config = await loadGuildConfig(interaction.guildId);
  config.potionThemes = null; // null = all themes
  await saveGuildConfig(interaction.guildId, config);
  
  await interaction.reply({
    content: `✅ Reset potion themes. All ${Object.keys(POTION_THEMES).length} themes are now active!`,
    ephemeral: true,
  });
}

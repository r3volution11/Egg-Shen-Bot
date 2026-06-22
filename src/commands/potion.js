import { SlashCommandBuilder } from 'discord.js';

// Potion responses with pop culture, horror, and comedy references
const POTION_RESPONSES = {
  health: [
    "🧪 {giver} hands {receiver} a suspicious red liquid. 'This... is my BOOMSTICK of healing!' 💚 +50 HP (Army of Darkness approved)",
    "🍯 {giver} gives {receiver} a flask of miruvor. The elvish cordial burns with an inner fire! 💚 +75 HP (Elrond's recipe)",
    "🧃 {giver} tosses {receiver} an Estus Flask. 'Praise the sun!' 💚 +100 HP (Don't you dare go hollow)",
    "🥤 {giver} slides {receiver} a Nuka-Cola Quantum. It glows ominously... 💚 +60 HP (What could go wrong?)",
    "🍺 {giver} gives {receiver} a pint at the Winchester. 'Wait for all this to blow over.' 💚 +40 HP (Shaun of the Dead)",
    "💊 {giver} hands {receiver} the blue pill. 'Welcome back to the real world.' 💚 +80 HP (The Matrix)",
  ],
  mana: [
    "✨ {giver} gives {receiver} a shimmering blue potion. 'Fly, you fools!' 💙 +100 MP (Gandalf's backup stash)",
    "🌟 {giver} hands {receiver} an Everything Bagel. Suddenly, everything makes sense... and also doesn't. 💙 +∞ MP (EEAAO)",
    "🔮 {giver} slides {receiver} a glowing purple drink. 'I put a spell on you!' 💙 +75 MP (Hocus Pocus certified)",
    "🧙 {giver} gives {receiver} Felix Felicis. 'Liquid luck, my friend.' 💙 +50 MP (Slughorn's finest)",
    "🌙 {giver} hands {receiver} a Witch's Brew. 'Double, double toil and trouble!' 💙 +90 MP (Macbeth style)",
    "⚗️ {giver} gives {receiver} a Cat potion. 'Toss a coin to your Witcher!' 💙 +85 MP (White Wolf approved)",
  ],
  strength: [
    "💪 {giver} gives {receiver} a vial of Red Bull. They grow wings... and also muscles? 🔴 +50 STR",
    "🍺 {giver} hands {receiver} Butterbeer (spiked edition). 'FOR THE GREATER GOOD!' 🔴 +60 STR (Hot Fuzz energy)",
    "🥩 {giver} tosses {receiver} some Fight Milk. 'CAW!' 🔴 +75 STR (For bodyguards, by bodyguards)",
    "💉 {giver} gives {receiver} Captain America's super soldier serum. 'I can do this all day.' 🔴 +100 STR",
    "🍖 {giver} hands {receiver} a Krabby Patty with jellyfish jelly. UNLIMITED POWER! 🔴 +85 STR",
    "🥤 {giver} gives {receiver} Popeye's spinach. *Toot toot!* 🔴 +70 STR",
  ],
  speed: [
    "⚡ {giver} gives {receiver} a Speed Potion. They become a blur! 💨 +100 SPD (Gotta go fast!)",
    "☕ {giver} hands {receiver} a vial of pure espresso. They can now see time in slow motion. 💨 +80 SPD",
    "🏃 {giver} gives {receiver} Dash's energy drink. 'That was totally wicked!' 💨 +90 SPD (Incredibles)",
    "⚡ {giver} tosses {receiver} a lightning bolt. 'Run, Barry, run!' 💨 +95 SPD (The Flash)",
    "🌪️ {giver} gives {receiver} Sonic's chili dog... wait, that's not right. 💨 +75 SPD (Gotta go fast anyway)",
    "💨 {giver} hands {receiver} Road Runner's secret formula. *MEEP MEEP* 💨 +85 SPD",
  ],
  invisibility: [
    "👻 {giver} hands {receiver} an Invisibility Cloak. 'Mischief managed!' 👁️ Stealth +100 (Marauder's approved)",
    "🫥 {giver} gives {receiver} a vial of Nothing. They drink it and become... nothing. 👁️ Stealth +80 (The Invisible Man)",
    "🌑 {giver} slides {receiver} a shadow potion. They become one with the darkness. 👁️ Stealth +90 (Literally Get Out)",
    "🦇 {giver} hands {receiver} Dracula's mist form potion. 'Bleh bleh bleh!' 👁️ Stealth +85 (Hotel Transylvania)",
    "👤 {giver} gives {receiver} a potion that smells like the Sunken Place. They disappear from perception... 👁️ Stealth +95",
    "🎭 {giver} hands {receiver} a Predator cloaking device in potion form. *clicking sounds* 👁️ Stealth +100",
  ],
  luck: [
    "🍀 {giver} gives {receiver} Felix Felicis. Everything just... works out. 🎲 LUCK +100 (Harry Potter)",
    "🎰 {giver} hands {receiver} a four-leaf clover smoothie. The universe smiles upon them. 🎲 LUCK +80",
    "🌟 {giver} gives {receiver} an ancient talisman in liquid form. 'May the Force be with you.' 🎲 LUCK +90",
    "🎲 {giver} slides {receiver} D&D dice liquified. They just rolled a nat 20 on luck! 🎲 LUCK +95",
    "🐰 {giver} hands {receiver} a rabbit's foot potion. 'Feeling lucky, punk?' 🎲 LUCK +85 (Dirty Harry)",
    "✨ {giver} gives {receiver} Domino's probability manipulation... in potion form! 🎲 LUCK +100 (Deadpool 2)",
  ],
  confusion: [
    "🌀 {giver} gives {receiver} a mystery potion. They suddenly can't remember why they walked into this room. 😵 -50 INT",
    "🤪 {giver} hands {receiver} the Somebody's Been Drinking My Kool-Aid potion. Everything is sideways now. 😵 CONFUSED",
    "🎪 {giver} gives {receiver} a potion from Willy Wonka's reject pile. Colors taste like sounds! 😵 -60 INT",
    "🌈 {giver} slides {receiver} the Midsommar special. They're smiling but also crying but also dancing? 😵 -70 INT",
    "🍄 {giver} hands {receiver} a Mario mushroom that went bad. They're now the size of confusion. 😵 -80 INT",
    "📺 {giver} gives {receiver} a TV static potion. Their brain is now buffering... 😵 -75 INT (Poltergeist vibes)",
  ],
  love: [
    "💖 {giver} gives {receiver} a Love Potion No. 9. Smooth jazz starts playing from nowhere... 💕 CHARM +100",
    "💘 {giver} hands {receiver} Cupid's arrow in liquid form. 'As you wish.' 💕 +95 CHARM (Princess Bride)",
    "🌹 {giver} gives {receiver} the Enchantress's rose essence. 'Tale as old as time...' 💕 +90 CHARM (Beauty and the Beast)",
    "💝 {giver} slides {receiver} a potion that smells like their soulmate. Red string appears! 💕 +85 CHARM (Kimi no Na wa)",
    "💗 {giver} hands {receiver} Eros's special blend. Greek gods are taking notes. 💕 +100 CHARM",
    "💓 {giver} gives {receiver} the Eternal Sunshine formula. Love without the pain! ...Or memory. 💕 +80 CHARM",
  ],
  poison: [
    "☠️ {giver} 'accidentally' gives {receiver} a bubbling green potion. 'Drink me,' it whispers... 💀 -50 HP (Whoops)",
    "🤢 {giver} hands {receiver} the milk from The Stuff. 'Are you eating it, or is it eating you?' 💀 -60 HP",
    "🧪 {giver} gives {receiver} Joffrey's wine. Should've gone to the wedding... 💀 -75 HP (Game of Thrones)",
    "🍷 {giver} slides {receiver} the Bride's special blend. 'My name is Inigo Montoya...' 💀 -80 HP (Revenge served cold)",
    "🫖 {giver} hands {receiver} the Get Out tea. 'Sink into the floor...' 💀 -90 HP (Sunken Place Special)",
    "☕ {giver} gives {receiver} the Midsommar May Queen's brew. It's beautiful and terrifying. 💀 -70 HP",
  ],
  energy: [
    "⚡ {giver} hands {receiver} a can of Slurm. 'It's highly addictive!' 🔋 +100 ENERGY (Futurama)",
    "🥤 {giver} gives {receiver} a Brawndo. 'It's got electrolytes!' 🔋 +85 ENERGY (Idiocracy)",
    "☕ {giver} slides {receiver} Dale Cooper's black coffee. 'Damn fine energy boost!' 🔋 +90 ENERGY (Twin Peaks)",
    "🔌 {giver} hands {receiver} pure Potterverse Pepper-Up Potion. Steam comes out of their ears! 🔋 +95 ENERGY",
    "⚡ {giver} gives {receiver} a lightning bolt from Zeus's energy drink line. 🔋 +100 ENERGY (Hercules approved)",
    "🌩️ {giver} hands {receiver} Thor's pre-workout. 'Another!' 🔋 +100 ENERGY (Bring me Thanos!)",
  ],
};

export const data = new SlashCommandBuilder()
  .setName('potion')
  .setDescription('Give a magical potion to another user!')
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
        { name: '☠️ Poison (use carefully!)', value: 'poison' },
        { name: '⚡ Energy Potion', value: 'energy' },
      )
  );

export async function execute(interaction) {
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
  const responses = POTION_RESPONSES[potionType];
  
  if (!responses) {
    await interaction.reply({
      content: '❌ Unknown potion type! The universe glitches...',
      ephemeral: true,
    });
    return;
  }

  // Pick a random response
  const response = responses[Math.floor(Math.random() * responses.length)];
  
  // Replace placeholders
  const finalMessage = response
    .replace('{giver}', `<@${giver.id}>`)
    .replace('{receiver}', `<@${targetUser.id}>`);

  // Send the potion message publicly
  await interaction.reply({
    content: finalMessage,
    allowedMentions: { users: [giver.id, targetUser.id] },
  });
}

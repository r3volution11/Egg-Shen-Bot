import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { loadGuildConfig, saveGuildConfig, isAdmin } from '../utils/guildConfig.js';

// Default potion responses with pop culture, horror, and comedy references
const DEFAULT_POTION_RESPONSES = {
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

const POTION_TYPES = ['health', 'mana', 'strength', 'speed', 'invisibility', 'luck', 'confusion', 'love', 'poison', 'energy'];

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
              )
          )
      )
  );

/**
 * Get all responses for a potion type (defaults + custom)
 */
async function getPotionResponses(guildId, potionType) {
  const config = await loadGuildConfig(guildId);
  const customResponses = config.potionResponses?.[potionType] || [];
  const defaultResponses = DEFAULT_POTION_RESPONSES[potionType] || [];
  
  // Combine custom and default responses
  return [...customResponses, ...defaultResponses];
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
  const response = responses[Math.floor(Math.random() * responses.length)];
  
  // Replace placeholders
  const finalMessage = response
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

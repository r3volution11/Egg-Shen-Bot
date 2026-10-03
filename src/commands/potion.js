import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { loadGuildConfig, saveGuildConfig, isAdmin, canUseCommand } from '../utils/guildConfig.js';
import { resolveSocialTarget } from '../utils/socialTarget.js';
import { beginPlay, finishPlay, tagged, pick } from '../utils/gamePlay.js';
import { POTION_LINES } from '../data/potionLines.js';

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
// Built-in responses, tagged with themes and an outcome (worked / backfired):
// src/data/potionLines.js. /potion is a scored game (src/utils/gameScores.js).
const DEFAULT_POTION_RESPONSES = POTION_LINES;

const POTION_TYPES = ['health', 'mana', 'strength', 'speed', 'invisibility', 'luck', 'confusion', 'love', 'poison', 'energy', 'weakness', 'curse', 'slow'];

export const data = new SlashCommandBuilder()
  .setName('potion')
  .setDescription('Give magical potions or manage custom responses')
  .addSubcommand(subcommand =>
    subcommand
      .setName('give')
      .setDescription('Give a potion to someone, a role, or @everyone')
      // Mentionable, not User: a User option can't pick @everyone or a role.
      // Still named `user` so it reads the same as before.
      .addMentionableOption(option =>
        option
          .setName('user')
          .setDescription('A member, a role, or @everyone')
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
              // Autocomplete, not choices: four copies of the 13-type list
              // were most of this command's size (Discord caps a command at
              // 8000 bytes). See autocomplete() below.
              .setAutocomplete(true)
          )
          .addStringOption(option =>
            option
              .setName('outcome')
              .setDescription('What happens (scores points): it works, or it backfires on the giver')
              .setRequired(true)
              .addChoices({ name: 'Worked', value: 'worked' }, { name: 'Backfired', value: 'backfired' })
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
              // Autocomplete, not choices: four copies of the 13-type list
              // were most of this command's size (Discord caps a command at
              // 8000 bytes). See autocomplete() below.
              .setAutocomplete(true)
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
              // Autocomplete, not choices: four copies of the 13-type list
              // were most of this command's size (Discord caps a command at
              // 8000 bytes). See autocomplete() below.
              .setAutocomplete(true)
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
              // Autocomplete, not choices: four copies of the 13-type list
              // were most of this command's size (Discord caps a command at
              // 8000 bytes). See autocomplete() below.
              .setAutocomplete(true)
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
  return [...tagged(customResponses, 'worked').map(r => ({ themes: [], ...r })), ...defaultResponses];
}

/** Potions that help the receiver; the rest hurt. Decides the points (gameScores.js). */
const HELPFUL = new Set(['health', 'mana', 'strength', 'speed', 'invisibility', 'luck', 'love', 'energy']);
const TYPE_NAMES = {
  health: '💚 Health', mana: '💙 Mana', strength: '🔴 Strength', speed: '💨 Speed', invisibility: '👁️ Invisibility',
  luck: '🍀 Luck', confusion: '😵 Confusion', love: '💕 Love', poison: '☠️ Poison', energy: '⚡ Energy',
  weakness: '💔 Weakness', curse: '👹 Curse', slow: '🦥 Slow',
};

/** `type` suggestions for the responses subcommands */
export async function autocomplete(interaction) {
  const typed = String(interaction.options.getFocused() || '').toLowerCase();
  return interaction.respond(Object.entries(TYPE_NAMES)
    .filter(([value, name]) => !typed || value.includes(typed) || name.toLowerCase().includes(typed))
    .map(([value, name]) => ({ name, value })));
}

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const subcommandGroup = interaction.options.getSubcommandGroup();

  if (!await canUseCommand(interaction.guildId, interaction.member, 'potion')) {
    await interaction.reply({ content: '❌ /potion is turned off on this server.', ephemeral: true });
    return;
  }

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

    if (!TYPE_NAMES[interaction.options.getString('type')]) {
      await interaction.reply({ content: `❌ Pick a potion type from the list: ${Object.keys(TYPE_NAMES).join(', ')}.`, ephemeral: true });
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
  const target = resolveSocialTarget(interaction, 'user');
  const potionType = interaction.options.getString('type');

  // Don't allow giving potions to bots
  if (!target || target.isBot) {
    await interaction.reply({
      content: '❌ Bots are immune to potions! They run on ones and zeros, not magic.',
      ephemeral: true,
    });
    return;
  }

  const started = await beginPlay(interaction, 'potion');
  if (!started) return;

  const response = pick(await getPotionResponses(interaction.guildId, potionType));
  const text = response.text
    .replace(/{giver}/g, `<@${interaction.user.id}>`)
    .replace(/{receiver}/g, target.mention);

  await finishPlay(interaction, {
    game: 'potion',
    target,
    text,
    outcome: response.outcome || 'worked',
    effect: HELPFUL.has(potionType) ? 'helpful' : 'harmful',
    settings: started.settings,
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

  config.potionResponses[potionType].push({ text: response, outcome: interaction.options.getString('outcome') || 'worked' });
  await saveGuildConfig(interaction.guildId, config);

  await interaction.reply({
    content: `✅ Added custom ${potionType} potion response (${interaction.options.getString('outcome') || 'worked'})!\n\nPreview: ${response.replace('{giver}', '@Giver').replace('{receiver}', '@Receiver')}`,
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
    content: `✅ Removed custom ${potionType} potion response #${index}:\n\`\`\`${removed.text ?? removed}\`\`\``,
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
    tagged(customResponses, 'worked').forEach((resp, index) => {
      const preview = resp.text.length > 100 ? resp.text.substring(0, 100) + '...' : resp.text;
      message += `${index + 1}. [${resp.outcome}] ${preview}\n`;
    });
    message += '\n';
  }

  message += `**Default Responses (${defaultResponses.length}):**\n`;
  defaultResponses.slice(0, 3).forEach((resp) => {
    // Defaults are { text, themes }; reading them as strings listed "[object Object]"
    const text = resp.text ?? resp;
    const preview = text.length > 100 ? text.substring(0, 100) + '...' : text;
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

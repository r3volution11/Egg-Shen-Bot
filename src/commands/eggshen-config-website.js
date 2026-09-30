import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { loadGuildConfig, saveGuildConfig, isAdmin, getPublicBotUrl } from '../utils/guildConfig.js';
import { listThemeNames, isValidTheme } from '../utils/webThemes.js';

export const data = new SlashCommandBuilder()
  .setName('eggshen-config-website')
  .setDescription('Configure this server\'s web presence (Admin/Moderator only)')
  .addSubcommand(subcommand =>
    subcommand
      .setName('view')
      .setDescription('View this server\'s website configuration')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('url')
      .setDescription('Set the URL where this server\'s website (event-request form, etc.) is hosted')
      .addStringOption(option =>
        option
          .setName('url')
          .setDescription('Website URL (e.g., https://yourdomain.com)')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('bot-url')
      .setDescription('Set the address the bot uses in links it posts here (setup form, crop, quotes admin)')
      .addStringOption(option =>
        option
          .setName('url')
          .setDescription('e.g. https://yourdomain.com — leave empty to use the bot\'s PUBLIC_BOT_URL')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('theme')
      .setDescription('Set the named color theme used by this server\'s website, crop links, and quotes-admin links')
      .addStringOption(option =>
        option
          .setName('name')
          .setDescription('Theme name from scripts/web-themes.json (e.g. "default")')
          .setRequired(true)
      )
  );

export async function execute(interaction) {
  if (!isAdmin(interaction.member)) {
    await interaction.reply({
      content: '❌ You need Administrator, Manage Server, or Moderator permissions to use this command.',
      ephemeral: true,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  if (subcommand === 'view') {
    const config = await loadGuildConfig(guildId);
    const websiteConfig = config.website || {};

    const embed = new EmbedBuilder()
      .setColor(0x4EC5ED)
      .setTitle('🌐 Website Configuration')
      .addFields(
        {
          name: 'Website URL',
          value: websiteConfig.url || 'Not set',
          inline: false
        },
        {
          name: 'Bot URL (links the bot posts)',
          value: websiteConfig.botUrl
            || (process.env.PUBLIC_BOT_URL ? `${process.env.PUBLIC_BOT_URL} (the bot's default)` : 'Not set'),
          inline: false
        },
        {
          name: 'Theme',
          value: websiteConfig.theme || 'default',
          inline: true
        }
      );

    await interaction.reply({ embeds: [embed], ephemeral: true });

  } else if (subcommand === 'url') {
    const url = interaction.options.getString('url');
    const config = await loadGuildConfig(guildId);

    if (!config.website) {
      config.website = {};
    }

    config.website.url = url;
    await saveGuildConfig(guildId, config);

    await interaction.reply({
      content: `✅ Website URL set to: ${url}\n\n⚠️ **Important:** this server's web deployment needs \`GUILD_ID: '${guildId}'\` in its \`config.js\` — either \`public/config.js\` (copied from \`public/config.example.js\`) for a single-domain setup, or, if you're using \`scripts/domains.json\`/\`deploy-domain-copy.js\` for multiple domains, the matching entry there (regenerate with \`npm run deploy:domain\` after any change).`,
      ephemeral: true
    });

  } else if (subcommand === 'bot-url') {
    await handleBotUrl(interaction, guildId);

  } else if (subcommand === 'theme') {
    const name = interaction.options.getString('name');

    if (!isValidTheme(name)) {
      await interaction.reply({
        content: `❌ "${name}" isn't a known theme. Available themes: ${listThemeNames().map(n => `\`${n}\``).join(', ')} (defined in \`scripts/web-themes.json\`).`,
        ephemeral: true
      });
      return;
    }

    const config = await loadGuildConfig(guildId);
    if (!config.website) {
      config.website = {};
    }

    config.website.theme = name;
    await saveGuildConfig(guildId, config);

    await interaction.reply({
      content: `✅ Website theme set to \`${name}\`. This applies to this server's website, moderator crop links, and quotes-admin links.`,
      ephemeral: true
    });
  }
}

/**
 * Check an address reaches THIS bot: its health check must name this bot,
 * and the setup form's path must be forwarded to it rather than served by
 * the website. A missing proxy route otherwise shows up later as a link that
 * quietly opens the event-request page instead.
 */
async function checkBotUrl(origin, botTag) {
  const get = async (path) => {
    try {
      return await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(5000), redirect: 'manual' });
    } catch {
      return null;
    }
  };

  const health = await get('/api/health');
  const healthBody = health?.ok ? await health.json().catch(() => null) : null;
  if (!healthBody) return `couldn't reach \`${origin}/api/health\``;
  if (botTag && healthBody.bot !== botTag) return `\`${origin}\` answers as ${healthBody.bot || 'something else'}, not this bot`;

  // The bot refuses a bad token with 403 text; a website fallback returns 200 HTML
  const setup = await get('/tournament-setup?token=check');
  if (!setup || setup.status !== 403) {
    return `\`${origin}/tournament-setup\` isn't forwarded to the bot, so setup links would open the website instead`;
  }
  return null;
}

async function handleBotUrl(interaction, guildId) {
  const input = interaction.options.getString('url');
  const config = await loadGuildConfig(guildId);
  if (!config.website) config.website = {};

  if (!input) {
    delete config.website.botUrl;
    await saveGuildConfig(guildId, config);
    const fallback = getPublicBotUrl(config);
    await interaction.reply({
      content: fallback
        ? `✅ Links posted here now use the bot's default address: ${fallback}`
        : '✅ Cleared. The bot has no `PUBLIC_BOT_URL` either, so links it posts here won\'t work until one is set.',
      ephemeral: true,
    });
    return;
  }

  let origin;
  try {
    const parsed = new URL(input);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('protocol');
    origin = parsed.origin;
  } catch {
    await interaction.reply({ content: `❌ \`${input}\` isn't a web address. Use something like \`https://yourdomain.com\`.`, ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  config.website.botUrl = origin;
  await saveGuildConfig(guildId, config);

  const problem = await checkBotUrl(origin, interaction.client?.user?.tag);
  await interaction.editReply(problem
    ? `⚠️ Saved ${origin}, but ${problem}. Links will point there anyway — fix the address or your reverse proxy, then run this again to re-check.`
    : `✅ Links the bot posts in this server (tournament setup, crop, quotes admin) now use ${origin}. Checked: it reaches this bot, and the setup form's path is forwarded.`);
}

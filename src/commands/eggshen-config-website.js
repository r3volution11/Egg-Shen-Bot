import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { loadGuildConfig, saveGuildConfig, isAdmin } from '../utils/guildConfig.js';
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

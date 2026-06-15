import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { loadGuildConfig, saveGuildConfig, toggleService, setEmoji, isAdmin } from '../utils/guildConfig.js';

export const data = new SlashCommandBuilder()
  .setName('eggshen-config')
  .setDescription('Configure Egg Shen settings for this server (Admin only)')
  .addSubcommand(subcommand =>
    subcommand
      .setName('view')
      .setDescription('View current configuration')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('toggle')
      .setDescription('Toggle a service on or off')
      .addStringOption(option =>
        option
          .setName('service')
          .setDescription('The service to toggle')
          .setRequired(true)
          .addChoices(
            { name: 'IMDb', value: 'imdb' },
            { name: 'Letterboxd', value: 'letterboxd' },
            { name: 'Trakt', value: 'trakt' },
            { name: 'Rotten Tomatoes', value: 'rottenTomatoes' },
            { name: 'JustWatch', value: 'justWatch' }
          )
      )
      .addBooleanOption(option =>
        option
          .setName('enabled')
          .setDescription('Enable or disable the service')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('emoji')
      .setDescription('Set a custom emoji for a service')
      .addStringOption(option =>
        option
          .setName('service')
          .setDescription('The service to set an emoji for')
          .setRequired(true)
          .addChoices(
            { name: 'IMDb', value: 'imdb' },
            { name: 'Letterboxd', value: 'letterboxd' },
            { name: 'Trakt', value: 'trakt' },
            { name: 'RT Critics', value: 'rtCritics' },
            { name: 'JustWatch', value: 'justWatch' }
          )
      )
      .addStringOption(option =>
        option
          .setName('emoji')
          .setDescription('The emoji to use (custom emoji or leave empty to clear)')
          .setRequired(false)
      )
  );

export async function execute(interaction) {
  // Check if user has admin permissions
  if (!isAdmin(interaction.member)) {
    await interaction.reply({
      content: '❌ You need "Manage Server" or "Administrator" permission to use this command.',
      ephemeral: true,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  if (subcommand === 'view') {
    // Show current configuration
    const config = await loadGuildConfig(guildId);
    
    const servicesStatus = Object.entries(config.services)
      .map(([service, enabled]) => {
        const emoji = enabled ? '✅' : '❌';
        const serviceName = {
          imdb: 'IMDb',
          letterboxd: 'Letterboxd',
          trakt: 'Trakt',
          rottenTomatoes: 'Rotten Tomatoes',
          justWatch: 'JustWatch',
        }[service];
        return `${emoji} **${serviceName}**`;
      })
      .join('\n');

    const emojisStatus = Object.entries(config.emojis)
      .map(([service, emojiId]) => {
        const serviceName = {
          imdb: 'IMDb',
          letterboxd: 'Letterboxd',
          trakt: 'Trakt',
          rtCritics: 'RT Critics',
          justWatch: 'JustWatch',
        }[service];
        const emojiDisplay = emojiId ? `${emojiId} (set)` : '(not set)';
        return `**${serviceName}:** ${emojiDisplay}`;
      })
      .join('\n');

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('⚙️ Egg Shen Configuration')
      .setDescription('Current settings for this server:')
      .addFields({
        name: 'Rating Services',
        value: servicesStatus,
        inline: false,
      })
      .addFields({
        name: 'Custom Emojis',
        value: emojisStatus,
        inline: false,
      })
      .addFields({
        name: 'How to Configure',
        value: '**Toggle services:** `/eggshen-config toggle service:<service> enabled:<true/false>`\n**Set emoji:** `/eggshen-config emoji service:<service> emoji:<emoji>`\n**Clear emoji:** `/eggshen-config emoji service:<service>` (leave emoji blank)',
        inline: false,
      })
      .setFooter({ text: 'Only users with Manage Server or Administrator permission can configure Egg Shen' });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } else if (subcommand === 'toggle') {
    // Toggle a service
    const serviceName = interaction.options.getString('service');
    const enabled = interaction.options.getBoolean('enabled');

    const success = await toggleService(guildId, serviceName, enabled);

    if (success) {
      const serviceDisplayName = {
        imdb: 'IMDb',
        letterboxd: 'Letterboxd',
        trakt: 'Trakt',
        rottenTomatoes: 'Rotten Tomatoes',
        justWatch: 'JustWatch',
      }[serviceName];

      const statusText = enabled ? 'enabled' : 'disabled';
      const emoji = enabled ? '✅' : '❌';

      await interaction.reply({
        content: `${emoji} **${serviceDisplayName}** has been ${statusText} for this server.`,
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: '❌ Failed to update configuration. Please try again.',
        ephemeral: true,
      });
    }
  } else if (subcommand === 'emoji') {
    // Set or clear emoji for a service
    const serviceName = interaction.options.getString('service');
    const emojiInput = interaction.options.getString('emoji') || '';

    const success = await setEmoji(guildId, serviceName, emojiInput);

    if (success) {
      const serviceDisplayName = {
        imdb: 'IMDb',
        letterboxd: 'Letterboxd',
        trakt: 'Trakt',
        rtCritics: 'RT Critics',
        justWatch: 'JustWatch',
      }[serviceName];

      if (emojiInput) {
        await interaction.reply({
          content: `✅ Emoji for **${serviceDisplayName}** has been set to ${emojiInput}`,
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: `✅ Emoji for **${serviceDisplayName}** has been cleared.`,
          ephemeral: true,
        });
      }
    } else {
      await interaction.reply({
        content: '❌ Failed to update emoji configuration. Please try again.',
        ephemeral: true,
      });
    }
  }
}

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { loadGuildConfig, saveGuildConfig, toggleService, setEmoji, updateStatsTracking, getCommandPermissions, updateCommandPermission, isAdmin } from '../utils/guildConfig.js';
import { clearStats } from '../utils/statsTracker.js';

export const data = new SlashCommandBuilder()
  .setName('eggshen-config')
  .setDescription('Configure Egg Shen settings for this server (Admin/Moderator only)')
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
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('stats-toggle')
      .setDescription('Toggle statistics tracking on or off')
      .addStringOption(option =>
        option
          .setName('setting')
          .setDescription('What to toggle')
          .setRequired(true)
          .addChoices(
            { name: 'All Stats Tracking', value: 'enabled' },
            { name: 'Movie Tracking', value: 'trackMovies' },
            { name: 'TV Show Tracking', value: 'trackShows' },
            { name: 'Episode Tracking', value: 'trackEpisodes' }
          )
      )
      .addBooleanOption(option =>
        option
          .setName('enabled')
          .setDescription('Enable or disable this setting')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('stats-clear')
      .setDescription('Clear all statistics for this server')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('commands-toggle')
      .setDescription('Toggle command permissions for regular users')
      .addStringOption(option =>
        option
          .setName('setting')
          .setDescription('What to toggle')
          .setRequired(true)
          .addChoices(
            { name: 'All Commands (Master Switch)', value: 'enabled' },
            { name: 'Movie Command', value: 'movie' },
            { name: 'TV Command', value: 'tv' },
            { name: 'Episode Command', value: 'episode' }
          )
      )
      .addBooleanOption(option =>
        option
          .setName('enabled')
          .setDescription('Enable or disable for regular users')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('notifications-toggle')
      .setDescription('Toggle bot notifications')
      .addStringOption(option =>
        option
          .setName('setting')
          .setDescription('What to toggle')
          .setRequired(true)
          .addChoices(
            { name: 'Restart Announcements', value: 'restartAnnouncements' }
          )
      )
      .addBooleanOption(option =>
        option
          .setName('enabled')
          .setDescription('Enable or disable this notification')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('region')
      .setDescription('Set the region for streaming availability (US, CA, GB, etc.)')
      .addStringOption(option =>
        option
          .setName('code')
          .setDescription('ISO 3166-1 country code (US, CA, GB, AU, etc.)')
          .setRequired(true)
          .setMaxLength(2)
          .setMinLength(2)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('max-results')
      .setDescription('Set maximum number of search results to display (1-10)')
      .addIntegerOption(option =>
        option
          .setName('count')
          .setDescription('Number of results to show in selection menus (1-10)')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(10)
      )
  );

export async function execute(interaction) {
  // Check if user has admin permissions
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

    const statsStatus = `${config.stats.enabled ? '✅' : '❌'} **Overall Tracking:** ${config.stats.enabled ? 'Enabled' : 'Disabled'}\n` +
      `${config.stats.trackMovies ? '✅' : '❌'} **Movies:** ${config.stats.trackMovies ? 'Enabled' : 'Disabled'}\n` +
      `${config.stats.trackShows ? '✅' : '❌'} **TV Shows:** ${config.stats.trackShows ? 'Enabled' : 'Disabled'}\n` +
      `${config.stats.trackEpisodes ? '✅' : '❌'} **Episodes:** ${config.stats.trackEpisodes ? 'Enabled' : 'Disabled'}`;

    const commandsStatus = `${config.commandPermissions.enabled ? '✅' : '❌'} **All Commands:** ${config.commandPermissions.enabled ? 'Enabled' : 'Disabled'}\n` +
      `${config.commandPermissions.movie ? '✅' : '❌'} **/movie:** ${config.commandPermissions.movie ? 'Enabled' : 'Disabled'}\n` +
      `${config.commandPermissions.tv ? '✅' : '❌'} **/tv:** ${config.commandPermissions.tv ? 'Enabled' : 'Disabled'}\n` +
      `${config.commandPermissions.episode ? '✅' : '❌'} **/episode:** ${config.commandPermissions.episode ? 'Enabled' : 'Disabled'}`;

    const notificationsStatus = `${config.notifications?.restartAnnouncements ? '✅' : '❌'} **Restart Announcements:** ${config.notifications?.restartAnnouncements ? 'Enabled' : 'Disabled'}`;

    const regionDisplay = config.region || 'US';
    const maxResultsDisplay = config.maxSearchResults || 8;

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
        name: 'Streaming Region',
        value: `🌍 **${regionDisplay}** (use \`/eggshen-config region code:<XX>\` to change)`,
        inline: false,
      })
      .addFields({
        name: 'Max Search Results',
        value: `🔢 **${maxResultsDisplay}** results (use \`/eggshen-config max-results count:<1-10>\` to change)`,
        inline: false,
      })
      .addFields({
        name: 'Statistics Tracking',
        value: statsStatus,
        inline: false,
      })
      .addFields({
        name: 'Command Permissions (for Regular Users)',
        value: commandsStatus,
        inline: false,
      })
      .addFields({
        name: 'Notifications',
        value: notificationsStatus,
        inline: false,
      })
      .addFields({
        name: 'How to Configure',
        value: '**Toggle services:** `/eggshen-config toggle service:<service> enabled:<true/false>`\n**Set emoji:** `/eggshen-config emoji service:<service> emoji:<emoji>`\n**Set region:** `/eggshen-config region code:<XX>`\n**Set max results:** `/eggshen-config max-results count:<1-10>`\n**Toggle stats:** `/eggshen-config stats-toggle setting:<setting> enabled:<true/false>`\n**Clear stats:** `/eggshen-config stats-clear`\n**Toggle commands:** `/eggshen-config commands-toggle setting:<setting> enabled:<true/false>`\n**Toggle notifications:** `/eggshen-config notifications-toggle setting:<setting> enabled:<true/false>`',
        inline: false,
      })
      .setFooter({ text: 'Only users with Administrator, Manage Server, or Moderator permissions can configure Egg Shen' });

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
  } else if (subcommand === 'stats-toggle') {
    // Toggle statistics tracking
    const setting = interaction.options.getString('setting');
    const enabled = interaction.options.getBoolean('enabled');

    const success = await updateStatsTracking(guildId, setting, enabled);

    if (success) {
      const settingDisplayName = {
        enabled: 'Overall statistics tracking',
        trackMovies: 'Movie tracking',
        trackShows: 'TV show tracking',
        trackEpisodes: 'Episode tracking',
      }[setting];

      const statusText = enabled ? 'enabled' : 'disabled';
      const emoji = enabled ? '✅' : '❌';

      await interaction.reply({
        content: `${emoji} **${settingDisplayName}** has been ${statusText} for this server.`,
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: '❌ Failed to update statistics settings. Please try again.',
        ephemeral: true,
      });
    }
  } else if (subcommand === 'stats-clear') {
    // Clear all statistics
    await interaction.deferReply({ ephemeral: true });

    try {
      await clearStats(guildId);
      await interaction.editReply({
        content: '✅ All statistics have been cleared for this server.',
      });
    } catch (error) {
      console.error('Stats clear error:', error);
      await interaction.editReply({
        content: '❌ Failed to clear statistics. Please try again.',
      });
    }
  } else if (subcommand === 'commands-toggle') {
    // Toggle command permissions
    const setting = interaction.options.getString('setting');
    const enabled = interaction.options.getBoolean('enabled');

    const success = await updateCommandPermission(guildId, setting, enabled);

    if (success) {
      const settingDisplayName = {
        enabled: 'All commands (master switch)',
        movie: '/movie command',
        tv: '/tv command',
        episode: '/episode command',
      }[setting];

      const statusText = enabled ? 'enabled' : 'disabled';
      const emoji = enabled ? '✅' : '❌';

      const note = setting === 'enabled' && !enabled 
        ? '\n\n⚠️ Note: All commands are now disabled for regular users. Only administrators can use the bot.'
        : '';

      await interaction.reply({
        content: `${emoji} **${settingDisplayName}** has been ${statusText} for regular users.${note}`,
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: '❌ Failed to update command permissions. Please try again.',
        ephemeral: true,
      });
    }
  } else if (subcommand === 'notifications-toggle') {
    // Toggle notifications
    const setting = interaction.options.getString('setting');
    const enabled = interaction.options.getBoolean('enabled');

    const config = await loadGuildConfig(guildId);
    
    if (!config.notifications) {
      config.notifications = {};
    }
    
    config.notifications[setting] = enabled;
    await saveGuildConfig(guildId, config);

    const settingDisplayName = {
      restartAnnouncements: 'Restart announcements',
    }[setting];

    const statusText = enabled ? 'enabled' : 'disabled';
    const emoji = enabled ? '✅' : '❌';

    const description = setting === 'restartAnnouncements' 
      ? (enabled 
        ? '\n\nThe bot will now announce in channels when it restarts with active timers.'
        : '\n\nThe bot will silently restore timers without announcements.')
      : '';

    await interaction.reply({
      content: `${emoji} **${settingDisplayName}** have been ${statusText} for this server.${description}`,
      ephemeral: true,
    });
  } else if (subcommand === 'region') {
    // Set streaming region
    const regionCode = interaction.options.getString('code').toUpperCase();
    
    // Validate region code format (2 letters)
    if (!/^[A-Z]{2}$/.test(regionCode)) {
      await interaction.reply({
        content: '❌ Invalid region code. Please use a 2-letter ISO 3166-1 country code (e.g., US, CA, GB, AU).',
        ephemeral: true,
      });
      return;
    }
    
    const config = await loadGuildConfig(guildId);
    config.region = regionCode;
    await saveGuildConfig(guildId, config);

    await interaction.reply({
      content: `✅ Streaming availability region set to **${regionCode}**.\n\nMovie and TV show embeds will now show streaming services available in this region.`,
      ephemeral: true,
    });
  } else if (subcommand === 'max-results') {
    // Set maximum search results
    const count = interaction.options.getInteger('count');
    
    const config = await loadGuildConfig(guildId);
    config.maxSearchResults = count;
    await saveGuildConfig(guildId, config);

    await interaction.reply({
      content: `✅ Maximum search results set to **${count}**.\n\nSearch commands will now display up to ${count} results in selection menus.`,
      ephemeral: true,
    });
  }
}

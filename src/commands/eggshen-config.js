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
      .setDescription('Set maximum number of search results to display (1-50)')
      .addIntegerOption(option =>
        option
          .setName('count')
          .setDescription('Number of results to show in selection menus (1-50)')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(50)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('watch-party-add')
      .setDescription('Add a channel where watch parties occur (for event auto-detection)')
      .addChannelOption(option =>
        option
          .setName('channel')
          .setDescription('The watch party channel to add')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('watch-party-remove')
      .setDescription('Remove a watch party channel from auto-detection')
      .addChannelOption(option =>
        option
          .setName('channel')
          .setDescription('The watch party channel to remove')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('watch-party-list')
      .setDescription('List all configured watch party channels')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('rate-limit-toggle')
      .setDescription('Enable or disable rate limiting')
      .addBooleanOption(option =>
        option
          .setName('enabled')
          .setDescription('Enable or disable rate limiting')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('rate-limit-global')
      .setDescription('Set global rate limit for all commands')
      .addIntegerOption(option =>
        option
          .setName('max-requests')
          .setDescription('Maximum number of requests')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(100)
      )
      .addIntegerOption(option =>
        option
          .setName('window-seconds')
          .setDescription('Time window in seconds')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(3600)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('rate-limit-command')
      .setDescription('Set rate limit for a specific command')
      .addStringOption(option =>
        option
          .setName('command')
          .setDescription('The command to set rate limit for')
          .setRequired(true)
          .addChoices(
            { name: 'movie', value: 'movie' },
            { name: 'tv', value: 'tv' },
            { name: 'episode', value: 'episode' },
            { name: 'episode-list', value: 'episode-list' },
            { name: 'timer', value: 'timer' },
            { name: 'stats', value: 'stats' }
          )
      )
      .addIntegerOption(option =>
        option
          .setName('max-requests')
          .setDescription('Maximum number of requests (0 to remove custom limit)')
          .setRequired(true)
          .setMinValue(0)
          .setMaxValue(100)
      )
      .addIntegerOption(option =>
        option
          .setName('window-seconds')
          .setDescription('Time window in seconds')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(3600)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('rate-limit-bypass')
      .setDescription('Toggle whether moderators bypass rate limits')
      .addBooleanOption(option =>
        option
          .setName('enabled')
          .setDescription('Allow moderators to bypass rate limits')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('rate-limit-clear')
      .setDescription('Clear rate limits for a specific user (admin override)')
      .addUserOption(option =>
        option
          .setName('user')
          .setDescription('The user to clear rate limits for')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('rate-limit-view')
      .setDescription('View current rate limit configuration')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('rate-limit-guild-wide')
      .setDescription('Configure server-wide rate limiting (prevents multi-account flooding)')
      .addBooleanOption(option =>
        option
          .setName('enabled')
          .setDescription('Enable server-wide rate limiting')
          .setRequired(true)
      )
      .addIntegerOption(option =>
        option
          .setName('max-requests')
          .setDescription('Maximum total commands across all users (default: 10)')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(100)
      )
      .addIntegerOption(option =>
        option
          .setName('window-seconds')
          .setDescription('Time window in seconds (default: 60)')
          .setRequired(false)
          .setMinValue(10)
          .setMaxValue(600)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('pattern-detection')
      .setDescription('Configure suspicious activity pattern detection')
      .addBooleanOption(option =>
        option
          .setName('enabled')
          .setDescription('Enable pattern detection')
          .setRequired(true)
      )
      .addIntegerOption(option =>
        option
          .setName('min-users')
          .setDescription('Minimum users needed to flag as suspicious (default: 3)')
          .setRequired(false)
          .setMinValue(2)
          .setMaxValue(20)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('suspicious-activity')
      .setDescription('View recent suspicious activity detected by pattern detection')
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

    const watchPartyChannelsDisplay = config.watchPartyChannels?.length > 0
      ? config.watchPartyChannels.map(channelId => `<#${channelId}>`).join(', ')
      : 'None configured';

    const regionDisplay = config.region || 'US';
    const maxResultsDisplay = config.maxSearchResults || 20;

    // Rate limiting display
    const rateLimitEnabled = config.rateLimits?.enabled ?? true;
    const rateLimitBypass = config.rateLimits?.bypassForModerators ?? true;
    const globalLimit = config.rateLimits?.global || { maxRequests: 1, windowSeconds: 20 };
    const guildWide = config.rateLimits?.guildWide || { enabled: true, maxRequests: 10, windowSeconds: 60 };
    const patternDetection = config.rateLimits?.patternDetection || { enabled: true, windowSeconds: 60, minUsers: 3 };
    
    const rateLimitStatus = `${rateLimitEnabled ? '✅' : '❌'} **Rate Limiting:** ${rateLimitEnabled ? 'Enabled' : 'Disabled'}\n` +
      `${rateLimitBypass ? '✅' : '❌'} **Moderator Bypass:** ${rateLimitBypass ? 'Enabled' : 'Disabled'}\n` +
      `⏱️ **Per-User Limit:** ${globalLimit.maxRequests} per ${globalLimit.windowSeconds}s\n` +
      `${guildWide.enabled ? '✅' : '❌'} **Server-Wide:** ${guildWide.enabled ? `${guildWide.maxRequests} per ${guildWide.windowSeconds}s` : 'Disabled'}\n` +
      `${patternDetection.enabled ? '✅' : '❌'} **Pattern Detection:** ${patternDetection.enabled ? `Flags ${patternDetection.minUsers}+ users` : 'Disabled'}`;
    
    // Show custom command rate limits if any
    const customCommandLimits = config.rateLimits?.commands || {};
    const customLimitsDisplay = Object.keys(customCommandLimits).length > 0
      ? '\n**Custom Limits:**\n' + Object.entries(customCommandLimits)
          .map(([cmd, limit]) => `• \`/${cmd}\`: ${limit.maxRequests} per ${limit.windowSeconds}s`)
          .join('\n')
      : '';


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
        value: `🔢 **${maxResultsDisplay}** results (use \`/eggshen-config max-results count:<1-50>\` to change)`,
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
        name: 'Watch Party Channels',
        value: `🎬 ${watchPartyChannelsDisplay}\n\nTimers in these channels auto-detect titles from scheduled events. Perfect for servers with multiple simultaneous watch parties!`,
        inline: false,
      })
      .addFields({
        name: 'Rate Limiting',
        value: rateLimitStatus + customLimitsDisplay,
        inline: false,
      })
      .addFields({
        name: 'How to Configure',
        value: '**Toggle services:** `/eggshen-config toggle service:<service> enabled:<true/false>`\n**Set emoji:** `/eggshen-config emoji service:<service> emoji:<emoji>`\n**Set region:** `/eggshen-config region code:<XX>`\n**Set max results:** `/eggshen-config max-results count:<1-50>`\n**Toggle stats:** `/eggshen-config stats-toggle setting:<setting> enabled:<true/false>`\n**Clear stats:** `/eggshen-config stats-clear`\n**Toggle commands:** `/eggshen-config commands-toggle setting:<setting> enabled:<true/false>`\n**Toggle notifications:** `/eggshen-config notifications-toggle setting:<setting> enabled:<true/false>`\n**Watch party channels:** `/eggshen-config watch-party-add/remove/list`\n**Rate limits:** `/eggshen-config rate-limit-toggle/global/command/bypass/view`',
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
  } else if (subcommand === 'watch-party-add') {
    // Add a watch party channel
    const channel = interaction.options.getChannel('channel');
    
    const config = await loadGuildConfig(guildId);
    if (!config.watchPartyChannels) {
      config.watchPartyChannels = [];
    }
    
    if (config.watchPartyChannels.includes(channel.id)) {
      await interaction.reply({
        content: `❌ ${channel} is already configured as a watch party channel.`,
        ephemeral: true,
      });
      return;
    }
    
    config.watchPartyChannels.push(channel.id);
    await saveGuildConfig(guildId, config);

    await interaction.reply({
      content: `✅ ${channel} has been added as a watch party channel.\n\nTimers in this channel can now auto-detect titles from scheduled events with this channel as their location. Multiple watch party channels can run simultaneously!`,
      ephemeral: true,
    });
  } else if (subcommand === 'watch-party-remove') {
    // Remove a watch party channel
    const channel = interaction.options.getChannel('channel');
    
    const config = await loadGuildConfig(guildId);
    if (!config.watchPartyChannels || !config.watchPartyChannels.includes(channel.id)) {
      await interaction.reply({
        content: `❌ ${channel} is not configured as a watch party channel.`,
        ephemeral: true,
      });
      return;
    }
    
    config.watchPartyChannels = config.watchPartyChannels.filter(id => id !== channel.id);
    await saveGuildConfig(guildId, config);

    await interaction.reply({
      content: `✅ ${channel} has been removed from watch party channels.`,
      ephemeral: true,
    });
  } else if (subcommand === 'watch-party-list') {
    // List all watch party channels
    const config = await loadGuildConfig(guildId);
    
    if (!config.watchPartyChannels || config.watchPartyChannels.length === 0) {
      await interaction.reply({
        content: '📋 No watch party channels configured.\n\nUse `/eggshen-config watch-party-add channel:<channel>` to add one.',
        ephemeral: true,
      });
      return;
    }
    
    const channelList = config.watchPartyChannels
      .map((channelId, index) => `${index + 1}. <#${channelId}>`)
      .join('\n');
    
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🎬 Watch Party Channels')
      .setDescription('Timers in these channels auto-detect titles from scheduled events. Each channel independently detects its own events, perfect for simultaneous watch parties!')
      .addFields({
        name: 'Configured Channels',
        value: channelList,
        inline: false,
      })
      .setFooter({ text: 'Use /eggshen-config watch-party-add or watch-party-remove to manage channels' });
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } else if (subcommand === 'rate-limit-toggle') {
    // Toggle rate limiting
    const enabled = interaction.options.getBoolean('enabled');
    
    const config = await loadGuildConfig(guildId);
    if (!config.rateLimits) {
      config.rateLimits = {
        enabled: true,
        bypassForModerators: true,
        global: { maxRequests: 1, windowSeconds: 20 },
        commands: {},
      };
    }
    
    config.rateLimits.enabled = enabled;
    await saveGuildConfig(guildId, config);

    const statusText = enabled ? 'enabled' : 'disabled';
    const emoji = enabled ? '✅' : '❌';

    await interaction.reply({
      content: `${emoji} Rate limiting has been **${statusText}** for this server.\n\n${enabled ? 'Users will be limited based on the configured limits.' : 'All users can now use commands without rate limiting.'}`,
      ephemeral: true,
    });
  } else if (subcommand === 'rate-limit-global') {
    // Set global rate limit
    const maxRequests = interaction.options.getInteger('max-requests');
    const windowSeconds = interaction.options.getInteger('window-seconds');
    
    const config = await loadGuildConfig(guildId);
    if (!config.rateLimits) {
      config.rateLimits = {
        enabled: true,
        bypassForModerators: true,
        global: { maxRequests, windowSeconds },
        commands: {},
      };
    } else {
      config.rateLimits.global = { maxRequests, windowSeconds };
    }
    
    await saveGuildConfig(guildId, config);

    await interaction.reply({
      content: `✅ Global rate limit set to **${maxRequests} requests per ${windowSeconds} seconds**.\n\nThis applies to all commands unless they have custom limits.`,
      ephemeral: true,
    });
  } else if (subcommand === 'rate-limit-command') {
    // Set command-specific rate limit
    const command = interaction.options.getString('command');
    const maxRequests = interaction.options.getInteger('max-requests');
    const windowSeconds = interaction.options.getInteger('window-seconds');
    
    const config = await loadGuildConfig(guildId);
    if (!config.rateLimits) {
      config.rateLimits = {
        enabled: true,
        bypassForModerators: true,
        global: { maxRequests: 1, windowSeconds: 20 },
        commands: {},
      };
    }
    if (!config.rateLimits.commands) {
      config.rateLimits.commands = {};
    }
    
    // If maxRequests is 0, remove the custom limit
    if (maxRequests === 0) {
      delete config.rateLimits.commands[command];
      await saveGuildConfig(guildId, config);
      
      await interaction.reply({
        content: `✅ Custom rate limit removed for **/${command}**.\n\nIt will now use the global rate limit.`,
        ephemeral: true,
      });
      return;
    }
    
    // Use global window if not specified
    const finalWindowSeconds = windowSeconds || config.rateLimits.global.windowSeconds;
    
    config.rateLimits.commands[command] = {
      maxRequests,
      windowSeconds: finalWindowSeconds,
    };
    await saveGuildConfig(guildId, config);

    await interaction.reply({
      content: `✅ Rate limit for **/${command}** set to **${maxRequests} requests per ${finalWindowSeconds} seconds**.`,
      ephemeral: true,
    });
  } else if (subcommand === 'rate-limit-bypass') {
    // Toggle moderator bypass
    const enabled = interaction.options.getBoolean('enabled');
    
    const config = await loadGuildConfig(guildId);
    if (!config.rateLimits) {
      config.rateLimits = {
        enabled: true,
        bypassForModerators: enabled,
        global: { maxRequests: 1, windowSeconds: 20 },
        commands: {},
      };
    } else {
      config.rateLimits.bypassForModerators = enabled;
    }
    
    await saveGuildConfig(guildId, config);

    const statusText = enabled ? 'can now' : 'can no longer';
    const emoji = enabled ? '✅' : '❌';

    await interaction.reply({
      content: `${emoji} Moderators and administrators **${statusText}** bypass rate limits.`,
      ephemeral: true,
    });
  } else if (subcommand === 'rate-limit-clear') {
    // Clear rate limits for a specific user
    const user = interaction.options.getUser('user');
    
    const { clearRateLimitForUser } = await import('../utils/rateLimiter.js');
    const cleared = clearRateLimitForUser(guildId, user.id);
    
    if (cleared) {
      await interaction.reply({
        content: `✅ Rate limits cleared for ${user}.\n\nThey can now use commands immediately.`,
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: `ℹ️ ${user} had no active rate limits.`,
        ephemeral: true,
      });
    }
  } else if (subcommand === 'rate-limit-view') {
    // View rate limit configuration
    const config = await loadGuildConfig(guildId);
    
    const rateLimitEnabled = config.rateLimits?.enabled ?? true;
    const rateLimitBypass = config.rateLimits?.bypassForModerators ?? true;
    const globalLimit = config.rateLimits?.global || { maxRequests: 1, windowSeconds: 20 };
    const guildWide = config.rateLimits?.guildWide || { enabled: true, maxRequests: 10, windowSeconds: 60 };
    const patternDetection = config.rateLimits?.patternDetection || { enabled: true, windowSeconds: 60, minUsers: 3 };
    
    let description = `**Status:** ${rateLimitEnabled ? '✅ Enabled' : '❌ Disabled'}\n`;
    description += `**Moderator Bypass:** ${rateLimitBypass ? '✅ Enabled' : '❌ Disabled'}\n\n`;
    description += `**Global Limit (Per User):**\n• ${globalLimit.maxRequests} requests per ${globalLimit.windowSeconds} seconds\n`;
    
    // Show guild-wide limit
    description += `\n**Server-Wide Limit:** ${guildWide.enabled ? '✅ Enabled' : '❌ Disabled'}\n`;
    if (guildWide.enabled) {
      description += `• ${guildWide.maxRequests} total commands per ${guildWide.windowSeconds}s (all users)\n`;
    }
    
    // Show pattern detection
    description += `\n**Pattern Detection:** ${patternDetection.enabled ? '✅ Enabled' : '❌ Disabled'}\n`;
    if (patternDetection.enabled) {
      description += `• Flags suspicious activity from ${patternDetection.minUsers}+ users\n`;
    }
    
    // Show custom command limits if any
    const customCommandLimits = config.rateLimits?.commands || {};
    if (Object.keys(customCommandLimits).length > 0) {
      description += '\n**Custom Command Limits:**\n';
      for (const [cmd, limit] of Object.entries(customCommandLimits)) {
        description += `• \`/${cmd}\`: ${limit.maxRequests} per ${limit.windowSeconds}s\n`;
      }
    }
    
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('⏱️ Rate Limit Configuration')
      .setDescription(description)
      .addFields({
        name: 'Per-User Limits',
        value: '**Enable/disable:** `/eggshen-config rate-limit-toggle`\n' +
               '**Set global limit:** `/eggshen-config rate-limit-global`\n' +
               '**Set command limit:** `/eggshen-config rate-limit-command`\n' +
               '**Toggle moderator bypass:** `/eggshen-config rate-limit-bypass`\n' +
               '**Clear user limits:** `/eggshen-config rate-limit-clear`',
        inline: false,
      })
      .addFields({
        name: 'Anti-Flood Protection',
        value: '**Server-wide limiting:** `/eggshen-config rate-limit-guild-wide`\n' +
               '**Pattern detection:** `/eggshen-config pattern-detection`\n' +
               '**View suspicious activity:** `/eggshen-config suspicious-activity`',
        inline: false,
      })
      .setFooter({ text: 'Rate limits prevent abuse and channel flooding' });
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } else if (subcommand === 'rate-limit-guild-wide') {
    // Configure guild-wide rate limiting
    const enabled = interaction.options.getBoolean('enabled');
    const maxRequests = interaction.options.getInteger('max-requests');
    const windowSeconds = interaction.options.getInteger('window-seconds');
    
    const config = await loadGuildConfig(guildId);
    if (!config.rateLimits) {
      config.rateLimits = {
        enabled: true,
        bypassForModerators: true,
        global: { maxRequests: 1, windowSeconds: 20 },
        commands: {},
        guildWide: { enabled: false, maxRequests: 10, windowSeconds: 60 },
        patternDetection: { enabled: true, windowSeconds: 60, minUsers: 3 },
      };
    }
    
    if (!config.rateLimits.guildWide) {
      config.rateLimits.guildWide = { enabled: false, maxRequests: 10, windowSeconds: 60 };
    }
    
    config.rateLimits.guildWide.enabled = enabled;
    
    if (maxRequests !== null) {
      config.rateLimits.guildWide.maxRequests = maxRequests;
    }
    if (windowSeconds !== null) {
      config.rateLimits.guildWide.windowSeconds = windowSeconds;
    }
    
    await saveGuildConfig(guildId, config);
    
    const statusText = enabled ? 'enabled' : 'disabled';
    const emoji = enabled ? '✅' : '❌';
    const limitInfo = enabled 
      ? `\n\n**Limit:** ${config.rateLimits.guildWide.maxRequests} total commands per ${config.rateLimits.guildWide.windowSeconds} seconds across ALL users.\n\nThis prevents coordinated flooding from multiple accounts.`
      : '\n\nServer-wide rate limiting is now disabled.';
    
    await interaction.reply({
      content: `${emoji} Server-wide rate limiting has been **${statusText}**.${limitInfo}`,
      ephemeral: true,
    });
  } else if (subcommand === 'pattern-detection') {
    // Configure pattern detection
    const enabled = interaction.options.getBoolean('enabled');
    const minUsers = interaction.options.getInteger('min-users');
    
    const config = await loadGuildConfig(guildId);
    if (!config.rateLimits) {
      config.rateLimits = {
        enabled: true,
        bypassForModerators: true,
        global: { maxRequests: 1, windowSeconds: 20 },
        commands: {},
        guildWide: { enabled: true, maxRequests: 10, windowSeconds: 60 },
        patternDetection: { enabled: true, windowSeconds: 60, minUsers: 3 },
      };
    }
    
    if (!config.rateLimits.patternDetection) {
      config.rateLimits.patternDetection = { enabled: true, windowSeconds: 60, minUsers: 3 };
    }
    
    config.rateLimits.patternDetection.enabled = enabled;
    
    if (minUsers !== null) {
      config.rateLimits.patternDetection.minUsers = minUsers;
    }
    
    await saveGuildConfig(guildId, config);
    
    const statusText = enabled ? 'enabled' : 'disabled';
    const emoji = enabled ? '✅' : '❌';
    const description = enabled
      ? `\n\nThe bot will now monitor for suspicious patterns like:\n• Multiple accounts running identical commands\n• Coordinated burst attacks from new accounts\n\nFlags when ${config.rateLimits.patternDetection.minUsers}+ users show suspicious behavior.\n\nUse \`/eggshen-config suspicious-activity\` to view detected patterns.`
      : '\n\nPattern detection is now disabled.';
    
    await interaction.reply({
      content: `${emoji} Suspicious activity pattern detection has been **${statusText}**.${description}`,
      ephemeral: true,
    });
  } else if (subcommand === 'suspicious-activity') {
    // View suspicious activity log
    const { getSuspiciousActivity } = await import('../utils/rateLimiter.js');
    const activities = getSuspiciousActivity(guildId, 10);
    
    if (activities.length === 0) {
      await interaction.reply({
        content: '✅ No suspicious activity detected recently.\n\nPattern detection monitors for coordinated flooding and multi-account abuse.',
        ephemeral: true,
      });
      return;
    }
    
    const embed = new EmbedBuilder()
      .setColor(0xFF6B6B)
      .setTitle('🚨 Suspicious Activity Detected')
      .setDescription(`Found ${activities.length} suspicious pattern${activities.length !== 1 ? 's' : ''} in the last 24 hours:`)
      .setFooter({ text: 'Review these patterns and consider banning users if abuse is confirmed' });
    
    for (const activity of activities) {
      const timeAgo = Math.floor((Date.now() - activity.timestamp) / 60000); // minutes ago
      const timeStr = timeAgo < 60 ? `${timeAgo}m ago` : `${Math.floor(timeAgo / 60)}h ago`;
      
      const patternName = activity.pattern === 'identical_commands' 
        ? '🔁 Identical Commands' 
        : '⚡ Coordinated Burst';
      
      const userList = activity.users.slice(0, 5).map(uid => `<@${uid}>`).join(', ');
      const moreUsers = activity.users.length > 5 ? ` +${activity.users.length - 5} more` : '';
      
      embed.addFields({
        name: `${patternName} • ${timeStr}`,
        value: `${activity.details}\n**Users:** ${userList}${moreUsers}`,
        inline: false,
      });
    }
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

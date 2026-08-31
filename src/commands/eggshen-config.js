import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { loadGuildConfig, saveGuildConfig, toggleService, setEmoji, updateStatsTracking, getCommandPermissions, updateCommandPermission, isAdmin } from '../utils/guildConfig.js';
import { clearStats } from '../utils/statsTracker.js';

export const data = new SlashCommandBuilder()
  .setName('eggshen-config')
  .setDescription('Configure Egg Shen core settings, stats, commands, and notifications (Admin/Moderator only)')
  // ========== SETTINGS GROUP ==========
  .addSubcommandGroup(group =>
    group
      .setName('settings')
      .setDescription('Basic bot settings and configuration')
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
          .setName('max-timer-duration')
          .setDescription('Set the fallback auto-stop duration for timers with no duration set or detected')
          .addIntegerOption(option =>
            option
              .setName('minutes')
              .setDescription('Fallback duration in minutes (e.g. 360 for 6 hours)')
              .setRequired(false)
              .setMinValue(1)
              .setMaxValue(1440)
          )
          .addBooleanOption(option =>
            option
              .setName('unlimited')
              .setDescription('Let timers with no duration run forever instead of using the fallback')
              .setRequired(false)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('timer-ceiling')
          .setDescription('Optionally cap explicit/detected timer durations too (off by default)')
          .addIntegerOption(option =>
            option
              .setName('minutes')
              .setDescription('Ceiling in minutes applied to explicit/detected durations')
              .setRequired(false)
              .setMinValue(1)
              .setMaxValue(1440)
          )
          .addBooleanOption(option =>
            option
              .setName('enabled')
              .setDescription('Turn the ceiling on or off (off by default — timers can be any duration)')
              .setRequired(false)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('timer-control')
          .setDescription('Choose who can pause/resume/stop timers in this server')
          .addBooleanOption(option =>
            option
              .setName('anyone-can-pause-stop')
              .setDescription('Allow any member to pause/resume/stop a timer, not just the starter or admins/mods')
              .setRequired(true)
          )
      )
  )
  // ========== STATS GROUP ==========
  .addSubcommandGroup(group =>
    group
      .setName('stats')
      .setDescription('Statistics tracking configuration')
      .addSubcommand(subcommand =>
        subcommand
          .setName('toggle')
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
          .setName('clear')
          .setDescription('Clear all statistics for this server')
      )
  )
  // ========== COMMANDS GROUP ==========
  .addSubcommandGroup(group =>
    group
      .setName('commands')
      .setDescription('Command permissions configuration')
      .addSubcommand(subcommand =>
        subcommand
          .setName('toggle')
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
                { name: 'Episode Command', value: 'episode' },
                { name: 'Game Command', value: 'game' },
                { name: 'Board Game Command', value: 'boardgame' },
                { name: 'Book Command', value: 'book' },
                { name: 'Survey Command', value: 'survey' },
                { name: 'Soundtrack Command', value: 'soundtrack' },
                { name: 'Bracket Command', value: 'bracket' }
              )
          )
          .addBooleanOption(option =>
            option
              .setName('enabled')
              .setDescription('Enable or disable for regular users')
              .setRequired(true)
          )
      )
  )
  // ========== NOTIFICATIONS GROUP ==========
  .addSubcommandGroup(group =>
    group
      .setName('notifications')
      .setDescription('Bot notification settings')
      .addSubcommand(subcommand =>
        subcommand
          .setName('toggle')
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

  const group = interaction.options.getSubcommandGroup();
  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  // ========== SETTINGS GROUP ==========
  if (group === 'settings' && subcommand === 'view') {
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
      `${config.commandPermissions.episode ? '✅' : '❌'} **/episode:** ${config.commandPermissions.episode ? 'Enabled' : 'Disabled'}\n` +
      `${config.commandPermissions.survey !== false ? '✅' : '❌'} **/survey:** ${config.commandPermissions.survey !== false ? 'Enabled' : 'Disabled'}\n` +
      `${config.commandPermissions.soundtrack !== false ? '✅' : '❌'} **/soundtrack:** ${config.commandPermissions.soundtrack !== false ? 'Enabled' : 'Disabled'}\n` +
      `${config.commandPermissions.bracket !== false ? '✅' : '❌'} **/bracket:** ${config.commandPermissions.bracket !== false ? 'Enabled' : 'Disabled'}`;

    const notificationsStatus = `${config.notifications?.restartAnnouncements ? '✅' : '❌'} **Restart Announcements:** ${config.notifications?.restartAnnouncements ? 'Enabled' : 'Disabled'}`;

    const watchPartyChannelsDisplay = config.watchPartyChannels?.length > 0
      ? config.watchPartyChannels.map(channelId => `<#${channelId}>`).join(', ')
      : 'None configured';

    const regionDisplay = config.region || 'US';
    const maxResultsDisplay = config.maxSearchResults || 20;
    const timerFallbackDisplay = config.maxTimerDurationUnlimited
      ? 'Unlimited (no-duration timers run forever)'
      : `${config.maxTimerDurationMinutes || 360} minutes`;
    const timerCeilingDisplay = config.timerCeilingEnabled && config.timerCeilingMinutes
      ? `${config.timerCeilingMinutes} minutes`
      : 'Off (no maximum)';
    const timerControlDisplay = config.allowAnyonePauseStopTimer
      ? 'Anyone can pause/resume/stop'
      : 'Starter or admin/mod only';

    // Rate limiting display
    const rateLimitEnabled = config.rateLimits?.enabled ?? true;
    const guildWide = config.rateLimits?.guildWide || { enabled: true, maxRequests: 10, windowSeconds: 60 };

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
        value: `🌍 **${regionDisplay}** (use \`/eggshen-config settings region code:<XX>\` to change)`,
        inline: false,
      })
      .addFields({
        name: 'Max Search Results',
        value: `🔢 **${maxResultsDisplay}** results (use \`/eggshen-config settings max-results count:<1-50>\` to change)`,
        inline: false,
      })
      .addFields({
        name: 'Timer Fallback Duration',
        value: `⏱️ **${timerFallbackDisplay}** — used only when no duration was given and none was auto-detected (use \`/eggshen-config settings max-timer-duration minutes:<n>\` or \`unlimited:true\` to change)`,
        inline: false,
      })
      .addFields({
        name: 'Timer Ceiling (explicit/detected durations)',
        value: `⏱️ **${timerCeilingDisplay}** (use \`/eggshen-config settings timer-ceiling minutes:<n> enabled:true\` to change)`,
        inline: false,
      })
      .addFields({
        name: 'Timer Pause/Stop Control',
        value: `⏸️ **${timerControlDisplay}** (use \`/eggshen-config settings timer-control anyone-can-pause-stop:true\` to change)`,
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
        value: `🎬 ${watchPartyChannelsDisplay}\n\nTimers in these channels auto-detect titles from scheduled events. Perfect for servers with multiple simultaneous watch parties! Manage with \`/eggshen-config-watch-party watch-party add/remove/list\`.`,
        inline: false,
      })
      .addFields({
        name: 'Rate Limiting',
        value: `${rateLimitEnabled ? '✅' : '❌'} **Rate Limiting:** ${rateLimitEnabled ? 'Enabled' : 'Disabled'}\n` +
          `${guildWide.enabled ? '✅' : '❌'} **Server-Wide:** ${guildWide.enabled ? `${guildWide.maxRequests} per ${guildWide.windowSeconds}s` : 'Disabled'}\n\n` +
          `See \`/eggshen-config-watch-party rate-limit view\` for full details.`,
        inline: false,
      })
      .addFields({
        name: 'How to Configure',
        value: '**View config:** `/eggshen-config settings view`\n**Toggle services:** `/eggshen-config settings toggle`\n**Set emoji:** `/eggshen-config settings emoji`\n**Set region:** `/eggshen-config settings region`\n**Set max results:** `/eggshen-config settings max-results`\n**Toggle stats:** `/eggshen-config stats toggle`\n**Clear stats:** `/eggshen-config stats clear`\n**Toggle commands:** `/eggshen-config commands toggle`\n**Toggle notifications:** `/eggshen-config notifications toggle`\n**Watch party channels:** `/eggshen-config-watch-party watch-party add/remove/list`\n**Rate limits:** `/eggshen-config-watch-party rate-limit toggle/global/command/view`\n**Moderation:** `/eggshen-config-moderation moderation toggle/whitelist-toggle/user-cooldown`\n**AI images:** `/eggshen-config-ai ai-images view`\n**Event requests:** `/eggshen-config-events event-requests view`',
        inline: false,
      })
      .setFooter({ text: 'Only users with Administrator, Manage Server, or Moderator permissions can configure Egg Shen' });

    await interaction.reply({ embeds: [embed], ephemeral: true });

  // ========== SETTINGS GROUP ==========
  } else if (group === 'settings' && subcommand === 'toggle') {
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
  } else if (group === 'settings' && subcommand === 'emoji') {
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

  // ========== STATS GROUP ==========
  } else if (group === 'stats' && subcommand === 'toggle') {
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
  } else if (group === 'stats' && subcommand === 'clear') {
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

  // ========== COMMANDS GROUP ==========
  } else if (group === 'commands' && subcommand === 'toggle') {
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
        survey: '/survey command',
        soundtrack: '/soundtrack command',
        bracket: '/bracket command',
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

  // ========== NOTIFICATIONS GROUP ==========
  } else if (group === 'notifications' && subcommand === 'toggle') {
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
  } else if (group === 'settings' && subcommand === 'region') {
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
  } else if (group === 'settings' && subcommand === 'max-results') {
    // Set maximum search results
    const count = interaction.options.getInteger('count');

    const config = await loadGuildConfig(guildId);
    config.maxSearchResults = count;
    await saveGuildConfig(guildId, config);

    await interaction.reply({
      content: `✅ Maximum search results set to **${count}**.\n\nSearch commands will now display up to ${count} results in selection menus.`,
      ephemeral: true,
    });
  } else if (group === 'settings' && subcommand === 'max-timer-duration') {
    const minutes = interaction.options.getInteger('minutes');
    const unlimited = interaction.options.getBoolean('unlimited');

    if (minutes === null && unlimited === null) {
      await interaction.reply({
        content: '❌ Provide `minutes`, `unlimited`, or both.',
        ephemeral: true,
      });
      return;
    }

    const config = await loadGuildConfig(guildId);
    if (unlimited !== null) {
      config.maxTimerDurationUnlimited = unlimited;
    }
    if (minutes !== null) {
      config.maxTimerDurationMinutes = minutes;
    }
    await saveGuildConfig(guildId, config);

    const effectiveUnlimited = config.maxTimerDurationUnlimited === true;
    const summary = effectiveUnlimited
      ? 'Timers with no duration set (and nothing auto-detected) will now run forever, like `/timer autostop disable` — same as before this setting existed.'
      : `Timers with no duration set (and nothing auto-detected) will now default to **${config.maxTimerDurationMinutes} minutes** before auto-stopping, with a warning about an hour before. This does **not** affect timers where a duration was typed manually or auto-detected from a movie/TV runtime — those always run for their real length unless this server also enables \`/eggshen-config settings timer-ceiling\`.`;

    await interaction.reply({
      content: `✅ ${summary}`,
      ephemeral: true,
    });
  } else if (group === 'settings' && subcommand === 'timer-ceiling') {
    const minutes = interaction.options.getInteger('minutes');
    const enabled = interaction.options.getBoolean('enabled');

    if (minutes === null && enabled === null) {
      await interaction.reply({
        content: '❌ Provide `minutes`, `enabled`, or both.',
        ephemeral: true,
      });
      return;
    }

    const config = await loadGuildConfig(guildId);
    if (enabled !== null) {
      config.timerCeilingEnabled = enabled;
    }
    if (minutes !== null) {
      config.timerCeilingMinutes = minutes;
    }
    await saveGuildConfig(guildId, config);

    const effectiveEnabled = config.timerCeilingEnabled === true && !!config.timerCeilingMinutes;
    const summary = effectiveEnabled
      ? `Timers on this server are now capped at **${config.timerCeilingMinutes} minutes**, even if a user typed a longer duration or the bot auto-detected a longer runtime.`
      : 'Timers on this server can now be started at any duration — no ceiling is enforced on explicit or auto-detected durations.';

    await interaction.reply({
      content: `✅ ${summary}`,
      ephemeral: true,
    });
  } else if (group === 'settings' && subcommand === 'timer-control') {
    const anyoneCanPauseStop = interaction.options.getBoolean('anyone-can-pause-stop');

    const config = await loadGuildConfig(guildId);
    config.allowAnyonePauseStopTimer = anyoneCanPauseStop;
    await saveGuildConfig(guildId, config);

    const summary = anyoneCanPauseStop
      ? 'Any member can now pause, resume, or stop a timer in this server — not just the person who started it or an admin/mod. Adjusting duration or auto-stop settings still requires the starter or an admin/mod.'
      : 'Only the timer\'s starter or server administrators/moderators can pause, resume, or stop a timer (back to the default).';

    await interaction.reply({
      content: `✅ ${summary}`,
      ephemeral: true,
    });
  }
}

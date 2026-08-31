import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { loadGuildConfig, saveGuildConfig, isAdmin } from '../utils/guildConfig.js';

export const data = new SlashCommandBuilder()
  .setName('eggshen-config-watch-party')
  .setDescription('Configure watch party channels and rate limiting for this server (Admin/Moderator only)')
  // ========== WATCH-PARTY GROUP ==========
  .addSubcommandGroup(group =>
    group
      .setName('watch-party')
      .setDescription('Watch party channel configuration for event auto-detection')
      .addSubcommand(subcommand =>
        subcommand
          .setName('add')
          .setDescription('Add a channel where watch parties occur')
          .addChannelOption(option =>
            option
              .setName('channel')
              .setDescription('The watch party channel to add')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('remove')
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
          .setName('list')
          .setDescription('List all configured watch party channels')
      )
  )
  // ========== RATE-LIMIT GROUP ==========
  .addSubcommandGroup(group =>
    group
      .setName('rate-limit')
      .setDescription('Rate limiting and abuse prevention settings')
      .addSubcommand(subcommand =>
        subcommand
          .setName('toggle')
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
          .setName('global')
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
          .setName('command')
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
          .setName('bypass')
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
          .setName('clear')
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
          .setName('view')
          .setDescription('View current rate limit configuration')
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('guild-wide')
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
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('abuse-log')
          .setDescription('View rate limit violations by user (tracks individual abuse)')
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

  if (group === 'watch-party' && subcommand === 'add') {
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
  } else if (group === 'watch-party' && subcommand === 'remove') {
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
  } else if (group === 'watch-party' && subcommand === 'list') {
    // List all watch party channels
    const config = await loadGuildConfig(guildId);

    if (!config.watchPartyChannels || config.watchPartyChannels.length === 0) {
      await interaction.reply({
        content: '📋 No watch party channels configured.\n\nUse `/eggshen-config-watch-party watch-party add channel:<channel>` to add one.',
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
      .setFooter({ text: 'Use /eggshen-config-watch-party watch-party add or watch-party remove to manage channels' });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } else if (group === 'rate-limit' && subcommand === 'toggle') {
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
  } else if (group === 'rate-limit' && subcommand === 'global') {
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
  } else if (group === 'rate-limit' && subcommand === 'command') {
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
  } else if (group === 'rate-limit' && subcommand === 'bypass') {
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
  } else if (group === 'rate-limit' && subcommand === 'clear') {
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
  } else if (group === 'rate-limit' && subcommand === 'view') {
    // View rate limit configuration
    const config = await loadGuildConfig(guildId);

    const rateLimitEnabled = config.rateLimits?.enabled ?? true;
    const rateLimitBypass = config.rateLimits?.bypassForModerators ?? true;
    const globalLimit = config.rateLimits?.global || { maxRequests: 1, windowSeconds: 20 };
    const guildWide = config.rateLimits?.guildWide || { enabled: true, maxRequests: 10, windowSeconds: 60 };
    const patternDetection = config.rateLimits?.patternDetection || { enabled: true, windowSeconds: 60, minUsers: 3 };
    const moderation = config.moderation || { enabled: false, whitelist: { enabled: false }, autoBan: { enabled: false } };

    let description = `**Rate Limiting:** ${rateLimitEnabled ? '✅ Enabled' : '❌ Disabled'}\n`;
    description += `**Moderation Features:** ${moderation.enabled ? '✅ Enabled' : '❌ Disabled'}\n`;
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

    // Show moderation features
    if (moderation.enabled) {
      description += `\n**Whitelist Mode:** ${moderation.whitelist?.enabled ? '✅ Enabled' : '❌ Disabled'}\n`;
      if (moderation.whitelist?.enabled) {
        const roleCount = moderation.whitelist.allowedRoles?.length || 0;
        const userCount = moderation.whitelist.allowedUsers?.length || 0;
        description += `• ${roleCount} role${roleCount !== 1 ? 's' : ''}, ${userCount} user${userCount !== 1 ? 's' : ''} allowed\n`;
      }

      description += `\n**Auto-Ban Notifications:** ${moderation.autoBan?.enabled ? '✅ Enabled' : '❌ Disabled'}\n`;
      if (moderation.autoBan?.enabled) {
        const count = moderation.autoBan.violationCount || 20;
        const hours = moderation.autoBan.windowHours || 24;
        description += `• Threshold: ${count} violations in ${hours}h\n`;
      }
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
      .setTitle('⏱️ Rate Limit & Moderation Configuration')
      .setDescription(description)
      .addFields({
        name: 'Master Switches',
        value: '**Rate limiting:** `/eggshen-config-watch-party rate-limit toggle`\n' +
               '**Moderation:** `/eggshen-config-moderation moderation toggle`',
        inline: false,
      })
      .addFields({
        name: 'Per-User Limits',
        value: '**Set global limit:** `/eggshen-config-watch-party rate-limit global`\n' +
               '**Set command limit:** `/eggshen-config-watch-party rate-limit command`\n' +
               '**Toggle moderator bypass:** `/eggshen-config-watch-party rate-limit bypass`\n' +
               '**Clear user limits:** `/eggshen-config-watch-party rate-limit clear`',
        inline: false,
      })
      .addFields({
        name: 'Anti-Flood Protection',
        value: '**Server-wide limiting:** `/eggshen-config-watch-party rate-limit guild-wide`\n' +
               '**Pattern detection:** `/eggshen-config-watch-party rate-limit pattern-detection`\n' +
               '**View suspicious activity:** `/eggshen-config-watch-party rate-limit suspicious-activity`\n' +
               '**View abuse log:** `/eggshen-config-watch-party rate-limit abuse-log`',
        inline: false,
      })
      .addFields({
        name: 'Moderation Tools',
        value: '**User cooldowns:** `/eggshen-config-moderation moderation user-cooldown / user-cooldown-remove / user-cooldown-list`\n' +
               '**Whitelist:** `/eggshen-config-moderation moderation whitelist-toggle / whitelist-add-role / whitelist-add-user / whitelist-list`\n' +
               '**Auto-ban:** `/eggshen-config-moderation moderation auto-ban-toggle / auto-ban-threshold / auto-ban-list`',
        inline: false,
      })
      .setFooter({ text: 'Rate limits and moderation tools prevent abuse and channel flooding' });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } else if (group === 'rate-limit' && subcommand === 'guild-wide') {
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
  } else if (group === 'rate-limit' && subcommand === 'pattern-detection') {
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
      ? `\n\nThe bot will now monitor for suspicious patterns like:\n• Multiple accounts running identical commands\n• Coordinated burst attacks from new accounts\n\nFlags when ${config.rateLimits.patternDetection.minUsers}+ users show suspicious behavior.\n\nUse \`/eggshen-config-watch-party rate-limit suspicious-activity\` to view detected patterns.`
      : '\n\nPattern detection is now disabled.';

    await interaction.reply({
      content: `${emoji} Suspicious activity pattern detection has been **${statusText}**.${description}`,
      ephemeral: true,
    });
  } else if (group === 'rate-limit' && subcommand === 'suspicious-activity') {
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
  } else if (group === 'rate-limit' && subcommand === 'abuse-log') {
    // View abuse log
    const { getAbuseLog } = await import('../utils/rateLimiter.js');
    const abuseData = getAbuseLog(guildId);

    if (abuseData.length === 0) {
      await interaction.reply({
        content: '✅ No rate limit violations recorded recently.\n\nThe abuse log tracks when users hit rate limits. Persistent violators may be testing defenses or attempting to flood channels.',
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0xFFA500)
      .setTitle('⚠️ Rate Limit Violations')
      .setDescription(`Found ${abuseData.length} user${abuseData.length !== 1 ? 's' : ''} with rate limit violations in the last 48 hours:`)
      .setFooter({ text: 'Consider warning or banning persistent violators' });

    // Show top 10 violators
    for (const data of abuseData.slice(0, 10)) {
      const timeAgo = Math.floor((Date.now() - data.lastViolation) / 60000); // minutes ago
      const timeStr = timeAgo < 60 ? `${timeAgo}m ago` : `${Math.floor(timeAgo / 60)}h ago`;

      // Count violations by command
      const commandCounts = {};
      let perUserCount = 0;
      let guildWideCount = 0;

      for (const v of data.violations) {
        commandCounts[v.commandName] = (commandCounts[v.commandName] || 0) + 1;
        if (v.limitType === 'per-user') perUserCount++;
        else guildWideCount++;
      }

      const commandBreakdown = Object.entries(commandCounts)
        .map(([cmd, count]) => `\`/${cmd}\`: ${count}x`)
        .join(', ');

      const limitTypeBreakdown = [];
      if (perUserCount > 0) limitTypeBreakdown.push(`Per-user: ${perUserCount}x`);
      if (guildWideCount > 0) limitTypeBreakdown.push(`Guild-wide: ${guildWideCount}x`);

      const warningFlag = data.totalCount > 10 ? ' 🚨 **Persistent abuser**' : '';

      embed.addFields({
        name: `<@${data.userId}> • ${data.totalCount} violation${data.totalCount !== 1 ? 's' : ''}${warningFlag}`,
        value: `**Commands:** ${commandBreakdown}\n**Types:** ${limitTypeBreakdown.join(', ')}\n**Last:** ${timeStr}`,
        inline: false,
      });
    }

    if (abuseData.length > 10) {
      embed.addFields({
        name: 'More Violators',
        value: `+${abuseData.length - 10} more users with violations (showing top 10)`,
        inline: false,
      });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

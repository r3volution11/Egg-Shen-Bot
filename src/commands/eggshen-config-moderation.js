import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { loadGuildConfig, saveGuildConfig, isAdmin } from '../utils/guildConfig.js';

export const data = new SlashCommandBuilder()
  .setName('eggshen-config-moderation')
  .setDescription('Configure moderation features: whitelist, cooldowns, and auto-ban (Admin/Moderator only)')
  .addSubcommandGroup(group =>
    group
      .setName('moderation')
      .setDescription('Moderation features: whitelist, cooldowns, and auto-ban')
      .addSubcommand(subcommand =>
        subcommand
          .setName('toggle')
          .setDescription('Enable or disable moderation features')
          .addBooleanOption(option =>
            option
              .setName('enabled')
              .setDescription('Enable or disable moderation features')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('user-cooldown')
          .setDescription('Apply a temporary cooldown to a user')
          .addUserOption(option =>
            option
              .setName('user')
              .setDescription('User to apply cooldown to')
              .setRequired(true)
          )
          .addIntegerOption(option =>
            option
              .setName('duration')
              .setDescription('Duration in minutes')
              .setRequired(true)
              .setMinValue(1)
              .setMaxValue(10080) // 1 week max
          )
          .addStringOption(option =>
            option
              .setName('reason')
              .setDescription('Reason for the cooldown')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('user-cooldown-remove')
          .setDescription('Remove a temporary cooldown from a user')
          .addUserOption(option =>
            option
              .setName('user')
              .setDescription('User to remove cooldown from')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('user-cooldown-list')
          .setDescription('List all active user cooldowns')
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('whitelist-toggle')
          .setDescription('Enable or disable whitelist mode')
          .addBooleanOption(option =>
            option
              .setName('enabled')
              .setDescription('Enable or disable whitelist mode')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('whitelist-add-role')
          .setDescription('Add a role to the whitelist')
          .addRoleOption(option =>
            option
              .setName('role')
              .setDescription('Role to add to whitelist')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('whitelist-add-user')
          .setDescription('Add a user to the whitelist')
          .addUserOption(option =>
            option
              .setName('user')
              .setDescription('User to add to whitelist')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('whitelist-remove-role')
          .setDescription('Remove a role from the whitelist')
          .addRoleOption(option =>
            option
              .setName('role')
              .setDescription('Role to remove from whitelist')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('whitelist-remove-user')
          .setDescription('Remove a user from the whitelist')
          .addUserOption(option =>
            option
              .setName('user')
              .setDescription('User to remove from whitelist')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('whitelist-list')
          .setDescription('List all whitelisted roles and users')
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('auto-ban-toggle')
          .setDescription('Enable or disable auto-ban notifications')
          .addBooleanOption(option =>
            option
              .setName('enabled')
              .setDescription('Enable or disable auto-ban notifications')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('auto-ban-threshold')
          .setDescription('Set the violation threshold for auto-ban notifications')
          .addIntegerOption(option =>
            option
              .setName('count')
              .setDescription('Number of violations to trigger notification')
              .setRequired(true)
              .setMinValue(5)
              .setMaxValue(100)
          )
          .addIntegerOption(option =>
            option
              .setName('hours')
              .setDescription('Time window in hours (default: 24)')
              .setRequired(false)
              .setMinValue(1)
              .setMaxValue(168) // 1 week max
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('auto-ban-list')
          .setDescription('List users who have exceeded the auto-ban threshold')
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

  if (group === 'moderation' && subcommand === 'toggle') {
    // Toggle moderation master switch
    const enabled = interaction.options.getBoolean('enabled');

    const config = await loadGuildConfig(guildId);
    if (!config.moderation) {
      config.moderation = {
        enabled: false,
        whitelist: { enabled: false, allowedRoles: [], allowedUsers: [] },
        autoBan: { enabled: false, violationCount: 20, windowHours: 24 },
      };
    }

    config.moderation.enabled = enabled;
    await saveGuildConfig(guildId, config);

    const statusText = enabled ? 'enabled' : 'disabled';
    const emoji = enabled ? '✅' : '❌';
    const description = enabled
      ? '\n\nModeration features are now active:\n• Whitelist mode (role/user based access control)\n• Temporary user cooldowns (manual restrictions)\n• Auto-ban threshold notifications\n\nConfigure each feature using `/eggshen-config-moderation` commands.'
      : '\n\nAll moderation features are now disabled. Rate limiting and abuse logging will still function.';

    await interaction.reply({
      content: `${emoji} Moderation features have been **${statusText}**.${description}`,
      ephemeral: true,
    });
  } else if (group === 'moderation' && subcommand === 'user-cooldown') {
    // Apply temporary cooldown to a user
    const user = interaction.options.getUser('user');
    const duration = interaction.options.getInteger('duration');
    const reason = interaction.options.getString('reason');

    const config = await loadGuildConfig(guildId);
    if (!config.moderation?.enabled) {
      await interaction.reply({
        content: '❌ Moderation features are disabled. Enable them with `/eggshen-config-moderation moderation toggle enabled:true`',
        ephemeral: true,
      });
      return;
    }

    const { applyUserCooldown } = await import('../utils/rateLimiter.js');
    const expiresAt = applyUserCooldown(guildId, user.id, duration, reason, interaction.user.id);

    const expiryTimestamp = Math.floor(expiresAt / 1000);

    await interaction.reply({
      content: `🛑 Applied temporary cooldown to ${user}\n**Duration:** ${duration} minute${duration !== 1 ? 's' : ''}\n**Reason:** ${reason}\n**Expires:** <t:${expiryTimestamp}:R>`,
      ephemeral: true,
    });
  } else if (group === 'moderation' && subcommand === 'user-cooldown-remove') {
    // Remove temporary cooldown from a user
    const user = interaction.options.getUser('user');

    const { removeUserCooldown } = await import('../utils/rateLimiter.js');
    const removed = removeUserCooldown(guildId, user.id);

    if (removed) {
      await interaction.reply({
        content: `✅ Removed cooldown from ${user}`,
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: `❌ ${user} does not have an active cooldown.`,
        ephemeral: true,
      });
    }
  } else if (group === 'moderation' && subcommand === 'user-cooldown-list') {
    // List all active cooldowns
    const { getActiveCooldowns } = await import('../utils/rateLimiter.js');
    const cooldowns = getActiveCooldowns(guildId);

    if (cooldowns.length === 0) {
      await interaction.reply({
        content: '✅ No active user cooldowns.',
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0xFFA500)
      .setTitle('🛑 Active User Cooldowns')
      .setDescription(`${cooldowns.length} user${cooldowns.length !== 1 ? 's' : ''} currently under cooldown:`)
      .setFooter({ text: 'Use /eggshen-config-moderation moderation user-cooldown-remove to lift a cooldown' });

    for (const cooldown of cooldowns) {
      const expiryTimestamp = Math.floor(cooldown.expiresAt / 1000);
      const appliedTimestamp = Math.floor(cooldown.appliedAt / 1000);

      embed.addFields({
        name: `<@${cooldown.userId}>`,
        value: `**Reason:** ${cooldown.reason}\n**Applied:** <t:${appliedTimestamp}:R> by <@${cooldown.appliedBy}>\n**Expires:** <t:${expiryTimestamp}:R>`,
        inline: false,
      });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } else if (group === 'moderation' && subcommand === 'whitelist-toggle') {
    // Toggle whitelist mode
    const enabled = interaction.options.getBoolean('enabled');

    const config = await loadGuildConfig(guildId);
    if (!config.moderation) {
      config.moderation = {
        enabled: false,
        whitelist: { enabled: false, allowedRoles: [], allowedUsers: [] },
        autoBan: { enabled: false, violationCount: 20, windowHours: 24 },
      };
    }

    if (!config.moderation.enabled) {
      await interaction.reply({
        content: '❌ Moderation features are disabled. Enable them with `/eggshen-config-moderation moderation toggle enabled:true`',
        ephemeral: true,
      });
      return;
    }

    config.moderation.whitelist.enabled = enabled;
    await saveGuildConfig(guildId, config);

    const statusText = enabled ? 'enabled' : 'disabled';
    const emoji = enabled ? '🔒' : '✅';
    const description = enabled
      ? '\n\n⚠️ **Only whitelisted users and roles can now use bot commands!**\n\nAdd allowed roles/users:\n• `/eggshen-config-moderation moderation whitelist-add-role`\n• `/eggshen-config-moderation moderation whitelist-add-user`\n\nAdministrators and moderators are always allowed.'
      : '\n\nAll users can now use bot commands (subject to rate limits).';

    await interaction.reply({
      content: `${emoji} Whitelist mode has been **${statusText}**.${description}`,
      ephemeral: true,
    });
  } else if (group === 'moderation' && subcommand === 'whitelist-add-role') {
    // Add role to whitelist
    const role = interaction.options.getRole('role');

    const config = await loadGuildConfig(guildId);
    if (!config.moderation?.enabled) {
      await interaction.reply({
        content: '❌ Moderation features are disabled. Enable them with `/eggshen-config-moderation moderation toggle enabled:true`',
        ephemeral: true,
      });
      return;
    }

    if (!config.moderation.whitelist) {
      config.moderation.whitelist = { enabled: false, allowedRoles: [], allowedUsers: [] };
    }

    if (config.moderation.whitelist.allowedRoles.includes(role.id)) {
      await interaction.reply({
        content: `❌ ${role} is already in the whitelist.`,
        ephemeral: true,
      });
      return;
    }

    config.moderation.whitelist.allowedRoles.push(role.id);
    await saveGuildConfig(guildId, config);

    await interaction.reply({
      content: `✅ Added ${role} to the whitelist.\n\nUsers with this role can now use bot commands${config.moderation.whitelist.enabled ? ' (whitelist mode is active)' : ' when whitelist mode is enabled'}.`,
      ephemeral: true,
    });
  } else if (group === 'moderation' && subcommand === 'whitelist-add-user') {
    // Add user to whitelist
    const user = interaction.options.getUser('user');

    const config = await loadGuildConfig(guildId);
    if (!config.moderation?.enabled) {
      await interaction.reply({
        content: '❌ Moderation features are disabled. Enable them with `/eggshen-config-moderation moderation toggle enabled:true`',
        ephemeral: true,
      });
      return;
    }

    if (!config.moderation.whitelist) {
      config.moderation.whitelist = { enabled: false, allowedRoles: [], allowedUsers: [] };
    }

    if (config.moderation.whitelist.allowedUsers.includes(user.id)) {
      await interaction.reply({
        content: `❌ ${user} is already in the whitelist.`,
        ephemeral: true,
      });
      return;
    }

    config.moderation.whitelist.allowedUsers.push(user.id);
    await saveGuildConfig(guildId, config);

    await interaction.reply({
      content: `✅ Added ${user} to the whitelist.\n\nThis user can now use bot commands${config.moderation.whitelist.enabled ? ' (whitelist mode is active)' : ' when whitelist mode is enabled'}.`,
      ephemeral: true,
    });
  } else if (group === 'moderation' && subcommand === 'whitelist-remove-role') {
    // Remove role from whitelist
    const role = interaction.options.getRole('role');

    const config = await loadGuildConfig(guildId);
    if (!config.moderation?.whitelist) {
      await interaction.reply({
        content: '❌ No whitelist configured.',
        ephemeral: true,
      });
      return;
    }

    const index = config.moderation.whitelist.allowedRoles.indexOf(role.id);
    if (index === -1) {
      await interaction.reply({
        content: `❌ ${role} is not in the whitelist.`,
        ephemeral: true,
      });
      return;
    }

    config.moderation.whitelist.allowedRoles.splice(index, 1);
    await saveGuildConfig(guildId, config);

    await interaction.reply({
      content: `✅ Removed ${role} from the whitelist.`,
      ephemeral: true,
    });
  } else if (group === 'moderation' && subcommand === 'whitelist-remove-user') {
    // Remove user from whitelist
    const user = interaction.options.getUser('user');

    const config = await loadGuildConfig(guildId);
    if (!config.moderation?.whitelist) {
      await interaction.reply({
        content: '❌ No whitelist configured.',
        ephemeral: true,
      });
      return;
    }

    const index = config.moderation.whitelist.allowedUsers.indexOf(user.id);
    if (index === -1) {
      await interaction.reply({
        content: `❌ ${user} is not in the whitelist.`,
        ephemeral: true,
      });
      return;
    }

    config.moderation.whitelist.allowedUsers.splice(index, 1);
    await saveGuildConfig(guildId, config);

    await interaction.reply({
      content: `✅ Removed ${user} from the whitelist.`,
      ephemeral: true,
    });
  } else if (group === 'moderation' && subcommand === 'whitelist-list') {
    // List whitelisted roles and users
    const config = await loadGuildConfig(guildId);
    if (!config.moderation?.whitelist ||
        (config.moderation.whitelist.allowedRoles.length === 0 &&
         config.moderation.whitelist.allowedUsers.length === 0)) {
      await interaction.reply({
        content: '❌ No roles or users in the whitelist.\n\nAdd them with:\n• `/eggshen-config-moderation moderation whitelist-add-role`\n• `/eggshen-config-moderation moderation whitelist-add-user`',
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🔒 Whitelist')
      .setDescription(`Whitelist mode: ${config.moderation.whitelist.enabled ? '**Enabled** ✅' : '**Disabled** ❌'}`)
      .setFooter({ text: 'Administrators and moderators are always allowed' });

    if (config.moderation.whitelist.allowedRoles.length > 0) {
      const roleList = config.moderation.whitelist.allowedRoles
        .map(roleId => `<@&${roleId}>`)
        .join('\n');
      embed.addFields({
        name: `Allowed Roles (${config.moderation.whitelist.allowedRoles.length})`,
        value: roleList,
        inline: false,
      });
    }

    if (config.moderation.whitelist.allowedUsers.length > 0) {
      const userList = config.moderation.whitelist.allowedUsers
        .map(userId => `<@${userId}>`)
        .join('\n');
      embed.addFields({
        name: `Allowed Users (${config.moderation.whitelist.allowedUsers.length})`,
        value: userList,
        inline: false,
      });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } else if (group === 'moderation' && subcommand === 'auto-ban-toggle') {
    // Toggle auto-ban notifications
    const enabled = interaction.options.getBoolean('enabled');

    const config = await loadGuildConfig(guildId);
    if (!config.moderation) {
      config.moderation = {
        enabled: false,
        whitelist: { enabled: false, allowedRoles: [], allowedUsers: [] },
        autoBan: { enabled: false, violationCount: 20, windowHours: 24 },
      };
    }

    if (!config.moderation.enabled) {
      await interaction.reply({
        content: '❌ Moderation features are disabled. Enable them with `/eggshen-config-moderation moderation toggle enabled:true`',
        ephemeral: true,
      });
      return;
    }

    config.moderation.autoBan.enabled = enabled;
    await saveGuildConfig(guildId, config);

    const statusText = enabled ? 'enabled' : 'disabled';
    const emoji = enabled ? '✅' : '❌';
    const description = enabled
      ? `\n\nThe bot will now warn users when they exceed ${config.moderation.autoBan.violationCount} rate limit violations within ${config.moderation.autoBan.windowHours} hours.\n\nConfigure threshold: \`/eggshen-config-moderation moderation auto-ban-threshold\``
      : '\n\nAuto-ban warnings are now disabled.';

    await interaction.reply({
      content: `${emoji} Auto-ban threshold notifications have been **${statusText}**.${description}`,
      ephemeral: true,
    });
  } else if (group === 'moderation' && subcommand === 'auto-ban-threshold') {
    // Set auto-ban threshold
    const count = interaction.options.getInteger('count');
    const hours = interaction.options.getInteger('hours');

    const config = await loadGuildConfig(guildId);
    if (!config.moderation?.enabled) {
      await interaction.reply({
        content: '❌ Moderation features are disabled. Enable them with `/eggshen-config-moderation moderation toggle enabled:true`',
        ephemeral: true,
      });
      return;
    }

    if (!config.moderation.autoBan) {
      config.moderation.autoBan = { enabled: false, violationCount: 20, windowHours: 24 };
    }

    config.moderation.autoBan.violationCount = count;
    if (hours !== null) {
      config.moderation.autoBan.windowHours = hours;
    }

    await saveGuildConfig(guildId, config);

    const windowHours = config.moderation.autoBan.windowHours;

    await interaction.reply({
      content: `✅ Auto-ban threshold set to **${count} violations** within **${windowHours} hour${windowHours !== 1 ? 's' : ''}**.\n\nUsers who exceed this threshold will see a warning message${config.moderation.autoBan.enabled ? ' (auto-ban is enabled)' : ' when auto-ban is enabled'}.`,
      ephemeral: true,
    });
  } else if (group === 'moderation' && subcommand === 'auto-ban-list') {
    // List users exceeding auto-ban threshold
    const config = await loadGuildConfig(guildId);
    if (!config.moderation?.enabled) {
      await interaction.reply({
        content: '❌ Moderation features are disabled. Enable them with `/eggshen-config-moderation moderation toggle enabled:true`',
        ephemeral: true,
      });
      return;
    }

    const { getUsersExceedingThreshold } = await import('../utils/rateLimiter.js');
    const users = getUsersExceedingThreshold(guildId, config);

    if (users.length === 0) {
      await interaction.reply({
        content: `✅ No users have exceeded the auto-ban threshold.\n\n**Current threshold:** ${config.moderation.autoBan.violationCount} violations within ${config.moderation.autoBan.windowHours} hours.`,
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('🚨 Users Exceeding Auto-Ban Threshold')
      .setDescription(`${users.length} user${users.length !== 1 ? 's' : ''} have exceeded **${config.moderation.autoBan.violationCount} violations** within **${config.moderation.autoBan.windowHours} hours**:`)
      .setFooter({ text: 'Consider banning these users if abuse continues' });

    for (const user of users) {
      const lastTimestamp = Math.floor(user.lastViolation / 1000);

      embed.addFields({
        name: `<@${user.userId}>`,
        value: `**Violations:** ${user.violationCount}\n**Last violation:** <t:${lastTimestamp}:R>`,
        inline: false,
      });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

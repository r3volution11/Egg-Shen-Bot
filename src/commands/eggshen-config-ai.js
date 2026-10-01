import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { loadGuildConfig, saveGuildConfig, isAdmin, getAiTextEnabled, getAiAskEnabled } from '../utils/guildConfig.js';
import { isOpenAIAvailable } from '../services/aiService.js';
import { getGuildImageStats, getUserImageStats, resetUserImageUsage, resetGuildImageUsage } from '../utils/aiImageTracker.js';

export const data = new SlashCommandBuilder()
  .setName('eggshen-config-ai')
  .setDescription('Configure AI image generation limits and settings (Admin/Moderator only)')
  // ========== AI IMAGES GROUP ==========
  .addSubcommandGroup(group =>
    group
      .setName('ai-images')
      .setDescription('Configure AI image generation limits and settings')
      .addSubcommand(subcommand =>
        subcommand
          .setName('view')
          .setDescription('View AI image generation statistics and limits')
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('feature-toggle')
          .setDescription('Enable or disable AI image generation entirely on this server')
          .addBooleanOption(option =>
            option
              .setName('enabled')
              .setDescription('Enable or disable AI image generation features')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('set-permissions')
          .setDescription('Set who can use AI image generation commands')
          .addStringOption(option =>
            option
              .setName('level')
              .setDescription('Permission level required to use AI image generation')
              .setRequired(true)
              .addChoices(
                { name: 'Everyone', value: 'everyone' },
                { name: 'Moderators and Admins', value: 'moderators' },
                { name: 'Admins Only', value: 'admins' }
              )
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('toggle')
          .setDescription('Enable or disable AI image rate limiting')
          .addBooleanOption(option =>
            option
              .setName('enabled')
              .setDescription('Enable or disable AI image rate limiting')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('user-cooldown')
          .setDescription('Set cooldown between AI image generations per user')
          .addIntegerOption(option =>
            option
              .setName('seconds')
              .setDescription('Cooldown duration in seconds (60-3600, recommended: 300 = 5 min)')
              .setRequired(true)
              .setMinValue(60)
              .setMaxValue(3600)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('user-daily-limit')
          .setDescription('Set maximum AI images per user per day')
          .addIntegerOption(option =>
            option
              .setName('limit')
              .setDescription('Maximum images per user per day (1-100, recommended: 10)')
              .setRequired(true)
              .setMinValue(1)
              .setMaxValue(100)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('guild-daily-limit')
          .setDescription('Set maximum AI images per server per day')
          .addIntegerOption(option =>
            option
              .setName('limit')
              .setDescription('Maximum images per server per day (1-500, recommended: 50)')
              .setRequired(true)
              .setMinValue(1)
              .setMaxValue(500)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('admin-bypass')
          .setDescription('Toggle whether admins bypass cooldown (they always respect daily limits)')
          .addBooleanOption(option =>
            option
              .setName('enabled')
              .setDescription('Allow admins to bypass cooldown')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('reset-user')
          .setDescription('Reset AI image usage for a specific user')
          .addUserOption(option =>
            option
              .setName('user')
              .setDescription('User to reset')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('reset-guild')
          .setDescription('Reset AI image usage for the entire server')
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('whitelist-add')
          .setDescription('Add user to unlimited AI image generation (e.g., contributors/premium)')
          .addUserOption(option =>
            option
              .setName('user')
              .setDescription('User to grant unlimited access')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('whitelist-remove')
          .setDescription('Remove user from unlimited AI image generation')
          .addUserOption(option =>
            option
              .setName('user')
              .setDescription('User to remove unlimited access from')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('whitelist-list')
          .setDescription('View users with unlimited AI image generation')
      )
  )
  // ========== AI TEXT GROUP ==========
  // Separate from ai-images on purpose: text generation costs a fraction of an
  // image, so a server may well want the announcement flavor text while
  // keeping image generation off (or the reverse).
  .addSubcommandGroup(group =>
    group
      .setName('ai-text')
      .setDescription('Configure AI-written announcement text')
      .addSubcommand(subcommand =>
        subcommand
          .setName('feature-toggle')
          .setDescription('Enable or disable AI-written announcement text on this server')
          .addBooleanOption(option =>
            option
              .setName('enabled')
              .setDescription('Enable or disable AI-written announcement text')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('view')
          .setDescription('Show whether AI announcement text is enabled and available')
      )
  )
  .addSubcommandGroup(group =>
    group
      .setName('ai-ask')
      .setDescription('Configure AI-written answers for /eggshen-ask')
      .addSubcommand(subcommand =>
        subcommand
          .setName('feature-toggle')
          .setDescription('Enable or disable AI-written /eggshen-ask answers on this server')
          .addBooleanOption(option =>
            option
              .setName('enabled')
              .setDescription('Enable or disable AI-written answers')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('view')
          .setDescription('Show whether AI answers for /eggshen-ask are enabled and available')
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

  if (group === 'ai-images' && subcommand === 'view') {
    // View AI image statistics
    const config = await loadGuildConfig(guildId);
    const aiConfig = config.aiImages || {
      enabled: true,
      permissions: 'everyone',
    };
    const limits = config.rateLimits?.aiImages || {
      enabled: true,
      perUserCooldown: 300,
      perUserDailyLimit: 10,
      perGuildDailyLimit: 50,
      adminsBypassCooldown: true,
      costPerImage: 0.04,
    };

    const guildStats = await getGuildImageStats(guildId);
    const userStats = await getUserImageStats(guildId, interaction.user.id);

    const permissionsLabel = {
      everyone: 'Everyone',
      moderators: 'Moderators & Admins',
      admins: 'Admins Only',
    }[aiConfig.permissions] || 'Everyone';

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🎨 AI Image Generation Settings & Statistics')
      .addFields(
        {
          name: '⚙️ Feature Settings',
          value:
            `${aiConfig.enabled ? '✅' : '❌'} **Feature Status:** ${aiConfig.enabled ? 'Enabled' : 'Disabled'}\n` +
            `🔒 **Permissions:** ${permissionsLabel}\n` +
            `${limits.enabled ? '✅' : '❌'} **Rate Limiting:** ${limits.enabled ? 'Enabled' : 'Disabled'}\n` +
            `🕒 **User Cooldown:** ${Math.floor(limits.perUserCooldown / 60)} minutes\n` +
            `👤 **User Daily Limit:** ${limits.perUserDailyLimit} images\n` +
            `🏠 **Server Daily Limit:** ${limits.perGuildDailyLimit} images\n` +
            `${limits.adminsBypassCooldown ? '✅' : '❌'} **Admin Bypass Cooldown:** ${limits.adminsBypassCooldown ? 'Yes' : 'No'}\n` +
            `💰 **Cost Per Image:** $${limits.costPerImage.toFixed(2)}`,
          inline: false,
        },
        {
          name: '📊 Server Stats (Today)',
          value:
            `🎨 **Generated:** ${guildStats.todayCount} / ${guildStats.dailyLimit}\n` +
            `📉 **Remaining:** ${guildStats.remaining}\n` +
            `💵 **Cost Today:** $${guildStats.todayCost.toFixed(2)}\n` +
            `📈 **Usage:** ${guildStats.percentUsed}%`,
          inline: true,
        },
        {
          name: '👤 Your Stats (Today)',
          value:
            `🎨 **Generated:** ${userStats.todayCount} / ${userStats.dailyLimit}\n` +
            `📉 **Remaining:** ${userStats.remaining}\n` +
            `${userStats.cooldownRemaining > 0 ? `⏳ **Cooldown:** ${Math.ceil(userStats.cooldownRemaining / 60)} min` : '✅ **Ready to generate**'}`,
          inline: true,
        }
      )
      .setFooter({ text: 'Use /eggshen-config-ai ai-images to adjust settings' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });

  } else if (group === 'ai-images' && subcommand === 'feature-toggle') {
    // Toggle AI image generation feature entirely
    const enabled = interaction.options.getBoolean('enabled');

    const config = await loadGuildConfig(guildId);
    if (!config.aiImages) {
      config.aiImages = {
        enabled: true,
        permissions: 'everyone',
      };
    }

    config.aiImages.enabled = enabled;
    await saveGuildConfig(guildId, config);

    await interaction.reply({
      content: `✅ AI image generation **${enabled ? 'enabled' : 'disabled'}** on this server.${!enabled ? '\n\n🚫 The `/image` command will no longer work until re-enabled.' : '\n\n✨ Users can now generate AI images (subject to rate limits and permissions).'}`,
      ephemeral: true,
    });

  } else if (group === 'ai-images' && subcommand === 'set-permissions') {
    // Set permission level for AI image generation
    const level = interaction.options.getString('level');

    const config = await loadGuildConfig(guildId);
    if (!config.aiImages) {
      config.aiImages = {
        enabled: true,
        permissions: 'everyone',
      };
    }

    config.aiImages.permissions = level;
    await saveGuildConfig(guildId, config);

    const levelLabels = {
      everyone: 'Everyone',
      moderators: 'Moderators and Administrators',
      admins: 'Administrators Only',
    };

    await interaction.reply({
      content: `✅ AI image generation permissions set to: **${levelLabels[level]}**\n\n` +
        `Only users with the specified permissions can now use the \`/image\` command.`,
      ephemeral: true,
    });

  } else if (group === 'ai-images' && subcommand === 'toggle') {
    // Toggle AI image rate limiting
    const enabled = interaction.options.getBoolean('enabled');

    const config = await loadGuildConfig(guildId);
    if (!config.rateLimits) {
      config.rateLimits = {};
    }
    if (!config.rateLimits.aiImages) {
      config.rateLimits.aiImages = {
        enabled: true,
        perUserCooldown: 300,
        perUserDailyLimit: 10,
        perGuildDailyLimit: 50,
        adminsBypassCooldown: true,
        costPerImage: 0.04,
      };
    }

    config.rateLimits.aiImages.enabled = enabled;
    await saveGuildConfig(guildId, config);

    await interaction.reply({
      content: `✅ AI image rate limiting **${enabled ? 'enabled' : 'disabled'}**${enabled ? '. Users will be limited to prevent excessive costs.' : '. Users can now generate images without limits (cost may increase significantly!).'}`,
      ephemeral: true,
    });

  } else if (group === 'ai-images' && subcommand === 'user-cooldown') {
    // Set user cooldown
    const seconds = interaction.options.getInteger('seconds');

    const config = await loadGuildConfig(guildId);
    if (!config.rateLimits) {
      config.rateLimits = {};
    }
    if (!config.rateLimits.aiImages) {
      config.rateLimits.aiImages = {
        enabled: true,
        perUserCooldown: 300,
        perUserDailyLimit: 10,
        perGuildDailyLimit: 50,
        adminsBypassCooldown: true,
        costPerImage: 0.04,
      };
    }

    config.rateLimits.aiImages.perUserCooldown = seconds;
    await saveGuildConfig(guildId, config);

    await interaction.reply({
      content: `✅ AI image cooldown set to **${Math.floor(seconds / 60)} minutes** (${seconds} seconds).`,
      ephemeral: true,
    });

  } else if (group === 'ai-images' && subcommand === 'user-daily-limit') {
    // Set user daily limit
    const limit = interaction.options.getInteger('limit');

    const config = await loadGuildConfig(guildId);
    if (!config.rateLimits) {
      config.rateLimits = {};
    }
    if (!config.rateLimits.aiImages) {
      config.rateLimits.aiImages = {
        enabled: true,
        perUserCooldown: 300,
        perUserDailyLimit: 10,
        perGuildDailyLimit: 50,
        adminsBypassCooldown: true,
        costPerImage: 0.04,
      };
    }

    config.rateLimits.aiImages.perUserDailyLimit = limit;
    await saveGuildConfig(guildId, config);

    const monthlyCost = limit * 30 * 0.04; // Rough estimate
    await interaction.reply({
      content: `✅ User daily limit set to **${limit} images per day**.\n_Estimated max cost per user per month: $${monthlyCost.toFixed(2)}_`,
      ephemeral: true,
    });

  } else if (group === 'ai-images' && subcommand === 'guild-daily-limit') {
    // Set guild daily limit
    const limit = interaction.options.getInteger('limit');

    const config = await loadGuildConfig(guildId);
    if (!config.rateLimits) {
      config.rateLimits = {};
    }
    if (!config.rateLimits.aiImages) {
      config.rateLimits.aiImages = {
        enabled: true,
        perUserCooldown: 300,
        perUserDailyLimit: 10,
        perGuildDailyLimit: 50,
        adminsBypassCooldown: true,
        costPerImage: 0.04,
      };
    }

    config.rateLimits.aiImages.perGuildDailyLimit = limit;
    await saveGuildConfig(guildId, config);

    const monthlyCost = limit * 30 * 0.04; // Rough estimate
    await interaction.reply({
      content: `✅ Server daily limit set to **${limit} images per day**.\n_Estimated max cost per month: $${monthlyCost.toFixed(2)}_`,
      ephemeral: true,
    });

  } else if (group === 'ai-images' && subcommand === 'admin-bypass') {
    // Toggle admin bypass cooldown
    const enabled = interaction.options.getBoolean('enabled');

    const config = await loadGuildConfig(guildId);
    if (!config.rateLimits) {
      config.rateLimits = {};
    }
    if (!config.rateLimits.aiImages) {
      config.rateLimits.aiImages = {
        enabled: true,
        perUserCooldown: 300,
        perUserDailyLimit: 10,
        perGuildDailyLimit: 50,
        adminsBypassCooldown: true,
        costPerImage: 0.04,
      };
    }

    config.rateLimits.aiImages.adminsBypassCooldown = enabled;
    await saveGuildConfig(guildId, config);

    await interaction.reply({
      content: `✅ Admin cooldown bypass **${enabled ? 'enabled' : 'disabled'}**. ${enabled ? 'Admins can generate images without cooldown (but still respect daily limits).' : 'Admins must wait like everyone else.'}`,
      ephemeral: true,
    });

  } else if (group === 'ai-images' && subcommand === 'reset-user') {
    // Reset user AI image usage
    const user = interaction.options.getUser('user');

    resetUserImageUsage(guildId, user.id);

    await interaction.reply({
      content: `✅ Reset AI image usage for **${user.username}**. They can now generate images again.`,
      ephemeral: true,
    });

  } else if (group === 'ai-images' && subcommand === 'reset-guild') {
    // Reset guild AI image usage
    resetGuildImageUsage(guildId);

    await interaction.reply({
      content: `✅ Reset server AI image usage. All users can now generate images again (user limits still apply).`,
      ephemeral: true,
    });

  } else if (group === 'ai-images' && subcommand === 'whitelist-add') {
    // Add user to AI image whitelist
    const user = interaction.options.getUser('user');

    const config = await loadGuildConfig(guildId);
    if (!config.rateLimits) {
      config.rateLimits = {};
    }
    if (!config.rateLimits.aiImages) {
      config.rateLimits.aiImages = {
        enabled: true,
        perUserCooldown: 300,
        perUserDailyLimit: 10,
        perGuildDailyLimit: 50,
        adminsBypassCooldown: true,
        costPerImage: 0.04,
        whitelistedUsers: [],
      };
    }
    if (!config.rateLimits.aiImages.whitelistedUsers) {
      config.rateLimits.aiImages.whitelistedUsers = [];
    }

    if (config.rateLimits.aiImages.whitelistedUsers.includes(user.id)) {
      await interaction.reply({
        content: `ℹ️ **${user.username}** is already whitelisted for unlimited AI images.`,
        ephemeral: true,
      });
      return;
    }

    config.rateLimits.aiImages.whitelistedUsers.push(user.id);
    await saveGuildConfig(guildId, config);

    await interaction.reply({
      content: `✅ **${user.username}** has been granted unlimited AI image generation.\n_They will bypass all cooldowns and daily limits. Use this for bot contributors or premium users._`,
      ephemeral: true,
    });

  } else if (group === 'ai-images' && subcommand === 'whitelist-remove') {
    // Remove user from AI image whitelist
    const user = interaction.options.getUser('user');

    const config = await loadGuildConfig(guildId);
    if (!config.rateLimits?.aiImages?.whitelistedUsers) {
      await interaction.reply({
        content: `❌ No whitelisted users found.`,
        ephemeral: true,
      });
      return;
    }

    const index = config.rateLimits.aiImages.whitelistedUsers.indexOf(user.id);
    if (index === -1) {
      await interaction.reply({
        content: `ℹ️ **${user.username}** is not whitelisted.`,
        ephemeral: true,
      });
      return;
    }

    config.rateLimits.aiImages.whitelistedUsers.splice(index, 1);
    await saveGuildConfig(guildId, config);

    await interaction.reply({
      content: `✅ Removed **${user.username}** from unlimited AI image generation. They will now be subject to normal rate limits.`,
      ephemeral: true,
    });

  } else if (group === 'ai-images' && subcommand === 'whitelist-list') {
    // List whitelisted users
    const config = await loadGuildConfig(guildId);
    const whitelistedUsers = config.rateLimits?.aiImages?.whitelistedUsers || [];

    if (whitelistedUsers.length === 0) {
      await interaction.reply({
        content: `ℹ️ No users are currently whitelisted for unlimited AI images.\n\nUse \`/eggshen-config-ai ai-images whitelist-add\` to grant unlimited access to contributors or premium users.`,
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🎨 Unlimited AI Image Generation Whitelist')
      .setDescription(`These users can generate unlimited AI images without cooldowns or daily limits:`)
      .addFields({
        name: `👥 Whitelisted Users (${whitelistedUsers.length})`,
        value: whitelistedUsers.map(userId => `<@${userId}> (\`${userId}\`)`).join('\n'),
        inline: false,
      })
      .setFooter({ text: 'Use for bot contributors or premium users' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });

  } else if (group === 'ai-text' && subcommand === 'feature-toggle') {
    const enabled = interaction.options.getBoolean('enabled');

    const config = await loadGuildConfig(guildId);
    if (!config.aiText) config.aiText = {};
    config.aiText.enabled = enabled;
    await saveGuildConfig(guildId, config);

    // Worth saying plainly that turning it ON is not sufficient: the flag is
    // the server's preference, the API key is the operator's, and a server
    // owner who is not the operator cannot tell the difference otherwise.
    const available = isOpenAIAvailable();
    const note = enabled
      ? (available
        ? '\n\n✨ `/announce` will write the announcement for you when you don\'t supply your own message.'
        : '\n\n⚠️ No OpenAI API key is configured on this bot, so announcements will still use the plain template. Ask whoever hosts the bot to set `OPENAI_API_KEY`.')
      : '\n\n📝 `/announce` will use the plain template instead. Your own `message` text always posts exactly as written either way.';

    await interaction.reply({
      content: `✅ AI-written announcement text **${enabled ? 'enabled' : 'disabled'}** on this server.${note}`,
      ephemeral: true,
    });

  } else if (group === 'ai-ask' && subcommand === 'feature-toggle') {
    const enabled = interaction.options.getBoolean('enabled');

    const config = await loadGuildConfig(guildId);
    if (!config.aiAsk) config.aiAsk = {};
    config.aiAsk.enabled = enabled;
    await saveGuildConfig(guildId, config);

    // As with ai-text: the switch is the server's, the API key the operator's
    const available = isOpenAIAvailable();
    const note = enabled
      ? (available
        ? '\n\n✨ `/eggshen-ask` will write answers from the docs, with the exact commands to run.'
        : '\n\n⚠️ No OpenAI API key is configured on this bot, so `/eggshen-ask` will still show the best-matching docs section. Ask whoever hosts the bot to set `OPENAI_API_KEY`.')
      : '\n\n📖 `/eggshen-ask` will show the best-matching docs section as written, with links.';

    await interaction.reply({
      content: `✅ AI-written \`/eggshen-ask\` answers **${enabled ? 'enabled' : 'disabled'}** on this server.${note}`,
      ephemeral: true,
    });

  } else if (group === 'ai-ask' && subcommand === 'view') {
    const config = await loadGuildConfig(guildId);
    const enabled = getAiAskEnabled(config);
    const available = isOpenAIAvailable();

    const embed = new EmbedBuilder()
      .setColor(enabled && available ? 0x57F287 : 0xFEE75C)
      .setTitle('🤔 AI Answers for /eggshen-ask')
      .addFields(
        { name: 'This server', value: enabled ? '✅ Enabled' : '🚫 Disabled', inline: true },
        { name: 'API key on this bot', value: available ? '✅ Configured' : '❌ Not configured', inline: true },
        {
          name: 'What happens now',
          value: enabled && available
            ? 'AI writes each answer from the docs and the bot\'s real commands. Any command it names is checked before it\'s shown.'
            : 'Answers show the best-matching docs section as written, with links.',
          inline: false,
        }
      )
      .setFooter({ text: 'Change with /eggshen-config-ai ai-ask feature-toggle' });

    await interaction.reply({ embeds: [embed], ephemeral: true });

  } else if (group === 'ai-text' && subcommand === 'view') {
    const config = await loadGuildConfig(guildId);
    const enabled = getAiTextEnabled(config);
    const available = isOpenAIAvailable();

    const embed = new EmbedBuilder()
      .setColor(enabled && available ? 0x57F287 : 0xFEE75C)
      .setTitle('✍️ AI Announcement Text')
      .addFields(
        {
          name: 'This server',
          value: enabled ? '✅ Enabled' : '🚫 Disabled',
          inline: true,
        },
        {
          name: 'API key on this bot',
          value: available ? '✅ Configured' : '❌ Not configured',
          inline: true,
        },
        {
          name: 'What happens now',
          value: enabled && available
            ? 'AI writes the announcement when no `message` is supplied.'
            : 'Announcements use the plain template. Your own `message` text always posts exactly as written.',
          inline: false,
        }
      )
      .setFooter({ text: 'Change with /eggshen-config-ai ai-text feature-toggle' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

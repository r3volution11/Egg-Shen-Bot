import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { loadGuildConfig, saveGuildConfig, isAdmin } from '../utils/guildConfig.js';

export const data = new SlashCommandBuilder()
  .setName('eggshen-config-events')
  .setDescription('Configure the event request system for watch parties (Admin/Moderator only)')
  .addSubcommandGroup(group =>
    group
      .setName('event-requests')
      .setDescription('Configure event request system for watch parties')
      .addSubcommand(subcommand =>
        subcommand
          .setName('view')
          .setDescription('View current event request configuration')
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('toggle')
          .setDescription('Enable or disable event requests on this server')
          .addBooleanOption(option =>
            option
              .setName('enabled')
              .setDescription('Enable or disable event requests')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('moderation-channel')
          .setDescription('Set the channel where event requests will be sent for approval')
          .addChannelOption(option =>
            option
              .setName('channel')
              .setDescription('Text channel for moderation of event requests')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('server-name')
          .setDescription('Set the display name for your server on the event request form')
          .addStringOption(option =>
            option
              .setName('name')
              .setDescription('Server display name (shown on the website)')
              .setRequired(true)
              .setMaxLength(100)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('invite-url')
          .setDescription('Set the Discord invite link shown on the event request form')
          .addStringOption(option =>
            option
              .setName('url')
              .setDescription('Discord invite URL (or leave empty to hide)')
              .setRequired(false)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('allow-voice-requests')
          .setDescription('Allow or disallow users from requesting voice/stage channels')
          .addBooleanOption(option =>
            option
              .setName('allow')
              .setDescription('Allow voice channel requests?')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('announce-decisions')
          .setDescription('Post a new message in the moderation channel when a request is approved/denied')
          .addBooleanOption(option =>
            option
              .setName('enabled')
              .setDescription('Post an announcement message on approve/deny?')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('allow-user-channel-selection')
          .setDescription('Allow users to select channels in form (default: moderators choose during approval)')
          .addBooleanOption(option =>
            option
              .setName('allow')
              .setDescription('Allow user channel selection?')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('set-allowed-text-channels')
          .setDescription('Set which text channels users can select (empty = all channels allowed)')
          .addStringOption(option =>
            option
              .setName('channel-ids')
              .setDescription('Comma-separated channel IDs, or "all" to allow all channels')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('set-allowed-voice-channels')
          .setDescription('Set which voice/stage channels users can select (empty = all allowed)')
          .addStringOption(option =>
            option
              .setName('channel-ids')
              .setDescription('Comma-separated channel IDs, or "all" to allow all channels')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('get-link')
          .setDescription('Get the event request submission link for this server')
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

  if (group === 'event-requests' && subcommand === 'view') {
    const config = await loadGuildConfig(guildId);
    const eventConfig = config.eventRequests || {};

    const embed = new EmbedBuilder()
      .setColor(0x4EC5ED)
      .setTitle('🎬 Event Request Configuration')
      .addFields(
        {
          name: 'Status',
          value: eventConfig.enabled ? '✅ Enabled' : '❌ Disabled',
          inline: true
        },
        {
          name: 'Server Name',
          value: eventConfig.serverName || 'Not set',
          inline: true
        },
        {
          name: 'Moderation Channel',
          value: eventConfig.moderationChannel ? `<#${eventConfig.moderationChannel}>` : 'Not set',
          inline: true
        },
        {
          name: 'Invite URL',
          value: eventConfig.inviteUrl || 'Not shown on form',
          inline: false
        },
        {
          name: 'Allow Voice Requests',
          value: eventConfig.allowVoiceRequests !== false ? '✅ Yes' : '❌ No',
          inline: true
        },
        {
          name: 'Announce Approve/Deny',
          value: eventConfig.announceDecisions !== false ? '✅ Yes' : '❌ No',
          inline: true
        },
        {
          name: 'User Channel Selection',
          value: eventConfig.allowUserChannelSelection === true ? '✅ Enabled (users pick channels)' : '❌ Disabled (mods assign)',
          inline: true
        },
        {
          name: 'Allowed Text Channels',
          value: eventConfig.allowedTextChannels && eventConfig.allowedTextChannels.length > 0
            ? eventConfig.allowedTextChannels.map(id => `<#${id}>`).join(', ')
            : 'All text channels',
          inline: false
        },
        {
          name: 'Allowed Voice Channels',
          value: eventConfig.allowedVoiceChannels && eventConfig.allowedVoiceChannels.length > 0
            ? eventConfig.allowedVoiceChannels.map(id => `<#${id}>`).join(', ')
            : 'All voice/stage channels',
          inline: false
        }
      );

    const websiteUrl = config.website?.url;
    if (eventConfig.enabled && websiteUrl) {
      embed.addFields(
        {
          name: '🔗 Form URL',
          value: websiteUrl,
          inline: false
        },
        {
          name: '⚙️ Required Configuration',
          value: `Set \`GUILD_ID\` in \`public/config.js\` (copied from \`public/config.example.js\`) to: \`'${guildId}'\``,
          inline: false
        }
      );
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });

  } else if (group === 'event-requests' && subcommand === 'toggle') {
    const enabled = interaction.options.getBoolean('enabled');
    const config = await loadGuildConfig(guildId);

    if (!config.eventRequests) {
      config.eventRequests = {};
    }

    config.eventRequests.enabled = enabled;
    await saveGuildConfig(guildId, config);

    await interaction.reply({
      content: `✅ Event requests ${enabled ? 'enabled' : 'disabled'}.${enabled && !config.eventRequests.moderationChannel ? '\n\n⚠️ Remember to set a moderation channel with `/eggshen-config-events event-requests moderation-channel`' : ''}`,
      ephemeral: true
    });

  } else if (group === 'event-requests' && subcommand === 'moderation-channel') {
    const channel = interaction.options.getChannel('channel');

    if (!channel.isTextBased()) {
      await interaction.reply({
        content: '❌ Please select a text channel.',
        ephemeral: true
      });
      return;
    }

    const config = await loadGuildConfig(guildId);
    if (!config.eventRequests) {
      config.eventRequests = {};
    }

    config.eventRequests.moderationChannel = channel.id;
    await saveGuildConfig(guildId, config);

    await interaction.reply({
      content: `✅ Event request moderation channel set to ${channel}.`,
      ephemeral: true
    });

  } else if (group === 'event-requests' && subcommand === 'server-name') {
    const name = interaction.options.getString('name');
    const config = await loadGuildConfig(guildId);

    if (!config.eventRequests) {
      config.eventRequests = {};
    }

    config.eventRequests.serverName = name;
    await saveGuildConfig(guildId, config);

    await interaction.reply({
      content: `✅ Server display name set to **${name}** for event request form.`,
      ephemeral: true
    });

  } else if (group === 'event-requests' && subcommand === 'invite-url') {
    const url = interaction.options.getString('url');
    const config = await loadGuildConfig(guildId);

    if (!config.eventRequests) {
      config.eventRequests = {};
    }

    config.eventRequests.inviteUrl = url || null;
    await saveGuildConfig(guildId, config);

    await interaction.reply({
      content: url
        ? `✅ Discord invite URL set to: ${url}`
        : '✅ Discord invite URL cleared (will not be shown on form).',
      ephemeral: true
    });

  } else if (group === 'event-requests' && subcommand === 'allow-voice-requests') {
    const allow = interaction.options.getBoolean('allow');
    const config = await loadGuildConfig(guildId);

    if (!config.eventRequests) {
      config.eventRequests = {};
    }

    config.eventRequests.allowVoiceRequests = allow;
    await saveGuildConfig(guildId, config);

    await interaction.reply({
      content: allow
        ? '✅ Users can now request voice/stage channels for events.'
        : '❌ Voice/stage channel requests are now disabled. Events will be text-only.',
      ephemeral: true
    });

  } else if (group === 'event-requests' && subcommand === 'announce-decisions') {
    const enabled = interaction.options.getBoolean('enabled');
    const config = await loadGuildConfig(guildId);

    if (!config.eventRequests) {
      config.eventRequests = {};
    }

    config.eventRequests.announceDecisions = enabled;
    await saveGuildConfig(guildId, config);

    await interaction.reply({
      content: enabled
        ? '✅ Approving/denying a request will now also post an announcement message to the moderation channel.'
        : '❌ Approving/denying a request will only update the original request message — no separate announcement will be posted.',
      ephemeral: true
    });

  } else if (group === 'event-requests' && subcommand === 'allow-user-channel-selection') {
    const allow = interaction.options.getBoolean('allow');
    const config = await loadGuildConfig(guildId);

    if (!config.eventRequests) {
      config.eventRequests = {};
    }

    config.eventRequests.allowUserChannelSelection = allow;
    await saveGuildConfig(guildId, config);

    await interaction.reply({
      content: allow
        ? '✅ Users can now select channels in the event request form.\n\n**Form will show:** Location field and optional voice channel checkbox'
        : '❌ Channel selection disabled. Users submit basic event details only.\n\n**Moderators will:** Assign channels when approving the event',
      ephemeral: true
    });

  } else if (group === 'event-requests' && subcommand === 'set-allowed-text-channels') {
    const channelIds = interaction.options.getString('channel-ids').trim();
    const config = await loadGuildConfig(guildId);

    if (!config.eventRequests) {
      config.eventRequests = {};
    }

    if (channelIds.toLowerCase() === 'all') {
      config.eventRequests.allowedTextChannels = [];
      await saveGuildConfig(guildId, config);
      await interaction.reply({
        content: '✅ All text channels are now available for event requests.',
        ephemeral: true
      });
    } else {
      const ids = channelIds.split(',').map(id => id.trim()).filter(id => id);
      config.eventRequests.allowedTextChannels = ids;
      await saveGuildConfig(guildId, config);
      await interaction.reply({
        content: `✅ ${ids.length} text channel(s) set as allowed for event requests.\\n\\nChannels: ${ids.map(id => `<#${id}>`).join(', ')}`,
        ephemeral: true
      });
    }

  } else if (group === 'event-requests' && subcommand === 'set-allowed-voice-channels') {
    const channelIds = interaction.options.getString('channel-ids').trim();
    const config = await loadGuildConfig(guildId);

    if (!config.eventRequests) {
      config.eventRequests = {};
    }

    if (channelIds.toLowerCase() === 'all') {
      config.eventRequests.allowedVoiceChannels = [];
      await saveGuildConfig(guildId, config);
      await interaction.reply({
        content: '✅ All voice/stage channels are now available for event requests.',
        ephemeral: true
      });
    } else {
      const ids = channelIds.split(',').map(id => id.trim()).filter(id => id);
      config.eventRequests.allowedVoiceChannels = ids;
      await saveGuildConfig(guildId, config);
      await interaction.reply({
        content: `✅ ${ids.length} voice/stage channel(s) set as allowed for event requests.\\n\\nChannels: ${ids.map(id => `<#${id}>`).join(', ')}`,
        ephemeral: true
      });
    }

  } else if (group === 'event-requests' && subcommand === 'get-link') {
    const config = await loadGuildConfig(guildId);
    const eventConfig = config.eventRequests || {};
    const websiteUrl = config.website?.url;

    if (!eventConfig.enabled) {
      await interaction.reply({
        content: '❌ Event requests are disabled. Enable them with `/eggshen-config-events event-requests toggle enabled:true`',
        ephemeral: true
      });
      return;
    }

    if (!websiteUrl) {
      await interaction.reply({
        content: '❌ No website URL configured. Set it with `/eggshen-config-website url`',
        ephemeral: true
      });
      return;
    }

    const serverName = eventConfig.serverName || interaction.guild.name;

    const embed = new EmbedBuilder()
      .setColor(0x4EC5ED)
      .setTitle('🎬 Event Request Form')
      .setDescription(`Your event request form is configured for **${serverName}**:`)
      .addFields(
        {
          name: '🔗 Form URL',
          value: websiteUrl,
          inline: false
        },
        {
          name: '⚙️ Configuration Required',
          value: `Before users can access the form, copy \`public/config.example.js\` to \`public/config.js\` on your web server and set:\n\`\`\`\nwindow.EGG_SHEN_CONFIG = {\n  GUILD_ID: '${guildId}',\n};\n\`\`\``,
          inline: false
        }
      )
      .setFooter({ text: 'Requests will be sent to the moderation channel for approval' });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

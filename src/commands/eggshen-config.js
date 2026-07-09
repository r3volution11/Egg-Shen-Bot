import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { loadGuildConfig, saveGuildConfig, toggleService, setEmoji, updateStatsTracking, getCommandPermissions, updateCommandPermission, isAdmin } from '../utils/guildConfig.js';
import { clearStats } from '../utils/statsTracker.js';
import { getGuildImageStats, getUserImageStats, resetUserImageUsage, resetGuildImageUsage } from '../utils/aiImageTracker.js';

export const data = new SlashCommandBuilder()
  .setName('eggshen-config')
  .setDescription('Configure Egg Shen settings for this server (Admin/Moderator only)')
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
  )
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
  )
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
  // ========== MODERATION GROUP ==========
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
  )
  // ========== EVENT REQUESTS GROUP ==========
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
          .setName('website-url')
          .setDescription('Set the website URL where event requests can be submitted')
          .addStringOption(option =>
            option
              .setName('url')
              .setDescription('Website URL (e.g., https://yourdomain.com)')
              .setRequired(true)
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
        value: '**View config:** `/eggshen-config settings view`\n**Toggle services:** `/eggshen-config settings toggle`\n**Set emoji:** `/eggshen-config settings emoji`\n**Set region:** `/eggshen-config settings region`\n**Set max results:** `/eggshen-config settings max-results`\n**Toggle stats:** `/eggshen-config stats toggle`\n**Clear stats:** `/eggshen-config stats clear`\n**Toggle commands:** `/eggshen-config commands toggle`\n**Toggle notifications:** `/eggshen-config notifications toggle`\n**Watch party channels:** `/eggshen-config watch-party add/remove/list`\n**Rate limits:** `/eggshen-config rate-limit toggle/global/command/view`\n**Moderation:** `/eggshen-config moderation toggle/whitelist-toggle/user-cooldown`',
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
  } else if (group === 'watch-party' && subcommand === 'add') {
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
        value: '**Rate limiting:** `/eggshen-config rate-limit-toggle`\n' +
               '**Moderation:** `/eggshen-config moderation-toggle`',
        inline: false,
      })
      .addFields({
        name: 'Per-User Limits',
        value: '**Set global limit:** `/eggshen-config rate-limit-global`\n' +
               '**Set command limit:** `/eggshen-config rate-limit-command`\n' +
               '**Toggle moderator bypass:** `/eggshen-config rate-limit-bypass`\n' +
               '**Clear user limits:** `/eggshen-config rate-limit-clear`',
        inline: false,
      })
      .addFields({
        name: 'Anti-Flood Protection',
        value: '**Server-wide limiting:** `/eggshen-config rate-limit-guild-wide`\n' +
               '**Pattern detection:** `/eggshen-config pattern-detection`\n' +
               '**View suspicious activity:** `/eggshen-config suspicious-activity`\n' +
               '**View abuse log:** `/eggshen-config abuse-log`',
        inline: false,
      })
      .addFields({
        name: 'Moderation Tools',
        value: '**User cooldowns:** `/eggshen-config user-cooldown / user-cooldown-remove / user-cooldown-list`\n' +
               '**Whitelist:** `/eggshen-config whitelist-toggle / whitelist-add-role / whitelist-add-user / whitelist-list`\n' +
               '**Auto-ban:** `/eggshen-config auto-ban-toggle / auto-ban-threshold / auto-ban-list`',
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
      ? `\n\nThe bot will now monitor for suspicious patterns like:\n• Multiple accounts running identical commands\n• Coordinated burst attacks from new accounts\n\nFlags when ${config.rateLimits.patternDetection.minUsers}+ users show suspicious behavior.\n\nUse \`/eggshen-config suspicious-activity\` to view detected patterns.`
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
  
  // ========== AI IMAGES GROUP ==========
  } else if (group === 'ai-images' && subcommand === 'view') {
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

    const guildStats = getGuildImageStats(guildId);
    const userStats = getUserImageStats(guildId, interaction.user.id);
    
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
      .setFooter({ text: 'Use /eggshen-config ai-images to adjust settings' })
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
        content: `ℹ️ No users are currently whitelisted for unlimited AI images.\n\nUse \`/eggshen-config ai-images whitelist-add\` to grant unlimited access to contributors or premium users.`,
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

  } else if (group === 'moderation' && subcommand === 'toggle') {
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
      ? '\n\nModeration features are now active:\n• Whitelist mode (role/user based access control)\n• Temporary user cooldowns (manual restrictions)\n• Auto-ban threshold notifications\n\nConfigure each feature using `/eggshen-config` commands.'
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
        content: '❌ Moderation features are disabled. Enable them with `/eggshen-config moderation-toggle enabled:true`',
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
      .setFooter({ text: 'Use /eggshen-config user-cooldown-remove to lift a cooldown' });
    
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
        content: '❌ Moderation features are disabled. Enable them with `/eggshen-config moderation-toggle enabled:true`',
        ephemeral: true,
      });
      return;
    }
    
    config.moderation.whitelist.enabled = enabled;
    await saveGuildConfig(guildId, config);
    
    const statusText = enabled ? 'enabled' : 'disabled';
    const emoji = enabled ? '🔒' : '✅';
    const description = enabled
      ? '\n\n⚠️ **Only whitelisted users and roles can now use bot commands!**\n\nAdd allowed roles/users:\n• `/eggshen-config whitelist-add-role`\n• `/eggshen-config whitelist-add-user`\n\nAdministrators and moderators are always allowed.'
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
        content: '❌ Moderation features are disabled. Enable them with `/eggshen-config moderation-toggle enabled:true`',
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
        content: '❌ Moderation features are disabled. Enable them with `/eggshen-config moderation-toggle enabled:true`',
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
        content: '❌ No roles or users in the whitelist.\n\nAdd them with:\n• `/eggshen-config whitelist-add-role`\n• `/eggshen-config whitelist-add-user`',
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
        content: '❌ Moderation features are disabled. Enable them with `/eggshen-config moderation-toggle enabled:true`',
        ephemeral: true,
      });
      return;
    }
    
    config.moderation.autoBan.enabled = enabled;
    await saveGuildConfig(guildId, config);
    
    const statusText = enabled ? 'enabled' : 'disabled';
    const emoji = enabled ? '✅' : '❌';
    const description = enabled
      ? `\n\nThe bot will now warn users when they exceed ${config.moderation.autoBan.violationCount} rate limit violations within ${config.moderation.autoBan.windowHours} hours.\n\nConfigure threshold: \`/eggshen-config auto-ban-threshold\``
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
        content: '❌ Moderation features are disabled. Enable them with `/eggshen-config moderation-toggle enabled:true`',
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
        content: '❌ Moderation features are disabled. Enable them with `/eggshen-config moderation-toggle enabled:true`',
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
  
  // ========== EVENT REQUESTS GROUP ==========
  } else if (group === 'event-requests' && subcommand === 'view') {
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
          name: 'Website URL',
          value: eventConfig.websiteUrl || 'Not set',
          inline: false
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
    
    if (eventConfig.enabled && eventConfig.websiteUrl) {
      embed.addFields(
        {
          name: '🔗 Form URL',
          value: eventConfig.websiteUrl,
          inline: false
        },
        {
          name: '⚙️ Required Configuration',
          value: `Set \`GUILD_ID\` in \`public/app.js\` to: \`'${guildId}'\``,
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
      content: `✅ Event requests ${enabled ? 'enabled' : 'disabled'}.${enabled && !config.eventRequests.moderationChannel ? '\n\n⚠️ Remember to set a moderation channel with `/eggshen-config event-requests moderation-channel`' : ''}`,
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
    
  } else if (group === 'event-requests' && subcommand === 'website-url') {
    const url = interaction.options.getString('url');
    const config = await loadGuildConfig(guildId);
    
    if (!config.eventRequests) {
      config.eventRequests = {};
    }
    
    config.eventRequests.websiteUrl = url;
    await saveGuildConfig(guildId, config);
    
    await interaction.reply({
      content: `✅ Website URL set to: ${url}\n\n⚠️ **Important:** Update \`GUILD_ID\` in your \`public/app.js\` file to: \`'${guildId}'\``,
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
    
    if (!eventConfig.enabled) {
      await interaction.reply({
        content: '❌ Event requests are disabled. Enable them with `/eggshen-config event-requests toggle enabled:true`',
        ephemeral: true
      });
      return;
    }
    
    if (!eventConfig.websiteUrl) {
      await interaction.reply({
        content: '❌ No website URL configured. Set it with `/eggshen-config event-requests website-url`',
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
          value: eventConfig.websiteUrl,
          inline: false
        },
        {
          name: '⚙️ Configuration Required',
          value: `Before users can access the form, you must set the \`GUILD_ID\` in \`public/app.js\` to:\n\`\`\`\nconst GUILD_ID = '${guildId}';\n\`\`\``,
          inline: false
        }
      )
      .setFooter({ text: 'Requests will be sent to the moderation channel for approval' });
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

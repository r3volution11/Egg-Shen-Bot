import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { permissionsOf } from './memberPermissions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Overridable via GUILD_CONFIGS_DIR so parallel Jest workers (each test file
// runs in its own process) can point at a unique directory instead of racing
// on the same real one — unset in production, where the default applies.
const configDir = process.env.GUILD_CONFIGS_DIR || path.join(__dirname, '../../guild_configs');

// Default configuration for new guilds
const defaultConfig = {
  services: {
    imdb: true,
    letterboxd: true,
    trakt: true,
    rottenTomatoes: true,
    metacritic: true,
    justWatch: true,
  },
  emojis: {
    imdb: '',
    letterboxd: '',
    trakt: '',
    rtCritics: '',
    metacritic: '',
    justWatch: '',
  },
  region: 'US', // Default region for streaming availability (ISO 3166-1 country code)
  maxSearchResults: 20, // Maximum number of search results to display in selection menus (1-25, Discord's limit). Read through searchResultLimit() in selectMenuLimits.js: a config saved before the cap can hold up to 50.
  maxTimerDurationMinutes: 360, // Fallback auto-stop duration (6 hours) for timers with NO real duration — no manual duration given and nothing auto-detected. An explicit or auto-detected duration is never affected by this value.
  maxTimerDurationUnlimited: false, // When true, a timer with no real duration just runs forever (like /timer autostop disable) instead of getting the fallback above
  timerCeilingMinutes: null, // Optional hard ceiling applied to explicit/detected timer durations too (start, adjust, autostop enable, extend). Off by default — see timerCeilingEnabled.
  timerCeilingEnabled: false, // When true, timerCeilingMinutes is enforced on explicit/detected durations. Off by default: timers can be started at any duration unless a server opts into this.
  allowAnyonePauseStopTimer: false, // When true, any member (not just the timer's starter or an admin/mod) can pause/resume/stop a timer. adjust/autostop and the expiry-warning extend button remain starter-or-admin-only regardless of this flag.
  stats: {
    enabled: true,
    trackMovies: true,
    trackShows: true,
    trackEpisodes: true,
    trackGames: true,
    trackBoardGames: true,
    trackBooks: true,
  },
  commandPermissions: {
    enabled: true, // Master switch - when false, only admin commands work
    movie: true,
    tv: true,
    episode: true,
    game: true,
    boardgame: true,
    book: true,
    survey: true,
    soundtrack: true,
    bracket: true,
    quote: true,
    suggestQuote: true,
    watchlist: true,
    potion: true,
    foodfight: true,
    doom: true,
    rescue: true,
    siege: true, // R5: the fifth game; its weapons also need their own games on
    // 2.76.0: /six-demon-bag. Off for members, Chi isn't earned and no charm
    // acts (gameScores.getGameSettings' `magic`): the economy, not just the command
    magic: true,
    escape: true,
  },
  notifications: {
    restartAnnouncements: false, // Send announcements when bot restarts with active timers
  },
  watchlist: {
    maxSize: 100, // Maximum titles allowed on the server watchlist
    modOnlyAdd: false, // When true, only admins/moderators can add titles
    autoAddChampion: false, // Add a tournament winner to the watchlist automatically
    autoRemoveWatched: true, // Drop a title from the watchlist when logged via /watched
  },
  watchPartyChannels: [], // Channel IDs where watch party timers can auto-detect event titles
  // How /timer start uses a watch-party channel's active scheduled event:
  //   'ask' (default) — look the title up. When it's identified confidently
  //       (one match, a landslide, or a resolvable episode range) the
  //       duration is set and the timer just starts. When it's ambiguous,
  //       offer two buttons — look up the title, or start right now —
  //       instead of dropping the user into a 25-option list.
  //   'full' — same, but an ambiguous title goes straight to that list.
  //   'off' — ignore scheduled events entirely; /timer start needs a label.
  // Always read it through getAutoDetectMode() below, never directly —
  // configs written before this key existed simply lack it.
  watchPartyAutoDetectMode: 'ask',
  // A short "starting soon" card in the event's channel 10 minutes before
  // every scheduled event (announcementScheduler.js). Read through
  // getStartingSoonEnabled: configs written before this key lack it.
  announceStartingSoon: true,
  // Extra minutes added per episode when a multi-episode watch party's
  // duration is calculated. TMDB reports ad-free runtimes, so a 25-minute
  // episode on an ad-supported service (Tubi, Pluto) really runs 33-35 —
  // across four episodes that shortfall is enough to stop the timer
  // mid-party. Default 5 covers a typical break load without overshooting a
  // clean source; set higher for a server that always watches with ads.
  // Read through getEpisodeBufferMinutes() below, never directly.
  episodeBufferMinutes: 5,
  // AI-written announcement text (/announce). Separate from rateLimits.aiImages,
  // which governs image generation — text costs a fraction of an image, so a
  // server may want one without the other. A manually supplied `message` always
  // posts verbatim regardless of this setting; it only controls whether the bot
  // writes the text when no message was given.
  // Read through getAiTextEnabled() below, never directly.
  aiText: {
    enabled: true,
  },
  administrators: [], // Will be populated with server owner/admins
  rateLimits: {
    enabled: true, // Master switch for rate limiting
    bypassForModerators: true, // Allow moderators/admins to bypass rate limits
    global: {
      maxRequests: 1, // Maximum number of requests
      windowSeconds: 20, // Time window in seconds
    },
    commands: {
      // Per-command overrides (optional)
      // 'movie': { maxRequests: 3, windowSeconds: 30 },
      // 'episode-list': { maxRequests: 2, windowSeconds: 60 },
      // /suggest-quote writes into a moderator-facing review queue (and
      // posts to a moderation channel, if configured) rather than just
      // returning a search result — tighter than the generic global default
      // so one user can't quickly flood the queue/channel.
      'suggest-quote': { maxRequests: 1, windowSeconds: 60 },
      // /recommend fans out to several TMDB endpoints and may make an
      // OpenAI call, so it costs far more per invocation than a lookup.
      'recommend': { maxRequests: 2, windowSeconds: 120 },
    },
    guildWide: {
      enabled: true, // Server-wide rate limiting (prevents multi-account flooding)
      maxRequests: 10, // Maximum total commands across all users
      windowSeconds: 60, // Time window in seconds
    },
    patternDetection: {
      enabled: true, // Detect suspicious coordinated activity
      windowSeconds: 60, // Window for detecting patterns
      minUsers: 3, // Minimum users needed to flag as suspicious
    },
    aiImages: {
      enabled: true, // Master switch for AI image rate limiting
      perUserCooldown: 300, // Cooldown between images per user (in seconds, 300 = 5 minutes)
      perUserDailyLimit: 10, // Maximum images per user per day
      perGuildDailyLimit: 50, // Maximum images per guild per day
      adminsBypassCooldown: true, // Admins/mods bypass cooldown (but not daily limits)
      costPerImage: 0.04, // Cost tracking (in USD)
      whitelistedUsers: [], // User IDs who can generate unlimited images (e.g., bot contributors/premium users)
    },
  },
  moderation: {
    enabled: false, // Master switch for all moderation features
    whitelist: {
      enabled: false, // Whitelist mode - only allow specific roles/users
      allowedRoles: [], // Role IDs that can use commands
      allowedUsers: [], // User IDs that can use commands
    },
    autoBan: {
      enabled: false, // Auto-notify when users exceed violation threshold
      violationCount: 20, // Number of violations to trigger notification
      windowHours: 24, // Time window in hours
    },
  },
  potionResponses: {
    // Custom potion responses by type
    // Format: { type: [response1, response2, ...] }
    // Responses use {giver} and {receiver} as placeholders
    // Example: { health: ["Custom healing message!"] }
  },
  potionThemes: null, // null = all themes active, or array of active theme keys
  eventRequests: {
    enabled: false, // Master switch for event request system
    moderationChannel: null, // Channel ID where requests are sent for approval
    serverName: null, // Display name shown on event request form
    inviteUrl: null, // Optional Discord invite link shown on form
    allowUserChannelSelection: false, // Allow users to select channels in form (default: moderators choose during approval)
    allowVoiceRequests: true, // Allow users to request voice/stage channels for events (only applies if allowUserChannelSelection is true)
    allowedTextChannels: [], // Array of channel IDs users can select for text location (empty = all text channels)
    allowedVoiceChannels: [], // Array of channel IDs users can select for voice (empty = all voice/stage channels)
    announceDecisions: true, // Post a new message to the moderation channel when a request is approved/denied, in addition to editing the original request embed in place
    announcementChannel: null, // Where approved events are announced to members: null = off, 'event' = the event's own text channel, else a channel ID. Read via getAnnouncementChannelSetting()
  },
  quoteSuggestions: {
    moderationChannel: null, // Channel ID where /suggest-quote submissions are sent for approval (null = no Discord notification, still reviewable via /quotes-admin)
    maxPendingPerUser: 3, // A user can have at most this many suggestions awaiting review at once (per guild) — bounds queue/moderation-channel flooding independent of the per-command rate limit
  },
  website: {
    url: null, // General URL where this guild's web presence is hosted (the event-request form today; may grow to cover more) — set via /eggshen-config-website url
    theme: 'default', // Named theme (key in scripts/web-themes.json) applied to this guild's web pages, crop links, and quotes-admin links — set via /eggshen-config-website theme
  },
};

/**
 * Ensure the config directory exists
 */
async function ensureConfigDir() {
  try {
    await fs.access(configDir);
  } catch {
    await fs.mkdir(configDir, { recursive: true });
  }
}

/**
 * Get the config file path for a guild
 */
function getConfigPath(guildId) {
  return path.join(configDir, `${guildId}.json`);
}

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * The defaults a SAVED config is filled from: defaultConfig, except that
 * rate limiting stays off. A server that has never saved a config gets
 * defaultConfig itself, rate limiting on (loadGuildConfig).
 *
 * Why: before defaults were filled in (2.76.1), a saved config without
 * `rateLimits.enabled` read as rate limiting OFF (checkRateLimit tests it
 * for truthiness), and both live servers were in that state, one with no
 * `rateLimits` at all, the other with only `rateLimits.aiImages`. Filling
 * the default would have switched rate limiting on for them overnight, and
 * members who had never been held to one command per 20 seconds would
 * start being refused. Doug's call (2026-11-07): preserve today's behaviour.
 * Such a server keeps it off until an admin turns it on
 * (/eggshen-config-watch-party rate-limit toggle). An explicit true or false
 * is kept as saved, as every value is, and every other default still fills
 * in, the rest of rateLimits included: those keys do nothing while the
 * switch is off, and are ready when it goes on. (bypassForModerators is the
 * one that still acts: it also lets admins and moderators skip manual
 * cooldowns, which apply whenever moderation is on.)
 *
 * Once such a config is saved for any reason it is saved whole, so the
 * `enabled: false` this adds is written and the file says what it means.
 */
const savedConfigDefaults = structuredClone(defaultConfig);
savedConfigDefaults.rateLimits.enabled = false;

/**
 * A saved config with the defaults filled in under it: every key the file
 * lacks reads as its default, and every key the file has keeps its value.
 * The defaults are defaultConfig's, but for one exception: a saved config
 * that never set `rateLimits.enabled` keeps rate limiting off (see
 * savedConfigDefaults just above).
 *
 * There are no config migrations, so a config saved before a key existed
 * simply lacks it, and code that read it directly saw `undefined`, which
 * usually meant "off". On those servers the Metacritic badge never showed
 * (and `settings toggle`/`emoji` refused it), /recommend and /suggest-quote
 * fell back to the general rate limit, and guild-wide limits and pattern
 * detection were off, all while a server set up later got them. Older
 * configs now read like a new server's, apart from that one switch.
 *
 * The rules:
 *  - Only where the default and the saved value are both objects does it
 *    recurse. An array is used as saved, never merged item by item (a
 *    whitelist of ids stays exactly the ids an admin listed).
 *  - A value that is present is kept, whatever it is: `false`, `0`, `''`,
 *    and `null`, which means "set to nothing" (a channel cleared, all potion
 *    themes on), not "missing".
 *  - Keys defaultConfig doesn't have are kept untouched: the top-level
 *    `aiImages` switch (a server that turned AI images off keeps them off),
 *    and maps keyed by id or name stored outside it (doomLines, games,
 *    website.botUrl, a per-command limit for /movie) come back exactly as
 *    saved. The maps
 *    inside it either default to empty (potionResponses), so nothing is
 *    added, or hold built-in entries every server should have:
 *    rateLimits.commands gains the default /recommend and /suggest-quote
 *    limits when the file lacks them, and keeps every other entry.
 *
 * Defaults are cloned, never shared: a caller that changes the result and
 * saves it must not change defaultConfig for every other server.
 *
 * Nothing is written here. A config with defaults filled in is saved only
 * when something changes it anyway, through saveGuildConfig, and then it is
 * saved whole, defaults included. That is what a new server's config already
 * is: its first save writes all of defaultConfig. So an older server ends up
 * in the same state a new one does, without a write on every read.
 *
 * @param {object} saved - the parsed file
 * @param {object} [defaults] - savedConfigDefaults unless given
 * @returns {object} a new object; `saved` is not changed
 */
export function withDefaults(saved, defaults = savedConfigDefaults) {
  if (!isPlainObject(saved)) return structuredClone(defaults);
  const merged = { ...saved };
  for (const [key, fallback] of Object.entries(defaults)) {
    if (!Object.prototype.hasOwnProperty.call(saved, key) || saved[key] === undefined) {
      merged[key] = structuredClone(fallback);
    } else if (isPlainObject(fallback) && isPlainObject(saved[key])) {
      merged[key] = withDefaults(saved[key], fallback);
    }
  }
  return merged;
}

/**
 * Every key a saved config lacks that now reads as its default, outermost
 * first: a missing object is one entry with its whole default, not one per
 * key inside it. The value is what withDefaults gives it, so a missing
 * `rateLimits.enabled` is listed as false. Used by
 * scripts/config-defaults-report.js.
 *
 * @param {object} saved - the parsed file
 * @returns {{ path: string, value: * }[]}
 */
export function missingDefaults(saved, defaults = savedConfigDefaults, prefix = '') {
  if (!isPlainObject(saved)) return [{ path: prefix || '(whole config)', value: defaults }];
  const missing = [];
  for (const [key, fallback] of Object.entries(defaults)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (!Object.prototype.hasOwnProperty.call(saved, key) || saved[key] === undefined) {
      missing.push({ path, value: fallback });
    } else if (isPlainObject(fallback) && isPlainObject(saved[key])) {
      missing.push(...missingDefaults(saved[key], fallback, path));
    }
  }
  return missing;
}

/**
 * Load guild configuration: the saved file with the defaults filled in under
 * it (withDefaults; rate limiting stays off if the file never set it), or
 * defaultConfig, rate limiting on, for a server that never saved one.
 */
export async function loadGuildConfig(guildId) {
  await ensureConfigDir();
  const configPath = getConfigPath(guildId);

  try {
    const data = await fs.readFile(configPath, 'utf8');
    return withDefaults(JSON.parse(data));
  } catch (error) {
    // If config doesn't exist, return default. Must be a deep clone —
    // a shallow `{ ...defaultConfig }` shares nested objects (commandPermissions,
    // services, rateLimits, etc.) by reference across every guild that hasn't
    // saved a config yet, so the first update*()/toggle*() call for ANY
    // not-yet-configured guild would mutate defaultConfig itself and silently
    // change the "default" for every other guild for the life of the process.
    return structuredClone(defaultConfig);
  }
}

/**
 * Save guild configuration
 */
export async function saveGuildConfig(guildId, config) {
  await ensureConfigDir();
  const configPath = getConfigPath(guildId);
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
}

/**
 * The address links the bot posts for this server should use: the crop
 * page, the tournament setup form, the quotes admin page.
 *
 * Per server (`/eggshen-config-website bot-url`), so one bot can serve a
 * test server on one domain and a live server on another, and testing takes
 * the same path the live server does. Falls back to PUBLIC_BOT_URL, which
 * used to be the only option — every server's links went to one domain.
 *
 * Separate from `website.url` on purpose: that is where the event-request
 * form is hosted, which for a self-hosted bot can be a static site that
 * doesn't forward anything to the bot.
 *
 * @param {object} guildConfig
 * @returns {string|null} Origin with no trailing slash, or null if neither is set
 */
export function getPublicBotUrl(guildConfig) {
  const url = guildConfig?.website?.botUrl || process.env.PUBLIC_BOT_URL || '';
  return url ? url.replace(/\/+$/, '') : null;
}

/**
 * Extra minutes to allow per episode in a multi-episode watch party.
 *
 * Normalized rather than read directly: configs written before this key
 * existed simply lack it, and a hand-edited or nonsense value must land on
 * the default rather than producing a NaN duration.
 *
 * @param {object} guildConfig
 * @returns {number} 0-30
 */
export function getEpisodeBufferMinutes(guildConfig) {
  const value = Number(guildConfig?.episodeBufferMinutes);
  if (!Number.isFinite(value) || value < 0) return 5;
  return Math.min(30, Math.round(value));
}

const AUTO_DETECT_MODES = new Set(['ask', 'full', 'off']);

/**
 * How much /timer start should do with a watch-party channel's scheduled
 * event — see watchPartyAutoDetectMode in defaultConfig for what each mode
 * means.
 *
 * Normalized rather than read directly because there are no config
 * migrations: every guild configured before this key existed simply lacks
 * it, and an unset (or hand-edited, or garbage) value has to land on the
 * default rather than silently disabling auto-detection.
 *
 * @param {object} guildConfig
 * @returns {'ask'|'full'|'off'}
 */
/**
 * Whether the server gets an automatic "starting soon" card 10 minutes
 * before each scheduled event. On unless explicitly turned off, so servers
 * whose config predates the switch get it.
 */
export function getStartingSoonEnabled(guildConfig) {
  return guildConfig?.announceStartingSoon !== false;
}

export function getAutoDetectMode(guildConfig) {
  const mode = guildConfig?.watchPartyAutoDetectMode;
  return AUTO_DETECT_MODES.has(mode) ? mode : 'ask';
}

/**
 * Whether this server wants AI-written *text* (announcement flavor text).
 *
 * Distinct from `aiImages.enabled`, which governs image generation — a server
 * may well want one and not the other, and they cost very different amounts.
 *
 * Defaults to TRUE so nothing changes for a server already relying on AI
 * announcements: before this key existed, AI text was used whenever the
 * operator had configured an API key. Only an explicit `false` turns it off.
 * Normalized because there are no config migrations, so an unset or
 * hand-edited value has to land on the default.
 *
 * Note this is the server's *preference*, not a capability check — the
 * operator may not have an API key at all. Callers need both this and
 * `isOpenAIAvailable()`.
 *
 * @param {object} guildConfig
 * @returns {boolean}
 */
/**
 * Whether /eggshen-ask may use AI to write its answers on this server — its
 * own switch (/eggshen-config-ai ai-ask), separate from AI announcement text.
 * Defaults to on, like getAiTextEnabled; it still needs the bot's OpenAI key,
 * and without it answers come from docs search alone. Only an explicit false
 * turns it off (no config migrations).
 */
export function getAiAskEnabled(guildConfig) {
  return guildConfig?.aiAsk?.enabled !== false;
}

export function getAiTextEnabled(guildConfig) {
  return guildConfig?.aiText?.enabled !== false;
}

/**
 * Check if a user is an administrator or moderator
 * Users with these Discord permissions are considered admins for bot configuration:
 * - Administrator (full server control)
 * - ManageGuild (Manage Server - can modify server settings)
 * - ModerateMembers (Timeout Members - typical moderator permission)
 * - KickMembers (can kick users)
 * - BanMembers (can ban users)
 */
export function isAdmin(member) {
  // permissionsOf, not member.permissions: interaction.member is a raw API
  // member when discord.js hasn't cached it, and its `permissions` is a
  // bitfield string with no .has() (see memberPermissions.js).
  const perms = permissionsOf(member);
  if (!perms) return false;
  
  // Check Discord permissions - admins and typical moderator permissions
  return perms.has('Administrator') ||
         perms.has('ManageGuild') ||
         perms.has('ModerateMembers') ||
         perms.has('KickMembers') ||
         perms.has('BanMembers');
}

/**
 * Check if a user is a true administrator (not just moderator)
 */
export function isTrueAdmin(member) {
  const perms = permissionsOf(member); // either member shape, as isAdmin
  if (!perms) return false;
  return perms.has('Administrator') || perms.has('ManageGuild');
}

/**
 * Check if a user is a moderator (has mod permissions but not admin)
 */
export function isModerator(member) {
  const perms = permissionsOf(member); // either member shape, as isAdmin
  if (!perms) return false;
  
  const hasModPerms = perms.has('ModerateMembers') ||
                      perms.has('KickMembers') ||
                      perms.has('BanMembers');
  const hasAdminPerms = perms.has('Administrator') ||
                        perms.has('ManageGuild');
  
  return hasModPerms && !hasAdminPerms;
}

/**
 * Update service toggle
 */
export async function toggleService(guildId, serviceName, enabled) {
  // Validated against the defaults, as updateCommandPermission is: a config
  // saved before a service existed (Metacritic, 2026-09) lacked its key, and
  // checking the saved object refused the toggle on every such server.
  if (!Object.prototype.hasOwnProperty.call(defaultConfig.services, serviceName)) {
    return false;
  }

  const config = await loadGuildConfig(guildId);
  config.services ??= {};
  config.services[serviceName] = enabled;
  await saveGuildConfig(guildId, config);
  return true;
}

/**
 * Get enabled services for a guild
 */
export async function getEnabledServices(guildId) {
  const config = await loadGuildConfig(guildId);
  return config.services;
}

/**
 * Update emoji for a service
 */
export async function setEmoji(guildId, serviceName, emojiId) {
  // Against the defaults, for the same reason as toggleService
  if (!Object.prototype.hasOwnProperty.call(defaultConfig.emojis, serviceName)) {
    return false;
  }

  const config = await loadGuildConfig(guildId);
  config.emojis ??= {};
  config.emojis[serviceName] = emojiId;
  await saveGuildConfig(guildId, config);
  return true;
}

/**
 * Get emojis configuration for a guild
 */
export async function getEmojis(guildId) {
  const config = await loadGuildConfig(guildId);
  return config.emojis;
}

/**
 * Get stats configuration for a guild
 */
export async function getStatsConfig(guildId) {
  const config = await loadGuildConfig(guildId);
  return config.stats;
}

/**
 * Update stats tracking setting
 */
export async function updateStatsTracking(guildId, setting, enabled) {
  const config = await loadGuildConfig(guildId);
  
  if (setting === 'enabled') {
    config.stats.enabled = enabled;
  } else if (setting === 'trackMovies') {
    config.stats.trackMovies = enabled;
  } else if (setting === 'trackShows') {
    config.stats.trackShows = enabled;
  } else if (setting === 'trackEpisodes') {
    config.stats.trackEpisodes = enabled;
  } else if (setting === 'trackGames') {
    config.stats.trackGames = enabled;
  } else if (setting === 'trackBoardGames') {
    config.stats.trackBoardGames = enabled;
  } else if (setting === 'trackBooks') {
    config.stats.trackBooks = enabled;
  } else {
    return false;
  }
  
  await saveGuildConfig(guildId, config);
  return true;
}

/**
 * Get command permissions configuration for a guild
 */
export async function getCommandPermissions(guildId) {
  const config = await loadGuildConfig(guildId);
  return config.commandPermissions;
}

/**
 * Update command permission setting
 */
export async function updateCommandPermission(guildId, setting, enabled) {
  const config = await loadGuildConfig(guildId);

  // Any key of defaultConfig.commandPermissions (movie, tv, episode, game,
  // boardgame, book, survey, soundtrack, bracket, enabled, ...) is a valid
  // toggle, so it stays in sync as command types are added there.
  //
  // Validate against the DEFAULTS, never the saved object: there are no
  // migrations, so a server configured before /doom, /foodfight or /escape
  // existed has no such key saved, and checking its own keys refused the
  // toggle on every one of those servers. canUseCommand already treats a
  // missing key as "on", so writing it here is all the toggle needs.
  if (!Object.prototype.hasOwnProperty.call(defaultConfig.commandPermissions, setting)) {
    return false;
  }

  config.commandPermissions ??= {};
  config.commandPermissions[setting] = enabled;
  await saveGuildConfig(guildId, config);
  return true;
}

/**
 * Check if a user can use a specific command
 * Admins can always use commands
 */
export async function canUseCommand(guildId, member, commandName) {
  // Admins can always use commands
  if (isAdmin(member)) {
    return true;
  }
  
  const config = await loadGuildConfig(guildId);
  
  // If commands are disabled entirely, regular users can't use them
  if (!config.commandPermissions.enabled) {
    return false;
  }
  
  // Check specific command permission, for any command type that has a
  // configurable toggle (see defaultConfig.commandPermissions above).
  if (Object.prototype.hasOwnProperty.call(config.commandPermissions, commandName)) {
    return config.commandPermissions[commandName] === true;
  }

  // Admin-only commands (eggshen-config, eggshen-stats) are handled by isAdmin check above
  // Commands with no configurable toggle (eggshen-help) are always allowed
  return true;
}

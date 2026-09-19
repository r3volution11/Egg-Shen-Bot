/**
 * Timer Management System
 * Manages channel-specific timers (one active timer per channel)
 * Timers are persisted to disk and restored on bot restart
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { isAdmin } from './guildConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store active timers: { channelId: { startTime, userId, username, label, duration, endTime, autoStopTimeout } }
const activeTimers = new Map();

// Path to persist timers
// Overridable via ACTIVE_TIMERS_FILE so parallel Jest workers (each test file
// runs in its own process) can point at a unique file instead of racing on the
// same real one — unset in production, where the default applies.
const TIMERS_FILE = process.env.ACTIVE_TIMERS_FILE || path.join(__dirname, '../../active_timers.json');

/**
 * Save active timers to disk
 */
async function saveTimers() {
  try {
    const timersData = {};
    for (const [channelId, timer] of activeTimers.entries()) {
      // Exclude autoStopTimeout which can't be serialized
      const { autoStopTimeout, ...serializableTimer } = timer;
      timersData[channelId] = serializableTimer;
    }
    await fs.writeFile(TIMERS_FILE, JSON.stringify(timersData, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving timers:', error);
  }
}

/**
 * Load timers from disk on bot startup
 * @returns {Map} - Map of channelId to timer data for channels that had active timers
 */
export async function loadTimers() {
  try {
    const data = await fs.readFile(TIMERS_FILE, 'utf8');
    const timersData = JSON.parse(data);
    
    const restoredTimers = new Map();
    
    for (const [channelId, timer] of Object.entries(timersData)) {
      activeTimers.set(channelId, timer);
      restoredTimers.set(channelId, timer);
    }
    
    console.log(`✓ Restored ${restoredTimers.size} active timer(s) from previous session`);
    return restoredTimers;
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist yet, that's fine
      return new Map();
    }
    console.error('Error loading timers:', error);
    return new Map();
  }
}

/**
 * Handle a timer's auto-stop firing: stop it, fetch the channel, and post the
 * completion message (auto-logged to watch history if labeled, otherwise a
 * manual-log button). Shared by every place that schedules an auto-stop
 * timeout, so this logic only needs to be correct in one place.
 * @param {string} channelId - Discord channel ID
 * @param {object} client - Discord client
 */
async function handleAutoStopFired(channelId, client) {
  const result = stopTimer(channelId);

  if (!result) {
    return;
  }

  try {
    const channel = await client.channels.fetch(channelId);
    if (channel && channel.isTextBased()) {
      if (result.label) {
        await autoLogTimerToWatchHistory(
          channel,
          client,
          result.label,
          result.elapsedFormatted,
          result.username,
          channelId,
          result.userId,
          result
        );
      } else {
        // Timer without label - show button to manually log
        const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');

        const embed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('⏰ Timer Completed 🛑')
          .setDescription('Timer has completed')
          .addFields(
            {
              name: 'Total Time',
              value: result.elapsedFormatted,
              inline: true,
            },
            {
              name: 'Started by',
              value: result.username,
              inline: true,
            }
          )
          .setFooter({ text: 'Use the button below to log what you watched • Use /timer pause during breaks instead of stopping' })
          .setTimestamp();

        // Add button for manual logging (timer starter/mods/admins only)
        const button = new ButtonBuilder()
          .setCustomId(`log_watched_${channelId}_${result.userId}`)
          .setLabel('Log to Watch History')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('📝');

        const row = new ActionRowBuilder().addComponents(button);

        // Mention the starter in the content — a timer that auto-stops
        // does so when nobody is necessarily watching the channel, and a
        // mention inside an embed never pings.
        await channel.send({
          content: `⏰ <@${result.userId}> your watch party timer has finished.`,
          embeds: [embed],
          components: [row],
        });
      }
    }
  } catch (error) {
    console.error('[Timer] Error sending auto-stop message:', error);
  }
}

/**
 * Schedule a timer's auto-stop to fire after `timeoutMs`. Returns the
 * setTimeout handle so the caller can assign it to timer.autoStopTimeout.
 * @param {string} channelId - Discord channel ID
 * @param {number} timeoutMs - Milliseconds until auto-stop should fire
 * @param {object} client - Discord client
 * @returns {NodeJS.Timeout}
 */
function scheduleAutoStop(channelId, timeoutMs, client) {
  return setTimeout(async () => {
    console.log(`[Timer] Auto-stopping timer in channel ${channelId}`);
    await handleAutoStopFired(channelId, client);
  }, timeoutMs);
}

/**
 * Restore auto-stop timeouts for timers with durations after bot restart
 * Call this after the bot is ready and can fetch channels
 * @param {object} client - Discord client
 */
export async function restoreTimerTimeouts(client) {
  for (const [channelId, timer] of activeTimers.entries()) {
    if (timer.paused) {
      console.log(`[Timer] Channel ${channelId} restored in a paused state, not scheduling auto-stop`);
      continue;
    }

    if (timer.duration && timer.endTime) {
      const remainingMs = timer.endTime - Date.now();

      // If timer has expired while bot was down, stop it now
      if (remainingMs <= 0) {
        console.log(`[Timer] Timer in channel ${channelId} expired during downtime, stopping now`);
        await handleAutoStopFired(channelId, client);
      } else {
        // Set up auto-stop timeout for remaining time
        console.log(`[Timer] Restoring auto-stop timeout for channel ${channelId}, remaining: ${Math.round(remainingMs / 1000)}s`);
        timer.autoStopTimeout = scheduleAutoStop(channelId, remainingMs, client);
      }
    }
  }
}

/**
 * Start a timer in a channel
 * @param {string} channelId - Discord channel ID
 * @param {string} userId - User who started the timer
 * @param {string} username - Username of who started it
 * @param {string} label - Optional label/description for the timer
 * @param {number} durationMinutes - Optional duration in minutes
 * @param {object} client - Discord client for auto-stop functionality
 * @param {boolean} isFallbackDuration - True when durationMinutes wasn't a real
 *   detected/manual value but the server's safety-cap default applied because
 *   nothing else was available (no label, no search match, user skipped
 *   selection, etc). Lets timerScheduler.js warn only on these timers, not on
 *   a normal movie/episode timer that just happens to run long.
 * @param {object|null} media - What the start flow identified the timer as:
 *   `{tmdbId, type, episodeRange}`. The start flow already resolves these to
 *   look up a runtime, and previously discarded them — keeping them lets
 *   /timer stop log the exact title that was chosen rather than re-searching
 *   TMDB from the label and taking the first hit, and lets the stop/warning
 *   messages tailor themselves to TV. Every field is optional: a skipped or
 *   unresolved title stores nothing, as do timers from before this existed,
 *   so all readers must tolerate undefined.
 * @returns {boolean} - True if started, false if timer already exists
 */
export function startTimer(channelId, userId, username, label = '', durationMinutes = null, client = null, isFallbackDuration = false, media = null) {
  // Check if timer already exists for this channel
  if (activeTimers.has(channelId)) {
    return false;
  }

  const startTime = Date.now();
  const timerData = {
    startTime,
    userId,
    username,
    label: label || '',
  };

  if (media?.tmdbId) {
    timerData.tmdbId = media.tmdbId;
    timerData.type = media.type || null;
    if (media.episodeRange) {
      timerData.episodeRange = media.episodeRange;
    }
  }

  // Add duration if specified
  if (durationMinutes && durationMinutes > 0) {
    timerData.duration = durationMinutes;
    timerData.endTime = startTime + (durationMinutes * 60 * 1000);
    timerData.isFallbackDuration = isFallbackDuration;

    // Set up auto-stop if client is provided
    if (client) {
      const timeoutMs = durationMinutes * 60 * 1000;
      timerData.autoStopTimeout = scheduleAutoStop(channelId, timeoutMs, client);
    }
  }

  activeTimers.set(channelId, timerData);

  // Save to disk (exclude timeout which can't be serialized)
  saveTimers().catch(err => console.error('Failed to save timers:', err));

  return true;
}

/**
 * Stop a timer in a channel
 * @param {string} channelId - Discord channel ID
 * @returns {object|null} - Timer data with elapsed time, or null if no timer
 */
export function stopTimer(channelId) {
  const timer = activeTimers.get(channelId);
  
  if (!timer) {
    return null;
  }

  // Clear auto-stop timeout if it exists
  if (timer.autoStopTimeout) {
    clearTimeout(timer.autoStopTimeout);
  }

  const elapsedMs = Date.now() - timer.startTime;
  activeTimers.delete(channelId);

  // Save to disk
  saveTimers().catch(err => console.error('Failed to save timers:', err));

  return {
    ...timer,
    elapsedMs,
    elapsedFormatted: formatElapsedTime(elapsedMs),
  };
}

/**
 * Pause an active timer, freezing its elapsed/remaining time and cancelling
 * any pending auto-stop until it's resumed.
 * @param {string} channelId - Discord channel ID
 * @returns {object|null} - { success: true, elapsedFormatted, hadDuration } on success,
 *   { alreadyPaused: true } if already paused, or null if no timer
 */
export function pauseTimer(channelId) {
  const timer = activeTimers.get(channelId);

  if (!timer) {
    return null;
  }

  if (timer.paused) {
    return { alreadyPaused: true };
  }

  const elapsedMs = Date.now() - timer.startTime;
  const hadDuration = !!(timer.duration && timer.endTime);

  if (timer.autoStopTimeout) {
    clearTimeout(timer.autoStopTimeout);
    delete timer.autoStopTimeout;
  }

  timer.paused = true;
  timer.pausedAt = Date.now();
  timer.remainingMsAtPause = hadDuration ? Math.max(0, timer.endTime - Date.now()) : null;
  delete timer.endTime;

  saveTimers().catch(err => console.error('Failed to save timers:', err));

  return {
    success: true,
    elapsedFormatted: formatElapsedTime(elapsedMs),
    remainingFormatted: hadDuration ? formatElapsedTime(timer.remainingMsAtPause) : null,
    hadDuration,
  };
}

/**
 * Resume a paused timer, rescheduling auto-stop (if it had a duration) based
 * on the remaining time frozen at pause.
 * @param {string} channelId - Discord channel ID
 * @param {object} client - Discord client (needed for auto-stop callback)
 * @returns {object|null} - { success: true, elapsedFormatted, remainingFormatted, hadDuration }
 *   on success, { notPaused: true } if not currently paused, or null if no timer
 */
export function resumeTimer(channelId, client) {
  const timer = activeTimers.get(channelId);

  if (!timer) {
    return null;
  }

  if (!timer.paused) {
    return { notPaused: true };
  }

  const elapsedMs = timer.pausedAt - timer.startTime;
  const hadDuration = timer.remainingMsAtPause !== null && timer.remainingMsAtPause !== undefined;

  if (hadDuration) {
    const newEndTime = Date.now() + timer.remainingMsAtPause;
    timer.endTime = newEndTime;

    if (client) {
      timer.autoStopTimeout = scheduleAutoStop(channelId, timer.remainingMsAtPause, client);
    }
  }

  const remainingFormatted = hadDuration ? formatElapsedTime(timer.remainingMsAtPause) : null;

  delete timer.paused;
  delete timer.pausedAt;
  delete timer.remainingMsAtPause;

  saveTimers().catch(err => console.error('Failed to save timers:', err));

  return {
    success: true,
    elapsedFormatted: formatElapsedTime(elapsedMs),
    remainingFormatted,
    hadDuration,
  };
}

/**
 * Get the current timer status for a channel
 * @param {string} channelId - Discord channel ID
 * @returns {object|null} - Current timer data with elapsed time, or null if no timer
 */
export function getTimerStatus(channelId) {
  const timer = activeTimers.get(channelId);

  if (!timer) {
    return null;
  }

  if (timer.paused) {
    const elapsedMs = timer.pausedAt - timer.startTime;
    const result = {
      ...timer,
      elapsedMs,
      elapsedFormatted: formatElapsedTime(elapsedMs),
      paused: true,
    };

    if (timer.remainingMsAtPause !== null && timer.remainingMsAtPause !== undefined) {
      result.remainingMs = timer.remainingMsAtPause;
      result.remainingFormatted = formatElapsedTime(timer.remainingMsAtPause);
      result.isExpired = false;
    }

    return result;
  }

  const elapsedMs = Date.now() - timer.startTime;
  const result = {
    ...timer,
    elapsedMs,
    elapsedFormatted: formatElapsedTime(elapsedMs),
    paused: false,
  };

  // Add remaining time if duration is set
  if (timer.duration && timer.endTime) {
    const remainingMs = Math.max(0, timer.endTime - Date.now());
    result.remainingMs = remainingMs;
    result.remainingFormatted = formatElapsedTime(remainingMs);
    result.isExpired = remainingMs <= 0;
  }

  return result;
}

/**
 * Format elapsed time in video player format (H:MM:SS or M:SS)
 * @param {number} ms - Milliseconds elapsed
 * @returns {string} - Formatted time string like "2:43:32" or "5:32" or "0:32"
 */
function formatElapsedTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    // Format: H:MM:SS (e.g., "2:43:32")
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  } else {
    // Format: M:SS (e.g., "5:32" or "0:32")
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }
}

/**
 * Format a span of time the way a person would say it: "2h 43m", "5m", "48s".
 *
 * formatElapsedTime's H:MM:SS is compact but genuinely ambiguous at a glance
 * — "2:43:32" reads as a clock time rather than a duration, and "5:32" could
 * be five hours or five minutes depending on which one you assume. That's
 * fine in a stop summary where the label says "Total Time", and poor in a
 * status line someone is skimming.
 *
 * Seconds are dropped once there's an hour to show, since nobody skimming a
 * two-hour timer needs them.
 *
 * @param {number} ms
 * @returns {string}
 */
export function formatDurationHuman(ms, { showSeconds = false } = {}) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  // Seconds are opt-in because the two things this formats want different
  // precision. Elapsed time is a live clock people sync a watch party
  // against, so it needs them; a runtime ("1h 47m") is a fixed figure where
  // a ticking seconds column is just noise.
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  // Once an hour is on display, minutes stay even at zero — "1h 5s" reads as
  // though a minutes column is missing, where "1h 0m 5s" is unambiguous.
  if (minutes > 0 || (hours > 0 && showSeconds)) parts.push(`${minutes}m`);
  if (showSeconds || parts.length === 0) parts.push(`${seconds}s`);

  return parts.join(' ');
}

/**
 * The same, from a duration already expressed in whole minutes.
 */
export function formatMinutesHuman(totalMinutes) {
  return formatDurationHuman((Number(totalMinutes) || 0) * 60 * 1000);
}

/**
 * Get all active timers (for debugging)
 * @returns {Map} - Map of all active timers
 */
export function getAllTimers() {
  return activeTimers;
}

/**
 * Clear all timers (for testing/admin purposes)
 */
export function clearAllTimers() {
  activeTimers.clear();
}

/**
 * Clamp a requested timer duration to a guild's OPTIONAL ceiling.
 * Applies to real (explicit or auto-detected) durations — start, adjust,
 * autostop enable, and extend all use this. Off by default: a server must
 * explicitly opt in via timerCeilingEnabled, otherwise any requested
 * duration is used as-is with no maximum. This is separate from the
 * no-signal fallback duration (see startTimerCountdown in timer.js), which
 * only applies when there's no real duration to clamp in the first place.
 * @param {number} durationMinutes - Requested duration in minutes
 * @param {object} guildConfig - Guild config with timerCeilingMinutes/timerCeilingEnabled
 * @returns {number} - The duration, clamped to the guild's ceiling if one is enabled
 */
export function clampTimerDuration(durationMinutes, guildConfig) {
  if (guildConfig?.timerCeilingEnabled !== true) {
    return durationMinutes;
  }

  const ceiling = guildConfig?.timerCeilingMinutes;
  if (!ceiling || ceiling <= 0) {
    return durationMinutes;
  }

  return durationMinutes > ceiling ? ceiling : durationMinutes;
}

/**
 * Can this user pause/resume/stop this timer? True for the timer's starter
 * or an admin/mod always; true for anyone else only when this server has
 * opted into allowAnyonePauseStopTimer. Does NOT apply to /timer adjust,
 * /timer autostop, or the expiry-warning extend button — those change
 * duration/auto-stop configuration and stay starter-or-admin only
 * regardless of this flag.
 * @param {object} timer - Timer data (as returned by getTimerStatus/activeTimers)
 * @param {string} userId - Discord user ID of the user attempting the action
 * @param {object} member - Discord GuildMember of the user attempting the action (for isAdmin)
 * @param {object} guildConfig - Guild config with allowAnyonePauseStopTimer
 * @returns {boolean}
 */
export function canControlTimerPauseStop(timer, userId, member, guildConfig) {
  if (timer.userId === userId || isAdmin(member)) return true;
  return guildConfig?.allowAnyonePauseStopTimer === true;
}

/**
 * Who may set or correct a running timer's title.
 *
 * Deliberately looser than pause/stop while the timer has NO title: an
 * unidentified timer is the problem we want fixed, whoever is watching can
 * fix it, and there is nothing to vandalize in an empty field. The risky
 * case — overwriting a title someone already set, which silently corrupts
 * the watch-history entry written at stop time — stays restricted to the
 * starter and moderators.
 *
 * @param {object} timer - the active timer record
 * @param {string} userId - who is asking
 * @param {object} member - their guild member, for the admin/mod check
 * @returns {boolean}
 */
export function canSetTimerTitle(timer, userId, member) {
  if (!timer) return false;
  if (!timer.label) return true; // nothing set yet — anyone may identify it
  return timer.userId === userId || isAdmin(member);
}

/**
 * Set or correct an active timer's title and what it refers to.
 *
 * The label is what the watch-history entry is written under at stop time,
 * and tmdbId/type are what save it from being re-guessed by a title search —
 * so fixing this mid-party is what keeps the log accurate.
 *
 * Deliberately does NOT touch duration: a timer already counting is synced
 * to a real playback, and silently rescheduling its auto-stop underneath
 * people would be worse than an imperfect end time. `/timer adjust` exists
 * for that and says what it is doing.
 *
 * @param {string} channelId
 * @param {string} label - the corrected title
 * @param {object|null} media - {tmdbId, type, episodeRange} when identified
 * @returns {object|null} the updated timer, or null if none is running
 */
export function setTimerTitle(channelId, label, media = null) {
  const timer = activeTimers.get(channelId);
  if (!timer) return null;

  timer.label = label || '';

  if (media?.tmdbId) {
    timer.tmdbId = media.tmdbId;
    timer.type = media.type || null;
    if (media.episodeRange) {
      timer.episodeRange = media.episodeRange;
    } else {
      delete timer.episodeRange;
    }
  }

  saveTimers().catch(err => console.error('Failed to save timers:', err));

  return { ...timer };
}

/**
 * Adjust the duration of an active timer
 * Calculates elapsed time and reschedules auto-stop based on new total duration
 * @param {string} channelId - Discord channel ID
 * @param {number} newDurationMinutes - New total duration in minutes
 * @param {object} client - Discord client (needed for auto-stop callback)
 * @returns {object|null} - Updated timer data with remaining time, or null if no timer
 */
export function adjustTimerDuration(channelId, newDurationMinutes, client) {
  const timer = activeTimers.get(channelId);
  
  if (!timer) {
    return null;
  }

  // Calculate elapsed time
  const elapsedMs = Date.now() - timer.startTime;
  const elapsedMinutes = elapsedMs / (60 * 1000);
  
  // If new duration is less than elapsed time, the timer would be expired
  if (newDurationMinutes <= elapsedMinutes) {
    return {
      error: 'duration_too_short',
      elapsedMinutes: Math.ceil(elapsedMinutes),
      message: `Timer has already run for ${Math.ceil(elapsedMinutes)} minutes. New duration must be longer.`
    };
  }

  // Clear existing auto-stop timeout if it exists
  if (timer.autoStopTimeout) {
    clearTimeout(timer.autoStopTimeout);
  }

  // Calculate new endTime
  const newEndTime = timer.startTime + (newDurationMinutes * 60 * 1000);
  const remainingMs = newEndTime - Date.now();

  // Update timer data.
  //
  // A timer that never had a real duration KEEPS its fallback flag through an
  // extension. Extending doesn't tell us how long the movie actually is — the
  // person is buying more time, not declaring a runtime — so the timer should
  // keep earning its "about to expire" warning each time it approaches the
  // new end. (This used to clear the flag, which silenced every warning after
  // the first. That was a workaround for a fixed 1-hour warning window firing
  // instantly on a 1-hour extension; the window now scales with the timer's
  // length, so the workaround isn't needed — see timerScheduler.js.)
  //
  // A timer that DID have a real duration stays non-fallback, as before.
  timer.duration = newDurationMinutes;
  timer.endTime = newEndTime;

  // Set up new auto-stop timeout
  if (client) {
    timer.autoStopTimeout = scheduleAutoStop(channelId, remainingMs, client);
  }

  // Save to disk
  saveTimers().catch(err => console.error('Failed to save timers:', err));

  return {
    success: true,
    duration: newDurationMinutes,
    remainingMs,
    remainingFormatted: formatElapsedTime(remainingMs),
    elapsedMs,
    elapsedFormatted: formatElapsedTime(elapsedMs),
  };
}

/**
 * Disable auto-stop for an active timer
 * Timer will continue running until manually stopped
 * @param {string} channelId - Discord channel ID
 * @returns {boolean} - True if disabled, false if no timer or already disabled
 */
export function disableTimerAutostop(channelId) {
  const timer = activeTimers.get(channelId);
  
  if (!timer) {
    return false;
  }

  // Check if auto-stop is already disabled
  if (!timer.duration && !timer.endTime && !timer.autoStopTimeout) {
    return false; // Already disabled
  }

  // Clear the timeout if it exists
  if (timer.autoStopTimeout) {
    clearTimeout(timer.autoStopTimeout);
    delete timer.autoStopTimeout;
  }

  // Remove duration and endTime
  delete timer.duration;
  delete timer.endTime;

  // Save to disk
  saveTimers().catch(err => console.error('Failed to save timers:', err));

  return true;
}

/**
 * Automatically log timer to watch history (for auto-stop)
 * @param {object} channel - Discord channel
 * @param {object} client - Discord client
 * @param {string} title - Timer title/label
 * @param {string} elapsedTime - Formatted elapsed time
 * @param {string} startedBy - Username who started timer
 * @param {string} channelId - Channel ID
 */
async function autoLogTimerToWatchHistory(channel, client, title, elapsedTime, startedBy, channelId, starterUserId, timer = null) {
  try {
    const tmdb = await import('../services/tmdbService.js');
    const { saveWatchHistory } = await import('./watchHistoryManager.js');
    const { trackSearch } = await import('./statsTracker.js');
    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
    const { resolveWatchedTitle, buildWatchLogNotes, buildPauseHint } = await import('./timerWatchLog.js');

    // Prefer the title the start flow already pinned down over re-searching
    // the label and hoping the first hit is right.
    const resolved = await resolveWatchedTitle(timer, title, tmdb);
    const pauseHint = buildPauseHint(timer);

    if (!resolved) {
      // Could not find title - send simple completion message with manual log button
      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('⏰ Timer Completed 🛑')
        .setDescription(`**${title}**\n\n⚠️ Could not find this title on TMDB to log automatically.`)
        .addFields(
          {
            name: 'Total Time',
            value: elapsedTime,
            inline: true,
          },
          {
            name: 'Started by',
            value: startedBy,
            inline: true,
          }
        )
        .setFooter({ text: `Use the button below to manually log to watch history • ${pauseHint}` })
        .setTimestamp();

      // Add button for manual logging (timer starter/mods/admins only)
      const button = new ButtonBuilder()
        .setCustomId(`log_watched_${channelId}_${starterUserId}`)
        .setLabel('Log to Watch History')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📝');

      const row = new ActionRowBuilder().addComponents(button);

      // Mention the starter in the content — a timer that auto-stops
      // does so when nobody is necessarily watching the channel, and a
      // mention inside an embed never pings.
      await channel.send({
        content: `⏰ <@${starterUserId}> your watch party timer has finished.`,
        embeds: [embed],
        components: [row],
      });
      return;
    }

    const { tmdbId, type, details } = resolved;
    const fullTitle = details.title || details.name;
    const year = details.release_date || details.first_air_date;
    const yearStr = year ? year.split('-')[0] : '';
    const posterPath = details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : null;

    // One show-level entry per watch party, with the episode range in the
    // notes — watch history has no season/episode concept, and a row per
    // episode would bury everything else in /watched history.
    await saveWatchHistory(channel.guild.id, {
      tmdbId,
      type,
      title: fullTitle,
      year: yearStr,
      notes: buildWatchLogNotes(elapsedTime, timer?.episodeRange, ' (auto-completed)'),
      savedBy: 'Egg Shen Bot',
      savedById: client.user.id,
      watchedAt: Date.now(),
      channelId: channelId,
      channelName: channel.name || 'Unknown Channel',
    });
    
    // Track in stats (use first guild member as placeholder for auto-stop)
    const guild = channel.guild;
    if (guild) {
      await trackSearch(
        guild.id,
        client.user.id,
        'Egg Shen Bot',
        'watched',
        fullTitle,
        yearStr
      );
    }
    
    // Build confirmation embed
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('⏰ Timer Completed & Logged 🛑📝')
      .setDescription(`**${fullTitle}** (${yearStr})\n\n✅ Automatically logged to watch history`)
      .addFields(
        {
          name: 'Total Time',
          value: elapsedTime,
          inline: true,
        },
        {
          name: 'Type',
          value: type === 'movie' ? 'Movie' : 'TV Show',
          inline: true,
        },
        {
          name: 'Channel',
          value: `<#${channelId}>`,
          inline: true,
        },
        {
          name: 'Started by',
          value: startedBy,
          inline: true,
        }
      )
      .setFooter({ text: `Use /watched history to view watch history • ${pauseHint}` })
      .setTimestamp();
    
    if (posterPath) {
      embed.setThumbnail(posterPath);
    }
    
    // Add button for manual override (timer starter/mods/admins only)
    const button = new ButtonBuilder()
      .setCustomId(`log_watched_${channelId}_${starterUserId}`)
      .setLabel('Log to Watch History')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📝');

    const row = new ActionRowBuilder().addComponents(button);
    
    // Mention the starter in the content — a timer that auto-stops
    // does so when nobody is necessarily watching the channel, and a
    // mention inside an embed never pings.
    await channel.send({
      content: `⏰ <@${starterUserId}> your watch party timer has finished.`,
      embeds: [embed],
      components: [row],
    });
    
  } catch (error) {
    console.error('[Timer] Error auto-logging to watch history:', error);
    
    // Send error message with manual log button
    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
    
    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('⏰ Timer Completed 🛑')
      .setDescription(`**${title}**\n\n❌ Error logging to watch history: ${error.message}`)
      .addFields(
        {
          name: 'Total Time',
          value: elapsedTime,
          inline: true,
        },
        {
          name: 'Started by',
          value: startedBy,
          inline: true,
        }
      )
      .setFooter({ text: 'Use the button below to manually log to watch history • Only timer starter/mods/admins can log • Use /timer pause during breaks' })
      .setTimestamp();
    
    // Add button for manual logging (timer starter/mods/admins only)
    const button = new ButtonBuilder()
      .setCustomId(`log_watched_${channelId}_${starterUserId}`)
      .setLabel('Log to Watch History')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📝');

    const row = new ActionRowBuilder().addComponents(button);
    
    // Mention the starter in the content — a timer that auto-stops
    // does so when nobody is necessarily watching the channel, and a
    // mention inside an embed never pings.
    await channel.send({
      content: `⏰ <@${starterUserId}> your watch party timer has finished.`,
      embeds: [embed],
      components: [row],
    });
  }
}

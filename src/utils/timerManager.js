/**
 * Timer Management System
 * Manages channel-specific timers (one active timer per channel)
 * Timers are persisted to disk and restored on bot restart
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store active timers: { channelId: { startTime, userId, username, label, duration, endTime, autoStopTimeout } }
const activeTimers = new Map();

// Path to persist timers
const TIMERS_FILE = path.join(__dirname, '../../active_timers.json');

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
 * Restore auto-stop timeouts for timers with durations after bot restart
 * Call this after the bot is ready and can fetch channels
 * @param {object} client - Discord client
 */
export async function restoreTimerTimeouts(client) {
  for (const [channelId, timer] of activeTimers.entries()) {
    if (timer.duration && timer.endTime) {
      const remainingMs = timer.endTime - Date.now();
      
      // If timer has expired while bot was down, stop it now
      if (remainingMs <= 0) {
        console.log(`[Timer] Timer in channel ${channelId} expired during downtime, stopping now`);
        const result = stopTimer(channelId);
        
        if (result) {
          try {
            const channel = await client.channels.fetch(channelId);
            if (channel && channel.isTextBased()) {
              // Auto-log to watch history if timer has a label
              if (result.label) {
                await autoLogTimerToWatchHistory(
                  channel,
                  client,
                  result.label,
                  result.elapsedFormatted,
                  result.username,
                  channelId
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
                  .setFooter({ text: 'Use the button below to log what you watched • Only timer starter/mods/admins can log' })
                  .setTimestamp();

                // Add button for manual logging (timer starter/mods/admins only)
                const button = new ButtonBuilder()
                  .setCustomId(`log_watched_${channelId}_${result.userId}`)
                  .setLabel('Log to Watch History')
                  .setStyle(ButtonStyle.Primary)
                  .setEmoji('📝');

                const row = new ActionRowBuilder().addComponents(button);

                await channel.send({ embeds: [embed], components: [row] });
              }
            }
          } catch (error) {
            console.error('[Timer] Error sending expired timer message:', error);
          }
        }
      } else {
        // Set up auto-stop timeout for remaining time
        console.log(`[Timer] Restoring auto-stop timeout for channel ${channelId}, remaining: ${Math.round(remainingMs / 1000)}s`);
        const autoStopTimeout = setTimeout(async () => {
          console.log(`[Timer] Auto-stopping restored timer in channel ${channelId}`);
          const result = stopTimer(channelId);
          
          if (result) {
            try {
              const channel = await client.channels.fetch(channelId);
              if (channel && channel.isTextBased()) {
                // Auto-log to watch history if timer has a label
                if (result.label) {
                  await autoLogTimerToWatchHistory(
                    channel,
                    client,
                    result.label,
                    result.elapsedFormatted,
                    result.username,
                    channelId,
                    result.userId
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
                    .setFooter({ text: 'Use the button below to log what you watched • Only timer starter/mods/admins can log' })
                    .setTimestamp();

                  // Add button for manual logging (timer starter/mods/admins only)
                  const button = new ButtonBuilder()
                    .setCustomId(`log_watched_${channelId}_${result.userId}`)
                    .setLabel('Log to Watch History')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('📝');

                  const row = new ActionRowBuilder().addComponents(button);

                  await channel.send({ embeds: [embed], components: [row] });
                }
              }
            } catch (error) {
              console.error('[Timer] Error sending auto-stop message:', error);
            }
          }
        }, remainingMs);
        
        timer.autoStopTimeout = autoStopTimeout;
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
 * @returns {boolean} - True if started, false if timer already exists
 */
export function startTimer(channelId, userId, username, label = '', durationMinutes = null, client = null) {
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

  // Add duration if specified
  if (durationMinutes && durationMinutes > 0) {
    timerData.duration = durationMinutes;
    timerData.endTime = startTime + (durationMinutes * 60 * 1000);
    
    // Set up auto-stop if client is provided
    if (client) {
      const timeoutMs = durationMinutes * 60 * 1000;
      const autoStopTimeout = setTimeout(async () => {
        console.log(`[Timer] Auto-stopping timer in channel ${channelId} after ${durationMinutes} minutes`);
        const result = stopTimer(channelId);
        
        if (result) {
          try {
            const channel = await client.channels.fetch(channelId);
            if (channel && channel.isTextBased()) {
              // Auto-log to watch history if timer has a label
              if (result.label) {
                await autoLogTimerToWatchHistory(
                  channel,
                  client,
                  result.label,
                  result.elapsedFormatted,
                  result.username,
                  channelId,
                  result.userId
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
                  .setFooter({ text: 'Use the button below to log what you watched • Only timer starter/mods/admins can log' })
                  .setTimestamp();

                // Add button for manual logging (timer starter/mods/admins only)
                const button = new ButtonBuilder()
                  .setCustomId(`log_watched_${channelId}_${result.userId}`)
                  .setLabel('Log to Watch History')
                  .setStyle(ButtonStyle.Primary)
                  .setEmoji('📝');

                const row = new ActionRowBuilder().addComponents(button);

                await channel.send({ embeds: [embed], components: [row] });
              }
            }
          } catch (error) {
            console.error('[Timer] Error sending auto-stop message:', error);
          }
        }
      }, timeoutMs);
      
      timerData.autoStopTimeout = autoStopTimeout;
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
 * Get the current timer status for a channel
 * @param {string} channelId - Discord channel ID
 * @returns {object|null} - Current timer data with elapsed time, or null if no timer
 */
export function getTimerStatus(channelId) {
  const timer = activeTimers.get(channelId);
  
  if (!timer) {
    return null;
  }

  const elapsedMs = Date.now() - timer.startTime;
  const result = {
    ...timer,
    elapsedMs,
    elapsedFormatted: formatElapsedTime(elapsedMs),
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
 * Automatically log timer to watch history (for auto-stop)
 * @param {object} channel - Discord channel
 * @param {object} client - Discord client
 * @param {string} title - Timer title/label
 * @param {string} elapsedTime - Formatted elapsed time
 * @param {string} startedBy - Username who started timer
 * @param {string} channelId - Channel ID
 */
async function autoLogTimerToWatchHistory(channel, client, title, elapsedTime, startedBy, channelId, starterUserId) {
  try {
    const { searchMovies, searchTVShows, getMovieDetails, getTVShowDetails } = await import('../services/tmdbService.js');
    const { saveWatchHistory } = await import('./watchHistoryManager.js');
    const { trackSearch } = await import('./statsTracker.js');
    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
    
    // Search for the title
    const [movieResults, tvResults] = await Promise.all([
      searchMovies(title),
      searchTVShows(title),
    ]);
    
    const allResults = [
      ...(movieResults || []).map(r => ({ ...r, type: 'movie' })),
      ...(tvResults || []).map(r => ({ ...r, type: 'tv' })),
    ];
    
    if (allResults.length === 0) {
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
        .setFooter({ text: 'Use the button below to manually log to watch history • Only timer starter/mods/admins can log' })
        .setTimestamp();
      
      // Add button for manual logging (timer starter/mods/admins only)
      const button = new ButtonBuilder()
        .setCustomId(`log_watched_${channelId}_${starterUserId}`)
        .setLabel('Log to Watch History')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📝');

      const row = new ActionRowBuilder().addComponents(button);
      
      await channel.send({ embeds: [embed], components: [row] });
      return;
    }
    
    // Use the first result
    const result = allResults[0];
    const details = result.type === 'movie' 
      ? await getMovieDetails(result.id)
      : await getTVShowDetails(result.id);
    
    const fullTitle = details.title || details.name;
    const year = details.release_date || details.first_air_date;
    const yearStr = year ? year.split('-')[0] : '';
    const posterPath = details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : null;
    
    // Save to watch history (use bot as the saver since this is automatic)
    await saveWatchHistory(channel.guild.id, {
      tmdbId: result.id,
      type: result.type,
      title: fullTitle,
      year: yearStr,
      notes: `Watch party timer: ${elapsedTime} (auto-completed)`,
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
          value: result.type === 'movie' ? 'Movie' : 'TV Show',
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
      .setFooter({ text: 'Use /watched history to view watch history • Use button to manually log again • Use /timer start to begin a new timer' })
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
    
    await channel.send({ embeds: [embed], components: [row] });
    
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
      .setFooter({ text: 'Use the button below to manually log to watch history • Only timer starter/mods/admins can log' })
      .setTimestamp();
    
    // Add button for manual logging (timer starter/mods/admins only)
    const button = new ButtonBuilder()
      .setCustomId(`log_watched_${channelId}_${starterUserId}`)
      .setLabel('Log to Watch History')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📝');

    const row = new ActionRowBuilder().addComponents(button);
    
    await channel.send({ embeds: [embed], components: [row] });
  }
}

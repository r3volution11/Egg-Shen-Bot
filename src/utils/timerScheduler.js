/**
 * Timer Expiry Warning Scheduler
 *
 * Warns a timer's starter ~1 hour before it's about to auto-stop, with a
 * button that opens a modal to extend it. Mirrors tournamentScheduler.js's
 * shape (initialize/shutdown, 1-minute interval, a sentWarnings Map keyed
 * so we don't spam the same channel every tick).
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getAllTimers } from './timerManager.js';
import * as logger from './logger.js';

let client = null;
let schedulerInterval = null;
const CHECK_INTERVAL = 60 * 1000; // Check every 1 minute
const WARNING_WINDOW_MS = 60 * 60 * 1000; // Warn when <= 1 hour remains

// Track which channels have already been warned for their current endTime,
// so we don't re-post every minute within the warning window.
// key: channelId, value: endTime the warning was sent for
const sentWarnings = new Map();

/**
 * Initialize the scheduler with the Discord client
 * @param {Client} discordClient - Discord.js client
 */
export function initialize(discordClient) {
  client = discordClient;

  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  schedulerInterval = setInterval(checkTimerExpirations, CHECK_INTERVAL);

  console.log('✓ Timer scheduler initialized');
  logger.info(logger.LogCategory.SCHEDULER, 'Timer scheduler initialized', {
    checkInterval: `${CHECK_INTERVAL / 1000}s`,
    warningWindow: `${WARNING_WINDOW_MS / 60000}m`,
  });
}

/**
 * Stop the scheduler (for graceful shutdown)
 */
export function shutdown() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('✓ Timer scheduler stopped');
  }
}

/**
 * Clear a channel's warning record, e.g. after the timer was extended, so a
 * fresh warning can fire again as the (new) expiry approaches later.
 * @param {string} channelId - Discord channel ID
 */
export function clearWarning(channelId) {
  sentWarnings.delete(channelId);
}

/**
 * Check all active timers for ones approaching their auto-stop time
 */
async function checkTimerExpirations() {
  if (!client) return;

  try {
    const timers = getAllTimers();
    const now = Date.now();

    for (const [channelId, timer] of timers.entries()) {
      if (timer.paused || !timer.duration || !timer.endTime) {
        // No expiry to warn about — either paused or running with no auto-stop
        continue;
      }

      const remainingMs = timer.endTime - now;

      // Stale/expired — clean up and let handleAutoStopFired (timerManager)
      // deal with the actual stop; nothing to warn about here.
      if (remainingMs <= 0) {
        sentWarnings.delete(channelId);
        continue;
      }

      if (remainingMs > WARNING_WINDOW_MS) {
        // Not within the warning window yet. If a stale warning exists for
        // an older endTime (e.g. timer was extended past the window again),
        // clear it so a fresh warning can fire once it re-enters the window.
        if (sentWarnings.has(channelId) && sentWarnings.get(channelId) !== timer.endTime) {
          sentWarnings.delete(channelId);
        }
        continue;
      }

      if (sentWarnings.get(channelId) === timer.endTime) {
        continue; // Already warned for this exact endTime
      }

      await sendExpiryWarning(channelId, timer, remainingMs);
      sentWarnings.set(channelId, timer.endTime);
    }

    // Clean up entries for timers that no longer exist (stopped/removed)
    for (const channelId of sentWarnings.keys()) {
      if (!timers.has(channelId)) {
        sentWarnings.delete(channelId);
      }
    }
  } catch (error) {
    console.error('[TimerScheduler] Error checking timer expirations:', error);
    logger.error(logger.LogCategory.SCHEDULER, 'Error checking timer expirations', {
      error: error.message,
      stack: error.stack,
    });
  }
}

/**
 * Post an in-channel warning mentioning the timer's starter, with a button
 * that opens a modal to extend the timer.
 */
async function sendExpiryWarning(channelId, timer, remainingMs) {
  try {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return;

    const remainingMinutes = Math.max(1, Math.round(remainingMs / 60000));

    const embed = new EmbedBuilder()
      .setColor('#FFA500')
      .setTitle('⏰ Timer Ending Soon')
      .setDescription(
        `${timer.label ? `**${timer.label}**\n\n` : ''}` +
        `This timer will automatically stop in **${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}**.\n\n` +
        `<@${timer.userId}> — need more time? Use the button below to extend it.`
      )
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`timer_extend_${channelId}`)
        .setLabel('Extend Timer')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('⏱️')
    );

    await channel.send({
      content: `<@${timer.userId}>`,
      embeds: [embed],
      components: [row],
    });

    logger.notice(logger.LogCategory.SCHEDULER, 'Sent timer expiry warning', {
      channelId,
      userId: timer.userId,
      remainingMinutes,
    });
  } catch (error) {
    console.error(`[TimerScheduler] Error sending expiry warning for channel ${channelId}:`, error);
    logger.error(logger.LogCategory.SCHEDULER, 'Error sending timer expiry warning', {
      channelId,
      error: error.message,
    });
  }
}

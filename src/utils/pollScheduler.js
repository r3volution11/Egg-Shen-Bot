/**
 * Survey/Poll Auto-Expiry Scheduler
 *
 * Periodically checks for active surveys whose optional duration has
 * elapsed and closes them automatically, using the same close-and-announce
 * flow /survey close uses (src/utils/pollManager.js's closePollAndAnnounce),
 * so a survey closes identically whether a moderator closes it manually or
 * it expires on its own.
 */

import { getExpiredActivePolls, closePollAndAnnounce } from './pollManager.js';
import * as logger from './logger.js';

let client = null;
let schedulerInterval = null;
const CHECK_INTERVAL = 60 * 1000; // Check every 1 minute

/**
 * Initialize the scheduler with the Discord client
 * @param {import('discord.js').Client} discordClient
 */
export function initialize(discordClient) {
  client = discordClient;

  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  schedulerInterval = setInterval(checkExpiredPolls, CHECK_INTERVAL);

  console.log('✓ Poll scheduler initialized');
  logger.info(logger.LogCategory.SCHEDULER, 'Poll scheduler initialized', {
    checkInterval: `${CHECK_INTERVAL / 1000}s`,
  });
}

/**
 * Stop the scheduler (for graceful shutdown)
 */
export function shutdown() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('✓ Poll scheduler stopped');
  }
}

/**
 * Check all guilds for surveys whose duration has expired and close them.
 */
async function checkExpiredPolls() {
  if (!client) return;

  try {
    const expiredPolls = getExpiredActivePolls();

    for (const { guildId, poll } of expiredPolls) {
      await autoClosePoll(guildId, poll);
    }
  } catch (error) {
    console.error('[PollScheduler] Error checking expired polls:', error);
    logger.error(logger.LogCategory.SCHEDULER, 'Error checking expired polls', {
      error: error.message,
      stack: error.stack,
    });
  }
}

/**
 * Auto-close a single expired survey.
 */
async function autoClosePoll(guildId, poll) {
  try {
    console.log(`[PollScheduler] Auto-closing expired survey "${poll.question}" (${poll.pollId}) in guild ${guildId}`);

    const result = await closePollAndAnnounce(client, guildId, poll.pollId, client.user.id);

    if (!result.success) {
      console.error(`[PollScheduler] Failed to auto-close survey ${poll.pollId}:`, result.error);
      logger.error(logger.LogCategory.SCHEDULER, 'Failed to auto-close expired survey', {
        guildId,
        pollId: poll.pollId,
        error: result.error,
      });
      return;
    }

    logger.info(logger.LogCategory.SCHEDULER, 'Auto-closed expired survey', {
      guildId,
      pollId: poll.pollId,
      question: poll.question,
    });
  } catch (error) {
    console.error(`[PollScheduler] Error auto-closing survey ${poll.pollId}:`, error);
    logger.error(logger.LogCategory.SCHEDULER, 'Error auto-closing expired survey', {
      guildId,
      pollId: poll.pollId,
      error: error.message,
      stack: error.stack,
    });
  }
}

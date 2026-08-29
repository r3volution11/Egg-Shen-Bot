/**
 * Event Request Image Cleanup Scheduler
 *
 * Periodically prunes uploaded event-request images that are no longer
 * needed: images tied to an event whose date passed more than ~90 days ago
 * (pruneExpiredImages), and images uploaded for a request that was never
 * approved — denied, expired, or abandoned mid-submission — so never got a
 * linked event date at all (pruneOrphanedUploads). Runs once a day, not
 * every minute like the other schedulers — this is background disk
 * housekeeping with no user-facing urgency.
 */

import { pruneExpiredImages, pruneOrphanedUploads } from './eventImageStore.js';
import * as logger from './logger.js';

let schedulerInterval = null;
const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // Once per day

/**
 * Initialize the scheduler. Unlike the other schedulers, this one doesn't
 * need the Discord client — it's pure disk cleanup.
 */
export function initialize() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  schedulerInterval = setInterval(runCleanup, CHECK_INTERVAL);

  console.log('✓ Event image cleanup scheduler initialized');
  logger.info(logger.LogCategory.SCHEDULER, 'Event image cleanup scheduler initialized', {
    checkInterval: `${CHECK_INTERVAL / (60 * 60 * 1000)}h`,
  });
}

/**
 * Stop the scheduler (for graceful shutdown)
 */
export function shutdown() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('✓ Event image cleanup scheduler stopped');
  }
}

async function runCleanup() {
  try {
    const expiredCount = await pruneExpiredImages();
    const orphanedCount = await pruneOrphanedUploads();

    if (expiredCount > 0 || orphanedCount > 0) {
      logger.info(logger.LogCategory.SCHEDULER, 'Pruned event request images', {
        expiredCount,
        orphanedCount,
      });
    }
  } catch (error) {
    console.error('[EventImageCleanupScheduler] Error pruning event images:', error);
    logger.error(logger.LogCategory.SCHEDULER, 'Error pruning event request images', {
      error: error.message,
      stack: error.stack,
    });
  }
}

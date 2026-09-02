/**
 * Bot Status Rotation Scheduler
 *
 * Rotates the bot's Discord presence through movieQuotesStore.js's flavor
 * text once an hour, using ActivityType.Custom so it renders as bare text
 * with no "Playing/Watching/Listening to" verb prefix. The visible text
 * must go on the activity's `state` field — `name` is required by the
 * payload shape but Discord's client doesn't render it for Custom
 * activities.
 *
 * Quotes are re-read from disk on every rotation tick (rather than a static
 * import) so an edit made through /quotes-admin takes effect within the
 * hour, with no bot restart needed.
 */

import { ActivityType } from 'discord.js';
import { loadQuotes } from './movieQuotesStore.js';
import * as logger from './logger.js';

let schedulerInterval = null;
const ROTATE_INTERVAL = 60 * 60 * 1000; // Once per hour

// Used only if the quote list is ever empty (e.g. every quote deleted
// through the admin page) so the bot never ends up with no status at all.
const FALLBACK_QUOTE = 'Your mystical guide to movies and TV.';

let lastQuote = null;

/**
 * Initialize the scheduler with the Discord client. Sets an initial quote
 * right away so the bot doesn't sit with no status for the first hour.
 * @param {import('discord.js').Client} client
 */
export function initialize(client) {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  setRandomQuote(client);
  schedulerInterval = setInterval(() => setRandomQuote(client), ROTATE_INTERVAL);

  console.log('✓ Presence scheduler initialized');
  logger.info(logger.LogCategory.SCHEDULER, 'Presence scheduler initialized', {
    rotateInterval: `${ROTATE_INTERVAL / 60000}m`,
  });
}

/**
 * Stop the scheduler (for graceful shutdown)
 */
export function shutdown() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('✓ Presence scheduler stopped');
  }
}

/**
 * Picks a random quote (avoiding an immediate repeat when there's more than
 * one to choose from) and sets it as the bot's Custom status.
 * @param {import('discord.js').Client} client
 */
async function setRandomQuote(client) {
  let quotes;
  try {
    quotes = await loadQuotes();
  } catch (error) {
    console.error('[PresenceScheduler] Error loading quotes:', error);
    quotes = [];
  }

  if (quotes.length === 0) {
    quotes = [FALLBACK_QUOTE];
  }

  let quote = quotes[Math.floor(Math.random() * quotes.length)];
  if (quotes.length > 1) {
    while (quote === lastQuote) {
      quote = quotes[Math.floor(Math.random() * quotes.length)];
    }
  }
  lastQuote = quote;

  client.user.setPresence({
    activities: [{ name: 'Custom Status', state: quote, type: ActivityType.Custom }],
    status: 'online',
  });
}

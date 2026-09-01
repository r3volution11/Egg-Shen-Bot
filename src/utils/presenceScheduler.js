/**
 * Bot Status Rotation Scheduler
 *
 * Rotates the bot's Discord presence through movieQuotes.js's flavor text
 * once an hour, using ActivityType.Custom so it renders as bare text with
 * no "Playing/Watching/Listening to" verb prefix. The visible text must go
 * on the activity's `state` field — `name` is required by the payload shape
 * but Discord's client doesn't render it for Custom activities.
 */

import { ActivityType } from 'discord.js';
import { MOVIE_QUOTES } from './movieQuotes.js';
import * as logger from './logger.js';

let schedulerInterval = null;
const ROTATE_INTERVAL = 60 * 60 * 1000; // Once per hour

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
    quoteCount: MOVIE_QUOTES.length,
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
function setRandomQuote(client) {
  if (MOVIE_QUOTES.length === 0) return;

  let quote = MOVIE_QUOTES[Math.floor(Math.random() * MOVIE_QUOTES.length)];
  if (MOVIE_QUOTES.length > 1) {
    while (quote === lastQuote) {
      quote = MOVIE_QUOTES[Math.floor(Math.random() * MOVIE_QUOTES.length)];
    }
  }
  lastQuote = quote;

  client.user.setPresence({
    activities: [{ name: 'Custom Status', state: quote, type: ActivityType.Custom }],
    status: 'online',
  });
}

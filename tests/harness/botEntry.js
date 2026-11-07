/**
 * Load the bot's real entry point, src/index.js, without connecting to
 * Discord.
 *
 * index.js builds its discord.js Client, registers every event listener and
 * calls client.login() as soon as it's imported, which is why tests used to
 * read its source or copy its client options instead of running it. Here
 * discord.js's Client is swapped for a subclass whose login() does nothing:
 * the options are still the real ones, normalized and validated by
 * discord.js itself, and the listeners are the ones index.js registered, so
 * a test can read the real config and emit events at the real handlers.
 *
 * index.js also installs process-wide handlers (SIGINT, SIGTERM,
 * uncaughtException → process.exit(1)) that must not land on a Jest worker;
 * process.on is stubbed while it loads.
 *
 * Call once per test file, before anything else imports src/. Destroy the
 * client in afterAll.
 */

import { jest } from '@jest/globals';
import path from 'path';
import * as discord from 'discord.js';

/** @returns {Promise<import('discord.js').Client>} the client index.js created */
export async function loadBotEntry() {
  const clients = [];
  class Client extends discord.Client {
    constructor(options) {
      super(options);
      clients.push(this);
    }

    async login() {
      return 'not-connected';
    }
  }
  jest.unstable_mockModule('discord.js', () => ({ ...discord, Client }));

  const processOn = jest.spyOn(process, 'on').mockImplementation(function stubbed() { return this; });
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  try {
    await import(path.join(process.cwd(), 'src/index.js'));
  } finally {
    processOn.mockRestore();
    log.mockRestore();
  }
  if (clients.length !== 1) throw new Error(`index.js created ${clients.length} clients`);
  return clients[0];
}

/**
 * E2E test harness server for the Event Request web form.
 *
 * Mirrors the real production topology (nginx serving public/ and
 * reverse-proxying /api/* to the bot's Express app on the SAME origin —
 * see /etc/nginx examples in EVENT_REQUEST_SETUP.md) by mounting static
 * file serving directly onto the real createApiServer() app, rather than
 * running two separate ports. No CORS complexity needed as a result.
 *
 * Runs on port 3000 to match public/app.js's hardcoded
 * `hostname === 'localhost' ? 'http://localhost:3000/api' : '/api'` logic.
 */
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { createApiServer } from '../../../src/api/server.js';
import { createStubClient } from '../fixtures/stub-discord-client.js';
import { writeFixtureGuildConfigs, removeFixtureGuildConfigs } from '../fixtures/guild-configs.js';
import { ALL_GUILDS } from '../fixtures/scenarios.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.join(__dirname, '../../..');
const PORT = process.env.E2E_PORT || 3000;

process.env.NODE_ENV = process.env.NODE_ENV || 'test'; // non-production: secure:false cookies, enables the rate-limit reset route

async function main() {
  await writeFixtureGuildConfigs(ALL_GUILDS);

  // createApiServer() registers its own catch-all 404 handler as its last
  // middleware, so static serving must be mounted on a wrapping app BEFORE
  // the API app, not appended after it (which would never be reached).
  const app = express();
  app.use(express.static(path.join(REPO_ROOT, 'public')));
  app.use(createApiServer(createStubClient(ALL_GUILDS)));

  const server = app.listen(PORT, () => {
    console.log(`[e2e harness] listening on http://localhost:${PORT}`);
  });

  const cleanup = async () => {
    await removeFixtureGuildConfigs(ALL_GUILDS);
    await fs.rm(path.join(REPO_ROOT, 'pending_event_requests.json'), { force: true });
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);
}

main();

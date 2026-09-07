/**
 * Per-worker test isolation.
 *
 * Jest runs each test file in its own worker process, but several modules
 * default to a single fixed path under the repo root (event_request_images/,
 * pending_event_requests.json, and so on). Suites that wipe those in
 * beforeEach/afterEach were deleting each other's fixtures mid-run, which
 * showed up as 1-10 tests failing in a different suite on every run.
 *
 * This runs before the test framework is installed — and therefore before any
 * static import in a test file is evaluated — so the env overrides are in
 * place by the time a module under test reads them at import time.
 *
 * Each worker gets its own scratch directory, keyed by JEST_WORKER_ID.
 * Modules that already accept an override (movieQuotesStore's
 * MOVIE_QUOTES_FILE) keep whatever a suite sets for itself; this only fills in
 * a default where the suite hasn't chosen one.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

// JEST_WORKER_ID is 1-based and unset when running in band; fall back to the
// pid so the path is unique either way.
const workerId = process.env.JEST_WORKER_ID || String(process.pid);
const workerDir = path.join(os.tmpdir(), 'egg-shen-tests', `worker-${workerId}`);

fs.mkdirSync(workerDir, { recursive: true });

/** Set an env var only if the suite hasn't already chosen a value. */
function fallback(name, value) {
  if (!process.env[name]) process.env[name] = value;
}

fallback('EVENT_IMAGES_DIR', path.join(workerDir, 'event_request_images'));
fallback('EVENT_REQUESTS_FILE', path.join(workerDir, 'pending_event_requests.json'));
fallback('EVENT_CHANNEL_SELECTIONS_FILE', path.join(workerDir, 'pending_event_channel_selections.json'));
fallback('ACTIVE_TIMERS_FILE', path.join(workerDir, 'active_timers.json'));
fallback('GUILD_CONFIGS_DIR', path.join(workerDir, 'guild_configs'));
fallback('GUILD_TOURNAMENTS_DIR', path.join(workerDir, 'guild_tournaments'));
fallback('GUILD_WATCHLISTS_DIR', path.join(workerDir, 'guild_watchlists'));
fallback('GUILD_POLLS_DIR', path.join(workerDir, 'guild_polls'));

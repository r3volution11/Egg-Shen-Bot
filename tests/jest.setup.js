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

// An event request's title is looked up on TMDB for where it streams
// (src/utils/eventStreaming.js). Never from a test: the suites for that
// feature mock TMDB and switch it back on themselves.
fallback('EVENT_STREAMING_LOOKUP', 'off');
fallback('EVENT_IMAGES_DIR', path.join(workerDir, 'event_request_images'));
fallback('EVENT_REQUESTS_FILE', path.join(workerDir, 'pending_event_requests.json'));
fallback('EVENT_CHANNEL_SELECTIONS_FILE', path.join(workerDir, 'pending_event_channel_selections.json'));
fallback('ACTIVE_TIMERS_FILE', path.join(workerDir, 'active_timers.json'));
fallback('GUILD_CONFIGS_DIR', path.join(workerDir, 'guild_configs'));
fallback('GUILD_TOURNAMENTS_DIR', path.join(workerDir, 'guild_tournaments'));
fallback('GUILD_WATCHLISTS_DIR', path.join(workerDir, 'guild_watchlists'));
fallback('GUILD_POLLS_DIR', path.join(workerDir, 'guild_polls'));
fallback('GUILD_STATS_DIR', path.join(workerDir, 'guild_stats'));
fallback('GUILD_WATCH_HISTORY_DIR', path.join(workerDir, 'guild_watch_history'));
fallback('GUILD_GAMES_DIR', path.join(workerDir, 'guild_games'));

/**
 * Make supertest's servers listen on 127.0.0.1, not on every address.
 *
 * supertest starts each app with listen(0), which binds every address, then
 * connects to 127.0.0.1:<port>. On macOS the wildcard bind succeeds even
 * when another program already holds that port on 127.0.0.1 specifically —
 * and then the request reaches THAT program. Editors, password managers and
 * the like keep dozens of such ports open, so roughly one full run in ten
 * failed somewhere: a 400 or 404 the route can't produce, a reset
 * connection, or a 15s hang, in a different test each time.
 *
 * Listening on 127.0.0.1 explicitly lets the OS hand out only ports free on
 * that address. That bind is asynchronous (Node resolves the host first),
 * while supertest reads the port synchronously, so the URL gets a
 * placeholder port that end() fills in once the server is listening.
 * Tests don't change. Written against supertest 7.
 */
import tls from 'tls';
import SupertestTest from 'supertest/lib/test.js';

const testProto = SupertestTest.prototype;
if (!testProto.__listensOnLoopback) {
  const PLACEHOLDER = '127.0.0.1:0';

  testProto.serverAddress = function serverAddress(app, path) {
    const protocol = app instanceof tls.Server ? 'https' : 'http';
    if (app.address()) return `${protocol}://127.0.0.1:${app.address().port}${path}`;

    this._server = app; // supertest closes this after the response
    this._listening = new Promise((resolve, reject) => {
      app.once('error', reject);
      app.listen(0, '127.0.0.1', resolve);
    });
    return `${protocol}://${PLACEHOLDER}${path}`;
  };

  const end = testProto.end;
  testProto.end = function endOnceListening(fn) {
    const listening = this._listening;
    if (!listening) return end.call(this, fn);
    this._listening = null;
    listening.then(
      () => {
        this.url = this.url.replace(PLACEHOLDER, `127.0.0.1:${this.app.address().port}`);
        end.call(this, fn);
      },
      (error) => fn(error),
    );
    return this;
  };

  testProto.__listensOnLoopback = true;
}

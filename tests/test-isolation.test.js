/**
 * Guards the test suite's own isolation.
 *
 * Several suites recursively delete the directories they work in
 * (eventCropRoute wipes the whole images dir, event-request-system wipes the
 * whole guild-configs dir). jest.setup.js scopes those paths per WORKER —
 * but Jest reuses a worker across many test files in sequence, so a
 * worker-scoped directory is still shared with whatever suite runs next.
 *
 * The result was a different, unrelated test failing on roughly one run in
 * three — quotes-admin, event-crop and OAuth suites taking turns, each
 * passing in isolation. The kind of flakiness that teaches people to re-run
 * a red build instead of reading it.
 *
 * This test fails if a suite that recursively deletes a shared directory
 * stops claiming its own.
 *
 * Run with: npm test -- tests/test-isolation.test.js
 */

import { describe, test, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const TESTS_DIR = path.join(process.cwd(), 'tests');

/** Env vars jest.setup.js scopes per worker — and therefore shares between
 *  the test files that run in that worker. */
const SHARED_PATH_VARS = [
  'EVENT_IMAGES_DIR',
  'EVENT_REQUESTS_FILE',
  'EVENT_CHANNEL_SELECTIONS_FILE',
  'GUILD_CONFIGS_DIR',
  'GUILD_TOURNAMENTS_DIR',
  'GUILD_WATCHLISTS_DIR',
  'GUILD_POLLS_DIR',
  'GUILD_STATS_DIR',
  'GUILD_WATCH_HISTORY_DIR',
];

function allSuites() {
  return fs.readdirSync(TESTS_DIR)
    .filter(f => f.endsWith('.test.js') && f !== 'test-isolation.test.js')
    .map(f => ({ file: f, source: fs.readFileSync(path.join(TESTS_DIR, f), 'utf8') }));
}

/**
 * A suite is unsafe when it recursively deletes a directory it did NOT claim
 * for itself — i.e. it reads one of the worker-shared vars and rmSyncs it
 * without first assigning its own value.
 */
function isUnsafe({ source }) {
  const recursivelyDeletes = /rmSync\([^)]*recursive:\s*true/.test(source);
  if (!recursivelyDeletes) return false;

  const usesSharedVar = SHARED_PATH_VARS.some(v =>
    new RegExp(`process\\.env\\.${v}\\b(?!\\s*=)`).test(source)
  );
  if (!usesSharedVar) return false;

  const claimsOwnPath = SHARED_PATH_VARS.some(v =>
    new RegExp(`process\\.env\\.${v}\\s*=`).test(source)
  );

  return !claimsOwnPath;
}

describe('no suite recursively deletes a directory it shares with others', () => {
  test('the guard can see the test files at all', () => {
    expect(allSuites().length).toBeGreaterThan(50);
  });

  test('every suite either claims its own path or avoids deleting the directory', () => {
    const offenders = allSuites().filter(isUnsafe).map(s => s.file);

    // If this fails, the named suite wipes a directory jest.setup.js scopes
    // per WORKER — and Jest reuses a worker across files, so it is pulling
    // fixtures out from under whichever suite runs next. Either assign your
    // own path for that env var before importing anything that reads it, or
    // empty the directory's contents instead of removing the directory.
    expect(offenders).toEqual([]);
  });
});

describe('jest.setup.js still isolates by worker', () => {
  const setup = fs.readFileSync(path.join(TESTS_DIR, 'jest.setup.js'), 'utf8');

  test('keys the scratch directory on the worker id', () => {
    expect(setup).toContain('JEST_WORKER_ID');
  });

  test('only fills in a default, never overrides a suite that chose its own', () => {
    // The `fallback` helper is what lets a destructive suite claim its own
    // path before the setup runs.
    expect(setup).toMatch(/function fallback[\s\S]*if \(!process\.env\[name\]\)/);
  });
});

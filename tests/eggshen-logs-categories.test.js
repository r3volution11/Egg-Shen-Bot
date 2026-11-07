/**
 * /eggshen-logs category offers only categories something writes.
 *
 * It offered Bracket and API, but nothing in the bot logs under either:
 * tournament scheduling logs as Scheduler, and logAPI() — the only writer of
 * API — has no callers. Picking them always answered "no logs", which reads
 * as "nothing went wrong" rather than "nothing is recorded here".
 *
 * A writer is any use of logger.LogCategory.<X> outside logger.js, or a
 * call to one of logger.js's helpers that writes a fixed category
 * (logCommand → command, logButton → button, ...). Both are read from the
 * source, so a new writer or a new helper counts without editing this test.
 *
 * Run with: npm test -- tests/eggshen-logs-categories.test.js
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import * as logger from '../src/utils/logger.js';

const SRC = path.join(process.cwd(), 'src');
const LOGGER_FILE = path.join(SRC, 'utils/logger.js');

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return e.name.endsWith('.js') ? [p] : [];
  });
}

/** Categories (their values, e.g. 'scheduler') that some code path writes */
function writtenCategories() {
  const loggerSource = fs.readFileSync(LOGGER_FILE, 'utf8');
  const others = sourceFiles(SRC).filter(f => f !== LOGGER_FILE).map(f => fs.readFileSync(f, 'utf8')).join('\n');

  const written = new Set();
  // Direct: logger.error(logger.LogCategory.SCHEDULER, ...) and the like
  for (const [, key] of others.matchAll(/LogCategory\.([A-Z_]+)/g)) written.add(logger.LogCategory[key]);

  // Helpers: logger.js's exported functions that write one fixed category,
  // counted only when something outside logger.js calls them
  for (const chunk of loggerSource.split(/^export function /m).slice(1)) {
    const name = chunk.match(/^(\w+)\(/)?.[1];
    const body = chunk.split(/^}/m)[0];
    const categories = [...body.matchAll(/LogCategory\.([A-Z_]+)/g)].map(m => m[1]);
    if (!name || categories.length === 0) continue;
    if (new RegExp(`\\b${name}\\(`).test(others)) {
      for (const key of categories) written.add(logger.LogCategory[key]);
    }
  }
  return written;
}

let choices;

beforeAll(async () => {
  const { data } = await import('../src/commands/eggshen-logs.js');
  const category = data.toJSON().options.find(o => o.name === 'category');
  choices = category.options.find(o => o.name === 'category').choices;
});

describe('/eggshen-logs category', () => {
  test('every category it offers is one the bot writes', () => {
    const written = writtenCategories();
    const unwritten = choices.filter(c => !written.has(c.value)).map(c => `${c.name} (${c.value})`);
    expect(unwritten).toEqual([]);
  });

  test('Bracket and API are not offered; the categories with writers are', () => {
    const values = choices.map(c => c.value);
    expect(values).not.toContain('bracket');
    expect(values).not.toContain('api');
    expect(values).toEqual(['system', 'command', 'button', 'scheduler', 'performance']);
  });
});

/**
 * Going over the auto-ban threshold: what the user is told.
 *
 * The reply used to say "Server moderators have been notified." Nothing
 * notified anyone — going over is only recorded, for
 * `/eggshen-config-moderation moderation auto-ban-list` — so the message
 * promised something that never happened.
 *
 * Run with: npm test -- tests/rate-limit-threshold-warning.test.js
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const GUILD = 'threshold-warning-guild';
let checkRateLimit;
let getUsersExceedingThreshold;

beforeAll(async () => {
  const dir = process.env.GUILD_CONFIGS_DIR;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${GUILD}.json`), JSON.stringify({
    rateLimits: { enabled: true, global: { maxRequests: 1, windowSeconds: 60 } },
    moderation: { enabled: true, autoBan: { enabled: true, violationCount: 2, windowHours: 24 } },
  }));
  ({ checkRateLimit, getUsersExceedingThreshold } = await import('../src/utils/rateLimiter.js'));
});

describe('the auto-ban threshold warning', () => {
  test('warns the user without claiming moderators were notified', async () => {
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await checkRateLimit(GUILD, 'user-1', 'movie'));

    expect(results[0].limited).toBe(false);
    expect(results[1].message).not.toMatch(/Warning/); // one violation: under the threshold of 2
    const over = results[3];
    expect(over.limited).toBe(true);
    expect(over.message).toContain("You have gone over this server's limit for rate-limit violations");
    expect(over.message).not.toMatch(/notified/i);
  });

  test('what moderators can see: the user is on the auto-ban list', async () => {
    const config = JSON.parse(fs.readFileSync(path.join(process.env.GUILD_CONFIGS_DIR, `${GUILD}.json`), 'utf8'));
    const users = getUsersExceedingThreshold(GUILD, config);
    expect(JSON.stringify(users)).toContain('user-1');
  });
});

/**
 * Unit tests for timerManager.js's canControlTimerPauseStop — the shared
 * permission check for /timer stop, pause, and resume. Deliberately does
 * NOT apply to /timer adjust, /timer autostop, or the expiry-warning extend
 * button, which stay starter-or-admin-only regardless of the guild's
 * allowAnyonePauseStopTimer setting (those change duration/auto-stop
 * configuration, not just start/stop a clock).
 *
 * Run with: npx jest tests/canControlTimerPauseStop.test.js --verbose
 */

import { describe, test, expect } from '@jest/globals';
import { canControlTimerPauseStop } from '../src/utils/timerManager.js';

function makeMember({ isAdmin = false } = {}) {
  return {
    permissions: {
      has: (flag) => (isAdmin ? flag === 'Administrator' : false),
    },
  };
}

const timer = { userId: 'starter-user' };

describe('canControlTimerPauseStop', () => {
  test('the timer starter is always allowed, flag off', () => {
    expect(canControlTimerPauseStop(timer, 'starter-user', makeMember(), {})).toBe(true);
  });

  test('the timer starter is always allowed, flag on', () => {
    expect(canControlTimerPauseStop(timer, 'starter-user', makeMember(), { allowAnyonePauseStopTimer: true })).toBe(true);
  });

  test('an admin is always allowed, flag off', () => {
    expect(canControlTimerPauseStop(timer, 'someone-else', makeMember({ isAdmin: true }), {})).toBe(true);
  });

  test('a random member is rejected when the flag is off (default)', () => {
    expect(canControlTimerPauseStop(timer, 'random-user', makeMember(), {})).toBe(false);
  });

  test('a random member is rejected when guildConfig is missing entirely', () => {
    expect(canControlTimerPauseStop(timer, 'random-user', makeMember(), undefined)).toBe(false);
  });

  test('a random member is allowed when the flag is explicitly on', () => {
    expect(canControlTimerPauseStop(timer, 'random-user', makeMember(), { allowAnyonePauseStopTimer: true })).toBe(true);
  });

  test('a random member is rejected when the flag is explicitly false', () => {
    expect(canControlTimerPauseStop(timer, 'random-user', makeMember(), { allowAnyonePauseStopTimer: false })).toBe(false);
  });

  test('a random member is rejected when the flag is a truthy non-boolean (strict === true check)', () => {
    expect(canControlTimerPauseStop(timer, 'random-user', makeMember(), { allowAnyonePauseStopTimer: 1 })).toBe(false);
  });
});

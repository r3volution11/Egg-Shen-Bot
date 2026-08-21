/**
 * Unit tests for timerManager.js's clampTimerDuration — the OPT-IN ceiling
 * applied to real (explicit or auto-detected) timer durations. Used by
 * /timer start, /timer adjust, /timer autostop enable, and the expiry-
 * warning "Extend Timer" modal.
 *
 * Off by default: a server must explicitly enable timerCeilingEnabled,
 * otherwise any requested duration is used as-is with no maximum. This is
 * separate from the no-signal fallback duration applied in
 * startTimerCountdown (src/commands/timer.js) when no real duration exists
 * at all — that fallback is not this function's concern.
 *
 * Run with: npx jest tests/clampTimerDuration.test.js --verbose
 */

import { describe, test, expect } from '@jest/globals';
import { clampTimerDuration } from '../src/utils/timerManager.js';

describe('clampTimerDuration', () => {
  test('returns the requested duration unchanged when the ceiling is disabled (default)', () => {
    const guildConfig = { timerCeilingEnabled: false, timerCeilingMinutes: 120 };
    expect(clampTimerDuration(500, guildConfig)).toBe(500);
  });

  test('returns the requested duration unchanged when guildConfig is empty (ceiling off by default)', () => {
    expect(clampTimerDuration(500, {})).toBe(500);
  });

  test('returns the requested duration unchanged when guildConfig is undefined', () => {
    expect(clampTimerDuration(500, undefined)).toBe(500);
  });

  test('clamps down to the ceiling when enabled and the requested duration is over it', () => {
    const guildConfig = { timerCeilingEnabled: true, timerCeilingMinutes: 360 };
    expect(clampTimerDuration(500, guildConfig)).toBe(360);
  });

  test('returns the requested duration unchanged when enabled but under the ceiling', () => {
    const guildConfig = { timerCeilingEnabled: true, timerCeilingMinutes: 360 };
    expect(clampTimerDuration(120, guildConfig)).toBe(120);
  });

  test('returns the requested duration unchanged when exactly at the ceiling', () => {
    const guildConfig = { timerCeilingEnabled: true, timerCeilingMinutes: 360 };
    expect(clampTimerDuration(360, guildConfig)).toBe(360);
  });

  test('does not clamp when enabled but timerCeilingMinutes is not set', () => {
    const guildConfig = { timerCeilingEnabled: true };
    expect(clampTimerDuration(500, guildConfig)).toBe(500);
  });

  test('does not clamp when enabled but timerCeilingMinutes is 0', () => {
    const guildConfig = { timerCeilingEnabled: true, timerCeilingMinutes: 0 };
    expect(clampTimerDuration(500, guildConfig)).toBe(500);
  });

  test('handles a custom, non-default ceiling', () => {
    const guildConfig = { timerCeilingEnabled: true, timerCeilingMinutes: 120 };
    expect(clampTimerDuration(180, guildConfig)).toBe(120);
    expect(clampTimerDuration(60, guildConfig)).toBe(60);
  });

  test('handles the smallest valid duration (1 minute) without special-casing', () => {
    const guildConfig = { timerCeilingEnabled: true, timerCeilingMinutes: 360 };
    expect(clampTimerDuration(1, guildConfig)).toBe(1);
  });
});

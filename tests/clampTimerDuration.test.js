/**
 * Unit tests for timerManager.js's clampTimerDuration — the shared cap
 * resolution helper used by /timer start, /timer adjust, /timer autostop
 * enable, and the expiry-warning "Extend Timer" modal, so the
 * maxTimerDurationUnlimited check only needs to live in one place.
 *
 * Run with: npx jest tests/clampTimerDuration.test.js --verbose
 */

import { describe, test, expect } from '@jest/globals';
import { clampTimerDuration } from '../src/utils/timerManager.js';

describe('clampTimerDuration', () => {
  test('returns the requested duration unchanged when under the configured cap', () => {
    const guildConfig = { maxTimerDurationMinutes: 360, maxTimerDurationUnlimited: false };
    expect(clampTimerDuration(120, guildConfig)).toBe(120);
  });

  test('returns the requested duration unchanged when exactly at the cap', () => {
    const guildConfig = { maxTimerDurationMinutes: 360, maxTimerDurationUnlimited: false };
    expect(clampTimerDuration(360, guildConfig)).toBe(360);
  });

  test('clamps down to the configured cap when over it', () => {
    const guildConfig = { maxTimerDurationMinutes: 360, maxTimerDurationUnlimited: false };
    expect(clampTimerDuration(500, guildConfig)).toBe(360);
  });

  test('does not clamp at all when maxTimerDurationUnlimited is true, regardless of the cap value', () => {
    const guildConfig = { maxTimerDurationMinutes: 360, maxTimerDurationUnlimited: true };
    expect(clampTimerDuration(1440, guildConfig)).toBe(1440);
  });

  test('falls back to a 360-minute default cap when maxTimerDurationMinutes is missing', () => {
    const guildConfig = { maxTimerDurationUnlimited: false };
    expect(clampTimerDuration(500, guildConfig)).toBe(360);
  });

  test('falls back to a 360-minute default cap when guildConfig is empty', () => {
    expect(clampTimerDuration(500, {})).toBe(360);
  });

  test('handles a guildConfig with a custom, non-default cap', () => {
    const guildConfig = { maxTimerDurationMinutes: 120, maxTimerDurationUnlimited: false };
    expect(clampTimerDuration(180, guildConfig)).toBe(120);
    expect(clampTimerDuration(60, guildConfig)).toBe(60);
  });

  test('handles the smallest valid duration (1 minute) without special-casing', () => {
    const guildConfig = { maxTimerDurationMinutes: 360, maxTimerDurationUnlimited: false };
    expect(clampTimerDuration(1, guildConfig)).toBe(1);
  });
});

/**
 * Unit tests for src/utils/eventTimeInput.js — the strict YYYY-MM-DD HH:mm
 * parse/format helpers backing the event-request Edit modal's Start/End
 * Time fields, interpreted in a per-guild-configured IANA timezone
 * (default UTC). Pure logic, no Discord/fs dependencies, so no mocking is
 * needed.
 *
 * Run with: npx jest tests/eventTimeInput.test.js --verbose
 */

import { describe, test, expect } from '@jest/globals';
import { parseUtcTimeInput, formatUtcForInput, isValidTimeZone, ALL_TIME_ZONES, TIME_INPUT_PLACEHOLDER, TIME_INPUT_FORMAT_HINT } from '../src/utils/eventTimeInput.js';

describe('parseUtcTimeInput', () => {
  test('parses a valid YYYY-MM-DD HH:mm value to the correct UTC ISO instant', () => {
    const result = parseUtcTimeInput('2026-09-15 20:00');
    expect(result.ok).toBe(true);
    expect(result.iso).toBe('2026-09-15T20:00:00.000Z');
  });

  test('accepts a literal T separator too', () => {
    const result = parseUtcTimeInput('2026-09-15T20:00');
    expect(result.ok).toBe(true);
    expect(result.iso).toBe('2026-09-15T20:00:00.000Z');
  });

  test('trims leading/trailing whitespace and still parses', () => {
    const result = parseUtcTimeInput('  2026-09-15 20:00  ');
    expect(result.ok).toBe(true);
    expect(result.iso).toBe('2026-09-15T20:00:00.000Z');
  });

  test('rejects empty input with a "required" error', () => {
    const result = parseUtcTimeInput('');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/required/i);
  });

  test('rejects whitespace-only input with a "required" error', () => {
    const result = parseUtcTimeInput('   ');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/required/i);
  });

  test.each([
    'not a date',
    '2026/09/15 20:00',
    '15-09-2026 20:00',
    '2026-09-15',
    '8:00 PM',
  ])('rejects garbage input "%s" with the format-hint error', (input) => {
    const result = parseUtcTimeInput(input);
    expect(result.ok).toBe(false);
    expect(result.error).toContain(TIME_INPUT_FORMAT_HINT);
    expect(result.error).toContain(TIME_INPUT_PLACEHOLDER);
  });

  test('rejects an out-of-range month (13)', () => {
    const result = parseUtcTimeInput('2026-13-01 20:00');
    expect(result.ok).toBe(false);
  });

  test('rejects an out-of-range hour (25)', () => {
    const result = parseUtcTimeInput('2026-09-15 25:00');
    expect(result.ok).toBe(false);
  });

  test('rejects an out-of-range minute (60)', () => {
    const result = parseUtcTimeInput('2026-09-15 20:60');
    expect(result.ok).toBe(false);
  });

  test('rejects a Date.UTC rollover case — Feb 30 does not exist', () => {
    const result = parseUtcTimeInput('2026-02-30 12:00');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/real date/i);
  });

  test('rejects a Date.UTC rollover case — April 31 does not exist', () => {
    const result = parseUtcTimeInput('2026-04-31 12:00');
    expect(result.ok).toBe(false);
  });

  test('accepts a real leap-day date', () => {
    const result = parseUtcTimeInput('2028-02-29 12:00');
    expect(result.ok).toBe(true);
    expect(result.iso).toBe('2028-02-29T12:00:00.000Z');
  });
});

describe('formatUtcForInput', () => {
  test('returns an empty string for null', () => {
    expect(formatUtcForInput(null)).toBe('');
  });

  test('returns an empty string for undefined', () => {
    expect(formatUtcForInput(undefined)).toBe('');
  });

  test('returns an empty string for an empty string', () => {
    expect(formatUtcForInput('')).toBe('');
  });

  test('formats a known ISO string using UTC components, not local time', () => {
    // 23:30 UTC — picked so the UTC hour would differ from most local
    // timezones' hour, proving getUTC* is used rather than local getters.
    expect(formatUtcForInput('2026-09-15T23:30:00.000Z')).toBe('2026-09-15 23:30');
  });

  test('pads single-digit month/day/hour/minute with leading zeros', () => {
    expect(formatUtcForInput('2026-01-05T03:05:00.000Z')).toBe('2026-01-05 03:05');
  });
});

describe('round-trip: formatUtcForInput and parseUtcTimeInput are exact inverses at minute precision', () => {
  test.each([
    '2026-09-15T20:00:00.000Z',
    '2026-01-01T00:00:00.000Z',
    '2026-12-31T23:59:00.000Z',
    '2026-06-15T12:30:00.000Z',
  ])('%s survives a format-then-parse round trip unchanged', (iso) => {
    const formatted = formatUtcForInput(iso);
    const reparsed = parseUtcTimeInput(formatted);
    expect(reparsed.ok).toBe(true);
    expect(reparsed.iso).toBe(iso);
  });
});

describe('isValidTimeZone', () => {
  test('accepts a real IANA zone name', () => {
    expect(isValidTimeZone('America/New_York')).toBe(true);
  });

  test('accepts the UTC special case (not present in Intl.supportedValuesOf itself)', () => {
    expect(ALL_TIME_ZONES.includes('UTC')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
  });

  test('rejects an invalid/nonexistent zone name', () => {
    expect(isValidTimeZone('Not/AZone')).toBe(false);
  });

  test('rejects a case-mismatched zone name (exact match required, not case-insensitive)', () => {
    expect(isValidTimeZone('america/new_york')).toBe(false);
    expect(isValidTimeZone('utc')).toBe(false);
  });

  test('rejects empty/undefined/null', () => {
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone(undefined)).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
  });
});

describe('parseUtcTimeInput with a non-UTC timezone', () => {
  test('converts wall-clock time in America/New_York (EDT, summer) to the correct UTC instant', () => {
    // The user's own example: 9/2/26 5:30pm ET (September = EDT, UTC-4)
    const result = parseUtcTimeInput('2026-09-02 17:30', 'America/New_York');
    expect(result.ok).toBe(true);
    expect(result.iso).toBe('2026-09-02T21:30:00.000Z');
  });

  test('converts wall-clock time in America/New_York (EST, winter) to a different UTC offset — DST boundary', () => {
    // Same zone, same wall-clock time, different UTC offset (EST, UTC-5) —
    // proves this isn't just a fixed-offset conversion.
    const result = parseUtcTimeInput('2026-01-15 17:30', 'America/New_York');
    expect(result.ok).toBe(true);
    expect(result.iso).toBe('2026-01-15T22:30:00.000Z');
  });

  test('converts correctly for a half-hour-offset zone (Asia/Kolkata, UTC+5:30)', () => {
    const result = parseUtcTimeInput('2026-06-01 12:00', 'Asia/Kolkata');
    expect(result.ok).toBe(true);
    expect(result.iso).toBe('2026-06-01T06:30:00.000Z');
  });

  test('omitting timeZone still defaults to UTC (regression guard)', () => {
    const result = parseUtcTimeInput('2026-09-15 20:00');
    expect(result.ok).toBe(true);
    expect(result.iso).toBe('2026-09-15T20:00:00.000Z');
  });

  test('rejects an invalid calendar date even in a non-UTC zone', () => {
    const result = parseUtcTimeInput('2026-02-30 12:00', 'America/New_York');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/real date/i);
  });
});

describe('formatUtcForInput with a non-UTC timezone', () => {
  test('formats a UTC instant as wall-clock time in America/New_York (EDT)', () => {
    expect(formatUtcForInput('2026-09-02T21:30:00.000Z', 'America/New_York')).toBe('2026-09-02 17:30');
  });

  test('formats a UTC instant as wall-clock time in America/New_York (EST) — DST boundary, reverse direction', () => {
    expect(formatUtcForInput('2026-01-15T22:30:00.000Z', 'America/New_York')).toBe('2026-01-15 17:30');
  });

  test('omitting timeZone still defaults to UTC (regression guard)', () => {
    expect(formatUtcForInput('2026-09-15T23:30:00.000Z')).toBe('2026-09-15 23:30');
  });
});

describe('round-trip in a non-UTC timezone', () => {
  test.each([
    ['2026-09-02T21:30:00.000Z', 'America/New_York'],
    ['2026-01-15T22:30:00.000Z', 'America/New_York'],
    ['2026-06-01T06:30:00.000Z', 'Asia/Kolkata'],
  ])('%s in %s survives a format-then-parse round trip unchanged', (iso, timeZone) => {
    const formatted = formatUtcForInput(iso, timeZone);
    const reparsed = parseUtcTimeInput(formatted, timeZone);
    expect(reparsed.ok).toBe(true);
    expect(reparsed.iso).toBe(iso);
  });
});

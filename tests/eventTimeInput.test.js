/**
 * Unit tests for src/utils/eventTimeInput.js — the strict UTC-only
 * YYYY-MM-DD HH:mm parse/format helpers backing the event-request Edit
 * modal's Start/End Time fields. Pure logic, no Discord/fs dependencies,
 * so no mocking is needed.
 *
 * Run with: npx jest tests/eventTimeInput.test.js --verbose
 */

import { describe, test, expect } from '@jest/globals';
import { parseUtcTimeInput, formatUtcForInput, TIME_INPUT_PLACEHOLDER, TIME_INPUT_FORMAT_HINT } from '../src/utils/eventTimeInput.js';

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

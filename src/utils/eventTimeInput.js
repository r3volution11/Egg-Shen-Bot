/**
 * Parsing/formatting for the moderator-facing UTC "Start/End Time" text
 * fields on the event-request Edit modal. A modal has no timezone-aware
 * date picker (Discord's component set doesn't have one at all — confirmed
 * against discord-api-types), so these fields are plain text, strictly
 * UTC-only and clearly labeled as such, in a single fixed format:
 * `YYYY-MM-DD HH:mm` (24-hour). No natural-language parsing, no implicit
 * local-time `new Date(string)` parsing (fragile if the host server's
 * timezone ever isn't UTC) — the UTC instant is built explicitly via
 * Date.UTC() from validated numeric components.
 */

const TIME_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/;

export const TIME_INPUT_PLACEHOLDER = '2026-09-15 20:00';
export const TIME_INPUT_FORMAT_HINT = 'YYYY-MM-DD HH:mm (24-hour, UTC)';

/**
 * Formats an ISO 8601 instant (as stored in requestData.startTime/endTime)
 * as UTC text in the modal's expected input format, for pre-filling
 * TextInputBuilder.setValue(). Returns '' for a null/undefined input (used
 * for the optional End Time field when no end time is set).
 * @param {string|null|undefined} isoString
 * @returns {string}
 */
export function formatUtcForInput(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

/**
 * Parses a moderator-typed UTC time string in the strict `YYYY-MM-DD
 * HH:mm` format into an ISO 8601 instant string. Never uses `new
 * Date(string)` on the raw input — explicitly builds the UTC instant via
 * Date.UTC() from validated numeric components, so behavior can't drift if
 * the host machine's timezone ever isn't UTC.
 * @param {string} input - raw text from the modal field, NOT pre-trimmed
 * @returns {{ ok: true, iso: string } | { ok: false, error: string }}
 */
export function parseUtcTimeInput(input) {
  const trimmed = (input || '').trim();
  if (!trimmed) {
    return { ok: false, error: 'This field is required.' };
  }

  const match = trimmed.match(TIME_INPUT_PATTERN);
  if (!match) {
    return {
      ok: false,
      error: `Couldn't understand "${trimmed}" — please use the format ${TIME_INPUT_FORMAT_HINT}, e.g. ${TIME_INPUT_PLACEHOLDER}.`,
    };
  }

  const [, yearStr, monthStr, dayStr, hourStr, minuteStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const hour = Number(hourStr);
  const minute = Number(minuteStr);

  if (month < 1 || month > 12 || hour > 23 || minute > 59) {
    return {
      ok: false,
      error: `"${trimmed}" isn't a valid date/time — please use ${TIME_INPUT_FORMAT_HINT}, e.g. ${TIME_INPUT_PLACEHOLDER}.`,
    };
  }

  const ms = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const roundTripped = new Date(ms);
  // Date.UTC silently rolls out-of-range days/months forward (e.g.
  // 2026-02-30 -> 2026-03-02) instead of rejecting them — catch that by
  // confirming the constructed date's own UTC components still match what
  // was typed.
  if (
    roundTripped.getUTCFullYear() !== year ||
    roundTripped.getUTCMonth() !== month - 1 ||
    roundTripped.getUTCDate() !== day ||
    roundTripped.getUTCHours() !== hour ||
    roundTripped.getUTCMinutes() !== minute
  ) {
    return {
      ok: false,
      error: `"${trimmed}" isn't a real date — please use ${TIME_INPUT_FORMAT_HINT}, e.g. ${TIME_INPUT_PLACEHOLDER}.`,
    };
  }

  return { ok: true, iso: roundTripped.toISOString() };
}

/**
 * Parsing/formatting for the moderator-facing "Start/End Time" text fields
 * on the event-request Edit modal, interpreted in a per-guild-configured
 * IANA timezone (default UTC for servers that never configure one — see
 * /eggshen-config-events event-requests timezone). A modal has no timezone-aware
 * date picker (Discord's component set doesn't have one at all), so these
 * fields stay plain text in a single fixed format: `YYYY-MM-DD HH:mm`
 * (24-hour). No natural-language parsing, no implicit local-time
 * `new Date(string)` parsing (fragile if the host server's own timezone
 * ever isn't UTC) — the instant is built explicitly via the IANA tz
 * database (Intl), never via the host machine's local clock/offset.
 */

const TIME_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/;

export const TIME_INPUT_PLACEHOLDER = '2026-09-15 20:00';
export const TIME_INPUT_FORMAT_HINT = 'YYYY-MM-DD HH:mm (24-hour)';

// Intl.supportedValuesOf('timeZone') does NOT include 'UTC' itself (418 real
// IANA zones, none literally named 'UTC' or 'Etc/UTC'), even though 'UTC' is
// this app's own default and a perfectly valid Intl timeZone value — so it's
// added explicitly rather than trusting the platform list alone.
export const ALL_TIME_ZONES = ['UTC', ...Intl.supportedValuesOf('timeZone')];

/**
 * Exact-match validity check against the real IANA tz database (plus the
 * 'UTC' special case above). Deliberately NOT implemented as a bare
 * `try { new Intl.DateTimeFormat(...) } catch` — that check alone is
 * case-insensitive and overly lenient (e.g. 'america/new_york' and 'utc'
 * both pass), which would let a moderator save a zone under inconsistent
 * casing. Exact-match against the canonical list is what /eggshen-config's
 * autocomplete offers, so this keeps validation consistent with it.
 * @param {string} tz
 * @returns {boolean}
 */
export function isValidTimeZone(tz) {
  return typeof tz === 'string' && ALL_TIME_ZONES.includes(tz);
}

/**
 * Returns { year, month, day, hour, minute, second } (all zero-padded
 * strings) for `date` as displayed in `timeZone`. Returns null on an
 * invalid zone unless `throwOnInvalid` is set (zonedTimeToUtc wants the
 * RangeError to propagate; formatUtcForInput would rather fail quiet since
 * it only affects modal pre-fill, not the ability to submit the modal).
 */
function getZonedParts(date, timeZone, throwOnInvalid = false) {
  let dtf;
  try {
    dtf = new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
  } catch (error) {
    if (throwOnInvalid) throw error;
    return null;
  }
  const map = {};
  for (const { type, value } of dtf.formatToParts(date)) map[type] = value;
  return map;
}

/**
 * Converts wall-clock date/time components in `timeZone` to the correct
 * UTC instant, DST-aware, using only the platform's own IANA tz database
 * (no fixed-offset math, no dependency).
 *
 * Technique: build a first-guess UTC instant by naively treating the
 * wall-clock components as if they were already UTC, ask the tz database
 * what wall-clock time that instant actually displays as in `timeZone`,
 * then correct by the difference. This converges in one step for all real
 * zones (a second iteration would only matter exactly at a DST transition
 * instant that also crosses a further offset change, which does not occur
 * in the IANA database).
 * @throws {RangeError} if timeZone is not a valid IANA zone name
 */
function zonedTimeToUtc(year, month, day, hour, minute, timeZone) {
  const asUTC = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const parts = getZonedParts(new Date(asUTC), timeZone, /* throwOnInvalid */ true);
  const asIfUTC = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour === '24' ? '0' : parts.hour), Number(parts.minute), Number(parts.second || 0),
  );
  return new Date(asUTC + (asUTC - asIfUTC));
}

/**
 * Formats an ISO 8601 instant (as stored in requestData.startTime/endTime)
 * as wall-clock text in `timeZone`, in the modal's expected input format,
 * for pre-filling TextInputBuilder.setValue(). Returns '' for a
 * null/undefined input (used for the optional End Time field when no end
 * time is set).
 * @param {string|null|undefined} isoString
 * @param {string} [timeZone] - IANA zone name, defaults to 'UTC'
 * @returns {string}
 */
export function formatUtcForInput(isoString, timeZone = 'UTC') {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';

  if (timeZone === 'UTC') {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
      `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
  }

  const parts = getZonedParts(date, timeZone);
  if (!parts) return '';
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

/**
 * Parses a moderator-typed time string in the strict `YYYY-MM-DD HH:mm`
 * format, interpreted as wall-clock time in `timeZone`, into an ISO 8601
 * UTC instant string. For `timeZone === 'UTC'` this is unchanged from the
 * original UTC-only behavior (built explicitly via Date.UTC() from
 * validated numeric components). For any other IANA zone, the same
 * validated numeric components are converted to the correct UTC instant
 * via the platform's own DST-aware tz database — never via the host
 * machine's local timezone.
 * @param {string} input - raw text from the modal field, NOT pre-trimmed
 * @param {string} [timeZone] - IANA zone name, defaults to 'UTC'
 * @returns {{ ok: true, iso: string } | { ok: false, error: string }}
 */
export function parseUtcTimeInput(input, timeZone = 'UTC') {
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

  if (timeZone === 'UTC') {
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

  // Non-UTC zone: same invalid-calendar-date guard, done by checking the
  // *wall-clock* components round-trip through the zone rather than
  // through Date.UTC's own UTC getters (a wall-clock date/time is what was
  // actually typed, in `timeZone`, not in UTC).
  let utcDate;
  try {
    utcDate = zonedTimeToUtc(year, month, day, hour, minute, timeZone);
  } catch (error) {
    // Shouldn't normally happen — the modal's zone always comes from a
    // validated guild config value — but fail safe with a clear message
    // rather than an unhandled RangeError bubbling out of a modal submit.
    return { ok: false, error: `Couldn't interpret the time in timezone "${timeZone}": ${error.message}` };
  }

  const roundTripParts = getZonedParts(utcDate, timeZone);
  if (
    !roundTripParts ||
    Number(roundTripParts.year) !== year ||
    Number(roundTripParts.month) !== month ||
    Number(roundTripParts.day) !== day ||
    Number(roundTripParts.hour) !== hour ||
    Number(roundTripParts.minute) !== minute
  ) {
    return {
      ok: false,
      error: `"${trimmed}" isn't a real date — please use ${TIME_INPUT_FORMAT_HINT}, e.g. ${TIME_INPUT_PLACEHOLDER}.`,
    };
  }

  return { ok: true, iso: utcDate.toISOString() };
}

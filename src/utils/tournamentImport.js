/**
 * Tournament setup from a file — the CSV/JSON format behind the setup form
 * and `/bracket export format:json`.
 *
 * The format is documented for users at /commands/brackets/import and the
 * templates live in docs/public/templates/tournaments/. Change them together.
 *
 * Titles are looked up through bracketTitles.js — the same search
 * `/bracket manage-titles` uses — and added through bracketManager.addTitle,
 * so a tournament built here is indistinguishable from one built by hand.
 * Nothing here has its own idea of what a valid tournament is beyond what
 * `/bracket` already enforces; it checks all of it up front instead, so a
 * bad file never leaves a half-built tournament behind.
 */

import * as bracketManager from './bracketManager.js';
import { TITLE_TYPES, searchTitleCandidates, buildEntryFromResult, fetchEntryById, getTypeLabel } from './bracketTitles.js';
import { stripTrailingYear } from './episodeRangeParser.js';

export const IMPORT_FORMAT = 'eggshen-tournament';
export const IMPORT_VERSION = 1;

export const GROUP_LETTERS = 'ABCDEFGHIJKL';
export const GROUP_SIZE = 4;
export const STRAIGHT_MIN = 2;
export const STRAIGHT_MAX = 32;
export const GROUPS_MIN = 4;
export const GROUPS_MAX = 12;
export const MAX_ROWS = GROUPS_MAX * GROUP_SIZE;

export const DEFAULT_VOTING_DURATION = '24h';
export const DEFAULT_TIEBREAKER_DURATION = '1h';
export const SEEDING_OPTIONS = ['random', 'ordered'];
export const MAX_NAME_LENGTH = bracketManager.MAX_TOURNAMENT_NAME_LENGTH;
export const MAX_ANNOUNCEMENT_LENGTH = 1000;

// Unknown columns and fields are errors, not ignored: a typo like "seedng"
// would otherwise silently do nothing (the TMDB `vote_count_gte` lesson).
const CSV_COLUMNS = ['title', 'year', 'group', 'id', 'image_url'];
const JSON_FIELDS = ['format', 'version', 'name', 'type', 'seeding', 'votingDuration', 'tiebreakerDuration', 'announcement', 'titles'];
const JSON_TITLE_FIELDS = ['title', 'year', 'group', 'id', 'imageUrl'];
const ANNOUNCEMENT_FIELDS = ['message', 'imageUrl'];

// How many matches a row offers to pick from
const MAX_CANDIDATES = 10;

// ─── durations ────────────────────────────────────────────────────────────────

/**
 * Parse a duration like "24h", "3d" or "45m" to milliseconds.
 * @returns {number|null} null if it isn't one
 */
export function parseDuration(durationStr) {
  if (!durationStr || typeof durationStr !== 'string') return null;
  const match = durationStr.trim().match(/^(\d+)([mhd])$/i);
  if (!match) return null;
  const multipliers = { m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
  return parseInt(match[1]) * multipliers[match[2].toLowerCase()];
}

/** Voting durations run 5 minutes to 30 days. */
export function isValidDuration(durationMs) {
  return durationMs >= 5 * 60 * 1000 && durationMs <= 30 * 24 * 60 * 60 * 1000;
}

/**
 * Tiebreakers run 5 minutes to 7 days. Every message and doc said 7 days,
 * but close-groups and close-matchup checked the 30-day voting limit and
 * `/bracket close` checked nothing at all.
 */
export function isValidTiebreakerDuration(durationMs) {
  return durationMs >= 5 * 60 * 1000 && durationMs <= 7 * 24 * 60 * 60 * 1000;
}

// ─── parsing ──────────────────────────────────────────────────────────────────

/**
 * Minimal RFC 4180 CSV: quoted fields, doubled quotes, commas and newlines
 * inside quotes, CRLF, and a leading BOM (Excel adds one on "CSV UTF-8").
 * @returns {string[][]} Rows of cells, blank lines dropped
 */
export function parseCsv(text) {
  const src = text.replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell); cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  rows.push(row);

  return rows.filter(r => r.some(c => c.trim() !== ''));
}

function isWebAddress(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Clean one title row, whatever file it came from. A year on the end of the
 * title ("The Thing (1982)") is moved into `year`: TMDB matches literally, and
 * real event names carry years.
 */
function normalizeRow(raw, rowNumber, errors) {
  const row = {
    title: String(raw.title ?? '').trim(),
    year: raw.year === undefined || raw.year === null ? '' : String(raw.year).trim(),
    group: String(raw.group ?? '').trim().toUpperCase(),
    id: raw.id === undefined || raw.id === null ? '' : String(raw.id).trim(),
    imageUrl: String(raw.imageUrl ?? '').trim(),
  };

  const stripped = stripTrailingYear(row.title);
  if (stripped.year && stripped.title) {
    row.title = stripped.title;
    if (!row.year) row.year = stripped.year;
  }

  if (!row.title && !row.id) {
    errors.push({ row: rowNumber, field: 'title', message: `Row ${rowNumber} has no title.` });
  }
  if (row.year && !/^\d{4}$/.test(row.year)) {
    errors.push({ row: rowNumber, field: 'year', message: `Row ${rowNumber}: "${row.year}" isn't a year. Use four digits, like 1982.` });
  }
  if (row.group && !(row.group.length === 1 && GROUP_LETTERS.includes(row.group))) {
    errors.push({ row: rowNumber, field: 'group', message: `Row ${rowNumber}: "${row.group}" isn't a group. Groups run A to L.` });
  }
  if (row.imageUrl && !isWebAddress(row.imageUrl)) {
    errors.push({ row: rowNumber, field: 'imageUrl', message: `Row ${rowNumber}'s image link isn't a web address.` });
  }

  return row;
}

function parseCsvFile(text, errors) {
  const table = parseCsv(text);
  if (table.length === 0) {
    errors.push({ row: null, field: null, message: 'The file is empty.' });
    return [];
  }

  const header = table[0].map(h => h.trim().toLowerCase());
  const unknown = header.filter(h => h && !CSV_COLUMNS.includes(h));
  for (const name of unknown) {
    errors.push({ row: null, field: null, message: `Unknown column "${name}". Columns are: ${CSV_COLUMNS.join(', ')}.` });
  }
  if (!header.includes('title')) {
    errors.push({ row: null, field: null, message: 'The first row must be the column names, including "title". Start from a template if unsure.' });
  }
  // A misnamed column means the file is misread; stop before guessing
  if (unknown.length > 0 || !header.includes('title')) return [];

  return table.slice(1).map((cells, i) => {
    const raw = {};
    header.forEach((name, col) => {
      if (name) raw[name === 'image_url' ? 'imageUrl' : name] = cells[col] ?? '';
    });
    return normalizeRow(raw, i + 1, errors);
  });
}

function parseJsonFile(text, errors) {
  let data;
  try {
    data = JSON.parse(text.replace(/^﻿/, ''));
  } catch (error) {
    errors.push({ row: null, field: null, message: `This isn't valid JSON: ${error.message}` });
    return { settings: {}, rows: [] };
  }

  if (!data || typeof data !== 'object' || Array.isArray(data) || data.format !== IMPORT_FORMAT) {
    errors.push({ row: null, field: null, message: `This JSON isn't a tournament file (it needs "format": "${IMPORT_FORMAT}"). Start from the template.` });
    return { settings: {}, rows: [] };
  }
  if (data.version !== IMPORT_VERSION) {
    errors.push({ row: null, field: 'version', message: `This file is version ${data.version}; this bot reads version ${IMPORT_VERSION}.` });
  }
  for (const key of Object.keys(data)) {
    if (!JSON_FIELDS.includes(key)) errors.push({ row: null, field: key, message: `Unknown field "${key}".` });
  }
  if (data.announcement !== undefined) {
    if (!data.announcement || typeof data.announcement !== 'object' || Array.isArray(data.announcement)) {
      errors.push({ row: null, field: 'announcement', message: '"announcement" must be an object with "message" and "imageUrl".' });
    } else {
      for (const key of Object.keys(data.announcement)) {
        if (!ANNOUNCEMENT_FIELDS.includes(key)) errors.push({ row: null, field: `announcement.${key}`, message: `Unknown field "announcement.${key}".` });
      }
    }
  }
  if (!Array.isArray(data.titles)) {
    errors.push({ row: null, field: 'titles', message: '"titles" must be a list.' });
  }

  const settings = {};
  for (const key of ['name', 'type', 'seeding', 'votingDuration', 'tiebreakerDuration']) {
    if (data[key] !== undefined) settings[key] = data[key];
  }
  if (data.announcement && typeof data.announcement === 'object') {
    settings.announcement = {
      message: data.announcement.message ?? '',
      imageUrl: data.announcement.imageUrl ?? '',
    };
  }

  const rows = (Array.isArray(data.titles) ? data.titles : []).map((raw, i) => {
    const rowNumber = i + 1;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      errors.push({ row: rowNumber, field: null, message: `Row ${rowNumber} isn't a title object.` });
      return normalizeRow({}, rowNumber, []);
    }
    for (const key of Object.keys(raw)) {
      if (!JSON_TITLE_FIELDS.includes(key)) errors.push({ row: rowNumber, field: key, message: `Row ${rowNumber}: unknown field "${key}".` });
    }
    return normalizeRow(raw, rowNumber, errors);
  });

  return { settings, rows };
}

/**
 * Read an uploaded CSV or JSON file. JSON is recognised by its first
 * character, so the file's name doesn't matter.
 * @returns {{kind: 'csv'|'json', settings: Object, rows: Array, errors: Array}}
 */
export function parseImportFile(text) {
  const errors = [];
  if (typeof text !== 'string' || !text.trim()) {
    return { kind: 'csv', settings: {}, rows: [], errors: [{ row: null, field: null, message: 'The file is empty.' }] };
  }

  const isJson = text.replace(/^﻿/, '').trimStart().startsWith('{');
  const { settings, rows } = isJson ? parseJsonFile(text, errors) : { settings: {}, rows: parseCsvFile(text, errors) };

  if (rows.length > MAX_ROWS) {
    errors.push({ row: null, field: null, message: `A tournament holds at most ${MAX_ROWS} titles; this file has ${rows.length}.` });
  }

  return { kind: isJson ? 'json' : 'csv', settings, rows, errors };
}

// ─── checking ─────────────────────────────────────────────────────────────────

/**
 * Check the tournament-wide settings. `name` and `type` are required only
 * for saving, since a CSV carries neither.
 */
export function validateSettings(settings, { forSave = false } = {}) {
  const errors = [];
  const add = (field, message) => errors.push({ row: null, field, message });

  const name = typeof settings.name === 'string' ? settings.name.trim() : '';
  if (forSave && !name) add('name', 'Give the tournament a name.');
  if (name.length > MAX_NAME_LENGTH) add('name', `The name is ${name.length} characters; the limit is ${MAX_NAME_LENGTH}.`);

  if (settings.type !== undefined && settings.type !== '' && !TITLE_TYPES.includes(settings.type)) {
    add('type', `"${settings.type}" isn't a type. Use one of: ${TITLE_TYPES.join(', ')}.`);
  } else if (forSave && !settings.type) {
    add('type', 'Choose what the tournament is made of: movies, TV shows, games, board games or books.');
  }

  if (settings.seeding !== undefined && !SEEDING_OPTIONS.includes(settings.seeding)) {
    add('seeding', `Seeding is "ordered" or "random", not "${settings.seeding}".`);
  }

  for (const [field, label, valid, range] of [
    ['votingDuration', 'Voting time', isValidDuration, '5m and 30d'],
    ['tiebreakerDuration', 'Tiebreaker time', isValidTiebreakerDuration, '5m and 7d'],
  ]) {
    const value = settings[field];
    if (value === undefined || value === '') continue;
    const ms = parseDuration(value);
    if (!ms) add(field, `${label} "${value}" isn't a duration. Use a number and m, h or d, like 24h.`);
    else if (!valid(ms)) add(field, `${label} must be between ${range}.`);
  }

  const announcement = settings.announcement || {};
  if (typeof announcement.message === 'string' && announcement.message.length > MAX_ANNOUNCEMENT_LENGTH) {
    add('announcement.message', `The announcement is ${announcement.message.length} characters; the limit is ${MAX_ANNOUNCEMENT_LENGTH}.`);
  }
  if (announcement.imageUrl && !isWebAddress(announcement.imageUrl)) {
    add('announcement.imageUrl', "The announcement image link isn't a web address.");
  }

  return errors;
}

function nextPowerOfTwo(n) {
  return Math.max(2, Math.pow(2, Math.ceil(Math.log2(Math.max(n, 1)))));
}

/**
 * Work out what tournament the rows describe, and everything wrong with it.
 * Any `group` makes it a groups tournament; rows without one are placed in the
 * first group with room, the same as `/bracket manage-titles` does.
 * Duplicates are judged by id when rows have one (after matching), otherwise by
 * title and year.
 * @returns {{mode, groupCount, bracketSize, byes, groups: string[], errors}}
 *   `groups[i]` is the group row i ends up in (empty in a straight bracket).
 */
export function planLineup(rows) {
  const errors = [];
  const add = (row, message) => errors.push({ row, field: row ? 'group' : null, message });
  const count = rows.length;
  const mode = rows.some(r => r.group) ? 'groups' : 'bracket';

  const seen = new Map();
  rows.forEach((r, i) => {
    const key = r.id ? `id:${r.id}` : r.title ? `t:${r.title.toLowerCase()}|${r.year || ''}` : null;
    if (!key) return;
    if (seen.has(key)) {
      errors.push({ row: i + 1, field: 'title', message: `Row ${i + 1} is the same title as row ${seen.get(key) + 1}.` });
    } else {
      seen.set(key, i);
    }
  });

  if (mode === 'bracket') {
    if (count < STRAIGHT_MIN || count > STRAIGHT_MAX) {
      add(null, count > STRAIGHT_MAX
        ? `A straight bracket holds ${STRAIGHT_MIN} to ${STRAIGHT_MAX} titles; this has ${count}. Remove titles, or give them groups to make it a groups tournament.`
        : `A straight bracket needs at least ${STRAIGHT_MIN} titles; this has ${count}.`);
    }
    const bracketSize = nextPowerOfTwo(count);
    return { mode, groupCount: null, bracketSize, byes: Math.max(0, bracketSize - count), groups: rows.map(() => ''), errors };
  }

  // Groups: size the tournament from the highest letter used and the title count
  const highest = Math.max(...rows.map(r => GROUP_LETTERS.indexOf(r.group)));
  const groupCount = Math.min(GROUPS_MAX, Math.max(highest + 1, Math.ceil(count / GROUP_SIZE)));
  const letters = GROUP_LETTERS.slice(0, groupCount).split('');
  const members = Object.fromEntries(letters.map(l => [l, 0]));

  rows.forEach(r => { if (r.group && r.group in members) members[r.group]++; });
  const groups = rows.map(r => {
    if (r.group) return r.group;
    const room = letters.find(l => members[l] < GROUP_SIZE);
    if (room) members[room]++;
    return room || '';
  });

  if (groupCount < GROUPS_MIN) {
    add(null, `A groups tournament needs at least ${GROUPS_MIN} groups (${GROUPS_MIN * GROUP_SIZE} titles); this has ${count} titles. Add titles, or clear the groups to make it a straight bracket.`);
  } else {
    for (const letter of letters) {
      const n = members[letter];
      if (n === 0) {
        add(null, `Group ${letter} is empty. Groups must run from A to ${letters.at(-1)} with no gaps.`);
      } else if (n !== GROUP_SIZE) {
        add(null, `Group ${letter} has ${n} titles; every group needs exactly ${GROUP_SIZE}.`);
      }
    }
  }
  if (groups.some(g => !g)) {
    add(null, `There are more titles than ${groupCount} groups can hold.`);
  }

  return { mode, groupCount, bracketSize: null, byes: 0, groups, errors };
}

// ─── matching ─────────────────────────────────────────────────────────────────

/**
 * Find the title a row means, through the same search `/bracket
 * manage-titles` uses. A row with an `id` skips the search.
 * @returns {Promise<{status: 'matched', entry} | {status: 'choose', candidates} | {status: 'none'} | {status: 'error', message}>}
 */
export async function resolveRow(type, row) {
  const label = getTypeLabel(type).toLowerCase();

  if (row.id) {
    try {
      const entry = await fetchEntryById(type, row.id);
      return entry ? { status: 'matched', entry } : { status: 'error', message: `No ${label} has id ${row.id}. Clear the id to search by title instead.` };
    } catch (error) {
      console.error(`[TournamentImport] Lookup failed for ${type} id ${row.id}:`, error.message);
      return { status: 'error', message: `No ${label} has id ${row.id}. Clear the id to search by title instead.` };
    }
  }

  let results;
  try {
    results = await searchTitleCandidates(type, row.title);
  } catch (error) {
    console.error(`[TournamentImport] Search failed for "${row.title}" (${type}):`, error.message);
    return { status: 'error', message: `The search failed for "${row.title}". Try again in a moment.` };
  }
  if (!results.length) return { status: 'none' };

  const candidates = results.slice(0, MAX_CANDIDATES).map(r => buildEntryFromResult(r, type));
  if (candidates.length === 1) return { status: 'matched', entry: candidates[0] };

  if (row.year) {
    const sameYear = candidates.filter(c => String(c.year) === row.year);
    if (sameYear.length === 1) return { status: 'matched', entry: sameYear[0] };
    if (sameYear.length > 1) {
      return { status: 'choose', candidates: [...sameYear, ...candidates.filter(c => String(c.year) !== row.year)] };
    }
  }
  return { status: 'choose', candidates };
}

/**
 * Resolve many rows a few at a time, so a 48-row file doesn't fire 48
 * searches at an API at once.
 */
export async function resolveRows(type, rows, { concurrency = 4 } = {}) {
  const results = new Array(rows.length);
  let next = 0;
  const worker = async () => {
    while (next < rows.length) {
      const i = next++;
      results[i] = await resolveRow(type, rows[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, worker));
  return results;
}

// ─── saving ───────────────────────────────────────────────────────────────────

/**
 * Create the tournament the form describes, replacing one still in setup.
 * Every check runs before anything is written, and if a write still fails
 * partway the previous tournament is put back.
 *
 * @param {string} guildId
 * @param {Object} params
 * @param {Object} params.settings - name, type, seeding, durations, announcement
 * @param {Array} params.rows - `{ entry, group }`: entry from resolveRow/fetchEntryById
 * @param {string} params.creatorId - used when there's no setup tournament to replace
 * @returns {{success: true, tournament} | {success: false, errors: Array}}
 */
export function saveImportedTournament(guildId, { settings, rows, creatorId }) {
  const existing = bracketManager.loadTournament(guildId);
  if (existing && !['setup', 'completed', 'cancelled'].includes(existing.status)) {
    return { success: false, errors: [{ row: null, field: null, message: `"${existing.name}" has already started voting, so its lineup can't change.` }] };
  }

  const settingErrors = validateSettings(settings, { forSave: true });
  const checkRows = rows.map(r => ({
    title: r.entry?.title || '',
    year: r.entry?.year ? String(r.entry.year) : '',
    id: r.entry?.id != null ? String(r.entry.id) : '',
    group: String(r.group || '').toUpperCase(),
  }));
  const plan = planLineup(checkRows);
  const rowErrors = rows
    .map((r, i) => (r.entry ? null : { row: i + 1, field: 'title', message: `Row ${i + 1} hasn't been matched to a title yet.` }))
    .filter(Boolean);
  const errors = [...settingErrors, ...rowErrors, ...plan.errors];
  if (errors.length > 0) return { success: false, errors };

  const previous = existing && existing.status === 'setup' ? existing : null;
  const rollback = () => {
    if (previous) bracketManager.saveTournament(guildId, previous);
    else bracketManager.deleteTournament(guildId);
  };

  const name = settings.name.trim();
  const owner = previous?.creatorId || creatorId;
  const created = plan.mode === 'bracket'
    ? bracketManager.createTournament(guildId, name, owner, plan.bracketSize)
    : bracketManager.createTournament(guildId, name, owner, 36);
  if (!created) {
    rollback();
    return { success: false, errors: [{ row: null, field: null, message: 'The tournament could not be created. Nothing was changed.' }] };
  }
  if (plan.mode === 'groups' && plan.groupCount !== created.groupCount) {
    const resized = bracketManager.resizeTournament(guildId, plan.groupCount);
    if (!resized.success) {
      rollback();
      return { success: false, errors: [{ row: null, field: null, message: `${resized.error} Nothing was changed.` }] };
    }
  }

  // Straight brackets keep row order, which Ordered seeding reads as seed order
  for (let i = 0; i < rows.length; i++) {
    const entry = { ...rows[i].entry, type: settings.type };
    if (rows[i].imageUrl) entry.customImageUrl = rows[i].imageUrl;
    const added = bracketManager.addTitle(guildId, plan.groups[i] || 'A', settings.type, entry);
    if (!added.success) {
      rollback();
      return { success: false, errors: [{ row: i + 1, field: 'title', message: `Row ${i + 1}: ${added.error} Nothing was changed.` }] };
    }
  }

  const tournament = bracketManager.loadTournament(guildId);
  if (plan.mode === 'groups') tournament.maxTitles = plan.groupCount * GROUP_SIZE;
  tournament.seeding = settings.seeding === 'ordered' ? 'ordered' : 'random';
  tournament.votingDuration = settings.votingDuration || DEFAULT_VOTING_DURATION;
  tournament.tiebreakerDuration = settings.tiebreakerDuration || DEFAULT_TIEBREAKER_DURATION;
  tournament.announcement = {
    message: settings.announcement?.message?.trim() || '',
    imageUrl: settings.announcement?.imageUrl?.trim() || '',
  };
  if (!bracketManager.saveTournament(guildId, tournament)) {
    rollback();
    return { success: false, errors: [{ row: null, field: null, message: 'The tournament could not be saved. Nothing was changed.' }] };
  }

  return { success: true, tournament };
}

// ─── export ───────────────────────────────────────────────────────────────────

/**
 * The tournament's lineup and settings in the import format, with every id
 * filled in — re-importing it needs no searching or picking. Straight
 * brackets list titles in their stored order, which is the seed order.
 */
export function buildExport(tournament) {
  const toRow = (t, group) => ({
    title: t.title,
    ...(t.year ? { year: Number(t.year) || String(t.year) } : {}),
    ...(group ? { group } : {}),
    ...(t.id != null ? { id: t.id } : {}),
    ...(t.customImageUrl ? { imageUrl: t.customImageUrl } : {}),
  });

  const titles = tournament.mode === 'bracket'
    ? (tournament.titles || []).map(t => toRow(t, null))
    : GROUP_LETTERS.slice(0, tournament.groupCount || 0).split('')
      .flatMap(letter => (tournament.groups?.[letter]?.movies || []).map(m => toRow(m, letter)));

  return {
    format: IMPORT_FORMAT,
    version: IMPORT_VERSION,
    name: tournament.name,
    // An empty tournament has no type yet; importing that asks for one
    type: tournament.type || '',
    seeding: tournament.seeding === 'ordered' ? 'ordered' : 'random',
    votingDuration: tournament.votingDuration || DEFAULT_VOTING_DURATION,
    tiebreakerDuration: tournament.tiebreakerDuration || DEFAULT_TIEBREAKER_DURATION,
    announcement: {
      message: tournament.announcement?.message || '',
      imageUrl: tournament.announcement?.imageUrl || '',
    },
    titles,
  };
}

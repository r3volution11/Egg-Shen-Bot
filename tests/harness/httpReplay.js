/**
 * Real API responses, recorded once and replayed, for TMDB, RAWG, BGG and
 * Google Books.
 *
 * The services use axios, so this swaps axios's adapter: the real service
 * code still runs — URL building, XML parsing, picking fields out of the
 * response — only the network is replaced. Replaying saved responses rather
 * than hand-written fakes is the point: a hand-written fake returns whatever
 * shape the code expects, which is how a field-name mismatch between search
 * and details results would go unnoticed.
 *
 * Record:  SIM_RECORD=1 npm test -- tests/tournament-sim.test.js
 *          (makes the real calls with the keys in .env, saves the responses)
 * Replay:  npm test   — any request not in the recording fails, loudly
 *
 * API keys are never saved: they're dropped from the recorded params and
 * request keys, and responses carry none.
 */

import fs from 'fs';
import path from 'path';
import axios from 'axios';

export const FIXTURE_FILE = path.join(process.cwd(), 'tests/fixtures/tournament-http.json');

// Query parameters that carry credentials, never part of a key or a file
const SECRET_PARAMS = new Set(['api_key', 'key', 'apikey', 'access_token', 'token']);

export const RECORDING = process.env.SIM_RECORD === '1';

/** "GET https://api.themoviedb.org/3/search/movie?page=1&query=alien" — stable, secret-free. */
export function requestKey(config) {
  const base = config.baseURL && !/^https?:/i.test(config.url || '') ? config.baseURL.replace(/\/+$/, '') + '/' + String(config.url || '').replace(/^\/+/, '') : config.url;
  const url = new URL(base);
  const params = { ...Object.fromEntries(url.searchParams), ...(config.params || {}) };
  for (const k of Object.keys(params)) {
    if (SECRET_PARAMS.has(k.toLowerCase()) || params[k] === undefined || params[k] === null) delete params[k];
  }
  const query = Object.keys(params).sort().map(k => `${k}=${encodeURIComponent(String(params[k]).toLowerCase())}`).join('&');
  return `${(config.method || 'get').toUpperCase()} ${url.origin}${url.pathname}${query ? `?${query}` : ''}`;
}

let recordings = null;
let dirty = false;
const used = new Set();
// Recorded in THIS run. A second request for the same key replays the first
// response instead of calling again: live data drifts (popularity order
// shifts minute to minute), and the later call would overwrite what an
// earlier scenario's path depended on — so replay would take a different path.
const recordedThisRun = new Set();
// Each simulator records to its own file (the tournament one by default), so
// re-recording one game can't drop another's responses
let fixtureFile = FIXTURE_FILE;
let reRecordHint = 'SIM_RECORD=1 npm test -- tests/tournament-sim.test.js';

function load(file) {
  if (recordings && file === fixtureFile) return recordings;
  fixtureFile = file;
  recordings = fs.existsSync(fixtureFile) ? JSON.parse(fs.readFileSync(fixtureFile, 'utf8')) : {};
  return recordings;
}

export function saveRecordings() {
  if (!RECORDING || !dirty) return;
  const sorted = Object.fromEntries(Object.keys(recordings).sort().map(k => [k, recordings[k]]));
  fs.mkdirSync(path.dirname(fixtureFile), { recursive: true });
  fs.writeFileSync(fixtureFile, `${JSON.stringify(sorted, null, 1)}\n`);
  dirty = false;
}

/** Keys requested this run — lets the recorder drop entries nothing uses any more. */
export function usedKeys() {
  return used;
}

/**
 * Install before importing any service: axios.create() copies the default
 * adapter when each service's client is created at import time. `file` picks
 * the recording (default: the tournament simulator's). After a
 * simulated restart (jest.resetModules) the services get a fresh axios, so
 * pass that one in.
 */
export function installHttpReplay(ax = axios, { file = FIXTURE_FILE, hint, shrink } = {}) {
  load(file);
  if (hint) reRecordHint = hint;
  // Optional: trim a response before it's saved, to keep a fixture small.
  // Replay serves exactly what was saved, so the code under test sees the
  // trimmed response in both modes.
  const keep = (key, data) => (shrink ? shrink(key, data) : data);
  const realAdapter = ax.getAdapter(['http', 'fetch']);
  ax.defaults.adapter = async (config) => {
    const key = requestKey(config);
    used.add(key);
    if (!RECORDING || recordedThisRun.has(key)) {
      const hit = recordings[key];
      if (!hit) {
        throw new Error(`No recorded response for ${key}\nRe-record with: ${reRecordHint}`);
      }
      if (hit.status >= 400) {
        const err = new Error(`Request failed with status code ${hit.status}`);
        err.response = { status: hit.status, data: hit.data, headers: {}, config };
        err.config = config;
        throw err;
      }
      return { data: hit.data, status: hit.status, statusText: 'OK', headers: { 'content-type': hit.contentType || 'application/json' }, config, request: {} };
    }
    // Recording: make the real call, keep what came back (errors too — a 404
    // is as much a response to replay as a 200)
    // The adapter returns the raw body; axios parses JSON after it. Store it
    // parsed so the fixture is readable — axios leaves an object as it is.
    const parse = (data) => {
      if (typeof data !== 'string') return data;
      try { return JSON.parse(data); } catch { return data; }
    };
    try {
      const res = await realAdapter(config);
      const data = keep(key, parse(res.data));
      recordings[key] = { status: res.status, contentType: res.headers?.['content-type'] || null, data };
      recordedThisRun.add(key);
      dirty = true;
      // Hand back the trimmed version too, so recording and replay agree
      return { ...res, data: typeof res.data === 'string' && typeof data !== 'string' ? JSON.stringify(data) : data };
    } catch (err) {
      if (err.response) {
        recordings[key] = { status: err.response.status, contentType: null, data: parse(err.response.data ?? null) };
        recordedThisRun.add(key);
        dirty = true;
      }
      throw err;
    }
  };
  // Not every caller uses axios. Nothing in the tournament flow should reach
  // the network another way; if it does, say so instead of hanging.
  globalThis.fetch = async (url) => {
    throw new Error(`Unexpected network request in a simulation: fetch(${url})`);
  };
}

/**
 * A `shrink` for TMDB: a details response carries hundreds of crew credits
 * and a discover page twenty full results, so keep only what Escape
 * Velocity's questions read — or a recording runs to megabytes. Anything else
 * passes through.
 */
export function shrinkTmdb(key, data) {
  if (!data || typeof data !== 'object') return data;
  // A discover page: the generator reads only these fields of each result
  if (Array.isArray(data.results) && /\/discover\//.test(key)) {
    return {
      page: data.page,
      total_pages: data.total_pages,
      total_results: data.total_results,
      results: data.results.map(({ id, title, name, release_date, first_air_date, vote_count }) =>
        ({ id, title, name, release_date, first_air_date, vote_count })),
    };
  }
  if (!data.credits) return data;
  const { id, title, name, release_date, first_air_date, overview, vote_count, genres,
    created_by, networks, number_of_seasons, status, keywords, poster_path, backdrop_path } = data;
  return {
    id, title, name, release_date, first_air_date, overview, vote_count,
    created_by: created_by?.map(c => ({ name: c.name })),
    networks: networks?.map(n => ({ name: n.name })),
    number_of_seasons, status, poster_path, backdrop_path,
    // Only ids are compared (movies list them under .keywords, TV under .results)
    keywords: keywords && {
      keywords: keywords.keywords?.map(k => ({ id: k.id })),
      results: keywords.results?.map(k => ({ id: k.id })),
    },
    genres: genres?.map(g => ({ id: g.id })),
    credits: {
      cast: (data.credits.cast || []).slice(0, 15).map(c => ({ name: c.name, character: c.character, order: c.order })),
      crew: (data.credits.crew || []).filter(c => c.job === 'Director').map(c => ({ name: c.name, job: c.job })),
    },
  };
}

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

function load() {
  if (recordings) return recordings;
  recordings = fs.existsSync(FIXTURE_FILE) ? JSON.parse(fs.readFileSync(FIXTURE_FILE, 'utf8')) : {};
  return recordings;
}

export function saveRecordings() {
  if (!RECORDING || !dirty) return;
  const sorted = Object.fromEntries(Object.keys(recordings).sort().map(k => [k, recordings[k]]));
  fs.mkdirSync(path.dirname(FIXTURE_FILE), { recursive: true });
  fs.writeFileSync(FIXTURE_FILE, `${JSON.stringify(sorted, null, 1)}\n`);
  dirty = false;
}

/** Keys requested this run — lets the recorder drop entries nothing uses any more. */
export function usedKeys() {
  return used;
}

/**
 * Install before importing any service: axios.create() copies the default
 * adapter when each service's client is created at import time. After a
 * simulated restart (jest.resetModules) the services get a fresh axios, so
 * pass that one in.
 */
export function installHttpReplay(ax = axios) {
  load();
  const realAdapter = ax.getAdapter(['http', 'fetch']);
  ax.defaults.adapter = async (config) => {
    const key = requestKey(config);
    used.add(key);
    if (!RECORDING) {
      const hit = recordings[key];
      if (!hit) {
        throw new Error(`No recorded response for ${key}\nRe-record with: SIM_RECORD=1 npm test -- tests/tournament-sim.test.js`);
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
      recordings[key] = { status: res.status, contentType: res.headers?.['content-type'] || null, data: parse(res.data) };
      dirty = true;
      return res;
    } catch (err) {
      if (err.response) {
        recordings[key] = { status: err.response.status, contentType: null, data: parse(err.response.data ?? null) };
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

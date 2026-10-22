#!/usr/bin/env node
/**
 * Checks src/data/escapeGenres.js against the LIVE TMDB API.
 *
 * TMDB silently ignores a filter it doesn't recognize, so a wrong keyword id
 * doesn't error — it quietly returns every title in the parent genre, and
 * "Slasher" questions would really be "any horror" questions. This proves
 * each filter takes effect:
 *
 *   - every keyword id still has the name we stored for it
 *   - adding a subgenre's keyword actually narrows the parent's results
 *   - enough well-known titles match (MIN_TITLES at 50+ votes) to build
 *     questions from; a thinner subgenre is reported, not silently used
 *
 * Read-only; needs TMDB_API_KEY in .env. Run after editing escapeGenres.js:
 *   node scripts/verify-escape-genres.js
 */

import 'dotenv/config';
import axios from 'axios';
import { config } from '../src/config.js';
import { ESCAPE_GENRES } from '../src/data/escapeGenres.js';
import { buildDiscoverParams } from '../src/services/tmdbService.js';

const MIN_TITLES = 20;

const api = axios.create({
  baseURL: config.apis.tmdb.baseUrl,
  params: { api_key: config.apis.tmdb.apiKey },
});

async function count(type, filters) {
  const { data } = await api.get(`/discover/${type}`, { params: buildDiscoverParams(type, filters) });
  return data.total_results || 0;
}

async function main() {
  const genreIds = {};
  for (const type of ['movie', 'tv']) {
    const { data } = await api.get(`/genre/${type}/list`);
    genreIds[type] = Object.fromEntries(data.genres.map(g => [g.name, g.id]));
  }

  const problems = [];
  const thin = [];

  for (const parent of ESCAPE_GENRES) {
    const ownKeywords = ['movie', 'tv'].flatMap(t => (parent[t]?.keywords || []).map(k => ({ label: `${parent.key} (${t})`, k })));
    const subKeywords = parent.subgenres.filter(s => s.keyword).map(s => ({ label: `${parent.key}/${s.key}`, k: s.keyword }));
    for (const { label, k } of [...ownKeywords, ...subKeywords]) {
      const { data } = await api.get(`/keyword/${k.id}`);
      if (data.name !== k.name) {
        problems.push(`${label}: keyword ${k.id} is "${data.name}", expected "${k.name}"`);
      }
    }

    for (const type of ['movie', 'tv']) {
      const spec = parent[type];
      if (!spec) continue;

      let parentFilters;
      if (spec.genre) {
        const id = genreIds[type][spec.genre];
        if (!id) {
          problems.push(`${parent.key} (${type}): no TMDB ${type} genre named "${spec.genre}"`);
          continue;
        }
        parentFilters = { genre: id };
      } else {
        // The same union escapeQuestions.js searches: the parent's own
        // keywords plus every subgenre offered on this media type
        parentFilters = {
          keywords: [
            ...(spec.keywords || []).map(k => k.id),
            ...parent.subgenres.filter(s => s.keyword && (!s.media || s.media.includes(type))).map(s => s.keyword.id),
          ],
        };
      }

      const parentCount = await count(type, parentFilters);
      console.log(`${parent.label} (${type}): ${parentCount}`);
      if (parentCount < MIN_TITLES) thin.push(`${parent.key} (${type}): ${parentCount}`);

      for (const sub of parent.subgenres) {
        if (sub.media && !sub.media.includes(type)) continue; // limited on purpose
        let subFilters;
        if (sub.alsoGenre) {
          const extra = genreIds[type][sub.alsoGenre];
          if (!extra || !parentFilters.genre) {
            problems.push(`${parent.key}/${sub.key} (${type}): no ${type} genre "${sub.alsoGenre}" to combine with — limit it with media`);
            continue;
          }
          // ',' is AND: both genres
          subFilters = { genre: `${parentFilters.genre},${extra}` };
        } else {
          subFilters = spec.genre
            ? { ...parentFilters, keywords: [sub.keyword.id] }
            : { keywords: [sub.keyword.id] };
        }
        const subCount = await count(type, subFilters);
        const narrowed = subCount < parentCount;
        console.log(`  ${sub.label}: ${subCount}${narrowed ? '' : '  ← DID NOT NARROW'}`);
        if (!narrowed) problems.push(`${parent.key}/${sub.key} (${type}): keyword filter had no effect`);
        if (subCount < MIN_TITLES) thin.push(`${parent.key}/${sub.key} (${type}): ${subCount}`);
      }
    }
  }

  if (thin.length) {
    // Each one needs `media` set in escapeGenres.js (or removing)
    problems.push(...thin.map(t => `thin (< ${MIN_TITLES} titles at 50+ votes): ${t}`));
  }

  if (problems.length) {
    console.error(`\n${problems.length} problem(s):\n${problems.map(p => `  ${p}`).join('\n')}`);
    process.exit(1);
  }
  console.log('\nAll keyword ids and genre names check out.');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

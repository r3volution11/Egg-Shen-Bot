/**
 * Escape Velocity's question generator, run against REAL recorded TMDB
 * responses (tests/fixtures/escape-http.json) with a seeded random source, so
 * the same questions come out every run.
 *
 * The tests assert properties every question must have rather than specific
 * titles — re-recording against today's TMDB changes which films come up,
 * not whether a question is fair.
 *
 * Record:  SIM_RECORD=1 npm test -- tests/escape-questions.test.js
 * Run:     npm test -- tests/escape-questions.test.js
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import path from 'path';
import { installHttpReplay, saveRecordings, RECORDING, shrinkTmdb } from './harness/httpReplay.js';

const FIXTURE = path.join(process.cwd(), 'tests/fixtures/escape-http.json');

installHttpReplay(undefined, { file: FIXTURE, hint: 'SIM_RECORD=1 npm test -- tests/escape-questions.test.js', shrink: shrinkTmdb });

let gen;
let tmdb;
let questions;

beforeAll(async () => {
  gen = await import('../src/utils/escapeQuestions.js');
  tmdb = await import('../src/services/tmdbService.js');
  questions = await gen.generateQuestions({
    media: ['movie', 'tv'],
    genres: ['horror', 'scifi', 'comedy'],
    want: { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4 },
    random: gen.seededRandom(1979),
  });
}, 120_000);

afterAll(() => {
  if (RECORDING) saveRecordings();
});

describe('a generated pool', () => {
  test('fills every tier', () => {
    const perTier = {};
    for (const q of questions) perTier[q.tier] = (perTier[q.tier] || 0) + 1;
    expect(perTier).toEqual({ 1: 4, 2: 4, 3: 4, 4: 4, 5: 4 });
  });

  test('every question has four distinct options and a valid answer', () => {
    for (const q of questions) {
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options.map(gen.normalize)).size).toBe(4);
      expect(q.correctIndex).toBeGreaterThanOrEqual(0);
      expect(q.correctIndex).toBeLessThan(4);
      // Discord select/button and embed line limits
      for (const o of q.options) expect(o.length).toBeLessThanOrEqual(80);
    }
  });

  test('never repeats a question', () => {
    expect(new Set(questions.map(q => q.key)).size).toBe(questions.length);
  });

  test('uses both media and several templates', () => {
    expect(new Set(questions.map(q => q.media))).toEqual(new Set(['movie', 'tv']));
    expect(new Set(questions.map(q => q.template)).size).toBeGreaterThanOrEqual(5);
  });

  test('only asks about the event\'s genres', () => {
    for (const q of questions) expect(['horror', 'scifi', 'comedy']).toContain(q.genre);
  });

  test('each tier is the title\'s real popularity plus the template\'s difficulty', async () => {
    const d = Object.fromEntries(gen.TEMPLATES.map(t => [t.id, t.d]));
    for (const q of questions) {
      const details = await tmdb.getTriviaDetails(q.media, q.source.id);
      const pop = gen.popularityTier(q.media, details.vote_count);
      expect(q.tier).toBe(Math.max(1, Math.min(5, pop + d[q.template] - 1)));
    }
  });

  test('the right answer really is right, from the title\'s own details', async () => {
    for (const q of questions) {
      const details = await tmdb.getTriviaDetails(q.media, q.source.id);
      const answer = q.options[q.correctIndex];
      const title = details.title || details.name;
      const year = String(details.release_date || details.first_air_date).slice(0, 4);
      switch (q.template) {
        case 'synopsis':
        case 'subgenre':
          // "Title (Year)", clipped to Discord's 80-character option limit
          expect(`${title} (${year})`.startsWith(answer.replace(/…$/, ''))).toBe(true);
          break;
        case 'year':
          expect(answer).toBe(year);
          break;
        case 'director':
          expect(details.credits.crew.filter(c => c.job === 'Director').map(c => c.name)).toContain(answer);
          break;
        case 'lead':
        case 'character':
          expect(details.credits.cast.map(c => c.name)).toContain(answer);
          break;
        case 'creator':
          expect(details.created_by.map(c => c.name)).toContain(answer);
          break;
        case 'network':
          expect(details.networks.map(n => n.name)).toContain(answer);
          break;
        case 'seasons':
          expect(answer).toBe(String(details.number_of_seasons));
          break;
        default:
          throw new Error(`untested template ${q.template}`);
      }
    }
  });

  test('a wrong person option was never in the title', async () => {
    for (const q of questions.filter(q => ['lead', 'director', 'creator'].includes(q.template))) {
      const details = await tmdb.getTriviaDetails(q.media, q.source.id);
      const credited = new Set([
        ...details.credits.cast.map(c => gen.normalize(c.name)),
        ...details.credits.crew.map(c => gen.normalize(c.name)),
        ...(details.created_by || []).map(c => gen.normalize(c.name)),
      ]);
      q.options.forEach((o, i) => {
        if (i !== q.correctIndex) expect(credited.has(gen.normalize(o))).toBe(false);
      });
    }
  });

  test('a wrong option in "which of these is a <subgenre>" is not in that subgenre', async () => {
    const { getEscapeGenre } = await import('../src/data/escapeGenres.js');
    const subQs = questions.filter(q => q.template === 'subgenre');
    expect(subQs.length).toBeGreaterThan(0);
    for (const q of subQs) {
      const sub = getEscapeGenre(q.genre).subgenres.find(s => s.key === q.subgenre);
      for (let i = 0; i < 4; i++) {
        const d = await tmdb.getTriviaDetails(q.media, q.optionIds[i]);
        const kws = (d.keywords.keywords || d.keywords.results || []).map(k => k.id);
        const tagged = sub.keyword ? kws.includes(sub.keyword.id) : true;
        if (i === q.correctIndex) continue; // the answer came from a search on that very keyword
        expect(tagged && Boolean(sub.keyword)).toBe(false);
      }
    }
  });

  test('a synopsis never names its own title', () => {
    for (const q of questions.filter(q => q.template === 'synopsis')) {
      const synopsis = q.text.slice(q.text.indexOf('“'));
      expect(gen.normalize(synopsis)).not.toContain(gen.normalize(q.source.title));
    }
  });
});

describe('helpers', () => {
  test('popularity tiers follow vote counts, TV on a lower scale', () => {
    expect(gen.popularityTier('movie', 25000)).toBe(1);
    expect(gen.popularityTier('movie', 500)).toBe(4);
    expect(gen.popularityTier('movie', 40)).toBeNull();
    expect(gen.popularityTier('tv', 500)).toBe(3);
  });

  test('redaction blanks the title and its words', () => {
    const text = gen.redactSynopsis('An alien stalks the crew of the Nostromo. Alien terror.', 'Alien');
    expect(text.toLowerCase()).not.toContain('alien');
    expect(text).toContain('Nostromo');
  });

  test('a decoy is ruled out by any sign it belongs to the subgenre', () => {
    const film = (genres, keywords) => ({ genres: genres.map(id => ({ id })), keywords: { keywords: keywords.map(id => ({ id })) } });
    const slasher = { subKeywordId: 12339, parentGenreId: 27 };
    // Tagged slasher but filed under Comedy, not Horror: still not a decoy
    expect(gen.isSubgenreDecoy(film([35], [12339]), slasher)).toBe(false);
    expect(gen.isSubgenreDecoy(film([27], []), slasher)).toBe(false);
    expect(gen.isSubgenreDecoy(film([878], [4379]), slasher)).toBe(true);
    // Romantic comedy is Comedy AND Romance: a Romance film can't be a decoy
    expect(gen.isSubgenreDecoy(film([10749], []), { alsoGenreId: 10749, parentGenreId: 35 })).toBe(false);
    // TV horror is defined by keywords; a show with any of them is horror
    const show = { genres: [], keywords: { results: [{ id: 315058 }] } };
    expect(gen.isSubgenreDecoy(show, { subKeywordId: 12377, parentKeywords: [315058, 12377] })).toBe(false);
  });

  test('the same seed gives the same sequence', () => {
    const a = gen.seededRandom(7);
    const b = gen.seededRandom(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  test('shortfall asks only for what each tier is missing', () => {
    expect(gen.shortfall({ 1: 25, 2: 20, 3: 0, 4: 30, 5: 24 })).toEqual({ 2: 5, 3: 25, 5: 1 });
  });
});

/**
 * Builds Escape Velocity's questions from real TMDB data.
 *
 * Every fact, answer and wrong option comes from TMDB: a question is a
 * template filled from one title's details, with wrong options drawn from
 * similar titles in the same genre so they're believable. (AI may later
 * reword a question's text, never its options or answer.)
 *
 * Difficulty has two parts:
 *   - how well-known the title is, as a popularity tier 1-5 from its TMDB
 *     vote count (Alien is tier 1; a cult slasher with 200 votes is tier 5)
 *   - how hard the template is, 1-3 (naming a film from its synopsis is
 *     easier than naming who played a supporting character)
 * A question's tier is popularity + template difficulty − 1, clamped to 1-5,
 * and stages draw from tiers three at a time (escapeStore.tierForStage).
 */

import { getGenres, discoverPage, getTriviaDetails } from '../services/tmdbService.js';
import { getEscapeGenre, genreSupports, subgenreSupports } from '../data/escapeGenres.js';

/** Vote counts at which a title is popularity tier 1, 2, 3, 4, 5. TV gets fewer votes. */
const POPULARITY = {
  movie: [10000, 3000, 1000, 300, 100],
  tv: [3000, 1000, 300, 100, 30],
};

/** Questions per tier an event aims for. */
export let TARGET_PER_TIER = 25;

/** Test-only: a smaller pool keeps simulator recordings small. */
export function _setTargetPerTier(n) {
  TARGET_PER_TIER = n;
}

const NOUN = { movie: 'film', tv: 'show' };
const MAX_OPTION = 80;

// ── small helpers ───────────────────────────────────────────────────────

/** A seeded random source, so a generation run can be replayed in tests. */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Lowercase, accents and punctuation stripped, spaces collapsed — for comparing text. */
export function normalize(text) {
  return String(text || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const pick = (list, random) => list[Math.floor(random() * list.length)];

function shuffle(list, random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const titleOf = (d) => d.title || d.name || '';
const yearOf = (d) => String(d.release_date || d.first_air_date || '').slice(0, 4) || null;
const clip = (text) => (text.length > MAX_OPTION ? `${text.slice(0, MAX_OPTION - 1)}…` : text);
/** "Alien (1979)" — the year tells apart titles that share a name. */
const labelOf = (d) => clip(yearOf(d) ? `${titleOf(d)} (${yearOf(d)})` : titleOf(d));
const article = (word) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

/** Popularity tier 1-5 from a title's vote count, or null when too obscure to ask about. */
export function popularityTier(media, voteCount) {
  const idx = POPULARITY[media].findIndex(min => voteCount >= min);
  return idx === -1 ? null : idx + 1;
}

/** The vote-count range that targets a popularity tier. */
function voteBand(media, pop) {
  const t = POPULARITY[media];
  return { minVotes: t[pop - 1], maxVotes: pop === 1 ? undefined : t[pop - 2] - 1 };
}

/**
 * Turn the correct option and three wrong ones into a question, or null if
 * the options aren't four distinct things — two that read the same would
 * make the question unanswerable.
 */
function finish(text, answer, wrong, random, ids = null) {
  const options = [answer, ...wrong.slice(0, 3)].map(o => clip(String(o)));
  if (options.length < 4) return null;
  if (new Set(options.map(normalize)).size < 4) return null;
  const order = shuffle([0, 1, 2, 3], random);
  return {
    text,
    options: order.map(i => options[i]),
    correctIndex: order.indexOf(0),
    // For title options: which TMDB title each one is, so a wrong option can
    // be checked against its own data (tests do; a dispute could later)
    ...(ids ? { optionIds: order.map(i => ids[i]) } : {}),
  };
}

/** Up to three wrong TITLE options with their ids, labels distinct from the answer's. */
function titleOptions(list, details, random) {
  const answer = normalize(labelOf(details));
  const seen = new Set([answer]);
  const out = [];
  for (const d of shuffle(list, random)) {
    const key = normalize(labelOf(d));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(d);
    if (out.length === 3) break;
  }
  return out;
}

/** Up to `n` distinct values from `list` that pass `ok`, in random order. */
function distinct(list, n, random, ok = () => true) {
  const seen = new Set();
  const out = [];
  for (const v of shuffle(list, random)) {
    const key = normalize(v);
    if (!key || seen.has(key) || !ok(v)) continue;
    seen.add(key);
    out.push(v);
    if (out.length === n) break;
  }
  return out;
}

/** Everyone credited on a title, normalized — so a wrong option is never really in it. */
function creditedNames(d) {
  return new Set([
    ...(d.credits?.cast || []).map(c => normalize(c.name)),
    ...(d.credits?.crew || []).map(c => normalize(c.name)),
    ...(d.created_by || []).map(c => normalize(c.name)),
  ]);
}

const directorOf = (d) => (d.credits?.crew || []).find(c => c.job === 'Director')?.name || null;
const leadOf = (d) => (d.credits?.cast || []).find(c => c.order === 0)?.name || d.credits?.cast?.[0]?.name || null;
const keywordIds = (d) => (d.keywords?.keywords || d.keywords?.results || []).map(k => k.id);
const genreIdsOf = (d) => (d.genres || []).map(g => g.id);

/**
 * A synopsis with the title blanked out. Words of the title are blanked too
 * ("the shark" gives away *Jaws* less than "Jaws" does, but "Alien" in the
 * synopsis of *Alien* gives it away completely).
 */
export function redactSynopsis(overview, title) {
  let text = String(overview || '');
  const words = normalize(title).split(' ').filter(w => w.length >= 4);
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  text = text.replace(new RegExp(escape(title), 'gi'), '▇▇▇');
  for (const w of words) text = text.replace(new RegExp(`\\b${escape(w)}\\b`, 'gi'), '▇▇▇');
  if (text.length > 280) text = `${text.slice(0, 280).replace(/\s+\S*$/, '')}…`;
  return text;
}

// ── templates ───────────────────────────────────────────────────────────

/**
 * Each template: `d` (difficulty 1-3), which media it suits, whether it
 * needs a subgenre, and `build(ctx)` → {text, options, correctIndex} | null.
 * ctx: { media, details, others (details of similar titles), parent, sub,
 * decoys (details of titles NOT in the subgenre), tier, random }.
 */
export const TEMPLATES = [
  {
    id: 'synopsis', d: 1, media: ['movie', 'tv'],
    build({ media, details, others, random }) {
      if ((details.overview || '').length < 80) return null;
      const text = `Which ${NOUN[media]} is this? “${redactSynopsis(details.overview, titleOf(details))}”`;
      const wrong = titleOptions(others, details, random);
      return finish(text, labelOf(details), wrong.map(labelOf), random, [details.id, ...wrong.map(w => w.id)]);
    },
  },
  {
    id: 'lead', d: 1, media: ['movie'],
    build({ details, others, random }) {
      const lead = leadOf(details);
      if (!lead) return null;
      const credited = creditedNames(details);
      const wrong = distinct(others.map(leadOf).filter(Boolean), 3, random, n => !credited.has(normalize(n)));
      return finish(`Who stars in ${labelOf(details)}?`, lead, wrong, random);
    },
  },
  {
    id: 'year', d: 2, media: ['movie', 'tv'],
    build({ media, details, tier, random }) {
      const year = Number(yearOf(details));
      if (!year) return null;
      // Wrong years crowd closer the harder the tier
      const [lo, hi] = tier <= 2 ? [4, 12] : tier === 3 ? [2, 6] : [1, 3];
      const latest = new Date().getUTCFullYear();
      const candidates = [];
      for (let off = lo; off <= hi; off++) candidates.push(year - off, year + off);
      const wrong = distinct(candidates.filter(y => y <= latest && y > 1900).map(String), 3, random);
      const text = media === 'movie'
        ? `In what year was *${titleOf(details)}* released?`
        : `In what year did *${titleOf(details)}* first air?`;
      return finish(text, String(year), wrong, random);
    },
  },
  {
    id: 'director', d: 2, media: ['movie'],
    build({ details, others, random }) {
      const director = directorOf(details);
      if (!director) return null;
      const credited = creditedNames(details); // co-directors and cast-turned-directors
      const wrong = distinct(others.map(directorOf).filter(Boolean), 3, random, n => !credited.has(normalize(n)));
      return finish(`Who directed ${labelOf(details)}?`, director, wrong, random);
    },
  },
  {
    id: 'subgenre', d: 2, media: ['movie', 'tv'], needsSub: true,
    build({ media, details, decoys, sub, random }) {
      const label = sub.label.toLowerCase();
      const wrong = titleOptions(decoys, details, random);
      return finish(`Which of these is ${article(label)} ${label} ${NOUN[media]}?`, labelOf(details), wrong.map(labelOf), random, [details.id, ...wrong.map(w => w.id)]);
    },
  },
  {
    id: 'creator', d: 2, media: ['tv'],
    build({ details, others, random }) {
      const creator = details.created_by?.[0]?.name;
      if (!creator) return null;
      const credited = creditedNames(details);
      const wrong = distinct(others.map(o => o.created_by?.[0]?.name).filter(Boolean), 3, random, n => !credited.has(normalize(n)));
      return finish(`Who created ${labelOf(details)}?`, creator, wrong, random);
    },
  },
  {
    id: 'network', d: 2, media: ['tv'],
    build({ details, others, random }) {
      const network = details.networks?.[0]?.name;
      if (!network) return null;
      const own = new Set((details.networks || []).map(n => normalize(n.name)));
      const wrong = distinct(others.flatMap(o => (o.networks || []).map(n => n.name)), 3, random, n => !own.has(normalize(n)));
      return finish(`${labelOf(details)} originally aired on which network?`, network, wrong, random);
    },
  },
  {
    id: 'seasons', d: 3, media: ['tv'],
    build({ details, random }) {
      // Only a finished show: an ongoing one's count changes under the question
      if (!['Ended', 'Canceled'].includes(details.status)) return null;
      const n = details.number_of_seasons;
      if (!n || n < 1) return null;
      const near = [n - 2, n - 1, n + 1, n + 2, n + 3].filter(x => x >= 1).map(String);
      const wrong = distinct(near, 3, random);
      return finish(`How many seasons did ${labelOf(details)} run for?`, String(n), wrong, random);
    },
  },
  {
    id: 'character', d: 3, media: ['movie', 'tv'],
    build({ details, random }) {
      const cast = (details.credits?.cast || []).filter(c => c.character && c.name).slice(0, 10);
      const candidates = cast.slice(1, 6).filter(c => !/\b(self|himself|herself|voice|uncredited)\b/i.test(c.character));
      if (!candidates.length || cast.length < 4) return null;
      const role = pick(candidates, random);
      // Someone else credited with the same part would also be a right answer
      if (cast.some(c => c !== role && normalize(c.character) === normalize(role.character))) return null;
      const wrong = distinct(cast.filter(c => c !== role).map(c => c.name), 3, random, n => normalize(n) !== normalize(role.name));
      return finish(`Who played ${role.character} in ${labelOf(details)}?`, role.name, wrong, random);
    },
  },
];

// ── generation ──────────────────────────────────────────────────────────

/**
 * The discover filters for a genre (and optionally one of its subgenres) on
 * a media type. Genre names resolve through getGenres — never hardcoded ids.
 */
async function filtersFor(ctx, parent, media, sub) {
  if (!ctx.genreIds[media]) {
    const list = await getGenres(media);
    ctx.genreIds[media] = Object.fromEntries(list.map(g => [g.name, g.id]));
  }
  const ids = ctx.genreIds[media];
  const spec = parent[media];
  const base = spec.genre
    ? { genre: ids[spec.genre] }
    : {
      keywords: [
        ...(spec.keywords || []).map(k => k.id),
        ...parent.subgenres.filter(s => s.keyword && subgenreSupports(s, media)).map(s => s.keyword.id),
      ],
    };
  if (spec.genre && !base.genre) throw new Error(`No TMDB ${media} genre named "${spec.genre}"`);
  if (!sub) return base;
  if (sub.alsoGenre) {
    const extra = ids[sub.alsoGenre];
    if (!extra || !base.genre) return null;
    return { genre: `${base.genre},${extra}` }; // ',' is AND
  }
  return spec.genre ? { ...base, keywords: [sub.keyword.id] } : { keywords: [sub.keyword.id] };
}

/** One page of candidates, cached for the run. A random early page, so events differ. */
async function candidates(ctx, media, filters) {
  const key = `${media}:${JSON.stringify(filters)}`;
  if (!ctx.pages.has(key)) {
    const first = await discoverPage(media, filters);
    const pages = Math.min(first.total_pages, 3);
    const page = pages > 1 ? 1 + Math.floor(ctx.random() * pages) : 1;
    const chosen = page === 1 ? first : await discoverPage(media, { ...filters, page });
    ctx.pages.set(key, chosen.results.filter(r => titleOf(r)));
  }
  return ctx.pages.get(key);
}

async function detailsOf(ctx, media, id) {
  const key = `${media}:${id}`;
  if (!ctx.details.has(key)) ctx.details.set(key, await getTriviaDetails(media, id));
  return ctx.details.get(key);
}

/** Details for up to `n` titles from `list` other than `exceptId`. */
async function detailsFor(ctx, media, list, n, exceptId) {
  const out = [];
  for (const r of shuffle(list.filter(r => r.id !== exceptId), ctx.random).slice(0, n)) {
    try { out.push(await detailsOf(ctx, media, r.id)); } catch { /* skip that one */ }
  }
  return out;
}

/**
 * Titles that are NOT in a subgenre, for "which of these is a slasher?":
 * drawn from a different genre at similar popularity, and checked against
 * their own keywords and genres — a sci-fi film tagged slasher would make
 * two right answers.
 */
async function subgenreDecoys(ctx, media, parent, sub, band, genres) {
  const others = genres.filter(g => g.key !== parent.key && genreSupports(g, media));
  if (!others.length) return [];
  const other = pick(others, ctx.random);
  const filters = await filtersFor(ctx, other, media, null);
  const list = await candidates(ctx, media, { ...filters, ...band });
  const details = await detailsFor(ctx, media, list, 6, null);
  const alsoId = sub.alsoGenre ? ctx.genreIds[media][sub.alsoGenre] : null;
  const parentId = parent[media].genre ? ctx.genreIds[media][parent[media].genre] : null;
  // A keyword-defined parent (TV Horror) is "in the genre" by any of its keywords
  const parentKeywords = parentId ? [] : (await filtersFor(ctx, parent, media, null)).keywords;
  return details.filter(d => isSubgenreDecoy(d, {
    subKeywordId: sub.keyword?.id, alsoGenreId: alsoId, parentGenreId: parentId, parentKeywords,
  }));
}

/**
 * Whether a title is safely NOT in a subgenre (or its parent), so it can be a
 * wrong option for "which of these is a ‹subgenre›?". Any sign it belongs —
 * the subgenre's keyword, its second genre, the parent genre, or one of a
 * keyword-defined parent's keywords — rules it out.
 */
export function isSubgenreDecoy(details, { subKeywordId = null, alsoGenreId = null, parentGenreId = null, parentKeywords = [] }) {
  const kws = keywordIds(details);
  const genres = genreIdsOf(details);
  if (subKeywordId && kws.includes(subKeywordId)) return false;
  if (alsoGenreId && genres.includes(alsoGenreId)) return false;
  if (parentGenreId && genres.includes(parentGenreId)) return false;
  if (parentKeywords.some(k => kws.includes(k))) return false;
  return true;
}

/**
 * Generate questions for an event.
 *
 * @param {object} opts
 * @param {string[]} opts.media - 'movie' | 'tv'
 * @param {string[]} opts.genres - parent genre keys
 * @param {Object<number, number>} opts.want - how many to make per tier, e.g. {1: 25, 2: 25, …}
 * @param {Set<string>} [opts.existingKeys] - questions already in the pool
 * @param {() => number} [opts.random]
 * @param {(progress: {made: number, wanted: number}) => void} [opts.onProgress]
 * @returns {Promise<object[]>} questions ready for escapeStore.addQuestions
 */
export async function generateQuestions({ media, genres, want, existingKeys = new Set(), random = Math.random, onProgress }) {
  const parents = genres.map(getEscapeGenre).filter(Boolean);
  const need = { ...want };
  const wanted = Object.values(need).reduce((a, b) => a + b, 0);
  const ctx = { random, genreIds: {}, pages: new Map(), details: new Map() };
  const keys = new Set(existingKeys);
  const out = [];
  let attempts = 0;

  while (out.length < wanted && attempts < wanted * 8) {
    attempts++;
    const openTiers = Object.keys(need).map(Number).filter(t => need[t] > 0);
    if (!openTiers.length) break;
    const tier = pick(openTiers, random);

    const playable = media.filter(m => parents.some(p => genreSupports(p, m)));
    if (!playable.length) break;
    const m = pick(playable, random);
    const parent = pick(parents.filter(p => genreSupports(p, m)), random);
    const subs = parent.subgenres.filter(s => subgenreSupports(s, m));
    const sub = subs.length && random() < 0.6 ? pick(subs, random) : null;

    // A template whose difficulty can land on this tier from some popularity
    const fits = TEMPLATES.filter(t => t.media.includes(m) && (!t.needsSub || sub) && tier - t.d + 1 >= 1 && tier - t.d + 1 <= 5);
    if (!fits.length) continue;
    const template = pick(fits, random);
    const pop = tier - template.d + 1;
    const band = voteBand(m, pop);

    try {
      const filters = await filtersFor(ctx, parent, m, sub);
      if (!filters) continue;
      const list = await candidates(ctx, m, { ...filters, ...band });
      const fresh = list.filter(r => !keys.has(`${template.id}:${m}:${r.id}`));
      if (!fresh.length) continue;
      const subject = pick(fresh, random);
      const details = await detailsOf(ctx, m, subject.id);

      // Its real popularity decides its tier, whatever band it came from
      const realPop = popularityTier(m, details.vote_count || 0);
      if (!realPop) continue;
      const realTier = Math.max(1, Math.min(5, realPop + template.d - 1));
      if (!(need[realTier] > 0)) continue;

      const others = template.id === 'subgenre' || template.id === 'year' || template.id === 'seasons' || template.id === 'character'
        ? []
        : await detailsFor(ctx, m, list, 5, subject.id);
      const decoys = template.id === 'subgenre' ? await subgenreDecoys(ctx, m, parent, sub, band, parents) : [];

      const built = template.build({ media: m, details, others, decoys, parent, sub, tier: realTier, random });
      if (!built) continue;

      const key = `${template.id}:${m}:${subject.id}`;
      keys.add(key);
      need[realTier]--;
      out.push({
        key,
        media: m,
        genre: parent.key,
        subgenre: sub?.key || null,
        tier: realTier,
        template: template.id,
        ...built,
        source: { type: m, id: subject.id, title: titleOf(details), year: yearOf(details) },
      });
      onProgress?.({ made: out.length, wanted });
    } catch (error) {
      console.error(`[Escape] Question attempt failed (${template.id}, ${m}):`, error.message);
    }
  }

  return out;
}

/** How many more questions each tier needs to reach the target. */
export function shortfall(poolCounts, target = TARGET_PER_TIER) {
  const want = {};
  for (let t = 1; t <= 5; t++) {
    const n = Math.max(0, target - (poolCounts[t] || 0));
    if (n) want[t] = n;
  }
  return want;
}

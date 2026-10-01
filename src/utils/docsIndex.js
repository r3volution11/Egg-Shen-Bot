/**
 * The bot's own documentation (docs/), split into searchable sections — the
 * source /eggshen-ask answers from.
 *
 * Only the "using the bot" pages are indexed: guides, commands, features and
 * server configuration. The changelog and self-hosting pages (installing,
 * API keys, the developer API) are left out — a Discord member can't act on
 * them, and they pull answers toward server setup.
 *
 * A guide's quick steps and a page's FAQ live in frontmatter (they're shown on
 * the site by <QuickSteps /> and <FaqList />), so they're indexed from there:
 * they're the best answers the docs have.
 *
 * Built once, on first use, from the files shipped with the bot — no network,
 * and self-hosted bots answer from their own copy.
 */

import { readFileSync, readdirSync, statSync, writeFileSync, existsSync, renameSync } from 'fs';
import crypto from 'crypto';
import { join, relative, dirname, posix } from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';
import { config } from '../config.js';
import { embedTexts, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from '../services/aiService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = process.env.DOCS_DIR || join(__dirname, '../../docs');
// Embeddings of each section, so they're computed once (and again only for
// sections whose text changed). Gitignored; safe to delete.
const EMBEDDINGS_FILE = process.env.DOCS_EMBEDDINGS_FILE || join(__dirname, '../../docs_embeddings.json');

/** Pages a Discord member can't act on. Paths relative to docs/. */
const EXCLUDED = new Set([
  'index.md', // the site's home page: marketing, not instructions
  'changelog.md',
  'installation.md',
  'api-keys.md',
  'api/reference.md',
  'acknowledgements.md',
  // /eggshen-ask's own page: its examples are phrased as questions, so they
  // matched every question asked ("how do I stop spam" got the example list)
  'commands/ask.md',
]);

let cached = null;

// ─── text helpers ─────────────────────────────────────────────────────────────

/** VitePress's heading anchor (@mdit-vue/shared slugify), so links land on the right heading. */
export function slugify(text) {
  return String(text)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'“”‘’<>,.?/]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^(\d)/, '_$1')
    .toLowerCase();
}

/** docs/guides/tournaments/faq.md → https://eggshenbot.com/guides/tournaments/faq.html */
function pageUrl(relPath) {
  const base = String(config.docsUrl || 'https://eggshenbot.com').replace(/\/+$/, '');
  const path = relPath.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '.html');
  return `${base}/${path}`;
}

/** Docs links are site-relative; in Discord they need the full address. */
function absolutizeLinks(text, relPath) {
  const base = String(config.docsUrl || 'https://eggshenbot.com').replace(/\/+$/, '');
  const pageDir = posix.dirname(`/${relPath}`);
  return text.replace(/\]\(((?:\.{1,2}\/|\/)[^)\s]*)\)/g, (_, href) => {
    const [path, hash] = href.split('#');
    let abs = path.startsWith('/') ? path : posix.normalize(posix.join(pageDir, path));
    if (abs.endsWith('/')) abs = abs || '/';
    else if (!/\.[a-z0-9]+$/i.test(abs)) abs += '.html';
    return `](${base}${abs}${hash ? `#${hash}` : ''})`;
  });
}

/** Markdown as Discord can show it: tables flattened, page-only markup removed. */
function forDiscord(text) {
  return text
    .split('\n')
    .filter(line => !/^\s*\|?\s*:?-{3,}/.test(line)) // table separator rows
    .map(line => (/^\s*\|.*\|\s*$/.test(line)
      ? line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()).filter(Boolean).join(' · ')
      : line))
    .filter(line => !/^\s*:::/.test(line) && !/^\s*<\/?[A-Za-z][^>]*>\s*$/.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─── search ───────────────────────────────────────────────────────────────────

const STOPWORDS = new Set('a an and are as at be but by can do does for from how i if in into is it its me my of on or so that the their them then there these this to up want was we what when where which who why will with would you your'.split(' '));

// The words people use for what the docs call something else
const SYNONYMS = {
  team: 'title', teams: 'title', entrant: 'title', entrants: 'title', contestant: 'title', contestants: 'title', movie: 'title', movies: 'title',
  // The stemmer makes "spamming" "spamm"; the docs say "spam"
  spamming: 'spam', spammer: 'spam', spammers: 'spam', flood: 'spam', flooding: 'spam',
  competition: 'tournament', contest: 'tournament', bracket: 'tournament',
  begin: 'open', start: 'open', starting: 'open', launch: 'open',
  end: 'close', finish: 'close', stop: 'close',
  // Not "versus"/"battle": those are what the AI *image* command calls its
  // two-title pictures, and pulled matchup questions there
  match: 'matchup', matches: 'matchup', vs: 'matchup',
  allow: 'toggle', permission: 'toggle', permissions: 'toggle', restrict: 'toggle', block: 'toggle', disable: 'toggle', enable: 'toggle', access: 'toggle',
  countdown: 'time', remaining: 'time', left: 'time',
  spreadsheet: 'csv', excel: 'csv', import: 'csv', upload: 'csv',
};

function stem(word) {
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('es') && !word.endsWith('ses')) return word.slice(0, -1);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

// Phrases whose meaning is lost once split into words
const PHRASES = [
  [/\bwho can\b/g, ' who can toggle '],
  [/\bturn (?:on|off)\b/g, ' toggle '],
  [/\bhow long\b/g, ' time '],
  // "stop people spamming" is about preventing spam, not /timer stop
  [/\b(?:stop|prevent|block)\s+(?:\w+\s+){0,2}?(?:spam\w*|flood\w*|abus\w*)/g, ' spam abuse rate limit '],
];

export function tokenize(text) {
  let lower = String(text).toLowerCase();
  for (const [pattern, replacement] of PHRASES) lower = lower.replace(pattern, replacement);
  return lower
    .replace(/[`*_[\](){}<>#|:,.!?;"'“”]/g, ' ')
    .split(/[\s/-]+/) // hyphens too: `open-matchup` should match "open a matchup"
    .filter(w => w && !STOPWORDS.has(w))
    .flatMap(w => (SYNONYMS[w] ? [stem(w), SYNONYMS[w]] : [stem(w)]));
}

// ─── building the index ───────────────────────────────────────────────────────

function markdownFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (name.startsWith('.') || name === 'public' || name === 'node_modules') return [];
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return markdownFiles(full);
    return name.endsWith('.md') ? [full] : [];
  });
}

function splitFrontmatter(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { fm: {}, body: source };
  let fm = {};
  try { fm = YAML.parse(match[1]) || {}; } catch { fm = {}; }
  return { fm, body: source.slice(match[0].length) };
}

function cleanTitle(title) {
  return String(title || '').replace(/\s+[-|–]\s+Egg Shen Bot$/i, '').trim();
}

/**
 * Sections of one page. Headings at ## and ### start a section; #### and
 * deeper stay inside their parent. Code blocks are kept — they're where the
 * commands are.
 */
function pageSections(relPath, source) {
  const { fm, body } = splitFrontmatter(source);
  const url = pageUrl(relPath);
  const h1 = body.match(/^#\s+(.+)$/m)?.[1]?.replace(/`/g, '').trim();
  const pageTitle = cleanTitle(fm.title) || h1 || relPath;
  const sections = [];
  const add = (heading, anchor, text, kind = 'section') => {
    const display = forDiscord(absolutizeLinks(text, relPath));
    if (!display) return;
    sections.push({ page: pageTitle, pageUrl: url, heading, url: anchor ? `${url}#${anchor}` : url, text: display, kind });
  };

  if (fm.howto?.steps?.length) {
    const steps = fm.howto.steps.map((s, i) => `${i + 1}. **${s.name}.** ${s.text}`).join('\n');
    add(fm.howto.name || 'Quick steps', null, steps, 'steps');
  }
  for (const item of fm.faq || []) {
    add(item.q, slugify(item.q), item.a, 'faq');
  }

  let heading = null;
  let anchor = null;
  let lines = [];
  let inFence = false;
  const flush = () => {
    const text = lines.join('\n').trim();
    if (text) add(heading || pageTitle, anchor, text);
    lines = [];
  };
  for (const line of body.split('\n')) {
    if (/^```/.test(line)) inFence = !inFence;
    const m = !inFence && line.match(/^(#{1,3})\s+(.+?)\s*$/);
    if (m) {
      flush();
      if (m[1] === '#') { heading = null; anchor = null; continue; }
      const plain = m[2].replace(/`/g, '').replace(/\s*\{#[^}]+\}\s*$/, '');
      heading = plain;
      anchor = slugify(plain);
      continue;
    }
    lines.push(line);
  }
  flush();
  return sections;
}

function buildIndex() {
  const sections = [];
  for (const file of markdownFiles(DOCS_DIR)) {
    const rel = relative(DOCS_DIR, file).replace(/\\/g, '/');
    if (EXCLUDED.has(rel)) continue;
    sections.push(...pageSections(rel, readFileSync(file, 'utf8')));
  }

  // BM25 over heading, page title and text (heading counts most)
  const docs = sections.map(s => {
    const terms = [...tokenize(s.heading), ...tokenize(s.heading), ...tokenize(s.heading), ...tokenize(s.page), ...tokenize(s.page), ...tokenize(s.text)];
    const tf = new Map();
    for (const t of terms) tf.set(t, (tf.get(t) || 0) + 1);
    return { tf, length: terms.length };
  });
  const df = new Map();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) || 0) + 1);
  const avgLength = docs.reduce((n, d) => n + d.length, 0) / Math.max(1, docs.length);
  return { sections, docs, df, avgLength };
}

export function getDocsIndex() {
  if (!cached) cached = buildIndex();
  return cached;
}

/** For tests: forget the cached index. */
export function resetDocsIndex() {
  cached = null;
  sectionVectors = null;
}

// ─── semantic search (with AI) ────────────────────────────────────────────────

let sectionVectors = null;

const sectionKey = (s) => crypto.createHash('sha1')
  .update(`${EMBEDDING_MODEL}:${EMBEDDING_DIMENSIONS}:${s.page}\n${s.heading}\n${s.text}`)
  .digest('hex');

function loadVectorCache() {
  try {
    return existsSync(EMBEDDINGS_FILE) ? JSON.parse(readFileSync(EMBEDDINGS_FILE, 'utf8')) : {};
  } catch {
    return {};
  }
}

/** Vectors for every section, embedding only those not cached yet. null if embedding isn't possible. */
async function getSectionVectors() {
  if (sectionVectors) return sectionVectors;
  const { sections } = getDocsIndex();
  const cache = loadVectorCache();
  const keys = sections.map(sectionKey);
  const missing = keys.map((k, i) => (cache[k] ? null : i)).filter(i => i !== null);

  if (missing.length) {
    const vectors = await embedTexts(missing.map(i => `${sections[i].page} › ${sections[i].heading}\n${sections[i].text}`));
    if (!vectors) return null;
    missing.forEach((i, n) => { cache[keys[i]] = vectors[n]; });
    // Keep only current sections, and write atomically
    const fresh = Object.fromEntries(keys.map(k => [k, cache[k]]));
    try {
      writeFileSync(`${EMBEDDINGS_FILE}.tmp`, JSON.stringify(fresh));
      renameSync(`${EMBEDDINGS_FILE}.tmp`, EMBEDDINGS_FILE);
    } catch (error) {
      console.error('[docsIndex] Could not save embeddings cache:', error.message);
    }
  }
  sectionVectors = keys.map(k => cache[k]);
  return sectionVectors;
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/**
 * Search by meaning as well as words: "how do I stop people spamming the
 * bot" shares almost no words with the rate-limiting docs. Blends embedding
 * similarity (65%) with the keyword score (35%). Falls back to keywords
 * alone if embeddings aren't available.
 */
export async function searchDocsSemantic(question, { limit = 5 } = {}) {
  const vectors = await getSectionVectors();
  const [queryVector] = (vectors && await embedTexts([question])) || [];
  if (!vectors || !queryVector) return searchDocs(question, { limit });

  const { sections } = getDocsIndex();
  const keyword = searchDocs(question, { limit: sections.length });
  const maxKeyword = keyword[0]?.score || 1;
  const keywordByIndex = new Map(keyword.map(k => [k.index, k.score / maxKeyword]));
  const kindBoost = { steps: 1.08, faq: 1.05, section: 1 };

  return sections
    .map((s, i) => ({
      ...s,
      index: i,
      score: (0.65 * cosine(queryVector, vectors[i]) + 0.35 * (keywordByIndex.get(i) || 0)) * kindBoost[s.kind],
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * The sections that best answer a question, best first.
 * @returns {Array<{page, pageUrl, heading, url, text, kind, score}>}
 */
export function searchDocs(question, { limit = 5 } = {}) {
  const { sections, docs, df, avgLength } = getDocsIndex();
  const terms = [...new Set(tokenize(question))];
  if (terms.length === 0) return [];
  const N = docs.length;
  const k1 = 1.4;
  const b = 0.75;
  const kindBoost = { steps: 1.35, faq: 1.25, section: 1 };

  return docs
    .map((d, i) => {
      let score = 0;
      for (const t of terms) {
        const f = d.tf.get(t);
        if (!f) continue;
        const idf = Math.log(1 + (N - df.get(t) + 0.5) / (df.get(t) + 0.5));
        score += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * (d.length / avgLength)));
      }
      return { ...sections[i], index: i, score: score * kindBoost[sections[i].kind] };
    })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

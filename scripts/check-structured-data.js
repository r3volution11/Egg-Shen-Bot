#!/usr/bin/env node
/**
 * Checks the built docs site (docs/.vitepress/dist) for the SEO and
 * schema.org markup that docs/.vitepress/seo.js produces. Run after
 * `npm run docs:build`; the docs deploy runs it and fails on any error.
 *
 * Every page must have:
 *   - exactly one canonical URL, its own (one site-wide canonical once told
 *     search engines every page was the home page), unique across the site
 *   - one og:url matching it, an og:title and an og:description
 *   - one JSON-LD block that parses, with WebSite, SoftwareApplication, the
 *     page and its BreadcrumbList
 *   - no aggregateRating (a self-made rating violates Google's guidelines)
 * And structured data may only describe what the page shows: every HowTo
 * step and every FAQ question and answer must appear in the page's text.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';

const ROOT = fileURLToPath(new URL('../docs/.vitepress/dist', import.meta.url));
const SITE = 'https://eggshenbot.com';

function htmlFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === 'assets' ? [] : htmlFiles(full);
    return name.endsWith('.html') ? [full] : [];
  });
}

const decode = (s) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

/** The words a reader sees in the page body. */
function visibleText(html) {
  const main = html.match(/<main[\s\S]*<\/main>/)?.[0] || html;
  return decode(main
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    // Inline tags join their text to the words around them ("run <code>x</code>.")
    .replace(/<\/?(?:code|strong|em|b|i|a|span)\b[^>]*>/g, '')
    // Everything else separates blocks of text
    .replace(/<[^>]+>/g, ' '))
    .replace(/[​]/g, '')
    .replace(/\s+/g, ' ');
}

const norm = (s) => decode(String(s)).replace(/\s+/g, ' ').trim();

function expectedUrl(file) {
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  return `${SITE}/${rel === 'index.html' ? '' : rel.replace(/(^|\/)index\.html$/, '$1')}`;
}

const errors = [];
const canonicals = new Map();
let pages = 0;
let howtos = 0;
let faqs = 0;

for (const file of htmlFiles(ROOT)) {
  const rel = relative(ROOT, file);
  if (rel === '404.html') continue;
  pages++;
  const html = readFileSync(file, 'utf8');
  const head = html.match(/<head>[\s\S]*<\/head>/)?.[0] || '';
  const fail = (msg) => errors.push(`${rel}: ${msg}`);

  const canon = [...head.matchAll(/<link rel="canonical" href="([^"]+)"/g)].map(m => m[1]);
  const want = expectedUrl(file);
  if (canon.length !== 1) fail(`expected 1 canonical, found ${canon.length}`);
  else if (canon[0] !== want) fail(`canonical is ${canon[0]}, expected ${want}`);
  else if (canonicals.has(canon[0])) fail(`canonical duplicates ${canonicals.get(canon[0])}`);
  else canonicals.set(canon[0], rel);

  for (const prop of ['og:url', 'og:title', 'og:description']) {
    const found = [...head.matchAll(new RegExp(`<meta property="${prop}" content="([^"]*)"`, 'g'))].map(m => m[1]);
    if (found.length !== 1) fail(`expected 1 ${prop}, found ${found.length}`);
    else if (prop === 'og:url' && found[0] !== want) fail(`og:url is ${found[0]}, expected ${want}`);
  }

  const blocks = [...head.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => m[1]);
  if (blocks.length !== 1) { fail(`expected 1 JSON-LD block, found ${blocks.length}`); continue; }
  let data;
  try { data = JSON.parse(blocks[0]); } catch (e) { fail(`JSON-LD doesn't parse: ${e.message}`); continue; }
  if (/aggregateRating/i.test(blocks[0])) fail('JSON-LD contains aggregateRating');

  const graph = data['@graph'] || [];
  const types = graph.flatMap(n => [].concat(n['@type']));
  for (const t of ['WebSite', 'SoftwareApplication', 'BreadcrumbList']) {
    if (!types.includes(t)) fail(`JSON-LD has no ${t}`);
  }
  const page = graph.find(n => n['@id'] === `${want}#webpage`);
  if (!page) fail('JSON-LD has no node for this page');

  const text = norm(visibleText(html));
  const shows = (s) => text.includes(norm(s));

  const howto = graph.find(n => n['@type'] === 'HowTo');
  if (howto) {
    howtos++;
    if (!howto.step?.length) fail('HowTo has no steps');
    for (const step of howto.step || []) {
      if (!shows(step.name)) fail(`HowTo step name not on the page: "${step.name}"`);
      if (!shows(step.text)) fail(`HowTo step text not on the page: "${step.text.slice(0, 60)}…"`);
      if (!html.includes(`id="step-${step.position}"`)) fail(`HowTo step ${step.position} has no #step-${step.position} anchor`);
    }
  }

  if (page && [].concat(page['@type']).includes('FAQPage')) {
    faqs++;
    for (const q of page.mainEntity || []) {
      if (!shows(q.name)) fail(`FAQ question not on the page: "${q.name}"`);
      if (!shows(q.acceptedAnswer?.text)) fail(`FAQ answer not on the page: "${String(q.acceptedAnswer?.text).slice(0, 60)}…"`);
    }
  }
}

if (errors.length) {
  console.error(`✗ Structured data: ${errors.length} problem(s) in ${pages} pages\n`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`✓ Structured data OK: ${pages} pages, ${howtos} with HowTo, ${faqs} with FAQ, every canonical unique`);

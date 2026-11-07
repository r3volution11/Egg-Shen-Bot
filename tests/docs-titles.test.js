/**
 * Every page's <title> names the site exactly once.
 *
 * VitePress appends the site's title to each page's own ("Siege | Egg Shen
 * Discord Bot"), so a page title that carries the brand itself came out as
 * "Siege - Egg Shen Bot | Egg Shen Bot" in every tab and search result —
 * 33 pages did, until 2026-11-07. Doug: that hurts UX and reads as keyword
 * stuffing to search engines. A page that writes its whole title itself
 * (the home page) turns the template off with `titleTemplate: false`.
 *
 * Also the og:/twitter: titles a page sets in its own `head`: those aren't
 * templated, so they carry the brand exactly once.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

// fileURLToPath, not .pathname: the checkout's path has spaces (%20)
const ROOT = fileURLToPath(new URL('../docs/', import.meta.url));
const SITE_NAME = 'Egg Shen Discord Bot';
const BRAND = /Egg Shen (?:Discord )?Bot/gi;

function pages(dir = ROOT) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (name === 'node_modules' || name.startsWith('.')) return [];
    if (statSync(full).isDirectory()) return pages(full);
    return name.endsWith('.md') && name !== 'changelog.md' ? [full] : [];
  });
}

function frontmatter(file) {
  const text = readFileSync(file, 'utf8');
  if (!text.startsWith('---\n')) return {};
  return yaml.load(text.slice(4, text.indexOf('\n---', 4))) || {};
}

const brandCount = (s) => (String(s).match(BRAND) || []).length;

describe('page titles name the site once', () => {
  const all = pages().map((file) => ({ file: relative(ROOT, file), fm: frontmatter(file) }));

  test('the site title is Egg Shen Discord Bot', () => {
    const config = readFileSync(new URL('../docs/.vitepress/config.js', import.meta.url), 'utf8');
    expect(config).toMatch(/^\s*title: 'Egg Shen Discord Bot',$/m);
    expect(config).toMatch(/siteTitle: 'Egg Shen Discord Bot'/);
  });

  test('a templated page title never carries the brand (the template adds it)', () => {
    const doubled = all
      .filter(({ fm }) => fm.title && fm.titleTemplate !== false && brandCount(fm.title) > 0)
      .map(({ file, fm }) => `${file}: "${fm.title} | ${SITE_NAME}"`);
    expect(doubled).toEqual([]);
  });

  test('a page that writes its whole title names the site exactly once', () => {
    const own = all.filter(({ fm }) => fm.titleTemplate === false);
    expect(own.map(({ file }) => file)).toContain('index.md');
    for (const { file, fm } of own) {
      expect([file, brandCount(fm.title)]).toEqual([file, 1]);
      expect([file, fm.title.includes(SITE_NAME)]).toEqual([file, true]);
    }
  });

  test("a page's own og:/twitter: title names the site exactly once", () => {
    const wrong = [];
    for (const { file, fm } of all) {
      for (const [, attrs] of fm.head || []) {
        const key = attrs?.property || attrs?.name;
        if (key !== 'og:title' && key !== 'twitter:title') continue;
        if (brandCount(attrs.content) !== 1 || !attrs.content.includes(SITE_NAME)) wrong.push(`${file} ${key}: "${attrs.content}"`);
      }
    }
    expect(wrong).toEqual([]);
  });
});

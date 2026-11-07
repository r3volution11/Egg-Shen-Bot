/**
 * Every old link in docs/.vitepress/theme/movedAnchors.js must still land.
 *
 * When a section moves to another page, its old address lives on in places
 * nobody can edit: the changelog, GitHub release notes, and the citations
 * and /how-to-play cards of bots still running an older version (each
 * operator hosts their own copy, and its /eggshen-ask cites its own docs'
 * anchors on eggshenbot.com). movedAnchors.js maps each old anchor to the
 * section's new address, and the old page keeps a hidden marker for it.
 *
 * The map had no check at all, though its comment said one existed. An
 * entry naming a heading that was later renamed (2.76.0 renamed "The 16
 * twists" to "The 18 twists"; the entry was fixed by hand) sends a reader
 * to the top of the wrong page, and nothing else notices: VitePress checks
 * links to pages, never to headings.
 *
 * The pages are rendered with VitePress's own markdown renderer and the
 * site's own markdown config, so a heading's id here is the id on the site,
 * duplicates numbered (-1, -2) the way VitePress numbers them.
 *
 * Run with: npm test -- tests/docs-moved-anchors.test.js
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { createMarkdownRenderer } from 'vitepress';
import siteConfig from '../docs/.vitepress/config.js';
import { MOVED, movedTo } from '../docs/.vitepress/theme/movedAnchors.js';

const DOCS = path.join(process.cwd(), 'docs');

let md;
beforeAll(async () => {
  md = await createMarkdownRenderer(DOCS, siteConfig.markdown, siteConfig.base);
});

/** '/commands/games-siege' → commands/games-siege.md; '/commands/brackets' or '/commands/brackets/' → commands/brackets/index.md */
function sourceOf(page) {
  const p = page.replace(/^\//, '').replace(/\.html$/, '').replace(/(^|\/)index$/, '$1').replace(/\/$/, '');
  const candidates = p === '' ? ['index.md'] : [`${p}.md`, `${p}/index.md`];
  return candidates.find(rel => fs.existsSync(path.join(DOCS, rel))) || null;
}

const rendered = new Map();
/** A page's ids, and which of them are headings, or null when there's no such page */
function idsOn(page) {
  const rel = sourceOf(page);
  if (!rel) return null;
  if (!rendered.has(rel)) {
    const html = md.render(fs.readFileSync(path.join(DOCS, rel), 'utf8'), { relativePath: rel, path: path.join(DOCS, rel) });
    rendered.set(rel, {
      all: new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1])),
      headings: new Set([...html.matchAll(/<h[1-6][^>]*\sid="([^"]+)"/g)].map(m => m[1])),
    });
  }
  return rendered.get(rel);
}

/** Why each entry of a MOVED-shaped map doesn't land, or [] when they all do */
function problemsIn(moved) {
  const problems = [];
  for (const [page, map] of Object.entries(moved)) {
    const old = idsOn(page);
    if (!old) { problems.push(`${page}: no such page`); continue; }
    for (const [anchor, to] of Object.entries(map)) {
      // The hidden marker keeps the old link working without JavaScript
      if (!old.all.has(anchor)) problems.push(`${page}#${anchor}: no marker for it on ${page}`);
      // A section that's still there must not be redirected away from
      if (old.headings.has(anchor)) problems.push(`${page}#${anchor}: still a heading on ${page}, so the redirect would take readers away from it`);
      const [target, hash] = to.split('#');
      const ids = idsOn(target);
      if (!ids) problems.push(`${page}#${anchor} → ${to}: no page ${target}`);
      else if (hash && !ids.headings.has(hash)) problems.push(`${page}#${anchor} → ${to}: no heading #${hash} on ${target}`);
    }
  }
  return problems;
}

describe('movedAnchors.js', () => {
  test('every old anchor is still on its old page, and every new address is a real page and heading', () => {
    expect(problemsIn(MOVED)).toEqual([]);
  });

  test('the address a reader is sent to is the built page\'s', () => {
    // movedTo turns '/commands/games-siege#pace' into '/commands/games-siege.html#pace'.
    // Each old page is reached as VitePress links it, and as a bot or a
    // person types it: with or without .html, and an index page by its folder.
    const wrong = [];
    for (const [page, map] of Object.entries(MOVED)) {
      const isIndex = sourceOf(page)?.endsWith('index.md');
      const ways = isIndex ? [`${page}/`, `${page}/index.html`, page] : [`${page}.html`, page];
      for (const [anchor, to] of Object.entries(map)) {
        const [target, hash] = to.split('#');
        const built = sourceOf(target)?.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '.html');
        const expected = `/${built}${hash ? `#${hash}` : ''}`;
        for (const from of ways) {
          const got = movedTo(from, `#${anchor}`);
          if (got !== expected) wrong.push(`${from}#${anchor} → ${got}, not ${expected}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  test('a section still on its page isn\'t redirected', () => {
    expect(movedTo('/commands/social.html', '#survey-commands')).toBeNull();
    expect(movedTo('/commands/games.html', '#the-games')).toBeNull();
    expect(movedTo('/commands/games-playing.html', '#doom')).toBeNull();
  });

  test('the check catches a missing page, heading or marker', () => {
    // So a pass above means something
    expect(problemsIn({ '/commands/games': { points: '/commands/games-playing#points' } })).toEqual([]);
    // The entry 2.76.0 had to fix by hand: the heading became "The 18 twists"
    expect(problemsIn({ '/commands/games': { 'the-16-twists': '/commands/games-happenings#the-16-twists' } }))
      .toEqual(['/commands/games#the-16-twists → /commands/games-happenings#the-16-twists: no heading #the-16-twists on /commands/games-happenings']);
    expect(problemsIn({ '/commands/social': { doom: '/commands/games-play#doom' } }))
      .toEqual(['/commands/social#doom → /commands/games-play#doom: no page /commands/games-play']);
    expect(problemsIn({ '/commands/social': { 'no-such-marker': '/commands/games-playing#doom' } }))
      .toEqual(['/commands/social#no-such-marker: no marker for it on /commands/social']);
    expect(problemsIn({ '/commands/social': { 'survey-commands': '/commands/games-playing#doom' } }))
      .toEqual(['/commands/social#survey-commands: still a heading on /commands/social, so the redirect would take readers away from it']);
    // An index page is found by its folder, with or without the slash
    expect(sourceOf('/commands/brackets')).toBe('commands/brackets/index.md');
    expect(sourceOf('/commands/brackets/')).toBe('commands/brackets/index.md');
    // Headings with the same name are numbered in page order, as social.md's
    // three "Your Own Lines (Admin/Mod)" were (…-admin-mod, -1, -2)
    const ids = [...md.render('## Your Own Lines (Admin/Mod)\n\n## Your Own Lines (Admin/Mod)\n\n## Your Own Lines (Admin/Mod)\n', {}).matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
    expect(ids).toEqual(['your-own-lines-admin-mod', 'your-own-lines-admin-mod-1', 'your-own-lines-admin-mod-2']);
  });
});

/**
 * The drawing kit behind the bot's images (src/utils/canvasKit.js): its
 * bundled fonts, kit icons, text fitting and poster cache.
 *
 * No network: every download goes through an injected fetchImpl.
 *
 * Run with: npm test -- tests/canvas-kit.test.js
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { readFileSync } from 'fs';
import path from 'path';
import {
  registerFonts, font, setFont, hasGlyphs, readCoverage, FONT_FAMILIES,
  drawKitIcon, fitText, wrapText, stripPictographs,
  loadImageCached, clearImageCache, cachedImageUrls, IMAGE_CACHE,
} from '../src/utils/canvasKit.js';

const scratch = () => createCanvas(8, 8).getContext('2d');

describe('fonts', () => {
  test('the bundled faces register, and registering again changes nothing', () => {
    // Each face goes to the canvas once per process, however many times this
    // is called (and however many copies of the module jest loads)
    const register = jest.spyOn(GlobalFonts, 'register');
    const first = registerFonts();
    registerFonts();
    registerFonts();
    expect(register.mock.calls.length).toBeLessThanOrEqual(3);
    register.mockRestore();
    expect(first.missing).toEqual([]);
    expect(first.families).toEqual([FONT_FAMILIES.body, FONT_FAMILIES.display]);
    const stylesBefore = GlobalFonts.families.find(f => f.family === FONT_FAMILIES.body).styles.length;

    expect(registerFonts()).toEqual(first);
    expect(GlobalFonts.families.find(f => f.family === FONT_FAMILIES.body).styles.length).toBe(stylesBefore);
    // Barlow Medium and Bold, Anton
    expect(GlobalFonts.families.find(f => f.family === FONT_FAMILIES.body).styles.map(s => s.weight).sort()).toEqual([500, 700]);
    expect(GlobalFonts.has(FONT_FAMILIES.display)).toBe(true);
  });

  test('text really draws in them: the display face is narrower than the system sans, the bold wider than the medium', () => {
    const ctx = scratch();
    const width = (css) => { ctx.font = css; return ctx.measureText('QUARTERFINALS WINNER').width; };
    expect(width(font(40, { family: 'display' }))).toBeLessThan(width('bold 40px sans-serif') * 0.85);
    expect(width(font(40, { weight: 700 }))).toBeGreaterThan(width(font(40, { weight: 500 })));
    expect(font(20, { weight: 700 })).toBe('700 20px "Egg Shen Sans"');
    expect(font(20, { weight: 600 })).toBe('700 20px "Egg Shen Sans"'); // the nearest weight it has
    expect(font(20, { family: 'display', weight: 700 })).toBe('400 20px "Egg Shen Display"');
  });

  test('a string the face lacks a glyph for falls back to a system font, never to the face\'s empty box', () => {
    const ctx = scratch();
    expect(setFont(ctx, 20, {}, 'Amélie · Léon™ …')).toBe(font(20));
    expect(ctx.font).toContain('Egg Shen Sans');
    // Barlow has no Cyrillic: the system sans, which falls back glyph by glyph
    expect(setFont(ctx, 20, { weight: 700 }, 'Кино')).toBe('bold 20px sans-serif');
    // CJK asks for a CJK face by name first
    expect(setFont(ctx, 20, {}, 'Spirited Away 千と千尋')).toMatch(/^normal 20px "Noto Sans CJK SC".*sans-serif$/);
  });

  test("a face's character map is read from the font file itself", () => {
    const ranges = readCoverage(readFileSync(path.join(process.cwd(), 'assets/fonts/barlow/Barlow-Bold.ttf')));
    const has = (ch) => ranges.some(([a, b]) => ch.codePointAt(0) >= a && ch.codePointAt(0) <= b);
    expect(['A', 'z', '0', 'é', '…', '·', '™'].every(has)).toBe(true);
    expect(['大', 'К', '😀'].some(has)).toBe(false);
    expect(hasGlyphs('display', 'UPSET! · 1A')).toBe(true);
    expect(hasGlyphs('body', 'Кино')).toBe(false);
  });
});

describe('drawKitIcon', () => {
  const opaque = (data) => { let n = 0; for (let i = 3; i < data.length; i += 4) if (data[i] > 0) n++; return n; };

  test("paints the kit icon's own pixels where it's asked, and nothing else", async () => {
    const canvas = createCanvas(100, 100);
    const ctx = canvas.getContext('2d');
    expect(await drawKitIcon(ctx, 'trophy', 20, 30, 64)).toBe(true);

    // The same PNG drawn directly, as reference
    const ref = createCanvas(100, 100).getContext('2d');
    ref.imageSmoothingQuality = 'high';
    ref.drawImage(await loadImage(path.join(process.cwd(), 'assets/emojis/trophy.png')), 20, 30, 64, 64);
    const a = ctx.getImageData(0, 0, 100, 100).data;
    const b = ref.getImageData(0, 0, 100, 100).data;
    let differ = 0;
    for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 2) differ++;
    expect(differ).toBe(0);

    // Inside the box: a real icon, gold included
    const inside = ctx.getImageData(20, 30, 64, 64).data;
    expect(opaque(inside)).toBeGreaterThan(64 * 64 * 0.3);
    let gold = 0;
    for (let i = 0; i < inside.length; i += 4) if (inside[i] > 200 && inside[i + 1] > 140 && inside[i + 2] < 120) gold++;
    expect(gold).toBeGreaterThan(200);
    // Outside it: untouched
    expect(opaque(ctx.getImageData(0, 0, 100, 30).data)).toBe(0);
    expect(opaque(ctx.getImageData(84, 30, 16, 70).data)).toBe(0);
  });

  test('an unknown code (or anything that looks like a path) draws nothing and says so', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const ctx = createCanvas(40, 40).getContext('2d');
    expect(await drawKitIcon(ctx, 'nosuch', 0, 0, 40)).toBe(false);
    expect(await drawKitIcon(ctx, '../logo', 0, 0, 40)).toBe(false);
    expect(opaque(ctx.getImageData(0, 0, 40, 40).data)).toBe(0);
    warn.mockRestore();
  });
});

describe('text', () => {
  test('fitText leaves text that fits alone, and cuts the rest to fit with an ellipsis', () => {
    const ctx = scratch();
    ctx.font = font(24, { weight: 700 });
    expect(fitText(ctx, 'Alien', 300)).toBe('Alien');
    const long = 'A Nightmare on Elm Street 3: Dream Warriors';
    const cut = fitText(ctx, long, 200);
    expect(cut.endsWith('…')).toBe(true);
    expect(long.startsWith(cut.slice(0, -1).trimEnd())).toBe(true);
    expect(ctx.measureText(cut).width).toBeLessThanOrEqual(200);
    // As much as fits: one more character (past any spaces) would not
    const kept = cut.slice(0, -1);
    let n = kept.length;
    while (long[n] === ' ') n++;
    expect(ctx.measureText(`${long.slice(0, n + 1).trimEnd()}…`).width).toBeGreaterThan(200);
    expect(fitText(ctx, long, 1)).toBe('');
  });

  test('fitText never cuts a character in half', () => {
    const ctx = scratch();
    ctx.font = '20px sans-serif';
    const astral = String.fromCodePoint(0x1D504, 0x1D505, 0x1D506).repeat(8); // 𝔄𝔅𝔆, two code units each
    const cut = fitText(ctx, astral, 60);
    expect(cut.endsWith('…')).toBe(true);
    expect([...cut].every(ch => ch.codePointAt(0) < 0xD800 || ch.codePointAt(0) > 0xDFFF)).toBe(true);
  });

  test('wrapText fills lines, breaks a too-long word, and cuts the last line', () => {
    const ctx = scratch();
    ctx.font = font(20, { weight: 700 });
    const lines = wrapText(ctx, 'A Nightmare on Elm Street 3: Dream Warriors and Freddy too', 190, 2);
    expect(lines).toHaveLength(2);
    expect(lines.every(l => ctx.measureText(l).width <= 190)).toBe(true);
    expect(lines[0]).toBe('A Nightmare on Elm');
    expect(lines[1].endsWith('…')).toBe(true);
    expect(wrapText(ctx, 'Short one', 190, 3)).toEqual(['Short one']);
    const broken = wrapText(ctx, 'Supercalifragilisticexpialidocious', 120, 3);
    expect(broken.length).toBeGreaterThan(1);
    expect(broken.every(l => ctx.measureText(l).width <= 120)).toBe(true);
  });

  test('stripPictographs drops emoji, custom emoji markup and keycaps, keeps ™ © ®, tidies spaces', () => {
    expect(stripPictographs('🎃 Halloween™  <:pepe:123456> 1️⃣ 👨‍👩‍👧 Alien 🇺🇸 ©')).toBe('Halloween™ Alien ©');
    expect(stripPictographs('<a:dance:42>Party ✨ time')).toBe('Party time');
    expect(stripPictographs('The Thing (1982)')).toBe('The Thing (1982)');
    expect(stripPictographs(null)).toBe('');
  });
});

describe('loadImageCached', () => {
  const png = (w, h, colour = '#ff00ff') => {
    const c = createCanvas(w, h);
    const ctx = c.getContext('2d');
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, w, h);
    return c.toBuffer('image/png');
  };
  const okFetch = (buffer = png(20, 30)) => jest.fn(async () => new Response(buffer, { status: 200, headers: { 'content-type': 'image/png' } }));
  let warn;

  beforeEach(() => {
    clearImageCache();
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
    jest.restoreAllMocks();
  });

  test('downloads once, then serves the cached copy', async () => {
    const fetchImpl = okFetch();
    const a = await loadImageCached('https://img.test/a.png', { fetchImpl });
    const b = await loadImageCached('https://img.test/a.png', { fetchImpl });
    expect([a.width, a.height, b.width, b.height]).toEqual([20, 30, 20, 30]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://img.test/a.png');
  });

  test('two draws asking at once share one download', async () => {
    const fetchImpl = okFetch();
    const [a, b] = await Promise.all([
      loadImageCached('https://img.test/same.png', { fetchImpl }),
      loadImageCached('https://img.test/same.png', { fetchImpl }),
    ]);
    expect(a.width).toBe(20);
    expect(b.width).toBe(20);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test(`keeps the ${IMAGE_CACHE.maxEntries} most recently used, evicting the least recently used`, async () => {
    const fetchImpl = okFetch();
    const url = (i) => `https://img.test/${i}.png`;
    for (let i = 0; i < IMAGE_CACHE.maxEntries; i++) await loadImageCached(url(i), { fetchImpl });
    expect(cachedImageUrls()).toHaveLength(IMAGE_CACHE.maxEntries);
    // Use #0 again: now #1 is the least recently used
    await loadImageCached(url(0), { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(IMAGE_CACHE.maxEntries);

    await loadImageCached(url(IMAGE_CACHE.maxEntries), { fetchImpl });
    expect(cachedImageUrls()).toHaveLength(IMAGE_CACHE.maxEntries);
    expect(cachedImageUrls()).toContain(url(0));
    expect(cachedImageUrls()).not.toContain(url(1));
    // #1 has to be downloaded again; #0 didn't
    await loadImageCached(url(1), { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(IMAGE_CACHE.maxEntries + 2);
  });

  test('a cached copy is good for 30 minutes, then fetched afresh', async () => {
    let now = Date.UTC(2026, 10, 2, 12, 0, 0);
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const fetchImpl = okFetch();
    await loadImageCached('https://img.test/ttl.png', { fetchImpl });
    now += IMAGE_CACHE.ttlMs - 1;
    await loadImageCached('https://img.test/ttl.png', { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    now += 2;
    await loadImageCached('https://img.test/ttl.png', { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test('a download that hangs gives up at the timeout: null, the request aborted, nothing cached', async () => {
    let signal = null;
    const fetchImpl = jest.fn((url, init) => {
      signal = init?.signal;
      return new Promise(() => {}); // never answers, even when aborted
    });
    const started = performance.now();
    const img = await loadImageCached('https://img.test/slow.png', { fetchImpl, timeoutMs: 60 });
    expect(img).toBeNull();
    expect(performance.now() - started).toBeLessThan(1000);
    expect(signal?.aborted).toBe(true);
    expect(cachedImageUrls()).toEqual([]);
  });

  test('not an image, a 404, an undecodable body or a non-http url: null, and not cached', async () => {
    const respond = (body, type, status = 200) => jest.fn(async () => new Response(body, { status, headers: { 'content-type': type } }));
    expect(await loadImageCached('https://img.test/page', { fetchImpl: respond('<html>', 'text/html') })).toBeNull();
    // What decides is whether it decodes, not the label: some hosts send posters as octet-stream
    expect((await loadImageCached('https://img.test/s3.png', { fetchImpl: respond(png(4, 6), 'application/octet-stream') })).width).toBe(4);
    clearImageCache();
    expect(await loadImageCached('https://img.test/gone.png', { fetchImpl: respond('', 'image/png', 404) })).toBeNull();
    expect(await loadImageCached('https://img.test/junk.png', { fetchImpl: respond('not a png', 'image/png') })).toBeNull();
    const never = okFetch();
    expect(await loadImageCached('/relative/poster.jpg', { fetchImpl: never })).toBeNull();
    expect(await loadImageCached(null, { fetchImpl: never })).toBeNull();
    expect(never).not.toHaveBeenCalled();
    expect(cachedImageUrls()).toEqual([]);
  });
});

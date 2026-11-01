#!/usr/bin/env node
/**
 * Build the emoji kit's images: `npm run build:emojis`.
 *
 * Draws every code in emojiKit.js's KIT_CODES with the Egg Shen style
 * (scripts/emoji-styles/egg-shen.js) and writes, under assets/emojis/:
 *  - <code>.png        128×128 RGBA, the image uploaded to Discord as the
 *                      application emoji `es_<code>_<hash>`
 *  - manifest.json     { "<code>": { hash, family, fallback, source } }:
 *                      hash is the first 4 hex of the sha256 of that PNG's
 *                      bytes; source is "drawn" or "art"
 *  - contact-sheet.png every code at 64 px, plus "in context" strips on
 *                      Discord's dark and light themes at the real inline
 *                      size (22 px) and at 2× — what gets reviewed before
 *                      art ships
 *
 * Override: if assets/emojis/art/<code>.png exists it replaces the drawing
 * (see assets/emojis/README.md).
 *
 * The hash is taken over the PNG actually written, drawn or overridden, so
 * a changed drawing or a replaced file goes up as a new emoji and nothing
 * else does. Everything random in the drawings is seeded, so rebuilding
 * writes byte-identical PNGs and leaves every hash alone.
 *
 * The outputs are committed: the server installs with --omit=dev and never
 * runs this. tests/emoji-art.test.js fails if the manifest drifts from the
 * PNGs or from KIT_CODES.
 */
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { KIT_CODES, filledSegments } from '../src/utils/emojiKit.js';
import style from './emoji-styles/egg-shen.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'assets', 'emojis');
const ART_DIR = path.join(OUT_DIR, 'art');
const PNG_SIZE = 128;

/** The uploaded name's hash: first 4 hex of the sha256 of the PNG's bytes */
const pngHash = (bytes) => createHash('sha256').update(bytes).digest('hex').slice(0, 4);

// ---- fonts: the same system-font lookup as bracketVisualizer.js (no TTFs ship with the bot)
function registerFirst(family, candidates) {
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      GlobalFonts.registerFromPath(p, family);
      return true;
    } catch { /* try the next one */ }
  }
  return false;
}
registerFirst('KitSans', [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
  '/usr/share/fonts/truetype/msttcorefonts/Arial.ttf',
  '/Library/Fonts/Arial.ttf',
  '/System/Library/Fonts/Supplemental/Arial.ttf',
]);
registerFirst('KitSansBold', [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  '/Library/Fonts/Arial Bold.ttf',
  '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
]);
registerFirst('KitMono', [
  '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf',
  '/System/Library/Fonts/Supplemental/Courier New.ttf',
  '/Library/Fonts/Courier New.ttf',
]);
const SANS = 'KitSans, Arial, sans-serif';
const BOLD = 'KitSansBold, KitSans, Arial, sans-serif';
const MONO = 'KitMono, "Courier New", monospace';

// ---- check the drawings cover the kit exactly
const codes = Object.keys(KIT_CODES);
const missing = codes.filter(c => !style.codes.includes(c));
const extra = style.codes.filter(c => !KIT_CODES[c]);
if (missing.length || extra.length) {
  console.error(`egg-shen.js and KIT_CODES differ. Not drawn: ${missing.join(', ') || 'none'}. Drawn with no code: ${extra.join(', ') || 'none'}.`);
  process.exit(1);
}

/**
 * An override PNG at 128×128. Already 128: as is. A size that divides 128
 * (16, 32, 64) is pixel art and stays crisp; anything else is smoothed.
 */
async function loadOverride(bytes) {
  const img = await loadImage(bytes);
  const canvas = createCanvas(PNG_SIZE, PNG_SIZE);
  const ctx = canvas.getContext('2d');
  const pixelArt = img.width === img.height && PNG_SIZE % img.width === 0;
  ctx.imageSmoothingEnabled = !pixelArt;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, PNG_SIZE, PNG_SIZE);
  return canvas;
}

mkdirSync(OUT_DIR, { recursive: true });

// ---- the per-code PNGs and the manifest
const manifest = {};
const images = {}; // code → 128 px canvas, reused by the contact sheet
for (const code of codes) {
  const artPath = path.join(ART_DIR, `${code}.png`);
  const source = existsSync(artPath) ? 'art' : 'drawn';
  const canvas = source === 'art' ? await loadOverride(readFileSync(artPath)) : style.render(code);
  const bytes = canvas.toBuffer('image/png');
  writeFileSync(path.join(OUT_DIR, `${code}.png`), bytes);
  images[code] = canvas;
  manifest[code] = { hash: pngHash(bytes), family: KIT_CODES[code].family, fallback: KIT_CODES[code].fallback, source };
}
writeFileSync(path.join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

// A code that left the kit leaves no stray PNG behind
for (const file of readdirSync(OUT_DIR)) {
  if (!file.endsWith('.png') || file === 'contact-sheet.png') continue;
  if (!KIT_CODES[file.slice(0, -4)]) unlinkSync(path.join(OUT_DIR, file));
}

// ---- contact sheet
const SHEET_W = 1640;
const PAD = 40;
const THEMES = [
  { name: 'Dark theme', bg: '#313338', text: '#dbdee1', strong: '#f2f3f5', muted: '#949ba4', pillBg: '#2b2d31', pillBorder: '#1e1f22' },
  { name: 'Light theme', bg: '#f2f3f5', text: '#313338', strong: '#060607', muted: '#5c5e66', pillBg: '#e3e5e8', pillBorder: '#d4d7dc' },
];
const BAR_COLOURS = [['g', 'green'], ['o', 'orange'], ['y', 'gold'], ['b', 'blue'], ['p', 'purple'], ['s', 'muted']];
const LEVELS = [0, 1, 3, 5, 7, 9, 10];
const ICON_CODES = codes.filter(c => KIT_CODES[c].family === 'icon');
const NIGHTS = ['played', 'played', 'missed', 'played', 'saved', 'played', 'played',
  'missed', 'missed', 'played', 'saved', 'played', 'played', 'tonight'];
const TICK_CODE = { played: 'ntp', saved: 'nts', missed: 'ntm', tonight: 'ntt' };

/** The kit's segment codes for a bar, mirroring emojiKit's bar()/splitBar() */
function barCodes(colours) {
  return colours.map((c, i) => `b${c}${i === 0 ? 'l' : i === colours.length - 1 ? 'r' : 'm'}`);
}
function levelBar(colour, filled, width) {
  return barCodes(Array.from({ length: width }, (_, i) => (i < filled ? colour : 'e')));
}

/**
 * Draw a run of emoji at `size`, smoothed the way a browser shrinks the
 * 128 px upload to an inline emoji. Returns the x after the last one.
 */
function drawRun(ctx, list, x, y, size, gap = 0) {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // Whole pixels: browsers snap inline images to the pixel grid, and a
  // fractional x would smear every segment edge into a fake seam.
  x = Math.round(x);
  for (const code of list) {
    ctx.drawImage(images[code], x, Math.round(y), size, size);
    x += size + gap;
  }
  return x;
}

function label(ctx, text, x, y, { font = SANS, size = 13, colour = '#dbdee1', align = 'left' } = {}) {
  ctx.font = `${size}px ${font}`;
  ctx.fillStyle = colour;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.textAlign = 'left';
}

/** A Discord inline-code "pill"; returns the x after it */
function pill(ctx, text, x, midY, fontPx, theme) {
  ctx.font = `${Math.round(fontPx * 0.85)}px ${MONO}`;
  const w = ctx.measureText(text).width + fontPx * 0.4;
  const h = fontPx * 1.15;
  ctx.fillStyle = theme.pillBg;
  ctx.strokeStyle = theme.pillBorder;
  ctx.lineWidth = Math.max(1, fontPx / 16);
  ctx.beginPath();
  ctx.roundRect(x, midY - h / 2, w, h, fontPx * 0.2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = theme.text;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + fontPx * 0.2, midY);
  return x + w;
}
function words(ctx, text, x, midY, fontPx, theme, font = SANS, colour = theme.text) {
  ctx.font = `${fontPx}px ${font}`;
  ctx.fillStyle = colour;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, midY);
  return x + ctx.measureText(text).width;
}

/**
 * One theme's strips at one emoji size. With `draw` false it only measures,
 * so the sheet can be sized before anything is drawn. Returns the height.
 */
function themeStrips(ctx, theme, size, top, draw) {
  const left = PAD + 20;
  const usable = SHEET_W - 2 * left;
  const rowH = size + Math.round(size * 0.35);
  const fontPx = Math.round(size * 16 / 22); // Discord's 16 px text beside 22 px emoji
  const labelW = 60;
  let y = top;
  const heading = (text) => {
    if (draw) label(ctx, text, left, y + 10, { font: BOLD, size: 15, colour: theme.muted });
    y += 28;
  };

  heading(`${size} px${size === 22 ? ' (Discord\'s inline size)' : ' (2×, a retina screen)'}`);

  // Bars: every colour at every level
  const barW = size * 10;
  const colGap = size;
  const perRow = Math.max(1, Math.floor((usable - labelW + colGap) / (barW + colGap)));
  for (let start = 0; start < BAR_COLOURS.length; start += perRow) {
    const block = BAR_COLOURS.slice(start, start + perRow);
    block.forEach(([, name], i) => {
      if (draw) label(ctx, name, left + labelW + i * (barW + colGap), y + 8, { colour: theme.muted, size: 12 });
    });
    y += 20;
    for (const level of LEVELS) {
      if (draw) {
        label(ctx, `${level}/10`, left, y + size / 2, { colour: theme.muted, size: 12 });
        block.forEach(([c], i) => drawRun(ctx, levelBar(c, level, 10), left + labelW + i * (barW + colGap), y, size));
      }
      y += rowH;
    }
    y += 8;
  }

  // Short bars, split bars, and a client that spaces emoji apart
  const extras = [
    ['width 5', [levelBar('b', 0, 5), levelBar('b', 2, 5), levelBar('b', 5, 5)]],
    ['split', [barCodes([...'ggggggg', ...'ooo']), barCodes([...'ooo', ...'ggggggg']), barCodes([...'yyyyyyyyyy'])]],
    ['ladder', [levelBar('b', 5, 5), levelBar('b', 2, 5), levelBar('b', 0, 5)]],
  ];
  for (const [name, bars] of extras) {
    if (draw) {
      label(ctx, name, left, y + size / 2, { colour: theme.muted, size: 12 });
      let x = left + labelW;
      for (const b of bars) x = drawRun(ctx, b, x, y, size) + (name === 'ladder' ? size * 0.3 : colGap);
      if (name === 'split') label(ctx, '← green leads, orange trails; a tie is gold', x, y + size / 2, { colour: theme.muted, size: 12 });
    }
    y += rowH;
  }
  if (draw) {
    label(ctx, 'gapped', left, y + size / 2, { colour: theme.muted, size: 12 });
    const x = drawRun(ctx, levelBar('g', 6, 10), left + labelW, y, size, Math.max(1, Math.round(size / 11)));
    label(ctx, `← with a ${Math.max(1, Math.round(size / 11))} px gap, in case a client spaces emoji apart`, x + 12, y + size / 2, { colour: theme.muted, size: 12 });
  }
  y += rowH + 8;

  // Ticks: the 14-night row as two rows of 7, and done / not-yet
  if (draw) label(ctx, 'nights', left, y + size / 2, { colour: theme.muted, size: 12 });
  for (let r = 0; r < 2; r++) {
    if (draw) drawRun(ctx, NIGHTS.slice(r * 7, r * 7 + 7).map(s => TICK_CODE[s]), left + labelW, y, size);
    y += size + 2;
  }
  if (draw) label(ctx, 'red: played · blue-white: saved by a night light · dark: missed · half-lit: tonight', left + labelW + size * 7 + 16, y - size / 2 - 2, { colour: theme.muted, size: 12 });
  y += 6;
  if (draw) {
    label(ctx, 'ticks', left, y + size / 2, { colour: theme.muted, size: 12 });
    const x = drawRun(ctx, ['tk1', 'tk1', 'tk1', 'tk1', 'tk1', 'tk0', 'tk0'], left + labelW, y, size);
    label(ctx, '← done ×5, not yet ×2', x + 16, y + size / 2, { colour: theme.muted, size: 12 });
  }
  y += rowH + 4;

  // Every icon in a row (wrapped)
  const iconsPerRow = Math.floor((usable - labelW) / (size + 4));
  if (draw) label(ctx, 'icons', left, y + size / 2, { colour: theme.muted, size: 12 });
  for (let i = 0; i < ICON_CODES.length; i += iconsPerRow) {
    if (draw) drawRun(ctx, ICON_CODES.slice(i, i + iconsPerRow), left + labelW, y, size, 4);
    y += size + 6;
  }
  y += 8;

  // Card lines: icons next to real text, as a card shows them
  const mid = () => y + size / 2;
  if (draw) {
    label(ctx, 'card', left, mid(), { colour: theme.muted, size: 12 });
    let x = drawRun(ctx, ['coin'], left + labelW, y, size) + fontPx * 0.25;
    x = pill(ctx, '1,240', x, mid(), fontPx, theme);
    x = words(ctx, ' points · ', x, mid(), fontPx, theme);
    pill(ctx, '#3', x, mid(), fontPx, theme);
  }
  y += rowH;
  if (draw) {
    let x = drawRun(ctx, ['med1'], left + labelW, y, size) + fontPx * 0.25;
    x = words(ctx, 'Doug', x, mid(), fontPx, theme, BOLD, theme.strong) + fontPx * 0.4;
    x = drawRun(ctx, levelBar('y', 6, 6), x, y, size) + fontPx * 0.4;
    x = pill(ctx, '1,240', x, mid(), fontPx, theme);
    x = words(ctx, ' · ', x, mid(), fontPx, theme);
    x = drawRun(ctx, ['flame'], x, y, size) + fontPx * 0.25;
    words(ctx, '5 nights', x, mid(), fontPx, theme);
  }
  y += rowH;
  if (draw) {
    let x = drawRun(ctx, ['med2'], left + labelW, y, size) + fontPx * 0.25;
    x = words(ctx, 'Wing Kong', x, mid(), fontPx, theme, BOLD, theme.strong) + fontPx * 0.4;
    x = drawRun(ctx, levelBar('y', 4, 6), x, y, size) + fontPx * 0.4;
    x = pill(ctx, '  830', x, mid(), fontPx, theme);
    x = words(ctx, ' · ', x, mid(), fontPx, theme);
    x = drawRun(ctx, ['potion', 'food', 'doom', 'rescue', 'siege'], x, y, size, 4) + fontPx * 0.25;
    words(ctx, 'games', x, mid(), fontPx, theme);
  }
  y += rowH;
  if (draw) {
    let x = drawRun(ctx, ['med3'], left + labelW, y, size) + fontPx * 0.25;
    x = words(ctx, 'Gracie', x, mid(), fontPx, theme, BOLD, theme.strong) + fontPx * 0.4;
    x = drawRun(ctx, ['vs'], x, y, size) + fontPx * 0.25;
    x = drawRun(ctx, barCodes([...'gggggg', ...'oooo']), x, y, size) + fontPx * 0.4;
    x = pill(ctx, '62%', x, mid(), fontPx, theme);
    x = words(ctx, ' · ', x, mid(), fontPx, theme);
    x = drawRun(ctx, ['ntp', 'ntp', 'nts', 'ntm', 'ntt'], x, y, size) + fontPx * 0.25;
    words(ctx, '4/5', x, mid(), fontPx, theme);
  }
  y += rowH;
  if (draw) {
    // a Rewards line: progress toward the next reward
    let x = drawRun(ctx, ['gift'], left + labelW, y, size) + fontPx * 0.25;
    x = pill(ctx, '07/25', x, mid(), fontPx, theme) + fontPx * 0.3;
    x = drawRun(ctx, levelBar('y', filledSegments(7, 25, 10), 10), x, y, size) + fontPx * 0.4;
    x = drawRun(ctx, ['gpie'], x, y, size) + fontPx * 0.25;
    x = words(ctx, 'Golden Pie', x, mid(), fontPx, theme, BOLD, theme.strong) + fontPx * 0.3;
    pill(ctx, '+3', x, mid(), fontPx, theme);
  }
  y += rowH;
  if (draw) {
    let x = drawRun(ctx, ['glove'], left + labelW, y, size) + fontPx * 0.25;
    x = words(ctx, 'Glovebox  ', x, mid(), fontPx, theme, BOLD, theme.strong);
    for (const [code, n] of [['nlight', 2], ['garlic', 1], ['holyw', 1], ['silver', 3]]) {
      x = drawRun(ctx, [code], x, y, size) + fontPx * 0.2;
      x = words(ctx, `×${n}  `, x, mid(), fontPx, theme);
    }
    x = drawRun(ctx, ['clock'], x, y, size) + fontPx * 0.2;
    x = words(ctx, '2h left  ', x, mid(), fontPx, theme);
    x = drawRun(ctx, ['lock'], x, y, size) + fontPx * 0.2;
    words(ctx, 'closed', x, mid(), fontPx, theme);
  }
  y += rowH + 12;
  return y - top;
}

// Section A: every image at 64 px, grouped by family
const CELL = 64;
const CELL_W = 96;
const CELL_H = CELL + 30;
const perLine = Math.floor((SHEET_W - 2 * PAD - 40) / CELL_W);
const families = ['bar', 'tick', 'icon'];
const groupRows = families.map(f => Math.ceil(codes.filter(c => KIT_CODES[c].family === f).length / perLine));
const gridH = 60 + groupRows.reduce((a, n) => a + n * CELL_H + 34, 0);

const measure = createCanvas(10, 10).getContext('2d');
const themeH = THEMES.map(t => 56 + themeStrips(measure, t, 22, 0, false) + themeStrips(measure, t, 44, 0, false));
const SHEET_H = 90 + gridH + themeH.reduce((a, h) => a + h + 30, 0) + PAD;

const sheet = createCanvas(SHEET_W, SHEET_H);
const ctx = sheet.getContext('2d');
ctx.fillStyle = '#1e1f22';
ctx.fillRect(0, 0, SHEET_W, SHEET_H);
label(ctx, `Egg Shen emoji kit · ${codes.length} codes · contact sheet`, PAD, 36, { font: BOLD, size: 24, colour: '#f2f3f5' });
label(ctx, 'Drawn in scripts/emoji-styles/egg-shen.js · rebuild: npm run build:emojis · override: assets/emojis/art/<code>.png', PAD, 64, { size: 14, colour: '#949ba4' });

let y = 90;
ctx.fillStyle = '#80858d'; // mid-grey card: neither theme, so nothing hides
ctx.beginPath();
ctx.roundRect(PAD, y, SHEET_W - 2 * PAD, gridH, 12);
ctx.fill();
label(ctx, 'Every code at 64 px (the 128 px upload, halved), on mid-grey', PAD + 20, y + 28, { font: BOLD, size: 15, colour: '#1e1f22' });
y += 60;
for (const family of families) {
  label(ctx, `${family}s`, PAD + 20, y + 8, { font: BOLD, size: 13, colour: '#2b2d31' });
  y += 26;
  const list = codes.filter(c => KIT_CODES[c].family === family);
  list.forEach((code, i) => {
    const cx = PAD + 20 + (i % perLine) * CELL_W;
    const cy = y + Math.floor(i / perLine) * CELL_H;
    drawRun(ctx, [code], cx + (CELL_W - CELL) / 2, cy, CELL);
    label(ctx, code, cx + CELL_W / 2, cy + CELL + 12, { size: 13, colour: '#111214', align: 'center', font: MONO });
    if (manifest[code].source === 'art') label(ctx, '(png)', cx + CELL_W - 4, cy + 6, { size: 10, colour: '#111214', align: 'right' });
  });
  y += Math.ceil(list.length / perLine) * CELL_H + 8;
}
y = 90 + gridH + 30;

THEMES.forEach((theme, i) => {
  ctx.fillStyle = theme.bg;
  ctx.beginPath();
  ctx.roundRect(PAD, y, SHEET_W - 2 * PAD, themeH[i], 12);
  ctx.fill();
  label(ctx, `${theme.name} (${theme.bg}) — in context, smoothed as Discord shrinks the 128 px upload`, PAD + 20, y + 28, { font: BOLD, size: 16, colour: theme.text });
  let ty = y + 56;
  ty += themeStrips(ctx, theme, 22, ty, true);
  themeStrips(ctx, theme, 44, ty, true);
  y += themeH[i] + 30;
});

writeFileSync(path.join(OUT_DIR, 'contact-sheet.png'), sheet.toBuffer('image/png'));

const overridden = codes.filter(c => manifest[c].source === 'art');
console.log(`Built ${codes.length} emoji PNGs, manifest.json and contact-sheet.png in ${path.relative(ROOT, OUT_DIR)}/`
  + (overridden.length ? ` (PNG overrides: ${overridden.join(', ')})` : ''));

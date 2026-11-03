/**
 * The drawing kit behind every image the bot posts: the bracket
 * (bracketVisualizer.js) and the result cards (cardImages.js).
 *
 * Three things the server can't be trusted to provide, so they ship here:
 *
 *  - **Fonts.** The production box is a bare Linux server: no Arial, no
 *    colour emoji, maybe DejaVu. The bracket used to scan five system paths
 *    for something Arial-like and log each one on every start. Now the bot
 *    carries its own faces (assets/fonts, SIL OFL 1.1) and registerFonts()
 *    loads them once. A face that lacks a character (CJK, say) would draw
 *    its own empty box — the canvas never falls through to the next family
 *    in a list — so setFont() checks the text against the face's character
 *    map and uses the system's sans-serif for a string the face can't draw.
 *  - **Icons.** Never fillText an emoji: with no colour-emoji font, 🗳️ is an
 *    empty box. drawKitIcon() draws the emoji kit's own PNG
 *    (assets/emojis/<code>.png) instead.
 *  - **Posters**, fetched once and kept (loadImageCached): the bracket
 *    redraws every poster after every round.
 *
 * And the house style, "Egg Shen's Magic" (the logo; the emoji kit in
 * scripts/emoji-styles/egg-shen.js): carved dark stone with pale bevels,
 * diamond studs with jade gems, blue lightning, green-black nebula smoke,
 * red lacquer and old gold. The stone, stud, gem, smoke and bolt painters
 * are ported from the emoji kit's scripts/emoji-styles/common.js and
 * egg-shen.js (runtime code must live under src/; the kit's build scripts
 * are left alone so its PNGs stay byte-identical) and drawn here at card
 * scale rather than on its 128-unit grid.
 *
 * Everything random is seeded (rng), so an image is the same every time
 * it's drawn — which the pixel tests rely on.
 */
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { fetchImageUrl } from './fetchImageUrl.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FONTS_DIR = join(ROOT, 'assets', 'fonts');
const EMOJI_DIR = join(ROOT, 'assets', 'emojis');

export const TAU = Math.PI * 2;

// ════════════════════════════════════════════════════════════ palette

/** The bracket image's colours (moved from bracketVisualizer.js) */
export const CANVAS_COLORS = Object.freeze({
  primary: 'rgb(78, 197, 237)',
  background: 'rgb(25, 30, 35)',      // Dark with blue tint
  cardBg: 'rgb(35, 42, 48)',          // Slightly lighter with blue tint
  cardBorder: 'rgb(50, 60, 68)',      // Border with blue tint
  text: 'rgb(230, 235, 240)',         // Light text with blue tint
  textMuted: 'rgb(140, 150, 160)',    // Muted text with blue tint
  connectorLine: 'rgb(78, 110, 130)', // Connector lines with blue tint
});

/**
 * Egg Shen's Magic, the same values as the emoji kit's
 * (scripts/emoji-styles/egg-shen.js), so a card and its icons match.
 * Ramps run light → dark.
 */
export const EGG_SHEN = Object.freeze({
  stone: ['#b9b8aa', '#7b7a70', '#4c4c46', '#2d2d29', '#151513'],
  pale: 'rgba(222,220,204,0.9)', // the logo ring's pale bevel
  jade: { hi: '#d2ffdc', lit: '#6af293', mid: '#26b654', dark: '#0d6a2d' },
  amber: { hi: '#fff3c9', lit: '#ffc64d', mid: '#e48c1a', dark: '#9a4f08' },
  dead: { hi: '#56645c', lit: '#3a4640', mid: '#2a3430', dark: '#161d1a' },
  gold: ['#fff5c8', '#f8d35e', '#d89c1e', '#93600b', '#4c3005'],
  red: ['#ff8d7c', '#e2343a', '#b0141e', '#6e0910', '#3a0408'],
  bolt: { glow: '#3d6bff', mid: '#a8c6ff', core: '#ffffff' },
  ivory: '#f3ead2',
  mist: '#a9b8ae', // muted text on the nebula
  night: '#050807', // the nebula's black
  /** Bar energy: gold for a winner or leader, the logo's blue for the rest */
  energy: {
    gold: { dark: '#985f00', mid: '#f0b21c', light: '#ffe592', core: '#fffbe8' },
    blue: { dark: '#1a34c8', mid: '#3f7bff', light: '#b0ccff', core: '#ffffff' },
    jade: { dark: '#0a6a2c', mid: '#2ad064', light: '#a8ffc2', core: '#f2fff5' },
    grey: { dark: '#4a4f55', mid: '#8a9198', light: '#c9ced3', core: '#f2f4f6' },
  },
});

// ════════════════════════════════════════════════════════════ numbers & colour

/** Deterministic PRNG (mulberry32), as the emoji kit's: the same art every time */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, c => c + c) : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** '#rrggbb' + alpha → 'rgba(...)' */
export function rgba(hex, a) {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** A linear gradient from [[offset, colour], …] */
export function linear(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

/** A radial gradient centred on (x, y) */
export function radial(ctx, x, y, r, stops) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

// ════════════════════════════════════════════════════════════ fonts

/**
 * The bundled faces (assets/fonts/README.md says why these):
 *  - body: Barlow, Medium and Bold — titles, names, numbers
 *  - display: Anton — headings, in capitals, like 1980s poster billing
 * Registered under their own names, so a copy installed on a developer's
 * machine never stands in for the one that ships.
 */
const FACES = [
  { file: 'barlow/Barlow-Medium.ttf', family: 'Egg Shen Sans', weight: 500 },
  { file: 'barlow/Barlow-Bold.ttf', family: 'Egg Shen Sans', weight: 700 },
  { file: 'anton/Anton-Regular.ttf', family: 'Egg Shen Display', weight: 400 },
];
export const FONT_FAMILIES = Object.freeze({ body: 'Egg Shen Sans', display: 'Egg Shen Display' });
/**
 * What a string the bundled faces can't draw gets: the system's sans-serif,
 * which finds most scripts glyph by glyph. Not CJK reliably (on macOS it
 * found 大 but drew 会 as a box), so text with CJK in it asks for a CJK
 * face by name first; the canvas uses the first one installed for the
 * whole string.
 */
export const FALLBACK_FAMILY = 'sans-serif';
const CJK_FALLBACK = '"Noto Sans CJK SC", "Noto Sans CJK JP", "Noto Sans CJK KR", "Source Han Sans SC", "WenQuanYi Zen Hei", "Hiragino Sans", "Microsoft YaHei", sans-serif';
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

let fontState = null;

/** Whether the canvas already has this face (from another copy of this module: jest loads one per test file) */
function alreadyRegistered(family, weight) {
  return GlobalFonts.families.some(f => f.family === family && f.styles.some(st => st.weight === weight));
}

/**
 * Register the bundled faces with the canvas. Idempotent: the first call
 * loads them, later calls return the same result. A missing or unreadable
 * file is reported, not thrown — text then draws in the system font.
 * @returns {{ families: string[], missing: string[] }}
 */
export function registerFonts() {
  if (!fontState) {
    const coverage = new Map();
    const families = new Set();
    const missing = [];
    for (const face of FACES) {
      try {
        const buffer = readFileSync(join(FONTS_DIR, face.file));
        if (!alreadyRegistered(face.family, face.weight) && !GlobalFonts.register(buffer, face.family)) {
          throw new Error('not a font the canvas can read');
        }
        families.add(face.family);
        // Every weight of a family shares one character set; the first read wins
        if (!coverage.has(face.family)) coverage.set(face.family, readCoverage(buffer));
      } catch (error) {
        missing.push(face.file);
        console.warn(`[canvasKit] Font ${face.file} not loaded (${error.message}); using the system font`);
      }
    }
    fontState = { families: [...families], missing, coverage };
  }
  return { families: [...fontState.families], missing: [...fontState.missing] };
}

function familyName(family) {
  return FONT_FAMILIES[family] || family;
}

/** The nearest weight the bundled body face has: 500 or 700 (display has one) */
function faceWeight(name, weight) {
  if (name === FONT_FAMILIES.display) return 400;
  return weight >= 600 ? 700 : 500;
}

/**
 * A CSS font string for a bundled face.
 * @param {number} px
 * @param {{ family?: 'body'|'display'|string, weight?: number }} [options]
 */
export function font(px, { family = 'body', weight = 500 } = {}) {
  registerFonts();
  const name = familyName(family);
  return `${faceWeight(name, weight)} ${px}px "${name}"`;
}

/**
 * Whether a bundled face has a glyph for every character of `text`.
 * Characters that draw nothing (spaces, joiners, variation selectors)
 * always pass.
 */
export function hasGlyphs(family, text) {
  registerFonts();
  const ranges = fontState.coverage.get(familyName(family));
  if (!ranges) return false;
  for (const ch of String(text ?? '')) {
    const cp = ch.codePointAt(0);
    if (cp <= 0x20 || INVISIBLE.test(ch)) continue;
    if (!inRanges(ranges, cp)) return false;
  }
  return true;
}
const INVISIBLE = /[\u{AD}\u{200B}-\u{200F}\u{2028}-\u{202E}\u{2060}-\u{2064}\u{FE00}-\u{FE0F}]/u;

/**
 * Set ctx.font for `text`: the bundled face, or — when the face is missing
 * a character in it — the system sans-serif at the same size, which falls
 * back glyph by glyph. Measure and draw the same string after this.
 * @returns {string} the font string applied
 */
export function setFont(ctx, px, options = {}, text = null) {
  let css = font(px, options);
  const name = familyName(options.family || 'body');
  const usable = fontState.families.includes(name);
  if (!usable || (text != null && !hasGlyphs(name, text))) {
    const weight = (options.weight ?? 500) >= 600 || name === FONT_FAMILIES.display ? 'bold' : 'normal';
    css = `${weight} ${px}px ${text != null && CJK.test(text) ? CJK_FALLBACK : FALLBACK_FAMILY}`;
  }
  ctx.font = css;
  return css;
}

/** Binary search a sorted list of [first, last] code point ranges */
function inRanges(ranges, cp) {
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cp < ranges[mid][0]) hi = mid - 1;
    else if (cp > ranges[mid][1]) lo = mid + 1;
    else return true;
  }
  return false;
}

/**
 * The characters a TrueType font maps to a real glyph, read from its
 * `cmap` table (format 12, else format 4), as sorted [first, last] ranges.
 * The canvas offers no way to ask, and a font draws its own "missing" box
 * for anything it lacks rather than letting the next family try.
 */
export function readCoverage(buf) {
  const u16 = (o) => buf.readUInt16BE(o);
  const u32 = (o) => buf.readUInt32BE(o);
  let cmap = -1;
  for (let i = 0, n = u16(4); i < n; i++) {
    const rec = 12 + i * 16;
    if (buf.toString('latin1', rec, rec + 4) === 'cmap') cmap = u32(rec + 8);
  }
  if (cmap < 0) return [];
  let table = null;
  for (let i = 0, n = u16(cmap + 2); i < n; i++) {
    const rec = cmap + 4 + i * 8;
    const platform = u16(rec);
    const encoding = u16(rec + 2);
    const offset = cmap + u32(rec + 4);
    const format = u16(offset);
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (!unicode) continue;
    if (format === 12) { table = { format, offset }; break; }
    if (format === 4 && !table) table = { format, offset };
  }
  if (!table) return [];

  const ranges = [];
  const add = (first, last) => {
    const prev = ranges[ranges.length - 1];
    if (prev && first <= prev[1] + 1) prev[1] = Math.max(prev[1], last);
    else ranges.push([first, last]);
  };
  if (table.format === 12) {
    const groups = [];
    for (let g = 0, n = u32(table.offset + 12); g < n; g++) {
      const o = table.offset + 16 + g * 12;
      groups.push([u32(o), u32(o + 4)]);
    }
    groups.sort((a, b) => a[0] - b[0]).forEach(([a, b]) => add(a, b));
  } else {
    const o = table.offset;
    const segX2 = u16(o + 6);
    const ends = o + 14;
    const starts = ends + segX2 + 2;
    const deltas = starts + segX2;
    const rangeOffsets = deltas + segX2;
    for (let s = 0; s < segX2 / 2; s++) {
      const end = u16(ends + 2 * s);
      const start = u16(starts + 2 * s);
      const delta = u16(deltas + 2 * s);
      const ro = u16(rangeOffsets + 2 * s);
      if (start === 0xFFFF) continue;
      for (let c = start; c <= end; c++) {
        let glyph;
        if (ro === 0) glyph = (c + delta) & 0xFFFF;
        else {
          glyph = u16(rangeOffsets + 2 * s + ro + 2 * (c - start));
          if (glyph) glyph = (glyph + delta) & 0xFFFF;
        }
        if (glyph) add(c, c);
      }
    }
  }
  return ranges;
}

// ════════════════════════════════════════════════════════════ text

// Pictographs: emoji, flags, skin tones, joiners, keycaps, tags. Kept: the
// © ® ™ that titles carry, which every face has as plain text.
const PICTOGRAPHS = /(?![©®™])\p{Extended_Pictographic}|\p{Regional_Indicator}|[\u{1F3FB}-\u{1F3FF}\u{FE0E}\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu;

/**
 * Text without emoji, for drawing: the canvas has no colour-emoji font, so
 * every emoji would be an empty box. Also drops Discord's custom emoji
 * markup (<:name:id>) and keycaps (1️⃣), and tidies the spaces left behind.
 */
export function stripPictographs(text) {
  return String(text ?? '')
    .replace(/<a?:\w+:\d+>/g, ' ')
    .replace(/[0-9#*]\u{FE0F}?\u{20E3}/gu, ' ')
    .replace(PICTOGRAPHS, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

const ELLIPSIS = '…';

/**
 * `text` cut to fit `maxWidth` in the current ctx.font, ending in "…" when
 * cut. Cuts between characters, never inside a surrogate pair. Returns ''
 * when not even the ellipsis fits.
 */
export function fitText(ctx, text, maxWidth) {
  const s = String(text ?? '');
  if (ctx.measureText(s).width <= maxWidth) return s;
  const chars = Array.from(s);
  let lo = 0;
  let hi = chars.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (ctx.measureText(chars.slice(0, mid).join('').trimEnd() + ELLIPSIS).width <= maxWidth) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (best < 0) return '';
  return chars.slice(0, best).join('').trimEnd() + ELLIPSIS;
}

/**
 * Word-wrap `text` into at most `maxLines` lines of `maxWidth` (current
 * ctx.font); the last line is cut with "…" if the text runs on. A word
 * wider than a line is broken between characters.
 */
export function wrapText(ctx, text, maxWidth, maxLines = 2) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const candidate = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }
    // The last line allowed takes everything left, cut to fit
    if (lines.length === maxLines - 1) {
      lines.push(fitText(ctx, [line, ...words.slice(i)].filter(Boolean).join(' '), maxWidth));
      return lines;
    }
    if (line) {
      lines.push(line);
      line = '';
    } else {
      // A word wider than a whole line: as much of it as fits, the rest next
      const chars = Array.from(words[i]);
      let n = chars.length;
      while (n > 1 && ctx.measureText(chars.slice(0, n).join('')).width > maxWidth) n--;
      lines.push(chars.slice(0, n).join(''));
      words[i] = chars.slice(n).join('');
    }
    i--; // this word again, on the new line
  }
  if (line) lines.push(line);
  return lines;
}

// ════════════════════════════════════════════════════════════ shapes

/** A rounded rectangle path (begins a new path) */
export function roundRectPath(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/** A diamond (square on its point) path */
function diamondPath(ctx, cx, cy, r) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy);
  ctx.closePath();
}

/**
 * A shining gold trophy in the style of the 🏆 emoji, on a matchup winner's
 * tile and above the champion card. Drawn as shapes, not text: the server's
 * fonts have no colour emoji, so a 🏆 character renders as an empty box (as
 * ✓ once did here).
 * @param {number} cx - Centre x
 * @param {number} cy - Centre y
 * @param {number} size - Height of the trophy in pixels, sparkles aside
 */
export function drawTrophyIcon(ctx, cx, cy, size) {
  const u = size / 30; // Drawn on a grid where the cup's rim is y -14 and the base's foot y +15
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(u, u);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Metallic gold: pale where the light catches the left, deep amber right
  const gold = ctx.createLinearGradient(-11, 0, 11, 0);
  gold.addColorStop(0, '#FFF3A8');
  gold.addColorStop(0.35, '#FFD43B');
  gold.addColorStop(0.75, '#F0A30A');
  gold.addColorStop(1, '#B86E00');
  const outline = '#8A5200';

  const cupPath = () => {
    ctx.beginPath();
    ctx.moveTo(-10.5, -14);
    ctx.lineTo(10.5, -14);
    ctx.bezierCurveTo(10.5, -4, 6.5, 2.5, 2, 3);
    ctx.lineTo(-2, 3);
    ctx.bezierCurveTo(-6.5, 2.5, -10.5, -4, -10.5, -14);
    ctx.closePath();
  };

  // The glow: every gold part casts a warm halo. shadowBlur is in canvas
  // pixels, unaffected by the scale above, hence the * u.
  ctx.shadowColor = 'rgba(255, 200, 40, 0.85)';
  ctx.shadowBlur = 9 * u;

  // Handles, behind the cup
  ctx.strokeStyle = gold;
  ctx.lineWidth = 2.6;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(9.5 * side, -12);
    ctx.bezierCurveTo(17 * side, -12.5, 16.5 * side, -2, 6 * side, -1);
    ctx.stroke();
  }

  // Cup, stem and two-step base
  ctx.fillStyle = gold;
  cupPath();
  ctx.fill();
  ctx.fillRect(-2, 3, 4, 5);
  roundRectPath(ctx, -6, 8, 12, 2.5, 1);
  ctx.fill();
  roundRectPath(ctx, -8.5, 10.5, 17, 4.5, 1.2);
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  ctx.strokeStyle = outline;
  ctx.lineWidth = 0.8;
  cupPath();
  ctx.stroke();
  roundRectPath(ctx, -6, 8, 12, 2.5, 1);
  ctx.stroke();
  roundRectPath(ctx, -8.5, 10.5, 17, 4.5, 1.2);
  ctx.stroke();

  // Engraved plate on the base
  ctx.fillStyle = 'rgba(138, 82, 0, 0.55)';
  ctx.fillRect(-4.5, 11.8, 9, 2);

  // The rim catching the light
  ctx.strokeStyle = '#FFF8D0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-9.5, -13.3);
  ctx.lineTo(9.5, -13.3);
  ctx.stroke();

  // Gloss: a white streak down the bowl's lit side
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.beginPath();
  ctx.moveTo(-7.5, -12);
  ctx.quadraticCurveTo(-7.8, -4, -3.5, 0.5);
  ctx.quadraticCurveTo(-5.6, -4.5, -5.2, -12);
  ctx.closePath();
  ctx.fill();

  // Sparkles: the shine
  drawSparkle(ctx, 11.5, -15, 4.2, u);
  drawSparkle(ctx, -13, 7, 2.6, u);
  drawSparkle(ctx, 4.5, -8.5, 1.8, u); // a glint on the cup itself

  ctx.restore();
}

/** A four-pointed white sparkle with a soft glow, centred on (x, y) */
export function drawSparkle(ctx, x, y, r, u = 1) {
  const k = r * 0.22; // How far the sides pinch in towards the centre
  ctx.save();
  ctx.shadowColor = 'rgba(255, 240, 180, 0.95)';
  ctx.shadowBlur = r * 1.5 * u;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x + k, y - k, x + r, y);
  ctx.quadraticCurveTo(x + k, y + k, x, y + r);
  ctx.quadraticCurveTo(x - k, y + k, x - r, y);
  ctx.quadraticCurveTo(x - k, y - k, x, y - r);
  ctx.fill();
  ctx.restore();
}

// ════════════════════════════════════════════════════════════ images

/**
 * Draw `img` to fill the box, cropped from its centre (CSS object-fit:
 * cover), optionally with rounded corners and transparency.
 */
export function drawCoverImage(ctx, img, x, y, w, h, { radius = 0, alpha = 1 } = {}) {
  const iw = img.width;
  const ih = img.height;
  if (!iw || !ih) return;
  const scale = Math.max(w / iw, h / ih);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (iw - sw) / 2;
  const sy = (ih - sh) / 2;
  ctx.save();
  if (radius > 0) {
    roundRectPath(ctx, x, y, w, h, radius);
    ctx.clip();
  }
  ctx.globalAlpha *= alpha;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
}

/** code → Promise<Image|null>: each PNG read and decoded once */
const kitIcons = new Map();

/** The kit icon's decoded PNG; null if there's no such code */
function kitIcon(code) {
  if (!kitIcons.has(code)) {
    // Codes are 1–6 lowercase letters/digits (emojiKit.js), so this is never a path
    const file = /^[a-z0-9]{1,6}$/.test(String(code)) ? join(EMOJI_DIR, `${code}.png`) : null;
    const load = file && existsSync(file) ? loadImage(readFileSync(file)).catch(() => null) : Promise.resolve(null);
    kitIcons.set(code, load.then((img) => {
      if (!img) console.warn(`[canvasKit] No kit icon "${code}"`);
      return img;
    }));
  }
  return kitIcons.get(code);
}

/**
 * Draw an emoji-kit icon (assets/emojis/<code>.png, the same art the cards'
 * custom emoji use) as a size × size square with its top-left at (x, y).
 * What to use instead of fillText('🏆'): the server has no colour-emoji
 * font. Async because the canvas decodes images off-thread (an Image whose
 * src was just set draws nothing); each PNG is decoded once, then cached.
 * @returns {Promise<boolean>} false when the code has no PNG (nothing drawn)
 */
export async function drawKitIcon(ctx, code, x, y, size) {
  const img = await kitIcon(code);
  if (!img) return false;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, x, y, size, size);
  ctx.restore();
  return true;
}

/** Poster cache limits: encoded bytes (~50–150 KB each), not decoded pixels (~1.5 MB) */
export const IMAGE_CACHE = Object.freeze({ maxEntries: 64, ttlMs: 30 * 60 * 1000 });

/** url → { buffer, at }, least recently used first (Map keeps insertion order) */
const imageCache = new Map();
/** url → Promise<Buffer|null>: one download however many draws want it at once */
const inflight = new Map();

/** Empty the poster cache (tests) */
export function clearImageCache() {
  imageCache.clear();
  inflight.clear();
}

/** The urls cached, least recently used first (tests) */
export function cachedImageUrls() {
  return [...imageCache.keys()];
}

/**
 * Load an image by URL, from the cache when it's there. Keeps the last 64
 * downloads (encoded) for 30 minutes, so the bracket's 32 posters are
 * fetched once a tournament, not once per round. Never throws: a missing,
 * slow (past `timeoutMs`), non-image or undecodable poster is null, and the
 * caller draws a placeholder.
 * @param {string} url - http(s) only
 * @param {{ timeoutMs?: number, fetchImpl?: Function }} [options]
 * @returns {Promise<import('@napi-rs/canvas').Image|null>}
 */
export async function loadImageCached(url, { timeoutMs = 5000, fetchImpl } = {}) {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return null;
  const hit = imageCache.get(url);
  if (hit) {
    imageCache.delete(url);
    if (Date.now() - hit.at < IMAGE_CACHE.ttlMs) {
      imageCache.set(url, hit); // now the most recently used
      return decode(hit.buffer);
    }
  }
  let pending = inflight.get(url);
  if (!pending) {
    pending = download(url, timeoutMs, fetchImpl).finally(() => inflight.delete(url));
    inflight.set(url, pending);
  }
  const buffer = await pending;
  return buffer ? decode(buffer) : null;
}

async function decode(buffer) {
  try {
    return await loadImage(buffer);
  } catch {
    return null;
  }
}

/** Fetch, check it decodes, cache it. Resolves to the bytes or null. */
async function download(url, timeoutMs, fetchImpl) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ ok: false, error: `timed out after ${timeoutMs} ms` });
    }, timeoutMs);
    timer.unref?.();
  });
  try {
    // Raced as well as aborted: a fetch that ignores its signal still can't hold the draw up
    const result = await Promise.race([fetchImageUrl(url, { fetchImpl, signal: controller.signal, requireImageType: false }), timeout]);
    if (!result.ok) {
      console.warn(`[canvasKit] Image not loaded (${result.error}): ${url}`);
      return null;
    }
    if (!(await decode(result.buffer))) {
      console.warn(`[canvasKit] Image not loaded (could not decode): ${url}`);
      return null;
    }
    imageCache.set(url, { buffer: result.buffer, at: Date.now() });
    while (imageCache.size > IMAGE_CACHE.maxEntries) imageCache.delete(imageCache.keys().next().value);
    return result.buffer;
  } finally {
    clearTimeout(timer);
  }
}

/** Calculate color difference using simple RGB distance */
function colorDistance(rgb1, rgb2) {
  const [r1, g1, b1] = rgb1.split(',').map(Number);
  const [r2, g2, b2] = rgb2.split(',').map(Number);
  return Math.sqrt(Math.pow(r2 - r1, 2) + Math.pow(g2 - g1, 2) + Math.pow(b2 - b1, 2));
}

/**
 * Extract multiple dominant colors from a poster image for a gradient
 * (moved from bracketVisualizer.js).
 * @param {string|import('@napi-rs/canvas').Image} source - an image already
 *   loaded, or its URL (loaded through the cache)
 * @returns {Promise<string[]>} Array of 2-3 RGB color strings
 */
export async function extractPosterColors(source) {
  try {
    const img = typeof source === 'string' ? await loadImageCached(source) : source;
    if (!img) throw new Error('no image');
    const tempCanvas = createCanvas(img.width, img.height);
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(img, 0, 0);

    // Sample pixels from the image
    const imageData = tempCtx.getImageData(0, 0, img.width, img.height);
    const data = imageData.data;

    // Count color occurrences
    const colorCounts = {};
    const step = 10; // Sample every 10th pixel for performance

    for (let i = 0; i < data.length; i += 4 * step) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      // Skip transparent or very dark/light pixels
      if (a < 128 || (r + g + b) < 60 || (r + g + b) > 700) continue;

      // Round to nearest 30 to group similar colors
      const key = `${Math.round(r / 30) * 30},${Math.round(g / 30) * 30},${Math.round(b / 30) * 30}`;
      colorCounts[key] = (colorCounts[key] || 0) + 1;
    }

    // Sort colors by frequency
    const sortedColors = Object.entries(colorCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([color]) => color);

    // Select diverse colors (filter out colors too similar to already selected ones)
    const selectedColors = [];
    const minDistance = 80; // Minimum color difference threshold

    for (const color of sortedColors) {
      if (selectedColors.length === 0) {
        selectedColors.push(color);
      } else if (selectedColors.every(selected => colorDistance(color, selected) > minDistance)) {
        selectedColors.push(color);
      }
      if (selectedColors.length >= 3) break;
    }

    // Ensure we have at least 2 colors
    while (selectedColors.length < 2) {
      selectedColors.push(selectedColors[selectedColors.length - 1] || '50,60,68');
    }

    return selectedColors.map(color => `rgb(${color})`);
  } catch (error) {
    if (error.message !== 'no image') console.error('[canvasKit] Error extracting colors:', error.message);
    return [CANVAS_COLORS.cardBg, CANVAS_COLORS.cardBg];
  }
}

// ════════════════════════════════════════════════════════════ Egg Shen's Magic

/** Speckle grain over a box (clip first to keep it on a shape) */
function grain(ctx, x, y, w, h, { seed = 1, n = 400, size = 1.6, light = 0.12, dark = 0.18 } = {}) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const px = x + r() * w;
    const py = y + r() * h;
    const s = size * (0.5 + r());
    const up = r() < 0.45;
    ctx.fillStyle = up ? `rgba(255,255,255,${light * r()})` : `rgba(0,0,0,${dark * r()})`;
    ctx.fillRect(px, py, s, s);
  }
}

/** Hairline cracks (carved stone) */
function cracks(ctx, x, y, w, h, { seed = 1, n = 4, len = 18, width = 1.4 } = {}) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    let px = x + r() * w;
    let py = y + r() * h;
    const pts = [[px, py]];
    let a = r() * TAU;
    for (let k = 0; k < 4; k++) {
      a += (r() - 0.5) * 1.6;
      px += Math.cos(a) * len * (0.3 + r() * 0.4);
      py += Math.sin(a) * len * (0.3 + r() * 0.4);
      pts.push([px, py]);
    }
    for (const [col, dx] of [['rgba(255,255,255,0.12)', width * 0.65], ['rgba(0,0,0,0.45)', 0]]) {
      ctx.beginPath();
      pts.forEach(([qx, qy], j) => (j ? ctx.lineTo(qx + dx, qy + dx) : ctx.moveTo(qx + dx, qy + dx)));
      ctx.strokeStyle = col;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  }
}

/** A bevel on any shape: pale along the top-left edges, dark bottom-right, kept inside it */
function bevel(ctx, pathFn, width, light, dark, [x0, y0, x1, y1]) {
  ctx.save();
  pathFn();
  ctx.clip();
  const g = linear(ctx, x0, y0, x1, y1, [[0, light], [0.45, 'rgba(0,0,0,0)'], [0.55, 'rgba(0,0,0,0)'], [1, dark]]);
  pathFn();
  ctx.strokeStyle = g;
  ctx.lineWidth = width * 2;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

/**
 * Carved stone filling a path: a dark gradient, grit, a crack or two and a
 * pale top-left bevel — the logo's ring.
 * @param {Function} pathFn - builds the path (called several times)
 * @param {number[]} box - [x0, y0, x1, y1] the path's bounds
 * @param {Object} [options]
 * @param {number[][]} [options.texture] - boxes to put the grit and cracks
 *   in, when the shape covers only part of its bounds (a frame's ring):
 *   grit is drawn speck by speck, so a whole-canvas box costs ~50k of them
 */
export function drawStone(ctx, pathFn, box, seed = 1, { cracked = true, bevelWidth = 3.2, density = 1 / 12, texture = [box] } = {}) {
  const [x0, y0, x1, y1] = box;
  const S = EGG_SHEN.stone;
  pathFn();
  ctx.fillStyle = linear(ctx, x0, y0, x1, y1, [[0, S[1]], [0.4, S[2]], [1, S[4]]]);
  ctx.fill();
  ctx.save();
  pathFn();
  ctx.clip();
  texture.forEach(([tx0, ty0, tx1, ty1], i) => {
    const tw = tx1 - tx0;
    const th = ty1 - ty0;
    grain(ctx, tx0, ty0, tw, th, { seed: seed + i * 101, n: Math.round(tw * th * density), size: 1.8, light: 0.16, dark: 0.32 });
    if (cracked) cracks(ctx, tx0, ty0, tw, th, { seed: seed + 7 + i * 101, n: Math.max(2, Math.round((tw + th) / 220)), len: 16 });
  });
  ctx.restore();
  bevel(ctx, pathFn, bevelWidth, EGG_SHEN.pale, 'rgba(0,0,0,0.65)', box);
}

/** A four-pointed glint with a soft halo — the logo's gem sparkle */
export function drawGlint(ctx, x, y, r, colour = '#ffffff') {
  ctx.save();
  ctx.fillStyle = radial(ctx, x, y, r * 1.1, [[0, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']]);
  ctx.beginPath();
  ctx.arc(x, y, r * 1.1, 0, TAU);
  ctx.fill();
  const k = r * 0.2;
  ctx.beginPath();
  ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x + k, y - k, x + r, y);
  ctx.quadraticCurveTo(x + k, y + k, x, y + r); ctx.quadraticCurveTo(x - k, y + k, x - r, y);
  ctx.quadraticCurveTo(x - k, y - k, x, y - r); ctx.closePath();
  ctx.fillStyle = colour;
  ctx.fill();
  ctx.restore();
}

/** A faceted diamond gem (the logo's studs), lit or dead. `G` is a gem ramp, e.g. EGG_SHEN.jade */
export function drawGem(ctx, cx, cy, r, G = EGG_SHEN.jade, lit = true) {
  const P = [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]];
  const tri = (a, b, col) => {
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(...a); ctx.lineTo(...b); ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
  };
  tri(P[3], P[0], G.hi); tri(P[0], P[1], G.lit); tri(P[1], P[2], G.dark); tri(P[2], P[3], G.mid);
  diamondPath(ctx, cx, cy, r * 0.42);
  ctx.fillStyle = linear(ctx, cx - r * 0.4, cy - r * 0.4, cx + r * 0.4, cy + r * 0.4, [[0, G.hi], [1, G.mid]]);
  ctx.fill();
  if (lit) {
    diamondPath(ctx, cx, cy, r);
    ctx.fillStyle = radial(ctx, cx, cy, r, [[0, 'rgba(255,255,255,0.55)'], [0.5, 'rgba(255,255,255,0.08)'], [1, 'rgba(255,255,255,0)']]);
    ctx.fill();
    drawGlint(ctx, cx - r * 0.12, cy - r * 0.12, r * 0.7);
  }
}

/** A gem in its dark setting, no stone around it */
export function drawSetGem(ctx, cx, cy, r, G = EGG_SHEN.jade, lit = true) {
  diamondPath(ctx, cx, cy, r + Math.max(2, r / 5));
  ctx.fillStyle = '#0b0c0b';
  ctx.fill();
  drawGem(ctx, cx, cy, r, G, lit);
}

/** A carved pyramid stud of radius R with a gem of radius r — the logo's ring studs */
export function drawStud(ctx, cx, cy, R, r, G = EGG_SHEN.jade, lit = true, seed = 3) {
  const S = EGG_SHEN.stone;
  const P = [[cx, cy - R], [cx + R, cy], [cx, cy + R], [cx - R, cy]];
  const I = [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]];
  const facet = (a, b, c, d, col) => {
    ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...c); ctx.lineTo(...d); ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
  };
  // A dark rim first, so the stud reads against stone of the same colour
  diamondPath(ctx, cx, cy, R + Math.max(2, R / 10));
  ctx.fillStyle = '#070808';
  ctx.fill();
  facet(P[3], P[0], I[0], I[3], S[1]);
  facet(P[0], P[1], I[1], I[0], S[2]);
  facet(P[1], P[2], I[2], I[1], S[4]);
  facet(P[2], P[3], I[3], I[2], S[3]);
  ctx.save();
  diamondPath(ctx, cx, cy, R);
  ctx.clip();
  grain(ctx, cx - R, cy - R, R * 2, R * 2, { seed, n: Math.round(R * R * 0.9), size: 1.6, light: 0.16, dark: 0.3 });
  ctx.restore();
  ctx.lineWidth = Math.max(1.2, R / 26);
  for (let i = 0; i < 4; i++) {
    ctx.beginPath(); ctx.moveTo(...P[i]); ctx.lineTo(...I[i]);
    ctx.strokeStyle = i === 0 || i === 3 ? 'rgba(230,228,210,0.7)' : 'rgba(0,0,0,0.5)';
    ctx.stroke();
  }
  bevel(ctx, () => diamondPath(ctx, cx, cy, R), Math.max(2, R / 18), EGG_SHEN.pale, 'rgba(0,0,0,0.6)', [cx - R, cy - R, cx + R, cy + R]);
  if (lit) {
    diamondPath(ctx, cx, cy, R);
    ctx.fillStyle = radial(ctx, cx, cy, R * 0.95, [[0, rgba(G.lit, 0.55)], [0.6, rgba(G.lit, 0.18)], [1, rgba(G.lit, 0)]]);
    ctx.fill();
  }
  diamondPath(ctx, cx, cy, r + Math.max(2, R / 20));
  ctx.fillStyle = '#0b0c0b';
  ctx.fill();
  drawGem(ctx, cx, cy, r, G, lit);
}

/**
 * The green-black nebula behind the logo's lightning: near-black, soft
 * smoke in dark greens (and a little of the bolt's blue), faint stars.
 */
export function drawNebula(ctx, x, y, w, h, { seed = 1, stars = true, starAlpha = 0.55 } = {}) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = EGG_SHEN.night;
  ctx.fillRect(x, y, w, h);
  const r = rng(seed);
  const big = Math.max(w, h);
  const blob = (cx, cy, rr, col, a) => {
    ctx.fillStyle = radial(ctx, cx, cy, rr, [[0, rgba(col, a)], [0.55, rgba(col, a * 0.45)], [1, rgba(col, 0)]]);
    ctx.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
  };
  // Clouds: a few big ones, with black left between them
  const clouds = [];
  const colours = ['#1f4a2c', '#173a24', '#2a5a38', '#123020', '#16304a'];
  const n = Math.round((w * h) / 30000) + 5;
  for (let i = 0; i < n; i++) {
    const cloud = [x + r() * w, y + r() * h, big * (0.08 + r() * 0.16)];
    clouds.push(cloud);
    blob(...cloud, colours[i % colours.length], 0.25 + r() * 0.3);
  }
  // Mottling inside them: smaller, paler puffs, the logo's smoke texture
  const puffs = Math.round((w * h) / 3500);
  for (let i = 0; i < puffs; i++) {
    const [cx, cy, cr] = clouds[Math.floor(r() * clouds.length)];
    const a = r() * TAU;
    const d = cr * Math.sqrt(r()) * 0.9;
    blob(cx + Math.cos(a) * d, cy + Math.sin(a) * d, big * (0.012 + r() * 0.035), i % 3 ? '#2f6a40' : '#3d7f50', 0.08 + r() * 0.16);
  }
  if (stars) {
    const count = Math.round((w * h) / 2600);
    for (let i = 0; i < count; i++) {
      const sx = x + r() * w;
      const sy = y + r() * h;
      ctx.fillStyle = rgba('#e8fff0', (0.25 + r() * 0.75) * starAlpha);
      ctx.beginPath();
      ctx.arc(sx, sy, 0.5 + r() * 1.3, 0, TAU);
      ctx.fill();
    }
  }
  // Vignette: the edges fall away into black
  ctx.fillStyle = radial(ctx, x + w / 2, y + h / 2, Math.hypot(w, h) / 2, [[0.55, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.6)']]);
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

/**
 * A carved stone frame around the whole canvas — the logo's ring as a
 * tablet's edge — with jade-gem studs at its corners (and `midStuds` at the
 * middle of the left and right sides).
 * @returns {{x, y, w, h}} the area inside the rim
 */
export function drawStoneFrame(ctx, w, h, { rim = 18, radius = 26, seed = 5, midStuds = false, studRadius = 22 } = {}) {
  const outer = () => roundRectPath(ctx, 1, 1, w - 2, h - 2, radius);
  const inner = () => roundRectPath(ctx, rim, rim, w - rim * 2, h - rim * 2, Math.max(4, radius - rim / 2));
  ctx.save();
  // The ring: the outer shape with the inner one cut out of it
  outer();
  addRoundRect(ctx, rim, rim, w - rim * 2, h - rim * 2, Math.max(4, radius - rim / 2));
  ctx.clip('evenodd');
  const t = rim + 6; // the strips the ring runs through, corners included
  drawStone(ctx, outer, [0, 0, w, h], seed, {
    bevelWidth: 3,
    density: 1 / 10,
    texture: [[0, 0, w, t], [0, h - t, w, h], [0, t, t, h - t], [w - t, t, w, h - t]],
  });
  ctx.restore();
  // The inner edge, carved down: dark lip, then a pale catch of light below it
  ctx.save();
  inner();
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.translate(1.5, 1.5);
  inner();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(222,220,204,0.28)';
  ctx.stroke();
  ctx.restore();
  // The outer edge: a dark outline, as every kit icon has
  outer();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#070808';
  ctx.stroke();

  // Joints between the carved blocks, as on the logo's ring: a dark cut and
  // a pale lip beside it, every ~160 px along each side
  const joint = (x0, y0, x1, y1, dx, dy) => {
    for (const [col, o, lw] of [['rgba(0,0,0,0.75)', 0, 2], ['rgba(222,220,204,0.3)', 1.6, 1.2]]) {
      ctx.beginPath();
      ctx.moveTo(x0 + dx * o, y0 + dy * o);
      ctx.lineTo(x1 + dx * o, y1 + dy * o);
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      ctx.stroke();
    }
  };
  const clear = studRadius * 2 + 30; // keep the joints off the studs
  const across = Math.max(1, Math.round((w - clear * 2) / 160));
  for (let i = 1; i < across; i++) {
    const x = clear + ((w - clear * 2) * i) / across;
    if (Math.abs(x - w / 2) < 60) continue; // the header's centre
    joint(x, 2, x - 3, rim, 1, 0);
    joint(x, h - 2, x - 3, h - rim, 1, 0);
  }
  const down = Math.max(1, Math.round((h - clear * 2) / 160));
  for (let i = 1; i < down; i++) {
    const y = clear + ((h - clear * 2) * i) / down;
    if (midStuds && Math.abs(y - h / 2) < studRadius + 12) continue;
    joint(2, y, rim, y - 3, 0, 1);
    joint(w - 2, y, w - rim, y - 3, 0, 1);
  }

  // Studs straddle the rim, wholly on the canvas
  const c = studRadius + 3;
  const studs = [[c, c], [w - c, c], [c, h - c], [w - c, h - c]];
  if (midStuds) studs.push([c - 1, h / 2], [w - c + 1, h / 2]);
  studs.forEach(([sx, sy], i) => drawStud(ctx, sx, sy, studRadius, studRadius * 0.45, EGG_SHEN.jade, true, seed + 11 + i));
  return { x: rim, y: rim, w: w - rim * 2, h: h - rim * 2 };
}

/** A rounded rectangle added to the current path (no beginPath), e.g. a hole to cut */
function addRoundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * A jagged bolt from (x0, y0) to (x1, y1), as points; `amp` is how far it
 * wanders off the straight line. The ends are exact.
 */
export function boltPoints(rand, x0, y0, x1, y1, { steps = 9, amp = 10 } = {}) {
  const pts = [[x0, y0]];
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  for (let i = 1; i < steps; i++) {
    const t = i / steps + (rand() - 0.5) * (0.5 / steps);
    const off = (rand() - 0.5) * 2 * amp * Math.sin(Math.PI * Math.min(1, t * 1.15));
    pts.push([x0 + dx * t + nx * off, y0 + dy * t + ny * off]);
  }
  pts.push([x1, y1]);
  return pts;
}

/** Stroke a bolt's points: wide and faint → thin and white, so it glows without a blur */
export function strokeBolt(ctx, pts, { glow = EGG_SHEN.bolt.glow, mid = EGG_SHEN.bolt.mid, core = EGG_SHEN.bolt.core, width = 3, glowAlpha = 0.22 } = {}) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [w, c] of [[width * 5, rgba(glow, glowAlpha)], [width * 3, rgba(glow, glowAlpha * 2)], [width * 1.8, mid], [width * 0.8, core]]) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.strokeStyle = c;
    ctx.lineWidth = w;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Crackling blue lightning from (x0, y0) to (x1, y1), with forks — the
 * logo's bolt between Egg Shen's hands.
 */
export function drawLightning(ctx, x0, y0, x1, y1, { seed = 1, amp = 14, steps = 10, width = 3, branches = 3, branchLength = 40, colours = EGG_SHEN.bolt } = {}) {
  const rand = rng(seed);
  const trunk = boltPoints(rand, x0, y0, x1, y1, { steps, amp });
  const style = { glow: colours.glow, mid: colours.mid, core: colours.core };
  for (let b = 0; b < branches; b++) {
    const i = 1 + Math.floor(rand() * (trunk.length - 2));
    const [bx, by] = trunk[i];
    const a = Math.atan2(y1 - y0, x1 - x0) + (rand() < 0.5 ? -1 : 1) * (0.5 + rand() * 0.7);
    const L = branchLength * (0.6 + rand() * 0.6);
    const fork = boltPoints(rand, bx, by, bx + Math.cos(a) * L, by + Math.sin(a) * L, { steps: 4, amp: amp * 0.5 });
    strokeBolt(ctx, fork, { ...style, width: width * 0.55 });
  }
  strokeBolt(ctx, trunk, { ...style, width });
}

/**
 * The kit bar's crackling energy, filling a box: a lit band through the
 * middle and bolts running its length (EGG_SHEN.energy.gold, .blue, …).
 */
export function drawEnergy(ctx, x, y, w, h, E, { seed = 1 } = {}) {
  if (w <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = linear(ctx, 0, y, 0, y + h, [[0, E.dark], [0.28, E.mid], [0.5, E.light], [0.72, E.mid], [1, E.dark]]);
  ctx.fillRect(x, y, w, h);
  const r = rng(seed);
  const steps = Math.max(3, Math.round(w / 26));
  for (const [row, amp, width] of [[0.56, 0.32, h / 14], [0.42, 0.5, h / 8]]) {
    const pts = boltPoints(r, x - 4, y + h * row, x + w + 4, y + h * row, { steps, amp: h * amp });
    strokeBolt(ctx, pts, { glow: E.dark, mid: E.light, core: E.core, width: Math.max(0.8, width), glowAlpha: 0.25 });
  }
  ctx.restore();
}

/**
 * A groove carved in stone for a bar to run in: stone rails, a dark
 * groove of (x, y, w, h) with faint smoke in it. Fill it with drawEnergy.
 */
export function drawStoneChannel(ctx, x, y, w, h, { seed = 9, lip = Math.max(5, Math.round(h * 0.28)) } = {}) {
  const S = EGG_SHEN.stone;
  const box = [x - lip, y - lip, x + w + lip, y + h + lip];
  const path = () => roundRectPath(ctx, box[0], box[1], box[2] - box[0], box[3] - box[1], lip + 2);
  drawStone(ctx, path, box, seed, { cracked: false, bevelWidth: 2.2 });
  ctx.fillStyle = linear(ctx, 0, y, 0, y + h, [[0, '#010202'], [0.55, '#06100a'], [1, '#0d1c13']]);
  ctx.fillRect(x, y, w, h);
  // the groove's walls: shadow under the top lip, light on the bottom one
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(x, y - 1, w, 3);
  ctx.fillStyle = 'rgba(214,212,196,0.5)';
  ctx.fillRect(x, y + h, w, 1.5);
  ctx.strokeStyle = S[4];
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
}

/** Old-gold metal ramp along a box's diagonal (frames, rules) */
export function goldFill(ctx, x0, y0, x1, y1) {
  const [hi, light, mid, dark, deep] = EGG_SHEN.gold;
  return linear(ctx, x0, y0, x1, y1, [[0, hi], [0.22, light], [0.5, mid], [0.62, light], [0.85, dark], [1, deep]]);
}

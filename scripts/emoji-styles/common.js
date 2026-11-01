/**
 * Drawing helpers for the emoji kit (egg-shen.js draws every code with
 * them; scripts/build-emojis.js writes the PNGs).
 *
 * Every icon is painted on a 128-unit grid — the size Discord is sent — and
 * then shrunk by the browser to ~22 px inline (44 px on retina). At 22 px
 * one screen pixel is ~6 art units, so:
 *  - anything thinner than ~6 units disappears, and anything finer than
 *    ~12 units turns to mush; detail is for the 44 px view;
 *  - the silhouette carries the meaning, so `finish()` gives every icon one
 *    dark outline of the same weight (a dilation of its own shape), which is
 *    what keeps pale shapes visible on the light theme;
 *  - dark icons also need a pale rim inside that outline (stone bevels,
 *    glass edges), or they vanish on the dark theme.
 * Light comes from the top-left.
 *
 * Nothing here loads an image or a font, so the build needs no assets, and
 * nothing is random without a seed (rng), so it is byte-for-byte repeatable.
 */
import { createCanvas } from '@napi-rs/canvas';

export const U = 128;
export const TAU = Math.PI * 2;

// ---------------------------------------------------------------- numbers

/** Deterministic PRNG (mulberry32): the same art on every build */
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

export function hexRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, c => c + c) : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** '#rrggbb' + alpha → 'rgba(...)' */
export function rgba(hex, a) {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
/** Mix two hex colours (t = 0 → a, 1 → b) */
export function mix(a, b, t) {
  const A = hexRgb(a); const B = hexRgb(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

// ---------------------------------------------------------------- gradients

export function lin(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}
/** Radial gradient centred on (x, y), optionally from a focal point */
export function rad(ctx, x, y, r, stops, fx = x, fy = y, fr = 0) {
  const g = ctx.createRadialGradient(fx, fy, fr, x, y, r);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}
/** A metal ramp (light → dark) laid along the top-left → bottom-right diagonal of a box */
export function metal(ctx, ramp, x0, y0, x1, y1) {
  const [hi, light, mid, dark, deep] = ramp;
  return lin(ctx, x0, y0, x1, y1, [[0, hi], [0.22, light], [0.5, mid], [0.62, light], [0.85, dark], [1, deep]]);
}

// ---------------------------------------------------------------- paths

export function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }
export function ellipse(ctx, x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); }
export function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
export function poly(ctx, pts, close = true) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  if (close) ctx.closePath();
}
/** A diamond (square on its point) */
export function diamond(ctx, cx, cy, r) { poly(ctx, [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]]); }

export function fill(ctx, pathFn, style) { pathFn(); ctx.fillStyle = style; ctx.fill(); }
export function stroke(ctx, pathFn, style, width, cap = 'round') {
  pathFn();
  ctx.strokeStyle = style; ctx.lineWidth = width; ctx.lineCap = cap; ctx.lineJoin = 'round';
  ctx.stroke();
}
/** Run `fn` clipped to the path */
export function clip(ctx, pathFn, fn) {
  ctx.save(); pathFn(); ctx.clip(); fn(); ctx.restore();
}
/** Run `fn` in a transformed frame */
export function frame(ctx, { x = 0, y = 0, rot = 0, s = 1, sx = s, sy = s }, fn) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sx, sy); fn(); ctx.restore();
}

// ---------------------------------------------------------------- texture & light

/** Speckle grain over a box (clip first to keep it on a shape) */
export function grain(ctx, x, y, w, h, { seed = 1, n = 400, size = 1.6, light = 0.12, dark = 0.18, tint = null } = {}) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const px = x + r() * w; const py = y + r() * h; const s = size * (0.5 + r());
    const up = r() < 0.45;
    ctx.fillStyle = tint ? rgba(tint, (up ? light : dark) * r())
      : up ? `rgba(255,255,255,${light * r()})` : `rgba(0,0,0,${dark * r()})`;
    ctx.fillRect(px, py, s, s);
  }
}
/** Hairline cracks (carved stone, old bone) */
export function cracks(ctx, x, y, w, h, { seed = 1, n = 4, colour = 'rgba(0,0,0,0.45)', lit = 'rgba(255,255,255,0.12)', len = 18 } = {}) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    let px = x + r() * w; let py = y + r() * h;
    const pts = [[px, py]];
    let a = r() * TAU;
    for (let k = 0; k < 4; k++) {
      a += (r() - 0.5) * 1.6;
      px += Math.cos(a) * len * (0.3 + r() * 0.4); py += Math.sin(a) * len * (0.3 + r() * 0.4);
      pts.push([px, py]);
    }
    for (const [col, dx] of [[lit, 0.9], [colour, 0]]) {
      ctx.beginPath();
      pts.forEach(([qx, qy], j) => (j ? ctx.lineTo(qx + dx, qy + dx) : ctx.moveTo(qx + dx, qy + dx)));
      ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.lineCap = 'round'; ctx.stroke();
    }
  }
}
/** Soft smoke blobs (the logo's nebula) */
export function smoke(ctx, x, y, w, h, { seed = 1, n = 9, colours = ['#1f4a2c', '#173a24'], alpha = 0.5, rMin = 8, rMax = 22 } = {}) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const cx = x + r() * w; const cy = y + r() * h; const rr = rMin + r() * (rMax - rMin);
    const col = colours[i % colours.length];
    ctx.fillStyle = rad(ctx, cx, cy, rr, [[0, rgba(col, alpha)], [1, rgba(col, 0)]]);
    ctx.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
  }
}
/** Tiny stars */
export function specks(ctx, x, y, w, h, { seed = 1, n = 12, colour = '#e8fff0', max = 1.8 } = {}) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = rgba(colour, 0.35 + r() * 0.6);
    circle(ctx, x + r() * w, y + r() * h, 0.5 + r() * max); ctx.fill();
  }
}
/** A four-pointed glint with a soft halo — the logo's gem sparkle */
export function glint(ctx, x, y, r, colour = '#ffffff', halo = 'rgba(255,255,255,0.5)') {
  ctx.save();
  ctx.fillStyle = rad(ctx, x, y, r * 1.1, [[0, halo], [1, 'rgba(255,255,255,0)']]);
  circle(ctx, x, y, r * 1.1); ctx.fill();
  const k = r * 0.2;
  ctx.beginPath();
  ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x + k, y - k, x + r, y);
  ctx.quadraticCurveTo(x + k, y + k, x, y + r); ctx.quadraticCurveTo(x - k, y + k, x - r, y);
  ctx.quadraticCurveTo(x - k, y - k, x, y - r); ctx.closePath();
  ctx.fillStyle = colour; ctx.fill();
  ctx.restore();
}
/**
 * A jagged bolt from (x0, y0) to (x1, y1), as points. `amp` is how far it
 * wanders off the straight line; the ends are exact, so bolts that start and
 * end on the same row tile edge to edge.
 */
export function boltPoints(rand, x0, y0, x1, y1, { steps = 9, amp = 10 } = {}) {
  const pts = [[x0, y0]];
  const dx = x1 - x0; const dy = y1 - y0; const len = Math.hypot(dx, dy);
  const nx = -dy / len; const ny = dx / len;
  for (let i = 1; i < steps; i++) {
    const t = i / steps + (rand() - 0.5) * (0.5 / steps);
    const off = (rand() - 0.5) * 2 * amp * Math.sin(Math.PI * Math.min(1, t * 1.15));
    pts.push([x0 + dx * t + nx * off, y0 + dy * t + ny * off]);
  }
  pts.push([x1, y1]);
  return pts;
}
/**
 * Lightning: stacked strokes (wide and faint → thin and white) rather than a
 * blur, so a bolt that runs off a bar segment's edge glows identically on
 * both sides of the seam.
 */
export function drawBolt(ctx, pts, { glow = '#4f7dff', mid = '#9fc2ff', core = '#ffffff', width = 3, glowAlpha = 0.22 } = {}) {
  const path = () => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); };
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [w, c] of [[width * 5, rgba(glow, glowAlpha)], [width * 3, rgba(glow, glowAlpha * 2)], [width * 1.8, mid], [width * 0.8, core]]) {
    path(); ctx.strokeStyle = c; ctx.lineWidth = w; ctx.stroke();
  }
}
/** A forked bolt: a trunk plus branches off random trunk points */
export function forkedBolt(ctx, rand, x0, y0, x1, y1, opts = {}) {
  const trunk = boltPoints(rand, x0, y0, x1, y1, opts);
  const branches = [];
  const nb = opts.branches ?? 2;
  for (let b = 0; b < nb; b++) {
    const i = 1 + Math.floor(rand() * (trunk.length - 2));
    const [bx, by] = trunk[i];
    const a = Math.atan2(y1 - y0, x1 - x0) + (rand() < 0.5 ? -1 : 1) * (0.5 + rand() * 0.6);
    const L = (opts.branchLen ?? 18) * (0.6 + rand() * 0.6);
    branches.push(boltPoints(rand, bx, by, bx + Math.cos(a) * L, by + Math.sin(a) * L, { steps: 4, amp: (opts.amp ?? 10) * 0.5 }));
  }
  for (const br of branches) drawBolt(ctx, br, { ...opts, width: (opts.width ?? 3) * 0.6 });
  drawBolt(ctx, trunk, opts);
}

// ---------------------------------------------------------------- glyphs

/**
 * Chinese numerals 一 二 三 as raised bars: the rank on a medal. Strokes
 * this simple survive at 44 px; at 22 px the medal's metal carries the rank.
 */
export function chineseNumeral(ctx, n, cx, cy, w, { fillStyle = '#fff', shade = 'rgba(0,0,0,0.5)', light = 'rgba(255,255,255,0.6)', bar = 0.24 } = {}) {
  const h = w * bar;
  const gap = n === 1 ? 0 : n === 2 ? w * 0.42 : w * 0.34;
  const rows = n === 1 ? [0] : n === 2 ? [-gap / 2, gap / 2] : [-gap, 0, gap];
  rows.forEach((dy, i) => {
    // 三's middle stroke is the shortest, 二's top shorter than its base
    const ww = n === 3 ? (i === 1 ? w * 0.72 : i === 0 ? w * 0.84 : w) : n === 2 ? (i === 0 ? w * 0.8 : w) : w;
    const x = cx - ww / 2; const y = cy + dy - h / 2;
    const bar = (ox, oy, c) => { rrect(ctx, x + ox, y + oy, ww, h, h * 0.45); ctx.fillStyle = c; ctx.fill(); };
    bar(1.6, 2, shade);
    bar(-1, -1, light);
    bar(0, 0, fillStyle);
  });
}

// ---------------------------------------------------------------- post-process

/**
 * The silhouette of `src` grown by `radius` (a max filter over its alpha,
 * with a soft edge), filled with `colour`. Low alpha (glass, glow) is
 * boosted first so a translucent part still gets a solid outline.
 */
export function dilate(src, radius, colour, boost = 4) {
  const S = src.width;
  const sctx = src.getContext('2d');
  const a = sctx.getImageData(0, 0, S, S).data;
  const alpha = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) alpha[i] = Math.min(1, (a[i * 4 + 3] / 255) * boost);
  const R = Math.ceil(radius + 1);
  const kernel = [];
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      const d = Math.hypot(dx, dy);
      const w = Math.max(0, Math.min(1, radius + 0.5 - d));
      if (w > 0) kernel.push([dx, dy, w]);
    }
  }
  const out = createCanvas(S, S);
  const octx = out.getContext('2d');
  const img = octx.createImageData(S, S);
  const [cr, cg, cb] = hexRgb(colour);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let m = 0;
      for (const [dx, dy, w] of kernel) {
        const xx = x + dx; const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= S || yy >= S) continue;
        const v = alpha[yy * S + xx] * w;
        if (v > m) { m = v; if (m >= 1) break; }
      }
      const o = (y * S + x) * 4;
      img.data[o] = cr; img.data[o + 1] = cg; img.data[o + 2] = cb; img.data[o + 3] = Math.round(m * 255);
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

/**
 * Body → finished icon: [glow] [halo] [outline] [body].
 *  outline: dark rim colour; width: its weight in art units
 *  halo:    optional pale ring outside the outline (helps on the dark theme)
 *  glow:    optional coloured bloom behind everything
 */
export function finish(body, { outline = '#0a0a0a', width = 5.5, halo = null, haloWidth = 2, glow = null, glowBlur = 8, glowAlpha = 0.85 } = {}) {
  const S = body.width;
  const out = createCanvas(S, S);
  const ctx = out.getContext('2d');
  const rim = dilate(body, width, outline);
  if (glow) {
    const g = dilate(body, width * 0.6, glow);
    ctx.save();
    ctx.globalAlpha = glowAlpha;
    ctx.filter = `blur(${glowBlur}px)`;
    ctx.drawImage(g, 0, 0);
    ctx.restore();
  }
  if (halo) ctx.drawImage(dilate(body, width + haloWidth, halo, 6), 0, 0);
  ctx.drawImage(rim, 0, 0);
  ctx.drawImage(body, 0, 0);
  return out;
}

// ---------------------------------------------------------------- styles

const BAR_PARTS = ['l', 'm', 'r'];
const BAR_FILLS = ['g', 'o', 'y', 'b', 'p', 's', 'e'];

/**
 * A style: painters keyed by kit code, each drawing on the 128 grid.
 * A painter may carry `post` (finish() options merged over the style's).
 * The 21 bar codes are generated from `bar(part, fill, ctx)`.
 *
 * Returns { id, name, codes, render(code) → finished 128 px canvas }.
 */
export function createStyle({ id, name, post = {}, barPost = null, bar, icons }) {
  const painters = { ...icons };
  if (bar) {
    for (const f of BAR_FILLS) {
      for (const p of BAR_PARTS) {
        const fn = (ctx) => bar(p, f, ctx);
        fn.post = barPost;
        painters[`b${f}${p}`] = fn;
      }
    }
  }
  const cache = new Map();
  function render(code) {
    if (cache.has(code)) return cache.get(code);
    const p = painters[code];
    if (!p) throw new Error(`${id}: no painter for "${code}"`);
    const body = createCanvas(U, U);
    const bctx = body.getContext('2d');
    bctx.lineJoin = 'round'; bctx.lineCap = 'round';
    p(bctx);
    const opts = p.post === false ? null : { ...post, ...(p.post || {}) };
    const out = opts ? finish(body, opts) : body;
    cache.set(code, out);
    return out;
  }
  return { id, name, codes: Object.keys(painters), render };
}

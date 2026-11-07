/**
 * The emoji kit's art — Egg Shen's Magic: the logo's house style carried
 * into every kit code. Carved dark stone with pale bevelled edges (the logo's
 * ring), diamond studs with jade gems that glint, crackling blue lightning,
 * green-black nebula smoke, red cord, old gold; and, for the nights row, red
 * paper lanterns.
 *
 * scripts/build-emojis.js renders every code here to a 128×128 PNG. Each
 * painter draws one subject on the 128-unit grid; finish() (common.js) then
 * gives it the same dark outline as every other icon. Light comes from the
 * top-left. The bar is 22 px tall on a phone, so the silhouette and two or
 * three colours carry each icon; the detail is for 44 px screens.
 *
 * Bars are a carved stone channel that fills with crackling energy (empty:
 * a dark groove); the end caps carry a logo stud whose gem lights when that
 * end is full. Ticks: a jade stud lit (done) or dark (not yet). Nights are
 * paper lanterns: lit red (played), lit with Egg Shen's blue-white spirit
 * fire (saved by a night light — the Night Light item is that lantern),
 * unlit (missed), half-lit (tonight).
 *
 * Everything random is seeded (rng/grain/smoke take a seed), so a rebuild
 * writes byte-identical PNGs and the hashes — and so the uploads — only
 * change when a drawing does.
 */
import { createCanvas } from '@napi-rs/canvas';
import {
  createStyle, lin, rad, metal, circle, ellipse, rrect, poly, diamond, fill, stroke, clip, frame,
  grain, cracks, smoke, specks, glint, rng, rgba, mix, drawBolt, boltPoints, forkedBolt, chineseNumeral, TAU,
} from './common.js';
import {
  bevel, flamePath, cupBowlPath, cupHandlePath, gourdPath, lanternBodyPath, garlicPath,
  cleaverBladePath, cleaverHandlePath, capsulePath, bulletTipPath, ribbonPath, dropPath, wispPath,
} from './shapes.js';

const OUT = '#070808';
const STONE = ['#b9b8aa', '#7b7a70', '#4c4c46', '#2d2d29', '#151513'];
const PALE = 'rgba(222,220,204,0.9)'; // the logo ring's pale bevel
const JADE = { hi: '#d2ffdc', lit: '#6af293', mid: '#26b654', dark: '#0d6a2d' };
const AMBER = { hi: '#fff3c9', lit: '#ffc64d', mid: '#e48c1a', dark: '#9a4f08' };
const DEAD = { hi: '#56645c', lit: '#3a4640', mid: '#2a3430', dark: '#161d1a' };
const BOLT = { glow: '#3d6bff', mid: '#a8c6ff', core: '#ffffff' };
const GOLD = ['#fff5c8', '#f8d35e', '#d89c1e', '#93600b', '#4c3005'];
const SILVER = ['#ffffff', '#e2e7ec', '#a5b0b9', '#69737d', '#343a41'];
const BRONZE = ['#ffdcbc', '#e59c5e', '#b8682c', '#7a3f15', '#3c1d07'];
const COPPER = ['#ffcfae', '#de8656', '#b0592d', '#733117', '#3a1709'];
const RED = ['#ff8d7c', '#e2343a', '#b0141e', '#6e0910', '#3a0408'];
const IVORY = ['#fffdf4', '#f3ead2', '#d9cba6', '#a8956c', '#64553a'];
const IRON = ['#c9d0d6', '#8a939b', '#5a6168', '#33383d', '#16191c'];
const WOOD = ['#c48a52', '#8e5a2c', '#5e3716', '#3a200a'];

/** Bar energy per kit colour: jade for green, gold for the leader, the logo's blue, … */
const ENERGY = {
  g: { dark: '#0a6a2c', mid: '#2ad064', light: '#a8ffc2', core: '#f2fff5', gem: JADE },
  y: { dark: '#985f00', mid: '#f0b21c', light: '#ffe592', core: '#fffbe8', gem: AMBER },
  o: { dark: '#9e3a00', mid: '#ff7a1a', light: '#ffc08a', core: '#fff3e8', gem: AMBER },
  b: { dark: '#1a34c8', mid: '#3f7bff', light: '#b0ccff', core: '#ffffff', gem: { hi: '#e6f0ff', lit: '#8fb4ff', mid: '#3f6dff', dark: '#1a2c9a' } },
  p: { dark: '#5a1fb0', mid: '#a45cff', light: '#e0c2ff', core: '#fbf5ff', gem: { hi: '#f1e2ff', lit: '#c792ff', mid: '#8a3ff0', dark: '#4a168f' } },
  s: { dark: '#4a4f55', mid: '#8a9198', light: '#c9ced3', core: '#f2f4f6', gem: DEAD },
};

/** Paper lanterns: [core, inner, paper, edge] */
const LANTERN = {
  red: ['#fff4c4', '#ffb347', '#ee3a2a', '#8a0c12'],
  spirit: ['#f4ffff', '#9ff4ff', '#22b4e0', '#0b3f78'],
  dark: ['#5e3a3e', '#47262b', '#2e1418', '#170a0c'],
};

// ---------------------------------------------------------------- materials

/** Carved stone: gradient, grit, a crack or two, pale top-left bevel */
function stone(ctx, pathFn, box, seed, { cracked = true, bev = 3.2 } = {}) {
  const [x0, y0, x1, y1] = box;
  fill(ctx, pathFn, lin(ctx, x0, y0, x1, y1, [[0, STONE[1]], [0.4, STONE[2]], [1, STONE[4]]]));
  clip(ctx, pathFn, () => {
    grain(ctx, x0, y0, x1 - x0, y1 - y0, { seed, n: Math.round((x1 - x0) * (y1 - y0) / 12), size: 1.8, light: 0.16, dark: 0.32 });
    if (cracked) cracks(ctx, x0, y0, x1 - x0, y1 - y0, { seed: seed + 7, n: 2, len: 12 });
  });
  bevel(ctx, pathFn, bev, PALE, 'rgba(0,0,0,0.65)', box);
}

/** A faceted diamond gem (the logo's studs), lit or dead */
function gem(ctx, cx, cy, r, G, lit, { glintR = r * 0.7 } = {}) {
  const P = [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]];
  const tri = (a, b, col) => { poly(ctx, [[cx, cy], a, b]); ctx.fillStyle = col; ctx.fill(); };
  tri(P[3], P[0], G.hi); tri(P[0], P[1], G.lit); tri(P[1], P[2], G.dark); tri(P[2], P[3], G.mid);
  // the table: a smaller lit diamond in the middle
  diamond(ctx, cx, cy, r * 0.42);
  ctx.fillStyle = lin(ctx, cx - r * 0.4, cy - r * 0.4, cx + r * 0.4, cy + r * 0.4, [[0, G.hi], [1, G.mid]]);
  ctx.fill();
  if (lit) {
    ctx.fillStyle = rad(ctx, cx, cy, r, [[0, 'rgba(255,255,255,0.55)'], [0.5, 'rgba(255,255,255,0.08)'], [1, 'rgba(255,255,255,0)']]);
    diamond(ctx, cx, cy, r); ctx.fill();
    if (glintR > 0) glint(ctx, cx - r * 0.12, cy - r * 0.12, glintR, '#ffffff', 'rgba(255,255,255,0.55)');
  }
}

/** A gem in its dark setting (a stud's gem without the stone pyramid) */
function setGem(ctx, cx, cy, r, G = JADE, lit = true, opts = {}) {
  diamond(ctx, cx, cy, r + Math.max(2, r / 5)); ctx.fillStyle = '#0b0c0b'; ctx.fill();
  gem(ctx, cx, cy, r, G, lit, opts);
}

/** A carved pyramid stud with a gem in the middle — the logo's ring studs */
function stud(ctx, cx, cy, R, r, G, lit, seed = 3) {
  const P = [[cx, cy - R], [cx + R, cy], [cx, cy + R], [cx - R, cy]];
  const I = [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]];
  const facet = (a, b, c, d, col) => { poly(ctx, [a, b, c, d]); ctx.fillStyle = col; ctx.fill(); };
  facet(P[3], P[0], I[0], I[3], STONE[1]);
  facet(P[0], P[1], I[1], I[0], STONE[2]);
  facet(P[1], P[2], I[2], I[1], STONE[4]);
  facet(P[2], P[3], I[3], I[2], STONE[3]);
  clip(ctx, () => diamond(ctx, cx, cy, R), () => grain(ctx, cx - R, cy - R, R * 2, R * 2, { seed, n: R * R * 0.9, size: 1.6, light: 0.16, dark: 0.3 }));
  // ridges between the facets catch the light
  ctx.lineWidth = Math.max(1.2, R / 26);
  for (let i = 0; i < 4; i++) {
    ctx.beginPath(); ctx.moveTo(...P[i]); ctx.lineTo(...I[i]);
    ctx.strokeStyle = i === 0 || i === 3 ? 'rgba(230,228,210,0.7)' : 'rgba(0,0,0,0.5)'; ctx.stroke();
  }
  bevel(ctx, () => diamond(ctx, cx, cy, R), Math.max(2, R / 18), PALE, 'rgba(0,0,0,0.6)', [cx - R, cy - R, cx + R, cy + R]);
  // the gem's light spills onto the stone
  if (lit) {
    ctx.fillStyle = rad(ctx, cx, cy, R * 0.95, [[0, rgba(G.lit, 0.55)], [0.6, rgba(G.lit, 0.18)], [1, rgba(G.lit, 0)]]);
    diamond(ctx, cx, cy, R); ctx.fill();
  }
  // dark setting around the gem, then the gem
  diamond(ctx, cx, cy, r + Math.max(2, R / 20)); ctx.fillStyle = '#0b0c0b'; ctx.fill();
  gem(ctx, cx, cy, r, G, lit);
}

/** Red cord: a stroked path with a dark core shadow and a lit top edge */
function cord(ctx, pathFn, w = 8) {
  stroke(ctx, pathFn, RED[3], w);
  stroke(ctx, pathFn, RED[2], w * 0.72);
  ctx.save(); ctx.translate(-w * 0.12, -w * 0.12);
  stroke(ctx, pathFn, rgba(RED[0], 0.8), w * 0.25);
  ctx.restore();
}

/** A red tassel hanging from (x, y): a gold bead and a fan of threads */
function tassel(ctx, x, y, len = 16, lit = true) {
  const threads = lit ? [RED[1], RED[2]] : ['#5a2a30', '#3a1a1e'];
  for (let i = -2; i <= 2; i++) {
    ctx.strokeStyle = threads[Math.abs(i) % 2]; ctx.lineWidth = 3.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x + i * 1.8, y + 6); ctx.lineTo(x + i * 3.2, y + 6 + len); ctx.stroke();
  }
  rrect(ctx, x - 5.5, y, 11, 8, 3);
  ctx.fillStyle = lit ? metal(ctx, GOLD, x - 6, y, x + 6, y + 8) : metal(ctx, ['#a08860', '#7a6440', '#5a4628', '#3a2c16', '#1e160a'], x - 6, y, x + 6, y + 8);
  ctx.fill();
}

/** Glass: a pale inner rim and a highlight arc so dark glass reads on dark */
function glassRim(ctx, pathFn, w = 3) {
  clip(ctx, pathFn, () => stroke(ctx, pathFn, 'rgba(200,230,255,0.45)', w * 2));
}

/** A solid four-pointed star (a glint that stands alone, so it gets an outline) */
function sparkle(ctx, x, y, r, colour = '#ffffff', core = null) {
  const k = r * 0.24;
  ctx.beginPath();
  ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x + k, y - k, x + r, y);
  ctx.quadraticCurveTo(x + k, y + k, x, y + r); ctx.quadraticCurveTo(x - k, y + k, x - r, y);
  ctx.quadraticCurveTo(x - k, y - k, x, y - r); ctx.closePath();
  ctx.fillStyle = colour; ctx.fill();
  if (core) { circle(ctx, x, y, r * 0.22); ctx.fillStyle = core; ctx.fill(); }
}

/** Paint on a scratch canvas, cut a shape out of it, lay the result down */
function cutout(ctx, paint, cut) {
  const c = createCanvas(128, 128);
  const k = c.getContext('2d');
  k.lineJoin = 'round'; k.lineCap = 'round';
  paint(k);
  k.globalCompositeOperation = 'destination-out';
  cut(k); k.fillStyle = '#000'; k.fill();
  ctx.drawImage(c, 0, 0);
}

// ---------------------------------------------------------------- bars

const T = 20; const B = 108; const GT = 36; const GB = 92;
/** Seam rule: everything on the joining sides is a vertical gradient (no x
 *  variation), and bolts cross each segment edge at fixed rows. */
function bar(p, f, ctx) {
  const x0 = p === 'l' ? 30 : -6;
  const x1 = p === 'r' ? 98 : 134;
  const w = x1 - x0;
  const E = f === 'e' ? null : ENERGY[f];
  // stone rails (one block, the groove cut into it)
  ctx.fillStyle = lin(ctx, 0, T, 0, B, [[0, STONE[1]], [0.1, STONE[2]], [0.21, STONE[3]], [0.78, STONE[3]], [0.86, STONE[2]], [1, STONE[4]]]);
  ctx.fillRect(x0, T, w, B - T);
  clip(ctx, () => { ctx.beginPath(); ctx.rect(x0, T, w, B - T); }, () => {
    grain(ctx, x0, T, w, B - T, { seed: 11 + p.charCodeAt(0), n: 900, size: 1.8, light: 0.16, dark: 0.32 });
  });
  ctx.fillStyle = PALE; ctx.fillRect(x0, T, w, 3.5);
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x0, B - 3, w, 3);
  // the groove
  if (!E) {
    ctx.fillStyle = lin(ctx, 0, GT, 0, GB, [[0, '#010202'], [0.55, '#06100a'], [1, '#0d1c13']]);
    ctx.fillRect(x0, GT, w, GB - GT);
    // Faint smoke ribbons. Every middle segment is the same image, so any
    // blob or speck repeats every 22 px and the bar looks stamped; a wave
    // whose period is exactly one segment (128 units) runs on unbroken
    // through every seam and reads as one ribbon.
    clip(ctx, () => { ctx.beginPath(); ctx.rect(x0, GT, w, GB - GT); }, () => {
      for (const [phase, amp, mid, width, alpha, col] of [[0, 4, 62, 12, 0.15, '#2c7a48'], [2.4, 3, 70, 6, 0.09, '#2f5a8a']]) {
        ctx.beginPath();
        for (let x = x0; x <= x1; x += 2) {
          const y = mid + amp * Math.sin((x / 128) * TAU + phase);
          x === x0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.strokeStyle = rgba(col, alpha); ctx.lineWidth = width; ctx.stroke();
      }
    });
  } else {
    ctx.fillStyle = lin(ctx, 0, GT, 0, GB, [[0, E.dark], [0.28, E.mid], [0.5, E.light], [0.72, E.mid], [1, E.dark]]);
    ctx.fillRect(x0, GT, w, GB - GT);
    clip(ctx, () => { ctx.beginPath(); ctx.rect(x0, GT, w, GB - GT); }, () => {
      const r = rng(p === 'm' ? 21 : p === 'l' ? 22 : 23);
      const a = p === 'l' ? 46 : 0; const b = p === 'r' ? 82 : 128;
      // one main bolt and a fainter one; both cross the segment edges on fixed rows
      for (const [row, amp, width, steps] of [[70, 9, 1.4, 7], [62, 15, 2.6, 5]]) {
        const pts = boltPoints(r, a, row, b, row, { steps, amp });
        if (p !== 'l') pts.unshift([-8, row]);
        if (p !== 'r') pts.push([136, row]);
        drawBolt(ctx, pts, { glow: E.dark, mid: E.light, core: E.core, width, glowAlpha: 0.25 });
      }
    });
  }
  ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(x0, GT - 2, w, 4);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x0, GT + 2, w, 3);
  ctx.fillStyle = 'rgba(214,212,196,0.6)'; ctx.fillRect(x0, GB, w, 2.5);
  if (p === 'l') cap(ctx, 8, E);
  if (p === 'r') cap(ctx, 82, E);
}
function cap(ctx, x, E) {
  const path = () => rrect(ctx, x, 10, 38, 108, 10);
  stone(ctx, path, [x, 10, x + 38, 118], 31 + x, { cracked: false });
  stud(ctx, x + 19, 64, 18, 10, E ? E.gem : DEAD, !!E, 40 + x);
}

// ---------------------------------------------------------------- ticks

/** Done / not yet: a logo stud, its jade gem lit or dark */
function studTick(lit) {
  const fn = (ctx) => stud(ctx, 64, 64, 58, 34, lit ? JADE : DEAD, lit);
  fn.post = lit ? { glow: JADE.lit, glowBlur: 6, glowAlpha: 0.6 } : {};
  return fn;
}

/**
 * A paper lantern, (cx, cy) the middle of the body. Unlit paper is nearly
 * black, so it keeps the stone's pale bevel and dim gold caps — without
 * them a missed night vanishes on the dark theme.
 */
function lantern(ctx, cx, cy, rx, ry, L, lit, { hanger = true, tail = true } = {}) {
  if (hanger) stroke(ctx, () => { ctx.beginPath(); ctx.moveTo(cx, cy - ry - 16); ctx.lineTo(cx, cy - ry); }, IRON[3], 4);
  if (tail) tassel(ctx, cx, cy + ry + 2, 14, lit);
  const body = () => lanternBodyPath(ctx, cx, cy, rx, ry);
  fill(ctx, body, rad(ctx, cx - rx * 0.12, cy - ry * 0.08, rx * 1.25, [[0, L[0]], [0.3, L[1]], [0.68, L[2]], [1, L[3]]]));
  clip(ctx, body, () => {
    ctx.strokeStyle = lit ? rgba(L[3], 0.45) : 'rgba(0,0,0,0.45)'; ctx.lineWidth = 2.6;
    for (const k of [-0.72, -0.36, 0, 0.36, 0.72]) {
      ctx.beginPath(); ctx.moveTo(cx + k * rx * 0.62, cy - ry); ctx.bezierCurveTo(cx + k * rx * 1.4, cy - ry * 0.4, cx + k * rx * 1.4, cy + ry * 0.4, cx + k * rx * 0.62, cy + ry); ctx.stroke();
    }
    if (!lit) { ctx.fillStyle = 'rgba(255,215,215,0.14)'; ellipse(ctx, cx - rx * 0.45, cy - ry * 0.3, rx * 0.2, ry * 0.42); ctx.fill(); }
  });
  bevel(ctx, body, 3, lit ? rgba(L[0], 0.55) : 'rgba(222,220,204,0.5)', 'rgba(0,0,0,0.45)', [cx - rx, cy - ry, cx + rx, cy + ry]);
  for (const yy of [cy - ry - 5, cy + ry - 6]) {
    const c = () => rrect(ctx, cx - rx * 0.6, yy, rx * 1.2, 11, 3);
    fill(ctx, c, lit ? metal(ctx, GOLD, cx - rx * 0.6, yy, cx + rx * 0.6, yy + 11) : metal(ctx, ['#b8a070', '#8a7448', '#64522e', '#40331a', '#201a0c'], cx - rx * 0.6, yy, cx + rx * 0.6, yy + 11));
    bevel(ctx, c, 1.5, 'rgba(255,255,255,0.7)', 'rgba(0,0,0,0.5)', [cx - rx * 0.6, yy, cx + rx * 0.6, yy + 11]);
  }
}
function lanternTick(state) {
  const fn = (ctx) => {
    if (state === 'half') {
      lantern(ctx, 64, 60, 44, 44, LANTERN.dark, false);
      clip(ctx, () => { ctx.beginPath(); ctx.rect(0, 0, 64, 128); }, () => lantern(ctx, 64, 60, 44, 44, LANTERN.red, true, { hanger: false, tail: false }));
      return;
    }
    lantern(ctx, 64, 60, 44, 44, LANTERN[state], state !== 'dark');
  };
  fn.post = state === 'red' ? { glow: '#ff7a2a', glowBlur: 6, glowAlpha: 0.55 }
    : state === 'spirit' ? { glow: '#3fc8ff', glowBlur: 6, glowAlpha: 0.7 } : {};
  return fn;
}

// ---------------------------------------------------------------- ranks & stats

function medal(ramp, n) {
  return (ctx) => {
    cord(ctx, () => { ctx.beginPath(); ctx.moveTo(30, 4); ctx.lineTo(60, 44); }, 9);
    cord(ctx, () => { ctx.beginPath(); ctx.moveTo(98, 4); ctx.lineTo(68, 44); }, 9);
    // the knot
    diamond(ctx, 64, 42, 11); ctx.fillStyle = RED[2]; ctx.fill();
    ctx.strokeStyle = RED[0]; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(58, 38); ctx.lineTo(68, 48); ctx.moveTo(60, 36); ctx.lineTo(70, 46); ctx.stroke();
    // the medallion
    const disc = () => circle(ctx, 64, 84, 39);
    fill(ctx, disc, metal(ctx, ramp, 30, 50, 100, 120));
    circle(ctx, 64, 84, 30); ctx.fillStyle = lin(ctx, 40, 60, 90, 110, [[0, ramp[3]], [0.5, ramp[2]], [1, ramp[1]]]); ctx.fill();
    circle(ctx, 64, 84, 28); ctx.fillStyle = lin(ctx, 40, 60, 90, 110, [[0, ramp[1]], [0.6, ramp[2]], [1, ramp[3]]]); ctx.fill();
    clip(ctx, disc, () => grain(ctx, 26, 46, 76, 76, { seed: 3 + n, n: 260, light: 0.12, dark: 0.18 }));
    bevel(ctx, disc, 3, 'rgba(255,255,255,0.75)', 'rgba(0,0,0,0.55)', [26, 46, 102, 122]);
    chineseNumeral(ctx, n, 64, 84, 32, { fillStyle: ramp[0], shade: rgba(ramp[4], 0.9), light: 'rgba(255,255,255,0.5)', bar: 0.26 });
    glint(ctx, 44, 62, 9);
  };
}

function trophy(ctx) {
  // carved stone plinth
  stone(ctx, () => rrect(ctx, 30, 96, 68, 22, 5), [30, 96, 98, 118], 61, { cracked: false });
  // stem and foot in gold
  ctx.fillStyle = metal(ctx, GOLD, 52, 70, 76, 98);
  rrect(ctx, 57, 66, 14, 20, 3); ctx.fill();
  rrect(ctx, 44, 84, 40, 13, 4); ctx.fill();
  // handles, then the bowl
  for (const side of [-1, 1]) {
    stroke(ctx, () => cupHandlePath(ctx, 64, 14, 70, 54, side), GOLD[3], 11);
    stroke(ctx, () => cupHandlePath(ctx, 64, 14, 70, 54, side), GOLD[1], 6);
  }
  const bowl = () => cupBowlPath(ctx, 64, 14, 70, 56);
  fill(ctx, bowl, lin(ctx, 29, 0, 99, 0, [[0, GOLD[0]], [0.3, GOLD[1]], [0.65, GOLD[2]], [1, GOLD[4]]]));
  bevel(ctx, bowl, 3, 'rgba(255,255,255,0.8)', 'rgba(60,30,0,0.6)', [29, 14, 99, 70]);
  // rim band and a jade stud on the bowl
  ctx.fillStyle = GOLD[3]; ctx.fillRect(30, 14, 68, 6);
  ctx.fillStyle = GOLD[0]; ctx.fillRect(30, 14, 68, 2.5);
  setGem(ctx, 64, 40, 11, JADE, true, { glintR: 9 });
  // gloss streak
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath(); ctx.moveTo(38, 24); ctx.quadraticCurveTo(38, 46, 50, 60); ctx.quadraticCurveTo(42, 44, 43, 24); ctx.closePath(); ctx.fill();
}

/** Gold crown of a Chinatown emperor: five points with pearls, a jade gem front */
function crown(ctx) {
  const tips = [[12, 34], [38, 26], [64, 12], [90, 26], [116, 34]];
  const shape = () => {
    ctx.beginPath();
    ctx.moveTo(22, 108);
    ctx.lineTo(12, 34);
    ctx.lineTo(32, 64);
    ctx.lineTo(38, 26);
    ctx.lineTo(52, 58);
    ctx.lineTo(64, 12);
    ctx.lineTo(76, 58);
    ctx.lineTo(90, 26);
    ctx.lineTo(96, 64);
    ctx.lineTo(116, 34);
    ctx.lineTo(106, 108);
    ctx.closePath();
  };
  fill(ctx, shape, lin(ctx, 12, 12, 116, 108, [[0, GOLD[0]], [0.25, GOLD[1]], [0.55, GOLD[2]], [0.62, GOLD[1]], [1, GOLD[3]]]));
  clip(ctx, shape, () => {
    grain(ctx, 10, 10, 108, 100, { seed: 14, n: 300, light: 0.12, dark: 0.14 });
    // the points' facets: the right half of each point in shade
    ctx.fillStyle = 'rgba(120,70,0,0.28)';
    for (const [x, y] of tips) { poly(ctx, [[x, y], [x + 14, y + 40], [x, y + 46]]); ctx.fill(); }
  });
  bevel(ctx, shape, 3, 'rgba(255,255,255,0.85)', 'rgba(70,35,0,0.6)', [12, 12, 116, 108]);
  // the band: darker gold, a red gem either side of a jade one
  const band = () => { ctx.beginPath(); ctx.moveTo(19, 80); ctx.quadraticCurveTo(64, 72, 109, 80); ctx.lineTo(106, 108); ctx.lineTo(22, 108); ctx.closePath(); };
  fill(ctx, band, lin(ctx, 0, 76, 0, 108, [[0, GOLD[2]], [0.5, GOLD[3]], [1, GOLD[4]]]));
  stroke(ctx, () => { ctx.beginPath(); ctx.moveTo(19, 80); ctx.quadraticCurveTo(64, 72, 109, 80); }, GOLD[0], 3);
  for (const x of [36, 92]) {
    ellipse(ctx, x, 93, 7, 8); ctx.fillStyle = RED[3]; ctx.fill();
    ellipse(ctx, x, 92, 5.5, 6.5); ctx.fillStyle = lin(ctx, x - 5, 86, x + 5, 98, [[0, RED[0]], [0.5, RED[1]], [1, RED[3]]]); ctx.fill();
  }
  setGem(ctx, 64, 92, 12, JADE, true, { glintR: 8 });
  // pearls on the points
  for (const [x, y] of tips) {
    circle(ctx, x, y, 7.5); ctx.fillStyle = rad(ctx, x - 2, y - 2, 9, [[0, '#ffffff'], [0.5, IVORY[1]], [1, IVORY[3]]]); ctx.fill();
  }
  glint(ctx, 30, 50, 9);
}

/** A Chinese cash coin: round, square hole, four raised characters */
function cashCoin(ctx, cx, cy, r, ramp, seed = 1) {
  const disc = () => circle(ctx, cx, cy, r);
  fill(ctx, disc, metal(ctx, ramp, cx - r, cy - r, cx + r, cy + r));
  // sunken field inside the raised rim
  circle(ctx, cx, cy, r * 0.8);
  ctx.fillStyle = lin(ctx, cx - r, cy - r, cx + r, cy + r, [[0, ramp[3]], [0.55, ramp[2]], [1, ramp[1]]]); ctx.fill();
  circle(ctx, cx, cy, r * 0.76);
  ctx.fillStyle = lin(ctx, cx - r, cy - r, cx + r, cy + r, [[0, ramp[1]], [0.6, ramp[2]], [1, ramp[3]]]); ctx.fill();
  clip(ctx, disc, () => grain(ctx, cx - r, cy - r, r * 2, r * 2, { seed, n: r * r * 0.25, light: 0.14, dark: 0.22 }));
  // the square hole with its raised border
  const h = r * 0.27;
  const b = Math.max(2.5, r * 0.09);
  rrect(ctx, cx - h - b, cy - h - b, (h + b) * 2, (h + b) * 2, 2);
  ctx.fillStyle = lin(ctx, cx - h, cy - h, cx + h, cy + h, [[0, ramp[0]], [1, ramp[3]]]); ctx.fill();
  ctx.fillStyle = '#0b0906'; ctx.fillRect(cx - h, cy - h, h * 2, h * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(cx - h, cy + h - 3, h * 2, 3);
  // four characters as raised strokes: top, right, bottom, left
  if (r >= 30) {
    const d = r * 0.53; const s = r * 0.16;
    const glyphs = [
      [[-s, -s * 0.6, s, -s * 0.6], [0, -s, 0, s], [-s, s * 0.5, s, s * 0.5]],
      [[-s * 0.8, -s, -s * 0.8, s], [-s * 0.8, 0, s, 0], [s * 0.4, -s, s * 0.4, s]],
      [[-s, -s * 0.2, s, -s * 0.2], [-s * 0.6, s, s * 0.6, s], [0, -s, 0, s * 0.4]],
      [[-s, -s, s, -s], [-s * 0.4, -s, -s * 0.4, s], [s * 0.5, 0, s * 0.5, s]],
    ];
    [[0, -d], [d, 0], [0, d], [-d, 0]].forEach(([ox, oy], i) => {
      for (const [ax, ay, bx, by] of glyphs[i]) {
        for (const [dx, col, wd] of [[1.2, rgba(ramp[4], 0.8), 4.4], [-0.6, rgba('#ffffff', 0.5), 4], [0, ramp[1], 3.6]]) {
          ctx.beginPath(); ctx.moveTo(cx + ox + ax + dx, cy + oy + ay + dx); ctx.lineTo(cx + ox + bx + dx, cy + oy + by + dx);
          ctx.strokeStyle = col; ctx.lineWidth = wd; ctx.lineCap = 'round'; ctx.stroke();
        }
      }
    });
  }
  bevel(ctx, disc, 3, 'rgba(255,255,255,0.8)', 'rgba(0,0,0,0.55)', [cx - r, cy - r, cx + r, cy + r]);
}

function coin(ctx) {
  cashCoin(ctx, 64, 64, 54, GOLD, 4);
  glint(ctx, 34, 30, 12);
}

/** Blue spirit fire */
function flame(ctx) {
  const outer = () => flamePath(ctx, 64, 118, 92, 112);
  fill(ctx, outer, rad(ctx, 64, 92, 90, [[0, '#cfe0ff'], [0.35, '#5f8dff'], [0.75, '#2a3fd8'], [1, '#141f8a']], 60, 104, 4));
  clip(ctx, outer, () => smoke(ctx, 20, 70, 88, 50, { seed: 4, n: 5, colours: ['#0d2a7a'], alpha: 0.45 }));
  fill(ctx, () => flamePath(ctx, 64, 116, 60, 76), rad(ctx, 64, 100, 60, [[0, '#ffffff'], [0.45, '#bcd4ff'], [1, '#6f97ff']]));
  fill(ctx, () => flamePath(ctx, 64, 114, 30, 40), '#ffffff');
}
flame.post = { glow: '#3d6bff', glowBlur: 7, glowAlpha: 0.75 };

/** Nights: a crescent moon, its shadow side starred */
function moon(ctx) {
  cutout(ctx, (k) => {
    const disc = () => circle(k, 58, 68, 54);
    fill(k, disc, rad(k, 34, 52, 92, [[0, '#fffbe2'], [0.4, '#f8e092'], [0.75, '#dcae4a'], [1, '#93621a']]));
    clip(k, disc, () => {
      grain(k, 4, 14, 108, 108, { seed: 23, n: 700, light: 0.12, dark: 0.16 });
      // craters: a shaded bowl with a lit lower-right lip
      for (const [x, y, r] of [[30, 84, 9], [50, 104, 6], [22, 58, 5], [44, 70, 4]]) {
        circle(k, x + 1, y + 1, r); k.fillStyle = 'rgba(255,250,220,0.5)'; k.fill();
        circle(k, x, y, r); k.fillStyle = 'rgba(150,100,20,0.45)'; k.fill();
      }
    });
    bevel(k, disc, 3, 'rgba(255,255,255,0.85)', 'rgba(90,50,0,0.55)', [4, 14, 112, 122]);
  }, (k) => circle(k, 90, 46, 46));
  // stars in the hollow, jade and white
  sparkle(ctx, 96, 76, 12, '#ffffff', JADE.lit);
  sparkle(ctx, 112, 104, 7, '#d2ffdc');
}
moon.post = { glow: '#ffe08a', glowBlur: 6, glowAlpha: 0.45 };

/** A heater shield's outline */
function shieldPath(ctx, cx, top, w, h) {
  const hw = w / 2;
  ctx.beginPath();
  ctx.moveTo(cx, top);
  ctx.quadraticCurveTo(cx + hw * 0.55, top + h * 0.1, cx + hw, top + h * 0.07);
  ctx.lineTo(cx + hw, top + h * 0.42);
  ctx.bezierCurveTo(cx + hw, top + h * 0.72, cx + hw * 0.5, top + h * 0.88, cx, top + h);
  ctx.bezierCurveTo(cx - hw * 0.5, top + h * 0.88, cx - hw, top + h * 0.72, cx - hw, top + h * 0.42);
  ctx.lineTo(cx - hw, top + h * 0.07);
  ctx.quadraticCurveTo(cx - hw * 0.55, top + h * 0.1, cx, top);
  ctx.closePath();
}

/** Shield: a carved stone ward in a bronze rim, the logo's jade stud at its heart */
function shield(ctx) {
  const outer = () => shieldPath(ctx, 64, 6, 104, 116);
  const inner = () => shieldPath(ctx, 64, 17, 82, 94);
  fill(ctx, outer, metal(ctx, BRONZE, 12, 6, 116, 122));
  clip(ctx, outer, () => grain(ctx, 10, 4, 108, 120, { seed: 31, n: 500, light: 0.12, dark: 0.2 }));
  bevel(ctx, outer, 3, 'rgba(255,240,220,0.85)', 'rgba(0,0,0,0.55)', [12, 6, 116, 122]);
  stone(ctx, inner, [23, 17, 105, 111], 81, { cracked: true });
  // a carved centre line, lit on its left edge
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(62, 20, 4, 86);
  ctx.fillStyle = 'rgba(230,228,210,0.35)'; ctx.fillRect(60.5, 20, 1.5, 86);
  // rivets on the rim
  for (const [x, y] of [[24, 18], [104, 18], [20, 62], [108, 62], [64, 112]]) {
    circle(ctx, x, y, 3.6); ctx.fillStyle = rad(ctx, x - 1, y - 1, 4.5, [[0, BRONZE[0]], [1, BRONZE[3]]]); ctx.fill();
  }
  stud(ctx, 64, 58, 30, 16, JADE, true, 5);
}
shield.post = { glow: JADE.lit, glowBlur: 5, glowAlpha: 0.25 };

/** Time: the logo's ring as a clock — stone, four jade studs, an ivory face */
function clock(ctx) {
  const ring = () => circle(ctx, 64, 64, 57);
  stone(ctx, ring, [7, 7, 121, 121], 91, { cracked: true });
  circle(ctx, 64, 64, 41); ctx.fillStyle = '#0b0c0b'; ctx.fill();
  const face = () => circle(ctx, 64, 64, 38);
  fill(ctx, face, rad(ctx, 52, 50, 54, [[0, IVORY[0]], [0.55, IVORY[1]], [1, IVORY[2]]]));
  clip(ctx, face, () => {
    stroke(ctx, face, 'rgba(60,40,10,0.28)', 10);
    grain(ctx, 26, 26, 76, 76, { seed: 5, n: 260, light: 0.08, dark: 0.1 });
  });
  // hour marks: bold at the quarters
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU; const q = i % 3 === 0;
    const r0 = q ? 26 : 29; const r1 = 34;
    ctx.beginPath(); ctx.moveTo(64 + Math.sin(a) * r0, 64 - Math.cos(a) * r0); ctx.lineTo(64 + Math.sin(a) * r1, 64 - Math.cos(a) * r1);
    ctx.strokeStyle = q ? '#2a1a08' : 'rgba(60,40,10,0.6)'; ctx.lineWidth = q ? 4.5 : 2.5; ctx.lineCap = 'round'; ctx.stroke();
  }
  // hands at ten past ten, iron with a lit edge
  const hand = (deg, len, w) => {
    const a = (deg / 360) * TAU;
    const x = 64 + Math.sin(a) * len; const y = 64 - Math.cos(a) * len;
    stroke(ctx, () => { ctx.beginPath(); ctx.moveTo(64, 64); ctx.lineTo(x, y); }, '#15171a', w);
    stroke(ctx, () => { ctx.beginPath(); ctx.moveTo(64 - 1, 64 - 1); ctx.lineTo(x - 1, y - 1); }, 'rgba(160,170,180,0.6)', w * 0.3);
  };
  hand(-60, 21, 7.5);
  hand(60, 30, 5.5);
  circle(ctx, 64, 64, 6); ctx.fillStyle = RED[2]; ctx.fill();
  circle(ctx, 63, 63, 2.5); ctx.fillStyle = RED[0]; ctx.fill();
  // the logo's four studs on the ring
  for (const [x, y] of [[64, 15], [113, 64], [64, 113], [15, 64]]) stud(ctx, x, y, 11, 6, JADE, true, x + y);
}

/** Star: faceted old gold, a jade gem at the heart */
function star(ctx) {
  const cx = 64; const cy = 68; const R = 59; const r = 25;
  const P = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5; const rr = i % 2 ? r : R;
    P.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  // each facet lit by how squarely it faces the top-left
  const L = [-0.62, -0.78];
  for (let i = 0; i < 10; i++) {
    const [x1, y1] = P[i]; const [x2, y2] = P[(i + 1) % 10];
    const mx = (x1 + x2) / 2 - cx; const my = (y1 + y2) / 2 - cy; const n = Math.hypot(mx, my);
    const d = (mx * L[0] + my * L[1]) / n; // 1 = facing the light
    const t = (1 - d) / 2;
    const col = t < 0.5 ? mix(GOLD[0], GOLD[2], t * 2) : mix(GOLD[2], GOLD[4], (t - 0.5) * 2);
    poly(ctx, [[cx, cy], P[i], P[(i + 1) % 10]]); ctx.fillStyle = col; ctx.fill();
    // a hairline along the ridge so neighbouring facets don't blur together
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(...P[i]);
    ctx.strokeStyle = i % 2 ? 'rgba(80,40,0,0.35)' : 'rgba(255,250,220,0.55)'; ctx.lineWidth = 1.4; ctx.stroke();
  }
  const outline = () => poly(ctx, P);
  bevel(ctx, outline, 2.5, 'rgba(255,255,255,0.7)', 'rgba(60,30,0,0.5)', [cx - R, cy - R, cx + R, cy + R]);
  setGem(ctx, cx, cy, 12, JADE, true, { glintR: 8 });
  glint(ctx, 40, 50, 9);
}
star.post = { glow: '#ffd34d', glowBlur: 6, glowAlpha: 0.45 };

/** Stats: a stone tablet carved with three rising bars of the kit's energy */
function chart(ctx) {
  const slab = () => {
    ctx.beginPath();
    ctx.moveTo(12, 118); ctx.lineTo(12, 30); ctx.quadraticCurveTo(12, 10, 32, 10);
    ctx.lineTo(96, 10); ctx.quadraticCurveTo(116, 10, 116, 30); ctx.lineTo(116, 118); ctx.closePath();
  };
  stone(ctx, slab, [12, 10, 116, 118], 71, { cracked: true });
  const base = 104;
  const bars = [[22, 70, ENERGY.b], [52, 48, ENERGY.g], [82, 22, ENERGY.y]];
  for (const [x, top, E] of bars) {
    const w = 24;
    // the carved slot, then the energy rising in it
    rrect(ctx, x - 2, top - 2, w + 4, base - top + 4, 3); ctx.fillStyle = '#060706'; ctx.fill();
    const col = () => rrect(ctx, x, top, w, base - top, 2);
    fill(ctx, col, lin(ctx, x, 0, x + w, 0, [[0, E.light], [0.35, E.mid], [0.8, E.dark], [1, E.dark]]));
    ctx.fillStyle = rgba(E.core, 0.85); ctx.fillRect(x + 3, top + 2, 4, base - top - 4);
    ctx.fillStyle = rgba(E.core, 0.9); ctx.fillRect(x, top, w, 3);
  }
  // the carved baseline
  ctx.fillStyle = '#060706'; ctx.fillRect(18, base + 2, 92, 5);
  ctx.fillStyle = 'rgba(222,220,204,0.5)'; ctx.fillRect(18, base + 7, 92, 2);
}

/** A head-and-shoulders bust, carved: (cx, cy) is the chin */
function bust(ctx, cx, cy, s, ramp, seed) {
  const shape = () => {
    ctx.beginPath();
    circle(ctx, cx, cy - 16 * s, 16 * s);
    ctx.moveTo(cx - 34 * s, cy + 48 * s);
    ctx.bezierCurveTo(cx - 36 * s, cy + 14 * s, cx - 22 * s, cy + 4 * s, cx, cy + 4 * s);
    ctx.bezierCurveTo(cx + 22 * s, cy + 4 * s, cx + 36 * s, cy + 14 * s, cx + 34 * s, cy + 48 * s);
    ctx.closePath();
  };
  const head = () => circle(ctx, cx, cy - 16 * s, 16 * s);
  const shoulders = () => {
    ctx.beginPath();
    ctx.moveTo(cx - 34 * s, cy + 48 * s);
    ctx.bezierCurveTo(cx - 36 * s, cy + 14 * s, cx - 22 * s, cy + 4 * s, cx, cy + 4 * s);
    ctx.bezierCurveTo(cx + 22 * s, cy + 4 * s, cx + 36 * s, cy + 14 * s, cx + 34 * s, cy + 48 * s);
    ctx.closePath();
  };
  // a dark rim around the figure so the one behind separates from it
  for (const p of [head, shoulders]) stroke(ctx, p, '#040806', 6);
  const g = (y0) => lin(ctx, cx - 30 * s, y0, cx + 30 * s, y0 + 50 * s, [[0, ramp[0]], [0.45, ramp[1]], [1, ramp[3]]]);
  fill(ctx, shoulders, g(cy));
  fill(ctx, head, g(cy - 32 * s));
  clip(ctx, shape, () => grain(ctx, cx - 40 * s, cy - 40 * s, 80 * s, 90 * s, { seed, n: 220, light: 0.1, dark: 0.16 }));
}

/** Players: two figures carved in a stone medallion */
function people(ctx) {
  const disc = () => circle(ctx, 64, 64, 58);
  stone(ctx, disc, [6, 6, 122, 122], 101, { cracked: false });
  const well = () => circle(ctx, 64, 64, 45);
  fill(ctx, well, '#050907');
  clip(ctx, well, () => {
    smoke(ctx, 20, 20, 88, 88, { seed: 6, n: 6, colours: ['#1f5a32', '#14402a'], alpha: 0.6, rMin: 10, rMax: 22 });
    bust(ctx, 79, 56, 0.74, ['#cfe9d6', '#8fbf9d', '#5f8f6c', '#2f4f38'], 8);
    bust(ctx, 52, 68, 0.9, IVORY, 9);
  });
  // the well's carved lip: dark inside, pale catch-light
  stroke(ctx, well, '#0b0c0b', 4);
  ctx.save(); ctx.translate(1.5, 1.5); stroke(ctx, () => { ctx.beginPath(); ctx.arc(64, 64, 47, 0.1 * Math.PI, 0.9 * Math.PI); }, 'rgba(222,220,204,0.5)', 2); ctx.restore();
}

// ---------------------------------------------------------------- votes

/** Votes: a red-lacquered ballot box, a ballot going in */
function ballot(ctx) {
  const top = () => poly(ctx, [[24, 46], [104, 46], [116, 60], [12, 60]]);
  const front = () => rrect(ctx, 12, 58, 104, 60, 5);
  fill(ctx, top, lin(ctx, 0, 46, 0, 60, [[0, RED[0]], [1, RED[1]]]));
  // the slot
  rrect(ctx, 38, 49, 52, 7, 3); ctx.fillStyle = '#1a0204'; ctx.fill();
  // the ballot, half in: clipped at the slot
  clip(ctx, () => { ctx.beginPath(); ctx.rect(0, 0, 128, 53); }, () => {
    frame(ctx, { x: 64, y: 30, rot: 0.08 }, () => {
      const paper = () => rrect(ctx, -22, -28, 44, 56, 2);
      fill(ctx, paper, lin(ctx, -22, -28, 22, 28, [[0, IVORY[0]], [0.6, IVORY[1]], [1, IVORY[2]]]));
      bevel(ctx, paper, 2, 'rgba(255,255,255,0.9)', 'rgba(80,60,20,0.4)', [-22, -28, 22, 28]);
      // a brush tick in cinnabar
      stroke(ctx, () => { ctx.beginPath(); ctx.moveTo(-11, -10); ctx.lineTo(-3, -1); ctx.lineTo(13, -20); }, '#c0161c', 6.5);
    });
  });
  fill(ctx, front, lin(ctx, 12, 58, 116, 118, [[0, RED[1]], [0.45, RED[2]], [1, RED[4]]]));
  clip(ctx, front, () => {
    grain(ctx, 12, 58, 104, 60, { seed: 12, n: 260, light: 0.1, dark: 0.18 });
    // lacquer gloss
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ellipse(ctx, 36, 68, 18, 3, -0.08); ctx.fill();
  });
  bevel(ctx, front, 2.5, rgba(RED[0], 0.85), 'rgba(0,0,0,0.55)', [12, 58, 116, 118]);
  // gold bands, and a jade stud on a gold plate
  for (const y of [62, 108]) { ctx.fillStyle = metal(ctx, GOLD, 12, y, 116, y + 5); ctx.fillRect(14, y, 100, 5); }
  diamond(ctx, 64, 86, 16); ctx.fillStyle = metal(ctx, GOLD, 48, 70, 80, 102); ctx.fill();
  setGem(ctx, 64, 86, 9, JADE, true, { glintR: 6 });
}

/** A jian (straight sword), tip up along -y, pommel at +y */
function jian(ctx) {
  const blade = () => poly(ctx, [[0, -60], [7, -49], [7, 18], [-7, 18], [-7, -49]]);
  fill(ctx, blade, lin(ctx, -7, 0, 7, 0, [[0, '#ffffff'], [0.45, SILVER[1]], [0.5, SILVER[3]], [1, SILVER[2]]]));
  bevel(ctx, blade, 1.5, 'rgba(255,255,255,0.8)', 'rgba(0,0,0,0.45)', [-7, -60, 7, 18]);
  // guard, grip wrapped in red cord, pommel, tassel
  const guard = () => { ctx.beginPath(); ctx.moveTo(-17, 18); ctx.quadraticCurveTo(0, 12, 17, 18); ctx.lineTo(13, 27); ctx.quadraticCurveTo(0, 23, -13, 27); ctx.closePath(); };
  fill(ctx, guard, metal(ctx, GOLD, -17, 12, 17, 27));
  rrect(ctx, -5.5, 25, 11, 23, 3); ctx.fillStyle = lin(ctx, -5, 0, 5, 0, [[0, WOOD[1]], [1, WOOD[3]]]); ctx.fill();
  for (let y = 28; y < 46; y += 5) { ctx.fillStyle = RED[2]; ctx.fillRect(-5.5, y, 11, 2.6); ctx.fillStyle = rgba(RED[0], 0.7); ctx.fillRect(-5.5, y, 11, 0.9); }
  circle(ctx, 0, 52, 7); ctx.fillStyle = metal(ctx, GOLD, -7, 45, 7, 59); ctx.fill();
}

/** Versus: two crossed jian, a spark where they meet */
function vs(ctx) {
  for (const rot of [-0.74, 0.74]) {
    frame(ctx, { x: 64, y: 62, rot }, () => {
      // the tassel hangs straight down whatever the sword's angle
      ctx.save(); ctx.rotate(-rot);
      const px = -52 * Math.sin(rot); const py = 52 * Math.cos(rot); // the pommel, unrotated
      cord(ctx, () => { ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + (rot > 0 ? 4 : -4), py + 8, px + (rot > 0 ? 2 : -2), py + 14); }, 5);
      ctx.restore();
      jian(ctx);
    });
  }
  const r = rng(8);
  for (const a of [0.3, 2.0, 3.6, 5.1]) {
    drawBolt(ctx, boltPoints(r, 64, 50, 64 + Math.cos(a) * 22, 50 + Math.sin(a) * 18, { steps: 3, amp: 4 }), { ...BOLT, width: 1.6, glowAlpha: 0.3 });
  }
  glint(ctx, 64, 50, 13);
}
vs.post = { glow: '#3d6bff', glowBlur: 5, glowAlpha: 0.4 };

/** Closed: a bronze padlock with a carved border */
function lock(ctx) {
  const shackle = () => { ctx.beginPath(); ctx.moveTo(38, 70); ctx.lineTo(38, 42); ctx.arc(64, 42, 26, Math.PI, 0); ctx.lineTo(90, 70); };
  stroke(ctx, shackle, IRON[4], 17, 'butt');
  stroke(ctx, shackle, IRON[2], 12, 'butt');
  ctx.save(); ctx.translate(-2, -2); stroke(ctx, shackle, rgba(IRON[0], 0.85), 3.5, 'butt'); ctx.restore();
  const body = () => rrect(ctx, 16, 56, 96, 64, 12);
  fill(ctx, body, metal(ctx, BRONZE, 16, 56, 112, 120));
  clip(ctx, body, () => grain(ctx, 16, 56, 96, 64, { seed: 19, n: 300, light: 0.12, dark: 0.2 }));
  bevel(ctx, body, 3, 'rgba(255,240,220,0.85)', 'rgba(0,0,0,0.55)', [16, 56, 112, 120]);
  // carved inner border
  const inset = () => rrect(ctx, 25, 65, 78, 46, 7);
  ctx.save(); ctx.translate(1.2, 1.2); stroke(ctx, inset, 'rgba(255,230,200,0.45)', 2); ctx.restore();
  stroke(ctx, inset, 'rgba(60,25,5,0.6)', 2);
  // the keyhole
  circle(ctx, 64, 82, 9); ctx.fillStyle = '#120804'; ctx.fill();
  poly(ctx, [[59, 84], [69, 84], [72, 102], [56, 102]]); ctx.fill();
  stroke(ctx, () => { ctx.beginPath(); ctx.arc(64, 82, 10, 0.2 * Math.PI, 0.8 * Math.PI); }, 'rgba(255,230,200,0.5)', 1.6);
  glint(ctx, 32, 70, 9);
}

/**
 * Tie: a bronze balance, a gold coin in each pan, the pans level. (A
 * handshake, like the 🤝 fallback, was tried first: at 22 px it was a tan
 * blob between two sleeves. A balance reads as "even" at any size.)
 */
function tie(ctx) {
  // stone base, bronze post
  stone(ctx, () => rrect(ctx, 38, 104, 52, 16, 5), [38, 104, 90, 120], 77, { cracked: false });
  rrect(ctx, 59, 26, 10, 80, 3); ctx.fillStyle = metal(ctx, BRONZE, 59, 26, 69, 106); ctx.fill();
  // the beam
  const beam = () => rrect(ctx, 12, 24, 104, 9, 4);
  fill(ctx, beam, metal(ctx, BRONZE, 12, 24, 116, 33));
  bevel(ctx, beam, 1.5, 'rgba(255,240,220,0.85)', 'rgba(0,0,0,0.5)', [12, 24, 116, 33]);
  // red cords down to the pans
  for (const x of [26, 102]) {
    cord(ctx, () => { ctx.beginPath(); ctx.moveTo(x, 30); ctx.lineTo(x - 16, 74); }, 4);
    cord(ctx, () => { ctx.beginPath(); ctx.moveTo(x, 30); ctx.lineTo(x + 16, 74); }, 4);
    // the pan, a gold coin in each — the same weight both sides
    cashCoin(ctx, x, 64, 12, GOLD, x);
    const pan = () => { ctx.beginPath(); ctx.moveTo(x - 24, 72); ctx.quadraticCurveTo(x, 98, x + 24, 72); ctx.closePath(); };
    fill(ctx, pan, metal(ctx, BRONZE, x - 24, 72, x + 24, 90));
    bevel(ctx, pan, 2, 'rgba(255,240,220,0.85)', 'rgba(0,0,0,0.5)', [x - 24, 72, x + 24, 90]);
  }
  // a jade gem crowning the post
  setGem(ctx, 64, 20, 10, JADE, true, { glintR: 7 });
}

/** Upset: Egg Shen's lightning, striking */
function upset(ctx) {
  const bolt = () => poly(ctx, [[78, 4], [24, 70], [58, 70], [40, 124], [106, 48], [70, 48], [96, 4]]);
  fill(ctx, bolt, lin(ctx, 30, 4, 100, 124, [[0, '#ffffff'], [0.3, '#d6e4ff'], [0.65, '#7aa0ff'], [1, '#2c46e0']]));
  // a white-hot core down the middle
  clip(ctx, bolt, () => {
    poly(ctx, [[82, 10], [38, 64], [64, 64], [50, 108], [94, 54], [64, 54], [86, 10]]);
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fill();
  });
  bevel(ctx, bolt, 2.5, 'rgba(255,255,255,0.9)', 'rgba(10,20,120,0.6)', [24, 4, 106, 124]);
  // sparks thrown off the strike
  sparkle(ctx, 22, 108, 9, '#ffffff', '#a8c6ff');
  sparkle(ctx, 66, 114, 6, '#d6e4ff');
  sparkle(ctx, 108, 82, 6, '#d6e4ff');
}
upset.post = { glow: '#3d6bff', glowBlur: 7, glowAlpha: 0.8 };

/** Random: a bone die, its one and four pips red the Chinese way */
function dice(ctx) {
  const faces = {
    top: [[20, 40], [44, -24], [44, 24]],
    left: [[20, 40], [44, 24], [0, 54]],
    right: [[64, 64], [44, -24], [0, 54]],
  };
  const facePath = ([[ox, oy], [ux, uy], [vx, vy]]) => () => poly(ctx, [[ox, oy], [ox + ux, oy + uy], [ox + ux + vx, oy + uy + vy], [ox + vx, oy + vy]]);
  const shade = { top: [IVORY[0], IVORY[1]], left: [IVORY[1], IVORY[2]], right: [IVORY[2], IVORY[3]] };
  for (const [k, f] of Object.entries(faces)) {
    const p = facePath(f);
    fill(ctx, p, lin(ctx, 20, 16, 108, 118, [[0, shade[k][0]], [1, shade[k][1]]]));
    clip(ctx, p, () => grain(ctx, 16, 12, 96, 112, { seed: k.length + 40, n: 260, light: 0.1, dark: 0.12 }));
  }
  // rounded edges: pale ridges where the faces meet
  stroke(ctx, () => { ctx.beginPath(); ctx.moveTo(20, 40); ctx.lineTo(64, 64); ctx.lineTo(108, 40); ctx.moveTo(64, 64); ctx.lineTo(64, 118); }, 'rgba(255,255,255,0.7)', 2.5);
  // pips, drawn in each face's plane
  const pips = (f, list, r, colour) => {
    const [[ox, oy], [ux, uy], [vx, vy]] = f;
    for (const [a, b] of list) {
      ctx.save(); ctx.transform(ux, uy, vx, vy, ox, oy);
      ctx.beginPath(); ctx.arc(a, b, r, 0, TAU); ctx.restore();
      ctx.fillStyle = colour; ctx.fill();
      ctx.save(); ctx.transform(ux, uy, vx, vy, ox, oy);
      ctx.beginPath(); ctx.arc(a + r * 0.25, b + r * 0.25, r * 0.55, 0, TAU); ctx.restore();
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fill();
    }
  };
  pips(faces.top, [[0.5, 0.5]], 0.2, '#c8141c');
  pips(faces.left, [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]], 0.12, '#c8141c');
  pips(faces.right, [[0.24, 0.24], [0.5, 0.5], [0.76, 0.76]], 0.12, '#1a1410');
  glint(ctx, 44, 30, 8);
}

// ---------------------------------------------------------------- games

/** Black Blood of the Earth: a glass gourd glowing with storm, jade stopper, red cord */
function potion(ctx) {
  frame(ctx, { x: 64, y: 0, sx: 1.2, sy: 1 }, () => {
    const g = () => gourdPath(ctx, 0, 18, 1.0);
    fill(ctx, g, '#0a1030');
    clip(ctx, g, () => {
      ctx.fillStyle = rad(ctx, -4, 88, 50, [[0, '#cfe0ff'], [0.25, '#6f97ff'], [0.6, '#2a3fd8'], [1, 'rgba(20,30,120,0)']]);
      ctx.fillRect(-64, 0, 128, 128);
      ctx.fillStyle = rad(ctx, -2, 42, 20, [[0, 'rgba(160,190,255,0.7)'], [1, 'rgba(60,90,255,0)']]);
      ctx.fillRect(-64, 0, 128, 128);
      smoke(ctx, -40, 50, 80, 70, { seed: 12, n: 5, colours: ['#1f5a32', '#2a2a8f'], alpha: 0.35, rMin: 10, rMax: 18 });
      specks(ctx, -34, 30, 68, 86, { seed: 3, n: 22, colour: '#e8f0ff', max: 1.6 });
    });
    glassRim(ctx, g, 3);
  });
  const r = rng(17);
  forkedBolt(ctx, r, 34, 102, 94, 78, { steps: 6, amp: 8, branches: 2, branchLen: 14, width: 2.2, ...BOLT });
  // highlights on both bulbs
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.ellipse(64, 88, 36, 30, 0, Math.PI * 1.08, Math.PI * 1.34); ctx.stroke();
  ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.ellipse(64, 40, 15, 13, 0, Math.PI * 1.05, Math.PI * 1.4); ctx.stroke();
  // red cord at the waist, a tassel
  cord(ctx, () => { ctx.beginPath(); ctx.moveTo(46, 58); ctx.quadraticCurveTo(64, 64, 82, 58); }, 7);
  cord(ctx, () => { ctx.beginPath(); ctx.moveTo(82, 59); ctx.quadraticCurveTo(96, 68, 98, 84); }, 5);
  // jade stopper
  rrect(ctx, 52, 4, 24, 17, 5);
  ctx.fillStyle = lin(ctx, 52, 4, 76, 21, [[0, JADE.hi], [0.5, JADE.mid], [1, JADE.dark]]); ctx.fill();
  glint(ctx, 58, 9, 5);
}
potion.post = { glow: '#4f7dff', glowBlur: 7, glowAlpha: 0.75 };

/**
 * A wedge of cream pie, tip to the right, in local coords (about x -50..52,
 * y -26..40). At 22 px the silhouette has to say "pie", so it's built from
 * what a slice is known by: a thick crust rim rolled along the back, a
 * crust base under the filling, and whipped cream on top — the cut face
 * shows all three as bands.
 */
function pieWedge(ctx, P) {
  const D = 30; // how deep the slice is
  const tip = [52, 8]; const bn = [-30, 22]; const bf = [-22, -16]; const bulge = [-50, 2];
  const down = ([x, y]) => [x, y + D];
  // the outer crust wall at the back
  const back = () => {
    ctx.beginPath();
    ctx.moveTo(...bf); ctx.quadraticCurveTo(...bulge, ...bn);
    ctx.lineTo(...down(bn)); ctx.quadraticCurveTo(bulge[0], bulge[1] + D, ...down(bf));
    ctx.closePath();
  };
  fill(ctx, back, lin(ctx, -50, 0, -24, 50, [[0, P.crust[1]], [0.6, P.crust[2]], [1, P.crust[3]]]));
  // the cut face: cream, filling, crust, in bands that follow the slope
  const face = () => poly(ctx, [bn, tip, down(tip), down(bn)]);
  clip(ctx, face, () => {
    const y = (x, t) => bn[1] + (tip[1] - bn[1]) * ((x - bn[0]) / (tip[0] - bn[0])) + D * t;
    const band = (t0, t1, col) => {
      poly(ctx, [[bn[0], y(bn[0], t0)], [tip[0], y(tip[0], t0)], [tip[0], y(tip[0], t1)], [bn[0], y(bn[0], t1)]]);
      ctx.fillStyle = col; ctx.fill();
    };
    band(0, 0.3, P.cream[2]);
    band(0.3, 0.64, P.fill[1]);
    band(0.64, 1.01, P.crust[2]);
    // a lit line where each layer starts, and the crust's baked base
    for (const [t, col] of [[0.3, rgba(P.fill[0], 0.9)], [0.64, rgba(P.crust[0], 0.8)]]) {
      ctx.beginPath(); ctx.moveTo(bn[0], y(bn[0], t) + 1); ctx.lineTo(tip[0], y(tip[0], t) + 1);
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
    }
    band(0.9, 1.01, P.crust[3]);
  });
  // the top, whipped cream piped on in puffs
  const topFace = () => { ctx.beginPath(); ctx.moveTo(...bf); ctx.quadraticCurveTo(...bulge, ...bn); ctx.lineTo(...tip); ctx.closePath(); };
  fill(ctx, topFace, P.cream[1]);
  const puff = (x, yy, rx, ry) => {
    ellipse(ctx, x + 1.5, yy + 2, rx, ry); ctx.fillStyle = P.cream[2]; ctx.fill();
    ellipse(ctx, x, yy, rx, ry); ctx.fillStyle = lin(ctx, x - rx, yy - ry, x + rx, yy + ry, [[0, P.cream[0]], [0.6, P.cream[1]], [1, P.cream[2]]]); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 1, yy + 1, Math.min(rx, ry) * 0.7, 0.3, 2.4);
    ctx.strokeStyle = rgba(P.cream[3], 0.55); ctx.lineWidth = 1.6; ctx.stroke();
  };
  puff(-16, -4, 13, 10); puff(4, -2, 12, 8.5); puff(-4, -14, 10, 8); puff(22, 3, 9, 6); puff(36, 6, 6, 4.5);
  // the crust rim, rolled along the back, fork-pressed
  const rimPath = () => { ctx.beginPath(); ctx.moveTo(bf[0] + 2, bf[1] - 1); ctx.quadraticCurveTo(bulge[0] + 2, bulge[1], bn[0] + 1, bn[1] + 2); };
  stroke(ctx, rimPath, P.crust[3], 17);
  stroke(ctx, rimPath, P.crust[1], 13);
  ctx.save(); ctx.translate(-2.5, -2.5); stroke(ctx, rimPath, rgba(P.crust[0], 0.9), 5); ctx.restore();
  ctx.strokeStyle = rgba(P.crust[3], 0.85); ctx.lineWidth = 1.8;
  for (const t of [0.12, 0.34, 0.56, 0.78, 0.96]) {
    // a point on the rim's curve, and a short mark across it
    const u = 1 - t;
    const x = u * u * (bf[0] + 2) + 2 * u * t * (bulge[0] + 2) + t * t * (bn[0] + 1);
    const yy = u * u * (bf[1] - 1) + 2 * u * t * bulge[1] + t * t * (bn[1] + 2);
    ctx.beginPath(); ctx.moveTo(x - 4, yy - 1); ctx.lineTo(x + 3, yy + 1); ctx.stroke();
  }
}

const PIE = {
  crust: ['#ffd08a', '#cf8530', '#8e4c12', '#4e2606'],
  fill: ['#fff3b0', '#ffd23e', '#c88a10'],
  cream: ['#ffffff', '#f6f8fb', '#c6cfdd', '#7d8aa0'],
};
/** The same slice in gold: gilded crust and filling, the cream still pale so it reads as pie, not cheese */
const GOLDEN_PIE = {
  crust: ['#fff4c0', '#f2b42a', '#b06e06', '#5e3602'],
  fill: ['#fffbe0', '#ffd23a', '#d08a10'],
  cream: ['#ffffff', '#fff8e0', '#ecd48a', '#a8842a'],
};

/** Food fight: a slice of cream pie, thrown, Egg Shen's lightning trailing it */
function food(ctx) {
  const r = rng(31);
  for (const [row, x0] of [[44, 14], [62, 2], [80, 10]]) {
    drawBolt(ctx, boltPoints(r, x0, row, 34, row, { steps: 3, amp: 2.5 }), { ...BOLT, width: 3, glowAlpha: 0.3 });
  }
  frame(ctx, { x: 70, y: 58, rot: -0.16, s: 0.92 }, () => pieWedge(ctx, PIE));
}

/** Doom: a Chinese cleaver, lightning along the blade */
function doom(ctx) {
  frame(ctx, { x: 68, y: 70, rot: 0.62, s: 1.3 }, () => {
    // handle: dark wood, red cord wrap, jade bead
    fill(ctx, () => cleaverHandlePath(ctx), lin(ctx, 0, -10, 0, 6, [[0, '#7a4a2a'], [0.5, '#4a2a14'], [1, '#22120a']]));
    for (let x = 22; x < 48; x += 7) { ctx.fillStyle = RED[2]; ctx.fillRect(x, -11, 4, 17); ctx.fillStyle = rgba(RED[0], 0.7); ctx.fillRect(x, -11, 1.5, 17); }
    circle(ctx, 50, -2.5, 5); ctx.fillStyle = JADE.mid; ctx.fill(); glint(ctx, 49, -4, 3);
    // blade: blackened iron, a bright ground edge
    const blade = () => cleaverBladePath(ctx);
    fill(ctx, blade, lin(ctx, 0, -24, 0, 24, [[0, '#5f646a'], [0.15, '#3c4046'], [0.6, '#2a2d31'], [0.78, '#4a5058'], [0.82, '#d8e4ee'], [0.92, '#ffffff'], [1, '#9fb4c8']]));
    clip(ctx, blade, () => {
      grain(ctx, -50, -26, 70, 52, { seed: 9, n: 300, light: 0.12, dark: 0.25 });
      // forge-blackened band along the spine
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-50, -26, 70, 9);
      const r = rng(5);
      forkedBolt(ctx, r, -40, 2, 10, -2, { steps: 6, amp: 7, branches: 2, branchLen: 10, width: 1.8, ...BOLT });
    });
    bevel(ctx, blade, 2.5, 'rgba(230,236,240,0.85)', 'rgba(0,0,0,0.5)', [-50, -24, 16, 24]);
    // a maker's stamp near the spine
    ctx.fillStyle = RED[2]; ctx.fillRect(-14, -18, 9, 9);
  });
}
doom.post = { glow: '#3d6bff', glowBlur: 5, glowAlpha: 0.35 };

/** Rescue: a life ring in red lacquer and bone, bound with red cord */
function rescue(ctx) {
  const cx = 64; const cy = 64; const R = 55; const r = 27;
  const ring = () => { ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.moveTo(cx + r, cy); ctx.arc(cx, cy, r, 0, TAU, true); };
  fill(ctx, ring, IVORY[1]);
  // four red bands
  for (let i = 0; i < 4; i++) {
    const a0 = -Math.PI / 4 + (i * TAU) / 4 - 0.36; const a1 = a0 + 0.72;
    ctx.beginPath(); ctx.arc(cx, cy, R, a0, a1); ctx.arc(cx, cy, r, a1, a0, true); ctx.closePath();
    ctx.fillStyle = RED[1]; ctx.fill();
  }
  // round the tube: light along its crest, dark at both edges, lit from the top-left
  clip(ctx, ring, () => {
    ctx.fillStyle = rad(ctx, cx, cy, R, [[r / R, 'rgba(0,0,0,0.45)'], [(r + R) / 2 / R - 0.08, 'rgba(255,255,255,0.28)'], [(r + R) / 2 / R + 0.05, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,0.5)']]);
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = lin(ctx, 10, 10, 118, 118, [[0, 'rgba(255,255,255,0.3)'], [0.5, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,0.4)']]);
    ctx.fillRect(0, 0, 128, 128);
    grain(ctx, 8, 8, 112, 112, { seed: 2, n: 500, light: 0.08, dark: 0.12 });
  });
  // the rope: a red cord looped round the outside, bound at each band
  for (let i = 0; i < 4; i++) {
    const a0 = -Math.PI / 4 + (i * TAU) / 4; const a1 = a0 + TAU / 4;
    cord(ctx, () => { ctx.beginPath(); ctx.arc(cx, cy, R - 4, a0 + 0.12, a1 - 0.12); }, 4.5);
    const bx = cx + Math.cos(a0) * (R - 4); const by = cy + Math.sin(a0) * (R - 4);
    circle(ctx, bx, by, 4); ctx.fillStyle = RED[3]; ctx.fill();
  }
  glint(ctx, 36, 30, 10);
}

/** Siege: Lightning, one of the Three Storms — straw hat, eyes in shadow */
function siege(ctx) {
  // robe and shoulders
  fill(ctx, () => poly(ctx, [[22, 120], [34, 84], [94, 84], [106, 120]]), lin(ctx, 0, 84, 0, 120, [[0, '#2a2e3a'], [1, '#0d0f14']]));
  fill(ctx, () => poly(ctx, [[52, 84], [64, 104], [76, 84]]), '#a9b4c8');
  // the face in shadow
  fill(ctx, () => rrect(ctx, 36, 52, 56, 40, 12), '#0a0b10');
  for (const x of [50, 78]) {
    ellipse(ctx, x, 70, 9, 3.8); ctx.fillStyle = '#e8f2ff'; ctx.fill();
    ctx.fillStyle = rad(ctx, x, 70, 13, [[0, 'rgba(120,160,255,0.7)'], [1, 'rgba(60,100,255,0)']]);
    ctx.fillRect(x - 13, 57, 26, 26);
  }
  // the conical hat
  const hat = () => { ctx.beginPath(); ctx.moveTo(64, 6); ctx.lineTo(124, 54); ctx.quadraticCurveTo(64, 66, 4, 54); ctx.closePath(); };
  fill(ctx, hat, lin(ctx, 20, 10, 110, 60, [[0, '#f0d79a'], [0.45, '#c9a35c'], [1, '#6e5426']]));
  clip(ctx, hat, () => {
    ctx.strokeStyle = 'rgba(80,55,15,0.5)'; ctx.lineWidth = 1.6;
    for (let i = -6; i <= 6; i++) { ctx.beginPath(); ctx.moveTo(64, 6); ctx.lineTo(64 + i * 11, 64); ctx.stroke(); }
    for (const yy of [26, 40]) { ctx.beginPath(); ctx.moveTo(0, yy + 4); ctx.quadraticCurveTo(64, yy - 6, 128, yy + 4); ctx.strokeStyle = 'rgba(80,55,15,0.35)'; ctx.stroke(); }
  });
  bevel(ctx, hat, 3, 'rgba(255,250,225,0.8)', 'rgba(40,25,0,0.6)', [4, 6, 124, 60]);
  // lightning from the hands
  const r = rng(3);
  forkedBolt(ctx, r, 30, 96, 6, 120, { steps: 4, amp: 6, branches: 1, branchLen: 10, width: 2, ...BOLT });
  forkedBolt(ctx, r, 98, 96, 122, 122, { steps: 4, amp: 6, branches: 1, branchLen: 10, width: 2, ...BOLT });
}
siege.post = { glow: '#3d6bff', glowBlur: 5, glowAlpha: 0.4 };

// ---------------------------------------------------------------- items

/** Golden Pie: the food fight's slice, all gold */
function gpie(ctx) {
  frame(ctx, { x: 66, y: 60, rot: -0.1, s: 1.02 }, () => pieWedge(ctx, GOLDEN_PIE));
  glint(ctx, 48, 50, 12);
  sparkle(ctx, 104, 30, 9, '#fffbe0');
  sparkle(ctx, 112, 104, 6, '#fffbe0');
}
gpie.post = { glow: '#ffc64d', glowBlur: 7, glowAlpha: 0.7 };

/** Cursed VHS: the tape's label is the logo's nebula, lightning between the reels */
function vhs(ctx) {
  const body = () => rrect(ctx, 8, 26, 112, 76, 7);
  fill(ctx, body, lin(ctx, 8, 26, 120, 102, [[0, '#3a3e44'], [0.3, '#1e2125'], [1, '#0b0c0e']]));
  bevel(ctx, body, 3, 'rgba(190,200,210,0.75)', 'rgba(0,0,0,0.6)', [8, 26, 120, 102]);
  // label: nebula
  const label = () => rrect(ctx, 18, 33, 92, 30, 3);
  fill(ctx, label, '#040806');
  clip(ctx, label, () => {
    smoke(ctx, 18, 33, 92, 30, { seed: 7, n: 8, colours: ['#2b7a46', '#1d4f8f'], alpha: 0.75, rMin: 8, rMax: 16 });
    specks(ctx, 18, 33, 92, 30, { seed: 2, n: 14, colour: '#e0ffe8', max: 1.5 });
  });
  stroke(ctx, label, 'rgba(210,215,200,0.6)', 1.6);
  glint(ctx, 96, 42, 7);
  // window and reels
  const win = () => rrect(ctx, 34, 70, 60, 24, 4);
  fill(ctx, win, '#020203');
  stroke(ctx, win, 'rgba(160,170,180,0.6)', 2);
  for (const x of [48, 80]) {
    circle(ctx, x, 82, 9); ctx.fillStyle = '#d9dde2'; ctx.fill();
    circle(ctx, x, 82, 4); ctx.fillStyle = '#2a2d31'; ctx.fill();
  }
  const r = rng(4);
  forkedBolt(ctx, r, 56, 82, 72, 82, { steps: 4, amp: 5, branches: 1, branchLen: 8, width: 1.8, ...BOLT });
}
vhs.post = { glow: '#3d6bff', glowBlur: 5, glowAlpha: 0.35 };

/** Garlic, tied up in red string */
function garlic(ctx) {
  const g = () => garlicPath(ctx, 64, 74, 1.02);
  fill(ctx, g, rad(ctx, 50, 66, 62, [[0, '#ffffff'], [0.45, '#f1e9dc'], [0.85, '#c9b7a0'], [1, '#8e7a64']]));
  clip(ctx, g, () => {
    ctx.strokeStyle = 'rgba(120,95,70,0.45)'; ctx.lineWidth = 2.2;
    for (const k of [-0.62, -0.3, 0, 0.3, 0.62]) {
      ctx.beginPath(); ctx.moveTo(64, 30); ctx.bezierCurveTo(64 + k * 70, 50, 64 + k * 70, 100, 64 + k * 40, 118); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(150,80,170,0.28)';
    ellipse(ctx, 40, 100, 14, 8); ctx.fill(); ellipse(ctx, 88, 102, 14, 8); ctx.fill();
  });
  // roots
  ctx.strokeStyle = '#a58c66'; ctx.lineWidth = 2.5;
  for (const x of [54, 60, 66, 72]) { ctx.beginPath(); ctx.moveTo(x, 116); ctx.lineTo(x + (x - 63) * 0.4, 122); ctx.stroke(); }
  // red string round the neck, a bow
  cord(ctx, () => { ctx.beginPath(); ctx.moveTo(56, 36); ctx.quadraticCurveTo(64, 40, 72, 36); }, 7);
  cord(ctx, () => { ctx.beginPath(); ctx.moveTo(70, 36); ctx.quadraticCurveTo(88, 22, 92, 34); ctx.quadraticCurveTo(84, 42, 72, 37); }, 6);
  cord(ctx, () => { ctx.beginPath(); ctx.moveTo(72, 38); ctx.quadraticCurveTo(90, 46, 96, 62); }, 5);
  // stem
  rrect(ctx, 60, 14, 8, 20, 3); ctx.fillStyle = lin(ctx, 60, 0, 68, 0, [[0, '#efe6d2'], [1, '#a8957a']]); ctx.fill();
}

/** Holy Water: a temple vial of glowing water, jade stopper, red tassel */
function holyw(ctx) {
  frame(ctx, { x: 64, y: 66, rot: 0.22 }, () => {
    const vial = () => {
      ctx.beginPath();
      ctx.moveTo(-10, -44); ctx.lineTo(10, -44); ctx.lineTo(10, -32);
      ctx.bezierCurveTo(28, -26, 30, -8, 30, 10);
      ctx.lineTo(30, 30); ctx.quadraticCurveTo(30, 50, 0, 50); ctx.quadraticCurveTo(-30, 50, -30, 30);
      ctx.lineTo(-30, 10); ctx.bezierCurveTo(-30, -8, -28, -26, -10, -32);
      ctx.closePath();
    };
    fill(ctx, vial, 'rgba(18,28,40,0.9)');
    clip(ctx, vial, () => {
      ctx.fillStyle = lin(ctx, 0, -10, 0, 50, [[0, '#e8fbff'], [0.3, '#8fe4ff'], [1, '#2a8ad6']]);
      ctx.fillRect(-34, -8, 68, 60);
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(-34, -9, 68, 3);
      specks(ctx, -26, -4, 52, 50, { seed: 6, n: 14, colour: '#ffffff', max: 2 });
    });
    glassRim(ctx, vial, 2.5);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-20, -12); ctx.quadraticCurveTo(-24, 10, -20, 34); ctx.stroke();
    // jade stopper
    rrect(ctx, -12, -56, 24, 16, 5);
    ctx.fillStyle = lin(ctx, -12, -56, 12, -40, [[0, JADE.hi], [0.5, JADE.mid], [1, JADE.dark]]); ctx.fill();
    glint(ctx, -6, -51, 5);
    cord(ctx, () => { ctx.beginPath(); ctx.moveTo(-12, -36); ctx.quadraticCurveTo(0, -31, 12, -36); }, 6);
    cord(ctx, () => { ctx.beginPath(); ctx.moveTo(12, -35); ctx.quadraticCurveTo(26, -32, 36, -18); }, 5);
  });
  glint(ctx, 92, 92, 10);
}
holyw.post = { glow: '#8fe4ff', glowBlur: 6, glowAlpha: 0.55 };

/** Lucky Penny: a copper cash coin on a red string */
function penny(ctx) {
  cord(ctx, () => { ctx.beginPath(); ctx.moveTo(58, 64); ctx.bezierCurveTo(70, 30, 96, 14, 112, 10); }, 7);
  cashCoin(ctx, 56, 70, 46, COPPER, 9);
  cord(ctx, () => { ctx.beginPath(); ctx.moveTo(50, 70); ctx.lineTo(62, 70); }, 7);
  // knot and tails at the top right
  circle(ctx, 104, 16, 7); ctx.fillStyle = RED[2]; ctx.fill();
  cord(ctx, () => { ctx.beginPath(); ctx.moveTo(104, 20); ctx.quadraticCurveTo(108, 36, 118, 44); }, 5);
  cord(ctx, () => { ctx.beginPath(); ctx.moveTo(104, 20); ctx.quadraticCurveTo(98, 36, 102, 50); }, 5);
  glint(ctx, 30, 40, 9);
}

/** Antidote: a jade-and-gold capsule */
function antid(ctx) {
  frame(ctx, { x: 64, y: 64, rot: -0.75 }, () => {
    const cap = () => capsulePath(ctx, 104, 42);
    clip(ctx, cap, () => {
      ctx.fillStyle = lin(ctx, 0, -21, 0, 21, [[0, JADE.hi], [0.3, JADE.mid], [1, '#063a18']]); ctx.fillRect(-54, -22, 54, 44);
      ctx.fillStyle = lin(ctx, 0, -21, 0, 21, [[0, GOLD[0]], [0.3, GOLD[1]], [0.7, GOLD[2]], [1, GOLD[4]]]); ctx.fillRect(0, -22, 54, 44);
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(-2, -22, 4, 44);
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; rrect(ctx, -40, -14, 80, 7, 3.5); ctx.fill();
      grain(ctx, -54, -22, 108, 44, { seed: 4, n: 120, light: 0.1, dark: 0.12 });
    });
  });
  glint(ctx, 44, 38, 9);
}

/** Silver Bullet: brass casing, silver tip, a carved rune */
function silver(ctx) {
  frame(ctx, { x: 70, y: 60, rot: -0.78, s: 1.08 }, () => {
    // casing
    rrect(ctx, -50, -16, 38, 32, 3);
    ctx.fillStyle = lin(ctx, 0, -16, 0, 16, [[0, GOLD[0]], [0.3, GOLD[1]], [0.7, GOLD[2]], [1, GOLD[4]]]); ctx.fill();
    rrect(ctx, -54, -18, 8, 36, 2); ctx.fillStyle = lin(ctx, 0, -18, 0, 18, [[0, GOLD[1]], [1, GOLD[3]]]); ctx.fill();
    ctx.fillStyle = 'rgba(80,45,0,0.6)'; ctx.fillRect(-34, -16, 3, 32);
    // tip
    const tip = () => bulletTipPath(ctx, -14, 56, 34);
    fill(ctx, tip, lin(ctx, 0, -16, 0, 16, [[0, '#ffffff'], [0.25, SILVER[1]], [0.55, SILVER[2]], [0.62, SILVER[1]], [1, SILVER[4]]]));
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-14, -17, 3, 34);
    // a carved rune
    ctx.strokeStyle = 'rgba(40,50,60,0.7)'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(6, -8); ctx.lineTo(16, 0); ctx.lineTo(6, 8); ctx.moveTo(16, -8); ctx.lineTo(16, 8); ctx.stroke();
  });
  glint(ctx, 98, 30, 10);
}

/** Night Light: the lantern that saves a night, burning with spirit fire, on a carry handle */
function nlight(ctx) {
  stroke(ctx, () => { ctx.beginPath(); ctx.moveTo(40, 28); ctx.quadraticCurveTo(64, 0, 88, 28); }, WOOD[3], 7);
  stroke(ctx, () => { ctx.beginPath(); ctx.moveTo(40, 28); ctx.quadraticCurveTo(64, 0, 88, 28); }, WOOD[1], 3.5);
  lantern(ctx, 64, 66, 46, 42, LANTERN.spirit, true, { hanger: false });
  glint(ctx, 46, 54, 10);
}
nlight.post = { glow: '#3fc8ff', glowBlur: 7, glowAlpha: 0.75 };

// ---------------------------------------------------------------- card sections

/** Rewards: a red envelope (hongbao), a gold coin slipping out */
function gift(ctx) {
  frame(ctx, { x: 58, y: 62, rot: -0.12 }, () => {
    const env = () => rrect(ctx, -36, -52, 72, 104, 6);
    fill(ctx, env, lin(ctx, -36, -52, 36, 52, [[0, RED[1]], [0.5, RED[2]], [1, RED[3]]]));
    clip(ctx, env, () => {
      grain(ctx, -36, -52, 72, 104, { seed: 15, n: 280, light: 0.08, dark: 0.16 });
      // the flap, a shade lighter, its edge in shadow
      const flap = () => { ctx.beginPath(); ctx.moveTo(-40, -56); ctx.lineTo(40, -56); ctx.lineTo(40, -26); ctx.quadraticCurveTo(0, 10, -40, -26); ctx.closePath(); };
      fill(ctx, flap, lin(ctx, 0, -56, 0, 0, [[0, RED[0]], [1, RED[1]]]));
      ctx.save(); ctx.translate(0, 3); stroke(ctx, () => { ctx.beginPath(); ctx.moveTo(-40, -26); ctx.quadraticCurveTo(0, 10, 40, -26); }, 'rgba(60,0,0,0.5)', 4); ctx.restore();
      // gold border
      stroke(ctx, () => rrect(ctx, -29, -45, 58, 90, 3), rgba(GOLD[1], 0.85), 2.5);
    });
    bevel(ctx, env, 2.5, rgba(RED[0], 0.8), 'rgba(0,0,0,0.5)', [-36, -52, 36, 52]);
    // the gold seal on the flap's point
    circle(ctx, 0, -6, 14); ctx.fillStyle = metal(ctx, GOLD, -14, -20, 14, 8); ctx.fill();
    bevel(ctx, () => circle(ctx, 0, -6, 14), 2, 'rgba(255,255,255,0.8)', 'rgba(80,40,0,0.5)', [-14, -20, 14, 8]);
    rrect(ctx, -5, -11, 10, 10, 1.5); ctx.fillStyle = RED[2]; ctx.fill();
  });
  cashCoin(ctx, 98, 100, 22, GOLD, 5);
  glint(ctx, 36, 26, 9);
}

/** Glovebox: the Six Demon Bag — a drawstring pouch, its magic leaking out */
function glove(ctx) {
  // what's inside, escaping
  const r = rng(41);
  forkedBolt(ctx, r, 62, 26, 54, 2, { steps: 4, amp: 6, branches: 2, branchLen: 10, width: 2.2, ...BOLT });
  // the ruffled mouth above the drawstring
  const mouth = () => {
    ctx.beginPath();
    ctx.moveTo(52, 46); ctx.bezierCurveTo(38, 42, 30, 32, 34, 22);
    ctx.quadraticCurveTo(42, 28, 48, 20); ctx.quadraticCurveTo(56, 28, 64, 18); ctx.quadraticCurveTo(72, 28, 80, 20); ctx.quadraticCurveTo(86, 28, 94, 22);
    ctx.bezierCurveTo(98, 32, 90, 42, 76, 46); ctx.closePath();
  };
  // the bag
  const body = () => {
    ctx.beginPath();
    ctx.moveTo(50, 44); ctx.bezierCurveTo(14, 56, 6, 96, 22, 112);
    ctx.bezierCurveTo(36, 124, 92, 124, 106, 112);
    ctx.bezierCurveTo(122, 96, 114, 56, 78, 44); ctx.closePath();
  };
  const leather = (x0, y0, x1, y1) => lin(ctx, x0, y0, x1, y1, [[0, '#d9a066'], [0.35, '#a8692e'], [0.8, '#6a3c16'], [1, '#3e200a']]);
  fill(ctx, mouth, leather(30, 18, 98, 46));
  // the dark opening, glowing blue inside
  ellipse(ctx, 64, 24, 22, 5); ctx.fillStyle = '#0a0f2a'; ctx.fill();
  ellipse(ctx, 64, 24, 14, 3); ctx.fillStyle = 'rgba(160,190,255,0.9)'; ctx.fill();
  fill(ctx, body, leather(14, 44, 114, 122));
  clip(ctx, body, () => {
    grain(ctx, 8, 40, 112, 84, { seed: 44, n: 600, light: 0.1, dark: 0.2 });
    // gathered folds from the neck
    ctx.strokeStyle = 'rgba(40,18,4,0.45)'; ctx.lineWidth = 2.6;
    for (const k of [-0.7, -0.3, 0.3, 0.7]) { ctx.beginPath(); ctx.moveTo(64 + k * 14, 48); ctx.quadraticCurveTo(64 + k * 40, 64, 64 + k * 46, 86); ctx.stroke(); }
  });
  bevel(ctx, body, 3, 'rgba(255,225,190,0.7)', 'rgba(0,0,0,0.55)', [14, 44, 114, 122]);
  // six: a gold-stitched hexagon with a jade gem at its heart
  ctx.beginPath();
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; const x = 64 + Math.cos(a) * 20; const y = 90 + Math.sin(a) * 18; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.closePath(); ctx.strokeStyle = GOLD[1]; ctx.lineWidth = 3.5; ctx.stroke();
  setGem(ctx, 64, 90, 9, JADE, true, { glintR: 6 });
  // the red drawstring, its knot and tails
  cord(ctx, () => { ctx.beginPath(); ctx.moveTo(46, 44); ctx.quadraticCurveTo(64, 50, 82, 44); }, 8);
  cord(ctx, () => { ctx.beginPath(); ctx.moveTo(80, 46); ctx.quadraticCurveTo(94, 54, 96, 70); }, 5);
  cord(ctx, () => { ctx.beginPath(); ctx.moveTo(80, 46); ctx.quadraticCurveTo(104, 50, 110, 62); }, 5);
  circle(ctx, 80, 46, 5.5); ctx.fillStyle = RED[2]; ctx.fill();
  for (const [x, y] of [[96, 72], [111, 64]]) { circle(ctx, x, y, 4); ctx.fillStyle = metal(ctx, GOLD, x - 4, y - 4, x + 4, y + 4); ctx.fill(); }
  sparkle(ctx, 88, 12, 8, '#ffffff', '#a8c6ff');
}
glove.post = { glow: '#3d6bff', glowBlur: 5, glowAlpha: 0.35 };

/** Titles: a handscroll, brush lines and a red seal, on dark wood rollers */
function scroll(ctx) {
  frame(ctx, { x: 64, y: 64, rot: -0.42, s: 0.94 }, () => {
    const paper = () => { ctx.beginPath(); ctx.rect(-42, -27, 84, 54); };
    fill(ctx, paper, lin(ctx, -42, -27, 42, 27, [[0, IVORY[0]], [0.55, IVORY[1]], [1, IVORY[2]]]));
    clip(ctx, paper, () => {
      grain(ctx, -42, -27, 84, 54, { seed: 52, n: 320, light: 0.08, dark: 0.1 });
      // three columns of brush script, read right to left
      ctx.strokeStyle = '#1a1410'; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
      for (const [x, marks] of [[24, [[-17, -9], [-4, 6], [10, 17]]], [8, [[-17, -4], [3, 16]]], [-8, [[-17, -11], [-5, 2], [8, 12]]]]) {
        for (const [y0, y1] of marks) { ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x + 1.5, y1); ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(x - 5, marks[0][0] + 4); ctx.lineTo(x + 5, marks[0][0] + 3); ctx.stroke();
      }
      // the red seal
      rrect(ctx, -32, 4, 15, 15, 1.5); ctx.fillStyle = '#c0161c'; ctx.fill();
      ctx.strokeStyle = IVORY[1]; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-28, 8); ctx.lineTo(-21, 8); ctx.moveTo(-24.5, 8); ctx.lineTo(-24.5, 16); ctx.moveTo(-28, 15); ctx.lineTo(-21, 15); ctx.stroke();
    });
    // the rollers: dark wood, gold knobs
    for (const x of [-48, 48]) {
      const rod = () => rrect(ctx, x - 7, -33, 14, 66, 6);
      fill(ctx, rod, lin(ctx, x - 7, 0, x + 7, 0, [[0, WOOD[0]], [0.4, WOOD[1]], [1, WOOD[3]]]));
      for (const y of [-40, 33]) { rrect(ctx, x - 5, y, 10, 8, 3); ctx.fillStyle = metal(ctx, GOLD, x - 5, y, x + 5, y + 8); ctx.fill(); }
    }
  });
}

/** Effects: a swirl of blue chi */
function effect(ctx) {
  const cx = 64; const cy = 66;
  const N = 140; const turns = 2.05; const a0 = -0.4;
  const centre = []; const outer = []; const inner = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const a = a0 - t * turns * TAU; // anticlockwise, outward
    const r = 5 + t * 50;
    const w = 3 + t * 15;
    const x = cx + Math.cos(a) * r; const y = cy + Math.sin(a) * r;
    centre.push([x, y]);
    outer.push([cx + Math.cos(a) * (r + w / 2), cy + Math.sin(a) * (r + w / 2)]);
    inner.push([cx + Math.cos(a) * Math.max(0, r - w / 2), cy + Math.sin(a) * Math.max(0, r - w / 2)]);
  }
  const outline = [...outer, ...inner.reverse()];
  const arm = () => poly(ctx, outline);
  fill(ctx, arm, rad(ctx, cx, cy, 60, [[0, '#ffffff'], [0.3, '#a8c6ff'], [0.7, '#3f7bff'], [1, '#1a34c8']]));
  // the arm's rounded head
  const [hx, hy] = centre[N];
  circle(ctx, hx, hy, 9); ctx.fillStyle = '#2a4ae0'; ctx.fill();
  // a bright core running down it
  ctx.beginPath(); centre.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.stroke();
  // shade on the lower-right of each turn
  clip(ctx, arm, () => {
    ctx.fillStyle = lin(ctx, 20, 20, 110, 110, [[0, 'rgba(255,255,255,0.15)'], [0.5, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,40,0.45)']]);
    ctx.fillRect(0, 0, 128, 128);
  });
  sparkle(ctx, 104, 22, 8, '#ffffff', JADE.lit);
  sparkle(ctx, 22, 104, 6, '#d2ffdc');
}
effect.post = { glow: '#3d6bff', glowBlur: 7, glowAlpha: 0.75 };

/** Escape Velocity: a firework rocket in red paper, gold cone and fins */
function rocket(ctx) {
  frame(ctx, { x: 62, y: 66, rot: Math.PI / 4 }, () => {
    // the exhaust: a gold-white plume
    const plume = () => { ctx.beginPath(); ctx.moveTo(-12, 34); ctx.quadraticCurveTo(-14, 56, 0, 74); ctx.quadraticCurveTo(14, 56, 12, 34); ctx.closePath(); };
    fill(ctx, plume, lin(ctx, 0, 34, 0, 74, [[0, '#ffffff'], [0.3, '#ffe592'], [0.7, '#ff7a1a'], [1, 'rgba(255,90,20,0.6)']]));
    // fins
    for (const s of [-1, 1]) {
      const fin = () => poly(ctx, [[s * 14, 8], [s * 28, 30], [s * 26, 40], [s * 14, 32]]);
      fill(ctx, fin, metal(ctx, GOLD, -28, 8, 28, 40));
    }
    // the paper tube
    const tube = () => rrect(ctx, -15, -24, 30, 60, 4);
    fill(ctx, tube, lin(ctx, -15, 0, 15, 0, [[0, RED[0]], [0.3, RED[1]], [0.7, RED[2]], [1, RED[3]]]));
    clip(ctx, tube, () => {
      grain(ctx, -15, -24, 30, 60, { seed: 61, n: 120, light: 0.1, dark: 0.15 });
      for (const y of [-14, 22]) { ctx.fillStyle = metal(ctx, GOLD, -15, y, 15, y + 6); ctx.fillRect(-15, y, 30, 6); }
      // a paper seam
      ctx.fillStyle = 'rgba(80,0,0,0.4)'; ctx.fillRect(6, -24, 1.6, 60);
    });
    // the gold nose cone
    const cone = () => { ctx.beginPath(); ctx.moveTo(-16, -22); ctx.quadraticCurveTo(-12, -46, 0, -58); ctx.quadraticCurveTo(12, -46, 16, -22); ctx.closePath(); };
    fill(ctx, cone, lin(ctx, -16, 0, 16, 0, [[0, GOLD[0]], [0.35, GOLD[1]], [0.75, GOLD[2]], [1, GOLD[3]]]));
    bevel(ctx, cone, 2, 'rgba(255,255,255,0.8)', 'rgba(80,40,0,0.5)', [-16, -58, 16, -22]);
  });
  // sparks thrown off the trail
  sparkle(ctx, 22, 84, 7, '#fff3c0');
  sparkle(ctx, 40, 116, 5, '#fff3c0');
  sparkle(ctx, 10, 112, 5, '#ffd06a');
}
rocket.post = { glow: '#ff9a3a', glowBlur: 6, glowAlpha: 0.5 };

// ---------------------------------------------------------------- Big Trouble: the six elements

/**
 * The Six-Demon Bag's elements. Each has its own colour, used wherever
 * the element shows (its icon, its wisp out of the bag): Lightning the
 * logo's blue, Thunder violet, Rain sky blue, Wind pale jade, Fire
 * red-orange, Smoke grey-green. Opposites (Rain/Fire, Wind/Smoke,
 * Lightning/Thunder) differ in shape as well as colour, so a pair never
 * reads as one icon at 22 px.
 */
const ELEMENT = {
  lightning: { hi: '#ffffff', light: '#c9dcff', mid: '#5f8dff', dark: '#1a34c8', glow: '#3d6bff' },
  thunder: { hi: '#f6ecff', light: '#d6b0ff', mid: '#9a5cf0', dark: '#4a1a8f', glow: '#a45cff' },
  rain: { hi: '#f0fdff', light: '#a6e8ff', mid: '#2fa8f0', dark: '#0a4a9a', glow: '#3fb8ff' },
  wind: { hi: '#ffffff', light: '#d8fff2', mid: '#86e0c6', dark: '#1f7a68', glow: '#7ff0c8' },
  fire: { hi: '#fff6c8', light: '#ffc04a', mid: '#ff6a1a', dark: '#b01e0e', glow: '#ff6a2a' },
  smoke: { hi: '#f4fbf5', light: '#c4e2cc', mid: '#84ae90', dark: '#3a5c46', glow: '#8fb89a' },
};

/**
 * Lightning: a forked bolt, crackling, as it leaps between the logo's
 * hands. The kit's other bolt (`upset`) is a flat cut-out zigzag; this one
 * is the real thing, branching and tapering, so the two never get mixed up.
 */
function elite(ctx) {
  // Fixed points, not random: the zigzag is the silhouette, and at 22 px
  // the silhouette is all there is. Crackle round it was tried first
  // (finish() outlines every arc, so it turned to scribble), then a twig
  // and a long fork (at 22 px they were arms and legs, a little running
  // man). So: one bold zigzag, one short fork.
  const trunk = [[82, 20], [56, 52], [78, 58], [44, 92], [62, 96], [38, 116]];
  const fork = [[62, 96], [80, 104], [88, 116]];
  const body = lin(ctx, 30, 6, 100, 122, [[0, '#ffffff'], [0.3, '#dbe7ff'], [0.65, '#82a6ff'], [1, '#3050e8']]);
  for (const [pts, w0, w1] of [[fork, 11, 2], [trunk, 24, 3]]) {
    ribbonPath(ctx, pts, w0, w1); ctx.fillStyle = body; ctx.fill();
  }
  // a white-hot core down the trunk
  stroke(ctx, () => { ctx.beginPath(); trunk.slice(0, 5).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); }, 'rgba(255,255,255,0.95)', 6);
  // the logo's crackle, kept inside the bolt's glow
  const r = rng(71);
  drawBolt(ctx, boltPoints(r, 74, 58, 98, 52, { steps: 3, amp: 4 }), { ...BOLT, width: 1.6, glowAlpha: 0.25 });
  glint(ctx, 62, 95, 13);
  sparkle(ctx, 104, 74, 7, '#ffffff', '#a8c6ff');
  sparkle(ctx, 24, 34, 6, '#d6e4ff');
}
elite.post = { glow: '#3d6bff', glowBlur: 8, glowAlpha: 0.9 };

/** A cloud as overlapping puffs on a flat base; one path, so it fills as one shape */
function cloudPath(ctx, puffs, [bx, by, bw, bh]) {
  ctx.beginPath();
  for (const [x, y, r] of puffs) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); }
  ctx.roundRect(bx, by, bw, bh, bh / 2);
}

/** Thunder: a black-violet storm cloud, a thunderclap bursting out beneath it */
function ethund(ctx) {
  const E = ELEMENT.thunder;
  // the clap: a burst of violet light where the strike leaves the cloud
  const burst = () => {
    ctx.beginPath();
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU; const rr = i % 2 ? 13 : 26;
      const x = 62 + Math.cos(a) * rr * 1.25; const y = 92 + Math.sin(a) * rr;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
  };
  fill(ctx, burst, rad(ctx, 62, 92, 30, [[0, '#ffffff'], [0.4, E.light], [1, E.mid]]));
  // the strike
  const strike = [[72, 70], [54, 98], [70, 100], [52, 118]];
  ribbonPath(ctx, strike, 20, 3);
  ctx.fillStyle = lin(ctx, 50, 70, 72, 124, [[0, '#ffffff'], [0.45, '#efe2ff'], [1, E.light]]); ctx.fill();
  // the cloud
  const cloud = () => cloudPath(ctx, [[36, 52, 23], [66, 38, 27], [92, 50, 23]], [13, 46, 102, 32]);
  fill(ctx, cloud, lin(ctx, 20, 10, 100, 80, [[0, '#c8c2ee'], [0.3, '#7d74ba'], [0.7, '#40376f'], [1, '#1e1840']]));
  clip(ctx, cloud, () => {
    // lit violet from below by the strike
    ctx.fillStyle = rad(ctx, 64, 88, 44, [[0, rgba(E.mid, 0.9)], [0.5, rgba(E.dark, 0.45)], [1, rgba(E.dark, 0)]]);
    ctx.fillRect(0, 0, 128, 128);
    grain(ctx, 10, 8, 108, 72, { seed: 33, n: 360, light: 0.08, dark: 0.16 });
  });
  bevel(ctx, cloud, 3, 'rgba(240,236,255,0.9)', 'rgba(0,0,0,0.55)', [10, 8, 118, 80]);
}
ethund.post = { glow: '#a45cff', glowBlur: 7, glowAlpha: 0.6 };

/** Rain: three fat drops, driven slantwise by the storm */
function erain(ctx) {
  const E = ELEMENT.rain;
  const slant = 0.42;
  const drops = [[34, 48, 10], [94, 66, 13], [56, 98, 18]];
  // streaks behind each drop, along the way it's falling
  for (const [x, y, r] of drops) {
    const dx = Math.sin(slant); const dy = -Math.cos(slant);
    const sx = x + dx * r * 2.7; const sy = y + dy * r * 2.7;
    ribbonPath(ctx, [[sx, sy], [sx + dx * r * 1.2, sy + dy * r * 1.2]], r * 0.55, 1);
    ctx.fillStyle = rgba(E.light, 0.9); ctx.fill();
  }
  for (const [x, y, r] of drops) {
    frame(ctx, { x, y, rot: slant }, () => {
      const d = () => dropPath(ctx, 0, 0, r);
      fill(ctx, d, rad(ctx, -r * 0.35, -r * 0.4, r * 2.2, [[0, E.hi], [0.25, E.light], [0.6, E.mid], [1, E.dark]]));
      bevel(ctx, d, 2, 'rgba(255,255,255,0.9)', 'rgba(0,30,80,0.55)', [-r, -r * 2.4, r, r]);
      // the drop's highlight
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ellipse(ctx, -r * 0.42, -r * 0.2, r * 0.18, r * 0.42, 0.3); ctx.fill();
    });
  }
}
erain.post = { glow: '#3fb8ff', glowBlur: 6, glowAlpha: 0.55 };

/** Wind: three gusts curling at their ends, a jade leaf blown along */
function ewind(ctx) {
  const E = ELEMENT.wind;
  const gusts = [
    () => { ctx.beginPath(); ctx.moveTo(18, 42); ctx.lineTo(70, 42); ctx.arc(70, 28, 14, Math.PI / 2, -Math.PI * 0.95, true); },
    () => { ctx.beginPath(); ctx.moveTo(15, 66); ctx.lineTo(94, 66); ctx.arc(94, 50, 16, Math.PI / 2, -Math.PI * 0.95, true); },
    () => { ctx.beginPath(); ctx.moveTo(24, 88); ctx.lineTo(70, 88); ctx.arc(70, 99, 11, -Math.PI / 2, Math.PI * 0.95, false); },
  ];
  for (const g of gusts) {
    stroke(ctx, g, E.dark, 14);
    stroke(ctx, g, E.mid, 10);
    ctx.save(); ctx.translate(-1.5, -2); stroke(ctx, g, E.light, 5); ctx.restore();
    ctx.save(); ctx.translate(-2, -3); stroke(ctx, g, 'rgba(255,255,255,0.9)', 1.8); ctx.restore();
  }
  // a jade leaf caught in it
  frame(ctx, { x: 108, y: 92, rot: -0.7 }, () => {
    const leaf = () => { ctx.beginPath(); ctx.moveTo(-14, 0); ctx.quadraticCurveTo(0, -11, 14, 0); ctx.quadraticCurveTo(0, 11, -14, 0); ctx.closePath(); };
    fill(ctx, leaf, lin(ctx, -14, -8, 14, 8, [[0, JADE.hi], [0.4, JADE.lit], [1, JADE.dark]]));
    stroke(ctx, () => { ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(12, 0); }, rgba(JADE.dark, 0.8), 1.6);
  });
}
ewind.post = { glow: '#7ff0c8', glowBlur: 5, glowAlpha: 0.35 };

/** Fire: a red-orange flame, the streak's blue spirit flame turned to real fire (and mirrored) */
function efire(ctx) {
  frame(ctx, { x: 128, sx: -1, sy: 1 }, () => {
    const outer = () => flamePath(ctx, 64, 118, 92, 112);
    fill(ctx, outer, rad(ctx, 64, 92, 90, [[0, '#fff3b0'], [0.3, '#ffb03a'], [0.62, '#f2491a'], [0.88, '#b4160e'], [1, '#6e0808']], 60, 104, 4));
    clip(ctx, outer, () => smoke(ctx, 20, 70, 88, 50, { seed: 4, n: 5, colours: ['#7a0a06'], alpha: 0.4 }));
    fill(ctx, () => flamePath(ctx, 64, 116, 60, 76), rad(ctx, 64, 100, 60, [[0, '#ffffff'], [0.4, '#ffe592'], [1, '#ff8a2a']]));
    fill(ctx, () => flamePath(ctx, 64, 114, 30, 40), '#fffbe8');
  });
  // embers
  sparkle(ctx, 16, 40, 7, '#ffe592', '#ff7a1a');
  sparkle(ctx, 112, 26, 6, '#ffe592');
}
efire.post = { glow: '#ff6a2a', glowBlur: 7, glowAlpha: 0.7 };

/**
 * Smoke: a coiling bank of grey-green smoke, drawn as the old auspicious
 * cloud scroll (every puff a coil), drifting off in two bands. Earlier
 * tries, billowing puffs and then rising ribbons over an incense burner,
 * both read as a plant in a pot at 22 px.
 */
function esmoke(ctx) {
  const E = ELEMENT.smoke;
  const smokeFill = (y0, y1) => lin(ctx, 20, y0, 100, y1, [[0, E.hi], [0.3, E.light], [0.72, E.mid], [1, E.dark]]);
  // the drifting bands under it
  for (const [pts, w] of [[[[15, 92], [34, 88], [58, 94], [84, 90], [104, 94]], 11], [[[34, 110], [58, 106], [84, 111], [112, 106]], 9]]) {
    const line = () => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); };
    stroke(ctx, line, E.mid, w);
    ctx.save(); ctx.translate(-1, -1.5); stroke(ctx, line, E.light, w * 0.45); ctx.restore();
  }
  // the bank: coils on a rounded base, filled as one shape
  const coils = [[40, 58, 21], [74, 42, 26], [98, 68, 17]];
  const bank = () => cloudPath(ctx, coils, [16, 62, 96, 22]);
  fill(ctx, bank, smokeFill(16, 84));
  // each coil's groove: a spiral, dark with a lit lip
  for (const [x, y, r] of coils) {
    const spiral = () => {
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const t = i / 40; const a = -Math.PI * 0.25 + t * TAU * 1.25; const rr = r * (0.12 + t * 0.62);
        const px = x + Math.cos(a) * rr; const py = y + Math.sin(a) * rr;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
    };
    clip(ctx, bank, () => {
      ctx.save(); ctx.translate(1.2, 1.4); stroke(ctx, spiral, 'rgba(255,255,255,0.55)', 2.4); ctx.restore();
      stroke(ctx, spiral, rgba(E.dark, 0.85), 3.4);
    });
  }
  clip(ctx, bank, () => grain(ctx, 16, 14, 100, 72, { seed: 37, n: 300, light: 0.08, dark: 0.12 }));
  bevel(ctx, bank, 3, 'rgba(250,255,250,0.85)', 'rgba(0,0,0,0.45)', [16, 14, 116, 84]);
}
esmoke.post = { glow: '#8fb89a', glowBlur: 5, glowAlpha: 0.3 };

// ---------------------------------------------------------------- Big Trouble: magic and items

/** Chi: yin and yang, the light half luminous jade, the dark half the logo's starry nebula */
function chi(ctx) {
  const cx = 64; const cy = 64; const R = 54; const h = R / 2;
  const disc = () => circle(ctx, cx, cy, R);
  const yang = () => {
    ctx.beginPath();
    ctx.moveTo(cx, cy - R);
    ctx.arc(cx, cy, R, -Math.PI / 2, Math.PI / 2, true);
    ctx.arc(cx, cy + h, h, Math.PI / 2, -Math.PI / 2, true);
    ctx.arc(cx, cy - h, h, Math.PI / 2, Math.PI * 1.5, false);
    ctx.closePath();
  };
  // the dark half: night and smoke
  fill(ctx, disc, '#030805');
  clip(ctx, disc, () => {
    smoke(ctx, cx - R, cy - R, R * 2, R * 2, { seed: 9, n: 10, colours: ['#1f5a32', '#173a24', '#1d3f6a'], alpha: 0.6, rMin: 10, rMax: 24 });
    specks(ctx, cx - R, cy - R, R * 2, R * 2, { seed: 4, n: 26, colour: '#e8fff0', max: 1.5 });
  });
  // the light half: glowing jade
  fill(ctx, yang, rad(ctx, cx - 18, cy - 10, R * 1.3, [[0, JADE.hi], [0.3, JADE.lit], [0.7, JADE.mid], [1, JADE.dark]]));
  clip(ctx, yang, () => grain(ctx, cx - R, cy - R, R * 2, R * 2, { seed: 12, n: 260, light: 0.12, dark: 0.12 }));
  // the eyes: a dark seed in the light, a glowing one in the dark
  circle(ctx, cx, cy + h, 9); ctx.fillStyle = '#04100a'; ctx.fill();
  circle(ctx, cx, cy - h, 9); ctx.fillStyle = rad(ctx, cx - 2, cy - h - 2, 10, [[0, '#ffffff'], [0.4, JADE.lit], [1, JADE.mid]]); ctx.fill();
  // a pale rim so the dark side holds its edge on the dark theme
  bevel(ctx, disc, 3, 'rgba(222,240,226,0.9)', 'rgba(0,0,0,0.6)', [cx - R, cy - R, cx + R, cy + R]);
  ctx.save(); clip(ctx, disc, () => stroke(ctx, disc, rgba(JADE.lit, 0.55), 4)); ctx.restore();
  glint(ctx, 38, 34, 11);
}
chi.post = { glow: JADE.lit, glowBlur: 7, glowAlpha: 0.7 };

/**
 * The Six-Demon Bag, open: one wisp for each element fanning out of it.
 * The Glovebox's icon (`glove`) is also a bag (brown leather, one blue
 * bolt), and both head sections of the same games card, so this one is
 * black silk stitched in gold, and its six colours do the talking.
 */
function bag(ctx) {
  const order = ['fire', 'thunder', 'lightning', 'rain', 'wind', 'smoke'];
  // the ruffled mouth, its opening glowing white
  const mouth = () => {
    ctx.beginPath();
    ctx.moveTo(46, 76); ctx.bezierCurveTo(34, 72, 30, 62, 36, 56);
    ctx.quadraticCurveTo(44, 62, 50, 56); ctx.quadraticCurveTo(57, 62, 64, 55); ctx.quadraticCurveTo(71, 62, 78, 56); ctx.quadraticCurveTo(84, 62, 92, 56);
    ctx.bezierCurveTo(98, 62, 94, 72, 82, 76); ctx.closePath();
  };
  const silk = (x0, y0, x1, y1) => lin(ctx, x0, y0, x1, y1, [[0, '#6a6fa0'], [0.3, '#34386a'], [0.75, '#16183a'], [1, '#0a0b1e']]);
  fill(ctx, mouth, silk(30, 54, 98, 76));
  ellipse(ctx, 64, 62, 22, 5); ctx.fillStyle = '#ffffff'; ctx.fill();
  // the six wisps, a dark rim on each so neighbours stay apart
  order.forEach((k, i) => {
    const E = ELEMENT[k];
    const L = 54 - Math.abs(i - 2.5) * 4;
    frame(ctx, { x: 64, y: 64, rot: (i - 2.5) * 0.38 }, () => {
      const w = () => wispPath(ctx, L, 21);
      stroke(ctx, w, '#06070c', 4);
      fill(ctx, w, lin(ctx, 0, -L, 0, 0, [[0, E.light], [0.4, E.mid], [1, E.dark]]));
      fill(ctx, () => { ctx.save(); ctx.translate(-2, -6); wispPath(ctx, L * 0.62, 8); ctx.restore(); }, rgba(E.hi, 0.85));
    });
  });
  // the bag
  const body = () => {
    ctx.beginPath();
    ctx.moveTo(46, 74); ctx.bezierCurveTo(14, 84, 10, 108, 24, 116);
    ctx.bezierCurveTo(40, 121, 88, 121, 104, 116);
    ctx.bezierCurveTo(118, 108, 114, 84, 82, 74); ctx.closePath();
  };
  fill(ctx, body, silk(14, 74, 114, 122));
  clip(ctx, body, () => {
    grain(ctx, 10, 70, 108, 54, { seed: 46, n: 360, light: 0.08, dark: 0.16 });
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 2.4;
    for (const k of [-0.7, -0.25, 0.25, 0.7]) { ctx.beginPath(); ctx.moveTo(64 + k * 18, 78); ctx.quadraticCurveTo(64 + k * 42, 90, 64 + k * 48, 112); ctx.stroke(); }
    // gold-stitched waves along the hem
    ctx.beginPath();
    for (let x = 14; x <= 114; x += 2) { const y = 104 + 3.5 * Math.sin((x / 16) * TAU); x === 14 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.strokeStyle = GOLD[1]; ctx.lineWidth = 3; ctx.setLineDash([5, 3]); ctx.stroke(); ctx.setLineDash([]);
  });
  bevel(ctx, body, 3, 'rgba(214,218,250,0.75)', 'rgba(0,0,0,0.6)', [14, 74, 114, 122]);
  // the red drawstring, knot and gold beads
  cord(ctx, () => { ctx.beginPath(); ctx.moveTo(42, 76); ctx.quadraticCurveTo(64, 82, 86, 76); }, 8);
  cord(ctx, () => { ctx.beginPath(); ctx.moveTo(84, 78); ctx.quadraticCurveTo(98, 84, 100, 98); }, 5);
  circle(ctx, 84, 78, 5.5); ctx.fillStyle = RED[2]; ctx.fill();
  circle(ctx, 100, 100, 4.5); ctx.fillStyle = metal(ctx, GOLD, 96, 96, 104, 104); ctx.fill();
}
bag.post = { glow: '#ffffff', glowBlur: 6, glowAlpha: 0.3 };

/**
 * Black Blood of the Earth: Egg Shen's potion in a little snuff bottle,
 * black glass with the brew glowing green deep inside, gold mounts and a
 * coral stopper. (The potions game's icon is already a blue gourd, so
 * this one is a different bottle in different colours.)
 */
function bblood(ctx) {
  frame(ctx, { x: 64, y: 68, rot: 0.12 }, () => {
    const body = () => {
      ctx.beginPath();
      ctx.moveTo(-10, -36); ctx.lineTo(10, -36); ctx.lineTo(10, -30);
      ctx.bezierCurveTo(34, -28, 40, -12, 38, 8);
      ctx.bezierCurveTo(36, 30, 26, 42, 16, 46);
      ctx.lineTo(-16, 46);
      ctx.bezierCurveTo(-26, 42, -36, 30, -38, 8);
      ctx.bezierCurveTo(-40, -12, -34, -28, -10, -30);
      ctx.closePath();
    };
    fill(ctx, body, '#020604');
    clip(ctx, body, () => {
      ctx.fillStyle = rad(ctx, -2, 12, 34, [[0, '#c8ffd6'], [0.22, '#46e07e'], [0.55, '#0d6a2d'], [1, 'rgba(2,12,6,0)']]);
      ctx.fillRect(-40, -40, 80, 90);
      smoke(ctx, -36, -18, 72, 64, { seed: 23, n: 7, colours: ['#010302', '#08240f'], alpha: 0.75, rMin: 7, rMax: 14 });
      specks(ctx, -30, -20, 60, 60, { seed: 8, n: 16, colour: '#d2ffdc', max: 1.4 });
    });
    glassRim(ctx, body, 3);
    // gold filigree: a lobed medallion on the front
    ctx.beginPath();
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * TAU; const rr = 19 + 3.5 * Math.cos(a * 4);
      const x = Math.cos(a) * rr; const y = 8 + Math.sin(a) * rr;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath(); ctx.strokeStyle = GOLD[3]; ctx.lineWidth = 4.5; ctx.stroke();
    ctx.strokeStyle = GOLD[1]; ctx.lineWidth = 2.5; ctx.stroke();
    // the glass's gloss
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.ellipse(0, 8, 32, 34, 0, Math.PI * 1.08, Math.PI * 1.32); ctx.stroke();
    // gold foot, collar, and the stopper's coral bead
    for (const [x, y, w, h] of [[-19, 43, 38, 8], [-14, -41, 28, 8]]) {
      rrect(ctx, x, y, w, h, 3); ctx.fillStyle = metal(ctx, GOLD, x, y, x + w, y + h); ctx.fill();
    }
    ctx.beginPath(); ctx.arc(0, -41, 11, Math.PI, 0); ctx.closePath();
    ctx.fillStyle = metal(ctx, GOLD, -11, -52, 11, -41); ctx.fill();
    circle(ctx, 0, -55, 6.5); ctx.fillStyle = rad(ctx, -2, -57, 8, [[0, RED[0]], [0.5, RED[1]], [1, RED[3]]]); ctx.fill();
  });
  glint(ctx, 46, 50, 9);
}
bblood.post = { glow: '#3fdc78', glowBlur: 7, glowAlpha: 0.6 };

/** Jade Charm: a carved jade bi disc on a red cord, knotted above, a tassel below */
function jade(ctx) {
  const cx = 64; const cy = 64; const R = 38; const h = 12;
  const disc = () => { ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.moveTo(cx + h, cy); ctx.arc(cx, cy, h, 0, TAU, true); };
  // the cord through the hole, behind the disc
  cord(ctx, () => { ctx.beginPath(); ctx.moveTo(cx, 20); ctx.lineTo(cx, 108); }, 7);
  fill(ctx, disc, rad(ctx, cx - 14, cy - 16, R * 1.5, [[0, JADE.hi], [0.25, JADE.lit], [0.6, JADE.mid], [1, JADE.dark]]));
  clip(ctx, disc, () => {
    grain(ctx, cx - R, cy - R, R * 2, R * 2, { seed: 27, n: 360, light: 0.12, dark: 0.14 });
    // the grain pattern: rows of raised curls between two carved rings
    for (const rr of [h + 5, R - 6]) {
      ctx.save(); ctx.translate(1, 1); stroke(ctx, () => circle(ctx, cx, cy, rr), 'rgba(230,255,236,0.5)', 1.6); ctx.restore();
      stroke(ctx, () => circle(ctx, cx, cy, rr), rgba(JADE.dark, 0.8), 1.8);
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU + 0.2; const rr = (h + R) / 2 + 0.5;
      const x = cx + Math.cos(a) * rr; const y = cy + Math.sin(a) * rr;
      circle(ctx, x + 0.8, y + 0.8, 3.4); ctx.fillStyle = rgba(JADE.dark, 0.6); ctx.fill();
      circle(ctx, x - 0.4, y - 0.4, 2.8); ctx.fillStyle = rgba(JADE.hi, 0.75); ctx.fill();
    }
  });
  bevel(ctx, disc, 3, 'rgba(240,255,244,0.9)', 'rgba(0,40,10,0.6)', [cx - R, cy - R, cx + R, cy + R]);
  // the cord comes over the top of the disc into the hole
  cord(ctx, () => { ctx.beginPath(); ctx.moveTo(cx - 3, 18); ctx.quadraticCurveTo(cx - 6, 40, cx - 4, cy - h + 2); }, 6);
  cord(ctx, () => { ctx.beginPath(); ctx.moveTo(cx + 3, 18); ctx.quadraticCurveTo(cx + 6, 40, cx + 4, cy - h + 2); }, 6);
  // the knot above, a hanging loop, the tassel below
  stroke(ctx, () => { ctx.beginPath(); ctx.ellipse(cx, 14, 6, 5, 0, Math.PI * 0.85, Math.PI * 2.15); }, RED[2], 4);
  diamond(ctx, cx, 21, 8); ctx.fillStyle = RED[2]; ctx.fill();
  ctx.strokeStyle = RED[0]; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(cx - 4, 18); ctx.lineTo(cx + 3, 25); ctx.stroke();
  tassel(ctx, cx, 102, 10, true);
  glint(ctx, 40, 40, 10);
}
jade.post = { glow: JADE.lit, glowBlur: 6, glowAlpha: 0.45 };

/**
 * The Pork-Chop Express: Jack Burton's big rig, head on. What says "truck"
 * at 22 px is the tall chrome grille, the twin exhaust stacks and the black
 * tyres under a wide cab, so those are drawn big.
 */
function truck(ctx) {
  // exhaust stacks either side of the cab
  for (const x of [12, 107]) {
    const st = () => rrect(ctx, x, 8, 9, 70, 4);
    fill(ctx, st, metal(ctx, SILVER, x, 8, x + 9, 78));
    rrect(ctx, x - 1.5, 6, 12, 7, 3); ctx.fillStyle = IRON[3]; ctx.fill();
  }
  // tyres
  for (const x of [16, 88]) {
    rrect(ctx, x, 100, 24, 20, 5); ctx.fillStyle = lin(ctx, 0, 100, 0, 120, [[0, '#3a3c40'], [1, '#0a0b0c']]); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; for (let y = 104; y < 118; y += 5) ctx.fillRect(x + 3, y, 18, 1.6);
  }
  // the cab
  const cab = () => rrect(ctx, 22, 12, 84, 54, 9);
  fill(ctx, cab, lin(ctx, 22, 12, 106, 66, [[0, RED[0]], [0.3, RED[1]], [0.7, RED[2]], [1, RED[3]]]));
  clip(ctx, cab, () => grain(ctx, 22, 12, 84, 54, { seed: 63, n: 220, light: 0.08, dark: 0.14 }));
  bevel(ctx, cab, 2.5, rgba(RED[0], 0.9), 'rgba(0,0,0,0.5)', [22, 12, 106, 66]);
  // roof marker lights
  for (const x of [44, 56, 68, 80]) { rrect(ctx, x - 3, 14, 7, 4, 1.5); ctx.fillStyle = '#ffc64d'; ctx.fill(); }
  // the split windscreen under a dark visor
  ctx.fillStyle = '#2a0408'; ctx.fillRect(26, 20, 76, 4);
  for (const x of [28, 66]) {
    const pane = () => rrect(ctx, x, 24, 34, 26, 3);
    fill(ctx, pane, lin(ctx, x, 24, x + 34, 50, [[0, '#8fb4d8'], [0.35, '#30507a'], [1, '#0a1428']]));
    clip(ctx, pane, () => { poly(ctx, [[x + 6, 24], [x + 16, 24], [x + 4, 50], [x - 6, 50]]); ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fill(); });
  }
  // fenders over the wheels, headlights in them
  for (const side of [-1, 1]) {
    const fx = 64 + side * 44;
    const fender = () => { ctx.beginPath(); ctx.moveTo(fx - side * 30, 98); ctx.lineTo(fx - side * 30, 70); ctx.quadraticCurveTo(fx + side * 2, 66, fx + side * 6, 98); ctx.closePath(); };
    fill(ctx, fender, lin(ctx, 10, 66, 118, 98, [[0, RED[1]], [0.5, RED[2]], [1, RED[3]]]));
    bevel(ctx, fender, 2, rgba(RED[0], 0.8), 'rgba(0,0,0,0.5)', [10, 66, 118, 98]);
    const hx = 64 + side * 38;
    circle(ctx, hx, 82, 8.5); ctx.fillStyle = metal(ctx, SILVER, hx - 9, 73, hx + 9, 91); ctx.fill();
    circle(ctx, hx, 82, 5.5); ctx.fillStyle = rad(ctx, hx - 1.5, 80.5, 7, [[0, '#ffffff'], [0.5, '#fff3c0'], [1, '#e0a83a']]); ctx.fill();
  }
  // the big chrome grille
  const grille = () => rrect(ctx, 42, 56, 44, 48, 4);
  fill(ctx, grille, metal(ctx, SILVER, 42, 56, 86, 104));
  for (let y = 62; y < 100; y += 6) { ctx.fillStyle = 'rgba(20,24,30,0.75)'; ctx.fillRect(47, y, 34, 3); }
  bevel(ctx, grille, 2, 'rgba(255,255,255,0.9)', 'rgba(0,0,0,0.5)', [42, 56, 86, 104]);
  // chrome bumper, and a jade gem for a hood ornament
  const bumper = () => rrect(ctx, 10, 96, 108, 10, 4);
  fill(ctx, bumper, metal(ctx, SILVER, 10, 96, 118, 106));
  bevel(ctx, bumper, 1.5, 'rgba(255,255,255,0.9)', 'rgba(0,0,0,0.5)', [10, 96, 118, 106]);
  setGem(ctx, 64, 54, 6, JADE, true, { glintR: 5 });
  glint(ctx, 34, 28, 8);
}

/**
 * A head-and-shoulders figure: (cx, hy) the middle of the head, r its
 * radius, the shoulders rounding off at y 116 (inside the outline's
 * margin). `shirt` is a ramp (light → dark); `hair(x, y, r)` paints over
 * the head. A dark rim goes round it first, so a figure in front stands
 * off the one behind.
 */
function figure(ctx, cx, hy, r, shirt, hair) {
  const neckY = hy + r * 1.05; const base = 116; const hw = r * 2.05;
  const shoulders = () => {
    ctx.beginPath();
    ctx.moveTo(cx - hw + 6, base);
    ctx.quadraticCurveTo(cx - hw, base, cx - hw, base - 8);
    ctx.bezierCurveTo(cx - hw, neckY + r * 1.1, cx - r * 1.4, neckY + r * 0.35, cx, neckY + r * 0.35);
    ctx.bezierCurveTo(cx + r * 1.4, neckY + r * 0.35, cx + hw, neckY + r * 1.1, cx + hw, base - 8);
    ctx.quadraticCurveTo(cx + hw, base, cx + hw - 6, base);
    ctx.closePath();
  };
  const head = () => ellipse(ctx, cx, hy, r * 0.9, r);
  const skin = lin(ctx, cx - r, hy - r, cx + r, hy + r, [[0, '#ffdcb8'], [0.4, '#eeb07a'], [1, '#a85e24']]);
  for (const p of [shoulders, head]) stroke(ctx, p, OUT, 7);
  fill(ctx, shoulders, lin(ctx, cx - hw, neckY, cx + hw, base, [[0, shirt[0]], [0.35, shirt[1]], [1, shirt[3]]]));
  clip(ctx, shoulders, () => grain(ctx, cx - hw, neckY, hw * 2, base - neckY, { seed: Math.round(cx), n: 160, light: 0.08, dark: 0.14 }));
  bevel(ctx, shoulders, 2.5, rgba(shirt[0], 0.9), 'rgba(0,0,0,0.5)', [cx - hw, neckY, cx + hw, base]);
  // the neck
  rrect(ctx, cx - r * 0.38, hy + r * 0.6, r * 0.76, r * 0.8, r * 0.2); ctx.fillStyle = '#c47a3e'; ctx.fill();
  fill(ctx, head, skin);
  clip(ctx, head, () => hair(cx, hy, r));
}

/**
 * Sidekick: the pact's two, one in front. Behind, the hero (Jack Burton:
 * the big one, red shirt, a mullet); in front, the sidekick (Wang Chi:
 * jade jacket, gold collar). A fist bump was tried first: two fists side
 * by side only fill a strip of the square, and at 22 px it was a tan pill.
 */
function sidek(ctx) {
  figure(ctx, 80, 36, 18, RED, (x, y, r) => {
    // the mullet: a dark cap over the crown, a little longer at the back
    ctx.fillStyle = lin(ctx, x - r, y - r, x + r, y, [[0, '#7a4a28'], [1, '#2a1406']]);
    ctx.beginPath(); ctx.ellipse(x, y - r * 0.42, r * 1.2, r * 0.68, 0, Math.PI, 0); ctx.fill();
    ctx.fillRect(x + r * 0.62, y - r * 0.5, r * 0.4, r * 1.2);
  });
  figure(ctx, 44, 62, 15.5, ['#b8f5c8', JADE.lit, JADE.mid, JADE.dark], (x, y, r) => {
    ctx.fillStyle = lin(ctx, x - r, y - r, x + r, y, [[0, '#3a3a40'], [1, '#08080a']]);
    ctx.beginPath(); ctx.ellipse(x, y - r * 0.38, r * 1.15, r * 0.7, 0, Math.PI, 0); ctx.fill();
  });
  // Wang Chi's gold mandarin collar
  stroke(ctx, () => { ctx.beginPath(); ctx.moveTo(36, 80); ctx.quadraticCurveTo(44, 85, 52, 80); }, GOLD[1], 4);
  sparkle(ctx, 18, 36, 8, '#ffffff', JADE.lit);
}

/** The Wang Chi: a jian with a jade blade, held high */
function wang(ctx) {
  frame(ctx, { x: 66, y: 60, rot: 0.75 }, () => {
    const blade = () => poly(ctx, [[0, -64], [10, -50], [10, 18], [-10, 18], [-10, -50]]);
    fill(ctx, blade, lin(ctx, -10, 0, 10, 0, [[0, JADE.hi], [0.42, JADE.lit], [0.5, JADE.mid], [1, JADE.dark]]));
    clip(ctx, blade, () => grain(ctx, -10, -64, 20, 82, { seed: 77, n: 120, light: 0.12, dark: 0.12 }));
    // the ridge down the middle catches the light
    stroke(ctx, () => { ctx.beginPath(); ctx.moveTo(0, -58); ctx.lineTo(0, 14); }, 'rgba(240,255,244,0.7)', 1.6);
    bevel(ctx, blade, 2, 'rgba(240,255,244,0.9)', 'rgba(0,40,10,0.55)', [-10, -64, 10, 18]);
    // guard, red-corded grip, pommel
    const guard = () => { ctx.beginPath(); ctx.moveTo(-22, 18); ctx.quadraticCurveTo(0, 10, 22, 18); ctx.lineTo(17, 28); ctx.quadraticCurveTo(0, 23, -17, 28); ctx.closePath(); };
    fill(ctx, guard, metal(ctx, GOLD, -22, 10, 22, 28));
    rrect(ctx, -6.5, 26, 13, 24, 3); ctx.fillStyle = lin(ctx, -6, 0, 6, 0, [[0, WOOD[1]], [1, WOOD[3]]]); ctx.fill();
    for (let y = 29; y < 48; y += 5) { ctx.fillStyle = RED[2]; ctx.fillRect(-6.5, y, 13, 2.8); ctx.fillStyle = rgba(RED[0], 0.7); ctx.fillRect(-6.5, y, 13, 1); }
    circle(ctx, 0, 55, 8); ctx.fillStyle = metal(ctx, GOLD, -8, 47, 8, 63); ctx.fill();
  });
  // the tassel off the pommel
  cord(ctx, () => { ctx.beginPath(); ctx.moveTo(25, 102); ctx.quadraticCurveTo(18, 102, 18, 106); }, 5);
  tassel(ctx, 18, 104, 5, true);
  glint(ctx, 98, 26, 12);
  sparkle(ctx, 30, 26, 8, '#ffffff', JADE.lit);
}
wang.post = { glow: JADE.lit, glowBlur: 7, glowAlpha: 0.65 };

/**
 * The Jack Burton: a thrown knife in flight ("It's all in the reflexes"),
 * motion streaks behind it. The streaks stand clear of the handle: joined
 * to it, they read as a broom's bristles at 22 px.
 */
function jack(ctx) {
  frame(ctx, { x: 68, y: 60, rot: -0.55, s: 0.92 }, () => {
    for (const [y, x0, x1, w] of [[-14, -70, -50, 6], [2, -74, -48, 8], [17, -66, -50, 6]]) {
      ribbonPath(ctx, [[x0, y], [x1, y]], 1.5, w);
      ctx.fillStyle = lin(ctx, x0, 0, x1, 0, [[0, 'rgba(200,220,255,0.55)'], [1, '#f2f7ff']]); ctx.fill();
    }
    // the handle: dark wood, gold rivets, a gold bolster
    const handle = () => rrect(ctx, -36, -10, 36, 20, 8);
    fill(ctx, handle, lin(ctx, 0, -10, 0, 10, [[0, '#6a4a34'], [0.45, '#2e1c10'], [1, '#120a06']]));
    for (const x of [-26, -13]) { circle(ctx, x, -0.5, 3.2); ctx.fillStyle = metal(ctx, GOLD, x - 3, -3.5, x + 3, 2.5); ctx.fill(); }
    rrect(ctx, -4, -14, 8, 28, 2); ctx.fillStyle = metal(ctx, GOLD, -4, -14, 4, 14); ctx.fill();
    // the blade: a straight spine, the edge sweeping up to the point
    const blade = () => { ctx.beginPath(); ctx.moveTo(3, -12); ctx.lineTo(38, -12); ctx.quadraticCurveTo(54, -10, 60, 0); ctx.quadraticCurveTo(44, 14, 3, 14); ctx.closePath(); };
    fill(ctx, blade, lin(ctx, 0, -12, 0, 14, [[0, '#ffffff'], [0.3, SILVER[1]], [0.62, SILVER[3]], [0.78, '#dfe8f0'], [1, '#ffffff']]));
    stroke(ctx, () => { ctx.beginPath(); ctx.moveTo(8, -5); ctx.lineTo(40, -5); }, 'rgba(40,50,60,0.45)', 1.8);
    bevel(ctx, blade, 1.5, 'rgba(255,255,255,0.9)', 'rgba(0,0,0,0.45)', [3, -12, 60, 14]);
  });
  glint(ctx, 110, 34, 10);
}

/** One gold cash coin lying flat, seen from a little above: top face and milled edge */
function flatCoin(ctx, cx, cy, rx, ry, th) {
  const side = () => {
    ctx.beginPath();
    ctx.moveTo(cx + rx, cy); ctx.lineTo(cx + rx, cy + th);
    ctx.ellipse(cx, cy + th, rx, ry, 0, 0, Math.PI);
    ctx.lineTo(cx - rx, cy);
    ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, 0, true);
    ctx.closePath();
  };
  fill(ctx, side, lin(ctx, cx - rx, 0, cx + rx, 0, [[0, GOLD[2]], [0.3, GOLD[1]], [0.7, GOLD[3]], [1, GOLD[4]]]));
  clip(ctx, side, () => { ctx.fillStyle = 'rgba(80,45,0,0.35)'; for (let x = cx - rx + 3; x < cx + rx; x += 4) ctx.fillRect(x, cy, 1.4, th + ry); });
  const face = () => ellipse(ctx, cx, cy, rx, ry);
  fill(ctx, face, lin(ctx, cx - rx, cy - ry, cx + rx, cy + ry, [[0, GOLD[0]], [0.4, GOLD[1]], [1, GOLD[2]]]));
  stroke(ctx, () => ellipse(ctx, cx, cy, rx * 0.78, ry * 0.72), rgba(GOLD[3], 0.7), 1.6);
  rrect(ctx, cx - rx * 0.2, cy - ry * 0.32, rx * 0.4, ry * 0.64, 1.5); ctx.fillStyle = '#2a1802'; ctx.fill();
}

/** Backing a fighter: a stack of gold cash coins and the paper chit that says who you backed */
function back(ctx) {
  // the wager chit, standing behind the stack
  frame(ctx, { x: 86, y: 46, rot: 0.2 }, () => {
    const chit = () => rrect(ctx, -22, -36, 44, 72, 3);
    fill(ctx, chit, lin(ctx, -22, -36, 22, 36, [[0, IVORY[0]], [0.55, IVORY[1]], [1, IVORY[2]]]));
    clip(ctx, chit, () => grain(ctx, -22, -36, 44, 72, { seed: 58, n: 200, light: 0.08, dark: 0.1 }));
    bevel(ctx, chit, 2, 'rgba(255,255,255,0.9)', 'rgba(80,60,20,0.45)', [-22, -36, 22, 36]);
    stroke(ctx, () => rrect(ctx, -16, -30, 32, 60, 2), rgba(RED[2], 0.85), 2.2);
    // a name brushed in black, the house's red seal under it
    ctx.strokeStyle = '#1a1410'; ctx.lineWidth = 3.6; ctx.lineCap = 'round';
    for (const [a, b, c, d] of [[-8, -22, 8, -22], [0, -26, 0, -6], [-9, -12, 9, -12], [-7, -4, 7, -4]]) { ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke(); }
    rrect(ctx, -9, 6, 18, 18, 2); ctx.fillStyle = '#c0161c'; ctx.fill();
    ctx.strokeStyle = IVORY[1]; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(-5, 11); ctx.lineTo(5, 11); ctx.moveTo(0, 9); ctx.lineTo(0, 21); ctx.moveTo(-5, 19); ctx.lineTo(5, 19); ctx.stroke();
  });
  // the stack, a little askew
  for (const [x, y] of [[50, 100], [45, 91], [52, 82], [47, 73]]) flatCoin(ctx, x, y, 32, 10, 9);
  glint(ctx, 36, 70, 9);
}

// ---------------------------------------------------------------- Big Trouble: bosses and happenings

/**
 * The Wild Man: a huge shaggy face, eyes burning amber, roaring. The fur
 * hangs in long locks, longest at the jaw, with a fringe over the brow:
 * a mane combed out evenly all round read as a lion.
 */
function wildmn(ctx) {
  const cx = 64; const cy = 60;
  const r = rng(91);
  const locks = [];
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * TAU - Math.PI / 2;
    const down = Math.max(0, Math.sin(a)); // 0 at the crown, 1 at the jaw
    const tip = i % 2 === 0;
    const rr = tip ? 48 + down * 8 + (r() - 0.5) * 5 : 41 + down * 4;
    // locks hang: their tips swing downward
    locks.push([cx + Math.cos(a) * rr * 0.96, cy + Math.sin(a) * rr + (tip ? 4 + down * 3 : 0)]);
  }
  const mane = () => poly(ctx, locks);
  fill(ctx, mane, lin(ctx, 12, 8, 116, 122, [[0, '#d89656'], [0.3, '#9a5826'], [0.7, '#5a2c0c'], [1, '#2a1204']]));
  clip(ctx, mane, () => {
    // strands, hanging
    for (let i = 0; i < 80; i++) {
      const x = 14 + r() * 100; const y = 8 + r() * 100; const L = 8 + r() * 12;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + (x - cx) * 0.08, y + L * 0.6, x + (x - cx) * 0.12, y + L);
      ctx.strokeStyle = i % 3 ? 'rgba(40,16,2,0.5)' : 'rgba(255,214,160,0.45)'; ctx.lineWidth = 2; ctx.stroke();
    }
  });
  bevel(ctx, mane, 3, 'rgba(255,226,186,0.8)', 'rgba(0,0,0,0.55)', [8, 8, 120, 122]);
  // the face: dark leathery hide
  const face = () => { ctx.beginPath(); ctx.ellipse(cx, cy + 10, 32, 36, 0, 0, TAU); };
  fill(ctx, face, rad(ctx, cx - 10, cy - 10, 50, [[0, '#7a6a5c'], [0.5, '#4a3c32'], [1, '#221a14']]));
  clip(ctx, face, () => grain(ctx, cx - 32, cy - 30, 64, 72, { seed: 5, n: 260, light: 0.1, dark: 0.18 }));
  // a ragged fringe hanging over the forehead, the mane's own fur
  const fringe = () => {
    ctx.beginPath(); ctx.moveTo(28, 30);
    const tips = [[34, 46], [40, 40], [46, 50], [53, 41], [60, 48], [66, 40], [73, 49], [80, 41], [87, 48], [94, 40], [100, 44]];
    for (const [x, y] of tips) { ctx.lineTo(x - 3, y - 9); ctx.lineTo(x, y); }
    ctx.lineTo(100, 30); ctx.closePath();
  };
  fill(ctx, fringe, lin(ctx, 12, 8, 116, 122, [[0, '#d89656'], [0.3, '#9a5826'], [0.7, '#5a2c0c'], [1, '#2a1204']]));
  clip(ctx, fringe, () => {
    for (let x = 30; x < 100; x += 5) {
      ctx.beginPath(); ctx.moveTo(x, 28); ctx.quadraticCurveTo(x + 1, 38, x + 2, 48);
      ctx.strokeStyle = x % 3 ? 'rgba(40,16,2,0.5)' : 'rgba(255,214,160,0.45)'; ctx.lineWidth = 2; ctx.stroke();
    }
  });
  // the heavy brow
  const brow = () => { ctx.beginPath(); ctx.moveTo(34, 54); ctx.quadraticCurveTo(64, 36, 94, 54); ctx.quadraticCurveTo(64, 48, 34, 54); ctx.closePath(); };
  stroke(ctx, brow, '#1a0e06', 9);
  stroke(ctx, () => { ctx.beginPath(); ctx.moveTo(36, 50); ctx.quadraticCurveTo(64, 34, 92, 50); }, 'rgba(255,214,160,0.55)', 2);
  // burning amber eyes
  for (const x of [50, 78]) {
    ellipse(ctx, x, 60, 9, 6); ctx.fillStyle = '#120804'; ctx.fill();
    ellipse(ctx, x, 60, 7, 4.6); ctx.fillStyle = rad(ctx, x - 1, 59, 8, [[0, '#fff6c0'], [0.45, '#ffc64d'], [1, '#e2601a']]); ctx.fill();
    ellipse(ctx, x, 60, 1.8, 4); ctx.fillStyle = '#120804'; ctx.fill();
  }
  // a flat broad nose
  ellipse(ctx, cx, 74, 11, 6); ctx.fillStyle = '#2a1e16'; ctx.fill();
  for (const x of [58, 70]) { ellipse(ctx, x, 75, 3, 2.2); ctx.fillStyle = '#0a0604'; ctx.fill(); }
  // the roaring mouth and its fangs
  const mouth = () => ellipse(ctx, cx, 94, 19, 12);
  fill(ctx, mouth, rad(ctx, cx, 96, 18, [[0, '#7a0a10'], [0.6, '#3a0408'], [1, '#120204']]));
  ctx.fillStyle = IVORY[0];
  for (const [x, dir] of [[52, 1], [76, 1], [55, -1], [73, -1]]) {
    const y0 = dir > 0 ? 83.5 : 104.5;
    poly(ctx, [[x - 4, y0], [x + 4, y0], [x, y0 + dir * 10]]); ctx.fill();
  }
  stroke(ctx, () => { ctx.beginPath(); ctx.ellipse(cx, 94, 19, 12, 0, Math.PI * 1.1, Math.PI * 1.9); }, 'rgba(255,200,170,0.4)', 1.6);
}

/** One eye: a lidded socket, white, a jade iris, a black pupil, a catch-light */
function eyeball(ctx, x, y, r, { iris = JADE, look = [0, 0] } = {}) {
  ellipse(ctx, x, y, r * 1.22, r * 0.98); ctx.fillStyle = '#4a1222'; ctx.fill();
  const white = () => ellipse(ctx, x, y, r, r * 0.76);
  fill(ctx, white, rad(ctx, x - r * 0.3, y - r * 0.3, r * 1.3, [[0, '#ffffff'], [0.7, '#f0e4dc'], [1, '#b89a92']]));
  clip(ctx, white, () => {
    const ix = x + look[0] * r * 0.3; const iy = y + look[1] * r * 0.2;
    circle(ctx, ix, iy, r * 0.56); ctx.fillStyle = rad(ctx, ix - r * 0.15, iy - r * 0.15, r * 0.6, [[0, iris.hi], [0.4, iris.lit], [1, iris.dark]]); ctx.fill();
    circle(ctx, ix, iy, r * 0.27); ctx.fillStyle = '#050505'; ctx.fill();
    circle(ctx, ix - r * 0.18, iy - r * 0.2, r * 0.13); ctx.fillStyle = '#ffffff'; ctx.fill();
    // the upper lid's shadow
    ctx.fillStyle = 'rgba(80,20,30,0.35)'; ctx.fillRect(x - r, y - r, r * 2, r * 0.32);
  });
}

/** The Guardian: Lo Pan's floating spy, a fleshy balloon covered in eyes, tendrils trailing */
function guard(ctx) {
  // tendrils
  for (const [x0, c1, x1] of [[46, 34, 34], [64, 70, 62], [82, 96, 94]]) {
    const t = () => { ctx.beginPath(); ctx.moveTo(x0, 88); ctx.quadraticCurveTo(c1, 104, x1, 116); };
    stroke(ctx, t, '#5a1a2e', 9);
    stroke(ctx, t, '#c46a80', 5);
  }
  const ball = () => circle(ctx, 64, 56, 44);
  fill(ctx, ball, rad(ctx, 46, 36, 66, [[0, '#ffd6dc'], [0.3, '#e2909e'], [0.7, '#a84a62'], [1, '#5a1a2e']]));
  clip(ctx, ball, () => {
    // veins
    const r = rng(19);
    ctx.strokeStyle = 'rgba(110,20,50,0.35)'; ctx.lineWidth = 1.6;
    for (let i = 0; i < 9; i++) {
      let x = 20 + r() * 88; let y = 14 + r() * 80;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let k = 0; k < 3; k++) { x += (r() - 0.5) * 22; y += (r() - 0.5) * 22; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    grain(ctx, 18, 8, 92, 92, { seed: 44, n: 300, light: 0.08, dark: 0.12 });
  });
  bevel(ctx, ball, 3, 'rgba(255,230,236,0.85)', 'rgba(60,0,20,0.55)', [18, 8, 110, 100]);
  // the many small eyes, all looking at you, then the big one
  for (const [x, y, rr, lx, ly] of [[38, 30, 8, 1, 1], [62, 18, 7, 0, 1], [88, 26, 8, -1, 1], [102, 52, 7, -1, 0], [28, 58, 7, 1, 0], [94, 80, 7, -1, -1], [36, 82, 6.5, 1, -1], [64, 90, 6, 0, -1]]) {
    eyeball(ctx, x, y, rr, { look: [lx, ly] });
  }
  eyeball(ctx, 64, 54, 20);
  glint(ctx, 40, 22, 8);
}

/** One of the Three Storms: a straw hat, a face in shadow, eyes lit their element's colour */
function stormFigure(ctx, cx, apex, w, eyes, shade = 0) {
  const brimY = apex + w * 0.5;
  // robe and shoulders
  fill(ctx, () => poly(ctx, [[cx - w * 0.4, 118], [cx - w * 0.3, brimY + 26], [cx + w * 0.3, brimY + 26], [cx + w * 0.4, 118]]), lin(ctx, 0, brimY + 26, 0, 122, [[0, '#2a2e3a'], [1, '#0d0f14']]));
  // the face in shadow, its eyes glowing
  fill(ctx, () => rrect(ctx, cx - w * 0.26, brimY - 6, w * 0.52, w * 0.36, 8), '#0a0b10');
  for (const dx of [-0.12, 0.12]) {
    const x = cx + dx * w; const y = brimY + 6;
    ctx.fillStyle = rad(ctx, x, y, w * 0.14, [[0, rgba(eyes, 0.8)], [1, rgba(eyes, 0)]]);
    ctx.fillRect(x - w * 0.14, y - w * 0.14, w * 0.28, w * 0.28);
    ellipse(ctx, x, y, w * 0.07, w * 0.03); ctx.fillStyle = '#f4f8ff'; ctx.fill();
  }
  // the conical hat, rimmed dark so it stands off the storm behind
  const hat = () => { ctx.beginPath(); ctx.moveTo(cx, apex); ctx.lineTo(cx + w / 2, brimY); ctx.quadraticCurveTo(cx, brimY + w * 0.12, cx - w / 2, brimY); ctx.closePath(); };
  stroke(ctx, hat, OUT, 6);
  fill(ctx, hat, lin(ctx, cx - w / 2, apex, cx + w / 2, brimY, [[0, mix('#f0d79a', '#7a6030', shade)], [0.45, mix('#c9a35c', '#4e3c18', shade)], [1, mix('#6e5426', '#2a1e08', shade)]]));
  clip(ctx, hat, () => {
    ctx.strokeStyle = 'rgba(80,55,15,0.5)'; ctx.lineWidth = 1.4;
    for (let i = -5; i <= 5; i++) { ctx.beginPath(); ctx.moveTo(cx, apex); ctx.lineTo(cx + i * w * 0.1, brimY + 10); ctx.stroke(); }
  });
  bevel(ctx, hat, 2.5, 'rgba(255,250,225,0.8)', 'rgba(40,25,0,0.6)', [cx - w / 2, apex, cx + w / 2, brimY]);
}

/**
 * The Three Storms: three straw hats, the one in front Lightning (the
 * siege icon's lone Storm), Thunder and Rain behind him, each one's eyes
 * lit with his element.
 */
function storms(ctx) {
  // Thunder and Rain behind, up at the corners, Lightning in front and
  // lower: three cones all in the clear. (Side by side in a row, the
  // front hat hid the other two and at 22 px it read as one Storm.)
  stormFigure(ctx, 34, 10, 46, ELEMENT.thunder.light, 0.2);
  stormFigure(ctx, 94, 10, 46, ELEMENT.rain.light, 0.2);
  stormFigure(ctx, 64, 34, 64, ELEMENT.lightning.light, 0);
  const r = rng(29);
  forkedBolt(ctx, r, 46, 108, 18, 116, { steps: 4, amp: 5, branches: 1, branchLen: 8, width: 1.8, ...BOLT });
  forkedBolt(ctx, r, 82, 108, 110, 116, { steps: 4, amp: 5, branches: 1, branchLen: 8, width: 1.8, ...BOLT });
}
storms.post = { glow: '#3d6bff', glowBlur: 5, glowAlpha: 0.4 };

/**
 * Lo Pan: the ancient sorcerer in a black-and-gold winged official's hat,
 * eyes blazing with green-white light, long white moustaches. The winged
 * hat is the silhouette that carries him at 22 px.
 */
function lopan(ctx) {
  // a long white beard, tapering to a point (two long moustaches were
  // tried: at 22 px they read as legs)
  const beard = () => { ctx.beginPath(); ctx.moveTo(48, 88); ctx.quadraticCurveTo(52, 112, 64, 122); ctx.quadraticCurveTo(76, 112, 80, 88); ctx.closePath(); };
  fill(ctx, beard, lin(ctx, 48, 88, 80, 122, [[0, '#ffffff'], [0.5, '#dcdcd2'], [1, '#8a8a80']]));
  clip(ctx, beard, () => {
    ctx.strokeStyle = 'rgba(120,120,110,0.5)'; ctx.lineWidth = 1.4;
    for (const k of [-10, -4, 2, 8]) { ctx.beginPath(); ctx.moveTo(64 + k, 90); ctx.quadraticCurveTo(64 + k * 0.8, 106, 64 + k * 0.2, 120); ctx.stroke(); }
  });
  // the face: long, narrow and ancient
  const face = () => { ctx.beginPath(); ctx.moveTo(40, 44); ctx.bezierCurveTo(40, 76, 50, 100, 64, 102); ctx.bezierCurveTo(78, 100, 88, 76, 88, 44); ctx.closePath(); };
  fill(ctx, face, lin(ctx, 40, 40, 88, 102, [[0, '#f2ead0'], [0.4, '#cfc08e'], [1, '#6e6034']]));
  clip(ctx, face, () => {
    grain(ctx, 40, 40, 48, 62, { seed: 8, n: 200, light: 0.08, dark: 0.16 });
    // wrinkles
    ctx.strokeStyle = 'rgba(90,70,30,0.55)'; ctx.lineWidth = 1.5;
    for (const [x0, y0, x1, y1, cy] of [[48, 50, 80, 50, 47], [50, 55, 78, 55, 52], [44, 72, 50, 86, 78], [84, 72, 78, 86, 78]]) {
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2, cy, x1, y1); ctx.stroke();
    }
  });
  bevel(ctx, face, 2.5, 'rgba(255,250,230,0.8)', 'rgba(60,40,0,0.5)', [40, 40, 88, 102]);
  // the eyes: light pouring out of them
  for (const x of [53, 75]) {
    ctx.fillStyle = rad(ctx, x, 63, 13, [[0, 'rgba(210,255,224,0.95)'], [0.5, 'rgba(106,242,147,0.55)'], [1, 'rgba(106,242,147,0)']]);
    ctx.fillRect(x - 13, 50, 26, 26);
    ellipse(ctx, x, 63, 7, 3.2); ctx.fillStyle = '#ffffff'; ctx.fill();
  }
  // white brows, drooping
  for (const side of [-1, 1]) stroke(ctx, () => { ctx.beginPath(); ctx.moveTo(64 + side * 4, 56); ctx.quadraticCurveTo(64 + side * 16, 52, 64 + side * 24, 60); }, '#f6f6ee', 3);
  // the mouth, a slit of the same light, and a drooping moustache over the beard
  ellipse(ctx, 64, 86, 7, 2.6); ctx.fillStyle = '#d2ffdc'; ctx.fill();
  for (const side of [-1, 1]) {
    const m = () => { ctx.beginPath(); ctx.moveTo(64, 80); ctx.quadraticCurveTo(64 + side * 14, 80, 64 + side * 16, 96); };
    stroke(ctx, m, '#8a8a80', 5.5);
    stroke(ctx, m, '#f6f6ee', 3);
  }
  // the winged hat: wings first, then the crown over them
  for (const side of [-1, 1]) {
    // a flat paddle on a stem, edged in gold (gold rings on the paddles read as headphones)
    const wing = () => {
      ctx.beginPath();
      ctx.moveTo(64 + side * 20, 27); ctx.lineTo(64 + side * 38, 25);
      ctx.quadraticCurveTo(64 + side * 58, 18, 64 + side * 57, 31);
      ctx.quadraticCurveTo(64 + side * 58, 44, 64 + side * 38, 37);
      ctx.lineTo(64 + side * 20, 35); ctx.closePath();
    };
    fill(ctx, wing, lin(ctx, 0, 20, 0, 42, [[0, '#5a5a64'], [0.4, '#1e1e24'], [1, '#08080a']]));
    bevel(ctx, wing, 2, 'rgba(220,220,230,0.75)', 'rgba(0,0,0,0.6)', [6, 18, 122, 44]);
    clip(ctx, wing, () => stroke(ctx, wing, rgba(GOLD[1], 0.85), 3));
  }
  const crown = () => { ctx.beginPath(); ctx.moveTo(36, 46); ctx.lineTo(38, 26); ctx.bezierCurveTo(40, 6, 88, 6, 90, 26); ctx.lineTo(92, 46); ctx.closePath(); };
  fill(ctx, crown, lin(ctx, 36, 8, 92, 46, [[0, '#6a6a76'], [0.3, '#2a2a32'], [1, '#08080a']]));
  clip(ctx, crown, () => grain(ctx, 36, 8, 56, 38, { seed: 66, n: 160, light: 0.1, dark: 0.12 }));
  bevel(ctx, crown, 2.5, 'rgba(220,220,230,0.8)', 'rgba(0,0,0,0.6)', [36, 8, 92, 46]);
  // its gold band and a red jewel
  rrect(ctx, 36, 38, 56, 8, 2); ctx.fillStyle = metal(ctx, GOLD, 36, 38, 92, 46); ctx.fill();
  ellipse(ctx, 64, 28, 6, 7); ctx.fillStyle = rad(ctx, 62, 26, 8, [[0, RED[0]], [0.5, RED[1]], [1, RED[3]]]); ctx.fill();
  stroke(ctx, () => ellipse(ctx, 64, 28, 7.5, 8.5), GOLD[1], 2);
}
lopan.post = { glow: '#6af293', glowBlur: 5, glowAlpha: 0.35 };

/**
 * The Hell of the Upside-Down Sinners: a red demon mask hung upside down,
 * its toothy grin on top, horns curling down. An upside-down face is what
 * 🙃 is, and a face reads at 22 px when little else does; it's still lit
 * from the top-left. No brows: under the eyes they read as a mouth, and
 * the whole face flipped back the right way up.
 */
function upside(ctx) {
  // hung by the chin from a red cord, the way the sinners hang by their feet
  stroke(ctx, () => { ctx.beginPath(); ctx.ellipse(64, 13, 6, 5, 0, Math.PI * 0.8, Math.PI * 2.2); }, RED[2], 4);
  cord(ctx, () => { ctx.beginPath(); ctx.moveTo(64, 17); ctx.lineTo(64, 28); }, 6);
  diamond(ctx, 64, 20, 6); ctx.fillStyle = RED[2]; ctx.fill();
  ctx.save(); ctx.translate(64, 72); ctx.scale(0.84, 0.84); ctx.translate(-64, -64);
  upsideMask(ctx);
  ctx.restore();
}
function upsideMask(ctx) {
  const cx = 64;
  // horns, curling down and out from the brow (now at the bottom)
  for (const side of [-1, 1]) {
    const horn = () => { ctx.beginPath(); ctx.moveTo(cx + side * 22, 94); ctx.bezierCurveTo(cx + side * 40, 104, cx + side * 52, 104, cx + side * 54, 120); ctx.bezierCurveTo(cx + side * 44, 110, cx + side * 36, 112, cx + side * 30, 102); ctx.closePath(); };
    fill(ctx, horn, lin(ctx, cx + side * 22, 94, cx + side * 54, 120, [[0, GOLD[0]], [0.4, GOLD[1]], [1, GOLD[3]]]));
  }
  // the mask: chin at the top, broad brow at the bottom
  const mask = () => {
    ctx.beginPath();
    ctx.moveTo(cx, 8);
    ctx.bezierCurveTo(cx + 28, 10, cx + 42, 26, cx + 44, 50);
    ctx.bezierCurveTo(cx + 46, 74, cx + 42, 94, cx + 28, 102);
    ctx.quadraticCurveTo(cx, 110, cx - 28, 102);
    ctx.bezierCurveTo(cx - 42, 94, cx - 46, 74, cx - 44, 50);
    ctx.bezierCurveTo(cx - 42, 26, cx - 28, 10, cx, 8);
    ctx.closePath();
  };
  fill(ctx, mask, lin(ctx, 20, 8, 108, 108, [[0, RED[0]], [0.3, RED[1]], [0.7, RED[2]], [1, RED[4]]]));
  clip(ctx, mask, () => {
    grain(ctx, 16, 6, 96, 104, { seed: 81, n: 300, light: 0.08, dark: 0.16 });
    ctx.fillStyle = 'rgba(255,255,255,0.28)'; ellipse(ctx, 36, 70, 7, 16, 0.2); ctx.fill();
  });
  bevel(ctx, mask, 3, rgba(RED[0], 0.9), 'rgba(0,0,0,0.55)', [20, 8, 108, 108]);
  // the grin, upside down on top: a wide arch full of teeth
  const grin = () => { ctx.beginPath(); ctx.moveTo(cx - 30, 44); ctx.quadraticCurveTo(cx, 2, cx + 30, 44); ctx.quadraticCurveTo(cx, 30, cx - 30, 44); ctx.closePath(); };
  fill(ctx, grin, '#1a0204');
  clip(ctx, grin, () => {
    // a row of teeth along the arch (the lower jaw, now on top)
    ctx.fillStyle = IVORY[0];
    for (let i = -3; i <= 3; i++) {
      const x = cx + i * 7.6; const y = 23 + (i * i) * 1.6;
      rrect(ctx, x - 3.2, y, 6.4, 8, 1.5); ctx.fill();
    }
    ctx.fillStyle = 'rgba(80,40,20,0.35)';
    for (let i = -3; i <= 3; i++) { const x = cx + i * 7.6; ctx.fillRect(x - 3.2, 29 + (i * i) * 1.6, 6.4, 2); }
  });
  // two fangs from the upper jaw (now underneath), pointing up into the grin
  ctx.fillStyle = IVORY[0];
  for (const x of [cx - 14, cx + 14]) { poly(ctx, [[x - 4, 40], [x + 4, 40], [x, 30]]); ctx.fill(); }
  // big eyes below, gold irises in white
  for (const side of [-1, 1]) {
    const x = cx + side * 18;
    ellipse(ctx, x, 66, 12, 9); ctx.fillStyle = '#120404'; ctx.fill();
    ellipse(ctx, x, 66, 10, 7); ctx.fillStyle = IVORY[0]; ctx.fill();
    circle(ctx, x, 65, 5); ctx.fillStyle = GOLD[1]; ctx.fill();
    circle(ctx, x, 65, 2.4); ctx.fillStyle = '#0a0606'; ctx.fill();
  }
  // nostrils between grin and eyes, and a gold mark on the brow (now at the bottom)
  for (const side of [-1, 1]) { ellipse(ctx, cx + side * 5, 50, 3, 2); ctx.fillStyle = '#3a0408'; ctx.fill(); }
  diamond(ctx, cx, 90, 7); ctx.fillStyle = metal(ctx, GOLD, cx - 7, 83, cx + 7, 97); ctx.fill();
}
upside.post = { glow: '#ff3a2a', glowBlur: 6, glowAlpha: 0.45 };

/** Egg Shen's tour bus (`bus`): a vintage Chinatown tour bus, side on, its sign on the roof */
function bus(ctx) {
  // the roof sign
  const sign = () => rrect(ctx, 44, 20, 50, 14, 3);
  fill(ctx, sign, lin(ctx, 44, 20, 94, 34, [[0, RED[0]], [0.4, RED[1]], [1, RED[3]]]));
  stroke(ctx, () => rrect(ctx, 47, 23, 44, 8, 1.5), rgba(GOLD[1], 0.9), 1.6);
  for (const x of [56, 82]) { ctx.fillStyle = IRON[3]; ctx.fillRect(x - 1.5, 33, 3, 6); }
  // the body: cream above, jade below, rounded at the front (left)
  const body = () => { ctx.beginPath(); ctx.moveTo(30, 38); ctx.lineTo(114, 38); ctx.quadraticCurveTo(120, 38, 120, 44); ctx.lineTo(120, 98); ctx.lineTo(8, 98); ctx.lineTo(8, 64); ctx.quadraticCurveTo(10, 40, 30, 38); ctx.closePath(); };
  fill(ctx, body, lin(ctx, 0, 38, 0, 98, [[0, IVORY[0]], [0.45, IVORY[2]], [0.46, JADE.mid], [1, JADE.dark]]));
  clip(ctx, body, () => {
    grain(ctx, 8, 38, 112, 60, { seed: 71, n: 260, light: 0.08, dark: 0.12 });
    // a red stripe with a gold line
    ctx.fillStyle = RED[2]; ctx.fillRect(0, 66, 128, 6);
    ctx.fillStyle = GOLD[1]; ctx.fillRect(0, 72, 128, 2);
  });
  bevel(ctx, body, 2.5, 'rgba(255,255,255,0.85)', 'rgba(0,0,0,0.5)', [8, 38, 120, 98]);
  // windows: a raked windscreen, then a row down the side
  const glass = (pathFn, x0, x1) => {
    fill(ctx, pathFn, lin(ctx, x0, 44, x1, 64, [[0, '#a8d0f0'], [0.4, '#3a6a9a'], [1, '#0e1e38']]));
    clip(ctx, pathFn, () => { poly(ctx, [[x0 + 4, 44], [x0 + 10, 44], [x0 + 2, 64], [x0 - 4, 64]]); ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fill(); });
  };
  glass(() => { ctx.beginPath(); ctx.moveTo(26, 44); ctx.lineTo(36, 44); ctx.lineTo(36, 62); ctx.lineTo(13, 62); ctx.quadraticCurveTo(14, 48, 26, 44); ctx.closePath(); }, 13, 36);
  for (const x of [42, 62, 82, 100]) glass(() => rrect(ctx, x, 44, 16, 18, 2.5), x, x + 16);
  // the door
  stroke(ctx, () => rrect(ctx, 26, 66, 12, 28, 2), 'rgba(0,30,10,0.6)', 2);
  // a headlamp and bumper
  circle(ctx, 13, 84, 4.5); ctx.fillStyle = rad(ctx, 12, 83, 5, [[0, '#ffffff'], [1, '#ffc64d']]); ctx.fill();
  rrect(ctx, 6, 94, 116, 6, 3); ctx.fillStyle = metal(ctx, SILVER, 6, 94, 122, 100); ctx.fill();
  // wheels
  for (const x of [34, 96]) {
    circle(ctx, x, 100, 15); ctx.fillStyle = rad(ctx, x - 3, 97, 16, [[0, '#4a4c50'], [1, '#0a0b0c']]); ctx.fill();
    circle(ctx, x, 100, 7); ctx.fillStyle = metal(ctx, SILVER, x - 7, 93, x + 7, 107); ctx.fill();
    circle(ctx, x, 100, 2.5); ctx.fillStyle = IRON[3]; ctx.fill();
  }
  glint(ctx, 22, 50, 8);
}

export default createStyle({
  id: 'egg-shen',
  name: 'Egg Shen’s Magic',
  post: { outline: OUT, width: 5.5 },
  barPost: { outline: OUT, width: 5.5, glow: null, halo: null },
  bar,
  icons: {
    tk1: studTick(true), tk0: studTick(false),
    ntp: lanternTick('red'), nts: lanternTick('spirit'), ntm: lanternTick('dark'), ntt: lanternTick('half'),
    coin, flame, moon, shield, clock, star, chart, people,
    med1: medal(GOLD, 1), med2: medal(SILVER, 2), med3: medal(BRONZE, 3), trophy, crown,
    ballot, vs, lock, tie, upset, dice,
    potion, food, doom, rescue, siege,
    gpie, vhs, garlic, holyw, penny, antid, silver, nlight,
    gift, glove, scroll, effect, rocket,
    erain, efire, ewind, esmoke, elite, ethund,
    chi, bag, bblood, jade, truck, sidek, wang, jack, back,
    wildmn, guard, storms, lopan, upside, bus,
  },
});

/**
 * Silhouettes for the emoji kit's drawings (egg-shen.js): paths only, no
 * paint, so a subject's readable outline lives apart from its materials —
 * at 22 px the outline is most of what shows.
 *
 * All coordinates are on the 128-unit grid; keep bodies inside ~8..120 so
 * the outline added by finish() fits.
 */
import { rrect } from './common.js';

/** A bevel on any shape: pale along the top-left edges, dark bottom-right, kept inside it */
export function bevel(ctx, pathFn, width, light, dark, box = [0, 0, 128, 128]) {
  const [x0, y0, x1, y1] = box;
  ctx.save();
  pathFn(); ctx.clip();
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, light); g.addColorStop(0.45, 'rgba(0,0,0,0)'); g.addColorStop(0.55, 'rgba(0,0,0,0)'); g.addColorStop(1, dark);
  pathFn();
  ctx.strokeStyle = g; ctx.lineWidth = width * 2; ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

/** A flame, base centred on (cx, by), w wide and h tall, three licks */
export function flamePath(ctx, cx, by, w, h) {
  const x = (u) => cx + u * w / 2; const y = (v) => by - v * h;
  ctx.beginPath();
  ctx.moveTo(x(0), y(0));
  ctx.bezierCurveTo(x(-0.75), y(0), x(-1.05), y(0.3), x(-0.82), y(0.52));
  ctx.bezierCurveTo(x(-0.7), y(0.64), x(-0.62), y(0.72), x(-0.7), y(0.86));
  ctx.bezierCurveTo(x(-0.42), y(0.76), x(-0.3), y(0.64), x(-0.26), y(0.56));
  ctx.bezierCurveTo(x(-0.22), y(0.74), x(-0.02), y(0.86), x(0.06), y(1));
  ctx.bezierCurveTo(x(0.42), y(0.8), x(0.62), y(0.62), x(0.6), y(0.46));
  ctx.bezierCurveTo(x(0.72), y(0.52), x(0.78), y(0.62), x(0.8), y(0.7));
  ctx.bezierCurveTo(x(1.08), y(0.42), x(0.92), y(0.02), x(0), y(0));
  ctx.closePath();
}

/** Trophy cup bowl (no handles), rim at y=top, bowl bottom at y=top+h */
export function cupBowlPath(ctx, cx, top, w, h) {
  const hw = w / 2;
  ctx.beginPath();
  ctx.moveTo(cx - hw, top);
  ctx.lineTo(cx + hw, top);
  ctx.bezierCurveTo(cx + hw, top + h * 0.7, cx + hw * 0.55, top + h, cx + hw * 0.18, top + h);
  ctx.lineTo(cx - hw * 0.18, top + h);
  ctx.bezierCurveTo(cx - hw * 0.55, top + h, cx - hw, top + h * 0.7, cx - hw, top);
  ctx.closePath();
}
/** One trophy handle as a stroke path (side = -1 left, 1 right) */
export function cupHandlePath(ctx, cx, top, w, h, side) {
  const hw = w / 2;
  ctx.beginPath();
  ctx.moveTo(cx + side * (hw - 4), top + 6);
  ctx.bezierCurveTo(cx + side * (hw + 20), top + 2, cx + side * (hw + 20), top + h * 0.75, cx + side * hw * 0.45, top + h * 0.82);
}

/** A calabash gourd: small top bulb, waist, big bottom bulb */
export function gourdPath(ctx, cx, top, s = 1) {
  const X = (u) => cx + u * s; const Y = (v) => top + v * s;
  ctx.beginPath();
  ctx.moveTo(X(-7), Y(0));
  ctx.lineTo(X(7), Y(0));
  ctx.bezierCurveTo(X(8), Y(6), X(20), Y(10), X(20), Y(24));
  ctx.bezierCurveTo(X(20), Y(34), X(10), Y(36), X(12), Y(42));
  ctx.bezierCurveTo(X(40), Y(50), X(44), Y(80), X(30), Y(94));
  ctx.bezierCurveTo(X(18), Y(106), X(-18), Y(106), X(-30), Y(94));
  ctx.bezierCurveTo(X(-44), Y(80), X(-40), Y(50), X(-12), Y(42));
  ctx.bezierCurveTo(X(-10), Y(36), X(-20), Y(34), X(-20), Y(24));
  ctx.bezierCurveTo(X(-20), Y(10), X(-8), Y(6), X(-7), Y(0));
  ctx.closePath();
}

/** A paper lantern body: a squashed barrel (cx, cy), rx × ry */
export function lanternBodyPath(ctx, cx, cy, rx, ry) {
  const t = ry * 0.92; const capW = rx * 0.62;
  ctx.beginPath();
  ctx.moveTo(cx - capW, cy - t);
  ctx.bezierCurveTo(cx - rx * 1.12, cy - t * 0.85, cx - rx * 1.12, cy + t * 0.85, cx - capW, cy + t);
  ctx.lineTo(cx + capW, cy + t);
  ctx.bezierCurveTo(cx + rx * 1.12, cy + t * 0.85, cx + rx * 1.12, cy - t * 0.85, cx + capW, cy - t);
  ctx.closePath();
}

/** Garlic bulb, centre (cx, cy), scale s (1 ≈ 90 units tall incl. stem) */
export function garlicPath(ctx, cx, cy, s = 1) {
  const X = (u) => cx + u * s; const Y = (v) => cy + v * s;
  ctx.beginPath();
  ctx.moveTo(X(-3), Y(-46));
  ctx.lineTo(X(3), Y(-46));
  ctx.bezierCurveTo(X(4), Y(-30), X(10), Y(-24), X(24), Y(-14));
  ctx.bezierCurveTo(X(50), Y(2), X(48), Y(34), X(22), Y(40));
  ctx.bezierCurveTo(X(10), Y(43), X(-10), Y(43), X(-22), Y(40));
  ctx.bezierCurveTo(X(-48), Y(34), X(-50), Y(2), X(-24), Y(-14));
  ctx.bezierCurveTo(X(-10), Y(-24), X(-4), Y(-30), X(-3), Y(-46));
  ctx.closePath();
}

/** A Chinese cleaver in local coords: blade x -46..14, handle to x 52 */
export function cleaverBladePath(ctx) {
  ctx.beginPath();
  ctx.moveTo(-46, -24);
  ctx.lineTo(12, -24);
  ctx.lineTo(16, -14);
  ctx.lineTo(16, 18);
  ctx.quadraticCurveTo(-14, 26, -46, 24);
  ctx.quadraticCurveTo(-50, 0, -46, -24);
  ctx.closePath();
}
export function cleaverHandlePath(ctx) { rrect(ctx, 14, -10, 40, 15, 6); }

/** A capsule, centre (0,0) local, length L, width W */
export function capsulePath(ctx, L, W) { rrect(ctx, -L / 2, -W / 2, L, W, W / 2); }

/** A cartridge pointing +x in local coords: casing then bullet */
export function bulletTipPath(ctx, x0, L, W) {
  ctx.beginPath();
  ctx.moveTo(x0, -W / 2);
  ctx.bezierCurveTo(x0 + L * 0.62, -W / 2, x0 + L, -W * 0.3, x0 + L, 0);
  ctx.bezierCurveTo(x0 + L, W * 0.3, x0 + L * 0.62, W / 2, x0, W / 2);
  ctx.closePath();
}

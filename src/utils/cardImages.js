/**
 * Drawn result cards, in the house style "Egg Shen's Magic" (canvasKit.js):
 *
 *  - generateMatchupResultImage: a knockout matchup's result, attached to
 *    the scheduler's result card (tournamentScheduler.postMatchupResults).
 *    The two posters face off across a lightning "VS"; the winner larger,
 *    framed in gold and jade, under a red WINNER sash with the kit trophy;
 *    the loser dimmed. Below, the vote split as one bar in a carved stone
 *    channel, gold from the left, blue from the right.
 *  - generateSurveyResultsImage: a closed survey's chart, attached to the
 *    "🏁 Survey Closed" message (pollManager.closePollAndAnnounce).
 *
 * An image is extra, never in the way: each call gives up after 5 seconds
 * (IMAGE_TIMEOUT_MS) and throws, and the callers then post the text card
 * exactly as they always have. Posters that are missing, slow or broken
 * get a drawn placeholder instead; they never fail the image.
 *
 * Discord shows an embed image at roughly half this size (~520 px wide on
 * desktop, less on a phone), so every word here is big and bold.
 *
 * The layout constants are exported for the pixel tests
 * (tests/card-images.test.js), which check the drawing against them.
 */
import { createCanvas } from '@napi-rs/canvas';
import {
  EGG_SHEN, registerFonts, font, setFont, fitText, wrapText, stripPictographs,
  drawCoverImage, drawKitIcon, loadImageCached, roundRectPath, drawNebula, drawStoneFrame,
  drawStone, drawStud, drawSetGem, drawLightning, drawEnergy, drawStoneChannel, goldFill,
  linear, radial, rgba, rng, TAU,
} from './canvasKit.js';

/** How long either image may take, posters included, before the text card goes without it */
export const IMAGE_TIMEOUT_MS = 5000;

/** The matchup image's layout (960×540) */
export const MATCHUP_IMAGE = Object.freeze({
  width: 960,
  height: 540,
  rim: 18,
  /** The posters' boxes (inside their frames); the winner's is the larger */
  winner: Object.freeze({ x: 150, y: 88, w: 200, h: 300 }),
  loser: Object.freeze({ x: 635, y: 163, w: 150, h: 225 }),
  /** Frame widths outside each poster: the winner's gold, the loser's stone */
  winnerFrame: 8,
  loserFrame: 5,
  /** The vote split's energy, exactly: the winner's share from x */
  bar: Object.freeze({ x: 64, y: 478, w: 832, h: 22 }),
  vs: Object.freeze({ x: 480, y: 262, r: 46 }),
  /** Where an UPSET! stamp or the tie note goes */
  callout: Object.freeze({ x: 491, y: 134 }),
  titleBaseline: 428,
  countsBaseline: 464,
  /** A missing poster's jade stud, as fractions of the poster box */
  placeholderGem: Object.freeze({ x: 0.5, y: 0.34 }),
});

/** The survey chart's layout: 960 × (top + rowHeight·n + bottom) */
export const SURVEY_IMAGE = Object.freeze({
  width: 960,
  rim: 14,
  top: 120,
  rowHeight: 64,
  bottom: 40,
  /** Each row, relative to its top: the badge, the label and numbers on one line, the bar below */
  badge: Object.freeze({ cx: 62, dy: 32, r: 18 }),
  label: Object.freeze({ x: 100, dy: 28, px: 24 }),
  stats: Object.freeze({ right: 912, gap: 18 }),
  bar: Object.freeze({ x: 100, w: 812, dy: 38, h: 16 }),
});

/** The survey chart's height for n options */
export function surveyImageHeight(n) {
  return SURVEY_IMAGE.top + SURVEY_IMAGE.rowHeight * n + SURVEY_IMAGE.bottom;
}

const ROUND_NAMES = {
  round_of_32: 'Round of 32',
  round_of_16: 'Round of 16',
  quarterfinals: 'Quarterfinals',
  semifinals: 'Semifinals',
  finals: 'Finals',
};

/**
 * Run `work` but give up after `ms`: reject, so the caller posts without
 * the image. The drawing can't be cancelled; it finishes unseen.
 */
function withDeadline(work, ms, what) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} took longer than ${ms} ms`)), ms);
    timer.unref?.();
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

/** Text as drawn: no emoji (no colour-emoji font), no Markdown marks */
function plain(text) {
  return stripPictographs(text).replace(/\*\*|__|~~|`/g, '').trim();
}

const votesWord = (n) => `${n} vote${n === 1 ? '' : 's'}`;

/** A small stable number from a string, to seed a placeholder's smoke */
function hashSeed(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}

// ════════════════════════════════════════════════════════════ matchup result

/**
 * A knockout matchup's result, 960×540 PNG.
 * @param {Object} data
 * @param {string} data.round - 'Quarterfinals' or a round key ('quarterfinals')
 * @param {string} [data.label] - the matchup's label, e.g. '1A'
 * @param {{title, year?, posterUrl?, votes, seed?}} data.winner
 * @param {{title, year?, posterUrl?, votes, seed?}|null} data.loser - null for a bye
 * @param {boolean} [data.upset] - a worse seed won: stamped UPSET!
 * @param {boolean} [data.tieBrokenBySeed] - a tie the higher seed took
 * @param {{ fetchImpl?: Function, timeoutMs?: number }} [options]
 * @returns {Promise<Buffer>} rejects past the deadline or on a drawing error
 */
export function generateMatchupResultImage(data, { fetchImpl, timeoutMs = IMAGE_TIMEOUT_MS } = {}) {
  // Posters get most of the time; what's left is for drawing (~150 ms)
  const posterTimeoutMs = Math.max(200, timeoutMs - 1500);
  return withDeadline(drawMatchupResult(data, { fetchImpl, posterTimeoutMs }), timeoutMs, 'Matchup image');
}

async function drawMatchupResult(data, { fetchImpl, posterTimeoutMs }) {
  registerFonts();
  const L = MATCHUP_IMAGE;
  const winner = { ...data.winner, votes: Number(data.winner?.votes) || 0 };
  const loser = data.loser ? { ...data.loser, votes: Number(data.loser.votes) || 0 } : { title: 'Bye', votes: 0 };
  const load = (e) => (typeof e.posterUrl === 'string' ? loadImageCached(e.posterUrl, { timeoutMs: posterTimeoutMs, fetchImpl }) : null);
  const [winnerPoster, loserPoster] = await Promise.all([load(winner), load(loser)]);

  const canvas = createCanvas(L.width, L.height);
  const ctx = canvas.getContext('2d');
  drawNebula(ctx, 0, 0, L.width, L.height, { seed: 7 });
  // The light of the fight: gold behind the winner, the bolt's blue behind the VS
  glow(ctx, L.winner.x + L.winner.w / 2, L.winner.y + L.winner.h / 2, 260, '#c8901c', 0.32);
  glow(ctx, L.vs.x, L.vs.y, 190, EGG_SHEN.bolt.glow, 0.28);

  drawHeader(ctx, headerText(data), L.width / 2, 60, 620);

  // Lightning from the winner, through the VS, to the loser — the logo's bolt
  const wf = L.winnerFrame;
  const lf = L.loserFrame;
  drawLightning(ctx, L.winner.x + L.winner.w + wf - 2, L.vs.y - 22, L.vs.x - L.vs.r + 6, L.vs.y - 4, { seed: 31, amp: 16, width: 3.2, branches: 3, branchLength: 36 });
  drawLightning(ctx, L.vs.x + L.vs.r - 6, L.vs.y + 4, L.loser.x - lf + 2, L.vs.y + 20, { seed: 47, amp: 16, width: 2.6, branches: 3, branchLength: 32 });

  drawPoster(ctx, loserPoster, L.loser, loser, { won: false });
  drawPoster(ctx, winnerPoster, L.winner, winner, { won: true });
  await drawWinnerSash(ctx, L.winner);
  drawSeedBadge(ctx, L.winner, winner.seed, true);
  drawSeedBadge(ctx, L.loser, loser.seed, false);
  drawVs(ctx, L.vs);

  if (data.upset) drawUpsetStamp(ctx, L.callout.x, L.callout.y);
  else if (data.tieBrokenBySeed) await drawTieNote(ctx, L.callout.x, L.callout.y);

  drawTitle(ctx, winner, L.winner.x + L.winner.w / 2, L.titleBaseline, { won: true });
  drawTitle(ctx, loser, L.loser.x + L.loser.w / 2, L.titleBaseline, { won: false });
  drawSplit(ctx, winner.votes, loser.votes);

  drawStoneFrame(ctx, L.width, L.height, { rim: L.rim, radius: 28, seed: 5, midStuds: true });
  return canvas.encode('png'); // off the main thread: a PNG this size takes ~100 ms
}

function glow(ctx, x, y, r, colour, alpha) {
  ctx.fillStyle = radial(ctx, x, y, r, [[0, rgba(colour, alpha)], [0.5, rgba(colour, alpha * 0.4)], [1, rgba(colour, 0)]]);
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/** "QUARTERFINALS · 1A"; just "FINALS" when the label is the round */
function headerText({ round, label }) {
  const name = ROUND_NAMES[round] || String(round || 'Matchup');
  const tag = label && String(label).toLowerCase() !== name.toLowerCase() ? ` · ${label}` : '';
  return `${name}${tag}`.toUpperCase();
}

/**
 * A heading in old gold: the display face, spaced like a poster's billing,
 * between two gold rules that end in jade gems.
 */
function drawHeader(ctx, text, cx, baseline, maxWidth) {
  const shown = plain(text);
  let px = 34;
  ctx.save();
  ctx.letterSpacing = '3px';
  setFont(ctx, px, { family: 'display' }, shown);
  while (px > 24 && ctx.measureText(shown).width > maxWidth) setFont(ctx, --px, { family: 'display' }, shown);
  const line = fitText(ctx, shown, maxWidth);
  const width = ctx.measureText(line).width;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = linear(ctx, 0, baseline - px, 0, baseline, [[0, EGG_SHEN.gold[0]], [0.45, EGG_SHEN.gold[1]], [1, EGG_SHEN.gold[2]]]);
  ctx.fillText(line, cx, baseline);
  ctx.restore();
  // Rules out to the frame, each ending in a jade gem
  const y = baseline - px * 0.36;
  const inner = width / 2 + 22;
  for (const side of [-1, 1]) {
    const x0 = cx + side * inner;
    const x1 = cx + side * Math.max(inner + 40, ctx.canvas.width / 2 - 70);
    ctx.fillStyle = linear(ctx, x0, 0, x1, 0, [[0, rgba(EGG_SHEN.gold[1], 0.95)], [1, rgba(EGG_SHEN.gold[3], 0.15)]]);
    ctx.fillRect(Math.min(x0, x1), y - 1.5, Math.abs(x1 - x0), 3);
    drawSetGem(ctx, x0 + side * 2, y, 6, EGG_SHEN.jade, true);
  }
}

/**
 * A poster in its frame: the winner's in gold and jade with a warm glow;
 * the loser's in stone, the poster itself dimmed and drained of colour.
 */
function drawPoster(ctx, img, box, entry, { won }) {
  const { x, y, w, h } = box;
  const f = won ? MATCHUP_IMAGE.winnerFrame : MATCHUP_IMAGE.loserFrame;
  // Shadow (and for the winner, a gold halo) cast by the frame
  ctx.save();
  ctx.shadowColor = won ? 'rgba(255,190,60,0.55)' : 'rgba(0,0,0,0.85)';
  ctx.shadowBlur = won ? 34 : 20;
  ctx.shadowOffsetY = won ? 0 : 8;
  ctx.fillStyle = '#050605';
  ctx.fillRect(x - f, y - f, w + f * 2, h + f * 2);
  ctx.restore();

  if (img) drawCoverImage(ctx, img, x, y, w, h);
  else drawPlaceholder(ctx, box, entry);

  if (!won) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.globalCompositeOperation = 'saturation';
    ctx.fillStyle = 'rgba(128,128,128,0.8)';
    ctx.fillRect(x, y, w, h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(4,7,6,0.5)';
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  // The frame
  ctx.save();
  if (won) {
    ctx.lineWidth = f;
    ctx.strokeStyle = goldFill(ctx, x - f, y - f, x + w + f, y + h + f);
    ctx.strokeRect(x - f / 2, y - f / 2, w + f, h + f);
    // jade inlay just inside the gold
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = EGG_SHEN.jade.lit;
    ctx.strokeRect(x + 1.25, y + 1.25, w - 2.5, h - 2.5);
    // pale catch-light on the gold's outer top-left edge
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(255,248,214,0.8)';
    ctx.beginPath();
    ctx.moveTo(x - f + 0.6, y + h + f - 2);
    ctx.lineTo(x - f + 0.6, y - f + 0.6);
    ctx.lineTo(x + w + f - 2, y - f + 0.6);
    ctx.stroke();
  } else {
    const S = EGG_SHEN.stone;
    ctx.lineWidth = f;
    ctx.strokeStyle = linear(ctx, x - f, y - f, x + w + f, y + h + f, [[0, S[1]], [0.5, S[2]], [1, S[4]]]);
    ctx.strokeRect(x - f / 2, y - f / 2, w + f, h + f);
  }
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#050605';
  ctx.strokeRect(x - f - 0.75, y - f - 0.75, w + f * 2 + 1.5, h + f * 2 + 1.5);
  ctx.restore();

  // Corner gems on the winner's frame
  if (won) {
    for (const [cx, cy] of [[x - f / 2, y - f / 2], [x + w + f / 2, y - f / 2]]) drawSetGem(ctx, cx, cy, 7, EGG_SHEN.jade, true);
  }
}

/**
 * No poster (none, or it didn't load in time): a carved panel holding a
 * jade stud and the title, so the card still reads.
 */
function drawPlaceholder(ctx, box, entry) {
  const { x, y, w, h } = box;
  const seed = hashSeed(entry.title || '');
  drawNebula(ctx, x, y, w, h, { seed: seed % 997, stars: true });
  ctx.fillStyle = 'rgba(30,34,30,0.35)';
  ctx.fillRect(x, y, w, h);
  const gx = x + w * MATCHUP_IMAGE.placeholderGem.x;
  const gy = y + h * MATCHUP_IMAGE.placeholderGem.y;
  const R = Math.round(w * 0.2);
  drawStud(ctx, gx, gy, R, R * 0.48, EGG_SHEN.jade, true, seed % 89);
  const title = plain(entry.title || '');
  const px = Math.max(16, Math.round(w / 8));
  ctx.save();
  setFont(ctx, px, { family: 'display' }, title.toUpperCase());
  ctx.fillStyle = EGG_SHEN.ivory;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 6;
  const lines = wrapText(ctx, title.toUpperCase(), w - 20, 3);
  lines.forEach((line, i) => ctx.fillText(line, x + w / 2, gy + R + 18 + px + i * px * 1.15));
  ctx.restore();
}

/**
 * The red lacquer sash across the bottom of the winner's poster: the kit
 * trophy and WINNER in gold, swallowtail ends folded behind.
 */
async function drawWinnerSash(ctx, box) {
  const f = MATCHUP_IMAGE.winnerFrame;
  const R = EGG_SHEN.red;
  const top = box.y + box.h - 34;
  const height = 42;
  const x0 = box.x - f - 18;
  const x1 = box.x + box.w + f + 18;
  // The tails, behind and below
  for (const side of [-1, 1]) {
    const ex = side < 0 ? x0 : x1;
    const ix = ex - side * 26;
    ctx.beginPath();
    ctx.moveTo(ix, top + 10);
    ctx.lineTo(ex + side * 12, top + 10);
    ctx.lineTo(ex + side * 2, top + height / 2 + 10);
    ctx.lineTo(ex + side * 12, top + height + 10);
    ctx.lineTo(ix, top + height + 10);
    ctx.closePath();
    ctx.fillStyle = R[3];
    ctx.fill();
    ctx.strokeStyle = '#1a0204';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = linear(ctx, 0, top, 0, top + height, [[0, R[1]], [0.45, R[2]], [1, R[3]]]);
  ctx.fillRect(x0, top, x1 - x0, height);
  ctx.restore();
  // Gold piping along both edges
  ctx.fillStyle = goldFill(ctx, x0, top, x1, top + height);
  ctx.fillRect(x0, top + 3, x1 - x0, 2.5);
  ctx.fillRect(x0, top + height - 5.5, x1 - x0, 2.5);
  ctx.strokeStyle = '#1a0204';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x0, top, x1 - x0, height);

  const word = 'WINNER';
  ctx.save();
  ctx.letterSpacing = '4px';
  ctx.font = font(28, { family: 'display' });
  const icon = 34;
  const gap = 8;
  const wordWidth = ctx.measureText(word).width;
  const cx = box.x + box.w / 2;
  const left = cx - (icon + gap + wordWidth) / 2;
  ctx.restore();
  const drawn = await drawKitIcon(ctx, 'trophy', left, top + (height - icon) / 2, icon);
  ctx.save();
  ctx.letterSpacing = '4px';
  ctx.font = font(28, { family: 'display' });
  ctx.textAlign = drawn ? 'left' : 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(40,0,0,0.9)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = linear(ctx, 0, top + 8, 0, top + height - 8, [[0, EGG_SHEN.gold[0]], [0.5, EGG_SHEN.gold[1]], [1, EGG_SHEN.gold[2]]]);
  ctx.fillText(word, drawn ? left + icon + gap : cx, top + height / 2 + 2);
  ctx.restore();
}

/** A seed on the poster's top-left corner: red lacquer and gold for the winner, stone for the loser */
function drawSeedBadge(ctx, box, seed, won) {
  if (!seed) return;
  const cx = box.x + 6;
  const cy = box.y + 6;
  const r = won ? 21 : 17;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 3, 0, TAU);
  ctx.fillStyle = won ? goldFill(ctx, cx - r, cy - r, cx + r, cy + r) : EGG_SHEN.stone[2];
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fillStyle = won
    ? radial(ctx, cx - r * 0.3, cy - r * 0.3, r * 1.4, [[0, EGG_SHEN.red[1]], [1, EGG_SHEN.red[3]]])
    : radial(ctx, cx - r * 0.3, cy - r * 0.3, r * 1.4, [[0, EGG_SHEN.stone[3]], [1, EGG_SHEN.stone[4]]]);
  ctx.fill();
  const text = String(seed);
  ctx.save();
  ctx.font = font(text.length > 1 ? r : r * 1.15, { family: 'display' });
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = won ? EGG_SHEN.gold[1] : EGG_SHEN.mist;
  ctx.fillText(text, cx, cy + 1);
  ctx.restore();
}

/** The VS: a round stone medallion, the letters crackling blue-white */
function drawVs(ctx, { x, y, r }) {
  ctx.save();
  ctx.shadowColor = rgba(EGG_SHEN.bolt.glow, 0.9);
  ctx.shadowBlur = 26;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = '#070808';
  ctx.fill();
  ctx.restore();
  const ring = () => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); };
  drawStone(ctx, ring, [x - r, y - r, x + r, y + r], 61, { cracked: true, bevelWidth: 3 });
  // The face, sunk into the stone
  ctx.beginPath();
  ctx.arc(x, y, r - 10, 0, TAU);
  ctx.fillStyle = radial(ctx, x, y, r - 10, [[0, '#0f1a3a'], [0.7, '#060a14'], [1, '#020304']]);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(0,0,0,0.9)';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + 1, y + 1.5, r - 10, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.strokeStyle = 'rgba(222,220,204,0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Four little studs at the compass points, as on the logo's ring
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 - Math.PI / 2;
    drawSetGem(ctx, x + Math.cos(a) * (r - 4), y + Math.sin(a) * (r - 4), 4.5, EGG_SHEN.jade, true);
  }
  ctx.save();
  ctx.font = font(44, { family: 'display' });
  ctx.letterSpacing = '1px';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [blur, colour] of [[22, rgba(EGG_SHEN.bolt.glow, 1)], [10, rgba(EGG_SHEN.bolt.mid, 1)]]) {
    ctx.shadowColor = colour;
    ctx.shadowBlur = blur;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('VS', x, y + 2);
  }
  ctx.restore();
}

/** UPSET! as a red ink stamp, slapped on at an angle, worn in places */
function drawUpsetStamp(ctx, cx, cy) {
  const w = 236;
  const h = 78;
  const ink = '#ff3b3b';
  const stamp = createCanvas(w + 20, h + 20);
  const s = stamp.getContext('2d');
  s.translate(10, 10);
  s.strokeStyle = ink;
  s.lineWidth = 5;
  roundRectPath(s, 2.5, 2.5, w - 5, h - 5, 10);
  s.stroke();
  s.lineWidth = 2;
  roundRectPath(s, 10, 10, w - 20, h - 20, 6);
  s.stroke();
  s.letterSpacing = '5px';
  s.font = font(50, { family: 'display' });
  s.fillStyle = ink;
  s.textAlign = 'center';
  s.textBaseline = 'middle';
  s.fillText('UPSET!', w / 2 + 2, h / 2 + 3);
  // Wear: specks where the ink didn't take
  s.globalCompositeOperation = 'destination-out';
  const r = rng(77);
  for (let i = 0; i < 520; i++) {
    s.fillStyle = `rgba(0,0,0,${0.35 + r() * 0.65})`;
    s.beginPath();
    s.arc(r() * w, r() * h, 0.6 + r() * 2.2, 0, TAU);
    s.fill();
  }
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.17);
  ctx.shadowColor = 'rgba(255,40,40,0.55)';
  ctx.shadowBlur = 14;
  ctx.drawImage(stamp, -(w + 20) / 2, -(h + 20) / 2);
  ctx.restore();
}

/** A tie the higher seed took: a stone plaque with the kit's scales */
async function drawTieNote(ctx, cx, cy) {
  const w = 238;
  const h = 76;
  const x = cx - w / 2;
  const y = cy - h / 2;
  const path = () => roundRectPath(ctx, x, y, w, h, 12);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 4;
  path();
  ctx.fillStyle = '#0b0c0b';
  ctx.fill();
  ctx.restore();
  drawStone(ctx, path, [x, y, x + w, y + h], 83, { cracked: false, bevelWidth: 2.5 });
  roundRectPath(ctx, x + 6, y + 6, w - 12, h - 12, 8);
  ctx.fillStyle = 'rgba(5,8,7,0.82)';
  ctx.fill();
  await drawKitIcon(ctx, 'tie', x + 12, y + (h - 46) / 2, 46);
  const textX = x + 66;
  const room = x + w - 14 - textX;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.letterSpacing = '2px';
  ctx.font = font(30, { family: 'display' });
  ctx.fillStyle = EGG_SHEN.gold[1];
  ctx.fillText('TIED', textX, y + 38);
  ctx.letterSpacing = '0.5px';
  let px = 15;
  ctx.font = font(px, { weight: 700 });
  while (px > 11 && ctx.measureText('HIGHER SEED ADVANCES').width > room) ctx.font = font(--px, { weight: 700 });
  ctx.fillStyle = EGG_SHEN.ivory;
  ctx.fillText(fitText(ctx, 'HIGHER SEED ADVANCES', room), textX, y + 60);
  ctx.restore();
}

/**
 * A title under its poster, centred, on one line: shrunk a little before
 * it's cut, the year added in a quieter colour when there's room.
 */
function drawTitle(ctx, entry, cx, baseline, { won }) {
  const title = plain(entry.title || '') || 'Untitled';
  const year = entry.year ? ` (${String(entry.year).slice(0, 4)})` : '';
  // The winner's line may run wider: it's the one that matters
  const maxWidth = won ? 400 : 356;
  const options = { weight: won ? 700 : 500 };
  let px = won ? 30 : 26;
  const min = won ? 24 : 21;
  setFont(ctx, px, options, title + year);
  while (px > min && ctx.measureText(title + year).width > maxWidth) setFont(ctx, --px, options, title + year);
  const withYear = ctx.measureText(title + year).width <= maxWidth;
  const main = withYear ? title : fitText(ctx, title, maxWidth);
  const total = ctx.measureText(main + (withYear ? year : '')).width;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  const left = cx - total / 2;
  ctx.fillStyle = won ? EGG_SHEN.ivory : EGG_SHEN.mist;
  ctx.fillText(main, left, baseline);
  if (withYear && year) {
    ctx.fillStyle = won ? 'rgba(243,234,210,0.6)' : 'rgba(169,184,174,0.6)';
    ctx.fillText(year, left + ctx.measureText(main).width, baseline);
  }
  ctx.restore();
}

/**
 * The vote split: a carved channel, the winner's gold energy from the left
 * and the loser's blue from the right, meeting at the winner's share; each
 * side's share and count above its end.
 */
function drawSplit(ctx, winnerVotes, loserVotes) {
  const { bar, countsBaseline } = MATCHUP_IMAGE;
  const total = winnerVotes + loserVotes;
  const share = total > 0 ? winnerVotes / total : 0.5;
  const split = Math.round(bar.w * share);
  drawStoneChannel(ctx, bar.x, bar.y, bar.w, bar.h, { seed: 19 });
  drawEnergy(ctx, bar.x, bar.y, split, bar.h, EGG_SHEN.energy.gold, { seed: 3 });
  drawEnergy(ctx, bar.x + split, bar.y, bar.w - split, bar.h, EGG_SHEN.energy.blue, { seed: 4 });
  if (split > 0 && split < bar.w) {
    // Where they meet: a dark notch, so the boundary reads at a glance
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(bar.x + split - 1, bar.y, 2, bar.h);
  }

  const pct = (n) => (total > 0 ? Math.round((n / total) * 100) : null);
  const winnerPct = pct(winnerVotes);
  const loserPct = total > 0 ? 100 - winnerPct : null;
  drawCount(ctx, bar.x, countsBaseline, winnerPct, winnerVotes, 'left', EGG_SHEN.gold[1]);
  drawCount(ctx, bar.x + bar.w, countsBaseline, loserPct, loserVotes, 'right', '#8fb4ff');
}

/** "63%" big in the display face, "12 votes" beside it; mirrored on the right */
function drawCount(ctx, x, baseline, percent, votes, side, colour) {
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 5;
  const big = percent == null ? '' : `${percent}%`;
  const small = votesWord(votes);
  ctx.font = font(32, { family: 'display' });
  const bigWidth = big ? ctx.measureText(big).width : 0;
  ctx.font = font(21, { weight: 700 });
  const smallWidth = ctx.measureText(small).width;
  const gap = big ? 10 : 0;
  const left = side === 'left' ? x : x - (bigWidth + gap + smallWidth);
  const bigX = side === 'left' ? left : left + smallWidth + gap;
  const smallX = side === 'left' ? left + bigWidth + gap : left;
  ctx.textAlign = 'left';
  if (big) {
    ctx.font = font(32, { family: 'display' });
    ctx.fillStyle = colour;
    ctx.fillText(big, bigX, baseline);
  }
  ctx.font = font(21, { weight: 700 });
  ctx.fillStyle = EGG_SHEN.ivory;
  ctx.fillText(small, smallX, baseline);
  ctx.restore();
}

// ════════════════════════════════════════════════════════════ survey results

/** getPollResults' shape, from whatever we were given */
function surveyResults(poll, results) {
  if (Array.isArray(results)) {
    return { totalVotes: results.reduce((n, o) => n + (o.voteCount ?? o.votes?.length ?? 0), 0), results };
  }
  if (results?.results) return results;
  const options = (poll.options || []).map(o => ({ ...o, voteCount: o.votes?.length || 0 }));
  const totalVotes = options.reduce((n, o) => n + o.voteCount, 0);
  return { totalVotes, results: options.sort((a, b) => b.voteCount - a.voteCount) };
}

/**
 * Where everything in each survey row goes, measured with the real fonts:
 * the label (cut to fit), the numbers, and the bar's filled length. The
 * drawing follows it exactly; the tests check it.
 * @returns {{ height, totalVotes, rows: Array<{y, label, labelRight, stats, statsLeft, fill, share, leader, crown, number}> }}
 */
export function layoutSurveyResults(poll, results) {
  registerFonts();
  const S = SURVEY_IMAGE;
  const { totalVotes, results: options } = surveyResults(poll, results);
  const rows = options.slice(0, 10);
  // As the text card: a sole leader gets the crown; a runoff that tied again
  // was settled at random, and that pick gets it (with the dice)
  const random = poll.randomWinnerId != null ? poll.randomWinnerId : null;
  const soleLeader = totalVotes > 0 && (rows[0]?.voteCount ?? 0) > (rows[1]?.voteCount ?? -1);
  const ctx = createCanvas(4, 4).getContext('2d');
  return {
    height: surveyImageHeight(rows.length),
    totalVotes,
    rows: rows.map((option, i) => {
      const votes = option.voteCount ?? option.votes?.length ?? 0;
      const share = totalVotes > 0 ? votes / totalVotes : 0;
      const leader = random != null ? option.id === random : soleLeader && i === 0;
      const y = S.top + S.rowHeight * i;
      const stats = `${Math.round(share * 100)}%  ·  ${votesWord(votes)}`;
      ctx.font = font(22, { weight: 700 });
      const statsLeft = S.stats.right - ctx.measureText(stats).width;
      const text = plain(option.text) || `Option ${(option.id ?? i) + 1}`;
      setFont(ctx, S.label.px, { weight: 700 }, text);
      const label = fitText(ctx, text, statsLeft - S.stats.gap - S.label.x);
      return {
        y,
        label,
        labelRight: S.label.x + ctx.measureText(label).width,
        stats,
        statsLeft,
        votes,
        share,
        fill: Math.round(S.bar.w * share),
        leader,
        crown: leader ? (random != null ? 'dice' : 'crown') : null,
        number: (option.id ?? i) + 1,
      };
    }),
  };
}

/**
 * A closed survey's results as a chart: the question, then each option
 * (most votes first) with a bar for its share of the votes, the leader's
 * gold under the kit crown. 960 × (160 + 64·n) PNG.
 * @param {Object} poll - the closed poll
 * @param {Object|Array} [results] - getPollResults(poll), or its .results
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<Buffer>} rejects past the deadline or on a drawing error
 */
export function generateSurveyResultsImage(poll, results, { timeoutMs = IMAGE_TIMEOUT_MS } = {}) {
  return withDeadline(drawSurveyResults(poll, results), timeoutMs, 'Survey image');
}

async function drawSurveyResults(poll, results) {
  const S = SURVEY_IMAGE;
  const layout = layoutSurveyResults(poll, results);
  const W = S.width;
  const H = layout.height;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  // Faint stars only: bright ones would read as stray marks between the rows
  drawNebula(ctx, 0, 0, W, H, { seed: 23, starAlpha: 0.4 });

  // Header: the kit ballot box, what this is, and the question
  await drawKitIcon(ctx, 'ballot', 30, 30, 58);
  const runoff = (poll.round || 1) >= 2;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.letterSpacing = '4px';
  ctx.font = font(17, { weight: 700 });
  ctx.fillStyle = EGG_SHEN.gold[1];
  ctx.fillText(runoff ? 'RUNOFF RESULTS' : 'SURVEY RESULTS', S.label.x, 50);
  ctx.restore();
  const question = plain(poll.question) || 'Survey';
  ctx.save();
  let px = 38;
  setFont(ctx, px, { family: 'display' }, question);
  const maxQ = W - S.rim - 24 - S.label.x;
  while (px > 26 && ctx.measureText(question).width > maxQ) setFont(ctx, --px, { family: 'display' }, question);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = EGG_SHEN.ivory;
  ctx.fillText(fitText(ctx, question, maxQ), S.label.x, 94);
  ctx.restore();
  // A gold rule under the header, a jade gem at its heart
  const ruleY = S.top - 10;
  ctx.fillStyle = linear(ctx, 30, 0, W - 30, 0, [[0, rgba(EGG_SHEN.gold[3], 0)], [0.15, rgba(EGG_SHEN.gold[2], 0.9)], [0.5, EGG_SHEN.gold[1]], [0.85, rgba(EGG_SHEN.gold[2], 0.9)], [1, rgba(EGG_SHEN.gold[3], 0)]]);
  ctx.fillRect(30, ruleY - 1, W - 60, 2.5);
  drawSetGem(ctx, W / 2, ruleY, 6, EGG_SHEN.jade, true);

  for (const [i, row] of layout.rows.entries()) {
    const gold = row.leader;
    // Badge: the crown (or the dice) for the leader, else the option's number
    if (row.crown) {
      await drawKitIcon(ctx, row.crown, S.badge.cx - 22, row.y + S.badge.dy - 24, 44);
    } else {
      drawNumberBadge(ctx, S.badge.cx, row.y + S.badge.dy, S.badge.r, row.number);
    }
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 1;
    setFont(ctx, S.label.px, { weight: 700 }, row.label);
    ctx.textAlign = 'left';
    ctx.fillStyle = gold ? EGG_SHEN.gold[1] : EGG_SHEN.ivory;
    ctx.fillText(row.label, S.label.x, row.y + S.label.dy);
    ctx.font = font(22, { weight: 700 });
    ctx.textAlign = 'right';
    ctx.fillStyle = gold ? EGG_SHEN.gold[0] : EGG_SHEN.mist;
    ctx.fillText(row.stats, S.stats.right, row.y + S.label.dy);
    ctx.restore();
    drawStoneChannel(ctx, S.bar.x, row.y + S.bar.dy, S.bar.w, S.bar.h, { seed: 40 + i, lip: 4 });
    drawEnergy(ctx, S.bar.x, row.y + S.bar.dy, row.fill, S.bar.h, gold ? EGG_SHEN.energy.gold : EGG_SHEN.energy.blue, { seed: 60 + i });
  }

  // Footer: the total, and how a tie went
  const notes = [votesWord(layout.totalVotes)];
  if (poll.randomWinnerId != null) notes.push('tied again, so the bot picked at random');
  else if (poll.runoffPollId) notes.push('tied for first: runoff below');
  if (poll.allowMultipleVotes) notes.push('multiple votes allowed');
  ctx.save();
  ctx.font = font(18, { weight: 500 });
  ctx.fillStyle = EGG_SHEN.mist;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(notes.join('  ·  '), S.label.x, H - S.rim - 8);
  ctx.restore();

  drawStoneFrame(ctx, W, H, { rim: S.rim, radius: 22, seed: 13, studRadius: 18 });
  return canvas.encode('png'); // off the main thread: a PNG this size takes ~100 ms
}

/** An option's number on a small stone disc */
function drawNumberBadge(ctx, cx, cy, r, n) {
  const disc = () => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); };
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 6;
  disc();
  ctx.fillStyle = '#0b0c0b';
  ctx.fill();
  ctx.restore();
  drawStone(ctx, disc, [cx - r, cy - r, cx + r, cy + r], 100 + n, { cracked: false, bevelWidth: 2 });
  ctx.beginPath();
  ctx.arc(cx, cy, r - 5, 0, TAU);
  ctx.fillStyle = 'rgba(5,8,7,0.8)';
  ctx.fill();
  ctx.save();
  ctx.font = font(n >= 10 ? 17 : 20, { family: 'display' });
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = EGG_SHEN.ivory;
  ctx.fillText(String(n), cx, cy + 1);
  ctx.restore();
}

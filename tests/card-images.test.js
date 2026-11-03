/**
 * The drawn result cards (src/utils/cardImages.js), checked on their
 * pixels against the exported layout: the matchup result (the winner's
 * gold-and-jade frame, the vote split, a missing poster's placeholder,
 * the deadline) and the survey chart (its size, bar lengths, labels that
 * stay in their place).
 *
 * No network: posters are PNGs made here, served by an injected fetchImpl.
 *
 * Run with: npm test -- tests/card-images.test.js
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import {
  generateMatchupResultImage, generateSurveyResultsImage, layoutSurveyResults,
  MATCHUP_IMAGE, SURVEY_IMAGE, surveyImageHeight,
} from '../src/utils/cardImages.js';
import { clearImageCache } from '../src/utils/canvasKit.js';

const MAGENTA = [255, 0, 255];

function png(w, h, [r, g, b]) {
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, w, h);
  return c.toBuffer('image/png');
}

/** Posters by URL; anything else is a 404 */
function posterServer(posters) {
  return jest.fn(async (url) => (posters[url]
    ? new Response(posters[url], { status: 200, headers: { 'content-type': 'image/png' } })
    : new Response('', { status: 404, headers: { 'content-type': 'text/plain' } })));
}

/** Decode a PNG and read it pixel by pixel */
async function pixels(buffer) {
  const img = await loadImage(buffer);
  const ctx = createCanvas(img.width, img.height).getContext('2d');
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, img.width, img.height);
  const at = (x, y) => {
    const i = (Math.round(y) * img.width + Math.round(x)) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
  return { width: img.width, height: img.height, at };
}

const isGold = ([r, g, b]) => r > 170 && g > 110 && b < 110 && r > b + 80;
const isJade = ([r, g, b]) => g > 150 && g > r + 40 && g > b + 40;
const isBlue = ([r, g, b]) => b > r + 60 && b > 120;
const lum = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;

function count(px, x0, y0, x1, y1, pred) {
  let n = 0;
  for (let x = Math.round(x0); x < x1; x++) for (let y = Math.round(y0); y < y1; y++) if (pred(px.at(x, y))) n++;
  return n;
}

/** Gold or jade pixels in the band `band` px wide just outside a poster box, down its two sides */
function frameColour(px, box, band) {
  const y0 = box.y + box.h * 0.25; // clear of the corner badges and gems
  const y1 = box.y + box.h * 0.7; // and of the WINNER sash
  const pred = (p) => isGold(p) || isJade(p);
  return count(px, box.x - band, y0, box.x, y1, pred) + count(px, box.x + box.w, y0, box.x + box.w + band, y1, pred);
}

const matchup = (over = {}) => ({
  round: 'quarterfinals',
  label: '1A',
  winner: { title: 'The Thing', year: '1982', posterUrl: 'https://img.test/thing.png', votes: 12, seed: 2 },
  loser: { title: 'Halloween', year: '1978', posterUrl: 'https://img.test/halloween.png', votes: 7, seed: 7 },
  ...over,
});
const POSTERS = { 'https://img.test/thing.png': png(200, 300, MAGENTA), 'https://img.test/halloween.png': png(200, 300, [180, 30, 30]) };

let warn;
beforeEach(() => {
  clearImageCache();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

describe('the matchup result image', () => {
  test('is 960×540, with both posters where the layout puts them, the loser dimmed', async () => {
    const fetchImpl = posterServer(POSTERS);
    const px = await pixels(await generateMatchupResultImage(matchup(), { fetchImpl }));
    expect([px.width, px.height]).toEqual([960, 540]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const W = MATCHUP_IMAGE.winner;
    const L = MATCHUP_IMAGE.loser;
    // The winner's poster as it is, in the open part of its box
    expect(px.at(W.x + W.w / 2, W.y + W.h * 0.45)).toEqual(MAGENTA);
    // The loser's drained and darkened: no longer red, and dim
    const loser = px.at(L.x + L.w / 2, L.y + L.h * 0.45);
    expect(loser[0] - loser[2]).toBeLessThan(40);
    expect(lum(loser)).toBeLessThan(lum([180, 30, 30]));
  });

  test("the gold-and-jade frame is round the winner's poster, not the loser's", async () => {
    const px = await pixels(await generateMatchupResultImage(matchup(), { fetchImpl: posterServer(POSTERS) }));
    const band = MATCHUP_IMAGE.winnerFrame;
    const side = MATCHUP_IMAGE.winner.h * 0.45 * band * 2;
    expect(frameColour(px, MATCHUP_IMAGE.winner, band)).toBeGreaterThan(side * 0.8);
    expect(frameColour(px, MATCHUP_IMAGE.loser, band)).toBe(0);
  });

  test("the split bar's gold ends at the winner's share of the votes (±2%)", async () => {
    const { bar } = MATCHUP_IMAGE;
    for (const [w, l] of [[12, 7], [3, 1], [9, 8], [17, 3], [1, 0]]) {
      clearImageCache();
      const px = await pixels(await generateMatchupResultImage(matchup({
        winner: { ...matchup().winner, votes: w },
        loser: { ...matchup().loser, votes: l },
      }), { fetchImpl: posterServer(POSTERS) }));
      // Each column of the bar: mostly gold, or mostly blue?
      const kind = (x) => {
        const g = count(px, x, bar.y, x + 1, bar.y + bar.h, isGold);
        const b = count(px, x, bar.y, x + 1, bar.y + bar.h, isBlue);
        return g > bar.h / 2 ? 'gold' : b > bar.h / 2 ? 'blue' : null;
      };
      let lastGold = -1;
      let firstBlue = bar.x + bar.w;
      for (let x = bar.x; x < bar.x + bar.w; x++) {
        const k = kind(x);
        if (k === 'gold') lastGold = x;
        if (k === 'blue' && x < firstBlue) firstBlue = x;
      }
      expect(lastGold).toBeGreaterThan(bar.x); // there is gold
      expect(firstBlue).toBeGreaterThan(lastGold); // and all of it on the left
      const boundary = (lastGold + 1 + firstBlue) / 2;
      expect(Math.abs((boundary - bar.x) / bar.w - w / (w + l))).toBeLessThanOrEqual(0.02);
    }
  });

  test('a poster that fails to load gets the jade placeholder; the image is still made', async () => {
    const fetchImpl = posterServer({}); // every poster a 404
    const px = await pixels(await generateMatchupResultImage(matchup(), { fetchImpl }));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const W = MATCHUP_IMAGE.winner;
    const gx = W.x + W.w * MATCHUP_IMAGE.placeholderGem.x;
    const gy = W.y + W.h * MATCHUP_IMAGE.placeholderGem.y;
    expect(count(px, gx - 18, gy - 18, gx + 18, gy + 18, isJade)).toBeGreaterThan(80);

    // …where a poster that loads shows the poster instead
    clearImageCache();
    const ok = await pixels(await generateMatchupResultImage(matchup(), { fetchImpl: posterServer(POSTERS) }));
    expect(count(ok, gx - 18, gy - 18, gx + 18, gy + 18, isJade)).toBe(0);
    // No poster URL at all: the same placeholder, and nothing fetched
    const none = posterServer(POSTERS);
    const bye = await pixels(await generateMatchupResultImage(matchup({ winner: { title: 'Alien', votes: 3 }, loser: null }), { fetchImpl: none }));
    expect(none).not.toHaveBeenCalled();
    expect(count(bye, gx - 18, gy - 18, gx + 18, gy + 18, isJade)).toBeGreaterThan(80);
  });

  test('a poster that hangs gets the placeholder in time; a drawing past the deadline is given up', async () => {
    const hang = jest.fn(() => new Promise(() => {}));
    const started = performance.now();
    // 4 s overall leaves the poster wait 2.5 s and the drawing the same
    // 1.5 s margin production has (5 s → 3.5 s for posters). A tighter
    // deadline made this flaky under the full suite's load: the first draw
    // (fonts registering, icons decoding) can pass a second on a busy box.
    const buffer = await generateMatchupResultImage(matchup(), { fetchImpl: hang, timeoutMs: 4000 });
    expect(performance.now() - started).toBeLessThan(4000);
    const px = await pixels(buffer);
    const W = MATCHUP_IMAGE.winner;
    const gx = W.x + W.w * MATCHUP_IMAGE.placeholderGem.x;
    const gy = W.y + W.h * MATCHUP_IMAGE.placeholderGem.y;
    expect(count(px, gx - 18, gy - 18, gx + 18, gy + 18, isJade)).toBeGreaterThan(80);

    await expect(generateMatchupResultImage(matchup(), { fetchImpl: posterServer(POSTERS), timeoutMs: 1 }))
      .rejects.toThrow(/took longer than 1 ms/);
  });
});

describe('the survey results chart', () => {
  const option = (id, text, votes) => ({ id, text, emoji: '', votes: Array.from({ length: votes }, (_, i) => `u${id}-${i}`) });
  const poll = (options, extra = {}) => ({ pollId: 'p1', question: 'Friday double feature?', status: 'closed', options, ...extra });

  /** How far each row's bar is filled, read off the pixels: columns mostly energy, not the dark groove */
  function filled(px, row) {
    const { bar } = SURVEY_IMAGE;
    const y0 = row.y + bar.dy;
    let last = bar.x - 1;
    for (let x = bar.x; x < bar.x + bar.w; x++) {
      const lit = count(px, x, y0, x + 1, y0 + bar.h, (p) => isGold(p) || isBlue(p));
      if (lit > bar.h / 2) last = x;
    }
    return (last + 1 - bar.x) / bar.w;
  }

  test('is 960 × (160 + 64 per option)', async () => {
    for (const n of [2, 5, 10]) {
      const p = poll(Array.from({ length: n }, (_, i) => option(i, `Option ${i + 1}`, i)));
      const px = await pixels(await generateSurveyResultsImage(p));
      expect([px.width, px.height]).toEqual([960, 160 + 64 * n]);
      expect(px.height).toBe(surveyImageHeight(n));
    }
  });

  test('each bar is as long as its share of the votes (±2%), the leader in gold under the crown', async () => {
    const p = poll([option(0, 'Halloween', 14), option(1, 'The Thing', 9), option(2, 'Alien', 5), option(3, 'Jaws', 2), option(4, 'Nope', 0)]);
    const results = { totalVotes: 30, results: [...p.options].map(o => ({ ...o, voteCount: o.votes.length })).sort((a, b) => b.voteCount - a.voteCount) };
    const px = await pixels(await generateSurveyResultsImage(p, results));
    const { rows } = layoutSurveyResults(p, results);
    expect(rows.map(r => r.label)).toEqual(['Halloween', 'The Thing', 'Alien', 'Jaws', 'Nope']);
    for (const row of rows) {
      expect(Math.abs(filled(px, row) - row.votes / 30)).toBeLessThanOrEqual(0.02);
    }
    // Gold bar and crown for the leader only; the rest blue, with their number
    const { bar, badge } = SURVEY_IMAGE;
    // The start of each bar, by majority (the bolts running through it are pale)
    const barColour = (row) => {
      const area = [bar.x, row.y + bar.dy, bar.x + 20, row.y + bar.dy + bar.h];
      const gold = count(px, ...area, isGold);
      const blue = count(px, ...area, isBlue);
      return gold > blue * 3 ? 'gold' : blue > gold * 3 ? 'blue' : null;
    };
    expect(barColour(rows[0])).toBe('gold');
    expect(rows.slice(1, 4).map(barColour)).toEqual(['blue', 'blue', 'blue']);
    const crownGold = (row) => count(px, badge.cx - 22, row.y + badge.dy - 22, badge.cx + 22, row.y + badge.dy + 22, isGold);
    expect(crownGold(rows[0])).toBeGreaterThan(150);
    expect(rows.slice(1).every(r => crownGold(r) === 0)).toBe(true);
    expect(rows.map(r => r.crown)).toEqual(['crown', null, null, null, null]);
  });

  test('a tie for first crowns no one; no votes at all leaves every bar empty', async () => {
    const tied = poll([option(0, 'Pizza', 3), option(1, 'Tacos', 3)]);
    expect(layoutSurveyResults(tied).rows.map(r => r.crown)).toEqual([null, null]);
    const empty = poll([option(0, 'Pizza', 0), option(1, 'Tacos', 0)]);
    const px = await pixels(await generateSurveyResultsImage(empty));
    for (const row of layoutSurveyResults(empty).rows) expect(filled(px, row)).toBe(0);
    // A runoff settled at random: the pick gets the dice, as on the text card
    const random = poll([option(0, 'Pizza', 2), option(1, 'Tacos', 2)], { randomWinnerId: 1, round: 2 });
    expect(layoutSurveyResults(random).rows.find(r => r.label === 'Tacos').crown).toBe('dice');
  });

  test('ten options of 100 characters stay inside the canvas, each label clear of its numbers', async () => {
    const long = (i) => `Option ${i + 1} `.padEnd(100, 'wxyz ');
    const p = poll(Array.from({ length: 10 }, (_, i) => option(i, long(i), 10 - i)), {
      question: 'Which of these extremely long-titled options deserves to win this very long survey question?'.repeat(3),
    });
    const px = await pixels(await generateSurveyResultsImage(p));
    expect([px.width, px.height]).toEqual([960, 800]);
    const { rows } = layoutSurveyResults(p);
    const { label, stats, rim } = SURVEY_IMAGE;
    for (const row of rows) {
      expect(row.label.endsWith('…')).toBe(true);
      expect(row.labelRight).toBeLessThanOrEqual(row.statsLeft - stats.gap);
      expect(row.statsLeft).toBeGreaterThan(label.x + 300);
      expect(stats.right).toBeLessThan(960 - rim);
      // On the pixels: nothing bright (text) between the label's end and the numbers
      const text = count(px, row.labelRight + 3, row.y + 6, row.statsLeft - 3, row.y + label.dy + 6, (p) => lum(p) > 200);
      expect(text).toBe(0);
    }
  });
});

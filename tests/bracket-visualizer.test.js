/**
 * The bracket image's winner tile. A winner used to be filled solid
 * light blue with dark text; it now looks like every other title (poster
 * background, light text), drawn slightly larger, with a shining trophy.
 *
 * Asserted on the rendered pixels. No titles carry a poster, so nothing
 * reaches the network and every tile's fill is the plain card colour.
 */

import { createCanvas, loadImage } from '@napi-rs/canvas';
import { generateBracketImage } from '../src/utils/bracketVisualizer.js';

// Layout for a four-title bracket (bracketVisualizer.js constants): one
// semifinal per side, the left one at x 60–300, centred on y 210 — so its
// top title spans y 155–205 and its bottom title y 215–265.
const LEFT = 60;
const WIDTH = 240;
const TOP_TITLE = { y: 155, h: 50 };
const BOTTOM_TITLE = { y: 215, h: 50 };

const BACKGROUND = [25, 30, 35];
const CARD = [35, 42, 48];
const OLD_WINNER_BLUE = [78, 197, 237];

const halloween = { id: 948, type: 'movie', title: 'Halloween' };
const scream = { id: 4232, type: 'movie', title: 'Scream' };
const alien = { id: 348, type: 'movie', title: 'Alien' };
const thing = { id: 1091, type: 'movie', title: 'The Thing' };

function tournament({ decided }) {
  return {
    name: 'Test Tournament',
    phase: 'knockout',
    knockoutBracket: [
      { id: 'sf1', round: 'semifinals', position: 0, movie1: halloween, movie2: scream, status: decided ? 'completed' : 'voting' },
      { id: 'sf2', round: 'semifinals', position: 1, movie1: alien, movie2: thing, status: 'voting' },
      { id: 'final', round: 'finals', position: 0, movie1: null, movie2: null, status: 'pending' },
    ],
    // Results store the winning title itself (bracketProgress.winnerSide)
    knockoutResults: decided ? { sf1: { winner: halloween } } : {},
  };
}

async function render(t) {
  const img = await loadImage(await generateBracketImage(t));
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const { data, width } = ctx.getImageData(0, 0, img.width, img.height);
  return (x, y) => {
    const i = (Math.round(y) * width + Math.round(x)) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
}

const near = (a, b, tol = 4) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
const isGold = ([r, g, b]) => r > 200 && g > 140 && b < 120;

function goldPixels(px, tile) {
  // The right-hand end of a title tile, where the trophy sits
  let count = 0;
  for (let x = LEFT + WIDTH - 45; x < LEFT + WIDTH + 5; x++) {
    for (let y = tile.y - 2; y < tile.y + tile.h + 2; y++) {
      if (isGold(px(x, y))) count++;
    }
  }
  return count;
}

describe('bracket image — the winning title', () => {
  let decided;
  let undecided;

  beforeAll(async () => {
    decided = await render(tournament({ decided: true }));
    undecided = await render(tournament({ decided: false }));
  });

  test('is filled like any other title, not solid blue', () => {
    // Away from the text (left, centred) and the trophy (right)
    const winnerFill = decided(LEFT + 150, TOP_TITLE.y + 9);
    const loserFill = decided(LEFT + 150, BOTTOM_TITLE.y + 9);
    expect(near(winnerFill, OLD_WINNER_BLUE, 30)).toBe(false);
    expect(near(winnerFill, CARD)).toBe(true);
    expect(near(winnerFill, loserFill)).toBe(true);
  });

  test('is drawn larger than its slot, so it stands out from its opponent', () => {
    // Just left of the matchup's frame: background for an ordinary title,
    // inside the enlarged winner's tile
    expect(near(undecided(LEFT - 6, TOP_TITLE.y + 25), BACKGROUND)).toBe(true);
    expect(near(decided(LEFT - 6, TOP_TITLE.y + 25), CARD)).toBe(true);
    // The loser stays its normal size
    expect(near(decided(LEFT - 6, BOTTOM_TITLE.y + 25), BACKGROUND)).toBe(true);
  });

  test('carries a gold trophy; the loser and undecided titles do not', () => {
    expect(goldPixels(decided, TOP_TITLE)).toBeGreaterThan(40);
    expect(goldPixels(decided, BOTTOM_TITLE)).toBe(0);
    expect(goldPixels(undecided, TOP_TITLE)).toBe(0);
  });
});

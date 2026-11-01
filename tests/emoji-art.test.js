/**
 * The emoji kit's art (scripts/emoji-styles/egg-shen.js) and what's built
 * from it (assets/emojis/): every kit code is drawn and has a 128×128 PNG
 * with a transparent background; bar segments join; and the committed
 * manifest matches KIT_CODES and the PNGs' bytes.
 *
 * The manifest checks are a drift guard. The server never builds (it
 * installs with --omit=dev) and the sync uploads by manifest hash, so a
 * PNG changed without a rebuild ships under the old emoji's name — and
 * Discord keeps showing the old image. When they fail: run
 * `npm run build:emojis` and commit assets/emojis/.
 *
 * Nothing is re-rendered here: drawing all 64 is slow, and canvas output
 * can differ between machines, so a re-render could disagree with a
 * committed PNG that is correct.
 *
 * EMOJI_ASSETS_DIR (the folder the bot uploads from, emojiSync.js) points
 * the checks at another copy of assets/emojis/.
 *
 * Run with: npm test -- tests/emoji-art.test.js
 */

import { describe, test, expect } from '@jest/globals';
import { createHash } from 'node:crypto';
import fs from 'fs';
import path from 'path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { KIT_CODES } from '../src/utils/emojiKit.js';
import style from '../scripts/emoji-styles/egg-shen.js';

const ASSETS = process.env.EMOJI_ASSETS_DIR || path.join(process.cwd(), 'assets', 'emojis');
const REBUILD = 'Run `npm run build:emojis` and commit assets/emojis/.';
const codes = Object.keys(KIT_CODES);
const sha4 = (bytes) => createHash('sha256').update(bytes).digest('hex').slice(0, 4);
const readPng = (code) => fs.readFileSync(path.join(ASSETS, `${code}.png`));
const readManifest = () => JSON.parse(fs.readFileSync(path.join(ASSETS, 'manifest.json'), 'utf8'));

/** Every way the manifest disagrees with KIT_CODES and the PNGs; [] when it doesn't */
function driftReport(manifest, bytesOf = readPng) {
  const problems = [];
  for (const code of codes) {
    const entry = manifest[code];
    if (!entry) { problems.push(`${code}: missing from manifest.json`); continue; }
    const actual = sha4(bytesOf(code));
    if (entry.hash !== actual) problems.push(`${code}: manifest.json says ${entry.hash}, ${code}.png hashes to ${actual}`);
  }
  for (const code of Object.keys(manifest)) {
    if (!KIT_CODES[code]) problems.push(`${code}: in manifest.json but not in KIT_CODES`);
  }
  return problems.length ? [...problems, REBUILD] : [];
}

/** Width, height and colour type, straight from a PNG's IHDR chunk */
function pngHeader(bytes) {
  const signature = bytes.subarray(0, 8).toString('hex');
  return {
    png: signature === '89504e470d0a1a0a' && bytes.subarray(12, 16).toString('ascii') === 'IHDR',
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    colourType: bytes[25], // 6 = RGBA
  };
}

async function pixels(code) {
  const img = await loadImage(readPng(code));
  const ctx = createCanvas(img.width, img.height).getContext('2d');
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, img.width, img.height);
}

describe('drawings', () => {
  test('every kit code is drawn, and every drawing is a kit code', () => {
    expect([...style.codes].sort()).toEqual([...codes].sort());
  });
});

describe('built PNGs', () => {
  test('every code has a 128×128 RGBA PNG with a transparent background', async () => {
    const wrong = [];
    for (const code of codes) {
      const file = path.join(ASSETS, `${code}.png`);
      if (!fs.existsSync(file)) { wrong.push(`${code}: no ${code}.png`); continue; }
      const h = pngHeader(readPng(code));
      if (!h.png || h.width !== 128 || h.height !== 128 || h.colourType !== 6) {
        wrong.push(`${code}: ${h.png ? `${h.width}×${h.height}, colour type ${h.colourType}` : 'not a PNG'}`);
        continue;
      }
      // a transparent corner: the art sits on nothing, not on a filled square
      const { data } = await pixels(code);
      if (data[3] !== 0) wrong.push(`${code}: top-left pixel isn't transparent`);
    }
    expect(wrong).toEqual([]);
  });

  test('bar segments join: every joining edge is solid on the same rows', async () => {
    // Segments sit side by side in a line of text, so a left cap's right
    // edge, both edges of a middle, and a right cap's left edge must all
    // cover the same rows, whatever the fill — or a seam shows in the bar.
    const edgeAlpha = async (code, x) => {
      const { data, width } = await pixels(code);
      return Array.from({ length: 128 }, (_, y) => data[(y * width + x) * 4 + 3]);
    };
    const reference = await edgeAlpha('bgm', 0);
    expect(reference.filter(a => a > 250).length).toBeGreaterThan(64); // the bar really is there
    const wrong = [];
    for (const code of codes.filter(c => KIT_CODES[c].family === 'bar')) {
      const part = code[2];
      const edges = part === 'l' ? [127] : part === 'r' ? [0] : [0, 127];
      for (const x of edges) {
        const alpha = await edgeAlpha(code, x);
        const off = alpha.findIndex((a, y) => Math.abs(a - reference[y]) > 8);
        if (off >= 0) wrong.push(`${code} x=${x}: row ${off} alpha ${alpha[off]}, expected ${reference[off]}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});

describe('manifest.json', () => {
  test('lists exactly the kit codes, each with its family and fallback', () => {
    const manifest = readManifest();
    expect(Object.keys(manifest).sort()).toEqual([...codes].sort());
    for (const code of codes) {
      expect({ code, ...manifest[code] }).toEqual({
        code,
        hash: expect.stringMatching(/^[0-9a-f]{4}$/),
        family: KIT_CODES[code].family,
        fallback: KIT_CODES[code].fallback,
        source: expect.stringMatching(/^(drawn|art)$/),
      });
    }
  });

  test('each hash is the sha256 of that code\'s PNG — nothing changed without a rebuild', () => {
    expect(driftReport(readManifest())).toEqual([]);
  });

  test('the drift guard catches a PNG changed by a single byte', () => {
    // a manifest that matches the PNGs as they are, then one byte flipped
    const matching = Object.fromEntries(codes.map(c => [c, { hash: sha4(readPng(c)) }]));
    expect(driftReport(matching)).toEqual([]);
    const tampered = (code) => {
      const bytes = Buffer.from(readPng(code));
      if (code === 'gpie') bytes[bytes.length - 20] ^= 0x01;
      return bytes;
    };
    const report = driftReport(matching, tampered);
    expect(report).toHaveLength(2);
    expect(report[0]).toMatch(/^gpie: manifest\.json says [0-9a-f]{4}, gpie\.png hashes to [0-9a-f]{4}$/);
    expect(report[1]).toBe(REBUILD);
  });
});

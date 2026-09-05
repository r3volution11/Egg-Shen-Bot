#!/usr/bin/env node
/**
 * Builds this project's web-page assets: the selective Bootstrap CSS,
 * compiled once per named theme in scripts/web-themes.json (colors derived
 * from each theme's primaryColor — see generate-palette.js) to
 * public/css/themes/<theme>/bootstrap.min.css, and the selective Bootstrap
 * JS bundle (Tab only — see public/js-src/bootstrap-entry.js), which is
 * color-independent and stays a single shared file for every theme.
 *
 * Usage:
 *   node scripts/build-web-assets.js         # both
 *   node scripts/build-web-assets.js --css    # CSS only
 *   node scripts/build-web-assets.js --js     # JS only
 *
 * Run via `npm run build:web` (or `build:css`/`build:js`). This project's
 * own deploy runs this after `npm install`, before restarting the bot —
 * see DEPLOYMENT.md. A self-hoster who just clones the repo doesn't need
 * to run this at all: a CI-maintained fallback build is committed for
 * exactly that "zero build step" case — see
 * .github/workflows/build-web-fallback.yml.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import * as sass from 'sass';
import * as esbuild from 'esbuild';
import { main as generatePaletteFile, loadThemeManifest } from './generate-palette.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

// custom.scss always imports this fixed filename — each theme's generated
// palette is copied here right before compiling that theme, one at a time,
// so custom.scss/_kept-utilities.scss never need to know a theme's name.
const PALETTE_IMPORT_TARGET = path.join(ROOT, 'public/scss/_generated-palette.scss');

async function buildCss() {
  generatePaletteFile();

  const themes = Object.keys(loadThemeManifest());
  for (const theme of themes) {
    const themePalette = path.join(ROOT, `public/scss/_generated-palette-${theme}.scss`);
    fs.copyFileSync(themePalette, PALETTE_IMPORT_TARGET);

    const entry = path.join(ROOT, 'public/scss/custom.scss');
    const result = sass.compile(entry, {
      loadPaths: [path.join(ROOT, 'node_modules'), path.join(ROOT, 'public/scss')],
      style: 'compressed',
      quietDeps: true, // silences Bootstrap's own upstream @import/legacy-color-function deprecation warnings — not something this project's code causes or can fix
    });

    const outPath = path.join(ROOT, `public/css/themes/${theme}/bootstrap.min.css`);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, result.css);
    console.log(`✓ Built ${path.relative(ROOT, outPath)} (${(result.css.length / 1024).toFixed(1)}KB)`);
  }
}

async function buildJs() {
  const entry = path.join(ROOT, 'public/js-src/bootstrap-entry.js');
  const outPath = path.join(ROOT, 'public/js/bootstrap.min.js');

  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    minify: true,
    outfile: outPath,
    logLevel: 'warning',
  });

  const { size } = fs.statSync(outPath);
  console.log(`✓ Built ${path.relative(ROOT, outPath)} (${(size / 1024).toFixed(1)}KB)`);
}

async function main() {
  const args = process.argv.slice(2);
  const cssOnly = args.includes('--css');
  const jsOnly = args.includes('--js');

  if (jsOnly) {
    await buildJs();
    return;
  }
  if (cssOnly) {
    await buildCss();
    return;
  }
  await buildCss();
  await buildJs();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('✗ Build failed:', error.message);
    process.exit(1);
  });
}

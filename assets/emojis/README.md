# The emoji kit's art

The small icons on the bot's cards: bar segments, ticks, the nights row,
medals, game icons, Glovebox items, and the Big Trouble set (the
Six-Demon Bag's six elements, Chi, the honours, the bosses and the
expansion's happenings). Every code in `KIT_CODES`
(`src/utils/emojiKit.js`) is drawn in code, in one house style — **Egg
Shen's Magic**, the logo carried into the kit: carved dark stone with pale
bevelled edges, diamond studs with jade gems, crackling blue lightning, red
cord, old gold, and red paper lanterns for the nights row.

The drawings live in `scripts/emoji-styles/egg-shen.js` (shared helpers in
`common.js` and `shapes.js` beside it). This folder holds what gets built
from them:

| File | What it is |
| --- | --- |
| `<code>.png` | 128×128 RGBA. Uploaded to Discord as the application emoji `es_<code>_<hash>`. |
| `manifest.json` | `{ "<code>": { hash, family, fallback, source } }`. `hash` is the first 4 hex characters of the sha256 of that PNG's bytes; `source` is `drawn` or `art`. The sync (`src/utils/emojiSync.js`) reads only `hash`. |
| `contact-sheet.png` | Every code at 64 px, then the kit in context on Discord's dark (#313338) and light (#F2F3F5) themes at the real inline size (22 px) and at 2× (44 px), then a Big Trouble strip: the expansion's icons in mock card lines on both themes (`BIG_TROUBLE` in `scripts/build-emojis.js`). |
| `art/<code>.png` | Optional: your own image for one code (see below). |

**Commit all of it.** The server installs with `npm install --omit=dev` and
never builds, so PNGs and a manifest that aren't committed don't ship.
`tests/emoji-art.test.js` fails if the manifest no longer matches the PNGs
or `KIT_CODES`.

## Change a drawing

1. Edit its painter in `scripts/emoji-styles/egg-shen.js`. Each painter
   draws one code on a 128-unit grid; the build then gives every icon the
   same dark outline (`finish()` in `common.js`).
2. `npm run build:emojis`
3. Open `contact-sheet.png` and judge the **22 px rows** on both themes —
   that's what people actually see. The 64 px grid at the top is for
   finding what to fix.
4. `npm test -- tests/emoji-art.test.js`, then commit `assets/emojis/`
   with the drawing.

Only the codes whose drawings changed get new hashes: everything random in
the drawings is seeded, so a rebuild writes byte-identical PNGs. If a
rebuild on another machine changes PNGs you didn't touch, that's the
canvas library drawing a pixel differently there — don't commit those, or
every changed one is uploaded again for nothing.

What holds up at 22 px, where one screen pixel is about six art units:

- **The silhouette carries the meaning.** Two or three colours and a shape
  you'd know in the dark; fine detail is for 44 px screens.
- **Every icon gets the same outline** from `finish()`. It's what keeps a
  pale icon visible on the light theme. Don't paint your own.
- **Dark things need a pale rim inside the outline** (a stone bevel, a
  glass edge, an unlit lantern's rim), or they vanish on the dark theme.
- **Light comes from the top-left.** Highlight the upper-left edges, shade
  the lower-right.
- **Keep bodies inside about 8..120**, so the outline isn't cut off at the
  image's edge.

**Bars are seven fills × three parts** (`b<fill><l|m|r>`), all from one
`bar()` painter. Segments sit side by side in a line of text, so on the
joining sides everything must be a vertical gradient (no change along x),
and the lightning must cross each segment edge on a fixed row. Every middle
segment is the same image, so anything that varies along x repeats every
22 px — that's why the empty groove's smoke is a wave exactly one segment
long rather than specks. The test checks that every joining edge covers the
same rows.

## Use your own image for one code

Put a square PNG at `assets/emojis/art/<code>.png`, for example
`art/gpie.png`, and rebuild. The build uses it instead of the drawing:

- **Size.** 128×128 is used as is. 16, 32 or 64 px (pixel art) is scaled up
  with hard edges; any other size is scaled smoothly. Keep the background
  transparent and give it a dark outline, so it shows on both themes.
- **Hash.** The manifest's hash covers the PNG the build writes, and
  `source` becomes `"art"`. Saving a changed file uploads a new version.
- **Undo.** Delete the file and rebuild to go back to the drawing.

The contact sheet marks these "(png)".

## Why uploaded names carry a hash, and why nothing is deleted

A custom emoji in a message is stored as `<:es_coin_3fa9:1234…>`: its name
and its ID. Discord looks up the image by ID every time the message is
shown, and can't change an uploaded emoji's image. So:

- **Changed art goes up as a new emoji.** A changed PNG has a new hash, so
  a new name, so the sync uploads it. New messages use it; old ones keep
  showing the version they were sent with.
- **Old versions are never deleted automatically.** Deleting one would turn
  every old message that used it into raw `:es_coin_3fa9:` text.
  `node scripts/deploy-emojis.js --prune` removes only versions that are
  missing from the manifest *and* older than 30 days, and only when someone
  runs it.
- **Don't rename `es_*` emojis by hand** in the Developer Portal. The sync
  finds them by name.

## Add a code

1. Add the code to `KIT_CODES` in `src/utils/emojiKit.js`. It needs a family
   and a plain-emoji fallback, and a name of 1–6 lowercase letters or digits.
2. Add its painter to the `icons` in `scripts/emoji-styles/egg-shen.js`.
3. Run `npm run build:emojis` and commit `assets/emojis/`.

The build refuses to run, and the test fails, until every code has a
drawing and every drawing has a code.

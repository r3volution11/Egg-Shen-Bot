# The bot's fonts

The faces the bot draws its images with: the tournament bracket
(`src/utils/bracketVisualizer.js`) and the result cards
(`src/utils/cardImages.js`). They ship with the bot because the production
server is a bare Linux box. It has no Arial, maybe DejaVu, and no colour
emoji. The bracket used to look for Arial in five system paths on every
start and fall back to whatever it found. `registerFonts()` in
`src/utils/canvasKit.js` loads these once instead, under their own names
(`Egg Shen Sans`, `Egg Shen Display`), so a copy installed on a developer's
machine never stands in for the one that ships.

| File | Face | Used for |
| --- | --- | --- |
| `barlow/Barlow-Medium.ttf` | Barlow Medium (500) | names, labels, small text |
| `barlow/Barlow-Bold.ttf` | Barlow Bold (700) | titles, numbers |
| `anton/Anton-Regular.ttf` | Anton | headings: QUARTERFINALS · 1A, WINNER, VS, UPSET!, a survey's question |

Only the weights the images use are here (about 380 KB in all).

## Why these

The house style is **Egg Shen's Magic**, from *Big Trouble in Little China*
(1986): carved stone, jade, blue lightning, red lacquer and old gold
(`docs/public/logo.png`, `assets/emojis/contact-sheet.png`).

- **Anton** is a reworking of the heavy, condensed advertising grotesques
  that 1980s action posters were billed in. In capitals, spaced out and
  filled with old gold, it reads like a poster's title block, and being
  condensed, long round names still fit.
- **Barlow** is a slightly rounded, low-contrast grotesk drawn from
  California highway signs and transit lettering. That gives it some
  1980s signage sturdiness to sit beside Anton, while staying very legible
  at the small sizes Discord shrinks an image to (it shows these cards at
  roughly half size). Its figures are clear for vote counts and percentages,
  and its static weights load as real weights. Inter, the obvious
  alternative, ships in Google Fonts only as a variable font: the canvas
  would fake its bold, unless every drawing call also set the font's
  variation axes.

Neither face has CJK or Cyrillic. A string with characters a face lacks is
drawn in the system's own font instead (`setFont` in canvasKit.js checks
each string against the face's character map), so it never shows empty
boxes. Emoji are left out of drawn text altogether (`stripPictographs`):
the kit's own icons are drawn as images instead (`drawKitIcon`).

## Licence and source

Both are under the **SIL Open Font License 1.1**. Each folder holds its
`OFL.txt`. Neither declares a Reserved Font Name, and the files are
unmodified.

| Font | Copyright | Downloaded from |
| --- | --- | --- |
| Barlow | 2017 The Barlow Project Authors (https://github.com/jpt/barlow) | https://github.com/google/fonts/tree/main/ofl/barlow (commit 6cdf018) |
| Anton | 2020 The Anton Project Authors (https://github.com/googlefonts/AntonFont) | https://github.com/google/fonts/tree/main/ofl/anton (commit cee74d7) |

To update one, download the `.ttf` and `OFL.txt` from the same folder of
the google/fonts repository (the raw files) and replace them here. Then
run `npm test -- tests/canvas-kit.test.js tests/card-images.test.js`.

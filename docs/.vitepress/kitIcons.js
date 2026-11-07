// The bot's drawn emoji kit ("Egg Shen's Magic", assets/emojis) on the docs
// pages, without putting a single <img> in the markdown.
//
// Why at render time: /eggshen-ask answers from the raw markdown
// (src/utils/docsIndex.js) and its search fallback shows a section as
// written, in Discord. An <img> tag there would reach members as raw HTML,
// and an icon inside a heading would change the anchor /eggshen-ask links
// to. So the markdown keeps the plain emoji the bot itself falls back to
// ("🥧 Golden Pie"), and only the site draws the kit's art in its place.
//
// Two switches, both in a page's frontmatter:
//
//   kit: true          — known "emoji + name" phrases in the page's text and
//                        tables are drawn with the kit icon (PHRASES below)
//   kitHeadings:       — an icon before a heading, by the heading's id:
//     siege: siege        `## Siege` gets the siege icon. Added when the
//                        heading is rendered, so its text, anchor and the
//                        page outline are untouched.
//
// Every icon must be copied into docs/public/emojis/<code>.png (only the
// ones used). A missing one fails the build rather than shipping a broken
// image.

import { existsSync } from 'fs'

const PUBLIC = new URL('../public/emojis/', import.meta.url)

/**
 * "Emoji + name" → kit code. Only exact phrases: the same emoji means
 * different things in different places (🥧 is the Golden Pie and the food
 * fight; 🥈 the Silver Bullet and second place), so a bare emoji is never
 * swapped. The alt text is the icon's name, as a screen reader reads the
 * bot's own custom emoji.
 */
const PHRASES = [
  ['🥧', 'Golden Pie', 'gpie'],
  ['📼', 'Cursed VHS', 'vhs'],
  ['🧄', 'Garlic', 'garlic'],
  ['💧', 'Holy Water', 'holyw'],
  ['🍀', 'Lucky Penny', 'penny'],
  ['💊', 'Antidote', 'antid'],
  ['🥈', 'Silver Bullet', 'silver'],
  ['🔦', 'Night Light', 'nlight'],
  ['🧪', 'Potions', 'potion'],
  ['🥧', 'Food Fight', 'food'],
  ['🪓', 'Doom', 'doom'],
  ['🛟', 'Rescue', 'rescue'],
  ['👹', 'Siege', 'siege'],
  ['🧰', 'Glovebox', 'glove'],
  ['🎁', 'Rewards in progress', 'gift'],
  ['🎁', 'Prizes', 'gift'],
  ['📜', 'Titles', 'scroll'],
  ['🌀', 'In effect', 'effect'],
  ['🌙', 'Nights in a row', 'moon'],
  ['🪙', 'Points', 'coin'],
  ['🔥', 'Streak', 'flame'],
  ['🏆', 'Leaderboard', 'trophy'],
  ['📊', 'Game card', 'chart'],
  // 2.76.0: the Six-Demon Bag. Whole words only, so "🔥 Fired Up" and
  // "💨 Miss" stay plain; "⚡ Lightning Strike" draws Lightning's icon.
  // No U+FE0F on an emoji here: the pattern allows one after it, and
  // phraseAt compares with it stripped ("☯️ Chi" in the text is ☯ + FE0F).
  // With it, ☯️ 🌩️ 🌧️ 🌫️ matched the pattern but never found their phrase.
  ['🎒', 'Six-Demon Bag', 'bag'],
  ['☯', 'Chi', 'chi'],
  ['🧿', 'Jade Charm', 'jade'],
  ['⚡', 'Lightning', 'elite'],
  ['🌩', 'Thunder', 'ethund'],
  ['🌧', 'Rain', 'erain'],
  ['💨', 'Wind', 'ewind'],
  ['🔥', 'Fire', 'efire'],
  ['🌫', 'Smoke', 'esmoke'],
  // The nights row on the card
  ['🌕', 'played', 'ntp'],
  ['🔦', 'saved', 'nts'],
  ['🌑', 'missed', 'ntm'],
  ['🌗', 'tonight', 'ntt'],
]

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// Longest names first, so "Rewards in progress" wins over a shorter match
const ORDERED = [...PHRASES].sort((a, b) => b[1].length - a[1].length)
const PATTERN = new RegExp(ORDERED.map(([e, name]) => `${escapeRe(e)}\\uFE0F?(?= ${escapeRe(name)}\\b)`).join('|'), 'gu')
const lookup = new Map(ORDERED.map(([e, name, code]) => [`${e}|${name}`, { code, alt: name.toLowerCase() }]))

/** The kit codes the phrases can draw: for scripts that copy the icons */
export const PHRASE_CODES = [...new Set(PHRASES.map(([, , code]) => code))]

function iconFile(code) {
  if (!/^[a-z0-9]{1,6}$/.test(code)) throw new Error(`kitIcons: "${code}" isn't a kit code`)
  if (!existsSync(new URL(`${code}.png`, PUBLIC))) {
    throw new Error(`kitIcons: docs/public/emojis/${code}.png is missing (copy it from assets/emojis)`)
  }
  return `/emojis/${code}.png`
}

export const kitImg = (code, alt, cls = 'kit-icon') =>
  `<img class="${cls}" src="${iconFile(code)}" alt="${alt.replace(/"/g, '&quot;')}" width="20" height="20" loading="lazy">`

/** Which phrase an emoji at `index` of `text` starts */
function phraseAt(text, index, emoji) {
  for (const [e, name] of ORDERED) {
    if (e === emoji.replace(/️$/, '') && text.startsWith(` ${name}`, index + emoji.length)) return lookup.get(`${e}|${name}`)
  }
  return null
}

/** A text token's content as text and kit images, or null when it has no phrase */
function splitText(content, Token) {
  PATTERN.lastIndex = 0
  if (!PATTERN.test(content)) return null
  PATTERN.lastIndex = 0
  const out = []
  let last = 0
  for (const m of content.matchAll(PATTERN)) {
    const hit = phraseAt(content, m.index, m[0])
    if (!hit) continue
    if (m.index > last) {
      const t = new Token('text', '', 0)
      t.content = content.slice(last, m.index)
      out.push(t)
    }
    const img = new Token('html_inline', '', 0)
    img.content = kitImg(hit.code, hit.alt)
    out.push(img)
    last = m.index + m[0].length
  }
  if (!out.length) return null
  if (last < content.length) {
    const t = new Token('text', '', 0)
    t.content = content.slice(last)
    out.push(t)
  }
  return out
}

export function kitIconsPlugin(md) {
  // 1. Phrases in text and tables (never in headings: see the top)
  md.core.ruler.push('kit_icons', (state) => {
    if (!state.env?.frontmatter?.kit) return
    const tokens = state.tokens
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i]
      if (tok.type !== 'inline' || tokens[i - 1]?.type === 'heading_open' || !tok.children) continue
      const children = []
      for (const child of tok.children) {
        const parts = child.type === 'text' ? splitText(child.content, state.Token) : null
        if (parts) children.push(...parts)
        else children.push(child)
      }
      tok.children = children
    }
  })

  // 2. An icon before chosen headings, at render time
  const open = md.renderer.rules.heading_open || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options))
  md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
    const html = open(tokens, idx, options, env, self)
    const map = env?.frontmatter?.kitHeadings
    const id = tokens[idx].attrGet('id')
    const code = map && id && Object.prototype.hasOwnProperty.call(map, id) ? map[id] : null
    return code ? `${html}${kitImg(code, '', 'kit-icon kit-heading')}` : html
  }
}

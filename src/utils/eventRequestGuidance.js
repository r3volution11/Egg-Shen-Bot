/**
 * Guidance on the event request form: the helper text under its fields,
 * plus an intro and a footer (Doug, 2026-10-03).
 *
 * Every form starts with good generic guidance (DEFAULT_GUIDANCE), modeled
 * on what Shudder tells its members. Each server's admins can rewrite any
 * piece for their own site: Shudder's "keep it horror or horror-adjacent"
 * and its channel names belong on shudderdrivein.com and nowhere else.
 *
 * Each site is tied to one server (scripts/domains.json → the site's
 * config.js GUILD_ID), so per-server config IS per-site config: it lives in
 * the server's config as `eventRequests.guidance` and reaches the page
 * through GET /api/guild-config/:guildId. A self-hosted install works the
 * same way.
 *
 * Stored per piece: a string replaces the default, `false` hides the piece,
 * and nothing (the usual case) means the default. Admins edit it in a
 * Discord pop-up, prefilled with what the form shows now. Discord allows
 * five boxes per pop-up, so it comes in two parts — the page (intro and
 * footer) and the fields. An emptied box goes back to the default; "none"
 * hides the piece.
 *
 * It's plain text. The form (public/app.js renderGuidance) builds it with
 * textContent, never innerHTML, and supports only line breaks, "•"/"-"
 * bullets, **bold** and https links.
 */

// No guildConfig import here, on purpose: src/api/server.js reads guidance
// through this module, and test suites that stub guildConfig.js with only
// the functions they use import server.js indirectly. The pop-up's open and
// submit handlers, which load and save config, live in
// src/commands/eggshen-config-events.js.
import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';

/**
 * What every form shows until its server says otherwise. Generic on
 * purpose — no genre, no channel names — but the same advice Shudder gives.
 */
export const DEFAULT_GUIDANCE = {
  intro: 'Discord login only confirms you\'re a member of this server. It isn\'t used for anything else.\n\n'
    + '**Before requesting:**\n'
    + '• Check the server\'s Events tab first, so you don\'t double book.\n'
    + '• Moderators review every request, and may adjust the details or help reschedule.',
  footer: '**Questions or feedback?** Ask a moderator in the server.',
  fields: {
    title: 'Pick something that fits this server. Adding the release year, like "Tragedy Girls (2017)", helps the bot find the exact movie or show.',
    description: 'Optional. Say where to watch it: titles on services most people have, especially free ones, get more people joining.',
    image: 'Optional. Upload a cover image (PNG, JPEG, GIF or WebP, up to 8MB) and crop it to fit. Moderators may adjust or replace it.',
    when: 'Schedule within the next 2 weeks; ask a moderator about anything further out. Make sure you can attend: you\'ll be the host and start the countdown. If plans change, let a moderator know.',
    frequency: 'Optional, for recurring events. Ask a moderator before setting one up.',
  },
};

/** The pieces, where each shows, and how long it may be */
export const GUIDANCE_PARTS = {
  page: [
    { key: 'intro', label: 'Intro (top of the form)', max: 2000 },
    { key: 'footer', label: 'Footer (bottom of the form)', max: 500 },
  ],
  fields: [
    { key: 'title', label: 'Under "Event Title"', max: 400 },
    { key: 'description', label: 'Under "Description"', max: 400 },
    { key: 'image', label: 'Under "Event Image"', max: 400 },
    { key: 'when', label: 'Under the start date and time', max: 400 },
    { key: 'frequency', label: 'Under "Frequency"', max: 400 },
  ],
};

const FIELD_KEYS = GUIDANCE_PARTS.fields.map(p => p.key);
const PAGE_KEYS = GUIDANCE_PARTS.page.map(p => p.key);
const LIMIT = Object.fromEntries([...GUIDANCE_PARTS.page, ...GUIDANCE_PARTS.fields].map(p => [p.key, p.max]));

/** Typed in the pop-up to hide a piece instead of using the default */
export const HIDE_WORD = 'none';

/** One piece of text: trimmed, capped, line endings unified; null when empty or not text */
export function cleanGuidance(value, key) {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\r\n?/g, '\n').trim().slice(0, LIMIT[key]).trim();
  return text || null;
}

const defaultFor = (key) => (PAGE_KEYS.includes(key) ? DEFAULT_GUIDANCE[key] : DEFAULT_GUIDANCE.fields[key]);
const storedFor = (g, key) => (PAGE_KEYS.includes(key) ? g?.[key] : g?.fields?.[key]);

/** A stored piece: its own text, false (hidden), or undefined (the default) */
function storedPiece(g, key) {
  const raw = storedFor(g, key);
  if (raw === false) return false;
  return cleanGuidance(raw, key) ?? undefined;
}

/**
 * What the server's form shows: every piece, its own text or the default,
 * null when hidden. Configs written before guidance existed simply lack
 * the key, and get every default.
 */
export function getEventRequestGuidance(config) {
  const g = config?.eventRequests?.guidance;
  const shown = (key) => {
    const piece = storedPiece(g, key);
    return piece === false ? null : (piece ?? defaultFor(key));
  };
  return {
    intro: shown('intro'),
    footer: shown('footer'),
    fields: Object.fromEntries(FIELD_KEYS.map(k => [k, shown(k)])),
  };
}

/** Which pieces this server changed, for /eggshen-config-events event-requests view */
export function describeGuidance(config) {
  const g = config?.eventRequests?.guidance;
  const notes = [...PAGE_KEYS, ...FIELD_KEYS]
    .map(k => [k, storedPiece(g, k)])
    .filter(([, piece]) => piece !== undefined)
    .map(([k, piece]) => (piece === false ? `${k} (hidden)` : k));
  return notes.length ? `Defaults, except: ${notes.join(', ')}` : 'The defaults';
}

export const currentGuidance = (guidance, key) => (PAGE_KEYS.includes(key) ? guidance[key] : guidance.fields[key]);

/**
 * What saving a box means for the stored value: the default's text, or an
 * empty box, stores nothing (the default); "none" stores false (hidden);
 * anything else is the server's own text.
 */
export function storedValueFor(typed, key) {
  const text = cleanGuidance(typed, key);
  if (!text || text === defaultFor(key)) return undefined;
  if (text.toLowerCase() === HIDE_WORD) return false;
  return text;
}

/** The stored value now, for comparing before saving */
export const storedGuidance = (config, key) => storedPiece(config?.eventRequests?.guidance, key);

/** The pop-up for one part, prefilled with what the form shows now */
export function buildGuidanceModal(part, config) {
  const shown = getEventRequestGuidance(config);
  const modal = new ModalBuilder()
    .setCustomId(`evguidance_${part}`)
    .setTitle(part === 'page' ? 'Form guidance: top and bottom' : 'Form guidance: under each field');
  for (const p of GUIDANCE_PARTS[part]) {
    const input = new TextInputBuilder()
      .setCustomId(p.key)
      .setLabel(p.label)
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(p.max)
      // Seen only when a box is emptied: what that will do
      .setPlaceholder(`Empty: the default text. "${HIDE_WORD}": show nothing here.`);
    const value = currentGuidance(shown, p.key);
    if (value) input.setValue(value);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }
  return modal;
}

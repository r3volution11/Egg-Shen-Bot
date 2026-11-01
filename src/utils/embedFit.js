/**
 * Discord's message limits in one place, and helpers for staying inside
 * them. Discord rejects an over-limit message outright (50035 Invalid Form
 * Body): nothing is posted at all, so a card that grows with the data (a
 * leaderboard, a game card, a survey) has to be measured before it's sent.
 *
 * Naive `.slice(0, n)` is not enough either: it can cut a custom emoji
 * (`<:es_pie_3fa9:123…>`), a timestamp or a mention in half and leave raw
 * markup on screen, or leave a `pill` with no closing backtick so the rest
 * of the card turns into code. clipText never does.
 */

/** https://discord.com/developers/docs/resources/message#embed-object-embed-limits */
export const LIMITS = {
  content: 2000,
  embeds: 10,
  title: 256,
  description: 4096,
  fields: 25,
  fieldName: 256,
  fieldValue: 1024,
  footer: 2048,
  author: 256,
  total: 6000, // all embeds in one message, together
};

/** The JSON of an EmbedBuilder, or a plain embed object as-is */
const json = (embed) => embed?.data ?? embed ?? {};

/** The characters Discord counts toward an embed's 6000 */
export function embedTextLength(embed) {
  const e = json(embed);
  let n = (e.title?.length || 0) + (e.description?.length || 0);
  for (const f of e.fields || []) n += (f.name?.length || 0) + (f.value?.length || 0);
  n += e.footer?.text?.length || 0;
  n += e.author?.name?.length || 0;
  return n;
}

/**
 * Everything about a message payload that Discord would reject.
 * @returns {string[]} one entry per problem; empty when it would be accepted
 */
export function messageProblems(payload = {}) {
  const problems = [];
  if (typeof payload.content === 'string' && payload.content.length > LIMITS.content) {
    problems.push(`content is ${payload.content.length} characters (limit ${LIMITS.content})`);
  }
  const embeds = payload.embeds || [];
  if (embeds.length > LIMITS.embeds) problems.push(`${embeds.length} embeds (limit ${LIMITS.embeds})`);
  let total = 0;
  embeds.forEach((embed, i) => {
    const e = json(embed);
    const at = `embed ${i + 1}`;
    const over = (what, len, max) => { if (len > max) problems.push(`${at} ${what} is ${len} characters (limit ${max})`); };
    over('title', e.title?.length || 0, LIMITS.title);
    over('description', e.description?.length || 0, LIMITS.description);
    over('footer', e.footer?.text?.length || 0, LIMITS.footer);
    over('author name', e.author?.name?.length || 0, LIMITS.author);
    const fields = e.fields || [];
    if (fields.length > LIMITS.fields) problems.push(`${at} has ${fields.length} fields (limit ${LIMITS.fields})`);
    fields.forEach((f, j) => {
      // An empty name or value is rejected too, not just a long one
      if (!f.name) problems.push(`${at} field ${j + 1} has no name`);
      if (!f.value) problems.push(`${at} field ${j + 1} has no value`);
      over(`field ${j + 1} name`, f.name?.length || 0, LIMITS.fieldName);
      over(`field ${j + 1} value`, f.value?.length || 0, LIMITS.fieldValue);
    });
    total += embedTextLength(e);
  });
  if (total > LIMITS.total) problems.push(`embeds total ${total} characters (limit ${LIMITS.total})`);
  return problems;
}

/**
 * Markup that must never be cut: custom and animated emoji, timestamps,
 * user/role/channel mentions and slash-command mentions.
 */
const TOKEN = /<(?:a?:\w+:\d+|t:-?\d+(?::[tTdDfFR])?|@[!&]?\d+|#\d+|\/[^<>\n]+:\d+)>/g;

/**
 * Shorten text to at most `max` characters, ending in `ellipsis`, without
 * splitting a token, a surrogate pair (most emoji), or a backtick pill.
 */
export function clipText(text, max, ellipsis = '…') {
  if (typeof text !== 'string' || text.length <= max) return text;
  if (max <= ellipsis.length) return ellipsis.slice(0, Math.max(0, max));
  let cut = max - ellipsis.length;

  // Back off to the start of any token the cut lands inside
  for (const m of text.matchAll(TOKEN)) {
    if (m.index >= cut) break;
    if (m.index + m[0].length > cut) { cut = m.index; break; }
  }
  // Don't leave half of a surrogate pair
  const code = text.charCodeAt(cut - 1);
  if (code >= 0xD800 && code <= 0xDBFF) cut -= 1;
  // Don't leave a pill open: an odd number of backticks means one is
  const head = text.slice(0, cut);
  if ((head.match(/`/g) || []).length % 2 === 1) cut = head.lastIndexOf('`');

  return text.slice(0, cut).trimEnd() + ellipsis;
}

/**
 * Try each layout in order and keep the first that fits.
 * @param {Array} steps - layout settings, most generous first
 * @param {(step) => any} render
 * @param {(out) => boolean} fits
 * @returns {{ out: any, step: number }} the first that fits, else the last
 */
export function chooseLayout(steps, render, fits) {
  let out;
  for (let i = 0; i < steps.length; i++) {
    out = render(steps[i], i);
    if (fits(out)) return { out, step: i };
  }
  return { out, step: steps.length - 1 };
}

/**
 * Lines packed into as few fields as possible, each value ≤ `max`. The
 * first field gets `name`; continuations get an invisible one, so they read
 * as one block. A single line longer than `max` is clipped.
 */
export function fieldsFromLines(name, lines, { inline = false, max = LIMITS.fieldValue } = {}) {
  const fields = [];
  let value = '';
  for (const raw of lines) {
    const line = clipText(raw, max);
    if (value && value.length + 1 + line.length > max) {
      fields.push({ name: fields.length ? '​' : name, value, inline });
      value = '';
    }
    value = value ? `${value}\n${line}` : line;
  }
  if (value) fields.push({ name: fields.length ? '​' : name, value, inline });
  return fields;
}

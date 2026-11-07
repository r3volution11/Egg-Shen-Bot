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

/**
 * https://discord.com/developers/docs/components/reference — the classic
 * components (action rows of buttons or a select). A group ballot with one
 * row per group went past 5 rows once 6 groups were open, and Discord
 * refused the whole message: "This interaction failed" for every voter.
 */
export const COMPONENT_LIMITS = {
  rows: 5, // action rows in one message
  rowButtons: 5, // buttons in one row
  customId: 100,
  buttonLabel: 80,
  selectOptions: 25,
  optionText: 100, // a select option's label, value and description
  placeholder: 150,
};

// Discord's component type numbers
const ACTION_ROW = 1;
const BUTTON = 2;
const SELECTS = new Set([3, 5, 6, 7, 8]); // string, user, role, mentionable, channel

/** The JSON of a builder, or a plain component as-is */
const componentJson = (c) => (c && typeof c.toJSON === 'function' ? c.toJSON() : (c?.data ?? c ?? {}));

/**
 * Everything about a message's components that Discord would reject:
 * at most 5 action rows; each row 1–5 buttons or exactly one select, never
 * both; custom ids unique and at most 100 characters; button labels at
 * most 80; a select's 1–25 options at most 100 characters each.
 * @param {Array} components - action rows, as builders or JSON
 * @returns {string[]} one entry per problem; empty when it would be accepted
 */
export function componentProblems(components = []) {
  const problems = [];
  const rows = (components || []).map(componentJson);
  if (rows.length > COMPONENT_LIMITS.rows) problems.push(`${rows.length} action rows (limit ${COMPONENT_LIMITS.rows})`);
  const ids = new Map();
  rows.forEach((row, r) => {
    const at = `row ${r + 1}`;
    if (row.type !== undefined && row.type !== ACTION_ROW) {
      problems.push(`${at} is component type ${row.type}, not an action row`);
      return;
    }
    const items = (row.components || []).map(componentJson);
    if (items.length === 0) problems.push(`${at} is empty`);
    const buttons = items.filter(c => c.type === BUTTON);
    const selects = items.filter(c => SELECTS.has(c.type));
    if (buttons.length > COMPONENT_LIMITS.rowButtons) problems.push(`${at} has ${buttons.length} buttons (limit ${COMPONENT_LIMITS.rowButtons})`);
    if (selects.length > 1) problems.push(`${at} has ${selects.length} select menus (limit 1)`);
    if (selects.length && buttons.length) problems.push(`${at} mixes a select menu with buttons`);
    items.forEach((c, i) => {
      const where = `${at} component ${i + 1}`;
      const id = c.custom_id;
      if (id !== undefined) {
        if (String(id).length > COMPONENT_LIMITS.customId) problems.push(`${where} custom_id is ${String(id).length} characters (limit ${COMPONENT_LIMITS.customId})`);
        if (ids.has(id)) problems.push(`${where} custom_id "${id}" is already used by ${ids.get(id)}`);
        else ids.set(id, where);
      }
      if (c.type === BUTTON && (c.label?.length || 0) > COMPONENT_LIMITS.buttonLabel) {
        problems.push(`${where} label is ${c.label.length} characters (limit ${COMPONENT_LIMITS.buttonLabel})`);
      }
      if ((c.placeholder?.length || 0) > COMPONENT_LIMITS.placeholder) {
        problems.push(`${where} placeholder is ${c.placeholder.length} characters (limit ${COMPONENT_LIMITS.placeholder})`);
      }
      if (c.type === 3) {
        const options = c.options || [];
        if (options.length < 1 || options.length > COMPONENT_LIMITS.selectOptions) {
          problems.push(`${where} has ${options.length} options (needs 1-${COMPONENT_LIMITS.selectOptions})`);
        }
        options.forEach((o, j) => {
          for (const part of ['label', 'value', 'description']) {
            const len = o?.[part]?.length || 0;
            if (len > COMPONENT_LIMITS.optionText) problems.push(`${where} option ${j + 1} ${part} is ${len} characters (limit ${COMPONENT_LIMITS.optionText})`);
          }
        });
      }
    });
  });
  return problems;
}

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
  // Components only when the payload carries them: most callers measure a
  // card's text before deciding its layout, with no buttons in hand
  if (payload.components) problems.push(...componentProblems(payload.components));
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

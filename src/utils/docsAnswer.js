/**
 * Answers for /eggshen-ask, from the bot's own documentation.
 *
 * 1. searchDocs finds the docs sections closest to the question.
 * 2. With AI on for the server (its own switch, /eggshen-config-ai ai-ask),
 *    the model writes the answer from those sections plus a catalog of the
 *    bot's real commands, generated from their live definitions. The catalog
 *    matters: keyword search alone missed questions worded unlike the docs
 *    ("who can use commands" vs "enable or disable commands").
 * 3. Every `/command` in an AI answer is checked against the real commands —
 *    name, subcommand, option names, and values where the definition pins
 *    them down (choices, number ranges). One that doesn't fit means the
 *    answer is thrown away for the search result, never shown.
 * 4. Without AI (or if it fails), the best-matching section is shown as the
 *    docs wrote it.
 *
 * Answers end with links to the docs pages they came from.
 */

import { searchDocs, searchDocsSemantic } from './docsIndex.js';
import { answerFromDocs, isOpenAIAvailable } from '../services/aiService.js';
import { getAiAskEnabled } from './guildConfig.js';
import { config } from '../config.js';

const SUBCOMMAND = 1;
const SUBCOMMAND_GROUP = 2;
const BOOLEAN = 5;
const INTEGER = 4;
const NUMBER = 10;

// Commands only admins and moderators can use at all
const ADMIN_COMMAND = /^\/(eggshen-config(?:-[a-z-]+)?|eggshen-restart)\b/;

/** Below this, the best match is too weak to call an answer */
const MIN_SCORE = 6;

/**
 * Every command path the bot has, with its options — from the commands'
 * own definitions, so it's never out of date.
 * @param {Iterable<{data: {toJSON: Function}}>} commands
 * @returns {{lines: string[], paths: Map<string, Set<string>>, options: Map<string, Map<string, object>>}}
 *   `options` holds each path's option definitions, for checking values
 */
export function buildCommandCatalog(commands) {
  const lines = [];
  const paths = new Map();
  const options = new Map();
  const walk = (path, opts, description) => {
    const nested = (opts || []).filter(o => o.type === SUBCOMMAND || o.type === SUBCOMMAND_GROUP);
    if (nested.length === 0) {
      const names = (opts || []).map(o => o.name);
      paths.set(path, new Set(names));
      options.set(path, new Map((opts || []).map(o => [o.name, o])));
      lines.push(`${path}${names.length ? ` [${names.join(', ')}]` : ''} — ${description}`);
      return;
    }
    for (const sub of nested) walk(`${path} ${sub.name}`, sub.options, sub.description);
  };
  for (const command of commands) {
    const json = command?.data?.toJSON?.();
    if (json?.name) walk(`/${json.name}`, json.options, json.description);
  }
  return { lines, paths, options };
}

/**
 * The catalog for the model, with each option spelled out — description,
 * allowed values, range — for the commands the excerpts show. Names alone
 * weren't enough: an answer gave `/bracket open-groups groups:4`, where
 * groups takes letters ("A,B,C,D"), which only the description says. Every
 * other command keeps its one-line form, to keep the prompt small.
 */
export function catalogLinesFor(catalog, sections) {
  const text = sections.map(s => `${s.heading}\n${s.text}`).join('\n');
  const shown = new Set([...catalog.paths.keys()].filter(path => text.includes(path)));
  const lines = [];
  for (const line of catalog.lines) {
    const path = [...shown].find(p => line.startsWith(`${p} [`) || line.startsWith(`${p} —`));
    if (!path) { lines.push(line); continue; }
    lines.push(line.replace(/ \[[^\]]*\]/, ''));
    for (const o of catalog.options.get(path).values()) {
      const allowed = o.choices?.length
        ? ` One of: ${o.choices.map(c => c.value).join(', ')}.`
        : (o.min_value !== undefined || o.max_value !== undefined)
          ? ` ${o.min_value ?? ''}–${o.max_value ?? ''}.`
          : '';
      lines.push(`    ${o.name}${o.required ? ' (required)' : ''}: ${o.description}${allowed}`);
    }
  }
  return lines;
}

/**
 * Every slash command written anywhere in a piece of text — inline code,
 * code blocks, quoted, or bare — as the text from "/" to the end of its line
 * (or closing backtick). The first version only looked at `\`/…\`` spans, so
 * a command the model put in a code block or wrapped in quotes went
 * unchecked.
 * Docs paths ("/guides/tournaments/") and URLs aren't commands: a command
 * name has no second "/", and a URL's "/" follows a letter or ":".
 */
export function findCommands(text) {
  return findCommandMentions(text).map(m => m.span);
}

/**
 * As findCommands, noting whether each mention is code (in backticks or a
 * fenced block) — where everything after the name is part of the command —
 * or prose, where "/bracket to run tournaments" is just a sentence.
 * @returns {Array<{span: string, inCode: boolean}>}
 */
export function findCommandMentions(text) {
  const source = String(text);
  const fences = [...source.matchAll(/```[\s\S]*?(?:```|$)/g)].map(m => [m.index, m.index + m[0].length]);
  const inFence = (i) => fences.some(([start, end]) => i >= start && i < end);
  const found = [];
  const re = /(?:^|([\s`'"*>]))(\/[a-z][a-z0-9-]*)(?=[\s`'"*]|$)([^\n`]*)/gm;
  for (const m of source.matchAll(re)) {
    const at = m.index + (m[1] ? 1 : 0);
    // Inline code: an opening backtick shortly before, on the same line
    const before = source.slice(source.lastIndexOf('\n', at) + 1, at);
    const inInline = ((before.match(/`/g) || []).length % 2) === 1;
    found.push({
      span: tidySpan(`${m[2]}${m[3]}`),
      inCode: inInline || inFence(at),
    });
  }
  return found;
}

/**
 * Trailing quotes, bold and spaces around a mention aren't part of it — but
 * a closing quote that pairs with one inside is: stripping the `"` from
 * `time:"8:00 PM EST"` unbalanced the quotes and split the value apart.
 */
function tidySpan(span) {
  let s = span.replace(/[*\s]+$/, '');
  for (;;) {
    const q = s.at(-1);
    if ((q !== '"' && q !== "'") || (s.split(q).length - 1) % 2 === 0) break;
    s = s.slice(0, -1).replace(/[*\s]+$/, '');
  }
  return s.trim();
}

/** "a b:"c d" e" → ["a", 'b:"c d"', "e"] */
function words(span) {
  return span.match(/[^\s"]+(?:"[^"]*")?|"[^"]*"/g) || [];
}

// An `option:` in a command. Lowercase only, as Discord option names are:
// "label:The Lord of the Rings: The Fellowship" has one option, not two.
// Not a URL's "https:".
// Names start with a letter, so a time like `time:"8:00 PM"` isn't an option "8".
const OPTION = /^([a-z][a-z0-9-]*):(?!\/\/)/;

/**
 * Is `value` one an option can take? Only what the definition pins down is
 * checked — choices, number ranges, booleans; free text always passes.
 * Placeholders ("<title>", "[optional]", "true/false") are not values.
 */
function valueFits(option, value) {
  // Sentence punctuation after a prose mention isn't part of the value
  const v = String(value).trim().replace(/[.,;!?)]+$/, '').replace(/^["']|["']$/g, '');
  if (!v || /^[<[]/.test(v) || v.includes('/') || /^\.\.\.?$/.test(v)) return true;
  if (option.choices?.length) {
    return option.choices.some(c => String(c.value).toLowerCase() === v.toLowerCase()
      || String(c.name).toLowerCase() === v.toLowerCase());
  }
  if (option.type === BOOLEAN) return /^(true|false)$/i.test(v);
  if (option.type === INTEGER || option.type === NUMBER) {
    const n = Number(v);
    if (!Number.isFinite(n) || (option.type === INTEGER && !Number.isInteger(n))) return false;
    return !(option.min_value !== undefined && n < option.min_value)
      && !(option.max_value !== undefined && n > option.max_value);
  }
  return true;
}

/** "a:1 b:two words" → [["a", "1"], ["b", "two words"]] */
function optionValues(parts) {
  const pairs = [];
  for (const w of parts) {
    const m = w.match(OPTION);
    if (m) pairs.push([m[1].toLowerCase(), w.slice(m[0].length)]);
    else if (pairs.length) pairs[pairs.length - 1][1] += ` ${w}`;
  }
  return pairs;
}

/**
 * The commands in a piece of text, each checked against the catalog: does
 * the command path exist, are the `option:` names real, and do the values fit?
 * @returns {{used: string[], unknown: string[]}}
 */
export function checkCommands(text, catalog) {
  const used = [];
  const unknown = [];
  for (const { span, inCode } of findCommandMentions(text)) {
    const parts = words(span);
    // The longest prefix of plain words that's a real command path
    let path = null;
    let consumed = 0;
    for (let n = Math.min(3, parts.length); n >= 1; n--) {
      const candidate = parts.slice(0, n).join(' ').toLowerCase();
      if (catalog.paths.has(candidate)) { path = candidate; consumed = n; break; }
    }
    if (!path) {
      // Naming a command with subcommands on its own is fine: "`/bracket`",
      // or "use /bracket to run tournaments" in a sentence. In code, though,
      // what follows is the command itself, so "/bracket start-matchup"
      // there must be a real subcommand.
      const name = parts[0].toLowerCase();
      const isParent = [...catalog.paths.keys()].some(p => p.startsWith(`${name} `));
      // A group on its own ("`/eggshen-config-watch-party rate-limit`") names
      // a set of subcommands, like a parent does
      const whole = parts.join(' ').toLowerCase();
      if (!parts.some(w => OPTION.test(w)) && [...catalog.paths.keys()].some(p => p.startsWith(`${whole} `))) {
        used.push(name);
        continue;
      }
      // In prose, a hyphenated word straight after the name ("/bracket
      // start-matchup") is a subcommand claim, not English, so it must be real
      const claimsSub = /^[a-z0-9]+-[a-z0-9-]+$/i.test(parts[1] || '');
      const restIsProse = !inCode
        ? !claimsSub && parts.slice(1).every(w => !OPTION.test(w) && !catalogHasSub(catalog, name, w))
        : parts.length === 1;
      if (isParent && restIsProse) { used.push(name); continue; }
      unknown.push(span);
      continue;
    }
    const names = catalog.paths.get(path);
    const defs = catalog.options?.get(path);
    const bad = optionValues(parts.slice(consumed)).some(([name, value]) =>
      // The whole value ("setting:Survey Command") or, in a sentence, its
      // first word ("matchups:1, then run it again")
      !names.has(name) || (defs?.has(name)
        && !valueFits(defs.get(name), value) && !valueFits(defs.get(name), value.split(/\s+/)[0])));
    if (bad) unknown.push(span);
    else used.push(path);
  }
  return { used, unknown };
}

/** Is `word` a subcommand (or group) name under `name`? Then it's not prose. */
function catalogHasSub(catalog, name, word) {
  const w = String(word).toLowerCase();
  return [...catalog.paths.keys()].some(p => p.startsWith(`${name} `) && p.split(' ').includes(w));
}

/**
 * The model sometimes writes `\bracket open` for `/bracket open`. That
 * isn't a command Discord knows, and the checker wouldn't see it, so it'd go
 * out unchecked. Turn a backslash before a real command's name into "/".
 */
export function fixSlashes(text, catalog) {
  const names = new Set([...catalog.paths.keys()].map(p => p.split(' ')[0].slice(1)));
  return String(text).replace(/(^|[\s`'"*>(])\\([a-z][a-z0-9-]*)(?=[\s`'"*]|$)/gm,
    (whole, lead, name) => (names.has(name) ? `${lead}/${name}` : whole));
}

/** Does the text tell someone to run a command only admins and mods can? */
export function needsAdmin(text, adminSubcommands = {}) {
  for (const span of findCommands(text)) {
    if (ADMIN_COMMAND.test(span)) return true;
    const [name, sub] = span.trim().split(/\s+/);
    if (adminSubcommands[name.slice(1)]?.includes(sub)) return true;
  }
  return false;
}

function truncateAtParagraph(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const at = Math.max(cut.lastIndexOf('\n\n'), cut.lastIndexOf('\n'));
  return `${(at > max * 0.5 ? cut.slice(0, at) : cut).trim()}\n…`;
}

/** Distinct pages among sections, as markdown links, best first. */
function sourceLinks(sections, max = 3) {
  const seen = new Set();
  const links = [];
  for (const s of sections) {
    if (seen.has(s.url) || links.length >= max) continue;
    seen.add(s.url);
    const label = s.heading && s.heading !== s.page ? `${s.page} › ${s.heading}` : s.page;
    links.push(`[${label.slice(0, 90)}](${s.url})`);
  }
  return links;
}

/**
 * Which sections to link for an answer: for each command it uses, the
 * best-ranked section that shows that command; then any the model cited;
 * else the best match. The model's own citation numbers proved unreliable
 * (a rate-limit answer cited the timer page), so the commands lead.
 */
function sourcesFor(usedPaths, citedNumbers, sections) {
  const picked = [];
  for (const path of usedPaths) {
    const hit = sections.find(s => s.text.includes(path) || s.heading.includes(path));
    if (hit && !picked.includes(hit)) picked.push(hit);
  }
  for (const n of citedNumbers) {
    const s = sections[n - 1];
    if (s && !picked.includes(s)) picked.push(s);
  }
  return picked.length ? picked : sections.slice(0, 1);
}

/** Nothing in the docs answers it: say so, and point at the docs rather than at unrelated pages. */
function notFound(docsHome) {
  return {
    answer: `I couldn't find that in the docs. Try asking another way, or browse the [Egg Shen Bot docs](${docsHome}).`,
    sources: [],
    mode: 'none',
    adminNote: false,
  };
}

/**
 * @param {object} params
 * @param {string} params.question
 * @param {object} params.guildConfig
 * @param {Iterable} params.commands - the bot's loaded commands (client.commands.values())
 * @param {boolean} [params.isManager] - asker is an admin/mod
 * @param {object} [params.adminSubcommands] - e.g. { bracket: [...] }
 * @returns {Promise<{answer: string, sources: string[], mode: 'ai'|'search'|'none', adminNote: boolean}>}
 */
export async function answerQuestion({ question, guildConfig, commands, isManager = false, adminSubcommands = {} }) {
  const useAi = getAiAskEnabled(guildConfig) && isOpenAIAvailable();
  // With AI, search by meaning as well as words (see searchDocsSemantic)
  const sections = useAi
    ? await searchDocsSemantic(question, { limit: 8 })
    : searchDocs(question, { limit: 8 });
  const docsHome = `${String(config.docsUrl || 'https://eggshenbot.com').replace(/\/+$/, '')}/`;

  if (useAi) {
    const catalog = buildCommandCatalog(commands);
    const ai = await answerFromDocs({ question, sections, catalogLines: catalogLinesFor(catalog, sections) });
    if (ai?.notCovered) {
      return notFound(docsHome);
    }
    if (ai?.text) {
      ai.text = fixSlashes(ai.text, catalog);
      const { used, unknown } = checkCommands(ai.text, catalog);
      if (unknown.length === 0) {
        return {
          answer: ai.text,
          sources: sourceLinks(sourcesFor(used, ai.sources, sections)),
          mode: 'ai',
          adminNote: !isManager && needsAdmin(ai.text, adminSubcommands),
        };
      }
      console.warn(`[eggshen-ask] Dropped an AI answer naming commands that don't exist: ${unknown.join(', ')}`);
    }
  }

  // The fallback shows a section as written, so it uses keyword ranking,
  // whose scores the threshold is tuned for
  const keywordBest = useAi ? searchDocs(question, { limit: 8 }) : sections;
  const best = keywordBest[0];
  if (!best || best.score < MIN_SCORE) {
    return notFound(docsHome);
  }
  const answer = truncateAtParagraph(best.text, 900);
  return {
    answer,
    sources: sourceLinks(keywordBest),
    mode: 'search',
    adminNote: !isManager && needsAdmin(answer, adminSubcommands),
  };
}

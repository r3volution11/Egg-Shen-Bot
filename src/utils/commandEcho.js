/**
 * "@Doug used /movie `query`" above a public result.
 *
 * Discord draws that header itself on an interaction's own reply, but most
 * public results here are not one: search commands defer ephemeral (so a
 * picker doesn't clutter the channel), and an ephemeral reply can't become
 * public, so deliverResult() deletes it and posts a plain channel message —
 * which carries no interaction, so no header. Nobody watching could tell what
 * produced the answer, and seeing it is how people learn the commands.
 *
 * So we write the header ourselves. The command is a Discord command mention
 * (</movie:id>), which renders as a clickable chip that drops the command
 * into the message box — the shortest path from seeing it to trying it. The
 * option names follow; their values don't, since the point is advertising
 * how to run it, not repeating what this person searched for.
 *
 * The command line is captured at dispatch (src/index.js) because by the time
 * a picker selection delivers the result, the select interaction has no
 * options of its own; it finds the original through the picker message's
 * interactionMetadata.
 */

// Discord's component tokens die at ~15 minutes; a picker older than that
// can't deliver anything, so neither can its remembered command.
const TTL_MS = 15 * 60 * 1000;

// Discord rejects content over 2000 chars. The header is a courtesy; it gives
// way before the result does.
const MAX_CONTENT = 2000;

const remembered = new Map(); // interaction id -> { name, commandId, words, options, expiresAt }

function prune() {
  const now = Date.now();
  for (const [key, entry] of remembered.entries()) {
    if (entry.expiresAt <= now) remembered.delete(key);
  }
}

// Option types 1 and 2 are a subcommand and a subcommand group.
const SUBCOMMAND = 1;
const SUBCOMMAND_GROUP = 2;

function flatten(data, words, options) {
  for (const opt of data || []) {
    if (opt.type === SUBCOMMAND || opt.type === SUBCOMMAND_GROUP) {
      words.push(opt.name);
      flatten(opt.options, words, options);
    } else if (opt.name !== 'private') {
      // `private` is noise here: a public post already means it was false.
      options.push(opt.name);
    }
  }
}

/** Capture a slash command's name and options so its result can echo them. */
export function rememberCommand(interaction) {
  prune();
  const words = [];
  const options = [];
  flatten(interaction.options?.data, words, options);
  remembered.set(interaction.id, {
    name: interaction.commandName,
    commandId: interaction.commandId,
    words,
    options,
    expiresAt: Date.now() + TTL_MS,
  });
}

/**
 * "</movie:123> `query` `year`" — a clickable command mention, then the
 * option names used. Without an id (a command we never saw) it falls back to
 * bold text, which still reads as a command.
 */
export function formatCommandLine(entry) {
  const path = [entry.name, ...entry.words].join(' ');
  const command = entry.commandId ? `</${path}:${entry.commandId}>` : `**/${path}**`;
  return [command, ...entry.options.map(name => `\`${name}\``)].join(' ');
}

/**
 * The header line for an interaction's public result, or null.
 *
 * A slash interaction is looked up by its own id; a picker selection or
 * button by the slash command that posted its message. After a restart the
 * options are gone, but the message metadata still names the command.
 */
export function echoFor(interaction) {
  prune();
  const originId = interaction.isChatInputCommand?.()
    ? interaction.id
    : interaction.message?.interactionMetadata?.id;

  let line = null;
  const entry = originId ? remembered.get(originId) : null;
  if (entry) {
    line = formatCommandLine(entry);
  } else if (interaction.isChatInputCommand?.()) {
    line = formatCommandLine({ name: interaction.commandName, commandId: interaction.commandId, words: [], options: [] });
  } else {
    // The message metadata keeps the name but not the id or options.
    const legacyName = interaction.message?.interaction?.commandName;
    if (legacyName) line = formatCommandLine({ name: legacyName, words: [], options: [] });
  }
  if (!line || !interaction.user?.id) return null;

  return `-# <@${interaction.user.id}> used ${line}`;
}

/**
 * Put the echo header on a public response. Mentions are suppressed so the
 * header names the person without pinging them (unless the caller already
 * decided who gets pinged).
 */
export function withCommandEcho(interaction, response) {
  const header = echoFor(interaction);
  if (!header) return response;

  const body = response.content || '';
  // Too long to fit both: drop the header, never the result.
  if (body.length + header.length + 1 > MAX_CONTENT) return response;

  return {
    ...response,
    content: body ? `${header}\n${body}` : header,
    allowedMentions: response.allowedMentions ?? { parse: [] },
  };
}

/** Test-only: forget everything. */
export function _resetCommandEcho() {
  remembered.clear();
}

// Tiny inline formatter shared by the docs components and the structured-data
// builder in config.js. Guide steps and FAQ answers are written once, in a
// page's frontmatter, with `code` and [links](/path) only — the page shows
// them as HTML and the schema.org JSON-LD gets the same words as plain text,
// so the two can't drift apart.

const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/** Frontmatter text → safe HTML: `code`, **bold**, [text](/path or https://). */
export function inlineToHtml(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(((?:\/|https:\/\/)[^)\s]*)\)/g, '<a href="$2">$1</a>');
}

/** Frontmatter text → the plain words a reader sees (for JSON-LD). */
export function inlineToText(text) {
  return String(text)
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
}

/**
 * Discord-flavoured markdown → safe HTML, for the Discord message mock-ups
 * (components/DiscordMessage.vue). Escapes first, then: **bold**, *italic*,
 * `code`, [links](/path), "-# " subtext and "## " headings per line, and two
 * stand-ins for what Discord draws itself: [ts:in 9 minutes] (a timestamp,
 * shown as Discord's grey chip) and [mention:@Doug] (a mention).
 */
export function discordMarkdown(text, { inline = false } = {}) {
  const fmt = (s) => escapeHtml(s)
    .replace(/\[ts:([^\]]+)\]/g, '<span class="dm-chip">$1</span>')
    .replace(/\[mention:([^\]]+)\]/g, '<span class="dm-mention">$1</span>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(((?:\/|https:\/\/)[^)\s]*)\)/g, '<a href="$2">$1</a>');
  if (inline) return fmt(String(text ?? ''));
  return String(text ?? '').split('\n').map((line) => {
    if (line.startsWith('-# ')) return `<span class="dm-sub">${fmt(line.slice(3))}</span>`;
    if (line.startsWith('## ')) return `<span class="dm-h2">${fmt(line.slice(3))}</span>`;
    return fmt(line);
  }).join('<br>');
}

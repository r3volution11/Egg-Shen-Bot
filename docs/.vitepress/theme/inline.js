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

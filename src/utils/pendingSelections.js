/**
 * Short-lived side storage for data that can't fit in a Discord customId.
 *
 * Discord caps a select-menu option `value` at 100 characters. Commands that
 * need to carry context through a selection (who asked, what note they typed,
 * whether the answer should be private) were base64-ing that JSON straight
 * into the value and truncating it to fit — which silently produced
 * unparseable data and broke the selection entirely.
 *
 * A short nonce in the value, with the real payload held here, sidesteps the
 * limit without inventing a serialization format. Entries expire on their own
 * so an abandoned menu can't leak memory: Discord's own component tokens stop
 * working after ~15 minutes, so anything older is already unusable.
 */

const TTL_MS = 15 * 60 * 1000;

const pending = new Map(); // nonce -> { value, expiresAt }

/** Drop anything past its expiry. Cheap, and bounded by how many menus exist. */
function prune() {
  const now = Date.now();
  for (const [key, entry] of pending.entries()) {
    if (entry.expiresAt <= now) pending.delete(key);
  }
}

/**
 * Stash a payload and get back a short key to embed in a customId.
 *
 * @param {any} value
 * @returns {string} a nonce safe for a Discord customId (no underscores)
 */
export function stashSelection(value) {
  prune();

  // Base36, no underscores — several handlers split customIds on '_'.
  const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  pending.set(nonce, { value, expiresAt: Date.now() + TTL_MS });

  return nonce;
}

/**
 * Retrieve a stashed payload.
 *
 * Reading does NOT consume it: Discord can deliver a component interaction
 * more than once on a retry, and a selection that silently did nothing the
 * second time would be worse than repeating it.
 *
 * @returns {any|null} null when unknown or expired
 */
export function readSelection(nonce) {
  prune();
  const entry = pending.get(nonce);
  return entry ? entry.value : null;
}

/** Test-only: empty the store. */
export function _resetSelections() {
  pending.clear();
}

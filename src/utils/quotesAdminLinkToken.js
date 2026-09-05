/**
 * Signed, single-use, short-lived tokens for the /eggshen-config-quotes
 * admin-link command — lets an admin/moderator open /quotes-admin already
 * unlocked by clicking a Link-style button in Discord, instead of having to
 * be handed QUOTES_ADMIN_SECRET directly and typing it in. Mirrors
 * cropLinkToken.js's shape exactly (HMAC-signed, crypto.timingSafeEqual,
 * in-memory single-use tracking) but isn't tied to a specific request id —
 * /quotes-admin is a standing admin surface, not a per-item page.
 *
 * The token itself is NOT the admin secret — /api/quotes-admin-link/exchange
 * verifies+consumes it server-side and hands back the real
 * QUOTES_ADMIN_SECRET exactly once, which the page then uses for its normal
 * Authorization: Bearer flow. This keeps the long-lived secret out of the
 * URL (query strings end up in browser history/server logs) while still
 * letting a short-lived link stand in for typing the secret manually.
 *
 * The token's payload can also carry a `theme` name (the invoking guild's
 * assigned web theme — see webThemes.js) so GET /quotes-admin can render
 * that guild's color theme even though the underlying quote data is
 * bot-wide, not per-guild. Reading it (peekQuotesAdminLinkToken) is
 * deliberately non-consuming, since it needs to run on every page
 * load/reload, not just the one real exchange.
 */

import crypto from 'crypto';

const DEFAULT_TTL_MS = 10 * 60 * 1000;

// In-memory only — same tradeoff cropLinkToken.js makes: losing this on a
// restart just means a moderator needs a fresh link, not a real problem.
const consumedJtis = new Set();

function getSecret() {
  const secret = process.env.QUOTES_ADMIN_SECRET;
  if (!secret) {
    throw new Error('QUOTES_ADMIN_SECRET is not set — cannot sign a quotes-admin link token');
  }
  return secret;
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

/**
 * @param {object} [options]
 * @param {number} [options.ttlMs]
 * @param {string} [options.theme] — the invoking guild's assigned web theme
 *   (see webThemes.js), baked into the token so /quotes-admin can render the
 *   right theme even though the quote data itself has no guildId of its own.
 * @returns {string} opaque token
 */
export function signQuotesAdminLinkToken({ ttlMs = DEFAULT_TTL_MS, theme } = {}) {
  const secret = getSecret();
  const payload = base64url(JSON.stringify({
    exp: Date.now() + ttlMs,
    jti: crypto.randomBytes(8).toString('hex'),
    ...(theme ? { theme } : {}),
  }));
  const sig = sign(payload, secret);
  return `${payload}.${sig}`;
}

/**
 * Verifies signature and expiry and returns the token's embedded theme,
 * WITHOUT marking the jti consumed — used only to pick which CSS to serve
 * on GET /quotes-admin, which must remain safe to reload/revisit ahead of
 * (or instead of) the real one-time exchange in consumeQuotesAdminLinkToken.
 * @param {string} token
 * @returns {{valid: true, theme: string|null} | {valid: false}}
 */
export function peekQuotesAdminLinkToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) {
    return { valid: false };
  }

  const [payload, sig] = token.split('.');
  if (!payload || !sig) {
    return { valid: false };
  }

  let secret;
  try {
    secret = getSecret();
  } catch {
    return { valid: false };
  }

  const expectedSig = sign(payload, secret);
  const sigBuffer = Buffer.from(sig);
  const expectedBuffer = Buffer.from(expectedSig);
  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return { valid: false };
  }

  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return { valid: false };
  }

  if (!decoded.exp || !decoded.jti) {
    return { valid: false };
  }

  if (Date.now() > decoded.exp) {
    return { valid: false };
  }

  return { valid: true, theme: decoded.theme || null };
}

/**
 * Verifies signature, expiry, and single-use, consuming the token's jti on
 * first successful use. Intended to be called exactly once, at the point
 * the page exchanges the token for the real secret.
 * @param {string} token
 * @returns {{valid: true} | {valid: false, reason: 'malformed'|'bad-signature'|'expired'|'already-used'|'not-configured'}}
 */
export function consumeQuotesAdminLinkToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) {
    return { valid: false, reason: 'malformed' };
  }

  const [payload, sig] = token.split('.');
  if (!payload || !sig) {
    return { valid: false, reason: 'malformed' };
  }

  let secret;
  try {
    secret = getSecret();
  } catch {
    return { valid: false, reason: 'not-configured' };
  }

  const expectedSig = sign(payload, secret);
  const sigBuffer = Buffer.from(sig);
  const expectedBuffer = Buffer.from(expectedSig);
  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return { valid: false, reason: 'bad-signature' };
  }

  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return { valid: false, reason: 'malformed' };
  }

  if (!decoded.exp || !decoded.jti) {
    return { valid: false, reason: 'malformed' };
  }

  if (Date.now() > decoded.exp) {
    return { valid: false, reason: 'expired' };
  }

  if (consumedJtis.has(decoded.jti)) {
    return { valid: false, reason: 'already-used' };
  }

  consumedJtis.add(decoded.jti);
  return { valid: true };
}

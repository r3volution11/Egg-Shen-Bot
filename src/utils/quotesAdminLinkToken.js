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
 * @returns {string} opaque token
 */
export function signQuotesAdminLinkToken({ ttlMs = DEFAULT_TTL_MS } = {}) {
  const secret = getSecret();
  const payload = base64url(JSON.stringify({
    exp: Date.now() + ttlMs,
    jti: crypto.randomBytes(8).toString('hex'),
  }));
  const sig = sign(payload, secret);
  return `${payload}.${sig}`;
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

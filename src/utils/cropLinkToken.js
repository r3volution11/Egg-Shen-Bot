/**
 * Signed, single-use, short-lived tokens for the moderator image-crop link.
 * A moderator reaches the crop page by clicking a Link-style button in a
 * Discord message, not by logging in — so this can't reuse the existing
 * OAuth session flow. Instead each token is HMAC-signed and tied to one
 * requestId, verified with crypto.timingSafeEqual (the existing
 * discord_session cookie is plain base64 with no MAC and is not a safe
 * pattern to copy here).
 */

import crypto from 'crypto';

const DEFAULT_TTL_MS = 30 * 60 * 1000;

// In-memory only, matching how this bot already tolerates losing similar
// short-lived state (e.g. global.eventChannelSelections) on a restart — a
// moderator just needs a fresh link, which is a minor inconvenience, not a
// real problem worth persisting to disk for.
const consumedJtis = new Set();

function getSecret() {
  const secret = process.env.EVENT_CROP_LINK_SECRET;
  if (!secret) {
    throw new Error('EVENT_CROP_LINK_SECRET is not set — cannot sign a crop link token');
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
 * @param {string} requestId
 * @param {object} [options]
 * @param {number} [options.ttlMs]
 * @returns {string} opaque token
 */
export function signCropToken(requestId, { ttlMs = DEFAULT_TTL_MS } = {}) {
  const secret = getSecret();
  const payload = base64url(JSON.stringify({
    requestId,
    exp: Date.now() + ttlMs,
    jti: crypto.randomBytes(8).toString('hex'),
  }));
  const sig = sign(payload, secret);
  return `${payload}.${sig}`;
}

/**
 * Verifies signature, expiry, and that the token was issued for the given
 * requestId. Does not check/mark single-use — see consumeCropToken.
 * @param {string} token
 * @param {string} requestId
 * @returns {{valid: true, jti: string} | {valid: false, reason: 'malformed'|'bad-signature'|'expired'|'wrong-request'}}
 */
export function verifyCropToken(token, requestId) {
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
    return { valid: false, reason: 'malformed' };
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

  if (!decoded.requestId || !decoded.exp || !decoded.jti) {
    return { valid: false, reason: 'malformed' };
  }

  if (decoded.requestId !== requestId) {
    return { valid: false, reason: 'wrong-request' };
  }

  if (Date.now() > decoded.exp) {
    return { valid: false, reason: 'expired' };
  }

  return { valid: true, jti: decoded.jti };
}

/**
 * Same checks as verifyCropToken, but also enforces single-use by marking
 * the token's jti as consumed on first successful use. Intended to be
 * called only at the point an action is actually taken (e.g. saving a
 * cropped image), not on every page load.
 * @param {string} token
 * @param {string} requestId
 * @returns {{valid: true} | {valid: false, reason: 'malformed'|'bad-signature'|'expired'|'wrong-request'|'already-used'}}
 */
export function consumeCropToken(token, requestId) {
  const result = verifyCropToken(token, requestId);
  if (!result.valid) {
    return result;
  }

  if (consumedJtis.has(result.jti)) {
    return { valid: false, reason: 'already-used' };
  }

  consumedJtis.add(result.jti);
  return { valid: true };
}

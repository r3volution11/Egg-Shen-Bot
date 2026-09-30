/**
 * Signed, short-lived tokens for the tournament setup form, issued by
 * `/bracket setup-link` to an admin or mod. Same construction as
 * cropLinkToken.js (HMAC-SHA256, timing-safe compare), but NOT single-use:
 * setting up a tournament is a session — upload, pick matches, fix rows,
 * save, maybe save again — so every request re-verifies the token instead
 * of consuming it. The short lifetime is what bounds it.
 *
 * The token carries the guild and the user who asked for it. The routes act
 * on that guild only, whatever a request claims.
 */

import crypto from 'crypto';

export const SETUP_LINK_TTL_MS = 60 * 60 * 1000;

/**
 * TOURNAMENT_SETUP_LINK_SECRET when set, so it can be rotated on its own.
 * Otherwise a key derived from the bot token, so a self-hosted bot gets a
 * working form with no extra setup. Anyone holding the bot token controls
 * the bot anyway, so deriving from it adds no new exposure.
 */
function getSecret() {
  if (process.env.TOURNAMENT_SETUP_LINK_SECRET) return process.env.TOURNAMENT_SETUP_LINK_SECRET;
  if (process.env.DISCORD_TOKEN) {
    return crypto.createHash('sha256').update(`tournament-setup-link:${process.env.DISCORD_TOKEN}`).digest('hex');
  }
  throw new Error('Neither TOURNAMENT_SETUP_LINK_SECRET nor DISCORD_TOKEN is set — cannot sign a setup link');
}

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

/**
 * @param {{guildId: string, userId: string}} claims
 * @param {{ttlMs?: number}} [options]
 * @returns {string} opaque token
 */
export function signSetupToken({ guildId, userId }, { ttlMs = SETUP_LINK_TTL_MS } = {}) {
  const payload = Buffer.from(JSON.stringify({
    guildId,
    userId,
    exp: Date.now() + ttlMs,
    jti: crypto.randomBytes(8).toString('hex'),
  })).toString('base64url');
  return `${payload}.${sign(payload, getSecret())}`;
}

/**
 * @param {string} token
 * @returns {{valid: true, guildId: string, userId: string, exp: number} | {valid: false, reason: 'malformed'|'bad-signature'|'expired'|'not-configured'}}
 */
export function verifySetupToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return { valid: false, reason: 'malformed' };
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return { valid: false, reason: 'malformed' };

  let secret;
  try {
    secret = getSecret();
  } catch {
    return { valid: false, reason: 'not-configured' };
  }

  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    return { valid: false, reason: 'bad-signature' };
  }

  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return { valid: false, reason: 'malformed' };
  }
  if (!decoded.guildId || !decoded.userId || !decoded.exp) return { valid: false, reason: 'malformed' };
  if (Date.now() > decoded.exp) return { valid: false, reason: 'expired' };

  return { valid: true, guildId: decoded.guildId, userId: decoded.userId, exp: decoded.exp };
}

/**
 * The event request form's login cookie (`discord_session`), signed.
 *
 * It used to be plain base64 JSON, so anyone could write one claiming to be
 * any member, and the form's submit trusted a submitter id from the request
 * body besides (found 2026-10-03). Now the cookie carries an HMAC, checked
 * with timingSafeEqual like the crop links (cropLinkToken.js), and the
 * server takes who's asking from the cookie alone.
 *
 * The secret is SESSION_SECRET, or — so an existing install keeps working
 * without a new setting — one derived from DISCORD_CLIENT_SECRET, which
 * every install using the form already has (OAuth needs it). Set
 * SESSION_SECRET to rotate sessions on their own. Cookies from before
 * signing don't verify: those people simply log in again.
 */

import crypto from 'crypto';

export const SESSION_COOKIE = 'discord_session';
export const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function getSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (process.env.DISCORD_CLIENT_SECRET) {
    return crypto.createHmac('sha256', process.env.DISCORD_CLIENT_SECRET).update('egg-shen-bot:discord_session').digest('hex');
  }
  throw new Error('SESSION_SECRET (or DISCORD_CLIENT_SECRET) must be set to sign login cookies');
}

const sign = (payload) => crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');

/**
 * @param {{userId: string, username: string, discriminator?: string, avatar?: string|null, guildId?: string}} session
 * @returns {string} the cookie's value
 */
export function signSession(session, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ ...session, timestamp: now })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

/**
 * The session in a cookie value, or null: missing, unsigned, tampered,
 * malformed or over 24 hours old.
 */
export function readSession(value, now = Date.now()) {
  if (typeof value !== 'string') return null;
  const [payload, sig, extra] = value.split('.');
  if (!payload || !sig || extra !== undefined) return null;
  let expected;
  try {
    expected = Buffer.from(sign(payload));
  } catch {
    return null;
  }
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!session?.userId || typeof session.timestamp !== 'number') return null;
    if (now - session.timestamp > SESSION_MAX_AGE_MS || session.timestamp > now + 60 * 1000) return null;
    return session;
  } catch {
    return null;
  }
}

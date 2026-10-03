/**
 * A signed discord_session cookie header for supertest, the way the bot
 * signs one at login (src/utils/sessionCookie.js; the secret is set in
 * tests/jest.setup.js).
 *   request(app).post('/api/event-request').set('Cookie', sessionCookieFor('123'))
 */
import { signSession, SESSION_COOKIE } from '../../src/utils/sessionCookie.js';

export function sessionCookieFor(userId, { username = 'TestUser', discriminator = '0', timestamp = Date.now() } = {}) {
  return `${SESSION_COOKIE}=${signSession({ userId, username, discriminator }, timestamp)}`;
}

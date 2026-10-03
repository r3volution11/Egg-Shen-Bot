/**
 * A discord_session login cookie for a test, signed the way the bot signs
 * one at the OAuth callback (src/utils/sessionCookie.js), so tests can log
 * in without driving real Discord OAuth.
 *
 * The secret must match the harness's (tests/e2e/harness/serve.js); it's
 * read when a cookie is signed.
 */
import { signSession } from '../../../src/utils/sessionCookie.js';

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'e2e-session-secret';

export function buildSessionCookieValue({ userId, username = 'e2e-test-user', discriminator = '0', avatar = null, guildId, timestamp = Date.now() }) {
  return signSession({ userId, username, discriminator, avatar, guildId }, timestamp);
}

/**
 * Sets the discord_session cookie on a Playwright BrowserContext, bypassing
 * the real Discord OAuth redirect entirely. Call before navigating to the form.
 */
export async function loginAs(context, { baseURL, ...sessionOpts }) {
  const url = new URL(baseURL);
  await context.addCookies([
    {
      name: 'discord_session',
      value: buildSessionCookieValue(sessionOpts),
      domain: url.hostname,
      path: '/',
      httpOnly: true,
      secure: false, // harness runs over plain http on localhost, like NODE_ENV !== 'production' in server.js
      sameSite: 'Lax',
    },
  ]);
}

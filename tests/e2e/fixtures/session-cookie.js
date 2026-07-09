/**
 * Forges a discord_session cookie matching the exact shape src/api/server.js
 * writes at the OAuth callback and reads at /api/auth/session — see
 * server.js's `sessionToken` construction and the /api/auth/session handler.
 *
 * The cookie is unsigned base64 JSON (not a JWT, no HMAC), so tests can
 * build a valid one directly instead of driving real Discord OAuth.
 */
export function buildSessionCookieValue({ userId, username = 'e2e-test-user', discriminator = '0', avatar = null, guildId, timestamp = Date.now() }) {
  const payload = { userId, username, discriminator, avatar, guildId, timestamp };
  return Buffer.from(JSON.stringify(payload)).toString('base64');
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

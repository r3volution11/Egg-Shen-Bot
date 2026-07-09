import { loginAs as loginAsCookie } from './fixtures/session-cookie.js';

/**
 * Resets the shared, IP-keyed event-request rate limiter for this test run.
 *
 * Must run via page.evaluate() (i.e. fetch from *inside* the browser), not
 * Playwright's standalone `request` fixture — the latter is a separate Node
 * HTTP client that can resolve "localhost" to a different local address
 * (IPv4 vs IPv6) than the actual browser page, silently resetting the wrong
 * rate-limit bucket. Running the reset from the page guarantees it shares
 * the exact same network path as every other request the test makes.
 */
export async function resetRateLimit(page) {
  const status = await page.evaluate(async () => {
    const res = await fetch('/api/__test__/reset-rate-limit', { method: 'POST' });
    return res.status;
  });
  if (status !== 204) {
    throw new Error(`Failed to reset rate limit: ${status}`);
  }
}

/** Sets a forged discord_session cookie on the page's browser context. */
export async function loginAs(page, opts) {
  await loginAsCookie(page.context(), { baseURL: 'http://localhost:3000', ...opts });
}

/**
 * Fills the minimum required fields (title, start date, start time).
 *
 * Explicitly sets #start-time rather than relying on its page-load default
 * (18:00, set via JS after populateTimeOptions() dynamically builds the
 * <option> list) — a native form.reset() after a prior successful submit
 * reverts <select> elements to the browser's own default (the first option,
 * value ""), not the JS-assigned value, since none of the dynamically
 * created options carry a `selected` attribute. Tests that submit more than
 * once per page load need this to avoid silently failing client-side
 * required-field validation on the second submission.
 */
export async function fillRequiredFields(page, title = 'Test Watch Party') {
  await page.locator('#title').fill(title);
  const today = new Date();
  today.setDate(today.getDate() + 1);
  const dateStr = today.toISOString().split('T')[0];
  await page.locator('#start-date').fill(dateStr);
  await page.locator('#start-time').selectOption('18:00');
}

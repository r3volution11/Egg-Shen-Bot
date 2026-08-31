import { test, expect } from '@playwright/test';
import { GUILD_SIMPLE, MEMBER_ID } from './fixtures/scenarios.js';
import { loginAs, resetRateLimit } from './helpers.js';

// The form already implicitly converts a submitter's typed local time to
// the correct UTC instant (new Date("YYYY-MM-DDTHH:mm") with no offset is
// parsed as browser-local time per spec) — this test only covers the
// visibility hint, not a functional change to that conversion.
test('shows the browser-detected timezone next to the Start Time field', async ({ page }) => {
  await loginAs(page, { userId: MEMBER_ID, guildId: GUILD_SIMPLE.id });
  await page.goto(`/?e2eGuildId=${GUILD_SIMPLE.id}`);
  await resetRateLimit(page);

  const hint = page.locator('#timezone-hint');
  await expect(hint).toBeVisible();
  await expect(hint).toContainText('Times shown in your local timezone:');
  // A real IANA zone name (e.g. "UTC", "America/Los_Angeles") should have
  // replaced the static placeholder text by the time the page has loaded.
  await expect(hint).not.toHaveText('Times shown in your local timezone.');
});

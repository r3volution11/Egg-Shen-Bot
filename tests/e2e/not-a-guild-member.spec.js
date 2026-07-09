import { test, expect } from '@playwright/test';
import { GUILD_SIMPLE, NON_MEMBER_ID } from './fixtures/scenarios.js';
import { loginAs, resetRateLimit, fillRequiredFields } from './helpers.js';

test('a valid session for a user who is not a guild member is rejected on submit, not on page load', async ({ page }) => {
  // The session cookie alone doesn't prove guild membership — only the
  // submit-time server-side re-check (checkGuildMembership) does.
  await loginAs(page, { userId: NON_MEMBER_ID, guildId: GUILD_SIMPLE.id });
  await page.goto(`/?e2eGuildId=${GUILD_SIMPLE.id}`);
  await resetRateLimit(page);

  // Session is "authenticated," so the form renders as logged in.
  await expect(page.locator('#event-form')).toBeVisible();
  await expect(page.locator('#login-btn')).toBeHidden();

  await fillRequiredFields(page);
  await page.locator('#submit-btn').click();

  await expect(page.locator('#form-message')).toContainText('must be a member of');
  await expect(page.locator('#form-message').locator('a')).toHaveAttribute('href', GUILD_SIMPLE.config.inviteUrl);
});

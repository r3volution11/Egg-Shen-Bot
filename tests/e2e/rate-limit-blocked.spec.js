import { test, expect } from '@playwright/test';
import { GUILD_SIMPLE, MEMBER_ID } from './fixtures/scenarios.js';
import { loginAs, resetRateLimit, fillRequiredFields } from './helpers.js';

test('a second submission within 5 minutes is blocked with the real 429 response', async ({ page }) => {
  await loginAs(page, { userId: MEMBER_ID, guildId: GUILD_SIMPLE.id });
  await page.goto(`/?e2eGuildId=${GUILD_SIMPLE.id}`);
  await resetRateLimit(page); // start from a clean bucket for this IP

  await fillRequiredFields(page, 'First Request');
  await page.locator('#submit-btn').click();
  await expect(page.locator('#form-message')).toContainText('submitted successfully');

  // Deliberately NOT resetting the limiter here — this submission should be blocked.
  await fillRequiredFields(page, 'Second Request');
  await page.locator('#submit-btn').click();

  await expect(page.locator('#form-message')).toContainText('wait 5 minutes');
  await expect(page.locator('#form-message')).toHaveClass(/error/);

  // The button must be re-enabled even after a failed submission.
  await expect(page.locator('#submit-btn')).toBeEnabled();
  await expect(page.locator('#submit-btn')).toHaveText('Submit Request');
});

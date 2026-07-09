import { test, expect } from '@playwright/test';
import { GUILD_SIMPLE, MEMBER_ID } from './fixtures/scenarios.js';
import { loginAs, resetRateLimit, fillRequiredFields } from './helpers.js';

test('simple-mode guild: channel selection is hidden and moderators assign channels on approval', async ({ page }) => {
  await loginAs(page, { userId: MEMBER_ID, guildId: GUILD_SIMPLE.id });
  await page.goto(`/?e2eGuildId=${GUILD_SIMPLE.id}`);
  await resetRateLimit(page);

  await expect(page.locator('#event-form')).toBeVisible();
  await expect(page.locator('#channel').locator('..')).toBeHidden(); // .form-group wrapping #channel
  await expect(page.locator('#use-voice-channel').locator('../..')).toBeHidden(); // .form-group wrapping the checkbox

  await fillRequiredFields(page);
  await page.locator('#submit-btn').click();

  await expect(page.locator('#form-message')).toContainText('submitted successfully');
  await expect(page.locator('#form-message')).toHaveClass(/success/);
});

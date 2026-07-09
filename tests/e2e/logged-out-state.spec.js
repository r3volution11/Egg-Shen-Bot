import { test, expect } from '@playwright/test';
import { GUILD_SIMPLE } from './fixtures/scenarios.js';

test('logged-out visitor sees the login button and a hidden form; login targets the right OAuth URL', async ({ page }) => {
  // No cookie is set for this test — fresh, logged-out context by default.
  let capturedAuthUrl = null;
  await page.route('**/api/auth/discord*', async (route) => {
    capturedAuthUrl = route.request().url();
    // Short-circuit before it would hit real discord.com.
    await route.fulfill({ status: 200, body: 'stubbed redirect' });
  });

  await page.goto(`/?e2eGuildId=${GUILD_SIMPLE.id}`);

  await expect(page.locator('#login-btn')).toBeVisible();
  await expect(page.locator('#event-form')).toBeHidden();
  await expect(page.locator('#user-info')).toBeHidden();

  await page.locator('#login-btn').click();

  expect(capturedAuthUrl).toContain(`/api/auth/discord?guildId=${GUILD_SIMPLE.id}`);
});

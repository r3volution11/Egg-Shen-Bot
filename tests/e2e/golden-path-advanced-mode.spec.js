import { test, expect } from '@playwright/test';
import { GUILD_ADVANCED, MEMBER_ID } from './fixtures/scenarios.js';
import { loginAs, resetRateLimit, fillRequiredFields } from './helpers.js';

test('advanced-mode guild: channel select is populated from /api/channels and required', async ({ page }) => {
  await loginAs(page, { userId: MEMBER_ID, guildId: GUILD_ADVANCED.id });
  await page.goto(`/?e2eGuildId=${GUILD_ADVANCED.id}`);
  await resetRateLimit(page);

  const channelSelect = page.locator('#channel');
  await expect(channelSelect.locator('..')).toBeVisible();

  // loadChannels() fetches asynchronously after DOMContentLoaded — wait for
  // the placeholder to be replaced before inspecting the populated options.
  await expect(channelSelect).not.toContainText('Loading channels');

  // Only the two allow-listed text channels should appear — not the moderation channel.
  const optionTexts = await channelSelect.locator('option').allTextContents();
  expect(optionTexts.some((t) => t.includes('movie-night'))).toBe(true);
  expect(optionTexts.some((t) => t.includes('book-club'))).toBe(true);
  expect(optionTexts.some((t) => t.includes('mod-queue'))).toBe(false);

  await channelSelect.selectOption({ label: '# movie-night' });
  await fillRequiredFields(page);
  await page.locator('#submit-btn').click();

  await expect(page.locator('#form-message')).toContainText('submitted successfully');
});

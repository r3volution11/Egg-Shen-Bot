import { test, expect } from '@playwright/test';
import { GUILD_NO_CONFIG } from './fixtures/scenarios.js';

test('a guild with no event-request config falls back to the disabled message, no server fixture needed', async ({ page }) => {
  // GUILD_NO_CONFIG deliberately has no guild_configs/<id>.json fixture written —
  // loadGuildConfig() falls back to its built-in default (eventRequests.enabled: false).
  await page.goto(`/?e2eGuildId=${GUILD_NO_CONFIG.id}`);

  await expect(page.locator('#info-text')).toContainText('currently disabled');
  await expect(page.locator('#event-form')).toBeHidden();
  await expect(page.locator('#login-btn')).toBeHidden();
});

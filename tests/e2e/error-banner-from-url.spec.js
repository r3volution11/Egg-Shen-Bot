import { test, expect } from '@playwright/test';
import { GUILD_SIMPLE } from './fixtures/scenarios.js';

test('an ?error=not_member URL renders the join-server banner purely client-side', async ({ page }) => {
  const params = new URLSearchParams({
    e2eGuildId: GUILD_SIMPLE.id,
    error: 'not_member',
    serverName: 'Example Simple-Mode Server',
    inviteUrl: 'https://discord.gg/example-simple',
  });

  await page.goto(`/?${params.toString()}`);

  await expect(page.locator('#form-message')).toContainText('must be a member of Example Simple-Mode Server');
  const link = page.locator('#form-message a');
  await expect(link).toHaveAttribute('href', 'https://discord.gg/example-simple');

  // The URL is cleaned up (query params stripped) after the banner is shown.
  await expect(page).toHaveURL(/\/$/);
});

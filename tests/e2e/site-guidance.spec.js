import { test, expect } from '@playwright/test';
import { GUILD_GUIDANCE, GUILD_SIMPLE, MEMBER_ID } from './fixtures/scenarios.js';
import { loginAs, resetRateLimit } from './helpers.js';
import { DEFAULT_GUIDANCE } from '../../src/utils/eventRequestGuidance.js';

// The form's guidance: the helper text under each field, an intro and a
// footer. Every server gets the defaults until its admins rewrite a piece
// (/eggshen-config-events event-requests guidance). Admin-written text is
// rendered with textContent: markup in it must show as text, not run.

test('a server\'s guidance shows under the right fields, with its lists, bold and links', async ({ page }) => {
  await loginAs(page, { userId: MEMBER_ID, guildId: GUILD_GUIDANCE.id });
  await page.goto(`/?e2eGuildId=${GUILD_GUIDANCE.id}`);
  await resetRateLimit(page);

  const intro = page.locator('#guidance-intro');
  await expect(intro).toBeVisible();
  await expect(intro.locator('p').first()).toHaveText('Login is only used to check you\'re a member.');
  await expect(intro.locator('strong').first()).toHaveText('Before requesting:');
  await expect(intro.locator('li')).toHaveText(['Check the Events tab first.', 'Approved events use #cineplex.']);

  // Under its own field, not anywhere else
  await expect(page.locator('#title ~ #guidance-title')).toBeVisible();
  await expect(page.locator('#guidance-when')).toHaveText('Schedule within 2 weeks.');
  await expect(page.locator('#guidance-frequency')).toHaveText('Ask a mod about recurring events.');
  // A piece it didn't rewrite shows the default; one it hid doesn't show
  await expect(page.locator('#guidance-description')).toHaveText(DEFAULT_GUIDANCE.fields.description);
  await expect(page.locator('#guidance-image')).toBeHidden();

  const link = page.locator('#guidance-footer a');
  await expect(link).toHaveAttribute('href', 'https://example.com/faq');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');

  // Markup is text: no <img> was created, nothing ran
  await expect(page.locator('#guidance-title')).toHaveText('Keep it horror. <img src=x onerror="window.__pwned=1">');
  await expect(page.locator('#guidance-title img')).toHaveCount(0);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});

test('a server that never set guidance shows the defaults, as plain hint text', async ({ page }) => {
  await loginAs(page, { userId: MEMBER_ID, guildId: GUILD_SIMPLE.id });
  await page.goto(`/?e2eGuildId=${GUILD_SIMPLE.id}`);
  await resetRateLimit(page);

  await expect(page.locator('#event-form')).toBeVisible();
  for (const key of ['title', 'description', 'image', 'when', 'frequency']) {
    await expect(page.locator(`#guidance-${key}`)).toHaveText(DEFAULT_GUIDANCE.fields[key]);
  }
  await expect(page.locator('#guidance-intro li')).toHaveCount(2);
  await expect(page.locator('#guidance-footer strong')).toHaveText('Questions or feedback?');
  // One hint per field: the guidance replaced the form's old fixed hints
  await expect(page.locator('#title').locator('..').locator('.form-text')).toHaveCount(1);
  // The description placeholder no longer names one community's services
  await expect(page.locator('#description')).toHaveAttribute('placeholder', 'Details about the event, where to watch it, and any other info...');
});

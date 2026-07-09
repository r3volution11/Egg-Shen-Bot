import { test, expect } from '@playwright/test';
import { GUILD_ADVANCED, MEMBER_ID } from './fixtures/scenarios.js';
import { loginAs, resetRateLimit, fillRequiredFields } from './helpers.js';

test('voice/stage checkbox toggles the voice channel select and its required state', async ({ page }) => {
  await loginAs(page, { userId: MEMBER_ID, guildId: GUILD_ADVANCED.id });
  await page.goto(`/?e2eGuildId=${GUILD_ADVANCED.id}`);

  const voiceGroup = page.locator('#voice-channel-group');
  const voiceSelect = page.locator('#voice-channel');
  const voiceCheckbox = page.locator('#use-voice-channel');

  await expect(voiceGroup).toBeHidden();
  expect(await voiceSelect.evaluate((el) => el.required)).toBe(false);

  await voiceCheckbox.check();
  await expect(voiceGroup).toBeVisible();
  expect(await voiceSelect.evaluate((el) => el.required)).toBe(true);

  const optionTexts = await voiceSelect.locator('option').allTextContents();
  expect(optionTexts.some((t) => t.includes('Watch Party VC'))).toBe(true);

  await voiceSelect.selectOption({ label: '🔊 Watch Party VC' });

  await voiceCheckbox.uncheck();
  await expect(voiceGroup).toBeHidden();
  expect(await voiceSelect.evaluate((el) => el.required)).toBe(false);
  expect(await voiceSelect.evaluate((el) => el.value)).toBe(''); // cleared on uncheck
});

test('submitting with a voice channel selected succeeds', async ({ page }) => {
  await loginAs(page, { userId: MEMBER_ID, guildId: GUILD_ADVANCED.id });
  await page.goto(`/?e2eGuildId=${GUILD_ADVANCED.id}`);
  await resetRateLimit(page);

  const channelSelect = page.locator('#channel');
  await expect(channelSelect).not.toContainText('Loading channels');
  await channelSelect.selectOption({ label: '# movie-night' });
  await page.locator('#use-voice-channel').check();
  await page.locator('#voice-channel').selectOption({ label: '🔊 Watch Party VC' });
  await fillRequiredFields(page);
  await page.locator('#submit-btn').click();

  await expect(page.locator('#form-message')).toContainText('submitted successfully');
});

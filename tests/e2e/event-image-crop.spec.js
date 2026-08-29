import { test, expect } from '@playwright/test';
import { GUILD_SIMPLE, MEMBER_ID } from './fixtures/scenarios.js';
import { loginAs, resetRateLimit, fillRequiredFields } from './helpers.js';

// Minimal valid 1x1 PNG, embedded directly rather than adding a binary
// fixture file to the repo.
const TEST_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test('selecting an image auto-shows a 16:9 crop UI and uploads the cropped result', async ({ page }) => {
  await loginAs(page, { userId: MEMBER_ID, guildId: GUILD_SIMPLE.id });
  await page.goto(`/?e2eGuildId=${GUILD_SIMPLE.id}`);
  await resetRateLimit(page);

  await expect(page.locator('#event-form')).toBeVisible();
  await expect(page.locator('#image-crop-container')).toBeHidden();

  await page.locator('#event-image-file').setInputFiles({
    name: 'poster.png',
    mimeType: 'image/png',
    buffer: Buffer.from(TEST_PNG_BASE64, 'base64'),
  });

  await expect(page.locator('#image-crop-container')).toBeVisible();
  // Cropper.js renders its own canvas/cropper-container inside the wrapper
  // once initialized against the loaded image.
  await expect(page.locator('.cropper-container')).toBeVisible();

  await expect(page.locator('#image-upload-status')).toContainText('Image uploaded', { timeout: 5000 });
  await expect(page.locator('#image-upload-status')).toHaveClass(/success/);

  await fillRequiredFields(page);
  await page.locator('#submit-btn').click();

  await expect(page.locator('#form-message')).toContainText('submitted successfully');
});

test('clearing a selected file re-enables the URL field, which then tears down the crop UI', async ({ page }) => {
  await loginAs(page, { userId: MEMBER_ID, guildId: GUILD_SIMPLE.id });
  await page.goto(`/?e2eGuildId=${GUILD_SIMPLE.id}`);
  await resetRateLimit(page);

  await page.locator('#event-image-file').setInputFiles({
    name: 'poster.png',
    mimeType: 'image/png',
    buffer: Buffer.from(TEST_PNG_BASE64, 'base64'),
  });
  await expect(page.locator('#image-crop-container')).toBeVisible();
  await expect(page.locator('#event-image-url')).toBeDisabled();

  // Selecting a file disables the URL field (mutual exclusivity) — a real
  // user switches to the URL path by clearing the file selection first.
  await page.locator('#event-image-file').setInputFiles([]);
  await expect(page.locator('#event-image-url')).toBeEnabled();
  await expect(page.locator('#image-crop-container')).toBeHidden();

  await page.locator('#event-image-url').fill('https://example.com/poster.jpg');
  await expect(page.locator('#event-image-file')).toBeDisabled();
});

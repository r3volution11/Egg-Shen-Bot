import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { GUILD_SIMPLE, MEMBER_ID } from './fixtures/scenarios.js';
import { loginAs, resetRateLimit, fillRequiredFields } from './helpers.js';
import { signCropToken } from '../../src/utils/cropLinkToken.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.join(__dirname, '../..');
const REQUESTS_FILE = path.join(REPO_ROOT, 'pending_event_requests.json');

async function getMostRecentRequestId() {
  const data = JSON.parse(await fs.readFile(REQUESTS_FILE, 'utf8'));
  const ids = Object.keys(data);
  // requestId is `${Date.now()}_${random}` — sorting by that timestamp
  // prefix picks the request this test just submitted.
  return ids.sort().at(-1);
}

// Minimal valid 1x1 PNG, embedded directly rather than adding a binary
// fixture file to the repo.
const TEST_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test('selecting an image auto-shows a 16:9 crop UI and uploads the cropped result', async ({ page }) => {
  await loginAs(page, { userId: MEMBER_ID, guildId: GUILD_SIMPLE.id });
  await page.goto(`/?e2eGuildId=${GUILD_SIMPLE.id}`);
  await resetRateLimit(page);

  await expect(page.locator('#event-form')).toBeVisible();
  await expect(page.locator('#image-crop-group')).toBeHidden();

  await page.locator('#event-image-file').setInputFiles({
    name: 'poster.png',
    mimeType: 'image/png',
    buffer: Buffer.from(TEST_PNG_BASE64, 'base64'),
  });

  await expect(page.locator('#image-crop-group')).toBeVisible();
  // Cropper.js renders its own canvas/cropper-container inside the wrapper
  // once initialized against the loaded image.
  await expect(page.locator('.cropper-container')).toBeVisible();

  await expect(page.locator('#image-upload-status')).toContainText('Image uploaded', { timeout: 5000 });
  await expect(page.locator('#image-upload-status')).toHaveClass(/success/);

  await fillRequiredFields(page);
  await page.locator('#submit-btn').click();

  await expect(page.locator('#form-message')).toContainText('submitted successfully');
});

test('"Change Image" resets the crop UI back to the picker, ready to select a file or fetch a URL again', async ({ page }) => {
  await loginAs(page, { userId: MEMBER_ID, guildId: GUILD_SIMPLE.id });
  await page.goto(`/?e2eGuildId=${GUILD_SIMPLE.id}`);
  await resetRateLimit(page);

  await page.locator('#event-image-file').setInputFiles({
    name: 'poster.png',
    mimeType: 'image/png',
    buffer: Buffer.from(TEST_PNG_BASE64, 'base64'),
  });
  await expect(page.locator('#image-crop-group')).toBeVisible();
  await expect(page.locator('#image-picker-group')).toBeHidden();
  await expect(page.locator('#image-url-group')).toBeHidden();

  await page.locator('#change-image-btn').click();

  await expect(page.locator('#image-crop-group')).toBeHidden();
  await expect(page.locator('#image-picker-group')).toBeVisible();
  await expect(page.locator('#image-url-group')).toBeVisible();
  await expect(page.locator('#event-image-file')).toBeEnabled();
  await expect(page.locator('#event-image-url')).toBeEnabled();
  await expect(page.locator('#event-image-url')).toHaveValue('');
});

test('the moderator crop page loads the true uncropped original, not the submitter\'s already-cropped result', async ({ page }) => {
  await loginAs(page, { userId: MEMBER_ID, guildId: GUILD_SIMPLE.id });
  await page.goto(`/?e2eGuildId=${GUILD_SIMPLE.id}`);
  await resetRateLimit(page);

  await page.locator('#event-image-file').setInputFiles({
    name: 'poster.png',
    mimeType: 'image/png',
    buffer: Buffer.from(TEST_PNG_BASE64, 'base64'),
  });
  await expect(page.locator('#image-upload-status')).toContainText('Image uploaded', { timeout: 5000 });

  // Drag the crop box so the uploaded (cropped) result is a real, distinct
  // crop of the source — not just the auto-crop, which for a 1x1 source
  // would be visually indistinguishable from the original anyway.
  const cropBox = page.locator('.cropper-crop-box');
  const box = await cropBox.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.mouse.up();
  await page.waitForTimeout(1000); // let the 800ms debounced re-upload fire

  await fillRequiredFields(page, 'Original-Preservation Test');
  await page.locator('#submit-btn').click();
  await expect(page.locator('#form-message')).toContainText('submitted successfully');

  const requestId = await getMostRecentRequestId();
  const token = signCropToken(requestId);

  // Must start listening BEFORE navigating — the crop page's own JS fires
  // its current-image fetch immediately on load, so waiting for the
  // response after goto() resolves races the request itself.
  const imageResponsePromise = page.waitForResponse(res => res.url().includes('/current-image'));
  await page.goto(`/crop/${requestId}?token=${encodeURIComponent(token)}`);

  // The crop page's own current-image fetch resolves to whatever the
  // server decided to serve — asserting on the actual response bytes
  // proves it's the untouched original PNG, not a re-encoded JPEG crop
  // (saveUploadedImage stores crops as JPEG; the original keeps its
  // original PNG mimetype/bytes).
  const imageResponse = await imageResponsePromise;
  const imageBuffer = await imageResponse.body();
  expect(imageResponse.headers()['content-type']).toContain('image/png');
  expect(imageBuffer.toString('base64')).toBe(TEST_PNG_BASE64);
});

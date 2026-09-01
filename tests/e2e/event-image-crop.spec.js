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

function trackUploadRequests(page) {
  const uploadResponses = [];
  page.on('response', (res) => {
    if (res.url().includes('/api/event-request/upload-image')) uploadResponses.push(res);
  });
  return uploadResponses;
}

test('selecting an image uploads the original immediately, then shows a 16:9 crop UI — the crop itself only uploads on Submit', async ({ page }) => {
  await loginAs(page, { userId: MEMBER_ID, guildId: GUILD_SIMPLE.id });
  await page.goto(`/?e2eGuildId=${GUILD_SIMPLE.id}`);
  await resetRateLimit(page);

  const uploadResponses = trackUploadRequests(page);

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

  // Picking a file uploads the ORIGINAL right away (the source of truth a
  // moderator's crop-link page later re-crops from) — exactly one request.
  expect(uploadResponses.length).toBe(1);

  await fillRequiredFields(page);
  await page.locator('#submit-btn').click();

  await expect(page.locator('#form-message')).toContainText('submitted successfully');

  // Submitting uploads the crop under the SAME token — a second request,
  // not a third-plus no matter how the crop box was adjusted beforehand
  // (see the "adjusting the crop box" test below).
  expect(uploadResponses.length).toBe(2);
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

test('adjusting the crop box any number of times after the original uploads triggers no further uploads — only Submit uploads the crop', async ({ page }) => {
  await loginAs(page, { userId: MEMBER_ID, guildId: GUILD_SIMPLE.id });
  await page.goto(`/?e2eGuildId=${GUILD_SIMPLE.id}`);
  await resetRateLimit(page);

  await page.locator('#event-image-file').setInputFiles({
    name: 'poster.png',
    mimeType: 'image/png',
    buffer: Buffer.from(TEST_PNG_BASE64, 'base64'),
  });
  await expect(page.locator('#image-upload-status')).toContainText('Image uploaded', { timeout: 5000 });

  const uploadResponses = trackUploadRequests(page);

  // Nudge the crop box repeatedly with the keyboard (reliably fires
  // Cropper's cropend event regardless of how small the fixture image is,
  // unlike a raw mouse-drag simulation against a 1x1 source). This is the
  // actual abuse surface the fix closes: nudging the crop box repeatedly
  // no longer generates a real upload per adjustment — only the one
  // original upload (already counted before this listener attached) and,
  // later, the one crop upload at Submit.
  const cropBox = page.locator('.cropper-crop-box');
  await cropBox.click();
  for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(200);
  }

  expect(uploadResponses.length).toBe(0);
});

test('a submission uses the crop framing shown at the moment Submit is clicked', async ({ page }) => {
  await loginAs(page, { userId: MEMBER_ID, guildId: GUILD_SIMPLE.id });
  await page.goto(`/?e2eGuildId=${GUILD_SIMPLE.id}`);
  await resetRateLimit(page);

  await page.locator('#event-image-file').setInputFiles({
    name: 'poster.png',
    mimeType: 'image/png',
    buffer: Buffer.from(TEST_PNG_BASE64, 'base64'),
  });
  await expect(page.locator('#image-upload-status')).toContainText('Image uploaded', { timeout: 5000 });

  // Adjust the crop box before submitting — purely local, no request yet.
  const cropBox = page.locator('.cropper-crop-box');
  await cropBox.click();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(200);

  await fillRequiredFields(page);

  const uploadResponsePromise = page.waitForResponse((res) => res.url().includes('/api/event-request/upload-image'));
  await page.locator('#submit-btn').click();
  const uploadResponse = await uploadResponsePromise;

  expect(uploadResponse.status()).toBe(200);
  await expect(page.locator('#form-message')).toContainText('submitted successfully');
});

test('the moderator crop page loads the true uncropped original, not the submitter\'s cropped result', async ({ page }) => {
  await loginAs(page, { userId: MEMBER_ID, guildId: GUILD_SIMPLE.id });
  await page.goto(`/?e2eGuildId=${GUILD_SIMPLE.id}`);
  await resetRateLimit(page);

  await page.locator('#event-image-file').setInputFiles({
    name: 'poster.png',
    mimeType: 'image/png',
    buffer: Buffer.from(TEST_PNG_BASE64, 'base64'),
  });
  await expect(page.locator('#image-upload-status')).toContainText('Image uploaded', { timeout: 5000 });

  // Adjust the crop box so the eventually-uploaded (cropped) result is a
  // real, distinct crop of the source — not just the auto-crop, which for a
  // 1x1 source would be visually indistinguishable from the original
  // anyway. Purely local until Submit — no request happens from this.
  const cropBox = page.locator('.cropper-crop-box');
  await cropBox.click();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(200);

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

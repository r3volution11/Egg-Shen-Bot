import { test, expect } from '@playwright/test';
import http from 'http';
import { GUILD_SIMPLE, MEMBER_ID } from './fixtures/scenarios.js';
import { loginAs, resetRateLimit, fillRequiredFields } from './helpers.js';

// Minimal valid 1x1 PNG, embedded directly rather than adding a binary
// fixture file to the repo (same fixture used in event-image-crop.spec.js).
const TEST_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const TEST_PNG_BUFFER = Buffer.from(TEST_PNG_BASE64, 'base64');

// A throwaway local HTTP server standing in for "some image hosted
// elsewhere on the internet" — POST /api/event-request/fetch-image-url
// does a REAL server-side fetch() of whatever URL the form submits, so
// this exercises that real fetch/validate path end-to-end (not just a
// browser-level page.route() mock of the bot's own API), without a
// dependency on a real external image host.
function startImageServer({ contentType = 'image/png', body = TEST_PNG_BUFFER, status = 200 } = {}) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.writeHead(status, { 'content-type': contentType });
      res.end(body);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}/poster.png` });
    });
  });
}

test('pasting an image URL and clicking Fetch & Crop loads it into the same crop UI a file upload uses', async ({ page }) => {
  const { server, url } = await startImageServer();
  try {
    await loginAs(page, { userId: MEMBER_ID, guildId: GUILD_SIMPLE.id });
    await page.goto(`/?e2eGuildId=${GUILD_SIMPLE.id}`);
    await resetRateLimit(page);

    await expect(page.locator('#image-crop-group')).toBeHidden();

    await page.locator('#event-image-url').fill(url);
    await page.locator('#fetch-image-url-btn').click();

    await expect(page.locator('#image-crop-group')).toBeVisible();
    await expect(page.locator('#image-picker-group')).toBeHidden();
    await expect(page.locator('#image-url-group')).toBeHidden();
    await expect(page.locator('.cropper-container')).toBeVisible();

    await expect(page.locator('#image-upload-status')).toContainText('Image uploaded', { timeout: 5000 });
    await expect(page.locator('#image-upload-status')).toHaveClass(/success/);

    await fillRequiredFields(page);
    await page.locator('#submit-btn').click();

    await expect(page.locator('#form-message')).toContainText('submitted successfully');
  } finally {
    server.close();
  }
});

test('a fetch failure (404) shows a clear error and never enters the crop UI', async ({ page }) => {
  const { server, url } = await startImageServer({ status: 404, body: 'not found' });
  try {
    await loginAs(page, { userId: MEMBER_ID, guildId: GUILD_SIMPLE.id });
    await page.goto(`/?e2eGuildId=${GUILD_SIMPLE.id}`);
    await resetRateLimit(page);

    await page.locator('#event-image-url').fill(url);
    await page.locator('#fetch-image-url-btn').click();

    await expect(page.locator('#image-upload-status')).toContainText('404', { timeout: 5000 });
    await expect(page.locator('#image-upload-status')).toHaveClass(/error/);
    await expect(page.locator('#image-crop-group')).toBeHidden();
  } finally {
    server.close();
  }
});

test('a non-image content-type is rejected with a clear error', async ({ page }) => {
  const { server, url } = await startImageServer({ contentType: 'text/html', body: '<html></html>' });
  try {
    await loginAs(page, { userId: MEMBER_ID, guildId: GUILD_SIMPLE.id });
    await page.goto(`/?e2eGuildId=${GUILD_SIMPLE.id}`);
    await resetRateLimit(page);

    await page.locator('#event-image-url').fill(url);
    await page.locator('#fetch-image-url-btn').click();

    await expect(page.locator('#image-upload-status')).toContainText("didn't return an image", { timeout: 5000 });
    await expect(page.locator('#image-crop-group')).toBeHidden();
  } finally {
    server.close();
  }
});

test('clicking Fetch & Crop with an empty URL field shows an error without calling the server', async ({ page }) => {
  await loginAs(page, { userId: MEMBER_ID, guildId: GUILD_SIMPLE.id });
  await page.goto(`/?e2eGuildId=${GUILD_SIMPLE.id}`);
  await resetRateLimit(page);

  let requestMade = false;
  await page.route('**/api/event-request/fetch-image-url', async (route) => {
    requestMade = true;
    await route.continue();
  });

  await page.locator('#fetch-image-url-btn').click();

  await expect(page.locator('#image-upload-status')).toContainText('Enter an image URL');
  expect(requestMade).toBe(false);
});

test('"Change Image" after a URL fetch clears the cropper and re-enables both the file and URL fields', async ({ page }) => {
  const { server, url } = await startImageServer();
  try {
    await loginAs(page, { userId: MEMBER_ID, guildId: GUILD_SIMPLE.id });
    await page.goto(`/?e2eGuildId=${GUILD_SIMPLE.id}`);
    await resetRateLimit(page);

    await page.locator('#event-image-url').fill(url);
    await page.locator('#fetch-image-url-btn').click();
    await expect(page.locator('#image-crop-group')).toBeVisible();

    await page.locator('#change-image-btn').click();

    await expect(page.locator('#image-crop-group')).toBeHidden();
    await expect(page.locator('#image-picker-group')).toBeVisible();
    await expect(page.locator('#image-url-group')).toBeVisible();
    await expect(page.locator('#event-image-file')).toBeEnabled();
    await expect(page.locator('#event-image-url')).toBeEnabled();
    await expect(page.locator('#event-image-url')).toHaveValue('');
  } finally {
    server.close();
  }
});

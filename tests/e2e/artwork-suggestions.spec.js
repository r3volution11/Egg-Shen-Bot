import { test, expect } from '@playwright/test';
import { GUILD_SIMPLE, MEMBER_ID } from './fixtures/scenarios.js';
import { loginAs, resetRateLimit, fillRequiredFields } from './helpers.js';

// Artwork suggestions: typing a title offers TMDB backdrops and posters to
// pick from and crop (public/app.js loadArtworkSuggestions). The lookup
// itself is covered in tests/title-artwork.test.js; here the bot's answer
// and TMDB's images are stubbed, so this drives only the form.

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const img = (kind, n) => ({ kind, url: `https://image.tmdb.org/t/p/full/${kind}${n}.png`, thumb: `https://image.tmdb.org/t/p/thumb/${kind}${n}.png` });
const ARTWORK = {
  titles: [
    { tmdbId: 6, type: 'tv', label: 'Fargo', year: '2014', images: [img('backdrop', 1), img('backdrop', 2), img('poster', 1)] },
    { tmdbId: 5, type: 'movie', label: 'Fargo', year: '1996', images: [img('backdrop', 3)] },
  ],
};

async function stubArtwork(page, body = ARTWORK) {
  const lookups = [];
  await page.route('**/api/event-request/title-art**', (route) => {
    lookups.push(new URL(route.request().url()).searchParams.get('title'));
    return route.fulfill({ json: body });
  });
  // TMDB's image server allows cross-origin reads; so does this stand-in
  await page.route('https://image.tmdb.org/**', (route) => route.fulfill({
    body: PNG, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' },
  }));
  return lookups;
}

test.beforeEach(async ({ page }) => {
  await loginAs(page, { userId: MEMBER_ID, guildId: GUILD_SIMPLE.id });
  await page.goto(`/?e2eGuildId=${GUILD_SIMPLE.id}`);
  await resetRateLimit(page);
});

test('typing a title suggests artwork, one row per matching title, nothing picked for you', async ({ page }) => {
  const lookups = await stubArtwork(page);
  // Typed key by key, as a person would: one lookup once they pause
  await page.locator('#title').pressSequentially('Fargo', { delay: 60 });

  const box = page.locator('#artwork-suggestions');
  await expect(box).toBeVisible();
  await expect(box.locator('.artwork-title .form-text')).toHaveText(['Fargo (2014) · TV show', 'Fargo (1996) · Movie']);
  await expect(box.locator('.artwork-option')).toHaveCount(4);
  await expect(page.locator('#artwork-status')).toHaveText('A few titles match; pick from the right one.');
  // Only suggested: the cropper stays closed until one is clicked
  await expect(page.locator('#image-crop-group')).toBeHidden();
  // Not one lookup per keystroke
  expect(lookups).toEqual(['Fargo']);
});

test('picking one opens it in the cropper; it uploads only at submit, with its original, and names its title', async ({ page }) => {
  await stubArtwork(page);
  const uploads = [];
  page.on('request', (req) => { if (req.url().includes('/api/event-request/upload-image')) uploads.push(req.postData() || ''); });
  let submitted = null;
  page.on('request', (req) => { if (req.url().endsWith('/api/event-request') && req.method() === 'POST') submitted = req.postDataJSON(); });

  await fillRequiredFields(page, 'Fargo');
  await page.locator('.artwork-option').nth(1).click();
  await expect(page.locator('.cropper-container')).toBeVisible();
  expect(uploads).toHaveLength(0); // trying artwork costs no uploads

  // Changing your mind: back to the picker, the suggestions still there
  await page.locator('#change-image-btn').click();
  await expect(page.locator('#artwork-suggestions .artwork-option')).toHaveCount(4);
  await page.locator('.artwork-option').nth(3).click(); // the 1996 movie
  await expect(page.locator('.cropper-container')).toBeVisible();

  await page.locator('#submit-btn').click();
  await expect(page.locator('#form-message')).toContainText('submitted successfully');
  expect(uploads).toHaveLength(1);
  expect(uploads[0]).toContain('name="original"');
  expect(uploads[0]).toContain('name="image"');
  expect(submitted.tmdbTitle).toEqual({ tmdbId: 5, type: 'movie', label: 'Fargo' });
  expect(submitted.imageToken).toMatch(/^[0-9a-f]{32}$/);
  // A successful submit clears the suggestions with the form
  await expect(page.locator('#artwork-suggestions')).toBeHidden();
});

test('an uploaded file never claims a title', async ({ page }) => {
  await stubArtwork(page);
  let submitted = null;
  page.on('request', (req) => { if (req.url().endsWith('/api/event-request') && req.method() === 'POST') submitted = req.postDataJSON(); });
  await fillRequiredFields(page, 'Fargo');
  await page.locator('.artwork-option').first().click();
  await page.locator('#change-image-btn').click();
  await page.locator('#event-image-file').setInputFiles({ name: 'mine.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.locator('#image-upload-status')).toContainText('Image uploaded');
  await page.locator('#submit-btn').click();
  await expect(page.locator('#form-message')).toContainText('submitted successfully');
  expect(submitted.tmdbTitle).toBeNull();
});

test('no artwork for the title: nothing shown at all', async ({ page }) => {
  await stubArtwork(page, { titles: [] });
  await page.locator('#title').fill('Board Game Night');
  await page.locator('#title').blur();
  await page.waitForTimeout(300);
  await expect(page.locator('#artwork-suggestions')).toBeHidden();
});

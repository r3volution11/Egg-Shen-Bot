/**
 * The tournament setup page (public/tournament-setup/) in a real browser.
 *
 * The page is served by the real harness with a real link token, and file
 * parsing and the current state come from the real API. Matching and saving
 * are intercepted here: matching would otherwise hit TMDB, and what this spec
 * is for is the page's side of the contract — that it sends exactly the ids,
 * order, groups and settings the admin chose. The server's side of saving is
 * covered by tests/tournament-setup-routes.test.js.
 */
import { test, expect } from '@playwright/test';
import { GUILD_SIMPLE } from './fixtures/scenarios.js';

process.env.TOURNAMENT_SETUP_LINK_SECRET = process.env.TOURNAMENT_SETUP_LINK_SECRET || 'e2e-tournament-setup-secret';
const { signSetupToken } = await import('../../src/utils/tournamentSetupLinkToken.js');

const ADMIN_ID = '800000000000000001';

function setupUrl() {
  return `/tournament-setup?token=${signSetupToken({ guildId: GUILD_SIMPLE.id, userId: ADMIN_ID })}`;
}

const CSV = [
  'title,year,group,id,image_url',
  'Alien,1979,,,',
  'The Thing,,,,',
  'Nosferatu,1922,,,',
  'Teh Fly,,,,',
].join('\n');

const entry = (id, title, year) => ({ id, title, year, posterUrl: null, overview: '' });

/** Resolve answers per title, as the server would after searching. */
function resolveAnswer(row) {
  switch (row.title) {
    case 'Alien': return { status: 'matched', entry: entry(348, 'Alien', '1979') };
    case 'The Thing': return { status: 'choose', candidates: [entry(1091, 'The Thing', '1982'), entry(60935, 'The Thing', '2011')] };
    case 'Nosferatu': return { status: 'matched', entry: entry(653, 'Nosferatu', '1922') };
    case 'The Fly': return { status: 'matched', entry: entry(9426, 'The Fly', '1986') };
    default: return { status: 'none' };
  }
}

async function interceptResolveAndSave(page) {
  const saves = [];
  await page.route('**/api/tournament-setup/resolve', async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({ json: { results: body.rows.map(resolveAnswer) } });
  });
  await page.route('**/api/tournament-setup/save', async (route) => {
    const body = route.request().postDataJSON();
    saves.push(body);
    await route.fulfill({ json: { success: true, summary: { name: body.settings.name, mode: 'bracket', titleCount: body.rows.length, groupCount: null } } });
  });
  return saves;
}

test('an invalid link says how to get a new one', async ({ page }) => {
  const response = await page.goto('/tournament-setup?token=nope');
  expect(response.status()).toBe(403);
  await expect(page.locator('body')).toContainText('/bracket setup-link');
});

test('upload a CSV, fix what needs fixing, and save exactly what was chosen', async ({ page }) => {
  const saves = await interceptResolveAndSave(page);
  await page.goto(setupUrl());

  await expect(page.locator('#guild-name')).toContainText(GUILD_SIMPLE.name);
  await expect(page.locator('#save')).toHaveText('Create tournament');

  await page.locator('#type').selectOption('movie');
  await page.locator('#file').setInputFiles({ name: 'lineup.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });

  // Parsed for real, matched through the intercepted resolve
  await expect(page.locator('#rows tr')).toHaveCount(4);
  await expect(page.locator('#shape')).toHaveText('Straight bracket · 4 titles · 4-slot bracket');
  await expect(page.locator('#page-message')).toContainText('1 title has several matches');
  await expect(page.locator('#page-message')).toContainText("1 couldn't be found");

  // Saving now is refused on the page, naming both rows
  await page.locator('#name').fill('Creature Feature Cup');
  await page.locator('#save').click();
  await expect(page.locator('#save-errors')).toContainText('Row 2: pick which "The Thing" you mean.');
  await expect(page.locator('#save-errors')).toContainText('Row 4 has no match');
  expect(saves).toHaveLength(0);

  // Pick the 1982 one; fix the typo and search again
  await page.locator('#rows tr').nth(1).locator('select[aria-label^="Which"]').selectOption('1091');
  await page.locator('#rows tr').nth(3).locator('input[aria-label="Title 4"]').fill('The Fly');
  await page.locator('#find-matches').click();
  await expect(page.locator('#rows tr').nth(3)).toContainText('1986');

  // Ordered seeding, with Nosferatu moved up to seed 1
  await page.locator('#seeding-ordered').check();
  await page.locator('#rows tr').nth(2).getByRole('button', { name: 'Move title 3 up' }).click();
  await page.locator('#rows tr').nth(1).getByRole('button', { name: 'Move title 2 up' }).click();
  await page.locator('#voting-duration').fill('2d');

  await page.locator('#save').click();
  await expect(page.locator('#saved')).toContainText('Saved "Creature Feature Cup"');

  expect(saves).toHaveLength(1);
  expect(saves[0].settings).toEqual({
    name: 'Creature Feature Cup',
    type: 'movie',
    seeding: 'ordered',
    votingDuration: '2d',
    tiebreakerDuration: '',
    announcement: { message: '', imageUrl: '' },
  });
  expect(saves[0].rows).toEqual([
    { id: '653', group: '', imageUrl: '' },
    { id: '348', group: '', imageUrl: '' },
    { id: '1091', group: '', imageUrl: '' },
    { id: '9426', group: '', imageUrl: '' },
  ]);
});

test('row errors from the server land on their row', async ({ page }) => {
  await page.route('**/api/tournament-setup/resolve', (route) => route.fulfill({
    json: { results: route.request().postDataJSON().rows.map(resolveAnswer) },
  }));
  await page.route('**/api/tournament-setup/save', (route) => route.fulfill({
    status: 400,
    json: { errors: [{ row: 2, message: 'Row 2 is the same title as row 1.' }] },
  }));
  await page.goto(setupUrl());
  await page.locator('#type').selectOption('movie');
  await page.locator('#file').setInputFiles({ name: 'dupes.csv', mimeType: 'text/csv', buffer: Buffer.from('title\nAlien\nNosferatu\n') });
  await expect(page.locator('#rows tr')).toHaveCount(2);
  await page.locator('#name').fill('Dupes');
  await page.locator('#save').click();

  await expect(page.locator('#rows tr').nth(1)).toHaveClass(/row-error/);
  await expect(page.locator('#rows tr').nth(1)).toContainText('Row 2 is the same title as row 1.');
});

test('a bad file is explained, and nothing is loaded', async ({ page }) => {
  await page.goto(setupUrl());
  await page.locator('#file').setInputFiles({ name: 'oops.csv', mimeType: 'text/csv', buffer: Buffer.from('titel,year\nAlien,1979\n') });
  await expect(page.locator('#file-errors')).toContainText('Unknown column "titel"');
  await expect(page.locator('#rows tr')).toHaveCount(0);
});

test('fits a phone screen without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.route('**/api/tournament-setup/resolve', (route) => route.fulfill({
    json: { results: route.request().postDataJSON().rows.map(resolveAnswer) },
  }));
  await page.goto(setupUrl());
  await page.locator('#type').selectOption('movie');
  await page.locator('#file').setInputFiles({ name: 'lineup.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
  await expect(page.locator('#rows tr')).toHaveCount(4);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

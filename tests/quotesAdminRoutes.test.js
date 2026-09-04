/**
 * Tests for the quotes-admin routes in src/api/server.js:
 * GET /quotes-admin, GET/POST/PUT/DELETE /api/quotes*, the bulk-replace
 * route, and the pending quote-suggestion queue routes. Gated by a shared
 * secret (QUOTES_ADMIN_SECRET) rather than a login, since this bot is meant
 * to be self-hosted by other server owners too.
 *
 * Run with: npx jest tests/quotesAdminRoutes.test.js --verbose
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';

// Distinct path per test file — see movieQuotesStore.test.js's comment for
// why (parallel Jest workers would otherwise race on the real file).
const QUOTES_FILE = path.join(process.cwd(), 'movie_quotes.quotesAdminRoutes.test.json');
const PENDING_FILE = path.join(process.cwd(), 'movie_quotes_pending.quotesAdminRoutes.test.json');
process.env.MOVIE_QUOTES_FILE = QUOTES_FILE;
process.env.MOVIE_QUOTES_PENDING_FILE = PENDING_FILE;

const ORIGINAL_SECRET = process.env.QUOTES_ADMIN_SECRET;
const TEST_SECRET = 'test-admin-secret-do-not-use-in-production';

function cleanup() {
  if (fs.existsSync(QUOTES_FILE)) fs.unlinkSync(QUOTES_FILE);
  if (fs.existsSync(PENDING_FILE)) fs.unlinkSync(PENDING_FILE);
}

let app;

beforeEach(async () => {
  cleanup();
  process.env.QUOTES_ADMIN_SECRET = TEST_SECRET;

  const mockClient = {
    user: { tag: 'TestBot#1234' },
    guilds: { cache: new Map() },
  };

  const { createApiServer } = await import('../src/api/server.js');
  app = createApiServer(mockClient);
});

afterEach(() => {
  cleanup();
  if (ORIGINAL_SECRET === undefined) {
    delete process.env.QUOTES_ADMIN_SECRET;
  } else {
    process.env.QUOTES_ADMIN_SECRET = ORIGINAL_SECRET;
  }
});

describe('GET /quotes-admin', () => {
  test('serves the page shell without requiring the admin secret', async () => {
    const request = await import('supertest');
    const response = await request.default(app).get('/quotes-admin');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Bot Status Quotes');
  });
});

describe('quotes-admin API auth', () => {
  test('rejects a request with no Authorization header', async () => {
    const request = await import('supertest');
    const response = await request.default(app).get('/api/quotes');

    expect(response.status).toBe(401);
  });

  test('rejects a request with the wrong secret', async () => {
    const request = await import('supertest');
    const response = await request.default(app)
      .get('/api/quotes')
      .set('Authorization', 'Bearer wrong-secret');

    expect(response.status).toBe(401);
  });

  test('accepts a request with the correct secret via the Authorization bearer header', async () => {
    const request = await import('supertest');
    const response = await request.default(app)
      .get('/api/quotes')
      .set('Authorization', `Bearer ${TEST_SECRET}`);

    expect(response.status).toBe(200);
  });

  test('accepts a request with the correct secret via the X-Admin-Secret header', async () => {
    const request = await import('supertest');
    const response = await request.default(app)
      .get('/api/quotes')
      .set('X-Admin-Secret', TEST_SECRET);

    expect(response.status).toBe(200);
  });

  test('returns 503 when QUOTES_ADMIN_SECRET is not configured on this deployment', async () => {
    delete process.env.QUOTES_ADMIN_SECRET;
    const request = await import('supertest');
    const response = await request.default(app)
      .get('/api/quotes')
      .set('Authorization', 'Bearer anything');

    expect(response.status).toBe(503);
  });
});

describe('quotes-admin CRUD', () => {
  function authed(request) {
    return request.set('Authorization', `Bearer ${TEST_SECRET}`);
  }

  test('a full add/edit/delete round-trip works end to end, including title/author fields', async () => {
    const request = await import('supertest');

    const afterAdd = await authed(request.default(app).post('/api/quotes'))
      .send({ title: 'The Thing', text: 'First status.', author: 'MacReady' });
    expect(afterAdd.status).toBe(200);
    const addedIndex = afterAdd.body.quotes.findIndex(q => q.text === 'First status.');
    expect(addedIndex).toBeGreaterThanOrEqual(0);
    expect(afterAdd.body.quotes[addedIndex]).toEqual({ title: 'The Thing', text: 'First status.', author: 'MacReady' });

    const afterEdit = await authed(request.default(app).put(`/api/quotes/${addedIndex}`))
      .send({ text: 'Edited status.' });
    expect(afterEdit.status).toBe(200);
    expect(afterEdit.body.quotes[addedIndex]).toEqual({ text: 'Edited status.' });

    const afterDelete = await authed(request.default(app).delete(`/api/quotes/${addedIndex}`));
    expect(afterDelete.status).toBe(200);
    expect(afterDelete.body.quotes.some(q => q.text === 'Edited status.')).toBe(false);
  });

  test('rejects adding an empty quote', async () => {
    const request = await import('supertest');
    const response = await authed(request.default(app).post('/api/quotes')).send({ text: '   ' });

    expect(response.status).toBe(400);
  });

  test('rejects editing at an out-of-range index', async () => {
    const request = await import('supertest');
    const response = await authed(request.default(app).put('/api/quotes/9999')).send({ text: 'Anything.' });

    expect(response.status).toBe(400);
  });

  test('rejects deleting at an out-of-range index', async () => {
    const request = await import('supertest');
    const response = await authed(request.default(app).delete('/api/quotes/9999'));

    expect(response.status).toBe(400);
  });

  test('GET returns whatever was persisted by a prior write, not stale data', async () => {
    const request = await import('supertest');
    await authed(request.default(app).post('/api/quotes')).send({ text: 'Persisted line.' });

    const response = await authed(request.default(app).get('/api/quotes'));

    expect(response.body.quotes.some(q => q.text === 'Persisted line.')).toBe(true);
  });
});

describe('PUT /api/quotes/bulk', () => {
  function authed(request) {
    return request.set('Authorization', `Bearer ${TEST_SECRET}`);
  }

  test('replaces the entire list on success', async () => {
    const request = await import('supertest');
    await authed(request.default(app).post('/api/quotes')).send({ text: 'Will be replaced.' });

    const response = await authed(request.default(app).put('/api/quotes/bulk')).send({
      quotes: [{ title: 'A', text: 'Quote A.' }, { text: 'Quote B.', author: 'B Author' }],
    });

    expect(response.status).toBe(200);
    expect(response.body.quotes).toEqual([{ title: 'A', text: 'Quote A.' }, { text: 'Quote B.', author: 'B Author' }]);
  });

  test('rejects a non-array body without applying anything', async () => {
    const request = await import('supertest');
    await authed(request.default(app).post('/api/quotes')).send({ text: 'Untouched.' });

    const response = await authed(request.default(app).put('/api/quotes/bulk')).send({ quotes: 'not an array' });

    expect(response.status).toBe(400);
    const getResponse = await authed(request.default(app).get('/api/quotes'));
    expect(getResponse.body.quotes.some(q => q.text === 'Untouched.')).toBe(true);
  });

  test('rejects an invalid row without applying anything', async () => {
    const request = await import('supertest');
    await authed(request.default(app).post('/api/quotes')).send({ text: 'Untouched.' });

    const response = await authed(request.default(app).put('/api/quotes/bulk')).send({
      quotes: [{ text: 'Valid.' }, { title: 'No text' }],
    });

    expect(response.status).toBe(400);
    const getResponse = await authed(request.default(app).get('/api/quotes'));
    expect(getResponse.body.quotes.some(q => q.text === 'Untouched.')).toBe(true);
  });
});

describe('pending quote-suggestion queue routes', () => {
  function authed(request) {
    return request.set('Authorization', `Bearer ${TEST_SECRET}`);
  }

  async function seedPending() {
    const { addPending } = await import('../src/utils/pendingQuotesStore.js');
    return addPending({ title: 'The Thing', text: 'Suggested line.', author: 'MacReady', suggestedBy: 'tester#0001', guildId: 'guild-1' });
  }

  test('GET lists pending suggestions', async () => {
    await seedPending();
    const request = await import('supertest');

    const response = await authed(request.default(app).get('/api/quotes/pending'));

    expect(response.status).toBe(200);
    expect(response.body.pending).toHaveLength(1);
    expect(response.body.pending[0]).toMatchObject({ text: 'Suggested line.', title: 'The Thing', author: 'MacReady' });
  });

  test('POST .../approve moves the suggestion into the live list and clears it from pending', async () => {
    const id = await seedPending();
    const request = await import('supertest');

    const response = await authed(request.default(app).post(`/api/quotes/pending/${id}/approve`));

    expect(response.status).toBe(200);
    expect(response.body.pending).toHaveLength(0);
    expect(response.body.quotes.some(q => q.text === 'Suggested line.')).toBe(true);
  });

  test('POST .../reject clears the suggestion without adding it to the live list', async () => {
    const id = await seedPending();
    const request = await import('supertest');

    const response = await authed(request.default(app).post(`/api/quotes/pending/${id}/reject`));

    expect(response.status).toBe(200);
    expect(response.body.pending).toHaveLength(0);

    const getResponse = await authed(request.default(app).get('/api/quotes'));
    expect(getResponse.body.quotes.some(q => q.text === 'Suggested line.')).toBe(false);
  });

  test('approving a nonexistent id returns 400', async () => {
    const request = await import('supertest');
    const response = await authed(request.default(app).post('/api/quotes/pending/does-not-exist/approve'));
    expect(response.status).toBe(400);
  });
});

describe('POST /api/quotes-admin-link/exchange', () => {
  test('exchanges a valid token for the real admin secret, exactly once', async () => {
    const { signQuotesAdminLinkToken } = await import('../src/utils/quotesAdminLinkToken.js');
    const token = signQuotesAdminLinkToken();
    const request = await import('supertest');

    const first = await request.default(app).post('/api/quotes-admin-link/exchange').send({ token });
    expect(first.status).toBe(200);
    expect(first.body.secret).toBe(TEST_SECRET);

    const second = await request.default(app).post('/api/quotes-admin-link/exchange').send({ token });
    expect(second.status).toBe(403);
  });

  test('the exchanged secret actually works against the real admin routes', async () => {
    const { signQuotesAdminLinkToken } = await import('../src/utils/quotesAdminLinkToken.js');
    const token = signQuotesAdminLinkToken();
    const request = await import('supertest');

    const exchange = await request.default(app).post('/api/quotes-admin-link/exchange').send({ token });
    const secret = exchange.body.secret;

    const response = await request.default(app).get('/api/quotes').set('Authorization', `Bearer ${secret}`);
    expect(response.status).toBe(200);
  });

  test('rejects a malformed token', async () => {
    const request = await import('supertest');
    const response = await request.default(app).post('/api/quotes-admin-link/exchange').send({ token: 'not-a-real-token' });
    expect(response.status).toBe(403);
  });

  test('returns 503 when QUOTES_ADMIN_SECRET is removed after the token was signed', async () => {
    const { signQuotesAdminLinkToken } = await import('../src/utils/quotesAdminLinkToken.js');
    const token = signQuotesAdminLinkToken();
    delete process.env.QUOTES_ADMIN_SECRET;

    const request = await import('supertest');
    const response = await request.default(app).post('/api/quotes-admin-link/exchange').send({ token });
    expect(response.status).toBe(503);
  });
});

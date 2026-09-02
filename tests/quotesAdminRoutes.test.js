/**
 * Tests for the quotes-admin routes in src/api/server.js:
 * GET /quotes-admin, GET/POST/PUT/DELETE /api/quotes*. Gated by a shared
 * secret (QUOTES_ADMIN_SECRET) rather than a login, since this bot is meant
 * to be self-hosted by other server owners too.
 *
 * Run with: npx jest tests/quotesAdminRoutes.test.js --verbose
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const QUOTES_FILE = path.join(process.cwd(), 'movie_quotes.json');
const ORIGINAL_SECRET = process.env.QUOTES_ADMIN_SECRET;
const TEST_SECRET = 'test-admin-secret-do-not-use-in-production';

function cleanup() {
  if (fs.existsSync(QUOTES_FILE)) fs.unlinkSync(QUOTES_FILE);
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

  test('a full add/edit/delete round-trip works end to end', async () => {
    const request = await import('supertest');

    const afterAdd = await authed(request.default(app).post('/api/quotes'))
      .send({ text: 'First status.' });
    expect(afterAdd.status).toBe(200);
    expect(afterAdd.body.quotes).toContain('First status.');

    const addedIndex = afterAdd.body.quotes.indexOf('First status.');
    const afterEdit = await authed(request.default(app).put(`/api/quotes/${addedIndex}`))
      .send({ text: 'Edited status.' });
    expect(afterEdit.status).toBe(200);
    expect(afterEdit.body.quotes[addedIndex]).toBe('Edited status.');

    const afterDelete = await authed(request.default(app).delete(`/api/quotes/${addedIndex}`));
    expect(afterDelete.status).toBe(200);
    expect(afterDelete.body.quotes).not.toContain('Edited status.');
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

    expect(response.body.quotes).toContain('Persisted line.');
  });
});

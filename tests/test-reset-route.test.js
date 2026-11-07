/**
 * POST /api/__test__/reset-rate-limit exists only when NODE_ENV is 'test'.
 *
 * The e2e harness uses it to clear the event-request and image-upload limits
 * between specs. It was registered whenever NODE_ENV wasn't 'production',
 * and plain `npm start` sets no NODE_ENV, so a self-hosted bot started that
 * way served it to anyone: any visitor could clear their own limits after
 * every request, and the 1-request-per-5-minutes limit didn't hold.
 *
 * Run with: npm test -- tests/test-reset-route.test.js
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';

const ROUTE = '/api/__test__/reset-rate-limit';
const original = process.env.NODE_ENV;
let createApiServer;

beforeAll(async () => {
  ({ createApiServer } = await import('../src/api/server.js'));
});

afterAll(() => {
  if (original === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = original;
});

const fakeClient = () => ({ user: { tag: 'TestBot#0001' }, guilds: { cache: new Map() }, channels: { fetch: async () => null } });

/** The route's answer from a server built with NODE_ENV as given (undefined = unset) */
async function resetWith(nodeEnv) {
  if (nodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = nodeEnv;
  const app = createApiServer(fakeClient());
  return request(app).post(ROUTE);
}

describe('the rate-limit reset route', () => {
  test('is not there with NODE_ENV unset, as plain `npm start` runs', async () => {
    const res = await resetWith(undefined);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Endpoint not found' });
  });

  test.each(['development', 'production', ''])('is not there with NODE_ENV=%p', async (value) => {
    expect((await resetWith(value)).status).toBe(404);
  });

  test('is there for the tests (NODE_ENV=test), and resets', async () => {
    expect((await resetWith('test')).status).toBe(204);
  });
});

/**
 * The web pages' per-address rate limits key on the visitor's real address,
 * not on whatever they put in X-Forwarded-For.
 *
 * `trust proxy` was `true`, so Express took the LEFT-most X-Forwarded-For
 * entry as the visitor, and that entry is the visitor's own: nginx's
 * $proxy_add_x_forwarded_for appends the real address after the header the
 * visitor sent, and a request straight to the bot's port can send any
 * header at all. A new made-up address on every request got a fresh budget
 * from every limit: event requests, uploads, artwork lookups, the quotes
 * admin's 20 a minute, the tournament setup form. Now only a proxy on the
 * same machine is trusted ('loopback'), so behind nginx req.ip is the entry
 * nginx appended (the right-most one), and a request from anywhere else has
 * the header ignored.
 *
 * supertest's requests come from 127.0.0.1 (tests/jest.setup.js), which is
 * exactly where nginx's come from on the server.
 *
 * Run with: npm test -- tests/web-rate-limit-client-address.test.js
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import request from 'supertest';

let createApiServer;

beforeAll(async () => {
  ({ createApiServer } = await import('../src/api/server.js'));
});

const fakeClient = () => ({ user: { tag: 'TestBot#0001' }, guilds: { cache: new Map() }, channels: { fetch: async () => null } });

// The event-request limit: 1 per 5 minutes. The limiter runs before the
// login check, so with no login the first answer is 401 and the next, from
// the same address, 429.
const submit = (app, forwardedFor) => request(app)
  .post('/api/event-request')
  .set('Host', 'events.example.org')
  .set('X-Forwarded-For', forwardedFor)
  .send({});

describe('behind a proxy on the same machine (nginx appending the real address)', () => {
  test('the limit keys on the right-most address, the one the proxy appended', async () => {
    const app = createApiServer(fakeClient());

    expect((await submit(app, '1.2.3.4, 5.6.7.8')).status).toBe(401);
    // The same visitor (5.6.7.8) claiming to be someone else: still limited
    expect((await submit(app, '9.9.9.9, 5.6.7.8')).status).toBe(429);
    // The same claim (1.2.3.4) from a different visitor: not limited by the first one
    expect((await submit(app, '1.2.3.4, 6.6.6.6')).status).toBe(401);
  });

  test('a new made-up left-most address on every request never resets the limit', async () => {
    const app = createApiServer(fakeClient());
    expect((await submit(app, '10.0.0.1, 5.6.7.8')).status).toBe(401);
    for (let i = 2; i <= 6; i++) {
      expect((await submit(app, `10.0.0.${i}, 5.6.7.8`)).status).toBe(429);
    }
  });

  test('the quotes admin\'s 20 a minute holds the same way', async () => {
    const app = createApiServer(fakeClient());
    const statuses = [];
    for (let i = 1; i <= 21; i++) {
      // One Host throughout: the limits are per domain, and supertest's own
      // Host names a new port on every request
      const res = await request(app).get('/api/quotes').set('Host', 'quotes.example.org').set('X-Forwarded-For', `172.16.0.${i}, 5.6.7.8`);
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 20)).not.toContain(429);
    expect(statuses[20]).toBe(429);
  });
});

describe('who is trusted to say where a request came from', () => {
  test('only this machine: a proxy elsewhere, or a visitor connecting directly, is not', () => {
    const trusted = createApiServer(fakeClient()).get('trust proxy fn');
    expect(trusted('127.0.0.1', 0)).toBe(true);
    expect(trusted('::1', 0)).toBe(true);
    expect(trusted('::ffff:127.0.0.1', 0)).toBe(true); // IPv4 loopback on a dual-stack socket
    expect(trusted('203.0.113.7', 0)).toBe(false);
    expect(trusted('10.0.0.2', 0)).toBe(false);
  });
});

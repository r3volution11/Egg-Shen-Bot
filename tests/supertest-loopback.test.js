/**
 * Guards the supertest patch in tests/jest.setup.js: servers supertest
 * starts must listen on 127.0.0.1, not on every address. Without it, a
 * request could reach some other program on this machine holding the same
 * port on 127.0.0.1, and a random HTTP test failed about one run in ten.
 *
 * Run with: npm test -- tests/supertest-loopback.test.js
 */

import { describe, test, expect } from '@jest/globals';
import http from 'http';
import express from 'express';

const request = (await import('supertest')).default;

describe('supertest servers listen on 127.0.0.1 only', () => {
  test('an express app is started on the loopback address', async () => {
    const app = express();
    let boundTo = null;
    app.get('/where', (req, res) => {
      boundTo = req.socket.server.address();
      res.json({ ok: true });
    });

    const res = await request(app).get('/where').query({ q: 'kept' });

    expect(res.status).toBe(200);
    expect(boundTo.address).toBe('127.0.0.1');
  });

  test('query strings and bodies still arrive intact after the port is filled in', async () => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => res.end(JSON.stringify({ url: req.url, body })));
    });

    const res = await request(server).post('/echo').query({ token: 'a.b' }).send({ x: 1 });

    expect(JSON.parse(res.text)).toEqual({ url: '/echo?token=a.b', body: '{"x":1}' });
  });
});

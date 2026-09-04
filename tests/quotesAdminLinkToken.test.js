/**
 * Tests for src/utils/quotesAdminLinkToken.js — signed, single-use,
 * short-lived tokens backing /eggshen-config-quotes admin-link (a Discord
 * message link button that opens /quotes-admin already unlocked, instead of
 * requiring the admin to be handed QUOTES_ADMIN_SECRET to type in).
 *
 * Run with: npx jest tests/quotesAdminLinkToken.test.js --verbose
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';

const ORIGINAL_SECRET = process.env.QUOTES_ADMIN_SECRET;

beforeEach(() => {
  process.env.QUOTES_ADMIN_SECRET = 'test-secret-do-not-use-in-production';
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) {
    delete process.env.QUOTES_ADMIN_SECRET;
  } else {
    process.env.QUOTES_ADMIN_SECRET = ORIGINAL_SECRET;
  }
});

describe('signQuotesAdminLinkToken / consumeQuotesAdminLinkToken', () => {
  test('a freshly signed token is consumable exactly once', async () => {
    const { signQuotesAdminLinkToken, consumeQuotesAdminLinkToken } = await import('../src/utils/quotesAdminLinkToken.js');

    const token = signQuotesAdminLinkToken();

    const first = consumeQuotesAdminLinkToken(token);
    expect(first).toEqual({ valid: true });

    const second = consumeQuotesAdminLinkToken(token);
    expect(second).toEqual({ valid: false, reason: 'already-used' });
  });

  test('rejects a tampered payload', async () => {
    const { signQuotesAdminLinkToken, consumeQuotesAdminLinkToken } = await import('../src/utils/quotesAdminLinkToken.js');

    const token = signQuotesAdminLinkToken();
    const [payload, sig] = token.split('.');
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const tamperedPayload = Buffer.from(JSON.stringify({ ...decoded, exp: decoded.exp + 100000 })).toString('base64url');
    const tamperedToken = `${tamperedPayload}.${sig}`;

    const result = consumeQuotesAdminLinkToken(tamperedToken);

    expect(result).toEqual({ valid: false, reason: 'bad-signature' });
  });

  test('rejects a tampered signature', async () => {
    const { signQuotesAdminLinkToken, consumeQuotesAdminLinkToken } = await import('../src/utils/quotesAdminLinkToken.js');

    const token = signQuotesAdminLinkToken();
    const [payload] = token.split('.');
    const tamperedToken = `${payload}.deadbeefdeadbeefdeadbeefdeadbeef`;

    const result = consumeQuotesAdminLinkToken(tamperedToken);

    expect(result).toEqual({ valid: false, reason: 'bad-signature' });
  });

  test('rejects an expired token', async () => {
    const { signQuotesAdminLinkToken, consumeQuotesAdminLinkToken } = await import('../src/utils/quotesAdminLinkToken.js');

    const token = signQuotesAdminLinkToken({ ttlMs: -1 });
    const result = consumeQuotesAdminLinkToken(token);

    expect(result).toEqual({ valid: false, reason: 'expired' });
  });

  test.each([
    ['empty string', ''],
    ['no separator', 'not-a-real-token'],
    ['garbage', 'abc.def.ghi'],
  ])('rejects malformed input (%s) without throwing', async (_label, malformed) => {
    const { consumeQuotesAdminLinkToken } = await import('../src/utils/quotesAdminLinkToken.js');

    expect(() => consumeQuotesAdminLinkToken(malformed)).not.toThrow();
    expect(consumeQuotesAdminLinkToken(malformed).valid).toBe(false);
  });

  test('signQuotesAdminLinkToken throws when QUOTES_ADMIN_SECRET is unset', async () => {
    delete process.env.QUOTES_ADMIN_SECRET;
    const { signQuotesAdminLinkToken } = await import('../src/utils/quotesAdminLinkToken.js');

    expect(() => signQuotesAdminLinkToken()).toThrow('QUOTES_ADMIN_SECRET');
  });

  test('consumeQuotesAdminLinkToken reports not-configured (not bad-signature) when the secret is unset', async () => {
    const { signQuotesAdminLinkToken, consumeQuotesAdminLinkToken } = await import('../src/utils/quotesAdminLinkToken.js');

    const token = signQuotesAdminLinkToken();
    delete process.env.QUOTES_ADMIN_SECRET;

    const result = consumeQuotesAdminLinkToken(token);

    expect(result).toEqual({ valid: false, reason: 'not-configured' });
  });

  test('two independently signed tokens are independently consumable', async () => {
    const { signQuotesAdminLinkToken, consumeQuotesAdminLinkToken } = await import('../src/utils/quotesAdminLinkToken.js');

    const tokenA = signQuotesAdminLinkToken();
    const tokenB = signQuotesAdminLinkToken();

    expect(consumeQuotesAdminLinkToken(tokenA)).toEqual({ valid: true });
    expect(consumeQuotesAdminLinkToken(tokenB)).toEqual({ valid: true });
  });
});

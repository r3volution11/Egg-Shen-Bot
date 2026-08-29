/**
 * Tests for src/utils/cropLinkToken.js — signed, single-use, short-lived
 * tokens gating the moderator image-crop link (a Discord message link
 * button, not a login flow, so this can't reuse OAuth session auth).
 *
 * Run with: npx jest tests/cropLinkToken.test.js --verbose
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';

const ORIGINAL_SECRET = process.env.EVENT_CROP_LINK_SECRET;

beforeEach(() => {
  process.env.EVENT_CROP_LINK_SECRET = 'test-secret-do-not-use-in-production';
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) {
    delete process.env.EVENT_CROP_LINK_SECRET;
  } else {
    process.env.EVENT_CROP_LINK_SECRET = ORIGINAL_SECRET;
  }
});

describe('signCropToken / verifyCropToken', () => {
  test('a freshly signed token verifies successfully for its requestId', async () => {
    const { signCropToken, verifyCropToken } = await import('../src/utils/cropLinkToken.js');

    const token = signCropToken('req-1');
    const result = verifyCropToken(token, 'req-1');

    expect(result.valid).toBe(true);
    expect(result.jti).toEqual(expect.any(String));
  });

  test('rejects a token verified against a different requestId', async () => {
    const { signCropToken, verifyCropToken } = await import('../src/utils/cropLinkToken.js');

    const token = signCropToken('req-1');
    const result = verifyCropToken(token, 'req-2');

    expect(result).toEqual({ valid: false, reason: 'wrong-request' });
  });

  test('rejects a tampered payload', async () => {
    const { signCropToken, verifyCropToken } = await import('../src/utils/cropLinkToken.js');

    const token = signCropToken('req-1');
    const [payload, sig] = token.split('.');
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const tamperedPayload = Buffer.from(JSON.stringify({ ...decoded, requestId: 'req-999' })).toString('base64url');
    const tamperedToken = `${tamperedPayload}.${sig}`;

    const result = verifyCropToken(tamperedToken, 'req-999');

    expect(result).toEqual({ valid: false, reason: 'bad-signature' });
  });

  test('rejects a tampered signature', async () => {
    const { signCropToken, verifyCropToken } = await import('../src/utils/cropLinkToken.js');

    const token = signCropToken('req-1');
    const [payload] = token.split('.');
    const tamperedToken = `${payload}.deadbeefdeadbeefdeadbeefdeadbeef`;

    const result = verifyCropToken(tamperedToken, 'req-1');

    expect(result).toEqual({ valid: false, reason: 'bad-signature' });
  });

  test('rejects an expired token', async () => {
    const { signCropToken, verifyCropToken } = await import('../src/utils/cropLinkToken.js');

    const token = signCropToken('req-1', { ttlMs: -1 });
    const result = verifyCropToken(token, 'req-1');

    expect(result).toEqual({ valid: false, reason: 'expired' });
  });

  test.each([
    ['empty string', ''],
    ['no separator', 'not-a-real-token'],
    ['garbage', 'abc.def.ghi'],
  ])('rejects malformed input (%s) without throwing', async (_label, malformed) => {
    const { verifyCropToken } = await import('../src/utils/cropLinkToken.js');

    expect(() => verifyCropToken(malformed, 'req-1')).not.toThrow();
    expect(verifyCropToken(malformed, 'req-1').valid).toBe(false);
  });

  test('signCropToken throws when EVENT_CROP_LINK_SECRET is unset', async () => {
    delete process.env.EVENT_CROP_LINK_SECRET;
    const { signCropToken } = await import('../src/utils/cropLinkToken.js');

    expect(() => signCropToken('req-1')).toThrow('EVENT_CROP_LINK_SECRET');
  });
});

describe('consumeCropToken', () => {
  test('a valid token is consumable exactly once', async () => {
    const { signCropToken, consumeCropToken } = await import('../src/utils/cropLinkToken.js');

    const token = signCropToken('req-consume-1');

    const first = consumeCropToken(token, 'req-consume-1');
    expect(first).toEqual({ valid: true });

    const second = consumeCropToken(token, 'req-consume-1');
    expect(second).toEqual({ valid: false, reason: 'already-used' });
  });

  test('an expired token is rejected as expired, not already-used', async () => {
    const { signCropToken, consumeCropToken } = await import('../src/utils/cropLinkToken.js');

    const token = signCropToken('req-consume-2', { ttlMs: -1 });

    const result = consumeCropToken(token, 'req-consume-2');

    expect(result).toEqual({ valid: false, reason: 'expired' });
  });

  test('verifying a token repeatedly does not consume it', async () => {
    const { signCropToken, verifyCropToken, consumeCropToken } = await import('../src/utils/cropLinkToken.js');

    const token = signCropToken('req-consume-3');

    verifyCropToken(token, 'req-consume-3');
    verifyCropToken(token, 'req-consume-3');
    verifyCropToken(token, 'req-consume-3');

    const result = consumeCropToken(token, 'req-consume-3');
    expect(result).toEqual({ valid: true });
  });

  test('two different tokens for the same requestId are independently consumable', async () => {
    const { signCropToken, consumeCropToken } = await import('../src/utils/cropLinkToken.js');

    const tokenA = signCropToken('req-consume-4');
    const tokenB = signCropToken('req-consume-4');

    expect(consumeCropToken(tokenA, 'req-consume-4')).toEqual({ valid: true });
    expect(consumeCropToken(tokenB, 'req-consume-4')).toEqual({ valid: true });
  });
});

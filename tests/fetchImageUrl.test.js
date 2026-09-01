/**
 * Unit tests for src/utils/fetchImageUrl.js — the shared fetch/validate
 * logic used both by eventRequestApproval.js's resolveEventImageBuffer()
 * (at approval time) and api/server.js's POST
 * /api/event-request/fetch-image-url (at submission time, so a pasted URL
 * can go through the same crop UI a file upload gets).
 *
 * Run with: npx jest tests/fetchImageUrl.test.js --verbose
 */

import { describe, test, expect, jest, afterEach } from '@jest/globals';
import { fetchImageUrl, MAX_FETCHED_IMAGE_BYTES } from '../src/utils/fetchImageUrl.js';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

describe('fetchImageUrl', () => {
  test('returns the buffer and content-type for a valid image response', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: (key) => ({ 'content-type': 'image/png', 'content-length': String(bytes.length) }[key]) },
      arrayBuffer: async () => bytes.buffer,
    });

    const result = await fetchImageUrl('https://example.com/poster.png');

    expect(result.ok).toBe(true);
    expect(Buffer.compare(result.buffer, Buffer.from(bytes))).toBe(0);
    expect(result.contentType).toBe('image/png');
  });

  test('rejects a non-ok response with the status code in the error', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });

    const result = await fetchImageUrl('https://example.com/missing.png');

    expect(result.ok).toBe(false);
    expect(result.error).toContain('404');
  });

  test('rejects a response whose content-type is not an image', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: (key) => ({ 'content-type': 'text/html' }[key]) },
    });

    const result = await fetchImageUrl('https://example.com/not-an-image');

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/didn't return an image/);
  });

  test('rejects when content-length exceeds the max before downloading', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: (key) => ({ 'content-type': 'image/png', 'content-length': String(MAX_FETCHED_IMAGE_BYTES + 1) }[key]) },
    });

    const result = await fetchImageUrl('https://example.com/huge.png');

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/too large/);
  });

  test('rejects when the actual downloaded size exceeds the max, even if content-length lied', async () => {
    const oversized = new Uint8Array(MAX_FETCHED_IMAGE_BYTES + 1);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: (key) => ({ 'content-type': 'image/png', 'content-length': '10' }[key]) },
      arrayBuffer: async () => oversized.buffer,
    });

    const result = await fetchImageUrl('https://example.com/lied-about-size.png');

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/too large/);
  });

  test('rejects and reports the error message when fetch itself throws (e.g. network error, invalid URL)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));

    const result = await fetchImageUrl('https://not-a-real-domain.invalid/image.png');

    expect(result.ok).toBe(false);
    expect(result.error).toContain('getaddrinfo ENOTFOUND');
  });

  test('never throws — always resolves to a result object', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('boom'));

    await expect(fetchImageUrl('https://example.com/x.png')).resolves.toBeDefined();
  });
});

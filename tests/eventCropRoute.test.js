/**
 * Tests for the moderator image-crop routes in src/api/server.js:
 * GET /crop/:requestId, GET /crop/:requestId/current-image, and
 * POST /crop/:requestId/save. These are gated by the signed single-use
 * token from cropLinkToken.js instead of the public rate limiter, since a
 * moderator reaches them via a Discord message link, not a login.
 *
 * Run with: npx jest tests/eventCropRoute.test.js --verbose
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const IMAGES_DIR = path.join(process.cwd(), 'event_request_images');
const REQUESTS_FILE = path.join(process.cwd(), 'pending_event_requests.json');
const ORIGINAL_SECRET = process.env.EVENT_CROP_LINK_SECRET;

function cleanup() {
  if (fs.existsSync(IMAGES_DIR)) fs.rmSync(IMAGES_DIR, { recursive: true, force: true });
  if (fs.existsSync(REQUESTS_FILE)) fs.unlinkSync(REQUESTS_FILE);
  delete global.eventRequests;
}

let app;
let signCropToken;
let saveUploadedImage;
let saveOriginalImage;
let getOriginalImagePath;

beforeEach(async () => {
  cleanup();
  process.env.EVENT_CROP_LINK_SECRET = 'test-secret-do-not-use-in-production';

  const mockChannel = {
    id: 'mod-channel-1',
    isTextBased: () => true,
    send: jest.fn().mockResolvedValue({ id: 'msg-1' }),
    messages: {
      fetch: jest.fn().mockResolvedValue({
        embeds: [{ data: { title: 'test', fields: [] } }],
        edit: jest.fn().mockResolvedValue(undefined),
      }),
    },
  };

  const mockClient = {
    user: { tag: 'TestBot#1234' },
    guilds: { cache: new Map() },
    channels: { fetch: jest.fn().mockResolvedValue(mockChannel) },
  };

  const { createApiServer } = await import('../src/api/server.js');
  app = createApiServer(mockClient);

  ({ signCropToken } = await import('../src/utils/cropLinkToken.js'));
  ({ saveUploadedImage, saveOriginalImage, getOriginalImagePath } = await import('../src/utils/eventImageStore.js'));
});

afterEach(() => {
  cleanup();
  if (ORIGINAL_SECRET === undefined) {
    delete process.env.EVENT_CROP_LINK_SECRET;
  } else {
    process.env.EVENT_CROP_LINK_SECRET = ORIGINAL_SECRET;
  }
});

function seedRequest(requestId, overrides = {}) {
  global.eventRequests = new Map([
    [requestId, {
      guildId: 'guild-1',
      title: 'Movie Night',
      description: 'desc',
      startTime: new Date().toISOString(),
      endTime: null,
      channelId: 'text-1',
      voiceChannelId: null,
      submitterUsername: 'submitter',
      submitterDiscordId: 'submitter-1',
      messageId: 'msg-1',
      channelMessageId: 'mod-channel-1',
      hasUploadedImage: false,
      imageUrl: null,
      ...overrides,
    }],
  ]);
}

describe('GET /crop/:requestId', () => {
  test('serves the crop page for a valid token and existing request', async () => {
    const request = await import('supertest');
    const requestId = 'req-1';
    seedRequest(requestId);
    const token = signCropToken(requestId);

    const response = await request.default(app).get(`/crop/${requestId}`).query({ token });

    expect(response.status).toBe(200);
    expect(response.text).toContain('Crop Event Image');
  });

  test('rejects an invalid token', async () => {
    const request = await import('supertest');
    const requestId = 'req-2';
    seedRequest(requestId);

    const response = await request.default(app).get(`/crop/${requestId}`).query({ token: 'garbage' });

    expect(response.status).toBe(403);
  });

  test('rejects a token signed for a different requestId', async () => {
    const request = await import('supertest');
    seedRequest('req-3');
    const wrongToken = signCropToken('some-other-request');

    const response = await request.default(app).get('/crop/req-3').query({ token: wrongToken });

    expect(response.status).toBe(403);
  });

  test('returns not-found when the request no longer exists (already resolved)', async () => {
    const request = await import('supertest');
    const requestId = 'req-resolved';
    const token = signCropToken(requestId);
    // Deliberately not seeded — simulates an approved/denied request.

    const response = await request.default(app).get(`/crop/${requestId}`).query({ token });

    expect(response.status).toBe(404);
  });
});

describe('GET /crop/:requestId/current-image', () => {
  test('streams the existing uploaded image with a valid token', async () => {
    const request = await import('supertest');
    const requestId = 'req-image-1';
    seedRequest(requestId, { hasUploadedImage: true });
    await saveUploadedImage(requestId, Buffer.from('fake-png-bytes'), 'image/png');
    const token = signCropToken(requestId);

    const response = await request.default(app).get(`/crop/${requestId}/current-image`).query({ token });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('image/png');
  });

  test('returns 404 when no image has been uploaded for the request', async () => {
    const request = await import('supertest');
    const requestId = 'req-image-2';
    seedRequest(requestId);
    const token = signCropToken(requestId);

    const response = await request.default(app).get(`/crop/${requestId}/current-image`).query({ token });

    expect(response.status).toBe(404);
  });

  test('rejects an invalid token', async () => {
    const request = await import('supertest');
    const requestId = 'req-image-3';
    seedRequest(requestId, { hasUploadedImage: true });
    await saveUploadedImage(requestId, Buffer.from('fake-png-bytes'), 'image/png');

    const response = await request.default(app).get(`/crop/${requestId}/current-image`).query({ token: 'garbage' });

    expect(response.status).toBe(403);
  });

  test('prefers the preserved original over the cropped copy, when both exist', async () => {
    const request = await import('supertest');
    const requestId = 'req-image-4';
    seedRequest(requestId, { hasUploadedImage: true });
    await saveUploadedImage(requestId, Buffer.from('cropped-version'), 'image/jpeg');
    await saveOriginalImage(requestId, Buffer.from('true-original-version'), 'image/png');
    const token = signCropToken(requestId);

    const response = await request.default(app).get(`/crop/${requestId}/current-image`).query({ token });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('image/png');
    expect(response.body.toString()).toBe('true-original-version');
  });

  test('falls back to the cropped copy when no separate original was preserved', async () => {
    const request = await import('supertest');
    const requestId = 'req-image-5';
    seedRequest(requestId, { hasUploadedImage: true });
    await saveUploadedImage(requestId, Buffer.from('cropped-only'), 'image/jpeg');
    const token = signCropToken(requestId);

    const response = await request.default(app).get(`/crop/${requestId}/current-image`).query({ token });

    expect(response.status).toBe(200);
    expect(response.body.toString()).toBe('cropped-only');
  });
});

describe('POST /crop/:requestId/save', () => {
  test('saves a cropped image, updates requestData, and does not error', async () => {
    const request = await import('supertest');
    const requestId = 'req-save-1';
    seedRequest(requestId);
    const token = signCropToken(requestId);

    const response = await request.default(app)
      .post(`/crop/${requestId}/save`)
      .field('token', token)
      .attach('image', Buffer.from('cropped-jpg-bytes'), { filename: 'crop.jpg', contentType: 'image/jpeg' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });

    const requestData = global.eventRequests.get(requestId);
    expect(requestData.hasUploadedImage).toBe(true);
    expect(requestData.imageUrl).toBeNull();
  });

  test('replacing an image under a different extension does not leave an orphaned file', async () => {
    const request = await import('supertest');
    const requestId = 'req-save-2';
    seedRequest(requestId, { hasUploadedImage: true });
    await saveUploadedImage(requestId, Buffer.from('original-jpg'), 'image/jpeg');
    const token = signCropToken(requestId);

    await request.default(app)
      .post(`/crop/${requestId}/save`)
      .field('token', token)
      .attach('image', Buffer.from('cropped-png'), { filename: 'crop.png', contentType: 'image/png' });

    const filesInDir = fs.readdirSync(IMAGES_DIR).filter(f => f.startsWith(requestId));
    expect(filesInDir).toEqual([`${requestId}.png`]);
  });

  test('saving a new source image also preserves it as the new original', async () => {
    const request = await import('supertest');
    const requestId = 'req-save-new-original';
    seedRequest(requestId);
    const token = signCropToken(requestId);

    await request.default(app)
      .post(`/crop/${requestId}/save`)
      .field('token', token)
      .attach('image', Buffer.from('cropped-result'), { filename: 'crop.jpg', contentType: 'image/jpeg' })
      .attach('original', Buffer.from('fresh-source-image'), { filename: 'source.png', contentType: 'image/png' });

    const originalPath = await getOriginalImagePath(requestId);
    expect(originalPath).not.toBeNull();
    expect(fs.readFileSync(originalPath).toString()).toBe('fresh-source-image');
  });

  test('re-cropping the pre-loaded image (no new original attached) leaves any existing original untouched', async () => {
    const request = await import('supertest');
    const requestId = 'req-save-recrop';
    seedRequest(requestId, { hasUploadedImage: true });
    await saveUploadedImage(requestId, Buffer.from('first-crop'), 'image/jpeg');
    await saveOriginalImage(requestId, Buffer.from('the-true-original'), 'image/png');
    const token = signCropToken(requestId);

    await request.default(app)
      .post(`/crop/${requestId}/save`)
      .field('token', token)
      .attach('image', Buffer.from('adjusted-crop'), { filename: 'crop.jpg', contentType: 'image/jpeg' });

    const originalPath = await getOriginalImagePath(requestId);
    expect(fs.readFileSync(originalPath).toString()).toBe('the-true-original');
  });

  test('records an event date so the retention sweep can later prune it', async () => {
    const request = await import('supertest');
    const requestId = 'req-save-3';
    seedRequest(requestId);
    const token = signCropToken(requestId);

    await request.default(app)
      .post(`/crop/${requestId}/save`)
      .field('token', token)
      .attach('image', Buffer.from('cropped-jpg'), { filename: 'crop.jpg', contentType: 'image/jpeg' });

    const manifest = JSON.parse(fs.readFileSync(path.join(IMAGES_DIR, 'manifest.json'), 'utf8'));
    expect(manifest[requestId].eventDate).not.toBeNull();
  });

  test('rejects a save with an invalid token', async () => {
    const request = await import('supertest');
    const requestId = 'req-save-4';
    seedRequest(requestId);

    const response = await request.default(app)
      .post(`/crop/${requestId}/save`)
      .field('token', 'garbage')
      .attach('image', Buffer.from('cropped-jpg'), { filename: 'crop.jpg', contentType: 'image/jpeg' });

    expect(response.status).toBe(403);
  });

  test('a second save with the same token is rejected (single-use)', async () => {
    const request = await import('supertest');
    const requestId = 'req-save-5';
    seedRequest(requestId);
    const token = signCropToken(requestId);

    const first = await request.default(app)
      .post(`/crop/${requestId}/save`)
      .field('token', token)
      .attach('image', Buffer.from('first-crop'), { filename: 'crop.jpg', contentType: 'image/jpeg' });
    expect(first.status).toBe(200);

    const second = await request.default(app)
      .post(`/crop/${requestId}/save`)
      .field('token', token)
      .attach('image', Buffer.from('second-crop'), { filename: 'crop.jpg', contentType: 'image/jpeg' });

    expect(second.status).toBe(403);
  });

  test('rejects an oversized upload with a clean JSON error', async () => {
    const request = await import('supertest');
    const requestId = 'req-save-6';
    seedRequest(requestId);
    const token = signCropToken(requestId);

    const oversized = Buffer.alloc(9 * 1024 * 1024, 0xab);

    const response = await request.default(app)
      .post(`/crop/${requestId}/save`)
      .field('token', token)
      .attach('image', oversized, { filename: 'crop.jpg', contentType: 'image/jpeg' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBeDefined();
  });
});

describe('POST /api/event-request/upload-image', () => {
  test('accepts just the cropped image, with no original preserved', async () => {
    const request = await import('supertest');

    const response = await request.default(app)
      .post('/api/event-request/upload-image')
      .attach('image', Buffer.from('cropped-only'), { filename: 'crop.jpg', contentType: 'image/jpeg' });

    expect(response.status).toBe(200);
    expect(response.body.imageToken).toEqual(expect.any(String));
    expect(await getOriginalImagePath(response.body.imageToken)).toBeNull();
  });

  test('preserves the raw original when sent alongside the cropped image', async () => {
    const request = await import('supertest');

    const response = await request.default(app)
      .post('/api/event-request/upload-image')
      .attach('image', Buffer.from('cropped-version'), { filename: 'crop.jpg', contentType: 'image/jpeg' })
      .attach('original', Buffer.from('raw-original-version'), { filename: 'source.png', contentType: 'image/png' });

    expect(response.status).toBe(200);
    const { imageToken } = response.body;

    const originalPath = await getOriginalImagePath(imageToken);
    expect(originalPath).not.toBeNull();
    expect(fs.readFileSync(originalPath).toString()).toBe('raw-original-version');
  });

  test('rejects when the cropped image field is missing, even if an original is attached', async () => {
    const request = await import('supertest');

    const response = await request.default(app)
      .post('/api/event-request/upload-image')
      .attach('original', Buffer.from('raw-original-only'), { filename: 'source.png', contentType: 'image/png' });

    expect(response.status).toBe(400);
  });
});

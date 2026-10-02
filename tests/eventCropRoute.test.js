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

// This suite's cleanup RECURSIVELY DELETES the directories below, so it must
// own them outright. jest.setup.js scopes them per worker, but Jest reuses a
// worker across many test files in sequence — so a worker-scoped directory is
// still shared with whatever suite runs next, and wiping it pulled fixtures
// out from under event-request-system and the other API-server suites. That
// surfaced as a different unrelated test failing on roughly one run in three.
//
// Set before any import below reads them.
const SUITE_DIR = path.join(process.env.GUILD_CONFIGS_DIR || process.cwd(), '..', 'eventCropRoute-suite');
process.env.EVENT_IMAGES_DIR = path.join(SUITE_DIR, 'event_request_images');
process.env.EVENT_REQUESTS_FILE = path.join(SUITE_DIR, 'pending_event_requests.json');
process.env.GUILD_CONFIGS_DIR = path.join(SUITE_DIR, 'guild_configs');
fs.mkdirSync(process.env.GUILD_CONFIGS_DIR, { recursive: true });

const IMAGES_DIR = process.env.EVENT_IMAGES_DIR;
const REQUESTS_FILE = process.env.EVENT_REQUESTS_FILE;
const GUILD_CONFIG_FILE = path.join(process.env.GUILD_CONFIGS_DIR, 'guild-1.json');
const ORIGINAL_SECRET = process.env.EVENT_CROP_LINK_SECRET;

function cleanup() {
  if (fs.existsSync(IMAGES_DIR)) fs.rmSync(IMAGES_DIR, { recursive: true, force: true });
  if (fs.existsSync(REQUESTS_FILE)) fs.unlinkSync(REQUESTS_FILE);
  if (fs.existsSync(GUILD_CONFIG_FILE)) fs.unlinkSync(GUILD_CONFIG_FILE);
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

  test('serves the theme assigned to the request\'s guild', async () => {
    const request = await import('supertest');
    const { saveGuildConfig } = await import('../src/utils/guildConfig.js');
    const requestId = 'req-themed';
    seedRequest(requestId); // guildId: 'guild-1', per seedRequest's default
    await saveGuildConfig('guild-1', { website: { theme: 'shudder' } });
    const token = signCropToken(requestId);

    const response = await request.default(app).get(`/crop/${requestId}`).query({ token });

    expect(response.status).toBe(200);
    expect(response.text).toContain('/shared-assets/themes/shudder/bootstrap.min.css');
  });

  test('falls back to the default theme when the guild has none assigned', async () => {
    const request = await import('supertest');
    const requestId = 'req-unthemed';
    seedRequest(requestId); // guild-1 has no saved config in this test
    const token = signCropToken(requestId);

    const response = await request.default(app).get(`/crop/${requestId}`).query({ token });

    expect(response.status).toBe(200);
    expect(response.text).toContain('/shared-assets/themes/default/bootstrap.min.css');
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

  // A request whose image is a link has no file on disk. This used to 404,
  // and the page told the moderator the request had no image.
  test("loads the request's image link when no file is on disk, marked as not yet stored", async () => {
    const request = await import('supertest');
    const requestId = 'req-image-link';
    seedRequest(requestId, { imageUrl: 'https://images.example.com/poster.png' });
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(Buffer.from('linked-poster-bytes'), { headers: { 'content-type': 'image/png' } })
    );
    const token = signCropToken(requestId);

    try {
      const response = await request.default(app).get(`/crop/${requestId}/current-image`).query({ token });

      expect(fetchSpy).toHaveBeenCalledWith('https://images.example.com/poster.png');
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('image/png');
      expect(response.headers['x-image-source']).toBe('url');
      expect(response.body.toString()).toBe('linked-poster-bytes');
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test("says the request's image link failed, rather than that there is no image", async () => {
    const request = await import('supertest');
    const requestId = 'req-image-deadlink';
    seedRequest(requestId, { imageUrl: 'https://images.example.com/gone.png' });
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('nope', { status: 404 }));
    const token = signCropToken(requestId);

    try {
      const response = await request.default(app).get(`/crop/${requestId}/current-image`).query({ token });

      expect(response.status).toBe(404);
      expect(response.body.error).toMatch(/^The request's image link couldn't be loaded/);
    } finally {
      fetchSpy.mockRestore();
    }
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

  test('rejects when both the cropped image and the original are missing', async () => {
    const request = await import('supertest');

    const response = await request.default(app)
      .post('/api/event-request/upload-image');

    expect(response.status).toBe(400);
  });

  test('an original-only upload (right after pick/fetch, before cropping) mints a token and uses the original as the initial image too', async () => {
    const request = await import('supertest');

    const response = await request.default(app)
      .post('/api/event-request/upload-image')
      .attach('original', Buffer.from('raw-original-only'), { filename: 'source.png', contentType: 'image/png' });

    expect(response.status).toBe(200);
    const { imageToken } = response.body;

    const originalPath = await getOriginalImagePath(imageToken);
    expect(originalPath).not.toBeNull();
    expect(fs.readFileSync(originalPath).toString()).toBe('raw-original-only');

    // A valid, usable image already exists under this token even though the
    // user hasn't touched the crop box yet — the original doubles as the
    // uncropped default.
    const { getImagePath } = await import('../src/utils/eventImageStore.js');
    const imagePath = await getImagePath(imageToken);
    expect(imagePath).not.toBeNull();
    expect(fs.readFileSync(imagePath).toString()).toBe('raw-original-only');
  });

  test('a crop upload with an existing imageToken reuses that token instead of minting a new one, and leaves the original untouched', async () => {
    const request = await import('supertest');

    const originalUpload = await request.default(app)
      .post('/api/event-request/upload-image')
      .attach('original', Buffer.from('the-true-original'), { filename: 'source.png', contentType: 'image/png' });
    const { imageToken } = originalUpload.body;

    const cropUpload = await request.default(app)
      .post('/api/event-request/upload-image')
      .field('imageToken', imageToken)
      .attach('image', Buffer.from('final-crop'), { filename: 'crop.jpg', contentType: 'image/jpeg' });

    expect(cropUpload.status).toBe(200);
    expect(cropUpload.body.imageToken).toBe(imageToken);

    const { getImagePath } = await import('../src/utils/eventImageStore.js');
    const imagePath = await getImagePath(imageToken);
    expect(fs.readFileSync(imagePath).toString()).toBe('final-crop');

    const originalPath = await getOriginalImagePath(imageToken);
    expect(fs.readFileSync(originalPath).toString()).toBe('the-true-original');
  });

  test('a malformed imageToken is ignored — a fresh token is minted instead of reusing an arbitrary caller-supplied key', async () => {
    const request = await import('supertest');

    const response = await request.default(app)
      .post('/api/event-request/upload-image')
      .field('imageToken', '../../etc/passwd')
      .attach('image', Buffer.from('some-crop'), { filename: 'crop.jpg', contentType: 'image/jpeg' });

    expect(response.status).toBe(200);
    expect(response.body.imageToken).not.toBe('../../etc/passwd');
    expect(response.body.imageToken).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('POST /crop/:requestId/fetch-image-url', () => {
  test("returns the image as a data URL for the cropper, without using up the crop link's token", async () => {
    const request = await import('supertest');
    const requestId = 'req-fetch-1';
    seedRequest(requestId);
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(Buffer.from('pasted-image'), { headers: { 'content-type': 'image/jpeg' } })
    );
    const token = signCropToken(requestId);

    try {
      const response = await request.default(app)
        .post(`/crop/${requestId}/fetch-image-url`)
        .send({ token, imageUrl: 'https://images.example.com/still.jpg' });

      expect(response.status).toBe(200);
      expect(response.body.dataUrl).toBe(`data:image/jpeg;base64,${Buffer.from('pasted-image').toString('base64')}`);

      // The same token still saves afterwards.
      const save = await request.default(app)
        .post(`/crop/${requestId}/save`)
        .field('token', token)
        .attach('image', Buffer.from('cropped'), { filename: 'crop.jpg', contentType: 'image/jpeg' });
      expect(save.status).toBe(200);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test('rejects an invalid token without fetching anything', async () => {
    const request = await import('supertest');
    seedRequest('req-fetch-2');
    const fetchSpy = jest.spyOn(global, 'fetch');

    try {
      const response = await request.default(app)
        .post('/crop/req-fetch-2/fetch-image-url')
        .send({ token: 'garbage', imageUrl: 'https://images.example.com/still.jpg' });

      expect(response.status).toBe(403);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test('passes on why a URL could not be used', async () => {
    const request = await import('supertest');
    seedRequest('req-fetch-3');
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response('<html></html>', { headers: { 'content-type': 'text/html' } })
    );

    try {
      const response = await request.default(app)
        .post('/crop/req-fetch-3/fetch-image-url')
        .send({ token: signCropToken('req-fetch-3'), imageUrl: 'https://example.com/page' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeTruthy();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe('cropping a request whose image is a link, end to end', () => {
  test('the linked image is saved as the original, and the request switches from the link to the crop', async () => {
    const request = await import('supertest');
    const requestId = 'req-link-e2e';
    seedRequest(requestId, { imageUrl: 'https://images.example.com/poster.png' });
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(Buffer.from('linked-poster-bytes'), { headers: { 'content-type': 'image/png' } })
    );
    const token = signCropToken(requestId);

    try {
      // What crop.js does: load the current image; since it came from the
      // link, send those same bytes back as the original with the crop.
      const current = await request.default(app).get(`/crop/${requestId}/current-image`).query({ token });
      expect(current.headers['x-image-source']).toBe('url');

      const save = await request.default(app)
        .post(`/crop/${requestId}/save`)
        .field('token', token)
        .attach('image', Buffer.from('cropped-poster'), { filename: 'crop.jpg', contentType: 'image/jpeg' })
        .attach('original', current.body, { filename: 'original', contentType: current.headers['content-type'] });
      expect(save.status).toBe(200);

      const requestData = global.eventRequests.get(requestId);
      expect(requestData.imageUrl).toBeNull();
      expect(requestData.hasUploadedImage).toBe(true);
      expect(fs.readFileSync(await getOriginalImagePath(requestId)).toString()).toBe('linked-poster-bytes');

      // A re-crop now starts from the stored original, with no fetch.
      fetchSpy.mockClear();
      const again = await request.default(app).get(`/crop/${requestId}/current-image`).query({ token: signCropToken(requestId) });
      expect(again.body.toString()).toBe('linked-poster-bytes');
      expect(again.headers['x-image-source']).toBeUndefined();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

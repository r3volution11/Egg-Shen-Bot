/**
 * Tests for src/utils/eventImageStore.js — local-disk storage for
 * event-request images, with a manifest sidecar tracking each stored
 * image's linked event date so the retention sweep
 * (eventImageCleanupScheduler.js) knows when to prune it.
 *
 * Run with: npx jest tests/eventImageStore.test.js --verbose
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import {
  extensionForMimeType,
  saveUploadedImage,
  renameImageKey,
  recordEventDate,
  getImagePath,
  deleteImage,
  pruneExpiredImages,
  pruneOrphanedUploads,
} from '../src/utils/eventImageStore.js';

const IMAGES_DIR = path.join(process.cwd(), 'event_request_images');
const MANIFEST_PATH = path.join(IMAGES_DIR, 'manifest.json');

function cleanup() {
  if (fs.existsSync(IMAGES_DIR)) {
    fs.rmSync(IMAGES_DIR, { recursive: true, force: true });
  }
}

beforeEach(cleanup);
afterEach(cleanup);

const DAY_MS = 24 * 60 * 60 * 1000;

describe('extensionForMimeType', () => {
  test('maps allowed mimetypes to their extension', () => {
    expect(extensionForMimeType('image/png')).toBe('.png');
    expect(extensionForMimeType('image/jpeg')).toBe('.jpg');
    expect(extensionForMimeType('image/gif')).toBe('.gif');
    expect(extensionForMimeType('image/webp')).toBe('.webp');
  });

  test('returns null for an unsupported mimetype', () => {
    expect(extensionForMimeType('application/pdf')).toBeNull();
  });
});

describe('saveUploadedImage / getImagePath', () => {
  test('writes the file to disk and makes it retrievable by key', async () => {
    const buffer = Buffer.from('fake-image-bytes');

    const filename = await saveUploadedImage('token-1', buffer, 'image/png');

    expect(filename).toBe('token-1.png');
    const filePath = await getImagePath('token-1');
    expect(filePath).toBe(path.join(IMAGES_DIR, 'token-1.png'));
    expect(fs.readFileSync(filePath)).toEqual(buffer);
  });

  test('rejects an unsupported mimetype without writing anything', async () => {
    await expect(saveUploadedImage('token-1', Buffer.from('x'), 'application/pdf'))
      .rejects.toThrow('Unsupported image type');
    expect(fs.existsSync(IMAGES_DIR)).toBe(false);
  });

  test('getImagePath returns null for a key that was never stored', async () => {
    expect(await getImagePath('nonexistent')).toBeNull();
  });
});

describe('renameImageKey', () => {
  test('renames the file on disk and moves the manifest entry to the new key', async () => {
    await saveUploadedImage('placeholder-token', Buffer.from('img'), 'image/jpeg');

    await renameImageKey('placeholder-token', 'real-request-id');

    expect(await getImagePath('placeholder-token')).toBeNull();
    const newPath = await getImagePath('real-request-id');
    expect(newPath).toBe(path.join(IMAGES_DIR, 'real-request-id.jpg'));
  });

  test('is a no-op when the token was never uploaded', async () => {
    await expect(renameImageKey('never-uploaded', 'req-1')).resolves.toBeUndefined();
    expect(await getImagePath('req-1')).toBeNull();
  });
});

describe('recordEventDate + pruneExpiredImages', () => {
  test('an image whose event date is more than 90 days in the past is pruned', async () => {
    await saveUploadedImage('req-old', Buffer.from('img'), 'image/png');
    await recordEventDate('req-old', Date.now() - 100 * DAY_MS);

    const deletedCount = await pruneExpiredImages();

    expect(deletedCount).toBe(1);
    expect(await getImagePath('req-old')).toBeNull();
  });

  test('an image whose event date is within the last 90 days is kept', async () => {
    await saveUploadedImage('req-recent', Buffer.from('img'), 'image/png');
    await recordEventDate('req-recent', Date.now() - 10 * DAY_MS);

    const deletedCount = await pruneExpiredImages();

    expect(deletedCount).toBe(0);
    expect(await getImagePath('req-recent')).not.toBeNull();
  });

  test('an image with no recorded event date yet is left alone', async () => {
    await saveUploadedImage('req-pending', Buffer.from('img'), 'image/png');

    const deletedCount = await pruneExpiredImages();

    expect(deletedCount).toBe(0);
    expect(await getImagePath('req-pending')).not.toBeNull();
  });

  test('recordEventDate is a no-op for a key that was never stored', async () => {
    await expect(recordEventDate('nonexistent', Date.now())).resolves.toBeUndefined();
  });
});

describe('pruneOrphanedUploads', () => {
  test('deletes an upload older than the threshold with no event date recorded', async () => {
    await saveUploadedImage('req-abandoned', Buffer.from('img'), 'image/png');

    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    manifest['req-abandoned'].uploadedAt = Date.now() - 9 * DAY_MS;
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

    const deletedCount = await pruneOrphanedUploads();

    expect(deletedCount).toBe(1);
    expect(await getImagePath('req-abandoned')).toBeNull();
  });

  test('leaves a recent upload with no event date alone', async () => {
    await saveUploadedImage('req-fresh', Buffer.from('img'), 'image/png');

    const deletedCount = await pruneOrphanedUploads();

    expect(deletedCount).toBe(0);
    expect(await getImagePath('req-fresh')).not.toBeNull();
  });

  test('leaves an old upload alone once it has a recorded event date', async () => {
    await saveUploadedImage('req-approved', Buffer.from('img'), 'image/png');
    await recordEventDate('req-approved', Date.now() + 30 * DAY_MS);

    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    manifest['req-approved'].uploadedAt = Date.now() - 9 * DAY_MS;
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

    const deletedCount = await pruneOrphanedUploads();

    expect(deletedCount).toBe(0);
    expect(await getImagePath('req-approved')).not.toBeNull();
  });
});

describe('deleteImage', () => {
  test('removes the file and manifest entry', async () => {
    await saveUploadedImage('req-1', Buffer.from('img'), 'image/png');

    await deleteImage('req-1');

    expect(await getImagePath('req-1')).toBeNull();
  });

  test('is a no-op for a key that does not exist', async () => {
    await expect(deleteImage('nonexistent')).resolves.toBeUndefined();
  });
});

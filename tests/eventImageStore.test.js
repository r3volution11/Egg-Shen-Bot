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
  saveOriginalImage,
  getOriginalImagePath,
  renameImageKey,
  recordEventDate,
  getImagePath,
  deleteImage,
  pruneExpiredImages,
  pruneOrphanedUploads,
} from '../src/utils/eventImageStore.js';

const IMAGES_DIR = process.env.EVENT_IMAGES_DIR || path.join(process.cwd(), 'event_request_images');
const MANIFEST_PATH = path.join(IMAGES_DIR, 'manifest.json');

/**
 * Empty a directory without removing it.
 *
 * Deleting the directory outright is what made these suites interfere:
 * jest.setup.js scopes the path per WORKER, and Jest reuses a worker across
 * test files, so rmSync on the directory pulled it out from under whichever
 * suite ran next in that worker. Clearing the contents leaves the directory
 * in place and is safe regardless of who else shares it.
 */
function emptyDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
  }
}

function cleanup() {
  emptyDir(IMAGES_DIR);
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

    // The assertion is "nothing was written", not "the directory is absent" —
    // cleanup now empties the directory rather than deleting it, since
    // deleting a path shared with another suite is what caused cross-suite
    // flakiness.
    const written = fs.existsSync(IMAGES_DIR) ? fs.readdirSync(IMAGES_DIR) : [];
    expect(written).toEqual([]);
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

  test('also renames the preserved original, if one was saved under the token', async () => {
    await saveUploadedImage('placeholder-token-2', Buffer.from('cropped'), 'image/jpeg');
    await saveOriginalImage('placeholder-token-2', Buffer.from('original'), 'image/png');

    await renameImageKey('placeholder-token-2', 'real-request-id-2');

    expect(await getOriginalImagePath('placeholder-token-2')).toBeNull();
    const originalPath = await getOriginalImagePath('real-request-id-2');
    expect(originalPath).toBe(path.join(IMAGES_DIR, 'real-request-id-2-original.png'));
  });

  test('renaming without a saved original does not error', async () => {
    await saveUploadedImage('placeholder-token-3', Buffer.from('cropped-only'), 'image/jpeg');

    await expect(renameImageKey('placeholder-token-3', 'real-request-id-3')).resolves.toBeUndefined();
    expect(await getOriginalImagePath('real-request-id-3')).toBeNull();
  });

  test('a failure on the second rename still records the first', async () => {
    // renameSingleImageKey moves the file on disk BEFORE updating the in-memory
    // manifest, and the manifest was only saved after BOTH renames. So if the
    // second threw anything but ENOENT, the first rename had already happened
    // but was never recorded: getImagePath returned null (the approval embed
    // lost its image) and the orphan sweep could never reclaim the moved file,
    // because it sat under no manifest key.
    await saveUploadedImage('token-4', Buffer.from('cropped'), 'image/jpeg');
    await saveOriginalImage('token-4', Buffer.from('original'), 'image/png');

    // Block the original's destination with a directory, so fs.rename fails
    // with EEXIST/ENOTEMPTY rather than ENOENT.
    fs.mkdirSync(path.join(IMAGES_DIR, 'req-4-original.png'));
    fs.writeFileSync(path.join(IMAGES_DIR, 'req-4-original.png', 'occupied'), 'x');

    await expect(renameImageKey('token-4', 'req-4')).rejects.toThrow();

    // The cropped image moved, so the manifest must say so.
    expect(await getImagePath('req-4')).toBe(path.join(IMAGES_DIR, 'req-4.jpg'));
    expect(await getImagePath('token-4')).toBeNull();
  });
});

describe('saveOriginalImage / getOriginalImagePath', () => {
  test('stores the original separately from the cropped image under the same key', async () => {
    await saveUploadedImage('req-both', Buffer.from('cropped-bytes'), 'image/jpeg');
    await saveOriginalImage('req-both', Buffer.from('original-bytes'), 'image/png');

    const croppedPath = await getImagePath('req-both');
    const originalPath = await getOriginalImagePath('req-both');

    expect(croppedPath).toBe(path.join(IMAGES_DIR, 'req-both.jpg'));
    expect(originalPath).toBe(path.join(IMAGES_DIR, 'req-both-original.png'));
    expect(fs.readFileSync(croppedPath)).toEqual(Buffer.from('cropped-bytes'));
    expect(fs.readFileSync(originalPath)).toEqual(Buffer.from('original-bytes'));
  });

  test('returns null when no original was ever saved for a key', async () => {
    await saveUploadedImage('req-cropped-only', Buffer.from('cropped'), 'image/jpeg');

    expect(await getOriginalImagePath('req-cropped-only')).toBeNull();
  });

  test('re-cropping (overwriting the cropped image) does not affect the preserved original', async () => {
    await saveUploadedImage('req-recrop', Buffer.from('first-crop'), 'image/jpeg');
    await saveOriginalImage('req-recrop', Buffer.from('true-original'), 'image/png');

    await deleteImage('req-recrop');
    await saveUploadedImage('req-recrop', Buffer.from('second-crop'), 'image/jpeg');

    const originalPath = await getOriginalImagePath('req-recrop');
    expect(fs.readFileSync(originalPath)).toEqual(Buffer.from('true-original'));
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

  test('recordEventDate also stamps the preserved original, so it is retained/pruned on the same schedule', async () => {
    await saveUploadedImage('req-with-original', Buffer.from('cropped'), 'image/jpeg');
    await saveOriginalImage('req-with-original', Buffer.from('original'), 'image/png');

    await recordEventDate('req-with-original', Date.now() - 100 * DAY_MS);

    const deletedCount = await pruneExpiredImages();

    expect(deletedCount).toBe(2); // both the cropped copy and the original
    expect(await getImagePath('req-with-original')).toBeNull();
    expect(await getOriginalImagePath('req-with-original')).toBeNull();
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

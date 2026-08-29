/**
 * Event Request Image Store
 * Stores images uploaded/associated with event requests on local disk, with
 * a small JSON manifest tracking each file's linked event date so the
 * retention sweep (eventImageCleanupScheduler.js) can prune images ~90 days
 * after their event has passed. Images are keyed by request ID — before a
 * request is actually submitted, the web form uploads under a client-
 * generated placeholder token, then the token is renamed to the real
 * request ID once the request is created (see server.js's upload route and
 * POST /api/event-request).
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IMAGES_DIR = path.join(__dirname, '../../event_request_images');
const MANIFEST_PATH = path.join(IMAGES_DIR, 'manifest.json');

const RETENTION_MS = 90 * 24 * 60 * 60 * 1000; // 90 days past the event date

// Allowlisted extensions, matching the mimetype allowlist enforced by
// multer's fileFilter in server.js's upload route — kept in sync there.
const ALLOWED_EXTENSIONS_BY_MIME = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

async function ensureImagesDir() {
  await fs.mkdir(IMAGES_DIR, { recursive: true });
}

async function loadManifest() {
  try {
    const data = await fs.readFile(MANIFEST_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Error reading event image manifest:', error);
    }
    return {};
  }
}

async function saveManifest(manifest) {
  await ensureImagesDir();
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
}

/**
 * Extension for a given mimetype, or null if not an allowed image type.
 */
export function extensionForMimeType(mimeType) {
  return ALLOWED_EXTENSIONS_BY_MIME[mimeType] || null;
}

/**
 * Save an uploaded image's buffer to disk under the given key (either a
 * placeholder token or a real requestId), recording it in the manifest with
 * no event date yet (added later via recordEventDate once the event is
 * actually created — a token that never becomes a real request/event is
 * pruned separately, see pruneOrphanedUploads).
 * @param {string} key - Placeholder token or requestId
 * @param {Buffer} fileBuffer
 * @param {string} mimeType
 * @returns {Promise<string>} The stored filename
 */
export async function saveUploadedImage(key, fileBuffer, mimeType) {
  const ext = extensionForMimeType(mimeType);
  if (!ext) {
    throw new Error(`Unsupported image type: ${mimeType}`);
  }

  await ensureImagesDir();
  const filename = `${key}${ext}`;
  const filePath = path.join(IMAGES_DIR, filename);
  await fs.writeFile(filePath, fileBuffer);

  const manifest = await loadManifest();
  manifest[key] = { filename, eventDate: null, uploadedAt: Date.now() };
  await saveManifest(manifest);

  return filename;
}

/**
 * Rename a placeholder-token image to the real requestId once a request has
 * actually been submitted (the form uploads before the request exists).
 * No-op if no image was uploaded under that token.
 * @param {string} token - Placeholder token used at upload time
 * @param {string} requestId - Real request ID to rename to
 */
export async function renameImageKey(token, requestId) {
  const manifest = await loadManifest();
  const entry = manifest[token];
  if (!entry) return;

  const oldPath = path.join(IMAGES_DIR, entry.filename);
  const ext = path.extname(entry.filename);
  const newFilename = `${requestId}${ext}`;
  const newPath = path.join(IMAGES_DIR, newFilename);

  try {
    await fs.rename(oldPath, newPath);
  } catch (error) {
    if (error.code === 'ENOENT') return; // upload was already pruned/removed
    throw error;
  }

  delete manifest[token];
  manifest[requestId] = { ...entry, filename: newFilename };
  await saveManifest(manifest);
}

/**
 * Record the linked event's date for a stored image, so the retention
 * sweep knows when it becomes eligible for deletion (90 days after this).
 * @param {string} requestId
 * @param {number} eventDateMs - Epoch ms of the event's start/end time
 */
export async function recordEventDate(requestId, eventDateMs) {
  const manifest = await loadManifest();
  if (!manifest[requestId]) return;
  manifest[requestId].eventDate = eventDateMs;
  await saveManifest(manifest);
}

/**
 * Absolute path to a stored image for the given key, or null if none exists.
 * @param {string} key - requestId (or placeholder token, pre-rename)
 * @returns {Promise<string|null>}
 */
export async function getImagePath(key) {
  const manifest = await loadManifest();
  const entry = manifest[key];
  if (!entry) return null;

  const filePath = path.join(IMAGES_DIR, entry.filename);
  try {
    await fs.access(filePath);
    return filePath;
  } catch {
    return null;
  }
}

/**
 * Delete a stored image and its manifest entry.
 * @param {string} key
 */
export async function deleteImage(key) {
  const manifest = await loadManifest();
  const entry = manifest[key];
  if (!entry) return;

  const filePath = path.join(IMAGES_DIR, entry.filename);
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  delete manifest[key];
  await saveManifest(manifest);
}

/**
 * Delete every stored image whose linked event date is more than 90 days in
 * the past. Images with no recorded event date yet (still-pending requests)
 * are left alone regardless of upload age — they're cleaned up once the
 * request resolves one way or another (approved -> gets an event date;
 * denied/expired -> pruned separately by the 7-day event-request TTL, which
 * this function does not need to duplicate since a denied request's image
 * is orphaned but harmless — see pruneOrphanedUploads for that case).
 * @returns {Promise<number>} Number of images deleted
 */
export async function pruneExpiredImages() {
  const manifest = await loadManifest();
  const now = Date.now();
  let deletedCount = 0;

  for (const [key, entry] of Object.entries(manifest)) {
    if (entry.eventDate && (now - entry.eventDate) > RETENTION_MS) {
      await deleteImage(key);
      deletedCount++;
    }
  }

  return deletedCount;
}

/**
 * Delete uploaded images whose upload is older than the given age and still
 * have no event date recorded — i.e. the request was never approved (denied,
 * expired, or abandoned mid-submission). Separate from pruneExpiredImages,
 * which only prunes images tied to a real, resolved event date.
 * @param {number} maxAgeMs - Age threshold (defaults to the event-request
 *   system's own 7-day pending-request TTL plus a small buffer)
 * @returns {Promise<number>} Number of images deleted
 */
export async function pruneOrphanedUploads(maxAgeMs = 8 * 24 * 60 * 60 * 1000) {
  const manifest = await loadManifest();
  const now = Date.now();
  let deletedCount = 0;

  for (const [key, entry] of Object.entries(manifest)) {
    if (!entry.eventDate && entry.uploadedAt && (now - entry.uploadedAt) > maxAgeMs) {
      await deleteImage(key);
      deletedCount++;
    }
  }

  return deletedCount;
}

/**
 * Fetches an image URL into a validated in-memory Buffer, shared by two
 * call sites that need the exact same content-type/size checks:
 * - eventRequestApproval.js's resolveEventImageBuffer(), fetching a
 *   submitter-pasted URL at approval time to attach to the Discord event.
 * - api/server.js's POST /api/event-request/fetch-image-url, fetching a
 *   pasted URL at SUBMISSION time so the browser can run it through the
 *   same crop UI a file upload gets.
 *
 * Lives in its own file (not inside eventRequestApproval.js, which it
 * predates) because eventRequestApproval.js itself imports from
 * api/server.js — server.js importing back from eventRequestApproval.js
 * for just this function would be a circular import.
 */

// Max bytes to accept for a fetched image URL — Discord's own scheduled
// event image limit is much smaller than this, but capping the fetch
// itself avoids downloading something huge just to have Discord reject it.
export const MAX_FETCHED_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * @param {string} imageUrl
 * @returns {Promise<{ ok: true, buffer: Buffer, contentType: string } | { ok: false, error: string }>}
 */
export async function fetchImageUrl(imageUrl) {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      return { ok: false, error: `Couldn't fetch that URL (server responded ${response.status}).` };
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      return { ok: false, error: `That URL didn't return an image (got "${contentType || 'unknown'}").` };
    }

    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_FETCHED_IMAGE_BYTES) {
      return { ok: false, error: 'That image is too large (8MB max).' };
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_FETCHED_IMAGE_BYTES) {
      return { ok: false, error: 'That image is too large (8MB max).' };
    }

    return { ok: true, buffer: Buffer.from(arrayBuffer), contentType };
  } catch (error) {
    return { ok: false, error: `Couldn't fetch that URL: ${error.message}` };
  }
}

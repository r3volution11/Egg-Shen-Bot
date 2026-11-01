/**
 * Uploads the emoji kit's art as the bot's own application emojis, and
 * tells the kit (emojiKit.js) which are there.
 *
 * Every operator runs their own bot (it's self-hosted), so every bot needs
 * its own copy of the kit: this runs on startup and uploads whatever is
 * missing, with no manual step. Until a family is fully uploaded, the kit
 * draws it with plain emoji, so a slow or failed upload never breaks a card.
 *
 * Names carry the art's hash: `es_<code>_<hash>`. Discord can't change an
 * uploaded emoji's image (only its name), so new art is a new emoji. The
 * old one is KEPT: every message already posted points at it by id, and a
 * closed tournament card or last month's game card would otherwise show
 * raw `:es_pie_3fa9:` text. Nothing is deleted automatically; `--prune` in
 * scripts/deploy-emojis.js removes versions that are no longer current and
 * older than 30 days, and only when asked.
 *
 * The art and its hashes come from assets/emojis/ (manifest.json and one
 * PNG per code), built by scripts/build-emojis.js and committed: the server
 * installs with --omit=dev and never builds them.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { KIT_CODES, setLiveRegistry } from './emojiKit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = process.env.EMOJI_ASSETS_DIR || path.join(__dirname, '..', '..', 'assets', 'emojis');

/** Discord's ceiling on application emojis */
export const APP_EMOJI_CAP = 2000;
/** --prune leaves anything younger than this alone */
export const PRUNE_MIN_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const DISCORD_EPOCH = 1420070400000n;

export const kitName = (code, hash) => `es_${code}_${hash}`;

/** A kit emoji's name taken apart, or null for anyone else's emoji */
export function parseKitName(name) {
  const m = /^es_([a-z0-9]{1,6})_([0-9a-f]{4})$/.exec(name || '');
  return m ? { code: m[1], hash: m[2] } : null;
}

/** When an emoji was uploaded, from its snowflake id */
export const uploadedAt = (id) => Number((BigInt(id) >> 22n) + DISCORD_EPOCH);

/** assets/emojis/manifest.json, limited to codes the kit knows; null if not built */
export function loadManifest(dir = ASSETS_DIR) {
  try {
    const all = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    return Object.fromEntries(Object.entries(all).filter(([code, e]) => KIT_CODES[code] && /^[0-9a-f]{4}$/.test(e?.hash || '')));
  } catch {
    return null;
  }
}

/** The PNG for a code, as the data URI discord.js passes straight through */
export function readPng(code, dir = ASSETS_DIR) {
  // A Buffer would be labelled image/jpg by discord.js's resolveBase64
  // (DataResolver.js), so send PNG as an explicit data URI
  return `data:image/png;base64,${fs.readFileSync(path.join(dir, `${code}.png`)).toString('base64')}`;
}

/** The list from manager.fetch(): a discord.js Collection, a Map, or an array */
const listOf = (fetched) => (Array.isArray(fetched) ? fetched : [...(fetched?.values?.() || [])]);

/**
 * Compare what's uploaded with the manifest; upload what's missing.
 *
 * @param {{fetch: () => Promise<any>, create: ({attachment, name}) => Promise<{id, name}>, delete: (id) => Promise<void>}} manager
 *   client.application.emojis, or restEmojiManager() for the script
 * @param {object} opts
 * @param {object} opts.manifest - loadManifest()
 * @param {boolean} [opts.upload=true] - false: only read what's there
 * @param {boolean} [opts.prune=false] - delete superseded versions older than 30 days
 * @returns {Promise<{resolved: Map<string,{id,name}>, created: string[], adopted: string[], missing: string[], failed: {code,message}[], stale: {id,name}[], deleted: {id,name}[]}>}
 */
export async function syncKit(manager, {
  manifest, upload = true, prune = false, cap = APP_EMOJI_CAP, now = Date.now(),
  png = readPng, log = () => {},
} = {}) {
  const result = { resolved: new Map(), created: [], adopted: [], missing: [], failed: [], stale: [], deleted: [] };
  if (!manifest) return result;

  let existing = listOf(await manager.fetch());
  const byName = () => new Map(existing.map(e => [e.name, e]));
  let names = byName();

  const wanted = Object.entries(manifest).map(([code, { hash }]) => ({ code, name: kitName(code, hash) }));
  for (const { code, name } of wanted) {
    const e = names.get(name);
    if (e) result.resolved.set(code, { id: e.id, name: e.name });
    else result.missing.push(code);
  }
  const current = new Set(wanted.map(w => w.name));
  // Ours (an es_ name) but not today's art: kept unless pruning
  result.stale = existing.filter(e => parseKitName(e.name) && !current.has(e.name)).map(e => ({ id: e.id, name: e.name }));

  if (upload) {
    let room = cap - existing.length;
    for (const code of [...result.missing]) {
      const name = kitName(code, manifest[code].hash);
      if (room <= 0) {
        result.failed.push({ code, message: `the application already has ${cap} emojis` });
        continue;
      }
      try {
        // One at a time: emoji routes have their own, strict rate limits
        const e = await manager.create({ attachment: png(code), name });
        result.resolved.set(code, { id: e.id, name: e.name });
        result.created.push(code);
        room -= 1;
      } catch (err) {
        // Another process (a second instance on the same application) may
        // have uploaded it a moment ago: look again and use theirs
        existing = listOf(await manager.fetch().catch(() => existing));
        names = byName();
        const e = names.get(name);
        if (e) {
          result.resolved.set(code, { id: e.id, name: e.name });
          result.adopted.push(code);
        } else {
          result.failed.push({ code, message: err?.message || String(err) });
          log(`[EmojiKit] Upload of ${name} failed: ${err?.message || err}`);
        }
      }
    }
    result.missing = result.missing.filter(c => !result.resolved.has(c));
  }

  if (prune) {
    for (const e of result.stale) {
      if (now - uploadedAt(e.id) < PRUNE_MIN_AGE_MS) continue;
      try {
        await manager.delete(e.id);
        result.deleted.push(e);
      } catch (err) {
        log(`[EmojiKit] Couldn't delete ${e.name}: ${err?.message || err}`);
      }
    }
  }
  return result;
}

/**
 * The same fetch/create/delete shape over plain REST, for
 * scripts/deploy-emojis.js (which has a token but no gateway client).
 */
export function restEmojiManager(rest, Routes, applicationId) {
  return {
    fetch: async () => (await rest.get(Routes.applicationEmojis(applicationId))).items || [],
    create: ({ attachment, name }) => rest.post(Routes.applicationEmojis(applicationId), { body: { image: attachment, name } }),
    delete: (id) => rest.delete(Routes.applicationEmoji(applicationId, id)),
  };
}

const RETRY_FIRST_MS = 60 * 60 * 1000;
const RETRY_MAX_MS = 24 * 60 * 60 * 1000;
let retryTimer = null;

/**
 * On startup: read what's uploaded and switch the kit on for every family
 * that's complete (awaited, bounded, so the first cards after a restart
 * already have their art), then upload anything missing in the background,
 * retrying with backoff if Discord refuses some.
 *
 * EMOJI_SYNC=off skips it all: plain emoji everywhere.
 */
export async function startEmojiKit(client, {
  mode = (process.env.EMOJI_SYNC || 'auto').toLowerCase(),
  manifest = loadManifest(),
  timeoutMs = 5000,
  retryMs = RETRY_FIRST_MS,
  png = readPng,
} = {}) {
  if (mode === 'off') {
    console.log('[EmojiKit] Off (EMOJI_SYNC=off): plain emoji everywhere');
    return null;
  }
  if (!manifest) {
    console.warn('[EmojiKit] No assets/emojis/manifest.json: plain emoji everywhere');
    return null;
  }
  const manager = client.application?.emojis;
  if (!manager) {
    console.warn('[EmojiKit] No application emoji manager: plain emoji everywhere');
    return null;
  }

  // What's already there, without waiting on uploads
  const timeout = new Promise((resolve) => { const t = setTimeout(() => resolve(null), timeoutMs); t.unref?.(); });
  const first = await Promise.race([
    syncKit(manager, { manifest, upload: false }).catch(err => {
      console.warn(`[EmojiKit] Couldn't read the application's emojis: ${err?.message || err}`);
      return null;
    }),
    timeout,
  ]);
  if (first) setLiveRegistry(first.resolved);
  const total = Object.keys(manifest).length;
  if (first && first.missing.length === 0) {
    console.log(`[EmojiKit] Ready: ${total}`);
    return first;
  }

  // Upload the rest in the background; never hold up startup on it
  const missing = first ? first.missing.length : total;
  console.log(`[EmojiKit] Uploading ${missing} of ${total} in the background…`);
  const attempt = async (delay) => {
    const res = await syncKit(manager, { manifest, png, log: (m) => console.warn(m) }).catch(err => {
      console.warn(`[EmojiKit] Upload failed: ${err?.message || err}`);
      return null;
    });
    if (res) setLiveRegistry(res.resolved);
    if (res && res.missing.length === 0) {
      console.log(`[EmojiKit] Ready: ${total}${res.created.length ? ` (${res.created.length} uploaded)` : ''}`);
      return;
    }
    const left = res ? res.missing.join(', ') : 'all';
    console.warn(`[EmojiKit] Still missing (${left}): plain emoji for those families; retrying in ${Math.round(delay / 60000)} min`);
    retryTimer = setTimeout(() => attempt(Math.min(delay * 2, RETRY_MAX_MS)), delay);
    retryTimer.unref?.();
  };
  attempt(retryMs);
  return first;
}

/** Stop a pending retry (shutdown, tests) */
export function stopEmojiKit() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}

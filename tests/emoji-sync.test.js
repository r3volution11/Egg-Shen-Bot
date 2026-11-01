/**
 * Uploading the emoji kit (src/utils/emojiSync.js) against a fake
 * application emoji manager with discord.js's fetch/create/delete shape.
 * What's asserted is which emojis the application ends up with, and what
 * the kit draws, not that "something was called".
 *
 * Run with: npm test -- tests/emoji-sync.test.js
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { syncKit, startEmojiKit, stopEmojiKit, kitName, parseKitName, uploadedAt, readPng, loadManifest, PRUNE_MIN_AGE_MS } from '../src/utils/emojiSync.js';
import { KIT_CODES, liveKit, setLiveRegistry } from '../src/utils/emojiKit.js';

const DISCORD_EPOCH = 1420070400000n;
const NOW = Date.UTC(2026, 10, 1, 12);
const DAY = 24 * 60 * 60 * 1000;

/** A snowflake id minted at `ms` */
const snowflake = (ms, n = 0) => String(((BigInt(ms) - DISCORD_EPOCH) << 22n) + BigInt(n));

const manifestWith = (hash = 'ab12', overrides = {}) =>
  Object.fromEntries(Object.keys(KIT_CODES).map(c => [c, { hash: overrides[c] || hash }]));

/** An application's emojis, as discord.js's ApplicationEmojiManager shows them */
function fakeManager(initial = [], { failCreate = () => null } = {}) {
  const emojis = [...initial];
  let n = 0;
  const manager = {
    emojis,
    fetch: jest.fn(async () => new Map(emojis.map(e => [e.id, e]))),
    create: jest.fn(async ({ attachment, name }) => {
      const err = failCreate(name);
      if (err) throw err;
      if (!/^data:image\/png;base64,/.test(attachment)) throw new Error(`not a PNG data URI: ${String(attachment).slice(0, 30)}`);
      const e = { id: snowflake(NOW, ++n), name };
      emojis.push(e);
      return e;
    }),
    delete: jest.fn(async (id) => {
      const i = emojis.findIndex(e => e.id === id);
      if (i >= 0) emojis.splice(i, 1);
    }),
  };
  return manager;
}

const png = () => 'data:image/png;base64,iVBORw0KGgo=';
const uploaded = (manifest, at = NOW) => Object.entries(manifest).map(([code, { hash }], i) => ({ id: snowflake(at, 1000 + i), name: kitName(code, hash) }));
const codes = Object.keys(KIT_CODES);

afterEach(() => {
  stopEmojiKit();
  setLiveRegistry(null);
  jest.restoreAllMocks();
});

describe('names', () => {
  test('a kit name round-trips; anyone else\'s emoji isn\'t ours', () => {
    expect(kitName('gpie', '3fa9')).toBe('es_gpie_3fa9');
    expect(parseKitName('es_gpie_3fa9')).toEqual({ code: 'gpie', hash: '3fa9' });
    expect(parseKitName('my_logo')).toBeNull();
    expect(parseKitName('es_toolongcode_3fa9')).toBeNull();
    expect(parseKitName('es_pie_XYZ1')).toBeNull();
  });

  test('upload time comes from the snowflake', () => {
    expect(uploadedAt(snowflake(NOW - 3 * DAY))).toBe(NOW - 3 * DAY);
  });
});

describe('reading the built art', () => {
  test('a PNG goes up as a PNG data URI: discord.js would label a Buffer image/jpg', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'emoji-art-'));
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    fs.writeFileSync(path.join(dir, 'coin.png'), bytes);
    expect(readPng('coin', dir)).toBe(`data:image/png;base64,${bytes.toString('base64')}`);
  });

  test('the manifest keeps only codes the kit knows, with a 4-hex hash', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'emoji-art-'));
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ coin: { hash: 'ab12' }, nope: { hash: 'ab12' }, star: { hash: 'XYZ' } }));
    expect(loadManifest(dir)).toEqual({ coin: { hash: 'ab12' } });
    expect(loadManifest(path.join(dir, 'missing'))).toBeNull();
  });
});

describe('syncKit', () => {
  test('an application with no emojis gets every code once, as a PNG, under its hashed name', async () => {
    const manifest = manifestWith();
    const m = fakeManager();
    const res = await syncKit(m, { manifest, png, now: NOW });
    expect(m.create).toHaveBeenCalledTimes(codes.length);
    expect(m.emojis.map(e => e.name).sort()).toEqual(codes.map(c => `es_${c}_ab12`).sort());
    expect(res.created.sort()).toEqual([...codes].sort());
    expect(res.missing).toEqual([]);
    expect([...res.resolved.keys()].sort()).toEqual([...codes].sort());
  });

  test('when everything is there, nothing is uploaded or deleted', async () => {
    const manifest = manifestWith();
    const m = fakeManager(uploaded(manifest));
    const res = await syncKit(m, { manifest, png, now: NOW });
    expect(m.create).not.toHaveBeenCalled();
    expect(m.delete).not.toHaveBeenCalled();
    expect(res.resolved.get('coin')).toEqual({ id: m.emojis.find(e => e.name === 'es_coin_ab12').id, name: 'es_coin_ab12' });
  });

  test('new art is uploaded under a new name, and the old version is kept', async () => {
    const before = manifestWith('ab12');
    const m = fakeManager(uploaded(before, NOW - 90 * DAY));
    const res = await syncKit(m, { manifest: manifestWith('ab12', { gpie: 'cd34' }), png, now: NOW });
    expect(res.created).toEqual(['gpie']);
    expect(m.emojis.map(e => e.name)).toEqual(expect.arrayContaining(['es_gpie_ab12', 'es_gpie_cd34']));
    expect(res.resolved.get('gpie').name).toBe('es_gpie_cd34');
    expect(res.stale.map(e => e.name)).toEqual(['es_gpie_ab12']);
    expect(m.delete).not.toHaveBeenCalled();
  });

  test('prune deletes only superseded versions older than 30 days, never anyone else\'s', async () => {
    const current = manifestWith('ab12');
    const m = fakeManager([
      ...uploaded(current),
      { id: snowflake(NOW - 40 * DAY, 1), name: 'es_gpie_0000' }, // superseded, old
      { id: snowflake(NOW - 5 * DAY, 2), name: 'es_vhs_0000' }, // superseded, recent
      { id: snowflake(NOW - 400 * DAY, 3), name: 'my_logo' }, // the operator's own
    ]);
    const res = await syncKit(m, { manifest: current, png, prune: true, now: NOW });
    expect(res.deleted.map(e => e.name)).toEqual(['es_gpie_0000']);
    expect(m.emojis.map(e => e.name)).toEqual(expect.arrayContaining(['es_vhs_0000', 'my_logo', 'es_gpie_ab12']));
    expect(m.emojis.map(e => e.name)).not.toContain('es_gpie_0000');
    expect(PRUNE_MIN_AGE_MS).toBe(30 * DAY);
  });

  test('upload:false only reads', async () => {
    const m = fakeManager();
    const res = await syncKit(m, { manifest: manifestWith(), png, upload: false, now: NOW });
    expect(m.create).not.toHaveBeenCalled();
    expect(res.missing.length).toBe(codes.length);
  });

  test('one refused upload doesn\'t stop the rest, and the next sync uploads only it', async () => {
    let refuse = true;
    const m = fakeManager([], { failCreate: (name) => (refuse && name === 'es_garlic_ab12' ? new Error('Invalid image') : null) });
    const manifest = manifestWith();
    const first = await syncKit(m, { manifest, png, now: NOW });
    expect(first.failed).toEqual([{ code: 'garlic', message: 'Invalid image' }]);
    expect(first.missing).toEqual(['garlic']);
    expect(m.emojis.length).toBe(codes.length - 1);

    refuse = false;
    m.create.mockClear();
    const second = await syncKit(m, { manifest, png, now: NOW });
    expect(m.create).toHaveBeenCalledTimes(1);
    expect(m.create.mock.calls[0][0].name).toBe('es_garlic_ab12');
    expect(second.missing).toEqual([]);
  });

  test('a name another instance just uploaded is adopted, not duplicated', async () => {
    const m = fakeManager();
    // The create fails because someone else got there first
    m.create.mockImplementationOnce(async ({ name }) => {
      m.emojis.push({ id: snowflake(NOW, 999), name });
      throw new Error('Name already taken');
    });
    const res = await syncKit(m, { manifest: { coin: { hash: 'ab12' } }, png, now: NOW });
    expect(res.adopted).toEqual(['coin']);
    expect(res.resolved.get('coin').id).toBe(snowflake(NOW, 999));
    expect(m.emojis.filter(e => e.name === 'es_coin_ab12')).toHaveLength(1);
  });

  test('never goes past the application\'s emoji cap', async () => {
    const m = fakeManager([{ id: snowflake(NOW, 1), name: 'my_logo' }]);
    const res = await syncKit(m, { manifest: { coin: { hash: 'ab12' }, star: { hash: 'ab12' } }, png, cap: 2, now: NOW });
    expect(res.created).toEqual(['coin']);
    expect(res.failed).toEqual([{ code: 'star', message: 'the application already has 2 emojis' }]);
    expect(m.emojis).toHaveLength(2);
  });
});

describe('startEmojiKit', () => {
  const client = (manager) => ({ application: { emojis: manager } });
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  test('EMOJI_SYNC=off: no requests, plain emoji', async () => {
    const m = fakeManager();
    expect(await startEmojiKit(client(m), { mode: 'off', manifest: manifestWith() })).toBeNull();
    expect(m.fetch).not.toHaveBeenCalled();
    expect(liveKit().ready).toEqual({ bar: false, tick: false, icon: false });
  });

  test('everything uploaded: the kit is drawing custom emoji before startup continues', async () => {
    const manifest = manifestWith();
    const m = fakeManager(uploaded(manifest));
    await startEmojiKit(client(m), { mode: 'auto', manifest });
    expect(liveKit().ready).toEqual({ bar: true, tick: true, icon: true });
    expect(liveKit().e('coin')).toBe(`<:es_coin_ab12:${m.emojis.find(e => e.name === 'es_coin_ab12').id}>`);
    expect(m.create).not.toHaveBeenCalled();
  });

  test('a fresh install uploads in the background, then switches the kit on', async () => {
    const manifest = manifestWith();
    const m = fakeManager();
    await startEmojiKit(client(m), { mode: 'auto', manifest, png });
    // Startup didn't wait for the uploads; they finish on their own
    await new Promise(r => setTimeout(r, 0));
    for (let i = 0; i < 20 && !liveKit().ready.icon; i++) await new Promise(r => setTimeout(r, 5));
    expect(m.emojis).toHaveLength(codes.length);
    expect(liveKit().ready).toEqual({ bar: true, tick: true, icon: true });
  });

  test('no manifest built: plain emoji, no requests', async () => {
    const m = fakeManager();
    expect(await startEmojiKit(client(m), { mode: 'auto', manifest: null })).toBeNull();
    expect(m.fetch).not.toHaveBeenCalled();
  });
});

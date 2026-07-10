/**
 * Regression test for aiImageTracker.js calling the async loadGuildConfig()
 * without awaiting it.
 *
 * canGenerateImage(), recordImageGeneration(), getGuildImageStats(), and
 * getUserImageStats() all did `const config = loadGuildConfig(guildId)`
 * (no await), so `config` was always a pending Promise and every guild-
 * specific override (aiImages.enabled, permissions, rate limits, whitelist,
 * costPerImage) was silently ignored in favor of the hardcoded fallback
 * defaults — meaning a guild that disabled AI images, restricted them to
 * admins, or set custom limits had none of that enforced.
 *
 * Run with: npx jest tests/aiImageTracker.test.js --verbose
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { canGenerateImage, getGuildImageStats } from '../src/utils/aiImageTracker.js';
import { loadGuildConfig, saveGuildConfig } from '../src/utils/guildConfig.js';

const GUILD_ID = 'ai-image-tracker-test-guild';
const CONFIG_DIR = path.join(process.cwd(), 'guild_configs');

function cleanup() {
  const f = path.join(CONFIG_DIR, `${GUILD_ID}.json`);
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

beforeEach(cleanup);
afterEach(cleanup);

describe('canGenerateImage', () => {
  test('respects a guild that has disabled AI image generation entirely', async () => {
    const config = await loadGuildConfig(GUILD_ID);
    config.aiImages = { enabled: false, permissions: 'everyone' };
    await saveGuildConfig(GUILD_ID, config);

    const result = await canGenerateImage(GUILD_ID, 'some-user', false, false);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('disabled on this server');
  });

  test('respects a guild that restricts AI images to admins only', async () => {
    const config = await loadGuildConfig(GUILD_ID);
    config.aiImages = { enabled: true, permissions: 'admins' };
    await saveGuildConfig(GUILD_ID, config);

    const nonAdminResult = await canGenerateImage(GUILD_ID, 'regular-user', false, false);
    expect(nonAdminResult.allowed).toBe(false);

    const adminResult = await canGenerateImage(GUILD_ID, 'admin-user', true, false);
    expect(adminResult.allowed).toBe(true);
  });

  test('a guild whitelisted user bypasses limits, proving the guild-specific whitelist was read', async () => {
    const config = await loadGuildConfig(GUILD_ID);
    config.rateLimits.aiImages.whitelistedUsers = ['vip-user'];
    await saveGuildConfig(GUILD_ID, config);

    const result = await canGenerateImage(GUILD_ID, 'vip-user', false, false);

    expect(result.allowed).toBe(true);
    expect(result.whitelisted).toBe(true);
  });

  test('a guild with no saved config yet still allows by default (safe fallback)', async () => {
    const result = await canGenerateImage(GUILD_ID, 'some-user', false, false);
    expect(result.allowed).toBe(true);
  });
});

describe('getGuildImageStats', () => {
  test('reads the guild-specific daily limit instead of the hardcoded default', async () => {
    const config = await loadGuildConfig(GUILD_ID);
    config.rateLimits.aiImages.perGuildDailyLimit = 5;
    await saveGuildConfig(GUILD_ID, config);

    const stats = await getGuildImageStats(GUILD_ID);

    expect(stats.dailyLimit).toBe(5);
  });
});

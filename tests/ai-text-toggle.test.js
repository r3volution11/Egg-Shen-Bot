/**
 * Tests for the per-guild AI announcement-text switch.
 *
 * Before this existed, AI text was used whenever the operator had configured
 * an OPENAI_API_KEY — there was no way for an individual server to opt out.
 * Since one operator's instance can serve several guilds, the preference has
 * to be per guild.
 *
 * Two independent things decide whether AI text actually runs:
 *
 *   getAiTextEnabled(config)  the SERVER's preference (this file)
 *   isOpenAIAvailable()       the OPERATOR's API key
 *
 * Both must be true. Conflating them is the mistake to guard against: a server
 * owner who is not the operator would otherwise turn the flag on and see no
 * change, with nothing explaining why.
 *
 * Run with: npm test -- tests/ai-text-toggle.test.js
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { getAiTextEnabled, loadGuildConfig, saveGuildConfig } from '../src/utils/guildConfig.js';

const GUILD_ID = 'ai-text-toggle-test-guild';
const CONFIG_DIR = process.env.GUILD_CONFIGS_DIR || path.join(process.cwd(), 'guild_configs');

function cleanup() {
  const f = path.join(CONFIG_DIR, `${GUILD_ID}.json`);
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

beforeEach(cleanup);
afterEach(cleanup);

describe('getAiTextEnabled', () => {
  test('defaults to enabled for a config that predates the setting', () => {
    // There are no config migrations in this repo: every guild configured
    // before this key existed simply lacks it. Defaulting to false would
    // silently switch off a feature those servers were already using.
    expect(getAiTextEnabled({})).toBe(true);
    expect(getAiTextEnabled({ someOtherKey: 1 })).toBe(true);
  });

  test('only an explicit false turns it off', () => {
    expect(getAiTextEnabled({ aiText: { enabled: false } })).toBe(false);
    expect(getAiTextEnabled({ aiText: { enabled: true } })).toBe(true);
  });

  test('a missing or garbled value lands on the default', () => {
    // Configs are hand-editable, so a malformed value must not disable the
    // feature by accident.
    expect(getAiTextEnabled({ aiText: {} })).toBe(true);
    expect(getAiTextEnabled({ aiText: null })).toBe(true);
    expect(getAiTextEnabled({ aiText: 'no' })).toBe(true);
    expect(getAiTextEnabled(undefined)).toBe(true);
    expect(getAiTextEnabled(null)).toBe(true);
  });

  test('is independent of the AI *image* switch', () => {
    // Text costs a fraction of an image, so the two are deliberately separate
    // settings — turning images off must not take announcements with it.
    expect(getAiTextEnabled({ rateLimits: { aiImages: { enabled: false } } })).toBe(true);
    expect(getAiTextEnabled({ aiText: { enabled: false }, rateLimits: { aiImages: { enabled: true } } }))
      .toBe(false);
  });
});

describe('the setting round-trips through a saved config', () => {
  test('a new guild reads as enabled', async () => {
    expect(getAiTextEnabled(await loadGuildConfig(GUILD_ID))).toBe(true);
  });

  test('disabling it survives a reload', async () => {
    const config = await loadGuildConfig(GUILD_ID);
    config.aiText = { enabled: false };
    await saveGuildConfig(GUILD_ID, config);

    expect(getAiTextEnabled(await loadGuildConfig(GUILD_ID))).toBe(false);
  });

  test('re-enabling it survives a reload', async () => {
    const off = await loadGuildConfig(GUILD_ID);
    off.aiText = { enabled: false };
    await saveGuildConfig(GUILD_ID, off);

    const on = await loadGuildConfig(GUILD_ID);
    on.aiText.enabled = true;
    await saveGuildConfig(GUILD_ID, on);

    expect(getAiTextEnabled(await loadGuildConfig(GUILD_ID))).toBe(true);
  });

  test('one guild\'s setting does not affect another', async () => {
    const other = `${GUILD_ID}-second`;
    try {
      const config = await loadGuildConfig(GUILD_ID);
      config.aiText = { enabled: false };
      await saveGuildConfig(GUILD_ID, config);

      expect(getAiTextEnabled(await loadGuildConfig(other))).toBe(true);
    } finally {
      const f = path.join(CONFIG_DIR, `${other}.json`);
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
  });
});

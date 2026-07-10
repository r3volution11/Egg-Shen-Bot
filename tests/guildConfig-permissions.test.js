/**
 * Regression tests for canUseCommand()/updateCommandPermission() in guildConfig.js.
 *
 * Both functions previously hardcoded a short list of command names
 * ('movie', 'tv', 'episode', 'survey' for canUseCommand;  that list plus
 * 'game'/'boardgame'/'book' for updateCommandPermission) instead of checking
 * against defaultConfig.commandPermissions's actual keys. Net effect in
 * production: disabling /game, /boardgame, /book, /soundtrack, or /bracket
 * via /eggshen-config had zero effect on non-admins (canUseCommand always
 * fell through to `return true`), and toggling /soundtrack or /bracket
 * specifically always failed with "Failed to update command permissions"
 * (updateCommandPermission's hardcoded list didn't include them at all).
 *
 * Run with: npx jest tests/guildConfig-permissions.test.js --verbose
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { canUseCommand, updateCommandPermission, loadGuildConfig } from '../src/utils/guildConfig.js';

const GUILD_ID = 'guild-config-permissions-test-guild';
const CONFIG_DIR = path.join(process.cwd(), 'guild_configs');

function cleanup() {
  const f = path.join(CONFIG_DIR, `${GUILD_ID}.json`);
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

function makeMember({ isAdmin = false } = {}) {
  return {
    permissions: {
      has: (flag) => (isAdmin ? flag === 'Administrator' : false),
    },
  };
}

beforeEach(cleanup);
afterEach(cleanup);

describe('updateCommandPermission', () => {
  test.each(['game', 'boardgame', 'book', 'soundtrack', 'bracket', 'movie', 'tv', 'episode', 'survey'])(
    'accepts %s as a valid setting',
    async (setting) => {
      const result = await updateCommandPermission(GUILD_ID, setting, false);
      expect(result).toBe(true);

      const config = await loadGuildConfig(GUILD_ID);
      expect(config.commandPermissions[setting]).toBe(false);
    }
  );

  test('rejects an unknown setting name', async () => {
    const result = await updateCommandPermission(GUILD_ID, 'not-a-real-setting', false);
    expect(result).toBe(false);
  });

  test('the master "enabled" switch still works', async () => {
    const result = await updateCommandPermission(GUILD_ID, 'enabled', false);
    expect(result).toBe(true);
    expect((await loadGuildConfig(GUILD_ID)).commandPermissions.enabled).toBe(false);
  });
});

describe('loadGuildConfig default isolation', () => {
  const OTHER_GUILD_ID = 'guild-config-permissions-test-guild-other';

  function cleanupOther() {
    const f = path.join(CONFIG_DIR, `${OTHER_GUILD_ID}.json`);
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }

  beforeEach(cleanupOther);
  afterEach(cleanupOther);

  test('updating one never-configured guild does not mutate the default seen by another', async () => {
    // Previously loadGuildConfig()'s no-file fallback returned `{ ...defaultConfig }`,
    // a shallow copy — nested objects like commandPermissions were shared by
    // reference across every guild that hadn't saved a config yet. Disabling a
    // toggle for GUILD_ID here would silently disable it for OTHER_GUILD_ID too.
    await updateCommandPermission(GUILD_ID, 'bracket', false);

    const otherConfig = await loadGuildConfig(OTHER_GUILD_ID);
    expect(otherConfig.commandPermissions.bracket).toBe(true);
  });
});

describe('canUseCommand', () => {
  test.each(['game', 'boardgame', 'book', 'soundtrack', 'bracket'])(
    'enforces the toggle for %s (previously always returned true regardless)',
    async (commandName) => {
      const member = makeMember({ isAdmin: false });
      await updateCommandPermission(GUILD_ID, commandName, false);

      const allowed = await canUseCommand(GUILD_ID, member, commandName);

      expect(allowed).toBe(false);
    }
  );

  test.each(['game', 'boardgame', 'book', 'soundtrack', 'bracket', 'movie', 'tv', 'episode', 'survey'])(
    'allows %s by default (toggle defaults to enabled)',
    async (commandName) => {
      const member = makeMember({ isAdmin: false });
      const allowed = await canUseCommand(GUILD_ID, member, commandName);
      expect(allowed).toBe(true);
    }
  );

  test('admins can always use a disabled command', async () => {
    const admin = makeMember({ isAdmin: true });
    await updateCommandPermission(GUILD_ID, 'soundtrack', false);

    expect(await canUseCommand(GUILD_ID, admin, 'soundtrack')).toBe(true);
  });

  test('a command with no configurable toggle (e.g. eggshen-help) is always allowed', async () => {
    const member = makeMember({ isAdmin: false });
    expect(await canUseCommand(GUILD_ID, member, 'eggshen-help')).toBe(true);
  });

  test('the master switch disables everything for non-admins', async () => {
    const member = makeMember({ isAdmin: false });
    await updateCommandPermission(GUILD_ID, 'enabled', false);

    expect(await canUseCommand(GUILD_ID, member, 'movie')).toBe(false);
    expect(await canUseCommand(GUILD_ID, member, 'eggshen-help')).toBe(false);
  });
});

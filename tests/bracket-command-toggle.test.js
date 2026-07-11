/**
 * Regression test for /bracket never checking commandPermissions.bracket.
 *
 * commandPermissions.bracket exists in guildConfig.js's defaultConfig and is
 * toggleable via /eggshen-config commands toggle, but bracket.js's execute()
 * previously only had an inline Administrator/ModerateMembers check gating a
 * subset of management subcommands — it never called canUseCommand at all.
 * Toggling "Bracket Command" off did nothing; the command remained fully
 * usable regardless. Fixed by adding a canUseCommand check at the very top
 * of execute(), applying to every subcommand (including read-only ones like
 * `help`), not just the management subset.
 *
 * Run with: npx jest tests/bracket-command-toggle.test.js --verbose
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { execute } from '../src/commands/bracket.js';
import { updateCommandPermission } from '../src/utils/guildConfig.js';

const GUILD_ID = 'bracket-command-toggle-test-guild';
const CONFIG_DIR = path.join(process.cwd(), 'guild_configs');

function cleanup() {
  const f = path.join(CONFIG_DIR, `${GUILD_ID}.json`);
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

beforeEach(cleanup);
afterEach(cleanup);

/**
 * A member mock whose permissions.has() supports both calling conventions
 * used across this codebase: bracket.js's own local check calls it with
 * discord.js's PermissionFlagsBits (bigint) values, while canUseCommand's
 * internal isAdmin() calls it with plain permission-name strings.
 */
function makeMember({ isAdmin = false } = {}) {
  return {
    permissions: {
      has: (flag) => {
        if (!isAdmin) return false;
        return flag === 'Administrator' || String(flag) === '8';
      },
    },
  };
}

function makeInteraction({ subcommand, isAdmin = false }) {
  return {
    guildId: GUILD_ID,
    channelId: 'channel-1',
    options: {
      getSubcommand: () => subcommand,
      getString: () => null,
      getInteger: () => null,
    },
    member: makeMember({ isAdmin }),
    reply: jest.fn().mockResolvedValue(undefined),
    deferReply: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
  };
}

describe('/bracket respects the commandPermissions.bracket toggle', () => {
  test('a non-admin is blocked from a read-only subcommand when bracket is disabled', async () => {
    await updateCommandPermission(GUILD_ID, 'bracket', false);
    const interaction = makeInteraction({ subcommand: 'help', isAdmin: false });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('currently disabled') })
    );
  });

  test('an admin can still use /bracket even when disabled for regular users', async () => {
    await updateCommandPermission(GUILD_ID, 'bracket', false);
    const interaction = makeInteraction({ subcommand: 'help', isAdmin: true });

    await execute(interaction);

    expect(interaction.reply).not.toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('currently disabled') })
    );
    // Admin bypass reaches handleHelp, which replies with the guide embed.
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: expect.anything() })
    );
  });

  test('/bracket is unaffected when left at its default (enabled) setting', async () => {
    const interaction = makeInteraction({ subcommand: 'help', isAdmin: false });

    await execute(interaction);

    expect(interaction.reply).not.toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('currently disabled') })
    );
  });
});

/**
 * Tests for /eggshen-help's guild-aware command filtering.
 *
 * Previously the help embed was fully static — it listed every command
 * regardless of what was actually enabled for the server it ran in. Now it
 * checks the same commandPermissions toggles (via canUseCommand) and the
 * separate aiImages config block (mirroring canGenerateImage's own fallback)
 * that the commands themselves already enforce, so help never claims a
 * command is available when it actually isn't.
 *
 * Run with: npx jest tests/help-command.test.js --verbose
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { execute } from '../src/commands/help.js';
import { updateCommandPermission, loadGuildConfig, saveGuildConfig } from '../src/utils/guildConfig.js';

const GUILD_ID = 'help-command-test-guild';
const CONFIG_DIR = path.join(process.cwd(), 'guild_configs');

function cleanup() {
  const f = path.join(CONFIG_DIR, `${GUILD_ID}.json`);
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

beforeEach(cleanup);
afterEach(cleanup);

function makeMember({ isAdmin = false } = {}) {
  return {
    permissions: {
      has: (flag) => (isAdmin ? flag === 'Administrator' : false),
    },
  };
}

function makeInteraction({ isAdmin = false } = {}) {
  return {
    guildId: GUILD_ID,
    member: makeMember({ isAdmin }),
    reply: async () => undefined,
  };
}

async function runHelpAndGetEmbed(interaction) {
  let captured;
  interaction.reply = async (payload) => {
    captured = payload;
  };
  await execute(interaction);
  return captured.embeds[0];
}

function fieldNames(embed) {
  return embed.data.fields.map(f => f.name);
}

function fieldValue(embed, name) {
  return embed.data.fields.find(f => f.name === name)?.value;
}

describe('/eggshen-help with default (unconfigured) guild', () => {
  test('shows every category and every command', async () => {
    const embed = await runHelpAndGetEmbed(makeInteraction());

    const names = fieldNames(embed);
    expect(names).toContain('🎬 Movies & TV Shows');
    expect(names).toContain('🎮 Games & Entertainment');
    expect(names).toContain('🎲 Random & Discovery');
    expect(names).toContain('🏆 Tournaments & Polls');
    expect(names).toContain('🎨 AI Image Generation');
    expect(names).toContain('⏱️ Watch Party Tools');

    expect(fieldValue(embed, '🎬 Movies & TV Shows')).toContain('/movie');
    expect(fieldValue(embed, '🏆 Tournaments & Polls')).toContain('/bracket');
    expect(fieldValue(embed, '🎨 AI Image Generation')).toContain('/image');
  });
});

describe('/eggshen-help hides individually disabled commands', () => {
  test('disabling /movie hides only that line, keeps the rest of the category', async () => {
    await updateCommandPermission(GUILD_ID, 'movie', false);

    const embed = await runHelpAndGetEmbed(makeInteraction());
    const value = fieldValue(embed, '🎬 Movies & TV Shows');

    expect(value).not.toContain('/movie**');
    expect(value).toContain('/tv');
    expect(value).toContain('/episode');
    expect(value).toContain('/episode-list');
    expect(value).toContain('/similar');
    expect(value).toContain('/watched');
  });

  test('disabling every command in a category omits that entire category field', async () => {
    await updateCommandPermission(GUILD_ID, 'game', false);
    await updateCommandPermission(GUILD_ID, 'boardgame', false);
    await updateCommandPermission(GUILD_ID, 'book', false);
    await updateCommandPermission(GUILD_ID, 'soundtrack', false);

    const embed = await runHelpAndGetEmbed(makeInteraction());

    expect(fieldNames(embed)).not.toContain('🎮 Games & Entertainment');
  });

  test('disabling /bracket hides its line but keeps /survey visible', async () => {
    await updateCommandPermission(GUILD_ID, 'bracket', false);

    const embed = await runHelpAndGetEmbed(makeInteraction());
    const value = fieldValue(embed, '🏆 Tournaments & Polls');

    expect(value).not.toContain('/bracket');
    expect(value).toContain('/survey');
  });
});

describe('/eggshen-help with the master switch disabled', () => {
  test('hides all toggle-backed commands but keeps ungated commands visible', async () => {
    await updateCommandPermission(GUILD_ID, 'enabled', false);

    const embed = await runHelpAndGetEmbed(makeInteraction());

    // Games & Entertainment and Tournaments & Polls have no ungated
    // commands, so they disappear entirely once every command in them is
    // toggle-gated off.
    expect(fieldNames(embed)).not.toContain('🎮 Games & Entertainment');
    expect(fieldNames(embed)).not.toContain('🏆 Tournaments & Polls');

    // Movies & TV Shows mixes gated (movie/tv/episode) and ungated
    // (episode-list/similar/watched) commands, so the category itself stays
    // visible, but with only the ungated lines present.
    const moviesAndTV = fieldValue(embed, '🎬 Movies & TV Shows');
    expect(moviesAndTV).not.toContain('/movie**');
    expect(moviesAndTV).not.toContain('/tv**');
    expect(moviesAndTV).not.toContain('/episode**');
    expect(moviesAndTV).toContain('/episode-list');
    expect(moviesAndTV).toContain('/similar');
    expect(moviesAndTV).toContain('/watched');

    // Ungated commands stay visible.
    expect(fieldNames(embed)).toContain('⏱️ Watch Party Tools');
    expect(fieldNames(embed)).toContain('🎲 Random & Discovery');
  });
});

describe('/eggshen-help and AI image visibility', () => {
  test('disabling aiImages hides only /image, keeps /potion visible in the same category', async () => {
    const config = await loadGuildConfig(GUILD_ID);
    config.aiImages = { enabled: false, permissions: 'everyone' };
    await saveGuildConfig(GUILD_ID, config);

    const embed = await runHelpAndGetEmbed(makeInteraction());
    const value = fieldValue(embed, '🎨 AI Image Generation');

    expect(value).toBeDefined();
    expect(value).not.toContain('/image');
    expect(value).toContain('/potion');
  });
});

describe('/eggshen-help admin section', () => {
  test('is hidden for non-admins', async () => {
    const embed = await runHelpAndGetEmbed(makeInteraction({ isAdmin: false }));
    expect(fieldNames(embed)).not.toContain('⚙️ Admin & Moderation');
  });

  test('is shown for admins', async () => {
    const embed = await runHelpAndGetEmbed(makeInteraction({ isAdmin: true }));
    expect(fieldNames(embed)).toContain('⚙️ Admin & Moderation');
  });
});

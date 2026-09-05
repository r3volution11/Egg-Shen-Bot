/**
 * Tests for /eggshen-config-website — sets this guild's website URL and
 * named color theme (moved out of /eggshen-config-events event-requests,
 * since neither setting is actually event-request-specific: theme also
 * drives quotes-admin links, and the website itself may grow beyond just
 * the event-request form).
 *
 * Run with: npx jest tests/eggshen-config-website.test.js --verbose
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const GUILD_ID = 'eggshen-config-website-test-guild';
const GUILD_CONFIG_FILE = path.join(process.cwd(), 'guild_configs', `${GUILD_ID}.json`);

function cleanup() {
  if (fs.existsSync(GUILD_CONFIG_FILE)) fs.rmSync(GUILD_CONFIG_FILE);
}

beforeEach(cleanup);
afterEach(cleanup);

function makeInteraction({ subcommand, options = {}, isAdmin = true }) {
  const state = {};
  return {
    guildId: GUILD_ID,
    member: {
      permissions: {
        has: (flag) => (isAdmin ? flag === 'Administrator' : false),
      },
    },
    options: {
      getSubcommand: () => subcommand,
      getString: (name) => options[name] ?? null,
    },
    reply: async (payload) => { state.reply = payload; },
    get lastReply() { return state.reply; },
  };
}

describe('/eggshen-config-website url', () => {
  test('a non-admin is rejected', async () => {
    const { execute } = await import('../src/commands/eggshen-config-website.js');
    const interaction = makeInteraction({ subcommand: 'url', options: { url: 'https://example.com' }, isAdmin: false });

    await execute(interaction);

    expect(interaction.lastReply.content).toContain('Administrator');
  });

  test('sets the website URL', async () => {
    const { execute } = await import('../src/commands/eggshen-config-website.js');
    const interaction = makeInteraction({ subcommand: 'url', options: { url: 'https://example.com' } });

    await execute(interaction);

    expect(interaction.lastReply.content).toContain('https://example.com');

    const { loadGuildConfig } = await import('../src/utils/guildConfig.js');
    const config = await loadGuildConfig(GUILD_ID);
    expect(config.website.url).toBe('https://example.com');
  });
});

describe('/eggshen-config-website theme', () => {
  test('sets the theme when given a valid theme name', async () => {
    const { execute } = await import('../src/commands/eggshen-config-website.js');
    const interaction = makeInteraction({ subcommand: 'theme', options: { name: 'default' } });

    await execute(interaction);

    expect(interaction.lastReply.content).toContain('default');

    const { loadGuildConfig } = await import('../src/utils/guildConfig.js');
    const config = await loadGuildConfig(GUILD_ID);
    expect(config.website.theme).toBe('default');
  });

  test('rejects an unknown theme name without saving it', async () => {
    const { execute } = await import('../src/commands/eggshen-config-website.js');
    const interaction = makeInteraction({ subcommand: 'theme', options: { name: 'not-a-real-theme' } });

    await execute(interaction);

    expect(interaction.lastReply.content).toContain('not-a-real-theme');

    const { loadGuildConfig } = await import('../src/utils/guildConfig.js');
    const config = await loadGuildConfig(GUILD_ID);
    expect(config.website?.theme).not.toBe('not-a-real-theme');
  });
});

describe('/eggshen-config-website view', () => {
  test('shows the configured URL and theme', async () => {
    const { saveGuildConfig } = await import('../src/utils/guildConfig.js');
    await saveGuildConfig(GUILD_ID, { website: { url: 'https://example.com', theme: 'shudder' } });

    const { execute } = await import('../src/commands/eggshen-config-website.js');
    const interaction = makeInteraction({ subcommand: 'view' });

    await execute(interaction);

    const fields = interaction.lastReply.embeds[0].data.fields;
    expect(fields.find(f => f.name === 'Website URL').value).toBe('https://example.com');
    expect(fields.find(f => f.name === 'Theme').value).toBe('shudder');
  });

  test('shows defaults when nothing is configured', async () => {
    const { execute } = await import('../src/commands/eggshen-config-website.js');
    const interaction = makeInteraction({ subcommand: 'view' });

    await execute(interaction);

    const fields = interaction.lastReply.embeds[0].data.fields;
    expect(fields.find(f => f.name === 'Website URL').value).toBe('Not set');
    expect(fields.find(f => f.name === 'Theme').value).toBe('default');
  });
});

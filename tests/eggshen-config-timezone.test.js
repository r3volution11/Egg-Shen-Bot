/**
 * Tests for /eggshen-config event-requests timezone — the per-server IANA
 * timezone setting the event-request Edit modal's Start/End Time fields use
 * (default UTC), plus its autocomplete handler over the full IANA timezone
 * list.
 *
 * Exercises execute()/autocomplete() directly with a minimal mock
 * interaction, since no existing test file covers eggshen-config.js's
 * subcommand business logic (the one existing file,
 * eggshen-config-command-refs.test.js, only checks schema/doc-reference
 * consistency). Uses a real temp guild_configs/{guildId}.json file
 * (write/cleanup), matching the convention already established in
 * tests/eventRequestApproval.test.js, rather than introducing a new
 * module-mocking pattern for guildConfig.js.
 *
 * Run with: npx jest tests/eggshen-config-timezone.test.js --verbose
 */

import { describe, test, expect, afterEach, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { execute, autocomplete } from '../src/commands/eggshen-config.js';
import { loadGuildConfig } from '../src/utils/guildConfig.js';

const GUILD_ID = 'eggshen-config-timezone-test-guild';
const GUILD_CONFIG_FILE = path.join(process.cwd(), 'guild_configs', `${GUILD_ID}.json`);

afterEach(() => {
  if (fs.existsSync(GUILD_CONFIG_FILE)) fs.unlinkSync(GUILD_CONFIG_FILE);
});

function makeInteraction({ group, subcommand, timezone, focusedValue, isAdmin = true }) {
  return {
    guildId: GUILD_ID,
    member: {
      permissions: {
        has: (flag) => (isAdmin ? flag === 'Administrator' : false),
      },
    },
    options: {
      getSubcommandGroup: () => group,
      getSubcommand: () => subcommand,
      getString: (name) => (name === 'timezone' ? timezone : null),
      getFocused: () => focusedValue ?? '',
    },
    reply: jest.fn().mockResolvedValue(undefined),
    respond: jest.fn().mockResolvedValue(undefined),
  };
}

describe('/eggshen-config event-requests timezone', () => {
  test('a valid IANA zone saves correctly and replies with a success message', async () => {
    const interaction = makeInteraction({ group: 'event-requests', subcommand: 'timezone', timezone: 'America/New_York' });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('America/New_York'),
        ephemeral: true,
      })
    );

    const config = await loadGuildConfig(GUILD_ID);
    expect(config.eventRequests.timezone).toBe('America/New_York');
  });

  test('"UTC" is accepted even though it is not itself in Intl.supportedValuesOf', async () => {
    const interaction = makeInteraction({ group: 'event-requests', subcommand: 'timezone', timezone: 'UTC' });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('UTC') })
    );
    const config = await loadGuildConfig(GUILD_ID);
    expect(config.eventRequests.timezone).toBe('UTC');
  });

  test('an invalid timezone string is rejected and does not save', async () => {
    const interaction = makeInteraction({ group: 'event-requests', subcommand: 'timezone', timezone: 'Not/AZone' });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('❌') })
    );

    // Default config (never saved) has timezone: 'UTC' — the rejected value
    // must never have overwritten it.
    const config = await loadGuildConfig(GUILD_ID);
    expect(config.eventRequests.timezone).toBe('UTC');
  });

  test('a case-mismatched timezone (not an exact match) is rejected', async () => {
    const interaction = makeInteraction({ group: 'event-requests', subcommand: 'timezone', timezone: 'america/new_york' });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('❌') })
    );
  });

  test('a non-admin is rejected before any timezone logic runs', async () => {
    const interaction = makeInteraction({ group: 'event-requests', subcommand: 'timezone', timezone: 'America/New_York', isAdmin: false });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('permissions') })
    );
    const config = await loadGuildConfig(GUILD_ID);
    expect(config.eventRequests.timezone).toBe('UTC'); // still the unsaved default
  });
});

describe('/eggshen-config event-requests view includes the Timezone field', () => {
  test('shows "UTC" when no timezone has been configured', async () => {
    const interaction = makeInteraction({ group: 'event-requests', subcommand: 'view' });

    await execute(interaction);

    const replyArg = interaction.reply.mock.calls[0][0];
    const embed = replyArg.embeds[0];
    const timezoneField = embed.data.fields.find(f => f.name === 'Timezone');
    expect(timezoneField.value).toBe('UTC');
  });

  test('shows the configured zone once one has been set', async () => {
    await execute(makeInteraction({ group: 'event-requests', subcommand: 'timezone', timezone: 'America/Chicago' }));

    const viewInteraction = makeInteraction({ group: 'event-requests', subcommand: 'view' });
    await execute(viewInteraction);

    const replyArg = viewInteraction.reply.mock.calls[0][0];
    const embed = replyArg.embeds[0];
    const timezoneField = embed.data.fields.find(f => f.name === 'Timezone');
    expect(timezoneField.value).toBe('America/Chicago');
  });
});

describe('eggshen-config.js autocomplete', () => {
  test('returns matching IANA zones for the event-requests timezone subcommand, capped at 25', async () => {
    const interaction = makeInteraction({ group: 'event-requests', subcommand: 'timezone', focusedValue: 'america/new' });

    await autocomplete(interaction);

    expect(interaction.respond).toHaveBeenCalledTimes(1);
    const matches = interaction.respond.mock.calls[0][0];
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.length).toBeLessThanOrEqual(25);
    expect(matches.every(m => m.name === m.value)).toBe(true);
    expect(matches.some(m => m.value === 'America/New_York')).toBe(true);
  });

  test('is case-insensitive', async () => {
    const interaction = makeInteraction({ group: 'event-requests', subcommand: 'timezone', focusedValue: 'AMERICA/NEW' });

    await autocomplete(interaction);

    const matches = interaction.respond.mock.calls[0][0];
    expect(matches.some(m => m.value === 'America/New_York')).toBe(true);
  });

  test('an unrelated subcommand/group responds with an empty list, not timezone suggestions', async () => {
    const interaction = makeInteraction({ group: 'settings', subcommand: 'view', focusedValue: 'america' });

    await autocomplete(interaction);

    expect(interaction.respond).toHaveBeenCalledWith([]);
  });
});

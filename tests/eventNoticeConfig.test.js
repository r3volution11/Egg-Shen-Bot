/**
 * Tests for the /eggshen-config event-requests event-notice subcommand —
 * toggling the member-facing "New Watch Party Scheduled" notice on/off and
 * setting its target channel. Off by default: Discord's own scheduled-event
 * creation already notifies interested members on its own, so this is only
 * for servers that want extra channel-level visibility (see
 * postEventCreatedNotice in eventRequestApproval.js, tested separately in
 * tests/eventRequestApproval.test.js).
 *
 * Uses the real guildConfig.js module (no mocking) against a disposable
 * per-test guild config file, matching the pattern already established in
 * tests/eventRequestApproval.test.js — the mocked-isAdmin pattern used
 * elsewhere in tests/event-request-system.test.js is a known-broken
 * pre-existing pattern (isAdmin mock mismatch) that this avoids entirely.
 *
 * Run with: npx jest tests/eventNoticeConfig.test.js --verbose
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { execute } from '../src/commands/eggshen-config.js';
import { loadGuildConfig } from '../src/utils/guildConfig.js';

const GUILD_ID = 'event-notice-config-test-guild';
const GUILD_CONFIG_FILE = path.join(process.cwd(), 'guild_configs', `${GUILD_ID}.json`);

function cleanup() {
  if (fs.existsSync(GUILD_CONFIG_FILE)) fs.unlinkSync(GUILD_CONFIG_FILE);
}

beforeEach(cleanup);
afterEach(cleanup);

function makeInteraction({ enabled = null, channel = null } = {}) {
  return {
    guildId: GUILD_ID,
    member: { permissions: { has: () => true } },
    options: {
      getSubcommandGroup: () => 'event-requests',
      getSubcommand: () => 'event-notice',
      getBoolean: jest.fn(() => enabled),
      getChannel: jest.fn(() => channel),
    },
    reply: jest.fn().mockResolvedValue(undefined),
    guild: { name: 'Test Server' },
  };
}

describe('/eggshen-config event-requests event-notice', () => {
  test('rejects when neither enabled nor channel is provided', async () => {
    const interaction = makeInteraction();

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('Provide `enabled`, `channel`, or both') })
    );
  });

  test('enabling with a channel persists both and confirms the notice will post', async () => {
    const interaction = makeInteraction({ enabled: true, channel: { id: 'notice-channel-1' } });

    await execute(interaction);

    const config = await loadGuildConfig(GUILD_ID);
    expect(config.eventRequests.eventCreatedNotice.enabled).toBe(true);
    expect(config.eventRequests.eventCreatedNotice.channel).toBe('notice-channel-1');

    const replyContent = interaction.reply.mock.calls[0][0].content;
    expect(replyContent).toContain('notice-channel-1');
  });

  test('enabling without ever setting a channel warns that nothing will post yet', async () => {
    const interaction = makeInteraction({ enabled: true });

    await execute(interaction);

    const replyContent = interaction.reply.mock.calls[0][0].content;
    expect(replyContent).toContain('no channel is configured yet');
  });

  test('disabling leaves a previously-set channel in config but reports off', async () => {
    const enableInteraction = makeInteraction({ enabled: true, channel: { id: 'notice-channel-1' } });
    await execute(enableInteraction);

    const disableInteraction = makeInteraction({ enabled: false });
    await execute(disableInteraction);

    const config = await loadGuildConfig(GUILD_ID);
    expect(config.eventRequests.eventCreatedNotice.enabled).toBe(false);
    expect(config.eventRequests.eventCreatedNotice.channel).toBe('notice-channel-1');

    const replyContent = disableInteraction.reply.mock.calls[0][0].content;
    expect(replyContent).toContain('No notice will be posted');
  });

  test('setting only the channel without touching enabled leaves enabled at its current value', async () => {
    const channelOnlyInteraction = makeInteraction({ channel: { id: 'notice-channel-2' } });

    await execute(channelOnlyInteraction);

    const config = await loadGuildConfig(GUILD_ID);
    expect(config.eventRequests.eventCreatedNotice.enabled).toBe(false);
    expect(config.eventRequests.eventCreatedNotice.channel).toBe('notice-channel-2');
  });

  test('defaults to off with no channel for a guild that has never configured it', async () => {
    const config = await loadGuildConfig(GUILD_ID);
    expect(config.eventRequests.eventCreatedNotice.enabled).toBe(false);
    expect(config.eventRequests.eventCreatedNotice.channel).toBeNull();
  });
});

/**
 * Tests for the shared event-request approval logic in
 * src/utils/eventRequestApproval.js, extracted so it could be reused both
 * by the Approve buttons (buttonHandler.js) and by saving an edit
 * (index.js), which now auto-approves a request as soon as a moderator
 * saves a title/description edit instead of requiring a separate Approve
 * click afterward.
 *
 * Also covers postApprovalAnnouncement: approving/denying a request used to
 * only silently edit the original request message in place — easy for
 * other moderators to miss if they weren't already looking at that
 * specific (possibly old) message. It now also posts a fresh message to the
 * moderation channel announcing who approved/denied it and why/what
 * happened, so it shows up as new channel activity everyone actually sees.
 *
 * Run with: npx jest tests/eventRequestApproval.test.js --verbose
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import {
  createScheduledEventFromRequest,
  buildApprovedEmbed,
  cleanupEventRequestState,
  postApprovalAnnouncement,
} from '../src/utils/eventRequestApproval.js';
import { loadGuildConfig, saveGuildConfig } from '../src/utils/guildConfig.js';

const REQUESTS_FILE = path.join(process.cwd(), 'pending_event_requests.json');
const SELECTIONS_FILE = path.join(process.cwd(), 'pending_event_channel_selections.json');
const GUILD_ID = 'event-request-approval-test-guild';
const GUILD_CONFIG_FILE = path.join(process.cwd(), 'guild_configs', `${GUILD_ID}.json`);

function cleanup() {
  if (fs.existsSync(REQUESTS_FILE)) fs.unlinkSync(REQUESTS_FILE);
  if (fs.existsSync(SELECTIONS_FILE)) fs.unlinkSync(SELECTIONS_FILE);
  if (fs.existsSync(GUILD_CONFIG_FILE)) fs.unlinkSync(GUILD_CONFIG_FILE);
  delete global.eventRequests;
  delete global.eventChannelSelections;
}

beforeEach(cleanup);
afterEach(cleanup);

function makeGuild() {
  return {
    channels: {
      cache: new Map([
        ['text-1', { id: 'text-1' }],
        ['voice-1', { id: 'voice-1' }],
      ]),
    },
    scheduledEvents: {
      create: jest.fn().mockResolvedValue({ id: 'discord-event-1', url: 'https://discord.com/events/discord-event-1' }),
    },
  };
}

function makeRequestData(overrides = {}) {
  return {
    title: 'Movie Night',
    description: 'Watching a movie together',
    startTime: new Date().toISOString(),
    endTime: null,
    channelId: 'text-1',
    voiceChannelId: null,
    submitterDiscordId: 'submitter-1',
    ...overrides,
  };
}

describe('createScheduledEventFromRequest', () => {
  test('creates a text-only event when no voice channel is set', async () => {
    const guild = makeGuild();
    const requestData = makeRequestData();

    const { scheduledEvent, useVoiceChannel } = await createScheduledEventFromRequest({
      guild, requestId: 'req-1', requestData, approvalType: 'full',
    });

    expect(useVoiceChannel).toBeFalsy();
    expect(guild.scheduledEvents.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Movie Night', entityType: 3 })
    );
    expect(scheduledEvent.id).toBe('discord-event-1');
  });

  test('creates a voice+text event when approvalType is "both" and a voice channel is set', async () => {
    const guild = makeGuild();
    const requestData = makeRequestData({ voiceChannelId: 'voice-1' });

    const { useVoiceChannel } = await createScheduledEventFromRequest({
      guild, requestId: 'req-1', requestData, approvalType: 'both',
    });

    expect(useVoiceChannel).toBeTruthy();
    expect(guild.scheduledEvents.create).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'voice-1', entityType: 2 })
    );
  });

  test('approvalType "full" with a voice channel set also creates a voice+text event', async () => {
    // Auto-approve-on-save uses 'full' when there's no voice channel and
    // 'both' when there is one, but createScheduledEventFromRequest itself
    // treats 'full' as voice-eligible too (matching the original inline
    // approve_event_ behavior) — confirm that contract explicitly.
    const guild = makeGuild();
    const requestData = makeRequestData({ voiceChannelId: 'voice-1' });

    const { useVoiceChannel } = await createScheduledEventFromRequest({
      guild, requestId: 'req-1', requestData, approvalType: 'full',
    });

    expect(useVoiceChannel).toBeTruthy();
  });

  test('approvalType "text" never creates a voice channel event even if one is set', async () => {
    const guild = makeGuild();
    const requestData = makeRequestData({ voiceChannelId: 'voice-1' });

    const { useVoiceChannel } = await createScheduledEventFromRequest({
      guild, requestId: 'req-1', requestData, approvalType: 'text',
    });

    expect(useVoiceChannel).toBeFalsy();
  });
});

describe('buildApprovedEmbed', () => {
  test('sets the approved title, green color, and approver footer', () => {
    const original = { title: '🎬 New Event Request', description: '**Movie Night**', footer: { text: 'Guild: Test Server' } };

    const embed = buildApprovedEmbed(original, { approvedByTag: 'Mod#0001', approvalType: 'full' });

    expect(embed.data.title).toBe('✅ Event Request Approved');
    expect(embed.data.color).toBe(0x00FF00);
    expect(embed.data.footer.text).toContain('Approved by Mod#0001');
  });

  test('labels "both" and "text" approval types distinctly', () => {
    const original = { title: 't', footer: {} };

    const both = buildApprovedEmbed(original, { approvedByTag: 'Mod', approvalType: 'both' });
    const text = buildApprovedEmbed(original, { approvedByTag: 'Mod', approvalType: 'text' });

    expect(both.data.title).toContain('(Both Channels)');
    expect(text.data.title).toContain('(Text Channel Only)');
  });
});

describe('cleanupEventRequestState', () => {
  test('removes the request and its channel selection, and persists both', async () => {
    global.eventRequests = new Map([['req-1', makeRequestData()]]);
    global.eventChannelSelections = new Map([['guild-1_req-1', { textChannelId: 'text-1' }]]);

    await cleanupEventRequestState({ guildId: 'guild-1', requestId: 'req-1' });

    expect(global.eventRequests.has('req-1')).toBe(false);
    expect(global.eventChannelSelections.has('guild-1_req-1')).toBe(false);

    // Persisted to disk too, not just in-memory.
    const savedRequests = JSON.parse(fs.readFileSync(REQUESTS_FILE, 'utf8'));
    expect(savedRequests['req-1']).toBeUndefined();
  });
});

describe('postApprovalAnnouncement', () => {
  function makeChannel() {
    return { send: jest.fn().mockResolvedValue(undefined) };
  }

  test('posts an approval announcement mentioning who approved it and a link to the event', async () => {
    const channel = makeChannel();

    await postApprovalAnnouncement(channel, {
      outcome: 'approved',
      title: 'Movie Night',
      actorTag: 'Mod#0001',
      scheduledEvent: { url: 'https://discord.com/events/discord-event-1' },
    });

    expect(channel.send).toHaveBeenCalledTimes(1);
    const description = channel.send.mock.calls[0][0].embeds[0].data.description;
    expect(description).toContain('Movie Night');
    expect(description).toContain('Mod#0001');
    expect(description).toContain('https://discord.com/events/discord-event-1');
    expect(description).toContain('approved');
  });

  test('posts a denial announcement including the reason when one was given', async () => {
    const channel = makeChannel();

    await postApprovalAnnouncement(channel, {
      outcome: 'denied',
      title: 'Movie Night',
      actorTag: 'Mod#0001',
      reason: 'Wrong date, please resubmit',
    });

    const description = channel.send.mock.calls[0][0].embeds[0].data.description;
    expect(description).toContain('denied');
    expect(description).toContain('Mod#0001');
    expect(description).toContain('Wrong date, please resubmit');
  });

  test('posts a denial announcement without a reason line when none was given', async () => {
    const channel = makeChannel();

    await postApprovalAnnouncement(channel, {
      outcome: 'denied',
      title: 'Movie Night',
      actorTag: 'Mod#0001',
      reason: null,
    });

    const description = channel.send.mock.calls[0][0].embeds[0].data.description;
    expect(description).not.toContain('Reason:');
  });

  test('does nothing (no throw) when no channel is available', async () => {
    await expect(
      postApprovalAnnouncement(null, { outcome: 'approved', title: 't', actorTag: 'Mod' })
    ).resolves.not.toThrow();
  });

  test('a channel.send failure is swallowed, not thrown', async () => {
    const channel = { send: jest.fn().mockRejectedValue(new Error('Missing Access')) };

    await expect(
      postApprovalAnnouncement(channel, { outcome: 'approved', title: 't', actorTag: 'Mod', scheduledEvent: { url: 'x' } })
    ).resolves.not.toThrow();
  });

  test('posts by default when a guild has no saved config yet', async () => {
    const channel = makeChannel();

    await postApprovalAnnouncement(channel, {
      guildId: GUILD_ID,
      outcome: 'approved',
      title: 't',
      actorTag: 'Mod',
      scheduledEvent: { url: 'x' },
    });

    expect(channel.send).toHaveBeenCalledTimes(1);
  });

  test('does not post when eventRequests.announceDecisions is set to false', async () => {
    const config = await loadGuildConfig(GUILD_ID);
    config.eventRequests = { ...config.eventRequests, announceDecisions: false };
    await saveGuildConfig(GUILD_ID, config);

    const channel = makeChannel();
    await postApprovalAnnouncement(channel, {
      guildId: GUILD_ID,
      outcome: 'approved',
      title: 't',
      actorTag: 'Mod',
      scheduledEvent: { url: 'x' },
    });

    expect(channel.send).not.toHaveBeenCalled();
  });

  test('still posts when announceDecisions is explicitly true', async () => {
    const config = await loadGuildConfig(GUILD_ID);
    config.eventRequests = { ...config.eventRequests, announceDecisions: true };
    await saveGuildConfig(GUILD_ID, config);

    const channel = makeChannel();
    await postApprovalAnnouncement(channel, {
      guildId: GUILD_ID,
      outcome: 'denied',
      title: 't',
      actorTag: 'Mod',
    });

    expect(channel.send).toHaveBeenCalledTimes(1);
  });
});

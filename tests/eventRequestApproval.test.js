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
  resolveEventImageBuffer,
  applyEventTimeEdits,
} from '../src/utils/eventRequestApproval.js';
import { loadGuildConfig, saveGuildConfig } from '../src/utils/guildConfig.js';
import { saveUploadedImage } from '../src/utils/eventImageStore.js';

const REQUESTS_FILE = path.join(process.cwd(), 'pending_event_requests.json');
const SELECTIONS_FILE = path.join(process.cwd(), 'pending_event_channel_selections.json');
const GUILD_ID = 'event-request-approval-test-guild';
const GUILD_CONFIG_FILE = path.join(process.cwd(), 'guild_configs', `${GUILD_ID}.json`);
const IMAGES_DIR = path.join(process.cwd(), 'event_request_images');

function cleanup() {
  if (fs.existsSync(REQUESTS_FILE)) fs.unlinkSync(REQUESTS_FILE);
  if (fs.existsSync(SELECTIONS_FILE)) fs.unlinkSync(SELECTIONS_FILE);
  if (fs.existsSync(GUILD_CONFIG_FILE)) fs.unlinkSync(GUILD_CONFIG_FILE);
  if (fs.existsSync(IMAGES_DIR)) fs.rmSync(IMAGES_DIR, { recursive: true, force: true });
  delete global.eventRequests;
  delete global.eventChannelSelections;
}

beforeEach(cleanup);
afterEach(cleanup);

function makeGuild(overrides = {}) {
  return {
    name: 'Test Guild',
    channels: {
      cache: new Map([
        ['text-1', { id: 'text-1', name: 'watch-party' }],
        ['voice-1', { id: 'voice-1', name: 'Voice Lounge' }],
      ]),
    },
    scheduledEvents: {
      create: jest.fn().mockResolvedValue({ id: 'discord-event-1', url: 'https://discord.com/events/discord-event-1' }),
    },
    ...overrides,
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

  test('sets the External event location to the actual selected channel, not a hardcoded placeholder', async () => {
    const guild = makeGuild();
    const requestData = makeRequestData({ channelId: 'text-1' });

    await createScheduledEventFromRequest({
      guild, requestId: 'req-1', requestData, approvalType: 'full',
    });

    expect(guild.scheduledEvents.create).toHaveBeenCalledWith(
      expect.objectContaining({ entityMetadata: { location: '#watch-party' } })
    );
  });

  test('falls back to the guild name when the selected channel is not in cache', async () => {
    const guild = makeGuild();
    const requestData = makeRequestData({ channelId: 'deleted-channel' });

    await createScheduledEventFromRequest({
      guild, requestId: 'req-1', requestData, approvalType: 'full',
    });

    expect(guild.scheduledEvents.create).toHaveBeenCalledWith(
      expect.objectContaining({ entityMetadata: { location: 'Test Guild' } })
    );
  });

  test('truncates a very long channel name to Discord\'s 100-character location limit', async () => {
    const longName = 'a'.repeat(150);
    const guild = makeGuild();
    guild.channels.cache.set('text-1', { id: 'text-1', name: longName });
    const requestData = makeRequestData({ channelId: 'text-1' });

    await createScheduledEventFromRequest({
      guild, requestId: 'req-1', requestData, approvalType: 'full',
    });

    const call = guild.scheduledEvents.create.mock.calls[0][0];
    expect(call.entityMetadata.location.length).toBeLessThanOrEqual(100);
    expect(call.entityMetadata.location).toBe(`#${longName}`.slice(0, 100));
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

describe('applyEventTimeEdits', () => {
  const FIXED_NOW = new Date('2026-01-01T00:00:00.000Z');

  function makeRequestData(overrides = {}) {
    return {
      startTime: '2020-01-01T00:00:00.000Z',
      endTime: null,
      ...overrides,
    };
  }

  test('a valid start + valid end (end after start) updates requestData and returns ok', () => {
    const requestData = makeRequestData();
    const result = applyEventTimeEdits(requestData, '2026-09-15 20:00', '2026-09-15 22:00', FIXED_NOW);

    expect(result).toEqual({ ok: true });
    expect(requestData.startTime).toBe('2026-09-15T20:00:00.000Z');
    expect(requestData.endTime).toBe('2026-09-15T22:00:00.000Z');
  });

  test('a valid start + blank end sets endTime to null', () => {
    const requestData = makeRequestData({ endTime: '2020-01-01T01:00:00.000Z' });
    const result = applyEventTimeEdits(requestData, '2026-09-15 20:00', '', FIXED_NOW);

    expect(result).toEqual({ ok: true });
    expect(requestData.startTime).toBe('2026-09-15T20:00:00.000Z');
    expect(requestData.endTime).toBeNull();
  });

  test('an invalid start format is rejected and does not mutate requestData', () => {
    const requestData = makeRequestData();
    const result = applyEventTimeEdits(requestData, 'not a date', '', FIXED_NOW);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Start Time/);
    expect(requestData.startTime).toBe('2020-01-01T00:00:00.000Z');
    expect(requestData.endTime).toBeNull();
  });

  test('an invalid end format (non-blank garbage) is rejected and does not mutate requestData', () => {
    const requestData = makeRequestData();
    const result = applyEventTimeEdits(requestData, '2026-09-15 20:00', 'not a date', FIXED_NOW);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/End Time/);
    expect(requestData.startTime).toBe('2020-01-01T00:00:00.000Z');
    expect(requestData.endTime).toBeNull();
  });

  test('a syntactically valid but past start time is rejected and does not mutate requestData', () => {
    const requestData = makeRequestData();
    const result = applyEventTimeEdits(requestData, '2025-01-01 00:00', '', FIXED_NOW);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/future/i);
    expect(requestData.startTime).toBe('2020-01-01T00:00:00.000Z');
  });

  test('end time before start time is rejected and does not mutate requestData', () => {
    const requestData = makeRequestData();
    const result = applyEventTimeEdits(requestData, '2026-09-15 20:00', '2026-09-15 19:00', FIXED_NOW);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/after/i);
    expect(requestData.startTime).toBe('2020-01-01T00:00:00.000Z');
    expect(requestData.endTime).toBeNull();
  });

  test('end time exactly equal to start time is rejected (boundary case)', () => {
    const requestData = makeRequestData();
    const result = applyEventTimeEdits(requestData, '2026-09-15 20:00', '2026-09-15 20:00', FIXED_NOW);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/after/i);
  });

  test('a non-UTC timezone converts the moderator-typed wall-clock time to the correct UTC instant (DST-aware)', () => {
    const requestData = makeRequestData();
    // September = EDT (UTC-4) in America/New_York.
    const result = applyEventTimeEdits(requestData, '2026-09-02 17:30', '', FIXED_NOW, 'America/New_York');

    expect(result).toEqual({ ok: true });
    expect(requestData.startTime).toBe('2026-09-02T21:30:00.000Z');
  });

  test('the default (no timezone argument) still behaves as pure UTC — regression guard', () => {
    const requestData = makeRequestData();
    const result = applyEventTimeEdits(requestData, '2026-09-02 17:30', '', FIXED_NOW);

    expect(result).toEqual({ ok: true });
    expect(requestData.startTime).toBe('2026-09-02T17:30:00.000Z');
  });

  test('an invalid timezone is handled gracefully, not thrown', () => {
    const requestData = makeRequestData();
    const result = applyEventTimeEdits(requestData, '2026-09-02 17:30', '', FIXED_NOW, 'Not/AZone');

    expect(result.ok).toBe(false);
    expect(requestData.startTime).toBe('2020-01-01T00:00:00.000Z');
  });
});

describe('resolveEventImageBuffer', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('returns null when neither imageUrl nor an uploaded image is present', async () => {
    const buffer = await resolveEventImageBuffer('req-1', makeRequestData());
    expect(buffer).toBeNull();
  });

  test('fetches and returns a buffer when imageUrl is set and resolves to an image', async () => {
    const imageBytes = Buffer.from('fake-image-bytes');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: (key) => ({ 'content-type': 'image/png', 'content-length': String(imageBytes.length) }[key]) },
      arrayBuffer: async () => imageBytes.buffer.slice(imageBytes.byteOffset, imageBytes.byteOffset + imageBytes.byteLength),
    });

    const requestData = makeRequestData({ imageUrl: 'https://example.com/poster.png' });
    const buffer = await resolveEventImageBuffer('req-1', requestData);

    expect(global.fetch).toHaveBeenCalledWith('https://example.com/poster.png');
    expect(buffer).toEqual(imageBytes);
  });

  test('returns null when the imageUrl fetch fails (non-ok response)', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });

    const requestData = makeRequestData({ imageUrl: 'https://example.com/missing.png' });
    const buffer = await resolveEventImageBuffer('req-1', requestData);

    expect(buffer).toBeNull();
  });

  test('returns null when the imageUrl does not resolve to an image content-type', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: (key) => ({ 'content-type': 'text/html' }[key]) },
    });

    const requestData = makeRequestData({ imageUrl: 'https://example.com/not-an-image' });
    const buffer = await resolveEventImageBuffer('req-1', requestData);

    expect(buffer).toBeNull();
  });

  test('returns null when the imageUrl fetch throws', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network error'));

    const requestData = makeRequestData({ imageUrl: 'https://example.com/poster.png' });
    const buffer = await resolveEventImageBuffer('req-1', requestData);

    expect(buffer).toBeNull();
  });

  test('reads the uploaded file from disk when hasUploadedImage is set and no imageUrl', async () => {
    const imageBytes = Buffer.from('uploaded-image-bytes');
    await saveUploadedImage('req-uploaded', imageBytes, 'image/png');

    const requestData = makeRequestData({ hasUploadedImage: true });
    const buffer = await resolveEventImageBuffer('req-uploaded', requestData);

    expect(buffer).toEqual(imageBytes);
  });

  test('imageUrl takes priority over an uploaded image when both are present', async () => {
    await saveUploadedImage('req-both', Buffer.from('uploaded'), 'image/png');
    const urlBytes = Buffer.from('from-url');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: (key) => ({ 'content-type': 'image/png', 'content-length': String(urlBytes.length) }[key]) },
      arrayBuffer: async () => urlBytes.buffer.slice(urlBytes.byteOffset, urlBytes.byteOffset + urlBytes.byteLength),
    });

    const requestData = makeRequestData({ hasUploadedImage: true, imageUrl: 'https://example.com/override.png' });
    const buffer = await resolveEventImageBuffer('req-both', requestData);

    expect(buffer).toEqual(urlBytes);
  });

  test('returns null when hasUploadedImage is set but no file actually exists', async () => {
    const requestData = makeRequestData({ hasUploadedImage: true });
    const buffer = await resolveEventImageBuffer('req-missing-file', requestData);

    expect(buffer).toBeNull();
  });
});

describe('createScheduledEventFromRequest image handling', () => {
  test('attaches the resolved image buffer to the scheduledEvents.create call', async () => {
    const guild = makeGuild();
    const imageBytes = Buffer.from('uploaded-image-bytes');
    await saveUploadedImage('req-with-image', imageBytes, 'image/png');

    const requestData = makeRequestData({ hasUploadedImage: true });
    await createScheduledEventFromRequest({
      guild, requestId: 'req-with-image', requestData, approvalType: 'full',
    });

    expect(guild.scheduledEvents.create).toHaveBeenCalledWith(
      expect.objectContaining({ image: imageBytes })
    );
  });

  test('does not set an image field at all when no image is available', async () => {
    const guild = makeGuild();
    const requestData = makeRequestData();

    await createScheduledEventFromRequest({
      guild, requestId: 'req-no-image', requestData, approvalType: 'full',
    });

    const createArgs = guild.scheduledEvents.create.mock.calls[0][0];
    expect(createArgs.image).toBeUndefined();
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

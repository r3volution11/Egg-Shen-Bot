/**
 * Public announcement of an approved event request.
 *
 * The approve/deny decision log (postApprovalAnnouncement) goes to the
 * moderation channel, which regular members usually can't see — so an
 * approved watch party was never announced anywhere they could. This
 * covers eventRequests.announcementChannel, set by
 * /eggshen-config-events event-requests announcement-channel.
 *
 * Driven end to end: the real config command writes the setting, then the
 * real Approve button reads it, so a mismatch between the two (key name,
 * sentinel value) fails here rather than in production.
 *
 * Run with: npx jest tests/eventPublicAnnouncement.test.js --verbose
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Collection } from 'discord.js';
import { execute as configExecute } from '../src/commands/eggshen-config-events.js';
import { handleButtonInteraction } from '../src/handlers/buttonHandler.js';
import { saveGuildConfig } from '../src/utils/guildConfig.js';

const GUILD_ID = '900000000000000731';
const EVENT_URL = 'https://discord.com/events/900000000000000731/evt-1';

function makeTextChannel(id, name, send = jest.fn().mockResolvedValue({ id: `msg-${id}` })) {
  return { id, name, type: 0, isTextBased: () => true, send };
}

let watchPartyChannel;
let generalChannel;
let modChannel;
let guild;

function makeGuild() {
  return {
    id: GUILD_ID,
    name: 'Test Server',
    channels: {
      cache: new Collection([
        [watchPartyChannel.id, watchPartyChannel],
        [generalChannel.id, generalChannel],
      ]),
      fetch: jest.fn().mockResolvedValue(null),
    },
    scheduledEvents: {
      create: jest.fn().mockResolvedValue({ id: 'evt-1', url: EVENT_URL }),
    },
  };
}

async function configure(where, channel = null) {
  const interaction = {
    guildId: GUILD_ID,
    guild,
    member: { permissions: { has: () => true } },
    options: {
      getSubcommandGroup: () => 'event-requests',
      getSubcommand: () => 'announcement-channel',
      getString: (name) => (name === 'where' ? where : null),
      getChannel: () => channel,
    },
    reply: jest.fn(),
  };
  await configExecute(interaction);
  return interaction.reply.mock.calls[0][0].content;
}

async function approve() {
  global.eventRequests = new Map([
    ['req-1', {
      guildId: GUILD_ID,
      title: 'The Thing',
      description: null,
      channelId: watchPartyChannel.id,
      voiceChannelId: null,
      startTime: new Date(Date.now() + 86400000).toISOString(),
      endTime: null,
      submitterUsername: 'Requester',
      submitterDiscordId: '111111111111111111',
    }],
  ]);

  const interaction = {
    customId: 'approve_event_req-1',
    guild,
    guildId: GUILD_ID,
    member: { permissions: { has: () => true } },
    user: { id: 'mod-1', tag: 'Mod#0001' },
    channel: modChannel,
    message: {
      embeds: [{ data: { title: 'The Thing', fields: [] } }],
      components: [],
      edit: jest.fn().mockResolvedValue(undefined),
    },
    reply: jest.fn(),
    deferReply: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
  };
  await handleButtonInteraction(interaction);
  return interaction.editReply.mock.calls[0][0].content;
}

beforeEach(async () => {
  watchPartyChannel = makeTextChannel('400000000000000001', 'watch-party');
  generalChannel = makeTextChannel('400000000000000002', 'general');
  modChannel = { ...makeTextChannel('400000000000000003', 'mod-queue'), messages: { fetch: jest.fn() } };
  guild = makeGuild();
  // Reset to a config with no announcementChannel key at all — the shape
  // of every guild configured before this setting existed.
  await saveGuildConfig(GUILD_ID, { eventRequests: { enabled: true, moderationChannel: modChannel.id } });
});

afterEach(() => {
  delete global.eventRequests;
});

describe('approved event public announcement', () => {
  test('is off by default: nothing is posted outside the moderation channel', async () => {
    const reply = await approve();

    expect(watchPartyChannel.send).not.toHaveBeenCalled();
    expect(generalChannel.send).not.toHaveBeenCalled();
    // Just the success line, linked so the event card unfurls under it —
    // no title, location, event ID or raw URL restating the card.
    expect(reply).toBe(`✅ [Event created successfully!](${EVENT_URL})`);
    // The mod decision log still posts as before.
    expect(modChannel.send).toHaveBeenCalledTimes(1);
  });

  test("'The event's own channel' posts in the request's text channel, with the event link in content", async () => {
    await configure('event');
    const reply = await approve();

    expect(watchPartyChannel.send).toHaveBeenCalledTimes(1);
    expect(generalChannel.send).not.toHaveBeenCalled();

    const message = watchPartyChannel.send.mock.calls[0][0];
    // In content, not an embed — only content unfurls into the event RSVP
    // card — masked so no raw URL prints above it.
    expect(message.content).toBe(`📅 [New watch party!](${EVENT_URL}) Requested by <@111111111111111111>`);
    expect(message.allowedMentions).toEqual({ parse: [] });

    expect(reply).toBe(`✅ [Event created successfully!](${EVENT_URL})\n📣 Announced in <#${watchPartyChannel.id}>`);
  });

  test('a specific channel posts there, not in the event channel', async () => {
    await configure('channel', generalChannel);
    const reply = await approve();

    expect(generalChannel.send).toHaveBeenCalledTimes(1);
    expect(generalChannel.send.mock.calls[0][0].content).toContain(EVENT_URL);
    expect(watchPartyChannel.send).not.toHaveBeenCalled();
    expect(reply).toContain(`📣 Announced in <#${generalChannel.id}>`);
  });

  test("'A specific channel' without a channel is rejected and saves nothing", async () => {
    const content = await configure('channel', null);
    expect(content).toContain('Pick a `channel`');

    await approve();
    expect(watchPartyChannel.send).not.toHaveBeenCalled();
    expect(generalChannel.send).not.toHaveBeenCalled();
  });

  test("'Off' turns a configured announcement back off", async () => {
    await configure('event');
    await configure('off');
    await approve();

    expect(watchPartyChannel.send).not.toHaveBeenCalled();
  });

  test('a failed post still creates the event and tells the moderator why', async () => {
    watchPartyChannel.send.mockRejectedValue(new Error('Missing Permissions'));
    await configure('event');
    const reply = await approve();

    expect(guild.scheduledEvents.create).toHaveBeenCalledTimes(1);
    expect(global.eventRequests.has('req-1')).toBe(false);
    expect(reply).toContain('✅ [Event created successfully!]');
    expect(reply).toContain(`⚠️ Couldn't post the announcement in <#${watchPartyChannel.id}>: Missing Permissions`);
  });
});

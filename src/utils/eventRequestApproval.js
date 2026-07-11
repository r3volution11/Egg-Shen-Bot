/**
 * Shared "approve an event request" logic: creates the real Discord
 * scheduled event from a stored request and cleans up bookkeeping state.
 * Used both by the Approve buttons (buttonHandler.js) and by saving an edit
 * (index.js), which auto-approves once a channel is already known.
 */
import { EmbedBuilder } from 'discord.js';
import { saveEventRequests, saveEventChannelSelections } from '../api/server.js';
import { loadGuildConfig } from './guildConfig.js';

/**
 * @param {object} params
 * @param {import('discord.js').Guild} params.guild
 * @param {string} params.requestId
 * @param {object} params.requestData - { title, description, startTime, endTime, channelId, voiceChannelId, ... }
 * @param {'full'|'both'|'text'} params.approvalType - 'both' creates a voice+text event, 'text'/'full' text-only
 * @returns {Promise<import('discord.js').GuildScheduledEvent>}
 */
export async function createScheduledEventFromRequest({ guild, requestId, requestData, approvalType }) {
  const eventConfig = {
    name: requestData.title,
    description: requestData.description || undefined,
    scheduledStartTime: requestData.startTime,
    scheduledEndTime: requestData.endTime || undefined,
    privacyLevel: 2,
  };

  const useVoiceChannel = (approvalType === 'both' || approvalType === 'full') && requestData.voiceChannelId;

  if (useVoiceChannel) {
    eventConfig.channel = requestData.voiceChannelId;
    eventConfig.entityType = 2;

    const textChannel = guild.channels.cache.get(requestData.channelId);
    const channelMention = textChannel ? `<#${textChannel.id}>` : 'the server';
    eventConfig.description = (requestData.description ? requestData.description + '\n\n' : '') +
      `💬 Coordination: ${channelMention}`;
  } else {
    const textChannel = guild.channels.cache.get(requestData.channelId);
    const channelMention = textChannel ? `<#${textChannel.id}>` : 'the server';
    eventConfig.description = (requestData.description ? requestData.description + '\n\n' : '') +
      `📍 Location: ${channelMention}`;
    eventConfig.entityType = 3;
    eventConfig.entityMetadata = { location: 'Discord Server' };
  }

  const scheduledEvent = await guild.scheduledEvents.create(eventConfig);

  return { scheduledEvent, useVoiceChannel };
}

/**
 * Builds the "Approved" version of the moderation-channel embed.
 */
export function buildApprovedEmbed(originalEmbed, { approvedByTag, approvalType }) {
  const approvalLabel = approvalType === 'text' ? ' (Text Channel Only)' :
    approvalType === 'both' ? ' (Both Channels)' : '';

  return new EmbedBuilder(originalEmbed)
    .setColor(0x00FF00)
    .setTitle(`✅ Event Request Approved${approvalLabel}`)
    .setFooter({ text: `Approved by ${approvedByTag} • ${originalEmbed.footer?.text || ''}` });
}

/**
 * Removes a request (and any in-progress channel selection) from bookkeeping
 * state once it's been approved or denied.
 */
export async function cleanupEventRequestState({ guildId, requestId }) {
  global.eventRequests.delete(requestId);
  if (global.eventChannelSelections) {
    global.eventChannelSelections.delete(`${guildId}_${requestId}`);
    await saveEventChannelSelections();
  }
  await saveEventRequests();
}

/**
 * Posts a fresh message to the moderation channel announcing an approval or
 * denial, in addition to editing the original request's embed in place — a
 * silent in-place edit is easy to miss if you weren't already looking at
 * that specific (possibly old) message, so other moderators wouldn't
 * reliably see who acted on a request or why. This shows up as new channel
 * activity instead. Controlled per-guild by eventRequests.announceDecisions
 * (default true) via /eggshen-config event-requests announce-decisions.
 * @param {import('discord.js').TextBasedChannel} channel
 * @param {object} params
 * @param {string} params.guildId
 * @param {'approved'|'denied'} params.outcome
 * @param {string} params.title
 * @param {string} params.actorTag
 * @param {string} [params.reason] - denial reason, if any
 * @param {import('discord.js').GuildScheduledEvent} [params.scheduledEvent] - required for 'approved'
 */
export async function postApprovalAnnouncement(channel, { guildId, outcome, title, actorTag, reason, scheduledEvent }) {
  if (!channel) return;

  try {
    const config = await loadGuildConfig(guildId);
    if (config.eventRequests?.announceDecisions === false) {
      return;
    }
  } catch (error) {
    console.error('[EventRequest] Failed to load guild config for announcement check:', error.message);
    // Fail open: still announce if the config lookup itself breaks, rather
    // than silently going quiet on a config error.
  }

  try {
    if (outcome === 'approved') {
      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x00FF00)
            .setDescription(`✅ **${title}** was approved by ${actorTag} — [event created](${scheduledEvent.url})`)
            .setTimestamp(),
        ],
      });
    } else {
      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xFF0000)
            .setDescription(`❌ **${title}** was denied by ${actorTag}${reason ? `\nReason: ${reason}` : ''}`)
            .setTimestamp(),
        ],
      });
    }
  } catch (error) {
    console.error('[EventRequest] Failed to post approval/denial announcement:', error.message);
  }
}

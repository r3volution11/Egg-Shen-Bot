/**
 * Shared "approve an event request" logic: creates the real Discord
 * scheduled event from a stored request and cleans up bookkeeping state.
 * Used both by the Approve buttons (buttonHandler.js) and by saving an edit
 * (index.js), which auto-approves once a channel is already known.
 */
import { EmbedBuilder } from 'discord.js';
import { saveEventRequests, saveEventChannelSelections } from '../api/server.js';

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

/**
 * Shared "approve an event request" logic: creates the real Discord
 * scheduled event from a stored request and cleans up bookkeeping state.
 * Used both by the Approve buttons (buttonHandler.js) and by saving an edit
 * (index.js), which auto-approves once a channel is already known.
 */
import { EmbedBuilder } from 'discord.js';
import fs from 'fs/promises';
import { saveEventRequests, saveEventChannelSelections } from '../api/server.js';
import { loadGuildConfig } from './guildConfig.js';
import { getImagePath, recordEventDate } from './eventImageStore.js';

// Max bytes to accept for a fetched image URL — Discord's own scheduled
// event image limit is much smaller than this, but capping the fetch
// itself avoids downloading something huge just to have Discord reject it.
const MAX_FETCHED_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Resolve the final image buffer (if any) for a scheduled event, per the
 * priority order: an explicit imageUrl (mod override, or a user-submitted
 * URL with no upload) wins if present; otherwise a user-uploaded file, if
 * one exists for this request; otherwise no image. Never throws — a bad
 * URL or a missing file just means no image, not a failed approval.
 * @param {string} requestId
 * @param {object} requestData - { imageUrl, hasUploadedImage, ... }
 * @returns {Promise<Buffer|null>}
 */
export async function resolveEventImageBuffer(requestId, requestData) {
  if (requestData.imageUrl) {
    try {
      const response = await fetch(requestData.imageUrl);
      if (!response.ok) {
        console.error(`[EventRequest] Image URL fetch failed (${response.status}): ${requestData.imageUrl}`);
        return null;
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.startsWith('image/')) {
        console.error(`[EventRequest] Image URL did not return an image (content-type: ${contentType}): ${requestData.imageUrl}`);
        return null;
      }

      const contentLength = Number(response.headers.get('content-length') || 0);
      if (contentLength > MAX_FETCHED_IMAGE_BYTES) {
        console.error(`[EventRequest] Image URL too large (${contentLength} bytes): ${requestData.imageUrl}`);
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength > MAX_FETCHED_IMAGE_BYTES) {
        console.error(`[EventRequest] Image URL too large after download: ${requestData.imageUrl}`);
        return null;
      }

      return Buffer.from(arrayBuffer);
    } catch (error) {
      console.error(`[EventRequest] Error fetching image URL "${requestData.imageUrl}":`, error.message);
      return null;
    }
  }

  if (requestData.hasUploadedImage) {
    try {
      const filePath = await getImagePath(requestId);
      if (!filePath) return null;
      return await fs.readFile(filePath);
    } catch (error) {
      console.error(`[EventRequest] Error reading uploaded image for request ${requestId}:`, error.message);
      return null;
    }
  }

  return null;
}

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
    // Discord's External-event location is a plain string, not a real
    // channel link (entityType 2/voice is the only type Discord renders as
    // an actual clickable channel) — capped at 100 chars, so it's built
    // from the channel's real name, not a `<#id>` mention which would
    // render as inert literal text here instead of a link.
    const locationText = textChannel ? `#${textChannel.name}` : (guild.name || 'Discord Server');
    eventConfig.entityMetadata = { location: locationText.slice(0, 100) };
  }

  const imageBuffer = await resolveEventImageBuffer(requestId, requestData);
  if (imageBuffer) {
    eventConfig.image = imageBuffer;
  }

  const scheduledEvent = await guild.scheduledEvents.create(eventConfig);

  // Only an uploaded (locally-stored) image needs retention tracking — a
  // URL-sourced image isn't stored on our disk at all, nothing to prune.
  if (imageBuffer && requestData.hasUploadedImage && !requestData.imageUrl) {
    const eventDateMs = new Date(requestData.endTime || requestData.startTime).getTime();
    await recordEventDate(requestId, eventDateMs).catch(err => {
      console.error(`[EventRequest] Failed to record event date for image retention (request ${requestId}):`, err.message);
    });
  }

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

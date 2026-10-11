/**
 * Ready checks — `/watchparty ready`. A public card where people press
 * ✅ Ready or ⏳ Need a minute, so whoever runs the timer can see who they're
 * waiting on before starting. A tally only: it never starts anything.
 *
 * When the channel has a watch party around now, the card also compares
 * the answers with who marked the Discord event Interested.
 *
 * It stops taking answers when the party starts — a timer starting in the
 * channel, or the channel's Discord event going live — or when the host (or
 * a mod) runs `/watchparty ready-close`.
 *
 * One open check per channel. Saved to a file, not a Map: deploys restart
 * the bot, and a card that stopped counting mid-party would be worse than
 * none. Every change is a synchronous load-modify-save, so two clicks can't
 * overwrite each other (the tournament lesson: never save state loaded
 * before an await).
 */

import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHECKS_FILE = process.env.READY_CHECKS_FILE || path.join(__dirname, '../../ready_checks.json');

// A watch party starts within minutes of its ready check; a card still open
// hours later belongs to a party that started without a timer.
export const MAX_AGE_MS = 3 * 60 * 60 * 1000;
// Late Interested clicks count: refetch the list on a click at most this often
export const INTERESTED_REFRESH_MS = 60 * 1000;

function loadAll() {
  if (!existsSync(CHECKS_FILE)) return {};
  try {
    return JSON.parse(readFileSync(CHECKS_FILE, 'utf8')) || {};
  } catch (error) {
    console.error('[ReadyCheck] Couldn\'t read ready checks:', error.message);
    return {};
  }
}

function saveAll(all) {
  // Drop what can no longer be clicked, so the file never grows
  for (const [channelId, check] of Object.entries(all)) {
    if (isExpired(check) || (check.closed && Date.now() - check.closed.at > MAX_AGE_MS)) delete all[channelId];
  }
  const tmp = `${CHECKS_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(all, null, 2));
  renameSync(tmp, CHECKS_FILE);
}

export function isExpired(check) {
  return Date.now() - check.createdAt > MAX_AGE_MS;
}

/** The check in a channel, open or closed, if it's recent enough to matter. */
export function getCheck(channelId) {
  const check = loadAll()[channelId];
  return check && !isExpired(check) ? check : null;
}

/**
 * Open a check in a channel. Any check already there is closed as replaced
 * and returned, so the caller can grey out its card.
 * @returns {{check: object, replaced: object|null}}
 */
export function openCheck({ channelId, guildId, hostId, message = null, event = null, interested = null }) {
  const all = loadAll();
  const previous = all[channelId];
  const replaced = previous && !previous.closed && !isExpired(previous) ? previous : null;
  const check = {
    // Hex: no underscores, so it sits safely in a customId
    id: crypto.randomBytes(6).toString('hex'),
    channelId,
    guildId,
    hostId,
    messageId: null,
    message,
    eventId: event?.id ?? null,
    eventName: event?.name ?? null,
    // Scheduled (1) vs Active (2) when posted: a check posted before the
    // party closes once the event goes live; one posted during it doesn't
    eventStatusAtOpen: event?.status ?? null,
    interested,
    interestedTotal: event?.userCount ?? interested?.length ?? null,
    interestedFetchedAt: interested ? Date.now() : null,
    answers: {},
    createdAt: Date.now(),
    closed: null,
  };
  all[channelId] = check;
  saveAll(all);
  return { check, replaced };
}

/** Record where the card was posted, so a timer start can find and close it. */
export function setMessage(channelId, checkId, messageChannelId, messageId) {
  const all = loadAll();
  const check = all[channelId];
  if (!check || check.id !== checkId) return;
  check.messageId = messageId;
  check.messageChannelId = messageChannelId;
  saveAll(all);
}

/**
 * Someone pressed Ready or Need a minute.
 * @param {'ready'|'minute'} kind
 * @returns {{check?: object, error?: string, waitListJustEmptied?: boolean}}
 *   waitListJustEmptied: this click turned the last "Need a minute" into
 *   Ready — the moment the host is waiting for, worth a message that notifies
 */
export function answer(channelId, checkId, userId, kind) {
  const all = loadAll();
  const check = all[channelId];
  if (!check || check.id !== checkId) return { error: 'replaced' };
  if (check.closed) return { error: check.closed.reason };
  if (isExpired(check)) return { error: 'expired' };

  const waitingBefore = countOf(check, 'minute');
  check.answers[userId] = kind;
  const waitListJustEmptied = waitingBefore > 0 && countOf(check, 'minute') === 0 && kind === 'ready';
  saveAll(all);
  return { check, waitListJustEmptied };
}

/** Store a fresher Interested list (fetched by the caller, outside this save). */
export function setInterested(channelId, checkId, interested, total) {
  const all = loadAll();
  const check = all[channelId];
  if (!check || check.id !== checkId || !interested) return check || null;
  check.interested = interested;
  check.interestedTotal = Math.max(total ?? 0, interested.length);
  check.interestedFetchedAt = Date.now();
  saveAll(all);
  return check;
}

/**
 * Close the channel's open check.
 * @param {'timer'|'event'|'host'|'replaced'} reason
 * @returns {object|null} the closed check, or null if none was open
 */
export function closeCheck(channelId, reason) {
  const all = loadAll();
  const check = all[channelId];
  if (!check || check.closed || isExpired(check)) return null;
  check.closed = { reason, at: Date.now() };
  saveAll(all);
  return check;
}

export function countOf(check, kind) {
  return Object.values(check.answers).filter(a => a === kind).length;
}

function idsFor(check, kind) {
  return Object.entries(check.answers).filter(([, a]) => a === kind).map(([id]) => id);
}

/**
 * Mentions, as many as fit a field (1024) with "+N more". Mentions inside an
 * embed never ping, so listing people here is quiet.
 */
function mentionList(ids, max = 1000) {
  if (ids.length === 0) return '—';
  const parts = [];
  let length = 0;
  for (const [i, id] of ids.entries()) {
    const mention = `<@${id}>`;
    const tail = ` +${ids.length - i} more`;
    if (length + mention.length + 1 + tail.length > max) {
      parts.push(tail.trim());
      break;
    }
    parts.push(mention);
    length += mention.length + 1;
  }
  return parts.join(' ');
}

/** The Interested comparison, or null when there's no event list to compare with. */
export function interestedSummary(check) {
  if (!check.interested) return null;
  const interested = new Set(check.interested);
  const ready = idsFor(check, 'ready');
  const minute = idsFor(check, 'minute');
  const readyInterested = ready.filter(id => interested.has(id)).length;
  const minuteInterested = minute.filter(id => interested.has(id)).length;
  const notCheckedIn = check.interested.filter(id => !check.answers[id]);
  const alsoReady = ready.length - readyInterested;
  return { total: check.interestedTotal ?? check.interested.length, readyInterested, minuteInterested, notCheckedIn, alsoReady };
}

/**
 * The card: embed plus buttons (disabled once closed).
 * @returns {{embeds: EmbedBuilder[], components: ActionRowBuilder[]}}
 */
export function buildReadyCard(check) {
  const ready = idsFor(check, 'ready');
  const minute = idsFor(check, 'minute');
  const embed = new EmbedBuilder()
    .setColor(check.closed ? 0x99AAB5 : 0x57F287)
    .setTitle(`🍿 Ready check${check.eventName ? ` — ${check.eventName}` : ''}`.slice(0, 256));

  const description = [];
  if (check.message) description.push(check.message);
  const were = `${ready.length} ${ready.length === 1 ? 'was' : 'were'} ready`;
  if (check.closed?.reason === 'timer') description.push(`🎬 **Timer started** — ${were}.`);
  if (check.closed?.reason === 'event') description.push(`🎬 **The watch party has started** — ${were}.`);
  if (check.closed?.reason === 'host') description.push(`🔒 **Closed** — ${were}.`);
  if (check.closed?.reason === 'replaced') description.push('⬇️ Replaced by a newer ready check.');
  if (description.length) embed.setDescription(description.join('\n\n'));

  embed.addFields(
    { name: `✅ Ready (${ready.length})`, value: mentionList(ready) },
    { name: `⏳ Need a minute (${minute.length})`, value: mentionList(minute) },
  );

  const summary = interestedSummary(check);
  if (summary) {
    const lines = [`${summary.readyInterested} ready, ${summary.minuteInterested} need${summary.minuteInterested === 1 ? 's' : ''} a minute`];
    if (summary.notCheckedIn.length) lines.push(`Not checked in yet: ${mentionList(summary.notCheckedIn, 800)}`);
    if (summary.alsoReady) lines.push(`Also ready: ${summary.alsoReady} who didn't mark Interested`);
    embed.addFields({ name: `👀 Interested in the event: ${summary.total}`, value: lines.join('\n') });
  }

  embed.setFooter({ text: check.closed ? 'This ready check is closed' : 'Closes when the watch party starts, or with /watchparty ready-close' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ready_check_${check.id}_ready`)
      .setLabel('Ready')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success)
      .setDisabled(Boolean(check.closed)),
    new ButtonBuilder()
      .setCustomId(`ready_check_${check.id}_minute`)
      .setLabel('Need a minute')
      .setEmoji('⏳')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(Boolean(check.closed)),
  );
  return { embeds: [embed], components: [row] };
}

/**
 * Redraw a check's posted card (after closing it). Best-effort: a deleted
 * message or missing permission is logged and ignored.
 * @param {import('discord.js').Client|{channels: {fetch: Function}}} source - anything with channels.fetch
 */
export async function redrawCard(source, check) {
  if (!check?.messageId) return;
  try {
    const channel = await source.channels.fetch(check.messageChannelId || check.channelId);
    const message = await channel?.messages?.fetch(check.messageId);
    if (message) await message.edit(buildReadyCard(check));
  } catch (error) {
    console.error('[ReadyCheck] Couldn\'t update a ready check card:', error.message);
  }
}

/**
 * A timer started in this channel: the watch party is underway, so its
 * ready check stops taking answers and freezes with the final count.
 * Never throws — a ready check must not get in the way of a timer.
 */
export async function closeForTimer(client, channelId) {
  try {
    const closed = closeCheck(channelId, 'timer');
    if (closed) await redrawCard(client, closed);
  } catch (error) {
    console.error('[ReadyCheck] Couldn\'t close the ready check for a timer:', error.message);
  }
}

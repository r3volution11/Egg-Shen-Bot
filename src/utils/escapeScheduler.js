/**
 * Escape Velocity's clock: launches events, rolls each one over at the UTC
 * day boundary, keeps the mission card's standings current, finishes events,
 * and tops up the question pool.
 *
 * Modeled on tournamentScheduler.js. Every transition is decided by a
 * synchronous escapeStore helper that reports the change only once
 * (markLaunched, rolloverDay, finishEvent), and the Discord post happens
 * after — so a restart in between can skip a post but never repeat one.
 */

import {
  loadEvent, listEventGuilds, markLaunched, rolloverDay, finishEvent, recordCard, markCardEdited,
  addQuestions, poolCounts, poolReady, dayKey, standings,
} from './escapeStore.js';
import { generateQuestions, shortfall, TARGET_PER_TIER } from './escapeQuestions.js';
import { missionCard, pts } from './escapeUI.js';
import { EmbedBuilder } from 'discord.js';

const CHECK_INTERVAL_MS = 60_000;
/** The mission card is edited at most this often, however busy the game is. */
const CARD_EDIT_MS = 60_000;
/** A pool top-up runs at most this often per guild. */
const TOP_UP_MS = 60 * 60_000;

let interval = null;
// In memory on purpose: losing these on a restart just allows one early
// top-up, which is harmless
const generating = new Set();
const lastTopUp = new Map();

/**
 * Generate questions until every tier reaches its target. The target grows
 * with the keenest player's history, so someone who has seen most of a tier
 * still gets fresh questions.
 *
 * @returns {Promise<number>} how many were added
 */
export async function buildPool(guildId, { onProgress } = {}) {
  if (generating.has(guildId)) return 0;
  generating.add(guildId);
  try {
    const data = loadEvent(guildId);
    if (!data) return 0;
    const seenPerTier = {};
    for (const p of Object.values(data.players)) {
      const perTier = {};
      for (const id of p.seen) {
        const t = data.questions[id]?.tier;
        if (t) perTier[t] = (perTier[t] || 0) + 1;
      }
      for (const [t, n] of Object.entries(perTier)) seenPerTier[t] = Math.max(seenPerTier[t] || 0, n);
    }
    const counts = poolCounts(data);
    const want = {};
    for (let t = 1; t <= 5; t++) {
      const target = TARGET_PER_TIER + (seenPerTier[t] || 0);
      const n = shortfall({ [t]: counts[t] }, target)[t];
      if (n) want[t] = n;
    }
    if (!Object.keys(want).length) return 0;

    const questions = await generateQuestions({
      media: data.event.media,
      genres: data.event.genres,
      want,
      existingKeys: new Set(Object.values(data.questions).map(q => q.key)),
      onProgress,
    });
    // Saved in one synchronous step: the event may have changed while TMDB answered
    const { added = 0 } = addQuestions(guildId, questions);
    lastTopUp.set(guildId, Date.now());
    return added;
  } finally {
    generating.delete(guildId);
  }
}

async function fetchChannel(client, channelId) {
  try {
    return await client.channels.fetch(channelId);
  } catch {
    return null;
  }
}

/**
 * Post a fresh mission card — at launch and at each new day, because edits
 * never notify and a new day is worth noticing. The previous card's buttons
 * are removed so there's one obvious place to press Launch.
 */
export async function postMissionCard(client, guildId, now = Date.now()) {
  const data = loadEvent(guildId);
  if (!data) return;
  const channel = await fetchChannel(client, data.event.channelId);
  if (!channel) {
    console.error(`[Escape] Mission card channel ${data.event.channelId} is unavailable for guild ${guildId}`);
    return;
  }
  const previous = data.event.card?.messageId;
  const message = await channel.send({ ...missionCard(data, now), allowedMentions: { parse: [] } });
  recordCard(guildId, { messageId: message.id, day: dayKey(now) }, now);
  if (previous) {
    const old = await channel.messages.fetch(previous).catch(() => null);
    await old?.edit({ components: [] }).catch(() => {});
  }
}

/** Re-render the current card in place (a reference, so editing is fine). */
async function refreshCard(client, guildId, now) {
  const data = loadEvent(guildId);
  if (!data?.event.card) return;
  const channel = await fetchChannel(client, data.event.channelId);
  const message = await channel?.messages.fetch(data.event.card.messageId).catch(() => null);
  if (message) await message.edit({ ...missionCard(data, now), allowedMentions: { parse: [] } }).catch(() => {});
  markCardEdited(guildId, now);
}

/**
 * Finish a live event: freeze the card and post the results as a NEW
 * message, pinging the top three in content (embed mentions never ping).
 */
export async function finishNow(client, guildId, now = Date.now()) {
  const result = finishEvent(guildId, now);
  if (!result.finished) return false;

  const data = loadEvent(guildId);
  await refreshCard(client, guildId, now);

  const channel = await fetchChannel(client, data.event.channelId);
  if (!channel) return true;
  const top = result.standings.slice(0, 10);
  const podium = top.slice(0, 3).map(s => s.userId);
  const medal = ['🥇', '🥈', '🥉'];
  const embed = new EmbedBuilder()
    .setColor(0xF1C40F)
    .setTitle(`🏁 ${data.event.name} — mission complete`.slice(0, 256))
    .setDescription(top.length
      ? top.map((s, i) => `${medal[i] || `**${i + 1}.**`} <@${s.userId}> — **${pts(s.score)}** · stage ${s.stage}`).join('\n')
      : 'Nobody launched this time.')
    .setFooter({ text: `${Object.keys(data.players).length} players · best run counted` })
    .setTimestamp(now);
  await channel.send({
    content: podium.length ? `🏁 **${data.event.name}** is over! Congratulations ${podium.map(id => `<@${id}>`).join(', ')}!` : `🏁 **${data.event.name}** is over.`,
    embeds: [embed],
    allowedMentions: { users: podium },
  }).catch(err => console.error('[Escape] Results post failed:', err.message));
  return true;
}

function topUpDue(guildId, now) {
  return !generating.has(guildId) && now - (lastTopUp.get(guildId) || 0) >= TOP_UP_MS;
}

/**
 * One pass over every guild's event. Exported so tests can drive it with a
 * clock; `awaitTopUp` makes the pool top-up finish inside the pass, so a test
 * leaves no work running behind it, and `only` limits the pass to one guild
 * (a test's scratch folder can hold other suites' events).
 */
export async function checkEscape(client, now = Date.now(), { awaitTopUp = false, only = null } = {}) {
  for (const guildId of listEventGuilds()) {
    if (only && guildId !== only) continue;
    try {
      const data = loadEvent(guildId);
      if (!data) continue;
      const { status } = data.event;

      if (status === 'scheduled' && now >= data.event.startsAt) {
        if (!poolReady(data) && topUpDue(guildId, now)) await buildPool(guildId);
        if (markLaunched(guildId, now).launched) await postMissionCard(client, guildId, now);
        continue;
      }

      if (status !== 'live') continue;

      if (now >= data.event.endsAt) {
        await finishNow(client, guildId, now);
        continue;
      }

      if (rolloverDay(guildId, now).rolled) {
        await postMissionCard(client, guildId, now);
      } else {
        const card = loadEvent(guildId).event.card;
        if (card?.dirty && now - (card.editedAt || 0) >= CARD_EDIT_MS) await refreshCard(client, guildId, now);
      }

      if (topUpDue(guildId, now)) {
        // Not awaited in production: generation can take a while and mustn't
        // hold up other guilds
        const topUp = buildPool(guildId).catch(err => console.error(`[Escape] Pool top-up failed for ${guildId}:`, err.message));
        if (awaitTopUp) await topUp;
      }
    } catch (error) {
      console.error(`[Escape] Scheduler pass failed for guild ${guildId}:`, error.message);
    }
  }
}

export function initialize(client) {
  if (interval) return;
  interval = setInterval(() => {
    checkEscape(client).catch(err => console.error('[Escape] Scheduler error:', err.message));
  }, CHECK_INTERVAL_MS);
  interval.unref?.();
  console.log('[Escape] Scheduler started');
}

export function shutdown() {
  if (interval) clearInterval(interval);
  interval = null;
}

/** Test-only: forget in-memory top-up bookkeeping. */
export function _resetScheduler() {
  generating.clear();
  lastTopUp.clear();
}

export { standings };

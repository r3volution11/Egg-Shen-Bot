/**
 * Happenings' clock: once a minute, for every server, end the happening
 * that's run out (and edit its announcement to say so), announce one that
 * hasn't been, and maybe start a random one (happeningStore.maybeSpawn).
 *
 * Modeled on escapeScheduler.js. Each transition is decided by a
 * synchronous happeningStore helper keyed by the happening's id, and the
 * Discord work happens after:
 *   start (saved) → claimAnnouncement (saved) → send a NEW message → record
 * so a restart can drop an announcement but never send two: once the claim
 * is saved the send is never tried again, and a happening that has waited
 * more than ANNOUNCE_WITHIN_MS for its first try (the bot was down) is
 * never announced late. An unannounced happening still applies — every
 * play it changes carries its tag.
 *
 * Announcements are new messages because edits never notify (CLAUDE.md);
 * the end of one is only an edit of that announcement, because nobody needs
 * to be summoned to hear that things are back to normal.
 *
 * R5: the same pass runs a live siege's clock (checkSiege): its poison
 * ticks, its finish — won when its HP is gone, escaped when its time is
 * up — the card's edits (at most one a minute while it's on, then once to
 * freeze it), and the results, a NEW message that pings the fighters,
 * posted claim-before-send like an announcement. And no random happening
 * starts while a siege is live (happeningStore.spawnEligibility).
 *
 * Wired in src/index.js: initialize(client) once the client is ready, and
 * shutdown() beside the other schedulers'.
 */

import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { loadGuildConfig } from './guildConfig.js';
import { getGameSettings, channelAllowed, loadScores, defenceReady } from './gameScores.js';
import { HAPPENINGS } from '../data/gameHappenings.js';
import {
  loadState, inProgress, endHappening, claimAnnouncement, recordHappeningMessage, markUnannounced,
  recordEndNotice, maybeSpawn,
} from './happeningStore.js';
import { luck as gameLuck } from './gameLuck.js';
import {
  currentSiege, siegeTick, finishSiege, markCardEdited, markCardGone, claimResults, recordResults, releaseResults,
  giveUpResults, resultsClaimStale, closeOrphanSiege, claimCard, recordSiegeCard, cardClaimStale, monsterOf,
  decideAction, markAnnounced, voidAction, actionStale, digestDue, releaseWhenOff, randomSiegeEligibility,
  randomSiegeChance, randomPoolScale, randomMonster, spawnSiege,
} from './siegeStore.js';
import { cardPayload, resultsPayload, actionPayload, digestPayload } from './siegeCard.js';
import { SIEGE, TITLES } from '../data/gameRewards.js';

const CHECK_INTERVAL_MS = 60_000;
/** A happening not announced within this long of starting is never announced (no late news) */
export const ANNOUNCE_WITHIN_MS = 2 * 60_000;

/** Each happening's embed colour */
export const HAPPENING_COLORS = Object.freeze({
  fullmoon: 0xF4E3A1,
  happyhour: 0xF5A623,
  fog: 0x9AA5B1,
  doublefeature: 0xE74C3C,
  sunrise: 0xFF8C42,
  madscience: 0x2ECC71,
  rewind: 0x8E44AD,
  intermission: 0x3498DB,
});
/** An ended happening's announcement is greyed */
export const ENDED_COLOR = 0x4F545C;

let interval = null;
// A slow pass (Discord taking its time) mustn't overlap the next one for the
// same server. In memory on purpose: a restart starts with no pass running.
const running = new Set();

const unix = (ms) => Math.floor(ms / 1000);

// ── messages ────────────────────────────────────────────────────────────

/** The announcement: the kind's own words, and an embed saying what changes and until when */
export function announcementPayload(happening) {
  const def = HAPPENINGS[happening.kind];
  const embed = new EmbedBuilder()
    .setColor(HAPPENING_COLORS[happening.kind] ?? 0x5865F2)
    .setTitle(`${def.emoji} ${def.name}`)
    .setDescription(`${def.about}\nEnds <t:${unix(happening.endsAt)}:R>`);
  return { content: def.announce, embeds: [embed], allowedMentions: { parse: [] } };
}

/** The same announcement once it's over */
export function endedPayload(happening) {
  const def = HAPPENINGS[happening.kind];
  const embed = new EmbedBuilder()
    .setColor(ENDED_COLOR)
    .setTitle(`${def.emoji} ${def.name}`)
    .setDescription(`~~${def.about}~~\nEnded <t:${unix(happening.endedAt)}:R>`);
  return { content: def.ended, embeds: [embed], allowedMentions: { parse: [] } };
}

// ── where to announce ───────────────────────────────────────────────────

/**
 * May the bot post an announcement here? View, Send (in a thread: Send in
 * Threads) and Embed Links, checked up front: if it can't tell, it doesn't
 * try.
 */
export async function botCanPost(guild, channel) {
  if (typeof channel?.send !== 'function' || typeof channel.permissionsFor !== 'function') return false;
  const me = guild.members?.me ?? await guild.members?.fetchMe?.().catch(() => null) ?? null;
  if (!me) return false;
  const perms = channel.permissionsFor(me);
  if (!perms) return false;
  const send = channel.isThread?.() ? PermissionFlagsBits.SendMessagesInThreads : PermissionFlagsBits.SendMessages;
  return [PermissionFlagsBits.ViewChannel, send, PermissionFlagsBits.EmbedLinks].every(flag => perms.has(flag));
}

/**
 * The channel a happening is announced in — the first that works of:
 *   1. the happenings channel an admin chose
 *   2. the games channel, when the games are limited to just one
 *   3. the last channel anyone played in
 *   4. `fallback` (an admin start: the channel they ran the command in)
 * Each must be one the games may be played in, and one the bot can post in.
 * @returns {Promise<object|null>} the channel, or null if none will do
 */
export async function chooseChannel(guild, settings, state, fallback = null) {
  const candidates = [
    settings.happeningChannel,
    settings.channelMode === 'only' && settings.channels.length === 1 ? settings.channels[0] : null,
    state?.activity?.channelId,
    fallback?.id ?? fallback,
  ];
  const tried = new Set();
  for (const id of candidates) {
    if (!id || typeof id !== 'string' || tried.has(id)) continue;
    tried.add(id);
    const channel = fallback?.id === id ? fallback : await guild.channels.fetch(id).catch(() => null);
    if (!channel) continue;
    if (!channelAllowed(settings, channel.id, channel.parentId || null).ok) continue;
    if (await botCanPost(guild, channel)) return channel;
  }
  return null;
}

/**
 * Announce happening `happening` with a NEW message, at most once ever.
 * @param {object} options
 * @param {number} options.now
 * @param {object} [options.fallback] - a channel to try last (admin start)
 * @returns {Promise<{channel, message} | {error: 'late'|'no-channel'|'send-failed'|string}>}
 */
export async function announceHappening(guild, settings, happening, { now = Date.now(), fallback = null } = {}) {
  const def = HAPPENINGS[happening.kind];
  if (now - happening.startedAt > ANNOUNCE_WITHIN_MS) {
    // The bot was down when it started: old news is worse than none
    markUnannounced(guild.id, happening.id, 'late');
    console.warn(`[Happenings] ${def.name} in ${guild.id} started ${Math.round((now - happening.startedAt) / 60_000)} min ago and was never announced; not announcing it late`);
    return { error: 'late' };
  }
  const channel = await chooseChannel(guild, settings, loadState(guild.id), fallback);
  if (!channel) {
    // Logged once: an unannounced happening isn't tried again
    if (!markUnannounced(guild.id, happening.id, 'no-channel').error) {
      console.warn(`[Happenings] No channel to announce ${def.name} in for guild ${guild.id} (the bot needs View, Send and Embed Links in a games channel); it applies unannounced`);
    }
    return { error: 'no-channel' };
  }
  // Saved before the send: from here on this happening is never sent again,
  // even if the bot dies before the message id is recorded
  const claim = claimAnnouncement(guild.id, happening.id, channel.id, now);
  if (claim.error) return { error: claim.error };
  let message;
  try {
    message = await channel.send(announcementPayload(claim.happening));
  } catch (error) {
    markUnannounced(guild.id, happening.id, 'send-failed');
    console.error(`[Happenings] Couldn't announce ${def.name} in ${channel.id} (guild ${guild.id}):`, error.message);
    return { error: 'send-failed' };
  }
  recordHappeningMessage(guild.id, happening.id, message.id);
  return { channel, message };
}

/** Edit an ended happening's announcement to say it's over. An edit: it needn't notify. */
async function editEnded(guild, happening) {
  try {
    const channel = await guild.channels.fetch(happening.channelId);
    const message = await channel.messages.fetch(happening.messageId);
    await message.edit(endedPayload(happening));
    recordEndNotice(guild.id, happening.id, happening.messageId);
  } catch (error) {
    // Deleted message or channel: nothing to edit, and no point retrying
    recordEndNotice(guild.id, happening.id, 'gone');
    console.warn(`[Happenings] Couldn't mark ${happening.kind} over in guild ${guild.id}:`, error.message);
  }
}

/**
 * End the current happening if it's run out (or happenings were switched
 * off), and make sure an ended one's announcement says so.
 * @param {boolean} [force] - end it now even if it hasn't run out (admin `end:`)
 * @returns {Promise<object|null>} the happening it ended, if it ended one
 */
export async function settleHappening(guild, settings, now = Date.now(), { force = false } = {}) {
  let h = loadState(guild.id).happening;
  if (!h) return null;
  let ended = null;
  if (!h.endedAt && (force || now >= h.endsAt || settings.happenings === false)) {
    const result = endHappening(guild.id, h.id, now);
    if (result.ended) ended = result.happening;
    h = loadState(guild.id).happening;
    if (!h) return ended;
  }
  if (h.endedAt && h.messageId && !h.endNoticeId) await editEnded(guild, h);
  return ended;
}

// ── sieges (R5) ─────────────────────────────────────────────────────────

/** Discord error codes that mean the message, or its channel, is gone for good */
const GONE_CODES = new Set([10003, 10008, 50001]); // Unknown Channel, Unknown Message, Missing Access

/**
 * What a failed send means for posting the results again:
 *   'retry'   - Discord answered and refused it (rate-limited, an outage,
 *               a permission it may get back): nothing was posted
 *   'refused' - Discord refused it for good (the channel's gone, the
 *               message is invalid): trying again won't help
 *   'unknown' - no answer (a timeout, an abort, the network): the message
 *               may well have been posted, so trying again could post it twice
 * Duck-typed (DiscordAPIError / HTTPError carry a numeric status), not
 * instanceof: a test's fake throws discord.js's errors from its own copy.
 */
export function sendVerdict(error) {
  const status = Number(error?.status);
  if (!/^(DiscordAPIError|HTTPError)/.test(String(error?.name || '')) || !Number.isFinite(status)) return 'unknown';
  if (GONE_CODES.has(Number(error.code))) return Number(error.code) === 50001 ? 'retry' : 'refused';
  if (status === 429 || status >= 500 || Number(error.code) === 50013) return 'retry';
  return 'refused';
}

/**
 * Edit siege `siegeId`'s card to show what it is now — when something has
 * changed since the last edit (dirty), and no sooner than
 * SIEGE.cardEditSeconds after it while the fight is on. The edit that
 * freezes a finished card goes straight away (`force`, or a status that
 * isn't live): it's the last one. A message that's gone is left alone from
 * then on.
 * @returns {Promise<boolean>} whether it edited
 */
export async function editSiegeCard(guild, siegeId, { now = Date.now(), force = false } = {}) {
  const s = currentSiege(guild.id);
  if (!s || s.id !== siegeId || !s.card?.messageId || s.card.gone || !s.card.dirty) return false;
  const live = s.status === 'live';
  if (live && !force && now - (s.card.editedAt || 0) < SIEGE.cardEditSeconds * 1000) return false;
  const rev = s.rev || 0;
  try {
    const channel = await guild.channels.fetch(s.channelId);
    const message = await channel.messages.fetch(s.card.messageId);
    await message.edit(cardPayload(s));
    markCardEdited(guild.id, s.id, rev, now);
    return true;
  } catch (error) {
    // Deleted message or channel, or no access to it: nothing to edit,
    // and no point retrying. Anything else (an outage, a timeout) leaves it
    // dirty for the next pass — an edit shows the same card twice at worst,
    // and one hiccup used to stop every later edit, the frozen one too.
    if (GONE_CODES.has(Number(error?.code))) {
      markCardGone(guild.id, s.id);
      console.warn(`[Siege] The card for siege ${s.id} in guild ${guild.id} is gone; not editing it again:`, error.message);
    } else {
      console.warn(`[Siege] Couldn't edit the card for siege ${s.id} in guild ${guild.id}; trying again next pass:`, error.message);
    }
    return false;
  }
}

/**
 * Post siege `siegeId`'s results — a NEW message pinging the fighters —
 * at most once ever: the claim is saved before the send, so a bot that
 * dies mid-send never sends them again. Anything that stops the send
 * before it goes (no channel, no permission, Discord refusing) releases
 * the claim for the next pass, up to SIEGE.resultTries.
 * @returns {Promise<{message} | {error: string} | null>} null when there's nothing to post
 */
export async function postSiegeResults(guild, siegeId, { now = Date.now() } = {}) {
  const s = currentSiege(guild.id);
  if (!s || s.id !== siegeId || !s.result || s.result.announcedAt) return null;
  if (s.result.claimedAt) {
    // Claimed long ago and never recorded: the bot died mid-send. It may or
    // may not have gone out, so it's never tried again — given up, so it
    // doesn't hold the next siege's start for ever
    if (resultsClaimStale(s, now) && !giveUpResults(guild.id, s.id, 'restart', now).error) {
      console.warn(`[Siege] The results of siege ${s.id} in guild ${guild.id} were cut short by a restart; not posting them again`);
    }
    return null;
  }
  const channel = await guild.channels.fetch(s.channelId).catch(() => null);
  if (!channel || !(await botCanPost(guild, channel))) {
    const gave = releaseResults(guild.id, s.id, 'no-channel', now);
    if (gave.gaveUp) console.warn(`[Siege] Gave up posting the results of siege ${s.id} in guild ${guild.id}: no channel I can post in`);
    return { error: 'no-channel' };
  }
  const claim = claimResults(guild.id, s.id, now);
  if (claim.error) return { error: claim.error };
  let message;
  try {
    message = await channel.send(resultsPayload(claim.siege));
  } catch (error) {
    // Only a send Discord answered with a refusal is tried again: one that
    // timed out may have been posted, and posting it twice pings everyone
    // twice (as a happening's announcement, a doubt means never again)
    const verdict = sendVerdict(error);
    if (verdict === 'retry') {
      const gave = releaseResults(guild.id, s.id, 'send-failed', now);
      console.error(`[Siege] Discord refused the results of siege ${s.id} in ${channel.id} (guild ${guild.id})${gave.gaveUp ? '; giving up' : '; will try again'}:`, error.message);
    } else {
      giveUpResults(guild.id, s.id, verdict === 'refused' ? 'refused' : 'send-unknown', now);
      console.error(`[Siege] Couldn't post the results of siege ${s.id} in ${channel.id} (guild ${guild.id}); not trying again, ${verdict === 'refused' ? 'Discord won\'t take it' : 'it may have been posted'}:`, error.message);
    }
    return { error: 'send-failed' };
  }
  recordResults(guild.id, s.id, message.id, now);
  return { message };
}

/**
 * May members use `command`? As canUseCommand reads it for a member: the
 * master switch on, and the command's own switch on (or never set).
 */
export function membersCan(config, command) {
  const cp = config?.commandPermissions || {};
  if (cp.enabled === false) return false;
  return !Object.prototype.hasOwnProperty.call(cp, command) || cp[command] === true;
}

/**
 * Post a siege's arrival — the card, as a NEW message — claim before send
 * (/siege start and a random siege both). Discord refusing it calls the
 * siege off (nobody can see it); a send that may have gone out (a timeout)
 * leaves it on, for the next passes to find the card in the channel or,
 * if it isn't there, to call it off quietly (reconcileCard).
 * @returns {Promise<{message} | {error: 'send-failed'} | {unsure: true}>}
 */
export async function postArrival(guild, channel, siege, { now = Date.now(), luck = gameLuck } = {}) {
  claimCard(guild.id, siege.id, now);
  let message;
  try {
    message = await channel.send(cardPayload(siege));
  } catch (error) {
    if (sendVerdict(error) === 'unknown') {
      console.warn(`[Siege] No answer posting the card for siege ${siege.id} in ${channel.id} (guild ${guild.id}); looking for it on a later pass:`, error.message);
      return { unsure: true };
    }
    // Nobody can see a monster that was never posted: call it off
    finishSiege(guild.id, siege.id, 'ended', Date.now(), luck, { note: 'no-card' });
    console.error(`[Siege] Couldn't post the card for siege ${siege.id} in ${channel.id} (guild ${guild.id}):`, error.message);
    return { error: 'send-failed' };
  }
  recordSiegeCard(guild.id, siege.id, message.id, Date.now(), siege.rev || 0);
  return { message };
}

/**
 * A card claimed long ago and never recorded: the bot died around the send,
 * or Discord didn't answer. Look for it among the channel's last messages
 * — the bot's, this monster's live card, ending when this siege ends — and
 * adopt it; if it isn't there, nobody ever saw the monster, so the siege is
 * called off quietly (no rewards, no penalties, nothing posted).
 */
async function reconcileCard(guild, s, now, luck) {
  const monster = monsterOf(s.monster);
  const me = guild.members?.me?.id ?? guild.client?.user?.id ?? null;
  const channel = await guild.channels.fetch(s.channelId).catch(() => null);
  const recent = channel?.messages?.fetch ? await channel.messages.fetch({ limit: 25 }).catch(() => null) : null;
  const card = [...(recent?.values?.() ?? [])].find(m => (m.author?.id ?? null) === me
    && String(m.embeds?.[0]?.title || '').endsWith(`${monster.name} is attacking the drive-in!`)
    && String(m.embeds?.[0]?.description || '').includes(`<t:${Math.floor(s.endsAt / 1000)}:R>`));
  if (card) {
    // Dirty (rev −1): the next edit brings it up to date
    recordSiegeCard(guild.id, s.id, card.id, now, -1);
    console.warn(`[Siege] Found the unrecorded card for siege ${s.id} in guild ${guild.id}; adopted it`);
    return;
  }
  finishSiege(guild.id, s.id, 'ended', now, luck, { note: 'no-card' });
  console.warn(`[Siege] The card for siege ${s.id} in guild ${guild.id} was never posted; called the siege off quietly`);
}

/**
 * Announce the monster's pending action: a NEW message pinging its victims,
 * then markAnnounced — so the rescue window and the poison's clock start
 * when they were told. A send that doesn't go (no channel, Discord
 * refusing, no answer) voids it: nobody is grabbed or poisoned unpinged.
 */
async function announceAction(guild, s, action, now) {
  const channel = await guild.channels.fetch(s.channelId).catch(() => null);
  if (!channel || !(await botCanPost(guild, channel))) {
    voidAction(guild.id, s.id, action.id, 'no-channel', now);
    return;
  }
  // What the message can say for sure before it's applied: whose Antidote
  // will fire, whose grab earns a title, what the Wolfman heals
  const fresh = currentSiege(guild.id) || s;
  const scores = loadScores(guild.id);
  const monster = monsterOf(fresh.monster);
  const antidotes = action.kind === 'poison' ? action.victims.filter(id => defenceReady(scores, id, 'antid', now)) : [];
  const titles = {};
  if (action.kind === 'grab') {
    const chow = TITLES.find(t => t.siege === 'grabbed');
    for (const id of action.victims) {
      const u = scores.users[id];
      if (chow && !u?.titles?.earned?.[chow.key] && ((u?.lifetime?.siege?.grabbed || 0) + 1) >= chow.need) titles[id] = [chow.key];
    }
  }
  const heal = Number(monster?.traits?.actHeal) || 0;
  const healed = heal > 0 && fresh.hp > 0 ? Math.min(Math.round(heal * fresh.maxHp), fresh.maxHp - fresh.hp) : 0;
  let message;
  try {
    message = await channel.send(actionPayload(fresh, action, { antidotes, titles, healed }));
  } catch (error) {
    voidAction(guild.id, s.id, action.id, 'send-failed', now);
    console.warn(`[Siege] Couldn't announce the monster's ${action.kind} in guild ${guild.id}; it's void:`, error.message);
    return;
  }
  markAnnounced(guild.id, s.id, action.id, message.id, Date.now());
}

/**
 * A live siege's minute, each step a synchronous store call keyed by the
 * siege's id (so the order is safe across a restart):
 *   1. a card the bot never recorded: found, or the siege called off (R6)
 *   2. poison ticks on the monster; a fighter's own poisoning wearing off
 *   3. grabbed fighters let go, and the poisoned cured, if members can no
 *      longer /rescue or /potion (R6)
 *   4. grabbed fighters nobody freed in time: digested, and told (R6)
 *   5. the finish: won at 0 HP; called off (no rewards, no penalties) once
 *      an admin has switched /siege off; escaped once its time is up
 *   6. the monster's action, when due (R6): an unannounced one past
 *      SIEGE.actions.voidSeconds is void first
 *   7. the card (at most one edit a minute while it's on, then frozen) and
 *      the results, a NEW message pinging the fighters
 * A live siege whose monster no longer exists is closed first: nothing else
 * can reach it, and it would block every start.
 * @param {object} [options] - siegeOff, rescueOn, potionOn: what members may use now
 */
export async function checkSiege(guild, now = Date.now(), luck = gameLuck, { siegeOff = false, rescueOn = true, potionOn = true } = {}) {
  if (!closeOrphanSiege(guild.id, now).error) console.warn(`[Siege] Closed a siege in guild ${guild.id} whose monster no longer exists`);
  let s = currentSiege(guild.id);
  if (!s) return;
  if (s.status === 'live' && cardClaimStale(s, now)) {
    await reconcileCard(guild, s, now, luck);
    s = currentSiege(guild.id);
    if (!s) return;
  }
  if (s.status === 'live') {
    siegeTick(guild.id, s.id, now);
    releaseWhenOff(guild.id, s.id, { rescueOn, potionOn }, now);
    const eaten = digestDue(guild.id, s.id, now);
    if (eaten.digested?.length) await postDigest(guild, eaten.siege, eaten.digested);
    s = currentSiege(guild.id);
    if (!s) return;
    if (!(s.hp > 0)) finishSiege(guild.id, s.id, 'won', now, luck);
    else if (siegeOff) finishSiege(guild.id, s.id, 'ended', now, luck);
    else if (now >= s.endsAt) finishSiege(guild.id, s.id, 'escaped', now, luck);
    s = currentSiege(guild.id);
    if (!s) return;
    if (s.status === 'live' && s.pending && actionStale(s, now)) {
      voidAction(guild.id, s.id, s.pending.id, 'not-announced', now);
      console.warn(`[Siege] The monster's ${s.pending.kind} in guild ${guild.id} was never announced; it's void`);
    }
    const decided = decideAction(guild.id, s.id, { rescueOn, potionOn }, now, luck);
    if (decided.action) await announceAction(guild, decided.siege, decided.action, now);
    s = currentSiege(guild.id);
    if (!s) return;
  }
  await editSiegeCard(guild, s.id, { now });
  await postSiegeResults(guild, s.id, { now });
}

/** Tell the digested: a NEW message pinging them (their loss is already applied) */
async function postDigest(guild, s, digested) {
  const channel = await guild.channels.fetch(s.channelId).catch(() => null);
  if (!channel || !(await botCanPost(guild, channel))) return;
  try {
    await channel.send(digestPayload(s, digested));
  } catch (error) {
    console.warn(`[Siege] Couldn't post a digest in guild ${guild.id}:`, error.message);
  }
}

/**
 * A random siege (R6): when every rule allows it (randomSiegeEligibility)
 * and the dice say so (randomSiegeChance), a monster picked by weight among
 * those in season attacks the channel a happening would be announced in.
 * The rules are checked again on the file inside the start's one save.
 */
async function maybeSpawnSiege(guild, config, settings, now, luck) {
  if (config?.commandPermissions?.siege === false || !membersCan(config, 'siege')) return null;
  const state = loadState(guild.id);
  if (!randomSiegeEligibility(state, settings, now).ok) return null;
  if (!(luck() < randomSiegeChance(settings.siegeFrequency))) return null;
  const key = randomMonster(now, luck);
  const channel = await chooseChannel(guild, settings, state);
  if (!channel) return null;
  const monster = monsterOf(key);
  const spawned = spawnSiege(guild.id, {
    monster: key,
    minutes: monster.minutes ?? settings.siegeMinutes,
    channelId: channel.id,
    source: 'random',
    poolScale: randomPoolScale(settings.siegeFrequency),
    check: (data) => {
      const again = randomSiegeEligibility(data, settings, now);
      return again.ok ? null : again.reason;
    },
  }, now);
  if (spawned.error) return null;
  await postArrival(guild, channel, spawned.siege, { now, luck });
  return spawned.siege;
}

// ── the pass ────────────────────────────────────────────────────────────

async function checkGuild(guild, now, luck) {
  const config = await loadGuildConfig(guild.id);
  const settings = getGameSettings(config);

  // 1. End what's run out
  await settleHappening(guild, settings, now);

  // 1b. A siege's minute (R5) — before any spawn check, which a live siege
  // blocks. /siege switched off ends one that's on (no penalties): members
  // could no longer fight it, so it mustn't escape on them. And (R6) the
  // monster only grabs when members can /rescue, only poisons when they
  // can /potion.
  await checkSiege(guild, now, luck, {
    siegeOff: config?.commandPermissions?.siege === false,
    rescueOn: membersCan(config, 'rescue'),
    potionOn: membersCan(config, 'potion'),
  });

  // 2. Announce one that hasn't been tried (it started just before a restart)
  const h = loadState(guild.id).happening;
  if (inProgress(h, now)) {
    if (!h.messageId && !h.claimedAt && !h.unannounced) await announceHappening(guild, settings, h, { now });
    return;
  }

  // 3. Maybe start one
  const spawned = maybeSpawn(guild.id, settings, now, luck);
  if (spawned) {
    await announceHappening(guild, settings, spawned.happening, { now });
    return;
  }

  // 4. Maybe a monster attacks (R6): never while a happening is on (the
  // early return above) or a siege is (its own rules)
  await maybeSpawnSiege(guild, config, settings, now, luck);
}

/**
 * One pass over every server the bot is in. Exported so tests can drive it
 * with a clock: `only` limits it to one guild, `luck` replaces the dice.
 */
export async function checkHappenings(client, now = Date.now(), { only = null, luck = gameLuck } = {}) {
  const guilds = [...(client.guilds?.cache?.values?.() ?? [])];
  for (const guild of guilds) {
    if (only && guild.id !== only) continue;
    if (running.has(guild.id)) continue;
    running.add(guild.id);
    try {
      await checkGuild(guild, now, luck);
    } catch (error) {
      console.error(`[Happenings] Scheduler pass failed for guild ${guild.id}:`, error.message);
    } finally {
      running.delete(guild.id);
    }
  }
}

export function initialize(client) {
  if (interval) return;
  interval = setInterval(() => {
    checkHappenings(client).catch(err => console.error('[Happenings] Scheduler error:', err.message));
  }, CHECK_INTERVAL_MS);
  interval.unref?.();
  console.log('[Happenings] Scheduler started');
}

export function shutdown() {
  if (interval) clearInterval(interval);
  interval = null;
}

/** Test-only: forget which passes are running (a "restart") */
export function _resetScheduler() {
  running.clear();
}

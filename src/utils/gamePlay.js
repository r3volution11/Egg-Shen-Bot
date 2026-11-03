/**
 * One play of a social game (/potion, /foodfight, /doom, /rescue), the same
 * way every time: check the play limits (and the item asked for), draw a
 * line, record its outcome, and post the line with the points — and
 * whatever the play earned — underneath. The scoring itself is in
 * gameScores.js; the rules (line drawing, items, nights) in gameRules.js.
 *
 * Why the line is drawn HERE and not in each command (R3): an item narrows
 * which lines can come up (a Golden Pie can't miss), and a defence can
 * change the outcome after the draw (Garlic turns a doom into an escape).
 * Both depend on the stored Glovebox, shield and daily counters, which
 * another play could change during any await. So resolvePlay reads them
 * and draws, and recordPlay saves, back to back with no await between.
 *
 * R4 adds happenings (server-wide, gameHappenings.js) and the statuses
 * twists leave (users[uid].effects): finishPlay reads the happenings in
 * progress ONCE and hands the same list to both steps, so the draw and the
 * points can't disagree about whether the Full Moon was up.
 */

import { loadGuildConfig } from './guildConfig.js';
import {
  getGameSettings, checkPlayLimit, recordPlay, resultLine, extraLines, channelAllowed,
  loadScores, wouldScore, itemProblem, itemUsesToday, shieldActive, defencesLeft, defenceReady, activeStatuses,
  POINTS,
} from './gameScores.js';
import { pickLine, itemEffect, goodLine, liveHappenings, happeningWeights, resolveTyped } from './gameRules.js';
import { activeHappenings, noteActivity } from './happeningStore.js';
import { ITEMS, DAILY } from '../data/gameRewards.js';
import { ITEM_REFUSALS, ITEM_PLACEHOLDERS, itemChoiceName } from '../data/gameRewardLines.js';
import { allowedMentionsFor } from './socialTarget.js';
import { nameOf } from './personCard.js';
import { clipText } from './embedFit.js';

/** How each outcome is announced in the points line */
export const OUTCOME_LABELS = {
  hit: '🎯 Hit!', miss: '💨 Miss!', backfire: '🔄 Backfire!',
  tasty: '😋 Tasty!', gross: '🤢 Gross!', spill: '💦 Spill!',
  doomed: '💀 Doomed!', escaped: '🏃 Escaped!', backfired: '🔄 Backfired!',
  rescued: '🛟 Rescued!', caught: '🪤 Caught!', sacrificed: '🕯️ Sacrificed!',
  helped: '💚 It worked!', hurt: '☠️ It worked!',
};

/**
 * The points line's label: the outcome, then the tag of each happening
 * that changed this play — "💀 Doomed! 🌕×2" — so a doubled score never
 * looks like a bug.
 */
export function outcomeLabel(result) {
  const tags = (result.happenings || []).map(h => h.tag).filter(Boolean);
  return [OUTCOME_LABELS[result.outcome], ...tags].filter(Boolean).join(' ');
}

/** Discord's limit on a message's content */
const CONTENT_MAX = 2000;

/**
 * Normalize a list of built-in and custom lines to { text, outcome }.
 * Custom lines saved before outcomes existed are plain strings: they count
 * as `fallback` (a hit, a doom, a rescue, a potion that worked).
 */
export function tagged(lines, fallback) {
  return (lines || []).map(l => (typeof l === 'string' ? { text: l, outcome: fallback } : l)).filter(l => l?.text);
}

/** A random element */
export const pick = (list) => list[Math.floor(Math.random() * list.length)];

/**
 * The happenings bending the games now (happeningStore.activeHappenings),
 * for a play or a card. Pass the game settings to honour the admin switch
 * (`happenings: false` → none, calendar ones included). Never throws: a
 * broken happenings file must never break a /doom.
 *
 * GAME_HAPPENINGS=off → none at all, read on every call so a suite can
 * flip it. Suites drive plays on the real clock and stub Math.random onto
 * a chosen line: on a Friday the 13th (a calendar happening, `bad: true`
 * ×1.25 and +1 on good plays) every one of those stubs would land
 * somewhere else and every points assertion would be off by one. Suites
 * that test happenings pass explicit lists, or switch it back on.
 */
export function happeningsNow(guildId, now = Date.now(), settings = null) {
  if (process.env.GAME_HAPPENINGS === 'off') return [];
  try {
    const list = activeHappenings(guildId, now, settings);
    return Array.isArray(list) ? list : [];
  } catch (error) {
    console.error(`[GamePlay] Couldn't read happenings for ${guildId}:`, error.message);
    return [];
  }
}

/**
 * The player's points for a LINE outcome, to say which of two draws is
 * worse for them (Jinxed). A potion line that works is scored by what the
 * potion does; anything unknown counts as 0.
 */
function actorValue(game, outcome, effect) {
  let scored = outcome;
  if (game === 'potion' && outcome === 'worked') scored = effect === 'harmful' ? 'hurt' : 'helped';
  const table = POINTS[game] || {};
  return Object.hasOwn(table, scored) ? table[scored][0] : 0;
}

/**
 * The `item:` option on a play subcommand: one of your Glovebox items,
 * suggested by itemChoices (so each choice can say what it does).
 */
export const itemOption = (option) => option
  .setName('item')
  .setDescription('Use an item from your Glovebox')
  .setRequired(false)
  .setAutocomplete(true);

/**
 * The item asked for. 'none' is the autocomplete's placeholder: picking it
 * plays without an item. A typed name ("Golden Pie", "pie") is the item it
 * names (resolveTyped); something that names no item is passed on as
 * typed, for itemProblem to refuse.
 */
const asItem = (value) => {
  if (!value || value === 'none') return null;
  return resolveTyped(value, ITEMS, (item) => item.name) ?? value;
};

/**
 * May this person play now? Replies with the reason if not. An item that
 * can't be used — not held, not for this play, or a 4th today — is refused
 * here, privately, BEFORE the cooldown is spent, so a mistyped item costs
 * nothing.
 * @param {object} [options]
 * @param {?string} [options.item] - the `item` option's value
 * @param {?string} [options.action] - 'throw'|'feed'|'fate'|'attempt'|'give'
 * @returns {Promise<{settings, config, item: ?string, action: ?string} | null>}
 */
export async function beginPlay(interaction, game, { item = null, action = null } = {}) {
  const config = await loadGuildConfig(interaction.guildId);
  const settings = getGameSettings(config);
  // Channel rules first: a refused channel shouldn't use up a play
  const here = channelAllowed(settings, interaction.channelId, interaction.channel?.parentId || null);
  if (!here.ok) {
    await interaction.reply({ content: here.message, ephemeral: true });
    return null;
  }
  const wanted = asItem(item);
  if (wanted) {
    const problem = itemProblem(loadScores(interaction.guildId), interaction.user.id, wanted, { game, action });
    if (problem) {
      await interaction.reply({ content: ITEM_REFUSALS[problem](wanted, { game, action }), ephemeral: true });
      return null;
    }
  }
  const limit = checkPlayLimit(interaction.guildId, interaction.user.id, game, settings);
  if (!limit.ok) {
    await interaction.reply({ content: limit.message, ephemeral: true });
    return null;
  }
  return { settings, config, item: wanted, action };
}

/**
 * The `item:` autocomplete: the active items this member holds that fit
 * this play, each with its count and what it does. When there's nothing
 * to use (none held, or DAILY.itemUses used today) one placeholder says
 * so, whose value plays with no item — better than Discord's bare "no
 * options".
 * @returns {Array<{name: string, value: string}>} at most 25
 */
export function itemChoices(guildId, userId, { game, action }, typed = '', now = Date.now()) {
  const data = loadScores(guildId);
  const box = data.users[userId]?.glovebox || {};
  const fit = Object.keys(ITEMS).filter(key => (box[key] || 0) > 0 && itemEffect(key, game, action));
  if (!fit.length) return [{ name: ITEM_PLACEHOLDERS.none, value: 'none' }];
  if (itemUsesToday(data, userId, now) >= DAILY.itemUses) return [{ name: ITEM_PLACEHOLDERS.limit, value: 'none' }];
  const choices = fit.map(key => ({ name: itemChoiceName(key, box[key], action), value: key }));
  const q = String(typed || '').toLowerCase();
  const matching = q ? choices.filter(c => c.value.includes(q) || c.name.toLowerCase().includes(q)) : choices;
  // Typing something that matches nothing still shows what can be used
  return (matching.length ? matching : choices).slice(0, 25);
}

/**
 * Draw the play's line, with the item, happenings, statuses and defences
 * applied. Synchronous, and called right before recordPlay with no await
 * between, so what it reads (the Glovebox, the shield, statuses, today's
 * counters) is exactly what recordPlay will save against. In order:
 *   1. the daily cap: a capped play ignores the item and the player's
 *      statuses completely, and no defence fires against it (not even the
 *      shield). Happenings still bend it: they're the weather.
 *   2. the rescue shield (doom): blocks a scoring doom, unless it's your
 *      own doom or a Cursed VHS cuts through it. A blocked doom draws no
 *      line from the pool, so a Lucky Break or a Jinx waits for the next.
 *   3. outcome weights: each line's weight is the happenings' multipliers
 *      × Lucky Break (bad lines out) × the item's (0 takes lines out). All
 *      multiply, so an item's 0 is 0 whatever else: a Golden Pie still
 *      can't miss in The Fog.
 *   4. pickLine — one draw; Jinxed draws twice and keeps the line worse for
 *      the player (the first, if they're as bad as each other)
 *   5. Garlic (doom) or the Antidote (potion), for the target
 *
 * With no happening, status or item every weight is 1, and the draw is
 * exactly pick()'s — the many suites that stub Math.random onto a line
 * still land on it.
 *
 * @param {string} guildId
 * @param {object} play
 * @param {string} play.game
 * @param {string} play.action
 * @param {{id: string}} play.actor
 * @param {object} play.target - from resolveSocialTarget
 * @param {Array<{text, outcome}>} play.lines - every line this play could post
 * @param {Array<{text, outcome}>} [play.blockedLines] - doom: tagged `blocked`
 * @param {?string} [play.item]
 * @param {'helpful'|'harmful'} [play.effect] - potions
 * @param {object} play.settings
 * @param {object[]} [play.happenings] - happeningsNow(…): the same list finishPlay hands recordPlay
 * @param {number} [now]
 * @param {() => number} [random] - the line draw (Math.random: tests stub it)
 * @returns {{line: {text, outcome}, outcome: string, item: ?string,
 *   mods: {defence?: string, happenings?: string[], statuses?: string[]}}}
 *   mods.happenings: the happenings whose weights shaped this draw (their
 *   tags go on the label); mods.statuses: Lucky Break / Jinxed, which
 *   recordPlay then uses up
 */
export function resolvePlay(guildId, { game, action, actor, target, lines, blockedLines = [], item = null, effect, settings, happenings = [] }, now = Date.now(), random = Math.random) {
  const data = loadScores(guildId);
  const targetId = target?.kind === 'member' && target.pingUserIds[0] !== actor.id ? target.pingUserIds[0] : null;
  const scored = wouldScore(data, actor.id, game, settings, now);
  const usable = item && scored && !itemProblem(data, actor.id, item, { game, action }, now);
  const fx = usable ? itemEffect(item, game, action) : null;

  // The shield. Never against your own doom (you can doom yourself through
  // it), and only against a doom that scores: a capped doom is 0 points
  // either way, so it plays as usual and leaves the shield up.
  if (game === 'doom' && targetId && scored && shieldActive(data, targetId, now) && !fx?.ignoresDefences
    && defencesLeft(data, targetId, now) && blockedLines.length) {
    const line = pickLine(blockedLines, {}, random);
    return { line, outcome: 'blocked', item, mods: { defence: 'shield' } };
  }

  // The weights, by line outcome: happenings × Lucky Break × the item
  const live = liveHappenings(happenings, now);
  const status = scored ? activeStatuses(data.users[actor.id], now) : {};
  const outcomes = [...new Set((lines || []).map(l => l?.outcome))];
  const bent = happeningWeights(live, { game, action, outcomes });
  const weights = {};
  for (const o of outcomes) {
    let w = bent.mult[o] ?? 1;
    if (status.luckybreak && !goodLine(game, o)) w = 0;
    const itemWeight = fx?.weights && Object.hasOwn(fx.weights, o) ? fx.weights[o] : 1;
    weights[o] = w * itemWeight;
  }
  const mods = {};
  if (bent.touched.length) mods.happenings = bent.touched;
  const used = [];
  if (status.luckybreak) used.push('luckybreak');

  let line = pickLine(lines, weights, random);
  if (status.jinxed) {
    // Two draws; the player keeps the worse. On equal points the first
    // stands, so a Jinx never swaps one miss for another for nothing.
    const second = pickLine(lines, weights, random);
    if (second && actorValue(game, second.outcome, effect) < actorValue(game, line.outcome, effect)) line = second;
    used.push('jinxed');
  }
  if (used.length) mods.statuses = used;
  let outcome = line.outcome;

  // Garlic: a doom that rolls doomed becomes an escape — and the line says
  // so, drawn from the escapes. Never against a VHS or a capped play.
  if (game === 'doom' && targetId && outcome === 'doomed' && scored && !fx?.ignoresDefences
    && defenceReady(data, targetId, 'garlic', now)) {
    const escapes = lines.filter(l => l.outcome === 'escaped');
    if (escapes.length) line = pickLine(escapes, {}, random);
    outcome = 'escaped';
    mods.defence = 'garlic';
  }

  // The Antidote: a harmful potion that works does its holder no harm. The
  // line stands (the potion did work); recordPlay changes the points.
  if (game === 'potion' && targetId && outcome === 'worked' && effect === 'harmful' && scored
    && defenceReady(data, targetId, 'antid', now)) {
    mods.defence = 'antid';
  }

  return { line, outcome, item, mods };
}

/**
 * Draw the line, record the play, and post it with the points underneath.
 * @param {object} p
 * @param {string} p.game
 * @param {string} [p.action] - 'throw'|'feed'|'fate'|'attempt'|'give'
 * @param {object} p.target - from resolveSocialTarget
 * @param {Array<{text, outcome}>} [p.lines] - every line this play could post
 * @param {(text: string) => string} [p.fill] - fills a line's placeholders
 * @param {Array<{text, outcome}>} [p.blockedLines] - doom, when a shield blocks
 * @param {string} [p.text] - instead of lines: one line, already filled…
 * @param {string} [p.outcome] - …and its outcome
 * @param {'helpful'|'harmful'} [p.effect] - potions
 * @param {?string} [p.item] - from beginPlay
 * @param {object} p.settings - from beginPlay
 */
export async function finishPlay(interaction, { game, action = null, target, lines = null, fill = (t) => t, blockedLines = [], text, outcome, effect, item = null, settings }) {
  const actor = { id: interaction.user.id, name: nameOf(interaction) };
  const now = Date.now();
  const pool = lines || [{ text, outcome }];
  // Read once: the draw and the points use the same list (see the top)
  const happenings = happeningsNow(interaction.guildId, now, settings);
  // No await between these two: see the top of this file
  const drawn = resolvePlay(interaction.guildId, { game, action, actor, target, lines: pool, blockedLines, item, effect, settings, happenings }, now);
  const result = recordPlay(interaction.guildId, { game, action, actor, target, outcome: drawn.outcome, effect, settings, item: drawn.item, mods: drawn.mods, happenings }, now);
  // Who's been playing, and where: a random happening needs a few members
  // around, and is announced where they last played. Throttled and
  // never-throwing in the store; after the save, so it can't hold the play up.
  try {
    noteActivity(interaction.guildId, { channelId: interaction.channelId || null, userId: actor.id }, now);
  } catch (error) {
    console.error('[GamePlay] Couldn\'t note activity:', error.message);
  }

  const names = { actor: actor.name, target: result.targetId ? target.name : null };
  const tail = [
    resultLine(game, result, names, { label: outcomeLabel(result) }),
    ...extraLines(result, names),
  ].join('\n');
  // Over Discord's limit, the line itself gives way — never the points or
  // what the play earned
  const said = clipText(fill(drawn.line.text), Math.max(1, CONTENT_MAX - tail.length - 1));
  await interaction.reply({
    content: `${said}\n${tail}`.slice(0, CONTENT_MAX),
    // The player and a member target are pinged; a role or @everyone never
    allowedMentions: allowedMentionsFor(interaction.user.id, target),
  });
  return result;
}

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
 */

import { loadGuildConfig } from './guildConfig.js';
import {
  getGameSettings, checkPlayLimit, recordPlay, resultLine, extraLines, channelAllowed,
  loadScores, wouldScore, itemProblem, itemUsesToday, shieldActive, defencesLeft, defenceReady,
} from './gameScores.js';
import { pickLine, itemEffect } from './gameRules.js';
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
 * The `item:` option on a play subcommand: one of your Glovebox items,
 * suggested by itemChoices (so each choice can say what it does).
 */
export const itemOption = (option) => option
  .setName('item')
  .setDescription('Use an item from your Glovebox')
  .setRequired(false)
  .setAutocomplete(true);

/** 'none' is the autocomplete's placeholder: picking it plays without an item */
const asItem = (value) => (value && value !== 'none' ? value : null);

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
 * Draw the play's line, with the item and defences applied. Synchronous,
 * and called right before recordPlay with no await between, so what it
 * reads (the Glovebox, the shield, today's counters) is exactly what
 * recordPlay will save against. In order:
 *   1. the daily cap: a capped play ignores the item completely, and no
 *      defence fires against it (not even the shield)
 *   2. the rescue shield (doom): blocks a scoring doom, unless it's your
 *      own doom or a Cursed VHS cuts through it
 *   3. outcome weights: the item narrows the pool (pickLine, one draw)
 *   4. Garlic (doom) or the Antidote (potion), for the target
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
 * @param {number} [now]
 * @param {() => number} [random] - the line draw (Math.random: tests stub it)
 * @returns {{line: {text, outcome}, outcome: string, item: ?string, mods: {defence?: string}}}
 */
export function resolvePlay(guildId, { game, action, actor, target, lines, blockedLines = [], item = null, effect, settings }, now = Date.now(), random = Math.random) {
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

  let line = pickLine(lines, fx?.weights || {}, random);
  let outcome = line.outcome;
  const mods = {};

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
  // No await between these two: see the top of this file
  const drawn = resolvePlay(interaction.guildId, { game, action, actor, target, lines: pool, blockedLines, item, effect, settings }, now);
  const result = recordPlay(interaction.guildId, { game, action, actor, target, outcome: drawn.outcome, effect, settings, item: drawn.item, mods: drawn.mods }, now);

  const names = { actor: actor.name, target: result.targetId ? target.name : null };
  const tail = [
    resultLine(game, result, names, { label: OUTCOME_LABELS[result.outcome] }),
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

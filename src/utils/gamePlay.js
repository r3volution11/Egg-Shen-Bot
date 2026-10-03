/**
 * One play of a social game (/potion, /foodfight, /doom, /rescue), the same
 * way every time: check the play limits, pick a line, record its outcome,
 * and post the line with the points underneath. The scoring itself is in
 * gameScores.js.
 */

import { loadGuildConfig } from './guildConfig.js';
import { getGameSettings, checkPlayLimit, recordPlay, resultLine, shieldedUntil, channelAllowed } from './gameScores.js';
import { allowedMentionsFor } from './socialTarget.js';
import { nameOf } from './personCard.js';

/** How each outcome is announced in the points line */
export const OUTCOME_LABELS = {
  hit: '🎯 Hit!', miss: '💨 Miss!', backfire: '🔄 Backfire!',
  tasty: '😋 Tasty!', gross: '🤢 Gross!', spill: '💦 Spill!',
  doomed: '💀 Doomed!', escaped: '🏃 Escaped!', backfired: '🔄 Backfired!',
  rescued: '🛟 Rescued!', caught: '🪤 Caught!', sacrificed: '🕯️ Sacrificed!',
  helped: '💚 It worked!', hurt: '☠️ It worked!',
};

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
 * May this person play now? Replies with the reason if not.
 * @returns {Promise<{settings} | null>}
 */
export async function beginPlay(interaction, game) {
  const config = await loadGuildConfig(interaction.guildId);
  const settings = getGameSettings(config);
  // Channel rules first: a refused channel shouldn't use up a play
  const here = channelAllowed(settings, interaction.channelId, interaction.channel?.parentId || null);
  if (!here.ok) {
    await interaction.reply({ content: here.message, ephemeral: true });
    return null;
  }
  const limit = checkPlayLimit(interaction.guildId, interaction.user.id, game, settings);
  if (!limit.ok) {
    await interaction.reply({ content: limit.message, ephemeral: true });
    return null;
  }
  return { settings, config };
}

/** Is this target a member shielded by a recent /rescue? */
export function isShielded(interaction, target) {
  return target?.kind === 'member' && !!shieldedUntil(interaction.guildId, target.pingUserIds[0]);
}

/**
 * Record the play and post the line, with the points underneath.
 * @param {object} p
 * @param {string} p.game
 * @param {object} p.target - from resolveSocialTarget
 * @param {string} p.text - the line, placeholders filled in
 * @param {string} p.outcome
 * @param {'helpful'|'harmful'} [p.effect] - potions
 * @param {object} p.settings - from beginPlay
 */
export async function finishPlay(interaction, { game, target, text, outcome, effect, settings }) {
  const actor = { id: interaction.user.id, name: nameOf(interaction) };
  const result = recordPlay(interaction.guildId, { game, actor, target, outcome, effect, settings });
  const line = resultLine(game, result, {
    actor: actor.name,
    target: result.targetId ? target.name : null,
  }, { label: OUTCOME_LABELS[result.outcome] });
  await interaction.reply({
    content: `${text}\n${line}`.slice(0, 2000),
    // The player and a member target are pinged; a role or @everyone never
    allowedMentions: allowedMentionsFor(interaction.user.id, target),
  });
  return result;
}

/**
 * What /scoreboard and /leaderboard share: the game and period options,
 * which games this server has switched on, how a period is named, and the
 * small pieces both cards draw with (outcome emoji, names, the last-resort
 * fit).
 */

import { escapeMarkdown } from 'discord.js';
import { canUseCommand } from './guildConfig.js';
import { GAMES, GAME_NAMES } from './gameScores.js';
import { LIMITS, clipText, embedTextLength } from './embedFit.js';

/**
 * Plain Unicode on purpose: these label the `game` option's choices, and a
 * choice name can't hold a custom emoji. Cards draw game icons through the
 * kit (kit.game), whose fallback is this same set.
 */
export const GAME_EMOJI = { potion: '🧪', foodfight: '🥧', doom: '🪓', rescue: '🛟' };

/** Each outcome's emoji, for a card's "8 🎯 · 2 💨" counts */
export const OUTCOME_EMOJI = {
  hit: '🎯', miss: '💨', backfire: '🔄',
  tasty: '😋', gross: '🤢', spill: '💦',
  doomed: '💀', escaped: '🏃', backfired: '🔄', blocked: '🛡️',
  rescued: '🛟', caught: '🪤', sacrificed: '🕯️',
  helped: '💚', hurt: '☠️',
};

export const PERIODS = [
  { value: 'month', name: 'This month' },
  { value: 'year', name: 'This year' },
  { value: 'all-time', name: 'All time' },
];

/** The `game` option, with "All games" first */
export const gameOption = (option) => option
  .setName('game')
  .setDescription('One game, or all of them (default)')
  .setRequired(false)
  .addChoices({ name: 'All games', value: 'all' }, ...GAMES.map(g => ({ name: `${GAME_EMOJI[g]} ${GAME_NAMES[g]}`, value: g })));

export const periodOption = (option) => option
  .setName('period')
  .setDescription('This month, this year, or all time (default)')
  .setRequired(false)
  .addChoices(...PERIODS);

export const privateOption = (option) => option
  .setName('private')
  .setDescription('Only you see it (default: everyone in the channel)')
  .setRequired(false);

/** "October 2026", "2026", or "All time" — UTC, as the scores are kept */
export function periodLabel(period, now = Date.now()) {
  const d = new Date(now);
  if (period === 'month') return d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  if (period === 'year') return String(d.getUTCFullYear());
  return 'All time';
}

/** The games switched on for this person on this server, in GAMES order */
export async function enabledGames(interaction) {
  const on = await Promise.all(GAMES.map(g => canUseCommand(interaction.guildId, interaction.member, g)));
  return GAMES.filter((_, i) => on[i]);
}

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st */
export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Discord caps every kind of display name at 32 characters */
export const NAME_MAX = 32;

/**
 * A member's name as card text. Names, never mentions: a card lists a
 * dozen people and must ping none of them, and a mention of someone who
 * has left shows as "<@123…>". Escaped, so a name like `*_Kim_*` shows as
 * typed instead of italicising the row; capped first, because a name kept
 * in the scores file isn't checked against Discord's limit and escaping
 * can double its length.
 */
export function cardName(name) {
  return escapeMarkdown(clipText(String(name || 'Someone'), NAME_MAX));
}

/**
 * The last of a card's layout steps: clip the description and every field
 * value until the whole embed is inside Discord's limits, whatever the data
 * — a card that's rejected posts nothing at all (embedFit.js).
 *
 * Takes and returns a plain embed object, not an EmbedBuilder: the builder
 * throws the moment a value is over its limit, so a card is drafted as
 * plain data, measured, and only wrapped once it fits.
 *
 * The title, author, footer and field names are short and fixed, so the
 * room left is shared by the description and the values. The fields give
 * way first, evenly, but never below FIELD_FLOOR each, because a field
 * clipped to "…" says nothing; the description, which is what the card is
 * for (the standings, the total), gives way last.
 */
const FIELD_FLOOR = 64;
export function clipEmbedToFit(embed) {
  const fields = embed.fields || [];
  const fixed = embedTextLength({ ...embed, description: '', fields: fields.map(f => ({ name: f.name })) });
  const room = LIMITS.total - fixed;

  let description = embed.description ? clipText(embed.description, LIMITS.description) : embed.description;
  let values = fields.map(f => clipText(f.value, LIMITS.fieldValue));
  const sum = (list) => list.reduce((n, v) => n + v.length, 0);

  if ((description?.length || 0) + sum(values) > room && values.length) {
    const share = Math.max(FIELD_FLOOR, Math.floor((room - (description?.length || 0)) / values.length));
    values = values.map(v => clipText(v, share));
  }
  if (description && description.length + sum(values) > room) {
    description = clipText(description, Math.max(1, room - sum(values)));
  }

  return { ...embed, description, fields: fields.map((f, i) => ({ ...f, value: values[i] })) };
}

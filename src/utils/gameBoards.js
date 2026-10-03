/**
 * What /scoreboard and /leaderboard share: the game and period options,
 * which games this server has switched on, and how a period is named.
 */

import { canUseCommand } from './guildConfig.js';
import { GAMES, GAME_NAMES } from './gameScores.js';

export const GAME_EMOJI = { potion: '🧪', foodfight: '🥧', doom: '🪓', rescue: '🛟' };

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

/** +3 / −2 / 0, with a real minus sign */
export const pts = (n) => (n < 0 ? `−${Math.abs(n)}` : String(n));

/**
 * Where a knockout winner goes next, in one place: the bot uses it to fill
 * the next round when a round finishes (bracketManager.propagateWinners),
 * and the bracket image uses it to show each winner moving on the moment
 * their matchup is decided (Doug, 2026-10-05) — the image used to show
 * "TBD" until the whole round was over. Pure functions, no file access.
 */

export const ROUND_SEQUENCE = {
  round_of_32: 'round_of_16',
  round_of_16: 'quarterfinals',
  quarterfinals: 'semifinals',
  semifinals: 'finals',
};

const ROUND_ORDER = ['round_of_32', 'round_of_16', 'quarterfinals', 'semifinals', 'finals'];

/**
 * Seat one round's decided winners in the next round: the winner of the
 * matchup at index i goes to matchup floor(i / 2), in the top slot when i
 * is even. Mutates `next`.
 * @param {object} options.onlyEmpty - leave a slot that's already filled alone
 * @returns {boolean} whether any winner was placed
 */
export function placeWinners(current, next, { onlyEmpty = false } = {}) {
  const byPosition = (a, b) => a.position - b.position;
  const from = [...current].sort(byPosition);
  const to = [...next].sort(byPosition);
  let placed = false;
  from.forEach((matchup, index) => {
    if (!matchup.winner) return;
    const target = to[Math.floor(index / 2)];
    if (!target) return;
    const slot = index % 2 === 0 ? 'movie1' : 'movie2';
    if (onlyEmpty && target[slot]) return;
    target[slot] = matchup.winner;
    placed = true;
  });
  return placed;
}

/**
 * The bracket as it stands, for drawing: a copy with every decided winner
 * already seated in its next matchup, round after round. The tournament's
 * own data isn't touched — the bot still fills the real next round when a
 * round finishes.
 */
export function bracketWithWinnersSeated(knockoutBracket) {
  const copy = (knockoutBracket || []).map(m => ({ ...m }));
  for (const round of ROUND_ORDER) {
    const nextRound = ROUND_SEQUENCE[round];
    if (!nextRound) continue;
    placeWinners(copy.filter(m => m.round === round), copy.filter(m => m.round === nextRound), { onlyEmpty: true });
  }
  return copy;
}

/** The same title, whichever way it was stored */
const sameTitle = (a, b) => !!a && !!b && (a === b
  || (a.id != null && a.id === b.id && (a.type || '') === (b.type || ''))
  || (a.id == null && a.title === b.title));

/**
 * Which side won a matchup: 'movie1', 'movie2', or null. Results store the
 * winning title itself; the image compared it with the strings 'movie1' and
 * 'movie2', so no winner was ever highlighted. Old string results still work.
 */
export function winnerSide(matchup, result) {
  const winner = result?.winner ?? matchup?.winner;
  if (winner === 'movie1' || winner === 'movie2') return winner;
  if (!winner) return null;
  if (sameTitle(winner, matchup.movie1)) return 'movie1';
  if (sameTitle(winner, matchup.movie2)) return 'movie2';
  return null;
}

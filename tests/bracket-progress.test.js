/**
 * Where a knockout winner goes next (src/utils/bracketProgress.js): shared
 * by the bot, which fills the next round when a round finishes, and the
 * bracket image, which shows each winner moving on as soon as their
 * matchup is decided. Before 2.58.1 the image showed "TBD" until the whole
 * round closed, and never highlighted a winner at all.
 *
 * Run with: npm test -- tests/bracket-progress.test.js
 */
import { describe, test, expect } from '@jest/globals';
import { placeWinners, bracketWithWinnersSeated, winnerSide } from '../src/utils/bracketProgress.js';

const t = (id, title) => ({ id, type: 'movie', title });
const NIGHTMARE = t(377, 'A Nightmare on Elm Street');
const SICK = t(1, 'Sick');

/** A 16-title bracket: round of 16 (8), quarterfinals (4), semis (2), final */
function bracket() {
  const out = [];
  for (const [round, n] of [['round_of_16', 8], ['quarterfinals', 4], ['semifinals', 2], ['finals', 1]]) {
    for (let p = 0; p < n; p++) {
      out.push({ id: `${round}-${p}`, round, position: p, status: 'pending', movie1: null, movie2: null });
    }
  }
  for (let p = 0; p < 8; p++) Object.assign(out[p], { status: 'voting', movie1: t(100 + 2 * p, `T${2 * p}`), movie2: t(101 + 2 * p, `T${2 * p + 1}`) });
  return out;
}

describe('seating winners in the next round', () => {
  test('the winner of matchup i goes to matchup floor(i/2): top slot for even i, bottom for odd', () => {
    const b = bracket();
    b[0].winner = b[0].movie2; // 1A
    b[1].winner = b[1].movie1; // 1B
    b[3].winner = b[3].movie2; // 2B
    const seated = bracketWithWinnersSeated(b);
    const qf = seated.filter(m => m.round === 'quarterfinals').sort((x, y) => x.position - y.position);
    expect(qf[0].movie1.title).toBe('T1');
    expect(qf[0].movie2.title).toBe('T2');
    expect(qf[1].movie1).toBeNull(); // 2A not decided yet
    expect(qf[1].movie2.title).toBe('T7');
  });

  test('it carries on through the rounds, and never touches the tournament itself', () => {
    const b = bracket();
    b[0].winner = b[0].movie1;
    const qf0 = b.find(m => m.id === 'quarterfinals-0');
    qf0.winner = SICK; // a later round already decided
    const seated = bracketWithWinnersSeated(b);
    expect(seated.find(m => m.id === 'semifinals-0').movie1).toBe(SICK);
    expect(b.find(m => m.id === 'quarterfinals-0').movie1).toBeNull();
    expect(b.find(m => m.id === 'semifinals-0').movie1).toBeNull();
  });

  test('a slot the bot already filled is left as it is', () => {
    const b = bracket();
    b[0].winner = b[0].movie1;
    const qf0 = b.find(m => m.id === 'quarterfinals-0');
    qf0.movie1 = NIGHTMARE;
    expect(bracketWithWinnersSeated(b).find(m => m.id === 'quarterfinals-0').movie1).toBe(NIGHTMARE);
  });

  test('placeWinners without onlyEmpty overwrites, as the bot does at a round\'s end', () => {
    const current = [{ position: 0, winner: SICK }, { position: 1, winner: NIGHTMARE }];
    const next = [{ position: 0, movie1: t(9, 'Old'), movie2: null }];
    expect(placeWinners(current, next)).toBe(true);
    expect(next[0].movie1).toBe(SICK);
    expect(next[0].movie2).toBe(NIGHTMARE);
  });
});

describe('which side won', () => {
  const m = { movie1: SICK, movie2: NIGHTMARE };
  test('the stored winning title is matched to its side', () => {
    expect(winnerSide(m, { winner: { ...NIGHTMARE, posterUrl: 'x' } })).toBe('movie2');
    expect(winnerSide({ ...m, winner: SICK }, undefined)).toBe('movie1');
  });
  test('a title with no id matches by title; an old "movie1" result still works; undecided is null', () => {
    expect(winnerSide({ movie1: { title: 'A' }, movie2: { title: 'B' } }, { winner: { title: 'B' } })).toBe('movie2');
    expect(winnerSide(m, { winner: 'movie1' })).toBe('movie1');
    expect(winnerSide(m, undefined)).toBeNull();
    // Same id, different kind of title: not the same title
    expect(winnerSide(m, { winner: { id: 377, type: 'tv', title: 'Other' } })).toBeNull();
  });
});

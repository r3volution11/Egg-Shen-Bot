/**
 * The games' own random source for LUCK: things that happen to a player
 * rather than the line they roll. R3 uses it for the "random item" prize
 * (every 750 points); R4's twists, R5's loot and R6's monster actions will
 * lean on it heavily.
 *
 * Why not Math.random? Dozens of existing tests stub Math.random to land a
 * play on a chosen line. If luck shared that source, a stub of 0 meant to
 * pick "the first line" would also fire every twist and pick the first
 * loot — and the suites would start failing for reasons nobody touched.
 * Keeping luck separate means a line stub can't trigger luck, and a luck
 * stub (_setLuck) can't move a line.
 *
 * GAME_LUCK=off (set as a fallback in tests/jest.setup.js) makes luck() a
 * constant just under 1: every "does it fire?" check (luck() < chance)
 * says no, so nothing luck-driven happens by accident in a suite that
 * didn't ask for it. A suite that wants luck sets it with _setLuck, which
 * always wins over GAME_LUCK.
 */

/** What luck() returns when GAME_LUCK=off: fires nothing, picks the last of a list */
export const LUCK_OFF = 0.999999;

let source = null;

/** A number in [0, 1) */
export function luck() {
  if (source) return source();
  // Read on every call, not at import, so a suite can flip it per test
  if (process.env.GAME_LUCK === 'off') return LUCK_OFF;
  return Math.random();
}

/**
 * Tests: replace the source (a function returning [0, 1)), or pass null
 * to go back to GAME_LUCK / Math.random.
 */
export function _setLuck(fn) {
  source = typeof fn === 'function' ? fn : null;
}

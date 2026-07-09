/**
 * Tiebreaker flow tests
 *
 * Tests the complete cycle:
 *   group voting → tie detected → tiebreaker created → users vote →
 *   tiebreaker closed (by votes OR admin) → group finalized
 *
 * Run with: npx jest tests/tiebreaker-flow.test.js --verbose
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import * as bracketManager from '../src/utils/bracketManager.js';

const GUILD_ID = 'tiebreaker-test-guild';
const TOURNAMENT_DIR = path.join(process.cwd(), 'guild_tournaments');

// ─── helpers ─────────────────────────────────────────────────────────────────

function cleanup() {
  const f = path.join(TOURNAMENT_DIR, `${GUILD_ID}.json`);
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

function makeEntry(id, title) {
  return { id, title, year: '2024', posterUrl: '' };
}

/**
 * Create a ready-to-vote 4-group tournament with 4 titles each.
 * Returns the open result so callers can verify.
 */
function setupGroupTournament() {
  bracketManager.createTournament(GUILD_ID, 'Tiebreaker Test Cup', 'admin-1', 36);
  // Resize down to 4 groups so the test bracket is self-contained
  bracketManager.resizeTournament(GUILD_ID, 4);

  const groups = {
    A: ['Ring', 'Halloween', 'Psycho', 'Nosferatu'],
    B: ['Scream', 'The Witch', "Don't Look Now", 'Suspiria'],
    C: ['Hereditary', 'Midsommar', 'The Thing', 'Alien'],
    D: ['Jaws', 'Silence of the Lambs', 'Se7en', 'Misery'],
  };

  for (const [groupId, titles] of Object.entries(groups)) {
    for (let i = 0; i < titles.length; i++) {
      bracketManager.addGroupTitle(GUILD_ID, groupId, 'movie', makeEntry(`${groupId}-${i}`, titles[i]));
    }
  }

  return bracketManager.openGroupVoting(
    GUILD_ID,
    ['A', 'B', 'C', 'D'],
    Date.now() + 24 * 60 * 60 * 1000
  );
}

/**
 * Vote for two movies by index in a group.
 * Returns the voteGroupStage result.
 */
function castGroupVote(userId, groupId, idx1, idx2) {
  return bracketManager.voteGroupStage(GUILD_ID, userId, groupId, [idx1, idx2]);
}

// ─── setup / teardown ────────────────────────────────────────────────────────

beforeEach(cleanup);
afterEach(cleanup);

// ─── tests ───────────────────────────────────────────────────────────────────

describe('Group voting — basic (no tie)', () => {
  test('votes are recorded and voteGroupStage returns success', () => {
    setupGroupTournament();

    const r = castGroupVote('user-1', 'A', 0, 1); // Ring + Halloween
    expect(r.success).toBe(true);

    const t = bracketManager.loadTournament(GUILD_ID);
    expect(t.groups['A'].movies[0].votes).toContain('user-1');
    expect(t.groups['A'].movies[1].votes).toContain('user-1');
    expect(t.groups['A'].movies[2].votes).not.toContain('user-1');
  });

  test('user can change their vote', () => {
    setupGroupTournament();
    castGroupVote('user-1', 'A', 0, 1); // Ring + Halloween
    castGroupVote('user-1', 'A', 2, 3); // Psycho + Nosferatu (changed)

    const t = bracketManager.loadTournament(GUILD_ID);
    expect(t.groups['A'].movies[0].votes).not.toContain('user-1');
    expect(t.groups['A'].movies[1].votes).not.toContain('user-1');
    expect(t.groups['A'].movies[2].votes).toContain('user-1');
    expect(t.groups['A'].movies[3].votes).toContain('user-1');
  });

  test('clear winner — no tiebreaker created', () => {
    setupGroupTournament();
    // Movie 0 (Ring) wins clearly: 4 votes, 1 vote, 0, 0
    castGroupVote('user-1', 'A', 0, 1);
    castGroupVote('user-2', 'A', 0, 1);
    castGroupVote('user-3', 'A', 0, 2);
    castGroupVote('user-4', 'A', 0, 3);

    const result = bracketManager.closeGroupVoting(GUILD_ID, ['A']);
    expect(result.success).toBe(true);
    expect(result.tiebreakersCreated).toHaveLength(0);
    expect(result.tournament.groupResults['A'].first.title).toBe('Ring');
  });
});

describe('Tie detection — tiebreaker is created', () => {
  test('1st-place tie creates a tiebreaker', () => {
    setupGroupTournament();
    // Both users vote for Ring AND Halloween — each gets 2 votes, 1st-place tie
    bracketManager.voteGroupStage(GUILD_ID, 'user-1', 'A', [0, 1]);
    bracketManager.voteGroupStage(GUILD_ID, 'user-2', 'A', [0, 1]);
    // Counts: Ring=2, Halloween=2, Psycho=0, Nosferatu=0 → 1st-place tie

    const result = bracketManager.closeGroupVoting(GUILD_ID, ['A']);
    expect(result.success).toBe(true);
    expect(result.tiebreakersCreated).toHaveLength(1);

    const tb = result.tiebreakersCreated[0];
    expect(tb.position).toBe('1st');
    expect(tb.groupId).toBe('A');
    expect(tb.tiebreaker.tiedOptions).toHaveLength(2);
    expect(tb.tiebreaker.tiedOptions.map(o => o.title)).toEqual(
      expect.arrayContaining(['Ring', 'Halloween'])
    );
    expect(tb.tiebreaker.status).toBe('active');
  });

  test('2nd-place tie creates a tiebreaker', () => {
    setupGroupTournament();
    // Ring wins 1st (3 votes). Halloween and Psycho tied for 2nd (1 vote each).
    castGroupVote('user-1', 'A', 0, 1); // Ring + Halloween
    castGroupVote('user-2', 'A', 0, 2); // Ring + Psycho
    castGroupVote('user-3', 'A', 0, 3); // Ring + Nosferatu

    const result = bracketManager.closeGroupVoting(GUILD_ID, ['A']);
    expect(result.success).toBe(true);
    expect(result.tiebreakersCreated).toHaveLength(1);
    expect(result.tiebreakersCreated[0].position).toBe('2nd');
  });

  test('tiebreaker stored on tournament.tiebreakers array', () => {
    setupGroupTournament();
    castGroupVote('user-1', 'A', 0, 2);
    castGroupVote('user-2', 'A', 0, 2);
    castGroupVote('user-3', 'A', 1, 2);
    castGroupVote('user-4', 'A', 1, 2);

    bracketManager.closeGroupVoting(GUILD_ID, ['A']);

    const t = bracketManager.loadTournament(GUILD_ID);
    expect(t.tiebreakers).toHaveLength(1);
    expect(t.tiebreakers[0].status).toBe('active');
    expect(t.tiebreakers[0].votes).toEqual({});
  });
});

describe('Partial vote handling', () => {
  test('partial votes (1/2) are discarded before results are calculated', () => {
    setupGroupTournament();
    // user-1 completes both votes: Ring(0) + Psycho(2)
    castGroupVote('user-1', 'A', 0, 2);
    // user-2 only picks 1 title (partial vote — should be discarded)
    bracketManager.voteGroupStage(GUILD_ID, 'user-2', 'A', [0]);

    const result = bracketManager.closeGroupVoting(GUILD_ID, ['A']);
    expect(result.success).toBe(true);
    // user-2's partial vote must be listed as discarded
    expect(result.partialVotersDiscarded).toHaveLength(1);
    expect(result.partialVotersDiscarded[0].userId).toBe('user-2');
    expect(result.partialVotersDiscarded[0].groupId).toBe('A');
  });

  test('partial votes do not count toward tie detection', () => {
    setupGroupTournament();
    // user-1 full vote: Ring(0) + Psycho(2)
    castGroupVote('user-1', 'A', 0, 2);
    // user-2 partial vote for Halloween(1) only — would create a false tie if counted
    bracketManager.voteGroupStage(GUILD_ID, 'user-2', 'A', [1]);

    const result = bracketManager.closeGroupVoting(GUILD_ID, ['A']);
    // After discarding user-2, only user-1 remains: Ring=1, Psycho=1, Halloween=0
    // No tie — clear winner path (Ring and Psycho tied for 1st is still handled)
    expect(result.success).toBe(true);
    expect(result.partialVotersDiscarded).toHaveLength(1);
    // Halloween should have 0 votes (partial was discarded)
    const t = bracketManager.loadTournament(GUILD_ID);
    const halloween = t.groups['A'].movies[1];
    expect(halloween.votes).toHaveLength(0);
  });

  test('complete votes are never discarded', () => {
    setupGroupTournament();
    // Ring(0) gets 3 votes — clear 1st place winner, no tie
    castGroupVote('user-1', 'A', 0, 1); // Ring + Halloween
    castGroupVote('user-2', 'A', 0, 2); // Ring + Psycho
    castGroupVote('user-3', 'A', 0, 3); // Ring + Nosferatu

    const result = bracketManager.closeGroupVoting(GUILD_ID, ['A']);
    expect(result.partialVotersDiscarded).toHaveLength(0);
    expect(result.tournament.groupResults['A'].first.title).toBe('Ring');
  });
});

describe('Tiebreaker voting', () => {
  function setupTie() {
    setupGroupTournament();
    castGroupVote('user-1', 'A', 0, 2);
    castGroupVote('user-2', 'A', 0, 2);
    castGroupVote('user-3', 'A', 1, 2);
    castGroupVote('user-4', 'A', 1, 2);
    const result = bracketManager.closeGroupVoting(GUILD_ID, ['A']);
    return result.tiebreakersCreated[0].tiebreaker;
  }

  test('voteInTiebreaker records vote', () => {
    const tb = setupTie();
    const r = bracketManager.voteInTiebreaker(GUILD_ID, tb.id, 'voter-1', 0);
    expect(r.success).toBe(true);
    expect(r.tiebreaker.votes['voter-1']).toBe(0);
  });

  test('user can change tiebreaker vote', () => {
    const tb = setupTie();
    bracketManager.voteInTiebreaker(GUILD_ID, tb.id, 'voter-1', 0); // voted for option 0
    bracketManager.voteInTiebreaker(GUILD_ID, tb.id, 'voter-1', 1); // changed to option 1

    const t = bracketManager.loadTournament(GUILD_ID);
    const updated = t.tiebreakers.find(x => x.id === tb.id);
    expect(updated.votes['voter-1']).toBe(1);
  });

  test('multiple users can vote independently', () => {
    const tb = setupTie();
    bracketManager.voteInTiebreaker(GUILD_ID, tb.id, 'voter-1', 0);
    bracketManager.voteInTiebreaker(GUILD_ID, tb.id, 'voter-2', 0);
    bracketManager.voteInTiebreaker(GUILD_ID, tb.id, 'voter-3', 1);

    const t = bracketManager.loadTournament(GUILD_ID);
    const updated = t.tiebreakers.find(x => x.id === tb.id);
    expect(updated.votes['voter-1']).toBe(0);
    expect(updated.votes['voter-2']).toBe(0);
    expect(updated.votes['voter-3']).toBe(1);
  });

  test('cannot vote in a non-existent tiebreaker', () => {
    setupTie();
    const r = bracketManager.voteInTiebreaker(GUILD_ID, 'bad-id', 'voter-1', 0);
    expect(r.success).toBe(false);
  });

  test('cannot vote after tiebreaker is closed', () => {
    const tb = setupTie();
    bracketManager.closeTiebreaker(GUILD_ID, tb.id);
    const r = bracketManager.voteInTiebreaker(GUILD_ID, tb.id, 'voter-1', 0);
    expect(r.success).toBe(false);
  });
});

describe('closeTiebreaker — resolves by vote count', () => {
  function setupTie() {
    setupGroupTournament();
    castGroupVote('user-1', 'A', 0, 2);
    castGroupVote('user-2', 'A', 0, 2);
    castGroupVote('user-3', 'A', 1, 2);
    castGroupVote('user-4', 'A', 1, 2);
    const result = bracketManager.closeGroupVoting(GUILD_ID, ['A']);
    return result.tiebreakersCreated[0].tiebreaker;
  }

  test('winner is the option with the most tiebreaker votes', () => {
    const tb = setupTie();
    // 3 votes for option 0 (Ring), 1 vote for option 1 (Halloween)
    bracketManager.voteInTiebreaker(GUILD_ID, tb.id, 'voter-1', 0);
    bracketManager.voteInTiebreaker(GUILD_ID, tb.id, 'voter-2', 0);
    bracketManager.voteInTiebreaker(GUILD_ID, tb.id, 'voter-3', 0);
    bracketManager.voteInTiebreaker(GUILD_ID, tb.id, 'voter-4', 1);

    const r = bracketManager.closeTiebreaker(GUILD_ID, tb.id);
    expect(r.success).toBe(true);
    expect(r.winner.title).toBe('Ring');
    expect(r.tiebreaker.status).toBe('closed');
  });

  test('vote counts are stored on the closed tiebreaker', () => {
    const tb = setupTie();
    bracketManager.voteInTiebreaker(GUILD_ID, tb.id, 'voter-1', 0);
    bracketManager.voteInTiebreaker(GUILD_ID, tb.id, 'voter-2', 1);
    bracketManager.voteInTiebreaker(GUILD_ID, tb.id, 'voter-3', 1);

    const r = bracketManager.closeTiebreaker(GUILD_ID, tb.id);
    expect(r.tiebreaker.voteCounts[0]).toBe(1);
    expect(r.tiebreaker.voteCounts[1]).toBe(2);
    expect(r.winner.title).toBe('Halloween');
  });

  test('zero votes — winner chosen randomly but consistently', () => {
    const tb = setupTie();
    const r = bracketManager.closeTiebreaker(GUILD_ID, tb.id);
    expect(r.success).toBe(true);
    // Winner must be one of the tied options
    const titles = tb.tiedOptions.map(o => o.title);
    expect(titles).toContain(r.winner.title);
  });

  test('cannot close the same tiebreaker twice', () => {
    const tb = setupTie();
    bracketManager.closeTiebreaker(GUILD_ID, tb.id);
    const r2 = bracketManager.closeTiebreaker(GUILD_ID, tb.id);
    expect(r2.success).toBe(false);
  });
});

describe('storeTiebreakerMessage', () => {
  test('stores channel and message IDs on the tiebreaker', () => {
    setupGroupTournament();
    castGroupVote('user-1', 'A', 0, 2);
    castGroupVote('user-2', 'A', 0, 2);
    castGroupVote('user-3', 'A', 1, 2);
    castGroupVote('user-4', 'A', 1, 2);
    const result = bracketManager.closeGroupVoting(GUILD_ID, ['A']);
    const tb = result.tiebreakersCreated[0].tiebreaker;

    const ok = bracketManager.storeTiebreakerMessage(GUILD_ID, tb.id, 'chan-123', 'msg-456');
    expect(ok).toBe(true);

    const t = bracketManager.loadTournament(GUILD_ID);
    const saved = t.tiebreakers.find(x => x.id === tb.id);
    expect(saved.messageChannelId).toBe('chan-123');
    expect(saved.messageId).toBe('msg-456');
  });

  test('returns false for unknown tiebreaker ID', () => {
    setupGroupTournament();
    const ok = bracketManager.storeTiebreakerMessage(GUILD_ID, 'no-such-id', 'chan', 'msg');
    expect(ok).toBe(false);
  });
});

describe('finalizeGroupAfterTiebreaker — group results updated', () => {
  test('1st-place tiebreaker: group results fully populated', () => {
    setupGroupTournament();
    // Both users vote for Ring AND Halloween — each gets 2 votes, 1st-place tie
    bracketManager.voteGroupStage(GUILD_ID, 'user-1', 'A', [0, 1]);
    bracketManager.voteGroupStage(GUILD_ID, 'user-2', 'A', [0, 1]);

    const closeResult = bracketManager.closeGroupVoting(GUILD_ID, ['A']);
    const tbId = closeResult.tiebreakersCreated[0].tiebreaker.id;

    // 3 voters pick Ring (option 0), 1 picks Halloween (option 1)
    bracketManager.voteInTiebreaker(GUILD_ID, tbId, 'tb-voter-1', 0);
    bracketManager.voteInTiebreaker(GUILD_ID, tbId, 'tb-voter-2', 0);
    bracketManager.voteInTiebreaker(GUILD_ID, tbId, 'tb-voter-3', 0);
    bracketManager.voteInTiebreaker(GUILD_ID, tbId, 'tb-voter-4', 1);

    bracketManager.closeTiebreaker(GUILD_ID, tbId);
    const finalizeResult = bracketManager.finalizeGroupAfterTiebreaker(GUILD_ID, tbId);

    expect(finalizeResult.success).toBe(true);

    const t = bracketManager.loadTournament(GUILD_ID);
    const gr = t.groupResults['A'];
    expect(gr.first.title).toBe('Ring');
    expect(gr.second).toBeDefined();
    expect(gr.second.title).toBe('Halloween');
    expect(t.groups['A'].status).toBe('closed');
    expect(t.groups['A'].votingOpen).toBe(false);
  });

  test('2nd-place tiebreaker: 1st place preserved, 2nd assigned from tiebreaker', () => {
    setupGroupTournament();
    // Ring wins 1st clearly (3 votes). Halloween and Psycho tied for 2nd (1 vote each).
    castGroupVote('user-1', 'A', 0, 1);
    castGroupVote('user-2', 'A', 0, 2);
    castGroupVote('user-3', 'A', 0, 3);

    const closeResult = bracketManager.closeGroupVoting(GUILD_ID, ['A']);
    expect(closeResult.tiebreakersCreated[0].position).toBe('2nd');

    const tbId = closeResult.tiebreakersCreated[0].tiebreaker.id;
    bracketManager.voteInTiebreaker(GUILD_ID, tbId, 'tb-voter-1', 0); // vote for option 0
    bracketManager.voteInTiebreaker(GUILD_ID, tbId, 'tb-voter-2', 0);
    bracketManager.closeTiebreaker(GUILD_ID, tbId);

    const fr = bracketManager.finalizeGroupAfterTiebreaker(GUILD_ID, tbId);
    expect(fr.success).toBe(true);

    const t = bracketManager.loadTournament(GUILD_ID);
    const gr = t.groupResults['A'];
    expect(gr.first.title).toBe('Ring'); // unchanged
    expect(gr.second).toBeDefined();
    expect(t.groups['A'].status).toBe('closed');
    expect(t.groups['A'].votingOpen).toBe(false);
  });

  test('cannot finalize before tiebreaker is closed', () => {
    setupGroupTournament();
    castGroupVote('user-1', 'A', 0, 2);
    castGroupVote('user-2', 'A', 0, 2);
    castGroupVote('user-3', 'A', 1, 2);
    castGroupVote('user-4', 'A', 1, 2);

    const closeResult = bracketManager.closeGroupVoting(GUILD_ID, ['A']);
    const tbId = closeResult.tiebreakersCreated[0].tiebreaker.id;

    // Attempt finalize WITHOUT closing tiebreaker first
    const fr = bracketManager.finalizeGroupAfterTiebreaker(GUILD_ID, tbId);
    expect(fr.success).toBe(false);
  });

  test('regression: finalized group rejects further votes (votingOpen must be false, not just status)', () => {
    // Guards against a real bug where finalizeGroupAfterTiebreaker set status='closed'
    // but left votingOpen=true, leaving voteGroupStage's votingOpen check as dead code
    // for tiebreaker-resolved groups (production incident: groups sat in this state
    // for hours before it was caught).
    setupGroupTournament();
    bracketManager.voteGroupStage(GUILD_ID, 'user-1', 'A', [0, 1]);
    bracketManager.voteGroupStage(GUILD_ID, 'user-2', 'A', [0, 1]);

    const closeResult = bracketManager.closeGroupVoting(GUILD_ID, ['A']);
    const tbId = closeResult.tiebreakersCreated[0].tiebreaker.id;
    bracketManager.voteInTiebreaker(GUILD_ID, tbId, 'tb-voter-1', 0);
    bracketManager.closeTiebreaker(GUILD_ID, tbId);
    bracketManager.finalizeGroupAfterTiebreaker(GUILD_ID, tbId);

    const t = bracketManager.loadTournament(GUILD_ID);
    expect(t.groups['A'].votingOpen).toBe(false);

    const voteResult = bracketManager.voteGroupStage(GUILD_ID, 'late-voter', 'A', [0]);
    expect(voteResult.success).toBe(false);
    expect(voteResult.error).toMatch(/not open for voting/);
  });
});

describe('manuallyResolveTiebreaker — admin override', () => {
  test('admin picks winner by index', () => {
    setupGroupTournament();
    bracketManager.voteGroupStage(GUILD_ID, 'user-1', 'A', [0, 1]);
    bracketManager.voteGroupStage(GUILD_ID, 'user-2', 'A', [0, 1]);

    const closeResult = bracketManager.closeGroupVoting(GUILD_ID, ['A']);
    const tb = closeResult.tiebreakersCreated[0].tiebreaker;

    // Admin picks option index 1 (Halloween)
    const r = bracketManager.manuallyResolveTiebreaker(GUILD_ID, tb.id, 1);
    expect(r.success).toBe(true);
    expect(r.winner.title).toBe('Halloween');
    expect(r.tiebreaker.manuallyResolved).toBe(true);
    expect(r.tiebreaker.status).toBe('closed');
  });

  test('manual resolve ignores existing votes', () => {
    setupGroupTournament();
    bracketManager.voteGroupStage(GUILD_ID, 'user-1', 'A', [0, 1]);
    bracketManager.voteGroupStage(GUILD_ID, 'user-2', 'A', [0, 1]);

    const closeResult = bracketManager.closeGroupVoting(GUILD_ID, ['A']);
    const tb = closeResult.tiebreakersCreated[0].tiebreaker;

    // 3 tiebreaker votes for option 0 (Ring)
    bracketManager.voteInTiebreaker(GUILD_ID, tb.id, 'v1', 0);
    bracketManager.voteInTiebreaker(GUILD_ID, tb.id, 'v2', 0);
    bracketManager.voteInTiebreaker(GUILD_ID, tb.id, 'v3', 0);

    // Admin overrides to pick option 1 (Halloween)
    const r = bracketManager.manuallyResolveTiebreaker(GUILD_ID, tb.id, 1);
    expect(r.winner.title).toBe('Halloween'); // admin's choice wins
  });

  test('invalid winner index returns error', () => {
    setupGroupTournament();
    castGroupVote('user-1', 'A', 0, 2);
    castGroupVote('user-2', 'A', 1, 2);

    const closeResult = bracketManager.closeGroupVoting(GUILD_ID, ['A']);
    const tb = closeResult.tiebreakersCreated[0];
    if (!tb) return; // no tie, skip

    const r = bracketManager.manuallyResolveTiebreaker(GUILD_ID, tb.tiebreaker.id, 99);
    expect(r.success).toBe(false);
  });
});

describe('Full end-to-end: tie → vote → finalize → knockout ready', () => {
  test('all 4 groups: 2 with ties resolved by voting, 2 clear winners → bracket generates', () => {
    setupGroupTournament();

    // Group A: Ring(0) and Halloween(1) genuinely tied for 1st
    // Both users vote for BOTH tied titles — full 2-vote entries
    bracketManager.voteGroupStage(GUILD_ID, 'u1', 'A', [0, 1]);
    bracketManager.voteGroupStage(GUILD_ID, 'u2', 'A', [0, 1]);

    // Group B: Scream(0) clear 1st (4v); The Witch(1) and Don't Look Now(2) tied 2nd (2v each)
    castGroupVote('u1', 'B', 0, 1); castGroupVote('u2', 'B', 0, 1);
    castGroupVote('u3', 'B', 0, 2); castGroupVote('u4', 'B', 0, 2);

    // Group C: Hereditary(0) clear winner (4 votes)
    castGroupVote('u1', 'C', 0, 1); castGroupVote('u2', 'C', 0, 2);
    castGroupVote('u3', 'C', 0, 3); castGroupVote('u4', 'C', 0, 1);

    // Group D: Jaws(0) clear winner (4 votes)
    castGroupVote('u1', 'D', 0, 1); castGroupVote('u2', 'D', 0, 2);
    castGroupVote('u3', 'D', 0, 3); castGroupVote('u4', 'D', 0, 1);

    const closeResult = bracketManager.closeGroupVoting(GUILD_ID, ['A', 'B', 'C', 'D']);
    expect(closeResult.success).toBe(true);
    expect(closeResult.tiebreakersCreated.length).toBeGreaterThanOrEqual(1);

    const tieGroups = closeResult.tiebreakersCreated.map(tb => tb.groupId);
    expect(tieGroups).toContain('A'); // 1st-place tie

    // Resolve each tiebreaker via votes
    for (const item of closeResult.tiebreakersCreated) {
      const tbId = item.tiebreaker.id;
      // Cast 3 votes for option 0, 1 for option 1
      bracketManager.voteInTiebreaker(GUILD_ID, tbId, 'tb-v1', 0);
      bracketManager.voteInTiebreaker(GUILD_ID, tbId, 'tb-v2', 0);
      bracketManager.voteInTiebreaker(GUILD_ID, tbId, 'tb-v3', 0);
      bracketManager.voteInTiebreaker(GUILD_ID, tbId, 'tb-v4', 1);

      bracketManager.closeTiebreaker(GUILD_ID, tbId);
      const fr = bracketManager.finalizeGroupAfterTiebreaker(GUILD_ID, tbId);
      expect(fr.success).toBe(true);
    }

    // All 4 group results should now be complete
    const t = bracketManager.loadTournament(GUILD_ID);
    for (const groupId of ['A', 'B', 'C', 'D']) {
      const gr = t.groupResults[groupId];
      expect(gr).toBeDefined();
      expect(gr.first).toBeDefined();
      expect(gr.second).toBeDefined();
      expect(t.groups[groupId].status).toBe('closed');
    }

    // Should be able to generate knockout bracket
    const wildcardResult = bracketManager.calculateWildcards(GUILD_ID);
    expect(wildcardResult.success).toBe(true);

    const bracketResult = bracketManager.generateKnockoutBracket(GUILD_ID);
    expect(bracketResult.success).toBe(true);
    expect(bracketResult.matchups.length).toBeGreaterThan(0);
  });
});

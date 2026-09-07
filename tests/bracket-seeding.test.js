/**
 * Regression tests for knockout bracket seeding.
 *
 * Group mode used to build round 1 by looping over group winners only and
 * pairing each with one entry from a shared runners-up + wildcards pool. That
 * seated exactly `groupCount * 2` participants and silently dropped every
 * leftover qualifier — at 36 titles all nine runners-up vanished from the
 * bracket with no error raised. These tests assert the invariant that was
 * missing: every qualifier reaches the bracket, exactly once.
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import * as bracketManager from '../src/utils/bracketManager.js';

const TOURNAMENT_DIR = path.join(process.cwd(), 'guild_tournaments');
const GUILD_IDS = [];

function guildFor(name) {
  const id = `test-seeding-${name}`;
  GUILD_IDS.push(id);
  return id;
}

function cleanup() {
  for (const id of GUILD_IDS) {
    const file = path.join(TOURNAMENT_DIR, `${id}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  GUILD_IDS.length = 0;
}

beforeEach(cleanup);
afterEach(cleanup);

/**
 * Build a group-mode tournament, run the group stage with a deterministic
 * no-tie vote pattern, and generate the knockout bracket.
 */
function runGroupStage(guildId, maxTitles) {
  bracketManager.createTournament(guildId, 'Seeding Test', 'creator-1', maxTitles);

  const groupCount = maxTitles / 4;
  const groupIds = 'ABCDEFGHIJKL'.slice(0, groupCount).split('');

  for (const groupId of groupIds) {
    for (let i = 0; i < 4; i++) {
      bracketManager.addTitle(guildId, groupId, 'movie', {
        title: `${groupId}${i}`,
        id: `${groupId}${i}`,
        year: 2000,
        type: 'movie',
      });
    }
  }

  bracketManager.openGroupVoting(guildId, groupIds);

  // Deterministic, tie-free: title 0 gets 3 votes, 1 gets 2, 2 gets 1, 3 gets 0.
  for (const groupId of groupIds) {
    bracketManager.voteGroupStage(guildId, 'voter-1', groupId, [0, 1]);
    bracketManager.voteGroupStage(guildId, 'voter-2', groupId, [0, 1]);
    bracketManager.voteGroupStage(guildId, 'voter-3', groupId, [0, 2]);
  }

  const closeResult = bracketManager.closeGroupVoting(guildId, groupIds);
  const wildcardResult = bracketManager.calculateWildcards(guildId);
  const generateResult = bracketManager.generateKnockoutBracket(guildId);

  return { groupIds, closeResult, wildcardResult, generateResult };
}

/** Collect the titles actually seated in the bracket's first round. */
function seatedTitles(tournament) {
  return tournament.knockoutBracket
    .filter(m => m.round === tournament.phase)
    .flatMap(m => [m.movie1?.title, m.movie2?.title])
    .filter(Boolean);
}

describe('Group mode seeds every qualifier', () => {
  test.each([36, 40, 44, 48])(
    '%i titles: winners, runners-up and wildcards all reach the bracket',
    maxTitles => {
      const guildId = guildFor(`groups-${maxTitles}`);
      const { groupIds, wildcardResult, generateResult } = runGroupStage(guildId, maxTitles);

      expect(generateResult.success).toBe(true);

      const tournament = bracketManager.loadTournament(guildId);
      const expected = [
        ...groupIds.map(g => tournament.groupResults[g].first.title),
        ...groupIds.map(g => tournament.groupResults[g].second.title),
        ...wildcardResult.wildcards.map(w => w.title),
      ];

      const seated = seatedTitles(tournament);

      expect(seated.length).toBe(expected.length);
      expect(new Set(seated).size).toBe(expected.length); // no duplicates
      expect([...seated].sort()).toEqual([...expected].sort());
    }
  );

  test('every runner-up is seated (the specific title class that used to vanish)', () => {
    const guildId = guildFor('runners-up');
    const { groupIds } = runGroupStage(guildId, 36);

    const tournament = bracketManager.loadTournament(guildId);
    const seated = seatedTitles(tournament);
    const runnersUp = groupIds.map(g => tournament.groupResults[g].second.title);

    expect(runnersUp).toHaveLength(9);
    for (const title of runnersUp) {
      expect(seated).toContain(title);
    }
  });

  test('bracket is a power-of-2 tree that halves each round down to one final', () => {
    const guildId = guildFor('tree-shape');
    runGroupStage(guildId, 36);

    const tournament = bracketManager.loadTournament(guildId);
    const counts = tournament.knockoutBracket.reduce((acc, m) => {
      acc[m.round] = (acc[m.round] || 0) + 1;
      return acc;
    }, {});

    expect(counts).toEqual({
      round_of_32: 16,
      round_of_16: 8,
      quarterfinals: 4,
      semifinals: 2,
      finals: 1,
    });
  });

  test('titles from the same group do not meet in the first round', () => {
    const guildId = guildFor('no-same-group');
    runGroupStage(guildId, 48); // full 32-slot field, no byes

    const tournament = bracketManager.loadTournament(guildId);
    const collisions = tournament.knockoutBracket.filter(
      m => m.round === tournament.phase && m.movie1 && m.movie2 &&
        m.movie1.groupId && m.movie1.groupId === m.movie2.groupId
    );

    expect(collisions).toHaveLength(0);
  });

  test('group results carry the groupId needed for same-group separation', () => {
    const guildId = guildFor('group-id');
    const { groupIds } = runGroupStage(guildId, 36);

    const tournament = bracketManager.loadTournament(guildId);
    for (const groupId of groupIds) {
      expect(tournament.groupResults[groupId].first.groupId).toBe(groupId);
      expect(tournament.groupResults[groupId].second.groupId).toBe(groupId);
    }
  });
});

describe('Wildcard allocation', () => {
  test.each([
    [9, 9],
    [10, 10],
    [11, 10],
    [12, 8],
  ])('%i groups never asks for more wildcards than there are third places', (groupCount, expected) => {
    expect(bracketManager.calculateWildcardCount(groupCount)).toBe(expected);
  });

  test('wildcardsNeeded matches the number actually allocated', () => {
    const guildId = guildFor('wildcard-count');
    const { wildcardResult } = runGroupStage(guildId, 36);

    const tournament = bracketManager.loadTournament(guildId);
    expect(wildcardResult.wildcards).toHaveLength(tournament.wildcardsNeeded);
  });
});

describe('Byes', () => {
  test('a non-power-of-2 field gives byes that auto-advance without a vote', () => {
    const guildId = guildFor('byes');
    runGroupStage(guildId, 36); // 27 qualifiers -> 32-slot bracket -> 5 byes

    const tournament = bracketManager.loadTournament(guildId);
    const byes = tournament.knockoutBracket.filter(m => m.isBye);

    expect(byes).toHaveLength(5);
    for (const bye of byes) {
      expect(bye.movie1).not.toBeNull();
      expect(bye.movie2).toBeNull();
      expect(bye.status).toBe('closed');
      expect(bye.winner).toEqual(bye.movie1);
    }

    // Bye winners are already sitting in the next round.
    const nextRound = tournament.knockoutBracket.filter(m => m.round === 'round_of_16');
    const filled = nextRound.flatMap(m => [m.movie1, m.movie2]).filter(Boolean);
    expect(filled.length).toBe(byes.length);
  });
});

describe('Bracket mode still seats every title', () => {
  test.each([2, 4, 8, 16, 32])('%i titles all reach the first round', maxTitles => {
    const guildId = guildFor(`bracket-${maxTitles}`);
    bracketManager.createTournament(guildId, 'Bracket Test', 'creator-1', maxTitles);

    for (let i = 0; i < maxTitles; i++) {
      bracketManager.addTitle(guildId, null, 'movie', {
        title: `M${i}`,
        id: `m${i}`,
        year: 2000,
        type: 'movie',
      });
    }

    const result = bracketManager.generateKnockoutBracket(guildId);
    expect(result.success).toBe(true);

    const tournament = bracketManager.loadTournament(guildId);
    const seated = seatedTitles(tournament);

    expect(seated).toHaveLength(maxTitles);
    expect(new Set(seated).size).toBe(maxTitles);
  });
});

describe('Knockout runs to a single champion', () => {
  test.each([36, 48])('%i titles plays out to one winner', maxTitles => {
    const guildId = guildFor(`champion-${maxTitles}`);
    runGroupStage(guildId, maxTitles);

    // Play every round: open, vote (movie1 wins), close.
    for (let guard = 0; guard < 10; guard++) {
      const tournament = bracketManager.loadTournament(guildId);
      if (tournament.status === 'completed') break;

      bracketManager.openKnockoutRound(guildId, tournament.phase);

      const open = bracketManager
        .loadTournament(guildId)
        .knockoutBracket.filter(m => m.round === tournament.phase && m.status === 'voting');

      open.forEach((matchup, i) => {
        bracketManager.voteKnockout(guildId, `k-voter-${i}`, matchup.id, 1);
      });
      for (const matchup of open) {
        bracketManager.closeKnockoutMatchup(guildId, matchup.id);
      }
    }

    const final = bracketManager.loadTournament(guildId);
    expect(final.status).toBe('completed');
    expect(final.winner).toBeDefined();
    expect(final.winner.title).toBeDefined();
  });
});

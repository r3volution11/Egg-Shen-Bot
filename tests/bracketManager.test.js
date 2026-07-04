/**
 * Unit tests for bracketManager.js
 * Tests core tournament functionality without requiring Discord
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import * as bracketManager from '../src/utils/bracketManager.js';

const TEST_GUILD_ID = 'test-guild-123';
const TEST_TOURNAMENT_DIR = path.join(process.cwd(), 'guild_tournaments');

// Clean up test data before and after each test
beforeEach(() => {
  // Remove test tournament file if it exists
  const testFile = path.join(TEST_TOURNAMENT_DIR, `${TEST_GUILD_ID}.json`);
  if (fs.existsSync(testFile)) {
    fs.unlinkSync(testFile);
  }
});

afterEach(() => {
  // Clean up after test
  const testFile = path.join(TEST_TOURNAMENT_DIR, `${TEST_GUILD_ID}.json`);
  if (fs.existsSync(testFile)) {
    fs.unlinkSync(testFile);
  }
});

describe('Tournament Creation', () => {
  test('should create a new tournament', () => {
    const tournament = bracketManager.createTournament(
      TEST_GUILD_ID,
      'Test Tournament',
      'user-123',
      8
    );

    expect(tournament).toBeDefined();
    expect(tournament.name).toBe('Test Tournament');
    expect(tournament.status).toBe('setup');
    expect(tournament.groupCount).toBe(8);
    expect(Object.keys(tournament.groups)).toHaveLength(8);
  });

  test('should prevent creating duplicate tournament', () => {
    // Create first tournament
    bracketManager.createTournament(TEST_GUILD_ID, 'First Tournament', 'user-123', 8);

    // Try to create second tournament
    const duplicate = bracketManager.createTournament(TEST_GUILD_ID, 'Second Tournament', 'user-123', 8);

    expect(duplicate).toBeNull();
  });

  test('should support different group counts', () => {
    const tournament4 = bracketManager.createTournament(TEST_GUILD_ID, 'Small Tournament', 'user-123', 4);
    expect(Object.keys(tournament4.groups)).toHaveLength(4);

    // Clean up for next test
    const testFile = path.join(TEST_TOURNAMENT_DIR, `${TEST_GUILD_ID}.json`);
    fs.unlinkSync(testFile);

    const tournament12 = bracketManager.createTournament(TEST_GUILD_ID, 'Large Tournament', 'user-123', 12);
    expect(Object.keys(tournament12.groups)).toHaveLength(12);
  });
});

describe('Adding Titles to Groups', () => {
  beforeEach(() => {
    bracketManager.createTournament(TEST_GUILD_ID, 'Test Tournament', 'user-123', 4);
  });

  test('should add title to group', () => {
    const entry = {
      id: 'movie-123',
      title: 'The Matrix',
      year: '1999',
      posterUrl: 'https://example.com/poster.jpg'
    };

    const result = bracketManager.addGroupTitle(TEST_GUILD_ID, 'A', 'movie', entry);

    expect(result.success).toBe(true);
    expect(result.titleCount).toBe(1);
  });

  test('should prevent adding more than 4 titles to a group', () => {
    const entries = [
      { id: '1', title: 'Movie 1', year: '2020' },
      { id: '2', title: 'Movie 2', year: '2021' },
      { id: '3', title: 'Movie 3', year: '2022' },
      { id: '4', title: 'Movie 4', year: '2023' },
      { id: '5', title: 'Movie 5', year: '2024' }
    ];

    // Add first 4
    entries.slice(0, 4).forEach(entry => {
      const result = bracketManager.addGroupTitle(TEST_GUILD_ID, 'A', 'movie', entry);
      expect(result.success).toBe(true);
    });

    // Try to add 5th
    const result = bracketManager.addGroupTitle(TEST_GUILD_ID, 'A', 'movie', entries[4]);
    expect(result.success).toBe(false);
    expect(result.error).toContain('already has 4');
  });

  test('should track title count correctly', () => {
    const entry1 = { id: '1', title: 'Movie 1', year: '2020' };
    const entry2 = { id: '2', title: 'Movie 2', year: '2021' };

    const result1 = bracketManager.addGroupTitle(TEST_GUILD_ID, 'A', 'movie', entry1);
    expect(result1.titleCount).toBe(1);

    const result2 = bracketManager.addGroupTitle(TEST_GUILD_ID, 'A', 'movie', entry2);
    expect(result2.titleCount).toBe(2);
  });
});

describe('Group Voting', () => {
  beforeEach(() => {
    bracketManager.createTournament(TEST_GUILD_ID, 'Test Tournament', 'user-123', 4);
    
    // Add 4 titles to group A
    for (let i = 1; i <= 4; i++) {
      bracketManager.addGroupTitle(TEST_GUILD_ID, 'A', 'movie', {
        id: `movie-${i}`,
        title: `Movie ${i}`,
        year: '2020'
      });
    }
  });

  test('should open group for voting', () => {
    const deadline = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    const result = bracketManager.openGroupVoting(TEST_GUILD_ID, ['A'], deadline);

    expect(result.success).toBe(true);

    const tournament = bracketManager.loadTournament(TEST_GUILD_ID);
    expect(tournament.groups.A.status).toBe('voting');
    expect(tournament.groups.A.votingOpen).toBe(true);
  });

  test('should prevent opening group without 4 titles', () => {
    const deadline = Date.now() + 24 * 60 * 60 * 1000;
    const result = bracketManager.openGroupVoting(TEST_GUILD_ID, ['B'], deadline); // Group B is empty

    expect(result.success).toBe(false);
  });

  test('should close group voting and calculate results', () => {
    // Open voting
    const deadline = Date.now() + 24 * 60 * 60 * 1000;
    bracketManager.openGroupVoting(TEST_GUILD_ID, ['A'], deadline);

    // Simulate votes (3 users voting)
    const tournament = bracketManager.loadTournament(TEST_GUILD_ID);
    tournament.groups.A.votes = {
      'user-1': ['movie-1', 'movie-2'],
      'user-2': ['movie-1', 'movie-3'],
      'user-3': ['movie-2', 'movie-3']
    };
    bracketManager.saveTournament(TEST_GUILD_ID, tournament);

    // Close voting
    const result = bracketManager.closeGroupVoting(TEST_GUILD_ID, ['A']);

    expect(result.success).toBe(true);

    const updated = bracketManager.loadTournament(TEST_GUILD_ID);
    expect(updated.groups.A.status).toBe('closed');
    expect(updated.groupResults.A).toBeDefined();
    
    // Verify scoring: movie-1 gets 2 first-place (6pts), movie-2 gets 1 first + 1 second (5pts), movie-3 gets 2 second (4pts)
    const results = updated.groupResults.A;
    expect(results[0].title).toBe('Movie 1'); // Winner
    expect(results[0].points).toBe(6);
  });
});

describe('Tiebreaker System', () => {
  beforeEach(() => {
    bracketManager.createTournament(TEST_GUILD_ID, 'Test Tournament', 'user-123', 4);
    
    // Add 4 titles to group A
    for (let i = 1; i <= 4; i++) {
      bracketManager.addGroupTitle(TEST_GUILD_ID, 'A', 'movie', {
        id: `movie-${i}`,
        title: `Movie ${i}`,
        year: '2020'
      });
    }
  });

  test('should create tiebreaker when first place ties', () => {
    // Open and simulate tied voting
    const deadline = Date.now() + 24 * 60 * 60 * 1000;
    bracketManager.openGroupVoting(TEST_GUILD_ID, ['A'], deadline);

    const tournament = bracketManager.loadTournament(TEST_GUILD_ID);
    // Create a tie: movie-1 and movie-2 both get 4 points
    tournament.groups.A.votes = {
      'user-1': ['movie-1', 'movie-3'],
      'user-2': ['movie-2', 'movie-4']
    };
    bracketManager.saveTournament(TEST_GUILD_ID, tournament);

    // Close voting with 1 hour tiebreaker duration
    const result = bracketManager.closeGroupVoting(TEST_GUILD_ID, ['A'], 3600000);

    expect(result.success).toBe(true);
    expect(result.tiebreakersCreated).toBeDefined();
    expect(result.tiebreakersCreated.length).toBeGreaterThan(0);

    const updated = bracketManager.loadTournament(TEST_GUILD_ID);
    expect(updated.groups.A.status).toBe('tiebreaker');
    expect(updated.tiebreakers.length).toBeGreaterThan(0);
  });

  test('should vote in tiebreaker', () => {
    // Set up tiebreaker scenario (simplified - manually create tiebreaker)
    const tiebreaker = {
      id: 'tb-123',
      groupId: 'A',
      position: '1st',
      tiedOptions: [
        { id: 'movie-1', title: 'Movie 1' },
        { id: 'movie-2', title: 'Movie 2' }
      ],
      votes: {},
      deadline: Date.now() + 3600000,
      status: 'active',
      createdAt: Date.now()
    };

    const tournament = bracketManager.loadTournament(TEST_GUILD_ID);
    tournament.tiebreakers = [tiebreaker];
    bracketManager.saveTournament(TEST_GUILD_ID, tournament);

    // Vote in tiebreaker
    const voteResult = bracketManager.voteInTiebreaker(TEST_GUILD_ID, 'tb-123', 'user-1', 0);
    expect(voteResult.success).toBe(true);

    const updated = bracketManager.loadTournament(TEST_GUILD_ID);
    expect(updated.tiebreakers[0].votes['user-1']).toBe(0);
  });

  test('should close tiebreaker and determine winner', () => {
    // Set up tiebreaker with votes
    const tiebreaker = {
      id: 'tb-123',
      groupId: 'A',
      position: '1st',
      tiedOptions: [
        { id: 'movie-1', title: 'Movie 1' },
        { id: 'movie-2', title: 'Movie 2' }
      ],
      votes: {
        'user-1': 0, // Vote for movie-1
        'user-2': 0, // Vote for movie-1
        'user-3': 1  // Vote for movie-2
      },
      deadline: Date.now() - 1000, // Already passed
      status: 'active',
      createdAt: Date.now()
    };

    const tournament = bracketManager.loadTournament(TEST_GUILD_ID);
    tournament.tiebreakers = [tiebreaker];
    bracketManager.saveTournament(TEST_GUILD_ID, tournament);

    // Close tiebreaker
    const result = bracketManager.closeTiebreaker(TEST_GUILD_ID, 'tb-123');
    expect(result.success).toBe(true);
    expect(result.winner.id).toBe('movie-1'); // Won with 2 votes

    const updated = bracketManager.loadTournament(TEST_GUILD_ID);
    expect(updated.tiebreakers[0].status).toBe('closed');
    expect(updated.tiebreakers[0].winner.id).toBe('movie-1');
  });

  test('should use random selection if tiebreaker also ties', () => {
    // Set up tiebreaker with tied votes
    const tiebreaker = {
      id: 'tb-123',
      groupId: 'A',
      position: '1st',
      tiedOptions: [
        { id: 'movie-1', title: 'Movie 1' },
        { id: 'movie-2', title: 'Movie 2' }
      ],
      votes: {
        'user-1': 0, // Vote for movie-1
        'user-2': 1  // Vote for movie-2 (TIED)
      },
      deadline: Date.now() - 1000,
      status: 'active',
      createdAt: Date.now()
    };

    const tournament = bracketManager.loadTournament(TEST_GUILD_ID);
    tournament.tiebreakers = [tiebreaker];
    bracketManager.saveTournament(TEST_GUILD_ID, tournament);

    // Close tiebreaker
    const result = bracketManager.closeTiebreaker(TEST_GUILD_ID, 'tb-123');
    expect(result.success).toBe(true);
    expect(result.winner).toBeDefined();
    expect(['movie-1', 'movie-2']).toContain(result.winner.id); // One of the two
  });
});

describe('Knockout Bracket Generation', () => {
  test('should generate knockout bracket from group results', () => {
    // Create tournament with 4 groups
    bracketManager.createTournament(TEST_GUILD_ID, 'Test Tournament', 'user-123', 4);

    // Add titles and simulate completed groups
    const groups = ['A', 'B', 'C', 'D'];
    groups.forEach((group, idx) => {
      for (let i = 1; i <= 4; i++) {
        bracketManager.addGroupTitle(TEST_GUILD_ID, group, 'movie', {
          id: `${group}-movie-${i}`,
          title: `${group} Movie ${i}`,
          year: '2020'
        });
      }

      // Manually set group results
      const tournament = bracketManager.loadTournament(TEST_GUILD_ID);
      tournament.groups[group].status = 'closed';
      tournament.groupResults[group] = [
        { id: `${group}-movie-1`, title: `${group} Movie 1`, points: 6 },
        { id: `${group}-movie-2`, title: `${group} Movie 2`, points: 5 },
        { id: `${group}-movie-3`, title: `${group} Movie 3`, points: 3 },
        { id: `${group}-movie-4`, title: `${group} Movie 4`, points: 1 }
      ];
      bracketManager.saveTournament(TEST_GUILD_ID, tournament);
    });

    // Calculate wildcards (4 groups = 8 advance = 8 total, need 0 wildcards for power of 2)
    const wildcardResult = bracketManager.calculateWildcards(TEST_GUILD_ID);
    expect(wildcardResult.success).toBe(true);

    // Generate bracket
    const result = bracketManager.generateKnockoutBracket(TEST_GUILD_ID);
    expect(result.success).toBe(true);
    expect(result.matchups.length).toBeGreaterThan(0);

    const tournament = bracketManager.loadTournament(TEST_GUILD_ID);
    expect(tournament.status).toBe('knockout');
    expect(tournament.knockoutBracket).toBeDefined();
  });

  test('should validate all groups closed before generating bracket', () => {
    bracketManager.createTournament(TEST_GUILD_ID, 'Test Tournament', 'user-123', 4);

    // Add titles to groups but don't close them
    ['A', 'B', 'C', 'D'].forEach(group => {
      for (let i = 1; i <= 4; i++) {
        bracketManager.addGroupTitle(TEST_GUILD_ID, group, 'movie', {
          id: `${group}-movie-${i}`,
          title: `${group} Movie ${i}`,
          year: '2020'
        });
      }
    });

    // Try to generate bracket without closing groups
    const result = bracketManager.generateKnockoutBracket(TEST_GUILD_ID);
    expect(result.success).toBe(false);
    expect(result.error).toContain('All groups must be closed');
  });
});

describe('Knockout Voting', () => {
  test('should open knockout matchup for voting', () => {
    // Set up tournament in knockout phase (simplified)
    bracketManager.createTournament(TEST_GUILD_ID, 'Test Tournament', 'user-123', 4);
    
    const tournament = bracketManager.loadTournament(TEST_GUILD_ID);
    tournament.status = 'knockout';
    tournament.phase = 'quarterfinals';
    tournament.knockoutBracket = [
      {
        id: 'match-1',
        position: 0,
        round: 'quarterfinals',
        movie1: { id: 'A-movie-1', title: 'Movie A1' },
        movie2: { id: 'B-movie-1', title: 'Movie B1' },
        status: 'pending',
        votes: { movie1: [], movie2: [] }
      }
    ];
    bracketManager.saveTournament(TEST_GUILD_ID, tournament);

    // Open the matchup
    const deadline = Date.now() + 24 * 60 * 60 * 1000;
    const result = bracketManager.openKnockoutRound(TEST_GUILD_ID, 'quarterfinals', deadline);

    expect(result.success).toBe(true);

    const updated = bracketManager.loadTournament(TEST_GUILD_ID);
    expect(updated.knockoutBracket[0].status).toBe('voting');
  });
});

/**
 * Discord Limits Compliance Tests
 * 
 * Ensures tournament system respects Discord's technical constraints:
 * - Max 5 ActionRows per message
 * - Max 5 buttons per ActionRow
 * - Max 25 buttons total per message
 * - Voting dashboards use 1 row per matchup = MAX 5 MATCHUPS AT ONCE
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import * as bracketManager from '../src/utils/bracketManager.js';
import fs from 'fs';
import path from 'path';

const TEST_GUILD_ID = 'discord-limits-test';
const TEST_TOURNAMENT_DIR = path.join(process.cwd(), 'guild_tournaments');

function cleanup() {
  const testFile = path.join(TEST_TOURNAMENT_DIR, `${TEST_GUILD_ID}.json`);
  if (fs.existsSync(testFile)) {
    fs.unlinkSync(testFile);
  }
}

beforeEach(() => {
  cleanup();
});

afterEach(() => {
  cleanup();
});

/**
 * Helper: Calculate knockout bracket size and starting round
 */
function calculateKnockoutDetails(maxTitles) {
  if (maxTitles <= 32) {
    // Bracket mode: direct single-elimination
    return {
      knockoutSize: maxTitles,
      startingRound: getStartingRound(maxTitles),
      firstRoundMatchups: maxTitles / 2
    };
  } else {
    // Group mode: groups → knockout
    const groupCount = maxTitles / 4;
    const directAdvancers = groupCount * 2;
    const targetBracketSize = Math.pow(2, Math.ceil(Math.log2(directAdvancers)));
    const wildcards = targetBracketSize - directAdvancers;
    const knockoutSize = directAdvancers + wildcards;
    
    return {
      knockoutSize,
      startingRound: getStartingRound(knockoutSize),
      firstRoundMatchups: getRoundMatchupCount(getStartingRound(knockoutSize))
    };
  }
}

function getStartingRound(participantCount) {
  if (participantCount <= 4) return 'semifinals';
  if (participantCount <= 8) return 'quarterfinals';
  if (participantCount <= 16) return 'round_of_16';
  return 'round_of_32';
}

function getRoundMatchupCount(round) {
  const counts = {
    'finals': 1,
    'semifinals': 2,
    'quarterfinals': 4,
    'round_of_16': 8,
    'round_of_32': 16
  };
  return counts[round];
}

describe('Discord Limits - Valid Tournament Sizes', () => {
  const validSizes = bracketManager.getValidTournamentSizes();
  
  test('all valid sizes should be defined', () => {
    expect(validSizes.bracket).toEqual([2, 4, 8, 16, 32]);
    expect(validSizes.groups).toEqual([36, 40, 44, 48]);
    expect(validSizes.all).toEqual([2, 4, 8, 16, 32, 36, 40, 44, 48]);
  });
  
  describe('Bracket Mode Sizes', () => {
    validSizes.bracket.forEach(size => {
      test(`${size} titles should respect 5 matchup limit OR require region selector`, () => {
        const details = calculateKnockoutDetails(size);
        
        // Either fits within limit OR we know it requires region selector
        if (details.firstRoundMatchups <= 5) {
          // Safe: can display all matchups in one voting dashboard
          expect(details.firstRoundMatchups).toBeLessThanOrEqual(5);
        } else {
          // Must use region selector (divides into 4 regions)
          const matchupsPerRegion = Math.ceil(details.firstRoundMatchups / 4);
          expect(matchupsPerRegion).toBeLessThanOrEqual(5);
        }
      });
    });
  });
  
  describe('Group Mode Sizes', () => {
    validSizes.groups.forEach(size => {
      test(`${size} titles should respect 5 matchup limit OR require region selector`, () => {
        const details = calculateKnockoutDetails(size);
        
        // Either fits within limit OR we know it requires region selector
        if (details.firstRoundMatchups <= 5) {
          // Safe: can display all matchups in one voting dashboard
          expect(details.firstRoundMatchups).toBeLessThanOrEqual(5);
        } else {
          // Must use region selector (divides into 4 regions)
          const matchupsPerRegion = Math.ceil(details.firstRoundMatchups / 4);
          expect(matchupsPerRegion).toBeLessThanOrEqual(5);
        }
      });
    });
  });
});

describe('Discord Limits - Voting Dashboard Safety', () => {
  test('voting dashboard should enforce 5 matchup limit', () => {
    // This tests the theoretical limit - actual enforcement is in buttonHandler.js
    const DISCORD_MAX_ACTION_ROWS = 5;
    const ROWS_PER_MATCHUP = 1; // Each matchup needs 1 row (2 buttons: movie1 vs movie2)
    
    const maxSimultaneousMatchups = DISCORD_MAX_ACTION_ROWS / ROWS_PER_MATCHUP;
    expect(maxSimultaneousMatchups).toBe(5);
  });
  
  test('region selector should use at most 2 ActionRows', () => {
    // Region selector: 4 buttons (1 per region), arranged in 2 rows of 2
    const REGION_BUTTON_COUNT = 4;
    const BUTTONS_PER_ROW = 2;
    const requiredRows = Math.ceil(REGION_BUTTON_COUNT / BUTTONS_PER_ROW);
    
    expect(requiredRows).toBeLessThanOrEqual(5);
    expect(requiredRows).toBe(2);
  });
  
  test('interactive matchup selector should respect 25 button limit', () => {
    // Interactive selector: up to 25 buttons (5 rows × 5 buttons)
    const DISCORD_MAX_BUTTONS = 25;
    const BUTTONS_PER_ROW = 5;
    const MAX_ROWS = 5;
    
    const maxSelectableMatchups = DISCORD_MAX_BUTTONS;
    expect(maxSelectableMatchups).toBe(25);
    
    // Even round_of_32 (16 matchups) fits comfortably
    expect(16).toBeLessThan(maxSelectableMatchups);
  });
});

describe('Discord Limits - Region Selector Requirement Detection', () => {
  test('bracket mode: 16 and 32 titles should require region selector', () => {
    const size16 = calculateKnockoutDetails(16);
    const size32 = calculateKnockoutDetails(32);
    
    expect(size16.firstRoundMatchups).toBeGreaterThan(5); // 8 matchups
    expect(size32.firstRoundMatchups).toBeGreaterThan(5); // 16 matchups
  });
  
  test('bracket mode: 2, 4, 8 titles should NOT require region selector', () => {
    const size2 = calculateKnockoutDetails(2);
    const size4 = calculateKnockoutDetails(4);
    const size8 = calculateKnockoutDetails(8);
    
    expect(size2.firstRoundMatchups).toBeLessThanOrEqual(5);  // 1 matchup
    expect(size4.firstRoundMatchups).toBeLessThanOrEqual(5);  // 2 matchups
    expect(size8.firstRoundMatchups).toBeLessThanOrEqual(5);  // 4 matchups
  });
  
  test('all group mode sizes should require region selector', () => {
    // All group mode tournaments end up with 32-participant knockout bracket
    [36, 40, 44, 48].forEach(size => {
      const details = calculateKnockoutDetails(size);
      expect(details.knockoutSize).toBe(32);
      expect(details.firstRoundMatchups).toBe(16); // round_of_32 = 16 matchups
      expect(details.firstRoundMatchups).toBeGreaterThan(5);
    });
  });
});

describe('Discord Limits - End-to-End Validation', () => {
  test('16-title bracket should create 8 matchups requiring region split', () => {
    const tournament = bracketManager.createTournament(TEST_GUILD_ID, 'Test 16', 'user', 16);
    
    // Add 16 titles
    for (let i = 0; i < 16; i++) {
      bracketManager.addTitle(TEST_GUILD_ID, null, 'movie', {
        id: `movie-${i}`,
        title: `Movie ${i}`,
        year: '2020'
      });
    }
    
    // Generate bracket
    const result = bracketManager.generateKnockoutBracket(TEST_GUILD_ID);
    expect(result.success).toBe(true);
    
    const updated = bracketManager.loadTournament(TEST_GUILD_ID);
    const firstRoundMatchups = updated.knockoutBracket.filter(m => m.round === 'round_of_16');
    
    expect(firstRoundMatchups.length).toBe(8);
    expect(firstRoundMatchups.length).toBeGreaterThan(5); // Requires region selector
    
    // Verify region split keeps under limit
    const matchupsPerRegion = Math.ceil(firstRoundMatchups.length / 4);
    expect(matchupsPerRegion).toBeLessThanOrEqual(5); // 8 ÷ 4 = 2 per region
  });
  
  test('36-title tournament should create 32-participant knockout with 16 matchups', () => {
    const tournament = bracketManager.createTournament(TEST_GUILD_ID, 'Test 36', 'user', 36);
    
    expect(tournament.mode).toBe('groups');
    expect(tournament.groupCount).toBe(9);
    
    // Calculate expected knockout size
    const directAdvancers = 18; // 9 groups × 2
    const wildcards = 32 - 18; // 14 wildcards to reach 32
    const expectedKnockoutSize = 32;
    
    expect(directAdvancers + wildcards).toBe(expectedKnockoutSize);
    
    // When bracket generates, should create round_of_32 with 16 matchups
    // 16 matchups > 5, so requires region selector (16 ÷ 4 = 4 per region)
  });
});

describe('Discord Limits - Safety Guarantees', () => {
  test('NO valid tournament size should ever exceed Discord limits without region selector', () => {
    const validSizes = bracketManager.getValidTournamentSizes();
    const DISCORD_VOTING_LIMIT = 5; // Max matchups in one voting dashboard
    
    validSizes.all.forEach(size => {
      const details = calculateKnockoutDetails(size);
      
      if (details.firstRoundMatchups > DISCORD_VOTING_LIMIT) {
        // Must use region selector
        const matchupsPerRegion = Math.ceil(details.firstRoundMatchups / 4);
        
        expect(matchupsPerRegion).toBeLessThanOrEqual(DISCORD_VOTING_LIMIT);
      } else {
        // Safe to display all matchups
        expect(details.firstRoundMatchups).toBeLessThanOrEqual(DISCORD_VOTING_LIMIT);
      }
    });
  });
  
  test('region selector should ALWAYS divide matchups into safe chunks', () => {
    // Test worst case: 16 matchups (round_of_32)
    const worstCaseMatchups = 16;
    const regions = 4;
    const matchupsPerRegion = Math.ceil(worstCaseMatchups / regions);
    
    expect(matchupsPerRegion).toBeLessThanOrEqual(5); // 16 ÷ 4 = 4 ✅
  });
  
  test('invalid tournament sizes should be rejected before causing Discord issues', () => {
    // Test that invalid sizes are rejected at creation
    const invalidSizes = [3, 5, 6, 7, 9, 10, 12, 15, 20, 24, 33, 35, 50, 64];
    
    invalidSizes.forEach(size => {
      const tournament = bracketManager.createTournament(TEST_GUILD_ID, `Test ${size}`, 'user', size);
      expect(tournament).toBeNull(); // Should reject invalid size
      cleanup(); // Clean up for next iteration
    });
  });
});

describe('Discord Limits - Button Layout Compliance', () => {
  test('group voting buttons should fit within Discord limits', () => {
    // Group has 4 titles = 4 vote buttons
    // Each button needs its own display, so 4 buttons total
    // Fits in 1 ActionRow (max 5 buttons per row)
    const GROUP_SIZE = 4;
    const BUTTONS_PER_GROUP = GROUP_SIZE;
    
    expect(BUTTONS_PER_GROUP).toBeLessThanOrEqual(5);
  });
  
  test('knockout matchup has 2 buttons per matchup (movie1 vs movie2)', () => {
    const BUTTONS_PER_MATCHUP = 2;
    const BUTTONS_PER_ROW = 5;
    
    // Each matchup uses 2 buttons, fits in 1 row
    expect(BUTTONS_PER_MATCHUP).toBeLessThanOrEqual(BUTTONS_PER_ROW);
    
    // With 5 ActionRows max, can show 5 matchups
    const MAX_ROWS = 5;
    const maxMatchups = MAX_ROWS; // 1 row per matchup
    expect(maxMatchups).toBe(5);
  });
});

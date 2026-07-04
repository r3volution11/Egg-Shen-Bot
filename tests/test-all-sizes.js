/**
 * Comprehensive Test: All Valid Tournament Sizes
 * Tests each valid tournament size (2, 4, 8, 16, 32, 36, 40, 44, 48)
 * Run with: node tests/test-all-sizes.js
 */

import * as bracketManager from '../src/utils/bracketManager.js';
import fs from 'fs';
import path from 'path';

const TEST_GUILD_ID = 'size-test-guild';
const TEST_TOURNAMENT_DIR = path.join(process.cwd(), 'guild_tournaments');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bright: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function cleanup() {
  const testFile = path.join(TEST_TOURNAMENT_DIR, `${TEST_GUILD_ID}.json`);
  if (fs.existsSync(testFile)) {
    fs.unlinkSync(testFile);
  }
}

function testTournamentSize(maxTitles) {
  cleanup();
  
  log(`\n${'='.repeat(60)}`, 'bright');
  log(`Testing ${maxTitles} titles`, 'bright');
  log('='.repeat(60), 'bright');
  
  // Step 1: Create tournament
  const tournament = bracketManager.createTournament(
    TEST_GUILD_ID,
    `Test Tournament (${maxTitles} titles)`,
    'test-user',
    maxTitles
  );
  
  if (!tournament) {
    log(`❌ FAILED: Could not create tournament with ${maxTitles} titles`, 'red');
    return false;
  }
  
  log(`✓ Tournament created`, 'green');
  log(`  Mode: ${tournament.mode}`, 'cyan');
  log(`  Max Titles: ${tournament.maxTitles}`, 'cyan');
  
  if (tournament.mode === 'groups') {
    log(`  Groups: ${tournament.groupCount}`, 'cyan');
    
    // Verify group count is correct
    const expectedGroups = maxTitles / 4;
    if (tournament.groupCount !== expectedGroups) {
      log(`❌ FAILED: Expected ${expectedGroups} groups, got ${tournament.groupCount}`, 'red');
      return false;
    }
  }
  
  // Step 2: Add minimum titles to test structure
  const titlesToAdd = Math.min(maxTitles, tournament.mode === 'bracket' ? maxTitles : 8);
  log(`\nAdding ${titlesToAdd} sample titles...`, 'yellow');
  
  // Generate enough unique movies for any tournament size
  const movies = [
    'The Thing', 'Alien', 'The Exorcist', 'The Shining',
    'Hereditary', 'Midsommar', 'The Witch', 'It Follows',
    'Evil Dead', 'Halloween', 'Scream', 'The Ring',
    'The Descent', '28 Days Later', 'Nightmare on Elm Street', 'Saw',
    'Sinister', 'Insidious', 'Conjuring', 'Annabelle',
    'Get Out', 'Us', 'Nope', 'Candyman',
    'Texas Chainsaw Massacre', 'Poltergeist', 'Carrie', 'Rosemary\'s Baby',
    'The Omen', 'Suspiria', 'Don\'t Look Now', 'Black Christmas'
  ];
  
  for (let i = 0; i < titlesToAdd; i++) {
    const entry = {
      id: `movie-${i + 1}`,
      title: movies[i] + (i >= movies.length ? ` Part ${Math.floor(i / movies.length) + 1}` : ''),
      year: '2020',
      posterUrl: `https://example.com/poster${i}.jpg`
    };
    
    let result;
    if (tournament.mode === 'bracket') {
      result = bracketManager.addTitle(TEST_GUILD_ID, null, 'movie', entry);
    } else {
      // Add to groups in sequence
      const groupIndex = Math.floor(i / 4);
      const groupLetter = String.fromCharCode(65 + groupIndex); // A, B, C, etc.
      result = bracketManager.addGroupTitle(TEST_GUILD_ID, groupLetter, 'movie', entry);
    }
    
    if (!result.success) {
      log(`❌ FAILED: Could not add title ${i + 1}: ${result.error}`, 'red');
      return false;
    }
  }
  
  log(`✓ Added ${titlesToAdd} titles successfully`, 'green');
  
  // Step 3: Test bracket generation
  if (tournament.mode === 'bracket') {
    log(`\nGenerating bracket...`, 'yellow');
    const bracketResult = bracketManager.generateKnockoutBracket(TEST_GUILD_ID);
    
    if (!bracketResult.success) {
      log(`❌ FAILED: Could not generate bracket: ${bracketResult.error}`, 'red');
      return false;
    }
    
    log(`✓ Bracket generated`, 'green');
    log(`  Starting Round: ${bracketResult.startingRound}`, 'cyan');
    log(`  First Round Matchups: ${bracketResult.matchups.length}`, 'cyan');
    
    // Verify bracket structure
    const updatedTournament = bracketManager.loadTournament(TEST_GUILD_ID);
    if (updatedTournament.status !== 'knockout') {
      log(`❌ FAILED: Tournament status should be 'knockout', got '${updatedTournament.status}'`, 'red');
      return false;
    }
  }
  
  log(`\n✅ ${maxTitles}-title tournament test PASSED`, 'green');
  return true;
}

function testInvalidSizes() {
  log(`\n${'='.repeat(60)}`, 'bright');
  log(`Testing INVALID sizes (should fail)`, 'bright');
  log('='.repeat(60), 'bright');
  
  const invalidSizes = [3, 5, 6, 7, 10, 12, 15, 20, 24, 28, 33, 34, 35, 37, 38, 39, 41, 42, 43, 45, 46, 47];
  let passedCount = 0;
  
  for (const size of invalidSizes) {
    cleanup();
    const tournament = bracketManager.createTournament(
      TEST_GUILD_ID,
      `Invalid Test (${size})`,
      'test-user',
      size
    );
    
    if (tournament === null) {
      log(`  ✓ ${size} titles correctly rejected`, 'green');
      passedCount++;
    } else {
      log(`  ❌ ${size} titles incorrectly accepted!`, 'red');
    }
  }
  
  log(`\n${passedCount}/${invalidSizes.length} invalid sizes correctly rejected`, 'cyan');
  return passedCount === invalidSizes.length;
}

async function runAllTests() {
  console.log('\n');
  log('╔════════════════════════════════════════════════════════════╗', 'bright');
  log('║      COMPREHENSIVE TOURNAMENT SIZE VALIDATION TEST         ║', 'bright');
  log('╚════════════════════════════════════════════════════════════╝', 'bright');
  
  const validSizes = bracketManager.getValidTournamentSizes();
  log(`\nValid sizes: ${validSizes.all.join(', ')}`, 'cyan');
  
  let passedCount = 0;
  let failedCount = 0;
  
  // Test all valid sizes
  for (const size of validSizes.all) {
    if (testTournamentSize(size)) {
      passedCount++;
    } else {
      failedCount++;
    }
  }
  
  // Test invalid sizes
  log(`\n\n`);
  const invalidTestPassed = testInvalidSizes();
  if (invalidTestPassed) {
    passedCount++;
  } else {
    failedCount++;
  }
  
  // Summary
  log(`\n\n${'='.repeat(60)}`, 'bright');
  log(`FINAL RESULTS`, 'bright');
  log('='.repeat(60), 'bright');
  log(`Valid sizes tested: ${validSizes.all.length}`, 'cyan');
  log(`Tests passed: ${passedCount}`, passedCount === validSizes.all.length + 1 ? 'green' : 'yellow');
  log(`Tests failed: ${failedCount}`, failedCount === 0 ? 'green' : 'red');
  
  if (failedCount === 0) {
    log(`\n✅ ALL TESTS PASSED!`, 'green');
  } else {
    log(`\n❌ SOME TESTS FAILED`, 'red');
  }
  
  // Cleanup
  cleanup();
}

runAllTests();

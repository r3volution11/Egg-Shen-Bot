/**
 * Tournament Simulation Script
 * Runs a complete tournament flow to test the bracket system
 * Run with: node tests/simulate-tournament.js
 */

import * as bracketManager from '../src/utils/bracketManager.js';
import fs from 'fs';
import path from 'path';

const SIMULATION_GUILD_ID = 'simulation-guild';
const TEST_TOURNAMENT_DIR = path.join(process.cwd(), 'guild_tournaments');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'bright');
  console.log('='.repeat(60));
}

// Clean up any existing simulation data
function cleanup() {
  const testFile = path.join(TEST_TOURNAMENT_DIR, `${SIMULATION_GUILD_ID}.json`);
  if (fs.existsSync(testFile)) {
    fs.unlinkSync(testFile);
  }
}

// Simulate votes from multiple users
function simulateVotes(groupId, userCount = 5) {
  const tournament = bracketManager.loadTournament(SIMULATION_GUILD_ID);
  const movies = tournament.groups[groupId].movies;
  
  const votes = {};
  
  for (let i = 1; i <= userCount; i++) {
    const userId = `user-${i}`;
    
    // Randomly select 2 different movies
    const choice1 = Math.floor(Math.random() * 4);
    let choice2 = Math.floor(Math.random() * 4);
    while (choice2 === choice1) {
      choice2 = Math.floor(Math.random() * 4);
    }
    
    votes[userId] = [movies[choice1].id, movies[choice2].id];
  }
  
  // Save votes
  tournament.groups[groupId].votes = votes;
  bracketManager.saveTournament(SIMULATION_GUILD_ID, tournament);
  
  return votes;
}

// Simulate knockout matchup votes
function simulateKnockoutVotes(matchupId, userCount = 10) {
  const tournament = bracketManager.loadTournament(SIMULATION_GUILD_ID);
  const matchup = tournament.knockoutBracket.find(m => m.id === matchupId);
  
  if (!matchup) {
    log(`Matchup ${matchupId} not found`, 'red');
    return null;
  }
  
  const movie1Votes = [];
  const movie2Votes = [];
  
  for (let i = 1; i <= userCount; i++) {
    const userId = `user-${i}`;
    // 60/40 split to movie1 (more realistic than 50/50)
    if (Math.random() < 0.6) {
      movie1Votes.push(userId);
    } else {
      movie2Votes.push(userId);
    }
  }
  
  matchup.votes = {
    movie1: movie1Votes,
    movie2: movie2Votes
  };
  
  bracketManager.saveTournament(SIMULATION_GUILD_ID, tournament);
  
  return {
    movie1Votes: movie1Votes.length,
    movie2Votes: movie2Votes.length
  };
}

// Main simulation
async function runSimulation() {
  try {
    cleanup();
    
    section('🏆 TOURNAMENT SIMULATION START');
    
    // Step 1: Create Tournament
    section('Step 1: Create Tournament');
    const tournament = bracketManager.createTournament(
      SIMULATION_GUILD_ID,
      'Horror Movie Madness (Simulated)',
      'admin-user',
      4 // 4 groups = 16 movies total
    );
    
    if (!tournament) {
      log('❌ Failed to create tournament', 'red');
      return;
    }
    
    log('✓ Tournament created: ' + tournament.name, 'green');
    log(`  Groups: ${tournament.groupCount}`, 'cyan');
    log(`  Status: ${tournament.status}`, 'cyan');
    
    // Step 2: Add Titles to Groups
    section('Step 2: Add Titles to Groups');
    const moviesByGroup = {
      A: ['The Thing', 'Alien', 'The Exorcist', 'The Shining'],
      B: ['Hereditary', 'Midsommar', 'The Witch', 'It Follows'],
      C: ['Evil Dead', 'Halloween', 'The Texas Chain Saw Massacre', 'A Nightmare on Elm Street'],
      D: ['Scream', 'The Ring', 'The Descent', '28 Days Later']
    };
    
    for (const [group, movies] of Object.entries(moviesByGroup)) {
      log(`\nGroup ${group}:`, 'yellow');
      for (let i = 0; i < movies.length; i++) {
        const entry = {
          id: `${group.toLowerCase()}-movie-${i + 1}`,
          title: movies[i],
          year: '2020',
          posterUrl: `https://example.com/${movies[i].replace(/\s/g, '')}.jpg`
        };
        
        const result = bracketManager.addGroupTitle(SIMULATION_GUILD_ID, group, 'movie', entry);
        if (result.success) {
          log(`  ✓ ${movies[i]} (${result.titleCount}/4)`, 'green');
        } else {
          log(`  ❌ Failed: ${result.error}`, 'red');
        }
      }
    }
    
    // Step 3: Open Groups for Voting
    section('Step 3: Open Groups for Voting');
    const deadline = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
    const openResult = bracketManager.openGroupVoting(
      SIMULATION_GUILD_ID,
      ['A', 'B', 'C', 'D'],
      deadline
    );
    
    if (openResult.success) {
      log('✓ All groups opened for voting', 'green');
    } else {
      log(`❌ Failed to open groups: ${openResult.error}`, 'red');
      return;
    }
    
    // Step 4: Simulate Voting
    section('Step 4: Simulate Voting (10 users per group)');
    for (const group of ['A', 'B', 'C', 'D']) {
      const votes = simulateVotes(group, 10); // Increased to 10 users to reduce ties
      log(`\nGroup ${group} - ${Object.keys(votes).length} votes cast:`, 'yellow');
      
      // Only show first 3 votes to keep output concise
      const voteEntries = Object.entries(votes).slice(0, 3);
      for (const [userId, choices] of voteEntries) {
        const t = bracketManager.loadTournament(SIMULATION_GUILD_ID);
        const movie1 = t.groups[group].movies.find(m => m.id === choices[0])?.title;
        const movie2 = t.groups[group].movies.find(m => m.id === choices[1])?.title;
        log(`  ${userId}: ${movie1}, ${movie2}`, 'cyan');
      }
      if (Object.keys(votes).length > 3) {
        log(`  ... and ${Object.keys(votes).length - 3} more voters`, 'cyan');
      }
    }
    
    // Step 5: Close Groups
    section('Step 5: Close Groups and Calculate Results');
    const closeResult = bracketManager.closeGroupVoting(
      SIMULATION_GUILD_ID,
      ['A', 'B', 'C', 'D'],
      3600000 // 1 hour tiebreaker duration
    );
    
    if (closeResult.success) {
      log('✓ All groups closed successfully', 'green');
      
      if (closeResult.tiebreakersCreated && closeResult.tiebreakersCreated.length > 0) {
        log(`\n⚖️  ${closeResult.tiebreakersCreated.length} tiebreakers created:`, 'yellow');
        for (const item of closeResult.tiebreakersCreated) {
          const tb = item.tiebreaker;
          if (tb && tb.tiedOptions) {
            log(`  Group ${item.groupId} ${item.position}: ${tb.tiedOptions.map(o => o.title).join(' vs ')}`, 'cyan');
          }
        }
        
        // Auto-resolve tiebreakers for simulation
        log('\n  Auto-resolving tiebreakers for simulation...', 'yellow');
        for (const item of closeResult.tiebreakersCreated) {
          const tb = item.tiebreaker;
          if (tb) {
            // Simulate random winner selection (index 0)
            const resolveResult = bracketManager.manuallyResolveTiebreaker(
              SIMULATION_GUILD_ID,
              tb.id,
              0
            );
            
            if (resolveResult.success) {
              log(`    ✓ ${item.groupId} ${item.position}: ${resolveResult.winner.title} selected`, 'green');
              
              // Finalize after resolution
              if (item.position === 'knockout') {
                bracketManager.finalizeKnockoutMatchupAfterTiebreaker(SIMULATION_GUILD_ID, tb.id);
              } else {
                const finalizeResult = bracketManager.finalizeGroupAfterTiebreaker(SIMULATION_GUILD_ID, tb.id);
                if (!finalizeResult.success) {
                  log(`    ❌ Failed to finalize: ${finalizeResult.error}`, 'red');
                }
              }
            } else {
              log(`    ❌ Failed to resolve tiebreaker: ${resolveResult.error}`, 'red');
            }
          }
        }
      }
      
      // Show results
      log('\nGroup Results:', 'yellow');
      const t = bracketManager.loadTournament(SIMULATION_GUILD_ID);
      for (const [groupId, result] of Object.entries(t.groupResults)) {
        log(`\nGroup ${groupId}:`, 'cyan');
        if (result.first) {
          log(`  🥇 ${result.first.title} (1st place)`, 'green');
        } else {
          log(`  🥇 TBD (pending tiebreaker)`, 'yellow');
        }
        if (result.second) {
          log(`  🥈 ${result.second.title} (2nd place)`, 'green');
        } else {
          log(`  🥈 TBD (pending tiebreaker)`, 'yellow');
        }
        if (result.third) {
          log(`  🥉 ${result.third.title} (3rd place)`, 'green');
        }
      }
    } else {
      log(`❌ Failed to close groups: ${closeResult.error}`, 'red');
      return;
    }
    
    // Step 6: Calculate Wildcards
    section('Step 6: Calculate Wildcards');
    const wildcardResult = bracketManager.calculateWildcards(SIMULATION_GUILD_ID);
    
    if (wildcardResult.success) {
      log(`✓ Wildcards calculated: ${wildcardResult.wildcards.length} wildcards needed`, 'green');
      
      if (wildcardResult.wildcards.length > 0) {
        log('\nWildcard selections:', 'yellow');
        wildcardResult.wildcards.forEach((w, idx) => {
          log(`  ${idx + 1}. ${w.title} (${w.voteCount} votes from Group ${w.groupId})`, 'cyan');
        });
      } else {
        log('  No wildcards needed (already power of 2)', 'cyan');
      }
    } else {
      log(`❌ Failed to calculate wildcards: ${wildcardResult.error}`, 'red');
      return;
    }
    
    // Step 7: Generate Knockout Bracket
    section('Step 7: Generate Knockout Bracket');
    const bracketResult = bracketManager.generateKnockoutBracket(SIMULATION_GUILD_ID);
    
    if (bracketResult.success) {
      log('✓ Knockout bracket generated', 'green');
      log(`  Total matchups: ${bracketResult.totalMatchups}`, 'cyan');
      log(`  First round: ${bracketResult.matchups.length} matchups`, 'cyan');
      log(`  Round: ${bracketResult.tournament.phase}`, 'cyan');
      
      // Show first round matchups
      log('\nFirst Round Matchups:', 'yellow');
      bracketResult.matchups.forEach((m, idx) => {
        log(`  ${idx + 1}. ${m.movie1?.title} vs ${m.movie2?.title}`, 'cyan');
      });
    } else {
      log(`❌ Failed to generate bracket: ${bracketResult.error}`, 'red');
      return;
    }
    
    // Step 8: Open Knockout Round
    section('Step 8: Open Knockout Round');
    const t = bracketManager.loadTournament(SIMULATION_GUILD_ID);
    const knockoutDeadline = Date.now() + (24 * 60 * 60 * 1000);
    const openKnockoutResult = bracketManager.openKnockoutRound(
      SIMULATION_GUILD_ID,
      t.phase,
      knockoutDeadline
    );
    
    if (openKnockoutResult.success) {
      log(`✓ ${t.phase} matchups opened for voting`, 'green');
    } else {
      log(`❌ Failed to open knockout: ${openKnockoutResult.error}`, 'red');
      return;
    }
    
    // Step 9: Simulate Knockout Voting
    section('Step 9: Simulate Knockout Voting');
    const tournament2 = bracketManager.loadTournament(SIMULATION_GUILD_ID);
    const votingMatchups = tournament2.knockoutBracket.filter(m => m.status === 'voting');
    
    log(`Simulating votes for ${votingMatchups.length} matchups...`, 'yellow');
    for (const matchup of votingMatchups) {
      const votes = simulateKnockoutVotes(matchup.id, 10);
      if (votes) {
        log(`  ${matchup.movie1.title}: ${votes.movie1Votes} votes`, 'cyan');
        log(`  ${matchup.movie2.title}: ${votes.movie2Votes} votes`, 'cyan');
      }
    }
    
    // Step 10: Close Knockout Round
    section('Step 10: Close Knockout Matchups');
    const results = [];
    const tiebreakersCreated = [];
    
    for (const matchup of votingMatchups) {
      const closeMatchupResult = bracketManager.closeKnockoutMatchup(
        SIMULATION_GUILD_ID,
        matchup.id,
        3600000 // 1 hour tiebreaker
      );
      
      if (closeMatchupResult.success) {
        if (closeMatchupResult.tiebreakerCreated && closeMatchupResult.tiebreaker) {
          tiebreakersCreated.push(closeMatchupResult.tiebreaker);
        } else {
          results.push({
            matchup,
            winner: closeMatchupResult.winner
          });
        }
      }
    }
    
    log(`✓ ${results.length} matchups closed`, 'green');
    
    if (tiebreakersCreated.length > 0) {
      log(`\n⚖️  ${tiebreakersCreated.length} tiebreakers created for knockout`, 'yellow');
    }
    
    log('\nWinners:', 'yellow');
    results.forEach(r => {
      log(`  ✓ ${r.winner.title}`, 'green');
    });
    
    // Summary
    section('✅ SIMULATION COMPLETE');
    const finalTournament = bracketManager.loadTournament(SIMULATION_GUILD_ID);
    log('Tournament Status:', 'bright');
    log(`  Name: ${finalTournament.name}`, 'cyan');
    log(`  Status: ${finalTournament.status}`, 'cyan');
    log(`  Phase: ${finalTournament.phase}`, 'cyan');
    log(`  Groups Completed: ${Object.keys(finalTournament.groupResults).length}/${finalTournament.groupCount}`, 'cyan');
    log(`  Knockout Matchups: ${finalTournament.knockoutBracket.length}`, 'cyan');
    log(`  Tiebreakers: ${finalTournament.tiebreakers?.length || 0}`, 'cyan');
    
    log('\n💾 Tournament data saved to:', 'bright');
    log(`  ${path.join(TEST_TOURNAMENT_DIR, `${SIMULATION_GUILD_ID}.json`)}`, 'cyan');
    log('\nYou can inspect the JSON file to see the complete tournament state.', 'yellow');
    
  } catch (error) {
    log(`\n❌ SIMULATION FAILED: ${error.message}`, 'red');
    console.error(error);
  }
}

// Run the simulation
runSimulation();

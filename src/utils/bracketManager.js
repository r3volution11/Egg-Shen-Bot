import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const tournamentsDir = join(__dirname, '../../guild_tournaments');

// Ensure tournaments directory exists
if (!existsSync(tournamentsDir)) {
  mkdirSync(tournamentsDir, { recursive: true });
}

/**
 * Load tournament data for a guild
 */
export function loadTournament(guildId) {
  const filePath = join(tournamentsDir, `${guildId}.json`);
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    const data = readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading tournament:', error);
    return null;
  }
}

/**
 * Save tournament data for a guild
 */
export function saveTournament(guildId, tournament) {
  const filePath = join(tournamentsDir, `${guildId}.json`);
  try {
    writeFileSync(filePath, JSON.stringify(tournament, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving tournament:', error);
    return false;
  }
}

/**
 * Update participation stats for a user (Tatsu-style tracking)
 * @param {Object} tournament - Tournament object
 * @param {string} userId - User ID
 * @param {string} voteType - 'group' or 'knockout'
 */
function updateParticipationStats(tournament, userId, voteType = 'group') {
  // Initialize participation tracking if it doesn't exist (for older tournaments)
  if (!tournament.participation) {
    tournament.participation = {};
  }
  if (!tournament.statistics) {
    tournament.statistics = {
      totalVotes: 0,
      uniqueVoters: 0,
      mostActiveVoter: null,
      highestStreak: 0
    };
  }
  
  // Initialize user's participation record
  if (!tournament.participation[userId]) {
    tournament.participation[userId] = {
      totalVotes: 0,
      groupVotes: 0,
      knockoutVotes: 0,
      streak: 0,
      lastVoted: null,
      firstVoted: Date.now()
    };
  }
  
  const userStats = tournament.participation[userId];
  
  // Update vote counts
  userStats.totalVotes++;
  if (voteType === 'group') {
    userStats.groupVotes++;
  } else if (voteType === 'knockout') {
    userStats.knockoutVotes++;
  }
  
  // Update streak (consecutive rounds voted in)
  const lastVoted = userStats.lastVoted;
  const now = Date.now();
  
  if (!lastVoted) {
    // First vote
    userStats.streak = 1;
  } else {
    // Check if this is a new round/group (different day or different phase)
    const hoursSinceLastVote = (now - lastVoted) / (1000 * 60 * 60);
    if (hoursSinceLastVote < 48) {
      // Within 48 hours - continue streak
      userStats.streak++;
    } else {
      // Reset streak if too long between votes
      userStats.streak = 1;
    }
  }
  
  userStats.lastVoted = now;
  
  // Update tournament-wide statistics
  tournament.statistics.totalVotes++;
  tournament.statistics.uniqueVoters = Object.keys(tournament.participation).length;
  
  // Update most active voter
  const allParticipants = Object.entries(tournament.participation);
  const mostActive = allParticipants.reduce((max, [uid, stats]) => {
    return (stats.totalVotes > (max[1]?.totalVotes || 0)) ? [uid, stats] : max;
  }, [null, { totalVotes: 0 }]);
  
  tournament.statistics.mostActiveVoter = mostActive[0];
  tournament.statistics.highestStreak = Math.max(
    tournament.statistics.highestStreak,
    userStats.streak
  );
}

/**
 * Get user participation stats
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @returns {Object} User's participation stats
 */
export function getUserParticipation(guildId, userId) {
  const tournament = loadTournament(guildId);
  if (!tournament || !tournament.participation) {
    return null;
  }
  
  return tournament.participation[userId] || null;
}

/**
 * Get tournament statistics
 * @param {string} guildId - Guild ID
 * @returns {Object} Tournament statistics
 */
export function getTournamentStatistics(guildId) {
  const tournament = loadTournament(guildId);
  if (!tournament || !tournament.statistics) {
    return null;
  }
  
  return tournament.statistics;
}

/**
 * Calculate number of wildcards needed based on group count
 */
function calculateWildcardCount(groupCount) {
  const directAdvancers = groupCount * 2; // Top 2 from each group
  const targetBracketSize = Math.pow(2, Math.ceil(Math.log2(directAdvancers))); // Next power of 2
  return targetBracketSize - directAdvancers; // Wildcards needed to fill bracket
}

/**
 * Determine starting knockout round based on total participants
 */
function getStartingRound(participantCount) {
  if (participantCount <= 4) return 'semifinals';
  if (participantCount <= 8) return 'quarterfinals';
  if (participantCount <= 16) return 'round_of_16';
  return 'round_of_32';
}

/**
 * Create a new tournament
 */
export function createTournament(guildId, name, creatorId, groupCount = 8) {
  // Validate group count (4-12)
  if (groupCount < 4 || groupCount > 12) {
    console.error('Invalid group count. Must be between 4 and 12.');
    return null;
  }
  
  const tournament = {
    id: crypto.randomBytes(8).toString('hex'),
    name: name,
    guildId: guildId,
    creatorId: creatorId,
    groupCount: groupCount, // Number of groups (4-12)
    status: 'setup', // setup, group_stage, knockout, completed, cancelled
    phase: 'setup', // setup, groups, round_of_32, round_of_16, quarterfinals, semifinals, finals
    createdAt: Date.now(),
    groups: {}, // A-L, each with 4 movies
    groupResults: {}, // Results after group stage voting
    knockoutBracket: [], // Array of matchups
    knockoutResults: {}, // Results of knockout matchups
    votes: {}, // userId -> {groupId: [movieIndexes], matchupId: movieIndex}
    winner: null,
    // Participation tracking (Tatsu-style)
    participation: {}, // userId -> { totalVotes: number, groupVotes: number, knockoutVotes: number, streak: number, lastVoted: timestamp }
    statistics: { // Tournament-wide stats
      totalVotes: 0,
      uniqueVoters: 0,
      mostActiveVoter: null,
      highestStreak: 0
    }
  };
  
  return saveTournament(guildId, tournament) ? tournament : null;
}

/**
 * Resize an existing tournament (expand or contract group count)
 * @param {string} guildId - Guild ID
 * @param {number} newGroupCount - New number of groups (4-12)
 * @returns {Object} Result with success/error
 */
export function resizeTournament(guildId, newGroupCount) {
  const tournament = loadTournament(guildId);
  
  if (!tournament) {
    return { success: false, error: 'No tournament found' };
  }
  
  if (tournament.status !== 'setup') {
    return { success: false, error: 'Tournament can only be resized during setup phase' };
  }
  
  // Validate new group count
  if (newGroupCount < 4 || newGroupCount > 12) {
    return { success: false, error: 'Group count must be between 4 and 12' };
  }
  
  // Check if contracting - make sure we're not removing groups that have titles
  if (newGroupCount < tournament.groupCount) {
    const allowedGroups = 'ABCDEFGHIJKL'.slice(0, newGroupCount);
    const groupsToRemove = 'ABCDEFGHIJKL'.slice(newGroupCount, tournament.groupCount);
    
    // Collect all groups that would be removed but have titles
    const groupsWithTitles = [];
    let totalTitlesToRemove = 0;
    
    for (const groupId of groupsToRemove) {
      if (tournament.groups[groupId] && tournament.groups[groupId].movies.length > 0) {
        const titleCount = tournament.groups[groupId].movies.length;
        groupsWithTitles.push({ id: groupId, count: titleCount });
        totalTitlesToRemove += titleCount;
      }
    }
    
    // If any groups have titles, provide detailed error message
    if (groupsWithTitles.length > 0) {
      const groupList = groupsWithTitles.map(g => `Group ${g.id} (${g.count} title${g.count !== 1 ? 's' : ''})`).join(', ');
      const keepRange = 'ABCDEFGHIJKL'.slice(0, newGroupCount);
      
      let errorMsg = `❌ Cannot contract to ${newGroupCount} groups. The following groups have titles that would be removed:\n\n${groupList}\n\n`;
      errorMsg += `**Options:**\n`;
      errorMsg += `1️⃣ Move ${totalTitlesToRemove} title${totalTitlesToRemove !== 1 ? 's' : ''} from ${groupsWithTitles.map(g => `Group ${g.id}`).join(' and ')} to groups ${keepRange.split('').join(', ')}\n`;
      errorMsg += `2️⃣ Remove the titles using \`/bracket remove-title\`\n`;
      
      // Calculate minimum groups needed to keep all current titles
      const allGroupsWithTitles = Object.keys(tournament.groups).filter(
        key => tournament.groups[key].movies && tournament.groups[key].movies.length > 0
      );
      const minGroupsNeeded = allGroupsWithTitles.length;
      
      if (newGroupCount < minGroupsNeeded) {
        errorMsg += `3️⃣ Resize to at least ${minGroupsNeeded} groups (to keep all ${minGroupsNeeded} filled groups)`;
      }
      
      return {
        success: false,
        error: errorMsg,
        groupsWithTitles: groupsWithTitles,
        totalTitlesToRemove: totalTitlesToRemove,
      };
    }
    
    // Remove empty groups that are outside the new range
    for (const groupId of groupsToRemove) {
      delete tournament.groups[groupId];
    }
  }
  
  const oldGroupCount = tournament.groupCount;
  tournament.groupCount = newGroupCount;
  
  // Count how many groups have titles
  const filledGroups = Object.keys(tournament.groups).filter(
    key => tournament.groups[key].movies && tournament.groups[key].movies.length > 0
  ).length;
  
  return saveTournament(guildId, tournament)
    ? { success: true, tournament, oldGroupCount, newGroupCount, filledGroups }
    : { success: false, error: 'Failed to save tournament' };
}

/**
 * Add movies to a group (legacy - use addGroupTitle instead)
 */
export function addGroupMovies(guildId, groupId, type, entries) {
  const tournament = loadTournament(guildId);
  if (!tournament || tournament.status !== 'setup') {
    return { success: false, error: 'Tournament not in setup phase' };
  }
  
  // Validate group ID is within allowed range
  const allowedGroups = 'ABCDEFGHIJKL'.slice(0, tournament.groupCount);
  if (!allowedGroups.includes(groupId)) {
    return { success: false, error: `Invalid group. This tournament uses groups A-${allowedGroups[allowedGroups.length - 1]} (${tournament.groupCount} groups total)` };
  }
  
  if (entries.length !== 4) {
    return { success: false, error: 'Each group must have exactly 4 entries' };
  }
  
  // Store tournament type on first group addition
  if (!tournament.type) {
    tournament.type = type;
  } else if (tournament.type !== type) {
    return { success: false, error: `Tournament type mismatch. This tournament is for ${tournament.type}s, but you're trying to add ${type}s.` };
  }
  
  tournament.groups[groupId] = {
    id: groupId,
    movies: entries.map((entry, index) => ({ 
      index, 
      title: entry.title,
      type: entry.type,
      id: entry.id,
      year: entry.year,
      posterUrl: entry.posterUrl,
      metadata: entry.metadata,
      votes: [] 
    })),
    status: 'pending', // pending, voting, closed
    votingOpen: false,
  };
  
  return saveTournament(guildId, tournament) 
    ? { success: true, tournament } 
    : { success: false, error: 'Failed to save' };
}

/**
 * Add a single title to a group (allows 1-4 titles per group)
 */
export function addGroupTitle(guildId, groupId, type, entry) {
  const tournament = loadTournament(guildId);
  if (!tournament || tournament.status !== 'setup') {
    return { success: false, error: 'Tournament not in setup phase' };
  }
  
  // Validate group ID is within allowed range
  const allowedGroups = 'ABCDEFGHIJKL'.slice(0, tournament.groupCount);
  if (!allowedGroups.includes(groupId)) {
    return { success: false, error: `Invalid group. This tournament uses groups A-${allowedGroups[allowedGroups.length - 1]} (${tournament.groupCount} groups total)` };
  }
  
  // Store tournament type on first title addition
  if (!tournament.type) {
    tournament.type = type;
  } else if (tournament.type !== type) {
    return { success: false, error: `Tournament type mismatch. This tournament is for ${tournament.type}s, but you're trying to add ${type}s.` };
  }
  
  // Initialize group if it doesn't exist
  if (!tournament.groups[groupId]) {
    tournament.groups[groupId] = {
      id: groupId,
      movies: [],
      status: 'pending',
      votingOpen: false,
    };
  }
  
  const group = tournament.groups[groupId];
  
  // Check if group already has 4 titles
  if (group.movies.length >= 4) {
    return { success: false, error: `Group ${groupId} already has 4 titles. Remove one or use a different group.` };
  }
  
  // Check for duplicate titles in this group
  const duplicate = group.movies.find(m => 
    m.title.toLowerCase() === entry.title.toLowerCase() && m.year === entry.year
  );
  if (duplicate) {
    return { success: false, error: `"${entry.title}" is already in Group ${groupId}` };
  }
  
  // Add the title
  const index = group.movies.length;
  group.movies.push({
    index,
    title: entry.title,
    type: entry.type,
    id: entry.id,
    year: entry.year,
    posterUrl: entry.posterUrl,
    customImageUrl: entry.customImageUrl,
    metadata: entry.metadata,
    votes: [],
  });
  
  return saveTournament(guildId, tournament) 
    ? { success: true, tournament, group, titleCount: group.movies.length } 
    : { success: false, error: 'Failed to save' };
}

/**
 * Remove a title from a group
 * @param {string} guildId - Guild ID
 * @param {string} groupId - Group ID (A-L)
 * @param {number} titleIndex - Index of title to remove (1-4)
 * @returns {Object} Result with success/error
 */
export function removeGroupTitle(guildId, groupId, titleIndex) {
  const tournament = loadTournament(guildId);
  if (!tournament || tournament.status !== 'setup') {
    return { success: false, error: 'Tournament not in setup phase' };
  }
  
  // Validate group exists
  if (!tournament.groups[groupId]) {
    return { success: false, error: `Group ${groupId} does not exist or has no titles` };
  }
  
  const group = tournament.groups[groupId];
  
  // Validate title index (convert from 1-based to 0-based)
  const arrayIndex = titleIndex - 1;
  if (arrayIndex < 0 || arrayIndex >= group.movies.length) {
    return { success: false, error: `Invalid title number. Group ${groupId} has ${group.movies.length} title(s)` };
  }
  
  // Get title info before removal
  const removedTitle = group.movies[arrayIndex];
  
  // Remove the title
  group.movies.splice(arrayIndex, 1);
  
  // Re-index remaining titles
  group.movies.forEach((movie, idx) => {
    movie.index = idx;
  });
  
  return saveTournament(guildId, tournament) 
    ? { success: true, tournament, group, removedTitle, titleCount: group.movies.length } 
    : { success: false, error: 'Failed to save' };
}

/**
 * Open voting for specific groups
 */
export function openGroupVoting(guildId, groupIds, deadline = null) {
  const tournament = loadTournament(guildId);
  if (!tournament) {
    return { success: false, error: 'No tournament found' };
  }
  
  groupIds.forEach(groupId => {
    if (tournament.groups[groupId]) {
      tournament.groups[groupId].status = 'voting';
      tournament.groups[groupId].votingOpen = true;
      tournament.groups[groupId].votingStarted = Date.now();
      if (deadline) {
        tournament.groups[groupId].votingDeadline = deadline;
      }
    }
  });
  
  tournament.status = 'group_stage';
  tournament.phase = 'groups';
  
  return saveTournament(guildId, tournament)
    ? { success: true, tournament }
    : { success: false, error: 'Failed to save' };
}

/**
 * Store voting message IDs for groups (for scheduler to update/close)
 * @param {string} guildId - Guild ID
 * @param {string} groupId - Group ID
 * @param {string} channelId - Channel ID where voting message was posted
 * @param {string} messageId - Message ID of voting message
 * @returns {Object} Result with success/error
 */
export function storeGroupVotingMessage(guildId, groupId, channelId, messageId) {
  const tournament = loadTournament(guildId);
  if (!tournament || !tournament.groups[groupId]) {
    return { success: false, error: 'Tournament or group not found' };
  }
  
  tournament.groups[groupId].votingMessageChannelId = channelId;
  tournament.groups[groupId].votingMessageId = messageId;
  
  return saveTournament(guildId, tournament)
    ? { success: true }
    : { success: false, error: 'Failed to save' };
}

/**
 * Store voting message IDs for knockout matchups (for scheduler to update/close)
 * @param {string} guildId - Guild ID
 * @param {string} matchupId - Matchup ID
 * @param {string} channelId - Channel ID where voting message was posted
 * @param {string} messageId - Message ID of voting message
 * @returns {Object} Result with success/error
 */
export function storeMatchupVotingMessage(guildId, matchupId, channelId, messageId) {
  const tournament = loadTournament(guildId);
  if (!tournament) {
    return { success: false, error: 'Tournament not found' };
  }
  
  const matchup = tournament.knockoutBracket.find(m => m.id === matchupId);
  if (!matchup) {
    return { success: false, error: 'Matchup not found' };
  }
  
  matchup.messageChannelId = channelId;
  matchup.messageId = messageId;
  
  return saveTournament(guildId, tournament)
    ? { success: true }
    : { success: false, error: 'Failed to save' };
}

/**
 * Cast a vote for group stage (user votes for top 2 in each group)
 */
export function voteGroupStage(guildId, userId, groupId, movieIndexes) {
  const tournament = loadTournament(guildId);
  if (!tournament || tournament.status !== 'group_stage') {
    return { success: false, error: 'Group stage voting not active' };
  }
  
  const group = tournament.groups[groupId];
  if (!group || !group.votingOpen) {
    return { success: false, error: 'This group is not open for voting' };
  }
  
  // Check if voting deadline has passed
  if (group.votingDeadline && Date.now() > group.votingDeadline) {
    const hoursAgo = Math.floor((Date.now() - group.votingDeadline) / (1000 * 60 * 60));
    const timeAgo = hoursAgo > 24 
      ? `${Math.floor(hoursAgo / 24)} day${Math.floor(hoursAgo / 24) !== 1 ? 's' : ''} ago`
      : `${hoursAgo} hour${hoursAgo !== 1 ? 's' : ''} ago`;
    return { success: false, error: `Voting for Group ${groupId} ended ${timeAgo}. Ask an admin to extend the deadline or close voting.` };
  }
  
  // Allow 0-2 votes (in-progress voting)
  // Users can select 0, 1, or 2 titles
  if (movieIndexes.length > 2) {
    return { success: false, error: 'Can only vote for up to 2 titles per group. Please deselect one first.' };
  }
  
  // Remove previous votes from this user in this group
  group.movies.forEach(movie => {
    movie.votes = movie.votes.filter(voterId => voterId !== userId);
  });
  
  // Add new votes
  movieIndexes.forEach(index => {
    if (group.movies[index]) {
      group.movies[index].votes.push(userId);
    }
  });
  
  // Track user's votes
  if (!tournament.votes[userId]) {
    tournament.votes[userId] = {};
  }
  tournament.votes[userId][groupId] = movieIndexes;
  
  // Update participation stats (Tatsu-style tracking)
  if (movieIndexes.length > 0) {
    updateParticipationStats(tournament, userId, 'group');
  }
  
  return saveTournament(guildId, tournament)
    ? { success: true, tournament }
    : { success: false, error: 'Failed to save' };
}

/**
 * Close group voting and calculate results
 */
export function closeGroupVoting(guildId, groupIds) {
  const tournament = loadTournament(guildId);
  if (!tournament) {
    return { success: false, error: 'No tournament found' };
  }
  
  groupIds.forEach(groupId => {
    const group = tournament.groups[groupId];
    if (!group) return;
    
    // Calculate vote counts - preserve all movie data including posterUrl
    const results = group.movies.map(movie => ({
      index: movie.index,
      title: movie.title,
      type: movie.type,
      id: movie.id,
      year: movie.year,
      posterUrl: movie.posterUrl,
      customImageUrl: movie.customImageUrl,
      metadata: movie.metadata,
      voteCount: movie.votes.length,
    })).sort((a, b) => b.voteCount - a.voteCount);
    
    // Handle ties with random selection
    const firstPlace = [results[0]];
    const secondPlace = [];
    const thirdPlace = [];
    
    // Find all tied for 1st
    for (let i = 1; i < results.length; i++) {
      if (results[i].voteCount === firstPlace[0].voteCount) {
        firstPlace.push(results[i]);
      } else {
        break;
      }
    }
    
    // Random selection for 1st place
    const winner = firstPlace[Math.floor(Math.random() * firstPlace.length)];
    
    // Find 2nd place (skip only the selected winner, not all tied for first)
    const remainingAfterFirst = results.filter(r => r.index !== winner.index);
    if (remainingAfterFirst.length > 0) {
      secondPlace.push(remainingAfterFirst[0]);
      for (let i = 1; i < remainingAfterFirst.length; i++) {
        if (remainingAfterFirst[i].voteCount === secondPlace[0].voteCount) {
          secondPlace.push(remainingAfterFirst[i]);
        } else {
          break;
        }
      }
    }
    
    // Random selection for 2nd place
    const runnerUp = secondPlace.length > 0 
      ? secondPlace[Math.floor(Math.random() * secondPlace.length)] 
      : null;
    
    // Find 3rd place (skip only the selected winner and runnerUp)
    const remainingAfterSecond = remainingAfterFirst.filter(r => 
      !runnerUp || r.index !== runnerUp.index
    );
    if (remainingAfterSecond.length > 0) {
      thirdPlace.push(remainingAfterSecond[0]);
      for (let i = 1; i < remainingAfterSecond.length; i++) {
        if (remainingAfterSecond[i].voteCount === thirdPlace[0].voteCount) {
          thirdPlace.push(remainingAfterSecond[i]);
        } else {
          break;
        }
      }
    }
    
    // Random selection for 3rd place
    const third = thirdPlace.length > 0 
      ? thirdPlace[Math.floor(Math.random() * thirdPlace.length)] 
      : null;
    
    group.status = 'closed';
    group.votingOpen = false;
    group.votingClosed = Date.now();
    
    tournament.groupResults[groupId] = {
      first: winner,
      second: runnerUp,
      third: third,
      allResults: results,
    };
  });
  
  return saveTournament(guildId, tournament)
    ? { success: true, tournament }
    : { success: false, error: 'Failed to save' };
}

/**
 * Calculate wildcards (best 8 third-place finishers)
 */
export function calculateWildcards(guildId) {
  const tournament = loadTournament(guildId);
  if (!tournament) {
    return { success: false, error: 'No tournament found' };
  }
  
  const wildcardsNeeded = calculateWildcardCount(tournament.groupCount);
  
  // Get all third-place finishers
  const thirdPlaceMovies = Object.values(tournament.groupResults)
    .filter(result => result.third)
    .map(result => ({
      ...result.third,
      groupId: Object.keys(tournament.groupResults).find(
        key => tournament.groupResults[key].third === result.third
      ),
    }))
    .sort((a, b) => b.voteCount - a.voteCount);
  
  // Handle ties for last wildcard spot with random selection
  if (thirdPlaceMovies.length > wildcardsNeeded && wildcardsNeeded > 0) {
    const lastPlaceVotes = thirdPlaceMovies[wildcardsNeeded - 1].voteCount;
    const tiedForLast = thirdPlaceMovies.filter(m => m.voteCount === lastPlaceVotes);
    
    if (tiedForLast.length > 1) {
      // Shuffle tied movies and take enough to fill wildcard spots
      const shuffled = tiedForLast.sort(() => Math.random() - 0.5);
      const nonTied = thirdPlaceMovies.filter(m => m.voteCount > lastPlaceVotes);
      thirdPlaceMovies.length = 0;
      thirdPlaceMovies.push(...nonTied, ...shuffled);
    }
  }
  
  tournament.wildcards = thirdPlaceMovies.slice(0, wildcardsNeeded);
  tournament.wildcardsNeeded = wildcardsNeeded;
  
  return saveTournament(guildId, tournament)
    ? { success: true, tournament, wildcards: tournament.wildcards }
    : { success: false, error: 'Failed to save' };
}

/**
 * Generate knockout bracket (Round of 32)
 */
export function generateKnockoutBracket(guildId) {
  const tournament = loadTournament(guildId);
  if (!tournament) {
    return { success: false, error: 'No tournament found' };
  }
  
  // Get winners and runners-up
  const groupResults = Object.values(tournament.groupResults);
  const winners = groupResults.map(r => ({ ...r.first, type: 'winner', groupId: r.first.groupId }));
  const runnersUp = groupResults.map(r => ({ ...r.second, type: 'runnerup', groupId: r.second.groupId }));
  
  // Combine runners-up and wildcards
  const nonWinners = [...runnersUp, ...tournament.wildcards.map(w => ({ ...w, type: 'wildcard' }))];
  
  // Calculate total participants and starting round
  const totalParticipants = winners.length + nonWinners.length;
  const startingRound = getStartingRound(totalParticipants);
  
  // Shuffle non-winners
  const shuffledNonWinners = nonWinners.sort(() => Math.random() - 0.5);
  
  // Create first round matchups: pair each winner with a non-winner from different group
  const firstRoundMatchups = [];
  const usedNonWinners = new Set();
  
  winners.forEach((winner, index) => {
    // Find a non-winner from a different group
    // Use title+groupId as unique key since 'index' is NOT unique across groups
    const opponent = shuffledNonWinners.find(nw => {
      const key = `${nw.title}_${nw.groupId}`;
      return !usedNonWinners.has(key) && nw.groupId !== winner.groupId;
    }) || shuffledNonWinners.find(nw => {
      const key = `${nw.title}_${nw.groupId}`;
      return !usedNonWinners.has(key);
    });
    
    if (opponent) {
      const opponentKey = `${opponent.title}_${opponent.groupId}`;
      usedNonWinners.add(opponentKey);
      firstRoundMatchups.push({
        id: crypto.randomBytes(6).toString('hex'),
        round: startingRound,
        position: index,
        movie1: winner,
        movie2: opponent,
        status: 'pending',
        votes: { movie1: [], movie2: [] },
      });
    }
  });
  
  // Generate ALL subsequent rounds with TBD placeholders
  const allMatchups = [...firstRoundMatchups];
  const roundSequence = {
    'round_of_32': 'round_of_16',
    'round_of_16': 'quarterfinals',
    'quarterfinals': 'semifinals',
    'semifinals': 'finals'
  };
  
  let currentRound = startingRound;
  let currentMatchups = firstRoundMatchups;
  
  while (roundSequence[currentRound]) {
    const nextRound = roundSequence[currentRound];
    const nextMatchups = [];
    
    // Create matchups for next round (each pair of current round feeds into one matchup)
    for (let i = 0; i < currentMatchups.length; i += 2) {
      nextMatchups.push({
        id: crypto.randomBytes(6).toString('hex'),
        round: nextRound,
        position: i / 2,
        movie1: null, // TBD - winner of matchup i
        movie2: null, // TBD - winner of matchup i+1
        status: 'pending',
        votes: { movie1: [], movie2: [] },
        sourceMatchups: [currentMatchups[i].id, currentMatchups[i + 1]?.id].filter(Boolean)
      });
    }
    
    allMatchups.push(...nextMatchups);
    currentMatchups = nextMatchups;
    currentRound = nextRound;
  }
  
  tournament.knockoutBracket = allMatchups;
  tournament.phase = startingRound;
  tournament.status = 'knockout';
  
  return saveTournament(guildId, tournament)
    ? { success: true, tournament, matchups: firstRoundMatchups }
    : { success: false, error: 'Failed to save' };
}

/**
 * Regenerate knockout bracket completely from current group results
 * (for tournaments where knockout was generated early or before full bracket tree feature)
 */
export function regenerateKnockoutBracket(guildId) {
  const tournament = loadTournament(guildId);
  if (!tournament) {
    return { success: false, error: 'No tournament found' };
  }
  
  if (tournament.status !== 'knockout') {
    return { success: false, error: 'Tournament not in knockout phase' };
  }
  
  // Check if all groups are closed
  const closedGroups = Object.keys(tournament.groupResults).length;
  if (closedGroups < tournament.groupCount) {
    return { 
      success: false, 
      error: `Cannot regenerate - only ${closedGroups}/${tournament.groupCount} groups are closed. Close all groups first.` 
    };
  }
  
  // Detect if bracket is broken (wrong number of first-round matchups)
  // This can happen due to the index-based bug in older versions
  const expectedParticipants = closedGroups * 2 + (tournament.wildcards?.length || 0);
  const expectedFirstRoundMatchups = Math.ceil(expectedParticipants / 2);
  
  // Get starting round based on expected participants
  const expectedStartingRound = getStartingRound(expectedParticipants);
  const existingFirstRoundMatchups = tournament.knockoutBracket.filter(m => m.round === expectedStartingRound);
  const actualFirstRoundMatchups = existingFirstRoundMatchups.length;
  
  const isBrokenBracket = actualFirstRoundMatchups < expectedFirstRoundMatchups;
  
  // Check if any knockout voting has started
  const hasVoting = tournament.knockoutBracket.some(m => 
    m.status === 'voting' || m.status === 'closed' || 
    (m.votes && (m.votes.movie1.length > 0 || m.votes.movie2.length > 0))
  );
  
  // Allow regeneration if bracket is broken, even if voting started
  // This is necessary to fix tournaments affected by the index-based pairing bug
  if (hasVoting && !isBrokenBracket) {
    return { success: false, error: 'Cannot regenerate - knockout voting has already started' };
  }
  
  // If bracket is broken and voting started, warn user that votes will be reset
  let warningMessage = '';
  if (isBrokenBracket && hasVoting) {
    warningMessage = `⚠️ Bracket was broken (${actualFirstRoundMatchups} matchups instead of ${expectedFirstRoundMatchups}). Regenerating will reset any existing votes. `;
  }
  
  // Always recalculate group results to ensure all data (including posterUrl) is up to date
  const groupIds = Object.keys(tournament.groupResults);
  const recalcResult = closeGroupVoting(guildId, groupIds);
  if (!recalcResult.success) {
    return { success: false, error: 'Failed to recalculate group results' };
  }
  // Reload tournament after recalculation
  const reloadedTournament = loadTournament(guildId);
  if (!reloadedTournament) {
    return { success: false, error: 'Failed to reload tournament' };
  }
  Object.assign(tournament, reloadedTournament);
  
  // Recalculate wildcards
  const wildcardsResult = calculateWildcards(guildId);
  if (!wildcardsResult.success) {
    return { success: false, error: wildcardsResult.error };
  }
  
  // Completely rebuild knockout bracket from group results
  const groupResults = Object.values(tournament.groupResults);
  const winners = groupResults.map(r => ({ ...r.first, type: 'winner', groupId: r.first.groupId }));
  const runnersUp = groupResults.map(r => ({ ...r.second, type: 'runnerup', groupId: r.second.groupId }));
  const nonWinners = [...runnersUp, ...wildcardsResult.wildcards.map(w => ({ ...w, type: 'wildcard' }))];
  
  // Calculate total participants and starting round
  const totalParticipants = winners.length + nonWinners.length;
  const startingRound = getStartingRound(totalParticipants);
  
  // Shuffle non-winners
  const shuffledNonWinners = nonWinners.sort(() => Math.random() - 0.5);
  
  // Create first round matchups - pair all participants
  const firstRoundMatchups = [];
  const allParticipants = [...winners, ...shuffledNonWinners];
  
  // Pair participants two at a time
  for (let i = 0; i < allParticipants.length; i += 2) {
    if (allParticipants[i + 1]) {
      firstRoundMatchups.push({
        id: crypto.randomBytes(6).toString('hex'),
        round: startingRound,
        position: i / 2,
        movie1: allParticipants[i],
        movie2: allParticipants[i + 1],
        status: 'pending',
        votes: { movie1: [], movie2: [] },
      });
    }
  }
  
  // Generate all subsequent rounds with TBD placeholders
  const allMatchups = [...firstRoundMatchups];
  const roundSequence = {
    'round_of_32': 'round_of_16',
    'round_of_16': 'quarterfinals',
    'quarterfinals': 'semifinals',
    'semifinals': 'finals'
  };
  
  let currentRound = startingRound;
  let currentMatchups = firstRoundMatchups;
  
  while (roundSequence[currentRound]) {
    const nextRound = roundSequence[currentRound];
    const nextMatchups = [];
    
    for (let i = 0; i < currentMatchups.length; i += 2) {
      nextMatchups.push({
        id: crypto.randomBytes(6).toString('hex'),
        round: nextRound,
        position: i / 2,
        movie1: null,
        movie2: null,
        status: 'pending',
        votes: { movie1: [], movie2: [] },
        sourceMatchups: [currentMatchups[i].id, currentMatchups[i + 1]?.id].filter(Boolean)
      });
    }
    
    allMatchups.push(...nextMatchups);
    currentMatchups = nextMatchups;
    currentRound = nextRound;
  }
  
  // Replace knockout bracket entirely
  tournament.knockoutBracket = allMatchups;
  tournament.phase = startingRound;
  tournament.wildcards = wildcardsResult.wildcards;
  
  return saveTournament(guildId, tournament)
    ? { 
        success: true, 
        tournament, 
        matchups: firstRoundMatchups,
        totalMatchups: allMatchups.length,
        wildcards: wildcardsResult.wildcards,
        warning: warningMessage || undefined
      }
    : { success: false, error: 'Failed to save' };
}

/**
 * Open knockout matchup for voting
 */
export function openKnockoutMatchup(guildId, matchupId) {
  const tournament = loadTournament(guildId);
  if (!tournament || tournament.status !== 'knockout') {
    return { success: false, error: 'Tournament not in knockout phase' };
  }
  
  const matchup = tournament.knockoutBracket.find(m => m.id === matchupId);
  if (!matchup) {
    return { success: false, error: 'Matchup not found' };
  }
  
  matchup.status = 'voting';
  matchup.votingStarted = Date.now();
  
  return saveTournament(guildId, tournament)
    ? { success: true, tournament, matchup }
    : { success: false, error: 'Failed to save' };
}

/**
 * Open knockout round for voting
 */
export function openKnockoutRound(guildId, round, deadline = null) {
  const tournament = loadTournament(guildId);
  if (!tournament || tournament.status !== 'knockout') {
    return { success: false, error: 'Tournament not in knockout phase' };
  }
  
  if (round !== tournament.phase) {
    return { success: false, error: `Current phase is ${tournament.phase}, not ${round}` };
  }
  
  // Get matchups for this round that have both participants
  const roundMatchups = tournament.knockoutBracket.filter(
    m => m.round === round && m.movie1 && m.movie2
  );
  
  if (roundMatchups.length === 0) {
    return { success: false, error: 'No matchups ready for voting in this round' };
  }
  
  // Open matchups for voting
  roundMatchups.forEach(m => {
    m.status = 'voting';
    m.votingOpened = Date.now();
    m.votingStarted = Date.now(); // For smart warning timing
    if (deadline) {
      m.votingDeadline = deadline;
    }
    if (!m.votes) {
      m.votes = { movie1: [], movie2: [] };
    }
  });
  
  return saveTournament(guildId, tournament)
    ? { success: true, tournament, matchups: roundMatchups }
    : { success: false, error: 'Failed to save' };
}

/**
 * Vote in knockout matchup
 */
export function voteKnockout(guildId, userId, matchupId, choice) {
  const tournament = loadTournament(guildId);
  if (!tournament || tournament.status !== 'knockout') {
    return { success: false, error: 'Knockout voting not active' };
  }
  
  const matchup = tournament.knockoutBracket.find(m => m.id === matchupId);
  if (!matchup || matchup.status !== 'voting') {
    return { success: false, error: 'This matchup is not open for voting' };
  }
  
  // Check if voting deadline has passed
  if (matchup.votingDeadline && Date.now() > matchup.votingDeadline) {
    const hoursAgo = Math.floor((Date.now() - matchup.votingDeadline) / (1000 * 60 * 60));
    const timeAgo = hoursAgo > 24 
      ? `${Math.floor(hoursAgo / 24)} day${Math.floor(hoursAgo / 24) !== 1 ? 's' : ''} ago`
      : `${hoursAgo} hour${hoursAgo !== 1 ? 's' : ''} ago`;
    return { success: false, error: `Voting for this matchup ended ${timeAgo}. Ask an admin to extend the deadline or close the round.` };
  }
  
  // Remove previous vote
  matchup.votes.movie1 = matchup.votes.movie1.filter(id => id !== userId);
  matchup.votes.movie2 = matchup.votes.movie2.filter(id => id !== userId);
  
  // Add new vote
  if (choice === 1) {
    matchup.votes.movie1.push(userId);
  } else if (choice === 2) {
    matchup.votes.movie2.push(userId);
  }
  
  // Track user's vote
  if (!tournament.votes[userId]) {
    tournament.votes[userId] = {};
  }
  tournament.votes[userId][matchupId] = choice;
  
  // Update participation stats (Tatsu-style tracking)
  updateParticipationStats(tournament, userId, 'knockout');
  
  return saveTournament(guildId, tournament)
    ? { success: true, tournament }
    : { success: false, error: 'Failed to save' };
}

/**
 * Close knockout matchup and determine winner
 */
export function closeKnockoutMatchup(guildId, matchupId) {
  const tournament = loadTournament(guildId);
  if (!tournament) {
    return { success: false, error: 'No tournament found' };
  }
  
  const matchup = tournament.knockoutBracket.find(m => m.id === matchupId);
  if (!matchup) {
    return { success: false, error: 'Matchup not found' };
  }
  
  const votes1 = matchup.votes.movie1.length;
  const votes2 = matchup.votes.movie2.length;
  
  // Determine winner (random if tied)
  let winner;
  if (votes1 > votes2) {
    winner = matchup.movie1;
  } else if (votes2 > votes1) {
    winner = matchup.movie2;
  } else {
    // Tie - random selection
    winner = Math.random() < 0.5 ? matchup.movie1 : matchup.movie2;
  }
  
  matchup.status = 'closed';
  matchup.votingClosed = Date.now();
  matchup.winner = winner;
  matchup.votes1Count = votes1;
  matchup.votes2Count = votes2;
  
  tournament.knockoutResults[matchupId] = {
    winner: winner,
    votes1: votes1,
    votes2: votes2,
    wasTie: votes1 === votes2,
  };
  
  // Save first
  if (!saveTournament(guildId, tournament)) {
    return { success: false, error: 'Failed to save' };
  }
  
  let autoAdvanced = false;
  
  // Check if all matchups in current round are closed
  const currentRoundMatchups = tournament.knockoutBracket.filter(
    m => m.round === tournament.phase && m.movie1 && m.movie2
  );
  const allClosed = currentRoundMatchups.every(m => m.status === 'closed');
  
  if (allClosed) {
    autoAdvanced = true;
    
    // Auto-advance winners to next round
    const roundMap = {
      'round_of_32': 'round_of_16',
      'round_of_16': 'quarterfinals',
      'quarterfinals': 'semifinals',
      'semifinals': 'finals',
    };
    
    const nextRound = roundMap[tournament.phase];
    
    if (nextRound) {
      // Find next round matchups and populate with winners
      const nextRoundMatchups = tournament.knockoutBracket.filter(m => m.round === nextRound);
      
      currentRoundMatchups.forEach((completedMatchup, index) => {
        const winner = completedMatchup.winner;
        if (!winner) return;
        
        // Each pair of current matchups feeds into one next matchup
        const nextMatchupIndex = Math.floor(index / 2);
        const nextMatchup = nextRoundMatchups[nextMatchupIndex];
        
        if (nextMatchup) {
          // Determine if this winner goes to movie1 or movie2 slot based on position
          if (index % 2 === 0) {
            nextMatchup.movie1 = winner;
          } else {
            nextMatchup.movie2 = winner;
          }
        }
      });
      
      tournament.phase = nextRound;
      saveTournament(guildId, tournament);
    } else if (tournament.phase === 'finals') {
      // Tournament complete
      tournament.status = 'completed';
      tournament.champion = winner;
      tournament.completedAt = Date.now();
      saveTournament(guildId, tournament);
    }
  }
  
  return { success: true, tournament, winner, votes1, votes2, autoAdvanced };
}

/**
 * Advance to next knockout round
 */
export function advanceKnockoutRound(guildId) {
  const tournament = loadTournament(guildId);
  if (!tournament || tournament.status !== 'knockout') {
    return { success: false, error: 'Tournament not in knockout phase' };
  }
  
  // Get all completed matchups from current round
  const currentRoundMatchups = tournament.knockoutBracket.filter(
    m => m.round === tournament.phase && m.status === 'closed'
  );
  
  if (currentRoundMatchups.length === 0) {
    return { success: false, error: 'No completed matchups to advance from' };
  }
  
  // Determine next round
  const roundMap = {
    'round_of_32': 'round_of_16',
    'round_of_16': 'quarterfinals',
    'quarterfinals': 'semifinals',
    'semifinals': 'finals',
  };
  
  const nextRound = roundMap[tournament.phase];
  if (!nextRound) {
    return { success: false, error: 'No next round available' };
  }
  
  // Find all matchups in the next round (they should already exist with TBD placeholders)
  const nextRoundMatchups = tournament.knockoutBracket.filter(m => m.round === nextRound);
  
  // Populate the TBD slots with winners
  currentRoundMatchups.forEach((completedMatchup, index) => {
    const winner = completedMatchup.winner;
    if (!winner) return;
    
    // Find which next round matchup this winner should go to
    // Each pair of current matchups feeds into one next matchup
    const nextMatchupIndex = Math.floor(index / 2);
    const nextMatchup = nextRoundMatchups[nextMatchupIndex];
    
    if (nextMatchup) {
      // Determine if this winner goes to movie1 or movie2 slot
      if (index % 2 === 0) {
        nextMatchup.movie1 = winner;
      } else {
        nextMatchup.movie2 = winner;
      }
    }
  });
  
  tournament.phase = nextRound;
  
  // Check if we're in finals
  if (nextRound === 'finals') {
    tournament.phase = 'finals';
  }
  
  return saveTournament(guildId, tournament)
    ? { success: true, tournament, nextMatchups: nextRoundMatchups }
    : { success: false, error: 'Failed to save' };
}

/**
 * Complete tournament (after finals)
 */
export function completeTournament(guildId, winnerId) {
  const tournament = loadTournament(guildId);
  if (!tournament) {
    return { success: false, error: 'No tournament found' };
  }
  
  const finalsMatchup = tournament.knockoutBracket.find(
    m => m.round === 'finals' && m.status === 'closed'
  );
  
  if (!finalsMatchup) {
    return { success: false, error: 'Finals not completed' };
  }
  
  tournament.status = 'completed';
  tournament.winner = finalsMatchup.winner;
  tournament.completedAt = Date.now();
  
  return saveTournament(guildId, tournament)
    ? { success: true, tournament, winner: tournament.winner }
    : { success: false, error: 'Failed to save' };
}

/**
 * Get user's voting status and history
 */
export function getUserVotingStatus(guildId, userId) {
  const tournament = loadTournament(guildId);
  if (!tournament) {
    return { success: false, error: 'No tournament found' };
  }
  
  const userVotes = tournament.votes[userId] || {};
  const status = {
    tournament: {
      name: tournament.name,
      type: tournament.type,
      phase: tournament.phase,
      status: tournament.status
    },
    groupVotes: [],
    knockoutVotes: [],
    availableGroupVotes: [],
    availableKnockoutVotes: []
  };
  
  // Group stage voting status
  if (tournament.status === 'group_stage' || tournament.groupResults) {
    Object.keys(tournament.groups).forEach(groupId => {
      const group = tournament.groups[groupId];
      
      if (group.votingOpen) {
        // Check if user has voted
        if (userVotes[groupId]) {
          const choices = userVotes[groupId];
          const movie1 = group.movies[choices[0]];
          const movie2 = group.movies[choices[1]];
          
          status.groupVotes.push({
            group: groupId,
            choices: [
              { position: choices[0] + 1, title: movie1?.title },
              { position: choices[1] + 1, title: movie2?.title }
            ],
            deadline: group.votingDeadline,
            timeRemaining: group.votingDeadline ? Math.max(0, group.votingDeadline - Date.now()) : null
          });
        } else {
          // Available to vote
          status.availableGroupVotes.push({
            group: groupId,
            deadline: group.votingDeadline,
            timeRemaining: group.votingDeadline ? Math.max(0, group.votingDeadline - Date.now()) : null
          });
        }
      }
    });
  }
  
  // Knockout voting status
  if (tournament.status === 'knockout') {
    const votingMatchups = tournament.knockoutBracket.filter(m => m.status === 'voting');
    
    votingMatchups.forEach(matchup => {
      if (userVotes[matchup.id]) {
        const choice = userVotes[matchup.id];
        const votedMovie = choice === 1 ? matchup.movie1 : matchup.movie2;
        
        status.knockoutVotes.push({
          matchupId: matchup.id,
          round: matchup.round,
          position: matchup.position + 1,
          votedFor: votedMovie.title,
          opponent: choice === 1 ? matchup.movie2.title : matchup.movie1.title,
          deadline: matchup.votingDeadline,
          timeRemaining: matchup.votingDeadline ? Math.max(0, matchup.votingDeadline - Date.now()) : null
        });
      } else {
        status.availableKnockoutVotes.push({
          matchupId: matchup.id,
          round: matchup.round,
          position: matchup.position + 1,
          movie1: matchup.movie1.title,
          movie2: matchup.movie2.title,
          deadline: matchup.votingDeadline,
          timeRemaining: matchup.votingDeadline ? Math.max(0, matchup.votingDeadline - Date.now()) : null
        });
      }
    });
  }
  
  return { success: true, status };
}

/**
 * Cancel tournament
 */
export function cancelTournament(guildId) {
  const tournament = loadTournament(guildId);
  if (!tournament) {
    return { success: false, error: 'No tournament found' };
  }
  
  tournament.status = 'cancelled';
  tournament.cancelledAt = Date.now();
  
  // Clear all vote data when cancelling
  tournament.votes = {};
  tournament.participation = {};
  tournament.statistics = {
    totalVotes: 0,
    uniqueVoters: 0,
    mostActiveVoter: null,
    highestStreak: 0
  };
  
  return saveTournament(guildId, tournament)
    ? { success: true, tournament }
    : { success: false, error: 'Failed to save' };
}

/**
 * Get tournament status
 */
export function getTournamentStatus(guildId) {
  const tournament = loadTournament(guildId);
  if (!tournament) {
    return { success: false, error: 'No tournament found' };
  }
  
  return { success: true, tournament };
}

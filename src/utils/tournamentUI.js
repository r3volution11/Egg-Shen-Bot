/**
 * Tournament UI Utilities
 * 
 * Visual enhancements for tournament embeds including:
 * - Progress bars for vote visualization
 * - Participation tracking displays
 * - Voting streaks
 * - Enhanced emoji-based status indicators
 */

/**
 * Generate a visual progress bar
 * @param {number} value - Current value
 * @param {number} max - Maximum value
 * @param {number} length - Bar length in characters (default 10)
 * @param {boolean} showPercentage - Show percentage (default true)
 * @returns {string} Progress bar string
 */
export function createProgressBar(value, max, length = 10, showPercentage = true) {
  if (max === 0) {
    return '░'.repeat(length) + (showPercentage ? ' 0%' : '');
  }
  
  const percentage = Math.round((value / max) * 100);
  const filled = Math.round((value / max) * length);
  const empty = length - filled;
  
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return showPercentage ? `${bar} ${percentage}%` : bar;
}

/**
 * Generate a visual progress bar with vote counts
 * @param {number} votes - Number of votes
 * @param {number} totalVotes - Total votes across both options
 * @param {number} length - Bar length (default 10)
 * @returns {string} Formatted progress bar with vote count
 */
export function createVoteBar(votes, totalVotes, length = 12) {
  if (totalVotes === 0) {
    return `${'░'.repeat(length)} ${votes} votes (0%)`;
  }
  
  const percentage = Math.round((votes / totalVotes) * 100);
  const filled = Math.round((votes / totalVotes) * length);
  const empty = length - filled;
  
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `${bar} ${votes} vote${votes !== 1 ? 's' : ''} (${percentage}%)`;
}

/**
 * Get status emoji for tournament phases
 * @param {string} status - Status string
 * @returns {string} Emoji
 */
export function getStatusEmoji(status) {
  const emojiMap = {
    'voting': '✅',
    'open': '✅',
    'closing_soon': '⏰',
    'closed': '🏁',
    'completed': '🏆',
    'pending': '⏸️',
    'setup': '🔧',
    'cancelled': '❌',
    'winner': '👑',
    'advanced': '⬆️',
  };
  return emojiMap[status] || '📊';
}

/**
 * Get media type emoji
 * @param {string} type - Media type
 * @returns {string} Emoji
 */
export function getMediaEmoji(type) {
  const emojiMap = {
    'movie': '🎬',
    'tv': '📺',
    'game': '🎮',
    'boardgame': '🎲',
    'book': '📚',
    'episode': '📺',
    'music': '🎵',
  };
  return emojiMap[type] || '🎬';
}

/**
 * Format voting streak display
 * @param {number} streak - Current streak count
 * @param {number} maxStreak - Maximum possible (default 10 shown)
 * @returns {string} Visual streak display
 */
export function formatVotingStreak(streak, maxStreak = 10) {
  if (streak === 0) return '⬜'.repeat(maxStreak);
  
  const filled = Math.min(streak, maxStreak);
  const empty = Math.max(0, maxStreak - streak);
  
  return '✅'.repeat(filled) + '⬜'.repeat(empty);
}

/**
 * Calculate and format participation percentage
 * @param {number} participated - Number of rounds/matchups participated in
 * @param {number} total - Total rounds/matchups available
 * @returns {string} Formatted participation string
 */
export function formatParticipation(participated, total) {
  if (total === 0) return '0/0 (0%)';
  
  const percentage = Math.round((participated / total) * 100);
  return `${participated}/${total} (${percentage}%)`;
}

/**
 * Get ranking emoji (1st, 2nd, 3rd, etc.)
 * @param {number} rank - Ranking position (1-based)
 * @returns {string} Emoji
 */
export function getRankEmoji(rank) {
  const emojiMap = {
    1: '🥇',
    2: '🥈', 
    3: '🥉',
  };
  return emojiMap[rank] || `${rank}️⃣`;
}

/**
 * Format time remaining with appropriate emoji
 * @param {number} deadline - Deadline timestamp
 * @returns {Object} {emoji, text, isClosingSoon}
 */
export function formatTimeRemainingWithEmoji(deadline) {
  const now = Date.now();
  const remaining = deadline - now;
  
  if (remaining <= 0) {
    return { emoji: '🏁', text: 'Closed', isClosingSoon: false };
  }
  
  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
  const days = Math.floor(hours / 24);
  
  const isClosingSoon = remaining < 2 * 60 * 60 * 1000; // Less than 2 hours
  const emoji = isClosingSoon ? '⏰' : '🕐';
  
  let text;
  if (days > 0) {
    text = `${days}d ${hours % 24}h`;
  } else if (hours > 0) {
    text = `${hours}h ${minutes}m`;
  } else {
    text = `${minutes}m`;
  }
  
  return { emoji, text, isClosingSoon };
}

/**
 * Create matchup summary line with vote bars
 * @param {string} title1 - First title
 * @param {number} votes1 - First title votes
 * @param {string} title2 - Second title
 * @param {number} votes2 - Second title votes
 * @param {string} label - Matchup label (e.g., "1A")
 * @param {number} maxTitleLength - Max characters for titles (default 25)
 * @returns {string} Formatted matchup summary
 */
export function createMatchupSummary(title1, votes1, title2, votes2, label, maxTitleLength = 25) {
  const totalVotes = votes1 + votes2;
  
  // Truncate titles if needed
  const t1 = title1.length > maxTitleLength ? title1.substring(0, maxTitleLength - 3) + '...' : title1;
  const t2 = title2.length > maxTitleLength ? title2.substring(0, maxTitleLength - 3) + '...' : title2;
  
  // Determine leader
  let leader1 = votes1 > votes2 ? ' 🔥' : '';
  let leader2 = votes2 > votes1 ? ' 🔥' : '';
  const tie = votes1 === votes2 && votes1 > 0 ? ' 🤝' : '';
  
  // Build bars
  const bar1 = createVoteBar(votes1, totalVotes, 12);
  const bar2 = createVoteBar(votes2, totalVotes, 12);
  
  return `**${label}:** ${t1}${leader1}\n${bar1}\n\nvs\n\n${t2}${leader2}\n${bar2}`;
}

/**
 * Get bot avatar URL helper
 * @param {Object} client - Discord client
 * @returns {string|null} Bot avatar URL
 */
export function getBotAvatarURL(client) {
  return client?.user?.displayAvatarURL() || null;
}

/**
 * Create participation summary text
 * @param {Object} stats - Participation statistics
 * @returns {string} Formatted participation text
 */
export function createParticipationSummary(stats) {
  const {
    userId,
    username,
    totalMatchups = 0,
    votedMatchups = 0,
    streak = 0,
    isActive = false
  } = stats;
  
  const participation = formatParticipation(votedMatchups, totalMatchups);
  const streakDisplay = formatVotingStreak(streak, 5);
  
  let summary = `📊 **Participation:** ${participation}\n`;
  summary += `🔥 **Streak:** ${streakDisplay} (${streak} rounds)\n`;
  
  if (isActive) {
    summary += `✅ **Status:** Active voter`;
  }
  
  return summary;
}

/**
 * Enhanced leaderboard entry with progress bar
 * @param {number} rank - User rank
 * @param {string} title - Entry title
 * @param {number} votes - Vote count
 * @param {number} maxVotes - Maximum votes in leaderboard
 * @param {number} maxTitleLength - Max title length (default 30)
 * @returns {string} Formatted leaderboard entry
 */
export function createLeaderboardEntry(rank, title, votes, maxVotes, maxTitleLength = 30) {
  const rankEmoji = getRankEmoji(rank);
  const truncatedTitle = title.length > maxTitleLength 
    ? title.substring(0, maxTitleLength - 3) + '...' 
    : title;
  
  // Pad title for alignment
  const paddedTitle = truncatedTitle.padEnd(maxTitleLength, ' ');
  const bar = createProgressBar(votes, maxVotes, 12, false);
  
  return `${rankEmoji} ${paddedTitle} ${bar} ${votes}`;
}

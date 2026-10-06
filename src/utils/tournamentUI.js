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
 * Get color for progress bar based on percentage (for HTML rendering)
 * @param {number} percentage - Percentage value (0-100)
 * @returns {string} Hex color code
 */
export function getProgressBarColor(percentage) {
  if (percentage >= 67) {
    // High performance - Green shades
    return '#43b581'; // Discord green
  } else if (percentage >= 34) {
    // Medium performance - Yellow/Orange shades
    return '#faa61a'; // Discord yellow
  } else {
    // Low performance - Red shades
    return '#f04747'; // Discord red
  }
}

/**
 * Coloured squares for a matchup's vote bars (Doug, 2026-10-04). Discord
 * can't colour text in a card, but it draws emoji in colour, so the bar is
 * built from square emoji: green for the title ahead, orange for the one
 * behind, yellow for both when tied, white for the rest of the bar. White,
 * not black: on Discord's dark theme (the usual one) a black square all
 * but disappears into the card.
 */
export const VOTE_BAR = { lead: '🟩', trail: '🟧', tie: '🟨', empty: '⬜' };

/**
 * One title's vote bar in a two-title matchup, with its count:
 *   🟩🟩🟩🟩🟩🟩🟩⬜⬜⬜ 7 votes (70%)
 * Its colour comes from how it stands against the other title, whose votes
 * are the rest of totalVotes.
 * @param {number} votes - this title's votes
 * @param {number} totalVotes - both titles' votes together
 * @param {number} length - squares in the bar (default 10)
 * @returns {string}
 */
export function createVoteBar(votes, totalVotes, length = 10) {
  const count = `${votes} vote${votes !== 1 ? 's' : ''}`;
  if (totalVotes === 0) {
    return `${VOTE_BAR.empty.repeat(length)} ${count} (0%)`;
  }

  const rival = totalVotes - votes;
  const fill = votes > rival ? VOTE_BAR.lead : votes < rival ? VOTE_BAR.trail : VOTE_BAR.tie;
  const percentage = Math.round((votes / totalVotes) * 100);
  const filled = Math.round((votes / totalVotes) * length);
  return `${fill.repeat(filled)}${VOTE_BAR.empty.repeat(length - filled)} ${count} (${percentage}%)`;
}

/**
 * A title as people need to see it to tell remakes apart: with its year,
 * "The Town That Dreaded Sundown (1976)" (there's a 2014 one), unless the
 * title already ends with a year. Shortened only when longer than `max`,
 * and then the name is cut, never the year (Doug, 2026-10-05: the live
 * standings cut titles at 25 characters, with room to spare).
 * @param {{title: string, year?: string|number}} entry
 * @param {number} [max] - longest result, in characters
 */
export function displayTitle(entry, max = 80) {
  const title = String(entry?.title || '').trim();
  const year = String(entry?.year || '').slice(0, 4);
  const suffix = /^\d{4}$/.test(year) && !/\(\d{4}\)$/.test(title) ? ` (${year})` : '';
  if (title.length + suffix.length <= max) return title + suffix;
  return `${title.slice(0, Math.max(1, max - suffix.length - 1)).trimEnd()}…${suffix}`;
}

/**
 * One open matchup as the live standings show it — used by the Live
 * Standings card and /bracket status, so the two always match:
 *   **1A** · closes <t:…:R>
 *   Sick
 *   🟧🟧⬜⬜⬜⬜⬜⬜⬜⬜ 3 votes (18%)
 *   vs
 *   A Nightmare on Elm Street 🔥
 *   🟩🟩🟩🟩🟩🟩🟩🟩⬜⬜ 14 votes (82%)
 * Both titles get their bar and count. (The second one's bar was once
 * built but never printed, so a matchup voted 0–2 read as "0 votes".)
 * @param {object} matchup - with votes.movie1/movie2 voter lists
 * @param {string} [round] - defaults to the matchup's own
 */
export function formatStandingsMatchup(matchup, round = matchup.round) {
  const votes1 = matchup.votes?.movie1?.length || 0;
  const votes2 = matchup.votes?.movie2?.length || 0;
  const total = votes1 + votes2;
  const lead1 = votes1 > votes2 ? ' 🔥' : '';
  const lead2 = votes2 > votes1 ? ' 🔥' : '';
  const tie = votes1 === votes2 && votes1 > 0 ? ' 🤝' : '';
  const closes = matchup.votingDeadline ? ` · closes <t:${Math.floor(matchup.votingDeadline / 1000)}:R>` : '';
  return [
    `**${matchupLabel(matchup.position, round)}**${tie}${closes}`,
    `${displayTitle(matchup.movie1)}${lead1}`,
    createVoteBar(votes1, total),
    'vs',
    `${displayTitle(matchup.movie2)}${lead2}`,
    createVoteBar(votes2, total),
  ].join('\n');
}

/**
 * A coloured square bar for one option among several (a tiebreaker vote),
 * without the count: green for the one clearly ahead, yellow for options
 * sharing the lead, orange for the rest, white for the unfilled part.
 * @param {number} votes - this option's votes
 * @param {number[]} allVotes - every option's votes, this one included
 * @param {number} length - squares in the bar (default 10)
 */
export function createRankedBar(votes, allVotes, length = 10) {
  const total = allVotes.reduce((a, b) => a + b, 0);
  if (total === 0) return VOTE_BAR.empty.repeat(length);
  const top = Math.max(...allVotes);
  const leaders = allVotes.filter(v => v === top).length;
  const fill = votes < top ? VOTE_BAR.trail : leaders > 1 ? VOTE_BAR.tie : VOTE_BAR.lead;
  const filled = Math.round((votes / total) * length);
  return fill.repeat(filled) + VOTE_BAR.empty.repeat(length - filled);
}

/**
 * Generate vote bar with color information (for HTML rendering)
 * @param {number} votes - Number of votes
 * @param {number} totalVotes - Total votes across both options
 * @param {number} length - Bar length (default 12)
 * @returns {Object} { text, percentage, color, filled, empty }
 */
export function createVoteBarWithColor(votes, totalVotes, length = 12) {
  if (totalVotes === 0) {
    return {
      text: `${votes} votes (0%)`,
      percentage: 0,
      color: '#4f545c', // Gray for no votes
      filled: 0,
      empty: length
    };
  }
  
  const percentage = Math.round((votes / totalVotes) * 100);
  const filled = Math.round((votes / totalVotes) * length);
  const empty = length - filled;
  const color = getProgressBarColor(percentage);
  
  return {
    text: `${votes} vote${votes !== 1 ? 's' : ''} (${percentage}%)`,
    percentage,
    color,
    filled,
    empty
  };
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
  const bar1 = createVoteBar(votes1, totalVotes);
  const bar2 = createVoteBar(votes2, totalVotes);
  
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

/**
 * Puts a title's poster on a result embed as its thumbnail — the smallest
 * image an embed can carry (a small square in the top-right corner), so a
 * result card gains a recognizable cover without becoming a big image post.
 * One thumbnail per embed, so it's the winner's.
 *
 * Skipped when there's no usable image: older tournaments and some sources
 * (board games before their details load) have posterUrl null, and Discord
 * rejects the whole message for a thumbnail that isn't an http(s) URL.
 * @param {import('discord.js').EmbedBuilder} embed
 * @param {{ posterUrl?: string|null }|null|undefined} title
 * @returns the embed, for chaining
 */
export function setTitleThumbnail(embed, title) {
  const url = title?.posterUrl;
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    embed.setThumbnail(url);
  }
  return embed;
}

/**
 * A knockout matchup's label: "1A"–"4H" by region (March Madness style:
 * each round split into 4 regions), or "Finals". The labels people type in
 * /bracket open-matchup and /image matchup. Moved here from bracket.js so
 * every command labels a matchup the same way.
 * @param {number} position - the matchup's position in its round
 * @param {string} round - e.g. 'round_of_32', 'finals'
 */
export function matchupLabel(position, round) {
  if (round === 'finals') return 'Finals';
  const where = matchupRegion(position, round);
  return where ? `${where.region}${where.letter}` : String(position + 1);
}

/**
 * Where a knockout matchup sits: its region (1–4), its letter in that
 * region, and how many matchups each region has in that round. What
 * matchupLabel's "1A" is made of. null for the final, or a round it
 * doesn't know.
 */
export function matchupRegion(position, round) {
  const roundSizes = { round_of_32: 16, round_of_16: 8, quarterfinals: 4, semifinals: 2 };
  const totalMatchups = roundSizes[round];
  if (!totalMatchups) return null;
  const perRegion = totalMatchups / 4;
  return {
    region: Math.floor(position / perRegion) + 1, // 1-4
    letter: String.fromCharCode(65 + (position % perRegion)), // A, B, C...
    perRegion,
  };
}

const ROUND_ORDER = ['round_of_32', 'round_of_16', 'quarterfinals', 'semifinals', 'finals'];

// Room for the vote list in a ballot's description (4096), leaving the
// intro and the closing-time line their space
const VOTE_LIST_MAX = 3000;

/** Markdown in a title (a "*" or "_") would break the bold around it */
const plain = (title) => String(title || '').replace(/([\\*_~`|>])/g, '\\$1');

/**
 * Every knockout vote this person has cast, for their own ballot, in the
 * layout Doug drew (2026-10-03):
 *
 *   **Round 1 · Region 1**
 *   A: ✅ **Session 9** vs A Nightmare on Elm Street
 *   B: Chucky vs ✅ **Halloween (1978)**
 *
 *   **Round 3**
 *   1A: ✅ **Session 9** vs Halloween (1978)
 *
 *   **Final**
 *   ✅ **Session 9** vs Scream
 *
 * Rounds are numbered from the bracket's first round (an 8-title bracket
 * starts at Round 1), counting every round it has, so the numbers don't
 * shift when someone skips a round. Where a round has several matchups per
 * region, each region gets a heading and its matchups go by letter — a
 * bare "A" would otherwise mean four matchups. Where it has one per region,
 * the full label (1A) does the job under one heading. The last round is
 * the Final. A very long list keeps the latest rounds and says how many it
 * left out.
 * @returns {string|null} null when they haven't voted in the knockout yet
 */
export function formatKnockoutVotes(tournament, userId) {
  const votes = tournament?.votes?.[userId] || {};
  const bracket = tournament?.knockoutBracket || [];
  const byOrder = (a, b) => ROUND_ORDER.indexOf(a.round) - ROUND_ORDER.indexOf(b.round) || a.position - b.position;
  const voted = bracket.filter(m => votes[m.id] === 1 || votes[m.id] === 2).sort(byOrder);
  if (!voted.length) return null;

  const roundsInBracket = ROUND_ORDER.filter(r => bracket.some(m => m.round === r));
  const roundName = (r) => (r === 'finals' ? 'Final' : `Round ${roundsInBracket.indexOf(r) + 1}`);

  const line = (m, label) => {
    const [one, two] = [plain(displayTitle(m.movie1)), plain(displayTitle(m.movie2))];
    const pick = votes[m.id];
    const pair = `${pick === 1 ? `✅ **${one}**` : one} vs ${pick === 2 ? `✅ **${two}**` : two}`;
    return label ? `${label}: ${pair}` : pair;
  };

  // One block per round: its heading(s) and lines
  const rounds = [...new Set(voted.map(m => m.round))];
  const blocks = rounds.map(r => {
    const inRound = voted.filter(m => m.round === r);
    if (r === 'finals') return [`**${roundName(r)}**`, ...inRound.map(m => line(m, null))].join('\n');
    const where = (m) => matchupRegion(m.position, m.round);
    if ((where(inRound[0])?.perRegion || 0) > 1) {
      const regions = [...new Set(inRound.map(m => where(m).region))];
      return regions.map(reg => [
        `**${roundName(r)} · Region ${reg}**`,
        ...inRound.filter(m => where(m).region === reg).map(m => line(m, where(m).letter)),
      ].join('\n')).join('\n\n');
    }
    return [`**${roundName(r)}**`, ...inRound.map(m => line(m, matchupLabel(m.position, m.round)))].join('\n');
  });

  // Too long: drop the earliest rounds first, newest votes matter most
  let kept = blocks;
  let dropped = 0;
  while (kept.length > 1 && kept.join('\n\n').length > VOTE_LIST_MAX) {
    dropped += voted.filter(m => m.round === rounds[blocks.length - kept.length]).length;
    kept = kept.slice(1);
  }
  let text = kept.join('\n\n');
  if (text.length > VOTE_LIST_MAX) text = `${text.slice(0, VOTE_LIST_MAX - 1)}…`;
  return dropped ? `-# …and ${dropped} earlier vote${dropped === 1 ? '' : 's'}\n${text}` : text;
}

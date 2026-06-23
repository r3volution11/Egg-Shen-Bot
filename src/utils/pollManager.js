import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const POLLS_DIR = join(__dirname, '../../guild_polls');

// Ensure polls directory exists
if (!existsSync(POLLS_DIR)) {
  mkdirSync(POLLS_DIR, { recursive: true });
}

// Number emojis for voting
export const VOTE_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

/**
 * Generate a unique poll ID
 */
function generatePollId() {
  return randomBytes(8).toString('hex');
}

/**
 * Get the file path for a guild's polls
 */
function getGuildPollsPath(guildId) {
  return join(POLLS_DIR, `${guildId}.json`);
}

/**
 * Load all polls for a guild
 */
export function loadGuildPolls(guildId) {
  const filePath = getGuildPollsPath(guildId);
  
  if (!existsSync(filePath)) {
    return [];
  }
  
  try {
    const data = readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error loading polls for guild ${guildId}:`, error);
    return [];
  }
}

/**
 * Save polls for a guild
 */
function saveGuildPolls(guildId, polls) {
  const filePath = getGuildPollsPath(guildId);
  
  try {
    writeFileSync(filePath, JSON.stringify(polls, null, 2), 'utf8');
  } catch (error) {
    console.error(`Error saving polls for guild ${guildId}:`, error);
    throw error;
  }
}

/**
 * Create a new poll
 */
export function createPoll(guildId, channelId, messageId, creatorId, question, options, allowMultipleVotes = false) {
  const polls = loadGuildPolls(guildId);
  
  const poll = {
    pollId: generatePollId(),
    guildId,
    channelId,
    messageId,
    creatorId,
    question,
    options: options.map((text, index) => ({
      id: index,
      text,
      emoji: VOTE_EMOJIS[index],
      votes: [],
    })),
    allowMultipleVotes,
    status: 'active',
    createdAt: new Date().toISOString(),
    closedAt: null,
    closedBy: null,
  };
  
  polls.push(poll);
  saveGuildPolls(guildId, polls);
  
  return poll;
}

/**
 * Get a poll by ID
 */
export function getPoll(guildId, pollId) {
  const polls = loadGuildPolls(guildId);
  return polls.find(p => p.pollId === pollId);
}

/**
 * Get a poll by message ID
 */
export function getPollByMessageId(guildId, messageId) {
  const polls = loadGuildPolls(guildId);
  return polls.find(p => p.messageId === messageId);
}

/**
 * Get all active polls for a guild
 */
export function getActivePolls(guildId) {
  const polls = loadGuildPolls(guildId);
  return polls.filter(p => p.status === 'active');
}

/**
 * Get all closed polls for a guild
 */
export function getClosedPolls(guildId) {
  const polls = loadGuildPolls(guildId);
  return polls.filter(p => p.status === 'closed');
}

/**
 * Add a vote to a poll
 */
export function addVote(guildId, pollId, optionId, userId) {
  const polls = loadGuildPolls(guildId);
  const poll = polls.find(p => p.pollId === pollId);
  
  if (!poll) {
    throw new Error('Poll not found');
  }
  
  if (poll.status !== 'active') {
    throw new Error('Poll is not active');
  }
  
  const option = poll.options.find(o => o.id === optionId);
  
  if (!option) {
    throw new Error('Invalid option');
  }
  
  // If multiple votes not allowed, remove user's other votes
  if (!poll.allowMultipleVotes) {
    poll.options.forEach(opt => {
      const voteIndex = opt.votes.indexOf(userId);
      if (voteIndex !== -1) {
        opt.votes.splice(voteIndex, 1);
      }
    });
  }
  
  // Add vote if not already present
  if (!option.votes.includes(userId)) {
    option.votes.push(userId);
  }
  
  saveGuildPolls(guildId, polls);
  return poll;
}

/**
 * Remove a vote from a poll
 */
export function removeVote(guildId, pollId, optionId, userId) {
  const polls = loadGuildPolls(guildId);
  const poll = polls.find(p => p.pollId === pollId);
  
  if (!poll) {
    throw new Error('Poll not found');
  }
  
  const option = poll.options.find(o => o.id === optionId);
  
  if (!option) {
    throw new Error('Invalid option');
  }
  
  const voteIndex = option.votes.indexOf(userId);
  if (voteIndex !== -1) {
    option.votes.splice(voteIndex, 1);
  }
  
  saveGuildPolls(guildId, polls);
  return poll;
}

/**
 * Close a poll
 */
export function closePoll(guildId, pollId, closedBy) {
  const polls = loadGuildPolls(guildId);
  const poll = polls.find(p => p.pollId === pollId);
  
  if (!poll) {
    throw new Error('Poll not found');
  }
  
  poll.status = 'closed';
  poll.closedAt = new Date().toISOString();
  poll.closedBy = closedBy;
  
  saveGuildPolls(guildId, polls);
  return poll;
}

/**
 * Delete a poll
 */
export function deletePoll(guildId, pollId) {
  const polls = loadGuildPolls(guildId);
  const pollIndex = polls.findIndex(p => p.pollId === pollId);
  
  if (pollIndex === -1) {
    throw new Error('Poll not found');
  }
  
  const poll = polls[pollIndex];
  polls.splice(pollIndex, 1);
  saveGuildPolls(guildId, polls);
  
  return poll;
}

/**
 * Check if a user can manage a poll (admin, mod, or creator)
 */
export function canManagePoll(poll, member) {
  // Check if user is admin or has manage server permission
  if (member.permissions.has('Administrator') || member.permissions.has('ManageGuild')) {
    return true;
  }
  
  // Check if user is the poll creator
  if (poll.creatorId === member.id) {
    return true;
  }
  
  return false;
}

/**
 * Get poll results summary
 */
export function getPollResults(poll) {
  const totalVotes = poll.options.reduce((sum, opt) => sum + opt.votes.length, 0);
  
  const results = poll.options.map(option => {
    const voteCount = option.votes.length;
    const percentage = totalVotes > 0 ? ((voteCount / totalVotes) * 100).toFixed(1) : '0.0';
    
    return {
      ...option,
      voteCount,
      percentage: parseFloat(percentage),
    };
  });
  
  // Sort by vote count descending
  results.sort((a, b) => b.voteCount - a.voteCount);
  
  return {
    totalVotes,
    results,
  };
}

/**
 * Get user's vote in a poll
 */
export function getUserVote(poll, userId) {
  const votedOptions = poll.options.filter(opt => opt.votes.includes(userId));
  return votedOptions.map(opt => opt.id);
}

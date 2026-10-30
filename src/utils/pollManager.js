import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes, randomInt } from 'crypto';
import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Overridable via GUILD_POLLS_DIR so parallel Jest workers (each test file runs
// in its own process) can point at a unique directory instead of racing on the
// same real one — unset in production, where the default applies.
const POLLS_DIR = process.env.GUILD_POLLS_DIR || join(__dirname, '../../guild_polls');

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

/** A runoff gets a day when the survey it breaks a tie for had no timer. */
export const RUNOFF_DEFAULT_MINUTES = 24 * 60;

/**
 * Create a new poll
 * @param {number|null} expiresInMinutes - Optional auto-close duration in minutes from now
 * @param {object} [extra]
 * @param {'runoff'|'none'} [extra.tieBreak='runoff'] - what a tie for first does when it closes
 * @param {number} [extra.round=1] - 2 for a runoff
 * @param {string|null} [extra.runoffOf=null] - the survey a runoff breaks the tie for
 */
export function createPoll(guildId, channelId, messageId, creatorId, question, options, allowMultipleVotes = false, expiresInMinutes = null, { tieBreak = 'runoff', round = 1, runoffOf = null } = {}) {
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
    expiresAt: expiresInMinutes ? new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString() : null,
    closedAt: null,
    closedBy: null,
    // Polls created before this field existed have no votingMethod — treat
    // that as 'reactions' (their original, only mechanism). New polls are
    // always 'buttons'; there's no way to switch an in-flight poll's method.
    votingMethod: 'buttons',
    // How long it ran for, so a runoff can run as long (see startRunoff)
    durationMinutes: expiresInMinutes || null,
    // Read through tieBreakOf(): polls created before these existed lack them
    tieBreak,
    round,
    runoffOf,
  };

  polls.push(poll);
  saveGuildPolls(guildId, polls);

  return poll;
}

/**
 * Get all active polls across all guilds whose expiresAt has passed.
 * Used by pollScheduler.js to auto-close expired surveys.
 * @returns {Array<{guildId: string, poll: object}>}
 */
export function getExpiredActivePolls() {
  const expired = [];
  const now = Date.now();

  if (!existsSync(POLLS_DIR)) {
    return expired;
  }

  const files = readdirSync(POLLS_DIR).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const guildId = file.replace('.json', '');
    const polls = loadGuildPolls(guildId);

    for (const poll of polls) {
      if (poll.status !== 'active') continue;
      if (!poll.expiresAt) continue;
      if (new Date(poll.expiresAt).getTime() > now) continue;

      expired.push({ guildId, poll });
    }
  }

  return expired;
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
 * Cast a button vote for a single-select poll — overwrites the user's
 * previous vote entirely (equivalent to addVote, but named for clarity at
 * the button-handler call site, and always enforces single-select
 * regardless of poll.allowMultipleVotes since toggleVote is the multi-select
 * counterpart).
 */
export function castSingleVote(guildId, pollId, optionId, userId) {
  return addVote(guildId, pollId, optionId, userId);
}

/**
 * Toggle a single option on/off for a user in a multi-select poll —
 * clicking an already-selected option removes just that vote, leaving
 * other selected options untouched (unlike addVote's single-select
 * overwrite, which clears every other option first).
 */
export function toggleVote(guildId, pollId, optionId, userId) {
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

  const voteIndex = option.votes.indexOf(userId);
  const wasSelected = voteIndex !== -1;

  if (wasSelected) {
    option.votes.splice(voteIndex, 1);
  } else {
    option.votes.push(userId);
  }

  saveGuildPolls(guildId, polls);
  return { poll, selected: !wasSelected };
}

/**
 * Close a poll — once. Returns the closed poll only to the caller that
 * actually closed it, and null if it was already closed: /survey close and
 * the auto-close timer can land together, and each must not post its own
 * results (and, with tie-breaks, its own runoff).
 */
export function closePoll(guildId, pollId, closedBy) {
  const polls = loadGuildPolls(guildId);
  const poll = polls.find(p => p.pollId === pollId);
  
  if (!poll) {
    throw new Error('Poll not found');
  }
  if (poll.status === 'closed') {
    return null;
  }
  
  poll.status = 'closed';
  poll.closedAt = new Date().toISOString();
  poll.closedBy = closedBy;
  
  saveGuildPolls(guildId, polls);
  return poll;
}

/**
 * Point a poll at a newly posted copy of its card (/survey voting-post).
 *
 * Votes refresh whichever card was clicked, but closing — by /survey close
 * or the auto-expiry scheduler — edits only `poll.messageId`. Left on the
 * old card, a repost would keep live buttons after the survey closed and
 * never show the final result. So the newest card becomes the poll's card.
 *
 * Load-modify-save in one synchronous step, so a vote saved meanwhile isn't
 * overwritten by a poll object read earlier.
 *
 * @returns {{channelId: string, messageId: string}} where the card was before
 */
export function movePollCard(guildId, pollId, channelId, messageId) {
  const polls = loadGuildPolls(guildId);
  const poll = polls.find(p => p.pollId === pollId);
  if (!poll) {
    throw new Error('Poll not found');
  }

  const previous = { channelId: poll.channelId, messageId: poll.messageId };
  poll.channelId = channelId;
  poll.messageId = messageId;
  saveGuildPolls(guildId, polls);
  return previous;
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

/** What a tie for first does. Surveys from before the option existed get the default. */
export function tieBreakOf(poll) {
  return poll.tieBreak === 'none' ? 'none' : 'runoff';
}

/**
 * The options tied for first, or null when there's a clear leader or no
 * votes at all (nobody voted is no result, not a tie).
 */
export function findTie(poll) {
  const top = Math.max(0, ...poll.options.map(o => o.votes.length));
  if (top === 0) return null;
  const tied = poll.options.filter(o => o.votes.length === top);
  return tied.length >= 2 ? tied : null;
}

/** How long a runoff runs: as long as the survey it settles, or a day. */
export function runoffMinutes(poll) {
  if (poll.durationMinutes) return poll.durationMinutes;
  if (poll.expiresAt && poll.createdAt) {
    return Math.max(1, Math.round((new Date(poll.expiresAt) - new Date(poll.createdAt)) / 60000));
  }
  return RUNOFF_DEFAULT_MINUTES;
}

/**
 * Settle a runoff that tied again: one of the tied options, at random.
 * Stored, so the card and any later look agree on the winner. Done once —
 * a second call returns the first pick.
 */
export function pickRandomWinner(guildId, pollId, random = randomInt) {
  const polls = loadGuildPolls(guildId);
  const poll = polls.find(p => p.pollId === pollId);
  if (!poll) throw new Error('Poll not found');
  if (poll.randomWinnerId != null) return poll;
  const tied = findTie(poll);
  if (!tied) return poll;
  poll.randomWinnerId = tied[random(tied.length)].id;
  saveGuildPolls(guildId, polls);
  return poll;
}

/** Remember the runoff a tied survey started, and which options tied. */
function linkRunoff(guildId, pollId, runoffPollId, tiedOptionIds) {
  const polls = loadGuildPolls(guildId);
  const poll = polls.find(p => p.pollId === pollId);
  if (!poll) return;
  poll.runoffPollId = runoffPollId;
  poll.tiedOptionIds = tiedOptionIds;
  saveGuildPolls(guildId, polls);
}

/**
 * Get user's vote in a poll
 */
export function getUserVote(poll, userId) {
  const votedOptions = poll.options.filter(opt => opt.votes.includes(userId));
  return votedOptions.map(opt => opt.id);
}

/**
 * Create a progress bar for vote percentage. The leader gets a solid fill
 * (█); everyone else gets a dimmer shade (▓) so the bar itself visually
 * reads as "behind" even though Discord embed text can't be colored.
 */
function createProgressBar(percentage, length = 20, isLeader = false) {
  const filled = Math.round((percentage / 100) * length);
  const empty = length - filled;
  const fillChar = isLeader ? '█' : '▓';
  return fillChar.repeat(filled) + '░'.repeat(empty);
}

/**
 * Build the voting button rows for a poll (up to 10 options = 2 rows of 5,
 * well within Discord's 5-buttons-per-row / 5-rows-per-message limits).
 * Only meaningful for poll.votingMethod === 'buttons' — reaction-based
 * polls (created before buttons existed) never call this.
 */
export function buildSurveyButtons(poll) {
  const buttons = poll.options.map(option =>
    new ButtonBuilder()
      .setCustomId(`survey_vote_${poll.pollId}_${option.id}`)
      .setLabel(option.text.length > 80 ? `${option.text.slice(0, 77)}...` : option.text)
      .setStyle(ButtonStyle.Primary)
  );

  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
  }
  return rows;
}

/** The voting buttons, greyed out: for a closed survey, or a card that moved. */
export function buildDisabledSurveyButtons(poll) {
  return buildSurveyButtons(poll).map(row => {
    const newRow = new ActionRowBuilder();
    row.components.forEach(btn => newRow.addComponents(ButtonBuilder.from(btn).setDisabled(true)));
    return newRow;
  });
}

/**
 * The line above a closed survey's results that says how a tie was settled:
 * a runoff started, or a runoff's random pick. Empty otherwise.
 */
function tieLine(poll) {
  if (poll.status !== 'closed') return '';
  const names = (ids) => ids.map(id => `**${poll.options.find(o => o.id === id)?.text}**`).join(' and ');
  if (poll.randomWinnerId != null) {
    const winner = poll.options.find(o => o.id === poll.randomWinnerId)?.text;
    return `🎲 Tied again, so the bot picked **${winner}** at random.\n\n`;
  }
  if (poll.runoffPollId && poll.tiedOptionIds?.length) {
    const votes = poll.options.find(o => o.id === poll.tiedOptionIds[0])?.votes.length || 0;
    return `🤝 Tied: ${names(poll.tiedOptionIds)} (${votes} vote${votes === 1 ? '' : 's'} each). Runoff below!\n\n`;
  }
  return '';
}

/**
 * Create a poll embed. Shared by /survey create, the live-updating vote
 * handlers (buttons and legacy reactions), /survey close, and the
 * auto-expiry scheduler, so every code path that renders a poll looks the
 * same.
 */
export function createPollEmbed(poll, showResults = false) {
  const { totalVotes, results } = getPollResults(poll);
  const voteInstruction = poll.votingMethod === 'reactions' ? 'React to vote!' : 'Click a button to vote!';

  const isRunoff = (poll.round || 1) >= 2;
  const embed = new EmbedBuilder()
    .setTitle(`${isRunoff ? '🔁 Runoff: ' : '📊 '}${poll.question}`.slice(0, 256))
    .setColor(poll.status === 'active' ? 0x5865F2 : 0x99AAB5)
    .setFooter({
      text: `Survey ID: ${poll.pollId} • ${poll.status === 'active' ? voteInstruction : 'Survey closed'} • Total votes: ${totalVotes}${poll.allowMultipleVotes ? ' • Multiple votes allowed' : ''}`,
    })
    .setTimestamp(new Date(poll.createdAt));

  // A sole leader gets a crown + bold treatment so it stands out from the
  // pack — skipped entirely when there are no votes yet, or when the top
  // spot is tied (no single option is actually "ahead").
  const isSoleLeader = totalVotes > 0 && results[0].voteCount > (results[1]?.voteCount ?? -1);
  // A runoff that tied again is settled at random; that pick gets the crown
  const randomWinner = poll.randomWinnerId != null ? poll.randomWinnerId : null;

  // Build options display
  const optionsText = results.map((option, index) => {
    const isLeader = showResults && (randomWinner != null ? option.id === randomWinner : isSoleLeader && index === 0);
    const bar = createProgressBar(option.percentage, 20, isLeader);
    const voteText = `${option.voteCount} vote${option.voteCount !== 1 ? 's' : ''}`;
    const crown = isLeader ? (randomWinner != null ? '🎲 ' : '🏆 ') : '';
    const name = isLeader ? `**${option.text}**` : option.text;

    if (showResults) {
      return `${crown}${option.emoji} ${name}\n${bar} ${option.percentage}% (${voteText})`;
    } else {
      return `${option.emoji} ${option.text}`;
    }
  }).join('\n\n');

  embed.setDescription(`${tieLine(poll)}${optionsText}`.slice(0, 4096));

  // Add status info
  if (poll.status === 'closed') {
    const closedDate = new Date(poll.closedAt);
    embed.addFields({
      name: 'Closed',
      value: `<t:${Math.floor(closedDate.getTime() / 1000)}:R>`,
      inline: true,
    });
  } else if (poll.expiresAt) {
    embed.addFields({
      name: 'Voting Ends',
      value: `<t:${Math.floor(new Date(poll.expiresAt).getTime() / 1000)}:R>`,
      inline: true,
    });
  }

  return embed;
}

/**
 * Close a poll, update its Discord message to a closed/results state, and
 * post a results announcement to the channel — the full "voting has ended"
 * flow. Shared by /survey close and pollScheduler.js's auto-expiry, so both
 * code paths behave identically instead of drifting.
 *
 * @param {import('discord.js').Client} client
 * @param {string} guildId
 * @param {string} pollId
 * @param {string} closedBy - User ID credited with closing the poll (the
 *   bot's own client.user.id for an auto-expiry close)
 * @returns {Promise<{success: boolean, poll?: object, error?: string}>}
 */
export async function closePollAndAnnounce(client, guildId, pollId, closedBy, { random = randomInt } = {}) {
  const poll = getPoll(guildId, pollId);

  if (!poll) {
    return { success: false, error: 'Poll not found' };
  }

  if (poll.status === 'closed') {
    return { success: false, error: 'Poll already closed' };
  }

  try {
    // Fetch the message before persisting anything — if it was deleted,
    // fail here with the poll still open rather than marking it closed and
    // only then discovering there's nothing to update.
    const channel = await client.channels.fetch(poll.channelId);
    const message = await channel.messages.fetch(poll.messageId);

    // Closed after the awaits, so this is where two closers race: only the
    // one that really closed it posts results (and starts any runoff)
    if (!closePoll(guildId, pollId, closedBy)) {
      return { success: false, error: 'Poll already closed' };
    }

    // A tie for first: a first-round survey gets a runoff between the tied
    // options; a runoff that ties again is settled at random
    const tied = tieBreakOf(poll) === 'runoff' ? findTie(getPoll(guildId, pollId)) : null;
    let runoff = null;
    if (tied && (poll.round || 1) >= 2) {
      pickRandomWinner(guildId, pollId, random);
    } else if (tied) {
      runoff = await startRunoff(channel, getPoll(guildId, pollId), tied);
    }

    const updatedPoll = getPoll(guildId, pollId);
    const pollEmbed = createPollEmbed(updatedPoll, true);

    if (updatedPoll.votingMethod === 'reactions') {
      await message.edit({ embeds: [pollEmbed] });
      await message.reactions.removeAll().catch(console.error);
    } else {
      // Disable rather than remove the buttons, so the closed poll still
      // shows what the options/labels were, matching the tiebreaker
      // voting UI's closed-state convention elsewhere in this bot.
      await message.edit({ embeds: [pollEmbed], components: buildDisabledSurveyButtons(updatedPoll) });
    }

    const resultsEmbed = createPollEmbed(updatedPoll, true);
    resultsEmbed.setTitle(resultsTitle(updatedPoll));
    await channel.send({ embeds: [resultsEmbed] });

    // The runoff goes out AFTER the results, so it's the newest message —
    // the one people see and vote on
    if (runoff) await runoff.post();

    return { success: true, poll: updatedPoll, runoff: runoff?.poll || null };
  } catch (error) {
    console.error(`Error closing poll ${pollId}:`, error);
    return { success: false, error: error.message };
  }
}

/** "🏁 Survey Closed: …", or for a runoff, who won the original question. */
function resultsTitle(poll) {
  const title = (poll.round || 1) >= 2
    ? `🏁 Runoff closed: ${poll.question}`
    : `🏁 Survey Closed: ${poll.question}`;
  return title.slice(0, 256);
}

/**
 * Create the runoff for a tied survey: only the tied options, one vote each
 * (even if the original allowed several — a runoff is choosing one), running
 * as long as the original did, or a day. It's an ordinary survey from then
 * on, so votes, /survey voting-post, close and the timer all just work.
 *
 * Stored now (so it's linked to the original before anything is posted);
 * `post()` sends it as a NEW message, which notifies — an edit wouldn't.
 */
async function startRunoff(channel, poll, tied) {
  const runoffPoll = createPoll(
    poll.guildId,
    poll.channelId,
    null,
    poll.creatorId,
    poll.question,
    tied.map(o => o.text),
    false,
    runoffMinutes(poll),
    { tieBreak: 'runoff', round: 2, runoffOf: poll.pollId }
  );
  linkRunoff(poll.guildId, poll.pollId, runoffPoll.pollId, tied.map(o => o.id));

  const names = tied.map(o => `**${o.text}**`).join(' and ');
  return {
    poll: runoffPoll,
    async post() {
      const sent = await channel.send({
        content: `🔁 **Runoff:** ${poll.question}\nIt's a tie between ${names}. Vote again to break it!`,
        embeds: [createPollEmbed(runoffPoll, false)],
        components: buildSurveyButtons(runoffPoll),
        allowedMentions: { parse: [] },
      });
      movePollCard(poll.guildId, runoffPoll.pollId, channel.id, sent.id);
    },
  };
}

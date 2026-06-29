/**
 * Tournament Voting Scheduler
 * 
 * Handles automatic closing of voting periods and notifications
 */

import * as bracketManager from './bracketManager.js';
import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as logger from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const tournamentsDir = join(__dirname, '../../guild_tournaments');

let client = null;
let schedulerInterval = null;
const CHECK_INTERVAL = 60 * 1000; // Check every 1 minute
const WARNING_THRESHOLD = 60 * 60 * 1000; // 1 hour before deadline

// Track warnings sent so we don't spam
const sentWarnings = new Map(); // key: `${guildId}_${groupId/matchupId}`, value: timestamp

/**
 * Initialize the scheduler with Discord client
 * @param {Client} discordClient - Discord.js client
 */
export function initialize(discordClient) {
  client = discordClient;
  
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }
  
  // Start checking every minute
  schedulerInterval = setInterval(checkVotingDeadlines, CHECK_INTERVAL);
  
  console.log('✓ Tournament scheduler initialized');
  logger.info(logger.LogCategory.SCHEDULER, 'Tournament scheduler initialized', {
    checkInterval: `${CHECK_INTERVAL / 1000}s`,
    warningThreshold: `${WARNING_THRESHOLD / (60 * 1000)}m`
  });
}

/**
 * Stop the scheduler (for graceful shutdown)
 */
export function shutdown() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('✓ Tournament scheduler stopped');
  }
}

/**
 * Check all tournaments for expired voting deadlines
 */
async function checkVotingDeadlines() {
  if (!client) return;
  
  try {
    const files = readdirSync(tournamentsDir).filter(f => f.endsWith('.json'));
    const now = Date.now();
    
    for (const file of files) {
      const guildId = file.replace('.json', '');
      const tournament = bracketManager.loadTournament(guildId);
      
      if (!tournament) continue;
      
      // Check group stage voting deadlines
      if (tournament.status === 'group_stage') {
        await checkGroupDeadlines(guildId, tournament, now);
      }
      
      // Check knockout voting deadlines
      if (tournament.status === 'knockout') {
        await checkKnockoutDeadlines(guildId, tournament, now);
      }
    }
  } catch (error) {
    console.error('[TournamentScheduler] Error checking deadlines:', error);
    logger.error(logger.LogCategory.SCHEDULER, 'Error checking voting deadlines', {
      error: error.message,
      stack: error.stack
    });
  }
}

/**
 * Check group stage deadlines and auto-close if expired
 */
async function checkGroupDeadlines(guildId, tournament, now) {
  try {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;
    
    // Group warnings by deadline time and channel to consolidate messages
    const warningsByDeadline = new Map(); // key: `${channelId}_${deadline}`, value: [groupIds]
    const groupsToClose = [];
    
    for (const [groupId, group] of Object.entries(tournament.groups)) {
      if (!group.votingOpen || !group.votingDeadline) continue;
      
      const warningKey = `${guildId}_group_${groupId}`;
      const timeUntilDeadline = group.votingDeadline - now;
      
      // Collect groups that need warnings (within 1 hour, not already warned)
      if (
        timeUntilDeadline > 0 &&
        timeUntilDeadline <= WARNING_THRESHOLD &&
        !sentWarnings.has(warningKey)
      ) {
        const channelId = group.votingMessageChannelId;
        if (channelId) {
          const key = `${channelId}_${group.votingDeadline}`;
          if (!warningsByDeadline.has(key)) {
            warningsByDeadline.set(key, { channelId, deadline: group.votingDeadline, groups: [] });
          }
          warningsByDeadline.get(key).groups.push(groupId);
          sentWarnings.set(warningKey, now);
        }
      }
      
      // Collect groups to auto-close
      if (now > group.votingDeadline) {
        groupsToClose.push({ groupId, group });
        sentWarnings.delete(warningKey);
      }
    }
    
    // Send consolidated warnings (one message per deadline time)
    for (const { channelId, deadline, groups } of warningsByDeadline.values()) {
      await sendConsolidatedGroupWarning(guild, tournament, channelId, deadline, groups);
    }
    
    // Auto-close groups individually
    for (const { groupId, group } of groupsToClose) {
      await autoCloseGroup(guild, tournament, groupId, group);
    }
  } catch (error) {
    console.error(`[TournamentScheduler] Error checking group deadlines for guild ${guildId}:`, error);
  }
}

/**
 * Check knockout deadlines and auto-close if expired
 */
async function checkKnockoutDeadlines(guildId, tournament, now) {
  try {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;
    
    // Group warnings by deadline time and channel to consolidate messages
    const warningsByDeadline = new Map(); // key: `${channelId}_${deadline}`, value: [matchups]
    const matchupsToClose = [];
    
    for (const matchup of tournament.knockoutBracket) {
      if (matchup.status !== 'voting' || !matchup.votingDeadline) continue;
      
      const warningKey = `${guildId}_matchup_${matchup.id}`;
      const timeUntilDeadline = matchup.votingDeadline - now;
      
      // Collect matchups that need warnings (within 1 hour, not already warned)
      if (
        timeUntilDeadline > 0 &&
        timeUntilDeadline <= WARNING_THRESHOLD &&
        !sentWarnings.has(warningKey)
      ) {
        const channelId = matchup.messageChannelId;
        if (channelId) {
          const key = `${channelId}_${matchup.votingDeadline}`;
          if (!warningsByDeadline.has(key)) {
            warningsByDeadline.set(key, { channelId, deadline: matchup.votingDeadline, matchups: [] });
          }
          warningsByDeadline.get(key).matchups.push(matchup);
          sentWarnings.set(warningKey, now);
        }
      }
      
      // Collect matchups to auto-close
      if (now > matchup.votingDeadline) {
        matchupsToClose.push(matchup);
        sentWarnings.delete(warningKey);
      }
    }
    
    // Send consolidated warnings (one message per deadline time)
    for (const { channelId, deadline, matchups } of warningsByDeadline.values()) {
      await sendConsolidatedMatchupWarning(guild, tournament, channelId, deadline, matchups);
    }
    
    // Auto-close matchups individually
    for (const matchup of matchupsToClose) {
      await autoCloseMatchup(guild, tournament, matchup);
    }
  } catch (error) {
    console.error(`[TournamentScheduler] Error checking knockout deadlines for guild ${guildId}:`, error);
  }
}

/**
 * Send consolidated 1-hour warning for multiple groups with same deadline
 */
async function sendConsolidatedGroupWarning(guild, tournament, channelId, deadline, groupIds) {
  try {
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) return;
    
    const timeRemaining = formatTimeRemaining(deadline);
    const groupList = groupIds.length === 1 
      ? `Group ${groupIds[0]}`
      : `Groups ${groupIds.join(', ')}`;
    
    const embed = new EmbedBuilder()
      .setColor('#FFA500') // Orange for warning
      .setTitle(`⏰ Voting Closing Soon!`)
      .setDescription(
        `**${tournament.name}** - ${groupList}\n\n` +
        `Voting closes in **${timeRemaining}**\n\n` +
        `Cast your votes now!\n` +
        `${new Date(deadline).toLocaleString()}`
      )
      .setTimestamp();
    
    await channel.send({ embeds: [embed] });
    
    logger.notice(logger.LogCategory.SCHEDULER, `Sent voting warning for ${groupList}`, {
      guildId: guild.id,
      tournamentName: tournament.name,
      groupIds,
      timeRemaining
    });
  } catch (error) {
    console.error('[TournamentScheduler] Error sending consolidated warning:', error);
  }
}

/**
 * Send consolidated 1-hour warning for multiple matchups with same deadline
 */
async function sendConsolidatedMatchupWarning(guild, tournament, channelId, deadline, matchups) {
  try {
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) return;
    
    const timeRemaining = formatTimeRemaining(deadline);
    const matchupList = matchups.length === 1
      ? getMatchupTitle(matchups[0])
      : `${matchups.length} matchup${matchups.length !== 1 ? 's' : ''}`;
    
    let description = `**${tournament.name}** - ${matchupList}\n\n` +
      `Voting closes in **${timeRemaining}**\n\n`;
    
    // If only a few matchups, list them
    if (matchups.length <= 3) {
      description += matchups.map(m => `• ${getMatchupTitle(m)}`).join('\n') + '\n\n';
    }
    
    description += `Cast your votes now!\n${new Date(deadline).toLocaleString()}`;
    
    const embed = new EmbedBuilder()
      .setColor('#FFA500') // Orange for warning
      .setTitle(`⏰ Voting Closing Soon!`)
      .setDescription(description)
      .setTimestamp();
    
    await channel.send({ embeds: [embed] });
    
    logger.notice(logger.LogCategory.SCHEDULER, `Sent voting warning for ${matchupList}`, {
      guildId: guild.id,
      tournamentName: tournament.name,
      matchupCount: matchups.length,
      timeRemaining
    });
  } catch (error) {
    console.error('[TournamentScheduler] Error sending consolidated matchup warning:', error);
  }
}

/**
 * Auto-close a group and post results
 */
async function autoCloseGroup(guild, tournament, groupId, group) {
  try {
    console.log(`[TournamentScheduler] Auto-closing Group ${groupId} for guild ${guild.id}`);
    
    logger.info(logger.LogCategory.SCHEDULER, `Auto-closing Group ${groupId}`, {
      guildId: guild.id,
      tournamentName: tournament.name,
      groupId,
      voterCount: Object.keys(group.voters || {}).length
    });
    
    // Close the group
    const result = bracketManager.closeGroupVoting(guild.id, [groupId]);
    if (!result.success) {
      console.error(`[TournamentScheduler] Failed to close group ${groupId}:`, result.error);
      logger.error(logger.LogCategory.SCHEDULER, `Failed to close group ${groupId}`, {
        guildId: guild.id,
        groupId,
        error: result.error
      });
      return;
    }
    
    // Update the voting message to show closed status
    if (group.votingMessageChannelId && group.votingMessageId) {
      await updateVotingMessageClosed(guild, group, groupId, 'group');
    }
    
    // Post results notification
    await postGroupResults(guild, tournament, groupId, result.groups[groupId]);
    
  } catch (error) {
    console.error(`[TournamentScheduler] Error auto-closing group ${groupId}:`, error);
    logger.error(logger.LogCategory.SCHEDULER, `Error auto-closing group ${groupId}`, {
      guildId: guild.id,
      groupId,
      error: error.message,
      stack: error.stack
    });
  }
}

/**
 * Auto-close a matchup and post results
 */
async function autoCloseMatchup(guild, tournament, matchup) {
  try {
    console.log(`[TournamentScheduler] Auto-closing matchup ${matchup.id} for guild ${guild.id}`);
    
    logger.info(logger.LogCategory.SCHEDULER, `Auto-closing matchup ${matchup.id}`, {
      guildId: guild.id,
      tournamentName: tournament.name,
      matchupId: matchup.id,
      round: matchup.round,
      votes: matchup.votes
    });
    
    // Close the matchup
    const result = bracketManager.closeKnockoutMatchup(guild.id, matchup.id);
    if (!result.success) {
      console.error(`[TournamentScheduler] Failed to close matchup ${matchup.id}:`, result.error);
      logger.error(logger.LogCategory.SCHEDULER, `Failed to close matchup ${matchup.id}`, {
        guildId: guild.id,
        matchupId: matchup.id,
        error: result.error
      });
      return;
    }
    
    // Update the voting message to show closed status
    if (matchup.messageChannelId && matchup.messageId) {
      await updateVotingMessageClosed(guild, matchup, matchup.id, 'matchup');
    }
    
    // Post results notification
    await postMatchupResults(guild, tournament, result.matchup);
    
  } catch (error) {
    console.error(`[TournamentScheduler] Error auto-closing matchup ${matchup.id}:`, error);
  }
}

/**
 * Update voting message to show CLOSED status and disable buttons
 */
async function updateVotingMessageClosed(guild, item, id, type) {
  try {
    const channelId = type === 'group' ? item.votingMessageChannelId : item.messageChannelId;
    const messageId = type === 'group' ? item.votingMessageId : item.messageId;
    
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) return;
    
    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message) return;
    
    // Update embeds to show CLOSED
    const updatedEmbeds = message.embeds.map(embed => {
      const newEmbed = EmbedBuilder.from(embed);
      
      // Add CLOSED indicator to title or description
      if (embed.title) {
        newEmbed.setTitle(`${embed.title} 🔒 CLOSED`);
      }
      
      newEmbed.setColor('#808080'); // Gray for closed
      newEmbed.setFooter({ text: `Voting closed • Final results below` });
      
      return newEmbed;
    });
    
    // Disable all buttons
    const disabledComponents = message.components.map(row => {
      const newRow = new ActionRowBuilder();
      row.components.forEach(button => {
        newRow.addComponents(
          ButtonBuilder.from(button).setDisabled(true)
        );
      });
      return newRow;
    });
    
    await message.edit({ 
      embeds: updatedEmbeds,
      components: disabledComponents
    });
    
  } catch (error) {
    console.error('[TournamentScheduler] Error updating voting message:', error);
  }
}

/**
 * Post group voting results
 */
async function postGroupResults(guild, tournament, groupId, group) {
  try {
    const channel = group.votingMessageChannelId 
      ? await guild.channels.fetch(group.votingMessageChannelId).catch(() => null)
      : null;
    
    if (!channel) return;
    
    // Sort movies by votes (descending)
    const sortedMovies = [...group.movies].sort((a, b) => b.votes.length - a.votes.length);
    
    const embed = new EmbedBuilder()
      .setColor('#00FF00') // Green for success
      .setTitle(`📊 Group ${groupId} Results - ${tournament.name}`)
      .setDescription(`Voting has closed! Here are the final results:`)
      .addFields(
        sortedMovies.map((movie, index) => {
          const emoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '📍';
          const voteCount = movie.votes.length;
          const qualified = index < 2 ? ' ✅ **Advances**' : '';
          
          return {
            name: `${emoji} ${movie.title}`,
            value: `**${voteCount}** vote${voteCount !== 1 ? 's' : ''}${qualified}`,
            inline: true
          };
        })
      )
      .setFooter({ text: `Total voters: ${Object.keys(group.voters || {}).length}` })
      .setTimestamp();
    
    await channel.send({ embeds: [embed] });
    
  } catch (error) {
    console.error('[TournamentScheduler] Error posting group results:', error);
  }
}

/**
 * Post matchup voting results
 */
async function postMatchupResults(guild, tournament, matchup) {
  try {
    const channel = matchup.messageChannelId 
      ? await guild.channels.fetch(matchup.messageChannelId).catch(() => null)
      : null;
    
    if (!channel) return;
    
    const votesA = matchup.votes[0] || 0;
    const votesB = matchup.votes[1] || 0;
    const winner = votesA > votesB ? matchup.participants[0] : matchup.participants[1];
    const winnerVotes = Math.max(votesA, votesB);
    const loserVotes = Math.min(votesA, votesB);
    
    const embed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle(`📊 ${getMatchupTitle(matchup)} - Results`)
      .setDescription(`**${tournament.name}**\n\nVoting has closed!`)
      .addFields(
        {
          name: '🏆 Winner',
          value: `**${winner.title}**\n${winnerVotes} vote${winnerVotes !== 1 ? 's' : ''}`,
          inline: true
        },
        {
          name: 'Runner-up',
          value: `${matchup.participants[0].title === winner.title ? matchup.participants[1].title : matchup.participants[0].title}\n${loserVotes} vote${loserVotes !== 1 ? 's' : ''}`,
          inline: true
        }
      )
      .setFooter({ text: `Total votes: ${votesA + votesB}` })
      .setTimestamp();
    
    await channel.send({ embeds: [embed] });
    
  } catch (error) {
    console.error('[TournamentScheduler] Error posting matchup results:', error);
  }
}

/**
 * Get matchup title based on round
 */
function getMatchupTitle(matchup) {
  const roundNames = {
    'round_of_32': 'Round of 32',
    'round_of_16': 'Round of 16',
    'quarterfinals': 'Quarterfinals',
    'semifinals': 'Semifinals',
    'finals': 'Finals'
  };
  
  const roundName = roundNames[matchup.round] || matchup.round;
  return `${roundName} - Match ${matchup.position + 1}`;
}

/**
 * Format time remaining until deadline
 */
function formatTimeRemaining(deadline) {
  const now = Date.now();
  const remaining = deadline - now;
  
  if (remaining <= 0) return 'Voting closed';
  
  const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
  const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
  
  if (days > 0) {
    return `${days}d ${hours}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

/**
 * Clean up old warning tracking (runs on shutdown)
 */
export function cleanupWarnings() {
  const now = Date.now();
  const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
  
  for (const [key, timestamp] of sentWarnings.entries()) {
    if (now - timestamp > ONE_WEEK) {
      sentWarnings.delete(key);
    }
  }
}

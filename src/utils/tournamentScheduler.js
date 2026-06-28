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
  }
}

/**
 * Check group stage deadlines and auto-close if expired
 */
async function checkGroupDeadlines(guildId, tournament, now) {
  try {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;
    
    for (const [groupId, group] of Object.entries(tournament.groups)) {
      if (!group.votingOpen || !group.votingDeadline) continue;
      
      const warningKey = `${guildId}_group_${groupId}`;
      const timeUntilDeadline = group.votingDeadline - now;
      
      // Send 1-hour warning
      if (
        timeUntilDeadline > 0 &&
        timeUntilDeadline <= WARNING_THRESHOLD &&
        !sentWarnings.has(warningKey)
      ) {
        await sendVotingWarning(guild, tournament, 'group', groupId, group);
        sentWarnings.set(warningKey, now);
      }
      
      // Auto-close if deadline passed
      if (now > group.votingDeadline) {
        await autoCloseGroup(guild, tournament, groupId, group);
        sentWarnings.delete(warningKey);
      }
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
    
    for (const matchup of tournament.knockoutBracket) {
      if (matchup.status !== 'voting' || !matchup.votingDeadline) continue;
      
      const warningKey = `${guildId}_matchup_${matchup.id}`;
      const timeUntilDeadline = matchup.votingDeadline - now;
      
      // Send 1-hour warning
      if (
        timeUntilDeadline > 0 &&
        timeUntilDeadline <= WARNING_THRESHOLD &&
        !sentWarnings.has(warningKey)
      ) {
        await sendVotingWarning(guild, tournament, 'matchup', matchup.id, matchup);
        sentWarnings.set(warningKey, now);
      }
      
      // Auto-close if deadline passed
      if (now > matchup.votingDeadline) {
        await autoCloseMatchup(guild, tournament, matchup);
        sentWarnings.delete(warningKey);
      }
    }
  } catch (error) {
    console.error(`[TournamentScheduler] Error checking knockout deadlines for guild ${guildId}:`, error);
  }
}

/**
 * Send 1-hour warning before voting closes
 */
async function sendVotingWarning(guild, tournament, type, id, item) {
  try {
    // Find the voting message channel
    const messageChannelId = type === 'group' ? item.votingMessageChannelId : item.messageChannelId;
    if (!messageChannelId) return;
    
    const channel = await guild.channels.fetch(messageChannelId).catch(() => null);
    if (!channel) return;
    
    const timeRemaining = formatTimeRemaining(item.votingDeadline);
    const title = type === 'group' ? `Group ${id}` : getMatchupTitle(item);
    
    const embed = new EmbedBuilder()
      .setColor('#FFA500') // Orange for warning
      .setTitle(`⏰ Voting Closing Soon!`)
      .setDescription(`**${tournament.name}** - ${title}\n\nVoting closes in **${timeRemaining}**\n\nCast your votes now!`)
      .setTimestamp();
    
    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('[TournamentScheduler] Error sending warning:', error);
  }
}

/**
 * Auto-close a group and post results
 */
async function autoCloseGroup(guild, tournament, groupId, group) {
  try {
    console.log(`[TournamentScheduler] Auto-closing Group ${groupId} for guild ${guild.id}`);
    
    // Close the group
    const result = bracketManager.closeGroupVoting(guild.id, [groupId]);
    if (!result.success) {
      console.error(`[TournamentScheduler] Failed to close group ${groupId}:`, result.error);
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
  }
}

/**
 * Auto-close a matchup and post results
 */
async function autoCloseMatchup(guild, tournament, matchup) {
  try {
    console.log(`[TournamentScheduler] Auto-closing matchup ${matchup.id} for guild ${guild.id}`);
    
    // Close the matchup
    const result = bracketManager.closeKnockoutMatchup(guild.id, matchup.id);
    if (!result.success) {
      console.error(`[TournamentScheduler] Failed to close matchup ${matchup.id}:`, result.error);
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

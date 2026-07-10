import { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, GuildScheduledEventStatus } from 'discord.js';
import { searchMovies, searchTVShows, getMovieDetails, getTVShowDetails } from '../services/tmdbService.js';

/**
 * Auto-detect event title from scheduled events
 * Looks for active events where the event location matches the current channel
 */
async function getEventForChannel(guild, channelId) {
  try {
    console.log(`[Watch Party] Checking for events in channel ${channelId}...`);
    
    // Fetch all scheduled events
    const events = await guild.scheduledEvents.fetch();
    console.log(`[Watch Party] Found ${events.size} total scheduled event(s)`);
    
    // Find active or scheduled events (not just active)
    const relevantEvents = events.filter(event => 
      event.status === GuildScheduledEventStatus.Active || 
      event.status === GuildScheduledEventStatus.Scheduled
    );
    console.log(`[Watch Party] Found ${relevantEvents.size} active/scheduled event(s)`);
    
    if (relevantEvents.size === 0) {
      console.log(`[Watch Party] No relevant events found`);
      return null;
    }
    
    // Look for an event where the channel matches
    for (const [, event] of relevantEvents) {
      console.log(`[Watch Party] Checking event: "${event.name}"`);
      console.log(`[Watch Party] - Event status: ${event.status}`);
      console.log(`[Watch Party] - Event channelId: ${event.channelId}`);
      console.log(`[Watch Party] - Event location: ${event.entityMetadata?.location || 'none'}`);
      
      // Check if it's a channel-based event and matches our channel
      if (event.channelId === channelId) {
        console.log(`[Watch Party] ✅ Found matching event: "${event.name}" (channel-based)`);
        return event;
      }
      
      // Check if the location field mentions this channel
      if (event.entityMetadata?.location) {
        const location = event.entityMetadata.location.toLowerCase();
        const channelMention = `<#${channelId}>`;
        
        console.log(`[Watch Party] - Checking if location contains channel ID or mention...`);
        
        // Check if location contains channel mention or ID
        if (location.includes(channelId) || location.includes(channelMention.toLowerCase())) {
          console.log(`[Watch Party] ✅ Found matching event: "${event.name}" (location mentions channel)`);
          return event;
        }
        
        // Also check if location matches channel name
        const channel = guild.channels.cache.get(channelId);
        if (channel) {
          const channelNamePattern = `#${channel.name}`.toLowerCase();
          console.log(`[Watch Party] - Also checking channel name: "${channelNamePattern}"`);
          
          if (location === channelNamePattern || location.includes(channelNamePattern)) {
            console.log(`[Watch Party] ✅ Found matching event: "${event.name}" (location matches channel name)`);
            return event;
          }
        }
      }
    }
    
    console.log(`[Watch Party] ❌ No matching events found for channel ${channelId}`);
    return null;
  } catch (error) {
    console.error('[Watch Party] Error fetching scheduled events:', error);
    return null;
  }
}

/**
 * Search for content on TMDB and return results
 */
async function searchContent(title) {
  try {
    // Search both movies and TV shows
    const [movieResults, tvResults] = await Promise.all([
      searchMovies(title),
      searchTVShows(title)
    ]);
    
    // Combine and sort by popularity
    const allResults = [
      ...movieResults.map(m => ({ ...m, type: 'movie' })),
      ...tvResults.map(t => ({ ...t, type: 'tv' }))
    ].sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    
    return allResults.slice(0, 10); // Return top 10
  } catch (error) {
    console.error('[Watch Party] Error searching TMDB:', error);
    return [];
  }
}

/**
 * Format runtime for display
 */
function formatRuntime(minutes) {
  if (!minutes) return 'Unknown';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export const data = new SlashCommandBuilder()
  .setName('watchparty')
  .setDescription('Watch party timer announcements')
  .addSubcommand(subcommand =>
    subcommand
      .setName('remind')
      .setDescription('🎬 Announce that the timer is about to start')
      .addStringOption(option =>
        option
          .setName('message')
          .setDescription('Optional custom message (e.g., "Everyone ready?")')
          .setRequired(false)
          .setMaxLength(200)
      )
      .addRoleOption(option =>
        option
          .setName('role')
          .setDescription('Optional role to ping')
          .setRequired(false)
      )
  );

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();
  
  if (subcommand === 'remind') {
    await interaction.deferReply();
    
    try {
      const customMessage = interaction.options.getString('message');
      const roleToMention = interaction.options.getRole('role');
      
      // Try to detect event from Discord scheduled events
      const event = await getEventForChannel(interaction.guild, interaction.channel.id);
      
      if (!event) {
        // editReply() can't make an already-public deferred reply ephemeral, so
        // delete the public placeholder and send the error as a followUp instead.
        await interaction.deleteReply();
        return await interaction.followUp({
          content: '❌ No scheduled event found for this channel!\n\nMake sure you have a Discord scheduled event set up for this channel (or with this channel mentioned in the location).',
          ephemeral: true
        });
      }
      
      const eventTitle = event.name;
      console.log(`[Watch Party] Auto-detected event: "${eventTitle}"`);
      
      // Search TMDB for this title
      const results = await searchContent(eventTitle);
      
      if (results.length === 0) {
        // No TMDB results - just show a basic announcement
        const embed = new EmbedBuilder()
          .setColor('#FF6B9D')
          .setTitle('⏱️ Starting Timer Now!')
          .setDescription(`**${eventTitle}**\n\nTimer starting - get ready!`)
          .setFooter({ text: `Hosted by ${interaction.user.username}` })
          .setTimestamp();
        
        if (customMessage) {
          embed.addFields({ name: '💬 Host', value: customMessage });
        }
        
        // Add voice channel button if event has a voice channel
        const components = [];
        if (event.channelId) {
          const voiceChannel = interaction.guild.channels.cache.get(event.channelId);
          if (voiceChannel && (voiceChannel.type === 2 || voiceChannel.type === 13)) { // Voice or Stage
            const button = new ButtonBuilder()
              .setLabel('Join Voice Channel')
              .setStyle(ButtonStyle.Link)
              .setURL(`https://discord.com/channels/${interaction.guild.id}/${event.channelId}`);
            
            components.push(new ActionRowBuilder().addComponents(button));
          }
        }
        
        const messageContent = roleToMention ? `${roleToMention}` : null;
        
        return await interaction.editReply({ 
          content: messageContent,
          embeds: [embed],
          components
        });
      }
      
      // If only one result, use it directly
      // If multiple results, use the first one (most popular)
      const selectedContent = results[0];
      
      // Get full details
      let details;
      if (selectedContent.type === 'movie') {
        details = await getMovieDetails(selectedContent.id);
      } else {
        details = await getTVShowDetails(selectedContent.id);
      }
      
      // Build the announcement embed
      const embed = new EmbedBuilder()
        .setColor('#FF6B9D')
        .setTitle(`⏱️ Starting Timer Now!`)
        .setDescription(`**${details.title || details.name}**${details.tagline ? `\n*${details.tagline}*` : ''}\n\nGet ready - timer starting!`)
        .setFooter({ text: `Hosted by ${interaction.user.username}` })
        .setTimestamp();
      
      // Add poster if available
      if (details.poster_path) {
        embed.setThumbnail(`https://image.tmdb.org/t/p/w500${details.poster_path}`);
      }
      
      // Add fields
      const fields = [];
      
      // Runtime
      if (details.runtime) {
        fields.push({ 
          name: '⏱️ Runtime', 
          value: formatRuntime(details.runtime),
          inline: true
        });
      } else if (details.episode_run_time && details.episode_run_time.length > 0) {
        fields.push({ 
          name: '⏱️ Episode Length', 
          value: formatRuntime(details.episode_run_time[0]),
          inline: true
        });
      }
      
      // Release year
      const year = details.release_date?.split('-')[0] || details.first_air_date?.split('-')[0];
      if (year) {
        fields.push({ 
          name: '📅 Year', 
          value: year,
          inline: true
        });
      }
      
      // Overview (truncated)
      if (details.overview) {
        const truncatedOverview = details.overview.length > 200 
          ? details.overview.substring(0, 197) + '...' 
          : details.overview;
        fields.push({ 
          name: '📖 Overview', 
          value: truncatedOverview
        });
      }
      
      // Custom message from host
      if (customMessage) {
        fields.push({ 
          name: '💬 Host', 
          value: customMessage
        });
      }
      
      embed.addFields(fields);
      
      // Add buttons
      const components = [];
      const buttons = [];
      
      // TMDB link
      const tmdbUrl = selectedContent.type === 'movie' 
        ? `https://www.themoviedb.org/movie/${selectedContent.id}`
        : `https://www.themoviedb.org/tv/${selectedContent.id}`;
      
      buttons.push(
        new ButtonBuilder()
          .setLabel('View on TMDB')
          .setStyle(ButtonStyle.Link)
          .setURL(tmdbUrl)
      );
      
      // Voice channel button if event has a voice channel
      if (event.channelId) {
        const voiceChannel = interaction.guild.channels.cache.get(event.channelId);
        if (voiceChannel && (voiceChannel.type === 2 || voiceChannel.type === 13)) { // Voice or Stage
          buttons.push(
            new ButtonBuilder()
              .setLabel('Join Voice Channel')
              .setStyle(ButtonStyle.Link)
              .setURL(`https://discord.com/channels/${interaction.guild.id}/${event.channelId}`)
          );
        }
      }
      
      if (buttons.length > 0) {
        components.push(new ActionRowBuilder().addComponents(buttons));
      }
      
      const messageContent = roleToMention ? `${roleToMention}` : null;
      
      await interaction.editReply({
        content: messageContent,
        embeds: [embed],
        components
      });
      
    } catch (error) {
      console.error('[Watch Party] Error executing remind command:', error);
      
      if (interaction.deferred) {
        // editReply() can't make an already-public deferred reply ephemeral, so
        // delete the public placeholder and send the error as a followUp instead.
        await interaction.deleteReply().catch(() => {});
        await interaction.followUp({
          content: '❌ An error occurred while creating the watch party announcement.',
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content: '❌ An error occurred while creating the watch party announcement.',
          ephemeral: true
        });
      }
    }
  }
}

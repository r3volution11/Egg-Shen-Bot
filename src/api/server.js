import express from 'express';
import cors from 'cors';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { loadGuildConfig } from '../utils/guildConfig.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to persist event requests
const EVENT_REQUESTS_FILE = path.join(__dirname, '../../pending_event_requests.json');

/**
 * Save event requests to disk
 */
async function saveEventRequests() {
  try {
    if (!global.eventRequests) {
      global.eventRequests = new Map();
    }
    const requestsData = Object.fromEntries(global.eventRequests);
    await fs.writeFile(EVENT_REQUESTS_FILE, JSON.stringify(requestsData, null, 2), 'utf8');
  } catch (error) {
    console.error('[EventRequests] Error saving requests:', error);
  }
}

/**
 * Load event requests from disk on bot startup
 */
async function loadEventRequests() {
  try {
    const data = await fs.readFile(EVENT_REQUESTS_FILE, 'utf8');
    const requestsData = JSON.parse(data);
    
    if (!global.eventRequests) {
      global.eventRequests = new Map();
    }
    
    let loadedCount = 0;
    let expiredCount = 0;
    const now = Date.now();
    
    for (const [requestId, request] of Object.entries(requestsData)) {
      // Parse requestId to get timestamp (format: timestamp_randomstring)
      const timestamp = parseInt(requestId.split('_')[0]);
      const age = now - timestamp;
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      
      // Skip requests older than 7 days
      if (age > sevenDays) {
        expiredCount++;
        continue;
      }
      
      global.eventRequests.set(requestId, request);
      loadedCount++;
    }
    
    console.log(`✓ Restored ${loadedCount} pending event request(s) from previous session`);
    if (expiredCount > 0) {
      console.log(`  Cleaned up ${expiredCount} expired request(s)`);
      // Save again to remove expired requests from file
      await saveEventRequests();
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist yet, that's fine
      console.log('ℹ️ No pending event requests to restore');
      return;
    }
    console.error('[EventRequests] Error loading requests:', error);
  }
}

/**
 * Create and configure Express API server for event requests
 * @param {Client} client - Discord.js client instance
 * @returns {express.Application} Express app instance
 */
export function createApiServer(client) {
  const app = express();
  
  /**
   * Check if a Discord user is a member of a specific guild
   * @param {string} guildId - Guild ID to check
   * @param {string} userId - Discord user ID
   * @returns {Promise<{isMember: boolean, guild: Guild|null}>}
   */
  async function checkGuildMembership(guildId, userId) {
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        return { isMember: false, guild: null };
      }
      
      // Try to fetch the member from the guild
      const member = await guild.members.fetch(userId).catch(() => null);
      return { isMember: !!member, guild };
    } catch (error) {
      console.error('[Guild Membership] Error checking membership:', error);
      return { isMember: false, guild: null };
    }
  }
  
  // Middleware
  app.set('trust proxy', true); // Trust Nginx proxy for X-Forwarded-For headers
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true
  }));
  app.use(express.json());
  app.use(cookieParser());
  
  // Rate limiting for event submissions (1 per 5 minutes per IP)
  const eventRequestLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 1,
    message: { error: 'Too many event requests. Please wait 5 minutes before submitting another.' },
    standardHeaders: true,
    legacyHeaders: false,
  });
  
  // Rate limiting for channel fetching (10 per minute per IP)
  const channelFetchLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10,
    message: { error: 'Too many requests. Please try again later.' }
  });
  
  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      bot: client.user?.tag || 'Not ready',
      guilds: client.guilds.cache.size 
    });
  });
  
  // Get guild configuration for event requests
  app.get('/api/guild-config/:guildId', async (req, res) => {
    try {
      const { guildId } = req.params;
      const guildConfig = await loadGuildConfig(guildId);
      const eventRequestConfig = guildConfig.eventRequests || {};
      
      if (!eventRequestConfig.enabled) {
        return res.status(404).json({ 
          error: 'Event requests are not enabled for this server',
          config: null
        });
      }
      
      res.json({
        config: {
          serverName: eventRequestConfig.serverName || 'Discord Server',
          inviteUrl: eventRequestConfig.inviteUrl || null,
          websiteUrl: eventRequestConfig.websiteUrl || null,
          allowUserChannelSelection: eventRequestConfig.allowUserChannelSelection === true,
          allowVoiceRequests: eventRequestConfig.allowVoiceRequests !== false
        }
      });
    } catch (error) {
      console.error('[API] Error fetching guild config:', error);
      res.status(500).json({ error: 'Failed to fetch guild configuration' });
    }
  });
  
  // Discord OAuth - Redirect to Discord authorization
  app.get('/api/auth/discord', (req, res) => {
    const { guildId } = req.query;
    
    if (!guildId) {
      return res.status(400).json({ error: 'guildId parameter required' });
    }
    
    const clientId = process.env.DISCORD_CLIENT_ID;
    const redirectUri = encodeURIComponent(process.env.OAUTH_REDIRECT_URI || 'http://localhost:3000/api/auth/discord/callback');
    const scope = 'identify';
    
    // Store guildId in state parameter for callback
    const state = Buffer.from(JSON.stringify({ guildId })).toString('base64');
    
    const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${state}`;
    
    res.redirect(authUrl);
  });
  
  // Discord OAuth - Handle callback
  app.get('/api/auth/discord/callback', async (req, res) => {
    const { code, state } = req.query;
    
    if (!code) {
      return res.status(400).send('Authorization code missing');
    }
    
    try {
      // Decode state to get guildId
      const { guildId } = JSON.parse(Buffer.from(state, 'base64').toString());
      
      // Exchange code for access token
      const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          client_id: process.env.DISCORD_CLIENT_ID,
          client_secret: process.env.DISCORD_CLIENT_SECRET,
          grant_type: 'authorization_code',
          code,
          redirect_uri: process.env.OAUTH_REDIRECT_URI || 'http://localhost:3000/api/auth/discord/callback'
        })
      });
      
      const tokenData = await tokenResponse.json();
      
      if (!tokenResponse.ok) {
        console.error('[OAuth] Token exchange failed:', tokenData);
        return res.status(500).send('Failed to exchange authorization code');
      }
      
      // Fetch user info
      const userResponse = await fetch('https://discord.com/api/users/@me', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`
        }
      });
      
      const userData = await userResponse.json();
      
      if (!userResponse.ok) {
        console.error('[OAuth] User fetch failed:', userData);
        return res.status(500).send('Failed to fetch user information');
      }
      
      // Check if user is a member of the guild
      const { isMember, guild } = await checkGuildMembership(guildId, userData.id);
      
      if (!isMember) {
        console.log(`[OAuth] User ${userData.username} (${userData.id}) is not a member of guild ${guildId}`);
        
        // Load guild config to get invite URL
        const guildConfig = await loadGuildConfig(guildId);
        const inviteUrl = guildConfig.eventRequests?.inviteUrl;
        const serverName = guildConfig.eventRequests?.serverName || (guild?.name || 'this server');
        
        const formUrl = process.env.FORM_URL || 'http://localhost:8080';
        
        // Redirect with error parameters
        const errorParams = new URLSearchParams({
          error: 'not_member',
          serverName,
          ...(inviteUrl && { inviteUrl })
        });
        
        return res.redirect(`${formUrl}?${errorParams.toString()}`);
      }
      
      // Create a session token
      const sessionToken = Buffer.from(JSON.stringify({
        userId: userData.id,
        username: userData.username,
        discriminator: userData.discriminator,
        avatar: userData.avatar,
        guildId,
        timestamp: Date.now()
      })).toString('base64');
      
      // Set cookie and redirect back to form
      res.cookie('discord_session', sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      });
      
      // Redirect back to event request form
      const formUrl = process.env.FORM_URL || 'http://localhost:8080';
      res.redirect(`${formUrl}?guildId=${guildId}&auth=success`);
      
    } catch (error) {
      console.error('[OAuth] Callback error:', error);
      res.status(500).send('Authentication failed');
    }
  });
  
  // Get current session info
  app.get('/api/auth/session', (req, res) => {
    const sessionCookie = req.cookies.discord_session;
    
    if (!sessionCookie) {
      return res.json({ authenticated: false });
    }
    
    try {
      const session = JSON.parse(Buffer.from(sessionCookie, 'base64').toString());
      
      // Check if session is still valid (24 hours)
      if (Date.now() - session.timestamp > 24 * 60 * 60 * 1000) {
        res.clearCookie('discord_session');
        return res.json({ authenticated: false });
      }
      
      res.json({
        authenticated: true,
        user: {
          id: session.userId,
          username: session.username,
          discriminator: session.discriminator,
          avatar: session.avatar
        }
      });
    } catch (error) {
      res.clearCookie('discord_session');
      res.json({ authenticated: false });
    }
  });
  
  // Logout
  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('discord_session');
    res.json({ success: true });
  });
  
  // Get available channels for a guild
  app.get('/api/channels/:guildId', channelFetchLimiter, async (req, res) => {
    try {
      const { guildId } = req.params;
      
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        return res.status(404).json({ error: 'Guild not found' });
      }
      
      // Get guild config to check allowed channels
      const guildConfig = await loadGuildConfig(guildId);
      const eventRequestConfig = guildConfig.eventRequests || {};
      const allowedTextChannels = eventRequestConfig.allowedTextChannels || [];
      const allowedVoiceChannels = eventRequestConfig.allowedVoiceChannels || [];
      
      // Get text, voice, and stage channels
      const allChannels = guild.channels.cache
        .filter(channel => 
          channel.type === 0 ||  // Text channel
          channel.type === 2 ||  // Voice channel
          channel.type === 13    // Stage channel
        )
        .map(channel => ({
          id: channel.id,
          name: channel.name,
          type: channel.type === 0 ? 'text' : 
                channel.type === 13 ? 'stage' : 'voice'
        }));
      
      // Filter channels based on allowed lists (empty array = all channels allowed)
      const channels = allChannels
        .filter(channel => {
          if (channel.type === 'text') {
            return allowedTextChannels.length === 0 || allowedTextChannels.includes(channel.id);
          } else {
            return allowedVoiceChannels.length === 0 || allowedVoiceChannels.includes(channel.id);
          }
        })
        .sort((a, b) => {
          // Sort by type (text first, then voice, then stage), then by name
          if (a.type !== b.type) {
            const order = { text: 0, voice: 1, stage: 2 };
            return order[a.type] - order[b.type];
          }
          return a.name.localeCompare(b.name);
        });
      
      res.json({ channels });
    } catch (error) {
      console.error('[API] Error fetching channels:', error);
      res.status(500).json({ error: 'Failed to fetch channels' });
    }
  });
  
  // Submit event request
  app.post('/api/event-request', eventRequestLimiter, async (req, res) => {
    try {
      const {
        guildId,
        title,
        description,
        channelId,
        voiceChannelId,
        startTime,
        endTime,
        frequency,
        submitterUsername,
        submitterDiscordId
      } = req.body;
      
      // Get guild config for event requests
      const guildConfig = await loadGuildConfig(guildId);
      const eventRequestConfig = guildConfig.eventRequests || {};
      
      // Validate required fields (channelId is optional if users can't select channels)
      if (!guildId || !title || !startTime || !submitterUsername || !submitterDiscordId) {
        return res.status(400).json({ 
          error: 'Missing required fields: guildId, title, startTime, submitterUsername, submitterDiscordId' 
        });
      }
      
      // Revalidate guild membership at submission time
      const { isMember } = await checkGuildMembership(guildId, submitterDiscordId);
      
      if (!isMember) {
        const serverName = eventRequestConfig.serverName || 'this server';
        const inviteUrl = eventRequestConfig.inviteUrl;
        
        return res.status(403).json({ 
          error: 'not_member',
          message: `You must be a member of ${serverName} to submit event requests.`,
          serverName,
          inviteUrl: inviteUrl || null
        });
      }
      
      // If user channel selection is enabled, channelId is required
      if (eventRequestConfig.allowUserChannelSelection === true && !channelId) {
        return res.status(400).json({ 
          error: 'Missing required field: channelId (user must select location channel)' 
        });
      }
      
      // Get guild
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        return res.status(404).json({ error: 'Guild not found' });
      }
      
      if (!eventRequestConfig.enabled) {
        return res.status(403).json({ error: 'Event requests are not enabled for this server' });
      }
      
      const moderationChannelId = eventRequestConfig.moderationChannel;
      if (!moderationChannelId) {
        return res.status(500).json({ error: 'Moderation channel not configured' });
      }
      
      // Get moderation channel
      const modChannel = guild.channels.cache.get(moderationChannelId);
      if (!modChannel || !modChannel.isTextBased()) {
        return res.status(500).json({ error: 'Moderation channel not found or invalid' });
      }
      
      // Get channel names for display (if provided by user)
      let textChannel = null;
      let textChannelName = null;
      let voiceChannel = null;
      let voiceChannelName = null;
      
      if (channelId) {
        textChannel = guild.channels.cache.get(channelId);
        textChannelName = textChannel?.name || 'Unknown Channel';
      }
      
      if (voiceChannelId) {
        voiceChannel = guild.channels.cache.get(voiceChannelId);
        voiceChannelName = voiceChannel?.name || null;
      }
      
      // Create embed for mod channel
      const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
      
      const embed = new EmbedBuilder()
        .setColor(0xFF6B6B)
        .setTitle('🎬 New Event Request')
        .setDescription(`**${title}**`)
        .addFields(
          {
            name: '📝 Description',
            value: description || 'No description provided',
            inline: false
          }
        );
      
      // Add channel information based on what was provided
      if (channelId) {
        // User selected channels
        embed.addFields({
          name: '📍 Location (Text Channel)',
          value: `<#${channelId}> (${textChannelName})`,
          inline: true
        });
        
        if (voiceChannelId && voiceChannel) {
          embed.addFields({
            name: '🔊 Voice Channel',
            value: `<#${voiceChannelId}> (${voiceChannelName})`,
            inline: true
          });
        }
      } else {
        // Moderator will assign channels
        embed.addFields({
          name: '🎯 Channels',
          value: '⚠️ **Moderator will assign during approval**',
          inline: false
        });
      }
      
      embed.addFields({
        name: '📅 Start Time',
        value: `<t:${Math.floor(new Date(startTime).getTime() / 1000)}:F>`,
        inline: true
      });
      
      if (endTime) {
        embed.addFields({
          name: '⏱️ End Time',
          value: `<t:${Math.floor(new Date(endTime).getTime() / 1000)}:F>`,
          inline: true
        });
      }
      
      if (frequency) {
        embed.addFields({
          name: '🔁 Frequency',
          value: frequency,
          inline: true
        });
      }
      
      embed.addFields(
        {
          name: '👤 Submitted By',
          value: submitterDiscordId ? `<@${submitterDiscordId}> (${submitterUsername})` : submitterUsername,
          inline: false
        }
      );
      
      embed.setFooter({ text: `Guild: ${guild.name}` });
      embed.setTimestamp();
      
      // Create approval buttons
      const requestId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      let buttons;
      if (voiceChannelId) {
        // If voice channel requested, offer granular approval options
        buttons = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`approve_event_both_${requestId}`)
              .setLabel('Approve Both')
              .setStyle(ButtonStyle.Success)
              .setEmoji('✅'),
            new ButtonBuilder()
              .setCustomId(`approve_event_text_${requestId}`)
              .setLabel('Text Only')
              .setStyle(ButtonStyle.Primary)
              .setEmoji('💬'),
            new ButtonBuilder()
              .setCustomId(`deny_event_${requestId}`)
              .setLabel('Deny')
              .setStyle(ButtonStyle.Danger)
              .setEmoji('❌')
          );
      } else {
        // Text-only request, simple approve/deny
        buttons = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`approve_event_${requestId}`)
              .setLabel('Approve & Create Event')
              .setStyle(ButtonStyle.Success)
              .setEmoji('✅'),
            new ButtonBuilder()
              .setCustomId(`deny_event_${requestId}`)
              .setLabel('Deny')
              .setStyle(ButtonStyle.Danger)
              .setEmoji('❌')
          );
      }
      
      // Send to moderation channel
      const message = await modChannel.send({ 
        embeds: [embed], 
        components: [buttons]
      });
      
      // Store request data (we'll need it when the button is clicked)
      if (!global.eventRequests) {
        global.eventRequests = new Map();
      }
      
      global.eventRequests.set(requestId, {
        guildId,
        title,
        description,
        channelId,
        voiceChannelId: voiceChannelId || null,
        startTime: new Date(startTime).toISOString(),
        endTime: endTime ? new Date(endTime).toISOString() : null,
        frequency,
        submitterUsername,
        submitterDiscordId,
        messageId: message.id,
        channelMessageId: moderationChannelId
      });
      
      // Save to disk
      await saveEventRequests();
      
      // Clean up old requests after 7 days
      setTimeout(async () => {
        global.eventRequests.delete(requestId);
        await saveEventRequests();
      }, 7 * 24 * 60 * 60 * 1000);
      
      res.json({ 
        success: true, 
        message: 'Event request submitted successfully. Moderators will review it shortly.',
        requestId
      });
      
    } catch (error) {
      console.error('[API] Error submitting event request:', error);
      res.status(500).json({ error: 'Failed to submit event request' });
    }
  });
  
  // Test-only: lets the e2e harness reset the event-request rate limiter for
  // the calling IP without waiting out the real 5-minute window. Inert in
  // production. See tests/e2e/README.md.
  //
  // The limiter's default keyGenerator stores IPv6 requests under a
  // subnet-masked key (via express-rate-limit's own ipKeyGenerator helper),
  // not the raw IP — resetKey(req.ip) would silently no-op for IPv6 callers
  // (e.g. localhost/::1) without this same transform applied first.
  if (process.env.NODE_ENV !== 'production') {
    app.post('/api/__test__/reset-rate-limit', async (req, res) => {
      await eventRequestLimiter.resetKey(ipKeyGenerator(req.ip));
      res.sendStatus(204);
    });
  }

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });
  
  return app;
}

/**
 * Start the API server
 * @param {Client} client - Discord.js client instance
 * @param {number} port - Port to listen on
 */
export async function startApiServer(client, port = 3000) {
  // Load pending event requests from disk
  await loadEventRequests();
  
  const app = createApiServer(client);
  
  const server = app.listen(port, () => {
    console.log(`✓ API server listening on port ${port}`);
  });
  
  return server;
}

// Export persistence functions for manual use if needed
export { loadEventRequests, saveEventRequests };

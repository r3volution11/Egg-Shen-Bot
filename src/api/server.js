import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { loadGuildConfig } from '../utils/guildConfig.js';

/**
 * Create and configure Express API server for event requests
 * @param {Client} client - Discord.js client instance
 * @returns {express.Application} Express app instance
 */
export function createApiServer(client) {
  const app = express();
  
  // Middleware
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'https://shudderdrivein.com'],
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
      
      // Create a session token
      const sessionToken = Buffer.from(JSON.stringify({
        userId: userData.id,
        username: userData.username,
        discriminator: userData.discriminator,
        avatar: userData.avatar,
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
      
      // Validate required fields
      if (!guildId || !title || !channelId || !startTime || !submitterUsername) {
        return res.status(400).json({ 
          error: 'Missing required fields: guildId, title, channelId, startTime, submitterUsername' 
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
          },
          {
            name: '📍 Location (Text Channel)',
            value: `<#${channelId}> (${textChannelName})`,
            inline: true
          }
        );
      
      // Add voice channel if specified
      if (voiceChannelId && voiceChannel) {
        embed.addFields({
          name: '🔊 Voice Channel',
          value: `<#${voiceChannelId}> (${voiceChannelName})`,
          inline: true
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
      
      // Clean up old requests after 7 days
      setTimeout(() => {
        global.eventRequests.delete(requestId);
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
export function startApiServer(client, port = 3000) {
  const app = createApiServer(client);
  
  const server = app.listen(port, () => {
    console.log(`✓ API server listening on port ${port}`);
  });
  
  return server;
}

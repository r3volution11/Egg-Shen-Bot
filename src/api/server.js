import express from 'express';
import cors from 'cors';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import { loadGuildConfig } from '../utils/guildConfig.js';
import {
  saveUploadedImage,
  saveOriginalImage,
  getOriginalImagePath,
  renameImageKey,
  getImagePath,
  deleteImage,
  recordEventDate,
  applyImageStatusToEmbed,
} from '../utils/eventImageStore.js';
import { signCropToken, verifyCropToken, consumeCropToken } from '../utils/cropLinkToken.js';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to persist event requests
const EVENT_REQUESTS_FILE = path.join(__dirname, '../../pending_event_requests.json');
// Path to persist in-progress channel selections (approve flow, step before event creation)
const EVENT_CHANNEL_SELECTIONS_FILE = path.join(__dirname, '../../pending_event_channel_selections.json');

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
 * Save in-progress event-approval channel selections to disk.
 * Without this, a bot restart between selecting a channel and clicking
 * "Create Event" silently wipes the selection while the underlying event
 * request (which IS persisted) survives — producing a misleading
 * "please select a text channel" error even though one was clearly chosen.
 */
async function saveEventChannelSelections() {
  try {
    if (!global.eventChannelSelections) {
      global.eventChannelSelections = new Map();
    }
    const selectionsData = Object.fromEntries(global.eventChannelSelections);
    await fs.writeFile(EVENT_CHANNEL_SELECTIONS_FILE, JSON.stringify(selectionsData, null, 2), 'utf8');
  } catch (error) {
    console.error('[EventRequests] Error saving channel selections:', error);
  }
}

/**
 * Load in-progress event-approval channel selections from disk on bot startup.
 */
async function loadEventChannelSelections() {
  if (!global.eventChannelSelections) {
    global.eventChannelSelections = new Map();
  }

  try {
    const data = await fs.readFile(EVENT_CHANNEL_SELECTIONS_FILE, 'utf8');
    const selectionsData = JSON.parse(data);

    for (const [key, selection] of Object.entries(selectionsData)) {
      global.eventChannelSelections.set(key, selection);
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      return;
    }
    console.error('[EventRequests] Error loading channel selections:', error);
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

  // Rate limiting for image uploads (5 per 5 minutes per IP — generous
  // enough for retries after a rejected file, tight enough to bound abuse)
  const imageUploadLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 5,
    message: { error: 'Too many image uploads. Please wait a few minutes before trying again.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const ALLOWED_IMAGE_MIMETYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
  const upload = multer({
    storage: multer.memoryStorage(), // buffer only — saveUploadedImage() writes it to disk itself
    // 8MB cap per file; up to 2 files total (the cropped "image" plus an
    // optional raw "original" preserved for later re-cropping) — each
    // field is still capped at 1 via upload.fields()'s own maxCount.
    limits: { fileSize: 8 * 1024 * 1024, files: 2 },
    fileFilter: (req, file, cb) => {
      if (!ALLOWED_IMAGE_MIMETYPES.includes(file.mimetype)) {
        return cb(new Error('Unsupported image type. Use PNG, JPEG, GIF, or WebP.'));
      }
      cb(null, true);
    },
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

    // Derived from the actual incoming request rather than a single static
    // env var, so this works correctly when the same bot process serves
    // the form from more than one domain (e.g. a prod + dev deployment) —
    // each domain's login flow lands back on itself, not on whichever
    // domain happened to be in OAUTH_REDIRECT_URI. Falls back to the env
    // var only when neither is derivable (shouldn't happen behind nginx,
    // which sets Host/X-Forwarded-Proto on every proxied request).
    const origin = req.get('host') ? `${req.protocol}://${req.get('host')}` : null;
    const redirectUriRaw = origin
      ? `${origin}/api/auth/discord/callback`
      : (process.env.OAUTH_REDIRECT_URI || 'http://localhost:3000/api/auth/discord/callback');
    const redirectUri = encodeURIComponent(redirectUriRaw);
    const scope = 'identify';

    // Store guildId and the originating domain in state so the callback
    // (which may be hit by Discord regardless of which domain started the
    // flow) knows where to redirect the user back to.
    const state = Buffer.from(JSON.stringify({ guildId, origin })).toString('base64');

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
      // Decode state to get guildId and the domain the login flow started
      // on — needed so this callback (which Discord always hits at
      // whatever redirect_uri was used to start the flow) sends the user
      // back to the SAME domain, not a different one this bot process also
      // happens to serve.
      const { guildId, origin } = JSON.parse(Buffer.from(state, 'base64').toString());
      const formUrl = origin || process.env.FORM_URL || 'http://localhost:8080';
      const redirectUri = origin
        ? `${origin}/api/auth/discord/callback`
        : (process.env.OAUTH_REDIRECT_URI || 'http://localhost:3000/api/auth/discord/callback');

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
          redirect_uri: redirectUri
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
  
  // Upload an event image ahead of submitting the actual request — the form
  // doesn't have a real requestId yet at this point, so the upload is
  // stored under a fresh random token, returned to the client, and later
  // renamed to the real requestId once POST /api/event-request succeeds
  // (see renameImageKey below). An image uploaded but never followed by a
  // successful submission is cleaned up by eventImageStore's orphan sweep.
  //
  // Accepts two files: "image" (the cropped result actually used for the
  // Discord event) and an optional "original" (the raw, uncropped file the
  // submitter picked) — kept separately so a moderator opening the crop
  // page later can crop from the true original, not a re-crop of an
  // already-cropped image.
  const uploadWithOriginal = upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'original', maxCount: 1 },
  ]);
  app.post('/api/event-request/upload-image', imageUploadLimiter, (req, res) => {
    // multer's own errors (file too large, wrong type, etc) arrive via a
    // callback rather than a thrown exception a normal try/catch would see,
    // so they're handled explicitly here rather than via Express's generic
    // error middleware, to keep the response shape consistent with the
    // rest of this API (a JSON { error } body, not an HTML error page).
    uploadWithOriginal(req, res, async (err) => {
      if (err) {
        const message = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
          ? 'Image is too large (8MB max).'
          : err.message || 'Failed to upload image.';
        return res.status(400).json({ error: message });
      }

      try {
        const croppedFile = req.files?.image?.[0];
        const originalFile = req.files?.original?.[0];

        if (!croppedFile) {
          return res.status(400).json({ error: 'No image file provided' });
        }

        const imageToken = crypto.randomBytes(16).toString('hex');
        await saveUploadedImage(imageToken, croppedFile.buffer, croppedFile.mimetype);

        if (originalFile) {
          await saveOriginalImage(imageToken, originalFile.buffer, originalFile.mimetype);
        }

        res.json({ imageToken });
      } catch (error) {
        console.error('[API] Error uploading event image:', error);
        res.status(500).json({ error: 'Failed to upload image' });
      }
    });
  });

  // Serve the moderator crop page's own JS/CSS from a scoped subfolder —
  // deliberately NOT a blanket express.static('public') mount, since that
  // would newly expose index.html/app.js/style.css from the bot's own
  // origin as a side effect (today those are only reachable via each
  // operator's separately-hosted deployment). Scoping to public/crop/ avoids
  // that question entirely.
  app.use('/crop-assets', express.static(path.join(__dirname, '../../public/crop')));

  const EXTENSION_MIMETYPES = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  };

  // Moderator crop page — reached via the "Crop Image" link button on the
  // moderation-channel message, gated by a signed single-use token instead
  // of a login (a moderator is clicking a link from a Discord message, not
  // authenticating). GET requests use verifyCropToken (not consumeCropToken)
  // so reloading the page doesn't burn the token — only a successful save does.
  app.get('/crop/:requestId', (req, res) => {
    const { requestId } = req.params;
    const { token } = req.query;

    const result = verifyCropToken(token, requestId);
    if (!result.valid) {
      return res.status(403).type('text/plain').send('This crop link is invalid or has expired. Ask a moderator to open Edit on the request again for a fresh link.');
    }

    if (!global.eventRequests || !global.eventRequests.has(requestId)) {
      return res.status(404).type('text/plain').send('This event request no longer exists (it may have already been approved or denied).');
    }

    res.sendFile(path.join(__dirname, '../../public/crop/crop.html'));
  });

  // Streams the request's currently-attached uploaded image (if any) so the
  // crop page can pre-load it into the cropper. Token-gated the same way as
  // the page itself; does not consume the token.
  app.get('/crop/:requestId/current-image', async (req, res) => {
    const { requestId } = req.params;
    const { token } = req.query;

    const result = verifyCropToken(token, requestId);
    if (!result.valid) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    try {
      // Prefer the preserved uncropped original, if one exists, so a
      // moderator crops from the true source image rather than re-cropping
      // an already-cropped result. Falls back to the cropped copy for
      // requests with no separate original on file (e.g. a mod-added image
      // uploaded directly through this same crop page).
      const filePath = (await getOriginalImagePath(requestId)) || (await getImagePath(requestId));
      if (!filePath) {
        return res.status(404).json({ error: 'No image uploaded for this request yet' });
      }

      const ext = path.extname(filePath).toLowerCase();
      res.type(EXTENSION_MIMETYPES[ext] || 'application/octet-stream');
      res.sendFile(filePath);
    } catch (error) {
      console.error('[EventRequests] Error serving current crop image:', error);
      res.status(500).json({ error: 'Failed to load current image' });
    }
  });

  // Saves a moderator's cropped image, replacing whatever image (if any)
  // the request had before. Not behind imageUploadLimiter — a valid
  // single-use token is a much stronger, more specific control than a
  // per-IP rate limit meant for anonymous public submitters.
  const uploadCropSave = upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'original', maxCount: 1 },
  ]);
  app.post('/crop/:requestId/save', (req, res) => {
    const { requestId } = req.params;

    uploadCropSave(req, res, async (err) => {
      if (err) {
        const message = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
          ? 'Image is too large (8MB max).'
          : err.message || 'Failed to upload image.';
        return res.status(400).json({ error: message });
      }

      try {
        const token = req.body.token;
        const result = consumeCropToken(token, requestId);
        if (!result.valid) {
          return res.status(403).json({ error: 'This crop link is invalid, expired, or has already been used.' });
        }

        if (!global.eventRequests || !global.eventRequests.has(requestId)) {
          return res.status(404).json({ error: 'This event request no longer exists.' });
        }

        const croppedFile = req.files?.image?.[0];
        const newOriginalFile = req.files?.original?.[0];

        if (!croppedFile) {
          return res.status(400).json({ error: 'No image file provided' });
        }

        const requestData = global.eventRequests.get(requestId);

        // Delete before overwrite: saveUploadedImage only overwrites the
        // manifest entry, not a prior file under a different extension
        // (e.g. replacing a .jpg with a .png would otherwise leave the old
        // .jpg orphaned on disk, invisible to the prune functions since
        // they iterate the manifest, not the directory).
        await deleteImage(requestId);
        await saveUploadedImage(requestId, croppedFile.buffer, croppedFile.mimetype);

        // If the moderator picked a brand new source image (rather than
        // re-cropping the pre-loaded one), that file becomes the new
        // preserved original — so a future re-crop starts from it too.
        if (newOriginalFile) {
          await saveOriginalImage(requestId, newOriginalFile.buffer, newOriginalFile.mimetype);
        }

        // saveUploadedImage always resets eventDate to null — re-record it
        // immediately so the freshly-cropped image doesn't regress to
        // "no event date" and become permanently un-prunable.
        const eventDateMs = new Date(requestData.endTime || requestData.startTime).getTime();
        await recordEventDate(requestId, eventDateMs);

        requestData.hasUploadedImage = true;
        requestData.imageUrl = null; // cropping only makes sense against a concrete file
        await saveEventRequests();

        // Refresh the moderation-channel embed's image-status field so it
        // reflects the crop without a moderator needing to reload/guess.
        try {
          if (requestData.channelMessageId && requestData.messageId) {
            const modChannel = await client.channels.fetch(requestData.channelMessageId).catch(() => null);
            const modMessage = await modChannel?.messages.fetch(requestData.messageId).catch(() => null);
            if (modMessage && modMessage.embeds[0]) {
              const { EmbedBuilder } = await import('discord.js');
              const refreshedEmbed = applyImageStatusToEmbed(new EmbedBuilder(modMessage.embeds[0]), requestData);
              await modMessage.edit({ embeds: [refreshedEmbed] });
            }
          }
        } catch (embedError) {
          console.error('[EventRequests] Failed to refresh embed after crop save:', embedError.message);
        }

        res.json({ success: true });
      } catch (error) {
        console.error('[EventRequests] Error saving cropped image:', error);
        res.status(500).json({ error: 'Failed to save cropped image' });
      }
    });
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
        submitterDiscordId,
        imageToken,
        imageUrl
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

      // imageToken (uploaded file) and imageUrl (pasted link) are mutually
      // exclusive image sources from the form — an uploaded file takes
      // priority if somehow both were sent.
      const effectiveImageUrl = imageToken ? null : (imageUrl || null);
      
      // Revalidate guild membership at submission time
      const { isMember } = await checkGuildMembership(guildId, submitterDiscordId);
      
      if (!isMember) {
        const serverName = eventRequestConfig.serverName || 'this server';
        const inviteUrl = eventRequestConfig.inviteUrl;
        
        return res.status(403).json({
          error: 'not_member',
          message: `This page is only for members of ${serverName}. Your Discord account isn't a member of that server, so you can't submit requests here.`,
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

      const requestId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;

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

      applyImageStatusToEmbed(embed, { hasUploadedImage: !!imageToken, imageUrl: effectiveImageUrl });

      embed.setFooter({ text: `Guild: ${guild.name}` });
      embed.setTimestamp();

      // Create approval buttons
      let cropImageButton = null;
      if (process.env.PUBLIC_BOT_URL) {
        try {
          const cropUrl = `${process.env.PUBLIC_BOT_URL}/crop/${requestId}?token=${signCropToken(requestId)}`;
          cropImageButton = new ButtonBuilder()
            .setLabel('Crop Image')
            .setStyle(ButtonStyle.Link)
            .setEmoji('🖼️')
            .setURL(cropUrl);
        } catch (error) {
          console.error('[EventRequests] Failed to build crop-image link (is EVENT_CROP_LINK_SECRET set?):', error.message);
        }
      }

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
              .setCustomId(`edit_event_${requestId}`)
              .setLabel('Edit')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('✏️'),
            new ButtonBuilder()
              .setCustomId(`deny_event_${requestId}`)
              .setLabel('Deny')
              .setStyle(ButtonStyle.Danger)
              .setEmoji('❌'),
            ...(cropImageButton ? [cropImageButton] : [])
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
              .setCustomId(`edit_event_${requestId}`)
              .setLabel('Edit')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('✏️'),
            new ButtonBuilder()
              .setCustomId(`deny_event_${requestId}`)
              .setLabel('Deny')
              .setStyle(ButtonStyle.Danger)
              .setEmoji('❌'),
            ...(cropImageButton ? [cropImageButton] : [])
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
        channelMessageId: moderationChannelId,
        hasUploadedImage: !!imageToken,
        imageUrl: effectiveImageUrl
      });

      // The image (if any) was uploaded under a placeholder token before
      // this request existed — rename it to the real requestId now so
      // later lookups (approval, retention) can find it by requestId alone.
      if (imageToken) {
        await renameImageKey(imageToken, requestId).catch(err => {
          console.error('[EventRequests] Failed to rename uploaded image:', err);
        });
      }

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
  await loadEventChannelSelections();
  
  const app = createApiServer(client);
  
  const server = app.listen(port, () => {
    console.log(`✓ API server listening on port ${port}`);
  });
  
  return server;
}

// Export persistence functions for manual use if needed
export { loadEventRequests, saveEventRequests, saveEventChannelSelections, loadEventChannelSelections };

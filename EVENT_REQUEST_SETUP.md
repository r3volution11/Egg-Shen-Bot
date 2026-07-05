# Event Request System Setup Guide

The Event Request System allows Discord server members to submit watch party events through a web form. Moderators can approve or deny requests, and approved events are automatically created as Discord Scheduled Events.

## Architecture

- **Bot API Server**: Runs on the bot (port 3000 by default) - handles OAuth, event submissions, and approval
- **Web Form**: Separate web server (e.g., shudderdrivein.com or localhost:8080) - serves the HTML form
- **Discord Bot**: Handles button interactions for approve/deny

## Prerequisites

1. **Discord Application Setup**:
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Select your bot application
   - Navigate to **OAuth2** section
   - Add redirect URI: `http://localhost:3000/api/auth/discord/callback` (for testing)
   - For production, add: `https://yourdomain.com/api/auth/discord/callback`
   - Copy your **Client Secret** (keep it secure!)

2. **Environment Variables**:
   Add to your `.env` file:
   ```env
   DISCORD_CLIENT_SECRET=your_client_secret_here
   API_PORT=3000
   OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/discord/callback
   FORM_URL=http://localhost:8080
   ALLOWED_ORIGINS=http://localhost:8080,https://shudderdrivein.com
   ```

## Configuration

### Step 1: Configure Your Server

Use `/eggshen-config event-requests` subcommands:

```
/eggshen-config event-requests toggle enabled:true
/eggshen-config event-requests moderation-channel channel:#event-requests
/eggshen-config event-requests server-name name:"Your Server Name"
/eggshen-config event-requests website-url url:http://localhost:8080
/eggshen-config event-requests invite-url url:https://discord.gg/yourserver
```

### Step 2: Get the Event Request Link

```
/eggshen-config event-requests get-link
```

This will give you a link like: `http://localhost:8080?guild=YOUR_GUILD_ID`

## Local Testing

### 1. Start the Bot
The API server starts automatically when the bot starts:
```bash
npm start
```

You should see: `✓ API server listening on port 3000`

### 2. Serve the Web Form
From the project root, serve the `/public` folder:

```bash
# Using Python
cd public && python3 -m http.server 8080

# OR using Node.js http-server
npx http-server public -p 8080
```

### 3. Open the Form
Navigate to: `http://localhost:8080?guild=YOUR_GUILD_ID`

Replace `YOUR_GUILD_ID` with your test server's ID (from `/eggshen-config event-requests get-link`)

### 4. Test the Flow
1. Click "Login with Discord"
2. Authorize the bot
3. Fill out the event request form
4. Submit the request
5. Check your moderation channel in Discord
6. Click "Approve" or "Deny"

## Production Deployment

### For shudderdrivein.com or similar:

1. **Update Environment Variables**:
   ```env
   API_PORT=3000
   OAUTH_REDIRECT_URI=https://yourdomain.com/api/auth/discord/callback
   FORM_URL=https://shudderdrivein.com
   ALLOWED_ORIGINS=https://shudderdrivein.com
   ```

2. **Update Discord Developer Portal**:
   - Add production redirect URI: `https://yourdomain.com/api/auth/discord/callback`

3. **Deploy Web Form**:
   - Upload `/public` folder contents to your web server (shudderdrivein.com)
   - Ensure HTTPS is enabled

4. **Configure Servers**:
   ```
   /eggshen-config event-requests website-url url:https://shudderdrivein.com
   ```

5. **Share the Link**:
   Each Discord server gets a unique link: `https://shudderdrivein.com?guild=GUILD_ID`

## Multiple Servers

The system supports multiple Discord servers! Each server has its own configuration in `event_request_config.json`:

```json
{
  "GUILD_ID_1": {
    "eventRequests": {
      "enabled": true,
      "moderationChannel": "CHANNEL_ID",
      "serverName": "Server 1",
      "inviteUrl": "https://discord.gg/server1",
      "websiteUrl": "https://shudderdrivein.com"
    }
  },
  "GUILD_ID_2": {
    "eventRequests": {
      "enabled": true,
      "moderationChannel": "CHANNEL_ID",
      "serverName": "Server 2",
      "inviteUrl": null,
      "websiteUrl": "http://localhost:8080"
    }
  }
}
```

Each server uses the same web form but with different `?guild=ID` parameters.

## Troubleshooting

### "Site can't be reached" Error
- Check if the bot is running (API server starts with bot)
- Verify `API_PORT` in `.env` matches your redirect URI
- Check firewall rules if deployed to production

### "Guild not found" Error
- Verify the guild ID in the URL is correct
- Ensure the bot is in that server

### OAuth Redirect Mismatch
- Ensure `OAUTH_REDIRECT_URI` in `.env` exactly matches Discord Developer Portal
- Check for HTTP vs HTTPS mismatches
- Verify port numbers match

### Event Requests Not Appearing in Moderation Channel
- Check that moderation channel is set: `/eggshen-config event-requests view`
- Verify the bot has permissions to send messages in that channel

### CORS Errors
- Add your website URL to `ALLOWED_ORIGINS` in `.env`
- Restart the bot after changing environment variables

## Security Notes

- **Never commit `.env` file** - it contains your `DISCORD_CLIENT_SECRET`
- Keep `DISCORD_CLIENT_SECRET` secure - it's like a password
- Use HTTPS in production
- Rate limiting is built-in (1 request per 5 minutes per IP)
- Session cookies expire after 24 hours

## API Endpoints

The bot exposes these API endpoints:

- `GET /api/health` - Health check
- `GET /api/guild-config/:guildId` - Get guild configuration
- `GET /api/auth/discord` - Start OAuth flow
- `GET /api/auth/discord/callback` - OAuth callback
- `GET /api/auth/session` - Check current session
- `POST /api/auth/logout` - Logout
- `GET /api/channels/:guildId` - Get voice/stage channels
- `POST /api/event-request` - Submit event request (rate limited)

## Support

If you need help:
1. Check bot logs for errors
2. Verify all environment variables are set
3. Test locally before deploying to production
4. Check Discord Developer Portal OAuth settings

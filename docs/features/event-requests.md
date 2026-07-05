# Event Requests

Allow your community to submit watch party event requests through a web form! Server moderators can approve or deny submissions, and approved events are automatically created as Discord Scheduled Events.

## Overview

The Event Request System provides:

- 🔐 **Discord OAuth Login** - Secure authentication with Discord
- 📝 **Web-based Form** - User-friendly event submission interface
- ✅ **Moderation Queue** - Review and approve/deny requests
- 🎉 **Auto-create Events** - Approved events become Discord Scheduled Events
- ⏱️ **Rate Limiting** - Prevents spam (1 request per 5 minutes per user)
- 🌐 **Dedicated Deployment** - Each website serves one specific Discord server

## How It Works

1. **User visits your event request form** at your configured website
2. **User logs in with Discord** (OAuth authentication)
3. **User submits event details** (title, description, channel, time)
4. **Request appears in your moderation channel** with Approve/Deny buttons
5. **Moderator clicks a button** to approve or deny
6. **If approved, Discord Scheduled Event is created automatically**

## Deployment Model

::: tip One Website = One Discord Server
Each event request form deployment is dedicated to **one specific Discord server**. If you host the bot for multiple servers, each server should deploy its own instance of the web form on their own domain.

**Example:**
- shudderdrivein.com → Shudder Discord Server
- yourdomain.com → Your Discord Server
:::

## Setup Requirements

::: warning Prerequisites
This feature requires:
- A web server to host the event request form (e.g., yourdomain.com)
- Discord Client Secret from the Developer Portal
- Web server configuration (e.g., nginx)
- Additional environment variables
:::

### Step 1: Discord Developer Portal Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your bot application
3. Navigate to **OAuth2** section
4. Add redirect URI:
   - For local testing: `http://localhost:3000/api/auth/discord/callback`
   - For production: `https://yourdomain.com/api/auth/discord/callback`
5. Click **Save Changes**
6. Copy your **Client Secret** (keep it secure!)

### Step 2: Environment Variables

Add these to your `.env` file:

```env
# Required for event requests
DISCORD_CLIENT_SECRET=your_client_secret_here

# API Configuration
API_PORT=3000
OAUTH_REDIRECT_URI=https://yourdomain.com/api/auth/discord/callback
FORM_URL=https://yourdomain.com
ALLOWED_ORIGINS=https://yourdomain.com
```

::: tip Local Testing
For local testing, use:
```env
OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/discord/callback
FORM_URL=http://localhost:8080
ALLOWED_ORIGINS=http://localhost:8080
```
:::

### Step 3: Deploy Web Form

The bot includes a web form in the `/public` folder. Deploy these files to your web server:

- `public/index.html` - Event request form
- `public/app.js` - Form logic
- `public/style.css` - Styling

**Required Configuration:**

1. Open `public/app.js`
2. Find the `GUILD_ID` constant (around line 11)
3. Replace the placeholder with your Discord server's Guild ID:

```javascript
const GUILD_ID = 'YOUR_GUILD_ID_HERE'; // Change this!
```

::: tip Finding Your Guild ID
Run `/eggshen-config event-requests get-link` in your Discord server to see your Guild ID.
:::

**Example deployment:**
- Update `GUILD_ID` in `public/app.js`
- Upload `/public` contents to `https://yourdomain.com`
- Ensure the domain matches your environment variables

### Step 4: Configure Your Server

Use `/eggshen-config event-requests` commands in your Discord server:

```
/eggshen-config event-requests toggle enabled:true
/eggshen-config event-requests moderation-channel channel:#event-requests
/eggshen-config event-requests server-name name:"Your Server Name"
/eggshen-config event-requests website-url url:https://yourdomain.com
/eggshen-config event-requests invite-url url:https://discord.gg/yourserver
```

### Step 5: Get Your Link

```
/eggshen-config event-requests get-link
```

This gives you a unique link like: `https://yourdomain.com?guild=YOUR_GUILD_ID`

Share this link with your community!

## Configuration Commands

All configuration is done via `/eggshen-config event-requests` subcommands:

### View Current Settings

```
/eggshen-config event-requests view
```

Shows your current configuration including the event request link.

### Enable/Disable

```
/eggshen-config event-requests toggle enabled:true
/eggshen-config event-requests toggle enabled:false
```

Turn event requests on or off for your server.

### Set Moderation Channel

```
/eggshen-config event-requests moderation-channel channel:#event-requests
```

Choose where event requests will be sent for approval. Must be a text channel.

### Set Server Display Name

```
/eggshen-config event-requests server-name name:"My Awesome Server"
```

This name appears on the event request form.

### Set Website URL

```
/eggshen-config event-requests website-url url:https://yourdomain.com
```

The website where your event request form is hosted.

### Set Invite Link (Optional)

```
/eggshen-config event-requests invite-url url:https://discord.gg/yourserver
```

Discord invite link shown on the form. Leave empty to hide.

### Get Configuration Summary

```
/eggshen-config event-requests get-link
```

Shows your form URL and reminds you to configure the GUILD_ID in your web form deployment.

## User Experience

### Submitting a Request

1. **Visit the link** provided by server admins
2. **Click "Login with Discord"** to authenticate
3. **Fill out the form:**
   - Event title (required)
   - Description (optional)
   - Voice/Stage channel (required)
   - Start date and time (required)
   - End date and time (optional)
   - Frequency (optional: Once, Weekly, Biweekly, Monthly)
4. **Click "Submit Request"**
5. **Wait for moderator approval**

### For Moderators

When a request is submitted:

1. **Request appears in moderation channel** with all details
2. **Two buttons appear:** ✅ Approve & Create Event | ❌ Deny
3. **Click a button:**
   - **Approve** → Creates Discord Scheduled Event automatically
   - **Deny** → Removes the request without action

::: tip Moderator Permissions
Only members with **Manage Events** permission or Administrator/Moderator roles can approve/deny requests.
:::

## Rate Limiting

Built-in protection against spam:

- **1 request per 5 minutes** per user (by IP address)
- **10 channel lookups per minute** per user
- **Sessions expire after 24 hours**

## Security Features

- ✅ Discord OAuth authentication (no passwords stored)
- ✅ Session-based login (24-hour expiration)
- ✅ HTTP-only secure cookies
- ✅ CORS protection
- ✅ Rate limiting
- ✅ Request expiration (7 days)

## Customizing for Your Server

### Making It Your Own

The event request system is designed to be easily customized:

1. **Update `GUILD_ID` in `public/app.js`** - Point to your Discord server
2. **Configure server name and invite** - Use `/eggshen-config event-requests` commands
3. **Customize styling** - Edit `public/style.css` to match your branding
4. **Deploy to your domain** - Host on any web server (Apache, nginx, Netlify, Vercel, etc.)

### Multiple Servers (Advanced)

If you host the bot for multiple communities, each should deploy their own instance:

```
Server 1: Deploy to movienight.com with GUILD_ID = 'SERVER_1_ID'
Server 2: Deploy to gamenight.com with GUILD_ID = 'SERVER_2_ID'
Server 3: Deploy to bookclub.com with GUILD_ID = 'SERVER_3_ID'
```

Each deployment is independent with its own:
- Domain/subdomain
- GUILD_ID configuration
- Custom branding and styling
- Separate Discord OAuth configuration

::: tip For Bot Hosts
If you're running the bot for multiple servers and want to offer event requests as a feature, provide each server with:
1. Instructions to deploy the web form files
2. Their specific GUILD_ID to configure
3. Discord OAuth setup guide
:::

## Local Testing

Want to test before deploying?

### 1. Start the Bot

The API server starts automatically:

```bash
npm start
```

You should see: `✓ API server listening on port 3000`

### 2. Serve the Web Form

```bash
# Using Python
cd public && python3 -m http.server 8080

# OR using Node.js http-server
npx http-server public -p 8080
```

### 3. Configure for Testing

```env
# .env
OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/discord/callback
FORM_URL=http://localhost:8080
ALLOWED_ORIGINS=http://localhost:8080
```

Don't forget to add `http://localhost:3000/api/auth/discord/callback` to Discord Developer Portal!

### 4. Test the Flow

1. Update `GUILD_ID` in `public/app.js` to your test server's ID
2. Configure your test server:

```
# In Discord
/eggshen-config event-requests toggle enabled:true
/eggshen-config event-requests moderation-channel channel:#test-events
/eggshen-config event-requests server-name name:"Test Server"
/eggshen-config event-requests website-url url:http://localhost:8080

# Check configuration
/eggshen-config event-requests view
```

3. Open http://localhost:8080 in browser and test the full flow!

## Troubleshooting

### "Site can't be reached" Error

- ✅ Check if the bot is running (API server starts with bot)
- ✅ Verify `API_PORT` in `.env` (default: 3000)
- ✅ Check firewall rules if deployed to production
- ✅ Ensure the bot process is running with `pm2 status` or similar

### "Guild not found" Error

- ✅ Verify the guild ID in the URL is correct
- ✅ Ensure the bot is a member of that server
- ✅ Check event requests are enabled: `/eggshen-config event-requests view`

### OAuth Redirect Mismatch

- ✅ `OAUTH_REDIRECT_URI` in `.env` must exactly match Discord Developer Portal
- ✅ Check for HTTP vs HTTPS mismatches
- ✅ Verify port numbers match
- ✅ Restart the bot after changing `.env`

### Requests Not Appearing

- ✅ Check moderation channel is set: `/eggshen-config event-requests view`
- ✅ Verify bot has permissions to send messages in that channel
- ✅ Check bot logs for errors

### CORS Errors

- ✅ Add your website URL to `ALLOWED_ORIGINS` in `.env`
- ✅ Restart the bot after changing environment variables
- ✅ Check browser console for specific CORS errors

### Login Not Working

- ✅ Verify `DISCORD_CLIENT_SECRET` is set correctly in `.env`
- ✅ Check redirect URI matches in Discord Developer Portal
- ✅ Clear browser cookies and try again
- ✅ Check bot logs for OAuth errors

## API Endpoints

The bot exposes these endpoints for the event request system:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/guild-config/:guildId` | GET | Get server configuration |
| `/api/auth/discord` | GET | Start OAuth flow |
| `/api/auth/discord/callback` | GET | OAuth callback handler |
| `/api/auth/session` | GET | Check current session |
| `/api/auth/logout` | POST | Logout user |
| `/api/channels/:guildId` | GET | List voice/stage channels |
| `/api/event-request` | POST | Submit event request |

## Best Practices

### For Server Admins

- 📝 **Test locally first** before going live
- 🔒 **Keep your client secret secure** - never share it
- 📢 **Share the link** in an announcement channel
- 👀 **Monitor the moderation queue** regularly
- ⚙️ **Set clear guidelines** for acceptable events

### For Web Hosting

- 🔐 **Use HTTPS in production** for security
- 🌐 **Use a memorable domain** that matches your community brand
- 📊 **Monitor traffic** and adjust rate limits if needed
- 💾 **Back up your configuration** regularly
- 🎨 **Customize the styling** to match your server's theme

## Example Use Cases

### Movie Watch Party Server
```
Server Name: "Friday Horror Nights"
Invite URL: https://discord.gg/horrorlovers
Website: https://horrornights.com
GUILD_ID: '1234567890123456789'
```

Users submit horror movie requests for Friday watch parties.

### Gaming Community
```
Server Name: "Speedrun Central"
Invite URL: https://discord.gg/speedruns
Website: https://speedrungaming.com
GUILD_ID: '9876543210987654321'
```

Coordinate speedrun events and tournaments.
Website: https://speedruncalendar.com
```

Users can request streaming/racing events in the server.

### Anime Club
```
Server Name: "Anime Watch Party"
Invite URL: https://discord.gg/animewp
Website: https://animewatchparty.com
```

Members submit anime screening requests for weekly viewings.

## Support

Need help setting this up? Check:

- [Technical Setup Guide](https://github.com/r3volution11/Egg-Shen-Bot/blob/main/EVENT_REQUEST_SETUP.md)
- [Bot Installation](./installation.md)
- [Configuration Guide](./configuration.md)
- [GitHub Issues](https://github.com/r3volution11/Egg-Shen-Bot/issues)

::: info Note
The Event Request System is an optional feature. Your bot works perfectly without it! This is for communities that want to formalize their event submission process.
:::

# Event Request System Setup Guide

The Event Request System allows Discord server members to submit watch party events through a web form. Moderators can approve or deny requests, and approved events are automatically created as Discord Scheduled Events.

## Architecture

- **Bot API Server**: Runs on the bot (port 3000 by default) - handles OAuth, event submissions, and approval
- **Web Form**: Separate web server (e.g., yourdomain.com or localhost:8080) - serves the HTML form
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
   ALLOWED_ORIGINS=http://localhost:8080,https://yourdomain.com
   EVENT_CROP_LINK_SECRET=your_generated_secret_here
   PUBLIC_BOT_URL=http://localhost:3000
   ```
   `EVENT_CROP_LINK_SECRET` and `PUBLIC_BOT_URL` power the moderator image-cropping feature — see [Moderator Image Cropping](#moderator-image-cropping) below.

## Configuration

### Step 1: Configure Your Server

Use `/eggshen-config-events event-requests` subcommands:

```
/eggshen-config-events event-requests toggle enabled:true
/eggshen-config-events event-requests moderation-channel channel:#event-requests
/eggshen-config-events event-requests server-name name:"Your Server Name"
/eggshen-config-events event-requests website-url url:http://localhost:8080
/eggshen-config-events event-requests invite-url url:https://discord.gg/yourserver
```

### Step 2: Get the Event Request Link

```
/eggshen-config-events event-requests get-link
```

This shows your configured Form URL and reminds you to set `GUILD_ID` in `public/config.js` (copied from `public/config.example.js`) if you haven't already.

## Moderator Image Cropping

Submitters can attach a cover image to their event request (upload or a pasted URL), with an in-browser crop step so most images look right by default. Moderators can also crop or replace the image directly from a "Crop Image" link button on the request in Discord — no need to leave Discord and no login required, since the link is signed and tied to that one request.

This link is generated using `PUBLIC_BOT_URL` (the bot API's own externally-reachable base URL — **not** the same as `FORM_URL`, which is where the separately-hosted form lives) and signed with `EVENT_CROP_LINK_SECRET`:

```env
EVENT_CROP_LINK_SECRET=your_generated_secret_here
PUBLIC_BOT_URL=http://localhost:3000
```

Generate a secret once per deployment:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Keep it independent from `DISCORD_CLIENT_SECRET`/`DISCORD_TOKEN` so it can be rotated on its own. If `EVENT_CROP_LINK_SECRET` or `PUBLIC_BOT_URL` isn't set, the "Crop Image" button is simply omitted from moderation-channel messages — everything else about the event request system works normally.

Each crop link is single-use (one successful save) and expires after 30 minutes; a moderator can always generate a fresh one by reopening the request's Edit modal.

## Local Testing

### 1. Start the Bot
The API server starts automatically when the bot starts:
```bash
npm start
```

You should see: `✓ API server listening on port 3000`

### 2. Configure the Web Form

Copy `public/config.example.js` to `public/config.js` and set `GUILD_ID` to your test server's ID (from `/eggshen-config-events event-requests get-link`):

```bash
cp public/config.example.js public/config.js
```

```js
window.EGG_SHEN_CONFIG = {
  GUILD_ID: 'YOUR_TEST_SERVER_GUILD_ID',
};
```

### 3. Serve the Web Form

From the project root, serve the `/public` folder:

```bash
# Using Python
cd public && python3 -m http.server 8080

# OR using Node.js http-server
npx http-server public -p 8080
```

### 4. Open the Form
Navigate to: `http://localhost:8080`

### 4. Test the Flow
1. Click "Login with Discord"
2. Authorize the bot
3. Fill out the event request form
4. Submit the request
5. Check your moderation channel in Discord
6. Click "Approve" or "Deny"

## Production Deployment

### For yourdomain.com or similar:

1. **Update Environment Variables**:
   ```env
   API_PORT=3000
   OAUTH_REDIRECT_URI=https://yourdomain.com/api/auth/discord/callback
   FORM_URL=https://yourdomain.com
   ALLOWED_ORIGINS=https://yourdomain.com
   ```

2. **Update Discord Developer Portal**:
   - Add production redirect URI: `https://yourdomain.com/api/auth/discord/callback`

3. **Deploy Web Form**:
   - Upload `/public` folder contents to your web server (yourdomain.com) — this includes `public/css/` and `public/js/` (vendored Bootstrap + the site's color theme), which the form now depends on for its styling, so a full-folder copy is required rather than copying individual files
   - Copy `public/config.example.js` to `public/config.js` on the server and set `GUILD_ID` to your Discord server's ID
   - Ensure HTTPS is enabled

4. **Configure Servers**:
   ```
   /eggshen-config-events event-requests website-url url:https://yourdomain.com
   ```

5. **Share the Link**:
   ```
   /eggshen-config-events event-requests get-link
   ```

## Multiple Servers

One bot process can back the event-request form for more than one Discord server, but **each web form deployment is dedicated to exactly one server** — the real Guild ID lives in `public/config.js` (copied from `public/config.example.js`, gitignored so `git pull` never overwrites it), not something a visitor can pick via a query parameter. To serve a second server, deploy a second copy of the `public/` folder (its own domain or subdomain) with its own `config.js`, both pointed at the same bot process.

Each Discord server's own settings still live in its own `guild_configs/<guildId>.json` (via `loadGuildConfig`/`saveGuildConfig`, not a shared `event_request_config.json`), configured independently with `/eggshen-config-events event-requests`:

```
/eggshen-config-events event-requests toggle enabled:true
/eggshen-config-events event-requests moderation-channel channel:#your-channel
/eggshen-config-events event-requests server-name name:"Your Server"
/eggshen-config-events event-requests website-url url:https://your-domain-for-this-server.com
```

**Example: a dev and production deployment on subdomains of the same domain**

```
yourdomain.com       → public/            → GUILD_ID = <production guild>
dev.yourdomain.com   → public-dev/        → GUILD_ID = <dev/test guild>
```

Both domains proxy `/api/`, `/crop/`, and `/crop-assets/` to the **same** bot process — no second bot, no second `.env`, no backend code changes needed for this part. What each domain needs:

1. A second static directory (e.g. `public-dev/`) — a copy of `public/` (including `crop/`) with its own `config.js` set to the other server's Guild ID.
2. A second nginx `server{}` block for the new (sub)domain, mirroring the existing one: same `root` pattern pointed at the new directory, the same three proxy `location` blocks, its own SSL certificate (`certbot --nginx -d dev.yourdomain.com`, once DNS for the subdomain points at the server).
3. `ALLOWED_ORIGINS` in `.env` updated to a comma-separated list including every domain (already supported — `cors()`'s `origin` option is built directly from `ALLOWED_ORIGINS.split(',')`): `ALLOWED_ORIGINS=https://yourdomain.com,https://dev.yourdomain.com`.
4. Both callback URLs registered in the Discord Developer Portal (OAuth2 → Redirects): `https://yourdomain.com/api/auth/discord/callback` **and** `https://dev.yourdomain.com/api/auth/discord/callback`. The bot itself derives which one to use per-request from the actual incoming domain (not a single static `OAUTH_REDIRECT_URI`), so a login started on either domain correctly lands back on that same domain — `OAUTH_REDIRECT_URI`/`FORM_URL` in `.env` only matter as a fallback for requests where the domain can't be determined (shouldn't happen behind nginx).

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
- Check that moderation channel is set: `/eggshen-config-events event-requests view`
- Verify the bot's role has **View Channel**, **Send Messages**, and **Embed Links** in that channel — a channel-specific permission override (common in mod-only channels) can block the bot even if its server-wide role permissions look correct

### "Failed to create event: Missing Permissions" on Approval
- The bot's role needs the server-wide **Manage Events** permission to create the Discord Scheduled Event — this is separate from the moderation-channel permissions above and can't be granted per-channel
- Server Settings → Roles → (the bot's role) → enable **Manage Events**, then retry the approval (no restart needed)

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

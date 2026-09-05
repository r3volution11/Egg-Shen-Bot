# Event Request System Setup Guide

The Event Request System allows Discord server members to submit watch party events through a web form. Moderators can approve or deny requests, and approved events are automatically created as Discord Scheduled Events.

This is a feature of the self-hosted bot codebase — each self-hoster runs their own bot process, `.env`, and `guild_configs/`, entirely independent of anyone else's deployment. One bot process can serve several of *your own* Discord communities at once (see "Multiple Servers" below), but this project isn't a platform where a central operator hosts bots/websites on other people's behalf.

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
/eggshen-config-website url url:http://localhost:8080
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
  LOGO_URL: '', // optional — a logo shown centered at the top of the form, capped at 200px wide
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
   /eggshen-config-website url url:https://yourdomain.com
   ```

5. **Share the Link**:
   ```
   /eggshen-config-events event-requests get-link
   ```

## Multiple Servers

One bot process can back the event-request form for more than one Discord server — this is exactly how a self-hoster serving several of their own communities from a single bot process is expected to work (it's *not* a hosted service one operator runs on other people's behalf; see the note at the top of this doc). **Each web form deployment is dedicated to exactly one server** — the real Guild ID lives in that domain's own `config.js`, not something a visitor can pick via a query parameter. Each community gets its own independent domain, its own named color theme, and its own entry in `scripts/domains.json` — there's no assumption that a second community's domain is a "dev" subdomain of the first's.

Each Discord server's own settings still live in its own `guild_configs/<guildId>.json` (via `loadGuildConfig`/`saveGuildConfig`, not a shared `event_request_config.json`), configured independently with `/eggshen-config-events event-requests`:

```
/eggshen-config-events event-requests toggle enabled:true
/eggshen-config-events event-requests moderation-channel channel:#your-channel
/eggshen-config-events event-requests server-name name:"Your Server"
/eggshen-config-website url url:https://your-domain-for-this-server.com
/eggshen-config-website theme name:default
```

`/eggshen-config-website theme` picks one of the named themes defined in `scripts/web-themes.json` (see "Customizing the Look" below) — it's what colors this guild's event-request form, and any crop/quotes-admin links generated from this guild (see below). Website settings (`url`/`theme`) live under their own `/eggshen-config-website` command rather than `/eggshen-config-events`, since they apply beyond just the event-request feature.

**`scripts/domains.json`** is the manifest that ties it all together — one entry per domain/community, each naming the guild it's for, the theme it should use, and (optionally) a logo:

```json
{
  "my-community": { "guildId": "123456789012345678", "theme": "default", "logoUrl": "https://example.com/logo.png" },
  "my-other-community": { "guildId": "876543210987654321", "theme": "my-theme", "logoUrl": "" }
}
```

Run `npm run deploy:domain <label>` (or `npm run deploy:domain -- --all`) after `npm run build:web` to generate a complete, ready-to-serve static-file copy at `domains/<label>/` for each entry — its own `config.js` (with that entry's `GUILD_ID`/`LOGO_URL` baked in) and its own themed `css/bootstrap.min.css`, alongside a copy of `index.html`/`app.js`/`style.css`/`crop/`/`img/`. This replaces hand-copying `public/` per domain. `domains/` is gitignored — it's generated output, regenerate it any time `domains.json`, a theme, or `public/` itself changes.

**⚠️ Existing domains must be cut over too, not just new ones.** `public/css/bootstrap.min.css` no longer exists once you're on named themes — the compiled CSS only lives at `public/css/themes/<theme>/bootstrap.min.css` and, per-domain, at `domains/<label>/css/bootstrap.min.css`. If your nginx `root` is still pointed at `public/` from before you adopted `domains.json`, the CSS/JS `<link>`/`<script>` paths will 404 at the file-system level and nginx's `try_files ... /index.html` fallback will silently serve `index.html` in their place — the page loads, but the browser refuses to apply it ("MIME type ('text/html') is not a supported stylesheet MIME type"), a bug easy to ship without noticing. The fix is the same as for a brand-new domain: point that domain's nginx `root` at its `domains/<label>/` directory (step 1 below) — do this for every domain already in production, not only ones you're newly adding.

**Adding a new domain, or cutting an existing one over to `domains.json`**, once it has its own entry there:

1. Point that domain's nginx `root` at `domains/<label>/` (generated above) instead of `public/`.
2. Proxy `/api/`, `/crop/`, `/crop-assets/`, `/quotes-admin/`, `/quotes-assets/`, and `/shared-assets/` (the compiled Bootstrap CSS/JS the crop and quotes-admin pages share — see "Customizing the Look" below) to the **same** bot process — no second bot, no second `.env`, no backend code changes needed for this part.
3. Its own SSL certificate (`certbot --nginx -d your-new-domain.com`, once DNS for it points at the server).
4. `ALLOWED_ORIGINS` in `.env` updated to a comma-separated list including every domain (already supported — `cors()`'s `origin` option is built directly from `ALLOWED_ORIGINS.split(',')`): `ALLOWED_ORIGINS=https://yourdomain.com,https://your-new-domain.com`.
5. Both callback URLs registered in the Discord Developer Portal (OAuth2 → Redirects): `https://yourdomain.com/api/auth/discord/callback` **and** `https://your-new-domain.com/api/auth/discord/callback`. The bot itself derives which one to use per-request from the actual incoming domain (not a single static `OAUTH_REDIRECT_URI`), so a login started on either domain correctly lands back on that same domain — `OAUTH_REDIRECT_URI`/`FORM_URL` in `.env` only matter as a fallback for requests where the domain can't be determined (shouldn't happen behind nginx).

## Customizing the Look

Three separate mechanisms control how these pages look, each configured differently — worth keeping straight:

| What | How | When it takes effect |
|---|---|---|
| **Accent color** (buttons, links, tabs — the whole palette is derived from this one color), as one or more **named themes** | `scripts/web-themes.json` (theme name → primary color), assigned per-guild with `/eggshen-config-website theme name:<theme>` | Build-time for the theme's compiled CSS — after adding/changing a theme, run `npm run build:web` (produces `public/css/themes/<theme>/bootstrap.min.css` for each). Assigning a theme to a guild takes effect immediately (no rebuild) — it just changes which already-compiled CSS file that guild's pages, crop links, and quotes-admin links point at. |
| **Logo** shown at the top of the event-request form | `logoUrl` in that domain's `scripts/domains.json` entry, baked into its `config.js` by `npm run deploy:domain` | Takes effect after regenerating that domain with `deploy:domain`. Per-domain: each entry in `domains.json` can show a different logo (or none). |
| Everything else (layout, fields, spacing) | Fixed | N/A — not currently configurable. |

If you just want the default look, you don't need to touch any of these — the `"default"` theme in `scripts/web-themes.json` uses `WEB_PRIMARY_COLOR` if set, else a cyan theme, and an empty `logoUrl` shows no logo.

The moderator-only crop page and `/quotes-admin` pick up their theme automatically, matching whichever guild the link was generated from — a crop link from a guild assigned the `"shudder"` theme renders red-themed even though crop.html itself isn't part of any per-domain copy; the bot resolves and serves it themed on the fly (see `QUOTES_ADMIN_SETUP.md` for the quotes-admin side of this).

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

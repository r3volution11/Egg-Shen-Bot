---
description: "Let members request watch-party events through a web form; moderators approve them in Discord and the bot creates the Scheduled Event."
---

# Event Requests

Let your members request watch-party events through a web form. Moderators approve or deny each request in Discord, and an approved request becomes a Discord Scheduled Event.

## Overview

The Event Request System provides:

- 🔐 **Discord OAuth Login** - Secure authentication with Discord, kept in a signed cookie
- 📝 **Web Form** - Members fill in the title, time and an image
- 💬 **Guidance on the Form** - Helper text under each field, rewritten per server ([see below](#guidance-on-the-form))
- 🖼️ **Artwork Suggestions** - Backdrops and posters for the typed title, to pick and crop
- 📺 **Where to Watch** - Each title's streaming services, shown to moderators and added to the event ([see below](#where-to-watch-on-each-request))
- ✅ **Moderation Queue** - Review and approve/deny requests
- 🎉 **Auto-create Events** - Approved events become Discord Scheduled Events
- 📣 **Announcements** - Each decision posted for the moderators, and approved events announced to members if you like ([see below](#announcing-approved-events-to-members))
- ⏱️ **Rate Limiting** - Prevents spam (1 request per 5 minutes)
- 🌐 **Dedicated Deployment** - Each website serves one specific Discord server

## How It Works

1. **User visits your event request form** at your configured website
2. **User logs in with Discord** (OAuth authentication)
3. **System validates guild membership:**
   - Checks if user is a member of the target server
   - Non-members see error with invite link (if configured)
   - Only server members can proceed
4. **User submits event details** (with your server's guidance under each field, and artwork suggested for the title):
   - **Simple Mode (default):** Title, description, image and time. Moderators assign channels during approval.
   - **Advanced Mode (opt-in):** Full control including channel selection from admin-configured whitelists.
5. **System checks membership again at submission** (in case they left the server after logging in)
6. **Request appears in your moderation channel** with Approve/Deny buttons, and where the title streams
7. **Moderator clicks a button** to approve or deny
8. **If approved, the Discord Scheduled Event is created automatically**, its description ending with where to watch, and announced to members if you've set that up

::: tip Security: Guild Membership Required
The bot checks that people are **members of your Discord server** both when they log in and when they submit the form. Non-members see an error, with your invite link if you've set one. This keeps out spam from outside your community.
:::

::: tip Default Behavior
By default, event requests use **Simple Mode**: members submit the event and moderators pick the channels. Turn on **Advanced Mode** with `/eggshen-config-events event-requests allow-user-channel-selection allow:true` to let users select channels.
:::

## Deployment Model

::: tip One Website = One Discord Server
Each copy of the event request form belongs to **one Discord server**. One bot can back several forms, each on its own domain, for several servers.

**Example:**
- moviefans.example.com → Movie Fans Discord Server
- yourdomain.com → Your Discord Server
:::

## Setup Requirements

::: warning Prerequisites
This feature requires:
- A web server for the form (e.g., yourdomain.com) that can forward `/api/` to the bot, such as nginx
- The Client Secret from the Discord Developer Portal
- A few more environment variables
:::

### Step 1: Discord Developer Portal Setup

::: danger CRITICAL: OAuth Redirect URI
**Add the redirect URI in the Discord Developer Portal BEFORE testing.** Without it, people get "Invalid OAuth2 redirect_uri" when they try to log in.
:::

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your bot application
3. Open the **OAuth2** section
4. Click **Add Redirect** and enter your form's address followed by `/api/auth/discord/callback`:
   - For production: `https://yourdomain.com/api/auth/discord/callback`
   - For local testing: `http://localhost:3000/api/auth/discord/callback`
   - Serving the form on more than one domain? Add one for each
5. Click **Save Changes** (don't forget this!)
6. Copy your **Client Secret** from the OAuth2 page (keep it secret)

The bot builds the callback address from the domain each login starts on, so a login on one domain always comes back to that domain. `OAUTH_REDIRECT_URI` is only used when the domain can't be worked out.

### Step 2: Environment Variables

Add these to your `.env` file (`DISCORD_CLIENT_ID` is already there for the bot):

```env
# Required for event requests
DISCORD_CLIENT_SECRET=your_client_secret_here

# API configuration
API_PORT=3000
# Every domain the form is served from, comma-separated
ALLOWED_ORIGINS=https://yourdomain.com
# Fallbacks, used only when the bot can't tell which domain a login came from
OAUTH_REDIRECT_URI=https://yourdomain.com/api/auth/discord/callback
FORM_URL=https://yourdomain.com

# Powers the moderator "Crop Image" button (see Cropping or Replacing the Image)
EVENT_CROP_LINK_SECRET=your_generated_secret_here
PUBLIC_BOT_URL=https://yourdomain.com

# Optional: signs the form's login cookie. Leave it out to derive one from
# DISCORD_CLIENT_SECRET; set it to be able to sign everyone out on its own.
SESSION_SECRET=your_generated_secret_here
```

Generate a secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Restart the bot after changing `.env`.

### Step 3: Deploy the Web Form

The form's files are in `public/`. Build them and make a ready-to-serve copy for your site:

1. Add an entry for your site to `scripts/domains.json`, with your server's Guild ID, a theme and an optional logo:

   ```json
   {
     "my-community": { "guildId": "123456789012345678", "theme": "default", "logoUrl": "" }
   }
   ```

2. Build the styles and make the copy:

   ```bash
   npm run build:web
   npm run deploy:domain -- --all
   ```

   This writes `domains/my-community/`, with its own `config.js` holding the Guild ID. Run it again whenever you update the bot.

3. Point your web server's root for the domain at `domains/my-community/`.

4. Forward these paths to the bot's API port (3000 by default): `/api/`, `/crop/`, `/crop-assets/` and `/shared-assets/`. The form talks to the bot at `/api/` on its own domain, so without this it can't log anyone in. Pass the `Host` and `X-Forwarded-Proto` headers, so the bot builds an `https://` login callback, and set `X-Forwarded-For` to the visitor's address, which the form's rate limits count by:

   ```nginx
   location /api/ {
       client_max_body_size 10M;
       proxy_pass http://localhost:3000;
       proxy_set_header Host $host;
       proxy_set_header X-Forwarded-For $remote_addr;
       proxy_set_header X-Forwarded-Proto $scheme;
   }
   ```

   The bot believes `X-Forwarded-For` only from a proxy on the same machine, and takes the address that proxy added, so `$proxy_add_x_forwarded_for` works too. Run the proxy on the bot's machine, and keep the bot's port closed to the outside: see [Installation › Keep the Bot's Port Private](/installation#keep-the-bot-s-port-private). [The Web Pages](/installation#the-web-pages) also lists the paths the tournament setup form and the quotes editor need.

5. Use HTTPS.

The full walkthrough, including themes and several domains, is in the [setup guide](https://github.com/r3volution11/Egg-Shen-Bot/blob/main/EVENT_REQUEST_SETUP.md).

::: tip Finding Your Guild ID
Run `/eggshen-config-events event-requests get-link` in your Discord server. It shows the Guild ID to put in `scripts/domains.json`. Or turn on Developer Mode in Discord and right-click your server's icon → **Copy Server ID**.
:::

::: warning Reverse Proxy Upload Size Limit
nginx accepts request bodies up to **1MB** by default, which turns away most real event images before they reach the bot. The bot accepts images up to 8MB, so set the proxy's limit to at least that (`client_max_body_size 10M;` above).

Without it, image uploads fail: the browser gets the proxy's own `413 Request Entity Too Large` page instead of the bot's error, and the bot's logs show nothing because the request never reached it.
:::

### Step 4: Configure Your Server

::: warning Event Requests Disabled by Default
Event requests are **off by default**. Turn them on with the toggle command below. Until then, the form tells visitors event requests aren't available.
:::

Use the `/eggshen-config-events event-requests` commands in your Discord server. They're for admins and moderators.

**1. Enable event requests (required first step):**
```
/eggshen-config-events event-requests toggle enabled:true
```

**2. Configure required settings** (the website URL is set with `/eggshen-config-website`, not an `event-requests` subcommand):
```
/eggshen-config-events event-requests moderation-channel channel:#event-requests
/eggshen-config-events event-requests server-name name:Your Server Name
/eggshen-config-website url url:https://yourdomain.com
```

**3. Optional settings:**
```
/eggshen-config-events event-requests invite-url url:https://discord.gg/yourserver
/eggshen-config-website bot-url url:https://yourdomain.com
```

The bot URL is where the moderators' crop page lives (see [Cropping or Replacing the Image](#cropping-or-replacing-the-image)); without it the bot uses `PUBLIC_BOT_URL`. The form's guidance, the where-to-watch line and announcing approved events to members are covered further down.

### Step 5: Get Your Link

```
/eggshen-config-events event-requests get-link
```

This shows your Form URL and the Guild ID your site needs (`guildId` in `scripts/domains.json`, or `GUILD_ID` in `public/config.js`). It only works once event requests are on and the website URL is set.

Share the Form URL with your community.

## Configuration Commands

Everything is set with `/eggshen-config-events event-requests` subcommands, by admins and moderators:

### View Current Settings

```
/eggshen-config-events event-requests view
```

Shows the settings, including whether the form's guidance has been changed, and the form's link once event requests are on and the website URL is set. The where-to-watch line has its own view: run `streaming` with no options.

### Enable/Disable

```
/eggshen-config-events event-requests toggle enabled:true
/eggshen-config-events event-requests toggle enabled:false
```

Turn event requests on or off for your server.

::: tip Default State
Event requests are **off by default**. Turn them on with `enabled:true` before anyone can submit a request. While they're off, the form tells visitors the feature isn't available.
:::

### Set Moderation Channel

```
/eggshen-config-events event-requests moderation-channel channel:#event-requests
```

Choose where event requests will be sent for approval. Must be a text channel.

### Set Server Display Name

```
/eggshen-config-events event-requests server-name name:My Awesome Server
```

This name appears on the event request form.

### Set Website URL

```
/eggshen-config-website url url:https://yourdomain.com
```

The website where your event request form is hosted. This lives on `/eggshen-config-website` (not under `event-requests`) because the same site URL is shared by other web features; check it with `/eggshen-config-website view`.

### Set Invite Link (Optional)

```
/eggshen-config-events event-requests invite-url url:https://discord.gg/yourserver
```

Discord invite link shown on the form. Leave empty to hide.

### Allow/Disallow Voice Requests

```
/eggshen-config-events event-requests allow-voice-requests allow:true
/eggshen-config-events event-requests allow-voice-requests allow:false
```

Controls whether members can add a voice or stage channel to their request. It's on by default, and only matters in Advanced Mode (below), where members pick channels. When it's off, every request is text-channel only.

**Use cases for disabling:**
- Server primarily uses text chat for watch parties
- Voice channels are reserved for specific purposes
- Simplify the event request form

### Get Configuration Summary

```
/eggshen-config-events event-requests get-link
```

Shows your form URL and the Guild ID your site needs.

#### Optional: Choose Simple or Advanced Mode

**Simple Mode (default):**
```
/eggshen-config-events event-requests allow-user-channel-selection allow:false
```

Members fill in the event's details (title, description, image, time). The form hides channel selectors and shows: **"Moderators will select the channels when approving your event."** Moderators assign channels during approval.

**Best for:**
- New communities still establishing channel structure
- Servers with dedicated event coordinators
- Reducing decision fatigue for casual users
- Simplifying the submission process

**Advanced Mode (opt-in):**
```
/eggshen-config-events event-requests allow-user-channel-selection allow:true
```

Users select specific text/voice channels from admin-configured whitelists (see below). Form shows Location field (required) and optional Voice Channel checkbox.

**Best for:**
- Experienced communities with established channels
- Power users who understand channel structure
- Community-driven events where users know best location
- Servers where moderators prefer not to assign channels

::: tip Recommended Default
Keep **Simple Mode** enabled by default. It provides the best experience for most users by removing the complexity of channel selection. Only switch to **Advanced Mode** if your community specifically requests more control.
:::

#### Optional: Whitelist Allowed Channels

::: info Advanced Mode Only
Channel whitelisting only applies when **Advanced Mode** is enabled. In Simple Mode, moderators assign channels during approval, so whitelisting is not needed.
:::

By default (in Advanced Mode), users can select from **all text channels** and **all voice/stage channels** in your server. You can restrict this to specific channels:

**Whitelist text channels:**
```
/eggshen-config-events event-requests set-allowed-text-channels channel-ids:123456,789012,345678
```

**Whitelist voice channels:**
```
/eggshen-config-events event-requests set-allowed-voice-channels channel-ids:111222,333444
```

**Allow all channels (reset to default):**
```
/eggshen-config-events event-requests set-allowed-text-channels channel-ids:all
/eggshen-config-events event-requests set-allowed-voice-channels channel-ids:all
```

Type `all` and the IDs without quotes around them. Discord keeps the quotes, so `"all"` would be saved as a channel ID that doesn't exist, and the form would offer no channels at all.

::: tip When to Use Channel Whitelisting
**Good use cases:**
- Limit events to dedicated watch party channels (#movie-night, #tv-night)
- Exclude announcement or admin-only channels
- Simplify dropdown for servers with 50+ channels
- Prevent accidental selection of inappropriate channels

**How to get Channel IDs:**
1. Enable Developer Mode in Discord Settings → Advanced
2. Right-click any channel → Copy Channel ID
3. Paste the IDs separated by commas
:::

::: warning Independent Controls
Text and voice whitelists are **independent**:
- You can limit text channels while allowing all voice channels
- Or vice versa
- Or limit both
- Empty list (default) = all channels of that type allowed
:::

## User Experience

### Submitting a Request

1. **Visit the link** provided by server admins
2. **Click "Login with Discord"** to authenticate
3. **Fill out the form:**
   - Event title (required)
   - Description (optional, up to 800 characters)
   - **Event image** (optional) - Upload an image file, paste an image URL, or pick artwork suggested for your title. Either way you get to crop it
   - **Location** (Advanced Mode only, required there) - Text channel for the watch party
   - **Voice channel** (Advanced Mode only, optional) - Check the box to add a voice or stage channel
   - Start date and time (required)
   - End date and time (optional)
   - Frequency (optional: one-time by default, or Daily, Weekly, Biweekly, Monthly)
   - Each field has a short note on what the server wants; each server can rewrite these for its own community
4. **Click "Submit Request"**
5. **Wait for moderator approval**

::: tip Artwork Suggestions
Once you've typed the title, the form suggests artwork for it from TMDB: wide backdrops first (they fit an event cover with little cropping), then a couple of posters. If several titles match, like the *Fargo* film and the show, each gets its own row with its year, so you pick from the right one. Nothing is chosen for you. Click one to open it in the crop tool, or ignore them and use your own image.

Picking artwork also tells the bot exactly which title you mean, so the moderators' **📺 Where to watch** line uses that title instead of guessing from what you typed. Trying different suggestions doesn't count against the upload limit; the one you keep is uploaded when you submit.
:::

::: tip Event Image
Picking a file (PNG, JPEG, GIF, or WebP, up to 8MB) or pasting a direct image URL and clicking **Fetch & Crop** both upload it right away and load it into a crop tool, pre-framed to match Discord's event cover shape. Providing neither is fine too — moderators can always add or change the image when they approve your request (see below).

Drag to adjust the framing as much as you like — this only updates the preview, not the server, so there's no limit on how many times you re-adjust it. The final framing is uploaded once you submit the form. If you change your mind about the image entirely, click **Change Image** to clear it and pick a different file or URL.
:::

::: tip Channel Selection
Channels only appear on the form in Advanced Mode. In Simple Mode, the form says moderators will pick them.

**Location** is where the watch party chat happens (a text channel, required).

**Voice channel** is optional, and only shown if the server allows voice requests. Check the box to include a voice or stage channel for the event.
:::

::: tip Time Zones
The form automatically detects and shows your own local timezone next to the time fields (e.g. "Times shown in your local timezone: America/Los_Angeles"), so type the start/end time as it would appear on your own clock — no conversion needed. Once approved, the event is created correctly for everyone: Discord shows scheduled events in each viewer's own local timezone automatically, the same way it handles every other timestamp, so a moderator (or anyone else) sees the right time on their own clock too, regardless of where they are.
:::

### For Moderators

When a request is submitted:

1. **The request appears in the moderation channel** with its details and image, including **📺 Where to watch**: which of your server's streaming services carry the title (see [Where to Watch](#where-to-watch-on-each-request))
2. **It shows the text channel and voice channel**, if the submitter picked them, or "Moderator will assign during approval"
3. **The buttons depend on the request:**
   - **Text-only request**: ✅ Approve & Create Event, ✏️ Edit, or ❌ Deny
   - **Request with voice**: ✅ Approve Both, 💬 Text Only, ✏️ Edit, or ❌ Deny
   - Both also get **🖼️ Crop Image** when the crop page is set up (see below)
4. **Choose one:**
   - **Approve & Create Event** → Creates the event. If no channel was picked, you choose one first (see below)
   - **Approve Both** → Creates a voice channel event, with the text channel for the chat
   - **Text Only** → Creates a text-only event (drops the voice channel)
   - **Edit** → Opens a form to correct the title, description, or start/end time — saving it immediately approves the request too (see below)
   - **Deny** → Opens a form for an optional reason, then removes the request without creating an event

### Picking the Channels

A request without a text channel (every request in Simple Mode) can't become an event until it has one. Pressing any Approve button then shows you, privately:

- **A text channel menu** (required): where the watch party's chat happens
- **A voice channel menu** (optional): leave it empty for a text-only event
- **✅ Create Event** and **Cancel**

What you pick decides the kind of event, whichever Approve button you pressed: with a voice channel it's a voice event with the text channel for chat, without one it's text-only. **Create Event** creates it and marks the request approved. **Cancel** drops your picks; the request stays in the queue to approve later. Saving an [edit](#editing-a-request-immediately-approves-it) on a request with no channel brings up the same menus.

### Editing a Request (Immediately Approves It)

If a submitter's title is wrong or the description needs more detail, click **✏️ Edit**. This opens a form pre-filled with the current title and description, along with the event's start/end time — update any field and submit.

The Edit form also includes an optional **Image URL** field. Use it to add an image to a request that didn't include one, or to replace whatever image the submitter provided (upload or URL) — an image URL entered here always wins over the submitter's. Leaving it blank doesn't clear an existing image; there's no separate "remove image" action, only "optionally override it."

Saving the edit both updates the request **and approves it in the same step** — there's no separate Approve click needed afterward:
- If the request already has a text channel (the submitter picked one in Advanced Mode), saving creates the event right away, using a voice channel too if one was requested.
- If no channel is set yet, saving shows the same channel-selection step Approve normally shows — pick a channel there and the event is created from your edited title/description.

If you want to review the edit before it goes live, or need to change something Edit doesn't cover, deny the request instead and ask the submitter to resubmit — editing is meant for quick corrections a moderator is comfortable approving outright, not a staging step.

The Edit form also includes **Start Time (UTC)** and **End Time (UTC, optional)** fields, pre-filled with the request's current schedule. Both use a strict `YYYY-MM-DD HH:mm` 24-hour format (e.g. `2026-09-15 20:00`) and are always interpreted as UTC — not your local time or the server's — since a modal has no timezone picker; convert to UTC before typing a value. Leaving End Time blank means the event has no set end time. Start Time must be in the future and, if both are set, End Time must be after Start Time — an invalid or past value is rejected with an explanation and nothing is saved. Discord's own event page (the confirmation's **Event URL**) still displays the final schedule correctly in every viewer's own local timezone automatically — this is Discord's own behavior (every scheduled event is created in the creator's local time and shown back to each viewer in theirs, with no server-wide timezone concept at all), not something this bot computes.

### Cropping or Replacing the Image

Every event request in the moderation channel shows a **🖼️ Crop Image** button alongside Approve/Edit/Deny (if a bot address — this server's [bot URL](../commands/configuration#bot-url), or the bot's `PUBLIC_BOT_URL` — and `EVENT_CROP_LINK_SECRET` are configured — see [setup guide](https://github.com/r3volution11/Egg-Shen-Bot/blob/main/EVENT_REQUEST_SETUP.md)). Clicking it gives you a private **Open Crop Page** link. The page needs no login (the link itself is what authorizes you), and has the same image options as the request form:
- Adjust the framing of whatever image the submitter provided, whether they uploaded a file or pasted a URL
- Upload a different image file and crop that instead
- Paste an image URL and click **Fetch & Crop** to crop that instead
- Add an image to a request that didn't have one at all

Each link is just for you, works for 30 minutes, and is used up by one save. Click **Crop Image** again any time for a new one. Once you save a crop, it becomes the image used when the request is approved. The Edit button's **Image URL** field still works for a quick swap, but an image set there is used as-is, without cropping.

::: tip Cropping From the True Original
The crop page always loads the submitter's original, uncropped image — not their already-cropped result — so you can reframe it freely without compounding crops on top of crops. If you upload or fetch a different image instead, that becomes the new original for any future re-crop.
:::

The moderation-channel embed shows a **🖼️ Image** field (`✅ Uploaded`, `🔗 Linked (URL)`, or `❌ None`) so you can see at a glance whether a request has an image before deciding whether to crop, override, or leave it as-is.

### Denying with a Reason

Clicking **❌ Deny** opens a form with an optional reason field. Whatever you enter (or leave blank) is:
- Shown on the moderation-channel embed, so other moderators can see why without asking
- Sent as a direct message to the person who submitted the request, so they're not left wondering what happened

If the bot can't DM the submitter (for example, they have server DMs disabled), the denial still completes — you'll just see a note that the notification couldn't be delivered.

### Everyone Sees What Happened

Approving or denying a request updates the original request's message in place (title, color, and buttons change to reflect the outcome) — but a silent edit to an old message is easy to miss if you weren't already looking right at it. On top of that, the bot posts a **new message** to the moderation channel announcing the outcome:
- **Approved:** who approved it and a link to the newly created event
- **Denied:** who denied it, and the reason if one was given

This applies to every way a request gets approved — the Approve buttons, picking a channel after Approve, and saving an edit — so the whole moderation team can see what happened and why without having to notice an old message changed.

This is on by default. To turn it off (only the original request message updates, no separate announcement):
```
/eggshen-config-events event-requests announce-decisions enabled:false
```

### Announcing Approved Events to Members

The decision message above goes to the moderation channel, which members usually can't see. To also post a **📅 New watch party** message where they can, pick a destination:
```
/eggshen-config-events event-requests announcement-channel where:The event's own channel
/eggshen-config-events event-requests announcement-channel channel:#watch-parties where:A specific channel
```

**The event's own channel** posts in the text channel where the watch party takes place. The post links the event (so Discord shows its card with the **Interested** button) and credits the submitter without pinging them. It's off by default; `where:Off` turns it back off.

If the bot can't post there (usually a missing **Send Messages** permission), the event is still created, and the approving moderator's reply says the announcement failed and why.

::: tip Moderator Permissions
Approving, denying, editing and cropping requests needs the **Manage Events** or **Administrator** permission.
:::

## Rate Limiting

The form has its own limits against spam, counted by IP address (the one your proxy passes in `X-Forwarded-For`; see [Step 3](#step-3-deploy-the-web-form)):

- **1 request per 5 minutes**
- **5 image uploads per 5 minutes**, counting both picked files and fetched image URLs
- **30 artwork lookups a minute**, for logged-in members only
- **10 channel lookups a minute**

Logins last 24 hours.

Limits are counted **per domain** as well as per IP. If one bot serves several sites (see [Multiple Servers](#multiple-servers-advanced) below), a request on one site doesn't use up another site's limit.

These are separate from the bot's [rate limits for commands](/features/rate-limiting).

## Security Features

- ✅ Discord OAuth authentication (no passwords stored)
- ✅ Session-based login (24-hour expiration), with a signed cookie: it can't be edited or forged to claim another member
- ✅ Requests are made as whoever is logged in; the form can't submit on someone else's behalf
- ✅ HTTP-only cookies, marked secure when `NODE_ENV=production`
- ✅ CORS protection
- ✅ Rate limiting
- ✅ Requests nobody approves or denies expire after 7 days
- ✅ Uploaded images are validated by type (PNG/JPEG/GIF/WebP) and capped at 8MB
- ✅ Uploaded images are automatically deleted ~90 days after their event's date has passed (or sooner if the request is never approved)

## Customizing for Your Server

### Making It Your Own

1. **Point the form at your server** - the `guildId` in your site's entry in `scripts/domains.json` (see [Step 3](#step-3-deploy-the-web-form))
2. **Set the server name and invite** - with the `/eggshen-config-events event-requests` commands
3. **Adjust the guidance** - the form comes with helper text under each field, an intro and a footer; `/eggshen-config-events event-requests guidance` rewrites any of it for your server (see below)
4. **Change the look** - the theme and logo in `scripts/domains.json`, or `public/style.css`, then run `npm run build:web` and `npm run deploy:domain -- --all` again
5. **Host it** - any web server that can forward `/api/` to the bot

### Guidance on the Form

Every form tells people what to expect before they request. The defaults cover it in general terms:

- **Intro:** Discord login only confirms membership; check the Events tab first; moderators review every request
- **Event title:** pick something that fits the server; add the release year
- **Description:** say where to watch it; services most people have get more people joining
- **Event image:** upload and crop a cover; moderators may adjust it
- **Date & time:** schedule within the next 2 weeks; you'll be the host and start the countdown
- **Frequency:** ask a moderator before setting up a recurring event
- **Footer:** questions go to a moderator

Rewrite any of it for your community:

```
/eggshen-config-events event-requests guidance part:page     ← the intro at the top, the footer at the bottom
/eggshen-config-events event-requests guidance part:fields   ← the text under the title, description, image, date & time, and frequency
```

Each opens a Discord form, filled in with what the form shows now. Empty a box to go back to the default, or type `none` to show nothing there. Lines starting with `•` or `-` become a list, `**bold**` is bold, and `https://` links can be clicked. Guidance belongs to the server, so when one bot backs several sites, each site shows its own server's text.

For example, a horror server might put "Keep it horror or horror-adjacent." under the title, and name the channels its events use in the intro.

### Where to Watch, on Each Request

Each request's title is looked up for where it streams, among the services your server cares about:

```
/eggshen-config-events event-requests streaming services:Shudder, AMC+, Tubi, Plex, Roku, Prime Video, Hulu, Peacock, Hoopla
```

Moderators see it on the request; approving adds it to the event's description, with a link to every other place to watch. Free services are marked "(free)". It never guesses: if the title doesn't match one movie or show exactly, nothing is added, and moderators are told to ask for the year. When the submitter picked artwork, that exact title is used.

It's on by default, with the services shown above in that order. Run the command with no options to see the current settings, `enabled:false` to turn the line off, or `services:default` to go back to the default list. See [Configuration › Where to Watch](../commands/configuration#where-to-watch) for the details.

### Multiple Servers (Advanced)

One bot can back a form for each of several servers. Give each site its own entry in `scripts/domains.json`:

```json
{
  "movie-night": { "guildId": "SERVER_1_ID", "theme": "default", "logoUrl": "" },
  "game-night": { "guildId": "SERVER_2_ID", "theme": "default", "logoUrl": "" }
}
```

`npm run deploy:domain -- --all` makes a copy of the form for each in `domains/<label>/`. For each domain, then:

- Point its web root at its own `domains/<label>/` folder, and forward the same paths to the same bot
- Add it to `ALLOWED_ORIGINS` (comma-separated)
- Add its callback, `https://<domain>/api/auth/discord/callback`, in the Discord Developer Portal. All the sites share the bot's one Discord application

Each site gets its own:
- Domain
- Guild ID, theme and logo
- Guidance on the form, where-to-watch services and other settings (set per server in Discord)
- Rate limits

See the [setup guide](https://github.com/r3volution11/Egg-Shen-Bot/blob/main/EVENT_REQUEST_SETUP.md) for the details.

## Local Testing

Want to test before deploying?

### 1. Start the Bot

The API server starts automatically:

```bash
npm start
```

You should see: `✓ API server listening on port 3000`

### 2. Serve the Web Form

Copy `public/config.example.js` to `public/config.js` and set `GUILD_ID` to your test server's ID. Then:

```bash
# Using Node.js http-server
npx http-server public -p 8080

# OR using Python
cd public && python3 -m http.server 8080
```

On `localhost`, the form talks to the bot at `http://localhost:3000` directly, so no proxy is needed. Served straight from `public/`, the page has no theme; that's fine for testing.

### 3. Configure for Testing

```env
# .env
OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/discord/callback
FORM_URL=http://localhost:8080
ALLOWED_ORIGINS=http://localhost:8080
```

Add `http://localhost:3000/api/auth/discord/callback` in the Discord Developer Portal too.

### 4. Test the Flow

Configure your test server:

```
/eggshen-config-events event-requests toggle enabled:true
/eggshen-config-events event-requests moderation-channel channel:#test-events
/eggshen-config-events event-requests server-name name:Test Server
/eggshen-config-website url url:http://localhost:8080
/eggshen-config-events event-requests view
```

Then open `http://localhost:8080` and go through the whole flow. Locally, logging in can leave you on the bot's own address (`localhost:3000`) instead of the form. If it does, go back to `http://localhost:8080`: you're logged in.

## Troubleshooting

### "Site can't be reached" Error

- ✅ Check the bot is running (the API server starts with it), with `pm2 status` or similar
- ✅ Check `API_PORT` in `.env` (default: 3000) matches what your web server forwards `/api/` to
- ✅ Check firewall rules if deployed to production

### "Guild not found" Error

- ✅ Check the Guild ID in your site's `config.js` (set from `scripts/domains.json`)
- ✅ Make sure the bot is a member of that server
- ✅ Check event requests are on: `/eggshen-config-events event-requests view`

### "Invalid OAuth2 redirect_uri" Error

::: danger Common Issue
This is the most common error when setting up event requests. It means Discord doesn't recognize your callback URL.
:::

**Solution:**
1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your application → OAuth2 → Redirects
3. Add your form's address followed by `/api/auth/discord/callback`, exactly, e.g. `https://yourdomain.com/api/auth/discord/callback`. Add one for each domain the form is served from
4. Click **Save Changes** (required!)
5. Wait a minute or two, then try logging in again

The bot builds the callback from the domain the login started on. Behind a proxy, it uses the `Host` and `X-Forwarded-Proto` headers the proxy passes. If the proxy doesn't pass `X-Forwarded-Proto`, the callback starts with `http://` and won't match an `https://` redirect.

**Common mistakes:**
- ❌ Forgetting to click "Save Changes" in the portal
- ❌ The proxy not passing `Host` and `X-Forwarded-Proto`
- ❌ A typo in the URL (even `/callback` vs `/callbacks` matters)
- ❌ Registering one domain while people use another

**Check your `.env`:**
```bash
npm run validate-oauth
```

This checks `DISCORD_CLIENT_SECRET` and the fallback `OAUTH_REDIRECT_URI`.

### OAuth Redirect Mismatch

- ✅ The callback in the Developer Portal must match the form's domain exactly, including `https://`
- ✅ Check the proxy passes `Host` and `X-Forwarded-Proto`
- ✅ Restart the bot after changing `.env`

### Requests Not Appearing

- ✅ Check moderation channel is set: `/eggshen-config-events event-requests view`
- ✅ Verify the bot's role has **View Channel**, **Send Messages**, and **Embed Links** in that specific channel — a channel-level permission override (common in mod-only channels) can block the bot even when its server-wide role looks correct
- ✅ Check bot logs for errors

### "Failed to Create Event: Missing Permissions" on Approval

- ✅ The bot's role needs the server-wide **Manage Events** permission — this is separate from the moderation-channel permissions above and isn't something you can grant per-channel
- ✅ Server Settings → Roles → (the bot's role) → enable **Manage Events**, then retry the approval — no restart needed

### CORS Errors

- ✅ Add your website's address to `ALLOWED_ORIGINS` in `.env` (comma-separated for several)
- ✅ Restart the bot after changing environment variables
- ✅ Check browser console for specific CORS errors

### Login Not Working

- ✅ Check `DISCORD_CLIENT_SECRET` is set correctly in `.env`
- ✅ Check the redirect URI in the Discord Developer Portal
- ✅ Logins last 24 hours, and changing `SESSION_SECRET` signs everyone out: log in again
- ✅ Clear browser cookies and try again
- ✅ Check the bot's logs for OAuth errors

## API Endpoints

The bot serves these for the event request system. The tournament setup form and the quotes editor have their own; see [Installation › Web Endpoints](/installation#web-endpoints).

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/guild-config/:guildId` | GET | The server's form settings and guidance (only while event requests are on) |
| `/api/auth/discord` | GET | Start the Discord login |
| `/api/auth/discord/callback` | GET | Discord login callback |
| `/api/auth/session` | GET | Who's logged in |
| `/api/auth/logout` | POST | Log out |
| `/api/channels/:guildId` | GET | The text, voice and stage channels the form can offer |
| `/api/event-request/title-art` | GET | Artwork suggestions for a title (logged-in members only) |
| `/api/event-request/upload-image` | POST | Upload an event image ahead of submission (returns a token) |
| `/api/event-request/fetch-image-url` | POST | Fetch a pasted image URL so the form can crop it |
| `/api/event-request` | POST | Submit an event request (logged-in members only) |
| `/crop/:requestId` | GET | Moderator crop page (signed-token gated) |
| `/crop/:requestId/current-image` | GET | The request's current image (its stored file, or its image link fetched), for pre-loading the cropper |
| `/crop/:requestId/fetch-image-url` | POST | Fetch a pasted image URL for the cropper (signed token, not used up) |
| `/crop/:requestId/save` | POST | Save a moderator's cropped image (single-use signed token) |

## Best Practices

### For Server Admins

- 📝 **Test locally first** before going live
- 🔒 **Keep your client secret secret**: never share it
- 📢 **Share the link** in an announcement channel
- 👀 **Check the moderation queue** regularly: requests nobody answers expire after 7 days
- ⚙️ **Say what you're looking for** in the form's guidance

### For Web Hosting

- 🔐 **Use HTTPS in production**
- 🌐 **Use a domain** your community will recognize
- 💾 **Back up `scripts/domains.json`** and your `.env`
- 🎨 **Pick a theme and logo** that match your server

## Example Setups

### Movie Watch Party Server
```
Server Name: "Friday Horror Nights"
Invite URL: https://discord.gg/horrorlovers
Website: https://horrornights.com
GUILD_ID: '1234567890123456789'
```

Members request horror movies for Friday watch parties.

### Anime Club
```
Server Name: "Anime Watch Party"
Invite URL: https://discord.gg/animewp
Website: https://animewatchparty.com
GUILD_ID: '9876543210987654321'
```

Members request anime screenings for weekly viewings.

## Support

Need help setting this up? Check:

- [Technical Setup Guide](https://github.com/r3volution11/Egg-Shen-Bot/blob/main/EVENT_REQUEST_SETUP.md)
- [Bot Installation](/installation)
- [Configuration Guide](/configuration)
- [GitHub Issues](https://github.com/r3volution11/Egg-Shen-Bot/issues)

::: info Note
Event requests are optional. Everything else in the bot works without them.
:::

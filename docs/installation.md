---
title: Installation Guide - Egg Shen Bot
description: "Install your own copy of Egg Shen Bot: create a Discord application, add your API keys, register the slash commands and start the bot."
---

# Installation

Egg Shen Bot is self-hosted. You create your own Discord application, run the bot on your own computer or server, and use your own API keys. Your copy shares nothing with anyone else's.

::: tip The minimum
A working bot on one Discord server needs Node.js, a Discord application and a TMDB API key. You don't need a domain or a web server.

The web pages are optional and can wait: the [event request form](/features/event-requests), the tournament setup form (`/bracket-setup setup-link`) and the status-quotes editor; [The Web Pages](#the-web-pages) covers what they need. The [event request setup guide](https://github.com/r3volution11/Egg-Shen-Bot/blob/main/EVENT_REQUEST_SETUP.md) covers the form, including one bot serving several Discord servers.
:::

## Quick FAQ

**Q: Which keys do I need?**  
A: A Discord bot token and a TMDB API key. Every other key is optional and adds something. See [API Keys](#api-keys) below.

**Q: Does the bot register its slash commands when it starts?**  
A: No. Run `npm run deploy-commands` once after installing, and again when an update changes a command's options or you add or remove `RAWG_API_KEY` or `BGG_CLIENT_ID`. It's safe to run any time.

**Q: Can I add API keys later?**  
A: Yes. Add the key to `.env` and restart the bot. For `RAWG_API_KEY` or `BGG_CLIENT_ID`, run `npm run deploy-commands` too, because they add `/game` and `/boardgame`.

**Q: How do I know a key works?**  
A: Use a command that needs it. With OMDb working, `/movie query:Alien` shows IMDb, Rotten Tomatoes and Metacritic scores; with Trakt, a Trakt score. Failed lookups are logged to the console, and admins can see recent errors with `/eggshen-logs errors`.

---

## Requirements

- **Node.js** 20 or newer, with npm
- A **Discord account**, to create the bot's application in the [Discord Developer Portal](https://discord.com/developers/applications)
- A **TMDB API key** from [TMDB](https://www.themoviedb.org/settings/api)

## API Keys

### Required

| Service | What it's for | `.env` variable |
|---------|---------------|-----------------|
| **Discord** | The bot itself | `DISCORD_TOKEN`, `DISCORD_CLIENT_ID` |
| **TMDB** | Every movie and TV feature | `TMDB_API_KEY` |

### Optional

| Service | What it adds | `.env` variable |
|---------|--------------|-----------------|
| **OMDb** | IMDb, Rotten Tomatoes and Metacritic scores | `OMDB_API_KEY` |
| **Trakt** | Trakt scores | `TRAKT_CLIENT_ID` |
| **Watchmode** | More where-to-watch services, added to TMDB's | `WATCHMODE_API_KEY` |
| **OpenAI** (paid) | `/image`, AI-written announcements, AI answers in `/eggshen-ask`, `/recommend` picks with reasons, and better search ranking | `OPENAI_API_KEY` |
| **RAWG** | `/game`, `/random game`, and video games in `/similar` and tournaments | `RAWG_API_KEY` |
| **BoardGameGeek** | `/boardgame`, `/random boardgame`, and board games in `/similar` | `BGG_CLIENT_ID` |
| **Google Books** | A bigger daily quota for `/book` (it works without one) | `GOOGLE_BOOKS_API_KEY` |
| **Spotify** | Spotify albums in `/soundtrack`, next to iTunes | `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` |

Only `/game` and `/boardgame` are left out of Discord when their key is missing. Every other command stays: `/random game` and `/random boardgame` say the service isn't set up, `/similar` skips the media it can't search, and results show fewer scores.

The [API Keys guide](/api-keys) walks through getting each one.

## Step-by-Step Installation

### 1. Create the Discord application

1. In the [Discord Developer Portal](https://discord.com/developers/applications), click **New Application**, name it and click **Create**.
2. On **General Information**, copy the **Application ID**. This is `DISCORD_CLIENT_ID`.
3. Open **Bot**, click **Reset Token** and copy the token. This is `DISCORD_TOKEN`. Keep it secret.
4. Under **Privileged Gateway Intents**, leave all three off. The bot works from slash commands, buttons and menus, which don't need them.

::: tip A separate application for a test bot
If you also run a development copy, give it its own Discord application. The bot uploads its card icons to its application's emoji list, so a test bot sharing your live bot's application would upload into it.
:::

### 2. Invite the bot to your server

1. Open **OAuth2 → URL Generator**.
2. Under **Scopes**, check `bot` and `applications.commands`.
3. Under **Bot Permissions**, check these:

| Permission | What the bot uses it for |
|------------|--------------------------|
| View Channels | Seeing the channels it posts in |
| Send Messages | Posting results, cards and announcements |
| Send Messages in Threads | Posting in threads, where the games can be played |
| Embed Links | Every result card |
| Attach Files | Drawn images: the tournament bracket, matchup results and survey charts |
| Read Message History | Finding its own cards again to update them, such as live standings and the siege card |
| Manage Events | Creating Discord events from approved [event requests](/features/event-requests). Skip it if you won't use them |

The bot no longer needs Manage Messages, which earlier versions asked for to clear reactions off surveys (they're voted on with buttons now). If yours has it, you can take it away.

4. Open the generated URL, pick your server and click **Authorize**.

### 3. Get your API keys

At minimum, get a TMDB key. The [API Keys guide](/api-keys) covers TMDB and every optional service. You can add optional keys later.

### 4. Download and install

```bash
git clone https://github.com/r3volution11/Egg-Shen-Bot.git
cd Egg-Shen-Bot
npm install
```

### 5. Configure `.env`

The bot is configured by a `.env` file in the project folder. There's no other config file to edit.

```bash
cp .env.example .env
nano .env  # or your preferred editor
```

Fill in the required values, and any optional keys you have:

```bash
# Required
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_application_id_here
TMDB_API_KEY=your_tmdb_api_key_here

# Optional API keys: leave out any you don't have
OMDB_API_KEY=
TRAKT_CLIENT_ID=
WATCHMODE_API_KEY=
OPENAI_API_KEY=
RAWG_API_KEY=
BGG_CLIENT_ID=
GOOGLE_BOOKS_API_KEY=
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=

# Optional: register commands to one server only (see step 6)
GUILD_ID=
```

`.env.example` has the rest, such as the settings for the web pages. [Every `.env` setting](/api-keys#every-env-setting) explains each one. Settings you leave empty use their defaults.

### 6. Register the slash commands

```bash
npm run deploy-commands
```

The output lists each command, then how many were registered. Without RAWG and BoardGameGeek keys it looks like this:

```
✓ Loaded command: announce
⊘ Skipped command: boardgame (BoardGameGeek API not configured)
✓ Loaded command: book
…
Started refreshing 45 application (/) commands.
✓ Successfully deployed 45 commands globally
```

- **`GUILD_ID` empty:** commands are registered globally, for every server the bot is in. They can take a little while to show up.
- **`GUILD_ID` set** to a server's ID: commands are registered to that server only, and appear at once. This is handy for a test server. The last line then reads `✓ Successfully deployed 45 commands to guild <id>`.

### 7. Start the bot

```bash
npm start
```

Among the startup lines you should see:

```
✓ Logged in as YourBot#1234
✓ Serving 1 guilds
[EmojiKit] Uploading 85 of 85 in the background…
✓ API server listening on port 3000
```

The `[EmojiKit]` lines are the icons on the game cards, leaderboard, siege cards and tournament cards. On its first start the bot uploads them to your application by itself (Developer Portal → your app → **Emojis**), and a minute or so later logs `[EmojiKit] Ready: 85 (85 uploaded)`. Until then, cards use plain emoji. To skip the upload and always use plain emoji, set `EMOJI_SYNC=off` in `.env`. `npm run deploy-emojis` does the same upload by hand (`-- --dry-run` only reports, `-- --prune` removes versions over 30 days old).

The API server is a small web server the bot always starts, on port 3000 unless you set `API_PORT`. It serves the optional web pages and a health check (`curl http://localhost:3000/api/health`). Nothing needs to reach it from outside unless you use the web pages, and even then only your reverse proxy should: see [The Web Pages](#the-web-pages). If another program already uses port 3000, set `API_PORT` to a free port.

`npm start` runs in the foreground and stops when you close the terminal. To keep the bot running on a server, see [Running it on a server](#running-it-on-a-server).

## Verification

In your Discord server:

```
/movie query:The Matrix
/eggshen-help
```

If both answer, the bot is installed. As an admin, `/eggshen-config settings view` shows your server's settings.

## Updating

```bash
git pull
npm install
npm run deploy-commands   # if the update changed any command
```

Then restart the bot. The [changelog](/changelog) lists what each release changed. If you're not sure whether a command changed, run `deploy-commands` anyway.

**Updating from 2.29.0 or earlier?** Run this once, in the bot's folder, before you start the new version:

```bash
node scripts/migrate-website-config.js
```

2.29.1 moved each server's website address and theme to `/eggshen-config-website`, and the bot only looks for them there now. Without the migration nothing warns you: a server that had set them through `/eggshen-config-events` loses its form address and goes back to the `default` theme. The script is safe to run more than once, and leaves alone any server that never set them.

## Troubleshooting

The bot's logs usually say what went wrong: [Logging](/features/logging) has where they are and how to read them.

### Commands don't appear

- Check that you ran `npm run deploy-commands` and that it ended with `✓ Successfully deployed`.
- Check that the invite included the `applications.commands` scope. If not, open a new invite URL with it.
- Reload Discord (Cmd/Ctrl+R). The Discord app caches the command list.
- For a test server, set `GUILD_ID` and run `deploy-commands` again: commands registered to one server appear at once.

### Commands appear twice

Commands registered to one server with `GUILD_ID` and also registered globally show up twice on that server. Remove the server's own copies, keeping the global ones:

```bash
GUILD_ID=<server ID> node delete-guild-commands.js
```

Leave out `GUILD_ID=<server ID>` to use the one in `.env`. Then empty `GUILD_ID` in `.env`, so the next `deploy-commands` registers globally, and reload Discord (Cmd/Ctrl+R).

### Discord says a command is outdated

That's the Discord app's cached copy of the command, not the bot. Reload Discord (Cmd/Ctrl+R). If it persists, run `npm run deploy-commands` again.

### The bot stops right after starting

- Check `DISCORD_TOKEN` in `.env`. A reset token makes the old one stop working.
- Check your Node.js version with `node --version`. It must be 20 or newer.

### Cards show plain emoji instead of the drawn icons

- Look for `[EmojiKit]` lines in the bot's output. `Still missing …` means Discord refused some uploads; the bot tries again after an hour, then less often.
- Check that `EMOJI_SYNC` isn't `off`.
- Don't rename the `es_…` emojis in the Developer Portal. The bot finds them by name.

### API errors

- **TMDB:** use the **API Key**, not the API Read Access Token.
- **OMDb:** activate the key from the email OMDb sends you.
- Check the provider's dashboard for rate limits. Free tiers have daily or monthly caps.

### The bot can't post, or says it's missing permissions

- The bot's role needs the permissions listed in [step 2](#_2-invite-the-bot-to-your-server).
- A channel's own permission settings can block the bot even when its server role is right. This is common in mod-only channels. Check the channel's permissions too.

## Running it on a server

[DEPLOYMENT.md](https://github.com/r3volution11/Egg-Shen-Bot/blob/main/DEPLOYMENT.md) covers running the bot around the clock with PM2: starting it with `ecosystem.config.js`, starting it again after a reboot, reading the logs, and building the web pages' styles. The included `ecosystem.config.js` sets `NODE_ENV=production` (below).

After changing `.env` on a server, restart the bot so it reads the new values. With PM2:

```bash
pm2 restart egg-shen-bot --update-env
```

### NODE_ENV

Set `NODE_ENV=production` on a live server. PM2's `ecosystem.config.js` does it for you; plain `npm start` doesn't, so without PM2 start it with `NODE_ENV=production npm start`. With `production`:

- The event request form's login cookie is only sent over HTTPS
- DEBUG entries aren't written to the log files (see [Logging › Severity Levels](/features/logging#severity-levels))
- A web request that fails in a way the bot doesn't handle itself, such as a malformed request body, gets a bare error message, not one showing the error's internals

With anything else, or nothing, the bot runs as in development: the login cookie works over plain `http://`, as on `localhost`, and every log level is written. Don't use `NODE_ENV=test` outside the test suites: it also opens a route that lets anyone reset their own web rate limits.

### Back Up the Bot's Data

The bot keeps everything in files in its own folder; there's no database. To back it up, or move it to another machine, stop the bot and copy these:

| What | Holds |
|---|---|
| `.env` | Your keys and settings |
| `guild_configs/` | Each server's settings |
| `guild_stats/` | Statistics |
| `guild_watch_history/` | Watch history |
| `guild_watchlists/` | Watchlists |
| `guild_tournaments/` | Tournaments, each with a `.bak` copy |
| `guild_polls/` | Surveys |
| `guild_games/` | Game scores and everything on the game cards |
| `guild_happenings/` | Happenings and sieges |
| `guild_escape/` | Escape Velocity events |
| `active_timers.json` | Running timers |
| `ready_checks.json` | Ready checks |
| `scheduled_announcements.json` | Posts waiting from `/announce schedule` |
| `pending_event_requests.json`, `pending_event_channel_selections.json` | Event requests waiting for a moderator, and channels picked for them |
| `event_request_images/` | Event requests' images |
| `movie_quotes.json`, `movie_quotes_pending.json` | The status quotes, and suggestions waiting for review |
| `scripts/domains.json` | Your event request form's sites, if you've set them up |

You can leave out `logs/` (it only keeps 30 days), `domains/` (`npm run deploy:domain` makes it again) and `docs_embeddings.json` (a cache for `/eggshen-ask`, rebuilt with a few OpenAI calls). Put the copies in a fresh install's folder before its first start, and the bot carries on where it left off. Anything missing starts out empty.

## The Web Pages

Three optional pages are served by the bot's web server, reached through your website's address by a reverse proxy such as nginx. Forward these paths to the bot's port:

| Page | Paths to forward |
|---|---|
| [Event request form](/features/event-requests) (your site hosts the form; the bot answers its calls) and its moderator crop page | `/api/`, `/shared-assets/`, `/crop/`, `/crop-assets/` |
| [Tournament setup form](/commands/brackets/import) | `/tournament-setup` (exactly), `/tournament-setup-assets/`, `/api/`, `/shared-assets/` |
| [Quotes editor](/commands/configuration#the-quotes-editor-page) | `/quotes-admin` (exactly), `/quotes-assets/`, `/api/`, `/shared-assets/` |

A path that isn't forwarded doesn't show an error: the proxy serves your website's own page in its place, which loads fine and does nothing. After adding one, open the page's public address to check. In nginx, the quotes editor's two blocks:

```nginx
location = /quotes-admin {
    proxy_pass http://localhost:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location /quotes-assets/ {
    proxy_pass http://localhost:3000;
    proxy_set_header Host $host;
}
```

The [event request setup](/features/event-requests#step-3-deploy-the-web-form) shows the `/api/` block, and the [setup form's page](/commands/brackets/import#getting-started) the tournament setup ones.

### Keep the Bot's Port Private

The bot counts every web rate limit by the visitor's address: the event request form's, the quotes editor's and the setup form's. It reads that address from `X-Forwarded-For` only when the request comes from a proxy on the same machine (from `127.0.0.1` or `::1`), and then takes the address that proxy added, the last in the list. So `$remote_addr`, as in the examples, and nginx's `$proxy_add_x_forwarded_for` both work. A request from anywhere else has the header ignored and counts by its own address.

- **Run the proxy on the same machine as the bot.** A proxy on another machine, or in another container, isn't trusted: every visitor arrives with the proxy's address, so they all share one limit. A setup like that needs the proxy's address in place of `'loopback'` in `app.set('trust proxy', 'loopback')`, in `src/api/server.js`.
- **Keep the API port (3000 by default) closed to the internet.** Only your proxy should reach it, for example with a firewall rule. The limits are also counted per domain, taken from the request's `Host` header, and a visitor reaching the port directly can change that on every request.

### Web Endpoints

The event request form's endpoints are listed on [Event Requests › API Endpoints](/features/event-requests#api-endpoints). The other two pages use these.

**Quotes editor:**

| Endpoint | Method | What it does |
|---|---|---|
| `/quotes-admin` | GET | The page. It asks for the secret before it loads anything |
| `/quotes-assets/…` | GET | The page's script and styles |
| `/api/quotes-admin-link/exchange` | POST | Swaps a link from `/eggshen-config-quotes admin-link` for access (once, within 10 minutes) |
| `/api/quotes` | GET, POST | The quote list; add a quote |
| `/api/quotes/bulk` | PUT | Replace the whole list (the bulk editor) |
| `/api/quotes/:index` | PUT, DELETE | Change or delete one quote |
| `/api/quotes/pending` | GET | Suggestions waiting for review |
| `/api/quotes/pending/:id/approve`, `/api/quotes/pending/:id/reject` | POST | Approve a suggestion (with edits, if sent) or reject it |

Every `/api/quotes` call has to send `QUOTES_ADMIN_SECRET`, as `Authorization: Bearer <secret>` or as `X-Admin-Secret: <secret>`. A missing or wrong one gets `401 Invalid or missing admin secret`. With no `QUOTES_ADMIN_SECRET` set, every call, the link exchange included, gets `503` "Quote editing is not configured on this server". All of them share a limit of 20 requests a minute per visitor on each domain, which also slows down anyone guessing the secret.

**Tournament setup form:**

| Endpoint | Method | What it does |
|---|---|---|
| `/tournament-setup?token=…` | GET | The page, for the server the link is for |
| `/tournament-setup-assets/…` | GET | The page's script and styles |
| `/api/tournament-setup/state` | GET | The server's current tournament, if any |
| `/api/tournament-setup/parse` | POST | Read an uploaded CSV or JSON file. Nothing is saved |
| `/api/tournament-setup/resolve` | POST | Match the rows to titles |
| `/api/tournament-setup/save` | POST | Create the tournament, or replace one still being set up |
| `/api/tournament-setup/export` | GET | Download the tournament as a JSON backup |

The link from `/bracket-setup setup-link` carries a signed token for one server, good for 60 minutes. The page sends it with each `/api/tournament-setup` call as `X-Setup-Token`; an expired or wrong one gets `403`. `save` also checks that the person the link was made for still has Administrator or Timeout Members. The calls share a limit of 120 a minute per visitor on each domain.

### Themes

The pages' colours come from named themes in `scripts/web-themes.json`. Two come with the bot: `default`, in the colour `WEB_PRIMARY_COLOR` gives (cyan, `#1ac3ff`, without it), and `shudder`, which is red whatever `WEB_PRIMARY_COLOR` says. To add your own:

1. Add an entry with its colour, such as `"midnight": { "primaryColor": "#5b3cc4" }`. A `primaryColor` of `null` uses `WEB_PRIMARY_COLOR`.
2. Run `npm run build:web`, then `npm run deploy:domain -- --all` to refresh your event request sites.
3. Give a server the theme with `/eggshen-config-website theme name:midnight`.

There's nothing to restart: the bot reads the list when it's needed. A server's crop page, setup form and quotes editor links use its theme straight away.

## Trying the Games on a Test Server

A new game card is mostly empty until someone has played for weeks. To see a full one on a test server, `scripts/game-demo.js` fills one member's record with demo data: items in the Glovebox, earned titles, 13 nights in a row, and prizes and titles one play away.

```bash
node scripts/game-demo.js --guild <server ID>                          # list the server's players
node scripts/game-demo.js --guild <server ID> --user <member ID>        # fill in that member
node scripts/game-demo.js --guild <server ID> --user <member ID> --clear  # put their record back
```

It's meant for a test server: it refuses a server where more than three other members have played, unless you add `--force`. Before it writes, it saves the member's real record beside the scores (`guild_games/<server ID>.demo-backup.json`), and `--clear` restores it exactly. The bot can keep running while it does this.

## Next Steps

- [Getting started](/getting-started): your first commands
- [Configure your server](/configuration): who can change what, and the defaults
- [Game settings](/commands/games-settings): limits, channels, happenings and the siege's pace
- [Rate limiting](/features/rate-limiting)
- [Moderation tools](/features/moderation-tools)
- [Statistics](/features/statistics)
- [Logging](/features/logging): the bot's log files, and finding out why something failed
- [Developer Reference](/api/reference): how the code is laid out, for changing or extending your copy

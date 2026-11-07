---
title: Installation Guide - Egg Shen Bot
description: "Install your own copy of Egg Shen Bot: create a Discord application, add your API keys, register the slash commands and start the bot."
---

# Installation

Egg Shen Bot is self-hosted. You create your own Discord application, run the bot on your own computer or server, and use your own API keys. Your copy shares nothing with anyone else's.

::: tip The minimum
A working bot on one Discord server needs Node.js, a Discord application and a TMDB API key. You don't need a domain or a web server.

The web pages are optional and can wait: the [event request form](/features/event-requests), the tournament setup form (`/bracket-setup setup-link`) and the status-quotes editor. The [event request setup guide](https://github.com/r3volution11/Egg-Shen-Bot/blob/main/EVENT_REQUEST_SETUP.md) covers the form, including one bot serving several Discord servers.
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
4. Under **Privileged Gateway Intents**, leave all three off. The bot works from slash commands, buttons and reactions, which don't need them.

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
| Manage Messages | Removing stray reactions on surveys |
| Manage Events | Creating Discord events from approved [event requests](/features/event-requests). Skip it if you won't use them |

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

The API server is a small web server the bot always starts, on port 3000 unless you set `API_PORT`. It serves the optional web pages and a health check (`curl http://localhost:3000/api/health`). Nothing needs to reach it from outside unless you use the web pages. If another program already uses port 3000, set `API_PORT` to a free port.

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

## Troubleshooting

### Commands don't appear

- Check that you ran `npm run deploy-commands` and that it ended with `✓ Successfully deployed`.
- Check that the invite included the `applications.commands` scope. If not, open a new invite URL with it.
- Reload Discord (Cmd/Ctrl+R). The Discord app caches the command list.
- For a test server, set `GUILD_ID` and run `deploy-commands` again: commands registered to one server appear at once.

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

[DEPLOYMENT.md](https://github.com/r3volution11/Egg-Shen-Bot/blob/main/DEPLOYMENT.md) covers running the bot around the clock with PM2: starting it with `ecosystem.config.js`, starting it again after a reboot, reading the logs, and building the web pages' styles. The included `ecosystem.config.js` sets `NODE_ENV=production`, which makes the event request form's login cookie HTTPS-only.

After changing `.env` on a server, restart the bot so it reads the new values. With PM2:

```bash
pm2 restart egg-shen-bot --update-env
```

## Next Steps

- [Getting started](/getting-started): your first commands
- [Configure your server](/configuration): who can change what, and the defaults
- [Game settings](/commands/games-settings): limits, channels, happenings and the siege's pace
- [Rate limiting](/features/rate-limiting)
- [Moderation tools](/features/moderation-tools)
- [Statistics](/features/statistics)

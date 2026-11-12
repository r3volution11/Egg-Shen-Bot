---
description: "How to get every API key Egg Shen Bot uses (Discord, TMDB, OMDb, Trakt, Watchmode, OpenAI, RAWG, BoardGameGeek, Google Books and Spotify) and every .env setting."
---

# API Keys Guide

How to get each API key the bot uses, and what each one adds. Each copy of the bot runs on its owner's keys: if you run the bot, these are your accounts and your bills.

Only Discord and TMDB are required. Everything else is optional and can be added later: put the key in `.env` and restart the bot.

## Overview

| Service | Required | What it adds | `.env` variable | Get a key |
|---------|----------|--------------|-----------------|-----------|
| **Discord** | Yes | The bot itself | `DISCORD_TOKEN`, `DISCORD_CLIENT_ID` | [Developer Portal](https://discord.com/developers/applications) |
| **TMDB** | Yes | Every movie and TV feature | `TMDB_API_KEY` | [TMDB](https://www.themoviedb.org/settings/api) |
| **OMDb** | No | IMDb, Rotten Tomatoes and Metacritic scores | `OMDB_API_KEY` | [OMDb](https://www.omdbapi.com/apikey.aspx) |
| **Trakt** | No | Trakt scores | `TRAKT_CLIENT_ID` | [Trakt](https://trakt.tv/oauth/applications) |
| **Watchmode** | No | More where-to-watch services | `WATCHMODE_API_KEY` | [Watchmode](https://api.watchmode.com/) |
| **OpenAI** | No (paid) | AI images, AI-written text, smarter search | `OPENAI_API_KEY` | [OpenAI](https://platform.openai.com/api-keys) |
| **RAWG** | No | Video games | `RAWG_API_KEY` | [RAWG](https://rawg.io/apidocs) |
| **BoardGameGeek** | No | Board games | `BGG_CLIENT_ID` | [BGG XML API](https://boardgamegeek.com/wiki/page/BGG_XML_API2) |
| **Google Books** | No | A bigger quota for books | `GOOGLE_BOOKS_API_KEY` | [Google Cloud](https://console.cloud.google.com/) |
| **Spotify** | No | Spotify albums in `/soundtrack` | `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | [Spotify for Developers](https://developer.spotify.com/dashboard) |
| **iTunes Search** | No key | Soundtracks | None | Nothing to sign up for |
| **Letterboxd** | No key | Letterboxd scores for movies | None | Nothing to sign up for |

Free tiers, quotas and prices are set by each provider and change over time. Check the provider's site for current limits.

---

## Discord Bot Token

**Used for:** the bot itself. Required.

1. **Create an application.** In the [Discord Developer Portal](https://discord.com/developers/applications), click **New Application**, name it and click **Create**.
2. **Application ID.** On **General Information**, copy the **Application ID** into `.env` as `DISCORD_CLIENT_ID`.
3. **Bot token.** Open **Bot**, click **Reset Token** and copy the token into `.env` as `DISCORD_TOKEN`. Never share it. Anyone with it can run your bot.
4. **Intents.** Under **Privileged Gateway Intents**, leave all three off. The bot doesn't use them.

The [installation guide](/installation#_2-invite-the-bot-to-your-server) covers inviting the bot and the permissions it needs.

### Client secret (event request form only)

The [event request form](/features/event-requests) signs members in with Discord. Only for that:

1. Open **OAuth2** and click **Reset Secret** under **Client Secret**. Copy it into `.env` as `DISCORD_CLIENT_SECRET`.
2. Under **Redirects**, add your callback address, the same one you put in `OAUTH_REDIRECT_URI`. For local testing that's `http://localhost:3000/api/auth/discord/callback`.

`npm run validate-oauth` checks these settings. The [event request setup guide](https://github.com/r3volution11/Egg-Shen-Bot/blob/main/EVENT_REQUEST_SETUP.md) has the rest.

---

## TMDB API Key

**Used for:** every movie and TV feature: `/movie`, `/tv`, `/episode`, `/episode-list`, `/random movie`, `/random tv`, `/random episode`, `/similar`, `/recommend`, title lookups in `/timer` and `/announce`, `/watched`, `/watchlist`, movie and TV tournaments, and Escape Velocity's questions. It also gives the base where-to-watch list. Required.

1. **Create an account** at [themoviedb.org](https://www.themoviedb.org/signup) and verify your email.
2. **Request a key.** In your account settings, open **API** ([direct link](https://www.themoviedb.org/settings/api)) and request a developer key. Accept the terms.
3. **Fill in the form.** For example: application name "Egg Shen Discord Bot", URL `https://github.com/r3volution11/Egg-Shen-Bot`, summary "Discord bot for searching movies and TV shows".
4. **Copy the API Key.** Use the **API Key** (v3), not the API Read Access Token. Add it to `.env` as `TMDB_API_KEY`.

---

## OpenAI API Key

**Used for:**

- **`/image`:** every mode: a prompt, a message, a versus poster of two titles, a tournament matchup, and a member imagined from their profile.
- **AI-written announcements:** `/announce party` and `/announce schedule` write the text when you don't supply `message`.
- **AI answers in `/eggshen-ask`:** written from the docs. Without a key, `/eggshen-ask` shows the best-matching section of the docs as written.
- **`/recommend`:** picks from the candidates and adds a line on why each fits. Without a key you get a plain ranked list.
- **Search ranking:** `/movie`, `/tv`, `/episode`, `/soundtrack` and `/timer` title lookups re-rank TMDB's results by meaning. A description of five or more words that finds nothing by keyword is searched by meaning instead. Without a key, results keep TMDB's keyword order.

**Models the bot uses:** `gpt-image-2.6-sunburst` for images, `gpt-4o-mini` for text, and `text-embedding-3-small` for search ranking and for finding the right docs sections in `/eggshen-ask`.

### Getting a key

1. **Create an account** at [platform.openai.com](https://platform.openai.com/signup). The API needs a payment method.
2. **Add credit** under **Billing**, and set a monthly spending limit there.
3. **Create a key** under [API keys](https://platform.openai.com/api-keys): click **Create new secret key** and copy it (it's shown once). Add it to `.env` as `OPENAI_API_KEY`.

### Cost

Images are where the money goes. The bot counts each image as $0.04 in its own usage figures (`/eggshen-config-ai ai-images view`); check [OpenAI's pricing](https://openai.com/api/pricing/) for the real price. To keep it in check, each server starts with these image limits:

- one image per member every 5 minutes
- 10 images per member a day
- 50 images per server a day

Admins change them with `/eggshen-config-ai ai-images`. See [AI Image Generation](/commands/ai-images).

Text and search ranking cost a small fraction of an image. Each server can switch AI images, AI announcement text and AI answers on or off separately: see [Configuration](/configuration#ai-announcement-text).

---

## Watchmode API Key

**Used for:** where-to-watch lists in `/movie`, `/tv`, `/random`, watch-party announcements and event requests. Optional.

TMDB's where-to-watch data comes from JustWatch and can miss services, especially free ones. With a Watchmode key, the bot adds Watchmode's services to TMDB's list. Without one, or if a Watchmode lookup fails, you get TMDB's list alone.

1. **Sign up** at [api.watchmode.com](https://api.watchmode.com/).
2. **Copy your API key** from the dashboard. Add it to `.env` as `WATCHMODE_API_KEY`.
3. **Watch your usage.** The free plan has a monthly request cap, and the dashboard shows how much you've used.

---

## iTunes Search API

**Used for:** `/soundtrack`. No key, no signup.

`/soundtrack` checks the title with TMDB, then searches iTunes for soundtrack albums, with album art, track lists and Apple Music links. There's nothing to set up.

---

## Spotify API Key

**Used for:** Spotify albums in `/soundtrack`, shown next to the iTunes results. Optional. Without it, `/soundtrack` shows iTunes results only.

1. **Log in** to the [Spotify developer dashboard](https://developer.spotify.com/dashboard). A free Spotify account works.
2. **Create an app.** Give it a name and description. Spotify requires a redirect URI, which the bot never uses; `http://127.0.0.1:8888/callback` works. Under the APIs used, check **Web API**. Save.
3. **Copy the credentials.** In the app's **Settings**, copy the **Client ID**, then click **View client secret** and copy the secret. Add both to `.env`:

```bash
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
```

The bot only reads public catalogue data (the client credentials flow). No member ever signs in to Spotify.

---

## OMDb API Key

**Used for:** IMDb, Rotten Tomatoes (critics) and Metacritic scores in `/movie`, `/tv`, `/episode` and `/random` results. Optional. Without it, IMDb still appears as a link, without a score.

1. **Request a key** at [omdbapi.com](https://www.omdbapi.com/apikey.aspx). Pick the free tier and enter your email and name.
2. **Activate it** with the link in the email OMDb sends you. The key doesn't work until you do.
3. **Add it** to `.env` as `OMDB_API_KEY`.

The free tier has a daily request limit.

---

## Trakt Client ID

**Used for:** Trakt scores in `/movie`, `/tv`, `/episode` and `/random` results. Optional.

1. **Create an account** at [trakt.tv](https://trakt.tv/auth/join).
2. **Create an app** at [trakt.tv/oauth/applications](https://trakt.tv/oauth/applications): click **New Application**. Give it a name and description, and use `urn:ietf:wg:oauth:2.0:oob` as the redirect URI. The bot only reads public data.
3. **Copy the Client ID** (not the Client Secret) into `.env` as `TRAKT_CLIENT_ID`.

---

## RAWG API Key

**Used for:** video games: `/game`, `/random game`, games in `/similar`, video-game tournaments and video games in `/image` versus posters. Optional.

1. **Create an account** at [rawg.io](https://rawg.io/).
2. **Get your key** at [rawg.io/apidocs](https://rawg.io/apidocs) while logged in.
3. **Add it** to `.env` as `RAWG_API_KEY`.

Without this key, `/game` isn't registered and doesn't appear in Discord, and `/random game` says RAWG isn't set up. After adding it, run `npm run deploy-commands` so `/game` appears.

---

## BoardGameGeek Client ID

**Used for:** board games: `/boardgame`, `/random boardgame` and board games in `/similar`. Optional.

The bot sends `BGG_CLIENT_ID` to BoardGameGeek's XML API as a bearer token. To get one:

1. **Create an account** at [boardgamegeek.com](https://boardgamegeek.com/).
2. **Read the [XML API page](https://boardgamegeek.com/wiki/page/BGG_XML_API2)** and follow BoardGameGeek's current instructions for registering an application and getting its token. Approval can take a few days.
3. **Add the token** to `.env` as `BGG_CLIENT_ID`, then run `npm run deploy-commands` so `/boardgame` appears.

Without it, `/boardgame` isn't registered, `/random boardgame` says BoardGameGeek isn't set up, and `/similar` skips board games. Board-game tournaments and `/image` versus posters still try BoardGameGeek without a token, and only work if BoardGameGeek accepts the request.

---

## Google Books API Key

**Used for:** `/book`, `/random book`, books in `/similar`, book tournaments and books in `/image` versus posters. Optional: books work without a key, on Google's shared quota for keyless requests. A key gives your bot a quota of its own.

1. **Create a project** in the [Google Cloud Console](https://console.cloud.google.com/): open the project picker, click **New Project**, name it and click **Create**.
2. **Enable the Books API** under **APIs & Services → Library**.
3. **Create a key** under **APIs & Services → Credentials → Create Credentials → API key**.
4. **Restrict it (recommended).** Edit the key, choose **Restrict key** under API restrictions and pick **Books API**.
5. **Add it** to `.env` as `GOOGLE_BOOKS_API_KEY`.

You can ask for a bigger quota in the Google Cloud Console.

---

## Every .env setting

`.env.example` in the repository lists all of these with comments. Settings you leave empty use the default shown.

### Required

| Variable | What it is |
|----------|------------|
| `DISCORD_TOKEN` | The bot's token, from the Developer Portal's **Bot** page |
| `DISCORD_CLIENT_ID` | The application ID, from **General Information** |
| `TMDB_API_KEY` | Your TMDB API key |

### Optional API keys

`OMDB_API_KEY`, `TRAKT_CLIENT_ID`, `WATCHMODE_API_KEY`, `OPENAI_API_KEY`, `RAWG_API_KEY`, `BGG_CLIENT_ID`, `GOOGLE_BOOKS_API_KEY`, `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`, each described above.

### The bot

| Variable | Default | What it does |
|----------|---------|--------------|
| `GUILD_ID` | empty | When set to a server's ID, `npm run deploy-commands` registers the commands to that server only, where they appear at once. Empty registers them globally |
| `DOCS_URL` | `https://eggshenbot.com` | Where the bot's documentation links point: `/eggshen-help`, `/bracket help`, `/how-to-play`, `/eggshen-ask` and the tournament setup form. Change it only if you publish your own docs (below) |
| `EMOJI_SYNC` | `auto` | `auto` uploads the card icons to your application on startup. `off` uses plain emoji everywhere |
| `API_PORT` | `3000` | The port of the bot's web server, which serves the health check and the optional web pages |

**Publishing your own docs.** These docs are the repository's `docs/` folder, built with VitePress. `npm run docs:dev` serves them locally as you edit, `npm run docs:build` builds the site into `docs/.vitepress/dist`, `npm run docs:preview` serves that build, and `npm run docs:check` checks the built pages' search-engine markup. Host the build anywhere and point `DOCS_URL` at it; the site's own address is also written in `docs/.vitepress/config.js` and `docs/.vitepress/seo.js`. `/eggshen-ask` doesn't need the build: it reads `docs/` itself, so restart the bot to pick up your edits.

### The web pages (optional)

You need these only for the web pages: the event request form, its moderator image-crop page, the tournament setup form (`/bracket-setup setup-link`) and the status-quotes editor.

| Variable | Default | What it does |
|----------|---------|--------------|
| `PUBLIC_BOT_URL` | empty | The bot's own public address, used in the links it posts: the setup form, the crop page and the quotes editor. A server can override it with `/eggshen-config-website bot-url` |
| `DISCORD_CLIENT_SECRET` | empty | Lets the event request form sign members in with Discord |
| `OAUTH_REDIRECT_URI` | `http://localhost:3000/api/auth/discord/callback` | A fallback only. The bot builds each login's callback from the domain the login started on (`https://<that domain>/api/auth/discord/callback`), so register that address in the Developer Portal for every domain the form is on. This is used only when the domain can't be told, which doesn't happen behind a proxy that passes `Host` |
| `FORM_URL` | `http://localhost:8080` | A fallback only: where to send someone after logging in when the domain the login started on can't be told. Normally they go back to that domain |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | Comma-separated addresses allowed to call the bot's web API. Include the form's address |
| `EVENT_CROP_LINK_SECRET` | empty | Signs moderators' image-crop links. The **Crop Image** button appears on event requests only when this is set and the bot has an address (`PUBLIC_BOT_URL`, or the server's own `bot-url`) |
| `SESSION_SECRET` | derived from `DISCORD_CLIENT_SECRET` | Signs the form's login cookie. Changing it signs everyone out |
| `TOURNAMENT_SETUP_LINK_SECRET` | derived from `DISCORD_TOKEN` | Signs tournament setup links. Changing it invalidates every open link |
| `QUOTES_ADMIN_SECRET` | empty | Turns on the status-quotes editor page. Empty leaves it off. See [QUOTES_ADMIN_SETUP.md](https://github.com/r3volution11/Egg-Shen-Bot/blob/main/QUOTES_ADMIN_SETUP.md) |
| `WEB_PRIMARY_COLOR` | `#1ac3ff` | The accent colour of the `default` theme, and of any theme in `scripts/web-themes.json` without a colour of its own (`shudder` has one). Takes effect after `npm run build:web`. See [Themes](/installation#themes) |

To make a secret, run:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The included PM2 config (`ecosystem.config.js`) also sets `NODE_ENV=production`, which makes the form's login cookie HTTPS-only and keeps debug lines out of the logs. See [Installation › NODE_ENV](/installation#node-env) for everything it changes, and [The Web Pages](/installation#the-web-pages) for the paths to forward and why the bot's port should stay closed.

## Security

1. **Never commit `.env`.** It's in `.gitignore` already.
2. **Reset anything that leaks.** Discord: **Reset Token** on the **Bot** page. Other services: make a new key in their dashboard and delete the old one.
3. **Keep `.env` private on the server.** Only the account that runs the bot needs to read it (`chmod 600 .env`).
4. **Restart after changes.** The bot reads `.env` when it starts. With PM2: `pm2 restart egg-shen-bot --update-env`.
5. **Set spending limits** where a service bills you, OpenAI especially.

## Troubleshooting

### "Invalid API key" errors

- **TMDB:** use the API Key (v3), not the API Read Access Token.
- **OMDb:** click the activation link in OMDb's email.
- **Trakt:** use the Client ID, not the Client Secret.
- **RAWG:** your key is on [rawg.io/apidocs](https://rawg.io/apidocs) while you're logged in.

### Commands not appearing

- **Register them:** run `npm run deploy-commands`. Restarting the bot doesn't register commands.
- **Check the output:** `⊘ Skipped command: game (RAWG API not configured)` means that key is missing from `.env`.
- **Reload Discord** (Cmd/Ctrl+R): the Discord app caches the command list. For a test server, set `GUILD_ID` so commands appear at once.

### Rate limit errors

Each provider caps requests, by day or month on free tiers. Check the provider's dashboard, and upgrade or wait for the reset.

### Still having issues?

- [Installation guide](/installation)
- [Getting started](/getting-started)
- Open an issue on [GitHub](https://github.com/r3volution11/Egg-Shen-Bot/issues)

# Egg Shen Bot

> 🎬 A Discord bot for movie and TV communities: search, watch parties, tournaments, games and trivia

Look up movies, TV shows, games, board games and books with ratings from several sites and where to stream them. Run watch parties with timers, ready checks and scheduled announcements. Hold tournament brackets, server-wide games and multi-day trivia events.

**📚 [Full documentation at eggshenbot.com](https://eggshenbot.com/)**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![Discord.js](https://img.shields.io/badge/discord.js-v14-blue)](https://discord.js.org/)

---

## 🚀 Quick Start

- **[Installation](https://eggshenbot.com/installation)**: run your own copy, from creating the Discord application to registering the commands
- **[API Keys](https://eggshenbot.com/api-keys)**: which keys you need, and what each optional one adds
- **[Getting Started](https://eggshenbot.com/getting-started)**: your first commands
- **[Setting Up Your Server](https://eggshenbot.com/configuration)**: who can change settings, and the defaults
- **[Every Command](https://eggshenbot.com/commands/)**: every command

---

## ✨ Features

### 🔍 Search and discovery
`/movie`, `/tv`, `/episode`, `/episode-list`, `/game`, `/boardgame` and `/book`, with scores from IMDb, Rotten Tomatoes, Metacritic, Letterboxd and Trakt, and where to stream, rent or buy in your region, free services included. `/random` picks something, optionally by genre, decade or your streaming services. `/similar` finds related titles, `/recommend` suggests what to watch next from what your server watches, and `/soundtrack` finds the album. **[→ Search](https://eggshenbot.com/commands/search)**

### 🎉 Watch parties
`/timer` times the party, setting the duration from the movie's or episodes' runtime, with pause, resume and a warning before it ends. `/watchparty ready` asks who's ready before you press play. `/announce` posts the announcement, by hand or automatically before a scheduled Discord event, and a "starting soon" card goes up 10 minutes before each event. `/watched` keeps the server's watch history and `/watchlist` what to watch next. **[→ Watch Parties](https://eggshenbot.com/commands/watch-party)**

### 🏆 Tournament brackets
`/bracket-setup` builds a tournament of movies, shows, games, board games or books: a bracket of up to 32 titles, or a group stage of up to 48. Add titles one at a time or from a spreadsheet through a web form, and seed them at random, in your order or by rating. Members vote with buttons, follow live standings, and see each result and the bracket drawn as images. Ties go to a runoff. **[→ Tournaments](https://eggshenbot.com/commands/brackets/)**

### 🎲 Games
`/potion`, `/foodfight`, `/doom` and `/rescue` score points against other members, with streaks, items, prizes, titles, nights in a row, random twists and server-wide happenings. In `/siege` the whole server fights a monster together, over a week by default. See your game card with `/scoreboard` (or right-click a member → Apps → Game card) and the server's with `/leaderboard`. `/how-to-play` explains the rules in Discord. **[→ Games](https://eggshenbot.com/commands/games)**

### 🚀 Escape Velocity
A multi-day genre trivia event in the style of *Who Wants to Be a Millionaire?*: 15 stages, one launch a day, questions built from TMDB. Admins run it with `/escape-setup`; members play with `/escape play`. **[→ Escape Velocity](https://eggshenbot.com/commands/escape-velocity)**

### 📊 Surveys
`/survey` runs polls of up to 10 options with button voting, an optional timer, a runoff for ties and a chart of the results. **[→ Surveys](https://eggshenbot.com/commands/social)**

### 🤖 AI (optional, with your OpenAI key)
`/image` makes images from a prompt, a message, a versus poster of two titles, a tournament matchup or a member's profile. `/announce` can write the announcement text, `/eggshen-ask` answers questions about the bot from its docs, and `/recommend` explains its picks. Each server switches these on or off separately. **[→ AI Images](https://eggshenbot.com/commands/ai-images)** | **[→ Ask the Bot](https://eggshenbot.com/commands/ask)**

### 📝 Event requests (optional)
A web form where members request watch parties, signed in with Discord. Moderators see where each title streams, crop its artwork and approve or deny it, and an approved request becomes a Discord event. **[→ Event Requests](https://eggshenbot.com/features/event-requests)**

### ⚙️ Server admin
Per-server settings with the `/eggshen-config` commands: rating services, region, which commands members can use, rate limits, moderation tools, game settings and AI switches. `/eggshen-stats` and `/stats` show usage. **[→ Configuration](https://eggshenbot.com/commands/configuration)**

---

## 📚 Documentation

The site is grouped the same way: start here, then by what you're doing, then the pages for server admins and for running your own copy.

### Start here

- **[Getting Started](https://eggshenbot.com/getting-started)**: your first commands
- **[Ask the Bot](https://eggshenbot.com/commands/ask)**: `/eggshen-ask` answers from these docs
- **[Every Command](https://eggshenbot.com/commands/)**: every command and its options

### Look it up

- **[Search](https://eggshenbot.com/commands/search)**: `/movie`, `/tv`, `/episode`, `/episode-list`, `/game`, `/boardgame`, `/book`, `/soundtrack`
- **[Discovery](https://eggshenbot.com/commands/#discovery-commands)**: `/random`, `/recommend`, `/similar`
- **[Statistics](https://eggshenbot.com/features/statistics)**: `/stats`, `/eggshen-stats`

### Watch parties

- **[Watch Party Commands](https://eggshenbot.com/commands/watch-party)**: `/timer`, `/watchparty`, `/announce`, `/watched`, `/watchlist`
- **[Watch History](https://eggshenbot.com/features/watch-history)**: the server's watch log
- **[Event Requests](https://eggshenbot.com/features/event-requests)**: the optional web form
- **[What the Bot Posts on Its Own](https://eggshenbot.com/features/notifications)**: restart notices, starting-soon cards and scheduled announcements

### Tournaments and surveys

- **[Tournament quick guides](https://eggshenbot.com/guides/tournaments/)**: the place to start, and the **[Tournament FAQ](https://eggshenbot.com/guides/tournaments/faq)**
- **[How Tournaments Work](https://eggshenbot.com/commands/brackets/)** and the **[Bracket Command Reference](https://eggshenbot.com/commands/brackets/commands)**: `/bracket-setup`, `/bracket`
- **[Surveys & Status Quotes](https://eggshenbot.com/commands/social)**: `/survey`, `/quote`, `/suggest-quote`

### Games and trivia

- **[Games & Scores](https://eggshenbot.com/commands/games)**: `/potion`, `/foodfight`, `/doom`, `/rescue`, `/siege`, `/six-demon-bag`, `/scoreboard`, `/leaderboard`, `/how-to-play`
- **[Games quick guides](https://eggshenbot.com/guides/games/)**: play the games, fight a siege, and the FAQ
- **The rules:** **[Playing & Points](https://eggshenbot.com/commands/games-playing)** (each game's options and lines), **[Your Card & the Leaderboard](https://eggshenbot.com/commands/games-card)**, **[Items, Prizes & Titles](https://eggshenbot.com/commands/games-rewards)**, **[Twists & Happenings](https://eggshenbot.com/commands/games-happenings)**, **[Siege](https://eggshenbot.com/commands/games-siege)**, **[Six-Demon Bag](https://eggshenbot.com/commands/games-magic)**
- **[Settings for Admins](https://eggshenbot.com/commands/games-settings)**: `/eggshen-config-games`, and your server's own lines
- **[Escape Velocity](https://eggshenbot.com/commands/escape-velocity)**: `/escape`, `/escape-setup`

### More

- **[AI Images](https://eggshenbot.com/commands/ai-images)**: `/image`

### Server admins

- **[Setting Up Your Server](https://eggshenbot.com/configuration)**: who can change settings, and the defaults
- **[Every Setting](https://eggshenbot.com/commands/configuration)**: the `/eggshen-config` commands
- **[Moderation Tools](https://eggshenbot.com/features/moderation-tools)**, **[Rate Limiting](https://eggshenbot.com/features/rate-limiting)** and **[Moderation Commands](https://eggshenbot.com/commands/moderation)**: rate limits, member cooldowns and whitelist mode

### Self-hosting

- **[Installation](https://eggshenbot.com/installation)**: run your own copy
- **[API Keys & .env](https://eggshenbot.com/api-keys)**: every key, and every `.env` setting
- **[Logging](https://eggshenbot.com/features/logging)**: the bot's log files
- **[Developer Reference](https://eggshenbot.com/api/reference)**: how the code is laid out, for changing or extending it

### About

- **[Changelog](https://eggshenbot.com/changelog)**: what changed in each release
- **[Acknowledgements](https://eggshenbot.com/acknowledgements)**: credits and thanks

---

## 📦 Quick Installation

**You need:**
- Node.js 20 or newer
- A Discord application and bot token ([Developer Portal](https://discord.com/developers/applications))
- A TMDB API key ([free](https://www.themoviedb.org/settings/api))

```bash
git clone https://github.com/r3volution11/Egg-Shen-Bot.git
cd Egg-Shen-Bot
npm install

cp .env.example .env
# Fill in DISCORD_TOKEN, DISCORD_CLIENT_ID and TMDB_API_KEY

npm run deploy-commands   # registers the slash commands with Discord
npm start
```

The bot doesn't register its commands when it starts: run `npm run deploy-commands` once, and again when an update changes a command.

**`.env`, at minimum:**

```env
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_application_id
TMDB_API_KEY=your_tmdb_api_key
# Optional: OMDB_API_KEY, TRAKT_CLIENT_ID, WATCHMODE_API_KEY, OPENAI_API_KEY,
#           RAWG_API_KEY, BGG_CLIENT_ID, GOOGLE_BOOKS_API_KEY,
#           SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET
```

**[→ Full installation guide](https://eggshenbot.com/installation)** · **[→ Running it on a server with PM2](DEPLOYMENT.md)**

---

## 🏠 Self-Hosting

Every copy of this bot is independent. Following the [installation guide](https://eggshenbot.com/installation), you create your **own** Discord application, run it on your **own** machine with your **own** API keys, and keep your **own** data: server settings, timers, tournaments and scores are files in your copy's folder. There's no shared backend and no central account. The original maintainer has no access to, or control over, your bot.

For the core bot on one Discord server, the installation guide is all you need. The [event request form](https://eggshenbot.com/features/event-requests) is optional and has its own [setup guide](EVENT_REQUEST_SETUP.md), including running it for several Discord servers from one bot.

## 🎨 Building on it

Fork it and make it your own: new commands, other APIs, your own name and look.

- `src/commands/`: slash commands. Each file is picked up automatically; add new ones to `src/commands/help.js` by hand
- `src/services/`: the outside APIs (TMDB, OMDb, RAWG…)
- `src/utils/`: shared helpers
- `public/`: the web pages (event request form, crop page, tournament setup form)
- `docs/`: this documentation site (VitePress)

`npm test` runs the test suite, and `npm run check:commands` checks every command fits Discord's size limit.

Questions or ideas? Open an [issue](https://github.com/r3volution11/Egg-Shen-Bot/issues).

---

## 📄 License

[MIT](LICENSE): free to use, modify and self-host.

---

**[📚 Documentation](https://eggshenbot.com/)** | **[🐛 Report an issue](https://github.com/r3volution11/Egg-Shen-Bot/issues)** | **[📝 Changelog](https://eggshenbot.com/changelog)**

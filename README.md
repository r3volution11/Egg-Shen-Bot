# Egg Shen Bot

> 🎬 Your all-in-one Discord companion for movies, TV, games, books, and watch parties

A feature-rich Discord bot for searching and discovering entertainment across **7 media types** with ratings from multiple trusted sources. Host tournament brackets, create polls, search movies/TV/games/books, track watch history, and bring your entertainment community together.

**📚 [Full Documentation](https://eggshenbot.com/)**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![Discord.js](https://img.shields.io/badge/discord.js-v14-blue)](https://discord.js.org/)

---

## 🚀 Quick Start

New to Egg Shen Bot? Get up and running in minutes:

- **[Installation Guide](https://eggshenbot.com/installation)** - Set up the bot from scratch
- **[Getting Started](https://eggshenbot.com/getting-started)** - First steps and basic usage
- **[Command Reference](https://eggshenbot.com/commands/)** - Complete list of all commands
- **[Configuration](https://eggshenbot.com/configuration)** - Customize the bot for your server
- **[API Keys](https://eggshenbot.com/api-keys)** - Get the API keys you need

---

## ✨ Features

### 🔍 Search & Discovery
Search across movies, TV shows, episodes, video games, board games, and books with rich embeds and multi-source ratings. **[→ Full Details](https://eggshenbot.com/commands/search)**

### 🏆 Tournament Brackets ⭐
**Host comprehensive entertainment tournaments** with flexible group stages (4-12 groups), dynamic wildcards, and single-elimination knockout brackets. Perfect for community competitions! **[→ Bracket Documentation](https://eggshenbot.com/commands/brackets/)**

### 🎲 Games for the Whole Server
`/potion`, `/foodfight`, `/doom` and `/rescue` are games with points, streaks and a DarcyBot-style game card (`/scoreboard`, or right-click a member → Apps → Game card) and leaderboard. Earn prizes and titles, use items from your Glovebox, keep a nights-in-a-row streak, and watch for twists and server-wide happenings. Then fight a `/siege` together: a monster attacks a games channel for a week (or whatever pace the server picks), grabs and poisons fighters, and pays everyone who helped bring it down. `/how-to-play` explains it all in Discord. **[→ Games](https://eggshenbot.com/commands/games)**

### 🎉 Watch Parties
Coordinate viewing events with built-in timers, watch history tracking, and server statistics. **[→ Watch Party Commands](https://eggshenbot.com/commands/watch-party)**

### � Event Requests (Optional)
Let your community submit watch party requests through a web form with Discord OAuth, with your server's own guidance on each field and artwork suggested for each title. Moderators see where each title streams, approve or deny, and approved events are automatically created as Discord Scheduled Events. **[→ Event Request Setup](https://eggshenbot.com/features/event-requests)**

### �🎮 Social & Fun
Interactive polls, AI image generation, and games with points (magic potions, food fights, horror-movie fates and rescues, with a scoreboard and leaderboard), plus soundtrack search to engage your community. **[→ Social Commands](https://eggshenbot.com/commands/social)** | **[→ AI Images](https://eggshenbot.com/commands/ai-images)**

### 📺 Streaming & Links
See where to stream, rent, or buy with TMDB + Watchmode integration. Direct links to IMDb, Letterboxd, Trakt, and more.

### ⚙️ Server Management
Customize permissions, toggle rating services, set region preferences, and configure custom emojis. **[→ Configuration](https://eggshenbot.com/commands/configuration)**

---

## 📚 Documentation

### Essential Guides

- **[Installation](https://eggshenbot.com/installation)** - Complete setup instructions
- **[Getting Started](https://eggshenbot.com/getting-started)** - Your first commands
- **[Configuration](https://eggshenbot.com/configuration)** - Server customization
- **[API Keys](https://eggshenbot.com/api-keys)** - Required and optional API keys

### Command Documentation

- **[Command Index](https://eggshenbot.com/commands/)** - Overview of all commands
- **[Search Commands](https://eggshenbot.com/commands/search)** - `/movie`, `/tv`, `/episode`, `/episode-list`, `/game`, `/boardgame`, `/book`, `/random`, `/similar`
- **[Tournament Brackets](https://eggshenbot.com/commands/brackets/)** - Complete bracket system guide with setup, knockout, and tips
- **[Watch Party](https://eggshenbot.com/commands/watch-party)** - `/timer`, `/watched`, `/announce`
- **[Social Commands](https://eggshenbot.com/commands/social)** - `/potion`, `/foodfight`, `/doom`, `/rescue`, `/survey`, `/soundtrack`
- **[Games & Scores](https://eggshenbot.com/commands/games)** - `/scoreboard`, `/leaderboard`, points, shields and game settings
- **[AI Images](https://eggshenbot.com/commands/ai-images)** - `/image`
- **[Configuration](https://eggshenbot.com/commands/configuration)** - `/eggshen-config`
- **[Moderation](https://eggshenbot.com/commands/moderation)** - `/eggshen-restart`, `/eggshen-stats`

### Features

- **[Moderation Tools](https://eggshenbot.com/features/moderation-tools)** - Admin commands and controls
- **[Rate Limiting](https://eggshenbot.com/features/rate-limiting)** - Built-in cost protection
- **[Statistics](https://eggshenbot.com/features/statistics)** - Track usage and trends
- **[Notifications](https://eggshenbot.com/features/notifications)** - Reminders and alerts
- **[Watch History](https://eggshenbot.com/features/watch-history)** - Track what your community watches

### Additional Resources

- **[API Reference](https://eggshenbot.com/api/reference)** - Technical documentation
- **[Changelog](https://eggshenbot.com/changelog)** - Version history and updates
- **[Acknowledgements](https://eggshenbot.com/acknowledgements)** - Credits and thanks

---

## 📦 Quick Installation

**Prerequisites:**
- Node.js 20.x or higher
- Discord bot token ([Get one here](https://discord.com/developers/applications))
- TMDB API key (required) - [Get free key](https://www.themoviedb.org/settings/api)

**Install:**

```bash
# Clone the repository
git clone https://github.com/r3volution11/Egg-Shen-Bot.git
cd Egg-Shen-Bot

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your tokens and API keys

# Deploy slash commands
npm run deploy-commands

# Start the bot
npm start
```

**Environment Variables:**

```env
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id
TMDB_API_KEY=your_tmdb_api_key
# Optional: WATCHMODE_API_KEY, OMDB_API_KEY, TRAKT_CLIENT_ID, 
#           RAWG_API_KEY, GOOGLE_BOOKS_API_KEY, OPENAI_API_KEY
```

**[→ Full Installation Guide](https://eggshenbot.com/installation)**

---

## 🏠 Self-Hosting

Every instance of this bot is independent. When you follow the [Installation Guide](https://eggshenbot.com/installation), you create your **own** Discord application in your **own** Discord Developer Portal account, run it on your **own** server, and store your **own** data (server settings, timers, tournaments — all in local files/directories your instance controls). There's no shared backend, no central account, and no ongoing connection back to the original project — the original maintainer has no access to, or control over, your bot once it's running.

If you only want the core bot on a single Discord server, the [Installation Guide](https://eggshenbot.com/installation) is all you need — it explicitly calls out the minimum steps and skips anything you don't need. The optional [Event Requests feature](https://eggshenbot.com/features/event-requests) (a public web form for event requests) has its own setup guide, including a pattern for running it across multiple Discord communities from one bot process if you moderate more than one server.

## 🎨 Customization & Building Your Own

Egg Shen Bot is designed to be a **starting point for your own entertainment bot**! Feel free to:

- **Fork and customize** for your specific community needs
- **Add new commands** and features
- **Modify the branding** (bot name, colors, emojis)
- **Integrate new APIs** (music services, streaming platforms, etc.)
- **Extend tournament systems** with your own game types
- **Build on the event request system** for your use cases

The codebase is structured for extensibility:
- `/src/commands/` - Add new slash commands
- `/src/services/` - Integrate new APIs
- `/src/utils/` - Shared utilities and helpers
- `/public/` - Event request web form (fully customizable)
- `/docs/` - VitePress documentation (edit and deploy your own)

**Developer-friendly features:**
- ✅ Clear file structure with separation of concerns
- ✅ Reusable embed builders and formatting utilities
- ✅ Comprehensive example commands showing best practices
- ✅ Built-in error handling and logging
- ✅ Unit tests to ensure stability as you build

**Need help getting started?** Check out the existing commands as templates, or open a [Discussion](https://github.com/r3volution11/Egg-Shen-Bot/discussions) for guidance!

---

## 📄 License

This project is licensed under the [MIT License](LICENSE) — free to use, modify, and self-host, with no strings attached.

---

**[📚 View Full Documentation](https://eggshenbot.com/)** | **[🐛 Report Issues](https://github.com/r3volution11/Egg-Shen-Bot/issues)** | **[💬 Join Discussion](https://github.com/r3volution11/Egg-Shen-Bot/discussions)**

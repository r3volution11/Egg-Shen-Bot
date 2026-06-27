# Egg Shen Bot

> 🎬 Your all-in-one Discord companion for movies, TV, games, books, and watch parties

A feature-rich Discord bot for searching and discovering entertainment across **7 media types** with ratings from multiple trusted sources. Host tournament brackets, create polls, search movies/TV/games/books, track watch history, and bring your entertainment community together.

**📚 [Full Documentation](https://r3volution11.github.io/Egg-Shen-Bot/)**

[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![Discord.js](https://img.shields.io/badge/discord.js-v14-blue)](https://discord.js.org/)

---

## 🚀 Quick Start

New to Egg Shen Bot? Get up and running in minutes:

- **[Installation Guide](https://r3volution11.github.io/Egg-Shen-Bot/installation)** - Set up the bot from scratch
- **[Getting Started](https://r3volution11.github.io/Egg-Shen-Bot/getting-started)** - First steps and basic usage
- **[Command Reference](https://r3volution11.github.io/Egg-Shen-Bot/commands/)** - Complete list of all commands
- **[Configuration](https://r3volution11.github.io/Egg-Shen-Bot/configuration)** - Customize the bot for your server
- **[API Keys](https://r3volution11.github.io/Egg-Shen-Bot/api-keys)** - Get the API keys you need

---

## ✨ Features

### 🔍 Search & Discovery
Search across movies, TV shows, episodes, video games, board games, and books with rich embeds and multi-source ratings. **[→ Full Details](https://r3volution11.github.io/Egg-Shen-Bot/commands/search)**

### 🏆 Tournament Brackets ⭐
**Host comprehensive entertainment tournaments** with flexible group stages (4-12 groups), dynamic wildcards, and single-elimination knockout brackets. Perfect for community competitions! **[→ Bracket Documentation](https://r3volution11.github.io/Egg-Shen-Bot/commands/brackets/)**

### 🎉 Watch Parties
Coordinate viewing events with built-in timers, watch history tracking, and server statistics. **[→ Watch Party Commands](https://r3volution11.github.io/Egg-Shen-Bot/commands/watch-party)**

### 🎮 Social & Fun
Interactive polls, AI image generation, magic potions, and soundtrack search to engage your community. **[→ Social Commands](https://r3volution11.github.io/Egg-Shen-Bot/commands/social)** | **[→ AI Images](https://r3volution11.github.io/Egg-Shen-Bot/commands/ai-images)**

### 📺 Streaming & Links
See where to stream, rent, or buy with TMDB + Watchmode integration. Direct links to IMDb, Letterboxd, Trakt, and more.

### ⚙️ Server Management
Customize permissions, toggle rating services, set region preferences, and configure custom emojis. **[→ Configuration](https://r3volution11.github.io/Egg-Shen-Bot/commands/configuration)**

---

## 📚 Documentation

### Essential Guides

- **[Installation](https://r3volution11.github.io/Egg-Shen-Bot/installation)** - Complete setup instructions
- **[Getting Started](https://r3volution11.github.io/Egg-Shen-Bot/getting-started)** - Your first commands
- **[Configuration](https://r3volution11.github.io/Egg-Shen-Bot/configuration)** - Server customization
- **[API Keys](https://r3volution11.github.io/Egg-Shen-Bot/api-keys)** - Required and optional API keys

### Command Documentation

- **[Command Index](https://r3volution11.github.io/Egg-Shen-Bot/commands/)** - Overview of all commands
- **[Search Commands](https://r3volution11.github.io/Egg-Shen-Bot/commands/search)** - `/movie`, `/tv`, `/episode`, `/episode-list`, `/game`, `/boardgame`, `/book`, `/random`, `/similar`
- **[Tournament Brackets](https://r3volution11.github.io/Egg-Shen-Bot/commands/brackets/)** - Complete bracket system guide with setup, knockout, and tips
- **[Watch Party](https://r3volution11.github.io/Egg-Shen-Bot/commands/watch-party)** - `/watchparty`, `/timer`, `/watched`
- **[Social Commands](https://r3volution11.github.io/Egg-Shen-Bot/commands/social)** - `/potion`, `/survey`, `/soundtrack`
- **[AI Images](https://r3volution11.github.io/Egg-Shen-Bot/commands/ai-images)** - `/image`, `/versus-image`
- **[Configuration](https://r3volution11.github.io/Egg-Shen-Bot/commands/configuration)** - `/eggshen-config`
- **[Moderation](https://r3volution11.github.io/Egg-Shen-Bot/commands/moderation)** - `/eggshen-restart`, `/eggshen-stats`

### Features

- **[Moderation Tools](https://r3volution11.github.io/Egg-Shen-Bot/features/moderation-tools)** - Admin commands and controls
- **[Rate Limiting](https://r3volution11.github.io/Egg-Shen-Bot/features/rate-limiting)** - Built-in cost protection
- **[Statistics](https://r3volution11.github.io/Egg-Shen-Bot/features/statistics)** - Track usage and trends
- **[Notifications](https://r3volution11.github.io/Egg-Shen-Bot/features/notifications)** - Reminders and alerts
- **[Watch History](https://r3volution11.github.io/Egg-Shen-Bot/features/watch-history)** - Track what your community watches

### Additional Resources

- **[API Reference](https://r3volution11.github.io/Egg-Shen-Bot/api/reference)** - Technical documentation
- **[Changelog](https://r3volution11.github.io/Egg-Shen-Bot/changelog)** - Version history and updates
- **[Acknowledgements](https://r3volution11.github.io/Egg-Shen-Bot/acknowledgements)** - Credits and thanks

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

**[→ Full Installation Guide](https://r3volution11.github.io/Egg-Shen-Bot/installation)**

---

## 📄 License

This work is licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).

**You are free to:**
- **Share** — Copy and redistribute the material
- **Adapt** — Remix, transform, and build upon the material

**Under these terms:**
- **Attribution** — Give appropriate credit and link to the license
- **NonCommercial** — You may not use this for commercial purposes
- **ShareAlike** — Distribute your contributions under the same license

See [LICENSE](LICENSE) for full details.

---

**[📚 View Full Documentation](https://r3volution11.github.io/Egg-Shen-Bot/)** | **[🐛 Report Issues](https://github.com/r3volution11/Egg-Shen-Bot/issues)** | **[💬 Join Discussion](https://github.com/r3volution11/Egg-Shen-Bot/discussions)**

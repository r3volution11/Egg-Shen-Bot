---
layout: home
title: Egg Shen Bot - Discord Movie, TV Show, and Gaming Bot
description: Free open-source Discord bot for searching movies, TV shows, video games, and board games with comprehensive ratings from IMDb, Letterboxd, Trakt, and more. Host watch parties with smart timers and track your server's watch history.

hero:
  name: "Egg Shen Bot"
  text: "Your Discord Movie & TV Companion"
  tagline: Search movies, TV shows, games, and host watch parties with comprehensive ratings, links, and moderation tools
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/r3volution11/Egg-Shen-Bot
  image:
    src: /logo.png
    alt: Egg Shen Bot

features:
  - icon: 🎬
    title: Comprehensive Search
    details: Search movies, TV shows, episodes, video games, and board games with ratings from IMDb, Letterboxd, Trakt, Rotten Tomatoes, JustWatch, Metacritic, RAWG, and BoardGameGeek
  
  - icon: ⏱️
    title: Watch Party Features
    details: Channel timers with auto-detection from Discord events, server-level watch history tracking with channel and frequency data
  
  - icon: 🎯
    title: Smart Auto-Detection
    details: Automatically detects movie/show titles from Discord event names to pre-fill timer labels - no manual typing needed
  
  - icon: 🛡️
    title: Advanced Moderation
    details: Comprehensive rate limiting, pattern detection for coordinated abuse, temporary cooldowns, whitelist mode, and auto-ban thresholds
  
  - icon: 📊
    title: Statistics Tracking
    details: Track command usage, popular movies/shows, user activity with configurable tracking per content type
  
  - icon: ⚙️
    title: Highly Configurable
    details: Per-server settings for services, emojis, rate limits, moderation tools, stats tracking, and command permissions

---

## Quick Start

Get Egg Shen Bot running in minutes:

```bash
# Clone and install
git clone https://github.com/r3volution11/Egg-Shen-Bot.git
cd Egg-Shen-Bot
npm install

# Configure your bot
cp .env.example .env
# Edit .env with your Discord bot token and API keys

# Deploy commands and start
node src/deploy-commands.js
npm start
```

[View detailed installation guide →](/installation)

## See It In Action

### Search Movies
Type `/movie title:Inception` and get:
- **Ratings**: IMDb 8.8, Letterboxd 4.3, Trakt 90%, RT 87%
- **Where to Watch**: Available streaming platforms in your region
- **Details**: Runtime, release date, genres, cast, overview
- **Links**: IMDb, TMDB, Letterboxd, Trakt, JustWatch

### Search TV Shows
Type `/tv title:Breaking Bad` to see:
- **Ratings** from all major services
- **Episode count**: 5 seasons, 62 episodes
- **Status**: Whether show is ongoing or ended
- **Streaming platforms** in your region

### Find Episodes
Type `/episode title:Breaking Bad Pilot` for:
- **Episode-specific** ratings and information
- **Season and episode number**
- **Air date** and runtime
- **Synopsis** without spoilers

### Video Games
Type `/game title:The Last of Us` to discover:
- **Ratings** from Metacritic and RAWG
- **Release date** and platforms
- **Genres** and developer info
- **Similar games** based on your search

### Board Games
Type `/boardgame title:Catan` for:
- **BoardGameGeek rating** and rank
- **Player count** and playtime
- **Age recommendation**
- **Game mechanics** and categories

### Smart Features

**Random Picker**  
Type `/random movie` or `/random tv` to get random suggestions. Works with all content types: movies, TV shows, episodes, games, and board games.

**Find Similar Content**  
Type `/similar` after searching for something to get personalized recommendations based on that content. Works across all media types.

**Watch Party Timers**  
Type `/timer start` when creating a Discord event, and the bot automatically detects the movie/show title from the event name and sets up a timer with the correct runtime from TMDB.

## Features at a Glance

### All Search Commands
- `/movie` - Search movies with comprehensive ratings
- `/tv` - Search TV shows with episode info
- `/episode` - Find specific episodes with ratings
- `/game` - Search video games (requires RAWG API)
- `/boardgame` - Search board games (requires BGG API)
- `/random` - Get random suggestions (movies, shows, episodes, games, board games)
- `/similar` - Find similar content recommendations

### Watch Party Tools
- `/timer start` - Smart timers that auto-detect Discord event titles
- `/timer status` - Check all active timers in your server
- `/timer stop` - End a timer manually
- `/watched` - View your server's watch history with frequency data
- Auto-stop timers based on content runtime (with 10-minute buffer)

### Moderation & Admin
- `/eggshen-config` - Comprehensive per-server configuration
- **Rate limiting** with configurable guild-wide limits
- **Pattern detection** for coordinated abuse
- **Temporary cooldowns** and whitelist mode
- **Auto-ban thresholds** with admin notifications
- **Statistics tracking** for command usage and popular content

## Why Choose Egg Shen Bot?

**Egg Shen Bot is a free, open-source Discord bot** that brings comprehensive entertainment search capabilities to your Discord server. Perfect for movie clubs, gaming communities, and any server that loves discussing entertainment.

### What Makes It Special

✅ **Truly All-in-One** - Movies, TV shows, episodes, video games, and board games all in one bot  
✅ **Comprehensive Ratings** - IMDb, Letterboxd, Trakt, Rotten Tomatoes, Metacritic, RAWG, BoardGameGeek  
✅ **Watch Party Ready** - Built-in timers with auto-detection and watch history tracking  
✅ **Smart & Helpful** - Auto-detects titles from Discord events, provides streaming availability  
✅ **Respects Your Server** - Advanced rate limiting and moderation tools included  
✅ **Fully Customizable** - Per-server configuration for services, permissions, and features  
✅ **Open Source & Free** - Self-host, modify, and use however you want

### Perfect For

- **Movie Night Servers** - Search films, coordinate watch parties with timers, track viewing history
- **TV Show Communities** - Find episodes, get ratings, discover similar shows
- **Gaming Servers** - Look up video games and board games with comprehensive ratings
- **Review & Discussion Groups** - Share ratings from multiple sources in one place
- **Entertainment Hubs** - One bot for all your media lookup needs

## Getting Help

- 📖 [Read the Documentation](/getting-started)
- 🐛 [Report Issues](https://github.com/r3volution11/Egg-Shen-Bot/issues)
- 💻 [View Source on GitHub](https://github.com/r3volution11/Egg-Shen-Bot)

Built with ❤️ for Discord communities that love entertainment

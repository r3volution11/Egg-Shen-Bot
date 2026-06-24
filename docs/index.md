---
layout: home
title: Egg Shen Bot - Discord Movie, TV Show, Gaming, and Book Bot
description: Free open-source Discord bot for searching movies, TV shows, video games, board games, and books with comprehensive ratings from IMDb, Letterboxd, Trakt, and more. Host watch parties with smart timers and track your server's watch history.

hero:
  name: "Egg Shen Bot"
  text: "Your Complete Entertainment Search Bot"
  tagline: Search movies, TV shows, games, books, and host watch parties with comprehensive ratings, links, and moderation tools
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
    details: Search movies, TV shows, episodes, video games, board games, and books with ratings from IMDb, Letterboxd, Trakt, Rotten Tomatoes, JustWatch, Metacritic, RAWG, BoardGameGeek, and Google Books. Enhanced streaming availability powered by TMDB + Watchmode API (150+ services including Tubi, Pluto TV, Freevee). Optional AI-enhanced semantic search for better results.
  
  - icon: ⏱️
    title: Watch Party Features
    details: Channel timers with auto-detection from Discord events, server-level watch history tracking with channel and frequency data
  
  - icon: 🎯
    title: Smart Auto-Detection
    details: When you run /timer start in a channel, the bot checks your Discord server's scheduled events and automatically uses the event title for that channel - no manual typing needed
  
  - icon: �
    title: Tournament Brackets
    details: Host movie/TV tournaments with flexible group stage voting (4-12 groups, each with 4 movies). Dynamic wildcard system and single-elimination knockout brackets automatically adapt to tournament size. Perfect for community competitions and championship events.
  
  - icon: 🎪
    title: Social Features
    details: Create surveys & polls with up to 10 options and real-time vote tracking. Send magical potions to users with 78+ pop culture references. Search for movie and TV show soundtracks on iTunes and Spotify.
  
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
- **Where to Watch**: Comprehensive streaming platforms (TMDB + Watchmode) - includes free services like Tubi, Pluto TV, and Freevee
- **Details**: Runtime, release date, genres, cast, overview
- **Links**: IMDb, TMDB, Letterboxd, Trakt, JustWatch

### Search TV Shows
Type `/tv title:Breaking Bad` to see:
- **Ratings** from all major services
- **Episode count**: 5 seasons, 62 episodes
- **Status**: Whether show is ongoing or ended
- **Streaming platforms** in your region

### ⭐ Browse Full Seasons (Unique!)
Type `/episode-list title:Breaking Bad season:3` to get the **entire season at a glance**:
- **All episodes** in one view with titles, ratings, and air dates
- **Find the best episodes** by comparing IMDb and Trakt ratings side-by-side
- **Plan your binge** by seeing which episodes are must-watch vs. skippable
- **No other Discord bot does this!** Perfect for planning watch parties or catching up on shows

### Find Specific Episodes
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

### Books
Type `/book query:Clive Barker Books of Blood` to find:
- **Ratings** from Google Books readers
- **Author information** and publication dates
- **ISBN numbers** for easy lookup
- **Page count** and categories/genres
- **Preview and purchase links** from Google Books
- **Additional links** to Goodreads and Open Library

### Smart Features

**Random Picker**  
Type `/random movie`, `/random tv`, or `/random book` to get random suggestions. Works with all content types: movies, TV shows, episodes, games, board games, and books. Filter by genre, decade, or minimum rating.

**Find Similar Content**  
Type `/similar` after searching for something to get personalized recommendations based on that content. Works across all media types.

**Watch Party Timers**  
Create a Discord scheduled event for a specific channel, then run `/timer start` in that channel. The bot automatically looks up your server's events, detects the event title linked to that channel, and sets up a timer with the correct runtime from TMDB - no manual typing needed!

**Fun Social Interactions**  
Type `/potion give user:@Friend type:health` to send magical potions with fun pop culture references! Choose from 13 potion types - helpful (Health, Mana, Strength, Speed, Love) or harmful (Poison, Weakness, Curse, Slow) - with 78+ unique responses featuring references to LOTR, Harry Potter, Dark Souls, Get Out, The Ring, and more. Admins can add custom responses!

## Features at a Glance

### All Search Commands
- `/movie` - Search movies with comprehensive ratings
- `/tv` - Search TV shows with episode info
- `/episode` - Find specific episodes with ratings
- **`/episode-list` ⭐ - Browse entire seasons at a glance (Unique feature!)**
- `/game` - Search video games (requires RAWG API)
- `/boardgame` - Search board games (requires BGG API)
- `/book` - Search books with Google Books integration
- `/random` - Get random suggestions (movies, shows, episodes, games, board games, books)
- `/similar` - Find similar content recommendations across all media types

### Watch Party Tools
- `/timer start` - Smart timers that auto-detect Discord event titles
- `/timer status` - Check all active timers in your server
- `/timer stop` - End a timer manually
- `/watched` - View your server's watch history with frequency data
- Auto-stop timers based on content runtime (with 10-minute buffer)

### Fun & Social
- `/potion give` - Give magical potions to users (13 types: helpful & harmful)
- `/potion responses` - Manage custom potion responses (admin/mod only)
- 78+ pop culture references from horror, comedy, fantasy, and games

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

✅ **Truly All-in-One** - Movies, TV shows, episodes, video games, board games, and books all in one bot  
✅ **Unique Episode Browser** - `/episode-list` shows entire seasons at once - no other Discord bot does this!  
✅ **Comprehensive Ratings** - IMDb, Letterboxd, Trakt, Rotten Tomatoes, Metacritic, RAWG, BoardGameGeek, Google Books  
✅ **Watch Party Ready** - Built-in timers with auto-detection and watch history tracking  
✅ **Smart & Helpful** - Auto-detects titles from Discord events, provides streaming availability  
✅ **Respects Your Server** - Advanced rate limiting and moderation tools included  
✅ **Fully Customizable** - Per-server configuration for services, permissions, and features  
✅ **Open Source & Free** - Self-host, modify, and use however you want

### Perfect For

- **Movie Night Servers** - Search films, coordinate watch parties with timers, track viewing history
- **TV Show Communities** - Browse entire seasons with `/episode-list`, find best episodes, get ratings, discover similar shows
- **Gaming Servers** - Look up video games and board games with comprehensive ratings
- **Book Clubs** - Search books by title or author, find similar reads, get ISBNs and ratings
- **Review & Discussion Groups** - Share ratings from multiple sources in one place
- **Entertainment Hubs** - One bot for all your media lookup needs

## Getting Help

- 📖 [Read the Documentation](/getting-started)
- 🐛 [Report Issues](https://github.com/r3volution11/Egg-Shen-Bot/issues)
- 💻 [View Source on GitHub](https://github.com/r3volution11/Egg-Shen-Bot)

Built with ❤️ for Discord communities that love entertainment

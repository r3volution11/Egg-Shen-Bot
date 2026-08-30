---
layout: home
title: Egg Shen Bot - Discord Movie, TV Show, Gaming, and Book Bot
description: Free open-source Discord bot for searching movies, TV shows, video games, board games, and books with comprehensive ratings from IMDb, Letterboxd, Trakt, and more. Host watch parties with smart timers, run tournaments, generate AI images, and collect event requests with a public web form.

hero:
  name: "Egg Shen Bot"
  text: "Your Complete Entertainment Search Bot"
  tagline: Search movies, TV shows, games, and books, host watch parties with smart timers, run tournaments, generate AI images, and let your community request events through a public web form
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
    details: Channel timers with auto-detection from Discord events, multi-episode timer support, pause/resume, AI-generated announcement text, and server-level watch history tracking with channel and frequency data
  
  - icon: 🎯
    title: Smart Auto-Detection
    details: When you run /timer start in a channel, the bot checks your Discord server's scheduled events and automatically uses the event title for that channel - no manual typing needed. If the detected title doesn't match cleanly, a Search button lets you correct it on the spot
  
  - icon: 🏆
    title: Tournament Brackets
    details: Host comprehensive tournaments with flexible group stage voting (4-12 groups, 16-48 participants). Smart wildcard system, regional knockout brackets (1A, 2B labels), and three opening modes (entire round, by region, or individual matchups). Generate AI-powered versus images. Perfect for community competitions! [Full Tournament Guide →](/commands/brackets/)

  - icon: 📅
    title: Event Requests
    details: Let your community submit watch party ideas through a public web form with Discord login gated to your server's own members. Moderators approve or deny with one click in Discord, and approved requests become real Discord Scheduled Events automatically - image upload with in-browser cropping included.

  - icon: 🎨
    title: AI Image Generation
    details: Generate AI images from a freeform prompt, a Discord message, or a head-to-head "versus" battle poster between two titles (movies, shows, games, board games, even books). Works from active tournament matchups too.

  - icon: 🎪
    title: Social Features
    details: Create surveys & polls with up to 10 options, live vote updates, and auto-close timers. Send magical potions to users with 78+ pop culture references. Search for movie and TV show soundtracks on iTunes and Spotify. Generate AI-written watch party announcements.
  
  - icon: 🛡️
    title: Advanced Moderation
    details: Comprehensive rate limiting, pattern detection for coordinated abuse, temporary cooldowns, whitelist mode, and auto-ban thresholds
  
  - icon: 📊
    title: Statistics Tracking
    details: Track command usage, popular movies/shows, user activity with configurable tracking per content type
  
  - icon: ⚙️
    title: Highly Configurable
    details: Per-server settings for services, emojis, rate limits, moderation tools, stats tracking, timer behavior, event requests, and command permissions

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

### 🏆 Tournament Brackets
Host comprehensive tournaments for your community! **[View Full Tournament Guide →](/commands/brackets/)**

**Example Tournament Flow:**
1. **Create**: `/bracket create name:"The Movie Cup" max-titles:36`
2. **Add Titles**: `/bracket manage-titles action:"Add Title" group:A type:movie title:"The Thing"` (repeat for each title across all groups)
3. **Announce**: `/bracket announce` - Publicly announce the tournament with full details
4. **Group Voting**: `/bracket open-groups groups:"A,B,C,D"` - Let everyone vote on their favorites
5. **Advance**: `/bracket advance-knockout duration:"24h"` - Generate bracket and start voting
6. **Next Rounds**: After a round closes, use `/bracket open` to smart-open the next one
7. **Champion**: Winner is crowned automatically!

**Tournament Features:**
- **Flexible Sizes**: 4-12 groups (16-48 participants total)
- **Smart Wildcards**: Automatically calculated based on tournament size
- **Regional System**: Organized left/right bracket with 1A, 2B labels
- **Three Opening Modes**: Open entire rounds, by region, or individual matchups
- **Automatic Tiebreakers**: Tied votes trigger a short voting round, resolved automatically when it ends
- **AI Versus Images**: Generate custom matchup posters with `/image matchup:"..."`
- **Visual Brackets**: Create professional bracket tree images
- **Persistent Storage**: Tournament survives bot restarts
- **Five Detailed Guides**: Setup, Knockout, Commands, Tips, and Quick Start

**Perfect for community competitions and championship events!**  
[Quick Start Guide](/commands/brackets/#quick-start-guide) • [Setup Guide](/commands/brackets/setup) • [Knockout Guide](/commands/brackets/knockout) • [Command Reference](/commands/brackets/commands) • [Tips & Strategies](/commands/brackets/tips)

### 📅 Event Requests — Let Your Community Propose Watch Parties

Most Discord bots stop at commands typed inside Discord. Egg Shen Bot also ships a **public web form** your community can submit event ideas through — no Discord client required to fill it out, but Discord *is* required to prove they belong. **[Full setup guide →](/features/event-requests)**

**How it works:**
1. **A community member visits your form** at your own domain (e.g. `events.yourserver.com`)
2. **They log in with Discord** — OAuth authentication, no passwords stored
3. **The bot checks they're actually a member of your server** before letting them submit anything — non-members get a friendly error with an invite link instead
4. **They fill out title, description, an optional cover image (with an in-browser crop tool), and a time** — channel assignment can be left to moderators (Simple Mode) or picked by the user from an admin-defined whitelist (Advanced Mode)
5. **The request lands in your moderation channel** with Approve / Edit / Deny buttons
6. **One click approval automatically creates a real Discord Scheduled Event** — cover image, channel, and time all set

**Why it's different:**
- **Public-facing, but never open to strangers** — anyone can load the page, but only your server's own members can submit, enforced twice (at login and again at submission)
- **Zero manual event creation** — approving a request *is* creating the Discord event, not a reminder to go create one
- **Built-in image tooling** — upload-and-crop on the submission form, plus a separate moderator-only crop/replace link for fixing images after the fact
- **Rate-limited and self-cleaning** — spam protection on submissions and uploads, with old uploaded images automatically pruned

**Perfect for servers that want event scheduling to feel like a real submission process, not a chat message that gets lost in scroll.**

### 🎨 AI Image Generation

Generate AI images without leaving Discord, in whichever of four modes fits the moment:

- **Freeform**: `/image prompt:"a dragon flying over a medieval castle at sunset"`
- **From a message**: `/image message:username` — turns a recent message's text into an image prompt
- **Versus battle**: `/image title1:"The Thing" title2:"Alien"` — a split-screen matchup poster between any two titles (movies, TV, games, board games, or books — mix and match types)
- **Tournament matchup**: `/image matchup:"The Thing vs Alien"` — generate straight from an active bracket matchup

Titles are validated against TMDB, RAWG, BoardGameGeek, and Google Books before generating, so you get a real matchup poster, not a guess. Server admins can restrict access to mods/admins only and set daily generation limits.

### Smart Features

**Random Picker**  
Type `/random movie`, `/random tv`, or `/random book` to get random suggestions. Works with all content types: movies, TV shows, episodes, games, board games, and books. Filter by genre, decade, or minimum rating.

**Find Similar Content**  
Type `/similar` after searching for something to get personalized recommendations based on that content. Works across all media types.

**Watch Party Timers**  
Create a Discord scheduled event for a specific channel, then run `/timer start` in that channel. The bot automatically looks up your server's events, detects the event title linked to that channel, and sets up a timer with the correct runtime from TMDB or BoardGameGeek - no manual typing needed! If the detected title doesn't match anything cleanly, a **Search** button lets you retype it on the spot instead of starting under the wrong name. Multi-episode watch parties (e.g. "Tales from the Crypt S5E5-E8") are recognized automatically, with each episode's runtime summed into the total. Timers can be paused and resumed without losing elapsed time.

**AI Watch Party Announcements**  
Type `/announce title1:"Hellraiser" time:"8:00 PM EST" tone:Scary` to get AI-written promotional text for your watch party, pulling in the real plot and streaming availability so it's about the actual movie, not generic filler. Copy-paste ready — the bot never posts it for you.

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
- `/soundtrack` - Search movie/TV soundtracks on iTunes and Spotify
- `/random` - Get random suggestions (movies, shows, episodes, games, board games, books)
- `/similar` - Find similar content recommendations across all media types

### Watch Party Tools
- `/timer start` - Smart timers that auto-detect Discord event titles, movies, TV shows, and board games
- `/timer status` / `/timer check` - Check the active timer in your server
- `/timer pause` / `/timer resume` - Pause and resume without losing elapsed time
- `/timer adjust` / `/timer autostop` - Change duration or toggle auto-stop
- `/timer stop` - End a timer manually
- `/timer remind` - Announce that the timer's about to start, with poster and event details
- `/announce` - Generate AI-written watch party promo text (Admin/Moderator only)
- `/watchparty remind` - Announce a scheduled watch party is starting
- `/watched add` / `/watched history` - Log and browse your server's watch history with frequency data
- Auto-stop timers based on content runtime (with 10-minute buffer)

### Tournaments & Social
- `/bracket` - Full tournament system: group stages, knockout brackets, wildcards, tiebreakers
- `/survey create` / `/list` / `/results` / `/close` / `/delete` - Polls with up to 10 options, live results, and optional auto-close
- `/potion give` - Give magical potions to users (13 types: helpful & harmful)
- `/potion responses` - Manage custom potion responses (admin/mod only)
- 78+ pop culture references from horror, comedy, fantasy, and games

### AI Image Generation
- `/image` - Freeform prompts, message-based prompts, versus battles, or tournament matchup art
- Rate-limited per user and per server, with admin/mod-only restriction available

### Event Requests
- Public web form with Discord OAuth login, gated to your server's actual membership
- Image upload with in-browser cropping (plus a moderator-only crop/replace tool)
- Approve / Edit / Deny buttons in a Discord moderation channel
- Approved requests automatically become Discord Scheduled Events
- Fully configurable via `/eggshen-config event-requests` - [see the full guide →](/features/event-requests)

### Moderation & Admin
- `/eggshen-config` - Comprehensive per-server configuration
- `/eggshen-stats` / `/stats` - Usage statistics for admins and everyone else
- `/eggshen-logs` - View bot activity logs (Admin only)
- `/eggshen-restart` - Restart the bot (Admin/Moderator only, requires PM2)
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
✅ **Watch Party Ready** - Built-in timers with auto-detection, pause/resume, multi-episode support, and watch history tracking  
✅ **Goes Beyond Discord** - A public, Discord-gated web form lets your community submit event requests without needing bot commands, and moderators approve them into real Discord Scheduled Events with one click  
✅ **AI-Powered** - Generates watch party announcement text and versus-battle poster art on demand  
✅ **Smart & Helpful** - Auto-detects titles from Discord events, provides streaming availability  
✅ **Respects Your Server** - Advanced rate limiting and moderation tools included  
✅ **Fully Customizable** - Per-server configuration for services, permissions, timers, event requests, and features  
✅ **Open Source & Free** - Self-host, modify, and use however you want

### Perfect For

- **Movie Night Servers** - Search films, coordinate watch parties with timers, track viewing history, let members request event nights through the web form
- **TV Show Communities** - Browse entire seasons with `/episode-list`, find best episodes, get ratings, discover similar shows
- **Gaming Servers** - Look up video games and board games with comprehensive ratings
- **Book Clubs** - Search books by title or author, find similar reads, get ISBNs and ratings
- **Review & Discussion Groups** - Share ratings from multiple sources in one place, run tournament brackets to crown community favorites
- **Larger Communities** - Offload event scheduling to a public form with moderator approval instead of manual coordination in chat
- **Entertainment Hubs** - One bot for all your media lookup needs

## Getting Help

- 📖 [Read the Documentation](/getting-started)
- 🐛 [Report Issues](https://github.com/r3volution11/Egg-Shen-Bot/issues)
- 💻 [View Source on GitHub](https://github.com/r3volution11/Egg-Shen-Bot)

Built with ❤️ for Discord communities that love entertainment

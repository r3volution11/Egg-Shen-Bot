---
layout: home

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
  
  - icon: 🛡️
    title: Advanced Moderation
    details: Comprehensive rate limiting, pattern detection for coordinated abuse, temporary cooldowns, whitelist mode, and auto-ban thresholds
  
  - icon: 📊
    title: Statistics Tracking
    details: Track command usage, popular movies/shows, user activity with configurable tracking per content type
  
  - icon: 🔔
    title: Smart Notifications
    details: Automated watch party reminders and timer notifications synced with Discord scheduled events
  
  - icon: ⚙️
    title: Highly Configurable
    details: Per-server settings for services, emojis, rate limits, moderation tools, stats tracking, and command permissions

---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/r3volution11/Egg-Shen-Bot.git

# Install dependencies
npm install

# Configure your bot
cp config/config.example.json config/config.json
# Edit config.json with your tokens

# Start the bot
npm start
```

## Features at a Glance

### Search Commands
- `/movie` - Search movies with ratings and streaming links
- `/tv` - Search TV shows with ratings
- `/episode` - Search specific episodes
- `/game` - Search video games and board games

### Watch Party Tools
- `/timer` - Channel timers that auto-detect Discord events
- `/watched` - Server-level watch history tracking
- `/random` - Random content picker with filters

### Moderation & Admin
- `/eggshen-config` - Comprehensive server configuration
- Rate limiting with guild-wide limits
- Pattern detection for coordinated abuse
- Temporary cooldowns and whitelist mode
- Auto-ban threshold notifications

### Community Features
- `/similar` - Find similar content recommendations
- `/stats` - View server statistics
- Watch history with channel tracking

## Why Egg Shen Bot?

Perfect for movie/TV/gaming Discord communities:

✅ **All-in-One** - Movies, TV, games, and board games in one bot  
✅ **Watch Parties** - Built-in timers and history tracking  
✅ **Anti-Abuse** - Comprehensive rate limiting and moderation  
✅ **Configurable** - Per-server customization of everything  
✅ **Open Source** - Self-host and customize as needed

## Popular Use Cases

- **Movie Night Servers** - Track what you watch together
- **Gaming Communities** - Search games and track playtime
- **Review Servers** - Share ratings and recommendations
- **Watch Party Groups** - Coordinate viewing with timers
- **General Entertainment** - One bot for all media lookups

## Support & Development

- [GitHub Repository](https://github.com/r3volution11/Egg-Shen-Bot)
- [Documentation](/getting-started)
- [Report Issues](https://github.com/r3volution11/Egg-Shen-Bot/issues)

Built with ❤️ for Discord communities

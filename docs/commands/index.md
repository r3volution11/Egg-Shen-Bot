---
title: Commands Reference - Egg Shen Bot
description: Complete slash commands reference for Egg Shen Bot. Search movies, TV shows, episodes, video games, board games, and manage watch parties with timers and history.
---

# Commands Overview

**Egg Shen Bot provides comprehensive slash commands** for searching entertainment media, hosting watch parties, and managing your server's settings. All commands use Discord's native slash command interface for easy discovery and autocomplete.

## Quick FAQ

**Q: Why don't I see all the commands?**  
A: Commands appear based on configured API keys. Missing APIs = those commands won't show up.

**Q: How do I use slash commands?**  
A: Type `/` in Discord and start typing the command name. Discord will show autocomplete options.

**Q: Can I restrict who uses certain commands?**  
A: Yes! Use Discord's built-in command permissions system or configure per-command restrictions via `/eggshen-config`.

**Q: Do commands work in DMs?**  
A: Most search commands work in DMs. Server-specific features (timers, watch history, config) require a server.

**Q: What happens if a movie/show isn't found?**  
A: The bot will show a "not found" message. Try different spelling, year, or check TMDB to see if it exists.

---

# Commands Overview

Egg Shen Bot provides comprehensive slash commands for searching media, hosting watch parties, and server management.

## Search Commands

### `/movie`
Search for movies with comprehensive ratings and links.

**Options:**
- `title` (required) - Movie title to search for

**Features:**
- Ratings from IMDb, Letterboxd, Trakt, Rotten Tomatoes
- Streaming availability via JustWatch
- Release date, runtime, genres
- Overview and poster
- Configurable services per server

**Example:**
```
/movie title:The Matrix
```

[Learn more →](/commands/search#movie)

---

### `/tv`
Search for TV shows with ratings and episode information.

**Options:**
- `title` (required) - TV show title to search for

**Features:**
- Similar to movies but for TV shows
- Episode count and season information
- First air date and status (ongoing/ended)
- Network information

**Example:**
```
/tv title:Breaking Bad
```

[Learn more →](/commands/search#tv)

---

### `/episode`
Search for specific TV show episodes.

**Options:**
- `title` (required) - TV show title
- `season` (required) - Season number
- `episode` (required) - Episode number

**Features:**
- Episode-specific ratings
- Air date
- Episode title and overview
- Still image from the episode

**Example:**
```
/episode title:The Last of Us season:1 episode:1
```

[Learn more →](/commands/search#episode)

---

### `/episode-list`
View all episodes from a complete season.

**Options:**
- `title` (required) - TV show title
- `season` (required) - Season number

**Features:**
- Compact multi-column layout
- Clickable IMDb links for each episode
- Air dates and ratings
- Handles large seasons efficiently

**Example:**
```
/episode-list title:Breaking Bad season:5
```

[Learn more →](/commands/search#episode-list)

---

### `/game`
Search for video games or board games.

**Options:**
- `title` (required) - Game title to search for

**Features:**
- Video game support via RAWG API
- Board game support via BoardGameGeek
- Metacritic scores
- Platform information
- Release dates

**Example:**
```
/game title:The Last of Us
/game title:Wingspan
```

[Learn more →](/commands/search#game)

---

### `/book`
Search for books with comprehensive information.

**Options:**
- `query` (required) - Book title or author to search for

**Features:**
- Google Books integration
- Author information
- ISBN-13 and ISBN-10
- Page counts and publication dates
- Ratings from Google Books
- Categories and genres
- Preview and purchase links
- Links to Goodreads and Open Library

**Example:**
```
/book query:Clive Barker Books of Blood
```

[Learn more →](/commands/search#book)

---

## Watch Party Commands

### `/timer`
Start, stop, or check channel-specific timers.

**Subcommands:**
- `/timer start` - Start a timer in the current channel
- `/timer stop` - Stop the active timer
- `/timer status` - Check timer status

**Features:**
- **Auto-stop timers:** Set duration (1-600 min) for automatic stop
- **Runtime auto-detection:** Detects runtime from TMDB with 10-min buffer
- **Smart selection:** Shows menu when multiple TMDB matches found
- Auto-detects Discord scheduled events
- Optional custom labels
- One timer per channel
- Persists across bot restarts
- Watch history integration

**Example:**
```
/timer start label:Movie Night duration:120
/timer stop
/timer status
```

[Learn more →](/commands/watch-party#timer)

---

### `/watched`
Log and view server watch party history.

**Subcommands:**
- `/watched add` - Manually log a watch party
- `/watched history` - View server watch history

**Features:**
- Server-level watch tracking
- Channel tracking
- Notes support
- Frequency tracking
- Filter by type (movies/TV)

**Example:**
```
/watched add title:Hereditary notes:Annual horror night!
/watched history filter:movies limit:20
```

[Learn more →](/commands/watch-party#watched)

---

## Utility Commands

### `/random`
Get random movie, TV show, episode, game, board game, or book with filters.

**Subcommands:**
- `/random movie` - Random movie with genre/decade/rating filters
- `/random tv` - Random TV show with genre/decade/rating filters
- `/random episode` - Random episode from a specific show
- `/random game` - Random video game with genre/platform/rating filters
- `/random boardgame` - Random board game with category/rating filters
- `/random book` - Random book with subject/decade/rating filters

**Example:**
```
/random movie genre:horror min-rating:7
/random book subject:horror decade:1980s
```

---

### `/similar`
Find similar content recommendations.

**Options:**
- `title` (required) - Title to find similar content for
- `type` (optional) - movie, tv, game, boardgame, or book (searches all if not specified)

**Example:**
```
/similar title:The Matrix type:movie
/similar title:Dracula type:book
```

---

### `/stats`
View server statistics (Admin/Moderator only).

**Options:**
- `filter` - all-time, this-month, this-week, today

**Features:**
- Command usage statistics
- Most searched content
- User activity breakdown
- Configurable tracking

**Example:**
```
/stats filter:this-month
```

[Learn more →](/features/statistics)

---

## Admin Commands

### `/eggshen-config`
Comprehensive server configuration (Admin/Moderator only).

**Major Subcommands:**
- `view` - View current configuration
- `toggle` - Enable/disable services
- `emoji` - Set custom emojis
- `rate-limit-*` - Configure rate limiting
- `moderation-*` - Configure moderation tools
- `stats-toggle` - Configure statistics
- `commands-toggle` - Enable/disable commands

**Example:**
```
/eggshen-config settings view
/eggshen-config rate-limit toggle enabled:true
/eggshen-config moderation toggle enabled:true
```

[Learn more →](/commands/configuration)

---

### `/help`
Display help information and available commands.

---

## Command Categories

| Category | Commands |
|----------|----------|
| **Search** | `/movie`, `/tv`, `/episode`, `/episode-list`, `/game` |
| **Watch Parties** | `/timer`, `/watched` |
| **Discovery** | `/random`, `/similar` |
| **Statistics** | `/stats` |
| **Configuration** | `/eggshen-config` |
| **Help** | `/help` |

## Command Permissions

- **Everyone:** Search, timer, watched add, random, similar
- **Admin/Mod:** stats, eggshen-config, watched from timer (or timer starter)

[Learn about moderation →](/features/moderation-tools)

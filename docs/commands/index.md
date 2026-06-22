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
Get random movie, TV show, episode, or game with filters.

**Options:**
- `type` (required) - movie, tv-show, episode, or game
- `genre` (optional) - Filter by genre
- `min-rating` (optional) - Minimum rating (1-10)
- `year` (optional) - Specific year

**Example:**
```
/random type:movie genre:horror min-rating:7
```

---

### `/similar`
Find similar content recommendations.

**Options:**
- `title` (required) - Title to find similar content for
- `type` (required) - movie, tv, or game

**Example:**
```
/similar title:The Matrix type:movie
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

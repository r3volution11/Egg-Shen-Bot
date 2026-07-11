---
title: Commands Reference - Egg Shen Bot
description: Complete slash commands reference for Egg Shen Bot. Search movies, TV shows, episodes, video games, board games, and manage watch parties with timers and history.
head:
  - - meta
    - property: og:title
      content: Commands Reference - Egg Shen Bot
  - - meta
    - property: og:description
      content: Complete slash commands reference for searching movies, TV shows, games, books, hosting tournaments, watch parties, and more.
  - - meta
    - property: og:url
      content: https://eggshenbot.com/commands/
  - - meta
    - name: twitter:title
      content: Commands Reference - Egg Shen Bot
  - - meta
    - name: twitter:description
      content: Complete slash commands reference for Egg Shen Bot. 20+ commands for entertainment searches.
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

## Tournament Commands

### `/bracket`
Host comprehensive tournaments for movies, TV shows, video games, board games, or books.

**Key Subcommands:**
- `help` - **🆕 Comprehensive tournament guide** (All members)
- `create` - Create new tournament (Admin/Mod)
- `manage-titles` - Add or remove titles from groups (Admin/Mod)
- `open` - **🆕 Smart:** Auto-opens next round based on phase (Admin/Mod)
- `close` - **🆕 Smart:** Auto-closes current round and advances (Admin/Mod)
- `open-groups` - Open specific groups for voting (Admin/Mod)
- `close-groups` - Close specific groups (Admin/Mod)
- `advance-knockout` - Generate knockout bracket (Admin/Mod)
- `resolve-tiebreaker` - **🆕** Manually resolve ties (Admin/Mod)
- `open-matchup` - Open specific matchup(s) (Admin/Mod)
- `close-matchup` - Close specific matchup(s) (Admin/Mod)
- `status` - View tournament progress (All members)
- `my-votes` - View your voting history (All members)
- `view` - Generate visual bracket image (All members)
- `export` - Export results as JSON/Markdown (All members)
- `cancel` - Cancel tournament (Admin/Mod)

**Features:**
- **Button-based voting**: No commands needed - just click to vote!
- **Smart phase detection**: Commands automatically detect tournament phase
- **Automatic tiebreakers**: Creates short voting rounds when ties occur
- **Valid tournament sizes**: 2, 4, 8, 16, 32 (bracket mode) or 36, 40, 44, 48 (group mode)
- **Auto-detection**: Bot automatically chooses bracket or group mode based on size
- Group stage: Members vote for top 2 per group via buttons
- Dynamic wildcards: Auto-calculated to reach power-of-2 bracket
- 4-region knockout bracket (March Madness style)
- Visual bracket display with live vote counts
- Complete vote tracking and history

**Example:**
```
/bracket help
/bracket create name:Horror Movie Madness max-titles:32
/bracket manage-titles action:add group:A type:movie
/bracket open duration:24h
/bracket close tiebreaker-duration:30m
/bracket status
/bracket view
```

[Learn more →](/commands/brackets/)

---

## Watch Party Commands

### `/timer`
Start, stop, or check channel-specific timers.

**Subcommands:**
- `/timer start` - Start a timer in the current channel
- `/timer pause` - Pause the active timer, freezing elapsed/remaining time
- `/timer resume` - Resume a paused timer
- `/timer stop` - Stop the active timer
- `/timer status` - Check timer status
- `/timer remind` - Announce timer is starting (with event auto-detection)

**Features:**
- **Auto-stop timers:** Set duration (1-600 min) for automatic stop
- **Runtime auto-detection:** Searches movies, TV shows, and board games and adds a 10-min buffer — works whether the label was typed manually or auto-detected
- **Smart selection:** Shows menu when multiple matches are found
- Auto-detects Discord scheduled events
- Optional custom labels
- One timer per channel
- Persists across bot restarts
- Watch history integration

**Example:**
```
/timer remind message:Everyone ready? role:@Movie Night
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

## AI Image Generation Commands

### `/image`
Generate AI images: freeform, from a Discord message, or a "versus" battle between two titles — all in one command.

**Options:**
- `prompt` - Describe the image to generate (or add extra style detail alongside `title1`/`title2` or `matchup`)
- `message` - Username or message ID to generate from
- `title1` / `title2` - Two titles for a versus battle image (movie, TV, game, board game, book) — provide both together
- `matchup` - Generate from an active tournament matchup instead of searching (e.g., `"The Thing vs Alien"`)

**Features:**
- Text-to-image generation, generate-from-message, and versus-battle modes
- Smart search validation across TMDB, RAWG, BGG, and Google Books for versus mode
- Cross-type comparisons (movies vs games, etc.)
- Square format (1024x1024) for freeform/message mode; wide format (1792x1024) for versus mode
- Rate limited (5-min cooldown, 10/day per user, 50/day per server)
- Whitelisting for unlimited users
- Cost: $0.04 per image

**Examples:**
```
/image prompt:A dragon flying over a medieval castle at sunset
/image message:username
/image title1:Godzilla title2:King Kong
/image title1:Alien title2:The Thing prompt:in deep space
/image matchup:"The Thing vs Alien"
```

[Learn more →](/commands/ai-images)

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

### `/eggshen-help`
Display comprehensive bot help with complete command list — tailored to what's actually enabled on the server it's run in.

**Features:**
- Overview of all bot commands organized by category
- **Guild-aware:** only shows commands your server has enabled. If an admin disables `/game` via `/eggshen-config commands toggle`, it disappears from your help list too — no more listing commands that will just reply "disabled" if you try them
- A category only disappears entirely if every command in it is disabled; otherwise it stays with just the remaining enabled commands
- Movies & TV Shows: movie, tv, episode, episode-list, similar, watched
- Games & Entertainment: game, boardgame, book, soundtrack
- Random & Discovery: random with filters
- Tournaments & Polls: bracket, survey
- AI Image Generation: image, potion
- Watch Party Tools: timer, watchparty, stats
- Admin commands shown conditionally for moderators
- Links to full documentation at eggshenbot.com
- Tips for command-specific help (e.g., `/bracket help`)

**Example:**
```
/eggshen-help
```

**Pro Tip:** Some complex commands have their own help subcommands:
- `/bracket help` - Tournament system guide
- Use these for detailed, context-specific guidance!

---

### `/soundtrack`
Search for movie and TV show soundtracks with iTunes and Spotify integration.

**Options:**
- `query` (required) - Movie or TV show title to find soundtrack for

**Features:**
- TMDB title verification for accurate matching
- iTunes Search API integration (no API key required)
- Spotify API integration (optional - shows both platforms when configured)
- Album artwork and metadata display
- Artist/composer information
- Track count and release dates
- Price information and purchase links (iTunes)
- Direct links to iTunes and Spotify for streaming
- Supports both movies and TV shows

**Examples:**
```
/soundtrack query:The Matrix
/soundtrack query:Breaking Bad
/soundtrack query:Interstellar
```

**How It Works:**
1. Search for movie or TV show title
2. Select correct title from TMDB results
3. Bot searches iTunes for soundtrack
4. Displays soundtrack details with purchase links

---

## Fun & Social Commands

### `/survey`
Create interactive polls and surveys with up to 10 options and real-time vote tracking.

**Subcommands:**
- `/survey create` - Create a new survey with up to 10 options
- `/survey list` - View all surveys (active, closed, or all)
- `/survey results` - View detailed results with progress bars
- `/survey close` - End voting and show final results (creator/admin/mod only)
- `/survey delete` - Permanently delete a survey (creator/admin/mod only)

**Features:**
- Up to 10 options per survey
- Single or multiple vote modes
- Real-time voting via emoji reactions (1️⃣-🔟)
- Progress bars showing vote percentages
- Permission system for management
- Persistent storage across bot restarts
- Configurable per-server

**Examples:**
```
/survey create question:"What should we watch tonight?" option1:"Horror" option2:"Comedy" option3:"Action"
/survey list filter:active
/survey results poll_id:a1b2c3d4e5f6g7h8
/survey close poll_id:a1b2c3d4e5f6g7h8
```

[Learn more →](/commands/social#survey-commands)

---

### `/potion`
Give magical potions to other users with fun pop culture references!

**Options:**
- `user` (required) - The user to give the potion to
- `type` (required) - Type of potion (Health, Mana, Strength, Speed, Invisibility, Luck, Confusion, Love, Poison, Energy, Weakness, Curse, Slow)

**Features:**
- 13 different potion types (helpful & harmful!)
- 78+ unique responses with references to:
  - Horror: Get Out, Midsommar, The Stuff, Poltergeist
  - Comedy: Army of Darkness, Shaun of the Dead, Hot Fuzz, It's Always Sunny
  - Fantasy: LOTR, Harry Potter, The Witcher, Princess Bride
  - Games: Dark Souls, Skyrim, Zelda, Mario
  - Modern: Everything Everywhere All At Once, Deadpool, Twin Peaks
- Prevents giving potions to bots
- Public messages with user mentions

**Available Potion Types:**

**Helpful Potions:**
- 💚 **Health Potion** - Healing with +HP
- 💙 **Mana Potion** - Magic restoration with +MP
- 🔴 **Strength Potion** - Power boost with +STR
- 💨 **Speed Potion** - Haste effect with +SPD
- 👁️ **Invisibility Potion** - Stealth mode
- 🍀 **Luck Potion** - Fortune boost with +LUCK
- 💕 **Love Potion** - Romance boost with +CHARM
- ⚡ **Energy Potion** - Power up with +ENERGY

**Harmful Potions (for fun chaos!):**
- 😵 **Confusion Potion** - Chaos effect with -INT
- ☠️ **Poison** - Dark magic with -HP
- 💔 **Weakness Potion** - Debuff with -STR
- 👹 **Curse** - Ancient evil (CURSED status)
- 🦥 **Slow Potion** - Movement debuff with -SPD

**Examples:**
```
/potion user:@Friend type:health
→ "🧃 @You tosses @Friend an Estus Flask. 'Praise the sun!' 💚 +100 HP"

/potion user:@Friend type:weakness
→ "🫠 @You gives @Friend a potion that tastes like regret. Their muscles turn to jelly! 💔 -75 STR"

/potion user:@Friend type:curse
→ "👹 @You 'accidentally' gives @Friend the Cursed Videotape Juice. Seven days... 📼 CURSED (The Ring)"

/potion user:@Friend type:love
→ "💘 @You hands @Friend Cupid's arrow in liquid form. 'As you wish.' 💕 +95 CHARM (Princess Bride)"
```

**Note:** This is a fun, cosmetic command with no actual game mechanics. Perfect for adding personality and playful banter to your server!

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

### `/eggshen-logs`
View bot logs and diagnostics (Admin only).

**Subcommands:**
- `stats` - View log file statistics
- `errors` - View recent errors
- `category` - View logs by category

**Categories:** system, command, button, scheduler, bracket, api, performance

**Examples:**
```
/eggshen-logs stats
/eggshen-logs errors count:20
/eggshen-logs category:command count:10
```

[Learn more →](/features/logging)

---

### `/help`
Display help information and available commands.

---

## Command Categories

| Category | Commands |
|----------|----------|
| **Search** | `/movie`, `/tv`, `/episode`, `/episode-list`, `/game`, `/boardgame`, `/book` |
| **Watch Parties** | `/timer`, `/watched` |
| **Discovery** | `/random`, `/similar`, `/soundtrack` |
| **Fun & Social** | `/survey`, `/potion` |
| **Statistics** | `/stats` |
| **Configuration** | `/eggshen-config` |
| **Help** | `/help` |

## Command Permissions

- **Everyone:** Search, timer, watched add, random, similar, soundtrack
- **Admin/Mod:** stats, eggshen-config, watched from timer (or timer starter)

[Learn about moderation →](/features/moderation-tools)

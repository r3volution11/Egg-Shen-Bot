# Egg Shen Bot

A Discord bot for looking up movies, TV shows, TV show episodes, video games, and board games with comprehensive search, watch party features, and statistics tracking. It provides ratings and links for IMDb, Letterboxd, Trakt, Rotten Tomatoes, JustWatch (for movies/TV), Metacritic and RAWG (for games), and BoardGameGeek (for board games). Easily configurable by administrators and perfect for movie/TV/gaming discussion servers and watch party communities with features like random pickers, watch history logging, similar content recommendations, and channel timers.

## Features

- 🎬 **Movie Search** - Search for any movie with the `/movie` command
- 📺 **TV Show Search** - Search for TV shows with the `/tv` command
- 🎞️ **Episode Search** - Search for specific TV episodes by title or season/episode notation (s3e11, 3x11)
- 📋 **Episode List** - View all episodes in a season with ratings and air dates using `/episode-list`
- 🎮 **Game Search** - Search for video games with the `/game` command
- 🎲 **Board Game Search** - Search for board games with the `/boardgame` command
- 🎯 **Random Picker** - Get random movies, TV shows, episodes, games, or board games with genre/decade/rating/platform filters
- 📝 **Watch History** - Track server watch parties with notes and channel tracking, view watch frequency
- 🔍 **Similar Content** - Find similar movies, TV shows, games, or board games based on any title
- 📊 **Public Statistics** - Anyone can view server stats and personal usage statistics
- ⭐ **Multiple Ratings** - Display ratings from IMDb, Trakt, and Rotten Tomatoes
- � **Streaming Availability** - Shows where to stream, rent, or buy movies and TV shows (powered by TMDB)
- �🔗 **Service Links** - Direct links to IMDb, Letterboxd, Trakt, Rotten Tomatoes, and JustWatch
- 🖼️ **Rich Embeds** - Beautiful embedded messages with poster images and metadata
- 🎯 **Interactive Selection** - Choose from search results via dropdown menu (configurable 1-50, default 20)
- ⚙️ **Per-Server Configuration** - Admins can toggle services and set custom emojis
- 🔐 **Command Permissions** - Control which commands regular users can access
- ⏱️ **Channel Timers** - Start and stop timers with optional labels and watch history integration

## Prerequisites

- Node.js 18.x or higher
- A Discord application and bot token
- API keys for:
  - TMDB (The Movie Database) - [Get free API key](https://www.themoviedb.org/settings/api)
  - OMDB (Optional Movie Database) - [Get API key](http://www.omdbapi.com/apikey.aspx)
  - Trakt - [Get API key](https://trakt.tv/oauth/applications)
  - RAWG (Video Games Database) - [Get free API key](https://rawg.io/apidocs)

## Installation

1. **Clone or download this repository**

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment variables**
   - Copy `.env.example` to `.env`
   - Fill in your API keys and bot credentials:

   ```env
   DISCORD_TOKEN=your_discord_bot_token
   DISCORD_CLIENT_ID=your_discord_client_id
   TMDB_API_KEY=your_tmdb_api_key
   OMDB_API_KEY=your_omdb_api_key
   TRAKT_CLIENT_ID=your_trakt_client_id
   RAWG_API_KEY=your_rawg_api_key
   ```

## Setting Up Your Discord Bot

1. **Create a Discord Application**
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Click "New Application" and give it a name
   - Navigate to the "Bot" section and click "Add Bot"
   - Copy the bot token and add it to your `.env` file as `DISCORD_TOKEN`
   - Copy the Application ID from the "General Information" tab and add it as `DISCORD_CLIENT_ID`

2. **Configure Bot Permissions**
   - In the "Bot" section, enable these Privileged Gateway Intents (if needed):
     - Presence Intent (optional)
     - Server Members Intent (optional)
     - Message Content Intent (optional)
   - Under "OAuth2" > "URL Generator":
     - Select scope: `bot` and `applications.commands`
     - Select permissions: `Send Messages`, `Embed Links`, `Read Messages/View Channels`
     - Copy the generated URL and use it to invite the bot to your server

3. **Deploy Slash Commands**

   ```bash
   npm run deploy-commands
   ```

   This registers the bot's slash commands with Discord (`/movie`, `/tv`, `/episode`, `/eggshen-help`, `/eggshen-config`). For faster testing, you can set `GUILD_ID` in your `.env` to deploy commands to a specific server (updates instantly). Leave it empty for global commands (takes up to 1 hour).

## Running the Bot

**Development mode (with auto-restart):**

```bash
npm run dev
```

**Production mode:**

```bash
npm start
```

You should see:

```
✓ Loaded command: movie
✓ Loaded command: tv
✓ Logged in as YourBot#1234
✓ Serving X guilds
```

## Usage

### Movie Search

```
/movie Interstellar
```

The bot will:

1. Display search results in a dropdown menu (up to 20 by default, configurable with `/eggshen-config max-results`)
2. Let you select the correct movie
3. Show a detailed embed with:
   - Movie poster
   - Synopsis
   - IMDb rating and link
   - Letterboxd link
   - Trakt rating and link
   - Rotten Tomatoes score and link
   - **Streaming availability** (Netflix, Hulu, Prime Video, etc. based on your region)
   - **Rent/Buy options** (Apple TV, Amazon, Vudu, etc.)
   - JustWatch link
   - Runtime and genres

### TV Show Search

```
/tv The Simpsons
```

Similar to movie search, but displays:

- TV show poster (not episode-specific images)
- Show metadata (seasons, status)
- **Streaming availability** for your region
- Links to all supported services

### Episode Search

```
/episode show:The Outer Limits episode:Sandkings
/episode show:Breaking Bad episode:s3e11
/episode show:The Office episode:3x5
```

The bot supports **two search methods**:
1. **By episode title** (e.g., "Sandkings") - Searches through all seasons
2. **By season/episode number** (e.g., "s3e11", "3x11", "3-11") - Direct lookup

**Supported notation formats:**
- `s3e11` or `S3E11` (season 3, episode 11)
- `3x11` or `3X11` (season 3, episode 11)
- `3-11` (season 3, episode 11)

The bot will:

1. Search for the TV show you specified
2. Display matching shows in a dropdown (up to 20 by default, useful when multiple versions exist)
3. Once you select the correct show, it searches for the episode:
   - If using season/episode notation, it directly retrieves that specific episode
   - If using episode title, it searches through all seasons to find matching episodes
4. Shows a detailed embed with:
   - Episode title and show name
   - Season and episode number
   - Air date and runtime
   - Episode synopsis
   - **Episode-specific ratings** from IMDb and Trakt (when available)
   - Direct links to the episode page on IMDb and Trakt
   - Show poster image
   - JustWatch link for streaming options

**Tip:** For faster lookups when you know the exact season/episode, use notation like `s3e11` instead of searching by title!

### Episode List

```
/episode-list series:The Outer Limits season:2
```

Get a complete list of all episodes in a season with ratings and air dates.

The bot will:

1. Search for the TV show you specified
2. Fetch all episodes for the specified season
3. Display a rich embed showing:
   - Episode number and title
   - Air date
   - TMDB rating (when available)
   - Link to view the full season on IMDb

**Perfect for:**
- Planning watch party schedules
- Finding highly-rated episodes in a series
- Browsing a season before committing to a full binge
- Quick reference for episode titles and air dates

**Note:** Discord limits embeds to 25 fields, so seasons with more than 25 episodes will require pagination (coming soon). For now, use `/episode` to search individual episodes in longer seasons.

### Game Search

```
/game Resident Evil 4
```

The bot will:

1. Display search results in a dropdown menu (up to 20 by default)
2. Let you select the correct game
3. Show a detailed embed with:
   - Game cover art/screenshot
   - Description
   - Metacritic score
   - RAWG user rating (out of 5 stars)
   - Available platforms
   - Release date
   - Developers and publishers
   - Genres
   - Links to official website, RAWG page, and Metacritic

### Board Game Search

```
/boardgame Wingspan
```

The bot will:

1. Display search results in a dropdown menu (up to 20 by default)
2. Let you select the correct board game
3. Show a detailed embed with:
   - Game cover art
   - Description
   - BoardGameGeek rating (out of 10)
   - Geek rating (BGG's adjusted rating)
   - Overall rank
   - Number of players
   - Playing time
   - Complexity weight
   - Categories and mechanics
   - Designers and publishers
   - Link to BoardGameGeek page

### Timer

**Start a Timer:**

```
/timer start label:Movie night
```

Start a timer in the current channel with an optional label. Only one timer can be active per channel at a time.

**🎬 Smart Event Detection (Watch Parties):**

If your server has configured watch party channels, timers can automatically detect the title from Discord scheduled events:

1. **Admin configures watch party channels** (e.g., #movie-night, #horror-night)
2. **Create a Discord scheduled event** with the movie/show title (e.g., "The Matrix Reloaded")
3. **Set the event location** to the watch party channel (e.g., "#movie-night" or "<#channelId>")
4. **Start the event** when it begins
5. **Run `/timer start`** in that channel (without a label)
6. **Timer automatically uses the event title** as its label!

**Manual Label (Always Works):**

```
/timer start label:Custom Title
```

Manual labels always override auto-detection. Use this when you want a specific label or when not using scheduled events.

**Stop a Timer:**

```
/timer stop
```

Stop the active timer and display the total elapsed time. Any user can stop any timer in the channel.

**Check Timer Status:**

```
/timer status
```

Check if there's an active timer in the channel and how long it has been running.

**Timer Features:**

- One timer per channel (prevents conflicts)
- Available to all users (not admin-only)
- 5-second countdown before starting (5, 4, 3, 2, 1, GO!)
- Displays elapsed time in video player format (M:SS or H:MM:SS)
- Shows who started the timer and who stopped it
- Optional labels to describe what the timer is for
- **Smart event auto-detection** - Automatically pull titles from scheduled events in configured watch party channels
- **Watch history integration** - Timer starter or admins/mods can log watch parties to server history with notes and channel tracking
- Timers persist across bot restarts (saved to disk)
- Restart announcements sent to channels with active timers

### Random Picker

**Random Movie:**

```
/random movie genre:Horror decade:1980s min-rating:7.0
```

Get a random movie with optional filters:

- **genre** - Action, Adventure, Animation, Comedy, Crime, Documentary, Drama, Family, Fantasy, Horror, Music, Mystery, Romance, Science Fiction, Thriller, War, Western
- **decade** - 2020s, 2010s, 2000s, 1990s, 1980s, 1970s, 1960s, 1950s
- **min-rating** - Minimum TMDB rating (1.0-10.0)

**Random TV Show:**

```
/random tv genre:Horror min-rating:7.0
```

Get a random TV show with optional filters:

- **genre** - Action & Adventure, Animation, Comedy, Crime, Documentary, Drama, Family, Horror, Mystery, News, Reality, Romance, Sci-Fi & Fantasy, War & Politics, Western
- **min-rating** - Minimum TMDB rating (1.0-10.0)

**Random Episode:**

```
/random episode show:The Twilight Zone
```

Get a random episode from any TV show. The bot will:

1. Search for the show
2. Pick a random season
3. Pick a random episode from that season
4. Display the episode with details and a command to view full ratings

**Random Game:**

```
/random game genre:Horror platform:PC min-rating:4.0
```

Get a random game with optional filters:

- **genre** - Horror, Action, RPG, Strategy, Shooter, Indie, Puzzle, Platformer
- **platform** - PC, PlayStation, Xbox, Nintendo Switch, Mobile
- **min-rating** - Minimum RAWG rating (1.0-5.0)

**Random Board Game:**

```
/random boardgame category:Strategy min-rating:7.0
```

Get a random board game with optional filters:

- **category** - Strategy, Family, Party, Abstract, Thematic, War, Economic, Children's
- **min-rating** - Minimum BoardGameGeek rating (1.0-10.0)

### Watch History

**Server-Level Watch Party Tracking:**

Watch history tracks what your server watched together during watch parties. This is **server-level tracking** for watch frequency and participation - not individual ratings.

**Add to Watch History:**

```
/watched add title:Hereditary notes:Annual horror night rewatch!
```

Manually log a watch party with optional notes. The bot will:

1. Search for the title
2. Let you select the correct movie or TV show if multiple results
3. Save to server watch history with notes and who saved it
4. **Public message** visible to everyone

**View Watch History:**

```
/watched history filter:all limit:10
```

View the server's watch party history with filters:

- **filter** - All, Movies Only, TV Shows Only
- **limit** - Number of entries to show (1-25, default: 10)

Displays recent watch parties with:
- Title and year
- Who saved it
- Date watched
- **Channel where watch party occurred**
- Optional notes

**Watch History from Timer:**

When you stop a timer with a label:

1. You'll see a "📝 Log to Watch History" button
2. **Only the timer starter OR server admins/moderators** can save it
3. Click to open a form for notes (optional)
4. The bot automatically searches for the title and adds it to history
5. **Public message** shows what was watched, the channel, and who saved it

**Why These Restrictions?**
- Timer starter knows what was actually watched
- Admins/mods can correct or add missing entries
- Prevents random users from logging incorrect content
- Server-level tracking, not personal ratings

### Similar Content

```
/similar title:The Last of Us type:game
/similar title:Hereditary type:movie
/similar title:Wingspan type:boardgame
/similar title:The Shining
```

Find similar movies, TV shows, games, or board games based on any title. The bot will:

1. Search for the title (optionally filtered by media type)
2. Use similarity algorithms (TMDB for movies/TV, RAWG for games, BGG for board games)
3. Display top 10 similar recommendations with years and ratings

**Options:**

- **title** (required) - The title to find similar content for
- **type** (optional) - Specify media type: `movie`, `tv`, `game`, or `boardgame`
  - If not specified, searches all types (useful for discovering cross-media)
  - Recommended when titles overlap (e.g., "The Last of Us", "Resident Evil", "Dune")

Perfect for discovering what to watch, play, or add to your board game collection!

### Public Statistics

**View Server Stats:**

```
/stats filter:all-time type:server
```

Anyone can view server statistics including:

- Top movies, TV shows, and episodes
- Command usage counts (Random, Watched, Similar)
- Most active users with breakdown

**View Personal Stats:**

```
/stats type:personal filter:week
```

See your own statistics:

- Movies searched
- TV shows searched
- Episodes searched
- Random commands used
- Watch history logs
- Similar searches

**Time Filters:**

- `all-time` - All recorded activity (default)
- `month` - This month only
- `week` - This week only
- `today` - Today only

### Getting Help

```
/eggshen-help
```

Displays an interactive help menu showing:

- All available commands with examples
- How to use the bot
- List of rating services
- **Admin/Moderator commands** (only visible to users with admin or moderator permissions)

**Help Menu Includes:**

- Core commands: movie, tv, episode
- Watch party features: random, watched, similar
- Utilities: timer, stats, help
- Admin tools: config, statistics, restart

### Server Configuration (Admin/Moderator Only)

Users with these Discord permissions can configure and control Egg Shen:

- **Administrator** - Full server control
- **Manage Server** - Server management permission  
- **Moderate Members** - Timeout members (typical moderator role)
- **Kick Members** - Can kick users
- **Ban Members** - Can ban users

**All admin commands work with any of these permissions.**

**View Current Settings:**

```
/eggshen-config view
```

Shows:

- Which rating services are enabled/disabled
- Custom emoji settings for each service
- Configuration instructions

**Toggle Services:**

```
/eggshen-config toggle service:letterboxd enabled:false
```

Enable or disable specific rating services for your server. Available services:

- IMDb
- Letterboxd
- Trakt
- Rotten Tomatoes
- JustWatch

**Set Custom Emojis:**

```
/eggshen-config emoji service:imdb emoji:📽️
```

Set custom Discord emojis for rating services. To use custom server emojis:

1. Upload an emoji to your Discord server
2. Copy the emoji (it will look like `<:imdb:1234567890>`)
3. Use it in the command

**Clear Emojis:**

```
/eggshen-config emoji service:imdb
```

Leave the emoji field empty to clear a custom emoji setting.

**Set Streaming Region:**

```
/eggshen-config region code:US
```

Set your preferred region for streaming availability using ISO 3166-1 country codes:
- **US** - United States (default)
- **CA** - Canada
- **GB** - United Kingdom
- **AU** - Australia
- **DE** - Germany
- **FR** - France
- **JP** - Japan
- And many more...

This determines which streaming services are shown in movie and TV embeds.

**Set Maximum Search Results:**

```
/eggshen-config max-results count:20
```

Configure how many search results to display in dropdown menus (1-50, default: 20). Useful if:
- You want comprehensive options to choose from (increase to 30-50)
- You prefer fewer choices for faster selection (decrease to 5-10)
- Your searches often miss the right result (increase for more coverage)

**Configure Watch Party Channels:**

```
/eggshen-config watch-party-add channel:#movie-night
/eggshen-config watch-party-remove channel:#movie-night
/eggshen-config watch-party-list
```

Manage which channels can auto-detect event titles for timers. Perfect for servers with dedicated watch party channels!

**How it works:**
1. Add one or more watch party channels (e.g., #movie-night, #horror-night)
2. Create Discord scheduled events with movie/show titles
3. Set the event location to match the channel (e.g., "#movie-night")
4. Start the event when your watch party begins
5. Run `/timer start` in that channel - it automatically uses the event title!

**Why multiple channels?**
- Servers like Shudder Discord have multiple watch party rooms
- Different events can run simultaneously in different channels
- Each channel independently detects its own events
- Example: Horror movie in #horror-night, comedy in #comedy-night

**Note:** Manual labels (`/timer start label:Title`) always override auto-detection.

**Configure Rate Limiting:**

Rate limiting prevents command abuse and channel flooding. Administrators can configure global limits, per-command limits, and moderator bypass settings.

```
/eggshen-config rate-limit-view
```

View current rate limiting configuration including global limits and custom command limits.

```
/eggshen-config rate-limit-toggle enabled:true
```

Enable or disable rate limiting entirely. When disabled, users can use commands without restrictions.

```
/eggshen-config rate-limit-global max-requests:5 window-seconds:60
```

Set the global rate limit for all commands. Example: 5 requests per 60 seconds means users can run any 5 commands within a minute before being rate-limited.

**Note:** Default is 1 per 20 seconds to prevent burst flooding while matching natural API response times.

```
/eggshen-config rate-limit-command command:episode-list max-requests:2 window-seconds:60
```

Set a custom rate limit for a specific command. This overrides the global limit for that command only. Available commands:
- **movie** - Movie search
- **tv** - TV show search  
- **episode** - Episode search
- **episode-list** - Full season episode listing
- **timer** - Channel timers
- **stats** - Statistics commands

To remove a custom command limit (revert to global): use `max-requests:0`

```
/eggshen-config rate-limit-bypass enabled:true
```

Allow moderators and administrators to bypass rate limits. Enabled by default - useful for admins who need to respond quickly or demonstrate features.

```
/eggshen-config rate-limit-clear user:@username
```

Clear rate limits for a specific user (emergency override). Use if a user is accidentally rate-limited due to legitimate use.

**Anti-Flood Protection:**

```
/eggshen-config rate-limit-guild-wide enabled:true max-requests:10 window-seconds:60
```

Configure server-wide rate limiting to prevent coordinated multi-account flooding. This limits the **total** number of commands across ALL users within a time window, regardless of per-user limits.

**How it works:**
- Independent of per-user limits (both are checked)
- Prevents coordinated attacks from multiple bot/throwaway accounts
- Default: 10 total commands per 60 seconds across all users
- Example: If 10 users each try to use a command at once, the 11th will be rate-limited

**When to adjust:**
- **Increase (20-30 per 60s):** Large active servers with many legitimate users
- **Decrease (5-10 per 60s):** Smaller servers or those experiencing abuse
- **Disable:** Very small private servers with fully trusted members

```
/eggshen-config pattern-detection enabled:true min-users:3
```

Enable suspicious activity pattern detection to automatically flag coordinated abuse. The bot monitors for:

**Detected Patterns:**
1. **Identical Commands** - Multiple different accounts running the exact same command with identical arguments rapidly
2. **Coordinated Bursts** - Multiple accounts firing many commands simultaneously (within 10 seconds)

**How it works:**
- Tracks command patterns across all users
- Flags suspicious behavior when `min-users` or more accounts show coordinated activity
- Logs flagged activity for admin review (kept for 24 hours)
- Does not auto-ban - provides information for moderators to investigate
- Moderators/admins are excluded from detection

**Recommended `min-users` settings:**
- **2-3 users:** Strict detection, good for smaller servers
- **4-5 users:** Balanced detection, good for medium servers  
- **6+ users:** Loose detection, good for large active servers

```
/eggshen-config suspicious-activity
```

View recently detected suspicious activity patterns. Shows:
- Type of pattern detected (identical commands vs coordinated burst)
- Which users were involved
- When it occurred
- What command was being abused

Use this to investigate potential bot/spam attacks and decide whether to ban the flagged users.

```
/eggshen-config abuse-log
```

View individual rate limit violations by user. While pattern detection catches **coordinated** abuse (3+ users), the abuse log tracks **individual** violations - perfect for catching solo abusers.

**Shows:**
- Which users hit rate limits (per-user or server-wide)
- How many violations per user
- What commands they were spamming
- When their last violation occurred
- Flags persistent abusers (10+ violations)

**Kept for 48 hours** - longer than pattern detection (24 hours) to catch persistent behavior.

**Example output:**
```
⚠️ Rate Limit Violations (Last 48h)

@user123 • 5 violations
Commands: /movie: 3x, /episode-list: 2x
Types: Per-user: 5x
Last: 15m ago

@user456 • 15 violations 🚨 Persistent abuser
Commands: /episode-list: 15x
Types: Per-user: 12x, Guild-wide: 3x
Last: 2m ago
```

**When to use:**
- Pattern detection flags coordinated attacks (3+ users)
- Abuse log catches solo users testing/abusing limits
- Provides evidence trail for moderation decisions
- Identifies users who repeatedly hit limits

**Default Settings:**
- Rate limiting: **Enabled**
- Per-user limit: **1 request per 20 seconds**
- Server-wide limit: **10 requests per 60 seconds** ✅ Enabled
- Pattern detection: **Enabled** (flags 3+ users)
- Abuse logging: **Always enabled** (automatic)
- Moderator bypass: **Enabled**
- Custom command limits: **None** (uses global)

**Rate Limit Tips:**
- Default prevents burst flooding (can't rapid-fire multiple embeds)
- Enforces natural pacing that aligns with ~10s API response times
- Server-wide limiting stops coordinated multi-account attacks
- Pattern detection helps identify spam/bot activity for moderation
- Still allows corrections with reasonable spacing between requests
- Increase limits (2-3 per 20s or 5-10 per 60s) for high-activity trusted servers
- Use stricter limits (1 per 30-60s) for heavy commands like `/episode-list` if needed
- Keep moderator bypass enabled so admins can always help users
- Monitor suspicious activity logs if you see unusual rate limit hits

**Moderation Features:**

Advanced moderation tools provide granular control over command access and abuse prevention. All moderation features are controlled by a master switch and can be enabled/disabled independently.

**Master Switches:**

```
/eggshen-config rate-limit-toggle enabled:true
```

Enable/disable the rate limiting system entirely. When disabled, no rate limits are enforced (not recommended).

```
/eggshen-config moderation-toggle enabled:true
```

Enable/disable all moderation features (whitelist, cooldowns, auto-ban notifications). Rate limiting remains independent and functional when moderation is disabled.

**Temporary User Cooldowns:**

Manually restrict specific users from using bot commands temporarily.

```
/eggshen-config user-cooldown user:@username duration:60 reason:"Spamming commands"
```

Apply a temporary cooldown to a user. Duration is in minutes (max 10,080 = 1 week).

**When to use:**
- User is being disruptive but doesn't warrant a ban
- Give users a "timeout" to cool down
- Temporarily restrict access during investigations
- Manual override when rate limits aren't sufficient

**Features:**
- User sees their remaining cooldown time when trying commands
- Cooldown reason is shown to the user
- Tracks who applied the cooldown and when
- Auto-expires when duration completes
- Can be manually removed early

```
/eggshen-config user-cooldown-remove user:@username
```

Remove an active cooldown from a user early.

```
/eggshen-config user-cooldown-list
```

View all users currently under cooldown, including expiration times and reasons.

**Whitelist Mode:**

Restrict bot commands to specific roles or users only. Perfect for exclusive communities or during high-traffic events.

```
/eggshen-config whitelist-toggle enabled:true
```

Enable whitelist mode. ⚠️ **Only whitelisted users/roles and moderators can use bot commands!**

```
/eggshen-config whitelist-add-role role:@Members
```

Add a role to the whitelist. All users with this role can use bot commands.

```
/eggshen-config whitelist-add-user user:@username
```

Add a specific user to the whitelist (bypasses role requirements).

```
/eggshen-config whitelist-remove-role role:@Members
/eggshen-config whitelist-remove-user user:@username
```

Remove roles or users from the whitelist.

```
/eggshen-config whitelist-list
```

View all whitelisted roles and users.

**When to use whitelist mode:**
- Private/exclusive communities
- Limit bot access to paid/subscriber roles
- During watch parties or special events
- Testing new features with specific users
- Preventing new users from flooding

**Important notes:**
- Administrators and moderators always have access (not affected by whitelist)
- Can whitelist by role OR by user (or both)
- Users without whitelist access see a clear "whitelist mode active" message
- Rate limiting still applies to whitelisted users

**Auto-Ban Threshold Notifications:**

Automatically warn users when they exceed a violation threshold and flag them for moderator review.

```
/eggshen-config auto-ban-toggle enabled:true
```

Enable auto-ban threshold warnings. Users who exceed the threshold will see a warning, and moderators can review flagged users.

```
/eggshen-config auto-ban-threshold count:20 hours:24
```

Set the violation threshold. Example: 20 violations within 24 hours triggers the warning.

**How it works:**
1. User hits rate limits (per-user or guild-wide)
2. Each violation is logged in the abuse log
3. When violations exceed threshold within time window:
   - User sees ⚠️ warning message with their rate limit errors
   - Moderators can check `/eggshen-config auto-ban-list` to see flagged users
4. Provides evidence trail for banning persistent abusers

```
/eggshen-config auto-ban-list
```

View all users who have exceeded the auto-ban threshold, including:
- Total violation count
- When their last violation occurred
- Sorted by most violations first

**Recommended thresholds:**
- **Strict (5-10 violations in 24h):** Low-tolerance servers
- **Balanced (15-25 violations in 24h):** Most servers (default: 20)
- **Lenient (30-50 violations in 24h):** High-activity servers with legitimate power users

**Important notes:**
- Does NOT automatically ban users (provides information only)
- Moderators must manually ban after reviewing flagged users
- Works alongside rate limiting and abuse logging
- Threshold is per-user (not server-wide)
- Violations expire after the time window

**Complete Moderation Workflow:**

1. **Rate Limiting (Layer 1):** Prevents burst flooding and enforces natural pacing
2. **Guild-Wide Limits (Layer 2):** Stops multi-account coordinated attacks
3. **Pattern Detection (Layer 3):** Flags suspicious coordinated behavior
4. **Abuse Logging (Layer 4):** Tracks individual violation history
5. **Auto-Ban Threshold (Layer 5):** Warns persistent violators, flags for moderator review
6. **Manual Cooldowns (Layer 6):** Temporary restrictions for disruptive users
7. **Whitelist Mode (Layer 7):** Full access control when needed

**View Statistics (Admin/Moderator):**

```
/eggshen-stats filter:all-time
```

View detailed usage statistics for your server with time filters:

- `all-time` - All recorded activity (default)
- `month` - This month only
- `week` - This week only
- `today` - Today only

Statistics include:

- Top 10 most searched movies (with counts)
- Top 10 most searched TV shows (with counts)
- Top 10 most searched episodes (with counts)
- Command usage counts (Random, Watched, Similar)
- Top 10 users with breakdown (M=Movies, S=Shows, E=Episodes, R=Random, W=Watched, Si=Similar)

**Note:** Regular users can view public statistics with `/stats` instead.

**Toggle Statistics Tracking:**

```
/eggshen-config stats-toggle setting:enabled enabled:true
```

Control statistics tracking for your server:

- `enabled` - Master switch for all stats tracking
- `trackMovies` - Toggle movie search tracking
- `trackShows` - Toggle TV show search tracking
- `trackEpisodes` - Toggle episode search tracking

**Clear Statistics:**

```
/eggshen-config stats-clear
```

Permanently delete all statistics for your server.

**Control Command Permissions:**

```
/eggshen-config commands-toggle setting:enabled enabled:true
```

Control which commands regular users can access:

- `enabled` - Master switch (when disabled, only admins can use the bot)
- `movie` - Toggle `/movie` command for regular users
- `tv` - Toggle `/tv` command for regular users
- `episode` - Toggle `/episode` command for regular users

**Note:** Administrators and moderators always have access to all commands, regardless of permission settings.

**Restart the Bot:**

```
/eggshen-restart
```

Gracefully restart the bot process. This command:

- Exits the bot process cleanly
- Requires a process manager (PM2, systemd, etc.) to automatically restart the bot
- Logs who initiated the restart
- Sends a confirmation message before restarting

**⚠️ Important:** This command only works if you're running the bot with a process manager like PM2 (recommended) or systemd. If running with `npm start`, the bot will exit but won't automatically restart.

## API Key Setup

### TMDB (Required)

1. Create an account at [themoviedb.org](https://www.themoviedb.org/)
2. Go to Settings > API
3. Request an API key (select "Developer" option)
4. Copy the "API Key (v3 auth)" value to your `.env`

### OMDB (Required for IMDb/RT ratings)

1. Go to [omdbapi.com](http://www.omdbapi.com/apikey.aspx)
2. Select a plan (free tier available with 1,000 requests/day)
3. Verify your email and receive your API key
4. Add it to your `.env`

### Trakt (Required for Trakt ratings)

1. Create an account at [trakt.tv](https://trakt.tv)
2. Go to Settings > Your Applications > New Application
3. Fill in the form (use `urn:ietf:wg:oauth:2.0:oob` for redirect URI)
4. Copy the "Client ID" to your `.env`

## Project Structure

```
discord-movie-tv-bot/
├── src/
│   ├── commands/          # Slash command definitions
│   │   ├── movie.js       # /movie command
│   │   ├── tv.js          # /tv command
│   │   ├── episode.js     # /episode command
│   │   ├── episode-list.js # /episode-list command
│   │   ├── random.js      # /random command (movie/tv/episode)
│   │   ├── watched.js     # /watched command (add/history)
│   │   ├── similar.js     # /similar command
│   │   ├── stats.js       # /stats command (public)
│   │   ├── timer.js       # /timer command
│   │   ├── help.js        # /eggshen-help command
│   │   ├── eggshen-config.js  # /eggshen-config command
│   │   ├── eggshen-stats.js   # /eggshen-stats command (admin)
│   │   └── eggshen-restart.js # /eggshen-restart command
│   ├── handlers/          # Interaction handlers
│   │   ├── selectHandler.js   # Dropdown menu handler
│   │   └── buttonHandler.js   # Button interaction handler
│   ├── services/          # External API integrations
│   │   ├── tmdbService.js     # TMDB API (search, details, discover, similar)
│   │   ├── omdbService.js     # OMDB API (IMDb/RT ratings)
│   │   ├── traktService.js    # Trakt API (community ratings)
│   │   └── urlService.js      # Service URL builders
│   ├── utils/             # Utility functions
│   │   ├── embedBuilder.js        # Discord embed creation
│   │   ├── guildConfig.js         # Server configuration
│   │   ├── statsTracker.js        # Usage statistics
│   │   ├── timerManager.js        # Channel timers with persistence
│   │   └── watchHistoryManager.js # Watch history storage
│   ├── config.js          # Configuration management
│   ├── index.js           # Main bot file
│   └── deploy-commands.js # Command registration script
├── guild_configs/         # Per-server configuration (not in git)
├── guild_stats/           # Per-server statistics (not in git)
├── guild_watch_history/   # Per-server watch logs (not in git)
├── active_timers.json     # Active timer persistence (not in git)
├── assets/
│   └── icons/             # Service icon files
├── .env                   # Environment variables (not in git)
├── .env.example           # Environment template
├── .gitignore
├── package.json
├── ecosystem.config.js    # PM2 configuration for deployment
├── DEPLOYMENT.md          # Linode/server deployment guide
└── README.md
```

## Features & Limitations

### Current Features

**Core Search:**

- ✅ Movie and TV show search
- ✅ Episode search by name with show selection
- ✅ Interactive result selection (up to 5 results)
- ✅ Episode-specific ratings from IMDb and Trakt
- ✅ Direct links to episode pages on IMDb and Trakt
- ✅ IMDb, Letterboxd, Trakt, Rotten Tomatoes, JustWatch links
- ✅ Ratings from IMDb, Trakt, and Rotten Tomatoes
- ✅ Movie posters and synopses
- ✅ TV series and show posters

**Watch Party Features:**

- ✅ Random movie/TV/episode picker with genre, decade, and rating filters
- ✅ Server-level watch party tracking with notes and channel tracking
- ✅ View watch history with filters (frequency tracking)
- ✅ Permission-restricted saves (timer starter or mods/admins only)
- ✅ Similar content recommendations using TMDB algorithm
- ✅ Channel timers with 5-second countdown and video player format
- ✅ Timer-to-watch-history integration (auto-prompt when stopping labeled timers)
- ✅ Timer persistence across bot restarts

**Statistics & Tracking:**

- ✅ Public statistics command for all users
- ✅ Personal statistics view (your own usage)
- ✅ Server statistics view (top content and users)
- ✅ Time filters (all-time, month, week, today)
- ✅ Tracks all command usage (movie, tv, episode, random, watched, similar)
- ✅ Top 10 lists for movies, shows, episodes, and users
- ✅ Admin controls for statistics (toggle tracking, clear stats)

**Administration:**

- ✅ Per-server configuration (admin controls)
- ✅ Toggle individual rating services on/off per server
- ✅ Custom emoji support per server
- ✅ Help command with admin section
- ✅ Permission-based controls for admins and moderators (Administrator, Manage Server, Moderate Members, Kick Members, Ban Members)
- ✅ Command permission controls (enable/disable commands for regular users)
- ✅ Bot restart command (requires PM2 or process manager)

### Known Limitations

- Rotten Tomatoes URLs are constructed and may not always be accurate (RT doesn't have a public API)
- Rotten Tomatoes audience scores not available through OMDB
- Rotten Tomatoes doesn't provide episode-specific ratings
- Letterboxd has no official API (links are constructed)
- JustWatch has no official API (links are constructed and may vary by region)
- Episode-specific thumbnail images not shown (series poster used instead)

### Future Enhancements

- [ ] AI-powered search - Use AI to better understand user queries and determine search intent (e.g., automatically detect if searching for a movie, show, or episode; handle typos and variations)
- [ ] User favorites and personal watchlists
- [ ] Streaming availability notifications
- [ ] Cache frequently searched titles
- [ ] Support for more streaming services
- [ ] Export watch history to CSV/JSON
- [ ] Community recommendations based on server watch history

## Troubleshooting

### Commands not showing up in Discord

- Run `npm run deploy-commands` again
- If deploying globally, wait up to 1 hour for propagation
- Try setting `GUILD_ID` in `.env` for faster testing

### "Invalid API key" errors

- Double-check all API keys in `.env`
- Ensure there are no extra spaces or quotes
- Verify API keys are active on their respective platforms

### Bot doesn't respond

- Check console for error messages
- Verify bot has proper permissions in your Discord server
- Ensure the bot is online (`✓ Logged in as...` in console)

### Missing ratings

- Some titles may not have ratings on all services
- OMDB free tier has request limits (1,000/day)
- Trakt requires titles to have IMDb IDs

## Contributing

Feel free to submit issues or pull requests for:

- Bug fixes
- New features
- Additional services
- Documentation improvements

## License

MIT License - feel free to use and modify as needed.

## Acknowledgments

- [TMDB](https://www.themoviedb.org/) for comprehensive movie/TV data
- [OMDB](http://www.omdbapi.com/) for IMDb and Rotten Tomatoes ratings
- [Trakt](https://trakt.tv) for community ratings
- [RAWG](https://rawg.io/) for comprehensive video game data and ratings
- [BoardGameGeek](https://boardgamegeek.com/) for comprehensive board game data and ratings
- [discord.js](https://discord.js.org/) for the Discord bot framework

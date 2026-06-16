# Discord Movie and TV Bot

A Discord bot for looking up movies, TV shows, TV show episodes, and video games with comprehensive search, watch party features, and statistics tracking. It provides ratings and links for IMDb, Letterboxd, Trakt, Rotten Tomatoes, JustWatch (for movies/TV) and Metacritic, RAWG (for games). Easily configurable by administrators and perfect for movie/TV/gaming discussion servers and watch party communities with features like random pickers, watch history logging, similar content recommendations, and channel timers.

## Features

- 🎬 **Movie Search** - Search for any movie with the `/movie` command
- 📺 **TV Show Search** - Search for TV shows with the `/tv` command
- 🎞️ **Episode Search** - Search for specific TV episodes with the `/episode` command
- � **Game Search** - Search for video games with the `/game` command
- 🎲 **Random Picker** - Get random movies, TV shows, episodes, or games with genre/decade/rating/platform filters
- 📝 **Watch History** - Log what you watched with ratings and notes, view server watch history
- 🔍 **Similar Content** - Find similar movies, TV shows, or games based on any title
- 📊 **Public Statistics** - Anyone can view server stats and personal usage statistics
- ⭐ **Multiple Ratings** - Display ratings from IMDb, Trakt, and Rotten Tomatoes
- 🔗 **Service Links** - Direct links to IMDb, Letterboxd, Trakt, Rotten Tomatoes, and JustWatch
- 🖼️ **Rich Embeds** - Beautiful embedded messages with poster images and metadata
- 🎯 **Interactive Selection** - Choose from up to 5 search results via dropdown menu
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

1. Display up to 5 search results in a dropdown menu
2. Let you select the correct movie
3. Show a detailed embed with:
   - Movie poster
   - Synopsis
   - IMDb rating and link
   - Letterboxd link
   - Trakt rating and link
   - Rotten Tomatoes score and link
   - JustWatch link
   - Runtime and genres

### TV Show Search

```
/tv The Simpsons
```

Similar to movie search, but displays:

- TV show poster (not episode-specific images)
- Show metadata (seasons, status)
- Links to all supported services

### Episode Search

```
/episode show:The Outer Limits episode:Sandkings
```

The bot will:

1. Search for the TV show you specified
2. Display up to 5 matching shows in a dropdown (useful when multiple versions exist)
3. Once you select the correct show, it searches for the episode by name
4. Shows a detailed embed with:
   - Episode title and show name
   - Season and episode number
   - Air date and runtime
   - Episode synopsis
   - **Episode-specific ratings** from IMDb and Trakt (when available)
   - Direct links to the episode page on IMDb and Trakt
   - Show poster image
   - JustWatch link for streaming options

**Note:** Episode search looks through all seasons of a show to find episodes matching your search term.

### Game Search

```
/game Resident Evil 4
```

The bot will:

1. Display up to 5 search results in a dropdown menu
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

### Timer

**Start a Timer:**

```
/timer start label:Movie night
```

Start a timer in the current channel with an optional label. Only one timer can be active per channel at a time.

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
- **Watch history integration** - When you stop a labeled timer, get a button to log it to watch history with optional rating and notes
- Timers persist across bot restarts (saved to disk)
- Restart announcements sent to channels with active timers

### Random Picker

**Random Movie:**

```
/random movie genre:Horror decade:1980s min-rating:7.0
```

Get a random movie with optional filters:

- **genre** - Horror, Thriller, Sci-Fi, Fantasy, Mystery, Romance, Action, Comedy, Drama, Crime
- **decade** - 2020s, 2010s, 2000s, 1990s, 1980s, 1970s, 1960s, 1950s
- **min-rating** - Minimum TMDB rating (1.0-10.0)

**Random TV Show:**

```
/random tv genre:Horror min-rating:7.0
```

Get a random TV show with optional filters:

- **genre** - Horror, Sci-Fi & Fantasy, Mystery, Romance, Crime, Drama, Comedy, Action & Adventure
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

### Watch History

**Add to Watch History:**

```
/watched add title:Hereditary rating:8.5 notes:Absolutely terrifying!
```

Manually log what you watched with optional rating (1-10) and notes. The bot will:

1. Search for the title
2. Let you select the correct movie or TV show if multiple results
3. Save to server watch history with your rating and notes

**View Watch History:**

```
/watched history filter:all limit:10
```

View the server's watch history with filters:

- **filter** - All, Movies Only, TV Shows Only
- **limit** - Number of entries to show (1-25, default: 10)

Displays recent watches with titles, ratings, notes, who watched, and dates.

**Watch History from Timer:**

When you stop a timer with a label:

1. You'll see a "📝 Log to Watch History" button
2. Click it to open a form for rating and notes
3. The bot automatically searches for the title and adds it to history

### Similar Content

```
/similar title:The Shining
```

Find movies or TV shows similar to any title. The bot will:

1. Search for the title
2. Use TMDB's similarity algorithm
3. Display top 10 similar recommendations with years and ratings

Perfect for discovering what to watch next!

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
- ✅ Watch history logging with ratings and notes
- ✅ View server watch history with filters
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
- [ ] Bulk episode lookup (e.g., search by season number)
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
- [discord.js](https://discord.js.org/) for the Discord bot framework

# Discord Movie and TV Bot

A Dsicord bot for looking up movies, TV shows, and TV show episodes, showing synopses and ratings for different services and linking to each service's respective page for the media. It provides ratings and links for IMDb, Letterboxd, Trakt, Rotten Tomatoes, and JustWatch and is easily configurable by administrators. It also includes timer functionality for watch party purposes.

## Features

- 🎬 **Movie Search** - Search for any movie with the `/movie` command
- 📺 **TV Show Search** - Search for TV shows with the `/tv` command
- 🎞️ **Episode Search** - Search for specific TV episodes with the `/episode` command
- ⭐ **Multiple Ratings** - Display ratings from IMDb, Trakt, and Rotten Tomatoes
- 🔗 **Service Links** - Direct links to IMDb, Letterboxd, Trakt, Rotten Tomatoes, and JustWatch
- 🖼️ **Rich Embeds** - Beautiful embedded messages with poster images and metadata
- 🎯 **Interactive Selection** - Choose from up to 5 search results via dropdown menu
- ⚙️ **Per-Server Configuration** - Admins can toggle services and set custom emojis
- 📊 **Statistics Tracking** - Track most popular movies, shows, and episodes, plus top users
- 🔐 **Command Permissions** - Control which commands regular users can access
- ⏱️ **Channel Timers** - Start and stop timers in channels (one per channel)

## Prerequisites

- Node.js 18.x or higher
- A Discord application and bot token
- API keys for:
  - TMDB (The Movie Database) - [Get free API key](https://www.themoviedb.org/settings/api)
  - OMDB (Optional Movie Database) - [Get API key](http://www.omdbapi.com/apikey.aspx)
  - Trakt - [Get API key](https://trakt.tv/oauth/applications)

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
- Displays elapsed time in a human-readable format (days, hours, minutes, seconds)
- Shows who started the timer and who stopped it
- Optional labels to describe what the timer is for
- Timers are stored in memory (reset when bot restarts)

### Getting Help

```
/eggshen-help
```

Displays an interactive help menu showing:

- All available commands with examples
- How to use the bot
- List of rating services
- **Admin/Moderator commands** (only visible to users with admin or moderator permissions)

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

**View Statistics:**

```
/eggshen-stats filter:all-time
```

View usage statistics for your server with time filters:

- `all-time` - All recorded searches (default)
- `month` - This month only
- `week` - This week only
- `today` - Today only

Statistics include:

- Top 10 most searched movies (with counts)
- Top 10 most searched TV shows (with counts)
- Top 10 most searched episodes (with counts)
- Top 10 users with breakdown (Movies/Shows/Episodes)

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
│   │   ├── timer.js       # /timer command
│   │   ├── eggshen-help.js    # /eggshen-help command
│   │   ├── eggshen-config.js  # /eggshen-config command
│   │   ├── eggshen-stats.js   # /eggshen-stats command
│   │   └── eggshen-restart.js # /eggshen-restart command
│   ├── handlers/          # Interaction handlers
│   │   ├── selectHandler.js
│   │   └── buttonHandler.js
│   ├── services/          # External API integrations
│   │   ├── tmdbService.js
│   │   ├── omdbService.js
│   │   ├── traktService.js
│   │   └── urlService.js
│   ├── utils/             # Utility functions
│   │   ├── embedBuilder.js
│   │   ├── guildConfig.js
│   │   ├── statsTracker.js
│   │   └── timerManager.js
│   ├── config.js          # Configuration management
│   ├── index.js           # Main bot file
│   └── deploy-commands.js # Command registration script
├── guild_configs/         # Per-server configuration (not in git)
├── guild_stats/           # Per-server statistics (not in git)
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

- ✅ Movie and TV show search
- ✅ Episode search by name with show selection
- ✅ Interactive result selection (up to 5 results)
- ✅ Episode-specific ratings from IMDb and Trakt
- ✅ Direct links to episode pages on IMDb and Trakt
- ✅ IMDb, Letterboxd, Trakt, Rotten Tomatoes, JustWatch links
- ✅ Ratings from IMDb, Trakt, and Rotten Tomatoes
- ✅ Movie posters and synopses
- ✅ TV series and show posters
- ✅ Per-server configuration (admin controls)
- ✅ Toggle individual rating services on/off per server
- ✅ Custom emoji support per server
- ✅ Help command with admin section
- ✅ Permission-based controls for admins and moderators (Administrator, Manage Server, Moderate Members, Kick Members, Ban Members)
- ✅ Statistics tracking with time filters (all-time, month, week, today)
- ✅ Top 10 lists for movies, shows, episodes, and users
- ✅ Admin controls for statistics (toggle tracking, clear stats)
- ✅ Command permission controls (enable/disable commands for regular users)
- ✅ Bot restart command (requires PM2 or process manager)
- ✅ Channel timers (start, stop, check status - one timer per channel)

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
- [ ] Search history and favorites
- [ ] Streaming availability notifications
- [ ] Cache frequently searched titles
- [ ] Support for more streaming services

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
- [discord.js](https://discord.js.org/) for the Discord bot framework

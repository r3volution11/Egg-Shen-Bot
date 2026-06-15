# Discord Movie and TV Bot

A Discord bot that allows users to search for movies and TV shows, displaying ratings, synopses, and links to popular services including IMDb, Letterboxd, Trakt, Rotten Tomatoes, and JustWatch.

## Features

- 🎬 **Movie Search** - Search for any movie with the `/movie` command
- 📺 **TV Show Search** - Search for TV shows with the `/tv` command
- ⭐ **Multiple Ratings** - Display ratings from IMDb, Trakt, and Rotten Tomatoes
- 🔗 **Service Links** - Direct links to IMDb, Letterboxd, Trakt, Rotten Tomatoes, and JustWatch
- 🖼️ **Rich Embeds** - Beautiful embedded messages with poster images and metadata
- 🎯 **Interactive Selection** - Choose from up to 5 search results via dropdown menu

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
   
   This registers the `/movie` and `/tv` commands with Discord. For faster testing, you can set `GUILD_ID` in your `.env` to deploy commands to a specific server (updates instantly). Leave it empty for global commands (takes up to 1 hour).

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

### Episode-Specific Searches

You can include episode names in TV searches:
```
/tv The Outer Limits Sandkings
```

The bot will find the series and display its information. Future versions may support episode-specific details.

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
│   │   └── tv.js          # /tv command
│   ├── handlers/          # Interaction handlers
│   │   ├── selectHandler.js
│   │   └── buttonHandler.js
│   ├── services/          # External API integrations
│   │   ├── tmdbService.js
│   │   ├── omdbService.js
│   │   ├── traktService.js
│   │   └── urlService.js
│   ├── utils/             # Utility functions
│   │   └── embedBuilder.js
│   ├── config.js          # Configuration management
│   ├── index.js           # Main bot file
│   └── deploy-commands.js # Command registration script
├── assets/
│   └── icons/             # Service icons (to be added)
├── .env                   # Environment variables (not in git)
├── .env.example           # Environment template
├── .gitignore
├── package.json
└── README.md
```

## Features & Limitations

### Current Features
- ✅ Movie and TV show search
- ✅ Interactive result selection (up to 5 results)
- ✅ IMDb, Letterboxd, Trakt, Rotten Tomatoes, JustWatch links
- ✅ Ratings from IMDb, Trakt, and Rotten Tomatoes
- ✅ Movie posters and synopses
- ✅ TV series posters (not episode-specific)

### Known Limitations
- Rotten Tomatoes URLs are constructed and may not always be accurate (RT doesn't have a public API)
- Rotten Tomatoes audience scores not available through OMDB
- Letterboxd has no official API (links are constructed)
- JustWatch has no official API (links are constructed and may vary by region)
- Episode-specific images not shown (series poster used instead)

### Future Enhancements
- [ ] Episode-specific information and ratings
- [ ] Custom service icons as Discord emojis
- [ ] "Share" button to post results publicly
- [ ] Cache frequently searched titles
- [ ] Support for more streaming services
- [ ] User preferences (default services, region settings)

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

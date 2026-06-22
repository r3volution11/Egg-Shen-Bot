# Installation

Detailed installation instructions for Egg Shen Bot.

## Requirements

- **Node.js** v20.x or higher
- **npm** (comes with Node.js)
- **Discord Bot Token** from [Discord Developer Portal](https://discord.com/developers/applications)
- **TMDB API Key** from [TMDB](https://www.themoviedb.org/settings/api) (required for all movie/TV features)

## API Keys

### Required APIs

| Service | Purpose | Get Key |
|---------|---------|---------|
| **TMDB** | Movie and TV show data | [Get API Key](https://www.themoviedb.org/settings/api) |

### Optional APIs

These APIs enable additional features. Commands requiring them **will not be registered** if their API keys aren't configured.

| Service | Purpose | Enables Commands | Get Key |
|---------|---------|-----------------|---------|
| **OMDB** | IMDb & RT ratings | Enhanced ratings display | [Get API Key](http://www.omdbapi.com/apikey.aspx) |
| **Trakt** | Community ratings | Enhanced ratings display | [Get API Key](https://trakt.tv/oauth/applications) |
| **RAWG** | Video game data | `/game`, `/random game`, `/similar` (games) | [Get API Key](https://rawg.io/apidocs) |
| **BoardGameGeek** | Board game data | `/boardgame`, `/random boardgame`, `/similar` (board games) | [Get API Key](https://boardgamegeek.com/wiki/page/BGG_XML_API2) |

> **Note:** Commands requiring optional APIs won't appear in Discord at all if their keys aren't configured. This prevents users from seeing unavailable features.

## Step-by-Step Installation

### 1. Create Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application"
3. Name your bot and accept the Terms of Service
4. Go to "Bot" section
5. Click "Add Bot"
6. **Important:** Enable these Privileged Gateway Intents:
   - Server Members Intent
   - Message Content Intent
7. Copy your bot token (you'll need this later)

### 2. Get API Keys

Follow the links in the API Keys table above to obtain your keys. At minimum, you need:
- Discord Bot Token (from Discord Developer Portal)
- TMDB API Key (required for core functionality)

Optional APIs can be added later to enable additional features.

### 3. Clone and Install

```bash
# Clone repository
git clone https://github.com/r3volution11/Egg-Shen-Bot.git
cd Egg-Shen-Bot

# Install dependencies
npm install
```

### 4. Configure Bot

```bash
# Copy example config
cp config/config.example.json config/config.json

# Edit configuration
nano config/config.json  # or use your preferred editor
```

**config/config.json structure:**
```json
{
  "discord": {
    "token": "YOUR_BOT_TOKEN_HERE",
    "clientId": "YOUR_BOT_CLIENT_ID",
    "guildId": "YOUR_TEST_SERVER_ID"
  },
  "apis": {
Create a `.env` file in the project root:

```bash
# Copy example environment file
cp .env.example .env

# Edit with your API keys
nano .env  # or use your preferred editor
```

**Required .env variables:**
```bash
# Discord Configuration (Required)
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_client_id_here

# TMDB API (Required for core functionality)
TMDB_API_KEY=your_tmdb_api_key_here

# Optional APIs (enable specific features)
OMDB_API_KEY=your_omdb_api_key_here
TRAKT_CLIENT_ID=your_trakt_client_id_here
RAWG_API_KEY=your_rawg_api_key_here
BGG_CLIENT_ID=your_bgg_client_id_here

# Optional: Guild ID for testing (leave empty for global commands)
GUILD_ID=
```

**What happens if optional APIs aren't configured:**
- `/game` and `/boardgame` commands won't be registered at all - they won't appear in Discord
- `/random` game/boardgame subcommands will show error messages when used
- `/similar` will skip unavailable media types (games/board games) in searches
- Rating displays will have fewer sources without OMDB/TraktOpen URL in browser and invite to your server

### 6. Register Commands

```bash
npm run deploy-commands
```

This registers all slash commands with Discord. You should see:
```
Successfully registered application commands.
```

### 7. Start Bot

```bash
npm start
```

You should see:
```
✓ Logged in as YourBot#1234
```

## Verification

Test that everything works:

```
/movie title:The Matrix
/help
```

If commands appear and work, installation is complete!

## Troubleshooting

### Commands not appearing

- Wait 1 hour after running `deploy-commands` (Discord cache)
- Try in a private message with the bot
- Verify bot permissions in server settings

### Bot immediately crashes

- Check Discord token in config.json
- Verify all required Intents are enabled
- Check Node.js version: `node --version`

### API errors

- Verify TMDB API key is correct
- Make sure you activated the OMDB key via email
- Check rate limits on API providers

### Permission errors

- Bot needs proper permissions in server
- Check role hierarchy (bot role should be high enough)
- Verify channel permissions

## Production Deployment

For production servers, consider:

- Using PM2 for process management
- Setting up log rotation
- Configuring automatic restarts
- Monitoring system resources

See [Configuration Guide](/configuration) for production setup.

## Next Steps

- [Configure server settings](/configuration)
- [Set up rate limiting](/features/rate-limiting)
- [Enable moderation tools](/features/moderation-tools)
- [Configure statistics tracking](/features/statistics)

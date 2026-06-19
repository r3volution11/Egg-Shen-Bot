# Installation

Detailed installation instructions for Egg Shen Bot.

## Requirements

- **Node.js** v20.x or higher
- **npm** (comes with Node.js)
- **Discord Bot Token** from [Discord Developer Portal](https://discord.com/developers/applications)
- **TMDB API Key** from [TMDB](https://www.themoviedb.org/settings/api) (required)

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

#### TMDB (Required)
1. Create account at [TMDB](https://www.themoviedb.org/signup)
2. Go to [API Settings](https://www.themoviedb.org/settings/api)
3. Request an API key (choose "Developer" option)
4. Copy the API Key (v3 auth)

#### OMDB (Optional)
1. Visit [OMDB API](http://www.omdbapi.com/apikey.aspx)
2. Request a free API key
3. Verify your email
4. Copy your API key

#### Trakt (Optional)
1. Create account at [Trakt.tv](https://trakt.tv)
2. Go to [Applications](https://trakt.tv/oauth/applications)
3. Create new application
4. Copy Client ID and Client Secret

#### RAWG (Optional)
1. Create account at [RAWG](https://rawg.io)
2. Go to [API Documentation](https://rawg.io/apidocs)
3. Get your API key

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
    "tmdb": "YOUR_TMDB_API_KEY",
    "omdb": "YOUR_OMDB_API_KEY",
    "trakt": {
      "clientId": "YOUR_TRAKT_CLIENT_ID",
      "clientSecret": "YOUR_TRAKT_CLIENT_SECRET"
    },
    "rawg": "YOUR_RAWG_API_KEY"
  }
}
```

### 5. Invite Bot to Server

1. Go back to Discord Developer Portal
2. Go to OAuth2 → URL Generator
3. Select scopes:
   - `bot`
   - `applications.commands`
4. Select permissions:
   - Send Messages
   - Embed Links
   - Attach Files
   - Read Message History
   - Use External Emojis
   - Add Reactions
5. Copy the generated URL
6. Open URL in browser and invite to your server

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

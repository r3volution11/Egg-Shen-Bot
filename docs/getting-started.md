# Getting Started

Welcome to Egg Shen Bot! This guide will help you get the bot up and running in your Discord server.

## Prerequisites

Before you begin, make sure you have:

- **Node.js** v20.x or higher
- **npm** (comes with Node.js)
- A **Discord Bot Token** ([Create one here](https://discord.com/developers/applications))
- **API Keys** for external services:
  - [TMDB API Key](https://www.themoviedb.org/settings/api) (required for movies/TV)
  - [OMDB API Key](http://www.omdbapi.com/apikey.aspx) (optional, for additional movie data)
  - [Trakt API Key](https://trakt.tv/oauth/applications) (optional, for Trakt ratings)
  - [RAWG API Key](https://rawg.io/apidocs) (optional, for video games)

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/r3volution11/Egg-Shen-Bot.git
cd Egg-Shen-Bot
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure the Bot

Copy the example configuration file:

```bash
cp config/config.example.json config/config.json
```

Edit `config/config.json` with your credentials:

```json
{
  "discord": {
    "token": "YOUR_DISCORD_BOT_TOKEN",
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

### 4. Register Slash Commands

```bash
npm run register-commands
```

This registers all slash commands with Discord.

### 5. Start the Bot

```bash
npm start
```

You should see: `✓ Logged in as YourBot#1234`

## Quick Configuration

Once the bot is running, use these commands to configure your server:

### Enable/Disable Services

```
/eggshen-config settings toggle service:imdb enabled:true
```

Control which rating services appear in embeds.

### Set Rate Limits

```
/eggshen-config rate-limit toggle enabled:true
```

Enable rate limiting to prevent abuse (enabled by default).

### Configure Emojis

```
/eggshen-config settings emoji service:imdb emoji:🎬
```

Customize emojis for each service.

## First Commands

Try these commands in your server:

```
/movie title:The Matrix
/tv title:Breaking Bad
/episode title:The Last of Us season:1 episode:1
/game title:The Last of Us
/timer start label:Movie Night
```

## Next Steps

- [Learn about all commands](/commands/)
- [Configure rate limiting](/features/rate-limiting)
- [Set up moderation tools](/features/moderation-tools)
- [Enable statistics tracking](/features/statistics)

## Troubleshooting

### Bot doesn't respond to commands

1. Make sure you ran `npm run register-commands`
2. Check the bot has proper permissions in your server
3. Verify the bot token in `config/config.json`

### API errors

- Check that your API keys are valid
- TMDB is required for movie/TV searches
- Other APIs are optional but enhance features

### Rate limit issues

- Check `/eggshen-config rate-limit view` to see current settings
- Use `/eggshen-config rate-limit clear user:@someone` for emergency overrides

## Support

Having issues? Check:
- [Command Reference](/commands/)
- [Configuration Guide](/commands/configuration)
- [GitHub Issues](https://github.com/r3volution11/Egg-Shen-Bot/issues)

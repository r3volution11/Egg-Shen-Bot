---
title: Getting Started with Egg Shen Bot
description: Quick start guide for setting up Egg Shen Bot in your Discord server. Learn what you need, how to install, and get your bot running in minutes.
---

# Getting Started

**Egg Shen Bot is a free, open-source Discord bot** that searches movies, TV shows, video games, and board games while providing comprehensive ratings from IMDb, Letterboxd, Trakt, Rotten Tomatoes, JustWatch, Metacritic, RAWG, and BoardGameGeek. This guide will help you get the bot up and running in your Discord server.

## Quick FAQ

**Q: What do I need to get started?**  
A: Node.js v20+, a Discord bot token, and a TMDB API key (free). Other APIs are optional.

**Q: How long does setup take?**  
A: About 10-15 minutes for basic setup with required APIs.

**Q: Is it really free?**  
A: Yes! The bot is open-source and all required API keys are free tier.

**Q: Do I need all the API keys?**  
A: No. Only Discord token and TMDB are required. Other APIs enable additional features.

**Q: Can I use this on shared hosting?**  
A: You need a server that can run Node.js applications 24/7 (VPS, dedicated server, or cloud hosting).

---

## Prerequisites

Before you begin, make sure you have:

- **Node.js** v20.x or higher
- **npm** (comes with Node.js)
- A **Discord Bot Token** ([Create one here](https://discord.com/developers/applications))
- **TMDB API Key** ([Get it here](https://www.themoviedb.org/settings/api)) - **Required**

### Optional API Keys

These enable additional features:
- [OMDB API Key](http://www.omdbapi.com/apikey.aspx) - IMDb and Rotten Tomatoes ratings
- [Trakt Client ID](https://trakt.tv/oauth/applications) - Trakt community ratings  
- [RAWG API Key](https://rawg.io/apidocs) - Video game search
- [BoardGameGeek Client ID](https://boardgamegeek.com/wiki/page/BGG_XML_API2) - Board game search

> **Note:** Commands requiring optional APIs will be disabled if their API keys aren't configured.

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

Create a `.env` file with your API keys:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```bash
# Discord Configuration (Required)
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_client_id_here

# TMDB API (Required)
TMDB_API_KEY=your_tmdb_api_key_here

# Optional APIs
OMDB_API_KEY=your_omdb_api_key_here
TRAKT_CLIENT_ID=your_trakt_client_id_here
RAWG_API_KEY=your_rawg_api_key_here
BGG_CLIENT_ID=your_bgg_client_id_here
```

See [Installation Guide](./installation.md) for detailed API key setup instructions.

### 4. Start the Bot

```bash
npm start
```

You should see: `✓ Logged in as YourBot#1234`

> **Note:** Slash commands are automatically registered when the bot starts. No separate registration step needed!

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

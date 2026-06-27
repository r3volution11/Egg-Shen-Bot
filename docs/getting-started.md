---
title: Getting Started with Egg Shen Bot
description: Quick start guide for setting up Egg Shen Bot in your Discord server. Learn what you need, how to install, and get your bot running in minutes.
head:
  - - meta
    - property: og:title
      content: Getting Started with Egg Shen Bot
  - - meta
    - property: og:description
      content: Quick start guide for setting up Egg Shen Bot in your Discord server. Free, open-source bot for movie, TV, game, and book searches with comprehensive ratings.
  - - meta
    - property: og:url
      content: https://eggshenbot.com/getting-started.html
  - - meta
    - name: twitter:title
      content: Getting Started with Egg Shen Bot
  - - meta
    - name: twitter:description
      content: Quick start guide for setting up Egg Shen Bot. Free Discord bot for entertainment searches.
---

# Getting Started

**Egg Shen Bot is a free, open-source Discord bot** that searches movies, TV shows, books, video games, and board games while providing comprehensive ratings from IMDb, Letterboxd, Trakt, Rotten Tomatoes, JustWatch, Metacritic, RAWG, BoardGameGeek, and Google Books. Features include semantic search powered by AI, enhanced streaming availability data, and more. This guide will help you get the bot up and running in your Discord server.

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

#### Core Search Features

- **[OMDB API Key](http://www.omdbapi.com/apikey.aspx)** - IMDb and Rotten Tomatoes ratings for movies/TV
  - Get free key: Visit [omdbapi.com/apikey.aspx](http://www.omdbapi.com/apikey.aspx)
  - Select "FREE! (1,000 daily limit)" plan
  - Confirm via email and copy your API key
  
- **[Trakt Client ID](https://trakt.tv/oauth/applications)** - Trakt community ratings and watch history
  - Create account at [trakt.tv](https://trakt.tv)
  - Go to Settings → Your API Apps → New Application
  - Fill in app details (any values work for bot usage)
  - Copy the "Client ID" (NOT the Client Secret)
  
- **[RAWG API Key](https://rawg.io/apidocs)** - Video game search via `/game` command
  - Create account at [rawg.io](https://rawg.io)
  - Go to [API Documentation](https://rawg.io/apidocs)
  - Click "Get API Key"
  - Copy your API key
  
- **[BoardGameGeek Client ID](https://boardgamegeek.com/wiki/page/BGG_XML_API2)** - Board game search via `/boardgame` command
  - Free XML API (no registration required)
  - Set to any unique identifier for your bot
  
- **[Google Books API Key](https://console.cloud.google.com/apis/library/books.googleapis.com)** - Book search via `/book` and `/similar` commands
  - Go to [Google Cloud Console](https://console.cloud.google.com/)
  - Create a new project or select existing one
  - Enable the "Books API"
  - Go to Credentials → Create Credentials → API Key
  - Copy your API key
  - Recommended: Restrict key to Books API for security

#### Enhanced Features

- **[Watch Mode API Key](https://api.watchmode.com/)** - Enhanced streaming availability data
  - Create account at [api.watchmode.com](https://api.watchmode.com/)
  - Free tier: 1,000 requests/month
  - Supplements TMDB's watch provider data with additional sources
  
- **[OpenAI API Key](https://platform.openai.com/api-keys)** - AI image generation (`/image`, `/bracket image`) and semantic search
  - **IMPORTANT:** Requires a paid OpenAI account with billing set up
  - Image generation costs $0.04 per image (bot has built-in rate limiting)
  - Semantic search uses minimal tokens (very low cost)
  - Create account at [platform.openai.com](https://platform.openai.com/)
  - Add payment method in Settings → Billing
  - Go to API Keys → Create new secret key
  - Copy your API key immediately (shown only once)
  - **Model Used:** `text-embedding-3-small` (cost-effective embedding model)
  - **Cost:** ~$0.02 per 1,000 searches (based on average query length)
  - **Purpose:** Improves search accuracy by understanding semantic meaning (e.g., "sci-fi robots" matches "The Matrix")
  - **Note:** Falls back to standard TMDB text search if not configured

- **iTunes Search API** - Soundtrack search for `/soundtrack` command
  - **No signup required** - completely free with no API key
  - Provides album artwork, artist info, track listings, and purchase links
  - Used automatically by `/soundtrack` command
  - Shows iTunes/Apple Music streaming and purchase options

- **[Spotify API](https://developer.spotify.com/dashboard)** - Additional soundtrack results for `/soundtrack` command
  - Create free account at [developer.spotify.com](https://developer.spotify.com/dashboard)
  - Create a new app (name: "Egg Shen Bot", redirect URI: `https://localhost`)
  - Select "Web API" as the API/SDK
  - Copy Client ID and Client Secret
  - **Free tier:** Unlimited requests for read-only public data access
  - **Purpose:** Shows Spotify streaming links alongside iTunes results for soundtracks
  - **Note:** If not configured, `/soundtrack` will show iTunes results only

> **Note:** Commands requiring optional APIs will be disabled if their API keys aren't configured. The bot will function with only Discord + TMDB keys, but additional APIs enhance functionality.

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

# Optional APIs - Core Search Features
OMDB_API_KEY=your_omdb_api_key_here
TRAKT_CLIENT_ID=your_trakt_client_id_here
RAWG_API_KEY=your_rawg_api_key_here
BGG_CLIENT_ID=your_bgg_client_id_here
GOOGLE_BOOKS_API_KEY=your_google_books_api_key_here

# Optional APIs - Enhanced Features
WATCHMODE_API_KEY=your_watchmode_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
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
/book title:The Hobbit
/timer start label:Movie Night
```

## Next Steps

### Explore Commands

- [Learn about all commands](/commands/)
- **[🏆 Run Your First Tournament](/commands/brackets/#quick-start-guide)** - Complete step-by-step guide for hosting bracket tournaments

### Configure Features

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

# API Keys Guide

Complete guide for obtaining all API keys needed for Egg Shen Bot.

## Overview

| Service | Required | Free Tier | Registration | Approval Time |
|---------|----------|-----------|--------------|---------------|
| **Discord Bot** | ✅ Yes | Yes | [Discord Portal](https://discord.com/developers/applications) | Instant |
| **TMDB** | ✅ Yes | Yes | [TMDB](https://www.themoviedb.org/settings/api) | 1-2 minutes |
| **iTunes Search API** | ⭕ Auto-enabled | Yes (unlimited) | None required | N/A |
| **OpenAI** | ⭕ Optional | Pay-per-use | [OpenAI Platform](https://platform.openai.com/api-keys) | Instant ($2-5/month typical) |
| **Watchmode** | ⭕ Optional | 1000/month | [Watchmode](https://api.watchmode.com/) | Instant |
| **Spotify** | ⭕ Optional | Yes | [Spotify for Developers](https://developer.spotify.com/dashboard) | Instant |
| **OMDB** | ⭕ Optional | 1000/day | [OMDB](http://www.omdbapi.com/apikey.aspx) | Instant |
| **Trakt** | ⭕ Optional | Yes | [Trakt](https://trakt.tv/oauth/applications) | Instant |
| **RAWG** | ⭕ Optional | 20,000/month | [RAWG](https://rawg.io/apidocs) | Instant |
| **BoardGameGeek** | ⭕ Optional | Yes | [BGG XML API](https://boardgamegeek.com/wiki/page/BGG_XML_API2) | Instant |
| **Google Books** | ⭕ Optional | 1000-10k/day | [Google Cloud](https://console.developers.google.com/) | Instant |

---

## Discord Bot Token

**Purpose:** Required for bot to connect to Discord  
**Features Enabled:** All bot functionality  
**Free Tier:** Unlimited for self-hosted bots

### Step-by-Step Instructions

1. **Go to Discord Developer Portal**
   - Visit https://discord.com/developers/applications
   - Log in with your Discord account

2. **Create New Application**
   - Click **"New Application"** button
   - Enter a name for your bot (e.g., "Egg Shen Bot")
   - Accept Discord's Terms of Service
   - Click **"Create"**

3. **Configure Bot**
   - Click **"Bot"** in the left sidebar
   - Click **"Add Bot"** (if not already added)
   - Confirm by clicking **"Yes, do it!"**

4. **Enable Intents**
   - Scroll down to **"Privileged Gateway Intents"**
   - Enable **"Server Members Intent"** ✅
   - Enable **"Message Content Intent"** ✅
   - Click **"Save Changes"**

5. **Get Bot Token**
   - Under **"TOKEN"** section, click **"Reset Token"**
   - Copy the token that appears
   - **⚠️ IMPORTANT:** Never share this token publicly!
   - Add to `.env` file as `DISCORD_TOKEN`

6. **Get Client ID**
   - Click **"General Information"** in left sidebar
   - Copy the **"APPLICATION ID"**
   - Add to `.env` file as `DISCORD_CLIENT_ID`

---

## TMDB API Key

**Purpose:** Movie and TV show data (required for core features)  
**Features Enabled:** `/movie`, `/tv`, `/episode`, `/random`, `/similar`, watch history  
**Free Tier:** Unlimited requests

### Step-by-Step Instructions

1. **Create TMDB Account**
   - Visit https://www.themoviedb.org/signup
   - Sign up with email or social login
   - Verify your email address

2. **Request API Key**
   - Go to your account settings: https://www.themoviedb.org/settings/api
   - Click **"Create"** under "Request an API Key"
   - Select **"Developer"**
   - Accept the Terms of Use

3. **Fill Out Application**
   - **Application Name:** "Egg Shen Discord Bot" (or your name)
   - **Application URL:** Your website or `https://github.com/r3volution11/Egg-Shen-Bot`
   - **Application Summary:** "Discord bot for searching movies and TV shows"
   - Submit the form

4. **Get API Key**
   - Your API key (v3 auth) will be displayed immediately
   - Copy the **"API Key"** (not the API Read Access Token)
   - Add to `.env` file as `TMDB_API_KEY`

**Rate Limits:** None officially documented

---

## OpenAI API Key

**Purpose:** AI image generation and semantic search  
**Features Enabled:**
- **AI Image Generation** - `/image` command (freeform, from a message, or versus battle between two titles)
- **Semantic Search** - Smart re-ranking of search results based on semantic similarity  
**Pricing:** Pay-per-use
- Image generation (gpt-image-2 model): $0.04 per image
- Text embeddings (text-embedding-3-small model): $0.02 per 1M tokens

### Why Use OpenAI?

**AI Image Generation:**
- Create custom AI-generated images from text prompts
- Generate epic "versus" battle posters comparing two titles
- Tournament matchup visualizations
- Cost: $0.04 per image with built-in rate limiting to control costs

**Semantic Search Enhancement:**
Standard keyword search works well for exact titles, but can struggle with:
- Partial titles or misspellings
- Descriptions instead of titles ("that movie about dreams within dreams")
- Thematic queries ("psychological thriller about AI")

OpenAI's semantic search understands **meaning**, not just keywords, providing:
- **Better result ranking** - Most relevant results appear first
- **Semantic understanding** - Matches based on context and meaning
- **Improved relevance** - Works even with imprecise queries

The bot uses a **hybrid approach**: keyword search first (fast and free), then AI re-ranking (smart and accurate). If OpenAI isn't configured, the bot still works with keyword search alone (but image generation will be disabled).

### Step-by-Step Instructions

1. **Create OpenAI Account**
   - Visit https://platform.openai.com/signup
   - Sign up with email or social login
   - You'll need to add a payment method (credit card required)

2. **Add Credits**
   - Go to Billing: https://platform.openai.com/account/billing
   - Add at least $5 (minimum purchase)
   - Set spending limits to control costs

3. **Generate API Key**
   - Go to API Keys: https://platform.openai.com/api-keys
   - Click **"Create new secret key"**
   - Name it: "Egg Shen Bot"
   - Copy the key (you won't see it again!)
   - Add to `.env` file as `OPENAI_API_KEY`

**Cost Estimate:**
- **Image generation:** $0.04 per image
  - Default limits: 10 images/user/day, 50 images/server/day
  - Example: 50 images/month ≈ $2.00
  - Configurable rate limits prevent runaway costs
- **Semantic search:** ~$0.02 per 1,000 searches
  - Example: 10,000 searches/month ≈ $0.20
  - Very cost-effective for small-medium servers
- **Total:** Most servers spend $2-5/month

**Usage Limits:** Set custom spending limits in your OpenAI dashboard to prevent surprise bills

**Note:** OpenAI is completely optional. The bot works without it using keyword search alone (image generation features will be disabled).

---

## Watchmode API Key

**Purpose:** Enhanced streaming availability data (complements TMDB)  
**Features Enabled:** More comprehensive streaming service listings, including free services like Tubi, Pluto TV, Freevee  
**Free Tier:** 1,000 requests per month

### Why Use Watchmode?

TMDB provides streaming availability data, but it's sourced from JustWatch and can be incomplete. Watchmode specializes in streaming availability and offers:

- ✅ Better coverage of free streaming services (Tubi, Pluto TV, Freevee, etc.)
- ✅ More up-to-date availability data
- ✅ 150+ streaming services tracked
- ✅ Better regional coverage

The bot uses a **progressive enhancement approach**: it tries Watchmode first (if API key is configured), then falls back to TMDB data. If Watchmode isn't configured, the bot still works with TMDB alone.

### Step-by-Step Instructions

1. **Create Watchmode Account**
   - Visit https://api.watchmode.com/
   - Click **"Sign Up"** in the top right
   - Create a free account with email

2. **Get API Key**
   - After logging in, you'll be taken to your Dashboard
   - Your **API Key** will be displayed on the dashboard
   - Copy the API key
   - Add to `.env` file as `WATCHMODE_API_KEY`

3. **Monitor Usage**
   - Free tier: 1,000 requests per month
   - Dashboard shows your current usage
   - Bot automatically falls back to TMDB if limit is reached

**Rate Limits:** 1,000 requests/month (free tier)

**Upgrade Options:**
- **$8/month:** 1,000 requests per month + additional features
- **$24/month:** 10,000 requests per month
- **$99/month:** 100,000 requests per month

**Note:** Watchmode is completely optional. The bot works without it using TMDB's streaming data alone.

---

## iTunes Search API

**Purpose:** Soundtrack search for `/soundtrack` command  
**Features Enabled:** Album artwork, artist info, track listings, and iTunes/Apple Music purchase links  
**Free Tier:** Unlimited (no signup required)

### Why Use iTunes Search API?

The iTunes Search API is a **free, public API** provided by Apple that requires **no registration, no API key, and no authentication**. It provides:

- ✅ Completely free with unlimited requests
- ✅ No signup or API key required
- ✅ High-quality album artwork (up to 600x600px)
- ✅ Complete track listings with duration
- ✅ Artist and composer information
- ✅ Release dates and genre metadata
- ✅ Direct links to iTunes/Apple Music for purchase and streaming
- ✅ Price information for purchasing albums

The bot uses iTunes Search API **automatically** for the `/soundtrack` command. No configuration needed!

### How It Works

1. User runs `/soundtrack query:Movie Title`
2. Bot verifies title with TMDB for accuracy
3. Bot searches iTunes for soundtrack albums
4. Results displayed with album art and metadata
5. Users can click through to iTunes/Apple Music

**Rate Limits:** None documented by Apple

**API Documentation:** https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/

**Note:** iTunes Search API works out-of-the-box. No setup required!

---

## Spotify API Key

**Purpose:** Additional soundtrack results for `/soundtrack` command (complements iTunes)  
**Features Enabled:** Spotify album links and metadata alongside iTunes results  
**Free Tier:** Unlimited (Client Credentials flow)

### Why Use Spotify?

The `/soundtrack` command uses iTunes Search API by default (no setup needed), but adding Spotify provides:

- ✅ Broader soundtrack coverage across platforms
- ✅ Spotify streaming links for users who prefer Spotify
- ✅ Both iTunes and Spotify results shown together
- ✅ Higher quality album artwork from Spotify
- ✅ Free with no rate limits for read-only access

The bot uses a **multi-platform approach**: it searches both iTunes and Spotify (if configured), then displays results from both services with clickable links. If Spotify isn't configured, the bot shows iTunes results only.

### Step-by-Step Instructions

1. **Create Spotify Developer Account**
   - Visit https://developer.spotify.com/dashboard
   - Click **"Log In"** or **"Sign Up"** if you don't have a Spotify account
   - Log in with your Spotify account (free account works fine)

2. **Create an App**
   - Click **"Create app"** button
   - Fill in the form:
     - **App name:** "Egg Shen Bot" (or your bot name)
     - **App description:** "Discord bot for searching movie and TV soundtracks"
     - **Redirect URI:** `http://localhost` (not used but required)
     - **API/SDKs:** Check **"Web API"**
   - Accept Spotify's Terms of Service
   - Click **"Save"**

3. **Get Client ID and Secret**
   - You'll be taken to your app's dashboard
   - Click **"Settings"** button in the top right
   - Copy the **"Client ID"**
   - Click **"View client secret"**
   - Copy the **"Client secret"**
   - Add both to `.env` file:
     - `SPOTIFY_CLIENT_ID=your_client_id_here`
     - `SPOTIFY_CLIENT_SECRET=your_client_secret_here`

**Rate Limits:** None for Client Credentials flow (read-only access)

**Security Note:**
- Keep your Client Secret private (never commit to public repositories)
- The bot uses OAuth 2.0 Client Credentials flow (server-to-server)
- No user authentication required - bot accesses public Spotify data only

**Note:** Spotify is completely optional. The bot works without it using iTunes alone.

---

## OMDB API Key

**Purpose:** IMDb and Rotten Tomatoes ratings  
**Features Enabled:** Enhanced rating displays  
**Free Tier:** 1,000 requests per day

### Step-by-Step Instructions

1. **Request API Key**
   - Visit http://www.omdbapi.com/apikey.aspx
   - Select **"FREE! (1,000 daily limit)"**
   - Enter your email address
   - Enter your first and last name
   - Click **"Submit"**

2. **Verify Email**
   - Check your email inbox
   - Click the activation link in the email from OMDb API
   - This will activate your API key

3. **Get API Key**
   - After clicking activation link, your API key is displayed
   - Copy the API key
   - Add to `.env` file as `OMDB_API_KEY`

**Rate Limits:** 1,000 requests per day

**Upgrade Options:**
- **$1/month:** 100,000 requests/month
- **$5/month:** 500,000 requests/month

---

## Trakt Client ID

**Purpose:** Community ratings and watch statistics  
**Features Enabled:** Trakt rating display in embeds  
**Free Tier:** Unlimited

### Step-by-Step Instructions

1. **Create Trakt Account**
   - Visit https://trakt.tv/auth/join
   - Sign up with email or social login

2. **Create OAuth Application**
   - Go to https://trakt.tv/oauth/applications
   - Click **"New Application"**

3. **Fill Out Application Form**
   - **Name:** "Egg Shen Discord Bot"
   - **Description:** "Discord bot for searching movies and TV shows"
   - **Redirect URI:** `urn:ietf:wg:oauth:2.0:oob`
   - **Permissions:** Leave defaults (only need public data)
   - Check **"I have read the API Terms"**
   - Click **"Save App"**

4. **Get Client ID**
   - Your new app will appear in the applications list
   - Click on your app name to view details
   - Copy the **"Client ID"**
   - Add to `.env` file as `TRAKT_CLIENT_ID`

**Rate Limits:** 1,000 requests per 5 minutes

---

## RAWG API Key

**Purpose:** Video game data and ratings  
**Features Enabled:** `/game`, `/random game`, `/similar` (games)  
**Free Tier:** 20,000 requests per month

### Step-by-Step Instructions

1. **Create RAWG Account**
   - Visit https://rawg.io/
   - Click **"Sign Up"** in top right
   - Create account with email or social login

2. **Get API Key**
   - Go to https://rawg.io/apidocs
   - Scroll down to **"Get an API key"** section
   - Your API key is automatically generated and displayed
   - Click **"Copy"** to copy your key
   - Add to `.env` file as `RAWG_API_KEY`

**Rate Limits:** 
- Free tier: 20,000 requests/month
- Max 4 requests per second

**Note:** If commands aren't configured, `/game` won't appear in Discord.

---

## BoardGameGeek Client ID

**Purpose:** Board game data and ratings  
**Features Enabled:** `/boardgame`, `/random boardgame`, `/similar` (board games)  
**Free Tier:** Yes (rate limits apply)

### Step-by-Step Instructions

1. **Create BGG Account**
   - Visit https://boardgamegeek.com/
   - Click **"Join"** in top right
   - Create account with username and email

2. **Read API Documentation**
   - Visit https://boardgamegeek.com/wiki/page/BGG_XML_API2
   - Review the API terms and guidelines
   - No formal registration required for basic usage

3. **Get API Credentials**
   - For basic usage, BGG XML API2 doesn't require authentication
   - However, for better rate limits, you can request developer credentials
   - Contact BGG support at: https://boardgamegeek.com/contact
   - Request OAuth credentials for "Egg Shen Discord Bot"
   - They will provide you with a Client ID

4. **Configure in Bot**
   - Once you receive your Client ID from BGG support
   - Add to `.env` file as `BGG_CLIENT_ID`

**Alternative (No Auth):**
- If you don't have a Client ID yet, you can run the bot without it
- The `/boardgame` command won't be registered
- Basic API access still works but with lower rate limits

**Rate Limits:** 
- Unauthenticated: ~2 requests per second
- With credentials: Higher limits (varies)

**Note:** BGG API approval can take 1-3 business days via email support.

---

## Google Books API Key

**Purpose:** Book search and information  
**Features Enabled:** `/book`, `/random book`, `/similar` (books)  
**Free Tier:** 1,000 requests/day (no key) or 10,000 requests/day (with key)

### Step-by-Step Instructions

1. **Create Google Cloud Project**
   - Visit https://console.cloud.google.com/
   - Log in with your Google account
   - Click **"Select a project"** dropdown
   - Click **"New Project"**
   - Enter project name (e.g., "Egg Shen Discord Bot")
   - Click **"Create"**

2. **Enable Books API**
GOOGLE_BOOKS_API_KEY=your_google_books_api_key_here
   - In the Google Cloud Console, go to **"APIs & Services"** → **"Library"**
   - Search for **"Books API"**
   - Click on **"Books API"** in the results
   - Click **"Enable"**

3. **Create API Key**
   - Go to **"APIs & Services"** → **"Credentials"**
   - Click **"Create Credentials"** → **"API Key"**
   - Your API key will be generated
   - Copy the API key

4. **Restrict API Key (Recommended)**
   - Click **"Edit API key"** (or the pencil icon)
   - Under **"Application restrictions"**: Select "None" (or HTTP referrers if you prefer)
   - Under **"API restrictions"**: Select **"Restrict key"**
   - Choose **"Books API"** from the dropdown
   - Click **"Save"**

5. **Configure in Bot**
   - Add to `.env` file as `GOOGLE_BOOKS_API_KEY`

**Alternative (No API Key):**
- The `/book` command works without an API key
- Without key: 1,000 requests per day
- With key: 10,000 requests per day

**Rate Limits:** 
- No key: 1,000 requests/day
- With key: 10,000 requests/day
- Can be increased by requesting quota increase in Google Cloud Console

---

## Configuration File

Once you have all your API keys, add them to your `.env` file:

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

## Security Best Practices

1. **Never commit `.env` to version control**
   - Already included in `.gitignore`
   - Contains sensitive credentials

2. **Rotate tokens if exposed**
   - If you accidentally share a token, regenerate it immediately
   - Discord: Reset token in Developer Portal
   - TMDB: Generate new key in API settings
   - Others: Contact support or regenerate

3. **Use environment variables in production**
   - On servers, set env vars directly (not `.env` file)
   - Example for PM2: `pm2 start ecosystem.config.js --update-env`

4. **Monitor API usage**
   - Check your API dashboards regularly
   - Set up alerts for rate limit warnings
   - Most services provide usage statistics

## Troubleshooting

### "Invalid API Key" Errors

- **TMDB:** Make sure you copied the API Key (v3), not the Read Access Token
- **OMDB:** Verify you clicked the email activation link
- **Trakt:** Use Client ID, not Client Secret
- **RAWG:** Key is shown on https://rawg.io/apidocs when logged in

### Commands Not Appearing

- **Run deployment:** `npm run deploy-commands` or restart bot
- **Check logs:** Look for "Skipped command" messages indicating missing API keys
- **Discord cache:** Commands can take up to 1 hour to update globally (use guild ID for testing)

### Rate Limit Errors

- **OMDB Free Tier:** 1,000/day - consider upgrading if hitting limits
- **RAWG:** 20,000/month - monitor usage in dashboard
- **Trakt:** 1,000 per 5 min - bot includes built-in retry logic

### Still Having Issues?

- Check [Installation Guide](./installation.md)
- Review [Getting Started](./getting-started.md)
- Open an issue on [GitHub](https://github.com/r3volution11/Egg-Shen-Bot/issues)

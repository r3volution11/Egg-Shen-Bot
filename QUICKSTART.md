# Quick Start Guide

## ✅ What's Done

- ✅ Dependencies installed (`npm install` completed)
- ✅ `.env` file created (needs your API keys)
- ✅ Updated embed design to match your mockup (inline badges)
- ✅ Project structure ready

## 📝 Next Steps

### 1. Get Your API Keys

**TMDB (Free)**

- Sign up: <https://www.themoviedb.org/signup>
- Go to Settings → API → Request API Key
- Choose "Developer" and fill out the form
- Copy the "API Key (v3 auth)"

**Trakt (Free)**  

- Sign up: <https://trakt.tv/auth/join>
- Go to Settings → Your Applications → New Application
- Name: "Discord Movie Bot"
- Redirect URI: `urn:ietf:wg:oauth:2.0:oob`
- Copy the "Client ID"

**OMDB (You have this!)**

- You mentioned you already have an OMDB API key

### 2. Configure Your Bot

Edit `.env` and add your keys:

```env
# Discord Bot (get from Discord Developer Portal)
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id

# API Keys
TMDB_API_KEY=your_tmdb_key
OMDB_API_KEY=your_omdb_key
TRAKT_CLIENT_ID=your_trakt_id
```

### 3. Set Up Discord Bot

1. Go to <https://discord.com/developers/applications>
2. Click "New Application" → name it
3. Go to "Bot" → "Add Bot"
4. Copy the token → add to `.env` as `DISCORD_TOKEN`
5. Go to "OAuth2" → "General" → copy Application ID → add to `.env` as `DISCORD_CLIENT_ID`
6. Go to "OAuth2" → "URL Generator":
   - Scopes: `bot` and `applications.commands`
   - Permissions: `Send Messages`, `Embed Links`, `Use Slash Commands`
   - Copy the URL and open it to invite bot to your server

### 4. Deploy Commands & Run

```bash
# Deploy slash commands to Discord
npm run deploy-commands

# Start the bot
npm start
```

## 🎨 Design Notes

Your mockup showed a clean inline format with:

- Service icons + ratings in one line
- Compact badge-style display
- Episode information format: "Show · Episode · Season X, Episode Y"

The current implementation matches this with:

- Inline rating badges separated by bullets (•)
- Clear text labels for each service
- Optional custom emoji icons for branded look
- Compact formatting

### Current Badge Format (Default)

**IMDb:** 7.2 • **Letterboxd** • **Trakt:** 7.6 • **RT Critics:** 68% • **JustWatch**

Text labels are clear and work everywhere without any setup!

**Optional Enhancement**: Want to add your actual branded service icons? See [assets/icons/README.md](assets/icons/README.md) for instructions on using custom Discord emojis. When configured, they'll appear alongside the service names like: 🎬 **IMDb:** 7.2

## 🚀 Testing

Once running, try these commands in Discord:

```
/movie Interstellar
/tv The Outer Limits
/tv Breaking Bad
```

The bot will show up to 5 results in a dropdown menu. Select one to see the full details with ratings!

## 📺 Episode Support (Future)

Per your requirements, TV searches currently show the series poster. To add episode-specific results:

1. Parse episode names/numbers from query
2. Use TMDB's episode endpoints (already included in `tmdbService.js`)
3. Display format: "Show Title · Episode Name · Season X, Episode Y"
4. Keep using series poster (as per your preference)

The groundwork is already in place in `src/services/tmdbService.js` with the `getEpisodeDetails()` function.

## 🐛 Troubleshooting

**Bot doesn't come online?**

- Check your `DISCORD_TOKEN` in `.env`
- Make sure bot is invited to your server

**Commands don't appear?**

- Run `npm run deploy-commands` again
- Wait a few minutes (global commands can take up to 1 hour)
- Try adding `GUILD_ID=your_server_id` to `.env` for instant updates

**No ratings showing?**

- Verify all API keys are correct
- Some titles may not have ratings on all services
- Check console for error messages

## 💡 Tips

- Use `npm run dev` for development (auto-restarts on file changes)
- Set `GUILD_ID` in `.env` during testing for instant command updates
- Remove `GUILD_ID` for production to deploy globally

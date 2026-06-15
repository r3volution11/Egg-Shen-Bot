# Discord Bot Setup - Final Steps

## ✅ Already Configured

- ✅ API Keys added to `.env`
  - TMDB: cb448b196f35d8e7afa0c709ba33dca9
  - OMDB: 213b060d
  - Trakt: e6a343992c4df2c855123aba7b00ffe475edcb42d94db283993d6ad2a9bda1c6
- ✅ Dependencies installed
- ✅ Text labels configured for service ratings (clear and readable by default)

## 🔴 Still Needed: Discord Bot Application

You need to create a Discord bot and add two values to `.env`:

- `DISCORD_TOKEN`
- `DISCORD_CLIENT_ID`

### Quick Setup (5 minutes)

#### 1. Create Discord Application

1. Go to: <https://discord.com/developers/applications>
2. Click **"New Application"**
3. Name it: "Movie & TV Bot" (or whatever you like)
4. Click **Create**

#### 2. Get Client ID

1. You're now on the "General Information" page
2. Find **Application ID**
3. Click **Copy**
4. This is your `DISCORD_CLIENT_ID`

#### 3. Create Bot & Get Token

1. Click **"Bot"** in the left sidebar
2. Click **"Add Bot"** → Confirm
3. Under "Token", click **"Reset Token"** → Confirm
4. Click **Copy** (you won't be able to see it again!)
5. This is your `DISCORD_TOKEN`

⚠️ **IMPORTANT**: Keep your token secret! Don't share it or commit it to Git.

#### 4. Configure Bot Permissions

Still in the Bot section:

1. **Privileged Gateway Intents**: Leave unchecked (not needed)
2. **Bot Permissions**: Nothing to set here yet

#### 5. Generate Invite Link

1. Click **"OAuth2"** → **"URL Generator"** in the left sidebar
2. Under **SCOPES**, check:
   - ☑️ `bot`
   - ☑️ `applications.commands`
3. Under **BOT PERMISSIONS**, check:
   - ☑️ Send Messages
   - ☑️ Embed Links
   - ☑️ Read Messages/View Channels
   - ☑️ Use Slash Commands
4. **Copy the URL** at the bottom
5. Open the URL in your browser
6. Select your server and click **Authorize**

#### 6. Update Your .env File

Open `.env` and update these lines:

```env
DISCORD_TOKEN=paste_your_bot_token_here
DISCORD_CLIENT_ID=paste_your_application_id_here
```

Optionally, add your server ID for faster command deployment during testing:

```env
GUILD_ID=your_server_id
```

To get your server ID:

1. Enable Developer Mode in Discord (User Settings → Advanced → Developer Mode)
2. Right-click your server icon → Copy Server ID

## 🚀 Ready to Launch

Once you've updated `.env` with your Discord credentials, run:

```bash
# Deploy the slash commands
npm run deploy-commands

# Start the bot
npm start
```

You should see:

```
✓ Loaded command: movie
✓ Loaded command: tv
✓ Logged in as YourBot#1234
✓ Serving 1 guilds
```

## 🎬 Test It Out

In Discord, type:

```
/movie Interstellar
/tv Breaking Bad
```

Select a result from the dropdown, and boom! 🎉

The ratings will display with clear text labels like:
**IMDb:** 7.2 • **Letterboxd** • **Trakt:** 7.6 • **RT Critics:** 68% • **JustWatch**

## 🎨 Optional: Custom Branded Emojis

Want to add your actual service icons for that authentic branded look? See [assets/icons/README.md](assets/icons/README.md) for instructions. When configured, they'll appear alongside the service names (e.g., 🎬 **IMDb:** 7.2). This is completely optional - text labels are clear and work great by default!

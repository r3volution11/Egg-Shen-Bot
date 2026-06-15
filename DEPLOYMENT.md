# Deploying Egg Shen to Linode

This guide will help you deploy the Egg Shen Discord bot to your Linode server for 24/7 uptime.

## Prerequisites

- Linode server with Ubuntu/Debian (or similar)
- SSH access to your server
- Node.js 18+ installed on the server

## Step 1: Prepare Your Server

SSH into your Linode server:
```bash
ssh your-username@your-server-ip
```

Install Node.js (if not already installed):
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Install PM2 globally (process manager to keep the bot running):
```bash
sudo npm install -g pm2
```

Create a directory for the bot:
```bash
mkdir -p ~/egg-shen-bot
cd ~/egg-shen-bot
```

## Step 2: Transfer Files to Server

From your local machine, use SCP or Git to transfer files:

**Option A: Using SCP** (from your local machine):
```bash
cd ~/Projects/Discord\ Movie\ and\ TV\ Bot
scp -r ./* your-username@your-server-ip:~/egg-shen-bot/
```

**Option B: Using Git** (recommended):
1. Create a private GitHub repository
2. Push your code (the .gitignore already protects .env):
   ```bash
   git init
   git add .
   git commit -m "Initial commit - Egg Shen bot"
   git remote add origin YOUR_REPO_URL
   git push -u origin main
   ```
3. On the server, clone the repo:
   ```bash
   git clone YOUR_REPO_URL ~/egg-shen-bot
   cd ~/egg-shen-bot
   ```

## Step 3: Configure Environment Variables

On your server, create the `.env` file with your credentials:
```bash
cd ~/egg-shen-bot
nano .env
```

Paste the following (with your actual values):
```env
# Discord Bot Configuration
DISCORD_TOKEN=YOUR_DISCORD_TOKEN
DISCORD_CLIENT_ID=YOUR_CLIENT_ID

# API Keys
TMDB_API_KEY=YOUR_TMDB_KEY
OMDB_API_KEY=YOUR_OMDB_KEY
TRAKT_CLIENT_ID=YOUR_TRAKT_KEY

# Optional: Guild ID for testing (leave empty for global commands)
# GUILD_ID=

# Optional: Custom Discord Emoji IDs
EMOJI_IMDB=
EMOJI_LETTERBOXD=
EMOJI_TRAKT=
EMOJI_RT_CRITICS=
EMOJI_RT_AUDIENCE=
EMOJI_JUSTWATCH=
```

Save and exit (Ctrl+X, then Y, then Enter).

## Step 4: Install Dependencies

On your server:
```bash
cd ~/egg-shen-bot
npm install
```

## Step 5: Deploy Commands

Deploy the bot commands to Discord:
```bash
npm run deploy-commands
```

You should see: `✓ Successfully deployed 4 commands globally`

## Step 6: Start the Bot with PM2

Create logs directory:
```bash
mkdir -p logs
```

Start the bot:
```bash
pm2 start ecosystem.config.js
```

Check the bot status:
```bash
pm2 status
```

View logs:
```bash
pm2 logs egg-shen-bot
```

## Step 7: Configure PM2 for Auto-Start

Make PM2 start on server reboot:
```bash
pm2 startup
pm2 save
```

Follow any instructions displayed by the `pm2 startup` command.

## Managing the Bot

**View status:**
```bash
pm2 status
```

**View logs:**
```bash
pm2 logs egg-shen-bot
```

**Restart the bot:**
```bash
pm2 restart egg-shen-bot
```

**Stop the bot:**
```bash
pm2 stop egg-shen-bot
```

**Update the bot after code changes:**
```bash
cd ~/egg-shen-bot
git pull  # If using Git
npm install  # If dependencies changed
pm2 restart egg-shen-bot
```

## Troubleshooting

**Bot not responding:**
1. Check logs: `pm2 logs egg-shen-bot`
2. Verify .env file has correct values: `cat .env`
3. Check bot status: `pm2 status`

**Commands not appearing:**
- Global commands take up to 1 hour to propagate
- For instant updates during testing, add GUILD_ID to .env and redeploy

**Out of memory errors:**
- Increase `max_memory_restart` in ecosystem.config.js
- Restart: `pm2 restart egg-shen-bot`

## Security Notes

- Never commit `.env` to Git (already in .gitignore)
- Keep your Discord token and API keys secure
- Consider setting up a firewall on your Linode server
- Regularly update Node.js and dependencies

## API Rate Limits

- **TMDB:** 1,000 requests/day (free tier)
- **OMDB:** 1,000 requests/day (paid tier)
- **Trakt:** 10,000 requests/day (free tier)

Monitor usage if the server grows large!

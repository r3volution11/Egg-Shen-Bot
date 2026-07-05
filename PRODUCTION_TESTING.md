# Testing Event Requests on Production Server

This guide walks through testing the event request system on your production server (172.239.155.166) using your test Discord server.

## Overview

You want to:
1. ✅ Push code to production server
2. ✅ Test event requests with your test Discord server first
3. ✅ Once working, enable for other servers (like Shudder)

## Prerequisites

- [ ] Code changes committed and pushed to GitHub
- [ ] Discord Client Secret from Developer Portal
- [ ] Access to production server (172.239.155.166)

## Step 1: Update Discord Developer Portal

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your bot application
3. Navigate to **OAuth2 → Redirects**
4. Add: `http://172.239.155.166:3000/api/auth/discord/callback`
5. Click **Save Changes**

::: warning Important
Keep your existing `http://localhost:3000/api/auth/discord/callback` for local development!
:::

## Step 2: Update Production Server .env

SSH into your production server:

```bash
ssh root@172.239.155.166
cd /opt/discord-bot
```

Edit the `.env` file and add/update these lines:

```env
# Add your Discord Client Secret (from Developer Portal)
DISCORD_CLIENT_SECRET=your_client_secret_here

# Event Request API Configuration
API_PORT=3000
OAUTH_REDIRECT_URI=http://172.239.155.166:3000/api/auth/discord/callback
FORM_URL=http://172.239.155.166:8080
ALLOWED_ORIGINS=http://172.239.155.166:8080,https://shudderdrivein.com
```

::: tip Use Template
You can use `.env.production-testing` as a template:
```bash
cat .env.production-testing
# Copy the relevant lines to your .env
```
:::

## Step 3: Deploy Code Changes

From your local machine:

```bash
# Make sure all changes are committed
git add .
git commit -m "Add event request system"
git push origin main
```

On production server:

```bash
cd /opt/discord-bot
git pull origin main
pm2 restart egg-shen-bot
```

Verify the bot restarted successfully:

```bash
pm2 logs egg-shen-bot --lines 20
```

You should see: `✓ API server listening on port 3000`

## Step 4: Serve the Web Form

The `/public` folder contains the event request form. Serve it on port 8080:

```bash
cd /opt/discord-bot/public
python3 -m http.server 8080 &
```

::: tip Keep It Running
To make it persistent, consider:
- Using `screen` or `tmux`
- Adding to PM2 as a static server
- Using nginx to serve the files
:::

**Example with PM2:**

```bash
npm install -g http-server
pm2 start http-server --name "event-form" -- public -p 8080
pm2 save
```

## Step 5: Configure Your Test Discord Server

In your test Discord server, run these commands:

```
/eggshen-config event-requests toggle enabled:true
/eggshen-config event-requests moderation-channel channel:#event-requests
/eggshen-config event-requests server-name name:"Egg Shen Test Server"
/eggshen-config event-requests website-url url:http://172.239.155.166:8080
/eggshen-config event-requests get-link
```

The last command will give you a link like:
```
http://172.239.155.166:8080?guild=1515874601534754887
```

## Step 6: Test the Event Request Flow

1. **Open the link** from Step 5 in your browser
2. **Click "Login with Discord"** - should redirect to Discord OAuth
3. **Authorize the bot** - should redirect back to the form
4. **Fill out the form:**
   - Title: "Test Movie Night"
   - Description: "Testing the event request system"
   - Channel: Select a voice channel
   - Start Time: Tomorrow at 8 PM
5. **Submit the request**
6. **Check your moderation channel** in Discord
7. **Click "Approve & Create Event"**
8. **Verify the Discord Scheduled Event was created**

## Step 7: Verify Everything Works

Check the bot logs:

```bash
pm2 logs egg-shen-bot --lines 50
```

Look for:
- `✓ API server listening on port 3000`
- `[OAuth]` log entries showing successful authentication
- `[EventRequest]` log entries showing request submission
- No errors

## Troubleshooting

### Can't Connect to Form

```bash
# Check if port 8080 is open
netstat -tuln | grep 8080

# Check firewall (if using UFW)
sudo ufw status
sudo ufw allow 8080/tcp

# Restart the web server
pkill -f "python3 -m http.server 8080"
cd /opt/discord-bot/public && python3 -m http.server 8080 &
```

### OAuth Redirect Not Working

1. Verify redirect URI in Discord Developer Portal matches **exactly**
2. Check `.env` has `DISCORD_CLIENT_SECRET` set
3. Restart the bot: `pm2 restart egg-shen-bot`
4. Check logs: `pm2 logs egg-shen-bot`

### Bot API Not Responding

```bash
# Check if bot is running
pm2 status

# Check API port
netstat -tuln | grep 3000

# Restart bot
pm2 restart egg-shen-bot

# View logs
pm2 logs egg-shen-bot --lines 50
```

### CORS Errors

Check `ALLOWED_ORIGINS` in `.env` includes your server IP:
```env
ALLOWED_ORIGINS=http://172.239.155.166:8080,https://shudderdrivein.com
```

Restart after changing: `pm2 restart egg-shen-bot`

## Next Steps: Adding Production Servers

Once testing is successful, you can add other servers:

### For shudderdrivein.com

1. **Set up proper domain:**
   - Point shudderdrivein.com to your server
   - Set up nginx/Apache to serve `/public`
   - Enable HTTPS with Let's Encrypt

2. **Update `.env`:**
   ```env
   OAUTH_REDIRECT_URI=https://shudderdrivein.com/api/auth/discord/callback
   FORM_URL=https://shudderdrivein.com
   ALLOWED_ORIGINS=https://shudderdrivein.com
   ```

3. **Update Discord Developer Portal:**
   - Add: `https://shudderdrivein.com/api/auth/discord/callback`

4. **Configure the Shudder Discord server:**
   ```
   /eggshen-config event-requests toggle enabled:true
   /eggshen-config event-requests moderation-channel channel:#their-mod-channel
   /eggshen-config event-requests server-name name:"Shudder Discord"
   /eggshen-config event-requests website-url url:https://shudderdrivein.com
   /eggshen-config event-requests invite-url url:https://discord.gg/shudder
   /eggshen-config event-requests get-link
   ```

5. **Share the link** with the Shudder community

## Security Notes

- ✅ Use HTTPS for production domains
- ✅ Keep `DISCORD_CLIENT_SECRET` secure
- ✅ Only share event request links with trusted communities
- ✅ Monitor logs for abuse
- ✅ Rate limiting is built-in (1 request per 5 minutes per user)

## PM2 Setup for Both Services

Keep both the bot and web form running:

```bash
# Bot
pm2 restart egg-shen-bot

# Web form (if using PM2)
pm2 start http-server --name "event-form" -- public -p 8080

# Save configuration
pm2 save

# Set up startup script
pm2 startup
```

## Quick Reference

### Production Server Info
- **IP:** 172.239.155.166
- **User:** root
- **Bot Path:** /opt/discord-bot
- **PM2 Process:** egg-shen-bot

### Ports
- **Bot API:** 3000
- **Web Form:** 8080

### Important Commands
```bash
# Connect to server
ssh root@172.239.155.166

# Check bot status
pm2 status
pm2 logs egg-shen-bot --lines 30

# Restart bot
pm2 restart egg-shen-bot

# Update code
cd /opt/discord-bot && git pull && pm2 restart egg-shen-bot

# Start web form
cd /opt/discord-bot/public && python3 -m http.server 8080 &
```

### Test Server Details
- **Guild ID:** 1515874601534754887
- **Name:** "Egg Shen Young Bot Tours in Little China, San Francisco"
- **Form URL:** http://172.239.155.166:8080?guild=1515874601534754887

## Support

If you run into issues:
1. Check bot logs: `pm2 logs egg-shen-bot`
2. Check the detailed setup guide: `EVENT_REQUEST_SETUP.md`
3. Check VitePress docs: `docs/features/event-requests.md`
4. Test locally first if needed

# Configuration

Configure Egg Shen Bot for your Discord server with powerful administrative controls and customization options.

## Server Configuration

Use the `/eggshen-config` command to configure bot behavior for your server. Only administrators can modify these settings.

## Basic Settings

### View Current Configuration

See all current settings for your server:

```
/eggshen-config settings view
```

### Toggle Services

Enable or disable rating/streaming services in search results:

```
/eggshen-config settings toggle service:<service> enabled:<true/false>
```

Available services: IMDb, Letterboxd, Trakt, Rotten Tomatoes, JustWatch

### Custom Service Emojis

Set custom emojis for rating services:

```
/eggshen-config settings emoji service:<service> emoji:<emoji>
```

Leave emoji blank to clear and use default.

### Streaming Region

Set the region for streaming availability results:

```
/eggshen-config settings region code:<XX>
```

Uses ISO 3166-1 country codes (US, CA, GB, AU, etc.)

### Maximum Search Results

Control how many results appear in selection menus (1-50):

```
/eggshen-config settings max-results count:<number>
```

## Statistics Tracking

### Toggle Statistics

Enable or disable statistics tracking:

```
/eggshen-config stats toggle setting:<setting> enabled:<true/false>
```

Options:
- **All Stats Tracking** - Master switch for all statistics
- **Movie Tracking** - Track movie searches only
- **TV Show Tracking** - Track TV show searches only
- **Episode Tracking** - Track episode searches only

### Clear Statistics

Remove all collected statistics for your server:

```
/eggshen-config stats clear
```

⚠️ **Warning**: This action cannot be undone.

## Command Permissions

Control whether regular users can access specific commands:

```
/eggshen-config commands toggle setting:<setting> enabled:<true/false>
```

Options:
- **All Commands** - Master switch disables/enables everything
- **Movie Command** - Toggle `/movie` access
- **TV Command** - Toggle `/tv` access
- **Episode Command** - Toggle `/episode` access

Note: Administrators and moderators can always use commands.

## Notifications

Control bot notification behavior:

```
/eggshen-config notifications toggle setting:<setting> enabled:<true/false>
```

Currently supports:
- **Restart Announcements** - Notify channels when bot restarts and restores timers

## Watch Party Configuration

Configure channels where timer auto-detection works. When a timer starts in these channels, the bot automatically detects active Discord events and uses the event name as the timer label.

### Add Watch Party Channel

```
/eggshen-config watch-party add channel:<#channel>
```

### Remove Watch Party Channel

```
/eggshen-config watch-party remove channel:<#channel>
```

### List Configured Channels

```
/eggshen-config watch-party list
```

## Rate Limiting

Protect your server from spam and abuse with comprehensive rate limiting.

### Enable/Disable Rate Limiting

```
/eggshen-config rate-limit toggle enabled:<true/false>
```

### Global Rate Limits

Set default rate limits for all commands:

```
/eggshen-config rate-limit global max-requests:<number> window-seconds:<number>
```

Example: Allow 10 requests per 60 seconds

### Command-Specific Limits

Set custom rate limits for specific commands:

```
/eggshen-config rate-limit command command:<command> max-requests:<number> window-seconds:<number>
```

Available commands: movie, tv, episode, episode-list, timer, stats

Set max-requests to 0 to remove custom limit and use global default.

### Guild-Wide Rate Limiting

Prevent multi-account flooding by limiting total server activity:

```
/eggshen-config rate-limit guild-wide enabled:<true/false> max-requests:<number> window-seconds:<number>
```

### Pattern Detection

Detect suspicious coordinated activity patterns:

```
/eggshen-config rate-limit pattern-detection enabled:<true/false> min-users:<number>
```

Flags suspicious activity when multiple users exhibit similar spam patterns.

### Moderator Bypass

Allow moderators to bypass rate limits:

```
/eggshen-config rate-limit bypass enabled:<true/false>
```

### View Rate Limits

See current rate limit configuration:

```
/eggshen-config rate-limit view
```

### Clear User Rate Limits

Admin override to clear rate limits for a specific user:

```
/eggshen-config rate-limit clear user:<@user>
```

### View Suspicious Activity

See recent patterns flagged by pattern detection:

```
/eggshen-config rate-limit suspicious-activity
```

### View Abuse Log

Track individual user violations:

```
/eggshen-config rate-limit abuse-log
```

## Moderation Features

Advanced moderation tools for managing user behavior.

### Enable/Disable Moderation

```
/eggshen-config moderation toggle enabled:<true/false>
```

### User Cooldowns

Temporarily prevent a user from using bot commands:

```
/eggshen-config moderation user-cooldown user:<@user> duration:<minutes> reason:<text>
```

Maximum duration: 10,080 minutes (1 week)

### Remove Cooldown

```
/eggshen-config moderation user-cooldown-remove user:<@user>
```

### List Active Cooldowns

```
/eggshen-config moderation user-cooldown-list
```

### Whitelist Mode

When enabled, only whitelisted roles and users can use commands:

```
/eggshen-config moderation whitelist-toggle enabled:<true/false>
```

### Manage Whitelist

Add/remove roles:
```
/eggshen-config moderation whitelist-add-role role:<@role>
/eggshen-config moderation whitelist-remove-role role:<@role>
```

Add/remove users:
```
/eggshen-config moderation whitelist-add-user user:<@user>
/eggshen-config moderation whitelist-remove-user user:<@user>
```

View whitelist:
```
/eggshen-config moderation whitelist-list
```

### Auto-Ban Notifications

Enable notifications when users trigger auto-ban thresholds:

```
/eggshen-config moderation auto-ban-toggle enabled:<true/false>
```

## Configuration Best Practices

### Small Servers (< 100 members)
- Moderate rate limits (10 requests/60 seconds)
- Disable pattern detection (low user count may cause false positives)
- Keep whitelist mode off unless needed

### Medium Servers (100-1,000 members)
- Stricter rate limits (5 requests/60 seconds)
- Enable pattern detection with min-users: 3
- Consider guild-wide rate limits
- Enable restart announcements for active watch party channels

### Large Servers (1,000+ members)
- Maximum protection (3 requests/60 seconds)
- Enable all rate limiting features
- Pattern detection with min-users: 5+
- Guild-wide limits required
- Whitelist mode for emergency spam situations

## Environment Variables

Bot administrators should configure these environment variables in `.env`:

### Required
- `DISCORD_TOKEN` - Your Discord bot token
- `DISCORD_CLIENT_ID` - Your Discord application client ID
- `TMDB_API_KEY` - The Movie Database API key (required for movie/TV data)

### Optional
- `OMDB_API_KEY` - Open Movie Database API key (additional metadata)
- `TRAKT_CLIENT_ID` - Trakt.tv API key (trending data)
- `RAWG_API_KEY` - RAWG API key (game database access)
- `BGG_CLIENT_ID` - BoardGameGeek API key (board game data)
- `GUILD_ID` - For testing: Deploy commands instantly to one server

See the [API Keys Guide](/api-keys) and [Installation Guide](/installation) for detailed setup instructions.

## Troubleshooting

### Commands Not Working
- Verify bot has proper permissions in the channel
- Check if rate limiting is blocking commands with `/eggshen-config rate-limit view`
- Ensure command isn't disabled with `/eggshen-config commands toggle`
- Verify you're not in a user cooldown with `/eggshen-config moderation user-cooldown-list`

### Rate Limiting Too Strict
- View current limits: `/eggshen-config rate-limit view`
- Adjust global or command-specific limits
- Enable moderator bypass for staff
- Use `/eggshen-config rate-limit clear user:@user` to help specific users

### Timer Auto-Detection Not Working
- Verify channel is added to watch-party list: `/eggshen-config watch-party list`
- Ensure you have an ACTIVE Discord event in the server
- Check that the event location field mentions the channel (by name, ID, or mention)
- Event must be in "Active" status (not Scheduled or Completed)

### Missing Features
- Ensure all required API keys are configured in `.env`
- Verify bot permissions include necessary intents
- Commands requiring optional APIs won't appear if keys aren't configured

# Configuration

Configure Egg Shen Bot for your Discord server with powerful administrative controls and customization options.

## Server Configuration

Use the `/eggshen-config` command to configure bot behavior for your server. Only administrators can modify these settings.

## Configuration Options

### Rate Limiting

Control how frequently users can interact with the bot to prevent spam and abuse.

```
/eggshen-config rate-limiting <enabled: true/false>
```

When enabled, the bot enforces a 7-layer rate limiting system:
- Per-user cooldowns
- Guild-wide rate limits
- Pattern detection
- Abuse logging
- Auto-ban thresholds
- Manual cooldowns
- Whitelist mode

Learn more in the [Rate Limiting documentation](/features/rate-limiting).

### Abuse Logging

Track and log suspicious activity to help moderators identify and handle abuse.

```
/eggshen-config abuse-logging <enabled: true/false>
```

When enabled:
- Logs rate limit violations
- Tracks spam patterns
- Records auto-ban events
- Provides audit trail for moderation

### Notifications

Configure notifications for new releases and trending content.

```
/eggshen-config notifications <enabled: true/false>
```

Features:
- New movie/TV release alerts
- Trending content notifications
- Watch party reminders
- Customizable notification channels

### Mod Logs Channel

Set a dedicated channel for moderation logs and bot administrative actions.

```
/eggshen-config mod-logs-channel <channel>
```

Logs include:
- Rate limit violations
- Auto-ban actions
- Watch history moderation
- Configuration changes

## Configuration Best Practices

### Small Servers (< 100 members)
- Keep rate limiting moderate
- Enable abuse logging for visibility
- Single mod logs channel is sufficient

### Medium Servers (100-1,000 members)
- Stricter rate limits recommended
- Abuse logging essential
- Consider dedicated notification channels

### Large Servers (1,000+ members)
- Maximum rate limiting protection
- Abuse logging required
- Separate channels for different log types
- Consider whitelist mode for trusted users

## Environment Variables

Bot administrators should configure these environment variables in `.env`:

### Required
- `DISCORD_TOKEN` - Your Discord bot token
- `DISCORD_CLIENT_ID` - Your Discord application client ID
- `TMDB_API_KEY` - The Movie Database API key (required for movie/TV data)

### Optional
- `OMDB_API_KEY` - Open Movie Database API key (additional metadata)
- `TRAKT_API_KEY` - Trakt.tv API key (watch history integration)
- `RAWG_API_KEY` - RAWG API key (game database access)

See the [Installation Guide](/installation) for detailed setup instructions.

## Troubleshooting

### Commands Not Working
- Verify bot has proper permissions in the channel
- Check if rate limiting is blocking commands
- Review mod logs for error messages

### Rate Limiting Too Strict
- Adjust thresholds in rate limiting configuration
- Consider using whitelist mode for trusted users
- Check abuse logs to verify legitimate vs spam activity

### Missing Features
- Ensure all required API keys are configured
- Verify bot permissions include necessary intents
- Check that optional APIs are enabled if using their features

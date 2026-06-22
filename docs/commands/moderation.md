# Moderation Commands

Tools for moderating bot usage and maintaining server health.

## Rate Limit Management

Moderation is primarily handled through the bot's rate limiting system. See [Configuration Commands](/commands/configuration#rate-limit-group) for full details.

### Clear User Rate Limits

```
/eggshen-config rate-limit clear user:@user
```

Manually clear rate limits for a specific user who may be stuck.

**Required Permissions:**
- Administrator
- OR Manage Server permission

**Example:**
```
/eggshen-config rate-limit clear user:@MovieFan
```

### View Rate Limit Configuration

```
/eggshen-config rate-limit view
```

Shows current rate limiting settings, active limits, and user violations.

### Allow Moderator Bypass

```
/eggshen-config rate-limit bypass enabled:true
```

Enable this to allow moderators to bypass rate limits.

## Configuration

Most moderation is handled through configuration settings:

- **Rate Limiting:** `/eggshen-config rate-limit` - See [Configuration](/commands/configuration#rate-limit-group)
- **Command Toggles:** `/eggshen-config commands toggle` - Enable/disable commands for users
- **Statistics:** `/eggshen-stats` - View usage patterns and potential abuse

## Best Practices

### 1. Monitor Statistics

Review bot usage regularly with `/eggshen-stats` to identify:
- Heavy users
- Command usage patterns
- Potential abuse

### 2. Configure Rate Limits

Set appropriate rate limits based on your server size:

**Small servers (< 100 members):**
```
/eggshen-config rate-limit global max-requests:15 window-seconds:60
```

**Medium servers (100-1,000):**
```
/eggshen-config rate-limit global max-requests:10 window-seconds:60
```

**Large servers (1,000+):**
```
/eggshen-config rate-limit global max-requests:5 window-seconds:60
/eggshen-config rate-limit guild-wide enabled:true max-requests:20 window-seconds:60
```

### 3. Use Per-Command Limits

Restrict resource-intensive commands more than simple ones:

```
/eggshen-config rate-limit command command:movie max-requests:5 window-seconds:60
/eggshen-config rate-limit command command:episode-list max-requests:3 window-seconds:60
```

### 4. Enable Moderator Bypass

Let your mod team use the bot freely:

```
/eggshen-config rate-limit bypass enabled:true
```

### 5. Disable Commands if Needed

Temporarily disable commands during raids or high activity:

```
/eggshen-config commands toggle setting:enabled enabled:false
```

Re-enable when situation is under control.

## Troubleshooting

### User Stuck with Rate Limit

Clear their limits manually:
```
/eggshen-config rate-limit clear user:@user
```

### Too Much Spam

Tighten rate limits:
```
/eggshen-config rate-limit global max-requests:5 window-seconds:120
```

### Bot Not Responding to Anyone

Check if commands are disabled:
```
/eggshen-config settings view
```

If "Commands Enabled" shows false, re-enable:
```
/eggshen-config commands toggle setting:enabled enabled:true
```

### Rate Limits Too Strict

Check current settings:
```
/eggshen-config rate-limit view
```

Increase limits as needed:
```
/eggshen-config rate-limit global max-requests:20 window-seconds:60
```

## Related Documentation

- [Rate Limiting System](/features/rate-limiting) - Complete rate limiting guide
- [Configuration Commands](/commands/configuration) - All configuration options
- [Server Statistics](/features/statistics) - Usage tracking and analysis

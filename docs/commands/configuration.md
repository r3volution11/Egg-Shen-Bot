# Admin Configuration

Administrative commands for configuring and managing Egg Shen Bot in your server.

## Configuration Command

The main configuration command for server administrators.

```
/eggshen-config <setting> <value>
```

**Required Permissions:**
- Administrator
- OR Manage Server permission

## Available Settings

### Rate Limiting

Enable or disable the rate limiting system.

```
/eggshen-config rate-limiting <enabled>
```

**Parameters:**
- `enabled` - `true` or `false`

**When Enabled:**
- Enforces per-user cooldowns (3 seconds)
- Guild-wide rate limits active
- Pattern detection monitors abuse
- Auto-ban on excessive violations
- Protects against spam and abuse

**When Disabled:**
- No cooldowns between commands
- Higher risk of spam
- Useful for small, trusted communities

**Default:** `true`

Learn more: [Rate Limiting System](/features/rate-limiting)

---

### Abuse Logging

Enable or disable abuse logging and monitoring.

```
/eggshen-config abuse-logging <enabled>
```

**Parameters:**
- `enabled` - `true` or `false`

**When Enabled:**
- Logs all rate limit violations
- Tracks spam patterns and abuse
- Records auto-ban events
- Provides audit trail for moderators
- Sends logs to mod-logs-channel if configured

**When Disabled:**
- No abuse tracking
- Violations not logged
- Less moderation visibility

**Default:** `true`

---

### Mod Logs Channel

Set a dedicated channel for moderation logs.

```
/eggshen-config mod-logs-channel <channel>
```

**Parameters:**
- `channel` - Discord channel mention or ID

**Logged Events:**
- Rate limit violations
- Auto-ban actions
- Watch history moderation
- Configuration changes
- Error messages and warnings

**Best Practice:**
- Create a private channel only visible to moderators
- Name it something like `#bot-logs` or `#mod-logs`
- Set appropriate permissions to prevent clutter

**Example:**
```
/eggshen-config mod-logs-channel #bot-logs
```

---

### Notifications

Enable or disable notifications for new releases and trending content.

```
/eggshen-config notifications <enabled>
```

**Parameters:**
- `enabled` - `true` or `false`

**When Enabled:**
- Sends new movie/TV release notifications
- Posts trending content updates
- Watch party reminders
- Customizable notification frequency

**When Disabled:**
- No automatic notifications
- Manual searches still work
- On-demand information only

**Default:** `false`

---

## View Current Configuration

```
/eggshen-config view
```

Displays all current server settings:
- Rate limiting status
- Abuse logging status
- Mod logs channel (if set)
- Notifications status
- API integrations enabled

## Reset to Defaults

```
/eggshen-config reset
```

Resets all settings to default values:
- Rate limiting: `enabled`
- Abuse logging: `enabled`
- Mod logs channel: `none`
- Notifications: `disabled`

**Warning:** This cannot be undone. Confirm before proceeding.

## Configuration Templates

### Small Server (< 100 members)
```
/eggshen-config rate-limiting true
/eggshen-config abuse-logging true
/eggshen-config mod-logs-channel #bot-logs
/eggshen-config notifications false
```

Balanced protection with visibility for small communities.

### Medium Server (100-1,000 members)
```
/eggshen-config rate-limiting true
/eggshen-config abuse-logging true
/eggshen-config mod-logs-channel #bot-logs
/eggshen-config notifications true
```

Stricter controls with active monitoring recommended.

### Large Server (1,000+ members)
```
/eggshen-config rate-limiting true
/eggshen-config abuse-logging true
/eggshen-config mod-logs-channel #bot-logs
/eggshen-config notifications true
```

Maximum protection essential for large communities. Consider additional moderation tools.

## Help Command

```
/help [command]
```

Get help with bot commands and features.

**Parameters:**
- `command` (optional) - Specific command to get help for

**Without parameters:** Shows overview of all commands

**With command name:** Shows detailed help for that command

**Examples:**
```
/help
/help timer
/help movie
/help eggshen-config
```

## Permissions Management

### Bot Permissions Required

Ensure the bot has these permissions in channels:
- Read Messages
- Send Messages
- Embed Links
- Attach Files
- Use External Emojis
- Add Reactions

### Admin Command Permissions

Only users with these permissions can run `/eggshen-config`:
- Administrator
- OR Manage Server

### Watch History Save Permissions

Users who can save to watch history:
- Timer starter (automatically)
- Administrator
- Manage Guild permission
- Moderate Members permission

## Troubleshooting

### Configuration not saving
- Verify you have Administrator or Manage Server permission
- Check bot has Write permissions to database
- Review mod logs for error messages

### Can't set mod logs channel
- Ensure bot has Send Messages permission in the channel
- Verify the channel exists and isn't deleted
- Bot must be able to see the channel

### Rate limiting too strict/loose
- Adjust rate limiting settings
- Review [Rate Limiting documentation](/features/rate-limiting)
- Consider server size and activity level

### Commands not working after configuration change
- Configuration changes are immediate
- Check `/eggshen-config view` to verify settings applied
- Restart bot if issues persist
- Review logs for error messages

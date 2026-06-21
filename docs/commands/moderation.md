# Moderation Commands

Tools for moderating bot usage and maintaining server health.

## Cooldown Management

Manually manage user cooldowns for rate limiting.

### Add Manual Cooldown

```
/cooldown add <user> <duration>
```

**Parameters:**
- `user` (required) - User to apply cooldown to
- `duration` (required) - Cooldown duration (e.g., "5m", "1h", "30s")

**Required Permissions:**
- Moderate Members permission
- OR Administrator

**Duration Formats:**
- Seconds: `30s`, `90s`
- Minutes: `5m`, `30m`
- Hours: `1h`, `2h`
- Combined: `1h30m`, `2h15m30s`

**Use Cases:**
- Temporary timeout for spam behavior
- Manual intervention for abuse
- Testing rate limit behavior
- Gentle warning before ban

**Example:**
```
/cooldown add @SpammyUser 15m
```

### Remove Cooldown

```
/cooldown remove <user>
```

**Parameters:**
- `user` (required) - User to remove cooldown from

**Required Permissions:**
- Moderate Members permission
- OR Administrator

**Use Cases:**
- Lift cooldown early
- Correct accidental cooldown
- Whitelist trusted user temporarily

### Check Cooldown Status

```
/cooldown status <user>
```

**Parameters:**
- `user` (required) - User to check cooldown status for

Shows:
- Whether user has active cooldown
- Time remaining
- Reason for cooldown (if manual)
- Auto-ban status

### List Active Cooldowns

```
/cooldown list
```

Displays all users currently under cooldown:
- User name and ID
- Time remaining
- Cooldown type (auto/manual)
- Reason

**Required Permissions:**
- Moderate Members permission
- OR Administrator

## Watch History Moderation

Moderate and manage server watch history.

### Remove History Entry

```
/watched remove <id>
```

**Parameters:**
- `id` (required) - History entry ID from `/watched list`

**Required Permissions:**
- Administrator only

**Use Cases:**
- Remove duplicate entries
- Delete inappropriate logs
- Clean up test entries
- Correct mistakes

**Example:**
```
/watched list
→ See entry IDs
/watched remove 42
```

### View Full History

```
/watched list [limit]
```

**Parameters:**
- `limit` (optional) - Number of entries to show (default: 10, max: 50)

Shows complete watch history with:
- Entry IDs for moderation
- Titles and dates
- Channels and who saved it
- Notes from viewers

**Example:**
```
/watched list 25
```

## Ban Management

Review and manage auto-bans from rate limiting violations.

### View Ban Status

```
/ban-status <user>
```

**Parameters:**
- `user` (required) - User to check ban status for

Shows:
- Whether user is auto-banned
- Number of violations
- When ban expires
- Recent violation history

### Remove Auto-Ban

```
/ban-remove <user>
```

**Parameters:**
- `user` (required) - User to remove auto-ban from

**Required Permissions:**
- Administrator only

**Use Cases:**
- Lift ban early for reformed behavior
- Correct false positive
- Whitelist trusted user

**Warning:** User can accumulate violations again after removal.

### Ban History

```
/ban-history [user]
```

**Parameters:**
- `user` (optional) - Specific user to check

**Without user:** Shows server-wide ban history
**With user:** Shows that user's ban/violation history

Displays:
- Date and time of violations
- Type of abuse detected
- Duration of bans
- Whether bans were lifted early

## Whitelist Mode

Temporarily restrict bot to trusted users only.

### Enable Whitelist Mode

```
/whitelist-mode enable
```

**Required Permissions:**
- Administrator only

**Effect:**
- Only whitelisted users can use bot commands
- All others receive "Bot in maintenance mode" message
- Useful during raids or heavy spam

### Disable Whitelist Mode

```
/whitelist-mode disable
```

Returns bot to normal operation for all users.

### Add to Whitelist

```
/whitelist add <user>
```

**Parameters:**
- `user` (required) - User to whitelist

Allows user to bypass whitelist mode restrictions.

### Remove from Whitelist

```
/whitelist remove <user>
```

**Parameters:**
- `user` (required) - User to remove from whitelist

### View Whitelist

```
/whitelist list
```

Shows all currently whitelisted users.

## Abuse Reports

Review abuse logs and patterns.

### View Recent Abuse

```
/abuse-log [limit]
```

**Parameters:**
- `limit` (optional) - Number of entries to show (default: 20, max: 100)

**Required Permissions:**
- Moderate Members permission
- OR Administrator

Displays:
- User and violation type
- Timestamp
- Command attempted
- Auto-action taken (cooldown/ban)

### Abuse Patterns

```
/abuse-patterns <user>
```

**Parameters:**
- `user` (required) - User to analyze

Shows behavioral patterns:
- Commands used most frequently
- Peak usage times
- Violation rate
- Spam indicators

**Use for:**
- Identifying bot abuse
- Distinguishing legitimate heavy users from spammers
- Making ban/cooldown decisions

## Moderation Best Practices

### 1. Monitor Regularly
- Review abuse logs weekly
- Check for repeat offenders
- Look for unusual patterns

### 2. Progressive Discipline
1. First offense: Automatic cooldown (3-5 minutes)
2. Second offense: Manual cooldown (15-30 minutes)
3. Third offense: Longer cooldown (1-2 hours)
4. Persistent abuse: Auto-ban or manual Discord timeout

### 3. Communication
- Set clear rules about bot usage
- Post limits in server rules
- Warn users before manual cooldowns
- Explain bans if users ask

### 4. False Positives
- Check abuse patterns before banning
- Consider legitimate use cases
- Whitelist power users if needed
- Adjust rate limits for server size

### 5. Log Everything
- Keep mod logs channel active
- Document manual actions
- Track patterns over time
- Use logs for appeals process

## Rate Limiting Integration

Moderation commands work alongside the [Rate Limiting System](/features/rate-limiting):

1. **Automatic Layer** - Bot enforces rate limits
2. **Logging Layer** - Abuse is recorded
3. **Moderation Layer** - Moderators review and take action
4. **Manual Layer** - Override with cooldowns/bans as needed

See [Rate Limiting documentation](/features/rate-limiting) for full details.

## Troubleshooting

### Cooldowns not applying
- Verify user ID is correct
- Check moderator has proper permissions
- Review mod logs for error messages

### Can't remove watch history
- Ensure you have Administrator permission
- Verify entry ID is correct from `/watched list`
- Entry may have been already removed

### Abuse logs empty
- Check if abuse logging is enabled (`/eggshen-config view`)
- Verify mod logs channel is set
- May indicate no abuse (good thing!)

### Too many false positive bans
- Review rate limiting thresholds
- Consider increasing limits for your server size
- Use whitelist mode during events
- Adjust auto-ban threshold in configuration

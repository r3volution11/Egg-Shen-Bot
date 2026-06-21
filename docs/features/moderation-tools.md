# Moderation Tools

Comprehensive moderation features to keep your Discord server safe and spam-free.

## Overview

Egg Shen Bot includes built-in moderation tools designed specifically for movie, TV, and gaming communities. These tools help prevent abuse while allowing legitimate users to enjoy bot features freely.

## Key Features

### 🛡️ Multi-Layer Protection

The bot uses a 7-layer rate limiting system:

1. **Per-User Cooldowns** - Prevents individual spam
2. **Guild-Wide Limits** - Protects server resources
3. **Pattern Detection** - Identifies abuse automatically
4. **Abuse Logging** - Tracks violations for review
5. **Auto-Ban Thresholds** - Automatic temporary bans
6. **Manual Cooldowns** - Moderator override controls
7. **Whitelist Mode** - Emergency lockdown capability

Learn more: [Rate Limiting System](/features/rate-limiting)

### 📊 Abuse Analytics

Track and analyze bot usage patterns:
- Real-time violation monitoring
- User behavior analysis
- Spam pattern detection
- Historical abuse reports

### ⚡ Quick Actions

Moderators can take immediate action:
- Apply manual cooldowns
- Remove auto-bans
- Whitelist trusted users
- Enable emergency mode

### 📝 Comprehensive Logging

All moderation events are logged:
- Rate limit violations
- Auto-ban triggers
- Manual moderator actions
- Watch history changes
- Configuration updates

## Moderation Workflow

### 1. Automatic Protection

The bot automatically handles most abuse:

```
User spams commands → Cooldown applied → Logged to mod channel
```

No moderator action required for routine violations.

### 2. Pattern Detection

The system watches for abuse patterns:

```
Repeated violations → Auto-ban triggered → Moderator notified
```

Moderators can review and adjust as needed.

### 3. Manual Intervention

For edge cases, moderators can intervene:

```
Review abuse log → Apply manual cooldown → Monitor behavior
```

See [Moderation Commands](/commands/moderation) for full details.

## Permission Levels

### Bot Commands (All Users)
- Search commands (`/movie`, `/tv`, `/game`)
- Watch party participation
- View watch history
- Basic utility commands

### Watch History Saves
- Timer starters (automatically)
- Administrators
- Users with Manage Guild permission
- Users with Moderate Members permission

### Moderation Commands
- Moderate Members permission
- OR Administrator

### Configuration Commands
- Administrator
- OR Manage Server permission

### Advanced Moderation
- Administrator only:
  - Remove watch history
  - Remove auto-bans
  - Enable whitelist mode
  - Reset configuration

## Abuse Prevention Strategies

### For Small Servers (< 100 members)

**Recommended Settings:**
```
Rate Limiting: Enabled (moderate)
Abuse Logging: Enabled
Auto-Ban: Enabled (higher threshold)
Whitelist Mode: Off
```

**Strategy:**
- Trust-based moderation
- Review logs weekly
- Personal warnings before bans
- Focus on community building

### For Medium Servers (100-1,000 members)

**Recommended Settings:**
```
Rate Limiting: Enabled (strict)
Abuse Logging: Enabled
Auto-Ban: Enabled (moderate threshold)
Whitelist Mode: Available for events
```

**Strategy:**
- Automated first response
- Regular log reviews
- Clear posted rules
- Progressive discipline

### For Large Servers (1,000+ members)

**Recommended Settings:**
```
Rate Limiting: Enabled (very strict)
Abuse Logging: Enabled
Auto-Ban: Enabled (low threshold)
Whitelist Mode: Ready for raids
```

**Strategy:**
- Heavy automation required
- Dedicated mod team
- Strict enforcement
- Proactive monitoring

## Common Moderation Scenarios

### Scenario: Accidental Spam

**Situation:** User legitimately using bot but triggering cooldowns

**Solution:**
1. Check abuse patterns (`/abuse-patterns @user`)
2. Verify legitimate use
3. Add to whitelist if power user
4. OR increase server rate limits

### Scenario: Intentional Abuse

**Situation:** User deliberately spamming to disrupt

**Actions:**
1. Auto-cooldown triggers (automatic)
2. Review violation history (`/ban-status @user`)
3. Apply manual cooldown if needed (`/cooldown add`)
4. Discord timeout or ban if persistent

### Scenario: Raid or Bot Attack

**Situation:** Multiple accounts spamming simultaneously

**Emergency Response:**
1. Enable whitelist mode (`/whitelist-mode enable`)
2. Review abuse logs (`/abuse-log`)
3. Report to Discord Trust & Safety
4. Ban attacking accounts
5. Disable whitelist mode when clear

### Scenario: False Positive Ban

**Situation:** Legitimate user auto-banned incorrectly

**Resolution:**
1. Review user's abuse patterns
2. Check if genuine mistake
3. Remove auto-ban (`/ban-remove @user`)
4. Add to whitelist temporarily
5. Apologize and explain

## Integration with Watch History

Watch history has special moderation features:

### Save Restrictions
- Only timer starter or moderators can save
- Prevents random users from polluting history
- Public accountability (saved by username shown)

### Removal Powers
- Only administrators can remove entries
- Prevents casual deletion
- Maintains server history integrity

### Audit Trail
- All saves logged with username
- Timestamp and channel recorded
- Full history visible to all

See [Watch History](/features/watch-history) for more details.

## Moderation Commands Quick Reference

| Command | Permission | Purpose |
|---------|-----------|---------|
| `/cooldown add` | Moderate Members | Apply manual cooldown |
| `/cooldown remove` | Moderate Members | Lift cooldown early |
| `/cooldown list` | Moderate Members | View active cooldowns |
| `/ban-status` | Moderate Members | Check user ban status |
| `/ban-remove` | Administrator | Remove auto-ban |
| `/abuse-log` | Moderate Members | View abuse logs |
| `/abuse-patterns` | Moderate Members | Analyze user behavior |
| `/watched remove` | Administrator | Remove history entry |
| `/whitelist-mode` | Administrator | Emergency lockdown |
| `/whitelist add/remove` | Administrator | Manage whitelist |

Full documentation: [Moderation Commands](/commands/moderation)

## Best Practices

### ✅ Do

- Review abuse logs regularly
- Document moderation actions
- Communicate rules clearly
- Use progressive discipline
- Adjust limits for server size
- Whitelist known power users
- Keep mod logs channel active

### ❌ Don't

- Disable rate limiting entirely
- Ignore repeated violations
- Ban without checking patterns
- Apply inconsistent discipline
- Over-moderate legitimate users
- Forget to remove temporary cooldowns
- Leave whitelist mode enabled indefinitely

## Analytics and Reporting

### Daily Review

Check these daily:
- Recent abuse logs
- Active cooldowns
- Auto-ban triggers

### Weekly Review

Analyze these weekly:
- Violation patterns
- False positive rate
- Rate limit effectiveness
- User behavior trends

### Monthly Review

Review these monthly:
- Overall abuse statistics
- Moderation action frequency
- Rate limit configuration
- Rule effectiveness

## Troubleshooting

### Too Many False Positives

**Symptoms:** Legitimate users frequently hit cooldowns

**Solutions:**
- Increase rate limit thresholds
- Whitelist power users
- Review pattern detection settings
- Consider server activity level

### Not Catching Abuse

**Symptoms:** Spam getting through, users complaining

**Solutions:**
- Decrease rate limit thresholds
- Enable abuse logging if disabled
- Lower auto-ban threshold
- Add more moderators to monitor

### Mod Logs Too Noisy

**Symptoms:** Too many notifications, hard to find important events

**Solutions:**
- Adjust what gets logged
- Create separate channels for different log types
- Use Discord notification settings
- Filter by keyword

## Support

For moderation issues:

1. Check this documentation
2. Review [Rate Limiting docs](/features/rate-limiting)
3. Check [Configuration guide](/configuration)
4. Ask in bot support channel
5. Report bugs on [GitHub Issues](https://github.com/r3volution11/Egg-Shen-Bot/issues)

# Rate Limiting & Anti-Abuse

Egg Shen Bot includes a comprehensive multi-layered rate limiting system to prevent abuse, channel flooding, and coordinated attacks while maintaining a smooth experience for legitimate users.

## Overview

The rate limiting system has **7 layers** of protection:

1. **Per-User Limits** - Prevent individual spam
2. **Guild-Wide Limits** - Stop multi-account flooding  
3. **Pattern Detection** - Flag coordinated attacks
4. **Abuse Logging** - Track individual violations
5. **Auto-Ban Threshold** - Warn persistent abusers
6. **Manual Cooldowns** - Temporary restrictions
7. **Whitelist Mode** - Full access control

## Default Settings

```javascript
{
  rateLimits: {
    enabled: true,
    bypassForModerators: true,
    global: {
      maxRequests: 1,
      windowSeconds: 20
    },
    guildWide: {
      enabled: true,
      maxRequests: 10,
      windowSeconds: 60
    },
    patternDetection: {
      enabled: true,
      minUsers: 3
    }
  }
}
```

**Why 1 per 20 seconds?**
- Prevents burst flooding (can't rapid-fire embeds)
- Matches natural API response times (~10s)
- Still allows corrections with reasonable spacing
- Can be increased for trusted servers

## Layer 1: Per-User Limits

Limits how often an individual user can run commands.

### Configuration

```
/eggshen-config rate-limit global max-requests:1 window-seconds:20
```

### Per-Command Overrides

Set custom limits for specific commands:

```
/eggshen-config rate-limit command command:episode-list max-requests:2 window-seconds:60
```

**Example use cases:**
- Stricter limits for heavy commands (`/episode-list`)
- Looser limits for simple commands (`/help`)
- Different limits based on server size

### Remove Command Override

```
/eggshen-config rate-limit command command:movie max-requests:0
```

Setting `max-requests:0` removes the override and reverts to global limit.

## Layer 2: Guild-Wide Limits

Prevents coordinated multi-account flooding by limiting **total** commands across ALL users.

### How It Works

- Tracks commands from **all users** in the server
- Independent of per-user limits (both are checked)
- Default: 10 commands per 60 seconds server-wide
- Prevents throwaway bot accounts from flooding

### Configuration

```
/eggshen-config rate-limit guild-wide enabled:true max-requests:10 window-seconds:60
```

### When to Adjust

**Increase (20-30 per 60s):**
- Large active servers with many legitimate users
- High-traffic movie/gaming communities
- Multiple concurrent users

**Decrease (5-10 per 60s):**
- Smaller servers
- Experiencing abuse
- Want stricter controls

**Disable:**
- Very small private servers
- Fully trusted member base

## Layer 3: Pattern Detection

Automatically detects suspicious coordinated activity.

### Detected Patterns

**1. Identical Commands**
- Multiple different accounts running the **exact same** command with identical arguments
- Flags when 3+ users (configurable) show this behavior within 60 seconds

**2. Coordinated Bursts**
- Multiple accounts firing many commands simultaneously
- Detects burst attacks within 10-second windows

### Configuration

```
/eggshen-config rate-limit pattern-detection enabled:true min-users:3
```

### Recommended Settings

- **2-3 users** - Strict detection, good for smaller servers
- **4-5 users** - Balanced, good for medium servers
- **6+ users** - Loose, good for large active servers

### View Detected Activity

```
/eggshen-config rate-limit suspicious-activity
```

Shows:
- Type of pattern detected
- Which users were involved
- When it occurred
- What command was being abused
- Kept for 24 hours

**Note:** Does not auto-ban - provides information for moderators to investigate.

## Layer 4: Abuse Logging

Tracks every individual rate limit violation.

### What's Logged

- Which user hit limits
- What command they tried
- Type of limit (per-user or guild-wide)
- Timestamp
- How many times they've violated

### View Abuse Log

```
/eggshen-config rate-limit abuse-log
```

**Shows:**
- Users with violations in last 48 hours
- Command breakdown
- Violation types
- Last violation time
- **Flags persistent abusers** (10+ violations) 🚨

### Use Cases

- Pattern detection catches **coordinated** abuse (3+ users)
- Abuse log catches **solo** abusers testing/spamming limits
- Provides evidence trail for bans
- Identifies users repeatedly hitting limits

## Layer 5: Auto-Ban Threshold

Warns users when they exceed violation threshold and flags them for moderator review.

### Configuration

```
/eggshen-config moderation auto-ban-toggle enabled:true
/eggshen-config moderation auto-ban-threshold count:20 hours:24
```

**Default:** 20 violations within 24 hours

### How It Works

1. User hits rate limits repeatedly
2. Violations accumulate in abuse log
3. When threshold exceeded:
   - User sees ⚠️ warning message
   - Moderators can check `/eggshen-config moderation auto-ban-list`
4. **Does NOT automatically ban** - moderators must act

### View Flagged Users

```
/eggshen-config moderation auto-ban-list
```

Shows users who exceeded threshold with:
- Total violation count
- Last violation time
- Sorted by most violations

### Recommended Thresholds

- **Strict (5-10 in 24h)** - Low-tolerance servers
- **Balanced (15-25 in 24h)** - Most servers (default: 20)
- **Lenient (30-50 in 24h)** - High-activity servers

## Layer 6: Manual Cooldowns

Temporary restrictions applied by administrators.

### Apply Cooldown

```
/eggshen-config moderation user-cooldown user:@spammer duration:60 reason:"Spamming commands"
```

- Duration in minutes (max 10,080 = 1 week)
- User sees reason and remaining time
- Auto-expires when duration completes

### Use Cases

- User is disruptive but doesn't warrant ban
- Give users "timeout" to cool down
- Temporary restriction during investigations
- Manual override when rate limits insufficient

### Remove Cooldown

```
/eggshen-config moderation user-cooldown-remove user:@spammer
```

### View Active Cooldowns

```
/eggshen-config moderation user-cooldown-list
```

Shows:
- Who is under cooldown
- Reason
- Who applied it and when
- When it expires

## Layer 7: Whitelist Mode

Full access control - only allow specific roles/users.

### Enable Whitelist

```
/eggshen-config moderation whitelist-toggle enabled:true
```

⚠️ **Only whitelisted users/roles and moderators can use commands!**

### Add to Whitelist

```
/eggshen-config moderation whitelist-add-role role:@Members
/eggshen-config moderation whitelist-add-user user:@trusted_user
```

### Remove from Whitelist

```
/eggshen-config moderation whitelist-remove-role role:@Members
/eggshen-config moderation whitelist-remove-user user:@trusted_user
```

### View Whitelist

```
/eggshen-config moderation whitelist-list
```

### Use Cases

- Private/exclusive communities
- Limit bot to paid/subscriber roles
- During watch parties or events
- Testing features with specific users
- Preventing new users from flooding

**Note:** Administrators and moderators always have access.

## Moderator Bypass

Allow moderators and administrators to bypass all rate limits.

```
/eggshen-config rate-limit bypass enabled:true
```

**Enabled by default** - useful for:
- Admins responding quickly to users
- Demonstrating features
- Testing commands
- Emergency situations

## Emergency Override

Clear rate limits for a specific user:

```
/eggshen-config rate-limit clear user:@username
```

Use if a user is accidentally rate-limited due to legitimate use.

## View Configuration

See all rate limiting and moderation settings:

```
/eggshen-config rate-limit view
```

Shows:
- Master switches (rate limiting, moderation)
- Per-user limits
- Guild-wide limits
- Pattern detection status
- Whitelist mode status
- Auto-ban threshold
- Custom command limits

## Configuration Tips

### Small Servers (10-50 users)
```
Per-user: 1 per 20s
Guild-wide: 5 per 60s
Pattern detection: 2-3 users
Auto-ban: 15 violations
```

### Medium Servers (50-200 users)
```
Per-user: 1 per 20s (or 2 per 30s)
Guild-wide: 10 per 60s
Pattern detection: 3-4 users
Auto-ban: 20 violations
```

### Large Servers (200+ users)
```
Per-user: 2 per 30s (or 3 per 60s)
Guild-wide: 20-30 per 60s
Pattern detection: 5-6 users
Auto-ban: 25-30 violations
```

### Trusted Private Servers
```
Per-user: 3 per 30s
Guild-wide: Disabled
Pattern detection: Disabled
Moderator bypass: Enabled
```

## Common Issues

### Too restrictive for legitimate users

**Solution:** Increase per-user limits or add trusted users to whitelist

```
/eggshen-config rate-limit global max-requests:2 window-seconds:30
```

### Still seeing spam/abuse

**Solutions:**
1. Enable guild-wide limiting
2. Lower pattern detection threshold
3. Enable auto-ban notifications
4. Apply manual cooldowns to offenders

### False positives in pattern detection

**Solution:** Increase `min-users` threshold

```
/eggshen-config rate-limit pattern-detection enabled:true min-users:5
```

## Best Practices

✅ **Keep moderator bypass enabled** - admins need quick access  
✅ **Monitor abuse logs regularly** - catch persistent violators  
✅ **Use cooldowns before bans** - give users a chance  
✅ **Adjust based on server size** - one size doesn't fit all  
✅ **Enable guild-wide limits** - stops multi-account attacks  
✅ **Review suspicious activity** - investigate coordinated abuse  
✅ **Document your rules** - users should know the limits  

❌ **Don't disable rate limiting entirely** - leaves server vulnerable  
❌ **Don't set limits too strict** - frustrates legitimate users  
❌ **Don't ignore abuse logs** - persistent violators escalate  
❌ **Don't forget to configure** - defaults may not fit your server  

## Related Documentation

- [Moderation Tools](/features/moderation-tools) - Cooldowns, whitelist, auto-ban
- [Admin Configuration](/commands/configuration) - All eggshen-config commands
- [Statistics](/features/statistics) - Track command usage patterns

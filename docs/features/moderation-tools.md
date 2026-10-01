---
description: "Built-in moderation tools in Egg Shen Bot that keep movie, TV and gaming Discord servers safe and spam-free."
---

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
5. **Auto-Ban Thresholds** - Flags repeat offenders for moderator review (the bot never bans anyone itself)
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
- Apply and lift manual cooldowns
- Clear a user's rate limits
- Whitelist trusted users and roles
- Enable emergency whitelist mode

### 📝 Violation Tracking

The bot keeps track of:
- Rate limit violations per user (`/eggshen-config-watch-party rate-limit abuse-log`)
- Users over the auto-ban threshold (`/eggshen-config-moderation moderation auto-ban-list`)
- Suspicious multi-user activity (`/eggshen-config-watch-party rate-limit suspicious-activity`)

Violation history is held in memory, so it resets when the bot restarts.

## Moderation Workflow

### 1. Automatic Protection

The bot automatically handles most abuse:

```
User spams commands → Rate limit blocks the command → Violation recorded
```

No moderator action required for routine violations.

### 2. Pattern Detection

The system watches for abuse patterns:

```
Repeated violations → User flagged as over the auto-ban threshold → Shown in auto-ban-list
```

Moderators review flagged users and decide whether to take action (Discord timeout or ban). Configure the threshold with `/eggshen-config-moderation moderation auto-ban-threshold count:<5-100> hours:<1-168>` and turn it on with `/eggshen-config-moderation moderation auto-ban-toggle enabled:true`.

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

### Moderation and Configuration Commands
`/eggshen-config-moderation` and `/eggshen-config-watch-party` require any one of:
- Administrator
- Manage Server
- Moderate Members
- Kick Members
- Ban Members

Most moderation features (whitelist, manual cooldowns, auto-ban threshold) only work after you enable them with `/eggshen-config-moderation moderation toggle enabled:true`. Rate limiting and abuse logging work either way.

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
1. Check their violations (`/eggshen-config-watch-party rate-limit abuse-log`)
2. Verify legitimate use
3. Clear their current limits (`/eggshen-config-watch-party rate-limit clear user:<user>`)
4. Raise server limits if needed (`/eggshen-config-watch-party rate-limit global max-requests:<1-100> window-seconds:<1-3600>`)

### Scenario: Intentional Abuse

**Situation:** User deliberately spamming to disrupt

**Actions:**
1. Rate limiting blocks the spam (automatic)
2. Review violation history (`/eggshen-config-watch-party rate-limit abuse-log` and `/eggshen-config-moderation moderation auto-ban-list`)
3. Apply a manual cooldown if needed (`/eggshen-config-moderation moderation user-cooldown user:<user> duration:<1-10080 minutes> reason:<text>`)
4. Discord timeout or ban if persistent

### Scenario: Raid or Bot Attack

**Situation:** Multiple accounts spamming simultaneously

**Emergency Response:**
1. Make sure your trusted roles are whitelisted (`/eggshen-config-moderation moderation whitelist-add-role role:<role>`)
2. Enable whitelist mode (`/eggshen-config-moderation moderation whitelist-toggle enabled:true`)
3. Review abuse logs (`/eggshen-config-watch-party rate-limit abuse-log`) and suspicious activity (`/eggshen-config-watch-party rate-limit suspicious-activity`)
4. Report to Discord Trust & Safety
5. Ban attacking accounts
6. Disable whitelist mode when clear (`/eggshen-config-moderation moderation whitelist-toggle enabled:false`)

To catch this earlier next time, turn on `/eggshen-config-watch-party rate-limit guild-wide enabled:true` and `/eggshen-config-watch-party rate-limit pattern-detection enabled:true`.

### Scenario: Legitimate User Blocked

**Situation:** A legitimate user is flagged in the auto-ban list or stuck under a cooldown

The bot never bans anyone on its own, so there is no auto-ban to undo. Instead:

**Resolution:**
1. Review their violations (`/eggshen-config-watch-party rate-limit abuse-log`)
2. Check if it was a genuine mistake
3. Lift any manual cooldown (`/eggshen-config-moderation moderation user-cooldown-remove user:<user>`)
4. Clear their rate limits (`/eggshen-config-watch-party rate-limit clear user:<user>`)
5. If whitelist mode is on, add them (`/eggshen-config-moderation moderation whitelist-add-user user:<user>`)
6. Apologize and explain

## Integration with Watch History

Watch history has special moderation features:

### Save Restrictions
- Only timer starter or moderators can save
- Prevents random users from polluting history
- Public accountability (saved by username shown)

### Audit Trail
- All saves logged with username
- Timestamp and channel recorded
- Full history visible to all

See [Watch History](/features/watch-history) for more details.

## Moderation Commands Quick Reference

All of these require Administrator, Manage Server, Moderate Members, Kick Members, or Ban Members.

| Command | Purpose |
|---------|---------|
| `/eggshen-config-moderation moderation toggle enabled:<true/false>` | Turn moderation features on or off |
| `/eggshen-config-moderation moderation user-cooldown user:<user> duration:<minutes> reason:<text>` | Apply manual cooldown |
| `/eggshen-config-moderation moderation user-cooldown-remove user:<user>` | Lift cooldown early |
| `/eggshen-config-moderation moderation user-cooldown-list` | View active cooldowns |
| `/eggshen-config-moderation moderation auto-ban-toggle enabled:<true/false>` | Turn auto-ban flagging on or off |
| `/eggshen-config-moderation moderation auto-ban-threshold count:<5-100> hours:<1-168>` | Set the flagging threshold |
| `/eggshen-config-moderation moderation auto-ban-list` | View users over the threshold |
| `/eggshen-config-moderation moderation whitelist-toggle enabled:<true/false>` | Emergency lockdown |
| `/eggshen-config-moderation moderation whitelist-add-role role:<role>` / `whitelist-add-user user:<user>` | Add to whitelist |
| `/eggshen-config-moderation moderation whitelist-remove-role role:<role>` / `whitelist-remove-user user:<user>` | Remove from whitelist |
| `/eggshen-config-moderation moderation whitelist-list` | View whitelist |
| `/eggshen-config-watch-party rate-limit abuse-log` | View violations by user |
| `/eggshen-config-watch-party rate-limit suspicious-activity` | View detected multi-user patterns |
| `/eggshen-config-watch-party rate-limit clear user:<user>` | Reset a user's rate limits |

Full documentation: [Moderation Commands](/commands/moderation)

## Best Practices

### ✅ Do

- Review abuse logs regularly
- Document moderation actions
- Communicate rules clearly
- Use progressive discipline
- Adjust limits for server size
- Whitelist known power users
- Check `/eggshen-config-moderation moderation auto-ban-list` regularly

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
- Enable guild-wide limits and pattern detection
- Lower auto-ban threshold
- Add more moderators to monitor

## Support

For moderation issues:

1. Check this documentation
2. Review [Rate Limiting docs](/features/rate-limiting)
3. Check [Configuration guide](/configuration)
4. Ask in bot support channel
5. Report bugs on [GitHub Issues](https://github.com/r3volution11/Egg-Shen-Bot/issues)

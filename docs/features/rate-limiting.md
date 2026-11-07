---
description: "How Egg Shen Bot's layered rate limiting stops spam, channel flooding and coordinated abuse while keeping things smooth for everyone else."
---

# Rate Limiting & Anti-Abuse

Rate limiting stops people spamming the bot. It caps how fast each member can use commands, caps the whole server, and keeps a record of who keeps hitting the limits so moderators can act. The commands for viewing and changing the limits are on [Moderation Commands](/commands/moderation).

## Overview

The protection comes in layers:

1. **Per-user limits** stop one member from spamming a command
2. **Guild-wide limits** stop many accounts flooding the server at once
3. **Pattern detection** flags coordinated activity for moderators
4. **Abuse logging** records every blocked command
5. **Auto-ban threshold** warns members who keep hitting the limits
6. **Manual cooldowns** let moderators pause one member
7. **Whitelist mode** limits the bot to chosen roles and members

Layers 1 to 4 work out of the box on a new server. A server set up before the rate-limiting switch existed has them off until an admin turns it on: see [Turn It All On or Off](#turn-it-all-on-or-off). Layers 5 to 7 are moderation features: turn them on first with `/eggshen-config-moderation moderation toggle enabled:true`. See [Moderation Tools](/features/moderation-tools).

All of these settings belong to admins and moderators: members with Administrator, Manage Server, Timeout Members, Kick Members or Ban Members.

## Default Settings

| Setting | Default |
|---|---|
| Rate limiting | On for a new server; off for one set up before the switch existed |
| Per-user limit | 1 use per 20 seconds, for each command |
| `/suggest-quote` | 1 per 60 seconds |
| `/recommend` | 2 per 120 seconds |
| Guild-wide limit | On, 10 commands per 60 seconds |
| Pattern detection | On, flags 3 or more members |
| Moderator bypass | On |
| Moderation features (whitelist, cooldowns, auto-ban) | Off |
| Auto-ban threshold | 20 violations in 24 hours, once turned on |

A member who hits a limit gets a private reply saying how many seconds to wait. Nothing is posted in the channel.

### Turn It All On or Off

```
/eggshen-config-watch-party rate-limit toggle enabled:false
```

With rate limiting off, layers 1 to 5 stop: nothing is limited, so nothing is logged or flagged either. Manual cooldowns and whitelist mode keep working: they're moderation features, with their own switch. Turn rate limiting back on with `enabled:true`.

A new server starts with rate limiting on. A server whose settings were saved before this switch existed has it off, as it always has, and keeps it off until an admin turns it on with `enabled:true`. Its other limits read as the defaults above, ready for when it's on. `/eggshen-config-watch-party rate-limit view` shows which it is.

## Layer 1: Per-User Limits

Each command has its own count for each member. With the default of 1 per 20 seconds, someone can run `/movie` and then `/tv` straight away, but not `/movie` twice within 20 seconds.

The count is kept per command, not per subcommand, so a command's subcommands share it. `/timer start` followed by `/timer status`, `/bracket status` then `/bracket my-votes`, or two `/watchlist add`s within 20 seconds: the second is refused ("wait N seconds before using /timer again"). If that gets in the way with `/timer`, give it a looser [limit of its own](#per-command-limits).

Only typed commands and the right-click **Game card** are counted. Buttons, menus, forms and the suggestions Discord shows while you type are never limited, so voting, ready checks and game buttons aren't held up by it.

### Set the Default Limit

```
/eggshen-config-watch-party rate-limit global max-requests:1 window-seconds:20
```

`max-requests` takes 1 to 100 and `window-seconds` 1 to 3600. The limit applies to every command that has no limit of its own.

### Per-Command Limits

Give one command its own limit:

```
/eggshen-config-watch-party rate-limit command command:episode-list max-requests:2 window-seconds:60
```

`command` can be `movie`, `tv`, `episode`, `episode-list`, `timer` or `stats`; no other command can be given its own limit from Discord. Leave out `window-seconds` to use the default limit's window.

To remove a command's own limit and go back to the default:

```
/eggshen-config-watch-party rate-limit command command:movie max-requests:0
```

`/suggest-quote` and `/recommend` have their own limits from the start (see the table above). They aren't among the `command` choices, so they can't be changed or removed from Discord. Whoever runs the bot can change them in the server's settings file, `guild_configs/<server ID>.json`, under `rateLimits.commands` (`"recommend": { "maxRequests": 2, "windowSeconds": 120 }`). The bot reads the file each time, so there's nothing to restart. `/eggshen-config-watch-party rate-limit view` lists every per-command limit in effect.

### The Games Have Their Own Limits

`/potion`, `/foodfight`, `/doom`, `/rescue` and `/siege`, and the Six-Demon Bag's casts (`/six-demon-bag bless`, `hex`, `peace` and `shrug`), don't use the default limit, so someone can send a potion and then throw food straight away. The games have their own play limits instead: by default each game once every 20 seconds per person, and 6 plays a minute across all of them. Change those with `/eggshen-config-games limits`. See [Games › Limits](/commands/games-settings#limits). `/six-demon-bag status` keeps the default limit.

Only the per-member limit is skipped. The [guild-wide limit](#layer-2-guild-wide-limits), whitelist mode and manual cooldowns still stop a game command. A game play doesn't add to the guild-wide count, though, and pattern detection doesn't look at it.

If a per-command limit is ever set for one of the games in the server's config, that limit applies to it as well.

## Layer 2: Guild-Wide Limits

The guild-wide limit counts commands from **all** members together. It stops a group of throwaway accounts from flooding the server even when each one stays under its own limit. Both limits are checked.

```
/eggshen-config-watch-party rate-limit guild-wide enabled:true max-requests:10 window-seconds:60
```

`max-requests` takes 1 to 100 and `window-seconds` 10 to 600. Leave them out to keep the current values.

When the server is over the limit, everyone gets: "Server-wide rate limit reached! This server is currently receiving too many commands."

**When to change it:**
- Raise it (20 to 30 per 60 seconds) on a large, busy server where real members hit it
- Lower it if you're being flooded
- Turn it off (`enabled:false`) on a small private server

## Layer 3: Pattern Detection

Pattern detection watches for coordinated activity and records it for moderators. It never blocks anyone.

It flags two patterns:

- **🔁 Identical commands:** `min-users` different members run the same command with the same options within 60 seconds
- **⚡ Coordinated burst:** `min-users` different members fire off at least twice that many commands between them within 10 seconds

`min-users` is 3 by default:

```
/eggshen-config-watch-party rate-limit pattern-detection enabled:true min-users:3
```

`min-users` takes 2 to 20. A lower number catches more, but flags more ordinary activity too. On a big server where people often look up the same title at once, raise it.

The 60 seconds for identical commands is `rateLimits.patternDetection.windowSeconds` in the server's `guild_configs/<server ID>.json`. No command changes it; whoever runs the bot can edit the file. The 10 seconds of a burst is fixed.

### View Detected Activity

```
/eggshen-config-watch-party rate-limit suspicious-activity
```

Shows up to 10 recent patterns from the last 24 hours: the type, who was involved (up to 5 named), what was run and how long ago. The same pattern for the same command is recorded at most once every 5 minutes.

## Layer 4: Abuse Logging

Every command blocked by a per-user or guild-wide limit is recorded against the member who ran it.

```
/eggshen-config-watch-party rate-limit abuse-log
```

Shows up to 10 members with violations in the last 48 hours, most recent first, with:
- How many violations they have
- Which commands, and how many times each (from their last 10)
- Whether each was the per-user or guild-wide limit
- How long ago the last one was
- 🚨 **Persistent abuser** beside anyone with more than 10

Pattern detection catches groups; the abuse log catches one member testing the limits on their own.

Violations are kept for 48 hours, up to the last 100 per member. They're held in memory, so a restart clears them.

## Layer 5: Auto-Ban Threshold

Despite the name, the bot never bans anyone. When a member's violations reach the threshold, the bot adds a warning to their rate-limit reply and lists them for moderators. Moderators decide what to do.

```
/eggshen-config-moderation moderation auto-ban-toggle enabled:true
/eggshen-config-moderation moderation auto-ban-threshold count:20 hours:24
```

`count` takes 5 to 100 and `hours` 1 to 168 (24 if left out). Since violations are only kept for 48 hours, a window longer than that counts the last 48 hours at most.

### View Flagged Members

```
/eggshen-config-moderation moderation auto-ban-list
```

Lists members at or over the threshold, most violations first, with their count and last violation. Nothing is posted to moderators on its own, so check this list.

**Rough guide:**
- Strict: 5 to 10 in 24 hours
- Most servers: 15 to 25 (the default is 20)
- Busy servers: 30 to 50

## Layer 6: Manual Cooldowns

A cooldown stops one member from using any bot command for a while. It covers typed commands and the right-click **Game card**; buttons and menus on messages already posted still work for them, such as voting in a survey or tournament.

```
/eggshen-config-moderation moderation user-cooldown user:@spammer duration:60 reason:Spamming commands
```

- `duration` is in minutes, 1 to 10,080 (a week)
- `reason` is required, and the member sees it with the time remaining whenever they try a command
- It ends on its own when the time is up

A cooldown applies whether or not rate limiting is on. Admins and moderators skip it while [moderator bypass](#moderator-bypass) is on.

Cooldowns are held in memory, so a bot restart lifts them.

### Lift a Cooldown

```
/eggshen-config-moderation moderation user-cooldown-remove user:@spammer
```

### View Active Cooldowns

```
/eggshen-config-moderation moderation user-cooldown-list
```

Shows each member under a cooldown, the reason, who applied it and when, and when it ends.

## Layer 7: Whitelist Mode

Whitelist mode lets only chosen roles and members use the bot's commands. A member gets in if they're on the list themselves or hold a role that is. Everyone else is told "This server is in whitelist mode."

It stops typed commands and the right-click **Game card**, not buttons or menus. Anyone can still vote, answer a ready check or press a game button on a message that's already posted.

Add roles and members first, then turn it on:

```
/eggshen-config-moderation moderation whitelist-add-role role:@Members
/eggshen-config-moderation moderation whitelist-add-user user:@trusted_user
/eggshen-config-moderation moderation whitelist-toggle enabled:true
```

Remove entries:

```
/eggshen-config-moderation moderation whitelist-remove-role role:@Members
/eggshen-config-moderation moderation whitelist-remove-user user:@trusted_user
```

See the list:

```
/eggshen-config-moderation moderation whitelist-list
```

Admins and moderators are always allowed, listed or not, whatever [moderator bypass](#moderator-bypass) is set to, so whoever turns whitelist mode on can always turn it off. It works whether or not rate limiting is on. The whitelist is saved with the server's settings, so it survives a restart.

**Good for:** a private community, keeping the bot to a subscriber role, or shutting out a raid while you clean up.

## Moderator Bypass

Admins and moderators skip the rate limits (layers 1 and 2) and manual cooldowns. It's on by default. Whitelist mode lets them in either way.

Here "admins and moderators" means members with Administrator, Manage Server, Timeout Members, Kick Members, Ban Members, Manage Messages or Manage Channels.

```
/eggshen-config-watch-party rate-limit bypass enabled:true
```

Turn it off with `enabled:false` to test the limits on yourself.

## Clear a Member's Limits

If someone was blocked by mistake:

```
/eggshen-config-watch-party rate-limit clear user:@username
```

This resets their per-command counts, so they can use commands straight away. It doesn't lift a manual cooldown (use `user-cooldown-remove`) or reset the guild-wide count.

## View Configuration

```
/eggshen-config-watch-party rate-limit view
```

Shows:
- Whether rate limiting, moderation features and moderator bypass are on
- The default per-user limit
- The guild-wide limit
- Pattern detection and its `min-users`
- Whitelist mode and the auto-ban threshold (when moderation features are on)
- Every per-command limit

## Other Limits

These have their own settings and aren't covered by the commands above:

- **The games:** see [Games › Limits](/commands/games-settings#limits)
- **AI images:** cooldowns and daily limits, see [AI Image Generation](/commands/ai-images)
- **The event request form:** one request per 5 minutes, see [Event Requests › Rate Limiting](/features/event-requests#rate-limiting)

## Configuration Tips

These are starting points. Watch the abuse log for a week and adjust.

| Server | Per-user | Guild-wide | Pattern detection | Auto-ban |
|---|---|---|---|---|
| Small (10–50 members) | 1 per 20 s | 5 per 60 s | 2–3 members | 15 |
| Medium (50–200) | 1 per 20 s, or 2 per 30 s | 10 per 60 s | 3–4 members | 20 |
| Large (200+) | 2 per 30 s, or 3 per 60 s | 20–30 per 60 s | 5–6 members | 25–30 |
| Trusted and private | 3 per 30 s | Off | Off | Off |

## Common Issues

### Real members keep hitting the limit

Raise the per-user limit, or give the command they use most its own limit:

```
/eggshen-config-watch-party rate-limit global max-requests:2 window-seconds:30
```

### Spam is still getting through

1. Turn on the guild-wide limit, or lower it
2. Lower the pattern detection `min-users`
3. Turn on the auto-ban threshold and check `/eggshen-config-moderation moderation auto-ban-list`
4. Put repeat offenders on a manual cooldown
5. In a raid, turn on whitelist mode

### Pattern detection flags normal activity

Raise `min-users`:

```
/eggshen-config-watch-party rate-limit pattern-detection enabled:true min-users:5
```

## Best Practices

- **Keep moderator bypass on** so admins can always respond
- **Check the abuse log regularly**: it only covers 48 hours
- **Try a cooldown before a ban**
- **Leave the guild-wide limit on**: it's what stops multi-account floods
- **Don't turn rate limiting off entirely**: without it nothing limits spam (whitelist mode and cooldowns still work)
- **Tell members the limits** so a wait message doesn't surprise them

## Related Documentation

- [Moderation Tools](/features/moderation-tools): cooldowns, whitelist, auto-ban
- [Admin Configuration › Rate Limit Group](/commands/configuration#rate-limit-group)
- [Statistics](/features/statistics): what members use the bot for

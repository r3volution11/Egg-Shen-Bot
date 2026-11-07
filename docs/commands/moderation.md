---
description: "Moderation commands for Egg Shen Bot: rate limits, member cooldowns, whitelist mode and the auto-ban threshold, to stop spam and keep bot use healthy in your Discord server."
---

# Moderation Commands

Tools to stop spam and abuse of the bot: rate limits, cooldowns for a member, whitelist mode, and a threshold that flags repeat offenders. For how they work together, see [Moderation Tools](/features/moderation-tools) and [Rate Limiting](/features/rate-limiting).

**Who can use them:** admins and moderators, meaning members with Administrator, Manage Server, Timeout Members, Kick Members or Ban Members. Whitelist mode never blocks admins and moderators. While [moderator bypass](#moderator-bypass) is on (the default), rate limits and cooldowns don't apply to them either.

## Rate Limits

Rate limiting is **on by default** for a new server: each member can use a given command once every 20 seconds, and the whole server 10 commands a minute. A server set up before the switch existed has it off until an admin turns it on with `/eggshen-config-watch-party rate-limit toggle enabled:true`; `rate-limit view` shows which. The commands are in the `rate-limit` group of `/eggshen-config-watch-party`. Every option is on [Admin Configuration](/commands/configuration#rate-limit-group).

### View the Limits

```
/eggshen-config-watch-party rate-limit view
```

### Change the Limits

```
/eggshen-config-watch-party rate-limit global max-requests:<1-100> window-seconds:<1-3600>
/eggshen-config-watch-party rate-limit command command:<name> max-requests:<0-100> window-seconds:[1-3600]
/eggshen-config-watch-party rate-limit guild-wide enabled:<true|false> max-requests:[1-100] window-seconds:[10-600]
```

- `global` - How often each member can use each command. Subcommands share their command's count, so `/timer start` then `/timer status` counts twice against `/timer`
- `command` - A different limit for `movie`, `tv`, `episode`, `episode-list`, `timer` or `stats`, the only commands it offers. `max-requests:0` removes it. The built-in limits for `/recommend` and `/suggest-quote` can only be changed in the server's settings file ([details](/features/rate-limiting#per-command-limits))
- `guild-wide` - A cap on everyone together, which stops one person flooding from several accounts

### Clear a Member's Limits

```
/eggshen-config-watch-party rate-limit clear user:@user
```

For a member who's stuck waiting.

### Moderator Bypass

```
/eggshen-config-watch-party rate-limit bypass enabled:<true|false>
```

On by default: admins and moderators aren't rate limited and skip cooldowns. Turned off, both apply to them as to anyone. Whitelist mode lets them in either way. For these, members with Manage Messages or Manage Channels count as moderators too.

### Spot Coordinated Spam

```
/eggshen-config-watch-party rate-limit pattern-detection enabled:<true|false> min-users:[2-20]
/eggshen-config-watch-party rate-limit suspicious-activity
/eggshen-config-watch-party rate-limit abuse-log
```

- `pattern-detection` - On by default. Flags several members (3 by default) running the same command with the same options within a minute, or a burst of commands from several members. It only records; it doesn't block
- `suspicious-activity` - What pattern detection has flagged
- `abuse-log` - Who has hit the rate limits, and how often

## Moderation Features

The rest is in `/eggshen-config-moderation moderation`. **Moderation is off by default.** Turn it on first; the other subcommands say so until you do.

```
/eggshen-config-moderation moderation toggle enabled:true
```

Whitelist mode and cooldowns don't depend on rate limiting: they keep working if you turn rate limiting off.

### Cooldown a Member

```
/eggshen-config-moderation moderation user-cooldown user:@user duration:<1-10080> reason:<reason>
/eggshen-config-moderation moderation user-cooldown-remove user:@user
/eggshen-config-moderation moderation user-cooldown-list
```

Stops one member using the bot's commands for a number of minutes (up to 7 days). They see the reason and how long is left. Buttons and menus on messages already posted still work for them. `user-cooldown-list` shows everyone on a cooldown, why, who applied it and when it ends.

Cooldowns are kept in memory, so a bot restart ends them.

**Example:**
```
/eggshen-config-moderation moderation user-cooldown user:@Spammer duration:60 reason:Flooding the movie channel
```

### Whitelist Mode

```
/eggshen-config-moderation moderation whitelist-toggle enabled:<true|false>
/eggshen-config-moderation moderation whitelist-add-role role:@role
/eggshen-config-moderation moderation whitelist-add-user user:@user
/eggshen-config-moderation moderation whitelist-remove-role role:@role
/eggshen-config-moderation moderation whitelist-remove-user user:@user
/eggshen-config-moderation moderation whitelist-list
```

With whitelist mode on, only the roles and members on the list can use the bot: a member who's listed, or who holds a listed role. Admins and moderators are always let in, listed or not, so you can't lock yourself out. Everyone else is told the server is in whitelist mode. It's an emergency measure, such as during a raid. It stops typed and right-click commands only: anyone can still press buttons and use menus on messages already posted, such as survey and tournament votes.

Add a role (such as your members' role) rather than people one by one, then add any individuals on top. Set up the list before you turn whitelist mode on.

**Example:**
```
/eggshen-config-moderation moderation whitelist-add-role role:@Regulars
/eggshen-config-moderation moderation whitelist-toggle enabled:true
```

### Auto-Ban Threshold

```
/eggshen-config-moderation moderation auto-ban-toggle enabled:<true|false>
/eggshen-config-moderation moderation auto-ban-threshold count:<5-100> hours:[1-168]
/eggshen-config-moderation moderation auto-ban-list
```

Despite the name, nothing is banned. With it on, a member who goes over the threshold of rate-limit violations (20 within 24 hours by default) gets a warning with their next refusal, and appears on `auto-ban-list` for you to deal with. Off by default.

**Example:**
```
/eggshen-config-moderation moderation auto-ban-threshold count:10 hours:12
```

## Other Tools

- **Switch commands off:** `/eggshen-config commands toggle` turns a command off for regular members. `setting:enabled enabled:false` turns off every command that has a switch. See [Commands Group](/commands/configuration#commands-group)
- **Usage statistics:** `/eggshen-stats` shows who uses what, which can show a pattern of abuse
- **The games** have their own play limits, separate from rate limiting: [Settings for Admins](/commands/games-settings#limits)

## Best Practices

### 1. Start with the defaults

One use per command every 20 seconds per member, and 10 commands a minute for the server, suits most communities. Check them with `/eggshen-config-watch-party rate-limit view`.

### 2. Loosen what's busy, tighten what's heavy

If members hit the limit during a busy movie night, raise it for one command, or for everything:

```
/eggshen-config-watch-party rate-limit command command:movie max-requests:3 window-seconds:60
/eggshen-config-watch-party rate-limit guild-wide enabled:true max-requests:20 window-seconds:60
```

### 3. Deal with one person, not everyone

A cooldown for one member is better than tighter limits for all:

```
/eggshen-config-moderation moderation user-cooldown user:@user duration:30 reason:Spamming
```

### 4. In an emergency

Switch off every command with a switch for regular members, or turn on whitelist mode:

```
/eggshen-config commands toggle setting:enabled enabled:false
```

Turn it back on when things are calm.

## Troubleshooting

### A member is stuck with a rate limit

```
/eggshen-config-watch-party rate-limit clear user:@user
```

### Too much spam

Check `/eggshen-config-watch-party rate-limit abuse-log` for who's behind it, and give them a cooldown. For a wider problem, lower `guild-wide` or turn on whitelist mode.

### The bot isn't answering regular members

Check whether commands are switched off:
```
/eggshen-config settings view
```

If **All Commands** is off, switch it back on:
```
/eggshen-config commands toggle setting:enabled enabled:true
```

Also check whether whitelist mode is on with `/eggshen-config-moderation moderation whitelist-list`.

### Rate limits are too strict

```
/eggshen-config-watch-party rate-limit view
/eggshen-config-watch-party rate-limit global max-requests:3 window-seconds:60
```

## Related Documentation

- [Moderation Tools](/features/moderation-tools) - How the tools fit together
- [Rate Limiting](/features/rate-limiting) - The full rate limiting guide
- [Admin Configuration](/commands/configuration) - Every configuration command
- [Statistics](/features/statistics) - Usage tracking

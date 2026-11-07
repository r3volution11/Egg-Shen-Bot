---
description: "Built-in moderation tools in Egg Shen Bot that keep movie, TV and gaming Discord servers safe and spam-free."
---

# Moderation Tools

Tools for keeping spam and abuse of the bot under control on your server.

## Overview

The bot limits how fast people can use it, records who keeps hitting those limits, and gives moderators ways to step in: a cooldown for one member, or a whitelist that shuts everyone else out. It never bans, kicks or times out anyone itself. Those decisions stay with your moderators.

## Key Features

### 🛡️ Layered Protection

1. **Per-user limits:** each member can only use a command so often
2. **Guild-wide limits:** a cap on commands from the whole server, against multi-account floods
3. **Pattern detection:** flags several accounts acting together
4. **Abuse logging:** records every blocked command
5. **Auto-ban threshold:** flags repeat offenders for moderators (the bot never bans anyone itself)
6. **Manual cooldowns:** a moderator pauses one member
7. **Whitelist mode:** only chosen roles and members can use the bot

Learn more: [Rate Limiting & Anti-Abuse](/features/rate-limiting)

### 📝 What the Bot Records

- Rate-limit violations per member, for 48 hours (`/eggshen-config-watch-party rate-limit abuse-log`)
- Members over the auto-ban threshold (`/eggshen-config-moderation moderation auto-ban-list`)
- Suspicious multi-member activity, for 24 hours (`/eggshen-config-watch-party rate-limit suspicious-activity`)

These records and any manual cooldowns are held in memory, so a bot restart clears them. The whitelist is saved with the server's settings and survives a restart.

### ⚡ Quick Actions

- Apply and lift manual cooldowns
- Clear a member's rate limits
- Whitelist trusted roles and members
- Turn on whitelist mode during a raid

## Turning Moderation Features On

Rate limiting and abuse logging work as soon as the bot joins. The whitelist, manual cooldowns and the auto-ban threshold are off until you turn moderation features on:

```
/eggshen-config-moderation moderation toggle enabled:true
```

They also need rate limiting itself to be on (it is by default). Turning rate limiting off with `/eggshen-config-watch-party rate-limit toggle enabled:false` switches the whitelist and cooldowns off with it.

## Moderation Workflow

### 1. Automatic Protection

```
Member spams a command → the rate limit blocks it → the violation is recorded
```

The member gets a private message saying how long to wait. Nothing else happens, and no moderator needs to act.

### 2. Flagging Repeat Offenders

```
Repeated violations → the member reaches the auto-ban threshold → they're listed in auto-ban-list
```

Turn it on with `/eggshen-config-moderation moderation auto-ban-toggle enabled:true`, and set the threshold with `/eggshen-config-moderation moderation auto-ban-threshold count:<5-100> hours:<1-168>` (the default is 20 in 24 hours). A flagged member sees a warning in their rate-limit reply. Moderators aren't notified, so check the list, then decide whether to act (a Discord timeout or a ban).

### 3. Stepping In

```
Review the abuse log → apply a manual cooldown → keep an eye on them
```

See [Moderation Commands](/commands/moderation) for more.

## Permission Levels

### Everyone

- Search commands (`/movie`, `/tv`, `/game` and the rest)
- Joining watch parties, timers, the watchlist and the games
- Adding to and viewing watch history (`/watched add`, `/watched history`)

Admins can switch individual commands off for regular members with `/eggshen-config commands toggle`.

### Admins and Moderators

`/eggshen-config-moderation`, `/eggshen-config-watch-party` and the other `/eggshen-config` commands need one of:

- Administrator
- Manage Server
- Timeout Members
- Kick Members
- Ban Members

The bot calls these members "admins and moderators" throughout. With moderator bypass on (the default), they also skip every rate limit, the whitelist and cooldowns.

## Abuse Prevention Strategies

### Small Servers (under 100 members)

```
Rate limiting: on, defaults
Auto-ban threshold: on, higher (25–30)
Whitelist mode: off
```

Mostly trust-based. Check the abuse log now and then, and talk to people before acting.

### Medium Servers (100–1,000 members)

```
Rate limiting: on, defaults or a little stricter
Auto-ban threshold: on, default (20)
Whitelist mode: ready for events or raids
```

Let the limits handle routine spam. Post your rules and check the logs regularly.

### Large Servers (1,000+ members)

```
Rate limiting: on, stricter guild-wide limit
Auto-ban threshold: on, lower (10–15)
Whitelist mode: whitelisted roles set up in advance, ready for raids
```

Lean on the automatic limits and keep a moderator checking `auto-ban-list` and `suspicious-activity`.

## Common Moderation Scenarios

### A Real Member Keeps Getting Blocked

1. Check their violations (`/eggshen-config-watch-party rate-limit abuse-log`)
2. Make sure it's ordinary use
3. Clear their current limits (`/eggshen-config-watch-party rate-limit clear user:<user>`)
4. Raise the limits if needed (`/eggshen-config-watch-party rate-limit global max-requests:<1-100> window-seconds:<1-3600>`)

### Someone Spamming on Purpose

1. The rate limit blocks the spam on its own
2. Review their history (`/eggshen-config-watch-party rate-limit abuse-log` and `/eggshen-config-moderation moderation auto-ban-list`)
3. Apply a manual cooldown if needed (`/eggshen-config-moderation moderation user-cooldown user:<user> duration:<1-10080> reason:<text>`; `duration` is in minutes)
4. Use a Discord timeout or ban if it keeps up

### A Raid or Bot Attack

**Emergency response:**
1. Make sure your trusted roles are whitelisted (`/eggshen-config-moderation moderation whitelist-add-role role:<role>`)
2. Turn on whitelist mode (`/eggshen-config-moderation moderation whitelist-toggle enabled:true`)
3. Review the abuse log (`/eggshen-config-watch-party rate-limit abuse-log`) and suspicious activity (`/eggshen-config-watch-party rate-limit suspicious-activity`)
4. Ban the attacking accounts and report them to Discord Trust & Safety
5. Turn whitelist mode off when it's over (`/eggshen-config-moderation moderation whitelist-toggle enabled:false`)

To catch it sooner next time, keep `/eggshen-config-watch-party rate-limit guild-wide enabled:true` and `/eggshen-config-watch-party rate-limit pattern-detection enabled:true` on (both are on by default).

### A Member Was Flagged by Mistake

The bot never bans anyone, so there's nothing to undo. Instead:

1. Review their violations (`/eggshen-config-watch-party rate-limit abuse-log`)
2. Lift any manual cooldown (`/eggshen-config-moderation moderation user-cooldown-remove user:<user>`)
3. Clear their rate limits (`/eggshen-config-watch-party rate-limit clear user:<user>`)
4. If whitelist mode is on, add them (`/eggshen-config-moderation moderation whitelist-add-user user:<user>`)
5. Let them know what happened

Their flag in `auto-ban-list` goes away once their violations fall out of the threshold's window.

## Watch History

Anyone can add to the server's watch history with `/watched add`. Logging from a timer is more limited: a timer is logged when it's stopped, and only the person who started it or an admin or moderator can stop it (unless the server lets anyone stop timers). The **Log to Watch History** button, on a stop card that wasn't logged, is for the person who started the timer or a member with Administrator, Manage Server or Timeout Members, whatever the timer setting.

Every entry shows who saved it, and timer entries show the channel. Entries can't be edited or removed from Discord. See [Watch History](/features/watch-history).

## Moderation Commands Quick Reference

All of these are for admins and moderators.

| Command | Purpose |
|---------|---------|
| `/eggshen-config-moderation moderation toggle enabled:<true/false>` | Turn moderation features on or off |
| `/eggshen-config-moderation moderation user-cooldown user:<user> duration:<minutes> reason:<text>` | Apply a manual cooldown |
| `/eggshen-config-moderation moderation user-cooldown-remove user:<user>` | Lift a cooldown early |
| `/eggshen-config-moderation moderation user-cooldown-list` | View active cooldowns |
| `/eggshen-config-moderation moderation auto-ban-toggle enabled:<true/false>` | Turn auto-ban flagging on or off |
| `/eggshen-config-moderation moderation auto-ban-threshold count:<5-100> hours:<1-168>` | Set the flagging threshold |
| `/eggshen-config-moderation moderation auto-ban-list` | View members over the threshold |
| `/eggshen-config-moderation moderation whitelist-toggle enabled:<true/false>` | Turn whitelist mode on or off |
| `/eggshen-config-moderation moderation whitelist-add-role role:<role>` / `whitelist-add-user user:<user>` | Add to the whitelist |
| `/eggshen-config-moderation moderation whitelist-remove-role role:<role>` / `whitelist-remove-user user:<user>` | Remove from the whitelist |
| `/eggshen-config-moderation moderation whitelist-list` | View the whitelist |
| `/eggshen-config-watch-party rate-limit abuse-log` | View violations by member |
| `/eggshen-config-watch-party rate-limit suspicious-activity` | View detected multi-member patterns |
| `/eggshen-config-watch-party rate-limit clear user:<user>` | Reset a member's rate limits |

Full documentation: [Moderation Commands](/commands/moderation)

## Best Practices

### ✅ Do

- Check the abuse log and `auto-ban-list` regularly; they only cover the last day or two
- Post your rules and apply them the same way to everyone
- Start with a cooldown before a ban
- Adjust the limits to your server's size
- Whitelist your regular roles before you ever need whitelist mode

### ❌ Don't

- Turn rate limiting off entirely
- Ban without checking the abuse log first
- Leave whitelist mode on longer than you need it

## Troubleshooting

### Real Members Keep Hitting Limits

- Raise the per-user or guild-wide limit
- Give a busy command its own, looser limit
- Raise pattern detection's `min-users`

### Spam Still Getting Through

- Lower the limits
- Make sure the guild-wide limit and pattern detection are on
- Lower the auto-ban threshold
- Use cooldowns or whitelist mode for the worst cases

### Moderation Commands Say Features Are Disabled

Turn moderation features on first: `/eggshen-config-moderation moderation toggle enabled:true`.

## Support

1. Read [Rate Limiting & Anti-Abuse](/features/rate-limiting)
2. Check the [Configuration guide](/configuration)
3. Report bugs on [GitHub Issues](https://github.com/r3volution11/Egg-Shen-Bot/issues)

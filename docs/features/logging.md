---
description: "How Egg Shen Bot logs events, errors and slow operations to files, and how to read them from Discord or the server."
---

# Logging System

Egg Shen Bot writes its events, errors and slow operations to log files, in the style of Drupal's watchdog log. Use them to find out what happened before a crash, a slowdown or a failed command.

These logs belong to whoever runs the bot. They cover every server the bot is in.

## Overview

- **File-based:** everything goes to the `logs/` folder in the bot's install
- **JSON lines:** one entry per line, with a timestamp, severity, category, message and details
- **8 severity levels:** from EMERGENCY (0) to DEBUG (7)
- **One file per category per day**
- **Rotation:** a new file each day, and a new one when a file passes 10 MB
- **Cleanup:** files older than 30 days are deleted
- **Slow operations:** commands and buttons that take too long are logged with how long they took

Everything is also printed to the console (what `pm2 logs` shows).

## Severity Levels

| Level | Number | Used for |
|-------|--------|----------|
| 🚨 EMERGENCY | 0 | An uncaught exception (the bot exits) |
| 🔴 ALERT | 1 | Not currently used |
| 💥 CRITICAL | 2 | An unhandled promise rejection |
| ❌ ERROR | 3 | A failed command or button, a Discord client error, a scheduler error |
| ⚠️ WARNING | 4 | A Discord client warning, an operation over 5 seconds |
| 📢 NOTICE | 5 | Scheduler events worth noting, such as a timer expiry warning being sent |
| ℹ️ INFO | 6 | A command that ran, startup and shutdown, scheduler activity |
| 🐛 DEBUG | 7 | Button clicks, operations that were slow but under 5 seconds |

With `NODE_ENV=production`, DEBUG entries aren't written. Otherwise everything is.

## Log Categories

Each category gets its own file. These are the ones the bot writes to:

- **system:** startup, connecting to Discord, shutdown, crashes, Discord client errors and warnings
- **command:** every command run, with who ran it, where, the subcommand and how long it took; failures with the error
- **button:** button clicks (DEBUG) and failed button clicks (ERROR)
- **scheduler:** the background jobs: tournament voting deadlines and warnings, survey auto-close, timer expiry warnings, the bot's status quotes, and event-image cleanup
- **performance:** slow commands and buttons

Those five are the only log files the bot writes. Tournament deadlines and timer warnings are in **scheduler**; the commands that run them are in **command**.

::: warning Some background jobs only write to the console
These write nothing to the log files, so `/eggshen-logs` never shows their errors:

- Scheduled announcements (`/announce schedule`) and the starting-soon cards
- Escape Velocity: launching, the daily mission card, the results and topping up the questions
- Happenings and sieges: starting them, the monster's moves, the siege card, the nightly report and the results
- Ready checks, and uploading the card icons (`[EmojiKit]`)

Their messages go to the console only: with PM2, read them with `pm2 logs egg-shen-bot`. A timer's auto-stop and its watch-history entry are console-only too.
:::

## Log File Format

Each line is one JSON entry:

```json
{
  "timestamp": "2026-06-28T23:53:11.607Z",
  "level": "INFO",
  "levelNum": 6,
  "category": "system",
  "message": "Logger initialized",
  "context": {
    "minLevel": "DEBUG",
    "logsDir": "/opt/discord-bot/logs",
    "maxFileSize": "10.00MB",
    "maxAge": "30 days",
    "pid": 11718,
    "memory": {
      "rss": 100245504,
      "heapTotal": 29691904,
      "heapUsed": 19177016,
      "external": 3895097,
      "arrayBuffers": 295660
    },
    "uptime": 0.700984655
  }
}
```

Every entry's `context` includes the process id, memory use and uptime, which helps when looking into memory growth or a crash.

## Viewing Logs

### From Discord

`/eggshen-logs` shows the logs in Discord. It's for members with the **Administrator** permission only, and Discord hides it from everyone else. Replies are private.

#### Log Statistics

```
/eggshen-logs stats
```

Shows the number of log files, their total size in MB, the logs folder, and the latest log file.

#### Recent Errors

```
/eggshen-logs errors count:10
```

Shows the most recent EMERGENCY, CRITICAL, ALERT and ERROR entries from any log file, newest first. Each shows the level, category, time and the first 100 characters of the message. The details (`context`) aren't shown; read the file for those.

`count` takes 1 to 50 and defaults to 10.

#### One Category

```
/eggshen-logs category category:command count:10
```

Shows the latest entries from **today's** file for one category: level, time and the first 80 characters of each message. Today is by UTC.

`category` can be:

- `system`
- `command`
- `button`
- `scheduler`
- `performance`

`count` takes 1 to 50 and defaults to 10.

### On the Server

If you can reach the machine the bot runs on:

```bash
# All log files
ls -lh /opt/discord-bot/logs/

# Today's system log (file dates are UTC)
cat /opt/discord-bot/logs/system-$(date -u +%Y-%m-%d).log

# The last 10 errors from any file
grep '"level":"ERROR"' /opt/discord-bot/logs/*.log | tail -10

# Today's commands
cat /opt/discord-bot/logs/command-$(date -u +%Y-%m-%d).log

# Follow the system log as it's written
tail -f /opt/discord-bot/logs/system-$(date -u +%Y-%m-%d).log
```

`/opt/discord-bot` is where the bot is installed; use your own path.

## Log Rotation

### Daily Files

Each category gets a new file every day, named `[category]-YYYY-MM-DD.log`. The date is UTC.

- `system-2026-06-28.log`: system logs for June 28, 2026
- `command-2026-06-28.log`: command logs for the same day

### Size Limit

When a file reaches 10 MB, it's renamed with a timestamp and a new one is started:

- Current file: `system-2026-06-28.log`
- Renamed file: `system-2026-06-28-1719619200000.log`

### Cleanup

Log files not written to for 30 days are deleted. The cleanup runs when the bot starts and every 24 hours after that.

## Slow Operations

When something takes longer than its threshold, the bot adds an entry to the **performance** log:

- **Commands** over 3 seconds
- **Buttons** for voting, tournament matchups, surveys, timers and watch history, over 2 seconds

An operation over 5 seconds is logged as a WARNING. One under 5 seconds is DEBUG, so it's left out with `NODE_ENV=production`.

Example:

```json
{
  "timestamp": "2026-06-28T23:55:30.123Z",
  "level": "WARNING",
  "levelNum": 4,
  "category": "performance",
  "message": "Performance: Command: /movie took 6523ms",
  "context": {
    "operation": "Command: /movie",
    "duration": 6523,
    "userId": "123456789012345678",
    "guildId": "123456789012345678"
  }
}
```

## Crash Diagnosis

These entries are written when something goes badly wrong. All of them go to the **system** log.

### Uncaught Exceptions

The bot logs it and exits. Your process manager (such as PM2) restarts it.

```json
{
  "timestamp": "2026-06-28T23:58:45.000Z",
  "level": "EMERGENCY",
  "levelNum": 0,
  "category": "system",
  "message": "Uncaught exception",
  "context": {
    "error": "Cannot read properties of undefined (reading 'id')",
    "stack": "TypeError: Cannot read properties of undefined (reading 'id')\n    at ...",
    "memory": { ... }
  }
}
```

### Unhandled Promise Rejections

The bot logs it and keeps running.

```json
{
  "timestamp": "2026-06-28T23:59:00.000Z",
  "level": "CRITICAL",
  "levelNum": 2,
  "category": "system",
  "message": "Unhandled promise rejection",
  "context": {
    "reason": "API request timed out",
    "stack": "...",
    "memory": { ... }
  }
}
```

### Discord Client Errors

```json
{
  "timestamp": "2026-06-29T00:00:15.000Z",
  "level": "ERROR",
  "levelNum": 3,
  "category": "system",
  "message": "Discord client error",
  "context": {
    "error": "read ECONNRESET",
    "stack": "..."
  }
}
```

## Best Practices

1. **After a crash,** run `/eggshen-logs errors` to see what happened just before it
2. **When the bot feels slow,** check `/eggshen-logs category category:performance`
3. **To see restarts,** check `/eggshen-logs category category:system`
4. **Copy logs you want to keep** somewhere else before the 30-day cleanup deletes them
5. **Look for repeats:** the same error over and over usually has one cause

## Troubleshooting

### "No log files found" or "No logs found for category … today"

- The bot may have just started, or nothing in that category has happened today (UTC)
- Check the disk has space: `df -h`
- Check the logs folder exists: `ls -ld /opt/discord-bot/logs`

### "Failed to read logs"

- The logs folder isn't readable by the bot's user
- The disk is full: check with `df -h`

### Log files are large

- Check sizes: `du -sh /opt/discord-bot/logs/*`
- The same error filling a file: fix its cause
- Run with `NODE_ENV=production` to leave out DEBUG entries

## Configuration

The settings are in `src/utils/logger.js`:

```javascript
const config = {
  minLevel: process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG,
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxAge: 30, // days
  consoleOutput: true
};
```

There are no environment variables for these besides `NODE_ENV`. To change them, edit the file and restart the bot.

## See Also

- [Every Command](/commands/index)
- [Getting Started](/getting-started)
- [Configuration](/configuration)

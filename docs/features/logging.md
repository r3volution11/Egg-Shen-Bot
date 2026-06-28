# Logging System

Egg Shen Bot includes a comprehensive Drupal watchdog-style logging system that captures all bot events, errors, and performance metrics. This system is designed to diagnose production issues like crashes, high CPU usage, and other problems that may occur.

## Overview

The logging system provides:
- **File-based logging** - All events stored in `logs/` directory
- **JSON format** - Structured logs with timestamps, severity, category, and context
- **8 severity levels** - From EMERGENCY (0) to DEBUG (7)
- **Categorized logs** - Separate files by event type
- **Automatic rotation** - Daily rotation and size-based rotation (10MB limit)
- **Auto-cleanup** - Logs older than 30 days automatically deleted
- **Performance tracking** - Slow operations logged with duration

## Severity Levels

The system uses 8 syslog-style severity levels:

| Level | Number | Description | Use Case |
|-------|--------|-------------|----------|
| 🚨 EMERGENCY | 0 | System is unusable | Uncaught exceptions, fatal crashes |
| 🔴 ALERT | 1 | Action must be taken immediately | Critical failures requiring intervention |
| 💥 CRITICAL | 2 | Critical conditions | Unhandled promise rejections |
| ❌ ERROR | 3 | Error conditions | Command failures, API errors |
| ⚠️ WARNING | 4 | Warning conditions | Unknown button interactions, degraded performance |
| 📢 NOTICE | 5 | Normal but significant | Important system events |
| ℹ️ INFO | 6 | Informational | Command execution, scheduler events |
| 🐛 DEBUG | 7 | Debug messages | Detailed tracing information |

## Log Categories

Logs are organized into categories, each with its own daily file:

- **system** - Bot startup, shutdown, errors, Discord client events
- **command** - Command execution, success/failure, duration
- **button** - Button interactions, vote submissions
- **select** - Select menu interactions
- **modal** - Modal form submissions
- **scheduler** - Tournament auto-close events, warnings
- **bracket** - Tournament operations, bracket generation
- **timer** - Timer events (start, complete, cancel)
- **survey** - Survey/poll operations
- **api** - External API calls (TMDB, RAWG, etc.)
- **database** - Data storage operations
- **performance** - Slow operations, performance metrics
- **security** - Security-related events

## Log File Format

Each log file contains JSON lines (one JSON object per line):

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

## Viewing Logs

### Using Discord Commands

The `/eggshen-logs` command allows administrators to view logs directly from Discord:

#### View Log Statistics

```
/eggshen-logs stats
```

Shows:
- Number of log files
- Total size in MB
- Latest log file
- Logs directory path

#### View Recent Errors

```
/eggshen-logs errors count:10
```

Shows the most recent errors (EMERGENCY, ALERT, CRITICAL, ERROR levels):
- Timestamp
- Severity level
- Category
- Error message
- Context (truncated for display)

Options:
- `count` - Number of errors to show (1-50, default: 10)

#### View Category Logs

```
/eggshen-logs category:command count:10
```

Shows recent log entries for a specific category:
- System
- Commands
- Buttons
- Scheduler
- Bracket
- API
- Performance

Options:
- `category` - Log category to view (required)
- `count` - Number of entries to show (1-50, default: 10)

### Using Server Access

If you have SSH access to the production server:

```bash
# View all log files
ls -lh /opt/discord-bot/logs/

# View today's system log
cat /opt/discord-bot/logs/system-$(date +%Y-%m-%d).log

# View recent errors (last 10)
grep '"level":"ERROR"' /opt/discord-bot/logs/*.log | tail -10

# View command execution logs
cat /opt/discord-bot/logs/command-$(date +%Y-%m-%d).log

# Monitor logs in real-time
tail -f /opt/discord-bot/logs/system-$(date +%Y-%m-%d).log
```

## Log Rotation

### Daily Rotation

New log files are created each day with the format: `[category]-YYYY-MM-DD.log`

Example:
- `system-2026-06-28.log` - System logs for June 28, 2026
- `command-2026-06-28.log` - Command logs for June 28, 2026

### Size-Based Rotation

If a log file exceeds 10MB, it's automatically rotated:
- Current file: `system-2026-06-28.log`
- Rotated file: `system-2026-06-28-1719619200000.log` (timestamp appended)

### Auto-Cleanup

Log files older than 30 days are automatically deleted to prevent disk space issues.

The cleanup runs:
- On bot startup
- Daily at midnight

## Performance Tracking

The logging system tracks slow operations:

- **Commands** - Any command taking >3000ms (3 seconds)
- **Button interactions** - Any button taking >2000ms (2 seconds)
- **API calls** - All external API requests with duration
- **Bracket generation** - PNG generation time

Example performance log:
```json
{
  "timestamp": "2026-06-28T23:55:30.123Z",
  "level": "WARNING",
  "levelNum": 4,
  "category": "performance",
  "message": "Slow operation detected: bracket visualization",
  "context": {
    "operation": "bracket visualization",
    "duration": 4523,
    "guildId": "123456789012345678"
  }
}
```

## Crash Diagnosis

The logging system captures critical errors that can cause crashes:

### Uncaught Exceptions

```json
{
  "timestamp": "2026-06-28T23:58:45.000Z",
  "level": "EMERGENCY",
  "levelNum": 0,
  "category": "system",
  "message": "Uncaught exception: Cannot read property 'id' of undefined",
  "context": {
    "error": "TypeError: Cannot read property 'id' of undefined",
    "stack": "TypeError: Cannot read property 'id' of undefined\n    at ...",
    "memory": { ... }
  }
}
```

### Unhandled Promise Rejections

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
  "message": "Discord client error: ECONNRESET",
  "context": {
    "error": "Error: ECONNRESET",
    "stack": "..."
  }
}
```

## Best Practices

1. **Check logs after crashes** - Use `/eggshen-logs errors` to see what happened before the crash
2. **Monitor performance** - Use `/eggshen-logs category:performance` to identify slow operations
3. **Review system logs** - Use `/eggshen-logs category:system` to see startup/shutdown events
4. **Keep logs archived** - Download important logs before they're auto-deleted (30 days)
5. **Watch for patterns** - Recurring errors may indicate systemic issues

## Troubleshooting

### "No log files found"

- The bot may have just started and no events logged yet
- Check server disk space: `df -h`
- Verify logs directory exists: `ls -ld /opt/discord-bot/logs`

### "Failed to read logs"

- Permissions issue - logs directory not readable
- Log file corruption - check file with `cat` command
- Disk full - check with `df -h`

### Large log files

- Check size: `du -sh /opt/discord-bot/logs/*`
- Old logs not cleaned up - check log dates
- High-frequency errors filling logs - investigate root cause
- Consider reducing log level in production

## Configuration

Log configuration is in `src/utils/logger.js`:

```javascript
const config = {
  minLevel: process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG,
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  consoleOutput: true
};
```

To change settings, edit this file and restart the bot.

## See Also

- [Commands Reference](commands/index.md) - All bot commands
- [Getting Started](getting-started.md) - Bot setup guide
- [Configuration](configuration.md) - Bot configuration options

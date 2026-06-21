# Watch Party Commands

Host synchronized watch parties with timers and track what your community watches.

## Timer Commands

Start timers for watch parties with customizable countdowns.

### Start a Timer

```
/timer start <duration> [description]
```

**Parameters:**
- `duration` (required) - Timer duration (e.g., "2h", "90m", "1h30m")
- `description` (optional) - What you're watching

**Supported Formats:**
- Minutes: `30m`, `90m`
- Hours: `2h`, `1.5h`
- Combined: `1h30m`, `2h15m`

**Features:**
- Public countdown display
- Updates in real-time
- Notification when timer completes
- "Log to Watch History" button appears when finished
- Only timer starter or moderators can log to history

**Example:**
```
/timer start 2h15m The Lord of the Rings: The Fellowship of the Ring
```

### Check Timer Status

```
/timer status
```

Shows the current timer status for the channel:
- Time remaining
- What's being watched
- Who started the timer

### Stop Timer

```
/timer stop
```

Stops the current timer in the channel. Only available to:
- User who started the timer
- Server administrators
- Users with Manage Guild permission
- Users with Moderate Members permission

## Watch History

Track what your server community watches together.

### Log to Watch History

After a timer completes, click the "Log to Watch History" button to save it.

**Who Can Save:**
- The user who started the timer
- Server administrators
- Users with Manage Guild permission
- Users with Moderate Members permission

**Information Saved:**
- Movie/TV show title
- Date watched
- Channel where watched
- Who saved it (public)
- Optional notes

**Example Modal:**
```
Title: The Fellowship of the Ring
Notes: Epic movie night! Everyone loved it.
```

### Manual Watch History Entry

```
/watched add <type> <title> [notes]
```

**Parameters:**
- `type` (required) - "movie" or "tv"
- `title` (required) - Title to search for
- `notes` (optional) - Additional notes about the viewing

**Features:**
- Search integration for accurate titles
- Selection menu if multiple matches found
- Immediate save to server history
- Public announcement in channel

**Example:**
```
/watched add movie Big Trouble in Little China Great kung-fu scenes!
```

### View Watch History

```
/watched list
```

Displays recent watch history for the server:
- Last 10 watched items
- Titles with TMDB links
- Dates watched
- Channels where watched
- Who saved each entry
- Notes from viewers

### Remove from History

```
/watched remove <id>
```

**Parameters:**
- `id` (required) - History entry ID (from `/watched list`)

**Permissions:**
- Server administrators only
- Cannot be undone

## Watch Party Best Practices

### Before Starting
1. Coordinate with your community on what to watch
2. Ensure everyone has access to the content
3. Set clear start time expectations
4. Test audio/video sync beforehand

### During the Watch Party
1. Use the timer to keep everyone synchronized
2. Encourage discussion in text chat
3. Avoid spoilers for new viewers
4. Pause timer if taking a break

### After Watching
1. Log to watch history while discussing
2. Add notes about memorable moments
3. Take recommendations for next watch party
4. Review watch history to avoid repeats

## Watch History vs Personal Ratings

**Important:** Watch history is server-level tracking, not personal ratings.

- ✅ **Public record** of what was watched together
- ✅ **Channel tracking** shows where watch parties happen
- ✅ **Community feature** visible to all members
- ❌ **Not for personal ratings** or private tracking
- ❌ **Not user-specific** - saved by timer starter/mods

For personal tracking, use external services like:
- [Trakt.tv](https://trakt.tv)
- [Letterboxd](https://letterboxd.com)
- [TV Time](https://www.tvtime.com)

## Rate Limiting

Watch party commands have minimal rate limiting:
- Timer commands: Once per minute per channel
- Watch history: Normal rate limit applies
- Logging from button: No cooldown (permission-based)

## Troubleshooting

### Can't log to watch history
- Verify you started the timer OR have mod permissions
- Check that timer has completed
- Ensure watch history isn't disabled for the server

### Timer not starting
- Check for existing timer in the channel
- Verify bot has permission to send messages
- Ensure duration format is correct

### Can't find title when logging
- Use `/movie` or `/tv` commands first to verify title
- Try alternative title formats or release years
- Check that TMDB API key is configured

### Watch history not saving
- Verify bot has database access
- Check server configuration for watch history
- Review mod logs for error messages

# Watch Party Commands

Host synchronized watch parties with timers and track what your community watches.

## Timer Commands

Start simple stopwatch timers for watch parties.

### Start a Timer

```
/timer start label:[optional] duration:[optional] theme:[optional]
```

**Parameters:**
- `label` (optional) - Label for what you're watching (e.g., "Movie night", "The Matrix")
- `duration` (optional) - Duration in minutes (1-600) for auto-stop timer
- `theme` (optional) - Timer countdown theme (default: modern)
  - `modern` - Colorful animated countdown (default)
  - `classic` - Sequential text countdown like the original bot

**Features:**
- **Auto-stop:** Set duration to automatically stop timer when time expires
- **Runtime auto-detection:** When label is auto-detected from Discord events, bot searches TMDB and adds 10-minute buffer
- **Smart selection:** If multiple TMDB matches found, shows selection menu to pick correct title
- **Runs continuously:** Without duration, runs until manually stopped
- 5-second countdown before starting (with visual/text animation)
- "Log to Watch History" button appears when stopped (if label was provided)
- Only timer starter or moderators can log to history
- Public display visible to all channel members
- Shows remaining time when duration is set

**Examples:**
```
/timer start label:The Lord of the Rings duration:190
/timer start label:Movie Night theme:classic
/timer start duration:30
/timer start
```

**Auto-Detection Example:**
1. Create Discord scheduled event named "The Lord of the Rings"
2. Link event to a watch party channel
3. Run `/timer start` (no parameters)
4. Bot finds multiple TMDB matches and shows selection menu
5. Select correct movie (The Fellowship of the Ring)
6. Bot auto-detects 178 min runtime + 10 min buffer = 188 minutes
7. Timer starts with auto-stop enabled

### Check Timer Status

```
/timer status
```

Shows the current timer status for the channel:
- Elapsed time
- Remaining time (if duration was set)
- Total duration (if set)
- What's being watched
- Who started the timer
- Auto-stop status

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
/watched add title:<title> notes:[optional notes]
```

**Parameters:**
- `title` (required) - Movie or TV show title to search for
- `notes` (optional) - Additional notes about the viewing

**Features:**
- Search integration for accurate titles
- Selection menu if multiple matches found
- Immediate save to server history
- Public announcement in channel

**Example:**
```
/watched add title:Big Trouble in Little China notes:Great kung-fu scenes!
```

### View Watch History

```
/watched history filter:[type] limit:[number]
```

**Parameters:**
- `filter` (optional) - Filter by content type (all, movie, tv) - default: all
- `limit` (optional) - Number of entries to show (1-25) - default: 10

Displays recent watch history for the server:
- Titles with TMDB links
- Dates watched
- Channels where watched
- Who saved each entry
- Notes from viewers

**Examples:**
```
/watched history
/watched history filter:movie limit:25
/watched history filter:tv limit:5
```

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

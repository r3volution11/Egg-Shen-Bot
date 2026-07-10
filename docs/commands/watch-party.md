---
title: Watch Party Commands - Egg Shen Bot
description: Host watch parties with smart timers that auto-detect movie and TV show titles from Discord events. Track your server's watch history and coordinate viewing schedules.
---

# Watch Party Commands

**Host synchronized watch parties (or game nights) with smart timers** that automatically detect movie, TV show, and board game titles — whether typed manually or pulled from a Discord event — calculate a runtime/playtime automatically, and track what your community watches together.

## Quick FAQ

**Q: How does auto-detection work?**  
A: When you run `/timer start` in a channel, the bot checks your server's Discord scheduled events. If an event is linked to that specific channel, the bot automatically uses the event's title as the timer label and searches TMDB for runtime.

**Q: Does it work with any Discord event?**  
A: Yes, but the event must be scheduled for the specific channel where you run `/timer start`. The bot reads the event title to detect what you're watching.

**Q: Does runtime detection also work if I type the label myself?**  
A: Yes. `/timer start label:Juno` searches the same way an auto-detected label does — no duration needed, the bot looks it up either way.

**Q: What if there are multiple matches?**  
A: The bot shows a selection menu so you can choose the correct title.

**Q: Does this work for board games, not just movies and TV?**  
A: Yes — the bot searches movies, TV shows, and board games (using BoardGameGeek's listed playing time) whenever it's trying to auto-detect a duration.

**Q: Can timers auto-stop?**  
A: Yes! Either set a manual duration (1-600 minutes) or let the bot detect runtime automatically (adds a 10-min buffer).

**Q: Who can stop a timer?**  
A: The person who started it or anyone with moderation permissions.

**Q: Does watch history work automatically?**  
A: Yes! When a timer with a title/label completes, it automatically logs to server watch history. A "Log to Watch History" button also appears for manual override or corrections. For timers without labels, use the button to manually log what you watched. Only the timer starter, administrators, or moderators can use the button.

---

Host synchronized watch parties with timers and track what your community watches.

## Timer Reminders

Announce that you're about to start the timer right before beginning the watch party.

### Remind Everyone

```
/timer remind message:[optional] role:[optional]
```

**Parameters:**
- `message` (optional) - Custom message to show (e.g., "Everyone ready?")
- `role` (optional) - Role to ping/mention

**Features:**
- **Auto-detects from Discord scheduled events** - Automatically finds the event linked to the current channel
- **TMDB integration** - Shows poster, runtime, year, and overview
- **Smart buttons** - "View on TMDB" and "Join Voice Channel" (if applicable)
- **Custom host message** - Add your own personal touch
- **Role mentions** - Ping specific groups to gather everyone
- **Pre-timer announcement** - Perfect right before running `/timer start`

**Example:**
```
/timer remind message:Everyone ready? Let's go! role:@Movie Night
```

**How It Works:**
1. You've already announced the watch party 1-2 hours ago via Discord event
2. Everyone is gathered and ready
3. Run `/timer remind` to give final notice
4. Shows what you're watching with TMDB details
5. Immediately run `/timer start` to begin

**Tip:** Use this right before starting the timer to ensure everyone is ready and knows what's playing!

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
- **Discord Event Auto-Detection:** Bot checks server's scheduled events - if one is linked to the current channel, automatically uses event title as timer label
- **Auto-stop:** Set duration to automatically stop timer when time expires
- **Runtime auto-detection:** Whenever a label is set and no duration is given — whether typed manually or auto-detected from a Discord event — the bot searches movies, TV shows, and board games and adds a 10-minute buffer to whatever it finds
- **Smart selection:** If multiple matches are found across movies, TV shows, and board games, shows a selection menu to pick the correct title (capped at 8 results per type, so the menu never exceeds Discord's 25-option limit)
- **Automatic watch history logging:** When timer completes (manual or auto-stop), automatically logs to server watch history if title found on TMDB
- **Runs continuously:** Without duration, runs until manually stopped
- 5-second countdown before starting (with visual/text animation)
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
1. Create a Discord scheduled event named "The Lord of the Rings"
2. Set the event location to a specific voice/stage channel (e.g., #watch-party)
3. In that channel, run `/timer start` (no label parameter needed)
4. Bot detects the Discord event linked to this channel
5. Bot uses "The Lord of the Rings" as the timer label automatically
6. Bot searches TMDB and finds multiple matches, shows selection menu
7. Select the correct movie (e.g., "The Fellowship of the Ring")
8. Bot auto-detects 178 min runtime + 10 min buffer = 188 minutes
9. Timer starts with auto-stop at 188 minutes

**Tip:** This works for any Discord event linked to a channel - the bot will always check for events when you run `/timer start` without a label! Typing a label yourself (`/timer start label:The Fellowship of the Ring`) gets the same title search and auto-duration treatment, without needing a Discord event at all.

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

### Pause and Resume Timer

```
/timer pause
/timer resume
```

Pause a timer if something comes up — a break, a technical issue, anything that interrupts the watch party — without losing your elapsed time or restarting from scratch.

- **`/timer pause`** freezes the elapsed and remaining time and cancels the pending auto-stop. `/timer status` will show "Timer Paused" with the elapsed/remaining time held at exactly where they were when you paused.
- **`/timer resume`** picks up right where you left off — the remaining time (if a duration was set) continues counting down from the same point, and auto-stop is rescheduled accordingly. Time spent paused never counts against the timer's duration.
- A paused timer survives a bot restart — it stays paused and won't auto-stop or start counting down on its own until you `/timer resume` it.
- `/timer stop` still works normally on a paused timer.
- `/timer adjust` requires resuming first — you can't change the duration while paused.
- Only available to the timer starter, server administrators, or moderators (same permissions as `/timer stop`).

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

### Automatic Watch History Logging

**NEW:** Timers now automatically log to watch history!

When a timer with a title/label completes (via `/timer stop` or auto-stop):

1. **Bot searches TMDB** for the title
2. **Finds best match** (first result)
3. **Automatically logs to server watch history**
4. **Shows confirmation** with poster, title, year, type
5. **"Log to Watch History" button appears** for manual override

**For timers WITHOUT labels:**
- Button appears to let you manually add what you watched
- Click button → Enter title → Add optional notes → Submit

**Button Permissions:**
- ✅ Timer starter can use it
- ✅ Server administrators can use it
- ✅ Server moderators can use it
- ❌ Other users cannot log timers they didn't start

**Information Saved:**
- Movie/TV show title from TMDB
- Year and type (movie/TV)
- Date watched
- Channel where watched
- Who started the timer
- Who stopped the timer
- Timer duration as notes
- Poster image

**What You See (with label):**
```
⏹️ Timer Stopped & Logged 🛑📝

The Lord of the Rings: The Fellowship of the Ring (2001)

✅ Automatically logged to watch history

Total Time: 3:02:15
Type: Movie
Channel: #movie-night
Started by: MovieFan
Stopped by: MovieFan

[📝 Log to Watch History] ← Click to manually log again or correct
```

**What You See (without label):**
```
⏹️ Timer Stopped 🛑

Timer has been stopped

Total Time: 2:15:30
Started by: MovieFan
Stopped by: MovieFan

[📝 Log to Watch History] ← Click to add what you watched
```

**No TMDB Match?**
If the title isn't found on TMDB, you'll see a warning but the button will still appear so you can manually search and log.

**Manual Override:**
The button lets you log a different title if auto-detection picked the wrong result, or add custom notes to the entry.

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

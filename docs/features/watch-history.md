---
description: "Keep a server-wide record of the movies, shows and episodes your Discord community watches together during watch parties."
---

# Watch History

Track what your Discord community watches together with server-wide watch history.

## Overview

Watch History is a **server-level** feature that tracks movies, TV shows, and episodes your community watches together during watch parties. It creates a public record of shared viewing experiences.

**Important:** This is NOT personal ratings or private tracking. Watch history is:
- ✅ Public and visible to all server members
- ✅ Server-wide community feature
- ✅ Tracks watch parties and group viewings
- ✅ Shows channel and who saved it
- ❌ Not for personal ratings or reviews
- ❌ Not user-specific tracking
- ❌ Not private or ephemeral

## How It Works

### 1. Start a Watch Party Timer

Use the timer command to begin:

```
/timer start label:The Lord of the Rings: The Fellowship of the Ring duration:190
```

**Optional parameters:**
- `label` - Name of what you're watching
- `duration` - Duration in minutes (1-600) for auto-stop
- `theme` - `modern` (default, colorful countdown) or `classic` (text-based)

**Runtime Auto-Detection:**
When a timer auto-detects the title from a Discord scheduled event:
1. Bot searches TMDB for the title
2. Shows selection menu if multiple matches found
3. You select the correct movie/TV show
4. Bot fetches runtime and adds 10-minute buffer
5. Timer starts with auto-stop enabled

**Examples:**
```
/timer start label:Movie Night duration:120
/timer start label:Jaws theme:classic
/timer start duration:45
/timer start
```

**Without duration:** Timer runs continuously until manually stopped.

### 2. Watch Together

Everyone in the channel watches together. The timer displays elapsed time.

### 3. Stop the Timer

When viewing ends, stop the timer:

```
/timer stop
```

**NEW:** The timer automatically logs to watch history!

### 4. Automatic Logging (Timers with Labels)

When the timer completes (manual stop or auto-stop), if a label was provided:

1. **Bot searches TMDB** for the title
2. **Finds best match** (uses first result)
3. **Automatically saves** to watch history
4. **Shows confirmation** with full details
5. **"Log to Watch History" button appears** for manual override

**Information Saved:**
- Movie/TV show title from TMDB
- Year and type (movie/TV)
- Date watched
- Timer duration as notes
- Channel where watched
- Who started/stopped the timer
- Poster image

**Manual Override Button:**
- Appears on ALL timer completions
- Lets timer starter/mods/admins manually log or correct
- For timers WITHOUT labels: enter title after the fact
- For timers WITH labels: override if wrong title detected

**Button Permissions:**
- ✅ Timer starter
- ✅ Server administrators
- ✅ Server moderators
- ❌ Other users (shows permission error)

### 5. Public Record

The entry appears publicly in the channel for everyone to see:

```
⏹️ Timer Stopped & Logged 🛑📝

The Lord of the Rings: The Fellowship of the Ring (2001)

✅ Automatically logged to watch history

Total Time: 3:02:15
Type: Movie
Channel: #movie-night
Started by: MovieFan
Stopped by: MovieFan

Use /watched history to view watch history • Use /timer start to begin a new timer
```

## Permission System

### Who Can Save to History?

**After Timer Completion:**
- ✅ User who started the timer (automatically authorized)
- ✅ Server Administrators
- ✅ Users with Manage Guild permission
- ✅ Users with Moderate Members permission

**Manual Entry:**
Anyone can add entries manually using `/watched add`, subject to rate limiting.

**Why This Restriction?**
- Prevents random users from polluting server history
- Timer starter knows what was actually watched
- Moderators can verify and save legitimate entries
- Maintains history accuracy

### Can Entries Be Removed?

**Not from Discord.** There is currently no command or button that removes or edits a watch history entry — `/watched` only has `add` and `history`. History is stored per server in `guild_watch_history/<server id>_history.json`, so on a self-hosted instance the person running the bot can edit that file directly if an entry must go.

## Commands

### View Watch History

```
/watched history [filter] [limit]
```

Shows the server's most recent entries, newest first:
- Last 10 entries by default; `limit` accepts 1–25
- `filter:all` (default), `filter:movie`, or `filter:tv`
- Title, year, and a 🎬/📺 type icon
- Who saved each entry, the date, and the channel (for timer-logged entries)
- Notes, if any were added

**Examples:**
```
/watched history limit:25
/watched history filter:movie limit:25
```

### Manual Entry

```
/watched add title:<text> notes:<text> private:<true|false>
```

Add to watch history without using a timer:

**Parameters:**
- `title` (required) - Title to search for. The bot searches **both** movies and TV shows, so there is no type option — if more than one result matches, you pick the right one from a menu
- `notes` (optional) - Notes about the viewing
- `private` (optional) - `private:true` shows the confirmation only to you; default is public

**Use Cases:**
- Retroactive logging of past watch parties
- Manual entry when timer wasn't used
- Adding rewatches or favorites

**Example:**
```
/watched add title:Big Trouble in Little China notes:First watch for half the group!
```

### Check Timer Status

```
/timer status
```

See how long the current timer has been running and who started it.

## Use Cases

### Regular Watch Parties

Track your weekly or monthly watch parties:

```
1. Start timer: /timer start label:Movie Night - The Matrix
2. Watch together (timer runs)
3. Stop timer: /timer stop
4. Click "Log to Watch History" button
5. Add notes about reactions and highlights
```

Review history before next party to avoid repeats:
```
/watched history
```

### Movie Marathons

Keep a record of marathon viewings:

```
Day 1: /timer start label:LotR: Fellowship
       → Watch, stop, save with notes
       
Day 2: /timer start label:LotR: Two Towers  
       → Watch, stop, save with notes
       
Day 3: /timer start label:LotR: Return of the King
       → Watch, stop, save with notes

All saved to history with marathon context
```

### TV Show Tracking

Log each viewing of a show, using `notes` to record which episode it was:

```
/watched add title:Breaking Bad notes:S01E01 - Pilot episode, hooked!
/watched add title:Breaking Bad notes:S01E02 - Still excellent
```

The entry is saved against the show itself (TMDB search matches the title, so put the episode in the notes rather than the title). Or use timers for each episode viewing.

### Community Recommendations

See what the community has watched and enjoyed:

```
/watched history
```

Browse recent watches, read notes from other viewers, and discover new content.

## Timer Auto-Detection

For advanced setups, configure watch party channels for automatic label detection from Discord events:

```
/eggshen-config-watch-party watch-party add channel:#movie-night
```

When you start a timer in a configured channel with an active Discord event, the bot automatically uses the event name as the timer label.

See the [Configuration Guide](/configuration#watch-party-configuration) for details.

### Avoiding Repeats

Check history before suggesting:

```
/watched history limit:25
→ Look for the title
→ See if watched recently
→ Choose something new
```

Narrow it with `filter:movie` or `filter:tv` to see further back within one type.

## Data Tracked

Each watch history entry includes:

| Field | Description | Example |
|-------|-------------|---------|
| **Title** | Movie/TV show name | "The Matrix" |
| **TMDB ID** | Database identifier | 603 |
| **Type** | Content type | "movie" or "tv" |
| **Date** | When watched | "2026-06-21" |
| **Channel ID** | Discord channel ID | 123456789 |
| **Channel Name** | Channel display name | "movie-night" |
| **Saved By ID** | User who saved it | 987654321 |
| **Saved By** | Username | "MovieFan" |
| **Notes** | Optional comments | "Great special effects!" |

## Watch History vs Personal Tracking

**Watch History** (This Bot):
- Server-level tracking
- Public records
- Group viewing focus
- Channel-specific
- Community feature
- No ratings or reviews

**Personal Tracking** (Use External Services):
- [Trakt.tv](https://trakt.tv) - Watch tracking and ratings
- [Letterboxd](https://letterboxd.com) - Movie diary and reviews
- [TV Time](https://www.tvtime.com) - TV show tracking
- [Simkl](https://simkl.com) - Movies and TV tracking

## Integration with Timer

Watch history is deeply integrated with the timer system:

### Timer Flow

```
1. /timer start → Creates countdown
2. Timer runs → Community watches
3. Timer ends → "Log to Watch History" button appears
4. Button click → Opens save modal
5. Submit → Saves to history publicly
6. Public message → Everyone sees the entry
```

### Button Behavior

**Who sees the button:** Everyone can see it

**Who can click it:** 
- Timer starter
- Administrators
- Users with Manage Guild permission
- Users with Moderate Members permission

**Others:** See permission error if clicked

### Modal Fields

When saving from timer:
- **Title** - Pre-filled from timer description
- **Notes** - Optional field for comments

All other data (channel, date, user) automatically captured.

## Statistics Integration

Each entry logged to watch history (by `/watched add` or a timer) is counted in server statistics:

- The **📝 Watched** count under "Other Commands" in `/stats`
- The **W** column of each user's breakdown in "Most Active Users"
- **📝 Watch History Logs** in `/stats type:personal`

See [Statistics](/features/statistics) for more details.

## Best Practices

### For Server Admins

1. **Set Clear Expectations**
   - Explain watch history is public
   - Document who can save entries
   - Post guidelines in server rules

2. **Moderate Appropriately**
   - Review history periodically with `/watched history`
   - Ensure accuracy (entries can't be removed from Discord, so ask hosts to double-check the title they pick)

3. **Encourage Usage**
   - Promote watch parties
   - Show history in welcome message
   - Celebrate milestones (100 watches, etc.)

### For Watch Party Hosts

1. **Use Timers**
   - Always start timer for watch parties
   - Set correct duration
   - Include title in description

2. **Add Detailed Notes**
   - Mention highlights
   - Note attendance/participation
   - Include memorable moments

3. **Check History First**
   - Avoid recent repeats
   - Find popular past choices
   - Discover community preferences

### For Server Members

1. **Respect the System**
   - Don't spam manual entries
   - Keep notes appropriate
   - Report issues to moderators

2. **Participate**
   - Join watch parties
   - Read notes from past watches
   - Suggest new content based on history

3. **Use External Services**
   - Use Trakt/Letterboxd for personal tracking
   - Keep ratings separate
   - Don't treat history as personal diary

## Privacy Considerations

Watch history is **intentionally public** for these reasons:

1. **Community Feature**
   - Shared experience tracking
   - Group accountability
   - Social discovery

2. **Transparency**
   - Everyone sees same information
   - No hidden data
   - Clear attribution

3. **Server Context**
   - Channel-specific tracking
   - Server member visibility only
   - Not published outside Discord

If users want **private tracking**, they should use external services.

## Troubleshooting

### Can't save to watch history

**Check:**
- Did you start the timer?
- Do you have moderator permissions?
- Has timer actually completed?
- Is watch history enabled for server?

**Solution:**
- Wait for timer to complete
- Ask a moderator to save
- Check server configuration

### Entry not appearing

**Check:**
- Was save confirmed?
- Is there an error message?
- Check mod logs for errors

**Solution:**
- Try manual entry with `/watched add`
- Check bot has database access
- Contact server administrator

### Wrong information saved

**Solution:**
- Re-add with correct information using `/watched add`, with a note explaining the correction
- Entries can't be removed from Discord; on a self-hosted instance the bot's operator can delete the wrong entry from `guild_watch_history/<server id>_history.json`

### History not showing

**Solution:**
- Use `/watched history` (try `filter:all` and a larger `limit`)
- Check the bot can send embeds in the channel

## Future Enhancements

Potential future features:

- Export watch history to CSV
- Statistics dashboard per user
- Integration with external services (Trakt, Letterboxd)
- Automatic show progress tracking
- Watch party scheduling
- Recommendation engine based on history

Submit feature requests on [GitHub Issues](https://github.com/r3volution11/Egg-Shen-Bot/issues)!

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

A "Log to Watch History" button appears (only if a label was provided).

### 4. Save to History

The person who started the timer (or a moderator) clicks the button. A modal appears to enter:

- **Title** - Movie/TV show name (pre-filled with timer label)
- **Notes** - Optional viewing notes, reactions, highlights

### 5. Public Record

The entry appears publicly in the channel for everyone to see:

```
📝 Watch History Saved

The Lord of the Rings: The Fellowship of the Ring (2001)
⭐ 8.8/10 • 🎬 178 min • Adventure, Fantasy

📅 Watched: June 21, 2026
📺 Channel: #movie-night
⏱️ Timer: 3:02:15
💾 Saved by: @MovieFan
📝 Notes: Epic trilogy start! Everyone loved the cinematography.
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

### Who Can Remove History?

**Only Administrators** can remove watch history entries:

```
/watched remove <id>
```

This restriction prevents:
- Casual deletion of server records
- Loss of community history
- Disputes about what was watched

## Commands

### View Watch History

```
/watched list [limit]
```

Shows recent watch history:
- Last 10 entries (default)
- Up to 50 entries with limit parameter
- Titles with TMDB links and ratings
- Dates and channels
- Who saved each entry
- Notes from viewers

**Example:**
```
/watched list 25
```
Shows last 25 entries.

### Manual Entry

```
/watched add type:<movie|tv> title:<text> notes:<text>
```

Add to watch history without using a timer:

**Parameters:**
- `type` - "movie" or "tv"
- `title` - Title to search for
- `notes` - Optional notes about the viewing (optional)

**Use Cases:**
- Retroactive logging of past watch parties
- Manual entry when timer wasn't used
- Adding rewatches or favorites

**Example:**
```
/watched add type:movie title:Big Trouble in Little China notes:First watch for half the group!
```

### Remove Entry

```
/watched remove id:<number>
```

**Administrator only** - Remove an entry from watch history.

Get the ID from `/watched list`, then:

```
/watched remove id:42
```

⚠️ **Cannot be undone!**

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
/watched list
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

Track episode-by-episode progress:

```
/watched add type:tv title:Breaking Bad S01E01 notes:Pilot episode - hooked!
/watched add type:tv title:Breaking Bad S01E02 notes:Still excellent
```

Or use timers for each episode viewing.

### Community Recommendations

See what the community has watched and enjoyed:

```
/watched list
```

Browse recent watches, read notes from other viewers, and discover new content.

## Timer Auto-Detection

For advanced setups, configure watch party channels for automatic label detection from Discord events:

```
/eggshen-config watch-party add channel:#movie-night
```

When you start a timer in a configured channel with an active Discord event, the bot automatically uses the event name as the timer label.

See the [Configuration Guide](/configuration#watch-party-configuration) for details.

### Avoiding Repeats

Check history before suggesting:

```
/watched list 50
→ Search for title
→ See if watched recently
→ Choose something new
```

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

Watch history contributes to server statistics:

- Total watches tracked
- Most watched titles
- Active watch party channels
- Most active watch party organizers
- Watch frequency trends

See [Statistics](/features/statistics) for more details.

## Best Practices

### For Server Admins

1. **Set Clear Expectations**
   - Explain watch history is public
   - Document who can save entries
   - Post guidelines in server rules

2. **Moderate Appropriately**
   - Review history periodically
   - Remove duplicate entries
   - Ensure accuracy

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
- Administrator can remove entry: `/watched remove <id>`
- Re-add with correct information
- Add note explaining correction

### History showing 404 error

**Issue:** History list page not rendering

**Solution:**
- Use `/watched list` command instead
- Check bot permissions
- Verify database connection

## Future Enhancements

Potential future features:

- Export watch history to CSV
- Statistics dashboard per user
- Integration with external services (Trakt, Letterboxd)
- Automatic show progress tracking
- Watch party scheduling
- Recommendation engine based on history

Submit feature requests on [GitHub Issues](https://github.com/r3volution11/Egg-Shen-Bot/issues)!

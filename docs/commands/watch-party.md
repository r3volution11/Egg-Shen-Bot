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

## Announcements

Generate the initial "hey, we're watching this tonight" announcement — typically posted an hour or two before the watch party, well before `/timer remind`'s final-notice ping.

### Generate an Announcement

```
/announce title1:<title> episodes1:[optional] title2:[optional] episodes2:[optional] time:<time> host:[optional] tone:[optional] custom-tone:[optional]
```

**Parameters:**
- `title1` (required) - First movie or TV show title
- `episodes1` (optional) - Episode(s) for `title1` if it's a TV show — flexible notation: `S3E9-E12`, `S3E9-12`, `Season 3 Episode 9`, `S03E09-E12`, etc.
- `title2` / `episodes2` (optional) - A second title, for back-to-back watch parties (e.g. two episodes then a movie)
- `time` (required) - Start time to include in the announcement, used exactly as typed (e.g. `"8:00 PM EST"`)
- `host` (optional) - Who's hosting — a persona name (like a horror-host character) or a literal `@mention`, your choice
- `tone` (optional) - One of `Funny`, `Scary`, `Dramatic`, `Wholesome`, `Mysterious`
- `custom-tone` (optional) - Describe your own tone/style instead (e.g. `"like a noir detective"`) — overrides `tone` if both are given

**Features:**
- Looks up each title on TMDB for the real plot/premise, so the AI writes something specific to the movie or show rather than generic filler
- Automatically includes real streaming availability ("Available to stream on...")
- Reply is private (only visible to you) and formatted as a copy-paste-ready code block — **the bot never posts the announcement anywhere itself**, you post it manually wherever you'd like (e.g. an announcements channel)
- If OpenAI is unavailable, falls back to a plain, clearly-labeled non-AI template instead of failing outright
- Admin/Moderator only

**Example:**
```
/announce title1:"Tales From the Crypt" episodes1:"S3E9-E12" title2:"Hellraiser" time:"8:00 PM EST" host:"Cryptkeeper" tone:Scary
```

**How It Works:**
1. Run `/announce` with your title(s), start time, and optional host/tone
2. Bot looks up each title's plot and streaming availability, then asks AI to write short promotional flavor text in your chosen tone
3. You get back a private, copy-paste-ready announcement
4. Post it yourself wherever you'd like (e.g. your server's announcements channel) — the bot doesn't post it for you
5. Later, run `/timer remind` closer to start time, then `/timer start` when you begin

**Tip:** Since nothing is posted automatically, you can generate a few variations (different tones, or run it again) before picking your favorite to post.

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
/timer start label:[optional] movie:[optional] tv:[optional] duration:[optional] theme:[optional]
```

**Parameters:**
- `label` (optional) - Label for what you're watching (e.g., "Movie night", "The Matrix"). Also triggers a movie/TV/board-game runtime lookup — see below
- `movie` (optional) - Movie title to look up and time automatically. An alternative to `label` for when you specifically mean a movie — skips the ambiguous merged search and goes straight to a movie-only lookup
- `tv` (optional) - TV show title to look up, optionally with an episode or episode range (e.g. `"The Office"` or `"Tales from the Crypt S5E5-E8"`) — an alternative to `label` for TV specifically
- `duration` (optional) - Duration in minutes (1-1440) for auto-stop timer — used exactly as given by default (see [Timer Durations & the Expiry Warning](#timer-durations-the-expiry-warning) below for the one case where the bot picks a duration for you)
- `theme` (optional) - Timer countdown theme (default: modern)
  - `modern` - Colorful animated countdown (default)
  - `classic` - Sequential text countdown like the original bot

Use only **one** of `label`, `movie`, or `tv` — providing more than one is rejected with an error, since each is a different way of saying what's playing. `label` still works exactly as it always has (including auto-detecting from a channel's linked event, and searching movies/TV/board games together) — `movie`/`tv` exist for when you already know the type and want to skip the ambiguity, e.g. if a movie and a TV show happen to share a name.

**Features:**
- **Discord Event Auto-Detection:** Bot checks server's scheduled events - if one is linked to the current channel, automatically uses event title as timer label
- **Auto-stop:** Set duration to automatically stop timer when time expires
- **Runtime auto-detection:** Whenever a label is set and no duration is given — whether typed manually or auto-detected from a Discord event — the bot searches movies, TV shows, and board games and adds a 10-minute buffer to whatever it finds. A found runtime is used as-is, no matter how long it is
- **Multi-episode watch parties:** A label like "Tales from the Crypt - S5: E5 - E8" (four episodes in one watch party) is understood automatically — see [Multi-Episode Watch Parties](#multi-episode-watch-parties) below
- **Decisive auto-selection:** When a movie/TV search turns up a clear, decisive best match, the bot skips the confirmation menu and starts the timer directly — same landslide-detection behavior used by [`/movie` and `/tv`](/commands/search#smarter-auto-selection)
- **Smart selection:** If multiple matches are found across movies, TV shows, and board games (and none is a clear winner), shows a selection menu to pick the correct title (capped at 8 results per type, so the menu never exceeds Discord's 25-option limit)
- **No match found:** If nothing is typed and nothing is auto-detected at all, the bot tells you directly and falls back to a default duration (6 hours, server-configurable) rather than running forever unnoticed — see below
- **Recovery from a bad auto-detected title:** If the event title the bot pulled from a Discord scheduled event doesn't cleanly match a search (no results, or an ambiguous multi-match), you're never stuck with the wrong title — a **🔎 Search** button lets you type the correct one and search again, as many times as needed — see [Auto-Detection Example](#start-a-timer) below
- **Automatic watch history logging:** When timer completes (manual or auto-stop), automatically logs to server watch history if title found on TMDB
- 5-second countdown before starting (with visual/text animation)
- Public display visible to all channel members
- Shows remaining time when duration is set

**Examples:**
```
/timer start label:The Lord of the Rings duration:190
/timer start label:Movie Night theme:classic
/timer start movie:The Thing
/timer start tv:The Office
/timer start tv:"Tales from the Crypt S5E5-E8"
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

**If the auto-detected title doesn't match anything (or matches too many things):** Since the title came from the scheduled event's name rather than something you typed, it won't always match cleanly — a typo in the event name, a subtitle TMDB doesn't recognize, etc. Rather than starting a timer under the wrong name (or leaving you stuck), the bot always gives you a way out when the label came from auto-detection:

- **No matches at all:** Instead of silently starting the timer under the unresolved event title, you'll see a screen with two buttons — **🔎 Search** (opens a box to type the correct title, which searches again) and **▶️ Start Timer** (starts the timer anyway, with no duration — see [Timer Durations & the Expiry Warning](#timer-durations-the-expiry-warning) for what that means).
- **Multiple matches (the usual selection menu):** The same **🔎 Search** button appears alongside the picker, in case none of the listed results are actually right.

You can click **Search** as many times as you need — there's no limit — until either a search finds the right title or you choose **Start Timer** to proceed without one. This recovery flow only appears for auto-detected titles; a label you typed yourself with `label:`/`movie:`/`tv:` keeps the existing behavior (a "Start Timer (No Duration)" option in the picker, or a quiet warning and immediate start when nothing matches at all).

### Multi-Episode Watch Parties

A label that includes a season/episode range — like an event or channel name of "Tales from the Crypt - S5: E5 - E8" — is understood as a single watch party spanning multiple episodes, not a single-episode lookup. The bot:

1. Recognizes the range notation and separates it from the show name
2. Searches for the show (using the same decisive auto-selection and AI-powered ranking as `/tv`)
3. Looks up every episode in the range and adds up their individual runtimes
4. Adds the standard 10-minute buffer to the total

Rather than just showing a final number, you'll see a breakdown so you can sanity-check it before the timer starts:

```
📺 Tales from the Crypt — Season 5, Episodes 5-8 (4 episodes)
  E5: 22 min
  E6: 22 min
  E7: 21 min
  E8: 23 min
──────────────
4 episodes, ~22 min each = 88 min + 10 min buffer = 98 min
```

If TMDB doesn't have a specific runtime for one of the episodes, the show's average episode length is used for that one instead, and it's marked `(estimated)` in the breakdown so it's clear which numbers are exact and which are a best guess.

**Supported formats:** `S5E5-E8`, `S5: E5 - E8`, `S05E05-E08`, `Season 5 Episode 5-8`, `Season 5, Episodes 5-8`, and single-episode notation (`S3E1`, `3x11`) all work — a single episode with no range just gets the normal single-episode treatment.

**If the show name matches multiple shows** (e.g. a same-titled reboot), you'll get a selection menu just like the regular multi-match picker — pick the right one and the range calculation continues from there.

### Check Timer Status

```
/timer status
/timer check
```

Shows the current timer status for the channel:
- Elapsed time
- Remaining time (if duration was set)
- Total duration (if set)
- What's being watched
- Who started the timer
- Auto-stop status

**Parameters:**
- `public` (optional) - Show this to everyone in the channel instead of just you (default: false)

By default, checking the timer only shows the result to you — most people check just to glance at their own progress, and showing it to everyone every time would flood the channel. Add `public:true` to announce the current status to the whole channel instead:
```
/timer status public:true
```

`/timer check` is an alias for `/timer status` and works exactly the same way, including the `public` option.

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
- By default, only the timer starter, server administrators, or moderators can pause/resume it — same permissions as `/timer stop`. Servers can open this up to everyone (see below).

### Stop Timer

```
/timer stop
```

Stops the current timer in the channel. By default, only available to:
- User who started the timer
- Server administrators
- Users with Manage Guild permission
- Users with Moderate Members permission

### Who Can Pause, Resume, or Stop a Timer

By default, pausing, resuming, and stopping a timer is restricted to whoever started it plus server administrators/moderators. Some servers — especially larger, more casual ones — prefer to let **any member** step in and pause or stop a timer, since the person who started it isn't always still around when something comes up. Admins/mods can enable this:

```
/eggshen-config settings timer-control anyone-can-pause-stop:true
```

This only affects `/timer pause`, `/timer resume`, and `/timer stop` — `/timer adjust` and `/timer autostop` (which change the timer's duration or auto-stop configuration, not just start/stop it) always stay restricted to the starter or an admin/mod, regardless of this setting.

### Adjust Timer Duration

```
/timer adjust duration:<minutes>
```

Changes the total duration of the active timer (elapsed time is preserved — this sets a new *total*, not an amount to add). Same permissions as `/timer stop`. Used exactly as given by default; only reduced if this server has opted into a [timer ceiling](/commands/configuration#timer-ceiling) (off by default).

### Enable or Disable Auto-Stop

```
/timer autostop autostop:<enable|disable> duration:[required if enabling]
```

- **`autostop:disable`** — removes auto-stop entirely from a running timer, so it never stops on its own. Use this for overnight sessions or marathons where you don't want any cap.
- **`autostop:enable`** — turns auto-stop back on for a timer that doesn't currently have a duration; requires a `duration`.

Same permissions as `/timer stop`.

### Timer Durations & the Expiry Warning

**By default, a timer runs for exactly whatever duration you gave it — no cap, no maximum.** A manually-typed `duration:500` or an auto-detected 8-hour concert film runs for its full length; nothing shortens it unless this server has explicitly opted into a [timer ceiling](/commands/configuration#timer-ceiling) (off by default).

The one exception is when **nobody said anything at all** — no `duration` was typed, no label was given (or the label matched nothing), or you chose "Skip" from the title-selection menu. In that specific case, rather than the timer running forever unnoticed, it falls back to a **default 6-hour (360 minute) duration**, so it still auto-stops eventually. This fallback duration is invisible in `/timer status` and the start confirmation — no "Duration" or "Remaining Time" field is shown, since it isn't something you set or the bot determined, just a safety net running quietly in the background. It's server-configurable:

```
/eggshen-config settings max-timer-duration minutes:<1-1440>
/eggshen-config settings max-timer-duration unlimited:true
```

`unlimited:true` disables the fallback entirely — a no-duration timer just runs forever, same as `/timer autostop disable`. See [Configuration](/commands/configuration#max-timer-duration) for details.

**About an hour before one of these fallback-duration timers is due to auto-stop**, the bot posts a warning in the channel, mentioning whoever started it, with an **Extend Timer** button. Clicking it opens a small form to enter how many additional minutes to add. Once extended, the timer's duration is a real, user-chosen value from that point on — it won't warn again unless it's later extended and re-enters the last-hour window.

This warning **only ever fires for fallback-duration timers.** A timer with a real duration — typed manually, adjusted with `/timer adjust`, or auto-detected from a movie/TV runtime — never gets this warning, no matter how long it runs.

`/timer autostop disable` remains the way to start a timer with **no expiry at all** from the outset.

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
- `private` (optional) - Only show the confirmation to you instead of the whole channel (default: false)

**Features:**
- Search integration for accurate titles
- Selection menu if multiple matches found
- Immediate save to server history
- Public announcement in channel (unless `private:true`)

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

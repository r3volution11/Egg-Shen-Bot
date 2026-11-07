---
title: Watch Party Commands - Egg Shen Bot
description: Host watch parties with smart timers that auto-detect movie and TV show titles from Discord events. Track your server's watch history and coordinate viewing schedules.
---

# Watch Party Commands

**Host synchronized watch parties (or game nights) with smart timers** that automatically detect movie, TV show, and board game titles — whether typed manually or pulled from a Discord event — calculate a runtime/playtime automatically, and track what your community watches together.

## Quick FAQ

**Q: How does auto-detection work?**  
A: When you run `/timer start` with no title in a watch-party channel, the bot looks for a Discord scheduled event in that channel that has started. If it finds one, it uses the event's name as the timer's title and looks up the runtime. An admin makes a channel a watch-party channel with `/eggshen-config-watch-party watch-party add`.

**Q: Does it work with any Discord event?**  
A: Yes, as long as it has started and it's in the channel where you run `/timer start`: its voice or stage channel, or a channel named in its location. Admins can turn auto-detection down or off with [`/eggshen-config-watch-party watch-party auto-detect`](/commands/configuration#watch-party-auto-detect).

**Q: Does runtime detection also work if I type the label myself?**  
A: Yes. `/timer start label:Juno` searches the same way an auto-detected label does — no duration needed, the bot looks it up either way.

**Q: What if there are multiple matches?**  
A: The bot shows a selection menu so you can choose the correct title.

**Q: Does this work for board games, not just movies and TV?**  
A: Yes — the bot searches movies, TV shows, and board games (using BoardGameGeek's listed playing time) whenever it's trying to auto-detect a duration.

**Q: Can timers auto-stop?**  
A: Yes. Give a `duration` (1-1440 minutes), or let the bot use the title's runtime plus 10 minutes.

**Q: Who can stop a timer?**  
A: The person who started it, and admins and moderators. A server can let anyone pause, resume and stop timers with `/eggshen-config settings timer-control`.

**Q: Does watch history work automatically?**  
A: Yes. When a timer that knows its title stops, it's logged to the server's watch history. If the timer has no title, name it with `/timer title` before you stop it, or log it afterwards with the stop card's **📝 Log to Watch History** button or `/watched add`.

---

## Announcements

`/announce` covers the two moments a watch party needs announcing: the advance notice, and the final nudge.

| When | Command |
|---|---|
| An hour or more ahead | `/announce party` now, or [`/announce schedule`](#scheduled-announcements) to post it automatically |
| 10 minutes before a scheduled event | Automatic: the [starting-soon card](#the-automatic-starting-soon-card) |
| A few minutes before | `/announce starting` |
| The moment you start the timer | `/timer remind` (or `/watchparty remind`) |

Every `/announce` subcommand posts to the channel itself, and all of them are Admin/Moderator only.

### The Advance Notice

```
/announce party title1:<title> time:<time> message:[optional] channel:[optional] role:[optional] episodes1:[optional] title2:[optional] episodes2:[optional] host:[optional] tone:[optional] custom-tone:[optional]
```

**Parameters:**
- `title1` (required) - First movie or TV show title
- `time` (required) - Start time to include, used exactly as typed (e.g. `"8:00 PM EST"`)
- `message` (optional) - **Your own announcement text, posted exactly as written.** Skips AI entirely
- `channel` (optional) - Where to post it. Defaults to the channel you run the command in
- `role` (optional) - Role to ping. Pinged in the message itself, so it genuinely notifies
- `episodes1` (optional) - Episode(s) for `title1` if it's a TV show — flexible notation: `S3E9-E12`, `S3E9-12`, `Season 3 Episode 9`, `S03E09-E12`, etc.
- `title2` / `episodes2` (optional) - A second title, for back-to-back watch parties (e.g. two episodes then a movie)
- `host` (optional) - Who's hosting — a persona name (like a horror-host character) or a literal `@mention`, your choice
- `tone` (optional) - One of `Funny`, `Scary`, `Dramatic`, `Wholesome`, `Mysterious`. Only applies to AI-written text
- `custom-tone` (optional) - Describe your own tone/style instead (e.g. `"like a noir detective"`) — overrides `tone` if both are given

**Which text gets posted:**

| You supplied | Server AI setting | Result |
|---|---|---|
| `message` | either | Your text, exactly as written. No AI call |
| nothing | enabled | AI writes it from the real plot and streaming info |
| nothing | disabled | A plain template |

**Features:**
- Looks up each title on TMDB for the real plot/premise, so AI-written text is specific to the movie or show rather than generic filler
- Automatically includes real streaming availability ("Available to stream on...")
- Uses the title's landscape artwork, which keeps the card about half the height a poster would
- Checks it can actually post in the target channel first, so you're never told an announcement went out when it didn't
- Falls back to a plain template if AI is off or unavailable, rather than failing

**Example:**
```
/announce party title1:"Tales From the Crypt" episodes1:"S3E9-E12" title2:"Hellraiser" time:"8:00 PM EST" host:"Cryptkeeper" tone:Scary role:@Movie Night
```

### The Final Nudge

```
/announce starting message:<text> title:[optional] channel:[optional] role:[optional]
```

**Parameters:**
- `message` (required) - e.g. `"Starting in 10 minutes"` or `"Starting at 9:35 pm"`. Always posted exactly as written
- `title` (optional) - What's being watched. Adds the artwork and the canonical title
- `channel` (optional) - Where to post it. Defaults to the current channel
- `role` (optional) - Role to ping, in the message content

AI is never involved here — a timing claim is the one thing that must not be paraphrased.

**Example:**
```
/announce starting message:"Starting in 10 minutes" title:"Hellraiser" role:@Movie Night
```

**Tip:** An unrecognised `title` won't lose your announcement — it posts with what you typed, just without the artwork.

### Scheduled Announcements

Queue the advance notice to post automatically, a set time before one of the server's [scheduled events](https://support.discord.com/hc/en-us/articles/4409494125719):

```
/announce schedule event:<pick one> hours:<0-336> minutes:[optional] channel:[optional] role:[optional] message:[optional] title1:[optional] episodes1:[optional] title2:[optional] host:[optional]
```

- **`event`**: start typing and pick from the server's upcoming events, soonest first.
- **`hours`** and **`minutes`**: how long before the event starts the card should post. For example, `hours:2` posts two hours ahead, and `hours:0 minutes:45` posts 45 minutes ahead.
- **`channel`**: where it posts, such as `#announcements`. Defaults to the channel you run the command in.
- **`title1`**: by default, the event's name is the title (a year like "(1978)" is ignored, and episodes in the name or description, such as "S6: E4-E7", are picked up). Use `title1` when the event is called something like "Spooky Saturday".
- The rest work as they do for `/announce party`. Leave out `message` and AI writes the text if the server allows it.

It posts the **full watch-party card**: art, where to stream it, and the start time shown in each reader's own timezone, plus the event's link so people can click **Interested**.

It's tied to the event:
- **Moved:** if the event's start time changes, the announcement moves with it.
- **Cancelled:** if the event is cancelled or deleted, the announcement is cancelled too.
- **Late:** if the bot was offline through the posting time and the event has already started, the announcement is skipped rather than posted late.

Titles are checked when you schedule, so a typo shows up right away rather than hours later.

**See or cancel:** `/announce scheduled` lists what's waiting to post, with a **Cancel** button for each, and what happened to recent ones (posted, cancelled, skipped, or failed and why).

**Example:** the full card in #announcements two hours before Friday's event, pinging the movie-night role:
```
/announce schedule event:Night of the Living Dead hours:2 channel:#announcements role:@Movie Night
```

### The Automatic Starting-Soon Card

Ten minutes before **every** scheduled event starts, Egg Shen posts a short "starting soon" card in the event's own channel: its voice channel's chat, or the channel named in its location (such as `#watch-party`). Nobody has to schedule it. It shows the event's cover image (or the title's artwork) and links to the event.

It posts once per event. If the event is moved, it posts again for the new time. Admins can turn it off with [`/eggshen-config-watch-party watch-party starting-soon`](/commands/configuration#starting-soon-cards).

## Timer Reminders

Announce that you're about to start the timer right before beginning the watch party. `/watchparty remind` does the same thing.

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
1. You've already announced the watch party, with `/announce` or a Discord event
2. Everyone is gathered
3. Run `/timer remind` to give final notice, showing what you're watching with TMDB details
4. Optionally run `/watchparty ready` to see who's actually ready ([Ready Check](#ready-check))
5. Run `/timer start` to begin

**Tip:** Use this right before starting the timer so everyone knows what's playing.

## Ready Check

Not sure whether everyone's back with snacks? Ask, and let the bot count. It works for a planned watch party or a spur-of-the-moment one.

```
/watchparty ready message:[optional] role:[optional]
```

**Parameters:**
- `message` (optional): a line shown on the card, such as "Starting in 5!"
- `role` (optional): a role to ping

The bot posts a card with two buttons, **✅ Ready** and **⏳ Need a minute**. Anyone can press one, and can switch their answer at any time. The card lists who's ready and who asked for a minute, so you can see exactly who you're waiting on. It's only a count; you still start the timer yourself.

**When a watch party is scheduled for the channel**, either already running or starting within about two hours, the card also compares the answers with who marked the Discord event **Interested**:

```
👀 Interested in the event: 9
4 ready, 1 needs a minute
Not checked in yet: @hal @ivy @jo @kim
Also ready: 1 who didn't mark Interested
```

The Interested list refreshes as people answer, so someone who clicks Interested late still counts. Without an event, or if the bot can't read the event, the card is a plain tally.

**You'll get a ping** when the last person who asked for a minute presses Ready: "✅ Everyone who asked for a minute is ready." It's a new message, so it notifies you even if you're not looking at the card.

**The card stops taking answers** and freezes with the final count when:
- A timer starts in the channel (`/timer start`)
- The channel's Discord event goes live, if the check was posted before it started. The card updates the next time someone presses a button.
- You close it with `/watchparty ready-close`
- Someone posts a newer ready check in the same channel
- Three hours pass

### Close a Ready Check

```
/watchparty ready-close
```

Stops taking answers on the channel's ready check and shows the final count. Only the person who posted it, or a moderator, can close it.

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
- **Discord Event Auto-Detection:** In a watch-party channel (added with `/eggshen-config-watch-party watch-party add`), a timer started with no title takes its title from the channel's running scheduled event
- **Auto-stop:** Set duration to automatically stop timer when time expires
- **Runtime auto-detection:** Whenever a label is set and no duration is given — whether typed manually or auto-detected from a Discord event — the bot searches movies, TV shows, and board games and adds a 10-minute buffer to whatever it finds. A found runtime is used as-is, no matter how long it is
- **Multi-episode watch parties:** A label like "Tales from the Crypt - S5: E5 - E8" (four episodes in one watch party) is understood automatically. The episodes can also live in the **scheduled event's description**: an event named "Tales From the Crypt" described as "Season 6 episodes 4 - 7" gets a timer for all four episodes with no clicks. See [Multi-Episode Watch Parties](#multi-episode-watch-parties) below
- **Decisive auto-selection:** When a search turns up an exact title match, or a clear decisive best match, the bot skips the confirmation menu and starts the timer directly — same landslide-detection behavior used by [`/movie` and `/tv`](/commands/search#smarter-auto-selection)
- **No duration guessed for TV without an episode count:** A TV show's listed runtime is a *single* episode, but a watch party is rarely one episode — so that number would stop the timer partway through. A TV title gets a real duration only when the episodes are known (from range notation, or the event description); otherwise the timer runs to the server's auto-stop limit, which warns before it ends so anyone can extend it
- **Start now, or look it up:** If an auto-detected title can't be pinned down, the bot offers two buttons — **▶️ Start Now** or **🔎 Look Up Title** — rather than a long list. Servers can change this with [`/eggshen-config-watch-party watch-party auto-detect`](/commands/configuration#watch-party-auto-detect)
- **Smart selection:** When you do ask to look up a title (or a label you typed yourself is ambiguous), a selection menu appears with **▶️ Start Timer Without Title Selection** as its first option, so starting immediately is always one click away
- **No match found:** If nothing is typed and nothing is auto-detected at all, the bot tells you directly and falls back to a default duration (6 hours, server-configurable) rather than running forever unnoticed — see below
- **Recovery from a bad auto-detected title:** If the event title the bot pulled from a Discord scheduled event doesn't match anything, you're never stuck with the wrong title — a **🔎 Search** button lets you type the correct one and search again, as many times as needed — see [Auto-Detection Example](#start-a-timer) below
- **Automatic watch history logging:** When the timer stops (by hand or on its own), it's logged to the server's watch history if its title is found on TMDB. If it isn't, the stop card has a button to log it by hand
- A short countdown before it starts, posted in the channel
- Shows the remaining time when it has a duration

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
1. An admin adds the channel once: `/eggshen-config-watch-party watch-party add channel:#watch-party`
2. Create a Discord scheduled event named "The Lord of the Rings" in that channel, and start it
3. In that channel, run `/timer start` (no label parameter needed)
4. Bot detects the running Discord event linked to this channel
5. Bot uses "The Lord of the Rings" as the timer label automatically
6. Bot searches TMDB and finds multiple matches, shows selection menu
7. Select the correct movie (e.g., "The Fellowship of the Ring")
8. Bot auto-detects 178 min runtime + 10 min buffer = 188 minutes
9. Timer starts with auto-stop at 188 minutes

**Tip:** This works for any running Discord event in a watch-party channel. Typing a label yourself (`/timer start label:The Fellowship of the Ring`) gets the same title search and auto-duration treatment, without needing a Discord event at all.

**If the auto-detected title doesn't match anything (or matches too many things):** Since the title came from the scheduled event's name rather than something you typed, it won't always match cleanly — a typo in the event name, a subtitle TMDB doesn't recognize, etc. Rather than starting a timer under the wrong name (or leaving you stuck), the bot always gives you a way out when the label came from auto-detection:

- **No matches at all:** Instead of silently starting the timer under the unresolved event title, you'll see a screen with two buttons — **🔎 Search** (opens a box to type the correct title, which searches again) and **▶️ Start Timer** (starts the timer anyway, with no duration — see [Timer Durations & the Expiry Warning](#timer-durations-the-expiry-warning) for what that means).
- **Multiple matches (the usual selection menu):** The same **🔎 Search** button appears alongside the picker, in case none of the listed results are actually right.

You can click **Search** as many times as you need — there's no limit — until either a search finds the right title or you choose **Start Timer** to proceed without one. This recovery flow only appears for auto-detected titles; a label you typed yourself with `label:`/`movie:`/`tv:` keeps the existing behavior (a **▶️ Start Timer Without Title Selection** option at the top of the picker, or a quiet warning and immediate start when nothing matches at all).

### Multi-Episode Watch Parties

A label that includes a season/episode range — like an event or channel name of "Tales from the Crypt - S5: E5 - E8" — is understood as a single watch party spanning multiple episodes, not a single-episode lookup. The bot:

1. Recognizes the range notation and separates it from the show name
2. Searches for the show (using the same decisive auto-selection and AI-powered ranking as `/tv`)
3. Looks up every episode in the range and adds up their individual runtimes
4. Adds a buffer for ad breaks and pauses: 5 minutes per episode by default, and never less than 10 minutes

Rather than just showing a final number, you'll see a breakdown so you can sanity-check it before the timer starts:

```
📺 Tales from the Crypt — Season 5, Episodes 5-8 (4 episodes)
  E5: 22 min
  E6: 22 min
  E7: 21 min
  E8: 23 min
──────────────
4 episodes, ~22 min each = 88 min + 20 min buffer = 108 min
```

TMDB lists runtimes without ads, so a 22-minute episode on Tubi or Pluto TV runs closer to 30. Admins set the per-episode buffer (0-30 minutes) with `/eggshen-config-watch-party watch-party episode-buffer`: 0 for ad-free services, 8-10 for ad-supported ones.

If TMDB doesn't have a specific runtime for one of the episodes, the show's average episode length is used for that one instead, and it's marked `(estimated)` in the breakdown so it's clear which numbers are exact and which are a best guess.

**Supported formats:** `S5E5-E8`, `S5: E5 - E8`, `S05E05-E08`, `Season 5 Episode 5-8`, `Season 5, Episodes 5-8`, and single-episode notation (`S3E1`, `3x11`) all work — a single episode with no range just gets the normal single-episode treatment.

**If the show name matches multiple shows** (e.g. a same-titled reboot), you'll get a selection menu just like the regular multi-match picker — pick the right one and the range calculation continues from there.

### Check Timer Status

```
/timer status
/timer check
```

Answers the one question people actually ask — how far in are we — in two lines:

```
⏱️ Timer: The Covenant (2006)
Elapsed: 2h 43m 32s    Duration: 1h 47m
```

Elapsed time carries seconds, since that's the number people sync a watch party against.

**Duration only appears when the bot actually knows the runtime** — from a title lookup or a duration you typed. A timer running on the server's auto-stop cap shows elapsed time alone: that cap is a backstop against a timer running forever, not a statement about how long the film is, and showing it would answer "when does this end?" with an unrelated number. A paused timer says so.

**Parameters:**
- `public` (optional) - Show this to everyone in the channel (default: true — set `false` to keep it to yourself)

Status is public by default: a watch party is a shared activity, and whoever asks is usually asking on everyone's behalf. If you'd rather check quietly:
```
/timer status public:false
```

`/timer check` is an alias for `/timer status` and works exactly the same way, including the `public` option.

### Name a Running Timer

```
/timer title title:<title>
```

Names a timer that was started without identifying what's playing — which is what the watch-history entry gets written under when it stops — and sets the timer's duration from the title's runtime.

**Who can use it:**
- **While the timer has no title, anyone can set one.** That's the state worth fixing, and whoever's watching can fix it
- **Once a title is set, only the person who started the timer or a moderator can change it** — overwriting a correct title would quietly corrupt the watch-history entry

It searches like `/movie` and `/tv`: a clear match is used right away, and episode notation works too:
```
/timer title title:The Thing
/timer title title:Tales from the Crypt S6: E4-E7
```

If the title could mean more than one thing ("Fargo" is two films and a show), or what you typed isn't an exact title, you get a picker of movies and shows to choose from, with exact title matches listed first. The first option, **Keep "…" as typed**, names the timer without matching it to anything. Only if TMDB finds nothing at all is the timer named with your text directly, since an approximate label beats an unnamed one. The change is announced in the channel with a **Now Watching** card (art, year, synopsis, and where the timer stands), since it was made on everyone's behalf.

**It sets the duration, counted from when the timer started.** The timer was started when playback was, so the runtime includes the time already run: 20 minutes into a 100-minute film, the duration becomes 1h 50m (the runtime plus the usual 10-minute buffer) with about 90 minutes left. Time spent paused never counts. The duration stays as it was when:
- **It's a show with no episodes given.** One episode's runtime would end a multi-episode party early; include them (`Show S1: E1-E3`) to set one
- **Someone else set the duration.** Anyone can name an unnamed timer, but only the person who started it or a moderator can replace a duration they chose. A timer that only has the server's safety-net duration can be filled in by anyone
- **The timer has already run past the runtime**

Use `/timer adjust` to set a duration by hand.

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

Stops the current timer in the channel and logs it to watch history (see [Watch History](#watch-history)). By default, only the person who started the timer and admins and moderators can stop it. Admins and moderators are members with Administrator, Manage Server, Timeout Members, Kick Members or Ban Members.

Use `/timer pause` for a break. Stopping ends the watch party.

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

Changes the total duration of the active timer (elapsed time is preserved — this sets a new *total*, not an amount to add). Only the person who started the timer, or an admin or moderator. Paused time doesn't count. Used exactly as given by default; only reduced if this server has opted into a [timer ceiling](/commands/configuration#timer-ceiling) (off by default).

### Enable or Disable Auto-Stop

```
/timer autostop autostop:<enable|disable> duration:[required if enabling]
```

- **`autostop:disable`** — removes auto-stop entirely from a running timer, so it never stops on its own. Use this for overnight sessions or marathons where you don't want any cap.
- **`autostop:enable`** — turns auto-stop back on for a timer that doesn't currently have a duration; requires a `duration`.

Only the person who started the timer, or an admin or moderator.

### Timer Durations & the Expiry Warning

**By default, a timer runs for exactly whatever duration you gave it — no cap, no maximum.** A manually-typed `duration:500` or an auto-detected 8-hour concert film runs for its full length; nothing shortens it unless this server has explicitly opted into a [timer ceiling](/commands/configuration#timer-ceiling) (off by default).

The one exception is when **nobody said anything at all** — no `duration` was typed, no label was given (or the label matched nothing), or you chose "Skip" from the title-selection menu. In that specific case, rather than the timer running forever unnoticed, it falls back to a **default 6-hour (360 minute) duration**, so it still auto-stops eventually. This fallback duration is invisible in `/timer status` and the start confirmation — no "Duration" or "Remaining Time" field is shown, since it isn't something you set or the bot determined, just a safety net running quietly in the background. It's server-configurable:

```
/eggshen-config settings max-timer-duration minutes:<1-1440>
/eggshen-config settings max-timer-duration unlimited:true
```

`unlimited:true` disables the fallback entirely — a no-duration timer just runs forever, same as `/timer autostop disable`. See [Configuration](/commands/configuration#max-timer-duration) for details.

**About an hour before one of these fallback-duration timers is due to auto-stop**, the bot posts a warning in the channel, mentioning whoever started it, with an **Extend Timer** button for them or an admin or moderator. Clicking it opens a small form to enter how many additional minutes to add. Once extended, the timer's duration is a real, user-chosen value from that point on — it won't warn again unless it's later extended and re-enters the last-hour window.

This warning **only ever fires for fallback-duration timers.** A timer with a real duration — typed manually, adjusted with `/timer adjust`, or auto-detected from a movie/TV runtime — never gets this warning, no matter how long it runs.

`/timer autostop disable` remains the way to start a timer with **no expiry at all** from the outset.

## Watchlist

The server's queue of what to watch next — the step between deciding on something and actually watching it.

### Adding titles

```
/watchlist add title:<title> note:[why you want to watch it]
```

Searches TMDb for movies and TV shows. If several titles match, pick the right one from the menu. A title already on the list can't be added twice.

**Example:**
```
/watchlist add title:The Thing note:Kurt Russell double feature?
```

### Viewing the list

```
/watchlist list filter:[all|movie|tv] sort:[recent|oldest|votes]
```

Shows who added each title, any note, and how many people have voted for it. Sort by **Most wanted** to see what the server actually wants, or **Longest waiting** to surface things that have been sitting there.

### Voting for what to watch

```
/watchlist want title:<title>
```

Registers that you want to watch something. Run it again on the same title to take your vote back. Votes drive the **Most wanted** sort and the `votes` pick method.

### Picking something to watch

```
/watchlist pick method:[random|votes|oldest] filter:[movie|tv]
```

Chooses one title and shows it with its poster. `random` is the argument-settler; `votes` picks the most wanted; `oldest` picks whatever has waited longest.

### Removing titles

```
/watchlist remove title:<title>
```

Anyone can remove a title they added themselves. Removing someone else's addition requires moderator permissions. Moderators can also empty the list entirely with `/watchlist clear`.

### How the watchlist connects to everything else

- **Watching something removes it.** Logging a title with `/watched add` — or letting a watch party timer log it automatically — drops it from the watchlist. Turn this off with `auto-remove-watched`.
- **Tournament winners can be added automatically.** With `auto-add-champion` enabled, a finished `/bracket` tournament puts its champion straight on the list, tagged with the tournament it won. Off by default, and only applies to movie and TV tournaments (games, board games and books aren't TMDb-backed).

### Watchlist settings

```
/eggshen-config-watch-party watchlist settings
/eggshen-config-watch-party watchlist view
```

| Setting | Default | What it does |
|---------|---------|--------------|
| `max-size` | 100 | Maximum titles allowed on the list (10–500) |
| `mod-only-add` | Off | Restrict adding to moderators |
| `auto-add-champion` | Off | Put tournament winners on the list automatically |
| `auto-remove-watched` | On | Remove a title once it's logged as watched |

## Watch History

The server's record of what it has watched together. See [Watch History](/features/watch-history) for more.

### Logged When the Timer Stops

When a timer stops, by `/timer stop` or on its own, the bot logs it to the server's watch history:

1. **It finds the title.** If the timer's title was matched when it started (or with `/timer title`), that match is used. Otherwise the bot searches TMDB for the title and takes the first movie or show it finds.
2. **It saves the entry:** the title and year, movie or TV, the date, the channel, who stopped the timer, and a note with how long it ran (and the episodes, for a multi-episode party).
3. **It posts the stop card** in the channel: **⏹️ Timer Stopped & Logged**, with the poster, the total time, and who started and stopped it.

A multi-episode party is one entry for the show, with the episodes in its note.

**Nothing is logged when:**
- **The timer has no title.** Name it with `/timer title` before you stop it. Afterwards, the stop card's button asks what you watched
- **The title isn't found on TMDB.** The card says so. Correct the title with the card's button, or log it with `/watched add`
- **The timer was for a board game.** Watch history is for movies and TV. The card says board games aren't logged, and has no button

A stop card that wasn't logged has a **📝 Log to Watch History** button, for the person who started the timer or a member with Administrator, Manage Server or Timeout Members. A card that was logged has none, including one where the save worked and something after it failed.

The button opens a form with a title box, filled in when the card shows a title, and up to 1,000 characters of notes. It saves the first TMDB match, movies before shows. If there's no match, the button stays so you can fix the title and try again. Each card is logged once: a second submit from the same card is turned away. A "Could not find this title on TMDB" card from before 2.75.1 is refused, since a board-game timer's card looked the same; use `/watched add`. For a show, or a title with several matches, `/watched add` is more reliable, since you pick from a list. See [The Log to Watch History Button](/features/watch-history#_5-the-log-to-watch-history-button).

A logged title also comes off the [watchlist](#watchlist), unless an admin has turned that off.

### Log It Yourself

```
/watched add title:<title> notes:[optional] private:[optional]
```

**Options:**
- `title` (required) - The movie or show
- `notes` - A note about the watch party
- `private` - Only you see the confirmation (default: false)

Anyone can log a title. If several titles match, you pick the right one from a list only you see. The confirmation posts in the channel unless you add `private:true`.

**Example:**
```
/watched add title:Big Trouble in Little China notes:Annual tradition
```

### View Watch History

```
/watched history filter:[all|movie|tv] limit:[1-25]
```

**Options:**
- `filter` - `all` (default), `movie` or `tv`
- `limit` - How many entries, 1-25 (default 10)

Shows the most recent entries: the title and year, who logged it, the date, the channel, and any notes.

**Examples:**
```
/watched history
/watched history filter:movie limit:25
/watched history filter:tv limit:5
```

## Watch Party Tips

### Before Starting
1. Announce it ahead with `/announce party` or `/announce schedule`
2. Make sure everyone can get to the movie or show. `/movie` and `/tv` show where it streams
3. Run `/watchparty ready` to see who's back with snacks

### During the Watch Party
1. Start the timer when you press play, so everyone can sync to `/timer status`
2. Use `/timer pause` for a break, not `/timer stop`
3. Avoid spoilers for first-time viewers

### After Watching
1. Check the stop card says it was logged. If it doesn't, use its **📝 Log to Watch History** button or `/watched add`
2. Logging it yourself? Add notes about memorable moments
3. Use `/recommend` or `/watchlist pick` to choose the next one

## Watch History Is the Server's

Watch history is a shared record of what the server watched together. It isn't for personal ratings or private tracking: every entry is visible to everyone, and `/watched history` shows the whole server's list.

For personal tracking, use a service like [Trakt](https://trakt.tv), [Letterboxd](https://letterboxd.com) or [TV Time](https://www.tvtime.com).

## Rate Limiting

Watch party commands share the bot's general rate limit: by default each member can run a given command, such as `/timer`, once every 20 seconds, whatever the subcommand. Admins and moderators aren't limited. Admins can give `/timer` a limit of its own with `/eggshen-config-watch-party rate-limit command command:timer`. See [Rate Limiting](/features/rate-limiting).

## Troubleshooting

### A timer wasn't logged to watch history
- Did it have a title? Name a timer with `/timer title` before stopping it
- Was the title found? The stop card says if it wasn't
- Log it with the stop card's **📝 Log to Watch History** button, or by hand with `/watched add`

### Timer not starting
- There's already a timer in the channel: check with `/timer status`
- Check the bot can send messages and embed links in the channel
- `duration` is in minutes, 1-1440

### Auto-detection didn't pick up the event
- The channel has to be a watch-party channel: `/eggshen-config-watch-party watch-party list`
- The event has to have started, and be in that channel (its voice or stage channel, or the channel in its location)
- Auto-detect may be off: `/eggshen-config-watch-party watch-party auto-detect`

### Can't find the title
- Check it with `/movie` or `/tv` first
- Try the original title, or add the year

---
description: "Keep a server-wide record of the movies, shows and episodes your Discord community watches together during watch parties."
---

# Watch History

A server-wide record of what your community watches together.

## Overview

Watch history is a **server-level** list of the movies and TV shows your community has watched together. Watch-party timers add to it when they stop, and anyone can add to it by hand.

It's a shared record, not personal tracking:
- ✅ Public: everyone in the server can see it
- ✅ One list for the whole server
- ✅ Shows who saved each entry, and the channel for timer entries
- ❌ No ratings or reviews
- ❌ Not a personal diary

## Logging a Watch Party with the Timer

### 1. Start a Timer

```
/timer start movie:The Thing
```

Tell the timer what you're watching with one of:
- `movie`: a movie title
- `tv`: a show, optionally with episodes, like `"Severance S2: E1-E3"`
- `label`: any text; the bot searches movies, shows and board games for it

Other options:
- `duration`: minutes, 1 to 1440, after which the timer stops on its own
- `theme`: `modern` (the default, a colorful countdown) or `classic` (text)

When the bot can tell which title you mean, it uses it straight away. When it can't, it shows a list to pick from. Either way, the timer remembers the exact title, and that's what gets logged at the end. For a movie, the duration is set from the runtime plus a 10-minute buffer; for a show, only when you name the episodes.

In a watch-party channel, a `/timer start` with no title uses the name of the Discord event running there. Admins add those channels with `/eggshen-config-watch-party watch-party add`.

**Examples:**
```
/timer start movie:Jaws
/timer start tv:"Tales from the Crypt S5: E5-E8"
/timer start label:Movie Night duration:120
/timer start
```

See [Watch Party Commands](/commands/watch-party) for every timer option.

### 2. Name It Mid-Party (Optional)

Started the timer without a title, or picked the wrong one?

```
/timer title title:The Thing
```

This tells the timer what's playing, so the right title is logged when it stops. A clear match is used straight away; otherwise you pick from a list, or keep your text as typed. When it can, it also sets the timer's duration from the runtime, counted from when the timer started.

Anyone can name a timer that has no title yet. Changing a title someone already set is for the person who started the timer, or an admin or moderator.

### 3. Stop the Timer

When the watch party ends:

```
/timer stop
```

Stopping the timer logs it to watch history. Use `/timer pause` for breaks instead, so you keep the running total.

Only the person who started the timer, or an admin or moderator, can stop it, unless the server lets anyone stop timers (`/eggshen-config settings timer-control anyone-can-pause-stop:true`).

### 4. Automatic Logging

When a timer with a title stops, whether by `/timer stop` or by running out its duration, the bot logs it:

1. It uses the title the timer remembered from `/timer start` or `/timer title`
2. If the timer only has text it couldn't match, it searches TMDB and takes the first result
3. It saves the entry and posts a confirmation. The confirmation has no button, since there's nothing left to log

A timer for a board game is never logged. Its stop card says "Board games aren't logged to watch history" and has no button.

If saving the entry worked but something after it went wrong (posting the card, say), the card still says it was logged, and has no button: the entry is there once.

**What's saved:**
- The movie or show's title and year from TMDB, and whether it's a movie or TV
- When it was watched
- The channel
- Notes with the timer's total time, like `Watch party timer: 1:52:03`, plus the episodes for a multi-episode party (`• S5 E5-8`)
- Who saved it: whoever stopped the timer, or **Egg Shen Bot** with "(auto-completed)" in the notes when the timer ran out on its own

A multi-episode party is saved as **one** entry for the show, with the episodes in the notes.

### 5. The Log to Watch History Button

A stop card that **wasn't** logged has a **📝 Log to Watch History** button. That's a timer with no title, a movie or show TMDB couldn't find, or a save that failed. A card that says it was logged has no button, and neither does a board game's.

The button opens a form:

- **Title:** filled in with the title on the card, when the card shows one. Change it if it's wrong. For a timer with no title, the box is empty: type what you watched
- **Notes** (optional): up to 1,000 characters

Submitting it searches TMDB for the title and saves the first match, checking movies before shows. The entry has your notes, the timer's channel, and you as the one who saved it. The bot posts **✅ Added to Watch History** in the channel and takes the button off the card.

If TMDB finds nothing, the button stays. Fix the title and press it again.

A card posted before 2.75.1 that says "Could not find this title on TMDB to log automatically" is refused: board-game timers got that same card, so the bot can't tell from it whether the timer was for a board game. Pressing its button says so and takes the button off. If it was a movie or show, add it with `/watched add`.

Each card is logged once. A second form submitted from the same card is turned away, and an older card that still has a button after it was logged replies with what it's already in the history as.

The person who started the timer can use the button, and so can members with Administrator, Manage Server or Timeout Members. Letting anyone stop timers doesn't open it to everyone.

For a show, or a title with several matches, `/watched add` is the safer choice: it lets you pick the right title from a list.

Neither can change an entry that was already logged. Entries can't be edited or removed from Discord.

### The Confirmation

The confirmation is posted publicly in the channel:

```
⏹️ Timer Stopped & Logged 🛑📝

The Thing (1982)

✅ Automatically logged to watch history

Total Time: 1:52:03
Type: Movie
Channel: #movie-night
Started by: MovieFan
Stopped by: MovieFan

Use /watched history to view watch history
```

A timer that ran out on its own posts **⏰ Timer Completed & Logged** instead.

## Adding Entries by Hand

```
/watched add title:<text> notes:<text> private:<true|false>
```

Anyone can add an entry, for a watch party that didn't use a timer or one from before the bot.

**Options:**
- `title` (required): the bot searches **both** movies and TV shows, so there's no type option. If there's more than one match, you pick from a list
- `notes` (optional): anything about the viewing
- `private` (optional): `private:true` shows the confirmation only to you. Public by default

Entries added this way have no channel.

**Example:**
```
/watched add title:Big Trouble in Little China notes:First watch for half the group!
```

## Viewing Watch History

```
/watched history [filter] [limit]
```

Shows the server's most recent entries, newest first, in the channel:
- The last 10 by default; `limit` takes 1 to 25
- `filter:all` (default), `filter:movie` or `filter:tv`
- Each entry's title, year and a 🎬/📺 icon
- Who saved it, the date, and the channel (for timer entries)
- Notes, if there are any

**Examples:**
```
/watched history limit:25
/watched history filter:movie limit:25
```

To find something older than the last 25, narrow it with `filter:movie` or `filter:tv`.

## How It Connects to Other Features

- **The watchlist:** logging a title removes it from the server [watchlist](/commands/watch-party#watchlist). Turn that off with `/eggshen-config-watch-party watchlist settings auto-remove-watched:false`.
- **Recommendations:** `/recommend` suggests what to watch next from this history, and `/recommend source:most-watched` shows what the server keeps coming back to.
- **Statistics:** every entry counts as a **📝 Watched** use in `/stats`. See [Statistics](/features/statistics).

## Who Can Save to History

| How | Who |
|---|---|
| `/watched add` | Anyone |
| Stopping a timer | Whoever can stop it: the person who started it, admins and moderators (or anyone, if the server allows) |
| A timer running out | The bot, on its own |
| The Log to Watch History button | The person who started the timer, and members with Administrator, Manage Server or Timeout Members |

Admins and moderators are members with Administrator, Manage Server, Timeout Members, Kick Members or Ban Members. For the button, Kick Members or Ban Members alone isn't enough.

### Removing Entries

There's no command or button that edits or removes an entry. History is stored per server in `guild_watch_history/<server id>_history.json`, so on a self-hosted bot the person running it can edit that file if an entry has to go.

## Data Tracked

Each entry includes:

| Field | Description | Example |
|-------|-------------|---------|
| **Title** | Movie or show name from TMDB | "The Matrix" |
| **Year** | Release or first-air year | "1999" |
| **TMDB ID** | Its TMDB identifier | 603 |
| **Type** | Movie or TV | "movie" or "tv" |
| **Watched at** | When it was saved | Shown as a date |
| **Notes** | Optional comments | "Great special effects!" |
| **Saved by** | Username and user ID | "MovieFan" |
| **Channel** | Channel ID and name, for timer entries and the button | "movie-night" |

## Use Cases

### Regular Watch Parties

```
1. /timer start movie:The Matrix
2. Watch together
3. /timer stop → logged automatically
```

Check what you've watched before picking the next one:

```
/watched history
```

### TV Shows

Name the episodes when you start, and the whole party is logged as one entry with the episodes in its notes:

```
/timer start tv:"Breaking Bad S1: E1-E3"
```

Adding one by hand? Put the episode in the notes, since entries are saved against the show:

```
/watched add title:Breaking Bad notes:S01E01 - Pilot episode, hooked!
```

## Watch History vs Personal Tracking

Watch history is for the group: what your server watched, together, in public. For your own ratings and diary, use something like [Letterboxd](https://letterboxd.com), [Trakt](https://trakt.tv), [TV Time](https://www.tvtime.com) or [Simkl](https://simkl.com).

## Troubleshooting

### The timer stopped but nothing was logged

- The timer had no title, or its title couldn't be found on TMDB. The stop card says so and has a **📝 Log to Watch History** button: type or correct the title there. Or add it with `/watched add`, which lets you pick from a list.
- The timer was for a board game. Those are never logged.
- Next time, start with `movie:` or `tv:`, or name the timer with `/timer title` before it ends.

### Can't use the Log to Watch History button

Only the person who started the timer, or a member with Administrator, Manage Server or Timeout Members, can. Anyone can use `/watched add` instead.

A card that was logged has no button: it's already in the history. Check with `/watched history`. A board game's card has none either.

On a "Could not find this title on TMDB" card from before 2.75.1, the button refuses (see [the button](#_5-the-log-to-watch-history-button)). Use `/watched add`.

### The wrong title was logged

Entries can't be changed from Discord. Add the right one with `/watched add` and a note explaining the correction. On a self-hosted bot, the operator can delete the wrong entry from `guild_watch_history/<server id>_history.json`. To avoid it, start with `movie:` or `tv:`, or check the title with `/timer title` during the party.

### History isn't showing

- Use `/watched history` with `filter:all` and a larger `limit`
- Check the bot can send embeds in the channel

Have an idea for watch history? Open a request on [GitHub Issues](https://github.com/r3volution11/Egg-Shen-Bot/issues).

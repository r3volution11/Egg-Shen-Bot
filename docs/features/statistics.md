---
description: "Track Egg Shen Bot usage and your Discord community's viewing patterns with built-in per-server statistics."
---

# Statistics

See what your server looks up and logs with the bot.

## Overview

Egg Shen Bot keeps a count of how its lookup and logging commands are used: which movies, shows and episodes people look up, how often `/random`, `/similar` and watch-history logging are used, and who uses the bot most. Statistics are per server and never shared between servers.

There are two commands for viewing them:

| Command | Who can use it | Reply |
|---------|----------------|-------|
| `/stats` | Everyone | Public in the channel |
| `/eggshen-stats` | Admins and moderators | Visible only to you |

## Server Statistics

```
/stats [filter] [type]
```

**Options:**
- `filter`: the time period, `filter:all-time` (default), `filter:month`, `filter:week` or `filter:today`
- `type`: `type:server` (default) or `type:personal`

The server view shows:
- **Total searches:** every tracked command use in the period
- **🎬 Top Movies:** the 10 most looked-up movies
- **📺 Top TV Shows:** the 10 most looked-up shows
- **🎞️ Top Episodes:** the 10 most looked-up episodes
- **🎮 Other Commands:** counts for 🎲 Random, 📝 Watched (watch history logs) and 🔍 Similar
- **👥 Most Active Users:** the top 10 users, each with a breakdown

**Example output:**
```
📊 Movie Night Club Stats - All Time
Total searches: 1247

🎬 Top Movies
1. The Matrix (1999) (23×)
2. Big Trouble in Little China (1986) (19×)

📺 Top TV Shows
1. Breaking Bad (2008) (34×)

🎮 Other Commands
🎲 Random: 45 • 📝 Watched: 38 • 🔍 Similar: 21

👥 Most Active Users
1. MovieFan: 87 (45M/28S/4E/6R/4W)
2. FilmBuff: 64 (30M/20S/14W)

M=Movies S=Shows E=Episodes R=Random W=Watched Si=Similar
```

Sections with nothing to show are left out. Other tracked lookups (games, board games, books, soundtracks, recommendations and the watchlist) count toward the total and each user's total, but don't get a section of their own.

## Personal Statistics

```
/stats type:personal
```

Shows your own activity for the chosen period, with your avatar: total commands used, plus movies, TV shows and episodes searched, random commands, watch history logs and similar searches. It's posted in the channel like the server view.

There's no option to look up another member's personal stats. The server view's **Most Active Users** list is the only place other people's activity appears.

**Example:**
```
/stats type:personal filter:month
```

## Admin Statistics

```
/eggshen-stats [filter]
```

The same server statistics as `/stats`, shown only to you, so you can check activity without posting the numbers in a channel. It's for admins and moderators: members with Administrator, Manage Server, Timeout Members, Kick Members or Ban Members. `filter` takes the same values as `/stats`.

The layout differs a little: the card is titled **Egg Shen Statistics**, counts read "(23 searches)", and the users section is called **👥 Top Users**.

## Time Periods

| Value | Covers |
|-------|--------|
| `all-time` | Everything since stats began (or since the last clear). The default |
| `month` | Since the same date last month |
| `week` | The last 7 days |
| `today` | Since midnight on the bot server's clock |

The dated views are rebuilt from a log of recent activity. It keeps about 35 days, up to the newest 5,000 uses, so `month` is the furthest back a dated filter reaches (a little less on a very busy server). `all-time` uses running totals and isn't affected by that limit.

## Leaderboards

The **👥 Most Active Users** section of `/stats` is the bot's usage leaderboard: the top 10 users by tracked command use, with a breakdown, for whichever `filter` period you pick.

`/leaderboard` is something else: the standings in the games (`/potion`, `/foodfight`, `/doom`, `/rescue` and `/siege`). See [Your Card & the Leaderboard](/commands/games-card#leaderboard).

For tournament standings, see [Tournaments](/guides/tournaments/).

## Configuring Statistics

Admins and moderators control tracking with `/eggshen-config stats`:

```
/eggshen-config stats toggle setting:<setting> enabled:<true|false>
```

**Settings:**
- `setting:enabled`: turn statistics tracking on or off overall
- `setting:trackMovies`: movie lookups
- `setting:trackShows`: TV show lookups
- `setting:trackEpisodes`: episode lookups
- `setting:trackGames`: video game lookups
- `setting:trackBoardGames`: board game lookups
- `setting:trackBooks`: book lookups

Everything is tracked by default. With `enabled` off, nothing is recorded, including random, watched and similar. The other kinds (random, watched, similar, soundtracks and so on) have no switch of their own and follow `enabled`.

**Example:**
```
/eggshen-config stats toggle setting:trackEpisodes enabled:false
```

### Clearing Statistics

```
/eggshen-config stats clear
```

Clears **all** statistics for the server. There's no way to clear just one kind.

⚠️ **This can't be undone.**

## Data Tracked

Each tracked command use records:
- The kind of lookup (movie, TV, episode, random, watched, similar and so on)
- The title and year, when there is one
- The user's ID and username
- A timestamp

The bot also keeps running totals per title and per user. Statistics are stored as one JSON file per server.

**Not tracked:** how long commands take, failures, channels, rate-limit violations, or who attended a watch party. Game scores are kept separately, for `/scoreboard` and `/leaderboard`.

### Where Else It's Used

`/image user:` imagines a member as a character. It uses up to 6 of the movies and shows that member looked up most recently, from these statistics, as motifs. See [AI Image Generation](/commands/ai-images).

## Integration with Watch History

Every entry logged to watch history, whether through `/watched add`, the **Log to Watch History** button or a timer, counts as a **Watched** use. It shows up in the 📝 Watched count, in the **W** column of the user breakdown, and in **Watch History Logs** in personal stats.

A timer stopped by `/timer stop` counts for whoever stopped it. A timer that stopped on its own counts for the bot itself, so **Egg Shen Bot** can appear in Most Active Users.

To see what was actually watched, use `/watched history`. See [Watch History](/features/watch-history).

## Best Practices

### For Admins

1. **Check in regularly.** `/eggshen-stats filter:week` gives you a private weekly look. Use what people keep looking up to plan watch parties.
2. **Share with the community.** Run `/stats filter:month` in a channel to post the month's highlights.
3. **Start fresh** with `/eggshen-config stats clear` after testing the bot, or for a new season.

### For Members

- Check your own activity with `/stats type:personal`
- See what's popular on the server with `/stats`

## Troubleshooting

### Statistics aren't updating

Check:
- Tracking hasn't been turned off with `/eggshen-config stats toggle`
- The kind you expect (movies, shows, episodes…) is still on
- The command actually finished

### The numbers look wrong

- A different `filter` than you expected: the default is `all-time`
- `today` counts from midnight on the bot server's clock, which may not be your timezone
- Statistics were cleared recently

### Can't use `/eggshen-stats`

It's for admins and moderators. Everyone can use `/stats`.

Have an idea for statistics? Open a request on [GitHub Issues](https://github.com/r3volution11/Egg-Shen-Bot/issues).

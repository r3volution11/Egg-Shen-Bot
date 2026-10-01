---
description: "Track Egg Shen Bot usage and your Discord community's viewing patterns with built-in per-server statistics."
---

# Statistics

Track bot usage and community viewing patterns with built-in statistics.

## Overview

Egg Shen Bot keeps a per-server count of how its lookup and logging commands are used: which movies, shows and episodes people look up, how often `/random`, `/similar` and watch-history logging are used, and who uses the bot most. Statistics are per server and never shared between servers.

There are two commands for viewing them:

| Command | Who can use it | Reply |
|---------|----------------|-------|
| `/stats` | Everyone | Public in the channel |
| `/eggshen-stats` | Administrators, Manage Server, or Moderators | Visible only to you |

## Server Statistics

```
/stats [filter] [type]
```

**Options:**
- `filter` - Time period: `filter:all-time` (default), `filter:month`, `filter:week`, or `filter:today`
- `type` - `type:server` (default) or `type:personal`

The server view shows:
- **Total searches** - every tracked command use in the period
- **🎬 Top Movies** - the 10 most looked-up movies
- **📺 Top TV Shows** - the 10 most looked-up shows
- **🎞️ Top Episodes** - the 10 most looked-up episodes
- **🎮 Other Commands** - counts for 🎲 Random, 📝 Watched (watch history logs), and 🔍 Similar
- **👥 Most Active Users** - the top 10 users, each with a breakdown

**Example Output:**
```
📊 Movie Night Club Stats - All Time
Total searches: 1,247

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

Sections with nothing to show are left out. Other tracked lookups (games, board games, books, soundtracks, recommendations, watchlist) count toward the total and each user's total, but don't get a section of their own.

## Personal Statistics

```
/stats type:personal
```

Shows your own activity for the chosen period: total commands used, plus movies, TV shows and episodes searched, random commands, watch history logs, and similar searches.

There is no option to look up another member's personal stats; the server view's **Most Active Users** list is the only place other people's activity appears.

**Example:**
```
/stats type:personal filter:month
```

## Admin Statistics

```
/eggshen-stats [filter]
```

The same server statistics as `/stats`, but restricted to Administrators, users with Manage Server, and Moderators, and shown only to the person who ran it. Use it to check activity without posting the numbers in a channel. `filter` takes the same values as `/stats`.

## Time Periods

| Value | Covers |
|-------|--------|
| `all-time` | Everything since stats began (or since the last clear) — the default |
| `month` | The last month |
| `week` | The last 7 days |
| `today` | Since midnight (bot server's time) |

The dated views are rebuilt from a rolling log of recent activity kept for about 35 days, so `month` is the furthest back a dated filter can reach. `all-time` uses running totals and is not affected by that window.

## Leaderboards

There is no separate leaderboard command. The **👥 Most Active Users** section of `/stats` (or `/eggshen-stats`) is the bot's usage leaderboard: the top 10 users by tracked command use, with a per-category breakdown, for whichever `filter` period you pick.

For tournament standings, see [Tournaments](/guides/tournaments/).

## Configuring Statistics

Administrators control tracking with `/eggshen-config stats`:

```
/eggshen-config stats toggle setting:<setting> enabled:<true|false>
```

**Settings:**
- `setting:enabled` - Turn statistics tracking on or off overall
- `setting:trackMovies` - Track movie lookups
- `setting:trackShows` - Track TV show lookups
- `setting:trackEpisodes` - Track episode lookups
- `setting:trackGames` - Track video game lookups
- `setting:trackBoardGames` - Track board game lookups
- `setting:trackBooks` - Track book lookups

**Example:**
```
/eggshen-config stats toggle setting:trackEpisodes enabled:false
```

### Clearing Statistics

```
/eggshen-config stats clear
```

Clears **all** statistics for the server. There is no per-category reset.

⚠️ **Cannot be undone!**

## Data Tracked

Each tracked command use records:
- The kind of lookup (movie, TV, episode, random, watched, similar, and so on)
- The title and year, when there is one
- The user's ID and username
- A timestamp

Alongside that, the bot keeps running totals per title and per user. Statistics are stored as one JSON file per server.

**Not tracked:** command response times, failures, channels, rate-limit violations, or watch party attendance.

## Integration with Watch History

Every entry logged to watch history, whether through `/watched add` or a timer, counts as a **Watched** use: it shows up in the 📝 Watched count, in the **W** column of the user breakdown, and in **Watch History Logs** in personal stats.

To see what was actually watched, use `/watched history` — see [Watch History](/features/watch-history).

## Best Practices

### For Server Administrators

1. **Check In Regularly**
   - Use `/eggshen-stats filter:week` for a private weekly look
   - Spot which titles your community keeps coming back to
   - Use the data to plan watch parties and events

2. **Share With the Community**
   - Run `/stats filter:month` in a channel to post the month's highlights
   - Celebrate your most active members

3. **Fresh Starts**
   - Use `/eggshen-config stats clear` after testing the bot, or to start a new season

### For Community Members

- Check your own activity with `/stats type:personal`
- See what's popular in the server with `/stats`

## Troubleshooting

### Statistics not updating

**Check:**
- Tracking hasn't been turned off with `/eggshen-config stats toggle`
- The specific category (movies, shows, episodes) is still enabled
- The command completed successfully

### Numbers look wrong

**Common Causes:**
- A different `filter` than you expected — the default is `all-time`
- `today` counts from midnight on the bot server's clock, which may not be your timezone
- Statistics were cleared recently

### Can't use `/eggshen-stats`

It requires Administrator, Manage Server, or Moderator permissions. Everyone can use `/stats`.

## Future Enhancements

Potential future features:

- Real-time statistics dashboard web interface
- Automated weekly/monthly reports
- Statistics export
- Watch party statistics (durations, hosts, channels)
- Historical data comparison

Submit feature requests on [GitHub Issues](https://github.com/r3volution11/Egg-Shen-Bot/issues)!

# Statistics

Track bot usage and community viewing patterns with built-in statistics.

## Overview

Egg Shen Bot tracks various statistics about bot usage and community activity. These statistics help server administrators understand how their community interacts with the bot and what content is popular.

## Available Statistics

### Server Statistics

View overall server statistics:

```
/stats server
```

Shows:
- Total commands executed
- Unique users who have used bot
- Most popular commands
- Total searches performed
- Watch parties hosted
- Watch history entries
- Uptime and performance metrics

**Example Output:**
```
📊 Server Statistics

Commands Used: 1,247
Active Users: 156
Watch Parties: 43
History Entries: 38

Most Used Commands:
1. /movie (487)
2. /tv (356)
3. /timer start (89)
4. /watched list (67)
5. /game (45)
```

### User Statistics

View statistics for a specific user:

```
/stats user [@user]
```

**Parameters:**
- `user` (optional) - User to check stats for (defaults to yourself)

Shows:
- Commands used by that user
- Favorite command types
- Watch parties participated in
- Watch history contributions
- First bot interaction date

**Example:**
```
/stats user @MovieFan

📊 MovieFan's Statistics

Total Commands: 87
Watch Parties Attended: 12
History Entries Saved: 8
Member Since: June 1, 2026

Top Commands:
1. /movie (45)
2. /tv (28)
3. /timer start (14)
```

### Watch Party Statistics

Track watch party activity:

```
/stats watch-parties
```

Shows:
- Total watch parties hosted
- Most active channels for watch parties
- Average party duration
- Most popular content watched
- Most active watch party hosts
- Busiest days/times for watch parties

**Example:**
```
📺 Watch Party Statistics

Total Parties: 43
Average Duration: 2h 15m
Most Active Channel: #movie-night

Top Hosts:
1. @MovieFan (14 parties)
2. @FilmBuff (11 parties)
3. @TVAddict (9 parties)

Most Watched:
1. The Matrix (3 times)
2. Breaking Bad (8 episodes)
3. The Office (12 episodes)
```

### Content Statistics

See what content is most popular:

```
/stats content
```

Shows:
- Most searched movies
- Most searched TV shows
- Most searched games
- Trending searches this week
- Content added to watch history most

**Example:**
```
🎬 Content Statistics

Top Movies:
1. The Matrix (23 searches)
2. Inception (19 searches)
3. Interstellar (17 searches)

Top TV Shows:
1. Breaking Bad (34 searches)
2. The Office (28 searches)
3. Stranger Things (25 searches)

Top Games:
1. The Legend of Zelda (15 searches)
2. God of War (12 searches)
3. Elden Ring (11 searches)
```

### Rate Limit Statistics

View rate limiting effectiveness:

```
/stats rate-limits
```

**Required Permissions:**
- Moderate Members permission
- OR Administrator

Shows:
- Total rate limit violations
- Users with most violations
- Average violations per day
- Auto-bans triggered
- Manual cooldowns applied
- False positive rate (estimated)

**Example:**
```
🛡️ Rate Limit Statistics

Total Violations: 47
Auto-Bans: 3
Manual Cooldowns: 8
Average per Day: 2.3

Top Violators:
1. @SpammyUser (12 violations)
2. @OverUser (8 violations)
3. @ExcitedUser (6 violations)

Status: Rate limiting effective ✅
```

## Statistics Time Ranges

Most statistics commands support time range parameters:

```
/stats server [range]
/stats content [range]
/stats watch-parties [range]
```

**Available Ranges:**
- `today` - Last 24 hours
- `week` - Last 7 days
- `month` - Last 30 days
- `year` - Last 365 days
- `all` - All-time (default)

**Examples:**
```
/stats server week
/stats content month
/stats watch-parties year
```

## Statistics Reset

**Administrator only** - Reset server statistics:

```
/stats reset [type]
```

**Parameters:**
- `type` (optional) - Specific stat type to reset (server, content, watch-parties, rate-limits)

**Without type:** Resets ALL statistics (requires confirmation)

**Warning:** This cannot be undone!

**Use Cases:**
- Fresh start after testing
- Annual statistics reset
- Clearing old data after server restructure

## Data Tracked

### Command Usage

For each command:
- Command name
- User who ran it
- Timestamp
- Channel used in
- Success/failure status
- Response time

### Watch Parties

For each watch party:
- Host user ID
- Start time and duration
- Channel ID
- Attendee count (approximate)
- Content watched
- Whether saved to history

### Search Activity

For each search:
- Search type (movie/tv/game)
- Query terms
- Results found
- Selection made
- User who searched
- Timestamp

### Rate Limiting

For each violation:
- User ID
- Violation type
- Timestamp
- Action taken (cooldown/ban)
- Command attempted

## Privacy Considerations

### What's Public

Viewable by all server members:
- Server-wide statistics
- Watch party statistics
- Content popularity statistics
- Own user statistics

### What's Restricted

Viewable only by moderators:
- Rate limit statistics
- Individual user violations
- Abuse patterns
- Other users' detailed stats

### What's Private

Only administrators can:
- Reset statistics
- Export raw data
- View deleted user stats
- Access full audit logs

## Integration with Other Features

### Watch History

Watch history contributes to statistics:
- Content popularity rankings
- Watch party frequency
- Most active hosts
- Channel activity levels

See [Watch History](/features/watch-history) for details.

### Rate Limiting

Rate limiting data feeds statistics:
- Violation tracking
- Abuse patterns
- System effectiveness
- User behavior analysis

See [Rate Limiting](/features/rate-limiting) for details.

### Moderation

Moderation actions tracked in stats:
- Manual cooldowns applied
- Bans removed
- Whitelist mode usage
- History entries removed

See [Moderation Tools](/features/moderation-tools) for details.

## Statistics Dashboard

View a comprehensive dashboard:

```
/stats dashboard
```

Shows overview of all statistics in one place:
- Server snapshot
- Recent activity
- Trending content
- Watch party calendar
- System health
- Quick links to detailed stats

**Great for:**
- Weekly check-ins
- Moderator reviews
- Community updates
- Server health monitoring

## Leaderboards

View community leaderboards:

```
/leaderboard [type]
```

**Types:**
- `commands` - Most commands used
- `searches` - Most searches performed
- `watch-parties` - Most watch parties hosted
- `contributions` - Most watch history entries saved

**Example:**
```
/leaderboard watch-parties

🏆 Watch Party Hosts Leaderboard

🥇 @MovieFan - 14 parties
🥈 @FilmBuff - 11 parties  
🥉 @TVAddict - 9 parties
4️⃣ @GamerTag - 7 parties
5️⃣ @SeriesFan - 6 parties
```

## Export Statistics

**Administrator only** - Export statistics data:

```
/stats export [format]
```

**Formats:**
- `csv` - Comma-separated values
- `json` - JavaScript Object Notation
- `txt` - Plain text report

**Use Cases:**
- Annual reports
- Backup before reset
- External analysis
- Community newsletters

**Example:**
```
/stats export csv
→ Generates and sends stats.csv file
```

## Statistics API

For advanced users, statistics are available via internal API:

```javascript
// Example API usage (bot developers only)
const stats = require('./utils/statsTracker');

// Get server stats
const serverStats = stats.getServerStats(guildId);

// Track custom event
stats.trackEvent('custom_event', { userId, data });

// Get user stats
const userStats = stats.getUserStats(guildId, userId);
```

See [API Reference](/api/reference) for full documentation.

## Best Practices

### For Server Administrators

1. **Regular Reviews**
   - Check statistics weekly
   - Monitor trending content
   - Track user engagement
   - Identify bot issues early

2. **Community Engagement**
   - Share interesting stats with community
   - Celebrate milestones
   - Run contests based on leaderboards
   - Use data to plan events

3. **Performance Monitoring**
   - Track response times
   - Monitor error rates
   - Check resource usage
   - Optimize based on data

### For Moderators

1. **Abuse Monitoring**
   - Review rate limit stats regularly
   - Check for unusual patterns
   - Identify repeat violators
   - Verify moderation effectiveness

2. **User Support**
   - Help users understand their stats
   - Explain leaderboards
   - Clarify data privacy
   - Address statistics questions

### For Community Members

1. **Track Your Activity**
   - Check your own stats
   - See your ranking
   - Monitor your watch parties
   - View your contributions

2. **Discover Content**
   - Check trending searches
   - See popular movies/shows
   - Find active watch parties
   - Join community activities

## Troubleshooting

### Statistics not updating

**Check:**
- Bot has database access
- Commands completing successfully
- No database errors in logs

**Solution:**
- Wait a few minutes (stats cache)
- Check mod logs for errors
- Restart bot if necessary

### Incorrect numbers

**Common Causes:**
- Statistics cache not refreshed
- Timezone differences
- Date range confusion
- Recent reset

**Solution:**
- Wait for cache refresh (5 minutes)
- Check date range parameter
- Verify timezone settings

### Can't view statistics

**Check:**
- Command permissions
- Bot permissions in channel
- Server configuration

**Solution:**
- Verify you can use bot commands
- Check channel permissions
- Ask administrator for access

### Export not working

**Check:**
- Administrator permission
- File attachment permission
- Data size limits

**Solution:**
- Verify admin role
- Check bot can send files
- Try smaller date range

## Future Enhancements

Potential future features:

- Real-time statistics dashboard web interface
- Automated weekly/monthly reports
- Advanced analytics and visualizations
- Predictive trending analysis
- Integration with external analytics tools
- Custom statistic tracking
- Historical data comparison
- Benchmark against other servers

Submit feature requests on [GitHub Issues](https://github.com/r3volution11/Egg-Shen-Bot/issues)!

# Notifications

Stay updated with new releases, trending content, and watch party reminders.

## Overview

Egg Shen Bot can send automatic notifications to keep your community informed about movies, TV shows, games, and upcoming watch parties.

**Status:** 🚧 This feature is planned but not yet implemented.

## Planned Features

### Release Notifications

Get notified when new content is released:

#### Movie Releases

```
🎬 New Movie Release!

The Matrix Resurrections
Release Date: December 22, 2021
Genre: Sci-Fi, Action

In theaters and on HBO Max now!
```

**Configuration:**
- Set notification channel
- Choose genres to follow
- Set minimum rating threshold
- Frequency (daily/weekly)

#### TV Episode Releases

```
📺 New Episode Tonight!

Stranger Things - S04E09
"The Piggyback"
Airs: July 1, 2022 at 12:00 AM PDT

Don't miss the season finale!
```

**Configuration:**
- Follow specific shows
- Get episode air time reminders
- Customize notification timing
- Spoiler-free summaries

#### Game Releases

```
🎮 New Game Release!

The Legend of Zelda: Tears of the Kingdom
Release Date: May 12, 2023
Platform: Nintendo Switch

Now available!
```

**Configuration:**
- Follow specific platforms
- Set genre preferences
- Minimum rating filters
- Pre-order reminders

### Trending Content

Stay updated on what's popular:

```
🔥 Trending This Week

Movies:
1. Oppenheimer (+15% searches)
2. Barbie (+12% searches)
3. Mission: Impossible (+8% searches)

TV Shows:
1. The Last of Us (New season!)
2. Wednesday (Trending on Netflix)
3. The Mandalorian (Season finale)
```

**Configuration:**
- Frequency (daily/weekly)
- Content types to include
- Trending period (24h/week/month)
- Minimum trending threshold

### Watch Party Reminders

Automated reminders for scheduled watch parties:

```
⏰ Watch Party in 1 Hour!

The Lord of the Rings: The Fellowship of the Ring
Channel: #movie-night
Start Time: 8:00 PM
Duration: 3h

React with 🎬 if you're joining!
```

**Features:**
- Automatic reminders (1 hour, 15 minutes before)
- RSVP tracking with reactions
- Participant list
- Last-minute notifications

### Personal Reminders

Track shows and get notified:

```
📌 Your Show Returns!

Breaking Bad - Final Season
Returns: August 11, 2013
Your Status: S05E08 completed

Ready to watch the finale?
```

**Features:**
- Track show progress
- Get return date notifications
- Sequel/prequel announcements
- Streaming availability changes

## Configuration

### Enable Notifications

```
/eggshen-config notifications true
```

### Set Notification Channel

```
/notifications channel <#channel>
```

Set dedicated channel for automatic notifications.

### Configure Notification Types

```
/notifications configure
```

Opens interactive menu to:
- Enable/disable specific notification types
- Set frequency and timing
- Configure filters and preferences
- Test notification delivery

### Follow Content

```
/notifications follow <type> <title>
```

**Types:**
- `movie` - Follow movie franchise
- `tv` - Follow TV show
- `game` - Follow game series
- `genre` - Follow entire genre

**Examples:**
```
/notifications follow tv Stranger Things
/notifications follow genre Horror
/notifications follow movie Marvel Cinematic Universe
```

### Unfollow Content

```
/notifications unfollow <type> <title>
```

Stop receiving notifications for specific content.

### View Following List

```
/notifications list
```

See all content you're following:
- TV shows being tracked
- Movie franchises
- Game series
- Genres
- Next notification dates

## Notification Settings

### Frequency Options

**Real-time:**
- Immediate notifications as events happen
- Great for active communities
- Can be noisy

**Daily Digest:**
- Once per day summary
- Less intrusive
- Consolidated information

**Weekly Digest:**
- Weekly roundup
- Best for casual communities
- Comprehensive overview

### Quiet Hours

```
/notifications quiet-hours <start> <end>
```

Set hours when notifications are paused:

**Example:**
```
/notifications quiet-hours 11pm 8am
```

Notifications during quiet hours are:
- Queued and sent after quiet hours end
- OR included in next digest (depending on settings)

### Notification Filters

#### Rating Threshold

```
/notifications filter rating <minimum>
```

Only notify for content above rating:

**Example:**
```
/notifications filter rating 7.0
→ Only IMDB 7.0+ or equivalent
```

#### Genre Filters

```
/notifications filter genre <include/exclude> <genres>
```

Include or exclude specific genres:

**Examples:**
```
/notifications filter genre include Sci-Fi Action
/notifications filter genre exclude Horror Gore
```

#### Platform Filters

For games, filter by platform:

```
/notifications filter platform <platforms>
```

**Example:**
```
/notifications filter platform PC PlayStation5
```

## Notification Types Detail

### New Release Notifications

When enabled, receive notifications for:

**Movies:**
- Theatrical releases
- Streaming releases
- Digital/Physical releases
- Extended/Director's cuts

**TV Shows:**
- New episodes
- Season premieres
- Season finales
- Special episodes

**Games:**
- Official releases
- Early access
- DLC/Expansion releases
- Major updates

### Trending Notifications

Algorithmic notifications based on:

**Global Trends:**
- Worldwide search increases
- Social media buzz
- Critic reviews
- Award nominations

**Community Trends:**
- Your server's search patterns
- Watch history analysis
- User recommendations
- Leaderboard changes

**Personalized Trends:**
- Based on your watch history
- Your search patterns
- Similar user preferences
- Genre affinities

### Watch Party Notifications

Automated reminders for:

**Scheduled Parties:**
- Created via `/timer schedule`
- Set time and date
- Automatic countdown
- Attendance tracking

**Recurring Parties:**
- Weekly movie nights
- TV show watch-alongs
- Game night sessions
- Custom recurring events

**Last-Minute Parties:**
- Someone starts a timer
- Notification to @role or #channel
- "Join now" quick links

## Integration with Other Features

### Watch History

Notifications enhance watch history:
- Suggest content based on history
- Avoid re-notifying about watched content
- Highlight sequels to watched movies
- Track show progress automatically

### Statistics

Notifications use statistics:
- Trending content based on server searches
- Popular genres in your community
- Active watch party times
- User engagement patterns

### Rate Limiting

Notifications respect rate limits:
- Per-channel notification limits
- Won't spam notification channels
- Digest mode for high-volume servers
- Quiet hours prevent overload

## Best Practices

### For Server Administrators

1. **Start Simple**
   - Enable release notifications only at first
   - Add trending notifications once comfortable
   - Expand based on community feedback

2. **Dedicated Channel**
   - Create `#releases` or `#bot-notifications`
   - Keep separate from main chat
   - Set appropriate permissions

3. **Set Quiet Hours**
   - Respect your community's timezone
   - Avoid late-night notifications
   - Use digest mode for sleeping hours

4. **Monitor Feedback**
   - Ask community about notification frequency
   - Adjust filters based on preferences
   - Remove unwanted notification types

### For Community Members

1. **Use Following**
   - Follow shows you actually watch
   - Unfollow completed shows
   - Update preferences regularly

2. **Personal Filters**
   - Set rating thresholds you prefer
   - Filter genres you don't enjoy
   - Choose platforms you own

3. **Opt-Out Option**
   - Mute notification channel if overwhelming
   - Ask admin to adjust settings
   - Use quiet hours for your schedule

## Examples

### Movie Community Setup

```
/eggshen-config notifications true
/notifications channel #releases
/notifications configure
→ Enable: Movie releases, Trending movies
→ Frequency: Daily digest
→ Filter: Rating 7.0+, Genres: All

Result: Daily summary of quality movie releases and trends
```

### TV Show Community Setup

```
/notifications channel #episode-alerts
/notifications follow tv The Last of Us
/notifications follow tv Wednesday
/notifications follow tv The Mandalorian
/notifications configure
→ Enable: TV episode releases
→ Frequency: Real-time
→ Reminders: 1 hour before air time

Result: Get alerted when your shows air new episodes
```

### Gaming Community Setup

```
/notifications channel #game-news
/notifications configure
→ Enable: Game releases, Trending games
→ Frequency: Weekly digest
→ Platforms: PC, PlayStation5, Xbox Series X
→ Genres: RPG, Action, Adventure

Result: Weekly roundup of new games for your platforms
```

## Troubleshooting

### Not receiving notifications

**Check:**
- Notifications enabled: `/eggshen-config view`
- Channel set: `/notifications channel`
- Following content: `/notifications list`
- Not in quiet hours

**Solution:**
- Enable notifications in config
- Set notification channel
- Follow some content
- Check quiet hours settings

### Too many notifications

**Solutions:**
- Switch to daily/weekly digest
- Increase rating filter threshold
- Reduce followed content
- Exclude verbose genres
- Set longer quiet hours

### Missing specific notifications

**Check:**
- Content is being followed
- Filters aren't excluding it
- Rating meets threshold
- Genre not excluded

**Solution:**
- Add to following list
- Adjust filters
- Lower rating threshold
- Review genre settings

### Wrong time zone

**Issue:** Notifications at wrong times

**Solution:**
- Bot uses server's timezone
- Set quiet hours for your timezone
- Request admin adjust bot timezone setting

## API Integration

For developers wanting to integrate with notification system:

```javascript
// Example API usage (future)
const notifications = require('./utils/notifications');

// Subscribe to release notifications
notifications.subscribe(guildId, {
  type: 'movie_release',
  filters: { rating: 7.0, genres: ['Sci-Fi'] }
});

// Send custom notification
notifications.send(channelId, {
  title: 'Custom Event',
  description: 'Something happened!',
  type: 'custom'
});
```

See [API Reference](/api/reference) for full documentation.

## Future Enhancements

Planned improvements:

- User-specific notification preferences
- Cross-platform notification support (email, mobile)
- Advanced filtering and recommendation AI
- Integration with streaming service APIs
- Calendar export for watch parties
- Social media integration
- Spoiler protection modes
- Community voting on notifications

Submit feature requests on [GitHub Issues](https://github.com/r3volution11/Egg-Shen-Bot/issues)!

## Status Update

**Current Status:** 🚧 Planned Feature

This feature is on the roadmap but not yet implemented. Check the [Changelog](/changelog) for updates on when it will be available.

Want to help implement this? Check out the [GitHub repository](https://github.com/r3volution11/Egg-Shen-Bot) and contribute!

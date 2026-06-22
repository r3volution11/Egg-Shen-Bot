# Admin Configuration

Administrative commands for configuring and managing Egg Shen Bot in your server.

## Configuration Command

The main configuration command for server administrators.

```
/eggshen-config <group> <subcommand> [parameters]
```

**Required Permissions:**
- Administrator
- OR Manage Server permission

## Configuration Groups

### Settings Group

Basic bot settings and configuration.

#### View Current Configuration

```
/eggshen-config settings view
```

Shows all current server settings.

#### Toggle Services

```
/eggshen-config settings toggle service:<service> enabled:<true/false>
```

**Available Services:**
- `imdb` - IMDb ratings and links
- `letterboxd` - Letterboxd links
- `trakt` - Trakt.tv ratings and links
- `rottenTomatoes` - Rotten Tomatoes scores
- `justWatch` - JustWatch streaming availability

**Example:**
```
/eggshen-config settings toggle service:letterboxd enabled:true
```

#### Set Custom Emojis

```
/eggshen-config settings emoji service:<service> emoji:[custom emoji]
```

**Available Services:**
- `imdb`
- `letterboxd`
- `trakt`
- `rtCritics`
- `justWatch`

**Example:**
```
/eggshen-config settings emoji service:imdb emoji:🎬
```

#### Set Region

```
/eggshen-config settings region code:<country-code>
```

Set the region for streaming availability (2-letter ISO code).

**Example:**
```
/eggshen-config settings region code:US
```

#### Max Search Results

```
/eggshen-config settings max-results count:<number>
```

Set maximum number of search results to display (1-50).

**Example:**
```
/eggshen-config settings max-results count:10
```

---

### Stats Group

Statistics tracking configuration.

#### Toggle Stats Tracking

```
/eggshen-config stats toggle setting:<setting> enabled:<true/false>
```

**Available Settings:**
- `enabled` - All Stats Tracking (master switch)
- `trackMovies` - Track movie searches
- `trackShows` - Track TV show searches
- `trackEpisodes` - Track episode searches

**Example:**
```
/eggshen-config stats toggle setting:enabled enabled:true
```

#### Clear Statistics

```
/eggshen-config stats clear
```

Clears all statistics for the server. Cannot be undone.

---

### Commands Group

Enable or disable specific commands for regular users.

#### Toggle Commands

```
/eggshen-config commands toggle setting:<command> enabled:<true/false>
```

**Available Settings:**
- `enabled` - All Commands (master switch)
- `movie` - Movie search command
- `tv` - TV show search command
- `episode` - Episode search command

**Note:** Admins and moderators can always use commands regardless of these settings.

**Example:**
```
/eggshen-config commands toggle setting:movie enabled:true
```

---

### Notifications Group

Configure bot restart and system notifications.

#### Toggle Restart Announcements

```
/eggshen-config notifications toggle setting:restartAnnouncements enabled:<true/false>
```

When enabled, bot announces when it restarts to configured channels.

**Example:**
```
/eggshen-config notifications toggle setting:restartAnnouncements enabled:false
```

---

### Watch Party Group

Configure channels for watch party auto-detection.

#### Add Watch Party Channel

```
/eggshen-config watch-party add channel:<#channel>
```

Adds a channel where the bot will auto-detect Discord scheduled events for timer labels.

**Example:**
```
/eggshen-config watch-party add channel:#movie-night
```

#### Remove Watch Party Channel

```
/eggshen-config watch-party remove channel:<#channel>
```

Removes a channel from watch party auto-detection.

**Example:**
```
/eggshen-config watch-party remove channel:#movie-night
```

#### List Watch Party Channels

```
/eggshen-config watch-party list
```

Shows all configured watch party channels.

---

### Rate Limit Group

Advanced rate limiting configuration.

#### Toggle Rate Limiting

```
/eggshen-config rate-limit toggle enabled:<true/false>
```

Master switch for rate limiting system.

**Example:**
```
/eggshen-config rate-limit toggle enabled:true
```

#### Global Rate Limits

```
/eggshen-config rate-limit global max-requests:<number> window-seconds:<seconds>
```

Set global rate limits for all users.

**Parameters:**
- `max-requests` - Maximum requests (1-100)
- `window-seconds` - Time window in seconds (1-3600)

**Example:**
```
/eggshen-config rate-limit global max-requests:10 window-seconds:60
```

#### Per-Command Rate Limits

```
/eggshen-config rate-limit command command:<name> max-requests:<number> window-seconds:[seconds]
```

Set custom rate limits for specific commands.

**Available Commands:**
- `movie`
- `tv`
- `episode`
- `episode-list`
- `timer`
- `stats`

**Example:**
```
/eggshen-config rate-limit command command:movie max-requests:5 window-seconds:60
```

Set `max-requests` to 0 to remove custom limit for that command.

#### Moderator Bypass

```
/eggshen-config rate-limit bypass enabled:<true/false>
```

Allow moderators to bypass rate limits.

**Example:**
```
/eggshen-config rate-limit bypass enabled:true
```

#### Clear User Rate Limits

```
/eggshen-config rate-limit clear user:@user
```

Manually clear rate limits for a specific user.

**Example:**
```
/eggshen-config rate-limit clear user:@MovieFan
```

#### View Rate Limit Config

```
/eggshen-config rate-limit view
```

Shows current rate limiting configuration.

#### Guild-Wide Rate Limiting

```
/eggshen-config rate-limit guild-wide enabled:<true/false> max-requests:[number] window-seconds:[seconds]
```

Enable server-wide rate limiting (total commands across all users).

**Parameters:**
- `enabled` - Enable/disable guild-wide limits
- `max-requests` - Maximum total commands (default: 10, range: 1-100)
- `window-seconds` - Time window in seconds (default: 60, range: 10-600)

**Example:**
```
/eggshen-config rate-limit guild-wide enabled:true max-requests:20 window-seconds:60
```

## Other Admin Commands

### View Statistics

```
/eggshen-stats filter:[time-period]
```

View bot usage statistics (admin/moderator only).

**Filters:**
- `all-time` - All time statistics
- `month` - Last 30 days
- `week` - Last 7 days
- `today` - Last 24 hours

**Example:**
```
/eggshen-stats filter:week
```

### Restart Bot

```
/eggshen-restart
```

Restart the bot (admin/moderator only). Use with caution.

### Help Command

```
/eggshen-help
```

Get help with bot commands and features.

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

---

### AI Images Group

Configure AI image generation limits and whitelist. **Cost control is critical!**

#### View AI Image Settings & Stats

```
/eggshen-config ai-images view
```

Shows:
- Current settings (cooldown, limits, toggles)
- Server stats (usage today, cost, remaining quota)
- Your personal stats (usage, cooldown status)

#### Toggle AI Image Rate Limiting

```
/eggshen-config ai-images toggle enabled:<true/false>
```

Enable or disable rate limiting for AI image generation.

⚠️ **Warning:** Disabling allows unlimited generations - costs can increase dramatically!

**Example:**
```
/eggshen-config ai-images toggle enabled:true
```

#### Set User Cooldown

```
/eggshen-config ai-images user-cooldown seconds:<60-3600>
```

Set time between AI image generations per user.

**Default:** 300 seconds (5 minutes)

**Recommended values:**
- `300` (5 min) - Default, balanced
- `600` (10 min) - Stricter, lower costs
- `60` (1 min) - Looser, higher costs

**Example:**
```
/eggshen-config ai-images user-cooldown seconds:300
```

#### Set User Daily Limit

```
/eggshen-config ai-images user-daily-limit limit:<1-100>
```

Maximum AI images per user per day.

**Default:** 10 images/day ($0.40/user/day max)

**Examples:**
- `limit:5` - Very strict ($0.20/user/day max)
- `limit:10` - Default ($0.40/user/day max)
- `limit:25` - Generous ($1.00/user/day max)

Shows estimated monthly cost per user.

**Example:**
```
/eggshen-config ai-images user-daily-limit limit:10
```

#### Set Server Daily Limit

```
/eggshen-config ai-images guild-daily-limit limit:<1-500>
```

Maximum AI images per server per day.

**Default:** 50 images/day ($2/day = $60/month max)

**Examples:**
- `limit:25` - Small server ($0.75/day = $22.50/month max)
- `limit:50` - Default ($2/day = $60/month max)
- `limit:100` - Large server ($4/day = $120/month max)

Shows estimated monthly cost.

**Example:**
```
/eggshen-config ai-images guild-daily-limit limit:50
```

#### Toggle Admin Cooldown Bypass

```
/eggshen-config ai-images admin-bypass enabled:<true/false>
```

Allow admins/moderators to bypass cooldown (they always respect daily limits).

**Default:** Enabled

**Example:**
```
/eggshen-config ai-images admin-bypass enabled:true
```

#### Add User to Unlimited Whitelist

```
/eggshen-config ai-images whitelist-add user:<@user>
```

Grant unlimited AI image generation to a specific user.

**Use cases:**
- Bot contributors helping with costs
- Premium/donor users
- Server boosters
- Testing accounts

Whitelisted users bypass ALL limits (cooldown + daily limits).

**Example:**
```
/eggshen-config ai-images whitelist-add user:@JohnDoe
```

#### Remove User from Whitelist

```
/eggshen-config ai-images whitelist-remove user:<@user>
```

Remove unlimited access - user returns to normal rate limits.

**Example:**
```
/eggshen-config ai-images whitelist-remove user:@JohnDoe
```

#### View Whitelist

```
/eggshen-config ai-images whitelist-list
```

Shows all users with unlimited AI image generation access.

#### Reset User Usage

```
/eggshen-config ai-images reset-user user:<@user>
```

Reset a user's daily usage and cooldown.

**Use cases:**
- User hit limit due to testing
- Reward for event participation
- Resolve technical issues

**Example:**
```
/eggshen-config ai-images reset-user user:@JohnDoe
```

#### Reset Server Usage

```
/eggshen-config ai-images reset-guild
```

Reset the entire server's daily usage (user limits still apply).

**Use cases:**
- Special events
- Server milestones
- Testing periods

**Example:**
```
/eggshen-config ai-images reset-guild
```

**💡 See [AI Image Generation](ai-images.md) for complete documentation on the `/image` and `/bracket image` commands, cost management strategies, and best practices.**

---

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

### View Logs

```
/eggshen-logs stats
/eggshen-logs errors count:[1-50]
/eggshen-logs category:[category] count:[1-50]
```

View bot logs and diagnostics (admin only).

**Subcommands:**
- `stats` - View log file statistics
- `errors` - View recent errors (EMERGENCY to ERROR levels)
- `category` - View logs by category

**Categories:**
- `system` - Bot startup, shutdown, errors
- `command` - Command execution logs
- `button` - Button interaction logs
- `scheduler` - Tournament auto-close events
- `bracket` - Tournament operations
- `api` - External API calls
- `performance` - Slow operation tracking

**Examples:**
```
/eggshen-logs stats
/eggshen-logs errors count:20
/eggshen-logs category:command count:10
```

**💡 See [Logging System](../features/logging.md) for complete documentation on log levels, file formats, rotation, and troubleshooting.**

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

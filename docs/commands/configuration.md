---
description: "Admin commands for configuring Egg Shen Bot per Discord server: settings, stats, command switches, notifications, watch parties, rate limits, AI, moderation, event requests, games, quotes and websites."
---

# Admin Configuration

Every server has its own settings. You change them with eight `/eggshen-config` commands. The settings are split across eight commands because Discord limits how big one command can be.

## Configuration Commands

| Command | What it covers |
|---|---|
| [`/eggshen-config`](#settings-group) | Rating services, emojis, region, search results, timers, [stats tracking](#stats-group), [command switches](#commands-group), [notifications](#notifications-group) |
| [`/eggshen-config-watch-party`](#watch-party-group) | Watch-party channels, auto-detect, episode buffer, starting-soon cards, [watchlist](#watchlist-group), [rate limits](#rate-limit-group) |
| [`/eggshen-config-ai`](#ai-images-group) | AI images, [AI announcement text and AI answers](#ai-text-and-ai-answers) |
| [`/eggshen-config-moderation`](#moderation-group) | Moderation switch, user cooldowns, whitelist mode, auto-ban threshold |
| [`/eggshen-config-events`](#event-requests-group) | The event request form |
| [`/eggshen-config-games`](#games) | Game limits, game channels, happenings, twists, the pace, random sieges, score resets |
| [`/eggshen-config-quotes`](#quotes) | The status quote rotation and quote suggestions |
| [`/eggshen-config-website`](#website-group) | This server's web pages: form address, bot address, theme |

The general shape is:

```
/eggshen-config <group> <subcommand> [options]
```

`/eggshen-config-games`, `/eggshen-config-quotes` and `/eggshen-config-website` have no groups: it's straight to the subcommand.

**Who can use them:** admins and moderators, meaning members with any of these Discord permissions: Administrator, Manage Server, Timeout Members, Kick Members or Ban Members. Most replies are only shown to you.

Settings you never change keep their defaults. A setting added in a later version starts at its default too.

## Configuration Groups

### Settings Group

Basic settings, with `/eggshen-config settings`.

#### View Current Configuration

```
/eggshen-config settings view
```

Shows the rating services, emojis, region, search results, timer settings, stats tracking, all 19 command switches, notifications, watch-party channels and rate limiting.

#### Toggle Services

```
/eggshen-config settings toggle service:<service> enabled:<true|false>
```

Which rating sites appear on `/movie`, `/tv` and `/episode` results. All are on by default.

**Services:** `imdb` (IMDb), `letterboxd` (Letterboxd), `trakt` (Trakt), `rottenTomatoes` (RT Critics), `metacritic` (Metacritic), `justWatch` (the JustWatch link)

**Example:**
```
/eggshen-config settings toggle service:letterboxd enabled:false
```

#### Set Custom Emojis

```
/eggshen-config settings emoji service:<service> emoji:[emoji]
```

An emoji to show before a service's name in ratings. Leave out `emoji` to clear it.

**Services:** `imdb`, `letterboxd`, `trakt`, `rtCritics`, `metacritic`, `justWatch`

**Example:**
```
/eggshen-config settings emoji service:imdb emoji:🎬
```

#### Set Region

```
/eggshen-config settings region code:<country code>
```

The country for where-to-watch information, as a 2-letter code (`US`, `CA`, `GB`, `AU`…). `US` by default. `/random`'s `streaming` filter uses it too.

**Example:**
```
/eggshen-config settings region code:GB
```

#### Max Search Results

```
/eggshen-config settings max-results count:<1-50>
```

How many matches the "which one did you mean" list shows. 20 by default.

**Example:**
```
/eggshen-config settings max-results count:10
```

---

#### Max Timer Duration

```
/eggshen-config settings max-timer-duration minutes:<1-1440> unlimited:<true|false>
```

The **fallback** duration, used only when a timer has no real duration at all: no `duration` was typed, the title matched nothing, or "Skip" was chosen from the title list. A timer with a real duration (typed, adjusted, or from a runtime) always runs its full length. See [Timer Durations & the Expiry Warning](/commands/watch-party#timer-durations-the-expiry-warning).

- `minutes` - The fallback, in minutes. 360 (6 hours) by default
- `unlimited` - `true` lets a timer with no real duration run until someone stops it, instead of using the fallback

Give at least one of the two.

**Examples:**
```
/eggshen-config settings max-timer-duration minutes:480
/eggshen-config settings max-timer-duration unlimited:true
/eggshen-config settings max-timer-duration minutes:360 unlimited:false
```

---

#### Timer Ceiling

```
/eggshen-config settings timer-ceiling minutes:<1-1440> enabled:<true|false>
```

An optional cap on **real** timer durations too: typed, set with `/timer adjust`, or from a runtime. **Off by default**, so a timer can be any length. This is separate from [Max Timer Duration](#max-timer-duration), which only covers timers with no real duration.

- `minutes` - The ceiling. A longer duration is cut to it, and the reply says so
- `enabled` - Turn the ceiling on or off

Give at least one of the two.

**Examples:**
```
/eggshen-config settings timer-ceiling minutes:600 enabled:true
/eggshen-config settings timer-ceiling enabled:false
```

---

#### Timer Control

```
/eggshen-config settings timer-control anyone-can-pause-stop:<true|false>
```

Whether **any** member can pause, resume or stop a timer, instead of only the person who started it and admins and moderators (the default). It doesn't extend to `/timer adjust` or `/timer autostop`, which always need the starter or an admin or moderator.

**Example:**
```
/eggshen-config settings timer-control anyone-can-pause-stop:true
```

---

### Stats Group

What the bot counts for `/stats` and `/eggshen-stats`. See [Statistics](/features/statistics).

#### Toggle Stats Tracking

```
/eggshen-config stats toggle setting:<setting> enabled:<true|false>
```

**Settings:** `enabled` (all tracking), `trackMovies`, `trackShows`, `trackEpisodes`, `trackGames`, `trackBoardGames`, `trackBooks`. All on by default.

**Example:**
```
/eggshen-config stats toggle setting:trackBooks enabled:false
```

#### Clear Statistics

```
/eggshen-config stats clear
```

Erases all of this server's statistics. It can't be undone.

---

### Commands Group

Switch commands off for regular members.

#### Toggle Commands

```
/eggshen-config commands toggle setting:<command> enabled:<true|false>
```

**Settings:**
- `enabled` - All Commands: the master switch. Off turns off every command in this list at once
- Search: `movie`, `tv`, `episode`, `game`, `boardgame`, `book`, `soundtrack`
- `survey`, `bracket` (covers `/bracket` and `/bracket-setup`), `watchlist`, `escape` (Escape Velocity)
- Games: `potion`, `foodfight`, `doom`, `rescue`, `siege`
- Quotes: `quote`, `suggestQuote`

Everything is on by default.

- **Admins and moderators can always use every command,** whatever these say.
- **Commands not on the list can't be switched off here,** such as `/timer`, `/watched`, `/image` or `/stats`. Use Discord's **Server Settings → Integrations** to limit those to certain roles or channels. `/image` has [its own switch](#ai-images-group).
- **`siege` covers members' `attack` and `status`.** Turning it off calls off a siege that's running within a minute, with no rewards or penalties, and no new one can start until it's back on.
- **`/eggshen-help` follows these switches.** A command that's off doesn't appear in a regular member's help.

**Example:**
```
/eggshen-config commands toggle setting:game enabled:false
```

---

### Notifications Group

#### Toggle Restart Announcements

```
/eggshen-config notifications toggle setting:restartAnnouncements enabled:<true|false>
```

**Off by default.** When on, after a restart the bot posts a notice in each channel that had a running timer. Timers are restored either way.

**Example:**
```
/eggshen-config notifications toggle setting:restartAnnouncements enabled:true
```

---

### Watch Party Group

With `/eggshen-config-watch-party watch-party`. See [Watch Party Commands](/commands/watch-party).

#### Add, Remove and List Watch-Party Channels

```
/eggshen-config-watch-party watch-party add channel:<#channel>
/eggshen-config-watch-party watch-party remove channel:<#channel>
/eggshen-config-watch-party watch-party list
```

In a watch-party channel, `/timer start` with no title takes its title from the channel's running Discord scheduled event. Only these channels do that.

**Example:**
```
/eggshen-config-watch-party watch-party add channel:#movie-night
```

#### Watch Party Auto-Detect

```
/eggshen-config-watch-party watch-party auto-detect mode:<ask|full|off>
```

How much `/timer start` does on its own with a watch-party channel's running event.

| Mode | Behavior |
|------|----------|
| **`ask`** *(default)* | Looks the title up. When it's clear (one match, an exact title match, or an episode range it can work out), the duration is set and the timer just starts. When it isn't, you get two buttons: **▶️ Start Now** or **🔎 Look Up Title**. |
| **`full`** | The same, but an unclear title goes straight to the full list of matches. **▶️ Start Timer Without Title Selection** is always first. |
| **`off`** | Scheduled events are ignored. |

A title you type yourself with `label:`, `movie:` or `tv:` always gets the full search, in every mode.

#### Episode Buffer

```
/eggshen-config-watch-party watch-party episode-buffer minutes:<0-30>
```

Extra minutes per episode when a timer covers several episodes (`S5E5-E8`), for ad breaks and pauses. 5 by default, and the total buffer is never less than 10 minutes. TMDB's runtimes are ad-free: use 0 for ad-free services, 8-10 for Tubi or Pluto TV.

**Example:**
```
/eggshen-config-watch-party watch-party episode-buffer minutes:8
```

#### Starting-Soon Cards

```
/eggshen-config-watch-party watch-party starting-soon enabled:<true|false>
```

**On by default.** Ten minutes before every scheduled event starts, the bot posts a short "starting soon" card in the event's channel: its voice channel's chat, or the channel named in its location. Turning this off doesn't affect announcements queued with [`/announce schedule`](/commands/watch-party#scheduled-announcements).

---

### Watchlist Group

```
/eggshen-config-watch-party watchlist settings
/eggshen-config-watch-party watchlist view
```

| Option of `settings` | Default | What it does |
|---|---|---|
| `max-size` | 100 | Most titles allowed on the list (10-500) |
| `mod-only-add` | Off | Only admins and moderators can add |
| `auto-add-champion` | Off | Put a finished tournament's winner on the list (movie and TV tournaments) |
| `auto-remove-watched` | On | Take a title off once it's logged as watched |

**Example:**
```
/eggshen-config-watch-party watchlist settings max-size:200 auto-add-champion:true
```

See [Watchlist](/commands/watch-party#watchlist).

---

### Rate Limit Group

Limits on how often commands can be used, with `/eggshen-config-watch-party rate-limit`. See [Rate Limiting](/features/rate-limiting) for how it works.

**Defaults:**

| Limit | Default |
|---|---|
| Rate limiting | On |
| Each member, each command | 1 use per 20 seconds |
| `/recommend` | 2 uses per 2 minutes |
| `/suggest-quote` | 1 use per minute |
| The whole server | 10 commands per minute |
| Pattern detection | On, flags 3 or more members |
| Admins and moderators | Not limited |

The games (`/potion`, `/foodfight`, `/doom`, `/rescue`, `/siege`) have [limits of their own](/commands/games-settings#limits) instead of the per-command one.

#### Toggle Rate Limiting

```
/eggshen-config-watch-party rate-limit toggle enabled:<true|false>
```

The master switch. Turning it off also turns off moderation's whitelist mode and user cooldowns, which are checked by the same system.

#### Global Rate Limits

```
/eggshen-config-watch-party rate-limit global max-requests:<1-100> window-seconds:<1-3600>
```

How often each member can use each command.

**Example:**
```
/eggshen-config-watch-party rate-limit global max-requests:3 window-seconds:60
```

#### Per-Command Rate Limits

```
/eggshen-config-watch-party rate-limit command command:<name> max-requests:<0-100> window-seconds:[1-3600]
```

A limit for one command, instead of the global one. **Commands:** `movie`, `tv`, `episode`, `episode-list`, `timer`, `stats`. `max-requests:0` removes the command's own limit.

**Example:**
```
/eggshen-config-watch-party rate-limit command command:movie max-requests:5 window-seconds:60
```

#### Moderator Bypass

```
/eggshen-config-watch-party rate-limit bypass enabled:<true|false>
```

**On by default:** admins and moderators aren't rate limited.

#### Guild-Wide Rate Limiting

```
/eggshen-config-watch-party rate-limit guild-wide enabled:<true|false> max-requests:[1-100] window-seconds:[10-600]
```

A cap on commands from everyone together, which stops one person flooding the bot from several accounts. On by default: 10 commands per 60 seconds.

**Example:**
```
/eggshen-config-watch-party rate-limit guild-wide enabled:true max-requests:20 window-seconds:60
```

#### Pattern Detection

```
/eggshen-config-watch-party rate-limit pattern-detection enabled:<true|false> min-users:[2-20]
```

Flags signs of coordinated spam: several members running the same command with the same options within a minute, or a burst of commands from several members within 10 seconds. On by default, flagging 3 or more members. Admins and moderators aren't counted. It records what it sees for `suspicious-activity`; it doesn't block anyone.

#### View, Clear and Review

```
/eggshen-config-watch-party rate-limit view
/eggshen-config-watch-party rate-limit clear user:@user
/eggshen-config-watch-party rate-limit suspicious-activity
/eggshen-config-watch-party rate-limit abuse-log
```

- `view` - The current limits
- `clear` - Clear one member's rate limits, if they're stuck
- `suspicious-activity` - What pattern detection has flagged recently
- `abuse-log` - Rate-limit violations, member by member

---

### AI Images Group

`/image` settings, with `/eggshen-config-ai ai-images`. See [AI Image Generation](/commands/ai-images) for the details.

| Subcommand | What it does | Default |
|---|---|---|
| `view` | Settings, today's usage and cost, and your own usage | |
| `feature-toggle enabled:` | Switch `/image` on or off | On |
| `set-permissions level:` | Who can use it: `everyone`, `moderators` (and admins) or `admins` | Everyone |
| `toggle enabled:` | The image limits below, on or off | On |
| `user-cooldown seconds:` | Wait between images per member, 60-3600 | 300 (5 minutes) |
| `user-daily-limit limit:` | Images per member per day, 1-100 | 10 |
| `guild-daily-limit limit:` | Images for the whole server per day, 1-500 | 50 |
| `admin-bypass enabled:` | Admins skip the cooldown (never the daily limits) | On |
| `whitelist-add user:` / `whitelist-remove user:` / `whitelist-list` | Members with no limits | |
| `reset-user user:` / `reset-guild` | Reset a member's or the server's usage for today | |

⚠️ With the limits off, members can generate as many images as they like, and each one costs the bot's owner money.

**Examples:**
```
/eggshen-config-ai ai-images set-permissions level:moderators
/eggshen-config-ai ai-images guild-daily-limit limit:25
```

---

### AI Text and AI Answers

Two more switches in `/eggshen-config-ai`, separate from images. Both are on by default, and both need the bot to have an OpenAI key.

```
/eggshen-config-ai ai-text feature-toggle enabled:<true|false>
/eggshen-config-ai ai-text view
/eggshen-config-ai ai-ask feature-toggle enabled:<true|false>
/eggshen-config-ai ai-ask view
```

- **`ai-text`**: AI writes the announcement for `/announce party` and `/announce schedule` when you don't give a `message`. Off, those posts use a plain template. Your own `message` is always posted as written
- **`ai-ask`**: AI writes `/eggshen-ask` answers from the docs. Off, `/eggshen-ask` shows the best-matching docs section as written. See [Ask the Bot](/commands/ask)

---

### Moderation Group

Cooldowns for members, whitelist mode and the auto-ban threshold, with `/eggshen-config-moderation moderation`. Moderation is **off by default**; `toggle enabled:true` turns it on. Every subcommand is on [Moderation Commands](/commands/moderation).

---

### Event Requests Group

The web form members use to ask for a watch party, with `/eggshen-config-events event-requests`. Setting up the form itself (the website, Discord login and hosting) is in [Event Requests](/features/event-requests).

::: tip
Members fill in a form on your website. Moderators approve or deny each request in Discord, and an approved request becomes a Discord scheduled event.
:::

| Subcommand | What it does | Default |
|---|---|---|
| `view` | The current settings | |
| `toggle enabled:` | Event requests on or off | Off |
| `moderation-channel channel:` | Where requests go for approval | None |
| `server-name name:` | The server name shown on the form | The server's name |
| `invite-url url:` | A Discord invite shown on the form. Leave `url` out to hide it | None |
| `allow-voice-requests allow:` | Whether members can ask for a voice or stage channel | Yes |
| `announce-decisions enabled:` | Post a new message in the moderation channel on approve or deny | On |
| `announcement-channel where:` | Tell members about approved events (below) | Off |
| `allow-user-channel-selection allow:` | Members pick the channels (Advanced Mode), or moderators do (Simple Mode) | Simple |
| `set-allowed-text-channels channel-ids:` | The text channels members can pick. Comma-separated IDs, or `all` | All |
| `set-allowed-voice-channels channel-ids:` | The voice and stage channels members can pick | All |
| `guidance part:` | The help text on the form (below) | Built in |
| `streaming` | The where-to-watch line on requests (below) | On |
| `get-link` | The form's address and the Guild ID your site needs | |

The website address itself is set with [`/eggshen-config-website url`](#website-group).

**Moderators approve with buttons:** a request that asks for a voice channel gets **Approve Both**, **Text Only**, **Edit** and **Deny**; a text-only one gets **Approve & Create Event**, **Edit** and **Deny**. **Crop Image** appears when there's an image.

#### Simple and Advanced Mode

```
/eggshen-config-events event-requests allow-user-channel-selection allow:false
/eggshen-config-events event-requests allow-user-channel-selection allow:true
```

- **Simple Mode** (`allow:false`, the default): members give the title, description and times. Moderators pick the channels when they approve.
- **Advanced Mode** (`allow:true`): the form shows a Location list and a voice-channel option, limited to the channels you allow:

```
/eggshen-config-events event-requests set-allowed-text-channels channel-ids:1234567890,9876543210
/eggshen-config-events event-requests set-allowed-voice-channels channel-ids:all
```

To copy a channel's ID, turn on Developer Mode in Discord's settings, then right-click the channel → **Copy Channel ID**.

#### Announce Approved Events to Members

```
/eggshen-config-events event-requests announcement-channel where:event
/eggshen-config-events event-requests announcement-channel where:channel channel:#watch-parties
/eggshen-config-events event-requests announcement-channel where:off
```

The moderation channel is usually hidden from members. This posts a separate **📅 New watch party** message where they can see it when a request is approved:

- `where:event` (**The event's own channel**): the text channel the watch party is in
- `where:channel` (**A specific channel**): always the same channel, such as `#announcements`
- `where:off` (**Off**, the default): nothing is posted outside the moderation channel

The post links the event, so Discord shows its card with the **Interested** button, and credits the person who asked without pinging them. The bot needs **Send Messages** in that channel; if the post fails, the event is still created and the moderator who approved it is told why.

#### Form Guidance

```
/eggshen-config-events event-requests guidance part:fields
/eggshen-config-events event-requests guidance part:page
```

The help text on your server's form. Every form starts with defaults: login only checks membership, check the Events tab first, add the year to the title, say where to watch it, schedule within 2 weeks, and you'll be the host. Rewrite any of it, such as "Keep it horror or horror-adjacent." under the title.

Each opens a Discord form, filled in with what the website shows now:

- `part:fields`: the text under **Event Title**, **Description**, **Event Image**, the **start date and time**, and **Frequency**
- `part:page`: the **intro** at the top and the **footer** at the bottom

Empty a box to go back to the default, or type `none` to show nothing there. Lines starting with `•` or `-` become a list, `**bold**` is bold, and `https://` links can be clicked. `/eggshen-config-events event-requests view` lists what you've changed.

#### Where to Watch

```
/eggshen-config-events event-requests streaming
/eggshen-config-events event-requests streaming services:Shudder, AMC+, Tubi, Plex
/eggshen-config-events event-requests streaming services:default
/eggshen-config-events event-requests streaming enabled:false
```

Each request's title is looked up for where it streams. Moderators see a **📺 Where to watch** line on the request, and approving adds it to the event's description, with a link to every other place to watch it:

```
📺 Streaming on Shudder, AMC+ and Tubi (free)
More places to watch: https://www.themoviedb.org/movie/…/watch?locale=US
```

- **Only your services are named,** in the order you list them. The default is Shudder, AMC+, Tubi, Plex, Roku, Prime Video, Hulu, Peacock and Hoopla; `services:default` brings it back.
- **Free services are marked (free).**
- **It never guesses.** The title has to match one movie or show exactly (a year in brackets, like "Fargo (1996)", settles a tie). Otherwise nothing is added and the moderators are told why.
- If a moderator edits the title, approving looks it up again.
- It uses your server's region (US by default). With a Watchmode key, the bot finds more services than TMDB alone.

With no options, `streaming` shows the current setting.

#### Get the Link

```
/eggshen-config-events event-requests get-link
```

Shows your form's address and the Guild ID your website needs: `guildId` in its `scripts/domains.json` entry, or `GUILD_ID` in `public/config.js` for a single site. It only works once event requests are on and the website address is set.

---

### Games

`/eggshen-config-games` has the game settings: play limits and the rescue shield (`limits`), where the games can be played (`channels`), twists, happenings, the [pace](./games-siege#pace) and [random sieges](./games-siege#random-sieges) (`happenings`), and erasing scores (`reset-scores`). They're all on [Settings for Admins](./games-settings), with the details on [happenings and twists](./games-settings#happenings-and-twists).

```
/eggshen-config-games channels mode:only add:#games
/eggshen-config-games happenings frequency:rare
/eggshen-config-games happenings start:fullmoon
/eggshen-config-games happenings pace:quick
/eggshen-config-games happenings siege-frequency:rare
```

To switch a game off, use [`/eggshen-config commands toggle`](#commands-group).

---

### Quotes

The bot's status line shows a rotating movie quote. Members post one with `/quote` and suggest new ones with `/suggest-quote`. `/eggshen-config-quotes` manages the list:

| Subcommand | What it does |
|---|---|
| `add quote:` (`title:`, `author:`) | Add a quote straight to the rotation, with no review |
| `edit index: quote:` (`title:`, `author:`) | Change a quote. Leaving out `title` or `author` clears it |
| `delete index:` | Delete a quote |
| `list` (`page:`) | The quotes, 10 a page, with their index numbers |
| `moderation-channel channel:` | Where `/suggest-quote` suggestions go for review |
| `max-pending-per-user max:` | How many suggestions a member can have waiting, 1-50 (default 3) |
| `admin-link` | A one-time link (10 minutes) to the bot's quotes admin web page, already unlocked |

Suggestions are approved or rejected on that quotes admin page. It, and `admin-link`, only work when the bot's operator has set `QUOTES_ADMIN_SECRET`. Without a moderation channel, suggestions still wait there.

The quote list belongs to the bot, not to one server: a bot that serves several servers shares one rotation between them.

**Example:**
```
/eggshen-config-quotes add quote:It's all in the reflexes. title:Big Trouble in Little China author:Jack Burton
```

---

### Website Group

`/eggshen-config-website` sets how this server's web pages look and where the bot's links point.

| Command | What it does |
|---|---|
| `/eggshen-config-website view` | Shows this server's website URL, bot URL and theme |
| `/eggshen-config-website url url:<address>` | Where this server's event request form is hosted |
| `/eggshen-config-website bot-url url:<address>` | The address used in links the bot posts in this server |
| `/eggshen-config-website theme name:<theme>` | The color theme for this server's pages: `default` or `shudder`, or any theme the bot's operator adds |

#### Bot URL

```
/eggshen-config-website bot-url url:https://dev.yourdomain.com
```

Links the bot posts in this server (the tournament [setup form](./brackets/import), the moderator crop page, the quotes admin page) use this address. Servers without one use the bot's `PUBLIC_BOT_URL`. Run it with no `url` to go back to that.

Set it when one bot serves several servers on different domains, such as a test server and a live one. Each server's links then go to its own site, so testing takes the same path as the live server.

The address has to forward the bot's pages (see the [setup form](./brackets/import) for the reverse-proxy paths). When you set it, the bot checks that it reaches this bot and that the setup form's path is forwarded, and warns you if not.

This is separate from `url`, which is where the event request form lives. If you self-host, that can be a static site that doesn't forward anything to the bot.

---

## Other Admin Commands

### View Statistics

```
/eggshen-stats filter:[all-time|month|week|today]
```

Detailed usage statistics for the server (admins and moderators). See [Statistics](/features/statistics).

**Example:**
```
/eggshen-stats filter:week
```

### View Logs

```
/eggshen-logs stats
/eggshen-logs errors count:[1-50]
/eggshen-logs category category:<category> count:[1-50]
```

The bot's logs. **Administrator permission only.**

- `stats` - Log file sizes and counts
- `errors` - Recent errors (10 by default)
- `category` - Recent entries in one category: `system`, `command`, `button`, `scheduler` or `performance`

**Examples:**
```
/eggshen-logs errors count:20
/eggshen-logs category category:command count:10
```

See [Logging System](/features/logging).

### Restart Bot

```
/eggshen-restart
```

Restarts the bot (admins and moderators). The bot shuts down and relies on PM2, or another process manager, to start it again. Timers, tournaments and sieges carry on after the restart.

### Help Command

```
/eggshen-help
```

The command list, just for you, showing only what's switched on in this server.

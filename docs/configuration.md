---
description: "Set up Egg Shen Bot for your Discord server: who can change settings, which command covers what, and the defaults every server starts with."
---

# Setting Up Your Server

Each Discord server sets up Egg Shen with its own commands. Settings are saved per server, and a server that hasn't changed anything uses the defaults on this page. This page is an overview of the common settings; [Admin Configuration](/commands/configuration) has every subcommand.

## Server Configuration

**Who can change settings:** admins and moderators, meaning anyone with **Administrator**, **Manage Server**, **Timeout Members**, **Kick Members** or **Ban Members**. Everyone sees the `/eggshen-config` commands in Discord's list, but the bot refuses them to anyone else.

`/bracket-setup` and `/escape-setup` are hidden by default from members without **Timeout Members**. You can change who sees them in **Server Settings → Integrations**.

| Command | What it covers |
|---------|----------------|
| `/eggshen-config` | Rating services and their emojis, streaming region, search results, timer limits, statistics, which commands members can use, restart announcements |
| `/eggshen-config-watch-party` | Watch-party channels and timer auto-detect, starting-soon cards, the watchlist, rate limits |
| `/eggshen-config-games` | Game limits, where the games can be played, happenings and twists, sieges and their pace, resetting scores |
| `/eggshen-config-ai` | AI images, AI announcement text, AI answers in `/eggshen-ask` |
| `/eggshen-config-moderation` | Whitelist mode, user cooldowns, the list of repeat rate-limit offenders |
| `/eggshen-config-events` | The [event request form](/features/event-requests) |
| `/eggshen-config-quotes` | The bot's rotating status quotes and `/suggest-quote` |
| `/eggshen-config-website` | This server's web addresses and colour theme |

## Basic Settings

### View Current Configuration

```
/eggshen-config settings view
```

### Toggle Services

Choose which rating and streaming services appear in search results. All are on by default.

```
/eggshen-config settings toggle service:letterboxd enabled:false
```

Services: IMDb, Letterboxd, Trakt, RT Critics (Rotten Tomatoes), Metacritic and JustWatch. IMDb, Rotten Tomatoes and Metacritic scores need the bot's OMDb key, and Trakt scores its Trakt key (see [API Keys](/api-keys)).

### Custom Service Emojis

Show your own emoji beside a service's name:

```
/eggshen-config settings emoji service:imdb emoji:<:imdb:123456789012345678>
```

Leave `emoji` empty to clear it.

### Streaming Region

Where-to-watch results follow one country, US by default. Use an ISO 3166-1 code such as US, CA, GB or AU:

```
/eggshen-config settings region code:GB
```

### Maximum Search Results

How many results appear in a selection menu, from 1 to 25 (the most a Discord menu holds). The default is 20. A server set higher before 2.76.1 shows 25.

```
/eggshen-config settings max-results count:10
```

### Timers

- **`max-timer-duration`**: a timer with no duration, given or detected, stops after 6 hours by default. Change it with `/eggshen-config settings max-timer-duration minutes:240`, or let such timers run until stopped with `unlimited:true`.
- **`timer-ceiling`**: an optional cap on every timer's duration. Off by default.
- **`timer-control`**: by default only the timer's starter, admins and moderators can pause, resume or stop it. `/eggshen-config settings timer-control anyone-can-pause-stop:true` lets anyone.

## Statistics Tracking

Statistics are on by default. Switch them all off, or one kind:

```
/eggshen-config stats toggle setting:enabled enabled:false
```

`setting` is All Stats Tracking, or Movie, TV Show, Episode, Game, Board Game or Book Tracking. `/eggshen-config stats clear` erases the server's statistics; it can't be undone. See [Statistics](/features/statistics).

## Command Permissions

Switch a command off for members:

```
/eggshen-config commands toggle setting:foodfight enabled:false
```

Each of these can be switched off: `movie`, `tv`, `episode`, `game`, `boardgame`, `book`, `survey`, `soundtrack`, `bracket`, `watchlist`, `potion`, `foodfight`, `doom`, `rescue`, `siege`, `magic` (the Six-Demon Bag), `escape`, `quote` and `suggestQuote`. `setting:enabled` is the master switch for all of them, and for `/recommend`. `/random` follows the search switches (`/random book` is off when `book` is). Admins and moderators can always use every command.

## Notifications

```
/eggshen-config notifications toggle setting:restartAnnouncements enabled:true
```

Off by default. When it's on, after a restart the bot posts in each channel with a running timer to say the timer was restored. Everything else the bot posts by itself is on [What the Bot Posts on Its Own](/features/notifications).

## Watch Party Configuration

When someone starts a timer with no title in a watch-party channel, the bot looks for that channel's live Discord event. The event's name becomes the timer's label, and the bot looks the title up to set the duration from its runtime.

```
/eggshen-config-watch-party watch-party add channel:#movie-night
/eggshen-config-watch-party watch-party remove channel:#movie-night
/eggshen-config-watch-party watch-party list
```

The event must have started, and be either a voice or stage event in that channel, or an external event whose location names the channel.

| Setting | Default | Command |
|---------|---------|---------|
| How much the bot does on its own with the event | **Ask**: sets the duration when it's sure of the title, otherwise offers a choice | `/eggshen-config-watch-party watch-party auto-detect mode:ask` (or `full`, `off`) |
| Extra minutes per episode, for ad breaks | 5 | `/eggshen-config-watch-party watch-party episode-buffer minutes:8` |
| A "starting soon" card 10 minutes before each scheduled event | On | `/eggshen-config-watch-party watch-party starting-soon enabled:false` |

### Watchlist

```
/eggshen-config-watch-party watchlist settings max-size:200 mod-only-add:true
```

By default the watchlist holds 100 titles, anyone can add to it, tournament winners aren't added by themselves, and a title is removed once it's logged with `/watched add`. `/eggshen-config-watch-party watchlist view` shows the current settings.

## Games

The games work with no setup. By default each member can play each game once every 20 seconds and 6 times a minute across the games, the first 20 plays of each game a day score points, a rescue shields its target for 60 minutes, and sieges and happenings run at the **week** pace.

```
/eggshen-config-games limits
/eggshen-config-games channels mode:only add:#games
/eggshen-config-games happenings pace:evening
```

`limits` with no options shows the current limits. See [Game Settings](/commands/games-settings) for everything else, including twists, random sieges and resetting scores.

## AI Announcement Text

`/announce` can write your announcement for you, drawing on the title's real plot and streaming availability. It's optional, and enabled by default.

Turning it off doesn't limit `/announce`: supplying your own `message` always posts exactly what you wrote, whatever this is set to. It only controls what happens when you *don't* write one: with AI on, the bot writes it; with AI off, it uses a plain template. This applies to `/announce party` and `/announce schedule`.

### Enable or Disable

```
/eggshen-config-ai ai-text feature-toggle enabled:false
```

### Check the Current State

```
/eggshen-config-ai ai-text view
```

This reports two separate things, because both have to be true for AI text to run:

- **This server**: the setting above, which a server admin controls
- **API key on this bot**: whether whoever runs the bot has set `OPENAI_API_KEY`

If the bot has no key, announcements use the plain template no matter what this is set to. See the [API Keys Guide](/api-keys#openai-api-key).

## AI Answers for /eggshen-ask

[`/eggshen-ask`](/commands/ask) can write its answers with AI, from the docs and the bot's real commands. It has its own switch, separate from announcement text, and is enabled by default. With it off, `/eggshen-ask` shows the best-matching section of the docs as written.

```
/eggshen-config-ai ai-ask feature-toggle enabled:false
/eggshen-config-ai ai-ask view
```

Like announcement text, it also needs the bot to have an OpenAI API key; `view` shows both.

## AI Images

`/image` is on by default for everyone, when the bot has an OpenAI key. Each member can make one image every 5 minutes and 10 a day, and the server 50 a day.

```
/eggshen-config-ai ai-images view
/eggshen-config-ai ai-images set-permissions level:moderators
/eggshen-config-ai ai-images feature-toggle enabled:false
```

Images, announcement text and `/eggshen-ask` answers each have their own switch, so you can use one without the others. See [AI Image Generation](/commands/ai-images) for the limits and the whitelist.

## Rate Limiting

Rate limiting is on by default for a new server:

- each member can use each command once every 20 seconds (`/recommend` twice in 2 minutes, `/suggest-quote` once a minute; the games have [their own limits](#games))
- the whole server can use 10 commands a minute
- pattern detection notes 3 or more members running the same command with the same options within a minute
- admins and moderators aren't limited

```
/eggshen-config-watch-party rate-limit view
/eggshen-config-watch-party rate-limit global max-requests:3 window-seconds:30
/eggshen-config-watch-party rate-limit command command:movie max-requests:5 window-seconds:60
/eggshen-config-watch-party rate-limit clear user:@Sam
```

A server set up before the switch existed has rate limiting off, and keeps it off until an admin turns it on with `/eggshen-config-watch-party rate-limit toggle enabled:true`. `rate-limit view` shows which.

The count is kept per command, not per subcommand: `/timer start` then `/timer status` within 20 seconds is refused. Buttons and menus are never limited. Per-command limits can be set for `movie`, `tv`, `episode`, `episode-list`, `timer` and `stats`; `max-requests:0` removes one. See [Rate Limiting](/features/rate-limiting) for tuning and the server-wide limit.

## Moderation Features

Moderation is off by default. Whitelist mode, user cooldowns and the repeat-offender list work only while it's on:

```
/eggshen-config-moderation moderation toggle enabled:true
```

- **User cooldowns** stop one member using the bot for up to a week: `/eggshen-config-moderation moderation user-cooldown user:@Sam duration:60 reason:Spamming`
- **Whitelist mode** lets only listed roles and members use commands: `whitelist-toggle`, `whitelist-add-role`, `whitelist-add-user`. Like cooldowns, it stops typed and right-click commands only; anyone can still press buttons and use menus on messages already posted
- **Auto-ban list** tracks members who break rate limits too often (20 times in 24 hours by default). Someone over the threshold is warned in their reply and appears in `/eggshen-config-moderation moderation auto-ban-list`. Nobody is banned automatically, and moderators aren't sent a message, so check the list.

See [Moderation Tools](/features/moderation-tools).

## Event Requests, Quotes and Websites

- **Event requests** are off until you turn them on: `/eggshen-config-events event-requests toggle enabled:true`. The form also needs setting up by whoever runs the bot. See [Event Requests](/features/event-requests).
- **Status quotes**: `/eggshen-config-quotes` adds, edits and lists the quotes the bot shows as its status, and sets where `/suggest-quote` suggestions go for review.
- **Websites**: `/eggshen-config-website` sets the addresses the bot uses for this server's web pages and links, and their colour theme.

## Environment Variables

API keys and the bot's own settings live in the `.env` file of whoever runs the bot, not in Discord. They apply to every server that bot is in. Required: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID` and `TMDB_API_KEY`. See [Every .env setting](/api-keys#every-env-setting) for the optional ones, and the [Installation Guide](/installation).

## Troubleshooting

### Commands Not Working

- Check the bot's permissions in that channel. A channel's own settings can override its role.
- Check whether rate limiting is stopping it: `/eggshen-config-watch-party rate-limit view`
- Check the command isn't switched off for members. `/eggshen-config settings view` lists every command switch under Command Permissions; switch one back on with `/eggshen-config commands toggle setting:movie enabled:true` (with that command's setting)
- Check for a cooldown: `/eggshen-config-moderation moderation user-cooldown-list`

### Rate Limiting Too Strict

- See the current limits: `/eggshen-config-watch-party rate-limit view`
- Raise the global or a command's limit
- Help one member right away: `/eggshen-config-watch-party rate-limit clear user:@Sam`

### Timer Auto-Detection Not Working

- Check the channel is listed: `/eggshen-config-watch-party watch-party list`
- Check auto-detect isn't off: `/eggshen-config settings view` shows it under watch parties
- The event must have **started**. A scheduled event that hasn't begun isn't used
- The event must be a voice or stage event in that channel, or an external event whose location names the channel (as a mention, its ID or `#channel-name`)

### Missing Features

- `/game` and `/boardgame` don't appear until the bot has their API keys and its commands are registered again. Other features that need a key say so when used, or show fewer details. See [API Keys](/api-keys).

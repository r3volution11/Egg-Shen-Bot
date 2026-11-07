---
title: Getting Started with Egg Shen Bot
description: Set up Egg Shen Bot in your Discord server and run your first command. What you need, the five setup steps, and where to go next for watch parties, tournaments, trivia and the games.
head:
  - - meta
    - property: og:title
      content: Getting Started with Egg Shen Bot
  - - meta
    - property: og:description
      content: Set up Egg Shen Bot in your Discord server and run your first command. A free, open-source bot for movie and TV communities.
  - - meta
    - property: og:url
      content: https://eggshenbot.com/getting-started.html
  - - meta
    - name: twitter:title
      content: Getting Started with Egg Shen Bot
  - - meta
    - name: twitter:description
      content: Set up Egg Shen Bot in your Discord server and run your first command.
---

# Getting Started

**Egg Shen Bot is a free, open-source Discord bot for movie and TV communities.** It looks up movies, shows, games and books with ratings and where to watch them, runs watch parties with timers, and hosts tournaments, surveys, genre trivia and a set of games with points.

You run your own copy: your own Discord application, your own computer or server, your own API keys. This page gets you from nothing to a working `/movie` command, then points you to everything else.

## Quick FAQ

**Q: What do I need?**  
A: Node.js 20 or newer, a Discord application for the bot, and a free TMDB API key. Every other key is optional.

**Q: How long does setup take?**  
A: About 15 minutes for the basics.

**Q: Is it really free?**  
A: The bot is free and open source, and the required keys are free. Only OpenAI, which powers AI images and AI-written text, costs money, and it's optional.

**Q: Do I need all the API keys?**  
A: No. Discord and TMDB are enough to start. The others add ratings, games, books and AI. You can add them later.

**Q: Where can it run?**  
A: Anywhere that runs Node.js all the time: a VPS, a home server, or a cloud host. Shared web hosting usually can't.

**Q: Do the games need setting up?**  
A: No. `/foodfight`, `/doom`, `/rescue`, `/potion` and `/siege` need no API keys and work as soon as the bot joins. Most servers keep them to one channel with `/eggshen-config-games channels mode:only add:#games`. See [Set up the games](#set-up-the-games).

---

## What You Need

- **Node.js** 20 or newer, with npm
- A **Discord application** for the bot, from the [Discord Developer Portal](https://discord.com/developers/applications): its bot token and application ID
- A **TMDB API key**, free from [TMDB](https://www.themoviedb.org/settings/api)

### Optional keys

| Key | What it adds |
|-----|--------------|
| OMDb | IMDb, Rotten Tomatoes and Metacritic scores |
| Trakt | Trakt scores |
| Watchmode | More where-to-watch services |
| OpenAI (paid) | `/image`, AI-written announcements, AI answers in `/eggshen-ask`, reasons in `/recommend`, better search ranking |
| RAWG | `/game`, and video games in `/random`, `/similar` and tournaments |
| BoardGameGeek | `/boardgame`, and board games in `/random` and `/similar` |
| Google Books | A bigger daily quota for `/book` (it works without one) |
| Spotify | Spotify albums in `/soundtrack`, next to iTunes |

`/soundtrack` uses iTunes, which needs no key. The [API Keys guide](/api-keys) shows how to get each one.

## Set Up in Five Steps

The [Installation guide](/installation) has every detail. In short:

### 1. Create the Discord application and invite the bot

In the [Developer Portal](https://discord.com/developers/applications), create an application. Copy its **Application ID**, then on the **Bot** page click **Reset Token** and copy the token. Invite the bot with the `bot` and `applications.commands` scopes and the permissions listed in [Invite the bot to your server](/installation#_2-invite-the-bot-to-your-server).

### 2. Download and install

```bash
git clone https://github.com/r3volution11/Egg-Shen-Bot.git
cd Egg-Shen-Bot
npm install
```

### 3. Add your keys

```bash
cp .env.example .env
```

Edit `.env` and fill in at least these three:

```bash
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_application_id_here
TMDB_API_KEY=your_tmdb_api_key_here
```

Add any optional keys you have. To try the bot on one server first, also set `GUILD_ID` to that server's ID: its commands then appear at once.

### 4. Register the slash commands

```bash
npm run deploy-commands
```

The bot doesn't register its commands when it starts, so run this once now, and again after an update that changes a command. It ends with `✓ Successfully deployed … commands`.

### 5. Start the bot

```bash
npm start
```

You should see `✓ Logged in as YourBot#1234`. On its first start the bot also uploads the icons for its game and tournament cards to your Discord application. Until they're up, the cards use plain emoji.

To keep it running after you close the terminal, see [Running it on a server](/installation#running-it-on-a-server).

## Your First Commands

In your Discord server, type `/` and try:

```
/movie query:Big Trouble in Little China
/tv query:The X-Files
/eggshen-help
```

`/movie` shows the ratings, where it streams in your region, the runtime and the synopsis. `/eggshen-help` lists every command your server has switched on.

Not sure what a command is called? Ask in plain words:

```
/eggshen-ask question:how do I start a watch party timer?
```

## Quick Configuration

Every server has its own settings, changed by admins and moderators. A few worth doing first:

```
/eggshen-config settings region code:US
/eggshen-config settings toggle service:trakt enabled:false
/eggshen-config-watch-party watch-party add channel:#movie-night
```

- **Region** sets which country's streaming services are shown. It's `US` by default.
- **Services** turns rating sites on or off on results. All are on by default.
- **Watch-party channels** let `/timer start` take its title from the channel's running Discord event.

`/eggshen-config settings view` shows everything. Rate limiting is already on (one use of each command every 20 seconds per member), so there's nothing to set up for spam. See [Admin Configuration](/commands/configuration) for every setting.

## Set Up the Games

The games are ready the moment the bot joins: food fights, horror-movie dooms, rescues and potions with points, a game card and a leaderboard, items, prizes and titles, twists and happenings, and now and then a monster the whole server fights together. They need no API keys. Three things are worth doing on day one:

1. **Pick where they're played.** By default it's every channel. To keep them in one:

   ```
   /eggshen-config-games channels mode:only add:#games
   ```

   Or keep them out of a few with `mode:except`. Happenings and random sieges are announced only where the games can be played.

2. **Pick a pace.** By default a siege is a week-long campaign, with 8 attacks a night each and a report each night, and happenings last about a day. If your server plays in one busy session, `/eggshen-config-games happenings pace:quick` makes sieges 45 minutes and happenings an hour or less. See [Choosing a pace](/commands/games-settings#choosing-a-pace).

3. **Tell everyone about `/how-to-play`.** It shows a short card on each part of the games, with your server's own limits, privately. Then try a play:

   ```
   /how-to-play
   /foodfight throw target:@Sam
   /scoreboard
   ```

To switch a game off, use `/eggshen-config commands toggle setting:siege enabled:false` (or `potion`, `foodfight`, `doom`, `rescue`, `magic`). Everything else is on [Settings for Admins](/commands/games-settings).

## What Else It Does

- **[Watch parties](/commands/watch-party):** `/announce` a watch party ahead of time, or schedule the announcement for a Discord event. `/watchparty ready` asks who's ready, and `/timer` runs the clock and logs what you watched. `/watchlist` keeps the list of what's next.
- **[Tournaments](/commands/brackets/):** bracket and group tournaments for movies, shows, games or books, voted with buttons. Start with the [tournament quick guides](/guides/tournaments/).
- **[Surveys](/commands/social#survey-commands):** polls with up to 10 options, with a runoff if there's a tie.
- **[Escape Velocity](/commands/escape-velocity):** a multi-day genre trivia climb, one launch a day.
- **[The games](/commands/games):** points, cards, items, titles, happenings, sieges and the Six-Demon Bag. Members can start with the [games quick guides](/guides/games/).
- **[Discovery](/commands/):** `/random`, `/recommend` (from what your server watches) and `/similar`.
- **[AI images](/commands/ai-images):** versus posters, tournament matchups and more, with an OpenAI key.
- **[Event requests](/features/event-requests):** a web form where members ask for a watch party and moderators approve it into a Discord event.

The [command reference](/commands/) lists every command and option.

## Troubleshooting

### Commands don't appear

1. Run `npm run deploy-commands`. The bot doesn't register commands by itself
2. Without `GUILD_ID`, new commands can take a while to show up everywhere. Set it for instant registration on a test server
3. If Discord says a command is outdated, reload Discord (Cmd/Ctrl+R)

### The bot doesn't respond

1. Check the bot is running and logged in (`✓ Logged in as …`)
2. Check it can view and send messages in the channel
3. Check `DISCORD_TOKEN` in `.env`

### API errors

- Check your keys are copied correctly, with no spaces
- TMDB is required for movie and TV commands
- Recent errors are in `/eggshen-logs errors` (Administrator only)

### "You're using commands too quickly!"

That's the rate limit. Admins can check it with `/eggshen-config-watch-party rate-limit view`, and clear one member with `/eggshen-config-watch-party rate-limit clear user:@someone`.

## Support

- [Command Reference](/commands/)
- [Admin Configuration](/commands/configuration)
- [GitHub Issues](https://github.com/r3volution11/Egg-Shen-Bot/issues)

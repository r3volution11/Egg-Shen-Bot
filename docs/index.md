---
layout: home
title: Egg Shen Bot - Discord Movie, TV Show, Gaming, and Book Bot
description: Free open-source Discord bot for searching movies, TV shows, video games, board games, and books with ratings from IMDb, Letterboxd, Trakt, and more. Host watch parties with smart timers, keep a server watchlist, run tournaments, collect event requests on a web form, and ask the bot how to do anything.

hero:
  name: "Egg Shen Bot"
  text: "Your Complete Entertainment Search Bot"
  tagline: Search movies, TV shows, games, and books, host watch parties with smart timers, keep a server watchlist, run tournaments, and let your community request events through a web form
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/r3volution11/Egg-Shen-Bot
  image:
    src: /logo.png
    alt: Egg Shen Bot

features:
  - icon: 🎬
    title: Comprehensive Search
    details: Search movies, TV shows, episodes, video games, board games, and books with ratings from IMDb, Letterboxd, Trakt, Rotten Tomatoes, Metacritic, RAWG, BoardGameGeek, and Google Books, plus where to stream it (150+ services, including free ones like Tubi and Pluto TV). Browse a whole TV season at once with /episode-list.

  - icon: ⏱️
    title: Watch Parties
    details: Run /timer start in a channel and the bot reads your scheduled Discord event, finds the title, and sets the runtime for you, multi-episode parties included. Pause for breaks, announce the party ahead of time and when it starts, and keep a history of everything your server has watched.
    link: /commands/watch-party
    linkText: Watch party commands

  - icon: 🏆
    title: Tournament Brackets
    details: Let your server vote its favorite. A straight bracket of 2 to 32 titles, or a groups tournament of up to 48. Set it up with commands or from a spreadsheet, open a whole round or one matchup at a time, and watch live standings as people vote. Ties get their own tiebreaker vote.
    link: /guides/tournaments/
    linkText: Tournament quick guides

  - icon: 🍿
    title: Watchlist & Recommendations
    details: A shared server watchlist where members add titles and vote for what they want to watch next, and the bot picks tonight's movie. /recommend suggests new titles based on what your server has watched, and tournament champions can join the list automatically.
    link: /commands/watch-party#watchlist
    linkText: The watchlist

  - icon: 📅
    title: Event Requests
    details: Members propose watch parties on a web form, logged in with Discord and checked against your server. Moderators approve with one click, which creates the real Discord event, and the bot can announce it where members will see it.
    link: /features/event-requests
    linkText: Event requests guide

  - icon: 🤔
    title: Ask the Bot
    details: Not sure which command does what? Ask in your own words with /eggshen-ask, and get the exact commands to run, answered from this documentation and checked against the bot's real commands.
    link: /commands/ask
    linkText: Ask the Bot

  - icon: 🎨
    title: AI Image Generation
    details: Generate AI images from a prompt, a Discord message, or a head-to-head "versus" poster between two titles (movies, shows, games, board games, even books). Works from tournament matchups too.

  - icon: 🎪
    title: Social & Fun
    details: Polls with up to 10 options and live results, potions with 78+ pop culture references, soundtrack search on iTunes and Spotify, and a rotating status of movie quotes your members can suggest.

  - icon: 🛡️
    title: Moderation
    details: Rate limiting per user and server-wide, detection of coordinated spam, temporary cooldowns, a whitelist mode for emergencies, and a list of repeat offenders for your moderators.

  - icon: ⚙️
    title: Yours to Configure
    details: Per-server settings for rating services, emojis, rate limits, moderation, stats tracking, timers, the watchlist, event requests, AI features, and who can use which commands. Free and open source, so you host your own copy.

---

## Quick Start

Get Egg Shen Bot running in minutes:

```bash
# Clone and install
git clone https://github.com/r3volution11/Egg-Shen-Bot.git
cd Egg-Shen-Bot
npm install

# Configure your bot
cp .env.example .env
# Edit .env with your Discord bot token and API keys

# Deploy commands and start
node src/deploy-commands.js
npm start
```

[View detailed installation guide →](/installation)

## See It In Action

### Search Movies
Type `/movie query:Inception` and get:
- **Ratings**: IMDb 8.8, Letterboxd 4.3, Trakt 90%, RT 87%
- **Where to Watch**: Comprehensive streaming platforms (TMDB + Watchmode) - includes free services like Tubi, Pluto TV, and Freevee
- **Details**: Runtime, release date, genres, cast, overview
- **Links**: IMDb, TMDB, Letterboxd, Trakt, JustWatch

### Search TV Shows
Type `/tv query:Breaking Bad` to see:
- **Ratings** from all major services
- **Episode count**: 5 seasons, 62 episodes
- **Status**: Whether show is ongoing or ended
- **Streaming platforms** in your region

### ⭐ Browse Full Seasons (Unique!)
Type `/episode-list series:Breaking Bad season:3` to get the **entire season at a glance**:
- **All episodes** in one view with titles, ratings, and air dates
- **Find the best episodes** by comparing IMDb and Trakt ratings side-by-side
- **Plan your binge** by seeing which episodes are must-watch vs. skippable
- **No other Discord bot does this!** Perfect for planning watch parties or catching up on shows

### Find Specific Episodes
Type `/episode show:Breaking Bad episode:Pilot` for:
- **Episode-specific** ratings and information
- **Season and episode number**
- **Air date** and runtime
- **Synopsis** without spoilers

### Video Games
Type `/game query:The Last of Us` to discover:
- **Ratings** from Metacritic and RAWG
- **Release date** and platforms
- **Genres** and developer info
- **Similar games** based on your search

### Board Games
Type `/boardgame query:Catan` for:
- **BoardGameGeek rating** and rank
- **Player count** and playtime
- **Age recommendation**
- **Game mechanics** and categories

### Books
Type `/book query:Clive Barker Books of Blood` to find:
- **Ratings** from Google Books readers
- **Author information** and publication dates
- **ISBN numbers** for easy lookup
- **Page count** and categories/genres
- **Preview and purchase links** from Google Books
- **Additional links** to Goodreads and Open Library

### 🏆 Tournament Brackets
Host comprehensive tournaments for your community! **[View Full Tournament Guide →](/commands/brackets/)**

**Example Tournament Flow:**
1. **Create**: `/bracket create name:"Friday Frights" max-titles:8` - a straight bracket (2–32 titles), or 36–48 for a groups tournament
2. **Add Titles**: `/bracket manage-titles action:add type:movie title:"The Thing"` (repeat for each title), or run `/bracket setup-link` to set it all up from a CSV or JSON file on the [setup form](/commands/brackets/import)
3. **Announce**: `/bracket announce` - Publicly announce the tournament with full details
4. **Start**: `/bracket open duration:"24h"` - Builds the bracket and opens round one. A ballot holds 5 matchups, so a bigger round opens in parts with `/bracket open matchups:4`, or one matchup at a time with `matchups:1`
5. **Vote**: Members press **Start Voting** for their own private ballot; live standings update as they vote
6. **Next Rounds**: When voting closes, the winners move on; `/bracket open` again for each round
7. **Champion**: Winner is crowned automatically!

**Tournament Features:**
- **Two Shapes**: Straight bracket (2-32 titles) or groups tournament (4-12 groups of 4, then a knockout)
- **Smart Wildcards**: Automatically calculated based on tournament size
- **Regional System**: Each round split into 4 regions with 1A, 2B labels
- **Three Opening Modes**: Open entire rounds, by region, or individual matchups
- **One Matchup at a Time**: Pace a tournament over days or weeks with `/bracket open matchups:1`
- **Live Standings**: A card under each matchup shows the votes as they come in
- **Automatic Tiebreakers**: Tied votes trigger a short voting round, resolved automatically when it ends
- **Set Up From a Spreadsheet**: Load every title at once from a CSV or JSON file, with templates to start from
- **Any Kind of Title**: Movies, TV shows, video games, board games, or books
- **AI Versus Images**: Generate custom matchup posters with `/image matchup:"..."`
- **Visual Brackets**: Create professional bracket tree images
- **Rides Out Restarts**: Voting carries on through a bot update or restart, nothing lost
- **Quick Guides**: Step-by-step recipes for the most popular setups

**Perfect for community competitions and championship events!**  
[Quick Guides](/guides/tournaments/) • [Setup Guide](/commands/brackets/setup) • [Knockout Guide](/commands/brackets/knockout) • [Command Reference](/commands/brackets/commands) • [Tips & Strategies](/commands/brackets/tips)

### 📅 Event Requests — Let Your Community Propose Watch Parties

Most Discord bots stop at commands typed inside Discord. Egg Shen Bot also ships a **public web form** your community can submit event ideas through — no Discord client required to fill it out, but Discord *is* required to prove they belong. **[Full setup guide →](/features/event-requests)**

**How it works:**
1. **A community member visits your form** at your own domain (e.g. `events.yourserver.com`)
2. **They log in with Discord** — OAuth authentication, no passwords stored
3. **The bot checks they're actually a member of your server** before letting them submit anything — non-members get a friendly error with an invite link instead
4. **They fill out title, description, an optional cover image (with an in-browser crop tool), and a time** — channel assignment can be left to moderators (Simple Mode) or picked by the user from an admin-defined whitelist (Advanced Mode)
5. **The request lands in your moderation channel** with Approve / Edit / Deny buttons
6. **One click approval automatically creates a real Discord Scheduled Event** — cover image, channel, and time all set
7. **Optionally, the bot announces it to your members** in the event's channel or one you choose, with Discord's **Interested** button right there

**Why it's different:**
- **Public-facing, but never open to strangers** — anyone can load the page, but only your server's own members can submit, enforced twice (at login and again at submission)
- **Zero manual event creation** — approving a request *is* creating the Discord event, not a reminder to go create one
- **Built-in image tooling** — upload-and-crop on the submission form, plus a separate moderator-only crop/replace link for fixing images after the fact
- **Rate-limited and self-cleaning** — spam protection on submissions and uploads, with old uploaded images automatically pruned

**Perfect for servers that want event scheduling to feel like a real submission process, not a chat message that gets lost in scroll.**

### 🍿 Server Watchlist & Recommendations

Keep one list of what your server wants to watch, and let the bot help decide. **[Watchlist guide →](/commands/watch-party#watchlist)**

- **Add titles**: `/watchlist add title:The Thing note:Kurt Russell double feature?`
- **Vote for what you want**: `/watchlist want title:The Thing` — the list can sort by votes
- **Let the bot pick**: `/watchlist pick method:votes` (or `random`, or `oldest`)
- **Stays tidy**: a title logged with `/watched` comes off the list, and a tournament champion can go on it automatically
- **Recommendations**: `/recommend` suggests new movies and shows from what your server has watched, its most-watched titles, or popular picks — filtered by genre, decade, or director

### 🤔 Ask the Bot

Not sure how to do something? Ask in your own words:

```
/eggshen-ask question:how do I run a tournament one matchup at a time?
```

The bot answers from this documentation with the exact commands to run, and links the page it came from. Every command in an answer is checked against the bot's real commands before you see it. Answers are private unless you add `public:true`. **[Ask the Bot →](/commands/ask)**

### 🎨 AI Image Generation

Generate AI images without leaving Discord, in whichever of four modes fits the moment:

- **Freeform**: `/image prompt:"a dragon flying over a medieval castle at sunset"`
- **From a message**: `/image message:username` — turns a recent message's text into an image prompt
- **Versus battle**: `/image title1:"The Thing" title2:"Alien"` — a split-screen matchup poster between any two titles (movies, TV, games, board games, or books — mix and match types)
- **Tournament matchup**: `/image matchup:"The Thing vs Alien"` — generate straight from an active bracket matchup

Titles are validated against TMDB, RAWG, BoardGameGeek, and Google Books before generating, so you get a real matchup poster, not a guess. Server admins can restrict access to mods/admins only and set daily generation limits.

### Smart Features

**Random Picker**  
Type `/random movie`, `/random tv`, or `/random book` to get random suggestions. Works with all content types: movies, TV shows, episodes, games, board games, and books. Filter by genre, decade, or minimum rating.

**Find Similar Content**  
Type `/similar` after searching for something to get personalized recommendations based on that content. Works across all media types.

**Watch Party Timers**  
Create a Discord scheduled event for a specific channel, then run `/timer start` in that channel. The bot automatically looks up your server's events, detects the event title linked to that channel, and sets up a timer with the correct runtime from TMDB or BoardGameGeek - no manual typing needed! If the detected title doesn't match anything cleanly, a **Search** button lets you retype it on the spot instead of starting under the wrong name. Multi-episode watch parties (e.g. "Tales from the Crypt S5E5-E8") are recognized automatically, with each episode's runtime summed into the total. Timers can be paused and resumed without losing elapsed time.

**Watch Party Announcements**  
Two announcements, for the two moments that matter. Ahead of time, `/announce party title1:"Hellraiser" time:"8:00 PM EST" message:"Bring your own puzzle box."` posts a card with the start time and where to stream it. Minutes before, `/announce starting message:"Starting in 10 minutes" title:"Hellraiser"` posts the nudge. Both go to the current channel or any channel you name, and `role:` pings the people who want to know — in the message itself, so it actually notifies.

Your own `message` always posts exactly as written. Leave it out and, if your server has AI text enabled, the bot writes it for you from the real plot and streaming availability rather than generic filler — pick a `tone`, or describe your own with `custom-tone`. Turn that off per server with `/eggshen-config-ai ai-text feature-toggle`.

**Movie Quotes**  
The bot's status rotates through movie and TV quotes. Post one in chat with `/quote` (filter by `title` or `author`), and members can suggest new ones with `/suggest-quote` for a moderator to approve.

**Fun Social Interactions**  
Type `/potion give user:@Friend type:health` to send magical potions with fun pop culture references! Choose from 13 potion types - helpful (Health, Mana, Strength, Speed, Love) or harmful (Poison, Weakness, Curse, Slow) - with 78+ unique responses featuring references to LOTR, Harry Potter, Dark Souls, Get Out, The Ring, and more. Admins can add custom responses!

## Features at a Glance

### All Search Commands
- `/movie` - Search movies with comprehensive ratings
- `/tv` - Search TV shows with episode info
- `/episode` - Find specific episodes with ratings
- **`/episode-list` ⭐ - Browse entire seasons at a glance (Unique feature!)**
- `/game` - Search video games (requires RAWG API)
- `/boardgame` - Search board games (requires BGG API)
- `/book` - Search books with Google Books integration
- `/soundtrack` - Search movie/TV soundtracks on iTunes and Spotify
- `/random` - Get random suggestions (movies, shows, episodes, games, board games, books)
- `/similar` - Find similar content recommendations across all media types

### Watch Party Tools
- `/timer start` - Smart timers that auto-detect Discord event titles, movies, TV shows, and board games
- `/timer status` / `/timer check` - Check the active timer in your server
- `/timer pause` / `/timer resume` - Pause and resume without losing elapsed time
- `/timer adjust` / `/timer autostop` - Change duration or toggle auto-stop
- `/timer stop` - End a timer manually
- `/timer remind` - Announce that the timer's about to start, with poster and event details
- `/announce party` - Post an advance watch party announcement, your words or AI's (Admin/Moderator only)
- `/announce starting` - Post the "starting in 10 minutes" nudge (Admin/Moderator only)
- `/watchparty remind` - Announce a scheduled watch party is starting
- `/watched add` / `/watched history` - Log and browse your server's watch history with frequency data
- Auto-stop timers based on content runtime (with 10-minute buffer)

### Watchlist & Recommendations
- `/watchlist add` / `remove` / `list` - Your server's shared watchlist, with notes
- `/watchlist want` - Vote for what you want to watch next
- `/watchlist pick` - Let the bot choose: random, most votes, or longest waiting
- `/recommend` - New movies and shows based on what your server watches

### Tournaments & Social
- `/bracket` - Full tournament system: group stages, knockout brackets, wildcards, tiebreakers
- `/survey create` / `list` / `results` / `close` / `delete` - Polls with up to 10 options, live results, and optional auto-close
- `/potion give` - Give magical potions to users (13 types: helpful & harmful)
- `/potion responses` - Manage custom potion responses (admin/mod only)
- 78+ pop culture references from horror, comedy, fantasy, and games
- `/quote` - Post a movie or TV quote; `/suggest-quote` - suggest one for the bot's status rotation

### AI Image Generation
- `/image` - Freeform prompts, message-based prompts, versus battles, or tournament matchup art
- Rate-limited per user and per server, with admin/mod-only restriction available

### Event Requests
- Public web form with Discord OAuth login, gated to your server's actual membership
- Image upload with in-browser cropping (plus a moderator-only crop/replace tool)
- Approve / Edit / Deny buttons in a Discord moderation channel
- Approved requests automatically become Discord Scheduled Events
- Fully configurable via `/eggshen-config-events event-requests` - [see the full guide →](/features/event-requests)

### Help
- `/eggshen-help` - Every command, by category
- `/eggshen-ask` - Ask how to do something in your own words

### Moderation & Admin
- `/eggshen-config` - Comprehensive per-server configuration
- `/eggshen-stats` / `/stats` - Usage statistics for admins and everyone else
- `/eggshen-logs` - View bot activity logs (Admin only)
- `/eggshen-restart` - Restart the bot (Admin/Moderator only, requires PM2)
- **Rate limiting** with configurable guild-wide limits
- **Pattern detection** for coordinated abuse
- **Temporary cooldowns** and whitelist mode
- **Auto-ban thresholds** that flag repeat offenders for moderators
- **Statistics tracking** for command usage and popular content

## Why Choose Egg Shen Bot?

**Egg Shen Bot is a free, open-source Discord bot** that brings comprehensive entertainment search capabilities to your Discord server. Perfect for movie clubs, gaming communities, and any server that loves discussing entertainment.

### What Makes It Special

✅ **Truly All-in-One** - Movies, TV shows, episodes, video games, board games, and books all in one bot  
✅ **Unique Episode Browser** - `/episode-list` shows entire seasons at once - no other Discord bot does this!  
✅ **Comprehensive Ratings** - IMDb, Letterboxd, Trakt, Rotten Tomatoes, Metacritic, RAWG, BoardGameGeek, Google Books  
✅ **Watch Party Ready** - Built-in timers with auto-detection, pause/resume, multi-episode support, and watch history tracking  
✅ **Decides What's Next** - A shared watchlist with votes, recommendations from your watch history, and tournaments to crown a favorite  
✅ **Goes Beyond Discord** - A public, Discord-gated web form lets your community submit event requests without needing bot commands, and moderators approve them into real Discord Scheduled Events with one click  
✅ **AI-Powered (optional)** - Writes watch party announcement text and versus-battle poster art on demand, and every server can turn it off  
✅ **Smart & Helpful** - Auto-detects titles from Discord events, provides streaming availability, and answers "how do I…" questions with `/eggshen-ask`  
✅ **Respects Your Server** - Advanced rate limiting and moderation tools included  
✅ **Fully Customizable** - Per-server configuration for services, permissions, timers, event requests, and features  
✅ **Open Source & Free** - Self-host, modify, and use however you want

### Perfect For

- **Movie Night Servers** - Search films, keep a watchlist and vote on what's next, coordinate watch parties with timers, track viewing history, let members request event nights through the web form
- **TV Show Communities** - Browse entire seasons with `/episode-list`, find best episodes, get ratings, discover similar shows
- **Gaming Servers** - Look up video games and board games with comprehensive ratings
- **Book Clubs** - Search books by title or author, find similar reads, get ISBNs and ratings
- **Review & Discussion Groups** - Share ratings from multiple sources in one place, run tournament brackets to crown community favorites
- **Larger Communities** - Offload event scheduling to a public form with moderator approval instead of manual coordination in chat
- **Entertainment Hubs** - One bot for all your media lookup needs

## Getting Help

- 📖 [Read the Documentation](/getting-started)
- 🐛 [Report Issues](https://github.com/r3volution11/Egg-Shen-Bot/issues)
- 💻 [View Source on GitHub](https://github.com/r3volution11/Egg-Shen-Bot)

Built with ❤️ for Discord communities that love entertainment

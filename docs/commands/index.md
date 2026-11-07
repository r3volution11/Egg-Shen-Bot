---
title: Commands Reference - Egg Shen Bot
description: Every Egg Shen Bot command with its options. Search movies, TV, games and books, run watch parties, tournaments, surveys, trivia and the games, and configure your server.
head:
  - - meta
    - property: og:title
      content: Commands Reference - Egg Shen Bot
  - - meta
    - property: og:description
      content: Every Egg Shen Bot command with its options, for searches, watch parties, tournaments, surveys, trivia, games and server settings.
  - - meta
    - property: og:url
      content: https://eggshenbot.com/commands/
  - - meta
    - name: twitter:title
      content: Commands Reference - Egg Shen Bot
  - - meta
    - name: twitter:description
      content: Every Egg Shen Bot command with its options, for searches, watch parties, tournaments, surveys, trivia, games and server settings.
---

# Commands Overview

Every Egg Shen command is a slash command. Type `/` in Discord and pick one; Discord shows each option as you go. This page lists every command and its options. Follow the links for the full details.

Options in `code` are the ones you type, such as `query:`. Anything not marked required is optional.

## Quick FAQ

**Q: Why don't I see all the commands?**  
A: There are three usual reasons. `/game` and `/boardgame` are only registered when the bot has a RAWG key and a BoardGameGeek client ID. `/bracket-setup`, `/escape-setup` and `/eggshen-logs` are hidden from members without the right Discord permissions. And after an update, Discord can show an old list until you reload it (Cmd/Ctrl+R).

**Q: How do I use slash commands?**  
A: Type `/` and start typing the command's name. Discord lists the matches, then each option in turn.

**Q: Can I restrict who uses certain commands?**  
A: Yes. `/eggshen-config commands toggle` switches a command off for regular members, and Discord's own **Server Settings → Integrations** page can limit a command to certain roles or channels. See [Admin Configuration](./configuration#commands-group).

**Q: Do commands work in DMs?**  
A: Use the bot in a server. Watch parties, games, tournaments, statistics and settings all belong to a server.

**Q: What happens if a movie or show isn't found?**  
A: The bot says nothing matched. Try another spelling, add the year, or check that it's on [TMDB](https://www.themoviedb.org).

**Q: Where do I start with the games?**  
A: Run `/how-to-play` for a short card on each topic, with your server's own limits. Admins can keep the games to one channel with `/eggshen-config-games channels mode:only add:#games`. Every rule is in [Games & Scores](./games).

**Q: Not sure which command you need?**  
A: Ask in plain words: `/eggshen-ask question:how do I pause the timer?` See [Ask the Bot](./ask).

---

## Search Commands

Search results post in the channel. Add `private:true` to keep one to yourself. If several titles match, you pick from a private list first. See [Search Commands](./search).

### `/movie`
A movie's ratings, where to stream it, runtime, genres and synopsis.

**Options:**
- `query` (required) - The movie's title
- `private` - Only you see the result (default: false)

**Shows:** IMDb, Letterboxd, Trakt, Rotten Tomatoes (critics) and Metacritic ratings, a JustWatch link, and where it streams, rents, sells or plays free in your server's region. Admins choose which services show with `/eggshen-config settings toggle`.

```
/movie query:The Thing
```

[Learn more →](/commands/search#movie-search)

---

### `/tv`
A TV show's ratings, where to stream it, status, number of seasons and genres.

**Options:**
- `query` (required) - The show's title
- `private` - Only you see the result (default: false)

For a single episode, use `/episode`.

```
/tv query:Stranger Things
```

[Learn more →](/commands/search#tv-show-search)

---

### `/episode`
One episode, by title or number, with its ratings, air date, runtime and synopsis.

**Options:**
- `show` (required) - The show's name
- `episode` (required) - The episode's title (`Sandkings`) or number (`s3e11`, `3x11`)
- `private` - Only you see the result (default: false)

```
/episode show:The Outer Limits episode:Sandkings
/episode show:The Last of Us episode:s1e1
```

[Learn more →](/commands/search#episode-search)

---

### `/episode-list`
Every episode in a season, with air dates, ratings and IMDb links. Up to 25 episodes; for a longer season, look episodes up one at a time with `/episode`.

**Options:**
- `series` (required) - The show's name
- `season` (required) - The season number
- `private` - Only you see the result (default: false)

```
/episode-list series:Breaking Bad season:5
```

[Learn more →](/commands/search#episode-list)

---

### `/game`
A video game from RAWG: Metacritic and RAWG ratings, platforms, genres, release date, developers and publishers. Needs a RAWG API key.

**Options:**
- `query` (required) - The game's title
- `private` - Only you see the result (default: false)

```
/game query:Resident Evil 4
```

[Learn more →](/commands/search#game-search)

---

### `/boardgame`
A board game from BoardGameGeek: rating, rank, players, playing time, complexity, categories and mechanics. Needs a BoardGameGeek client ID.

**Options:**
- `query` (required) - The board game's title
- `private` - Only you see the result (default: false)

```
/boardgame query:Betrayal at House on the Hill
```

[Learn more →](/commands/search#board-game-search)

---

### `/book`
A book from Google Books: authors, rating, publisher, pages, ISBNs, and links to Google Books, Goodreads and Open Library.

**Options:**
- `query` (required) - The book's title or author
- `private` - Only you see the result (default: false)

```
/book query:Clive Barker Books of Blood
```

[Learn more →](/commands/search#book-search)

---

### `/soundtrack`
A movie's or show's soundtrack album, from iTunes, plus Spotify when the bot has a Spotify key.

**Options:**
- `query` (required) - The movie or show's title
- `private` - Only you see the result (default: false)

You pick the title first, then the bot finds its soundtrack, with artwork, artist, track count, release date and links.

```
/soundtrack query:Halloween
```

---

## Watch Party Commands

### `/timer`
A timer for the channel's watch party. One timer per channel, and it survives a bot restart. See [Watch Party Commands](/commands/watch-party#timer-commands).

**Subcommands:**
- `start` - Start a timer in this channel. Options:
  - `label` - What you're watching. The bot looks it up for a runtime
  - `movie` / `tv` - Look up a movie, or a show (with episodes such as `S5E5-E8`), instead of `label`. Use only one of the three
  - `duration` - Minutes, 1-1440. Without one, the bot uses the title's runtime plus 10 minutes, or the server's fallback (6 hours by default)
  - `theme` - `modern` (default) or `classic` countdown
- `pause` / `resume` - Pause for a break and carry on. Paused time never counts
- `stop` - End the watch party and log it to watch history
- `status` (or `check`) - How far in you are. `public` (default: true; `public:false` shows only you)
- `title` - Name what's playing and set the duration from its runtime. `title` (required)
- `adjust` - Set a new total duration. `duration` (required, 1-1440)
- `autostop` - `autostop:enable` with a `duration`, or `autostop:disable` so it never stops on its own
- `remind` - Announce that the timer is about to start, with the title's art. `message`, `role`

**Who can do what:** the person who started the timer, and admins and moderators, can pause, resume, stop, adjust and change auto-stop. A server can let anyone pause, resume and stop with `/eggshen-config settings timer-control`. Anyone can name a timer that has no title yet.

```
/timer start movie:The Thing
/timer start tv:Tales from the Crypt S5E5-E8
/timer pause
/timer status public:false
/timer stop
```

[Learn more →](/commands/watch-party#timer-commands)

---

### `/watchparty`
Get everyone ready before you press play.

**Subcommands:**
- `remind` - The same announcement as `/timer remind`. `message`, `role`
- `ready` - Post a ready check with **✅ Ready** and **⏳ Need a minute** buttons, and tally the answers. `message`, `role`
- `ready-close` - Stop taking answers. The person who posted the check, or a moderator

```
/watchparty ready message:Starting in 5! role:@Movie Night
```

[Learn more →](/commands/watch-party#ready-check)

---

### `/announce`
Announce a watch party (admins and moderators).

**Subcommands:**
- `party` - The advance notice. `title1` and `time` (required); `message` (your own text, posted exactly as written), `channel`, `role`, `episodes1`, `title2`, `episodes2`, `host`, `tone` (Funny, Scary, Dramatic, Wholesome, Mysterious), `custom-tone`. Without `message`, AI writes the text if the server allows it
- `starting` - The final nudge. `message` (required), `title`, `channel`, `role`
- `schedule` - Post the full card automatically before a scheduled event. `event` (required, pick from the list), `hours` (required, 0-336), `minutes` (0-59), `channel`, `role`, `message`, `title1`, `episodes1`, `title2`, `host`
- `scheduled` - See what's waiting to post, with a **Cancel** button for each

Every scheduled event also gets a "starting soon" card in its own channel 10 minutes before it starts, unless an admin turns that off.

```
/announce party title1:Hellraiser time:8:00 PM EST role:@Movie Night tone:Scary
/announce starting message:Starting in 10 minutes title:Hellraiser
/announce schedule event:Night of the Living Dead hours:2 channel:#announcements
```

[Learn more →](/commands/watch-party#announcements)

---

### `/watched`
The server's watch history.

**Subcommands:**
- `add` - Log something you watched. `title` (required), `notes`, `private` (default: false)
- `history` - What the server has watched. `filter` (`all`, `movie`, `tv`), `limit` (1-25, default 10)

A timer that knows its title logs itself when it stops.

```
/watched add title:Big Trouble in Little China notes:Annual tradition
/watched history filter:movie limit:20
```

[Learn more →](/commands/watch-party#watch-history)

---

### `/watchlist`
The server's list of what to watch next.

**Subcommands:**
- `add` - Add a movie or show. `title` (required), `note`
- `remove` - Remove a title. `title` (required, pick from the list). Your own, or anyone's if you're a moderator
- `list` - Show the list. `filter` (`all`, `movie`, `tv`), `sort` (`recent`, `oldest`, `votes`)
- `pick` - Pick something to watch. `method` (`random`, `votes`, `oldest`), `filter` (`movie`, `tv`)
- `want` - Vote for a title, or take your vote back. `title` (required, pick from the list)
- `clear` - Empty the list (admins and moderators)

```
/watchlist add title:The Thing note:Kurt Russell double feature?
/watchlist pick method:votes
```

[Learn more →](/commands/watch-party#watchlist)

---

## Discovery Commands

### `/random`
Something random to watch, play or read.

**Subcommands:**
- `movie` - `genre`, `decade` (1950s-2020s), `min-rating` (0-10), `streaming`
- `tv` - `genre`, `decade`, `min-rating` (0-10), `streaming`
- `episode` - A random episode of a show. `show` (required)
- `game` - `genre`, `platform`, `min-rating` (1-5)
- `boardgame` - `category`, `min-rating` (1-10)
- `book` - `subject`, `decade` (1970s-2020s), `min-rating` (1-5)

**Streaming filter:** `streaming` (movie and tv) only picks titles on the services you name, in the server's streaming region (`/eggshen-config settings region`). Separate several with commas: `Shudder, Tubi TV` means on *either*. Start typing to see the services available. A service includes its Amazon, Apple TV and Roku channel versions, so `Shudder` also finds what's on Shudder through Prime Video.

```
/random movie genre:Horror min-rating:7
/random movie genre:Horror streaming:Shudder, Tubi TV
/random book subject:Horror decade:1980s
```

---

### `/recommend`
What to watch next, based on what this server has watched.

**Every option is optional.** A bare `/recommend` works.

| Option | What it does |
|--------|--------------|
| `type` | Movies or TV shows (default: both) |
| `source` | Where picks come from (default: your watch history) |
| `genre` | Start typing to pick from TMDB's genres |
| `decade` | 1950s through 2020s |
| `director` | Start typing to pick a director or cast member |
| `private` | Only you see the result |

**Sources:**
- **Watch History** *(default)*: titles like the ones the server watches most, minus anything already seen
- **Most Watched**: what this server rewatches. Until something has been watched twice, it shows recent watches instead and says so
- **Discover**: browse TMDB by your filters. The default on a server with no watch history yet

```
/recommend
/recommend type:tv genre:Comedy
/recommend source:most-watched type:movie
/recommend director:John Carpenter decade:1980s
```

Results link to IMDb, and to Letterboxd for movies. When the bot has an OpenAI key, each pick has a one-line reason that names titles the server watched. Without it, picks are ranked by popularity and similarity. The footer says which.

::: tip Genres differ between movies and TV
TMDB has no Horror or Romance category for television, so those don't appear with `type:tv`. The list only offers genres that can return results.
:::

---

### `/similar`
Titles like one you name.

**Options:**
- `title` (required) - The title
- `type` - `movie`, `tv`, `game`, `boardgame` or `book`. Without it, every type is searched

```
/similar title:The Thing type:movie
/similar title:Dracula type:book
```

---

## Tournaments, Surveys and Trivia

### `/bracket`
Run a tournament: members vote with buttons, matchup by matchup. Set one up with `/bracket-setup`. See [Tournament Brackets](/commands/brackets/).

**For everyone:**
- `help` - The tournament guide
- `status` - Progress and live vote bars
- `voting-post` - Post the voting card again at the bottom of the channel. Members once every 10 minutes per channel; admins and moderators any time
- `list-groups` - Every group and its titles
- `view` - The bracket image (knockout rounds)
- `my-votes` - Your votes and what's still open to you
- `export` - The results. `format` (required: `markdown` or `json`)

**For admins and moderators:**
- `open` - Open the next round, whatever the phase. `duration` (such as `24h` or `3d`; default 24h, 5m-30d), `matchups` (1-5: open just the next few matchups)
- `close` - Close the current round and move on. `tiebreaker-duration` (default 1h)
- `open-groups` - `groups` (required, such as `A,B,C`), `duration`
- `close-groups` - `groups` (required), `tiebreaker-duration`
- `open-matchup` - `region` (1-4), `matchup` (pick from the list, or `1A,1B`), `duration`
- `close-matchup` - `matchup`, `tiebreaker-duration`
- `extend-voting` - `type` (required: `group` or `knockout`), `duration` (required), `group`
- `resolve-tiebreaker` - `tiebreaker-id` (required), `winner` (1-4; leave out to go by the votes)
- `regenerate` - Rebuild the knockout bracket from the group results
- `cancel` - Cancel the tournament

```
/bracket open duration:24h
/bracket open matchups:1
/bracket close tiebreaker-duration:30m
/bracket status
/bracket view
```

[Learn more →](/commands/brackets/commands)

---

### `/bracket-setup`
Set up a tournament (admins and moderators).

**Subcommands:**
- `create` - `name` (required), `max-titles` (2, 4, 8, 16 or 32 for a bracket; 36, 40, 44 or 48 for groups), `seeding` (`random` (default), `ordered`, `rating`), `ties` (`runoff` (default) or `higher-seed`)
- `setup-link` - A private link to the web setup form, to fill in or upload a CSV or JSON file
- `manage-titles` - `action` (required: `add` or `remove`); to add, `type` (movie, tv, game, boardgame, book) and `title`, plus `group` and `image`; to remove, `position`
- `resize` - Change the number of groups before voting starts. `groups` (required, 4-12)
- `edit-name` - `name` (required)
- `announce` - Announce the tournament. `message`, `image`

```
/bracket-setup create name:Horror Movie Madness max-titles:16 seeding:rating
/bracket-setup manage-titles action:add type:movie title:The Thing
/bracket-setup setup-link
```

[Learn more →](/commands/brackets/setup)

---

### `/survey`
A poll with up to 10 options. Members vote with buttons.

**Subcommands:**
- `create` - `question`, `option1` and `option2` (required), `option3` to `option10`, `multiple` (allow more than one vote), `duration` (minutes, 1-20160; leave out for no auto-close), `tie-break` (`runoff` (default): a runoff vote, then a random pick; or `none`)
- `list` - `filter` (`active`, `closed`, `all`)
- `results` - `poll_id` (required, pick from the list)
- `voting-post` - Post an open survey again at the bottom of the channel. `poll_id` (leave out when only one is open). Members once every 10 minutes per survey; the creator and admins any time
- `close` - End voting and post the results. `poll_id` (required). The creator, admins and moderators
- `delete` - Delete it for good. `poll_id` (required). The creator, admins and moderators

```
/survey create question:What should we watch tonight? option1:Horror option2:Comedy option3:Action duration:60
/survey voting-post
```

[Learn more →](/commands/social#survey-commands)

---

### `/escape`
**Escape Velocity**: a multi-day movie and TV genre trivia event in the style of *Who Wants to Be a Millionaire?*. Climb 15 stages to reach orbit, one launch a day, and your best run counts.

**Subcommands:**
- `play` - Launch today's run, or pick up where you left off
- `rules` - How it works
- `standings` - Who's closest to orbit. `private` (default: false)

[Learn more →](/commands/escape-velocity)

---

### `/escape-setup`
Run an Escape Velocity event (admins and moderators).

**Subcommands:**
- `create` - `name` (required), `days` (required, 1-30), `starts_in_hours` (0-720; default: as soon as the questions are ready), `channel`. Then pick movies and/or TV and the genres
- `pool` - Show the question bank. `add:true` tops it up now
- `extend` - Add days. `days` (required, 1-30)
- `end-now` - Finish now and post the final results
- `cancel` - Cancel with no results. `confirm` (required)

```
/escape-setup create name:Halloween Launch days:7
```

[Learn more →](/commands/escape-velocity)

---

## AI Image Generation

### `/image`
AI images: a prompt, a message, a versus poster for two titles or a tournament matchup, or a member imagined from their profile. Needs an OpenAI key, and admins can limit or switch it off.

**Options:**
- `prompt` - What to draw, or extra detail alongside `title1`/`title2` or `matchup`
- `message` - A username or message ID to draw from
- `title1` / `title2` - Two titles for a versus poster (movie, TV, game, board game or book). Give both
- `matchup` - A tournament matchup: pick from the list, or type its label (`1A`, `Finals`)
- `user` - A member, imagined from their name, roles, colors and the titles they look up. Never their avatar. Needs `prompt`
- `private` - Only you see the image (default: false)

Use one mode at a time. Run `/image` with no options to see this round's matchups.

```
/image prompt:A drive-in theater on the moon
/image title1:Godzilla title2:King Kong
/image matchup:1A
/image user:@Doug prompt:a Lego minifig version of them
```

By default each member waits 5 minutes between images and gets 10 a day, and the server gets 50 a day.

[Learn more →](/commands/ai-images)

---

## Fun & Social Commands

`/potion`, `/foodfight`, `/doom`, `/rescue` and `/siege` are games with points, items, prizes, titles and a leaderboard, and `/six-demon-bag` spends the Chi they earn. This page lists their options; how the games work is in its own section, [Games & Scores](./games): [Playing & Points](./games-playing), [Your Card & the Leaderboard](./games-card), [Items, Prizes & Titles](./games-rewards), [Twists & Happenings](./games-happenings), [Siege](./games-siege), [The Six-Demon Bag](./games-magic) and [Settings for Admins](./games-settings).

### `/potion`
Give magical potions with fun pop culture references, to a member, a whole role, or @everyone.

**Options (`give`):**
- `user` (required) - Who gets it: a member, a role, or @everyone. A role or @everyone is shown but not pinged
- `type` (required) - Type of potion (Health, Mana, Strength, Speed, Invisibility, Luck, Confusion, Love, Poison, Energy, Weakness, Curse, Slow)
- `item` (optional) - An item from your Glovebox. Only 🍀 Lucky Penny fits: the potion works and your points double. The list shows only what you hold ([Items](./games-rewards#using-an-item))

**Admin/Mod:** `/potion responses add`, `remove`, `list` and `reset` manage your server's own responses for a potion type (with `{giver}` and `{receiver}`, and an outcome: worked or backfired). `/potion theme set`, `add`, `remove`, `list` and `reset` choose which themes the built-in responses come from.

**Features:**
- 13 different potion types (helpful & harmful!)
- 339 built-in responses with references to:
  - Horror: Midsommar, The Stuff, Poltergeist, The Ring
  - Comedy: Army of Darkness, Shaun of the Dead, Hot Fuzz
  - Fantasy: LOTR, Harry Potter, The Witcher, Princess Bride
  - Games: Dark Souls, Skyrim, Zelda, Mario
  - Modern: Deadpool, Twin Peaks
- Prevents giving potions to bots
- Public messages; a member is pinged, a role or @everyone isn't
- Scores points: helpful potions that work, harmful ones that work, and backfires each score differently ([Games & Scores](./games))

**Available Potion Types:**

**Helpful Potions:**
- 💚 **Health Potion** - Healing with +HP
- 💙 **Mana Potion** - Magic restoration with +MP
- 🔴 **Strength Potion** - Power boost with +STR
- 💨 **Speed Potion** - Haste effect with +SPD
- 👁️ **Invisibility Potion** - Stealth mode
- 🍀 **Luck Potion** - Fortune boost with +LUCK
- 💕 **Love Potion** - Romance boost with +CHARM
- ⚡ **Energy Potion** - Power up with +ENERGY

**Harmful Potions (for fun chaos!):**
- 😵 **Confusion Potion** - Chaos effect with -INT
- ☠️ **Poison** - Dark magic with -HP
- 💔 **Weakness Potion** - Debuff with -STR
- 👹 **Curse** - Ancient evil (CURSED status)
- 🦥 **Slow Potion** - Movement debuff with -SPD

**Examples:**
```
/potion give user:@Friend type:health
→ "🧃 @You tosses @Friend an Estus Flask. 'Praise the sun!' 💚 +100 HP"

/potion give user:@Friend type:weakness
→ "🫠 @You gives @Friend a potion that tastes like regret. Their muscles turn to jelly! 💔 -75 STR"

/potion give user:@Friend type:curse
→ "👹 @You 'accidentally' gives @Friend the Cursed Videotape Juice. Seven days... 📼 CURSED (The Ring)"

/potion give user:@Friend type:love
→ "💘 @You hands @Friend Cupid's arrow in liquid form. 'As you wish.' 💕 +95 CHARM (Princess Bride)"
```

**Note:** Every potion scores points for you and the member you gave it to. See [Games & Scores](./games).

---

### `/foodfight`
Start a food fight, after the classic BBS door game: throw food at a member, a whole role, or @everyone, or feed them instead. Each throw hits, misses, or backfires on the thrower; each meal is tasty, gross, or spilled. Both score points ([Games & Scores](./games)).

**Options (`throw`):**
- `target` (required) - A member, a role, or @everyone. A role or @everyone is shown but not pinged
- `food` (optional) - Cream pie, spaghetti, pudding, mashed potatoes, Jell-O, meatloaf, creamed corn, tapioca, pizza, taco, fish sticks or split pea soup. Leave it out for a random one
- `item` (optional) - An item from your Glovebox. Only 🥧 Golden Pie fits: a sure hit, and your points double. The list shows only what you hold ([Items](./games-rewards#using-an-item))

**Options (`feed`):** the same `target`, `food` and `item` (a 🥧 Golden Pie makes it always tasty, +2 more for you both).

**Admin/Mod:** `/foodfight lines add`, `list`, `remove` and `reset` take their `food` from a list, as you type, and manage your server's own lines for `action:throw` (with `{thrower}` and `{target}`) or `action:feed` (with `{feeder}` and `{target}`), each tagged with its outcome.

**Examples:**
```
/foodfight throw target:@Friend food:pie
/foodfight throw target:@everyone
/foodfight throw target:@Friend item:Golden Pie
/foodfight feed target:@Friend food:taco
```

See [Social Commands › Food Fight](./social#food-fight).

---

### `/doom`
Deal someone, a whole role, or @everyone a horror-movie fate: horror-comedy that dooms the target, backfires on you, or ends in a narrow escape. Scores points; someone shielded by a recent `/rescue` is safe ([Games & Scores](./games)).

**Options (`fate`):**
- `target` (required) - A member, a role, or @everyone. A role or @everyone is shown but not pinged
- `trope` (optional) - Zombie, monkey's paw, slasher, possession, cursed tape, haunted doll, vampire, werewolf, killer clown, Necronomicon, Ouija board or Bloody Mary. Leave it out and fate decides
- `item` (optional) - An item from your Glovebox. Only 📼 Cursed VHS fits: it can't backfire, doubles your points, and cuts through a shield or Garlic ([Items](./games-rewards#using-an-item))

**Admin/Mod:** `/doom lines add`, `list`, `remove` and `reset` manage your server's own lines, which need `{user}` and `{target}` and an outcome (doomed, escaped or backfired).

**Examples:**
```
/doom fate target:@Friend trope:monkey-paw
/doom fate target:@everyone
```

See [Social Commands › Doom](./social#doom).

---

### `/rescue`
Save someone from a horror movie: a Final Girl, holy water, the boomstick, the dog. A rescue that works shields them from the next `/doom` for an hour.

**Options (`attempt`):**
- `target` (required) - A member, a role, or @everyone. You can't rescue yourself
- `trope` (optional) - Final Girl, holy water, Ghostbusters, boomstick, salt circle, silver bullet, sunrise, getaway car, Van Helsing, survival rules, garlic or the dog
- `item` (optional) - An item from your Glovebox. Only 💧 Holy Water fits: it can't be caught, gives you +2 more, and the shield lasts 3× as long ([Items](./games-rewards#using-an-item))

**Admin/Mod:** `/rescue lines add`, `list`, `remove` and `reset` manage your server's own lines, which need `{user}` and `{target}` and an outcome (rescued, caught or sacrificed).

**Examples:**
```
/rescue attempt target:@Friend trope:final-girl
/rescue attempt target:@everyone
```

See [Social Commands › Rescue](./social#rescue).

---

### `/siege`
A monster attacks the drive-in and the whole server fights it together with food, dooms and potions. Beat it before time runs out and everyone who fought is paid, with a bonus and loot for the Wang Chi (whoever helped most) and a smaller one for the Jack Burton (the killing blow). Let it escape and everyone who fought loses a few points. While people are fighting it fights back: it grabs a fighter (free them with `/rescue`), poisons one (cure them with a helpful `/potion`) or roars. An admin starts one, or one turns up by itself ([Random sieges](./games-siege#random-sieges)). By default a siege is a campaign over a week, with 8 attacks a night each and a report each night; the server's [pace](./games-siege#pace) sets how long it lasts and its timings.

**Subcommands:**
- `attack` - Hit the monster. Anyone, from the siege's channel or its threads
- `back` - Stake 2–10 of your points on another fighter, in the first half of the siege: twice your stake if they're the Wang Chi, your stake back if they're top 3 or the Jack Burton ([Backing a fighter](./games-siege#backing-a-fighter))
- `status` - The monster, its HP, your own damage and place, and who you backed. Only you see it
- `start` - A monster attacks this channel (Admin/Mod)
- `end` - End the siege now, with no rewards and no penalties, and backers' stakes back (Admin/Mod). A monster already at 0 HP counts as beaten, and one whose time is up as escaped

**Options (`attack`):**
- `weapon` (required) - `food` (throw something), `doom` (a horror fate) or `potion` (poison: damage now and for 5 minutes)
- `item` (optional) - An item from your Glovebox. Golden Pie fits food, Cursed VHS fits doom, Lucky Penny fits potion, and the Silver Bullet fits any weapon. The list shows only what you hold ([Items in a siege](./games-siege#items-in-a-siege))

**Options (`back`):**
- `fighter` (required) - Who you're backing: someone else who has attacked
- `points` (required) - Your stake, 2 to 10 of this month's points

**Options (`start`):**
- `monster` (optional) - One of 11 monsters. Without it you get a random one
- `length` (optional) - How long it lasts: 30 minutes, 45 minutes, 1 hour, 4 hours, 1 day, 3 days, 5 days, 7 days or 10 days. It runs to the timings of the nearest [pace](./games-siege#pace). Without it, the server's pace (a week by default; at quick pace 45 minutes, or the monster's own)

**Examples:**
```
/siege attack weapon:food
/siege attack weapon:potion item:Lucky Penny
/siege back fighter:@Sam points:5
/siege status
/siege start monster:blob length:45
/siege start length:10080
/siege end
```

Your first 30 attacks a day score points, and later ones still do damage; from evening pace on each member also has a number of attacks a night (8 at week pace, back at 12:00 UTC), and from day pace on an attack's points go into the pot, paid out when it's beaten. A fighter the monster has grabbed can't attack until someone frees them, and one it has poisoned does half damage until someone cures them ([It fights back](./games-siege#it-fights-back)). Turn it off with `/eggshen-config commands toggle setting:siege enabled:false`. See [Siege](./games-siege).

---

### `/six-demon-bag`
Egg Shen's bag: spend the Chi your good plays earn to bless a friend or hex a rival, element by element (Lightning, Thunder, Rain, Wind, Fire, Smoke). Every cast is public and pings who it lands on, and the first time a blessing does something its caster gets +1 Chi back. Hexes have limits that keep them friendly: one a day, at most two received a day, a 3-hour ward after each, a way out (`shrug`) and an opt-out (`peace`).

**Subcommands:**
- `bless` - Bless a member (6 Chi): Lightning Strike, Thunderous Applause, Cleansing Rain, Tailwind, Fired Up or Smoke Screen
- `hex` - Hex a member (7 Chi, one a day): Static, Deafened, Rained Out, Ill Wind, Scorched or Lost in the Smoke
- `peace` - No hexes on you and none from you. Once made, it holds for 7 days
- `shrug` - Shrug off the hex on you: free once a day, then 2 Chi (free if you hold less)
- `status` - Your Chi, your casts today and what's on you. Only you see it

**Options:**
- `member` (`bless`, `hex`; required) - Who to cast on
- `element` (`bless`, `hex`; required) - Which demon. The list shows each element's charm and cost, and, once the member is picked, what it would do to them (`🌧️ Rain · lifts Sam's 🔥 Scorched`). You can also type an element's or a charm's name
- `on` (`peace`; required) - `true` makes peace, `false` ends it
- `private` (`status`) - Only you see it (the default). `private:false` shows it to the channel

**Examples:**
```
/six-demon-bag bless member:@Sam element:Fire
/six-demon-bag hex member:@Jo element:Wind
/six-demon-bag shrug
/six-demon-bag peace on:true
/six-demon-bag status
```

Two casts a day (UTC), at most one a hex. A cast shares the games' cooldown and 6-a-minute limit, and works in the channels the games are played in; `status` works anywhere. Like the games, casting, `shrug` and `peace` aren't under the bot's general rate limit; `status` is. A refused cast costs nothing. Chi comes from good plays (+1, at most 4 a day) and from freeing and curing in a siege (+2, at most 6 a day), and the bag holds 20. Turn it off with `/eggshen-config commands toggle setting:magic enabled:false`, or switch off only hexes with `/eggshen-config-games happenings hexes:false`. See [The Six-Demon Bag](./games-magic).

---

### `/scoreboard`
Your game card, or anyone's: avatar, total and rank, a column per game (points, rank, plays, what they did and received, streak), an active rescue shield and any [twist](./games-happenings#twists) status, any [happening](./games-happenings#happenings) or [siege](./games-siege) in progress, and your rewards: prizes in progress, nights in a row, Glovebox, titles and the [Six-Demon Bag](./games-magic#your-bag). Right-click a member → **Apps** → **Game card** shows anyone's card privately.

**Options:** `user`, `game`, `period` (this month, this year, all time), `private`, and `title` (pick which [earned title](./games-rewards#choosing-the-title-you-show) shows with your name, or *No title*; only for yourself)

```
/scoreboard
/scoreboard user:@Friend period:month
```

See [Your Card & the Leaderboard](./games-card#scoreboard).

---

### `/leaderboard`
The server's game card: the top 15 players one line each (medal, name, a bar against the leader, points), who leads each game, who received the most of everything, the period's plays, points, players, most played game, best streak and sieges won or escaped, and any [happening](./games-happenings#happenings) or [siege](./games-siege) in progress.

**Options:** `game`, `period` (this month, this year, all time), `private`

```
/leaderboard period:month
/leaderboard game:doom
```

See [Your Card & the Leaderboard](./games-card#leaderboard).

---

### `/how-to-play`
Quick help for the games: one short card per topic, with a menu and **◀ Previous** / **Next ▶** to the others. Every number on it is the one the games use, and the limits are your server's own. Games switched off on the server are left out.

**Options:**
- `topic` (optional) - **Basics** (default: the games, points, the limits and your score), **Items & Glovebox**, **Prizes & titles**, **Nights in a row**, **Twists**, **Happenings**, **Siege** or **Six-Demon Bag**
- `private` (optional) - Only you see it. On by default; `private:false` shows it to the channel. Anyone can page through a public one: the buttons answer each person privately and never change the posted card

**Examples:**
```
/how-to-play
/how-to-play topic:Siege
/how-to-play topic:Items & Glovebox private:false
```

See the [Games Quick Guides](/guides/games/) and the [Games FAQ](/guides/games/faq).

---

### Game card (right-click)
Right-click a member (or tap their name), then **Apps** → **Game card**. You see their game card, just for you. It's the same card `/scoreboard` shows. See [Game card](./games-card#game-card-right-click).

---

## Status Quotes

The bot's status line shows a rotating movie quote.

### `/quote`
Post a random quote from the rotation in the channel.

**Options:**
- `title` - Only quotes from this movie, show or game (start typing to pick)
- `author` - Only quotes said by this character or person

### `/suggest-quote`
Suggest a quote for the rotation. A moderator reviews it before it goes live. You can have 3 waiting at once by default.

**Options:**
- `quote` (required) - The quote
- `title` - What it's from
- `author` - Who said it

```
/suggest-quote quote:You were great in Lethal Weapon. title:Big Trouble in Little China
```

Admins manage the list with `/eggshen-config-quotes` ([Admin Configuration](./configuration#quotes)).

---

## Help and Statistics

### `/eggshen-ask`
Ask how to do something in plain words, and get the exact commands to run, answered from this documentation.

**Options:**
- `question` (required) - Up to 300 characters
- `public` - Post the answer in the channel (default: only you see it)

```
/eggshen-ask question:how do I run a tournament one matchup at a time?
```

[Learn more →](./ask)

---

### `/eggshen-help`
The command list, just for you. It only shows commands your server has switched on, and admin commands only to admins and moderators. It links to these docs.

---

### `/stats`
What this server looks up most, or your own activity. Anyone can use it, and it posts in the channel.

**Options:**
- `filter` - `all-time` (default), `month`, `week` or `today`
- `type` - `server` (default) or `personal`

```
/stats filter:month
/stats type:personal
```

[Learn more →](/features/statistics)

---

## Admin Commands

All of these are for admins and moderators unless marked otherwise. See [Who counts as an admin](#command-permissions).

### `/eggshen-config` and friends
Server settings, split across 8 commands to stay under Discord's size limit for one command:

| Command | What it covers |
|---|---|
| `/eggshen-config` | Rating services, emojis, region, search results, timers, stats tracking, command switches, notifications |
| `/eggshen-config-watch-party` | Watch-party channels, auto-detect, episode buffer, starting-soon cards, watchlist settings, rate limits |
| `/eggshen-config-ai` | AI images (limits, permissions, whitelist), AI announcement text, AI answers for `/eggshen-ask` |
| `/eggshen-config-moderation` | Moderation switch, user cooldowns, whitelist mode, auto-ban threshold |
| `/eggshen-config-events` | The event request form |
| `/eggshen-config-games` | Game limits, game channels, happenings, twists, the pace, random sieges, hexes, score resets |
| `/eggshen-config-quotes` | The status quote rotation and quote suggestions |
| `/eggshen-config-website` | This server's web pages: form address, bot address, theme |

```
/eggshen-config settings view
/eggshen-config commands toggle setting:game enabled:false
/eggshen-config-watch-party rate-limit view
/eggshen-config-games channels mode:only add:#games
```

[Learn more →](/commands/configuration)

---

### `/eggshen-stats`
Detailed usage statistics for the server. `filter` (`all-time`, `month`, `week`, `today`).

[Learn more →](/features/statistics)

---

### `/eggshen-logs`
The bot's logs (Administrator permission only).

**Subcommands:**
- `stats` - Log file sizes and counts
- `errors` - Recent errors. `count` (1-50, default 10)
- `category` - Recent entries in one category. `category` (required: `system`, `command`, `button`, `scheduler`, `performance`), `count` (1-50, default 10)

```
/eggshen-logs errors count:20
/eggshen-logs category category:command
```

[Learn more →](/features/logging)

---

### `/eggshen-restart`
Restart the bot. It shuts down and relies on PM2 (or another process manager) to start it again.

---

## Command Categories

| Category | Commands |
|----------|----------|
| **Search** | `/movie`, `/tv`, `/episode`, `/episode-list`, `/game`, `/boardgame`, `/book`, `/soundtrack` |
| **Watch parties** | `/timer`, `/watchparty`, `/announce`, `/watched`, `/watchlist` |
| **Discovery** | `/random`, `/recommend`, `/similar` |
| **Tournaments, surveys and trivia** | `/bracket`, `/bracket-setup`, `/survey`, `/escape`, `/escape-setup` |
| **AI images** | `/image` |
| **Games** | `/potion`, `/foodfight`, `/doom`, `/rescue`, `/siege`, `/six-demon-bag`, `/scoreboard`, `/leaderboard`, `/how-to-play`, Game card |
| **Quotes** | `/quote`, `/suggest-quote` |
| **Help and statistics** | `/eggshen-ask`, `/eggshen-help`, `/stats` |
| **Admin** | `/eggshen-config` (and its 7 siblings), `/eggshen-stats`, `/eggshen-logs`, `/eggshen-restart` |

## Command Permissions

**Admins and moderators** are members with any of these Discord permissions: Administrator, Manage Server, Timeout Members, Kick Members or Ban Members. They can always use every command, even one switched off for regular members.

**Admins and moderators only:**
- `/announce`, `/bracket-setup`, `/escape-setup`, `/eggshen-stats`, `/eggshen-restart`, and all eight `/eggshen-config` commands
- `/bracket` subcommands that run the tournament (`open`, `close`, `open-groups`, `close-groups`, `open-matchup`, `close-matchup`, `extend-voting`, `resolve-tiebreaker`, `regenerate`, `cancel`)
- `/siege start` and `/siege end`, `/watchlist clear`, and the `lines`, `responses` and `theme` groups of the games
- Closing or deleting someone else's survey, and removing someone else's watchlist title

**Administrator permission only:** `/eggshen-logs`.

**Everyone else:** every other command, unless an admin switches it off with `/eggshen-config commands toggle`. Some actions are limited to the person who started them: stopping someone else's timer, or closing someone else's ready check, needs an admin or moderator.

[Learn about moderation →](/features/moderation-tools)

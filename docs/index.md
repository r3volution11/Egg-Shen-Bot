---
layout: home
pageClass: egg-home
title: Egg Shen Bot - Discord Movie, TV Show, Gaming, and Book Bot
description: Free, open-source Discord bot for movie and TV communities. Search movies, shows, games and books with ratings from IMDb, Letterboxd, Trakt and more, run watch parties with smart timers, settle it with tournaments and surveys, play server-wide games and monster sieges, run Escape Velocity genre trivia, and ask the bot how to do anything.

hero:
  name: Egg Shen Bot
  text: Movie night, with a little magic
  tagline: Look up any movie, show, game or book, run the watch party, settle the argument with a tournament, and keep playing until a monster attacks the drive-in. Free and open source.
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: Browse Commands
      link: /commands/
    - theme: alt
      text: View on GitHub
      link: https://github.com/r3volution11/Egg-Shen-Bot
  image:
    src: /logo.png
    alt: Egg Shen Bot's logo, two hands holding blue lightning inside a carved stone ring set with jade gems

# Icons are the bot's own drawn kit (docs/public/emojis), decorative beside
# each title, so their alt text is empty
features:
  - icon: { src: /emojis/star.png, alt: '', width: 56, height: 56 }
    title: Look It Up, Ratings and All
    details: Movies, shows, episodes, video games, board games and books, rated by IMDb, Letterboxd, Trakt, Rotten Tomatoes and more, plus where to stream it. /episode-list rates a season of up to 25 episodes at once.
    link: /commands/search
    linkText: Search commands

  - icon: { src: /emojis/clock.png, alt: '', width: 56, height: 56 }
    title: Watch Parties That Run Themselves
    details: /timer start reads your Discord event and sets the runtime, episodes and all. Announcements post on schedule, a ready check counts heads, and what you watch goes into your server's history.
    link: /commands/watch-party
    linkText: Watch parties

  - icon: { src: /emojis/dice.png, alt: '', width: 56, height: 56 }
    title: Decide What's Next
    details: A shared watchlist members vote on, and the bot picks tonight's movie. /random can pick from just the services you have, and /recommend works from what your server has watched.
    link: /commands/watch-party#watchlist
    linkText: The watchlist

  - icon: { src: /emojis/trophy.png, alt: '', width: 56, height: 56 }
    title: Tournaments and Surveys
    details: Brackets of 2 to 32 titles or groups of up to 48, seeded like March Madness if you like, with live standings and a drawn picture for each result. /survey takes a quicker vote.
    link: /guides/tournaments/
    linkText: Tournament guides

  - icon: { src: /emojis/food.png, alt: '', width: 56, height: 56 }
    title: Games for the Whole Server
    details: Food fights, horror-movie dooms, rescues and potions, every play scored. Earn Glovebox items, prizes and titles, ride out twists and a Full Moon, and climb the leaderboard.
    link: /commands/games
    linkText: The games

  - icon: { src: /emojis/siege.png, alt: '', width: 56, height: 56 }
    title: Monster Sieges
    details: A monster crawls out of the screen and attacks the drive-in. The whole server fights it with food, dooms and potions, over a week by default, and shares the pot when it falls.
    link: /commands/games-siege
    linkText: Siege

  - icon: { src: /emojis/rocket.png, alt: '', width: 56, height: 56 }
    title: Escape Velocity
    details: Millionaire-style trivia about movie and TV genres that runs for days. One launch a day, 15 stages, and 1,000,000 points for reaching orbit.
    link: /commands/escape-velocity
    linkText: Escape Velocity

  - icon: { src: /emojis/scroll.png, alt: '', width: 56, height: 56 }
    title: Event Requests
    details: Members propose watch parties on a web form. Moderators approve in Discord with one click, and the bot creates the scheduled event and can announce it.
    link: /features/event-requests
    linkText: Event requests

  - icon: { src: /logo.png, alt: '', width: 56, height: 56 }
    title: Ask Egg Shen
    details: Not sure which command does what? Ask in plain words with /eggshen-ask and get the exact commands to run, answered from these docs.
    link: /commands/ask
    linkText: Ask the bot

# "And plenty more", drawn by <TopicCards />
topics:
  - title: AI Images
    link: /commands/ai-images
    icon: vs
    text: Optional. Versus posters for two titles or a tournament matchup, images from a prompt or a message, and members imagined.
  - title: Watch History and Stats
    link: /features/watch-history
    icon: chart
    text: A public record of what your server watches together, and `/stats` for what it looks up most.
  - title: Similar Titles and Soundtracks
    link: /commands/#similar
    icon: effect
    text: '`/similar` finds titles like one you love, of any kind, and `/soundtrack` finds the score on iTunes and Spotify.'
  - title: Moderation
    link: /features/moderation-tools
    icon: shield
    text: Rate limits per member and per server, spam-pattern detection, cooldowns and a whitelist mode for emergencies.
  - title: Your Server, Your Rules
    link: /commands/configuration
    icon: lock
    text: Per-server settings for ratings, emojis, timers, the watchlist, the games, AI and who can use which command.
  - title: Free and Self-Hosted
    link: /installation
    icon: gift
    text: Open source under the MIT license. Run your own copy; only a Discord bot token and a free TMDB key are required.
---

<div class="eh-intro">
<p class="eh-kicker">See it in action</p>
<h2 id="what-your-server-sees" tabindex="-1">What your server sees</h2>
<p>The cards the bot posts and the pictures it draws.</p>
</div>

<HomeShowcase id="tournaments" icon="trophy" kicker="Tournaments" title="Settle it with a bracket" image="/images/matchup-upset.webp" width="960" height="540" alt="A drawn matchup result for Semifinals 2A. Night of the Living Dead (1968), the 12 seed, is framed in gold under a red WINNER sash; Alien (1979), the 1 seed, is dimmed. A red UPSET! stamp sits between them, and the bar underneath splits 53%, 9 votes, to 47%, 8 votes.">

Put 2 to 32 titles in a bracket, or up to 48 in groups, and let the server vote on private ballots while the live standings fill. Every decided matchup posts a picture like this one: both posters, a lightning VS, the vote split, and an UPSET! stamp when the underdog wins.

[Tournament quick guides](/guides/tournaments/) [How voting works](/commands/brackets/knockout)

</HomeShowcase>

<HomeShowcase id="surveys" icon="chart" kicker="Surveys" title="Or just take a vote" image="/images/survey-5.webp" width="960" height="480" flip alt="A drawn survey results chart for 'What should we watch for the Friday double feature?'. Halloween (1978) leads under a crown with 47%, 14 votes, on a gold bar; The Thing 30%, 9 votes; Alien 17%, 5 votes; Jaws 7%, 2 votes; Night of the Living Dead 0%. 30 votes in all.">

`/survey create` puts up to 10 options to the channel. The leader's bar turns gold as the votes come in, a tie goes to a runoff, and when it closes the results come back drawn.

[Surveys](/commands/social#survey-commands)

</HomeShowcase>

<HomeShowcase id="games" icon="food" kicker="The games" title="Games that keep the chat going" cards="game-play game-card" peek items="gpie:Golden Pie, vhs:Cursed VHS, holyw:Holy Water, penny:Lucky Penny, garlic:Garlic, antid:Antidote, nlight:Night Light, silver:Silver Bullet" items-label="In the Glovebox">

Throw a pie with `/foodfight throw`, deal a horror-movie fate with `/doom fate`, rescue someone, or slip them a potion. Every play scores, and playing earns items for your Glovebox, titles, a bonus for nights in a row, Chi to bless or hex with `/six-demon-bag`, and a place on the leaderboard. In Discord, `/how-to-play` explains the lot.

[The games](/commands/games) [Play the games](/guides/games/play)

</HomeShowcase>

<HomeShowcase id="siege" icon="siege" kicker="Siege" title="Then a monster attacks the drive‑in" cards="siege-card" flip>

One of 11 monsters crawls out of the screen, and the whole server fights it together: 8 attacks a night each, friends to free when it grabs them, and a report every night. Beat it within the week and the pot is shared out. Loot goes to the Wang Chi, whoever kept the others in the fight, and the killing blow earns the Jack Burton.

[Siege](/commands/games-siege) [Fight a siege](/guides/games/siege)

</HomeShowcase>

<HomeShowcase id="escape-velocity" icon="rocket" kicker="Escape Velocity" title="Genre trivia, Millionaire style" cards="escape-dashboard">

A trivia event that runs for days, where every question is about movie and TV genres, built from real TMDB data. Everyone gets one launch a day to climb 15 stages to orbit and 1,000,000 points, and stage separations at 5 and 10 keep what's banked.

[Escape Velocity](/commands/escape-velocity)

</HomeShowcase>

<div class="eh-duo">
<div class="eh-panel">

## Run your own {#quick-start}

Egg Shen Bot is free and open source, and you host your own copy. You need Node.js 20 or newer, a Discord bot token and a free TMDB key; every other key is optional.

```bash
git clone https://github.com/r3volution11/Egg-Shen-Bot.git
cd Egg-Shen-Bot && npm install
cp .env.example .env    # then add your token and keys
node src/deploy-commands.js
npm start
```

[Getting started](/getting-started) [Installation guide](/installation)

</div>
<div class="eh-panel">

## Stuck? Ask Egg Shen {#ask}

Describe what you want in your own words. The bot answers from these docs with the exact commands to run, and links the page it came from. Answers are private unless you add `public:true`.

```text
/eggshen-ask question:how do I run a tournament one matchup at a time?
```

For the games, `/how-to-play` shows a short card on each topic, with your server's own limits.

[Ask the bot](/commands/ask) [Every command](/commands/)

</div>
</div>

<div class="eh-more">

## And plenty more {#more}

<TopicCards />

</div>

Found a bug or have an idea? [Open an issue on GitHub](https://github.com/r3volution11/Egg-Shen-Bot/issues) · [What's new](/changelog) {.eh-help}

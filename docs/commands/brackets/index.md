---
title: Tournament Brackets
description: Run movie, TV, game, board game and book tournaments in Discord, with button voting, live standings, drawn matchup results, group stages, wildcards and automatic advancement.
head:
  - - meta
    - property: og:title
      content: Tournament Brackets - Egg Shen Discord Bot
  - - meta
    - property: og:description
      content: Run movie, TV, game, board game and book tournaments in Discord, with button voting, live standings, drawn matchup results, group stages and knockout brackets.
  - - meta
    - property: og:url
      content: https://eggshenbot.com/commands/brackets/
  - - meta
    - name: twitter:title
      content: Tournament Brackets - Egg Shen Discord Bot
  - - meta
    - name: twitter:description
      content: Run movie and TV tournaments in Discord, with button voting, live standings, drawn results and a bracket image.
---

# Tournament Bracket System

Run a bracket tournament in your Discord server for movies, TV shows, video games, board games, or books. Members vote with buttons; the bot tallies votes, settles ties, and moves winners on to the next round.

::: tip New to tournaments?
Start with the [Tournament Quick Guides](/guides/tournaments/). They walk through the most popular setups in a few steps each: a [movie night bracket](/guides/tournaments/movie-night), [one matchup at a time](/guides/tournaments/one-at-a-time), a [32-title bracket](/guides/tournaments/big-bracket) and a [groups tournament](/guides/tournaments/groups). The [Tournament FAQ](/guides/tournaments/faq) answers the common questions, from the shapes of tournament and wildcards to ties and starting over. This page explains how the whole system works.
:::

<div id="quick-faq" />

## Quick Start Guide

This walks through a small straight bracket from creation to a champion. For a groups tournament, see [Setup & Group Stage](./setup).

### Step 1: Create the Tournament (Admin Only)

```
/bracket-setup create name:Horror Movie Showdown max-titles:8
```

✅ Only you can see the reply, so you can set up privately.

::: tip Setting up many titles?
Instead of Steps 1–2, run `/bracket-setup setup-link` and use the [setup form](./import) to upload a CSV or JSON file or fill the tournament in.
:::

### Step 2: Add Titles (Admin Only)

```
/bracket-setup manage-titles action:add type:movie title:The Thing
/bracket-setup manage-titles action:add title:Alien
/bracket-setup manage-titles action:add title:The Exorcist
/bracket-setup manage-titles action:add title:The Shining
```

Add up to 8. `type` is only needed on the first one.

💡 **Tip:** If several matches come up, pick the right one from the menu. Check what you've added with `/bracket list-groups`.

### Step 3: Announce the Tournament (Admin Only)

```
/bracket-setup announce message:🎬 Horror Movie Showdown starts NOW! Vote for your favorites!
```

📢 Now everyone can see it.

### Step 4: Open Round One (Admin Only)

```
/bracket open duration:24h
```

The bot builds the bracket (random seeding by default) and opens the first round: with 8 titles, the Quarterfinals' 4 matchups.

**→ [Learn more about setup, seeding, and groups](./setup)**

### Step 5: Members Vote (Everyone)

Click **Start Voting** on the voting message to get your personal voting dashboard.

<DiscordCard name="voting-dashboard" />

*Personal voting dashboard: your picks, your streak, and every vote you've cast, by round*

- Pick one title in each matchup.
- Your choices are saved right away and you can change them before voting closes.
- Check your votes any time with `/bracket my-votes`.
- Can't find the voting card? `/bracket voting-post` posts it again, with its **Start Voting** button.

### Step 6: Close the Round (Admin Only)

```
/bracket close
```

The bot closes every open matchup in the round and moves the winners on. Voting also closes by itself at the deadline. Ties start a short tiebreaker vote.

Each matchup gets a results card with a drawn picture: the two posters face off, the winner framed in gold, the vote split underneath, and an UPSET! stamp when a worse seed wins. Then the bot posts the bracket as it now stands.

<img class="result-image" src="/images/matchup-upset.webp" alt="A drawn matchup result for Semifinals 2A. Night of the Living Dead (1968), the 12 seed, is framed in gold under a red WINNER sash; Alien (1979), the 1 seed, is dimmed. A red UPSET! stamp sits between them, and the bar underneath splits 53%, 9 votes, to 47%, 8 votes." width="960" height="540" loading="lazy">

*The picture under a results card. [What's on it](./knockout#the-results-card)*

**Check progress any time:**

```
/bracket status
```

<DiscordCard name="tournament-status" />

*`/bracket status` during the Quarterfinals, with each open matchup's vote bars*

### Step 7: Repeat for Each Round

Open → Vote → Close, until the final:

```
/bracket open
/bracket close
```

For finer control, open the next few matchups with `/bracket open matchups:`, or open and close single matchups with `/bracket open-matchup` and `/bracket close-matchup`.

**→ [Learn about knockout rounds and regions](./knockout)**

### Step 8: Champion Crowned! 🏆

Closing the Finals posts its results card and picture, then the **Final Bracket**: the whole bracket as an image, with **Champion:** and the winning title. `/bracket status` shows the champion from then on.

For a movie or TV tournament, the champion can go straight onto the server's watchlist: turn on `auto-add-champion` in the [watchlist settings](/commands/watch-party#watchlist-settings).

---

## Pro Tips

**Timing & Pacing:**
- Use `duration:48h` for slower tournaments and `duration:1h` for live events.
- Open matchups one at a time or by region for drama.

**Keep Members Engaged:**
- Announce when new groups or rounds open.
- If the voting card has scrolled away, `/bracket voting-post` posts it again, with the live standings.
- The bot posts the bracket as an image whenever matchups are decided; `/bracket view` draws it any time.

**Manage Efficiently:**
- `/bracket status` shows progress and live vote counts.
- `/bracket list-groups` gives a plain numbered list of titles.

**→ [See more tips and advanced features](./tips)**

---

## Tournament Structure

### Straight Bracket

- 2 to 32 titles, no groups
- `/bracket open` builds the bracket and opens round one
- Seeding is random by default. `seeding:The order I add them` or `seeding:By rating` on `/bracket-setup create` (or the [setup form](./import)) seeds it, shows the seeds and calls out upsets

### Groups Tournament

**Phase 1: Group Stage**
- 4–12 groups (A through L), exactly 4 titles each
- Members pick their top 2 in each group, up to 5 groups at a time
- Top 2 go through, plus wildcards if needed

**Phase 2: Knockout**
- `/bracket open` starts it once every group is closed
- Continues like a straight bracket

**→ [Complete setup guide](./setup)**

### Knockout Rounds (both shapes)

- Single elimination: Round of 32 → Round of 16 → Quarterfinals → Semifinals → Finals
- Matchups are labeled by region (1A, 2B, …) across 4 regions
- Open a whole round (up to 5 matchups), the next few, one region, or single matchups
- Winners move on automatically

**→ [Complete knockout guide](./knockout)**

---

## What Members See

Every card is drawn with the bot's own icons and stone bars once its emoji are uploaded (it does this itself on its first start), and in plain emoji until then.

- **The voting card:** what's open and when it closes, with a **Start Voting** button. `/bracket voting-post` posts it again further down.
- **Their own ballot:** a row per matchup, their picks in purple, their voting streak, and every vote they've cast, by round, their picks ticked.
- **Live standings:** each open matchup's vote bars, the leader marked 🔥, and the totals (votes, voters, matchups). The card keeps one layout until its matchups close, so it doesn't jump around between votes.
- **Results:** each decided matchup gets a card with a split bar, 🏆 Winner and 🥈 Runner-up, and a drawn picture of the matchup. Group results show medals beside the titles, with the two that advance marked.
- **The bracket:** posted after each batch of results, and drawn any time with `/bracket view`.

**[See each card in detail](./knockout#how-members-vote)**

---

## Documentation

- **[Setup & Group Stage](./setup)** - Create tournaments, add titles, run the group stage
- **[Setup Form](./import)** - Set up a tournament from a CSV or JSON file
- **[Knockout Rounds](./knockout)** - Regions, opening options, running the knockout
- **[Command Reference](./commands)** - Every bracket command
- **[Tips & Strategies](./tips)** - Pacing, extending deadlines, matchup images

---

## Need Help?

- Check the [Command Reference](./commands) for command details
- See [Tips & Strategies](./tips) for pacing ideas
- Use `/bracket status` to check tournament progress
- Use `/bracket my-votes` to see your own votes

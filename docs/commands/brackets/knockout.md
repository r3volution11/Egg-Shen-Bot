---
title: Knockout Rounds - Tournament Brackets
description: Run single-elimination knockout rounds with /bracket open and /bracket close, regional matchup labels, live standings, drawn results and the bracket image.
kitHeadings:
  how-members-vote: vs
  closing-a-round: trophy
  tournament-status: chart
---

# Knockout Rounds

Knockout rounds are single elimination, from the Round of 32 to the Finals. A straight bracket is a knockout from the start. A groups tournament reaches it when every group is closed and you run `/bracket open` (see [Starting the Knockout](./setup#starting-the-knockout)).

Most of the time you only need two commands:

```
/bracket open     # open the current round
/bracket close    # close it and move the winners on
```

For finer control, `/bracket open matchups:` opens the next few matchups, and `/bracket open-matchup` and `/bracket close-matchup` work on single matchups or one region.

## Regional Labels

Each round is split into **4 regions**, March Madness style. A matchup's label is its region number plus a letter:

| Round | Matchups | Labels |
|-------|----------|--------|
| Round of 32 | 16 | 1A–1D, 2A–2D, 3A–3D, 4A–4D |
| Round of 16 | 8 | 1A, 1B, 2A, 2B, 3A, 3B, 4A, 4B |
| Quarterfinals | 4 | 1A, 2A, 3A, 4A |
| Semifinals | 2 | 1A, 3A |
| Finals | 1 | Finals |

The ballot, the live standings, `/bracket status` and the button pickers all show the labels.

---

## Opening a Round

### `/bracket open`

```
/bracket open duration:<time> matchups:<1-5>
```

Opens every matchup in the current round that has both titles in place.

**Parameters:**
- `duration` (optional): how long voting stays open, from `5m` to `30d`, such as `30m`, `24h` or `3d`
- `matchups` (optional, 1–5): open only the next N matchups, in bracket order. Run it again to open the next N.

If `duration` is left out, the bot uses the default voting duration from the [setup form](./import), or 24h if the form didn't set one.

**Who can use:** members with the Administrator or Timeout Members permission only

**A ballot holds 5 matchups.** The Round of 32 (16 matchups) and Round of 16 (8) don't fit, so plain `/bracket open` tells you to open them in parts:

- `/bracket open matchups:1`: one at a time, in order
- `/bracket open matchups:4`: four at a time
- `/bracket open-matchup region:1`: one region

**Examples:**
```
/bracket open
/bracket open duration:48h
/bracket open matchups:4 duration:1d
```

### How members vote

Opening a round posts the voting message:

<DiscordCard name="voting-opened" />

*The voting message, posted in the channel*

Its **Start Voting** button opens a ballot only that member sees:

- One row per open matchup: `1A · Alien (1979)`, a grey **vs**, `1A · Jaws (1975)`. Each row is its own head-to-head vote, and your pick turns purple.
- **Your votes:** every matchup you've voted in this tournament, your pick ticked and in bold, under a heading per round (Round 1, Round 2… then the Final). Where a round has more than one matchup per region, each region gets its own heading and its matchups go by letter:
  ```
  Round 1 · Region 1
  A: ✅ Session 9 vs A Nightmare on Elm Street
  B: Chucky vs ✅ Halloween (1978)

  Round 3
  1A: ✅ Session 9 vs Halloween (1978)
  ```
  Once the bot's own emoji are uploaded, the ✅ is its jade tick.
- Your voting streak: how many rounds in a row you've voted in, up to this one. A round that goes by without your vote ends it. And when voting closes, as a countdown.
- Votes save right away. Change them until the matchup closes.

<DiscordCard name="voting-dashboard" />

*A member's own ballot: their picks in purple, their streak, and every vote they've cast*

### Live standings

The first vote on a set of open matchups posts a **Live Standings** card under it, and every vote after that updates it:

<DiscordCard name="live-standings" />

*Live standings for two open semifinals, a stone bar under each title*

- **Each matchup:** its label, when it closes, both titles with their votes and share, 🔥 on the one ahead and 🤝 on a tie.
- **The bars:** green for the title ahead, orange for the one behind, gold for both when tied.
- **The totals:** `🗳️ 12 votes · 👥 6 voters · ⚔️ 2 matchups`.

The bars are the bot's own emoji, carved stone channels filling with colour. The bot uploads them itself on its first start (see [Installation](/installation)); until they're up, every bar is coloured squares: 🟩🟩🟩🟩🟩🟩🟩⬜⬜⬜ 4 votes (67%). With them, the card picks one of three looks:

- **A bar under each title**, with its votes and share, when there's room, as above.
- **One split bar per matchup**, the first title's share from the left and the second's from the right, between their counts, when more matchups are open.
- **Coloured squares**, for a whole round of long titles.

The card picks its look once, for the matchups it's showing, and keeps it until they close. It never changes shape between votes.

Opening new matchups starts a new card for them. The earlier card stays where it was, with its final counts. If the card has scrolled away, `/bracket voting-post` posts it again further down.

---

## Opening Part of a Round

### `/bracket open-matchup`

```
/bracket open-matchup matchup:<labels> duration:<time>
/bracket open-matchup region:<1-4> duration:<time>
/bracket open-matchup duration:<time>
```

**Parameters:**
- `matchup` (optional): one label or several, comma-separated: `1A`, `2B,3A`, `Finals`. Start typing to pick from the matchups that haven't opened, shown with both titles.
- `region` (optional): 1 to 4. Opens every matchup in that region of the current round.
- `duration` (optional): `5m` to `30d`. Same default as `/bracket open`.

**Who can use:** members with the Administrator or Timeout Members permission only

**With nothing but `duration`**, the bot shows buttons:
- More than 5 matchups in the round: one button per region.
- 5 or fewer: one button per matchup that hasn't opened.

Only admins and moderators can press them. Buttons expire after 15 minutes.

#### Open by region

Use this for the Round of 32 and Round of 16, or to spread a round over several days:

```
/bracket open-matchup region:1 duration:24h
/bracket open-matchup region:2 duration:24h
```

::: warning
Opening a region only opens its matchups that haven't been voted on yet. Matchups already voting keep their votes, and decided ones keep their results; the reply lists them.
:::

#### Open single matchups

```
/bracket open-matchup matchup:1A
/bracket open-matchup matchup:1A,1B,2A duration:24h
/bracket open-matchup matchup:Finals duration:3d
```

Good for a "match of the day", or for spacing out the semifinals and final.

---

## Closing a Round

### `/bracket close`

```
/bracket close tiebreaker-duration:<time>
```

Closes every open matchup in the current round and moves the winners into the next round.

**Parameters:**
- `tiebreaker-duration` (optional): how long a tiebreaker vote runs, from `5m` to `7d`

If `tiebreaker-duration` is left out, the bot uses the default from the [setup form](./import), or 1h if the form didn't set one.

**Who can use:** members with the Administrator or Timeout Members permission only

**What happens:**
- The title with more votes wins each matchup.
- A tie starts a tiebreaker vote, or goes to the better seed if the tournament was created with `ties:Higher seed wins`.
- When every matchup in the round is closed, the tournament moves to the next round. Run `/bracket open` to start it.
- Closing the Finals ends the tournament and names the champion.

**Examples:**
```
/bracket close
/bracket close tiebreaker-duration:30m
```

**The reply:**
```
✅ Quarterfinals Closed
Closed 4 matchups

🏆 Winners
• 1A: The Thing wins 15–8
• 2A: Alien wins 12–11
• 3A: (2) Hereditary advances on a 4–4 tie as the higher seed
...
```

### Deadlines and reminders

Voting also closes by itself at the deadline, exactly as `/bracket close` would. Before that, the bot posts **⏰ Voting Closing Soon!** in the channel:

| Voting runs | Reminder |
|---|---|
| Under 30 minutes | 5 minutes after it opens |
| 30 minutes to 2 hours | 10 minutes after it opens |
| 2 to 6 hours | 1 hour before it closes |
| Over 6 hours | 2 hours before it closes |

A tie found at the deadline, when opening the next matchups closes earlier ones, or by a close button, gets a tiebreaker vote that runs for the tournament's tiebreaker time from the [setup form](./import) (1 hour if none is set). Only the close commands take `tiebreaker-duration`, and they use the same default.

### The results card

As each matchup closes, the bot posts its results card:

<DiscordCard name="matchup-results" />

*A matchup's results card. Its drawn picture goes underneath (see below)*

- **The split bar:** the vote as one bar between the two counts, the winner's share in green from the left and the runner-up's in orange. A tie the higher seed took is gold on both sides.
- **🏆 Winner** and **🥈 Runner-up**, each with their votes: the bot's own trophy and silver medal once its emoji are uploaded, plain 🏆 and 🥈 until then.
- **A note** when there's one: **🚨 Upset! (12) knocks out (5)** when a worse seed wins, or **🤝 Tied 4–4: the higher seed advances.**

Under the card is a picture of the matchup, drawn in the bot's own style:

- **The two posters face off** across a crackling lightning **VS**.
- **The winner's poster is larger,** in a gold-and-jade frame under a red **WINNER** sash with a trophy. The runner-up's is dimmed.
- **The vote split** is a gold bar from the left and a blue one from the right, with each side's share and votes above it.
- **An UPSET! stamp** marks a worse seed beating a better one. **"Tied: higher seed advances"** marks a tie the higher seed took.
- **A title with no poster** (or one that didn't load in time) gets a carved placeholder with its name instead.

<img class="result-image" src="/images/matchup-upset.webp" alt="A drawn matchup result for Semifinals 2A. Night of the Living Dead (1968), the 12 seed, is framed in gold under a red WINNER sash; Alien (1979), the 1 seed, is dimmed. A red UPSET! stamp sits between them, and the bar underneath splits 53%, 9 votes, to 47%, 8 votes." width="960" height="540" loading="lazy">

*The picture under a results card: the 12 seed beats the 1 seed, 9 votes to 8, so it's stamped an upset*

If the picture can't be drawn within 5 seconds, or the bot can't attach files in that channel, the card posts without it and shows the winner's poster as a small thumbnail instead.

Every way of closing a matchup posts this card and picture: the deadline, `/bracket close`, `/bracket close-matchup` (a typed `matchup` too, which also replies with the winners and a poster thumbnail), the close buttons, and opening the next matchups. A tiebreaker doesn't: its result shows the winner's poster as a thumbnail.

### Tiebreakers

A tied matchup gets a tiebreaker vote, posted in the same channel, with a button for each title. Anyone can vote and change their vote until it closes. Each option has a bar for its share of the votes: gold for the one ahead (or every one sharing the lead), blue for the rest.

It closes at its deadline, or when an admin runs `/bracket resolve-tiebreaker`. If it's still tied, including when nobody voted, one title is picked at random. The winner moves on, and the bot posts the bracket.

---

### Opening the next matchup closes earlier ones

When you open matchups, any others in the round still voting close first, exactly as their deadline would: winners are announced, and ties get a tiebreaker vote. Running a round one matchup at a time (`/bracket open matchups:1`, or `/bracket open-matchup matchup:1A`, then `1B`, …) therefore always has exactly one matchup voting, and earlier votes are locked in. To keep several voting together, open them in one go: `matchups:4`, `matchup:1A,1B`, or `region:1`.

The `matchup` option suggests the current round's matchups that haven't been voted on yet, with both titles, so you don't need to remember labels.

### How much time is left?

Ballots and the live standings show a countdown ("closes in 2 hours") that Discord keeps up to date. Anyone can also run `/bracket status` to see every open matchup and its time left, or `/bracket my-votes` for their own votes. If the voting card has scrolled out of sight, `/bracket voting-post` posts it again with its **Start Voting** button, and brings the live standings down with it (once every 10 minutes per channel; admins and mods any time).

### `/bracket close-matchup`

```
/bracket close-matchup matchup:<labels> tiebreaker-duration:<time>
/bracket close-matchup
```

Closes one or more open matchups and moves their winners on.

**Parameters:**
- `matchup` (optional): one label or several, comma-separated. Leave it out to pick from buttons showing each open matchup and its votes.
- `tiebreaker-duration` (optional): `5m` to `7d`. Same default as `/bracket close`.

**Who can use:** members with the Administrator or Timeout Members permission only

**Examples:**
```
/bracket close-matchup matchup:1A
/bracket close-matchup matchup:1A,2A tiebreaker-duration:30m
/bracket close-matchup
```

Each matchup it decides gets its [results card and picture](#the-results-card). If some tie and others don't, the reply lists the decided ones under **🏆 Decided** beside the tiebreakers, and the bot posts the bracket.

When the last matchup of a round closes, the tournament moves to the next round.

---

## Tournament Status

```
/bracket status
```

Shows the current round, each open matchup with the same bars and closing time as the live standings, and how many matchups are done. Up to 16 matchups fit, a whole Round of 32. It's a snapshot; the live standings card is the one that keeps updating.

**Who can use:** Everyone

<DiscordCard name="tournament-status" />

*`/bracket status` during a round*

---

## View the Bracket

```
/bracket view
```

Draws the tournament as an image.

**Who can use:** Everyone

- **During the knockout, and after it:** the bracket tree, each title on its poster. A winner is drawn slightly larger with a gold trophy, and appears in its next matchup as soon as it's decided. The champion gets a card with a trophy either side of CHAMPION.
- **Before the knockout:** an overview of the tournament's groups and titles.

**Posted for you as the tournament goes.** Whenever knockout matchups are decided, the bot posts the bracket as it now stands, under the results: **Bracket So Far**, then the **Final Bracket** with the champion. Matchups closing together (a whole round at its deadline) get one image, not one each. A tie posts its bracket once its tiebreaker decides it.

### The champion

Closing the Finals posts its results card and picture, then the **Final Bracket** with **Champion:** and the title. For a movie or TV tournament, the champion can also go straight onto the server's watchlist: turn on `auto-add-champion` in the [watchlist settings](/commands/watch-party#watchlist-settings).

---

## Fixing a Bracket

Groups tournaments only: `/bracket regenerate` rebuilds the knockout bracket from the group results. Seeding, wildcards, and matchups are worked out again, and any knockout voting already under way is discarded.

---

## Quick Reference

| Command | Purpose | Who Can Use |
|---------|---------|-------------|
| `/bracket open` | Open the current round, or the next few matchups | Admins/Mods |
| `/bracket close` | Close the current round and move winners on | Admins/Mods |
| `/bracket open-matchup` | Open one region or chosen matchups | Admins/Mods |
| `/bracket close-matchup` | Close chosen matchups | Admins/Mods |
| `/bracket resolve-tiebreaker` | Settle a tiebreaker now | Admins/Mods |
| `/bracket extend-voting` | Set a new deadline for the round | Admins/Mods |
| `/bracket status` | Progress and live vote bars | Everyone |
| `/bracket voting-post` | Post the voting card and live standings again | Everyone |
| `/bracket my-votes` | Your votes in what's open | Everyone |
| `/bracket view` | Bracket image | Everyone |
| Start Voting button | Vote in open matchups | Everyone |

---

**Related Pages:**
- [← Back to Brackets Overview](./)
- [Tournament Setup →](./setup)
- [Command Reference →](./commands)
- [Tips & Strategies →](./tips)

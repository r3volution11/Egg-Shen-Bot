---
title: Knockout Rounds - Tournament Brackets
description: Run single-elimination knockout rounds with the smart open and close commands, regional matchup labels, and automatic advancement.
---

# Knockout Rounds

Knockout rounds are single elimination, from Round of 32 through the Finals. A straight bracket is knockout from the start. A groups tournament reaches it when every group is closed and you run `/bracket open` (see [Starting the Knockout](./setup#starting-the-knockout)).

Most of the time you only need two commands:

```
/bracket open     # open the current round
/bracket close    # close it and move the winners on
```

For finer control, `/bracket open-matchup` and `/bracket close-matchup` work on single matchups or one region at a time.

## Regional Labels

Each round is split into **4 regions**, March Madness style. A matchup's label is its region number plus a letter:

| Round | Matchups | Labels |
|-------|----------|--------|
| Round of 32 | 16 | 1A–1D, 2A–2D, 3A–3D, 4A–4D |
| Round of 16 | 8 | 1A, 1B, 2A, 2B, 3A, 3B, 4A, 4B |
| Quarterfinals | 4 | 1A, 2A, 3A, 4A |
| Semifinals | 2 | 1A, 3A |
| Finals | 1 | Finals |

`/bracket status` shows the labels of open matchups. The button pickers described below show them too.

---

## Opening a Round

### `/bracket open`

```
/bracket open duration:<time>
```

Opens every matchup in the current round that has both titles in place.

**Parameters:**
- `duration` (optional) - How long voting stays open, from 5m to 30d. Examples: `30m`, `24h`, `3d`.

If `duration` is left out, the bot uses the default voting duration set in the [setup form](./import). If the form didn't set one, the default is 24h.

**Who can use:** Administrators and Moderators only

**Rounds with more than 5 matchups** (Round of 32, Round of 16) are too many for one voting session. `/bracket open` tells you to open them by region with `/bracket open-matchup` instead.

**Examples:**
```
/bracket open
/bracket open duration:48h
/bracket open duration:30m
```

### How members vote

The voting message has a **Start Voting** button. Clicking it opens a personal voting dashboard (only that member sees it):

- Every open matchup, with a button for each title
- A check mark next to each matchup already voted in
- Choices save right away and can be changed until the matchup closes

![Personal Voting Dashboard](/images/examples/tournaments/voting-dashboard.png)
*Personal voting dashboard with voting streak and stats*

Live vote counts are visible to everyone:

![Live Tournament Standings](/images/examples/tournaments/live-standings.png)
*Live standings with color-coded progress bars*

---

## Opening Part of a Round

### `/bracket open-matchup`

```
/bracket open-matchup matchup:<labels> duration:<time>
/bracket open-matchup region:<1-4> duration:<time>
/bracket open-matchup duration:<time>
```

**Parameters:**
- `matchup` (optional) - One label or several, comma-separated: `1A`, `2B,3A`, `Finals`
- `region` (optional) - 1 to 4. Opens every matchup in that region of the current round.
- `duration` (optional) - 5m to 30d. Same default as `/bracket open`.

**Who can use:** Administrators and Moderators only

**With nothing but `duration`**, the bot shows buttons:
- More than 5 matchups in the round: one button per region.
- 5 or fewer: one button per pending matchup.

Buttons expire after 15 minutes.

#### Open by region

Use this for Round of 32 and Round of 16, or to spread a round over several days:

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
- `tiebreaker-duration` (optional) - How long a tiebreaker vote runs, from 5m to 7d

If `tiebreaker-duration` is left out, the bot uses the default set in the [setup form](./import). If the form didn't set one, the default is 1h.

**Who can use:** Administrators and Moderators only

**What happens:**
- The title with more votes wins each matchup.
- A tied matchup starts a tiebreaker vote. The winner moves on when it resolves, at its deadline or through `/bracket resolve-tiebreaker`.
- When every matchup in the round is closed, the tournament moves to the next round. Run `/bracket open` to start it.
- Closing the Finals ends the tournament and names the champion.

Voting also closes by itself at the deadline, with a reminder posted beforehand.

**Examples:**
```
/bracket close
/bracket close tiebreaker-duration:30m
```

**Output:**
```
✅ Quarterfinals Closed
Closed 4 matchups

🏆 Winners
• 1A: The Thing (15 vs 8)
• 2A: Alien (12 vs 11)
...
```

![Round Complete Results](/images/examples/tournaments/round-complete.png)
*Round completion results with winner announcements*

---

### Opening the next matchup closes earlier ones

When you open matchups, any others in the round still voting close first, exactly as their deadline would: winners are announced, and ties get a tiebreaker vote. Running a round one matchup at a time (`/bracket open-matchup matchup:1A`, then `1B`, …) therefore always has exactly one matchup voting, and earlier votes are locked in. To keep several voting together, open them in one go: `matchup:"1A,1B"`, or `region:1`.

The `matchup` option suggests the current round's matchups that haven't been voted on yet, with both titles, so you don't need to remember labels.

### How much time is left?

Ballots and the live standings show a countdown ("closes in 2 hours") that Discord keeps up to date. Anyone can also run `/bracket status` to see every open matchup and its time left, or `/bracket my-votes` for their own votes.

### `/bracket close-matchup`

```
/bracket close-matchup matchup:<labels> tiebreaker-duration:<time>
/bracket close-matchup
```

Closes one or more open matchups and moves their winners on.

**Parameters:**
- `matchup` (optional) - One label or several, comma-separated. Leave it out to pick from buttons showing each open matchup and its vote count.
- `tiebreaker-duration` (optional) - 5m to 7d. Same default as `/bracket close`.

**Who can use:** Administrators and Moderators only

**Examples:**
```
/bracket close-matchup matchup:1A
/bracket close-matchup matchup:1A,2A tiebreaker-duration:30m
/bracket close-matchup
```

When the last matchup of a round closes, the tournament moves to the next round.

---

## Tournament Status

```
/bracket status
```

Shows the current phase, each open matchup's vote count and time left (⚠️ when under an hour), and how many matchups are done.

**Who can use:** Everyone

```
🏆 The Ultimate Horror Cup
Status: knockout | Phase: semifinals

📊 Active Matchups:

Matchup 1A - 15 votes
⏰ 18h 32m
  Leading: The Thing (9)
```

---

## View the Bracket

```
/bracket view
```

Draws the tournament as an image.

**Who can use:** Everyone

- During the knockout: the bracket tree, with each round, winners highlighted, and the champion once there is one.
- Before the knockout: an overview of the tournament's groups and titles.

---

## Fixing a Bracket

Groups tournaments only: `/bracket regenerate` rebuilds the knockout bracket from the group results. Seeding, wildcards, and matchups are worked out again, and any knockout voting already under way is discarded.

---

## Quick Reference

| Command | Purpose | Who Can Use |
|---------|---------|-------------|
| `/bracket open` | Open the current round | Admins/Mods |
| `/bracket close` | Close the current round and move winners on | Admins/Mods |
| `/bracket open-matchup` | Open one region or specific matchups | Admins/Mods |
| `/bracket close-matchup` | Close specific matchups | Admins/Mods |
| `/bracket resolve-tiebreaker` | Settle a tiebreaker early | Admins/Mods |
| `/bracket extend-voting` | Set a new deadline for the round | Admins/Mods |
| `/bracket status` | Progress and live vote counts | Everyone |
| `/bracket view` | Bracket image | Everyone |
| Start Voting button | Vote in open matchups | Everyone |

---

**Related Pages:**
- [← Back to Brackets Overview](./)
- [Tournament Setup →](./setup)
- [Command Reference →](./commands)
- [Tips & Strategies →](./tips)

---
title: Movie Night Bracket (8 Titles, One Evening) - Egg Shen Bot
description: Run an 8-title movie bracket in about an hour on Discord - create it, add the titles, then open and close three short voting rounds.
howto:
  name: Run an 8-title movie bracket in one evening
  timeText: an hour
  totalTime: PT1H15M
  steps:
    - name: Create the tournament
      text: Run `/bracket create name:"Friday Frights" max-titles:8`.
    - name: Add 8 titles
      text: Run `/bracket manage-titles action:add type:movie title:"The Thing"` once per title. After the first, you can leave `type` out.
    - name: Announce it
      text: Run `/bracket announce` so everyone knows a tournament is coming.
    - name: Open round one
      text: Run `/bracket open duration:20m`. All 4 quarterfinal matchups open on one ballot, and everyone votes by pressing **Start Voting**.
    - name: Repeat for each round
      text: When the 20 minutes are up, voting closes and the winners move on. Run `/bracket open duration:20m` again for the semifinals, then once more for the final.
---

# Movie Night Bracket

An 8-title bracket has three rounds: **quarterfinals** (4 matchups), **semifinals** (2) and the **final**. With 20-minute rounds, the whole tournament fits in an evening.

<QuickSteps />

## Tips

- **Short rounds work.** Voting can be as short as `5m`. Twenty minutes gives people time to see the ballot and vote.
- **Ending a round early.** If everyone has voted, `/bracket close` ends it now, without waiting for the deadline.
- **Showing the bracket.** The bot posts the bracket as an image after each round, and `/bracket view` draws it any time.
- **Checking time left.** Ballots show a live countdown, and anyone can run `/bracket status`.
- **Fewer than 8 titles is fine.** With 6, the bracket still has 8 slots, and two titles skip round one (a bye).
- **For a meaningful order,** choose Ordered seeding in the [setup form](/commands/brackets/import#seeding), so the strongest titles can only meet in the final. See [Seeded bracket](./seeded).

## In detail

### Why 8?

A straight bracket holds 2–32 titles, and each round halves them. Eight titles give three rounds, each small enough to fit on one ballot. That means `/bracket open` opens a whole round at once. A ballot holds up to 5 matchups, so bigger rounds are opened in parts; see [32-title bracket](./big-bracket).

### What voters see

Pressing **Start Voting** opens a private ballot with one row per matchup: `[1A · The Thing] (vs) [1A · Alien]`. Each row is its own head-to-head vote. People can change their pick until the round closes. A live standings message shows the running vote counts.

### When a matchup ties

The tied titles get a tiebreaker vote, posted in the same channel. It lasts 1 hour, or, when you close the round yourself with `/bracket close`, whatever you set with `tiebreaker-duration`. The next round opens once it's settled.

### Starting over

`/bracket cancel` ends the tournament. To run the same lineup again later, first save it with `/bracket export format:json`, then load it into the [setup form](/commands/brackets/import).

## Related

- [One matchup at a time](./one-at-a-time) to reveal the matchups one by one
- [Tournament FAQ](./faq)
- [Command reference](/commands/brackets/commands)

---
title: 32-Title Bracket Over a Week - Egg Shen Bot
description: Run a 32-title Discord tournament over a week or two - set it up from a spreadsheet, then open each round a few matchups or a region at a time.
howto:
  name: Run a 32-title bracket over a week
  timeText: 10 minutes to set up, then a week or two
  totalTime: P10D
  steps:
    - name: Set it up from a spreadsheet
      text: Run `/bracket setup-link`, open the link, choose a type, upload the [straight-bracket template](/templates/tournaments/straight-bracket.csv) with your 32 titles, check the matches and press **Create tournament**.
    - name: Announce it
      text: Run `/bracket announce`.
    - name: Open the first four matchups
      text: Run `/bracket open matchups:4 duration:1d`. Round one has 16 matchups, and a ballot holds up to 5, so open it in parts.
    - name: Open the next four each day
      text: Run `/bracket open matchups:4 duration:1d` again. The previous four close and their winners are announced as the next four open.
    - name: Continue through the rounds
      text: Keep running the same command. The round of 16 has 8 matchups (two batches of 4); the quarterfinals, semifinals and final fit on one ballot.
---

# 32-Title Bracket Over a Week

32 titles make five rounds: the **round of 32** (16 matchups), **round of 16** (8), **quarterfinals** (4), **semifinals** (2) and the **final**. That's 31 matchups in all.

<QuickSteps />

## Tips

- **One ballot holds 5 matchups**, so the first two rounds are opened in parts. `matchups:4` matches the bracket's four regions neatly.
- **Opening by region** works too: `/bracket open-matchup region:1` opens 1A–1D. It's the same four matchups as `matchups:4`.
- **Typing 32 titles is slow.** The [setup form](/commands/brackets/import) takes a spreadsheet and checks every match before saving.
- **Plan the pace.** With 4 matchups a day, the round of 32 takes 4 days and the round of 16 takes 2. Opening each later round whole takes 3 more, so about 9 days in total.
- **Remakes and sequels:** add a `year` column to your spreadsheet, so most titles match without picking.

## In detail

### Regions and labels

The bracket is split into four regions, labelled `1A`–`1D`, `2A`–`2D`, and so on. Region 1's winners meet region 2's in the semifinals, so the labels show where a matchup sits. `/bracket open-matchup` lists the matchups by label with their titles.

### Opening a whole round

`/bracket open` with no `matchups` opens a whole round, but only when it fits on one ballot (5 matchups or fewer). For bigger rounds it says so, and suggests `matchups:` or `region:`.

### Seeding

By default the bracket is shuffled. To decide who meets whom, choose **Ordered** seeding in the setup form and put your titles in order. See [Seeded bracket](./seeded).

## Related

- [Set up from a spreadsheet](./from-a-spreadsheet)
- [One matchup at a time](./one-at-a-time)
- [Knockout rounds reference](/commands/brackets/knockout)

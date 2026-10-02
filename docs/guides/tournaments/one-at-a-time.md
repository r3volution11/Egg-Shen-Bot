---
title: One Matchup at a Time - Egg Shen Bot
description: Reveal a Discord tournament one head-to-head matchup at a time with /bracket open matchups:1 - earlier votes lock as each new matchup opens.
howto:
  name: Run a tournament one matchup at a time
  timeText: a few minutes per matchup
  steps:
    - name: Set up the tournament
      text: Create it and add your titles as usual, with `/bracket create` and `/bracket manage-titles`, or with the [setup form](/commands/brackets/import).
    - name: Open the first matchup
      text: Run `/bracket open matchups:1 duration:1h`. It builds the bracket if needed and opens just the first matchup.
    - name: Let people vote
      text: Everyone presses **Start Voting**. The ballot shows that one matchup, with a countdown.
    - name: Open the next one
      text: Run `/bracket open matchups:1` again. The current matchup closes first and its winner is announced, then the next matchup opens.
    - name: Keep going to the final
      text: Repeat until the champion is crowned. When a round's last matchup closes, the same command moves on to the next round.
---

# One Matchup at a Time

Every vote is already one title against one title. This guide is about **how many of those matchups are open together**. Running them one at a time keeps the focus on a single head-to-head, and turns each matchup into its own small event.

<QuickSteps />

## Tips

- **Two or three at a time** work the same way: `matchups:2` or `matchups:3`. Up to 5, the most a ballot holds.
- **Earlier votes lock.** Opening the next matchup closes any earlier one still voting, so nobody can change a vote after the tournament has moved on.
- **A tie pauses the round.** It gets a tiebreaker vote. If the round has nothing else to open, the command says it's waiting on that tiebreaker.
- **Choosing a specific matchup:** use `/bracket open-matchup` and pick it from the list, which shows each matchup's titles. The same lock-in rule applies.
- **Long gaps are fine.** Each matchup can stay open as long as you like (`duration` takes `5m` up to `30d`), and its deadline closes it on its own.

## In detail

### What "next" means

Matchups open in bracket order: `1A`, `1B` and so on through `4D` in a 32-title round, then the next round from its first matchup. The reply shows the matchup's label and both titles, and how many are left in the round.

### Why opening one closes another

If earlier matchups stayed open, people could keep changing their votes on matchups everyone had moved past. So any matchup still voting closes, exactly as its deadline would: the winner is announced, or a tie goes to a tiebreaker. The reply lists what closed.

### Small brackets

This is the only way to run a small bracket (8 titles or fewer) one matchup at a time. Plain `/bracket open` would open the whole round together.

### Live standings

Each matchup gets its own live standings card, posted under it with the first vote and updated as people vote. Earlier matchups' cards stay where they were, showing their final tallies.

### Time left

The ballot and the live standings show a countdown that Discord keeps updated. `/bracket status` lists every open matchup and its time left, for anyone.

## Related

- [Movie night bracket](./movie-night): the whole round at once
- [32-title bracket](./big-bracket): a few matchups or a region at a time
- [Tournament FAQ](./faq)

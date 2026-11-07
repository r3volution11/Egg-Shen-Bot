---
title: Groups Tournament (World Cup Style) - Egg Shen Bot
description: Run a World Cup style Discord tournament - groups of 4 vote for their top 2, then the qualifiers play a knockout bracket to a champion.
howto:
  name: Run a groups tournament
  timeText: 15 minutes to set up, then a week or two
  totalTime: P10D
  steps:
    - name: Set up the groups
      text: Run `/bracket-setup setup-link`, upload the [groups template](/templates/tournaments/groups.csv) with a `group` letter on every title (4 titles per group), and press **Create tournament**.
    - name: Open the group stage
      text: Run `/bracket open duration:2d`. The groups open, up to 5 at a time, and voters pick their **top 2** in each group. With more than 5 groups, run `/bracket open` again once the first five close, for the next ones.
    - name: Close the groups
      text: When the deadline passes, the groups close and the results are posted. Or run `/bracket close` to end voting early.
    - name: Start the knockout
      text: Run `/bracket open` again. The top 2 from each group (plus the best third-place titles, if needed) go into a knockout bracket.
    - name: Play out the knockout
      text: Keep running `/bracket open` for each round. For a big first round, use `/bracket open matchups:4` to open it in parts.
---

# Groups Tournament

A groups tournament starts like the World Cup. Titles are split into **groups of 4**, everyone votes for their **top 2** in each group, and the qualifiers then play a normal knockout bracket.

<QuickSteps />

## Tips

- **Pick a group count with no byes:** 4, 6, 7, 8, 11 or 12 groups give a full knockout bracket (see the table below).
- **Every group needs exactly 4 titles** before voting can open. `/bracket open` names any group that's short.
- **Up to 5 groups vote at a time.** A ballot shows one row per group, and Discord allows 5. `/bracket open` opens the next 5 by itself, in letter order; run it again once they close. Or choose a batch with `/bracket open-groups groups:A,B,C,D,E`, which won't go past 5.
- **Both picks count, or neither.** A voter who picks only 1 title in a group has it thrown out when the group closes.
- **The setup form is easiest** for groups, since you can give each title its group letter in the spreadsheet. Leave a cell empty and the title goes into the first group with room.
- **With commands instead,** `/bracket-setup create max-titles:36` makes 9 groups, and `/bracket-setup resize groups:<4-12>` changes the count.
- **Ties in a group** for 1st or 2nd place get a tiebreaker vote before the knockout can start. A tie for 3rd is settled at random.
- **Seeding and tie options are for straight brackets.** Here, the group results seed the knockout. With 48 titles it's the 2026 World Cup format: 12 groups, then a Round of 32. See [Sports-style tournaments](./sports-styles#fifa-world-cup).

## In detail

### How many titles reach the knockout

The top 2 of each group always qualify. When that doesn't fill a bracket of 8, 16 or 32, the best third-place titles (**wildcards**) fill the gap. Any slots still empty become byes for group winners.

| Groups | Titles | Wildcards | Knockout | Byes |
| --- | --- | --- | --- | --- |
| 4 | 16 | 0 | 8 | 0 |
| 5 | 20 | 5 | 16 | 1 |
| 6 | 24 | 4 | 16 | 0 |
| 7 | 28 | 2 | 16 | 0 |
| 8 | 32 | 0 | 16 | 0 |
| 9 | 36 | 9 | 32 | 5 |
| 10 | 40 | 10 | 32 | 2 |
| 11 | 44 | 10 | 32 | 0 |
| 12 | 48 | 8 | 32 | 0 |

### Opening groups in batches

`/bracket open` opens the groups that haven't voted yet, the next ones in letter order, with at most 5 voting at once, and says which are still to come. While 5 are voting, it opens nothing until some close. To choose a batch, use `/bracket open-groups groups:A,B,C`. It refuses, and opens nothing, if that would make more than 5 voting. A group that has closed is never reopened.

A member's ballot keeps the groups it was opened with. When the next batch opens, they press **Start Voting** on its message for those groups.

### Group results

When a group closes at its deadline, its results card lists the four titles in order with their votes, 🥇 🥈 🥉 then 📍, and marks the top two **✅ Advances**. Closing groups yourself, with `/bracket close` or `/bracket close-groups`, posts each decided group's top three in one reply instead, with a **🔀 Tiebreakers** field for any ties.

### Starting the knockout

Once every group has closed and every tiebreaker is settled, `/bracket open` builds the knockout bracket. With 4 groups, its first round has 4 matchups and opens straight away. With 5 or more, it has more matchups than a ballot holds, so the bot builds the bracket and asks you to open it with `matchups:` or `region:`. `/bracket open matchups:4` builds and opens the first four in one step.

## Related

- [Setup & group stage reference](/commands/brackets/setup)
- [32-title bracket](./big-bracket), for pacing a big knockout
- [Tournament FAQ](./faq)

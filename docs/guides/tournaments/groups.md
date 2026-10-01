---
title: Groups Tournament (World Cup Style) - Egg Shen Bot
description: Run a World Cup style Discord tournament - groups of 4 vote for their top 2, then the qualifiers play a knockout bracket to a champion.
howto:
  name: Run a groups tournament
  timeText: 15 minutes to set up, then a week or two
  totalTime: P10D
  steps:
    - name: Set up the groups
      text: Run `/bracket setup-link`, upload the [groups template](/templates/tournaments/groups.csv) with a `group` letter on every title (4 titles per group), and press **Create tournament**.
    - name: Open the group stage
      text: Run `/bracket open duration:2d`. Every group opens, and voters pick their **top 2** in each group.
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
- **The setup form is easiest** for groups, since you can give each title its group letter in the spreadsheet. Leave a cell empty and the title goes into the first group with room.
- **With commands instead,** `/bracket create max-titles:36` makes 9 groups, and `/bracket resize groups:<4-12>` changes the count.
- **Ties in a group** for 1st or 2nd place get a tiebreaker vote before the knockout can start.

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

`/bracket open` opens every group that hasn't voted yet. To stagger them, use `/bracket open-groups groups:"A,B,C"`, then open the rest later with `/bracket open`. A group that has closed is never reopened.

### Starting the knockout

Once every group has closed and every tiebreaker is settled, `/bracket open` builds the knockout bracket. With 4 groups, its first round has 4 matchups and opens straight away. With 6 or more, it has 8 or 16, more than a ballot holds, so the bot builds the bracket and asks you to open it with `matchups:` or `region:`. `/bracket open matchups:4` builds and opens the first four in one step.

## Related

- [Setup & group stage reference](/commands/brackets/setup)
- [32-title bracket](./big-bracket), for pacing a big knockout
- [Tournament FAQ](./faq)

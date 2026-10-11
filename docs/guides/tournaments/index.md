---
title: Tournament Quick Guides - Egg Shen Bot
description: Short, step-by-step guides for the most popular ways to run a movie, TV, game, board game or book tournament on Discord with Egg Shen Bot.
---

# Tournament Quick Guides

Pick the guide that matches what you want to run. Each one starts with the handful of commands you need, then explains the details.

| I want to… | Guide | Titles | Takes about |
| --- | --- | --- | --- |
| Run a quick bracket in one evening | [Movie night bracket](./movie-night) | 8 | An hour |
| Show people one matchup at a time | [One matchup at a time](./one-at-a-time) | Any | As long as you like |
| Run a big bracket over a week or two | [32-title bracket](./big-bracket) | 32 | 1–2 weeks |
| Start with groups, World Cup style | [Groups tournament](./groups) | 16–48 | 1–2 weeks |
| Load all the titles from a spreadsheet | [Set up from a spreadsheet](./from-a-spreadsheet) | Any | 10 minutes to set up |
| Make the best titles meet late, with seeds and upsets shown | [Seeded bracket](./seeded) | 2–32 | 5 minutes to set up |
| Run it like March Madness, the College Football Playoff, the NFL or the World Cup | [Sports-style tournaments](./sports-styles) | 12–48 | Depends on the style |

Questions such as "why does the ballot show several matchups?" or "how long is left?" are answered in the [Tournament FAQ](./faq).

## The basics, in four lines

- **Every vote is head-to-head:** one title against one title. The winner moves on, and each round halves the field until one champion is left.
- **Admins and moderators set it up** with `/bracket-setup` (create, add titles, announce) and **run it** with `/bracket`. **Everyone votes** by pressing **Start Voting**.
- **`/bracket open` always opens the next thing to vote on**, and `/bracket close` ends voting early. Deadlines also close voting on their own.
- **One tournament per server** at a time. Run `/bracket cancel` to start over.

## Seeding and ties, at a glance

When you create a straight bracket, you choose how much seeding counts. None of it is on unless you pick it.

| Option | Choices | What it does |
| --- | --- | --- |
| `seeding` | **Random** (default) · **The order I add them** · **By rating** | Random shuffles the titles. The other two rank them, so seed 1 meets the lowest seed, the top seeds can only meet late, and byes go to the top. Seeds are shown, for example **(1) Halloween**, and upsets are called out. |
| `ties` | **Runoff vote** (default) · **Higher seed wins** | What a tied matchup does: a short extra vote, or the better seed goes through. Higher seed wins needs Ordered or By rating seeding. |

```
/bracket-setup create name:"Horror Madness" max-titles:16 seeding:By rating ties:Higher seed wins
```

Not sure which to pick? [Sports-style tournaments](./sports-styles) matches each choice to a format you know, from March Madness to the World Cup.

For every command and option, see the [command reference](/commands/brackets/commands).

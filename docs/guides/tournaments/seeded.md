---
title: Seeded Bracket - Egg Shen Bot
description: Seed a Discord tournament bracket March Madness style - by your own order or by rating - show the seeds, call out upsets, and optionally let ties go to the higher seed.
howto:
  name: Set up a seeded bracket
  timeText: 5 minutes
  totalTime: PT5M
  steps:
    - name: Create the tournament with seeding
      text: Run `/bracket-setup create` and pick **seeding** - **By rating** to rank the titles automatically, or **The order I add them** to set the order yourself. Optionally pick **ties:Higher seed wins**.
    - name: Add your titles
      text: Add titles with `/bracket-setup manage-titles`, or upload a spreadsheet on the `/bracket-setup setup-link` form. For your own order, put the strongest title first; the form's ↑ ↓ buttons reorder.
    - name: Open it
      text: Run `/bracket open`. Round one pairs the best seed with the worst, and every matchup shows each title's seed.
---

# Seeded Bracket

By default, the bracket is shuffled when it's built, so anyone can meet anyone in round one. Seeding works the way it does in college sports: titles are ranked, the favourites meet as late as possible, everyone can see the seeds, and an upset looks like one.

How much seeding counts is your choice as the tournament's creator. None of it is switched on unless you pick it.

<QuickSteps />

## Tips

- **Pick where the seeds come from.** Choose **Random** (the default), **your own order**, or **By rating**.
- **Seeds show everywhere a matchup does.** That includes the ballot, the vote buttons, results, the live standings and the bracket image, for example **(1) Halloween vs (8) Hereditary**.
- **Upsets get called out.** When a worse seed wins, the result post says **🚨 Upset! (8) knocks out (1)**.
- **Ties can go to the higher seed.** This is optional. See [Ties](#ties).
- **Seeds 1 and 2 can only meet in the final.** They start in opposite halves of the bracket.
- **Byes go to the top seeds.** With 12 titles in a 16-slot bracket, seeds 1–4 skip round one.
- **Straight brackets only.** In a [groups tournament](./groups), the knockout is seeded from the group results.

## In detail

### Where the seeds come from

| Seeding | What it does |
| --- | --- |
| **Random** | Shuffles the titles when the bracket is built. No seeds are shown. This is the default. |
| **Your order** | The order you add the titles in is the seed order: the first title is seed 1. On the setup form, the ↑ ↓ buttons reorder titles. In `/bracket-setup create` this is called **The order I add them**, and on the form and in a file it's **Ordered**. |
| **By rating** | The bot ranks the titles by their rating, best first. Movies and TV use TMDB, games use RAWG, board games use BoardGameGeek, and books use Google Books. Titles with no rating go last, in the order they were added, and `/bracket status` lists them while you're still setting up. Equal ratings keep the order they were added in. |

Choose seeding in `/bracket-setup create` (the `seeding` option), on the [setup form](/commands/brackets/import#seeding), or with `"seeding"` in a tournament file.

### Ties

Normally a tied matchup gets a short runoff vote. With **Higher seed wins** (`ties` in `/bracket-setup create`, **Ties** on the setup form), a tie goes straight to the better seed instead: no runoff and no wait. The result says so, for example "Tied 4–4: the higher seed advances."

Higher seed wins needs a seeded bracket. With Random seeding, the seeds mean nothing, so ties always get a runoff whatever you choose.

### Who plays whom

Round one pairs seeds that add up to the bracket size plus one. In an 8-title bracket that's **1 v 8, 4 v 5, 2 v 7, 3 v 6**, in that order down the bracket. The 1-v-8 and 4-v-5 winners meet in one semifinal, and the 2-v-7 and 3-v-6 winners in the other.

### Changing it later

Until voting starts, run `/bracket-setup setup-link` again to reorder the titles or change seeding and ties, then save. Once round one is open, the bracket is fixed. A tournament that was already running before these options existed carries on exactly as it was.

## Related

- [Sports-style tournaments](./sports-styles): which settings give March Madness, the College Football Playoff, the NFL or the World Cup
- [Set up from a spreadsheet](./from-a-spreadsheet)
- [Setup form: Seeding](/commands/brackets/import#seeding)

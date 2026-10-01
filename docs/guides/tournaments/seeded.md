---
title: Seeded Bracket - Egg Shen Bot
description: Seed a Discord tournament bracket so the top titles can only meet late - order the titles in the setup form and choose Ordered seeding.
howto:
  name: Set up a seeded bracket
  timeText: 10 minutes
  totalTime: PT10M
  steps:
    - name: Open the setup form
      text: Run `/bracket setup-link` and open the link.
    - name: List your titles in seed order
      text: Upload a spreadsheet or add titles on the page, with your strongest title first. Use the ↑ ↓ buttons to reorder.
    - name: Choose Ordered seeding
      text: Under **Seeding**, choose **Ordered**. The first title is seed 1, the second is seed 2, and so on.
    - name: Create and open it
      text: Press **Create tournament**, then run `/bracket open` in Discord. Round one pairs the best seed with the worst.
---

# Seeded Bracket

By default, the bracket is shuffled when it's built, so anyone can meet anyone in round one. Seeding puts the bracket in an order you choose, so the favourites meet as late as possible.

<QuickSteps />

## Tips

- **Seeds 1 and 2 can only meet in the final.** They start in opposite halves of the bracket.
- **Byes go to the top seeds.** With 12 titles in a 16-slot bracket, seeds 1–4 skip round one.
- **Straight brackets only.** In a [groups tournament](./groups), the knockout is seeded from the group results.
- **Seeding is set in the setup form.** Tournaments made with `/bracket create` are shuffled.

## In detail

### Who plays whom

Round one pairs seeds that add up to the bracket size plus one. In an 8-title bracket that's **1 v 8, 4 v 5, 2 v 7, 3 v 6**, in that order down the bracket. The 1-v-8 and 4-v-5 winners meet in one semifinal, and the 2-v-7 and 3-v-6 winners in the other.

### Changing the order later

Until voting starts, run `/bracket setup-link` again, reorder the titles and save. Once round one is open, the bracket is fixed.

## Related

- [Set up from a spreadsheet](./from-a-spreadsheet)
- [Setup form: Seeding](/commands/brackets/import#seeding)

---
title: Play the Games - Egg Shen Bot
description: Start playing Egg Shen Bot's Discord games - make your first /foodfight, /doom, /rescue or /potion play, read the points, stay inside the limits and earn your first prize item.
howto:
  name: Play the games and earn your first prize
  timeText: a few minutes to start
  totalTime: PT5M
  steps:
    - name: Take the tour
      text: Run `/how-to-play`. Only you see it. Use its menu, or ◀ Previous and Next ▶, to read about items, prizes, titles, nights, twists, happenings and sieges.
    - name: Make a play
      text: Run `/foodfight throw target:@Sam`. The reply shows what happened and the points. A hit is +3 for you and −1 for Sam.
    - name: Help someone too
      text: Run `/foodfight feed target:@Sam`, or `/rescue attempt target:@Sam`. A tasty meal or a rescue scores for you both, and a rescue also shields them from the next `/doom` for an hour.
    - name: Mind the limits
      text: Each game can be played once every 20 seconds, and 6 plays a minute in all. The first 20 plays of each game a day (UTC) score. After that you can keep playing just for fun.
    - name: Watch your counters
      text: Run `/scoreboard`. Under **Rewards in progress**, each counter shows how close you are, like `07/25` hits toward a Golden Pie.
    - name: Use your prize
      text: Your 25th hit brings a Golden Pie and +3. Use it with `/foodfight throw target:@Sam item:Golden Pie` for a sure hit, with your points doubled.
    - name: Come back tomorrow night
      text: One scored play a night builds your nights in a row. At 3 nights you're a Regular, with +1 on your first 3 good plays a day, and you earn a Night Light.
---

# Play the Games

Five games, one idea: every play has an outcome, and every outcome moves points. Here's how to start, and how the points turn into prizes.

<QuickSteps />

## In detail

### Hurts and helps

Each game that hurts has one that helps. Aim at a member, a role or @everyone. Only a member scores as "them".

| Game | Hurts | Helps |
| --- | --- | --- |
| Food Fight | `/foodfight throw target:@Sam` | `/foodfight feed target:@Sam` |
| Doom | `/doom fate target:@Sam` | `/rescue attempt target:@Sam` |
| Potions | `/potion give user:@Sam type:poison` | `/potion give user:@Sam type:health` |

A play can also miss or backfire, and then it costs you. Good plays in a row build a 🔥 streak, and a bad one ends it. Points are kept for this month, this year and all time. The full table is in [Playing & Points](/commands/games-playing#points).

The fifth game, `/siege`, has no target: a monster attacks and the whole server fights it. See [Fight a siege](./siege).

### What the reply says

<DiscordCard name="game-play" />

Anything else that happened goes on extra lines underneath: an item used, a prize, a title, a twist.

### Why a play didn't score

The games have [limits](/commands/games-playing#limits) so nobody can farm them. A play refused for the cooldown or the per-minute limit is answered privately and doesn't count. A play past the daily cap goes ahead, but it scores nothing, uses no item and moves no counter. Admins can change these numbers, and `/how-to-play` shows the ones your server uses.

### Prizes, items and titles

- **Prizes:** every 25 hits, 15 tasty feeds, 25 dooms, 15 rescues, 15 helpful potions or 20 harmful potions earns that game's item and +3. Every 750 points earns a random item. At most 2 prizes a day. See [Prizes](/commands/games-rewards#prizes).
- **Items** wait in your Glovebox, on your card. Add `item:` to a play to use one: one a play, 3 a day. Garlic, the Antidote and the Night Light work by themselves. See [The Glovebox and items](/commands/games-rewards#the-glovebox-and-items).
- **Titles** are badges for things you've done a lot, or had done to you, each worth +10 once. Show one beside your name with `/scoreboard title:Pie Sniper`. See [Titles](/commands/games-rewards#titles).

### Twists and happenings

Now and then a [twist](/commands/games-happenings#twists) happens to the player after a scored play: a few points, an item, or something worse. And sometimes a [happening](/commands/games-happenings#happenings) changes the games for the whole server for a while, like a Full Moon that makes every doom score double. Both are announced in the replies, so you'll know when one hits.

## Related

- [Fight a siege](./siege)
- [Games FAQ](./faq)
- [Games & Scores](/commands/games), every rule and number, page by page

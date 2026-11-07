---
title: Your Card & the Leaderboard - Egg Shen Bot
description: The game card from /scoreboard or right-click → Apps → Game card, with points, ranks, streaks, prizes in progress, nights in a row, the Glovebox and titles, and /leaderboard, the server's top players by month, year and all time.
kit: true
kitHeadings:
  scoreboard: chart
  game-card-right-click: people
  leaderboard: trophy
---

# Your Card & the Leaderboard

Everyone has a **game card**: one look at what they've scored, what they're close to earning, and what they're carrying. The server has one too, the **leaderboard**. Both are drawn with the bot's own icons and bars once its emoji are uploaded (it does that itself on its first start), and in plain emoji until then.

## Scoreboard

```
/scoreboard user:[member] game:[game] period:[period] private:[true/false]
```

Your game card, or anyone's:

<DiscordCard name="game-card" />

Top to bottom, it shows:

- **Their name and avatar**, the avatar in the top corner.
- **Total and rank:** 🪙 `42` points · 🥈 `2nd` of 7 players. The top three get a medal. The title they show is under it.
- **A column for each game they've played:** their points and rank in it, how many plays, what they did (2 🎯 · 1 💨), what they received (Received: 1 💀), and their 🔥 streak, the one running now and their best.
- **A happening line** under their total for each [happening](./games-happenings#happenings) in progress: `🌕 Full Moon: dooms score double · ends in 40 minutes`. A calendar day says "all day". It's on every card, since it changes what the next play is worth for everyone.
- **A siege line** after the happenings, while a monster is attacking: its HP bar, when it ends, and their damage and place in the fight (`you: 48 damage, 2nd`), or an invitation to join in. From evening pace on it also shows their attacks tonight. It's on the all-games card and the Siege card.
- **🌀 In effect:** a rescue shield and when it runs out, then any [twist status](./games-happenings#statuses): what it does, and the plays it has left or when it ends (`🍿 Free Refill: +1 on each good play · 2 plays left`).
- **🎁 Rewards in progress:** each [prize](./games-rewards#prizes) counter you've started, closest first, with a bar, the item it pays and its bonus points (`07/25`). One held by the 2-a-day limit shows a purple bar and "tomorrow".
- **🌙 Nights in a row:** your last 14 nights in two rows of seven, your row and best row, your tier and what it pays ([Nights in a row](./games-rewards#nights-in-a-row)).
- **🧰 Glovebox:** the [items](./games-rewards#the-glovebox-and-items) they hold. A passive item says so, or when it's ready again after it fired.
- **📜 Titles:** how many they've [earned](./games-rewards#titles), as badges, then the next few they're closest to, with their counts.
- **The footer** names the period and how to open anyone's card.

Options:

| Option | What it does |
|---|---|
| `user` | Whose card. Default: yours |
| `game` | One game, or all of them (the default). With one game, the total and rank are for that game alone |
| `period` | This month, this year, or all time (the default) |
| `title` | Pick which [earned title](./games-rewards#choosing-the-title-you-show) shows with your name, or *No title*. Only for yourself |
| `private` | `private:true` and only you see it. Otherwise it's posted in the channel |

```
/scoreboard
/scoreboard user:@Sam period:month
/scoreboard game:siege
/scoreboard title:Pie Sniper
```

A card for one game shows only that game's counters, the shown title and any happening line (and the siege line, on the Siege card). The nights, Glovebox, titles and twist statuses are on the all-games card. Games turned off on the server are left out of the card, its total and its rank. Someone who hasn't played gets a card that says so.

### Game card (right-click)

To see anyone's card without typing a command, right-click them (on mobile, open their profile) → **Apps** → **Game card**. It's the same card as `/scoreboard user:`, all games, all time, and only you see it.

## Leaderboard

```
/leaderboard game:[game] period:[period] private:[true/false]
```

The server's game card, in one gold embed with the leader's avatar in the top corner:

<DiscordCard name="game-leaderboard" />

- **The standings:** the top 15, one line each, with a medal for the top three, their name, the badge of the title they show, a short bar against the leader's points, and their points. Bars are left out when nobody is above zero, and on a very full card.
- **Leading each game:** a column per game, with who leads it and their points. Only with all games shown.
- **Most received:** 🎯 most splatted, 🍽️ best fed, 💀 most doomed, 🛟 most rescued, ☠️ most poisoned and 💚 most healed, each with how many.
- **Server stats:** plays and points in the period, how many players, the most played game (all games only), the best streak, and, once there's been one, the [sieges](./games-siege) won and the ones that got away (all games and Siege).
- **In progress:** any [happening](./games-happenings#happenings) running now and when it ends, and a [siege](./games-siege) under attack with its HP bar (`🟢 The Blob is attacking! 🟩🟩🟩⬜⬜ 412/980 HP · ends in 30 minutes`). It's there even on a card nobody has played on yet.

Names are shown, not mentions, so nobody is pinged. Someone who has left the server keeps their place under the name Discord still knows them by, or the one they last played under. Games turned off on the server are left out of everything. The footer points to `/scoreboard` for your own card.

```
/leaderboard period:month
/leaderboard game:doom period:year
```

Points reset for the month on the 1st (UTC), so the monthly leaderboard is a fresh race every month, while the yearly and all-time ones keep counting.

## Related

- [Playing & Points](./games-playing): where the points come from
- [Items, Prizes & Titles](./games-rewards): the prizes, Glovebox, titles and nights on your card
- [Statistics](/features/statistics): `/stats`, the bot's usage numbers, which is a different thing

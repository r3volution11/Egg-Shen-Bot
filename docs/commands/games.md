---
title: Games & Scores - Egg Shen Bot
description: Points for /potion, /foodfight, /doom and /rescue, with items from the Glovebox, prizes, titles and nights in a row, twists and server-wide happenings, personal scoreboards, a server leaderboard by month, year and all time, rescue shields, and admin limits, happening and channel rules.
---

# Games & Scores

`/potion`, `/foodfight`, `/doom` and `/rescue` are games. Every play has an outcome, every outcome moves points, and everyone can see who's winning with `/scoreboard` and `/leaderboard`. Play enough and you earn [items](#the-glovebox-and-items), [prizes](#prizes), [titles](#titles) and a [nights-in-a-row](#nights-in-a-row) streak. Now and then a [twist](#twists) happens to a player, and the whole server sometimes lives through a [happening](#happenings) that bends the games for a while.

Each game that hurts has one that helps:

| Game | Hurts | Helps |
|---|---|---|
| Potions | `/potion give` a harmful potion | `/potion give` a helpful potion |
| Food Fight | `/foodfight throw` | `/foodfight feed` |
| Doom | `/doom fate` | `/rescue attempt`, which also shields them from the next doom |

How each command plays is described in [Social Commands](./social).

---

## Points

Each play posts its line with the points underneath:

> 🥧 @Sam winds up like a Three Stooges short and plants a cream pie square on @Alex. *Nyuk nyuk nyuk.*
> -# 🎯 Hit! Sam +3 (42 pts · 🔥 3 in a row) · Alex −1

| Game | Outcome | You | Them |
|---|---|---|---|
| Food fight: throw | 🎯 Hit | +3 | −1 |
| | 💨 Miss | −1 | +1 |
| | 🔄 Backfire | −2 | +2 |
| Food fight: feed | 😋 Tasty | +1 | +2 |
| | 🤢 Gross | −1 | −1 |
| | 💦 Spill | −2 | +1 |
| Doom | 💀 Doomed | +3 | −1 |
| | 🏃 Escaped | −1 | +2 |
| | 🔄 Backfired | −2 | +1 |
| | 🛡️ Blocked | 0 | 0 |
| Rescue | 🛟 Rescued | +1 | +2, and a shield |
| | 🪤 Caught | −1 | −1 |
| | 🕯️ Sacrificed | −2 | +3, and a shield |
| Potion | 💚 Helpful, worked | +1 | +2 |
| | ☠️ Harmful, worked | +2 | −2 |
| | 🔄 Backfired | −2 | +1 |

- **"Them" is only scored when it's a member.** Aim at a role, @everyone or yourself and only your own points move.
- **Streaks:** good outcomes in a row (a hit, a doom, a tasty meal, a rescue, a potion that worked) build a 🔥 streak; a bad one ends it. Your best streak is on your scoreboard.
- **Points are kept for this month, this year and all time** (UTC), so a new month gives everyone a fresh start without losing the all-time record.
- **Rewards add lines** under the points: an item you used, a defence that fired, a prize, a title, or a nights milestone. Their points are [bonus points](#bonus-points) or part of the play's points, and they're in your total.

### Shields

A rescue that works (rescued or sacrificed) shields the member you saved for an hour. The next scoring `/doom` aimed at them is blocked: nobody scores, and the shield is used up. A doom from someone past their daily scoring cap is worth nothing either way, so it plays as usual and the shield stays up. You can't rescue yourself, and rescuing a role or @everyone shields nobody. You can still doom yourself through your own shield, if you really want to.

---

## The Glovebox and items

Everyone has a **Glovebox**. It holds **items**: small one-use helpers you earn by playing ([Prizes](#prizes)). You use some on purpose, and some work by themselves when they're needed. Items can't be traded or given away, and what you hold is shown on your card for everyone to see.

### The items

| Item | Holds | Kind | What it does |
|---|---|---|---|
| 🥧 Golden Pie | 3 | You use it | **`/foodfight throw`:** a sure hit (no miss, no backfire), and your points ×2. **`/foodfight feed`:** always tasty, and you both get +2 more. |
| 📼 Cursed VHS | 2 | You use it | **`/doom fate`:** can't backfire, and your points ×2. It cuts through a rescue shield (using it up) and through Garlic. |
| 💧 Holy Water | 2 | You use it | **`/rescue attempt`:** can't be caught, you get +2 more, and the shield you give lasts 3× as long. |
| 🍀 Lucky Penny | 3 | You use it | **`/potion give`:** the potion always works (no backfire), and your points ×2. |
| 🧄 Garlic | 1 | By itself | A `/doom` aimed at you that would land turns into an escape. Then it's used up, and another can't work for 12 hours. |
| 💊 Antidote | 2 | By itself | A harmful potion that works on you does you no harm, and whoever gave it gets +1 instead of +2. Then it's used up, and another can't work for 6 hours. |
| 🔦 Night Light | 1 | By itself | Saves your [nights in a row](#nights-in-a-row) when you miss one night. At most once in any 7 days. |

- **"Points ×2" only doubles your gains.** Your losses, and the other person's points, are never doubled. However many things multiply a play, your gains stop at ×3.
- **Holds** is how many you can carry. A prize that doesn't fit isn't lost: it turns into **+2 points** instead.
- **The trope names in `/rescue`** (Holy Water, Garlic, Silver Bullet) are only flavour. They have nothing to do with the items.

### Using an item

Add `item:` to the play. It works on throw, feed, fate, attempt and give:

```
/foodfight throw target:@Sam item:Golden Pie
/foodfight feed target:@Sam item:Golden Pie
/doom fate target:@Sam item:Cursed VHS
/rescue attempt target:@Sam item:Holy Water
/potion give user:@Sam type:poison item:Lucky Penny
```

Click the option and Discord suggests what you can use: **only items you hold that fit that play**, with how many you have and what each does (`🥧 Golden Pie ×2 · can't miss, points ×2`). If there's nothing to use, it says so, and choosing that plays with no item. You can also just type the name, in any case and with or without its emoji, or a part only one item has (`pie`, `water`).

The limits:

- **One item per play.**
- **3 items a day** (UTC). After the third, the list says they work again tomorrow.
- **Not on a play past the daily scoring cap.** The play goes ahead for fun, the item isn't used, and the reply says it stayed in your Glovebox.
- **Garlic, the Antidote and the Night Light aren't picked.** They work by themselves.

If you ask for an item you don't hold (you're told how to earn one), one that doesn't fit the play, or a fourth in a day, you're told privately. The play doesn't happen and your cooldown isn't spent.

### Defences

Three things can stand between a member and a play aimed at them: a **rescue shield** ([Shields](#shields)), **Garlic** (against `/doom`) and the **Antidote** (against a harmful potion).

- **One defence per play.** The shield comes first: a shielded member is blocked, and Garlic stays unused.
- **At most 3 defences a day** per member, with the shield, Garlic and Antidote counted together. After that, plays land as usual, so nobody becomes immune.
- **Only for plays aimed at you.** You can doom yourself through your own shield, and Garlic and the Antidote don't work on a role or @everyone.
- **The Cursed VHS cuts through** both the shield and Garlic.
- **Defences need a scoring play.** Against someone past their daily scoring cap, the shield, Garlic and the Antidote don't fire. That play is worth nothing anyway, so nothing is used up and it doesn't count toward the 3.

When Garlic turns a doom into an escape, it's scored like any escape: the doomer −1, you +2.

---

## Prizes

Keep playing and the games pay you back. Each kind of play has a **counter**. Reach its number and you get an item and a few bonus points. The counter then starts again, and anything over carries on.

| Every | You get |
|---|---|
| 25 food fight hits | 🥧 Golden Pie, +3 |
| 15 tasty feeds | 🧄 Garlic, +3 |
| 25 dooms (doomed) | 📼 Cursed VHS, +3 |
| 15 rescues (rescued or sacrificed) | 💧 Holy Water, +3 |
| 15 helpful potions that worked | 💊 Antidote, +3 |
| 20 harmful potions that worked | 🍀 Lucky Penny, +3 |
| 750 points gained | A random item |
| Nights in a row: 3, then every 7 more | 🔦 Night Light ([Nights in a row](#nights-in-a-row)) |

- **Only your own plays count.** A hit counts when you throw it, not when you're hit. The one exception is the points counter, which also counts the positive points you gain when someone else's play helps you.
- **Only plays that score.** Plays past the daily scoring cap don't move a counter.
- **"Points" means play points.** Bonus points never feed the 750-point counter.
- **Counters started at 0** on the day rewards reached your server. Nobody was handed items for earlier plays.
- **A full Glovebox turns the item into points.** You still get the +3, plus +2 for the item that didn't fit.

### Two prizes a day

Each member is paid at most **2 prizes a day** (UTC), Night Lights aside. If a counter reaches its number after you've had two, it **waits** one short, `24/25`. The first play that adds to it on a later day brings the prize. The play tells you:

> -# 🎁 Hits 24/25 · the prize counter's full tonight (2 a day). Sam's next one tomorrow (UTC) brings it.

### Seeing your progress

Your [card](#scoreboard) has a **Rewards in progress** section. It lists each counter you've started, closest to done first, with a bar, the item it pays and its bonus points. A counter that's waiting has a purple bar and says "tomorrow".

> `07/25` 🟩🟩⬜⬜⬜⬜⬜⬜ 🥧 Golden Pie `+3` · Hits

When you earn a prize, the play's message says so, under the points line.

---

## Titles

A title is a badge for something you've done a lot, or had done to you a lot. Each is earned once, from your all-time numbers, and is worth **+10 bonus points** when you earn it. Only plays that score count toward a title. Plays past the daily scoring cap don't, whether you made them or they were aimed at you, and they neither extend nor break the streak the streak titles count.

**What you do**

| Title | You need |
|---|---|
| 🥧 Pie Sniper | 150 food fight hits |
| 🍳 Lunch Lady | 75 tasty feeds |
| 💀 The Grim Reaper | 1,000 dooms |
| 🔪 Final Girl | 100 rescues (rescued or sacrificed) |
| 🕯️ Martyr Complex | 30 sacrifices |
| 🧪 Mad Scientist | 150 potions that worked, helpful or harmful |
| 🩺 Night Nurse | 75 helpful potions that worked |
| 🔄 Boomerang | 150 backfires (a thrown backfire, a spilled meal, a backfired doom or potion) |

**What gets done to you**

| Title | You need |
|---|---|
| 🎯 Human Dartboard | Be hit by food 150 times |
| 👕 Red Shirt | Be doomed 100 times |
| 🍽️ Designated Taster | Be fed 50 times (tasty or gross) |
| 🐹 Guinea Pig | Be given 150 potions that worked, helpful or harmful |
| 🪢 Professional Hostage | Be rescued 100 times (rescued, or sacrificed for) |
| 🪳 Cockroach | Escape a doom 50 times |

**Streaks, nights and twists**

| Title | You need |
|---|---|
| 🔥 On Fire | A streak of 10 in a row, in any game |
| 🌋 Unstoppable | A streak of 15 in a row, in any game |
| 🦉 Night Owl | 7 [nights in a row](#nights-in-a-row) |
| 🌕 Creature of the Night | 14 nights in a row |
| 🧟 Undead Regular | 30 nights in a row |
| 🎲 Plot Twist | 30 [twists](#twists) happen to you |

Titles take a while. Your card shows the ones you're closest to, with your count.

### Choosing the title you show

```
/scoreboard title:Pie Sniper
/scoreboard title:No title
```

You can show **one earned title** beside your name. Pick it from the list, which holds only titles you've earned, or choose **No title** to hide it. The bot shows your card afterwards so you can see it (add `private:true` to keep it to yourself).

- **It's your own choice.** You can't set anyone else's title.
- **It shows on your card**, under your total, and **on your row of the [leaderboard](#leaderboard)** as its badge.
- **Earned titles stay earned.** Hiding one doesn't lose it.
- **Members who had already qualified** when rewards arrived were given those titles quietly: no announcement, and no +10. Everything they'd played before then still counts toward the rest.

---

## Nights in a row

Play on night after night and you build a row. Any play that scores keeps tonight alive, and one a night is enough.

A night runs from **12:00 UTC to 12:00 UTC**, not midnight to midnight. A US evening watch party carries on past midnight UTC, and that should still be one night, not two. (12:00 UTC is 7 am in New York in winter, 8 am in summer, and 4 or 5 am in Los Angeles.) Daily limits, like the scoring cap, still reset at midnight UTC.

Your card shows the last 14 nights, in two rows of seven:

| | |
|---|---|
| 🌕 | Played |
| 🔦 | Saved by a Night Light |
| 🌑 | Missed |
| 🌗 | Tonight, no play yet |

### Tiers

The longer the row, the more your good plays pay. A **good play** is a hit, a tasty meal, a doom, a rescue, or a potion that worked. You get **+1 bonus point on your first few good plays each day** (UTC):

| Row | Tier | +1 on your first |
|---|---|---|
| 3 nights | 🌙 Regular | 3 good plays a day |
| 7 nights | 🦉 Night Owl | 4 good plays a day |
| 14 nights | 🌕 Creature of the Night | 5 good plays a day |

Under 3 nights the card says "New Moon: no bonus yet". Miss a night and the row starts over, unless a Night Light saves it. Your best row is kept, and it counts toward the nights [titles](#titles).

### The Night Light

You earn a 🔦 **Night Light** at 3 nights in a row, then at 10, 17, 24 and so on. You can hold one. If you already have one, you get +2 points instead.

Miss exactly **one** night and the Night Light burns when you next play. The missed night shows 🔦 and your row carries on instead of breaking, though that night doesn't add to the count. Miss two nights in a row and nothing saves it. A Night Light can't burn more than once in 7 days. It works by itself, and it doesn't count toward the 2 prizes a day.

---

## Bonus points

**Bonus points** are the points the rewards give you:

- a prize's **+3**, and the **+2** when your Glovebox was full
- a title's **+10**
- the **+1** from your nights tier
- the **+2** for a Night Light you had no room for
- the points a [twist](#twists) gives or takes, a Free Refill's **+1**, a Mosquito bite's **−1**, and Friday the 13th's **+1** on good plays

They're added to the game you were playing, so they're part of that game's points, your total and your place on the leaderboard, for the month, the year and all time. The card doesn't show them separately.

What an item does (×2, +2 more) isn't bonus. It's just that play's points. The same goes for a [happening](#happenings) that doubles a score, and for Director's Cut and Bitten.

---

## Twists

A **twist** is a small surprise that happens to the player who just played, never to the person they aimed at. It might be good (a raccoon drops some change) or bad (the raccoon takes your wallet). Each one adds a line under the play:

> -# 🎲 Twist! 💰 Loose Change: Sam digs through the seat cushions and finds a few bucks and a Junior Mint of unknown age. Sam +3.

**The chance.** Every play that scores has a **4% chance** of a twist, a bit over one play in 25. An admin can change that, or switch twists off ([Happenings and twists](#happenings-and-twists)). A blocked `/doom` and a play past the daily scoring cap never twist. Some happenings make twists likelier: Intermission ×3 and Halloween Night ×2.

**The protections.** Twists are a joke at your expense, not a way to lose a month:

- **3 twists a day** per member (UTC).
- **After a bad twist, the next one is always good.**
- **Twists can take at most 8 points a day** from you, all of them together (Pickpocketed, The Call and each Mosquito bite). They can never take your month below 0. When a cap trims a loss, the line says "(all a twist can take)".
- **A twist that would do nothing isn't drawn.** Pickpocketed and The Call need points left to take, Reel Change needs points on the play, and Brain Freeze needs a streak.
- **The Night Light is safe.** A Car Break-In never takes it. If you have nothing it can take, you get a Mosquito Swarm instead.
- **A twist's points are [bonus points](#bonus-points)**, in the game you were playing.

### The 16 twists

| Twist | | What it does |
|---|---|---|
| 💰 Loose Change | Good | +3 points |
| 🌟 Fan Favorite | Good | +5 points |
| 🎁 Glovebox Find | Good | A random item lands in your Glovebox (one of the six prize items). A full one turns it into +2 points |
| 🍀 Lucky Break | Good | Your next play can only go well. Ends a Jinx |
| 🍿 Free Refill | Good | +1 on each of your good plays for the next 3 plays |
| 🎬 Director's Cut | Good | Your next good play scores double (your gains stop at ×3, as always) |
| 🔥 Second Wind | Good | Your next bad play won't break your streak |
| 👻 Friendly Ghost | Good | Safe from `/doom` for 30 minutes, like a rescue shield |
| 🦝 Pickpocketed | Bad | −3 points |
| 📞 The Call Is Coming From Inside the House | Bad | −4 points |
| 🚗 Car Break-In | Bad | A random item is stolen from your Glovebox |
| 🧛 Bitten | Bad | Your gains are halved (rounded down) for the next 3 plays |
| 🐈‍⬛ Jinxed | Bad | Your next play rolls twice and keeps the worse result. Ends a Lucky Break |
| 🦟 Mosquito Swarm | Bad | −1 on each of your next 3 plays |
| 🎞️ Reel Change | Bad | The points you just earned on this play are gone. Prizes, titles and bonuses it also earned stay |
| 🧊 Brain Freeze | Bad | Your streak in this game is over |

A little more than half are good before the "good after bad" rule tips it further.

### Statuses

Seven twists leave a **status** instead of acting once: Lucky Break, Free Refill, Director's Cut, Second Wind, Bitten, Jinxed and Mosquito Swarm. A status changes your *next* plays, not the one it came on. It shows under **In effect** on your [card](#scoreboard), and a play it changed says so under the points:

> -# 🧛 Bitten: Sam's +3 is halved to +1 (2 more).

- **It runs out after 24 hours** if you haven't used it, or sooner when its plays are used up.
- **It's used on plays that score.** A blocked `/doom` or a play past the daily cap doesn't use it.
- **A repeat refreshes it.** A second Bitten while you're Bitten puts you back at 3 plays and a fresh 24 hours. It doesn't stack.
- **Lucky Break and Jinxed cancel each other.** Whichever came last is the one you have.
- **Second Wind waits for a streak.** A bad play with no streak to save doesn't use it up.

### Plot Twist

Have 30 twists happen to you and you earn the 🎲 **Plot Twist** [title](#titles), worth +10 bonus points. Only twists on plays that score count.

---

## Happenings

A **happening** is something that changes the games for the whole server for a while: a full moon that doubles dooms, a fog that makes throws miss. Everyone playing during it is affected, and it ends by itself.

### The random ones

A happening starts on its own, with a new message in a games channel saying what's changed and when it ends. There are eight:

| Happening | Lasts | What changes |
|---|---|---|
| 🌕 Full Moon | 1 hour | `/doom` scores double, both ways (🌕×2) |
| 🍻 Happy Hour | 1 hour | `/foodfight feed` is gross or spilled half as often, and a tasty one scores double |
| 🌫️ The Fog | 45 minutes | `/foodfight throw` misses far more often (a hit is 40% less likely, a miss twice as likely) |
| 🎞️ Double Feature | 30 minutes | Every point in every game counts twice (🎞️×2) |
| 🌅 Sunrise | 1 hour | Rescues are caught half as often, and a shield lasts twice as long |
| 🧪 Mad Scientist Hour | 1 hour | Potions backfire half as often |
| 📼 Be Kind, Rewind | 1 hour | A bad outcome doesn't break your streak |
| 🎪 Intermission | 45 minutes | Twists are three times as likely |

Double Feature is the rarest. A multiplier still stops where the others do: your gains at ×3, your losses at ×2. So Double Feature on a Golden Pie is ×3, not ×4.

### The calendar days

Two days are happenings all day (UTC), with no announcement:

| Day | What changes |
|---|---|
| 🎃 Halloween Night (31 October) | Twists are twice as likely |
| 🔪 Friday the 13th | Bad outcomes are more likely, but every good play scores +1 |

The first play you make that day says so under the points: `🎃 Halloween Night: twists are twice as likely today.`

### How often, and when

By default a busy server sees about **one random happening a day**. An admin can make them [rarer or more frequent](#happenings-and-twists), or turn them off. Whatever the setting:

- **One at a time.**
- **At least 2 hours** between the end of one and the start of the next.
- **At most 3 a day** (UTC).
- **Only when people are playing.** At least 2 members must have played in the last 30 minutes (3 for Double Feature).
- **A real full moon helps.** On the night of the real full moon (a day either side, by the lunar calendar), Full Moon is 4 times as likely to be the one that starts.

An admin can also start one by hand. That skips the frequency, the gap and the daily limit, but it still counts as one of the day's 3.

### Where it's announced

The bot posts a new message with an embed, in the first of these that works:

1. The channel an admin chose for happenings
2. The games channel, if the games are limited to just one
3. The channel the games were last played in
4. For one an admin starts, the channel they ran the command in

Each has to be a channel where the games can be played, and one where the bot has View Channel, Send Messages and Embed Links. The message pings nobody. When the happening ends, the bot edits the same message to say so, so the end doesn't notify anyone.

If the bot can't announce it, or was offline when it started (it never announces one more than 2 minutes late), the happening still happens. Every play it changes shows its tag.

### How it shows on a play

A play a happening changed carries the happening's tag beside the outcome, so a doubled score never looks like a mistake:

> -# 💀 Doomed! 🌕×2 Sam +6 (48 pts) · Alex −2

Some happenings add a line as well:

> -# 📼 Be Kind, Rewind: Sam's streak survives.
> -# 🔪 Friday the 13th: Sam +1.

### When it stops

A happening's effects stop **exactly** at its end time. The bot checks the clock on every play, so one that ends late (a slow bot, a message that didn't edit) can't stretch past it.

---

## Scoreboard

```
/scoreboard user:[member] game:[game] period:[period] private:[true/false]
```

Your game card, or anyone's. It shows:

- **Their name and avatar**, the avatar in the top corner.
- **Total and rank:** 🪙 `42` points · 🥈 `2nd` of 7 players. The top three get a medal.
- **A column for each game they've played:** their points and rank in it, how many plays, what they did (2 🎯 · 1 💨), what they received (Received: 1 💀), and their 🔥 streak, the one running now and their best.
- **A happening line** under their total for each [happening](#happenings) in progress: `🌕 Full Moon: dooms score double · ends in 40 minutes`. A calendar day says "all day". It's on every card, since it changes what the next play is worth for everyone.
- **In effect:** a rescue shield and when it runs out, then any [twist status](#statuses): what it does, and the plays it has left or when it ends (`🍿 Free Refill: +1 on each good play · 2 plays left`).
- **Rewards in progress:** each [prize](#prizes) counter you've started, with a bar, the item it pays and its bonus points (`07/25`). One held by the 2-a-day cap shows a purple bar and "tomorrow".
- **Nights in a row:** your last 14 nights, your row and best row, your tier and what it pays ([Nights in a row](#nights-in-a-row)).
- **Glovebox:** the items they hold. A passive item says so, or when it's ready again after it fired.
- **Titles:** how many they've earned, as badges, then the next few they're closest to, with their counts. The title they show is under their total.
- **The footer** names the period and how to open anyone's card.

Options:

- `user`: whose card (default: yours)
- `game`: one game, or all of them (default). With one game, the total and rank are for that game alone.
- `period`: this month, this year, or all time (default)
- `title`: pick which [earned title](#choosing-the-title-you-show) shows with your name, or *No title*. Only for yourself.
- `private:true`: only you see it. Otherwise it's posted in the channel.

A card for one game shows only that game's counters, the shown title and any happening line. The nights, Glovebox, titles and twist statuses are on the all-games card. Games turned off on the server are left out of the card, its total and its rank. Someone who hasn't played gets a card that says so.

### Game card (right-click)

To see anyone's card without typing a command, right-click them (on mobile, open their profile) → **Apps** → **Game card**. It's the same card as `/scoreboard user:`, all games, all time, and only you see it.

## Leaderboard

```
/leaderboard game:[game] period:[period] private:[true/false]
```

The server's game card, in one gold embed with the leader's avatar in the top corner:

- **The standings:** the top 15, one line each, with a medal for the top three, their name, the badge of the title they show, a short bar against the leader's points, and their points. Bars are left out when nobody is above zero, and on a very full card.
- **Leading each game:** a column per game, with who leads it and their points. Only with all games shown.
- **Most received:** 🎯 most splatted, 🍽️ best fed, 💀 most doomed, 🛟 most rescued, ☠️ most poisoned and 💚 most healed, each with how many.
- **Server stats:** plays and points in the period, how many players, the most played game (all games only), and the best streak.
- **In progress:** any [happening](#happenings) running now and when it ends. It's there even on a card nobody has played on yet.

Names are shown, not mentions, so nobody is pinged. Someone who has left the server keeps their place under the name Discord still knows them by, or the one they last played under. Games turned off on the server are left out of everything. The footer points to `/scoreboard` for your own card.

```
/leaderboard period:month
/leaderboard game:doom period:year
```

---

## Limits

So the games stay fun and can't be farmed:

- **Cooldown:** each game once every 20 seconds per person. Switching games is fine: throw some food, then give a potion straight away.
- **Per minute:** 6 plays a minute per person, across all the games.
- **Daily scoring cap:** the first 20 plays of each game each day (UTC) score points. After that you can keep playing, just for fun. Rewards need scoring plays: past the cap, items aren't used, defences don't fire, and prize counters, title counts and nights don't move.
- **Items, prizes and defences:** 3 items used, 2 prizes paid and 3 defences fired per member each day (UTC). See [Items](#the-glovebox-and-items) and [Prizes](#prizes).
- **Twists:** 3 a day per member, and at most 8 points taken a day. See [Twists](#twists).
- **Happenings:** one at a time, 2 hours apart, 3 a day. See [Happenings](#happenings).

A play that's refused for a limit is answered privately and doesn't count. The bot's general rate limit doesn't apply to the games, since they have their own; a per-command rate limit set for one of them still does.

---

## Game Settings (Admin/Mod)

### Limits

```
/eggshen-config-games limits
/eggshen-config-games limits cooldown-seconds:30 per-minute:4
/eggshen-config-games limits daily-scored-plays:10 shield-minutes:30
```

With no options it shows the current settings. `shield-minutes:0` turns shields off.

### Where games can be played

```
/eggshen-config-games channels
/eggshen-config-games channels mode:only add:#games
/eggshen-config-games channels mode:except add:#announcements
/eggshen-config-games channels remove:#games
/eggshen-config-games channels mode:all
```

- **Every channel** (default)
- **Only listed channels:** the games work just in the channels you list
- **All except listed channels:** keep them out of, say, #announcements

A thread counts as its channel. Someone playing in the wrong place is told privately where the games are played. `/scoreboard` and `/leaderboard` work anywhere.

### Turning a game off

```
/eggshen-config commands toggle setting:rescue enabled:false
```

Each game has its own switch (`potion`, `foodfight`, `doom`, `rescue`) beside every other command's. A game turned off disappears from `/eggshen-help`, `/scoreboard` and `/leaderboard`.

### Happenings and twists

```
/eggshen-config-games happenings
/eggshen-config-games happenings frequency:rare
/eggshen-config-games happenings channel:#games
/eggshen-config-games happenings twists:false
/eggshen-config-games happenings twist-percent:2
/eggshen-config-games happenings enabled:false
/eggshen-config-games happenings start:fullmoon
/eggshen-config-games happenings end:true
```

With no options it shows the current settings: whether happenings and twists are on, how often, where they're announced, what's on now (and today's calendar happening), and the last few. You can set several options at once. Only you see the reply.

| Option | What it does |
|---|---|
| `enabled` | Happenings on or off. Off also turns off Halloween Night and Friday the 13th, and ends one in progress (its announcement is edited to say so). Default on |
| `frequency` | How often random happenings start: **Off** (only when you start one), **Rare** (half as often), **Normal** (about one a day when busy), **Often** (twice as often). The [limits](#how-often-and-when) still hold |
| `channel` | Where happenings are announced. A text or announcement channel where the games can be played, and where the bot can View, Send and Embed Links. If it can't use it, the reply warns you. Without one, see [Where it's announced](#where-its-announced) |
| `twists` | [Twists](#twists) on or off. Default on |
| `twist-percent` | The chance of a twist on a scored play, from 0 to 15. Default 4 |
| `start` | Start a happening now, and announce it. It runs its normal length. Only one runs at a time, so end the current one first. Needs `enabled` on |
| `end` | End the current happening now |

Use `end:true` and `start:` together to swap one for another. Each `start` counts toward the day's 3.

Turning twists off stops new twists. A status someone already has keeps running until it's used or runs out.

### Resetting scores

```
/eggshen-config-games reset-scores confirm:yes
/eggshen-config-games reset-scores confirm:yes game:doom
/eggshen-config-games reset-scores confirm:yes user:@Sam
```

Erases scores for good: everyone's, one game's, one person's, or one person's game. What goes with them:

- **Everyone, or one person:** everything of theirs. That's their scores, Glovebox, prize counters, titles, nights row, shield, twist statuses and counts, and today's limits.
- **One game** (everyone's, or one person's): that game's scores and its prize counters start over. Titles and the Glovebox stay, and so do the Points counter, nights, twist statuses and the count toward Plot Twist. Titles already earned stay earned, though progress toward the ones not yet earned in that game starts again.

---

## Related Documentation

- [Social Commands](./social) - How each game plays, and adding your server's own lines
- [Admin Configuration](./configuration) - Every other server setting

---
title: Items, Prizes & Titles
description: What Egg Shen Bot's Discord games pay you back. Glovebox items like the Golden Pie, Cursed VHS, Silver Bullet and Jade Charm, and how to use one, prizes for every few plays, titles with badges, and nights in a row with the Night Light.
kit: true
kitHeadings:
  the-glovebox-and-items: glove
  prizes: gift
  titles: scroll
  nights-in-a-row: moon
---

# Items, Prizes & Titles

Keep playing and the games pay you back. Plays fill **prize counters** that hand out **items** for your **Glovebox**, big totals earn **titles** with badges, and playing night after night builds a **nights in a row** bonus. All of it shows on your [game card](./games-card).

<DiscordCard name="game-play-rewards" />

## The Glovebox and items

Everyone has a **Glovebox**. It holds **items**: small one-use helpers you earn by playing ([Prizes](#prizes)), from a lucky twist, or as siege loot. You use some on purpose, and some work by themselves when they're needed. Items can't be traded or given away, and what you hold is shown on your card for everyone to see.

### The items

| Item | Holds | Kind | What it does |
|---|---|---|---|
| 🥧 Golden Pie | 3 | You use it | **`/foodfight throw`:** a sure hit (no miss, no backfire), and your points ×2. **`/foodfight feed`:** always tasty, and you both get +2 more. |
| 📼 Cursed VHS | 2 | You use it | **`/doom fate`:** can't backfire, and your points ×2. It cuts through a rescue shield (using it up) and through Garlic. |
| 💧 Holy Water | 2 | You use it | **`/rescue attempt`:** can't be caught, you get +2 more, and the shield you give lasts 3× as long. |
| 🍀 Lucky Penny | 3 | You use it | **`/potion give`:** the potion always works (no backfire), and your points ×2. |
| 🥈 Silver Bullet | 2 | You use it | **`/siege attack`, any weapon:** can't backfire, and the damage ×3 (×5 against The Wolfman). It's won as [siege loot](./games-siege#rewards-and-the-penalty) and every 4 siege wins ([Prizes](#prizes)), and it does nothing outside a siege. |
| 🧄 Garlic | 1 | By itself | A `/doom` aimed at you that would land turns into an escape. Then it's used up, and another can't work for 12 hours. |
| 💊 Antidote | 2 | By itself | A harmful potion that works on you does you no harm, and whoever gave it gets +1 instead of +2, and no [Chi](./games-magic#chi). In a [siege](./games-siege#it-fights-back), it cures the monster's poison the moment it lands. Then it's used up, and another can't work for 6 hours. |
| 🔦 Night Light | 1 | By itself | Saves your [nights in a row](#nights-in-a-row) when you miss one night. At most once in any 7 days. |
| 🧿 Jade Charm | 1 | By itself | Turns aside the next [hex](./games-magic) cast on you: the caster's Chi and cast are spent, and nothing lands (it still counts as one of the 2 hexes you can take that day). Then it's used up, and another can't work for 24 hours. It counts as one of your 3 defences that day. Earned every 12 [blessings that pay off](#prizes); it's never a random prize or loot, and a Car Break-In never takes it. |

- **In a siege, items work differently.** Golden Pie, Cursed VHS and Lucky Penny narrow the outcome but don't double anything, and the Silver Bullet multiplies damage. See [Items in a siege](./games-siege#items-in-a-siege).
- **"Points ×2" only doubles your gains.** Your losses, and the other person's points, are never doubled. However many things multiply a play, your gains stop at ×3.
- **Holds** is how many you can carry. A prize that doesn't fit isn't lost: it turns into **+2 points** instead.
- **The trope names in `/rescue`** (Holy Water, Garlic, Silver Bullet) are only flavour. They have nothing to do with the items.

### Using an item

Add `item:` to the play. It works on throw, feed, fate, attempt and give, and on `/siege attack`:

```
/foodfight throw target:@Sam item:Golden Pie
/foodfight feed target:@Sam item:Golden Pie
/doom fate target:@Sam item:Cursed VHS
/rescue attempt target:@Sam item:Holy Water
/potion give user:@Sam type:poison item:Lucky Penny
/siege attack weapon:food item:Golden Pie
```

Click the option and Discord suggests what you can use: **only items you hold that fit that play**, with how many you have and what each does (`🥧 Golden Pie ×2 · can't miss, points ×2`). If there's nothing to use, it says so, and choosing that plays with no item. You can also just type the name, in any case and with or without its emoji, or a part only one item has (`pie`, `water`).

The limits:

- **One item per play.**
- **3 items a day** (UTC), siege attacks included. After the third, the list says they work again tomorrow.
- **Not on a play past the daily scoring cap** (for a siege, [30 attacks a day](./games-playing#limits)). The play goes ahead for fun, the item isn't used, and the reply says it stayed in your Glovebox.
- **Garlic, the Antidote, the Night Light and the Jade Charm aren't picked.** They work by themselves.

If you ask for an item you don't hold (you're told how to earn one), one that doesn't fit the play, or a fourth in a day, you're told privately. The play doesn't happen and your cooldown isn't spent.

### Defences

Four things can stand between a member and a play aimed at them: a **rescue shield** ([Shields](./games-playing#shields)), **Garlic** (against `/doom`), the **Antidote** (against a harmful potion), and a 🌫️ **Smoke Screen** [blessing](./games-magic#the-twelve-charms) (against any harmful play: a throw misses, a doom escapes, a harmful potion does no harm). The 🧿 Jade Charm guards against a hex rather than a play.

- **One defence per play.** The shield comes first: a shielded member is blocked, and Garlic stays unused.
- **At most 3 defences a day** per member, with the shield, Garlic and Antidote counted together. After that, plays land as usual, so nobody becomes immune.
- **Only for plays aimed at you.** You can doom yourself through your own shield, and Garlic and the Antidote don't work on a role or @everyone.
- **The Cursed VHS cuts through** both the shield and Garlic.
- **Defences need a scoring play.** Against someone past their daily scoring cap, the shield, Garlic and the Antidote don't fire. That play is worth nothing anyway, so nothing is used up and it doesn't count toward the 3.
- **Smoke Screen fires last,** after the shield, Garlic and the Antidote, so it's never wasted on a play another one stopped. The Cursed VHS cuts through it too.
- **The Jade Charm counts toward the 3** like the others: with 3 defences fired today, a hex lands as usual.
- **A stopped play earns no [Chi](./games-magic#chi).** Whoever made it still gets its points (a harmful potion's +1), but nothing for the bag.

When Garlic turns a doom into an escape, it's scored like any escape: the doomer −1, you +2.

## Prizes

Each kind of play has a **counter**. Reach its number and you get an item and a few bonus points. The counter then starts again, and anything over carries on.

| Every | You get |
|---|---|
| 25 food fight hits | 🥧 Golden Pie, +3 |
| 15 tasty feeds | 🧄 Garlic, +3 |
| 25 dooms (doomed) | 📼 Cursed VHS, +3 |
| 15 rescues (rescued or sacrificed) | 💧 Holy Water, +3 |
| 15 helpful potions that worked | 💊 Antidote, +3 |
| 20 harmful potions that worked | 🍀 Lucky Penny, +3 |
| 750 points gained | A random item |
| 12 of your [blessings](./games-magic#the-caster-s-pay) that paid off | 🧿 Jade Charm, +3 |
| 4 [siege](./games-siege) wins | 🥈 Silver Bullet, +10 |
| Nights in a row: 3, then every 7 more | 🔦 Night Light ([Nights in a row](#nights-in-a-row)) |

- **Only your own plays count.** A hit counts when you throw it, not when you're hit. The one exception is the points counter, which also counts the positive points you gain when someone else's play helps you.
- **Blessings count for whoever cast them,** when they [pay off](./games-magic#the-caster-s-pay), whoever they helped. Hexes never count. Where the Six-Demon Bag is switched off, the counter isn't shown.
- **Only plays that score.** Plays past the daily scoring cap don't move a counter.
- **Siege wins** count when a won siege pays you (at most [2 a day](./games-siege#rewards-and-the-penalty)), and the Silver Bullet they bring doesn't count toward the 2 prizes a day.
- **"Points" means play points.** Bonus points never feed the 750-point counter. The points from each [siege attack](./games-siege#what-each-weapon-does) count; the payout when a siege ends is bonus, so it doesn't.
- **Counters started at 0** on the day rewards reached your server. Nobody was handed items for earlier plays.
- **A full Glovebox turns the item into points.** You still get the +3, plus +2 for the item that didn't fit.

### Two prizes a day

Each member is paid at most **2 prizes a day** (UTC), Night Lights aside. If a counter reaches its number after you've had two, it **waits** one short, `24/25`. The first play that adds to it on a later day brings the prize. The play tells you:

> -# 🎁 Hits 24/25 · the prize counter's full tonight (2 a day). Sam's next one tomorrow (UTC) brings it.

### Seeing your progress

Your [card](./games-card#scoreboard) has a **🎁 Rewards in progress** section. It lists each counter you've started, closest to done first, with a bar, the item it pays and its bonus points. A counter that's waiting has a purple bar and says "tomorrow".

> `07/25` 🟩🟩⬜⬜⬜⬜⬜⬜ 🥧 Golden Pie `+3` · Hits

When you earn a prize, the play's message says so, under the points line.

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
| 🎲 Plot Twist | 30 [twists](./games-happenings#twists) happen to you |

**Sieges**

| Title | You need |
|---|---|
| 🗡️ Monster Hunter | Fight in 10 [sieges](./games-siege) that are won |
| 🏆 Siege MVP | Be the [Wang Chi](./games-siege#the-wang-chi-and-the-jack-burton) of a won siege, once |
| 🥋 Wang Chi | Be the Wang Chi of 5 won sieges |
| 👑 Legend of the Drive-In | Be the Wang Chi of 10 won sieges |
| 🤠 Everybody Relax, I'm Here | Land the Jack Burton 10 times |
| 🦖 Kaiju Killer | Fight in a won siege against the Atomic Lizard, once |
| 🩹 Field Medic | Free or cure 15 fighters in sieges, together, with plays that score |
| 🍖 Monster Chow | Get grabbed by a siege monster 10 times |

Monster Hunter, Siege MVP, Wang Chi, Legend, Everybody Relax and Kaiju Killer count wins, not attacks, so they move only when a siege ends in a win. Every fighter in a won siege gets the win. The [Wang Chi](./games-siege#the-wang-chi-and-the-jack-burton) is whoever helped most (it replaced the MVP in 2.75, and MVPs from before count toward these titles); the Jack Burton is whoever landed the killing blow. Field Medic and Monster Chow count [what the monster does](./games-siege#it-fights-back) and who you save.

**The Six-Demon Bag**

| Title | You need |
|---|---|
| 🎒 All That Kind of Thing | Have [blessings](./games-magic) of all six elements pay off. "Wind, fire, all that kind of thing!" |

Hexing earns no title.

Titles take a while. Your card shows the ones you're closest to, with your count.

### Choosing the title you show

```
/scoreboard title:Pie Sniper
/scoreboard title:No title
```

You can show **one earned title** beside your name. Pick it from the list, which holds only titles you've earned, or choose **No title** to hide it. The bot shows your card afterwards so you can see it (add `private:true` to keep it to yourself).

- **It's your own choice.** You can't set anyone else's title.
- **It shows on your card**, under your total, and **on your row of the [leaderboard](./games-card#leaderboard)** as its badge.
- **Earned titles stay earned.** Hiding one doesn't lose it.
- **Members who had already qualified** when rewards arrived were given those titles quietly: no announcement, and no +10. Everything they'd played before then still counts toward the rest.

## Nights in a row

Play on night after night and you build a row. Any play that scores keeps tonight alive, and one a night is enough.

A night runs from **12:00 UTC to 12:00 UTC**, not midnight to midnight. A US evening watch party carries on past midnight UTC, and that should still be one night, not two. (12:00 UTC is 7 am in New York in winter, 8 am in summer, and 4 or 5 am in Los Angeles.) Daily limits, like the scoring cap, still reset at midnight UTC.

Your card shows the last 14 nights, in two rows of seven: 🌕 played, 🔦 saved by a Night Light, 🌑 missed, and 🌗 tonight, no play yet.

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

## Related

- [Your Card & the Leaderboard](./games-card): where all of this shows
- [Siege](./games-siege): loot, the Silver Bullet and the siege titles
- [Twists & Happenings](./games-happenings): a Glovebox Find, a Car Break-In, and Plot Twist
- [Games FAQ](/guides/games/faq): items, titles and nights, answered

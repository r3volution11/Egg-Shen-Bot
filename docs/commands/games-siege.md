---
title: Siege - Egg Shen Bot
description: Every rule of /siege, the monster the whole Discord server fights together. Starting one, attacking with food, dooms and potions, the 11 monsters, grabs and poison, the pace (a week-long campaign by default), the nightly report, the Wang Chi and the Jack Burton, backing a fighter, rewards and the pot, random sieges and how tough it is.
kit: true
kitHeadings:
  starting-a-siege: upset
  fighting: vs
  the-monsters: siege
  it-fights-back: rescue
  pace: clock
  random-sieges: dice
  how-a-siege-ends: trophy
  the-wang-chi-and-the-jack-burton: wang
  backing-a-fighter: back
  rewards-and-the-penalty: gift
  the-siege-card: chart
  the-daily-report: scroll
---

# Siege

A monster crawls out of the screen and attacks the drive-in. Everyone in the server fights it together with food, dooms and potions. Beat it before the time runs out and everyone who fought is paid. The biggest honour goes to the **Wang Chi**, whoever did the most to keep the others in the fight, and the killing blow earns the **Jack Burton**: a laugh and a small bonus. Let it get away and everyone who fought loses a few points.

Nobody is the target, so there's no one to annoy: the monster takes the hits. Only the attacker is scored.

<DiscordCard name="siege-arrival" />

By default a siege is a **campaign over a week**: everyone gets 8 attacks a night, the monster fights back while people are playing, a report goes out each night, and the pot is paid out when it's beaten. An admin can pick a faster [pace](#pace), down to the 45-minute siege of quick pace.

::: tip Just want to fight?
[Fight a Siege](/guides/games/siege) is the short version. This page has every rule and number.
:::

## Starting a siege

Admins and moderators start one in the channel where it should happen:

```
/siege start
/siege start monster:blob
/siege start monster:lizard length:60
/siege start monster:count length:4320
```

- `monster` (optional): pick one of the [11 monsters](#the-monsters). Without it you get a random one.
- `length` (optional): how long it lasts: 30 minutes, 45 minutes, 1 hour, 4 hours, 1 day, 3 days, 5 days, 7 days or 10 days. Without it, the server's [pace](#pace) decides: a week by default, or at quick pace the server's `siege-minutes` (45) or the monster's own time (the Atomic Lizard gives you 60). Any length runs to the timings of the nearest pace, so 5 days runs like a week.

Or a monster turns up by itself: see [Random sieges](#random-sieges).

The bot posts the monster's arrival as a new message, so people are notified, with its [card](#the-siege-card) underneath. The admin's reply says when it ends and, at any pace but quick, the timings it runs to (for a day-pace siege, when its report comes). Only one siege runs at a time, and a random [happening](./games-happenings#happenings) won't start while a quick or evening siege is on. The channel has to be one where the games can be played, and the bot needs View Channel, Send Messages and Embed Links there. If Discord refuses the card, the siege is called off. If Discord doesn't answer, the reply says so: when the card turns up in the channel the fight is on, and if it doesn't within a few minutes, the siege is called off by itself. While `/siege` is [turned off](#turning-it-off) for members, a start is refused: nobody could fight it.

An admin can start any monster in any month. The Headless Horseman only turns up at random in October, so outside October the reply notes it's out of season.

## Fighting

```
/siege attack weapon:food
/siege attack weapon:doom
/siege attack weapon:potion item:Lucky Penny
/siege back fighter:@Sam points:5
```

Pick a weapon, and optionally an [item](#items-in-a-siege). Anyone can fight, with no sign-up. Your first attack puts you in the fight.

- **Where:** the channel the siege is in, or any thread of it. Anywhere else, you're told where to go.
- **Same limits as the other games:** a 20-second cooldown and 6 plays a minute (see [Limits](./games-playing#limits)). The reply says if you're early, and an early attack costs you nothing.
- **Lines of its own.** Each weapon has its own lines, written for a fight with a monster, so a pie lands on The Blob rather than on a person with a monster's name in it.
- **Not while it has you.** A fighter the monster has [grabbed](#it-fights-back) can't attack until someone frees them, and one it has digested is out (at 3 days and week pace, out for a day). You're told privately, and it costs you nothing.
- **Attacks a night.** From evening pace on, each member gets a number of attacks a night: 8 at week pace (see [Pace](#pace)). They come back at the start of each night, 12:00 UTC. One past them is refused privately, telling you when the next come, and costs you nothing. On a siege's last night (an evening siege's only one) none are coming, and it says that's all your attacks for this siege. Freeing and curing don't use them.
- **A weapon is its game.** If an admin has turned `/foodfight`, `/doom` or `/potion` off, that weapon can't be used on the monster.
- **No monster, or too late.** With no siege on, or once it's beaten or its time is up, you're told privately and your cooldown isn't spent.
- **Back a fighter.** In the first half of a siege you can stake 2 to 10 of your points on someone else in the fight. See [Backing a fighter](#backing-a-fighter).

Each attack posts its line, your points, and what it did to the monster. From evening pace on, a member's first attack each night grows the monster ("Sam is back for another night"), and the reply ends with what's left of your night. From day pace on, it says your points go to the pot, and what the pot is now. The pot grows with each fighter-night, not with each attack, so it only moves on someone's first attack of a night:

<DiscordCard name="siege-attack" />

### What each weapon does

You don't choose the outcome. It's drawn from the lines, as in the other games. The damage here is before the [monster's own multipliers](#the-monsters).

| Weapon | Outcome | Damage | Points |
|---|---|---|---|
| 🥧 Food | 💥 Splat | 8 | +1 |
| | 💨 Splash (a miss) | 3 | 0 |
| | 🔄 Splatback | 0 | −1 |
| 🪓 Doom | ⚡ Smite | 16 | +2 |
| | 💨 Dodged | 0 | 0 |
| | 😱 Spooked | 0 | −2, and you're [Spooked](#spooked) |
| 🧪 Potion | 🧪 Poisoned | 4, then [2 a minute](#poison) for 5 minutes | +1 |
| | 🫧 Fizzled | 0 | −1 |

A splat, a smite or a poisoning is a good outcome: it builds your 🔥 streak and pays the [nights-in-a-row](./games-rewards#nights-in-a-row) bonus like any other. A splash, a dodge, a splatback, a spooked doom or a fizzle ends the streak.

Damage never takes the monster below 0 HP, and what you do is added to your total for the siege. Your first 30 attacks of the day (UTC) score points, and later ones still do damage (from day pace on, the attacks a night keep you under 30). From day pace on the points column goes into the [pot](#pace) instead: the attack still counts as a scored play (your item, your streak, your nights row).

A potion that **fizzles** splashes back: you're [poisoned](#it-fights-back) yourself, unless your Antidote cures it at once.

### Spooked

A doom can backfire as **Spooked**. It does no damage, costs you 2 points, and your next attack, with any weapon, does **half damage**. That attack uses it up. If you're Spooked, the reply says so.

### Poison

A potion that works poisons the monster: **4 damage now, then 2 more each minute for 5 minutes**, 10 over time. All of it is credited to you, even if the card hasn't caught up. It's one poison per fighter: poisoning again restarts yours, and the minutes you were still owed are paid first. Poison can land the killing blow, and it stops when the siege ends. The Count shrugs it off at half strength.

### Items in a siege

Add `item:` to an attack. The usual limits hold: one item per attack, 3 a day across all the games, and none on an attack past the 30-a-day scoring cap.

| Item | With | What it does in a siege |
|---|---|---|
| 🥧 Golden Pie | `food` | A sure splat: no splash, no splatback |
| 📼 Cursed VHS | `doom` | Can't backfire, so no Spooked: a smite or a dodge |
| 🍀 Lucky Penny | `potion` | The poison always works |
| 🥈 Silver Bullet | any weapon | Can't backfire, and damage ×3 (×5 against The Wolfman) |

The game items only narrow the outcome. They don't double your points the way they do elsewhere, because a siege's points come from the fight. The Silver Bullet applies to an attack's direct damage, not to the poison that follows. You win Silver Bullets as loot, and every 4 siege wins bring one ([Prizes](./games-rewards#prizes)).

## The monsters

Each siege picks one of eleven. All of them share the rules above; what sets them apart is below. A multiplier changes that weapon's damage against it: `×0.5` means half.

| Monster | HP | Food | Doom | Potion | What's special |
|---|---|---|---|---|---|
| 🟢 The Blob | ×1 | ×0.5 | ×1.25 | ×1 | Pies just sink in, but dooms hit harder |
| 👹 Gremlins | ×1 | ×1 | ×1 | ×1 | Don't feed them: every missed throw heals them, 2% of their HP at quick pace ([less on a longer siege](#heals)) |
| 🧛 The Count | ×1 | ×1 | ×1 | ×1 | Poison does half damage, and he grabs more often (55 in 100, not 50) |
| 🐺 The Wolfman | ×1 | ×1 | ×1 | ×1 | Silver hits him five times as hard, not three. Heals every time he acts, 1.5% of his HP at quick pace ([less on a longer siege](#heals)) |
| 🤡 Killer Klowns | ×1 | ×1 | ×1 | ×1 | Grabs two at a time (never the last free fighter) |
| 🌱 Pod People | ×1.15 | ×1 | ×1 | ×1 | Never grabs: poisons two at a time, and its poison never wears off by itself |
| 🦈 Land Shark | ×1.1 | ×1.5 | ×0.75 | ×1 | Loves a snack: food does one and a half times the damage; dooms bounce off |
| 🐜 THEM! | ×1.3 | ×1 | ×1 | ×1 | Big HP, but every hit that does damage does 2 extra |
| 👽 The Thing | ×1 | ×1 | ×1 | ×1 | Grabs whoever is doing the most |
| 🦖 Atomic Lizard | ×1.15 | ×1 | ×1 | ×1 | Rare. Twice the loot, and at quick pace it gives you an hour. Beating it counts toward Kaiju Killer |
| 🎃 Headless Horseman | ×1 | ×1.25 | ×0.75 | ×1 | October only when the pick is random: twice the loot, and food does more |

An admin can start any of them at any time with `monster:`. A random pick leaves the Horseman out except in October (UTC), and the Atomic Lizard comes up less often than the rest.

The monster's card line, and its arrival, defeat, escape, grab, poison and roar lines, are written in its own voice.

### Heals

Gremlins heal on every missed throw and The Wolfman every time he acts. A longer siege has far more of both, so each heal is smaller there. A heal is a share of the monster's full HP, and never takes it past full.

| Each heal | Quick | Evening | Day | 3 days | Week |
|---|---|---|---|---|---|
| 👹 Gremlins, per missed throw | 2% | 1% | 0.6% | 0.4% | 0.3% |
| 🐺 The Wolfman, each time he acts | 1.5% | 1.35% | 0.75% | 0.45% | 0.3% |

## It fights back

While people are fighting, the monster fights back. At quick pace it acts every **5 minutes** (the first 5 minutes after it arrives). From evening pace on it acts every 15 or 30 **minutes of fighting**: its clock only runs while someone has attacked in the last 30 minutes, and it only picks a fighter who has attacked, freed or cured in the last 30 minutes, so it goes after the people who are there (see [Pace](#pace)). Each time, a **new message** pings whoever it picked, and says how long they have:

<DiscordCard name="siege-grab" />

- **It grabs a fighter** (half the time). A grabbed fighter **can't attack**. Someone else frees them with a normal `/rescue attempt target:@Sam`:
  - **Rescued:** they're free, and **+12** goes to the rescuer's share of the fight.
  - **Sacrificed:** they're free, the rescuer gets the +12, and the monster grabs the **rescuer** instead, with a fresh window. With 💧 Holy Water there's no swap.
  - **Caught:** they're still held. Try again.
  - **Not freed in time** (10 minutes at quick pace, 22 hours at week pace): the monster **digests** them: **−5** (never below 0 for the month), and they're **out**. At quick, evening and day pace that's the rest of the siege; at 3 days and week pace, a day, then they're back in the fight. At quick and evening pace a new message always pings them when it happens. From day pace on it pings them only if someone has attacked in the last 30 minutes. Otherwise nobody is pinged, and the next [nightly report](#the-daily-report) names them under "Digested while nobody was around". At those paces a digest message the bot couldn't post goes into that report too. If no report is left before the siege ends (on its last night, or after a day-pace siege's one report), they're pinged at once, whatever the hour. And if the siege ends before the report that would name them (it's beaten first, or that report can't be posted), the [results](#how-a-siege-ends) name them and ping them.
- **It poisons a fighter** (35 in 100). Their attacks do **half damage** until someone else cures them with a helpful potion that works (`/potion give user:@Sam type:health`), worth **+8** to the giver's share, or it wears off (15 minutes at quick pace, 22 hours at week pace). A 💊 Antidote in their Glovebox fires by itself and cures it at once (it's used up, and counts as one of their 3 defences that day).
- **It roars** (15 in 100). Nothing happens, except The Wolfman heals.

It only picks fighters who are free and have attacked at least once (from evening pace on, only those who've been fighting in the last 30 minutes; with nobody like that, it roars), and it **never grabs the last free fighter**: with one left, it poisons them instead. A grab needs `/rescue` turned on for members and a poison needs `/potion`; otherwise it roars. If `/rescue` is turned off mid-fight, the grabbed are let go, and if `/potion` is, the poisoned are cured.

**Your share** of the win counts all of it: damage, **+12** for each fighter you freed, and **+8** for each one you cured (those also count as **help**, which decides the [Wang Chi](#the-wang-chi-and-the-jack-burton)). Freeing or curing puts you in the fight even if you never attacked, and neither uses your attacks.

A free or a cure that counts toward your share also earns **+2** [Chi](./games-magic#chi) for the Six-Demon Bag (at most 6 a day). Nobody can hex a fighter, and blessings never touch an attack ([The Six-Demon Bag](./games-magic#with-what-s-already-there)).

**Past the daily scoring cap.** A `/rescue` or `/potion` past your daily scoring cap (see [Limits](./games-playing#limits)) still frees or cures them: saving a friend is never blocked, and a sacrifice still swaps. But only your **first 2 a night** count toward your share and the Wang Chi; the reply says when one doesn't. On a server where plays don't score at all, your first **20** rescues and first **20** potions a day (UTC) count as if they scored, 20 being the daily scoring cap a server that scores plays starts with; past those, the first 2 a night count, as anywhere else. A night runs 12:00 to 12:00 UTC (a 3-day or week campaign's first night as its [attacks](#pace) count it). Scored plays always count. Field Medic counts scored ones only, as before (on a server where plays don't score, those first 20 a day).

If the bot restarts just as the monster acts, the action is dropped rather than half done: nobody is grabbed or poisoned unless the message pinging them went out.

## Pace

Each server runs its events at a **pace**: how long a siege lasts, how the monster's clock runs, how long a happening lasts, and how often each comes. The default is **week**: a siege is a campaign the whole server fights over seven nights, and a happening lasts about a day. An admin can pick another with [`pace`](./games-settings#happenings-and-twists), and nobody has to.

```
/eggshen-config-games happenings pace:week
/eggshen-config-games happenings pace:quick
```

The pace changes nothing about a single play. Cooldowns, the daily caps, items, twists, statuses and nights in a row are the same at every pace.

| | Quick | Evening | Day | 3 days | **Week** (default) |
|---|---|---|---|---|---|
| A siege lasts | 45 minutes ([`siege-minutes`](./games-settings#happenings-and-twists), 30–60) | 4 hours | 24 hours | 3 nights, to 12:00 UTC | 7 nights, to 12:00 UTC |
| The monster acts every | 5 minutes | 15 minutes of fighting | 30 minutes of fighting | 30 minutes of fighting | 30 minutes of fighting |
| Free a grabbed fighter within | 10 minutes | 30 minutes | 3 hours | 10 hours | 22 hours |
| A poisoning wears off after | 15 minutes | 45 minutes | 4 hours | 15 hours | 22 hours |
| Not freed in time | out of the siege | out of the siege | out of the siege | out for a day | out for a day |
| Digested, they're pinged | always | always | if someone attacked in the last 30 minutes, else the nightly report names them (or, with no report left, at once) | the same | the same |
| Attacks each | no limit (the first 30 a day score) | 20 a night | 12 a night | 10 a night | 8 a night |
| An attack's own points | yours | yours | into the pot | into the pot | into the pot |
| The win pool | 8 a fighter | 6 a fighter a night | 6 a fighter a night | 5 a fighter a night | 4 a fighter a night |
| The pool's range | 24–200 | 24–200 | 24–200 | 24–600 | 24–1,400 |
| Most one fighter's share pays | 30 | 30 | 30 | 45 | 60 |
| The Wang Chi | +8 | +8 | +8 | +16 | +24 |
| The Jack Burton | +3 | +3 | +3 | +6 | +9 |
| [Backing](#backing-a-fighter) closes after | 22½ minutes (half its time) | 2 hours | 12 hours | 27 to 39 hours | 75 to 87 hours |
| HP is sized on | members who played this week | members who played this week | the fighters it expects | the fighters it expects | the fighters it expects |
| New fighters stop growing it | in its last 5 minutes | last 30 minutes | last 3 hours | last 8 hours | last 24 hours |
| Difficulty after a win / an escape | +5% / −12% | +5% / −12% | +8% / −18% | +10% / −22% | +10% / −22% |
| [Heals](#heals): Gremlins / The Wolfman | 2% / 1.5% | 1% / 1.35% | 0.6% / 0.75% | 0.4% / 0.45% | 0.3% / 0.3% |
| The next random siege (normal) | about 3 a week | about 3 a week | 48 hours after the last | 48 hours after the last | 72 hours after the last |
| A report each night | no | no | one, at the 12:00 UTC it runs through | yes | yes |
| The card updates | about once a minute | about once a minute | every 10 minutes | every 10 minutes | every 10 minutes |
| A happening lasts | its own time | 4 times as long | about a day | about a day | about a day |
| Random happenings | about 1 a day | about 1 a day | about 1 a week | about 1 a week | about 1 a week |

- **Minutes of fighting.** From evening pace on, the monster's clock only runs while someone has attacked in the last 30 minutes, and it only grabs or poisons someone who's been fighting in the last 30 minutes. A campaign's grabs and poisonings happen while people are playing.
- **A night** runs from 12:00 UTC to 12:00 UTC, as it does for [nights in a row](./games-rewards#nights-in-a-row), so a US evening is one night. The night's attacks come back at 12:00 UTC. A 3-day or week campaign's first night runs to its first 12:00 UTC at least 6 hours after it starts (see below): one set of attacks, one night of growth. The daily scoring caps, the siege's 30 a day included, still reset at 00:00 UTC.
- **Digests.** At quick and evening pace a digested fighter is always pinged with a new message. From day pace on they're pinged only if someone has attacked in the last 30 minutes, so nobody gets a ping in the middle of the night. If not, the next [nightly report](#the-daily-report) names them. With no report left before the end, they're pinged at once; one the siege ends before reporting is in the results.
- **The pot.** From day pace on, an attack is still a scored play: it uses your item, builds your streak and keeps your nights row. Its own points go into the pot instead, the [win pool](#rewards-and-the-penalty), paid out by what each fighter did when the monster is beaten. The pool counts fighter-nights, so someone who fought five nights gets a bigger slice than someone who fought one.
- **Campaigns end at a night boundary.** A 3-day or week siege lasts that many nights and ends at 12:00 UTC. A night that would begin less than 6 hours after it starts counts as part of the first, for its attacks and growth as well as its report, so a week runs between about 6¼ and 7¼ days, always seven evenings and seven sets of attacks. A day-pace siege simply lasts 24 hours, and reports at the 12:00 UTC it runs through, unless that comes less than an hour after it started. If a campaign gets away, its results wait until someone plays a game. See [How a siege ends](#how-a-siege-ends).

A siege an admin starts with a [`length`](#starting-a-siege) runs to the nearest pace's timings: 5 days and 10 days run like a week. Changing the pace never touches a siege or a happening already on: each keeps the timings it started with.

### Switching to 2.74

With 2.74 every server moved to **week**, the new default. To keep 45-minute sieges and hour-long happenings, pick quick: `/eggshen-config-games happenings pace:quick`. A siege that was on during the update finished on the old rules, a happening kept its end time, and the server's difficulty carried on as quick's (each pace keeps its own).

## Random sieges

A monster can also turn up by itself while people are playing. How often depends on the server's [pace](#pace) and `siege-frequency`:

| `siege-frequency` | Quick, evening | Day, 3 days | Week (default) |
|---|---|---|---|
| Off | Never (only `/siege start`) | Never | Never |
| Rare | about 1.5 a week | 96 hours after the last ends | 144 hours after the last ends |
| Normal (default) | about 3 a week | 48 hours after | 72 hours after (about 3 a month) |
| Often | about 5 a week | 24 hours after | 36 hours after |

At quick and evening pace that's on a server that plays most evenings, and it's measured: a server playing 4 hours a night sees 1.6, 3.1 and 5.0 a week. From day pace on, once the gap has passed a campaign starts at the first busy evening: about 70% within a 4-hour evening of play. A server playing every evening sees about 2.7 week-long campaigns a month at normal. A random siege only starts when:

- at least **2 members** played in the last 30 minutes and **3** in the last 24 hours
- the gap since the last siege ended has passed (20 hours at quick and evening)
- at quick and evening pace, no [happening](./games-happenings#happenings) is on (and a happening never starts during a quick or evening siege); from day pace on they don't wait for each other. That goes by the siege's own pace, so a week campaign still on after an admin switches to quick doesn't hold happenings back
- `/siege` is on for members

It attacks the channel a happening would be announced in ([Where it's announced](./games-happenings#where-it-s-announced)), picks a monster at random (the Headless Horseman only in October), and lasts the pace's length (at quick, the server's `siege-minutes`, 45 by default, or the Atomic Lizard's hour). At quick and evening pace on **Often**, a random siege's win pool is scaled down (×0.6), so more sieges don't simply mean more points. See [Settings](./games-settings#happenings-and-twists).

## How tough it is

A siege is built to be beatable by the people who actually play, so its HP isn't fixed:

- **It's sized for the fight it will get.** A longer siege has more HP, for each whole day it lasts. At quick and evening pace the HP follows how many members have played in the last week. From day pace on, it follows how many fighters the server is expected to bring: at first 35% of the members who played in the last week (at least 2), then what its own campaigns at that pace showed, the latest counting most. So a big server where a handful fight gets a monster that handful can beat.
- **Fighters grow it.** Each new fighter's first attack (from evening pace on, each fighter's first attack each night) adds a little HP. You bring the monster with you, so a crowd gets a bigger fight than a few.
- **Not at the very end.** A fighter who joins (or, from evening pace on, comes back for another night) near the end doesn't grow it: in its last 5 minutes at quick pace, 30 minutes at evening, 3 hours at day, 8 hours at 3 days, and the last 24 hours of a week. A last-second newcomer can't hand it the HP to get away.
- **It has a ceiling.** However many people pile in, it never grows past what a crowd could beat.
- **The server's difficulty adjusts,** separately for each pace, and only when at least 2 members fought. Beat a monster and the next one is a little tougher: 5% (8% at day pace, 10% at 3 days and a week). If one gets away, the next is easier, 12% (18% at day pace, 22% at 3 days and a week), but only if the fighters really tried: they took at least half its HP, or, from evening pace on, used at least 60% of the attacks their nights allowed. At quick pace only the HP counts. Two people letting monsters walk away can't make every later one trivial. Each pace settles near 7 wins in 10, and the difficulty stays between half and two and a half times normal.
- **A turnout surprise teaches the turnout, not the difficulty.** From day pace on, if a campaign got away with clearly fewer fighters than it expected, or was beaten with clearly more, the difficulty stays put and only the expected turnout learns from it. "Clearly" means more than 2 fewer for an escape, or more than 1 extra for a win, and in both cases more than a quarter of the fighters who came.

A siege uses the difficulty as it stands when it starts, and keeps it for the whole fight.

## How a siege ends

| How | What happens |
|---|---|
| 🏆 **Won** | The monster's HP hits 0. It's beaten within about a minute, and the results are posted. |
| 💨 **Escaped** | The time runs out first. Everyone who fought pays the penalty, and the results are posted. From day pace on, they wait for the next game anyone plays on the server (12 hours at the latest), so a campaign that ends at 12:00 UTC doesn't ping everyone in the middle of the night. A win is always posted at once. |
| ⏹️ **Called off** | An admin runs `/siege end`, or [turns `/siege` off](#turning-it-off) while one is on. No rewards, no penalty, and the difficulty doesn't move. Anyone who [backed a fighter](#backing-a-fighter) gets their stake back. The card says it was called off. If the monster was already at 0 HP, an end counts as the win it was, and if its time was already up, as the escape it was. |

```
/siege end
```

Only admins and moderators can end one early, and only one that is still on. The card is frozen straight away, and the reply says when backers got their stakes back. If it ends as a win or an escape, the reply says which channel the results went to (the siege's, or, if that channel is off the games list, where a happening would be announced), or that they couldn't be posted yet.

The results come as a **new message** that pings up to 20 of the fighters (edits don't notify), with the monster's own defeat or escape line, then on a win a line for the [Wang Chi](#the-wang-chi-and-the-jack-burton) and one for the Jack Burton (or one for both). Anyone digested while nobody was around whom no [report](#the-daily-report) named is listed next ("Digested while nobody was around: Sam −5") and pinged. Underneath, each fighter has a row: their place, damage, points (🗡️ and 🔪 mark the honours in them), any loot and any [title](./games-rewards#titles) they just earned. Then a **Backing** field has a line for each backer.

<DiscordCard name="siege-results" />

## The Wang Chi and the Jack Burton

In *Big Trouble in Little China* the flashy one gets the credit and the sidekick is the real hero. A won siege works the same way.

- **The Wang Chi** is the fighter who **helped most**: 12 for each fighter they freed and 8 for each one they cured. They need at least 8 (one cure). They get **+8** points (**+16** at 3 days, **+24** at week pace) and a **loot item, every time**. A helper who never attacked can be the Wang Chi. If two helped equally, the one who did more in all wins, then whoever joined first.
- **Nobody needed saving?** Then the fighter who did the most holds the line: they're the Wang Chi, with the same bonus and loot.
- **The Jack Burton** is whoever landed the **killing blow**, an attack or the last tick of their poison. They get **+3** (**+6** at 3 days, **+9** at week pace) and a line in the results. The Wang Chi can be the Jack Burton too, and gets both.
- Both are paid with the win, so they're part of the [2 rewarded sieges a day](#rewards-and-the-penalty): past that limit, no honours.
- **Alone, neither.** A siege beaten by one fighter has no honours, and an escape or a called-off siege has none either.
- Being the Wang Chi counts toward **Siege MVP**, the **Wang Chi** title (5) and **Legend of the Drive-In** (10). The Jack Burton counts toward **Everybody Relax, I'm Here** (10). See [titles](./games-rewards#titles).

The results give each its own line above the table, and the frozen card names both. While a siege is on, the card shows the **Wang Chi so far** once someone has helped at least 8, and each [nightly report](#the-daily-report) names the night's.

The Wang Chi replaced the MVP (whoever did the most) in 2.75: the old MVP's +5 is gone, and MVPs already earned keep counting toward the titles. A siege that was on when 2.75 arrived finished on these rules, its frees and cures counted.

## Backing a fighter

```
/siege back fighter:@Sam points:5
```

Think you know who the real hero is? Stake **2 to 10** of your points on them. The stake is taken at once, and the reply is public but pings nobody.

| | |
|---|---|
| **When** | In the **first half** of the siege's own time: about 22 minutes of a 45-minute siege, 2 hours of an evening, 12 hours of a day, 27 to 39 hours of a 3-day campaign and 75 to 87 hours of a week (a campaign ends at a night boundary, so its halfway mark moves with its start). The live card says when it closes. |
| **Who** | Someone else who has attacked: not yourself, not a bot, and not a helper who has only freed or cured. In the siege's channel or a thread of it. You don't have to be fighting yourself. |
| **How often** | One backing a siege, and one a day (UTC). |
| **You need** | The stake in this month's points, every game together, and to be a regular: a scored play on at least 3 of the last 7 nights (as your [nights in a row](./games-rewards#nights-in-a-row) count them). |

At the end:

| The siege | Your fighter | You get back |
|---|---|---|
| Won, 3 or more fought | is the **Wang Chi** | **twice your stake** (+5 on a 5), and the fighter gets **+3** for making you look good (half the biggest stake on them, rounded up, once a siege) |
| Won, 3 or more fought | is in the **top 3**, or the **Jack Burton** | your stake |
| Won, 3 or more fought | neither | nothing |
| Escaped, 3 or more fought | anyone | nothing |
| Called off, or fewer than 3 fought | anyone | your stake |

- **Every backer gets a line** in the results' Backing field. The refusals are private and cost nothing, and `/siege status` shows who you backed.
- **It's your own stake,** so the payout isn't held back by the 2-rewarded-sieges-a-day limit. The fighter's +3 is a reward, though: past their own limit they don't get it.
- **The stake comes back to the month it was taken from.** A week campaign can cross into a new month: a stake placed on 30 October and returned in November goes back to October, and only what you won on top of it counts for November.
- **A digest counts your stake.** If the monster digests you while a stake you placed this month is out, the −5 isn't floored at what's left of your month alone: what the month can't cover comes out of the stake when it's settled. Staking your points away doesn't shield you, and your month still never goes below 0.
- If the bot restarts just as you back someone, the stake is either taken and recorded together, or comes back at the end; running `/siege back` again records it without taking it twice.

## Rewards and the penalty

When you win, the points are a **pool** that is split by what each fighter did: damage, plus 12 for each fighter freed and 8 for each cure (past the daily scoring cap, only the first 2 frees and cures a night count: see [It fights back](#it-fights-back)). From day pace on, the attacks' own points went into this pool: it's the pot.

- **The pool** is 8 points per fighter at quick pace, and never less than 24 or more than 200. From evening pace on it's per fighter-night: 6 (evening, day), 5 (3 days) or 4 (week) for each night each fighter fought, up to 200, 600 or 1,400. See [Pace](#pace).
- **Your share** of it is your share of all that, but never under 2 points or over 30 (45 at 3 days, 60 at week pace).
- **The Wang Chi** (the most help, or the top fighter if nobody helped) gets **+8** on top (+16 at 3 days, +24 at week pace: there are fewer of them) and a **loot item, every time**. **The Jack Burton** (the killing blow) gets **+3** (+6, +9). See [The Wang Chi and the Jack Burton](#the-wang-chi-and-the-jack-burton).
- **Everyone else** who did at least 5% of the damage has a **25% chance of loot** (50% against the Atomic Lizard and the Headless Horseman).
- **Loot** is a 🥈 Silver Bullet 30% of the time, and otherwise one of the six prize items (🥧 Golden Pie, 🧄 Garlic, 📼 Cursed VHS, 💧 Holy Water, 💊 Antidote or 🍀 Lucky Penny). A full Glovebox turns it into +2 points.
- **Every fighter gets the win** on their record. Being the Wang Chi counts toward Siege MVP, Wang Chi and Legend of the Drive-In, being the Jack Burton toward Everybody Relax, I'm Here, and beating the Atomic Lizard counts for Kaiju Killer. These feed the [siege titles](./games-rewards#titles), and every 4 wins bring a 🥈 Silver Bullet.
- **The points are bonus points.** They show on your card, and any title you earn pays its +10 as usual.
- **Alone, the pool share only.** A siege beaten by one fighter pays their share of the pool, but no honours, no loot, and no win on their record. Siege titles need company.
- **2 rewarded sieges a day.** Each member is rewarded for at most 2 won sieges a day (UTC): the points, the honours, the loot and the win on their record. A [backing](#backing-a-fighter) isn't a reward: its payout is never held back. In a third, your attacks still do damage and score their own points, and your row in the results says the limit was reached. From day pace on, where those points went into the pot, the third win pays you what your attacks would have scored on their own instead (never below 0), just as quick leaves you. Admins can start sieges back to back, so without a limit one friend could farm every siege title in an hour.

When it **escapes**, every member who attacked loses **3 points**, but only when **at least 2** members fought. A solo fighter loses nothing. A loss never takes you below 0 for the month. An escape the fighters fought hard also makes the next siege a little easier.

## The siege card

The arrival message carries a card for the whole fight:

<DiscordCard name="siege-card" />

- The monster, its line, and its **HP bar** with the exact number (`412/980` HP).
- When it ends.
- From evening pace on, the attacks a night each, and from day pace on, the pot so far.
- How many are **fighting**, and the **top 3 fighters** by damage.
- **Caught:** who the monster has grabbed, and when they have to be freed by.
- **Poisoned:** who it has poisoned, and when it wears off (or "until cured").
- **Digested:** at 3 days and week pace, who's out for a day, and when they're back.
- **Latest:** the last 5 things that happened, the monster's own actions included.
- **Wang Chi so far:** once someone has helped at least 8 (a cure), who has helped most.
- How to fight, and while backing is open, how to [back a fighter](#backing-a-fighter) and until when.

It's edited whenever something changes, at most about once a minute at quick and evening pace and every 10 minutes from day pace on, so it won't spam the channel. Its footer says which. Edits never notify anyone, which is why grabs, poisonings and results are new messages. When the fight ends the card freezes with how it ended. A won one names the **Wang Chi** ("held the line" if nobody needed saving) and **the Jack Burton** (the killing blow, poison included). A called-off siege posts no results message.

## The daily report

From day pace on, a siege runs across nights, so once a night the bot posts a **report** as a new message. It pings nobody: names, not mentions. It goes out with the first game anyone plays after the night begins at 12:00 UTC, or at 00:00 UTC at the latest, and never twice for a night (not even if the bot restarts mid-post). At 3 days and a week the first comes after the first night, which runs from the start to the first 12:00 UTC at least 6 hours away. A day-pace siege gets one, at the 12:00 UTC it runs through, unless that comes less than an hour after it started (then none: a digest is pinged at once instead).

<DiscordCard name="siege-report" />

It shows:

- the HP bar, and the damage done last night (if a night's report was lost, say the bot was down, the next covers every night since the last one and says so: "the last 2 nights")
- last night's top 3 fighters, and its **Wang Chi of the night**: the most help, 12 a free and 8 a cure (over several nights when a report was lost, "Wang Chi of the last 2 nights")
- **Still held:** whoever the monster has, and by when they must be freed
- **Poisoned:** whoever needs a helpful potion
- **Digested while nobody was around:** anyone digested when nobody had attacked in the last 30 minutes, so nobody was pinged, and anyone whose digest message couldn't be posted
- the attacks a night, the pot, how to fight, and when it ends

So the next evening's crowd knows who to help first.

If the report can't go out (the channel can't be reached, the bot is missing a permission, or Discord is busy), the bot tries again on its next passes, a minute apart, three tries in all, and then skips that night. One Discord turns away outright skips the night at once. Either way, anyone it would have named as digested moves to the next night's report, or, if there isn't one, to the results.

## Checking in

```
/siege status
```

Only you see the reply: the card as it is now, and your own damage and place (`You: 48 damage · 2nd of 6 fighters`), from evening pace on your attacks tonight, whether the monster has grabbed, poisoned or digested you, and who you [backed](#backing-a-fighter). If you haven't attacked, it tells you how. It only shows a siege that is still on.

You can also see the fight from other cards:

- **A game card** shows a siege line for a live siege, with its HP bar, when it ends, and that member's damage and place (`you: 48 damage, 2nd`), and from evening pace on their attacks tonight. If they haven't fought yet, it says to join in. It's on the all-games card and on the Siege card (`/scoreboard game:siege`).
- **The [leaderboard](./games-card#leaderboard)** lists it under **In progress**.

Siege is also a game column like the others, with your points, plays and streak. Its points count toward your total, your rank and the leaderboard.

## Turning it off

```
/eggshen-config commands toggle setting:siege enabled:false
```

Members lose `/siege attack`, `/siege status` and `/siege back`; admins and moderators can always use them. `/siege start` and `/siege end` are for admins and moderators only. A siege that's on when you turn it off is called off within a minute (no rewards, no penalty, backers' stakes back), since members can't fight it any more, and no new one can be started until it's back on. Turning off `/foodfight`, `/doom` or `/potion` takes that weapon away. Turning off `/rescue` stops the monster grabbing (the grabbed are let go), and turning off `/potion` stops it poisoning (the poisoned are cured). See [Turning a game off](./games-settings#turning-a-game-off).

## Related

- [Fight a Siege](/guides/games/siege): the quick guide
- [Settings for Admins](./games-settings#happenings-and-twists): the pace, random sieges and `siege-minutes`
- [Items, Prizes & Titles](./games-rewards): loot, the Silver Bullet and the siege titles
- [Games FAQ](/guides/games/faq): sieges, answered

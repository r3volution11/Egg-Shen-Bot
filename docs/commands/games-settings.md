---
title: Game Settings for Admins
description: Setting up Egg Shen Bot's Discord games with /eggshen-config-games. Play limits and rescue shields, keeping the games to certain channels, turning a game off, your server's own lines, twists and happenings, the pace, random sieges, the Six-Demon Bag's hexes, and resetting scores.
kit: true
kitHeadings:
  limits: clock
  where-games-can-be-played: lock
  turning-a-game-off: shield
  happenings-and-twists: dice
  choosing-a-pace: siege
  resetting-scores: effect
---

# Settings for Admins

The games work the moment the bot joins: every channel, the default limits, twists and happenings on, and week-long sieges. Admins and moderators tune them with **`/eggshen-config-games`**, which has four subcommands:

| Subcommand | What it sets |
|---|---|
| `limits` | The cooldown, plays a minute, the daily scoring cap, and how long a rescue shield lasts |
| `channels` | Where the games can be played |
| `happenings` | Twists, happenings, the pace, random sieges, and the Six-Demon Bag's hexes |
| `reset-scores` | Erases scores, for everyone or one member, all games or one |

Each one with no options shows the current settings, and only you see the reply. Turning a game off altogether is done with `/eggshen-config commands toggle`, beside every other command's switch ([Turning a game off](#turning-a-game-off)). Each game's own lines are added with the game's own command ([Your own lines](#your-own-lines)).

::: tip A good start
Keep the games in one channel with `/eggshen-config-games channels mode:only add:#games`, then have everyone run `/how-to-play`. Its cards show your server's own limits.
:::

## Limits

```
/eggshen-config-games limits
/eggshen-config-games limits cooldown-seconds:30 per-minute:4
/eggshen-config-games limits daily-scored-plays:10 shield-minutes:30
```

| Option | Default | Range | What it does |
|---|---|---|---|
| `cooldown-seconds` | 20 | 0–3,600 | Seconds between plays of the same game, per person |
| `per-minute` | 6 | 1–60 | Plays a minute across all the games, per person |
| `daily-scored-plays` | 20 | 0–1,000 | Plays of each game that score, per person each day (UTC) |
| `shield-minutes` | 60 | 0–1,440 | How long a rescue shields someone from `/doom`. `0` turns shields off |

With no options it shows the current settings. The siege has limits of its own that these don't change: the first 30 attacks a day score, from evening pace on each member also has a number of attacks a night, and from day pace on an attack's points go into the pot instead ([Pace](./games-siege#pace)). Members see what each limit does on [Playing & Points](./games-playing#limits).

## Where games can be played

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

A thread counts as its channel. Someone playing in the wrong place is told privately where the games are played. `/scoreboard` and `/leaderboard` work anywhere. Happenings and random sieges are announced only in channels where the games can be played: with the games kept to one channel, that's where they go ([Where it's announced](./games-happenings#where-it-s-announced)).

## Turning a game off

```
/eggshen-config commands toggle setting:rescue enabled:false
```

Each game has its own switch (`potion`, `foodfight`, `doom`, `rescue`, `siege`) beside every other command's, and so does `/six-demon-bag` (`magic`, below). A game turned off disappears from `/eggshen-help`, `/how-to-play`, `/scoreboard` and `/leaderboard`, and admins and moderators can still use it.

Turning off `siege` stops `/siege attack`, `/siege back` and `/siege status` for members, and calls off a siege that's on within a minute (no rewards, no penalty). Admins and moderators can still use all of it, but can't start a new one until it's back on. A siege's weapons are the other games, so turning off `foodfight`, `doom` or `potion` also takes that weapon off the monster, turning off `rescue` stops it grabbing, and turning off `potion` stops it poisoning. See [Siege › Turning it off](./games-siege#turning-it-off).

`/six-demon-bag` has its own switch, `magic`:

```
/eggshen-config commands toggle setting:magic enabled:false
```

Off, it's more than the command: plays stop earning Chi, blessings and hexes already cast stop working, the Red Envelope and Ching Dai's Curse twists stop coming, and the bag leaves `/how-to-play`, `/eggshen-help` and the card. Chi and charms are kept for when it's back on. To keep blessings and switch off only hexes, use `hexes:false` below. See [The Six-Demon Bag › Turning it off](./games-magic#turning-it-off).

## Your own lines

`/foodfight`, `/doom`, `/rescue` and `/potion` each draw from hundreds of built-in lines. Admins and moderators can add the server's own with each game's own command, and they're used alongside the built-in ones. How each game plays is on [Playing & Points](./games-playing#food-fight).

### Food fight lines

```
/foodfight lines add action:throw food:pie outcome:hit line:{thrower} hurls a key lime pie at {target}!
/foodfight lines add action:feed food:pie outcome:tasty line:{feeder} bakes {target} a perfect pie.
/foodfight lines list action:throw food:pie
/foodfight lines remove action:throw food:pie number:1
/foodfight lines reset action:throw food:pie
```

`food` is picked from a list: start typing and the bot suggests the menu. A food that isn't on it is refused.

A throw line needs both `{thrower}` and `{target}` and an outcome of `hit`, `miss` or `backfire`; a feed line needs `{feeder}` and `{target}` and `tasty`, `gross` or `spill`. Your lines are used alongside the built-in ones. `{target}` can be one person, a role, or @everyone, so write lines that read for any of them.

### Doom lines

```
/doom lines add trope:zombie outcome:doomed line:{user} serves {target} brain casserole!
/doom lines list trope:zombie
/doom lines remove trope:zombie number:1
/doom lines reset trope:zombie
```

A line needs both `{user}` and `{target}`, and an outcome: `doomed`, `escaped` or `backfired`. Your lines are used alongside the built-in ones. `{target}` can be one person, a role, or @everyone, so write lines that read for any of them.

### Rescue lines

```
/rescue lines add trope:the-dog outcome:rescued line:{user} follows the dog and drags {target} out the back door!
/rescue lines list trope:the-dog
/rescue lines remove trope:the-dog number:1
/rescue lines reset trope:the-dog
```

A line needs both `{user}` and `{target}`, and an outcome: `rescued`, `caught` or `sacrificed`.

### Potion responses and themes

```
/potion responses add type:health outcome:worked response:{giver} hands {receiver} a juice box. 💚 +5 HP
/potion responses list type:health
/potion responses remove type:health index:1
/potion responses reset type:health
/potion theme set themes:horror,comedy
/potion theme add theme:gaming
/potion theme remove theme:comedy
/potion theme list
/potion theme reset
```

A response needs both `{giver}` and `{receiver}`, and an `outcome`: `worked` or `backfired`. Your own responses are used alongside the built-in ones; themes narrow which built-in ones are used, and `reset` goes back to all of them.

## Happenings and twists

```
/eggshen-config-games happenings
/eggshen-config-games happenings frequency:rare
/eggshen-config-games happenings channel:#games
/eggshen-config-games happenings twists:false
/eggshen-config-games happenings twist-percent:2
/eggshen-config-games happenings enabled:false
/eggshen-config-games happenings start:fullmoon
/eggshen-config-games happenings end:true
/eggshen-config-games happenings pace:quick
/eggshen-config-games happenings siege-frequency:rare siege-minutes:30
/eggshen-config-games happenings hexes:false
```

With no options it shows the current settings: whether happenings, twists and hexes are on, how often, where they're announced, the [pace](./games-siege#pace) and what it means here (how long a siege lasts, the monster's timings, the attacks a night, how long happenings last), random sieges, what's on now (and today's calendar happening), and the last few. You can set several options at once. Only you see the reply.

| Option | What it does |
|---|---|
| `enabled` | Happenings on or off. Off also turns off Halloween Night and Friday the 13th, and ends one in progress (its announcement is edited to say so). Default on |
| `frequency` | How often random happenings start: **Off** (only when you start one), **Rare** (half as often), **Normal** (about one a day when busy, or about one a week from day [pace](./games-siege#pace) on), **Often** (twice as often). The [limits](./games-happenings#how-often-and-when) still hold |
| `channel` | Where happenings are announced. A text or announcement channel where the games can be played, and where the bot can View, Send and Embed Links. If it can't use it, the reply warns you. Without one, see [Where it's announced](./games-happenings#where-it-s-announced) |
| `twists` | [Twists](./games-happenings#twists) on or off. Default on |
| `twist-percent` | The chance of a twist on a scored play, from 0 to 15. Default 4 |
| `start` | Start a happening now, and announce it. It runs its length at the server's [pace](./games-siege#pace) (an hour or less at quick, 4 times that at evening, about a day from day pace on). Only one runs at a time, so end the current one first. Needs `enabled` on |
| `end` | End the current happening now |
| `siege-frequency` | How often a monster attacks by itself: **Off**, **Rare**, **Normal** (the default) or **Often**. At quick and evening pace that's about 1.5, 3 or 5 a week; from day pace on it sets the gap after the last one (rare twice as long, often half). See [Random sieges](./games-siege#random-sieges) |
| `siege-minutes` | How long a siege lasts at quick pace, 30 to 60 minutes, unless an admin picks or the monster has its own. Default 45. At any other pace a siege lasts the pace's length |
| `pace` | How long the server's events take: **Quick**, **Evening**, **Day**, **3 days** or **Week** (the default). See [Choosing a pace](#choosing-a-pace). A siege or happening already on keeps its timings |
| `hexes` | [Hexes](./games-magic#fair-play) from `/six-demon-bag` on or off. Off ends every hex in place at once (the reply says how many), no hex can be cast, and Ching Dai's Curse stops coming. Blessings carry on. Default on |

Use `end:true` and `start:` together to swap one for another. Each `start` counts toward the day's 3 (from day pace on, the week's 2).

Turning twists off stops new twists. A status someone already has keeps running until it's used or runs out.

## Choosing a pace

The pace decides how long a siege and a happening last and how often each comes. Pick the one that matches how your server plays:

| Pace | A siege | Happenings | Suits |
|---|---|---|---|
| **Quick** | 45 minutes, wall clock | an hour or less, about one a day | A server that plays in one busy session, all at once |
| **Evening** | 4 hours, 20 attacks a night each | 4 times as long, about one a day | One long night of play |
| **Day** | 24 hours, 12 attacks a night, a report at the 12:00 UTC it runs through | about a day, about one a week | Members dropping in across a day |
| **3 days** | 3 nights, 10 attacks a night, a report each night | about a day, about one a week | A long weekend |
| **Week** (default) | 7 nights, 8 attacks a night, a report each night | about a day, about one a week | A community that plays a little most evenings |

```
/eggshen-config-games happenings pace:week
/eggshen-config-games happenings pace:quick
```

Every number for each pace is in the [pace table](./games-siege#pace). Nothing about a single play changes with the pace: cooldowns, the daily caps, items, twists and nights in a row are the same at every one.

## Resetting scores

```
/eggshen-config-games reset-scores confirm:yes
/eggshen-config-games reset-scores confirm:yes game:doom
/eggshen-config-games reset-scores confirm:yes game:siege
/eggshen-config-games reset-scores confirm:yes user:@Sam
```

Erases scores for good: everyone's, one game's, one person's, or one person's game. What goes with them:

- **Everyone, or one person:** everything of theirs. That's their scores, Glovebox, prize counters, titles, nights row, shield, twist statuses and counts, their [Six-Demon Bag](./games-magic) (Chi, blessings and hexes on them, and who they've cast on), and today's limits.
- **One game** (everyone's, or one person's): that game's scores and its prize counters start over. Titles and the Glovebox stay, and so do the Points counter, nights, twist statuses, the count toward Plot Twist and the Six-Demon Bag. Titles already earned stay earned, though progress toward the ones not yet earned in that game starts again. Resetting `siege` also zeroes the win, Wang Chi, Jack Burton and Kaiju counts the [siege titles](./games-rewards#titles) count. It doesn't touch a siege in progress or the server's difficulty.

## Related

- [Admin Configuration](./configuration): every other server setting
- [Playing & Points](./games-playing#food-fight): how `/foodfight`, `/doom`, `/rescue` and `/potion` play
- [Siege](./games-siege): starting and ending a siege by hand

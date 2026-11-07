---
title: Fight a Siege - Egg Shen Bot
description: How to fight a siege monster with your whole Discord server, a campaign over a week by default - attack with food, dooms and potions, free grabbed fighters, cure poisoned ones, read the nightly report, and share the pot - and how admins start and end a siege and set the pace.
howto:
  name: Fight a siege
  timeText: a week by default, a few attacks each night; 45 minutes at quick pace
  totalTime: P7D
  steps:
    - name: Find the monster
      text: When a monster attacks, the bot posts its arrival as a new message in a games channel, with a card showing its HP bar, when it gets away, and how many attacks a night each fighter has.
    - name: Attack it
      text: In that channel, or a thread of it, run `/siege attack weapon:food`, or pick `doom` or `potion` as the weapon. Anyone can join, and your first attack puts you in the fight.
    - name: Keep hitting, night after night
      text: The usual limits apply, once every 20 seconds and 6 plays a minute, and at the default week pace you get 8 attacks a night. A splat of food does 8 damage, a smite of doom 16, and a potion poisons it for 4 now and 2 a minute for 5 minutes.
    - name: Free anyone it grabs
      text: When the monster grabs a fighter, free them with a normal `/rescue attempt target:@Sam`. Someone else has to do it, within 22 hours at week pace (10 minutes at quick), or they lose 5 points and sit out a day. Freeing doesn't use your attacks.
    - name: Cure anyone it poisons
      text: Give a poisoned fighter a helpful potion, `/potion give user:@Sam type:health`. If it works they're cured, and the cure counts toward your share.
    - name: Read the nightly report
      text: Each night of a campaign the bot posts a report, pinging nobody, with the HP, last night's best fighters, and who's still held or poisoned, so you know who to help first.
    - name: Check your place
      text: Run `/siege status` to see the card, your own damage and place, and your attacks tonight. Only you see it.
    - name: Back a fighter, if you like
      text: In the first half of a siege, `/siege back fighter:@Sam points:5` stakes 2 to 10 of your points on another fighter. You get twice your stake if they turn out to be the Wang Chi, and your stake back if they're top 3 or land the killing blow.
    - name: Share the pot
      text: Beat it before time runs out and a new message pings the fighters with the results. Everyone who fought gets a share of the pot, bigger for every night they fought. The Wang Chi (whoever freed and cured the most) gets a bonus and loot, and whoever lands the killing blow gets the Jack Burton.
---

# Fight a Siege

A monster crawls out of the screen and attacks the drive-in. The whole server fights it together with food, dooms and potions. Nobody is the target, so there's no one to annoy: the monster takes every hit.

By default a siege is a **campaign over a week**: everyone gets 8 attacks a night, the monster fights back only while people are playing, a report goes out each night, and the pot is paid out when it's beaten. An admin can set a faster [pace](/commands/games-siege#pace), down to the 45-minute siege of quick pace. The numbers below are the week's, with quick's in brackets.

<QuickSteps />

## In detail

### Your weapons

Each attack is drawn from that game's own lines, as a normal play is. The damage below is before the monster's own strengths and weaknesses.

| Weapon | Good | Points | Middle | Backfire |
| --- | --- | --- | --- | --- |
| `food` | 💥 Splat: 8 | +1 | 💨 Splash: 3 | 🔄 Splatback: 0, −1 |
| `doom` | ⚡ Smite: 16 | +2 | 💨 Dodged: 0 | 😱 Spooked: 0, −2, and your next attack does half |
| `potion` | 🧪 Poisoned: 4, then 2 a minute for 5 minutes | +1 | | 🫧 Fizzled: 0, −1 |

A weapon is its game: if an admin has switched `/foodfight`, `/doom` or `/potion` off, that weapon can't be used. You get 8 attacks a night, back each night at 12:00 UTC (on the last night, none come back: the reply says that's all for this siege), and an attack's points go into the pot rather than to you: it still builds your streak and keeps your nights row (at quick pace there's no limit, the first 30 a day score, and the points are yours). Items work too: a 🥈 Silver Bullet (`/siege attack weapon:doom item:Silver Bullet`) can't backfire and does three times the damage. See [Items in a siege](/commands/games-siege#items-in-a-siege).

<DiscordCard name="siege-attack" />

### It fights back

Every 30 minutes of fighting (every 5 minutes at quick pace) the monster does something, with a new message that pings who it picked. Its clock only runs while someone has attacked in the last 30 minutes, and it only picks someone who has been fighting in the last 30 minutes, so it goes after the people who are there. (At quick pace its clock just runs, and it can pick any fighter.)

<DiscordCard name="siege-grab" />

- **It grabs a fighter.** A fighter who's caught can't attack. Another member frees them with a normal `/rescue attempt target:@Sam`: **rescued** frees them, and counts +12 toward the rescuer's share; **sacrificed** frees them, but the rescuer is caught instead; **caught** means they're still held. A fighter not freed within 22 hours (10 minutes) loses 5 points (never below 0 for the month) and sits out a day (at quick, evening and day pace, the rest of the siege). A new message pings them if someone has attacked in the last 30 minutes; if not, the next nightly report names them (at quick pace they're always pinged). With no report left before the end, they're pinged at once, and one the siege ends before reporting is named in the results. It never grabs the last free fighter.
- **It poisons a fighter.** Another member cures them with a helpful potion, `/potion give user:@Sam type:health`. One that works cures them and counts +8 toward the giver's share. An Antidote in their own Glovebox cures it too, and it wears off by itself after 22 hours (15 minutes).
- **It roars.** Nothing happens. It just wants attention.

Grabs need `/rescue` switched on, and poison needs `/potion`; otherwise the monster only roars. Killer Klowns grab two at a time, The Thing goes for the top fighter, and Pod People only poison. Freeing and curing never use your attacks, and a rescue or potion past your daily scoring cap still frees or cures, but only your first 2 of those a night count toward your share.

### The nightly report

Each night of a campaign (from day pace on; a day-pace siege gets one, at the 12:00 UTC it runs through) the bot posts a report as a new message that pings nobody. It goes out with the first game anyone plays after 12:00 UTC, or at 00:00 UTC at the latest. It shows the HP and last night's damage, last night's top 3 and its **Wang Chi of the night** (the most freeing and curing), who's **still held** and by when they must be freed, who's **poisoned**, and anyone digested while nobody was around. Start your evening there.

<DiscordCard name="siege-report" />

### Winning and losing

- **Won:** the fighters split the pot, 4 points for each night each fighter fought (24 to 1,400 in all; at quick pace 8 a fighter, 24 to 200), by their share of what was done: damage, plus 12 for each fighter freed and 8 for each cure. Each gets 2 to 60 (2 to 30). A win is posted at once.
- **The Wang Chi** helped most: 12 for each fighter they freed, 8 for each cure, at least 8 (if nobody needed saving, the top fighter holds the line). They get +24 more (+8) and a loot item. **The Jack Burton**, whoever lands the killing blow, gets +9 (+3). Anyone else with at least 5% has a 25% chance of loot. Loot is sometimes a Silver Bullet. See [The Wang Chi and the Jack Burton](/commands/games-siege#the-wang-chi-and-the-jack-burton).
- **Backers:** in the first half of a siege, `/siege back fighter:@Sam points:5` stakes 2 to 10 of your points on someone else who has attacked (once a siege, once a day, if you've played 3 of the last 7 nights). Twice your stake if they're the Wang Chi, your stake back if they're top 3 or the Jack Burton, nothing otherwise; with fewer than 3 fighters, or if it's called off, your stake back. See [Backing a fighter](/commands/games-siege#backing-a-fighter).
- **Escaped:** time ran out first, and everyone who attacked loses 3 points (never below 0 for the month), but only when at least 2 fought. A week campaign ends at 12:00 UTC, and its results wait for the next game anyone plays (12 hours at the latest), so nobody's pinged in the middle of the night.
- **Rewards are paid for 2 won sieges a day** per member. Past that, a win pays what your attacks would have scored on their own (the points that went into the pot), with no share, honours or loot. A siege won by one fighter alone pays only their share of the pool, with no honours.

Won sieges also count toward the [siege titles](/commands/games-rewards#titles), and every 4 siege wins earns a Silver Bullet.

## Run a siege (admins)

Admins and moderators can start a siege in any channel where the games are played:

```
/siege start
/siege start monster:blob length:45
/siege start monster:count length:4320
```

- `monster` picks one of the 11 monsters. Without it, you get a random one.
- `length` sets how long it lasts: 30, 45 or 60 minutes, 4 hours, or 1, 3, 5, 7 or 10 days. It runs to the timings of the nearest [pace](/commands/games-siege#pace). Without it, the server's pace: a week by default (at quick pace 45 minutes, or the monster's own time).
- Only one siege runs at a time, and the bot needs View Channel, Send Messages and Embed Links in the channel.

To call one off, with no rewards and no penalties (anyone who backed a fighter gets their stake back):

```
/siege end
```

If it was already beaten or out of time, it counts as the win or escape it was, and the reply says which channel the results went to.

Sieges also start by themselves while members are playing: at week pace a campaign comes 72 hours after the last one ends (about 3 a month), at quick pace a few times a week, and only when 2 or more members have played in the last 30 minutes and 3 or more in the last day. An admin can pick the server's pace, make random sieges rarer or more frequent, switch them off, and set how long a quick siege lasts:

```
/eggshen-config-games happenings pace:quick
/eggshen-config-games happenings siege-frequency:rare
/eggshen-config-games happenings siege-frequency:off
/eggshen-config-games happenings siege-minutes:60
```

To switch `/siege` off for members:

```
/eggshen-config commands toggle setting:siege enabled:false
```

## Related

- [Play the games](./play)
- [Games FAQ](./faq)
- [Siege](/commands/games-siege), every rule and number, and the monsters
- [Siege › Pace](/commands/games-siege#pace), every pace's timings side by side

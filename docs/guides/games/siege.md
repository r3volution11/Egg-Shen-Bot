---
title: Fight a Siege - Egg Shen Bot
description: How to fight a siege monster with your whole Discord server - attack with food, dooms and potions, free grabbed fighters, cure poisoned ones, and share the rewards - and how admins start and end a siege.
howto:
  name: Fight a siege
  timeText: 30 to 60 minutes, as long as the monster stays
  totalTime: PT45M
  steps:
    - name: Find the monster
      text: When a monster attacks, the bot posts its arrival as a new message in a games channel, with a card showing its HP bar and when it gets away.
    - name: Attack it
      text: In that channel, or a thread of it, run `/siege attack weapon:food`, or pick `doom` or `potion` as the weapon. Anyone can join, and your first attack puts you in the fight.
    - name: Keep hitting
      text: The usual limits apply, once every 20 seconds and 6 plays a minute. A splat of food does 8 damage, a smite of doom 16, and a potion poisons it for 4 now and 2 a minute for 5 minutes.
    - name: Free anyone it grabs
      text: When the monster grabs a fighter, free them with a normal `/rescue attempt target:@Sam`. Someone else has to do it, within 10 minutes, or they lose 5 points and are out of the fight.
    - name: Cure anyone it poisons
      text: Give a poisoned fighter a helpful potion, `/potion give user:@Sam type:health`. If it works they're cured, and the cure counts toward your share.
    - name: Check your place
      text: Run `/siege status` to see the card and your own damage and place. Only you see it.
    - name: Share the rewards
      text: Beat it before time runs out and a new message pings the fighters with the results. Everyone who fought gets a share of the points, and the MVP gets a bonus and loot.
---

# Fight a Siege

A monster crawls out of the screen and attacks the drive-in. The whole server fights it together with food, dooms and potions. Nobody is the target, so there's no one to annoy: the monster takes every hit, and only the attacker scores.

<QuickSteps />

## In detail

### Your weapons

Each attack is drawn from that game's own lines, as a normal play is. The damage below is before the monster's own strengths and weaknesses.

| Weapon | Good | Points | Middle | Backfire |
| --- | --- | --- | --- | --- |
| `food` | 💥 Splat: 8 | +1 | 💨 Splash: 3 | 🔄 Splatback: 0, −1 |
| `doom` | ⚡ Smite: 16 | +2 | 💨 Dodged: 0 | 😱 Spooked: 0, −2, and your next attack does half |
| `potion` | 🧪 Poisoned: 4, then 2 a minute for 5 minutes | +1 | | 🫧 Fizzled: 0, −1 |

A weapon is its game: if an admin has switched `/foodfight`, `/doom` or `/potion` off, that weapon can't be used. Your first 30 attacks a day score points, and every attack does damage. Items work too: a 🥈 Silver Bullet (`/siege attack weapon:doom item:Silver Bullet`) can't backfire and does three times the damage. See [Items in a siege](/commands/games#items-in-a-siege).

### It fights back

Every 5 minutes or so the monster does something, with a new message that pings who it picked:

- **It grabs a fighter.** A fighter who's caught can't attack. Another member frees them with a normal `/rescue attempt target:@Sam`: **rescued** frees them, and counts +12 toward the rescuer's share; **sacrificed** frees them, but the rescuer is caught instead; **caught** means they're still held. A fighter not freed within 10 minutes loses 5 points (never below 0 for the month) and is out of this siege. It never grabs the last free fighter.
- **It poisons a fighter.** Another member cures them with a helpful potion, `/potion give user:@Sam type:health`. One that works cures them and counts +8 toward the giver's share. An Antidote in their own Glovebox cures it too, and it wears off by itself after 15 minutes.
- **It roars.** Nothing happens. It just wants attention.

Grabs need `/rescue` switched on, and poison needs `/potion`; otherwise the monster only roars. Killer Klowns grab two at a time, The Thing goes for the top fighter, and Pod People only poison.

### Winning and losing

- **Won:** the fighters split a pool of 8 points each (24 to 200 in all) by their share of what was done: damage, plus 12 for each fighter freed and 8 for each cure. Each gets 2 to 30.
- **The MVP** did the most. They get +5 more and a loot item, and anyone else with at least 5% has a 25% chance of loot. Loot is sometimes a Silver Bullet.
- **Escaped:** time ran out first, and everyone who attacked loses 3 points (never below 0 for the month), but only when at least 2 fought.
- **Rewards are paid for 2 won sieges a day** per member. A siege won by one fighter alone pays only their share of the pool.

Won sieges also count toward the [siege titles](/commands/games#titles), and every 4 siege wins earns a Silver Bullet.

## Run a siege (admins)

Admins and moderators can start a siege in any channel where the games are played:

```
/siege start
/siege start monster:blob minutes:45
/siege start monster:lizard minutes:60
```

- `monster` picks one of the 11 monsters. Without it, you get a random one.
- `minutes` sets how long it lasts, from 30 to 60. Without it, 45, or the monster's own time.
- Only one siege runs at a time, and the bot needs View Channel, Send Messages and Embed Links in the channel.

To call one off, with no rewards and no penalties:

```
/siege end
```

Sieges also start by themselves a few times a week while members are playing: at least 20 hours apart, never during a [happening](/commands/games#happenings), and only when 2 or more members have played in the last 30 minutes and 3 or more in the last day. An admin can make random sieges rarer, more frequent, or switch them off, and set how long they last:

```
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
- [Games & Scores › Siege](/commands/games#siege), every rule and number, and the monsters

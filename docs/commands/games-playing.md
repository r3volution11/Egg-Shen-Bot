---
title: Playing & Points - Egg Shen Bot
description: How Egg Shen Bot's Discord games play and score. The five games (/foodfight, /doom, /rescue, /potion and /siege), each one's options and lines, the points for every outcome, streaks, rescue shields, bonus points, and the limits that keep the games from being farmed.
kit: true
kitHeadings:
  the-five-games: vs
  food-fight: food
  doom: doom
  rescue: rescue
  potions: potion
  points: coin
  shields: shield
  bonus-points: gift
  limits: clock
---

# Playing & Points

Every play has an outcome, and every outcome moves points. Aim a game at someone, read the line it draws, and the small grey line underneath says what it scored.

<DiscordCard name="game-play" />

## The five games

Each game that hurts has one that helps, and the fifth is played by everyone together.

| Game | Command | What it does |
|---|---|---|
| 🥧 Food Fight | `/foodfight throw`, `/foodfight feed` | Throw food at someone, which hurts, or feed them, which helps |
| 🪓 Doom | `/doom fate` | Deal someone a horror-movie fate. It hurts |
| 🛟 Rescue | `/rescue attempt` | Save someone from one. It helps, and shields them from the next doom |
| 🧪 Potions | `/potion give` | A harmful potion hurts, and a helpful one helps |
| 👹 Siege | `/siege attack` | Everyone against a monster. Nobody is the target |

Aim the first four at a member, a role or @everyone. A role or @everyone shows in the message but nobody is pinged, and only you score. `/siege` is the odd one out: nobody is the target. You aim food, a doom or a potion at a monster, and the whole server wins or loses together. See [Siege](./games-siege).

```
/foodfight throw target:@Sam
/foodfight feed target:@Sam food:taco
/doom fate target:@Sam trope:zombie
/rescue attempt target:@Sam
/potion give user:@Sam type:health
/siege attack weapon:food
```

How each of the first four plays, with its options, examples and some of its lines, is below. Admins and moderators can add the server's own lines to any of them ([Your own lines](./games-settings#your-own-lines)).

## Food Fight

Start a food fight, after the classic BBS door game. Throw food at a member, a whole role, or @everyone, and the bot says what happened: a hit, a miss, or a throw that backfires on you. Or be nice and feed them instead.

### Throw Food

```
/foodfight throw target:<member, role, or @everyone> food:[food] item:[item]
```

Leave out `food` and the bot grabs whatever's on the tray. `item` is optional: a 🥧 Golden Pie is a sure hit and doubles your points. The list shows only what you hold ([Items](./games-rewards#using-an-item)).

**Foods:** 🥧 Cream Pie, 🍝 Spaghetti, 🍮 Pudding, 🥔 Mashed Potatoes, 🟩 Jell-O, 🍖 Meatloaf, 🌽 Creamed Corn, 🥣 Tapioca, 🍕 Pizza, 🌮 Taco, 🐟 Fish Sticks, 🥬 Split Pea Soup

**Examples:**
```
/foodfight throw target:@Alice food:pie
/foodfight throw target:@Moderators
/foodfight throw target:@everyone food:pea-soup
/foodfight throw target:@Alice item:Golden Pie
```

**Sample lines:**
- *"🥧 @Alice winds up like a Three Stooges short and plants a cream pie square on @Bob. Nyuk nyuk nyuk."* (a hit)
- *"🐟 @Bob swats @Alice's fish stick aside with a pool noodle. Where did the pool noodle come from? Doesn't matter. Clean miss."*
- *"🍝 @Alice grabs the spaghetti by the sauce end. Rookie. @Alice is marinara to the elbows and @Bob is laughing their ass off."* (a backfire)

Posted publicly, with the points underneath: a hit is +3 for you and −1 for them; a miss −1 / +1; a backfire −2 / +2. A member you hit is pinged; a role or @everyone is shown but not pinged. Bots dodge everything. 300 built-in lines.

### Feed Someone

```
/foodfight feed target:<member, role, or @everyone> food:[food] item:[item]
```

The kind half of a food fight. A 🥧 Golden Pie (`item`) makes it always tasty, with +2 more for you both. It's tasty (+1 for you, +2 for them), gross (−1 each), or you spill it on yourself (−2 for you, +1 for them, who still gets fed). 181 built-in lines.

- *"🍮 @Alice makes @Bob a flan so jiggly it waved hello. @Bob waved back, then ate it."*

Your server's own throw and feed lines: [Food fight lines](./games-settings#food-fight-lines).

## Doom

Deal someone a horror-movie fate: a zombie bite, a monkey's paw, a cursed tape. It's horror-comedy, so things go wrong for the victim, backfire on whoever did the dooming, or occasionally end in a narrow escape. Aim it at a member, a whole role, or @everyone.

### Deal a Fate

```
/doom fate target:<member, role, or @everyone> trope:[trope] item:[item]
```

Leave out `trope` and fate decides. `item` is optional: a 📼 Cursed VHS can't backfire, doubles your points, and cuts through a shield or Garlic. The list shows only what you hold ([Items](./games-rewards#using-an-item)). A target with 🧄 Garlic turns a doom into an escape by itself ([Defences](./games-rewards#defences)).

**Tropes:** 🧟 Zombie, 🐒 Monkey's Paw, 🪓 Slasher, 😈 Possession, 📼 Cursed Tape, 🪆 Haunted Doll, 🧛 Vampire, 🐺 Werewolf, 🤡 Killer Clown, 📖 Necronomicon, 🔮 Ouija Board, 🪞 Bloody Mary

**Examples:**
```
/doom fate target:@Alice trope:zombie
/doom fate target:@Camp Counselors trope:slasher
/doom fate target:@everyone
/doom fate target:@Alice item:Cursed VHS
```

**Sample lines:**
- *"🪓 @Bob tries to call for help. No bars. One bar. Zero bars. @Alice cuts the landline anyway, purely for style points."* (doomed)
- *"🧟 @Bob gets bitten, turns, and immediately eats @Alice. Somebody should have aimed for the head."* (backfired)
- *"🔮 @Alice asks the spirits to haunt @Bob. The planchette spells "N-O-P-E," floats across the room, and bonks @Alice on the forehead every hour, on the hour."* (backfired)

Posted publicly, with the points underneath: doomed is +3 for you and −1 for them; an escape −1 / +2; a backfire −2 / +1. Someone recently saved with `/rescue` is shielded: the doom is blocked, nobody scores, and the shield is used up. A member you doom is pinged; a role or @everyone is shown but not pinged. Bots are already undead. 300 built-in lines.

Your server's own lines: [Doom lines](./games-settings#doom-lines).

## Rescue

`/doom`'s opposite: save someone from a horror movie. A Final Girl drags them out of the cabin, holy water, the boomstick, the dog that always survives. A rescue that works **shields** them from the next `/doom` for an hour.

### Attempt a Rescue

```
/rescue attempt target:<member, role, or @everyone> trope:[trope] item:[item]
```

Leave out `trope` and whatever works, works. `item` is optional: 💧 Holy Water can't be caught, gives you +2 more, and the shield lasts 3× as long. The list shows only what you hold ([Items](./games-rewards#using-an-item)). The tropes named Holy Water, Garlic and Silver Bullet are flavour, not items.

**Tropes:** 🔪 Final Girl, 💧 Holy Water, 👻 Ghostbusters, 🔫 Boomstick, 🧂 Salt Circle, 🥈 Silver Bullet, 🌅 Sunrise, 🚗 Getaway Car, 🗡️ Van Helsing, 📜 Survival Rules, 🧄 Garlic, 🐕 The Dog

**Outcomes:**
- **Rescued:** +1 for you, +2 for them, and they're shielded.
- **Caught:** you both get caught, −1 each.
- **Sacrificed:** you save them and take the hit yourself: −2 for you, +3 for them, and they're shielded.

**Sample lines:**
- *"🗡️ @Alice beats the vampire in a staring contest, then stakes it while it's blinking. @Bob is saved, and slightly confused."*
- *"🔪 @Alice tries to save @Bob, but they both trip over absolutely nothing while running from a guy who is walking. Both caught."*

You can't rescue yourself ("Final Girls don't save themselves for points"), or a bot. Rescuing a role or @everyone scores only you and shields nobody. 300 built-in lines.

Your server's own lines: [Rescue lines](./games-settings#rescue-lines).

## Potions

Give magical potions with pop culture references, to a member, a whole role, or @everyone.

### Give a Potion

```
/potion give user:<member, role, or @everyone> type:<potion-type> item:[item]
```

`item` is optional: a 🍀 Lucky Penny makes the potion work and doubles your points. The list shows only what you hold ([Items](./games-rewards#using-an-item)). A 💊 Antidote on the receiving end works by itself against a harmful potion.

**Potion Types:**
- **Helpful:** Health, Mana, Strength, Speed, Invisibility, Luck, Love, Energy
- **Harmful:** Confusion, Poison, Weakness, Curse, Slow

**Features:**
- 339 built-in responses with references from movies, TV shows, video games, and more
- Themed responses based on genre (Horror, Comedy, Fantasy, Sci-Fi, Gaming, Action, Classics, Animation, Drama)
- Posted publicly. A member you pick is pinged; a role or @everyone is shown but not pinged
- Scores points: a helpful potion that works gives you +1 and them +2; a harmful one gives you +2 and them −2; a backfire costs you 2 ([Points](#points))

**Examples:**
```
/potion give user:@Alice type:health
/potion give user:@Movie Club type:confusion
/potion give user:@everyone type:luck
/potion give user:@Alice type:poison item:Lucky Penny
```

**Sample Responses:**
- *"🧪 Alice hands Bob a suspicious red liquid. 'This... is my BOOMSTICK of healing!' 💚 +50 HP (Army of Darkness approved)"*
- *"🍷 Charlie gives Dave Joffrey's wedding wine. Should've skipped the reception... 💀 -75 HP (Game of Thrones)"*
- *"🐒 Eve wishes on a Monkey's Paw for Frank's luck. A finger curls. Eve stubs every toe for a week. 💔 -60 LUCK"* (a backfire)

Your server's own responses, and which themes the built-in ones come from: [Potion responses and themes](./games-settings#potion-responses-and-themes).

## Points

Each play posts its line with the points underneath, as in the example above: the outcome, your points and your running total, your streak, and the other member's points.

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
| Siege: food | 💥 Splat | +1 | n/a |
| | 💨 Splash | 0 | n/a |
| | 🔄 Splatback | −1 | n/a |
| Siege: doom | ⚡ Smite | +2 | n/a |
| | 💨 Dodged | 0 | n/a |
| | 😱 Spooked | −2 | n/a |
| Siege: potion | 🧪 Poisoned | +1 | n/a |
| | 🫧 Fizzled | −1 | n/a |

- **"Them" is only scored when it's a member.** Aim at a role, @everyone or yourself and only your own points move.
- **A siege has no "them".** The monster isn't a member, so only you score. At the default [pace](./games-siege#pace), a week, an attack's points go into the siege's pot and are paid out when it's beaten. Twists and happenings don't touch a siege attack.
- **Points are kept for this month, this year and all time** (UTC), so a new month gives everyone a fresh start without losing the all-time record.
- **Rewards add lines** under the points: an item you used, a defence that fired, a [blessing or hex](./games-magic#the-twelve-charms) that acted, a prize, a title, a nights milestone, or the [Chi](./games-magic#chi) that filled your bag. Their points are [bonus points](#bonus-points) or part of the play's points, and they're in your total. See [Items, Prizes & Titles](./games-rewards).

### Streaks

Good outcomes in a row build a 🔥 streak: a hit, a doom, a tasty meal, a rescue, a potion that worked, or a splat, smite or poisoning in a siege. A bad one ends it. The points line shows your streak from 2 in a row, and your card keeps your best. A streak of 10 earns the 🔥 On Fire [title](./games-rewards#titles), and 15 earns 🌋 Unstoppable.

### Shields

A rescue that works (rescued or sacrificed) shields the member you saved for an hour. The next scoring `/doom` aimed at them is blocked: nobody scores, and the shield is used up. A doom from someone past their daily scoring cap is worth nothing either way, so it plays as usual and the shield stays up. You can't rescue yourself, and rescuing a role or @everyone shields nobody. You can still doom yourself through your own shield, if you really want to.

A 💧 Holy Water rescue shields them three times as long, a 📼 Cursed VHS doom cuts through a shield, and an admin can change how long a shield lasts, or switch shields off ([Settings](./games-settings#limits)).

## Bonus points

**Bonus points** are the points the rewards give you:

- a prize's **+3**, and the **+2** when your Glovebox was full
- a title's **+10**
- the **+1** from your nights tier
- the **+2** for a Night Light you had no room for
- the points a [twist](./games-happenings#twists) gives or takes, a Free Refill's **+1**, a Mosquito bite's **−1**, and Friday the 13th's **+1** on good plays
- a 🔥 Fired Up blessing's **+1** and a 🔥 Scorched hex's **−1** ([The Six-Demon Bag](./games-magic#the-twelve-charms))
- a won siege's payout

They're added to the game you were playing, so they're part of that game's points, your total and your place on the leaderboard, for the month, the year and all time. The card doesn't show them separately.

(The [caster's pay](./games-magic#the-caster-s-pay) for a blessing is Chi, not points, so it isn't on this list. A Jade Charm prize's +3 and the All That Kind of Thing title's +10 are bonus points like any prize's and title's.)

What an item does (×2, +2 more) isn't bonus. It's just that play's points. The same goes for a [happening](./games-happenings#happenings) that doubles a score, for Director's Cut and Bitten, and for the [Six-Demon Bag](./games-magic)'s Lightning Strike, Static and Thunderous Applause.

## Limits

So the games stay fun and can't be farmed:

| Limit | Default | What happens past it |
|---|---|---|
| **Cooldown** | each game once every 20 seconds, per person | You're told privately, and it doesn't count. Switching games is fine: throw some food, then give a potion straight away |
| **Per minute** | 6 plays a minute, across all the games | You're told privately, and it doesn't count |
| **Daily scoring cap** | the first 20 plays of each game each day (UTC) score | You can keep playing, just for fun. Past the cap, items aren't used, defences don't fire, and prize counters, title counts and nights don't move |
| **Siege attacks** | the first 30 a day score; from evening pace on, also a number of attacks a night (8 at week pace) | Attacks past 30 a day still do damage. From evening pace on, an attack past the night's allowance is refused privately and costs nothing |
| **Items, prizes, defences** | 3 items used, 2 prizes paid and 3 defences fired per member each day (UTC) | See [Items, Prizes & Titles](./games-rewards) |
| **Twists** | 3 a day per member, and at most 8 points taken a day | See [Twists](./games-happenings#twists) |
| **Six-Demon Bag** | 2 casts a day (UTC), at most 1 a hex. A cast has the cooldown (20 seconds between casts) and counts toward the 6 a minute | Refused privately, and it costs nothing: no Chi, no cast, no cooldown. See [The Six-Demon Bag](./games-magic#casting) |
| **Chi** | 4 a day from good plays, 6 a day from freeing and curing (UTC), and the bag holds 20. A blessing's pay (+1 Chi) and a Red Envelope come on top | Good plays still count, just without Chi. See [Chi](./games-magic#chi) |
| **Happenings** | one at a time, 2 hours apart, at most 3 a day (from day pace on, a day apart and at most 2 a week) | See [Happenings](./games-happenings#how-often-and-when) |
| **Sieges** | one at a time, started by an admin or at random | See [Siege](./games-siege) |

Admins can change the cooldown, the per-minute limit, the daily scoring cap and the shield's length ([Settings](./games-settings#limits)), and `/how-to-play` shows the numbers your server uses. A play that's refused for a limit is answered privately and doesn't count. The bot's per-member rate limit doesn't apply to the games or to `/six-demon-bag`'s casts, `shrug` and `peace`, since they have their own (`/six-demon-bag status` keeps it), and their plays don't count toward the server-wide limit. A per-command rate limit set for one of them still applies, and then its plays do count. Everything else still stops a play as it stops any command: whitelist mode, a moderator's cooldown on a member, and the server-wide limit once the server has reached it.

### Where you can play

An admin can keep the games to certain channels, or out of some ([Settings](./games-settings#where-games-can-be-played)). A thread counts as its channel. Play in the wrong place and you're told privately where the games are played. `/six-demon-bag bless`, `hex`, `peace` and `shrug` follow the same channels. `/scoreboard`, `/leaderboard`, `/how-to-play` and `/six-demon-bag status` work anywhere.

## Troubleshooting

**Problem:** Potion responses are repetitive  
**Solution:** Administrators can add their own with `/potion responses add`, used alongside the 339 built-in ones, and the other games' lines the same way ([Your own lines](./games-settings#your-own-lines)).

**Problem:** A role or @everyone didn't get a notification  
**Solution:** That's on purpose: /potion, /foodfight, /doom and /rescue show a role or @everyone without pinging anyone, so a game doesn't notify a whole server. Pick a member to ping them.

**Problem:** "⏳ cooldown" or "🎲 Games are played in…"  
**Solution:** Each game can be played once every 20 seconds per person, and the games can be limited to certain channels. See [Limits](#limits).

## Related

- [Your Card & the Leaderboard](./games-card): where your points show
- [Items, Prizes & Titles](./games-rewards): what playing earns you
- [Settings for Admins › Your own lines](./games-settings#your-own-lines): adding your server's own lines to each game
- [Play the Games](/guides/games/play): a quick guide to your first prize

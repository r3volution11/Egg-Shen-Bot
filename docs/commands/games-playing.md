---
title: Playing & Points - Egg Shen Bot
description: How Egg Shen Bot's Discord games score. The five games (/foodfight, /doom, /rescue, /potion and /siege), the points for every outcome, streaks, rescue shields, bonus points, and the limits that keep the games from being farmed.
kit: true
kitHeadings:
  the-five-games: vs
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

How each command plays, its options and its lines, is in [Social Commands](./social).

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

Admins can change the cooldown, the per-minute limit, the daily scoring cap and the shield's length ([Settings](./games-settings#limits)), and `/how-to-play` shows the numbers your server uses. A play that's refused for a limit is answered privately and doesn't count. The bot's general rate limit doesn't apply to the games or to `/six-demon-bag`'s casts, `shrug` and `peace`, since they have their own (`/six-demon-bag status` keeps it); a per-command rate limit set for one of them still does.

### Where you can play

An admin can keep the games to certain channels, or out of some ([Settings](./games-settings#where-games-can-be-played)). A thread counts as its channel. Play in the wrong place and you're told privately where the games are played. `/six-demon-bag bless`, `hex`, `peace` and `shrug` follow the same channels. `/scoreboard`, `/leaderboard`, `/how-to-play` and `/six-demon-bag status` work anywhere.

## Related

- [Your Card & the Leaderboard](./games-card): where your points show
- [Items, Prizes & Titles](./games-rewards): what playing earns you
- [Social Commands](./social): how each game plays, and adding your server's own lines
- [Play the Games](/guides/games/play): a quick guide to your first prize

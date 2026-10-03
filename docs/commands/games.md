---
title: Games & Scores - Egg Shen Bot
description: Points for /potion, /foodfight, /doom and /rescue, with personal scoreboards, a server leaderboard by month, year and all time, rescue shields, and admin limits and channel rules.
---

# Games & Scores

`/potion`, `/foodfight`, `/doom` and `/rescue` are games. Every play has an outcome, every outcome moves points, and everyone can see who's winning with `/scoreboard` and `/leaderboard`.

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

### Shields

A rescue that works (rescued or sacrificed) shields the member you saved for an hour. The next `/doom` aimed at them is blocked: nobody scores, and the shield is used up. You can't rescue yourself, and rescuing a role or @everyone shields nobody. You can still doom yourself through your own shield, if you really want to.

---

## Scoreboard

```
/scoreboard user:[member] game:[game] period:[period] private:[true/false]
```

Your points, or anyone's: their name and avatar, total and rank on the server, and for each game their points, rank, plays, what they did (🎯 hits, 💀 dooms…), what they received, and their best streak. An active shield shows too.

- `user`: whose scoreboard (default: yours)
- `game`: one game, or all of them (default)
- `period`: this month, this year, or all time (default)
- `private:true`: only you see it. Otherwise it's posted in the channel.

Games turned off on the server are left out.

## Leaderboard

```
/leaderboard game:[game] period:[period] private:[true/false]
```

The top 10 players, each with a small avatar, their points and plays. Underneath the heading: who received the most of everything (🎯 most splatted, 💀 most doomed, 🛟 most rescued, ☠️ most poisoned, 💚 most healed, 🍽️ best fed) and the best streak.

```
/leaderboard period:month
/leaderboard game:doom period:year
```

---

## Limits

So the games stay fun and can't be farmed:

- **Cooldown:** each game once every 20 seconds per person. Switching games is fine: throw some food, then give a potion straight away.
- **Per minute:** 6 plays a minute per person, across all the games.
- **Daily scoring cap:** the first 20 plays of each game each day (UTC) score points. After that you can keep playing, just for fun.

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

### Resetting scores

```
/eggshen-config-games reset-scores confirm:yes
/eggshen-config-games reset-scores confirm:yes game:doom
/eggshen-config-games reset-scores confirm:yes user:@Sam
```

Erases scores for good: everyone's, one game's, one person's, or one person's game. Resetting everything also clears shields.

---

## Related Documentation

- [Social Commands](./social) - How each game plays, and adding your server's own lines
- [Admin Configuration](./configuration) - Every other server setting

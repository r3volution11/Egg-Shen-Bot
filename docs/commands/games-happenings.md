---
title: Twists & Happenings
description: The surprises in Egg Shen Bot's Discord games. Twists, small good or bad luck after a play, and their statuses, and happenings, server-wide events like a Full Moon that doubles dooms, with when they start, how long they last and where they're announced.
kit: true
kitHeadings:
  twists: dice
  happenings: star
---

# Twists & Happenings

Two kinds of surprise keep the games from getting predictable. A **twist** happens to one player, right after a play. A **happening** changes the games for the whole server for a while.

## Twists

A **twist** is a small surprise that happens to the player who just played, never to the person they aimed at. It might be good (a raccoon drops some change) or bad (the raccoon takes your wallet). Each one adds a line under the play:

<DiscordCard name="game-twist" />

**The chance.** Every play that scores has a **4% chance** of a twist, a bit over one play in 25. An admin can change that, or switch twists off ([Settings](./games-settings#happenings-and-twists)). A blocked `/doom` and a play past the daily scoring cap never twist, and neither does a siege attack. Some happenings make twists likelier: Intermission ×3 and Halloween Night ×2.

**The protections.** Twists are a joke at your expense, not a way to lose a month:

- **3 twists a day** per member (UTC).
- **After a bad twist, the next one is always good.**
- **Twists can take at most 8 points a day** from you, all of them together (Pickpocketed, The Call, each Mosquito bite, and a 🔥 Scorched [hex](./games-magic#the-twelve-charms)'s −1s). They can never take your month below 0. When a cap trims a loss, the line says "(all a twist can take)".
- **A twist that would do nothing isn't drawn.** Pickpocketed and The Call need points left to take, Reel Change needs points on the play, Brain Freeze needs a streak, the Red Envelope needs room in your [bag](./games-magic#chi), and Ching Dai's Curse needs somewhere a hex can land: not on someone already hexed, warded, at peace, fighting a siege or hexed twice today, and never with hexes or the Six-Demon Bag switched off.
- **The Night Light and the Jade Charm are safe.** A Car Break-In never takes either. If you have nothing it can take, you get a Mosquito Swarm instead.
- **A twist's points are [bonus points](./games-playing#bonus-points)**, in the game you were playing.

<div id="the-16-twists" />

### The 18 twists

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
| 🧧 Red Envelope | Good | +4 [Chi](./games-magic#chi), on top of the day's cap |
| 🦝 Pickpocketed | Bad | −3 points |
| 📞 The Call Is Coming From Inside the House | Bad | −4 points |
| 🚗 Car Break-In | Bad | A random item is stolen from your Glovebox (never the Night Light or the Jade Charm) |
| 🧛 Bitten | Bad | Your gains are halved (rounded down) for the next 3 plays |
| 🐈‍⬛ Jinxed | Bad | Your next play rolls twice and keeps the worse result. Ends a Lucky Break |
| 🦟 Mosquito Swarm | Bad | −1 on each of your next 3 plays |
| 🎞️ Reel Change | Bad | The points you just earned on this play are gone. Prizes, titles and bonuses it also earned stay |
| 🧊 Brain Freeze | Bad | Your streak in this game is over |
| 🀄 Ching Dai's Curse | Bad | A hex of a random element lands on you for 12 hours, with no caster ([The Six-Demon Bag](./games-magic)). Never one that would cancel a blessing you're carrying. Shrug it off with `/six-demon-bag shrug` |

A little more than half are good before the "good after bad" rule tips it further.

### Statuses

Seven twists leave a **status** instead of acting once: Lucky Break, Free Refill, Director's Cut, Second Wind, Bitten, Jinxed and Mosquito Swarm. A status changes your *next* plays, not the one it came on. It shows under **🌀 In effect** on your [card](./games-card#scoreboard), and a play it changed says so under the points:

> -# 🧛 Bitten: Sam's +3 is halved to +1 (2 more).

Ching Dai's Curse leaves a hex instead, a [Six-Demon Bag](./games-magic) charm: it's under 🎒 Six-Demon Bag on your card, counts as one of the 2 hexes you can take in a day, and leaves the 3-hour ward when it ends.

- **It runs out after 24 hours** if you haven't used it, or sooner when its plays are used up.
- **It's used on plays that score.** A blocked `/doom` or a play past the daily cap doesn't use it.
- **A repeat refreshes it.** A second Bitten while you're Bitten puts you back at 3 plays and a fresh 24 hours. It doesn't stack.
- **Lucky Break and Jinxed cancel each other.** Whichever came last is the one you have.
- **Second Wind waits for a streak.** A bad play with no streak to save doesn't use it up.

### Plot Twist

Have 30 twists happen to you and you earn the 🎲 **Plot Twist** [title](./games-rewards#titles), worth +10 bonus points. Only twists on plays that score count.

## Happenings

A **happening** is something that changes the games for the whole server for a while: a full moon that doubles dooms, a fog that makes throws miss. Everyone playing during it is affected, and it ends by itself. It starts with a new message in a games channel:

<DiscordCard name="game-happening" />

### The random ones

There are eight. How long one lasts depends on the server's [pace](./games-siege#pace). At the default, week, and from day pace on, each lasts about a day: 24 hours, or 18 for The Fog and Intermission and 12 for Double Feature. At evening pace each lasts 4 times as long as the table, and at quick pace exactly as long:

| Happening | Lasts (quick) | What changes |
|---|---|---|
| 🌕 Full Moon | 1 hour | `/doom` scores double, both ways (🌕×2) |
| 🍻 Happy Hour | 1 hour | `/foodfight feed` is gross or spilled half as often, and a tasty one scores double |
| 🌫️ The Fog | 45 minutes | `/foodfight throw` misses far more often (a hit is 40% less likely, a miss twice as likely) |
| 🎞️ Double Feature | 30 minutes | Every point in every game counts twice (🎞️×2), siege attacks aside |
| 🌅 Sunrise | 1 hour | Rescues are caught half as often, and a shield lasts twice as long |
| 🧪 Mad Scientist Hour | 1 hour | Potions backfire half as often (not siege attacks) |
| 📼 Be Kind, Rewind | 1 hour | A bad outcome doesn't break your streak (not on a siege attack) |
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

At the default [pace](./games-siege#pace), week, a busy server sees about **one random happening a week**, and it lasts about a day. At quick and evening pace it's about **one a day**. An admin can make them [rarer or more frequent](./games-settings#happenings-and-twists), or turn them off. Whatever the setting:

- **One at a time.**
- **Apart:** at least 2 hours between the end of one and the start of the next (quick, evening), or a day (from day pace on).
- **At most 3 a day** (UTC) at quick and evening pace, and **at most 2 a week** (Monday to Sunday, UTC) from day pace on.
- **Only when people are playing.** At least 2 members must have played in the last 30 minutes (3 for Double Feature).
- **A real full moon helps.** On the night of the real full moon (a day either side, by the lunar calendar), Full Moon is 4 times as likely to be the one that starts.
- **And a siege?** A happening never starts during a quick or evening siege, and at quick and evening pace a random siege never starts during a happening. A campaign (a siege from day pace on) and happenings run side by side, since a campaign lasts most of the week. That goes by the siege's own pace, not the server's: a week campaign still on after an admin switches to quick doesn't hold happenings back. Either way, a happening never changes a siege attack, and the announcements of the ones whose words would cover one (Double Feature, The Fog, Mad Scientist Hour, Be Kind, Rewind) say "(not siege attacks)".

An admin can also start one by hand. That skips the frequency, the gap and the limit, but it still counts toward the day's 3 (or the week's 2).

### Where it's announced

The bot posts a new message with an embed, in the first of these that works:

1. The channel an admin chose for happenings
2. The games channel, if the games are limited to just one
3. The channel the games were last played in
4. For one an admin starts, the channel they ran the command in

Each has to be a channel where the games can be played, and one where the bot has View Channel, Send Messages and Embed Links. The message pings nobody. When the happening ends, the bot edits the same message to say so, so the end doesn't notify anyone.

If the bot can't announce it, or was offline when it started, the happening still happens. Every play it changes shows its tag. One the bot couldn't announce on time (it was restarting, say) is announced late only within 2 minutes of its start, unless it lasts more than an hour, as every happening does at evening pace and slower. Then it's still announced while at least half of it is left, and the message says what's left, in whole hours: "For the next 21 hours", not the 24 it started with.

### How it shows on a play

A play a happening changed carries the happening's tag beside the outcome, so a doubled score never looks like a mistake:

<DiscordCard name="game-happening-play" />

Some happenings add a line as well:

> -# 📼 Be Kind, Rewind: Sam's streak survives.
> -# 🔪 Friday the 13th: Sam +1.

### When it stops

A happening's effects stop **exactly** at its end time. The bot checks the clock on every play, so one that ends late (a slow bot, a message that didn't edit) can't stretch past it.

## Related

- [Settings for Admins](./games-settings#happenings-and-twists): twists and happenings on or off, how often, where, and starting one by hand
- [Siege](./games-siege#pace): the pace, which sets how long happenings last
- [Games FAQ](/guides/games/faq): twists and happenings, answered

---
title: The Six-Demon Bag
description: The Six-Demon Bag, /six-demon-bag, in Egg Shen Bot's Discord games. Good plays earn Chi; spend it to bless a friend or hex a rival with one of six elements. Chi and its caps, the twelve blessings and hexes, how they cancel and combine, the caster's pay, and the fair-play rules that keep hexes friendly.
kit: true
kitHeadings:
  chi: chi
  casting: bag
  the-twelve-charms: efire
  the-caster-s-pay: elite
  how-they-combine: erain
  fair-play: shield
  shrugging-a-hex-off: ewind
  peace: esmoke
  your-bag: bag
  turning-it-off: lock
---

# The Six-Demon Bag

> *"Wind, fire, all that kind of thing!"* — Egg Shen

Egg Shen's bag holds six demons. Your good plays fill it with **Chi**, and `/six-demon-bag` spends it: **bless** a friend with something good for their next plays, or **hex** a rival with something that gets in their way. Every cast is public and pings the member it lands on, and a blessing that does something pays its caster back.

<DiscordCard name="magic-cast" />

```
/six-demon-bag bless member:@Alex element:Fire
/six-demon-bag hex member:@Jo element:Wind
/six-demon-bag shrug
/six-demon-bag peace on:true
/six-demon-bag status
```

## Chi

☯️ Chi is the bag's fuel. You earn it by playing well, and most of all by helping in a siege.

| You get | Chi | At most |
|---|---|---|
| A good outcome on a play that scores: a hit, a tasty meal, a doom, a rescue or a sacrifice, a potion that works and isn't stopped, or a siege attack that lands (a splat, a smite, a poisoning) | +1 | 4 a day (UTC) |
| Freeing a grabbed fighter, or curing a poisoned one, in a [siege](./games-siege#it-fights-back) | +2 | 6 a day (UTC), apart from those 4 |
| A blessing you cast paying off ([The caster's pay](#the-caster-s-pay)) | +1 | once per blessing, on top of the day's cap |
| A 🧧 Red Envelope [twist](./games-happenings#twists) | +4 | on top of the day's cap |

- **The bag holds 20.** Chi past that is lost. Once your bag is full, good plays still count toward the day's 4, and the line says the bag's full. Nothing decays: Chi you don't spend waits for you.
- **A siege attack earns Chi even when its points go into the pot** (at day, 3 days and week [pace](./games-siege#pace)).
- **Only good outcomes on plays that score.** A play past the [daily scoring cap](./games-playing#limits) earns none, and neither does a miss, a backfire or a caught rescue.
- **Nor does a play a defence stopped.** A `/doom` a rescue shield blocked or Garlic turned into an escape, a throw a Smoke Screen turned into a miss, and a harmful potion the Antidote or a Smoke Screen made harmless: that potion's giver still gets their +1, but no Chi.
- **Freeing and curing count** whenever they count toward your share of the fight: a play that scores, or one of the first 2 a night past your scoring cap.
- **The play only mentions Chi** when it fills your bag or the day's 4: `-# ☯️ Sam +1 Chi · that's all the Chi for today`. [Your bag](#your-bag) shows the rest.

## Casting

| | Costs | Lasts |
|---|---|---|
| `/six-demon-bag bless member:@Alex element:Fire` | 6 Chi | until it's used up, or 24 hours |
| `/six-demon-bag hex member:@Jo element:Wind` | 7 Chi | until it's used up, or 12 hours |

- **2 casts a day** (UTC), and **at most 1 of them a hex**.
- **Pick the element from the list.** Discord lists all six, each with the charm it casts and its cost: `🔥 Fire · Fired Up (6 Chi)`. Pick the member first and the list also says what an element would do to *them*: `🌧️ Rain · lifts Alex's 🔥 Scorched`, or `💨 Wind · spoils Jo's 🌫️ Smoke Screen` ([Cancelling](#cancelling)). You can also type an element's name (`fire`), or the charm's own (`Tailwind` for a blessing, `Ill Wind` for a hex).
- **It's public.** The cast posts a new message in the channel, naming who cast it and pinging the member it landed on, once. Nobody else is pinged, and no cast is anonymous. Under it, what it cost: `-# Sam 14 → 8 Chi · 1 cast left today`.
- **One blessing and one hex at a time.** A second blessing on someone already blessed is refused, unless it [lifts](#cancelling) their hex; a second hex is always refused.
- **Not on yourself, and not on a bot.**
- **The same limits as a play.** A cast has the games' cooldown (20 seconds between casts) and counts toward the 6 plays a minute ([Limits](./games-playing#limits)). Like the games, casting, `shrug` and `peace` skip the bot's per-member rate limit, since they have limits of their own; `status` doesn't. The server-wide limit, whitelist mode and manual cooldowns still apply to all of them ([Rate Limiting](/features/rate-limiting#the-games-have-their-own-limits)).
- **Where:** a channel where the games can be played, or a thread of one ([Where you can play](./games-playing#where-you-can-play)). `/six-demon-bag status` works anywhere.
- **A refusal costs nothing.** If a cast can't go ahead (not enough Chi, they're already blessed, they've made peace, a limit in [Fair play](#fair-play)), you're told why, privately, and nothing is spent: no Chi, no cast, no cooldown.

## The twelve charms

The six elements are three opposed pairs: ⚡ Lightning and 🌩️ Thunder, 🌧️ Rain and 🔥 Fire, 💨 Wind and 🌫️ Smoke. Each works one side of the game, and its blessing and hex push that side up or down.

| Charm | What it does | Used up by | Pays its caster when |
|---|---|---|---|
| ⚡ **Lightning Strike** (blessing) | Your next good play scores ×2, multiplied with items, Director's Cut and happenings: your gains still stop at ×3 | your next good play | it changed the points (a Golden Pie and Director's Cut already at ×3 leave it nothing) |
| ⚡ **Static** (hex) | Your gains are halved, rounded down. Losses aren't touched | your next 2 plays | — |
| 🌩️ **Thunderous Applause** (blessing) | The next good help you give a member (a tasty meal, a rescue or sacrifice, a helpful potion that works) scores ×2 **for them**, at most ×2 | that good help | their points changed |
| 🌩️ **Deafened** (hex) | Your good plays earn no Chi (siege attacks, and freeing and curing, still do) | your next 5 plays that would have earned Chi | — |
| 🌧️ **Cleansing Rain** (blessing) | Washes 🧛 Bitten, 🐈‍⬛ Jinxed and 🦟 Mosquito Swarm off at once, when it's cast. Then your next bad play keeps your streak | the next bad play with a streak to lose | it washed something off, or kept a streak |
| 🌧️ **Rained Out** (hex) | Your good plays don't extend your streak: it holds. A bad play still ends it | your next 2 good plays | — |
| 💨 **Tailwind** (blessing) | Your next play can't go badly: bad outcomes are out of the draw | your next play | the same draw without it would have gone badly |
| 💨 **Ill Wind** (hex) | Your next play is drawn twice, and you keep the worse | your next play | — |
| 🔥 **Fired Up** (blessing) | +1 on each good play | your next 3 plays, good or not | its first +1 |
| 🔥 **Scorched** (hex) | −1 on each play | your next 3 plays | — |
| 🌫️ **Smoke Screen** (blessing) | The next harmful play aimed at you is lost in the smoke: a throw misses, a doom escapes, and a harmful potion does no harm (its giver gets +1 and no Chi, you 0) | the next harmful play at you | it fires (not on an attack by the member who cast it) |
| 🌫️ **Lost in the Smoke** (hex) | Your plays aimed at a member score only you, as if aimed at a role: no points for them, no defence of theirs fires, and they aren't pinged | your next 2 plays aimed at a member | — |

- **A charm works on plays that score.** Not a play past the daily scoring cap, not a `/doom` a rescue shield blocked, and never a siege attack. None of those uses it up.
- **The play says so.** A play a charm changed carries a line under the points: `-# 🔥 Fired Up: Alex +1 (2 more).` A Smoke Screen's line names the member it saved.
- **When one runs out.** A blessing nobody used in 24 hours, or a hex after 12, goes, and the holder's next play says so: `-# ⌛ Alex's 🔥 Fired Up wore off before it did anything.` (only for a blessing that never did a thing), `-# ⌛ The 💨 Ill Wind on Jo ran its course and faded.`
- **Scorched is a twist's loss.** Its −1s count with Pickpocketed, The Call and Mosquito bites toward the 8 points twists can take in a day, and never take your month below 0. A hex costs you 3 points at the very most, and the worst a day of hexes can do is about −6.
- **Saving a friend is never lost in the smoke.** A `/rescue` of a fighter the siege monster has grabbed, or a helpful `/potion` at one it poisoned, goes through as usual, and doesn't use up a play.

### The caster's pay

The first time a blessing you cast **does something** (the last column above), you get **+1 Chi**, back into your bag: not a point, and on top of the day's Chi cap (a full bag can't take it). Once per blessing, and blessings only: a hex never pays, and a blessing that runs out unused pays nothing. A Smoke Screen set off by your own attack on the member you blessed still works for them, but pays you nothing.

It counts the moment the blessing does something: on the play it changed, or, for one that works when it's cast (Cleansing Rain washing something off, or a blessing that [lifts a hex](#cancelling)), on the cast. The play, or the cast, says so:

<DiscordCard name="magic-play" />

Every 12 of your blessings that pay off bring a 🧿 Jade Charm and +3, and blessings of all six elements earn the 🎒 **All That Kind of Thing** title, +10 ([Items, Prizes & Titles](./games-rewards)). Those are [bonus points](./games-playing#bonus-points), in the game the blessing worked in (for one that worked when it was cast, the game you've played most, the siege aside). A Car Break-In never takes a Jade Charm.

## How they combine

### Cancelling

When a blessing meets a hex of the **same element or its opposite**, both are gone:

- **A blessing lifts a hex.** Bless Jo with 🌧️ Rain or 🔥 Fire while they're 🔥 Scorched, and the Scorched and your blessing cancel out. It costs you a cast and 6 Chi, and pays you +1 Chi, because it did something. It works even if Jo is already carrying another blessing.
- **A hex spoils a blessing.** Hex Alex with 💨 Wind or 🌫️ Smoke while they carry a 🌫️ Smoke Screen, and both are gone. It spends your hex for the day, counts as one of the hexes Alex can take that day, and pays nothing.

Either way the member is warded for 3 hours, as after any hex ([Fair play](#fair-play)). Elements that aren't the same or opposed never cancel: Alex can carry a 🔥 Fired Up and a 💨 Ill Wind at once.

### With what's already there

| | |
|---|---|
| **Twist statuses** | Charms and [statuses](./games-happenings#statuses) are kept apart and combine as twists do. When a charm and a status would do the same thing on one play, the charm goes first and the status waits for your next play: Tailwind before 🍀 Lucky Break, Ill Wind before 🐈‍⬛ Jinxed, Static before 🧛 Bitten (gains are halved once, never twice), Cleansing Rain before 🔥 Second Wind. Tailwind and Jinxed together: bad outcomes are out of both draws, and you keep the worse good one. Fired Up and 🍿 Free Refill: +2 on a good play |
| **Multipliers** | Lightning Strike multiplies with items, Director's Cut and happenings, and your gains still stop at ×3. Static halves after them. Thunderous Applause doubles the other member's points up to ×2, so a happening already doubling them leaves it nothing to add |
| **Defences** | Smoke Screen is a [defence](./games-rewards#defences). It fires last, after a rescue shield, Garlic and the Antidote, so it's never wasted on a play another one stopped. It counts toward the 3 defences a day, and the 📼 Cursed VHS cuts through it. A play any defence stopped earns no Chi |
| **Casts aren't plays** | A rescue shield or Garlic doesn't stop a hex. The 🧿 Jade Charm does ([The items](./games-rewards#the-items)) |
| **The siege** | Charms never touch a siege attack. Nobody can hex a member who's fighting a live siege (who has attacked, freed or cured in it, and isn't out): the siege is co-op. A blessing on a fighter is an ordinary blessing, for their plays in the other games |
| **The daily scoring cap** | A play past it uses no charm and earns no Chi. Casting isn't capped by it |

## Fair play

Hexes are a joke between friends, never a way to pick on someone:

| Rule | |
|---|---|
| **Hexes a day** | 1 per caster, one of their 2 casts, and it costs 7 Chi against a blessing's 6 |
| **The same member** | 1 hex from you every 72 hours |
| **Hexes received** | at most 2 a day (UTC), and only one on at a time |
| **The ward** | after a hex on you ends (used up, run out, shrugged off, lifted or spoiled), no hex can land on you for 3 hours |
| **Who can't be hexed** | yourself, bots, anyone at [peace](#peace), anyone fighting a live siege, and anyone without a scored play in the last 7 nights (tonight included) |
| **Blessing the same member** | 3 times in 7 days from you, so two friends can't farm each other |
| **Nothing blocks a play** | No hex stops you playing, using an item, attacking, freeing or curing. The worst is −1 a play for 3 plays, halved gains, a worse draw, no Chi, or plays that miss their target |
| **Out in the open** | Casts are public, name the caster and ping the target. Your card says who cast what's on you |
| **No reward for hexing** | No title or prize counts hexes, and a hex never pays its caster |

A 🀄 Ching Dai's Curse [twist](./games-happenings#twists) counts as one of the 2 hexes you can receive in a day and leaves the ward like any other, but it never lands on someone already hexed, warded, at peace or fighting a siege. An admin can switch hexes off for the whole server ([Turning it off](#turning-it-off)).

### Shrugging a hex off

```
/six-demon-bag shrug
```

The hex on you is gone, and the 3-hour ward starts. The first shrug each day (UTC) is **free**. After that it costs **2 Chi**, or nothing if you hold less than 2, so nobody is ever stuck with a hex. The shrug is public: *"Give me your best shot, pal. I can take it."* A friend can lift a hex for you too, with a blessing of the same or the opposite element ([Cancelling](#cancelling)).

### Peace

```
/six-demon-bag peace on:true
/six-demon-bag peace on:false
```

Make peace and there are **no hexes either way**: nobody can hex you, and you can't hex anyone. A hex already on you lifts at once (and the ward follows). Blessings still land on you, and you can still bless. Peace holds for **at least 7 days**: switching it off sooner is refused, privately, saying when you can. Making and ending peace are public.

## Your bag

```
/six-demon-bag status
/six-demon-bag status private:false
```

Only you see it, unless you add `private:false`, and it works in any channel. It shows:

- your Chi out of 20, with a bar
- the Chi you've earned today, from plays (of 4) and from freeing and curing (of 6)
- your casts left today, and your hex
- what's on you, who cast it, how many plays it has left and when it ends, with `/six-demon-bag shrug` beside a hex
- whether you're at peace (and when you can end it), or warded (and until when)
- what each of the twelve charms does

Your [game card](./games-card#scoreboard) has a **🎒 Six-Demon Bag** section too, on the all-games card, for anyone with some Chi, Chi earned or a cast today, something on them, or peace:

> ☯️ `14/20` Chi ▰▰▰▰▰▰▰▱▱▱ · today `+3/4` · `1 of 2` casts left
> On you: 🔥 Fired Up *(from Sam)* · 2 plays left — 🌫️ Lost in the Smoke *(hex, from Jo)* · 1 play left · `/six-demon-bag shrug`

At peace it adds ☮️ no hexes. In Discord, `/how-to-play topic:Six-Demon Bag` explains it all in one card, with your server's own switches.

## Turning it off

```
/eggshen-config commands toggle setting:magic enabled:false
/eggshen-config-games happenings hexes:false
```

- **`magic` off** switches the whole bag off. `/six-demon-bag` is refused, plays stop earning Chi, blessings and hexes already cast stop working, the 🧧 Red Envelope and 🀄 Ching Dai's Curse twists stop coming, and the bag leaves `/how-to-play`, `/eggshen-help` and the card (the Blessings prize counter too). Admins and moderators can still open `/six-demon-bag status`, which says the bag is off; nothing else in it works for them either. Chi and charms aren't erased: switch it back on and they work again, though a charm keeps running out on its own clock.
- **`hexes:false`** keeps blessings, and ends every hex in place at once. No hex can be cast, Ching Dai's Curse doesn't come, and `/eggshen-config-games happenings` shows `• Hexes: off`.

Resetting scores for everyone, or for one member, also clears their Chi, their blessings and hexes, and their cast log. Resetting one game leaves the bag alone ([Resetting scores](./games-settings#resetting-scores)).

## Related

- [Playing & Points](./games-playing): the plays that earn Chi, and the limits casts share
- [Items, Prizes & Titles](./games-rewards): the Jade Charm, the Blessings prize and All That Kind of Thing
- [Twists & Happenings](./games-happenings): the Red Envelope, Ching Dai's Curse, and the statuses charms combine with
- [Siege](./games-siege): Chi for freeing and curing, and why a fighter can't be hexed
- [Games FAQ](/guides/games/faq): Chi and hexes, answered

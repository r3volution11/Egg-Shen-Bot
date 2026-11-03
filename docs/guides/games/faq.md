---
title: Games FAQ - Egg Shen Bot
description: Answers to common questions about Egg Shen Bot's Discord games - scores, why a play didn't score, items like the Golden Pie, titles, nights in a row, twists, happenings, and fighting a /siege monster together.
faq:
  - q: How do I play the games?
    a: Aim one at someone. `/foodfight throw target:@Sam`, `/doom fate target:@Sam` and `/potion give user:@Sam type:poison` hurt; `/foodfight feed target:@Sam`, `/rescue attempt target:@Sam` and `/potion give user:@Sam type:health` help. Every play has an outcome that moves points for you and, when you aimed at a member, for them too. For a quick tour in Discord, run `/how-to-play`.
  - q: How do I see my score, or someone else's?
    a: Run `/scoreboard` for your own game card, or `/scoreboard user:@Sam` for Sam's. You can also right-click someone (on mobile, open their profile) → **Apps** → **Game card**. `/leaderboard` shows the server's top players for the month, the year or all time, for example `/leaderboard period:month`.
  - q: Why didn't my play score?
    a: The games have limits so they can't be farmed. Each game can be played once every 20 seconds, 6 plays a minute across all of them, and only the first 20 plays of each game a day (UTC) score points. Past that daily cap you can keep playing for fun, but the play scores nothing, uses no item and moves no prize counter. Siege attacks score for the first 30 a day. Admins can change these numbers, and `/how-to-play` shows the ones your server uses.
  - q: How do I get items?
    a: Mostly from prizes. Every 25 food fight hits earns a Golden Pie, 15 tasty feeds Garlic, 25 dooms a Cursed VHS, 15 rescues Holy Water, 15 helpful potions an Antidote, 20 harmful potions a Lucky Penny, and every 750 points a random item. A Glovebox Find twist can drop one in, and a won siege pays loot. They wait in your Glovebox on `/scoreboard`, and they can't be traded.
  - q: How do I use an item, like a Golden Pie?
    a: Add `item:` to a play. `/foodfight throw target:@Sam item:Golden Pie` throws a sure hit with your points doubled, and `/foodfight feed target:@Sam item:Golden Pie` is always tasty. Discord lists only the items you hold that fit that play. You can use one item a play and 3 a day; Garlic, the Antidote and the Night Light aren't picked, they work by themselves.
  - q: Why does it say I don't have that item?
    a: An item only works if it's in your Glovebox and fits the play. A Golden Pie fits `/foodfight throw` and `/foodfight feed`, a Cursed VHS `/doom fate`, Holy Water `/rescue attempt`, a Lucky Penny `/potion give`, and a Silver Bullet only `/siege attack`. You may also have used your 3 items for today. A refused play costs nothing, not even your cooldown, and `/scoreboard` shows what you hold.
  - q: What do Garlic and the Antidote do?
    a: They protect you by themselves. Garlic turns a `/doom` aimed at you into an escape, then can't work again for 12 hours. The Antidote stops a harmful potion hurting you (the giver gets +1 instead of +2), then rests for 6 hours, and it also cures siege poison. With a rescue shield, they stop at most 3 plays on you a day.
  - q: How do titles work?
    a: A title is a badge for something you've done a lot, like Pie Sniper for 150 food fight hits, or had done to you a lot, like Red Shirt for being doomed 100 times. There are titles for streaks, nights in a row, twists and sieges too. Each is earned once and is worth +10 bonus points, and your `/scoreboard` card shows the ones you're closest to.
  - q: How do I show my title next to my name?
    a: Run `/scoreboard title:Pie Sniper` with a title you've earned; the list offers only those. It shows beside your name on your card and on `/leaderboard`. `/scoreboard title:No title` hides it.
  - q: What is nights in a row, and what's a Night Light?
    a: Make at least one scored play a night and your row grows. A night runs from 12:00 to 12:00 UTC, so a late watch party counts as one night. At 3 nights you get +1 on your first 3 good plays a day, at 7 on your first 4, and at 14 on your first 5. A Night Light, earned at 3 nights and then every 7 more, burns by itself to save your row when you miss one night, at most once in 7 days.
  - q: What's a twist?
    a: A twist is a small surprise that happens to the player after a play that scores, never to the person they aimed at, on 4% of plays by default. Some are good (Loose Change +3, a Glovebox Find) and some bad (Pickpocketed −3, Bitten). You get at most 3 a day, the one after a bad twist is always good, and twists take at most 8 points a day and never take your month below 0.
  - q: What's a happening, like a Full Moon?
    a: Something that changes the games for the whole server for a while, announced with a new message. During a Full Moon (an hour) every `/doom` scores double, both ways; The Fog makes throws miss; Double Feature makes every point count twice. A play a happening changed shows its tag, like 🌕×2. There's one at a time, and about one a day on a busy server.
  - q: How do I turn twists or happenings off?
    a: Admins and moderators use `/eggshen-config-games happenings`. `/eggshen-config-games happenings twists:false` switches twists off, and `twist-percent:` (0 to 15) makes them rarer or likelier. `/eggshen-config-games happenings enabled:false` switches happenings off, Halloween Night and Friday the 13th included, and `/eggshen-config-games happenings frequency:rare` makes them less frequent. Random sieges have their own setting, `/eggshen-config-games happenings siege-frequency:off` (or `rare`, `normal`, `often`), and `siege-minutes:` (30 to 60) sets how long one lasts. Run it with no options to see the current settings.
  - q: What is a siege?
    a: A siege is a monster attack on a games channel that the whole server fights together, with `/siege attack weapon:food`, `/siege attack weapon:doom` or `/siege attack weapon:potion`. Beat the monster within its time, usually 45 minutes, and everyone who fought is paid, with a bonus and loot for the MVP; if it escapes, everyone who attacked loses 3 points. Sieges start at random a few times a week, or when an admin runs `/siege start`.
  - q: How do I attack the monster?
    a: To attack the monster, go to the siege's channel (or a thread of it) and run `/siege attack weapon:food`, `/siege attack weapon:doom` or `/siege attack weapon:potion`. Food does 8 damage on a splat, a doom 16 on a smite, and a potion 4 now and then 2 a minute for 5 minutes. A Silver Bullet (`item:Silver Bullet`) can't backfire and does three times the damage, and `/siege status` shows your damage and place.
  - q: Someone got grabbed by the monster. How do I save them?
    a: Rescue them as usual, with `/rescue attempt target:@Sam`. If they're rescued they're free, and it counts +12 toward your share of the rewards; if you're sacrificed they're free but the monster takes you instead; if you're caught, they're still held and someone has to try again. A fighter not freed within 10 minutes loses 5 points and is out of the fight, and nobody can free themselves.
  - q: How do I cure a poisoned fighter?
    a: Give them a helpful potion, `/potion give user:@Sam type:health`. If it works they're cured, and the cure counts +8 toward your share of the rewards. An Antidote in their own Glovebox cures it too, and the poison wears off by itself after 15 minutes.
  - q: Who gets rewards from a siege?
    a: When it's beaten, everyone who attacked splits a pool of 8 points per fighter (24 to 200) by their share of the damage, plus 12 for each fighter they freed and 8 for each cure; each gets 2 to 30. The MVP gets +5 more and a loot item, and anyone else with at least 5% has a 25% chance of loot. Rewards are paid for at most 2 won sieges per member a day, and a siege won by one fighter alone pays only their share of the pool.
  - q: How do I start a siege?
    a: Admins and moderators run `/siege start` in a channel where the games are played, optionally picking the monster and how long it lasts, for example `/siege start monster:blob minutes:45`. Only one runs at a time, and `/siege end` calls it off with no rewards and no penalties. Monsters also attack at random a few times a week while members are playing.
  - q: Why can't I attack the monster?
    a: You're told why, privately, and no cooldown is spent. There may be no siege on, you may be in the wrong channel (fight it in its own channel or a thread of it), it may already be beaten or out of time, or that weapon's game may be switched off. You also can't attack while the monster has you caught (someone has to `/rescue attempt` you) or once you're out of the fight.
  - q: Can I reset my scores?
    a: Not yourself. An admin or moderator can, with `/eggshen-config-games reset-scores confirm:yes user:@Sam` for one member, adding `game:doom` for one game, or leaving both out for everyone. It's permanent, and resetting a member also clears their Glovebox, prize counters, titles and nights row.
  - q: How do I turn a game off, or keep the games to one channel?
    a: Admins and moderators switch a game off with `/eggshen-config commands toggle setting:siege enabled:false` (or `potion`, `foodfight`, `doom`, `rescue`). To keep the games to one channel, use `/eggshen-config-games channels mode:only add:#games`. Switched-off games disappear from `/how-to-play`, `/scoreboard` and `/leaderboard`.
---

# Games FAQ

<FaqList />

## Still stuck?

The [quick guides](./) walk through [playing](./play) and [fighting a siege](./siege). Every rule and number is in [Games & Scores](/commands/games), and in Discord `/how-to-play` shows a short card for each topic with your server's own limits.

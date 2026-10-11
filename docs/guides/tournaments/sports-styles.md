---
title: Sports-Style Tournaments (March Madness, NFL, World Cup) - Egg Shen Bot
description: Run a Discord movie, TV or game tournament like March Madness, the College Football Playoff, the NFL or MLB playoffs, or the World Cup - which seeding, tie and size settings give each format.
---

# Sports-Style Tournaments

Most people already know a tournament format from sports. Pick the one that sounds like what you want, and this page gives you the settings and the command that get you closest to it.

Every tournament's shape comes from three settings, all chosen when you create it:

- **Size** (`max-titles`). It sets how many rounds there are and how many titles skip round one (byes). It also decides between a straight bracket and a groups stage.
- **Seeding** (`seeding`). **Random** shuffles the titles. **The order I add them** makes you the selection committee. **By rating** ranks the titles by their TMDB, RAWG, BoardGameGeek or Google Books rating. Seeded brackets show each title's seed, for example **(1) Halloween**, and call out upsets.
- **Ties** (`ties`). **Runoff vote** settles a tie with a short extra vote. **Higher seed wins** sends the better seed through, which is the closest thing to home-field advantage.

## Pick a style

| If you want it like… | Titles | Seeding | Ties | What it feels like |
| --- | --- | --- | --- | --- |
| [NCAA March Madness](#ncaa-march-madness) | 16 or 32 | By rating | Runoff vote | Favourites kept apart, and plenty of upsets to call out |
| [College Football Playoff](#college-football-playoff) | 12 | The order I add them | Higher seed wins | Your top four rest while seeds 5–12 fight for a shot at them |
| [NFL playoffs](#nfl-playoffs) | 14 | The order I add them | Higher seed wins | Only the very top seeds get a week off |
| [MLB postseason](#mlb-postseason) | 12 | The order I add them | Runoff vote | Four byes, then long voting windows instead of series |
| [NBA or NHL playoffs](#nba-or-nhl-playoffs) | 16 | The order I add them | Runoff vote | A full 16 with no byes |
| [FIFA World Cup](#fifa-world-cup) | 48 | Doesn't apply | Runoff vote | Groups of four first, then a knockout |
| [FA Cup draw](#fa-cup-draw) | Any | Random | Runoff vote | Anyone can meet anyone |

Every recipe is a starting point. Mix them freely: a World Cup–sized field of horror films is as valid as a 4-title playoff of Muppet movies.

### What carries over from sports, and what doesn't

The bot runs **single elimination**: each matchup is one vote, and the winner moves on. It has no best-of series, no home and away legs, and no reseeding between rounds. A straight bracket holds up to 32 titles as one field. Real leagues split into conferences or regions, but the bot seeds the whole field together. The recipes below say where a format differs.

## NCAA March Madness

**The real thing:** a selection committee seeds 68 basketball teams into four regions, 1 through 16. The 1 seed plays the 16, the 8 plays the 9, and the top seeds can't meet until late. People watch for the upsets: a 12 beating a 5 every year, and a 16 beating a 1 almost never. Games can't end tied; overtime settles them.

**In Egg Shen Bot:**

```
/bracket-setup create name:"Horror Madness" max-titles:32 seeding:By rating ties:Runoff vote
```

- **By rating** acts as the selection committee. The best-rated title is seed 1, and round one pairs 1 v 32, 16 v 17, 8 v 25 and so on down the bracket. Choose **The order I add them** instead to be the committee yourself.
- **Upsets are called out.** When a worse seed wins, the result says so, for example **🚨 Upset! (12) knocks out (5)**.
- **A runoff vote is the overtime.** A tied matchup gets a short extra vote instead of being decided for you.
- **How it differs:** the bot seeds one field of up to 32, so seed 1 meets seed 32 rather than four regions each starting 1 v 16. Large rounds are still labelled by region (1A, 2B…). 16 titles is a good "Sweet 16" version.

## College Football Playoff

**The real thing:** twelve teams are ranked. The top four get a first-round bye. Seeds 5–12 play first, 5 v 12, 6 v 11, 7 v 10 and 8 v 9, on the higher seed's home field. The winners then face the top four.

**In Egg Shen Bot**, this layout comes out exactly. Add 12 titles to a 16-slot bracket and seed them:

```
/bracket-setup create name:"The Playoff" max-titles:16 seeding:The order I add them ties:Higher seed wins
```

- **Twelve titles in a 16-slot bracket means four byes,** and byes always go to the top seeds. Seeds 1–4 skip round one.
- **Round one is 5 v 12, 6 v 11, 7 v 10 and 8 v 9.** The 8/9 winner meets the 1 seed, the 5/12 winner meets 4, the 7/10 winner meets 2, and the 6/11 winner meets 3, as in the real playoff.
- **The order you add the titles is your ranking,** so you're the committee. On the [setup form](/commands/brackets/import#seeding), the ↑ ↓ buttons reorder them.
- **Higher seed wins** stands in for home field: a tie goes to the better seed. Use **Runoff vote** if you'd rather every tie be played out.

## NFL playoffs

**The real thing:** fourteen teams, seven from each conference. Only the two #1 seeds get a bye. After each round the top remaining seed plays the lowest (reseeding), and the higher seed hosts.

**In Egg Shen Bot:**

```
/bracket-setup create name:"Wild Card Weekend" max-titles:16 seeding:The order I add them ties:Higher seed wins
```

- **Add 14 titles.** That leaves two byes in a 16-slot bracket, so seeds 1 and 2 rest, like the two conference #1 seeds.
- **Higher seed wins** works as home field, as above.
- **How it differs:** the bot seeds one field rather than two conferences, so round one pairs 3 v 14, 4 v 13 and so on, not 2 v 7 within a conference. It also doesn't reseed; once built, the bracket's path is fixed.

## MLB postseason

**The real thing:** twelve teams. The top two division winners in each league get a bye, four byes in all. Every round after that is a best-of series.

**In Egg Shen Bot:**

```
/bracket-setup create name:"October Classic" max-titles:16 seeding:The order I add them
```

Then open each round with a long window, such as `/bracket open duration:3d`.

- **Add 12 titles** for four byes, like MLB's.
- **A long voting window is the series.** The bot has no best-of-seven, but a round that runs for days gives people time to come back and argue.
- **How it differs:** round one pairs 5 v 12, 6 v 11 and so on across one field, rather than 3 v 6 and 4 v 5 in each league.

## NBA or NHL playoffs

**The real thing:** sixteen teams, no byes, every round a best-of-seven series. The 1 seed plays the 8 seed in each conference.

**In Egg Shen Bot:**

```
/bracket-setup create name:"Playoff Picture" max-titles:16 seeding:The order I add them
```

- **Exactly 16 titles means no byes.** Everyone plays round one.
- **How it differs:** one field of 16, so 1 v 16 rather than 1 v 8 in each of two conferences, and one vote per matchup rather than a series.

## FIFA World Cup

**The real thing (2026):** 48 teams in 12 groups of four. The top two in each group go through, along with the 8 best third-placed teams, to a Round of 32. From there it's single elimination.

**In Egg Shen Bot**, this layout comes out exactly too:

```
/bracket-setup create name:"The Cinema Cup" max-titles:48
```

- **48 titles makes 12 groups of four.** Each voter picks their top two in each group.
- **The top two in each group plus the 8 best third-placed titles** (wildcards) make a Round of 32. Then it's a straight knockout.
- **Seeding and ties options don't apply to groups.** The knockout is seeded from the group results: group winners are placed first, and titles from the same group are kept apart in the first round where possible. Ties for 1st or 2nd in a group get a runoff vote.
- **The 2022 format** (32 teams, 8 groups, top two through) works too. Upload 32 titles in 8 groups on the [setup form](/commands/brackets/import). Or create with `max-titles:36` and run `/bracket-setup resize groups:8`.
- See the [groups tournament guide](./groups) for running the group stage.

## FA Cup draw

**The real thing:** no seeds at all. Every round is a random draw, so a giant can meet a minnow in round one.

**In Egg Shen Bot:**

```
/bracket-setup create name:"The Lucky Dip" max-titles:16
```

- **Random seeding is the default,** so there's nothing to set. The bracket is shuffled when it's built, and no seeds are shown.
- **Ties always get a runoff vote** with random seeding, because random seeds mean nothing.
- **How it differs:** the FA Cup redraws every round, while the bot draws once, when the bracket is built.

## A note on ties

Some real competitions really do send a tie to the better seed. In Mexico's Liga MX playoffs, for example, a quarterfinal or semifinal level on aggregate goes to the higher-placed team. That's what **Higher seed wins** does. Pick it when you want the regular-season favourite (your #1 seed) to be rewarded. Pick **Runoff vote** when you'd rather every matchup be decided by votes. **Runoff vote** is the default.

## Related

- [Seeded bracket](./seeded): how seeding, upsets and ties work in detail
- [Groups tournament](./groups): running a World Cup–style group stage
- [32-title bracket](./big-bracket): opening big rounds in parts
- [Command reference](/commands/brackets/commands#bracket-setup-create)

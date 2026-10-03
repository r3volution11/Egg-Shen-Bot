---
title: Tournament Brackets - Egg Shen Bot
description: Host movie and TV show tournaments with group stage voting, wildcards, knockout brackets, and automatic advancement. Perfect for entertainment communities running competitions.
head:
  - - meta
    - property: og:title
      content: Tournament Brackets - Egg Shen Bot
  - - meta
    - property: og:description
      content: Host comprehensive movie and TV tournaments with flexible group stages, dynamic wildcards, knockout brackets, and AI-generated matchup images.
  - - meta
    - property: og:url
      content: https://eggshenbot.com/commands/brackets/
  - - meta
    - name: twitter:title
      content: Tournament Brackets - Egg Shen Bot
  - - meta
    - name: twitter:description
      content: Host movie/TV tournaments with group voting, knockouts, and AI-generated bracket visualizations.
---

# Tournament Bracket System

Run a bracket tournament in your Discord server for movies, TV shows, video games, board games, or books. Members vote with buttons; the bot tallies votes, settles ties, and moves winners on to the next round.

::: tip New to tournaments?
The [Tournament Quick Guides](/guides/tournaments/) walk through the most popular setups in a few steps each: a [movie night bracket](/guides/tournaments/movie-night), [one matchup at a time](/guides/tournaments/one-at-a-time), a [32-title bracket](/guides/tournaments/big-bracket) and a [groups tournament](/guides/tournaments/groups).
:::

## Quick FAQ

**Q: What shapes of tournament are there?**  
A: Two:
- **Straight bracket** - 2 to 32 titles, no groups. Head-to-head matchups from round one.
- **Groups tournament** - 4 to 12 groups of exactly 4 titles. Members vote in groups first, then the qualifiers go into a knockout.

**Q: How do I choose?**  
A: With `max-titles` when you create the tournament. 2, 4, 8, 16, or 32 makes a straight bracket; 36, 40, 44, or 48 makes a groups tournament with 9–12 groups. You can change the group count later with `/bracket resize` (4–12). A straight bracket doesn't have to be full: with 12 titles in a 16-title bracket, 4 titles get byes.

**Q: Do I have to add titles one at a time?**  
A: No. The [setup form](./import) lets you set up a whole tournament by uploading a CSV or JSON file, or by filling it in. Run `/bracket setup-link` to get a private link to it.

**Q: What types of tournaments can I run?**  
A: Movies, TV shows, video games, board games, or books. Each tournament is a single type.

**Q: How does the search work?**  
A: `/bracket manage-titles action:add` searches TMDB (movies/TV), RAWG (games), BoardGameGeek (board games), or Google Books. One match is added right away. Several matches show a menu so you can pick the right one.

**Q: Who can create and manage tournaments?**  
A: Server administrators and moderators. Everyone can vote.

**Q: How do wildcards work?**  
A: Groups tournaments only. The top 2 from each group go through. The best third-place finishers then fill the knockout up to the next power of 2 (4, 8, 16, or 32), at most one per group. For example: 12 groups = 24 + 8 wildcards = 32; 9 groups = 18 + 9 wildcards = 27. Leftover slots (5 of 32 in that case) become byes, and the group winners get them.

**Q: What happens if there's a tie?**  
A: The bot starts a short tiebreaker vote (1 hour by default) with a button for each tied option. At the deadline it counts the votes and resolves the tie, picking at random if nobody voted. Admins can settle one early with `/bracket resolve-tiebreaker`: leave `winner` blank to go by the current votes, or give a number to choose the winner.

**Q: Can users change their votes?**  
A: Yes, any time before the group or matchup closes.

**Q: Can we run more than one tournament at once?**  
A: No. One tournament per server. Cancel or finish the current one before starting another.

---

## 🚀 Quick Start Guide

This walks through a small straight bracket from creation to a champion. For a groups tournament, see [Setup & Group Stage](./setup).

### Step 1: Create the Tournament (Admin Only)

```
/bracket create name:"Horror Movie Showdown" max-titles:8
```

✅ Only you can see the reply, so you can set up privately.

::: tip Setting up many titles?
Instead of Steps 1–2, run `/bracket setup-link` and use the [setup form](./import) to upload a CSV or JSON file or fill the tournament in.
:::

### Step 2: Add Titles (Admin Only)

```
/bracket manage-titles action:add type:movie title:"The Thing"
/bracket manage-titles action:add title:"Alien"
/bracket manage-titles action:add title:"The Exorcist"
/bracket manage-titles action:add title:"The Shining"
```

Add up to 8. `type` is only needed on the first one.

💡 **Tip:** If several matches come up, pick the right one from the menu. Check what you've added with `/bracket list-groups`.

### Step 3: Announce the Tournament (Admin Only)

```
/bracket announce message:"🎬 Horror Movie Showdown starts NOW! Vote for your favorites!"
```

📢 Now everyone can see it.

### Step 4: Open Round One (Admin Only)

```
/bracket open duration:24h
```

The bot builds the bracket (random seeding by default) and opens the first round.

**→ [Learn more about setup, seeding, and groups](./setup)**

### Step 5: Members Vote (Everyone)

Click **Start Voting** on the voting message to get your personal voting dashboard.

![Personal Voting Dashboard](/images/examples/tournaments/voting-dashboard.png)
*Personal voting dashboard tracks your progress and streak*

- Pick one title in each matchup.
- Your choices are saved right away and you can change them before voting closes.
- Check your votes any time with `/bracket my-votes`.

### Step 6: Close the Round (Admin Only)

```
/bracket close
```

The bot closes every open matchup in the round and moves the winners on. Ties start a short tiebreaker vote. Voting also closes by itself at the deadline.

**Check progress any time:**

```
/bracket status
```

![Tournament Status](/images/examples/tournaments/tournament-status.png)
*Tournament status showing active knockout voting with live vote counts*

### Step 7: Repeat for Each Round

Open → Vote → Close, until the final:

```
/bracket open
/bracket close
```

For finer control, open or close single matchups with `/bracket open-matchup` and `/bracket close-matchup`.

**→ [Learn about knockout rounds and regions](./knockout)**

### Step 8: Champion Crowned! 🏆

```
🏆 Tournament Complete!

The Thing is the champion!
Congratulations! 🎉
```

---

## 💡 Pro Tips

**Timing & Pacing:**
- Use `duration:48h` for slower tournaments and `duration:1h` for live events.
- Open matchups one at a time or by region for drama.

**Keep Members Engaged:**
- Announce when new groups or rounds open.
- Remind members to check `/bracket my-votes`.
- The bot posts the bracket as an image whenever matchups are decided; `/bracket view` draws it any time.

**Manage Efficiently:**
- `/bracket status` shows progress and live vote counts.
- `/bracket list-groups` gives a plain numbered list of titles.

**→ [See more tips and advanced features](./tips)**

---

## Tournament Structure

### Straight Bracket

- 2 to 32 titles, no groups
- `/bracket open` builds the bracket and opens round one
- Seeding is random by default, or ordered (your list order) through the [setup form](./import)

### Groups Tournament

**Phase 1: Group Stage**
- 4–12 groups (A through L), exactly 4 titles each
- Members pick their top 2 in each group
- Top 2 go through, plus wildcards if needed

**Phase 2: Knockout**
- `/bracket open` starts it once every group is closed
- Continues like a straight bracket

**→ [Complete setup guide](./setup)**

### Knockout Rounds (both shapes)

- Single elimination: Round of 32 → Round of 16 → Quarterfinals → Semifinals → Finals
- Matchups are labeled by region (1A, 2B, …) across 4 regions
- Open a whole round, one region, or single matchups
- Winners move on automatically

**→ [Complete knockout guide](./knockout)**

---

## Key Features

✅ **Search Integration** - TMDB, RAWG, BGG, and Google Books with selection menus  
✅ **Setup Form** - Upload a CSV or JSON file, or fill in a form  
✅ **Flexible Voting** - Durations from 5 minutes to 30 days  
✅ **Regions** - Matchups labeled by region for easy reference  
✅ **Auto-Advancement** - Winners fill the next round automatically  
✅ **Visual Brackets** - `/bracket view` draws the bracket as an image  
✅ **Deadline Tracking** - Every voting message shows time remaining  
✅ **Voting Dashboard** - Members see which matchups they've voted in  
✅ **Granular Control** - Open or close whole rounds, regions, or single matchups  

---

## Documentation

- **[Setup & Group Stage](./setup)** - Create tournaments, add titles, run the group stage
- **[Setup Form](./import)** - Set up a tournament from a CSV or JSON file
- **[Knockout Rounds](./knockout)** - Regions, opening options, running the knockout
- **[Command Reference](./commands)** - Every bracket command
- **[Tips & Strategies](./tips)** - Pacing, extending deadlines, AI images

---

## Need Help?

- Check the [Command Reference](./commands) for command details
- See [Tips & Strategies](./tips) for pacing ideas
- Use `/bracket status` to check tournament progress
- Use `/bracket my-votes` to see your own votes

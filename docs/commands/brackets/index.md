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

**Host comprehensive tournaments** in your Discord server for movies, TV shows, video games, board games, or books! Features a complete group stage with smart search integration, wildcard system, and single-elimination knockout bracket. Perfect for entertainment communities running competitions like "The Shudder Discord Gore Cup" or similar events.

## Quick FAQ

**Q: How many entries can participate in a tournament?**  
A: Between 16 and 48 entries - organized into 4-12 groups (default 8) of 4 entries each. Choose the size when creating your tournament.

**Q: What types of tournaments can I run?**  
A: Movies, TV shows, video games, board games, or books. Each tournament must be a single type (can't mix movies and TV shows in the same tournament).

**Q: How does the search integration work?**  
A: When adding entries with `/bracket add-title`, the bot searches TMDB (movies/TV), RAWG (video games), BoardGameGeek (board games), or Google Books. If it finds a single match, it's added automatically. If multiple matches are found, you'll see a selection menu (just like `/movie` or `/tv`) where you can choose the exact title you want.

**Q: Who can create and manage tournaments?**  
A: Only server administrators and moderators can create, manage, and advance tournaments. All members can vote.

**Q: How do wildcards work?**  
A: After group stage, the top 2 from each group advance automatically. Then the system calculates how many third-place finishers are needed to reach the next power of 2 (4, 8, 16, or 32). For example: 8 groups = 16 direct + 0 wildcards = 16 total; 12 groups = 24 direct + 8 wildcards = 32 total.

**Q: What happens if there's a tie?**  
A: The system uses random selection as a tiebreaker - ensuring fair and unbiased results.

**Q: Can users change their votes?**  
A: Yes! Users can change their votes anytime before the group or matchup is closed.

**Q: Can we run multiple tournaments at once?**  
A: No, only one tournament can be active per server at a time. You must cancel or complete the current tournament before starting a new one.

---

## 🚀 Quick Start Guide

**Want to run your first tournament? Here's a complete walkthrough from creation to crowning a champion!**

### Step 1: Create Tournament (Admin Only)

```
/bracket create name:Horror Movie Showdown groups:4
```

✅ Tournament created! Only you can see this message. Continue setup privately.

### Step 2: Add 4 Titles to Each Group (Admin Only)

**Group A:**
```
/bracket add-title group:A type:movie title:The Thing
/bracket add-title group:A type:movie title:Alien
/bracket add-title group:A type:movie title:The Exorcist
/bracket add-title group:A type:movie title:The Shining
```

**Repeat for Groups B, C, D** with different movies.

💡 **Tip:** If multiple matches appear, you'll see a dropdown menu to select the exact title you want (just like `/movie`).

### Step 3: Announce Tournament (Admin Only)

```
/bracket announce message:🎬 Horror Movie Tournament starts NOW! Vote for your favorites!
```

📢 Now everyone can see the tournament exists!

### Step 4: Open Groups for Voting (Admin Only)

```
/bracket open-groups groups:A,B,C,D duration:24h
```

🗳️ Members can now vote! They'll see a balanced 2x2 grid of all groups.

**→ [Learn more about setup and group voting](./setup)**

### Step 5: Members Vote (Everyone)

```
/bracket vote-group group:A choice1:1 choice2:3
```

Check your voting status: `/bracket my-votes`

### Step 6: Close Group Voting (Admin Only)

```
/bracket close-groups groups:A,B,C,D
```

📊 Results calculated! Top 2 from each group advance. Best 3rd place finishers become wildcards.

### Step 7: Advance to Knockout (Admin Only)

```
/bracket advance-knockout
```

🏆 Knockout bracket generated!

**Check tournament status anytime:**

```
/bracket status
```

![Tournament Status](../public/images/examples/tournaments/tournament-status.png)
*Tournament status showing active knockout voting with live vote counts*

### Step 8: Open Knockout Round (Admin Only)

**Choose your opening style:**

```
# Option A: Open entire round at once
/bracket open-knockout duration:24h

# Option B: Open by region (left/right sides)
/bracket open-region region:1 duration:24h

# Option C: Open individual matchups
/bracket open-matchup matchup:1A duration:24h
```

💡 **Regional Labels:** Matchups use labels like **1A, 1B** (left side) and **2A, 2B** (right side) for easy reference.

**→ [Learn about knockout rounds and regional system](./knockout)**

### Step 9: Members Vote on Matchups (Everyone)

Click buttons on each matchup message to vote.

### Step 10: Close Voting & Advance Winners (Admin Only)

```
/bracket close-knockout
```

🏁 Winners auto-advance to next round!

### Step 11: Repeat for Each Round

Continue the cycle: Open → Vote → Close → Auto-Advance

**Rounds progress:** Round of 16 → Quarterfinals → Semifinals → Finals

### Step 12: Champion Crowned! 🏆

```
🏆 Tournament Complete!

The Thing is the champion!
Congratulations! 🎉
```

---

## 💡 Pro Tips

**Timing & Pacing:**
- Use `duration:48h` for slower-paced tournaments
- Use `duration:1h` for live events
- Open matchups individually or by region for dramatic pacing

**Keep Members Engaged:**
- Announce when new groups/rounds open
- Remind members to check `/bracket my-votes`
- Share `/bracket view` to show visual bracket

**Manage Efficiently:**
- Use `/bracket status` to check progress anytime
- Use `/bracket list-groups` for simple text overview
- Open 4 groups at a time to avoid overwhelming voters

**→ [See more tips and advanced features](./tips)**

---

## Tournament Structure

### Phase 1: Group Stage

- **4-12 groups** (A through L) with 4 entries each
- Smart search integration with selection menus
- Members vote for top 2 in each group
- Top 2 advance automatically + wildcards if needed

**→ [Complete setup guide](./setup)**

### Phase 2: Knockout Bracket

- **Single-elimination tournament** starting at Round of 32 (or smaller)
- **Regional organization**: Left side (Region 1), Right side (Region 2)
- **Flexible opening**: Open entire round, by region, or individual matchups
- Winners automatically advance to next round
- Rounds: Round of 32 → Round of 16 → Quarterfinals → Semifinals → Finals

**→ [Complete knockout guide](./knockout)**

---

## Key Features

✅ **Smart Search Integration** - TMDB, RAWG, BGG, and Google Books with selection menus  
✅ **Flexible Voting** - Customizable durations (5 minutes to 30 days)  
✅ **Regional System** - Organize matchups by left/right sides with clear labels  
✅ **Auto-Advancement** - Winners automatically populate next round  
✅ **Visual Brackets** - Generate beautiful PNG bracket images  
✅ **AI Images** - Generate custom matchup vs images with OpenAI  
✅ **Deadline Tracking** - Shows time remaining on all voting embeds  
✅ **Voting Dashboard** - Members can check their voting status anytime  
✅ **Granular Control** - Open/close entire rounds, regions, or individual matchups  

---

## Documentation

- **[Setup & Group Stage](./setup)** - Create tournaments, add titles, manage group voting
- **[Knockout Rounds](./knockout)** - Regional system, opening options, managing knockout bracket
- **[Command Reference](./commands)** - Complete list of all bracket commands
- **[Tips & Strategies](./tips)** - Advanced features, AI images, pacing strategies

---

## Need Help?

- Check [Command Reference](./commands) for specific command details
- See [Tips & Strategies](./tips) for advanced workflows
- Use `/bracket status` to check tournament progress anytime
- Use `/bracket my-votes` to see your voting status

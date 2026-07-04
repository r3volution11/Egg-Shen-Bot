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
A: Specific valid sizes only, to ensure clean tournament structures:
- **Bracket Mode**: 2, 4, 8, 16, or 32 entries (powers of 2 for balanced brackets)
- **Group Stage Mode**: 36, 40, 44, or 48 entries (multiples of 4 for complete groups)

The bot only allows these specific values to prevent awkward structures like incomplete groups or brackets with excessive byes.

**Q: How do I choose which mode to use?**  
A: You don't! Just specify the max number of titles when creating (`/bracket create max-titles:16`). The bot automatically detects the best tournament structure based on size. Discord shows a dropdown with labeled options like "8 titles (Quarterfinals)" or "36 titles (9 groups)".

**Q: What types of tournaments can I run?**  
A: Movies, TV shows, video games, board games, or books. Each tournament must be a single type (can't mix movies and TV shows in the same tournament).

**Q: How does the search integration work?**  
A: When adding entries with `/bracket add-title`, the bot searches TMDB (movies/TV), RAWG (video games), BoardGameGeek (board games), or Google Books. If it finds a single match, it's added automatically. If multiple matches are found, you'll see a selection menu (just like `/movie` or `/tv`) where you can choose the exact title you want.

**Q: Who can create and manage tournaments?**  
A: Only server administrators and moderators can create, manage, and advance tournaments. All members can vote.

**Q: How do wildcards work?**  
A: After group stage, the top 2 from each group advance automatically. Then the system calculates how many third-place finishers are needed to reach the next power of 2 (4, 8, 16, or 32). For example: 8 groups = 16 direct + 0 wildcards = 16 total; 12 groups = 24 direct + 8 wildcards = 32 total.

**Q: What happens if there's a tie?**  
A: The bot automatically creates a short tiebreaker voting round (default 1 hour, configurable). Members vote again between the tied options. If the tiebreaker also ties, random selection is used as a final fallback.

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
/bracket manage-titles action:"Add Title" group:A type:movie title:The Thing
/bracket manage-titles action:"Add Title" group:A type:movie title:Alien
/bracket manage-titles action:"Add Title" group:A type:movie title:The Exorcist
/bracket manage-titles action:"Add Title" group:A type:movie title:The Shining
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

Click the **"Start Voting"** button on the voting message to see your options!

**How voting works:**
- Click 2 buttons to select your favorites in each group
- Your selections are saved instantly
- You can change your votes anytime before voting closes

Check your voting status: `/bracket my-votes`

### Step 6: Close Group Voting (Admin Only)

```
/bracket close-groups groups:A,B,C,D
```

📊 Results calculated! Top 2 from each group advance. Best 3rd place finishers become wildcards.

💡 **Tip:** Add `tiebreaker-duration:30m` if you want faster tiebreaker rounds!

### Step 7: Advance to Knockout (Admin Only)

```
/bracket advance-knockout
```

🏆 Knockout bracket generated!

**Check tournament status anytime:**

```
/bracket status
```

![Tournament Status](/images/examples/tournaments/tournament-status.png)
*Tournament status showing active knockout voting with live vote counts*

### Step 8: Open Knockout Round (Admin Only)

**🆕 Use the smart command (recommended):**

```
/bracket open duration:24h
```

The bot automatically detects which round you're in and opens all matchups!

**Or use granular control for specific matchups:**

```
# Open specific matchups
/bracket open-matchup matchup:1A,1B,2A duration:24h

# Leave matchup parameter blank for interactive button selection
/bracket open-matchup duration:24h
```

💡 **Regional Labels:** Matchups use labels like **1A, 1B, 2C, 2D** for easy reference across 4 regions.

**→ [Learn about knockout rounds and regional system](./knockout)**

### Step 9: Members Vote on Matchups (Everyone)

Click the **"Start Voting"** button to get your personal voting dashboard.

![Personal Voting Dashboard](/images/examples/tournaments/voting-dashboard.png)
*Personal voting dashboard tracks your progress and streak*

**What you'll see:**
- 🗳️ All open matchups with buttons to vote
- 🔥 Your voting streak and total votes
- 💜 Purple buttons show your current selections
- ⚡ Real-time updates as you vote
- 📊 Live standings visible to everyone

### Step 10: Close Voting & Advance Winners (Admin Only)

**🆕 Use the smart command (recommended):**

```
/bracket close
```

The bot automatically detects which round you're in, closes all matchups, and advances winners!

**Or use granular control for specific matchups:**

```
/bracket close-matchup matchup:1A,2B
```

🏁 Winners auto-advance to next round! Ties automatically create short tiebreaker votes.

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

---
title: Tournament Commands - Egg Shen Bot
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
      content: https://eggshenbot.com/commands/tournaments.html
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
A: When adding entries, the bot automatically searches TMDB (movies/TV), RAWG (video games), BoardGameGeek (board games), or Google Books. If it finds a single match, it's added automatically. If multiple matches found, you'll need to be more specific (e.g., include the year).

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

## Tournament Structure

### Phase 1: Group Stage

- **4-12 groups** (A through L) with 4 entries each (you choose when creating)
- Choose type: movies, TV shows, video games, board games, or books
- Smart search automatically finds and adds entries from appropriate database
- Members vote for their **top 2 entries** in each group
- **Top 2 from each group** advance automatically
- **Dynamic wildcards:** Best third-place finishers needed to reach power of 2 (0-8 wildcards)
- **Example sizes:**
  - 4 groups = 8 direct + 0 wildcards = 8 total (Quarterfinals start)
  - 8 groups = 16 direct + 0 wildcards = 16 total (Round of 16 start)
  - 12 groups = 24 direct + 8 wildcards = 32 total (Round of 32 start)

### Phase 2: Knockout Stage

- **Round of 32** → **Round of 16** → **Quarterfinals** → **Semifinals** → **Finals**
- Single elimination (1v1 matchups)
- Members vote for one entry per matchup
- Winners advance automatically to next round
- Random tiebreaker for tied matchups

---

## Commands Reference

### Create Tournament

```
/bracket create name:[tournament name] groups:[4-12]
```

**Parameters:**
- `name` (required) - Tournament name (e.g., "The Shudder Discord Gore Cup")
- `groups` (optional) - Number of groups (4-12, default 8). Each group has 4 entries.

**Who can use:** Administrators and Moderators only

**Features:**
- Only one tournament per server at a time
- Tournament enters "setup" phase
- Flexible sizing: smaller tournaments for quick events, larger for epic competitions
- Wildcards calculated automatically based on group count
- Type determined by first `/bracket add-group` command

**Examples:**
```
/bracket create name:Quick Horror Showdown groups:4
/bracket create name:Monthly Movie Madness groups:8
/bracket create name:The Shudder Discord Gore Cup groups:12
```

---

### Add Entries to Group

```
/bracket add-group group:[A-L] type:[movie/tv/game/boardgame/book] title1:[title] title2:[title] title3:[title] title4:[title]
```

**Parameters:**
- `group` (required) - Group letter (A through L)
- `type` (required) - Tournament type: movie, tv, game, boardgame, or book
- `title1`-`title4` (required) - Four titles to search for

**Who can use:** Administrators and Moderators only

**Features:**
- **Smart search integration**: Automatically searches TMDB, RAWG, BGG, or Google Books based on type
- **Automatic title resolution**: Selects title if single match found
- **Metadata storage**: Stores IDs, years, poster URLs, and ratings
- **Error handling**: Shows helpful guidance if multiple or no matches found
- **Type validation**: Prevents mixing different types in same tournament
- Shows progress (e.g., "8/12 groups added")
- Can overwrite existing group entries

**Examples:**
```
/bracket add-group group:A type:movie title1:"The Exorcist 1973" title2:"Halloween 1978" title3:"The Texas Chain Saw Massacre 1974" title4:"Night of the Living Dead 1968"

/bracket add-group group:B type:tv title1:"Breaking Bad" title2:"The Wire" title3:"The Sopranos" title4:"Mad Men"

/bracket add-group group:C type:game title1:"Doom Eternal" title2:"Resident Evil 4" title3:"Halo 3" title4:"Bioshock"
```

**Tips:**
- Include years for common titles to avoid ambiguity (e.g., "Spider-Man 2002")
- If search finds multiple matches, be more specific with your title
- All entries in a tournament must be the same type
- Bot displays titles with years: "The Thing (1982)"
- Stored metadata enables future poster/link features

---

### Open Group Voting

```
/bracket open-groups groups:[group letters]
```

**Parameters:**
- `groups` (required) - Comma-separated group letters (e.g., "A,B,C,D")

**Who can use:** Administrators and Moderators only

**Features:**
- Open multiple groups at once
- Posts embed showing all movies in each group
- Voting opens immediately
- Members can vote for top 2 in each group

**Examples:**
```
/bracket open-groups groups:A,B,C,D
/bracket open-groups groups:E,F,G,H
/bracket open-groups groups:I,J,K,L
```

**Recommended Strategy:**
- Open 4 groups per day to maintain engagement
- Allow 24+ hours per batch for voting
- Stagger opening to avoid overwhelming voters

---

### Vote in Group Stage

```
/bracket vote-group group:[A-L] choice1:[1-4] choice2:[1-4]
```

**Parameters:**
- `group` (required) - Group letter
- `choice1` (required) - First choice (1-4, corresponding to entry position)
- `choice2` (required) - Second choice (1-4, must be different from choice1)

**Who can use:** All server members

**Features:**
- Vote for your top 2 entries in each group
- Can change votes anytime before close
- Choices must be different entries
- Private confirmation message

**Examples:**
```
/bracket vote-group group:A choice1:1 choice2:3
/bracket vote-group group:B choice1:2 choice2:4
```

**Tips:**
- You can vote in multiple groups
- Change your vote by running the command again
- Results are hidden until voting closes

---

### Close Group Voting

```
/bracket close-groups groups:[group letters]
```

**Parameters:**
- `groups` (required) - Comma-separated group letters to close

**Who can use:** Administrators and Moderators only

**Features:**
- Closes voting and calculates results
- Determines top 2 and third place for each group
- Random tiebreaker for tied positions
- Posts results publicly with vote counts
- Shows medals: 🥇 First, 🥈 Second, 🥉 Third

**Examples:**
```
/bracket close-groups groups:A,B,C,D
/bracket close-groups groups:E,F,G,H,I,J,K,L
```

**Results Display:**
```
🏁 Group A, B, C, D Results

Group A
🥇 The Exorcist (45 votes)
🥈 Halloween (38 votes)
🥉 Night of the Living Dead (22 votes)

Group B
...
```

**When to Close:**
- After 24+ hours of voting
- When participation plateaus
- Before advancing to knockout stage

---

### Advance to Knockout Stage

```
/bracket advance-knockout
```

**Parameters:** None

**Who can use:** Administrators and Moderators only

**Features:**
- Calculates best 8 third-place finishers (wildcards)
- Generates Round of 32 matchups
- Pairs group winners with non-winners from different groups
- Randomized seeding for fairness
- Posts wildcard announcement

**Requirements:**
- All 12 groups must be closed
- Can only be used once per tournament

**Output:**
```
🏆 Round of 32 - Knockout Stage Begins!
32 matchups created

🎟️ Wildcards (Best 8 Third-Place)
1. Movie Title (15 votes, Group C)
2. Movie Title (14 votes, Group F)
...
8. Movie Title (10 votes, Group J)

32 movies remain • Use /bracket status to view bracket
```

**What Happens:**
- Tournament phase changes to "knockout"
- 16 matchups created for Round of 32
- Matchups are pending and ready to open
- Top 2 from each group + 8 wildcards = 32 movies

---

### View Tournament Status

```
/bracket status
```

**Parameters:** None

**Who can use:** All server members

**Features:**
- Shows current tournament phase and status
- Displays progress information
- Lists open voting opportunities
- Shows completion counts

**Example Outputs:**

**During Setup:**
```
🏆 The Shudder Discord Gore Cup
Status: setup
Phase: setup
Creator: @Username

Tournament is being set up.
Groups Added: 8/12
```

**During Group Stage:**
```
🏆 The Shudder Discord Gore Cup
Status: group_stage
Phase: groups

Group stage in progress!
Open for voting: A, B, C, D
Completed: 8/12 groups
```

**During Knockout:**
```
🏆 The Shudder Discord Gore Cup
Status: knockout
Phase: round_of_16

Round Of 16
Single elimination bracket

Open matchups: 3
Completed: 5
```

**After Completion:**
```
🏆 The Shudder Discord Gore Cup
🎉 Tournament Complete!

Winner: The Exorcist
```

---

### View Visual Bracket

```
/bracket view
```

**Parameters:** None

**Who can use:** All server members

**Features:**
- Generates a March Madness-style bracket visualization
- Shows all knockout rounds with matchup tree structure
- Displays participant names with winner highlighting (green ✓)
- Includes VS indicators and connector lines between rounds
- Shows champion trophy when tournament complete
- Discord dark theme styling
- Generated on-demand as PNG image attachment
- **Only available during knockout phase**

**Visual Elements:**
- Round labels (Round of 32/16, Quarterfinals, Semifinals, Finals)
- Participant boxes with movie titles
- Type indicators (Winner/Runner-up/Wildcard)
- Green highlighting for winners with checkmarks
- Trophy emoji and "CHAMPION" label for winner
- Connector lines showing bracket progression

**Example:**
```
/bracket view
```

**Output:**
- High-quality PNG image showing the full tournament bracket
- All matchups organized by round
- Current state with completed and pending matches
- Easy to share for social media or server announcements

---

### Generate AI Matchup Image

```
/bracket image [title1:"Title A"] [title2:"Title B"] [prompt:"details"]
/bracket image [matchup:"Title A vs Title B"]
```

**Parameters:**
- `title1` (optional) - First title for freeform generation (validates through APIs)
- `title2` (optional) - Second title for freeform generation (validates through APIs)
- `matchup` (optional) - Tournament matchup to visualize (e.g., "The Thing vs Alien")
- `prompt` (optional) - **NEW!** Additional details for image generation (e.g., "set in space with stars")

**Who can use:** All server members (subject to rate limits)

**Features:**
- **NEW: Smart Search Validation** - Automatically searches TMDB, RAWG, BGG, and Google Books to validate titles
- **NEW: Custom Prompt Details** - Add specific style/setting instructions
- **NEW: Cross-Type Support** - Compare movies vs games, TV shows vs books, etc.
- **Freeform generation** - Create AI images for ANY two titles, anytime!
- **Works without tournament** - No need for active tournament or knockout phase
- **Tournament support** - Still works with active tournament matchups
- Generates AI-powered "vs" poster mashups using OpenAI
- Creates dramatic split-screen compositions with bold VS text
- **Strict Layout** - Title 1 always on left, VS center, Title 2 always on right
- Wide format (1792x1024) perfect for epic showdowns
- Standard quality ($0.04 per image, cost shown in embed)
- Cinematic style with high contrast and dramatic lighting
- **Rate Limited** - Default: 5-min cooldown, 10/day per user, 50/day per server
- **Requires OpenAI API key** configuration

**Freeform Generation:**
```
/bracket image title1:"Godzilla" title2:"King Kong"
/bracket image title1:"The Exorcist" title2:"The Shining"
/bracket image title1:"Breaking Bad" title2:"The Wire"
```

**With Custom Prompt Details (NEW!):**
```
/bracket image title1:"Alien" title2:"The Thing" prompt:"in deep space with stars"
/bracket image title1:"Batman" title2:"Spider-Man" prompt:"cyberpunk city at night"
```

**Cross-Type Mashups:**
```
/bracket image title1:"Halo" title2:"Star Wars"  # Game vs Movie
/bracket image title1:"Dune" title2:"Dune"  # Book vs Movie (auto-detects types)
```

**Tournament Matchup:**
```
/bracket image matchup:"The Thing vs Alien"
```

**Help Menu:**
```
/bracket image
```
Shows: Available tournament matchups (if any) + freeform generation syntax

**Smart Search Process:**
1. **Validation:** Bot searches TMDB (movies/TV), RAWG (games), BGG (board games), Google Books
2. **Disambiguation:** If multiple matches found, shows selection menu (like `/movie` command)
3. **Rich Context:** Uses metadata (overview, type) to create better prompts
4. **Generation:** Creates cinematic prompt for OpenAI (takes 2-3 minutes)
5. **Result:** Returns epic poster mashup image with embed

**Rate Limiting:**
- **Default:** 5-minute cooldown, 10 images/user/day, 50 images/server/day
- **Admins:** Bypass cooldown by default (still subject to daily limits)
- **Whitelist:** Server admins can grant unlimited access to contributors
- **Configurable:** All limits adjustable via `/eggshen-config ai-images`

See [AI Image Generation](ai-images.md) for full documentation on rate limits and configuration.

**Example Prompt Generated:**
> "Epic movie poster mashup: 'The Thing' versus 'Alien'. Split screen composition with dramatic lighting, cinematic style, high contrast. Left side represents The Thing, right side represents Alien. Bold 'VS' text in the center. Movie poster aesthetic, professional design, 4K quality."

---

### Cancel Tournament

```
/bracket cancel
```

**Parameters:** None

**Who can use:** Administrators and Moderators only

**Features:**
- Immediately cancels the active tournament
- Cannot be undone
- Allows starting a new tournament
- All data is preserved in JSON (status: "cancelled")

**Example:**
```
/bracket cancel
```

**When to Use:**
- Tournament stalled with no participation
- Need to start over with different movies
- Technical issues or format changes needed

---

## Tournament Workflow Example

Here's a complete tournament workflow for "The Shudder Discord Gore Cup":

### Step 1: Create Tournament
```
/bracket create name:The Shudder Discord Gore Cup
```

### Step 2: Add All Groups (12 total)
```
/bracket add-group group:A movie1:... movie2:... movie3:... movie4:...
/bracket add-group group:B movie1:... movie2:... movie3:... movie4:...
...continue for groups C through L...
```

### Step 3: Open First Batch (Day 1)
```
/bracket open-groups groups:A,B,C,D
```
Wait 24+ hours for voting...

### Step 4: Close First Batch (Day 2)
```
/bracket close-groups groups:A,B,C,D
```

### Step 5: Repeat for Remaining Groups (Days 2-6)
```
Day 2: /bracket open-groups groups:E,F,G,H
Day 3: /bracket close-groups groups:E,F,G,H
Day 4: /bracket open-groups groups:I,J,K,L
Day 5: /bracket close-groups groups:I,J,K,L
```

### Step 6: Generate Knockout Bracket (Day 6)
```
/bracket advance-knockout
```

### Step 7: Knockout Rounds
Open matchups as needed, close when voting complete, system auto-generates next round.

**Timeline:**
- Setup: Day 0 (add all groups)
- Group Stage: Days 1-6 (4 groups per day)
- Round of 32: Days 7-8
- Round of 16: Days 9-10
- Quarterfinals: Days 11-12
- Semifinals: Days 13-14
- Finals: Days 15-16

---

## Best Practices

### Planning Your Tournament

- **Group Organization:** Theme your groups (80s horror, J-horror, creature features, etc.)
- **Balanced Groups:** Mix well-known and obscure titles for interesting matchups
- **Timing:** Allow 24+ hours for each voting window
- **Engagement:** Announce groups opening in your main chat channel

### Managing Group Stage

- **Batch Opening:** Open 4 groups at a time to maintain momentum
- **Reminder Posts:** Ping @everyone when voting opens and before close
- **Results Posts:** Celebrate results when closing groups
- **Watch Parties:** Consider watch parties for advancing movies

### Running Knockout Stage

- **Reduce Frequency:** Drop to 2 matchups per day in later rounds
- **Finals Build-Up:** Give finals extra time (48 hours) for maximum participation
- **Winner Announcement:** Make the final result announcement special!

### Communication Tips

- Post tournament bracket visually (external tool or manual)
- Keep members updated on schedule
- Encourage discussion about matchups
- Consider themed emojis or reactions for your tournament

---

## Troubleshooting

### "Tournament already exists"
Only one tournament allowed per server. Use `/bracket cancel` to end current tournament, then create new one.

### "Group stage voting not active"
Group must be opened with `/bracket open-groups` before members can vote.

### "Must vote for exactly 2 movies"
Both `choice1` and `choice2` are required and must be different numbers (1-4).

### "No tournament found"
Tournament may have been cancelled. Use `/bracket create` to start a new one.

### "Tournament not in knockout phase"
Must close all 12 groups and run `/bracket advance-knockout` before knockout stage begins.

---

## Technical Details

### Storage
- All tournament data stored in `guild_tournaments/[guildId].json`
- Persists across bot restarts
- Maintains full vote history and results

### Vote Tracking
- Votes are per-user and can be changed anytime before close
- Vote counts update in real-time
- Anonymous voting (results show counts, not who voted)

### Tiebreaker Logic
- Uses `Math.random()` for fair random selection
- Applied at close time, not during voting
- Ensures deterministic results (saved in tournament data)

### Permissions
- **Create/Manage:** Administrator or ModerateMembers permission required
- **Vote:** All server members can participate
- **View:** Anyone can see status and results

---

## Configuration

### Enable/Disable Command

Server administrators can disable the bracket command for regular users:

```
/eggshen-config commands toggle setting:Bracket Command enabled:false
```

**Note:** Administrators and moderators can always use bracket commands regardless of this setting.

---

## Future Enhancements

Potential future features (not yet implemented):

- Open multiple matchups simultaneously in knockout rounds
- Visual bracket generation (ASCII art or image)
- TMDB poster integration for knockout matchups
- Swiss-style tournament format option
- Double elimination bracket option
- Export results to CSV/JSON

---

[← Back to Commands Overview](/commands/)

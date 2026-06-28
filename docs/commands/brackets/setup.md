---
title: Setup & Group Stage - Tournament Brackets
description: Create tournaments, add titles, and manage group stage voting from start to knockout bracket.
---

# Setup & Group Stage

This guide covers everything from creating your first tournament through completing the group stage and advancing to knockouts.

## Creating Your Tournament

### `/bracket create`

```
/bracket create name:[tournament name] groups:[4-12]
```

**Parameters:**
- `name` (required) - Tournament name (e.g., "The Shudder Discord Gore Cup")
- `groups` (optional) - Number of groups (4-12, default 8). Each group has 4 entries.

**Who can use:** Administrators and Moderators only

**Features:**
- **Ephemeral response** - Only visible to the admin/moderator who created it (keeps channel clean)
- **Use `/bracket announce`** when ready to share tournament with the entire server
- Only one tournament per server at a time
- Tournament enters "setup" phase
- Flexible sizing: smaller tournaments for quick events, larger for epic competitions
- Wildcards calculated automatically based on group count
- Type determined by first `/bracket add-title` command

**Examples:**
```
/bracket create name:Quick Horror Showdown groups:4
/bracket create name:Monthly Movie Madness groups:8
/bracket create name:The Shudder Discord Gore Cup groups:12
```

---

## Adding Titles

### `/bracket add-title`

```
/bracket add-title group:[A-L] type:[movie/tv/game/boardgame/book] title:[title] image:[attachment]
```

**Parameters:**
- `group` (required) - Group letter (A through L)
- `type` (required) - Tournament type: movie, tv, game, boardgame, or book
- `title` (required) - Title to search for
- `image` (optional) - Custom image file or URL to use instead of API poster

**Who can use:** Administrators and Moderators only

**Features:**
- **Smart search integration**: Automatically searches TMDB, RAWG, BGG, or Google Books based on type
- **Selection menu for precision**: When multiple matches found, shows dropdown menu to choose exact title
- **Single result auto-add**: If only one match found, adds it immediately
- **Custom images**: Optionally provide a custom image (upload file or paste URL) that overrides the API poster
- **Metadata storage**: Stores IDs, years, poster URLs, and ratings
- **Progress tracking**: Shows how many titles added (e.g., "2/4 titles")
- **Duplicate prevention**: Won't let you add same title twice to a group
- **Type validation**: Prevents mixing different types in same tournament
- **Add 1-4 titles per group**: Flexible - add titles one at a time until group has 4

**Examples:**
```
/bracket add-title group:A type:movie title:The Exorcist
/bracket add-title group:A type:movie title:Halloween

# With custom images
/bracket add-title group:D type:movie title:Akira image:[upload file]
```

**Tips:**
- Run command 4 times to fill each group (one title at a time)
- Can be more general with titles - selection menu lets you pick exact match
- Progress indicator shows "1/4 titles", "2/4 titles", etc.
- Use `image` parameter to provide your own images instead of relying on API posters

---

## Managing Setup

### `/bracket remove-title`

```
/bracket remove-title group:[A-L] position:[1-4]
```

Remove a title from a group during setup phase.

**Parameters:**
- `group` (required) - Group letter (A through L)
- `position` (required) - Position of title to remove (1-4)

**Examples:**
```
/bracket remove-title group:A position:3
```

---

### `/bracket resize`

```
/bracket resize groups:[4-12]
```

Expand or contract the tournament during setup phase.

**Parameters:**
- `groups` (required) - New number of groups (4-12)

**Features:**
- **Expanding (e.g., 8 → 12):** Adds new groups (I, J, K, L) for more titles
- **Contracting (e.g., 8 → 6):** Removes groups if they're empty
- **Smart validation:** Prevents data loss by blocking contraction if groups being removed have titles
- **Only during setup:** Cannot resize once voting has started

**Examples:**
```
# Expand from 8 groups to 12 groups
/bracket resize groups:12

# Contract from 12 groups to 8
/bracket resize groups:8
```

**Use Cases:**
- Tournament grows larger than initially planned
- Want to reduce empty groups before starting
- Need more groups after starting to add titles

---

### `/bracket announce`

```
/bracket announce message:[custom message] image:[banner image]
```

Share the tournament with your entire server.

**Parameters:**
- `message` (optional) - Custom announcement message to the server
- `image` (optional) - Tournament banner or promotional image

**Who can use:** Administrators and Moderators only

**Features:**
- **Public announcement** - Visible to entire server (unlike create which is ephemeral)
- **Custom messaging** - Add your own hype text or instructions
- **Tournament banner** - Upload or link to promotional images
- **Auto-generated details** - Shows tournament type, groups, entry count, and current status

**Examples:**
```
# Simple announcement
/bracket announce

# With custom message
/bracket announce message:🎬 The Ultimate Horror Tournament is HERE! Vote for your favorite scary movies and help crown the champion! 🏆

# With custom message and banner
/bracket announce message:🔥 Monthly Movie Madness starts NOW! image:[upload banner]
```

**When to Use:**
- **After setup** - When all groups are filled and you're ready to start voting
- **Voting opens** - To remind members when group voting begins
- **Knockout phase** - To generate hype for playoff rounds

---

### `/bracket list-groups`

```
/bracket list-groups
```

Display a simple text overview of all groups and their titles.

**Features:**
- Shows all groups with their 4 titles
- Includes years and metadata
- Quick text-based reference
- No images - perfect for mobile or quick checks

---

## Group Stage Voting

### `/bracket open-groups`

```
/bracket open-groups groups:[group letters] duration:[time]
```

Open groups for voting.

**Parameters:**
- `groups` (required) - Comma-separated group letters (e.g., "A,B,C,D")
- `duration` (optional) - Voting duration (default: 24h, range: 5m-30d)
  - Format: Number + unit (m=minutes, h=hours, d=days)
  - Examples: "5m", "2h", "24h", "3d", "7d", "30d"

**Who can use:** Administrators and Moderators only

**Features:**
- Open multiple groups at once
- Posts embed showing all titles in each group with **balanced layout**:
  - 4 or fewer groups: 2x2 grid
  - 5-9 groups: 3 groups per row
  - 10+ groups: 4 groups per row
- **Customizable voting duration** (5 minutes to 30 days)
- **Displays time remaining** and exact deadline in embed footer
- Voting opens immediately
- Members can vote for top 2 in each group

**Examples:**
```
# Default 24 hour voting period
/bracket open-groups groups:A,B,C,D

# 48 hour voting period
/bracket open-groups groups:A,B,C,D duration:48h

# Week-long voting
/bracket open-groups groups:I,J,K,L duration:7d
```

**Recommended Strategy:**
- Open 4 groups per day to maintain engagement
- Default 24h works well for most communities
- Use longer periods (48h-7d) for slower-paced tournaments
- Use shorter periods (1h-6h) for live events

**Automatic Voting Closure:**
- ⏰ **1-hour warning** - Bot sends reminder when <1 hour remaining
- 🔒 **Auto-close at deadline** - Voting automatically closes when time expires
- 📊 **Results posted** - Final vote counts and advancing titles announced
- 🚫 **Buttons disabled** - Voting message updated to show CLOSED status
- **No manual intervention needed** - Tournament progresses automatically

**Benefits:**
- Consistent tournament pacing without admin monitoring
- Members get advance warning to cast final votes
- Immediate results when voting ends
- Reduces admin workload

---

## Group Stage Voting

### How Members Vote

When an admin opens groups with `/bracket open-groups`, the bot posts an interactive voting message with **buttons for each title**.

**Voting Process:**
1. Click the button for a title to select it (button turns green)
2. Click a second title to complete your vote (2 selections required)
3. Click a selected title again to deselect it
4. You can change your votes anytime before voting closes

**Features:**
- ✅ **No commands needed** - just click buttons
- ✅ **Visual feedback** - selected buttons highlight in green
- ✅ **Real-time counts** - see vote totals update live
- ✅ **Change anytime** - modify your selections before deadline
- ✅ **Clear constraints** - can only select 2 titles per group

**Example:**
```
Group A
1. The Thing (15 votes)
2. Alien (12 votes)
3. Event Horizon (8 votes)
4. The Fly (10 votes)

[Button for each title - click 2 to vote]
```

---

### `/bracket my-votes`

```
/bracket my-votes
```

See your voting status and history.

**Features:**
- Shows which groups you've voted in
- Shows available votes remaining
- Displays time remaining for open voting
- Lists knockout matchup votes
- **Ephemeral** - Only you can see your voting status

---

### `/bracket close-groups`

```
/bracket close-groups groups:[group letters]
```

Close group voting and calculate results.

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
```

---

## Advancing to Knockout

### `/bracket advance-knockout`

```
/bracket advance-knockout
```

Generate the knockout bracket from group results.

**Who can use:** Administrators and Moderators only

**Features:**
- Calculates best third-place finishers (wildcards)
- Generates Round of 32 (or smaller) matchups
- Pairs group winners with non-winners from different groups
- Randomized seeding for fairness
- Posts wildcard announcement
- **Full bracket tree generated** - All rounds created upfront with TBD placeholders

**Requirements:**
- All groups must be closed
- Can only be used once per tournament

**Output:**
```
🏆 Knockout Bracket Generated!

Top 2 from each group advance automatically.
8 wildcards selected: The Thing, Alien, Halloween...

16 matchups created for Round of 16
Matchups are pending and ready to open
```

**→ [Continue to Knockout Rounds](./knockout)**

---

## Quick Reference

| Command | Purpose |
|---------|---------|
| `/bracket create` | Start new tournament |
| `/bracket add-title` | Add title to group |
| `/bracket remove-title` | Remove title from group |
| `/bracket resize` | Change group count |
| `/bracket announce` | Share tournament publicly |
| `/bracket list-groups` | Text overview of groups |
| `/bracket open-groups` | Start group voting (button-based) |
| `/bracket my-votes` | Check voting status |
| `/bracket close-groups` | Close voting and show results |
| `/bracket advance-knockout` | Generate knockout bracket |

**Note:** Group voting is now button-based! Members vote by clicking buttons - no commands needed.

---

**→ [Back to Overview](./) | [Knockout Rounds](./knockout) | [Command Reference](./commands) | [Tips & Strategies](./tips)**

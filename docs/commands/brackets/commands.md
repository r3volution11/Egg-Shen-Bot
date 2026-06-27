---
title: Command Reference
---

# Bracket Command Reference

This page provides detailed documentation for all tournament bracket commands. Commands are organized by tournament phase and use case.

## Quick Reference Table

| Command | Who Can Use | Description | Phase |
|---------|-------------|-------------|-------|
| `create` | Admin/Mod | Create a new tournament | Setup |
| `add-title` | Admin/Mod | Add a title to a group | Setup |
| `remove-title` | Admin/Mod | Remove a title from a group | Setup |
| `resize` | Admin/Mod | Change the number of groups | Setup |
| `announce` | Admin/Mod | Announce the tournament to the channel | Setup |
| `list-groups` | Everyone | View all groups and their titles | Any |
| `open-groups` | Admin/Mod | Open groups for voting | Group Stage |
| `vote-group` | Everyone | Vote for your top 2 titles in a group | Group Stage |
| `my-votes` | Everyone | View your voting history and available votes | Any |
| `close-groups` | Admin/Mod | Close group voting and calculate results | Group Stage |
| `advance-knockout` | Admin/Mod | Generate knockout bracket from group results | Transition |
| `open-knockout` | Admin/Mod | Open current round matchups for voting | Knockout |
| `open-region` | Admin/Mod | Open all matchups in a region for voting | Knockout |
| `open-matchup` | Admin/Mod | Open a specific matchup for voting | Knockout |
| `close-knockout` | Admin/Mod | Close current round and advance winners | Knockout |
| `close-matchup` | Admin/Mod | Close a specific matchup and advance winner | Knockout |
| `extend-voting` | Admin/Mod | Extend or change voting deadline | Any |
| `status` | Everyone | View tournament status and standings | Any |
| `view` | Everyone | View visual bracket (knockout phase only) | Knockout |
| `image` | Everyone | Generate AI image for any matchup | Any |
| `regenerate` | Admin/Mod | Regenerate knockout bracket with full tree | Knockout |
| `cancel` | Admin/Mod | Cancel the tournament | Any |

---

## Setup Commands

These commands are used to create and configure a tournament before voting begins. All setup commands require Admin or Moderator permissions.

### `/bracket create`

Create a new tournament bracket.

**Parameters:**
- `name` (required, string): Tournament name (e.g., "The Shudder Discord Gore Cup")
- `groups` (optional, integer): Number of groups (4-12, default: 8)
  - Each group will contain 4 titles
  - Total participants = groups × 4
  - Valid range: 4-12 groups (16-48 total titles)

**Example Usage:**
```
/bracket create name:"Summer Movie Madness" groups:8
/bracket create name:"Quick Tournament Test" groups:4
/bracket create name:"Epic Community Championship" groups:12
```

**Notes:**
- Tournament names are visible to all participants
- Default is 8 groups if not specified (32 titles total)
- You can change the group count later with `/bracket resize`
- Only one active tournament per server at a time

---

### `/bracket add-title`

Add a title to a specific group in the tournament.

**Parameters:**
- `group` (required, choice): Group letter (A-L) to add the title to
- `type` (required, choice): Tournament type
  - `movie` - Movies (searches TMDB)
  - `tv` - TV Shows (searches TMDB)
  - `game` - Video Games (searches RAWG)
  - `boardgame` - Board Games (searches BoardGameGeek)
  - `book` - Books (searches Google Books)
- `title` (required, string): Title to search for and add
- `image` (optional, attachment): Custom image for this title (overrides API poster)

**Example Usage:**
```
/bracket add-title group:A type:movie title:"The Thing"
/bracket add-title group:B type:tv title:"Breaking Bad"
/bracket add-title group:C type:game title:"Elden Ring"
/bracket add-title group:A type:movie title:"Evil Dead" image:[uploaded-file.jpg]
```

**Notes:**
- Searches the selected API for matching titles
- Returns up to 5 results - select the correct one
- Custom images override the default poster/cover art
- Each group must have exactly 4 titles before voting can begin
- Tournament type is set on first title added and cannot be changed
- Cannot add titles after group voting begins

---

### `/bracket remove-title`

Remove a title from a group.

**Parameters:**
- `group` (required, choice): Group letter (A-L)
- `position` (required, integer): Position of title to remove (1-4)

**Example Usage:**
```
/bracket remove-title group:A position:2
/bracket remove-title group:D position:4
```

**Notes:**
- Positions are numbered 1-4 based on display order
- Use `/bracket list-groups` to see current positions
- Cannot remove titles after group voting begins
- Removing a title shifts remaining titles up in position

---

### `/bracket resize`

Change the number of groups in the tournament.

**Parameters:**
- `groups` (required, integer): New number of groups (4-12)

**Example Usage:**
```
/bracket resize groups:6
/bracket resize groups:10
```

**Notes:**
- Can expand (add groups) or contract (remove groups)
- When contracting: removes empty groups from the end
- When expanding: adds new empty groups at the end
- Cannot resize after titles have been added to groups being removed
- Cannot resize after group voting begins
- Total participants will be: groups × 4

---

### `/bracket announce`

Announce the tournament to the channel with optional custom message and banner.

**Parameters:**
- `message` (optional, string): Announcement message to the server
- `image` (optional, attachment): Tournament banner/image

**Example Usage:**
```
/bracket announce
/bracket announce message:"Let the games begin! Vote for your favorites!"
/bracket announce message:"Welcome to the tournament!" image:[banner.jpg]
```

**Notes:**
- Creates a public, visible announcement (not ephemeral)
- Default message shows tournament name and details
- Custom message replaces default text
- Banner image appears at top of announcement
- Use this after setup is complete and before voting begins

---

## Group Stage Commands

These commands manage the group stage voting phase where participants vote for their top 2 titles in each group.

### `/bracket list-groups`

View all groups and their titles in a simple text format.

**Who Can Use:** Everyone

**Parameters:** None

**Example Usage:**
```
/bracket list-groups
```

**Output:**
```
📋 Groups Overview

Group A:
1. The Thing (1982)
2. Evil Dead (1981)
3. Hereditary (2018)
4. The Witch (2015)

Group B:
1. Alien (1979)
2. The Exorcist (1973)
...
```

**Notes:**
- Shows all groups with their current titles
- Positions are numbered 1-4 for easy reference
- Use this to help participants decide their votes
- Available at any time during tournament

---

### `/bracket open-groups`

Open specific groups for voting.

**Who Can Use:** Admin/Mod only

**Parameters:**
- `groups` (required, string): Comma-separated list of groups to open (e.g., "A,B,C,D")
- `duration` (optional, string): Voting duration
  - Format: `<number><unit>` where unit is m (minutes), h (hours), or d (days)
  - Examples: "24h", "3d", "45m", "12h"
  - Default: 24h if not specified
  - Range: 5m minimum, 30d maximum

**Example Usage:**
```
/bracket open-groups groups:"A,B,C,D"
/bracket open-groups groups:"A,B,C,D" duration:"48h"
/bracket open-groups groups:"E,F,G,H" duration:"3d"
/bracket open-groups groups:"A" duration:"12h"
```

**Notes:**
- Each group must have exactly 4 titles before opening
- Posts voting message for each group with reaction buttons
- Groups can be opened separately (in waves)
- Participants vote using `/bracket vote-group`
- Voting deadline is enforced - votes after deadline are ignored
- Use `/bracket extend-voting` to add more time if needed

---

### `/bracket vote-group`

Vote for your top 2 titles in a group.

**Who Can Use:** Everyone

**Parameters:**
- `group` (required, choice): Group letter (A-L)
- `choice1` (required, integer): Your first choice (1-4)
- `choice2` (required, integer): Your second choice (1-4)

**Example Usage:**
```
/bracket vote-group group:A choice1:1 choice2:3
/bracket vote-group group:B choice1:4 choice2:2
```

**Notes:**
- First choice receives 3 points, second choice receives 2 points
- Must choose 2 different titles (cannot vote for same title twice)
- Group must be open for voting
- Can only vote once per group (cannot change vote)
- Votes are recorded privately
- Use `/bracket my-votes` to see your voting history
- Must vote before the group's deadline

---

### `/bracket my-votes`

View your voting history and available votes.

**Who Can Use:** Everyone

**Parameters:** None

**Example Usage:**
```
/bracket my-votes
```

**Output Example:**
```
📊 Your Voting History

Group Stage:
✅ Group A: The Thing (1st), Evil Dead (2nd)
✅ Group B: Alien (1st), The Exorcist (2nd)
⏳ Group C: Voting open - deadline in 18h 32m
⏳ Group D: Voting open - deadline in 18h 32m
⬜ Group E: Not yet open

Knockout Round:
✅ 1A: The Thing
✅ 2B: Alien
⏳ 1C: Voting open
⬜ 2D: Not yet open
```

**Notes:**
- Shows all votes cast during tournament
- Indicates which groups are still available to vote
- Displays voting deadlines for open groups
- Helps track participation across tournament phases

---

### `/bracket close-groups`

Close group voting and calculate results.

**Who Can Use:** Admin/Mod only

**Parameters:**
- `groups` (required, string): Comma-separated list of groups to close (e.g., "A,B,C,D")

**Example Usage:**
```
/bracket close-groups groups:"A,B,C,D"
/bracket close-groups groups:"E,F,G,H"
/bracket close-groups groups:"A"
```

**Notes:**
- Calculates point totals for each title (3 points for 1st choice, 2 for 2nd)
- Determines 1st, 2nd, and 3rd place in each group
- Posts results to channel showing final standings
- Groups must be open before they can be closed
- Cannot reopen groups after closing
- Use `/bracket advance-knockout` after all groups are closed

---

### `/bracket advance-knockout`

Generate the knockout bracket from group results.

**Who Can Use:** Admin/Mod only

**Parameters:** None

**Example Usage:**
```
/bracket advance-knockout
```

**Notes:**
- All groups must be closed before advancing
- Automatically seeds based on group results:
  - All 1st place finishers advance
  - All 2nd place finishers advance
  - Wildcards fill remaining spots (best 3rd place by points)
- Creates bracket structure based on total participants:
  - 16 titles: Round of 16 → Quarterfinals → Semifinals → Finals
  - 24 titles: Round of 16 (with byes or wildcards)
  - 32 titles: Full Round of 32 bracket
- Seeding uses serpentine pattern for fairness
- Once knockout begins, cannot edit tournament
- Use `/bracket view` to see the bracket visualization

---

## Knockout Commands

These commands manage the single-elimination knockout rounds. Matchups are identified by regional labels (e.g., "1A", "2B").

### Regional Label System

Matchups in the knockout bracket are identified by regional labels:
- **Region 1**: Left side of bracket
- **Region 2**: Right side of bracket
- **Letters (A, B, C, D...)**: Position within region

**Examples:**
- Round of 16: "1A" through "1D" (left), "2A" through "2D" (right)
- Quarterfinals: "1A", "1B" (left), "2A", "2B" (right)
- Semifinals: "1A" (left), "2A" (right)
- Finals: "Finals" (no region)

---

### `/bracket open-knockout`

Open all matchups in the current round for voting.

**Who Can Use:** Admin/Mod only

**Parameters:**
- `duration` (optional, string): Voting duration (default: 24h, range: 5m-30d)
  - Format: `<number><unit>` where unit is m, h, or d
  - Examples: "24h", "3d", "45m"

**Example Usage:**
```
/bracket open-knockout
/bracket open-knockout duration:"48h"
/bracket open-knockout duration:"2d"
```

**Notes:**
- Opens ALL matchups in the current knockout round
- Posts a voting message for each matchup with reaction buttons
- Current round advances automatically based on bracket structure
- Use this for standard tournament flow (all matchups at once)
- Alternative: Use `/bracket open-region` or `/bracket open-matchup` for more control

---

### `/bracket open-region`

Open all matchups in a specific region (left or right side) for voting.

**Who Can Use:** Admin/Mod only

**Parameters:**
- `region` (required, choice): Region number
  - `1` - Region 1 (Left Side)
  - `2` - Region 2 (Right Side)
- `duration` (optional, string): Voting duration (default: 24h, range: 5m-30d)

**Example Usage:**
```
/bracket open-region region:1
/bracket open-region region:2 duration:"36h"
/bracket open-region region:1 duration:"2d"
```

**Notes:**
- Opens half the bracket at a time (one region)
- Useful for staggered voting or managing attention
- Posts voting messages for all matchups in the region
- Region 1 = left bracket, Region 2 = right bracket
- Can open regions independently or simultaneously

---

### `/bracket open-matchup`

Open a specific matchup for voting.

**Who Can Use:** Admin/Mod only

**Parameters:**
- `matchup` (required, string): Matchup ID using regional label (e.g., "1A", "2B", "Finals")
- `duration` (optional, string): Voting duration (default: 24h, range: 5m-30d)

**Example Usage:**
```
/bracket open-matchup matchup:"1A"
/bracket open-matchup matchup:"2C" duration:"24h"
/bracket open-matchup matchup:"Finals" duration:"48h"
```

**Notes:**
- Opens a single matchup for voting
- Use regional labels: "1A", "2B", etc.
- Finals matchup uses "Finals" as the label
- Useful for:
  - Spotlight matchups
  - Resolving technical issues
  - Managing voting flow
  - Creating suspense
- See `/bracket status` to find matchup IDs

---

### `/bracket close-knockout`

Close all open matchups in the current round and advance winners.

**Who Can Use:** Admin/Mod only

**Parameters:** None

**Example Usage:**
```
/bracket close-knockout
```

**Notes:**
- Closes ALL open matchups in current round
- Calculates winner by reaction count (most votes wins)
- Advances winners to next round automatically
- Posts results showing vote counts
- Cannot undo - winners are locked in
- Advances tournament to next round if all matchups closed
- Use this for standard tournament flow

---

### `/bracket close-matchup`

Close a specific matchup and advance the winner.

**Who Can Use:** Admin/Mod only

**Parameters:**
- `matchup` (required, string): Matchup ID using regional label (e.g., "1A", "2B", "Finals")

**Example Usage:**
```
/bracket close-matchup matchup:"1A"
/bracket close-matchup matchup:"2C"
/bracket close-matchup matchup:"Finals"
```

**Notes:**
- Closes a single matchup
- Calculates winner by reaction count
- Advances winner to next round
- Posts results showing vote counts
- Cannot undo - winner is locked in
- Useful for:
  - Closing matchups individually
  - Managing voting flow
  - Resolving technical issues
- Does not automatically advance round (use `/bracket close-knockout` for that)

---

### `/bracket extend-voting`

Extend or change voting deadline for groups or knockout rounds.

**Who Can Use:** Admin/Mod only

**Parameters:**
- `type` (required, choice): Voting type to extend
  - `group` - Group Stage Voting
  - `knockout` - Knockout Round Voting
- `duration` (required, string): Duration to ADD (e.g., "24h", "3d", "45m")
  - Adds this much time to current deadline
  - Format: `<number><unit>` where unit is m, h, or d
  - Range: 5m minimum, 30d maximum
- `group` (optional, string): Group letter (only for group voting)

**Example Usage:**
```
/bracket extend-voting type:group duration:"12h" group:"A"
/bracket extend-voting type:knockout duration:"24h"
/bracket extend-voting type:group duration:"2d" group:"C"
```

**Notes:**
- For group voting: extends specific group's deadline
- For knockout voting: extends all open matchups in current round
- Duration is ADDED to current deadline (not replaced)
- Useful when participation is low or more time is needed
- Cannot extend closed/completed voting
- Updates voting messages with new deadline

---

## Utility Commands

These commands provide information, visualization, and management tools for the tournament.

### `/bracket status`

View tournament status and standings.

**Who Can Use:** Everyone

**Parameters:** None

**Example Usage:**
```
/bracket status
```

**Output Example:**
```
🏆 Summer Movie Madness - STATUS

Phase: Knockout (Semifinals)

Current Round: Semifinals
- 1A: The Thing vs. Alien (Open - 18h 32m remaining)
- 2A: Hereditary vs. The Exorcist (Open - 18h 32m remaining)

Group Results:
Group A: ✅ Closed
  1st: The Thing (47 pts)
  2nd: Evil Dead (31 pts)
  3rd: Hereditary (18 pts)
...
```

**Notes:**
- Shows tournament phase (Setup, Group Stage, Knockout, Complete)
- Displays current round and matchup status
- Shows group results if group stage is complete
- Indicates open/closed status of voting
- Displays voting deadlines for active votes
- Use this to track tournament progress

---

### `/bracket view`

View visual bracket representation (knockout phase only).

**Who Can Use:** Everyone

**Parameters:** None

**Example Usage:**
```
/bracket view
```

**Notes:**
- Only available during knockout phase
- Generates text-based bracket visualization
- Shows all rounds with matchup results
- Indicates open/closed/pending matchups
- Updates as tournament progresses
- Large brackets may be truncated - use `/bracket status` for full details

---

### `/bracket image`

Generate an AI-powered versus image for any matchup.

**Who Can Use:** Everyone

**Parameters:**
- `title1` (optional, string): First title
- `title2` (optional, string): Second title
- `matchup` (optional, string): Or choose from active tournament matchups (regional label)
- `prompt` (optional, string): Additional details for image generation

**Example Usage:**
```
/bracket image title1:"The Thing" title2:"Alien"
/bracket image matchup:"1A" prompt:"in space"
/bracket image matchup:"Finals" prompt:"epic battle"
/bracket image title1:"Hereditary" title2:"The Witch" prompt:"dark forest setting"
```

**Notes:**
- Uses OpenAI DALL-E 3 for image generation
- Provide either `title1`+`title2` OR `matchup` (not both)
- Optional prompt adds creative direction
- Images are ephemeral and not saved
- Rate limits apply (tracks per-user and per-server usage)
- Generated images are 1024x1024 PNG format

---

### `/bracket regenerate`

Regenerate knockout bracket with full tree structure.

**Who Can Use:** Admin/Mod only

**Parameters:** None

**Example Usage:**
```
/bracket regenerate
```

**Notes:**
- Rebuilds knockout bracket from group results
- Useful for fixing bracket structure issues
- Preserves completed matchup results
- Recalculates wildcard seeding
- Only use if bracket structure is corrupted
- Cannot regenerate after Finals are complete
- **Warning:** May affect in-progress matchups

---

### `/bracket cancel`

Cancel the tournament and delete all data.

**Who Can Use:** Admin/Mod only

**Parameters:** None

**Example Usage:**
```
/bracket cancel
```

**Notes:**
- Permanently deletes tournament data
- Cannot be undone
- Confirms before canceling
- Notifies channel of cancellation
- Use this to start over or end tournament early
- Frees up server for new tournament

---

## Tournament Size Examples

### Example 1: Small Tournament (16 participants)

**Setup:**
```
/bracket create name:"Quick Horror Tournament" groups:4
```

**Configuration:**
- **Groups:** 4 groups (A, B, C, D)
- **Titles per group:** 4
- **Total participants:** 16
- **Knockout structure:** Round of 16 → Quarterfinals → Semifinals → Finals
- **Wildcards:** All group winners + all 2nd place + best 3rd place titles

**Best for:**
- Quick tournaments
- Testing the system
- Smaller communities
- Weekend events

**Timeline estimate:**
- Setup: 1-2 hours
- Group voting: 24-48 hours
- Knockout rounds: 3-5 days (24-48h per round)
- **Total:** ~1 week

---

### Example 2: Medium Tournament (24 participants)

**Setup:**
```
/bracket create name:"Community Choice Awards" groups:6
```

**Configuration:**
- **Groups:** 6 groups (A-F)
- **Titles per group:** 4
- **Total participants:** 24
- **Knockout structure:** Round of 16 → Quarterfinals → Semifinals → Finals
- **Wildcards:** 8 wildcards advance to Round of 16 with group winners

**Best for:**
- Balanced tournament size
- Good group diversity
- Active communities
- Monthly events

**Timeline estimate:**
- Setup: 2-3 hours
- Group voting: 2-3 days
- Knockout rounds: 4-6 days
- **Total:** 1-2 weeks

---

### Example 3: Standard Tournament (32 participants)

**Setup:**
```
/bracket create name:"Summer Movie Madness" groups:8
```
*(or just use default: `/bracket create name:"Summer Movie Madness"`)*

**Configuration:**
- **Groups:** 8 groups (A-H)
- **Titles per group:** 4
- **Total participants:** 32
- **Knockout structure:** Round of 32 → Round of 16 → Quarterfinals → Semifinals → Finals
- **Wildcards:** All winners + all 2nd place + best 3rd place fill Round of 32

**Best for:**
- Full-featured tournaments
- Most common size
- Standard competition format
- Major community events

**Timeline estimate:**
- Setup: 2-4 hours
- Group voting: 3-4 days
- Knockout rounds: 5-7 days (may include Round of 32)
- **Total:** 2-3 weeks

---

### Example 4: Large Tournament (40 participants)

**Setup:**
```
/bracket create name:"Ultimate Showdown" groups:10
```

**Configuration:**
- **Groups:** 10 groups (A-J)
- **Titles per group:** 4
- **Total participants:** 40
- **Knockout structure:** Round of 32 → Round of 16 → Quarterfinals → Semifinals → Finals
- **Wildcards:** Complex selection to fill 32 spots

**Best for:**
- Large communities
- High participation events
- Extensive title variety
- Quarterly championships

**Timeline estimate:**
- Setup: 3-5 hours
- Group voting: 4-5 days
- Knockout rounds: 6-8 days
- **Total:** 2-3 weeks

---

### Example 5: Maximum Tournament (48 participants)

**Setup:**
```
/bracket create name:"Epic Community Championship" groups:12
```

**Configuration:**
- **Groups:** 12 groups (A-L)
- **Titles per group:** 4
- **Total participants:** 48
- **Knockout structure:** Round of 32 → Round of 16 → Quarterfinals → Semifinals → Finals
- **Wildcards:** Extensive wildcard system fills all spots

**Best for:**
- Epic community events
- Maximum variety
- Year-end championships
- Highly active servers

**Timeline estimate:**
- Setup: 4-6 hours
- Group voting: 5-7 days
- Knockout rounds: 7-10 days
- **Total:** 3-4 weeks

---

## What's Possible

The tournament bracket system supports a wide range of features and configurations:

### Tournament Types
- **Movies** - Powered by TMDB
- **TV Shows** - Powered by TMDB
- **Video Games** - Powered by RAWG
- **Board Games** - Powered by BoardGameGeek
- **Books** - Powered by Google Books

### Flexible Structure
- **4-12 groups** (16-48 total participants)
- **Dynamic resizing** during setup phase
- **Automatic seeding** based on group results
- **Wildcard system** fills knockout bracket

### Voting Options
- **Group stage:** Vote for top 2 titles (weighted points)
- **Knockout stage:** Single-elimination voting
- **Flexible deadlines:** 5 minutes to 30 days
- **Vote extension** for any phase
- **Private voting** via commands (group stage)
- **Public voting** via reactions (knockout stage)

### Opening Strategies
- **Entire round:** Open all matchups at once
- **By region:** Open left or right bracket half
- **Individual matchups:** Open one at a time for spotlight effect

### Customization
- **Custom images** for any title (overrides API posters)
- **Custom announcements** with banner images
- **Regional identification** (1A, 2B labels) for clear bracket navigation
- **Tournament naming** for branding

### Management Features
- **Persistent storage** across bot restarts
- **Vote tracking** per user
- **Status monitoring** at any time
- **Automatic winner advancement**
- **Bracket regeneration** for fixing issues

### Visual Features
- **AI-generated versus images** using DALL-E 3
- **Text-based bracket visualization**
- **Group standings** with point totals
- **Live vote counts** during knockout rounds

---

## Limitations & Not Possible

Understanding what the system cannot do helps set proper expectations:

### Tournament Configuration
- ❌ **Cannot change tournament type** after first title is added
  - Tournament type (movie/tv/game/book) is locked on first add-title
- ❌ **Cannot edit tournament** after knockout begins
  - No adding/removing titles once knockout phase starts
- ❌ **Cannot add/remove groups** after titles are added to those groups
- ❌ **Maximum 12 groups** (48 participants total)
  - System is optimized for 4-12 group range
- ❌ **Each group must have exactly 4 titles**
  - Cannot proceed with incomplete groups

### Voting Restrictions
- ❌ **Cannot undo matchup votes** once matchup is closed
  - Close-matchup is final - winner is locked in
- ❌ **Cannot change group votes** after submission
  - One vote per group per user, no edits
- ❌ **Cannot reopen completed rounds**
  - Once a round is closed, results are permanent
- ❌ **Cannot vote after deadline**
  - Voting deadlines are enforced strictly

### Technical Limitations
- ❌ **Voting requires Discord reaction permissions**
  - Bot needs permission to add reactions and read reactions
- ❌ **One active tournament per server** at a time
  - Cannot run multiple tournaments simultaneously
- ❌ **Cannot restore deleted tournaments**
  - Cancel is permanent - no recovery
- ❌ **AI image generation has rate limits**
  - Per-user and per-server limits apply
  - Requires OpenAI API key configuration

### Bracket Structure
- ❌ **Cannot manually seed matchups**
  - Seeding is automatic based on group results
- ❌ **Cannot modify knockout bracket structure**
  - Bracket format is determined by participant count
- ❌ **Cannot skip knockout rounds**
  - Must complete all rounds sequentially
- ❌ **Cannot have byes in group stage**
  - All groups must have 4 titles

### Data Management
- ❌ **Cannot export tournament data**
  - No built-in export to CSV/JSON
- ❌ **Cannot import tournaments**
  - Must create and populate manually
- ❌ **Cannot merge tournaments**
  - Each tournament is independent

### Permissions
- ❌ **Cannot delegate specific permissions**
  - Only Admins and Moderators can manage
  - No custom role configuration
- ❌ **Cannot restrict voting to specific roles**
  - All server members can vote (if group is open)

---

## Tips for Tournament Organizers

### Before Starting
1. **Plan your size** - Decide on participant count (4-12 groups)
2. **Announce in advance** - Build hype before creating tournament
3. **Prepare title list** - Have titles ready to add quickly
4. **Test with small tournament** - Practice with 4 groups first

### During Setup
1. **Use custom images** for better visual appeal
2. **Add titles efficiently** - Don't rush, but don't delay too long
3. **Use `/bracket announce`** when ready to begin
4. **Consider group waves** - Open groups in batches (A-D, then E-H)

### During Group Stage
1. **Monitor participation** - Use `/bracket extend-voting` if turnout is low
2. **Engage community** - Post reminders about open groups
3. **Track votes** - Check group vote counts before closing
4. **Stagger group opening** - Not all at once if server is large

### During Knockout
1. **Create suspense** - Use `/bracket open-matchup` for spotlight matches
2. **Use regions strategically** - Open left/right brackets separately
3. **Generate hype images** - Use `/bracket image` for key matchups
4. **Post updates** - Share bracket progress with community

### Best Practices
- ✅ Use clear, descriptive tournament names
- ✅ Give reasonable voting windows (24-48h typically)
- ✅ Engage with participants in chat
- ✅ Use `/bracket status` frequently to track progress
- ✅ Announce winners publicly after each round
- ✅ Consider streaming Finals on voice chat

### Common Mistakes to Avoid
- ❌ Opening all groups at once (overwhelming)
- ❌ Setting too short voting periods
- ❌ Not announcing tournament start
- ❌ Closing voting too early (low participation)
- ❌ Forgetting to use `/bracket view` to show progress
- ❌ Not generating versus images for Finals

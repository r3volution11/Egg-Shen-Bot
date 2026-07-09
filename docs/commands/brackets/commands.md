---
title: Command Reference
---

# Bracket Command Reference

This page provides detailed documentation for all tournament bracket commands. Commands are organized by tournament phase and use case.

**Note:** Group stage voting is now **button-based**! Members vote by clicking buttons on the voting message - no commands needed.

## Quick Reference Table

| Command | Who Can Use | Description | Phase |
|---------|-------------|-------------|-------|
| `help` | Everyone | View tournament guide and command overview | Any |
| `create` | Admin/Mod | Create a new tournament | Setup |
| `manage-titles` | Admin/Mod | Add or remove titles from groups | Setup |
| `resize` | Admin/Mod | Change the number of groups before voting begins | Setup |
| `edit-name` | Admin/Mod | Rename the tournament | Any |
| `announce` | Admin/Mod | Announce the tournament to the channel | Setup |
| `open` | Admin/Mod | Smart: Opens next round (auto-detects phase) | Any |
| `close` | Admin/Mod | Smart: Closes current round (auto-detects phase) | Any |
| `open-groups` | Admin/Mod | Open specific groups for button-based voting | Group Stage |
| `close-groups` | Admin/Mod | Close specific groups and calculate results | Group Stage |
| `advance-knockout` | Admin/Mod | Generate knockout bracket from group results | Transition |
| `regenerate` | Admin/Mod | Rebuild the knockout bracket from group results (fixes bracket structure issues) | Knockout |
| `resolve-tiebreaker` | Admin/Mod | Resolve a tiebreaker — tally votes or manually override | Any |
| `open-matchup` | Admin/Mod | Open specific matchup(s) for voting | Knockout |
| `close-matchup` | Admin/Mod | Close specific matchup(s) and advance winner(s) | Knockout |
| `extend-voting` | Admin/Mod | Extend or change voting deadline | Any |
| `my-votes` | Everyone | View your voting history and available votes | Any |
| `status` | Everyone | View tournament status with live voter counts and leaders | Any |
| `list-groups` | Everyone | List all groups and their titles | Any |
| `view` | Everyone | View visual bracket (knockout phase only) | Knockout |
| `export` | Everyone | Export tournament results (JSON or Markdown) | Any |
| `cancel` | Admin/Mod | Cancel the tournament | Any |

**Key Changes:**
- 🆕 **Smart Commands**: `/bracket open` and `/bracket close` auto-detect tournament phase
- 🔄 **Unified Management**: `/bracket manage-titles` replaces `add-title` and `remove-title`
- ⚖️ **Tiebreaker Voting & Resolution**: Ties are now resolved by member button-voting, with `/bracket resolve-tiebreaker` available to tally votes early or manually override the winner
- 🎨 **AI Images Moved**: Matchup image generation now lives in the standalone [`/image`](../ai-images) command (`/image matchup:"Title A vs Title B"`), alongside its freeform, message, and versus-search modes
- ❌ **Removed**: `open-knockout`, `close-knockout`, `open-quarters`, `close-quarters`, `open-semis`, `close-semis`, `open-finals`, `close-finals`, `open-region` — all superseded by the smart `open`/`close`/`open-matchup` commands

**Visual Examples:**

<div style="display: flex; gap: 10px; margin: 20px 0;">
<div>

![Tournament Status](/images/examples/tournaments/tournament-status.png)
*Live tournament status with vote counts*

</div>
<div>

![Round Results](/images/examples/tournaments/round-complete.png)
*Round completion with winner announcements*

</div>
</div>
| `view` | Everyone | View visual bracket (knockout phase only) | Knockout |
| `image` | Everyone | Generate AI image for any matchup | Any |
| `edit-name` | Admin/Mod | Change the tournament name | Any |
| `regenerate` | Admin/Mod | Regenerate knockout bracket with full tree | Knockout |
| `cancel` | Admin/Mod | Cancel the tournament | Any |

---

## Getting Started

### `/bracket help`

View a comprehensive tournament guide with command overview, voting instructions, and pro tips.

**Parameters:**
None - this command takes no options.

**What It Shows:**
- **Quick Start (Admin)** - 8-step process for running a tournament
- **How to Vote (Everyone)** - Instructions for both group and knockout stages
- **Common Commands** - Organized by user role (Everyone vs Admin/Mod)
- **Auto-Features** - Overview of auto-close, warnings, live counts, and button feedback
- **Pro Tips** - Duration syntax, wildcards, custom images, exports, and logging

**Example Usage:**
```
/bracket help
```

**Benefits:**
- New users can learn the entire system in one command
- Quick reference for voting instructions
- Discover advanced features and tips
- Find the right command for what you want to do

**Response Type:**
This command sends an ephemeral reply (only you can see it), keeping the channel clean.

---

## Setup Commands

These commands are used to create and configure a tournament before voting begins. All setup commands require Admin or Moderator permissions.

### `/bracket create`

Create a new tournament bracket. The bot automatically selects the best tournament format based on size.

**Parameters:**
- `name` (required, string): Tournament name (e.g., "The Shudder Discord Gore Cup")
- `max-titles` (optional, dropdown): Maximum number of titles (default: 32)
  - **Valid bracket sizes:** 2, 4, 8, 16, 32 (powers of 2)
  - **Valid group sizes:** 36, 40, 44, 48 (multiples of 4)
  - **Bracket Mode** (2-32 titles): Direct matchup voting, like March Madness
  - **Group Stage Mode** (36-48 titles): Group voting → knockout
  - Discord shows labeled choices: "8 titles (Quarterfinals)", "36 titles (9 groups)", etc.

**Example Usage:**
```
/bracket create name:"Summer Movie Madness" max-titles:32
/bracket create name:"Quick 8-Title Showdown" max-titles:8
/bracket create name:"Epic 48-Title Championship" max-titles:48
```

**Notes:**
- Tournament names are visible to all participants
- Default is 32 titles if not specified (Bracket Mode)
- Only mathematically clean sizes are allowed to ensure professional tournament structures
- Powers of 2 create balanced brackets; multiples of 4 create complete groups
- Only one active tournament per server at a time

---

### `/bracket manage-titles`

Add or remove titles from tournament groups. This unified command replaces the old `add-title` and `remove-title` commands.

**Parameters:**
- `action` (required, choice): Action to perform
  - `Add Title` - Add a new title to a group
  - `Remove Title` - Remove a title from a group
- `group` (required, choice): Group letter (A-L)
- `type` (optional, choice): Tournament type (required when adding)
  - `movie` - Movies (searches TMDB)
  - `tv` - TV Shows (searches TMDB)
  - `game` - Video Games (searches RAWG)
  - `boardgame` - Board Games (searches BoardGameGeek)
  - `book` - Books (searches Google Books)
- `title` (optional, string): Title to search for (required when adding)
- `position` (optional, integer): Position to remove (1-4, required when removing)
- `image` (optional, attachment): Custom image (for adding only, overrides API poster)

**Example Usage (Adding):**
```
/bracket manage-titles action:"Add Title" group:A type:movie title:"The Thing"
/bracket manage-titles action:"Add Title" group:B type:tv title:"Breaking Bad"
/bracket manage-titles action:"Add Title" group:C type:game title:"Elden Ring"
/bracket manage-titles action:"Add Title" group:A type:movie title:"Evil Dead" image:[uploaded-file.jpg]
```

**Example Usage (Removing):**
```
/bracket manage-titles action:"Remove Title" group:A position:2
/bracket manage-titles action:"Remove Title" group:D position:4
```

**Notes:**
- **Adding:** Searches the selected API for matching titles, returns up to 5 results
- **Adding:** Custom images override the default poster/cover art
- **Adding:** Each group must have exactly 4 titles before voting can begin
- **Adding:** Tournament type is set on first title added and cannot be changed
- **Removing:** Positions are numbered 1-4 based on display order
- **Removing:** Shifts remaining titles up in position
- Cannot manage titles after group voting begins

---

### `/bracket resize`

Change the number of groups before voting begins.

**Who Can Use:** Admin/Mod only

**Parameters:**
- `groups` (required, integer): New number of groups (4-12)

**Example Usage:**
```
/bracket resize groups:10
/bracket resize groups:9
```

**Notes:**
- Only available during the setup phase, before group voting begins
- Contracting (reducing group count) fails if any group that would be removed still has titles in it — move or remove those titles first
- Expanding (increasing group count) adds new empty groups ready for titles

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

## Smart Phase Commands

These intelligent commands automatically detect the tournament phase and perform the appropriate action. Use these for streamlined tournament management!

### `/bracket open`

**🆕 Smart Command** - Automatically opens the next round of voting based on tournament phase.

**Who Can Use:** Admin/Mod only

**Parameters:**
- `duration` (optional, string): Voting duration
  - Format: `<number><unit>` where unit is m (minutes), h (hours), or d (days)
  - Examples: "24h", "3d", "45m", "12h"
  - Default: 24h if not specified
  - Range: 5m minimum, 30d maximum

**What It Does:**
- **Group Stage:** Opens all closed groups for voting
- **Knockout Stage:** Opens all matchups in the current round (Round of 32, Round of 16, Quarterfinals, Semifinals, Finals)
- Automatically detects which phase the tournament is in
- No need to remember phase-specific commands!

**Example Usage:**
```
/bracket open
/bracket open duration:"48h"
/bracket open duration:"3d"
```

**Notes:**
- Simplifies tournament management - one command for all phases
- For group stage, opens all groups that aren't already voting
- For knockout stage, may require using `/bracket open-matchup` if there are too many matchups (>5) for one message
- Bot will guide you if regional opening is needed

---

### `/bracket close`

**🆕 Smart Command** - Automatically closes the current voting round based on tournament phase.

**Who Can Use:** Admin/Mod only

**Parameters:**
- `tiebreaker-duration` (optional, string): Duration for tiebreaker votes if needed
  - Format: `<number><unit>` where unit is m (minutes), h (hours), or d (days)
  - Examples: "1h", "30m", "2h"
  - Default: 1h if not specified
  - Range: 5m minimum, 7d maximum

**What It Does:**
- **Group Stage:** Closes all open groups and calculates results
- **Knockout Stage:** Closes all voting matchups in current round and advances winners
- Automatically creates tiebreaker votes if ties are detected
- No need to remember phase-specific commands!

**Example Usage:**
```
/bracket close
/bracket close tiebreaker-duration:"30m"
/bracket close tiebreaker-duration:"2h"
```

**Notes:**
- Simplifies tournament management - one command for all phases
- Automatically detects and creates tiebreakers for tied votes
- Advances tournament to next phase when appropriate
- Shows detailed results with winners and vote counts

---

## Group Stage Commands

These commands manage the group stage voting phase where participants vote for their top 2 titles in each group. Use these for **granular control** when you need to open/close specific groups.

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
- Posts interactive voting message with buttons for each title
- Groups can be opened separately (in waves)
- **Participants vote by clicking buttons** - no commands needed!
- Buttons highlight when selected (green = selected)
- Real-time vote count updates
- Members can change votes anytime before deadline
- Voting deadline is enforced - votes after deadline are ignored
- Use `/bracket extend-voting` to add more time if needed

**How Members Vote:**
1. Click a button to select a title (turns green)
2. Click a second title to complete vote (2 selections required)
3. Click selected title again to deselect
4. Maximum 2 selections per group

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

Close group voting and calculate results. Automatically creates tiebreaker votes if ties are detected.

**Who Can Use:** Admin/Mod only

**Parameters:**
- `groups` (required, string): Comma-separated list of groups to close (e.g., "A,B,C,D")
- `tiebreaker-duration` (optional, string): Duration for tiebreaker votes if needed
  - Format: `<number><unit>` where unit is m (minutes), h (hours), or d (days)
  - Examples: "1h", "30m", "2h"
  - Default: 1h if not specified
  - Range: 5m minimum, 7d maximum

**Example Usage:**
```
/bracket close-groups groups:"A,B,C,D"
/bracket close-groups groups:"A,B,C,D" tiebreaker-duration:"30m"
/bracket close-groups groups:"E,F,G,H" tiebreaker-duration:"2h"
/bracket close-groups groups:"A"
```

**Notes:**
- Calculates point totals for each title (3 points for 1st choice, 2 for 2nd)
- Determines 1st, 2nd, and 3rd place in each group
- **Automatically creates tiebreaker votes** if 1st or 2nd place ties detected
- Posts results to channel showing final standings
- Groups must be open before they can be closed
- Cannot reopen groups after closing
- Tiebreaker winners are automatically applied to final standings
- Use `/bracket advance-knockout` after all groups are closed

---

### `/bracket advance-knockout`

Generate the knockout bracket from group results and automatically start voting.

**Who Can Use:** Admin/Mod only

**Parameters:**
- `duration` (optional): How long voting stays open (e.g., "24h", "3d", "45m")
  - Default: 24 hours if not specified
  - Min: 5 minutes (5m)
  - Max: 30 days (30d)

**Example Usage:**
```
/bracket advance-knockout
/bracket advance-knockout duration:"48h"
/bracket advance-knockout duration:"3d"
```

**What It Does:**
1. Calculates wildcards from 3rd place finishers
2. Generates complete knockout bracket structure
3. **Automatically opens voting** for the first round with specified duration
4. Sends announcement with voting buttons for all matchups
5. Stores message IDs for auto-close scheduler

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
- **Voting starts immediately** - no separate command needed to open the first round
- Once knockout begins, cannot edit tournament
- Use `/bracket view` to see the bracket visualization
- Voting will auto-close when deadline is reached

---

### `/bracket regenerate`

Rebuild the knockout bracket from group results. Use this to fix bracket structure issues without redoing group voting.

**Who Can Use:** Admin/Mod only

**Parameters:** None

**Example Usage:**
```
/bracket regenerate
```

**Notes:**
- Rebuilds the entire knockout bracket from the group stage's closed results — seeding, wildcards, and matchups are all recalculated from scratch
- Useful if the bracket structure looks wrong after `/bracket advance-knockout`, or after manually correcting group results
- Any in-progress knockout voting is discarded and replaced by the freshly regenerated bracket
- All groups must still be closed for this to succeed (same requirement as `/bracket advance-knockout`)

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

## Knockout Commands

These commands manage the knockout/elimination phase where titles face off head-to-head. Use these for **granular control** when you need to open/close specific matchups or regions.

::: tip Use Smart Commands
For streamlined management, use `/bracket open` and `/bracket close` instead - they automatically detect the tournament phase and perform the right action!
:::

### `/bracket open-matchup`

Open matchup(s) for voting with text input or interactive buttons.

**Who Can Use:** Admin/Mod only

**Parameters:**
- `matchup` (optional, string): Matchup ID(s) using regional labels. Leave blank to select from buttons.
  - Single: "1A", "2B", "Finals"
  - Multiple: "1A,1B,2C" (comma-separated)
- `duration` (optional, string): Voting duration (default: 24h, range: 5m-30d)

**Example Usage:**

**Interactive mode (no matchup parameter):**
```
/bracket open-matchup duration:"24h"
```
→ Shows buttons for all pending matchups. Click button(s) to open them.

**Text mode (single matchup):**
```
/bracket open-matchup matchup:"1A"
/bracket open-matchup matchup:"2C" duration:"24h"
/bracket open-matchup matchup:"Finals" duration:"48h"
```

**Text mode (multiple matchups):**
```
/bracket open-matchup matchup:"1A,1B,1C" duration:"24h"
/bracket open-matchup matchup:"2A,2B,2C,2D"
```

**Features:**
- **Interactive buttons** - Leave matchup blank to see all pending matchups as buttons
- **Multi-matchup support** - Open several matchups at once with comma-separated list
- **Visual selection** - Buttons show matchup label and movie titles
- **Batch processing** - Each matchup processed individually with success/error tracking
- **Regional labels** - Use "1A", "2B" format for easy identification

**Notes:**
- Use regional labels: "1A", "2B", etc.
- Finals matchup uses "Finals" as the label
- Interactive mode shows up to 25 matchups (5 per row)
- Buttons expire after 15 minutes
- Useful for:
  - Spotlight matchups
  - Resolving technical issues
  - Managing voting flow
  - Opening multiple matchups quickly
- See `/bracket status` to find matchup IDs

---

### `/bracket close-matchup`

Close matchup(s) and advance winner(s) with text input or interactive buttons. Automatically creates tiebreaker votes if ties are detected.

**Who Can Use:** Admin/Mod only

**Parameters:**
- `matchup` (optional, string): Matchup ID(s) using regional labels. Leave blank to select from buttons.
  - Single: "1A", "2B", "Finals"
  - Multiple: "1A,1B,2C" (comma-separated)
- `tiebreaker-duration` (optional, string): Duration for tiebreaker votes if needed
  - Format: `<number><unit>` where unit is m (minutes), h (hours), or d (days)
  - Examples: "1h", "30m", "2h"
  - Default: 1h if not specified
  - Range: 5m minimum, 7d maximum

**Example Usage:**

**Interactive mode (no matchup parameter):**
```
/bracket close-matchup
/bracket close-matchup tiebreaker-duration:"30m"
```
→ Shows red buttons for all open matchups with current vote counts. Click button(s) to close them.

**Text mode (single matchup):**
```
/bracket close-matchup matchup:"1A"
/bracket close-matchup matchup:"2C" tiebreaker-duration:"2h"
/bracket close-matchup matchup:"Finals" tiebreaker-duration:"30m"
```

**Text mode (multiple matchups):**
```
/bracket close-matchup matchup:"1A,1B,1C"
/bracket close-matchup matchup:"2A,2B,2C,2D" tiebreaker-duration:"1h"
```

**Features:**
- **Interactive buttons** - Leave matchup blank to see all open matchups as buttons
- **Multi-matchup support** - Close several matchups at once with comma-separated list
- **Automatic tiebreakers** - Creates tiebreaker vote if matchup ends in a tie
- **Visual selection** - Buttons show matchup label, titles, and current votes (e.g., "1A: Jaws(5) vs Night...(3)")
- **Batch processing** - Each matchup processed individually with success/error tracking
- **Auto-advance tracking** - Shows which winners were placed in next round
- **Round completion detection** - Notifies when all matchups in round are closed

**Notes:**
- Calculates winner by vote count (most votes wins)
- **Automatically creates tiebreaker votes** if matchup ends in a tie
- Advances winner to next round automatically (or after tiebreaker resolves)
- Posts results showing vote counts
- Cannot undo - winner is locked in (unless tiebreaker created)
- Interactive mode shows up to 25 matchups (5 per row)
- Buttons expire after 15 minutes
- Tiebreaker winners are automatically advanced
- Useful for:
  - Closing matchups individually or in batches
  - Managing voting flow
  - Resolving technical issues
  - Quick tournament progression

---

### `/bracket resolve-tiebreaker`

Resolve an active tiebreaker — either by tallying the current votes (default) or by manually picking a winner (Admin/Mod override).

**Who Can Use:** Admin/Mod/Tournament Creator only

**Parameters:**
- `tiebreaker-id` (required, string): ID of the tiebreaker to resolve — shown in the tiebreaker voting embed footer
- `winner` (optional, integer): Manually pick the winner (1 = first option, 2 = second, etc.)
  - **Leave blank** to close voting now and resolve by current vote tallies
  - **Set a number** to override votes and force a specific winner
  - Maximum depends on how many options are tied (usually 2)

**Example Usage:**
```
# Close voting early — winner decided by current votes
/bracket resolve-tiebreaker tiebreaker-id:"abc123"

# Admin manually picks option 1 as the winner
/bracket resolve-tiebreaker tiebreaker-id:"abc123" winner:1

# Admin manually picks option 2 as the winner
/bracket resolve-tiebreaker tiebreaker-id:"abc123" winner:2
```

**Notes:**
- Without `winner`: counts current tiebreaker votes; if still tied, random selection is used as final fallback
- With `winner`: overrides all votes — admin's choice wins regardless of the vote count
- The tiebreaker voting embed is automatically disabled and updated with the result
- Vote breakdown is shown when resolving by tally
- Tiebreakers also auto-resolve when their deadline expires (no action needed if you're happy to wait)
- Cannot be undone — winner is locked in

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

View real-time tournament status with live voting statistics.

**Who Can Use:** Everyone

**Parameters:** None

**Example Usage:**
```
/bracket status
```

**Output Example (Group Stage):**
```
🏆 Summer Movie Madness
Status: group_stage | Phase: groups | Creator: @Admin

Group stage in progress!
Completed: 4/8 groups

📊 Active Voting:

Group E - 12 voters
⏰ 2h 15m
  🥇 The Thing (8)
  🥈 Evil Dead (7)

Group F - 8 voters
⚠️ 45m (WARNING: <1 hour remaining!)
  🥇 Alien (5)
  🥈 Hereditary (4)
```

**Output Example (Knockout):**
```
🏆 Summer Movie Madness
Status: knockout | Phase: semifinals | Creator: @Admin

Semifinals
Single elimination bracket

📊 Active Matchups:

Matchup 1A - 15 votes
⏰ 18h 32m
  Leading: The Thing (9)

Matchup 2A - 12 votes
⚠️ 55m
  Leading: Tied (6)

Completed: 6 matchups
```

**Notes:**
- Shows **real-time voter counts** for active voting
- Displays **time remaining** with ⚠️ warning when <1 hour left
- Shows **current leaders** in each active vote
- Tracks tournament progress with completion stats
- Automatically updates as voting progresses
- Use this to monitor participation and close voting
- Warning emoji (⚠️) appears when deadline is approaching

---

### `/bracket list-groups`

List all groups and the titles in each one.

**Who Can Use:** Everyone

**Parameters:** None

**Example Usage:**
```
/bracket list-groups
```

**Notes:**
- Shows every group's titles, in the order they were added
- Marks each group as voting-open or closed
- Useful during setup to see which groups still need titles before voting can begin

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

### `/bracket export`

Export tournament results in JSON or Markdown format.

**Who Can Use:** Everyone

**Parameters:**
- `format` (required, choice): Export format
  - `json` - Complete tournament data structure
  - `markdown` - Formatted results for announcements

**Example Usage:**
```
/bracket export format:json
/bracket export format:markdown
```

**JSON Export:**
- Complete tournament data structure
- All groups, matchups, votes, and metadata
- Perfect for archival or data analysis
- Can be imported back into bot (future feature)
- Includes voter IDs, timestamps, and full history

**Markdown Export:**
- Formatted results ready to paste
- Group stage results with vote counts
- Knockout bracket progression with winners
- Tournament statistics (total voters, total votes)
- Clean, readable format for Discord or documentation

**Example Markdown Output:**
```markdown
# Summer Movie Madness - Results

**Status:** Completed
**Winner:** 🏆 The Thing

## Group Stage Results

### Group A
1. 🥇 The Thing (47 votes) ✅ Advances
2. 🥈 Evil Dead (31 votes) ✅ Advances
3. 🥉 Hereditary (18 votes)
4. 📍 The Witch (12 votes)

## Knockout Stage

### Semifinals
- The Thing def. Alien (23-19)
- Evil Dead def. Hereditary (21-17)

### Finals
- **The Thing** def. Evil Dead (31-28) 🏆

## Statistics
- Total Voters: 58
- Total Votes Cast: 847
```

**Use Cases:**
- Archive completed tournaments
- Share results in announcements
- Create tournament history documentation
- Analyze voting patterns and participation
- Backup tournament data

---

### `/bracket edit-name`

Change the tournament name after creation.

**Who Can Use:** Admin/Mod only

**Parameters:**
- `name` (required, string): New tournament name

**Example Usage:**
```
/bracket edit-name name:"Epic Summer Movie Championship 2026"
/bracket edit-name name:"Quick Test Tournament"
```

**Notes:**
- Can be used at any tournament phase
- Updates name in all displays and embeds
- Useful for fixing typos or rebranding
- Does not affect tournament data or votes
- Name is visible to all participants
- Maximum 100 characters

**Common Use Cases:**
- Fix typos in tournament name
- Update branding mid-tournament
- Add year or season to name
- Rename based on community feedback

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
3. **Generate hype images** - Use `/image matchup:"Title A vs Title B"` for key matchups
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

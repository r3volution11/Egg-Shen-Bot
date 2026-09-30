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
| `setup-link` | Admin/Mod | Private link to the web [setup form](./import) (CSV/JSON upload or fill in) | Setup |
| `manage-titles` | Admin/Mod | Add or remove titles from groups | Setup |
| `resize` | Admin/Mod | Change the number of groups before voting begins | Setup |
| `edit-name` | Admin/Mod | Rename the tournament | Any |
| `announce` | Admin/Mod | Announce the tournament to the channel | Setup |
| `open` | Admin/Mod | Smart: Opens next round (auto-detects phase) | Any |
| `close` | Admin/Mod | Smart: Closes current round (auto-detects phase) | Any |
| `open-groups` | Admin/Mod | Open specific groups for button-based voting | Group Stage |
| `close-groups` | Admin/Mod | Close specific groups and calculate results | Group Stage |
| `regenerate` | Admin/Mod | Rebuild the knockout bracket from group results (fixes bracket structure issues) | Knockout |
| `resolve-tiebreaker` | Admin/Mod | Resolve a tiebreaker — tally votes or manually override | Any |
| `open-matchup` | Admin/Mod | Open specific matchup(s) for voting | Knockout |
| `close-matchup` | Admin/Mod | Close specific matchup(s) and advance winner(s) | Knockout |
| `extend-voting` | Admin/Mod | Extend or change voting deadline | Any |
| `my-votes` | Everyone | View your voting history and available votes | Any |
| `status` | Everyone | View tournament status with live voter counts and leaders | Any |
| `list-groups` | Everyone | List all groups and their titles | Any |
| `view` | Everyone | View visual bracket (knockout phase only) | Knockout |
| `export` | Everyone | Export the lineup and settings (JSON) or results (Markdown) | Any |
| `cancel` | Admin/Mod | Cancel the tournament | Any |

**Key Changes:**
- 🆕 **Smart Commands**: `/bracket open` and `/bracket close` auto-detect tournament phase
- 🔄 **Unified Management**: `/bracket manage-titles` replaces `add-title` and `remove-title`
- ⚖️ **Tiebreaker Voting & Resolution**: Ties are now resolved by member button-voting, with `/bracket resolve-tiebreaker` available to tally votes early or manually override the winner
- 🎨 **AI Images Moved**: Matchup image generation now lives in the standalone [`/image`](../ai-images) command (`/image matchup:"Title A vs Title B"`), alongside its freeform, message, and versus-search modes
- 🆕 **Setup Form**: `/bracket setup-link` sets up a whole tournament from a CSV or JSON file, or a form. See [Setup Form](./import)
- ❌ **Removed**: `advance-knockout` — `/bracket open` starts the knockout once every group is closed
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
- `name` (required, string): Tournament name (e.g., "The Ultimate Horror Cup")
- `max-titles` (optional, dropdown): Maximum number of titles (default: 32)
  - **Valid bracket sizes:** 2, 4, 8, 16, 32 (powers of 2)
  - **Valid group sizes:** 36, 40, 44, 48 (multiples of 4)
  - **Straight bracket** (2-32 titles): No groups; head-to-head matchups from round one. This is the most titles it can hold — you can start with fewer, and empty slots become byes
  - **Groups tournament** (36-48 titles): 9-12 groups of 4, then a knockout. `/bracket resize` changes the group count (4-12) during setup
  - Discord shows labeled choices: "8 titles (Quarterfinals)", "36 titles (9 groups)", etc.

**Example Usage:**
```
/bracket create name:"Summer Movie Madness" max-titles:32
/bracket create name:"Quick 8-Title Showdown" max-titles:8
/bracket create name:"Epic 48-Title Championship" max-titles:48
```

**Notes:**
- Tournament names are visible to all participants (max 100 characters)
- Default is 32 titles if not specified (straight bracket)
- The reply is private; use `/bracket announce` to tell the server
- Only one active tournament per server at a time

---

### `/bracket setup-link`

Get a private link to the web setup form, where you can set up a whole tournament at once instead of adding titles one by one.

**Who Can Use:** Admin/Mod only

**Parameters:** None

**Example Usage:**
```
/bracket setup-link
```

**Notes:**
- The reply is private, and the link works for 60 minutes. Anyone you give it to can change the server's tournament setup
- On the form, upload a CSV or JSON file, or fill the tournament in by hand
- The setup can be edited on the form until voting opens
- The form can also save seeding (straight brackets), default voting and tiebreaker durations, and an announcement message and banner
- The link uses this server's [bot URL](../configuration#bot-url) if set, else the bot's `PUBLIC_BOT_URL`; with neither, it says what to set instead
- A `/bracket export format:json` file can be uploaded here to run a tournament again

See [Setup Form](./import) for the file format and details.

---

### `/bracket manage-titles`

Add or remove titles during setup. This unified command replaces the old `add-title` and `remove-title` commands.

**Parameters:**
- `action` (required, choice): Action to perform
  - `Add Title` - Add a new title
  - `Remove Title` - Remove a title
- `group` (optional, choice): Group letter (A-L). Groups mode only — leave it out in a straight bracket (2–32 titles). When adding in groups mode without one, the title goes into the first group with room.
- `type` (optional, choice): Tournament type. Needed for the first title; after that the tournament's type is used if you leave it out
  - `movie` - Movies (searches TMDB)
  - `tv` - TV Shows (searches TMDB)
  - `game` - Video Games (searches RAWG)
  - `boardgame` - Board Games (searches BoardGameGeek)
  - `book` - Books (searches Google Books)
- `title` (optional, string): Title to search for (required when adding)
- `position` (optional, integer): The title's number from `/bracket list-groups` (required when removing). 1–4 within a group, or 1–32 in a straight bracket.
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
/bracket manage-titles action:"Remove Title" position:7
```

The last example is a straight bracket, which has no groups.

**Notes:**
- **Adding:** Searches the selected API. One match is added right away; several show a menu to pick the right one
- **Adding:** Custom images override the default poster/cover art
- **Adding:** Each group must have exactly 4 titles before voting can begin
- **Adding:** Tournament type is set on first title added and cannot be changed
- **Removing:** Use the numbers `/bracket list-groups` shows
- **Removing:** Shifts remaining titles up in position, so check `/bracket list-groups` again before removing a second one
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
- Default message shows tournament name and details. In a straight bracket it shows "Format: Straight bracket" and the title count
- Custom message replaces default text
- Banner image appears at top of announcement
- If the [setup form](./import) saved an announcement message or banner, they're used when `message` or `image` is left out
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
  - Default: the tournament's default voting duration from the [setup form](./import), else 24h
  - Range: 5m minimum, 30d maximum

**What It Does:**
- **Setup, straight bracket:** Builds the bracket and opens the first round. This is how a straight bracket starts. Seeding is random by default, or ordered (list order = seed order, 1 v N, byes to top seeds) if chosen on the [setup form](./import). If round one has more than 5 matchups, it builds the bracket and asks you to open it by region with `/bracket open-matchup`
- **Setup, groups mode:** Opens every group, once each one has 4 titles. If any are short, it lists them instead.
- **Group Stage:** Opens the groups that haven't voted yet. Once every group is closed and every tiebreaker is settled, it builds the knockout bracket and opens its first round. It never reopens a finished group; if groups are still voting or in a tiebreaker, it lists them instead
  - Knockout seeding: the top 2 from each group go through, plus the best third-place finishers (wildcards) up to the next power of 2, at most one per group. Group winners are placed first, so any byes go to them; runners-up and wildcards are shuffled in, and titles from the same group are kept apart in the first round where possible
  - The start-of-knockout message lists the wildcards
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
- For knockout rounds with more than 5 matchups (Round of 32, Round of 16), it asks you to open them by region with `/bracket open-matchup region:1`-`4` instead
- Nothing opens the next round automatically — run `/bracket open` after each close

---

### `/bracket close`

**🆕 Smart Command** - Automatically closes the current voting round based on tournament phase.

**Who Can Use:** Admin/Mod only

**Parameters:**
- `tiebreaker-duration` (optional, string): Duration for tiebreaker votes if needed
  - Format: `<number><unit>` where unit is m (minutes), h (hours), or d (days)
  - Examples: "1h", "30m", "2h"
  - Default: the tournament's default tiebreaker duration from the [setup form](./import), else 1h
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
  - Default: the tournament's default voting duration from the [setup form](./import), else 24h
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
  - Default: the tournament's default tiebreaker duration from the [setup form](./import), else 1h
  - Range: 5m minimum, 7d maximum

**Example Usage:**
```
/bracket close-groups groups:"A,B,C,D"
/bracket close-groups groups:"A,B,C,D" tiebreaker-duration:"30m"
/bracket close-groups groups:"E,F,G,H" tiebreaker-duration:"2h"
/bracket close-groups groups:"A"
```

**Notes:**
- Counts each title's votes; each voter's two picks count one vote each
- Determines 1st, 2nd, and 3rd place in each group
- **Automatically creates tiebreaker votes** if 1st or 2nd place ties detected
- Posts results to channel showing final standings
- Groups must be open before they can be closed
- `/bracket open` never reopens a closed group
- Tiebreaker winners are automatically applied to final standings
- After all groups are closed (and tiebreakers settled), run `/bracket open` to start the knockout

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
- Useful if the bracket structure looks wrong after `/bracket open` starts the knockout, or after manually correcting group results
- Any in-progress knockout voting is discarded and replaced by the freshly regenerated bracket
- Groups tournaments only. All groups must still be closed for this to succeed

---

## Knockout Commands

These commands manage the knockout/elimination phase where titles face off head-to-head. Use these for **granular control** when you need to open/close specific matchups or regions.

### Regional Label System

Each knockout round is split into **4 regions**, March Madness style. A matchup's label is its region number (1-4) plus a letter for its position within the region:

| Round | Matchups | Labels |
|-------|----------|--------|
| Round of 32 | 16 | 1A–1D, 2A–2D, 3A–3D, 4A–4D |
| Round of 16 | 8 | 1A, 1B, 2A, 2B, 3A, 3B, 4A, 4B |
| Quarterfinals | 4 | 1A, 2A, 3A, 4A |
| Semifinals | 2 | 1A, 3A |
| Finals | 1 | Finals |

`/bracket status` and the button pickers show each matchup's label.

::: tip Use Smart Commands
For streamlined management, use `/bracket open` and `/bracket close` instead - they automatically detect the tournament phase and perform the right action!
:::

### `/bracket open-matchup`

Open matchup(s) for voting with text input or interactive buttons.

**Who Can Use:** Admin/Mod only

**Parameters:**
- `region` (optional, integer 1-4): Open every matchup in that region of the current round
- `matchup` (optional, string): Matchup ID(s) using regional labels. Leave blank (and `region` blank) to select from buttons.
  - Single: "1A", "2B", "Finals"
  - Multiple: "1A,1B,3A" (comma-separated)
- `duration` (optional, string): Voting duration, 5m-30d. Default: the tournament's default voting duration from the [setup form](./import), else 24h

**Example Usage:**

**Interactive mode (no matchup or region):**
```
/bracket open-matchup duration:"24h"
```
→ If the round has more than 5 matchups, shows one button per region. Otherwise shows a button for each pending matchup. Click button(s) to open them.

**Region mode:**
```
/bracket open-matchup region:1
/bracket open-matchup region:2 duration:"48h"
```
→ Opens every matchup in that region. This is how Round of 32 and Round of 16 are opened, since `/bracket open` won't open more than 5 matchups at once.

**Text mode (single matchup):**
```
/bracket open-matchup matchup:"1A"
/bracket open-matchup matchup:"2B" duration:"24h"
/bracket open-matchup matchup:"Finals" duration:"48h"
```

**Text mode (multiple matchups):**
```
/bracket open-matchup matchup:"1A,1B" duration:"24h"
/bracket open-matchup matchup:"2A,2B,3A,3B"
```

**Features:**
- **Interactive buttons** - Leave matchup blank to see all pending matchups as buttons
- **Multi-matchup support** - Open several matchups at once with comma-separated list
- **Visual selection** - Buttons show matchup label and movie titles
- **Batch processing** - Each matchup processed individually with success/error tracking
- **Regional labels** - Use "1A", "2B" format for easy identification
- **Region opening** - Open a whole region (1-4) at once

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
- Only matchups that haven't been voted on are opened. Ones already voting keep their votes, decided ones keep their results, and the reply lists both

---

### `/bracket close-matchup`

Close matchup(s) and advance winner(s) with text input or interactive buttons. Automatically creates tiebreaker votes if ties are detected.

**Who Can Use:** Admin/Mod only

**Parameters:**
- `matchup` (optional, string): Matchup ID(s) using regional labels. Leave blank to select from buttons.
  - Single: "1A", "2B", "Finals"
  - Multiple: "1A,1B,3A" (comma-separated)
- `tiebreaker-duration` (optional, string): Duration for tiebreaker votes if needed
  - Format: `<number><unit>` where unit is m (minutes), h (hours), or d (days)
  - Examples: "1h", "30m", "2h"
  - Default: the tournament's default tiebreaker duration from the [setup form](./import), else 1h
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
/bracket close-matchup matchup:"2B" tiebreaker-duration:"2h"
/bracket close-matchup matchup:"Finals" tiebreaker-duration:"30m"
```

**Text mode (multiple matchups):**
```
/bracket close-matchup matchup:"1A,1B"
/bracket close-matchup matchup:"2A,2B,3A,3B" tiebreaker-duration:"1h"
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

Set a new voting deadline for a group or the current knockout round.

**Who Can Use:** Admin/Mod only

**Parameters:**
- `type` (required, choice): Voting type to extend
  - `group` - Group Stage Voting
  - `knockout` - Knockout Round Voting
- `duration` (required, string): New time left, counted from now (e.g., "24h", "3d", "45m")
  - The new deadline is now + `duration`. It replaces the current deadline rather than adding to it
  - Format: `<number><unit>` where unit is m, h, or d
  - Range: 5m minimum, 30d maximum
- `group` (required for group voting, string): Group letter

**Example Usage:**
```
/bracket extend-voting type:group duration:"12h" group:"A"
/bracket extend-voting type:knockout duration:"24h"
/bracket extend-voting type:group duration:"2d" group:"C"
```

**Notes:**
- For group voting: sets one group's deadline
- For knockout voting: sets the deadline of every open matchup in the current round
- The new deadline is now + `duration`, replacing the old one. `duration:"12h"` on a group with 20h left shortens it to 12h
- Useful when participation is low or more time is needed
- Cannot extend closed/completed voting
- The original voting messages aren't edited; the reply shows the new deadline

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

List all groups and the titles in each one. In a straight bracket (no groups), it lists every title as one numbered list instead.

**Who Can Use:** Everyone

**Parameters:** None

**Example Usage:**
```
/bracket list-groups
```

**Notes:**
- Shows every group's titles, in the order they were added
- In a straight bracket, shows every title as one numbered list
- The numbers are the `position` that `manage-titles action:"Remove Title"` takes
- Marks each group as voting-open or closed
- Useful during setup to see which groups still need titles before voting can begin

---

### `/bracket view`

Draw the tournament as an image.

**Who Can Use:** Everyone

**Parameters:** None

**Example Usage:**
```
/bracket view
```

**Notes:**
- During the knockout (and after it ends): a PNG bracket tree with every round, winners highlighted, and the champion once there is one
- Before the knockout: a PNG overview of the tournament's groups and titles
- Generated fresh each time, so it reflects the current state
- Use `/bracket status` for live vote counts

---

### `/bracket export`

Export the tournament's lineup and settings (JSON) or its results (Markdown).

**Who Can Use:** Everyone

**Parameters:**
- `format` (required, choice): Export format
  - `json` - Lineup and settings in the [setup form](./import)'s import format
  - `markdown` - Formatted results for announcements

**Example Usage:**
```
/bracket export format:json
/bracket export format:markdown
```

**JSON Export:**
- The setup form's import format: the title lineup (with ids filled in) and the tournament's settings
- No votes and no voter ids
- Upload it through `/bracket setup-link` to run the same tournament again

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
- Re-run a tournament with the same lineup (JSON)

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

### Example 1: Straight Bracket (8–32 titles)

**Setup:**
```
/bracket create name:"Quick Horror Showdown" max-titles:8
/bracket create name:"Summer Movie Madness" max-titles:32
```
*(or set it up in one go with `/bracket setup-link` and the [setup form](./import))*

**Configuration:**
- **Groups:** None
- **Titles:** up to `max-titles`; empty slots become byes (e.g., 12 titles in a 16 bracket gives 4 byes)
- **Knockout structure:** 8 titles start at Quarterfinals, 16 at Round of 16, 32 at Round of 32
- **Seeding:** Random by default; Ordered (list order, 1 v N, byes to top seeds) via the setup form
- **Start:** `/bracket open` builds the bracket and opens round one

**Best for:**
- Quick tournaments and weekend events
- Testing the system
- Smaller communities

**Timeline estimate:**
- 8 titles: 3 rounds, about 3–6 days
- 32 titles: 5 rounds, about 1–2 weeks

---

### Example 2: Small Groups Tournament (16 titles, 4 groups)

**Setup:**
```
/bracket create name:"Quick Horror Tournament" max-titles:36
/bracket resize groups:4
```
*`/bracket create` makes 9–12 groups; resize during setup, or use the [setup form](./import).*

**Configuration:**
- **Groups:** 4 groups (A-D) of 4
- **Advance:** Top 2 from each group = 8
- **Wildcards:** None needed
- **Knockout structure:** Quarterfinals → Semifinals → Finals

**Timeline estimate:**
- Group voting: 24-48 hours
- Knockout rounds: 3-5 days
- **Total:** ~1 week

---

### Example 3: Medium Groups Tournament (32 titles, 8 groups)

**Setup:**
```
/bracket create name:"Community Choice Awards" max-titles:36
/bracket resize groups:8
```

**Configuration:**
- **Groups:** 8 groups (A-H) of 4
- **Advance:** Top 2 from each group = 16
- **Wildcards:** None needed
- **Knockout structure:** Round of 16 → Quarterfinals → Semifinals → Finals

**Timeline estimate:**
- Group voting: 2-4 days
- Knockout rounds: 4-8 days
- **Total:** 1-2 weeks

---

### Example 4: Large Groups Tournament (40 titles, 10 groups)

**Setup:**
```
/bracket create name:"Ultimate Showdown" max-titles:40
```

**Configuration:**
- **Groups:** 10 groups (A-J) of 4
- **Advance:** Top 2 from each group = 20
- **Wildcards:** Best 10 third-place finishers = 30 total
- **Knockout structure:** Round of 32 (2 byes, to group winners) → Round of 16 → Quarterfinals → Semifinals → Finals

**Timeline estimate:**
- Group voting: 4-5 days
- Knockout rounds: 6-8 days
- **Total:** 2-3 weeks

---

### Example 5: Maximum Groups Tournament (48 titles, 12 groups)

**Setup:**
```
/bracket create name:"Epic Community Championship" max-titles:48
```

**Configuration:**
- **Groups:** 12 groups (A-L) of 4
- **Advance:** Top 2 from each group = 24
- **Wildcards:** Best 8 third-place finishers = 32 total
- **Knockout structure:** Round of 32 → Round of 16 → Quarterfinals → Semifinals → Finals

**Timeline estimate:**
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
- **Straight bracket:** 2-32 titles, no groups
- **Groups tournament:** 4-12 groups of 4 (16-48 titles), then a knockout
- **Dynamic resizing** of the group count during setup
- **Seeding:** random or ordered for straight brackets; from group results for groups tournaments
- **Wildcard system** fills the knockout bracket
- **Setup form** - set up a tournament from a CSV or JSON file, or by filling in a form (`/bracket setup-link`)

### Voting Options
- **Group stage:** Pick your top 2 titles in each group
- **Knockout stage:** Single-elimination voting
- **Flexible deadlines:** 5 minutes to 30 days
- **Deadline extension** for any phase
- **Button voting** throughout, through a personal voting dashboard (only you see your picks)

### Opening Strategies
- **Entire round:** Open all matchups at once (up to 5)
- **By region:** Open one of the 4 regions
- **Individual matchups:** Open one at a time for spotlight effect

### Customization
- **Custom images** for any title (overrides API posters)
- **Custom announcements** with banner images
- **Regional identification** (1A, 2B labels) for clear bracket navigation
- **Tournament naming** for branding
- **Default voting and tiebreaker durations** set on the setup form

### Management Features
- **Persistent storage** across bot restarts
- **Vote tracking** per user
- **Status monitoring** at any time
- **Automatic winner advancement**
- **Bracket regeneration** for fixing issues
- **JSON export** that can be re-imported through the setup form

### Visual Features
- **AI-generated versus images** with the separate [`/image`](../ai-images) command
- **Bracket images** with `/bracket view`
- **Group standings**
- **Live vote counts** during voting

---

## Limitations & Not Possible

Understanding what the system cannot do helps set proper expectations:

### Tournament Configuration
- ❌ **Cannot change tournament type** after first title is added
  - Tournament type (movie/tv/game/boardgame/book) is locked by the first title added
- ❌ **Cannot edit tournament** once voting begins
  - No adding/removing titles after setup
- ❌ **Cannot remove groups** that still have titles in them
- ❌ **Maximum 12 groups** (48 titles) or 32 titles in a straight bracket
- ❌ **Each group must have exactly 4 titles**
  - Cannot proceed with incomplete groups

### Voting Restrictions
- ❌ **Cannot undo a result** once a matchup is closed
  - Close-matchup is final - winner is locked in
- ❌ **Finished groups stay finished**
  - `/bracket open` never reopens a closed group, and the knockout is seeded from its results
- ❌ **Cannot vote after deadline**
  - Voting deadlines are enforced strictly

### Technical Limitations
- ❌ **One active tournament per server** at a time
  - Cannot run multiple tournaments simultaneously
- ❌ **Cannot restore cancelled tournaments**
  - Cancel is permanent - no recovery
- ❌ **AI image generation has rate limits**
  - Per-user and per-server limits apply
  - Requires OpenAI API key configuration

### Bracket Structure
- ❌ **Cannot hand-seed a groups tournament's knockout**
  - Knockout seeding comes from group results (ordered seeding is for straight brackets only)
- ❌ **Cannot modify knockout bracket structure**
  - Bracket format is determined by participant count
- ❌ **Cannot skip knockout rounds**
  - Must complete all rounds sequentially
- ❌ **Cannot have byes in group stage**
  - All groups must have 4 titles

### Data Management
- ❌ **Cannot import votes or results**
  - The setup form imports a lineup and settings only; JSON export leaves out votes
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
1. **Plan your size** - Straight bracket (2-32 titles) or groups tournament (4-12 groups)
2. **Announce in advance** - Build hype before creating tournament
3. **Prepare title list** - Have titles ready to add quickly
4. **Test with small tournament** - Practice with an 8-title straight bracket first

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
2. **Use regions strategically** - Open the 4 regions separately with `/bracket open-matchup region:`
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

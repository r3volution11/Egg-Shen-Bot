# Changelog

All notable changes to Egg Shen Bot will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Button State Visual Feedback in Voting Messages** (2026-06-29)
  - **Group Stage:** Voting buttons in the shared message now show selection state
    - Selected titles: Primary style (purple/blue based on Discord theme)
    - Unselected titles: Secondary style (gray)
    - Buttons update in real-time as you vote
    - Simple "✅ Vote recorded" confirmation (ephemeral)
  - **Knockout Rounds:** Voting buttons show your selection state
    - Your vote: Primary style (purple/blue)
    - Other option: Secondary style (gray)  
    - Buttons update to reflect your choice
    - Simple "✅ Vote recorded" confirmation (ephemeral)
  - **Benefits:**
    - Immediate visual feedback right on the voting buttons
    - No separate cards to track
    - Clean, intuitive UX - the button you clicked turns purple
    - Works with your Discord theme color scheme
  - **Note:** Button states show your OWN selections. Other users see their own button states based on their votes.
  - **Applies to all media types:** Movies, TV shows, video games, board games, books, and any future additions (episodes, music, etc.)

### Changed
- **Simplified Knockout Voting Confirmations** (2026-06-29)
  - **Previous:** Attempted to maintain persistent "Your Votes" dashboard for knockout rounds
  - **Issue:** Ephemeral messages from `followUp()` cannot be fetched and edited, causing duplicate cards on each vote
  - **Root cause:** Discord's ephemeral messages are client-side only and not retrievable via API after creation
  - **New approach:** Simple "✅ Vote recorded for [Title]!" confirmation message
  - **Rationale:** Public "All Votes" leaderboard already shows all voting information, so persistent personal dashboard is redundant
  - **Result:** Clean voting experience with no duplicate cards
  - **What you see now:**
    - Public "All Votes" leaderboard (updates in place, everyone sees)
    - Simple vote confirmation (ephemeral, disappears quickly)
    - No more dashboard spam!

### Fixed
- **Knockout Dashboard Still Creating Multiple Cards** (2026-06-29)
  - **Issue:** Dashboard was still creating new cards on each vote instead of updating the existing one
  - **Root cause:** Fallback logic was too aggressive - if message fetch failed for ANY reason, created new message with `followUp()` instead of updating
  - **Fix:**
    - Simplified dashboard update logic with proper try/catch around message fetch
    - Only delete dashboard from cache and create new one if message truly doesn't exist
    - Added console logging to track dashboard creation vs updates
    - Changed from nested if/else to single try/catch for cleaner error handling
  - **Result:** Dashboard now consistently updates in place on subsequent votes, only creates new message on first vote or if previous message was deleted
- **Knockout Voting Interaction Error Fixed** (2026-06-29)
  - **Issue:** All knockout votes failed with "An error occurred while processing your vote" after dashboard flooding fix
  - **Root cause:** Double-defer - `interaction.deferUpdate()` at button handler level + `interaction.deferReply()` in knockout handler = "InteractionAlreadyReplied" error
  - **Fix:**
    - Removed `deferReply()` from handleKnockoutVote (interaction already deferred as update)
    - Changed all `editReply()` calls to `followUp()` for ephemeral dashboard messages
    - Kept `deferUpdate()` at top level for button message updates
  - **Result:** Voting works again with proper dashboard tracking
- **Knockout Voting Dashboard Flooding Fixed** (2026-06-29)
  - **Issue:** Each knockout vote created a NEW ephemeral "Your Votes" card, flooding the channel with multiple cards (user reported 5+ cards stacking up as they voted)
  - **Root cause:** Interaction wasn't properly deferred before trying to update dashboard, causing `followUp()` calls to create new messages instead of updating existing ones
  - **Fix:**
    - Added proper `interaction.deferReply({ ephemeral: true })` at the start
    - Changed dashboard creation to use `interaction.editReply()` for first message
    - Dashboard updates now properly edit the existing message instead of creating new ones
    - Personal dashboard persists and updates in place as user votes
  - **Result:** Users now see ONE "Your Votes" card that updates as they vote, not a flood of cards
  - **Public tally:** The public matchup voting messages (visible to everyone) continue to update with real-time vote counts
  - **Benefits:**
    - Clean UX - only one personal dashboard per round
    - Real-time progress tracking without clutter
    - Public voting cards show live vote totals for all users
- **Multiple Matchup Voting Buttons Separated** (2026-06-29)
  - **Issue:** When opening multiple matchups (via comma-separated input or region selector), all voting buttons were bundled together at the bottom, making it difficult to understand which buttons corresponded to which matchup
  - **Fix:** Each matchup now posts as a separate message with its own voting buttons directly below its card
  - **Impact:** Users can now clearly see which buttons belong to each matchup, significantly improving voting UX
  - **Affected commands:**
    - `/bracket open-matchup` (when opening multiple matchups like "1A,1B,1C")
    - `/bracket open-region` (opens all matchups in a region)

### Changed
- **Bracket Visualization Poster Opacity Increased to 50%** (2026-06-29)
  - **Previous:** Started at 30%, increased to 40%, now at 50% opacity
  - **Progression:** 30% → 40% → 50% (iterative improvements based on user feedback)
  - **Reason:** User tested 40% and confirmed posters could be even more prominent
  - **Impact:** Posters now significantly more visible in bracket visualizations while still maintaining excellent text readability
  - **Sweet spot:** 50% provides strong visual presence without overwhelming text content

### Added
- **Public "All Votes" Leaderboard for Knockout Rounds** (2026-06-29)
  - **Real-time public leaderboard** - Single card visible to everyone showing current vote tallies across all matchups in the round
  - **Updates in place** - Leaderboard refreshes automatically after each vote, not repeated
  - **Live statistics:**
    - Each matchup with current vote counts (e.g., "1A: Jaws (5) vs Kwaidan (3) 🔥")
    - Leader indicator: 🔥 for matchup with more votes, 🤝 for tied matchups
    - Total votes cast across all matchups
    - Number of matchups currently open
  - **Persistent tracking** - One leaderboard per guild per round, cached and updated in place
  - **Benefits:**
    - PRIMARY voting feedback for knockout rounds - shows all matchup tallies in one place
    - Users see real-time competition without voting
    - Transparent vote counts visible to all
    - Creates excitement and engagement around close matchups
    - No chat spam - single card updates silently
  - **Simple confirmation system:**
    - Vote button clicked → Simple "✅ Vote recorded!" confirmation (ephemeral)
    - "All Votes" leaderboard updates automatically (public, persistent)
    - Clean UX with no dashboard spam
- **Interactive Region Selector for open-region** (2026-06-29)
  - **`/bracket open-region` with no parameter** - Shows 2 buttons: Region 1 (Left Side) and Region 2 (Right Side)
  - **Simple button selection** - Just 2 options with directional emoji arrows (⬅️ ➡️)
  - **Shows matchup counts** - See how many matchups in each region before opening
  - **Consistent with other interactive selectors** - Same UX pattern as open-matchup and close-matchup
  - **Benefits:**
    - Faster than typing "1" or "2"
    - Visual clarity with emoji indicators
    - See matchup distribution before opening
    - Consistent button-based workflow
- **Interactive Matchup Selectors** (2026-06-29)
  - **`/bracket open-matchup` with no parameter** - Shows buttons for all pending matchups
  - **`/bracket close-matchup` with no parameter** - Shows buttons for all open matchups
  - **Visual selection interface:**
    - Open selector: Blue buttons showing matchup label and movie titles (e.g., "1A: Jaws... vs Night of...")
    - Close selector: Red buttons showing matchup label, titles, and current votes (e.g., "1A: Jaws(5) vs Night of...(3)")
  - **Multi-select supported** - Click multiple buttons to open/close several matchups at once
  - **15-minute button timeout** - Buttons expire after 15 minutes to keep UI clean
  - **Benefits:**
    - No need to remember/type matchup labels
    - Visual overview of all available matchups
    - Faster admin workflow
    - See current vote counts before closing
    - Reduces typing errors
- **Multi-Matchup Support** (2026-06-29)
  - **Comma-separated matchup lists** - Open or close multiple matchups with one command
  - **`/bracket open-matchup matchup:"1A,1B,2C"`** - Open multiple matchups at once
  - **`/bracket close-matchup matchup:"1A,1B,2C"`** - Close multiple matchups at once
  - **Individual error handling** - Each matchup processed separately with success/error tracking
  - **Smart response formatting:**
    - Single matchup: Detailed embed with region name and results
    - Multiple matchups: Summary embed listing all successes and errors
  - **Auto-advance tracking** - Shows which winners were automatically placed in next round
  - **Round completion detection** - Notifies when all matchups in round are closed
  - **Benefits:**
    - Faster tournament management
    - Less command spam in channels
    - Clear feedback for batch operations
    - Backwards compatible with single matchup commands
- **Prominent Matchup Labels in Voting** (2026-06-29)
  - **Clear matchup identification** - Every voting embed shows "**1A:** Vote for your pick!" in description
  - **Consistent across all contexts:**
    - advance-knockout (auto-open first round)
    - open-knockout (region-based opening)
    - open-matchup (individual/multi matchup opening)
    - Interactive button handlers
  - **Benefits:**
    - Users immediately see which matchup they're voting for
    - Reduces confusion when multiple matchups displayed
    - Better accessibility and clarity
    - Regional labels impossible to miss
- **Persistent Ephemeral Voting Dashboard** (2026-06-28)
  - **Real-time personal dashboard** - Each user gets their own voting tracker (only they can see it)
  - **Updates as you vote** - Dashboard refreshes instantly with checkmarks (✅) for selected titles
  - **Color-coded status** - Gray (no votes), Blue (partial), Green (complete)
  - **Works for BOTH phases:**
    - **Group Stage:** Shows all titles with ✅ for selected, ⬜ for not selected
    - **Knockout Rounds:** Shows all matchups with ✅ for voted, ⬜ for not voted
  - **Progress indicators** - "1 of 2 selected" or "All matchups voted!" with guidance
  - **Persistent across clicks** - Same message updates instead of creating new messages
  - **Smart cleanup** - Old dashboards auto-deleted after 1 hour
  - **Benefits:**
    - Users see their vote state in real-time across ALL matchups
    - No confusion about which buttons they clicked (especially important in large knockout rounds)
    - Reduces channel clutter (one persistent message vs many)
    - Works perfectly with Discord's ephemeral system
    - No cross-user pollution (each dashboard is private)
    - Track progress in Round of 32 (16 matchups), Round of 16 (8 matchups), etc.
- **Consolidated Tournament Warning Messages** (2026-06-28)
  - **Grouped by deadline** - Multiple groups with same deadline = ONE warning message
  - **Before:** 4 groups closing = 4 separate warning messages
  - **After:** 4 groups closing = 1 consolidated message: "Groups I, J, K, L"
  - **Works for both phases** - Group stage AND knockout matchups
  - **Benefits:**
    - Reduces notification spam (4 messages → 1 message)
    - Clearer communication (see all closing at once)
    - Less channel clutter
    - Better tournament pacing visibility
- **Auto-Start Knockout Voting** (2026-06-28)
  - **`/bracket advance-knockout` now auto-opens voting**
  - **Customizable duration** - `/bracket advance-knockout duration:"24h"` (default: 24h)
  - **One command workflow** - Generate bracket AND start voting immediately
  - **Sends voting buttons** - All matchups ready to vote right away
  - **Stores message IDs** - Scheduler can track and auto-close
  - **Fallback handling** - Clear error if voting fails to open
  - **Benefits:**
    - Eliminates extra `/bracket open-knockout` step
    - Better tournament flow and momentum
    - Natural expectation met (knockout starts = voting starts)
    - Fewer commands to remember
- **Comprehensive Logging System** (Drupal Watchdog-style)
  - **File-based logging** - All events logged to `logs/` directory in JSON format
  - **8 severity levels** - EMERGENCY (0) to DEBUG (7) following syslog standards
  - **Categorized logs** - system, command, button, select, modal, scheduler, bracket, timer, survey, api, database, performance, security
  - **Daily rotation** - New log file each day: `[category]-YYYY-MM-DD.log`
  - **Size-based rotation** - Files rotate when exceeding 10MB
  - **Auto-cleanup** - Logs older than 30 days automatically deleted
  - **Performance tracking** - Slow operations logged with duration
  - **Crash diagnosis** - Uncaught exceptions and unhandled rejections captured
  - **Discord errors** - Client errors and warnings logged
  - **`/eggshen-logs stats`** - View log statistics (file count, total size)
  - **`/eggshen-logs errors`** - View recent errors (EMERGENCY to ERROR levels)
  - **`/eggshen-logs category`** - View logs by category
  - **Benefits:**
    - Diagnose production crashes and CPU issues
    - Track command execution and performance
    - Monitor button interaction failures
    - Historical data for troubleshooting
    - Easy log viewing from Discord
    - No more diagnostic blackouts
- **Automatic Voting Closure System**
  - **Auto-close scheduler** - Background service checks voting deadlines every minute
  - **1-hour warnings** - Automatic reminder sent when voting closes in less than 1 hour
  - **Auto-close at deadline** - Groups and matchups automatically close when deadline passes
  - **Results posted automatically** - Final vote counts and winners announced when voting ends
  - **Visual closure** - Voting messages updated to show "🔒 CLOSED" status
  - **Disabled buttons** - All voting buttons disabled when voting ends
  - **Graceful shutdown** - Clean restart handling ensures no lost state
  - **Benefits:**
    - No manual intervention needed to close voting
    - Members get advance warning to cast votes
    - Immediate results when voting ends
    - Consistent tournament pacing
    - Reduces admin workload
- **Tournament Export System**
  - **`/bracket export format:json`** - Export full tournament data as JSON
    - Complete tournament structure, all groups, matchups, votes
    - Perfect for archival or data analysis
    - Can be imported back into bot (future feature)
  - **`/bracket export format:markdown`** - Export formatted results as Markdown
    - Group stage results with vote counts
    - Knockout bracket progression
    - Tournament statistics (voter participation, total votes)
    - Ready to paste into announcements or documentation
  - **Use cases:**
    - Archive completed tournaments
    - Share results in Discord or other platforms
    - Analyze voting patterns
    - Document tournament history
- **Tournament Management Improvements**
  - **`/bracket edit-name`** - Change tournament name after creation
    - Admin/moderator only
    - Update tournament branding mid-tournament
    - Fix typos in tournament name
  - **Enhanced `/bracket status`** - Real-time tournament dashboard
    - Shows **active voters count** for each open group/matchup
    - Displays **time remaining** with ⚠️ warning when <1 hour left
    - Shows **current leaders** in each active vote
    - More detailed progress tracking
    - Live vote counts for all active voting
- **Robust Error Handling**
  - **Comprehensive try-catch blocks** around all async operations
  - **Detailed error logging** with context (guild ID, user ID, custom ID)
  - **Graceful degradation** for API failures
  - **User-friendly error messages** instead of generic failures
  - **Button interaction safety** - Prevents "interaction failed" errors
  - **Message update protection** - Vote recorded even if message update fails
  - **Benefits:**
    - More reliable button voting
    - Better debugging for production issues
    - Improved user experience during errors
    - Prevents crashes from unexpected failures
- **Button-Based Group Voting**
  - **Interactive voting** - Members vote by clicking buttons instead of typing commands
  - **Visual feedback** - Selected titles highlight in green
  - **Real-time updates** - Vote counts update live on the voting message
  - **Simplified UX** - No commands needed for members to vote
  - **Two-click voting** - Click 2 buttons to cast your vote
  - **Flexible changes** - Deselect by clicking again, change anytime before deadline
  - **Clear constraints** - Maximum 2 selections enforced automatically
  - **Benefits:**
    - Eliminates need to remember movie positions (1-4)
    - No typing required - just point and click
    - Consistent with knockout voting (already button-based)
    - More accessible and intuitive for all users
    - Reduces voting errors and confusion
- **Improved Tournament Help & Button UX**
  - **`/bracket help`** - New comprehensive tournament guide command
    - Quick start steps for admins (8-step tournament flow)
    - How to vote instructions for members (group + knockout stages)
    - Common commands organized by role (Everyone vs Admin/Mod)
    - Auto-features overview (auto-close, warnings, live counts)
    - Pro tips (duration syntax, wildcards, custom images, exports)
  - **Enhanced button voting feedback**
    - Group voting: Visual embeds showing selection progress (1 of 2, 2 of 2)
    - Knockout voting: Confirmation embeds with trophy emoji and selected title
    - Color-coded embeds: Blue for partial selection, green for complete
    - Numbered steps in instructions with emojis (1️⃣ 2️⃣ 3️⃣ 4️⃣)
  - **Clearer voting instructions**
    - Opening messages with numbered how-to-vote steps
    - Prominent tips about changing votes before deadline
    - Updated footer text to guide users ("👇 Click a button...")
    - Simplified group embed descriptions
  - **Benefits:**
    - New users can learn tournament system with `/bracket help`
    - Better visual feedback reduces confusion
    - Consistent emoji-based UI throughout
    - Ephemeral responses keep channels clean
    - More intuitive voting experience
- **Timer Reminder** - New `/timer remind` subcommand
  - **`/timer remind`** - Announce timer is starting right before watch party begins
  - **Auto-detects Discord scheduled events** - Finds event linked to current channel
  - **TMDB integration** - Shows poster, runtime, year, and overview
  - **Smart buttons** - "View on TMDB" and "Join Voice Channel" (if applicable)
  - **Custom host message** - Add personal message (e.g., "Everyone ready?")
  - **Role mentions** - Ping specific groups
  - **Pre-timer announcement** - Use right before running `/timer start`
  - **Use case:** Already announced watch party 1-2 hours ago? Use this for final "timer starting now" notice
  - **Integrated with timer** - All timer-related functions in one command
- **Regional Bracket Identification System**
  - **Regional labels** for all knockout matchups (e.g., "1A", "2B", "1C")
  - **Region 1 (Left Side)**: Matchups labeled 1A, 1B, 1C, 1D...
  - **Region 2 (Right Side)**: Matchups labeled 2A, 2B, 2C, 2D...
  - **Regional labels shown in:**
    - Command parameters (use "1A" instead of "1")
    - All voting embeds and displays
    - Generated bracket images
    - Result announcements
  - **New `/bracket open-region` command**
    - Open all matchups in one region (left or right side)
    - Perfect for splitting rounds across multiple days
    - Example: Open Region 1 Monday, Region 2 Wednesday
  - **Three opening options for maximum flexibility:**
    - `/bracket open-knockout` - Opens entire round (all matchups, both regions)
    - `/bracket open-region region:1` - Opens all left side OR right side matchups
    - `/bracket open-matchup matchup:1A` - Opens one specific matchup
  - **Benefits:**
    - Easier to reference specific matchups ("open 1A" vs "open matchup 1")
    - Visual clarity in bracket structure (left vs right side)
    - Flexible pacing options (by round, by region, or by matchup)
    - Better organization for large tournaments
    - Clear regional narratives ("East vs West", "Old School vs New School")

### Changed
- **BREAKING: Tournament Bracket Command Structure**
  - **Replaced `/bracket add-group`** with **`/bracket add-title`** for precise title selection
  - **Old workflow:** Add 4 titles at once, auto-select first match when multiple results found
  - **New workflow:** Add one title at a time with selection menu for disambiguation
  - **Why:** Aligns with bot's core principle of letting users select the exact title they want
  - **Migration:** Instead of `/bracket add-group group:A type:movie title1:X title2:Y title3:Z title4:W`, now run `/bracket add-title group:A type:movie title:X` four times
  - **Benefits:** 
    - Selection menu shows all matches with years and descriptions (like `/movie`, `/tv`, etc.)
    - Progress tracking shows "2/4 titles" so you know how many more needed
    - Prevents duplicate titles in same group
    - More flexibility - can add 1-4 titles per group before opening voting
- **Tournament Creation Privacy**
  - `/bracket create` is now **ephemeral** (only visible to admin/moderator who created it)
  - Regular members no longer see setup process
  - Use `/bracket announce` when ready to share tournament with server
  - Keeps channel clean during tournament setup

### Removed
- **`/bracket vote-group` command** - No longer needed
  - Group stage voting is now button-based
  - Members vote by clicking buttons on the voting message
  - Eliminates 21 command parameters (group, choice1, choice2) that users had to remember
  - Simpler, more intuitive user experience

### Improved
- **Tournament Bracket Visualization (`/bracket view`)**
  - **Complete redesign** - Now displays a proper tournament bracket tree layout (like March Madness)
  - **Clear matchup pairing** - Each matchup has two participant boxes grouped together with container border
  - **Proper bracket tree structure** - Connector lines show which matchups feed into next round
  - **Minimum 1200px width** - Wide, spacious, professional appearance
  - **Landscape participant boxes** - 240px wide × 50px tall for optimal readability
  - **Left-aligned text** - Easier to read than centered text
  - **Smart truncation** - Ellipsis for titles that don't fit
  - **Visual flow** - Clear progression from left to right through rounds
  - **Matchup spacing** - 140px vertical spacing with 10px gap between paired participants
  - **Better connector lines** - 40px horizontal extension then vertical connection to next round
  - **Winner indicators** - Green highlighting and checkmarks on the right side of boxes
  - **Full bracket tree generation** - All rounds (Round of 32 → Round of 16 → Quarterfinals → Semifinals → Finals) are generated upfront with "TBD" placeholders
    - Previously only showed current round with completed matchups
    - Now displays complete tournament structure from start to finish
    - Future matchups show as "TBD vs TBD" until winners are determined
    - Provides clear visual roadmap of entire tournament progression
- **Group Voting Display (`/bracket open-groups`)**
  - **Even distribution** - Groups now display in balanced rows (e.g., 4 groups = 2x2 grid instead of 3-1)
  - **Dynamic layout** - Automatically calculates optimal groups per row:
    - 4 or fewer groups: 2 per row
    - 5-9 groups: 3 per row
    - 10+ groups: 4 per row
  - **Better visual balance** - Cleaner, more symmetrical presentation when opening group voting

### Added
- **Tournament Brackets**
  - **NEW: Knockout Voting System** - Complete interactive voting for tournament bracket matches
    - **`/bracket open-knockout`** - Opens current round matchups for member voting
      - Button-based voting interface for each matchup
      - Real-time vote count updates
      - One vote per user per matchup (can change vote anytime)
      - Displays all matchups for current round with VS presentation
    - **`/bracket close-knockout`** - Closes round and advances winners automatically
      - Determines winner for each matchup (higher votes win, random if tied)
      - **Auto-advances winners** to next round matchups
      - **Auto-updates tournament phase** when round completes
      - Shows detailed results with vote counts
      - Detects tournament completion after finals
    - **Interactive Button Voting**
      - Click title buttons to vote in matchups
      - Ephemeral confirmation when vote recorded
      - Vote updates immediately in message
      - Can change vote by clicking different option
      - Ensures one vote per matchup per user
    - **Automatic Winner Advancement**
      - Winners automatically populate next round matchups
      - Tournament phase advances seamlessly (Round of 16 → Quarterfinals, etc.)
      - Finals completion marks tournament as complete with champion
      - Bracket visualization updates with results
    - **Complete Workflow:** Generate bracket → Open voting → Members vote → Close round → Winners advance → Repeat until champion
  - **NEW: Customizable Voting Timeframes** - Control voting duration for group stage and knockout rounds
    - **`duration` parameter** added to `/bracket open-groups` and `/bracket open-knockout`
      - Default: 24 hours
      - Range: 5 minutes (5m) to 30 days (30d)
      - Format: "5m", "2h", "24h", "3d", "7d", etc.
      - Examples: `duration:48h` for 2 days, `duration:3d` for 3 days, `duration:1h` for 1 hour
    - **Voting deadline display** - Shows time remaining and exact deadline in embeds
    - **`/bracket extend-voting`** - Extend or change voting deadline after opening
      - For group voting: extend specific groups by letter
      - For knockout: extends all matchups in current round
      - Admins and moderators can modify deadlines as needed
      - Shows updated time remaining and exact deadline after extending
    - **Flexible tournament pacing** - Run quick tournaments (30-minute rounds) or slow-burn events (week-long voting)
    - **Per-server control** - Tournament admins set duration based on their community's needs
    - **Deadline enforcement** - Voting automatically blocked after deadline expires
      - Users receive clear error message with time expired ("ended 2 hours ago")
      - Prevents late votes while allowing admins to extend if needed
      - Lazy evaluation approach - validates on vote attempt, no background jobs needed
      - Encourages admins to close voting or extend deadlines proactively
  - **NEW: `/bracket my-votes`** - View your personal voting status and history
    - **Private voting dashboard** (ephemeral response - only you can see it)
    - **Groups voted** - See which groups you've voted in and your exact choices
    - **Available votes** - Lists groups/matchups you haven't voted in yet
    - **Time remaining** - Shows countdown for each active vote
    - **Knockout history** - View all matchup votes you've cast
    - **Never miss a vote** - Easy way to track what's left to vote on
    - **Deadline awareness** - See when each vote expires
    - **Perfect for large tournaments** - Essential when managing 8-12 groups with staggered voting
  - **NEW: Individual Matchup Control** - Open and close specific matchups for granular tournament pacing
    - **`/bracket open-matchup`** - Open a single matchup for voting instead of entire round
      - Specify matchup number (1-32 depending on round)
      - Set custom duration per matchup
      - Perfect for spacing out matchups over days
      - Build suspense by featuring one battle at a time
      - Example: `/bracket open-matchup matchup:1 duration:24h`
    - **`/bracket close-matchup`** - Close individual matchup and determine winner
      - Closes specific matchup by number
      - Winner immediately placed in next round slot
      - When ALL matchups in round close, tournament auto-advances
      - Flexible staggered closing
      - Example: `/bracket close-matchup matchup:1`
    - **Use Cases:**
      - One matchup per day for maximum engagement
      - Spotlight important matchups individually  
      - Mix batch mode (whole round) with individual mode
      - Feature matchups with custom timings
      - Build community discussion around each battle
    - **Auto-Advancement Intelligence:**
      - Each matchup winner advances immediately to their next round slot
      - Tournament phase advances when last matchup in round closes
      - Seamless progression whether using batch or individual mode
      - Combine approaches within same tournament (batch some rounds, individual others)
  - **NEW: Custom Image Support** - Upload images or provide URLs when adding titles to brackets
    - Optional `image` parameter in `/bracket add-title` (attachment option)
    - Upload images directly from your device (PNG, JPG, GIF, WebP)
    - Or paste image URLs from Discord CDN, Imgur, or any direct image link
    - Custom images override API posters in matchups and voting screens
    - Perfect for servers that don't want AI-generated images
    - Useful for custom artwork or specific promotional posters
    - Falls back to API poster if no custom image provided
  - **NEW: `/bracket remove-title`** - Remove titles from groups during setup phase
    - Remove by position (1-4) from any group
    - Only available before voting starts
    - Automatic re-indexing of remaining titles
    - Confirmation embed shows removed title with thumbnail
    - Useful for fixing mistakes before opening group voting
  - **NEW: `/bracket resize`** - Dynamically expand or contract tournaments during setup
    - Change group count from 4-12 groups (16-48 total titles)
    - **Expanding:** Adds new groups (shows which new groups are available)
    - **Contracting:** Validates that groups being removed are empty
    - **Smart Validation:** Provides detailed actionable guidance when resize fails
      - Lists which groups have titles that would be removed
      - Shows exactly how many titles need to be moved or removed
      - Suggests minimum group count needed to keep all current titles
      - Offers 3 clear options: move titles, remove titles, or adjust target size
    - Perfect for tournaments that grow larger than initially planned
  - **NEW: `/bracket announce`** - Public tournament announcements with custom messaging
    - Share tournament details with the entire server
    - Optional custom message parameter
    - Optional tournament banner/image attachment
    - Shows tournament type, groups, entry count, and current status
    - Can be used at any phase (setup, group voting, knockout)
    - Perfect for generating hype and informing members when voting opens
  - **NEW: `/bracket list-groups`** - Simple text display of all groups and titles
    - Shows all groups with their titles in a clean, easy-to-read format
    - Displays voting status indicators (🗳️ for open voting, ✅ for closed)
    - Shows empty groups with clear indication
    - Group completion progress counter
    - Available to all members (not just admins/mods)
    - Perfect for quick overview of tournament lineup without generating images
    - Useful during setup to see which groups need more titles
- **AI Image Generation System**
  - **NEW: `/image` command** - Generate AI images from text prompts or Discord messages
    - Text-to-image: `/image prompt:"A dragon flying over a castle"`
    - From messages: `/image message:username` (finds recent message from user)
    - From message ID: `/image message:1234567890123456789`
    - Square format (1024x1024), standard quality
    - 10-30 second generation time
    - Cost: $0.04 per image
  - **NEW: Server-wide Feature Toggle**
    - Completely disable AI image generation per server
    - `/eggshen-config ai-images feature-toggle enabled:false` to disable
    - Separate from rate limiting (can disable feature OR just limit usage)
    - When disabled, all AI commands show clear error messages
  - **NEW: Permission Level Controls**
    - Control who can use AI image commands per server
    - `/eggshen-config ai-images set-permissions level:[everyone|moderators|admins]`
    - `everyone` (default) - All members can generate images
    - `moderators` - Only moderators and admins
    - `admins` - Only server administrators
    - Combined with rate limiting for fine-grained control
  - **Comprehensive Rate Limiting System**
    - Per-user cooldown: 5 minutes (configurable 60-3600 seconds)
    - Per-user daily limit: 10 images (configurable 1-100)
    - Per-server daily limit: 50 images (configurable 1-500)
    - Admin/moderator cooldown bypass (optional, respects daily limits)
    - Whitelisted users: Unlimited generation for contributors/premium users
    - Cost tracking and statistics
    - Prevents excessive API costs (default: $60/month max)
  - **Configuration Commands** (`/eggshen-config ai-images`)
    - `view` - See settings, server stats, and personal usage
    - `feature-toggle` - Enable/disable AI image generation entirely
    - `set-permissions` - Control who can use the commands
    - `toggle` - Enable/disable rate limiting
    - `user-cooldown` - Set cooldown between generations
    - `user-daily-limit` - Set max images per user per day
    - `guild-daily-limit` - Set max images per server per day
    - `admin-bypass` - Toggle admin cooldown bypass
    - `whitelist-add` - Grant unlimited access to specific users
    - `whitelist-remove` - Remove unlimited access
    - `whitelist-list` - View whitelisted users
    - `reset-user` - Reset user's usage
    - `reset-guild` - Reset server's usage
  - **Enhanced `/bracket image` Command**
    - **NEW: `prompt` parameter** - Add custom details to matchup images
    - **Smart Search Validation** - Validates titles through TMDB, RAWG, BGG, Google Books
    - **Disambiguation Menu** - Shows selection when multiple matches found (like `/movie`)
    - **Cross-Type Support** - Compare movies vs games, TV vs books, etc.
    - **Strict Left-Right Layout** - Title 1 always left, VS center, Title 2 always right
    - **Content Policy Compliance** - "Inspired by themes" prompts avoid replication
    - **Rich Metadata** - Uses overviews and descriptions for better prompts
    - **Rate Limited** - Same limits as `/image` command
    - Wide format (1792x1024) for split-screen compositions
  - **OpenAI Model Update** - Updated to `gpt-image-2` (latest image generation model)
  - **Usage Tracking** - Logs all generations with cost, user, guild, and metadata
  - **Cost Protection** - Prevents runaway costs ($60/month default max vs $2,400/month unlimited)
- **Tournament Bracket Visualizations**
  - `/bracket view` command generates March Madness-style bracket images
  - Shows full tournament tree with all rounds and matchups
  - Visual highlighting for winners (green backgrounds with checkmarks)
  - Displays VS indicators, connector lines, and round labels
  - Champion trophy display when tournament complete
  - Discord dark theme styling, PNG format
  - Uses @napi-rs/canvas for fast image generation
  - Only available during knockout phase
- **Tournament Bracket System (`/bracket` command)**
  - Host comprehensive tournaments with flexible sizing (16-48 entries)
  - **NEW: Smart search integration** - `/bracket add-group` searches TMDB/RAWG/BGG/Google Books
  - **NEW: Multi-type support** - Movies, TV shows, video games, board games, or books
  - **NEW: Rich metadata storage** - IDs, years, poster URLs, ratings stored per entry
  - **NEW: Type validation** - Prevents mixing different types in same tournament
  - Configurable group count: 4-12 groups (default 8), each with 4 entries
  - Group stage: Members vote for top 2 in each group
  - Dynamic wildcard system: Automatically calculates wildcards needed (0-8) to reach power-of-2 bracket
  - Knockout stage: Single elimination with dynamic round naming (Semifinals → Quarterfinals → Round of 16 → Round of 32)
  - 10 subcommands: create, add-group, open-groups, close-groups, vote-group, advance-knockout, status, view, image, cancel
  - Admin/moderator management controls, all members can vote
  - Random tiebreaker for fair vote resolution
  - Vote change support (users can change votes before close)
  - Complete tournament state persistence in JSON format
  - Configurable via `/eggshen-config commands toggle`
  - Perfect for community competitions like "The Shudder Discord Gore Cup"
- **Spotify Premium Detection and Graceful Fallback**
  - Detects when Spotify API requires Premium subscription (403 errors)
  - Automatically disables Spotify features when Premium detected
  - Bot continues working with iTunes-only for soundtrack searches
  - Clear warning logs explain why Spotify is unavailable
  - No errors exposed to users when Spotify unavailable
  - Graceful degradation ensures `/soundtrack` command always works
- **Spotify Integration for Soundtrack Search**
  - Added Spotify API support alongside iTunes for `/soundtrack` command
  - Displays results from both iTunes and Spotify when both are configured
  - Shows album artwork, artist, track count, and release dates from both services
  - Includes clickable links to both platforms for listening and purchasing
  - Falls back to iTunes-only if Spotify not configured (backwards compatible)
  - Free Spotify Developer API with unlimited requests
  - OAuth 2.0 Client Credentials flow for server-to-server authentication
- **Soundtrack Search (`/soundtrack` command)**
  - Search for movie and TV show soundtracks via iTunes Search API
  - TMDB title verification ensures correct soundtrack matching
  - Displays album artwork, artist/composer, track count, release date, genre, and price
  - Direct iTunes links for listening and purchasing
  - No API key required - uses free iTunes Search API
  - Follows same selection pattern as other search commands for consistency
- **Survey/Polling System (`/survey` command)**
  - Create interactive surveys with up to 10 options
  - Real-time vote tracking via reaction emojis (1️⃣-🔟)
  - Single or multiple vote modes
  - View live results with progress bars showing percentages
  - Comprehensive management: `/survey list`, `/survey results`, `/survey close`, `/survey delete`
  - Permission system: creator, administrators, and moderators can manage surveys
  - Persistent storage in JSON format per-guild
  - Configurable via `/eggshen-config commands toggle` (can be enabled/disabled per server)
  - Alternative to `/poll` and `/vote` commands that may be provided by other bots

### Fixed
- **CRITICAL: Knockout Bracket Generation Bug** (2026-06-29)
  - **Issue:** Tournaments with more than 4 groups had incomplete knockout brackets. For example, a 12-group tournament only created 4 first-round matchups instead of 12, leaving 8 qualified movies without matchups. Visualization showed sparse Round of 32/16 with mostly TBD placeholders.
  - **Root cause:** Code used `opponent.index` to track which runners-up had been matched. The `index` property represents position within each group (0=1st, 1=2nd, 2=3rd, 3=4th), NOT a unique identifier. Multiple runners-up across different groups share the same index value (e.g., all second-place finishers have index=1). After matching one opponent with index=2, ALL other runners-up with index=2 were incorrectly marked as "used", even though they were different movies from different groups.
  - **Example:** In a 12-group tournament, runners-up had indices Counter({0: 2, 1: 4, 2: 3, 3: 3}). After matching 4 winners (one per unique index value 0-3), the code thought all opponents were used, leaving 8 winners with no matchups.
  - **Fix:** Changed to use unique key `title + groupId` instead of `index` to track used opponents. Now properly creates matchups for ALL qualified movies.
  - **Impact:** Affects all tournaments with 5+ groups. Existing broken tournaments can be fixed with `/bracket regenerate`.
  - **Benefit:** Complete, properly populated knockout brackets with all qualified movies receiving first-round matchups.
- **Button Selection Cross-User Pollution Bug** (2026-06-28)
  - **Issue:** When User A voted, their button selections (green buttons) appeared as selected for ALL users (User B, C, D, etc.)
  - **Root cause:** Discord messages are shared, not per-user. When buttonHandler edited the message to highlight buttons (ButtonStyle.Success), those style changes applied globally to everyone viewing the message.
  - **Fix:** Removed button style updates from shared voting messages entirely. Buttons stay gray (ButtonStyle.Secondary) for everyone. Users see their selection feedback only in their private ephemeral dashboard.
  - **Benefit:** No more confusion about seeing other people's votes highlighted on your screen.
- **Bracket Visualization Layout Issues** (2026-06-28)
  - **Issue:** Round of 32 had overlapping titles, missing TBD rectangles, inconsistent spacing
  - **Root cause:** Used dynamic spacing based on canvas height instead of fixed MATCHUP_SPACING constant, causing overlaps with many matchups
  - **Fix:** Now uses fixed MATCHUP_SPACING (140px) for consistent positioning, proper canvas height calculation, all matchups positioned at precise intervals
  - **Benefit:** Clean, properly spaced brackets with no overlapping text and all TBD rectangles visible

## [1.0.0] - 2026-06-21

### Added
- **Production-ready release** 🎉
- **Timer duration parameter with auto-stop**
  - Optional `duration` parameter (1-600 minutes) for `/timer start`
  - Timer automatically stops and announces completion when duration expires
  - Prevents issue of users forgetting to stop timers after content ends
  - Duration persists across bot restarts with restored auto-stop timeouts
  - Shows remaining time in `/timer status` when duration is set
- **Runtime auto-detection from TMDB**
  - When timer auto-detects label from Discord event, searches TMDB for runtime
  - Automatically adds 10-minute buffer to cover setup time and credits
  - Shows selection menu when multiple TMDB matches found (movies and TV shows)
  - Users select correct title before timer starts
  - Includes "Skip" option to start without duration
  - Improves UX by preventing incorrect runtime detection
- **Conditional command registration based on API availability**
  - `/game` and `/boardgame` commands won't appear in Discord if API keys aren't configured
  - Prevents users from seeing unavailable commands
  - Cleaner UX - only shows what's actually available
- **Comprehensive API Keys Guide**
  - New documentation page with step-by-step instructions for all APIs
  - Includes Discord Bot, TMDB, OMDB, Trakt, RAWG, and BoardGameGeek
  - Registration time estimates, rate limits, and troubleshooting
  - Security best practices for API key management
- **BoardGameGeek API integration completed**
  - `/boardgame` command now fully functional with BGG_CLIENT_ID
  - `/random boardgame` supports category and rating filters
  - `/similar` includes board game recommendations
  - Requires BGG_CLIENT_ID environment variable
- **API key validation for all commands**
  - Commands gracefully fail with helpful error messages if required API keys are missing
  - `/game` requires RAWG_API_KEY
  - `/boardgame` requires BGG_CLIENT_ID
  - `/random` validates keys for game/boardgame subcommands
  - `/similar` skips unavailable media types when API keys are missing
- **Timer countdown theme option**
  - Modern theme (default) - Colorful animated countdown with visual blocks
  - Classic theme - Sequential text countdown matching original bot behavior
  - Usage: `/timer start theme:classic` or `/timer start theme:modern`
  - Helps users transition from old bot with familiar countdown style
- **Professional documentation site**
  - Hosted at https://eggshenbot.com
  - Custom domain with HTTPS
  - WCAG 2.1 AA accessibility compliance
  - Custom cyan theme (#2AB5E5) with proper contrast ratios
  - Favicon and Apple touch icons
  - Complete command reference
  - Installation and configuration guides

### Changed
- **License changed from MIT to CC BY-NC-SA 4.0**
  - Requires attribution for all uses
  - Prohibits commercial use
  - Requires derivative works to use the same license
  - See LICENSE file for full details
- Documentation updated to accurately reflect actual command implementations
  - Fixed `/timer start` parameters (no duration/description - uses label and theme)
  - Corrected `/watched` commands syntax
  - Updated `/eggshen-config` documentation to match real subcommand structure
  - Removed fictional moderation commands that don't exist
  - Fixed all search command examples to use correct parameter syntax
- Documentation home page features updated
  - Replaced "Smart Notifications" with "Smart Auto-Detection" feature
  - Updated logo to transparent version with reduced file size

### Fixed
- **Critical interaction handling bugs** preventing production crashes
  - Added defensive checks before all interaction.reply and deferReply calls
  - Wrapped error handler in try-catch to prevent cascading failures
  - Fixed timer command timeout issues (3-second interaction expiry)
  - Applied fixes to movie, tv, game, boardgame commands and select handlers
- Ghost timer persistence issue resolved

## [Unreleased]

### Added
- **AI-Enhanced Semantic Search with OpenAI** (2026-06-22)
  - Optional OpenAI integration for smarter search result ranking
  - Hybrid approach: keyword search first, then AI re-ranking for relevance
  - Uses cost-effective `text-embedding-3-small` model (~$0.02/1000 searches)
  - Calculates cosine similarity between query and result embeddings
  - Re-ranks top 20 results by semantic score for better accuracy
  - Progressive enhancement: falls back to keyword-only if API key missing
  - Better handles partial titles, descriptions, thematic queries
  - Example: "that movie about dreams within dreams" → Inception
  - Updated `/movie` and `/tv` commands to use hybrid search
  - Documentation includes setup guide and cost estimates
- **Enhanced Streaming Availability with Watchmode API** (2026-06-22)
  - Optional Watchmode API integration for comprehensive streaming data
  - Unified watch provider system merges TMDB + Watchmode sources
  - Better coverage of free services (Tubi, Pluto TV, Freevee, Plex, etc.)
  - 150+ streaming services tracked with up-to-date availability
  - Progressive enhancement: falls back to TMDB-only if API key missing
  - Shows stream/rent/buy options for movies and TV shows
  - Region-configurable per server (defaults to US)
  - Free tier: 1,000 requests/month (sufficient for small-medium servers)
  - Applied to `/movie`, `/tv`, `/random`, and `/similar` commands
  - New `watchmodeService.js` with search and provider lookup functions
  - Documentation includes setup guide and usage limits
- **Fun & Social Potion System** (2026-06-22)
  - New `/potion give` command for playful user interactions
  - 13 potion types: 8 helpful, 5 harmful for chat dynamics
  - 78+ unique responses with horror, comedy, fantasy references
  - Helpful potions: Health, Mana, Strength, Speed, Invisibility, Luck, Love, Energy
  - Harmful potions: Confusion, Poison, Weakness, Curse, Slow
  - Pop culture references: LOTR, Harry Potter, Dark Souls, Get Out, The Ring, etc.
  - Admin-configurable custom responses per guild
  - Subcommands: `/potion responses add/remove/list/reset` (admin/mod only)
  - Custom responses stored per-guild, merged with defaults
  - Validates {giver} and {receiver} placeholders in custom responses
  - Permission checking ensures only admins/mods manage responses

### Fixed
- **Watchmode streaming providers not displaying** (2026-06-23)
  - `/movie` and `/tv` commands weren't calling unified watch provider functions
  - Created `getUnifiedMovieWatchProviders()` and `getUnifiedTVWatchProviders()` but forgot to invoke them
  - Now properly calls unified functions and passes `watchProviders` to `createDetailedEmbed()`
  - Tubi and other Watchmode-exclusive services now appear in search results
  - `/random` already had correct implementation
  - `/similar` doesn't need it (shows list-only results, not detailed embeds)

### Planned
- Statistics export functionality
- Web dashboard for statistics and configuration
- Unit and integration test suite

---

## Pre-1.0 Development Releases

## [0.4.0] - 2026-06-21

### Added
- Complete VitePress documentation site with GitHub Pages deployment
- Custom cyan theme (#2AB5E5) with tinted grays for brand consistency
- Comprehensive documentation covering all features and commands
- Bot logo integration in documentation navbar
- Documentation sections:
  - Getting Started guide
  - Complete installation instructions
  - Configuration guide
  - Search commands reference
  - Watch party commands reference
  - Admin configuration reference
  - Moderation commands reference
  - Rate limiting system documentation
  - Moderation tools guide
  - Watch history feature documentation
  - Statistics feature documentation
  - Notifications feature documentation (planned)
  - API reference for developers
  - Changelog (this file)

### Changed
- README now includes documentation badge and link
- README simplified with documentation site as primary reference

## [0.3.0] - 2026-06-19

### Changed
- **[BREAKING]** Watch history saves are now PUBLIC instead of ephemeral
  - Removed ephemeral flag from watch history modal submissions
  - Watch history entries now appear publicly in the channel
  - Changed display text from "Added by" to "Saved by" for clarity
- **[BREAKING]** Watch history now tracks server-level viewing, not personal ratings
  - Removed rating field from watch history modal
  - Removed rating from all watch history displays
  - Removed rating parameter from `/watched add` command
  - Watch history is now a community feature, not personal tracking

### Added
- Channel tracking for watch history entries
  - `channelId` field stores where content was watched
  - `channelName` field displays human-readable channel name
  - Watch history displays now show channel links
  - Useful for tracking which channels host watch parties

### Fixed
- Watch history save button permission system updated
  - Button now uses timer starter's userId instead of button clicker
  - Permission check allows timer starter OR moderators/admins
  - Only users with proper permissions see "Log to Watch History" button functionality
  - Prevents unauthorized users from logging watch history

## [0.2.0] - 2026-06-15

### Added
- Comprehensive rate limiting system (7 layers):
  - Per-user cooldowns (3 seconds between commands)
  - Guild-wide rate limits
  - Pattern detection for abuse
  - Abuse logging with mod channel integration
  - Auto-ban threshold (temporary bans after violations)
  - Manual cooldown controls for moderators
  - Whitelist mode for emergency situations
- Moderation commands:
  - `/cooldown add` - Apply manual cooldowns to users
  - `/cooldown remove` - Remove cooldowns early
  - `/cooldown list` - View active cooldowns
  - `/cooldown status` - Check specific user's cooldown status
  - `/ban-status` - Check user's auto-ban status
  - `/ban-remove` - Remove auto-bans
  - `/ban-history` - View ban/violation history
  - `/abuse-log` - View recent abuse incidents
  - `/abuse-patterns` - Analyze user behavior patterns
  - `/whitelist-mode` - Enable/disable emergency mode
  - `/whitelist add/remove/list` - Manage whitelisted users
- Abuse logging system:
  - Configurable per-server
  - Logs to dedicated mod logs channel
  - Tracks violations, auto-bans, and manual actions
  - Pattern detection algorithms
- Guild configuration system:
  - Per-server settings storage
  - Persistent configuration across bot restarts
  - Admin-only configuration access
- Statistics tracking:
  - Command usage statistics
  - User activity tracking
  - Watch party statistics
  - Content popularity metrics
  - Rate limit effectiveness metrics

### Changed
- `/eggshen-config` command expanded with new settings:
  - `rate-limiting` - Enable/disable rate limiting
  - `abuse-logging` - Enable/disable abuse logging
  - `mod-logs-channel` - Set dedicated moderation logs channel
- Permission system clarified:
  - Watch history saves require timer starter OR admin/mod permissions
  - Configuration requires Administrator or Manage Server permissions
  - Moderation commands require Moderate Members or Administrator permissions

## [0.1.0] - 2026-06-01

### Added
- Initial release of Egg Shen Bot
- Core search commands:
  - `/movie <title>` - Search for movies
  - `/tv <title>` - Search for TV shows
  - `/episode <show> <season> <episode>` - Search for specific episodes
  - `/episode-list <show> <season>` - List all episodes in a season
  - `/game <title>` - Search for video games
- Watch party timer system:
  - `/timer start` - Start countdown timer
    - Optional `label` parameter for what you're watching
    - Optional `duration` parameter (1-600 minutes) for auto-stop
    - Optional `theme` parameter (`modern` or `classic`)
  - `/timer stop` - Stop active timer
  - `/timer status` - Check timer status
  - Interactive "Log to Watch History" button on completion
- Watch history tracking:
  - `/watched add` - Add to watch history manually (searches movies and TV)
    - `title` parameter (required)
    - `notes` parameter (optional)
  - `/watched history` - View server watch history with filters
  - Integration with timer system for automatic logging
- Utility commands:
  - `/random <type>` - Get random movie/TV show suggestion
  - `/similar <type> <title>` - Find similar content
  - `/stats [type]` - View bot statistics
  - `/help [command]` - Get help with commands
- Admin commands:
  - `/eggshen-config <setting> <value>` - Configure bot for server
  - `/eggshen-config view` - View current configuration
  - `/eggshen-config reset` - Reset to defaults
- External API integrations:
  - TMDB (The Movie Database) - Required, primary data source
  - OMDB (Open Movie Database) - Optional, additional ratings
  - Trakt.tv - Optional, watch tracking integration
  - RAWG - Optional, game database
- Rich embeds with:
  - Movie/TV show information
  - Ratings from multiple sources (IMDB, Rotten Tomatoes, Metacritic)
  - Cast and crew information
  - Streaming availability via JustWatch
  - Genre, runtime, release dates
  - Poster images and thumbnails
- Discord.js v14 features:
  - Slash commands
  - Button interactions
  - Select menus
  - Modal forms
  - Ephemeral messages (later changed for watch history)
- Environment variable configuration
- Error handling and logging
- ES module architecture

### Technical Details
- Built with Node.js 20+
- Discord.js v14.14.1
- ES modules (ESM) architecture
- In-memory data storage with optional persistence
- RESTful API integration with external services

---

## Versioning Guide

### Version Number Format: MAJOR.MINOR.PATCH

- **MAJOR** - Incompatible API changes, breaking changes
- **MINOR** - New features, backwards-compatible functionality additions
- **PATCH** - Backwards-compatible bug fixes

### Change Categories

- **Added** - New features
- **Changed** - Changes to existing functionality
- **Deprecated** - Soon-to-be-removed features
- **Removed** - Removed features
- **Fixed** - Bug fixes
- **Security** - Security vulnerability fixes

---

## How to Update This Changelog

**For AI Assistant / Contributors:**

When making changes to functionality, **always** update this changelog following these guidelines:

### 1. Determine Change Type

- **Added** - Created new feature, command, or capability
- **Changed** - Modified existing behavior, updated functionality
- **Fixed** - Corrected bugs or errors
- **Removed** - Deleted features or commands
- **Security** - Fixed security issues

### 2. Write Clear Descriptions

**Good:**
```markdown
### Changed
- **[BREAKING]** Watch history saves are now PUBLIC instead of ephemeral
  - Removed ephemeral flag from modal submissions
  - Entries now visible to all server members
  - Changed "Added by" to "Saved by" for clarity
```

**Bad:**
```markdown
### Changed
- Changed watch history
- Updated some things
```

### 3. Mark Breaking Changes

Use `**[BREAKING]**` prefix for changes that require user action or change expected behavior:

```markdown
### Changed
- **[BREAKING]** Rating field removed from watch history
```

### 4. Group Related Changes

Group related changes under the same category:

```markdown
### Added
- Watch history channel tracking
  - Added channelId field
  - Added channelName field
  - Updated displays to show channel links
```

### 5. Update Version Number

Follow semantic versioning:
- Breaking changes → Increment MAJOR (1.0.0 → 2.0.0)
- New features → Increment MINOR (1.0.0 → 1.1.0)
- Bug fixes → Increment PATCH (1.0.0 → 1.0.1)

### 6. Add Date

Use format: `YYYY-MM-DD`

```markdown
## [1.3.0] - 2026-06-21
```

### 7. Update Unreleased Section

Move items from Unreleased to the new version section when releasing.

---

## Link References

[Unreleased]: https://github.com/r3volution11/Egg-Shen-Bot/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/r3volution11/Egg-Shen-Bot/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/r3volution11/Egg-Shen-Bot/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/r3volution11/Egg-Shen-Bot/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/r3volution11/Egg-Shen-Bot/releases/tag/v1.0.0

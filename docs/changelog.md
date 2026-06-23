# Changelog

All notable changes to Egg Shen Bot will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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

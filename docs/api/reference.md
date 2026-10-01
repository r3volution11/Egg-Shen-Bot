---
description: "Technical reference for developers extending Egg Shen Bot: its Node.js and discord.js v14 architecture, modules, services and data files."
---

# API Reference

Technical reference for developers working with or extending Egg Shen Bot.

## Overview

Egg Shen Bot is built with Node.js and discord.js v14. The codebase is ES modules throughout (`"type": "module"`), so always use `import`, never `require`.

## Architecture

### Core Components

```text
src/
├── index.js           # Entry point: loads commands, routes every interaction, handles modal submits
├── deploy-commands.js # Registers slash command definitions with Discord
├── config.js          # Reads environment variables
├── api/               # Express server (event request form, admin pages, /api/health)
├── commands/          # One file per slash command, auto-discovered
│   ├── timer.js
│   ├── watched.js
│   ├── movie.js
│   └── ...
├── handlers/
│   ├── buttonHandler.js   # All button clicks
│   └── selectHandler.js   # All select menus
├── services/          # External APIs: tmdb, omdb, trakt, rawg, bgg, googleBooks,
│                      # watchmode, spotify, itunes, letterboxd, ai (OpenAI)
└── utils/
    ├── guildConfig.js          # Per-server configuration
    ├── rateLimiter.js          # Rate limiting and moderation checks
    ├── timerManager.js         # Watch party timers
    ├── watchHistoryManager.js  # Watch history
    ├── statsTracker.js         # Search/usage statistics
    ├── pendingSelections.js    # Short nonces for component payloads
    ├── interactionResponse.js  # deliverResult() for public/private replies
    └── ...
```

### Technology Stack

- **Runtime:** Node.js 20+
- **Discord library:** discord.js v14
- **APIs:** TMDB (required); OMDB, Trakt, RAWG, BoardGameGeek, Google Books, Watchmode, Spotify and OpenAI are optional
- **Storage:** JSON files on disk — `guild_configs/`, `guild_stats/`, `guild_watch_history/`, `guild_watchlists/`, `guild_tournaments/`, `active_timers.json`. There is no database.
- **Tests:** Jest, run with `--experimental-vm-modules`

## Core Utilities

### Guild Configuration

Per-server settings, stored at `guild_configs/<guildId>.json`.

```javascript
import {
  loadGuildConfig,
  saveGuildConfig,
  getAutoDetectMode,
  getEpisodeBufferMinutes,
} from './utils/guildConfig.js';

// Load (returns a deep copy of the defaults if the server has never saved one)
const config = await loadGuildConfig(guildId);

// Read through the normalizing getters, not the raw field
const mode = getAutoDetectMode(config);          // 'ask' | 'full' | 'off'
const buffer = getEpisodeBufferMinutes(config);  // 0-30, default 5

// Change a setting: load, mutate, save the whole object
config.watchlist ??= {};
config.watchlist.maxSize = 200;
await saveGuildConfig(guildId, config);
```

**There are no migrations.** A config saved before a key was added simply lacks it, and nested objects can be missing too. Read through a getter where one exists, and otherwise use optional chaining with the default (`config.watchlist?.autoRemoveWatched !== false`).

| Getter | Returns |
|---|---|
| `getAutoDetectMode(config)` | `'ask'` (default), `'full'` or `'off'` |
| `getEpisodeBufferMinutes(config)` | Number 0-30, default 5 |
| `getAiTextEnabled(config)` | `true` unless `aiText.enabled` is explicitly `false` |
| `getAiAskEnabled(config)` | `true` unless `aiAsk.enabled` is explicitly `false` |
| `getPublicBotUrl(config)` | `website.botUrl`, else `PUBLIC_BOT_URL`, else `null` |

Other exports: `isAdmin(member)`, `isTrueAdmin(member)`, `isModerator(member)`, `canUseCommand(guildId, member, commandName)`, `getEnabledServices(guildId)`, `toggleService()`, `getEmojis(guildId)`, `setEmoji()`, `getStatsConfig(guildId)`, `updateStatsTracking()`, `getCommandPermissions(guildId)`, `updateCommandPermission()`.

**Configuration shape** (main keys; see `defaultConfig` at the top of `src/utils/guildConfig.js` for every default):

```typescript
interface GuildConfig {
  services: {                 // Which rating/link services appear in embeds
    imdb, letterboxd, trakt, rottenTomatoes, metacritic, justWatch: boolean;
  };
  emojis: Record<string, string>;   // Custom emoji ID per service ('' = default)
  region: string;                   // Streaming region, ISO 3166-1 (default 'US')
  maxSearchResults: number;         // Picker size, 1-50 (default 20)

  // Timers
  maxTimerDurationMinutes: number;  // Fallback auto-stop for timers with no real duration (360)
  maxTimerDurationUnlimited: boolean;
  timerCeilingEnabled: boolean;     // Opt-in hard ceiling on explicit/detected durations
  timerCeilingMinutes: number | null;
  allowAnyonePauseStopTimer: boolean;
  watchPartyChannels: string[];     // Channels where /timer start reads scheduled events
  watchPartyAutoDetectMode: 'ask' | 'full' | 'off';  // Read via getAutoDetectMode()
  episodeBufferMinutes: number;     // Read via getEpisodeBufferMinutes()

  stats: {
    enabled: boolean;               // Master switch
    trackMovies, trackShows, trackEpisodes, trackGames, trackBoardGames, trackBooks: boolean;
  };
  commandPermissions: {
    enabled: boolean;               // false = only admin commands work
    [command: string]: boolean;     // movie, tv, episode, game, bracket, watchlist, ...
  };
  notifications: { restartAnnouncements: boolean };
  watchlist: {
    maxSize: number; modOnlyAdd: boolean;
    autoAddChampion: boolean; autoRemoveWatched: boolean;
  };
  administrators: string[];

  rateLimits: {
    enabled: boolean;
    bypassForModerators: boolean;
    global: { maxRequests: number; windowSeconds: number };        // Per user (1 per 20s)
    commands: Record<string, { maxRequests: number; windowSeconds: number }>;
    guildWide: { enabled: boolean; maxRequests: number; windowSeconds: number };
    patternDetection: { enabled: boolean; windowSeconds: number; minUsers: number };
    aiImages: {                     // Image generation limits
      enabled: boolean; perUserCooldown: number; perUserDailyLimit: number;
      perGuildDailyLimit: number; adminsBypassCooldown: boolean;
      costPerImage: number; whitelistedUsers: string[];
    };
  };
  moderation: {
    enabled: boolean;
    whitelist: { enabled: boolean; allowedRoles: string[]; allowedUsers: string[] };
    autoBan: { enabled: boolean; violationCount: number; windowHours: number };  // Notifies, doesn't ban
  };

  aiText: { enabled: boolean };     // AI announcement text — read via getAiTextEnabled()
  aiAsk?: { enabled: boolean };     // /eggshen-ask AI answers — read via getAiAskEnabled()
  aiImages?: {                      // Written by /eggshen-config-ai; absent until first set
    enabled: boolean; permissions: string;
  };

  eventRequests: {
    enabled: boolean; moderationChannel: string | null;
    serverName: string | null; inviteUrl: string | null;
    allowUserChannelSelection: boolean; allowVoiceRequests: boolean;
    allowedTextChannels: string[]; allowedVoiceChannels: string[];
    announceDecisions: boolean;
    announcementChannel: string | null; // null = off, 'event' = the event's own channel, else a channel ID
  };
  quoteSuggestions: { moderationChannel: string | null; maxPendingPerUser: number };
  potionResponses: Record<string, string[]>;
  potionThemes: string[] | null;    // null = all themes
  website: {
    url: string | null;             // This server's web presence (event request form)
    theme: string;                  // Key in scripts/web-themes.json
    botUrl?: string;                // Read via getPublicBotUrl()
  };
}
```

### Rate Limiter

Every slash command passes through `checkRateLimit` in `src/index.js` before its `execute` runs, so a command file doesn't need to call it.

```javascript
import { checkRateLimit } from './utils/rateLimiter.js';

const result = await checkRateLimit(guildId, userId, commandName, member, commandArgs);
// => { limited: false }
// => { limited: true, message, retryAfter?, guildWide? }

if (result.limited) {
  await interaction.reply({ content: result.message, flags: MessageFlags.Ephemeral });
}
```

The checks, in order, all driven by `rateLimits` and `moderation` in the guild config:

1. Master switch (`rateLimits.enabled`) and moderator bypass (`rateLimits.bypassForModerators`)
2. Whitelist mode (`moderation.whitelist`) — only listed roles/users
3. Manual cooldowns applied by a moderator (`applyUserCooldown`)
4. Guild-wide limit across all users (`rateLimits.guildWide`, default 10 per 60s)
5. Per-user, per-command limit (`rateLimits.commands[name]`, else `rateLimits.global`, default 1 per 20s)

Pattern detection (`rateLimits.patternDetection`) runs on commands that were allowed; it records coordinated activity for `getSuspiciousActivity` rather than blocking anything. Limit violations go to the abuse log, and with `moderation.autoBan` enabled, users with `violationCount` (default 20) violations in `windowHours` (24) are flagged via `getUsersExceedingThreshold` for moderators to review — nobody is banned automatically.

Other exports: `getAbuseLog`, `clearAbuseLog`, `getSuspiciousActivity`, `clearSuspiciousActivity`, `applyUserCooldown`, `removeUserCooldown`, `getActiveCooldowns`, `clearRateLimitForUser`, `clearRateLimitsForGuild`, `getUsersExceedingThreshold`.

### Timer Manager

One timer per channel, kept in memory and persisted to `active_timers.json` so timers survive a restart. These functions are synchronous.

```javascript
import { startTimer, stopTimer, getTimerStatus, pauseTimer, resumeTimer } from './utils/timerManager.js';

// startTimer(channelId, userId, username, label, durationMinutes, client, isFallbackDuration, media)
const started = startTimer(channelId, user.id, user.username, 'The Matrix', 136, client, false,
  { tmdbId: 603, type: 'movie' });
// => false if this channel already has a timer

const status = getTimerStatus(channelId);  // Timer + elapsedMs, elapsedFormatted, remainingMs, ... or null
pauseTimer(channelId);
resumeTimer(channelId, client);
const final = stopTimer(channelId);        // Timer + elapsedMs/elapsedFormatted, or null
```

Permission checks are separate helpers: `canControlTimerPauseStop(timer, userId, member, guildConfig)` and `canSetTimerTitle(timer, userId, member)`. Also exported: `adjustTimerDuration`, `disableTimerAutostop`, `setTimerTitle`, `clampTimerDuration`, `getAllTimers`, `formatDurationHuman`.

**Stored timer shape:**

```typescript
interface Timer {
  startTime: number;           // Epoch ms
  userId: string;              // Who started it
  username: string;
  label: string;               // Title, '' if none
  duration?: number;           // Minutes; absent for an open-ended timer
  endTime?: number;            // Epoch ms
  isFallbackDuration?: boolean;// true when duration came from maxTimerDurationMinutes
  tmdbId?: number;             // Only when the title was identified
  type?: 'movie' | 'tv';
  episodeRange?: object;       // Multi-episode watch parties
  paused?: boolean;
  pausedAt?: number;
  pausedMs?: number;           // Total time spent paused — excluded from elapsed time
  remainingMsAtPause?: number | null;
}
```

Older saved timers may lack the optional fields, so readers must tolerate `undefined`.

### Watch History Manager

Server watch history, stored newest-first at `guild_watch_history/<guildId>_history.json`.

```javascript
import { saveWatchHistory, getWatchHistory, clearWatchHistory } from './utils/watchHistoryManager.js';

await saveWatchHistory(guildId, {
  tmdbId: 603,
  type: 'movie',
  title: 'The Matrix',
  year: '1999',
  notes: null,
  savedBy: interaction.user.username,
  savedById: interaction.user.id,
  watchedAt: Date.now(),
  channelId: interaction.channelId,
  channelName: interaction.channel?.name,
});

// getWatchHistory(guildId, filter = 'all' | 'movie' | 'tv', limit = 10)
const recent = await getWatchHistory(guildId, 'movie', 10);
```

Saving also removes the title from the server watchlist unless `watchlist.autoRemoveWatched` is `false`.

**Entry shape:** the entry is stored as given — there is no generated ID.

```typescript
interface WatchHistoryEntry {
  tmdbId: number;
  type: 'movie' | 'tv';
  title: string;
  year: string;
  notes: string | null;
  savedBy: string;             // 'Egg Shen Bot' for an auto-completed timer
  savedById: string;
  watchedAt: number;           // Epoch ms
  channelId?: string;          // Absent for entries logged with /watched add
  channelName?: string;
}
```

### Statistics Tracker

Records searches and a few command uses per server, in `guild_stats/<guildId>_stats.json`.

```javascript
import { trackSearch, getStats } from './utils/statsTracker.js';

// trackSearch(guildId, userId, username, type, title, year)
await trackSearch(guildId, user.id, user.username, 'movie', 'The Matrix', '1999');

// filter: 'all-time' | 'today' | 'week' | 'month'
const stats = await getStats(guildId, 'week');
```

`trackSearch` checks the server's `stats` switches itself, so callers don't need to. `type` is the command's kind — `'movie'`, `'tv'`, `'episode'`, `'random'`, `'watched'`, `'similar'`, `'game'`, `'boardgame'`, `'book'`, and so on. Only movie/tv/episode feed the top lists, and only random/watched/similar feed `commandCounts`.

**Returned by `getStats`:**

```typescript
interface Stats {
  totalSearches: number;
  topMovies: Array<{ name: string; count: number }>;   // name is "Title (Year)"
  topShows: Array<{ name: string; count: number }>;
  topEpisodes: Array<{ name: string; count: number }>;
  commandCounts: { random: number; watched: number; similar: number };
  topUsers: Array<UserStats & { userId: string }>;
  userStats: Record<string, UserStats>;
}

interface UserStats {
  username: string;
  totalSearches: number;
  movies: number; shows: number; episodes: number;
  random: number; watched: number; similar: number;
}
```

## External Services

### TMDB Service

```javascript
import { searchMovies, searchTVShows, getMovieDetails, getTVShowDetails } from './services/tmdbService.js';

const results = await searchMovies('The Matrix');
const movie = await getMovieDetails(603);
```

Main exports:

- `searchMovies(query)`, `searchTVShows(query)`, `searchPeople(query)`
- `getMovieDetails(id)`, `getTVShowDetails(id)`, `getSeasonDetails(tvId, season)`, `getEpisodeDetails(tvId, season, episode)`, `searchEpisodeByName(tvId, name)`
- `getSimilarMovies(id)`, `getSimilarTV(id)`, `discoverRandomMovie(filters)`, `discoverRandomTV(filters)`, `discoverTitles(type, filters)`
- `getUnifiedMovieWatchProviders(id, imdbId, region)`, `getUnifiedTVWatchProviders(id, imdbId, region)`
- `getGenres(type)` — movie and TV genre lists differ (TV has no Horror or Romance), so never hardcode genre IDs
- `getPosterUrl(path, size)`, `getBackdropUrl(path, size)`

TMDB searches match literally and ignore unknown query parameters, so a mistyped filter silently does nothing.

### OMDB Service

```javascript
import { getOMDBData, extractOMDBRatings } from './services/omdbService.js';

const data = await getOMDBData('tt0133093');  // IMDb ID
const ratings = extractOMDBRatings(data);
// => { imdb, rottenTomatoes: { critics, audience }, ... }
```

### Trakt Service

Optional; needs `TRAKT_CLIENT_ID`.

```javascript
import { getMovieRating, getShowRating, getEpisodeRating } from './services/traktService.js';

const rating = await getMovieRating('tt0133093');  // IMDb ID
```

Also `searchMoviesOnTrakt(query)` and `searchShowsOnTrakt(query)`.

### RAWG Service

Optional; `/game` is not loaded without `RAWG_API_KEY`.

```javascript
import { searchGames, getGameDetails } from './services/rawgService.js';

const results = await searchGames('The Legend of Zelda');
const game = await getGameDetails(results[0].id);
```

Also `discoverRandomGame(filters)` and `getSimilarGames(id)`.

## Command Structure

### Basic Command Template

Commands are auto-discovered: any file in `src/commands/` that exports `data` and `execute` is loaded. Add it to `src/commands/help.js` by hand, and run `node src/deploy-commands.js` whenever a command's definition (name, options, choices, descriptions) changes.

Rate limiting and command logging already happen in `src/index.js` before `execute` is called.

```javascript
import { SlashCommandBuilder } from 'discord.js';
import { canUseCommand } from '../utils/guildConfig.js';
import { deliverResult } from '../utils/interactionResponse.js';

export const data = new SlashCommandBuilder()
  .setName('commandname')
  .setDescription('Command description')
  .addStringOption(option =>
    option.setName('query')
      .setDescription('What to look up')
      .setRequired(true)
  )
  .addBooleanOption(option =>
    option.setName('private')
      .setDescription('Only show the result to you (default: false)')
      .setRequired(false)
  );

export async function execute(interaction) {
  // Respect /eggshen-config commands toggle (only if the command has a key there)
  if (!await canUseCommand(interaction.guildId, interaction.member, 'commandname')) {
    return interaction.reply({ content: '❌ This command is disabled here.', ephemeral: true });
  }

  const query = interaction.options.getString('query');
  const isPrivate = interaction.options.getBoolean('private') ?? false;

  // Defer privately, then deliverResult() either keeps the answer private or
  // replaces it with a public message in the channel
  await interaction.deferReply({ ephemeral: true });

  const embed = await buildSomething(query);
  await deliverResult(interaction, { embeds: [embed] }, isPrivate);
}
```

Errors thrown from `execute` are caught and logged by `src/index.js`, which replies with a generic error message.

### Button Handler Template

All buttons are routed by customId prefix in `handleButtonInteraction` in `src/handlers/buttonHandler.js`. Parameters ride along in the customId, separated by `_`.

```javascript
// Building the button (in a command)
new ButtonBuilder()
  .setCustomId(`my_action_${channelId}_${interaction.user.id}`)
  .setLabel('Do it')
  .setStyle(ButtonStyle.Primary);

// In handleButtonInteraction, alongside the other prefixes
if (interaction.customId.startsWith('my_action_')) {
  await handleMyAction(interaction);
  logger.logButton(interaction.customId, interaction.user, interaction.guild, true);
  return;
}

async function handleMyAction(interaction) {
  const [, , channelId, ownerId] = interaction.customId.split('_');

  // Anyone who can see a public message can click its buttons. The command's
  // own permission check does NOT protect them — gate the handler.
  if (interaction.user.id !== ownerId && !isAdmin(interaction.member)) {
    return interaction.reply({ content: '❌ This button isn\'t for you.', flags: MessageFlags.Ephemeral });
  }

  // ...
}
```

- Custom IDs are capped at 100 characters. **Never put a variable-length payload (a title, a list) in one.** Store it with `stashSelection(value)` from `src/utils/pendingSelections.js` and put the returned nonce in the customId; read it back with `readSelection(nonce)`.
- Because handlers split on `_`, IDs embedded in a customId must not contain underscores (nonces from `stashSelection` don't).
- For admin-only buttons, follow `ensureTournamentManager` in `buttonHandler.js`.

Select menus work the same way in `src/handlers/selectHandler.js`, but a new customId must also be added to the `handledIds` list (or prefix checks) at the top of `handleSelectInteraction`; anything else is silently ignored.

### Modal Handler Template

Modal submits are handled in the `interaction.isModalSubmit()` branch of `src/index.js`, also routed by customId prefix.

```javascript
// Showing the modal (from a button handler)
const modal = new ModalBuilder()
  .setCustomId(`my_modal_${interaction.user.id}`)
  .setTitle('Tell me more')
  .addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId('notes').setLabel('Notes').setStyle(TextInputStyle.Paragraph)
  ));
await interaction.showModal(modal);

// In src/index.js, inside the isModalSubmit() branch
} else if (interaction.customId.startsWith('my_modal_')) {
  const userId = interaction.customId.replace('my_modal_', '');
  if (interaction.user.id !== userId) {
    return interaction.reply({ content: '❌ Only the person who opened this form can submit it.', flags: MessageFlags.Ephemeral });
  }

  const notes = interaction.fields.getTextInputValue('notes');
  // ...
  await interaction.reply({ content: 'Saved!', flags: MessageFlags.Ephemeral });
}
```

## Embed Formatting

Movie, TV, episode, game, board game and book embeds are built in `src/utils/embedBuilder.js` (`createDetailedEmbed`, `createEpisodeEmbed`, `createSearchResults`, …). Reuse these rather than building a new embed, so service toggles, custom emojis and streaming providers stay consistent.

```javascript
import { createDetailedEmbed } from '../utils/embedBuilder.js';
import { getEnabledServices, getEmojis } from '../utils/guildConfig.js';

const result = await createDetailedEmbed(
  movie, 'movie',
  await getEnabledServices(guildId),
  await getEmojis(guildId),
  watchProviders
);
```

Discord limits to keep in mind: 1024 characters per field value, 6000 per embed, 25 options per select menu, 100 characters per select option value or customId. Mentions inside an embed never ping — only message `content` does.

## Environment Variables

See `.env.example` for the full list.

```bash
# Required
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id
TMDB_API_KEY=your_tmdb_api_key

# Optional services — commands that need a missing key are skipped at startup
OMDB_API_KEY=
TRAKT_CLIENT_ID=
RAWG_API_KEY=
BGG_CLIENT_ID=
GOOGLE_BOOKS_API_KEY=
WATCHMODE_API_KEY=
OPENAI_API_KEY=          # Semantic search, AI text and images, /eggshen-ask answers
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=

# Web server (event request form, admin pages)
API_PORT=3000
PUBLIC_BOT_URL=http://localhost:3000
DISCORD_CLIENT_SECRET=
OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/discord/callback
```

## Error Handling

`src/index.js` wraps every command's `execute`: a thrown error is logged with `logger.logCommand(...)` and the user gets an ephemeral "There was an error executing this command!" (as a follow-up if the command had already replied or deferred). Handle errors in a command only when you can say something more useful:

```javascript
import * as logger from '../utils/logger.js';

try {
  details = await getMovieDetails(id);
} catch (error) {
  logger.error(logger.LogCategory.COMMAND, 'TMDB lookup failed', { id, error: error.message });
  return interaction.editReply({ content: 'TMDB is not responding right now. Try again in a minute.' });
}
```

Logs are written to `logs/`, one file per category per day.

## Testing

Tests use Jest in `tests/`.

```bash
npm test                      # Full suite
npm test -- tests/foo.test.js # One file
npm run check:commands        # Command definitions fit Discord's size limit
```

Both `npm test` and `npm run check:commands` must pass before a change ships. `tests/jest.setup.js` points the data-file environment variables (`GUILD_STATS_DIR`, `GUILD_WATCH_HISTORY_DIR`, `ACTIVE_TIMERS_FILE`, …) at a scratch directory, so tests never touch real data.

```javascript
import { describe, it, expect } from '@jest/globals';
import { getAutoDetectMode } from '../src/utils/guildConfig.js';

describe('getAutoDetectMode', () => {
  it('falls back to ask for configs that predate the key', () => {
    expect(getAutoDetectMode({})).toBe('ask');
  });

  it('rejects a garbage value', () => {
    expect(getAutoDetectMode({ watchPartyAutoDetectMode: 'sometimes' })).toBe('ask');
  });
});
```

Assert the effect — the stored record, the number, the text — not just that a reply was sent. After writing a test, break the code it covers and confirm the test fails.

## Contributing

### Development Setup

```bash
git clone https://github.com/r3volution11/Egg-Shen-Bot.git
cd Egg-Shen-Bot
npm install
cp .env.example .env          # then add your API keys
node src/deploy-commands.js   # register slash commands
npm run dev                   # restarts on file changes
```

### Code Style

- ES modules (`import`/`export`), async/await
- Comments explain *why*, especially for anything that once broke
- Per-server settings go in the guild config with a default in `defaultConfig`, read through a normalizing helper

### Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes
4. Push the branch and open a pull request on GitHub

## Version History

See the [Changelog](/changelog) for version history and updates.

## License

MIT License — see the LICENSE file in the repository.

## Support

- **Documentation:** https://eggshenbot.com
- **GitHub Issues:** https://github.com/r3volution11/Egg-Shen-Bot/issues
- **GitHub Discussions:** https://github.com/r3volution11/Egg-Shen-Bot/discussions

# API Reference

Technical reference for developers working with or extending Egg Shen Bot.

## Overview

Egg Shen Bot is built with Node.js and Discord.js v14. The codebase uses ES modules and follows modern JavaScript patterns.

## Architecture

### Core Components

```
src/
├── index.js           # Main entry point, event handlers
├── commands/          # Slash command implementations
│   ├── timer.js      # Watch party timer commands
│   ├── watched.js    # Watch history commands
│   ├── movie.js      # Movie search command
│   ├── tv.js         # TV show search command
│   ├── game.js       # Game search command
│   └── ...
├── handlers/          # Interaction handlers
│   ├── buttonHandler.js   # Button click handlers
│   ├── selectHandler.js   # Select menu handlers
│   └── modalHandler.js    # Modal submit handlers
├── services/          # External API integrations
│   ├── tmdbService.js     # The Movie Database
│   ├── omdbService.js     # Open Movie Database
│   ├── traktService.js    # Trakt.tv
│   └── rawgService.js     # RAWG game database
└── utils/             # Utility modules
    ├── guildConfig.js     # Server configuration
    ├── rateLimiter.js     # Rate limiting system
    ├── timerManager.js    # Watch party timers
    ├── watchHistoryManager.js  # Watch history
    └── statsTracker.js    # Statistics tracking
```

### Technology Stack

- **Runtime:** Node.js 20+
- **Discord Library:** Discord.js v14.14.1
- **APIs:** TMDB, OMDB, Trakt, RAWG
- **Database:** In-memory with optional SQLite persistence
- **Module System:** ES Modules (ESM)

## Core Utilities

### Guild Configuration

Manages per-server settings.

```javascript
import { getGuildConfig, updateGuildConfig } from './utils/guildConfig.js';

// Get configuration
const config = await getGuildConfig(guildId);

// Update setting
await updateGuildConfig(guildId, {
  rateLimitingEnabled: true,
  abuseLoggingEnabled: true,
  modLogsChannelId: '123456789'
});
```

**Configuration Schema:**

```typescript
interface GuildConfig {
  guildId: string;
  rateLimitingEnabled: boolean;
  abuseLoggingEnabled: boolean;
  modLogsChannelId?: string;
  notificationsEnabled: boolean;
  customSettings?: Record<string, any>;
}
```

### Rate Limiter

7-layer rate limiting system.

```javascript
import { checkRateLimit, addViolation } from './utils/rateLimiter.js';

// Check if user can execute command
const canExecute = await checkRateLimit(userId, guildId, commandName);

if (!canExecute) {
  // User is rate limited
  return await interaction.reply({
    content: 'Please wait before using this command again.',
    ephemeral: true
  });
}

// Log violation
await addViolation(userId, guildId, 'spam_detected');
```

**Rate Limit Layers:**

1. Per-user cooldowns (3 seconds)
2. Guild-wide limits (configurable)
3. Pattern detection (algorithmic)
4. Abuse logging (persistent)
5. Auto-ban threshold (5 violations)
6. Manual cooldowns (moderator-applied)
7. Whitelist mode (emergency)

### Timer Manager

Manages watch party countdown timers.

```javascript
import { createTimer, stopTimer, getTimer } from './utils/timerManager.js';

// Create timer
const timer = await createTimer(channelId, {
  duration: 7200, // seconds
  description: 'The Matrix',
  userId: interaction.user.id,
  username: interaction.user.username
});

// Get active timer
const active = await getTimer(channelId);

// Stop timer
await stopTimer(channelId, userId);
```

**Timer Schema:**

```typescript
interface Timer {
  channelId: string;
  guildId: string;
  userId: string;
  username: string;
  duration: number;
  description?: string;
  startTime: Date;
  endTime: Date;
  messageId?: string;
}
```

### Watch History Manager

Tracks server-wide watch history.

```javascript
import { saveWatchHistory, getWatchHistory } from './utils/watchHistoryManager.js';

// Save entry
await saveWatchHistory(guildId, {
  title: 'The Matrix',
  tmdbId: 603,
  type: 'movie',
  channelId: interaction.channelId,
  channelName: interaction.channel.name,
  savedById: interaction.user.id,
  savedBy: interaction.user.username,
  notes: 'Great movie night!'
});

// Get history
const history = await getWatchHistory(guildId, { limit: 10 });
```

**Watch History Schema:**

```typescript
interface WatchHistoryEntry {
  id: number;
  guildId: string;
  title: string;
  tmdbId: number;
  type: 'movie' | 'tv';
  channelId: string;
  channelName: string;
  savedById: string;
  savedBy: string;
  watchedAt: Date;
  notes?: string;
}
```

### Statistics Tracker

Tracks bot usage and statistics.

```javascript
import { trackCommand, getServerStats, getUserStats } from './utils/statsTracker.js';

// Track command execution
await trackCommand(guildId, userId, commandName, {
  success: true,
  responseTime: 245
});

// Get statistics
const serverStats = await getServerStats(guildId);
const userStats = await getUserStats(guildId, userId);
```

**Stats Schema:**

```typescript
interface ServerStats {
  totalCommands: number;
  uniqueUsers: number;
  watchParties: number;
  historyEntries: number;
  topCommands: Array<{ name: string; count: number }>;
  topUsers: Array<{ id: string; count: number }>;
}

interface UserStats {
  userId: string;
  totalCommands: number;
  watchPartiesHosted: number;
  historyEntriesSaved: number;
  firstInteraction: Date;
  topCommands: Array<{ name: string; count: number }>;
}
```

## External Services

### TMDB Service

Interface to The Movie Database API.

```javascript
import { searchMovie, searchTV, getMovieDetails } from './services/tmdbService.js';

// Search for movie
const results = await searchMovie('The Matrix');

// Get details
const movie = await getMovieDetails(603);
```

**API Methods:**

- `searchMovie(query)` - Search for movies
- `searchTV(query)` - Search for TV shows
- `getMovieDetails(id)` - Get movie details
- `getTVDetails(id)` - Get TV show details
- `getEpisodeDetails(showId, season, episode)` - Get episode details

### OMDB Service

Interface to Open Movie Database API.

```javascript
import { getOMDBRatings } from './services/omdbService.js';

// Get additional ratings
const ratings = await getOMDBRatings('tt0133093'); // IMDB ID
```

Returns:
- IMDB rating
- Rotten Tomatoes scores
- Metacritic score

### Trakt Service

Interface to Trakt.tv API (optional).

```javascript
import { getTraktRating } from './services/traktService.js';

const rating = await getTraktRating('movie', 'the-matrix-1999');
```

### RAWG Service

Interface to RAWG game database API (optional).

```javascript
import { searchGame, getGameDetails } from './services/rawgService.js';

const results = await searchGame('The Legend of Zelda');
const game = await getGameDetails(12345);
```

## Command Structure

### Basic Command Template

```javascript
import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('commandname')
  .setDescription('Command description')
  .addStringOption(option =>
    option.setName('parameter')
      .setDescription('Parameter description')
      .setRequired(true)
  );

export async function execute(interaction) {
  // Rate limiting
  const canExecute = await checkRateLimit(
    interaction.user.id,
    interaction.guildId,
    'commandname'
  );
  
  if (!canExecute) {
    return await interaction.reply({
      content: 'Please wait before using this command again.',
      ephemeral: true
    });
  }
  
  // Command logic
  await interaction.deferReply();
  
  try {
    // Do work
    const result = await doSomething();
    
    // Track statistics
    await trackCommand(interaction.guildId, interaction.user.id, 'commandname');
    
    // Send response
    await interaction.editReply({ content: result });
  } catch (error) {
    console.error('Command error:', error);
    await interaction.editReply({ content: 'An error occurred.' });
  }
}
```

### Button Handler Template

```javascript
// In handlers/buttonHandler.js

export async function handleButton(interaction) {
  const [action, ...params] = interaction.customId.split('_');
  
  switch (action) {
    case 'mybutton':
      await handleMyButton(interaction, params);
      break;
    // More cases...
  }
}

async function handleMyButton(interaction, params) {
  // Permission check
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return await interaction.reply({
      content: 'You do not have permission to use this button.',
      ephemeral: true
    });
  }
  
  // Button logic
  await interaction.deferReply();
  // Do work...
}
```

### Modal Handler Template

```javascript
// In index.js or separate modal handler

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isModalSubmit()) return;
  
  if (interaction.customId === 'my_modal') {
    const field = interaction.fields.getTextInputValue('field_id');
    
    // Process modal data
    // ...
    
    await interaction.reply({
      content: 'Submitted!',
      ephemeral: false
    });
  }
});
```

## Embed Formatting

### Standard Movie Embed

```javascript
import { EmbedBuilder } from 'discord.js';

const embed = new EmbedBuilder()
  .setColor('#2AB5E5')
  .setTitle(movie.title)
  .setURL(`https://www.themoviedb.org/movie/${movie.id}`)
  .setDescription(movie.overview)
  .setThumbnail(`https://image.tmdb.org/t/p/w500${movie.poster_path}`)
  .addFields(
    { name: '📅 Release Date', value: movie.release_date, inline: true },
    { name: '⏱️ Runtime', value: `${movie.runtime} min`, inline: true },
    { name: '⭐ Rating', value: movie.vote_average.toString(), inline: true }
  )
  .setFooter({ text: 'Data from TMDB' })
  .setTimestamp();

await interaction.editReply({ embeds: [embed] });
```

## Environment Variables

Required and optional environment variables:

```bash
# Required
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id
TMDB_API_KEY=your_tmdb_api_key

# Optional
OMDB_API_KEY=your_omdb_api_key
TRAKT_API_KEY=your_trakt_api_key
RAWG_API_KEY=your_rawg_api_key

# Database (if using persistent storage)
DATABASE_URL=sqlite:./data/bot.db
```

## Error Handling

### Standard Error Pattern

```javascript
try {
  await someOperation();
} catch (error) {
  console.error('Error in operation:', error);
  
  // Log to mod logs if configured
  const config = await getGuildConfig(interaction.guildId);
  if (config.modLogsChannelId) {
    const channel = await interaction.client.channels.fetch(config.modLogsChannelId);
    await channel.send(`⚠️ Error in ${operation}: ${error.message}`);
  }
  
  // User-friendly message
  await interaction.reply({
    content: 'An error occurred. Please try again later.',
    ephemeral: true
  });
}
```

## Testing

### Manual Testing

```bash
# Start bot in development
npm run dev

# Test command in Discord
/movie The Matrix

# Check logs
tail -f logs/bot.log
```

### Unit Testing (Future)

```javascript
// Example test structure
import { describe, it, expect } from 'vitest';
import { checkRateLimit } from './utils/rateLimiter.js';

describe('Rate Limiter', () => {
  it('should allow first command', async () => {
    const result = await checkRateLimit('user123', 'guild456', 'movie');
    expect(result).toBe(true);
  });
  
  it('should block rapid commands', async () => {
    await checkRateLimit('user123', 'guild456', 'movie');
    const result = await checkRateLimit('user123', 'guild456', 'movie');
    expect(result).toBe(false);
  });
});
```

## Contributing

### Development Setup

```bash
# Clone repository
git clone https://github.com/r3volution11/Egg-Shen-Bot.git
cd Egg-Shen-Bot

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your API keys
nano .env

# Start development server
npm run dev
```

### Code Style

- Use ES modules (`import`/`export`)
- Async/await for asynchronous code
- Descriptive variable names
- Comments for complex logic
- Error handling for all operations

### Pull Request Process

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request on GitHub

## Version History

See the [Changelog](/changelog) for version history and updates.

## License

MIT License - see LICENSE file in repository.

## Support

- **Documentation:** https://r3volution11.github.io/Egg-Shen-Bot/
- **GitHub Issues:** https://github.com/r3volution11/Egg-Shen-Bot/issues
- **GitHub Discussions:** https://github.com/r3volution11/Egg-Shen-Bot/discussions

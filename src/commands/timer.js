import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, GuildScheduledEventStatus, StringSelectMenuBuilder } from 'discord.js';
import { startTimer, stopTimer, getTimerStatus, adjustTimerDuration, disableTimerAutostop, pauseTimer, resumeTimer, clampTimerDuration, canControlTimerPauseStop } from '../utils/timerManager.js';
import { loadGuildConfig, isAdmin } from '../utils/guildConfig.js';
import { searchMovies, searchTVShows, getMovieDetails, getTVShowDetails, getMovieAlternativeTitles, getTVAlternativeTitles, getSeasonDetails, sumEpisodeRuntimes } from '../services/tmdbService.js';
import { searchBoardGames, getBoardGameDetails } from '../services/bggService.js';
import { hybridSearch, pickLandslideWinner } from '../services/aiService.js';
import { parseEpisodeRange } from '../utils/episodeRangeParser.js';

/**
 * Auto-detect event title from scheduled events
 * Looks for active events where the event location matches the current channel
 */
async function getEventTitleForChannel(guild, channelId) {
  try {
    console.log(`[Timer Auto-Detection] Checking for events in channel ${channelId}...`);
    
    // Fetch all scheduled events
    const events = await guild.scheduledEvents.fetch();
    console.log(`[Timer Auto-Detection] Found ${events.size} total scheduled event(s)`);
    
    // Find active events
    const activeEvents = events.filter(event => event.status === GuildScheduledEventStatus.Active);
    console.log(`[Timer Auto-Detection] Found ${activeEvents.size} ACTIVE event(s)`);
    
    if (activeEvents.size === 0) {
      console.log(`[Timer Auto-Detection] No active events found`);
      return null;
    }
    
    // Look for an event where the channel matches
    // Discord events can have a channel property if it's a voice/stage event
    // or entityMetadata.location for external events (we check both)
    for (const [, event] of activeEvents) {
      console.log(`[Timer Auto-Detection] Checking event: "${event.name}"`);
      console.log(`[Timer Auto-Detection] - Event status: ${event.status}`);
      console.log(`[Timer Auto-Detection] - Event channelId: ${event.channelId}`);
      console.log(`[Timer Auto-Detection] - Event location: ${event.entityMetadata?.location || 'none'}`);
      
      // Check if it's a channel-based event and matches our channel
      if (event.channelId === channelId) {
        console.log(`[Timer Auto-Detection] ✅ Found matching event: "${event.name}" (channel-based)`);
        return event.name;
      }
      
      // Check if the location field mentions this channel
      // Users might write "#movie-night" or the channel ID in the location
      if (event.entityMetadata?.location) {
        const location = event.entityMetadata.location.toLowerCase();
        const channelMention = `<#${channelId}>`;
        
        console.log(`[Timer Auto-Detection] - Checking if location contains channel ID or mention...`);
        console.log(`[Timer Auto-Detection] - Looking for: "${channelId}" or "${channelMention}"`);
        
        // Check if location contains channel mention or ID
        if (location.includes(channelId) || location.includes(channelMention.toLowerCase())) {
          console.log(`[Timer Auto-Detection] ✅ Found matching event: "${event.name}" (location mentions channel)`);
          return event.name;
        }
        
        // Also check if location matches channel name (e.g., "#general", "#movie-night")
        // Get the actual channel to compare names
        const channel = guild.channels.cache.get(channelId);
        if (channel) {
          const channelNamePattern = `#${channel.name}`.toLowerCase();
          console.log(`[Timer Auto-Detection] - Also checking channel name: "${channelNamePattern}"`);
          
          if (location === channelNamePattern || location.includes(channelNamePattern)) {
            console.log(`[Timer Auto-Detection] ✅ Found matching event: "${event.name}" (location matches channel name)`);
            return event.name;
          }
        }
      }
    }
    
    console.log(`[Timer Auto-Detection] ❌ No matching events found for channel ${channelId}`);
    return null;
  } catch (error) {
    console.error('[Timer Auto-Detection] Error fetching scheduled events:', error);
    return null;
  }
}

/**
 * Get full event object for remind subcommand
 * Returns the event object instead of just the title
 */
async function getEventForChannel(guild, channelId) {
  try {
    console.log(`[Timer Remind] Checking for events in channel ${channelId}...`);
    
    // Fetch all scheduled events
    const events = await guild.scheduledEvents.fetch();
    console.log(`[Timer Remind] Found ${events.size} total scheduled event(s)`);
    
    // Find active or scheduled events (not just active)
    const relevantEvents = events.filter(event => 
      event.status === GuildScheduledEventStatus.Active || 
      event.status === GuildScheduledEventStatus.Scheduled
    );
    console.log(`[Timer Remind] Found ${relevantEvents.size} active/scheduled event(s)`);
    
    if (relevantEvents.size === 0) {
      console.log(`[Timer Remind] No relevant events found`);
      return null;
    }
    
    // Look for an event where the channel matches
    for (const [, event] of relevantEvents) {
      console.log(`[Timer Remind] Checking event: "${event.name}"`);
      console.log(`[Timer Remind] - Event status: ${event.status}`);
      console.log(`[Timer Remind] - Event channelId: ${event.channelId}`);
      console.log(`[Timer Remind] - Event location: ${event.entityMetadata?.location || 'none'}`);
      
      // Check if it's a channel-based event and matches our channel
      if (event.channelId === channelId) {
        console.log(`[Timer Remind] ✅ Found matching event: "${event.name}" (channel-based)`);
        return event;
      }
      
      // Check if the location field mentions this channel
      if (event.entityMetadata?.location) {
        const location = event.entityMetadata.location.toLowerCase();
        const channelMention = `<#${channelId}>`;
        
        console.log(`[Timer Remind] - Checking if location contains channel ID or mention...`);
        
        // Check if location contains channel mention or ID
        if (location.includes(channelId) || location.includes(channelMention.toLowerCase())) {
          console.log(`[Timer Remind] ✅ Found matching event: "${event.name}" (location mentions channel)`);
          return event;
        }
        
        // Also check if location matches channel name
        const channel = guild.channels.cache.get(channelId);
        if (channel) {
          const channelNamePattern = `#${channel.name}`.toLowerCase();
          console.log(`[Timer Remind] - Also checking channel name: "${channelNamePattern}"`);
          
          if (location === channelNamePattern || location.includes(channelNamePattern)) {
            console.log(`[Timer Remind] ✅ Found matching event: "${event.name}" (location matches channel name)`);
            return event;
          }
        }
      }
    }
    
    console.log(`[Timer Remind] ❌ No matching events found for channel ${channelId}`);
    return null;
  } catch (error) {
    console.error('[Timer Remind] Error fetching scheduled events:', error);
    return null;
  }
}

/**
 * Search for content on TMDB and return results
 */
async function searchContent(title) {
  try {
    // Search both movies and TV shows
    const [movieResults, tvResults] = await Promise.all([
      searchMovies(title),
      searchTVShows(title)
    ]);
    
    // Combine and sort by popularity
    const allResults = [
      ...movieResults.map(m => ({ ...m, type: 'movie' })),
      ...tvResults.map(t => ({ ...t, type: 'tv' }))
    ].sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    
    return allResults.slice(0, 10); // Return top 10
  } catch (error) {
    console.error('[Timer Remind] Error searching TMDB:', error);
    return [];
  }
}

/**
 * Format runtime for display
 */
function formatRuntime(minutes) {
  if (!minutes) return 'Unknown';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/**
 * Resolve a multi-episode watch-party duration for a known show: fetch the
 * season, sum episode runtimes across the requested range, and add the
 * standard 10-minute buffer. Returns null when the season/range can't be
 * resolved (caller should treat this the same as "no runtime found").
 * @param {number} showId - TMDB TV show ID
 * @param {{season: number, episodeStart: number, episodeEnd: number, showName: string}} episodeRange
 * @returns {Promise<{duration: number, breakdown: {showName: string, season: number, episodeCount: number, episodes: Array, totalRuntime: number, duration: number}}|null>}
 */
export async function resolveEpisodeRangeDuration(showId, episodeRange) {
  const [seasonDetails, showDetails] = await Promise.all([
    getSeasonDetails(showId, episodeRange.season),
    getTVShowDetails(showId).catch(() => null),
  ]);

  if (!seasonDetails) return null;

  const fallbackRuntime = showDetails?.episode_run_time?.[0] || null;
  const summed = sumEpisodeRuntimes(seasonDetails, episodeRange.episodeStart, episodeRange.episodeEnd, fallbackRuntime);
  if (!summed) return null;

  const duration = summed.totalRuntime + 10;
  console.log(`[Timer] ✅ Auto-detected episode-range duration: ${summed.episodeCount} episodes = ${summed.totalRuntime}min + 10min buffer = ${duration}min`);

  return {
    duration,
    breakdown: {
      showName: showDetails?.name || episodeRange.showName,
      season: episodeRange.season,
      episodeCount: summed.episodeCount,
      episodes: summed.breakdown,
      totalRuntime: summed.totalRuntime,
      duration,
    },
  };
}

/**
 * Build the ephemeral breakdown message shown when a timer's duration came
 * from summing a multi-episode range, so the user can sanity-check the
 * total rather than just seeing an opaque final number.
 */
export function buildEpisodeRangeBreakdownMessage(breakdown) {
  const episodeLines = breakdown.episodes
    .map(ep => `  E${ep.episodeNumber}: ${ep.runtime != null ? `${ep.estimated ? '~' : ''}${ep.runtime} min${ep.estimated ? ' (estimated)' : ''}` : 'unknown'}`)
    .join('\n');

  const avgRuntime = Math.round(breakdown.totalRuntime / breakdown.episodeCount);

  return (
    `📺 **${breakdown.showName}** — Season ${breakdown.season}, Episodes ${breakdown.episodes[0].episodeNumber}-${breakdown.episodes[breakdown.episodes.length - 1].episodeNumber} (${breakdown.episodeCount} episodes)\n` +
    `${episodeLines}\n` +
    `${'─'.repeat(14)}\n` +
    `${breakdown.episodeCount} episodes, ~${avgRuntime} min each = ${breakdown.totalRuntime} min + 10 min buffer = ${breakdown.duration} min`
  );
}

/**
 * Runs episode-range detection + the generic movie/TV/board-game search
 * against `label`, then either starts the timer directly (landslide/single
 * match, or nothing found) or shows a picker and returns, awaiting a user
 * choice. Shared by the initial `/timer start` invocation and by the
 * "Search" retry flow (a modal lets a user whose auto-detected watch-party
 * title didn't match anything type a corrected title, which re-enters here
 * exactly like a fresh label would).
 *
 * `wasAutoDetected` controls whether pickers/zero-results screens offer the
 * "🔎 Search" recovery option — only relevant when the label came from
 * watch-party auto-detection, since a manually-typed label that doesn't
 * match anything already has an obvious fix (the user can just re-run the
 * command), unlike an auto-detected title the user never typed themselves.
 *
 * @param {import('discord.js').Interaction} interaction - the original slash
 *   command interaction (deferred) on first entry, or a modal-submit
 *   interaction (deferred) on a "Search" retry round. Only `.editReply()`/
 *   `.followUp()` are used — the caller must have already deferred/replied.
 * @param {object} params
 * @param {string} params.channelId
 * @param {string} params.userId
 * @param {string} params.username
 * @param {string} params.label
 * @param {string} params.theme
 * @param {object} params.guildConfig
 * @param {boolean} params.wasAutoDetected
 */
export async function runTitleSearchAndDecide(interaction, { channelId, userId, username, label, theme, guildConfig, wasAutoDetected }) {
  let duration = null;
  let noRuntimeFound = false;
  let episodeRangeBreakdown = null;

  function buildSearchRow(selectMenu) {
    const row = new ActionRowBuilder().addComponents(selectMenu);
    const components = [row];
    if (wasAutoDetected) {
      const searchButton = new ButtonBuilder()
        .setCustomId(`timer_retype_${theme}`)
        .setLabel('🔎 Search')
        .setStyle(ButtonStyle.Primary);
      components.push(new ActionRowBuilder().addComponents(searchButton));
    }
    return components;
  }

  // Episode-range detection: a label like "Tales from the Crypt - S5: E5 -
  // E8" means a single watch party spanning multiple episodes. Detected
  // BEFORE the general movie/TV/boardgame search below, since searching
  // for the raw, unparsed label (range notation and all) would rarely
  // match well against the show name alone.
  const episodeRange = !duration && label ? parseEpisodeRange(label) : null;

  if (episodeRange) {
    console.log(`[Timer] Detected episode range in "${label}": S${episodeRange.season} E${episodeRange.episodeStart}-E${episodeRange.episodeEnd} (show: "${episodeRange.showName}")`);
    try {
      const showResults = await hybridSearch(episodeRange.showName, searchTVShows, 'tv', getTVAlternativeTitles);
      const landslideShow = showResults.length > 1 ? pickLandslideWinner(showResults) : null;

      if (!showResults || showResults.length === 0) {
        console.log(`[Timer] No show found for "${episodeRange.showName}", continuing without duration`);
        noRuntimeFound = true;
      } else if (showResults.length === 1 || landslideShow) {
        const show = landslideShow || showResults[0];
        const result = await resolveEpisodeRangeDuration(show.id, episodeRange);
        if (result) {
          duration = result.duration;
          episodeRangeBreakdown = result.breakdown;
        } else {
          noRuntimeFound = true;
        }
      } else {
        // Multiple shows matched the name (e.g. same-titled show across
        // different years) - show a picker carrying the range through.
        console.log(`[Timer] Found ${showResults.length} shows matching "${episodeRange.showName}", showing selection menu`);

        const options = showResults.slice(0, 24).map((result) => {
          const title = result.name;
          const year = result.first_air_date;
          const yearStr = year ? ` (${year.split('-')[0]})` : '';
          const overview = result.overview ? result.overview.substring(0, 97) + '...' : 'No description';

          return {
            label: `${title}${yearStr}`.substring(0, 100),
            description: overview.substring(0, 100),
            value: `timer_tv_${result.id}_${theme}_range_${episodeRange.season}_${episodeRange.episodeStart}_${episodeRange.episodeEnd}`,
          };
        });

        options.push({
          label: '▶️ Start Timer (No Duration)',
          description: 'Timer will run continuously until manually stopped',
          value: `timer_skip_${theme}`,
        });

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('timer_select_runtime')
          .setPlaceholder('Select the correct show')
          .addOptions(options);

        const embed = new EmbedBuilder()
          .setColor(0x0099FF)
          .setTitle(`🎬 Confirm Show for "${episodeRange.showName}" (S${episodeRange.season} E${episodeRange.episodeStart}-E${episodeRange.episodeEnd})`)
          .setDescription(
            `Found ${showResults.length} possible matches.\n\n` +
            `**Select the correct show** to sum episodes ${episodeRange.episodeStart}-${episodeRange.episodeEnd} and add a 10-minute buffer.\n\n` +
            (wasAutoDetected
              ? `Click **Search** to look up a different title, or **Start Timer** to begin without a duration (continuous until stopped).`
              : `Or choose "Start Timer" to start without a duration (continuous until stopped).`)
          )
          .setFooter({ text: 'Select from the menu below' });

        await interaction.editReply({ embeds: [embed], components: buildSearchRow(selectMenu) });
        return;
      }
    } catch (error) {
      console.error('[Timer] Error detecting episode range runtime:', error);
    }
  }

  // Auto-detect runtime if duration not provided and we have a label
  // (runs for both manually-typed and auto-detected labels). Skipped when
  // an episode range was already detected above (whether it resolved a
  // duration or not) — the range branch already searched TV shows for
  // this label, so falling through to search the raw range-containing
  // string here would rarely help and just adds latency.
  if (!duration && label && !episodeRange) {
    console.log(`[Timer] Attempting to detect runtime for: "${label}"`);
    try {
      // Search for the movie/TV show/board game. Movie/TV searches go
      // through hybridSearch for semantic ranking (enabling the landslide
      // check below); board games have no embedding support, so they stay
      // on a plain keyword search.
      const [movieResults, tvResults, boardGameResults] = await Promise.all([
        hybridSearch(label, searchMovies, 'movie', getMovieAlternativeTitles).catch(() => []),
        hybridSearch(label, searchTVShows, 'tv', getTVAlternativeTitles).catch(() => []),
        searchBoardGames(label).catch(() => []),
      ]);

      // Check each type independently for a landslide winner — never
      // comparing a movie's semantic score against a TV show's, since
      // they were ranked against different candidate pools. If exactly
      // one type has a landslide winner and the other types have no
      // results at all, auto-select it without merging/showing a picker.
      const movieLandslide = movieResults.length > 1 ? pickLandslideWinner(movieResults) : (movieResults.length === 1 ? movieResults[0] : null);
      const tvLandslide = tvResults.length > 1 ? pickLandslideWinner(tvResults) : (tvResults.length === 1 ? tvResults[0] : null);
      const otherTypesEmpty = {
        movie: tvResults.length === 0 && (boardGameResults || []).length === 0,
        tv: movieResults.length === 0 && (boardGameResults || []).length === 0,
      };

      let soloWinner = null;
      let soloWinnerType = null;
      if (movieLandslide && otherTypesEmpty.movie) {
        soloWinner = movieLandslide;
        soloWinnerType = 'movie';
      } else if (tvLandslide && otherTypesEmpty.tv) {
        soloWinner = tvLandslide;
        soloWinnerType = 'tv';
      }

      const allResults = [
        ...(movieResults || []).slice(0, 8).map(r => ({ ...r, type: 'movie' })),
        ...(tvResults || []).slice(0, 8).map(r => ({ ...r, type: 'tv' })),
        ...(boardGameResults || []).slice(0, 8).map(r => ({ ...r, type: 'boardgame' })),
      ];

      if (allResults.length === 0) {
        console.log(`[Timer] No results found for "${label}", continuing without duration`);
        noRuntimeFound = true;
      } else if (allResults.length === 1 || soloWinner) {
        // Either only one result overall, or one type produced a decisive
        // landslide winner with nothing competitive in the other types.
        const result = soloWinner ? { ...soloWinner, type: soloWinnerType } : allResults[0];
        console.log(`[Timer] Found single ${result.type} match: ${result.title || result.name}`);

        let runtime = null;
        if (result.type === 'movie') {
          const details = await getMovieDetails(result.id);
          runtime = details?.runtime;
        } else if (result.type === 'tv') {
          const details = await getTVShowDetails(result.id);
          runtime = details?.episode_run_time?.[0];
        } else {
          const details = await getBoardGameDetails(result.id);
          runtime = details?.playingTime ? parseInt(details.playingTime, 10) : null;
        }

        if (runtime && runtime > 0) {
          duration = runtime + 10;
          console.log(`[Timer] ✅ Auto-detected duration: ${runtime}min + 10min buffer = ${duration}min`);
        }
      } else {
        // Multiple results - show selection menu
        console.log(`[Timer] Found ${allResults.length} results, showing selection menu`);

        const options = allResults.map((result) => {
          const title = result.title || result.name;
          const year = result.release_date || result.first_air_date;
          const yearStr = year ? ` (${year.split('-')[0]})` : '';
          const overview = result.overview ? result.overview.substring(0, 97) + '...' : 'No description';

          return {
            label: `${title}${yearStr}`.substring(0, 100),
            description: overview.substring(0, 100),
            value: `timer_${result.type}_${result.id}_${theme}`,
          };
        });

        // Add "Start Timer - No Duration" option
        options.push({
          label: '▶️ Start Timer (No Duration)',
          description: 'Timer will run continuously until manually stopped',
          value: `timer_skip_${theme}`,
        });

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('timer_select_runtime')
          .setPlaceholder('Select the correct title to auto-detect runtime')
          .addOptions(options);

        const embed = new EmbedBuilder()
          .setColor(0x0099FF)
          .setTitle(`🎬 Confirm Title for "${label}"`)
          .setDescription(
            `Found ${allResults.length} possible matches.\n\n` +
            `**Select the correct title** to auto-detect runtime and add a 10-minute buffer.\n\n` +
            (wasAutoDetected
              ? `Click **Search** to look up a different title, or **Start Timer** to begin without a duration (continuous until stopped).`
              : `Or choose "Start Timer" to start without a duration (continuous until stopped).`)
          )
          .setFooter({ text: 'Select from the menu below' });

        await interaction.editReply({
          embeds: [embed],
          components: buildSearchRow(selectMenu),
        });

        // Return early - timer will start after user selects
        return;
      }
    } catch (error) {
      console.error('[Timer] Error detecting runtime:', error);
    }
  }

  if (duration) {
    duration = clampTimerDuration(duration, guildConfig);
  }

  if (episodeRangeBreakdown && episodeRangeBreakdown.episodeCount > 1) {
    await interaction.followUp({
      content: buildEpisodeRangeBreakdownMessage(episodeRangeBreakdown),
      ephemeral: true,
    });
  }

  if (noRuntimeFound && !duration) {
    if (wasAutoDetected) {
      // Auto-detected titles get a chance to be corrected instead of
      // silently starting the timer under a name the user never typed —
      // this screen doesn't exist for manually-typed labels, since a user
      // who typed a bad label themselves can just re-run the command.
      const embed = new EmbedBuilder()
        .setColor(0xFF9900)
        .setTitle(`🤔 Couldn't find a match for "${label}"`)
        .setDescription(
          `This title was auto-detected from a scheduled event in this channel, but no movie, TV show, ` +
          `or board game matched it.\n\n` +
          `**Search** for a movie or TV episode to automatically set the duration, or click **Start Timer** ` +
          `to create a timer without a duration (it will auto-stop after the server's default limit unless you set one).`
        )
        .setFooter({ text: 'Choose an option below' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`timer_retype_${theme}`)
          .setLabel('🔎 Search')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`timer_skip_noauto_${theme}`)
          .setLabel('▶️ Start Timer')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.editReply({ embeds: [embed], components: [row] });
      return;
    }

    const capNote = guildConfig?.maxTimerDurationUnlimited === true
      ? 'this timer will run until manually stopped (`/timer stop`), unless you set a duration.'
      : `this timer will auto-stop after ${guildConfig?.maxTimerDurationMinutes || 360} minutes (the server default) with a warning about an hour before, unless you set a duration.`;
    await interaction.followUp({
      content: `⚠️ Couldn't find a runtime for "${label}" — ${capNote}`,
      ephemeral: true,
    });
  }

  // Check if timer already exists and start countdown
  await startTimerCountdown(interaction, channelId, userId, username, label, duration, theme, guildConfig);
}

export const data = new SlashCommandBuilder()
  .setName('timer')
  .setDescription('Start, stop, or check a timer in this channel')
  .addSubcommand(subcommand =>
    subcommand
      .setName('start')
      .setDescription('🟢 Start a timer in this channel')
      .addStringOption(option =>
        option
          .setName('label')
          .setDescription('Optional label for the timer (e.g., "Movie night", "Break time")')
          .setRequired(false)
      )
      .addStringOption(option =>
        option
          .setName('movie')
          .setDescription('Movie title to look up and time automatically (alternative to label)')
          .setRequired(false)
      )
      .addStringOption(option =>
        option
          .setName('tv')
          .setDescription('TV show title to look up (optionally with episodes, e.g. "S5E5-E8") — alternative to label')
          .setRequired(false)
      )
      .addIntegerOption(option =>
        option
          .setName('duration')
          .setDescription('Optional duration in minutes (e.g., 120 for 2 hours)')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(1440) // 24 hours max (real cap enforced server-side via clampTimerDuration)
      )
      .addStringOption(option =>
        option
          .setName('theme')
          .setDescription('Timer countdown theme (default: modern)')
          .setRequired(false)
          .addChoices(
            { name: 'Modern (Default)', value: 'modern' },
            { name: 'Classic', value: 'classic' }
          )
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('stop')
      .setDescription('🛑 Stop the active timer in this channel')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('pause')
      .setDescription('⏸️ Pause the active timer in this channel')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('resume')
      .setDescription('▶️ Resume a paused timer in this channel')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('status')
      .setDescription('ℹ️ Check the current timer status in this channel')
      .addBooleanOption(option =>
        option
          .setName('public')
          .setDescription('Show this to everyone in the channel instead of just you (default: false)')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('check')
      .setDescription('ℹ️ Check the current timer status in this channel (alias for status)')
      .addBooleanOption(option =>
        option
          .setName('public')
          .setDescription('Show this to everyone in the channel instead of just you (default: false)')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('remind')
      .setDescription('⏱️ Announce that the timer is about to start')
      .addStringOption(option =>
        option
          .setName('message')
          .setDescription('Optional custom message (e.g., "Everyone ready?")')
          .setRequired(false)
          .setMaxLength(200)
      )
      .addRoleOption(option =>
        option
          .setName('role')
          .setDescription('Optional role to ping')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('adjust')
      .setDescription('⚙️ Adjust the duration of the active timer')
      .addIntegerOption(option =>
        option
          .setName('duration')
          .setDescription('New total duration in minutes (e.g., 140 for 2h 20m)')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(1440) // 24 hours max (real cap enforced server-side via clampTimerDuration)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('autostop')
      .setDescription('⚙️ Enable or disable auto-stop for the active timer')
      .addStringOption(option =>
        option
          .setName('autostop')
          .setDescription('Enable or disable auto-stop')
          .setRequired(true)
          .addChoices(
            { name: 'Enable', value: 'enable' },
            { name: 'Disable', value: 'disable' }
          )
      )
      .addIntegerOption(option =>
        option
          .setName('duration')
          .setDescription('Duration in minutes (required when enabling, e.g., 140 for 2h 20m)')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(1440) // 24 hours max (real cap enforced server-side via clampTimerDuration)
      )
  );

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const channelId = interaction.channelId;

  if (subcommand === 'start') {
    // Defer reply immediately to prevent timeout (ephemeral so selection menu is private)
    await interaction.deferReply({ ephemeral: true });
    
    let label = interaction.options.getString('label') || '';
    const movieOption = interaction.options.getString('movie') || '';
    const tvOption = interaction.options.getString('tv') || '';
    let duration = interaction.options.getInteger('duration'); // Duration in minutes
    const theme = interaction.options.getString('theme') || 'modern';
    const userId = interaction.user.id;
    const username = interaction.user.username;
    const guildConfig = await loadGuildConfig(interaction.guildId);
    let noRuntimeFound = false;
    let episodeRangeBreakdown = null; // set when duration came from summing a multi-episode range
    let wasAutoDetected = false; // set when label came from a watch-party channel's scheduled event, not typed

    // At most one of label/movie/tv may be given — each is a different way
    // of saying "here's what's playing," so more than one is an ambiguous
    // request rather than something to silently prioritize.
    const providedOptionCount = [label, movieOption, tvOption].filter(Boolean).length;
    if (providedOptionCount > 1) {
      await interaction.editReply({
        content: '❌ Use only one of `label`, `movie`, or `tv` — not more than one.',
      });
      return;
    }

    const explicitType = movieOption ? 'movie' : (tvOption ? 'tv' : null);

    // Auto-detect event title if no manual label provided (skipped entirely
    // when movie/tv was given explicitly — there's no ambiguity to resolve).
    if (!label && !explicitType) {
      const watchPartyChannels = guildConfig.watchPartyChannels || [];

      console.log(`[Timer] No manual label provided. Checking for auto-detection...`);
      console.log(`[Timer] Configured watch party channels:`, watchPartyChannels);
      console.log(`[Timer] Current channel ID: ${channelId}`);

      // Check if this channel is configured for watch party auto-detection
      if (watchPartyChannels.includes(channelId)) {
        console.log(`[Timer] ✅ Channel is configured for auto-detection. Fetching events...`);
        const autoDetectedTitle = await getEventTitleForChannel(interaction.guild, channelId);
        if (autoDetectedTitle) {
          label = autoDetectedTitle;
          wasAutoDetected = true;
          console.log(`[Timer] ✅ Auto-detected event title: "${label}"`);
        } else {
          console.log(`[Timer] ❌ No matching event found for auto-detection`);
        }
      } else {
        console.log(`[Timer] ❌ Channel ${channelId} is not in configured watch party channels`);
      }
    } else {
      console.log(`[Timer] Manual label provided: "${label}"`);
    }

    // Explicit movie:/tv: option: the user told us the type up front, so
    // there's no ambiguity to resolve — skip straight to a single-type
    // search instead of the movie+TV+boardgame merge below. This also makes
    // the landslide auto-select more reliable, since it no longer needs the
    // "other types came back empty" gate the merged search relies on.
    if (explicitType && !duration) {
      const query = explicitType === 'movie' ? movieOption : tvOption;

      if (explicitType === 'tv') {
        const explicitRange = parseEpisodeRange(query);
        if (explicitRange) {
          console.log(`[Timer] Detected episode range in tv option "${query}": S${explicitRange.season} E${explicitRange.episodeStart}-E${explicitRange.episodeEnd} (show: "${explicitRange.showName}")`);
          try {
            const showResults = await hybridSearch(explicitRange.showName, searchTVShows, 'tv', getTVAlternativeTitles);
            const landslideShow = showResults.length > 1 ? pickLandslideWinner(showResults) : null;

            if (!showResults || showResults.length === 0) {
              console.log(`[Timer] No show found for "${explicitRange.showName}", continuing without duration`);
              label = explicitRange.showName;
              noRuntimeFound = true;
            } else if (showResults.length === 1 || landslideShow) {
              const show = landslideShow || showResults[0];
              label = show.name;
              const result = await resolveEpisodeRangeDuration(show.id, explicitRange);
              if (result) {
                duration = result.duration;
                episodeRangeBreakdown = result.breakdown;
              } else {
                noRuntimeFound = true;
              }
            } else {
              console.log(`[Timer] Found ${showResults.length} shows matching "${explicitRange.showName}", showing selection menu`);

              const options = showResults.slice(0, 24).map((result) => {
                const title = result.name;
                const year = result.first_air_date;
                const yearStr = year ? ` (${year.split('-')[0]})` : '';
                const overview = result.overview ? result.overview.substring(0, 97) + '...' : 'No description';

                return {
                  label: `${title}${yearStr}`.substring(0, 100),
                  description: overview.substring(0, 100),
                  value: `timer_tv_${result.id}_${theme}_range_${explicitRange.season}_${explicitRange.episodeStart}_${explicitRange.episodeEnd}`,
                };
              });

              options.push({
                label: '▶️ Start Timer (No Duration)',
                description: 'Timer will run continuously until manually stopped',
                value: `timer_skip_${theme}`,
              });

              const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('timer_select_runtime')
                .setPlaceholder('Select the correct show')
                .addOptions(options);

              const row = new ActionRowBuilder().addComponents(selectMenu);

              const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(`🎬 Confirm Show for "${explicitRange.showName}" (S${explicitRange.season} E${explicitRange.episodeStart}-E${explicitRange.episodeEnd})`)
                .setDescription(
                  `Found ${showResults.length} possible matches.\n\n` +
                  `**Select the correct show** to sum episodes ${explicitRange.episodeStart}-${explicitRange.episodeEnd} and add a 10-minute buffer.\n\n` +
                  `Or choose "Start Timer" to start without a duration (continuous until stopped).`
                )
                .setFooter({ text: 'Select from the menu below' });

              await interaction.editReply({ embeds: [embed], components: [row] });
              return;
            }
          } catch (error) {
            console.error('[Timer] Error detecting episode range runtime:', error);
          }

          // Range notation was found and handled above (resolved, picker
          // shown and returned, or failed gracefully with label/noRuntimeFound
          // set) — the `!label` guard below skips the plain search as a result.
        }
      }

      // Plain single-type search — runs for movie:, or for tv: when the
      // value didn't match episode-range notation (a plain show name).
      if (!label && !duration && !noRuntimeFound) {
        const searchFn = explicitType === 'movie' ? searchMovies : searchTVShows;
        const altTitlesFn = explicitType === 'movie' ? getMovieAlternativeTitles : getTVAlternativeTitles;

        try {
          const results = await hybridSearch(query, searchFn, explicitType, altTitlesFn);
          const landslideWinner = results.length > 1 ? pickLandslideWinner(results) : null;

          if (!results || results.length === 0) {
            console.log(`[Timer] No ${explicitType} found for "${query}", continuing without duration`);
            label = query;
            noRuntimeFound = true;
          } else if (results.length === 1 || landslideWinner) {
            const result = landslideWinner || results[0];
            label = result.title || result.name;
            console.log(`[Timer] Found single ${explicitType} match: ${label}`);

            let runtime = null;
            if (explicitType === 'movie') {
              const details = await getMovieDetails(result.id);
              runtime = details?.runtime;
            } else {
              const details = await getTVShowDetails(result.id);
              runtime = details?.episode_run_time?.[0];
            }

            if (runtime && runtime > 0) {
              duration = runtime + 10;
              console.log(`[Timer] ✅ Auto-detected duration: ${runtime}min + 10min buffer = ${duration}min`);
            }
          } else {
            console.log(`[Timer] Found ${results.length} ${explicitType} results, showing selection menu`);

            const options = results.slice(0, 24).map((result) => {
              const title = result.title || result.name;
              const year = result.release_date || result.first_air_date;
              const yearStr = year ? ` (${year.split('-')[0]})` : '';
              const overview = result.overview ? result.overview.substring(0, 97) + '...' : 'No description';

              return {
                label: `${title}${yearStr}`.substring(0, 100),
                description: overview.substring(0, 100),
                value: `timer_${explicitType}_${result.id}_${theme}`,
              };
            });

            options.push({
              label: '▶️ Start Timer (No Duration)',
              description: 'Timer will run continuously until manually stopped',
              value: `timer_skip_${theme}`,
            });

            const selectMenu = new StringSelectMenuBuilder()
              .setCustomId('timer_select_runtime')
              .setPlaceholder(`Select the correct ${explicitType === 'movie' ? 'movie' : 'show'}`)
              .addOptions(options);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            const embed = new EmbedBuilder()
              .setColor(0x0099FF)
              .setTitle(`🎬 Confirm Title for "${query}"`)
              .setDescription(
                `Found ${results.length} possible matches.\n\n` +
                `**Select the correct title** to auto-detect runtime and add a 10-minute buffer.\n\n` +
                `Or choose "Start Timer" to start without a duration (continuous until stopped).`
              )
              .setFooter({ text: 'Select from the menu below' });

            await interaction.editReply({ embeds: [embed], components: [row] });
            return;
          }
        } catch (error) {
          console.error(`[Timer] Error detecting ${explicitType} runtime:`, error);
          label = query;
        }
      }
    }

    if (!explicitType && !duration) {
      await runTitleSearchAndDecide(interaction, { channelId, userId, username, label, theme, guildConfig, wasAutoDetected });
    } else {
      if (duration) {
        duration = clampTimerDuration(duration, guildConfig);
      }

      if (episodeRangeBreakdown && episodeRangeBreakdown.episodeCount > 1) {
        await interaction.followUp({
          content: buildEpisodeRangeBreakdownMessage(episodeRangeBreakdown),
          ephemeral: true,
        });
      }

      if (noRuntimeFound && !duration) {
        const capNote = guildConfig?.maxTimerDurationUnlimited === true
          ? 'this timer will run until manually stopped (`/timer stop`), unless you set a duration.'
          : `this timer will auto-stop after ${guildConfig?.maxTimerDurationMinutes || 360} minutes (the server default) with a warning about an hour before, unless you set a duration.`;
        await interaction.followUp({
          content: `⚠️ Couldn't find a runtime for "${label}" — ${capNote}`,
          ephemeral: true,
        });
      }

      // Check if timer already exists and start countdown
      await startTimerCountdown(interaction, channelId, userId, username, label, duration, theme, guildConfig);
    }
  } else if (subcommand === 'stop') {
    const activeTimer = getTimerStatus(channelId);

    if (activeTimer) {
      const guildConfig = await loadGuildConfig(interaction.guildId);
      if (!canControlTimerPauseStop(activeTimer, interaction.user.id, interaction.member, guildConfig)) {
        return await interaction.reply({
          content: '❌ Only the person who started the timer or server administrators/moderators can stop it.',
          ephemeral: true,
        });
      }
    }

    const result = stopTimer(channelId);

    if (result) {
      // Automatically log to watch history if timer has a label
      if (result.label) {
        await autoLogTimerToWatchHistory(
          interaction,
          result.label,
          result.elapsedFormatted,
          result.username,
          interaction.user.username,
          channelId,
          result.userId
        );
      } else {
        // Timer without label - show button to manually log
        const embed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('⏹️ Timer Stopped 🛑')
          .setDescription('Timer has been stopped')
          .addFields(
            {
              name: 'Total Time',
              value: result.elapsedFormatted,
              inline: true,
            },
            {
              name: 'Started by',
              value: result.username,
              inline: true,
            },
            {
              name: 'Stopped by',
              value: interaction.user.username,
              inline: true,
            }
          )
          .setFooter({ text: 'Use the button below to log what you watched • Only timer starter/mods/admins can log' })
          .setTimestamp();

        // Add button for manual logging (timer starter/mods/admins only)
        const button = new ButtonBuilder()
          .setCustomId(`log_watched_${channelId}_${result.userId}`)
          .setLabel('Log to Watch History')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('📝');

        const row = new ActionRowBuilder().addComponents(button);

        await interaction.reply({ embeds: [embed], components: [row] });
      }
    } else {
      await interaction.reply({
        content: '❌ No active timer in this channel. Use `/timer start` to begin one.',
        ephemeral: true,
      });
    }
  } else if (subcommand === 'pause') {
    const timer = getTimerStatus(channelId);

    if (!timer) {
      return await interaction.reply({
        content: '❌ No active timer in this channel. Use `/timer start` to begin one.',
        ephemeral: true,
      });
    }

    const guildConfig = await loadGuildConfig(interaction.guildId);
    if (!canControlTimerPauseStop(timer, interaction.user.id, interaction.member, guildConfig)) {
      return await interaction.reply({
        content: '❌ Only the person who started the timer or server administrators/moderators can pause it.',
        ephemeral: true,
      });
    }

    if (timer.paused) {
      return await interaction.reply({
        content: '❌ This timer is already paused. Use `/timer resume` to continue it.',
        ephemeral: true,
      });
    }

    const result = pauseTimer(channelId);

    const fields = [
      {
        name: 'Elapsed Time',
        value: result.elapsedFormatted,
        inline: true,
      },
    ];

    if (result.hadDuration) {
      fields.push({
        name: 'Time Remaining',
        value: result.remainingFormatted,
        inline: true,
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0xFFA500)
      .setTitle('⏸️ Timer Paused')
      .setDescription(timer.label ? `**${timer.label}**` : 'Timer paused')
      .addFields(fields)
      .setFooter({ text: 'Use /timer resume to continue' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } else if (subcommand === 'resume') {
    const timer = getTimerStatus(channelId);

    if (!timer) {
      return await interaction.reply({
        content: '❌ No active timer in this channel. Use `/timer start` to begin one.',
        ephemeral: true,
      });
    }

    const guildConfig = await loadGuildConfig(interaction.guildId);
    if (!canControlTimerPauseStop(timer, interaction.user.id, interaction.member, guildConfig)) {
      return await interaction.reply({
        content: '❌ Only the person who started the timer or server administrators/moderators can resume it.',
        ephemeral: true,
      });
    }

    if (!timer.paused) {
      return await interaction.reply({
        content: '❌ This timer is not paused.',
        ephemeral: true,
      });
    }

    const result = resumeTimer(channelId, interaction.client);

    const fields = [
      {
        name: 'Elapsed Time',
        value: result.elapsedFormatted,
        inline: true,
      },
    ];

    if (result.hadDuration) {
      fields.push({
        name: 'Time Remaining',
        value: result.remainingFormatted,
        inline: true,
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('▶️ Timer Resumed')
      .setDescription(timer.label ? `**${timer.label}**` : 'Timer resumed')
      .addFields(fields)
      .setFooter({ text: result.hadDuration ? 'Auto-stop is back on track' : 'Use /timer stop to end the timer' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } else if (subcommand === 'status' || subcommand === 'check') {
    // Most people check the timer just to glance at their own progress, so
    // default to private — pass public:true to announce it to the channel.
    const isPublic = interaction.options.getBoolean('public') || false;
    const timer = getTimerStatus(channelId);

    if (timer) {
      const fields = [
        {
          name: 'Elapsed Time',
          value: timer.elapsedFormatted,
          inline: true,
        },
        {
          name: 'Started by',
          value: timer.username,
          inline: true,
        }
      ];

      // Add remaining time if a real duration is set — a fallback duration
      // (nothing typed, nothing detected) is an internal auto-stop safety
      // net only, not something the user set or the bot determined, so it's
      // not shown here even though it's still tracked for auto-stop/warning.
      const hasDisplayableDuration = timer.duration && !timer.isFallbackDuration;
      if (hasDisplayableDuration) {
        fields.push({
          name: 'Remaining Time',
          value: timer.paused ? timer.remainingFormatted : (timer.isExpired ? 'Expired (stopping...)' : timer.remainingFormatted),
          inline: true,
        });
        fields.push({
          name: 'Total Duration',
          value: `${timer.duration} minutes`,
          inline: true,
        });
      }

      const embed = new EmbedBuilder()
        .setColor(timer.paused ? 0xFFA500 : (timer.isExpired ? 0xFF0000 : 0x5865F2))
        .setTitle(timer.paused ? '⏸️ Timer Paused' : (timer.isExpired ? '⏰ Timer Expired' : '⏱️ Timer Status'))
        .setDescription(timer.label ? `**${timer.label}**` : 'Active timer')
        .addFields(fields)
        .setFooter({ text: timer.paused ? 'Use /timer resume to continue' : (hasDisplayableDuration ? 'Auto-stop enabled' : 'Use /timer stop to end the timer') })
        .setTimestamp(timer.startTime);

      await interaction.reply({ embeds: [embed], ephemeral: !isPublic });
    } else {
      await interaction.reply({
        content: '❌ No active timer in this channel. Use `/timer start` to begin one.',
        ephemeral: true,
      });
    }
  } else if (subcommand === 'remind') {
    await interaction.deferReply();
    
    try {
      const customMessage = interaction.options.getString('message');
      const roleToMention = interaction.options.getRole('role');
      
      // Try to detect event from Discord scheduled events
      const event = await getEventForChannel(interaction.guild, interaction.channel.id);
      
      if (!event) {
        // editReply() can't make an already-public deferred reply ephemeral, so
        // delete the public placeholder and send the error as a followUp instead.
        await interaction.deleteReply();
        return await interaction.followUp({
          content: '❌ No scheduled event found for this channel!\n\nMake sure you have a Discord scheduled event set up for this channel (or with this channel mentioned in the location).',
          ephemeral: true
        });
      }
      
      const eventTitle = event.name;
      console.log(`[Timer Remind] Auto-detected event: "${eventTitle}"`);
      
      // Search TMDB for this title
      const results = await searchContent(eventTitle);
      
      if (results.length === 0) {
        // No TMDB results - just show a basic announcement
        const embed = new EmbedBuilder()
          .setColor('#FF6B9D')
          .setTitle('⏱️ Starting Timer Now!')
          .setDescription(`**${eventTitle}**\n\nTimer starting - get ready!`)
          .setFooter({ text: `Hosted by ${interaction.user.username}` })
          .setTimestamp();
        
        if (customMessage) {
          embed.addFields({ name: '💬 Host', value: customMessage });
        }
        
        // Add voice channel button if event has a voice channel
        const components = [];
        if (event.channelId) {
          const voiceChannel = interaction.guild.channels.cache.get(event.channelId);
          if (voiceChannel && (voiceChannel.type === 2 || voiceChannel.type === 13)) { // Voice or Stage
            const button = new ButtonBuilder()
              .setLabel('Join Voice Channel')
              .setStyle(ButtonStyle.Link)
              .setURL(`https://discord.com/channels/${interaction.guild.id}/${event.channelId}`);
            
            components.push(new ActionRowBuilder().addComponents(button));
          }
        }
        
        const messageContent = roleToMention ? `${roleToMention}` : null;
        
        return await interaction.editReply({ 
          content: messageContent,
          embeds: [embed],
          components
        });
      }
      
      // If only one result, use it directly
      // If multiple results, use the first one (most popular)
      const selectedContent = results[0];
      
      // Get full details
      let details;
      if (selectedContent.type === 'movie') {
        details = await getMovieDetails(selectedContent.id);
      } else {
        details = await getTVShowDetails(selectedContent.id);
      }
      
      // Build the announcement embed
      const embed = new EmbedBuilder()
        .setColor('#FF6B9D')
        .setTitle(`⏱️ Starting Timer Now!`)
        .setDescription(`**${details.title || details.name}**${details.tagline ? `\n*${details.tagline}*` : ''}\n\nGet ready - timer starting!`)
        .setFooter({ text: `Hosted by ${interaction.user.username}` })
        .setTimestamp();
      
      // Add poster if available
      if (details.poster_path) {
        embed.setThumbnail(`https://image.tmdb.org/t/p/w500${details.poster_path}`);
      }
      
      // Add fields
      const fields = [];
      
      // Runtime
      if (details.runtime) {
        fields.push({ 
          name: '⏱️ Runtime', 
          value: formatRuntime(details.runtime),
          inline: true
        });
      } else if (details.episode_run_time && details.episode_run_time.length > 0) {
        fields.push({ 
          name: '⏱️ Episode Length', 
          value: formatRuntime(details.episode_run_time[0]),
          inline: true
        });
      }
      
      // Release year
      const year = details.release_date?.split('-')[0] || details.first_air_date?.split('-')[0];
      if (year) {
        fields.push({ 
          name: '📅 Year', 
          value: year,
          inline: true
        });
      }
      
      // Overview (truncated)
      if (details.overview) {
        const truncatedOverview = details.overview.length > 200 
          ? details.overview.substring(0, 197) + '...' 
          : details.overview;
        fields.push({ 
          name: '📖 Overview', 
          value: truncatedOverview
        });
      }
      
      // Custom message from host
      if (customMessage) {
        fields.push({ 
          name: '💬 Host', 
          value: customMessage
        });
      }
      
      embed.addFields(fields);
      
      // Add buttons
      const components = [];
      const buttons = [];
      
      // TMDB link
      const tmdbUrl = selectedContent.type === 'movie' 
        ? `https://www.themoviedb.org/movie/${selectedContent.id}`
        : `https://www.themoviedb.org/tv/${selectedContent.id}`;
      
      buttons.push(
        new ButtonBuilder()
          .setLabel('View on TMDB')
          .setStyle(ButtonStyle.Link)
          .setURL(tmdbUrl)
      );
      
      // Voice channel button if event has a voice channel
      if (event.channelId) {
        const voiceChannel = interaction.guild.channels.cache.get(event.channelId);
        if (voiceChannel && (voiceChannel.type === 2 || voiceChannel.type === 13)) { // Voice or Stage
          buttons.push(
            new ButtonBuilder()
              .setLabel('Join Voice Channel')
              .setStyle(ButtonStyle.Link)
              .setURL(`https://discord.com/channels/${interaction.guild.id}/${event.channelId}`)
          );
        }
      }
      
      if (buttons.length > 0) {
        components.push(new ActionRowBuilder().addComponents(buttons));
      }
      
      const messageContent = roleToMention ? `${roleToMention}` : null;
      
      await interaction.editReply({
        content: messageContent,
        embeds: [embed],
        components
      });
      
    } catch (error) {
      console.error('[Timer Remind] Error executing remind command:', error);
      
      if (interaction.deferred) {
        // editReply() can't make an already-public deferred reply ephemeral, so
        // delete the public placeholder and send the error as a followUp instead.
        await interaction.deleteReply().catch(() => {});
        await interaction.followUp({
          content: '❌ An error occurred while creating the timer reminder.',
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content: '❌ An error occurred while creating the timer reminder.',
          ephemeral: true
        });
      }
    }
  } else if (subcommand === 'adjust') {
    const requestedDuration = interaction.options.getInteger('duration');
    const timer = getTimerStatus(channelId);

    if (!timer) {
      return await interaction.reply({
        content: '❌ No active timer in this channel. Use `/timer start` to begin one.',
        ephemeral: true,
      });
    }

    if (timer.userId !== interaction.user.id && !isAdmin(interaction.member)) {
      return await interaction.reply({
        content: '❌ Only the person who started the timer or server administrators/moderators can adjust it.',
        ephemeral: true,
      });
    }

    if (timer.paused) {
      return await interaction.reply({
        content: '❌ This timer is paused. Use `/timer resume` first, then adjust the duration.',
        ephemeral: true,
      });
    }

    const guildConfig = await loadGuildConfig(interaction.guildId);
    const newDuration = clampTimerDuration(requestedDuration, guildConfig);
    const wasClamped = newDuration !== requestedDuration;

    const result = adjustTimerDuration(channelId, newDuration, interaction.client);

    if (!result || result.error) {
      const errorMsg = result?.message || 'Failed to adjust timer duration.';
      return await interaction.reply({
        content: `❌ ${errorMsg}`,
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('⚙️ Timer Duration Adjusted')
      .setDescription(timer.label ? `**${timer.label}**` : 'Timer duration updated')
      .addFields(
        {
          name: 'New Total Duration',
          value: `${newDuration} minutes (${formatRuntime(newDuration)})`,
          inline: true,
        },
        {
          name: 'Time Elapsed',
          value: result.elapsedFormatted,
          inline: true,
        },
        {
          name: 'Time Remaining',
          value: result.remainingFormatted,
          inline: true,
        }
      )
      .setFooter({
        text: wasClamped
          ? `Capped at this server's ${newDuration}-minute max (use /eggshen-config settings max-timer-duration to change)`
          : 'Timer will auto-stop when the new duration is reached',
      })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

  } else if (subcommand === 'autostop') {
    const action = interaction.options.getString('autostop');
    const duration = interaction.options.getInteger('duration');
    const timer = getTimerStatus(channelId);
    
    if (!timer) {
      return await interaction.reply({
        content: '❌ No active timer in this channel. Use `/timer start` to begin one.',
        ephemeral: true,
      });
    }

    if (timer.userId !== interaction.user.id && !isAdmin(interaction.member)) {
      return await interaction.reply({
        content: '❌ Only the person who started the timer or server administrators/moderators can change its auto-stop settings.',
        ephemeral: true,
      });
    }

    if (action === 'disable') {
      // Disable auto-stop
      if (!timer.duration && !timer.endTime) {
        return await interaction.reply({
          content: '❌ This timer does not have auto-stop enabled. It already requires manual stopping.',
          ephemeral: true,
        });
      }
      
      const success = disableTimerAutostop(channelId);
      
      if (!success) {
        return await interaction.reply({
          content: '❌ Failed to disable auto-stop for this timer.',
          ephemeral: true,
        });
      }
      
      const embed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('🚫 Auto-Stop Disabled')
        .setDescription(timer.label ? `**${timer.label}**\n\nAuto-stop has been disabled.` : 'Auto-stop has been disabled.')
        .addFields(
          {
            name: 'Timer Status',
            value: 'Timer will continue running until manually stopped',
            inline: false,
          },
          {
            name: 'Time Elapsed',
            value: timer.elapsedFormatted,
            inline: true,
          },
          {
            name: 'Started by',
            value: timer.username,
            inline: true,
          }
        )
        .setFooter({ text: 'Use /timer stop to end the timer when finished' })
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed] });
      
    } else if (action === 'enable') {
      // Enable auto-stop
      if (!duration) {
        return await interaction.reply({
          content: '❌ You must specify a `duration` parameter when enabling auto-stop (e.g., `duration:140` for 2h 20m).',
          ephemeral: true,
        });
      }

      if (timer.duration && timer.endTime) {
        return await interaction.reply({
          content: '❌ This timer already has auto-stop enabled. Use `/timer adjust duration:[minutes]` to change the duration.',
          ephemeral: true,
        });
      }

      const guildConfig = await loadGuildConfig(interaction.guildId);
      const clampedDuration = clampTimerDuration(duration, guildConfig);
      const wasClamped = clampedDuration !== duration;

      const result = adjustTimerDuration(channelId, clampedDuration, interaction.client);

      if (!result || result.error) {
        const errorMsg = result?.message || 'Failed to enable auto-stop for this timer.';
        return await interaction.reply({
          content: `❌ ${errorMsg}`,
          ephemeral: true,
        });
      }

      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('✅ Auto-Stop Enabled')
        .setDescription(timer.label ? `**${timer.label}**\n\nAuto-stop has been enabled.` : 'Auto-stop has been enabled.')
        .addFields(
          {
            name: 'Total Duration',
            value: `${clampedDuration} minutes (${formatRuntime(clampedDuration)})`,
            inline: true,
          },
          {
            name: 'Time Elapsed',
            value: result.elapsedFormatted,
            inline: true,
          },
          {
            name: 'Time Remaining',
            value: result.remainingFormatted,
            inline: true,
          }
        )
        .setFooter({
          text: wasClamped
            ? `Capped at this server's ${clampedDuration}-minute max (use /eggshen-config settings max-timer-duration to change)`
            : 'Timer will automatically stop when duration is reached',
        })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }
  }
}

/**
 * Start timer countdown and begin timer (always posts publicly to channel)
 * Exported function that can be called from selectHandler
 * @param {object} interaction - Discord interaction
 * @param {string} channelId - Channel ID
 * @param {string} userId - User ID
 * @param {string} username - Username
 * @param {string} label - Timer label
 * @param {number} duration - Duration in minutes (optional)
 * @param {string} theme - Timer theme (modern/classic)
 * @param {object} guildConfig - Guild config, used to resolve the fallback duration cap when none was detected
 * @param {boolean} fromSelection - Deprecated parameter (always posts publicly now)
 */
export async function startTimerCountdown(interaction, channelId, userId, username, label, duration, theme, guildConfig, fromSelection = false) {
  // Check if timer already exists
  const existingTimer = getTimerStatus(channelId);
  if (existingTimer) {
    const embed = new EmbedBuilder()
      .setColor(0xFF9900)
      .setTitle('⚠️ Timer Already Running')
      .setDescription('There is already an active timer in this channel.')
      .addFields(
        {
          name: 'Current Timer',
          value: existingTimer.label || 'No label',
          inline: true,
        },
        {
          name: 'Elapsed Time',
          value: existingTimer.elapsedFormatted,
          inline: true,
        },
        {
          name: 'Started by',
          value: existingTimer.username,
          inline: true,
        }
      )
      .setFooter({ text: 'Use /timer stop to end the current timer first' });

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // No real duration was detected or provided (no label, search found
  // nothing, or the user chose "Skip" from the selection menu) — rather than
  // running forever unnoticed, fall back to the server's configured safety
  // cap so the timer actually has an end, and flag it as a fallback so
  // timerScheduler.js knows to warn before it silently expires. A duration
  // that WAS detected/provided (even if later clamped down to the cap) is a
  // real, informed value and never gets flagged this way.
  //
  // If the server has disabled the cap entirely (unlimited:true), there's no
  // fallback value to apply — the timer just runs with no duration, same as
  // /timer autostop disable, and isFallbackDuration stays false since there's
  // no endTime for the scheduler to warn against anyway.
  const isFallbackDuration = !duration && guildConfig?.maxTimerDurationUnlimited !== true;
  if (isFallbackDuration) {
    duration = guildConfig?.maxTimerDurationMinutes || 360;
  }

  // If coming from selection menu, dismiss the ephemeral message and post publicly
  // Always post countdown publicly to channel (not ephemeral)
  // Dismiss the ephemeral interaction reply first
  try {
    await interaction.editReply({ content: '⏱️ Starting timer...', embeds: [], components: [] });
  } catch (error) {
    // If edit fails, ignore - might already be deleted
  }
  
  // Post countdown publicly to channel
  const channel = interaction.channel;
  const titleLine = label ? `**${label}**` : '**The Overlord of Time**';
  
  if (theme === 'classic') {
      // Classic theme - post to channel
      let message = await channel.send(`${titleLine} **COUNTDOWN STARTING**`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await message.edit(`${titleLine} **COUNTDOWN STARTING**\n${titleLine} **HIT PLAY AT** 🚨**:regional_indicator_g::regional_indicator_o:**🚨`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const countdownMessages = [
        `${titleLine} **COUNTDOWN STARTING**\n${titleLine} **HIT PLAY AT** 🚨**:regional_indicator_g::regional_indicator_o:**🚨\n${titleLine} :five:`,
        `${titleLine} **COUNTDOWN STARTING**\n${titleLine} **HIT PLAY AT** 🚨**:regional_indicator_g::regional_indicator_o:**🚨\n${titleLine} :five:\n${titleLine} :four:`,
        `${titleLine} **COUNTDOWN STARTING**\n${titleLine} **HIT PLAY AT** 🚨**:regional_indicator_g::regional_indicator_o:**🚨\n${titleLine} :five:\n${titleLine} :four:\n${titleLine} :three:`,
        `${titleLine} **COUNTDOWN STARTING**\n${titleLine} **HIT PLAY AT** 🚨**:regional_indicator_g::regional_indicator_o:**🚨\n${titleLine} :five:\n${titleLine} :four:\n${titleLine} :three:\n${titleLine} :two:`,
        `${titleLine} **COUNTDOWN STARTING**\n${titleLine} **HIT PLAY AT** 🚨**:regional_indicator_g::regional_indicator_o:**🚨\n${titleLine} :five:\n${titleLine} :four:\n${titleLine} :three:\n${titleLine} :two:\n${titleLine} :one:`,
        `${titleLine} **COUNTDOWN STARTING**\n${titleLine} **HIT PLAY AT** 🚨**:regional_indicator_g::regional_indicator_o:**🚨\n${titleLine} :five:\n${titleLine} :four:\n${titleLine} :three:\n${titleLine} :two:\n${titleLine} :one:\n${titleLine} 🚨**:regional_indicator_g::regional_indicator_o:**🚨`,
        `${titleLine} **COUNTDOWN STARTING**\n${titleLine} **HIT PLAY AT** 🚨**:regional_indicator_g::regional_indicator_o:**🚨\n${titleLine} :five:\n${titleLine} :four:\n${titleLine} :three:\n${titleLine} :two:\n${titleLine} :one:\n${titleLine} 🚨**:regional_indicator_g::regional_indicator_o:**🚨\n${titleLine} **Timer started**`
      ];
      
      for (const msg of countdownMessages) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await message.edit(msg);
      }
      
      startTimer(channelId, userId, username, label, duration, interaction.client, isFallbackDuration);
      return;
      
    } else {
      // Modern theme - post to channel
      const countdownSteps = [
        { num: 5, color: 0xFF0000, emoji: '🔴', blocks: '🟥🟥🟥🟥🟥' },
        { num: 4, color: 0xFF4400, emoji: '🟠', blocks: '🟧🟧🟧🟧⬜' },
        { num: 3, color: 0xFF8800, emoji: '🟡', blocks: '🟨🟨🟨⬜⬜' },
        { num: 2, color: 0xFFCC00, emoji: '🟢', blocks: '🟩🟩⬜⬜⬜' },
        { num: 1, color: 0x00FF00, emoji: '🟢', blocks: '🟩⬜⬜⬜⬜' },
      ];
      
      const countdownEmbed = new EmbedBuilder()
        .setColor(countdownSteps[0].color)
        .setTitle(`${countdownSteps[0].emoji} STARTING TIMER ${countdownSteps[0].emoji}`)
        .setDescription(`# ${countdownSteps[0].num}\n${countdownSteps[0].blocks}`)
        .setFooter({ text: '🎬 Get ready!' });
      
      let message = await channel.send({ embeds: [countdownEmbed] });
      
      for (let i = 1; i < countdownSteps.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const step = countdownSteps[i];
        countdownEmbed
          .setColor(step.color)
          .setTitle(`${step.emoji} STARTING TIMER ${step.emoji}`)
          .setDescription(`# ${step.num}\n${step.blocks}`);
        await message.edit({ embeds: [countdownEmbed] });
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      countdownEmbed
        .setColor(0x00FF00)
        .setTitle('🎬 🎥 🍿 GO! 🍿 🎥 🎬')
        .setDescription('# 🟢 START!\n🟩🟩🟩🟩🟩\n\n**Timer is now running!**')
        .setFooter({ text: '⏱️ Timer started!' });
      await message.edit({ embeds: [countdownEmbed] });
      
      startTimer(channelId, userId, username, label, duration, interaction.client, isFallbackDuration);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const timerFields = [{
        name: 'Started by',
        value: `<@${userId}>`,
        inline: true,
      }];

      // A fallback duration (nothing typed, nothing detected) is an internal
      // auto-stop safety net only — not shown as if it were a real, known
      // duration. It still auto-stops and warns; it's just not displayed.
      if (duration && !isFallbackDuration) {
        timerFields.push({
          name: 'Duration',
          value: `${duration} minutes (auto-stop enabled)`,
          inline: true,
        });
      }

      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('⏱️ Timer Started 🟩')
        .setDescription(label ? `**${label}**` : 'Timer is now running')
        .addFields(timerFields)
        .setFooter({ text: (duration && !isFallbackDuration) ? 'Timer will auto-stop when complete' : 'Use /timer stop to end the timer' })
        .setTimestamp();

      await message.edit({ embeds: [embed] });
      return;
    }
}

/**
 * Automatically log timer to watch history
 * @param {object} interaction - Discord interaction
 * @param {string} title - Timer title/label
 * @param {string} elapsedTime - Formatted elapsed time
 * @param {string} startedBy - Username who started timer
 * @param {string} stoppedBy - Username who stopped timer
 * @param {string} channelId - Channel ID
 */
async function autoLogTimerToWatchHistory(interaction, title, elapsedTime, startedBy, stoppedBy, channelId, starterUserId) {
  // Defer reply
  await interaction.deferReply();
  
  try {
    const { searchMovies, searchTVShows, getMovieDetails, getTVShowDetails } = await import('../services/tmdbService.js');
    const { saveWatchHistory } = await import('../utils/watchHistoryManager.js');
    const { trackSearch } = await import('../utils/statsTracker.js');
    
    // Search for the title
    const [movieResults, tvResults] = await Promise.all([
      searchMovies(title),
      searchTVShows(title),
    ]);
    
    const allResults = [
      ...(movieResults || []).map(r => ({ ...r, type: 'movie' })),
      ...(tvResults || []).map(r => ({ ...r, type: 'tv' })),
    ];
    
    if (allResults.length === 0) {
      // Could not find title - show timer stopped message with manual log button
      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('⏹️ Timer Stopped 🛑')
        .setDescription(`**${title}**\n\n⚠️ Could not find this title on TMDB to log automatically.`)
        .addFields(
          {
            name: 'Total Time',
            value: elapsedTime,
            inline: true,
          },
          {
            name: 'Started by',
            value: startedBy,
            inline: true,
          },
          {
            name: 'Stopped by',
            value: stoppedBy,
            inline: true,
          }
        )
        .setFooter({ text: 'Use the button below to manually log to watch history • Only timer starter/mods/admins can log' })
        .setTimestamp();
      
      // Add button for manual logging (timer starter/mods/admins only)
      const button = new ButtonBuilder()
        .setCustomId(`log_watched_${channelId}_${starterUserId}`)
        .setLabel('Log to Watch History')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📝');

      const row = new ActionRowBuilder().addComponents(button);
      
      await interaction.editReply({ embeds: [embed], components: [row] });
      return;
    }
    
    // Use the first result
    const result = allResults[0];
    const details = result.type === 'movie' 
      ? await getMovieDetails(result.id)
      : await getTVShowDetails(result.id);
    
    const fullTitle = details.title || details.name;
    const year = details.release_date || details.first_air_date;
    const yearStr = year ? year.split('-')[0] : '';
    const posterPath = details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : null;
    
    // Save to watch history
    await saveWatchHistory(interaction.guildId, {
      tmdbId: result.id,
      type: result.type,
      title: fullTitle,
      year: yearStr,
      notes: `Watch party timer: ${elapsedTime}`,
      savedBy: stoppedBy,
      savedById: interaction.user.id,
      watchedAt: Date.now(),
      channelId: channelId,
      channelName: interaction.channel?.name || 'Unknown Channel',
    });
    
    // Track in stats
    await trackSearch(
      interaction.guildId,
      interaction.user.id,
      stoppedBy,
      'watched',
      fullTitle,
      yearStr
    );
    
    // Build confirmation embed
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('⏹️ Timer Stopped & Logged 🛑📝')
      .setDescription(`**${fullTitle}** (${yearStr})\n\n✅ Automatically logged to watch history`)
      .addFields(
        {
          name: 'Total Time',
          value: elapsedTime,
          inline: true,
        },
        {
          name: 'Type',
          value: result.type === 'movie' ? 'Movie' : 'TV Show',
          inline: true,
        },
        {
          name: 'Channel',
          value: `<#${channelId}>`,
          inline: true,
        },
        {
          name: 'Started by',
          value: startedBy,
          inline: true,
        },
        {
          name: 'Stopped by',
          value: stoppedBy,
          inline: true,
        }
      )
      .setFooter({ text: 'Use /watched history to view watch history • Use button to manually log again • Use /timer start to begin a new timer' })
      .setTimestamp();
    
    if (posterPath) {
      embed.setThumbnail(posterPath);
    }
    
    // Add button for manual override (timer starter/mods/admins only)
    const button = new ButtonBuilder()
      .setCustomId(`log_watched_${channelId}_${starterUserId}`)
      .setLabel('Log to Watch History')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📝');

    const row = new ActionRowBuilder().addComponents(button);
    
    await interaction.editReply({ embeds: [embed], components: [row] });
    
  } catch (error) {
    console.error('[Timer] Error auto-logging to watch history:', error);
    
    // Show timer stopped message with error
    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('⏹️ Timer Stopped 🛑')
      .setDescription(`**${title}**\n\n❌ Error logging to watch history: ${error.message}`)
      .addFields(
        {
          name: 'Total Time',
          value: elapsedTime,
          inline: true,
        },
        {
          name: 'Started by',
          value: startedBy,
          inline: true,
        },
        {
          name: 'Stopped by',
          value: stoppedBy,
          inline: true,
        }
      )
      .setFooter({ text: 'Use the button below to manually log to watch history • Only timer starter/mods/admins can log' })
      .setTimestamp();
    
    // Add button for manual logging (timer starter/mods/admins only)
    const button = new ButtonBuilder()
      .setCustomId(`log_watched_${channelId}_${starterUserId}`)
      .setLabel('Log to Watch History')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📝');

    const row = new ActionRowBuilder().addComponents(button);
    
    await interaction.editReply({ embeds: [embed], components: [row] });
  }
}

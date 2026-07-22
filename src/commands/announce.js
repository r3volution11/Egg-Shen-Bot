import { SlashCommandBuilder } from 'discord.js';
import {
  searchMovies,
  searchTVShows,
  getMovieDetails,
  getTVShowDetails,
  getUnifiedMovieWatchProviders,
  getUnifiedTVWatchProviders,
} from '../services/tmdbService.js';
import { hybridSearch, generateAnnouncementText } from '../services/aiService.js';
import { normalizeProviders } from '../utils/embedBuilder.js';
import { isAdmin, loadGuildConfig } from '../utils/guildConfig.js';

export const data = new SlashCommandBuilder()
  .setName('announce')
  .setDescription('Generate watch party announcement text for you to copy and post (Admin/Moderator only)')
  .addStringOption(option =>
    option
      .setName('title1')
      .setDescription('First movie or TV show title')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('episodes1')
      .setDescription('Episode(s) for title1 if it\'s a TV show (e.g. "S3E9-E12", "Season 3 Episode 9")')
      .setRequired(false)
  )
  .addStringOption(option =>
    option
      .setName('title2')
      .setDescription('Second movie or TV show title, if watching two things back-to-back')
      .setRequired(false)
  )
  .addStringOption(option =>
    option
      .setName('episodes2')
      .setDescription('Episode(s) for title2 if it\'s a TV show')
      .setRequired(false)
  )
  .addStringOption(option =>
    option
      .setName('time')
      .setDescription('Start time to include in the announcement (e.g. "8:00 PM EST")')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('host')
      .setDescription('Who\'s hosting (a name, persona, or @mention) — optional')
      .setRequired(false)
  )
  .addStringOption(option =>
    option
      .setName('tone')
      .setDescription('Tone for the announcement')
      .setRequired(false)
      .addChoices(
        { name: 'Funny', value: 'funny' },
        { name: 'Scary', value: 'scary' },
        { name: 'Dramatic', value: 'dramatic' },
        { name: 'Wholesome', value: 'wholesome' },
        { name: 'Mysterious', value: 'mysterious' }
      )
  )
  .addStringOption(option =>
    option
      .setName('custom-tone')
      .setDescription('Custom tone/style instead of the preset list (e.g. "like a noir detective") — overrides tone')
      .setRequired(false)
  );

/**
 * Resolve a title to its TMDB details + streaming availability, or null if
 * nothing was found. Always uses the top search result — /announce's output
 * is a one-shot ephemeral reply, so there's no picker step for ambiguous
 * titles (matches the command's intentionally minimal scope).
 */
async function resolveSegment(title, episodes, region) {
  const [movieResults, tvResults] = await Promise.all([
    hybridSearch(title, searchMovies, 'movie'),
    hybridSearch(title, searchTVShows, 'tv'),
  ]);

  // If episodes were given, prefer a TV match (that's clearly the intent);
  // otherwise prefer whichever type matched first/best.
  const preferTV = !!episodes;
  const tvMatch = tvResults?.[0];
  const movieMatch = movieResults?.[0];
  const type = preferTV && tvMatch ? 'tv' : (movieMatch ? 'movie' : (tvMatch ? 'tv' : null));

  if (!type) {
    return null;
  }

  if (type === 'movie') {
    const details = await getMovieDetails(movieMatch.id);
    const imdbId = details.external_ids?.imdb_id;
    const watchProviders = await getUnifiedMovieWatchProviders(movieMatch.id, imdbId, region);
    return {
      type: 'movie',
      title: details.title,
      overview: details.overview,
      episodes: null,
      streamingText: buildStreamingLine(watchProviders),
    };
  }

  const details = await getTVShowDetails(tvMatch.id);
  const imdbId = details.external_ids?.imdb_id;
  const watchProviders = await getUnifiedTVWatchProviders(tvMatch.id, imdbId, region);
  return {
    type: 'tv',
    title: details.name,
    overview: details.overview,
    episodes: episodes || null,
    streamingText: buildStreamingLine(watchProviders),
  };
}

/**
 * Build a single "Available to stream on X, Y" line from unified watch
 * provider data — a shorter, single-line variant of embedBuilder.js's
 * buildStreamingText (which includes rent/buy/link sections not wanted here).
 */
function buildStreamingLine(watchProviders) {
  if (!watchProviders?.flatrate || watchProviders.flatrate.length === 0) {
    return null;
  }
  // Cap at 4 services for a clean single line — TMDB/Watchmode often list many
  // near-duplicate storefronts (e.g. "Amazon Prime Video" vs "Prime Video");
  // showing all of them would read as noise rather than a helpful summary.
  const services = normalizeProviders(watchProviders.flatrate).slice(0, 4).join(' and ');
  return `Available to stream on ${services}`;
}

/**
 * Plain, non-AI fallback template used when OpenAI is unavailable or the
 * generation call fails, so the command still returns something useful.
 */
function buildFallbackText(segments, timeText, host) {
  const titles = segments.map(s => s.episodes ? `*${s.title}* (${s.episodes})` : `*${s.title}*`).join(' and ');
  const hostLine = host ? ` Hosted by ${host}.` : '';
  return `Join us for a watch party! Tonight we're watching ${titles}.${hostLine}\n\nStarts at **${timeText}**.`;
}

export async function execute(interaction) {
  if (!isAdmin(interaction.member)) {
    await interaction.reply({
      content: '❌ You need Administrator, Manage Server, or Moderator permissions to use `/announce`.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const title1 = interaction.options.getString('title1');
  const episodes1 = interaction.options.getString('episodes1');
  const title2 = interaction.options.getString('title2');
  const episodes2 = interaction.options.getString('episodes2');
  const timeText = interaction.options.getString('time');
  const host = interaction.options.getString('host');
  const tone = interaction.options.getString('tone');
  const customTone = interaction.options.getString('custom-tone');

  try {
    const guildConfig = await loadGuildConfig(interaction.guildId);
    const region = guildConfig.region || 'US';

    const segmentInputs = [{ title: title1, episodes: episodes1 }];
    if (title2) {
      segmentInputs.push({ title: title2, episodes: episodes2 });
    }

    const resolvedSegments = await Promise.all(
      segmentInputs.map(s => resolveSegment(s.title, s.episodes, region))
    );

    const notFound = segmentInputs
      .map((s, i) => (resolvedSegments[i] ? null : s.title))
      .filter(Boolean);

    if (notFound.length > 0) {
      await interaction.editReply({
        content: `❌ Couldn't find: ${notFound.map(t => `**${t}**`).join(', ')}. Check the spelling and try again.`,
      });
      return;
    }

    const flavorText = await generateAnnouncementText({
      segments: resolvedSegments,
      tone,
      customTone,
      timeText,
      host,
    });

    const bodyText = flavorText || buildFallbackText(resolvedSegments, timeText, host);
    const streamingLines = resolvedSegments
      .map(s => s.streamingText)
      .filter(Boolean)
      .join('\n');

    const factualLines = [
      `Starts at **${timeText}**${host ? ` • Hosted by ${host}` : ''}`,
      streamingLines || null,
    ].filter(Boolean).join('\n');

    const finalText = `${bodyText}\n\n${factualLines}`;

    await interaction.editReply({
      content: `📋 Here's your announcement — copy the text below and post it wherever you'd like:\n\`\`\`\n${finalText}\n\`\`\`${flavorText ? '' : '\n⚠️ AI generation was unavailable, so this is a plain template instead.'}`,
    });
  } catch (error) {
    console.error('Announce command error:', error);
    await interaction.editReply({
      content: '❌ An error occurred while generating the announcement. Please try again later.',
    });
  }
}

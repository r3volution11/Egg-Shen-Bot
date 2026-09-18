/**
 * /recommend — what should we watch next, based on what this server watches.
 *
 * Every option is optional. A bare `/recommend` works; so does
 * `/recommend type:TV source:most-watched genre:Horror decade:1980s`. Filters
 * are slash options rather than a chain of select menus so that one command
 * reaches results in a single round-trip, while Discord's own option hints
 * keep the filters discoverable.
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { canUseCommand } from '../utils/guildConfig.js';
import { getWatchHistory } from '../utils/watchHistoryManager.js';
import {
  getGenres,
  searchPeople,
  getPersonById,
  discoverTitles,
  getMovieDetails,
  getTVShowDetails,
} from '../services/tmdbService.js';
import { generateRecommendationRanking } from '../services/aiService.js';
import { getIMDbUrl, getLetterboxdUrl } from '../services/urlService.js';
import { trackSearch } from '../utils/statsTracker.js';
import { deliverResult } from '../utils/interactionResponse.js';
import {
  aggregateWatchHistory,
  sortByAffinity,
  pickSeeds,
  gatherCandidates,
  excludeWatched,
  filterByGenre,
  filterByDecade,
  scoreCandidates,
} from '../utils/recommendationEngine.js';
import { titleHasGenre } from '../utils/genreCache.js';

const RESULT_COUNT = 5;
const AI_POOL_SIZE = 15;

// Reading the whole history is the point — the default limit of 10 would
// aggregate only the ten most recent watches.
const FULL_HISTORY = 10000;

const DECADES = ['1950', '1960', '1970', '1980', '1990', '2000', '2010', '2020'];

export const data = new SlashCommandBuilder()
  .setName('recommend')
  .setDescription('Get watch recommendations based on what this server watches')
  .addStringOption(option =>
    option
      .setName('type')
      .setDescription('Movies or TV shows (default: both)')
      .setRequired(false)
      .addChoices(
        { name: 'Movies', value: 'movie' },
        { name: 'TV Shows', value: 'tv' }
      )
  )
  .addStringOption(option =>
    option
      .setName('source')
      .setDescription('Where recommendations come from (default: your watch history)')
      .setRequired(false)
      .addChoices(
        { name: 'Watch History - new picks based on what you watch', value: 'history' },
        { name: 'Most Watched - what this server rewatches', value: 'most-watched' },
        { name: 'Discover - browse TMDB by filter', value: 'discover' }
      )
  )
  .addStringOption(option =>
    option
      .setName('genre')
      .setDescription('Filter by genre')
      .setRequired(false)
      .setAutocomplete(true)
  )
  .addStringOption(option =>
    option
      .setName('decade')
      .setDescription('Filter by decade')
      .setRequired(false)
      .addChoices(...DECADES.map(d => ({ name: `${d}s`, value: d })))
  )
  .addStringOption(option =>
    option
      .setName('director')
      .setDescription('Filter by director or cast member')
      .setRequired(false)
      .setAutocomplete(true)
  )
  .addBooleanOption(option =>
    option
      .setName('private')
      .setDescription('Only show the result to you instead of the whole channel (default: false)')
      .setRequired(false)
  );

/**
 * Autocomplete for the `genre` and `director` options.
 *
 * Genres are served from the cached TMDB list — this fires on every
 * keystroke, so it must never make a request per character. Person search
 * does hit the API, so it waits for enough characters to be worth asking.
 */
export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  const query = (focused.value || '').toLowerCase();

  try {
    if (focused.name === 'genre') {
      // Genres differ by media type — TV has no Horror or Romance at all,
      // so offering them there would produce guaranteed-empty results.
      const type = interaction.options.getString('type');
      const lists = type
        ? [await getGenres(type)]
        : await Promise.all([getGenres('movie'), getGenres('tv')]);

      const seen = new Map();
      for (const genre of lists.flat()) {
        if (!seen.has(genre.name)) seen.set(genre.name, genre);
      }

      const matches = [...seen.values()]
        .filter(genre => genre.name.toLowerCase().includes(query))
        .slice(0, 25);

      await interaction.respond(
        matches.map(genre => ({ name: genre.name.substring(0, 100), value: String(genre.id) }))
      );
      return;
    }

    if (focused.name === 'director') {
      if (query.length < 3) {
        await interaction.respond([]);
        return;
      }

      const people = await searchPeople(query);
      await interaction.respond(
        people.slice(0, 25).map(person => ({
          name: `${person.name}${person.known_for_department ? ` — ${person.known_for_department}` : ''}`.substring(0, 100),
          value: String(person.id),
        }))
      );
      return;
    }

    await interaction.respond([]);
  } catch (error) {
    console.error('[Recommend] Autocomplete error:', error.message);
    // Discord shows "no options" rather than an error if we respond empty.
    await interaction.respond([]).catch(() => {});
  }
}

/** Resolve a TMDB person id to a display name, or null. */
async function getPersonName(personId) {
  const person = await getPersonById(personId);
  return person?.name || null;
}

/** Human-readable summary of the active filters, for the embed and the AI. */
async function describeFilters({ type, genreId, decade, personName }) {
  const parts = [];
  if (type) parts.push(type === 'tv' ? 'TV' : 'Movies');

  if (genreId) {
    const lists = await Promise.all([getGenres('movie'), getGenres('tv')]);
    const match = lists.flat().find(g => String(g.id) === String(genreId));
    parts.push(match ? match.name : 'Genre');
  }

  if (decade) parts.push(`${decade}s`);
  if (personName) parts.push(personName);

  return parts.join(' · ');
}

/**
 * Attach IMDb (and, for movies, Letterboxd) links to the final picks.
 *
 * Only the handful actually being shown get a details call. A failure leaves
 * the entry linkless rather than dropping it.
 */
async function attachLinks(picks) {
  return Promise.all(picks.map(async pick => {
    try {
      const details = pick.type === 'movie'
        ? await getMovieDetails(pick.id)
        : await getTVShowDetails(pick.id);

      const imdbId = details?.external_ids?.imdb_id;
      return {
        ...pick,
        imdbUrl: getIMDbUrl(imdbId),
        // Letterboxd only catalogues films — every TV path in this codebase
        // passes null by design.
        letterboxdUrl: pick.type === 'movie' ? getLetterboxdUrl(imdbId) : null,
      };
    } catch (error) {
      return { ...pick, imdbUrl: null, letterboxdUrl: null };
    }
  }));
}

/** Normalize a TMDB list result into what the embed needs. */
function toPick(result, type) {
  return {
    id: result.id,
    type,
    title: result.title || result.name || 'Unknown',
    year: String(result.release_date || result.first_air_date || '').slice(0, 4),
    rating: result.vote_average ? Number(result.vote_average).toFixed(1) : null,
    overview: result.overview || '',
  };
}

/** Build the result embed shared by every source. */
function buildEmbed({ title, description, picks, footer }) {
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(title.substring(0, 256))
    .setFooter({ text: footer.substring(0, 2048) })
    .setTimestamp();

  if (description) {
    embed.setDescription(description.substring(0, 4096));
  }

  for (const [index, pick] of picks.entries()) {
    const links = [
      pick.imdbUrl ? `[IMDb](${pick.imdbUrl})` : null,
      pick.letterboxdUrl ? `[Letterboxd](${pick.letterboxdUrl})` : null,
    ].filter(Boolean);

    const lines = [
      [pick.rating ? `⭐ ${pick.rating}/10` : null, links.join(' · ') || null]
        .filter(Boolean).join(' · '),
      pick.playCount >= 2 ? `▶️ ${pick.playCount} plays` : null,
      pick.reason ? `*${pick.reason}*` : null,
    ].filter(Boolean);

    embed.addFields({
      name: `${index + 1}. ${pick.title}${pick.year ? ` (${pick.year})` : ''}`.substring(0, 256),
      value: (lines.join('\n') || '​').substring(0, 1024),
      inline: false,
    });
  }

  return embed;
}

/**
 * "Most Watched" — pure arithmetic over local history, no TMDB ranking.
 *
 * On a server where nothing has been rewatched yet, a "most watched" list is
 * just an arbitrary ordering of things watched once. Rather than present that
 * as a ranking, this says what it actually is and shows recency instead.
 */
async function buildMostWatched({ guildId, type, genreId, filterText }) {
  const mediaType = type || 'all';
  const entries = await getWatchHistory(guildId, mediaType, FULL_HISTORY);
  const aggregate = aggregateWatchHistory(entries);

  if (aggregate.list.length === 0) {
    return { empty: 'Nothing has been logged yet. Use `/watched add` (or start a `/timer`) to build up some history.' };
  }

  const ranked = sortByAffinity(aggregate.list);
  const isRanking = aggregate.repeatCount > 0;

  // Filtering by genre needs each title's genres, which history doesn't
  // store — so walk in order and stop early rather than resolving all of them.
  let selected = [];
  if (genreId) {
    let looked = 0;
    for (const item of ranked) {
      if (selected.length >= RESULT_COUNT || looked >= 25) break;
      looked += 1;
      if (await titleHasGenre(item.type, item.tmdbId, genreId)) {
        selected.push(item);
      }
    }
  } else {
    selected = ranked.slice(0, RESULT_COUNT);
  }

  if (selected.length === 0) {
    return { empty: `No watched titles match ${filterText || 'that filter'} yet.` };
  }

  const picks = await attachLinks(selected.map(item => ({
    id: item.tmdbId,
    type: item.type,
    title: item.title,
    year: item.year,
    playCount: item.count,
    rating: null,
  })));

  const tiedAtTop = ranked.filter(item => item.count === aggregate.maxCount).length;
  const description = isRanking
    ? (tiedAtTop > 1 ? `${tiedAtTop} titles are tied at the top.` : null)
    : 'Nothing has been watched more than once yet, so here\'s what the server watched most recently.';

  const label = type === 'tv' ? 'Shows' : type === 'movie' ? 'Movies' : 'Titles';

  return {
    title: `${isRanking ? '🏆 Most Watched' : '🕒 Recently Watched'} ${label}${filterText ? ` · ${filterText}` : ''}`,
    description,
    picks,
    footer: `${aggregate.list.length} distinct titles logged`,
  };
}

/**
 * "Watch History" — TMDB similar titles seeded from what the server watches,
 * then re-ranked by AI for tonal fit.
 */
async function buildFromHistory({ guildId, type, genreId, decade, filterText }) {
  const mediaType = type || 'all';
  const entries = await getWatchHistory(guildId, mediaType, FULL_HISTORY);
  const aggregate = aggregateWatchHistory(entries);

  if (aggregate.list.length === 0) {
    return { empty: 'Nothing has been logged yet, so there\'s nothing to base a recommendation on. Try `source:Discover` instead.' };
  }

  const seeds = pickSeeds(aggregate);

  // With no type filter, seed each side from its own history.
  const types = type ? [type] : ['movie', 'tv'];
  const gathered = await Promise.all(
    types.map(t => gatherCandidates(seeds.filter(s => s.type === t), t))
  );

  let candidates = excludeWatched(gathered.flat(), aggregate.watchedKeys);
  candidates = filterByGenre(candidates, genreId);
  candidates = filterByDecade(candidates, decade);

  if (candidates.length === 0) {
    return {
      empty: filterText
        ? `No ${filterText} recommendations came back from what this server has watched. Try fewer filters.`
        : 'Couldn\'t find anything new right now — try again in a moment.',
    };
  }

  const ranked = scoreCandidates(candidates, RESULT_COUNT);
  const pool = ranked.slice(0, AI_POOL_SIZE).map(c => toPick(c, c.type));

  const aiPicks = await generateRecommendationRanking({
    watchedTitles: sortByAffinity(aggregate.list)
      .slice(0, 20)
      .map(item => `${item.title}${item.year ? ` (${item.year})` : ''}`),
    candidates: pool,
    type: type || 'movie',
    filterSummary: filterText,
  });

  const chosen = aiPicks
    ? aiPicks.map(pick => ({ ...pool[pick.index], reason: pick.reason }))
    : pool.slice(0, RESULT_COUNT);

  const picks = await attachLinks(chosen.slice(0, RESULT_COUNT));
  const label = type === 'tv' ? 'Shows' : type === 'movie' ? 'Movies' : 'Picks';

  return {
    title: `✨ New ${label} For This Server${filterText ? ` · ${filterText}` : ''}`,
    description: `Based on ${aggregate.list.length} titles this server has watched.`,
    picks,
    footer: aiPicks
      ? 'Ranked by Egg Shen\'s AI'
      : 'Ranked by popularity and similarity',
  };
}

/** "Discover" — straight TMDB browse by filter, no history needed. */
async function buildDiscover({ type, genreId, decade, personId, filterText }) {
  const types = type ? [type] : ['movie', 'tv'];

  const results = await Promise.all(
    types.map(async t => {
      const found = await discoverTitles(t, { genre: genreId, decade, personId });
      return found.map(result => toPick(result, t));
    })
  );

  const merged = results.flat().slice(0, AI_POOL_SIZE);

  if (merged.length === 0) {
    return {
      empty: personId
        ? `Nothing found for ${filterText || 'that combination'}. TMDB credits TV differently than film, so a director filter can come up empty for shows.`
        : `Nothing found for ${filterText || 'those filters'}. Try loosening one.`,
    };
  }

  const picks = await attachLinks(merged.slice(0, RESULT_COUNT));

  return {
    title: `🔎 Discover${filterText ? ` · ${filterText}` : ''}`,
    description: null,
    picks,
    footer: 'Browsing TMDB by popularity',
  };
}

export async function execute(interaction) {
  const hasPermission = await canUseCommand(interaction.guildId, interaction.member, 'recommend');
  if (!hasPermission) {
    await interaction.reply({
      content: '❌ The `/recommend` command is currently disabled for regular users. Contact a server administrator for more information.',
      ephemeral: true,
    });
    return;
  }

  const type = interaction.options.getString('type');
  const genreId = interaction.options.getString('genre');
  const decade = interaction.options.getString('decade');
  const personId = interaction.options.getString('director');
  const isPrivate = interaction.options.getBoolean('private') || false;
  let source = interaction.options.getString('source');

  // Pickers and errors stay ephemeral; the answer is public unless asked
  // otherwise — matching how every other search command behaves.
  await interaction.deferReply({ ephemeral: true });

  try {
    // A director or decade filter is a browse request, not a taste question —
    // and a brand-new server has no history to reason from.
    if (!source) {
      if (personId) {
        source = 'discover';
      } else {
        const existing = await getWatchHistory(interaction.guildId, type || 'all', 1);
        source = existing.length > 0 ? 'history' : 'discover';
      }
    }

    // Autocomplete hands back a TMDB person id, not a name — look up the
    // name so the embed can say who was filtered on. A raw id typed by hand
    // still works; it just won't be named.
    let personName = null;
    if (personId) {
      personName = await getPersonName(personId);
    }

    const filterText = await describeFilters({ type, genreId, decade, personName });

    let result;
    if (source === 'most-watched') {
      result = await buildMostWatched({ guildId: interaction.guildId, type, genreId, filterText });
    } else if (source === 'discover') {
      result = await buildDiscover({ type, genreId, decade, personId, filterText });
    } else {
      result = await buildFromHistory({ guildId: interaction.guildId, type, genreId, decade, filterText });
    }

    if (result.empty) {
      await interaction.editReply({ content: `📭 ${result.empty}` });
      return;
    }

    const embed = buildEmbed(result);

    // Track only the top pick — five per invocation would skew /stats.
    const top = result.picks[0];
    if (top) {
      await trackSearch(
        interaction.guildId,
        interaction.user.id,
        interaction.user.username,
        'recommend',
        top.title,
        top.year
      ).catch(() => {});
    }

    await deliverResult(interaction, { embeds: [embed] }, isPrivate);
  } catch (error) {
    console.error('[Recommend] Error building recommendations:', error);
    await interaction.editReply({
      content: '❌ Something went wrong building recommendations. Please try again.',
    }).catch(() => {});
  }
}

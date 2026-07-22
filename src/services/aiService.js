import axios from 'axios';
import { config } from '../config.js';

const openaiApi = axios.create({
  baseURL: config.apis.openai.baseUrl,
  headers: {
    'Authorization': `Bearer ${config.apis.openai.apiKey}`,
    'Content-Type': 'application/json',
  },
});

/**
 * Check if OpenAI API is available
 */
export function isOpenAIAvailable() {
  return config.apis.openai.apiKey !== null && config.apis.openai.apiKey !== undefined && config.apis.openai.apiKey !== '';
}

/**
 * Generate embedding for a text string
 * @param {string} text - Text to generate embedding for
 * @returns {Promise<number[]>} Embedding vector
 */
export async function generateEmbedding(text) {
  if (!isOpenAIAvailable()) {
    throw new Error('OpenAI API key not configured');
  }

  try {
    const response = await openaiApi.post('/embeddings', {
      model: config.apis.openai.model,
      input: text,
      encoding_format: 'float',
    });

    return response.data.data[0].embedding;
  } catch (error) {
    console.error('OpenAI embedding error:', error.response?.data || error.message);
    throw new Error('Failed to generate embedding');
  }
}

/**
 * Calculate cosine similarity between two vectors
 * @param {number[]} vecA - First vector
 * @param {number[]} vecB - Second vector
 * @returns {number} Similarity score (0-1, higher is more similar)
 */
export function cosineSimilarity(vecA, vecB) {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magnitudeA += vecA[i] * vecA[i];
    magnitudeB += vecB[i] * vecB[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Create searchable text from media item (movie/TV)
 * @param {Object} item - Media item from TMDB
 * @param {string} type - Type of media ('movie' or 'tv')
 * @returns {string} Searchable text combining title, overview, genres, etc.
 */
export function createSearchableText(item, type = 'movie') {
  const title = type === 'movie' ? item.title : item.name;
  const releaseDate = type === 'movie' ? item.release_date : item.first_air_date;
  const year = releaseDate ? new Date(releaseDate).getFullYear() : '';
  
  // Combine relevant fields into searchable text
  const parts = [
    title,
    year ? `(${year})` : '',
    item.overview || '',
  ].filter(Boolean);

  return parts.join(' ').trim();
}

/**
 * Normalize a title for loose comparison: lowercase, strip punctuation/extra
 * whitespace. Used to decide whether a search's top result already matches
 * the user's query well enough that an AKA lookup isn't worth the extra
 * TMDB requests.
 */
function normalizeTitle(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function titlesLooselyMatch(a, b) {
  const normA = normalizeTitle(a);
  const normB = normalizeTitle(b);
  if (!normA || !normB) return false;
  return normA.includes(normB) || normB.includes(normA);
}

/**
 * Some movies/TV shows are far better known by an alternate/reissue title
 * than the primary title TMDB has on file (e.g. "Day of the Woman" (1978)
 * is TMDB's title of record for what was actually distributed, and is
 * still widely known, as "I Spit on Your Grave"). TMDB's own /search
 * ranking doesn't account for this, so a query matching only an AKA can
 * come back buried or missing entirely from the top of the results.
 *
 * If the top keyword result doesn't already loosely match the query, this
 * checks the alternative titles of the next several candidates and — if
 * one of their AKAs matches the query — promotes that result to the front.
 * Bounded to a handful of extra requests, and only runs when the fast path
 * (top result already looks right) fails.
 *
 * @param {string} query - User's search query
 * @param {Array} results - Keyword search results (already ordered)
 * @param {Function} altTitlesFn - async (id) => string[] of AKA titles
 * @param {string} type - 'movie' or 'tv', selects the title field to compare
 * @returns {Promise<Array>} results, possibly with one entry promoted to the front
 */
export async function promoteAlternativeTitleMatch(query, results, altTitlesFn, type = 'movie') {
  if (!results || results.length === 0 || !altTitlesFn) {
    return results;
  }

  const titleField = type === 'movie' ? 'title' : 'name';
  const topTitle = results[0]?.[titleField];

  if (titlesLooselyMatch(query, topTitle)) {
    return results; // Fast path: top result already looks right, skip AKA lookups.
  }

  const candidates = results.slice(0, 10);
  const akaLists = await Promise.all(
    candidates.map(item => altTitlesFn(item.id).catch(() => []))
  );

  const matchIndex = akaLists.findIndex(akas => akas.some(aka => titlesLooselyMatch(query, aka)));

  if (matchIndex <= 0) {
    return results; // No AKA match, or the match was already in front.
  }

  const promoted = [...results];
  const [match] = promoted.splice(matchIndex, 1);
  promoted.unshift(match);
  return promoted;
}

/**
 * Re-rank search results using semantic similarity
 * @param {string} query - User's search query
 * @param {Array} results - Array of search results from TMDB
 * @param {string} type - Type of media ('movie' or 'tv')
 * @returns {Promise<Array>} Re-ranked results with similarity scores
 */
export async function reRankResults(query, results, type = 'movie') {
  if (!isOpenAIAvailable()) {
    console.log('OpenAI not available, skipping semantic re-ranking');
    return results; // Return original results if OpenAI not available
  }

  if (!results || results.length === 0) {
    return results;
  }

  try {
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);

    // Generate embeddings for each result (limit to top 20 for cost efficiency)
    const itemsToRank = results.slice(0, 20);
    const embeddings = await Promise.all(
      itemsToRank.map(async (item) => {
        const searchableText = createSearchableText(item, type);
        try {
          return await generateEmbedding(searchableText);
        } catch (error) {
          console.error(`Failed to generate embedding for: ${searchableText.substring(0, 50)}...`, error.message);
          return null;
        }
      })
    );

    // Calculate similarity scores
    const rankedResults = itemsToRank
      .map((item, index) => {
        if (!embeddings[index]) {
          return { ...item, semanticScore: 0 };
        }
        const similarity = cosineSimilarity(queryEmbedding, embeddings[index]);
        return { ...item, semanticScore: similarity };
      })
      .sort((a, b) => b.semanticScore - a.semanticScore); // Sort by semantic score descending

    // Add remaining unranked results at the end
    const unrankedResults = results.slice(20);
    return [...rankedResults, ...unrankedResults];

  } catch (error) {
    console.error('Semantic re-ranking error:', error.message);
    return results; // Fall back to original results on error
  }
}

/**
 * Discover popular movies/TV shows and rank by semantic similarity
 * Used as fallback when keyword search returns no results
 * @param {string} query - User's descriptive search query
 * @param {string} type - Type of media ('movie' or 'tv')
 * @returns {Promise<Array>} Semantically ranked results
 */
export async function discoverAndRank(query, type = 'movie') {
  if (!isOpenAIAvailable()) {
    return []; // Can't do semantic search without OpenAI
  }

  try {
    // Import TMDB service dynamically to avoid circular dependencies
    const { default: axios } = await import('axios');
    const { config } = await import('../config.js');
    
    const tmdbApi = axios.create({
      baseURL: config.apis.tmdb.baseUrl,
      params: {
        api_key: config.apis.tmdb.apiKey,
      },
    });

    // Get diverse set of movies from multiple sorting strategies for better coverage
    const endpoint = type === 'movie' ? '/discover/movie' : '/discover/tv';
    const results = [];
    
    // Strategy 1: Top rated classics (pages 1-8) - increased for more classics
    for (let page = 1; page <= 8; page++) {
      const response = await tmdbApi.get(endpoint, {
        params: {
          language: 'en-US',
          sort_by: 'vote_average.desc',
          include_adult: false,
          page,
          'vote_count.gte': 1000,
        },
      });
      results.push(...response.data.results);
    }
    
    // Strategy 2: Most popular recent hits (pages 1-5) - increased coverage
    for (let page = 1; page <= 5; page++) {
      const response = await tmdbApi.get(endpoint, {
        params: {
          language: 'en-US',
          sort_by: 'popularity.desc',
          include_adult: false,
          page,
          'vote_count.gte': 100,
        },
      });
      results.push(...response.data.results);
    }
    
    // Strategy 3: 90s-2000s classics (highly rated from that era)
    const response3 = await tmdbApi.get(endpoint, {
      params: {
        language: 'en-US',
        sort_by: 'vote_average.desc',
        include_adult: false,
        'primary_release_date.gte': '1990-01-01',
        'primary_release_date.lte': '2010-12-31',
        'vote_count.gte': 500,
        page: 1,
      },
    });
    results.push(...response3.data.results);

    // Deduplicate by ID
    const seen = new Set();
    const uniqueResults = results.filter(item => {
      const id = item.id;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    console.log(`Fallback semantic search: Ranking ${uniqueResults.length} ${type}s (top-rated + popular + 90s-2000s classics) for query: "${query}"`);

    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);

    // Generate embeddings for all results
    const embeddings = await Promise.all(
      uniqueResults.map(async (item) => {
        const searchableText = createSearchableText(item, type);
        try {
          return await generateEmbedding(searchableText);
        } catch (error) {
          console.error(`Failed to generate embedding for: ${searchableText.substring(0, 50)}...`);
          return null;
        }
      })
    );

    // Calculate similarity scores for all items
    const rankedResults = uniqueResults
      .map((item, index) => {
        if (!embeddings[index]) {
          return { ...item, semanticScore: 0 };
        }
        const similarity = cosineSimilarity(queryEmbedding, embeddings[index]);
        return { ...item, semanticScore: similarity };
      })
      .sort((a, b) => b.semanticScore - a.semanticScore);
    
    console.log(`Top 10 ranked items:`, rankedResults.slice(0, 10).map(r => ({
      title: r.title || r.name,
      score: r.semanticScore?.toFixed(3)
    })));
    
    // Return top 20 matches - always return at least some results for user selection
    // Filter by threshold but ensure we return at least top 20 for selection menu
    const threshold = 0.25;
    const aboveThreshold = rankedResults.filter(item => item.semanticScore >= threshold);
    
    // Return whichever is larger: filtered results or minimum 20 for selection
    const minResults = 20;
    const finalResults = aboveThreshold.length >= minResults 
      ? aboveThreshold.slice(0, 20)
      : rankedResults.slice(0, Math.min(minResults, rankedResults.length));
    
    console.log(`Returning ${finalResults.length} results (${aboveThreshold.length} above threshold ${threshold})`);
    
    return finalResults;

  } catch (error) {
    console.error('Discover and rank error:', error.message);
    return [];
  }
}

/**
 * Hybrid search: keyword search + semantic re-ranking
 * Falls back to semantic discovery if keyword search returns no results
 * @param {string} query - User's search query
 * @param {Function} keywordSearchFn - Function that performs keyword search
 * @param {string} type - Type of media ('movie' or 'tv')
 * @param {Function} [altTitlesFn] - Optional async (id) => string[] of AKA titles,
 *   used to promote a result whose alternate/reissue title matches the query
 *   but whose primary TMDB title doesn't (see promoteAlternativeTitleMatch)
 * @returns {Promise<Array>} Search results (re-ranked if OpenAI available)
 */
export async function hybridSearch(query, keywordSearchFn, type = 'movie', altTitlesFn = null) {
  // First, do the keyword search
  const keywordResults = await keywordSearchFn(query);

  // If we have keyword results, re-rank them if OpenAI is available
  if (keywordResults && keywordResults.length > 0) {
    const ranked = isOpenAIAvailable()
      ? await reRankResults(query, keywordResults, type)
      : keywordResults;

    // AKA match is a stronger, literal signal than semantic similarity —
    // apply it last so it wins regardless of how re-ranking ordered things.
    return await promoteAlternativeTitleMatch(query, ranked, altTitlesFn, type);
  }

  // No keyword results - check if this is a descriptive query that could benefit from semantic search
  const wordCount = query.trim().split(/\s+/).length;
  const isDescriptive = wordCount >= 5; // Queries with 5+ words are likely descriptive

  if (isDescriptive && isOpenAIAvailable()) {
    console.log(`Keyword search returned 0 results for "${query}" - trying semantic fallback`);
    return await discoverAndRank(query, type);
  }

  // No results and can't do semantic search
  return [];
}

// Chat-completions model for free-form text generation (e.g. announcement
// flavor text) — separate from config.apis.openai.model, which is the
// embedding model used for semantic search and stays untouched by this.
const CHAT_MODEL = 'gpt-4o-mini';

/**
 * Generate short, in-character watch-party announcement flavor text via a
 * chat-completion call. The model is asked to write ONLY the promotional
 * hook — factual scheduling details (time, host) are assembled separately
 * by the caller so they're never at the mercy of AI phrasing.
 *
 * @param {Object} params
 * @param {Array<{title: string, type: 'movie'|'tv', overview: string, episodes: string|null}>} params.segments
 *   Up to two titles being watched. `episodes` is free-text like "S3E9-E12" (if given), used as flavor context only.
 * @param {string|null} params.tone - One of the preset tone names (e.g. 'scary'), or null if customTone is used instead
 * @param {string|null} params.customTone - Free-text tone override; takes precedence over `tone` when both are given
 * @param {string} params.timeText - The watch party's start time, used verbatim (e.g. "8:00 PM EST")
 * @param {string|null} params.host - Optional host name/mention to weave in
 * @returns {Promise<string|null>} Generated flavor text, or null if OpenAI is unavailable or the call fails
 */
export async function generateAnnouncementText({ segments, tone, customTone, timeText, host }) {
  if (!isOpenAIAvailable()) {
    return null;
  }

  const toneInstruction = customTone
    ? `Write in this specific tone/style: ${customTone}.`
    : `Write in a ${tone || 'fun, welcoming'} tone.`;

  const segmentDescriptions = segments.map((segment, index) => {
    const label = segment.type === 'tv' && segment.episodes
      ? `${segment.title} (${segment.episodes})`
      : segment.title;
    const overview = segment.overview ? ` Plot: ${segment.overview.substring(0, 400)}` : '';
    return `${index + 1}. ${label}${overview}`;
  }).join('\n');

  const prompt = [
    'You are writing a short, exciting Discord announcement for an upcoming watch party.',
    toneInstruction,
    'Reference the real plot/premise of the title(s) below so the announcement feels specific, not generic.',
    segments.length > 1 ? 'Both titles are being watched back-to-back in the same watch party — mention both.' : '',
    host ? `The watch party is hosted by ${host} — you may reference them if it fits the tone.` : '',
    '',
    'Titles:',
    segmentDescriptions,
    '',
    'Write ONLY the promotional flavor text (1-3 short paragraphs). Do NOT include the start time, a channel name, or streaming availability — those are added separately after your text. Do not use headers or a title, just the announcement body itself.',
  ].filter(Boolean).join('\n');

  try {
    const response = await openaiApi.post('/chat/completions', {
      model: CHAT_MODEL,
      messages: [
        { role: 'system', content: 'You write punchy, in-character promotional announcements for Discord watch party communities.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 400,
      temperature: 0.9,
    });

    const text = response.data.choices?.[0]?.message?.content?.trim();
    return text || null;
  } catch (error) {
    console.error('Announcement text generation error:', error.response?.data || error.message);
    return null;
  }
}

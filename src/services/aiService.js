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

    // Get popular items from multiple pages for better coverage
    const pages = [1, 2, 3]; // Get top ~60 popular items
    const endpoint = type === 'movie' ? '/discover/movie' : '/discover/tv';
    
    const results = [];
    for (const page of pages) {
      const response = await tmdbApi.get(endpoint, {
        params: {
          language: 'en-US',
          sort_by: 'popularity.desc',
          include_adult: false,
          page,
          vote_count_gte: 100, // Ensure items have sufficient votes
        },
      });
      results.push(...response.data.results);
    }

    console.log(`Fallback semantic search: Ranking ${results.length} popular ${type}s for query: "${query}"`);

    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);

    // Generate embeddings for all results (not limited to 20 for fallback search)
    const embeddings = await Promise.all(
      results.map(async (item) => {
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
    const rankedResults = results
      .map((item, index) => {
        if (!embeddings[index]) {
          return { ...item, semanticScore: 0 };
        }
        const similarity = cosineSimilarity(queryEmbedding, embeddings[index]);
        return { ...item, semanticScore: similarity };
      })
      .sort((a, b) => b.semanticScore - a.semanticScore); // Sort by semantic score descending
    
    console.log(`Top 5 ranked items:`, rankedResults.slice(0, 5).map(r => ({
      title: r.title || r.name,
      score: r.semanticScore?.toFixed(3)
    })));
    
    // Return top 20 matches with decent similarity scores
    const threshold = 0.45; // Minimum similarity threshold (lowered from 0.5)
    const filtered = rankedResults.filter(item => item.semanticScore >= threshold);
    console.log(`Found ${filtered.length} items with score >= ${threshold}`);
    
    return filtered.slice(0, 20);

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
 * @returns {Promise<Array>} Search results (re-ranked if OpenAI available)
 */
export async function hybridSearch(query, keywordSearchFn, type = 'movie') {
  // First, do the keyword search
  const keywordResults = await keywordSearchFn(query);

  // If we have keyword results, re-rank them if OpenAI is available
  if (keywordResults && keywordResults.length > 0) {
    if (!isOpenAIAvailable()) {
      return keywordResults;
    }
    return await reRankResults(query, keywordResults, type);
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

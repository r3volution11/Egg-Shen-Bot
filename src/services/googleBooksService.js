import axios from 'axios';
import { config } from '../config.js';

const booksApi = axios.create({
  baseURL: config.apis.googleBooks.baseUrl,
});

/**
 * Search for books using Google Books API
 * @param {string} query - Search query
 * @returns {Promise<Array>} Array of book results
 */
export async function searchBooks(query) {
  try {
    const params = {
      q: query,
      maxResults: 40, // Get more results for better selection
      printType: 'books',
      orderBy: 'relevance',
    };

    // Add API key if configured (optional but recommended for higher rate limits)
    if (config.apis.googleBooks.apiKey) {
      params.key = config.apis.googleBooks.apiKey;
    }

    const response = await axios.get(config.apis.googleBooks.baseUrl, { params });
    
    if (!response.data.items) {
      return [];
    }

    // Map to simplified format
    return response.data.items.map(item => ({
      id: item.id,
      title: item.volumeInfo.title,
      authors: item.volumeInfo.authors || [],
      publishedDate: item.volumeInfo.publishedDate,
      description: item.volumeInfo.description,
      categories: item.volumeInfo.categories || [],
      thumbnail: item.volumeInfo.imageLinks?.thumbnail,
      pageCount: item.volumeInfo.pageCount,
      averageRating: item.volumeInfo.averageRating,
      ratingsCount: item.volumeInfo.ratingsCount,
      language: item.volumeInfo.language,
      previewLink: item.volumeInfo.previewLink,
      infoLink: item.volumeInfo.infoLink,
      canonicalVolumeLink: item.volumeInfo.canonicalVolumeLink,
    }));
  } catch (error) {
    console.error('Google Books search error:', error.message);
    if (error.response?.status === 429) {
      throw new Error('Rate limit exceeded. Please try again in a moment.');
    }
    throw new Error('Failed to search for books');
  }
}

/**
 * Get detailed book information
 * @param {string} bookId - Google Books ID
 * @returns {Promise<Object>} Detailed book information
 */
export async function getBookDetails(bookId) {
  try {
    const params = {};
    
    // Add API key if configured
    if (config.apis.googleBooks.apiKey) {
      params.key = config.apis.googleBooks.apiKey;
    }

    const response = await axios.get(
      `${config.apis.googleBooks.baseUrl}/${bookId}`,
      { params }
    );
    
    const item = response.data;
    const volumeInfo = item.volumeInfo;
    const saleInfo = item.saleInfo;

    return {
      id: item.id,
      title: volumeInfo.title,
      subtitle: volumeInfo.subtitle,
      authors: volumeInfo.authors || [],
      publisher: volumeInfo.publisher,
      publishedDate: volumeInfo.publishedDate,
      description: volumeInfo.description,
      isbn13: volumeInfo.industryIdentifiers?.find(id => id.type === 'ISBN_13')?.identifier,
      isbn10: volumeInfo.industryIdentifiers?.find(id => id.type === 'ISBN_10')?.identifier,
      pageCount: volumeInfo.pageCount,
      categories: volumeInfo.categories || [],
      averageRating: volumeInfo.averageRating,
      ratingsCount: volumeInfo.ratingsCount,
      maturityRating: volumeInfo.maturityRating,
      language: volumeInfo.language,
      previewLink: volumeInfo.previewLink,
      infoLink: volumeInfo.infoLink,
      canonicalVolumeLink: volumeInfo.canonicalVolumeLink,
      thumbnail: volumeInfo.imageLinks?.thumbnail?.replace('http:', 'https:'),
      smallThumbnail: volumeInfo.imageLinks?.smallThumbnail?.replace('http:', 'https:'),
      // Purchase/availability info
      saleability: saleInfo?.saleability,
      buyLink: saleInfo?.buyLink,
      listPrice: saleInfo?.listPrice,
      retailPrice: saleInfo?.retailPrice,
    };
  } catch (error) {
    console.error('Google Books details error:', error.message);
    if (error.response?.status === 429) {
      throw new Error('Rate limit exceeded. Please try again in a moment.');
    }
    throw new Error('Failed to get book details');
  }
}

/**
 * Get Goodreads URL from ISBN (best effort)
 * @param {string} isbn - ISBN-10 or ISBN-13
 * @returns {string} Goodreads search URL
 */
export function getGoodreadsUrl(isbn) {
  if (!isbn) return null;
  // Goodreads search by ISBN
  return `https://www.goodreads.com/search?q=${isbn}`;
}

/**
 * Get Open Library URL from ISBN
 * @param {string} isbn - ISBN-10 or ISBN-13
 * @returns {string} Open Library URL
 */
export function getOpenLibraryUrl(isbn) {
  if (!isbn) return null;
  return `https://openlibrary.org/isbn/${isbn}`;
}

/**
 * Get a random book with optional filters
 * @param {Object} filters - Optional filters (subject, publishedAfter, minRating)
 * @returns {Promise<Object>} Random book details
 */
export async function getRandomBook(filters = {}) {
  try {
    const { subject, publishedAfter, minRating } = filters;
    
    // Build query - use subject or default to fiction
    let query = subject || 'fiction';
    
    // Add date filter if provided
    if (publishedAfter) {
      query += ` publishedDate:${publishedAfter}*`;
    }
    
    const params = {
      q: query,
      maxResults: 40,
      printType: 'books',
      orderBy: 'relevance',
      startIndex: Math.floor(Math.random() * 100), // Random starting point (0-99)
    };

    if (config.apis.googleBooks.apiKey) {
      params.key = config.apis.googleBooks.apiKey;
    }

    const response = await axios.get(config.apis.googleBooks.baseUrl, { params });
    
    if (!response.data.items || response.data.items.length === 0) {
      return null;
    }

    // Filter by rating if specified
    let filteredBooks = response.data.items;
    if (minRating) {
      filteredBooks = filteredBooks.filter(item => 
        item.volumeInfo.averageRating && item.volumeInfo.averageRating >= minRating
      );
    }

    if (filteredBooks.length === 0) {
      return null;
    }

    // Pick a random book from filtered results
    const randomBook = filteredBooks[Math.floor(Math.random() * filteredBooks.length)];
    
    // Get full details for the selected book
    return await getBookDetails(randomBook.id);
  } catch (error) {
    console.error('Google Books random error:', error.message);
    throw new Error('Failed to get random book');
  }
}

/**
 * Get similar books based on a book's categories/subjects
 * @param {string} bookId - Google Books ID
 * @returns {Promise<Array>} Array of similar books
 */
export async function getSimilarBooks(bookId) {
  try {
    // First, get the book details to extract categories
    const book = await getBookDetails(bookId);
    
    if (!book.categories || book.categories.length === 0) {
      // Fallback to author search if no categories
      if (book.authors && book.authors.length > 0) {
        return await searchBooks(`inauthor:"${book.authors[0]}"`);
      }
      return [];
    }
    
    // Use the first category/subject to find similar books
    const category = book.categories[0];
    const results = await searchBooks(`subject:${category}`);
    
    // Filter out the original book
    return results.filter(b => b.id !== bookId).slice(0, 20);
  } catch (error) {
    console.error('Google Books similar error:', error.message);
    throw new Error('Failed to get similar books');
  }
}

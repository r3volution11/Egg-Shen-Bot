import { hybridSearch } from './src/services/aiService.js';
import { searchMovies } from './src/services/tmdbService.js';

console.log('Testing semantic fallback search...\n');

const query = 'guy looking for wife in limbo';
console.log(`Query: "${query}"`);
console.log('Word count:', query.split(/\s+/).length, '(5+ words triggers fallback)\n');

try {
  const results = await hybridSearch(query, searchMovies, 'movie');
  
  console.log(`Found ${results.length} results\n`);
  
  if (results.length > 0) {
    console.log('Top 5 Results:\n');
    results.slice(0, 5).forEach((movie, i) => {
      console.log(`${i + 1}. ${movie.title} (${movie.release_date?.split('-')[0] || 'N/A'})`);
      if (movie.semanticScore !== undefined) {
        console.log(`   🤖 Semantic Score: ${(movie.semanticScore * 100).toFixed(1)}%`);
      }
      console.log(`   📝 ${movie.overview?.substring(0, 100)}...`);
      console.log('');
    });
    
    // Check if "What Dreams May Come" is in the results
    const targetMovie = results.find(m => m.title.toLowerCase().includes('what dreams'));
    if (targetMovie) {
      console.log('✅ SUCCESS: "What Dreams May Come" found in results!');
      console.log(`   Ranked at position: ${results.indexOf(targetMovie) + 1}`);
      console.log(`   Semantic score: ${(targetMovie.semanticScore * 100).toFixed(1)}%`);
    } else {
      console.log('❌ "What Dreams May Come" not found in top results');
    }
  } else {
    console.log('❌ No results returned (OpenAI API may not be configured locally)');
  }
} catch (err) {
  console.error('❌ Error:', err.message);
}

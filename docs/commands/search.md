# Search Commands

Search for movies, TV shows, episodes, and games across multiple databases.

## Movie Search

Search for movies and view detailed information.

```
/movie <title>
```

**Parameters:**
- `title` (required) - Movie title to search for

**Features:**
- TMDB integration for comprehensive movie data
- OMDB integration for additional ratings
- Rotten Tomatoes scores (Critics & Audience)
- IMDb ratings and links
- Trakt.tv integration
- Letterboxd links
- Release dates and runtime
- Cast and crew information
- Genre and content ratings
- Streaming availability via JustWatch

**Example:**
```
/movie Big Trouble in Little China
```

## TV Show Search

Search for TV shows and view series information.

```
/tv <title>
```

**Parameters:**
- `title` (required) - TV show title to search for

**Features:**
- Complete series information
- Season and episode counts
- Air dates and network info
- Cast and crew details
- Ratings from multiple sources
- Streaming availability
- Episode guide links

**Example:**
```
/tv Stranger Things
```

## Episode Search

Search for specific episodes of TV shows.

```
/episode <show-title> <season> <episode>
```

**Parameters:**
- `show-title` (required) - Name of the TV show
- `season` (required) - Season number
- `episode` (required) - Episode number

**Features:**
- Episode-specific information
- Air dates
- Episode summaries
- Guest cast
- Ratings and reviews

**Example:**
```
/episode Stranger Things 1 1
```

## Episode List

View a list of all episodes in a season.

```
/episode-list <show-title> <season>
```

**Parameters:**
- `show-title` (required) - Name of the TV show
- `season` (required) - Season number

**Features:**
- Complete season overview
- Episode titles and air dates
- Episode numbers and descriptions
- Quick navigation to specific episodes

**Example:**
```
/episode-list Breaking Bad 5
```

## Game Search

Search for video games and view detailed information.

```
/game <title>
```

**Parameters:**
- `title` (required) - Game title to search for

**Features:**
- RAWG database integration
- Release dates and platforms
- Metacritic scores
- Genre and tags
- Developer and publisher info
- Store links
- Screenshots and trailers

**Example:**
```
/game The Legend of Zelda Tears of the Kingdom
```

## Search Tips

### Exact Matches
Use the full, exact title for best results:
```
/movie "The Thing" 1982
```

### Partial Matches
The bot will find the closest match if the exact title isn't found:
```
/tv mandalorian
→ Finds "The Mandalorian"
```

### Year Disambiguation
Include the year to distinguish remakes or similar titles:
```
/movie Total Recall 1990
/movie Total Recall 2012
```

### Special Characters
The search handles special characters and punctuation automatically:
```
/tv It's Always Sunny in Philadelphia
```

## Rate Limiting

Search commands are subject to rate limiting to prevent spam:
- Per-user cooldown: 3 seconds between searches
- Guild-wide limit: Depends on server configuration
- Abuse detection: Repeated rapid searches trigger automatic cooldowns

See [Rate Limiting](/features/rate-limiting) for more information.

## API Data Sources

### The Movie Database (TMDB)
- **Required** - Primary data source
- Movies, TV shows, episodes
- Images, cast, crew
- [Get API Key](https://www.themoviedb.org/settings/api)

### OMDB
- **Optional** - Additional ratings
- IMDb scores and details
- [Get API Key](http://www.omdbapi.com/apikey.aspx)

### Trakt.tv
- **Optional** - Watch tracking
- Social features
- [Get API Key](https://trakt.tv/oauth/applications)

### RAWG
- **Optional** - Game database
- Screenshots and trailers
- [Get API Key](https://rawg.io/apidocs)

## Troubleshooting

### "No results found"
- Check spelling of the title
- Try searching with just keywords
- Include release year for disambiguation
- Verify the content is in the database

### "Rate limit exceeded"
- Wait for the cooldown to expire
- Check server rate limiting configuration
- Contact server administrators if limits seem incorrect

### Missing information
- Ensure all API keys are configured
- Some older or obscure titles may have limited data
- Try alternative search terms or titles

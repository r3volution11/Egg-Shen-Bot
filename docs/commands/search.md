---
title: Search Commands - Egg Shen Bot
description: Search movies, TV shows, episodes, video games, board games, and books with comprehensive ratings from IMDb, Letterboxd, Trakt, Rotten Tomatoes, Metacritic, RAWG, BoardGameGeek, and Google Books.
---

# Search Commands

**Search for movies, TV shows, episodes, video games, board games, and books** across multiple databases with comprehensive ratings and links. All search commands provide detailed information, ratings from multiple sources, and streaming availability.

## Quick FAQ

**Q: What information do search commands provide?**  
A: Ratings from multiple sources, release dates, runtime, genres, cast, overview, streaming platforms, and links to external sites.

**Q: Why are some ratings missing?**  
A: Some content doesn't have ratings on all platforms, or the API keys for those services aren't configured.

**Q: Can I search by year?**  
A: Include the year in your search query (e.g., "The Batman 2022") to help find the right version.

**Q: What if I can't find something?**  
A: Check TMDB.org to see if it exists. The bot searches their database.

---

Search for movies, TV shows, episodes, games, board games, and books across multiple databases.

## Movie Search

Search for movies and view detailed information.

```
/movie query:<title>
```

**Parameters:**
- `query` (required) - Movie title to search for

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
- Also-known-as (AKA) title matching, so movies better known under a reissue/US title still turn up and display correctly

**Example:**
```
/movie query:Big Trouble in Little China
```

## TV Show Search

Search for TV shows and view series information.

```
/tv query:<title>
```

**Parameters:**
- `query` (required) - TV show title to search for (optionally include episode name)

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
/tv query:Stranger Things
```

## Episode Search

Search for specific episodes of TV shows.

```
/episode show:<show-name> episode:<episode>
```

**Parameters:**
- `show` (required) - Name of the TV show
- `episode` (required) - Episode title or number (e.g., "Sandkings", "s3e11", "3x11")

**Features:**
- Episode-specific information
- Air dates
- Episode summaries
- Guest cast
- Ratings and reviews

**Example:**
```
/episode show:The Outer Limits episode:Sandkings
/episode show:Stranger Things episode:s1e1
```

## Episode List

View a list of all episodes in a season.

```
/episode-list series:<show-name> season:<number>
```

**Parameters:**
- `series` (required) - Name of the TV show
- `season` (required) - Season number (integer)

**Features:**
- Complete season overview
- Episode titles and air dates
- Episode numbers and descriptions
- Quick navigation to specific episodes

**Example:**
```
/episode-list series:Breaking Bad season:5
```

## Game Search

Search for video games and view detailed information.

```
/game query:<title>
```

**Parameters:**
- `query` (required) - Game title to search for

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
/game query:The Legend of Zelda Tears of the Kingdom
```

## Board Game Search

Search for board games and view detailed information.

```
/boardgame query:<title>
```

**Parameters:**
- `query` (required) - Board game title to search for

**Features:**
- BoardGameGeek database integration
- Player count and playtime
- Complexity ratings
- User ratings and rankings
- Categories and mechanics

**Example:**
```
/boardgame query:Catan
```

## Book Search

Search for books and view detailed information.

```
/book query:<title or author>
```

**Parameters:**
- `query` (required) - Book title or author to search for

**Features:**
- Google Books database integration
- Author information
- ISBN-13 and ISBN-10
- Page counts and publication dates
- User ratings from Google Books
- Categories and genres
- Preview and purchase links
- Links to Goodreads and Open Library

**Example:**
```
/book query:Clive Barker Books of Blood
```

## Search Tips

### Exact Matches
Use the full, exact title for best results:
```
/movie query:The Thing 1982
```

### Partial Matches
The bot will find the closest match if the exact title isn't found:
```
/tv query:mandalorian
→ Finds "The Mandalorian"
```

### Year Disambiguation
Include the year to distinguish remakes or similar titles:
```
/movie query:Total Recall 1990
/movie query:Total Recall 2012
```

### Alternate Titles (AKAs)

Some movies and shows are stored in TMDB under an original or foreign title, even though they're actually known and distributed under a different one — for example, the 1978 film *Day of the Woman* is TMDB's title of record for what's far better known as *I Spit on Your Grave*. `/movie` and `/tv` (and `/soundtrack` and `/bracket` add-title) check TMDB's alternate-title (AKA) data when a query doesn't cleanly match the top result, so titles like these are still found:
```
/movie query:I Spit On Your Grave
→ Finds "Day of the Woman (1978)"
```
When a result like this is found, its result screen also shows an **Also Known As** field with the more familiar title, so it's clear you found the right one even though the title on-screen looks unfamiliar.

### Special Characters
The search handles special characters and punctuation automatically:
```
/tv query:It's Always Sunny in Philadelphia
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

### BoardGameGeek (BGG)
- **Optional** - Board game database
- User ratings and rankings
- [Get Client ID](https://boardgamegeek.com/wiki/page/BGG_XML_API2)

### Google Books
- **Optional** - Book database
- Works without API key (1,000 requests/day)
- API key provides 10,000 requests/day
- [Get API Key](https://console.developers.google.com/)

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

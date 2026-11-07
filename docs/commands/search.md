---
title: Search Commands - Egg Shen Bot
description: Search movies, TV shows, episodes, video games, board games, books and soundtracks, with ratings from IMDb, Letterboxd, Trakt, Rotten Tomatoes, Metacritic, RAWG, BoardGameGeek and Google Books.
---

# Search Commands

**Look up movies, TV shows, episodes, video games, board games, books and soundtracks.** Each result shows ratings from several sites, links, and for movies and shows, where to watch in your server's region.

## Quick FAQ

**Q: What does a movie or show result show?**  
A: The synopsis, poster, ratings from IMDb, Letterboxd, Trakt, Rotten Tomatoes and Metacritic, where it streams, the runtime (or status and seasons for a show), genres and languages.

**Q: Why are some ratings missing?**  
A: Not every title has a rating everywhere, the bot may not have the key for that site (IMDb, Rotten Tomatoes and Metacritic come from OMDb; Trakt needs a Trakt key), or an admin has switched that site off.

**Q: Can I search by year?**  
A: Yes. Add the year to your search, such as `The Thing 1982`, to pick out a remake or an older version.

**Q: What if I can't find something?**  
A: Check that it's on [TMDB](https://www.themoviedb.org), which the bot searches for movies and TV. Try another spelling or the original title.

---

## Results Are Shared With the Channel

Search results post in the channel, so everyone can see what you found. A small grey line above the result shows who ran which command, so others can do the same. It never pings anyone.

To keep a result to yourself, add `private:true`:
```
/movie query:The Thing private:true
```
This works on `/movie`, `/tv`, `/episode`, `/episode-list`, `/game`, `/boardgame`, `/book` and `/soundtrack`, as well as `/watched add`, `/recommend` and `/image`.

When several titles match, you first pick the right one from a list only you can see. Only the final result follows `private`.

## Smarter Auto-Selection

`/movie`, `/tv` and `/episode` rank the matches by how well they fit your search, using AI when the bot has an OpenAI key. When one result is far ahead of the rest, you get it straight away with no list to pick from. When two are close, like a movie and its remake, you get the list.

On that list, the top few results are checked against IMDb's release year as well as TMDB's. When the two disagree, both are shown, such as `It (1990 (IMDb: 1991))`.

How many results the list shows is set per server with `/eggshen-config settings max-results` (20 by default).

## Movie Search

```
/movie query:<title>
```

**Options:**
- `query` (required) - The movie's title
- `private` - Only you see the result (default: false)

**Shows:**
- The title and year, linked to IMDb, with the poster and synopsis
- Ratings: IMDb, Letterboxd, Trakt, RT Critics and Metacritic, each linked, plus a JustWatch link
- **Streaming Availability** in your server's region: **Stream**, **Free**, **Rent** and **Buy** lines, and a link to every option
- Runtime, genres and spoken languages
- **Also Known As**, when the movie is better known by another title

Admins choose which rating sites show with `/eggshen-config settings toggle`, and the streaming region with `/eggshen-config settings region`.

::: info Why there's no Rotten Tomatoes audience score
Egg Shen shows the **RT Critics** score but not the audience score. OMDb, the
bot's source for Rotten Tomatoes data, only returns the critics number; its
audience fields come back empty, since OMDb no longer licenses that data. No
other service the bot uses carries RT's audience figure either, and the official
Rotten Tomatoes API is limited to approved commercial partners.

So the badge always says "RT Critics". For an audience view, the **IMDb**,
**Trakt** and **Letterboxd** ratings are all voted by their communities.
:::

**Example:**
```
/movie query:Big Trouble in Little China
```

## TV Show Search

```
/tv query:<title>
```

**Options:**
- `query` (required) - The show's title
- `private` - Only you see the result (default: false)

**Shows:** the title and first-air year, poster, synopsis, the same ratings and streaming lines as a movie, whether it's still running or ended, the number of seasons, genres and languages.

To look up one episode, use `/episode`.

**Example:**
```
/tv query:Stranger Things
```

## Episode Search

```
/episode show:<show> episode:<title or number>
```

**Options:**
- `show` (required) - The show's name
- `episode` (required) - The episode's title (`Sandkings`) or its number (`s3e11`, `3x11`)
- `private` - Only you see the result (default: false)

**Shows:** the show and episode title, season and episode number, synopsis, air date, runtime, and the episode's own ratings and links.

**Examples:**
```
/episode show:The Outer Limits episode:Sandkings
/episode show:Stranger Things episode:s1e1
```

## Episode List

```
/episode-list series:<show> season:<number>
```

**Options:**
- `series` (required) - The show's name
- `season` (required) - The season number
- `private` - Only you see the result (default: false)

**Shows:** every episode in the season, in columns, with its title (linked to IMDb), number, air date and TMDB rating, plus a link to the whole season on IMDb.

A Discord card holds at most 25 entries, so a season with more than 25 episodes isn't listed. The bot says so and suggests `/episode` instead, which finds any one of them by title or number:

```
/episode show:Days of Our Lives episode:s1e1
```

**Example:**
```
/episode-list series:Breaking Bad season:5
```

## Game Search

Video games, from RAWG. Needs a RAWG API key; without one, `/game` isn't registered.

```
/game query:<title>
```

**Options:**
- `query` (required) - The game's title
- `private` - Only you see the result (default: false)

**Shows:** Metacritic and RAWG ratings, platforms, genres, release date, developers, publishers, the ESRB rating, and links to the official site, RAWG and Metacritic.

**Example:**
```
/game query:The Legend of Zelda Tears of the Kingdom
```

## Board Game Search

Board games, from BoardGameGeek. Needs a BoardGameGeek client ID; without one, `/boardgame` isn't registered.

```
/boardgame query:<title>
```

**Options:**
- `query` (required) - The board game's title
- `private` - Only you see the result (default: false)

**Shows:** the BGG rating, Geek rating and rank, players, playing time, minimum age, complexity, categories, mechanics, designers, publishers and a link to BoardGameGeek.

**Example:**
```
/boardgame query:Catan
```

## Book Search

Books, from Google Books.

```
/book query:<title or author>
```

**Options:**
- `query` (required) - The book's title or author
- `private` - Only you see the result (default: false)

**Shows:** authors, the Google Books rating, categories, publisher, publication date, pages, ISBN-13 and ISBN-10, language, and links to preview or buy it and to Goodreads and Open Library.

**Example:**
```
/book query:Clive Barker Books of Blood
```

## Soundtrack Search

```
/soundtrack query:<movie or show>
```

**Options:**
- `query` (required) - The movie's or show's title
- `private` - Only you see the result (default: false)

You pick the movie or show first, then the bot finds its soundtrack album on iTunes: artwork, artist, track count, release date, price and a link. When the bot has a Spotify key, it adds the Spotify album too.

**Example:**
```
/soundtrack query:Halloween
```

## Search Tips

### Add the year
Add the year to tell a remake from the original:
```
/movie query:Total Recall 1990
/movie query:Total Recall 2012
```

### Partial titles work
The bot finds the closest match:
```
/tv query:mandalorian
→ Finds "The Mandalorian"
```

### Alternate titles (AKAs)

Some titles are stored on TMDB under a title you might not know. For example, the 1978 film TMDB calls *Day of the Woman* is far better known as *I Spit on Your Grave*. When your search doesn't match the top result cleanly, `/movie` and `/tv` (and `/soundtrack` and `/bracket-setup manage-titles`) also check TMDB's alternate titles:
```
/movie query:I Spit On Your Grave
→ Finds "Day of the Woman (1978)"
```
The result then shows an **Also Known As** field with the title you know.

### Punctuation is fine
```
/tv query:It's Always Sunny in Philadelphia
```

## Rate Limiting

By default each member can run a given command once every 20 seconds, and the whole server can run 10 commands a minute. Admins and moderators aren't limited. Admins can change these numbers, or set a limit for one command, with `/eggshen-config-watch-party rate-limit`.

See [Rate Limiting](/features/rate-limiting).

## API Data Sources

| Source | Used for | Key |
|---|---|---|
| [TMDB](https://www.themoviedb.org) | Movies, TV shows, episodes, posters, where to watch | Required |
| [OMDb](https://www.omdbapi.com) | IMDb, Rotten Tomatoes and Metacritic ratings | Optional |
| [Trakt](https://trakt.tv) | Trakt ratings | Optional |
| [Watchmode](https://www.watchmode.com) | More streaming services, merged with TMDB's | Optional |
| [RAWG](https://rawg.io) | `/game` | Optional |
| [BoardGameGeek](https://boardgamegeek.com) | `/boardgame` | Optional |
| [Google Books](https://books.google.com) | `/book` | Optional (works without one, with a lower quota) |
| iTunes | `/soundtrack` | None needed |
| [Spotify](https://developer.spotify.com) | Spotify links in `/soundtrack` | Optional |

How to get each key: [API Keys Guide](/api-keys).

## Troubleshooting

### "No results found"
- Check the spelling
- Try fewer words, or the original title
- Add the release year
- Check the title is on TMDB (movies and TV), RAWG, BoardGameGeek or Google Books

### "You're using commands too quickly!"
- Wait for the time the message gives
- Admins can check the limits with `/eggshen-config-watch-party rate-limit view`

### Missing ratings or streaming services
- The bot may not have that site's key: see [API Keys](/api-keys)
- An admin may have switched that site off: `/eggshen-config settings view`
- Streaming services are for the server's region: `/eggshen-config settings region`
- Older or obscure titles often have less data

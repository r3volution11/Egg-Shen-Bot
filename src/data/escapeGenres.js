/**
 * Escape Velocity's genres and subgenres — the only topics its questions
 * cover.
 *
 * A parent genre always includes its subgenres: picking Horror for an event
 * brings in slashers, folk horror and the rest.
 *
 * TMDB genres are stored by NAME and resolved through getGenres(type) at
 * generation time, never as hardcoded ids (CLAUDE.md). Movie and TV have
 * different taxonomies — TV has no Horror, Thriller or Fantasy, and lumps
 * sci-fi and fantasy into one "Sci-Fi & Fantasy" genre — so each parent says
 * how TV should find it:
 *
 *   tv: { genre: 'Crime' }        a real TV genre of the same meaning
 *   tv: { fromSubgenres: true }   the union of this parent's subgenre keywords
 *                                 (so TV "Horror" is everything tagged slasher,
 *                                 zombie, haunted house, …), plus any listed
 *                                 `keywords` of the parent's own
 *   tv: null                      not offered for TV
 *
 * Subgenres are usually TMDB keywords, looked up with /search/keyword. A few
 * are better found as a second genre instead (`alsoGenre`): TMDB tags almost
 * no film "romantic comedy", but Comedy AND Romance matches ~3,000.
 *
 * `media` limits a subgenre to where TMDB has enough well-known titles for
 * it. The counts come from scripts/verify-escape-genres.js, which checks
 * every id against the live API — TMDB silently ignores a filter it doesn't
 * recognize, so a wrong id here would quietly turn "Slasher" into "all of
 * Horror". Re-run it after editing this file.
 */

export const ESCAPE_GENRES = [
  {
    key: 'horror', label: 'Horror', emoji: '🔪',
    movie: { genre: 'Horror' },
    // TMDB's own "horror" keyword is the clean core on TV; "supernatural"
    // there pulls in Adventure Time and teen dramas, so it's films only
    tv: { fromSubgenres: true, keywords: [{ id: 315058, name: 'horror' }] },
    subgenres: [
      { key: 'slasher', label: 'Slasher', media: ['movie'], keyword: { id: 12339, name: 'slasher' } },
      { key: 'folk', label: 'Folk Horror', media: ['movie'], keyword: { id: 209568, name: 'folk horror' } },
      { key: 'found', label: 'Found Footage', media: ['movie'], keyword: { id: 163053, name: 'found footage' } },
      { key: 'zombie', label: 'Zombie', keyword: { id: 12377, name: 'zombie' } },
      { key: 'super', label: 'Supernatural', media: ['movie'], keyword: { id: 6152, name: 'supernatural' } },
      { key: 'body', label: 'Body Horror', media: ['movie'], keyword: { id: 283085, name: 'body horror' } },
      { key: 'haunted', label: 'Haunted House', media: ['movie'], keyword: { id: 3358, name: 'haunted house' } },
      { key: 'vampire', label: 'Vampire', keyword: { id: 3133, name: 'vampire' } },
      { key: 'werewolf', label: 'Werewolf', keyword: { id: 12564, name: 'werewolf' } },
    ],
  },
  {
    key: 'scifi', label: 'Science Fiction', emoji: '🚀',
    movie: { genre: 'Science Fiction' },
    // TV's "Sci-Fi & Fantasy" would mix in dragons; the keywords keep it sci-fi
    tv: { fromSubgenres: true },
    subgenres: [
      { key: 'opera', label: 'Space Opera', keyword: { id: 161176, name: 'space opera' } },
      { key: 'cyber', label: 'Cyberpunk', keyword: { id: 12190, name: 'cyberpunk' } },
      { key: 'time', label: 'Time Travel', keyword: { id: 4379, name: 'time travel' } },
      { key: 'dystopia', label: 'Dystopia', keyword: { id: 4565, name: 'dystopia' } },
      { key: 'invasion', label: 'Alien Invasion', keyword: { id: 14909, name: 'alien invasion' } },
      { key: 'postapoc', label: 'Post-Apocalyptic', keyword: { id: 4458, name: 'post-apocalyptic future' } },
      { key: 'kaiju', label: 'Kaiju', media: ['movie'], keyword: { id: 161791, name: 'kaiju' } },
    ],
  },
  {
    key: 'fantasy', label: 'Fantasy', emoji: '🐉',
    movie: { genre: 'Fantasy' },
    tv: { fromSubgenres: true },
    subgenres: [
      { key: 'sword', label: 'Sword & Sorcery', keyword: { id: 234213, name: 'sword and sorcery' } },
      { key: 'fairy', label: 'Fairy Tale', media: ['movie'], keyword: { id: 3205, name: 'fairy tale' } },
      { key: 'high', label: 'High Fantasy', keyword: { id: 211227, name: 'high fantasy' } },
      { key: 'dark', label: 'Dark Fantasy', keyword: { id: 177895, name: 'dark fantasy' } },
    ],
  },
  {
    key: 'thriller', label: 'Thriller', emoji: '🕵️',
    movie: { genre: 'Thriller' },
    tv: { fromSubgenres: true },
    subgenres: [
      { key: 'psych', label: 'Psychological Thriller', keyword: { id: 12565, name: 'psychological thriller' } },
      { key: 'conspiracy', label: 'Conspiracy', keyword: { id: 10410, name: 'conspiracy' } },
      { key: 'erotic', label: 'Erotic Thriller', media: ['movie'], keyword: { id: 207767, name: 'erotic thriller' } },
    ],
  },
  {
    key: 'crime', label: 'Crime', emoji: '🚔',
    movie: { genre: 'Crime' },
    tv: { genre: 'Crime' },
    subgenres: [
      { key: 'heist', label: 'Heist', keyword: { id: 10051, name: 'heist' } },
      { key: 'serial', label: 'Serial Killer', keyword: { id: 10714, name: 'serial killer' } },
      { key: 'noir', label: 'Neo-Noir', keyword: { id: 207268, name: 'neo-noir' } },
      { key: 'procedural', label: 'Police Procedural', media: ['tv'], keyword: { id: 268067, name: 'police procedural' } },
    ],
  },
  {
    key: 'comedy', label: 'Comedy', emoji: '🤡',
    movie: { genre: 'Comedy' },
    tv: { genre: 'Comedy' },
    subgenres: [
      // TV has no Romance genre, so this one is films only
      { key: 'romcom', label: 'Romantic Comedy', media: ['movie'], alsoGenre: 'Romance' },
      { key: 'parody', label: 'Parody', keyword: { id: 9755, name: 'parody' } },
      { key: 'dark', label: 'Dark Comedy', keyword: { id: 10123, name: 'dark comedy' } },
      { key: 'satire', label: 'Satire', keyword: { id: 8201, name: 'satire' } },
    ],
  },
  {
    key: 'animation', label: 'Animation', emoji: '🎨',
    movie: { genre: 'Animation' },
    tv: { genre: 'Animation' },
    subgenres: [
      { key: 'anime', label: 'Anime', keyword: { id: 210024, name: 'anime' } },
      { key: 'stopmo', label: 'Stop Motion', media: ['movie'], keyword: { id: 10121, name: 'stop motion' } },
    ],
  },
  {
    key: 'war', label: 'War', emoji: '🪖',
    movie: { genre: 'War' },
    tv: { genre: 'War & Politics' },
    subgenres: [
      { key: 'ww2', label: 'World War II', keyword: { id: 1956, name: 'world war ii' } },
      { key: 'vietnam', label: 'Vietnam War', media: ['movie'], keyword: { id: 2957, name: 'vietnam war' } },
    ],
  },
];

/** A parent genre by key, or null. */
export function getEscapeGenre(key) {
  return ESCAPE_GENRES.find(g => g.key === key) || null;
}

/** Whether a parent genre can be played on a media type at all. */
export function genreSupports(genre, media) {
  return Boolean(genre?.[media]);
}

/** Whether a subgenre has enough well-known titles on a media type. */
export function subgenreSupports(sub, media) {
  return !sub.media || sub.media.includes(media);
}

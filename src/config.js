import { config as dotenvConfig } from 'dotenv';

dotenvConfig();

export const config = {
  discord: {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.DISCORD_CLIENT_ID,
    guildId: process.env.GUILD_ID || null,
  },
  apis: {
    tmdb: {
      apiKey: process.env.TMDB_API_KEY,
      baseUrl: 'https://api.themoviedb.org/3',
      imageBaseUrl: 'https://image.tmdb.org/t/p',
    },
    omdb: {
      apiKey: process.env.OMDB_API_KEY,
      baseUrl: 'https://www.omdbapi.com',
    },
    trakt: {
      clientId: process.env.TRAKT_CLIENT_ID,
      baseUrl: 'https://api.trakt.tv',
    },
    rawg: {
      apiKey: process.env.RAWG_API_KEY,
      baseUrl: 'https://api.rawg.io/api',
    },
    bgg: {
      clientId: process.env.BGG_CLIENT_ID,
      baseUrl: 'https://boardgamegeek.com/xmlapi2',
    },
  },
  serviceUrls: {
    imdb: 'https://www.imdb.com/title',
    letterboxd: 'https://letterboxd.com/imdb',
    trakt: {
      movie: 'https://trakt.tv/movies',
      show: 'https://trakt.tv/shows',
    },
    rottenTomatoes: 'https://www.rottentomatoes.com',
    justWatch: 'https://www.justwatch.com',
  },
  emojis: {
    // Custom Discord emojis (optional) - leave empty to show text labels
    // When set, these will display before the service name for branded look
    // Format: <:name:id> - e.g., <:imdb:1234567890123456>
    imdb: process.env.EMOJI_IMDB || '',
    letterboxd: process.env.EMOJI_LETTERBOXD || '',
    trakt: process.env.EMOJI_TRAKT || '',
    rtCritics: process.env.EMOJI_RT_CRITICS || '',
    rtAudience: process.env.EMOJI_RT_AUDIENCE || '',
    justWatch: process.env.EMOJI_JUSTWATCH || '',
  },
};


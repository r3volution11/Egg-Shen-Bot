# Bot Status Quotes Setup Guide

The bot rotates its Discord status once an hour through a list of short text lines (see `src/utils/presenceScheduler.js`). That list lives in a small web page, `/quotes-admin`, so it can be edited without touching code or redeploying — useful since this bot is meant to be run by other server owners too, not just the original maintainer.

## Environment Variable

Add to your `.env` file:
```env
QUOTES_ADMIN_SECRET=your_generated_secret_here
```

Generate a secret once per deployment:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Keep it independent from `DISCORD_CLIENT_SECRET`/`DISCORD_TOKEN`/`EVENT_CROP_LINK_SECRET` so it can be rotated on its own. If `QUOTES_ADMIN_SECRET` isn't set, `/quotes-admin`'s API returns a clear "not configured" error and the page can't be used — everything else about the bot works normally either way.

## Using the Editor

Visit `https://yourdomain.com/quotes-admin` (or `http://localhost:3000/quotes-admin` locally), enter the secret when prompted, and add, edit, or delete status lines from the list. Changes save immediately and are picked up by the bot within the hour, at its next scheduled status rotation — no restart needed.

The secret isn't stored in the browser (no cookie, no localStorage) — you'll re-enter it each time you visit the page.

## Storage

Quotes are stored in a gitignored `movie_quotes.json` file at the project root, seeded the first time the bot starts with a small set of placeholder lines from `src/utils/movieQuotes.js`. From then on, `movie_quotes.json` is the source of truth — edit it directly on the server, or through `/quotes-admin`, either works (they read/write the same file).

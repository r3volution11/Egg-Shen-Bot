# Bot Status Quotes Setup Guide

The bot rotates its Discord status once an hour through a list of short quotes (see `src/utils/presenceScheduler.js`). Each quote can optionally carry a **title** (the movie/show/game/etc. it's from) and an **author** (the character or real person who said it). That list is managed two ways:

- **`/quotes-admin`**, a small web page, so it can be edited without touching code or redeploying — useful since this bot is meant to be run by other server owners too, not just the original maintainer.
- **`/eggshen-config-quotes`**, a set of Discord slash commands for admins/moderators to add, edit, delete, and list quotes directly from a server.

Members can also submit candidate quotes with **`/suggest-quote`**; suggestions go into a review queue rather than the live rotation until an admin/moderator approves or rejects them.

## Environment Variable

Add to your `.env` file:
```env
QUOTES_ADMIN_SECRET=your_generated_secret_here
```

Generate a secret once per deployment:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Keep it independent from `DISCORD_CLIENT_SECRET`/`DISCORD_TOKEN`/`EVENT_CROP_LINK_SECRET` so it can be rotated on its own. If `QUOTES_ADMIN_SECRET` isn't set, `/quotes-admin`'s API returns a clear "not configured" error and the page can't be used — the Discord-side commands (`/eggshen-config-quotes`, `/quote`, `/suggest-quote`) work regardless, since they're gated by Discord permissions, not this secret.

`/eggshen-config-quotes admin-link` (see below) also needs `PUBLIC_BOT_URL` set to your bot's public URL (e.g. `https://yourdomain.com`) — it's the same variable the event-request crop-image link already uses, so if that feature is already configured, nothing more to do here.

## Reverse Proxy Requirement (self-hosting behind nginx/Apache/etc.)

If you're running this bot behind a reverse proxy (rather than exposing its port directly), your proxy config needs to forward **both** `/quotes-admin/` and `/quotes-assets/` to the bot process — the same way it already forwards `/`, `/api/`, and (if you use the event-request crop feature) `/crop/`/`/crop-assets/`. Without these two location blocks, `/quotes-admin` will 404 at the proxy layer before ever reaching the bot, even though `QUOTES_ADMIN_SECRET` is configured correctly. An nginx example, mirroring the existing `/crop/`/`/crop-assets/` blocks:

```nginx
location /quotes-admin/ {
    client_max_body_size 10M;
    proxy_pass http://localhost:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location /quotes-assets/ {
    proxy_pass http://localhost:3000;
    proxy_set_header Host $host;
}
```

## Using the Web Editor (`/quotes-admin`)

Visit `https://yourdomain.com/quotes-admin` (or `http://localhost:3000/quotes-admin` locally), enter the secret when prompted — or use `/eggshen-config-quotes admin-link` in Discord to get a one-click link that opens the page already unlocked, no secret to type in (see below). The page has two tabs:

- **Quotes** — the live rotation. Two edit modes:
  - **Row Editor**: add/edit/delete one quote at a time, with separate Title, Quote, and Author fields per row.
  - **Bulk Editor**: edit the entire list as plain text, one quote per line (`Title | Quote | Author` — Title and Author may be left blank between the pipes). Useful for pasting in a large batch at once. Every line is validated before anything is saved — if one line is malformed, none of the bulk edit is applied, and the specific bad line is reported so you can fix just that one.
- **Suggestions** — quotes submitted via `/suggest-quote`, awaiting review. Approve moves a suggestion into the live rotation; Reject discards it. This is a second path to the same review queue Discord's moderation-channel buttons use (see below) — approving/rejecting here or in Discord has the same effect either way.

Changes save immediately and are picked up by the bot within the hour, at its next scheduled status rotation — no restart needed. The secret isn't stored in the browser (no cookie, no localStorage) — you'll re-enter it each time you visit the page.

## Using the Discord Commands

- **`/quote [title] [author]`** — posts a random quote into the channel. With no options, picks from the entire list. `title` and `author` are optional filters, combined as OR — `/quote title:"The Thing"` only pulls quotes from that title, `/quote author:"MacReady"` only pulls quotes by that author, and giving both returns a quote matching *either* one. `title` has autocomplete against the titles currently in the list.
- **`/suggest-quote quote:"..." title:"..."(optional) author:"..."(optional)`** — any member can submit a candidate quote. It's added to the review queue, not the live rotation. If the server has a quote-suggestions moderation channel configured (see below), a message appears there with **Approve**/**Edit**/**Reject** buttons; Edit opens a modal to adjust the text/title/author before approving. If no moderation channel is set, the suggestion still lands in the queue — review it via `/quotes-admin`'s Suggestions tab instead.
- **`/eggshen-config-quotes add quote:"..." title:"..."(optional) author:"..."(optional)`** — admin/moderator only. Adds a quote straight into the live rotation, bypassing the review queue entirely (unlike `/suggest-quote`).
- **`/eggshen-config-quotes edit index:N quote:"..." title:"..." author:"..."`** / **`delete index:N`** — admin/moderator only. Edit or remove a quote by its index (see `list` below to find one).
- **`/eggshen-config-quotes list [page]`** — admin/moderator only. Shows the current live quotes with their index, 10 per page.
- **`/eggshen-config-quotes moderation-channel channel:#channel`** — admin/moderator only. Sets which channel `/suggest-quote` submissions are posted to for review. Leave unconfigured to only review suggestions via `/quotes-admin`.
- **`/eggshen-config-quotes max-pending-per-user max:N`** — admin/moderator only. Caps how many suggestions a single user can have awaiting review at once (default: 3) — `/suggest-quote` rejects new submissions from a user once they hit this cap, until a moderator reviews their existing ones.
- **`/eggshen-config-quotes admin-link`** — admin/moderator only. Replies with a link button that opens `/quotes-admin` already unlocked — no secret to be handed or typed in. The link is single-use and expires in 10 minutes; request a new one if it lapses. Requires both `QUOTES_ADMIN_SECRET` and `PUBLIC_BOT_URL` to be set.

Both `/quote` and `/suggest-quote` are toggleable per-server through the same `commandPermissions` system every other user-facing command uses (`/eggshen-config commands`).

### Abuse Protection on `/suggest-quote`

Since a suggestion writes into a moderator-facing review queue (and optionally posts to a moderation channel), `/suggest-quote` has tighter limits than most commands:
- **Rate limit**: 1 request per minute by default (vs. the generic 1-per-20-seconds default every other command gets) — set via `rateLimits.commands['suggest-quote']` in `defaultConfig` (`src/utils/guildConfig.js`); there's no slash command to adjust this per-server yet, so a self-hoster who wants a different default would edit the relevant `guild_configs/<guildId>.json` file directly.
- **Pending cap**: a user can have at most `maxPendingPerUser` (default 3) suggestions awaiting review at once — see `/eggshen-config-quotes max-pending-per-user` above. This bounds how much a user can flood the queue/moderation channel even if they stay just under the rate limit, since it caps total unresolved suggestions rather than submission speed.

## Storage

Quotes are stored in a gitignored `movie_quotes.json` file at the project root, seeded the first time the bot starts with a small set of placeholder lines from `src/utils/movieQuotes.js`. Pending suggestions live separately in a gitignored `movie_quotes_pending.json`, so a suggestion never affects the bot's live status until it's approved. From then on, these files are the source of truth — edit them directly on the server, or through `/quotes-admin`/the Discord commands above; all paths read/write the same files.

## Customizing the Look

`/quotes-admin` shares the same compiled Bootstrap CSS/JS as the event-request form and moderator crop page, but since the quote data itself is bot-wide (not tied to any one guild), its theme can't be looked up from stored data the way the event-request form's can. Instead, whichever guild's moderator runs `/eggshen-config-quotes admin-link` has that guild's assigned theme (see `/eggshen-config-events event-requests web-theme`) baked into the generated link itself — visiting `/quotes-admin` via that link renders in that theme automatically. Visiting `/quotes-admin` directly, with no link (or an expired/invalid one), falls back to the `"default"` theme, since there's no guild context to resolve otherwise.

See [`EVENT_REQUEST_SETUP.md`'s "Customizing the Look"](EVENT_REQUEST_SETUP.md#customizing-the-look) section for how named themes are defined and compiled (`scripts/web-themes.json`, `npm run build:web`). (The event-request form's separate `LOGO_URL` setting is specific to that page — quotes-admin doesn't currently show a logo.)

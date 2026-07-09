# Event Request form — end-to-end tests

Playwright tests for the Event Request web form (`public/index.html` + `public/app.js`
talking to `src/api/server.js`). This is the only part of Egg Shen Bot that runs in a
browser — everything else (slash commands, services) is covered by the Jest suite in
`tests/`, not here.

## Running

```bash
npm run test:e2e:install   # once, downloads a local Chromium build
npm run test:e2e
```

Nothing here talks to a real Discord bot or a real Discord OAuth flow — it's fully
self-contained and safe to run against your own local checkout, with no setup beyond
`npm install`.

## How it works

`tests/e2e/harness/serve.js` boots a single local Express app on `http://localhost:3000`
that mirrors how a real deployment is typically set up: one origin serving the static
form *and* the bot's API together (see `EVENT_REQUEST_SETUP.md`'s nginx example, which
reverse-proxies `/api/*` to the bot process and serves everything else as static files
from the same domain). The harness does the equivalent by mounting `express.static('public')`
in front of the real `createApiServer()` app — no CORS configuration needed, since it's
all same-origin.

The only thing stubbed out is the Discord connection itself:

- **`tests/e2e/fixtures/stub-discord-client.js`** — a fake `discord.js` `Client` with a
  couple of made-up example guilds/channels/members (see `scenarios.js`). Built on
  discord.js's own `Collection` class (not a plain `Map`) and implements
  `guild.members.fetch()`, since `src/api/server.js` calls both.
- **`tests/e2e/fixtures/session-cookie.js`** — forges the `discord_session` cookie
  directly instead of driving real Discord OAuth (the cookie is unsigned base64 JSON,
  not a JWT — see `src/api/server.js`'s `/api/auth/discord/callback` and
  `/api/auth/session` handlers for the exact shape this matches).
- A test-only `POST /api/__test__/reset-rate-limit` route in `src/api/server.js`,
  compiled out whenever `NODE_ENV === 'production'`, lets tests reset the real 1-per-5-minute
  submission limiter instead of waiting it out or weakening it for tests.

None of the fixture guild IDs, names, or channels are real — they're placeholders
(`900000000000000001`, "Example Simple-Mode Server", etc.) so this suite runs the same
way for anyone self-hosting this bot, without needing a real Discord server to test
against.

## Gotchas

- **Serial execution only** (`workers: 1` in `playwright.config.js`). The harness is one
  long-lived process holding shared, IP-keyed rate-limit state and writes to the real
  `guild_configs/` and `pending_event_requests.json` paths (cleaned up automatically on
  exit). Running spec files in parallel would race on all of that — not worth the
  complexity for a local dev tool that isn't wired into CI.
- **Rate-limit resets must go through the browser page, not a separate HTTP client.**
  `express-rate-limit`'s default key generator subnet-masks IPv6 addresses (see
  `ipKeyGenerator` in `express-rate-limit`) rather than using the raw IP as the store
  key — resetting from a different client (e.g. Playwright's standalone `request`
  fixture, which uses Node's own HTTP stack) can silently reset the wrong bucket if it
  resolves `localhost` differently than the actual browser does. `resetRateLimit()` in
  `tests/e2e/helpers.js` runs the reset via `page.evaluate(fetch(...))` specifically to
  avoid this.
- **A native `form.reset()` after a successful submission clears `<select>` elements
  back to their first option**, not back to whatever value was set via JS after page
  load (the time dropdowns default to 18:00/18:15 via JS, not an HTML `selected`
  attribute). Any spec that submits more than once per page load needs to re-select
  those fields — see the comment on `fillRequiredFields()` in `tests/e2e/helpers.js`.
- You'll see a `ERR_ERL_PERMISSIVE_TRUST_PROXY` warning logged by the harness on
  startup. This is expected — it's the same warning the real bot logs in production
  (`trust proxy: true` is intentionally permissive since the bot expects to sit behind
  its own reverse proxy) and isn't specific to the test harness.

## Adding a new scenario

1. Add or reuse a guild in `tests/e2e/fixtures/scenarios.js`.
2. Write a `.spec.js` file in this directory (not `.test.js` — that extension is
   reserved for the Jest suite in `tests/`, and the two runners must not pick up each
   other's files).
3. Use `loginAs(page, { userId, guildId })` from `tests/e2e/helpers.js` to bypass OAuth,
   and `resetRateLimit(page)` before any test that submits the form.

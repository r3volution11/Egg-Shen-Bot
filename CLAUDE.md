# Working on Egg Shen Bot

A Discord bot for movie/TV watch-party communities. Node 20+, ESM throughout
(`"type": "module"` — always use `import`, never `require`). Jest with
`--experimental-vm-modules`.

Production runs on a single server; `npm test` and `npm run check:commands`
both have to pass before anything ships.

---

## Releasing — all four steps, every time

A change is not released until all four are done. Three versions once shipped
to the server with changelog entries written but no tag and no GitHub
release, so `gh release list` sat weeks behind what was actually running.

1. **Changelog + version.** Add an entry to `docs/changelog.md` and bump
   `package.json` to match. **Insert above the highest version heading, not
   above whichever entry you last edited** — the file is not reliably sorted,
   and a stale entry once sat above everything, making the published page
   look weeks out of date while being current. Check with
   `grep -n "^## " docs/changelog.md | head -5`.
2. **Push to `main`.** The `Deploy Documentation` workflow publishes
   eggshenbot.com automatically. Confirm with `gh run list --limit 2`.
3. **Tag and release.** `git tag -a vX.Y.Z -m "..."`, push the tag, then
   `gh release create`. Release notes are the *user-facing* rewrite of the
   changelog entry — no `### Developer` section.
4. **Deploy.** See below.

Then verify the published page actually updated:

```bash
curl -s https://eggshenbot.com/changelog.html \
  | grep -oE '2\.[0-9]+\.[0-9]+ - [0-9-]+' | head -3
```

The newest version must be first.

---

## Deploying

```bash
ssh root@172.239.155.166 "cd /opt/discord-bot && git stash && git pull origin main && git stash pop"
ssh root@172.239.155.166 "cd /opt/discord-bot && npm install --omit=dev"
ssh root@172.239.155.166 "cd /opt/discord-bot && node src/deploy-commands.js"   # ONLY when a command definition changed
ssh root@172.239.155.166 "pm2 restart egg-shen-bot --update-env && sleep 8 && pm2 status"
curl -s http://localhost:3000/api/health    # on the server
```

- `deploy-commands` is needed only when a slash command's **schema** changed
  (a new subcommand, option, choice, or description). Logic-only changes just
  need the restart.
- Always restart with `--update-env`; PM2 caches the environment otherwise.
- The server's working tree is normally dirty with `package-lock.json` and
  `.bak-*` files. That is expected — hence the stash.
- If a user reports "this command is outdated", that is Discord's **client**
  cache, not the bot. Verify with the Discord API, then tell them to reload
  (Cmd/Ctrl+R).

---

## Testing

### A test you haven't seen fail is not coverage

Every bug found in this repo was invisible to a green suite, and two had
tests that *looked* like coverage:

- A pause test set up the exact failing scenario, commented that paused time
  "must not affect the report", then asserted only that a reply was sent. It
  passed for months while the bug corrupted watch history.
- Two select handlers had **no** coverage at all, which is how `/watched add`
  shipped a 100% failure rate on ambiguous titles.

So: **after writing a test, break the fix and confirm the test fails.**
Restore it and confirm it passes. A test that cannot fail is worse than none,
because it advertises safety that isn't there.

### Assert the effect, not that something happened

`expect(interaction.reply).toHaveBeenCalled()` passes whether the bot did the
right thing or not. Assert the number, the stored record, the actual text.

### Drive the real thing end to end

For anything involving a select menu or button, have the real command build
the menu, then feed **its own option value** back into the real handler. That
shape is what caught the truncation bug; unit-testing each half in isolation
would not have.

**Tournaments have a simulator** (`tests/harness/tournamentSim.js`): whole
tournaments through the real `/bracket` command, handlers and scheduler,
against a fake Discord as strict as the real one (answer once, never follow
up first, never leave a click unanswered) and real recorded API data. Its
first run found eight bugs that ~130 piecemeal tournament tests had missed.
Add a scenario to `tests/tournament-sim.test.js` for any tournament change,
and run `npm run test:fuzz` (random action sequences, not in `npm test`)
after touching the flow. New titles need recording once:
`SIM_RECORD=1 npm test -- tests/tournament-sim.test.js`.

### Test isolation

`tests/jest.setup.js` gives each worker its own scratch directory and points
the file-path env vars at it. **Jest reuses a worker across many test files**,
so a worker-scoped directory is still shared with whatever suite runs next.

If a suite recursively deletes a directory, it must either claim its own path
first (before importing anything that reads it) or empty the directory's
*contents* rather than removing it. `tests/test-isolation.test.js` enforces
this and names the offending file.

A suite using **static** imports cannot reassign the env var — the module has
already captured the path. Empty the contents instead.

### When a suite fails intermittently

Run it in isolation, then run the full suite a few times. If a *different*
test fails each run and each passes alone, it is cross-file interference, not
a real defect. `npm test -- --runInBand` confirms it.

Two causes already found and fixed — check they haven't come back before
hunting further:

- **A request reaching another program.** supertest's `listen(0)` binds
  every address; on macOS another app already holding that port on
  127.0.0.1 then receives the request (a 400/404 the route can't produce,
  a reset, a 15s hang). `tests/jest.setup.js` pins supertest to 127.0.0.1;
  `tests/supertest-loopback.test.js` guards it.
- **A timer or file write outliving its test.** A module-level
  `setInterval` keeps a worker alive ("failed to exit gracefully"), and a
  fire-and-forget write races the next read. Housekeeping timers are
  `unref()`'d; `timerManager` queues its saves. Measure over many runs — at
  one failure in ten, a single clean run proves nothing.

---

## Discord limits that have actually caused bugs here

| Limit | Value | What went wrong |
|---|---|---|
| Select option `value` | **100 chars** | Payloads were base64'd in and truncated → parse failed → 100% failure |
| Select menu options | 25 | The merged picker relied on 8×3 happening to equal 24 |
| Buttons per message | 5 rows × 5 | |
| Embed field value | 1024 chars | |
| Embed total | 6000 chars | |
| Command definition | 8000 bytes | Why the config commands are split across files |

**Never put a variable-length payload in a customId.** Use
`src/utils/pendingSelections.js` — a short nonce keyed to side storage.

Other hard-won Discord behavior:

- **Edits never notify.** A message edited in place is invisible to anyone not
  already looking at the channel. If something must be noticed, send a *new*
  message.
- **Mentions inside an embed never ping.** Only message `content` does.
- **Subcommands render in registration order** and cannot be reordered per
  invocation. Order them by what you want people to reach for first.
- **A public message's buttons are clickable by everyone.** A command's
  permission check does *not* protect the buttons it posts — gate the handler.
  See `ensureTournamentManager` in `src/handlers/buttonHandler.js`.
- **A select customId not in `handledIds`** (top of `selectHandler.js`) is
  silently dropped, with nothing in the logs.

---

## TMDB

- **Movie and TV have different genre taxonomies.** TV has no Horror and no
  Romance. Read genres from `getGenres(type)` — never hardcode IDs.
- **Unknown query parameters are ignored, not rejected.** A typo'd filter
  silently does nothing: `vote_count_gte` sat in place of `vote_count.gte`
  and disabled the minimum-vote guard entirely. Verify a new filter changes
  the result count.
- **Searches match literally.** Event names carry years — "The Covenant
  (2006)" returns zero results. Use `stripTrailingYear()`.
- **Runtimes are ad-free.** A 25-minute episode runs ~33 on Tubi or Pluto,
  which is why the multi-episode buffer scales per episode and is
  server-configurable.

---

## Conventions

- **Per-guild config** lives in `guild_configs/<id>.json`. There are **no
  migrations** — a config written before your key exists simply lacks it, so
  read through a normalizing helper (`getAutoDetectMode`,
  `getEpisodeBufferMinutes`) rather than touching the field directly.
- **`private` vs `public` option.** Most commands take `private` (default
  public) and route the answer through `deliverResult()`. `/timer status` uses
  `public`, read with `?? true` — `getBoolean` returns `null` when unset, and
  `||` would swallow a deliberate `false`.
- **Commands are auto-discovered** from `src/commands/`. Drop the file in; no
  manifest. Add it to `src/commands/help.js` by hand, though.
- **Tournament state that must survive a restart goes in the tournament
  file, not a module `Map`.** Deploys restart the bot mid-vote. Memory-only
  state is how a restart re-sent "closing soon" warnings and posted duplicate
  standings cards. Write it with a synchronous load-modify-save helper in
  `bracketManager.js` (`markWarningSent`, `recordLiveStandingsCard`); never
  save a tournament object loaded before an `await`, or you overwrite votes
  saved in between. `saveTournament` writes atomically and keeps a `.bak`
  that `loadTournament` recovers from. `tests/tournament-sim-restarts.test.js`
  restarts the bot at the bad moments.
- **Comments explain *why*.** The codebase is dense with them and they have
  repeatedly prevented re-breaking something. Match that.

---

## Before you finish

```bash
npm test && npm run check:commands
```

Then ask: did I break a fix to confirm the new test catches it? Is the
changelog entry above the highest version? Does anything in `docs/` now
describe behavior that no longer exists?

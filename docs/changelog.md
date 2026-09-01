# Changelog

All notable changes to Egg Shen Bot will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 2.25.0 - 2026-08-31

### Added
- **Pasted image URLs can now be cropped, just like uploaded files.** Previously, only an uploaded image file got the crop tool — a pasted URL was used as-is, with no way to adjust framing. Paste a URL and click **Fetch & Crop** to pull it into the same crop UI a file upload uses; the fetched image is hosted the same way an upload is, so it can be re-cropped later from the moderator crop-link page too
- **"Change Image" button** lets you back out of an image selection (file or URL) and pick a different one, without reloading the page or clearing the rest of the form — previously there was no way to change your mind once a file was picked or a URL fetched

### Developer
- New `POST /api/event-request/fetch-image-url` endpoint server-side fetches a submitter-pasted URL (reusing the same content-type/size validation `resolveEventImageBuffer` already applied at approval time, now extracted into shared `src/utils/fetchImageUrl.js`) and returns the bytes as a `data:` URL — needed because a browser can't load an arbitrary cross-origin image into a canvas-accessible `<img>` for Cropper.js without CORS headers from the third-party host
- `public/index.html`'s image section restructured into three groups (`#image-picker-group`, `#image-url-group`, `#image-crop-group`) that show/hide together; `public/app.js` gained `loadImageIntoCropper()` (shared by both the file-`change` handler and the new fetch-URL handler) and module-scoped `resetImageState()` (shared by the new "Change Image" button and `handleSubmit`'s post-submit cleanup, which previously duplicated this logic inline)
- The new endpoint shares the existing `imageUploadLimiter` (5 requests/5min) with `/upload-image`; the test-only `/api/__test__/reset-rate-limit` endpoint now resets both `eventRequestLimiter` and `imageUploadLimiter`, since a test run exercising several image-related tests could otherwise exhaust the real window across tests that each look independent
- New `tests/fetchImageUrl.test.js` (7 tests) and `tests/e2e/image-url-crop.spec.js` (5 tests, using a real throwaway local HTTP server to exercise the server-side fetch end-to-end); `tests/e2e/event-image-crop.spec.js` updated for the restructured markup and the new "Change Image" flow

## 2.24.2 - 2026-08-31

### Changed
- **Removed the per-server timezone setting for the moderator Edit modal, and added a visible timezone hint to the public event-request form instead.** Discord's own Scheduled Event UI has no server-timezone concept at all — every event is created in the creator's own local time and shown back to each viewer in theirs automatically, the same as any Discord timestamp. The per-server `/eggshen-config-events event-requests timezone` setting (added in 2.24.0) was solving a problem Discord's own product doesn't try to solve, so it's been removed; the moderator Edit modal's Start/End Time fields are UTC-only again (as in 2.23.0). The real gap was on the submission side: the web form already correctly converts a submitter's typed local time to UTC (via the browser's own `Date` parsing), it just never showed what timezone it was assuming — the form now displays "Times shown in your local timezone: [detected zone]" next to the time fields so submitters can confirm it's correct

### Developer
- `src/utils/eventTimeInput.js`, `src/utils/eventRequestApproval.js`'s `applyEventTimeEdits()`, and `src/handlers/buttonHandler.js`'s Edit modal fields reverted to their 2.23.0 UTC-only shape — removed `timeZone` parameters, `zonedTimeToUtc()`/`getZonedParts()`, `isValidTimeZone`/`ALL_TIME_ZONES` exports, and the `buildTimeFieldLabel()` variable-width-label helper (no longer needed once every label is the fixed string `"Start Time (UTC)"`)
- Removed the `/eggshen-config-events event-requests timezone` subcommand, its autocomplete handler, and `guildConfig.js`'s `eventRequests.timezone` default field
- `public/index.html` gained a `<small id="timezone-hint">` next to the Start Time field (reusing the existing `.form-group small` hint styling every other field already uses); `public/app.js` fills it in on load via `Intl.DateTimeFormat().resolvedOptions().timeZone` — no change to `combineDateTimeToISO()` or the submission payload, since the conversion itself was already correct
- New `tests/e2e/timezone-hint.spec.js` (Playwright) confirms the hint shows a real detected zone name, not the static placeholder
- Test suites for the removed timezone logic reverted to their 2.23.0 scope; `tests/eggshen-config-timezone.test.js` deleted entirely

## 2.24.1 - 2026-08-31

### Fixed
- **`/eggshen-config` had grown too large to redeploy.** Discord caps a single slash command's serialized size at 8000 bytes on the bulk command-registration endpoint this bot uses — `/eggshen-config`'s 9 subcommand groups had grown to 16748 bytes (over double the limit) across many past sessions, which silently blocked *every* future slash-command deploy for the entire bot the moment anyone next ran the deploy script, not just this command. Split into 5 separate commands, each with real headroom under the limit: `/eggshen-config` (settings, stats, commands, notifications), `/eggshen-config-watch-party` (watch party channels, rate limiting), `/eggshen-config-ai` (AI image generation), `/eggshen-config-moderation` (whitelist, cooldowns, auto-ban), and `/eggshen-config-events` (event requests, including the timezone setting added in 2.24.0). Every subcommand's name, options, and behavior are unchanged — only the top-level command name differs for the groups that moved

### Developer
- `src/commands/eggshen-config.js` split into 5 files: the trimmed-down original plus new `eggshen-config-watch-party.js`, `eggshen-config-ai.js`, `eggshen-config-moderation.js`, `eggshen-config-events.js` — command auto-discovery in `index.js` needed no changes since commands are already keyed by their own `data.name`, not filename
- All in-bot message strings, `docs/**/*.md`, `EVENT_REQUEST_SETUP.md`, `PRODUCTION_TESTING.md`, `.env.production-testing`, `public/app.js`, and `scripts/validate-oauth-config.js` updated to reference the correct new command name for each moved group
- `tests/eggshen-config-command-refs.test.js` generalized to run its schema-consistency check (every `/command <group> <subcommand>` reference in a file's own source must name a real group/subcommand of that command) against all 5 files independently, plus a new cross-file check confirming references between the 5 commands point at real groups on the referenced command
- Verified all 5 files serialize well under Discord's 8000-byte cap (2866–4793 bytes each) via a direct `Buffer.byteLength(JSON.stringify(data.toJSON()))` check

## 2.24.0 - 2026-08-30

### Added
- **Moderators can now configure a per-server timezone for the event-request Edit modal's Start/End Time fields**, instead of always typing UTC. `/eggshen-config event-requests timezone timezone:America/New_York` (autocomplete-assisted, full IANA timezone database) sets the zone once; the Edit modal's Start Time/End Time labels and pre-filled values then reflect that zone automatically, and moderators simply type normal local wall-clock time (e.g. `2026-09-02 17:30` for 5:30pm Eastern) — daylight saving time is handled automatically via the IANA timezone database, so the same zone correctly produces a different UTC offset in summer vs. winter. Defaults to UTC for any server that never configures this, with no behavior change

### Developer
- `src/utils/eventTimeInput.js`: `parseUtcTimeInput()`/`formatUtcForInput()` now accept an optional `timeZone` parameter (default `'UTC'`, fully backward compatible), converting via the IANA tz database (`Intl.DateTimeFormat`'s `formatToParts`, a "guess then correct by offset" round trip — no dependency, no fixed-offset math) rather than raw UTC math when a non-UTC zone is configured. New exported `isValidTimeZone()`/`ALL_TIME_ZONES` (`Intl.supportedValuesOf('timeZone')`, plus an explicit `'UTC'` entry since the platform list doesn't include it) shared by `/eggshen-config`'s validation and autocomplete — validation is exact-match against this list, not a lenient `try/catch`, since the latter is case-insensitive and would let a moderator save an inconsistent casing
- `applyEventTimeEdits()` in `src/utils/eventRequestApproval.js` takes a 5th optional `timeZone` parameter, threaded through from `index.js`'s `edit_event_modal_` handler via a fresh `loadGuildConfig()` read at the orchestration layer
- `buttonHandler.js`'s Edit modal now loads guild config to label Start/End Time fields with the configured zone and pre-fill using the zone-aware formatter, with a new `buildTimeFieldLabel()` helper that respects Discord's 45-character label cap — falls back to dropping the ", optional" hint for the longest real IANA zone name (`America/Argentina/Rio_Gallegos`), with a further ellipsis-truncation safety net for any future longer zone name
- New `/eggshen-config event-requests timezone` subcommand + `autocomplete` export in `eggshen-config.js`, following the existing `survey.js` autocomplete pattern; new `timezone: 'UTC'` field in `guildConfig.js`'s `defaultConfig.eventRequests`

## 2.23.0 - 2026-08-30

### Added
- **Moderators can now correct an event request's start/end time directly in the Edit form**, instead of having to approve first and then fix the schedule in Discord's own event editor afterward. Two new fields, **Start Time (UTC)** and **End Time (UTC, optional)**, are pre-filled with the request's current schedule and accept a strict `YYYY-MM-DD HH:mm` (24-hour) format — always UTC, clearly labeled, since a Discord modal has no timezone-aware picker. An unparseable value, a start time in the past, or an end time before the start time is rejected with a clear explanation and nothing is saved; leaving End Time blank clears it (no end time set)

### Developer
- New `src/utils/eventTimeInput.js`: `parseUtcTimeInput()`/`formatUtcForInput()` handle the strict UTC text format round-trip, building the instant explicitly via `Date.UTC()` rather than relying on `new Date(string)`'s implicit-local-time parsing, with a round-trip check that catches `Date.UTC`'s silent date-rollover behavior (e.g. Feb 30 → Mar 2)
- New `applyEventTimeEdits()` in `src/utils/eventRequestApproval.js` validates and applies the edited start/end time onto `requestData` in place (future-start-time check, end-after-start check) — mutates nothing on failure. Reused by `index.js`'s `edit_event_modal_` handler, which now validates time before any other field write so a rejected edit leaves the stored request completely untouched; `createScheduledEventFromRequest()` is unchanged since it already just consumes whatever ISO strings are on `requestData`
- `buttonHandler.js`'s Edit modal now has 5 fields total (title, description, image URL, start time, end time) — at Discord's per-modal `ActionRowBuilder` cap
- The moderation-channel embed's `📅 Start Time`/`⏱️ End Time` fields now update in place when an edit changes the schedule, including adding/removing the End Time field when it's newly set or newly cleared

## 2.22.4 - 2026-08-30

### Fixed
- **Approved event requests now show the actual selected channel as the event's location, instead of a hardcoded "Discord Server."** Text-channel-only events (no voice channel involved) always set the Discord Scheduled Event's location field to the literal string "Discord Server," regardless of which channel a moderator/requester actually picked — the real channel was only ever mentioned in the event description, never in the location Discord shows at the top of the event card. The location now reflects the real channel name (e.g. "#watch-party"), falling back to the server name only if the channel can no longer be found

### Developer
- `createScheduledEventFromRequest()` in `src/utils/eventRequestApproval.js` now builds the External-type event's `entityMetadata.location` from `guild.channels.cache.get(requestData.channelId)`'s name instead of a hardcoded string, truncated to Discord's 100-character location limit. Voice-channel events (`entityType: 2`) are unaffected — Discord already renders those with a real, clickable channel link
- New tests in `tests/eventRequestApproval.test.js` cover the real-channel-name location, the guild-name fallback when the channel is missing from cache, and truncation of an overlong channel name

## 2.22.3 - 2026-08-30

### Fixed
- **Setup docs told new operators to enable Discord intents the bot doesn't use, and gave an incomplete bot-permissions list.** `docs/installation.md` and `docs/api-keys.md` instructed enabling the privileged **Server Members** and **Message Content** intents — the bot's actual gateway intents (`src/index.js`) are `Guilds`, `GuildMessages`, and `GuildMessageReactions` only, so those two were unnecessary and never should have been requested. Separately, every setup doc's bot-invite permission list was missing **Manage Events** (needed to create Discord Scheduled Events on event-request approval), **Attach Files** (needed for `/image` and bracket exports), and **Manage Messages** (needed for legacy reaction-based poll cleanup) — a bot invited with only the old list would hit real "Missing Permissions" errors on those features, exactly as happened on a live server this fixes the docs for

### Developer
- Corrected `SETUP_DISCORD_BOT.md`, `QUICKSTART.md`, `docs/installation.md` (which was also missing an OAuth2 invite-link step entirely — added one), `docs/api-keys.md`, `EVENT_REQUEST_SETUP.md`, and `docs/features/event-requests.md`'s troubleshooting sections to list the full, accurate permission set and correct intent guidance, plus added dedicated troubleshooting entries distinguishing channel-level permission overrides (e.g. a locked-down moderation channel) from the server-wide **Manage Events** permission, since they fail with different Discord error codes and need different fixes

## 2.22.2 - 2026-08-30

### Changed
- **Removed references to the maintainer's own production domain and Discord server from the open-source repo and docs.** Example URLs and a tournament-name example previously used the maintainer's real, identifiable infrastructure — replaced with generic placeholders (`example.com`, `dev.example.com`, `"The Ultimate Horror Cup"`) everywhere, including the `/bracket create` command's own description text

## 2.22.1 - 2026-08-30

### Fixed
- **Submitting an event request on one domain no longer blocks a submission on another domain.** A bot process serving the event-request form for more than one domain (e.g. a dev subdomain alongside production) had its rate limiter (1 request per 5 minutes) keyed on IP address alone — so a submission on one domain would incorrectly block an immediate follow-up submission on the other, even though they're separate websites going to separate Discord servers. The same fix applies to the channel-lookup and image-upload limiters, which had the same gap

### Developer
- All three `express-rate-limit` instances in `src/api/server.js` (`eventRequestLimiter`, `channelFetchLimiter`, `imageUploadLimiter`) now use a shared `hostAndIpKeyGenerator` keyed on `${req.get('host')}:${ipKeyGenerator(req.ip)}` instead of the library's IP-only default
- The test-only `/api/__test__/reset-rate-limit` route (used by the Playwright e2e suite) updated to reset using the same host+IP key, so it still resets the correct bucket
- New `tests/eventRequestRateLimitByDomain.test.js` verifies a submission on `dev.example.com` doesn't rate-limit `example.com`, and that two submissions on the same domain are still correctly blocked (regression guard)

## 2.22.0 - 2026-08-29

### Added
- **`/timer start` no longer traps you with a bad auto-detected title.** In a watch-party channel, running `/timer start` with no options pulls the title from that channel's linked Discord scheduled event — but if that title didn't cleanly match a movie/TV/board game (no results, or several ambiguous ones), there was previously no way to correct it: a no-match silently started the timer under the wrong name, and the ambiguous-results picker only offered to proceed with that same wrong name. Both cases now offer a **🔎 Search** button that opens a box to type the correct title and search again — as many times as needed — alongside a **▶️ Start Timer** button to proceed without a duration if you'd rather not search. A label you type yourself (`label:`/`movie:`/`tv:`) is unaffected — its existing behavior is unchanged

### Developer
- New exported `runTitleSearchAndDecide()` in `src/commands/timer.js`, extracted from `execute()`'s previously-inline episode-range/generic-search/zero-results logic, now parameterized on a `wasAutoDetected` flag (`true` only when the label came from a scheduled event, never for `label:`/`movie:`/`tv:`) — gates both the new zero-results recovery screen and the extra Search button on the existing ambiguous-results picker
- New `timer_retype_${theme}` button (`src/handlers/buttonHandler.js`) opens a modal (`timer_retype_modal_${theme}`) to capture a retyped title; its submission handler (new branch in `src/index.js`'s modal-submit dispatcher, mirroring the existing `timer_extend_modal_` branch) re-runs `runTitleSearchAndDecide()` with `wasAutoDetected: true`, so the recovery screen can reappear indefinitely until a search resolves or "Start Timer" is chosen
- New `timer_skip_noauto_${theme}` button starts the timer with no duration from the new zero-results screen, reusing the existing fallback-duration mechanism (`guildConfig.maxTimerDurationMinutes`, default 360) unchanged
- The existing picker's "⏭️ Skip - Start Timer Without Duration" select-menu option relabeled "▶️ Start Timer (No Duration)" everywhere (including the unaffected `label:`/`movie:`/`tv:` path), since "Skip" implied a search the user may not know happened
- New tests: `tests/timer-retype-flow.test.js`, `tests/timer-retype-button.test.js`, `tests/timer-retype-modal.test.js`, `tests/timer-skip-noauto-button.test.js`

## 2.21.1 - 2026-08-29

### Changed
- **The event-request web form's Guild ID no longer lives in a file tracked by git.** Previously `public/app.js`'s `GUILD_ID` constant was hardcoded directly in a committed file, so every deployment's real value had to be preserved around each `git pull` (stash/pull/pop) or it would get clobbered by the repo's placeholder — and vice versa, a real edit always showed up as a dirty working tree. It now lives in `public/config.js`, a new gitignored file (copy `public/config.example.js` to create it) loaded before `app.js` — the same pattern this project already uses for `.env` and other server-local state. A plain `git pull` now never touches it

### Developer
- New `public/config.example.js` (committed template) sets `window.EGG_SHEN_CONFIG.GUILD_ID`; `public/app.js` reads `window.EGG_SHEN_CONFIG?.GUILD_ID` as a fallback below the existing `e2eGuildId` query-param override (unchanged, still takes priority — the Playwright e2e suite needed no changes)
- `.gitignore` gained `public/config.js`; every "edit `GUILD_ID` in `public/app.js`" instruction across `EVENT_REQUEST_SETUP.md`, `docs/features/event-requests.md`, `docs/commands/configuration.md`, `scripts/validate-oauth-config.js`, and the `/eggshen-config event-requests` command's own reply messages (`get-link`, `view`, `website-url`) updated to reference `config.js` instead

## 2.21.0 - 2026-08-29

### Added
- **The event-request web form can now be deployed on more than one domain from a single bot process, with OAuth login working correctly and independently on each.** Previously the OAuth redirect target was a single static value (`OAUTH_REDIRECT_URI`/`FORM_URL`), so a login started on a second domain would incorrectly bounce the user back to whichever domain happened to be configured — now the bot derives the correct redirect target from the actual domain each login started on

### Changed
- **The "you're not a member" rejection message is clearer about why it's happening.** Previously read "You must be a member of [server] to submit event requests," which a legitimate member of a *different* Discord server could misread as a general account problem — now explicitly states the page is dedicated to one specific server, so it's clear the restriction is about which site you're on, not your Discord account

### Developer
- `GET /api/auth/discord` now derives its `redirect_uri` from the incoming request's own `Host`/protocol instead of the static `OAUTH_REDIRECT_URI` env var, and embeds the originating domain in Discord's `state` param (alongside the existing `guildId`)
- `GET /api/auth/discord/callback` decodes that domain back out of `state` and uses it for both the token-exchange `redirect_uri` (must exactly match the authorize step, per OAuth2 spec) and the post-login redirect — replacing the previously-static `FORM_URL`. Falls back to the env vars only when a request's domain genuinely can't be determined
- Both the OAuth-callback and submission-time "not a member" messages reworded for consistency
- `EVENT_REQUEST_SETUP.md`'s "Multiple Servers" section rewritten — it previously described a `?guild=ID` query-param multi-tenancy model that doesn't match this codebase's actual architecture (one hardcoded `GUILD_ID` per static deployment); now documents the real per-domain deployment pattern with a worked dev/prod subdomain example

## 2.20.2 - 2026-08-29

### Fixed
- **The moderator crop page still showed an already-cropped image after adjusting the crop box before submitting.** The previous fix (2.20.1) correctly preserved the original, but only attached it to the *first* upload call — every subsequent re-crop (the debounced re-upload that fires after dragging the crop box) uploaded under a brand new token with no original attached, and that later token was the one that actually ended up in the submitted request. The original is now sent with every re-crop upload, not just the first, so whichever upload ends up being submitted always has its original correctly preserved

### Developer
- `public/app.js`'s `uploadImageBlob()` now sends the current selection's original file on every call instead of clearing it after the first — renamed the tracking variable (`pendingOriginalFile` → `currentOriginalFile`) to reflect that it persists for the whole file selection, not just its first upload
- Fixed a race in the new `tests/e2e/event-image-crop.spec.js` original-preservation test itself (`page.waitForResponse` was registered after `page.goto()` had already resolved the request) — the corrected test now genuinely exercises the drag-then-submit path that reproduced this bug

## 2.20.1 - 2026-08-29

### Fixed
- **The moderator crop page now loads the submitter's true, uncropped original — not a re-crop of their already-cropped result.** The submission form only ever uploaded the cropped output (used for the Discord event), so the moderator crop page had nothing else to load and was re-cropping an already-cropped image. The raw original is now preserved separately on upload (both from the submission form and when a moderator uploads a new source image on the crop page) and is what the crop page pre-loads, while the Discord event still uses the cropped result as before

### Developer
- New `saveOriginalImage()`/`getOriginalImagePath()` in `eventImageStore.js`, storing the original under a `-original` suffixed sibling key so it's tracked, renamed, and retained/pruned on the same lifecycle as the cropped copy (`renameImageKey()` and `recordEventDate()` now propagate to the original entry too)
- `POST /api/event-request/upload-image` and `POST /crop/:requestId/save` now accept two multipart fields (`image` for the cropped result, optional `original` for the raw source) via `upload.fields()` instead of `upload.single()` — also caught and fixed a latent multer `limits.files` cap of 1 that would have rejected any two-file upload
- `GET /crop/:requestId/current-image` now prefers the preserved original, falling back to the cropped copy for older/mod-added images with no separate original on file

## 2.20.0 - 2026-08-29

### Fixed
- **Uploaded event images now actually attach to the created Discord event.** The previous release's image-upload feature worked correctly in every isolated test, but nginx's default 1MB request body limit was silently rejecting real-sized image uploads before they ever reached the bot — confirmed and fixed on the production deployment (nginx's `client_max_body_size` raised to 10MB for the API route), with the requirement documented so other deployments don't hit the same silent failure. The upload form now also shows a clear message instead of a confusing raw error if a proxy rejects an upload before the bot's own response can come back

### Added
- **Uploaded event images can now be cropped.** Selecting a file on the web form shows an in-browser crop tool, pre-framed to Discord's 16:9 event-cover shape — submit right away or drag to adjust first. Applies to uploaded files only (pasted image URLs submit as before)
- **Moderators can crop or replace an event's image directly from Discord.** Each request in the moderation channel now has a "🖼️ Crop Image" link button — no login needed, the link itself (signed, single-use, expires in ~30 minutes) is what authorizes access. Opens a small page to adjust the submitter's image or upload and crop a different one, including adding an image to a request that didn't have one
- The moderation-channel embed now shows an **🖼️ Image** status field (`✅ Uploaded` / `🔗 Linked (URL)` / `❌ None`) so moderators can see at a glance whether a request has an image before approving
- The web form's Event Title field now hints at including the release year in parentheses (e.g. "Tragedy Girls (2017)"), which helps the bot's title-matching correctly identify the exact movie, show, or game later on

### Developer
- New `src/utils/cropLinkToken.js` — dependency-free HMAC-SHA256 signed tokens (via Node's built-in `crypto`, using `crypto.timingSafeEqual` for comparison) scoping the moderator crop page to one request, with in-memory single-use tracking
- Three new routes in `server.js`: `GET /crop/:requestId` (the crop page), `GET /crop/:requestId/current-image` (streams the existing image for pre-loading), `POST /crop/:requestId/save` (saves the cropped result) — gated by the signed token rather than the public per-IP rate limiter, and served from a newly-added but narrowly-scoped `/crop-assets` static mount (`public/crop/`) rather than exposing all of `public/` from the bot's own origin
- New required env vars for this feature: `EVENT_CROP_LINK_SECRET` (signing key) and `PUBLIC_BOT_URL` (the bot API's own externally-reachable origin, distinct from the separately-hosted form's `FORM_URL`) — both optional; the "Crop Image" button is simply omitted if unset
- Fixed two latent gotchas in `eventImageStore.js`'s overwrite path while building the crop-save route: replacing an image under a different file extension no longer leaves the old file orphaned on disk (`deleteImage()` before `saveUploadedImage()`), and `recordEventDate()` is now re-called after an overwrite so a freshly-cropped image doesn't lose its retention-sweep eligibility
- Cropper.js v1 (CDN, no new dependency) powers both the submission-form and moderator crop UIs; the submission form uploads on the initial auto-crop and again (debounced ~800ms) on further adjustment, refactored into a shared `uploadImageBlob()` helper in `app.js`

## 2.19.0 - 2026-08-28

### Added
- **Event requests can now include a cover image.** On the web form, submitters can upload an image file (PNG, JPEG, GIF, or WebP, up to 8MB) or paste an image URL — uploading happens immediately on file selection, before the rest of the form is submitted, so problems surface right away. Whichever image is provided becomes the created Discord Scheduled Event's cover image
- **Moderators can set or override the event image when approving a request.** The existing Edit-before-approve modal gained an optional Image URL field — entering a URL there always wins over whatever the submitter provided (upload or URL), letting moderators add an image to a request that had none, or replace one they don't like. Leaving it blank never clears an existing image; it's an override, not a "remove image" control
- Uploaded event images are automatically deleted ~90 days after their linked event's date has passed (or sooner if the request is never approved), so storage doesn't grow unbounded

### Developer
- New `src/utils/eventImageStore.js` — local-disk image storage with a JSON manifest tracking each stored image's linked event date, following this codebase's existing flat-file persistence convention (no database). Images are uploaded under a client-generated placeholder token before a request exists, then renamed to the real request ID once submission succeeds
- New `POST /api/event-request/upload-image` endpoint in `server.js`, backed by `multer` (new dependency) with in-memory buffering, an 8MB/1-file limit, and a PNG/JPEG/GIF/WebP mimetype allowlist; rate-limited to 5 uploads per 5 minutes per IP
- `POST /api/event-request` gained optional `imageToken`/`imageUrl` fields, mutually exclusive (an uploaded file wins if both are somehow present)
- New `resolveEventImageBuffer()` in `eventRequestApproval.js` resolves the final image (mod-set URL > uploaded file > user-submitted URL > none) into a `Buffer` before event creation — required because `scheduledEvents.create()`'s `image` option accepts a `Buffer`/base64 data URI, not a raw URL
- New `src/utils/eventImageCleanupScheduler.js` — a daily (not per-minute, unlike the other schedulers) sweep pruning expired and orphaned uploaded images, wired into `index.js`'s existing scheduler init/shutdown lifecycle

## 2.18.2 - 2026-08-27

### Added
- **`/timer start` gained `movie` and `tv` options** as an alternative to `label` — an explicit way to say "this is a movie" or "this is a TV show" instead of typing free text into `label` and letting the bot search movies, TV, and board games all at once. This skips the ambiguous merged search entirely (useful when a movie and a TV show happen to share a name) and makes the decisive-match auto-selection more reliable, since a single-type search doesn't need to wait on the other types coming back empty first. `tv` also accepts episode-range notation (e.g. `tv:"Tales from the Crypt S5E5-E8"`), resolved exactly the same way typing that into `label` already works. Only one of `label`/`movie`/`tv` may be used at a time — providing more than one is rejected with a clear error. `label` itself is completely unchanged

### Developer
- New explicit-type branch in `timer.js`'s `start` handler, inserted before the existing channel-auto-detect/episode-range/general-search blocks and gated to run only when `movie`/`tv` was provided (those blocks are otherwise untouched, since they only ever fire when `label` is set — which stays empty when `movie`/`tv` is used instead)
- Reuses `hybridSearch`, `pickLandslideWinner`, `parseEpisodeRange`, and `resolveEpisodeRangeDuration` as-is; the resulting picker option values (`timer_movie_<id>_<theme>`, `timer_tv_<id>_<theme>`, and the range-suffixed shape) match what `selectHandler.js`'s existing `timer_select_runtime` dispatch already understands, so no handler changes were needed

## 2.18.1 - 2026-08-25

### Added
- **New `/eggshen-config settings timer-control` setting lets a server allow any member to pause, resume, or stop a timer**, instead of only the timer's starter plus admins/mods (still the default). Useful for servers where the person who started a watch party timer isn't always around to react — pausing for a break or stopping when something goes wrong shouldn't have to wait on one specific person. `/timer adjust` and `/timer autostop` are unaffected by this setting and always stay restricted to the starter or an admin/mod, since changing a timer's duration or auto-stop configuration is a more consequential action than just pausing/stopping it

### Developer
- Added `canControlTimerPauseStop(timer, userId, member, guildConfig)` to `timerManager.js` — a single shared permission check now used by `/timer stop`/`pause`/`resume`, replacing three (of five) previously-duplicated inline `isAdmin`-or-starter checks in `timer.js`. `adjust`/`autostop` keep their existing inline checks unchanged, deliberately not routed through the new helper
- Added `allowAnyonePauseStopTimer: false` to `guildConfig.js`'s `defaultConfig`

## 2.18.0 - 2026-08-25

### Added
- **`/movie`, `/tv`, and `/episode` now skip the "which one did you mean" picker when a search result is a decisive, clear-cut match**, using the AI semantic-ranking score the bot already computed internally but never acted on. Ambiguous or close results (e.g. a movie and its same-named remake) still show the picker as before — this only kicks in when one result is unmistakably the best match
- **The picker now cross-checks IMDb's release year against TMDB's for the first few results**, showing both when they disagree (e.g. `It (1990 (IMDb: 1991))`) — addresses the "the year doesn't match what I remember from IMDb" confusion, without adding the cost of checking every row (capped at the top 5 candidates)
- **`/episode`'s show-name lookup now uses the same AI-powered ranking `/movie` and `/tv` already had** (previously a plain keyword search with no semantic ranking or alternate-title matching at all)
- **`/timer start` now understands multi-episode watch parties.** A label like "Tales from the Crypt - S5: E5 - E8" is recognized as one watch party spanning episodes 5 through 8 of season 5 — the bot resolves the show, sums each episode's actual runtime, adds the usual 10-minute buffer, and shows a full breakdown (not just a final number) so you can sanity-check it before the timer starts. Supports `S5E5-E8`, `S5: E5 - E8`, `S05E05-E08`, `Season 5 Episode 5-8`, `Season 5, Episodes 5-8`, and single-episode notation (`S3E1`, `3x11`)
- **`/timer start`'s general movie/TV auto-detection also gets the decisive-match auto-selection** described above — a clear single-type winner (with nothing competitive in the other search types) starts the timer directly instead of always showing a picker for 2+ combined results

### Developer
- Added `pickLandslideWinner(results)` to `aiService.js` — reads the `semanticScore` `hybridSearch`'s re-ranking already attaches to every result but that nothing previously consumed. Requires both a high absolute score and a clear lead over the runner-up (launch constants, logged on every decision for future tuning from real usage)
- Added `src/utils/episodeRangeParser.js` (`parseEpisodeRange`) — a new, self-contained parser that scans a free-text label for embedded season/episode-range notation and returns both the structured range and the show name with the notation stripped out. Distinct from `episode.js`'s existing `parseSeasonEpisode` (anchored, single-episode-only, built for a dedicated episode field)
- Added `sumEpisodeRuntimes()` to `tmdbService.js`, consuming `getSeasonDetails()`'s existing one-call-per-season episode list. Falls back to the show's average episode runtime for any episode TMDB lacks a specific runtime for, flagging it `estimated` rather than silently undercounting
- Added `attachImdbYearCrossCheck()` to `embedBuilder.js`, called from the picker-rendering path only (never on the auto-select fast path, which renders no picker rows)
- `/timer start`'s general auto-detection now runs its movie/TV sub-searches through `hybridSearch()` (previously plain `searchMovies`/`searchTVShows`) and checks each type independently for a landslide winner — never comparing a movie's semantic score to a TV show's, sidestepping a cross-type ranking-comparison problem
- The `timer_select_runtime` picker's option-value encoding gained an optional `_range_<season>_<epStart>_<epEnd>` suffix for range-picker selections, extending (not replacing) the existing `timer_<type>_<id>_<theme>` shape — mirrors the `timer_extend_<channelId>` precedent of embedding round-trip state directly in the customId/value string

## 2.17.3 - 2026-08-24

### Fixed
- **A timer with no set/detected duration no longer shows a fake-looking "Total Duration" in `/timer status` or the start confirmation.** Since v2.17.2, a timer with nothing typed and nothing auto-detected got a real internal 6-hour fallback duration (so it could still auto-stop and warn) — but that number was also being displayed as if it were a genuine detected or user-set duration, which it wasn't. The fallback still auto-stops and still warns an hour before, exactly as before; it's just invisible in `/timer status`/the start embed now, matching how a truly durationless timer used to look. A real duration (typed manually, auto-detected from a movie/TV/board game runtime, or set via `/timer adjust`) still displays normally

## 2.17.2 - 2026-08-20

### Changed
- **Timers no longer have a default duration cap.** In v2.17.1, `/eggshen-config settings max-timer-duration` clamped *every* timer duration — explicit, auto-detected, or otherwise — down to 6 hours by default. That wasn't the intent: a deliberately long timer (an explicit `duration:500`, or an auto-detected 8-hour concert film) should run for its real length. Timers with a real duration now always run exactly as long as requested, with no maximum, unless a server explicitly opts into one
- **`max-timer-duration` now only controls the *fallback* duration** used when a timer has no real duration at all — no `duration` typed, no label matched anything, or "Skip" was chosen from the title-selection menu. That fallback still defaults to 6 hours and is still server-configurable (`minutes:<n>` / `unlimited:true`), and the expiry warning + "Extend Timer" button still only ever fires for these fallback-duration timers, never for a timer with a real duration
- **New `/eggshen-config settings timer-ceiling`** lets a server optionally cap real (explicit/detected) durations too, for those who want the old always-clamp behavior back. Off by default — `enabled:true minutes:<n>` turns it on

### Developer
- `timerManager.js`'s `clampTimerDuration` reworked: previously always clamped using `maxTimerDurationMinutes`/`maxTimerDurationUnlimited`; now only clamps when `guildConfig.timerCeilingEnabled` is true, against `timerCeilingMinutes`. `maxTimerDurationMinutes`/`maxTimerDurationUnlimited` keep their names but now mean "fallback duration" / "no fallback" rather than "cap" / "no cap"
- `startTimer()` gained an `isFallbackDuration` flag, set whenever `startTimerCountdown()` (in `timer.js`) had to substitute the server's fallback duration because no real duration existed. Threaded through `adjustTimerDuration()` too — clearing the flag on any explicit adjust/extend, since that's now a real, informed value
- `timerScheduler.js`'s expiry-warning sweep now skips any timer where `isFallbackDuration` isn't true, so a long real duration never triggers the warning
- `selectHandler.js`'s `timer_select_runtime` handler now loads guild config and passes it into `startTimerCountdown()`, so the "Skip" and no-runtime-found paths get the same fallback-duration treatment as `/timer start`'s own zero-results case

## 2.17.1 - 2026-08-20

### Added
- **Timers now have a default 6-hour (360 min) safety cap**, configurable per server. Previously a timer with no duration set (or a very long one) could keep running indefinitely if nobody noticed — this is what happened when a timer started on a Saturday was still running the following Tuesday. Applies to `/timer start`, `/timer adjust`, and `/timer autostop enable`; a requested duration over the cap is automatically reduced, with the reply noting it was capped
- **A warning now posts in-channel ~1 hour before a timer with a duration is about to auto-stop**, mentioning whoever started it, with an "Extend Timer" button. Clicking it opens a short form to add more minutes — handy for watch parties that run long
- **New `/eggshen-config settings max-timer-duration`** lets administrators/moderators raise, lower, or fully disable the cap for their server (`minutes:<1-1440>` and/or `unlimited:true`) — useful for servers that regularly run overnight or marathon sessions
- **`/timer start`'s runtime auto-detection now tells you explicitly when it finds nothing**, instead of silently starting a durationless timer with no indication anything was searched — this silent case was the actual root cause of the stuck-timer incident above

### Developer
- Added `clampTimerDuration(durationMinutes, guildConfig)` to `timerManager.js` — a single pure function used by every duration-setting call site (`start`, `adjust`, `autostop enable`, and the new extend-modal handler) so the `unlimited` override only needs to be checked in one place
- Added `src/utils/timerScheduler.js`, a 1-minute interval sweep for timers approaching their auto-stop time, following the same init/shutdown pattern as `tournamentScheduler.js`/`pollScheduler.js`, with its own `sentWarnings` Map (keyed by channel, cleared on extend) to avoid re-warning every tick
- Added a `timer_extend_` button branch to `buttonHandler.js` (opens a modal for additional minutes) and a `timer_extend_modal_` branch to `index.js`'s modal-submission dispatcher — same starter-or-admin/mod permission check already used by `/timer stop`/`/timer adjust`
- Raised `/timer start`/`/timer adjust`/`/timer autostop`'s Discord-side option max from 600 to 1440 minutes — the real enforcement now happens server-side via `clampTimerDuration` against the guild's configured cap, so a server can configure any cap up to 24h (or go unlimited) without a schema change

## 2.17.0 - 2026-07-21

### Added
- **New `/announce` command generates AI-written watch party announcement text** for moderators/admins to copy and post themselves. Takes one or two titles (movies or TV episode ranges, with flexible notation like `S3E9-E12`, `Season 3 Episode 9`, etc.), a start time, and an optional host and tone (`Funny`/`Scary`/`Dramatic`/`Wholesome`/`Mysterious`, or a free-text `custom-tone`). Looks up each title's real plot and streaming availability from TMDB so the generated flavor text is actually about the movie/show, not generic filler. The reply is private and formatted as a copy-paste-ready code block — the bot never posts the announcement anywhere on its own, and nothing about it is configurable or persisted; it's a one-shot text generator

### Developer
- Added `generateAnnouncementText()` to `src/services/aiService.js` — the bot's first chat-completion call (`gpt-4o-mini`), separate from the existing embedding-only OpenAI usage
- Exported `normalizeProviders` from `embedBuilder.js` so `/announce` can reuse the same streaming-provider-name cleanup `/movie`/`/tv` already use, instead of duplicating it

## 2.16.1 - 2026-07-16

### Changed
- **`/timer status` and `/timer check` now default to private**, only visible to whoever ran the command. Most people check the timer just to glance at their own progress, and showing that to the whole channel every time flooded it with messages nobody else needed to see. Add `public:true` to announce the current status to the whole channel instead — the opposite default from the search commands, chosen deliberately for this specific command's actual usage pattern

## 2.16.0 - 2026-07-15

### Changed
- **Search results are now visible to the whole channel by default.** `/movie`, `/tv`, `/episode`, `/episode-list`, `/game`, `/boardgame`, `/book`, `/soundtrack`, `/watched add`, and `/image` all used to defer their reply as private (ephemeral) and never made it public again — even the final answer, not just the "which one did you mean" picker. Since these are shared lookup commands meant for the whole channel to see, results now post publicly by default. Add `private:true` to any of these commands to keep a result to yourself, exactly like before

### Developer
- Added `src/utils/interactionResponse.js` (`deliverResult`, `encodePrivateFlag`/`decodePrivateFlag`) as the single shared mechanism for "post this result publicly, unless the user asked to keep it private" — used by every affected command's single-result path and by `selectHandler.js`'s picker-selection branches, so the same logic doesn't get duplicated (and drift) across 10+ call sites
- The multi-result picker step always stays ephemeral regardless of the `private` flag (no channel clutter while narrowing down results) — the flag is encoded into the picker's select-menu option values so it survives to the later selection interaction, which decides the final result's visibility
- Fixed `/episode-list`'s picker-selection path, which — unlike the equivalent flow in `/movie`, `/tv`, `/game`, etc. — never posted publicly at all, even before this change

## 2.15.2 - 2026-07-11

### Changed
- **Survey results now visually highlight the leading option.** A sole leader gets a 🏆 crown, bold text, and a solid progress bar, while every other option uses a dimmer shaded bar (`▓` instead of `█`) — since Discord embed text can't be colored, this gives the leader real visual weight using only text/Unicode. No crown is shown when the top spots are tied or before any votes are cast

## 2.15.1 - 2026-07-11

### Changed
- **New surveys now use buttons to vote instead of emoji reactions.** With reactions, the number badge under each option always showed one more than the real vote count, since Discord counts the bot's own setup reaction alongside everyone else's — the embed's own "Total votes" text was always correct, but the badge looked wrong at a glance. Buttons don't have this artifact: clicking one records your vote, updates the survey message live, and sends you a private confirmation. Surveys already in progress when this ships keep working exactly as before (reactions); only newly created surveys get buttons

### Developer
- Added `poll.votingMethod` (`'buttons'` for every poll going forward; absent/`'reactions'` on anything created before this change) so the reaction handlers, `closePollAndAnnounce`, and the embed footer text all know which UI a given poll uses
- Added `castSingleVote`/`toggleVote` to `pollManager.js` (single-select overwrite vs. multi-select toggle-on/off) and `buildSurveyButtons` (chunks up to 10 options into 2 rows of 5, matching Discord's per-row button limit)
- Added a `survey_vote_` branch to `src/handlers/buttonHandler.js`'s dispatcher and a `handleSurveyVote` function, mirroring the existing tiebreaker-voting button pattern (`handleTiebreakerVote`) already used elsewhere in this bot
- `closePollAndAnnounce` now disables buttons (rather than calling `reactions.removeAll()`) when closing a button-based poll, keeping the same "closed but still shows what the options were" convention tiebreaker voting already uses

## 2.15.0 - 2026-07-11

### Added
- **Survey messages now update live as votes come in**, showing current vote counts and percentages without anyone needing to run `/survey results`. Applies whether a vote is added or changed
- **`/survey create` now takes an optional `duration` (in minutes, up to 14 days)** to auto-close voting after a set time. When it expires, the survey closes and posts results automatically — the exact same close flow `/survey close` already uses — with no need for a moderator to close it manually. Surveys created without a duration keep working exactly as before (open until manually closed). The embed shows a "Voting Ends" countdown for any survey with a duration set
- **`/survey results`, `/survey close`, and `/survey delete` now autocomplete the `poll_id` parameter** — start typing a survey's question and Discord suggests matching surveys with their live vote counts, instead of needing to copy an ID from `/survey list`. `close`/`delete` only ever suggest surveys you're actually allowed to manage (your own, or any if you're an admin/mod), so picking a suggestion never leads to a permission error

### Developer
- Moved `createPollEmbed` from `survey.js` into `pollManager.js` so it can be shared by the command, the reaction handlers, and the new auto-expiry scheduler without duplicating rendering logic (still re-exported from `survey.js` for backward compatibility)
- Extracted the close-poll-and-post-results flow (previously inline in `/survey close`) into a shared `closePollAndAnnounce()` in `pollManager.js`, used by both `/survey close` and the new `pollScheduler.js`, so a survey closes identically whether a moderator closes it or it expires on its own
- Added `src/utils/pollScheduler.js`, a 1-minute interval sweep for expired surveys, following the same init/shutdown pattern as the existing `tournamentScheduler.js`
- Added the bot's first slash-command autocomplete handler (`isAutocomplete()` dispatch in `src/index.js`, `autocomplete()` export in `survey.js`)

## 2.14.1 - 2026-07-11

### Fixed
- **`/survey` votes could silently fail to register.** The bot was missing the `GuildMessages` gateway intent and message/reaction partials it needs to resolve a reaction on a survey message it hasn't personally sent or fetched during the current run — in practice, this meant reacting to any survey created before the bot's last restart (or any survey message that aged out of its short-lived cache) did nothing at all, with no error shown to the voter. The bot now requests `GuildMessages` and registers the required partials, with the message cache capped at 50 entries (rather than accepting the default, larger per-channel cache) since message content itself is never read
- **Closing a survey no longer marks it closed before confirming the original message still exists.** If the survey message had been deleted, `/survey close` used to close the poll in storage first and only then fail trying to update a message that was gone — leaving the poll permanently closed with a misleading "failed, please try again" error and no results ever posted. The message is now fetched first, before anything is persisted

### Developer
- Added `tests/discord-client-config.test.js` asserting the bot's gateway intents, partials, and message-cache cap directly against a real discord.js `Client`, to catch a regression if this config drifts back to the broken state

## 2.14.0 - 2026-07-11

### Added
- **`/movie` and `/tv` now find titles TMDB stores under an original or foreign name**, even when the query is the far more recognizable title it was actually distributed/reissued under. For example, the 1978 film *Day of the Woman* — TMDB's title of record — is what's actually known and distributed as *I Spit on Your Grave*; searching for that name previously buried or missed the correct result entirely. Search now checks TMDB's alternate-title (AKA) data when the top keyword result doesn't look like a good match for the query, and promotes the correct result if one of its AKAs matches. Also applies to `/soundtrack` and adding a title to a `/bracket`
- **Result screens now show an "Also Known As" field** when the primary TMDB title differs from a well-known alternate title, so it's clear you found the right movie/show even if the on-screen title looks unfamiliar

## 2.13.0 - 2026-07-10

### Added
- **Approving or denying an event request now posts a new announcement message** to the moderation channel, in addition to updating the original request's embed in place. Silently editing an old message was easy for other moderators to miss — the new message shows who approved/denied it, a link to the created event (if approved), and the reason (if denied), so the whole team can see what happened without noticing an old message changed. Applies to every approval path: the Approve buttons, picking a channel after Approve, and saving an edit
- New `/eggshen-config event-requests announce-decisions enabled:<true/false>` setting to turn the above off if you'd rather only the original request message update, with no separate announcement (on by default)

### Developer
- Consolidated a third, previously-untouched copy of the event-creation logic (the "pick a channel, then create" flow) to use the same shared `eventRequestApproval.js` module the other two approval paths already use, rather than adding a third inline duplicate

## 2.12.0 - 2026-07-10

### Changed
- **Saving an edited event request now immediately approves it**, instead of just updating the title/description and leaving it pending for a separate Approve click. If a text channel is already known, the event is created right away (using a voice channel too if one was requested); if not, saving shows the same channel-selection step Approve already uses, so the moderator picks a channel and the event is created from there. To review an edit without approving, deny the request and ask the submitter to resubmit instead

### Developer
- Extracted the event-creation logic (`guild.scheduledEvents.create()` + approved-embed building + request cleanup) that previously lived only inside the Approve button handler into a shared `src/utils/eventRequestApproval.js` module, so the edit-save auto-approve path could reuse it instead of duplicating it a third time

## 2.11.0 - 2026-07-10

### Added
- **`/eggshen-help` is now guild-aware.** It only lists commands actually enabled on the server it's run in — if `/game` is disabled via `/eggshen-config commands toggle`, it no longer appears in the help list, and if AI image generation is disabled for the server, `/image` disappears from the "AI Image Generation" category (while `/potion` stays, since it isn't affected by that setting). A category is only omitted entirely once every command in it is disabled; otherwise it stays with just the remaining enabled commands

### Fixed
- **`/eggshen-config`'s "Bracket Command" toggle did nothing.** `commandPermissions.bracket` existed in the config and was toggleable through `/eggshen-config commands toggle`, but `/bracket` never actually checked it — disabling it for regular users had zero effect. `/bracket` now respects the toggle like every other gated command, including its read-only subcommands (not just the admin/moderator-only management ones)
- Removed an unused, misleading import in `similar.js` (`canUseCommand`, imported but never called — `/similar` has never had a corresponding toggle to check)
- `docs/commands/configuration.md`'s list of `/eggshen-config commands toggle` settings was missing `game`, `boardgame`, `book`, `soundtrack`, `survey`, and `bracket` — only `movie`/`tv`/`episode` were documented even though all nine have worked (or now work, for `bracket`) since earlier changes this release cycle

## 2.10.0 - 2026-07-10

### Added
- **`/timer pause` and `/timer resume`.** Pause a timer if something comes up — a break, a technical issue — without losing elapsed time or restarting from scratch. Pausing freezes elapsed/remaining time and cancels the pending auto-stop; resuming picks up exactly where it left off, and time spent paused never counts against the timer's set duration. A paused timer survives a bot restart and stays paused until explicitly resumed. `/timer adjust` now requires resuming first if the timer is currently paused

### Developer
- Deduplicated the auto-stop scheduling/notification logic in `timerManager.js`, which was previously copy-pasted across `startTimer`, `restoreTimerTimeouts`, and `adjustTimerDuration`, into shared helpers — fixed a latent inconsistency along the way where a timer that expired while the bot was offline was auto-logged to watch history without its starter's user ID (all other auto-stop paths already passed it correctly)

## 2.9.0 - 2026-07-10

### Fixed
- **`/timer start label:<text>` didn't trigger runtime auto-detection.** The search-and-confirm flow (movie/TV lookup, the "Confirm Title" selection menu, auto-filling duration from runtime) only ran when the label was auto-detected from a Discord scheduled event — a manually-typed label skipped it entirely and the timer just started with no duration. It now runs the same way regardless of whether the label was typed or auto-detected

### Added
- **Board games now participate in `/timer` runtime auto-detection**, alongside movies and TV shows. BoardGameGeek's listed playing time is used the same way TMDB's runtime/episode length already was (+ a 10-minute buffer). Each source is capped at 8 results (down from 10) so the combined selection menu never exceeds Discord's 25-option limit even with three sources contributing

## 2.8.0 - 2026-07-10

### Added
- **Edit event requests before approval.** A new ✏️ Edit button on the moderation-channel embed opens a form pre-filled with the submitter's title and description, letting a moderator correct either before creating the event. The moderation embed updates immediately, and the eventually-created event uses the edited values. Schedule (start/end time) editing was intentionally left out — Discord's own event editor (linked from the approval confirmation) already has a real, timezone-aware date/time picker, so there's no need to rebuild that in a text form
- **Deny with a reason.** Clicking ❌ Deny now opens a form for an optional reason. Whatever's entered is shown on the moderation embed for other moderators and sent as a DM to the person who submitted the request, so they're not left wondering what happened. A closed-DMs submitter doesn't block the denial — it completes either way, with a note if the notification couldn't be delivered

## 2.7.2 - 2026-07-10

### Fixed
- **Selecting a channel while approving an event request always resulted in "This interaction failed."** The text/voice channel pickers in that flow use discord.js's `ChannelSelectMenuBuilder`, a different component type from the `StringSelectMenuBuilder` used everywhere else in the bot. The main interaction dispatcher only checked `interaction.isStringSelectMenu()` before routing to the select-menu handler, so a channel-select interaction matched no branch at all and was silently dropped — Discord then showed its generic failure message after a few seconds with nothing logged, since the handler never ran. The dispatcher now also checks `interaction.isChannelSelectMenu()`

## 2.7.1 - 2026-07-10

### Fixed
- **Event request approval could fail with "Please select a text channel before creating the event" even when a channel was clearly selected in the UI.** The moderator's channel selection (`global.eventChannelSelections`) was kept only in memory with no disk persistence, unlike the underlying event request itself. If the bot restarted between selecting a channel and clicking "Create Event" — a redeploy, a PM2 restart, a crash — the selection silently vanished while the request survived, and the resulting error message pointed at the wrong cause. Channel selections are now persisted to disk and restored on startup, the same way pending event requests already are, and the error message now explains what actually happened when a selection genuinely can't be found
- A cancelled channel-selection flow (`Cancel` button) now also cleans up its in-memory/on-disk selection state, instead of leaving it around indefinitely

## 2.7.0 - 2026-07-09

### Fixed
- **Guild-specific command permission toggles were silently ignored for `/game`, `/boardgame`, `/book`, `/soundtrack`, and `/bracket`** — `canUseCommand()` only recognized `movie`/`tv`/`episode`/`survey` and fell through to "allowed" for everything else, regardless of what an admin had configured. `updateCommandPermission()` had the same hardcoded-list problem, so toggling `/soundtrack` or `/bracket` via `/eggshen-config` failed outright with "Failed to update command permissions." Both functions now check against the config's own keys instead of a hardcoded list, so newly-added command types stay covered automatically
- **`/eggshen-config commands toggle` was missing Game/Board Game/Book Command as selectable options** in its dropdown, compounding the bug above
- **A more severe latent bug in `loadGuildConfig()`**: its no-saved-config-yet fallback returned a shallow copy (`{ ...defaultConfig }`), which shares every nested object (`commandPermissions`, `services`, `rateLimits`, `moderation`, etc.) by reference across every guild that hasn't saved a config yet. The first `update*()`/`toggle*()` call for **any** not-yet-configured guild would mutate the shared default in memory, silently changing the "default" seen by every other guild for the life of the process. Fixed with a real deep clone
- **`aiImageTracker.js` had the same missing-`await` bug** across `canGenerateImage()`, `recordImageGeneration()`, `getGuildImageStats()`, and `getUserImageStats()` — all four called the async `loadGuildConfig()` without awaiting it, so guild-specific AI image settings (enabled/disabled, permission level, cooldowns, daily limits, whitelist, cost-per-image) were always ignored in favor of hardcoded defaults
- **`/survey`'s poll embed builder had a dead `await`-less `loadGuildConfig()` call** whose result (guild emoji config) was never actually used — poll option emoji always came from a fixed list regardless. Removed the dead code
- **Ephemeral error messages after `/watchparty remind` and `/timer remind`'s public defer were posted publicly instead of privately** — `editReply({ ephemeral: true })` can't change an already-deferred public reply's visibility, so "no scheduled event found" and generic error messages were visible to the whole channel. Both now delete the public placeholder and re-send the error via an ephemeral `followUp()`
- **`/timer stop`, `/timer adjust`, and `/timer autostop` had no ownership check** — any user could stop, retime, or change auto-stop settings on a timer someone else started. Now requires being the timer's starter or an admin/moderator, matching the existing check on the "Log to Watch History" button
- **`/random game` and `/random boardgame` showed a generic "An error occurred" message when no results matched the filters**, instead of the friendly "try adjusting your filters" message `/random book` already gave — both discovery services throw rather than return null on empty results, and neither call site had a catch for it
- **`/image` silently dropped the `prompt` option when combined with `message`** — `generateFromMessage()` never accepted or used a supplementary prompt, unlike the `title1`/`title2` and `matchup` modes, which both append extra detail via "Additional details: ...". Combining `message` + `prompt` now works the same way
- **A bad/nonexistent message ID passed to `/image message:` leaked a raw Discord.js error** (`❌ Failed to generate AI image: Unknown Message`) instead of a clear "could not find that message" reply
- **The "Log to Watch History" button was fully implemented but never wired up** — `handleWatchHistoryButton()` existed and was exported but the button dispatcher never routed `log_watched_*` custom IDs to it, so clicking the button after `/timer stop` (when no label was set) always failed silently with Discord's generic "This interaction failed"
- Corrected ~19 in-bot messages in `/eggshen-config` that referenced pre-reorganization command syntax (e.g. `/eggshen-config rate-limit-toggle` → `/eggshen-config rate-limit toggle`, `/eggshen-config whitelist-add-role` → `/eggshen-config moderation whitelist-add-role`) — these were missing their subcommand-group prefix from when the command was reorganized into groups
- Corrected stale references in `/eggshen-help`: removed a mention of `/timer help` (doesn't exist), fixed `/potion`'s description (flavor-text responses, not image generation), fixed `/watchparty`'s description (announces an existing scheduled event, doesn't schedule one), and fixed `/random`'s filter list (`decade`, not `year`) and subcommand list (now mentions all six: movie/TV/episode/game/board game/book)

### Developer
- 9 new test files covering every fix above (permission gating, the shared-reference config bug, the aiImageTracker await bug, ephemeral error handling, timer ownership checks, random.js fallback messaging, image.js prompt combining and error handling, and a structural test that validates every `/eggshen-config` command reference in the file against its real schema)

## 2.6.0 - 2026-07-09

### Added
- **`/bracket resize`**, **`/bracket edit-name`**, **`/bracket list-groups`**, **`/bracket regenerate`** — re-enabled after being silently disabled due to Discord's 25-subcommand limit. These were never removed features; the docs described them as live the whole time. `/bracket` now sits at 22/25 subcommands

### Changed
- **AI image generation consolidated into one command.** `/image`, `/versus-image`, and `/bracket image` overlapped significantly (`/bracket image`'s title-search mode was a near-duplicate of `/versus-image`). All three are now just `/image`, with four modes: freeform prompt, generate from a Discord message, a `title1`/`title2` versus battle (with smart search across movies/TV/games/board games/books), and a tournament-`matchup`-aware versus battle. `/versus-image` no longer exists as a separate command
- Removed a hardcoded production domain from the default CORS allow-list and from several example/config files, replacing them with generic placeholders — no behavior change for deployments that already set `ALLOWED_ORIGINS` (which production deployments should always do)
- `delete-guild-commands.js` now requires `GUILD_ID` to be set rather than silently falling back to a hardcoded guild ID

### Removed
- **`/bracket open-knockout`, `/bracket close-knockout`, `/bracket open-region`** — these were dead code left over from before the v2.0.0 smart-command consolidation: verified line-for-line duplicates of `/bracket open`/`/bracket close`/`/bracket open-matchup`, and already listed as removed in this changelog. `open-region` additionally still had stale 2-region math from before the bracket moved to 4 regions

### Fixed
- **`resolve-tiebreaker` was a duplicate, unreachable case** in `/bracket`'s command dispatch (dead code, no behavior impact, but confusing)
- **8 in-bot messages referenced removed/renamed commands** (`/bracket add-title`, `/bracket vote-group`, `/bracket open-knockout`, `/bracket remove-title`) left over from before the v2.0.0 smart-command consolidation — all updated to the current command names, or to describe button-based voting where no command exists anymore

### Developer
- `src/commands/bracket.js` reduced from 3,879 to 3,258 lines; removed several imports that were only used by the deleted code
- 21 new command-layer tests covering the four re-enabled subcommands

## 2.5.0 - 2026-07-09

### Added
- **Tiebreaker Button Voting** (2026-07-08)
  - When a group or knockout tiebreaker is created, the bot now posts a dedicated voting embed with clickable buttons for each tied option
  - Members click a button to cast their tiebreaker vote — no command needed
  - Live vote counts update in real time (progress bars show current standings)
  - Users receive a private ephemeral confirmation after voting and can change their vote any time before the deadline
  - Tiebreaker ID is always visible in the embed footer for admin reference

### Improved
- **`/bracket resolve-tiebreaker`** — `winner` parameter is now optional
  - **With `winner`:** Admin manually picks the winning option (unchanged behavior)
  - **Without `winner`:** Tallies the current tiebreaker votes and resolves immediately — useful for ending voting early once a clear majority exists
  - On resolution, the voting embed is automatically disabled and stamped with the result and vote breakdown
- **Tiebreaker auto-resolution** — The tournament scheduler now checks tiebreaker deadlines every minute. When a tiebreaker expires it is automatically resolved by vote count (random fallback if no votes were cast), the embed is updated to show the winner, and a results notification is posted

### Fixed
- **Multiple simultaneous group ties** — Fixed a bug where closing multiple groups at once (e.g., `/bracket close-groups groups:A,B,C,D`) could silently discard `groupResults` for earlier groups when later groups also had ties. All group results are now preserved correctly regardless of how many tiebreakers are created in a single call
- **Scheduler loop re-processing already-tied groups** — The tournament scheduler could repeatedly re-detect the same tie and create a new tiebreaker roughly every minute for a group already awaiting one, instead of waiting for it to resolve. Left unattended this created dozens of duplicate tiebreakers and Discord messages for the same tie
- **`result.tournament.groups` typo in auto-close** — The scheduler read the wrong property when posting results after an automatic group close, causing it to crash instead of announcing the result
- **`votingOpen` not reset after tiebreaker resolution** — Finalizing a group via tiebreaker marked it `closed` but left `votingOpen: true`, leaving a stale flag around (a separate deadline check prevented it from being exploitable, but it's now fully consistent with the normal close path)
- **`deploy-commands.js` hanging instead of exiting** — the script never called `process.exit()`, so it could hang indefinitely after finishing its one-shot command deploy instead of returning control to the shell/process manager that invoked it

### Testing
- Added Jest unit tests for the entire service layer (`src/services/*.js`), previously untested
- Added command-layer tests for `/bracket close-groups` and `/bracket resolve-tiebreaker`, covering the tiebreaker finalization bug above
- Added a Playwright end-to-end suite for the Event Request web form (`tests/e2e/`)

## 2.4.1 - 2026-07-05

### Improved
- **Event Request Form Date/Time UX**
  - **Auto-Update End Time:** When start date/time is set, end date/time automatically updates to match start time + 10 minutes
    - Reduces manual input for users
    - Ensures minimum 10-minute event duration by default
    - Users can still manually increase end time as needed
  - **Smart Validation:** End date/time cannot be earlier than start date/time
    - Auto-corrects if user tries to set end time before start time
    - Minimum 10-minute gap enforced between start and end times
    - Real-time validation prevents invalid submissions
  - **Dynamic Constraints:** End date minimum automatically updates when start date changes
  - **Benefits:**
    - Faster form completion - less typing required
    - Prevents common user errors (end before start)
    - Smarter defaults reduce cognitive load
    - Still allows full manual control when needed

## 2.4.0 - 2026-07-05

### Added
- **Event Request Guild Membership Validation**
  - **Double Security Check:** Validates user is a server member both at login and form submission
  - **OAuth Validation:** When users log in via Discord, system checks if they're a member of the target server
    - Non-members are redirected with friendly error message
    - Shows server name and invite link (if configured)
    - Prevents unauthorized form access immediately
  - **Submission Validation:** Revalidates membership when form is submitted
    - Handles edge case: user logs in successfully but leaves server before submitting
    - Returns 403 error with invite link
    - Frontend displays error with clickable invite link
  - **User Experience:**
    - Clear error messages: "You must be a member of [Server Name] to submit event requests"
    - Automatic invite link display when configured by admins
    - HTML-formatted error messages with clickable links
  - **Security Benefits:**
    - Prevents spam from non-members
    - Ensures only community members can request events
    - Double-check architecture prevents circumvention
  - **Implementation:**
    - New helper function: `checkGuildMembership(guildId, userId)` uses Discord.js member fetch
    - OAuth callback checks membership before creating session
    - Form submission endpoint revalidates before accepting request
    - Session tokens now include guildId for validation
    - Frontend handles `not_member` error with invite links

## 2.3.0 - 2026-07-05

### Added
- **Event Request Simple vs Advanced Mode**
  - **Simple Mode (Default):** Users submit basic event details only (title, description, time). Moderators assign channels during approval.
    - Form shows: Title, Description, Start/End Time, Frequency
    - Form hides: Location, Voice Channel selectors
    - User experience: "Submit event idea, moderators handle logistics"
    - Moderator responsibility: Choose appropriate channels when approving
  - **Advanced Mode (Opt-In):** Users select specific channels from whitelists during form submission.
    - Form shows: All fields including Location and Voice Channel selectors
    - Requires channel whitelisting to be configured (see v2.2.0)
    - User experience: "Full control over event setup"
  - **New Command:**
    - `/eggshen-config event-requests allow-user-channel-selection allow:<true/false>` - Toggle between simple and advanced mode
    - Default: `false` (simple mode)
  - **How It Works:**
    - **Simple mode:** Form submission doesn't include channelId/voiceChannelId. Embed shows "Moderator will assign during approval" placeholder. Moderators select channels when approving.
    - **Advanced mode:** Form shows channel selectors filtered by allowed lists. Users must select location channel. Embed shows user's channel selections.
  - **Use Cases:**
    - **Simple mode:** New communities, servers with dedicated event coordinators, reducing user decision fatigue
    - **Advanced mode:** Power users, servers with established channel structures, community-driven events
  - **Benefits:**
    - Simplifies event requests by default
    - Reduces barrier to entry for casual users
    - Gives moderators control over channel assignments
    - Optional advanced mode for experienced communities
  - **Documentation:** Configuration commands documented in `/eggshen-config event-requests` section

## 2.2.0 - 2026-07-05

### Added
- **Event Request Channel Whitelisting**
  - **Control Which Channels Appear in Form:** Admins can specify exactly which text and voice channels users can select from
  - **New Commands:**
    - `/eggshen-config event-requests set-allowed-text-channels channel-ids:"123,456,789"` - Whitelist specific text channels
    - `/eggshen-config event-requests set-allowed-voice-channels channel-ids:"123,456"` - Whitelist specific voice/stage channels
    - Use `channel-ids:"all"` to allow all channels (default behavior)
  - **How It Works:**
    - Empty lists (default) = all channels available in dropdowns
    - Populated lists = only those specific channel IDs appear in dropdowns
    - Form automatically filters based on server configuration
  - **Use Cases:**
    - Limit events to dedicated watch party channels
    - Exclude announcement or admin-only channels
    - Simplify channel selection for users
    - Prevent accidental selection of inappropriate channels
  - **Benefits:**
    - Granular control over channel selection
    - Reduces user confusion with large channel lists
    - Protects certain channels from event requests
    - No UI changes needed - just configure and it works
  - **Documentation:** Configuration commands documented in `/eggshen-config event-requests` section

## 2.1.0 - 2026-07-05

### Added
- **Event Request Voice Channel Opt-In & Granular Approval**
  - **Clearer Labels:** "Location" instead of "Coordination Channel" (text channel is always required)
  - **Voice Channel Opt-In:** Checkbox to optionally include voice/stage channel for events
    - Only shows when checkbox is checked
    - Reduces form clutter, makes intent clearer
  - **Server Control:** New `/eggshen-config event-requests allow-voice-requests` command
    - Enable/disable voice channel requests server-wide
    - When disabled, checkbox is hidden and all events are text-only
    - Useful for servers that primarily use text chat for watch parties
  - **Granular Moderator Approval:**
    - **Voice requests:** ✅ Approve Both | 💬 Text Only | ❌ Deny
    - **Text-only requests:** ✅ Approve & Create Event | ❌ Deny
    - Moderators can modify requests during approval (e.g., remove voice channel)
  - **Benefits:**
    - Server admins control voice channel availability
    - Moderators have flexibility to adjust requests
    - Clearer terminology and streamlined form UX
    - Accommodates different community preferences
  - **Important:** Event requests are **disabled by default** - admins must enable with `/eggshen-config event-requests toggle enabled:true`
  - **Documentation:** See [Event Requests Setup](/features/event-requests) for complete configuration guide

## 2.0.0 - 2026-07-04

### Added
- **Comprehensive Help Commands**
  - **Updated `/eggshen-help`** - Complete command list covering all bot features
    - Movies & TV Shows: movie, tv, episode, episode-list, similar, watched
    - Games & Entertainment: game, boardgame, book, soundtrack
    - Random & Discovery: random with filters
    - Tournaments & Polls: bracket, survey
    - AI Image Generation: image, versus-image, potion
    - Watch Party Tools: timer, watchparty, stats
    - Admin commands shown conditionally for moderators
  - **Updated `/bracket help`** - Comprehensive tournament guide
    - Valid tournament sizes clearly listed (2, 4, 8, 16, 32, 36, 40, 44, 48)
    - Explains bracket vs group mode auto-detection
    - Documents smart commands (`/bracket open`, `/bracket close`)
    - Interactive selector tips
    - Voting instructions for both modes
    - Pro tips and duration syntax
  - **Benefits:**
    - New users can discover all bot features in one place
    - Context-specific help for complex features (tournaments)
    - Links to full documentation at eggshenbot.com
    - Admin commands hidden from regular members

- **Tournament Size Validation**
  - **What changed:** The `max-titles` parameter now only accepts specific valid tournament sizes
  - **Valid bracket sizes:** 2, 4, 8, 16, 32 (powers of 2 for balanced single-elimination)
  - **Valid group sizes:** 36, 40, 44, 48 (multiples of 4 for complete groups of 4 entries each)
  - **Why:** Prevents awkward tournament structures like 7-title brackets (requiring many byes) or 35-title group stages (leaving incomplete groups)
  - **User experience:** Discord command shows dropdown with 9 labeled choices (e.g., "8 titles (Quarterfinals)", "36 titles (9 groups)")
  - **Benefits:**
    - Ensures clean, professional tournament structures
    - No confusing bracket layouts with excessive byes
    - Complete groups in group stage mode (all groups have exactly 4 entries)
    - Clear labeling helps admins choose the right size

- **Streamlined Tournament Commands with Smart Phase Detection**
  - **What changed:** Reduced from 25 to 18 subcommands by consolidating and adding intelligence
  - **New smart commands:**
    - `/bracket open` - Automatically detects tournament phase and opens next round (groups or knockout)
    - `/bracket close` - Automatically detects phase and closes current round with tiebreaker support
    - `/bracket manage-titles action:[add|remove]` - Unified title management command
  - **Removed commands:** 
    - Replaced `add-title` and `remove-title` with `manage-titles`
    - Replaced `open-knockout`, `close-knockout` with smart `open`/`close`
    - Removed `open-quarters`, `close-quarters`, `open-semis`, `close-semis`, `open-finals`, `close-finals` (use smart `open`/`close` instead)
    - Temporarily removed `regenerate` (rarely used, hit Discord's 25 command limit)
  - **Benefits:**
    - Easier for admins: No need to remember which round-specific command to use
    - Fewer commands to learn: Bot figures out context automatically
    - Cleaner command list in Discord
    - Opens more room for future features
  - **Granular control still available:** Use `open-groups`, `close-groups`, `open-matchup`, `close-matchup` for specific control
- **Automatic Tiebreaker Voting System**
  - **What it does:** Automatically creates dedicated voting rounds when ties occur during tournaments
  - **Applies to:**
    - **Group stage:** 1st and 2nd place ties
    - **Knockout rounds:** All matchup ties (Round of 32, Round of 16, Quarterfinals, Semifinals, Finals)
  - **How it works:**
    1. When closing voting with tied results, bot creates tiebreaker round
    2. Users vote in short tiebreaker round (configurable duration, default 1 hour)
    3. Tiebreaker winner advances automatically
    4. If tiebreaker also ties, random selection used (prevents infinite loops)
  - **Configurable duration:**
    - **Group stage:** `/bracket close-groups groups:[A,B,C] tiebreaker-duration:[1h]`
    - **Knockout:** `/bracket close-matchup matchup:[1A] tiebreaker-duration:[30m]`
    - Format: "1h", "30m", "2h", etc. (5 min - 7 days)
  - **Manual resolution:**
    - **New command:** `/bracket resolve-tiebreaker tiebreaker-id:[id] winner:[1-based index]`
    - **Who can use:** Tournament creator, Admins, Moderators
    - **Use case:** Manually decide winner if needed instead of waiting for tiebreaker vote
    - **Fallback:** If tiebreaker creation fails, random selection used
  - **Benefits:**
    - Fair resolution of ties through community voting
    - Prevents arbitrary random selections for important decisions
    - Flexible duration allows quick tiebreakers for fast tournaments
    - Admin override available when needed
- **Tournament Validation Before Knockout**
  - **What changed:** `/bracket advance-knockout` now validates all groups are closed before generating bracket
  - **Prevents:** Creating incomplete brackets (e.g., 12 matchups instead of 16 for Round of 32)
  - **Error message:** Shows which groups still need to be closed
  - **Also checks:** Active tiebreakers must be resolved before advancing
- **Timer Duration Adjustment**
  - **New command:** `/timer adjust duration:[minutes]`
  - **What it does:** Adjusts the total duration of an active timer while it's running
  - **Smart calculation:** Bot automatically calculates elapsed time and reschedules auto-stop based on the new total duration
  - **Use case:** Started timer with auto-detected runtime (e.g., 1h 48m) but watching director's cut (2h 20m) - adjust mid-watch without stopping
  - **Protection:** Won't allow setting duration shorter than elapsed time (prevents instant auto-stop)
  - **Feedback:** Shows new total duration, time elapsed, and time remaining
  - **Example:** Timer running for 45 minutes, adjust to 140 minutes = 95 minutes remaining
- **Timer Auto-Stop Control**
  - **New command:** `/timer autostop autostop:[enable|disable] duration:[minutes]`
  - **Actions:**
    - **Disable:** Removes auto-stop from timer with duration - timer continues until manually stopped
    - **Enable:** Adds auto-stop to timer without duration - requires `duration` parameter
  - **Use cases:** 
    - **Disable:** Timer scheduled to auto-stop but content is running longer than expected
    - **Enable:** Started timer without duration, realized you want automatic stopping
  - **Benefits:** 
    - Toggle auto-stop mid-timer without restarting
    - Preserves elapsed time and watch history data
    - Flexible solution for unpredictable runtimes
  - **Examples:**
    - `/timer autostop autostop:disable` - removes auto-stop, continue indefinitely
    - `/timer autostop autostop:enable duration:180` - adds 3-hour auto-stop to running timer
- **4-Region Knockout Tournament System**
  - **What changed:** Knockout tournaments now use 4 regions (March Madness style) instead of 2 regions
  - **Regional labeling:** Matchups labeled 1A-4D based on position (e.g., "1A", "2C", "3B", "4D")
  - **New `/bracket open-matchup` parameters:**
    - `region`: Open all matchups in a specific region (1-4)
    - `matchup`: Open specific matchup(s) by label (e.g., "1A", "2B,3C")
    - `duration`: Voting duration (default 24h)
  - **Smart selector behavior:**
    - **>5 matchups:** Shows region selector (4 buttons for regions 1-4)
    - **≤5 matchups:** Shows individual matchup selector
    - **Example:** Round of 32 (12 matchups) = 3 matchups per region
  - **Benefits:**
    - Respects Discord's 5 ActionRow limit per message
    - Voting dashboards work for all knockout rounds
    - Admin can directly specify `region:2` instead of using buttons
    - Matches real tournament bracket structure
  - **Migration:** Existing 2-region tournaments will automatically use new 4-region labels on next round
- **Matchup Reset on Reopen**
  - **What changed:** Closing and reopening matchups now fully resets the matchup state
  - **Clears:** Previous votes, winner selection, vote counts, closed timestamps, and results cache
  - **Benefits:** 
    - Easy testing workflow: close → fix code → reopen → test
    - Fresh slate for fixing broken voting rounds
    - No stale data from previous voting sessions
  - **Applies to:** `/bracket open-matchup`, `/bracket open-knockout`, regional opening
- **Vote Confirmation Spam Removed**
  - **What changed:** Individual "✅ Voted for [Title] in Group X!" messages removed from group voting
  - **New feedback:** Button color change (purple = selected, gray = unselected) provides instant visual confirmation
  - **Benefits:**
    - Clean channels without 3+ messages per vote
    - Faster voting experience
    - Still see vote reflected immediately in dashboard
  - **Note:** Personal voting dashboard still updates in real-time with vote counts
- **Smart Tournament Warning Timing**
  - **What changed:** "Voting Closing Soon!" warnings now appear at intelligent times based on total voting duration instead of a fixed 1-hour-before threshold
  - **New warning schedule:**
    - **< 30 min votes:** Warning after 5 minutes (e.g., 30-min test = warn at 5 min)
    - **30 min - 2 hour votes:** Warning after 10 minutes
    - **2-6 hour votes:** Warning 1 hour before deadline
    - **> 6 hour votes:** Warning 2 hours before deadline
  - **Benefits:**
    - Short test tournaments get early warnings with plenty of time remaining
    - No more 29-minute warnings for 30-minute votes
    - Longer tournaments still get appropriate late warnings
    - Scales automatically based on chosen duration
  - **Applies to:** Both group stage and knockout voting periods
- **Manual Watch History Button for All Timers**
  - **What changed:** "Log to Watch History" button now appears on ALL timer completion messages (not just errors)
  - **For timers WITH labels:**
    - Automatic logging happens first (searches TMDB, logs first result)
    - Button appears for manual override if wrong title was detected
    - Can add custom notes or log a different title
  - **For timers WITHOUT labels:**
    - Button lets you add what you watched after the fact
    - Opens modal with title search field and notes
    - Searches TMDB when you submit
  - **Permissions:**
    - ✅ Timer starter can always use the button
    - ✅ Server administrators can use it
    - ✅ Server moderators (Manage Guild or Moderate Members) can use it
    - ❌ Other users get error message if they try
  - **Benefits:**
    - Flexibility to override auto-detection
    - Can log generic timers after completion
    - Prevents unauthorized logging by non-starters
    - Maintains automatic convenience while allowing manual control
  - **Implementation:** Button customId includes starter's user ID for permission checking
- **Automatic Watch History Logging for Timers**
  - **What changed:** Timers with titles now automatically log to server watch history when they complete
  - **How it works:**
    1. Timer completes (manual `/timer stop` or auto-stop after duration)
    2. Bot searches TMDB for the timer's title/label
    3. Finds best match (uses first result)
    4. Automatically saves to server watch history
    5. Shows confirmation embed with poster, title, year, type, duration
  - **Information logged:**
    - Movie/TV show title from TMDB
    - Year and type (movie/TV)
    - Date watched
    - Timer duration as notes (e.g., "Watch party timer: 3:02:15")
    - Channel where watched
    - Who started and stopped the timer
    - Poster image
  - **Benefits:**
    - No button to click - completely automatic
    - Tracks all watch parties without manual intervention
    - Creates comprehensive server watch history
    - Works for both manual stops and auto-complete timers
    - Shows rich TMDB details (poster, year, type)
  - **Fallback:** If title not found on TMDB, shows button for manual logging
  - **Note:** Only timers with labels/titles trigger auto-logging; blank timers show button for manual logging
- **Tatsu-Style Tournament UI Enhancements**
  - **Inspired by:** tatsu.gg Discord bot's polished voting system with visual progress bars and gamification
  - **Visual Progress Bars:**
    - Vote counts now display as visual bars: `████████░░ 12 votes (60%)`
    - Real-time progress visualization in all leaderboards
    - Percentage displays alongside vote counts
    - Makes results immediately clear at a glance
  - **Participation Tracking & Gamification:**
    - Track each user's total votes across tournament
    - Voting streak system (consecutive rounds participated)
    - Tournament-wide statistics (unique voters, most active voter)
    - Personal stats shown in voting dashboard: `🔥 Streak: 5 rounds | 📊 Total votes: 12`
    - First-time voter detection with welcoming message
    - Encourages consistent participation
  - **Bot Avatar Branding:**
    - Egg Shen avatar appears in top-right corner of all tournament cards
    - Professional, polished look matching Tatsu's style
    - Consistent branding across status, results, leaderboards, dashboards
  - **Enhanced Emoji Usage:**
    - 🔥 for leaders in matchups
    - 🤝 for ties
    - 🥇🥈🥉 for rankings
    - 📊 for stats
    - ⚡ for streaks and active status
    - Consistent visual language throughout
  - **New Utility Module:** `src/utils/tournamentUI.js`
    - Progress bar generators
    - Streak visualizations
    - Status emoji helpers
    - Ranking badges
    - Reusable UI components
  - **Benefits:**
    - More engaging, game-like experience
    - Tatsu-level polish and professionalism
    - Progress bars make results instantly clear
    - Gamification encourages participation
    - Bot branding consistency
    - Minimal chat spam (already using ephemeral messages)
- **Round-Specific Command Aliases**
  - **New memorable commands for each knockout round:**
    - **Opening:** `/bracket open-quarters`, `/bracket open-semis`, `/bracket open-finals`
    - **Closing:** `/bracket close-quarters`, `/bracket close-semis`, `/bracket close-finals`
  - **Generic fallbacks still available:** `/bracket open-knockout`, `/bracket close-knockout` work for any round
  - **Improved help text:** `/bracket help` now documents all round-specific aliases
  - **Smart next-step guidance:** After closing a round, bot suggests exact command to run next (e.g., "Run /bracket open-semis to start voting!")
  - **Benefits:**
    - More intuitive than generic "open-knockout" for admins
    - Clear progression through tournament rounds
    - Reduces need to check documentation
    - Better discovery of available commands
  - **Commands restored:** `/bracket regenerate` added back (critical for fixing bracket structure issues)
  - **Commands removed to stay under 25 limit:** `list-groups` (status shows this info)
- **Discord Timestamp Auto-Timezone Conversion**
  - **Issue:** All timestamps displayed in server time (UTC), causing confusion for users in different timezones
  - **Fix:** Replaced all `toLocaleString()` calls with Discord's `<t:timestamp:f>` format
  - **Affected areas:**
    - Footer deadlines on matchup opening messages
    - "Voting Closing Soon!" reminder notifications (scheduler)
    - Voting extension confirmation messages
  - **Result:** Each user automatically sees times in their own timezone based on Discord settings
  - **Example:** "10:14 PM" (your timezone) instead of "2:14 AM" (UTC)
- **Personal Voting Dashboards for Knockout Rounds**
  - **How it works:** Users get their own private voting dashboard (completely separate from shared messages)
  - **Flow:**
    1. Admin opens matchups → Summary card appears with "Start Voting" button
    2. User clicks "Start Voting" → Gets ephemeral voting dashboard
    3. Dashboard shows ALL open matchups with buttons labeled by matchup ID (e.g., "1A: The Exorcist", "1A: The Witch")
    4. User's selections show as purple buttons (only they see their own states)
    5. Click any button to vote or change vote → Dashboard updates instantly
  - **Shared matchup cards:** Show title matchups and vote counts, but NO voting buttons
  - **Personal dashboard:** Each user has their own with ALL voting buttons
  - **Benefits:**
    - TRUE per-user button states (no cross-user pollution)
    - Users can't see each other's selections on buttons
    - Simple, clean voting experience
    - All matchups visible in one dashboard
    - Buttons clearly labeled with matchup IDs
    - Easy to understand what you're voting for
  - **Applies to all media types:** Movies, TV shows, video games, board games, books, and any future additions (episodes, music, etc.)

### Changed
- **Simplified Knockout Voting Confirmations**
  - **Previous:** Attempted to maintain persistent "Your Votes" dashboard for knockout rounds
  - **Issue:** Ephemeral messages from `followUp()` cannot be fetched and edited, causing duplicate cards on each vote
  - **Root cause:** Discord's ephemeral messages are client-side only and not retrievable via API after creation
  - **New approach:** Simple "✅ Vote recorded for [Title]!" confirmation message
  - **Rationale:** Public "All Votes" leaderboard already shows all voting information, so persistent personal dashboard is redundant
  - **Result:** Clean voting experience with no duplicate cards
  - **What you see now:**
    - Public "All Votes" leaderboard (updates in place, everyone sees)
    - Simple vote confirmation (ephemeral, disappears quickly)
    - No more dashboard spam!

### Fixed
- **Discord 5-Row Limit Error in Knockout Voting Dashboard**
  - **Issue:** Clicking "Start Voting" in rounds with many matchups (Round of 32, Round of 16) failed with "Invalid Form Body - data.components[BASE_TYPE_MAX_LENGTH]: Must be 5 or fewer in length"
  - **Root cause:** Dashboard tried to display ALL matchups at once (1 row per matchup), exceeding Discord's 5 ActionRow limit per message
  - **Example:** Round of 32 = 32 matchups = 32 rows (limit is 5!)
  - **Fix:** Implemented pagination system - shows 10 matchups per page (20 buttons in 4 rows + 1 navigation row)
  - **Features:**
    - Previous/Next buttons to navigate between pages
    - Page indicator showing current page (e.g., "Page 1/4")
    - Vote counts preserved across pages
    - Purple highlighting for user's selections maintained across navigation
  - **Result:** All knockout rounds now work regardless of size, users can browse and vote on all matchups
- **"No voting matchups found" Error on Knockout Start Voting Button**
  - **Issue:** Clicking "Start Voting" button in knockout rounds returned "No voting matchups found for this round" error
  - **Root cause:** Button handler was incorrectly parsing the round from button customId using `split('_')` which broke `round_of_32` into just `'round'`
  - **Example:** Button customId `start_knockout_voting_round_of_32` → split by `_` → `['start', 'knockout', 'voting', 'round', 'of', '32']` → extracted index [3] = `'round'` (wrong!)
  - **Fix:** Changed to extract everything after `start_knockout_voting_` prefix to preserve full round name like `round_of_32`, `quarter_finals`, etc.
  - **Also fixed:** Added missing `votingStarted` timestamps to all knockout matchup opening functions so smart warning timing works correctly
  - **Result:** Personal voting dashboards now load correctly for all knockout rounds
- **Knockout Channel Flooding with Individual Matchup Cards**
  - **Issue:** When opening knockout rounds, bot was flooding channels with one card per matchup (e.g., 32 cards for Round of 32) in addition to the main announcement
  - **Root cause:** All knockout opening functions were looping through matchups and sending individual cards to the channel
  - **Affected commands:** `/bracket advance-knockout`, `/bracket open-knockout`, `/bracket open-quarters`, `/bracket open-semis`, `/bracket open-finals`, `/bracket open-matchup`, `/bracket open-region`
  - **Fix:** Removed individual matchup card loops from all opening functions - now only the main announcement with "Start Voting" button appears
  - **Result:** Clean, spam-free channel with single announcement. Users click "Start Voting" to see all matchups in their personal dashboard
  - **Benefits:**
    - No more channel spam/flooding
    - Cleaner tournament experience
    - Personal dashboard remains the single source for voting
    - Maintains all functionality while reducing visual clutter
- **Group Stage Open Command Error**
  - **Issue:** `/bracket open-groups` command failed with "An error occurred" when trying to display voting announcement
  - **Root cause:** Code referenced undefined variable `leaderboardEmbed` instead of the `embeds` array that was built earlier in the function
  - **Fix:** Changed `embeds: [leaderboardEmbed]` to `embeds: embeds` on line 1350 of bracket.js
  - **Result:** Group stage voting now opens correctly with announcement embed, leaderboards, and "Start Voting" button
- **Knockout Dashboard Still Creating Multiple Cards**
  - **Issue:** Dashboard was still creating new cards on each vote instead of updating the existing one
  - **Root cause:** Fallback logic was too aggressive - if message fetch failed for ANY reason, created new message with `followUp()` instead of updating
  - **Fix:**
    - Simplified dashboard update logic with proper try/catch around message fetch
    - Only delete dashboard from cache and create new one if message truly doesn't exist
    - Added console logging to track dashboard creation vs updates
    - Changed from nested if/else to single try/catch for cleaner error handling
  - **Result:** Dashboard now consistently updates in place on subsequent votes, only creates new message on first vote or if previous message was deleted
- **Knockout Voting Interaction Error Fixed**
  - **Issue:** All knockout votes failed with "An error occurred while processing your vote" after dashboard flooding fix
  - **Root cause:** Double-defer - `interaction.deferUpdate()` at button handler level + `interaction.deferReply()` in knockout handler = "InteractionAlreadyReplied" error
  - **Fix:**
    - Removed `deferReply()` from handleKnockoutVote (interaction already deferred as update)
    - Changed all `editReply()` calls to `followUp()` for ephemeral dashboard messages
    - Kept `deferUpdate()` at top level for button message updates
  - **Result:** Voting works again with proper dashboard tracking
- **Knockout Voting Dashboard Flooding Fixed**
  - **Issue:** Each knockout vote created a NEW ephemeral "Your Votes" card, flooding the channel with multiple cards (user reported 5+ cards stacking up as they voted)
  - **Root cause:** Interaction wasn't properly deferred before trying to update dashboard, causing `followUp()` calls to create new messages instead of updating existing ones
  - **Fix:**
    - Added proper `interaction.deferReply({ ephemeral: true })` at the start
    - Changed dashboard creation to use `interaction.editReply()` for first message
    - Dashboard updates now properly edit the existing message instead of creating new ones
    - Personal dashboard persists and updates in place as user votes
  - **Result:** Users now see ONE "Your Votes" card that updates as they vote, not a flood of cards
  - **Public tally:** The public matchup voting messages (visible to everyone) continue to update with real-time vote counts
  - **Benefits:**
    - Clean UX - only one personal dashboard per round
    - Real-time progress tracking without clutter
    - Public voting cards show live vote totals for all users
- **Multiple Matchup Voting Buttons Separated**
  - **Issue:** When opening multiple matchups (via comma-separated input or region selector), all voting buttons were bundled together at the bottom, making it difficult to understand which buttons corresponded to which matchup
  - **Fix:** Each matchup now posts as a separate message with its own voting buttons directly below its card
  - **Impact:** Users can now clearly see which buttons belong to each matchup, significantly improving voting UX
  - **Affected commands:**
    - `/bracket open-matchup` (when opening multiple matchups like "1A,1B,1C")
    - `/bracket open-region` (opens all matchups in a region)

### Changed
- **Bracket Visualization Poster Opacity Increased to 50%**
  - **Previous:** Started at 30%, increased to 40%, now at 50% opacity
  - **Progression:** 30% → 40% → 50% (iterative improvements based on user feedback)
  - **Reason:** User tested 40% and confirmed posters could be even more prominent
  - **Impact:** Posters now significantly more visible in bracket visualizations while still maintaining excellent text readability
  - **Sweet spot:** 50% provides strong visual presence without overwhelming text content

### Added
- **Public "All Votes" Leaderboard for Knockout Rounds**
  - **Real-time public leaderboard** - Single card visible to everyone showing current vote tallies across all matchups in the round
  - **Updates in place** - Leaderboard refreshes automatically after each vote, not repeated
  - **Live statistics:**
    - Each matchup with current vote counts (e.g., "1A: Jaws (5) vs Kwaidan (3) 🔥")
    - Leader indicator: 🔥 for matchup with more votes, 🤝 for tied matchups
    - Total votes cast across all matchups
    - Number of matchups currently open
  - **Persistent tracking** - One leaderboard per guild per round, cached and updated in place
  - **Benefits:**
    - PRIMARY voting feedback for knockout rounds - shows all matchup tallies in one place
    - Users see real-time competition without voting
    - Transparent vote counts visible to all
    - Creates excitement and engagement around close matchups
    - No chat spam - single card updates silently
  - **Simple confirmation system:**
    - Vote button clicked → Simple "✅ Vote recorded!" confirmation (ephemeral)
    - "All Votes" leaderboard updates automatically (public, persistent)
    - Clean UX with no dashboard spam
- **Interactive Region Selector for open-region**
  - **`/bracket open-region` with no parameter** - Shows 2 buttons: Region 1 (Left Side) and Region 2 (Right Side)
  - **Simple button selection** - Just 2 options with directional emoji arrows (⬅️ ➡️)
  - **Shows matchup counts** - See how many matchups in each region before opening
  - **Consistent with other interactive selectors** - Same UX pattern as open-matchup and close-matchup
  - **Benefits:**
    - Faster than typing "1" or "2"
    - Visual clarity with emoji indicators
    - See matchup distribution before opening
    - Consistent button-based workflow
- **Interactive Matchup Selectors**
  - **`/bracket open-matchup` with no parameter** - Shows buttons for all pending matchups
  - **`/bracket close-matchup` with no parameter** - Shows buttons for all open matchups
  - **Visual selection interface:**
    - Open selector: Blue buttons showing matchup label and movie titles (e.g., "1A: Jaws... vs Night of...")
    - Close selector: Red buttons showing matchup label, titles, and current votes (e.g., "1A: Jaws(5) vs Night of...(3)")
  - **Multi-select supported** - Click multiple buttons to open/close several matchups at once
  - **15-minute button timeout** - Buttons expire after 15 minutes to keep UI clean
  - **Benefits:**
    - No need to remember/type matchup labels
    - Visual overview of all available matchups
    - Faster admin workflow
    - See current vote counts before closing
    - Reduces typing errors
- **Multi-Matchup Support**
  - **Comma-separated matchup lists** - Open or close multiple matchups with one command
  - **`/bracket open-matchup matchup:"1A,1B,2C"`** - Open multiple matchups at once
  - **`/bracket close-matchup matchup:"1A,1B,2C"`** - Close multiple matchups at once
  - **Individual error handling** - Each matchup processed separately with success/error tracking
  - **Smart response formatting:**
    - Single matchup: Detailed embed with region name and results
    - Multiple matchups: Summary embed listing all successes and errors
  - **Auto-advance tracking** - Shows which winners were automatically placed in next round
  - **Round completion detection** - Notifies when all matchups in round are closed
  - **Benefits:**
    - Faster tournament management
    - Less command spam in channels
    - Clear feedback for batch operations
    - Backwards compatible with single matchup commands
- **Prominent Matchup Labels in Voting**
  - **Clear matchup identification** - Every voting embed shows "**1A:** Vote for your pick!" in description
  - **Consistent across all contexts:**
    - advance-knockout (auto-open first round)
    - open-knockout (region-based opening)
    - open-matchup (individual/multi matchup opening)
    - Interactive button handlers
  - **Benefits:**
    - Users immediately see which matchup they're voting for
    - Reduces confusion when multiple matchups displayed
    - Better accessibility and clarity
    - Regional labels impossible to miss
- **Persistent Ephemeral Voting Dashboard**
  - **Real-time personal dashboard** - Each user gets their own voting tracker (only they can see it)
  - **Updates as you vote** - Dashboard refreshes instantly with checkmarks (✅) for selected titles
  - **Color-coded status** - Gray (no votes), Blue (partial), Green (complete)
  - **Works for BOTH phases:**
    - **Group Stage:** Shows all titles with ✅ for selected, ⬜ for not selected
    - **Knockout Rounds:** Shows all matchups with ✅ for voted, ⬜ for not voted
  - **Progress indicators** - "1 of 2 selected" or "All matchups voted!" with guidance
  - **Persistent across clicks** - Same message updates instead of creating new messages
  - **Smart cleanup** - Old dashboards auto-deleted after 1 hour
  - **Benefits:**
    - Users see their vote state in real-time across ALL matchups
    - No confusion about which buttons they clicked (especially important in large knockout rounds)
    - Reduces channel clutter (one persistent message vs many)
    - Works perfectly with Discord's ephemeral system
    - No cross-user pollution (each dashboard is private)
    - Track progress in Round of 32 (16 matchups), Round of 16 (8 matchups), etc.
- **Consolidated Tournament Warning Messages**
  - **Grouped by deadline** - Multiple groups with same deadline = ONE warning message
  - **Before:** 4 groups closing = 4 separate warning messages
  - **After:** 4 groups closing = 1 consolidated message: "Groups I, J, K, L"
  - **Works for both phases** - Group stage AND knockout matchups
  - **Benefits:**
    - Reduces notification spam (4 messages → 1 message)
    - Clearer communication (see all closing at once)
    - Less channel clutter
    - Better tournament pacing visibility
- **Auto-Start Knockout Voting**
  - **`/bracket advance-knockout` now auto-opens voting**
  - **Customizable duration** - `/bracket advance-knockout duration:"24h"` (default: 24h)
  - **One command workflow** - Generate bracket AND start voting immediately
  - **Sends voting buttons** - All matchups ready to vote right away
  - **Stores message IDs** - Scheduler can track and auto-close
  - **Fallback handling** - Clear error if voting fails to open
  - **Benefits:**
    - Eliminates extra `/bracket open-knockout` step
    - Better tournament flow and momentum
    - Natural expectation met (knockout starts = voting starts)
    - Fewer commands to remember
- **Comprehensive Logging System** (Drupal Watchdog-style)
  - **File-based logging** - All events logged to `logs/` directory in JSON format
  - **8 severity levels** - EMERGENCY (0) to DEBUG (7) following syslog standards
  - **Categorized logs** - system, command, button, select, modal, scheduler, bracket, timer, survey, api, database, performance, security
  - **Daily rotation** - New log file each day: `[category]-YYYY-MM-DD.log`
  - **Size-based rotation** - Files rotate when exceeding 10MB
  - **Auto-cleanup** - Logs older than 30 days automatically deleted
  - **Performance tracking** - Slow operations logged with duration
  - **Crash diagnosis** - Uncaught exceptions and unhandled rejections captured
  - **Discord errors** - Client errors and warnings logged
  - **`/eggshen-logs stats`** - View log statistics (file count, total size)
  - **`/eggshen-logs errors`** - View recent errors (EMERGENCY to ERROR levels)
  - **`/eggshen-logs category`** - View logs by category
  - **Benefits:**
    - Diagnose production crashes and CPU issues
    - Track command execution and performance
    - Monitor button interaction failures
    - Historical data for troubleshooting
    - Easy log viewing from Discord
    - No more diagnostic blackouts
- **Automatic Voting Closure System**
  - **Auto-close scheduler** - Background service checks voting deadlines every minute
  - **1-hour warnings** - Automatic reminder sent when voting closes in less than 1 hour
  - **Auto-close at deadline** - Groups and matchups automatically close when deadline passes
  - **Results posted automatically** - Final vote counts and winners announced when voting ends
  - **Visual closure** - Voting messages updated to show "🔒 CLOSED" status
  - **Disabled buttons** - All voting buttons disabled when voting ends
  - **Graceful shutdown** - Clean restart handling ensures no lost state
  - **Benefits:**
    - No manual intervention needed to close voting
    - Members get advance warning to cast votes
    - Immediate results when voting ends
    - Consistent tournament pacing
    - Reduces admin workload
- **Tournament Export System**
  - **`/bracket export format:json`** - Export full tournament data as JSON
    - Complete tournament structure, all groups, matchups, votes
    - Perfect for archival or data analysis
    - Can be imported back into bot (future feature)
  - **`/bracket export format:markdown`** - Export formatted results as Markdown
    - Group stage results with vote counts
    - Knockout bracket progression
    - Tournament statistics (voter participation, total votes)
    - Ready to paste into announcements or documentation
  - **Use cases:**
    - Archive completed tournaments
    - Share results in Discord or other platforms
    - Analyze voting patterns
    - Document tournament history
- **Tournament Management Improvements**
  - **`/bracket edit-name`** - Change tournament name after creation
    - Admin/moderator only
    - Update tournament branding mid-tournament
    - Fix typos in tournament name
  - **Enhanced `/bracket status`** - Real-time tournament dashboard
    - Shows **active voters count** for each open group/matchup
    - Displays **time remaining** with ⚠️ warning when <1 hour left
    - Shows **current leaders** in each active vote
    - More detailed progress tracking
    - Live vote counts for all active voting
- **Robust Error Handling**
  - **Comprehensive try-catch blocks** around all async operations
  - **Detailed error logging** with context (guild ID, user ID, custom ID)
  - **Graceful degradation** for API failures
  - **User-friendly error messages** instead of generic failures
  - **Button interaction safety** - Prevents "interaction failed" errors
  - **Message update protection** - Vote recorded even if message update fails
  - **Benefits:**
    - More reliable button voting
    - Better debugging for production issues
    - Improved user experience during errors
    - Prevents crashes from unexpected failures
- **Button-Based Group Voting**
  - **Interactive voting** - Members vote by clicking buttons instead of typing commands
  - **Visual feedback** - Selected titles highlight in green
  - **Real-time updates** - Vote counts update live on the voting message
  - **Simplified UX** - No commands needed for members to vote
  - **Two-click voting** - Click 2 buttons to cast your vote
  - **Flexible changes** - Deselect by clicking again, change anytime before deadline
  - **Clear constraints** - Maximum 2 selections enforced automatically
  - **Benefits:**
    - Eliminates need to remember movie positions (1-4)
    - No typing required - just point and click
    - Consistent with knockout voting (already button-based)
    - More accessible and intuitive for all users
    - Reduces voting errors and confusion
- **Improved Tournament Help & Button UX**
  - **`/bracket help`** - New comprehensive tournament guide command
    - Quick start steps for admins (8-step tournament flow)
    - How to vote instructions for members (group + knockout stages)
    - Common commands organized by role (Everyone vs Admin/Mod)
    - Auto-features overview (auto-close, warnings, live counts)
    - Pro tips (duration syntax, wildcards, custom images, exports)
  - **Enhanced button voting feedback**
    - Group voting: Visual embeds showing selection progress (1 of 2, 2 of 2)
    - Knockout voting: Confirmation embeds with trophy emoji and selected title
    - Color-coded embeds: Blue for partial selection, green for complete
    - Numbered steps in instructions with emojis (1️⃣ 2️⃣ 3️⃣ 4️⃣)
  - **Clearer voting instructions**
    - Opening messages with numbered how-to-vote steps
    - Prominent tips about changing votes before deadline
    - Updated footer text to guide users ("👇 Click a button...")
    - Simplified group embed descriptions
  - **Benefits:**
    - New users can learn tournament system with `/bracket help`
    - Better visual feedback reduces confusion
    - Consistent emoji-based UI throughout
    - Ephemeral responses keep channels clean
    - More intuitive voting experience
- **Timer Reminder** - New `/timer remind` subcommand
  - **`/timer remind`** - Announce timer is starting right before watch party begins
  - **Auto-detects Discord scheduled events** - Finds event linked to current channel
  - **TMDB integration** - Shows poster, runtime, year, and overview
  - **Smart buttons** - "View on TMDB" and "Join Voice Channel" (if applicable)
  - **Custom host message** - Add personal message (e.g., "Everyone ready?")
  - **Role mentions** - Ping specific groups
  - **Pre-timer announcement** - Use right before running `/timer start`
  - **Use case:** Already announced watch party 1-2 hours ago? Use this for final "timer starting now" notice
  - **Integrated with timer** - All timer-related functions in one command
- **Regional Bracket Identification System**
  - **Regional labels** for all knockout matchups (e.g., "1A", "2B", "1C")
  - **Region 1 (Left Side)**: Matchups labeled 1A, 1B, 1C, 1D...
  - **Region 2 (Right Side)**: Matchups labeled 2A, 2B, 2C, 2D...
  - **Regional labels shown in:**
    - Command parameters (use "1A" instead of "1")
    - All voting embeds and displays
    - Generated bracket images
    - Result announcements
  - **New `/bracket open-region` command**
    - Open all matchups in one region (left or right side)
    - Perfect for splitting rounds across multiple days
    - Example: Open Region 1 Monday, Region 2 Wednesday
  - **Three opening options for maximum flexibility:**
    - `/bracket open-knockout` - Opens entire round (all matchups, both regions)
    - `/bracket open-region region:1` - Opens all left side OR right side matchups
    - `/bracket open-matchup matchup:1A` - Opens one specific matchup
  - **Benefits:**
    - Easier to reference specific matchups ("open 1A" vs "open matchup 1")
    - Visual clarity in bracket structure (left vs right side)
    - Flexible pacing options (by round, by region, or by matchup)
    - Better organization for large tournaments
    - Clear regional narratives ("East vs West", "Old School vs New School")

### Changed
- **BREAKING: Tournament Bracket Command Structure**
  - **Replaced `/bracket add-group`** with **`/bracket add-title`** for precise title selection
  - **Old workflow:** Add 4 titles at once, auto-select first match when multiple results found
  - **New workflow:** Add one title at a time with selection menu for disambiguation
  - **Why:** Aligns with bot's core principle of letting users select the exact title they want
  - **Migration:** Instead of `/bracket add-group group:A type:movie title1:X title2:Y title3:Z title4:W`, now run `/bracket add-title group:A type:movie title:X` four times
  - **Benefits:** 
    - Selection menu shows all matches with years and descriptions (like `/movie`, `/tv`, etc.)
    - Progress tracking shows "2/4 titles" so you know how many more needed
    - Prevents duplicate titles in same group
    - More flexibility - can add 1-4 titles per group before opening voting
- **Tournament Creation Privacy**
  - `/bracket create` is now **ephemeral** (only visible to admin/moderator who created it)
  - Regular members no longer see setup process
  - Use `/bracket announce` when ready to share tournament with server
  - Keeps channel clean during tournament setup

### Removed
- **`/bracket vote-group` command** - No longer needed
  - Group stage voting is now button-based
  - Members vote by clicking buttons on the voting message
  - Eliminates 21 command parameters (group, choice1, choice2) that users had to remember
  - Simpler, more intuitive user experience

### Improved
- **Tournament Bracket Visualization (`/bracket view`)**
  - **Complete redesign** - Now displays a proper tournament bracket tree layout (like March Madness)
  - **Clear matchup pairing** - Each matchup has two participant boxes grouped together with container border
  - **Proper bracket tree structure** - Connector lines show which matchups feed into next round
  - **Minimum 1200px width** - Wide, spacious, professional appearance
  - **Landscape participant boxes** - 240px wide × 50px tall for optimal readability
  - **Left-aligned text** - Easier to read than centered text
  - **Smart truncation** - Ellipsis for titles that don't fit
  - **Visual flow** - Clear progression from left to right through rounds
  - **Matchup spacing** - 140px vertical spacing with 10px gap between paired participants
  - **Better connector lines** - 40px horizontal extension then vertical connection to next round
  - **Winner indicators** - Green highlighting and checkmarks on the right side of boxes
  - **Full bracket tree generation** - All rounds (Round of 32 → Round of 16 → Quarterfinals → Semifinals → Finals) are generated upfront with "TBD" placeholders
    - Previously only showed current round with completed matchups
    - Now displays complete tournament structure from start to finish
    - Future matchups show as "TBD vs TBD" until winners are determined
    - Provides clear visual roadmap of entire tournament progression
- **Group Voting Display (`/bracket open-groups`)**
  - **Even distribution** - Groups now display in balanced rows (e.g., 4 groups = 2x2 grid instead of 3-1)
  - **Dynamic layout** - Automatically calculates optimal groups per row:
    - 4 or fewer groups: 2 per row
    - 5-9 groups: 3 per row
    - 10+ groups: 4 per row
  - **Better visual balance** - Cleaner, more symmetrical presentation when opening group voting

### Added
- **Tournament Brackets**
  - **NEW: Knockout Voting System** - Complete interactive voting for tournament bracket matches
    - **`/bracket open-knockout`** - Opens current round matchups for member voting
      - Button-based voting interface for each matchup
      - Real-time vote count updates
      - One vote per user per matchup (can change vote anytime)
      - Displays all matchups for current round with VS presentation
    - **`/bracket close-knockout`** - Closes round and advances winners automatically
      - Determines winner for each matchup (higher votes win, random if tied)
      - **Auto-advances winners** to next round matchups
      - **Auto-updates tournament phase** when round completes
      - Shows detailed results with vote counts
      - Detects tournament completion after finals
    - **Interactive Button Voting**
      - Click title buttons to vote in matchups
      - Ephemeral confirmation when vote recorded
      - Vote updates immediately in message
      - Can change vote by clicking different option
      - Ensures one vote per matchup per user
    - **Automatic Winner Advancement**
      - Winners automatically populate next round matchups
      - Tournament phase advances seamlessly (Round of 16 → Quarterfinals, etc.)
      - Finals completion marks tournament as complete with champion
      - Bracket visualization updates with results
    - **Complete Workflow:** Generate bracket → Open voting → Members vote → Close round → Winners advance → Repeat until champion
  - **NEW: Customizable Voting Timeframes** - Control voting duration for group stage and knockout rounds
    - **`duration` parameter** added to `/bracket open-groups` and `/bracket open-knockout`
      - Default: 24 hours
      - Range: 5 minutes (5m) to 30 days (30d)
      - Format: "5m", "2h", "24h", "3d", "7d", etc.
      - Examples: `duration:48h` for 2 days, `duration:3d` for 3 days, `duration:1h` for 1 hour
    - **Voting deadline display** - Shows time remaining and exact deadline in embeds
    - **`/bracket extend-voting`** - Extend or change voting deadline after opening
      - For group voting: extend specific groups by letter
      - For knockout: extends all matchups in current round
      - Admins and moderators can modify deadlines as needed
      - Shows updated time remaining and exact deadline after extending
    - **Flexible tournament pacing** - Run quick tournaments (30-minute rounds) or slow-burn events (week-long voting)
    - **Per-server control** - Tournament admins set duration based on their community's needs
    - **Deadline enforcement** - Voting automatically blocked after deadline expires
      - Users receive clear error message with time expired ("ended 2 hours ago")
      - Prevents late votes while allowing admins to extend if needed
      - Lazy evaluation approach - validates on vote attempt, no background jobs needed
      - Encourages admins to close voting or extend deadlines proactively
  - **NEW: `/bracket my-votes`** - View your personal voting status and history
    - **Private voting dashboard** (ephemeral response - only you can see it)
    - **Groups voted** - See which groups you've voted in and your exact choices
    - **Available votes** - Lists groups/matchups you haven't voted in yet
    - **Time remaining** - Shows countdown for each active vote
    - **Knockout history** - View all matchup votes you've cast
    - **Never miss a vote** - Easy way to track what's left to vote on
    - **Deadline awareness** - See when each vote expires
    - **Perfect for large tournaments** - Essential when managing 8-12 groups with staggered voting
  - **NEW: Individual Matchup Control** - Open and close specific matchups for granular tournament pacing
    - **`/bracket open-matchup`** - Open a single matchup for voting instead of entire round
      - Specify matchup number (1-32 depending on round)
      - Set custom duration per matchup
      - Perfect for spacing out matchups over days
      - Build suspense by featuring one battle at a time
      - Example: `/bracket open-matchup matchup:1 duration:24h`
    - **`/bracket close-matchup`** - Close individual matchup and determine winner
      - Closes specific matchup by number
      - Winner immediately placed in next round slot
      - When ALL matchups in round close, tournament auto-advances
      - Flexible staggered closing
      - Example: `/bracket close-matchup matchup:1`
    - **Use Cases:**
      - One matchup per day for maximum engagement
      - Spotlight important matchups individually  
      - Mix batch mode (whole round) with individual mode
      - Feature matchups with custom timings
      - Build community discussion around each battle
    - **Auto-Advancement Intelligence:**
      - Each matchup winner advances immediately to their next round slot
      - Tournament phase advances when last matchup in round closes
      - Seamless progression whether using batch or individual mode
      - Combine approaches within same tournament (batch some rounds, individual others)
  - **NEW: Custom Image Support** - Upload images or provide URLs when adding titles to brackets
    - Optional `image` parameter in `/bracket add-title` (attachment option)
    - Upload images directly from your device (PNG, JPG, GIF, WebP)
    - Or paste image URLs from Discord CDN, Imgur, or any direct image link
    - Custom images override API posters in matchups and voting screens
    - Perfect for servers that don't want AI-generated images
    - Useful for custom artwork or specific promotional posters
    - Falls back to API poster if no custom image provided
  - **NEW: `/bracket remove-title`** - Remove titles from groups during setup phase
    - Remove by position (1-4) from any group
    - Only available before voting starts
    - Automatic re-indexing of remaining titles
    - Confirmation embed shows removed title with thumbnail
    - Useful for fixing mistakes before opening group voting
  - **NEW: `/bracket resize`** - Dynamically expand or contract tournaments during setup
    - Change group count from 4-12 groups (16-48 total titles)
    - **Expanding:** Adds new groups (shows which new groups are available)
    - **Contracting:** Validates that groups being removed are empty
    - **Smart Validation:** Provides detailed actionable guidance when resize fails
      - Lists which groups have titles that would be removed
      - Shows exactly how many titles need to be moved or removed
      - Suggests minimum group count needed to keep all current titles
      - Offers 3 clear options: move titles, remove titles, or adjust target size
    - Perfect for tournaments that grow larger than initially planned
  - **NEW: `/bracket announce`** - Public tournament announcements with custom messaging
    - Share tournament details with the entire server
    - Optional custom message parameter
    - Optional tournament banner/image attachment
    - Shows tournament type, groups, entry count, and current status
    - Can be used at any phase (setup, group voting, knockout)
    - Perfect for generating hype and informing members when voting opens
  - **NEW: `/bracket list-groups`** - Simple text display of all groups and titles
    - Shows all groups with their titles in a clean, easy-to-read format
    - Displays voting status indicators (🗳️ for open voting, ✅ for closed)
    - Shows empty groups with clear indication
    - Group completion progress counter
    - Available to all members (not just admins/mods)
    - Perfect for quick overview of tournament lineup without generating images
    - Useful during setup to see which groups need more titles
- **AI Image Generation System**
  - **NEW: `/image` command** - Generate AI images from text prompts or Discord messages
    - Text-to-image: `/image prompt:"A dragon flying over a castle"`
    - From messages: `/image message:username` (finds recent message from user)
    - From message ID: `/image message:1234567890123456789`
    - Square format (1024x1024), standard quality
    - 10-30 second generation time
    - Cost: $0.04 per image
  - **NEW: Server-wide Feature Toggle**
    - Completely disable AI image generation per server
    - `/eggshen-config ai-images feature-toggle enabled:false` to disable
    - Separate from rate limiting (can disable feature OR just limit usage)
    - When disabled, all AI commands show clear error messages
  - **NEW: Permission Level Controls**
    - Control who can use AI image commands per server
    - `/eggshen-config ai-images set-permissions level:[everyone|moderators|admins]`
    - `everyone` (default) - All members can generate images
    - `moderators` - Only moderators and admins
    - `admins` - Only server administrators
    - Combined with rate limiting for fine-grained control
  - **Comprehensive Rate Limiting System**
    - Per-user cooldown: 5 minutes (configurable 60-3600 seconds)
    - Per-user daily limit: 10 images (configurable 1-100)
    - Per-server daily limit: 50 images (configurable 1-500)
    - Admin/moderator cooldown bypass (optional, respects daily limits)
    - Whitelisted users: Unlimited generation for contributors/premium users
    - Cost tracking and statistics
    - Prevents excessive API costs (default: $60/month max)
  - **Configuration Commands** (`/eggshen-config ai-images`)
    - `view` - See settings, server stats, and personal usage
    - `feature-toggle` - Enable/disable AI image generation entirely
    - `set-permissions` - Control who can use the commands
    - `toggle` - Enable/disable rate limiting
    - `user-cooldown` - Set cooldown between generations
    - `user-daily-limit` - Set max images per user per day
    - `guild-daily-limit` - Set max images per server per day
    - `admin-bypass` - Toggle admin cooldown bypass
    - `whitelist-add` - Grant unlimited access to specific users
    - `whitelist-remove` - Remove unlimited access
    - `whitelist-list` - View whitelisted users
    - `reset-user` - Reset user's usage
    - `reset-guild` - Reset server's usage
  - **Enhanced `/bracket image` Command**
    - **NEW: `prompt` parameter** - Add custom details to matchup images
    - **Smart Search Validation** - Validates titles through TMDB, RAWG, BGG, Google Books
    - **Disambiguation Menu** - Shows selection when multiple matches found (like `/movie`)
    - **Cross-Type Support** - Compare movies vs games, TV vs books, etc.
    - **Strict Left-Right Layout** - Title 1 always left, VS center, Title 2 always right
    - **Content Policy Compliance** - "Inspired by themes" prompts avoid replication
    - **Rich Metadata** - Uses overviews and descriptions for better prompts
    - **Rate Limited** - Same limits as `/image` command
    - Wide format (1792x1024) for split-screen compositions
  - **OpenAI Model Update** - Updated to `gpt-image-2` (latest image generation model)
  - **Usage Tracking** - Logs all generations with cost, user, guild, and metadata
  - **Cost Protection** - Prevents runaway costs ($60/month default max vs $2,400/month unlimited)
- **Tournament Bracket Visualizations**
  - `/bracket view` command generates March Madness-style bracket images
  - Shows full tournament tree with all rounds and matchups
  - Visual highlighting for winners (green backgrounds with checkmarks)
  - Displays VS indicators, connector lines, and round labels
  - Champion trophy display when tournament complete
  - Discord dark theme styling, PNG format
  - Uses @napi-rs/canvas for fast image generation
  - Only available during knockout phase
- **Tournament Bracket System (`/bracket` command)**
  - Host comprehensive tournaments with flexible sizing (16-48 entries)
  - **NEW: Smart search integration** - `/bracket add-group` searches TMDB/RAWG/BGG/Google Books
  - **NEW: Multi-type support** - Movies, TV shows, video games, board games, or books
  - **NEW: Rich metadata storage** - IDs, years, poster URLs, ratings stored per entry
  - **NEW: Type validation** - Prevents mixing different types in same tournament
  - Configurable group count: 4-12 groups (default 8), each with 4 entries
  - Group stage: Members vote for top 2 in each group
  - Dynamic wildcard system: Automatically calculates wildcards needed (0-8) to reach power-of-2 bracket
  - Knockout stage: Single elimination with dynamic round naming (Semifinals → Quarterfinals → Round of 16 → Round of 32)
  - 10 subcommands: create, add-group, open-groups, close-groups, vote-group, advance-knockout, status, view, image, cancel
  - Admin/moderator management controls, all members can vote
  - Random tiebreaker for fair vote resolution
  - Vote change support (users can change votes before close)
  - Complete tournament state persistence in JSON format
  - Configurable via `/eggshen-config commands toggle`
  - Perfect for community competitions like "The Ultimate Horror Cup"
- **Spotify Premium Detection and Graceful Fallback**
  - Detects when Spotify API requires Premium subscription (403 errors)
  - Automatically disables Spotify features when Premium detected
  - Bot continues working with iTunes-only for soundtrack searches
  - Clear warning logs explain why Spotify is unavailable
  - No errors exposed to users when Spotify unavailable
  - Graceful degradation ensures `/soundtrack` command always works
- **Spotify Integration for Soundtrack Search**
  - Added Spotify API support alongside iTunes for `/soundtrack` command
  - Displays results from both iTunes and Spotify when both are configured
  - Shows album artwork, artist, track count, and release dates from both services
  - Includes clickable links to both platforms for listening and purchasing
  - Falls back to iTunes-only if Spotify not configured (backwards compatible)
  - Free Spotify Developer API with unlimited requests
  - OAuth 2.0 Client Credentials flow for server-to-server authentication
- **Soundtrack Search (`/soundtrack` command)**
  - Search for movie and TV show soundtracks via iTunes Search API
  - TMDB title verification ensures correct soundtrack matching
  - Displays album artwork, artist/composer, track count, release date, genre, and price
  - Direct iTunes links for listening and purchasing
  - No API key required - uses free iTunes Search API
  - Follows same selection pattern as other search commands for consistency
- **Survey/Polling System (`/survey` command)**
  - Create interactive surveys with up to 10 options
  - Real-time vote tracking via reaction emojis (1️⃣-🔟)
  - Single or multiple vote modes
  - View live results with progress bars showing percentages
  - Comprehensive management: `/survey list`, `/survey results`, `/survey close`, `/survey delete`
  - Permission system: creator, administrators, and moderators can manage surveys
  - Persistent storage in JSON format per-guild
  - Configurable via `/eggshen-config commands toggle` (can be enabled/disabled per server)
  - Alternative to `/poll` and `/vote` commands that may be provided by other bots

### Fixed
- **CRITICAL: Knockout Bracket Generation Bug**
  - **Issue:** Tournaments with more than 4 groups had incomplete knockout brackets. For example, a 12-group tournament only created 4 first-round matchups instead of 12, leaving 8 qualified movies without matchups. Visualization showed sparse Round of 32/16 with mostly TBD placeholders.
  - **Root cause:** Code used `opponent.index` to track which runners-up had been matched. The `index` property represents position within each group (0=1st, 1=2nd, 2=3rd, 3=4th), NOT a unique identifier. Multiple runners-up across different groups share the same index value (e.g., all second-place finishers have index=1). After matching one opponent with index=2, ALL other runners-up with index=2 were incorrectly marked as "used", even though they were different movies from different groups.
  - **Example:** In a 12-group tournament, runners-up had indices Counter({0: 2, 1: 4, 2: 3, 3: 3}). After matching 4 winners (one per unique index value 0-3), the code thought all opponents were used, leaving 8 winners with no matchups.
  - **Fix:** Changed to use unique key `title + groupId` instead of `index` to track used opponents. Now properly creates matchups for ALL qualified movies.
  - **Impact:** Affects all tournaments with 5+ groups. Existing broken tournaments can be fixed with `/bracket regenerate`.
  - **Benefit:** Complete, properly populated knockout brackets with all qualified movies receiving first-round matchups.
- **Button Selection Cross-User Pollution Bug**
  - **Issue:** When User A voted, their button selections (green buttons) appeared as selected for ALL users (User B, C, D, etc.)
  - **Root cause:** Discord messages are shared, not per-user. When buttonHandler edited the message to highlight buttons (ButtonStyle.Success), those style changes applied globally to everyone viewing the message.
  - **Fix:** Removed button style updates from shared voting messages entirely. Buttons stay gray (ButtonStyle.Secondary) for everyone. Users see their selection feedback only in their private ephemeral dashboard.
  - **Benefit:** No more confusion about seeing other people's votes highlighted on your screen.
- **Bracket Visualization Layout Issues**
  - **Issue:** Round of 32 had overlapping titles, missing TBD rectangles, inconsistent spacing
  - **Root cause:** Used dynamic spacing based on canvas height instead of fixed MATCHUP_SPACING constant, causing overlaps with many matchups
  - **Fix:** Now uses fixed MATCHUP_SPACING (140px) for consistent positioning, proper canvas height calculation, all matchups positioned at precise intervals
  - **Benefit:** Clean, properly spaced brackets with no overlapping text and all TBD rectangles visible

## 1.0.0 - 2026-06-21

### Added
- **Production-ready release** 🎉
- **Timer duration parameter with auto-stop**
  - Optional `duration` parameter (1-600 minutes) for `/timer start`
  - Timer automatically stops and announces completion when duration expires
  - Prevents issue of users forgetting to stop timers after content ends
  - Duration persists across bot restarts with restored auto-stop timeouts
  - Shows remaining time in `/timer status` when duration is set
- **Runtime auto-detection from TMDB**
  - When timer auto-detects label from Discord event, searches TMDB for runtime
  - Automatically adds 10-minute buffer to cover setup time and credits
  - Shows selection menu when multiple TMDB matches found (movies and TV shows)
  - Users select correct title before timer starts
  - Includes "Skip" option to start without duration
  - Improves UX by preventing incorrect runtime detection
- **Conditional command registration based on API availability**
  - `/game` and `/boardgame` commands won't appear in Discord if API keys aren't configured
  - Prevents users from seeing unavailable commands
  - Cleaner UX - only shows what's actually available
- **Comprehensive API Keys Guide**
  - New documentation page with step-by-step instructions for all APIs
  - Includes Discord Bot, TMDB, OMDB, Trakt, RAWG, and BoardGameGeek
  - Registration time estimates, rate limits, and troubleshooting
  - Security best practices for API key management
- **BoardGameGeek API integration completed**
  - `/boardgame` command now fully functional with BGG_CLIENT_ID
  - `/random boardgame` supports category and rating filters
  - `/similar` includes board game recommendations
  - Requires BGG_CLIENT_ID environment variable
- **API key validation for all commands**
  - Commands gracefully fail with helpful error messages if required API keys are missing
  - `/game` requires RAWG_API_KEY
  - `/boardgame` requires BGG_CLIENT_ID
  - `/random` validates keys for game/boardgame subcommands
  - `/similar` skips unavailable media types when API keys are missing
- **Timer countdown theme option**
  - Modern theme (default) - Colorful animated countdown with visual blocks
  - Classic theme - Sequential text countdown matching original bot behavior
  - Usage: `/timer start theme:classic` or `/timer start theme:modern`
  - Helps users transition from old bot with familiar countdown style
- **Professional documentation site**
  - Hosted at https://eggshenbot.com
  - Custom domain with HTTPS
  - WCAG 2.1 AA accessibility compliance
  - Custom cyan theme (#2AB5E5) with proper contrast ratios
  - Favicon and Apple touch icons
  - Complete command reference
  - Installation and configuration guides

### Changed
- **License changed from MIT to CC BY-NC-SA 4.0**
  - Requires attribution for all uses
  - Prohibits commercial use
  - Requires derivative works to use the same license
  - See LICENSE file for full details
- Documentation updated to accurately reflect actual command implementations
  - Fixed `/timer start` parameters (no duration/description - uses label and theme)
  - Corrected `/watched` commands syntax
  - Updated `/eggshen-config` documentation to match real subcommand structure
  - Removed fictional moderation commands that don't exist
  - Fixed all search command examples to use correct parameter syntax
- Documentation home page features updated
  - Replaced "Smart Notifications" with "Smart Auto-Detection" feature
  - Updated logo to transparent version with reduced file size

### Fixed
- **Critical interaction handling bugs** preventing production crashes
  - Added defensive checks before all interaction.reply and deferReply calls
  - Wrapped error handler in try-catch to prevent cascading failures
  - Fixed timer command timeout issues (3-second interaction expiry)
  - Applied fixes to movie, tv, game, boardgame commands and select handlers
- Ghost timer persistence issue resolved

---

## Pre-1.0 Development Releases

## 0.4.0 - 2026-06-21

### Added
- Complete VitePress documentation site with GitHub Pages deployment
- Custom cyan theme (#2AB5E5) with tinted grays for brand consistency
- Comprehensive documentation covering all features and commands
- Bot logo integration in documentation navbar
- Documentation sections:
  - Getting Started guide
  - Complete installation instructions
  - Configuration guide
  - Search commands reference
  - Watch party commands reference
  - Admin configuration reference
  - Moderation commands reference
  - Rate limiting system documentation
  - Moderation tools guide
  - Watch history feature documentation
  - Statistics feature documentation
  - Notifications feature documentation (planned)
  - API reference for developers
  - Changelog (this file)

### Changed
- README now includes documentation badge and link
- README simplified with documentation site as primary reference

## 0.3.0 - 2026-06-19

### Changed
- **[BREAKING]** Watch history saves are now PUBLIC instead of ephemeral
  - Removed ephemeral flag from watch history modal submissions
  - Watch history entries now appear publicly in the channel
  - Changed display text from "Added by" to "Saved by" for clarity
- **[BREAKING]** Watch history now tracks server-level viewing, not personal ratings
  - Removed rating field from watch history modal
  - Removed rating from all watch history displays
  - Removed rating parameter from `/watched add` command
  - Watch history is now a community feature, not personal tracking

### Added
- Channel tracking for watch history entries
  - `channelId` field stores where content was watched
  - `channelName` field displays human-readable channel name
  - Watch history displays now show channel links
  - Useful for tracking which channels host watch parties

### Fixed
- Watch history save button permission system updated
  - Button now uses timer starter's userId instead of button clicker
  - Permission check allows timer starter OR moderators/admins
  - Only users with proper permissions see "Log to Watch History" button functionality
  - Prevents unauthorized users from logging watch history

## 0.2.0 - 2026-06-15

### Added
- Comprehensive rate limiting system (7 layers):
  - Per-user cooldowns (3 seconds between commands)
  - Guild-wide rate limits
  - Pattern detection for abuse
  - Abuse logging with mod channel integration
  - Auto-ban threshold (temporary bans after violations)
  - Manual cooldown controls for moderators
  - Whitelist mode for emergency situations
- Moderation commands:
  - `/cooldown add` - Apply manual cooldowns to users
  - `/cooldown remove` - Remove cooldowns early
  - `/cooldown list` - View active cooldowns
  - `/cooldown status` - Check specific user's cooldown status
  - `/ban-status` - Check user's auto-ban status
  - `/ban-remove` - Remove auto-bans
  - `/ban-history` - View ban/violation history
  - `/abuse-log` - View recent abuse incidents
  - `/abuse-patterns` - Analyze user behavior patterns
  - `/whitelist-mode` - Enable/disable emergency mode
  - `/whitelist add/remove/list` - Manage whitelisted users
- Abuse logging system:
  - Configurable per-server
  - Logs to dedicated mod logs channel
  - Tracks violations, auto-bans, and manual actions
  - Pattern detection algorithms
- Guild configuration system:
  - Per-server settings storage
  - Persistent configuration across bot restarts
  - Admin-only configuration access
- Statistics tracking:
  - Command usage statistics
  - User activity tracking
  - Watch party statistics
  - Content popularity metrics
  - Rate limit effectiveness metrics

### Changed
- `/eggshen-config` command expanded with new settings:
  - `rate-limiting` - Enable/disable rate limiting
  - `abuse-logging` - Enable/disable abuse logging
  - `mod-logs-channel` - Set dedicated moderation logs channel
- Permission system clarified:
  - Watch history saves require timer starter OR admin/mod permissions
  - Configuration requires Administrator or Manage Server permissions
  - Moderation commands require Moderate Members or Administrator permissions

## 0.1.0 - 2026-06-01

### Added
- Initial release of Egg Shen Bot
- Core search commands:
  - `/movie <title>` - Search for movies
  - `/tv <title>` - Search for TV shows
  - `/episode <show> <season> <episode>` - Search for specific episodes
  - `/episode-list <show> <season>` - List all episodes in a season
  - `/game <title>` - Search for video games
- Watch party timer system:
  - `/timer start` - Start countdown timer
    - Optional `label` parameter for what you're watching
    - Optional `duration` parameter (1-600 minutes) for auto-stop
    - Optional `theme` parameter (`modern` or `classic`)
  - `/timer stop` - Stop active timer
  - `/timer status` - Check timer status
  - Interactive "Log to Watch History" button on completion
- Watch history tracking:
  - `/watched add` - Add to watch history manually (searches movies and TV)
    - `title` parameter (required)
    - `notes` parameter (optional)
  - `/watched history` - View server watch history with filters
  - Integration with timer system for automatic logging
- Utility commands:
  - `/random <type>` - Get random movie/TV show suggestion
  - `/similar <type> <title>` - Find similar content
  - `/stats [type]` - View bot statistics
  - `/help [command]` - Get help with commands
- Admin commands:
  - `/eggshen-config <setting> <value>` - Configure bot for server
  - `/eggshen-config view` - View current configuration
  - `/eggshen-config reset` - Reset to defaults
- External API integrations:
  - TMDB (The Movie Database) - Required, primary data source
  - OMDB (Open Movie Database) - Optional, additional ratings
  - Trakt.tv - Optional, watch tracking integration
  - RAWG - Optional, game database
- Rich embeds with:
  - Movie/TV show information
  - Ratings from multiple sources (IMDB, Rotten Tomatoes, Metacritic)
  - Cast and crew information
  - Streaming availability via JustWatch
  - Genre, runtime, release dates
  - Poster images and thumbnails
- Discord.js v14 features:
  - Slash commands
  - Button interactions
  - Select menus
  - Modal forms
  - Ephemeral messages (later changed for watch history)
- Environment variable configuration
- Error handling and logging
- ES module architecture

### Technical Details
- Built with Node.js 20+
- Discord.js v14.14.1
- ES modules (ESM) architecture
- In-memory data storage with optional persistence
- RESTful API integration with external services

---

## Versioning Guide

### Version Number Format: MAJOR.MINOR.PATCH

- **MAJOR** - Incompatible API changes, breaking changes
- **MINOR** - New features, backwards-compatible functionality additions
- **PATCH** - Backwards-compatible bug fixes

### Change Categories

- **Added** - New features
- **Changed** - Changes to existing functionality
- **Deprecated** - Soon-to-be-removed features
- **Removed** - Removed features
- **Fixed** - Bug fixes
- **Security** - Security vulnerability fixes

---

## How to Update This Changelog

**For AI Assistant / Contributors:**

When making changes to functionality, **always** update this changelog following these guidelines:

### 1. Determine Change Type

- **Added** - Created new feature, command, or capability
- **Changed** - Modified existing behavior, updated functionality
- **Fixed** - Corrected bugs or errors
- **Removed** - Deleted features or commands
- **Security** - Fixed security issues

### 2. Write Clear Descriptions

**Good:**
```markdown
### Changed
- **[BREAKING]** Watch history saves are now PUBLIC instead of ephemeral
  - Removed ephemeral flag from modal submissions
  - Entries now visible to all server members
  - Changed "Added by" to "Saved by" for clarity
```

**Bad:**
```markdown
### Changed
- Changed watch history
- Updated some things
```

### 3. Mark Breaking Changes

Use `**[BREAKING]**` prefix for changes that require user action or change expected behavior:

```markdown
### Changed
- **[BREAKING]** Rating field removed from watch history
```

### 4. Group Related Changes

Group related changes under the same category:

```markdown
### Added
- Watch history channel tracking
  - Added channelId field
  - Added channelName field
  - Updated displays to show channel links
```

### 5. Update Version Number

Follow semantic versioning:
- Breaking changes → Increment MAJOR (1.0.0 → 2.0.0)
- New features → Increment MINOR (1.0.0 → 1.1.0)
- Bug fixes → Increment PATCH (1.0.0 → 1.0.1)

### 6. Add Date

Use format: `YYYY-MM-DD`

```markdown
## 1.3.0 - 2026-06-21
```

### 7. Update Unreleased Section

Move items from Unreleased to the new version section when releasing.

---

## Link References

[Unreleased]: https://github.com/r3volution11/Egg-Shen-Bot/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/r3volution11/Egg-Shen-Bot/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/r3volution11/Egg-Shen-Bot/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/r3volution11/Egg-Shen-Bot/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/r3volution11/Egg-Shen-Bot/releases/tag/v1.0.0

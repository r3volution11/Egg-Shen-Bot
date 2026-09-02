# Templates

Copy-during-setup templates that intentionally aren't the tracked `.env`/config files the bot actually reads at runtime — they live here (rather than the repo root) so a `git pull` never re-syncs them next to a real deployment's actual credentials.

Neither file is read by any code in this repo. They're one-time starting points, copied and then edited locally.

## `event_request_config.example.json`

An old, now-vestigial format for per-guild Event Requests settings. The real, current source of truth for this is `guild_configs/<guildId>.json` (gitignored, written by `/eggshen-config-events` — see [Event Requests setup](../EVENT_REQUEST_SETUP.md)), not this file. Kept here only as a reference for the JSON shape; you shouldn't need to copy or edit it for a normal setup.

## `.env.production-testing.example`

A `.env` template pre-filled with the extra variables the [Event Requests feature](../EVENT_REQUEST_SETUP.md) needs (OAuth, moderation channel, image-crop signing secret, etc.), useful as a starting point if you're testing that feature against a second (e.g. staging) deployment before promoting the config to your real production `.env`. Copy it, fill in real values, and use it as that deployment's `.env` — don't commit the copy.

```bash
cp templates/.env.production-testing.example .env
```

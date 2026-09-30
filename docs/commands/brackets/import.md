---
title: Setup Form & Templates - Tournament Brackets
description: Set up a whole tournament at once by uploading a CSV or JSON file, or by filling in a web form.
---

# Setup Form & Templates

Instead of adding titles one command at a time, you can set up a whole tournament on a web form: upload a CSV or JSON file, check the matches, and save. Every title goes through the same search `/bracket manage-titles` uses, so the result is exactly what you'd get by hand.

## Getting started

1. In Discord, run `/bracket setup-link` (administrators and moderators only). The bot replies privately with a link.
2. Open the link. It works for **60 minutes** and only for your server. Anyone you give it to can change your tournament setup, so keep it to yourself.
3. Choose the **type** (movies, TV shows, video games, board games or books).
4. Upload a CSV or JSON file, or add titles by hand. Download a template below to start from.
5. Press **Find matches**. Each title shows the poster and year it matched. If a title has several matches (remakes, sequels, common names), pick the right one from its menu. If nothing was found, fix the spelling and press **Find matches** again.
6. Fill in the name and any settings, then press **Create tournament**.
7. Back in Discord, run `/bracket announce`, then `/bracket open` to start voting.

Until voting opens, run `/bracket setup-link` again to reopen the form with everything filled in. Saving replaces the lineup; the form lists any titles that will be removed and asks first. Once voting has started, the form is read-only, but it can still download a backup.

::: tip Self-hosting
The link uses `PUBLIC_BOT_URL`, the address your bot's web server is reachable at. If it isn't set, `/bracket setup-link` tells you so instead of posting a broken link.
:::

## Templates

| File | What it is |
| --- | --- |
| [straight-bracket.csv](/templates/tournaments/straight-bracket.csv) | 8 titles, no groups. |
| [groups.csv](/templates/tournaments/groups.csv) | 16 titles in 4 groups of 4, the smallest groups tournament. |
| [tournament.json](/templates/tournaments/tournament.json) | Every setting, plus a short list of titles. |

A CSV opens in any spreadsheet app. Save it as CSV (in Excel, "CSV UTF-8") before uploading.

## CSV columns

One row per title, with a header row. Only `title` is required. Filling in `group` on any row makes it a groups tournament; leaving it empty everywhere makes it a straight bracket.

| Column | Required | What it does |
| --- | --- | --- |
| `title` | Yes | The search text, as you'd type it into `/bracket manage-titles`. A year on the end, like "The Thing (1982)", is moved into `year` for you. |
| `year` | No, but recommended | Picks the right release when there are remakes or sequels. With a year, most rows match with no picking. |
| `group` | Groups only | A letter A to L. Leave it empty in a straight bracket. In a groups tournament, an empty cell goes into the first group with room. |
| `id` | No | The title's id in its database: TMDB for movies and TV, RAWG for games, BoardGameGeek for board games, Google Books for books. Skips the search. Backups fill it in. |
| `image_url` | No | A direct link to an image to show instead of the poster. |

Column names can be in any order and any case. A column the form doesn't recognise, such as a misspelled `titel`, stops the upload with a message naming it, rather than being quietly ignored. The type isn't a column: a tournament holds one type, chosen on the form.

## JSON fields

A JSON file holds the same titles plus the settings, so one file can recreate a whole tournament. It's also the backup format: **Download backup** on the form, and `/bracket export format:json` in Discord, both produce this file with every `id` filled in, so re-importing it needs no searching or picking.

| Field | Required | What it does |
| --- | --- | --- |
| `format` | Yes | Always `"eggshen-tournament"`. |
| `version` | Yes | Always `1`. |
| `name` | Yes | The tournament name, up to 100 characters. |
| `type` | Yes | `movie`, `tv`, `game`, `boardgame` or `book`. |
| `seeding` | No | `ordered` or `random` (the default). See [Seeding](#seeding). |
| `votingDuration` | No | How long a round stays open when `/bracket open` is run without a `duration`, like `"24h"` or `"3d"`. 5m to 30d. Default `"24h"`. |
| `tiebreakerDuration` | No | How long a tiebreaker vote runs. 5m to 7d. Default `"1h"`. |
| `announcement` | No | `{ "message": "...", "imageUrl": "..." }`. Used by `/bracket announce` when you don't type a message or attach an image there. Message up to 1000 characters. |
| `titles` | Yes | A list of `{ "title", "year", "group", "id", "imageUrl" }`, the same as the CSV columns. |

Unknown fields are errors too. The voting channel isn't in the file, because channels belong to one server: voting happens in whichever channel you run `/bracket open` in.

## Rules the form checks

These are the rules `/bracket` always enforces. The form checks them all before saving, so a problem never leaves a half-built tournament behind.

| | Straight bracket | Groups tournament |
| --- | --- | --- |
| Titles | 2 to 32 | 16 to 48 (4 to 12 groups) |
| Groups | None | Letters from A with no gaps, exactly 4 titles each |
| Bracket size | The next power of two up from the title count | Set by how the groups finish |
| Byes | One per empty slot: 12 titles make a 16-slot bracket with 4 byes | Go to group winners |
| Seeding | Ordered or Random | Doesn't apply |

Every tournament also needs one type throughout, and no title twice. Two releases with different years are different titles.

### Seeding

Seeding decides who plays whom in the first round of a straight bracket.

- **Random** shuffles the titles when the bracket is built. This is the default, and how tournaments set up with commands work.
- **Ordered** treats your list as the seed order: the first title is seed 1. Round one pairs the best seed with the worst (1 v 8, 2 v 7, and so on), and seeds 1 and 2 go in opposite halves, so they can only meet in the final. Byes go to the top seeds. On the form, reorder titles with the ↑ ↓ buttons.

In a groups tournament, the file only decides which group each title is in. The knockout is seeded from the group results.

## When something's wrong

Problems are shown next to the row they belong to, all at once, and each can be fixed on the page.

| Problem | How to fix it |
| --- | --- |
| A row has several matches | Pick the right one from its menu. Adding a `year` avoids most of these. |
| Nothing found | Fix the spelling, or remove the year, then press **Find matches** again. |
| No title has that `id` | Clear the id to search by title instead. |
| The same title twice | Remove one, or pick a different release. |
| A group isn't exactly 4, or a letter is skipped | Move or add titles so every group from A onward has 4. |
| Too many titles for a straight bracket | Remove titles, or give them group letters to make a groups tournament. |
| Unknown column or field | Fix the name; the file isn't read until it's fixed. |
| "This link has expired" | Run `/bracket setup-link` again. Nothing you saved is lost. |
| Voting has started | The lineup can't change any more. The form can still download a backup. |

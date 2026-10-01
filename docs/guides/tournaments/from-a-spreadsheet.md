---
title: Set Up a Tournament From a Spreadsheet - Egg Shen Bot
description: Load a whole Discord tournament from a CSV or JSON file with /bracket setup-link - pick a template, fill in titles, check the matches and create it.
howto:
  name: Set up a tournament from a spreadsheet
  timeText: 10 minutes
  totalTime: PT10M
  steps:
    - name: Get the link
      text: In Discord, run `/bracket setup-link` (admins and moderators). The bot replies privately with a link that works for an hour.
    - name: Fill in a template
      text: Download the [straight-bracket CSV](/templates/tournaments/straight-bracket.csv) or the [groups CSV](/templates/tournaments/groups.csv), and put one title per row. Add a `year` to each title for the best matches.
    - name: Upload it
      text: Open the link, choose the type (movies, TV shows, games, board games or books), and upload your file.
    - name: Check the matches
      text: Each row shows the title it matched, with its poster. Pick the right one where there are several matches, and fix any that weren't found.
    - name: Create the tournament
      text: Add a name, choose the seeding and voting times, and press **Create tournament**. Then run `/bracket announce` and `/bracket open` in Discord.
---

# Set Up From a Spreadsheet

Typing 32 titles one command at a time is slow. The setup form takes a whole list at once, from a spreadsheet you can reuse and share.

<QuickSteps />

## Tips

- **Add the year.** "The Thing" matches two films; "The Thing, 1982" matches one. A year in the title, like "Halloween (1978)", is read automatically.
- **Groups go in a column.** Fill in `group` with letters A–L for a [groups tournament](./groups); leave it empty for a straight bracket.
- **Edit until voting starts.** Run `/bracket setup-link` again to reopen the form with everything filled in. Saving replaces the lineup, and lists anything it drops before it does.
- **Keep a backup.** `/bracket export format:json` saves the lineup and settings, ready to load again next year.
- **Custom images** go in an `image_url` column, as a direct link to an image.

## In detail

The [setup form page](/commands/brackets/import) has the full reference: every CSV column and JSON field, the rules the form checks, every error message and how to fix it, and the reverse-proxy setting a self-hosted bot needs.

## Related

- [Seeded bracket](./seeded), to decide who meets whom
- [Groups tournament](./groups)
- [Setup form reference](/commands/brackets/import)

---
title: Command Reference
description: "Every /bracket and /bracket-setup tournament command and option in Egg Shen Bot, organised by tournament phase, with examples."
kitHeadings:
  bracket-status: chart
  bracket-view: trophy
---

# Bracket Command Reference

Every tournament command and option, grouped by when you use it.

Tournaments use two commands:

- **`/bracket-setup`** gets a tournament ready before voting starts: create it, add titles, name it and announce it. Only admins and moderators see it.
- **`/bracket`** runs it from there: open and close voting, status, the bracket image and exports. Members use it too.

Setup moved to its own command in 2.62.0 to stay under Discord's size limit for a command. If Discord says a command is outdated, reload Discord (Cmd/Ctrl+R).

**Admins and moderators** here means members with the Administrator or Timeout Members (Moderate Members) permission. Everyone votes with buttons; voting needs no commands.

## Quick Reference Table

| Command | Who | What it does | When |
|---------|-----|--------------|------|
| `/bracket help` | Everyone | A private guide to the commands | Any time |
| `/bracket-setup create` | Admin/Mod | Create a tournament | Setup |
| `/bracket-setup setup-link` | Admin/Mod | Private link to the web [setup form](./import) (CSV/JSON upload or fill in) | Setup |
| `/bracket-setup manage-titles` | Admin/Mod | Add or remove a title | Setup |
| `/bracket-setup resize` | Admin/Mod | Change the number of groups | Setup |
| `/bracket-setup edit-name` | Admin/Mod | Rename the tournament | Any time |
| `/bracket-setup announce` | Admin/Mod | Post a public announcement | Any time |
| `/bracket open` | Admin/Mod | Open whatever comes next | Any time |
| `/bracket close` | Admin/Mod | Close everything voting now | Any time |
| `/bracket open-groups` | Admin/Mod | Open chosen groups | Group stage |
| `/bracket close-groups` | Admin/Mod | Close chosen groups and post their results | Group stage |
| `/bracket regenerate` | Admin/Mod | Rebuild the knockout from the group results | Knockout |
| `/bracket open-matchup` | Admin/Mod | Open one region or chosen matchups | Knockout |
| `/bracket close-matchup` | Admin/Mod | Close chosen matchups | Knockout |
| `/bracket resolve-tiebreaker` | Admin/Mod | Settle a tiebreaker now | Any time |
| `/bracket extend-voting` | Admin/Mod | Set a new deadline | Any time |
| `/bracket voting-post` | Everyone | Post the voting card again | While voting |
| `/bracket my-votes` | Everyone | Your votes in what's open now | While voting |
| `/bracket status` | Everyone | Progress and live vote bars | Any time |
| `/bracket list-groups` | Everyone | Numbered list of titles | Any time |
| `/bracket view` | Everyone | The tournament as an image | Any time |
| `/bracket export` | Everyone | Lineup and settings (JSON) or results (Markdown) | Any time |
| `/bracket cancel` | Admin/Mod | End the tournament | Any time |

**Older commands:** `advance-knockout`, `open-knockout`, `close-knockout`, `open-quarters`, `close-quarters`, `open-semis`, `close-semis`, `open-finals`, `close-finals` and `open-region` are gone. `/bracket open`, `/bracket close` and `/bracket open-matchup` do all of it. `add-title` and `remove-title` are now `/bracket-setup manage-titles`. Matchup images come from [`/image matchup:`](../ai-images).

**What the cards look like:**

<div class="dm-pair">
<div>

<DiscordCard name="tournament-status" />

*`/bracket status` during a round*

</div>
<div>

<DiscordCard name="matchup-results" />

*A matchup's results card, posted as it closes, with a drawn picture under it*

</div>
</div>

These examples use the bot's own emoji: the bars are carved stone channels filling with colour. The bot uploads them itself on its first start; until then the bars are plain coloured squares (🟩🟧⬜), as in the example under [`/bracket status`](#bracket-status). See [Knockout Rounds](./knockout#how-members-vote) for what each card shows.

---

## Getting Started

### `/bracket help`

A guide to the tournament commands, only for you.

**Parameters:** none

It covers:

- **Quick Start (Admin):** the eight steps from `create` to a champion
- **Tournament Sizes:** which `max-titles` gives a straight bracket and which gives groups
- **Seeding & Ties:** the `seeding` and `ties` options, with a link to [sports-style tournaments](/guides/tournaments/sports-styles)
- **How to Vote:** the group stage and the knockout
- **Smart Commands, Everyone Commands, Admin Commands:** what each command is for
- **Automatic Features** and **Pro Tips:** auto-close, warnings, live counts, duration syntax, custom images, exports
- **Vote Tracking:** voting streaks and server stats

```
/bracket help
```

---

## Setup Commands

These `/bracket-setup` commands get a tournament ready. All of them need an admin or moderator, and Discord only shows `/bracket-setup` to members who have the permission.

### `/bracket-setup create`

Create a tournament. `max-titles` decides its shape.

**Parameters:**
- `name` (required): the tournament name, up to 100 characters
- `max-titles` (optional, default 32): the most titles it holds. Discord shows each choice with its shape, such as "8 titles (Quarterfinals)" or "36 titles (9 groups)".
  - **2, 4, 8, 16, 32:** a straight bracket, head-to-head from round one. You can start with fewer titles; empty slots become byes.
  - **36, 40, 44, 48:** a groups tournament with 9, 10, 11 or 12 groups of 4, then a knockout. `/bracket-setup resize` changes the group count (4–12) during setup.
- `seeding` (optional): how a straight bracket is seeded. [More on seeding](/guides/tournaments/seeded)
  - **Random** (default): shuffled when the bracket is built
  - **The order I add them**: the first title added is seed 1
  - **By rating**: ranked by TMDB, RAWG, BoardGameGeek or Google Books rating
  - Seeded brackets show each title's seed, for example "(1) Halloween", and call out upsets.
- `ties` (optional): what a tied matchup does
  - **Runoff vote** (default): a short tiebreaker vote
  - **Higher seed wins**: the better seed goes through at once. Needs a seeded bracket; with Random seeding, ties always get a runoff.

**Examples:**
```
/bracket-setup create name:"Summer Movie Madness" max-titles:32
/bracket-setup create name:"Quick 8-Title Showdown" max-titles:8
/bracket-setup create name:"Horror March Madness" max-titles:16 seeding:By rating ties:Higher seed wins
/bracket-setup create name:"Epic 48-Title Championship" max-titles:48
```

**Notes:**
- The reply is private. It shows the shape and, for a straight bracket, the seeding and tie rule. Use `/bracket-setup announce` to tell the server.
- One tournament per server. Cancel or finish the current one first.
- In a groups tournament, `seeding` and `ties` don't apply, and the reply says so if you set them. Group results seed the knockout, and ties get a runoff.

---

### `/bracket-setup setup-link`

A private link to the web setup form, where you set up the whole tournament at once instead of one title at a time.

**Who can use:** Admin/Mod only

**Parameters:** none

```
/bracket-setup setup-link
```

**Notes:**
- The reply is private, and the link works for 60 minutes. Anyone you give it to can change the server's tournament setup.
- On the form, upload a CSV or JSON file, or fill it in by hand. You can keep editing until voting opens. After that, the form can only download a backup.
- The form also saves seeding, ties, default voting and tiebreaker durations, and an announcement message and banner.
- The link uses this server's [bot URL](../configuration#bot-url) if set, else the bot's `PUBLIC_BOT_URL`. With neither, it tells you what to set.
- Upload a `/bracket export format:json` file here to run a tournament again.

See [Setup Form](./import) for the file format.

---

### `/bracket-setup manage-titles`

Add or remove a title during setup.

**Parameters:**
- `action` (required): **Add Title** or **Remove Title**
- `group` (optional): a group letter, A–L. Groups tournaments only; leave it out in a straight bracket. When adding without one, the title goes into the first group with room.
- `type` (optional): needed for the first title, then the tournament's type is used
  - `movie` and `tv` search TMDB, `game` searches RAWG, `boardgame` searches BoardGameGeek, `book` searches Google Books
- `title` (required when adding): what to search for
- `position` (required when removing): the title's number from `/bracket list-groups`. 1–4 in a group, or 1–32 in a straight bracket.
- `image` (optional, adding only): your own picture, shown instead of the poster or cover

**Adding:**
```
/bracket-setup manage-titles action:"Add Title" group:A type:movie title:"The Thing"
/bracket-setup manage-titles action:"Add Title" group:B type:tv title:"Breaking Bad"
/bracket-setup manage-titles action:"Add Title" group:A type:movie title:"Evil Dead" image:[uploaded-file.jpg]
```

**Removing:**
```
/bracket-setup manage-titles action:"Remove Title" group:A position:2
/bracket-setup manage-titles action:"Remove Title" position:7
```

The last example is a straight bracket, which has no groups.

**Notes:**
- One search match is added right away. Several show a menu so you can pick the right one.
- The first title sets the tournament's type. It can't change after that.
- Every group needs exactly 4 titles before voting can open.
- Removing moves the titles after it up a number. Check `/bracket list-groups` again before removing another.
- Titles can only be added or removed during setup.

---

### `/bracket-setup resize`

Change the number of groups in a groups tournament.

**Who can use:** Admin/Mod only

**Parameters:**
- `groups` (required): the new number of groups, 4–12

```
/bracket-setup resize groups:10
/bracket-setup resize groups:4
```

**Notes:**
- Setup only, before any group opens.
- Adding groups adds empty ones.
- Removing groups only works if the groups being removed are empty. Move or remove their titles first.

---

### `/bracket-setup announce`

Post a public announcement of the tournament.

**Parameters:**
- `message` (optional): your own text, up to 1,000 characters
- `image` (optional): a banner image

```
/bracket-setup announce
/bracket-setup announce message:"Let the games begin! Vote for your favorites!"
/bracket-setup announce message:"Welcome to the tournament!" image:[banner.jpg]
```

**Notes:**
- Without `message`, it says a new tournament is coming. It always shows the type, the format (or the groups) and how many titles are in.
- It shows where the tournament is: setup progress, the group stage or the knockout round, so you can use it again later.
- If the [setup form](./import) saved a message or banner, they're used when you leave `message` or `image` out.

---

## Smart Phase Commands

`/bracket open` and `/bracket close` work out where the tournament is and do the right thing. Most tournaments need nothing else.

### `/bracket open`

Open whatever comes next.

**Who can use:** Admin/Mod only

**Parameters:**
- `duration` (optional): how long voting stays open, from `5m` to `30d`, such as `45m`, `24h` or `3d`. Default: the tournament's voting duration from the [setup form](./import), else 24h.
- `matchups` (optional, 1–5): in the knockout, open only the next N matchups in bracket order. `matchups:1` runs the tournament one matchup at a time; run it again to open the next. When a round has nothing left to open, its last matchups close and the next round's first ones open. From setup, it builds the bracket first. See [One matchup at a time](/guides/tournaments/one-at-a-time).

**What it does:**
- **Setup, straight bracket:** builds the bracket and opens round one. If round one has more than 5 matchups, it builds the bracket and tells you to open it in parts: `/bracket open matchups:1`, `/bracket open matchups:4` or `/bracket open-matchup region:1`.
- **Setup, groups tournament:** opens the groups, once each has 4 titles: at most 5, in letter order. If any are short, it lists them.
- **Group stage:** opens the groups that haven't voted yet, the next ones in letter order, with at most 5 voting at once, and names any still to come. While 5 are voting it opens nothing and says so. Once every group is closed and every tiebreaker settled, it builds the knockout and opens its first round. It never reopens a finished group.
- **Knockout:** opens every matchup in the current round, up to 5. Matchups still voting from earlier in the round close first. A bigger round gets the same "open it in parts" reply as above.

**Examples:**
```
/bracket open
/bracket open duration:48h
/bracket open matchups:4 duration:1d
```

::: warning More than 5 groups
A member's group ballot shows one row of buttons per open group, and Discord allows 5 rows, so at most 5 groups vote at once. `/bracket open` opens the next 5 by itself: run it again once they close. To pick a batch yourself, use [`/bracket open-groups`](#bracket-open-groups), which won't go past 5.
:::

Nothing opens the next round on its own. Run `/bracket open` after each close.

---

### `/bracket close`

Close everything voting now.

**Who can use:** Admin/Mod only

**Parameters:**
- `tiebreaker-duration` (optional): how long a tiebreaker vote runs, from `5m` to `7d`. Default: the tournament's tiebreaker duration from the [setup form](./import), else 1h.

**What it does:**
- **Group stage:** closes every open group and works out its places. The reply is the one [`/bracket close-groups`](#bracket-close-groups) gives: each decided group's top three with their votes, and a **🔀 Tiebreakers** field for any ties.
- **Knockout:** closes every open matchup in the round, exactly as their deadline would. Each one gets its results card with a drawn picture of the matchup ([details](./knockout#closing-a-round)), and the bot posts the bracket as it now stands. The reply lists the winners: `1A: **The Thing** wins 15–8`.
- Ties start a tiebreaker vote, posted in the channel.

```
/bracket close
/bracket close tiebreaker-duration:30m
```

---

## Group Stage Commands

These give you finer control over the group stage, where members pick their top 2 in each group.

### `/bracket open-groups`

Open chosen groups.

**Who can use:** Admin/Mod only

**Parameters:**
- `groups` (required): comma-separated letters, such as `A,B,C,D`
- `duration` (optional): `5m` to `30d`. Same default as `/bracket open`.

```
/bracket open-groups groups:"A,B,C,D"
/bracket open-groups groups:"A,B,C,D,E" duration:48h
/bracket open-groups groups:"F,G,H" duration:3d
```

**Notes:**
- Each group needs exactly 4 titles.
- It posts a voting message with a **Start Voting** button and each group's current standings. The standings update as people vote.
- At most 5 groups vote at once: a ballot holds 5. If the groups you list, with those already voting, would make more than 5, it refuses and opens none of them. A letter listed twice counts once.
- Use `/bracket extend-voting` to give a group more time.

**How members vote:**
1. Press **Start Voting** to get your own ballot. Only you see it.
2. Pick 2 titles in each group. Your picks turn purple.
3. Press a pick again to undo it. A third pick is refused until you undo one.
4. Change your picks any time before the group closes.

A member who picks only 1 title in a group has that vote thrown out when the group closes.

---

### `/bracket voting-post`

Post the voting card again, with its **Start Voting** button, for whatever is open now.

**Who can use:** Everyone

**Parameters:** none

In a long tournament the card from `/bracket open` scrolls far up the channel. This posts a fresh one at the bottom: the open matchups (up to 16 listed) or groups, when voting closes, and a working **Start Voting** button. Earlier cards stay, and their buttons keep working.

In the knockout, the **live standings** come down with it: a fresh standings card is posted under the voting card, and votes update that one from then on. The old standings card stays, marked "No longer updating", so nobody reads its counts as current.

It can be posted once every 10 minutes in each channel. Until then, it tells you when it was last posted so you can scroll up to it. Admins and moderators can post it any time.

```
/bracket voting-post
```

---

### `/bracket my-votes`

Your votes in what's open right now, privately.

**Who can use:** Everyone

**Parameters:** none

```
/bracket my-votes
```

**Example:**
```
📊 Your Voting Status
Summer Movie Madness
Phase: Quarterfinals

✅ Knockout Votes Cast (1)
Quarterfinals #1 - Voted for The Thing vs Alien
⏰ 18h 32m remaining

🗳️ Knockout Matchups Available (1)
Quarterfinals #2 - Jaws vs The Shining
⏰ 18h 32m remaining
```

**Notes:**
- In the group stage it shows each open group you've voted in, with your two picks, and the open groups you haven't. With only one pick in a group, it says so: pick one more, or that vote isn't counted.
- Matchups are numbered in bracket order (#1, #2…), not by label.
- It only covers what's open. Your ballot (**Start Voting**) lists every knockout vote you've cast, by round.

---

### `/bracket close-groups`

Close chosen groups and post their results.

**Who can use:** Admin/Mod only

**Parameters:**
- `groups` (required): comma-separated letters, such as `A,B,C,D`
- `tiebreaker-duration` (optional): `5m` to `7d`. Same default as `/bracket close`.

```
/bracket close-groups groups:"A,B,C,D"
/bracket close-groups groups:"A,B,C,D" tiebreaker-duration:30m
```

**Notes:**
- Each pick counts as one vote. A voter who picked only 1 title in a group has it thrown out, and the reply names them.
- The reply lists each decided group's 1st, 2nd and 3rd with their votes, even when other groups tied. Ties are in a **🔀 Tiebreakers** field, with when their vote closes. The footer says how many third-place titles will become wildcards.
- It closes only groups still voting. A group that's closed or waiting on a tiebreaker is skipped, and if none you list is voting, it says so.
- A tie for 1st or 2nd starts a tiebreaker vote. A tie for 3rd is settled at random.
- A closed group can't be reopened.
- When every group is closed and every tiebreaker settled, run `/bracket open` to start the knockout.

---

### `/bracket regenerate`

Rebuild the knockout from the group results.

**Who can use:** Admin/Mod only

**Parameters:** none

```
/bracket regenerate
```

**Notes:**
- Groups tournaments only, with every group still closed.
- Wildcards, seeding and matchups are all worked out again. Any knockout voting under way is thrown away.
- The reply is private and lists the wildcards.

---

## Knockout Commands

These give you finer control over the knockout: single matchups, or one region.

### Regional Label System

Each knockout round is split into **4 regions**, March Madness style. A matchup's label is its region (1–4) plus a letter for its place in the region:

| Round | Matchups | Labels |
|-------|----------|--------|
| Round of 32 | 16 | 1A–1D, 2A–2D, 3A–3D, 4A–4D |
| Round of 16 | 8 | 1A, 1B, 2A, 2B, 3A, 3B, 4A, 4B |
| Quarterfinals | 4 | 1A, 2A, 3A, 4A |
| Semifinals | 2 | 1A, 3A |
| Finals | 1 | Finals |

`/bracket status`, the ballot and the button pickers show each matchup's label.

### `/bracket open-matchup`

Open one region or chosen matchups.

**Who can use:** Admin/Mod only

**Parameters:**
- `region` (optional, 1–4): open every matchup in that region of the current round
- `matchup` (optional): the matchups to open. Start typing and pick from the list: it shows the current round's matchups nobody has voted on yet, with both titles (`2A · Halloween vs Scream`). Type a label or part of a title to narrow it. For several, separate them with commas (`1A,1B`); after a comma, the list suggests the next.
- `duration` (optional): `5m` to `30d`. Same default as `/bracket open`.

**With only `duration`**, you get buttons. Only admins and moderators can press them; anyone else is refused.
- more than 5 matchups in the round: one button per region
- 5 or fewer: one button per matchup that hasn't opened

Buttons expire after 15 minutes.

**Examples:**
```
/bracket open-matchup region:1
/bracket open-matchup region:2 duration:48h
/bracket open-matchup matchup:"1A"
/bracket open-matchup matchup:"1A,1B" duration:24h
/bracket open-matchup matchup:"Finals" duration:48h
/bracket open-matchup duration:24h
```

**Opening the next matchup closes earlier ones.** Any matchup in the round that's still voting, and isn't one you're opening now, closes first, exactly as its deadline would: the winner is announced, and a tie gets a tiebreaker vote. The reply lists what closed. To have several matchups voting together, open them together (`matchup:"1A,1B"` or `region:1`).

**Notes:**
- Only matchups nobody has voted on are opened. Ones already voting keep their votes, decided ones keep their results, and the reply lists both.
- A ballot holds 5 matchups, so a region of the Round of 32 (4 matchups) fits on one.

---

### `/bracket close-matchup`

Close chosen matchups and move their winners on.

**Who can use:** Admin/Mod only

**Parameters:**
- `matchup` (optional): the matchups to close. Pick from the list, which shows the matchups voting now, or type several, comma-separated. Leave it out to pick from buttons.
- `tiebreaker-duration` (optional): `5m` to `7d`. Same default as `/bracket close`.

**Examples:**
```
/bracket close-matchup matchup:"1A"
/bracket close-matchup matchup:"2A,2B" tiebreaker-duration:30m
/bracket close-matchup
```

**With no `matchup`**, you get a red button for each open matchup with its votes, such as `1A: Jaws(5) vs Night of the(3)`. Pressing one closes it exactly as its deadline would: its results card and picture are posted. Buttons expire after 15 minutes.

**With `matchup`**, the reply names each winner and the votes, with the winner's poster as a thumbnail when one matchup closes. It doesn't post the drawn results card.

**Notes:**
- Most votes wins. A tie starts a tiebreaker vote, unless the tournament sends ties to the higher seed.
- A closed matchup can't be reopened.
- When the last matchup of a round closes, the tournament moves to the next round. Run `/bracket open` to start it.
- The bot posts the bracket as it now stands after each close.

---

### `/bracket resolve-tiebreaker`

Settle a tiebreaker now, by the votes so far or by your own pick.

**Who can use:** Admin/Mod only

**Parameters:**
- `tiebreaker-id` (required): the ID in the tiebreaker vote's footer
- `winner` (optional, 1–4): pick the winner yourself (1 = the first option). Leave it out to go by the votes so far.

**Examples:**
```
# Close it now and go by the votes
/bracket resolve-tiebreaker tiebreaker-id:"abc123"

# Make option 2 the winner
/bracket resolve-tiebreaker tiebreaker-id:"abc123" winner:2
```

**Notes:**
- By the votes: if it's still tied, including when nobody voted, one is picked at random. The reply shows the vote breakdown.
- The tiebreaker message greys out its buttons and shows the winner.
- Tiebreakers also settle themselves at their deadline.
- A knockout tiebreaker moves the winner on and posts the bracket.

---

### `/bracket extend-voting`

Set a new deadline for a group, or for the round's open matchups.

**Who can use:** Admin/Mod only

**Parameters:**
- `type` (required): **Group Voting** (`group`) or **Knockout Round** (`knockout`)
- `duration` (required): the new time left, from now, `5m` to `30d`
- `group` (required for `type:group`): the group letter

```
/bracket extend-voting type:group duration:12h group:A
/bracket extend-voting type:knockout duration:24h
```

**Notes:**
- The new deadline is now plus `duration`. It replaces the old one rather than adding to it, so `duration:12h` on a group with 20h left shortens it to 12h.
- `knockout` moves the deadline of every open matchup in the current round.
- It only works on voting that's still open.
- The voting messages aren't edited. The reply shows the new deadline, and so do `/bracket status` and any ballot opened after it.

---

## Utility Commands

### `/bracket status`

Where the tournament is, with live vote bars.

**Who can use:** Everyone

**Parameters:** none

```
/bracket status
```

**What it shows:**
- **Setup:** how many titles are in, and for a straight bracket the seeding and tie rule. With **By rating**, titles that have no rating are named, since they'll be seeded last.
- **Group stage:** how many groups are done, and for each open group its voter count, time left (⚠️ in the last hour) and its top two.
- **Knockout:** each open matchup exactly as the live standings card shows it: its label, when it closes, both titles with their bars and votes, 🔥 on the leader and 🤝 on a tie. Up to 16 matchups, a whole Round of 32. Then how many matchups are done.
- **Finished:** the champion.

**Example (knockout, plain-emoji look):**
```
🏆 Summer Movie Madness

Semifinals
Single elimination bracket

📊 Live Vote Counts

1A · closes in 18 hours
The Thing (1982) 🔥
🟩🟩🟩🟩🟩🟩⬜⬜⬜⬜ 9 votes (60%)
vs
Evil Dead (1981)
🟧🟧🟧🟧⬜⬜⬜⬜⬜⬜ 6 votes (40%)

3A 🤝 · closes in 55 minutes
Alien (1979)
🟨🟨🟨🟨🟨⬜⬜⬜⬜⬜ 6 votes (50%)
vs
Hereditary (2018)
🟨🟨🟨🟨🟨⬜⬜⬜⬜⬜ 6 votes (50%)

Completed: 6 matchups
```

**Notes:**
- It's a snapshot, posted when you run it. The live standings card is the one that keeps updating. If it has scrolled far up, `/bracket voting-post` brings it back down.
- Times show in each reader's own time zone.
- The layout is chosen to fit: with many matchups or long titles it switches to plainer bars, and for 16 of the longest titles it shortens them.

---

### `/bracket list-groups`

A numbered list of the tournament's titles.

**Who can use:** Everyone

**Parameters:** none

```
/bracket list-groups
```

**Notes:**
- **Straight bracket:** every title as one numbered list, with its year.
- **Groups tournament:** each group with its titles numbered 1–4, marked 🗳️ voting open or ✅ closed.
- The numbers are the `position` that `manage-titles action:"Remove Title"` takes.

---

### `/bracket view`

The tournament as an image.

**Who can use:** Everyone

**Parameters:** none

```
/bracket view
```

**Notes:**
- **In the knockout, and after it:** the bracket tree, every round, each title on its poster. A winner is drawn slightly larger with a gold 🏆, and moves into its next matchup as soon as it's decided. The champion gets a card with a trophy either side of CHAMPION.
- **Before the knockout:** an overview of the groups and their titles.
- It's drawn fresh each time. The bot also posts it on its own whenever knockout matchups are decided: one image per batch, titled **Bracket So Far**, or **Final Bracket** with the champion.

---

### `/bracket export`

Save the tournament as a file.

**Who can use:** Everyone

**Parameters:**
- `format` (required): **JSON** (`json`) or **Markdown** (`markdown`)

```
/bracket export format:json
/bracket export format:markdown
```

**JSON:** the lineup (with every id filled in) and settings, in the [setup form](./import)'s import format. No votes and no voter ids. Upload it through `/bracket-setup setup-link` to run the same tournament again.

**Markdown:** the results, ready to paste:

```markdown
# Summer Movie Madness

**Status:** completed
**Phase:** finals
**Created:** 6/1/2026

## Group Stage Results

### Group A

1. 🥇 **The Thing** (47 votes)
2. 🥈 **Evil Dead** (31 votes)
3. 🥉 **Hereditary** (18 votes)

## Knockout Stage

### Finals

**Match 1:** The Thing (31) vs Evil Dead (28)
  Winner: **The Thing**

## 🏆 Champion

**The Thing**

## Statistics

- **Total Groups:** 8
- **Total Matchups:** 15
- **Total Voters:** 58
```

---

### `/bracket-setup edit-name`

Rename the tournament.

**Who can use:** Admin/Mod only

**Parameters:**
- `name` (required): the new name, up to 100 characters

```
/bracket-setup edit-name name:"Epic Summer Movie Championship 2026"
```

**Notes:**
- Works at any point, votes and all untouched.
- The reply is public and shows the old and new names.

---

### `/bracket cancel`

End the tournament.

**Who can use:** Admin/Mod only

**Parameters:** none

```
/bracket cancel
```

**Notes:**
- It ends right away, with no confirmation, and posts "Tournament … has been cancelled." in the channel.
- It clears the votes and voting stats, and can't be undone.
- You can then create a new tournament. To reuse the lineup, run `/bracket export format:json` first.

---

## Tournament Size Examples

### Example 1: Straight Bracket (8–32 titles)

```
/bracket-setup create name:"Quick Horror Showdown" max-titles:8
/bracket-setup create name:"Summer Movie Madness" max-titles:32
```
*(or set it up in one go with `/bracket-setup setup-link` and the [setup form](./import))*

- **Titles:** up to `max-titles`. Empty slots become byes: 12 titles in a 16-slot bracket give 4 byes.
- **Rounds:** 8 titles start at the Quarterfinals, 16 at the Round of 16, 32 at the Round of 32.
- **Seeding:** Random, The order I add them, or By rating.
- **Start:** `/bracket open` builds the bracket and opens round one. The Round of 32 and Round of 16 open in parts (`matchups:4` or `region:`), since a ballot holds 5 matchups.

### Example 2: Small Groups Tournament (16 titles, 4 groups)

```
/bracket-setup create name:"Quick Horror Tournament" max-titles:36
/bracket-setup resize groups:4
```

- **Groups:** A–D, all on one ballot
- **Through:** the top 2 of each group, 8 titles. No wildcards.
- **Knockout:** Quarterfinals, Semifinals, Finals

### Example 3: Medium Groups Tournament (32 titles, 8 groups)

```
/bracket-setup create name:"Community Choice Awards" max-titles:36
/bracket-setup resize groups:8
```

- **Groups:** A–H, opened in two batches (a ballot holds 5 groups)
- **Through:** the top 2 of each group, 16 titles. No wildcards.
- **Knockout:** Round of 16, Quarterfinals, Semifinals, Finals

### Example 4: Large Groups Tournament (40 titles, 10 groups)

```
/bracket-setup create name:"Ultimate Showdown" max-titles:40
```

- **Groups:** A–J, opened in two batches of 5
- **Through:** the top 2 of each group (20) and the 10 third-place titles as wildcards, 30 in all
- **Knockout:** a Round of 32 with 2 byes, which go to group winners

### Example 5: Maximum Groups Tournament (48 titles, 12 groups)

```
/bracket-setup create name:"Epic Community Championship" max-titles:48
```

- **Groups:** A–L, opened in batches of up to 5
- **Through:** the top 2 of each group (24) and the best 8 third-place titles, 32 in all
- **Knockout:** a full Round of 32, the 2026 World Cup's layout

---

## Limitations & Not Possible

**Setup**
- ❌ **The type can't change** once the first title is added.
- ❌ **Titles can't change** once voting begins. The name can.
- ❌ **Groups need exactly 4 titles**, and a group with titles in it can't be removed.
- ❌ **Size limits:** 32 titles in a straight bracket, 12 groups (48 titles) in a groups tournament.
- ❌ **A groups tournament's knockout can't be hand-seeded.** It's seeded from the group results.

**Voting**
- ❌ **More than 5 matchups, or 5 groups, can't vote at once.** That's what a ballot holds.
- ❌ **No votes after the deadline,** and a closed group or matchup can't be reopened.
- ❌ **Voting can't be limited to a role.** Everyone in the server can vote.
- ❌ **No best-of series and no reseeding.** Each matchup is one vote, and the bracket's path is fixed once built.

**Running it**
- ❌ **One tournament per server** at a time.
- ❌ **A cancelled tournament can't be restored.**
- ❌ **Votes and results can't be imported.** The setup form loads a lineup and settings only.
- ❌ **Management can't be handed to a role.** It takes Administrator or Timeout Members. Admins can turn `/bracket` off for regular members with `/eggshen-config commands toggle setting:bracket enabled:false`.

For pacing ideas and engagement tips, see [Tips & Strategies](./tips).

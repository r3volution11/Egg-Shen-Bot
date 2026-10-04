---
title: Setup & Group Stage - Tournament Brackets
description: Create a tournament, add titles, and run the group stage through to the knockout bracket.
---

# Setup & Group Stage

This page covers creating a tournament, adding titles, and running the group stage up to the start of the knockout.

You can set up a tournament with the commands below, one title at a time, or all at once with the [setup form](./import). Run `/bracket setup-link` (Admins/Mods) to get a private link to the form, then upload a CSV or JSON file or fill it in.

## Two Tournament Shapes

| Shape | Titles | How it runs |
|-------|--------|-------------|
| **Straight bracket** | 2–32, no groups | Head-to-head matchups from round one |
| **Groups tournament** | 4–12 groups of exactly 4 titles | Group voting, then a knockout |

`/bracket create` picks the shape from `max-titles`: 2–32 makes a straight bracket, 36–48 makes a groups tournament.

---

## Creating Your Tournament

### `/bracket create`

```
/bracket create name:<text> max-titles:<2|4|8|16|32|36|40|44|48>
```

**Parameters:**
- `name` (required) - Tournament name, up to 100 characters
- `max-titles` (optional) - Default 32
  - **2, 4, 8, 16, 32** - Straight bracket. This is the most titles it can hold; you can start with fewer.
  - **36, 40, 44, 48** - Groups tournament with 9, 10, 11, or 12 groups

**Who can use:** Administrators and Moderators only

**Notes:**
- The reply is private (only you see it). Use `/bracket announce` when you're ready to tell the server.
- Only one tournament per server at a time.
- The tournament type (movie, TV, game, board game, book) is set by the first title you add.

**Examples:**
```
/bracket create name:"Quick Horror Showdown" max-titles:8
/bracket create name:"Monthly Movie Madness" max-titles:32
/bracket create name:"The Ultimate Horror Cup" max-titles:48
```

---

## Adding and Removing Titles

### `/bracket manage-titles`

```
/bracket manage-titles action:add type:<movie|tv|game|boardgame|book> title:<text> group:<A-L> image:<attachment>
/bracket manage-titles action:remove position:<number> group:<A-L>
```

**Parameters:**
- `action` (required) - `add` or `remove`
- `group` (optional) - Group letter, A–L. Groups tournaments only; leave it out in a straight bracket. When adding to a groups tournament without one, the title goes into the first group with room.
- `type` (optional) - Needed for the first title. After that, the tournament's type is used if you leave it out.
- `title` (required when adding) - Title to search for
- `position` (required when removing) - The title's number from `/bracket list-groups`
- `image` (optional, adding only) - Custom image that replaces the poster or cover art

**Who can use:** Administrators and Moderators only

**Adding:**
- Searches TMDB (movies/TV), RAWG (games), BoardGameGeek (board games), or Google Books.
- One match is added right away. Several matches show a menu so you can pick the right one.
- Every group in a groups tournament needs exactly 4 titles before voting can start.

**Removing:**
- In a straight bracket, `/bracket list-groups` shows every title as one numbered list. Use that number as `position`, with no group.
- In a groups tournament, `position` is 1–4 within the group, and `group` is required.
- The titles after the removed one move up a number. Check `/bracket list-groups` again before removing another.

**Examples:**
```
# Straight bracket
/bracket manage-titles action:add type:movie title:"The Thing"
/bracket manage-titles action:add title:"Halloween"
/bracket manage-titles action:remove position:7

# Groups tournament
/bracket manage-titles action:add group:A type:movie title:"The Exorcist"
/bracket manage-titles action:add group:D title:"Akira" image:[upload file]
/bracket manage-titles action:remove group:A position:3
```

Titles can only be added or removed during setup.

---

## Managing Setup

### `/bracket resize`

```
/bracket resize groups:<4-12>
```

Change the number of groups in a groups tournament. Setup only.

- **Expanding** (e.g., 9 → 12) adds empty groups.
- **Contracting** (e.g., 12 → 8) only works if the groups being removed are empty. Move or remove their titles first.

**Examples:**
```
/bracket resize groups:12
/bracket resize groups:4
```

---

### `/bracket announce`

```
/bracket announce message:<text> image:<attachment>
```

Post a public announcement of the tournament.

**Parameters:**
- `message` (optional) - Your own announcement text
- `image` (optional) - A banner image

**Who can use:** Administrators and Moderators only

**Examples:**
```
/bracket announce
/bracket announce message:"🎬 The Ultimate Horror Cup starts NOW! Vote for your favorites!"
/bracket announce message:"🔥 Monthly Movie Madness starts NOW!" image:[upload banner]
```

---

### `/bracket list-groups`

```
/bracket list-groups
```

A text list of the tournament's titles.

- **Straight bracket:** one numbered list of every title.
- **Groups tournament:** each group with its titles numbered 1–4, marked as voting open or closed.

The numbers are the `position` that `manage-titles action:remove` takes.

---

## Starting Voting

### `/bracket open`

```
/bracket open duration:<time>
```

`/bracket open` works out what comes next and opens it. From setup:

- **Straight bracket:** builds the bracket and opens round one. This is how a straight bracket starts. If round one has more than 5 matchups, the bot builds the bracket and asks you to open it by region with [`/bracket open-matchup`](./knockout#open-by-region).
- **Groups tournament:** opens every group, as long as each one has 4 titles. If any are short, it lists them instead.

**Parameters:**
- `duration` (optional) - How long voting stays open, from 5m to 30d. Examples: `45m`, `24h`, `3d`.

If `duration` is left out, the bot uses the default voting duration set in the [setup form](./import). If the form didn't set one, the default is 24h.

### How a straight bracket is built

The bracket is sized to the next power of 2 at or above the number of titles. Any empty slots become byes: those titles go through round one without a vote.

Seeding decides who meets whom:

- **Random** (the default): titles are shuffled.
- **Ordered** (set in the [setup form](./import)): the order of your list is the seed order. Seed 1 meets the lowest seed, 2 meets the second-lowest, and so on, and byes go to the top seeds.

After round one opens, continue with [Knockout Rounds](./knockout).

---

## Group Stage

### Opening groups

`/bracket open` opens every group that hasn't voted yet. To open only some groups, use `/bracket open-groups`:

```
/bracket open-groups groups:<letters> duration:<time>
```

**Parameters:**
- `groups` (required) - Comma-separated letters, e.g., `A,B,C,D`
- `duration` (optional) - 5m to 30d. Same default as `/bracket open`.

**Who can use:** Administrators and Moderators only

**Examples:**
```
# Open everything that's ready
/bracket open

# Open groups in waves
/bracket open-groups groups:A,B,C,D duration:48h
/bracket open-groups groups:E,F,G,H duration:48h
```

### How members vote

The voting message has a **Start Voting** button.

1. Click **Start Voting**.
2. Pick your top 2 titles in each open group. Selected buttons turn purple.
3. Click a selected title again to deselect it.
4. You can change your picks any time before the group closes.

<DiscordCard name="group-dashboard" />

*A member's own group-stage ballot, their picks in purple*

Members can check their progress with `/bracket my-votes` (only they see the reply).

### Deadlines

- The bot posts a reminder before a group's deadline.
- Voting closes automatically at the deadline, and results are posted.
- Closing does not open the next step. Run `/bracket open` when you're ready.
- Use `/bracket extend-voting type:group group:A duration:12h` to set a new deadline. See [Tips & Strategies](./tips#extend-voting-deadline).

---

### Closing groups

```
/bracket close tiebreaker-duration:<time>
/bracket close-groups groups:<letters> tiebreaker-duration:<time>
```

`/bracket close` closes every group that is voting. `/bracket close-groups` closes only the ones you list.

**Parameters:**
- `groups` (`close-groups` only, required) - Comma-separated letters
- `tiebreaker-duration` (optional) - How long a tiebreaker vote runs, from 5m to 7d

If `tiebreaker-duration` is left out, the bot uses the default set in the [setup form](./import), or 1h if the form didn't set one.

**What happens:**
- Each group's 1st, 2nd, and 3rd place are worked out and posted.
- If places are tied, the bot starts a short tiebreaker vote with a button for each tied title. It resolves itself at the deadline, or an admin can settle it early with `/bracket resolve-tiebreaker`.
- A closed group can't be reopened.

**Examples:**
```
/bracket close
/bracket close tiebreaker-duration:30m
/bracket close-groups groups:A,B,C,D
```

**Results display:**
```
🏁 Group A Results
🥇 The Exorcist
🥈 Halloween
🥉 Night of the Living Dead
```

---

## Starting the Knockout

When every group is closed and every tiebreaker is settled, run `/bracket open` again:

```
/bracket open
/bracket open duration:48h
```

It builds the knockout bracket and opens its first round. If some groups are still voting or in a tiebreaker, it lists them instead.

**How the knockout is filled:**
- The top 2 from each group go through.
- The best third-place finishers fill the remaining spots, up to the next power of 2 (at most one per group). These are the wildcards.
- Group winners are placed first, so any byes go to them. Runners-up and wildcards are shuffled in.
- Titles from the same group are kept apart in the first round where possible.

| Groups | Top 2 | Wildcards | Knockout starts at |
|--------|-------|-----------|--------------------|
| 4 | 8 | 0 | Quarterfinals |
| 8 | 16 | 0 | Round of 16 |
| 9 | 18 | 9 | Round of 32 (5 byes) |
| 12 | 24 | 8 | Round of 32 |

**Output:**
```
🏆 Round Of 32 - Knockout Stage Begins!

🗳️ Voting is now open!
Vote for ONE title in each matchup below.

⏰ Voting closes in: 24 hours

🎟️ Wildcards (Best 8 Third-Place)
1. The Thing (12 votes, Group E)
2. Alien (11 votes, Group C)
...
```

If the bracket looks wrong, `/bracket regenerate` rebuilds it from the group results. Any knockout voting already under way is discarded.

**→ [Continue to Knockout Rounds](./knockout)**

---

## Quick Reference

| Command | Purpose |
|---------|---------|
| `/bracket setup-link` | Private link to the [setup form](./import) |
| `/bracket create` | Start a new tournament |
| `/bracket manage-titles` | Add or remove a title |
| `/bracket resize` | Change the number of groups |
| `/bracket announce` | Share the tournament publicly |
| `/bracket list-groups` | Numbered list of titles |
| `/bracket open` | Start voting, open the next groups, or start the knockout |
| `/bracket open-groups` | Open specific groups |
| `/bracket close` | Close every open group |
| `/bracket close-groups` | Close specific groups |
| `/bracket my-votes` | Check your own votes |

---

**→ [Back to Overview](./) | [Knockout Rounds](./knockout) | [Command Reference](./commands) | [Tips & Strategies](./tips)**

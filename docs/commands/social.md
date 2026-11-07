---
title: Surveys & Status Quotes - Egg Shen Bot
description: Surveys with live vote bars, runoffs and a drawn results chart, and the quotes the bot shows as its status.
kitHeadings:
  survey-commands: chart
---

# Surveys & Status Quotes

Surveys, and the quotes the bot shows as its status.

<div id="potion-command" />
<div id="give-a-potion" />
<div id="custom-responses-and-themes-admin-mod" />
<div id="food-fight" />
<div id="throw-food" />
<div id="feed-someone" />
<div id="your-own-lines-admin-mod" />
<div id="doom" />
<div id="deal-a-fate" />
<div id="your-own-lines-admin-mod-1" />
<div id="rescue" />
<div id="attempt-a-rescue" />
<div id="your-own-lines-admin-mod-2" />
<div id="potion-issues" />

::: tip Looking for the games?
How `/foodfight`, `/doom`, `/rescue` and `/potion` play, with their options and lines, is on **[Playing & Points](./games-playing#food-fight)**, and adding your server's own lines is on **[Settings for Admins](./games-settings#your-own-lines)**. Everything else about the games is under [Games & Scores](./games).
:::

## Quick FAQ

**Q: Can I disable the survey command if we already have a polling bot?**  
A: Yes! Use `/eggshen-config commands toggle setting:Survey Command enabled:false`

**Q: Who can manage surveys?**  
A: The person who created the survey, and anyone with the Administrator or Manage Server permission, can close or delete it.

**Q: How do users vote in surveys?**  
A: By clicking the button under their choice.

**Q: Can users change their vote?**  
A: Yes! Click a different button to switch your vote. In multiple-vote mode, clicking a button toggles that option on or off without affecting your other selections.

**Q: Are survey results stored permanently?**  
A: Yes, all surveys are stored in JSON files per-server and persist even if the bot restarts.

**Q: The survey scrolled away. How do people find it?**  
A: `/survey voting-post` posts it again at the bottom of the channel, with its buttons and the votes so far. The old card greys out and links to the new one.

**Q: Can a survey close itself automatically?**  
A: Yes! Set `duration:[minutes]` when creating it (`/survey create ... duration:120` for 2 hours). Without it, a survey stays open until someone runs `/survey close`.

**Q: What happens if two options tie?**  
A: A runoff vote between just the tied options starts automatically. If the runoff ties too, the bot picks one at random. Set `tie-break:None` when creating a survey where a tie is a fine answer. See [Ties](#ties).

---

## Survey Commands

Ask the server a question with up to 10 answers. Members vote with buttons, the card shows the votes as bars as they come in, and a closed survey gets a drawn chart of the results.

### Create a Survey

```
/survey create question:[question] option1:[text] option2:[text] ... option10:[optional] multiple:[optional] duration:[optional] tie-break:[optional]
```

**Parameters:**
- `question` (required) - The survey question (max 256 characters)
- `option1` (required) - First option (max 100 characters)
- `option2` (required) - Second option (max 100 characters)
- `option3`-`option10` (optional) - Additional options (max 100 characters each)
- `multiple` (optional) - Allow users to vote for multiple options (default: false)
- `duration` (optional) - Auto-close voting after this many minutes, from 1 minute up to 14 days (20160 minutes). Omit for a survey that stays open until manually closed with `/survey close`
- `tie-break` (optional) - What a tie for first does: **Runoff vote** (default) or **None** (the tie stands). See [Ties](#ties)

**Features:**
- Up to 10 options per survey
- Vote by clicking a button under the option — no reactions to add or copy
- Single-vote mode (default): Clicking a different button switches your vote
- Multiple-vote mode: Clicking a button toggles that option on/off, other selections stay as-is
- The survey message updates live as votes come in — no need to run `/survey results` to see current standings
- Optional auto-close after a set duration, closing and posting results automatically without anyone needing to run `/survey close`

**Examples:**
```
/survey create question:What should we watch tonight? option1:Horror option2:Comedy option3:Action

/survey create question:Which genres do you like? option1:Sci-Fi option2:Fantasy option3:Drama option4:Thriller multiple:true

/survey create question:Best 80s movie? option1:The Breakfast Club option2:Back to the Future option3:Blade Runner option4:Die Hard option5:E.T.

/survey create question:Movie night pick? option1:The Thing option2:Alien duration:120
```

**How It Works:**
1. The bot posts your question with a button for each option, and tells you privately the survey's ID
2. Members vote by clicking a button, and each gets a private confirmation of their vote
3. From the first vote, the card shows each option's bar, share and votes, the leader's bar in gold (see [View Survey Results](#view-survey-results))
4. If a `duration` was set, the card shows when voting ends, and the bot closes the survey and posts the results then. Otherwise, use `/survey close` when you're ready to end it
5. Anyone can check the results privately any time with `/survey results`

---

### Ties

When a survey closes with two or more options tied for first:

1. **A runoff starts.** The results card says who tied, and a new runoff survey is posted below it with only the tied options. It's one vote each, even if the original allowed several, and it runs as long as the original did, or 24 hours if the original had no timer. Everyone can vote, including people who didn't vote the first time.
2. **If the runoff ties too,** the bot picks one of the tied options at random. The results show the pick with a 🎲 and say it was random.

A survey nobody voted in has no winner and no runoff, and a tie for second place doesn't count. Create a survey with `tie-break:None` to let a tie stand, which suits opinion polls like "How scary was it?". `/survey results` on a tied survey links to its runoff.

### List All Surveys

```
/survey list filter:[active|closed|all]
```

**Parameters:**
- `filter` (optional) - Filter surveys by status (default: active)
  - `active` - Only show active surveys
  - `closed` - Only show closed surveys
  - `all` - Show all surveys

**Features:**
- Shows the 25 most recent surveys
- Shows each one's ID, question, vote count, when it was created, its channel, and when an open one closes
- Status indicators: 🟢 Active, 🔴 Closed

**Examples:**
```
/survey list
/survey list filter:closed
/survey list filter:all
```

Only you see the list.

---

### View Survey Results

```
/survey results poll_id:[id]
```

**Parameters:**
- `poll_id` (required) - The survey to view — start typing the question and Discord will suggest matching surveys (active and closed) with their live vote counts

**Features:**
- Only you see the reply
- Each option with its bar, share and votes, most votes first
- The total votes, in the footer
- Your own votes, if any
- A link to the survey's message, and to its runoff if it had one
- Works for both active and closed surveys

**Example:**
```
/survey results poll_id:a1b2c3d4e5f6g7h8
```

**What the card shows** (the live survey and `/survey results` look the same; here in plain emoji):
```
📊 What should we watch tonight?

🏆 1️⃣ **Horror**
🟨🟨🟨🟨🟨🟨🟨🟨⬜⬜ `80%` · 8 votes

2️⃣ Comedy
🟦🟦⬜⬜⬜⬜⬜⬜⬜⬜ `20%` · 2 votes

3️⃣ Action
⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ `0%` · 0 votes

Your Vote(s): 1️⃣ Horror
```

- **The leader** gets a 🏆, its name in bold and a gold bar. Everyone else's bar is blue. If the top spots are tied, nobody gets the 🏆 and every bar is blue.
- **Each option** shows its share as `82%` and its votes, such as `82%` · 14 votes.
- **Once the bot's own emoji are uploaded** (it does this itself on its first start), the bars are drawn with them, and they turn grey when the survey closes. The 🏆 then marks the winner.
- **Long options** get shorter bars so the whole card still fits Discord's limits. The bars keep the same length from the first vote to the last.

---

### Post a Survey Again

```
/survey voting-post poll_id:[optional]
```

In a busy channel the survey scrolls up out of sight. This posts it again at the bottom, as a new message, with its vote buttons and the votes so far, so people can find it and see how it's going.

**Parameters:**
- `poll_id` (optional) - The survey to post. Leave it out when only one survey is open (in this channel, or on the server); with several open, start typing the question and pick one

**How It Works:**
- The new card is the survey from then on: votes on it update it, and it's the one that shows the final result when the survey closes
- The old card greys out its buttons and gets a link down to the new one, so there's never an out-of-date count with working buttons left behind
- Anyone who can use `/survey` can run it. Members can post the same survey once every 10 minutes per channel; the survey's creator, and anyone with the Administrator or Manage Server permission, any time
- Closed surveys can't be posted again; use `/survey results` to see how they ended. Very old surveys that were voted on with reactions can't move either, and you get a link to the original instead. New reactions on one no longer count; it keeps the votes it had, and `/survey close` ends it

**Example:**
```
/survey voting-post
```

---

### Close a Survey

```
/survey close poll_id:[id]
```

**Parameters:**
- `poll_id` (required) - The survey to close — autocomplete only suggests surveys you're actually allowed to close (your own, or any if you have the Administrator or Manage Server permission)

**Permissions:**
- Survey creator
- Anyone with the Administrator or Manage Server permission

**Features:**
- Ends voting immediately
- Disables the voting buttons on the survey message (they stay visible, just grayed out)
- Updates the original message to show final results
- Posts the final results as a new message, **🏁 Survey Closed:** and the question, with a drawn chart: each option's share and votes as a bar, most votes first, the winner's bar gold under a crown (or the 🎲 when a runoff was settled at random), and the total underneath, with a note when it tied or allowed several votes. Emoji in the question and options are left out of the chart. The message's text names the winner, such as 🏆 1️⃣ **Halloween (1978)** · `47%` · 14 votes
- If the chart can't be drawn within 5 seconds, or the bot can't attach files in that channel, the message posts without it and lists every option with its bar instead
- Closed surveys can still be viewed with `/survey results`

<img class="result-image" src="/images/survey-5.webp" alt="A drawn survey results chart for 'What should we watch for the Friday double feature?'. Halloween (1978) leads under a crown with 47%, 14 votes, on a gold bar; The Thing 30%, 9 votes; Alien 17%, 5 votes; Jaws 7%, 2 votes; Night of the Living Dead 0%. 30 votes in all." width="960" height="480" loading="lazy">

*The chart posted with a closed survey's results*

**Example:**
```
/survey close poll_id:a1b2c3d4e5f6g7h8
```

**Note:** If the survey was created with a `duration`, all of this happens automatically once voting ends — you don't need to run `/survey close` yourself unless you want to end it early.

---

### Delete a Survey

```
/survey delete poll_id:[id]
```

**Parameters:**
- `poll_id` (required) - The survey to delete — autocomplete only suggests surveys you're actually allowed to delete (your own, or any if you have the Administrator or Manage Server permission)

**Permissions:**
- Survey creator
- Anyone with the Administrator or Manage Server permission

**Features:**
- Permanently removes the survey from storage
- Attempts to delete the original survey message
- Cannot be undone
- Use `/survey close` instead if you want to keep the record

**Example:**
```
/survey delete poll_id:a1b2c3d4e5f6g7h8
```

**Warning:** This action cannot be undone. If you want to keep the survey in history, use `/survey close` instead.

---

## Survey Management

### Permission System

Two kinds of member can close or delete a survey:

1. **The survey's creator**
2. **Anyone with the Administrator or Manage Server permission**

Moderators with only Kick, Ban or Timeout Members can't close someone else's survey. Everyone else can vote, view results and post a survey again with `/survey voting-post`.

### Storage and Persistence

- Surveys are stored in JSON format per-server
- Files located in `guild_polls/[server-id].json`
- Data persists across bot restarts
- Includes full vote history and metadata

### Configuring Survey Access

Administrators can enable or disable the survey command per-server:

```
/eggshen-config commands toggle setting:Survey Command enabled:false
```

This is useful if your server already has a preferred polling bot (like top.gg or DarcyBot) and you want to avoid command conflicts.

---

## Status Quote Commands

The bot rotates its Discord status once an hour through a list of short quotes, each optionally tagged with a title (movie/show/game/etc.) and an author (character or real person). Admins manage that list with `/eggshen-config-quotes`, or on the quotes editor web page that `/eggshen-config-quotes admin-link` opens: see [Admin Configuration › Quotes](./configuration#quotes).

### Post a Random Quote

```
/quote title:[optional] author:[optional]
```

**Parameters:**
- `title` (optional) - Only pull quotes from this movie/show/game/etc. Has autocomplete against titles currently in the list.
- `author` (optional) - Only pull quotes by/from this character or person.

If both `title` and `author` are given, a quote matching *either* one is returned (not both at once). With no options, a random quote is picked from the entire list.

**Examples:**
```
/quote
/quote title:The Thing
/quote author:MacReady
/quote title:The Thing author:MacReady
```

### Suggest a Quote

```
/suggest-quote quote:[text] title:[optional] author:[optional]
```

**Parameters:**
- `quote` (required) - The quote text (max 400 characters)
- `title` (optional) - The movie/show/game/etc. it's from (max 100 characters)
- `author` (optional) - The character or real person who said it (max 100 characters)

**How It Works:**
1. Your suggestion is added to a review queue — it does **not** go straight into the bot's status rotation
2. If the server has a quote-suggestions moderation channel configured, moderators see it there with **✅ Approve**, **✏️ Edit** and **❌ Reject** buttons. Without one, it waits on the quotes editor page's **Suggestions** tab
3. Once approved, it becomes part of the live rotation `/quote` and the bot's status can pull from

**For moderators:** only admins and moderators (Administrator, Manage Server, Timeout Members, Kick Members or Ban Members) can press the buttons. **Approve** adds the quote as it was suggested, and **Reject** drops it; either way the message changes to say who decided, and its buttons go. **Edit** opens a form filled in with the quote, title and author. Saving it approves the suggestion with your changes in the same step, so there's no separate Approve. Leave Title or Author empty to clear it. The buttons don't depend on the quotes editor page being set up.

**Example:**
```
/suggest-quote quote:Trust no one. title:The Thing author:MacReady
```

---

## Best Practices

### Surveys

1. **Keep questions concise** - 256 characters max, but shorter is better
2. **Limit options** - 2-5 options typically work best, though you can use up to 10
3. **Use multiple-vote mode** for preference surveys (e.g., "Which genres do you like?")
4. **Use single-vote mode** for decisions (e.g., "What should we watch tonight?")
5. **Close surveys** when voting is complete to show final results
6. **Clear survey titles** help when browsing `/survey list`

### Common Use Cases

- **Watch party planning:** "What should we watch tonight?"
- **Schedule coordination:** "What time works for the watch party?"
- **Content preferences:** "Which genres should we explore more?"
- **Event feedback:** "How was last night's watch party?"
- **Quick polls:** "Horror or comedy?"

---

## Troubleshooting

### Survey issues

**Problem:** Users can't vote  
**Solution:** Make sure the survey is still active. Check with `/survey list`. If closed, votes are disabled.

**Problem:** Survey command doesn't appear  
**Solution:** Check if it's enabled: `/eggshen-config settings view` and look at the Command Permissions section.

**Problem:** Can't close someone else's survey  
**Solution:** Only the creator, or someone with the Administrator or Manage Server permission, can close or delete a survey.

**Problem:** Lost the survey ID  
**Solution:** Use `/survey list` to find all surveys and their IDs.

---

## Related Documentation

- [Games & Scores](/commands/games) - `/foodfight`, `/doom`, `/rescue`, `/potion` and `/siege`, their points and their settings
- [Configuration Commands](/commands/configuration) - Customize survey settings
- [Watch Party Commands](/commands/watch-party) - Host watch parties with timers
- [Statistics](/features/statistics) - Track command usage

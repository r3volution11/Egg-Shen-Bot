---
title: Social Commands - Egg Shen Bot
description: Interactive social features including surveys/polls and magical potions for entertainment-focused Discord communities.
---

# Social Commands

**Add fun and interactive elements** to your entertainment Discord community with surveys, polls, and playful social interactions.

## Quick FAQ

**Q: Can I disable the survey command if we already have a polling bot?**  
A: Yes! Use `/eggshen-config commands toggle setting:Survey Command enabled:false`

**Q: Who can manage surveys?**  
A: The person who created the survey, server administrators, and moderators can close or delete surveys.

**Q: How do users vote in surveys?**  
A: By clicking the button under their choice.

**Q: Can users change their vote?**  
A: Yes! Click a different button to switch your vote. In multiple-vote mode, clicking a button toggles that option on or off without affecting your other selections.

**Q: Are survey results stored permanently?**  
A: Yes, all surveys are stored in JSON files per-server and persist even if the bot restarts.

**Q: Can a survey close itself automatically?**  
A: Yes! Set `duration:[minutes]` when creating it (`/survey create ... duration:120` for 2 hours). Without it, a survey stays open until someone runs `/survey close`.

---

## Survey Commands

Create interactive polls and surveys with up to 10 options, live vote tracking, optional auto-close, and comprehensive management.

### Create a Survey

```
/survey create question:[question] option1:[text] option2:[text] ... option10:[optional] multiple:[optional] duration:[optional]
```

**Parameters:**
- `question` (required) - The survey question (max 256 characters)
- `option1` (required) - First option (max 100 characters)
- `option2` (required) - Second option (max 100 characters)
- `option3`-`option10` (optional) - Additional options (max 100 characters each)
- `multiple` (optional) - Allow users to vote for multiple options (default: false)
- `duration` (optional) - Auto-close voting after this many minutes, from 1 minute up to 14 days (20160 minutes). Omit for a survey that stays open until manually closed with `/survey close`

**Features:**
- Up to 10 options per survey
- Vote by clicking a button under the option — no reactions to add or copy
- Single-vote mode (default): Clicking a different button switches your vote
- Multiple-vote mode: Clicking a button toggles that option on/off, other selections stay as-is
- The survey message updates live as votes come in — no need to run `/survey results` to see current standings
- Optional auto-close after a set duration, closing and posting results automatically without anyone needing to run `/survey close`

**Examples:**
```
/survey create question:"What should we watch tonight?" option1:"Horror" option2:"Comedy" option3:"Action"

/survey create question:"Which genres do you like?" option1:"Sci-Fi" option2:"Fantasy" option3:"Drama" option4:"Thriller" multiple:true

/survey create question:"Best 80s movie?" option1:"The Breakfast Club" option2:"Back to the Future" option3:"Blade Runner" option4:"Die Hard" option5:"E.T."

/survey create question:"Movie night pick?" option1:"The Thing" option2:"Alien" duration:120
```

**How It Works:**
1. Bot posts an embed with your question and a button under each option
2. Users vote by clicking a button
3. The survey message updates live with current vote counts and percentages as votes come in, and you'll get a private confirmation of your own vote
4. If a `duration` was set, the embed shows when voting ends and the bot automatically closes the survey and posts results at that time — otherwise, use `/survey close` when you're ready to end it
5. Anyone can view live results any time with `/survey results`

---

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
- Shows up to 25 most recent surveys
- Displays survey ID, question, vote count, creation time, and channel
- Status indicators: 🟢 Active, 🔴 Closed
- Jump links to original survey messages

**Examples:**
```
/survey list
/survey list filter:Active
/survey list filter:All
```

---

### View Survey Results

```
/survey results poll_id:[id]
```

**Parameters:**
- `poll_id` (required) - The survey to view — start typing the question and Discord will suggest matching surveys (active and closed) with their live vote counts

**Features:**
- Detailed results with progress bars
- Vote percentages for each option
- Total vote count
- Shows your own votes (if any)
- Link to jump to original survey message
- Works for both active and closed surveys

**Example:**
```
/survey results poll_id:a1b2c3d4e5f6g7h8
```

**Result Display:**
```
📊 What should we watch tonight?

1️⃣ **Horror**
████████████████░░░░ 80.0% (8 votes)

2️⃣ **Comedy**
████░░░░░░░░░░░░░░░░ 20.0% (2 votes)

3️⃣ **Action**
░░░░░░░░░░░░░░░░░░░░ 0.0% (0 votes)

Your Vote(s): 1️⃣ Horror
```

---

### Close a Survey

```
/survey close poll_id:[id]
```

**Parameters:**
- `poll_id` (required) - The survey to close — autocomplete only suggests surveys you're actually allowed to close (your own, or any if you're an admin/mod)

**Permissions:**
- Survey creator
- Server administrators
- Moderators (users with kick/ban/timeout permissions)

**Features:**
- Ends voting immediately
- Disables the voting buttons on the survey message (they stay visible, just grayed out)
- Updates the original message to show final results
- Posts final results as a new message in the channel
- Closed surveys can still be viewed with `/survey results`

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
- `poll_id` (required) - The survey to delete — autocomplete only suggests surveys you're actually allowed to delete (your own, or any if you're an admin/mod)

**Permissions:**
- Survey creator
- Server administrators
- Moderators (users with kick/ban/timeout permissions)

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

Three types of users can manage surveys:

1. **Survey Creator** - The person who created the survey
2. **Administrators** - Users with Administrator permission
3. **Moderators** - Users with any of these permissions:
   - Manage Server
   - Kick Members
   - Ban Members
   - Timeout Members (Moderate Members)

Regular users can only vote, not manage surveys.

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

## Potion Command

Give magical potions to other users with pop culture references!

### Give a Potion

```
/potion user:[user] type:[potion-type]
```

**Potion Types:**
- **Helpful:** Health, Mana, Strength, Speed, Invisibility, Luck, Love, Energy
- **Harmful:** Confusion, Poison, Weakness, Curse, Slow

**Features:**
- Pop culture references from movies, TV shows, video games, and more
- Themed responses based on genre (Horror, Comedy, Fantasy, Sci-Fi, Gaming, Action, Classics, Animation, Drama)
- Public messages visible to all channel members
- Purely for fun - no actual game mechanics

**Examples:**
```
/potion user:@Alice type:Health
/potion user:@Bob type:Confusion
/potion user:@Charlie type:Mana
```

**Sample Responses:**
- *"🧪 Alice hands Bob a suspicious red liquid. 'This... is my BOOMSTICK of healing!' 💚 +50 HP (Army of Darkness approved)"*
- *"🍯 Charlie gives Dave a flask of miruvor. The elvish cordial burns with an inner fire! 💚 +75 HP (Elrond's recipe)"*
- *"🧃 Eve tosses Frank an Estus Flask. 'Praise the sun!' 💚 +100 HP (Don't you dare go hollow)"*

**Customization:**
Server administrators can customize potion responses and themes via `/eggshen-config`. See [Configuration](/commands/configuration) for details.

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
**Solution:** Check if it's enabled: `/eggshen-config view` and look at Command Permissions section.

**Problem:** Can't close someone else's survey  
**Solution:** Only the creator, admins, or moderators can manage surveys. Regular users can only vote.

**Problem:** Lost the survey ID  
**Solution:** Use `/survey list` to find all surveys and their IDs.

### Potion issues

**Problem:** Potion responses are repetitive  
**Solution:** Administrators can add custom potion responses via `/eggshen-config`. The bot has many built-in responses that rotate.

---

## Related Documentation

- [Configuration Commands](/commands/configuration) - Customize survey and potion settings
- [Watch Party Commands](/commands/watch-party) - Host watch parties with timers
- [Statistics](/features/statistics) - Track command usage

---
title: Social Commands - Egg Shen Bot
description: Interactive social features including surveys/polls, magical potions, food fights, horror-movie fates, and status quotes for entertainment-focused Discord communities.
---

# Social Commands

**Add fun and interactive elements** to your entertainment Discord community with surveys, polls, potions, food fights, and status quotes.

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

**Q: Can I give a potion, throw food, or deal a fate to a whole role, or everyone?**  
A: Yes. Pick a member, a role, or @everyone as the target. A role or @everyone shows in the message but nobody gets a notification; only a member you pick is pinged.

**Q: Can I turn off /potion, /foodfight or /doom?**  
A: Yes: `/eggshen-config commands toggle setting:potion enabled:false` (or `setting:foodfight`, `setting:doom`). Admins and moderators can always use them.

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

🏆 1️⃣ **Horror**
████████████████░░░░ 80.0% (8 votes)

2️⃣ Comedy
▓▓▓▓░░░░░░░░░░░░░░░░ 20.0% (2 votes)

3️⃣ Action
░░░░░░░░░░░░░░░░░░░░ 0.0% (0 votes)

Your Vote(s): 1️⃣ Horror
```

The leader gets a 🏆 and a solid bar; everyone else gets a dimmer bar so the front-runner stands out at a glance. If the top spots are tied, no option is crowned.

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

Give magical potions with pop culture references, to a member, a whole role, or @everyone.

### Give a Potion

```
/potion give user:<member, role, or @everyone> type:<potion-type>
```

**Potion Types:**
- **Helpful:** Health, Mana, Strength, Speed, Invisibility, Luck, Love, Energy
- **Harmful:** Confusion, Poison, Weakness, Curse, Slow

**Features:**
- 85 built-in responses with references from movies, TV shows, video games, and more
- Themed responses based on genre (Horror, Comedy, Fantasy, Sci-Fi, Gaming, Action, Classics, Animation, Drama)
- Posted publicly. A member you pick is pinged; a role or @everyone is shown but not pinged
- Purely for fun: no actual game mechanics

**Examples:**
```
/potion give user:@Alice type:health
/potion give user:@Movie Club type:confusion
/potion give user:@everyone type:luck
```

**Sample Responses:**
- *"🧪 Alice hands Bob a suspicious red liquid. 'This... is my BOOMSTICK of healing!' 💚 +50 HP (Army of Darkness approved)"*
- *"🍯 Charlie gives Dave a flask of miruvor. The elvish cordial burns with an inner fire! 💚 +75 HP (Elrond's recipe)"*
- *"🧃 Eve tosses Frank an Estus Flask. 'Praise the sun!' 💚 +100 HP (Don't you dare go hollow)"*

### Custom Responses and Themes (Admin/Mod)

```
/potion responses add type:health response:{giver} hands {receiver} a juice box. 💚 +5 HP
/potion responses list type:health
/potion responses remove type:health index:1
/potion responses reset type:health
/potion theme set themes:horror,comedy
```

A response needs both `{giver}` and `{receiver}`. Your own responses are used alongside the built-in ones; themes narrow which built-in ones are used.

---

## Food Fight

Start a food fight, after the classic BBS door game. Throw food at a member, a whole role, or @everyone, and the bot says what happened: a hit, a miss, or a throw that backfires on you.

### Throw Food

```
/foodfight throw target:<member, role, or @everyone> food:[food]
```

Leave out `food` and the bot grabs whatever's on the tray.

**Foods:** 🥧 Cream Pie, 🍝 Spaghetti, 🍮 Pudding, 🥔 Mashed Potatoes, 🟩 Jell-O, 🍖 Meatloaf, 🌽 Creamed Corn, 🥣 Tapioca, 🍕 Pizza, 🌮 Taco, 🐟 Fish Sticks, 🥬 Split Pea Soup

**Examples:**
```
/foodfight throw target:@Alice food:pie
/foodfight throw target:@Moderators
/foodfight throw target:@everyone food:pea-soup
```

**Sample lines:**
- *"🥧 @Alice winds up like a Three Stooges short and lands a cream pie square on @Bob. Nyuk nyuk nyuk."*
- *"🍕 "Cowabunga!" @Alice launches a pizza at @Bob like a Ninja Turtle."*
- *"🐟 @Alice throws a fish stick at @Bob, and it boomerangs back. @Alice needs a bigger boat."*

Posted publicly. A member you hit is pinged; a role or @everyone is shown but not pinged. Bots dodge everything.

### Your Own Lines (Admin/Mod)

```
/foodfight lines add food:pie line:{thrower} hurls a key lime pie at {target}!
/foodfight lines list food:pie
/foodfight lines remove food:pie number:1
/foodfight lines reset food:pie
```

A line needs both `{thrower}` and `{target}`. Your lines are used alongside the 72 built-in ones. `{target}` can be one person, a role, or @everyone, so write lines that read for any of them.

---

## Doom

Deal someone a horror-movie fate: a zombie bite, a monkey's paw, a cursed tape. It's horror-comedy, so things go wrong for the victim, backfire on whoever did the dooming, or occasionally end in a narrow escape. Aim it at a member, a whole role, or @everyone.

### Deal a Fate

```
/doom fate target:<member, role, or @everyone> trope:[trope]
```

Leave out `trope` and fate decides.

**Tropes:** 🧟 Zombie, 🐒 Monkey's Paw, 🪓 Slasher, 😈 Possession, 📼 Cursed Tape, 🪆 Haunted Doll, 🧛 Vampire, 🐺 Werewolf, 🤡 Killer Clown, 📖 Necronomicon, 🔮 Ouija Board, 🪞 Bloody Mary

**Examples:**
```
/doom fate target:@Alice trope:zombie
/doom fate target:@Camp Counselors trope:slasher
/doom fate target:@everyone
```

**Sample lines:**
- *"🧟 @Bob gets bitten, turns, and immediately eats @Alice. Somebody should have aimed for the head."*
- *"🐒 @Alice gives @Bob a monkey's paw. @Bob wishes for a million dollars. One finger curls. A million pennies fall from the sky."*
- *"🪓 @Bob says "I'll be right back." @Alice nods slowly. @Bob is not right back."*

Posted publicly. A member you doom is pinged; a role or @everyone is shown but not pinged. Bots are already undead.

### Your Own Lines (Admin/Mod)

```
/doom lines add trope:zombie line:{user} serves {target} brain casserole!
/doom lines list trope:zombie
/doom lines remove trope:zombie number:1
/doom lines reset trope:zombie
```

A line needs both `{user}` and `{target}`. Your lines are used alongside the 72 built-in ones. `{target}` can be one person, a role, or @everyone, so write lines that read for any of them.

---

## Status Quote Commands

The bot rotates its Discord status once an hour through a list of short quotes, each optionally tagged with a title (movie/show/game/etc.) and an author (character or real person). See [`QUOTES_ADMIN_SETUP.md`](https://github.com/r3volution11/Egg-Shen-Bot/blob/main/QUOTES_ADMIN_SETUP.md) for how server admins manage that list (the quotes-admin web page, opened with a one-click link from `/eggshen-config-quotes admin-link`, or the other `/eggshen-config-quotes` subcommands).

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
/quote title:"The Thing"
/quote author:"MacReady"
/quote title:"The Thing" author:"MacReady"
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
2. If the server has a quote-suggestions moderation channel configured, moderators see it there with Approve/Edit/Reject buttons
3. Once approved, it becomes part of the live rotation `/quote` and the bot's status can pull from

**Example:**
```
/suggest-quote quote:"Trust no one." title:"The Thing" author:"MacReady"
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
**Solution:** Only the creator, admins, or moderators can manage surveys. Regular users can only vote.

**Problem:** Lost the survey ID  
**Solution:** Use `/survey list` to find all surveys and their IDs.

### Potion issues

**Problem:** Potion responses are repetitive  
**Solution:** Administrators can add their own with `/potion responses add`, used alongside the 85 built-in ones.

**Problem:** A role or @everyone didn't get a notification  
**Solution:** That's on purpose: /potion and /foodfight show a role or @everyone without pinging anyone, so a game doesn't notify a whole server. Pick a member to ping them.

---

## Related Documentation

- [Configuration Commands](/commands/configuration) - Customize survey and potion settings
- [Watch Party Commands](/commands/watch-party) - Host watch parties with timers
- [Statistics](/features/statistics) - Track command usage

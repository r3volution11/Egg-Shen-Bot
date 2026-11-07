---
title: Escape Velocity - Egg Shen Bot
description: Escape Velocity is a multi-day movie and TV genre trivia event in the style of Who Wants to Be a Millionaire. Climb 15 stages to reach orbit, with one launch a day and your best run counting.
kitHeadings:
  the-standings: trophy
---

# Escape Velocity

Escape Velocity is a trivia event that runs for days, played like *Who Wants to Be a Millionaire?* and themed as a rocket launch. Every question is about movie and TV **genres and subgenres**: slashers, folk horror, space opera, heists, anime and more.

- **Climb 15 stages.** Each one is worth more, and is harder, than the last, from 100 points up to **1,000,000** for reaching orbit.
- **One launch a day** (a day starts at midnight UTC). A wrong answer ends that day's run, and you can try again tomorrow.
- **Your best run counts.** Your score for the event is the best run you have during it.
- **Stage separations** at stage 5 (1,000) and stage 10 (32,000). Once you clear one, a later wrong answer can't take those points away.
- **Abort** at any time to stop and keep everything you've banked.

Questions are built from real TMDB data, so the answers are always right. Popular titles make easy questions; obscure ones and trickier details (who played a supporting role, how many seasons a show ran) make hard ones.

| Stage | 1 | 2 | 3 | 4 | **5** | 6 | 7 | 8 | 9 | **10** | 11 | 12 | 13 | 14 | 15 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Points | 100 | 200 | 300 | 500 | **1,000** | 2,000 | 4,000 | 8,000 | 16,000 | **32,000** | 64,000 | 125,000 | 250,000 | 500,000 | 1,000,000 |

---

## Playing

When an event goes live, a **mission card** is posted in its channel: the event's day, its genres, the standings and two buttons.

- **🚀 Launch** opens your own dashboard. Only you can see it. It shows the stage and what it's worth, the question and its genre, four options, what you've banked, your next stage separation and your climb so far. Click **A**, **B**, **C** or **D** to answer, or **🪂 Abort** to stop and keep what's banked.
- **📊 My mission** shows your score and rank, your best run, today's status and your streak.

A wrong answer ends the run and shows the question again, with the right answer ticked and yours crossed out. Your dashboard then says when your next launch window opens.

You can also use the commands:

| Command | What it does |
|---|---|
| `/escape play` | Launch today's run, or pick up where you left off (only you see it) |
| `/escape rules` | How the game works (only you see it) |
| `/escape standings` | The top 10 (add `private:True` to see it alone) |

If you close your dashboard or it times out, press **Launch** again. You'll pick up on the same question.

### The standings

The mission card updates as people play. Each line shows the player's score, the furthest stage they've reached and today's status:

| Icon | Meaning |
|---|---|
| 🛰️ | Hasn't launched today |
| 🚀 | In flight right now |
| 💥 | Failed today |
| 🪂 | Aborted today |
| 🌍 | Reached orbit today |
| 🔥 `3` | Days in a row they've launched (from 2) |

The top three get medals. Ties are broken by the furthest stage reached, then by who got there first.

Your climb shows as three bars, one for each stretch between stage separations: `▰▰▰▰▰ ▰▱▱▱▱ ▱▱▱▱▱` is six stages cleared. Once the bot's own emoji are uploaded (it does this itself on its first start), the bars are its carved stone bars, and the medals and 🔥 are its own icons too.

A new mission card is posted each day, so the new launch window shows up as a new message. The day before's card loses its buttons, leaving one place to press **Launch**. The channel also gets a short message when someone clears stage separation 10 or reaches orbit.

---

## Running an event (admins and moderators)

`/escape-setup` is for admins and moderators: Administrator, Manage Server, Timeout Members, Kick Members or Ban Members. Discord hides it from anyone without Timeout Members unless the server changes that in **Server Settings → Integrations**, so a moderator with only Manage Server, Kick or Ban won't see it until then.

```
/escape-setup create name:Halloween Launch days:7
```

| Option | |
|---|---|
| `name` | The event's name, up to 80 characters |
| `days` | How long it runs (1–30) |
| `starts_in_hours` | When it launches (0–720). Leave it out to launch as soon as the questions are ready |
| `channel` | Where the mission card goes (default: the current channel) |

A private setup screen opens. Pick:

1. **Media:** movies, TV or both.
2. **Genres:** each genre brings all its subgenres with it.
3. **Build questions & schedule:** the bot builds about 125 questions from TMDB, 25 at each of five difficulty levels, and shows its progress. Then it launches, or schedules the launch. If it can't find enough yet, the event stays scheduled, keeps building, and launches once every level has enough.

The genres:

| Genre | Subgenres |
|---|---|
| 🔪 Horror | Slasher\*, Folk Horror\*, Found Footage\*, Zombie, Supernatural\*, Body Horror\*, Haunted House\*, Vampire, Werewolf |
| 🚀 Science Fiction | Space Opera, Cyberpunk, Time Travel, Dystopia, Alien Invasion, Post-Apocalyptic, Kaiju\* |
| 🐉 Fantasy | Sword & Sorcery, Fairy Tale\*, High Fantasy, Dark Fantasy |
| 🕵️ Thriller | Psychological Thriller, Conspiracy, Erotic Thriller\* |
| 🚔 Crime | Heist, Serial Killer, Neo-Noir, Police Procedural† |
| 🤡 Comedy | Romantic Comedy\*, Parody, Dark Comedy, Satire |
| 🎨 Animation | Anime, Stop Motion\* |
| 🪖 War | World War II, Vietnam War\* |

\* Movies only, and † TV only: TMDB has enough well-known titles for these on one side alone. Every genre works for movies and TV.

While the event runs:

| Command | What it does |
|---|---|
| `/escape-setup pool` | How many questions there are at each difficulty level (⚠️ when one runs low). Add `add:True` to build more |
| `/escape-setup extend days:2` | Add days (1–30) |
| `/escape-setup end-now` | Finish now and post the final results |
| `/escape-setup cancel confirm:True` | Cancel without results |

The bot adds questions on its own as people play, so the keenest players don't run out of new ones. When the event ends, it posts the final top 10 and mentions the top three.

Turn the game off for regular members with `/eggshen-config commands toggle setting:escape enabled:false`. That turns off the Launch button for them too. Admins and moderators can still play.

---

## Not in the game yet

Lifelines are planned but not built: **✂️ Jettison** (remove two wrong answers), **📡 Poll mission control** (see how other players answered) and **📞 Hail a crewmate** (ask someone for a hint).

---
title: Escape Velocity - Egg Shen Bot
description: Escape Velocity is a multi-day movie and TV genre trivia event in the style of Who Wants to Be a Millionaire. Climb 15 stages to reach orbit, with one launch a day and your best run counting.
---

# Escape Velocity

Escape Velocity is a trivia event that runs for days, played like *Who Wants to Be a Millionaire?* and themed as a rocket launch. Every question is about movie and TV **genres and subgenres**: slashers, folk horror, space opera, heists, anime and more.

- **Climb 15 stages.** Each one is worth more, and is harder, than the last, from 100 points up to **1,000,000** for reaching orbit.
- **One launch a day** (UTC). A wrong answer ends that day's run, and you can try again tomorrow.
- **Your best run counts.** Your score for the event is the best run you have during it.
- **Stage separations** at stage 5 (1,000) and stage 10 (32,000). Once you clear one, a later wrong answer can't take those points away.
- **Abort** at any time to stop and keep everything you've banked.

Questions are built from real TMDB data, so the answers are always right. Popular titles make easy questions; obscure ones and trickier details (who played a supporting role, how many seasons a show ran) make hard ones.

---

## Playing

When an event goes live, a **mission card** is posted in its channel with the standings and two buttons:

- **🚀 Launch** opens your own dashboard. Only you can see it. It shows the question, the four options, what you've banked and your next stage separation. Click **A**, **B**, **C** or **D** to answer.
- **📊 My mission** shows your score, rank, best run, today's status and your streak.

You can also use the commands:

| Command | What it does |
|---|---|
| `/escape play` | Launch today's run, or pick up where you left off |
| `/escape rules` | How the game works |
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
| 🔥 | Days in a row they've launched |

A new mission card is posted each day, so you get a notification that a new launch window is open. The channel also gets a short message when someone clears stage separation 10 or reaches orbit.

Ties are broken by the furthest stage reached, then by who got there first.

---

## Running an event (admins and moderators)

```
/escape-setup create name:"Halloween Launch" days:7
```

| Option | |
|---|---|
| `name` | The event's name |
| `days` | How long it runs (1–30) |
| `starts_in_hours` | When it launches. Leave it out to launch as soon as the questions are ready |
| `channel` | Where the mission card goes (default: the current channel) |

A private setup screen opens. Pick:

1. **Media:** movies, TV or both.
2. **Genres:** each genre brings all its subgenres with it. Some are movies-only because TMDB doesn't have enough TV titles for them, and the menu says so.
3. **Build questions & schedule:** the bot builds about 125 questions from TMDB, which takes under a minute, then schedules the launch.

The genres:

| Genre | Subgenres |
|---|---|
| 🔪 Horror | Slasher, Folk Horror, Found Footage, Zombie, Supernatural, Body Horror, Haunted House, Vampire, Werewolf |
| 🚀 Science Fiction | Space Opera, Cyberpunk, Time Travel, Dystopia, Alien Invasion, Post-Apocalyptic, Kaiju |
| 🐉 Fantasy | Sword & Sorcery, Fairy Tale, High Fantasy, Dark Fantasy |
| 🕵️ Thriller | Psychological Thriller, Conspiracy, Erotic Thriller |
| 🚔 Crime | Heist, Serial Killer, Neo-Noir, Police Procedural |
| 🤡 Comedy | Romantic Comedy, Parody, Dark Comedy, Satire |
| 🎨 Animation | Anime, Stop Motion |
| 🪖 War | World War II, Vietnam War |

While the event runs:

| Command | What it does |
|---|---|
| `/escape-setup pool` | How many questions there are at each difficulty. Add `add:True` to build more |
| `/escape-setup extend days:2` | Add days |
| `/escape-setup end-now` | Finish now and post the final results |
| `/escape-setup cancel confirm:True` | Cancel without results |

The bot adds questions on its own as people play, so the keenest players don't run out of new ones. When the event ends, it posts the final standings and mentions the top three.

Turn the game off for a server with `/eggshen-config commands` (`escape`). That also turns off the Launch button.

---

## Coming next

Escape Velocity is being built in stages. Next up are the classic lifelines:

- **✂️ Jettison:** removes two wrong answers.
- **📡 Poll mission control:** shows how other players answered the same question.
- **📞 Hail a crewmate:** ask someone for a hint. The bot knows who answered that exact question correctly before and suggests them, but every hint costs points, and a hint that gives the answer away costs both of you.

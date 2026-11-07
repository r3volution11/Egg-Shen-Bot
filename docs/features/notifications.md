---
description: "What Egg Shen Bot posts on its own: restart announcements, starting-soon cards, scheduled watch-party announcements and more, and how to turn each off."
---

# What the Bot Posts on Its Own

Most of what the bot posts comes from a command someone runs. This page covers the settings under `/eggshen-config notifications`, the watch-party announcements, and the other things the bot posts on its own.

The bot has no release alerts, trending digests or follow lists.

## Restart Announcements

Running timers are saved to disk. When the bot restarts (after a deploy or a crash, say), it restores every timer that was running, and auto-stop keeps working with the time it had left. A paused timer comes back paused.

A timer whose end passed while the bot was down is stopped as soon as the bot is back, just as if it had stopped on time: the usual **⏰ Timer Completed** post, logged to watch history when the timer knows its title, or with the **📝 Log to Watch History** button when it doesn't. Its total time runs to the moment the bot came back, so it can be longer than the timer was set for. This happens whether or not restart announcements are on.

With restart announcements on, the bot also posts a **🔄 Bot Restarted** embed in each channel that had a timer running, saying the timer has been restored. The embed shows:

- **Timer**: the timer's title (or "No label")
- **Elapsed Time**: how long it has been running
- **Started by**: who started it
- **Remaining Time**: shown only when the timer has a real duration, which is the same rule `/timer status` uses

It lets the room know the bot went down and came back, and that their timer survived.

**Default:** off. With it off, timers are still restored, just without the message.

### Turning It On or Off

For admins and moderators:

```
/eggshen-config notifications toggle setting:restartAnnouncements enabled:true
/eggshen-config notifications toggle setting:restartAnnouncements enabled:false
```

`restartAnnouncements` is the only value for `setting`. In Discord's picker it appears as **Restart Announcements**.

To see the current state, run `/eggshen-config settings view`. It's listed under notifications.

## Announcing Watch Parties

To tell people about a watch party, use one of these:

| When | Command |
|---|---|
| An hour or more ahead | `/announce party` |
| Automatically, a set time before a scheduled event | `/announce schedule` |
| A few minutes before | `/announce starting` |
| The moment you start the timer | `/timer remind` |

Each one takes an optional `role` option. The role is pinged in the message content, so members actually get a notification (a mention inside an embed doesn't ping anyone). `/announce` is for admins and moderators.

`/announce schedule` picks one of the server's upcoming events and posts the watch-party card `hours` and `minutes` before it starts, in the channel you choose. If the event is moved, the announcement moves with it. If it's cancelled, so is the announcement. If the bot was offline when it was due and the event has already started, it's skipped rather than posted late. `/announce scheduled` lists what's waiting, with a **Cancel** button for each.

For every option, see [Watch Party Commands › Announcements](/commands/watch-party#announcements) and [Scheduled Announcements](/commands/watch-party#scheduled-announcements).

## Starting-Soon Cards

Ten minutes before **every** scheduled event in the server, the bot posts a short "starting soon" card in the event's own channel: its voice channel's chat, or the channel named in its location (such as `#movie-night`). The card has the event's cover image, or the title's artwork if there isn't one, and a link to the event. It doesn't ping anyone.

**Default:** on. To turn it off:

```
/eggshen-config-watch-party watch-party starting-soon enabled:false
```

## Other Posts the Bot Makes on Its Own

These belong to other features but are worth knowing about:

- **Timer ending soon:** a timer started with no duration stops on its own after the server's fallback time (6 hours by default). Before it does, the bot posts **⏰ Timer Ending Soon** in the channel, pings whoever started it, and offers an **Extend Timer** button. Timers with a real duration never get this.
- **Timer auto-stop:** when a timer's duration runs out, the bot posts **⏰ Timer Completed** and, if it knows the title, logs it to [watch history](/features/watch-history).
- **Event request decisions:** `/eggshen-config-events event-requests announce-decisions enabled:true` posts a new message in the moderation channel whenever a request is approved or denied. On by default. See [Event Requests](/features/event-requests#everyone-sees-what-happened).
- **Approved events, for members:** `/eggshen-config-events event-requests announcement-channel` posts a **📅 New watch party** message in the event's own channel or a channel you pick. Off by default. See [Event Requests](/features/event-requests#announcing-approved-events-to-members).
- **Surveys** with a `duration` close on time and post their results.
- **Tournaments** post their voting results, warnings before voting closes, and the bracket as it fills in. See [Tournaments](/guides/tournaments/).
- **Happenings and random sieges** are announced where the games are played. Turn random ones off with `/eggshen-config-games happenings frequency:off siege-frequency:off`. See [Twists & Happenings](/commands/games-happenings) and [Siege](/commands/games-siege).
- **Escape Velocity** posts a fresh mission card each day an event runs, and tells the channel when someone clears stage 10 or reaches orbit. See [Escape Velocity](/commands/escape-velocity).
- **Auto-ban threshold warnings:** `/eggshen-config-moderation moderation auto-ban-toggle enabled:true` adds a warning to a member's rate-limit reply when they reach the violation threshold. Nothing is posted to moderators. To see who is over it, run `/eggshen-config-moderation moderation auto-ban-list`. Moderation features have to be on first. See [Moderation Tools](/features/moderation-tools).

## Troubleshooting

**The bot restarted and nobody was told.** Restart announcements are off by default. Turn them on with the command above. They only post in channels that had a timer **running** when the bot went down.

**The announcement didn't show a remaining time.** The timer had no duration set or detected, so it was running on the fallback auto-stop. `/timer status` hides the remaining time in that case too.

**A starting-soon card didn't post.** Check the bot can send messages in the event's channel. An event with an external location needs a channel in that location, like `#movie-night`, or the bot has nowhere to post.

**A scheduled announcement never posted.** Run `/announce scheduled`. It shows what happened to recent ones: posted, cancelled with its event, or skipped because the event had already started.

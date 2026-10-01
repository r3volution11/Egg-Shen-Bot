---
description: "Notification settings in Egg Shen Bot: restart announcements for active timers, plus where watch-party announcements live."
---

# Notifications

Egg Shen Bot has one automatic notification setting: **restart announcements**. Everything else the bot posts to a channel comes from a command someone runs, such as `/announce` or `/timer remind`.

The bot has no release alerts, no trending digests, no follow lists, and no scheduled reminders.

## Restart Announcements

Running timers are saved to disk. When the bot restarts (after a deploy or a crash, say), it restores every timer that was running, and auto-stop keeps working with the time it had left.

With restart announcements on, the bot also posts a **🔄 Bot Restarted** embed in each channel that had a timer running. The embed shows:

- **Timer**: the timer's label (or "No label")
- **Elapsed Time**: how long it has been running
- **Started by**: who started it
- **Remaining Time**: shown only when the timer has a real duration, which is the same rule `/timer status` uses

This lets the room know the bot went down and came back, and that their timer survived.

**Default:** off. With it off, timers are still restored, just without the message.

### Turning it on or off

Admin/Moderator only:

```
/eggshen-config notifications toggle setting:restartAnnouncements enabled:true
/eggshen-config notifications toggle setting:restartAnnouncements enabled:false
```

`restartAnnouncements` is currently the only value for `setting`. In Discord's picker it appears as **Restart Announcements**.

To see the current state, run `/eggshen-config settings view`. It is listed under notifications.

## Announcing Watch Parties

The bot doesn't remind anyone on its own. To notify people about a watch party, run one of these at the right moment:

| When | Command |
|---|---|
| An hour or more ahead | `/announce party` |
| A few minutes before | `/announce starting` |
| The moment you start the timer | `/timer remind` |

Each one takes an optional `role` option. The role is pinged in the message content, so members actually get a notification (a mention inside an embed doesn't ping anyone). `/announce` is Admin/Moderator only.

For every option, see [Watch Party Commands](/commands/watch-party#announcements).

## Other Settings That Post Messages

These belong to other features but are worth knowing about:

- **Event request decisions**: `/eggshen-config-events event-requests announce-decisions enabled:true` posts a new message in the moderation channel whenever a request is approved or denied. See [Event Requests](/features/event-requests).
- **Auto-ban threshold warnings**: `/eggshen-config-moderation moderation auto-ban-toggle enabled:true` adds a warning to the rate-limit reply when a user goes past the violation threshold. Set the threshold with `/eggshen-config-moderation moderation auto-ban-threshold count:<5-100> hours:<1-168>` (`hours` defaults to 24). Nothing is posted to moderators. To see who is over the threshold, run `/eggshen-config-moderation moderation auto-ban-list`. Moderation has to be enabled first. See [Moderation Tools](/features/moderation-tools).

## Troubleshooting

**The bot restarted and nobody was told.** Restart announcements are off by default. Turn them on with the command above. They also only post in channels that had a timer **running** when the bot went down.

**The announcement didn't show a remaining time.** The timer had no duration set or detected, so it was running on the fallback auto-stop. `/timer status` hides the remaining time in that case too.

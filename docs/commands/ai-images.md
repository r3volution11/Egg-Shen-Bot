---
description: "Generate AI images in Discord with Egg Shen Bot: freeform prompts, images from a message, versus battle images comparing two titles, and personas of server members."
---

# AI Image Generation

`/image` makes AI images with OpenAI's image model. One command covers five kinds: a prompt, a Discord message, a versus poster for two titles, a tournament matchup, and a member imagined from their profile. Limits keep the cost down, and admins can change them or switch `/image` off.

## Overview

- **Needs** an OpenAI API key on the bot. Without one, `/image` says it isn't configured
- **Cost:** the bot counts $0.04 per image toward its daily totals
- **Time:** usually 2-3 minutes per image
- **Where it posts:** you see the progress privately, then the image posts in the channel. A small line above it says you ran `/image`; your prompt isn't shown. Add `private:true` to keep the image to yourself
- **Default limits:** 5 minutes between images, 10 images per member per day, 50 per server per day
- **Server controls:** admins can switch it off, limit it to moderators or admins, change the limits, and give some members no limits

---

## `/image` Command

Which kind of image you get depends on the options you give.

### Mode 1: Freeform Text Prompt

```
/image prompt:A dragon flying over a medieval castle at sunset
```

### Mode 2: From a Discord Message

```
/image message:username
/image message:1234567890123456789
```

Draws from the text of a message: the most recent one by that member among the channel's last 100 messages, or the message with that ID in this channel.

Discord only shows a bot what other people wrote if the bot has the **Message Content Intent**. If `/image` says the message has no text, the bot's operator can turn that intent on in the Discord Developer Portal, on the application's **Bot** page.

### Mode 3: Versus Battle Between Two Titles

```
/image title1:"The Thing 1982" title2:"Alien 1979"
/image title1:"Breaking Bad" title2:"The Wire" prompt:"dramatic neon lighting"
/image title1:"Elden Ring" title2:"Dark Souls"
```

Looks up both titles on TMDB, RAWG, BoardGameGeek and Google Books (movie, TV show, video game, board game or book), then draws a split-screen "versus" poster. The two can be different kinds, such as a movie against a video game. If a title matches several things, the first match is used and the reply says so.

### Mode 4: From an Active Tournament Matchup

```
/image matchup:1A
/image matchup:Finals
/image matchup:"The Thing vs Alien"
```

If your server has a [tournament](./brackets/) under way, this draws a versus poster from one of its matchups. Start typing in `matchup:` and pick from the list (matchups being voted on come first), or type a label such as `1A` or `Finals`, or its two titles. Run `/image` with no options to see this round's matchups by label.

### Mode 5: A Member, Imagined From Their Profile

```
/image user:@Doug prompt:a Lego minifig version of them
/image user:@Doug prompt:as a 1950s drive-in mascot
```

Builds an original character from what Egg Shen can see of the member, **as text only**:

- Their display name and server nickname
- Their profile accent color and their role colors, used as signature colors
- Their top roles, by name
- Movies and shows they've looked up with the bot, and titles they've wanted on the [watchlist](./watch-party#watchlist), worked in as motifs and props

**Their avatar is never used.** It isn't downloaded or sent to the image generator, so nobody can turn someone else's photo into an image. Discord doesn't let bots read a member's bio (About Me) or their Nitro profile theme, so neither is used. `prompt` is required in this mode. Anything the bot doesn't know is left out, so a member with no roles or history still works from their name and your prompt.

### Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `prompt` | String | No | What to draw (Mode 1), or extra style detail alongside `title1`/`title2` or `matchup` |
| `message` | String | No | Username or message ID to draw from (Mode 2) |
| `title1` | String | No* | First title for a versus poster (Mode 3). Give it with `title2` |
| `title2` | String | No* | Second title for a versus poster (Mode 3). Give it with `title1` |
| `matchup` | String | No | Tournament matchup to draw (Mode 4): pick from the list, or type its label (`1A`, `Finals`) or titles |
| `user` | User | No | A member to imagine from their profile, never their avatar (Mode 5). Needs `prompt` |
| `private` | Boolean | No | Only you see the image (default: false) |

*Use one mode at a time: `title1` and `title2` together, `matchup`, `message`, `user` (with `prompt`), or `prompt` alone. Mixing them, such as `title1` with `message`, gets an error asking you to choose one.

### Image Details

- **Size:** square (1024×1024) for a prompt, a message or a member; wide (1792×1024) for a versus poster or a matchup
- **Original art:** versus prompts ask for something new inspired by the titles, not a copy of their posters, and use each title's synopsis for ideas
- **The card:** the title ("🎨 AI Generated Image", "🎨 Title1 vs Title2" or "🎨 Name, imagined"), the image, your name and the time. The prompt isn't shown

### Limits

By default:
- **Cooldown:** 5 minutes between images, per member
- **Daily limit:** 10 images per member
- **Server limit:** 50 images per server

Admins (Administrator or Manage Server) skip the cooldown by default, but never the daily limits. Days run on UTC: the counts reset at midnight UTC, and also when the bot restarts.

### Error Messages

- **"Please wait … before generating another image."** - You're in the cooldown
- **"You've reached your daily limit of 10 AI images."** - Try again tomorrow (UTC)
- **"This server has reached its daily limit of 50 AI images."** - The server's cap for today is used up
- **"AI image generation is disabled on this server."** - An admin has switched `/image` off
- **"AI image generation is restricted to…"** - Only moderators, or only admins, can use it here
- **"Please provide both `title1` and `title2`…"** - Only one versus title was given
- **"Please choose only one of…"** - Options from more than one mode were given
- **"Could not find a recent message from user…"** - That member has no message among the channel's last 100. Use a message ID
- **"Could not find: [title]"** - A versus title didn't match anything

---

## Limits and Cost

### Default Configuration

| Setting | Default | What it does |
|---------|---------|--------------|
| AI images | On | Whether `/image` works at all |
| Who can use it | Everyone | Or moderators and admins, or admins only |
| Limits | On | The three limits below |
| Cooldown | 5 minutes | Wait between images, per member |
| Member daily limit | 10 images | Per member per day |
| Server daily limit | 50 images | For the whole server per day |
| Admin cooldown bypass | On | Admins skip the cooldown, not the daily limits |

### What the Limits Save

At the bot's $0.04 an image, the default server limit of 50 a day caps spending at $2 a day, about $60 a month. With the limits off, 100 members making 20 images each would be $80 a day.

### Whitelisted Members

Admins can give members no limits at all, such as people who help pay for the bot. A whitelisted member skips the cooldown and both daily limits. Their images still count toward the server's daily total, so they use up what others have left.

---

## Configuration Commands

All of these are for admins and moderators (Administrator, Manage Server, Timeout Members, Kick Members or Ban Members). They're also listed on [Admin Configuration](./configuration#ai-images-group).

### View Current Settings & Stats

```
/eggshen-config-ai ai-images view
```

Shows whether `/image` is on, who can use it, every limit, today's usage and cost for the server, and your own usage and cooldown.

### Enable/Disable AI Image Generation

```
/eggshen-config-ai ai-images feature-toggle enabled:false
```

Switch `/image` on or off for the whole server. Off, `/image` replies that it's disabled, whatever the limits and permissions say. This is separate from the limits: you can keep `/image` on with limits, or switch it off entirely.

### Set Permission Levels

```
/eggshen-config-ai ai-images set-permissions level:<everyone|moderators|admins>
```

Who can use `/image`:
- `everyone` (default) - Every member
- `moderators` - Moderators (Timeout Members, Kick Members or Ban Members) and admins
- `admins` - Only admins (Administrator or Manage Server)

The permission level decides *who* can use it; the limits decide *how much*.

**Example:**
```
/eggshen-config-ai ai-images set-permissions level:moderators
```

### Toggle the Limits

```
/eggshen-config-ai ai-images toggle enabled:true
```

Turn the cooldown and daily limits on or off.

⚠️ **With the limits off, members can make as many images as they like, and every one costs money.**

### Set the Cooldown

```
/eggshen-config-ai ai-images user-cooldown seconds:300
```

Seconds between images per member, 60-3600. 300 (5 minutes) by default.

### Set the Member Daily Limit

```
/eggshen-config-ai ai-images user-daily-limit limit:10
```

Images per member per day, 1-100. 10 by default, which is at most $0.40 a member a day.

### Set the Server Daily Limit

```
/eggshen-config-ai ai-images guild-daily-limit limit:50
```

Images for the whole server per day, 1-500. 50 by default ($2 a day); 25 is $1 a day, and 100 is $4.

### Toggle Admin Cooldown Bypass

```
/eggshen-config-ai ai-images admin-bypass enabled:true
```

Whether admins skip the cooldown. On by default. They always keep to the daily limits.

### Whitelist

```
/eggshen-config-ai ai-images whitelist-add user:@username
/eggshen-config-ai ai-images whitelist-remove user:@username
/eggshen-config-ai ai-images whitelist-list
```

Give a member no limits, take that away, or see who has it.

### Reset Usage

```
/eggshen-config-ai ai-images reset-user user:@username
/eggshen-config-ai ai-images reset-guild
```

`reset-user` clears a member's count and cooldown for today. `reset-guild` clears the server's count for today; each member's own limit still applies.

---

## Tips

### For Admins

1. **Start with the defaults** and change them once you see how much they're used
2. **Check spending** with `/eggshen-config-ai ai-images view`
3. **Whitelist sparingly.** Whitelisted images still use up the server's daily total
4. **Tell members the limits,** and that they reset at midnight UTC

### For Members

1. **Be specific.** Name a style, such as "cinematic", "1980s VHS cover" or "watercolor"
2. **Add a prompt to a versus poster** for a theme of your own
3. **Use a message ID** for `message:` when the person hasn't posted recently

---

## Troubleshooting

### "Please wait…"
You're in the cooldown. Wait, or ask an admin to reset your usage with `/eggshen-config-ai ai-images reset-user`.

### "You've reached your daily limit"
Wait until midnight UTC, or ask an admin to reset your usage or raise the limit with `/eggshen-config-ai ai-images user-daily-limit`.

### "This server has reached its daily limit"
An admin can reset it with `/eggshen-config-ai ai-images reset-guild`, or raise it with `/eggshen-config-ai ai-images guild-daily-limit`.

### "OpenAI API is not configured" or "Failed to generate AI image"
- The bot needs `OPENAI_API_KEY` in its `.env` file: see [API Keys](/api-keys)
- Check the OpenAI account has billing set up and credit left
- Check OpenAI's status page, and try again in a few minutes

### "The selected message has no text content"
The message is only an image or embed, or the bot can't read message text: see [Mode 2](#mode-2-from-a-discord-message).

### "Could not find a recent message"
- Check the username's spelling (any case works)
- They need a message among the channel's last 100
- Use the message ID instead: right-click the message → **Copy Message ID** (turn on Developer Mode in Discord's settings first)

---

## Technical Details

- **Provider:** OpenAI's image API, model `gpt-image-2`, at medium quality
- **Sizes:** 1024×1024 (prompt, message, member) and 1792×1024 (versus, matchup)
- **The image** is uploaded to Discord as an attachment, so it stays after OpenAI's link expires
- **Usage counts** (cooldowns and daily totals) are kept in memory, so a restart clears them
- **Each image is logged** with the server, the member, the kind of image and the cost

---

## See Also

- [Tournament Brackets](./brackets/) - Tournaments, whose matchups `/image` can draw
- [Admin Configuration](./configuration) - All the configuration commands
- [Rate Limiting](/features/rate-limiting) - The bot's general command limits

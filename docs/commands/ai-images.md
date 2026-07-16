# AI Image Generation

Egg Shen can generate AI-powered images using OpenAI's latest image generation API. One command handles freeform prompts, generating from a Discord message, and "versus" battle images comparing two titles — with built-in rate limiting to control costs.

## Overview

- **Cost:** $0.04 per image generated
- **Generation Time:** 2-3 minutes per image
- **Privacy:** Command invocation is hidden (only you see it), image posted publicly
- **Server Controls:** Admins can disable entirely or restrict to moderators/admins only
- **Default Limits:** 5-minute cooldown, 10 images/user/day, 50 images/server/day
- **Customizable:** Server admins can adjust all limits
- **Whitelist:** Contributors/premium users can have unlimited access

**Available Commands:**
- **`/image`** - Generate images from text prompts, Discord messages, a two-title versus battle, or an active tournament matchup
- **`/potion`** - Generate mystical potion images (see [Social Commands](./social))

---

## `/image` Command

Generate AI images in one of four modes, depending on which options you provide.

### Mode 1: Freeform Text Prompt

```
/image prompt:A dragon flying over a medieval castle at sunset
```

### Mode 2: From a Discord Message

```
/image message:username
/image message:1234567890123456789
```

Finds the most recent message (last 100) from the specified user, or a specific message by ID, and generates an image based on that text.

### Mode 3: Versus Battle Between Two Titles

```
/image title1:"The Thing 1982" title2:"Alien 1979"
/image title1:"Breaking Bad" title2:"The Wire" prompt:"dramatic neon lighting"
/image title1:"Elden Ring" title2:"Dark Souls"
```

Searches TMDB, RAWG, BoardGameGeek, and Google Books to validate both titles exist (movie, TV show, video game, board game, or book), then generates a split-screen "versus" composition. Works across types — e.g. a movie vs. a video game.

### Mode 4: From an Active Tournament Matchup

```
/image matchup:"The Thing vs Alien"
```

If your server has an active [tournament bracket](./brackets/), generates a versus image directly from one of its matchups instead of searching from scratch. Running `/image` with no options at all lists the active tournament's current matchups, if any.

### Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `prompt` | String | No | Describe the image (Mode 1), or add extra style detail alongside `title1`/`title2` or `matchup` |
| `message` | String | No | Username or message ID to generate from (Mode 2) |
| `title1` | String | No* | First title for a versus battle (Mode 3) — provide with `title2` |
| `title2` | String | No* | Second title for a versus battle (Mode 3) — provide with `title1` |
| `matchup` | String | No | Tournament matchup to visualize (Mode 4) |
| `private` | Boolean | No | Only show the generated image to you instead of the whole channel (default: false) |

*Provide exactly one of: `title1` + `title2` together, `matchup`, `message`, or `prompt` alone. Mixing modes (e.g. `title1` with `message`) returns an error asking you to pick one.

### Features

- **Smart Search** (versus/matchup modes) - Validates titles exist before generating, across TMDB, RAWG, BoardGameGeek, and Google Books
- **Cross-Type Support** - Compare movies vs games, TV vs books, etc.
- **Auto-Disambiguation** - Selects the first match and tells you if multiple results were found
- **Content-Safe Prompts** - Uses "inspired by themes" language to comply with OpenAI's content policy, rather than requesting direct replicas
- **Rich Context** - Uses title metadata (overviews, release dates) to build better versus prompts
- **Format** - Square (1024x1024) for freeform/message mode; wide split-screen (1792x1024) for versus/matchup mode

### Rate Limiting

By default, users are limited to:
- **Cooldown:** 5 minutes between generations
- **Daily limit:** 10 images per day
- **Server limit:** 50 images per server per day

Admins and moderators can bypass the cooldown (but not daily limits) by default.

### Error Messages

- **"Please wait X minutes"** - You're in cooldown period
- **"Daily limit reached"** - You've generated your maximum images today (resets at midnight)
- **"Server has reached daily limit"** - Server has hit its daily cap
- **"Please provide both title1 and title2"** - Only one of the two versus-mode titles was given
- **"Please choose only one of..."** - More than one mode's options were provided at once
- **"Could not find message"** - Username/message ID not found
- **"Could not find: [title]"** - A versus/matchup title didn't match anything in the search APIs

---

## Rate Limiting System

### Default Configuration

| Setting | Default Value | Description |
|---------|---------------|-------------|
| Enabled | ✅ Yes | Master switch for rate limiting |
| User Cooldown | 5 minutes | Time between generations per user |
| User Daily Limit | 10 images | Maximum per user per day |
| Server Daily Limit | 50 images | Maximum per server per day |
| Admin Bypass Cooldown | ✅ Yes | Admins skip cooldown (not daily limits) |
| Cost Per Image | $0.04 | Tracked for statistics |

### Cost Protection

**Without limits:**
- 100 users × 20 images/day = 2,000 images/day
- Cost: **$80/day** = **$2,400/month** 😱

**With default limits:**
- 50 images/server/day max
- Cost: **$2/day** = **$60/month max** ✅

### Whitelisted Users

Server admins can grant unlimited access to specific users:
- Bot contributors
- Premium/donor users
- Server boosters
- Testing accounts

Whitelisted users bypass ALL limits (cooldown + daily limits).

---

## Configuration Commands

All configuration requires Administrator, Manage Server, or Moderator permissions.

### View Current Settings & Stats

```
/eggshen-config ai-images view
```

Shows:
- ⚙️ **Feature Status:** Whether AI generation is enabled/disabled
- 🔒 **Permissions:** Who can use AI image commands (everyone/moderators/admins)
- ⚙️ **Settings:** All current limits and toggles
- 📊 **Server Stats:** Today's usage, cost, and remaining quota
- 👤 **Your Stats:** Your personal usage and cooldown status

### Enable/Disable AI Image Generation

```
/eggshen-config ai-images feature-toggle enabled:false
```

Completely enable or disable AI image generation on your server.

**When disabled:**
- The `/image` command will show an error message
- No images can be generated regardless of permissions or rate limits
- Useful for servers that don't want AI features at all

**Options:**
- `enabled:true` - Enable AI image generation (default)
- `enabled:false` - Completely disable `/image`

💡 **Note:** This is separate from rate limiting. You can disable the feature entirely OR keep it enabled with rate limits.

### Set Permission Levels

```
/eggshen-config ai-images set-permissions level:admins
```

Control who can use `/image`.

**Permission Levels:**
- `everyone` (default) - All server members can generate images
- `moderators` - Only moderators and admins (users with Moderate Members, Kick Members, or Ban Members permissions)
- `admins` - Only administrators (users with Administrator or Manage Server permissions)

**Use cases:**
- Prevent spam by restricting to moderators
- Reserve AI features for admins only
- Open to everyone for community engagement

**Examples:**
```
/eggshen-config ai-images set-permissions level:everyone
/eggshen-config ai-images set-permissions level:moderators
/eggshen-config ai-images set-permissions level:admins
```

💡 **Combined with rate limiting:** Permission levels determine WHO can use the command, rate limits control HOW MUCH they can use it.

### Toggle Rate Limiting

```
/eggshen-config ai-images toggle enabled:true
```

Enable or disable rate limiting entirely.

⚠️ **Warning:** Disabling allows unlimited generations - costs can increase dramatically!

### Set User Cooldown

```
/eggshen-config ai-images user-cooldown seconds:300
```

Set time between generations per user (60-3600 seconds).

**Recommended values:**
- `300` (5 min) - Default, balanced
- `600` (10 min) - Stricter, lower costs
- `60` (1 min) - Looser, higher costs

### Set User Daily Limit

```
/eggshen-config ai-images user-daily-limit limit:10
```

Maximum images per user per day (1-100).

**Examples:**
- `limit:5` - Very strict ($0.20/user/day max)
- `limit:10` - Default ($0.40/user/day max)
- `limit:25` - Generous ($1.00/user/day max)

Shows estimated monthly cost per user.

### Set Server Daily Limit

```
/eggshen-config ai-images guild-daily-limit limit:50
```

Maximum images per server per day (1-500).

**Examples:**
- `limit:25` - Small server ($0.75/day = $22.50/month max)
- `limit:50` - Default ($2/day = $60/month max)
- `limit:100` - Large server ($4/day = $120/month max)

Shows estimated monthly cost.

### Toggle Admin Cooldown Bypass

```
/eggshen-config ai-images admin-bypass enabled:true
```

Allow admins/moderators to skip cooldown (they always respect daily limits).

**Enabled (default):** Admins can generate back-to-back for testing/demos
**Disabled:** Admins wait like everyone else

### Add User to Whitelist

```
/eggshen-config ai-images whitelist-add user:@username
```

Grant unlimited AI image generation to a user.

**Use cases:**
- Bot contributors helping with costs
- Premium/donor users
- Server boosters
- Testing accounts

Whitelisted users bypass:
- ✅ Cooldown
- ✅ Daily user limit
- ✅ Daily server limit (their usage doesn't count toward server total)

### Remove User from Whitelist

```
/eggshen-config ai-images whitelist-remove user:@username
```

Remove unlimited access - user returns to normal rate limits.

### View Whitelist

```
/eggshen-config ai-images whitelist-list
```

Shows all users with unlimited access.

### Reset User Usage

```
/eggshen-config ai-images reset-user user:@username
```

Reset a user's daily usage and cooldown.

**Use cases:**
- User hit limit due to testing
- Reward for event participation
- Resolve technical issues

### Reset Server Usage

```
/eggshen-config ai-images reset-guild
```

Reset the entire server's daily usage (user limits still apply).

**Use cases:**
- Special events
- Server milestones
- Testing periods

---

## Best Practices

### For Server Admins

1. **Start Conservative:** Use default limits (5 min cooldown, 10/day per user, 50/day server)
2. **Monitor Costs:** Use `/eggshen-config ai-images view` to track daily spending
3. **Adjust as Needed:** Increase limits for active servers, decrease for budget concerns
4. **Whitelist Wisely:** Only grant unlimited access to trusted contributors
5. **Communicate Limits:** Let users know about daily limits and resets

### For Users

1. **Be Specific:** Better prompts = better images
2. **Check Stats:** Use `/eggshen-config ai-images view` to see remaining quota
3. **Plan Usage:** Spread generations throughout the day
4. **Respect Limits:** Daily limits reset at midnight
5. **Report Issues:** Let admins know if you hit errors

### Cost Management

**Small Server (<20 active users):**
- User limit: 5-10/day
- Server limit: 25-50/day
- Expected cost: $1-2/day

**Medium Server (20-50 active users):**
- User limit: 10/day
- Server limit: 50-100/day
- Expected cost: $2-4/day

**Large Server (50+ active users):**
- User limit: 5-10/day
- Server limit: 100-200/day
- Expected cost: $4-8/day
- Consider whitelist for premium/contributor tier

---

## Troubleshooting

### "Please wait X minutes"
You're in cooldown period. Wait or ask admin to:
- Reset your usage: `/eggshen-config ai-images reset-user`
- Add you to whitelist: `/eggshen-config ai-images whitelist-add`

### "Daily limit reached"
You've hit your daily cap. Options:
- Wait until midnight (resets automatically)
- Ask admin to increase limit: `/eggshen-config ai-images user-daily-limit`
- Ask admin to reset your usage: `/eggshen-config ai-images reset-user`

### "Server has reached daily limit"
Server hit its cap. Admin options:
- Reset server usage: `/eggshen-config ai-images reset-guild`
- Increase limit: `/eggshen-config ai-images guild-daily-limit`
- Wait until midnight

### "OpenAI API error"
API issue (rate limiting, service outage, invalid key):
- Check OpenAI status page
- Verify API key in `.env` file
- Check OpenAI account has credits
- Wait a few minutes and retry

### "Could not find message"
For `/image message:` usage:
- Ensure username is spelled correctly (case-insensitive)
- User must have posted in last 100 messages
- Try using message ID instead
- Right-click message → Copy Message ID

### Image Quality Issues
- Be more specific in prompts
- Add style details (cinematic, photorealistic, etc.)
- For versus/matchup mode, add a custom `prompt:` parameter
- Examples: "dramatic lighting", "high contrast", "4K quality"

---

## Technical Details

### API Integration

- **Provider:** OpenAI
- **Model:** `gpt-image-2` (latest image generation model)
- **Format:**
  - Freeform/message mode: 1024x1024 (square)
  - Versus/matchup mode: 1792x1024 (wide)
- **Quality:** Medium (balance of quality and speed)
- **Generation Time:** 2-3 minutes average
- **Response Format:** Handles both URL and base64 responses automatically

### Content Policy Compliance

Prompts are designed to comply with OpenAI's content policy:
- Uses "inspired by themes" language for versus/matchup mode
- Avoids direct replication requests
- Creates "original artwork" not copies
- References concepts, not specific copyrighted works
- Content moderation handled by OpenAI's safety systems

### Storage & Display

- **Image Hosting:** OpenAI provides temporary URLs or base64 data
- **Discord Attachment:** Bot downloads/converts and sends as Discord attachment
- **Permanent Storage:** Discord CDN stores images permanently
- **Embed Display:**
  - Title: "🎨 AI Generated Image" or "🎨 Title1 vs Title2"
  - Image: The generated artwork
  - Footer: Your username
  - Timestamp: When it was created
  - **No prompt shown** - keeps it clean and private

### Tracking

Each generation logs:
- Guild ID and User ID
- Mode (image, versus-image, bracket-image)
- Metadata (titles, prompts, types)
- Cost ($0.04 per image)
- Timestamp

Console output example:
```
[AI Image] image - Guild: 123..., User: 456..., Cost: $0.04, 
User Today: 3, Guild Today: 12, Guild Cost Today: $0.48
```

---

## See Also

- [Tournament Brackets](./brackets/) - Full tournament system including matchup-aware AI images
- [Configuration Guide](configuration.md) - All bot configuration options
- [Rate Limiting](../features/rate-limiting.md) - General rate limiting system

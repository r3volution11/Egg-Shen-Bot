# Service Icons

This directory contains your custom service icons as SVG files.

## Available Icons

- `icon-imdb.svg` - IMDb icon
- `icon-letterboxd.svg` - Letterboxd icon  
- `icon-trakt.svg` - Trakt icon
- `icon-rt-critics.svg` - Rotten Tomatoes Critics icon
- `icon-rt-audience.svg` - Rotten Tomatoes Audience icon
- `icon-justwatch.svg` - JustWatch icon

## Usage

### In the Discord Bot

**By default**, the bot uses **text labels** (**IMDb:**, **Letterboxd**, **Trakt:**, etc.) which are clear and work everywhere without any setup.

**Optional**: You can upload these PNG icons as custom Discord server emojis to display them alongside the text labels for authentic service branding. This gives you the branded look (e.g., 🎬 **IMDb:** 7.2) but only works in servers where the emojis are uploaded. See instructions below.

### Setting Up Custom Emojis (Optional)

If you want to use your actual branded icons instead of Unicode emojis:

1. **Convert SVGs to PNG** (Discord doesn't support SVG emojis):
   - Use Preview (macOS): Open → Export as PNG at 128x128px
   - Or use an online converter like [CloudConvert](https://cloudconvert.com/svg-to-png)

2. **Upload to Discord**:
   - Server Settings → Emoji → Upload Emoji
   - Upload each PNG and name them: `imdb`, `letterboxd`, `trakt`, `rt_critics`, `rt_audience`, `justwatch`

3. **Get Emoji IDs**:
   - In Discord, type `\:imdb:` and send
   - Copy the result like `<:imdb:1234567890123456>`

4. **Add to .env**:
   ```env
   EMOJI_IMDB=<:imdb:1234567890123456>
   EMOJI_LETTERBOXD=<:letterboxd:9876543210987654>
   # ... etc for all services
   ```

5. **Restart the bot** to use your custom emojis!

**Note**: Custom emojis only work in the server where they're uploaded (unless you have Nitro). For bots used across multiple servers, Unicode emojis are more practical.

### Other Uses for These Icons

Your SVG icons are still valuable for:
- **Bot Avatar/Profile Picture** - Use one as your Discord bot's avatar
- **Documentation** - Include in README or wiki pages
- **Website/Dashboard** - If you build a web interface
- **Promotional Materials** - Social media, announcements, etc.
- **Bot Presence/Status** - Custom presence images

## Notes

Discord's embed markdown doesn't support embedding external images inline with text. Custom images can only be set as:
- Thumbnail (we use this for movie posters!)
- Main image
- Author icon
- Footer icon

But not within field values or description text where the ratings are displayed.

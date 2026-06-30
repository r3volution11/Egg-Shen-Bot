# Documentation Example Generator

Automatically generates example images for tournament commands by rendering actual Discord embeds in a mock Discord UI and taking screenshots.

## Overview

This script:
1. Imports the actual embed builders from `src/commands/bracket.js` and `src/handlers/buttonHandler.js`
2. Creates realistic mock tournament data
3. Renders embeds in a Discord-like HTML UI using Playwright
4. Takes screenshots and saves them to `docs/public/images/examples/tournaments/`

## Why Automated?

✅ **Always up-to-date** - Images regenerate automatically when code changes  
✅ **Uses real code** - Not mock-ups, actual production embeds  
✅ **Consistent styling** - Discord's exact visual design  
✅ **No manual work** - Runs automatically in CI/CD  
✅ **Easy to update** - Edit mock data in script to change examples  

## Running Locally

```bash
# Install dependencies (if not already installed)
npm install

# Generate examples
npm run docs:generate-examples
```

Images will be saved to: `docs/public/images/examples/tournaments/`

## Automatic Regeneration (CI/CD)

The GitHub Actions workflow (`.github/workflows/deploy-docs.yml`) automatically:
1. Detects changes to tournament source files or docs
2. Installs Playwright and Chromium
3. Runs the generator
4. Builds and deploys documentation with updated images

**Triggers on changes to:**
- `src/commands/bracket.js`
- `src/handlers/buttonHandler.js`
- `src/utils/bracketManager.js`
- `src/utils/tournamentUI.js`
- `docs/**`

## Generated Images

The script currently generates:

1. **voting-dashboard.png** - Personal voting dashboard with streak stats
2. **live-standings.png** - Live standings with progress bars
3. **tournament-status.png** - Tournament status embed
4. **round-complete.png** - Round completion results
5. **first-vote-welcome.png** - First-time voter welcome message

## Using in Documentation

Reference images in markdown files:

```markdown
![Voting Dashboard](./images/examples/tournaments/voting-dashboard.png)
```

## Customizing Examples

Edit `docs/generate-examples.js` to:
- Add new example images
- Modify mock data (tournament names, vote counts, etc.)
- Adjust styling or layout
- Add examples for other commands

## Technical Details

**Dependencies:**
- `playwright` - Headless browser automation
- `discord.js` - For EmbedBuilder imports

**Browser:**
- Uses Chromium (most reliable for screenshots)
- Launches headless (no visible window)
- 600x800 viewport (optimal for embed screenshots)

**HTML Rendering:**
- Custom Discord-like CSS styling
- Matches Discord's exact colors and fonts
- Supports all embed features (fields, thumbnails, footers, etc.)

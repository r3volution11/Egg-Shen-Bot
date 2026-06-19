# GitHub Pages Documentation Setup Guide

## Overview

GitHub Pages (accessible at `https://r3volution11.github.io/Egg-Shen-Bot/`) allows you to host a documentation website directly from your repository.

## Options for Documentation Sites

### 1. **VitePress** (Recommended - Modern & Fast)
- Vue.js-based static site generator
- Very fast, clean design
- Great for API documentation
- Markdown-based with Vue components

### 2. **MkDocs with Material Theme**
- Python-based
- Beautiful Material Design theme
- Excellent for technical documentation
- Simple to configure

### 3. **Docusaurus** (Facebook's tool)
- React-based
- Feature-rich
- Good for versioned docs
- Heavier but very polished

### 4. **Jekyll** (GitHub's default)
- Ruby-based
- Native GitHub Pages support
- Themes available
- Older but stable

## Recommended Setup: VitePress

### Step 1: Create Documentation Structure

```bash
# In your project root
npm install -D vitepress
mkdir docs
cd docs
```

### Step 2: Initialize VitePress

```bash
npx vitepress init
```

Answer prompts:
- Site title: `Egg Shen Bot Documentation`
- Description: `Comprehensive guide for the Egg Shen Discord bot`
- Theme: `Default Theme + Customization`

### Step 3: Create Documentation Pages

```
docs/
├── .vitepress/
│   └── config.js          # Configuration
├── index.md               # Homepage
├── getting-started.md     # Setup guide
├── commands/
│   ├── index.md           # Commands overview
│   ├── search.md          # Search commands
│   ├── watch-party.md     # Timer & watch history
│   ├── moderation.md      # Moderation tools
│   └── configuration.md   # Admin configuration
├── features/
│   ├── rate-limiting.md   # Rate limiting docs
│   ├── statistics.md      # Stats tracking
│   └── notifications.md   # Notifications
└── api/
    └── reference.md       # API/technical reference
```

### Step 4: Configure VitePress

**docs/.vitepress/config.js:**

```javascript
import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Egg Shen Bot',
  description: 'Movie, TV, and gaming Discord bot documentation',
  base: '/Egg-Shen-Bot/',
  
  themeConfig: {
    logo: '/logo.png', // Add your logo
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/getting-started' },
      { text: 'Commands', link: '/commands/' },
      { text: 'GitHub', link: 'https://github.com/r3volution11/Egg-Shen-Bot' }
    ],
    
    sidebar: {
      '/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Introduction', link: '/getting-started' },
            { text: 'Installation', link: '/installation' },
            { text: 'Configuration', link: '/configuration' }
          ]
        },
        {
          text: 'Commands',
          items: [
            { text: 'Overview', link: '/commands/' },
            { text: 'Search Commands', link: '/commands/search' },
            { text: 'Watch Parties', link: '/commands/watch-party' },
            { text: 'Moderation', link: '/commands/moderation' },
            { text: 'Admin Config', link: '/commands/configuration' }
          ]
        },
        {
          text: 'Features',
          items: [
            { text: 'Rate Limiting', link: '/features/rate-limiting' },
            { text: 'Statistics', link: '/features/statistics' },
            { text: 'Notifications', link: '/features/notifications' }
          ]
        },
        {
          text: 'Reference',
          items: [
            { text: 'API Reference', link: '/api/reference' },
            { text: 'Changelog', link: '/changelog' }
          ]
        }
      ]
    },
    
    socialLinks: [
      { icon: 'github', link: 'https://github.com/r3volution11/Egg-Shen-Bot' }
    ],
    
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024-present'
    },
    
    search: {
      provider: 'local'
    }
  }
})
```

### Step 5: Add NPM Scripts

**package.json:**

```json
{
  "scripts": {
    "docs:dev": "vitepress dev docs",
    "docs:build": "vitepress build docs",
    "docs:preview": "vitepress preview docs"
  }
}
```

### Step 6: Create GitHub Actions Workflow

**Create `.github/workflows/deploy-docs.yml`:**

```yaml
name: Deploy Documentation

on:
  push:
    branches:
      - main

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 20
          cache: npm
      
      - run: npm ci
      - run: npm run docs:build
      
      - uses: actions/upload-pages-artifact@v2
        with:
          path: docs/.vitepress/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v2
```

### Step 7: Enable GitHub Pages

1. Go to your repository on GitHub
2. Click **Settings** → **Pages**
3. Under **Source**, select **GitHub Actions**
4. Save

### Step 8: Push and Deploy

```bash
git add .
git commit -m "Add VitePress documentation"
git push origin main
```

Your docs will be live at: `https://r3volution11.github.io/Egg-Shen-Bot/`

## Alternative: Simple GitHub Pages (No Build Step)

If you want something simpler without a build process:

### Option A: Use Jekyll Directly

1. Create `docs/` folder
2. Add `docs/_config.yml`:

```yaml
title: Egg Shen Bot
description: Discord bot for movies, TV, and gaming
theme: jekyll-theme-cayman
```

3. Add markdown files in `docs/`
4. In GitHub Settings → Pages, select `main` branch → `/docs` folder

### Option B: Just Markdown

GitHub Pages can render README files directly:

1. Create organized folder structure in `docs/`
2. Use standard markdown
3. Enable GitHub Pages from Settings
4. Navigate using folder structure

## Quick Start Commands

```bash
# Install VitePress
npm install -D vitepress

# Create docs folder
mkdir docs

# Initialize
npx vitepress init

# Start dev server
npm run docs:dev

# Build for production
npm run docs:build
```

## Recommended Content Structure

### Homepage (docs/index.md)
- Hero section with bot overview
- Key features
- Quick start links
- Invite bot button

### Getting Started
- Prerequisites
- Installation steps
- Basic configuration
- First commands

### Commands Section
Each command category gets its own page:
- Search commands (/movie, /tv, /episode, /game)
- Watch party features (/timer, /watched)
- Random picks (/random)
- Statistics (/stats)
- Admin configuration (/eggshen-config)

### Features Section
In-depth feature documentation:
- Rate limiting and anti-abuse
- Moderation tools
- Watch history tracking
- Statistics and analytics
- Notifications

### API Reference
Technical documentation for:
- Configuration file structure
- Rate limiting system
- Storage/database schema
- Extension points

## Next Steps

1. Install VitePress: `npm install -D vitepress`
2. Create initial docs structure
3. Migrate content from README.md
4. Set up GitHub Actions
5. Enable GitHub Pages
6. Iterate on content

Would you like me to:
- Create the initial VitePress setup now?
- Generate the first few documentation pages?
- Set up the GitHub Actions workflow?

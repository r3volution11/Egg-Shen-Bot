import { defineConfig } from 'vitepress'
import { buildPageHead } from './seo.js'
import { kitIconsPlugin } from './kitIcons.js'

// One sidebar, grouped by what a page is about and who it's for. It stays a
// single array: seo.js walks it for each page's breadcrumbs, and takes the
// first entry that links a page, so list each page once. A '#anchor' item
// (/random…, the Watchlist, Status Quotes) is fine: it points into a page
// listed elsewhere, and neither seo.js nor the sidebar counts it as the page.
//
// Groups with `collapsed` start closed (true) or open (false) and can be
// folded; VitePress opens the group holding the page you're on either way.
const sidebar = [
  {
    text: 'Start Here',
    items: [
      { text: 'Getting Started', link: '/getting-started' },
      { text: 'Ask the Bot', link: '/commands/ask' },
      { text: 'Every Command', link: '/commands/' }
    ]
  },
  {
    text: 'Look It Up',
    items: [
      { text: 'Search Commands', link: '/commands/search' },
      { text: '/random, /recommend, /similar', link: '/commands/#discovery-commands' },
      { text: 'Statistics', link: '/features/statistics' }
    ]
  },
  {
    text: 'Watch Parties',
    items: [
      { text: 'Watch Party Commands', link: '/commands/watch-party' },
      { text: 'The Watchlist', link: '/commands/watch-party#watchlist' },
      { text: 'Watch History', link: '/features/watch-history' },
      { text: 'Event Requests', link: '/features/event-requests' },
      { text: 'What the Bot Posts on Its Own', link: '/features/notifications' }
    ]
  },
  {
    text: 'Tournaments & Surveys',
    collapsed: true,
    items: [
      {
        text: 'Quick Guides',
        link: '/guides/tournaments/',
        collapsed: false,
        items: [
          { text: 'Movie Night Bracket', link: '/guides/tournaments/movie-night' },
          { text: 'One Matchup at a Time', link: '/guides/tournaments/one-at-a-time' },
          { text: '32-Title Bracket', link: '/guides/tournaments/big-bracket' },
          { text: 'Groups Tournament', link: '/guides/tournaments/groups' },
          { text: 'From a Spreadsheet', link: '/guides/tournaments/from-a-spreadsheet' },
          { text: 'Seeded Bracket', link: '/guides/tournaments/seeded' },
          { text: 'Sports-Style Tournaments', link: '/guides/tournaments/sports-styles' },
          { text: 'Tournament FAQ', link: '/guides/tournaments/faq' }
        ]
      },
      { text: 'How Tournaments Work', link: '/commands/brackets/' },
      { text: 'Setup & Group Stage', link: '/commands/brackets/setup' },
      { text: 'Setup Form & Templates', link: '/commands/brackets/import' },
      { text: 'Knockout Rounds', link: '/commands/brackets/knockout' },
      { text: 'Tips & Strategies', link: '/commands/brackets/tips' },
      { text: 'Bracket Command Reference', link: '/commands/brackets/commands' },
      { text: 'Surveys', link: '/commands/social' }
    ]
  },
  {
    text: 'Games & Trivia',
    collapsed: true,
    items: [
      { text: 'Games & Scores', link: '/commands/games' },
      {
        text: 'Quick Guides',
        link: '/guides/games/',
        collapsed: false,
        items: [
          { text: 'Play the Games', link: '/guides/games/play' },
          { text: 'Fight a Siege', link: '/guides/games/siege' },
          { text: 'Games FAQ', link: '/guides/games/faq' }
        ]
      },
      {
        // New game pages (the rest of Big Trouble) go here
        text: 'The Rules',
        collapsed: false,
        items: [
          { text: 'Playing & Points', link: '/commands/games-playing' },
          { text: 'Your Card & the Leaderboard', link: '/commands/games-card' },
          { text: 'Items, Prizes & Titles', link: '/commands/games-rewards' },
          { text: 'Twists & Happenings', link: '/commands/games-happenings' },
          { text: 'Siege', link: '/commands/games-siege' },
          { text: 'Six-Demon Bag', link: '/commands/games-magic' }
        ]
      },
      { text: 'Settings for Admins', link: '/commands/games-settings' },
      { text: 'Escape Velocity', link: '/commands/escape-velocity' }
    ]
  },
  {
    text: 'More',
    items: [
      { text: 'AI Images', link: '/commands/ai-images' },
      { text: 'Status Quotes', link: '/commands/social#status-quote-commands' }
    ]
  },
  {
    text: 'Server Admins',
    items: [
      { text: 'Setting Up Your Server', link: '/configuration' },
      { text: 'Every Setting', link: '/commands/configuration' },
      { text: 'Moderation Tools', link: '/features/moderation-tools' },
      { text: 'Rate Limiting', link: '/features/rate-limiting' },
      { text: 'Moderation Commands', link: '/commands/moderation' }
    ]
  },
  {
    text: 'Self-Hosting',
    collapsed: true,
    items: [
      { text: 'Installation', link: '/installation' },
      { text: 'API Keys & .env', link: '/api-keys' },
      { text: 'Logging', link: '/features/logging' },
      { text: 'Developer Reference', link: '/api/reference' }
    ]
  },
  {
    text: 'About',
    collapsed: true,
    items: [
      { text: 'Changelog', link: '/changelog' },
      { text: 'Acknowledgements', link: '/acknowledgements' }
    ]
  }
]

export default defineConfig({
  // The site's name, appended to every page's title by VitePress ("Siege |
  // Egg Shen Discord Bot"). Page titles therefore never carry the brand
  // themselves (tests/docs-titles.test.js): a doubled name reads as keyword
  // stuffing to search engines. Doug's name for the site, 2026-11-07.
  title: 'Egg Shen Discord Bot',
  description: 'Discord bot for movies, TV shows, games, and watch parties',
  base: '/',
  
  sitemap: {
    hostname: 'https://eggshenbot.com'
  },

  // Real "Updated" dates on each page, and dateModified in its structured data
  lastUpdated: true,

  // The bot's drawn emoji kit beside game words (kit: true in a page's
  // frontmatter) and before chosen headings (kitHeadings): see kitIcons.js
  markdown: {
    config: (md) => md.use(kitIconsPlugin)
  },

  // Per-page canonical URL, social tags and schema.org JSON-LD (see seo.js)
  transformHead: (ctx) => buildPageHead(ctx, sidebar),
  
  head: [
    // Favicons
    ['link', { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' }],
    ['link', { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' }],
    
    // Google Analytics
    ['script', { async: '', src: 'https://www.googletagmanager.com/gtag/js?id=G-ZYDW78PVTF' }],
    ['script', {}, `
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-ZYDW78PVTF');
    `],
    
    // GitHub Link Tracking
    ['script', {}, `
      // Add class to GitHub links and track clicks
      if (typeof window !== 'undefined') {
        function trackGitHubLinks() {
          // Find all links to the GitHub repository
          const githubLinks = document.querySelectorAll('a[href*="github.com/r3volution11/Egg-Shen-Bot"]');
          
          githubLinks.forEach(function(link) {
            // Skip if already processed
            if (link.classList.contains('github-repo-link')) return;
            
            // Add tracking class
            link.classList.add('github-repo-link');
            
            // Add click event listener
            link.addEventListener('click', function(e) {
              const href = link.getAttribute('href');
              const linkText = link.textContent || link.innerText || 'Unknown';
              const linkType = href.includes('/issues') ? 'issues' : 
                              href.includes('/discussions') ? 'discussions' : 
                              href.includes('clone') ? 'clone' : 
                              href.includes('/releases') ? 'releases' : 
                              'repository';
              
              // Send event to GA4
              if (typeof gtag !== 'undefined') {
                gtag('event', 'github_repo_click', {
                  'link_url': href,
                  'link_text': linkText,
                  'link_type': linkType,
                  'page_location': window.location.href,
                  'page_title': document.title
                });
              }
            });
          });
        }
        
        // Run on initial load
        window.addEventListener('DOMContentLoaded', trackGitHubLinks);
        
        // Re-run on VitePress route changes (SPA navigation)
        if (typeof window !== 'undefined') {
          window.addEventListener('load', function() {
            // VitePress uses Vue Router, listen for route changes
            const observer = new MutationObserver(trackGitHubLinks);
            observer.observe(document.body, { childList: true, subtree: true });
          });
        }
      }
    `],
    
    // SEO Meta Tags
    ['meta', { name: 'keywords', content: 'Discord bot, movie bot, TV show bot, watch party, Discord entertainment, movie ratings, IMDb, Trakt, Letterboxd, TMDB, video game bot, board game bot' }],
    ['meta', { name: 'author', content: 'Egg Shen Bot' }],
    ['meta', { name: 'robots', content: 'index, follow' }],
    
    // OpenGraph Tags for Social Media
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'Egg Shen Discord Bot' }],
    ['meta', { property: 'og:image', content: 'https://eggshenbot.com/og-image.jpg' }],
    ['meta', { property: 'og:image:width', content: '1200' }],
    ['meta', { property: 'og:image:height', content: '630' }],
    ['meta', { property: 'og:image:alt', content: 'Egg Shen Bot Logo' }],
    
    // Twitter Card Tags
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:image', content: 'https://eggshenbot.com/og-image.jpg' }],
    ['meta', { name: 'twitter:image:alt', content: 'Egg Shen Bot Logo' }]
  ],
  
  themeConfig: {
    logo: '/logo.png',
    siteTitle: 'Egg Shen Discord Bot',
    
    outline: {
      level: [2, 3]
    },
    
    lastUpdated: {
      text: 'Updated',
      formatOptions: {
        dateStyle: 'medium',
        timeStyle: 'short'
      }
    },
    
    // Six items, with the GitHub icon after them. The logo is the way home
    nav: [
      { text: 'Getting Started', link: '/getting-started' },
      {
        text: 'Tournaments',
        // Every tournament page lights it, not only the ones listed
        activeMatch: '^/(commands/brackets|guides/tournaments)/|^/commands/social$',
        items: [
          {
            text: 'Guides',
            items: [
              { text: 'Quick Guides', link: '/guides/tournaments/' },
              { text: 'Movie Night Bracket', link: '/guides/tournaments/movie-night' },
              { text: 'One Matchup at a Time', link: '/guides/tournaments/one-at-a-time' },
              { text: 'Groups Tournament', link: '/guides/tournaments/groups' },
              { text: 'Seeded Bracket', link: '/guides/tournaments/seeded' },
              { text: 'Sports-Style Tournaments', link: '/guides/tournaments/sports-styles' },
              { text: 'Tournament FAQ', link: '/guides/tournaments/faq' }
            ]
          },
          {
            text: 'Reference',
            items: [
              { text: 'How Tournaments Work', link: '/commands/brackets/' },
              { text: 'Setup & Group Stage', link: '/commands/brackets/setup' },
              { text: 'Setup Form & Templates', link: '/commands/brackets/import' },
              { text: 'Knockout Rounds', link: '/commands/brackets/knockout' },
              { text: 'Bracket Command Reference', link: '/commands/brackets/commands' }
            ]
          },
          { text: 'Surveys', link: '/commands/social' }
        ]
      },
      {
        text: 'Games',
        activeMatch: '^/(commands|guides)/games|^/commands/escape-velocity$',
        items: [
          {
            text: 'The games',
            items: [
              { text: 'Games & Scores', link: '/commands/games' },
              { text: 'Playing & Points', link: '/commands/games-playing' },
              { text: 'Your Card & the Leaderboard', link: '/commands/games-card' },
              { text: 'Items, Prizes & Titles', link: '/commands/games-rewards' },
              { text: 'Twists & Happenings', link: '/commands/games-happenings' },
              { text: 'Siege', link: '/commands/games-siege' },
              { text: 'Six-Demon Bag', link: '/commands/games-magic' },
              { text: 'Settings for Admins', link: '/commands/games-settings' }
            ]
          },
          {
            text: 'Guides',
            items: [
              { text: 'Play the Games', link: '/guides/games/play' },
              { text: 'Fight a Siege', link: '/guides/games/siege' },
              { text: 'Games FAQ', link: '/guides/games/faq' }
            ]
          },
          {
            text: 'Trivia',
            items: [
              { text: 'Escape Velocity', link: '/commands/escape-velocity' }
            ]
          }
        ]
      },
      { text: 'Commands', link: '/commands/' },
      {
        text: 'Admins',
        items: [
          {
            text: 'Setting up',
            items: [
              { text: 'Setting Up Your Server', link: '/configuration' },
              { text: 'Every Setting', link: '/commands/configuration' },
              { text: 'Game Settings', link: '/commands/games-settings' }
            ]
          },
          {
            text: 'Moderation',
            items: [
              { text: 'Moderation Tools', link: '/features/moderation-tools' },
              { text: 'Rate Limiting', link: '/features/rate-limiting' },
              { text: 'Moderation Commands', link: '/commands/moderation' }
            ]
          },
          {
            text: 'Watch parties',
            items: [
              { text: 'Event Requests', link: '/features/event-requests' },
              { text: 'What the Bot Posts on Its Own', link: '/features/notifications' }
            ]
          }
        ]
      },
      {
        text: 'Self-Hosting',
        items: [
          { text: 'Getting Started', link: '/getting-started' },
          { text: 'Installation', link: '/installation' },
          { text: 'API Keys & .env', link: '/api-keys' },
          { text: 'Logging', link: '/features/logging' },
          { text: 'Developer Reference', link: '/api/reference' },
          { text: 'Changelog', link: '/changelog' }
        ]
      }
    ],
    
    sidebar,
    
    socialLinks: [
      { icon: 'github', link: 'https://github.com/r3volution11/Egg-Shen-Bot' }
    ],
    
    footer: {
      message: 'Egg Shen — A Discord bot for movie, TV, video and board gaming, and book communities.',
      copyright: `Copyright © ${new Date().getFullYear()} Doug C. Hardester (known as r3volution11)`
    },
    
    search: {
      provider: 'local'
    },
    
    editLink: {
      pattern: 'https://github.com/r3volution11/Egg-Shen-Bot/edit/main/docs/:path',
      text: 'Edit this page on GitHub'
    }
  }
})

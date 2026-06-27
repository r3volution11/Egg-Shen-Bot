import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Egg Shen Bot',
  description: 'Discord bot for movies, TV shows, games, and watch parties',
  base: '/',
  
  sitemap: {
    hostname: 'https://eggshenbot.com'
  },
  
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
    ['link', { rel: 'canonical', href: 'https://eggshenbot.com/' }],
    
    // OpenGraph Tags for Social Media
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'Egg Shen Bot' }],
    ['meta', { property: 'og:title', content: 'Egg Shen Bot - Your Discord Movie & TV Companion' }],
    ['meta', { property: 'og:description', content: 'Discord bot for searching movies, TV shows, games, and hosting watch parties with comprehensive ratings from IMDb, Letterboxd, Trakt, and more.' }],
    ['meta', { property: 'og:url', content: 'https://eggshenbot.com/' }],
    ['meta', { property: 'og:image', content: 'https://eggshenbot.com/og-image.jpg' }],
    ['meta', { property: 'og:image:width', content: '1200' }],
    ['meta', { property: 'og:image:height', content: '630' }],
    ['meta', { property: 'og:image:alt', content: 'Egg Shen Bot Logo' }],
    
    // Twitter Card Tags
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:title', content: 'Egg Shen Bot - Your Discord Movie & TV Companion' }],
    ['meta', { name: 'twitter:description', content: 'Discord bot for searching movies, TV shows, games, and hosting watch parties with comprehensive ratings from IMDb, Letterboxd, Trakt, and more.' }],
    ['meta', { name: 'twitter:image', content: 'https://eggshenbot.com/og-image.jpg' }],
    ['meta', { name: 'twitter:image:alt', content: 'Egg Shen Bot Logo' }],
    
    // Schema.org JSON-LD for SoftwareApplication
    ['script', { type: 'application/ld+json' }, JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      'name': 'Egg Shen Bot',
      'description': 'Discord bot for searching movies, TV shows, games, and hosting watch parties with comprehensive ratings from IMDb, Letterboxd, Trakt, Rotten Tomatoes, JustWatch, Metacritic, RAWG, and BoardGameGeek',
      'url': 'https://eggshenbot.com/',
      'applicationCategory': 'CommunicationApplication',
      'operatingSystem': 'Discord',
      'offers': {
        '@type': 'Offer',
        'price': '0',
        'priceCurrency': 'USD'
      },
      'screenshot': 'https://eggshenbot.com/og-image.jpg',
      'aggregateRating': {
        '@type': 'AggregateRating',
        'ratingValue': '5',
        'ratingCount': '1',
        'bestRating': '5',
        'worstRating': '1'
      },
      'author': {
        '@type': 'Organization',
        'name': 'Egg Shen Bot',
        'url': 'https://eggshenbot.com/'
      },
      'softwareVersion': '1.0.0',
      'datePublished': '2024-01-01',
      'releaseNotes': 'https://eggshenbot.com/changelog',
      'installUrl': 'https://eggshenbot.com/getting-started',
      'featureList': [
        'Movie and TV show search with TMDB integration',
        'Video game search with RAWG integration',
        'Board game search with BoardGameGeek integration',
        'Comprehensive ratings from IMDb, Letterboxd, Trakt, Rotten Tomatoes, JustWatch, Metacritic',
        'Watch party timer management',
        'Server-level watch history tracking',
        'Advanced rate limiting and moderation tools',
        'Statistics tracking',
        'Per-server configuration'
      ]
    })]
  ],
  
  themeConfig: {
    logo: '/logo.png',
    siteTitle: 'Egg Shen Bot',
    
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
    
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Getting Started', link: '/getting-started' },
      { text: 'Commands', link: '/commands/' },
      { text: 'Features', link: '/features/rate-limiting' },
      { text: 'GitHub', link: 'https://github.com/r3volution11/Egg-Shen-Bot' }
    ],
    
    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'Getting Started', link: '/getting-started' },
          { text: 'Installation', link: '/installation' },
          { text: 'API Keys Guide', link: '/api-keys' },
          { text: 'Configuration', link: '/configuration' }
        ]
      },
      {
        text: 'Commands',
        items: [
          { text: 'Overview', link: '/commands/' },
          { text: 'Search Commands', link: '/commands/search' },
          {
            text: 'Tournament Brackets',
            collapsed: false,
            items: [
              { text: 'Overview & Quick Start', link: '/commands/brackets/' },
              { text: 'Setup & Group Stage', link: '/commands/brackets/setup' },
              { text: 'Knockout Rounds', link: '/commands/brackets/knockout' },
              { text: 'Command Reference', link: '/commands/brackets/commands' },
              { text: 'Tips & Strategies', link: '/commands/brackets/tips' }
            ]
          },
          { text: 'AI Image Generation', link: '/commands/ai-images' },
          { text: 'Watch Parties', link: '/commands/watch-party' },
          { text: 'Social Commands', link: '/commands/social' },
          { text: 'Admin Configuration', link: '/commands/configuration' },
          { text: 'Moderation', link: '/commands/moderation' }
        ]
      },
      {
        text: 'Features',
        items: [
          { text: 'Rate Limiting', link: '/features/rate-limiting' },
          { text: 'Moderation Tools', link: '/features/moderation-tools' },
          { text: 'Watch History', link: '/features/watch-history' },
          { text: 'Statistics', link: '/features/statistics' },
          { text: 'Notifications', link: '/features/notifications' }
        ]
      },
      {
        text: 'Reference',
        items: [
          { text: 'API Reference', link: '/api/reference' },
          { text: 'Changelog', link: '/changelog' },
          { text: 'Acknowledgements', link: '/acknowledgements' }
        ]
      }
    ],
    
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

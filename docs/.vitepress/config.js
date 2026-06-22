import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Egg Shen Bot',
  description: 'Discord bot for movies, TV shows, games, and watch parties',
  base: '/Egg-Shen-Bot/',
  
  head: [
    ['link', { rel: 'icon', href: '/Egg-Shen-Bot/favicon.ico' }]
  ],
  
  themeConfig: {
    logo: '/logo.png',
    siteTitle: 'Egg Shen Bot',
    
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
          { text: 'Watch Parties', link: '/commands/watch-party' },
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
          { text: 'Changelog', link: '/changelog' }
        ]
      }
    ],
    
    socialLinks: [
      { icon: 'github', link: 'https://github.com/r3volution11/Egg-Shen-Bot' }
    ],
    
    footer: {
      message: 'A Discord bot for movie, TV, and gaming communities.',
      copyright: 'Copyright © 2024-present'
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

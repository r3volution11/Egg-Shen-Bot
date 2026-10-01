// Per-page SEO and schema.org structured data, wired in through config.js's
// transformHead.
//
// Every page gets its own canonical URL, Open Graph/Twitter tags and a
// JSON-LD @graph: the site, its author, the bot (a SoftwareApplication), the
// page itself (TechArticle, or WebPage for home) and its breadcrumbs. A page
// can add more in frontmatter:
//
//   howto:   { timeText, totalTime, steps: [{ name, text }] }  → HowTo
//            (shown on the page by <QuickSteps />)
//   faq:     [{ q, a }]                                      → FAQPage
//            (shown on the page by <FaqList />)
//
// Both are written once and rendered by components from the same data, so the
// structured data always matches what readers see — search engines penalise
// markup that describes content the page doesn't show.
//
// scripts/check-structured-data.js verifies the built site against this.

import { readFileSync } from 'fs'
import { inlineToText } from './theme/inline.js'

export const SITE = 'https://eggshenbot.com'
const SITE_NAME = 'Egg Shen Bot'
const SITE_DESCRIPTION = 'Discord bot for movie, TV, video game, board game and book communities: search with ratings from IMDb, Letterboxd, Trakt and more, watch-party timers, and community tournaments.'

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))

const ids = {
  website: `${SITE}/#website`,
  author: `${SITE}/#author`,
  app: `${SITE}/#app`,
}

/** docs/commands/brackets/index.md → https://eggshenbot.com/commands/brackets/ (matches the sitemap) */
export function pageUrl(relativePath) {
  const path = relativePath
    .replace(/(^|\/)index\.md$/, '$1')
    .replace(/\.md$/, '.html')
  return `${SITE}/${path}`
}

/** The sidebar link form of a page: /commands/brackets/ or /commands/brackets/setup */
function sidebarPath(relativePath) {
  return '/' + relativePath.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '')
}

/**
 * Breadcrumbs from the sidebar: Home → each sidebar group the page sits in
 * (linked to that group's first page) → the page.
 */
function breadcrumbTrail(sidebar, relativePath) {
  const target = sidebarPath(relativePath)
  const firstLink = (group) => group.link || group.items?.map(firstLink).find(Boolean)

  const walk = (items, ancestors) => {
    for (const item of items || []) {
      if (item.link && item.link.replace(/\.html$/, '') === target) return ancestors
      if (item.items) {
        const found = walk(item.items, [...ancestors, { name: item.text, path: firstLink(item) }])
        if (found) return found
      }
    }
    return null
  }

  const groups = (walk(sidebar, []) || []).filter(g => g.path && g.path !== target)
  // A group whose first page is a sibling group's page ("Guides" →
  // "Tournament Quick Guides", same URL) would list one place twice; keep
  // the deeper, more specific name
  return groups.filter((g, i) => groups[i + 1]?.path !== g.path)
}

const toUrl = (path) => `${SITE}${path.endsWith('/') ? path : `${path}.html`}`

/** "Tournament Brackets - Egg Shen Bot" → "Tournament Brackets" */
function cleanTitle(title) {
  return String(title || SITE_NAME).replace(/\s+[-|–]\s+Egg Shen Bot$/i, '').trim()
}

function headHas(head, attr, value) {
  return (head || []).some(([, attrs]) => attrs && attrs[attr] === value)
}

/**
 * @param {object} ctx - VitePress transformHead context
 * @param {Array} sidebar - themeConfig.sidebar
 * @returns {Array} head entries to add
 */
export function buildPageHead({ pageData }, sidebar) {
  if (pageData.isNotFound) return []

  const fm = pageData.frontmatter || {}
  const url = pageUrl(pageData.relativePath)
  const title = cleanTitle(fm.title || pageData.title)
  const description = pageData.description || fm.description || SITE_DESCRIPTION
  const isHome = pageData.relativePath === 'index.md'
  const fmHead = fm.head || []

  const head = []
  // A single site-wide canonical used to point every page at the home page,
  // telling search engines the whole site was one page.
  if (!fmHead.some(([tag, attrs]) => tag === 'link' && attrs?.rel === 'canonical')) {
    head.push(['link', { rel: 'canonical', href: url }])
  }
  const meta = [
    ['property', 'og:url', url],
    ['property', 'og:title', isHome ? `${SITE_NAME} - Your Discord Movie & TV Companion` : `${title} - ${SITE_NAME}`],
    ['property', 'og:description', description],
    ['name', 'twitter:title', isHome ? `${SITE_NAME} - Your Discord Movie & TV Companion` : `${title} - ${SITE_NAME}`],
    ['name', 'twitter:description', description],
  ]
  for (const [attr, key, content] of meta) {
    if (!headHas(fmHead, attr, key)) head.push(['meta', { [attr]: key, content }])
  }

  // ── JSON-LD ──
  const crumbs = breadcrumbTrail(sidebar, pageData.relativePath)
  const breadcrumb = {
    '@type': 'BreadcrumbList',
    '@id': `${url}#breadcrumb`,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
      ...crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 2, name: c.name, item: toUrl(c.path) })),
      ...(isHome ? [] : [{ '@type': 'ListItem', position: crumbs.length + 2, name: title }]),
    ],
  }

  const page = {
    '@type': fm.faq ? ['TechArticle', 'FAQPage'] : isHome ? 'WebPage' : 'TechArticle',
    '@id': `${url}#webpage`,
    url,
    name: title,
    ...(isHome ? {} : { headline: title }),
    description,
    inLanguage: 'en',
    isPartOf: { '@id': ids.website },
    about: { '@id': ids.app },
    author: { '@id': ids.author },
    publisher: { '@id': ids.author },
    breadcrumb: { '@id': `${url}#breadcrumb` },
    ...(pageData.lastUpdated ? { dateModified: new Date(pageData.lastUpdated).toISOString() } : {}),
    ...(fm.faq ? {
      mainEntity: fm.faq.map(item => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: inlineToText(item.a) },
      })),
    } : {}),
  }

  const graph = [
    {
      '@type': 'WebSite',
      '@id': ids.website,
      url: `${SITE}/`,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      inLanguage: 'en',
      publisher: { '@id': ids.author },
    },
    {
      '@type': 'Person',
      '@id': ids.author,
      name: 'Doug C. Hardester',
      alternateName: 'r3volution11',
      url: 'https://github.com/r3volution11',
    },
    {
      '@type': 'SoftwareApplication',
      '@id': ids.app,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      url: `${SITE}/`,
      applicationCategory: 'EntertainmentApplication',
      applicationSubCategory: 'Discord bot',
      operatingSystem: 'Discord (desktop, web, iOS, Android)',
      softwareVersion: pkg.version,
      license: `https://opensource.org/licenses/${pkg.license}`,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      author: { '@id': ids.author },
      sameAs: ['https://github.com/r3volution11/Egg-Shen-Bot'],
      installUrl: `${SITE}/getting-started.html`,
      releaseNotes: `${SITE}/changelog.html`,
      screenshot: `${SITE}/og-image.jpg`,
      featureList: [
        'Movie and TV search with ratings from IMDb, Letterboxd, Trakt, Rotten Tomatoes and Metacritic',
        'Video game, board game and book search',
        'Watch-party timers with runtime detection',
        'Community tournaments: brackets and group stages with button voting',
        'Server watch history, watchlists and statistics',
        'Event requests from a website form',
        'Per-server configuration and moderation tools',
      ],
    },
    page,
    breadcrumb,
  ]

  if (fm.howto?.steps?.length) {
    graph.push({
      '@type': 'HowTo',
      '@id': `${url}#howto`,
      name: fm.howto.name || title,
      description,
      ...(fm.howto.totalTime ? { totalTime: fm.howto.totalTime } : {}),
      tool: [{ '@type': 'HowToTool', name: 'Discord, with Egg Shen Bot in your server' }],
      mainEntityOfPage: { '@id': `${url}#webpage` },
      step: fm.howto.steps.map((s, i) => ({
        '@type': 'HowToStep',
        position: i + 1,
        name: s.name,
        text: inlineToText(s.text),
        url: `${url}#step-${i + 1}`,
      })),
    })
  }

  head.push(['script', { type: 'application/ld+json' }, JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })])
  return head
}

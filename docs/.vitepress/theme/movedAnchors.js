// Sections that moved to another page, by their old address.
//
// Links to a section are everywhere we can't edit: the changelog, GitHub
// release notes, and the citations and /how-to-play cards of bots still
// running an older version (each operator hosts their own copy, and its
// /eggshen-ask cites its own docs' anchors on eggshenbot.com). So a page
// that loses sections stays, and keeps every old anchor twice over: a
// hidden <div id> marker on the old page (no JavaScript needed), and this
// map, which takes a reader straight to the section itself.
//
// - /commands/games: until 2.74 every game rule was on this one page.
// - /commands/social: until the docs were regrouped (after 2.76.0) it also
//   held /foodfight, /doom, /rescue and /potion. How each plays went to
//   Playing & Points, and each game's own lines to Settings for Admins.
// - /commands/brackets/: its Quick FAQ joined the Tournament FAQ, whose
//   questions /eggshen-ask ranks higher (they're frontmatter).
//
// tests/docs-moved-anchors.test.js renders the docs and proves every old
// anchor is still on its old page and every new address is a real page
// and heading. Never remove an entry: an old link is live forever.

export const MOVED = {
  '/commands/games': {
    // Playing & points
    points: '/commands/games-playing#points',
    shields: '/commands/games-playing#shields',
    'bonus-points': '/commands/games-playing#bonus-points',
    limits: '/commands/games-playing#limits',
    // Items, prizes & titles
    'the-glovebox-and-items': '/commands/games-rewards#the-glovebox-and-items',
    'the-items': '/commands/games-rewards#the-items',
    'using-an-item': '/commands/games-rewards#using-an-item',
    defences: '/commands/games-rewards#defences',
    prizes: '/commands/games-rewards#prizes',
    'two-prizes-a-day': '/commands/games-rewards#two-prizes-a-day',
    'seeing-your-progress': '/commands/games-rewards#seeing-your-progress',
    titles: '/commands/games-rewards#titles',
    'choosing-the-title-you-show': '/commands/games-rewards#choosing-the-title-you-show',
    'nights-in-a-row': '/commands/games-rewards#nights-in-a-row',
    tiers: '/commands/games-rewards#tiers',
    'the-night-light': '/commands/games-rewards#the-night-light',
    // Twists & happenings
    twists: '/commands/games-happenings#twists',
    'the-16-twists': '/commands/games-happenings#the-18-twists',
    statuses: '/commands/games-happenings#statuses',
    'plot-twist': '/commands/games-happenings#plot-twist',
    happenings: '/commands/games-happenings#happenings',
    'the-random-ones': '/commands/games-happenings#the-random-ones',
    'the-calendar-days': '/commands/games-happenings#the-calendar-days',
    'how-often-and-when': '/commands/games-happenings#how-often-and-when',
    'where-it-s-announced': '/commands/games-happenings#where-it-s-announced',
    'how-it-shows-on-a-play': '/commands/games-happenings#how-it-shows-on-a-play',
    'when-it-stops': '/commands/games-happenings#when-it-stops',
    // Siege, and the pace
    siege: '/commands/games-siege',
    'starting-a-siege': '/commands/games-siege#starting-a-siege',
    fighting: '/commands/games-siege#fighting',
    'what-each-weapon-does': '/commands/games-siege#what-each-weapon-does',
    spooked: '/commands/games-siege#spooked',
    poison: '/commands/games-siege#poison',
    'items-in-a-siege': '/commands/games-siege#items-in-a-siege',
    'the-monsters': '/commands/games-siege#the-monsters',
    'it-fights-back': '/commands/games-siege#it-fights-back',
    'random-sieges': '/commands/games-siege#random-sieges',
    'how-tough-it-is': '/commands/games-siege#how-tough-it-is',
    'how-a-siege-ends': '/commands/games-siege#how-a-siege-ends',
    'rewards-and-the-penalty': '/commands/games-siege#rewards-and-the-penalty',
    'the-siege-card': '/commands/games-siege#the-siege-card',
    'the-daily-report': '/commands/games-siege#the-daily-report',
    'checking-in': '/commands/games-siege#checking-in',
    'turning-it-off': '/commands/games-siege#turning-it-off',
    pace: '/commands/games-siege#pace',
    'switching-to-2-74': '/commands/games-siege#switching-to-2-74',
    // Your card & the leaderboard
    scoreboard: '/commands/games-card#scoreboard',
    'game-card-right-click': '/commands/games-card#game-card-right-click',
    leaderboard: '/commands/games-card#leaderboard',
    // Settings for admins
    'game-settings-admin-mod': '/commands/games-settings',
    'limits-1': '/commands/games-settings#limits',
    'where-games-can-be-played': '/commands/games-settings#where-games-can-be-played',
    'turning-a-game-off': '/commands/games-settings#turning-a-game-off',
    'happenings-and-twists': '/commands/games-settings#happenings-and-twists',
    'resetting-scores': '/commands/games-settings#resetting-scores',
  },
  // An index page is keyed without its slash: /commands/brackets/ → '/commands/brackets'
  '/commands/brackets': {
    'quick-faq': '/guides/tournaments/faq',
  },
  '/commands/social': {
    // How each game plays → Playing & Points
    'food-fight': '/commands/games-playing#food-fight',
    'throw-food': '/commands/games-playing#throw-food',
    'feed-someone': '/commands/games-playing#feed-someone',
    doom: '/commands/games-playing#doom',
    'deal-a-fate': '/commands/games-playing#deal-a-fate',
    rescue: '/commands/games-playing#rescue',
    'attempt-a-rescue': '/commands/games-playing#attempt-a-rescue',
    'potion-command': '/commands/games-playing#potions',
    'give-a-potion': '/commands/games-playing#give-a-potion',
    'potion-issues': '/commands/games-playing#troubleshooting',
    // Each game's own lines → Settings for Admins. Three headings were all
    // "Your Own Lines (Admin/Mod)", so VitePress numbered them in page
    // order: food fight, doom, rescue.
    'your-own-lines-admin-mod': '/commands/games-settings#food-fight-lines',
    'your-own-lines-admin-mod-1': '/commands/games-settings#doom-lines',
    'your-own-lines-admin-mod-2': '/commands/games-settings#rescue-lines',
    'custom-responses-and-themes-admin-mod': '/commands/games-settings#potion-responses-and-themes',
  },
}

/** The new address for an old one, or null: '/commands/games.html', '#siege' → '/commands/games-siege.html' */
export function movedTo(pathname, hash) {
  // '/commands/games.html', '/commands/brackets/' and '/commands/brackets/index.html' → their key
  const page = String(pathname || '').replace(/\.html$/, '').replace(/\/(index)?$/, '')
  const anchor = decodeURIComponent(String(hash || '').replace(/^#/, ''))
  const to = MOVED[page]?.[anchor]
  if (!to) return null
  const [path, h] = to.split('#')
  // An index page's address is its folder: '/guides/tournaments/', not '….html'
  return `${path.endsWith('/') ? path : `${path}.html`}${h ? `#${h}` : ''}`
}

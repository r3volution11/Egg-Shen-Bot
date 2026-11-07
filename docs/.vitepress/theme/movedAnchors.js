// Sections that moved to a page of their own, by their old address.
//
// Until 2.74, every game rule was on one page, /commands/games, and links
// to its sections are everywhere we can't edit: the changelog, GitHub
// release notes, and the /how-to-play cards of bots still running an older
// version (each operator hosts their own). So the old page stays, as the
// games' overview, and keeps every old anchor: a hidden marker beside the
// summary of where it went (no JavaScript needed), and this map, which
// takes a reader straight to the section itself.
//
// scripts: the anchor check reads MOVED too, so every old link is proven to
// land somewhere real.

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
    'the-16-twists': '/commands/games-happenings#the-16-twists',
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
}

/** The new address for an old one, or null: '/commands/games.html', '#siege' → '/commands/games-siege.html' */
export function movedTo(pathname, hash) {
  const page = String(pathname || '').replace(/\.html$/, '').replace(/\/$/, '')
  const anchor = decodeURIComponent(String(hash || '').replace(/^#/, ''))
  const to = MOVED[page]?.[anchor]
  if (!to) return null
  const [path, h] = to.split('#')
  return `${path}.html${h ? `#${h}` : ''}`
}

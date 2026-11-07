/**
 * Big Trouble in Little China: the words for the whole expansion
 * (plans/big-trouble-expansion-design.md §1 and §3–§7): the Six-Demon Bag,
 * the six elements, the Pork-Chop Express, the sidekick pact, the Wang Chi
 * and the Jack Burton, backing, the four bosses, and the new items, titles,
 * happenings and twists.
 *
 * WORDS ONLY. The numbers (costs, caps, odds, durations, multipliers) live
 * in gameRewards.js and the engine. A line that has to say a number gets it
 * through a placeholder, so turning a tunable never leaves a sentence saying
 * the old number. The exceptions are the `about` lines (cards, /help, the
 * title list, the element choices), which state the design's numbers the
 * way ITEMS' and HAPPENINGS' `about` already do: change a rule, change its
 * `about`.
 *
 * This file is a CONTRACT with the engine. tests/btilc-lines.test.js pins
 * every export's shape and counts, and exactly which placeholders may appear
 * in which field (anything else fails, so a typo never prints a raw "{foo}"
 * in a channel).
 *
 * ── PLACEHOLDERS ──────────────────────────────────────────────────────────
 * Fill them with `fill(text, values)` below (a function replacer, so a name
 * with "$&" in it stays as typed).
 *
 * People: always DISPLAY NAMES, never mentions. The engine pings whoever it
 * should in the message content (a mention inside an embed never pings
 * anyway), so no line here contains an @.
 *   {caster}     who cast a blessing or hex
 *   {target}     who it landed on (Upside-Down: the play's target)
 *   {user}       the member the line is about: the player, the shrugger,
 *                the drinker. In MAGIC_ATTACK_LINES and ELEMENTS[e].siege
 *                it's the attacker, filled the way siegeAttackLines.js does
 *   {fighter}    one siege fighter
 *   {fighters}   several fighters, joined by the engine ("Sam, Alex and
 *                Jo"). May be ONE name, so no line conjugates a verb on it
 *   {mvp}        the Wang Chi (most help) of a won siege
 *   {jack}       the Jack Burton (the killing blow). The design's own name
 *                for it (§5: "Defeat lines gain a {jack} placeholder")
 *   {hero} {sidekick}     the pact's two members
 *   {sender} {receiver}   a gift's two ends
 *   {backer}     who staked points on {fighter}
 * Things:
 *   {monster}    the monster's display name, as siegeMonsters.js and
 *                siegeAttackLines.js fill it. Lines used against ANY
 *                monster (ELEMENTS[e].siege, MAGIC_ATTACK_LINES,
 *                ITEMS_BTILC.blackBlood.spared) follow siegeAttackLines.js'
 *                plural rules, since it may be "Gremlins" or "The Blob":
 *                never "the {monster}", never "{monster}'s", never a verb
 *                conjugated on it. BOSSES lines are written for their own
 *                boss and conjugate freely.
 *   {foe}        one of the Three Storms by name ("Thunder")
 *   {element}    one of ELEMENTS[e].phrases ("a fistful of lightning").
 *                Lowercase, so it never starts a sentence
 *   {item}       an item's label: gameRewardLines.itemLabel ("🥧 Golden Pie")
 *   {charm}      a blessing's or hex's label, emoji and name ("🔥 Scorched")
 *   {statuses}   twist statuses washed off, joined ("🧛 Bitten and 🦟 Mosquito Swarm")
 * Numbers and times, formatted by the engine:
 *   {points} {gain} {bonus}   signed points, in the points line's own signs ("+1", "−3")
 *   {stake} {chi} {need} {count}   plain numbers
 *   {left}       gameEventLines' left() suffix: " (2 more)", " (the last
 *                one)", or "" (the counting charms: Fired Up, Scorched, …)
 *   {when}       a Discord timestamp, e.g. <t:…:R>
 *
 * ── TONE ──────────────────────────────────────────────────────────────────
 * PG-13 horror-comedy in the drive-in's voice: cartoon violence and mild
 * swearing are fine; nothing hateful, nothing sexual. True to the film: the
 * flashy one gets the laugh (Jack Burton), the helper is the real hero (Wang
 * Chi). The film's Chinese characters and culture are its heroes, wit and
 * magic, and are written that way: no "accent" spellings, no
 * stereotype-voiced dialogue, no slurs (the test keeps a deny-list). Short
 * iconic quotes are used sparingly; the rest is original.
 *
 * ── EXPORTS (each is deep-frozen) ─────────────────────────────────────────
 *   ELEMENT_KEYS, ELEMENTS      the six demons: bless/hex/cancel/boost/siege
 *   MAGIC_ATTACK_LINES          /siege attack weapon:magic, §3.5
 *   SIEGE_MAGIC                 magic and `foe:` refusals, autocomplete hints
 *   MONSTER_ELEMENT_ABOUT       the 11 existing monsters' weaknesses, §3.5
 *   SIX_DEMON_BAG               /six-demon-bag: casts, peace, shrug, refusals
 *   PORK_CHOP_EXPRESS           /pork-chop-express: gifts, §4.1
 *   SIDEKICK                    /sidekick: the pact, §4.2
 *   HONOURS                     the Wang Chi, the Jack Burton, backing, §4.3, §5
 *   BOSS_KEYS, BOSSES, BOSS_SHARED   the four bosses, §6
 *   HAPPENINGS_BTILC, TWISTS_BTILC, ITEMS_BTILC, TITLES_BTILC,
 *   TITLE_ABOUT_UPDATES         §7
 *   fill                        the placeholder filler
 * Each section below says what its fields are for and which placeholders
 * they take.
 */

/** Freeze an object and everything in it: the engine shares these arrays */
function deepFreeze(o) {
  for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v);
  return Object.freeze(o);
}

/**
 * Fill {name} placeholders from `values`. A placeholder with no value is
 * left as it is (visible, not silently blank). A function replacer, so a
 * display name like "$&" stays as typed.
 * @param {string} text
 * @param {Object<string, string|number>} values
 */
export function fill(text, values = {}) {
  return String(text).replace(/\{(\w+)\}/g, (whole, name) => (Object.hasOwn(values, name) ? String(values[name]) : whole));
}

// ── the six elements (§3) ───────────────────────────────────────────────

/** The `element:` choices, in this order */
export const ELEMENT_KEYS = Object.freeze(['lightning', 'thunder', 'rain', 'wind', 'fire', 'smoke']);

/**
 * Six demons in the bag, in three opposed pairs (Rain/Fire, Wind/Smoke,
 * Lightning/Thunder; the pairs are the engine's, not this file's).
 *
 *   name, emoji          'Wind', '💨'
 *   blessName, hexName   'Tailwind', 'Ill Wind' (§3.1)
 *   blessAbout, hexAbout one plain sentence: what it does, for the choice
 *                        labels, the status card and /help. Neutral voice
 *                        ("the next play"), since the card may be anyone's
 *   phrases [3]          noun phrases for MAGIC_ATTACK_LINES' {element};
 *                        lowercase, no full stop. [0] is the canonical one
 *   bless [6], hex [6]   the cast's flavour, {caster} {target}. Opens with
 *                        the element's emoji; the engine adds the effect
 *                        (name + about) and the Chi footer after it
 *   cancel.lift [2]      this element's BLESSING lifts a hex of the same or
 *                        opposite element: {caster} {target} {charm} (the hex)
 *   cancel.spoil [2]     this element's HEX spoils a blessing: {caster}
 *                        {target} {charm} (the blessing)
 *   used.bless, used.hex the line under a play the charm acted on: {user},
 *                        and {left} on the counting ones; Fire's take
 *                        {points} (gameEventLines' STATUS_USED, for charms)
 *   boost [2]            a blessing cast on a fighter in a live siege: they
 *                        are imbued for their next attacks. {caster} {target}
 *   siege                how a monster took this element, said under a magic
 *                        Blast or an imbued attack that landed; {user} and
 *                        {monster} exactly once each, plural-safe:
 *     hit [4]            neutral (×1)
 *     weak [3]           a weakness (×2): super-effective
 *     resist [3]         resisted (×0.5)
 *     immune [2]         immune (×0): a Storm hit with its own element
 *     heals [2]          RAIN ONLY: a monster that heals in water (Gremlins)
 */
export const ELEMENTS = deepFreeze({
  lightning: {
    name: 'Lightning', emoji: '⚡',
    blessName: 'Lightning Strike', hexName: 'Static',
    blessAbout: 'The next good play scores double.',
    hexAbout: 'Gains are halved, rounded down, on the next 2 plays.',
    phrases: ['a fistful of lightning', 'a crackling bolt of lightning', 'a fork of green lightning'],
    bless: [
      '⚡ {caster} pulls a crackle of lightning from the bag and tucks it behind {target}\'s ear. Save it for the big one.',
      '⚡ {caster} touches two fingers to {target}\'s forehead. Zap. Every hair stands up, and so will the next good play.',
      '⚡ The bag hums. {caster} hands {target} a bolt of lightning, still warm, like a loaf fresh out of the oven.',
      '⚡ {caster} charges {target} up like a car battery. Jumper cables optional. Grin mandatory.',
      '⚡ Green lightning arcs from {caster}\'s bag to {target}, who now glows faintly and smells like a summer storm.',
      '⚡ {caster} bottles a lightning strike and slides it across to {target}. "Don\'t shake it. Open it when it counts."',
    ],
    hex: [
      '⚡ {caster} rubs a balloon on the bag and sticks it to {target}. Everything {target} wins now crackles and comes out smaller.',
      '⚡ {caster} flicks a spark at {target}. Static cling, of the soul.',
      '⚡ {target} reaches for the car door. ZAP. {caster} whistles innocently and puts the bag away.',
      '⚡ {caster} fills {target}\'s pockets with static. Every win comes out fuzzy now, like a TV with bad reception.',
      '⚡ A tiny thundercloud follows {target} around, courtesy of {caster}. It only does static, but it does it constantly.',
      '⚡ {caster} shuffles across the snack-bar carpet in wool socks and taps {target} on the nose. Gains: halved. Hair: ruined.',
    ],
    cancel: {
      lift: [
        '⚡ {caster}\'s lightning jolts {target}\'s {charm} clean off. Both are gone in a flash.',
        '⚡ {caster} fights magic with magic: a bolt to {target}\'s {charm}, and the two cancel out with a pop.',
      ],
      spoil: [
        '⚡ {caster} shorts out {target}\'s {charm} with a burst of static. Both fizzle.',
        '⚡ A spark from {caster}\'s bag finds {target}\'s {charm}. Crackle, pop, and nothing left of either.',
      ],
    },
    used: {
      bless: '⚡ Lightning Strike: {user}\'s points ×2.',
      hex: '⚡ Static: {user}\'s gains are halved{left}.',
    },
    boost: [
      '⚡ {caster} charges {target}\'s next swings with lightning. Every hit for a while is going to crackle.',
      '⚡ {caster} wraps {target}\'s weapons in blue sparks. The monster is about to learn about electricity.',
    ],
    siege: {
      hit: [
        '⚡ The lightning finds {monster} and lights up the whole lot for a second. {user} counts the seconds till the thunder.',
        '⚡ A bolt jumps from {user} to {monster}: crackle, flash, and the smell of a blown fuse.',
        '⚡ {user} lands a jolt on {monster}. Not the weak spot, but every pole speaker on the lot buzzes for a minute.',
        '⚡ Blue sparks crawl all over {monster}, and {user} looks a little too proud of it.',
      ],
      weak: [
        '⚡ Super-effective! The lightning lights up {monster} like a pinball machine, and {user} gets the high score.',
        '⚡ {user} found the weak spot: lightning straight through {monster}, and every bulb on the lot flares at once.',
        '⚡ Right where it hurts! {user} sends a bolt into {monster}, and for one bright second the screen goes white.',
      ],
      resist: [
        '⚡ The bolt slides off {monster} into the asphalt. {user} gets a static shock for the trouble.',
        '⚡ {user} zaps {monster}, and the lightning just fizzles. Somebody check the fuse box.',
        '⚡ Barely a tickle: {user}\'s lightning runs around {monster} and grounds itself in a car antenna.',
      ],
      immune: [
        '⚡ Lightning against lightning: {user}\'s bolt soaks into {monster} like a cold soda on a hot night. Not a scratch.',
        '⚡ {user} throws lightning at {monster}, and it crackles happily, right at home. Nothing. Pick another demon.',
      ],
    },
  },

  thunder: {
    name: 'Thunder', emoji: '🌩️',
    blessName: 'Thunderous Applause', hexName: 'Deafened',
    blessAbout: 'The next good help (a tasty meal, a rescue, a helpful potion that works) scores double for whoever is helped.',
    hexAbout: 'The next 5 good plays earn no Chi.',
    phrases: ['a thunderclap in a jar', 'a rolling boom of thunder', 'a drumroll of thunder'],
    bless: [
      '🌩️ {caster} lets a thunderclap out of the bag and points it at {target}. The next good deed {target} does gets a standing ovation.',
      '🌩️ {caster} hires the thunder as {target}\'s hype man. When {target} helps someone, the whole lot will hear about it.',
      '🌩️ {caster} rolls a peal of thunder into {target}\'s hands. "For the next friend you help. Make it loud."',
      '🌩️ The sky over Row F rumbles for {target}, and {caster} winks. Whoever {target} helps next is in for a treat.',
      '🌩️ {caster} slips a thunderclap into {target}\'s pocket like a tip. Kindness, with a big bass drum behind it.',
      '🌩️ {caster} gives {target} the gift of applause. Not for {target}: for whoever {target} saves next. That\'s the trick of it.',
    ],
    hex: [
      '🌩️ {caster} claps the thunder right next to {target}\'s ear. WHAT? WHAT\'S THAT? No Chi for a while.',
      '🌩️ A thunderclap goes off in {target}\'s glovebox, courtesy of {caster}. {target} can\'t hear the bag calling.',
      '🌩️ {caster} drops a peal of thunder on {target}. Ears ringing, bag silent. The Chi goes right past.',
      '🌩️ {target} is deafened by a boom out of {caster}\'s bag. The good plays still count. The Chi just doesn\'t hear them.',
      '🌩️ {caster} sets off a thunderclap behind {target}. Now {target} can\'t hear a thing, least of all the bag.',
      '🌩️ {caster} turns the thunder up to eleven and aims it squarely at {target}. Earmuffs would have helped.',
    ],
    cancel: {
      lift: [
        '🌩️ {caster}\'s thunder booms {target}\'s {charm} right off. It can\'t hear itself think, so it leaves.',
        '🌩️ One clap from {caster}, and {target}\'s {charm} shatters like a cheap window. The thunder goes with it.',
      ],
      spoil: [
        '🌩️ {caster} drowns out {target}\'s {charm} with a thunderclap. Both go quiet.',
        '🌩️ {caster}\'s boom rattles {target}\'s {charm} loose. Neither one survives the noise.',
      ],
    },
    used: {
      bless: '🌩️ Thunderous Applause: the help lands double. Take a bow, {user}.',
      hex: '🌩️ Deafened: no Chi for {user} this time{left}.',
    },
    boost: [
      '🌩️ {caster} packs a thunderclap into {target}\'s next swings. Every hit lands with a BOOM.',
      '🌩️ {caster} lends {target} the thunder. Whatever {target} hits next is going to hear about it.',
    ],
    siege: {
      hit: [
        '🌩️ BOOM. The thunder rolls over {monster}, and {user} feels it in the fillings.',
        '🌩️ {user} lets the thunder loose on {monster}. Car alarms go off from Row A to Row Z.',
        '🌩️ A thunderclap hits {monster} square on. {user} covers both ears, a beat too late.',
        '🌩️ The ground shakes under {monster}. {user} nods: they felt that one in the next county.',
      ],
      weak: [
        '🌩️ Super-effective! The thunder rattles {monster} to the bones, and {user} drops the mic.',
        '🌩️ {user} found the weak spot: one big BOOM, and the shock goes right through {monster} like a gong.',
        '🌩️ Right where it hurts! {user} claps the thunder at {monster} so hard the projector skips a reel.',
      ],
      resist: [
        '🌩️ The thunder rolls right past {monster}. {user} hears it echo off the screen, unimpressed.',
        '🌩️ {user} booms at {monster}, and the boom comes out more like a burp. Not much damage.',
        '🌩️ Half a rumble: {user}\'s thunder bounces off {monster} and wanders off toward the highway.',
      ],
      immune: [
        '🌩️ Thunder against thunder: {user}\'s boom hits {monster} and only makes more noise. Not a scratch.',
        '🌩️ {user} claps the thunder at {monster} and gets the same clap right back. Nothing. Try another demon.',
      ],
    },
  },

  rain: {
    name: 'Rain', emoji: '🌧️',
    blessName: 'Cleansing Rain', hexName: 'Rained Out',
    blessAbout: 'Washes off Bitten, Jinxed and Mosquito Swarm at once, then the next bad play keeps the streak.',
    hexAbout: 'The next 2 good plays don\'t extend the streak (it holds).',
    phrases: ['a cloudburst of cold rain', 'a sheet of driving rain', 'a squall straight off the bay'],
    bless: [
      '🌧️ {caster} opens the bag over {target}\'s head. A warm, clean rain washes the bad luck right off.',
      '🌧️ A private little rain cloud parks over {target}, courtesy of {caster}. Bites, jinxes and mosquitoes: rinsed.',
      '🌧️ {caster} wrings out the bag over {target}. Everything nasty slides off like mud off a windshield.',
      '🌧️ {caster} calls down a gentle shower on {target}. The streak is safe, and the hair looks great.',
      '🌧️ {target} stands in {caster}\'s rain with both arms out. Whatever was clinging on goes down the storm drain.',
      '🌧️ {caster} treats {target} to the drive-in car wash. The deluxe one, with the hot wax and the cleansing.',
    ],
    hex: [
      '🌧️ {caster} parks a raincloud right over {target}\'s streak. Game delayed on account of rain.',
      '🌧️ It rains on {target}, and only on {target}. {caster} is holding the umbrella, and not sharing.',
      '🌧️ {caster} rains on {target}\'s parade. The streak doesn\'t break. It just stands there, soaked, going nowhere.',
      '🌧️ A drizzle follows {target} around the lot, compliments of {caster}. The streak is on a rain delay.',
      '🌧️ {caster} wrings a wet cloud over {target}\'s scorecard. The ink runs, and the streak stays put.',
      '🌧️ {target} gets rained out by {caster}. The next good plays still count, but the streak won\'t budge.',
    ],
    cancel: {
      lift: [
        '🌧️ {caster}\'s rain douses {target}\'s {charm}. Both wash away down the storm drain.',
        '🌧️ {caster} rinses {target}\'s {charm} right off. The rain and the hex go out together.',
      ],
      spoil: [
        '🌧️ {caster} rains on {target}\'s {charm}. It runs like wet paint, and so does the rain.',
        '🌧️ A cloudburst from {caster}\'s bag soaks {target}\'s {charm} through. Both are gone.',
      ],
    },
    used: {
      bless: '🌧️ Cleansing Rain: {user}\'s streak survives.',
      hex: '🌧️ Rained Out: {user}\'s streak holds, but doesn\'t grow{left}.',
    },
    boost: [
      '🌧️ {caster} soaks {target}\'s weapons in storm water. The next swings hit like a flash flood.',
      '🌧️ {caster} sends a squall to ride with {target}. Every hit comes with a cold, hard rain.',
    ],
    siege: {
      hit: [
        '🌧️ A cold squall lashes {monster}. {user} stays dry. Mostly.',
        '🌧️ {user} brings the rain down on {monster} like a car wash with a grudge.',
        '🌧️ The rain hammers {monster} sideways, and {user} turns up a collar against it, very cool about the whole thing.',
        '🌧️ Sheets of rain batter {monster}. Every windshield wiper on the lot starts up to salute {user}.',
      ],
      weak: [
        '🌧️ Super-effective! The rain beats down on {monster} like a monsoon with a point to prove. {user} cracks a grin.',
        '🌧️ {user} drowns the problem: the downpour pins {monster} to the asphalt in a spray of puddles.',
        '🌧️ Right where it hurts! {user} sends a cloudburst into {monster}, and the steam pours off in clouds.',
      ],
      resist: [
        '🌧️ The rain runs off {monster} like water off a duck. {user} just got everybody else wet.',
        '🌧️ {user} rains on {monster}, and the rain only puddles. Not much damage, lots of mud.',
        '🌧️ A drizzle at best: {user}\'s storm barely dampens {monster}.',
      ],
      immune: [
        '🌧️ Rain against rain: {user}\'s storm just soaks into {monster}. Not a scratch.',
        '🌧️ {user} throws a downpour at {monster}, and it comes back as a pleasant mist. Nothing. Pick another demon.',
      ],
      heals: [
        '🌧️ Uh oh. {user} got {monster} wet. Something in the puddles starts to bubble, and that only made things worse.',
        '🌧️ Rule one, {user}: never get {monster} wet. Too late. The water helped, and not in a good way.',
      ],
    },
  },

  wind: {
    name: 'Wind', emoji: '💨',
    blessName: 'Tailwind', hexName: 'Ill Wind',
    blessAbout: 'The next play can\'t go badly: bad outcomes are out of the draw.',
    hexAbout: 'The next play is drawn twice, and keeps the worse.',
    phrases: ['a gust off the Gobi', 'a howling gale', 'a whirlwind full of grit'],
    bless: [
      '💨 {caster} opens the bag a crack, and a warm wind fills {target}\'s sails. The next play can\'t go wrong.',
      '💨 {caster} gives {target} a tailwind straight off the Gobi. Whatever {target} does next, it\'s all downhill.',
      '💨 A breeze from {caster}\'s bag blows every bad outcome clean off {target}\'s next play.',
      '💨 {caster} whistles up a wind behind {target}. The pie flies true, the potion pours right, the doom finds its mark.',
      '💨 {target} catches {caster}\'s good wind. Luck is a weather system, and right now it\'s blowing {target}\'s way.',
      '💨 {caster} blows on {target}\'s dice like a regular in Reno. Somewhere, a gust agrees.',
    ],
    hex: [
      '💨 {caster} lets an ill wind out of the bag, and it heads straight for {target}. Next play: the worse of two.',
      '💨 A sour breeze from {caster}\'s bag follows {target} around. It blows nobody any good.',
      '💨 {caster} turns the wind against {target}. Every throw is going to want to go sideways.',
      '💨 {target} feels it first in the hair: an ill wind, courtesy of {caster}. It smells like trouble and old popcorn.',
      '💨 {caster} opens the bag, and a headwind slams into {target}. Two draws, and the wind picks the worse.',
      '💨 A dust devil spins up out of {caster}\'s bag and parks itself on {target}. It does not have {target}\'s best interests at heart.',
    ],
    cancel: {
      lift: [
        '💨 {caster}\'s wind blows {target}\'s {charm} away like a paper plate. The wind goes with it.',
        '💨 A clean gust from {caster} catches {target}\'s {charm} and carries it off into the night.',
      ],
      spoil: [
        '💨 {caster} blows {target}\'s {charm} away. Both are scattered over the parking lot.',
        '💨 {caster}\'s gust tears {target}\'s {charm} loose. Nothing\'s left of either but a breeze.',
      ],
    },
    used: {
      bless: '💨 Tailwind: {user}\'s play could only go well.',
      hex: '💨 Ill Wind: two draws, and {user} got the worse one.',
    },
    boost: [
      '💨 {caster} puts the wind at {target}\'s back. The next swings fly faster and land harder.',
      '💨 {caster} whistles up a gale behind {target}. Pies, curses and potions all ride it in.',
    ],
    siege: {
      hit: [
        '💨 A gale slams into {monster}. {user} hangs onto a pole speaker and enjoys the show.',
        '💨 {user} whips up a wind that spins {monster} around twice and throws in some gravel for free.',
        '💨 The wind howls through {monster}, and every napkin on the lot takes flight in {user}\'s honour.',
        '💨 A twister the size of a phone booth hits {monster}. {user} waves goodbye to a lawn chair.',
      ],
      weak: [
        '💨 Super-effective! An icy wind tears into {monster}, and the frost spreads fast. {user} blows on cold fingers.',
        '💨 {user} found the weak spot: a freezing gale knocks {monster} flat and frosts every windshield white.',
        '💨 Right where it hurts! {user}\'s wind cuts through {monster} like a January night in the back row.',
      ],
      resist: [
        '💨 The wind barely ruffles {monster}. {user}\'s hair, on the other hand, is ruined.',
        '💨 {user} huffs and puffs at {monster}. Lots of huffing, not much damage.',
        '💨 A stiff breeze at best: {user}\'s gale parts around {monster} like a river around a rock.',
      ],
      immune: [
        '💨 Wind against wind: {user}\'s gust slides through {monster} without leaving a scratch.',
        '💨 {user} blows a gale at {monster}, and the gale blows right back. Nothing. Try another demon.',
      ],
    },
  },

  fire: {
    name: 'Fire', emoji: '🔥',
    blessName: 'Fired Up', hexName: 'Scorched',
    blessAbout: '+1 on each good play for the next 3 plays.',
    hexAbout: '−1 on each of the next 3 plays.',
    phrases: ['a ball of blue fire', 'a fireball the size of a hubcap', 'a ribbon of dragon fire'],
    bless: [
      '🔥 {caster} lights a little fire under {target}. The next few good plays are going to burn a bit brighter.',
      '🔥 {caster} hands {target} a ball of blue flame. It doesn\'t burn. It just makes everything {target} does a little hotter.',
      '🔥 Sparks fly from {caster}\'s bag and settle on {target}. Fired up and ready to go.',
      '🔥 {caster} breathes on the coals in the bag, and {target} catches. Nothing like a fire in the belly.',
      '🔥 {target} is fired up. {caster} says it\'s magic. It might just be the chili. Either way, the points are coming.',
      '🔥 {caster} draws a ring of fire around {target}\'s parking spot. Inside it, everything goes a little better.',
    ],
    hex: [
      '🔥 {caster} singes {target}\'s eyebrows with something from the bag. The next few plays are going to sting.',
      '🔥 A hot coal hops out of {caster}\'s bag and into {target}\'s shoe. Ow. Ow. Ow.',
      '🔥 {caster} scorches {target}\'s seat. {target} will be hopping for the next few plays.',
      '🔥 {target}\'s popcorn catches fire. {caster} looks away, whistling, holding a suspiciously smoky bag.',
      '🔥 {caster} lights {target}\'s scorecard at one corner. It burns slowly, a point at a time.',
      '🔥 {caster} sets {target}\'s hood ornament on fire. A small fire. A persistent one. Points will be lost.',
    ],
    cancel: {
      lift: [
        '🔥 {caster} burns {target}\'s {charm} right off. Fire fights fire, and both go out.',
        '🔥 {caster}\'s flame catches {target}\'s {charm}, and the two burn each other down to nothing.',
      ],
      spoil: [
        '🔥 {caster} sets {target}\'s {charm} alight. It goes up in a flash, and the fire goes with it.',
        '🔥 {caster} scorches {target}\'s {charm} away. Nothing left of either but a smell like burnt popcorn.',
      ],
    },
    used: {
      bless: '🔥 Fired Up: {user} {points}{left}.',
      hex: '🔥 Scorched: {user} {points}{left}.',
    },
    boost: [
      '🔥 {caster} sets {target}\'s weapons alight. The next swings are flaming, which is never not cool.',
      '🔥 {caster} breathes fire into {target}\'s throwing arm. Everything {target} throws next arrives on fire.',
    ],
    siege: {
      hit: [
        '🔥 The fire catches on {monster}, and {user} toasts a marshmallow on the edge of it.',
        '🔥 Flames lick across {monster}. {user} steps back with the face of someone who\'s always wanted to do that.',
        '🔥 {user} lights up {monster}. The smoke smells like burnt popcorn and victory.',
        '🔥 A sheet of fire rolls over {monster}, and the snack bar\'s smoke alarm cheers {user} on.',
      ],
      weak: [
        '🔥 Super-effective! The fire roars over {monster}, and {user} has to step back from the heat.',
        '🔥 {user} found the weak spot: one blue fireball, and the flames climb {monster} like a Fourth of July sparkler.',
        '🔥 Right where it hurts! {user} sets {monster} ablaze, and the whole back row feels the warmth.',
      ],
      resist: [
        '🔥 The fire gutters out against {monster}, and {user} is left holding a very small, sad flame.',
        '🔥 {user} torches {monster}, and the flames just slide off. Not much damage. Nice tan, though.',
        '🔥 Barely a scorch: {user}\'s fireball sizzles on {monster} like a drop of water on a hot skillet.',
      ],
      immune: [
        '🔥 Fire against fire: {user}\'s flame vanishes into {monster} without a mark.',
        '🔥 {user} throws fire at {monster}, and the fire just joins in. Nothing. Pick another demon.',
      ],
    },
  },

  smoke: {
    name: 'Smoke', emoji: '🌫️',
    blessName: 'Smoke Screen', hexName: 'Lost in the Smoke',
    blessAbout: 'The next harmful play aimed at them is lost in the smoke: a throw misses, a doom escapes, a harmful potion does no harm.',
    hexAbout: 'The next 2 plays aimed at a member score only the player, as if aimed at a role.',
    phrases: ['a curl of green smoke', 'a choking bank of smoke', 'a smoke ring the size of a tire'],
    bless: [
      '🌫️ {caster} pours smoke from the bag around {target}. The next thing thrown at {target} won\'t find its mark.',
      '🌫️ {target} vanishes in a puff of {caster}\'s smoke, then reappears: still there, but much harder to hit.',
      '🌫️ {caster} wraps {target} in a smoke screen. Whoever comes for {target} next is swinging at fog.',
      '🌫️ {caster} lights a smoke bomb and rolls it under {target}\'s car. The next attack gets lost on the way.',
      '🌫️ A cool gray cloud settles over {target}. {caster} nods: "Nobody hits what they can\'t see."',
      '🌫️ {caster} fogs up every window of {target}\'s car from the outside. Whoever comes for {target} next will have to guess.',
    ],
    hex: [
      '🌫️ {caster} blows smoke in {target}\'s eyes. The next couple of plays won\'t land where {target} aims them.',
      '🌫️ A cloud from {caster}\'s bag swallows {target}\'s aim. Whoever {target} goes after next, it\'s a shot in the dark.',
      '🌫️ {caster} fills {target}\'s car with thick green smoke. {target} can\'t see who to aim at, and the windows won\'t roll down.',
      '🌫️ {target} is lost in the smoke, courtesy of {caster}. Every throw heads for a person and lands on nobody.',
      '🌫️ {caster} drops a smoke ring over {target} like a lasso. Aim: gone. Points: still {target}\'s, at least.',
      '🌫️ The smoke from {caster}\'s bag hangs around {target} like a bad smell. Targets go fuzzy. Plays go wide.',
    ],
    cancel: {
      lift: [
        '🌫️ {caster}\'s smoke smothers {target}\'s {charm}. When it clears, neither one is there.',
        '🌫️ {caster} hides {target}\'s {charm} in a cloud, and it gets lost on the way back.',
      ],
      spoil: [
        '🌫️ {caster} blows smoke over {target}\'s {charm}. It can\'t find its way, and wanders off.',
        '🌫️ {caster}\'s smoke swallows {target}\'s {charm} whole. Then the smoke drifts off too.',
      ],
    },
    used: {
      bless: '🌫️ Smoke Screen: the play aimed at {user} is lost in the smoke.',
      hex: '🌫️ Lost in the Smoke: {user}\'s play loses its target{left}.',
    },
    boost: [
      '🌫️ {caster} wreathes {target} in smoke. The next swings come out of nowhere.',
      '🌫️ {caster} hides {target} in a drifting cloud. The monster won\'t see the next hits coming.',
    ],
    siege: {
      hit: [
        '🌫️ The smoke curls around {monster}, thick and choking. {user} vanishes into it and comes out swinging.',
        '🌫️ {user} smothers {monster} in green smoke. Somewhere inside it, coughing.',
        '🌫️ A bank of smoke rolls over {monster}, and {user} fans it away like a magician finishing a trick.',
        '🌫️ {user} hits {monster} with a smoke ring the size of a tire. It stings the eyes. All of them.',
      ],
      weak: [
        '🌫️ Super-effective! The smoke chokes {monster} and won\'t let go. {user} wipes away a tear, not of sadness.',
        '🌫️ {user} found the weak spot: thick smoke wraps {monster} up tight, and the coughing doesn\'t stop.',
        '🌫️ Right where it hurts! {user} gasses {monster} with a cloud so thick the projector beam disappears.',
      ],
      resist: [
        '🌫️ The smoke drifts right through {monster}. {user} coughs more than anyone.',
        '🌫️ {user} blows smoke at {monster}, and it just hangs there, looking moody. Not much damage.',
        '🌫️ A wisp at best: {user}\'s smoke thins out around {monster} and goes looking for the exit.',
      ],
      immune: [
        '🌫️ Smoke against smoke: {user}\'s cloud melts into {monster} without a trace.',
        '🌫️ {user} throws smoke at {monster}, and the smoke just drifts home. Nothing. Try another demon.',
      ],
    },
  },
});

// ── magic in the siege (§3.5) ───────────────────────────────────────────

/**
 * `/siege attack weapon:magic element:<e>`: the attack line itself, in
 * SIEGE_ATTACK_LINES' own shape so the engine can add it as its `magic`
 * weapon. The engine picks the outcome, then a line of that outcome:
 *   worked     🔮 Blast (35 lines; damage × the element's multiplier)
 *   escaped    💨 Scattered (10; no damage)
 *   backfired  🌀 Backlash (5; −1, and Spooked)
 * {user}, {monster} and {element} each appear exactly once. {element} is
 * an ELEMENTS[e].phrases entry, so every line reads right for all six. The
 * effect line under a Blast comes from ELEMENTS[e].siege.
 */
export const MAGIC_ATTACK_LINES = deepFreeze([
  // ---- worked (35) ----
  { text: '🎒 {user} reaches into the Six-Demon Bag and hurls {element} at {monster}. Direct hit.', outcome: 'worked' },
  { text: '🔮 "Wind, fire, all that kind of thing!" {user} lets {element} fly, straight into {monster}.', outcome: 'worked' },
  { text: '🎒 {user} unties the bag, and {element} comes roaring out and slams into {monster}.', outcome: 'worked' },
  { text: '✨ {user} draws a circle in the gravel, says the word, and {element} drops onto {monster} out of a clear sky.', outcome: 'worked' },
  { text: '🔮 {user} cups {element} in both hands like a firefly, then flings it right into {monster}.', outcome: 'worked' },
  { text: '🎒 {user} whirls the Six-Demon Bag like a sling and lets {element} go, straight at {monster}.', outcome: 'worked' },
  { text: '✨ {user} snaps two fingers, and {element} answers, landing right on top of {monster}.', outcome: 'worked' },
  { text: '🔮 {user} takes a swig from one of Egg Shen\'s little bottles, breathes out {element}, and nails {monster}.', outcome: 'worked' },
  { text: '🎒 One demon out of six: {user} lets {element} loose, and it goes for {monster} like it has a grudge.', outcome: 'worked' },
  { text: '✨ {user} rolls up both sleeves, mutters something very old, points at {monster}, and lets {element} do the rest.', outcome: 'worked' },
  { text: '🔮 {user} pulls {element} out of the bag like a rabbit out of a hat and throws it at {monster}. Ta-da.', outcome: 'worked' },
  { text: '🎒 {user} shakes the bag, and {element} spills out over {monster} like popcorn from a split bucket.', outcome: 'worked' },
  { text: '✨ The lot goes quiet. {user} raises one hand, and {element} comes down on {monster} like the wrath of heaven.', outcome: 'worked' },
  { text: '🔮 {user} hops onto the hood of a car, opens the bag, and sends {element} into {monster} from on high.', outcome: 'worked' },
  { text: '🎒 {user} bowls {element} across the gravel like a perfect strike, right into {monster}.', outcome: 'worked' },
  { text: '✨ {user} whispers to the bag, the bag whispers back, and {element} shoots out and hits {monster}.', outcome: 'worked' },
  { text: '🔮 {user} channels {element} through a pole speaker and blasts {monster} at full volume.', outcome: 'worked' },
  { text: '🎒 {user} fires {element} at {monster}, then blows on a fingertip like a gunslinger.', outcome: 'worked' },
  { text: '✨ {user} lights a paper charm, and {element} bursts out of the ash and hits {monster}.', outcome: 'worked' },
  { text: '🔮 {user} plants both feet, takes a breath, and pushes {element} out like a wall into {monster}.', outcome: 'worked' },
  { text: '🎒 The bag bucks in {user}\'s hands like a fire hose, spraying {element} everywhere, mostly on {monster}.', outcome: 'worked' },
  { text: '✨ {user} conjures {element} and sends it on a lap around the lot before it smacks into {monster}.', outcome: 'worked' },
  { text: '🔮 {user} lobs {element} over the snack bar in a perfect arc. It lands on {monster} with a crunch.', outcome: 'worked' },
  { text: '🎒 {user} reaches in up to the elbow, rummages, and comes out with {element}, which goes straight into {monster}.', outcome: 'worked' },
  { text: '✨ "Hey! Over here!" {user} waits for the turn, then lets {element} fly point-blank into {monster}.', outcome: 'worked' },
  { text: '🔮 {user} lets {element} out of the bag, and it heads for {monster} like it knows the way.', outcome: 'worked' },
  { text: '🎒 {user} slides across a car hood, action-movie style, and unleashes {element} on {monster}.', outcome: 'worked' },
  { text: '✨ {user} draws a symbol in the air with a sparkler, and {element} follows the shape right into {monster}.', outcome: 'worked' },
  { text: '🔮 {user} uncorks the bag with a pop, and {element} fizzes out all over {monster} like a shaken soda.', outcome: 'worked' },
  { text: '🎒 {user} squints, aims, and flicks {element} at {monster} like a bottle cap. Dead on.', outcome: 'worked' },
  { text: '✨ {user} calls on the old powers, and the old powers send {element} down on {monster}, special delivery.', outcome: 'worked' },
  { text: '🔮 {user} pops the trunk, and {element} comes out swinging at {monster}. Nobody knew that was in there.', outcome: 'worked' },
  { text: '🎒 {user} gives the bag a slap, and {element} leaps out and tackles {monster}.', outcome: 'worked' },
  { text: '✨ {user} steps into the projector beam, glowing, and lets {element} loose on {monster}. The whole lot honks.', outcome: 'worked' },
  { text: '🔮 {user} counts to three in a whisper and throws {element} on two, catching {monster} off guard.', outcome: 'worked' },
  // ---- escaped: Scattered (10) ----
  { text: '💨 {user} lets {element} out of the bag, and it blows right past {monster} into the back row.', outcome: 'escaped' },
  { text: '💨 {user} throws {element}, but the aim is off: it takes out a pole speaker two rows from {monster}.', outcome: 'escaped' },
  { text: '💨 {user} opens the bag, and {element} comes out, looks around, and wanders off nowhere near {monster}.', outcome: 'escaped' },
  { text: '💨 {user} hurls {element} at {monster}, and it scatters into sparkles. Pretty. Useless.', outcome: 'escaped' },
  { text: '💨 {user} fumbles {element}, and it fizzles out on the gravel well short of {monster}.', outcome: 'escaped' },
  { text: '💨 {user} aims {element} at {monster}, sneezes, and sends it into the clouds.', outcome: 'escaped' },
  { text: '💨 {user} calls up {element}, but a crosswind steals it away before it gets near {monster}.', outcome: 'escaped' },
  { text: '💨 {user} lets fly with {element}. It hits the screen, right where {monster} stood a second ago.', outcome: 'escaped' },
  { text: '💨 {user} pulls the drawstring too hard: {element} pops out sideways and misses {monster} by a mile.', outcome: 'escaped' },
  { text: '💨 {user} flings {element} at {monster}, and it scatters like a flock of startled pigeons.', outcome: 'escaped' },
  // ---- backfired: Backlash (5) ----
  { text: '🌀 {user} opens the bag upside-down, and {element} misses {monster} entirely and comes back home, hard.', outcome: 'backfired' },
  { text: '🌀 {user} says the wrong word, and {element} turns around halfway to {monster} and chases its owner across the lot.', outcome: 'backfired' },
  { text: '🌀 {user} lets {element} out, and it bounces off {monster} right back into the face that sent it. Spooked.', outcome: 'backfired' },
  { text: '🌀 {user} trips on the drawstring, and {element} goes off inside the bag. Smoke, sparks, and {monster} laughing.', outcome: 'backfired' },
  { text: '🌀 {user} grabs the wrong demon, and {element} goes off point-blank: a free fireworks show for {monster}.', outcome: 'backfired' },
]);

/**
 * The rest of magic in /siege, said privately (refusals cost nothing):
 *   refusals.noChi       {chi} {need}
 *   foe.down             {foe}: the storm named in `foe:` is already down
 *   hints                autocomplete fragments for `element:`, after the
 *                        engine's own "🔥 Fire · ×2 vs The Thing": no placeholders
 */
export const SIEGE_MAGIC = deepFreeze({
  refusals: {
    noChi: '🔮 Magic costs {need} Chi and your bag holds {chi}. Good plays fill it.',
    noElement: '🔮 Magic needs an element: pick one of the six demons in `element:`.',
    unknownElement: '🔮 That isn\'t one of the six demons. Pick Lightning, Thunder, Rain, Wind, Fire or Smoke from the list.',
    notMagic: '🔮 `element:` only works with `weapon:` 🔮 Magic.',
  },
  foe: {
    notStorms: '🌩️ `foe:` is only for the Three Storms. Against anything else, every hit finds the monster.',
    down: '🌩️ {foe} is already down. Pick a storm that\'s still standing.',
    unknown: '🌩️ That isn\'t one of the Three Storms still standing.',
  },
  hints: {
    weak: '(weak!)',
    resist: '(resists it)',
    immune: '(immune)',
    heals: '⚠️ heals it',
  },
});

/**
 * The 11 existing monsters' weaknesses, for their cards (§3.5: "the card's
 * about line says them"). Keyed like siegeMonsters.js. No placeholders.
 */
export const MONSTER_ELEMENT_ABOUT = deepFreeze({
  blob: '💨 Wind is its weakness: it hates the cold. 🔥 Fire only warms it up.',
  gremlins: '⚡ Lightning is their weakness, like a camera flash. 🌧️ Never Rain: don\'t get them wet.',
  count: '🔥 Fire is his weakness, like a torch at dawn. 🌫️ Smoke does little: he is the fog.',
  wolfman: '🌫️ Smoke is his weakness: a cloud over the moon. 💨 Wind does little: he\'s got your scent.',
  klowns: '🌩️ Thunder is their weakness: a big bang pops the noses. 🌧️ Rain does little: they live on seltzer.',
  pods: '🔥 Fire is their weakness: torch the pods. 🌧️ Rain does little: plants love rain.',
  shark: '⚡ Lightning is its weakness: the power-cable trick. 🌧️ Rain does little: it\'s a shark.',
  them: '🌫️ Smoke is their weakness: gas the nest. 💨 Wind does little: it just blows the scent around.',
  thing: '🔥 Fire is its weakness: bring the flamethrower. 💨 Wind does little: it came out of the Antarctic ice.',
  lizard: '💨 Wind is its weakness: bury it in snow. 🔥 Fire does little: it breathes fire.',
  horseman: '🌧️ Rain is his weakness: it puts out the jack-o\'-lantern. 🌫️ Smoke does little: he rides through mist.',
});

// ── /six-demon-bag (§1, §3) ─────────────────────────────────────────────

/**
 *   egg [6]          Egg Shen, quoted, for the cast message and the status
 *                    card. Includes the quote marks; the engine italicises
 *   cast [4]         the cast message's opener: {caster}
 *   notes            fragments for the play line's Chi note: no placeholders
 *   status           the status card's fixed text: no placeholders
 *   peace.on/off [2] public: {user}
 *   peace.lifted     making peace lifted a hex: {user} {charm}
 *   peace.tooSoon    private: {when} (peace switches off only after a week)
 *   shrug.free [3]   {user}; shrug.paid [2] {user} {chi};
 *   shrug.broke      {user} (free: under the shrug cost)
 *   expired.bless/hex  ran out unused: {user} {charm}
 *   paidOff          the caster's pay: {caster} {charm} {points}
 *   washed           Cleansing Rain at the cast: {target} {statuses}
 *   boostAbout       what a siege boost is, for /help and the status card
 *   boostCure [2]    a Rain boost cured a poisoned fighter: {caster} {target}
 *   refusals         private, cost nothing; see each line's placeholders
 */
export const SIX_DEMON_BAG = deepFreeze({
  name: 'Six-Demon Bag', emoji: '🎒',
  egg: [
    '"Wind, fire, all that kind of thing!"',
    '"Six demons in one bag. Don\'t open it on the bus."',
    '"It\'s not the bag that does it. It\'s knowing which demon to let out."',
    '"Chi is like gas money. Spend it on your friends and the road gets shorter."',
    '"A blessing comes back to the one who gives it. A hex just comes back."',
    '"Feel that? That\'s the bag. It likes you. Mostly."',
  ],
  cast: [
    '🎒 {caster} reaches into the Six-Demon Bag.',
    '🎒 {caster} loosens the drawstring on the Six-Demon Bag.',
    '🎒 {caster} shakes the Six-Demon Bag, and something inside shakes back.',
    '🎒 {caster} picks one demon out of six.',
  ],
  notes: {
    full: 'the bag\'s full',
    capped: 'that\'s all the Chi for today',
  },
  status: {
    title: '🎒 The Six-Demon Bag',
    nothing: 'Nothing on you right now. Not a blessing, not a hex.',
    peace: '☮️ At peace: no hexes, either way.',
    hexesOff: 'Hexes are switched off on this server.',
  },
  peace: {
    on: [
      '☮️ {user} ties the bag shut, as far as hexes go. No hexes on {user}, and none from {user}.',
      '☮️ {user} makes peace. Hexes won\'t land on {user}, and {user} won\'t cast any. Blessings are still welcome.',
    ],
    off: [
      '☮️ {user} opens the bag again. Hexes go both ways now.',
      '☮️ {user}\'s peace is over. Hexes can land, and be cast, again.',
    ],
    lifted: '☮️ Making peace lifted the {charm} on {user}.',
    tooSoon: '☮️ Peace holds for a week once it\'s made. You can switch it off {when}.',
    alreadyOn: '☮️ You\'re already at peace.',
    alreadyOff: '☮️ You\'re not at peace, so there\'s nothing to switch off.',
  },
  shrug: {
    free: [
      '🤷 {user} shrugs off the hex. "Give me your best shot, pal. I can take it."',
      '🤷 {user} looks that big ol\' hex right square in the eye, and shrugs it off.',
      '🤷 {user} rolls both shoulders, and the hex slides off like rain off a windshield.',
    ],
    paid: [
      '🤷 {user} shrugs off the hex. It cost {chi} Chi, but some things are worth it.',
      '🤷 {user} pays the bag {chi} Chi to be rid of the hex. Money well spent.',
    ],
    broke: '🤷 {user} shrugs off the hex. The bag knows {user} is short on Chi, so this one\'s on the house.',
    none: '🤷 There\'s no hex on you to shrug off. Enjoy it.',
  },
  expired: {
    bless: '⌛ {user}\'s {charm} wore off before it did anything.',
    hex: '⌛ The {charm} on {user} ran its course and faded.',
  },
  paidOff: '✨ {caster}\'s {charm} paid off: {caster} {points}.',
  washed: '🌧️ The rain washes {statuses} off {target}.',
  boostAbout: 'In a siege, a blessing on a fighter is a boost: their next 3 attacks carry the element, harder if the monster is weak to it. A Rain boost also cures poison.',
  boostCure: [
    '🌧️ {caster}\'s rain rinses the poison right out of {target}. Cured, and dripping.',
    '🌧️ The rain from {caster}\'s bag washes {target} clean of the poison. Field medicine, Egg Shen style.',
  ],
  refusals: {
    self: '🎒 The bag doesn\'t work on yourself. Egg Shen tried once. It was a whole thing.',
    bot: '🎒 Bots have no Chi. The bag stays shut.',
    noChi: '🎒 The bag is empty: that takes {need} Chi and you have {chi}. Good plays fill it.',
    castLimit: '🎒 The bag needs its rest: that\'s {count} casts today, the most there is. It opens again tomorrow (UTC).',
    hexLimit: '🎒 One hex a day, and you\'ve cast yours. A blessing still works if you have a cast left.',
    alreadyBlessed: '🎒 {target} is already carrying a blessing. One at a time.',
    alreadyHexed: '🎒 {target} already has a hex on them. One is plenty.',
    alreadyBoosted: '🎒 {target} is already carrying a boost. One at a time.',
    warded: '🎒 {target} is warded after the last hex: no hexes until {when}.',
    receivedLimit: '🎒 {target} has taken {count} hexes today, the most anyone takes. Let them be.',
    peaceTarget: '🎒 {target} has made peace: no hexes, either way. A blessing still works.',
    peaceSelf: '🎒 You\'ve made peace, so you can\'t hex anyone. Blessings are still yours to give.',
    pairLimit: '🎒 You\'ve hexed {target} recently. You can again {when}.',
    fighting: '🎒 {target} is fighting the monster, and the siege is co-op: no hexes on fighters. A blessing becomes a boost.',
    inactive: '🎒 {target} hasn\'t played this week. The bag only hexes people who are around to shrug it off.',
    hexesOff: '🎒 Hexes are switched off on this server. Blessings still work.',
  },
});

// ── /pork-chop-express (§1, §4.1) ───────────────────────────────────────

/**
 * Jack Burton's truck carries the gifts. CB-radio patter, PG-13.
 *   send [3]            public, pings nobody: {sender} {receiver} {item} {when}
 *   onTheRoad [3]       /pork-chop-express track, one per gift in transit:
 *                       {item} {receiver} {when}
 *   delivered [4]       the NEW message that pings the receiver:
 *                       {sender} {receiver} {item}
 *   quiet               it landed but the bot couldn't post, for the card:
 *                       {sender} {receiver} {item}
 *   returned [2]        no room by delivery, back to the sender:
 *                       {sender} {receiver} {item}
 *   returnedPoints      no room at either end, points instead:
 *                       {sender} {receiver} {item} {points}
 *   paidOff [2]         the sender's pay: {sender} {item} {points}
 *   track, signoff [3]  /track's fixed text and its footer: no placeholders
 *   refusals            private, cost nothing
 */
export const PORK_CHOP_EXPRESS = deepFreeze({
  name: 'Pork-Chop Express', emoji: '🚚',
  send: [
    '🚚 This is the Pork-Chop Express, and I\'m talkin\' to whoever\'s listenin\' out there. {sender}\'s {item} is on its way to {receiver}, arriving {when}.',
    '🚚 Breaker, breaker. The Pork-Chop Express is hauling {sender}\'s {item} to {receiver}. Hammer down, arriving {when}.',
    '🚚 {sender} loads up the back of the Pork-Chop Express: one {item}, bound for {receiver}. Arriving {when}, rain or shine.',
  ],
  onTheRoad: [
    '🚚 {item} for {receiver}: somewhere out on the highway, arriving {when}.',
    '🚚 {item} for {receiver}: Jack never drives faster than he can see. Arriving {when}.',
    '🚚 {item} for {receiver}: crossing the bridge into town, arriving {when}.',
  ],
  delivered: [
    '🚚 Special delivery, {receiver}! The Pork-Chop Express pulls up with {sender}\'s {item}. It\'s in your Glovebox.',
    '🚚 Air brakes hiss outside {receiver}\'s car. Jack Burton leans out the window: "Package from {sender}. One {item}. Sign here."',
    '🚚 This is the Pork-Chop Express, and {receiver}, I\'m talkin\' to you. One {item}, from {sender}. Delivered.',
    '🚚 The Pork-Chop Express backs up to {receiver}\'s bumper, beeping. One {item} from {sender}, safe and sound. "Keep the shiny side up."',
  ],
  quiet: '🚚 {item} from {sender} rolled in quietly while {receiver} was out.',
  returned: [
    '🚚 {receiver}\'s Glovebox filled up while the truck was on the road, so the Pork-Chop Express turns around. {sender}\'s {item} is back home.',
    '🚚 No room at {receiver}\'s end. Jack shrugs and hauls the {item} back to {sender}. "Happens."',
  ],
  returnedPoints: '🚚 No room at {receiver}\'s end, and none back at {sender}\'s either. Jack trades the {item} at a truck stop: {sender} {points}.',
  paidOff: [
    '🚚 {sender}\'s {item} came good: {sender} {points}.',
    '🚚 The check is in the mail: {sender}\'s {item} paid off. {sender} {points}.',
  ],
  track: {
    title: '🚚 The Pork-Chop Express',
    nothing: 'Nothing on the road. Jack\'s at the diner.',
    sentNone: 'No gifts sent this week.',
    receivedNone: 'No gifts received this week.',
  },
  signoff: [
    '"Keep the shiny side up and the greasy side down."',
    '"This is the Pork-Chop Express, signing off."',
    '"Have ya paid your dues, Jack?" "Yessir, the check is in the mail."',
  ],
  refusals: {
    self: '🚚 You can\'t ship to yourself. Jack charges for the gas either way.',
    bot: '🚚 Bots don\'t have a Glovebox. The truck stays parked.',
    unknown: '🚚 That isn\'t an item you can send. Pick one from the list.',
    notHeld: '🚚 You don\'t have a {item} to send.',
    nightLight: '🚚 The 🔦 Night Light stays with whoever earned it. It\'s the one thing the truck won\'t haul.',
    regift: '🚚 That {item} came to you as a gift. No regifting on the Pork-Chop Express.',
    daily: '🚚 You\'ve already sent today\'s gift. The truck rolls again tomorrow (UTC).',
    receiverWeek: '🚚 {receiver} has had {count} gifts this week, the most anyone gets. Try again later.',
    pair: '🚚 You\'ve already sent {receiver} a gift this week. You can again {when}.',
    noRoom: '🚚 {receiver}\'s Glovebox has no room for another {item}.',
    newSender: '🚚 The Pork-Chop Express only hauls for regulars. Keep playing a few nights a week and it\'ll stop for you.',
    newReceiver: '🚚 {receiver} isn\'t a regular yet, so the truck can\'t deliver there. Gifts go to people who play most nights.',
  },
});

// ── /sidekick (§1, §4.2) ────────────────────────────────────────────────

/**
 * "The hero isn't the hero." The hero is Jack Burton energy (all swagger,
 * one +1); the sidekick is Wang Chi energy (does the work, takes the cut).
 *   ask [3]                  public, pings the hero: {sidekick} {hero}
 *   buttons.accept/decline   the request's button labels (≤ 80)
 *   accepted [3]             the NEW message that pings the sidekick;
 *   declined [2], expired [2]   edits to the request: all {sidekick} {hero}
 *   ended.hero/sidekick/night [2]   who ended it, or the night did: {sidekick} {hero}
 *   swagger [3]              the hero's first good play: {hero} {points}
 *   cut [3]                  the hero's good play pays the sidekick:
 *                            {sidekick} {points}, may name {hero}
 *   cutHelp [2]              the sidekick helped the hero: {sidekick} {hero} {points}
 *   cutFull                  the night's cut is in: {sidekick}
 *   heroSaved                a free or cure of your hero, double toward
 *                            the Wang Chi: {sidekick} {hero}
 *   card.sidekick / card.hero   the cards' line: {hero} / {sidekick}
 *   status.none, refusals    private
 */
export const SIDEKICK = deepFreeze({
  name: 'Sidekick pact', emoji: '🤝',
  ask: [
    '🤝 {sidekick} wants to ride shotgun with {hero} tonight. Every hero needs a sidekick, {hero}. Every sidekick knows who the real hero is.',
    '🤝 {sidekick} asks {hero} for a pact: one night, side by side. {hero} gets the spotlight. {sidekick} gets the job done.',
    '🤝 {sidekick} asks {hero} to take the wheel tonight, with {sidekick} riding shotgun and doing the real work. Deal?',
  ],
  buttons: {
    accept: 'Accept: we ride together tonight',
    decline: 'Decline: not tonight',
  },
  accepted: [
    '🤝 {sidekick} and {hero} ride together tonight.',
    '🤝 {hero} accepts. {hero} gets the swagger, {sidekick} does the work. Just like in the movie.',
    '🤝 Pact made: {hero} drives, {sidekick} rides shotgun, and somebody\'s going to end the night with lipstick on their face.',
  ],
  declined: [
    '🤝 {hero} says not tonight. {sidekick} will find another hero to make look good.',
    '🤝 {hero} declines. {sidekick} shrugs: the real hero never needed the credit anyway.',
  ],
  expired: [
    '⌛ {hero} never answered. {sidekick}\'s offer has expired.',
    '⌛ The offer from {sidekick} sat on {hero}\'s dashboard too long, and expired.',
  ],
  ended: {
    hero: [
      '🤝 {hero} ends the pact. {sidekick} goes back to being the real hero, solo.',
      '🤝 {hero} rides alone from here. Thanks for everything, {sidekick}.',
    ],
    sidekick: [
      '🤝 {sidekick} ends the pact. {hero} is on their own now. Good luck with that.',
      '🤝 {sidekick} hops out of the passenger seat. {hero} is driving solo.',
    ],
    night: [
      '🌅 The night\'s over, and so is the pact. {sidekick} and {hero} go their own ways.',
      '🌅 Sun\'s up. {hero} got the swagger, {sidekick} got the cut, and the pact is done.',
    ],
  },
  swagger: [
    '🤠 "Everybody relax, I\'m here." {hero} {points} for showing up.',
    '🤠 {hero} struts in like the hero of the picture. Swagger: {hero} {points}.',
    '🤠 {hero} flashes the grin, flexes the arms, and takes a bow. {hero} {points}.',
  ],
  cut: [
    '🥢 {hero} looks great. {sidekick} quietly takes a cut: {sidekick} {points}.',
    '🥢 {hero} gets the applause. {sidekick} gets paid: {sidekick} {points}.',
    '🥢 Behind every hero is a sidekick doing the real work. {sidekick} {points}.',
  ],
  cutHelp: [
    '🥢 {sidekick} bails {hero} out, again. {sidekick} {points}.',
    '🥢 {sidekick} patches {hero} up and gets {hero} back in the fight. {sidekick} {points}.',
  ],
  cutFull: '🥢 {sidekick}\'s cut is in for the night.',
  heroSaved: '🥢 {sidekick} saves {hero}. That counts double toward the Wang Chi. Of course it does.',
  card: {
    sidekick: '🤝 Sidekick to {hero} tonight',
    hero: '🤠 Hero tonight · {sidekick} rides with you',
  },
  status: {
    none: '🤝 No pact tonight. `/sidekick ask hero:` to ride with someone.',
  },
  refusals: {
    self: '🤝 You can\'t be your own sidekick. Even Jack Burton needed a Wang Chi.',
    bot: '🤝 Bots ride alone.',
    already: '🤝 You\'re already in a pact tonight. One at a time.',
    heroBusy: '🤝 {hero} is already in a pact tonight.',
    nightUsed: '🤝 You\'ve had your pact for tonight. Ask again after the night ends.',
    week: '🤝 You\'ve had {count} pact nights this week, the most there is. You can again {when}.',
    heroWeek: '🤝 {hero} has had {count} pact nights this week already.',
    pair: '🤝 You and {hero} rode together this week already. You can again {when}.',
    askLimit: '🤝 That\'s {count} requests tonight, the most there is. Give the heroes a rest.',
    askedTonight: '🤝 You\'ve already asked {hero} tonight.',
    pending: '🤝 You already have a request waiting on {hero}.',
    declined: '🤝 {hero} said no recently. You can ask again {when}.',
    inactive: '🤝 {hero} hasn\'t been around much lately. Pacts are for people who play most nights.',
    inactiveSelf: '🤝 Pacts are for regulars: play a few nights this week first.',
    notYours: '🤝 That\'s not your request to answer. Only {hero} can.',
    expired: '🤝 That request has expired.',
    noPact: '🤝 You\'re not in a pact right now.',
  },
});

// ── honours: the Wang Chi, the Jack Burton, backing (§4.3, §5) ──────────

/**
 * "The flashy one gets a laugh, and the helper gets paid."
 *   labels              the card's and results' labels: no placeholders
 *   wangChi [6]         the real hero (most help): {mvp}
 *   wangChiHeld [2]     nobody needed help; the top contributor: {mvp}
 *   jackBurton [8]      the killing blow: {jack}, may name {mvp}
 *   both [2]            the Wang Chi landed the killing blow too: {mvp}
 *   backing             /siege back (§4.3):
 *     placed [3], push [2], lost [3], escaped [2], refunded [2]
 *                       {backer} {fighter} {stake}
 *     wangChi [2]       {backer} {fighter} {stake} {gain} {bonus}
 *     wangChiToo        a second (or later) backer of the same Wang Chi:
 *                       {backer} {fighter} {stake} {gain} — no {bonus}: the
 *                       fighter's is once a siege, already in the first
 *                       backer's line, and would read as paid twice
 *     madeYouLook       the fighter's share: {fighter} {backer} {bonus}
 *     refusals          private, cost nothing
 */
export const HONOURS = deepFreeze({
  labels: {
    wangChi: '🗡️ Wang Chi',
    jackBurton: '🔪 The Jack Burton',
  },
  wangChi: [
    '🗡️ The Wang Chi: {mvp}. Freed the captives, cured the sick, did the real work. Gets the loot, if not the credit.',
    '🗡️ {mvp} is the Wang Chi tonight: the real hero, the one who kept everybody else in the fight.',
    '🗡️ Wang Chi honours to {mvp}, who celebrates by cleaving a green bottle clean in half, and wins the bet.',
    '🗡️ {mvp} did the saving while somebody else did the posing. That\'s a Wang Chi.',
    '🗡️ The real hero of the picture: {mvp}. Every rescue, every cure, every time.',
    '🗡️ {mvp} never asked for the spotlight, so {mvp} gets the Wang Chi instead. It\'s better.',
  ],
  wangChiHeld: [
    '🗡️ Nobody needed saving. {mvp} held the line.',
    '🗡️ Nobody needed rescuing tonight, so the Wang Chi goes to {mvp}, who hit hardest and never flinched.',
  ],
  jackBurton: [
    '🔪 "It\'s all in the reflexes." {jack} blows the smoke off a pie tin.',
    '🔪 "Everybody relax, I\'m here." {jack} arrives just in time to take the credit.',
    '🔪 {jack} lands the killing blow, fires a celebratory shot into the ceiling, and is knocked out cold by the plaster. {mvp} carries {jack} home.',
    '🔪 {jack}: "I was born ready." {mvp}: "You were asleep for most of it."',
    '🔪 "Have ya paid your dues, {jack}?" "Yessir, the check is in the mail."',
    '🔪 {jack} lands the last hit and turns to the crowd, grinning. Somebody tell {jack} there\'s lipstick on that grin.',
    '🔪 The killing blow goes to {jack}, who will be telling this story on the CB radio for the next ten years.',
    '🔪 {jack} swaggers in at the very end, throws one thing, and takes a bow. Classic Jack Burton.',
  ],
  both: [
    '🗡️🔪 Jack AND Wang? Nobody\'s buying it, {mvp}.',
    '🗡️🔪 {mvp} did all the work AND landed the blow. The real hero and the lucky one, parked in the same spot.',
  ],
  backing: {
    placed: [
      '🎲 {backer} puts {stake} on {fighter}. Somebody\'s going to be the real hero, and {backer} thinks it\'s {fighter}.',
      '🎲 {backer} backs {fighter} for {stake}. "I\'d bet the truck on {fighter}."',
      '🎲 {backer} slides {stake} across the hood of a car: it\'s riding on {fighter}.',
    ],
    wangChi: [
      '🎲 {backer} backed {fighter} ({stake}): Wang Chi! {backer} {gain}, {fighter} {bonus}.',
      '🎲 {backer} called it: {fighter} was the real hero ({stake}). {backer} {gain}, and {fighter} {bonus} for making {backer} look good.',
    ],
    wangChiToo: '🎲 {backer} backed {fighter} too ({stake}): Wang Chi! {backer} {gain}.',
    madeYouLook: '🎲 {fighter} made {backer} look good: {fighter} {bonus}.',
    push: [
      '🎲 {backer} backed {fighter} ({stake}): close, but no Wang Chi. The stake comes back.',
      '🎲 {backer} backed {fighter} ({stake}): up near the top, but not the real hero. A push, and the stake comes home.',
    ],
    lost: [
      '🎲 {backer} backed {fighter} ({stake}): not this time. The stake\'s gone.',
      '🎲 {backer} backed {fighter} ({stake}). Somebody else turned out to be the real hero. Stake lost.',
      '🎲 {backer} backed {fighter} ({stake}). "I\'m a reasonable guy, but I\'ve just experienced some very unreasonable things." Stake lost.',
    ],
    escaped: [
      '🎲 The monster got away, and {backer}\'s {stake} on {fighter} went with it.',
      '🎲 {backer} backed {fighter} ({stake}), but nobody wins when the monster walks. Stake lost.',
    ],
    refunded: [
      '🎲 The siege was called off, so {backer}\'s {stake} on {fighter} comes back.',
      '🎲 Not enough of a crew to call it, so {backer} gets the {stake} on {fighter} back.',
    ],
    refusals: {
      self: '🎲 You can\'t back yourself. Jack Burton tried. Wang Chi still won.',
      bot: '🎲 Bots don\'t fight, so they can\'t be backed.',
      noSiege: '🎲 There\'s no siege on to back anyone in.',
      notFighter: '🎲 {fighter} hasn\'t swung at the monster yet. Back someone who\'s in the fight.',
      late: '🎲 Backing closes halfway through a siege, so nobody backs the obvious winner at the end.',
      already: '🎲 You\'ve already backed someone in this siege. One bet a siege.',
      daily: '🎲 You\'ve already backed someone today. Try again tomorrow (UTC).',
      poor: '🎲 You need {stake} of this month\'s points to stake {stake}, and you have {count}.',
      inactive: '🎲 Backing is for regulars: play a few nights this week first.',
    },
  },
});

// ── the four Big Trouble bosses (§6) ────────────────────────────────────

/** The boss keys, as `/siege start monster:` stores them */
export const BOSS_KEYS = Object.freeze(['wildman', 'guardian', 'storms', 'lopan']);

/**
 * Words for the bosses, in siegeMonsters.js' shape so the engine can merge
 * them into a MONSTERS entry beside the numbers: { name, emoji, about,
 * lines: { arrive, defeat, escape, grab[3], poison[3], roar[3] } }, plus:
 *
 *   elementAbout        the card's weakness line, as MONSTER_ELEMENT_ABOUT
 *   lines.defeat        {mvp} AND {jack}
 *   lines.grab/poison   {fighter}, may name {monster}; grab says /rescue,
 *                       poison says /potion. Every boss carries all three
 *                       kinds even when its action table never draws one,
 *                       as siegeMonsters.js does for Pod People
 *   lines.roar          {monster}
 *   Every `lines` entry stays ≤ 200 characters (siegeMonsters.js' cap).
 *
 * Extra kinds, per boss (placeholders listed):
 *   wildman.lines.feral [2]       below half HP, it acts more often: {monster}
 *   guardian.lines.gaze [3]       Dazzles the top 2: {monster} {fighters}
 *   guardian.lines.hidden [2]     its grab skipped a Smoke-boosted fighter:
 *                                 {monster} {fighter}
 *   guardian.card                 the card's eye count: {count}
 *   storms.storms.<thunder|rain|lightning>   each storm: { name, emoji,
 *                                 about, fall [2] (may name {fighter}, who
 *                                 landed it) } and its own action:
 *     thunder.swell [3]           heals and swells: no placeholders
 *     thunder.explode [2]         three swells, everyone free Dazzled: none
 *     rain.duel [3]               Wounds the top fighter: {fighter}, /potion
 *     lightning.chain [3]         Shocks up to 3: {fighters}, /potion
 *   lopan.phases.<ancient|flesh>  { name, about } for the card
 *   lopan.lines.roarFlesh [3]     phase 2's roar: {monster}
 *   lopan.lines.bride [3]         phase 1's grab: {monster} {fighter}, /rescue
 *   lopan.lines.brideClock        when the wedding is: {fighter} {when}
 *   lopan.lines.brideFreed [2]    {fighter}
 *   lopan.lines.wedding [2]       nobody freed the bride: {monster} {fighter}
 *   lopan.lines.beams [3]         Dazzles two: {monster} {fighters}
 *   lopan.lines.phaseChange [2]   may name {monster}
 *   lopan.lines.foodJack [2]      the Jack Burton was food: {jack}
 *   lopan.guards.<lords|wingkong> { name, emoji, about, arrive [2|3],
 *                                 soak [2], down [2] }: all {monster}; down
 *                                 may name {fighter}
 */
export const BOSSES = deepFreeze({
  wildman: {
    name: 'The Wild Man', emoji: '🦧',
    about: 'Lo Pan\'s basement beast. Pies stick in the fur, potions barely bother it, and when it\'s hurt it goes berserk.',
    elementAbout: '🔥 Fire is its weakness: beasts fear fire. 🌧️ Rain does little: it lives in the sewer.',
    lines: {
      arrive: 'Something huge and hairy climbs out of the storm drain, roaring. Lo Pan keeps it in the basement. Lo Pan doesn\'t know what it is either.',
      defeat: '{mvp} drives it back with a torch, and the Wild Man whimpers down the storm drain. {jack} takes a bow.',
      escape: 'The Wild Man climbs onto the back of the Pork-Chop Express and rides off into the night. Jack Burton has no idea.',
      grab: [
        '{monster} scoops up {fighter} and tucks them under one arm like a sack of rice. Somebody /rescue them!',
        '{monster} drags {fighter} toward the storm drain by one ankle, grunting happily. Somebody /rescue them!',
        '{fighter} gets a bear hug from {monster}. It does not let go. Somebody /rescue them!',
      ],
      poison: [
        '{monster} sneezes on {fighter}. It is the worst thing that has ever happened to {fighter}. A helpful /potion will cure them!',
        '{monster} licks {fighter}, fondly, with a tongue like a wet bath mat. {fighter} turns green. A helpful /potion will cure them!',
        '{monster} shakes sewer water all over {fighter} like a dog after a bath. Something in it bites. A helpful /potion will cure them!',
      ],
      roar: [
        '{monster} pounds its chest and roars at the screen. The screen does not roar back.',
        '{monster} eats a lawn chair, then looks at you like you\'re next.',
        '{monster} finds the popcorn machine and is, briefly, at peace.',
      ],
      feral: [
        'Hurt, {monster} goes berserk. It\'s coming for you more often now.',
        '{monster} howls, rips the door off a station wagon, and comes back faster. Somebody made it mad.',
      ],
    },
  },

  guardian: {
    name: 'The Guardian', emoji: '👁️',
    about: 'Lo Pan\'s floating spy. It grabs whoever is doing the most, dazzles the top two, and pies just bob off it. Smoke hides you.',
    elementAbout: '🌫️ Smoke is its weakness: it can\'t see through it. ⚡ Lightning does little: light is what it\'s made of.',
    card: '👁️ ×{count} eyes open',
    lines: {
      arrive: 'Something floats over the concession stand: a fleshy balloon covered in eyes. Dozens of them. Every one is looking at you. Lo Pan\'s Guardian has found the drive-in.',
      defeat: '{mvp} shuts the last eye, and the Guardian sags out of the sky with a long, sad whistle. {jack} claims to have done it with one throw.',
      escape: 'The Guardian drifts up and away, still watching. Lo Pan knows all your names now.',
      grab: [
        'Every eye on {monster} swivels to {fighter}, and a tendril snaps around their ankle. It\'s taking them to Lo Pan. Somebody /rescue them!',
        '{monster} has watched {fighter} all night. Now it\'s done watching: up {fighter} goes, toward the clouds. Somebody /rescue them!',
        '{monster} lowers itself over {fighter} like a very nosy chandelier and lifts them clean off the ground. Somebody /rescue them!',
      ],
      poison: [
        '{monster} weeps a single sticky tear onto {fighter}. It burns like a bad onion. A helpful /potion will cure them!',
        '{fighter} meets the gaze of {monster} for too long and comes away cross-eyed and queasy. A helpful /potion will cure them!',
        '{monster} drips something glowing onto {fighter} from a great height. A helpful /potion will cure them!',
      ],
      roar: [
        '{monster} blinks. All of it. One eye at a time.',
        '{monster} bobs over the snack bar, reporting everything it sees to Lo Pan. Everything.',
        '{monster} watches you eat a nacho. It judges the nacho.',
      ],
      gaze: [
        'Forty eyes on {monster} open at once and stare down {fighters}. Nobody can look away. Dazzled: half damage on the next attack.',
        '{monster} turns every eye it has on {fighters}. The stare goes right through. Dazzled: half damage on the next attack.',
        'A flash from a dozen pupils on {monster} hits {fighters}, and everyone sees spots. Dazzled: half damage on the next attack.',
      ],
      hidden: [
        '🌫️ {monster} searches the lot for {fighter} and finds only smoke.',
        '🌫️ {fighter} is hiding in the smoke. Every eye on {monster} slides right past.',
      ],
    },
  },

  storms: {
    name: 'The Three Storms', emoji: '⛈️',
    about: 'Three foes, three HP bars. Turn the Storms on each other: Lightning pops Thunder, Rain grounds Lightning, Thunder drowns out Rain.',
    elementAbout: '⚡ Lightning hits Thunder hardest, 🌩️ Thunder hits Rain, 🌧️ Rain hits Lightning. Each storm shrugs off its own element.',
    lines: {
      arrive: 'Three men in wide straw hats drop out of the sky into Row A. Thunder. Rain. Lightning. The Three Storms have come for the drive-in.',
      defeat: 'The last Storm falls. {jack} takes the credit. {mvp} takes a nap. The sky clears.',
      escape: 'The Three Storms ride the lightning back to Lo Pan, laughing. Their hats are the last thing to go.',
      grab: [
        'Thunder scoops up {fighter} and leaps into the sky with them. Somebody /rescue them!',
        'Thunder tucks {fighter} under one huge arm and bounds off over the rooftops toward Lo Pan. Somebody /rescue them!',
        'Thunder lands in front of {fighter} with a BOOM that cracks the asphalt, and carries them off in a cloud. Somebody /rescue them!',
      ],
      poison: [
        'Lightning flicks a spark at {fighter}, and every hair on {fighter} stands straight up. It hurts. A helpful /potion will cure them!',
        'Rain flicks his blade, and a cold mist settles on {fighter} that won\'t shake off. A helpful /potion will cure them!',
        'Thunder bellows in {fighter}\'s face, and {fighter} goes woozy and gray. A helpful /potion will cure them!',
      ],
      roar: [
        '{monster} bow to each other, and the sky over the screen turns an angry green.',
        '{monster} float three feet off the ground, hats tilted, arms folded. Nobody on the lot is impressed. Everybody is scared.',
        '{monster} laugh at the same moment, in three different kinds of weather.',
      ],
    },
    storms: {
      thunder: {
        name: 'Thunder', emoji: '🌩️',
        about: 'The big one. He grabs fighters and swells, and at three swells he explodes. Weak to ⚡ Lightning, immune to 🌩️ Thunder.',
        swell: [
          'Thunder breathes in, and in, and in. He\'s getting bigger. That can\'t be good.',
          'Thunder puffs up like a parade balloon and grins. His wounds close over.',
          'Thunder swells another size. His hat is starting to look very small.',
        ],
        explode: [
          'Thunder swells, and swells, and BOOM. Everyone still free is knocked flat and seeing stars, and Thunder comes down a size. Dazzled: half damage on the next attack.',
          'Thunder pops like a paper bag the size of a house. Everyone still free is Dazzled, and Thunder is a good deal smaller.',
        ],
        fall: [
          'Thunder swells, and swells, and BOOM. When the smoke clears there\'s a hat. Everyone still free is Dazzled.',
          '{fighter} lands the last hit on Thunder, who swells up with rage and goes off like a blimp full of fireworks. Everyone free is Dazzled.',
        ],
      },
      rain: {
        name: 'Rain', emoji: '🌧️',
        about: 'The swordsman. He duels the top fighter, and cuts pies in half mid-air. Weak to 🌩️ Thunder, immune to 🌧️ Rain.',
        duel: [
          'Rain draws his sword and salutes {fighter}, the best fighter on the lot. One cut. {fighter} is Wounded: half damage until a helpful /potion patches them up.',
          'Rain tips his hat brim to {fighter}: a challenge. Steel flashes once. Wounded: half damage until a helpful /potion patches {fighter} up.',
          'Rain walks through the drizzle toward {fighter}, blade low. One stroke, too fast to see. Wounded: half damage until a helpful /potion fixes it.',
        ],
        fall: [
          'Rain\'s sword clatters to the asphalt. {fighter} lands the cut. Wang Chi would be proud.',
          'Rain bows to {fighter}, a real swordsman\'s bow, and drops. The drizzle stops all at once.',
        ],
      },
      lightning: {
        name: 'Lightning', emoji: '⚡',
        about: 'The flier. Chain lightning shocks up to three fighters, and he\'s too fast to doom. Weak to 🌧️ Rain, immune to ⚡ Lightning.',
        chain: [
          'Lightning crackles across the lot and jumps through {fighters}, one to the next. Shocked: half damage until a helpful /potion cures it.',
          'Lightning streaks overhead and drops a chain of bolts on {fighters}. Shocked: half damage until a helpful /potion cures it.',
          'Lightning touches one car antenna, and the spark hops through {fighters} like a game of tag. Shocked: half damage until a helpful /potion cures it.',
        ],
        fall: [
          'Lightning sputters out like a kicked extension cord.',
          '{fighter} grounds Lightning for good. He fizzles, flickers and goes dark, like a neon sign at closing time.',
        ],
      },
    },
  },

  lopan: {
    name: 'Lo Pan', emoji: '🏮',
    about: 'Two phases. The Ancient is a spirit: only magic truly hurts him. In the Flesh, anything thrown will do. Don\'t let him marry anyone.',
    elementAbout: 'No weakness and no resistance: every element works on him. Magic hits the Ancient hard; in the Flesh he\'s a sorcerer and shrugs a little off.',
    phases: {
      ancient: {
        name: 'Lo Pan, the Ancient',
        about: 'A frail old man in a wheelchair, his spirit looming behind him. Pies and potions pass through. Only magic truly hurts a spirit.',
      },
      flesh: {
        name: 'Lo Pan, in the Flesh',
        about: 'Young, tall and laughing, and solid enough to hit. Anything thrown will do.',
      },
    },
    lines: {
      arrive: 'A wheelchair squeaks out of the fog behind the screen. In it sits David Lo Pan, two thousand years old and in no mood. Behind him, something tall and glowing opens its mouth.',
      defeat: 'Lo Pan falls. {jack} blows on a pie tin like it\'s a six-shooter. {mvp} did everything else, as usual.',
      escape: 'Lo Pan rises into the projector beam, cackling. A gong rings somewhere. He\'ll be back for his bride.',
      grab: [
        '{monster} sweeps one sleeve, and {fighter} is yanked across the lot by an invisible hand. Somebody /rescue them!',
        '{monster} points one long fingernail at {fighter}, and {fighter} floats off toward the alley, kicking. Somebody /rescue them!',
        '{monster} laughs, and the ground opens under {fighter}, toward the Hell of the Upside-Down Sinners. Somebody /rescue them!',
      ],
      poison: [
        '{monster} breathes a cold, ancient breath over {fighter}, who goes pale and shivery. A helpful /potion will cure them!',
        '{monster} curses {fighter} with a flick of the wrist. {fighter} feels two thousand years older. A helpful /potion will cure them!',
        '{monster} touches {fighter} on the shoulder, and the color drains out of {fighter} like an old print. A helpful /potion will cure them!',
      ],
      roar: [
        '"Indeed!" says {monster}, to nobody in particular.',
        '{monster}: "You were not brought upon this world to get it!"',
        '{monster} hisses a two-thousand-year-old curse, and every light on the lot turns green.',
      ],
      roarFlesh: [
        '{monster} stretches, enjoying having a body again. "Indeed!"',
        '{monster} laughs, tall and young, and the projector beam bends toward him like it\'s afraid.',
        '{monster} straightens his robes, very pleased with how good he looks after two thousand years.',
      ],
      bride: [
        '"Such beautiful green eyes," says {monster}, and {fighter} floats up, up and away to the wedding. Somebody /rescue them!',
        '{monster} wheels closer and peers at {fighter}. "Green eyes. At last." {fighter} is lifted off toward the altar. Somebody /rescue them!',
        'Green eyes, like Gracie Law\'s, like Miao Yin\'s. Now {fighter} has them, and {monster} has {fighter}. Somebody /rescue them!',
      ],
      brideClock: '💍 The wedding is at {when}. Free {fighter} before then, or Lo Pan gets his flesh back.',
      brideFreed: [
        '💍 {fighter} is pulled back down to earth just before the vows. No wedding tonight.',
        '💍 {fighter} is free, and the wedding is off. Somewhere, an old man in a wheelchair is furious.',
      ],
      wedding: [
        'Nobody got there in time. The gong rings, the wedding goes ahead, and {monster} steps out of the old body, whole again. {fighter} is out of the fight.',
        '{fighter} was never freed. Candles, gongs, a very bad wedding, and {monster} is made flesh. {fighter} is out of the fight, and he\'s stronger for it.',
      ],
      beams: [
        '{monster} opens his mouth and light pours out, straight into the eyes of {fighters}. Dazzled: half damage on the next attack.',
        '{monster} raises both hands, and twin beams of light pin {fighters} where they stand. Dazzled: half damage on the next attack.',
        'Light blazes out of the eyes of {monster} and sweeps across {fighters}. Everyone sees spots. Dazzled: half damage on the next attack.',
      ],
      phaseChange: [
        'The old man\'s spirit comes apart in a storm of light, and steps back out in the flesh. Lo Pan is whole, and very annoyed. "Indeed!"',
        'The wheelchair rolls away empty. {monster} stands up out of the light, young and tall, and cracks his knuckles. Round two.',
      ],
      foodJack: [
        'Lo Pan is mid-gloat when something thrown lands right between his eyes. {jack}: "It\'s all in the reflexes."',
        'Lo Pan opens his mouth for one last "Indeed!" and {jack}\'s throw lands square on his forehead. "It\'s all in the reflexes."',
      ],
    },
    guards: {
      lords: {
        name: 'the Lords of Death', emoji: '💀',
        about: 'The street gang from the airport. They take the hits meant for Lo Pan until they\'re cleared.',
        arrive: [
          'The Lords of Death roll up in a stolen station wagon and pile out between you and {monster}. Get through them first.',
          'Leather jackets, chains and bad attitudes: the Lords of Death, the gang from the airport, are guarding {monster} tonight.',
        ],
        soak: [
          '💀 The Lords of Death take that one for {monster}.',
          '💀 A Lord of Death steps in the way. That hit never reached {monster}.',
        ],
        down: [
          'The last of the Lords of Death limps back to the station wagon. Nothing stands between you and {monster} now.',
          '{fighter} scatters the Lords of Death across three rows of cars. The way to {monster} is open.',
        ],
      },
      wingkong: {
        name: 'Wing Kong hatchet men', emoji: '🪓',
        about: 'Lo Pan\'s own. They take the hits meant for him until they\'re cleared. A pie in the face scatters a hatchet man.',
        arrive: [
          'A dozen Wing Kong hatchet men come over the fence, hatchets out. They stand between you and {monster}.',
          'Another wave of Wing Kong hatchet men pours out of the alley, quiet as cats. {monster} smiles.',
          'Somewhere a gong rings, and the Wing Kong answer it. A fresh line of hatchet men forms up in front of {monster}.',
        ],
        soak: [
          '🪓 A Wing Kong hatchet man takes that one for {monster}.',
          '🪓 A pie in the face scatters a hatchet man, but that hit never reached {monster}.',
        ],
        down: [
          'The last Wing Kong hatchet man drops his hatchet and runs for it. {monster} is wide open.',
          'The Chang Sing arrive just in time, {fighter} leads the charge, and the Wing Kong scatter. Nothing between you and {monster} now.',
        ],
      },
    },
  },
});

/**
 * What every boss shares:
 *   crew [2]     fewer than {count} fighters: the pool only, no boss loot
 *                or titles ("Big Trouble needs a crew", §6.1)
 *   statuses     the three boss statuses, for the card and /siege status:
 *                { name, emoji, about }, no placeholders. Dazzled reuses
 *                Spooked; Wounded and Shocked reuse poisoned (§6.1)
 */
export const BOSS_SHARED = deepFreeze({
  crew: [
    '⛩️ Big Trouble needs a crew. With fewer than {count} fighters it\'s the pool only: no boss loot, no boss titles.',
    '⛩️ Big Trouble needs a crew. The pool is paid, but boss loot and boss titles want {count} fighters or more.',
  ],
  statuses: {
    dazzled: { name: 'Dazzled', emoji: '😵', about: 'half damage on the next attack' },
    wounded: { name: 'Wounded', emoji: '🩸', about: 'half damage until a helpful /potion patches it up' },
    shocked: { name: 'Shocked', emoji: '⚡', about: 'half damage until a helpful /potion cures it' },
  },
});

// ── happenings, twists, items, titles (§7) ──────────────────────────────

/**
 * Two happenings, in gameHappenings.js' words shape (the engine adds
 * minutes, rate, minPlayers and mods). `announce` names no duration: the
 * pace scales it, and the embed already says when it ends.
 *   name, emoji, tag, about, short, announce, ended   no placeholders
 *   upsideDown.flipped   under a flipped play: {target} {points}
 *   tourBus.chi          under a play whose Chi doubled: {user}
 */
export const HAPPENINGS_BTILC = deepFreeze({
  upsideDown: {
    name: 'The Hell of the Upside-Down Sinners', emoji: '🙃', tag: '🙃',
    about: 'What a play does to its target is upside-down: a pie in the face is a kindness, and kindness stings a little. The player\'s own points don\'t change.',
    short: 'plays on others land upside-down',
    announce: '🙃 **The Hell of the Upside-Down Sinners!** Everything you do to someone lands upside-down: a pie in the face is a kindness, and kindness stings a little. Your own points are safe.',
    ended: '🙃 The world rights itself. Pies sting again, and kindness is kind again.',
    flipped: '🙃 Upside-down: {target} {points}.',
  },
  tourBus: {
    name: 'Egg Shen\'s Tour Bus', emoji: '🚌', tag: '🚌',
    about: 'Chi earned counts double, and every cast costs 1 Chi less.',
    short: 'Chi counts double, casts cost 1 less',
    announce: '🚌 **All aboard for the Chinatown tour!** Egg Shen\'s Tour Bus is rolling through the drive-in: the Chi you earn counts double, and every cast costs 1 less.',
    ended: '🚌 Last stop, everybody off. Egg Shen\'s Tour Bus pulls away, and the bag goes back to full price.',
    chi: '🚌 Tour Bus: {user}\'s Chi counts double.',
  },
});

/**
 * Two twists, in gameEventLines.js' TWIST_FLAVOUR voice (no leading emoji:
 * twistLine adds "🎲 Twist! 🧧 Red Envelope:").
 *   lines [3]   the flavour: {user}
 *   effect      what it did: redEnvelope {user} {chi}; chingDai {user} {charm}
 */
export const TWISTS_BTILC = deepFreeze({
  redEnvelope: {
    name: 'Red Envelope', emoji: '🧧',
    lines: [
      '{user} finds a red envelope tucked under the windshield wiper. Inside: Chi, and a note that just says "for luck."',
      'A red envelope slides out of {user}\'s popcorn bucket. Somebody out there wishes {user} well.',
      'Egg Shen leans out of the tour bus window and hands {user} a red envelope. "Good fortune. Don\'t spend it all on hexes."',
    ],
    effect: '{user} +{chi} Chi, on top of the day\'s cap.',
  },
  chingDai: {
    name: 'Ching Dai\'s Curse', emoji: '🀄',
    lines: [
      'An emperor two thousand years dead is still mad about something, and today it\'s {user}.',
      'The curse that kept Lo Pan out of his body for two thousand years has a little left over. It lands on {user}.',
      'A cold wind blows through {user}\'s car, all the way from 272 B.C. Ching Dai never forgave anybody, and {user} is anybody.',
    ],
    effect: '{charm} lands on {user}, with no caster. {user} can /six-demon-bag shrug it off.',
  },
});

/**
 * Two items, in ITEMS' words shape (the engine adds cap, passive, game, kit).
 *   name, emoji, about   the Glovebox's description
 *   choiceAbout          the autocomplete's few words (≤ 40), like
 *                        ITEM_EFFECTS' `short`
 *   blackBlood.used [2]  drunk in /siege attack: {user} {when} (when it wears off)
 *   blackBlood.cured     it cured poison: {user}
 *   blackBlood.spared    an action passed them over: {user} {monster},
 *                        plural-safe (any monster)
 *   jadeCharm.fired [2]  it turned a hex aside: {caster} {target}
 */
export const ITEMS_BTILC = deepFreeze({
  blackBlood: {
    name: 'Black Blood of the Earth', emoji: '🖤',
    about: 'Egg Shen\'s potion, siege only. For 10 minutes your attacks can\'t backfire and the monster can\'t grab or poison you. Cures poison. Boss loot only.',
    choiceAbout: 'no backfires, no grabs, cures poison',
    used: [
      '🖤 {user} knocks back the Black Blood of the Earth. "Feel pretty good." Until {when}: no backfires, no grabs, no poison.',
      '🖤 {user} drinks Egg Shen\'s potion in one go, and the world goes green at the edges. Nothing can touch {user} until {when}.',
    ],
    cured: '🖤 The Black Blood burns the poison right out of {user}.',
    spared: '🖤 The Black Blood of the Earth does its work: nothing from {monster} can touch {user} right now.',
  },
  jadeCharm: {
    name: 'Jade Charm', emoji: '🧿',
    about: 'Works by itself: turns aside the next hex cast on you. The caster\'s Chi and cast are spent and nothing lands. 24 h cooldown.',
    choiceAbout: 'turns aside the next hex',
    fired: [
      '🧿 {target}\'s Jade Charm turns {caster}\'s hex aside. Nothing lands, and the Chi and the cast are spent.',
      '🧿 {caster}\'s hex hits {target}\'s Jade Charm and slides off like rain off glass. The bag keeps the Chi.',
    ],
  },
});

/**
 * The seven titles (§7), in TITLES' words shape (the engine adds `need` and
 * the counter). `about` is the "You need" text for the docs and the card.
 * Titles are ≤ 32 characters, the card's widest (tests/game-card.test.js),
 * which is why the design's "Wind, Fire, All That Kind of Thing" (34) is
 * "All That Kind of Thing" here; its `about` keeps the whole quote.
 *
 * Every badge is unique across every title, these and gameRewards.TITLES
 * (tests/title-badges.test.js): a badge is how the card and the leaderboard
 * tell titles apart at a glance. So the Wang Chi is 🥋, the martial artist
 * (🗡️ is Monster Hunter's), and It's All in the Reflexes is 🪃, the thrown
 * knife that comes back (🔪 is Final Girl's). OPEN QUESTION 4 for Doug (R2
 * brief §9): those two are the defaults; change them here, and the test
 * says if a new pick collides.
 */
export const TITLES_BTILC = deepFreeze([
  { key: 'wang-chi', title: 'Wang Chi', badge: '🥋', about: 'Be the Wang Chi of 5 won sieges.' },
  { key: 'everybody-relax', title: 'Everybody Relax, I\'m Here', badge: '🤠', about: 'Land the Jack Burton 10 times.' },
  { key: 'reflexes', title: 'It\'s All in the Reflexes', badge: '🪃', about: 'Land the Jack Burton on Lo Pan.' },
  { key: 'pillars-of-heaven', title: 'Shake the Pillars of Heaven', badge: '⛩️', about: 'Fight in a won siege against each of the four Big Trouble bosses, with a crew of 3 or more.' },
  { key: 'wind-fire', title: 'All That Kind of Thing', badge: '🎒', about: 'Have blessings of all six elements pay off. "Wind, fire, all that kind of thing!"' },
  { key: 'check-in-the-mail', title: 'The Check Is in the Mail', badge: '🚚', about: 'Send 10 gifts that pay off on a good play.' },
  { key: 'real-hero', title: 'The Real Hero', badge: '🥢', about: 'Earn 60 points as a sidekick\'s cut.' },
]);

/** The two existing titles whose requirement changes (§5: the MVP becomes the Wang Chi) */
export const TITLE_ABOUT_UPDATES = deepFreeze({
  'siege-mvp': 'Be the Wang Chi of a won siege, once.',
  legend: 'Be the Wang Chi of 10 won sieges.',
});

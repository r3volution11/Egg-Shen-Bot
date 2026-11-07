// The games' example Discord messages, drawn by DiscordMessage.vue:
//   <DiscordCard name="game-card" />
//
// Captured from the bot's own renderers (gameCard.js, leaderboardCard.js,
// siegeCard.js, happeningScheduler.js, gameScores.js resultLine and
// extraLines) on 2026-11-04, against real store state: a few weeks of
// simulated plays by seven members, Sam's record from scripts/game-demo.js,
// and a week-long siege of The Blob driven through siegeStore. The kit was
// a fake registry with every icon "uploaded", so each custom emoji shows as
// [kit:code] (drawn from docs/public/emojis/<code>.png); timestamps are
// [ts:…] and mentions [mention:@Name], as in discordCards.js. A play's
// reply is trimmed to the lines the page talks about. When a card's
// wording changes in the bot, change it here too.
//
// The siege cards are one week campaign, its numbers worked out with the
// real formula (siegeStore.siegeHp and potOf; recomputed 2026-11-06, after
// the 2026-11-05 retune): a server with 15 members active this week, its
// first week campaign (it expects 35% of them: 5 fighters), dial 1, The
// Blob (×1 HP). It arrives Sunday 8 PM US Eastern (Monday 01:00 UTC) with
// round(13.5 × 5 × 7) = 473 HP and the pot at its floor of 24, and ends
// the next Sunday at 7 AM (12:00 UTC). Night 1: six fighters, 6
// fighter-nights (+27 HP each: 635), 220 damage (415 left), the pot still
// 24. Night 2: Sam is the third one back (9 fighter-nights: 716 HP, a pot
// of 36) after 46 damage that night; by the card, four are back (10: 743
// HP, a pot of 40) and 120 dealt that night (403 left). The top three's
// damage adds up within those nights' (Kim 72 + 16, Sam 52 + 18, Alex 44 + 18).

const BAR8 = '[kit:bgl][kit:bgm][kit:bgm][kit:bgm][kit:bgm][kit:bgm][kit:bgm][kit:ber]';
const ENDS = '[ts:November 8, 2026 7:00 AM]';
const HOW_TO_FIGHT = '`/siege attack weapon:food|doom|potion`';

export const GAME_CARDS = {
  'game-play': {
    label: 'Example: a food fight throw. The line names both members, and the small grey line under it says it hit and gives the points: Sam +3 with a streak of 3, Alex −1',
    message: {
      command: { user: 'Sam', name: '/foodfight throw' },
      time: 'Today at 8:12 PM',
      content: '🥧 [mention:@Sam] winds up like a Three Stooges short and plants a cream pie square on [mention:@Alex]. *Nyuk nyuk nyuk.*\n-# 🎯 Hit! Sam +3 (42 pts · 🔥 3 in a row) · Alex −1',
    },
  },

  'game-play-rewards': {
    label: 'Example: a throw that pays off. Under the points line: the nights-in-a-row bonus, a prize (25 hits bring a Golden Pie and +3) and a title (Pie Sniper, +10)',
    message: {
      command: { user: 'Sam', name: '/foodfight throw' },
      time: 'Today at 9:05 PM',
      content: '🥧 [mention:@Sam] winds up like a Three Stooges short and plants a cream pie square on [mention:@Alex]. *Nyuk nyuk nyuk.*\n-# 🎯 Hit! Sam +3 (414 pts · 🔥 15 in a row) · Alex −1\n-# 🌕 Creature of the Night: +1 (1 of 5 today)\n-# 🎁 25 hits! Sam gets a 🥧 Golden Pie and +3.\n-# 📜 Sam earned a title: 🥧 Pie Sniper (+10). Show it with /scoreboard title:',
    },
  },

  'game-twist': {
    label: 'Example: a helpful potion that worked, followed by a twist: Loose Change, and Kim +3',
    message: {
      command: { user: 'Kim', name: '/potion give' },
      time: 'Today at 9:06 PM',
      content: '🧃 [mention:@Kim] tosses [mention:@Jo] an Estus Flask. \'Praise the sun!\' 💚 +100 HP\n-# 💚 It worked! Kim +1 (88 pts · 🔥 12 in a row) · Jo +2\n-# 🎲 Twist! 💰 Loose Change: Kim digs through the seat cushions and finds a few bucks and a Junior Mint of unknown age. Kim +3.',
    },
  },

  'game-happening': {
    label: 'Example: a happening\'s announcement, a new message: the moon is full, and for the next 24 hours every doom scores double, both ways',
    message: {
      time: 'Today at 9:05 PM',
      content: '🌕 **The moon is full over the Drive-In.** For the next 24 hours every /doom scores double, both ways. Lock your car doors.',
      embeds: [{
        color: 0xF4E3A1,
        title: '🌕 Full Moon',
        description: 'Dooms score double, both ways.\nEnds [ts:in a day]',
      }],
    },
  },

  'game-happening-play': {
    label: 'Example: a doom during the Full Moon, its points line tagged 🌕×2: Riley +6 and Max −2',
    message: {
      command: { user: 'Riley', name: '/doom fate' },
      time: 'Today at 9:10 PM',
      content: '🧟 [mention:@Max] is surrounded at the mall. [mention:@Riley] watches from the escalator, eating a pretzel. Dawn of the Dead, but make it lunch.\n-# 💀 Doomed! 🌕×2 Riley +6 (25 pts) · Max −2',
    },
  },

  'game-card': {
    label: 'Example: Sam\'s game card from /scoreboard. Total and rank, a column for each game, rewards in progress with bars, fourteen nights in a row, the Glovebox, titles, and the twist statuses in effect',
    message: {
      command: { user: 'Sam', name: '/scoreboard' },
      time: 'Today at 9:06 PM',
      embeds: [{
        color: 0xE67E22,
        author: 'Sam',
        title: 'Game card',
        description: '[kit:coin] `1,023` points · [kit:med1] `1st` of 7 players\n[kit:scroll] *Red Shirt* 👕',
        fields: [
          { name: '[kit:potion] Potions', value: '`150` pts · #1\n128 plays\n54 💚 · 59 ☠️ · 15 🔄\nReceived: 70 💚 · 66 ☠️\n[kit:flame] best 6', inline: true },
          { name: '[kit:food] Food Fight', value: '`414` pts · #1\n282 plays\n150 🎯 · 31 💨 · 12 🔄 · 74 😋 · 9 🤢 · 6 💦\nReceived: 120 🎯 · 30 😋 · 18 🤢\n[kit:flame] 15 now · best 15', inline: true },
          { name: '[kit:doom] Doom', value: '`251` pts · #1\n130 plays\n98 💀 · 21 🏃 · 11 🔄\nReceived: 100 💀 · 50 🏃\n[kit:flame] best 6', inline: true },
          { name: '[kit:rescue] Rescue', value: '`128` pts · #1\n110 plays\n72 🛟 · 10 🪤 · 28 🕯️\nReceived: 61 🛟\n[kit:flame] best 6', inline: true },
          { name: '[kit:siege] Siege', value: '`80` pts · #1\n100 plays\n40 💥 · 12 💨 · 3 🔄 · 18 ⚡ · 6 💨 · 2 😱 · 15 🧪 · 4 🫧\n[kit:flame] best 6', inline: true },
          { name: '[kit:gift] Rewards in progress', value: `\`748/750\` ${BAR8} [kit:gift] A random item · Points\n\`24/25\` ${BAR8} [kit:vhs] Cursed VHS \`+3\` · Dooms` },
          { name: '​', value: `\`19/20\` ${BAR8} [kit:penny] Lucky Penny \`+3\` · Harmful potions\n\`14/15\` ${BAR8} [kit:garlic] Garlic \`+3\` · Tasty feeds` },
          { name: '​', value: `\`14/15\` ${BAR8} [kit:holyw] Holy Water \`+3\` · Rescues\n\`14/15\` ${BAR8} [kit:antid] Antidote \`+3\` · Helpful potions` },
          { name: '​', value: `\`14/17\` ${BAR8} [kit:nlight] Night Light · Nights in a row` },
          { name: '[kit:moon] Nights in a row: `Tier 3`', value: '[kit:ntp][kit:ntp][kit:ntp][kit:ntp][kit:nts][kit:ntp][kit:ntp]\n[kit:ntp][kit:ntp][kit:ntp][kit:ntp][kit:ntp][kit:ntp][kit:ntp]\n`14` nights · best `14`\n🌕 Creature of the Night: +1 on your first 5 good plays a day' },
          { name: '[kit:glove] Glovebox', value: '[kit:gpie] Golden Pie ×3\n[kit:vhs] Cursed VHS ×1\n[kit:garlic] Garlic ×1 · ready [ts:in 3 hours]\n[kit:holyw] Holy Water ×1\n[kit:penny] Lucky Penny ×2\n[kit:antid] Antidote ×1 · passive\n[kit:nlight] Night Light ×1 · passive', inline: true },
          { name: '[kit:scroll] Titles', value: '`9` earned: 🥧🔪🕯️👕🪳🔥🌋🦉🌕\n🍳 Lunch Lady `74/75`\n🎲 Plot Twist `29/30`\n🍽️ Designated Taster `48/50`', inline: true },
          { name: '[kit:effect] In effect', value: '🍿 Free Refill: +1 on each good play · 1 play left\n🔥 Second Wind: the next bad play keeps the streak · ends [ts:in 22 hours]\n🦟 Mosquito Swarm: −1 on each play · 1 play left' },
        ],
        footer: 'All time · Anyone\'s card: right-click them → Apps → Game card',
        thumbnail: 'avatar',
      }],
    },
  },

  'game-leaderboard': {
    label: 'Example: /leaderboard for the month. Seven players with medals, title badges, bars against the leader and points; who leads each game; who received the most; and the month\'s numbers',
    message: {
      command: { user: 'Jo', name: '/leaderboard' },
      time: 'Today at 9:20 PM',
      embeds: [{
        color: 0xF1C40F,
        title: 'Leaderboard · All games · November 2026',
        description: '[kit:med1] Kim 🧪 [kit:byl][kit:bym][kit:bym][kit:bym][kit:byr] `36`\n[kit:med2] Alex 🥧 [kit:bbl][kit:bbm][kit:bbm][kit:bbm][kit:ber] `28`\n[kit:med3] Jo 🪳 [kit:bbl][kit:bbm][kit:bbm][kit:bem][kit:ber] `24`\n4\\. Sam [kit:bbl][kit:bbm][kit:bbm][kit:bem][kit:ber] `23`\n5\\. Max [kit:bbl][kit:bbm][kit:bem][kit:bem][kit:ber] `12`\n6\\. Riley 🗡️ [kit:bbl][kit:bem][kit:bem][kit:bem][kit:ber] `9`\n7\\. Dana [kit:bbl][kit:bem][kit:bem][kit:bem][kit:ber] `8`',
        fields: [
          { name: '[kit:potion] Potions', value: '[kit:crown] Kim `13`', inline: true },
          { name: '[kit:food] Food Fight', value: '[kit:crown] Riley `14`', inline: true },
          { name: '[kit:doom] Doom', value: '[kit:crown] Kim `20`', inline: true },
          { name: '[kit:rescue] Rescue', value: '[kit:crown] Sam `12`', inline: true },
          { name: '[kit:siege] Siege', value: 'Nobody yet', inline: true },
          { name: '[kit:star] Most received', value: '🎯 Most splatted: Max `2`\n🍽️ Best fed: Riley `5`\n💀 Most doomed: Riley `5`\n🛟 Most rescued: Sam `1`\n☠️ Most poisoned: Max `3`\n💚 Most healed: Max `2`' },
          { name: '[kit:chart] Server stats', value: '[kit:dice] `73` plays · [kit:coin] `140` points\n[kit:people] `7` players\n[kit:food] Most played: Food Fight · `28` plays\n[kit:flame] Best streak: Sam `22` in Potions' },
        ],
        footer: 'Your own card: /scoreboard',
        thumbnail: 'avatar',
      }],
    },
  },

  'siege-arrival': {
    label: 'Example: a monster arrives. The Blob\'s own line, then its card: a full HP bar, 473 of 473, when it ends in six days, 8 attacks a night each and the pot, and how to fight',
    message: {
      time: 'Sunday at 8:00 PM',
      content: 'A pink ooze slides out from under the concession stand, absorbing a hot dog, a napkin dispenser and someone\'s flip-flop.\nFight it with `/siege attack`!',
      embeds: [{
        color: 0xC0392B,
        title: '👹 The Blob is attacking the drive-in!',
        description: `🟢 Pies just sink in: food fight does half damage, but dooms hit harder.\n[kit:bgl][kit:bgm][kit:bgm][kit:bgm][kit:bgm][kit:bgm][kit:bgm][kit:bgm][kit:bgm][kit:bgr] \`473/473\` HP\nEnds ${ENDS} ([ts:in 6 days])\n⚔️ \`8\` attacks a night each · 🍯 Pot: \`24\`, paid out when it's beaten`,
        fields: [
          { name: '[kit:people] Fighters', value: '`0` fighters', inline: true },
          { name: '[kit:trophy] Top fighters', value: 'Nobody yet: be the first!', inline: true },
          { name: '[kit:siege] How to fight', value: `${HOW_TO_FIGHT}\n\`/siege status\` shows your own damage` },
        ],
        footer: 'Siege · the card updates every 10 minutes',
      }],
    },
  },

  'siege-attack': {
    label: 'Example: a siege attack. A pie splats The Blob for 4 (it halves food), Sam is back for another night so it grows, and the points go into the pot, with 7 of 8 attacks left tonight',
    message: {
      command: { user: 'Sam', name: '/siege attack' },
      time: 'Monday at 7:45 PM',
      content: '🥧 [mention:@Sam] winds up and plants a cream pie square on **The Blob**. Direct hit. The Three Stooges would weep.\n-# 💥 Splat! Sam ±0 (80 pts · 🔥 3 in a row)\n-# 💥 4 damage · The Blob 446/716\n-# 📈 Sam is back for another night: The Blob grows +27 HP.\n-# 🍯 Your points go to the pot (now 36): paid out when it\'s beaten · ⚔️ 7 of 8 attacks left tonight',
    },
  },

  'siege-grab': {
    label: 'Example: the monster grabs a fighter, in a new message that pings them, with how to free them and by when',
    message: {
      time: 'Sunday at 8:31 PM',
      content: '**The Blob** swallows **Kim** up to the neck. Visible inside: one phone, one shoe, a lot of regret. Somebody /rescue them!\n[mention:@Kim]\n-# 🪤 Free them with `/rescue attempt target:@Kim` within 22 hours, or the monster digests them: −5 and out for a day. A grabbed fighter can\'t attack.',
    },
  },

  'siege-card': {
    label: 'Example: the siege card on its second night: HP 403 of 743, seven fighters, the top three, who is poisoned and when it wears off, and the latest five things that happened',
    message: {
      time: 'Sunday at 8:00 PM',
      edited: true,
      content: 'A pink ooze slides out from under the concession stand, absorbing a hot dog, a napkin dispenser and someone\'s flip-flop.\nFight it with `/siege attack`!',
      embeds: [{
        color: 0xC0392B,
        title: '👹 The Blob is attacking the drive-in!',
        description: `🟢 Pies just sink in: food fight does half damage, but dooms hit harder.\n[kit:bgl][kit:bgm][kit:bgm][kit:bgm][kit:bgm][kit:bem][kit:bem][kit:bem][kit:bem][kit:ber] \`403/743\` HP\nEnds ${ENDS} ([ts:in 5 days])\n⚔️ \`8\` attacks a night each · 🍯 Pot: \`40\`, paid out when it's beaten`,
        fields: [
          { name: '[kit:people] Fighters', value: '`7` fighters', inline: true },
          { name: '[kit:trophy] Top fighters', value: '[kit:med1] Kim `88`\n[kit:med2] Sam `70`\n[kit:med3] Alex `62`', inline: true },
          { name: '🤢 Poisoned', value: 'Kim · wears off [ts:in 22 hours]\nMax · wears off [ts:in 22 hours]' },
          { name: '[kit:clock] Latest', value: '🧪 Max poisoned it · 4\n😱 Max got spooked\n🧪 Max poisoned it · 2\n💥 Max splatted it · 4\n🤢 The Blob poisoned Max' },
          { name: '[kit:siege] How to fight', value: `${HOW_TO_FIGHT}\n\`/siege status\` shows your own damage` },
        ],
        footer: 'Siege · the card updates every 10 minutes',
      }],
    },
  },

  'siege-report': {
    label: 'Example: the nightly siege report, a new message that pings nobody: the HP and last night\'s damage, last night\'s top three, who is still held and by when, and tonight\'s attacks and pot',
    message: {
      time: 'Monday at 8:10 AM',
      content: '📰 **Night 1 is over** and The Blob is still here. Who needs help tonight:',
      embeds: [{
        color: 0xC0392B,
        title: '👹 The Blob: night 1 report',
        description: `🟢 The Blob still has the drive-in.\n[kit:bgl][kit:bgm][kit:bgm][kit:bgm][kit:bgm][kit:bgm][kit:bgm][kit:bem][kit:bem][kit:ber] \`415/635\` HP\n\`−220\` last night · ends ${ENDS} ([ts:in 6 days])`,
        fields: [
          { name: '[kit:trophy] Last night', value: '[kit:med1] Kim `72`\n[kit:med2] Sam `52`\n[kit:med3] Alex `44`' },
          { name: '🪤 Still held', value: 'Kim · free them with `/rescue` by [ts:in 10 hours]' },
          { name: '[kit:siege] Tonight', value: `Everyone has \`8\` fresh attacks tonight (a night runs 12:00 to 12:00 UTC). Freeing and curing are unlimited.\n🍯 The pot is \`24\`, paid out when it's beaten.\n${HOW_TO_FIGHT}` },
        ],
        footer: 'Nightly siege report · one a night, pinging nobody',
      }],
    },
  },
};

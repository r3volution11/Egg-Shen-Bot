// The example Discord messages the docs show, drawn by DiscordMessage.vue:
//   <DiscordCard name="voting-dashboard" />
//
// Copied from what the bot actually sends — captured from a simulated
// tournament (tests/harness/tournamentSim.js), 2026-10-03 — with three
// stand-ins for what only Discord can draw: [ts:in 9 minutes] for a <t:…>
// timestamp, [mention:@Admin] for a mention and [kit:code] for one of the
// bot's custom emoji (drawn from docs/public/emojis/<code>.png). When a
// card's wording changes in the bot, change it here too. The games'
// examples are in gameCards.js.
//
// The ballot, the live standings, /bracket status and the results card
// were captured again on 2026-11-07, with the whole kit "uploaded" (the
// stone bars since 2.73.0), from an 8-title "Friday Frights" run through
// the real bracketManager, /bracket command, button handler and scheduler
// (closeMatchupsNow): six members vote, two quarterfinals at a time, then
// both semifinals. The standings and /bracket status show the bot's own
// avatar ('bot'); the results card carries its drawn picture instead of a
// thumbnail, shown on its own on the knockout page. One change by hand: the
// ballot's streak says 2 rounds, the two it shows. The capture said 6,
// because updateParticipationStats (bracketManager.js) adds one for every
// vote within 48 hours, not every round; reported 2026-11-07.

import { GAME_CARDS } from './gameCards.js';

const ACCENT = 0x4ec5ed; // ballots and live standings
const GREEN = 0x00ff00; // voting opened, results
const BLUE = 0x0099ff; // /bracket status
// A semifinal opened at 8:04 PM for a day, seen at 9:40 PM
const SEMIS_CLOSE = '[ts:in 22 hours]';
// The kit's two-title bars (8 wide) and split bar (10 wide)
const G4 = '[kit:bgl][kit:bgm][kit:bgm][kit:bgm][kit:bgm][kit:bem][kit:bem][kit:ber]';
const O2 = '[kit:bol][kit:bom][kit:bom][kit:bem][kit:bem][kit:bem][kit:bem][kit:ber]';

export const DISCORD_CARDS = {
  'voting-opened': {
    label: 'Example: the public message that opens a round of voting, with a Start Voting button',
    message: {
      command: { user: 'Admin', name: '/bracket open' },
      time: 'Today at 8:04 PM',
      embeds: [{
        color: GREEN,
        title: '📊 Semifinals - Voting Opened!',
        description: '**Opened matchups:** 1A, 3A\n\n**📝 How to Vote:**\n🔹 Click the "Start Voting" button below\n🔹 Choose ONE winner from each matchup\n🔹 Your choices are saved instantly\n\n⏰ **Voting closes in:** 1d 0h',
        footer: 'Voting closes',
        timestamp: 'Tomorrow at 8:04 PM',
      }],
      rows: [[{ label: '🗳️ Start Voting', kind: 'success' }]],
    },
  },

  'voting-dashboard': {
    label: 'Example: a member\'s private voting ballot in the semifinals, listing every vote they\'ve cast by round with a jade tick on each pick, and their picks in purple on the buttons',
    message: {
      time: 'Today at 9:38 PM',
      edited: true,
      ephemeral: true,
      embeds: [{
        color: ACCENT,
        title: '🗳️ Your Voting Dashboard',
        description: `Vote for ONE title in each matchup below.\nYour selections are shown in **purple**.\n\n💡 Click any button to cast or change your vote!\n\n🔥 **Streak:** 2 rounds\n\n**Your votes**\n**Round 1**\n1A: The Thing (1982) vs [kit:tk1] **Alien (1979)**\n2A: [kit:tk1] **Jaws (1975)** vs The Shining (1980)\n3A: Hereditary (2018) vs [kit:tk1] **Get Out (2017)**\n4A: Scream (1996) vs [kit:tk1] **Halloween (1978)**\n\n**Round 2**\n1A: [kit:tk1] **Alien (1979)** vs Jaws (1975)\n3A: Get Out (2017) vs [kit:tk1] **Halloween (1978)**\n\n⏰ Voting closes ${SEMIS_CLOSE}`,
        footer: 'Only you can see this • Your votes update in real-time',
        timestamp: 'Today at 9:38 PM',
        thumbnail: 'avatar',
      }],
      rows: [
        [{ label: '1A · Alien (1979)', kind: 'primary' }, { label: 'vs', disabled: true }, { label: '1A · Jaws (1975)' }],
        [{ label: '3A · Get Out (2017)' }, { label: 'vs', disabled: true }, { label: '3A · Halloween (1978)', kind: 'primary' }],
      ],
    },
  },

  'live-standings': {
    label: 'Example: the public live standings for the two open semifinals, with a stone bar under each title, green for the one ahead and orange for the one behind, its votes and share, and the totals: 12 votes, 6 voters, 2 matchups',
    message: {
      time: 'Today at 9:40 PM',
      edited: true,
      embeds: [{
        color: ACCENT,
        title: '🏆 Semifinals - Live Standings',
        description: `**📊 Live Vote Counts**\n\n**1A** · closes ${SEMIS_CLOSE}\nAlien (1979) 🔥\n${G4} \`4\` votes · 67%\nvs\nJaws (1975)\n${O2} \`2\` votes · 33%\n\n**3A** · closes ${SEMIS_CLOSE}\nGet Out (2017)\n${O2} \`2\` votes · 33%\nvs\nHalloween (1978) 🔥\n${G4} \`4\` votes · 67%\n\n[kit:ballot] \`12\` votes · [kit:people] \`6\` voters · [kit:vs] \`2\` matchups`,
        footer: 'Updates in real-time as votes are cast',
        timestamp: 'Today at 9:40 PM',
        thumbnail: 'bot',
      }],
    },
  },

  'matchup-results': {
    label: 'Example: the results card posted when a matchup closes: Alien beats The Thing 5 votes to 1, on one split bar, green from the left and orange from the right, with the trophy beside the winner and the silver medal beside the runner-up. The bot\'s drawn picture of the matchup goes under it',
    message: {
      time: 'Tomorrow at 8:00 PM',
      embeds: [{
        color: GREEN,
        title: '📊 Quarterfinals - Match 1 - Results',
        description: '**Friday Frights**\n\nVoting has closed!\n`5` [kit:bgl][kit:bgm][kit:bgm][kit:bgm][kit:bgm][kit:bgm][kit:bgm][kit:bgm][kit:bom][kit:bor] `1`',
        fields: [
          { name: '[kit:trophy] Winner', value: '**Alien**\n`5` votes', inline: true },
          { name: '[kit:med2] Runner-up', value: 'The Thing\n`1` vote', inline: true },
        ],
        footer: 'Total votes: 6',
        timestamp: 'Tomorrow at 8:00 PM',
      }],
    },
  },

  'tournament-status': {
    label: 'Example: /bracket status during the quarterfinals, showing the two open matchups with the same stone vote bars as the live standings: The Thing 1 vote against Alien 5, and Jaws 4 against The Shining 2',
    message: {
      command: { user: 'Member', name: '/bracket status' },
      time: 'Today at 9:12 PM',
      embeds: [{
        color: BLUE,
        title: '🏆 Friday Frights',
        description: '**Quarterfinals**\n\nSingle elimination bracket\n\n**📊 Live Vote Counts**\n\n**1A** · closes [ts:in 23 hours]\nThe Thing (1982)\n[kit:bol][kit:bem][kit:bem][kit:bem][kit:bem][kit:bem][kit:bem][kit:ber] `1` vote · 17%\nvs\nAlien (1979) 🔥\n[kit:bgl][kit:bgm][kit:bgm][kit:bgm][kit:bgm][kit:bgm][kit:bgm][kit:ber] `5` votes · 83%\n\n**2A** · closes [ts:in 23 hours]\nJaws (1975) 🔥\n' + G4 + ' `4` votes · 67%\nvs\nThe Shining (1980)\n' + O2 + ' `2` votes · 33%\n\n**Completed:** 0 matchups',
        fields: [
          { name: 'Status', value: 'knockout', inline: true },
          { name: 'Phase', value: 'quarterfinals', inline: true },
          { name: 'Creator', value: '[mention:@Admin]', inline: true },
        ],
        thumbnail: 'bot',
      }],
    },
  },

  'group-dashboard': {
    label: 'Example: a member\'s private group-stage ballot, with their two picks in each group in purple',
    message: {
      time: 'Today at 8:05 PM',
      ephemeral: true,
      embeds: [{
        color: ACCENT,
        title: '🗳️ Your Group Voting Dashboard',
        description: 'Vote for your **top 2** in each group below.\nYour selections are shown in **purple**.\n\n💡 Click any button to cast or change your vote!',
        fields: [
          { name: '​', value: '**Group A** - Select 2:' },
          { name: '​', value: '**Group B** - Select 2:' },
        ],
        footer: 'Only you can see this • Your votes update in real-time',
        timestamp: 'Today at 8:05 PM',
        thumbnail: 'avatar',
      }],
      rows: [
        [{ label: '1. Alien', kind: 'primary' }, { label: '2. The Thing' }, { label: '3. Halloween', kind: 'primary' }, { label: '4. Jaws' }],
        [{ label: '1. The Shining' }, { label: '2. Scream', kind: 'primary' }, { label: '3. Get Out', kind: 'primary' }, { label: '4. Hereditary' }],
      ],
    },
  },

  ...GAME_CARDS,
};

// The example Discord messages the docs show, drawn by DiscordMessage.vue:
//   <DiscordCard name="voting-dashboard" />
//
// Copied from what the bot actually sends — captured from a simulated
// tournament (tests/harness/tournamentSim.js), 2026-10-03 — with two
// stand-ins for what only Discord can draw: [ts:in 9 minutes] for a <t:…>
// timestamp and [mention:@Admin] for a mention. When a card's wording
// changes in the bot, change it here too.

const ACCENT = 0x4ec5ed; // ballots and live standings
const GREEN = 0x00ff00; // voting opened, results
const BLUE = 0x0099ff; // /bracket status
const SOON = '[ts:in 9 minutes]';

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
    label: 'Example: a member\'s private voting ballot, listing every vote they\'ve cast by round, with their picks in purple',
    message: {
      time: 'Today at 8:05 PM',
      edited: true,
      ephemeral: true,
      embeds: [{
        color: ACCENT,
        title: '🗳️ Your Voting Dashboard',
        description: 'Vote for ONE title in each matchup below.\nYour selections are shown in **purple**.\n\n💡 Click any button to cast or change your vote!\n\n🔥 **Streak:** 2 rounds\n\n**Your votes**\n**Round 1**\n1A: The Thing (1982) vs ✅ **Alien (1979)**\n2A: ✅ **Jaws (1975)** vs The Shining (1980)\n3A: Hereditary (2018) vs ✅ **Get Out (2017)**\n4A: Scream (1996) vs ✅ **Halloween (1978)**\n\n**Round 2**\n1A: ✅ **Alien (1979)** vs Jaws (1975)\n3A: Get Out (2017) vs ✅ **Halloween (1978)**\n\n⏰ Voting closes ' + SOON,
        footer: 'Only you can see this • Your votes update in real-time',
        timestamp: 'Today at 8:05 PM',
        thumbnail: 'avatar',
      }],
      rows: [
        [{ label: '1A · Alien (1979)', kind: 'primary' }, { label: 'vs', disabled: true }, { label: '1A · Jaws (1975)' }],
        [{ label: '3A · Get Out (2017)' }, { label: 'vs', disabled: true }, { label: '3A · Halloween (1978)', kind: 'primary' }],
      ],
    },
  },

  'live-standings': {
    label: 'Example: the public live standings for open matchups, with vote bars that update as votes come in',
    message: {
      time: 'Today at 8:05 PM',
      edited: true,
      embeds: [{
        color: ACCENT,
        title: '🏆 Semifinals - Live Standings',
        description: `**📊 Live Vote Counts**\n\n**1A** · closes ${SOON}\nAlien (1979) 🔥\n🟩🟩🟩🟩🟩🟩🟩⬜⬜⬜ 4 votes (67%)\nvs\nJaws (1975)\n🟧🟧🟧⬜⬜⬜⬜⬜⬜⬜ 2 votes (33%)\n\n**3A** · closes ${SOON}\nGet Out (2017)\n🟧🟧🟧⬜⬜⬜⬜⬜⬜⬜ 2 votes (33%)\nvs\nHalloween (1978) 🔥\n🟩🟩🟩🟩🟩🟩🟩⬜⬜⬜ 4 votes (67%)\n\n📈 **Total votes:** 12\n👥 **Voters:** 6\n🎯 **Matchups:** 2`,
        footer: 'Updates in real-time as votes are cast',
        timestamp: 'Today at 8:05 PM',
        thumbnail: 'poster',
      }],
    },
  },

  'matchup-results': {
    label: 'Example: the results card posted when a matchup closes, naming the winner and runner-up',
    message: {
      time: 'Tomorrow at 8:04 PM',
      embeds: [{
        color: GREEN,
        title: '📊 Quarterfinals - Match 1 - Results',
        description: '**Friday Frights**\n\nVoting has closed!',
        fields: [
          { name: '🏆 Winner', value: '**Alien**\n5 votes', inline: true },
          { name: 'Runner-up', value: 'The Thing\n1 vote', inline: true },
        ],
        footer: 'Total votes: 6',
        timestamp: 'Tomorrow at 8:04 PM',
        thumbnail: 'poster',
      }],
    },
  },

  'tournament-status': {
    label: 'Example: /bracket status, showing each open matchup with the same coloured vote bars as the live standings',
    message: {
      command: { user: 'Member', name: '/bracket status' },
      time: 'Today at 8:10 PM',
      embeds: [{
        color: BLUE,
        title: '🏆 Friday Frights',
        description: `**Quarterfinals**\n\nSingle elimination bracket\n\n**📊 Live Vote Counts**\n\n**1A** · closes ${SOON}\nThe Thing (1982)\n🟧🟧⬜⬜⬜⬜⬜⬜⬜⬜ 1 vote (17%)\nvs\nAlien (1979) 🔥\n🟩🟩🟩🟩🟩🟩🟩🟩⬜⬜ 5 votes (83%)\n\n**2A** · closes ${SOON}\nJaws (1975) 🔥\n🟩🟩🟩🟩🟩🟩🟩⬜⬜⬜ 4 votes (67%)\nvs\nThe Shining (1980)\n🟧🟧🟧⬜⬜⬜⬜⬜⬜⬜ 2 votes (33%)\n\n**Completed:** 0 matchups`,
        fields: [
          { name: 'Status', value: 'knockout', inline: true },
          { name: 'Phase', value: 'quarterfinals', inline: true },
          { name: 'Creator', value: '[mention:@Admin]', inline: true },
        ],
        thumbnail: 'poster',
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
};

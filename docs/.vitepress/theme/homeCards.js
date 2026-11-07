// Example Discord messages that only the home page shows, drawn by
// DiscordMessage.vue through HomeShowcase.vue (card="escape-dashboard").
// The rest of the examples are in discordCards.js and gameCards.js, and
// HomeShowcase looks there first.
//
// Captured on 2026-11-06 from the bot's own renderer (escapeUI.dashboard)
// with every kit icon "uploaded", as gameCards.js was: [kit:code] is one of
// the bot's custom emoji, drawn from docs/public/emojis/<code>.png. The run
// has cleared stage 6, so it has banked 2,000 (escapeStore.bankedAfter) and
// the climb is the kit's three capped blue bars, 5 + 1 of 15. The question
// is the real "which of these is a ‹subgenre›?" template (escapeQuestions.js)
// with titles picked by hand. When the dashboard's wording changes in the
// bot, change it here too.

const CLIMB = '[kit:bbl][kit:bbm][kit:bbm][kit:bbm][kit:bbr] [kit:bbl][kit:bem][kit:bem][kit:bem][kit:ber] [kit:bel][kit:bem][kit:bem][kit:bem][kit:ber]';

export const HOME_CARDS = {
  'escape-dashboard': {
    label: 'Example: an Escape Velocity run on stage 7 of 15, for 4,000 points. The last answer was right and 2,000 is banked. The question asks which of four films is a slasher, with A to D buttons, an Abort button that keeps 2,000, and the climb drawn as three stone bars, the first full and the second started',
    message: {
      command: { user: 'Sam', name: '/escape play' },
      time: 'Today at 9:14 PM',
      ephemeral: true,
      embeds: [{
        color: 0x4EC5ED,
        title: '🚀 Stage 7 of 15 · for 4,000',
        description: '✅ **Correct!** The Wicker Man (1973) — 2,000 banked.\n\n🔪 Horror › Slasher · Movies\n\n**Which of these is a slasher film?**\n\n**A)** The Others (2001)\n**B)** Black Christmas (1974)\n**C)** The Fly (1986)\n**D)** Hereditary (2018)',
        fields: [
          { name: 'Banked', value: '2,000', inline: true },
          { name: 'Next separation', value: 'Stage 10 (32,000)', inline: true },
          { name: 'Climb', value: CLIMB },
        ],
        footer: 'Only you can see this · a wrong answer ends today\'s run',
      }],
      rows: [
        [{ label: 'A', kind: 'primary' }, { label: 'B', kind: 'primary' }, { label: 'C', kind: 'primary' }, { label: 'D', kind: 'primary' }],
        [{ label: '🪂 Abort (keep 2,000)' }],
      ],
    },
  },
};

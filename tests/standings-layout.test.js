/**
 * The live standings (tournamentUI.formatStandings) and the other tournament
 * pieces drawn with the emoji kit: tiebreaker bars, the totals line, the
 * ballot's ticks, the upset note.
 *
 * The standings card is edited on every vote, so its layout is chosen as if
 * every matchup had 9,999 votes a side: a card must never change shape
 * between votes (bars on one vote, squares on the next). And it must always
 * fit — a card over Discord's limits is rejected whole, and an edit that's
 * rejected leaves the old counts up — for any round there is, up to sixteen
 * matchups of 80-character titles, with the longest custom emoji there can
 * be (37 characters) as well as in fallback (plain emoji, what every server
 * sees until the kit is uploaded).
 *
 * Each layout is also checked line by line in both modes, and custom emoji
 * must stay out of the places they can't render: a title, author or footer,
 * or inside a code span (a pill).
 *
 * The real flow, start to finish with the kit uploaded, is in
 * tests/tournament-sim.test.js ("with the emoji kit uploaded").
 *
 * Run with: npm test -- tests/standings-layout.test.js
 */

import { describe, test, expect, jest, beforeAll, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import {
  formatStandings, formatStandingsMatchup, STANDINGS_STEPS, STANDINGS_LAYOUTS, STANDINGS_PROBE_VOTES,
  standingsTotals, rankedBar, formatKnockoutVotes, upsetNote, displayTitle,
} from '../src/utils/tournamentUI.js';
import { createKit, KIT_CODES, MAX_EMOJI_MARKUP, setLiveRegistry } from '../src/utils/emojiKit.js';
import { messageProblems, LIMITS } from '../src/utils/embedFit.js';

let buildPublicKnockoutLeaderboard;
let execute;
let bracketManager;

beforeAll(async () => {
  ({ buildPublicKnockoutLeaderboard } = await import('../src/handlers/buttonHandler.js'));
  ({ execute } = await import('../src/commands/bracket.js'));
  bracketManager = await import('../src/utils/bracketManager.js');
});

// A registry as emojiSync would leave it: every code uploaded
const registry = new Map(Object.keys(KIT_CODES).map((c, i) => [c, { id: `1${String(i).padStart(18, '0')}`, name: `es_${c}_ab12` }]));
const uploaded = createKit(registry);
const E = (code) => `<:${registry.get(code).name}:${registry.get(code).id}>`;
// The longest an uploaded emoji can be: every code padded to six letters
const longestRegistry = new Map(Object.keys(KIT_CODES).map((c, i) => [c, { id: `1${String(i).padStart(18, '0')}`, name: `es_${c.padEnd(6, 'x')}_ab12` }]));
const longest = createKit(longestRegistry);
const fallback = createKit(null);

const DEADLINE = Date.UTC(2026, 10, 3, 18, 0, 0);
const AT = Math.floor(DEADLINE / 1000);

/** The round a set of n open matchups belongs to, and where they sit */
const ROUND_FOR = { 1: 'finals', 2: 'semifinals', 4: 'quarterfinals', 5: 'round_of_16', 8: 'round_of_16', 16: 'round_of_32' };

const voters = (n, tag) => Array.from({ length: n }, (_, i) => `${tag}${i}`);

/**
 * n open matchups, titles `len` characters long as shown (year included),
 * seeded so the seed counts toward the 80, every one with v1–v2 votes.
 */
function matchups(n, len, v1 = 0, v2 = 0) {
  const round = ROUND_FOR[n];
  // "(16) " and " (1984)" take 12 of the length; the name has the rest
  const title = (k) => ({ title: `${k}-${'Nightfall'.repeat(10)}`.slice(0, Math.max(1, len - 12)), year: '1984', seed: 16 });
  return Array.from({ length: n }, (_, p) => ({
    id: `${round}-${p}`, position: p, round, status: 'voting', votingDeadline: DEADLINE,
    movie1: title(`${p}a`), movie2: title(`${p}b`),
    votes: { movie1: voters(v1, `a${p}-`), movie2: voters(v2, `b${p}-`) },
  }));
}

/** The live card, as votes would leave it */
const card = (ms, kit) => buildPublicKnockoutLeaderboard({ votes: {}, statistics: { uniqueVoters: Math.max(...ms.map(m => m.votes.movie1.length + m.votes.movie2.length)) } }, ms[0].round, ms, null, { kit }).toJSON();

/**
 * What a card looks like, without what changes between votes: per line,
 * how many custom emoji and how many squares it has. Two cards with the same
 * shape have the same layout.
 */
const shape = (text) => text.split('\n').map(l => `${(l.match(/<:\w+:\d+>/g) || []).length}:${(l.match(/[🟩🟧🟨🟦⬜]/gu) || []).length}`).join('|');

/** Custom emoji where they can't render: a plain-text slot, or a pill */
function misplacedEmoji(d) {
  const bad = [];
  for (const [where, text] of [['title', d.title], ['author', d.author?.name], ['footer', d.footer?.text]]) {
    if (/<a?:\w+:\d+>/.test(text || '')) bad.push(where);
  }
  for (const text of [d.description, ...(d.fields || []).flatMap(f => [f.name, f.value])]) {
    for (const span of (text || '').match(/`[^`]*`/g) || []) if (span.includes('<')) bad.push(`pill ${span}`);
  }
  return bad;
}

describe('the layout never changes between votes', () => {
  // Every title length from 4 to 80 characters crosses each step's
  // boundary somewhere, for every size of round
  const LENGTHS = Array.from({ length: 77 }, (_, i) => i + 4);
  const COUNTS = [1, 2, 4, 5, 8, 16];

  test.each([['the longest custom emoji', longest], ['the uploaded kit', uploaded], ['fallback', fallback]])(
    'with %s: the layout chosen at 0 votes is the one at 9,999, whatever the titles',
    (_, kit) => {
      for (const n of COUNTS) {
        for (const len of LENGTHS) {
          const budget = LIMITS.description - 200; // the rest of a card
          const at = (v1, v2) => formatStandings(matchups(n, len, v1, v2), undefined, { kit, budget }).step;
          const none = at(0, 0);
          expect([n, len, at(STANDINGS_PROBE_VOTES, STANDINGS_PROBE_VOTES)]).toEqual([n, len, none]);
          expect([n, len, at(STANDINGS_PROBE_VOTES, 0)]).toEqual([n, len, none]);
          expect([n, len, at(1, 0)]).toEqual([n, len, none]);
        }
      }
    },
  );

  test('the live card keeps its shape from the first vote to the 9,999th, for every size of round', () => {
    for (const kit of [longest, fallback]) {
      for (const n of COUNTS) {
        for (const len of [10, 40, 80]) {
          const empty = card(matchups(n, len), kit).description;
          for (const [v1, v2] of [[1, 0], [3, 14], [7, 7], [9999, 9999]]) {
            expect([n, len, v1, v2, shape(card(matchups(n, len, v1, v2), kit).description)]).toEqual([n, len, v1, v2, shape(empty)]);
          }
        }
      }
    }
  });

  test('the steps go from most graphic to plain squares, and fallback starts at the squares', () => {
    expect(STANDINGS_LAYOUTS).toEqual(['two', 'split', 'squares']);
    expect(STANDINGS_STEPS.map(s => s.layout)).toEqual(['two', 'split', 'split', 'squares', 'squares']);
    // Short titles, a few matchups: the kit gets two bars a title; fallback the squares
    expect(formatStandings(matchups(4, 20), undefined, { kit: longest }).layout).toBe('two');
    expect(formatStandings(matchups(4, 20), undefined, { kit: fallback }).layout).toBe('squares');
    // Sixteen long titles with the longest emoji: the squares, titles held to 50
    expect(formatStandings(matchups(16, 80), undefined, { kit: longest }).step).toBe(STANDINGS_STEPS.length - 1);
  });
});

describe('every round fits, at any count', () => {
  test.each([['the longest custom emoji', longest], ['fallback', fallback]])(
    'with %s: 1 to 16 matchups of 80-character titles fit 4,096 / 6,000, at 0 and at 9,999 votes',
    (_, kit) => {
      for (const n of [1, 2, 4, 5, 8, 16]) {
        for (const [v1, v2] of [[0, 0], [9999, 9999], [9999, 0]]) {
          const d = card(matchups(n, 80, v1, v2), kit);
          expect([n, v1, messageProblems({ embeds: [d] })]).toEqual([n, v1, []]);
          // Fits without the clip: every matchup is there, and the totals
          expect(d.description.match(/\*\*(\d[A-H]|Finals)\*\*/g)).toHaveLength(n);
          expect(d.description).toMatch(/ matchups?$/);
        }
      }
    },
  );

  test('/bracket status fits sixteen open matchups of 80-character titles, kit and fallback alike', async () => {
    const GUILD = 'standings-layout-status';
    const file = path.join(process.env.GUILD_TOURNAMENTS_DIR, `${GUILD}.json`);
    try {
      for (const reg of [longestRegistry, null]) {
        setLiveRegistry(reg);
        const ms = matchups(16, 80, 9999, 9999);
        bracketManager.saveTournament(GUILD, {
          id: 't', name: 'N'.repeat(100), guildId: GUILD, creatorId: 'admin', mode: 'bracket',
          status: 'knockout', phase: 'round_of_32', knockoutBracket: ms, knockoutResults: {}, votes: {},
        });
        const i = {
          guildId: GUILD, guild: { id: GUILD }, channelId: 'c', user: { id: 'u', username: 'u' },
          member: { permissions: { has: () => false } },
          client: { user: { displayAvatarURL: () => 'https://cdn.example/bot.png' } },
          options: { getSubcommand: () => 'status', getString: () => null, getInteger: () => null, getBoolean: () => null, getAttachment: () => null },
          deferReply: jest.fn().mockResolvedValue(undefined),
          editReply: jest.fn().mockResolvedValue(undefined),
          reply: jest.fn().mockResolvedValue(undefined),
        };
        await execute(i);
        const payload = i.editReply.mock.calls.at(-1)[0];
        const d = payload.embeds[0].toJSON();
        expect(messageProblems({ embeds: [d] })).toEqual([]);
        expect(d.description.match(/\*\*\d[A-H]\*\*/g)).toHaveLength(16);
        expect(d.description).not.toContain('more open');
        expect(d.description).toMatch(/\*\*Completed:\*\* 0 matchups$/);
        expect(misplacedEmoji(d)).toEqual([]);
      }
    } finally {
      setLiveRegistry(null);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  });

  test('custom emoji never in the title, author or footer, and never inside a pill', () => {
    for (const n of [1, 4, 16]) {
      for (const len of [10, 80]) {
        const d = card(matchups(n, len, 3, 14), longest);
        expect(misplacedEmoji(d)).toEqual([]);
        expect(d.description).toContain('<:es_'); // the kit really is on it
      }
    }
  });
});

describe('each layout, line by line', () => {
  /** Pearl (2022) 1 vote vs Terrifier 2 (2022) 3 votes, matchup 1B of the round of 32 */
  const m = (v1 = 1, v2 = 3) => ({
    id: 'm', position: 1, round: 'round_of_32', votingDeadline: DEADLINE,
    movie1: { title: 'Pearl', year: '2022' }, movie2: { title: 'Terrifier 2', year: '2022' },
    votes: { movie1: voters(v1, 'a'), movie2: voters(v2, 'b') },
  });
  const head = `**1B** · closes <t:${AT}:R>`;

  test('squares (fallback, and whenever the kit\'s bars are not uploaded): today\'s coloured squares', () => {
    expect(formatStandingsMatchup(m(), undefined, { kit: fallback })).toBe([
      head, 'Pearl (2022)', `${'🟧'.repeat(3)}${'⬜'.repeat(7)} 1 vote (25%)`,
      'vs', 'Terrifier 2 (2022) 🔥', `${'🟩'.repeat(8)}${'⬜'.repeat(2)} 3 votes (75%)`,
    ].join('\n'));
    // The squares look the same with the kit uploaded
    expect(formatStandingsMatchup(m(), undefined, { kit: uploaded, layout: 'squares' })).toBe(formatStandingsMatchup(m(), undefined, { kit: fallback }));
  });

  test('two: a kit bar under each title, green ahead, orange behind, with the count and share', () => {
    expect(formatStandingsMatchup(m(), undefined, { kit: uploaded, layout: 'two', width: 8 })).toBe([
      head, 'Pearl (2022)',
      `${E('bol')}${E('bom')}${E('bem').repeat(5)}${E('ber')} \`1\` vote · 25%`,
      'vs', 'Terrifier 2 (2022) 🔥',
      `${E('bgl')}${E('bgm').repeat(5)}${E('bem')}${E('ber')} \`3\` votes · 75%`,
    ].join('\n'));
    expect(formatStandingsMatchup(m(), undefined, { kit: fallback, layout: 'two', width: 8 })).toBe([
      head, 'Pearl (2022)', `${'🟧'.repeat(2)}${'⬜'.repeat(6)} \`1\` vote · 25%`,
      'vs', 'Terrifier 2 (2022) 🔥', `${'🟩'.repeat(6)}${'⬜'.repeat(2)} \`3\` votes · 75%`,
    ].join('\n'));
    // A tie: gold both sides, and the 🤝 on the matchup
    expect(formatStandingsMatchup(m(2, 2), undefined, { kit: uploaded, layout: 'two', width: 8 }).split('\n')).toEqual([
      `**1B** 🤝 · closes <t:${AT}:R>`, 'Pearl (2022)',
      `${E('byl')}${E('bym').repeat(3)}${E('bem').repeat(3)}${E('ber')} \`2\` votes · 50%`,
      'vs', 'Terrifier 2 (2022)',
      `${E('byl')}${E('bym').repeat(3)}${E('bem').repeat(3)}${E('ber')} \`2\` votes · 50%`,
    ]);
  });

  test('split: one bar between the counts, the first title\'s share from the left', () => {
    expect(formatStandingsMatchup(m(), undefined, { kit: uploaded, layout: 'split', width: 10 })).toBe([
      head, 'Pearl (2022)', 'vs', 'Terrifier 2 (2022) 🔥',
      `\`1\` ${E('bol')}${E('bom').repeat(2)}${E('bgm').repeat(6)}${E('bgr')} \`3\``,
    ].join('\n'));
    expect(formatStandingsMatchup(m(), undefined, { kit: fallback, layout: 'split', width: 6 })).toBe([
      head, 'Pearl (2022)', 'vs', 'Terrifier 2 (2022) 🔥',
      `\`1\` ${'🟧'.repeat(2)}${'🟩'.repeat(4)} \`3\``,
    ].join('\n'));
    // Nobody has voted: an empty bar
    expect(formatStandingsMatchup(m(0, 0), undefined, { kit: fallback, layout: 'split', width: 6 }).split('\n').pop()).toBe(`\`0\` ${'⬜'.repeat(6)} \`0\``);
  });

  test('the totals line: kit icons, the numbers in pills', () => {
    expect(standingsTotals({ votes: 12, voters: 5, matchups: 4 }, { kit: fallback })).toBe('🗳️ `12` votes · 👥 `5` voters · ⚔️ `4` matchups');
    expect(standingsTotals({ votes: 1, voters: 1, matchups: 1 }, { kit: uploaded })).toBe(`${E('ballot')} \`1\` vote · ${E('people')} \`1\` voter · ${E('vs')} \`1\` matchup`);
    expect(standingsTotals({ votes: 12345, voters: 5, matchups: 4 }, { kit: fallback })).toContain('`12,345` votes');
  });

  test('the live card: heading, blocks, totals; title and footer plain', () => {
    const d = card([m()], fallback);
    expect(d.title).toBe('🏆 Round Of 32 - Live Standings');
    expect(d.footer.text).toBe('Updates in real-time as votes are cast');
    expect(d.description).toBe(`**📊 Live Vote Counts**\n\n${formatStandingsMatchup(m(), undefined, { kit: fallback })}\n\n🗳️ \`4\` votes · 👥 \`4\` voters · ⚔️ \`1\` matchup`);
  });
});

describe('tiebreaker bars (rankedBar)', () => {
  test('the leader gold, the rest blue, every option sharing the lead gold, empty before anyone votes', () => {
    expect(rankedBar(3, [3, 1], { kit: fallback })).toBe(`${'🟨'.repeat(8)}${'⬜'.repeat(2)}`);
    expect(rankedBar(1, [3, 1], { kit: fallback })).toBe(`${'🟦'.repeat(3)}${'⬜'.repeat(7)}`);
    expect(rankedBar(2, [2, 2], { kit: fallback })).toBe(`${'🟨'.repeat(5)}${'⬜'.repeat(5)}`);
    expect(rankedBar(0, [0, 0], { kit: fallback })).toBe('⬜'.repeat(10));
    expect(rankedBar(3, [3, 1], { kit: uploaded })).toBe(`${E('byl')}${E('bym').repeat(7)}${E('bem')}${E('ber')}`);
    expect(rankedBar(1, [3, 1], { kit: uploaded })).toBe(`${E('bbl')}${E('bbm').repeat(2)}${E('bem').repeat(6)}${E('ber')}`);
    expect(rankedBar(4, [4, 0], { kit: uploaded })).toBe(`${E('byl')}${E('bym').repeat(8)}${E('byr')}`);
  });
});

describe('the ballot\'s vote list', () => {
  const bracket = (n, len) => Array.from({ length: n }, (_, p) => ({
    id: `r32-${p}`, round: 'round_of_32', position: p,
    movie1: { title: `${'A'.repeat(len)} ${p}` }, movie2: { title: `${'B'.repeat(len)} ${p}` },
  }));

  test('your picks get the kit\'s tick', () => {
    const t = { knockoutBracket: bracket(2, 3), votes: { u: { 'r32-0': 1, 'r32-1': 2 } } };
    expect(formatKnockoutVotes(t, 'u', { kit: fallback })).toBe('**Round 1 · Region 1**\nA: ✅ **AAA 0** vs BBB 0\nB: AAA 1 vs ✅ **BBB 1**');
    expect(formatKnockoutVotes(t, 'u', { kit: uploaded })).toBe(`**Round 1 · Region 1**\nA: ${E('tk1')} **AAA 0** vs BBB 0\nB: AAA 1 vs ${E('tk1')} **BBB 1**`);
  });

  test('with the longest tick, a single round too long for the ballot is cut short, never through an emoji', () => {
    expect(longest.e('tk1')).toHaveLength(MAX_EMOJI_MARKUP);
    // Sixteen picks of titles this long are over the list's 3,000 characters
    // in one round, so there's no earlier round to drop: it has to be cut
    for (let len = 66; len <= 77; len++) {
      const all = bracket(16, len);
      const t = { knockoutBracket: all, votes: { u: Object.fromEntries(all.map(m => [m.id, 1])) } };
      const text = formatKnockoutVotes(t, 'u', { kit: longest });
      expect(text.length).toBeLessThanOrEqual(3000);
      // No half an emoji left: every "<:" is a whole one
      expect([len, text.replace(/<:\w+:\d+>/g, '').includes('<:')]).toEqual([len, false]);
      expect(text.endsWith('…')).toBe(true);
    }
  });
});

describe('the upset note', () => {
  test('a worse seed winning gets the kit\'s siren; a better seed none', () => {
    expect(upsetNote({ seed: 12 }, { seed: 5 }, { kit: fallback })).toBe('🚨 Upset! (12) knocks out (5)');
    expect(upsetNote({ seed: 12 }, { seed: 5 }, { kit: uploaded })).toBe(`${E('upset')} Upset! (12) knocks out (5)`);
    expect(upsetNote({ seed: 5 }, { seed: 12 }, { kit: uploaded })).toBe('');
  });
});

describe('the fixtures are what they say', () => {
  test('80-character titles are 80 characters, seed and year included', () => {
    expect(displayTitle(matchups(1, 80)[0].movie1)).toHaveLength(80);
    expect(displayTitle(matchups(1, 20)[0].movie1)).toHaveLength(20);
    expect(longest.e('ballot')).toHaveLength(MAX_EMOJI_MARKUP);
    expect(longest.e('bgl')).toHaveLength(MAX_EMOJI_MARKUP);
  });
});

afterEach(() => setLiveRegistry(null));

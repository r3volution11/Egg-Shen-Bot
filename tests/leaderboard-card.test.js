/**
 * The server card (src/utils/leaderboardCard.js) from a crafted month of
 * plays: getLeaderboard's standings, each game's leader and the period's
 * totals, then renderLeaderboard line by line — all games, one game, an
 * empty server — and the worst case, which must fit in one embed whatever
 * the names and whichever emoji kit is drawing it. A card over Discord's
 * limits is rejected whole and posts nothing.
 *
 * /leaderboard itself (member lookups, refusals) is driven end to end in
 * tests/game-commands.test.js; the title badge on each row (R3), from the
 * title a member chose to show, is driven end to end here.
 *
 * Run with: npm test -- tests/leaderboard-card.test.js
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { recordPlay, deleteScores, getLeaderboard, setShownTitle, GAMES } from '../src/utils/gameScores.js';
import { FakeDiscord } from './harness/fakeDiscord.js';
import * as leaderboardCommand from '../src/commands/leaderboard.js';
import { renderLeaderboard, layoutLeaderboard, LEADERBOARD_STEPS } from '../src/utils/leaderboardCard.js';
import { createKit, KIT_CODES, MAX_EMOJI_MARKUP } from '../src/utils/emojiKit.js';
import { messageProblems, embedTextLength, LIMITS } from '../src/utils/embedFit.js';
import { HAPPENINGS, CALENDAR_HAPPENINGS } from '../src/data/gameHappenings.js';

const GUILD = 'leaderboard-card-guild';
const NOW = Date.UTC(2026, 10, 15, 12, 0, 0); // 15 Nov 2026

const fallback = createKit(null);
const registry = new Map(Object.keys(KIT_CODES).map((c, i) => [c, { id: `1${String(i).padStart(18, '0')}`, name: `es_${c}_ab12` }]));
const uploaded = createKit(registry);
const E = (code) => `<:${registry.get(code).name}:${registry.get(code).id}>`;
// The longest an uploaded emoji can be: a six-letter code (`es_xxxxxx_ab12`)
const longest = createKit(new Map(Object.keys(KIT_CODES).map((c, i) => [c, { id: `1${String(i).padStart(18, '0')}`, name: 'es_xxxxxx_ab12' }])));

const member = (id, name) => ({ kind: 'member', pingUserIds: [id], name });
const ROLE = { kind: 'role', pingUserIds: [] };
const play = (game, outcome, actor, target = ROLE, now = NOW) => recordPlay(GUILD, { game, actor, target, outcome }, now);
const sam = { id: 'sam', name: 'Sam' };
const kim = { id: 'kim', name: 'Kim' };
const alex = { id: 'alex', name: 'Alex' };
const lee = { id: 'lee', name: 'Lee' };

/**
 * November: every game played and every "received" outcome had, plus one
 * October doom that must stay out of November's card.
 */
function november() {
  play('doom', 'doomed', alex, member('sam', 'Sam'), Date.UTC(2026, 9, 20)); // October
  play('foodfight', 'hit', sam, member('alex', 'Alex')); // sam +3, alex −1
  play('foodfight', 'hit', sam, member('alex', 'Alex'), NOW + 1); // sam +3 (2 in a row), alex −1
  play('foodfight', 'tasty', kim, member('sam', 'Sam')); // kim +1, sam +2
  play('doom', 'doomed', kim, member('alex', 'Alex')); // kim +3, alex −1
  play('rescue', 'rescued', lee, member('alex', 'Alex')); // lee +1, alex +2
  play('potion', 'helped', lee, member('kim', 'Kim')); // lee +1, kim +2
  play('potion', 'hurt', alex, member('lee', 'Lee')); // alex +2, lee −2
}

/** The card's data as /leaderboard passes it, with stored names */
const cardData = (board, { game = 'all', games = GAMES, periodLabel = 'November 2026' } = {}) => ({
  game,
  games,
  periodLabel,
  rows: board.rows.map(r => ({ ...r, avatarUrl: `https://cdn.example/${r.userId}.png` })),
  perGame: board.perGame,
  received: board.received,
  bestStreak: board.bestStreak,
  totals: board.totals,
});

/** Custom emoji where they may not render, or inside a pill (shown raw) */
function misplacedEmoji(embed) {
  const d = embed.toJSON();
  const bad = [];
  for (const [where, text] of [['title', d.title], ['footer', d.footer?.text]]) if (text?.includes('<:')) bad.push(where);
  for (const text of [d.description, ...(d.fields || []).flatMap(f => [f.name, f.value])]) {
    for (const span of (text || '').match(/`[^`]*`/g) || []) if (span.includes('<')) bad.push(`pill ${span}`);
  }
  return bad;
}

beforeEach(() => deleteScores(GUILD));

describe('what the card is drawn from', () => {
  test('standings, each game\'s leader, received leaders and the month\'s totals', () => {
    november();
    const board = getLeaderboard(GUILD, 'all', 'month', {}, NOW);
    expect(board.rows.map(r => [r.userId, r.points, r.plays])).toEqual([['sam', 8, 2], ['kim', 6, 2], ['alex', 1, 1], ['lee', 0, 2]]);
    expect(board.perGame).toEqual({
      // A tie on points goes to whoever played more: Kim's 2 were given to her
      potion: { userId: 'alex', name: 'Alex', points: 2, plays: 1 },
      foodfight: { userId: 'sam', name: 'Sam', points: 8, plays: 2 },
      doom: { userId: 'kim', name: 'Kim', points: 3, plays: 1 },
      rescue: { userId: 'alex', name: 'Alex', points: 2, plays: 0 },
      siege: null, // R5's fifth game: nobody has fought this month
    });
    expect(board.totals).toEqual({ players: 4, plays: 7, points: 15, mostPlayed: { game: 'foodfight', plays: 3 } });
    expect(board.bestStreak).toEqual({ userId: 'sam', name: 'Sam', game: 'foodfight', count: 2 });
  });
});

describe('the card, line by line', () => {
  test('all games: medals, bars against the leader, a column per game, received leaders, the month in numbers', () => {
    november();
    const { embed, step } = layoutLeaderboard(cardData(getLeaderboard(GUILD, 'all', 'month', {}, NOW)), { kit: fallback });
    expect(step).toBe(0);
    expect(embed.toJSON()).toEqual({
      color: 0xF1C40F,
      title: 'Leaderboard · All games · November 2026',
      thumbnail: { url: 'https://cdn.example/sam.png' },
      description: [
        '🥇 Sam ▰▰▰▰▰ `8`',
        '🥈 Kim ▰▰▰▰▱ `6`',
        '🥉 Alex ▰▱▱▱▱ `1`',
        '4\\. Lee ▱▱▱▱▱ `0`',
      ].join('\n'),
      fields: [
        { name: '🧪 Potions', value: '👑 Alex `2`', inline: true },
        { name: '🥧 Food Fight', value: '👑 Sam `8`', inline: true },
        { name: '🪓 Doom', value: '👑 Kim `3`', inline: true },
        { name: '🛟 Rescue', value: '👑 Alex `2`', inline: true },
        // A game nobody has played keeps its column, so the grid doesn't shift
        { name: '👹 Siege', value: 'Nobody yet', inline: true },
        {
          name: '⭐ Most received',
          value: [
            '🎯 Most splatted: Alex `2`',
            '🍽️ Best fed: Sam `1`',
            '💀 Most doomed: Alex `1`',
            '🛟 Most rescued: Alex `1`',
            '☠️ Most poisoned: Lee `1`',
            '💚 Most healed: Kim `1`',
          ].join('\n'),
          inline: false,
        },
        {
          name: '📊 Server stats',
          value: [
            '🎲 `7` plays · 🪙 `15` points',
            '👥 `4` players',
            '🥧 Most played: Food Fight · `3` plays',
            '🔥 Best streak: Sam `2` in Food Fight',
          ].join('\n'),
          inline: false,
        },
      ],
      footer: { text: 'Your own card: /scoreboard' },
    });
  });

  test('with the kit uploaded: medals, crowns and icons swapped, still nothing in the title or a pill', () => {
    november();
    const embed = renderLeaderboard(cardData(getLeaderboard(GUILD, 'all', 'month', {}, NOW)), { kit: uploaded });
    const d = embed.toJSON();
    expect(d.description.split('\n')[0]).toBe(`${E('med1')} Sam ${E('byl')}${E('bym')}${E('bym')}${E('bym')}${E('byr')} \`8\``);
    expect(d.description.split('\n')[3]).toBe(`4\\. Lee ${E('bel')}${E('bem')}${E('bem')}${E('bem')}${E('ber')} \`0\``);
    expect(d.fields[1]).toEqual({ name: `${E('food')} Food Fight`, value: `${E('crown')} Sam \`8\``, inline: true });
    expect(d.fields[6].value.split('\n')[3]).toBe(`${E('flame')} Best streak: Sam \`2\` in Food Fight`);
    expect(d.title).toBe('Leaderboard · All games · November 2026');
    expect(misplacedEmoji(embed)).toEqual([]);
  });

  test('one game: its own standings, received and numbers; no columns, no "most played"', () => {
    november();
    const board = getLeaderboard(GUILD, 'doom', 'month', {}, NOW);
    const d = renderLeaderboard(cardData(board, { game: 'doom' }), { kit: fallback }).toJSON();
    expect(d.title).toBe('Leaderboard · Doom · November 2026');
    expect(d.description).toBe('🥇 Kim ▰▰▰▰▰ `3`\n🥈 Alex ▱▱▱▱▱ `−1`');
    expect(d.fields).toEqual([
      { name: '⭐ Most received', value: '💀 Most doomed: Alex `1`', inline: false },
      { name: '📊 Server stats', value: '🎲 `1` play · 🪙 `2` points\n👥 `2` players\n🔥 Best streak: Kim `1` in Doom', inline: false },
    ]);
  });

  test('a game switched off isn\'t in "all": not in the standings, the columns or the numbers', () => {
    november();
    const games = ['foodfight', 'doom', 'rescue'];
    const board = getLeaderboard(GUILD, 'all', 'month', { games }, NOW);
    const d = renderLeaderboard(cardData(board, { games }), { kit: fallback }).toJSON();
    // Without potions: Kim loses 2, Alex 2, Lee gets 2 back and played once
    expect(d.description.split('\n')).toEqual(['🥇 Sam ▰▰▰▰▰ `8`', '🥈 Kim ▰▰▰▱▱ `4`', '🥉 Lee ▰▱▱▱▱ `1`', '4\\. Alex ▱▱▱▱▱ `−1`']);
    expect(d.fields.map(f => f.name)).toEqual(['🥧 Food Fight', '🪓 Doom', '🛟 Rescue', '⭐ Most received', '📊 Server stats']);
    expect(d.fields[3].value).not.toMatch(/poisoned|healed/);
    expect(d.fields[4].value.split('\n')[0]).toBe('🎲 `5` plays · 🪙 `12` points');
  });

  test('everyone below zero: no bars, since there\'s nothing to measure against', () => {
    play('doom', 'escaped', kim);
    play('rescue', 'sacrificed', lee);
    const d = renderLeaderboard(cardData(getLeaderboard(GUILD, 'all', 'month', {}, NOW)), { kit: fallback }).toJSON();
    expect(d.description).toBe('🥇 Kim `−1`\n🥈 Lee `−2`');
  });

  test('a name with markdown in it shows as typed, and can\'t open a pill', () => {
    play('doom', 'doomed', { id: 'x', name: '*`Kim`*' });
    const d = renderLeaderboard(cardData(getLeaderboard(GUILD, 'all', 'month', {}, NOW)), { kit: fallback }).toJSON();
    expect(d.description).toBe('🥇 \\*\\`Kim\\`\\* ▰▰▰▰▰ `3`');
  });

  test('title badges (R3): after the name, before the bar; no title, no badge; Unicode whichever kit draws the rest', () => {
    november();
    const badges = { sam: '🥧', alex: '👕' };
    const data = cardData(getLeaderboard(GUILD, 'all', 'month', {}, NOW));
    data.rows = data.rows.map(r => ({ ...r, badge: badges[r.userId] || null }));
    expect(renderLeaderboard(data, { kit: fallback }).toJSON().description.split('\n')).toEqual([
      '🥇 Sam 🥧 ▰▰▰▰▰ `8`',
      '🥈 Kim ▰▰▰▰▱ `6`',
      '🥉 Alex 👕 ▰▱▱▱▱ `1`',
      '4\\. Lee ▱▱▱▱▱ `0`',
    ]);
    const custom = renderLeaderboard(data, { kit: uploaded });
    expect(custom.toJSON().description.split('\n')[0]).toBe(`${E('med1')} Sam 🥧 ${E('byl')}${E('bym')}${E('bym')}${E('bym')}${E('byr')} \`8\``);
    expect(misplacedEmoji(custom)).toEqual([]);
  });

  test('nobody has played: a friendly card, with nothing empty on it', () => {
    const { embed } = layoutLeaderboard(cardData(getLeaderboard(GUILD, 'all', 'month', {}, NOW)), { kit: fallback });
    expect(embed.toJSON()).toEqual({
      color: 0xF1C40F,
      title: 'Leaderboard · All games · November 2026',
      description: 'Nobody has played yet. Be the first!',
      footer: { text: 'Your own card: /scoreboard' },
    });
    expect(messageProblems({ embeds: [embed] })).toEqual([]);
  });
});

describe('/leaderboard: each row shows the badge of the title they chose', () => {
  test('ten hits in a row earn On Fire; shown, its badge is on their row, and nobody else\'s', async () => {
    const discord = new FakeDiscord({ guildId: GUILD });
    discord.addUser('sam', { nickname: 'Sam' });
    discord.addUser('kim', { nickname: 'Kim' });
    for (let n = 0; n < 10; n++) play('foodfight', 'hit', sam, ROLE, NOW + n);
    play('doom', 'doomed', kim);
    expect(setShownTitle(GUILD, 'sam', 'on-fire', NOW)).toMatchObject({ ok: true });

    const i = discord.command('kim', 'leaderboard');
    await leaderboardCommand.execute(i);
    const rows = i.replyMessage.embeds[0].toJSON().description.split('\n');
    expect(rows[0]).toMatch(/^🥇 Sam 🔥 ▰▰▰▰▰ `\d+`$/);
    expect(rows[1]).toMatch(/^🥈 Kim [▰▱]{5} `3`$/);
    expect(discord.violations).toEqual([]);
  });
});

// ── fitting ──────────────────────────────────────────────────────────────

/** 32 characters that each need escaping: 64 on the card */
const WORST_NAME = '_*'.repeat(16);

/**
 * The biggest card real data can make: 15 rows of the worst names with a
 * title badge each (R3), every game led, all six received leaders, and
 * numbers in the millions.
 */
function worst({ badge = '🏅', label = null } = {}) {
  const lead = { userId: 'u0', name: WORST_NAME, points: 1_000_000, plays: 1_000_000 };
  return {
    game: 'all',
    games: GAMES,
    periodLabel: 'September 2026',
    rows: Array.from({ length: 15 }, (_, i) => ({
      userId: `u${i}`, name: WORST_NAME, avatarUrl: 'https://cdn.example/u.png', points: 1_000_000 - i * 1_000, plays: 1_000, badge,
    })),
    perGame: Object.fromEntries(GAMES.map(g => [g, lead])),
    received: ['🎯 Most splatted', '🍽️ Best fed', '💀 Most doomed', '🛟 Most rescued', '☠️ Most poisoned', '💚 Most healed']
      .map(l => ({ label: label || l, userId: 'u0', name: WORST_NAME, count: 1_000_000 })),
    bestStreak: { userId: 'u0', name: WORST_NAME, game: 'foodfight', count: 1_000_000 },
    totals: { players: 1_000_000, plays: 10_000_000, points: -10_000_000, mostPlayed: { game: 'foodfight', plays: 10_000_000 } },
  };
}

const rowsOn = (embed) => embed.toJSON().description.split('\n').length;
const receivedOn = (embed) => embed.toJSON().fields.find(f => f.name.endsWith('Most received')).value.split('\n').length;

describe('always within Discord\'s limits', () => {
  test('the uploaded emoji in the worst case are as long as kit emoji get', () => {
    expect(longest.e('med1')).toHaveLength(MAX_EMOJI_MARKUP);
  });

  test('worst case in plain emoji: all 15 rows, bars and all', () => {
    const { embed, step } = layoutLeaderboard(worst(), { kit: fallback });
    expect(messageProblems({ embeds: [embed] })).toEqual([]);
    expect(step).toBe(0);
    expect(rowsOn(embed)).toBe(15);
    expect(embed.toJSON().description.split('\n')[14]).toBe(`15\\. ${'\\_\\*'.repeat(16)} 🏅 ▰▰▰▰▱ \`986,000\``);
  });

  test('worst case with uploaded emoji: the bars go (185 characters a row), all 15 rows stay', () => {
    // With bars: 4,129 characters of standings, over the 4,096 a description holds
    const { embed, step } = layoutLeaderboard(worst(), { kit: longest });
    const d = embed.toJSON();
    expect(messageProblems({ embeds: [d] })).toEqual([]);
    expect(step).toBe(1);
    expect(rowsOn(embed)).toBe(15);
    expect(d.description.split('\n')[14]).toBe(`15\\. ${'\\_\\*'.repeat(16)} 🏅 \`986,000\``);
    expect(misplacedEmoji(embed)).toEqual([]);
    expect(d.description.length).toBeLessThanOrEqual(LIMITS.description);
    expect(embedTextLength(d)).toBeLessThanOrEqual(LIMITS.total);
  });

  // A badge is one emoji, but one emoji can be 8 characters (🧑‍🤝‍🧑 is
  // four code points joined): the longest on all 15 rows still fits
  test('worst case with the longest badge on every row: all 15 rows in both kits', () => {
    const BADGE = '🧑‍🤝‍🧑';
    expect(BADGE).toHaveLength(8);
    const plain = layoutLeaderboard(worst({ badge: BADGE }), { kit: fallback });
    expect([plain.step, rowsOn(plain.embed)]).toEqual([0, 15]);
    const custom = layoutLeaderboard(worst({ badge: BADGE }), { kit: longest });
    expect([custom.step, rowsOn(custom.embed)]).toEqual([1, 15]);
    for (const { embed } of [plain, custom]) {
      expect(messageProblems({ embeds: [embed] })).toEqual([]);
      const last = embed.toJSON().description.split('\n')[14];
      expect(last.startsWith(`15\\. ${'\\_\\*'.repeat(16)} ${BADGE} `)).toBe(true);
    }
  });

  test('fifteen ordinary names, every one with a badge: the bars stay, even with uploaded emoji', () => {
    const data = worst();
    data.rows = data.rows.map((r, i) => ({ ...r, name: `Member ${i + 1}`, badge: '🧑‍🤝‍🧑', points: 100 - i }));
    const { embed, step } = layoutLeaderboard(data, { kit: longest });
    expect(step).toBe(0);
    expect(embed.toJSON().description.split('\n')[1]).toMatch(/^<:es_xxxxxx_ab12:\d+> Member 2 🧑‍🤝‍🧑 (<:es_xxxxxx_ab12:\d+>){5} `99`$/);
  });

  // Past this point only overlong badges (or labels longer than today's)
  // could take a card; they stand in for them here
  test('overgrown rows: down to the top 10', () => {
    const { embed, step } = layoutLeaderboard(worst({ badge: 'B'.repeat(250) }), { kit: longest });
    expect(messageProblems({ embeds: [embed] })).toEqual([]);
    expect(step).toBe(2);
    expect(rowsOn(embed)).toBe(10);
    expect(receivedOn(embed)).toBe(6);
  });

  test('overgrown received leaders: down to three', () => {
    const { embed, step } = layoutLeaderboard(worst({ badge: 'B'.repeat(250), label: 'L'.repeat(200) }), { kit: longest });
    expect(messageProblems({ embeds: [embed] })).toEqual([]);
    expect(step).toBe(3);
    expect(rowsOn(embed)).toBe(10);
    expect(receivedOn(embed)).toBe(3);
  });

  test('past saving: clipped to fit, never mid-emoji or mid-pill', () => {
    const { embed, step } = layoutLeaderboard(worst({ badge: 'B'.repeat(1000), label: 'L'.repeat(1000) }), { kit: longest });
    const d = embed.toJSON();
    expect(step).toBe(LEADERBOARD_STEPS.length - 1);
    expect(messageProblems({ embeds: [d] })).toEqual([]);
    for (const text of [d.description, ...d.fields.map(f => f.value)]) {
      const rest = text.replace(/<a?:\w+:\d+>/g, '');
      expect(rest).not.toMatch(/<:/);
      expect((text.match(/`/g) || []).length % 2).toBe(0);
    }
  });
});

// ── R4: "In progress" ────────────────────────────────────────────────────

/** A happening as /leaderboard hands it in (activeHappenings' shape) */
const happening = (kind, endsAt = NOW + 30 * 60 * 1000) => {
  const h = HAPPENINGS[kind] || CALENDAR_HAPPENINGS[kind];
  return { kind, name: h.name, emoji: h.emoji, tag: h.tag, about: h.about, mods: h.mods, endsAt, calendar: !HAPPENINGS[kind] };
};
const ENDS_AT = Math.floor((NOW + 30 * 60 * 1000) / 1000);

describe('R4: what\'s in progress', () => {
  test('a happening and a calendar day: the last field, one line each; an ended one isn\'t there', () => {
    november();
    const data = { ...cardData(getLeaderboard(GUILD, 'all', 'month', {}, NOW)), happenings: [happening('fullmoon'), happening('friday13', null), happening('fog', NOW)] };
    const d = renderLeaderboard(data, { kit: fallback, now: NOW }).toJSON();
    expect(d.fields.at(-1)).toEqual({
      name: '⏰ In progress',
      value: `🌕 Full Moon: dooms score double · ends <t:${ENDS_AT}:R>\n🔪 Friday the 13th: bad luck is likelier, good plays +1 · all day`,
      inline: false,
    });
    expect(d.fields.at(-2).name).toBe('📊 Server stats');
    // With the kit uploaded the heading's clock is its icon; the happening stays the emoji it is
    const up = renderLeaderboard(data, { kit: uploaded, now: NOW }).toJSON();
    expect(up.fields.at(-1).name).toBe(`${E('clock')} In progress`);
    expect(misplacedEmoji(renderLeaderboard(data, { kit: uploaded, now: NOW }))).toEqual([]);
  });

  test('nothing in progress (or only ended ones): no field', () => {
    november();
    const plain = renderLeaderboard(cardData(getLeaderboard(GUILD, 'all', 'month', {}, NOW)), { kit: fallback, now: NOW }).toJSON();
    const ended = renderLeaderboard({ ...cardData(getLeaderboard(GUILD, 'all', 'month', {}, NOW)), happenings: [happening('fog', NOW)] }, { kit: fallback, now: NOW }).toJSON();
    expect(plain.fields.map(f => f.name)).not.toContain('⏰ In progress');
    expect(ended).toEqual(plain);
  });

  test('nobody has played, but the moon is full: the best reason to be first', () => {
    const data = { ...cardData(getLeaderboard(GUILD, 'all', 'month', {}, NOW)), happenings: [happening('fullmoon')] };
    expect(renderLeaderboard(data, { kit: fallback, now: NOW }).toJSON()).toEqual({
      color: 0xF1C40F,
      title: 'Leaderboard · All games · November 2026',
      description: 'Nobody has played yet. Be the first!',
      fields: [{ name: '⏰ In progress', value: `🌕 Full Moon: dooms score double · ends <t:${ENDS_AT}:R>`, inline: false }],
      footer: { text: 'Your own card: /scoreboard' },
    });
  });

  test('the worst case with two happenings in progress still fits, at the same steps as without', () => {
    const going = [happening('sunrise'), happening('friday13', null)];
    for (const [kit, step] of [[fallback, 0], [longest, 1]]) {
      const { embed, step: took } = layoutLeaderboard({ ...worst(), happenings: going }, { kit, now: NOW });
      expect(messageProblems({ embeds: [embed] })).toEqual([]);
      expect(took).toBe(step);
      expect(rowsOn(embed)).toBe(15);
      expect(embed.toJSON().fields.at(-1).value.split('\n')).toHaveLength(2);
    }
  });
});

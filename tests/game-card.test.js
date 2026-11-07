/**
 * The personal game card (src/utils/gameCard.js) as a pure renderer: data
 * in, embed out. Checked line by line in fallback (plain emoji, what every
 * server sees until the kit is uploaded) and with a fake registry of
 * uploaded emoji, where the card must keep custom emoji out of the places
 * they may not render (title, author, footer) and out of every pill (a code
 * span shows `<:es_coin_ab12:1…>` as raw text).
 *
 * R3's sections (rewards in progress, the nights row, the Glovebox,
 * titles) are checked the same two ways, line by line, from a fixture in
 * the shape getPlayerCardExtras (gameCardData.js) returns — and R4's: a
 * twist's statuses under "In effect", and the server's happenings in
 * progress as lines in the description.
 *
 * And it must always fit: a card over Discord's limits is rejected whole
 * and posts nothing. R3's worst case — every game and outcome, nine reward
 * counters, a 14-night row, a full Glovebox, thirty titles — has to, in
 * plain emoji and with the longest custom emoji there can be; past that,
 * overgrown fixtures (more game columns than there are games) walk the
 * card down each of CARD_STEPS in turn.
 *
 * /scoreboard and the right-click Game card are driven end to end in
 * tests/game-commands.test.js.
 *
 * Run with: npm test -- tests/game-card.test.js
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { renderGameCard, layoutGameCard, draftGameCard, gameCardData, cardExtras, CARD_STEPS, CARD_HINT, LIST_CAPS } from '../src/utils/gameCard.js';
import { createKit, KIT_CODES, MAX_EMOJI_MARKUP } from '../src/utils/emojiKit.js';
import { messageProblems, embedTextLength, LIMITS } from '../src/utils/embedFit.js';
import { recordPlay, deleteScores, getScoreboard, GAMES, castCharm, DEFAULT_GAME_SETTINGS } from '../src/utils/gameScores.js';
import { getPlayerCardExtras } from '../src/utils/gameCardData.js';
import { FakeDiscord } from './harness/fakeDiscord.js';
import * as scoreboard from '../src/commands/scoreboard.js';
import { mutateScores } from '../src/utils/gameScores.js';
import { TWISTS, CHI, MAGIC } from '../src/data/gameRewards.js';
import { STATUS_NOTES } from '../src/data/gameEventLines.js';
import { HAPPENINGS, CALENDAR_HAPPENINGS } from '../src/data/gameHappenings.js';

const NOW = Date.UTC(2026, 10, 1, 20, 0, 0);
const HOUR = 60 * 60 * 1000;

// A registry as emojiSync would leave it: every code uploaded
const registry = new Map(Object.keys(KIT_CODES).map((c, i) => [c, { id: `1${String(i).padStart(18, '0')}`, name: `es_${c}_ab12` }]));
const uploaded = createKit(registry);
const E = (code) => `<:${registry.get(code).name}:${registry.get(code).id}>`;
// The longest an uploaded emoji can be: every code padded to six letters
// (`es_bglxxx_ab12`), still one name per code so a test can tell them apart
const longest = createKit(new Map(Object.keys(KIT_CODES).map((c, i) => [c, { id: `1${String(i).padStart(18, '0')}`, name: `es_${c.padEnd(6, 'x')}_ab12` }])));
const fallback = createKit(null);

/** A card as /scoreboard builds it for Sam: two games, a shield */
const card = () => ({
  player: { id: 'sam', name: 'Sam', avatarUrl: 'https://cdn.example/sam.png' },
  periodLabel: 'All time',
  scope: null,
  total: 5,
  rank: 1,
  ranked: 3,
  games: [
    { game: 'foodfight', name: 'Food Fight', points: 6, rank: 1, plays: 3, counts: { hit: 2, miss: 1 }, received: { tasty: 1 }, streak: 0, bestStreak: 2 },
    { game: 'doom', name: 'Doom', points: -1, rank: 2, plays: 0, counts: {}, received: { doomed: 1 }, streak: 0, bestStreak: 0 },
  ],
  effects: [{ kind: 'shield', until: NOW + HOUR }],
});
const SHIELD_AT = Math.floor((NOW + HOUR) / 1000);

/**
 * Every place a custom emoji mustn't be: the plain-text slots, and inside a
 * pill. An empty list means the card is clean.
 */
function misplacedEmoji(embed) {
  const d = embed.toJSON();
  const bad = [];
  for (const [where, text] of [['title', d.title], ['author', d.author?.name], ['footer', d.footer?.text]]) {
    if (text?.includes('<:')) bad.push(where);
  }
  for (const text of [d.description, ...(d.fields || []).flatMap(f => [f.name, f.value])]) {
    for (const span of (text || '').match(/`[^`]*`/g) || []) if (span.includes('<')) bad.push(`pill ${span}`);
  }
  return bad;
}

/** Markup left broken by a clip: half an emoji or timestamp, an unclosed pill */
function brokenMarkup(text) {
  const rest = text.replace(/<(?:a?:\w+:\d+|t:-?\d+(?::[tTdDfFR])?)>/g, '');
  return /<[:t]/.test(rest) || (text.match(/`/g) || []).length % 2 === 1;
}

describe('the card, line by line', () => {
  test('fallback: avatar, total and rank, a column per game, the shield', () => {
    const { embed, step } = layoutGameCard(card(), { kit: fallback, now: NOW });
    expect(step).toBe(0);
    expect(embed.toJSON()).toEqual({
      color: 0xE67E22,
      author: { name: 'Sam' },
      title: 'Game card',
      thumbnail: { url: 'https://cdn.example/sam.png' },
      description: '🪙 `5` points · 🥇 `1st` of 3 players',
      fields: [
        { name: '🥧 Food Fight', value: '`6` pts · #1\n3 plays\n2 🎯 · 1 💨\nReceived: 1 😋\n🔥 best 2', inline: true },
        { name: '🪓 Doom', value: '`−1` pts · #2\n0 plays\nReceived: 1 💀', inline: true },
        { name: '🌀 In effect', value: `🛡️ Safe from /doom until <t:${SHIELD_AT}:t>`, inline: false },
      ],
      footer: { text: 'All time · Anyone\'s card: right-click them → Apps → Game card' },
    });
  });

  test('with the kit uploaded: the same card, its icons swapped for custom emoji', () => {
    const d = renderGameCard(card(), { kit: uploaded, now: NOW }).toJSON();
    expect(d.description).toBe(`${E('coin')} \`5\` points · ${E('med1')} \`1st\` of 3 players`);
    expect(d.fields.map(f => f.name)).toEqual([`${E('food')} Food Fight`, `${E('doom')} Doom`, `${E('effect')} In effect`]);
    expect(d.fields[0].value).toBe(`\`6\` pts · #1\n3 plays\n2 🎯 · 1 💨\nReceived: 1 😋\n${E('flame')} best 2`);
    expect(d.fields[2].value).toBe(`${E('shield')} Safe from /doom until <t:${SHIELD_AT}:t>`);
    // The plain-text slots are exactly as in fallback
    const plain = renderGameCard(card(), { kit: fallback, now: NOW }).toJSON();
    expect([d.author, d.title, d.footer]).toEqual([plain.author, plain.title, plain.footer]);
  });

  test('custom emoji never in the title, author or footer, and never inside a pill', () => {
    for (const kit of [uploaded, longest]) {
      expect(misplacedEmoji(renderGameCard(card(), { kit, now: NOW }))).toEqual([]);
      expect(misplacedEmoji(renderGameCard(worstReal(), { kit, now: NOW }))).toEqual([]);
    }
  });

  test('a running streak, a rank past the podium, one point, one player', () => {
    const data = card();
    data.total = 1;
    data.rank = 4;
    data.ranked = 1;
    data.games[0].streak = 2;
    const d = renderGameCard(data, { kit: fallback, now: NOW }).toJSON();
    expect(d.description).toBe('🪙 `1` point · 📊 `4th` of 1 player');
    expect(d.fields[0].value.split('\n').pop()).toBe('🔥 2 now · best 2');
  });

  test('one game: named in the title; the period is in the footer', () => {
    const data = { ...card(), scope: 'Doom', periodLabel: 'November 2026', games: [card().games[1]], effects: [] };
    const d = renderGameCard(data, { kit: fallback, now: NOW }).toJSON();
    expect(d.title).toBe('Game card · Doom');
    expect(d.footer.text).toBe(`November 2026 · ${CARD_HINT}`);
    expect(d.fields.map(f => f.name)).toEqual(['🪓 Doom']);
  });
});

describe('absent sections add nothing', () => {
  test('no effects, or one that has run out: no "In effect" field', () => {
    const none = renderGameCard({ ...card(), effects: [] }, { kit: fallback, now: NOW }).toJSON();
    const expired = renderGameCard(card(), { kit: fallback, now: NOW + 2 * HOUR }).toJSON();
    const missing = renderGameCard({ ...card(), effects: undefined }, { kit: fallback, now: NOW }).toJSON();
    for (const d of [none, expired, missing]) {
      expect(d.fields.map(f => f.name)).toEqual(['🥧 Food Fight', '🪓 Doom']);
    }
  });

  test('nothing played: the message, and not one field', () => {
    const data = { ...card(), games: [], effects: [], total: 0, rank: null, emptyText: 'Kim hasn\'t played yet.' };
    const d = renderGameCard(data, { kit: fallback, now: NOW }).toJSON();
    expect(d.description).toBe('Kim hasn\'t played yet.');
    expect(d.fields).toEqual([]);
    expect(messageProblems({ embeds: [d] })).toEqual([]);
  });

  test('no avatar: no thumbnail, rather than an empty one', () => {
    const data = card();
    data.player.avatarUrl = null;
    expect(renderGameCard(data, { kit: fallback, now: NOW }).toJSON().thumbnail).toBeUndefined();
  });

  test('a game with nothing to count shows no empty count lines', () => {
    const d = renderGameCard(card(), { kit: fallback, now: NOW }).toJSON();
    expect(d.fields[1].value).not.toMatch(/\n\n|\n$/);
  });
});

// ── fitting ──────────────────────────────────────────────────────────────

/** The biggest card today's games can make: every game, every outcome, huge numbers, a 32-character name */
function worstReal() {
  const every = (game) => Object.fromEntries(Object.keys({
    potion: { helped: 1, hurt: 1, backfired: 1 },
    foodfight: { hit: 1, miss: 1, backfire: 1, tasty: 1, gross: 1, spill: 1 },
    doom: { doomed: 1, escaped: 1, backfired: 1, blocked: 1 },
    rescue: { rescued: 1, caught: 1, sacrificed: 1 },
  }[game]).map(o => [o, 1_234_567]));
  const names = { potion: 'Potions', foodfight: 'Food Fight', doom: 'Doom', rescue: 'Rescue' };
  return {
    player: { id: 'x', name: 'W'.repeat(32), avatarUrl: 'https://cdn.example/x.png' },
    periodLabel: 'September 2026',
    scope: null,
    total: -12_345_678,
    rank: 1_234,
    ranked: 1_234,
    games: Object.keys(names).map(g => ({
      game: g, name: names[g], points: -12_345_678, rank: 1_234, plays: 12_345_678,
      counts: every(g), received: every(g), streak: 1_234, bestStreak: 12_345,
    })),
    effects: [{ kind: 'shield', until: NOW + HOUR }],
  };
}

/**
 * More than a card can hold: `n` game columns, each with every count, and
 * `effects` lines of effects. Only R3–R5's sections could make a real card
 * this big; until they exist this stands in for them.
 */
function overgrown(n, effects = 1) {
  const base = worstReal().games;
  return {
    ...worstReal(),
    games: Array.from({ length: n }, (_, i) => ({ ...base[i % base.length] })),
    effects: Array.from({ length: effects }, () => ({ kind: 'shield', until: NOW + HOUR })),
  };
}

describe('always within Discord\'s limits', () => {
  test('the uploaded emoji in the worst case are as long as kit emoji get', () => {
    expect(longest.e('coin')).toHaveLength(MAX_EMOJI_MARKUP);
  });

  test('a typical card and the biggest real one both fit as they are, in every kit', () => {
    for (const kit of [fallback, uploaded, longest]) {
      for (const data of [card(), worstReal()]) {
        const { embed, step } = layoutGameCard(data, { kit, now: NOW });
        expect(messageProblems({ embeds: [embed] })).toEqual([]);
        expect(step).toBe(0);
      }
    }
  });

  // Without R3's data the reward, ticks and list steps change nothing, so
  // the first a card without them can land on is "no counts"
  test('overgrown: what they did goes first, and the rest stays', () => {
    // 21 columns: ~6,100 characters with every count, ~4,900 without
    const { embed, step } = layoutGameCard(overgrown(21), { kit: longest, now: NOW });
    const d = embed.toJSON();
    expect(step).toBe(CARD_STEPS.findIndex(s => !s.counts));
    expect(messageProblems({ embeds: [d] })).toEqual([]);
    expect(d.fields[0].value).not.toContain('🎯');
    expect(d.fields[1].value).toMatch(/^Received: /m);
  });

  test('more overgrown: what they received goes next', () => {
    // 22 columns and a near-full effects field: still ~6,100 without the
    // counts, ~4,600 without what they received too
    const { embed, step } = layoutGameCard(overgrown(22, 13), { kit: longest, now: NOW });
    const d = embed.toJSON();
    expect(step).toBe(CARD_STEPS.findIndex(s => !s.received));
    expect(messageProblems({ embeds: [d] })).toEqual([]);
    expect(d.fields[1].value).not.toContain('Received');
    expect(d.fields[1].value).toMatch(/pts · #1234\n12,345,678 plays\n/);
  });

  test('past saving: everything clipped to fit, every field still says something, no markup cut', () => {
    // An effects field of 200 lines is over 1,024 however little else there is
    const { embed, step } = layoutGameCard(overgrown(24, 200), { kit: longest, now: NOW });
    const d = embed.toJSON();
    expect(step).toBe(CARD_STEPS.length - 1);
    expect(messageProblems({ embeds: [d] })).toEqual([]);
    expect(embedTextLength(d)).toBeLessThanOrEqual(LIMITS.total);
    for (const f of d.fields) {
      expect(f.value.length).toBeGreaterThan(20);
      expect(brokenMarkup(f.value)).toBe(false);
    }
  });
});

// ── R3: rewards in progress, nights, Glovebox, titles ────────────────────

const READY_AT = NOW + 5 * HOUR;
const prize = (name, icon, points = 3) => ({ item: icon, name, icon, points });
// Oldest night first; tonight not played yet, one night saved by a Night Light
const ROW = ['missed', 'played', 'played', 'played', 'missed', 'played', 'played',
  'played', 'played', 'saved', 'played', 'played', 'played', 'tonight'];

/** Sam's R3 extras, in the shape getPlayerCardExtras returns them */
const extras = () => ({
  progress: [
    { key: 'hits', game: 'foodfight', icon: 'gpie', label: 'Hits', have: 7, need: 25, prize: prize('Golden Pie', 'gpie'), waiting: false },
    { key: 'dooms', game: 'doom', icon: 'vhs', label: 'Dooms', have: 0, need: 25, prize: prize('Cursed VHS', 'vhs'), waiting: false },
    { key: 'tasty', game: 'foodfight', icon: 'garlic', label: 'Tasty feeds', have: 14, need: 15, prize: prize('Garlic', 'garlic'), waiting: true },
    { key: 'points', game: null, icon: 'gift', label: 'Points', have: 412, need: 750, prize: { item: null, name: 'A random item', icon: 'gift', points: 0 }, waiting: false },
  ],
  nights: { current: 8, best: 12, tier: { key: 'owl', name: 'Night Owl', emoji: '🦉' }, next: { at: 14, name: 'Creature of the Night' }, row: ROW },
  glovebox: [
    { item: 'gpie', name: 'Golden Pie', icon: 'gpie', count: 2, cap: 3, passive: false, about: 'A hit, points ×2', readyAt: null },
    { item: 'garlic', name: 'Garlic', icon: 'garlic', count: 1, cap: 1, passive: true, about: 'Turns a doom', readyAt: READY_AT },
    { item: 'nlight', name: 'Night Light', icon: 'nlight', count: 1, cap: 1, passive: true, about: 'Saves your row', readyAt: null },
  ],
  titles: {
    shown: { key: 'red-shirt', title: 'Red Shirt', badge: '👕' },
    earned: [{ key: 'red-shirt', title: 'Red Shirt', badge: '👕', at: NOW - HOUR }, { key: 'regular', title: 'Regular', badge: '🌙', at: NOW - 2 * HOUR }],
    next: [
      { key: 'pie-sniper', title: 'Pie Sniper', badge: '🥧', have: 47, need: 150 },
      { key: 'taster', title: 'Designated Taster', badge: '🍽️', have: 9, need: 50 },
    ],
  },
});
/** A typical R3 member's card: R1's Sam plus the extras */
const r3card = () => ({ ...card(), ...extras() });

const field = (d, heading) => d.fields.find(f => f.name.endsWith(heading));

describe('R3 sections, line by line', () => {
  test('fallback: the shown title, rewards closest first, the nights row, Glovebox and titles side by side', () => {
    const { embed, step } = layoutGameCard(r3card(), { kit: fallback, now: NOW });
    expect(step).toBe(0);
    expect(embed.toJSON()).toEqual({
      color: 0xE67E22,
      author: { name: 'Sam' },
      title: 'Game card',
      thumbnail: { url: 'https://cdn.example/sam.png' },
      description: '🪙 `5` points · 🥇 `1st` of 3 players\n📜 *Red Shirt* 👕',
      fields: [
        { name: '🥧 Food Fight', value: '`6` pts · #1\n3 plays\n2 🎯 · 1 💨\nReceived: 1 😋\n🔥 best 2', inline: true },
        { name: '🪓 Doom', value: '`−1` pts · #2\n0 plays\nReceived: 1 💀', inline: true },
        {
          name: '🎁 Rewards in progress',
          value: [
            // 14/15 first, held one short by the daily prize cap; the doom
            // counter on 0 isn't in progress, so it isn't here
            '`14/15` 🟪🟪🟪🟪🟪🟪🟪⬜ 🧄 Garlic `+3` · Tasty feeds · 🌙 tomorrow',
            '`412/750` 🟩🟩🟩🟩⬜⬜⬜⬜ 🎁 A random item · Points',
            '`07/25` 🟩🟩⬜⬜⬜⬜⬜⬜ 🥧 Golden Pie `+3` · Hits',
          ].join('\n'),
          inline: false,
        },
        {
          name: '🌙 Nights in a row: `Tier 2`',
          value: [
            '🌑🌕🌕🌕🌑🌕🌕',
            '🌕🌕🔦🌕🌕🌕🌗',
            '`8` nights · best `12` · Creature of the Night at 14',
            '🦉 Night Owl: +1 on your first 4 good plays a day',
          ].join('\n'),
          inline: false,
        },
        { name: '🧰 Glovebox', value: `🥧 Golden Pie ×2\n🧄 Garlic ×1 · ready <t:${READY_AT / 1000}:R>\n🔦 Night Light ×1 · passive`, inline: true },
        { name: '📜 Titles', value: '`2` earned: 👕🌙\n🥧 Pie Sniper `047/150`\n🍽️ Designated Taster `09/50`', inline: true },
        { name: '🌀 In effect', value: `🛡️ Safe from /doom until <t:${SHIELD_AT}:t>`, inline: false },
      ],
      footer: { text: 'All time · Anyone\'s card: right-click them → Apps → Game card' },
    });
  });

  test('with the kit uploaded: bars of pieces, ticks, icons; badges stay Unicode; plain slots untouched', () => {
    const { embed, step } = layoutGameCard(r3card(), { kit: uploaded, now: NOW });
    const d = embed.toJSON();
    expect(step).toBe(0);
    expect(d.description).toBe(`${E('coin')} \`5\` points · ${E('med1')} \`1st\` of 3 players\n${E('scroll')} *Red Shirt* 👕`);
    // ~350 characters a line with eight custom pieces: two fit in a field,
    // the third spills into an untitled one that reads as the same block
    const rewards = d.fields.slice(2, 4);
    expect(rewards).toEqual([
      {
        name: `${E('gift')} Rewards in progress`,
        value: [
          `\`14/15\` ${E('bpl')}${E('bpm').repeat(6)}${E('ber')} ${E('garlic')} Garlic \`+3\` · Tasty feeds · ${E('moon')} tomorrow`,
          `\`412/750\` ${E('bgl')}${E('bgm').repeat(3)}${E('bem').repeat(3)}${E('ber')} ${E('gift')} A random item · Points`,
        ].join('\n'),
        inline: false,
      },
      { name: '\u200b', value: `\`07/25\` ${E('bgl')}${E('bgm')}${E('bem').repeat(5)}${E('ber')} ${E('gpie')} Golden Pie \`+3\` · Hits`, inline: false },
    ]);
    expect(d.fields[4]).toEqual({
      name: `${E('moon')} Nights in a row: \`Tier 2\``,
      value: [
        `${E('ntm')}${E('ntp').repeat(3)}${E('ntm')}${E('ntp').repeat(2)}`,
        `${E('ntp').repeat(2)}${E('nts')}${E('ntp').repeat(3)}${E('ntt')}`,
        '`8` nights · best `12` · Creature of the Night at 14',
        '🦉 Night Owl: +1 on your first 4 good plays a day',
      ].join('\n'),
      inline: false,
    });
    expect(d.fields[5]).toEqual({
      name: `${E('glove')} Glovebox`,
      value: `${E('gpie')} Golden Pie ×2\n${E('garlic')} Garlic ×1 · ready <t:${READY_AT / 1000}:R>\n${E('nlight')} Night Light ×1 · passive`,
      inline: true,
    });
    expect(d.fields[6]).toEqual({ name: `${E('scroll')} Titles`, value: '`2` earned: 👕🌙\n🥧 Pie Sniper `047/150`\n🍽️ Designated Taster `09/50`', inline: true });
    const plain = renderGameCard(r3card(), { kit: fallback, now: NOW }).toJSON();
    expect([d.author, d.title, d.footer]).toEqual([plain.author, plain.title, plain.footer]);
  });

  test('waiting: a purple bar and "tomorrow"; the same counter not held back is green and says nothing more', () => {
    const line = (waiting, kit = fallback) => {
      const data = { ...card(), progress: [{ ...extras().progress[2], waiting }] };
      return field(renderGameCard(data, { kit, now: NOW }).toJSON(), 'Rewards in progress').value;
    };
    expect(line(true)).toBe('`14/15` 🟪🟪🟪🟪🟪🟪🟪⬜ 🧄 Garlic `+3` · Tasty feeds · 🌙 tomorrow');
    expect(line(false)).toBe('`14/15` 🟩🟩🟩🟩🟩🟩🟩⬜ 🧄 Garlic `+3` · Tasty feeds');
    expect(line(false, uploaded)).toBe(`\`14/15\` ${E('bgl')}${E('bgm').repeat(6)}${E('ber')} ${E('garlic')} Garlic \`+3\` · Tasty feeds`);
  });

  test('closest to done first; equally far along, the one with fewer to go', () => {
    const p = (key, have, need) => ({ key, game: null, label: key, have, need, prize: prize(key, 'gift', 0), waiting: false });
    const data = { ...card(), progress: [p('A', 1, 25), p('B', 3, 15), p('C', 6, 30), p('D', 24, 25)] };
    const lines = field(renderGameCard(data, { kit: fallback, now: NOW }).toJSON(), 'Rewards in progress').value.split('\n');
    expect(lines.map(l => l.split(' · ').pop())).toEqual(['D', 'B', 'C', 'A']);
  });

  test.each([
    // [row, heading, tier, next, numbers line, what the tier gives]
    [2, 'Tier 0', null, { at: 3, name: 'Regular' }, '`2` nights · best `5` · Regular at 3', 'New Moon: no bonus yet'],
    [3, 'Tier 1', { key: 'regular', name: 'Regular', emoji: '🌙' }, { at: 7, name: 'Night Owl' }, '`3` nights · best `5` · Night Owl at 7', '🌙 Regular: +1 on your first 3 good plays a day'],
    [7, 'Tier 2', { key: 'owl', name: 'Night Owl', emoji: '🦉' }, { at: 14, name: 'Creature of the Night' }, '`7` nights · best `7` · Creature of the Night at 14', '🦉 Night Owl: +1 on your first 4 good plays a day'],
    [14, 'Tier 3', { key: 'creature', name: 'Creature of the Night', emoji: '🌕' }, null, '`14` nights · best `14`', '🌕 Creature of the Night: +1 on your first 5 good plays a day'],
  ])('nights: %i in a row is %s', (current, heading, tier, next, numbers, buff) => {
    const row = Array.from({ length: 14 }, (_, i) => (i >= 14 - current ? 'played' : 'missed'));
    const data = { ...card(), nights: { current, best: Math.max(current, 5), tier, next, row } };
    const f = field(renderGameCard(data, { kit: fallback, now: NOW }).toJSON(), 'Nights in a row: `' + heading + '`');
    expect(f).toBeDefined();
    expect(f.value.split('\n').slice(2)).toEqual([numbers, buff]);
  });

  test('nights: a tier the table doesn\'t know is placed by the row', () => {
    const data = { ...card(), nights: { current: 9, best: 9, tier: { key: 'x', name: 'Night Shift', emoji: '🌃' }, next: null, row: Array(14).fill('played') } };
    const d = renderGameCard(data, { kit: fallback, now: NOW }).toJSON();
    expect(field(d, 'Tier 2`').value.split('\n').pop()).toBe('🌃 Night Shift: +1 on your first 4 good plays a day');
  });

  test('Glovebox: a passive resting after it fired says when it\'s back; once that\'s passed, it\'s passive again', () => {
    const later = renderGameCard(r3card(), { kit: fallback, now: READY_AT + 1 }).toJSON();
    expect(field(later, 'Glovebox').value.split('\n')[1]).toBe('🧄 Garlic ×1 · passive');
  });

  test('titles: none earned yet says so, with the closest ones still to come; one not started isn\'t one to come', () => {
    const notStarted = { key: 'cockroach', title: 'Cockroach', badge: '🪳', have: 0, need: 50 };
    const data = { ...card(), titles: { shown: null, earned: [], next: [...extras().titles.next, notStarted] } };
    const d = renderGameCard(data, { kit: fallback, now: NOW }).toJSON();
    expect(field(d, 'Titles').value).toBe('None yet\n🥧 Pie Sniper `047/150`\n🍽️ Designated Taster `09/50`');
    expect(d.description).toBe('🪙 `5` points · 🥇 `1st` of 3 players');
  });

  test('an icon code the kit doesn\'t know draws nothing, rather than taking the card down', () => {
    const data = { ...card(), glovebox: [{ ...extras().glovebox[0], icon: 'nosuch' }] };
    expect(field(renderGameCard(data, { kit: uploaded, now: NOW }).toJSON(), 'Glovebox').value).toBe('Golden Pie ×2');
  });

  test('a title with markdown in it shows as typed', () => {
    const data = { ...card(), titles: { shown: { key: 'x', title: 'Pie*Sniper', badge: '🎯' }, earned: [], next: [] } };
    expect(renderGameCard(data, { kit: fallback, now: NOW }).toJSON().description.split('\n')[1]).toBe('📜 *Pie\\*Sniper* 🎯');
  });

  test('nothing played this period, but a Glovebox: the empty message, then what they hold', () => {
    const data = { ...card(), games: [], effects: [], total: 0, rank: null, emptyText: 'No points yet.', ...extras() };
    const d = renderGameCard(data, { kit: fallback, now: NOW }).toJSON();
    expect(d.description).toBe('No points yet.\n📜 *Red Shirt* 👕');
    expect(d.fields.map(f => f.name)).toEqual(['🎁 Rewards in progress', '🌙 Nights in a row: `Tier 2`', '🧰 Glovebox', '📜 Titles']);
  });
});

describe('R3 sections absent add nothing', () => {
  test('a card with R3\'s keys all empty is exactly the R1 card', () => {
    const empty = { ...card(), progress: [], nights: null, glovebox: [], titles: null };
    for (const kit of [fallback, uploaded]) {
      expect(renderGameCard(empty, { kit, now: NOW }).toJSON()).toEqual(renderGameCard(card(), { kit, now: NOW }).toJSON());
    }
  });

  test('every counter on 0, a row of missed nights, no titles: no field for any of them', () => {
    const data = {
      ...card(),
      progress: extras().progress.map(p => ({ ...p, have: 0 })),
      nights: { current: 0, best: 0, tier: null, next: { at: 3, name: 'Regular' }, row: [...Array(13).fill('missed'), 'tonight'] },
      glovebox: [],
      // As the data offers them to someone who's never played: three, all on 0
      titles: { shown: null, earned: [], next: extras().titles.next.map(t => ({ ...t, have: 0 })) },
    };
    expect(renderGameCard(data, { kit: fallback, now: NOW }).toJSON()).toEqual(renderGameCard(card(), { kit: fallback, now: NOW }).toJSON());
  });
});

describe('which extras go on which card', () => {
  /** A getScoreboard result for Sam's two games */
  const board = () => ({
    total: 5, rank: 1, players: 3, shieldedUntil: null,
    games: Object.fromEntries(card().games.map(g => [g.game, { ...g }])),
  });
  const keys = (data) => (data.progress || []).map(p => p.key);

  test('no extras: the R1 data, nothing added', () => {
    expect(cardExtras(null)).toEqual({});
    const data = gameCardData(board(), { player: card().player, shown: ['foodfight', 'doom'], now: NOW });
    for (const key of ['progress', 'nights', 'glovebox', 'titles']) expect(data).not.toHaveProperty(key);
    expect(renderGameCard(data, { kit: fallback, now: NOW }).toJSON()).toEqual(renderGameCard({ ...card(), effects: [] }, { kit: fallback, now: NOW }).toJSON());
  });

  test('all games: every counter but a switched-off game\'s, and the rest as they are', () => {
    const data = gameCardData(board(), { player: card().player, shown: ['doom', 'rescue'], now: NOW, extras: extras() });
    expect(keys(data)).toEqual(['dooms', 'points']);
    expect([data.nights, data.glovebox, data.titles]).toEqual([extras().nights, extras().glovebox, extras().titles]);
  });

  test('one game: its own counters and the shown title; the nights, Glovebox and titles are for the all-games card', () => {
    const data = gameCardData(board(), { player: card().player, shown: ['foodfight'], game: 'foodfight', now: NOW, extras: extras() });
    expect(keys(data)).toEqual(['hits', 'tasty']);
    const d = renderGameCard(data, { kit: fallback, now: NOW }).toJSON();
    expect(d.title).toBe('Game card · Food Fight');
    expect(d.description).toBe('🪙 `5` points · 🥇 `1st` of 3 players\n📜 *Red Shirt* 👕');
    expect(d.fields.map(f => f.name)).toEqual(['🥧 Food Fight', '🎁 Rewards in progress']);
  });
});

describe('drawn from real plays', () => {
  const GUILD = 'game-card-guild';
  beforeEach(() => deleteScores(GUILD));

  // The renderer against what gameCardData.js really returns, so the two
  // can't drift apart on a field name: the card as replyWithGameCard
  // assembles it, minus Discord
  test('two hits tonight: the Night Light, Hits and Points counters, a lit night, titles on their way', () => {
    const sam = { id: 'sam', name: 'Sam' };
    for (const at of [NOW, NOW + 1]) recordPlay(GUILD, { game: 'foodfight', actor: sam, target: { kind: 'role', pingUserIds: [] }, outcome: 'hit' }, at);
    const board = getScoreboard(GUILD, 'sam', 'all-time', NOW, { games: GAMES });
    const extras = getPlayerCardExtras(GUILD, 'sam', { now: NOW });
    const data = gameCardData(board, { player: { id: 'sam', name: 'Sam', avatarUrl: null }, shown: GAMES, now: NOW, extras });
    const d = renderGameCard(data, { kit: fallback, now: NOW }).toJSON();
    // 2.76.0: two good plays, two Chi — the bag joins the card
    expect(d.fields.map(f => f.name)).toEqual(['🥧 Food Fight', '🎁 Rewards in progress', '🌙 Nights in a row: `Tier 0`', '📜 Titles', '🎒 Six-Demon Bag']);
    expect(field(d, 'Six-Demon Bag').value).toBe('☯️ `2/20` Chi ▰▱▱▱▱▱▱▱▱▱ · today `+2/4` · `2 of 2` casts left');
    expect(field(d, 'Rewards in progress').value.split('\n')).toEqual([
      '`1/3` 🟩🟩🟩⬜⬜⬜⬜⬜ 🔦 Night Light · Nights in a row',
      '`02/25` 🟩⬜⬜⬜⬜⬜⬜⬜ 🥧 Golden Pie `+3` · Hits',
      '`006/750` 🟩⬜⬜⬜⬜⬜⬜⬜ 🎁 A random item · Points',
    ]);
    expect(field(d, 'Tier 0`').value.split('\n')).toEqual([
      '🌑🌑🌑🌑🌑🌑🌑',
      '🌑🌑🌑🌑🌑🌑🌕',
      '`1` night · best `1` · Regular at 3',
      'New Moon: no bonus yet',
    ]);
    expect(field(d, 'Titles').value.split('\n')[0]).toBe('None yet');
    expect(field(d, 'Titles').value).toContain('🔥 On Fire `02/10`');
  });

  // 2.76.0: the Six-Demon Bag, from real casts — what's on Sam and from
  // whom, a hex with its way out; one game's card leaves it to the all-games one
  test('the Six-Demon Bag: Chi and its bar, casts left, what\'s on them and from whom; only on the all-games card, and only with the bag on', () => {
    const sam = { id: 'sam', name: 'Sam' };
    for (const at of [NOW - 3, NOW - 2, NOW - 1]) recordPlay(GUILD, { game: 'foodfight', actor: sam, target: { kind: 'role', pingUserIds: [] }, outcome: 'hit' }, at);
    mutateScores(GUILD, (d) => { for (const id of ['kim', 'jo']) d.users[id] = { name: id === 'kim' ? 'Kim' : 'Jo', games: {}, chi: { n: 20 } }; });
    castCharm(GUILD, { caster: { id: 'kim', name: 'Kim' }, target: sam, kind: 'bless', el: 'fire', settings: DEFAULT_GAME_SETTINGS }, NOW);
    castCharm(GUILD, { caster: { id: 'jo', name: 'Jo' }, target: sam, kind: 'hex', el: 'smoke', settings: DEFAULT_GAME_SETTINGS }, NOW);
    const board = getScoreboard(GUILD, 'sam', 'all-time', NOW, { games: GAMES });
    const extras = getPlayerCardExtras(GUILD, 'sam', { now: NOW, settings: DEFAULT_GAME_SETTINGS });
    const d = renderGameCard(gameCardData(board, { player: { id: 'sam', name: 'Sam', avatarUrl: null }, shown: GAMES, now: NOW, extras }), { kit: fallback, now: NOW }).toJSON();
    expect(field(d, 'Six-Demon Bag').value.split('\n')).toEqual([
      `☯️ \`3/20\` Chi ▰▰▱▱▱▱▱▱▱▱ · today \`+3/${CHI.perDay}\` · \`${MAGIC.castsPerDay} of ${MAGIC.castsPerDay}\` casts left`,
      'On you: 🔥 Fired Up *(from Kim)* · 3 plays left — 🌫️ Lost in the Smoke *(hex, from Jo)* · 2 plays left · `/six-demon-bag shrug`',
    ]);
    const food = renderGameCard(gameCardData(board, { player: { id: 'sam', name: 'Sam', avatarUrl: null }, shown: ['foodfight'], game: 'foodfight', now: NOW, extras }), { kit: fallback, now: NOW }).toJSON();
    expect(field(food, 'Six-Demon Bag')).toBeUndefined();
    const off = getPlayerCardExtras(GUILD, 'sam', { now: NOW, settings: { ...DEFAULT_GAME_SETTINGS, magic: false } });
    expect(off.bag).toBeUndefined();
    // (3B) the Blessings prize counter goes with it
    expect(off.progress.map(p => p.key)).not.toContain('blessings');
    // Kim's own card: a caster with Chi left and a cast spent, nothing on her
    expect(getPlayerCardExtras(GUILD, 'kim', { now: NOW }).bag).toMatchObject({ chi: 20 - CHI.cost.bless, casts: 1, on: [] });
  });

  // The whole path: /scoreboard looks the extras up and puts them on the
  // card — Kim's, asked for by Sam, Glovebox and all
  test('/scoreboard on someone else: their rewards, row and titles, from the scores file', async () => {
    const discord = new FakeDiscord({ guildId: GUILD });
    discord.addUser('sam', { nickname: 'Sam' });
    discord.addUser('kim', { nickname: 'Kim' });
    const kim = { id: 'kim', name: 'Kim' };
    // Real time: the command reads the clock, and the nights row with it
    recordPlay(GUILD, { game: 'doom', actor: kim, target: { kind: 'role', pingUserIds: [] }, outcome: 'doomed' });
    const i = discord.command('sam', 'scoreboard', { options: { user: { user: discord.who('kim').user, member: discord.who('kim').member } } });
    await scoreboard.execute(i);
    const d = i.replyMessage.embeds[0].toJSON();
    expect(d.author).toEqual({ name: 'Kim' });
    expect(field(d, 'Rewards in progress').value.split('\n')).toEqual([
      '`1/3` 🟩🟩🟩⬜⬜⬜⬜⬜ 🔦 Night Light · Nights in a row',
      '`01/25` 🟩⬜⬜⬜⬜⬜⬜⬜ 📼 Cursed VHS `+3` · Dooms',
      '`003/750` 🟩⬜⬜⬜⬜⬜⬜⬜ 🎁 A random item · Points',
    ]);
    expect(field(d, 'Nights in a row: `Tier 0`').value.split('\n')[1]).toBe('🌑🌑🌑🌑🌑🌑🌕');
    expect(discord.violations).toEqual([]);
  });
});

// ── R3 fitting ───────────────────────────────────────────────────────────

const BADGE = '🧑‍🤝‍🧑'; // 8 UTF-16 characters: as long as an emoji badge gets
/**
 * R3's worst case: R1's (every outcome, numbers in the millions, a
 * 32-character name) with a fifth column standing in for /siege (R5) —
 * food fight's, which has more outcomes on the card than siege will —
 * every one of nine counters started and held by the daily cap, the
 * longest label and prize, a 14-night row, eight Glovebox items each
 * resting, thirty titles and three to come, and a shield. With `games`
 * past five and more `effects`, it's overgrown: more than real data can
 * be, to walk the card down CARD_STEPS one at a time.
 */
function worstR3({ games = 5, rewards = 9, effects = 1, bag = true } = {}) {
  const real = worstReal();
  const columns = [...real.games, { ...real.games[1], name: 'Siege' }];
  return {
    ...real,
    // 2.76.0: a full Six-Demon Bag, with a blessing and a hex from 32-character names
    ...(bag ? { bag: fullBag() } : {}),
    games: Array.from({ length: games }, (_, i) => ({ ...columns[i % columns.length] })),
    effects: Array.from({ length: effects }, () => ({ kind: 'shield', until: NOW + HOUR })),
    progress: Array.from({ length: rewards }, (_, i) => ({
      key: `k${i}`, game: null, icon: 'silver', label: 'Harmful potions that worked', have: 749 - i, need: 750,
      prize: prize('Silver Bullet', 'silver', 10), waiting: true,
    })),
    nights: { current: 1234, best: 12345, tier: { key: 'creature', name: 'Creature of the Night', emoji: '🧛‍♂️' }, next: { at: 14, name: 'Creature of the Night' }, row: Array(14).fill('saved') },
    glovebox: Array.from({ length: 8 }, () => ({ item: 'silver', name: 'Silver Bullet', icon: 'silver', count: 3, cap: 3, passive: true, about: '', readyAt: NOW + HOUR })),
    titles: {
      shown: { key: 't', title: 'T'.repeat(32), badge: BADGE },
      earned: Array.from({ length: 30 }, (_, i) => ({ key: `t${i}`, title: 'T'.repeat(32), badge: BADGE, at: i })),
      next: Array.from({ length: 3 }, (_, i) => ({ key: `n${i}`, title: 'N'.repeat(32), badge: BADGE, have: 1234, need: 12345 })),
    },
  };
}

/** 2.76.0: the biggest bag a card can show (gameScores.bagStatus' shape) */
function fullBag() {
  const charm = (kind, el, label) => ({ kind, el, label, about: '', by: 'x', byName: 'B'.repeat(32), left: 5, counts: true, until: NOW + HOUR });
  return {
    magic: true, hexesOff: false, chi: 20, bag: 20, today: 4, perDay: 4, helpToday: 6, helpPerDay: 6,
    casts: 0, castsPerDay: 2, hexes: 0, hexesPerDay: 1, peace: null, ward: null, freeShrugs: 1,
    on: [charm('bless', 'thunder', '🌩️ Thunderous Applause'), charm('hex', 'smoke', '🌫️ Lost in the Smoke')],
  };
}

/** The bar pieces in a line of the `longest` kit (`es_bglxxx_…`) */
const barPieces = (line) => (line.match(/<:es_b[a-z][lmr]xxx_ab12:\d+>/g) || []).length;
/** Every line of the rewards block: its field and the untitled ones it spilled into */
function rewardLines(d) {
  const at = d.fields.findIndex(f => f.name.endsWith('Rewards in progress'));
  const block = [d.fields[at]];
  for (let i = at + 1; d.fields[i]?.name === '\u200b'; i++) block.push(d.fields[i]);
  return block.flatMap(f => f.value.split('\n'));
}
const stepWhere = (test) => CARD_STEPS.findIndex(test);

describe('R3: always within Discord\'s limits', () => {
  test('a typical member\'s card fits as it is, in every kit', () => {
    for (const kit of [fallback, uploaded, longest]) {
      const { embed, step } = layoutGameCard(r3card(), { kit, now: NOW });
      expect(messageProblems({ embeds: [embed] })).toEqual([]);
      expect(step).toBe(0);
    }
  });

  test('the worst case fits: as it is in plain emoji; with the longest custom emoji, down to the 4 closest rewards', () => {
    const plain = layoutGameCard(worstR3(), { kit: fallback, now: NOW });
    expect(messageProblems({ embeds: [plain.embed] })).toEqual([]);
    expect(plain.step).toBe(0);
    for (const kit of [uploaded, longest]) {
      const { embed, step } = layoutGameCard(worstR3(), { kit, now: NOW });
      expect(messageProblems({ embeds: [embed] })).toEqual([]);
      expect(step).toBe(stepWhere(s => s.rewards === 4));
    }
  });

  test('custom emoji never in the title, author or footer, and never inside a pill', () => {
    for (const kit of [uploaded, longest]) {
      expect(misplacedEmoji(renderGameCard(r3card(), { kit, now: NOW }))).toEqual([]);
      for (let step = 0; step < CARD_STEPS.length; step++) {
        expect(misplacedEmoji(renderGameCard(worstR3(), { kit, now: NOW, step }))).toEqual([]);
      }
    }
  });

  test('every step gives something up: the worst card is smaller at each than at the one before', () => {
    // Every step but the last (clipping, which only acts on a card still too big)
    const sizes = CARD_STEPS.slice(0, -1).map((_, step) => embedTextLength(draftGameCard(worstR3(), { kit: longest, now: NOW, step })));
    sizes.slice(1).forEach((size, i) => expect(size).toBeLessThan(sizes[i]));
  });

  // 2.76.0: the Six-Demon Bag's bar goes before anything else. Its ten
  // segments are ~370 characters in the longest kit; this card is 243 over
  // with them, and 128 under without
  test('the bag\'s Chi bar goes first', () => {
    const { embed, step } = layoutGameCard(worstR3({ games: 2, rewards: 5, effects: 6 }), { kit: longest, now: NOW });
    const d = embed.toJSON();
    expect(step).toBe(stepWhere(s => !s.bagBar));
    expect(step).toBe(1);
    expect(messageProblems({ embeds: [d] })).toEqual([]);
    expect(field(d, 'Six-Demon Bag').value.split('\n')[0]).toMatch(/^<:es_chixxx_ab12:\d+> `20\/20` Chi · today `\+4\/4` · `2 of 2` casts left$/);
    // …and nothing else gave way: every reward bar still 8 pieces
    expect(rewardLines(d).map(barPieces)).toEqual(Array(5).fill(8));
  });

  // Each fixture is ~250+ characters over at the step before and under at
  // its own, so a reworded line doesn't move it. They're tuned without the
  // Six-Demon Bag (2.76.0, whose own step is above): a bag would move them
  test('bars go to 6 pieces first', () => {
    const { embed, step } = layoutGameCard(worstR3({ games: 2, rewards: 7, effects: 4, bag: false }), { kit: longest, now: NOW });
    const d = embed.toJSON();
    expect(step).toBe(stepWhere(s => s.bar === 6));
    expect(messageProblems({ embeds: [d] })).toEqual([]);
    expect(rewardLines(d).map(barPieces)).toEqual(Array(7).fill(6));
  });

  test('then to 4', () => {
    const { embed, step } = layoutGameCard(worstR3({ games: 2, rewards: 9, effects: 2, bag: false }), { kit: longest, now: NOW });
    const d = embed.toJSON();
    expect(step).toBe(stepWhere(s => s.bar === 4));
    expect(rewardLines(d).map(barPieces)).toEqual(Array(9).fill(4));
  });

  test('then only the 4 closest rewards', () => {
    const { embed } = layoutGameCard(worstR3(), { kit: longest, now: NOW });
    const lines = rewardLines(embed.toJSON());
    expect(lines).toHaveLength(5);
    expect(lines.slice(0, 4).map(l => l.slice(0, 9))).toEqual(['`749/750`', '`748/750`', '`747/750`', '`746/750`']);
    expect(lines[4]).toBe('…and 5 more');
  });

  test('then the nights row in plain emoji', () => {
    const { embed, step } = layoutGameCard(worstR3({ games: 7, rewards: 7, effects: 10, bag: false }), { kit: longest, now: NOW });
    const d = embed.toJSON();
    expect(step).toBe(stepWhere(s => s.plainTicks));
    expect(messageProblems({ embeds: [d] })).toEqual([]);
    expect(field(d, 'Tier 3`').value.split('\n').slice(0, 2)).toEqual(['🔦'.repeat(7), '🔦'.repeat(7)]);
    // …while everything else is still the kit's
    expect(field(d, 'Tier 3`').name).toMatch(/^<:es_moonxx_ab12:\d+> /);
  });

  test('then what they did, then what they received', () => {
    const counts = layoutGameCard(worstR3({ games: 11, rewards: 7, effects: 3, bag: false }), { kit: longest, now: NOW });
    expect(counts.step).toBe(stepWhere(s => !s.counts));
    // Food fight's column: points, plays, then straight to what it received
    expect(counts.embed.toJSON().fields[1].value.split('\n')[2]).toMatch(/^Received: 1,234,567 🎯/);
    const received = layoutGameCard(worstR3({ games: 16, rewards: 7, effects: 1, bag: false }), { kit: longest, now: NOW });
    expect(received.step).toBe(stepWhere(s => !s.received));
    expect(received.embed.toJSON().fields[1].value).not.toContain('Received');
    expect(messageProblems({ embeds: [received.embed] })).toEqual([]);
  });

  test('then the lists are capped, each saying how many more', () => {
    const { embed, step } = layoutGameCard(worstR3({ games: 18, rewards: 7, effects: 9, bag: false }), { kit: longest, now: NOW });
    const d = embed.toJSON();
    expect(step).toBe(stepWhere(s => s.capLists));
    expect(messageProblems({ embeds: [d] })).toEqual([]);
    const glove = field(d, 'Glovebox').value.split('\n');
    expect(glove).toHaveLength(LIST_CAPS.glovebox + 1);
    expect(glove.at(-1)).toBe('…and 4 more');
    const titles = field(d, 'Titles').value.split('\n');
    expect(titles[0]).toBe(`\`30\` earned: ${BADGE.repeat(LIST_CAPS.badges)} …and 22 more`);
    expect(titles.slice(1)).toEqual([`${BADGE} ${'N'.repeat(32)} \`01234/12345\``]);
  });
});

// ── R4: statuses and happenings ──────────────────────────────────────────

/** A status as getPlayerCardExtras returns it, from the real twist table */
const status = (kind, extra = {}) => ({
  kind, icon: TWISTS[kind].emoji, name: TWISTS[kind].name, about: STATUS_NOTES[kind], good: TWISTS[kind].good, until: NOW + 2 * HOUR,
  ...(TWISTS[kind].plays ? { playsLeft: TWISTS[kind].plays } : {}), ...extra,
});
/** A happening as getPlayerCardExtras returns it (no mods) */
const happening = (kind, endsAt = NOW + 45 * 60 * 1000) => {
  const h = HAPPENINGS[kind] || CALENDAR_HAPPENINGS[kind];
  return { kind, name: h.name, emoji: h.emoji, tag: h.tag, about: h.about, endsAt, calendar: !HAPPENINGS[kind] };
};
const ENDS_AT = Math.floor((NOW + 45 * 60 * 1000) / 1000);
const UNTIL = Math.floor((NOW + 2 * HOUR) / 1000);

describe('R4: statuses and happenings, line by line', () => {
  test('"In effect": the shield, then each status — plays left for one that counts them, else when it runs out', () => {
    const data = { ...card(), effects: [...card().effects, status('refill', { playsLeft: 2 }), status('luckybreak'), status('jinxed', { until: NOW - 1 })] };
    const d = renderGameCard(data, { kit: fallback, now: NOW }).toJSON();
    expect(field(d, 'In effect')).toEqual({
      name: '🌀 In effect',
      value: [
        `🛡️ Safe from /doom until <t:${SHIELD_AT}:t>`,
        '🍿 Free Refill: +1 on each good play · 2 plays left',
        `🍀 Lucky Break: the next play can only go well · ends <t:${UNTIL}:R>`,
      ].join('\n'),
      inline: false,
    });
    // With the kit uploaded the shield is its icon; a status stays the emoji it is
    const up = renderGameCard(data, { kit: uploaded, now: NOW }).toJSON();
    expect(field(up, 'In effect').value.split('\n').slice(0, 2)).toEqual([
      `${E('shield')} Safe from /doom until <t:${SHIELD_AT}:t>`,
      '🍿 Free Refill: +1 on each good play · 2 plays left',
    ]);
    expect(field(up, 'In effect').name).toBe(`${E('effect')} In effect`);
  });

  test('a happening in progress is a line in the description; a calendar one is all day; an ended one is gone', () => {
    const data = { ...card(), happenings: [happening('fullmoon'), happening('halloween', null), happening('fog', NOW)] };
    const d = renderGameCard(data, { kit: fallback, now: NOW }).toJSON();
    expect(d.description).toBe([
      '🪙 `5` points · 🥇 `1st` of 3 players',
      `🌕 Full Moon: dooms score double · ends <t:${ENDS_AT}:R>`,
      '🎃 Halloween Night: twists are twice as likely · all day',
    ].join('\n'));
    // Under the shown title, and on a card with nothing played yet too
    const r3 = renderGameCard({ ...r3card(), happenings: [happening('fullmoon')] }, { kit: fallback, now: NOW }).toJSON();
    expect(r3.description.split('\n').slice(1)).toEqual(['📜 *Red Shirt* 👕', `🌕 Full Moon: dooms score double · ends <t:${ENDS_AT}:R>`]);
    const empty = renderGameCard({ ...card(), games: [], effects: [], total: 0, rank: null, emptyText: 'No points yet.', happenings: [happening('doublefeature')] }, { kit: fallback, now: NOW }).toJSON();
    expect(empty.description).toBe(`No points yet.\n🎞️ Double Feature: every point counts twice · ends <t:${ENDS_AT}:R>`);
  });

  test('which card: happenings on every card; statuses on the all-games card, after the shield', () => {
    const board = { total: 5, rank: 1, players: 3, shieldedUntil: NOW + HOUR, games: Object.fromEntries(card().games.map(g => [g.game, { ...g }])) };
    const more = { ...extras(), effects: [status('bitten')], happenings: [happening('fullmoon')] };
    const all = gameCardData(board, { player: card().player, shown: ['foodfight', 'doom', 'rescue'], now: NOW, extras: more });
    expect(all.effects).toEqual([{ kind: 'shield', until: NOW + HOUR }, status('bitten')]);
    expect(all.happenings).toEqual([happening('fullmoon')]);
    const one = gameCardData(board, { player: card().player, shown: ['doom'], game: 'doom', now: NOW, extras: more });
    expect([one.effects, one.happenings]).toEqual([[], [happening('fullmoon')]]);
    // None of either: nothing added, the R3 card as it was
    const none = gameCardData(board, { player: card().player, shown: ['doom'], now: NOW, extras: { ...extras(), effects: [], happenings: [] } });
    expect(none).not.toHaveProperty('happenings');
  });

  test('drawn from real plays: the statuses stored, and the happenings handed in, as the card reads them', () => {
    const GUILD = 'game-card-r4-guild';
    deleteScores(GUILD);
    recordPlay(GUILD, { game: 'foodfight', actor: { id: 'sam', name: 'Sam' }, target: { kind: 'role', pingUserIds: [] }, outcome: 'hit' }, NOW);
    mutateScores(GUILD, (d) => {
      d.users.sam.effects = {
        jinxed: { at: NOW, until: NOW + 2 * HOUR },
        refill: { at: NOW, until: NOW + 2 * HOUR, playsLeft: 1 },
        bitten: { at: NOW - 25 * HOUR, until: NOW - HOUR, playsLeft: 3 }, // ran out an hour ago
      };
    });
    const going = [{ ...happening('fullmoon'), mods: HAPPENINGS.fullmoon.mods }, { ...happening('fog', NOW), mods: HAPPENINGS.fog.mods }];
    const x = getPlayerCardExtras(GUILD, 'sam', { now: NOW, happenings: going });
    // Good ones first, in the twist table's order; no mods on the card
    expect(x.effects).toEqual([status('refill', { playsLeft: 1 }), status('jinxed')]);
    expect(x.happenings).toEqual([happening('fullmoon')]);
    deleteScores(GUILD);
  });
});

describe('R4: always within Discord\'s limits', () => {
  /**
   * R3's worst card plus R4's most: every status at once (seven, each with
   * its longest note) and two happenings in the description — a random
   * one with the longest summary and a calendar day.
   */
  const worstR4 = () => ({
    ...worstR3(),
    effects: [{ kind: 'shield', until: NOW + HOUR }, ...Object.keys(STATUS_NOTES).map(k => status(k))],
    happenings: [happening('sunrise'), happening('friday13', null)],
  });

  test('a typical R4 card fits as it is, in every kit', () => {
    const typical = { ...r3card(), effects: [...card().effects, status('refill'), status('jinxed')], happenings: [happening('fullmoon')] };
    for (const kit of [fallback, uploaded, longest]) {
      const { embed, step } = layoutGameCard(typical, { kit, now: NOW });
      expect(messageProblems({ embeds: [embed] })).toEqual([]);
      expect(step).toBe(0);
    }
  });

  test('the worst case fits: as it is in plain emoji; with the longest custom emoji, by the same step as R3\'s', () => {
    const plain = layoutGameCard(worstR4(), { kit: fallback, now: NOW });
    expect(messageProblems({ embeds: [plain.embed] })).toEqual([]);
    expect(plain.step).toBe(0);
    for (const kit of [uploaded, longest]) {
      const { embed, step } = layoutGameCard(worstR4(), { kit, now: NOW });
      expect(messageProblems({ embeds: [embed] })).toEqual([]);
      // R4 adds ~600 characters at most; the card still stops where R3's
      // did, at the 4 closest rewards, with room to spare
      expect(step).toBe(stepWhere(s => s.rewards === 4));
      // Every status and both happenings are still there, unclipped
      const d = embed.toJSON();
      expect(field(d, 'In effect').value.split('\n')).toHaveLength(8);
      expect(d.description.split('\n').slice(-2)).toEqual([
        `🌅 Sunrise: rescues rarely get caught, shields last 2× · ends <t:${ENDS_AT}:R>`,
        '🔪 Friday the 13th: bad luck is likelier, good plays +1 · all day',
      ]);
    }
  });

  test('custom emoji never in a pill, the title, author or footer, at any step', () => {
    for (const kit of [uploaded, longest]) {
      for (let step = 0; step < CARD_STEPS.length; step++) {
        expect(misplacedEmoji(renderGameCard(worstR4(), { kit, now: NOW, step }))).toEqual([]);
      }
    }
  });
});

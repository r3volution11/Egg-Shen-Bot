/**
 * The personal game card (src/utils/gameCard.js) as a pure renderer: data
 * in, embed out. Checked line by line in fallback (plain emoji, what every
 * server sees until the kit is uploaded) and with a fake registry of
 * uploaded emoji, where the card must keep custom emoji out of the places
 * they may not render (title, author, footer) and out of every pill (a code
 * span shows `<:es_coin_ab12:1…>` as raw text).
 *
 * And it must always fit: a card over Discord's limits is rejected whole
 * and posts nothing. Today's four games can't overflow it; the sections
 * R3–R5 add can, so an overgrown fixture stands in for them here.
 *
 * /scoreboard and the right-click Game card are driven end to end in
 * tests/game-commands.test.js.
 *
 * Run with: npm test -- tests/game-card.test.js
 */

import { describe, test, expect } from '@jest/globals';
import { renderGameCard, layoutGameCard, CARD_STEPS, CARD_HINT } from '../src/utils/gameCard.js';
import { createKit, KIT_CODES, MAX_EMOJI_MARKUP } from '../src/utils/emojiKit.js';
import { messageProblems, embedTextLength, LIMITS } from '../src/utils/embedFit.js';

const NOW = Date.UTC(2026, 10, 1, 20, 0, 0);
const HOUR = 60 * 60 * 1000;

// A registry as emojiSync would leave it: every code uploaded
const registry = new Map(Object.keys(KIT_CODES).map((c, i) => [c, { id: `1${String(i).padStart(18, '0')}`, name: `es_${c}_ab12` }]));
const uploaded = createKit(registry);
const E = (code) => `<:${registry.get(code).name}:${registry.get(code).id}>`;
// The longest an uploaded emoji can be: a six-letter code (`es_xxxxxx_ab12`)
const longest = createKit(new Map(Object.keys(KIT_CODES).map((c, i) => [c, { id: `1${String(i).padStart(18, '0')}`, name: 'es_xxxxxx_ab12' }])));
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

  test('overgrown: what they did goes first, and the rest stays', () => {
    // 21 columns: ~6,100 characters with every count, ~4,900 without
    const { embed, step } = layoutGameCard(overgrown(21), { kit: longest, now: NOW });
    const d = embed.toJSON();
    expect(step).toBe(1);
    expect(messageProblems({ embeds: [d] })).toEqual([]);
    expect(d.fields[0].value).not.toContain('🎯');
    expect(d.fields[1].value).toMatch(/^Received: /m);
  });

  test('more overgrown: what they received goes next', () => {
    // 22 columns and a near-full effects field: still ~6,100 without the
    // counts, ~4,600 without what they received too
    const { embed, step } = layoutGameCard(overgrown(22, 13), { kit: longest, now: NOW });
    const d = embed.toJSON();
    expect(step).toBe(2);
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

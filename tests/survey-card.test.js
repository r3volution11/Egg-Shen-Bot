/**
 * A survey's card with its results (pollManager.createPollEmbed), drawn with
 * the emoji kit: a bar per option, its share and count as text beside it.
 *
 *   🏆 1️⃣ **Alien**
 *   🟨🟨🟨🟨🟨🟨🟨⬜⬜⬜ `67%` · 2 votes
 *
 * The leader's bar is gold, the rest blue; once the survey closes the
 * uploaded bars go grey (muted). Plain squares — what every server sees
 * until the kit is uploaded — keep their colours when closed, because a
 * muted plain bar is white squares, the same as an empty one.
 *
 * The live card is edited on every vote, so its bar width is chosen as if
 * every option had 9,999 votes and 100%: it never changes shape between
 * votes. And the worst case — ten options of 100 characters, a tie line
 * naming all ten — must fit Discord's limits whole, with the longest custom
 * emoji there can be and in fallback.
 *
 * Run with: npm test -- tests/survey-card.test.js
 */

import { describe, test, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { createPollEmbed, SURVEY_BAR_WIDTHS, VOTE_EMOJIS, createPoll, toggleVote } from '../src/utils/pollManager.js';
import { FakeDiscord } from './harness/fakeDiscord.js';
import { createKit, KIT_CODES, MAX_EMOJI_MARKUP } from '../src/utils/emojiKit.js';
import { messageProblems } from '../src/utils/embedFit.js';

const registry = new Map(Object.keys(KIT_CODES).map((c, i) => [c, { id: `1${String(i).padStart(18, '0')}`, name: `es_${c}_ab12` }]));
const uploaded = createKit(registry);
const E = (code) => `<:${registry.get(code).name}:${registry.get(code).id}>`;
const longest = createKit(new Map(Object.keys(KIT_CODES).map((c, i) => [c, { id: `1${String(i).padStart(18, '0')}`, name: `es_${c.padEnd(6, 'x')}_ab12` }])));
const fallback = createKit(null);

const CREATED = '2026-11-01T18:00:00.000Z';
const voters = (n, tag) => Array.from({ length: n }, (_, i) => `${tag}${i}`);

/** A survey with these options, each with that many votes */
function poll(options, { status = 'active', ...rest } = {}) {
  return {
    pollId: 'abc123', guildId: 'g', channelId: 'c', messageId: 'm', creatorId: 'u',
    question: 'Friday double feature?', createdAt: CREATED, votingMethod: 'buttons',
    allowMultipleVotes: false, round: 1, tieBreak: 'runoff', status,
    closedAt: status === 'closed' ? '2026-11-02T18:00:00.000Z' : null,
    options: options.map(([text, n], id) => ({ id, text, emoji: VOTE_EMOJIS[id], votes: voters(n, `v${id}-`) })),
    ...rest,
  };
}

const blocks = (embed) => embed.toJSON().description.split('\n\n');

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

describe('the bars, line by line', () => {
  const three = () => [['A', 2], ['B', 1], ['C', 0]];

  test('open, kit uploaded: the leader gold, the rest blue, the share in a pill and the count', () => {
    expect(blocks(createPollEmbed(poll(three()), true, { kit: uploaded }))).toEqual([
      `${E('trophy')} 1️⃣ **A**\n${E('byl')}${E('bym').repeat(6)}${E('bem').repeat(2)}${E('ber')} \`67%\` · 2 votes`,
      `2️⃣ B\n${E('bbl')}${E('bbm').repeat(2)}${E('bem').repeat(6)}${E('ber')} \`33%\` · 1 vote`,
      `3️⃣ C\n${E('bel')}${E('bem').repeat(8)}${E('ber')} \`0%\` · 0 votes`,
    ]);
  });

  test('closed, kit uploaded: every bar muted grey; the crown stays', () => {
    expect(blocks(createPollEmbed(poll(three(), { status: 'closed' }), true, { kit: uploaded }))).toEqual([
      `${E('trophy')} 1️⃣ **A**\n${E('bsl')}${E('bsm').repeat(6)}${E('bem').repeat(2)}${E('ber')} \`67%\` · 2 votes`,
      `2️⃣ B\n${E('bsl')}${E('bsm').repeat(2)}${E('bem').repeat(6)}${E('ber')} \`33%\` · 1 vote`,
      `3️⃣ C\n${E('bel')}${E('bem').repeat(8)}${E('ber')} \`0%\` · 0 votes`,
    ]);
  });

  test('fallback: coloured squares, 🟨 the leader and 🟦 the rest, open or closed', () => {
    const expected = [
      `🏆 1️⃣ **A**\n${'🟨'.repeat(7)}${'⬜'.repeat(3)} \`67%\` · 2 votes`,
      `2️⃣ B\n${'🟦'.repeat(3)}${'⬜'.repeat(7)} \`33%\` · 1 vote`,
      `3️⃣ C\n${'⬜'.repeat(10)} \`0%\` · 0 votes`,
    ];
    expect(blocks(createPollEmbed(poll(three()), true, { kit: fallback }))).toEqual(expected);
    expect(blocks(createPollEmbed(poll(three(), { status: 'closed' }), true, { kit: fallback }))).toEqual(expected);
  });

  test('a tie for first: no crown, every bar blue', () => {
    expect(blocks(createPollEmbed(poll([['A', 1], ['B', 1]]), true, { kit: fallback }))).toEqual([
      `1️⃣ A\n${'🟦'.repeat(5)}${'⬜'.repeat(5)} \`50%\` · 1 vote`,
      `2️⃣ B\n${'🟦'.repeat(5)}${'⬜'.repeat(5)} \`50%\` · 1 vote`,
    ]);
  });

  test('a runoff settled at random: the kit\'s dice on the tie line and on the pick, whose squares are gold', () => {
    const p = poll([['A', 1], ['B', 1]], { status: 'closed', round: 2, randomWinnerId: 1 });
    expect(blocks(createPollEmbed(p, true, { kit: uploaded }))).toEqual([
      `${E('dice')} Tied again, so the bot picked **B** at random.`,
      `1️⃣ A\n${E('bsl')}${E('bsm').repeat(4)}${E('bem').repeat(4)}${E('ber')} \`50%\` · 1 vote`,
      `${E('dice')} 2️⃣ **B**\n${E('bsl')}${E('bsm').repeat(4)}${E('bem').repeat(4)}${E('ber')} \`50%\` · 1 vote`,
    ]);
    expect(blocks(createPollEmbed(p, true, { kit: fallback }))[2]).toBe(`🎲 2️⃣ **B**\n${'🟨'.repeat(5)}${'⬜'.repeat(5)} \`50%\` · 1 vote`);
  });

  test('without results, the options alone: no bars, no crown', () => {
    expect(createPollEmbed(poll(three()), false, { kit: uploaded }).toJSON().description).toBe('1️⃣ A\n\n2️⃣ B\n\n3️⃣ C');
  });

  test('the title and footer stay plain; nothing custom in a pill', () => {
    for (const kit of [uploaded, longest]) {
      const d = createPollEmbed(poll(three(), { status: 'closed' }), true, { kit }).toJSON();
      expect(d.title).toBe('📊 Friday double feature?');
      expect(d.footer.text).toBe('Survey ID: abc123 • Survey closed • Total votes: 3');
      expect(misplacedEmoji(d)).toEqual([]);
    }
  });
});

describe('the worst case fits, whole', () => {
  // Ten options of Discord's longest (100 characters), all tied, so the
  // closed card's tie line names every one of them
  const names = VOTE_EMOJIS.map((_, i) => `${i} ${'Nightmare on the Longest Street in Town '.repeat(3)}`.slice(0, 100));
  const worst = (n) => poll(names.map(t => [t, n]), {
    status: 'closed', runoffPollId: 'xyz', tiedOptionIds: names.map((_, i) => i),
  });
  /** The bar on each option's second line: how many custom emoji, how many squares */
  const bars = (embed) => blocks(embed).slice(1).map(b => {
    const line = b.split('\n')[1];
    return [(line.match(/<:\w+:\d+>/g) || []).length, (line.match(/[🟨🟦⬜]/gu) || []).length];
  });

  test.each([['the longest custom emoji', longest], ['fallback', fallback]])('with %s: ten 100-character options and a tie line naming them all', (_, kit) => {
    expect(names.every(n => n.length === 100)).toBe(true);
    for (const n of [0, 1, 9999]) {
      const embed = createPollEmbed(worst(n), true, { kit });
      const d = embed.toJSON();
      expect(messageProblems({ embeds: [d] })).toEqual([]);
      // Fitted, not clipped: the tie line and all ten options are there whole
      expect(d.description).toMatch(/^.+ Tied: \*\*0 Nightmare/);
      for (const name of names) expect(d.description).toContain(`${name}\n`);
      expect(d.description).toMatch(/ · [\d,]+ votes?$/);
      expect(misplacedEmoji(d)).toEqual([]);
    }
  });

  test('the bars narrow to fit: with the longest emoji, ten long options get 4-wide bars; fallback keeps 10 squares', () => {
    expect(longest.e('bgl')).toHaveLength(MAX_EMOJI_MARKUP);
    expect(SURVEY_BAR_WIDTHS).toEqual([10, 8, 6, 5, 4]);
    expect(bars(createPollEmbed(worst(1), true, { kit: longest }))).toEqual(Array(10).fill([4, 0]));
    expect(bars(createPollEmbed(worst(1), true, { kit: fallback }))).toEqual(Array(10).fill([0, 10]));
    // Three short options: the widest bars
    expect(bars(createPollEmbed(poll([['A', 2], ['B', 1], ['C', 0]]), true, { kit: longest })).slice(-2)).toEqual([[10, 0], [10, 0]]);
  });

  test('a live card keeps its bar width from the first vote to the 9,999th, whatever the options', () => {
    // Every name length and number of options: each width's boundary is
    // crossed somewhere, so a card measured at its real counts would change
    // width on some vote
    for (let count = 2; count <= 10; count++) {
      for (let len = 10; len <= 100; len++) {
        const open = (n) => poll(names.slice(0, count).map((t, i) => [t.slice(0, len), i === 0 ? n : 0]));
        const widths = [0, 1, 9999].map(n => bars(createPollEmbed(open(n), true, { kit: longest }))[0]);
        expect([count, len, ...widths]).toEqual([count, len, ...Array(3).fill(widths[0])]);
      }
    }
  });
});

describe('/survey results', () => {
  test('ten long picks on a multiple-vote survey: "Your Vote(s)" is cut to fit, and the reply arrives', async () => {
    // 1,058 characters of picks used to be past a field's 1,024: addFields
    // threw after the reply was deferred, so it never came
    const survey = await import('../src/commands/survey.js');
    const GUILD = 'survey-card-results';
    const file = path.join(process.env.GUILD_POLLS_DIR, `${GUILD}.json`);
    try {
      const discord = new FakeDiscord({ guildId: GUILD, channelId: 'general' });
      discord.addUser('sam');
      const names = VOTE_EMOJIS.map((_, i) => `${i} ${'x'.repeat(100)}`.slice(0, 100));
      const p = createPoll(GUILD, 'general', 'msg-1', 'sam', 'Pick all you like', names, true);
      for (let i = 0; i < names.length; i++) toggleVote(GUILD, p.pollId, i, 'sam');

      const i = discord.command('sam', 'survey', { subcommand: 'results', options: { poll_id: p.pollId } });
      await survey.execute(i);
      expect(discord.violations).toEqual([]);
      const mine = i.replyMessage.embeds[0].toJSON().fields.find(f => f.name === 'Your Vote(s)');
      expect(mine.value.length).toBeLessThanOrEqual(1024);
      expect(mine.value.startsWith(`1️⃣ ${names[0]}, 2️⃣ ${names[1]}`)).toBe(true);
      expect(mine.value.endsWith('…')).toBe(true);
    } finally {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  });
});

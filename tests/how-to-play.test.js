/**
 * /how-to-play: quick help for the games, one short card per topic
 * (src/utils/howToPlay.js).
 *
 * What matters here:
 *   - every number comes from the code, and the server's limits from the
 *     server's own settings — a help card that says 20 seconds on a server
 *     set to 45 is worse than none
 *   - games switched off on the server are left out of every topic
 *   - every topic fits Discord's limits with the longest custom emoji there
 *     can be, and keeps custom emoji out of the title, footer and pills
 *   - the buttons and menu work end to end — the real command builds them,
 *     their own customIds and option values are fed back into the real
 *     handlers — and a click on a PUBLIC card never changes it: the clicker
 *     gets that topic privately (CLAUDE.md: a public message's buttons are
 *     clickable by everyone)
 *
 * Run with: npm test -- tests/how-to-play.test.js
 */

import { describe, test, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { MessageFlags } from 'discord.js';
import {
  TOPICS, FIGHTS_BACK, HTP_MENU_ID, helpContext, topicsFor, renderTopic, howToPlayView, footerText,
} from '../src/utils/howToPlay.js';
import * as howToPlay from '../src/commands/how-to-play.js';
import { createKit, KIT_CODES, pill, formatNumber } from '../src/utils/emojiKit.js';
import { messageProblems } from '../src/utils/embedFit.js';
import { DEFAULT_GAME_SETTINGS, POINTS } from '../src/utils/gameScores.js';
import { PRIZES, ITEMS, SIEGE, SIEGE_PACES, TWISTS, TITLES, CHI, MAGIC, BAG_3B } from '../src/data/gameRewards.js';
import { ELEMENTS, ELEMENT_KEYS } from '../src/data/btilcLines.js';
import { HAPPENINGS } from '../src/data/gameHappenings.js';
import { MONSTER_KEYS } from '../src/data/siegeMonsters.js';
import { loadGuildConfig, saveGuildConfig } from '../src/utils/guildConfig.js';
import { FakeDiscord } from './harness/fakeDiscord.js';
import { slugify } from '../src/utils/docsIndex.js';

const GUILD = 'how-to-play-guild';
const CONFIG_FILE = path.join(process.env.GUILD_CONFIGS_DIR || path.join(process.cwd(), 'guild_configs'), `${GUILD}.json`);
const forget = () => { if (fs.existsSync(CONFIG_FILE)) fs.unlinkSync(CONFIG_FILE); };

let handleButtonInteraction;
let handleSelectInteraction;
beforeAll(async () => {
  ({ handleButtonInteraction } = await import('../src/handlers/buttonHandler.js'));
  ({ handleSelectInteraction } = await import('../src/handlers/selectHandler.js'));
});
beforeEach(forget);
afterAll(forget);

const fallback = createKit(null);
// The longest an uploaded emoji can be: every code padded to six letters
const longest = createKit(new Map(Object.keys(KIT_CODES).map((c, i) => [c, { id: `1${String(i).padStart(18, '0')}`, name: `es_${c.padEnd(6, 'x')}_ab12` }])));

/** A server's context from a config fragment, as loadGuildConfig would fill it */
const ctxOf = ({ games = {}, off = [], enabled = true } = {}) => helpContext({
  games,
  commandPermissions: { enabled, ...Object.fromEntries(off.map(g => [g, false])) },
});
const ALL_ON = ctxOf();

const field = (embed, name) => embed.fields.find(f => f.name.endsWith(name));
const text = (embed) => [embed.title, embed.description, ...embed.fields.flatMap(f => [f.name, f.value]), embed.footer?.text].join('\n');
const signed = (n) => (n > 0 ? `+${formatNumber(n)}` : formatNumber(n));

/** Custom emoji where they don't render: the title, footer, or inside a pill */
function misplacedEmoji(embed) {
  const bad = [];
  for (const [where, t] of [['title', embed.title], ['footer', embed.footer?.text]]) if (t?.includes('<:')) bad.push(where);
  for (const t of [embed.description, ...embed.fields.flatMap(f => [f.name, f.value])]) {
    for (const span of (t || '').match(/`[^`]*`/g) || []) if (span.includes('<')) bad.push(`pill ${span}`);
  }
  return bad;
}

// ── fitting ─────────────────────────────────────────────────────────────

describe('every topic fits, with custom emoji only where they render', () => {
  test.each(TOPICS.map(t => [t.key]))('%s: fallback and the longest custom emoji', (key) => {
    const plain = renderTopic(key, ALL_ON, { kit: fallback });
    const custom = renderTopic(key, ALL_ON, { kit: longest });
    for (const embed of [plain, custom]) {
      expect(messageProblems({ embeds: [embed] })).toEqual([]);
      expect(misplacedEmoji(embed)).toEqual([]);
    }
    // The kit really is in use (the card isn't plain whatever the kit) …
    expect(text(custom)).toContain('<:es_');
    // … and the plain-text slots are the same either way
    expect([custom.title, custom.footer]).toEqual([plain.title, plain.footer]);
    expect(plain.footer.text).toBe('/how-to-play · full guide: eggshenbot.com/commands/games');
  });

  test('the menu and buttons are inside Discord\'s limits, with unique customIds', () => {
    for (const t of TOPICS) {
      const view = howToPlayView(t.key, ALL_ON, { kit: fallback });
      const rows = view.components.map(r => r.toJSON());
      const ids = rows.flatMap(r => r.components.map(c => c.custom_id));
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id.length).toBeLessThanOrEqual(100);
      const menu = rows[0].components[0];
      expect(menu.options.length).toBeLessThanOrEqual(25);
      for (const o of menu.options) {
        expect(o.label.length).toBeLessThanOrEqual(100);
        expect(o.value.length).toBeLessThanOrEqual(100);
        expect(o.description.length).toBeLessThanOrEqual(100);
      }
      // Labels are plain: a button can't show the kit's custom emoji
      for (const b of rows[1].components) expect(b.label).not.toContain('<:');
    }
  });
});

// ── the full guide ──────────────────────────────────────────────────────

describe('"Read more in the full guide" lands on the section the card shortens', () => {
  // 2.74.0 split the games' one long page into docs/commands/games-*.md. A
  // link to a page or heading that isn't there opens the right site and
  // the wrong place, and nothing else would notice.
  const DOCS = path.join(process.cwd(), 'docs');

  /** Why a docs link doesn't land, or null when it does */
  function landingProblem(url) {
    const m = String(url).match(/^https:\/\/eggshenbot\.com\/([a-z0-9/-]+?)(?:\.html)?(?:#([a-z0-9_-]+))?$/);
    if (!m) return `not a docs link: ${url}`;
    const file = path.join(DOCS, `${m[1]}.md`);
    if (!fs.existsSync(file)) return `no page docs/${m[1]}.md`;
    if (!m[2]) return null;
    let fence = false;
    const ids = [];
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (/^```/.test(line)) fence = !fence;
      const h = !fence && line.match(/^#{2,6}\s+(.+?)\s*$/);
      if (h) ids.push(slugify(h[1].replace(/`/g, '')));
    }
    return ids.includes(m[2]) ? null : `no heading #${m[2]} on docs/${m[1]}.md`;
  }

  const readMore = (key) => renderTopic(key, ALL_ON, { kit: fallback }).description.match(/\[Read more in the full guide\]\(([^)]+)\)/)?.[1];

  test.each(TOPICS.map(t => [t.key]))('%s', (key) => {
    const url = readMore(key);
    expect(url).toBeTruthy();
    expect(landingProblem(url)).toBeNull();
  });

  test('the check catches a page or a heading that isn\'t there', () => {
    // So a pass above means something
    expect(landingProblem('https://eggshenbot.com/commands/games-rewards#prizes')).toBeNull();
    expect(landingProblem('https://eggshenbot.com/commands/games-rewards#the-prizes')).toMatch(/no heading/);
    expect(landingProblem('https://eggshenbot.com/commands/games/siege')).toMatch(/no page/);
    expect(landingProblem('https://eggshenbot.com/commands/games#prizes')).toMatch(/no heading/);
  });
});

// ── the numbers ─────────────────────────────────────────────────────────

describe('numbers come from the code and the server\'s own settings', () => {
  test('the basics show this server\'s limits, not the defaults', () => {
    const own = renderTopic('basics', ctxOf({ games: { cooldownSeconds: 45, perMinute: 4, dailyScoredPlays: 12, shieldMinutes: 30, pace: 'quick' } }), { kit: fallback });
    expect(field(own, 'Limits on this server').value).toBe(
      'Each game every `45s` · `4` plays a minute\n'
      + `The first \`12\` plays of each game a day score (siege: ${pill(SIEGE.scoredPerDay)} attacks). After that, play for fun.`,
    );
    expect(field(own, 'Rescue').value).toContain('safe from /doom for `30m`');

    // An untouched server: the defaults, read from DEFAULT_GAME_SETTINGS
    const d = DEFAULT_GAME_SETTINGS;
    const plain = renderTopic('basics', ALL_ON, { kit: fallback });
    expect(field(plain, 'Limits on this server').value.split('\n')[0]).toBe(`Each game every \`${d.cooldownSeconds}s\` · ${pill(d.perMinute)} plays a minute`);
    expect(field(plain, 'Limits on this server').value).toContain(`The first ${pill(d.dailyScoredPlays)} plays of each game a day score`);
  });

  test('2.74.0: how siege attacks score, at this server\'s pace — the pot from day on, the allowance from evening (review, 2026-11-06: "30 attacks" at every pace)', () => {
    const limits = (games) => field(renderTopic('basics', ctxOf({ games }), { kit: fallback }), 'Limits on this server').value.split('\n').slice(1).join('\n');
    // Quick: the first 30 a day score, as before 2.74
    expect(limits({ pace: 'quick' })).toBe(`The first ${pill(DEFAULT_GAME_SETTINGS.dailyScoredPlays)} plays of each game a day score (siege: ${pill(SIEGE.scoredPerDay)} attacks). After that, play for fun.`);
    expect(limits({ pace: 'quick', dailyScoredPlays: 0 })).toBe(`Plays here are for fun: none score points, but the first ${pill(SIEGE.scoredPerDay)} siege attacks a day do.`);
    // Evening: each scores, the allowance a night
    const ev = SIEGE_PACES.evening.allowance;
    expect(limits({ pace: 'evening' })).toBe(`The first ${pill(DEFAULT_GAME_SETTINGS.dailyScoredPlays)} plays of each game a day score (siege: ${pill(ev)} attacks a night each). After that, play for fun.`);
    expect(limits({ pace: 'evening', dailyScoredPlays: 0 })).toBe(`Plays here are for fun: none score points, but siege attacks do (${pill(ev)} a night each).`);
    // Day on (week is the default): into the pot, never "the first 30 score"
    for (const [pace, games] of [['week', {}], ['week', { pace: 'week' }], ['days3', { pace: 'days3' }], ['day', { pace: 'day' }]]) {
      const pot = `Siege attacks: ${pill(SIEGE_PACES[pace].allowance)} a night each, and their points go into the pot, paid out when the monster's beaten.`;
      expect(limits(games)).toBe(`The first ${pill(DEFAULT_GAME_SETTINGS.dailyScoredPlays)} plays of each game a day score. After that, play for fun.\n${pot}`);
      expect(limits({ ...games, dailyScoredPlays: 0 })).toBe(`Plays here are for fun: none score points.\n${pot}`);
      expect(limits(games)).not.toContain(`${SIEGE.scoredPerDay}`);
    }
    // No siege on the server: no siege words at all
    expect(field(renderTopic('basics', ctxOf({ off: ['siege'] }), { kit: fallback }), 'Limits on this server').value).not.toMatch(/siege/i);
  });

  test('each game\'s line carries its POINTS', () => {
    const e = renderTopic('basics', ALL_ON, { kit: fallback });
    const [you, them] = POINTS.foodfight.hit;
    expect(field(e, 'Food Fight').value.split('\n')[0]).toBe(`\`/foodfight throw target:@Sam\` hurts · 🎯 a hit: you ${pill(signed(you))}, Sam ${pill(signed(them))}`);
    const [hy, ht] = POINTS.potion.helped;
    expect(field(e, 'Potions').value).toContain(`\`/potion give user:@Sam type:health\` helps · 💚 it works: you ${pill(signed(hy))}, Sam ${pill(signed(ht))}`);
  });

  test('prizes, titles, twists and happenings are read from their tables', () => {
    const prizes = renderTopic('prizes', ALL_ON, { kit: fallback });
    for (const p of PRIZES) expect(field(prizes, 'Prizes').value).toContain(`${pill(formatNumber(p.need))} ${p.noun} →`);
    expect(field(prizes, 'Prizes').value).toContain(`${pill(PRIZES[0].need)} hits → 🥧 ${ITEMS.gpie.name} ${pill(signed(PRIZES[0].points))}`);
    expect(field(prizes, 'Titles').value).toMatch(new RegExp(`^\`${TITLES.length}\` titles`));

    const twists = renderTopic('twists', ctxOf({ games: { twistPercent: 9 } }), { kit: fallback });
    const good = Object.values(TWISTS).filter(t => t.good).length;
    expect(twists.description).toContain(`there's a \`9%\` chance`);
    expect(twists.description).toContain(`${pill(good)} good twists and ${pill(Object.keys(TWISTS).length - good)} bad`);

    const happenings = renderTopic('happenings', ctxOf({ games: { happeningFrequency: 'rare' } }), { kit: fallback });
    for (const h of Object.values(HAPPENINGS)) expect(field(happenings, 'The random ones').value).toContain(`${h.emoji} **${h.name}**`);
    expect(field(happenings, 'How often').value).toContain('This server: **Rare**');
  });

  test('the siege: damage, rewards, and how long one lasts here (quick pace)', () => {
    const e = renderTopic('siege', ctxOf({ games: { siegeMinutes: 60, pace: 'quick' } }), { kit: fallback });
    expect(field(e, 'Fight').value).toContain(`Damage: 🥧 food ${pill(SIEGE.damage.splat)} · 🪓 doom ${pill(SIEGE.damage.smite)} · 🧪 potion ${pill(SIEGE.damage.poisoned)}`);
    expect(field(e, 'Win or lose').value).toContain(`${pill(SIEGE.rewards.perFighter)} points a fighter`);
    expect(field(e, 'When').value).toContain('One lasts `1h`.');
    expect(e.description).toContain(`${pill(MONSTER_KEYS.length)} monsters`);
    // R6's numbers, from the one block that holds them until R6 lands
    expect(field(e, 'It fights back').value).toContain(`Not freed in \`${FIGHTS_BACK.freeMinutes}m\`: ${pill(signed(-FIGHTS_BACK.notFreedLoss))}`);
    expect(field(e, 'It fights back').value).toContain(`(${pill(signed(SIEGE.credit.cure))} to your share)`);
  });

  test('2.74.0: the siege at this server\'s pace — a server that never chose is on week, with week\'s windows, allowance, pot and report', () => {
    const week = SIEGE_PACES.week;
    for (const e of [renderTopic('siege', ctxOf(), { kit: fallback }), renderTopic('siege', ctxOf({ games: { pace: 'week' } }), { kit: fallback })]) {
      const back = field(e, 'It fights back').value;
      expect(back).toContain(`Every \`${week.actEvery}m\` of fighting or so the monster acts, only while people are attacking.`);
      expect(back).toContain(`Not freed in \`${week.freeMinutes / 60} hours\`: ${pill(signed(-SIEGE.grab.loss))} and out for a day.`);
      expect(back).toContain(`It wears off after \`${week.poisonMinutes / 60} hours\`.`);
      const win = field(e, 'Win or lose').value;
      expect(win).toContain(`Win: the pot, ${pill(week.pool.perFighter)} points a fighter a night, split by what each did, ${pill(SIEGE.rewards.eachMin)}–${pill(week.pool.eachMax)} each. 🗡️ The Wang Chi (most frees and cures) gets ${pill(signed(SIEGE.rewards.wangChiBonus * week.honour))} and loot; 🔪 the Jack Burton (the killing blow) ${pill(signed(SIEGE.rewards.jackBonus * week.honour))}.`);
      // 2.75.0: honours ×H — a week campaign's Wang Chi is +24, its Jack Burton +9 (×3), and backing is on the card
      expect(week.honour).toBe(3);
      expect(win).toContain('🗡️ The Wang Chi (most frees and cures) gets `+24` and loot; 🔪 the Jack Burton (the killing blow) `+9`.');
      expect(win).toContain(`🎲 \`/siege back fighter:@Sam points:5\` in the first half (${pill(SIEGE.backing.min)}–${pill(SIEGE.backing.max)}): ×2 if they're the Wang Chi, your stake back if top 3 or the Jack Burton.`);
      expect(win).toContain(`${pill(week.allowance)} attacks a night each (12:00 to 12:00 UTC); freeing and curing don't use them.`);
      expect(field(e, 'When').value).toBe(`At random: the next comes \`${week.gapHours / 24} days\` after the last one ends, once people are playing, or when an admin runs \`/siege start\`. One lasts \`a week\`, ending at 12:00 UTC, with a report each night.`);
    }
    // Each pace reads its own preset; a server's siege-minutes only matters at quick
    const day = renderTopic('siege', ctxOf({ games: { pace: 'day', siegeMinutes: 60 } }), { kit: fallback });
    // A day siege holds one 12:00 UTC, and reports at it unless it began within the hour before (review, 2026-11-06)
    expect(field(day, 'When').value).toContain('One lasts `a day`, with a report at 12:00 UTC (unless it started in the hour before).');
    expect(field(day, 'Win or lose').value).toContain(`${pill(SIEGE_PACES.day.allowance)} attacks a night each`);
    const evening = renderTopic('siege', ctxOf({ games: { pace: 'evening' } }), { kit: fallback });
    expect(field(evening, 'When').value).toContain('about `3` a week here');
    expect(field(evening, 'When').value).toContain('One lasts `4 hours`.');
    expect(field(evening, 'Win or lose').value).toContain(`Win: ${pill(SIEGE_PACES.evening.pool.perFighter)} points a fighter a night`);
    // Quick, evening and day: H = 1 (the Wang Chi +8, the Jack Burton +3)
    expect(field(evening, 'Win or lose').value).toContain('gets `+8` and loot; 🔪 the Jack Burton (the killing blow) `+3`.');
  });

  test('R2 review: the unscored-help cap — saving always works, but past a game\'s scoring cap only the first few a night count (with scored plays off, past the first 20 a day)', () => {
    const n = pill(SIEGE.credit.unscoredPerNight);
    const capped = field(renderTopic('siege', ctxOf({ games: { dailyScoredPlays: 12 } }), { kit: fallback }), 'It fights back').value.split('\n');
    expect(capped.at(-1)).toBe(`Saving someone always works, but past a game's daily scoring cap only your first ${n} frees and cures a night count toward your share.`);
    expect(n).toBe('`2`');
    // 2.75.1: with scored plays off, the first 20 (the default cap) rescues and potions a day count as if scored; the 2 a night only past them
    const off = field(renderTopic('siege', ctxOf({ games: { dailyScoredPlays: 0 } }), { kit: fallback }), 'It fights back').value.split('\n');
    expect(off.at(-1)).toBe(`Saving someone always works. Plays don't score here, but frees and cures from your first \`20\` rescues and \`20\` potions a day count toward your share as if they did; past those, only your first ${n} a night do.`);
    // Only the games that are on: /potion off, no potions
    const noPotion = field(renderTopic('siege', ctxOf({ games: { dailyScoredPlays: 0 }, off: ['potion'] }), { kit: fallback }), 'It fights back').value.split('\n');
    expect(noPotion.at(-1)).toBe(`Saving someone always works. Plays don't score here, but frees and cures from your first \`20\` rescues a day count toward your share as if they did; past those, only your first ${n} a night do.`);
    // Nothing promises unlimited help any more
    for (const e of [renderTopic('siege', ctxOf(), { kit: fallback }), renderTopic('siege', ctxOf({ games: { pace: 'quick' } }), { kit: fallback })]) {
      expect(JSON.stringify(e)).not.toMatch(/unlimited/);
    }
  });

  test('2.74.0: happenings at this server\'s pace — about a day long and weekly from `day` on', () => {
    const week = renderTopic('happenings', ctxOf(), { kit: fallback });
    expect(field(week, 'The random ones').value).toContain('🌕 **Full Moon** `24h`');
    expect(field(week, 'The random ones').value).toContain('🎞️ **Double Feature** `12h`');
    expect(field(week, 'How often').value).toContain('This server: **Normal**, about one a week on a busy server.');
    expect(field(week, 'How often').value).toContain('at least `24h` apart, at most `2` a week');
    const evening = renderTopic('happenings', ctxOf({ games: { pace: 'evening' } }), { kit: fallback });
    expect(field(evening, 'The random ones').value).toContain('🌕 **Full Moon** `4h`');
    expect(field(evening, 'How often').value).toContain('at most `3` a day');
  });
});

// ── games switched off ──────────────────────────────────────────────────

describe('games switched off on the server are left out', () => {
  test('/foodfight off: no food fight anywhere — basics, items, prizes, happenings or siege weapons', () => {
    const ctx = ctxOf({ off: ['foodfight'] });
    expect(field(renderTopic('basics', ctx, { kit: fallback }), 'Food Fight')).toBeUndefined();
    expect(text(renderTopic('items', ctx, { kit: fallback }))).not.toContain(ITEMS.gpie.name);
    expect(field(renderTopic('prizes', ctx, { kit: fallback }), 'Prizes').value).not.toMatch(/ hits →| tasty feeds →/);
    const happenings = field(renderTopic('happenings', ctx, { kit: fallback }), 'The random ones').value;
    expect(happenings).not.toContain('The Fog');
    expect(happenings).not.toContain('Happy Hour');
    expect(happenings).toContain('Full Moon');
    const siege = field(renderTopic('siege', ctx, { kit: fallback }), 'Fight').value;
    expect(siege).toContain('`/siege attack weapon:doom`');
    expect(siege).not.toContain('food');
  });

  test('/siege off: no Siege topic; asked for, it shows the basics and says why', () => {
    const ctx = ctxOf({ off: ['siege'] });
    expect(topicsFor(ctx).map(t => t.key)).toEqual(['basics', 'items', 'prizes', 'nights', 'twists', 'happenings', 'magic']);
    const e = renderTopic('siege', ctx, { kit: fallback });
    expect(e.title).toBe('How to play: the basics');
    expect(e.description.startsWith('⏸️ **Siege isn\'t on this server**, so here are the basics.')).toBe(true);
    expect(field(e, 'Siege')).toBeUndefined();
    expect(text(renderTopic('items', ctx, { kit: fallback }))).not.toContain(ITEMS.silver.name);
    const menu = howToPlayView('basics', ctx, { kit: fallback }).components[0].toJSON().components[0];
    expect(menu.options.map(o => o.value)).not.toContain('siege');
  });

  test('a siege fights back only with the games it needs: grabs need /rescue, poison /potion', () => {
    const noRescue = field(renderTopic('siege', ctxOf({ off: ['rescue'] }), { kit: fallback }), 'It fights back').value;
    expect(noRescue).not.toContain('/rescue');
    expect(noRescue).toContain('/potion give');
    expect(field(renderTopic('siege', ctxOf({ off: ['rescue', 'potion'] }), { kit: fallback }), 'It fights back')).toBeUndefined();
  });

  test('every game off (or the master switch): it says so, with nothing to page through', () => {
    for (const ctx of [ctxOf({ off: ['potion', 'foodfight', 'doom', 'rescue', 'siege'] }), ctxOf({ enabled: false })]) {
      const view = howToPlayView('items', ctx, { kit: fallback });
      expect(view.embeds[0].toJSON().description).toBe('⏸️ **The games are switched off on this server.**');
      expect(view.components).toEqual([]);
    }
  });

  test('twists or happenings switched off: the topic stays, and says so first', () => {
    expect(renderTopic('twists', ctxOf({ games: { twists: false } }), { kit: fallback }).description)
      .toMatch(/^⏸️ \*\*Twists are switched off on this server\.\*\*\n/);
    expect(renderTopic('happenings', ctxOf({ games: { happenings: false } }), { kit: fallback }).description)
      .toMatch(/^⏸️ \*\*Happenings are switched off on this server\.\*\*\n/);
  });
});

// ── end to end ──────────────────────────────────────────────────────────

/** The buttons and menu as Discord shows them on a message */
const nav = (message) => {
  const [menu, prev, next] = message.allComponents;
  return { menu, prev, next };
};
const titleOf = (message) => message.embeds[0].title;

describe('2.76.0: the Six-Demon Bag topic', () => {
  test('Chi, blessings, hexes, fair play and the pay-back — every number the code\'s', () => {
    const e = renderTopic('magic', ALL_ON, { kit: fallback });
    expect(e.title).toBe('How to play: the Six-Demon Bag');
    expect(e.fields.map(f => f.name)).toEqual(['☯️ Chi', `🎒 Blessings · ${CHI.cost.bless} Chi`, `🚨 Hexes · ${CHI.cost.hex} Chi`, '🛡️ Fair play', '⭐ It pays back']);
    const chi = field(e, 'Chi').value.split('\n');
    expect(chi[0]).toContain(`${pill(`+${CHI.earn}`)} for a good play`);
    expect(chi[0]).toContain(`At most ${pill(CHI.perDay)} a day (UTC).`);
    expect(chi[1]).toBe(`${pill(`+${CHI.help}`)} for freeing or curing a siege fighter, at most ${pill(CHI.helpPerDay)} a day: the real hero gets the most magic.`);
    expect(field(e, `Blessings · ${CHI.cost.bless} Chi`).value.split('\n')).toEqual(ELEMENT_KEYS.map(el => `${ELEMENTS[el].emoji} **${ELEMENTS[el].blessName}**: ${ELEMENTS[el].blessAbout}`));
    expect(field(e, `Hexes · ${CHI.cost.hex} Chi`).value.split('\n')).toEqual(ELEMENT_KEYS.map(el => `${ELEMENTS[el].emoji} **${ELEMENTS[el].hexName}**: ${ELEMENTS[el].hexAbout}`));
    const fair = field(e, 'Fair play').value;
    expect(fair).toContain(`${pill(MAGIC.castsPerDay)} casts a day, at most ${pill(MAGIC.hexesPerDay)} a hex`);
    expect(fair).toContain('cancels them: ⚡ Lightning ⟷ 🌩️ Thunder · 🌧️ Rain ⟷ 🔥 Fire · 💨 Wind ⟷ 🌫️ Smoke.');
    expect(fair).toContain(`Nobody takes more than ${pill(MAGIC.hexesReceivedPerDay)} hexes a day, or 1 from the same caster in ${pill(`${MAGIC.hexPairHours}h`)}`);
    const pays = field(e, 'It pays back').value;
    expect(pays).toContain(`you get ${pill(`+${MAGIC.casterPay}`)}${MAGIC.casterPayIn === 'chi' ? ' Chi' : ''}. Hexes never pay.`);
    if (BAG_3B) expect(pays).toContain('🧿 Jade Charm');
  });

  test('hexes off: said, and none of their limits; the bag toggled off: no topic, no Jade Charm, no Blessings prize, no title, no 3B twists', () => {
    const noHexes = renderTopic('magic', ctxOf({ games: { hexes: false } }), { kit: fallback });
    expect(field(noHexes, `Hexes · ${CHI.cost.hex} Chi`).value).toBe('⏸️ **Hexes are switched off on this server.**');
    expect(field(noHexes, 'Fair play').value.split('\n')).toHaveLength(1);
    expect(noHexes.description).not.toContain('hex a rival');
    const off = helpContext({ commandPermissions: { magic: false } });
    expect(topicsFor(off).map(t => t.key)).not.toContain('magic');
    expect(renderTopic('magic', off, { kit: fallback }).title).toBe('How to play: the basics');
    expect(text(renderTopic('items', off, { kit: fallback }))).not.toContain('Jade Charm');
    expect(field(renderTopic('prizes', off, { kit: fallback }), 'Prizes').value).not.toContain('blessings');
    const twists = text(renderTopic('twists', off, { kit: fallback }));
    expect(twists).not.toContain('Red Envelope');
    expect(twists).not.toContain('Ching Dai');
    if (BAG_3B) {
      expect(text(renderTopic('items', ALL_ON, { kit: fallback }))).toContain('Jade Charm');
      expect(field(renderTopic('prizes', ALL_ON, { kit: fallback }), 'Prizes').value).toContain(`${pill(MAGIC.jadeNeed)} blessings → 🧿 Jade Charm`);
    }
  });
});

describe('/how-to-play, its buttons and its menu', () => {
  let discord;
  beforeEach(() => {
    discord = new FakeDiscord({ guildId: GUILD });
    discord.addUser('sam', { nickname: 'Sam' });
    discord.addUser('kim', { nickname: 'Kim' });
  });

  test('private by default; ◀ ▶ and the menu turn the page on that same private card', async () => {
    const i = discord.command('sam', 'how-to-play');
    await howToPlay.execute(i);
    const card = i.replyMessage;
    expect(card.ephemeralFor).toBe('sam');
    expect(titleOf(card)).toBe('How to play: the basics');
    expect(card.embeds[0].footer.text).toBe(footerText());
    expect(nav(card).prev.disabled).toBe(true);

    // Next ▶, by its own customId
    const next = discord.button('sam', card, nav(card).next.customId);
    await handleButtonInteraction(next);
    expect(next.edited).toEqual([card]);
    expect(titleOf(card)).toBe('How to play: items & the Glovebox');
    expect(nav(card).prev.disabled).toBe(false);

    // The menu, by one of its own option values
    const pick = discord.select('sam', card, HTP_MENU_ID, ['siege']);
    await handleSelectInteraction(pick);
    expect(pick.edited).toEqual([card]);
    expect(titleOf(card)).toBe('How to play: the siege');
    // The menu shows where you are; since 2.76.0 the Six-Demon Bag is
    // after the siege, and last: Next ▶ there is off
    expect(nav(card).next.disabled).toBe(false);
    expect(nav(card).menu.options.find(o => o.default)?.value).toBe('siege');
    const last = discord.select('sam', card, HTP_MENU_ID, ['magic']);
    await handleSelectInteraction(last);
    expect(titleOf(card)).toBe('How to play: the Six-Demon Bag');
    expect(nav(card).next.disabled).toBe(true);
    const back = discord.button('sam', card, nav(card).prev.customId);
    await handleButtonInteraction(back);
    expect(titleOf(card)).toBe('How to play: the siege');

    // ◀ Previous goes back one
    const prev = discord.button('sam', card, nav(card).prev.customId);
    await handleButtonInteraction(prev);
    expect(titleOf(card)).toBe('How to play: happenings');
    expect(discord.ephemeral('sam')).toEqual([card]); // pages, not new messages
    expect(discord.violations).toEqual([]);
  });

  test('private:false posts it for the channel; a click there never changes it, the clicker gets the page privately', async () => {
    const i = discord.command('sam', 'how-to-play', { options: { topic: 'nights', private: false } });
    await howToPlay.execute(i);
    const card = i.replyMessage;
    expect(card.ephemeralFor).toBeNull();
    expect(titleOf(card)).toBe('How to play: nights in a row');

    const click = discord.button('kim', card, nav(card).next.customId);
    await handleButtonInteraction(click);
    expect(click.edited).toEqual([]);
    expect(card.history).toHaveLength(1);
    expect(titleOf(card)).toBe('How to play: nights in a row');
    const mine = click.replyMessage;
    expect(mine.ephemeralFor).toBe('kim');
    expect(titleOf(mine)).toBe('How to play: twists');

    // The menu on the public card: the same, privately
    const pick = discord.select('kim', card, HTP_MENU_ID, ['basics']);
    await handleSelectInteraction(pick);
    expect(card.history).toHaveLength(1);
    expect(titleOf(pick.replyMessage)).toBe('How to play: the basics');
    expect(pick.replyMessage.ephemeralFor).toBe('kim');

    // Kim pages on in her own copy, which does change
    const on = discord.button('kim', mine, nav(mine).next.customId);
    await handleButtonInteraction(on);
    expect(on.edited).toEqual([mine]);
    expect(titleOf(mine)).toBe('How to play: happenings');
    expect(titleOf(card)).toBe('How to play: nights in a row');
    expect(discord.violations).toEqual([]);
  });

  test('a button for a topic switched off since the card was posted still answers: the basics, saying why', async () => {
    const i = discord.command('sam', 'how-to-play', { options: { topic: 'happenings' } });
    await howToPlay.execute(i);
    const card = i.replyMessage;
    const config = await loadGuildConfig(GUILD);
    config.commandPermissions.siege = false;
    await saveGuildConfig(GUILD, config);

    const click = discord.button('sam', card, nav(card).next.customId); // htp:siege
    expect(click.customId).toBe('htp:siege');
    await handleButtonInteraction(click);
    expect(titleOf(card)).toBe('How to play: the basics');
    expect(card.embeds[0].description).toContain('Siege isn\'t on this server');
    expect(discord.violations).toEqual([]);
  });

  test('the server\'s own settings reach the card', async () => {
    const config = await loadGuildConfig(GUILD);
    config.games = { ...(config.games || {}), cooldownSeconds: 90 };
    await saveGuildConfig(GUILD, config);
    const i = discord.command('sam', 'how-to-play');
    await howToPlay.execute(i);
    const limits = i.replyMessage.embeds[0].fields.find(f => f.name.endsWith('Limits on this server'));
    expect(limits.value.split('\n')[0]).toBe(`Each game every \`90s\` · ${pill(DEFAULT_GAME_SETTINGS.perMinute)} plays a minute`);
  });

  test('the command: topic choices in order, private an optional boolean', () => {
    const json = howToPlay.data.toJSON();
    expect(json.name).toBe('how-to-play');
    const [topic, priv] = json.options;
    expect(topic.choices.map(c => c.name)).toEqual(['Basics', 'Items & Glovebox', 'Prizes & titles', 'Nights in a row', 'Twists', 'Happenings', 'Siege', 'Six-Demon Bag']);
    expect(topic.required).toBe(false);
    expect([priv.name, priv.type, priv.required]).toEqual(['private', 5, false]);
    expect(MessageFlags.Ephemeral).toBe(64);
  });
});

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
import { PRIZES, ITEMS, SIEGE, TWISTS, TITLES } from '../src/data/gameRewards.js';
import { HAPPENINGS } from '../src/data/gameHappenings.js';
import { MONSTER_KEYS } from '../src/data/siegeMonsters.js';
import { loadGuildConfig, saveGuildConfig } from '../src/utils/guildConfig.js';
import { FakeDiscord } from './harness/fakeDiscord.js';

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

// ── the numbers ─────────────────────────────────────────────────────────

describe('numbers come from the code and the server\'s own settings', () => {
  test('the basics show this server\'s limits, not the defaults', () => {
    const own = renderTopic('basics', ctxOf({ games: { cooldownSeconds: 45, perMinute: 4, dailyScoredPlays: 12, shieldMinutes: 30 } }), { kit: fallback });
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

  test('the siege: damage, rewards, and how long one lasts here', () => {
    const e = renderTopic('siege', ctxOf({ games: { siegeMinutes: 60 } }), { kit: fallback });
    expect(field(e, 'Fight').value).toContain(`Damage: 🥧 food ${pill(SIEGE.damage.splat)} · 🪓 doom ${pill(SIEGE.damage.smite)} · 🧪 potion ${pill(SIEGE.damage.poisoned)}`);
    expect(field(e, 'Win or lose').value).toContain(`${pill(SIEGE.rewards.perFighter)} points a fighter`);
    expect(field(e, 'When').value).toContain('One lasts `1h`.');
    expect(e.description).toContain(`${pill(MONSTER_KEYS.length)} monsters`);
    // R6's numbers, from the one block that holds them until R6 lands
    expect(field(e, 'It fights back').value).toContain(`Not freed in \`${FIGHTS_BACK.freeMinutes}m\`: ${pill(signed(-FIGHTS_BACK.notFreedLoss))}`);
    expect(field(e, 'It fights back').value).toContain(`(${pill(signed(SIEGE.credit.cure))} to your share)`);
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
    expect(topicsFor(ctx).map(t => t.key)).toEqual(['basics', 'items', 'prizes', 'nights', 'twists', 'happenings']);
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
    // Siege is last: Next ▶ is off, and the menu shows where you are
    expect(nav(card).next.disabled).toBe(true);
    expect(nav(card).menu.options.find(o => o.default)?.value).toBe('siege');

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
    expect(topic.choices.map(c => c.name)).toEqual(['Basics', 'Items & Glovebox', 'Prizes & titles', 'Nights in a row', 'Twists', 'Happenings', 'Siege']);
    expect(topic.required).toBe(false);
    expect([priv.name, priv.type, priv.required]).toEqual(['private', 5, false]);
    expect(MessageFlags.Ephemeral).toBe(64);
  });
});

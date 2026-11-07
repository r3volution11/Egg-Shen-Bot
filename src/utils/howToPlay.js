/**
 * /how-to-play: the games explained in a card a member reads in twenty
 * seconds — the basics, items and the Glovebox, prizes and titles, nights
 * in a row, twists, happenings and the siege, one embed each, with a topic
 * menu and ◀ Previous / Next ▶ underneath. Doug asked for quick help for the
 * games (2026-11); the full guide is docs/commands/games.md and the
 * games-*.md pages beside it, each topic's "Read more" links its own.
 *
 * Every number is read from the code that applies it — the rewards data,
 * the happenings, the monsters, POINTS, and THIS server's own game settings
 * (getGameSettings) — so a tuning change, or an admin who changed the
 * cooldown, can never leave the help saying something the games don't do.
 *
 * Games switched off on the server are left out of every topic, as a member
 * sees it: a public how-to posted by an admin mustn't advertise a game
 * members can't play (canUseCommand lets admins play anything).
 *
 * Drawn like the game cards (gameCard.js, leaderboardCard.js): icons through
 * the emoji kit, numbers as `pills`. Custom emoji go only in the description,
 * field names and field values — never the title, footer, a button label or
 * inside a code span (they don't render there).
 *
 * The buttons and menu are on a message that may be public, and a public
 * message's buttons are clickable by everyone (CLAUDE.md): a click on a
 * public one never edits it — the clicker gets that topic privately, and
 * pages on in their own copy, which is edited in place.
 */

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, StringSelectMenuBuilder } from 'discord.js';
import { GAMES, GAME_NAMES, POINTS, getGameSettings, DEFAULT_GAME_SETTINGS } from './gameScores.js';
import { OUTCOME_EMOJI, clipEmbedToFit } from './gameBoards.js';
import { liveKit, pill, formatNumber, progressPill } from './emojiKit.js';
import { messageProblems } from './embedFit.js';
import { loadGuildConfig } from './guildConfig.js';
import { config as botConfig } from '../config.js';
import {
  ITEMS, DAILY, FULL_STACK_POINTS, TITLE_POINTS, PRIZES, TITLES, NIGHT_TIERS, NIGHT_START_HOUR, NIGHTS_SHOWN,
  NIGHT_LIGHT_DAYS, NIGHT_LIGHT_PRIZE, SIEGE, TWISTS, TWIST_RULES, CHI, MAGIC, ELEMENT_OPPOSITE,
} from '../data/gameRewards.js';
import { ELEMENTS, ELEMENT_KEYS } from '../data/btilcLines.js';
import { charmName, charmAbout } from './gameMagic.js';
import { HAPPENINGS, CALENDAR_HAPPENINGS } from '../data/gameHappenings.js';
import { MONSTERS, MONSTER_KEYS } from '../data/siegeMonsters.js';
import {
  pacePreset, paceOf, happeningPace, happeningMinutes, randomGapHours, defaultSiegeMinutes, lengthWords, reportWords,
} from './gamePace.js';

// ── the monster fights back ─────────────────────────────────────────────

/**
 * The numbers the Siege topic's "It fights back" and "When" lines quote,
 * at a server's pace (2.74.0: SIEGE_PACES — a week campaign's windows are
 * hours where a quick siege's are minutes), gathered from the preset, SIEGE
 * and the game settings (tests read them from here too). The Silver Bullet
 * prize is an ordinary PRIZES row ('siegewins'), shown with the other prizes.
 */
export function fightsBack(settings = DEFAULT_GAME_SETTINGS) {
  const key = paceOf(settings);
  const p = pacePreset(key);
  return {
    pace: key,
    busy: p.busy, // the monster's clock only runs while people fight
    everyMinutes: p.actEvery, // the monster acts this often
    freeMinutes: p.freeMinutes, // a grabbed fighter not freed within this…
    notFreedLoss: SIEGE.grab.loss, // …loses this, and is out of the siege…
    outMinutes: p.outMinutes, // …or, from 3 days on, out for this long
    poisonMinutes: p.poisonMinutes, // a poisoned fighter recovers by itself after this
    // Random sieges a week, by the server's siegeFrequency (quick, evening)…
    perWeek: SIEGE.random.perWeek,
    // …or, from `day` on, hours after the last one ends
    gapHours: randomGapHours(key, settings?.siegeFrequency ?? DEFAULT_GAME_SETTINGS.siegeFrequency),
    defaultFrequency: DEFAULT_GAME_SETTINGS.siegeFrequency,
  };
}

/** The quick pace's numbers (the game before 2.74), as FIGHTS_BACK always was */
export const FIGHTS_BACK = Object.freeze(fightsBack({ ...DEFAULT_GAME_SETTINGS, pace: 'quick' }));

// ── topics ──────────────────────────────────────────────────────────────

/** The customId prefix for this card's buttons and menu (buttonHandler / selectHandler route on it) */
export const HTP_PREFIX = 'htp:';
/** The topic menu's customId; every button's is `htp:<topic key>` */
export const HTP_MENU_ID = 'htp:menu';

/**
 * The topics, in the order the `topic:` option, the menu and Next ▶ list
 * them. `doc` is the docs section each one shortens, under /commands/: the
 * games' rules are split across docs/commands/games-*.md (2.74.0; the
 * landing, games.md, still answers the old `games#…` links of older bots).
 * tests/how-to-play.test.js checks each one names a real page and heading.
 * `emoji` is plain Unicode (it labels a menu option, which can't hold the
 * kit's custom emoji).
 */
export const TOPICS = Object.freeze([
  { key: 'basics', name: 'Basics', emoji: '🎮', colour: 0xE67E22, doc: 'games-playing#points', about: 'The games, points, the limits and your score' },
  { key: 'items', name: 'Items & Glovebox', emoji: '🧰', colour: 0x1ABC9C, doc: 'games-rewards#the-glovebox-and-items', about: 'What items do and how to use one' },
  { key: 'prizes', name: 'Prizes & titles', emoji: '🎁', colour: 0xF1C40F, doc: 'games-rewards#prizes', about: 'What you earn by playing, and showing a title' },
  { key: 'nights', name: 'Nights in a row', emoji: '🌙', colour: 0x3F51B5, doc: 'games-rewards#nights-in-a-row', about: 'Play every night for a bonus, and the Night Light' },
  { key: 'twists', name: 'Twists', emoji: '🎲', colour: 0x9B59B6, doc: 'games-happenings#twists', about: 'Surprises, good and bad, after a play' },
  { key: 'happenings', name: 'Happenings', emoji: '🌕', colour: 0x2C7DA0, doc: 'games-happenings#happenings', about: 'Server-wide events that bend the games for a while' },
  { key: 'siege', name: 'Siege', emoji: '👹', colour: 0xC0392B, doc: 'games-siege', about: 'A monster the whole server fights together' },
  // 2.76.0
  { key: 'magic', name: 'Six-Demon Bag', emoji: '🎒', colour: 0x2E8B57, doc: 'games-magic', about: 'Chi, blessings and hexes' },
]);

const TOPIC = Object.fromEntries(TOPICS.map(t => [t.key, t]));

/** The games that aren't the siege: twists and happenings never touch a siege attack */
const CLASSIC = GAMES.filter(g => g !== 'siege');

/**
 * The games members can play here, as canUseCommand decides for a member:
 * the master switch, then each game's own (a key a config predates is on).
 */
export function gamesOn(config) {
  const perms = config?.commandPermissions || {};
  if (perms.enabled === false) return [];
  return GAMES.filter(g => !Object.hasOwn(perms, g) || perms[g] === true);
}

/**
 * Can members use /six-demon-bag here? As canUseCommand decides for a
 * member (happeningScheduler.membersCan's rule): the master switch, then
 * its own toggle, a key the config predates being on
 */
const magicFor = (config) => {
  const perms = config?.commandPermissions || {};
  return perms.enabled !== false && (!Object.hasOwn(perms, 'magic') || perms.magic === true);
};

/** What every topic is drawn from: the games on, the Six-Demon Bag (2.76.0), and this server's settings */
export function helpContext(config) {
  return { games: gamesOn(config), magic: magicFor(config), settings: getGameSettings(config) };
}

/** The siege's weapons that can be used here: each is its own game */
const weaponsOn = (ctx) => Object.keys(SIEGE.weaponGame).filter(w => ctx.games.includes(SIEGE.weaponGame[w]));

/** Is this topic about anything on this server? */
function topicOn(key, ctx) {
  const on = (g) => ctx.games.includes(g);
  if (!ctx.games.length) return false;
  if (key === 'twists' || key === 'happenings') return CLASSIC.some(on);
  if (key === 'siege') return on('siege') && weaponsOn(ctx).length > 0;
  // 2.76.0: Chi comes from playing, so the bag needs a game too
  if (key === 'magic') return ctx.magic === true;
  return true;
}

/** The topics this server has, in order */
export function topicsFor(ctx) {
  return TOPICS.filter(t => topicOn(t.key, ctx));
}

// ── small pieces ────────────────────────────────────────────────────────

/** +3, −1, 0 */
const signed = (n) => (n > 0 ? `+${formatNumber(n)}` : formatNumber(n));
/** "a, b and c" */
const listed = (parts) => (parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`);
/** A time in a pill: `20s`, `2m`, `45m`, `2h` */
function duration(seconds) {
  if (seconds >= 3600 && seconds % 3600 === 0) return pill(`${seconds / 3600}h`);
  if (seconds >= 60 && seconds % 60 === 0) return pill(`${seconds / 60}m`);
  return pill(`${seconds}s`);
}

/** The docs site, as /eggshen-ask links it (a self-hosted bot may point at its own copy) */
const docsBase = () => String(botConfig.docsUrl || 'https://eggshenbot.com').replace(/\/+$/, '');

/** "/how-to-play · full guide: eggshenbot.com/commands/games" — plain text, as every card's footer is */
export function footerText() {
  return `/how-to-play · full guide: ${docsBase().replace(/^https?:\/\//, '')}/commands/games`;
}

/** Every game's command, as a member would type it at Sam (the docs' example member) */
const PLAYS = Object.freeze({
  foodfight: [
    { command: '/foodfight throw target:@Sam', outcome: 'hit', what: 'a hit', kind: 'hurts' },
    { command: '/foodfight feed target:@Sam', outcome: 'tasty', what: 'tasty', kind: 'helps' },
  ],
  doom: [{ command: '/doom fate target:@Sam', outcome: 'doomed', what: 'doomed', kind: 'hurts' }],
  rescue: [{ command: '/rescue attempt target:@Sam', outcome: 'rescued', what: 'saved', kind: 'helps' }],
  potion: [
    { command: '/potion give user:@Sam type:poison', outcome: 'hurt', what: 'it works', kind: 'hurts' },
    { command: '/potion give user:@Sam type:health', outcome: 'helped', what: 'it works', kind: 'helps' },
  ],
});

/** The command an item is used with, for the "Use one" example */
const ITEM_PLAY = Object.freeze({
  foodfight: '/foodfight throw target:@Sam',
  doom: '/doom fate target:@Sam',
  rescue: '/rescue attempt target:@Sam',
  potion: '/potion give user:@Sam type:poison',
  siege: '/siege attack weapon:food',
});

/**
 * The game a passive item defends in. Garlic stops a /doom and the Antidote
 * a harmful potion: with that game off they never fire, so they're left
 * out. (The Night Light, game-less, keeps any nights row.)
 */
const PASSIVE_GAME = Object.freeze({ garlic: 'doom', antid: 'potion' });

/** Is this item any use on this server? */
function itemOn(key, ctx) {
  // 2.76.0 (3B): the Jade Charm turns hexes aside, and comes from blessings
  if (key === 'jade') return topicOn('magic', ctx);
  const game = ITEMS[key].game ?? PASSIVE_GAME[key] ?? null;
  if (game === 'siege') return topicOn('siege', ctx);
  return game === null || ctx.games.includes(game);
}

/** Is this title earnable with the games on here? */
function titleOn(t, ctx) {
  const on = (g) => ctx.games.includes(g);
  if (t.did || t.got) return Object.keys({ ...t.did, ...t.got }).some(on);
  if (t.siege) return on('siege');
  if (t.magic) return topicOn('magic', ctx);
  if (t.twists) return CLASSIC.some(on);
  return ctx.games.length > 0; // streaks and nights: any game
}

/** The games a happening changes; null = every game (Double Feature, Rewind…) */
function happeningGames(h) {
  const m = h.mods || {};
  const rules = [...(m.weights || []), ...(m.points || [])];
  if (m.keepStreaks || m.twistMult || m.goodBonus || rules.some(r => !r.game)) return null;
  const games = new Set(rules.map(r => r.game));
  if (m.shieldMult) games.add('rescue'); // a shield is a rescue's
  return [...games];
}

const happeningOn = (h, ctx) => {
  const games = happeningGames(h);
  return games === null || games.some(g => ctx.games.includes(g));
};

/** A line saying a switch is off, at the top of its topic */
const offLine = (text) => `⏸️ **${text}**`;

/**
 * The basics' scoring lines: the server's daily scored plays, and how siege
 * attacks score at its pace (a siege nobody chose a length for runs to it).
 * At quick the first SIEGE.scoredPerDay a day score; at evening each
 * member has the allowance a night, each scoring; from day on an attack's
 * points go into the pot, the allowance a night. It said "(siege: 30
 * attacks)" at every pace, and with scored plays off "the first 30 siege
 * attacks a day do" — on week, the default, where none score on their own
 * (review, 2026-11-06).
 */
function scoringLimits(s, siegeOn) {
  const p = pacePreset(paceOf(s));
  const plays = s.dailyScoredPlays > 0
    ? `The first ${pill(s.dailyScoredPlays)} plays of each game a day score`
    : 'Plays here are for fun: none score points';
  if (!siegeOn) return [s.dailyScoredPlays > 0 ? `${plays}. After that, play for fun.` : `${plays}.`];
  if (p.pot) {
    return [
      s.dailyScoredPlays > 0 ? `${plays}. After that, play for fun.` : `${plays}.`,
      `Siege attacks: ${pill(p.allowance)} a night each, and their points go into the pot, paid out when the monster's beaten.`,
    ];
  }
  if (p.allowance) {
    return [s.dailyScoredPlays > 0
      ? `${plays} (siege: ${pill(p.allowance)} attacks a night each). After that, play for fun.`
      : `${plays}, but siege attacks do (${pill(p.allowance)} a night each).`];
  }
  return [s.dailyScoredPlays > 0
    ? `${plays} (siege: ${pill(SIEGE.scoredPerDay)} attacks). After that, play for fun.`
    : `${plays}, but the first ${pill(SIEGE.scoredPerDay)} siege attacks a day do.`];
}

// ── the topics ──────────────────────────────────────────────────────────

function basics(ctx, kit) {
  const s = ctx.settings;
  const fields = [];
  for (const g of ctx.games) {
    if (g === 'siege') {
      if (!topicOn('siege', ctx)) continue;
      fields.push({ name: `${kit.game(g)} ${GAME_NAMES[g]}`, value: `\`/siege attack weapon:${weaponsOn(ctx)[0]}\` when a monster attacks: the whole server fights it together` });
      continue;
    }
    const lines = PLAYS[g].map(p => {
      const [you, them] = POINTS[g][p.outcome];
      let line = `\`${p.command}\` ${p.kind} · ${OUTCOME_EMOJI[p.outcome]} ${p.what}: you ${pill(signed(you))}, Sam ${pill(signed(them))}`;
      if (g === 'rescue' && s.shieldMinutes > 0) line += `, and Sam is safe from /doom for ${duration(s.shieldMinutes * 60)}`;
      return line;
    });
    fields.push({ name: `${kit.game(g)} ${GAME_NAMES[g]}`, value: lines.join('\n') });
  }
  fields.push({
    name: `${kit.e('flame')} Streaks`,
    value: 'A play can miss or backfire and cost you. Good plays in a row build a streak; a bad one ends it. Points count for the month, the year and all time.',
  });
  const limits = [s.cooldownSeconds > 0
    ? `Each game every ${duration(s.cooldownSeconds)} · ${pill(s.perMinute)} plays a minute`
    : `${pill(s.perMinute)} plays a minute`];
  limits.push(...scoringLimits(s, topicOn('siege', ctx)));
  fields.push({ name: `${kit.e('clock')} Limits on this server`, value: limits.join('\n') });
  fields.push({
    name: `${kit.e('chart')} Your score`,
    value: '`/scoreboard` your card · `/scoreboard user:@Sam` theirs\nRight-click someone → Apps → Game card\n`/leaderboard` the server\'s top players',
  });
  return {
    title: 'How to play: the basics',
    description: 'Aim a game at someone (a member, a role or @everyone) and points move for you both. Every game that hurts has one that helps. Use the menu below for the rest.',
    fields,
  };
}

function items(ctx, kit) {
  const on = Object.keys(ITEMS).filter(k => itemOn(k, ctx));
  const active = on.filter(k => !ITEMS[k].passive);
  const passive = on.filter(k => ITEMS[k].passive);
  const from = ['prizes'];
  if (ctx.settings.twists && ctx.settings.twistPercent > 0 && topicOn('twists', ctx)) from.push('twists');
  if (topicOn('siege', ctx)) from.push('siege loot');
  const fields = [];
  // The example: the first item for a game that isn't the siege, if any
  const example = active.find(k => ITEMS[k].game !== 'siege') ?? active[0];
  if (example) {
    fields.push({
      name: `${kit.e('glove')} Use one`,
      value: `Add \`item:\` to a play, and Discord lists what you hold that fits:\n\`${ITEM_PLAY[ITEMS[example].game]} item:${ITEMS[example].name}\`\nOne item a play, ${pill(DAILY.itemUses)} a day.`,
    });
    fields.push({
      name: `${kit.e('gift')} Items you use`,
      value: active.map(k => `${kit.e(ITEMS[k].kit)} **${ITEMS[k].name}** · ${ITEMS[k].about}`).join('\n'),
    });
  }
  if (passive.length) {
    fields.push({
      name: `${kit.e('shield')} Items that work by themselves`,
      value: passive.map(k => `${kit.e(ITEMS[k].kit)} **${ITEMS[k].name}** · ${ITEMS[k].about}`).join('\n'),
    });
  }
  const notes = [
    `A full stack turns a new item into ${pill(signed(FULL_STACK_POINTS))} points.`,
    'Past the daily scoring cap, the item stays in your Glovebox.',
  ];
  if (passive.some(k => PASSIVE_GAME[k])) notes.push(`Defences stop at most ${pill(DAILY.defences)} plays on you a day.`);
  fields.push({ name: `${kit.e('star')} Good to know`, value: notes.join('\n') });
  return {
    title: 'How to play: items & the Glovebox',
    description: `Items are one-use helpers kept in your Glovebox, which is on your \`/scoreboard\`. You earn them from ${listed(from)}, and they can't be traded.`,
    fields,
  };
}

function prizes(ctx, kit) {
  // (2.76.0, 3B: the Blessings prize where the bag is on)
  const shown = PRIZES.filter(p => (p.key === 'blessings' ? topicOn('magic', ctx) : p.game === null || (p.game === 'siege' ? topicOn('siege', ctx) : ctx.games.includes(p.game))));
  const prizeLines = shown.map(p => {
    const item = p.item ? `${kit.e(ITEMS[p.item].kit)} ${ITEMS[p.item].name}` : `${kit.e('gift')} a random item`;
    return `${pill(formatNumber(p.need))} ${p.noun} → ${item}${p.points ? ` ${pill(signed(p.points))}` : ''}`;
  });
  const { first, every } = NIGHT_LIGHT_PRIZE;
  prizeLines.push(`${pill(first)} nights in a row, then every ${pill(every)} more → ${kit.e('nlight')} ${ITEMS.nlight.name}`);
  const sample = shown.find(p => p.need > 1) || PRIZES[0];
  prizeLines.push(`At most ${pill(DAILY.prizes)} prizes a day: a counter full after that waits at ${progressPill(sample.need - 1, sample.need)} for tomorrow.`);

  const titles = TITLES.filter(t => titleOn(t, ctx));
  const kinds = ['what you do', 'what\'s done to you', 'streaks', 'nights'];
  if (titles.some(t => t.twists)) kinds.push('twists');
  if (titles.some(t => t.siege)) kinds.push('sieges');
  // One of each kind, as examples: something you do, something done to you, a streak
  const examples = [titles.find(t => t.did), titles.find(t => t.got), titles.find(t => t.streak || t.nights)].filter(Boolean);
  const titleLines = [
    `${pill(titles.length)} titles, each worth ${pill(signed(TITLE_POINTS))} once, for ${listed(kinds)}.`,
    `Like ${listed(examples.map(t => `${t.badge} ${t.title}`))}. Your card shows the ones you're closest to.`,
  ];
  const showing = examples[0] || titles[0];
  return {
    title: 'How to play: prizes & titles',
    description: `Keep playing and the games pay you back. Each kind of play fills a counter (${progressPill(Math.floor(sample.need / 3), sample.need)}); fill it and you get an item and bonus points. They're all on your \`/scoreboard\`.`,
    fields: [
      { name: `${kit.e('gift')} Prizes`, value: prizeLines.join('\n') },
      { name: `${kit.e('scroll')} Titles`, value: titleLines.join('\n') },
      {
        name: `${kit.e('crown')} Show one`,
        value: `\`/scoreboard title:${showing.title}\` puts it beside your name, on your card and the leaderboard. \`/scoreboard title:No title\` hides it.`,
      },
    ],
  };
}

function nights(ctx, kit) {
  const hour = `${String(NIGHT_START_HOUR).padStart(2, '0')}:00`;
  const { first, every } = NIGHT_LIGHT_PRIZE;
  const nightTitles = TITLES.filter(t => t.nights);
  return {
    title: 'How to play: nights in a row',
    description: `Make at least one scored play a night and your row grows. A night runs ${pill(hour)} to ${pill(hour)} UTC, so a late watch party counts as one night.`,
    fields: [
      {
        name: `${kit.e('moon')} Tiers`,
        value: NIGHT_TIERS.map(t => `${t.emoji} **${t.name}** · ${pill(t.at)}+ nights: ${pill('+1')} on your first ${pill(t.buffs)} good plays a day`).join('\n'),
      },
      {
        name: `${kit.e('nlight')} The Night Light`,
        value: `Earned at ${pill(first)} nights, then every ${pill(every)} more. Miss one night and it burns by itself to save your row, at most once in any ${pill(NIGHT_LIGHT_DAYS)} days.`,
      },
      {
        name: `${kit.e('ntp')} On your card`,
        value: `Your last ${pill(NIGHTS_SHOWN)} nights: ${kit.e('ntp')} played · ${kit.e('nts')} saved · ${kit.e('ntm')} missed · ${kit.e('ntt')} tonight`,
      },
      {
        name: `${kit.e('scroll')} Titles`,
        value: `${listed(nightTitles.map(t => `${t.badge} ${t.title} at ${pill(t.need)}`))} nights in a row.`,
      },
    ],
  };
}

/** 2.76.0 (3B): the twists that need the Six-Demon Bag — Ching Dai's Curse hexes as well */
const BAG_TWISTS = Object.freeze({ redEnvelope: (ctx) => topicOn('magic', ctx), chingDai: (ctx) => topicOn('magic', ctx) && ctx.settings.hexes !== false });

function twists(ctx, kit) {
  const s = ctx.settings;
  // A twist that can't come here (the bag off) isn't listed: it never fires
  const all = Object.entries(TWISTS).filter(([key]) => !BAG_TWISTS[key] || BAG_TWISTS[key](ctx)).map(([, t]) => t);
  const good = all.filter(t => t.good);
  const bad = all.filter(t => !t.good);
  const named = (t) => `${t.emoji} ${t.name}${t.points && !t.status ? ` ${pill(signed(t.points))}` : ''}`;
  const off = !s.twists || !(s.twistPercent > 0);
  const lead = off ? `${offLine('Twists are switched off on this server.')}\n` : '';
  const chance = off ? 'there\'s a chance' : `there's a ${pill(`${s.twistPercent}%`)} chance`;
  const safety = [
    `At most ${pill(TWIST_RULES.perDay)} a day, and after a bad one the next is good.`,
    `Twists take at most ${pill(TWIST_RULES.dailyLoss)} points a day, and never take your month below ${pill(0)}.`,
  ];
  safety.push(topicOn('siege', ctx) ? 'Never on a siege attack, or a play past the daily cap.' : 'Never on a play past the daily cap.');
  const statuses = all.filter(t => t.status);
  return {
    title: 'How to play: twists',
    description: `${lead}After a scored play ${chance} that something happens to you, the player, never to who you aimed at: ${pill(good.length)} good twists and ${pill(bad.length)} bad.`,
    fields: [
      { name: `${kit.e('star')} Good`, value: good.map(named).join(' · ') },
      { name: `${kit.e('upset')} Bad`, value: bad.map(named).join(' · ') },
      { name: `${kit.e('shield')} The safety net`, value: safety.join('\n') },
      {
        name: `${kit.e('effect')} Statuses`,
        value: `${pill(statuses.length)} of them change your next plays, like ${listed([statuses.find(t => !t.good && t.plays), statuses.find(t => t.good && t.plays)].filter(Boolean).map(t => `${t.emoji} ${t.name}`))}. They're under In effect on your \`/scoreboard\`, and run out after ${duration(TWIST_RULES.statusHours * 3600)}.`,
      },
    ],
  };
}

/** How often random happenings come, by the server's frequency (HAPPENING_RULES.frequency) */
const FREQUENCY_WORDS = Object.freeze({
  off: 'only when an admin starts one',
  rare: 'half as often as normal',
  normal: 'about one a day on a busy server',
  often: 'twice as often as normal',
});

function happenings(ctx, kit) {
  const s = ctx.settings;
  const pace = paceOf(s);
  const rules = happeningPace(pace);
  const random = Object.values(HAPPENINGS).filter(h => happeningOn(h, ctx));
  const calendar = Object.values(CALENDAR_HAPPENINGS).filter(h => happeningOn(h, ctx));
  const lead = s.happenings ? '' : `${offLine('Happenings are switched off on this server.')}\n`;
  const freq = s.happeningFrequency;
  const freqName = freq.charAt(0).toUpperCase() + freq.slice(1);
  // 2.74.0: how long each lasts at this server's pace (an hour at quick, a day from `day` on)
  const fields = [
    { name: `${kit.e('clock')} The random ones`, value: random.map(h => `${h.emoji} **${h.name}** ${duration(happeningMinutes(h, pace) * 60)} · ${h.about}`).join('\n') },
  ];
  if (calendar.length) {
    fields.push({ name: `${kit.e('dice')} All day, on the calendar`, value: calendar.map(h => `${h.emoji} **${h.name}** · ${h.about}`).join('\n') });
  }
  const minPlayers = Math.min(...random.map(h => h.minPlayers));
  fields.push({
    name: `${kit.e('chart')} How often`,
    value: [
      s.happenings ? `This server: **${freqName}**, ${(rules.per === 'week' && freq === 'normal' ? 'about one a week on a busy server' : FREQUENCY_WORDS[freq]) || ''}.` : null,
      `One at a time, at least ${duration(rules.gapMinutes * 60)} apart, at most ${pill(rules.max)} a ${rules.per}, and only while ${pill(minPlayers)}+ members are playing.`,
    ].filter(Boolean).join('\n'),
  });
  return {
    title: 'How to play: happenings',
    description: `${lead}Now and then something happens to the whole server for a while. It's announced with a new message, and a play it changes carries its tag (${pill(random[0].tag)}) beside the outcome.`,
    fields,
  };
}

function siege(ctx, kit) {
  const on = (g) => ctx.games.includes(g);
  const weapons = weaponsOn(ctx);
  const d = SIEGE.damage;
  const r = SIEGE.rewards;
  // 2.74.0: this server's pace's timings — a siege nobody chose a length for runs to them
  const back0 = fightsBack(ctx.settings);
  const p = pacePreset(back0.pace);
  /** "10m" for a quick window, "22 hours" for a week's (a pill reads badly as `1320m`) */
  const span = (minutes) => (minutes < 120 ? duration(minutes * 60) : pill(lengthWords(minutes)));
  const WEAPON = {
    food: () => `${kit.game('foodfight')} food ${pill(d.splat)}`,
    doom: () => `${kit.game('doom')} doom ${pill(d.smite)}`,
    potion: () => `${kit.game('potion')} potion ${pill(d.poisoned)} + ${pill(SIEGE.poison.perMinute)} a minute for ${duration(SIEGE.poison.minutes * 60)}`,
  };
  const monsters = MONSTER_KEYS.map(k => MONSTERS[k].emoji).join('');
  const fields = [{
    name: `${kit.game('siege')} Fight`,
    value: [
      `\`/siege attack weapon:${weapons[0]}\` in the siege's channel or a thread of it. Anyone can join.`,
      `Damage: ${weapons.map(w => WEAPON[w]()).join(' · ')}`,
      `A ${kit.e('silver')} ${ITEMS.silver.name} does ×${pill(SIEGE.silverMult)}. \`/siege status\` shows your damage and place.`,
    ].join('\n'),
  }];

  // Grabs need /rescue on and poison needs /potion on; otherwise it only roars
  const back = [];
  if (on('rescue')) {
    const out = back0.outMinutes ? `out for ${lengthWords(back0.outMinutes)}` : 'out of the fight';
    back.push(`It grabs a fighter: free them with \`/rescue attempt target:@Sam\` (${pill(signed(SIEGE.credit.free))} to your share). Not freed in ${span(back0.freeMinutes)}: ${pill(signed(-back0.notFreedLoss))} and ${out}.`);
  }
  if (on('potion')) {
    back.push(`It poisons a fighter: cure them with \`/potion give user:@Sam type:health\` (${pill(signed(SIEGE.credit.cure))} to your share), or their Antidote does. It wears off after ${span(back0.poisonMinutes)}.`);
  }
  if (back.length) {
    // 2.75.0: saving always works, but help from plays that don't score is
    // capped (siegeAssist) — "+12 to your share" and "unlimited" said
    // otherwise (review R2, 2026-11-06). 2.75.1: with scored plays off, the
    // siege counts the default cap's worth a day as if they scored
    // (gamePlay.siegeHelp), and the cap starts past those.
    const n = pill(SIEGE.credit.unscoredPerNight);
    const N = pill(DEFAULT_GAME_SETTINGS.dailyScoredPlays);
    const helps = [on('rescue') && `${N} rescues`, on('potion') && `${N} potions`].filter(Boolean).join(' and ');
    back.push(ctx.settings.dailyScoredPlays > 0
      ? `Saving someone always works, but past a game's daily scoring cap only your first ${n} frees and cures a night count toward your share.`
      : `Saving someone always works. Plays don't score here, but frees and cures from your first ${helps} a day count toward your share as if they did; past those, only your first ${n} a night do.`);
    back.unshift(back0.busy
      ? `Every ${duration(back0.everyMinutes * 60)} of fighting or so the monster acts, only while people are attacking. Someone else has to save you.`
      : `Every ${duration(back0.everyMinutes * 60)} or so the monster acts. Someone else has to save you.`);
    fields.push({ name: `${kit.e('upset')} It fights back`, value: back.join('\n') });
  }

  const perNight = p.growthPer === 'night';
  // 2.75.0: the honours, × the pace's H — the helper gets paid, the flashy one gets a laugh
  const honours = `${kit.e('wang')} The Wang Chi (most frees and cures) gets ${pill(signed(r.wangChiBonus * p.honour))} and loot; ${kit.e('jack')} the Jack Burton (the killing blow) ${pill(signed(r.jackBonus * p.honour))}.`;
  const B = SIEGE.backing;
  fields.push({
    name: `${kit.e('trophy')} Win or lose`,
    value: [
      p.pot
        ? `Win: the pot, ${pill(p.pool.perFighter)} points a fighter a night, split by what each did, ${pill(r.eachMin)}–${pill(p.pool.eachMax)} each. ${honours}`
        : `Win: ${pill(p.pool.perFighter)} points a fighter${perNight ? ' a night' : ''}, split by what each did, ${pill(r.eachMin)}–${pill(p.pool.eachMax)} each. ${honours}`,
      `${kit.e('back')} \`/siege back fighter:@Sam points:5\` in the first half (${pill(B.min)}–${pill(B.max)}): ×${B.payout} if they're the Wang Chi, your stake back if top 3 or the Jack Burton.`,
      `It escapes: everyone who attacked loses ${pill(SIEGE.escape.loss)}, when ${pill(SIEGE.escape.minFighters)}+ fought.`,
      p.allowance
        ? `${pill(p.allowance)} attacks a night each (12:00 to 12:00 UTC); freeing and curing don't use them.${p.pot ? ' An attack pays into the pot, not to you, but still counts for your streak, nights and items.' : ''}`
        : `Your first ${pill(SIEGE.scoredPerDay)} attacks a day score points; every one does damage.`,
    ].join('\n'),
  });

  // Random sieges, by the server's pace and siegeFrequency
  const freq = ctx.settings.siegeFrequency ?? back0.defaultFrequency;
  const perWeek = back0.perWeek[freq] ?? 0;
  const length = defaultSiegeMinutes(ctx.settings);
  // When it reports: each night of a campaign; a day siege's one 12:00 UTC (gamePace.reportWords)
  const lasts = `One lasts ${span(length)}${p.nightEnd ? ', ending at 12:00 UTC' : ''}${p.report ? `, with ${reportWords(p)}` : ''}.`;
  fields.push({
    name: `${kit.e('clock')} When`,
    value: perWeek > 0
      ? (p.report
        ? `At random: the next comes ${span(back0.gapHours * 60)} after the last one ends, once people are playing, or when an admin runs \`/siege start\`. ${lasts}`
        : `At random, about ${pill(perWeek)} a week here while people are playing, or when an admin runs \`/siege start\`. ${lasts}`)
      : `When an admin runs \`/siege start\`. ${lasts}`,
  });
  return {
    title: 'How to play: the siege',
    description: `A monster attacks a games channel and the whole server fights it together. Beat it before time runs out and everyone who fought is paid. ${pill(MONSTER_KEYS.length)} monsters: ${monsters}`,
    fields,
  };
}

/**
 * 2.76.0: the Six-Demon Bag (design §2–§3), every number from CHI, MAGIC and
 * the elements' own words — the same about lines /six-demon-bag status shows
 */
function magic(ctx, kit) {
  const hexesOff = ctx.settings.hexes === false;
  const siegeOn = topicOn('siege', ctx);
  const chi = [
    `${pill(`+${CHI.earn}`)} for a good play: a hit, a tasty meal, a doom, a rescue, a potion that works${siegeOn ? ', a siege attack that lands' : ''}. At most ${pill(CHI.perDay)} a day (UTC).`,
  ];
  if (siegeOn) chi.push(`${pill(`+${CHI.help}`)} for freeing or curing a siege fighter, at most ${pill(CHI.helpPerDay)} a day: the real hero gets the most magic.`);
  chi.push(`The bag holds ${pill(CHI.bag)}, and \`/six-demon-bag status\` shows yours.`);
  const list = (kind) => ELEMENT_KEYS.map(el => `${ELEMENTS[el].emoji} **${charmName(kind, el)}**: ${charmAbout(kind, el)}`).join('\n');
  // The three opposed pairs, each from the element the bag lists first
  const pairs = ELEMENT_KEYS.filter((el, i) => ELEMENT_KEYS.indexOf(ELEMENT_OPPOSITE[el]) > i)
    .map(el => [el, ELEMENT_OPPOSITE[el]].map(x => `${ELEMENTS[x].emoji} ${ELEMENTS[x].name}`).join(' ⟷ '));
  const fair = [
    `${pill(MAGIC.castsPerDay)} casts a day${hexesOff ? '' : `, at most ${pill(MAGIC.hexesPerDay)} a hex`}. One blessing and one hex on anyone at a time, and the same element or its opposite cancels them: ${pairs.join(' · ')}.`,
  ];
  if (!hexesOff) {
    fair.push(`Nobody takes more than ${pill(MAGIC.hexesReceivedPerDay)} hexes a day, or 1 from the same caster in ${pill(`${MAGIC.hexPairHours}h`)}, and after a hex there's a ${pill(`${MAGIC.wardHours}h`)} ward. No hexes on yourself, bots, siege fighters, or anyone who hasn't played this week.`);
    fair.push(`\`/six-demon-bag shrug\` shakes a hex off: free once a day, then ${pill(`${CHI.cost.shrug} Chi`)} (free if you're short). \`/six-demon-bag peace on:true\`: no hexes either way, for at least ${pill(`${MAGIC.peaceLockDays} days`)}.`);
  }
  const pays = [`The first time your blessing does something, you get ${pill(`+${MAGIC.casterPay}`)}${MAGIC.casterPayIn === 'chi' ? ' Chi' : ''}. Hexes never pay.`];
  const jade = PRIZES.find(p => p.key === 'blessings');
  if (jade) pays.push(`Every ${pill(jade.need)} that pay off bring a ${kit.e(ITEMS.jade.kit)} ${ITEMS.jade.name}: it turns aside the next hex on you.`);
  const title = TITLES.find(t => t.magic === 'paidElements');
  if (title) pays.push(`Blessings of all six elements that pay off: ${title.badge} ${title.title}.`);
  return {
    title: 'How to play: the Six-Demon Bag',
    description: `Good plays fill your bag with Chi. Spend it to bless a friend${hexesOff ? '' : ' or hex a rival'} with one of six demons: \`/six-demon-bag bless member:@Sam element:Fire\`. Every cast is public, and pings who it lands on.`,
    fields: [
      { name: `${kit.e('chi')} Chi`, value: chi.join('\n') },
      { name: `${kit.e('bag')} Blessings · ${CHI.cost.bless} Chi`, value: list('bless') },
      { name: `${kit.e('upset')} Hexes · ${CHI.cost.hex} Chi`, value: hexesOff ? offLine('Hexes are switched off on this server.') : list('hex') },
      { name: `${kit.e('shield')} Fair play`, value: fair.join('\n') },
      { name: `${kit.e('star')} It pays back`, value: pays.join('\n') },
    ],
  };
}

const RENDER = { basics, items, prizes, nights, twists, happenings, siege, magic };

// ── the card ────────────────────────────────────────────────────────────

/** Which topic to show for a key: itself if this server has it, else the basics */
export function resolveTopic(key, ctx) {
  const on = topicsFor(ctx);
  if (!on.length) return null;
  return on.find(t => t.key === key) || on[0];
}

const fits = (embed) => messageProblems({ embeds: [embed] }).length === 0;

/**
 * One topic as a plain embed (data, not a builder: measured, then wrapped).
 * A topic this server doesn't have shows the basics, saying so; with every
 * game off, it says that and nothing else.
 */
export function renderTopic(key, ctx, { kit = liveKit() } = {}) {
  const topic = resolveTopic(key, ctx);
  if (!topic) {
    return {
      color: TOPIC.basics.colour,
      title: 'How to play',
      description: offLine('The games are switched off on this server.'),
      footer: { text: footerText() },
    };
  }
  const drawn = RENDER[topic.key](ctx, kit);
  const asked = TOPIC[key];
  const note = asked && asked.key !== topic.key ? `${offLine(`${asked.name} isn't on this server`)}, so here are the basics.\n` : '';
  const more = `\n[Read more in the full guide](${docsBase()}/commands/${topic.doc})`;
  const embed = {
    color: topic.colour,
    title: drawn.title,
    description: `${note}${drawn.description}${more}`,
    fields: drawn.fields.map(f => ({ name: f.name, value: f.value, inline: false })),
    footer: { text: footerText() },
  };
  // The data can't make a topic this long, but a card that's over posts nothing at all
  return fits(embed) ? embed : clipEmbedToFit(embed);
}

/** The menu and ◀ Previous / Next ▶, for the topics this server has */
export function navigation(current, ctx) {
  const on = topicsFor(ctx);
  if (on.length < 2) return [];
  const at = on.findIndex(t => t.key === current);
  const menu = new StringSelectMenuBuilder()
    .setCustomId(HTP_MENU_ID)
    .setPlaceholder('Pick a topic')
    .addOptions(on.map(t => ({ label: t.name, value: t.key, description: t.about, emoji: t.emoji, default: t.key === current })));
  // No wrap-around: the ends disable a button instead. A disabled button
  // still needs a customId unique on the message — the current topic's,
  // which neither neighbour has.
  const prev = on[at - 1];
  const next = on[at + 1];
  const buttons = [
    new ButtonBuilder().setCustomId(`${HTP_PREFIX}${(prev || on[at]).key}`).setLabel('◀ Previous').setStyle(ButtonStyle.Secondary).setDisabled(!prev),
    new ButtonBuilder().setCustomId(`${HTP_PREFIX}${(next || on[at]).key}`).setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(!next),
  ];
  return [
    new ActionRowBuilder().addComponents(menu),
    new ActionRowBuilder().addComponents(...buttons),
  ];
}

/** The whole message for a topic: the embed, and the way to the others */
export function howToPlayView(key, ctx, { kit = liveKit() } = {}) {
  const topic = resolveTopic(key, ctx);
  return {
    embeds: [new EmbedBuilder(renderTopic(key, ctx, { kit }))],
    components: topic ? navigation(topic.key, ctx) : [],
    allowedMentions: { parse: [] },
  };
}

/** /how-to-play itself */
export async function replyWithHowToPlay(interaction, { topic = 'basics', isPrivate = true } = {}) {
  const ctx = helpContext(await loadGuildConfig(interaction.guildId));
  const view = howToPlayView(topic, ctx);
  await interaction.reply(isPrivate ? { ...view, flags: MessageFlags.Ephemeral } : view);
}

/**
 * A click on ◀ Previous / Next ▶ (`htp:<topic>`) or a pick from the menu
 * (`htp:menu`). Answered exactly once: on the clicker's own private copy,
 * edited in place; on a public message — everyone's buttons — never edited,
 * the clicker gets that topic privately instead.
 */
export async function handleHowToPlayInteraction(interaction) {
  const key = interaction.customId === HTP_MENU_ID
    ? interaction.values?.[0]
    : interaction.customId.slice(HTP_PREFIX.length);
  const ctx = helpContext(await loadGuildConfig(interaction.guildId));
  const view = howToPlayView(key, ctx);
  if (interaction.message?.flags?.has?.(MessageFlags.Ephemeral)) {
    await interaction.update(view);
  } else {
    await interaction.reply({ ...view, flags: MessageFlags.Ephemeral });
  }
}

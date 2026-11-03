/**
 * /how-to-play: the games explained in a card a member reads in twenty
 * seconds — the basics, items and the Glovebox, prizes and titles, nights
 * in a row, twists, happenings and the siege, one embed each, with a topic
 * menu and ◀ Previous / Next ▶ underneath. Doug asked for quick help for the
 * games (2026-11); the full guide is docs/commands/games.md.
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
  NIGHT_LIGHT_DAYS, NIGHT_LIGHT_PRIZE, SIEGE, TWISTS, TWIST_RULES,
} from '../data/gameRewards.js';
import { HAPPENINGS, CALENDAR_HAPPENINGS, HAPPENING_RULES } from '../data/gameHappenings.js';
import { MONSTERS, MONSTER_KEYS } from '../data/siegeMonsters.js';

// ── the monster fights back ─────────────────────────────────────────────

/**
 * The numbers the Siege topic's "It fights back" and "When" lines quote,
 * gathered from SIEGE and the game settings' defaults (tests read them
 * from here too). The Silver Bullet prize is an ordinary PRIZES row
 * ('siegewins'), shown with the other prizes.
 */
export const FIGHTS_BACK = Object.freeze({
  everyMinutes: SIEGE.actions.everyMinutes, // the monster acts this often
  freeMinutes: SIEGE.grab.freeMinutes, // a grabbed fighter not freed within this…
  notFreedLoss: SIEGE.grab.loss, // …loses this, and is out of the siege
  poisonMinutes: SIEGE.poisoned.minutes, // a poisoned fighter recovers by itself after this
  // Random sieges a week, by the server's siegeFrequency
  perWeek: SIEGE.random.perWeek,
  defaultFrequency: DEFAULT_GAME_SETTINGS.siegeFrequency,
});

// ── topics ──────────────────────────────────────────────────────────────

/** The customId prefix for this card's buttons and menu (buttonHandler / selectHandler route on it) */
export const HTP_PREFIX = 'htp:';
/** The topic menu's customId; every button's is `htp:<topic key>` */
export const HTP_MENU_ID = 'htp:menu';

/**
 * The topics, in the order the `topic:` option, the menu and Next ▶ list
 * them. `anchor` is the section of docs/commands/games.md each one shortens;
 * `emoji` is plain Unicode (it labels a menu option, which can't hold the
 * kit's custom emoji).
 */
export const TOPICS = Object.freeze([
  { key: 'basics', name: 'Basics', emoji: '🎮', colour: 0xE67E22, anchor: 'points', about: 'The games, points, the limits and your score' },
  { key: 'items', name: 'Items & Glovebox', emoji: '🧰', colour: 0x1ABC9C, anchor: 'the-glovebox-and-items', about: 'What items do and how to use one' },
  { key: 'prizes', name: 'Prizes & titles', emoji: '🎁', colour: 0xF1C40F, anchor: 'prizes', about: 'What you earn by playing, and showing a title' },
  { key: 'nights', name: 'Nights in a row', emoji: '🌙', colour: 0x3F51B5, anchor: 'nights-in-a-row', about: 'Play every night for a bonus, and the Night Light' },
  { key: 'twists', name: 'Twists', emoji: '🎲', colour: 0x9B59B6, anchor: 'twists', about: 'Surprises, good and bad, after a play' },
  { key: 'happenings', name: 'Happenings', emoji: '🌕', colour: 0x2C7DA0, anchor: 'happenings', about: 'Server-wide events that bend the games for a while' },
  { key: 'siege', name: 'Siege', emoji: '👹', colour: 0xC0392B, anchor: 'siege', about: 'A monster the whole server fights together' },
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

/** What every topic is drawn from: the games on, and this server's settings */
export function helpContext(config) {
  return { games: gamesOn(config), settings: getGameSettings(config) };
}

/** The siege's weapons that can be used here: each is its own game */
const weaponsOn = (ctx) => Object.keys(SIEGE.weaponGame).filter(w => ctx.games.includes(SIEGE.weaponGame[w]));

/** Is this topic about anything on this server? */
function topicOn(key, ctx) {
  const on = (g) => ctx.games.includes(g);
  if (!ctx.games.length) return false;
  if (key === 'twists' || key === 'happenings') return CLASSIC.some(on);
  if (key === 'siege') return on('siege') && weaponsOn(ctx).length > 0;
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
  const game = ITEMS[key].game ?? PASSIVE_GAME[key] ?? null;
  if (game === 'siege') return topicOn('siege', ctx);
  return game === null || ctx.games.includes(game);
}

/** Is this title earnable with the games on here? */
function titleOn(t, ctx) {
  const on = (g) => ctx.games.includes(g);
  if (t.did || t.got) return Object.keys({ ...t.did, ...t.got }).some(on);
  if (t.siege) return on('siege');
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
  const siegeCap = topicOn('siege', ctx) ? ` (siege: ${pill(SIEGE.scoredPerDay)} attacks)` : '';
  limits.push(s.dailyScoredPlays > 0
    ? `The first ${pill(s.dailyScoredPlays)} plays of each game a day score${siegeCap}. After that, play for fun.`
    : `Plays here are for fun: none score points${siegeCap ? `, but the first ${pill(SIEGE.scoredPerDay)} siege attacks a day do` : ''}.`);
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
  const shown = PRIZES.filter(p => p.game === null || (p.game === 'siege' ? topicOn('siege', ctx) : ctx.games.includes(p.game)));
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

function twists(ctx, kit) {
  const s = ctx.settings;
  const all = Object.values(TWISTS);
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
  const random = Object.values(HAPPENINGS).filter(h => happeningOn(h, ctx));
  const calendar = Object.values(CALENDAR_HAPPENINGS).filter(h => happeningOn(h, ctx));
  const lead = s.happenings ? '' : `${offLine('Happenings are switched off on this server.')}\n`;
  const freq = s.happeningFrequency;
  const freqName = freq.charAt(0).toUpperCase() + freq.slice(1);
  const fields = [
    { name: `${kit.e('clock')} The random ones`, value: random.map(h => `${h.emoji} **${h.name}** ${duration(h.minutes * 60)} · ${h.about}`).join('\n') },
  ];
  if (calendar.length) {
    fields.push({ name: `${kit.e('dice')} All day, on the calendar`, value: calendar.map(h => `${h.emoji} **${h.name}** · ${h.about}`).join('\n') });
  }
  const minPlayers = Math.min(...random.map(h => h.minPlayers));
  fields.push({
    name: `${kit.e('chart')} How often`,
    value: [
      s.happenings ? `This server: **${freqName}**, ${FREQUENCY_WORDS[freq] || ''}.` : null,
      `One at a time, at least ${duration(HAPPENING_RULES.gapMinutes * 60)} apart, at most ${pill(HAPPENING_RULES.maxPerDay)} a day, and only while ${pill(minPlayers)}+ members are playing.`,
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
    back.push(`It grabs a fighter: free them with \`/rescue attempt target:@Sam\` (${pill(signed(SIEGE.credit.free))} to your share). Not freed in ${duration(FIGHTS_BACK.freeMinutes * 60)}: ${pill(signed(-FIGHTS_BACK.notFreedLoss))} and out of the fight.`);
  }
  if (on('potion')) {
    back.push(`It poisons a fighter: cure them with \`/potion give user:@Sam type:health\` (${pill(signed(SIEGE.credit.cure))} to your share), or their Antidote does. It wears off after ${duration(FIGHTS_BACK.poisonMinutes * 60)}.`);
  }
  if (back.length) {
    back.unshift(`Every ${duration(FIGHTS_BACK.everyMinutes * 60)} or so the monster acts. Someone else has to save you.`);
    fields.push({ name: `${kit.e('upset')} It fights back`, value: back.join('\n') });
  }

  fields.push({
    name: `${kit.e('trophy')} Win or lose`,
    value: [
      `Win: ${pill(r.perFighter)} points a fighter, split by what each did, ${pill(r.eachMin)}–${pill(r.eachMax)} each. The MVP gets ${pill(signed(r.mvpBonus))} and loot.`,
      `It escapes: everyone who attacked loses ${pill(SIEGE.escape.loss)}, when ${pill(SIEGE.escape.minFighters)}+ fought.`,
      `Your first ${pill(SIEGE.scoredPerDay)} attacks a day score points; every one does damage.`,
    ].join('\n'),
  });

  // Random sieges, by the server's siegeFrequency
  const freq = ctx.settings.siegeFrequency ?? FIGHTS_BACK.defaultFrequency;
  const perWeek = FIGHTS_BACK.perWeek[freq] ?? 0;
  fields.push({
    name: `${kit.e('clock')} When`,
    value: perWeek > 0
      ? `At random, about ${pill(perWeek)} a week here while people are playing, or when an admin runs \`/siege start\`. One lasts ${duration(ctx.settings.siegeMinutes * 60)}.`
      : `When an admin runs \`/siege start\`. One lasts ${duration(ctx.settings.siegeMinutes * 60)}.`,
  });
  return {
    title: 'How to play: the siege',
    description: `A monster attacks a games channel and the whole server fights it together. Beat it before time runs out and everyone who fought is paid. ${pill(MONSTER_KEYS.length)} monsters: ${monsters}`,
    fields,
  };
}

const RENDER = { basics, items, prizes, nights, twists, happenings, siege };

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
  const more = `\n[Read more in the full guide](${docsBase()}/commands/games#${topic.anchor})`;
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

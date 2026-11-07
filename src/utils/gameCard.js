/**
 * The personal game card: /scoreboard, and right-click a member → Apps →
 * Game card. One person's points in the games, drawn the way Doug liked
 * DarcyBot's vote card (2026-11): an ordinary embed made rich by small
 * icons beside the headings, numbers as `pills`, three inline columns, and
 * the player's avatar as a thumbnail. Since R3 it also carries what the
 * rewards add (gameCardData.js): the shown title, rewards in progress as
 * `07/25` and a bar, the nights row as two rows of ticks, the Glovebox and
 * titles.
 *
 * renderGameCard is pure — data in, embed out — so a card can be rendered
 * in tests with a fake emoji registry as well as in fallback.
 * replyWithGameCard is the part that talks to Discord: which games are on,
 * whose card it is, and the refusals.
 *
 * Every icon is drawn through the emoji kit (emojiKit.js). Until the kit's
 * custom emoji are uploaded (R2) that's plain emoji; afterwards the same
 * calls return pixel art. Custom emoji go ONLY in the description, field
 * names and field values: whether they render in an author, title or
 * footer isn't something to bet a card on, so those stay plain text.
 */

import { EmbedBuilder, MessageFlags, escapeMarkdown } from 'discord.js';
import { getScoreboard, getGameSettings, GAME_NAMES, POINTS } from './gameScores.js';
import { OUTCOME_EMOJI, periodLabel, enabledGames, ordinal, cardName, clipEmbedToFit } from './gameBoards.js';
import { avatarOf, nameOf } from './personCard.js';
import { liveKit, createKit, KIT_CODES, pill, progressPill, formatNumber } from './emojiKit.js';
import { LIMITS, messageProblems, clipText, chooseLayout, fieldsFromLines } from './embedFit.js';
import { NIGHT_TIERS } from '../data/gameRewards.js';
import { happeningLine } from '../data/gameEventLines.js';
import { getPlayerCardExtras } from './gameCardData.js';
import { hpColour } from './siegeCard.js';
import { loadGuildConfig } from './guildConfig.js';

/** The games' orange, as the scoreboard has always been */
export const CARD_COLOUR = 0xE67E22;

/** How to open anyone's card; the footer says so on every card */
export const CARD_HINT = 'Anyone\'s card: right-click them → Apps → Game card';

/**
 * What the card gives up, in order, when it would be over Discord's limits
 * (messageProblems). Each step is the one before it with one more thing
 * given up, so the order reads straight down:
 *
 *   0.   (2.76.0) the Six-Demon Bag's Chi bar: the bag's numbers say it
 *        all, and its ten segments are as dear as a reward's
 *   1–2. narrower reward bars (8 → 6 → 4 segments). Once the kit is
 *        uploaded every segment is a custom emoji of up to 37 characters,
 *        so a width-8 bar is ~300 characters a line, more than the rest of
 *        the line many times over — the cheapest thing to give up.
 *   3.   only the 4 rewards closest to done ("…and N more")
 *   4.   the nights row in plain emoji (14 custom ticks are ~520 characters)
 *   5–6. what they did, then what they received (the longest game lines)
 *   7.   the Glovebox, the earned badges and the next titles capped, each
 *        with "…and N more"
 *   8.   every value clipped to fit (clipEmbedToFit), the guarantee
 *
 * The total, ranks, plays, streaks and the nights numbers are never
 * dropped — they're the card. A rejected card posts nothing at all, so the
 * last step has to fit whatever the data. A typical member's card, kit
 * uploaded, needs none of this; the worst real one (every game and outcome,
 * nine counters, a full Glovebox, thirty titles) fits at step 3 with the
 * longest custom emoji, and as it is in plain emoji. Past that only
 * overgrown test data reaches (tests/game-card.test.js measures each).
 */
const FIRST_STEP = { bagBar: true, bar: 8, rewards: Infinity, plainTicks: false, counts: true, received: true, capLists: false, clip: false };
const GIVE_UP = [
  { bagBar: false }, { bar: 6 }, { bar: 4 }, { rewards: 4 }, { plainTicks: true },
  { counts: false }, { received: false }, { capLists: true }, { clip: true },
];
export const CARD_STEPS = Object.freeze(GIVE_UP.reduce(
  (steps, change) => [...steps, Object.freeze({ ...steps.at(-1), ...change })],
  [Object.freeze(FIRST_STEP)],
));

/** What each capped list keeps at the capLists step */
export const LIST_CAPS = Object.freeze({ glovebox: 4, badges: 8, next: 1 });

/** The nights row drawn in plain emoji, whatever kit draws the rest */
const PLAIN = createKit(null);

/**
 * An icon from the card's data, by kit code. A code the kit doesn't know
 * draws nothing rather than throwing (kit.e does): the codes come from the
 * rewards data, and one odd item mustn't take the whole card down.
 */
const iconFor = (kit, code) => (code && KIT_CODES[code] ? kit.e(code) : '');

/**
 * An icon that may be either a kit code or plain Unicode (R4's statuses
 * have no kit codes: they're drawn as the emoji they are).
 */
const iconOrText = (kit, icon) => (icon && KIT_CODES[icon] ? kit.e(icon) : icon || '');

/** Words joined by spaces, skipping the empty ones (a missing icon) */
const spaced = (...parts) => parts.filter(Boolean).join(' ');

/** "8 🎯 · 2 💨", in the points table's order; '' when there are none */
function outcomeCounts(byOutcome, game) {
  return Object.keys(POINTS[game] || {})
    .filter(o => byOutcome?.[o])
    .map(o => `${formatNumber(byOutcome[o])} ${OUTCOME_EMOJI[o]}`)
    .join(' · ');
}

const plural = (n, word) => `${word}${Math.abs(n) === 1 ? '' : 's'}`;

/** Total and rank: "🪙 `5` points · 🥇 `1st` of 3 players" */
function summary(data, kit) {
  if (!data.games?.length) return data.emptyText || 'No points yet.';
  const parts = [`${kit.e('coin')} ${pill(data.total)} ${plural(data.total, 'point')}`];
  if (data.rank) {
    // A medal for the podium; past it, the rank is a stat, not a prize
    const icon = data.rank <= 3 ? kit.e(`med${data.rank}`) : kit.e('chart');
    parts.push(`${icon} ${pill(ordinal(data.rank))} of ${formatNumber(data.ranked)} ${plural(data.ranked, 'player')}`);
  }
  return parts.join(' · ');
}

/**
 * The title they chose to show (/scoreboard title:), under the total:
 * "📜 *Pie Sniper* 🎯". Titles are fixed text from the rewards data, but
 * escaped anyway: one with a `*` in it would end the italics early.
 */
function shownTitle(data, kit) {
  const t = data.titles?.shown;
  if (!t?.title) return '';
  return spaced(kit.e('scroll'), `*${escapeMarkdown(t.title)}*`, t.badge);
}

/**
 * The server's happenings in progress (R4), one line each — "🌕 Full
 * Moon: dooms score double · ends <t:…:R>". In the description, under who
 * the card is about, because they change what the next play is worth for
 * everyone. One that has ended by `now` isn't shown, even if handed in.
 */
function happeningLines(data, now) {
  return (data.happenings || [])
    .filter(h => h && !(Number.isFinite(h.endsAt) && h.endsAt <= now))
    .map(h => happeningLine(h));
}

/**
 * The monster attacking now (R5), one line under the happenings: its HP
 * bar, when it ends, and how this member is doing in the fight —
 * "🟢 **The Blob** is attacking! 🟩🟩🟩⬜⬜⬜ `412/980` HP · ends <t:…:R> ·
 * you: `48` damage, 2nd". Gone once its time is up, even if handed in.
 * 2.74.0: with an attack allowance (from `evening` pace on), the member's
 * own count tonight too — "attacks tonight `2/8`" (12:00 to 12:00 UTC).
 */
function siegeLine(data, kit, now) {
  const s = data.siege;
  if (!s || !(s.endsAt > now)) return '';
  const bar = kit.bar(s.hp, s.maxHp, { width: 6, colour: hpColour(s.hp, s.maxHp) });
  const you = s.you ? `you: ${pill(s.you.damage)} damage, ${ordinal(s.you.rank)}` : 'join in with `/siege attack`';
  const today = s.attacks ? ` · attacks tonight ${pill(`${s.attacks.used}/${s.attacks.of}`)}` : '';
  return `${s.emoji} **${escapeMarkdown(String(s.monster))}** is attacking! ${bar} ${pill(`${s.hp}/${s.maxHp}`)} HP · ends <t:${Math.floor(s.endsAt / 1000)}:R> · ${you}${today}`;
}

/** The description: the summary, the shown title, then any happening in progress and a siege */
function description(data, kit, now) {
  return [summary(data, kit), shownTitle(data, kit), ...happeningLines(data, now), siegeLine(data, kit, now)].filter(Boolean).join('\n');
}

/**
 * One inline field per game played: DarcyBot's three columns. Lines are
 * kept short because an inline column is about a third of the card wide.
 */
function gameFields(data, { kit, step }) {
  return (data.games || []).map(s => {
    const lines = [
      `${pill(s.points)} pts${s.rank ? ` · #${s.rank}` : ''}`,
      `${formatNumber(s.plays)} ${plural(s.plays, 'play')}`,
    ];
    const did = step.counts ? outcomeCounts(s.counts, s.game) : '';
    if (did) lines.push(did);
    const got = step.received ? outcomeCounts(s.received, s.game) : '';
    if (got) lines.push(`Received: ${got}`);
    // `streak` is the one running now (all-time); `bestStreak` is the
    // period's best, so a month view can show a streak begun last month
    if (s.bestStreak) {
      lines.push(`${kit.e('flame')} ${s.streak ? `${s.streak} now · best ${s.bestStreak}` : `best ${s.bestStreak}`}`);
    }
    return { name: `${kit.game(s.game)} ${s.name}`, value: lines.join('\n'), inline: true };
  });
}

/** What each kind of effect says; a twist's status (R4) says it with statusLine */
const EFFECT_LINES = {
  shield: (e, kit) => `${kit.e('shield')} Safe from /doom until <t:${Math.floor(e.until / 1000)}:t>`,
};

/**
 * A status a twist left (R4), from gameCardData's effects: what it does,
 * then plays left for one that counts plays, or when an unused one runs
 * out for one that waits for its moment.
 *   🍿 Free Refill: +1 on each good play · 2 plays left
 *   🍀 Lucky Break: the next play can only go well · ends <t:…:R>
 */
function statusLine(e, kit) {
  const head = spaced(iconOrText(kit, e.icon), e.name);
  const parts = [e.about ? `${head}: ${e.about}` : head];
  if (e.playsLeft > 0) parts.push(`${formatNumber(e.playsLeft)} ${plural(e.playsLeft, 'play')} left`);
  else if (e.until) parts.push(`ends <t:${Math.floor(e.until / 1000)}:R>`);
  return parts.join(' · ');
}

const effectLine = (e, kit) => (EFFECT_LINES[e.kind] ? EFFECT_LINES[e.kind](e, kit) : e.name ? statusLine(e, kit) : '');

/** Effects running now, one line each — the shield, then statuses; nothing once they've run out */
function effectFields(data, { kit, now }) {
  const lines = (data.effects || [])
    .filter(e => e && !(e.until <= now))
    .map(e => effectLine(e, kit))
    .filter(Boolean);
  return lines.length ? [{ name: `${kit.e('effect')} In effect`, value: lines.join('\n'), inline: false }] : [];
}

// ── R3: rewards in progress, nights in a row, Glovebox, titles ─────────

/** How far along: 24/25 before 7/25; equally far, the fewer still to go */
const doneness = (p) => (p.need > 0 ? p.have / p.need : 0);
const closestFirst = (a, b) => doneness(b) - doneness(a) || (a.need - a.have) - (b.need - b.have);

/**
 * One counter, DarcyBot's way: `` `07/25` ``, the bar, the prize's icon and
 * name, its bonus points, then what's being counted. A counter held one
 * short by the daily prize cap (2 a day) says the prize comes tomorrow, in
 * purple — night — rather than a green bar that looks stuck.
 *   `07/25` 🟩🟩⬜⬜⬜⬜⬜⬜ 🥧 Golden Pie `+3` · Hits
 *   `24/25` 🟪🟪🟪🟪🟪🟪🟪⬜ 🥧 Golden Pie `+3` · Hits · 🌙 tomorrow
 */
function rewardLine(p, kit, width) {
  const prize = p.prize || {};
  const parts = [
    progressPill(p.have, p.need),
    kit.bar(p.have, p.need, { width, colour: p.waiting ? 'purple' : 'green' }),
    iconFor(kit, prize.icon || p.icon),
    prize.name || 'A prize',
  ];
  if (prize.points) parts.push(pill(`+${prize.points}`));
  let line = spaced(...parts);
  if (p.label) line += ` · ${p.label}`;
  if (p.waiting) line += ` · ${spaced(kit.e('moon'), 'tomorrow')}`;
  return line;
}

/**
 * "Rewards in progress": every recurring prize counter that has started,
 * closest to done first. A counter on 0 isn't in progress — and nine lines
 * of `00/25` would bury the ones that are. Packed by fieldsFromLines, which
 * spills into untitled continuation fields: a width-8 custom-emoji bar is
 * ~300 characters a line, so a field holds only two or three.
 */
function rewardFields(data, { kit, step }) {
  const started = (data.progress || []).filter(p => p.have > 0).sort(closestFirst);
  if (!started.length) return [];
  const shown = started.slice(0, step.rewards);
  const lines = shown.map(p => rewardLine(p, kit, step.bar));
  if (shown.length < started.length) lines.push(`…and ${started.length - shown.length} more`);
  return fieldsFromLines(`${kit.e('gift')} Rewards in progress`, lines);
}

/**
 * Which tier, 1–3, and how many good plays a day it boosts; tier 0 below
 * 3 nights ("New Moon"). Looked up in the same NIGHT_TIERS that awards
 * them, by the data's key (then name), so the card can't disagree with
 * what was awarded; a tier the table doesn't know falls back to counting
 * the row against its thresholds.
 */
function nightTier(n) {
  if (!n.tier) return { level: 0, buffs: 0 };
  let i = NIGHT_TIERS.findIndex(t => t.key === n.tier.key || t.name === n.tier.name);
  if (i < 0) i = Math.max(0, NIGHT_TIERS.filter(t => (n.current || 0) >= t.at).length - 1);
  return { level: i + 1, buffs: NIGHT_TIERS[i].buffs };
}

/**
 * "Nights in a row: `Tier 2`", DarcyBot's streak buff: the last 14 nights
 * as two rows of seven ticks (seven never wrap on a phone), the row and the
 * best, the next tier, and what this one gives. Shown once they've played
 * a night; a row of 14 missed nights says nothing worth a field.
 */
function nightsFields(data, { kit, step }) {
  const n = data.nights;
  const played = (n?.row || []).some(s => s === 'played' || s === 'saved');
  if (!n || !(n.best > 0 || n.current > 0 || played)) return [];
  const { level, buffs } = nightTier(n);
  const lines = [];
  if (n.row?.length) lines.push((step.plainTicks ? PLAIN : kit).ticks(n.row, { perRow: 7 }));
  let stats = `${pill(n.current || 0)} ${plural(n.current || 0, 'night')} · best ${pill(n.best || 0)}`;
  if (n.next) stats += ` · ${n.next.name} at ${n.next.at}`;
  lines.push(stats);
  lines.push(n.tier
    ? `${spaced(n.tier.emoji, n.tier.name)}: +1 on your first ${buffs} good plays a day`
    : 'New Moon: no bonus yet');
  return [{ name: `${kit.e('moon')} Nights in a row: ${pill(`Tier ${level}`)}`, value: lines.join('\n'), inline: false }];
}

/**
 * The Glovebox: what they hold. Passive items work by themselves, so they
 * say so; one resting after it fired says when it's back instead (a
 * relative timestamp, which Discord shows in the reader's own terms).
 * Everyone's is shown, on anyone's card: what someone holds is game
 * information like their points, and knowing a target has Garlic is part
 * of the game.
 */
function gloveboxFields(data, { kit, step, now }) {
  const items = data.glovebox || [];
  if (!items.length) return [];
  const shown = step.capLists ? items.slice(0, LIST_CAPS.glovebox) : items;
  const lines = shown.map(it => {
    let line = spaced(iconFor(kit, it.icon), `${it.name} ×${formatNumber(it.count)}`);
    if (it.readyAt > now) line += ` · ready <t:${Math.floor(it.readyAt / 1000)}:R>`;
    else if (it.passive) line += ' · passive';
    return line;
  });
  if (shown.length < items.length) lines.push(`…and ${items.length - shown.length} more`);
  return [{ name: `${kit.e('glove')} Glovebox`, value: lines.join('\n'), inline: true }];
}

/**
 * Titles: the badges earned, how many, and the next one to three closest,
 * each with its count — the titles take months, so the count is what
 * there is to look at. One not started yet is left out, as a reward
 * counter on 0 is: the data always offers three, so someone who has never
 * played would otherwise get a field of `000/150`s. Badges stay Unicode
 * (R2), so they cost little.
 */
function titleFields(data, { kit, step }) {
  const earned = data.titles?.earned || [];
  const next = (data.titles?.next || []).filter(t => t.have > 0);
  if (!earned.length && !next.length) return [];
  const lines = [];
  if (earned.length) {
    const badges = step.capLists ? earned.slice(0, LIST_CAPS.badges) : earned;
    const more = earned.length - badges.length;
    lines.push(`${pill(earned.length)} earned: ${badges.map(t => t.badge || '').join('')}${more ? ` …and ${more} more` : ''}`);
  } else {
    lines.push('None yet');
  }
  const coming = step.capLists ? next.slice(0, LIST_CAPS.next) : next;
  for (const t of coming) lines.push(`${spaced(t.badge, t.title)} ${progressPill(t.have, t.need)}`);
  return [{ name: `${kit.e('scroll')} Titles`, value: lines.join('\n'), inline: true }];
}

/**
 * 2.76.0: the Six-Demon Bag (gameCardData's `bag`, on the all-games card):
 * Chi and its bar, today's Chi, casts left, peace — then what's on them and
 * from whom, a hex with the way out:
 *   🎒 Six-Demon Bag
 *   ☯️ `14/20` Chi ▰▰▰▰▰▰▰▱▱▱ · today `+3/4` · `1 of 2` casts left · ☮️ no hexes
 *   On you: 🔥 Fired Up *(from Sam)* · 2 plays left — 🌫️ Lost in the Smoke *(hex, from Jo)* · 1 play left · `/six-demon-bag shrug`
 * Anyone's, on anyone's card, like the Glovebox: a charm is game
 * information, and casts are public anyway.
 */
function bagFields(data, { kit, step, now }) {
  const b = data.bag;
  if (!b) return [];
  const castsLeft = Math.max(0, (b.castsPerDay || 0) - (b.casts || 0));
  const chi = `${kit.e('chi')} ${pill(`${b.chi}/${b.bag}`)} Chi${step.bagBar ? ` ${kit.bar(b.chi, b.bag, { colour: 'blue', style: 'blocks' })}` : ''}`;
  const parts = [chi, `today ${pill(`+${b.today}/${b.perDay}`)}`, `${pill(`${castsLeft} of ${b.castsPerDay}`)} casts left`];
  if (b.peace) parts.push('☮️ no hexes');
  else if (b.hexesOff) parts.push('hexes are off here');
  const lines = [parts.join(' · ')];
  const on = (b.on || []).filter(c => !(c.until <= now)).map((c) => {
    const from = c.kind === 'hex' ? `hex, ${c.byName ? `from ${cardName(c.byName)}` : 'Ching Dai\'s Curse'}` : `from ${cardName(c.byName || 'someone')}`;
    const uses = c.counts ? ` · ${formatNumber(c.left)} ${plural(c.left, 'play')} left` : '';
    return `${c.label} *(${from})*${uses}${c.kind === 'hex' ? ' · `/six-demon-bag shrug`' : ''}`;
  });
  if (on.length) lines.push(`On you: ${on.join(' — ')}`);
  return [{ name: `${kit.e('bag')} Six-Demon Bag`, value: lines.join('\n'), inline: false }];
}

/**
 * The card below its summary, top to bottom. Each section returns its
 * fields, or none when it has nothing to show, so a card never carries an
 * empty heading. Each reads its own optional key of `data`, so a card
 * without R3's data (and every R1 test) is exactly what it was: the games,
 * `progress` (rewards in progress), `nights`, the `glovebox` and `titles`
 * side by side as two of DarcyBot's columns, then effects (the shield and,
 * since R4, a twist's statuses). R4's `happenings` are lines in the
 * description (see description), and so is R5's `siege`.
 */
const SECTIONS = [gameFields, rewardFields, nightsFields, gloveboxFields, titleFields, bagFields, effectFields];

/** One layout step, as a plain embed object (see clipEmbedToFit for why) */
function draft(data, kit, step, now) {
  const embed = {
    color: CARD_COLOUR,
    author: { name: clipText(String(data.player.name || 'Someone'), LIMITS.author) },
    title: `Game card${data.scope ? ` · ${data.scope}` : ''}`,
    description: description(data, kit, now),
    fields: SECTIONS.flatMap(section => section(data, { kit, step, now })),
    footer: { text: `${data.periodLabel} · ${CARD_HINT}` },
  };
  if (data.player.avatarUrl) embed.thumbnail = { url: data.player.avatarUrl };
  return step.clip ? clipEmbedToFit(embed) : embed;
}

const fits = (embed) => messageProblems({ embeds: [embed] }).length === 0;

/**
 * The card as one of CARD_STEPS draws it, whether it fits or not: a plain
 * embed object. For measuring what each step gives up (tests); a card to
 * send comes from layoutGameCard, which only ever returns one that fits.
 */
export function draftGameCard(data, { kit = liveKit(), now = Date.now(), step = 0 } = {}) {
  return draft(data, kit, CARD_STEPS[step], now);
}

/**
 * The card, and which of CARD_STEPS it took to fit.
 * @param {object} data - see gameCardData
 * @param {object} [options]
 * @param {object} [options.kit] - an emoji kit (default: the live one)
 * @param {number} [options.now] - for effects that run out
 * @param {number} [options.step] - the first step to try (tests)
 * @returns {{ embed: EmbedBuilder, step: number }}
 */
export function layoutGameCard(data, { kit = liveKit(), now = Date.now(), step = 0 } = {}) {
  const from = Math.min(Math.max(0, step), CARD_STEPS.length - 1);
  const chosen = chooseLayout(CARD_STEPS.slice(from), s => draft(data, kit, s, now), fits);
  return { embed: new EmbedBuilder(chosen.out), step: from + chosen.step };
}

/** The card as an embed. Pure: no Discord, no files. */
export function renderGameCard(data, options = {}) {
  return layoutGameCard(data, options).embed;
}

/**
 * Which of R3's extras (getPlayerCardExtras, gameCardData.js) go on this
 * card. The all-games card takes them all, less the reward counters of
 * games switched off here: you can't make progress in a game you can't
 * play. A one-game card stays about that game — its own counters and the
 * shown title, which is who you are — and leaves the nights row, the
 * Glovebox and the titles list to the all-games card: none of them belong
 * to one game.
 *
 * R4: the happenings in progress go on every card — they're the server's,
 * and change what this game's next play is worth. A twist's statuses go
 * with the Glovebox on the all-games card: like an item, a status follows
 * the member into whichever game they play next. Each is added only when
 * there is one, so a card from before R4 is exactly what it was.
 *
 * R5: a live siege goes on the all-games card when the siege is one of its
 * games, and on the Siege card — a fight that's on is the reason to play.
 *
 * 2.76.0: the Six-Demon Bag goes on the all-games card: Chi comes from
 * every game, and a charm follows the member into whichever they play next.
 * @param {?{progress, nights, glovebox, titles, effects?, happenings?, siege?, bag?}} extras
 * @param {{game: string, shown: string[]}} on
 */
export function cardExtras(extras, { game = 'all', shown = [] } = {}) {
  if (!extras) return {};
  const ours = (p) => (game === 'all' ? !p.game || shown.includes(p.game) : p.game === game);
  const progress = (extras.progress || []).filter(ours);
  const r4 = {
    ...(extras.happenings?.length ? { happenings: extras.happenings } : {}),
    ...(game === 'all' && extras.effects?.length ? { effects: extras.effects } : {}),
    ...(extras.siege && (game === 'siege' || (game === 'all' && shown.includes('siege'))) ? { siege: extras.siege } : {}),
  };
  if (game !== 'all') return { progress, titles: { shown: extras.titles?.shown || null, earned: [], next: [] }, ...r4 };
  return { progress, nights: extras.nights || null, glovebox: extras.glovebox || [], titles: extras.titles || null, ...r4, ...(extras.bag ? { bag: extras.bag } : {}) };
}

/**
 * The card's data from a getScoreboard result, and R3's extras (rewards in
 * progress, nights, the Glovebox, titles) when there are any; the renderer
 * takes each of them as optional.
 * @param {object} board - getScoreboard(…, { games: shown })
 * @param {object} who
 * @param {{id: string, name: string, avatarUrl: ?string}} who.player
 * @param {string[]} who.shown - the games on the card, in GAMES order
 * @param {?object} [who.extras] - getPlayerCardExtras(…); see cardExtras
 * @returns {{ player, periodLabel, scope, total, rank, ranked, games, effects, emptyText, progress?, nights?, glovebox?, titles?, happenings? }}
 */
export function gameCardData(board, { player, shown, game = 'all', period = 'all-time', now = Date.now(), emptyText = null, extras = null }) {
  const more = cardExtras(extras, { game, shown });
  // A rescue's shield, shown with the games it belongs to, then any
  // statuses a twist left (R4)
  const shield = board.shieldedUntil && shown.includes('rescue') ? [{ kind: 'shield', until: board.shieldedUntil }] : [];
  return {
    player,
    periodLabel: periodLabel(period, now),
    scope: game === 'all' ? null : GAME_NAMES[game],
    total: board.total,
    rank: board.rank,
    ranked: board.players,
    games: shown.filter(g => board.games[g]).map(g => {
      const s = board.games[g];
      return {
        game: g, name: GAME_NAMES[g], points: s.points, rank: s.rank, plays: s.plays,
        counts: s.counts, received: s.received, streak: s.streak, bestStreak: s.bestStreak,
      };
    }),
    emptyText,
    ...more,
    effects: [...shield, ...(more.effects || [])],
  };
}

const privately = (content) => ({ content, flags: MessageFlags.Ephemeral });

/**
 * Answer an interaction with someone's game card: /scoreboard (yours by
 * default, or the `user` option's) and the right-click Game card (always
 * the member clicked, always private).
 * @param {object} interaction
 * @param {object} [options]
 * @param {?{user, member}} [options.picked] - interaction.options.get('user'); null = yourself
 * @param {'all-time'|'year'|'month'} [options.period]
 * @param {string} [options.game] - 'all' or one of GAMES
 * @param {boolean} [options.ephemeral]
 */
export async function replyWithGameCard(interaction, { picked = null, period = 'all-time', game = 'all', ephemeral = false } = {}) {
  const games = await enabledGames(interaction);
  if (games.length === 0) {
    await interaction.reply(privately('🎲 The games are switched off on this server.'));
    return;
  }
  if (game !== 'all' && !games.includes(game)) {
    await interaction.reply(privately(`🎲 ${GAME_NAMES[game]} is switched off on this server.`));
    return;
  }
  const shown = game === 'all' ? games : [game];

  const user = picked?.user || interaction.user;
  if (user.bot) {
    await interaction.reply(privately('🤖 Bots don\'t play. They just keep score.'));
    return;
  }
  // Someone else's card: their server name and avatar, as for your own.
  // `member` can be a plain API object with no methods (personCard.js).
  const member = picked ? picked.member : interaction.member;
  const name = picked
    ? (member?.displayName || member?.nick || user.globalName || user.username)
    : nameOf(interaction);
  const avatarUrl = picked
    ? (member?.displayAvatarURL?.() || user.displayAvatarURL())
    : avatarOf(interaction);

  const now = Date.now();
  const board = getScoreboard(interaction.guildId, user.id, period, now, { games: shown });
  const emptyText = user.id === interaction.user.id
    ? 'No points yet. Throw some food, brew a potion, doom someone, or rescue them!'
    : `${cardName(name)} hasn't played${game === 'all' ? '' : ` ${GAME_NAMES[game]}`} yet.`;
  // R3: rewards in progress, the nights row, the Glovebox and titles —
  // anyone's, on anyone's card, like their points (see gloveboxFields).
  // R4: their statuses, and the server's happenings — none when an admin
  // has switched happenings off, so the settings are read for that.
  const settings = getGameSettings(await loadGuildConfig(interaction.guildId));
  const extras = getPlayerCardExtras(interaction.guildId, user.id, { now, settings });
  const data = gameCardData(board, { player: { id: user.id, name, avatarUrl }, shown, game, period, now, emptyText, extras });

  await interaction.reply({
    embeds: [renderGameCard(data, { now })],
    ...(ephemeral ? { flags: MessageFlags.Ephemeral } : {}),
    allowedMentions: { parse: [] },
  });
}

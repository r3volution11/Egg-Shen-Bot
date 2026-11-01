/**
 * The server's game card: /leaderboard. Who's in the lead, who leads each
 * game, who received the most of what, and the period's numbers, in one
 * gold embed drawn like DarcyBot's (Doug, 2026-11). Run on demand, not a
 * standing post, so it's built fresh each time and never edited.
 *
 * It used to be up to ten one-line embeds, each with its player's avatar as
 * the author icon, because a field can't hold an image (2026-10-02). One
 * embed allows fifteen rows and the three-column fields; the leader's
 * avatar is the thumbnail. Rows stay one line each, as Doug asked.
 *
 * renderLeaderboard is pure: the command looks up current names and
 * avatars (that's the slow part) and passes them in, so the card can be
 * rendered in tests with a fake emoji registry as well as in fallback.
 * Custom emoji go only in the description, field names and values; the
 * title and footer stay plain text (see gameCard.js).
 */

import { EmbedBuilder } from 'discord.js';
import { GAME_NAMES } from './gameScores.js';
import { cardName, clipEmbedToFit } from './gameBoards.js';
import { liveKit, pill } from './emojiKit.js';
import { messageProblems, chooseLayout } from './embedFit.js';
import { happeningLine } from '../data/gameEventLines.js';

/** Gold, the colour the old first row had */
export const LEADERBOARD_COLOUR = 0xF1C40F;

export const LEADERBOARD_FOOTER = 'Your own card: /scoreboard';

/** Who has the most of each "received" outcome, at most */
const RECEIVED_MAX = 6;

/**
 * What the card gives up, in order, when it would be over Discord's limits:
 * the bars (five custom emoji a row once the kit is uploaded: ~185
 * characters, more than a row's name and points together), then rows 11–15,
 * then half the "most received" lines, then every text is clipped to fit
 * (clipEmbedToFit). The worst case — fifteen 32-character names that all
 * need escaping, every section filled, every icon a custom emoji — fits by
 * the second step; the last is the guarantee.
 */
export const LEADERBOARD_STEPS = Object.freeze([
  { rows: 15, bars: true, received: RECEIVED_MAX, clip: false },
  { rows: 15, bars: false, received: RECEIVED_MAX, clip: false },
  { rows: 10, bars: false, received: RECEIVED_MAX, clip: false },
  { rows: 10, bars: false, received: 3, clip: false },
  { rows: 10, bars: false, received: 3, clip: true },
]);

const plural = (n, word) => `${word}${Math.abs(n) === 1 ? '' : 's'}`;

/**
 * The standings, one line a player: medal or place, name, title badge,
 * bar against the leader, points.
 */
function standings(data, kit, step) {
  const top = data.rows[0].points;
  // A bar measures against the leader, so it means something only while
  // the leader is above zero: against 0 or less every bar would be empty.
  // Below zero a row's bar is empty, as is a row on 0.
  const bars = step.bars && top > 0;
  return data.rows.slice(0, step.rows).map((r, i) => {
    // "4." at the start of a line is a numbered list in Discord's markdown
    // (indented, renumbered), so the dot is escaped
    const place = i < 3 ? kit.e(`med${i + 1}`) : `${i + 1}\\.`;
    const parts = [place, cardName(r.name)];
    if (r.badge) parts.push(r.badge); // R3: the title they chose to show
    if (bars) {
      parts.push(kit.bar(Math.max(0, r.points), top, { width: 5, colour: i === 0 ? 'gold' : 'blue', style: 'blocks' }));
    }
    parts.push(pill(r.points));
    return parts.join(' ');
  });
}

/**
 * "Leading each game": one inline field per game switched on, in DarcyBot's
 * three columns. Only on the all-games card, and only with two games or
 * more — with one, the standings already say who leads it. A game nobody
 * has played this period keeps its column, so the grid doesn't shift.
 */
function leaderFields(data, { kit }) {
  if (data.game !== 'all' || (data.games || []).length < 2) return [];
  return data.games.map(g => {
    const lead = data.perGame?.[g];
    return {
      name: `${kit.game(g)} ${GAME_NAMES[g]}`,
      value: lead ? `${kit.e('crown')} ${cardName(lead.name)} ${pill(lead.points)}` : 'Nobody yet',
      inline: true,
    };
  });
}

/** Who received the most of what: most splatted, best fed, most doomed… */
function receivedFields(data, { kit, step }) {
  const lines = (data.received || [])
    .slice(0, step.received)
    .map(r => `${r.label}: ${cardName(r.name)} ${pill(r.count)}`);
  return lines.length ? [{ name: `${kit.e('star')} Most received`, value: lines.join('\n'), inline: false }] : [];
}

/** The period in numbers, and the best streak in it */
function statsFields(data, { kit }) {
  const t = data.totals;
  if (!t) return [];
  const lines = [
    `${kit.e('dice')} ${pill(t.plays)} ${plural(t.plays, 'play')} · ${kit.e('coin')} ${pill(t.points)} ${plural(t.points, 'point')}`,
    `${kit.e('people')} ${pill(t.players)} ${plural(t.players, 'player')}`,
  ];
  if (data.game === 'all' && t.mostPlayed) {
    const m = t.mostPlayed;
    lines.push(`${kit.game(m.game)} Most played: ${GAME_NAMES[m.game]} · ${pill(m.plays)} ${plural(m.plays, 'play')}`);
  }
  if (data.bestStreak) {
    const s = data.bestStreak;
    lines.push(`${kit.e('flame')} Best streak: ${cardName(s.name)} ${pill(s.count)} in ${GAME_NAMES[s.game]}`);
  }
  return [{ name: `${kit.e('chart')} Server stats`, value: lines.join('\n'), inline: false }];
}

/**
 * "In progress" (R4): the server's happenings right now, one line each —
 * "🌕 Full Moon: dooms score double · ends <t:…:R>". A reason to play
 * now, so it's on the card even before anyone has played. One that has
 * ended by `now` isn't shown, even if handed in. A siege and its HP bar
 * join it in R5.
 */
function inProgressFields(data, { kit, now }) {
  const lines = (data.happenings || [])
    .filter(h => h && !(Number.isFinite(h.endsAt) && h.endsAt <= now))
    .map(h => happeningLine(h));
  return lines.length ? [{ name: `${kit.e('clock')} In progress`, value: lines.join('\n'), inline: false }] : [];
}

/**
 * The fields below the standings, top to bottom; a section with nothing to
 * show adds nothing. Each reads its own optional key of `data`.
 */
const SECTIONS = [leaderFields, receivedFields, statsFields, inProgressFields];

function heading(data) {
  const which = data.game === 'all' ? 'All games' : GAME_NAMES[data.game];
  return `Leaderboard · ${which} · ${data.periodLabel}`;
}

/** One layout step, as a plain embed object (see clipEmbedToFit for why) */
function draft(data, kit, step, now) {
  const embed = {
    color: LEADERBOARD_COLOUR,
    title: heading(data),
    footer: { text: LEADERBOARD_FOOTER },
  };
  if (!data.rows?.length) {
    embed.description = 'Nobody has played yet. Be the first!';
    // A happening is the best reason to be the first
    const going = inProgressFields(data, { kit, now });
    if (going.length) embed.fields = going;
    return embed;
  }
  if (data.rows[0].avatarUrl) embed.thumbnail = { url: data.rows[0].avatarUrl };
  embed.description = standings(data, kit, step).join('\n');
  embed.fields = SECTIONS.flatMap(section => section(data, { kit, step, now }));
  return step.clip ? clipEmbedToFit(embed) : embed;
}

const fits = (embed) => messageProblems({ embeds: [embed] }).length === 0;

/**
 * The card, and which of LEADERBOARD_STEPS it took to fit.
 * @param {object} data
 * @param {string} data.game - 'all' or one of GAMES
 * @param {string[]} data.games - the games 'all' covers (those switched on)
 * @param {string} data.periodLabel - "November 2026", "2026", "All time"
 * @param {Array<{userId, name, avatarUrl, points, badge?}>} data.rows - best first, names already looked up
 * @param {Object<string, ?{name, points}>} data.perGame
 * @param {Array<{label, name, count}>} data.received
 * @param {?{name, game, count}} data.bestStreak
 * @param {{players, plays, points, mostPlayed: ?{game, plays}}} data.totals
 * @param {Array<{kind, name, emoji, about, endsAt: ?number}>} [data.happenings] - in progress (R4)
 * @param {object} [options] - kit (default: live), now, step (the first to try)
 * @returns {{ embed: EmbedBuilder, step: number }}
 */
export function layoutLeaderboard(data, { kit = liveKit(), now = Date.now(), step = 0 } = {}) {
  const from = Math.min(Math.max(0, step), LEADERBOARD_STEPS.length - 1);
  const chosen = chooseLayout(LEADERBOARD_STEPS.slice(from), s => draft(data, kit, s, now), fits);
  return { embed: new EmbedBuilder(chosen.out), step: from + chosen.step };
}

/** The card as an embed. Pure: no Discord, no files. */
export function renderLeaderboard(data, options = {}) {
  return layoutLeaderboard(data, options).embed;
}

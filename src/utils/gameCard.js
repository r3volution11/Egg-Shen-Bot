/**
 * The personal game card: /scoreboard, and right-click a member → Apps →
 * Game card. One person's points in the games, drawn the way Doug liked
 * DarcyBot's vote card (2026-11): an ordinary embed made rich by small
 * icons beside the headings, numbers as `pills`, three inline columns, and
 * the player's avatar as a thumbnail.
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

import { EmbedBuilder, MessageFlags } from 'discord.js';
import { getScoreboard, GAME_NAMES, POINTS } from './gameScores.js';
import { OUTCOME_EMOJI, periodLabel, enabledGames, ordinal, cardName, clipEmbedToFit } from './gameBoards.js';
import { avatarOf, nameOf } from './personCard.js';
import { liveKit, pill, formatNumber } from './emojiKit.js';
import { LIMITS, messageProblems, clipText, chooseLayout } from './embedFit.js';

/** The games' orange, as the scoreboard has always been */
export const CARD_COLOUR = 0xE67E22;

/** How to open anyone's card; the footer says so on every card */
export const CARD_HINT = 'Anyone\'s card: right-click them → Apps → Game card';

/**
 * What the card gives up, in order, when it would be over Discord's limits
 * (messageProblems): first what they did (the longest lines), then what
 * they received, then every value is clipped to fit (clipEmbedToFit). The
 * total, ranks, plays and streaks are never dropped — they're the card.
 *
 * Today's four games can't overflow a card, whatever the numbers; these
 * are here so the sections R3–R5 add (rewards in progress, the nights row,
 * the glovebox, a happening, a siege) can never get a card rejected — a
 * rejected card posts nothing at all.
 */
export const CARD_STEPS = Object.freeze([
  { counts: true, received: true, clip: false },
  { counts: false, received: true, clip: false },
  { counts: false, received: false, clip: false },
  { counts: false, received: false, clip: true },
]);

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

/** What each kind of effect says. R4's twists add theirs here. */
const EFFECT_LINES = {
  shield: (e, kit) => `${kit.e('shield')} Safe from /doom until <t:${Math.floor(e.until / 1000)}:t>`,
};

/** Effects running now, one line each; nothing once they've run out */
function effectFields(data, { kit, now }) {
  const lines = (data.effects || [])
    .filter(e => EFFECT_LINES[e.kind] && !(e.until <= now))
    .map(e => EFFECT_LINES[e.kind](e, kit));
  return lines.length ? [{ name: `${kit.e('effect')} In effect`, value: lines.join('\n'), inline: false }] : [];
}

/**
 * The card below its summary, top to bottom. Each section returns its
 * fields, or none when it has nothing to show, so a card never carries an
 * empty heading. Later releases slot theirs in here, each reading its own
 * optional key of `data`: `progress` (rewards in progress), `nights`,
 * `glovebox` and `titles` (R3), `happening` (R4), `siege` (R5).
 */
const SECTIONS = [gameFields, effectFields];

/** One layout step, as a plain embed object (see clipEmbedToFit for why) */
function draft(data, kit, step, now) {
  const embed = {
    color: CARD_COLOUR,
    author: { name: clipText(String(data.player.name || 'Someone'), LIMITS.author) },
    title: `Game card${data.scope ? ` · ${data.scope}` : ''}`,
    description: summary(data, kit),
    fields: SECTIONS.flatMap(section => section(data, { kit, step, now })),
    footer: { text: `${data.periodLabel} · ${CARD_HINT}` },
  };
  if (data.player.avatarUrl) embed.thumbnail = { url: data.player.avatarUrl };
  return step.clip ? clipEmbedToFit(embed) : embed;
}

const fits = (embed) => messageProblems({ embeds: [embed] }).length === 0;

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
 * The card's data from a getScoreboard result. R3 replaces this with
 * getPlayerCard (gameCardData.js), which adds progress, nights, the
 * glovebox and titles; the renderer already takes them as optional.
 * @param {object} board - getScoreboard(…, { games: shown })
 * @param {object} who
 * @param {{id: string, name: string, avatarUrl: ?string}} who.player
 * @param {string[]} who.shown - the games on the card, in GAMES order
 * @returns {{ player, periodLabel, scope, total, rank, ranked, games, effects, emptyText }}
 */
export function gameCardData(board, { player, shown, game = 'all', period = 'all-time', now = Date.now(), emptyText = null }) {
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
    // A rescue's shield, shown with the games it belongs to
    effects: board.shieldedUntil && shown.includes('rescue') ? [{ kind: 'shield', until: board.shieldedUntil }] : [],
    emptyText,
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
  const data = gameCardData(board, { player: { id: user.id, name, avatarUrl }, shown, game, period, now, emptyText });

  await interaction.reply({
    embeds: [renderGameCard(data, { now })],
    ...(ephemeral ? { flags: MessageFlags.Ephemeral } : {}),
    allowedMentions: { parse: [] },
  });
}

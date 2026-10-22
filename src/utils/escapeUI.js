/**
 * Escape Velocity's cards, dashboards and buttons — everything the game shows.
 *
 * The layout follows the bracket's: a public mission card in the channel
 * whose [🚀 Launch] button opens each player's private dashboard, the way
 * the bracket's "Start Voting" opens a private ballot.
 *
 * customIds are short and fixed-length (CLAUDE.md: never a payload in a
 * customId). The stage in an answer button's id is what makes a stale or
 * doubled click harmless — escapeStore refuses an answer for a stage the run
 * has already left.
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { LADDER, STAGES, SAFE_STAGES, standings, playerStatus, scoreOf, todaysRun, poolCounts, POOL_FLOOR, dayKey } from './escapeStore.js';
import { ESCAPE_GENRES, getEscapeGenre, genreSupports } from '../data/escapeGenres.js';

const COLOR = { card: 0x7B61FF, flying: 0x4EC5ED, good: 0x2ECC71, bad: 0xE74C3C, done: 0xF1C40F };
const LETTERS = ['A', 'B', 'C', 'D'];

/** Today's status, as one icon. */
export const STATUS_ICON = { joined: '🛰️', flying: '🚀', failed: '💥', aborted: '🪂', orbit: '🌍' };
const STATUS_TEXT = {
  joined: 'Waiting on the pad',
  flying: 'In flight',
  failed: 'Mission failed today',
  aborted: 'Aborted today',
  orbit: 'Reached orbit today',
};

export const pts = (n) => Number(n || 0).toLocaleString('en-US');

/** Which day of the mission it is, 1-based. */
export function missionDay(event, now = Date.now()) {
  const days = Math.max(1, Math.round((event.endsAt - event.startsAt) / 86400000));
  const day = Math.floor((now - event.startsAt) / 86400000) + 1;
  return { day: Math.min(Math.max(day, 1), days), days };
}

/** The 15 stages as a bar, with gaps at the stage separations: ▰▰▰▰▰ ▰▱▱▱▱ ▱▱▱▱▱ */
export function ladderBar(cleared) {
  let bar = '';
  for (let s = 1; s <= STAGES; s++) {
    bar += s <= cleared ? '▰' : '▱';
    if (SAFE_STAGES.includes(s)) bar += ' ';
  }
  return bar;
}

function genreLine(event) {
  return event.genres.map(k => {
    const g = getEscapeGenre(k);
    return g ? `${g.emoji} ${g.label}` : k;
  }).join(' · ');
}

const MEDIA_LABEL = { movie: 'Movies', tv: 'TV' };

/** "Horror › Slasher · Movies" — what a question is about. */
function topicOf(question) {
  const g = getEscapeGenre(question.genre);
  const sub = g?.subgenres.find(s => s.key === question.subgenre);
  return `${g?.emoji || ''} ${g?.label || question.genre}${sub ? ` › ${sub.label}` : ''} · ${MEDIA_LABEL[question.media] || question.media}`;
}

// ── the public mission card ─────────────────────────────────────────────

export function missionButtons(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ev_launch').setLabel('Launch').setEmoji('🚀').setStyle(ButtonStyle.Primary).setDisabled(disabled),
    new ButtonBuilder().setCustomId('ev_mine').setLabel('My mission').setEmoji('📊').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
  );
}

/** One line per player for the top of the standings. Mentions here display, never ping. */
function standingsLines(data, now, limit = 10) {
  const rows = standings(data).slice(0, limit);
  if (!rows.length) return '*Nobody has launched yet. Be the first!*';
  const medal = ['🥇', '🥈', '🥉'];
  return rows.map((r, i) => {
    const icon = data.event.status === 'live' ? ` ${STATUS_ICON[playerStatus(data, r.userId, now)]}` : '';
    const streak = r.streak >= 2 ? ` · 🔥${r.streak}` : '';
    return `${medal[i] || `**${i + 1}.**`} <@${r.userId}> — **${pts(r.score)}** · stage ${r.stage}${icon}${streak}`;
  }).join('\n');
}

/** The mission card: what the event is, who's leading, and the Launch button. */
export function missionCard(data, now = Date.now()) {
  const { event } = data;
  const { day, days } = missionDay(event, now);
  const players = Object.keys(data.players).length;
  const live = event.status === 'live';
  const embed = new EmbedBuilder()
    .setColor(COLOR.card)
    .setTitle(`🚀 ESCAPE VELOCITY · ${event.name}`.slice(0, 256))
    .setDescription(
      (live ? `**Mission day ${day} of ${days}** · ends <t:${Math.floor(event.endsAt / 1000)}:R>\n` : '**Mission complete**\n') +
      `${genreLine(event)} · ${event.media.map(m => MEDIA_LABEL[m]).join(' & ')}\n\n` +
      'Climb 15 stages of genre trivia to reach orbit. One launch a day; your best run counts. ' +
      '🛰 Stage separations at 5 and 10 keep what you\'ve banked.\n\n' +
      `**Standings** · ${players} ${players === 1 ? 'player' : 'players'}\n${standingsLines(data, now)}`
    )
    .setFooter({ text: live ? 'Press Launch for today\'s run — only you see your questions' : 'Thanks for flying' })
    .setTimestamp(now);
  return { embeds: [embed], components: live ? [missionButtons()] : [] };
}

// ── the private dashboard ───────────────────────────────────────────────

/**
 * A run's current question. `flash` is a line about what just happened
 * ("✅ Correct!").
 */
export function dashboard(run, question, { flash = null } = {}) {
  const stage = run.stage;
  const nextSafe = SAFE_STAGES.find(s => s >= stage);
  const embed = new EmbedBuilder()
    .setColor(COLOR.flying)
    .setTitle(`🚀 Stage ${stage} of ${STAGES} · for ${pts(LADDER[stage - 1])}`)
    .setDescription(
      (flash ? `${flash}\n\n` : '') +
      `${topicOf(question)}\n\n**${question.text}**\n\n` +
      question.options.map((o, i) => `**${LETTERS[i]})** ${o}`).join('\n')
    )
    .addFields(
      { name: 'Banked', value: pts(run.banked), inline: true },
      { name: 'Next separation', value: nextSafe ? `Stage ${nextSafe} (${pts(LADDER[nextSafe - 1])})` : 'None — orbit is next', inline: true },
      { name: 'Climb', value: `\`${ladderBar(stage - 1)}\``, inline: false },
    )
    .setFooter({ text: 'Only you can see this · a wrong answer ends today\'s run' });

  const answers = new ActionRowBuilder().addComponents(
    LETTERS.map((l, i) => new ButtonBuilder()
      .setCustomId(`ev_ans_${run.id}_${stage}_${i}`)
      .setLabel(l)
      .setStyle(ButtonStyle.Primary))
  );
  const lifelines = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ev_abort_${run.id}_${stage}`)
      .setLabel(`Abort (keep ${pts(run.banked)})`)
      .setEmoji('🪂')
      .setStyle(ButtonStyle.Secondary),
  );
  return { content: '', embeds: [embed], components: [answers, lifelines] };
}

/** How a run ended, shown in place of the dashboard. */
export function runOver(run, { question = null, correctIndex = null, choice = null } = {}) {
  const reveal = question != null
    ? `\n\n**${question.text}**\n` + question.options.map((o, i) => {
      const mark = i === correctIndex ? '✅' : i === choice ? '❌' : '▫️';
      return `${mark} **${LETTERS[i]})** ${o}`;
    }).join('\n')
    : '';
  const heads = {
    failed: ['💥 Mission failed', COLOR.bad, `You keep **${pts(run.final)}**${run.final ? ' from your last stage separation' : ''}.`],
    aborted: ['🪂 Aborted', COLOR.done, `You bailed out safely with **${pts(run.final)}**.`],
    orbit: ['🌍 ORBIT!', COLOR.good, `All ${STAGES} stages cleared: **${pts(run.final)}**!`],
  };
  const [title, color, line] = heads[run.status] || ['Run over', COLOR.done, ''];
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(`${line}${reveal}\n\n\`${ladderBar(run.status === 'orbit' ? STAGES : run.stage - 1)}\`\n\nYour next launch window opens <t:${nextDayUnix(run.day)}:R>.`)
    .setFooter({ text: 'Your best run of the event is your score' });
  return { content: '', embeds: [embed], components: [] };
}

function nextDayUnix(day) {
  return Math.floor((Date.parse(`${day}T00:00:00Z`) + 86400000) / 1000);
}

/** The player's own summary, from [📊 My mission]. */
export function myMission(data, userId, now = Date.now()) {
  const player = data.players[userId];
  const status = playerStatus(data, userId, now);
  const rank = standings(data).findIndex(s => s.userId === userId) + 1;
  const run = todaysRun(data, userId, now);
  const best = player.bestRun;
  const embed = new EmbedBuilder()
    .setColor(COLOR.card)
    .setTitle('📊 Your mission')
    .setDescription(
      `**Score:** ${pts(scoreOf(player))} · rank ${rank} of ${Object.keys(data.players).length}\n` +
      `**Best run:** ${best ? `${pts(best.winnings)} (stage ${best.stage})` : 'none yet'}\n` +
      `**Today:** ${STATUS_ICON[status]} ${STATUS_TEXT[status]}${run?.status === 'active' ? ` — stage ${run.stage}` : ''}\n` +
      `**Streak:** ${player.streak.current} ${player.streak.current === 1 ? 'day' : 'days'} (best ${player.streak.best})`
    )
    .setFooter({ text: 'Only you can see this' });
  return { embeds: [embed], components: [] };
}

// ── /escape standings and rules ─────────────────────────────────────────

export function standingsEmbed(data, now = Date.now()) {
  return new EmbedBuilder()
    .setColor(COLOR.card)
    .setTitle(`🏁 ${data.event.name} — standings`.slice(0, 256))
    .setDescription(standingsLines(data, now, 10))
    .setTimestamp(now);
}

export function rulesEmbed() {
  return new EmbedBuilder()
    .setColor(COLOR.card)
    .setTitle('🚀 How Escape Velocity works')
    .setDescription(
      '**Climb 15 stages** of movie and TV genre trivia. Each stage is worth more, and harder, than the last — ' +
      `from ${pts(LADDER[0])} up to **${pts(LADDER[STAGES - 1])}** for reaching orbit.\n\n` +
      '**One launch a day** (UTC). A wrong answer ends that day\'s run; come back tomorrow. ' +
      'Your **best run** across the whole event is your score.\n\n' +
      `🛰 **Stage separations** at stage 5 (${pts(LADDER[4])}) and 10 (${pts(LADDER[9])}): ` +
      'clear one and a later wrong answer can\'t take it back.\n\n' +
      '🪂 **Abort** any time to stop and keep everything banked.\n\n' +
      'Start with `/escape play` or the **Launch** button on the mission card.'
    );
}

// ── setup ───────────────────────────────────────────────────────────────

/** The admin's draft screen: pick media and genres, then generate. */
export function setupView(data, { note = null } = {}) {
  const { event } = data;
  const media = new StringSelectMenuBuilder()
    .setCustomId('ev_setup_media')
    .setPlaceholder('Media: movies, TV, or both')
    .setMinValues(1)
    .setMaxValues(2)
    .addOptions(['movie', 'tv'].map(m => ({ label: MEDIA_LABEL[m], value: m, default: event.media.includes(m) })));

  const genres = new StringSelectMenuBuilder()
    .setCustomId('ev_setup_genres')
    .setPlaceholder('Genres (each includes its subgenres)')
    .setMinValues(1)
    .setMaxValues(Math.min(ESCAPE_GENRES.length, 25))
    .addOptions(ESCAPE_GENRES.slice(0, 25).map(g => {
      const only = ['movie', 'tv'].filter(m => genreSupports(g, m));
      return {
        label: g.label,
        value: g.key,
        emoji: g.emoji,
        description: `${g.subgenres.map(s => s.label).join(', ')}${only.length === 1 ? ` (${MEDIA_LABEL[only[0]]} only)` : ''}`.slice(0, 100),
        default: event.genres.includes(g.key),
      };
    }));

  const ready = event.media.length && event.genres.length;
  const go = new ButtonBuilder()
    .setCustomId('ev_setup_go')
    .setLabel('Build questions & schedule')
    .setEmoji('🛠️')
    .setStyle(ButtonStyle.Success)
    .setDisabled(!ready);

  const embed = new EmbedBuilder()
    .setColor(COLOR.card)
    .setTitle(`🛠️ Setting up: ${event.name}`.slice(0, 256))
    .setDescription(
      (note ? `${note}\n\n` : '') +
      `**Launches** <t:${Math.floor(event.startsAt / 1000)}:f> · **ends** <t:${Math.floor(event.endsAt / 1000)}:f>\n` +
      `**Channel** <#${event.channelId}>\n\n` +
      'Pick the media and genres below, then build the question bank. ' +
      'A genre brings all of its subgenres with it.'
    );
  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(media),
      new ActionRowBuilder().addComponents(genres),
      new ActionRowBuilder().addComponents(go),
    ],
  };
}

/** Pool size per tier, for /escape-setup pool and generation progress. */
export function poolLine(data) {
  const counts = poolCounts(data);
  return [1, 2, 3, 4, 5].map(t => `T${t}: ${counts[t]}${counts[t] < POOL_FLOOR ? '⚠️' : ''}`).join(' · ');
}

export { dayKey };

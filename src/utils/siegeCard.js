/**
 * The siege card (R5): one embed that stands in the channel for the whole
 * fight — the monster, its HP bar, the time left, who's hitting it hardest
 * and the last few things that happened — edited at most once a minute
 * while the fight goes on (siegeStore.markCardEdited), and frozen when it
 * ends. Plus the two messages that must be NOTICED, and so are new
 * messages, never edits (CLAUDE.md: edits never notify): the arrival,
 * which carries the card, and the results, which ping the fighters.
 *
 * renderSiegeCard is pure — a view (siegeStore.siegeView) in, an embed out
 * — so it renders in tests with a fake emoji registry as well as in
 * fallback. Custom emoji go only in the description and fields; the title
 * and footer stay plain text (as gameCard.js).
 *
 * 2.74.0, pace: every window a message quotes (how long to free someone,
 * when a poison wears off, how long a digested fighter is out) is the
 * siege's own (gamePace.timingsOf), so a week campaign says 22 hours where
 * a quick siege says 10 minutes. And from `day` on, the daily report: one
 * NEW message a night that pings nobody (reportPayload).
 */

import { EmbedBuilder } from 'discord.js';
import { liveKit, pill, formatNumber } from './emojiKit.js';
import { messageProblems, clipText } from './embedFit.js';
import { cardName, clipEmbedToFit, ordinal } from './gameBoards.js';
import { ITEMS, SIEGE, TITLES, TITLE_POINTS } from '../data/gameRewards.js';
import { monsterOf, siegeView, potOf } from './siegeStore.js';
import { timingsOf, lengthWords } from './gamePace.js';
import { nightKey } from './gameRules.js';

/** The card's colour: blood while it's on, then how it ended */
export const SIEGE_COLOURS = Object.freeze({ live: 0xC0392B, won: 0x2ECC71, escaped: 0x8E44AD, ended: 0x4F545C });

/** The siege's own icon, as the game is everywhere (GAME_EMOJI.siege) — plain, for titles */
export const SIEGE_EMOJI = '👹';

/** How to fight, on the live card */
export const HOW_TO_FIGHT = '`/siege attack weapon:food|doom|potion`';

const unix = (ms) => Math.floor(ms / 1000);
const plural = (n, word) => `${word}${Math.abs(n) === 1 ? '' : 's'}`;

/** Up to LISTED lines, then "…and N more": a card field stays well inside 1,024 */
const LISTED = 5;
const listed = (items, line) => [...items.slice(0, LISTED).map(line), ...(items.length > LISTED ? [`…and ${items.length - LISTED} more`] : [])].join('\n');

/** "Sam", "Sam and Kim", "Sam, Kim and Alex" */
export const joinNames = (names) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

/** The HP bar's colour: green over half, gold over a quarter, orange below */
export function hpColour(hp, maxHp) {
  const left = maxHp > 0 ? hp / maxHp : 0;
  return left > 0.5 ? 'green' : left > 0.25 ? 'gold' : 'orange';
}

/** "🟩🟩🟩🟩⬜… `412/980` HP": the bar and its number, which a screen reader can read */
export function hpLine(kit, hp, maxHp, { width = 10 } = {}) {
  return `${kit.bar(hp, maxHp, { width, colour: hpColour(hp, maxHp) })} ${pill(`${hp}/${maxHp}`)} HP`;
}

/** The card's title — plain text, the same shape whatever the kit */
export function siegeTitle(view) {
  const name = view.monster.name;
  if (view.status === 'won') return `${SIEGE_EMOJI} ${name} is beaten!`;
  if (view.status === 'escaped') return `${SIEGE_EMOJI} ${name} got away!`;
  if (view.status === 'ended') return `${SIEGE_EMOJI} ${name}: the siege was called off`;
  return `${SIEGE_EMOJI} ${name} is attacking the drive-in!`;
}

/** Under the bar: when it ends, or how and when it ended (a campaign over days: the day and time too) */
function whenLine(view) {
  if (view.status === 'won') return `Beaten <t:${unix(view.finishedAt)}:R>`;
  if (view.status === 'escaped') return `Got away <t:${unix(view.finishedAt)}:R>`;
  if (view.status === 'ended') return `Called off <t:${unix(view.finishedAt)}:R>: no rewards, no penalties`;
  return view.pace?.report ? `Ends <t:${unix(view.endsAt)}:f> (<t:${unix(view.endsAt)}:R>)` : `Ends <t:${unix(view.endsAt)}:R>`;
}

/**
 * 2.74.0: what the pace changes for a fighter, under the time — the day's
 * attacks, and at a `pot` pace the pot so far. Nothing at quick.
 */
function paceLine(view) {
  const parts = [];
  if (view.pace?.allowance) parts.push(`⚔️ ${pill(view.pace.allowance)} attacks a night each`);
  if (view.pace?.pot) parts.push(`🍯 Pot: ${pill(formatNumber(view.pot))}, paid out when it's beaten`);
  return parts.length ? parts.join(' · ') : null;
}

/** The frozen card's result line: who was MVP, who landed the last blow */
function resultLines(view) {
  if (view.status !== 'won') return [];
  const out = [];
  if (view.result?.mvp) out.push(`🏆 MVP: **${cardName(view.result.mvp.name)}**`);
  if (view.killingBlow) out.push(`⚔️ Killing blow: ${cardName(view.killingBlow.name)}${view.killingBlow.by === 'poison' ? ' (poison)' : ''}`);
  return out;
}

/**
 * The card as a plain embed object (measured, then wrapped: see
 * clipEmbedToFit). Top to bottom: what the monster does, its HP and time,
 * the fighters and the top 3, the last few things that happened, how to
 * fight.
 */
function draft(view, kit) {
  const live = view.status === 'live';
  const description = [
    `${view.monster.emoji} ${view.monster.about}`,
    hpLine(kit, view.hp, view.maxHp),
    whenLine(view),
    live ? paceLine(view) : null,
    ...resultLines(view),
  ].filter(Boolean).join('\n');
  const fields = [];
  fields.push({
    name: `${kit.e('people')} Fighters`,
    value: `${pill(view.fighters)} ${plural(view.fighters, 'fighter')}`,
    inline: true,
  });
  fields.push({
    name: `${kit.e('trophy')} Top fighters`,
    value: view.top.length
      ? view.top.map((f, i) => `${kit.e(`med${i + 1}`)} ${cardName(f.name)} ${pill(f.damage)}`).join('\n')
      : (live ? 'Nobody yet: be the first!' : 'Nobody fought.'),
    inline: true,
  });
  // R6: who the monster has, and who it's poisoned — while it's on
  if (live && view.caught?.length) {
    fields.push({ name: '🪤 Caught', value: listed(view.caught, c => `${cardName(c.name)} · free them by <t:${unix(c.until)}:R>`), inline: false });
  }
  if (live && view.poisoned?.length) {
    fields.push({ name: '🤢 Poisoned', value: listed(view.poisoned, p => `${cardName(p.name)} · ${p.until === null ? 'until cured' : `wears off <t:${unix(p.until)}:R>`}`), inline: false });
  }
  // 2.74.0: digested for a day, at 3 days and a week
  if (live && view.out?.length) {
    fields.push({ name: '😋 Digested', value: listed(view.out, o => `${cardName(o.name)} · back <t:${unix(o.until)}:R>`), inline: false });
  }
  if (view.log.length) {
    fields.push({ name: `${kit.e('clock')} Latest`, value: view.log.map(l => clipText(String(l.text), 200)).join('\n'), inline: false });
  }
  if (live) {
    fields.push({ name: `${kit.game('siege')} How to fight`, value: `${HOW_TO_FIGHT}\n\`/siege status\` shows your own damage`, inline: false });
  }
  return {
    color: SIEGE_COLOURS[view.status] ?? SIEGE_COLOURS.live,
    title: siegeTitle(view),
    description,
    fields,
    // The edit cadence is the siege's own (t.cardEditSeconds): a minute, or 10 from `day` on
    footer: { text: live ? (view.pace?.report ? 'Siege · the card updates every 10 minutes' : 'Siege · the card updates about once a minute') : 'Siege · over' },
  };
}

const fits = (embed) => messageProblems({ embeds: [embed] }).length === 0;

/**
 * The siege card. Pure: no Discord, no files.
 * @param {object} view - siegeStore.siegeView(siege)
 * @param {object} [options] - kit (default: the live one), now
 * @returns {EmbedBuilder}
 */
export function renderSiegeCard(view, { kit = liveKit() } = {}) {
  const embed = draft(view, kit);
  // Everything on it is short and bounded (3 names, 5 log lines of ≤200),
  // so this never fires on real data; it's the guarantee a rejected card
  // (nothing posted at all) can't happen
  return new EmbedBuilder(fits(embed) ? embed : clipEmbedToFit(embed));
}

// ── the messages ────────────────────────────────────────────────────────

/** The arrival's words: the monster's own line, and how to fight it — no pings */
export function arrivalContent(monster) {
  return `${monster.lines.arrive}\nFight it with \`/siege attack\`!`;
}

/**
 * The card's message, as posted and as edited. The arrival's "Fight it"
 * goes once the fight is over; an edit pings nobody either way.
 */
export function cardPayload(siege, { kit = liveKit() } = {}) {
  const monster = monsterOf(siege.monster);
  return {
    content: siege.status === 'live' ? arrivalContent(monster) : monster.lines.arrive,
    embeds: [renderSiegeCard(siegeView(siege), { kit })],
    allowedMentions: { parse: [] },
  };
}

/** One fighter's row in the results: place, name, damage, what they got */
function resultRow(g, i, kit, status) {
  const place = i < 3 ? kit.e(`med${i + 1}`) : `${i + 1}\\.`;
  const parts = [`${place} ${cardName(g.name)} · ${pill(formatNumber(g.damage || 0))} damage`];
  // Past today's limit of rewarded sieges: the row says so, rather than a
  // bare ±0 — and at a pot pace, the attacks' own points it paid instead
  // (gameScores.applySiegeResult)
  if (g.limited) {
    return [...parts, ...(g.points > 0 ? [pill(`+${g.points}`)] : []),
      `reward limit reached (${SIEGE.rewardedPerDay} sieges a day)${g.points > 0 ? ': just what the attacks scored' : ''}`].join(' · ');
  }
  const pts = g.points || 0;
  if (status === 'won' || pts) parts.push(pill(pts > 0 ? `+${pts}` : pts < 0 ? `−${Math.abs(pts)}` : '±0'));
  if (g.loot) {
    const item = ITEMS[g.loot.item];
    parts.push(g.loot.overflow ? `+2 (Glovebox full of ${item?.name || g.loot.item})` : `${item?.emoji || ''} ${item?.name || g.loot.item}`.trim());
  }
  // R6: the Silver Bullet that every few siege wins brings
  if (g.prize) {
    const item = ITEMS[g.prize.item];
    parts.push(g.prize.overflow ? `🎁 +${g.prize.points + 2} (Glovebox full of ${item.name})` : `🎁 ${item.emoji} ${item.name} +${g.prize.points}`);
  }
  for (const key of g.titles || []) {
    const t = TITLES.find(x => x.key === key);
    if (t) parts.push(`📜 ${t.badge} ${t.title}`);
  }
  return parts.join(' · ');
}

/** Rows shown in the results before "…and N more" */
const RESULT_ROWS = 25;

/**
 * Who the results ping, at most SIEGE.pingMax: the fighters best first,
 * and every digest no report reached (`told`). Those are fighters too, so
 * usually already among them; past the first pingMax they take the last
 * places — they lost points and must hear it, a fighter far down the table
 * can read the results. In the fighters' order, the extra ones after.
 */
export function pingList(fighterIds, told = []) {
  const must = [...new Set(told)].slice(0, SIEGE.pingMax);
  const others = fighterIds.filter(id => !must.includes(id)).slice(0, SIEGE.pingMax - must.length);
  const keep = new Set([...must, ...others]);
  return [...fighterIds.filter(id => keep.has(id)), ...must.filter(id => !fighterIds.includes(id))];
}

/**
 * The results: a NEW message that pings up to SIEGE.pingMax fighters in
 * its content (an embed's mentions never ping), with the monster's defeat
 * or escape line — {mvp} filled with the MVP's name — the digests no daily
 * report reached, and an embed of what each fighter did and got.
 */
export function resultsPayload(siege, { kit = liveKit() } = {}) {
  const monster = monsterOf(siege.monster);
  const result = siege.result || { status: siege.status, grants: [] };
  const won = result.status === 'won';
  const grants = Array.isArray(result.grants) ? result.grants : [];
  const line = won
    ? monster.lines.defeat.split('{mvp}').join(result.mvp ? cardName(result.mvp.name) : 'Everyone')
    : monster.lines.escape;
  // 2.74.0: digests no report reached (`unreported`: kept for a report the
  // siege ended or was won before) are told here, by name, and pinged. An
  // escape's results wait for someone to play, so this never pings at 4 a.m.
  const untold = (Array.isArray(siege.unreported) ? siege.unreported : []).filter(d => d?.userId);
  const ids = pingList(grants.map(g => g.userId), untold.map(d => d.userId));
  const pings = ids.map(id => `<@${id}>`).join(' ');
  // The names give way before a ping does: clipped to what's left of 2,000
  // (20 long, escaped names can reach it), the mentions kept whole
  const digestLine = untold.length
    ? clipText(`😋 Digested while nobody was around: ${untold.map(d => `${cardName(d.name)} ${d.points < 0 ? `−${Math.abs(d.points)}` : '±0'}`).join(' · ')}`, Math.max(1, 2000 - line.length - pings.length - 2))
    : null;
  const content = [line, digestLine, pings].filter(Boolean).join('\n');

  const rows = grants.slice(0, RESULT_ROWS).map((g, i) => resultRow(g, i, kit, result.status));
  if (grants.length > RESULT_ROWS) rows.push(`…and ${grants.length - RESULT_ROWS} more`);
  const solo = won && grants.length === 1 && grants[0].solo;
  const t = timingsOf(siege);
  const pool = t.pot ? `The pot (${formatNumber(potOf(siege))}, ${t.pool.perFighter} a fighter a night) was split by what each did` : 'The pool was split by damage';
  const head = solo
    ? `${monster.emoji} Beaten by one fighter alone: the pool, but no MVP bonus or loot. Siege titles need company.`
    : won
      ? `${monster.emoji} Beaten with ${pill(grants.length)} ${plural(grants.length, 'fighter')}. ${pool}; the MVP gets +${SIEGE.rewards.mvpBonus * t.honour} and loot.`
    : grants.some(g => (g.points || 0) < 0)
      ? `${monster.emoji} It got away. Everyone who fought loses ${SIEGE.escape.loss} (never below 0 for the month).`
      : `${monster.emoji} It got away.${grants.length ? ' With so few fighters, nobody loses anything.' : ''}`;
  const embed = {
    color: won ? SIEGE_COLOURS.won : SIEGE_COLOURS.escaped,
    title: won ? `🏆 ${monster.name} is beaten!` : `💨 ${monster.name} got away!`,
    description: [head, '', ...rows].join('\n').trim(),
    footer: { text: 'Siege results · /scoreboard shows your points' },
  };
  return {
    content: clipText(content, 2000),
    embeds: [new EmbedBuilder(fits(embed) ? embed : clipEmbedToFit(embed))],
    allowedMentions: { parse: [], users: ids },
  };
}

/** "#2 of 5": a fighter's place, for /siege status */
export const placeText = (standing) => `${ordinal(standing.rank)} of ${formatNumber(standing.of)}`;

// ── R6: the monster fights back ─────────────────────────────────────────

const bold = (name) => `**${cardName(name)}**`;

/**
 * A monster's action, as the NEW message that announces it (edits never
 * notify): the monster's own line with {monster} and {fighter} as display
 * names, the victims pinged in content — them and nobody else — and how to
 * help. Built just before the send from the pending action and the files
 * as they are then: `antidotes` (victims whose Antidote will fire) and
 * `titles` (a grab that earns Monster Chow) are worked out by the caller.
 * @param {object} siege
 * @param {{id, kind, victims, line}} action - siege.pending
 * @param {object} [extra] - antidotes: userIds; titles: {userId: [title keys]}; healed: HP it will heal
 */
export function actionPayload(siege, action, { antidotes = [], titles = {}, healed = 0 } = {}) {
  const monster = monsterOf(siege.monster);
  const nameOf = (id) => siege.participants?.[id]?.name || 'someone';
  const victims = action.victims || [];
  const who = joinNames(victims.map(id => bold(nameOf(id))));
  const lines = monster.lines?.[action.kind] || [];
  const text = (lines[action.line] ?? lines[0] ?? `{monster} roars.`)
    .split('{monster}').join(`**${monster.name}**`)
    .split('{fighter}').join(who || 'everyone');
  const out = [text];
  if (victims.length) out.push(victims.map(id => `<@${id}>`).join(' '));
  const t = timingsOf(siege);
  if (action.kind === 'grab') {
    const first = cardName(nameOf(victims[0]));
    out.push(`-# 🪤 Free them with \`/rescue attempt target:@${first}\` within ${lengthWords(t.freeMinutes)}, or the monster digests them: −${SIEGE.grab.loss} and ${outWords(t)}. A grabbed fighter can't attack.`);
  } else if (action.kind === 'poison') {
    const forever = !!monster.traits?.poisonForever;
    const hit = victims.filter(id => !antidotes.includes(id));
    if (hit.length) {
      out.push(`-# 🤢 Until a helpful \`/potion give\` cures them, their attacks do half damage. ${forever ? 'It won\'t wear off by itself.' : `It wears off in ${lengthWords(t.poisonMinutes)}.`}`);
    }
    for (const id of antidotes) out.push(`-# 💊 ${cardName(nameOf(id))}'s Antidote cured it at once.`);
  }
  if (healed > 0) out.push(`-# 💚 ${monster.name} heals ${healed} HP.`);
  for (const [id, keys] of Object.entries(titles)) {
    for (const key of keys) {
      const t = TITLES.find(x => x.key === key);
      if (t) out.push(`-# 📜 ${cardName(nameOf(id))} earned a title: ${t.badge} ${t.title} (+${TITLE_POINTS})`);
    }
  }
  return {
    content: clipText(out.join('\n'), 2000),
    allowedMentions: { parse: [], users: [...victims] },
  };
}

/** "out of the fight" (as before 2.74), or "out for a day" at 3 days and a week */
const outWords = (t) => (t.outMinutes ? `out for ${lengthWords(t.outMinutes)}` : 'out of the fight');

/** Grabbed fighters nobody freed: a NEW message pinging them, with what it cost */
export function digestPayload(siege, digested) {
  const monster = monsterOf(siege.monster);
  const who = joinNames(digested.map(d => bold(d.name)));
  const lost = digested.map(d => `${cardName(d.name)} ${d.points < 0 ? `−${Math.abs(d.points)}` : '±0'}`).join(' · ');
  const t = timingsOf(siege);
  const back = t.outMinutes && digested[0]?.outUntil ? ` Out for ${lengthWords(t.outMinutes)}: back <t:${unix(digested[0].outUntil)}:R>.` : ' Out of this siege.';
  return {
    content: clipText([
      `😋 **${monster.name}** digested ${who}: nobody freed them in time.${back}`,
      digested.map(d => `<@${d.userId}>`).join(' '),
      `-# ${lost} (never below 0 for the month)`,
    ].join('\n'), 2000),
    allowedMentions: { parse: [], users: digested.map(d => d.userId) },
  };
}

// ── 2.74.0: the daily report ────────────────────────────────────────────

/** "Sam (3 freed, 1 cured)" */
const helpWords = (u) => [u.frees ? `${u.frees} freed` : null, u.cures ? `${u.cures} cured` : null].filter(Boolean).join(', ');

/** Nights between two night keys (YYYY-MM-DD): 0 for the same */
const nightsApart = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / (24 * 60 * 60 * 1000));

/**
 * The daily report (from `day` on): a NEW message once a night that pings
 * nobody — names, not mentions, and none in content (an embed's never
 * ping anyway). What tomorrow's crowd needs: the HP and last night's
 * damage, last night's top 3 and best helper, who's still held (and by
 * when they must be freed), who's poisoned, who was digested while nobody
 * was around, the time left, and the day's attacks.
 * @param {object} siege - as claimed (claimReport)
 * @param {{night, last, number, nights, tally: ?{damage, users}, digested: object[]}} report - claimReport's
 */
export function reportPayload(siege, report, { kit = liveKit(), now = Date.now() } = {}) {
  const monster = monsterOf(siege.monster);
  const view = siegeView(siege, now);
  const t = timingsOf(siege);
  const tally = report.tally || { damage: 0, users: {} };
  const users = Object.entries(tally.users || {}).map(([userId, u]) => ({ userId, ...u }));
  // The night reported on (claimReport counts them: gamePace.campaignNight)
  const night = Math.max(1, Number(report.number) || nightsApart(nightKey(siege.startedAt), report.last) + 1);
  // The nights its tallies cover: one, unless a report was lost on the way
  // (claimReport) — then "last night" would be several added up
  const covers = Math.max(1, Number(report.nights) || 1);
  const span = covers > 1 ? `the last ${covers} nights` : 'last night';
  const fields = [];
  const top = users.filter(u => u.damage > 0).sort((a, b) => b.damage - a.damage || (a.userId < b.userId ? -1 : 1)).slice(0, 3);
  const helper = users.filter(u => (u.frees || 0) + (u.cures || 0) > 0)
    .sort((a, b) => ((b.frees || 0) + (b.cures || 0)) - ((a.frees || 0) + (a.cures || 0)) || (a.userId < b.userId ? -1 : 1))[0];
  fields.push({
    name: `${kit.e('trophy')} ${span.charAt(0).toUpperCase()}${span.slice(1)}`,
    value: top.length
      ? [
        ...top.map((u, i) => `${kit.e(`med${i + 1}`)} ${cardName(u.name)} ${pill(formatNumber(u.damage))}`),
        ...(helper ? [`🛟 Best helper: ${cardName(helper.name)} (${helpWords(helper)})`] : []),
      ].join('\n')
      : (helper ? `Nobody attacked. 🛟 Best helper: ${cardName(helper.name)} (${helpWords(helper)})` : covers > 1 ? `Nobody fought in ${span}.` : 'Nobody fought last night.'),
    inline: false,
  });
  if (view.caught.length) {
    fields.push({ name: '🪤 Still held', value: listed(view.caught, c => `${cardName(c.name)} · free them with \`/rescue\` by <t:${unix(c.until)}:R>`), inline: false });
  }
  if (view.poisoned.length) {
    fields.push({ name: '🤢 Poisoned', value: listed(view.poisoned, p => `${cardName(p.name)} · a helpful \`/potion give\` cures them${p.until === null ? '' : ` (it wears off <t:${unix(p.until)}:R>)`}`), inline: false });
  }
  const digested = Array.isArray(report.digested) ? report.digested : [];
  if (digested.length) {
    fields.push({
      name: '😋 Digested while nobody was around',
      value: listed(digested, d => `${cardName(d.name)} ${d.points < 0 ? `−${Math.abs(d.points)}` : '±0'}${d.outUntil ? ` · back <t:${unix(d.outUntil)}:R>` : ' · out of this siege'}`),
      inline: false,
    });
  }
  const how = [
    // Posted as a night begins: tonight's attacks are fresh for everyone
    t.allowance ? `Everyone has ${pill(t.allowance)} fresh attacks tonight (a night runs 12:00 to 12:00 UTC). Freeing and curing are unlimited.` : null,
    t.pot ? `🍯 The pot is ${pill(formatNumber(view.pot))}, paid out when it's beaten.` : null,
    HOW_TO_FIGHT,
  ].filter(Boolean).join('\n');
  fields.push({ name: `${kit.game('siege')} Tonight`, value: how, inline: false });
  const embed = {
    color: SIEGE_COLOURS.live,
    title: `${SIEGE_EMOJI} ${monster.name}: night ${night} report`,
    description: [
      `${monster.emoji} ${monster.name} still has the drive-in.`,
      hpLine(kit, view.hp, view.maxHp),
      `${pill(`−${formatNumber(tally.damage || 0)}`)} ${covers > 1 ? `in ${span}` : span} · ends <t:${unix(siege.endsAt)}:f> (<t:${unix(siege.endsAt)}:R>)`,
    ].join('\n'),
    fields,
    footer: { text: 'Nightly siege report · one a night, pinging nobody' },
  };
  return {
    content: `📰 **Night ${night} is over** and ${monster.name} is still here. Who needs help tonight:`,
    embeds: [new EmbedBuilder(fits(embed) ? embed : clipEmbedToFit(embed))],
    allowedMentions: { parse: [] },
  };
}

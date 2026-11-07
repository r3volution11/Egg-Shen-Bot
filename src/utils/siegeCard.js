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
 *
 * 2.75.0, the real hero: the MVP is the Wang Chi (most help) and the
 * killing blow the Jack Burton — on the frozen card, in the results (a line
 * each from btilcLines.HONOURS, and a mark on their rows), the daily
 * report's helper and the live card's "Wang Chi so far" — and every backer
 * gets a line in the results. The words are btilcLines'; a line is picked
 * by the siege's id (lineFor), never by luck: one more luck draw would
 * shift the loot of every seeded siege after it.
 */

import { EmbedBuilder } from 'discord.js';
import { liveKit, pill, formatNumber } from './emojiKit.js';
import { messageProblems, clipText } from './embedFit.js';
import { cardName, clipEmbedToFit, ordinal } from './gameBoards.js';
import { ITEMS, SIEGE, TITLES, TITLE_POINTS, SIEGE_R2_DEPLOY } from '../data/gameRewards.js';
import { HONOURS, fill } from '../data/btilcLines.js';
import { monsterOf, siegeView, potOf } from './siegeStore.js';
import { timingsOf, lengthWords } from './gamePace.js';
import { nightKey } from './gameRules.js';

/** The card's colour: blood while it's on, then how it ended */
export const SIEGE_COLOURS = Object.freeze({ live: 0xC0392B, won: 0x2ECC71, escaped: 0x8E44AD, ended: 0x4F545C });

/** The siege's own icon, as the game is everywhere (GAME_EMOJI.siege) — plain, for titles */
export const SIEGE_EMOJI = '👹';

/** How to fight, on the live card */
export const HOW_TO_FIGHT = '`/siege attack weapon:food|doom|potion`';

/** How to back a fighter (2.75.0), on the live card while backing is open */
export const BACK_HOW = `\`/siege back fighter:@… points:${SIEGE.backing.min}–${SIEGE.backing.max}\``;

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

/** "+5", "−3", "±0": a points line's own signs */
const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '±0');

/**
 * A label's words without its emoji ("🗡️ Wang Chi" → "Wang Chi"): on a card
 * the kit's own icon goes in front (kit.e('wang'), its fallback the same 🗡️)
 */
const labelText = (label) => String(label).replace(/^\S+\s+/, '');

/**
 * A line from `list`, picked by the siege's id — never by luck: a luck draw
 * here would shift every seeded siege's loot after it. `salt` picks a
 * different part of the id, so two lists (or two backers) don't move in step.
 */
export function lineFor(id, list, salt = 0) {
  if (!Array.isArray(list) || !list.length) return '';
  const hex = String(id || '').replace(/[^0-9a-f]/gi, '').padEnd(12, '0');
  const at = salt % Math.max(1, hex.length - 5);
  return list[(parseInt(hex.slice(at, at + 6), 16) || 0) % list.length];
}

/**
 * The frozen card's result lines: the Wang Chi (a result from before 2.75.0
 * has only its MVP — the same honour, by its new name), and the Jack
 * Burton; a win with no Jack Burton (one fighter alone) still says who
 * landed the killing blow
 */
function resultLines(view, kit) {
  if (view.status !== 'won') return [];
  const r = view.result || {};
  const out = [];
  const wang = r.wangChi ?? r.mvp;
  if (wang) out.push(`${kit.e('wang')} ${labelText(HONOURS.labels.wangChi)}: **${cardName(wang.name)}**${wang.held ? ' (held the line)' : ''}`);
  // A pre-2.75 result (no `jack` kept): its killing blow was its Jack Burton
  const jack = Object.hasOwn(r, 'jack') ? r.jack : (view.killingBlow ? { name: view.killingBlow.name, by: view.killingBlow.by } : null);
  if (jack) out.push(`${kit.e('jack')} ${labelText(HONOURS.labels.jackBurton)}: ${cardName(jack.name)}${jack.by === 'poison' ? ' (poison)' : ''}`);
  else if (view.killingBlow) out.push(`⚔️ Killing blow: ${cardName(view.killingBlow.name)}${view.killingBlow.by === 'poison' ? ' (poison)' : ''}`);
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
  // 2.75.0: while it's on, whoever has helped most so far (the honour goes by help, not damage)
  const soFar = live && view.wangChiSoFar
    ? `${kit.e('wang')} Wang Chi so far: ${cardName(view.wangChiSoFar.name)} (${helpWords(view.wangChiSoFar)})`
    : null;
  const description = [
    `${view.monster.emoji} ${view.monster.about}`,
    hpLine(kit, view.hp, view.maxHp),
    whenLine(view),
    live ? paceLine(view) : null,
    soFar,
    ...resultLines(view, kit),
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
    // 2.75.0: backing, while it's open (the first half of the siege's time)
    const back = view.backing?.open ? `\n${BACK_HOW} until <t:${unix(view.backing.closesAt)}:R>` : '';
    fields.push({ name: `${kit.game('siege')} How to fight`, value: `${HOW_TO_FIGHT}\n\`/siege status\` shows your own damage${back}`, inline: false });
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

/**
 * One fighter's row in the results: place, name, damage, what they got —
 * and (2.75.0) what of it was an honour: the Wang Chi's and the Jack
 * Burton's bonuses (× H, the siege's), and the Wang Chi's backers' share
 */
function resultRow(g, i, kit, status, H = 1) {
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
  if (status === 'won' || pts) parts.push(pill(signed(pts)));
  if (g.wangChi) parts.push(`${kit.e('wang')} ${signed(SIEGE.rewards.wangChiBonus * H)}`);
  // An MVP paid the old way (a result from before 2.75.0, or SIEGE_R2_DEPLOY's 'mvp')
  else if (g.mvp && status === 'won') parts.push(`🏆 ${signed(SIEGE_R2_DEPLOY.mvpBonus * H)}`);
  if (g.jack) parts.push(`${kit.e('jack')} ${signed(SIEGE.rewards.jackBonus * H)}`);
  if (g.backBonus > 0) parts.push(`${kit.e('back')} ${signed(g.backBonus)}`);
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

/** Backing lines shown in the results before "…and N more" */
const BACKING_ROWS = 10;

/**
 * The honour lines for the results' content (2.75.0): the Wang Chi's (or,
 * held, "nobody needed saving"), then the Jack Burton's — or one line for
 * both, when the Wang Chi landed the blow. None for an escape, one fighter
 * alone, or an MVP paid the old way. Names, never mentions.
 */
function honourLines(siege, result) {
  const wang = result.wangChi;
  if (result.status !== 'won' || !wang) return [];
  const jack = result.jack;
  const names = { mvp: cardName(wang.name), jack: cardName(jack?.name || wang.name) };
  if (jack && jack.userId === wang.userId) return [fill(lineFor(siege.id, HONOURS.both, 0), names)];
  const out = [fill(lineFor(siege.id, wang.held ? HONOURS.wangChiHeld : HONOURS.wangChi, 0), names)];
  if (jack) out.push(fill(lineFor(siege.id, HONOURS.jackBurton, 3), names));
  return out;
}

/**
 * One backer's line (2.75.0), from HONOURS.backing by how it settled. The
 * fighter's share (their `bonus`) is named only on the one backing that
 * earned it, and only if it was paid (a fighter past today's reward limit
 * got none): a second backer of the same Wang Chi gets `wangChiToo`, which
 * doesn't name it, or it would read as paid twice.
 */
function backingLine(siege, result, b, i) {
  const B = HONOURS.backing;
  const v = { backer: cardName(b.backerName), fighter: cardName(b.fighterName), stake: b.stake };
  const pick = (list) => lineFor(`${siege.id}${b.backerId}`, list, i);
  if (b.outcome === 'wangChi') {
    const g = (result.grants || []).find(x => x.userId === b.fighterId);
    const bonus = b.bonus > 0 && g && !g.limited ? g.backBonus || 0 : 0;
    const gain = signed(b.back - b.stake);
    return bonus > 0 ? fill(pick(B.wangChi), { ...v, gain, bonus: signed(bonus) }) : fill(B.wangChiToo, { ...v, gain });
  }
  if (b.outcome === 'push') return fill(pick(B.push), v);
  if (b.outcome === 'lost') return fill(pick(B.lost), v);
  if (b.outcome === 'escaped') return fill(pick(B.escaped), v);
  // refunded: [0] an admin called it off, [1] too few fighters to call it
  return fill(B.refunded[result.status === 'ended' ? 0 : 1], v);
}

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
 * or escape line — {mvp} filled with the Wang Chi's name, {jack} with the
 * Jack Burton's — then (2.75.0) the honours' lines, the digests no daily
 * report reached (2.74.0), and an embed of what each fighter did and got,
 * and each backer.
 */
export function resultsPayload(siege, { kit = liveKit() } = {}) {
  const monster = monsterOf(siege.monster);
  const result = siege.result || { status: siege.status, grants: [] };
  const won = result.status === 'won';
  const grants = Array.isArray(result.grants) ? result.grants : [];
  // One fighter alone has no Wang Chi: the line names them anyway, as it always did
  const mvpName = result.wangChi?.name ?? result.mvp?.name ?? grants[0]?.name ?? null;
  const jackName = result.jack?.name ?? siege.killingBlow?.name ?? mvpName;
  const line = won
    ? fill(monster.lines.defeat, { mvp: mvpName ? cardName(mvpName) : 'Everyone', jack: jackName ? cardName(jackName) : 'Everyone' })
    : monster.lines.escape;
  // 2.75.0: the honours' lines, right under the monster's
  const lead = [line, ...honourLines(siege, result)].join('\n');
  // 2.74.0: digests no report reached (`unreported`: kept for a report the
  // siege ended or was won before) are told here, by name, and pinged. An
  // escape's results wait for someone to play, so this never pings at 4 a.m.
  const untold = (Array.isArray(siege.unreported) ? siege.unreported : []).filter(d => d?.userId);
  const ids = pingList(grants.map(g => g.userId), untold.map(d => d.userId));
  const pings = ids.map(id => `<@${id}>`).join(' ');
  // The names give way before a ping does: clipped to what's left of 2,000
  // after the monster's and the honours' lines (20 long, escaped names can
  // reach it), the mentions kept whole
  const digestLine = untold.length
    ? clipText(`😋 Digested while nobody was around: ${untold.map(d => `${cardName(d.name)} ${d.points < 0 ? `−${Math.abs(d.points)}` : '±0'}`).join(' · ')}`, Math.max(1, 2000 - lead.length - pings.length - 2))
    : null;
  const content = [lead, digestLine, pings].filter(Boolean).join('\n');

  const t = timingsOf(siege);
  const rows = grants.slice(0, RESULT_ROWS).map((g, i) => resultRow(g, i, kit, result.status, t.honour));
  if (grants.length > RESULT_ROWS) rows.push(`…and ${grants.length - RESULT_ROWS} more`);
  // 2.75.0: every backer, as settled (a stake refunded with no backing on
  // the siege isn't one to show) — in a field of their own, after the rows:
  // a field is clipped on its own, so a long table of fighters can never
  // push a backer's line off the end, and the field stays inside 1,024
  const backing = (Array.isArray(result.backing) ? result.backing : []).filter(b => !b.orphan);
  const backRows = [];
  for (const [i, b] of backing.slice(0, BACKING_ROWS).entries()) {
    const next = clipText(backingLine(siege, result, b, i), 300);
    const more = `…and ${backing.length - i} more`;
    if ([...backRows, next].join('\n').length + (i + 1 < backing.length ? more.length + 1 : 0) > 1024) break;
    backRows.push(next);
  }
  if (backing.length > backRows.length) backRows.push(`…and ${backing.length - backRows.length} more`);
  const solo = won && grants.length === 1 && grants[0].solo;
  // Split by contribution (damage, and frees and cures since R6): "by
  // damage" was wrong at quick and evening from 2.73 on
  const pool = t.pot ? `The pot (${formatNumber(potOf(siege))}, ${t.pool.perFighter} a fighter a night) was split by what each did` : 'The pool was split by what each did (damage, frees and cures)';
  // An MVP paid the old way: a result from before 2.75.0, or SIEGE_R2_DEPLOY's 'mvp'
  const oldMvp = !result.wangChi && !!result.mvp;
  const honours = oldMvp
    ? `the MVP gets ${signed(SIEGE_R2_DEPLOY.mvpBonus * t.honour)} and loot`
    : `${kit.e('wang')} the Wang Chi gets ${signed(SIEGE.rewards.wangChiBonus * t.honour)} and loot, ${kit.e('jack')} the Jack Burton ${signed(SIEGE.rewards.jackBonus * t.honour)}`;
  const head = solo
    ? `${monster.emoji} Beaten by one fighter alone: the pool, but no honours or loot. Siege titles need company.`
    : won
      ? `${monster.emoji} Beaten with ${pill(grants.length)} ${plural(grants.length, 'fighter')}. ${pool}; ${honours}.`
    : grants.some(g => (g.points || 0) < 0)
      ? `${monster.emoji} It got away. Everyone who fought loses ${SIEGE.escape.loss} (never below 0 for the month).`
      : `${monster.emoji} It got away.${grants.length ? ' With so few fighters, nobody loses anything.' : ''}`;
  const embed = {
    color: won ? SIEGE_COLOURS.won : SIEGE_COLOURS.escaped,
    title: won ? `🏆 ${monster.name} is beaten!` : `💨 ${monster.name} got away!`,
    description: [head, '', ...rows].join('\n').trim(),
    ...(backRows.length ? { fields: [{ name: `${kit.e('back')} Backing`, value: backRows.join('\n'), inline: false }] } : {}),
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

/** "3 freed, 1 cured" (and, from R4, "2 boosted") */
const helpWords = (u) => [
  u.frees ? `${u.frees} freed` : null, u.cures ? `${u.cures} cured` : null, u.boostHits ? `${u.boostHits} boosted` : null,
].filter(Boolean).join(', ');

/** A night's help in points, as the Wang Chi is measured (siegeStore.helpOf; the tallies have no boosts yet) */
const nightHelp = (u) => SIEGE.credit.free * (Number(u.frees) || 0) + SIEGE.credit.cure * (Number(u.cures) || 0);

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
  // 2.75.0: the night's Wang Chi — the most help, weighed as the honour weighs it (a free beats a cure)
  const helper = users.filter(u => nightHelp(u) > 0)
    .sort((a, b) => nightHelp(b) - nightHelp(a) || (a.userId < b.userId ? -1 : 1))[0];
  // Over several nights (a lost report: claimReport's `nights`), of those nights
  const wang = helper ? `${kit.e('wang')} Wang Chi of ${covers > 1 ? `the last ${covers} nights` : 'the night'}: ${cardName(helper.name)} (${helpWords(helper)})` : null;
  fields.push({
    name: `${kit.e('trophy')} ${span.charAt(0).toUpperCase()}${span.slice(1)}`,
    value: top.length
      ? [...top.map((u, i) => `${kit.e(`med${i + 1}`)} ${cardName(u.name)} ${pill(formatNumber(u.damage))}`), ...(wang ? [wang] : [])].join('\n')
      : (wang ? `Nobody attacked. ${wang}` : covers > 1 ? `Nobody fought in ${span}.` : 'Nobody fought last night.'),
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

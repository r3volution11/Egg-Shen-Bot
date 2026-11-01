/**
 * What R3 adds to a member's game card, read from the scores file: the
 * rewards in progress, the nights row, the Glovebox and titles. Read-only
 * — the card never writes — and shaped for gameCard.js to draw (agent F's
 * renderer reads exactly these field names; change them together).
 *
 * The rules come from gameRules.js and the numbers from gameRewards.js,
 * so the card can't drift from what recordPlay actually does: a row the
 * card shows alive is one the next play will extend.
 */

import { loadScores, earnedTitles, shownTitleOf, canBurnLight } from './gameScores.js';
import {
  nightKey, nightsBetween, shiftNight, nightTier, nextNightTier, nextNightLightAt, titleProgress,
} from './gameRules.js';
import { ITEMS, PRIZES, TITLES, NIGHTS_SHOWN, NIGHT_LIGHT_DAYS } from '../data/gameRewards.js';
import { NO_TITLE_CHOICE } from '../data/gameRewardLines.js';

const DAY = 24 * 60 * 60 * 1000;

/** The prize a counter pays, as the card shows it */
function prizeOf(p) {
  return p.item
    ? { item: p.item, name: ITEMS[p.item].name, icon: ITEMS[p.item].kit, points: p.points }
    : { item: null, name: 'A random item', icon: 'gift', points: p.points };
}

/**
 * The row as it stands NOW. The stored `current` is only updated by a
 * play, so someone who stopped three nights ago still has their old number
 * stored; the card shows 0 for a broken row. Played tonight or last night:
 * alive. Missed exactly one night with a Night Light that can burn: alive
 * (it burns on their next play). Otherwise broken.
 */
function liveNights(user, now) {
  const n = user?.nights;
  if (!n?.last) return 0;
  const gap = nightsBetween(n.last, nightKey(now));
  if (gap <= 1) return n.current || 0;
  if (gap === 2 && canBurnLight(user, now)) return n.current || 0;
  return 0;
}

/** The last NIGHTS_SHOWN nights, oldest first, ending with tonight */
function nightRow(user, now) {
  const tonight = nightKey(now);
  const played = new Set(user?.nights?.recent || []);
  const saved = new Set(user?.nights?.saved || []);
  return Array.from({ length: NIGHTS_SHOWN }, (_, i) => {
    const key = shiftNight(tonight, i - (NIGHTS_SHOWN - 1));
    if (played.has(key)) return 'played';
    if (saved.has(key)) return 'saved';
    return key === tonight ? 'tonight' : 'missed';
  });
}

const titleCard = (t) => ({ key: t.key, title: t.title, badge: t.badge });

/**
 * One member's rewards, for their card.
 * @returns {{
 *   progress: Array<{key, game, icon, label, have, need, prize: {item, name, icon, points}, waiting}>,
 *   nights: {current, best, tier: ?{key, name, emoji}, next: ?{at, name}, row: string[]},
 *   glovebox: Array<{item, name, icon, count, cap, passive, about, readyAt}>,
 *   titles: {shown: ?{key, title, badge}, earned: Array<{key, title, badge, at}>, next: Array<{key, title, badge, have, need}>},
 * }}
 *   progress: every recurring counter in a stable order, the nights row's
 *     Night Light last; `waiting` = held at need − 1 by the daily prize cap.
 *   nights.row: 'played' | 'saved' | 'missed' | 'tonight' ('tonight' only
 *     while tonight has no play yet).
 *   glovebox: only items held; readyAt is a passive item's cooldown end (ms).
 *   titles.earned[].at: when it was earned — null for one a member had
 *     qualified for before R3 and hasn't played since (granted on their
 *     next play, silently).
 *   titles.next: up to 3 unearned titles, closest first.
 */
export function getPlayerCardExtras(guildId, userId, { now = Date.now() } = {}) {
  const data = loadScores(guildId);
  const user = data.users[userId] || null;

  const current = liveNights(user, now);
  const progress = PRIZES.map(p => ({
    key: p.key,
    game: p.game,
    icon: p.item ? ITEMS[p.item].kit : 'gift',
    label: p.label,
    have: user?.progress?.[p.key] || 0,
    need: p.need,
    prize: prizeOf(p),
    waiting: !!user?.waiting?.[p.key],
  }));
  progress.push({
    key: 'nights',
    game: null,
    icon: ITEMS.nlight.kit,
    label: 'Nights in a row',
    have: current,
    need: nextNightLightAt(current),
    prize: { item: 'nlight', name: ITEMS.nlight.name, icon: ITEMS.nlight.kit, points: 0 },
    waiting: false,
  });

  const tier = nightTier(current);
  const next = nextNightTier(current);
  const nights = {
    current,
    best: user?.nights?.best || 0,
    tier: tier ? { key: tier.key, name: tier.name, emoji: tier.emoji } : null,
    next: next ? { at: next.at, name: next.name } : null,
    row: nightRow(user, now),
  };

  const box = user?.glovebox || {};
  const glovebox = Object.entries(ITEMS)
    .filter(([key]) => (box[key] || 0) > 0)
    .map(([key, item]) => {
      let readyAt = null;
      if (key === 'nlight') {
        // Held, but it can't burn again until a week after the last one did
        const used = user?.nights?.lightUsedAt;
        if (used && used + NIGHT_LIGHT_DAYS * DAY > now) readyAt = used + NIGHT_LIGHT_DAYS * DAY;
      } else if (item.passive && (user?.cooldowns?.[key] || 0) > now) {
        readyAt = user.cooldowns[key];
      }
      return { item: key, name: item.name, icon: item.kit, count: box[key], cap: item.cap, passive: item.passive, about: item.about, readyAt };
    });

  const earned = earnedTitles(user);
  const titles = {
    shown: shownTitleOf(user),
    earned: TITLES.filter(t => Object.hasOwn(earned, t.key)).map(t => ({ ...titleCard(t), at: earned[t.key] })),
    next: TITLES
      .filter(t => !Object.hasOwn(earned, t.key))
      .map(t => ({ ...titleCard(t), have: Math.min(titleProgress(user, t), t.need), need: t.need }))
      // Closest first by the share still to go; ties keep the table's order
      .sort((a, b) => b.have / b.need - a.have / a.need)
      .slice(0, 3),
  };

  return { progress, nights, glovebox, titles };
}

/**
 * The `/scoreboard title:` autocomplete: the titles this member has
 * earned (narrowed by what's typed), then "No title".
 * @returns {Array<{name: string, value: string}>} at most 25
 */
export function titleChoices(guildId, userId, typed = '') {
  const earned = earnedTitles(loadScores(guildId).users[userId]);
  const q = String(typed || '').toLowerCase();
  const mine = TITLES
    .filter(t => Object.hasOwn(earned, t.key))
    .filter(t => !q || t.title.toLowerCase().includes(q) || t.key.includes(q))
    .map(t => ({ name: `${t.badge} ${t.title}`, value: t.key }));
  return [...mine.slice(0, 24), { name: NO_TITLE_CHOICE, value: 'none' }];
}

/**
 * What the rewards say (R3): the `-#` lines under a play's points line,
 * the private refusals for the `item:` and `title:` options, and their
 * autocomplete placeholders. The numbers are in gameRewards.js; the lines
 * read them, so turning a tunable never leaves a sentence saying the old
 * number.
 *
 * Names here are display names, never mentions: the play's own line has
 * already pinged whoever it should (gamePlay.js), and these are subtext.
 */

import { ITEMS, ITEM_EFFECTS, DAILY, DEFENCES, FULL_STACK_POINTS, TITLE_POINTS } from './gameRewards.js';

/** "🥧 Golden Pie"; a key that isn't an item (typed, not picked) as typed */
export const itemLabel = (key) => (Object.hasOwn(ITEMS, key) ? `${ITEMS[key].emoji} ${ITEMS[key].name}` : String(key));

/** The command a play is, for "doesn't work with /doom fate" */
const COMMAND = { foodfight: '/foodfight', doom: '/doom', rescue: '/rescue', potion: '/potion' };
const playName = (game, action) => `${COMMAND[game] || `/${game}`}${action ? ` ${action}` : ''}`;

// ── refusals (private, before any cooldown is spent) ────────────────────

export const ITEM_REFUSALS = {
  unknown: () => '🧰 That isn\'t an item. Pick one from the list.',
  missing: (key) => `🧰 You don't have a ${itemLabel(key)} in your Glovebox.`,
  unfit: (key, { game, action }) => {
    const item = ITEMS[key];
    if (item?.passive) return `🧰 ${itemLabel(key)} works by itself: there's no need to pick it.`;
    if (item?.game === 'siege') return `🧰 ${itemLabel(key)} is only for fighting a monster.`;
    return `🧰 ${itemLabel(key)} doesn't work with ${playName(game, action)}.`;
  },
  limit: () => `🧰 You've used ${DAILY.itemUses} items today, the most there is. They work again tomorrow (UTC).`,
};

/** Autocomplete placeholders: picking one plays with no item */
export const ITEM_PLACEHOLDERS = {
  none: '🧰 Nothing in your Glovebox for this play',
  limit: `🧰 ${DAILY.itemUses} items used today: they work again tomorrow (UTC)`,
};

/** "🥧 Golden Pie ×2 · can't miss, points ×2" (≤ 100 characters) */
export const itemChoiceName = (key, count, action) =>
  `${itemLabel(key)} ×${count} · ${ITEM_EFFECTS[key]?.[action]?.short || ITEMS[key]?.about || ''}`.slice(0, 100);

export const TITLE_REFUSALS = {
  notYours: '📜 You can only pick the title on your own card.',
  unknown: '📜 That isn\'t a title. Pick one from the list.',
  notEarned: '📜 You haven\'t earned that title yet. Your card shows the ones you\'re closest to.',
};

export const NO_TITLE_CHOICE = '🚫 No title';

// ── under the points line ───────────────────────────────────────────────

/** An item that was used: what it did */
export const ITEM_USED = {
  gpie: {
    throw: (n) => `🥧 Golden Pie: a sure hit, and ${n.actor}'s points ×2.`,
    feed: (n) => `🥧 Golden Pie: sure to be tasty. ${n.actor} +2 more${n.target ? `, ${n.target} +2 more` : ''}.`,
  },
  vhs: {
    fate: (n) => `📼 Cursed VHS: no backfire, and ${n.actor}'s points ×2.`,
  },
  holyw: {
    attempt: (n, r) => `💧 Holy Water: no getting caught, and ${n.actor} +2 more${r.shieldedUntil ? '. The shield lasts 3× as long' : ''}.`,
  },
  penny: {
    give: (n) => `🍀 Lucky Penny: the potion works, and ${n.actor}'s points ×2.`,
  },
};

/** An item that was asked for and NOT used, by why */
export const ITEM_KEPT = {
  capped: (key, n) => `${itemLabel(key)} stayed in ${n.actor}'s Glovebox: plays past today's scoring cap don't use items.`,
  // Two plays raced for the last one, and this one lost
  missing: (key, n) => `${n.actor}'s ${itemLabel(key)} was already used up, so this play went ahead without it.`,
  limit: (key, n) => `${itemLabel(key)} stayed in ${n.actor}'s Glovebox: that's ${DAILY.itemUses} items today already.`,
  unfit: (key, n) => `${itemLabel(key)} doesn't work here, so it stayed in ${n.actor}'s Glovebox.`,
};

export const SHIELD_BROKEN = (n) => `📼 The Cursed VHS tore through ${n.target}'s shield. The shield is gone.`;

/** A passive defence that fired for the target */
export const DEFENCE_LINES = {
  garlic: (n) => `🧄 ${n.target}'s Garlic turned the doom into an escape. It's used up, and another can't work for ${DEFENCES.garlic.cooldownHours} h.`,
  antid: (n) => `💊 ${n.target}'s Antidote: no harm done, and ${n.actor} gets less for it. It's used up, and another can't work for ${DEFENCES.antid.cooldownHours} h.`,
};

/**
 * A recurring prize.
 * @param {object} r - { who, prize, item, points, overflow }
 */
export function prizeLine({ who, prize, item, points, overflow }) {
  const reached = `🎁 ${prize.need} ${prize.noun}!`;
  const plus = points ? ` and +${points}` : '';
  if (overflow) {
    return `${reached} ${who} gets +${FULL_STACK_POINTS} instead of a ${itemLabel(item)} (the Glovebox holds ${ITEMS[item].cap})${plus}.`;
  }
  if (!prize.item) return `${reached} A random item for ${who}: a ${itemLabel(item)}.`;
  return `${reached} ${who} gets a ${itemLabel(item)}${plus}.`;
}

/** A prize the daily cap held back: the counter waits at need − 1 */
export const prizeHeldLine = ({ who, prize }) =>
  `🎁 ${prize.label} ${prize.need - 1}/${prize.need} · the prize counter's full tonight (${DAILY.prizes} a day). ${who}'s next one tomorrow (UTC) brings it.`;

export const titleLine = ({ who, title }) =>
  `📜 ${who} earned a title: ${title.badge} ${title.title} (+${TITLE_POINTS}). Show it with /scoreboard title:`;

export const NIGHT_LINES = {
  light: ({ who, current, overflow }) => (overflow
    ? `🔦 ${current} nights in a row! ${who} already has a Night Light, so +${FULL_STACK_POINTS} instead.`
    : `🔦 ${current} nights in a row! A Night Light for ${who}'s Glovebox: it saves the row if a night is missed.`),
  saved: ({ who, current }) => `🔦 ${who}'s Night Light saved the night they missed: ${current} nights in a row.`,
  tier: ({ who, current, tier }) =>
    `${tier.emoji} ${current} nights in a row: ${who} is a ${tier.name} now, +1 on the first ${tier.buffs} good plays each day.`,
  buff: ({ tier, used }) => `${tier.emoji} ${tier.name}: +1 (${used} of ${tier.buffs} today)`,
};

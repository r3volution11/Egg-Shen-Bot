/**
 * The emoji kit: the small pixel-art icons that make a card look like
 * DarcyBot's (icons beside headings, progress bars built from emoji pieces,
 * rows of streak ticks), with a plain-emoji fallback for every one.
 *
 * The art is uploaded as the bot's own *application emojis*, which work in
 * every server without Use External Emojis (Discord docs). Every operator's
 * bot uploads its own copy on first start (emojiSync.js, R2), so until that
 * finishes — or on an install where it's switched off — everything falls
 * back to plain emoji, and every card still reads correctly.
 *
 * Readiness goes by *family* (bars, ticks, icons): a family is drawn with
 * custom emoji only when every one of its codes is uploaded. A bar must
 * never mix a custom left cap with plain squares, and one failed icon
 * upload mustn't drop the bars back to plain.
 *
 * Every graphic carries its number in text beside it (`07/10`, `82%`):
 * screen readers read a custom emoji by its name, and the fallback has to
 * stand on its own.
 *
 * Renderers take `{ kit }` (default: liveKit()), so tests can render the
 * same card with a fake registry and in fallback.
 */

/** The longest markup one kit emoji can be: <:es_xxxxxx_xxxx:19-digit id> */
export const MAX_EMOJI_MARKUP = 37;

const BAR_COLOURS = { green: 'g', orange: 'o', gold: 'y', blue: 'b', purple: 'p', grey: 's' };
/** Plain squares for each bar colour (a muted bar keeps its colour) */
const SQUARE = { g: '🟩', o: '🟧', y: '🟨', b: '🟦', p: '🟪', s: '⬜', e: '⬜' };

function barCodes() {
  const codes = {};
  for (const c of [...Object.values(BAR_COLOURS), 'e']) {
    for (const part of ['l', 'm', 'r']) {
      codes[`b${c}${part}`] = { family: 'bar', fallback: SQUARE[c], label: `bar ${c}${part}` };
    }
  }
  return codes;
}

const icon = (fallback, label) => ({ family: 'icon', fallback, label });
const tick = (fallback, label) => ({ family: 'tick', fallback, label });

/**
 * Every code in the kit. Codes are 1–6 lowercase letters/digits: the
 * uploaded name is `es_<code>_<hash>`, ≤ 14 characters, so a custom emoji
 * is never more than MAX_EMOJI_MARKUP characters of message text.
 */
export const KIT_CODES = Object.freeze({
  ...barCodes(),
  // Ticks: a generic done/not-yet, and a night's state on the nights row
  tk1: tick('✅', 'done'), tk0: tick('⬜', 'not yet'),
  ntp: tick('🌕', 'played'), nts: tick('🔦', 'saved by a night light'),
  ntm: tick('🌑', 'missed'), ntt: tick('🌗', 'tonight'),
  // Stats
  coin: icon('🪙', 'points'), flame: icon('🔥', 'streak'), moon: icon('🌙', 'nights'),
  shield: icon('🛡️', 'shield'), clock: icon('⏰', 'time'), star: icon('⭐', 'star'),
  chart: icon('📊', 'stats'), people: icon('👥', 'players'),
  // Ranks
  med1: icon('🥇', 'first'), med2: icon('🥈', 'second'), med3: icon('🥉', 'third'),
  trophy: icon('🏆', 'trophy'), crown: icon('👑', 'leader'),
  // Votes
  ballot: icon('🗳️', 'votes'), vs: icon('⚔️', 'versus'), lock: icon('🔒', 'closed'),
  tie: icon('🤝', 'tie'), upset: icon('🚨', 'upset'), dice: icon('🎲', 'random'),
  // Games (keyed by GAME_KIT below)
  potion: icon('🧪', 'potions'), food: icon('🥧', 'food fight'), doom: icon('🪓', 'doom'),
  rescue: icon('🛟', 'rescue'), siege: icon('👹', 'siege'),
  // Glovebox items
  gpie: icon('🥧', 'golden pie'), vhs: icon('📼', 'cursed vhs'), garlic: icon('🧄', 'garlic'),
  holyw: icon('💧', 'holy water'), penny: icon('🍀', 'lucky penny'), antid: icon('💊', 'antidote'),
  silver: icon('🥈', 'silver bullet'), nlight: icon('🔦', 'night light'),
  // Card sections
  gift: icon('🎁', 'rewards'), glove: icon('🧰', 'glovebox'), scroll: icon('📜', 'titles'),
  effect: icon('🌀', 'effects'),
  // Escape Velocity
  rocket: icon('🚀', 'rocket'),
});

/** Each game's kit code ('foodfight' is too long to be a code) */
export const GAME_KIT = Object.freeze({ potion: 'potion', foodfight: 'food', doom: 'doom', rescue: 'rescue', siege: 'siege' });

export const FAMILIES = ['bar', 'tick', 'icon'];

/** A number as people read it: 1,234 and a real minus sign */
export function formatNumber(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return String(n);
  const s = Math.abs(n).toLocaleString('en-US');
  return n < 0 ? `−${s}` : s;
}

/** A value as a code-span "pill": `1,234`. Backticks inside are swapped out. */
export function pill(value) {
  const text = typeof value === 'number' ? formatNumber(value) : String(value);
  return `\`${text.replace(/`/g, 'ˋ')}\``;
}

/** Progress as a pill, zero-padded to the target's width: `07/10` */
export function progressPill(have, need) {
  const width = String(need).length;
  return pill(`${String(Math.max(0, have)).padStart(width, '0')}/${need}`);
}

/**
 * How many of `width` segments to fill. Any progress shows at least one;
 * nothing looks complete until it is.
 */
export function filledSegments(value, max, width) {
  if (!(value > 0) || !(max > 0)) return 0;
  if (value >= max) return width;
  return Math.min(width - 1, Math.max(1, Math.round((value / max) * width)));
}

/**
 * A kit for a registry of uploaded emojis.
 * @param {Map<string, {id: string, name: string}> | null} resolved - code → uploaded emoji; null = all fallback
 */
export function createKit(resolved = null) {
  const ready = {};
  for (const family of FAMILIES) {
    const codes = Object.keys(KIT_CODES).filter(c => KIT_CODES[c].family === family);
    ready[family] = !!resolved && codes.every(c => resolved.has(c));
  }

  /** One kit emoji: its custom markup if its family is ready, else the fallback */
  const e = (code) => {
    const entry = KIT_CODES[code];
    if (!entry) throw new Error(`Unknown kit code "${code}"`);
    if (!ready[entry.family]) return entry.fallback;
    const { id, name } = resolved.get(code);
    return `<:${name}:${id}>`;
  };

  /** A game's icon */
  const game = (g) => e(GAME_KIT[g] || g);

  /** Segment codes for a run of colours, with caps at either end */
  const segments = (colours) => colours.map((c, i) => {
    const part = i === 0 ? 'l' : i === colours.length - 1 ? 'r' : 'm';
    return `b${c}${part}`;
  });

  /**
   * A progress bar. In fallback it's coloured squares (the look the
   * tournament bars already have), or ▰▱ with `style: 'blocks'` where a
   * row of big squares would crowd the text.
   */
  const bar = (value, max, { width = 10, colour = 'green', muted = false, style = 'squares' } = {}) => {
    const c = muted ? 's' : (BAR_COLOURS[colour] || 'g');
    const filled = filledSegments(value, max, width);
    const colours = Array.from({ length: width }, (_, i) => (i < filled ? c : 'e'));
    if (ready.bar && width >= 2) return segments(colours).map(e).join('');
    if (style === 'blocks') return '▰'.repeat(filled) + '▱'.repeat(width - filled);
    return colours.map(x => SQUARE[x]).join('');
  };

  /**
   * Two sides of one bar: a's share from the left, b's from the right.
   * The leader is green, the trailer orange; a tie is gold on both sides.
   */
  const splitBar = (a, b, { width = 10 } = {}) => {
    const total = a + b;
    if (!(total > 0)) return bar(0, 1, { width });
    const left = Math.round((a / total) * width);
    const [ca, cb] = a === b ? ['y', 'y'] : a > b ? ['g', 'o'] : ['o', 'g'];
    const colours = Array.from({ length: width }, (_, i) => (i < left ? ca : cb));
    if (ready.bar && width >= 2) return segments(colours).map(e).join('');
    return colours.map(x => SQUARE[x]).join('');
  };

  /**
   * A row of ticks from states: 'done' | 'todo' | 'played' | 'saved' |
   * 'missed' | 'tonight'. Wrapped every `perRow` so it never wraps on a phone.
   */
  const TICK_CODE = { done: 'tk1', todo: 'tk0', played: 'ntp', saved: 'nts', missed: 'ntm', tonight: 'ntt' };
  const ticks = (states, { perRow = 7 } = {}) => {
    const marks = states.map(s => e(TICK_CODE[s] || 'tk0'));
    const rows = [];
    for (let i = 0; i < marks.length; i += perRow) rows.push(marks.slice(i, i + perRow).join(''));
    return rows.join('\n');
  };

  /**
   * Escape's 15-stage ladder: groups of stages, each its own capped bar.
   * Fallback is ▰▱ in a code span, as it has always been: the blocks only
   * line up in monospace. Custom bars must NOT be in a code span (custom
   * emoji don't render inside one), so the kit owns the formatting.
   */
  const ladder = (cleared, { groups = [5, 5, 5], colour = 'blue' } = {}) => {
    let left = cleared;
    const parts = groups.map(size => {
      const n = Math.max(0, Math.min(size, left));
      left -= size;
      if (ready.bar) return bar(n, size, { width: size, colour });
      return '▰'.repeat(n) + '▱'.repeat(size - n);
    });
    return ready.bar ? parts.join(' ') : `\`${parts.join(' ')}\``;
  };

  return { ready, e, game, bar, splitBar, ticks, ladder };
}

let live = createKit(null);

/** The kit in use right now: fallback until the uploaded emojis are known */
export function liveKit() {
  return live;
}

/** Swap in a registry of uploaded emojis (emojiSync on startup, and tests) */
export function setLiveRegistry(resolved) {
  live = createKit(resolved);
  return live;
}

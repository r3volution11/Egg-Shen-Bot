/**
 * The Big Trouble in Little China words (src/data/btilcLines.js) are a
 * contract with the engine, which reads these fields blind. A missing line
 * only shows up as `undefined` in a live channel, a typo'd placeholder as a
 * raw "{foo}", and a line that conjugates a verb on {monster} reads wrong
 * against Gremlins. So this pins every export's shape and counts, exactly
 * which placeholders may appear in which field, and the voice the file's
 * header promises: PG-13, no mentions, and the film's Chinese characters and
 * culture written as its heroes, never as a caricature.
 */

import * as BTILC from '../src/data/btilcLines.js';
import { MONSTER_KEYS } from '../src/data/siegeMonsters.js';

const {
  ELEMENT_KEYS, ELEMENTS, MAGIC_ATTACK_LINES, SIEGE_MAGIC, MONSTER_ELEMENT_ABOUT,
  SIX_DEMON_BAG, PORK_CHOP_EXPRESS, SIDEKICK, HONOURS, BOSS_KEYS, BOSSES, BOSS_SHARED,
  HAPPENINGS_BTILC, TWISTS_BTILC, ITEMS_BTILC, TITLES_BTILC, TITLE_ABOUT_UPDATES, fill,
} = BTILC;

/** Every data export, by name (the paths below start with these names) */
const DATA = {
  ELEMENT_KEYS, ELEMENTS, MAGIC_ATTACK_LINES, SIEGE_MAGIC, MONSTER_ELEMENT_ABOUT,
  SIX_DEMON_BAG, PORK_CHOP_EXPRESS, SIDEKICK, HONOURS, BOSS_KEYS, BOSSES, BOSS_SHARED,
  HAPPENINGS_BTILC, TWISTS_BTILC, ITEMS_BTILC, TITLES_BTILC, TITLE_ABOUT_UPDATES,
};

/** Every string in a value, flat, with its dotted path ("ELEMENTS.fire.bless.0") */
function flatten(value, path, out = []) {
  if (typeof value === 'string') out.push({ path, text: value });
  else if (Array.isArray(value)) value.forEach((v, i) => flatten(v, `${path}.${i}`, out));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) flatten(v, `${path}.${k}`, out);
  return out;
}
const EVERY = Object.entries(DATA).flatMap(([name, value]) => flatten(value, name));
const placeholdersIn = (text) => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
const count = (text, needle) => text.split(needle).length - 1;
const fail = (bad) => expect(bad).toEqual([]);

const MAX_LINE = 220;
const MAX_MONSTER_LINE = 200; // siegeMonsters.js' cap: boss lines merge into MONSTERS
const PICTO = /^\p{Extended_Pictographic}/u;

// ── which placeholders may appear where ─────────────────────────────────
// First match wins. A string no rule matches may have NO placeholders, so a
// field added without a rule here can't smuggle one in. `required` defaults
// to every allowed one.
const R = (re, allowed, required = allowed) => ({ re, allowed, required });
const RULES = [
  // the six elements
  R(/^ELEMENTS\.\w+\.(bless|hex|boost)\.\d+$/, ['caster', 'target']),
  R(/^ELEMENTS\.\w+\.cancel\.(lift|spoil)\.\d+$/, ['caster', 'target', 'charm']),
  R(/^ELEMENTS\.fire\.used\.(bless|hex)$/, ['user', 'points', 'left'], ['user', 'points']),
  R(/^ELEMENTS\.\w+\.used\.(bless|hex)$/, ['user', 'left'], ['user']),
  R(/^ELEMENTS\.\w+\.siege\.\w+\.\d+$/, ['user', 'monster']),
  R(/^MAGIC_ATTACK_LINES\.\d+\.text$/, ['user', 'monster', 'element']),
  R(/^SIEGE_MAGIC\.refusals\.noChi$/, ['chi', 'need']),
  R(/^SIEGE_MAGIC\.foe\.down$/, ['foe']),
  // /six-demon-bag
  R(/^SIX_DEMON_BAG\.cast\.\d+$/, ['caster']),
  R(/^SIX_DEMON_BAG\.peace\.(on|off)\.\d+$/, ['user']),
  R(/^SIX_DEMON_BAG\.peace\.lifted$/, ['user', 'charm']),
  R(/^SIX_DEMON_BAG\.peace\.tooSoon$/, ['when']),
  R(/^SIX_DEMON_BAG\.shrug\.(free\.\d+|broke)$/, ['user']),
  R(/^SIX_DEMON_BAG\.shrug\.paid\.\d+$/, ['user', 'chi']),
  R(/^SIX_DEMON_BAG\.expired\.(bless|hex)$/, ['user', 'charm']),
  R(/^SIX_DEMON_BAG\.paidOff$/, ['caster', 'charm', 'points']),
  R(/^SIX_DEMON_BAG\.washed$/, ['target', 'statuses']),
  R(/^SIX_DEMON_BAG\.boostCure\.\d+$/, ['caster', 'target']),
  R(/^SIX_DEMON_BAG\.refusals\.noChi$/, ['chi', 'need']),
  R(/^SIX_DEMON_BAG\.refusals\.castLimit$/, ['count']),
  R(/^SIX_DEMON_BAG\.refusals\.(alreadyBlessed|alreadyHexed|alreadyBoosted|peaceTarget|fighting|inactive)$/, ['target']),
  R(/^SIX_DEMON_BAG\.refusals\.(warded|pairLimit)$/, ['target', 'when']),
  R(/^SIX_DEMON_BAG\.refusals\.receivedLimit$/, ['target', 'count']),
  // /pork-chop-express
  R(/^PORK_CHOP_EXPRESS\.send\.\d+$/, ['sender', 'receiver', 'item', 'when']),
  R(/^PORK_CHOP_EXPRESS\.onTheRoad\.\d+$/, ['item', 'receiver', 'when']),
  R(/^PORK_CHOP_EXPRESS\.(delivered\.\d+|quiet|returned\.\d+)$/, ['sender', 'receiver', 'item']),
  R(/^PORK_CHOP_EXPRESS\.returnedPoints$/, ['sender', 'receiver', 'item', 'points']),
  R(/^PORK_CHOP_EXPRESS\.paidOff\.\d+$/, ['sender', 'item', 'points']),
  R(/^PORK_CHOP_EXPRESS\.refusals\.(notHeld|regift)$/, ['item']),
  R(/^PORK_CHOP_EXPRESS\.refusals\.receiverWeek$/, ['receiver', 'count']),
  R(/^PORK_CHOP_EXPRESS\.refusals\.pair$/, ['receiver', 'when']),
  R(/^PORK_CHOP_EXPRESS\.refusals\.noRoom$/, ['receiver', 'item']),
  R(/^PORK_CHOP_EXPRESS\.refusals\.newReceiver$/, ['receiver']),
  // /sidekick
  R(/^SIDEKICK\.((ask|accepted|declined|expired)\.\d+|ended\.\w+\.\d+|heroSaved)$/, ['sidekick', 'hero']),
  R(/^SIDEKICK\.swagger\.\d+$/, ['hero', 'points']),
  R(/^SIDEKICK\.cut\.\d+$/, ['sidekick', 'hero', 'points'], ['sidekick', 'points']),
  R(/^SIDEKICK\.cutHelp\.\d+$/, ['sidekick', 'hero', 'points']),
  R(/^SIDEKICK\.cutFull$/, ['sidekick']),
  R(/^SIDEKICK\.card\.sidekick$/, ['hero']),
  R(/^SIDEKICK\.card\.hero$/, ['sidekick']),
  R(/^SIDEKICK\.refusals\.(heroBusy|askedTonight|pending|inactive|notYours)$/, ['hero']),
  R(/^SIDEKICK\.refusals\.heroWeek$/, ['hero', 'count']),
  R(/^SIDEKICK\.refusals\.(pair|declined)$/, ['hero', 'when']),
  R(/^SIDEKICK\.refusals\.week$/, ['count', 'when']),
  R(/^SIDEKICK\.refusals\.askLimit$/, ['count']),
  // honours and backing
  R(/^HONOURS\.(wangChi|wangChiHeld|both)\.\d+$/, ['mvp']),
  R(/^HONOURS\.jackBurton\.\d+$/, ['jack', 'mvp'], ['jack']),
  R(/^HONOURS\.backing\.(placed|push|lost|escaped|refunded)\.\d+$/, ['backer', 'fighter', 'stake']),
  R(/^HONOURS\.backing\.wangChi\.\d+$/, ['backer', 'fighter', 'stake', 'gain', 'bonus']),
  // A second backer of the same Wang Chi: no {bonus} (the fighter's is once a siege)
  R(/^HONOURS\.backing\.wangChiToo$/, ['backer', 'fighter', 'stake', 'gain']),
  R(/^HONOURS\.backing\.madeYouLook$/, ['fighter', 'backer', 'bonus']),
  R(/^HONOURS\.backing\.refusals\.notFighter$/, ['fighter']),
  R(/^HONOURS\.backing\.refusals\.poor$/, ['stake', 'count']),
  // bosses
  R(/^BOSSES\.\w+\.lines\.defeat$/, ['mvp', 'jack']),
  R(/^BOSSES\.\w+\.lines\.(grab|poison)\.\d+$/, ['fighter', 'monster'], ['fighter']),
  R(/^BOSSES\.\w+\.lines\.(roar|roarFlesh|feral)\.\d+$/, ['monster']),
  R(/^BOSSES\.(guardian\.lines\.gaze|lopan\.lines\.beams)\.\d+$/, ['monster', 'fighters']),
  R(/^BOSSES\.guardian\.lines\.hidden\.\d+$/, ['monster', 'fighter']),
  R(/^BOSSES\.guardian\.card$/, ['count']),
  R(/^BOSSES\.storms\.storms\.\w+\.fall\.\d+$/, ['fighter'], []),
  R(/^BOSSES\.storms\.storms\.rain\.duel\.\d+$/, ['fighter']),
  R(/^BOSSES\.storms\.storms\.lightning\.chain\.\d+$/, ['fighters']),
  R(/^BOSSES\.lopan\.lines\.(bride|wedding)\.\d+$/, ['monster', 'fighter']),
  R(/^BOSSES\.lopan\.lines\.brideClock$/, ['fighter', 'when']),
  R(/^BOSSES\.lopan\.lines\.brideFreed\.\d+$/, ['fighter']),
  R(/^BOSSES\.lopan\.lines\.phaseChange\.\d+$/, ['monster'], []),
  R(/^BOSSES\.lopan\.lines\.foodJack\.\d+$/, ['jack']),
  R(/^BOSSES\.lopan\.guards\.\w+\.(arrive|soak)\.\d+$/, ['monster']),
  R(/^BOSSES\.lopan\.guards\.\w+\.down\.\d+$/, ['monster', 'fighter'], ['monster']),
  R(/^BOSS_SHARED\.crew\.\d+$/, ['count']),
  // happenings, twists, items
  R(/^HAPPENINGS_BTILC\.upsideDown\.flipped$/, ['target', 'points']),
  R(/^HAPPENINGS_BTILC\.tourBus\.chi$/, ['user']),
  R(/^TWISTS_BTILC\.\w+\.lines\.\d+$/, ['user']),
  R(/^TWISTS_BTILC\.redEnvelope\.effect$/, ['user', 'chi']),
  R(/^TWISTS_BTILC\.chingDai\.effect$/, ['user', 'charm']),
  R(/^ITEMS_BTILC\.blackBlood\.used\.\d+$/, ['user', 'when']),
  R(/^ITEMS_BTILC\.blackBlood\.cured$/, ['user']),
  R(/^ITEMS_BTILC\.blackBlood\.spared$/, ['user', 'monster']),
  R(/^ITEMS_BTILC\.jadeCharm\.fired\.\d+$/, ['caster', 'target']),
];
const ruleFor = (path) => RULES.find(r => r.re.test(path));

/** Lines used against ANY monster: {monster} may be plural ("Gremlins") */
const GENERIC_MONSTER = /^(ELEMENTS\.\w+\.siege\.|MAGIC_ATTACK_LINES\.\d+\.text$|ITEMS_BTILC\.blackBlood\.spared$)/;
/** Lines whose {user}/{monster}/{element} must each appear exactly once (siegeAttackLines.js' rule) */
const EXACTLY_ONCE = /^(ELEMENTS\.\w+\.siege\.|MAGIC_ATTACK_LINES\.\d+\.text$)/;

// Same list as tests/siege-monsters.test.js: strong swearing, slurs and
// sexual terms. PG-13 horror-comedy; "damn" and cartoon gore are fine.
// Whole words only, so "class" and "Scunthorpe" never trip it.
const BANNED = [
  'fuck', 'fucking', 'cunt', 'nigger', 'faggot', 'fag', 'retard', 'retarded',
  'rape', 'raped', 'whore', 'slut', 'porn', 'sex', 'sexy', 'nazi', 'cock', 'dick', 'pussy',
];
const bannedRe = new RegExp(`\\b(${BANNED.join('|')})\\b`, 'i');

// Anti-Asian slurs, "accent" spellings and stock caricatures. The film's
// Chinese characters are its heroes, wit and magic; nothing here mocks how
// anyone talks or looks. Not exhaustive (no list is), but it names the
// common ones so a careless line fails loudly.
const STEREOTYPES = [
  /\bvelly\b/i, /\bsolly\b/i, /\bah[\s,-]+so\b/i, /\bflied\s+lice\b/i, /\bching[\s-]*chong\b/i,
  /\bchinam[ae]n\b/i, /\bchinks?\b/i, /\bgooks?\b/i, /\bjaps?\b/i, /\borientals?\b/i,
  /\bslant(?:y|ed|-eyed)?\b/i, /\bslitty\b/i, /\byellow\s+peril\b/i, /\bdragon\s+lady\b/i, /\bcoolies?\b/i,
  /\bchop[\s-]+chop\b/i, /\btickee\b/i, /\bwashee\b/i, /\bme\s+love\s+you\s+long\s+time\b/i,
  /\bconfucius\s+say\b/i, /\bnumber\s+one\s+son\b/i, /\bherro\b/i, /\brotsa\b/i, /\bruck\b/i,
  /\bengrish\b/i, /\bancient\s+chinese\s+secret\b/i, /\bme\s+chinese\b/i, /\bfu\s+manchu\b/i,
];
const stereotype = (text) => STEREOTYPES.find(re => re.test(text));

// ── every string ────────────────────────────────────────────────────────

describe('btilc lines: every string', () => {
  test('uses only the placeholders its field allows, and all it requires', () => {
    const bad = [];
    for (const { path, text } of EVERY) {
      const rule = ruleFor(path);
      const used = placeholdersIn(text);
      const allowed = rule ? rule.allowed : [];
      for (const name of used) if (!allowed.includes(name)) bad.push(`${path}: {${name}} not allowed`);
      for (const name of rule?.required || []) if (!used.includes(name)) bad.push(`${path}: missing {${name}}`);
    }
    fail(bad);
  });

  test('every placeholder rule matches something (no rule names a path that isn\'t there)', () => {
    fail(RULES.filter(r => !EVERY.some(({ path }) => r.re.test(path))).map(r => String(r.re)));
  });

  test('has no stray brace outside a whole placeholder', () => {
    fail(EVERY.filter(({ text }) => /[{}]/.test(text.replace(/\{\w+\}/g, ''))).map(l => l.path));
  });

  test('siege attack and effect lines name {user}, {monster} and {element} exactly once each', () => {
    const bad = [];
    for (const { path, text } of EVERY.filter(l => EXACTLY_ONCE.test(l.path))) {
      for (const name of placeholdersIn(text)) if (count(text, `{${name}}`) !== 1) bad.push(`${path}: {${name}} ×${count(text, `{${name}}`)}`);
    }
    fail(bad);
  });

  test('lines for any monster read right for a plural name (Gremlins, Killer Klowns)', () => {
    // "the **The Blob**", "**Gremlins**'s", "a **Killer Klowns**", and a verb
    // conjugated on it ("Gremlins is", "Gremlins takes") all read wrong.
    // Words ending in -s after {monster} that aren't verbs on it
    const OK_AFTER = ['across', 'as', 'towards', 'plus', 'sideways', 'always'];
    const bad = [];
    for (const { path, text } of EVERY.filter(l => GENERIC_MONSTER.test(l.path))) {
      if (/\b(?:the|a|an)\s+\{monster\}/i.test(text)) bad.push(`${path}: article before {monster}`);
      if (/\{monster\}'s/.test(text)) bad.push(`${path}: {monster}'s`);
      const next = text.match(/\{monster\}\s+([a-z']+)/i)?.[1]?.toLowerCase();
      if (next && /^(is|was|has|does|are|were|have|do|isn't|wasn't|hasn't|doesn't|aren't|weren't|haven't|don't)$/.test(next)) bad.push(`${path}: "{monster} ${next}"`);
      if (next && /s$/.test(next) && !OK_AFTER.includes(next)) bad.push(`${path}: "{monster} ${next}" (a verb on {monster}?)`);
    }
    fail(bad);
  });

  test('{element} never starts a sentence (its phrases are lowercase)', () => {
    fail(EVERY.filter(({ text }) => /(?:^\S*\s*|[.!?]["”]?\s+)\{element\}/u.test(text)).map(l => l.path));
  });

  test(`is non-empty, trimmed, single-spaced, and at most ${MAX_LINE} characters`, () => {
    const bad = [];
    for (const { path, text } of EVERY) {
      if (text.trim() === '' || text !== text.trim() || /\s{2,}/.test(text)) bad.push(`${path}: whitespace`);
      if (text.length > MAX_LINE) bad.push(`${path}: ${text.length} characters`);
    }
    fail(bad);
  });

  test(`boss lines stay within siegeMonsters.js' ${MAX_MONSTER_LINE}-character cap`, () => {
    fail(EVERY.filter(l => /^BOSSES\.\w+\.lines\./.test(l.path) && l.text.length > MAX_MONSTER_LINE).map(l => `${l.path}: ${l.text.length}`));
  });

  test('quotes are balanced', () => {
    fail(EVERY.filter(({ text }) => count(text, '"') % 2 !== 0).map(l => l.path));
  });

  test('has no duplicate lines, across every export', () => {
    // Short strings (names, emoji, labels) repeat on purpose: Thunder is an
    // element AND a storm. Lines don't.
    const seen = new Map();
    const dupes = [];
    for (const { path, text } of EVERY.filter(l => l.text.length >= 25)) {
      const norm = text.trim().toLowerCase();
      if (seen.has(norm)) dupes.push(`${path} duplicates ${seen.get(norm)}`);
      else seen.set(norm, path);
    }
    fail(dupes);
  });

  test('mentions nobody: no @ and no raw mention syntax', () => {
    fail(EVERY.filter(({ text }) => text.includes('@') || /<[@#&]/.test(text)).map(l => l.path));
  });

  test('keeps to the PG-13 tone: no banned words', () => {
    fail(EVERY.filter(({ text }) => bannedRe.test(text)).map(l => `${l.path}: ${text.match(bannedRe)[0]}`));
  });

  test('no slurs, "accent" spellings or stock caricatures', () => {
    fail(EVERY.filter(({ text }) => stereotype(text)).map(l => `${l.path}: ${stereotype(l.text)}`));
  });

  test('the word checks themselves can fail', () => {
    expect(bannedRe.test('well that is fucking great')).toBe(true);
    expect(bannedRe.test('a classic Scunthorpe assassin')).toBe(false);
    for (const caricature of ['velly good', 'Ah so!', 'chop chop', 'an Oriental mystic', 'rotsa ruck']) {
      expect(stereotype(caricature)).toBeTruthy();
    }
    for (const fine of ['Ching Dai\'s Curse', 'Egg Shen\'s Chinatown tour', 'yeah, so what', 'Gracie Law', 'the Wing Kong']) {
      expect(stereotype(fine)).toBeUndefined();
    }
  });

  test('every export is frozen, all the way down', () => {
    const unfrozen = [];
    const walk = (v, path) => {
      if (!v || typeof v !== 'object') return;
      if (!Object.isFrozen(v)) unfrozen.push(path);
      for (const [k, child] of Object.entries(v)) walk(child, `${path}.${k}`);
    };
    for (const [name, value] of Object.entries(DATA)) walk(value, name);
    fail(unfrozen);
  });
});

// ── the six elements ────────────────────────────────────────────────────

describe('btilc lines: the six elements', () => {
  const DESIGN = {
    lightning: ['Lightning', '⚡', 'Lightning Strike', 'Static'],
    thunder: ['Thunder', '🌩️', 'Thunderous Applause', 'Deafened'],
    rain: ['Rain', '🌧️', 'Cleansing Rain', 'Rained Out'],
    wind: ['Wind', '💨', 'Tailwind', 'Ill Wind'],
    fire: ['Fire', '🔥', 'Fired Up', 'Scorched'],
    smoke: ['Smoke', '🌫️', 'Smoke Screen', 'Lost in the Smoke'],
  };

  test('are the six, in the choices\' order, named as in the design (§3.1)', () => {
    expect(ELEMENT_KEYS).toEqual(['lightning', 'thunder', 'rain', 'wind', 'fire', 'smoke']);
    expect(Object.keys(ELEMENTS)).toEqual(ELEMENT_KEYS);
    for (const [key, [name, emoji, blessName, hexName]] of Object.entries(DESIGN)) {
      expect(ELEMENTS[key]).toMatchObject({ name, emoji, blessName, hexName });
    }
  });

  test.each(ELEMENT_KEYS)('%s has exactly the documented fields and counts', (key) => {
    const e = ELEMENTS[key];
    expect(Object.keys(e).sort()).toEqual(
      ['bless', 'blessAbout', 'blessName', 'boost', 'cancel', 'emoji', 'hex', 'hexAbout', 'hexName', 'name', 'phrases', 'siege', 'used'],
    );
    expect(e.bless).toHaveLength(6);
    expect(e.hex).toHaveLength(6);
    expect(e.phrases).toHaveLength(3);
    expect(e.boost).toHaveLength(2);
    expect(Object.keys(e.cancel).sort()).toEqual(['lift', 'spoil']);
    expect(e.cancel.lift).toHaveLength(2);
    expect(e.cancel.spoil).toHaveLength(2);
    expect(Object.keys(e.used).sort()).toEqual(['bless', 'hex']);
    // Only Rain has a monster that heals from it (Gremlins: don't get them wet)
    const kinds = key === 'rain' ? ['heals', 'hit', 'immune', 'resist', 'weak'] : ['hit', 'immune', 'resist', 'weak'];
    expect(Object.keys(e.siege).sort()).toEqual(kinds);
    expect(e.siege.hit).toHaveLength(4);
    expect(e.siege.weak).toHaveLength(3);
    expect(e.siege.resist).toHaveLength(3);
    expect(e.siege.immune).toHaveLength(2);
    if (key === 'rain') expect(e.siege.heals).toHaveLength(2);
  });

  test('every bless, hex, cancel, used, boost and siege line opens with its element\'s emoji', () => {
    const bad = EVERY.filter(({ path }) => /^ELEMENTS\.\w+\.(bless|hex|boost|cancel|used|siege)\./.test(path))
      .filter(({ path, text }) => !text.startsWith(ELEMENTS[path.split('.')[1]].emoji))
      .map(l => l.path);
    fail(bad);
  });

  test('phrases fit mid-sentence: lowercase, no closing punctuation, short', () => {
    const bad = ELEMENT_KEYS.flatMap(k => ELEMENTS[k].phrases.map((p, i) => ({ p, at: `${k}.phrases.${i}` })))
      .filter(({ p }) => !/^[a-z]/.test(p) || /[.!?,;:]$/.test(p) || p.length > 40)
      .map(x => x.at);
    fail(bad);
  });

  test('the abouts are one sentence each, ending in a full stop', () => {
    for (const key of ELEMENT_KEYS) {
      expect(ELEMENTS[key].blessAbout).toMatch(/\.$/);
      expect(ELEMENTS[key].hexAbout).toMatch(/\.$/);
    }
  });

  test('a filled magic line reads right for every element\'s phrases', () => {
    const line = MAGIC_ATTACK_LINES[0].text;
    for (const key of ELEMENT_KEYS) {
      for (const phrase of ELEMENTS[key].phrases) {
        const out = fill(line, { user: 'Sam', monster: '**Gremlins**', element: phrase });
        expect(out).toContain(phrase);
        expect(out).not.toMatch(/[{}]/);
      }
    }
  });
});

describe('btilc lines: magic in the siege', () => {
  test('MAGIC_ATTACK_LINES has the design\'s 35 Blast / 10 Scattered / 5 Backlash, in { text, outcome }', () => {
    const tally = {};
    for (const line of MAGIC_ATTACK_LINES) {
      expect(Object.keys(line).sort()).toEqual(['outcome', 'text']);
      tally[line.outcome] = (tally[line.outcome] || 0) + 1;
    }
    expect(tally).toEqual({ worked: 35, escaped: 10, backfired: 5 });
  });

  test('every magic line opens with one emoji, like the other attack lines', () => {
    fail(MAGIC_ATTACK_LINES.filter(l => !PICTO.test(l.text)).map(l => l.text));
  });

  test('SIEGE_MAGIC has its refusals, foe refusals and hints', () => {
    expect(Object.keys(SIEGE_MAGIC).sort()).toEqual(['foe', 'hints', 'refusals']);
    expect(Object.keys(SIEGE_MAGIC.refusals).sort()).toEqual(['noChi', 'noElement', 'notMagic', 'unknownElement']);
    expect(Object.keys(SIEGE_MAGIC.foe).sort()).toEqual(['down', 'notStorms', 'unknown']);
    expect(Object.keys(SIEGE_MAGIC.hints).sort()).toEqual(['heals', 'immune', 'resist', 'weak']);
  });

  test('every existing monster has a weakness line naming its two elements', () => {
    expect(Object.keys(MONSTER_ELEMENT_ABOUT).sort()).toEqual([...MONSTER_KEYS].sort());
    const emojis = ELEMENT_KEYS.map(k => ELEMENTS[k].emoji);
    for (const key of MONSTER_KEYS) {
      expect(emojis.filter(e => MONSTER_ELEMENT_ABOUT[key].includes(e)).length).toBeGreaterThanOrEqual(2);
    }
  });
});

// ── the commands ────────────────────────────────────────────────────────

describe('btilc lines: /six-demon-bag', () => {
  test('has every documented part, with the right counts', () => {
    expect(Object.keys(SIX_DEMON_BAG).sort()).toEqual(
      ['boostAbout', 'boostCure', 'cast', 'egg', 'emoji', 'expired', 'name', 'notes', 'paidOff', 'peace', 'refusals', 'shrug', 'status', 'washed'],
    );
    expect(SIX_DEMON_BAG.egg).toHaveLength(6);
    expect(SIX_DEMON_BAG.cast).toHaveLength(4);
    expect(SIX_DEMON_BAG.peace.on).toHaveLength(2);
    expect(SIX_DEMON_BAG.peace.off).toHaveLength(2);
    expect(SIX_DEMON_BAG.shrug.free).toHaveLength(3);
    expect(SIX_DEMON_BAG.shrug.paid).toHaveLength(2);
    expect(SIX_DEMON_BAG.boostCure).toHaveLength(2);
    expect(Object.keys(SIX_DEMON_BAG.expired).sort()).toEqual(['bless', 'hex']);
  });

  test('Egg Shen says "Wind, fire, all that kind of thing!", in quotes', () => {
    expect(SIX_DEMON_BAG.egg).toContain('"Wind, fire, all that kind of thing!"');
    for (const line of SIX_DEMON_BAG.egg) expect(line).toMatch(/^".*"$/);
  });

  test('has a refusal for every reason in the design (§1, §3.4)', () => {
    expect(Object.keys(SIX_DEMON_BAG.refusals).sort()).toEqual([
      'alreadyBlessed', 'alreadyBoosted', 'alreadyHexed', 'bot', 'castLimit', 'fighting', 'hexLimit', 'hexesOff',
      'inactive', 'noChi', 'pairLimit', 'peaceSelf', 'peaceTarget', 'receivedLimit', 'self', 'warded',
    ]);
    expect(SIX_DEMON_BAG.refusals.noChi).toMatch(/the bag is empty/i);
  });
});

describe('btilc lines: /pork-chop-express', () => {
  test('has every documented part, with the right counts', () => {
    expect(PORK_CHOP_EXPRESS.send).toHaveLength(3);
    expect(PORK_CHOP_EXPRESS.onTheRoad).toHaveLength(3);
    expect(PORK_CHOP_EXPRESS.delivered).toHaveLength(4);
    expect(PORK_CHOP_EXPRESS.returned).toHaveLength(2);
    expect(PORK_CHOP_EXPRESS.paidOff).toHaveLength(2);
    expect(PORK_CHOP_EXPRESS.signoff).toHaveLength(3);
    expect(Object.keys(PORK_CHOP_EXPRESS.track).sort()).toEqual(['nothing', 'receivedNone', 'sentNone', 'title']);
    expect(Object.keys(PORK_CHOP_EXPRESS.refusals).sort()).toEqual([
      'bot', 'daily', 'newReceiver', 'newSender', 'nightLight', 'noRoom', 'notHeld', 'pair', 'receiverWeek', 'regift', 'self', 'unknown',
    ]);
  });

  test('the send line is Jack Burton on the CB (§1)', () => {
    expect(PORK_CHOP_EXPRESS.send[0]).toMatch(/^🚚 This is the Pork-Chop Express, and I'm talkin' to whoever's listenin' out there\./);
  });
});

describe('btilc lines: /sidekick', () => {
  test('has every documented part, with the right counts', () => {
    expect(SIDEKICK.ask).toHaveLength(3);
    expect(SIDEKICK.accepted).toHaveLength(3);
    expect(SIDEKICK.declined).toHaveLength(2);
    expect(SIDEKICK.expired).toHaveLength(2);
    expect(Object.keys(SIDEKICK.ended).sort()).toEqual(['hero', 'night', 'sidekick']);
    for (const lines of Object.values(SIDEKICK.ended)) expect(lines).toHaveLength(2);
    expect(SIDEKICK.swagger).toHaveLength(3);
    expect(SIDEKICK.cut).toHaveLength(3);
    expect(SIDEKICK.cutHelp).toHaveLength(2);
    expect(Object.keys(SIDEKICK.card).sort()).toEqual(['hero', 'sidekick']);
  });

  test('the Accept and Decline labels fit a Discord button (80) and say which is which', () => {
    expect(Object.keys(SIDEKICK.buttons).sort()).toEqual(['accept', 'decline']);
    expect(SIDEKICK.buttons.accept).toMatch(/^Accept/);
    expect(SIDEKICK.buttons.decline).toMatch(/^Decline/);
    for (const label of Object.values(SIDEKICK.buttons)) expect(label.length).toBeLessThanOrEqual(80);
  });

  test('the design\'s accept line is there (§1)', () => {
    expect(SIDEKICK.accepted).toContain('🤝 {sidekick} and {hero} ride together tonight.');
  });
});

describe('btilc lines: honours and backing', () => {
  test('has the Wang Chi, the Jack Burton and both, with the right counts', () => {
    expect(HONOURS.labels).toEqual({ wangChi: '🗡️ Wang Chi', jackBurton: '🔪 The Jack Burton' });
    expect(HONOURS.wangChi).toHaveLength(6);
    expect(HONOURS.wangChiHeld).toHaveLength(2);
    expect(HONOURS.jackBurton).toHaveLength(8);
    expect(HONOURS.both).toHaveLength(2);
  });

  test('carries the design\'s five Jack Burton lines (§5), in {jack}/{mvp} form', () => {
    for (const line of [
      '"It\'s all in the reflexes." {jack} blows the smoke off a pie tin.',
      '"Everybody relax, I\'m here." {jack} arrives just in time to take the credit.',
      '{jack} lands the killing blow, fires a celebratory shot into the ceiling, and is knocked out cold by the plaster. {mvp} carries {jack} home.',
      '{jack}: "I was born ready." {mvp}: "You were asleep for most of it."',
      '"Have ya paid your dues, {jack}?" "Yessir, the check is in the mail."',
    ]) expect(HONOURS.jackBurton).toContain(`🔪 ${line}`);
    expect(HONOURS.wangChiHeld).toContain('🗡️ Nobody needed saving. {mvp} held the line.');
    expect(HONOURS.both).toContain('🗡️🔪 Jack AND Wang? Nobody\'s buying it, {mvp}.');
  });

  test('backing has every result and refusal (§4.3)', () => {
    const b = HONOURS.backing;
    expect(b.placed).toHaveLength(3);
    expect(b.wangChi).toHaveLength(2);
    expect(b.push).toHaveLength(2);
    expect(b.lost).toHaveLength(3);
    expect(b.escaped).toHaveLength(2);
    expect(b.refunded).toHaveLength(2);
    expect(Object.keys(b).sort()).toEqual(
      ['escaped', 'lost', 'madeYouLook', 'placed', 'push', 'refunded', 'refusals', 'wangChi', 'wangChiToo'],
    );
    expect(fill(b.wangChiToo, { backer: 'Kim', fighter: 'Sam', stake: 3, gain: '+3' }))
      .toBe('🎲 Kim backed Sam too (3): Wang Chi! Kim +3.');
    expect(Object.keys(b.refusals).sort()).toEqual(
      ['already', 'bot', 'daily', 'inactive', 'late', 'noSiege', 'notFighter', 'poor', 'self'],
    );
    // The design's own results row
    expect(fill(b.wangChi[0], { backer: 'Jo', fighter: 'Sam', stake: 5, gain: '+5', bonus: '+3' }))
      .toBe('🎲 Jo backed Sam (5): Wang Chi! Jo +5, Sam +3.');
  });
});

test('every refusal opens with an emoji', () => {
  fail(EVERY.filter(l => /\.refusals\./.test(l.path) && !PICTO.test(l.text)).map(l => l.path));
});

// ── the bosses ──────────────────────────────────────────────────────────

describe('btilc lines: the four bosses', () => {
  const BASE = ['arrive', 'defeat', 'escape', 'grab', 'poison', 'roar'];
  const EXTRA = {
    wildman: ['feral'],
    guardian: ['gaze', 'hidden'],
    storms: [],
    lopan: ['beams', 'bride', 'brideClock', 'brideFreed', 'foodJack', 'phaseChange', 'roarFlesh', 'wedding'],
  };

  test('are the four, keyed as /siege start stores them', () => {
    expect(BOSS_KEYS).toEqual(['wildman', 'guardian', 'storms', 'lopan']);
    expect(Object.keys(BOSSES)).toEqual(BOSS_KEYS);
    expect(BOSSES.wildman).toMatchObject({ name: 'The Wild Man', emoji: '🦧' });
    expect(BOSSES.guardian).toMatchObject({ name: 'The Guardian', emoji: '👁️' });
    expect(BOSSES.storms).toMatchObject({ name: 'The Three Storms', emoji: '⛈️' });
    expect(BOSSES.lopan).toMatchObject({ name: 'Lo Pan', emoji: '🏮' });
  });

  test.each(BOSS_KEYS)('%s has siegeMonsters.js\' line kinds plus its own, with the right counts', (key) => {
    const b = BOSSES[key];
    for (const field of ['name', 'emoji', 'about', 'elementAbout']) expect(typeof b[field]).toBe('string');
    expect(Object.keys(b.lines).sort()).toEqual([...BASE, ...EXTRA[key]].sort());
    for (const kind of ['arrive', 'defeat', 'escape']) expect(typeof b.lines[kind]).toBe('string');
    for (const kind of ['grab', 'poison', 'roar']) expect(b.lines[kind]).toHaveLength(3);
  });

  test('grabs (and the bride) say /rescue; poisons, Rain\'s duel and Lightning\'s chain say /potion', () => {
    const bad = [];
    for (const key of BOSS_KEYS) {
      for (const line of BOSSES[key].lines.grab) if (!line.includes('/rescue')) bad.push(`${key}.grab: ${line}`);
      for (const line of BOSSES[key].lines.poison) if (!line.includes('/potion')) bad.push(`${key}.poison: ${line}`);
    }
    for (const line of BOSSES.lopan.lines.bride) if (!line.includes('/rescue')) bad.push(`lopan.bride: ${line}`);
    for (const line of [...BOSSES.storms.storms.rain.duel, ...BOSSES.storms.storms.lightning.chain]) {
      if (!line.includes('/potion')) bad.push(`storms: ${line}`);
    }
    fail(bad);
  });

  test('the Wild Man goes feral, and the Guardian gazes, hides from smoke and counts its eyes', () => {
    expect(BOSSES.wildman.lines.feral).toHaveLength(2);
    expect(BOSSES.guardian.lines.gaze).toHaveLength(3);
    expect(BOSSES.guardian.lines.hidden).toHaveLength(2);
    expect(fill(BOSSES.guardian.card, { count: 9 })).toBe('👁️ ×9 eyes open');
  });

  test('the Three Storms each have their own action and fall (§6.4)', () => {
    const { storms } = BOSSES.storms;
    expect(Object.keys(storms)).toEqual(['thunder', 'rain', 'lightning']);
    expect(Object.keys(storms.thunder).sort()).toEqual(['about', 'emoji', 'explode', 'fall', 'name', 'swell']);
    expect(Object.keys(storms.rain).sort()).toEqual(['about', 'duel', 'emoji', 'fall', 'name']);
    expect(Object.keys(storms.lightning).sort()).toEqual(['about', 'chain', 'emoji', 'fall', 'name']);
    expect(storms.thunder.swell).toHaveLength(3);
    expect(storms.thunder.explode).toHaveLength(2);
    expect(storms.rain.duel).toHaveLength(3);
    expect(storms.lightning.chain).toHaveLength(3);
    for (const s of Object.values(storms)) expect(s.fall).toHaveLength(2);
    expect(storms.rain.fall).toContain('Rain\'s sword clatters to the asphalt. {fighter} lands the cut. Wang Chi would be proud.');
  });

  test('Lo Pan has two phases, the bride, the beams, and both guard waves (§6.5)', () => {
    const { lopan } = BOSSES;
    expect(Object.keys(lopan.phases)).toEqual(['ancient', 'flesh']);
    for (const p of Object.values(lopan.phases)) expect(Object.keys(p).sort()).toEqual(['about', 'name']);
    expect(lopan.lines.bride).toHaveLength(3);
    expect(lopan.lines.wedding).toHaveLength(2);
    expect(lopan.lines.brideFreed).toHaveLength(2);
    expect(lopan.lines.beams).toHaveLength(3);
    expect(lopan.lines.phaseChange).toHaveLength(2);
    expect(lopan.lines.roarFlesh).toHaveLength(3);
    expect(lopan.lines.foodJack).toHaveLength(2);
    for (const line of lopan.lines.foodJack) expect(line).toContain('It\'s all in the reflexes');
    expect(Object.keys(lopan.guards)).toEqual(['lords', 'wingkong']);
    for (const g of Object.values(lopan.guards)) {
      expect(Object.keys(g).sort()).toEqual(['about', 'arrive', 'down', 'emoji', 'name', 'soak']);
      expect(g.arrive.length).toBeGreaterThanOrEqual(2);
      expect(g.soak).toHaveLength(2);
      expect(g.down).toHaveLength(2);
    }
  });

  test('BOSS_SHARED has the crew rule and the three boss statuses', () => {
    expect(BOSS_SHARED.crew).toHaveLength(2);
    expect(Object.keys(BOSS_SHARED.statuses)).toEqual(['dazzled', 'wounded', 'shocked']);
    for (const s of Object.values(BOSS_SHARED.statuses)) expect(Object.keys(s).sort()).toEqual(['about', 'emoji', 'name']);
  });
});

// ── happenings, twists, items, titles ───────────────────────────────────

describe('btilc lines: happenings, twists, items and titles (§7)', () => {
  test('two happenings in gameHappenings.js\' words shape, announced without a duration', () => {
    expect(Object.keys(HAPPENINGS_BTILC)).toEqual(['upsideDown', 'tourBus']);
    expect(Object.keys(HAPPENINGS_BTILC.upsideDown).sort()).toEqual(['about', 'announce', 'emoji', 'ended', 'flipped', 'name', 'short', 'tag']);
    expect(Object.keys(HAPPENINGS_BTILC.tourBus).sort()).toEqual(['about', 'announce', 'chi', 'emoji', 'ended', 'name', 'short', 'tag']);
    // The pace scales a happening's length, and the embed already says when it ends
    for (const h of Object.values(HAPPENINGS_BTILC)) {
      expect(h.announce).not.toMatch(/\b(minutes?|hours?|an hour)\b/i);
      expect(h.announce.startsWith(h.emoji)).toBe(true);
    }
  });

  test('two twists, three flavour lines each, in TWIST_FLAVOUR\'s voice (no leading emoji)', () => {
    expect(Object.keys(TWISTS_BTILC)).toEqual(['redEnvelope', 'chingDai']);
    expect(TWISTS_BTILC.redEnvelope).toMatchObject({ name: 'Red Envelope', emoji: '🧧' });
    expect(TWISTS_BTILC.chingDai).toMatchObject({ name: 'Ching Dai\'s Curse', emoji: '🀄' });
    for (const t of Object.values(TWISTS_BTILC)) {
      expect(Object.keys(t).sort()).toEqual(['effect', 'emoji', 'lines', 'name']);
      expect(t.lines).toHaveLength(3);
      for (const line of t.lines) expect(PICTO.test(line)).toBe(false);
    }
  });

  test('two items, with an autocomplete blurb of at most 40 characters', () => {
    expect(Object.keys(ITEMS_BTILC)).toEqual(['blackBlood', 'jadeCharm']);
    expect(ITEMS_BTILC.blackBlood).toMatchObject({ name: 'Black Blood of the Earth', emoji: '🖤' });
    expect(ITEMS_BTILC.jadeCharm).toMatchObject({ name: 'Jade Charm', emoji: '🧿' });
    expect(Object.keys(ITEMS_BTILC.blackBlood).sort()).toEqual(['about', 'choiceAbout', 'cured', 'emoji', 'name', 'spared', 'used']);
    expect(Object.keys(ITEMS_BTILC.jadeCharm).sort()).toEqual(['about', 'choiceAbout', 'emoji', 'fired', 'name']);
    expect(ITEMS_BTILC.blackBlood.used).toHaveLength(2);
    expect(ITEMS_BTILC.jadeCharm.fired).toHaveLength(2);
    for (const item of Object.values(ITEMS_BTILC)) expect(item.choiceAbout.length).toBeLessThanOrEqual(40);
  });

  test('the seven titles, each at most 32 characters (the card\'s widest), with distinct keys and badges', () => {
    expect(TITLES_BTILC.map(t => t.key)).toEqual(
      ['wang-chi', 'everybody-relax', 'reflexes', 'pillars-of-heaven', 'wind-fire', 'check-in-the-mail', 'real-hero'],
    );
    for (const t of TITLES_BTILC) {
      expect(Object.keys(t).sort()).toEqual(['about', 'badge', 'key', 'title']);
      expect(t.title.length).toBeLessThanOrEqual(32);
    }
    expect(new Set(TITLES_BTILC.map(t => t.badge)).size).toBe(7);
    expect(TITLES_BTILC.map(t => t.title)).toEqual([
      'Wang Chi', 'Everybody Relax, I\'m Here', 'It\'s All in the Reflexes', 'Shake the Pillars of Heaven',
      'All That Kind of Thing', 'The Check Is in the Mail', 'The Real Hero',
    ]);
  });

  test('Siege MVP and Legend get the Wang Chi wording (§5)', () => {
    expect(TITLE_ABOUT_UPDATES).toEqual({
      'siege-mvp': 'Be the Wang Chi of a won siege, once.',
      legend: 'Be the Wang Chi of 10 won sieges.',
    });
  });
});

// ── the filler ──────────────────────────────────────────────────────────

describe('btilc lines: fill()', () => {
  test('fills the placeholders it\'s given, numbers included', () => {
    expect(fill(SIX_DEMON_BAG.refusals.noChi, { chi: 3, need: 5 }))
      .toBe('🎒 The bag is empty: that takes 5 Chi and you have 3. Good plays fill it.');
  });

  test('leaves a placeholder it has no value for, rather than blanking it', () => {
    expect(fill('{caster} hexes {target}', { caster: 'Jo' })).toBe('Jo hexes {target}');
  });

  test('a name with "$&" in it stays as typed', () => {
    expect(fill(SIDEKICK.accepted[0], { sidekick: '$&', hero: 'Sam$1' })).toBe('🤝 $& and Sam$1 ride together tonight.');
  });
});

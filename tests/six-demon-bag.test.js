/**
 * /six-demon-bag, end to end (2.76.0): the real command through the real
 * dispatch (rate limits, the error reply) against the strict fake Discord
 * (tests/harness/siegeSim.js — the cast's invariants run after every step:
 * a refused cast changes no file and spends no cooldown, no hex lands on a
 * fighter, the charms, Chi and hexes received stay in their bounds). Each
 * test then asserts what members would see and what's stored.
 *
 * The rules themselves are tests/game-magic.test.js; whole evenings with a
 * siege and real plays, tests/magic-sim.test.js.
 *
 * Run: npm test -- tests/six-demon-bag.test.js
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadSim, clock, MINUTE, Sim } from './harness/siegeSim.js';

const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 10, 9, 20, 0, 0); // a Monday evening: no calendar happening
const sec = (ms) => Math.floor(ms / 1000);
let mods;
let CHI;
let MAGIC;
let B; // btilcLines

beforeAll(async () => {
  clock.install();
  mods = await loadSim();
  ({ CHI, MAGIC } = mods.rewards);
  B = mods.btilc;
});

/** A server where ana, ben, cat, dev and eve played this week (fay and gus never have) */
function fresh(name, { seed = 1, at = T0 } = {}) {
  clock.now = at;
  const sim = new Sim(name, { seed });
  for (const m of ['ana', 'ben', 'cat', 'dev', 'eve']) sim.regular(m);
  return sim;
}
const R = (key, values = {}) => B.fill(B.SIX_DEMON_BAG.refusals[key], values);
const raw = (sim) => JSON.stringify(sim.scores());
const chiOf = (sim, id) => sim.scores().users[id]?.chi?.n ?? 0;
const day = (sim, id) => sim.scores().daily[id] || {};
const lines = (i) => i.reply.content.split('\n');
const isPublic = (i) => !i.reply.ephemeralFor;

describe('a cast, end to end', () => {
  test('a blessing: the autocomplete\'s own value back into the command — its Chi spent, one cast, the member pinged once', async () => {
    const sim = fresh('sdb-bless');
    sim.giveChi('ana', 14);
    const choices = await sim.suggestElements('ana', 'bless', 'ben');
    expect(choices.map(c => c.value)).toEqual(B.ELEMENT_KEYS);
    const fire = choices.find(c => c.value === 'fire');
    expect(fire.name).toBe(`🔥 Fire · Fired Up (${CHI.cost.bless} Chi)`);
    const i = await sim.cast('ana', 'bless', 'ben', fire.value);
    expect(isPublic(i)).toBe(true);
    expect(i.reply.allowedMentions).toEqual({ parse: [], users: ['ben'] });
    const [opener, flavour, about, footer] = lines(i);
    expect(B.SIX_DEMON_BAG.cast.map(c => B.fill(c, { caster: 'ana' }))).toContain(opener.split(' *"')[0]);
    expect(B.SIX_DEMON_BAG.egg).toContain(opener.slice(opener.indexOf('*') + 1, -1));
    expect(B.ELEMENTS.fire.bless.map(l => B.fill(l, { caster: 'ana', target: 'ben' }))).toContain(flavour);
    expect(about).toBe(`**Fired Up**: ${B.ELEMENTS.fire.blessAbout} <@ben>`);
    expect(footer).toBe(`-# ana 14 → ${14 - CHI.cost.bless} Chi · 1 cast left today`);
    expect(lines(i)).toHaveLength(4);
    expect(sim.scores().users.ben.charms.bless).toEqual({ el: 'fire', by: 'ana', byName: 'ana', at: T0, until: T0 + MAGIC.blessHours * HOUR, left: 3, paid: false });
    expect([chiOf(sim, 'ana'), day(sim, 'ana').casts]).toEqual([14 - CHI.cost.bless, 1]);
  });

  test('a hex: its Chi, the day\'s one hex; the autocomplete names what a hex would spoil, and a typed name works', async () => {
    const sim = fresh('sdb-hex');
    sim.giveChi('ana', 20);
    sim.giveChi('cat', 20);
    await sim.cast('cat', 'bless', 'ben', 'smoke');
    const choices = await sim.suggestElements('ana', 'hex', 'ben');
    expect(choices.find(c => c.value === 'wind').name).toBe('💨 Wind · spoils ben\'s 🌫️ Smoke Screen');
    expect(choices.find(c => c.value === 'fire').name).toBe(`🔥 Fire · Scorched (${CHI.cost.hex} Chi)`);
    // Typed, as a member who doesn't pick a choice would send it
    const i = await sim.cast('ana', 'hex', 'ben', 'Scorched');
    expect(lines(i)[2]).toBe(`**Scorched**: ${B.ELEMENTS.fire.hexAbout} <@ben>`);
    expect(lines(i).at(-1)).toBe(`-# ana 20 → ${20 - CHI.cost.hex} Chi · 1 cast left today`);
    expect(sim.scores().users.ben.charms.hex).toMatchObject({ el: 'fire', by: 'ana', left: 3 });
    expect([day(sim, 'ana').hexes, day(sim, 'ben').hexRecv]).toEqual([1, 1]);
  });

  test('a lift: a friend\'s Rain on a Fire hex — both gone, the element\'s lift line, its caster paid', async () => {
    const sim = fresh('sdb-lift');
    sim.giveChi('ana', 20);
    sim.giveChi('cat', 20);
    await sim.cast('ana', 'hex', 'ben', 'fire');
    expect((await sim.suggestElements('cat', 'bless', 'ben')).find(c => c.value === 'rain').name).toBe('🌧️ Rain · lifts ben\'s 🔥 Scorched');
    clock.now += 30 * 1000;
    const i = await sim.cast('cat', 'bless', 'ben', 'rain');
    expect(B.ELEMENTS.rain.cancel.lift.map(l => `${B.fill(l, { caster: 'cat', target: 'ben', charm: '🔥 Scorched' })} <@ben>`)).toContain(lines(i)[1]);
    const pay = MAGIC.casterPayIn === 'chi' ? `+${MAGIC.casterPay} Chi` : `+${MAGIC.casterPay}`;
    expect(lines(i)[2]).toBe(`-# ✨ cat's 🌧️ Cleansing Rain paid off: cat ${pay}.`);
    // The footer's Chi is after the pay, as stored (the R3 review: it said
    // 14 with 15 in the bag — the pay, in Chi, came after it was read)
    const chiLeft = 20 - CHI.cost.bless + (MAGIC.casterPayIn === 'chi' ? MAGIC.casterPay : 0);
    expect(lines(i).at(-1)).toBe(`-# cat 20 → ${chiLeft} Chi · 1 cast left today`);
    expect(chiOf(sim, 'cat')).toBe(chiLeft);
    expect(sim.scores().users.ben.charms).toEqual({ wardUntil: clock.now + MAGIC.wardHours * HOUR });
    expect(sim.scores().users.cat.lifetime.magic).toEqual({ paid: 1, paidElements: ['rain'] });
  });

  test('a wash, a spoil and (3B) a Jade Charm: each cast says what it did, in its own words', async () => {
    const sim = fresh('sdb-messages');
    for (const m of ['ana', 'cat', 'dev']) sim.giveChi(m, 20);
    mods.scores.mutateScores(sim.guildId, (d) => { d.users.ben.effects = { bitten: { at: T0, until: T0 + DAY, playsLeft: 3 }, jinxed: { at: T0, until: T0 + DAY } }; });
    const wash = await sim.cast('ana', 'bless', 'ben', 'rain');
    expect(lines(wash)[3]).toBe(B.fill(B.SIX_DEMON_BAG.washed, { target: 'ben', statuses: '🧛 Bitten and 🐈‍⬛ Jinxed' }));
    expect(lines(wash)[4]).toMatch(/^-# ✨ ana's 🌧️ Cleansing Rain paid off: ana \+1/);
    // …and its footer counts the pay, as the lift's does
    const washLeft = 20 - CHI.cost.bless + (MAGIC.casterPayIn === 'chi' ? MAGIC.casterPay : 0);
    expect(lines(wash).at(-1)).toBe(`-# ana 20 → ${washLeft} Chi · 1 cast left today`);
    expect(chiOf(sim, 'ana')).toBe(washLeft);
    expect(sim.scores().users.ben.effects).toBeUndefined();
    const spoil = await sim.cast('cat', 'hex', 'ben', 'fire');
    expect(B.ELEMENTS.fire.cancel.spoil.map(l => `${B.fill(l, { caster: 'cat', target: 'ben', charm: '🌧️ Cleansing Rain' })} <@ben>`)).toContain(lines(spoil)[1]);
    expect(lines(spoil)).toHaveLength(3);
    if (mods.rewards.BAG_3B) {
      sim.giveItem('eve', 'jade');
      const turned = await sim.cast('dev', 'hex', 'eve', 'wind');
      expect(B.ITEMS_BTILC.jadeCharm.fired.map(l => `${B.fill(l, { caster: 'dev', target: 'eve' })} <@eve>`)).toContain(lines(turned)[1]);
      expect(lines(turned).at(-1)).toBe(`-# dev 20 → ${20 - CHI.cost.hex} Chi · 1 cast left today`);
      expect(sim.scores().users.eve.charms).toBeUndefined();
    }
  });

  test('an unknown element, or no member, is refused for nothing', async () => {
    const sim = fresh('sdb-unknown');
    sim.giveChi('ana', 20);
    const before = raw(sim);
    const i = await sim.cast('ana', 'bless', 'ben', 'water');
    expect(i.reply.ephemeralFor).toBe('ana');
    expect(i.reply.content).toBe('🎒 There\'s no "water" in the bag. Pick one of the six: ⚡ Lightning, 🌩️ Thunder, 🌧️ Rain, 💨 Wind, 🔥 Fire, 🌫️ Smoke.');
    expect(raw(sim)).toBe(before);
  });
});

// ── every refusal costs nothing ─────────────────────────────────────────

/**
 * Each refusal on its own server: set it up (the real commands where they
 * can make it so), cast, and check the private reply's exact words, that
 * the file didn't move — and that the cooldown wasn't spent: ana's next
 * cast, straight away, goes through (or, where she can't cast at all,
 * says the same again rather than "cooldown").
 */
const REFUSALS = [
  ['self', async (sim) => ['hex', 'ana', R('self')]],
  ['bot', async (sim) => {
    sim.discord.addUser('robo').bot = true;
    return ['hex', 'robo', R('bot')];
  }],
  ['hexesOff', async (sim) => {
    await sim.configure({ hexes: false });
    return ['hex', 'ben', R('hexesOff')];
  }],
  ['peaceSelf', async (sim) => {
    await sim.bag('ana', 'peace', { on: true });
    return ['hex', 'ben', R('peaceSelf')];
  }],
  ['peaceTarget', async (sim) => {
    await sim.bag('ben', 'peace', { on: true });
    return ['hex', 'ben', R('peaceTarget', { target: 'ben' })];
  }],
  ['inactive', async () => ['hex', 'fay', R('inactive', { target: 'fay' })]],
  ['fighting', async (sim) => {
    await sim.start({ monster: 'blob' });
    sim.calm();
    await sim.attack('ben', 'food', { force: 'splat' });
    clock.now += 30 * 1000;
    return ['hex', 'ben', R('fighting', { target: 'ben' })];
  }],
  ['alreadyHexed', async (sim) => {
    sim.giveChi('cat', 20);
    await sim.cast('cat', 'hex', 'ben', 'wind');
    return ['hex', 'ben', R('alreadyHexed', { target: 'ben' })];
  }],
  ['warded', async (sim) => {
    sim.giveChi('cat', 20);
    await sim.cast('cat', 'hex', 'ben', 'wind');
    await sim.bag('ben', 'shrug');
    return ['hex', 'ben', R('warded', { target: 'ben', when: `<t:${sec(clock.now + MAGIC.wardHours * HOUR)}:R>` })];
  }],
  ['receivedLimit', async (sim) => {
    for (const caster of ['cat', 'dev']) {
      sim.giveChi(caster, 20);
      await sim.cast(caster, 'hex', 'ben', 'wind');
      await sim.bag('ben', 'shrug');
      clock.now += MAGIC.wardHours * HOUR + MINUTE;
    }
    return ['hex', 'ben', R('receivedLimit', { target: 'ben', count: MAGIC.hexesReceivedPerDay })];
  }, { at: Date.UTC(2026, 10, 9, 13, 0) }],
  ['pairLimit', async (sim) => {
    const first = clock.now;
    await sim.cast('ana', 'hex', 'ben', 'wind');
    await sim.bag('ben', 'shrug');
    clock.now += DAY; // a new day: her hex for today is back, the 72 hours aren't up
    sim.regular('ben');
    return ['hex', 'ben', R('pairLimit', { target: 'ben', when: `<t:${sec(first + MAGIC.hexPairHours * HOUR)}:R>` })];
  }],
  ['castLimit', async (sim) => {
    await sim.cast('ana', 'bless', 'ben', 'wind');
    clock.now += 30 * 1000;
    await sim.cast('ana', 'bless', 'cat', 'wind');
    clock.now += 30 * 1000;
    return ['hex', 'dev', R('castLimit', { count: MAGIC.castsPerDay })];
  }, { noFollowUp: true }],
  ['hexLimit', async (sim) => {
    await sim.cast('ana', 'hex', 'ben', 'wind');
    clock.now += 30 * 1000;
    return ['hex', 'cat', R('hexLimit')];
  }],
  ['noChi', async (sim) => {
    sim.giveChi('ana', -20 + 3);
    return ['hex', 'ben', R('noChi', { chi: 3, need: CHI.cost.hex })];
  }, { noFollowUp: true }],
  ['alreadyBlessed', async (sim) => {
    sim.giveChi('cat', 20);
    await sim.cast('cat', 'bless', 'ben', 'wind');
    return ['bless', 'ben', R('alreadyBlessed', { target: 'ben' })];
  }],
  ['blessPair', async (sim) => {
    const first = clock.now;
    for (let d = 0; d < MAGIC.blessPair.max; d++) {
      await sim.cast('ana', 'bless', 'ben', 'wind');
      clock.now += DAY + MINUTE; // the blessing has run out by then (so it's not "already blessed")
      sim.giveChi('ana', 20);
    }
    return ['bless', 'ben', R('blessPair', { target: 'ben', count: MAGIC.blessPair.max, when: `<t:${sec(first + MAGIC.blessPair.days * DAY)}:R>` })];
  }],
];

describe('every refusal is private and costs nothing: no Chi, no cast, no cooldown, the file untouched', () => {
  test.each(REFUSALS.map(([key, setup, opts]) => [key, setup, opts || {}]))('%s', async (key, setup, opts) => {
    const sim = fresh(`sdb-refuse-${key}`, { at: opts.at ?? T0 });
    sim.giveChi('ana', 20);
    const [kind, target, text] = await setup(sim);
    const before = raw(sim);
    const casts = day(sim, 'ana').casts || 0;
    const chi = chiOf(sim, 'ana');
    const i = await sim.cast('ana', kind, target, 'fire');
    expect(i.reply.ephemeralFor).toBe('ana');
    expect(i.reply.content).toBe(text);
    expect(raw(sim)).toBe(before);
    expect([chiOf(sim, 'ana'), day(sim, 'ana').casts || 0]).toEqual([chi, casts]);
    // No cooldown was spent: straight away, without the clock moving
    if (opts.noFollowUp) {
      const again = await sim.cast('ana', kind, target, 'fire');
      expect(again.reply.content).toBe(text);
    } else {
      const next = await sim.cast('ana', 'bless', 'eve', 'lightning');
      expect([next.reply.ephemeralFor, lines(next)[2]]).toEqual([null, `**Lightning Strike**: ${B.ELEMENTS.lightning.blessAbout} <@eve>`]);
    }
  });

  test('…while a real cast does spend the 20-second cooldown, shared with the games\' 6 a minute', async () => {
    const sim = fresh('sdb-cooldown');
    sim.giveChi('ana', 20);
    await sim.cast('ana', 'bless', 'ben', 'wind');
    const again = await sim.cast('ana', 'bless', 'cat', 'wind');
    expect(again.reply.content).toBe('⏳ Six-Demon Bag cooldown: 20s. Try another game meanwhile!');
    expect(day(sim, 'ana').casts).toBe(1);
    clock.now += 20 * 1000;
    expect(isPublic(await sim.cast('ana', 'bless', 'cat', 'wind'))).toBe(true);
  });
});

// ── channels ────────────────────────────────────────────────────────────

describe('channels: /eggshen-config-games channels, as the games honour it', () => {
  test('bless, hex, peace and shrug are refused outside the games\' channels (a thread of one counts); status works anywhere, privately', async () => {
    const sim = fresh('sdb-channels');
    sim.giveChi('ana', 20);
    sim.giveChi('cat', 20);
    await sim.cast('cat', 'hex', 'ana', 'wind');
    await sim.configure({ channelMode: 'only', channels: ['games'] });
    const before = raw(sim);
    const where = `🎲 Games are played in <#games> on this server.`;
    for (const i of [
      await sim.cast('ana', 'bless', 'ben', 'fire', { channel: 'lobby' }),
      await sim.cast('ana', 'hex', 'ben', 'fire', { channel: 'lobby' }),
      await sim.bag('ana', 'peace', { on: true }, { channel: 'lobby' }),
      await sim.bag('ana', 'shrug', {}, { channel: 'lobby' }),
    ]) {
      expect([i.reply.ephemeralFor, i.reply.content]).toEqual(['ana', where]);
    }
    expect(raw(sim)).toBe(before);
    const status = await sim.bag('ana', 'status', {}, { channel: 'lobby' });
    expect(status.reply.ephemeralFor).toBe('ana');
    expect(status.reply.embeds[0].toJSON().title).toBe(B.SIX_DEMON_BAG.status.title);
    // In a thread of the games channel, uncached as discord.js hands one over: fine
    const thread = await sim.cast('ana', 'bless', 'ben', 'fire', { channel: 'thread', uncached: true });
    expect(isPublic(thread)).toBe(true);
    // 'except': refused only where listed
    await sim.configure({ channelMode: 'except', channels: ['lobby'] });
    clock.now += 30 * 1000;
    const except = await sim.bag('ana', 'shrug', {}, { channel: 'lobby' });
    expect(except.reply.content).toBe('🎲 Games aren\'t played in this channel. Try another one!');
  });
});

// ── the switches ────────────────────────────────────────────────────────

describe('the switches: the bag toggle, and hexes', () => {
  test('/eggshen-config commands toggle setting:magic: members are refused, plays earn no Chi, and charms in place do nothing', async () => {
    const sim = fresh('sdb-toggle');
    sim.giveChi('ana', 20);
    await sim.cast('ana', 'bless', 'ben', 'fire');
    const toggled = await sim.toggle('magic', false);
    expect(toggled.reply.content).toBe('❌ **/six-demon-bag command (Chi, blessings and hexes)** has been disabled for regular users.');
    clock.now += 30 * 1000;
    const refused = await sim.cast('ana', 'bless', 'cat', 'fire');
    expect([refused.reply.ephemeralFor, refused.reply.content]).toEqual(['ana', '❌ /six-demon-bag is turned off on this server.']);
    const status = await sim.bag('ana', 'status');
    expect(status.reply.content).toBe('❌ /six-demon-bag is turned off on this server.');
    // ben's Fired Up and the Chi a good play earns: both off
    const chi = chiOf(sim, 'ben');
    const rescue = await sim.rescue('ben', 'cat', { force: 'rescued' });
    expect(rescue.reply.content).not.toContain('Fired Up');
    expect(chiOf(sim, 'ben')).toBe(chi);
    expect(sim.scores().users.ben.charms.bless.left).toBe(3);
    // On again: it works where it left off
    await sim.toggle('magic', true);
    clock.now += 30 * 1000;
    expect((await sim.rescue('ben', 'cat', { force: 'rescued' })).reply.content).toContain('-# 🔥 Fired Up: ben +1 (2 more).');
  });

  test('/eggshen-config-games happenings hexes:false — every hex in place ends at once, hexes are refused, blessings carry on', async () => {
    const sim = fresh('sdb-hexes-off');
    for (const m of ['ana', 'cat']) sim.giveChi(m, 20);
    await sim.cast('ana', 'hex', 'ben', 'fire');
    await sim.cast('cat', 'hex', 'dev', 'smoke');
    const off = await sim.command('admin', 'eggshen-config-games', { subcommand: 'happenings', options: { hexes: false } });
    expect(off.reply.content.split('\n')[0]).toBe('⏹️ Ended 2 hexes in place.');
    expect(off.reply.content).toContain('• Hexes: **off**');
    expect([sim.scores().users.ben.charms, sim.scores().users.dev.charms]).toEqual([undefined, undefined]);
    clock.now += 30 * 1000;
    expect((await sim.cast('ana', 'hex', 'eve', 'fire')).reply.content).toBe(R('hexesOff'));
    expect(isPublic(await sim.cast('ana', 'bless', 'eve', 'fire'))).toBe(true);
    // The autocomplete still works; the status says hexes are off
    const status = (await sim.bag('eve', 'status')).reply.embeds[0].toJSON();
    expect(status.description).toContain(B.SIX_DEMON_BAG.status.hexesOff);
    expect(status.fields[1].value).toBe(B.SIX_DEMON_BAG.status.hexesOff);
    const on = await sim.command('admin', 'eggshen-config-games', { subcommand: 'happenings', options: { hexes: true } });
    expect(on.reply.content).toContain('• Hexes: **on**');
  });
});

// ── peace and shrug ─────────────────────────────────────────────────────

describe('peace and shrug: nobody is ever stuck with a hex', () => {
  test('peace on lifts the hex on you, and holds for 7 days; off before then is refused (privately), after it works', async () => {
    const sim = fresh('sdb-peace');
    sim.giveChi('cat', 20);
    await sim.cast('cat', 'hex', 'ana', 'smoke');
    const on = await sim.bag('ana', 'peace', { on: true });
    expect(isPublic(on)).toBe(true);
    expect(B.SIX_DEMON_BAG.peace.on.map(l => B.fill(l, { user: 'ana' }))).toContain(lines(on)[0]);
    expect(lines(on)[1]).toBe(B.fill(B.SIX_DEMON_BAG.peace.lifted, { user: 'ana', charm: '🌫️ Lost in the Smoke' }));
    expect(on.reply.allowedMentions).toEqual({ parse: [] });
    expect(sim.scores().users.ana.charms).toEqual({ peace: { on: true, since: T0 }, wardUntil: T0 + MAGIC.wardHours * HOUR });
    expect((await sim.bag('ana', 'peace', { on: true })).reply.content).toBe(B.SIX_DEMON_BAG.peace.alreadyOn);
    clock.now = T0 + MAGIC.peaceLockDays * DAY - MINUTE;
    const early = await sim.bag('ana', 'peace', { on: false });
    expect([early.reply.ephemeralFor, early.reply.content]).toEqual(['ana', B.fill(B.SIX_DEMON_BAG.peace.tooSoon, { when: `<t:${sec(T0 + MAGIC.peaceLockDays * DAY)}:R>` })]);
    clock.now = T0 + MAGIC.peaceLockDays * DAY;
    const off = await sim.bag('ana', 'peace', { on: false });
    expect(B.SIX_DEMON_BAG.peace.off.map(l => B.fill(l, { user: 'ana' }))).toContain(off.reply.content);
    expect(sim.scores().users.ana.charms).toBeUndefined();
    expect((await sim.bag('ana', 'peace', { on: false })).reply.content).toBe(B.SIX_DEMON_BAG.peace.alreadyOff);
  });

  test('shrug: free once a UTC day, then 2 Chi, then free again when the bag holds less; each leaves a 3-hour ward', async () => {
    const sim = fresh('sdb-shrug', { at: Date.UTC(2026, 10, 9, 1, 0) });
    const S = B.SIX_DEMON_BAG.shrug;
    expect((await sim.bag('ana', 'shrug')).reply.content).toBe(S.none);
    const hexAna = async (caster) => {
      sim.giveChi(caster, 20);
      await sim.cast(caster, 'hex', 'ana', 'wind');
    };
    await hexAna('ben');
    sim.giveChi('ana', 3);
    const free = await sim.bag('ana', 'shrug');
    expect(S.free.map(l => B.fill(l, { user: 'ana' }))).toContain(lines(free)[0]);
    expect(lines(free)[1]).toBe(`-# 💨 Ill Wind is gone. No hex can land on ana until <t:${sec(clock.now + MAGIC.wardHours * HOUR)}:t>.`);
    expect(sim.scores().users.ana.charms).toEqual({ wardUntil: clock.now + MAGIC.wardHours * HOUR });
    clock.now += MAGIC.wardHours * HOUR;
    await hexAna('cat');
    const paid = await sim.bag('ana', 'shrug');
    expect(S.paid.map(l => B.fill(l, { user: 'ana', chi: CHI.cost.shrug }))).toContain(lines(paid)[0]);
    expect(chiOf(sim, 'ana')).toBe(3 - CHI.cost.shrug);
    // A third hex can't land today (2 received): tomorrow's, then broke with 1 Chi
    clock.now = Date.UTC(2026, 10, 10, 1, 0);
    sim.regular('ana');
    await hexAna('dev');
    mutateDaily(sim, 'ana', { shrugs: MAGIC.freeShrugsPerDay });
    const broke = await sim.bag('ana', 'shrug');
    expect(lines(broke)[0]).toBe(B.fill(S.broke, { user: 'ana' }));
    expect(chiOf(sim, 'ana')).toBe(1);
  });
});

/** Today's counters for a member, as earlier plays would have left them (a test's setup) */
function mutateDaily(sim, id, over) {
  mods.scores.mutateScores(sim.guildId, (d) => {
    const today = mods.scores.dayKey(clock.now);
    d.daily[id] = { ...(d.daily[id]?.day === today ? d.daily[id] : { day: today, plays: {} }), ...over };
  });
}

// ── status ──────────────────────────────────────────────────────────────

describe('/six-demon-bag status', () => {
  test('private by default; private:false shows the channel — Chi, casts, what\'s on you and from whom; every field under 1,024', async () => {
    const sim = fresh('sdb-status');
    sim.giveChi('cat', 20);
    sim.giveChi('dev', 20);
    sim.giveChi('ana', 13);
    await sim.cast('cat', 'bless', 'ana', 'fire');
    await sim.cast('dev', 'hex', 'ana', 'smoke');
    const mine = await sim.bag('ana', 'status');
    expect(mine.reply.ephemeralFor).toBe('ana');
    const e = mine.reply.embeds[0].toJSON();
    expect(e.title).toBe('🎒 The Six-Demon Bag');
    const d = e.description.split('\n');
    expect(d[0]).toBe('☯️ `13/20` Chi ▰▰▰▰▰▰▰▱▱▱');
    expect(d[1]).toBe(`Today: \`+0/${CHI.perDay}\` from good plays · \`+0/${CHI.helpPerDay}\` from freeing and curing in a siege`);
    expect(d[2]).toBe(`Casts: \`${MAGIC.castsPerDay} of ${MAGIC.castsPerDay}\` left today (a hex: \`1 of 1\`) · resets 00:00 UTC`);
    expect(d[3]).toBe(`On you: 🔥 Fired Up *(from cat)* · 3 plays left · ends <t:${sec(T0 + MAGIC.blessHours * HOUR)}:R>`);
    expect(d[4]).toBe(`On you: 🌫️ Lost in the Smoke *(hex, from dev)* · 2 plays left · ends <t:${sec(T0 + MAGIC.hexHours * HOUR)}:R> · \`/six-demon-bag shrug\` (free today)`);
    expect(e.fields.map(f => f.name)).toEqual([`🎒 Blessings · ${CHI.cost.bless} Chi`, `🎒 Hexes · ${CHI.cost.hex} Chi`]);
    for (const f of e.fields) expect(f.value.length).toBeLessThanOrEqual(1024);
    expect(e.fields[0].value.split('\n')).toHaveLength(6);
    // (past the server's command limit, which status keeps: the next test)
    clock.now += 20 * 1000;
    const shown = await sim.bag('ana', 'status', { private: false });
    expect(shown.reply.ephemeralFor).toBeNull();
    expect(shown.reply.allowedMentions).toEqual({ parse: [] });
  });

  test('status keeps the server\'s command limit (it can be posted publicly), and never holds up a cast, a shrug or peace', async () => {
    const sim = fresh('sdb-status-limit');
    sim.giveChi('ana', 20);
    sim.giveChi('cat', 20);
    await sim.cast('cat', 'hex', 'ana', 'wind');
    // Eight public status cards in the same instant (the R3 review: all
    // eight were posted): the first is, the rest are refused privately
    const shown = [];
    for (let k = 0; k < 8; k++) shown.push(await sim.bag('ana', 'status', { private: false }));
    expect(shown.map(isPublic)).toEqual([true, false, false, false, false, false, false, false]);
    for (const i of shown.slice(1)) {
      expect([i.reply.ephemeralFor, i.reply.content]).toEqual(['ana', '⏱️ You\'re using commands too quickly! Please wait 20 seconds before using **/six-demon-bag status** again.']);
    }
    // Straight after, the clock unmoved: a cast lands, and its Chi is spent…
    const cast = await sim.cast('ana', 'bless', 'eve', 'lightning');
    expect([cast.reply.ephemeralFor, lines(cast)[2]]).toEqual([null, `**Lightning Strike**: ${B.ELEMENTS.lightning.blessAbout} <@eve>`]);
    expect(chiOf(sim, 'ana')).toBe(20 - CHI.cost.bless);
    // …the hex on ana is shrugged off, and peace made — each public
    const shrug = await sim.bag('ana', 'shrug');
    expect([isPublic(shrug), sim.scores().users.ana.charms.hex]).toEqual([true, undefined]);
    const peace = await sim.bag('ana', 'peace', { on: true });
    expect([isPublic(peace), sim.scores().users.ana.charms.peace?.on]).toEqual([true, true]);
    // The window over, a status card again
    clock.now += 20 * 1000;
    const again = await sim.bag('ana', 'status', { private: false });
    expect([isPublic(again), again.reply.embeds[0].toJSON().title]).toEqual([true, B.SIX_DEMON_BAG.status.title]);
  });
});

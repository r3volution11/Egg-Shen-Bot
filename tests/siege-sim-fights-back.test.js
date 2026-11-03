/**
 * /siege, R6: the monster fights back — end to end through the simulator
 * (tests/harness/siegeSim.js): the real /siege, /rescue, /potion and the
 * scheduler, with every invariant checked after every step (a grabbed or
 * digested fighter never lands an attack; every action message pings
 * exactly its victims and every victim was pinged; frees and cures are
 * what the replies said; points move only as the rules say).
 *
 * The monster's actions are steered with sim.act(kind, victims): it queues
 * the luck draws decideAction makes (the kind, each victim, the line), then
 * lets the passes run until it has acted. Plays are forced onto an outcome
 * the same way attacks are (Math.random pinned onto such a line).
 *
 * Run:        npm test -- tests/siege-sim-fights-back.test.js
 * Transcript: SIM_REPORT=/tmp/siege-sim npm test -- tests/siege-sim-fights-back.test.js
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadSim, clock, MINUTE, Sim, seeded } from './harness/siegeSim.js';

const SEC = 1000;
const HOUR = 60 * MINUTE;
const T0 = Date.UTC(2026, 10, 9, 20, 0, 0); // a Monday evening
const sec = (ms) => Math.floor(ms / 1000);
let mods;

beforeAll(async () => {
  clock.install();
  mods = await loadSim();
});

const SIEGE = () => mods.rewards.SIEGE;
const lines = (m) => m.content.split('\n');
const fighter = (sim, id) => sim.siege().participants[id];

/** A monster's line with its placeholders filled as the action message does */
function said(monster, kind, index, names) {
  const m = mods.monsters.MONSTERS[monster];
  return m.lines[kind][index].split('{monster}').join(`**${m.name}**`).split('{fighter}').join(names.map(n => `**${n}**`).join(' and '));
}

/** A siege on, and `fighters` each in it with one smite (twists off: forced plays stay forced) */
async function arena(name, monster = 'blob', { fighters = ['ana', 'ben', 'cat'], minutes = 60, seed = 7 } = {}) {
  clock.now = T0;
  const sim = new Sim(name, { seed });
  await sim.configure({ twists: false, happeningFrequency: 'off', siegeFrequency: 'off' });
  await sim.start({ monster, minutes });
  for (const u of fighters) await sim.attack(u, 'doom', { force: 'smite' });
  return sim;
}

describe('a grab, and getting free', () => {
  test('grabbed: pinged alone, can\'t attack (refused for free), and another member\'s /rescue frees them, +12 to the rescuer\'s share', async () => {
    const sim = await arena('fb-rescue');
    const msg = await sim.act('grab', ['ana']);
    const at = clock.now;
    expect(lines(msg)).toEqual([
      said('blob', 'grab', 1, ['ana']),
      '<@ana>',
      '-# 🪤 Free them with `/rescue attempt target:@ana` within 10 minutes, or the monster digests them: −5 and out of the fight. A grabbed fighter can\'t attack.',
    ]);
    expect(msg.allowedMentions).toEqual({ parse: [], users: ['ana'] });
    expect(fighter(sim, 'ana').caught).toMatchObject({ at, until: at + 10 * MINUTE, by: 'monster', actionId: msg.actionId });

    const refused = await sim.attack('ana', 'doom');
    const until = sec(at + 10 * MINUTE);
    expect([refused.reply.ephemeralFor, refused.reply.content]).toEqual(['ana', `🪤 The Blob has you! You can't attack until someone else frees you with \`/rescue attempt target:@ana\`, by <t:${until}:t> (<t:${until}:R>).`]);
    const status = await sim.status('ana');
    expect(status.reply.content).toBe(`You: \`20\` damage · 1st of 3 fighters · 🪤 grabbed: someone has to free you by <t:${until}:R>`);

    const freed = await sim.rescue('ben', 'ana', { force: 'rescued' });
    expect(lines(freed.reply).at(-1)).toBe('-# 🛟 ben freed ana from The Blob: +12 to their share of the fight.');
    expect(fighter(sim, 'ana').caught).toBeNull();
    expect(fighter(sim, 'ben').frees).toBe(1);
    // Contribution = damage + 12 a free: ben now leads
    expect(mods.store.fightersOf(sim.siege()).map(f => [f.userId, f.contribution])).toEqual([['ben', 32], ['ana', 20], ['cat', 20]]);
    // ana's refusal spent nothing: she attacks straight away
    expect((await sim.attack('ana', 'doom', { force: 'smite' })).reply.ephemeralFor).toBeNull();
    sim.writeTranscript('fb-rescue');
  });

  test('a failed rescue leaves them caught; a sacrifice frees them and the rescuer is grabbed instead (fresh window); Holy Water frees and never swaps', async () => {
    const sim = await arena('fb-swap', 'blob', { fighters: ['ana', 'ben', 'cat', 'dev'] });
    await sim.act('grab', ['ben']);
    sim.calm();
    const fail = await sim.rescue('cat', 'ben', { force: 'caught' });
    expect(lines(fail.reply).at(-1)).toBe('-# 🪤 ben is still in The Blob\'s grip. Someone try again!');
    expect(mods.store.isCaught(fighter(sim, 'ben'))).toBe(true);
    expect(fighter(sim, 'cat').frees).toBe(0);

    await sim.advance(30 * SEC);
    const swap = await sim.rescue('ana', 'ben', { force: 'sacrificed' });
    const until = sec(clock.now + 10 * MINUTE);
    expect(lines(swap.reply).at(-1)).toBe(`-# 🕯️ ana freed ben, and The Blob grabbed ana instead: +12 to their share. Someone free them with \`/rescue attempt target:@ana\` by <t:${until}:t> (<t:${until}:R>).`);
    expect(swap.reply.allowedMentions.users).toContain('ana');
    expect(fighter(sim, 'ben').caught).toBeNull();
    expect(fighter(sim, 'ana').caught).toMatchObject({ by: 'sacrifice', until: clock.now + 10 * MINUTE });
    expect((await sim.attack('ana', 'food')).reply.content).toMatch(/^🪤 The Blob has you!/);

    sim.giveItem('dev', 'holyw');
    const holy = await sim.rescue('dev', 'ana', { item: 'holyw', force: 'sacrificed' });
    expect(holy.reply.content).toMatch(/^-# 🛟 dev freed ana from The Blob \(Holy Water: no swap\): \+12 to their share of the fight\.$/m);
    expect([fighter(sim, 'ana').caught, fighter(sim, 'dev').caught, fighter(sim, 'dev').frees]).toEqual([null, null, 1]);
  });

  test('nobody frees them in 10 minutes: digested — a NEW message pinging them, −5 (never below 0 for the month), out of the siege', async () => {
    const sim = await arena('fb-digest');
    await sim.act('grab', ['cat']);
    sim.calm();
    const until = fighter(sim, 'cat').caught.until;
    await sim.advance(until - clock.now + MINUTE);
    const [digest] = sim.sends().filter(m => m.kindTag === 'digest');
    // cat had 2 this month (one smite): that's all there was to lose
    expect(lines(digest)).toEqual(['😋 **The Blob** digested **cat**: nobody freed them in time. Out of this siege.', '<@cat>', '-# cat −2 (never below 0 for the month)']);
    expect(digest.allowedMentions).toEqual({ parse: [], users: ['cat'] });
    expect(fighter(sim, 'cat')).toMatchObject({ out: true, caught: null });
    expect(sim.scores().users.cat.games.siege.all.points).toBe(0);
    const refused = await sim.attack('cat', 'doom');
    expect(refused.reply.content).toBe('😋 The Blob digested you: you\'re out of this siege.');
    // A rescue at a digested fighter does nothing for the siege
    const late = await sim.rescue('ana', 'cat', { force: 'rescued' });
    expect(late.reply.content).not.toMatch(/freed cat/);
    expect(fighter(sim, 'ana').frees).toBe(0);
  });
});

describe('poison', () => {
  test('poisoned: half damage until another member\'s helpful /potion cures them (+8); the card lists who\'s caught and poisoned', async () => {
    const sim = await arena('fb-cure');
    await sim.act('grab', ['ana']);
    const msg = await sim.act('poison', ['ben']);
    expect(lines(msg)).toEqual([
      said('blob', 'poison', 1, ['ben']),
      '<@ben>',
      '-# 🤢 Until a helpful `/potion give` cures them, their attacks do half damage. It wears off in 15 minutes.',
    ]);
    const poisonedAt = clock.now;
    sim.calm();
    // The next pass's edit shows both
    await sim.advance(MINUTE);
    const card = sim.channel('games').messageList.find(m => m.id === sim.siege().card.messageId).embeds[0].toJSON();
    expect(card.fields.find(f => f.name === '🪤 Caught').value).toBe(`ana · free them by <t:${sec(fighter(sim, 'ana').caught.until)}:R>`);
    expect(card.fields.find(f => f.name === '🤢 Poisoned').value).toBe(`ben · wears off <t:${sec(poisonedAt + 15 * MINUTE)}:R>`);

    const halved = await sim.attack('ben', 'doom', { force: 'smite' });
    expect(lines(halved.reply)[2]).toMatch(/^-# 💥 10 damage \(🤢 halved: poisoned\) · The Blob \d+\/135$/);
    // A harmful potion, or a helpful one that backfires, cures nothing
    await sim.cure('dev', 'ben', { type: 'poison', force: 'worked' });
    await sim.cure('ana', 'ben', { force: 'backfired' });
    expect(mods.store.poisonedNow(fighter(sim, 'ben'), clock.now)).toBe(true);
    const cure = await sim.cure('cat', 'ben', { force: 'worked' });
    expect(lines(cure.reply).at(-1)).toBe('-# 🧪 cat cured ben of The Blob\'s poison: +8 to their share of the fight.');
    expect([fighter(sim, 'ben').poisoned, fighter(sim, 'cat').cures]).toEqual([null, 1]);
    await sim.advance(21 * SEC);
    expect(lines((await sim.attack('ben', 'doom', { force: 'smite' })).reply)[2]).toMatch(/^-# 💥 20 damage · /);
    expect([fighter(sim, 'dev')?.cures ?? 0, fighter(sim, 'ana').cures]).toEqual([0, 0]);
    sim.writeTranscript('fb-cure');
  });

  test('an Antidote fires by itself the moment they\'re poisoned: cured at once, used up, a defence for the day', async () => {
    const sim = await arena('fb-antidote');
    sim.giveItem('ben', 'antid');
    const msg = await sim.act('poison', ['ben']);
    expect(lines(msg).slice(1)).toEqual(['<@ben>', '-# 💊 ben\'s Antidote cured it at once.']);
    expect(fighter(sim, 'ben').poisoned).toBeNull();
    const ben = sim.scores().users.ben;
    expect([ben.glovebox.antid, ben.cooldowns.antid]).toEqual([undefined, clock.now + 6 * HOUR]);
    expect(sim.scores().daily.ben.defences).toBe(1);
  });

  test('a fizzled potion attack splashes back: the attacker is poisoned (no monster needed), wears off in 15 minutes; with an Antidote, cured at once', async () => {
    const sim = await arena('fb-fizzle');
    sim.calm();
    await sim.advance(21 * SEC);
    const a = await sim.attack('ana', 'potion', { force: 'fizzled' });
    expect(lines(a.reply).at(-1)).toBe('-# 🤢 The potion splashed back: ana is poisoned, and their attacks do half damage until someone cures them with a helpful `/potion give` (or 15 minutes pass).');
    expect(fighter(sim, 'ana').poisoned).toEqual({ at: clock.now, until: clock.now + 15 * MINUTE, actionId: null, by: 'fizzle' });
    sim.giveItem('cat', 'antid');
    const c = await sim.attack('cat', 'potion', { force: 'fizzled' });
    expect(lines(c.reply).at(-1)).toBe('-# 💊 The potion splashed back on cat, and their Antidote cured it at once.');
    expect(fighter(sim, 'cat').poisoned).toBeNull();
    // The first pass past its 15 minutes clears it
    await sim.advance(16 * MINUTE);
    expect(fighter(sim, 'ana').poisoned).toBeNull();
    expect(sim.siege().log.map(l => l.text)).toContain('🌿 ana shook off the poison');
  });
});

describe('the Antidote and a poisoning already on (found by the fuzz, seeds 4142 and 4204)', () => {
  test('poisoned by the monster with no Antidote, then a fizzle once they hold one: it fires, and cures the poisoning they had too', async () => {
    const sim = await arena('fb-antidote-later');
    await sim.act('poison', ['ben']);
    sim.calm();
    expect(fighter(sim, 'ben').poisoned).toMatchObject({ by: 'monster' });
    sim.giveItem('ben', 'antid');
    const a = await sim.attack('ben', 'potion', { force: 'fizzled' });
    expect(lines(a.reply).at(-1)).toBe('-# 💊 The potion splashed back on ben, and their Antidote cured it at once.');
    expect(fighter(sim, 'ben').poisoned).toBeNull();
    expect(sim.scores().users.ben.glovebox.antid).toBeUndefined();
  });
});

describe('each monster its own way', () => {
  test('Killer Klowns grab two (both pinged); with only one free, the grab becomes a poison — never the last free fighter', async () => {
    const sim = await arena('fb-klowns', 'klowns');
    const msg = await sim.act('grab', ['ana', 'ben']);
    expect(lines(msg).slice(0, 2)).toEqual([said('klowns', 'grab', 1, ['ana', 'ben']), '<@ana> <@ben>']);
    expect(msg.allowedMentions.users).toEqual(['ana', 'ben']);
    expect(['ana', 'ben', 'cat'].map(u => mods.store.isCaught(fighter(sim, u)))).toEqual([true, true, false]);
    // cat is the last free fighter: the grab the dice chose is a poison instead
    const next = await sim.act('grab', ['cat']);
    expect([sim.siege().lastAction.kind, next.actionKind]).toEqual(['poison', 'poison']);
    expect([mods.store.isCaught(fighter(sim, 'cat')), mods.store.poisonedNow(fighter(sim, 'cat'), clock.now)]).toEqual([false, true]);
  });

  test('two free fighters: Killer Klowns take only one', async () => {
    const sim = await arena('fb-klowns-two', 'klowns', { fighters: ['ana', 'ben'] });
    await sim.act('grab', ['ana']);
    expect([mods.store.isCaught(fighter(sim, 'ana')), mods.store.isCaught(fighter(sim, 'ben'))]).toEqual([true, false]);
  });

  test('The Thing grabs the top contributor among the free fighters', async () => {
    const sim = await arena('fb-thing', 'thing');
    await sim.advance(21 * SEC);
    await sim.attack('ben', 'doom', { force: 'smite' });
    const msg = await sim.act('grab');
    expect(msg.victims).toEqual(['ben']);
    expect(mods.store.isCaught(fighter(sim, 'ben'))).toBe(true);
  });

  test('Pod People only poison, two at a time, and it never wears off by itself; the dice that would grab, poison', async () => {
    const sim = await arena('fb-pods', 'pods');
    sim.luckQueue.push(0.01, 0.2, 0.9, 0.5); // 0.01 is a grab for any other monster
    await sim.advance(5 * MINUTE);
    const last = sim.siege().lastAction;
    expect(last.kind).toBe('poison');
    expect(last.victims).toHaveLength(2);
    const msg = sim.sends().find(m => m.id === last.messageId);
    expect(lines(msg).at(-1)).toBe('-# 🤢 Until a helpful `/potion give` cures them, their attacks do half damage. It won\'t wear off by itself.');
    for (const u of last.victims) expect(fighter(sim, u).poisoned).toMatchObject({ until: null, by: 'monster' });
    sim.calm();
    await sim.advance(40 * MINUTE);
    for (const u of last.victims) expect(mods.store.poisonedNow(fighter(sim, u), clock.now)).toBe(true);
  });

  test('The Count\'s weights (grab 55) turn the same draw into a grab where The Blob\'s (grab 50) poisons', async () => {
    for (const [monster, kind] of [['count', 'grab'], ['blob', 'poison']]) {
      const sim = await arena(`fb-weights-${monster}`, monster);
      sim.luckQueue.push(0.52, 0.5, 0.5);
      await sim.advance(5 * MINUTE);
      expect([monster, sim.siege().lastAction.kind]).toEqual([monster, kind]);
    }
  });

  test('The Wolfman heals 1.5% of his max HP each time he acts, roars included (and the HP still adds up)', async () => {
    const sim = await arena('fb-wolfman', 'wolfman');
    const hp = sim.siege().hp;
    const msg = await sim.act('roar');
    expect(lines(msg)).toEqual([said('wolfman', 'roar', 1, []), '-# 💚 The Wolfman heals 2 HP.']); // round(0.015 × 135)
    expect(msg.allowedMentions).toEqual({ parse: [], users: [] });
    expect([sim.siege().hp, sim.siege().healed]).toEqual([hp + 2, 2]);
  });
});

describe('switched off, voided, restarted', () => {
  test('/rescue off: the monster lets the grabbed go and only roars; /potion off: it cures the poisoned and only roars', async () => {
    const sim = await arena('fb-off');
    await sim.act('grab', ['ana']);
    await sim.toggle('rescue', false);
    await sim.advance(MINUTE);
    expect(fighter(sim, 'ana').caught).toBeNull();
    const roar = await sim.act('grab', ['ben']);
    expect([roar.actionKind, roar.allowedMentions.users]).toEqual(['roar', []]);
    await sim.act('poison', ['ben']);
    expect(mods.store.poisonedNow(fighter(sim, 'ben'), clock.now)).toBe(true);
    await sim.toggle('potion', false);
    await sim.advance(MINUTE);
    expect(fighter(sim, 'ben').poisoned).toBeNull();
    expect((await sim.act('poison', ['cat'])).actionKind).toBe('roar');
  });

  test('the bot dies before the ping: nobody is grabbed; 90 s on, the action is void — across the restart', async () => {
    const sim = await arena('fb-void-before');
    sim.fault({ on: 'send', kind: 'other', mode: 'crash-before' });
    const msg = await sim.act('grab', ['ana']);
    expect(sim.crashes).toBe(1);
    expect(msg).toBeNull();
    expect(sim.siege().lastAction).toMatchObject({ kind: 'void', reason: 'not-announced' });
    expect(fighter(sim, 'ana').caught).toBeNull();
    expect(sim.sends().filter(m => m.kindTag === 'action')).toHaveLength(0);
  });

  test('the bot dies after the ping went out, before it was applied: void too — pinged, never punished', async () => {
    const sim = await arena('fb-void-after');
    sim.fault({ on: 'send', kind: 'other', mode: 'crash-after' });
    await sim.act('grab', ['ana']);
    expect(sim.sends().filter(m => m.kindTag === 'action')).toHaveLength(1);
    expect(sim.siege().lastAction.kind).toBe('void');
    expect(fighter(sim, 'ana').caught).toBeNull();
    await sim.advance(11 * MINUTE);
    expect(fighter(sim, 'ana').out).toBe(false);
  });

  test('Discord refusing the ping voids the action at once; the next one comes 5 minutes later', async () => {
    const sim = await arena('fb-void-refused');
    sim.fault({ on: 'send', kind: 'other', mode: 'fail' });
    await sim.act('grab', ['ana']);
    expect(sim.siege().lastAction).toMatchObject({ kind: 'void', reason: 'send-failed' });
    expect(sim.siege().nextActionAt).toBe(clock.now + 5 * MINUTE);
  });
});

describe('prizes and titles', () => {
  test('the 4th siege win brings a Silver Bullet (+10); the 15th free or cure, Field Medic; the 10th grab, Monster Chow — each +10 to the siege game', async () => {
    const sim = await arena('fb-prizes');
    mods.scores.mutateScores('fb-prizes', (d) => {
      (d.users.ana.progress ||= {}).siegewins = 3;
      d.users.ben.lifetime.siege = { wins: 0, mvps: 0, kaiju: 0, assists: 14 };
      d.users.cat.lifetime.siege = { wins: 0, mvps: 0, kaiju: 0, grabbed: 9 };
    });
    const grab = await sim.act('grab', ['cat']);
    expect(lines(grab).at(-1)).toBe('-# 📜 cat earned a title: 🍖 Monster Chow (+10)');
    const free = await sim.rescue('ben', 'cat', { force: 'rescued' });
    expect(lines(free.reply).at(-1)).toBe('-# 📜 ben earned a title: 🩹 Field Medic (+10)');
    sim.calm();
    while (sim.siege().hp > 0) {
      await sim.advance(21 * SEC);
      for (const u of ['ana', 'ben', 'cat']) if (sim.siege().hp > 0) await sim.attack(u, 'doom', { force: 'smite' });
    }
    await sim.advance(MINUTE);
    const grant = sim.siege().result.grants.find(g => g.userId === 'ana');
    expect(grant.prize).toEqual({ item: 'silver', points: 10, overflow: false });
    const [results] = sim.messagesFor(sim.siege().id, 'results');
    expect(results.embeds[0].toJSON().description).toMatch(/ana · `\d+` damage · `\+\d+`.* · 🎁 🥈 Silver Bullet \+10/);
    // The prize's, and the MVP's loot if that was a Silver Bullet too
    expect(sim.scores().users.ana.glovebox.silver).toBe(1 + (grant.loot?.item === 'silver' ? 1 : 0));
    expect(sim.scores().users.ana.progress.siegewins).toBe(0);
  });
});

describe('random sieges', () => {
  /** ana, ben and cat play a game each, now (activity: 3 today, 3 in the last 30 minutes) */
  async function around(sim, who = ['ana', 'ben', 'cat']) {
    for (const [i, u] of who.entries()) await sim.play(u, 'doom', who[(i + 1) % who.length]);
  }

  test('the rules: on with 2+ playing now and 3+ today; it attacks where they last played, at random, pool scaled for `often`', async () => {
    clock.now = T0;
    const sim = new Sim('fb-random', { seed: 11 });
    await sim.configure({ twists: false, happeningFrequency: 'off', siegeFrequency: 'often' });
    const noSiege = async () => {
      sim.luckQueue.push(0, 0);
      await sim.advance(MINUTE);
      expect(sim.siege()).toBeNull();
      sim.luckQueue.length = 0;
    };
    // Three played today, but only one in the last 30 minutes: not enough, whatever the dice say
    await around(sim);
    sim.jumpTo(clock.now + 40 * MINUTE);
    await around(sim, ['ana']);
    await noSiege();
    // Two now, but not three in the last 24 hours
    sim.jumpTo(clock.now + 25 * HOUR);
    await around(sim, ['ana', 'ben']);
    await noSiege();
    // Three now: the dice say yes
    await sim.advance(21 * SEC);
    await around(sim);
    sim.luckQueue.push(0, 0.5);
    await sim.advance(MINUTE);
    const s = sim.siege();
    expect(s).toMatchObject({ source: 'random', status: 'live', channelId: 'games', poolScale: 0.6, startedBy: null });
    expect(sim.messagesFor(s.id, 'card')).toHaveLength(1);

    // Beaten by three: the pool is 24 × 0.6 = 14, split by damage
    sim.calm();
    while (sim.siege().hp > 0) {
      await sim.advance(21 * SEC);
      for (const u of ['ana', 'ben', 'cat']) if (sim.siege().hp > 0) await sim.attack(u, 'doom', { force: 'smite' });
    }
    await sim.advance(MINUTE);
    const won = sim.siege();
    const fighters = mods.store.fightersOf(won);
    const total = fighters.reduce((n, f) => n + f.damage, 0);
    const pool = Math.round(24 * 0.6);
    expect(won.result.grants.map(g => g.points)).toEqual(fighters.map((f, i) => Math.min(30, Math.max(2, Math.round(pool * f.damage / total))) + (i === 0 ? 5 : 0)));
    sim.writeTranscript('fb-random');
  });

  test('20 hours after the last one ended, and never while a happening is on', async () => {
    clock.now = T0;
    const sim = new Sim('fb-random-gap', { seed: 12 });
    await sim.configure({ twists: false, happeningFrequency: 'off', siegeFrequency: 'normal' });
    await sim.start({ monster: 'blob', minutes: 30 });
    await sim.end();
    const ended = sim.siege().finishedAt;
    // 19 h later, everyone around, the dice saying yes: too soon
    sim.jumpTo(ended + 19 * HOUR);
    await around(sim);
    sim.luckQueue.push(0, 0.5);
    await sim.advance(MINUTE);
    expect(sim.siege().finishedAt).toBe(ended);
    sim.luckQueue.length = 0;
    // 20 h on, but a happening is running: not now
    sim.jumpTo(ended + 20 * HOUR + MINUTE);
    await around(sim);
    await sim.command('admin', 'eggshen-config-games', { subcommand: 'happenings', options: { start: 'fog' } });
    sim.luckQueue.push(0, 0.5);
    await sim.advance(MINUTE);
    expect(sim.siege().finishedAt).toBe(ended);
    sim.luckQueue.length = 0;
    // The happening over (45 minutes), people still playing: it comes
    sim.jumpTo(ended + 21 * HOUR + 30 * MINUTE);
    await around(sim);
    sim.luckQueue.push(0, 0.5);
    await sim.advance(MINUTE);
    expect(sim.siege()).toMatchObject({ source: 'random', status: 'live' });
  });

  test('the rate: on a server that plays 4 hours every evening, about 1.5, 3 and 5 a week (rare, normal, often) — 100 weeks each, measured', () => {
    const { randomSiegeEligibility, randomSiegeChance } = mods.store;
    const DAYM = 24 * HOUR;
    const rates = {};
    for (const frequency of ['rare', 'normal', 'often']) {
      const luck = seeded(99);
      const settings = { siegeFrequency: frequency };
      const state = { activity: { recent: {} }, siege: null, happening: null };
      let count = 0;
      const start = Date.UTC(2026, 0, 5);
      for (let day = 0; day < 700; day++) {
        // 18:00–22:00 UTC, three members playing every few minutes
        for (let m = 0; m < 240; m++) {
          const now = start + day * DAYM + 18 * HOUR + m * MINUTE;
          if (m % 5 === 0) for (const u of ['a', 'b', 'c']) state.activity.recent[u] = now;
          if (!randomSiegeEligibility(state, settings, now).ok) continue;
          if (!(luck() < randomSiegeChance(frequency))) continue;
          count += 1;
          // It runs 45 minutes and ends; its results posted
          state.siege = { status: 'escaped', startedAt: now, finishedAt: now + 45 * MINUTE, result: { announcedAt: now + 45 * MINUTE } };
        }
      }
      rates[frequency] = count / 100;
    }
    // Reported for the record (the report quotes these)
    process.stdout.write(`random sieges a week: ${JSON.stringify(rates)}\n`);
    expect(rates.rare).toBeGreaterThan(1.5 * 0.8);
    expect(rates.rare).toBeLessThan(1.5 * 1.2);
    expect(rates.normal).toBeGreaterThan(3 * 0.85);
    expect(rates.normal).toBeLessThan(3 * 1.15);
    expect(rates.often).toBeGreaterThan(5 * 0.85);
    expect(rates.often).toBeLessThan(5 * 1.15);
  });
});

describe('the attack lines', () => {
  test('every siege attack reply is one of the siege\'s own lines — never a person-targeted game line', async () => {
    const sim = await arena('fb-lines', 'gremlins', { fighters: [] });
    sim.calm();
    const own = new Set();
    for (const weapon of ['food', 'doom', 'potion']) {
      for (const l of mods.attackLines[weapon]) own.add(l.text.split('{user}').join('<@ana>').split('{monster}').join('**Gremlins**'));
    }
    // The games' own lines, filled as R5 filled them with the monster as the target
    const personal = new Set([
      ...Object.values((await import('../src/data/foodfightLines.js')).FOODFIGHT_LINES).flat(),
      ...Object.values((await import('../src/data/doomLines.js')).DOOM_LINES).flat(),
      ...Object.values((await import('../src/data/potionLines.js')).POTION_LINES).flat(),
    ].map(l => (typeof l === 'string' ? l : l.text).replace(/{thrower}|{feeder}|{user}|{giver}/g, '<@ana>').replace(/{target}|{receiver}/g, '**Gremlins**')));
    const outcomes = { food: ['splat', 'splash', 'splatback'], doom: ['smite', 'dodged', 'spooked'], potion: ['poisoned', 'fizzled'] };
    for (const [weapon, list] of Object.entries(outcomes)) {
      for (const outcome of list) {
        await sim.advance(21 * SEC);
        const a = await sim.attack('ana', weapon, { force: outcome });
        const first = lines(a.reply)[0];
        expect(own.has(first)).toBe(true);
        expect(personal.has(first)).toBe(false);
      }
    }
  });
});

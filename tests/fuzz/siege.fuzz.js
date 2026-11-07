/**
 * Random sieges (on demand — not part of npm test): long, seeded sequences
 * of what admins and members really do, in orders nobody would write down
 * as a scenario — attacks from the wrong channel or an uncached thread,
 * items picked from the autocomplete, a weapon's game switched off
 * mid-fight, /siege switched off, ends racing kills, time jumping 1–30
 * minutes, deploys at any moment, and Discord failing in every way it can
 * (refusing, timing out after posting, the bot dying before or after a
 * send or an edit reached it).
 *
 * After every step the simulator's invariants must hold (see
 * tests/harness/siegeSim.js): every interaction answered once, nothing
 * Discord would reject, HP and credit adding up, at most one arrival and
 * one results message per siege, the card matching the store or frozen,
 * points moving only by attacks and one payout, refusals costing nothing.
 * At the end, whatever state it's in, the admin can end the siege and
 * start a new one.
 *
 * 2.75.0: members back fighters at random (regulars or not, in the right
 * channel or not, early or late), and the simulator's backing and honours
 * invariants hold through every restart and fault.
 *
 * Pace (2.74.0): each run is a server at a pace — week (the default) or
 * quick by default, any of the five with SIM_FUZZ_PACES=all (or a list:
 * SIM_FUZZ_PACES=day,days3). A run at a slow pace also lets hours and nights
 * go by, so the busy clock, the allowance, digests nobody was around for,
 * the daily report, held results and night-boundary ends all happen in
 * random orders, deploys and faults included — and the simulator's pace
 * invariants hold after every step.
 *
 * Run with: npm run test:fuzz             (20 runs, 200 actions each)
 * More:     SIM_FUZZ_FIRST=3000 SIM_FUZZ_RUNS=40 npm run test:fuzz -- --testPathPattern siege
 *           Every restart the simulator does costs ~10 MB jest never gives
 *           back (see restartBot), so a long hunt is several runs of ~40
 *           seeds, each from its own SIM_FUZZ_FIRST, not one of hundreds.
 * A failure names its seed and lists every action. Replay one seed:
 *   SIM_SEED=1234 npm run test:fuzz -- --testPathPattern siege
 * Worth a run after changing anything in /siege, its store, card or scheduler.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { loadSim, clock, MINUTE, MEMBERS, Sim, seeded } from '../harness/siegeSim.js';

const SEC = 1000;
let mods;

beforeAll(async () => {
  clock.install();
  mods = await loadSim();
});

function rng(seed) {
  const next = seeded(seed);
  return {
    float: next,
    int: (n) => Math.floor(next() * n),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
  };
}

const WEAPONS = ['food', 'doom', 'potion'];
const GAMES = ['foodfight', 'doom', 'potion', 'rescue'];
const ITEMS = ['gpie', 'vhs', 'penny', 'silver', 'garlic', 'antid', 'holyw'];
/** The paces runs are drawn from: week and quick unless SIM_FUZZ_PACES says (`all`, or a comma list) */
const PACE_LIST = (() => {
  const env = process.env.SIM_FUZZ_PACES;
  if (!env) return ['week', 'quick'];
  return env === 'all' ? ['quick', 'evening', 'day', 'days3', 'week'] : env.split(',').map(x => x.trim()).filter(Boolean);
})();

const FAULTS = [
  { on: 'send', kind: 'card', mode: 'crash-before' }, { on: 'send', kind: 'card', mode: 'crash-after' },
  { on: 'send', kind: 'card', mode: 'fail' }, { on: 'send', kind: 'card', mode: 'abort-after' },
  { on: 'edit', kind: 'card', mode: 'crash-before' }, { on: 'edit', kind: 'card', mode: 'crash-after' },
  { on: 'edit', kind: 'card', mode: 'fail' }, { on: 'edit', kind: 'card', mode: 'abort-after' },
  { on: 'edit', kind: 'card', mode: 'gone' },
  { on: 'send', kind: 'results', mode: 'crash-before' }, { on: 'send', kind: 'results', mode: 'crash-after' },
  { on: 'send', kind: 'results', mode: 'fail' }, { on: 'send', kind: 'results', mode: 'abort-after' },
  { on: 'send', kind: 'results', mode: 'abort-before' }, { on: 'send', kind: 'results', mode: 'gone' },
  // R6: the monster's action pings (and digest notices) — 'other' messages
  { on: 'send', kind: 'other', mode: 'crash-before' }, { on: 'send', kind: 'other', mode: 'crash-after' },
  { on: 'send', kind: 'other', mode: 'fail' }, { on: 'send', kind: 'other', mode: 'abort-after' },
  // 2.74.0: the daily report
  { on: 'send', kind: 'report', mode: 'crash-before' }, { on: 'send', kind: 'report', mode: 'crash-after' },
  { on: 'send', kind: 'report', mode: 'fail' }, { on: 'send', kind: 'report', mode: 'abort-after' },
];

const live = (sim) => sim.siege()?.status === 'live';

/** One random thing someone does. Returns a description for the log. */
async function randomAction(sim, r) {
  const who = r.chance(0.08) ? 'admin' : r.pick(sim.members);
  const roll = r.float();

  // No fight on: mostly an admin starts one
  if (!live(sim) && roll < 0.35) {
    const opts = {};
    if (r.chance(0.8)) opts.monster = r.pick(mods.monsters.MONSTER_KEYS);
    // A length from /siege start's own choices, or (half the time) the server's pace
    if (r.chance(0.5)) opts.length = r.pick(mods.commands.get('siege').LENGTHS).value;
    opts.channel = r.chance(0.85) ? 'games' : r.pick(['thread', 'lobby']);
    const i = await sim.start(opts);
    return `admin starts ${JSON.stringify(opts)} → ${i.reply?.content?.slice(0, 40) ?? '(died)'}`;
  }

  // Attacks are most of what happens (so sieges are won, not only ended or escaped)
  if (roll < 0.6) {
    const weapon = r.pick(WEAPONS);
    const where = r.float();
    const channel = where < 0.8 ? 'games' : where < 0.93 ? 'thread' : 'lobby';
    const uncached = channel === 'thread' && r.chance(0.3);
    let item = null;
    if (r.chance(0.2)) {
      const choices = await sim.suggestItems(who, r.chance(0.8) ? weapon : null);
      item = r.chance(0.8) && choices.length ? r.pick(choices).value : r.pick(ITEMS);
    }
    const i = await sim.attack(who, weapon, { item, channel, uncached });
    return `${who} attacks ${weapon}${item ? ` item:${item}` : ''} in #${channel}${uncached ? ' (uncached)' : ''} → ${(i.reply?.content || '(died)').split('\n').at(-1).slice(0, 50)}`;
  }

  if (roll < 0.72) {
    const s = 5 + r.int(21);
    await sim.advance(s * SEC);
    return `${s}s pass`;
  }
  if (roll < 0.77) {
    // 2.74.0: a campaign over days also sees hours and nights go by, the bot
    // asleep between (a pass when it wakes): reports, digests nobody was
    // around for, a day out ending, a night-boundary end, held results
    const s = sim.siege();
    if (s && mods.pace.timingsOf(s).busy && r.chance(0.4)) {
      const to = r.chance(0.2) && live(sim) ? s.endsAt - r.int(3) * MINUTE : clock.now + (1 + r.int(20)) * 60 * MINUTE;
      sim.jumpTo(Math.max(clock.now, to));
      await sim.advance(MINUTE);
      return `jump to ${new Date(clock.now).toISOString().slice(5, 16)}`;
    }
    const m = r.chance(0.7) ? 1 + r.int(5) : 1 + r.int(30);
    await sim.advance(m * MINUTE);
    return `${m} min pass`;
  }
  if (roll < 0.776) {
    const i = await sim.end(r.chance(0.9) ? 'admin' : who);
    return `${i.user.id} ends → ${i.reply?.content?.slice(0, 40) ?? '(died)'}`;
  }
  if (roll < 0.82) {
    await sim.status(who, r.chance(0.8) ? 'games' : 'lobby');
    return `${who}: /siege status`;
  }
  // R6: someone helps whoever the monster has grabbed or poisoned (or aims at a free one)
  if (roll < 0.845) {
    const s = sim.siege();
    const held = Object.entries(s?.participants || {}).filter(([, p]) => p.caught?.at).map(([u]) => u);
    const sick = Object.entries(s?.participants || {}).filter(([, p]) => p.poisoned).map(([u]) => u);
    const helper = r.pick(sim.members);
    if (held.length && r.chance(0.6)) {
      const target = r.pick(held);
      if (target === helper) return 'skip self-rescue';
      // Half the time the outcome is forced, so swaps and failed rescues happen as often as frees
      const force = r.chance(0.5) ? r.pick(['rescued', 'sacrificed', 'caught']) : null;
      const item = r.chance(0.15) ? 'holyw' : null;
      if (item && force === 'caught') return 'skip holy-water-caught';
      if (item) sim.giveItem(helper, 'holyw');
      await sim.rescue(helper, target, { item, force });
      return `${helper} rescues ${target}${force ? ` (${force})` : ''}${item ? ' with Holy Water' : ''}`;
    }
    const target = sick.length && r.chance(0.8) ? r.pick(sick) : r.pick(sim.members.filter(m => m !== helper));
    if (target === helper) return 'skip self-cure';
    await sim.cure(helper, target, { type: r.chance(0.8) ? 'health' : 'poison' });
    return `${helper} gives a potion to ${target}`;
  }
  if (roll < 0.86) {
    const game = r.pick(GAMES);
    const target = r.pick(sim.members.filter(m => m !== who));
    await sim.play(who === 'admin' ? r.pick(sim.members) : who, game, target);
    return `${who} plays ${game} at ${target}`;
  }
  if (roll < 0.88) {
    const setting = r.pick(['siege', 'foodfight', 'doom', 'potion', 'rescue']);
    const on = r.chance(0.6);
    await sim.toggle(setting, on);
    return `toggle ${setting} ${on ? 'on' : 'off'}`;
  }
  if (roll < 0.90) {
    const name = r.pick(['scoreboard', 'leaderboard']);
    await sim.command(who, name);
    return `${who}: /${name}`;
  }
  if (roll < 0.91) {
    await sim.restart();
    return 'restart (deploy)';
  }
  // R6: a quiet day goes by (2.74.0: the pace's gap), then people play and the dice favour a random siege
  if (roll < 0.92 && !live(sim) && sim.randomFrequency !== 'off') {
    sim.jumpTo(clock.now + (mods.pace.randomGapHours(sim.pace, sim.randomFrequency) + 1) * 60 * MINUTE);
    for (const [i, u] of sim.members.slice(0, 3).entries()) await sim.play(u, 'doom', sim.members[(i + 1) % 3]);
    sim.luckQueue.push(0, r.float());
    await sim.advance(MINUTE);
    sim.luckQueue.length = 0;
    return `a day later the dice say yes → ${sim.siege()?.source === 'random' && live(sim) ? `random ${sim.siege().monster}` : 'none'}`;
  }
  if (roll < 0.955) {
    // The bot loses (or gets back) what it needs in the games channel: the
    // results wait, retried each pass, and a start there is refused
    const ok = r.chance(0.6);
    sim.grant('games', ok ? ['ViewChannel', 'SendMessages', 'SendMessagesInThreads', 'EmbedLinks'] : ['ViewChannel', 'SendMessages']);
    return `bot permissions in #games ${ok ? 'restored' : 'lose Embed Links'}`;
  }
  if (roll < 0.97) {
    const f = r.pick(FAULTS);
    sim.fault(f);
    return `arm fault ${f.on}/${f.kind}/${f.mode}`;
  }
  if (roll < 0.985) {
    // 2.75.0: someone backs a fighter — usually one who has attacked, from
    // the siege's channel; often made a regular first (3 nights in a run of
    // 200 steps is rare), with a random month to stake from
    const s = sim.siege();
    const backer = r.pick(sim.members);
    const fighters = Object.entries(s?.participants || {}).filter(([, p]) => p.attacks > 0).map(([u]) => u);
    const fighter = fighters.length && r.chance(0.85) ? r.pick(fighters) : r.pick(sim.members);
    if (r.chance(0.7)) sim.regular(backer, { points: r.int(20), nights: 2 + r.int(4) });
    const points = 2 + r.int(9); // Discord enforces the option's 2–10
    const channel = r.chance(0.9) ? 'games' : r.pick(['thread', 'lobby']);
    const i = await sim.back(backer, fighter, points, { channel });
    return `${backer} backs ${fighter} for ${points} in #${channel} → ${(i.reply?.content || '(died)').split('\n')[0].slice(0, 50)}`;
  }
  // A prize turns up (the scores file, as a play's prize would have it)
  const item = r.pick(ITEMS);
  sim.giveItem(who, item);
  return `${who} gets a ${item}`;
}

/**
 * Whatever state it's in, the admin can end the siege and start a new one:
 * the switches back on, Discord behaving, an end, a few passes (results
 * posted, or a claim cut short given up), then a start that works.
 */
async function finish(sim) {
  sim.faults = [];
  sim.grant('games', ['ViewChannel', 'SendMessages', 'SendMessagesInThreads', 'EmbedLinks']);
  // A random siege could start in the minutes below, and rightly refuse the start
  await sim.configure({ siegeFrequency: 'off' });
  for (const setting of ['siege', 'foodfight', 'doom', 'potion', 'rescue']) await sim.toggle(setting, true);
  await sim.end();
  await sim.advance(3 * MINUTE);
  const start = await sim.start({ monster: 'blob' });
  expect(start.reply?.content).toMatch(/^🟢 \*\*The Blob\*\* is attacking <#games>/);
  expect(sim.siege()).toMatchObject({ monster: 'blob', status: 'live' });
  // With no length, the server's pace's
  expect(sim.siege().t.key).toBe(sim.pace);
  // …and a member can hit it
  await sim.advance(25 * SEC);
  const hit = await sim.attack(sim.members[0], 'doom');
  expect(hit.reply.ephemeralFor).toBeNull();
  sim.finalChecks();
}

/** SIM_FUZZ_TALLY=1: what the runs exercised, printed at the end */
const tally = new Map();
const count = (k, n = 1) => tally.set(k, (tally.get(k) || 0) + n);
afterAll(() => {
  if (process.env.SIM_FUZZ_TALLY === '1') {
    process.stdout.write(`${[...tally].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${String(n).padStart(6)}  ${k}`).join('\n')}\n`);
  }
});

function record(sim, log) {
  for (const line of log) count(line.replace(/→.*$/, '').replace(/\d+/g, 'N').replace(/\{.*\}/, '{…}').replace(new RegExp(`\\b(${MEMBERS.join('|')})\\b`, 'g'), 'member').trim());
  for (const rec of sim.sieges.values()) count(`siege ${rec.finished?.status || 'still live'}`);
  count('bot crashes', sim.crashes);
  count('results messages', sim.sends().filter(m => m.kindTag === 'results').length);
  count('arrival messages', sim.sends().filter(m => m.kindTag === 'card').length);
  count('card edits', sim.discord.events.filter(e => e.kind === 'edit' && e.message.kindTag === 'card').length);
  count('attacks that landed', sim.discord.events.filter(e => e.kind === 'reply' && /^\/siege attack/.test(e.via || '')).length);
  // R6
  for (const m of sim.sends().filter(x => x.kindTag === 'action')) count(`monster ${m.actionKind}s`);
  count('digests', sim.sends().filter(x => x.kindTag === 'digest').length);
  const replies = sim.discord.events.filter(e => e.kind === 'reply').map(e => e.snap?.content || '');
  count('fighters freed', replies.filter(c => /^-# (🛟 .+ freed .+ from |🕯️ .+ freed .+, and)/m.test(c)).length);
  count('sacrifice swaps', replies.filter(c => /^-# 🕯️ .+ freed .+, and/m.test(c)).length);
  count('poisons cured', replies.filter(c => /^-# 🧪 .+ cured /m.test(c)).length);
  count('attacks refused: grabbed', sim.discord.events.filter(e => e.kind === 'ephemeral' && /has you!/.test(e.snap?.content || '')).length);
  count('random sieges started', log.filter(l => /dice say yes → random/.test(l)).length);
  // 2.74.0
  count(`runs at ${sim.pace} pace`);
  count('daily reports', sim.sends().filter(x => x.kindTag === 'report').length);
  count('attacks refused: allowance', sim.discord.events.filter(e => e.kind === 'ephemeral' && /attacks tonight\. The next/.test(e.snap?.content || '')).length);
  count('attacks refused: out for a day', sim.discord.events.filter(e => e.kind === 'ephemeral' && /you're out until/.test(e.snap?.content || '')).length);
  count('escapes whose results were held', [...sim.sieges.values()].filter(rec => rec.held).length);
  // 2.75.0
  const backed = sim.discord.events.filter(e => /^\/siege back/.test(e.via || ''));
  count('backings placed', backed.filter(e => e.kind === 'reply').length);
  count('backings refused', backed.filter(e => e.kind === 'ephemeral').length);
  for (const rec of sim.sieges.values()) {
    const s = sim.state().siege?.id === rec.id ? sim.state().siege : null;
    for (const b of s?.result?.backing || []) count(`backings settled: ${b.outcome}${b.orphan ? ' (orphan)' : ''}`);
    if (s?.result?.wangChi) count(`Wang Chis ${s.result.wangChi.held ? 'held the line' : 'by help'}`);
  }
  count('frees and cures past the cap, uncredited', replies.filter(c => /doesn't count toward/.test(c)).length);
}

const RUNS = Number(process.env.SIM_FUZZ_RUNS || 20);
const STEPS = Number(process.env.SIM_FUZZ_STEPS || 200);
const FIRST = Number(process.env.SIM_FUZZ_FIRST || 2000);
const seeds = process.env.SIM_SEED ? [Number(process.env.SIM_SEED)] : Array.from({ length: RUNS }, (_, i) => FIRST + i);

describe('random sieges', () => {
  for (const seed of seeds) {
    test(`seed ${seed}: ${STEPS} random actions, every invariant holding, then a fresh siege`, async () => {
      const r = rng(seed);
      clock.now = Date.UTC(2026, 10, 9, 18, 0, 0) + r.int(24 * 60) * MINUTE;
      // The server's pace (2.74.0): week or quick, or any of the five with SIM_FUZZ_PACES
      const pace = PACE_LIST[seed % PACE_LIST.length];
      const sim = new Sim(`siege-fuzz-${seed}`, { seed, members: MEMBERS.slice(0, 3 + r.int(MEMBERS.length - 2)), pace });
      // Random sieges (R6) for some runs: often enough to see a few in 200 steps
      const frequency = r.pick(['off', 'off', 'normal', 'often']);
      // (random happenings off in those: their dice are drawn first in a pass)
      await sim.configure(frequency === 'off' ? { siegeFrequency: frequency } : { siegeFrequency: frequency, happeningFrequency: 'off' });
      sim.randomFrequency = frequency;
      // A server that's been playing: members around in the last week set
      // a campaign's HP (a fresh server's monster sits at the 40-HP floor,
      // and is beaten before the allowance, a digest or a report can happen)
      const regulars = pace === 'quick' ? 0 : 4 + r.int(10);
      for (let i = 0; i < regulars; i++) mods.happenings.noteActivity(sim.guildId, { channelId: 'games', userId: `regular${i}` }, clock.now - (1 + r.int(5)) * 24 * 60 * MINUTE);
      const log = [`pace: ${pace} · random sieges: ${frequency} · ${regulars} regulars this week`];
      try {
        for (let i = 0; i < STEPS; i++) log.push(await randomAction(sim, r));
        log.push('— finishing —');
        await finish(sim);
        record(sim, log);
      } catch (e) {
        sim.writeTranscript(`fuzz-${seed}`);
        e.message = `Seed ${seed} (replay: SIM_SEED=${seed} npm run test:fuzz -- --testPathPattern siege)\nActions:\n  ${log.join('\n  ')}\n\n${e.message}`;
        throw e;
      }
    }, 120_000);
  }
});

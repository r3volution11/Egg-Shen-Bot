/**
 * Random tournaments (on demand — not part of npm test, which it would
 * nearly double): long, seeded sequences of things people really do, in
 * orders nobody would write down as a scenario — members clicking ballots
 * from three rounds ago, the admin opening and closing mid-vote, time
 * passing at odd moments, buttons on old posts pressed out of turn.
 *
 * After every action the simulator's invariants must hold (see
 * tests/harness/tournamentSim.js): every click answered as Discord allows,
 * no "An error occurred", stored votes consistent, at most 5 matchups on a
 * ballot. At the end, whatever state it's in, the admin must still be able
 * to finish the tournament.
 *
 * Run with: npm run test:fuzz            (20 tournaments, 60 actions each)
 * More:     SIM_FUZZ_RUNS=500 SIM_FUZZ_STEPS=150 npm run test:fuzz
 * A failure names its seed and lists every action. Replay one seed:
 *   SIM_SEED=1234 npm run test:fuzz
 * Worth a run after changing anything in the tournament flow.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { loadSim, finishSim, clock, favorite } from '../harness/tournamentSim.js';

let Sim;

beforeAll(async () => {
  ({ Sim } = await loadSim());
  clock.install();
});

afterAll(() => finishSim());

const HOUR = 60 * 60 * 1000;

// Titles already in the recorded API data (tournament-sim.test.js)
const MOVIES = [
  ['Alien', 1979], ['The Thing', 1982], ['Halloween', 1978], ['Jaws', 1975],
  ['The Shining', 1980], ['Scream', 1996], ['Get Out', 2017], ['Hereditary', 2018],
  ['Psycho', 1960], ['The Exorcist', 1973], ['Poltergeist', 1982], ['The Fly', 1986],
  ['Carrie', 1976], ['It Follows', 2015], ['The Babadook', 2014], ['Midsommar', 2019],
];

/** A small seeded PRNG (mulberry32), so a failing run can be replayed exactly. */
function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    float: next,
    int: (n) => Math.floor(next() * n),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
  };
}

/** Every enabled, clickable button a user can see in the tournament channel. */
function visibleButtons(sim, userId) {
  const messages = [...sim.channel.posted, ...sim.discord.ephemeral(userId).filter(m => !m.deleted)];
  const out = [];
  for (const message of messages) {
    for (const c of message.allComponents) {
      if (c.customId && !c.disabled && c.type === 2) out.push({ message, customId: c.customId });
    }
  }
  return out;
}

/** One random thing someone does. Returns a description for the log. */
async function randomAction(sim, r) {
  const roll = r.float();
  const voter = r.pick(sim.voters);
  const t = sim.tournament();

  // Members clicking whatever they can see: ballots (new and old), public
  // posts, tiebreakers, admin pickers left in the channel
  if (roll < 0.50) {
    const who = r.chance(0.7) ? voter : 'admin';
    let buttons = visibleButtons(sim, who);
    if (!buttons.length) {
      // Nothing to vote on yet: what the admin would do next
      await sim.bracket('admin', 'open', { duration: '1d', matchups: 1 + r.int(4) });
      return '/bracket open (nothing to click)';
    }
    // The admin mostly presses the admin buttons (pickers left in the channel)
    const adminKinds = buttons.filter(b => /^(open_matchup|close_matchup|open_region)_/.test(b.customId));
    if (who === 'admin' && adminKinds.length && r.chance(0.8)) buttons = adminKinds;
    // Prefer a fresh ballot when there's voting to do
    if (r.chance(0.5)) {
      const start = buttons.filter(b => /^start_(group|knockout)_voting_/.test(b.customId));
      if (start.length) buttons = [start[start.length - 1]];
    }
    if (!buttons.length) return 'nothing to click';
    // Pick a kind of button first, then one of that kind: old ballots
    // vastly outnumber the admin's Close buttons, and a uniform pick almost
    // never pressed one (a broken Close button went unnoticed that way)
    const kinds = [...new Set(buttons.map(b => b.customId.replace(/_[^_]*$/, '').replace(/_\w{12}$/, '').replace(/_\d+$/, '')))];
    const kind = r.pick(kinds);
    const b = r.pick(buttons.filter(x => x.customId.startsWith(kind)));
    await sim.click(who, b.message, b.customId);
    return `${who} clicks ${b.customId}`;
  }

  // Time passes; the scheduler runs
  if (roll < 0.62) {
    const hours = r.pick([1, 3, 12, 25]);
    await sim.advance(hours * HOUR);
    return `${hours}h pass`;
  }

  // The admin runs something
  if (roll < 0.90) {
    const choice = r.int(7);
    if (choice === 0) {
      const opts = { duration: r.pick(['2h', '1d']) };
      if (r.chance(0.6)) opts.matchups = 1 + r.int(5);
      await sim.bracket('admin', 'open', opts);
      return `/bracket open ${JSON.stringify(opts)}`;
    }
    if (choice === 1) {
      if (t.status !== 'knockout') return 'skip open-matchup';
      const suggestions = await sim.suggest('admin', 'open-matchup', 'matchup');
      if (r.chance(0.3) || !suggestions.length) {
        await sim.bracket('admin', 'open-matchup', { duration: '1d' }); // the picker
        return '/bracket open-matchup (picker)';
      }
      const value = r.pick(suggestions).value;
      await sim.bracket('admin', 'open-matchup', { matchup: value, duration: '1d' });
      return `/bracket open-matchup ${value}`;
    }
    if (choice === 2) {
      if (t.status !== 'knockout') return 'skip close-matchup';
      const suggestions = await sim.suggest('admin', 'close-matchup', 'matchup');
      if (!suggestions.length || r.chance(0.3)) {
        await sim.bracket('admin', 'close-matchup', {});
        return '/bracket close-matchup (picker)';
      }
      const value = r.pick(suggestions).value;
      await sim.bracket('admin', 'close-matchup', { matchup: value });
      return `/bracket close-matchup ${value}`;
    }
    if (choice === 3) {
      await sim.bracket('admin', 'close', {});
      return '/bracket close';
    }
    if (choice === 4) {
      const type = t.status === 'group_stage' ? 'group' : 'knockout';
      const opts = { type, duration: '1d' };
      if (type === 'group') opts.group = r.pick(Object.keys(t.groups || { A: 1 }));
      await sim.bracket('admin', 'extend-voting', opts);
      return `/bracket extend-voting ${JSON.stringify(opts)}`;
    }
    if (choice === 5 && t.status === 'group_stage') {
      const open = Object.entries(t.groups).filter(([, g]) => g.votingOpen).map(([id]) => id);
      if (open.length) {
        await sim.bracket('admin', 'close-groups', { groups: open.join(',') });
        return `/bracket close-groups ${open.join(',')}`;
      }
    }
    await sim.bracket('admin', 'status');
    return '/bracket status';
  }

  // Anyone looks things up
  const sub = r.pick(['status', 'my-votes', 'view', 'list-groups']);
  await sim.bracket(voter, sub);
  return `${voter}: /bracket ${sub}`;
}

/**
 * Whatever state the tournament is in, the admin can finish it: open what's
 * next, everyone votes, deadlines pass, tiebreakers get votes.
 */
async function finish(sim) {
  for (let n = 0; n < 30 && sim.tournament().status !== 'completed'; n++) {
    const t = sim.tournament();
    const tiebreakers = sim.channel.posted.filter(m => m.allComponents.some(c => (c.customId || '').startsWith('tiebreaker_vote_') && !c.disabled));
    for (const post of tiebreakers) {
      const option = post.allComponents.find(c => (c.customId || '').startsWith('tiebreaker_vote_') && c.customId.endsWith('_0'));
      const tb = (t.tiebreakers || []).find(x => option && option.customId.includes(x.id));
      if (option && tb?.status === 'active') {
        for (const v of sim.voters) await sim.click(v, post, option.customId);
      }
    }
    const anythingOpen = (t.knockoutBracket || []).some(m => m.status === 'voting')
      || Object.values(t.groups || {}).some(g => g.votingOpen)
      || (t.tiebreakers || []).some(x => x.status === 'active');
    if (!anythingOpen) {
      await sim.bracket('admin', 'open', { duration: '1d', ...(t.status === 'knockout' || t.mode === 'bracket' ? { matchups: 4 } : {}) });
      if (sim.hasVotingPost()) {
        const post = sim.votingPost();
        for (const v of sim.voters) {
          const ballot = await sim.openBallot(v, post).catch(() => null);
          if (!ballot) continue;
          for (const c of ballot.allComponents) {
            const m = /^knockout_vote_(\w+)_1$/.exec(c.customId || '');
            if (m) await sim.click(v, ballot, c.customId);
            const g = /^group_vote_([A-L])_([01])$/.exec(c.customId || '');
            if (g && !(sim.tournament().votes?.[v]?.[g[1]] || []).includes(Number(g[2]))) await sim.click(v, ballot, c.customId);
          }
        }
      }
    }
    await sim.passDeadlines();
  }
  return sim.tournament().status;
}

async function setUp(sim, r) {
  const groups = r.chance(0.3);
  if (groups) {
    await sim.bracket('admin', 'create', { name: 'Fuzz Groups', 'max-titles': 36 });
    await sim.bracket('admin', 'resize', { groups: 4 });
    for (const [i, [title, year]] of MOVIES.entries()) await sim.addTitle('movie', title, year, { group: 'ABCD'[Math.floor(i / 4)] });
    return 'groups of 4';
  }
  const size = r.pick([2, 4, 8, 16]);
  await sim.bracket('admin', 'create', { name: 'Fuzz Cup', 'max-titles': size });
  for (const [title, year] of MOVIES.slice(0, size)) await sim.addTitle('movie', title, year);
  return `${size} titles`;
}

const RUNS = Number(process.env.SIM_FUZZ_RUNS || 20);
const tally = new Map();
afterAll(() => {
  if (process.env.SIM_FUZZ_TALLY === '1') {
    process.stdout.write(`${[...tally].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${String(n).padStart(6)}  ${k}`).join('\n')}\n`);
  }
});
const STEPS = Number(process.env.SIM_FUZZ_STEPS || 60);
const seeds = process.env.SIM_SEED ? [Number(process.env.SIM_SEED)] : Array.from({ length: RUNS }, (_, i) => 1000 + i);

describe('random tournaments', () => {
  for (const seed of seeds) {
    test(`seed ${seed}: ${STEPS} random actions, every invariant holding, then finished`, async () => {
      const r = rng(seed);
      const sim = new Sim(`fuzz-${seed}`, { voters: 2 + r.int(4) });
      const log = [];
      try {
        log.push(await setUp(sim, r));
        for (let i = 0; i < STEPS && sim.tournament().status !== 'completed'; i++) {
          const did = await randomAction(sim, r);
          log.push(did);
          const kind = did.replace(/_[0-9a-f]{12}/g, '_<id>').replace(/\d+/g, 'N').replace(/\{.*\}/, '').replace(/voterN/, 'voter');
          tally.set(kind, (tally.get(kind) || 0) + 1);
        }
        log.push('— finishing —');
        const status = await finish(sim);
        expect(status).toBe('completed');
      } catch (e) {
        e.message = `Seed ${seed} (replay: SIM_SEED=${seed} npm run test:fuzz)\nActions:\n  ${log.join('\n  ')}\n\n${e.message}`;
        throw e;
      }
    });
  }
});

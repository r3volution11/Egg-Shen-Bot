/**
 * The games' balance, measured (on demand — not part of npm test): seeded
 * months of a whole server playing on the REAL rules — gameRewards.js's
 * numbers, the line files' odds, beginPlay/finishPlay/recordPlay, the siege
 * store and the scheduler's siege rules (tests/harness/balanceSim.js says
 * exactly what's real and what's an assumption about people).
 *
 * The numbers in gameRewards.js were designed against a simulation like
 * this one (the plan's: 80 runs of a 15-player server over 30 days). This
 * holds them to the targets that simulation was built for:
 *   - a typical member's bonus + siege share of their month's points ≤ 35%
 *     (designed at 28%): bonuses (prizes, titles, nights, twists,
 *     happenings) plus everything the siege gave (attacks and payouts)
 *   - a typical member earns an item every 1.5–3.5 days (designed at 2.2):
 *     prizes, Night Lights, Glovebox Finds, siege loot and the siege-wins
 *     prize, a full stack's +2 included (it was earned)
 *   - a member at the daily cap (the grinder: 80 plays a night) gets at
 *     most 62 prizes a month: DAILY.prizes × 30 nights, plus the siege-wins
 *     prize
 *   - sieges are won 55–85% of the time, on a 15-player server and a
 *     5-player one (the dial, SIEGE.dial, is meant to settle there)
 * A miss is a finding for whoever tunes the numbers, not something to
 * retune here: the table says by how much.
 *
 * Every member's points are also split by where they came from, and the
 * split must add up to what the scores file holds — so a reward the
 * ledger doesn't know about fails the run instead of skewing the shares.
 *
 * Run with: npm run test:fuzz -- --testPathPattern game-balance   (~45 s)
 *           (a bare path after `--` joins test:fuzz's --testMatch list and
 *           runs every fuzz file)
 * More:     BALANCE_SEEDS=10 npm run test:fuzz -- --testPathPattern game-balance
 *           seeds BALANCE_FIRST..BALANCE_FIRST+n−1 (default 3 from 1, ~11 s a
 *           15-player month); the 5-player server runs twice as many, as it's
 *           cheap and sees fewer sieges
 * What-if:  BALANCE_PACE=2 — everyone attacks a monster half as often
 * Worth a run after changing any number in gameRewards.js, a line file's
 * outcome mix, or the siege rules.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Our own directories, claimed before anything reads them (CLAUDE.md: test
// isolation): every src module is imported by the harness, after this
const ROOT = path.join(os.tmpdir(), 'egg-shen-tests', `game-balance-${process.env.JEST_WORKER_ID || process.pid}`);
const saved = {};
for (const [name, dir] of [['GUILD_GAMES_DIR', 'games'], ['GUILD_HAPPENINGS_DIR', 'happenings'], ['GUILD_CONFIGS_DIR', 'configs']]) {
  saved[name] = process.env[name];
  process.env[name] = path.join(ROOT, dir);
}
// Happenings bend plays here (jest.setup.js switches them off for suites that didn't ask)
saved.GAME_HAPPENINGS = process.env.GAME_HAPPENINGS;
process.env.GAME_HAPPENINGS = 'on';

const SEEDS = Math.max(1, Number(process.env.BALANCE_SEEDS) || 3);
const FIRST = Number(process.env.BALANCE_FIRST) || 1;
// A shorter "month" while working on the simulator itself; the targets are for 30
const DAYS = Math.max(1, Number(process.env.BALANCE_DAYS) || 30);
const seeds = (n) => Array.from({ length: n }, (_, i) => FIRST + i);

const TARGETS = {
  typicalShare: 0.35,
  itemDays: [1.5, 3.5],
  grinderPrizes: 62,
  winRate: [0.55, 0.85],
};

let sim;
const realConsole = {};

beforeAll(async () => {
  fs.rmSync(ROOT, { recursive: true, force: true });
  for (const k of ['log', 'warn', 'error']) realConsole[k] = console[k];
  sim = await import('../harness/balanceSim.js');
  await sim.loadBalance();
});

afterAll(() => {
  fs.rmSync(ROOT, { recursive: true, force: true });
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

/** Run months with the bot's own console quiet (the scheduler's warnings are noise here) */
async function months(roster, list, tag) {
  const out = [];
  for (const seed of list) {
    console.log = console.warn = console.error = () => {};
    try {
      out.push(await sim.runMonth({ seed, roster, guildId: `balance-${tag}-${seed}`, days: DAYS }));
    } finally {
      Object.assign(console, realConsole);
    }
  }
  return out;
}

const CATS = ['play', 'siegeAttack', 'prizes', 'titles', 'nights', 'twists', 'happenings', 'siegePayout'];
const sum = (list, f) => list.reduce((n, x) => n + f(x), 0);
const pct = (x) => `${(100 * x).toFixed(1)}%`;
const fixed = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—');

/** Per profile, over every member of it in every run: means per member-month */
function byProfile(results) {
  const rows = {};
  for (const run of results) {
    for (const l of Object.values(run.ledger)) {
      const row = (rows[l.profile] ||= { members: 0, points: Object.fromEntries(CATS.map(c => [c, 0])), total: 0, items: 0, overflow: 0, used: 0, defences: 0, stolen: 0, prizes: 0, siegePrizes: 0, nights: 0, plays: 0, attacks: 0, refused: 0, twists: 0, titles: 0, sieges: 0, maxPrizes: 0 });
      row.members += 1;
      for (const c of CATS) row.points[c] += l.points[c];
      row.total += sum(CATS, c => l.points[c]);
      const items = l.items.prize + l.items.nightlight + l.items.find + l.items.loot + l.items.siegePrize;
      row.items += items;
      row.overflow += l.items.overflow;
      row.used += l.used;
      row.defences += l.defences;
      row.stolen += l.stolen;
      row.prizes += l.prizes;
      row.siegePrizes += l.siegePrizes;
      row.maxPrizes = Math.max(row.maxPrizes, l.prizes + l.siegePrizes);
      row.nights += l.activeNights;
      row.plays += l.plays;
      row.attacks += l.attacks;
      row.refused += l.refused;
      row.twists += l.twists;
      row.titles += l.titleCount;
      row.sieges += l.sieges;
    }
  }
  return rows;
}

const bonusOf = (pts) => pts.prizes + pts.titles + pts.nights + pts.twists + pts.happenings;
const siegeOf = (pts) => pts.siegeAttack + pts.siegePayout;

function siegeSummary(results) {
  const all = results.flatMap(r => r.sieges);
  const won = all.filter(s => s.status === 'won').length;
  const escaped = all.filter(s => s.status === 'escaped').length;
  return {
    count: all.length, won, escaped, rate: won / Math.max(1, won + escaped),
    perWeek: all.length / results.length / (DAYS / 7),
    fighters: sum(all, s => s.fighters) / Math.max(1, all.length),
    hp: sum(all, s => s.maxHp) / Math.max(1, all.length),
    dials: results.map(r => r.dial),
    perSiege: Object.fromEntries(['grabbed', 'freed', 'digested', 'poisoned', 'cured'].map(k => [k, sum(all, x => x[k]) / Math.max(1, all.length)])),
    happenings: sum(results, r => r.happenings) / results.length,
  };
}

function table(title, results) {
  const rows = byProfile(results);
  const lines = [`\n${title} — ${results.length} month${results.length === 1 ? '' : 's'} (seeds ${results.map(r => r.seed).join(', ')})`];
  lines.push('profile   n  nights plays  atks |  total   play  siegeAtk prizes titles nights twists happ siegePay | bonus%  +siege% | items days/item ovfl used def stolen | prizes(+siege) max');
  for (const [profile, row] of Object.entries(rows)) {
    const per = (x) => x / row.members;
    const p = row.points;
    const share = (bonusOf(p) + siegeOf(p)) / row.total;
    const items = per(row.items);
    lines.push([
      profile.padEnd(8), String(row.members).padStart(2), fixed(per(row.nights)).padStart(6), fixed(per(row.plays), 0).padStart(5), fixed(per(row.attacks), 0).padStart(5), '|',
      fixed(per(row.total), 0).padStart(6), ...CATS.map(c => fixed(per(p[c]), 0).padStart(c === 'siegeAttack' ? 8 : c === 'siegePayout' ? 8 : 6)), '|',
      pct(bonusOf(p) / row.total).padStart(6), pct(share).padStart(7), '|',
      fixed(items).padStart(5), fixed(DAYS / items, 2).padStart(9), fixed(per(row.overflow)).padStart(4), fixed(per(row.used)).padStart(4), fixed(per(row.defences)).padStart(3), fixed(per(row.stolen)).padStart(6), '|',
      `${fixed(per(row.prizes))}(+${fixed(per(row.siegePrizes))})`.padStart(14), String(row.maxPrizes).padStart(3),
    ].join(' '));
  }
  const s = siegeSummary(results);
  lines.push(`sieges: ${s.count} (${fixed(s.perWeek, 2)}/week) · won ${s.won}, escaped ${s.escaped} → ${pct(s.rate)} · ${fixed(s.fighters)} fighters, ${fixed(s.hp, 0)} max HP on average · dial at month's end ${s.dials.map(d => d.toFixed(2)).join(', ')} · ${fixed(s.happenings)} happenings a month`);
  lines.push(`a siege, on average: ${Object.entries(s.perSiege).map(([k, v]) => `${fixed(v)} ${k}`).join(', ')}`);
  const refused = sum(Object.values(rows), r => r.refused);
  lines.push(`refused plays (cooldowns, item limits): ${refused} of ${sum(Object.values(rows), r => r.plays + r.attacks + r.refused)}`);
  return lines.join('\n');
}

describe('game balance: a month of play on the real rules', () => {
  test(`15-player server, ${SEEDS} seeded month(s); 5-player server, ${SEEDS * 2}`, async () => {
    const started = Date.now();
    const r15 = await months(sim.SERVER_15, seeds(SEEDS), 's15');
    r15.forEach((r, i) => { r.seed = seeds(SEEDS)[i]; });
    const r5 = await months(sim.SERVER_5, seeds(SEEDS * 2), 's5');
    r5.forEach((r, i) => { r.seed = seeds(SEEDS * 2)[i]; });
    const seconds = (Date.now() - started) / 1000;

    console.log([
      table('15 players', r15),
      table('5 players', r5),
      `\n(${seconds.toFixed(1)} s) points are per member per ${DAYS} days; bonus% = prizes+titles+nights+twists+happenings; +siege% adds siege attacks and payouts`,
    ].join('\n'));

    // The ledger must add up to the scores file, member by member: a reward
    // it doesn't know about would otherwise skew every share silently
    for (const run of [...r15, ...r5]) {
      for (const [id, l] of Object.entries(run.ledger)) {
        expect({ id, seed: run.seed, total: sum(CATS, c => l.points[c]) }).toEqual({ id, seed: run.seed, total: run.stored[id] });
      }
    }

    const rows = byProfile(r15);
    const typical = rows.typical;
    const typicalShare = (bonusOf(typical.points) + siegeOf(typical.points)) / typical.total;
    const typicalItemDays = DAYS / (typical.items / typical.members);
    const grinderMax = rows.grinder.maxPrizes;
    const win15 = siegeSummary(r15).rate;
    const win5 = siegeSummary(r5).rate;

    const verdicts = {
      typicalShare: { measured: pct(typicalShare), target: `≤ ${pct(TARGETS.typicalShare)}`, ok: typicalShare <= TARGETS.typicalShare },
      typicalItemDays: { measured: fixed(typicalItemDays, 2), target: `${TARGETS.itemDays[0]}–${TARGETS.itemDays[1]}`, ok: typicalItemDays >= TARGETS.itemDays[0] && typicalItemDays <= TARGETS.itemDays[1] },
      grinderPrizes: { measured: grinderMax, target: `≤ ${TARGETS.grinderPrizes}`, ok: grinderMax <= TARGETS.grinderPrizes },
      winRate15: { measured: pct(win15), target: `${pct(TARGETS.winRate[0])}–${pct(TARGETS.winRate[1])}`, ok: win15 >= TARGETS.winRate[0] && win15 <= TARGETS.winRate[1] },
      winRate5: { measured: pct(win5), target: `${pct(TARGETS.winRate[0])}–${pct(TARGETS.winRate[1])}`, ok: win5 >= TARGETS.winRate[0] && win5 <= TARGETS.winRate[1] },
    };
    console.log(`\ntargets:\n${Object.entries(verdicts).map(([k, v]) => `  ${v.ok ? 'PASS' : 'FAIL'}  ${k.padEnd(16)} ${String(v.measured).padStart(7)}  (target ${v.target})`).join('\n')}`);

    // Each asserted on its own so a failure names the target and the number
    expect({ typicalShare: typicalShare <= TARGETS.typicalShare ? 'ok' : verdicts.typicalShare }).toEqual({ typicalShare: 'ok' });
    expect({ typicalItemDays: verdicts.typicalItemDays.ok ? 'ok' : verdicts.typicalItemDays }).toEqual({ typicalItemDays: 'ok' });
    expect({ grinderPrizes: verdicts.grinderPrizes.ok ? 'ok' : verdicts.grinderPrizes }).toEqual({ grinderPrizes: 'ok' });
    expect({ winRate15: verdicts.winRate15.ok ? 'ok' : verdicts.winRate15 }).toEqual({ winRate15: 'ok' });
    expect({ winRate5: verdicts.winRate5.ok ? 'ok' : verdicts.winRate5 }).toEqual({ winRate5: 'ok' });
  }, 600_000);
});

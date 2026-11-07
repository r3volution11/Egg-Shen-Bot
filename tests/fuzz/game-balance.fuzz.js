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
 * Pace (2.74.0): every target holds at every pace (SIEGE_PACES), each
 * measured on its own — a server at that pace, its campaigns carried over
 * days on the real engine (balanceSim.js says how). By default week (every
 * server's pace unless an admin picks another) and quick (the game before
 * 2.74, which must still reproduce 2.73's numbers); BALANCE_PACES=all runs
 * the five (~5 min), or a comma list (BALANCE_PACES=day,days3).
 * BALANCE_LONG=1 adds 90 days per pace with the dial free, as the early
 * warning: wins must still be 55–85%; the share is reported (long titles
 * land in months 2–3, so it runs a few points above the first month's).
 *
 * Every member's points are also split by where they came from, and the
 * split must add up to what the scores file holds — so a reward the
 * ledger doesn't know about fails the run instead of skewing the shares.
 *
 * Run with: npm run test:fuzz -- --testPathPattern game-balance   (~4 min: week and quick)
 *           (a bare path after `--` joins test:fuzz's --testMatch list and
 *           runs every fuzz file)
 * More:     BALANCE_SEEDS=10 npm run test:fuzz -- --testPathPattern game-balance
 *           seeds BALANCE_FIRST..BALANCE_FIRST+n−1 (default 3 from 1 at quick,
 *           6 at the other paces; ~11 s a 15-player month at quick, ~18 at
 *           week); the 5-player server runs twice as many, as it's cheap and
 *           sees fewer sieges
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

/**
 * Seeds a pace runs by default: quick's 3 (2.73's baseline, reproduced
 * exactly), the slower paces' 6 — a week server sees 3 campaigns a month,
 * so 3 months would judge a 55–85% band on 9 sieges (2.74.0 measured each
 * pace on 26 + 52 months; 6 + 12 land within a few points of that)
 */
const seedsFor = (pace) => Math.max(1, Number(process.env.BALANCE_SEEDS) || (pace === 'quick' ? 3 : 6));
/** The paces measured: week and quick unless BALANCE_PACES says (`all`, or a comma list) */
const PACES = (() => {
  const env = process.env.BALANCE_PACES;
  if (!env) return ['week', 'quick'];
  return env === 'all' ? ['quick', 'evening', 'day', 'days3', 'week'] : env.split(',').map(x => x.trim()).filter(Boolean);
})();
const LONG = process.env.BALANCE_LONG === '1';
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
async function months(roster, list, tag, { pace = 'quick', days = DAYS } = {}) {
  const out = [];
  for (const seed of list) {
    console.log = console.warn = console.error = () => {};
    try {
      const run = await sim.runMonth({ seed, roster, guildId: `balance-${pace}-${tag}-${seed}-${days}`, days, pace });
      run.seed = seed;
      out.push(run);
    } finally {
      Object.assign(console, realConsole);
    }
  }
  return out;
}

// 2.75.0: `backing` — stakes taken and what came back — is siege points too
const CATS = ['play', 'siegeAttack', 'prizes', 'titles', 'nights', 'twists', 'happenings', 'siegePayout', 'backing'];
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
      // 2.75.0
      row.honours ||= { wangChi: 0, jack: 0, backBonus: 0, wangChis: 0, jacks: 0 };
      for (const k of Object.keys(row.honours)) row.honours[k] += l.honours?.[k] || 0;
      row.backs ||= { placed: 0, won: 0, push: 0, lost: 0, escaped: 0, refunded: 0 };
      for (const k of Object.keys(row.backs)) row.backs[k] += l.backs?.[k] || 0;
    }
  }
  return rows;
}

/**
 * 2.75.0, the real hero (R2 brief §6): per profile, a member's month of
 * honours (the Wang Chi's and the Jack Burton's bonuses, and a backed Wang
 * Chi's share), their backing net (the design: a typical member about −0.9
 * a month, at most 0) — and who the Wang Chi turned out to be: how often
 * a helper beat the top damage dealer to it, and how often nobody helped
 * enough and the top contributor held the line.
 */
function honoursTable(results) {
  const rows = byProfile(results);
  const lines = ['profile   Wang Chi (n)   Jack (n)  backBonus | backing: placed  net/month  won push lost esc refund'];
  for (const [profile, row] of Object.entries(rows)) {
    const per = (x) => x / row.members;
    const h = row.honours;
    const b = row.backs;
    lines.push([
      profile.padEnd(8),
      `${fixed(per(h.wangChi)).padStart(6)} (${fixed(per(h.wangChis), 2)})`.padStart(14),
      `${fixed(per(h.jack)).padStart(5)} (${fixed(per(h.jacks), 2)})`.padStart(11),
      fixed(per(h.backBonus), 2).padStart(9), '|',
      fixed(per(b.placed), 2).padStart(14), fixed(per(row.points.backing), 2).padStart(10),
      ...['won', 'push', 'lost', 'escaped', 'refunded'].map(k => fixed(per(b[k]), 2).padStart(k === 'refunded' ? 6 : 4)),
    ].join(' '));
  }
  const won = results.flatMap(r => r.sieges).filter(s => s.status === 'won' && s.wangChi);
  const byHelp = won.filter(s => !s.wangChi.held);
  const overDamage = byHelp.filter(s => s.wangChi.userId !== s.topDamage);
  lines.push(`Wang Chis: ${won.length} — by help ${byHelp.length} (${pct(byHelp.length / Math.max(1, won.length))}), a helper over the top damage dealer ${overDamage.length} (${pct(overDamage.length / Math.max(1, won.length))}), held the line ${won.length - byHelp.length}`);
  return lines.join('\n');
}

const bonusOf = (pts) => pts.prizes + pts.titles + pts.nights + pts.twists + pts.happenings;
const siegeOf = (pts) => pts.siegeAttack + pts.siegePayout + pts.backing;

/** The share of sieges won (an admin's end counts for neither) */
const winRate = (sieges) => {
  const won = sieges.filter(s => s.status === 'won').length;
  return won / Math.max(1, won + sieges.filter(s => s.status === 'escaped').length);
};

/**
 * 2.74.0: from `day` pace on, a server's first campaign is sized by the
 * deliberately low starting participation (PACE_RULES.participation.start:
 * it expects 35% of A7) and is meant to be easy — the dial doesn't move on
 * it. The win-rate target is about what the base and the dial settle to,
 * so for those paces it's judged from each server's second campaign on
 * (the table prints both; the 90-day check counts every one).
 */
const judgedSieges = (results, pace) => results.flatMap(r => (sim.paceLearns(pace) ? r.sieges.slice(1) : r.sieges));

function siegeSummary(results, days = DAYS) {
  const all = results.flatMap(r => r.sieges);
  const won = all.filter(s => s.status === 'won').length;
  const escaped = all.filter(s => s.status === 'escaped').length;
  return {
    count: all.length, won, escaped, rate: winRate(all),
    perWeek: all.length / results.length / (days / 7),
    fighters: sum(all, s => s.fighters) / Math.max(1, all.length),
    fighterNights: sum(all, s => s.fighterNights || s.fighters) / Math.max(1, all.length),
    hp: sum(all, s => s.maxHp) / Math.max(1, all.length),
    dials: results.map(r => r.dial),
    perSiege: Object.fromEntries(['grabbed', 'freed', 'digested', 'poisoned', 'cured'].map(k => [k, sum(all, x => x[k]) / Math.max(1, all.length)])),
    happenings: sum(results, r => r.happenings) / results.length,
  };
}

function table(title, results, days = DAYS) {
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
      fixed(items).padStart(5), fixed(days / items, 2).padStart(9), fixed(per(row.overflow)).padStart(4), fixed(per(row.used)).padStart(4), fixed(per(row.defences)).padStart(3), fixed(per(row.stolen)).padStart(6), '|',
      `${fixed(per(row.prizes))}(+${fixed(per(row.siegePrizes))})`.padStart(14), String(row.maxPrizes).padStart(3),
    ].join(' '));
  }
  const s = siegeSummary(results, days);
  lines.push(`sieges: ${s.count} (${fixed(s.perWeek, 2)}/week) · won ${s.won}, escaped ${s.escaped} → ${pct(s.rate)} · ${fixed(s.fighters)} fighters (${fixed(s.fighterNights)} fighter-nights), ${fixed(s.hp, 0)} max HP on average · dial at the end ${s.dials.map(d => d.toFixed(2)).join(', ')} · ${fixed(s.happenings)} happenings a run`);
  lines.push(`a siege, on average: ${Object.entries(s.perSiege).map(([k, v]) => `${fixed(v)} ${k}`).join(', ')}`);
  const refused = sum(Object.values(rows), r => r.refused);
  lines.push(`refused plays (cooldowns, item limits): ${refused} of ${sum(Object.values(rows), r => r.plays + r.attacks + r.refused)}`);
  return lines.join('\n');
}

/** The month's verdicts for one pace: every target, measured */
function verdictsOf(r15, r5, pace) {
  const rows = byProfile(r15);
  const typical = rows.typical;
  const typicalShare = (bonusOf(typical.points) + siegeOf(typical.points)) / typical.total;
  const typicalItemDays = DAYS / (typical.items / typical.members);
  const grinderMax = rows.grinder.maxPrizes;
  const win15 = winRate(judgedSieges(r15, pace));
  const win5 = winRate(judgedSieges(r5, pace));
  return {
    typicalShare: { measured: pct(typicalShare), target: `≤ ${pct(TARGETS.typicalShare)}`, ok: typicalShare <= TARGETS.typicalShare },
    typicalItemDays: { measured: fixed(typicalItemDays, 2), target: `${TARGETS.itemDays[0]}–${TARGETS.itemDays[1]}`, ok: typicalItemDays >= TARGETS.itemDays[0] && typicalItemDays <= TARGETS.itemDays[1] },
    grinderPrizes: { measured: grinderMax, target: `≤ ${TARGETS.grinderPrizes}`, ok: grinderMax <= TARGETS.grinderPrizes },
    winRate15: { measured: pct(win15), target: `${pct(TARGETS.winRate[0])}–${pct(TARGETS.winRate[1])}`, ok: win15 >= TARGETS.winRate[0] && win15 <= TARGETS.winRate[1] },
    winRate5: { measured: pct(win5), target: `${pct(TARGETS.winRate[0])}–${pct(TARGETS.winRate[1])}`, ok: win5 >= TARGETS.winRate[0] && win5 <= TARGETS.winRate[1] },
  };
}

/** The ledger must add up to the scores file, member by member: a reward it doesn't know about would otherwise skew every share silently */
function expectLedgerAddsUp(runs) {
  for (const run of runs) {
    for (const [id, l] of Object.entries(run.ledger)) {
      expect({ id, seed: run.seed, total: sum(CATS, c => l.points[c]) }).toEqual({ id, seed: run.seed, total: run.stored[id] });
    }
  }
}

describe.each(PACES)('game balance at %s pace: a month of play on the real rules', (pace) => {
  test(`15-player server, ${seedsFor(pace)} seeded month(s); 5-player server, ${seedsFor(pace) * 2}`, async () => {
    const started = Date.now();
    const r15 = await months(sim.SERVER_15, seeds(seedsFor(pace)), 's15', { pace });
    const r5 = await months(sim.SERVER_5, seeds(seedsFor(pace) * 2), 's5', { pace });
    const seconds = (Date.now() - started) / 1000;

    console.log([
      `\n══ ${pace} pace ══`,
      table('15 players', r15),
      table('5 players', r5),
      `\n2.75.0 honours and backing, per member per ${DAYS} days — 15 players:\n${honoursTable(r15)}\n5 players:\n${honoursTable(r5)}`,
      `\n(${seconds.toFixed(1)} s) points are per member per ${DAYS} days; bonus% = prizes+titles+nights+twists+happenings; +siege% adds siege attacks and payouts`,
    ].join('\n'));

    expectLedgerAddsUp([...r15, ...r5]);
    const verdicts = verdictsOf(r15, r5, pace);
    if (sim.paceLearns(pace)) console.log(`\nwins from each server's second campaign on (the first is sized to be easy): ${pct(winRate(judgedSieges(r15, pace)))} (15) / ${pct(winRate(judgedSieges(r5, pace)))} (5)`);
    console.log(`\ntargets at ${pace} pace:\n${Object.entries(verdicts).map(([k, v]) => `  ${v.ok ? 'PASS' : 'FAIL'}  ${k.padEnd(16)} ${String(v.measured).padStart(7)}  (target ${v.target})`).join('\n')}`);
    // 2.75.0, reported (the R2 brief §6): the 5-player server's typical share — week's honours are ×3
    // and its baseline already the higher — and the heavy players', the canary, ≤ 35% as a warning
    const shareOf = (rows, profile) => (rows[profile] ? (bonusOf(rows[profile].points) + siegeOf(rows[profile].points)) / rows[profile].total : null);
    const [rows15, rows5] = [byProfile(r15), byProfile(r5)];
    for (const [name, x] of [['typical, 5 players', shareOf(rows5, 'typical')], ['heavy, 15 players', shareOf(rows15, 'heavy')], ['heavy, 5 players', shareOf(rows5, 'heavy')]]) {
      console.log(`  ${x <= TARGETS.typicalShare ? 'ok  ' : 'WARN'}  share ${name.padEnd(19)} ${pct(x).padStart(6)}  (≤ ${pct(TARGETS.typicalShare)}, reported)`);
    }

    // Each asserted on its own so a failure names the pace, the target and the number
    for (const key of Object.keys(verdicts)) {
      expect({ pace, [key]: verdicts[key].ok ? 'ok' : verdicts[key] }).toEqual({ pace, [key]: 'ok' });
    }
  }, 900_000);

  // The early warning (BALANCE_LONG=1): 90 days, the dial free
  (LONG ? test : test.skip)('90 days, the dial free: wins still 55–85% (the share reported)', async () => {
    const r15 = await months(sim.SERVER_15, seeds(seedsFor(pace)), 'l15', { pace, days: 90 });
    const r5 = await months(sim.SERVER_5, seeds(seedsFor(pace) * 2), 'l5', { pace, days: 90 });
    console.log([`\n══ ${pace} pace, 90 days ══`, table('15 players', r15, 90), table('5 players', r5, 90)].join('\n'));
    expectLedgerAddsUp([...r15, ...r5]);
    const share = (runs) => {
      const t = byProfile(runs).typical;
      return (bonusOf(t.points) + siegeOf(t.points)) / t.total;
    };
    const [s15, s5] = [share(r15), share(r5)];
    console.log(`  ${s15 <= TARGETS.typicalShare && s5 <= TARGETS.typicalShare ? 'ok' : 'WARNING'}  typical share over 90 days: ${pct(s15)} (15) / ${pct(s5)} (5) — target ≤ ${pct(TARGETS.typicalShare)} in the first month`);
    for (const [name, runs] of [['winRate15', r15], ['winRate5', r5]]) {
      const rate = siegeSummary(runs, 90).rate;
      const ok = rate >= TARGETS.winRate[0] && rate <= TARGETS.winRate[1];
      expect({ pace, days: 90, [name]: ok ? 'ok' : pct(rate) }).toEqual({ pace, days: 90, [name]: 'ok' });
    }
  }, 1_800_000);
});

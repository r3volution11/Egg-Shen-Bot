/**
 * Fill one member's game record with demo data, so a test server can see
 * a full game card (and what the next plays will do) without weeks of
 * playing: a Glovebox of items, earned titles and one on show, a 13-night
 * lantern row with a night saved by a Night Light, prize counters one play
 * from a prize, titles one play from earning, twist statuses and a shield.
 *
 *   node scripts/game-demo.js --guild <id>                    list the server's players
 *   node scripts/game-demo.js --guild <id> --user <id>        seed that member
 *   node scripts/game-demo.js --guild <id> --user <id> --clear   put their record back
 *
 * Meant for a TEST server. It refuses a server where more than three other
 * members have played (a real community's scores) unless given --force.
 * Before seeding, the member's original record is saved beside the scores
 * file (guild_games/<id>.demo-backup.json); --clear restores it exactly.
 *
 * What one play then does (fast mode helps: /eggshen-config-games limits
 * cooldown-seconds:0 per-minute:60 daily-scored-plays:1000):
 * - a hit       → 🥧 Golden Pie prize (25/25) and the Pie Sniper title (150)
 * - a tasty feed → 🧄 Garlic prize and the Lunch Lady title
 * - any scored play tonight → 14 nights: Creature of the Night tier and title
 * - a good outcome extends a 14 streak → Unstoppable
 * - a siege won (R5) → Monster Hunter; as its Wang Chi (2.75.0: the most
 *   frees and cures — the old MVP), the Wang Chi title (5); landing its
 *   killing blow (the Jack Burton), Everybody Relax, I'm Here (10)
 * Only 2 prizes a day, so the third waits for tomorrow — that shows too.
 *
 * The bot keeps running while this writes: the write is one synchronous
 * load-change-save (mutateScores), so the only risk is a play landing in
 * the same millisecond, which a test server can live with.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { mutateScores, loadScores, GAMES, POINTS, periodKeys, dayKey } from '../src/utils/gameScores.js';
import { nightKey, shiftNight } from '../src/utils/gameRules.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gamesDir = () => process.env.GUILD_GAMES_DIR || path.join(__dirname, '..', 'guild_games');
const backupFile = (guildId) => path.join(gamesDir(), `${guildId}.demo-backup.json`);

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * What the member did and had done to them, all time. Chosen so each
 * prize and several titles are ONE play away (see the header).
 */
const DID = {
  foodfight: { hit: 149, miss: 31, backfire: 12, tasty: 74, gross: 9, spill: 6 },
  doom: { doomed: 98, escaped: 21, backfired: 11 },
  rescue: { rescued: 72, sacrificed: 28, caught: 10 },
  potion: { helped: 54, hurt: 59, backfired: 15 },
  // R5: attacks on monsters (nobody receives a siege play: the target is the monster)
  siege: { splat: 40, splash: 12, splatback: 3, smite: 18, dodged: 6, spooked: 2, poisoned: 15, fizzled: 4 },
};
const GOT = {
  foodfight: { hit: 120, tasty: 30, gross: 18 },
  doom: { doomed: 100, escaped: 50 },
  rescue: { rescued: 61 },
  potion: { helped: 70, hurt: 66 },
  siege: {},
};

/** Points from counts, through the real points table */
function pointsFrom(game, did, got) {
  let actor = 0;
  let target = 0;
  for (const [o, n] of Object.entries(did)) actor += (POINTS[game][o]?.[0] || 0) * n;
  for (const [o, n] of Object.entries(got)) target += (POINTS[game][o]?.[1] || 0) * n;
  return { actor, target };
}

const scaled = (counts, f) => Object.fromEntries(Object.entries(counts).map(([o, n]) => [o, Math.round(n * f)]));
const total = (counts) => Object.values(counts).reduce((a, b) => a + b, 0);

/** One period's stats, as recordPlay keeps them */
function periodStats(game, f, { streak = 0, bestStreak = 0 } = {}) {
  const counts = scaled(DID[game], f);
  const received = scaled(GOT[game], f);
  const { actor, target } = pointsFrom(game, counts, received);
  const plays = total(counts);
  return {
    points: actor + target, plays, scoredPlays: plays, counts, received,
    receivedPoints: target, bestStreak, ...(streak ? { streak } : {}), bonus: Math.round(40 * f),
  };
}

/**
 * The demo record for one member at `now`. Pure: tests check it against
 * the real engine (the next hit earns the prize and the title).
 */
export function demoRecord(name, now = Date.now()) {
  const keys = periodKeys(now);
  const games = {};
  for (const g of GAMES) {
    // The food fight streak is 14, so one more good throw makes 15
    const streaks = g === 'foodfight' ? { streak: 14, bestStreak: 14 } : { bestStreak: 6 };
    games[g] = {
      [keys.all]: periodStats(g, 1, streaks),
      [keys.year]: periodStats(g, 0.8, { bestStreak: streaks.bestStreak }),
      [keys.month]: periodStats(g, 0.3, { bestStreak: Math.min(streaks.bestStreak, 9) }),
    };
  }

  // 13 nights in a row ending last night, one of them saved by a Night
  // Light: playing tonight makes 14, the Creature of the Night tier
  const tonight = nightKey(now);
  const savedNight = shiftNight(tonight, -9);
  const recent = [];
  for (let i = 14; i >= 1; i--) {
    const n = shiftNight(tonight, -i);
    if (n !== savedNight) recent.push(n);
  }

  return {
    name,
    games,
    // Scored-only counts that titles read (gameRules lifetimeFrom shape)
    lifetime: {
      do: JSON.parse(JSON.stringify(DID)),
      got: JSON.parse(JSON.stringify(GOT)),
      streak: { foodfight: 14 },
      bestStreak: 14,
      twists: 29, // the next twist earns Plot Twist
      // The next siege won earns Monster Hunter; as its Wang Chi (mvps: the MVP
      // became the Wang Chi in 2.75.0), the Wang Chi title; as its Jack Burton,
      // Everybody Relax, I'm Here. Siege MVP (1) is already earned below.
      siege: { wins: 9, mvps: 4, jacks: 9, kaiju: 0 },
    },
    titles: {
      earned: { 'on-fire': now - 20 * DAY, 'red-shirt': now - 6 * DAY, cockroach: now - 4 * DAY, 'night-owl': now - 7 * DAY, martyr: now - 2 * DAY, 'siege-mvp': now - 9 * DAY },
      shown: 'red-shirt',
    },
    // Each prize counter one play short (the 750-points one five short)
    progress: { hits: 24, tasty: 14, dooms: 24, rescues: 14, helpful: 14, harmful: 19, points: 745 },
    glovebox: { gpie: 2, vhs: 1, garlic: 1, holyw: 1, penny: 2, antid: 1, nlight: 1 },
    cooldowns: { garlic: now + 3 * HOUR },
    nights: {
      last: shiftNight(tonight, -1), current: 13, best: 13, recent, saved: [savedNight],
      lightUsedAt: Date.parse(savedNight) + 12 * HOUR + DAY, // over a week ago: it can burn again
    },
    effects: {
      refill: { at: now - HOUR, until: now + 20 * HOUR, playsLeft: 2 },
      secondwind: { at: now - 2 * HOUR, until: now + 22 * HOUR },
      mosquito: { at: now - 30 * 60 * 1000, until: now + 23 * HOUR, playsLeft: 2 },
    },
  };
}

/** How many OTHER members have played on this server */
const otherPlayers = (data, userId) => Object.entries(data.users || {})
  .filter(([id, u]) => id !== userId && Object.values(u.games || {}).some(g => g?.all?.plays > 0)).length;

/**
 * Seed (or, with clear, restore) one member. Returns what it did, for the
 * CLI to print and tests to check.
 */
export function runDemo({ guildId, userId, name = null, clear = false, force = false, now = Date.now() }) {
  const backup = backupFile(guildId);
  if (clear) {
    if (!fs.existsSync(backup)) return { ok: false, message: 'No demo backup for this server: nothing to restore.' };
    const saved = JSON.parse(fs.readFileSync(backup, 'utf8'));
    if (saved.userId !== userId) return { ok: false, message: `The backup is for ${saved.userId}, not ${userId}.` };
    mutateScores(guildId, (data) => {
      if (saved.user) data.users[userId] = saved.user; else delete data.users[userId];
      if (saved.daily) data.daily[userId] = saved.daily; else delete data.daily[userId];
      if (saved.shield) data.shields[userId] = saved.shield; else delete data.shields?.[userId];
    });
    fs.unlinkSync(backup);
    return { ok: true, message: `Restored ${userId}'s record from before the demo.` };
  }

  const before = loadScores(guildId);
  const others = otherPlayers(before, userId);
  if (others > 3 && !force) {
    return { ok: false, message: `${others} other members have played here: this looks like a real server. Use a test server, or --force.` };
  }
  if (!fs.existsSync(backup)) {
    fs.mkdirSync(gamesDir(), { recursive: true });
    fs.writeFileSync(backup, JSON.stringify({
      userId, at: now,
      user: before.users?.[userId] || null,
      daily: before.daily?.[userId] || null,
      shield: before.shields?.[userId] || null,
    }));
  }
  const who = name || before.users?.[userId]?.name || 'Demo';
  mutateScores(guildId, (data) => {
    data.users[userId] = demoRecord(who, now);
    // A fresh day: no prizes, item uses or defences spent yet
    data.daily[userId] = { day: dayKey(now), plays: {} };
    (data.shields ||= {})[userId] = now + 45 * 60 * 1000;
  });
  return { ok: true, message: `Seeded ${who} (${userId}). Original record saved to ${path.basename(backup)}; --clear restores it.` };
}

// ── the command line ────────────────────────────────────────────────────

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const guildId = arg('guild');
  const userId = arg('user');
  if (!guildId) {
    console.error('Usage: node scripts/game-demo.js --guild <id> [--user <id>] [--name <name>] [--clear] [--force]');
    process.exit(1);
  }
  if (!userId) {
    const data = loadScores(guildId);
    const rows = Object.entries(data.users || {});
    console.log(rows.length ? 'Players on this server:' : 'Nobody has played on this server yet: use your Discord user ID.');
    for (const [id, u] of rows) console.log(`  ${id}  ${u.name || '?'}`);
    process.exit(0);
  }
  const res = runDemo({
    guildId, userId, name: arg('name'),
    clear: process.argv.includes('--clear'), force: process.argv.includes('--force'),
  });
  console.log(res.message);
  process.exit(res.ok ? 0 : 1);
}

/**
 * Escape Velocity simulator: the real /escape and /escape-setup commands,
 * button and select handlers and scheduler, driven through the strict fake
 * Discord (fakeDiscord.js) with recorded TMDB data (httpReplay.js) and a
 * clock the test controls. Modeled on tournamentSim.js.
 *
 * After every action it checks what must always hold:
 *   - the interaction was answered, exactly as Discord allows, and not with
 *     a generic error
 *   - every question has four distinct options and a valid answer
 *   - each question's pick counts match the answers recorded in runs
 *   - nobody has more than one run on any day
 *
 * Generation is random, so Math.random is seeded per scenario: the same
 * scenario makes the same TMDB requests every run, which is what lets them
 * be replayed.
 *
 * Record (one process — both files share the recording):
 *   SIM_RECORD=1 npm test -- --runInBand tests/escape-sim.test.js tests/escape-sim-restarts.test.js
 */

import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { FakeDiscord } from './fakeDiscord.js';
import { installHttpReplay, saveRecordings, RECORDING, shrinkTmdb } from './httpReplay.js';

const GENERIC_ERROR = /an error occurred|something went wrong/i;
const FIXTURE = path.join(process.cwd(), 'tests/fixtures/escape-sim-http.json');
const REPLAY = { file: FIXTURE, hint: 'SIM_RECORD=1 npm test -- --runInBand tests/escape-sim.test.js tests/escape-sim-restarts.test.js', shrink: shrinkTmdb };
/** Questions per tier in a simulated event: enough to play, small enough to record. */
const SIM_POOL = 6;

const SRC = path.join(process.cwd(), 'src');
const src = (p) => path.join(SRC, p);

let mods = null;

export async function loadSim() {
  if (mods) return mods;
  process.env.OPENAI_API_KEY = '';
  if (process.env.SIM_VERBOSE !== '1') jest.spyOn(console, 'log').mockImplementation(() => {});
  installHttpReplay(undefined, REPLAY);
  await importModules();
  return mods;
}

async function importModules() {
  const escape = await import(src('commands/escape.js'));
  const escapeSetup = await import(src('commands/escape-setup.js'));
  const { handleButtonInteraction } = await import(src('handlers/buttonHandler.js'));
  const { handleSelectInteraction } = await import(src('handlers/selectHandler.js'));
  const store = await import(src('utils/escapeStore.js'));
  const scheduler = await import(src('utils/escapeScheduler.js'));
  const questions = await import(src('utils/escapeQuestions.js'));
  questions._setTargetPerTier(SIM_POOL);
  const next = {
    commands: { escape, 'escape-setup': escapeSetup },
    handleButtonInteraction, handleSelectInteraction, store, scheduler, questions, Sim,
  };
  if (mods) Object.assign(mods, next);
  else mods = next;
}

/** Everything kept in memory is lost; what's on disk stays. */
export async function restartBot() {
  jest.resetModules();
  const { default: freshAxios } = await import('axios');
  installHttpReplay(freshAxios, REPLAY);
  await importModules();
}

export function finishSim() {
  if (RECORDING) saveRecordings();
}

export const clock = {
  now: Date.UTC(2026, 9, 20, 15, 0, 0),
  install() {
    jest.spyOn(Date, 'now').mockImplementation(() => clock.now);
  },
};

/** A seeded Math.random, re-seeded per scenario so its TMDB requests replay. */
function seedRandom(seed) {
  let a = seed >>> 0;
  jest.spyOn(Math, 'random').mockImplementation(() => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  });
}

export class SimFailure extends Error {}

export class Sim {
  constructor(guildId, { players = 4, seed = 1 } = {}) {
    this.guildId = guildId;
    this.discord = new FakeDiscord({ guildId, channelId: `${guildId}-channel` });
    this.discord.addUser('admin', { admin: true });
    this.players = [];
    for (let i = 1; i <= players; i++) this.players.push(this.discord.addUser(`pilot${i}`).id);
    this.removeFiles();
    seedRandom(seed);
  }

  get channel() { return this.discord.channel; }

  removeFiles() {
    for (const v of ['GUILD_ESCAPE_DIR', 'GUILD_CONFIGS_DIR']) {
      const dir = process.env[v];
      if (!dir) throw new Error('Data folders must point at a scratch directory (tests/jest.setup.js)');
      if (!fs.existsSync(dir)) continue;
      for (const name of fs.readdirSync(dir)) {
        if (name.startsWith(`${this.guildId}.`) || name.startsWith(`${this.guildId}-`)) fs.unlinkSync(path.join(dir, name));
      }
    }
  }

  data() {
    return mods.store.loadEvent(this.guildId);
  }

  async dispatch(interaction, label) {
    const before = this.discord.violations.length;
    const errors = [];
    const origError = console.error;
    console.error = (...args) => { errors.push(args.map(String).join(' ')); };
    try {
      if (interaction.kind === 'command') await mods.commands[interaction.commandName].execute(interaction);
      else if (interaction.kind === 'button') await mods.handleButtonInteraction(interaction);
      else if (interaction.kind === 'select') await mods.handleSelectInteraction(interaction);
    } catch (e) {
      this.fail(label, `threw: ${e.stack || e}`);
    } finally {
      console.error = origError;
    }
    const problems = [];
    const violations = this.discord.violations.slice(before);
    if (violations.length) problems.push(...violations.map(v => `Discord would reject this: ${v}`));
    if (!interaction.answered()) problems.push('never answered — Discord shows "This interaction failed"');
    for (const m of new Set([...interaction.responses, ...interaction.edited])) {
      if (GENERIC_ERROR.test(m.text)) problems.push(`answered with a generic error: "${m.text.split('\n')[0]}"`);
    }
    if (problems.length) {
      this.fail(label, `${problems.join('\n')}${errors.length ? `\nconsole.error:\n  ${errors.join('\n  ')}` : ''}`);
    }
    this.checkInvariants(label);
    return interaction;
  }

  fail(label, message) {
    throw new SimFailure(`[${this.guildId}] after "${label}":\n${message}`);
  }

  checkInvariants(label) {
    const data = this.data();
    if (!data) return;
    const problems = [];
    const picks = {};
    const perDay = {};
    for (const run of Object.values(data.runs)) {
      const key = `${run.userId}@${run.day}`;
      perDay[key] = (perDay[key] || 0) + 1;
      for (const a of run.answers) {
        picks[a.qid] ||= [0, 0, 0, 0];
        picks[a.qid][a.choice]++;
      }
    }
    for (const [key, n] of Object.entries(perDay)) if (n > 1) problems.push(`${key} has ${n} runs`);
    for (const q of Object.values(data.questions)) {
      if (q.options.length !== 4 || new Set(q.options).size !== 4) problems.push(`question ${q.id} options aren't four distinct: ${q.options}`);
      if (!(q.correctIndex >= 0 && q.correctIndex < 4)) problems.push(`question ${q.id} has answer ${q.correctIndex}`);
      const expected = picks[q.id] || [0, 0, 0, 0];
      if (expected.join() !== q.stats.picks.join()) problems.push(`question ${q.id} picks ${q.stats.picks} but runs say ${expected}`);
    }
    if (problems.length) this.fail(label, `invariants broken:\n  ${problems.join('\n  ')}`);
  }

  // ── doing things ───────────────────────────────────────────────────────

  async command(userId, name, subcommand, options = {}) {
    const label = `${userId}: /${name} ${subcommand} ${JSON.stringify(options)}`;
    const known = mods.commands[name].data.toJSON().options.map(o => o.name);
    if (!known.includes(subcommand)) this.fail(label, `/${name} has no "${subcommand}" subcommand (it has: ${known.join(', ')})`);
    const i = this.discord.command(userId, name, { subcommand, options });
    await this.dispatch(i, label);
    i.reply = i.replyMessage;
    return i;
  }

  async click(userId, message, customId) {
    return this.dispatch(this.discord.button(userId, message, customId), `${userId} clicks ${customId}`);
  }

  async choose(userId, message, customId, values) {
    return this.dispatch(this.discord.select(userId, message, customId, values), `${userId} picks ${values} in ${customId}`);
  }

  /** One scheduler pass at the current clock. */
  async tick() {
    await mods.scheduler.checkEscape(this.discord.client, clock.now, { awaitTopUp: true, only: this.guildId });
    this.checkInvariants('scheduler pass');
  }

  /**
   * The admin's whole setup: create, pick media and genres from the menus'
   * own options, build questions. Returns the setup message.
   */
  async setUp({ name = 'Sim Launch', days = 3, startsInHours, media = ['movie', 'tv'], genres = ['horror', 'scifi'] } = {}) {
    const options = { name, days };
    if (startsInHours !== undefined) options.starts_in_hours = startsInHours;
    const create = await this.command('admin', 'escape-setup', 'create', options);
    const screen = create.reply;
    await this.choose('admin', screen, 'ev_setup_media', media);
    await this.choose('admin', screen, 'ev_setup_genres', genres);
    await this.click('admin', screen, 'ev_setup_go');
    return screen;
  }

  /** The current mission card: the latest public message with a Launch button. */
  missionCard() {
    return [...this.channel.posted].reverse().find(m => m.findComponent('ev_launch'));
  }

  /** Press Launch on the card; returns the player's dashboard message. */
  async launch(userId) {
    const i = await this.click(userId, this.missionCard(), 'ev_launch');
    return i.replyMessage;
  }

  /** The run a player has in flight. */
  activeRun(userId) {
    return Object.values(this.data().runs).find(r => r.userId === userId && r.status === 'active');
  }

  /** Answer the dashboard's question — right, or a specific wrong option. */
  async answer(userId, dashboard, { right = true } = {}) {
    const run = this.activeRun(userId);
    if (!run) throw new Error(`${userId} has no run in flight`);
    const q = this.data().questions[run.questionId];
    const choice = right ? q.correctIndex : (q.correctIndex + 1) % 4;
    return this.click(userId, dashboard, `ev_ans_${run.id}_${run.stage}_${choice}`);
  }
}

/**
 * Tournament simulator: the real /bracket command, button handler, select
 * handler and scheduler, driven through a fake Discord (fakeDiscord.js) with
 * real recorded API data (httpReplay.js) and a clock the test controls.
 *
 * A scenario reads like what people do — the admin creates and fills a
 * tournament, members press Start Voting and click titles on their own
 * ballots, time passes and the scheduler closes rounds — and after every
 * single action the simulator checks things that must always hold:
 *
 *   - every interaction was answered, exactly as Discord allows
 *     (a handler that never answers is "This interaction failed")
 *   - nothing answered with the generic "An error occurred" (a caught crash)
 *   - stored votes agree with each other (no one in both columns, no one
 *     counted twice, the per-user record matches the per-matchup lists)
 *   - a ballot never needs more than 5 matchups
 *   - every closed matchup's winner is one of its two titles
 *
 * Any failure names the action that caused it.
 *
 * Usage (see tests/tournament-sim.test.js):
 *   const { Sim } = await loadSim();       // once, before anything imports src/
 *   const sim = new Sim('scenario-guild');
 *   await sim.bracket('admin', 'create', { name: 'Cup', 'max-titles': 8 });
 */

import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { FakeDiscord } from './fakeDiscord.js';
import { installHttpReplay, saveRecordings, RECORDING } from './httpReplay.js';

const GENERIC_ERROR = /an error occurred|something went wrong/i;
const MAX_BALLOT = 5;
const HOUR = 60 * 60 * 1000;

let mods = null;

// Absolute: jest resolves unstable_mockModule paths from the test file, not
// from this helper, so relative paths would point at the wrong place
const SRC = path.join(process.cwd(), 'src');
const src = (p) => path.join(SRC, p);

/**
 * Mock what can't run in a test, install the replay layer, then import the
 * real modules. Call once per test file, before any other import of src/.
 */
export async function loadSim() {
  if (mods) return mods;
  // The bracket image needs a canvas and poster downloads; its drawing isn't
  // what these scenarios test, and /bracket view must still reply
  jest.unstable_mockModule(src('utils/bracketVisualizer.js'), () => ({
    generateBracketImage: jest.fn(async () => Buffer.from('png')),
    generateFullTournamentView: jest.fn(async () => Buffer.from('png')),
    fetchTMDBPoster: jest.fn(async () => null),
  }));
  // No AI re-ranking: results must come out in the order recorded
  process.env.OPENAI_API_KEY = '';
  // The bot narrates every step to the console; a scenario is hundreds of
  // steps. SIM_VERBOSE=1 to see it.
  if (process.env.SIM_VERBOSE !== '1') jest.spyOn(console, 'log').mockImplementation(() => {});
  installHttpReplay();
  await importModules();
  return mods;
}

async function importModules() {
  const bracket = await import(src('commands/bracket.js'));
  const { handleButtonInteraction } = await import(src('handlers/buttonHandler.js'));
  const { handleSelectInteraction } = await import(src('handlers/selectHandler.js'));
  const bracketManager = await import(src('utils/bracketManager.js'));
  const scheduler = await import(src('utils/tournamentScheduler.js'));
  const guildConfig = await import(src('utils/guildConfig.js'));
  const watchlist = await import(src('utils/watchlistManager.js'));
  const tournamentImport = await import(src('utils/tournamentImport.js'));
  const next = { bracket, handleButtonInteraction, handleSelectInteraction, bracketManager, scheduler, guildConfig, watchlist, tournamentImport, Sim };
  // Keep the same object, so everything holding `mods` sees the reload
  if (mods) Object.assign(mods, next);
  else mods = next;
}

/**
 * The bot restarts: every module is loaded afresh, so everything it kept in
 * memory — live-standings message ids, open ballots, sent deadline warnings
 * — is gone, while what it saved to disk stays. The mocks stay registered.
 */
export async function restartBot() {
  jest.resetModules();
  const { default: freshAxios } = await import('axios');
  installHttpReplay(freshAxios);
  await importModules();
}

/** After the last scenario: save any new recordings (record mode only). */
export function finishSim() {
  if (RECORDING) saveRecordings();
}

/** A clock every scenario shares; Date.now() reads it. */
export const clock = {
  now: Date.UTC(2026, 9, 1, 18, 0, 0),
  install() {
    jest.spyOn(Date, 'now').mockImplementation(() => clock.now);
  },
};

export class SimFailure extends Error {}

export class Sim {
  /**
   * @param {string} guildId - unique per scenario, so in-memory state in the
   *   handlers (live standings, ballots) never leaks between scenarios
   * @param {object} opts
   * @param {number} opts.voters - members besides the admin
   */
  constructor(guildId, { voters = 5 } = {}) {
    this.guildId = guildId;
    this.discord = new FakeDiscord({ guildId, channelId: `${guildId}-channel` });
    this.discord.addUser('admin', { admin: true });
    this.voters = [];
    for (let i = 1; i <= voters; i++) this.voters.push(this.discord.addUser(`voter${i}`).id);
    this.steps = [];
    this.removeFiles();
  }

  get channel() { return this.discord.channel; }

  // ── files ──────────────────────────────────────────────────────────────

  /**
   * Start from nothing: delete every file this server has, in every data
   * folder, whatever the module names it (`<id>.json`, `<id>_watchlist.json`).
   * Jest's scratch folders outlive a run, so a leftover file from an earlier
   * run can make a scenario pass for the wrong reason — a groups champion
   * "reached the watchlist" because a previous run had put it there.
   */
  removeFiles() {
    const dirs = ['GUILD_TOURNAMENTS_DIR', 'GUILD_CONFIGS_DIR', 'GUILD_WATCHLISTS_DIR', 'GUILD_STATS_DIR', 'GUILD_WATCH_HISTORY_DIR', 'GUILD_POLLS_DIR']
      .map(v => process.env[v]).filter(Boolean);
    if (dirs.length < 6) throw new Error('Data folders must point at a scratch directory (tests/jest.setup.js)');
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;
      for (const name of fs.readdirSync(dir)) {
        // <id>.json and its .bak/.tmp/.damaged-* siblings, <id>_watchlist.json…
        if (name.startsWith(`${this.guildId}.`) || name.startsWith(`${this.guildId}_`)) fs.unlinkSync(path.join(dir, name));
      }
    }
  }

  /** Change this server's settings, as /eggshen-config would. */
  async configure(change) {
    const cfg = await mods.guildConfig.loadGuildConfig(this.guildId);
    change(cfg);
    await mods.guildConfig.saveGuildConfig(this.guildId, cfg);
  }

  tournament() {
    return mods.bracketManager.loadTournament(this.guildId);
  }

  // ── doing things ───────────────────────────────────────────────────────

  /**
   * Run one interaction through the real handler, then check everything.
   * @returns the interaction, with .responses (every message it produced)
   */
  async dispatch(interaction, label) {
    const before = this.discord.violations.length;
    const errors = [];
    const origError = console.error;
    console.error = (...args) => { errors.push(args.map(String).join(' ')); };
    try {
      if (interaction.kind === 'command') await mods.bracket.execute(interaction);
      else if (interaction.kind === 'autocomplete') await mods.bracket.autocomplete(interaction);
      else if (interaction.kind === 'button') await mods.handleButtonInteraction(interaction);
      else if (interaction.kind === 'select') await mods.handleSelectInteraction(interaction);
    } catch (e) {
      // The real router (index.js) would catch this and send a generic error
      this.fail(label, `threw: ${e.stack || e}`);
    } finally {
      console.error = origError;
    }

    const problems = [];
    const violations = this.discord.violations.slice(before);
    if (violations.length) problems.push(...violations.map(v => `Discord would reject this: ${v}`));
    if (interaction.kind === 'autocomplete') {
      if (!interaction.choices) problems.push('autocomplete never responded');
    } else if (!interaction.answered()) {
      problems.push('never answered — Discord shows "This interaction failed"');
    }
    // New messages and edits alike: a select or button that defers and then
    // edits its message reports a crash through the edit
    for (const m of new Set([...interaction.responses, ...interaction.edited])) {
      if (GENERIC_ERROR.test(m.text)) problems.push(`answered with a generic error: "${m.text.split('\n')[0]}"`);
    }
    if (problems.length) {
      this.fail(label, `${problems.join('\n')}${errors.length ? `\nconsole.error:\n  ${errors.join('\n  ')}` : ''}`);
    }
    this.steps.push(label);
    this.checkInvariants(label);
    return interaction;
  }

  fail(label, message) {
    throw new SimFailure(`[${this.guildId}] after "${label}":\n${message}`);
  }

  /** /bracket <sub> as a user. Returns the interaction; .reply is its main response. */
  async bracket(userId, subcommand, options = {}) {
    const i = this.discord.command(userId, 'bracket', { subcommand, options });
    await this.dispatch(i, `${userId}: /bracket ${subcommand} ${fmtOptions(options)}`);
    i.reply = i.replyMessage;
    return i;
  }

  async click(userId, message, customId) {
    const i = this.discord.button(userId, message, customId);
    return this.dispatch(i, `${userId} clicks ${customId}`);
  }

  /** Autocomplete for a /bracket option, as Discord asks while someone types. */
  async suggest(userId, subcommand, focused, options = {}) {
    const i = this.discord.autocomplete(userId, 'bracket', { subcommand, options, focused: { name: focused, value: '' } });
    await this.dispatch(i, `${userId}: suggestions for /bracket ${subcommand} ${focused}`);
    return i.choices || [];
  }

  async choose(userId, message, customId, value) {
    const i = this.discord.select(userId, message, customId, [value]);
    return this.dispatch(i, `${userId} picks ${value} in ${customId}`);
  }

  /**
   * Add a title the way an admin does: search, and if the bot offers a
   * list, pick the one with the right year from its own menu.
   * @returns the stored entry
   */
  async addTitle(type, query, year, { group } = {}) {
    const options = { action: 'add', type, title: query };
    if (group) options.group = group;
    const before = this.titleCount();
    const i = await this.bracket('admin', 'manage-titles', options);
    const reply = i.reply;
    const menuId = `select_bracket_title_admin`;
    const menu = reply.findComponent(menuId);
    if (menu) {
      const opts = menu.options;
      // A year that isn't offered is a mistake in the scenario's data (TMDB
      // dates a film by its release, not its festival premiere): say so,
      // rather than quietly adding the first option instead
      const want = year
        ? (opts.find(o => o.label.endsWith(`(${year})`) && o.label.toLowerCase().startsWith(query.toLowerCase()))
          || opts.find(o => o.label.endsWith(`(${year})`)))
        : opts[0];
      if (!want) this.fail(`add ${type} "${query}" (${year})`, `the bot offered no ${year} title: ${opts.slice(0, 5).map(o => o.label).join(' | ')}`);
      await this.choose('admin', reply, menuId, want.value);
    }
    if (this.titleCount() !== before + 1) {
      this.fail(`add ${type} "${query}"`, `title count went ${before} → ${this.titleCount()}. Reply: ${reply.text}`);
    }
    return this.lastAdded();
  }

  titleCount() {
    const t = this.tournament();
    if (!t) return 0;
    return t.mode === 'groups'
      ? Object.values(t.groups || {}).reduce((n, g) => n + (g.movies || []).length, 0)
      : (t.titles || []).length;
  }

  lastAdded() {
    const t = this.tournament();
    if (t.mode === 'groups') {
      const all = Object.values(t.groups).flatMap(g => g.movies);
      return all[all.length - 1];
    }
    return t.titles[t.titles.length - 1];
  }

  hasVotingPost() {
    return this.channel.posted.some(m => m.allComponents.some(c => /^start_(group|knockout)_voting_/.test(c.customId || '')));
  }

  /** The newest public message with a Start Voting button. */
  votingPost() {
    const posts = this.channel.posted.filter(m => m.allComponents.some(c => /^start_(group|knockout)_voting_/.test(c.customId || '')));
    if (!posts.length) this.fail('find voting post', 'no public message has a Start Voting button');
    return posts[posts.length - 1];
  }

  /** Press Start Voting; returns the user's own ballot. */
  async openBallot(userId, post = this.votingPost()) {
    const button = post.allComponents.find(c => /^start_(group|knockout)_voting_/.test(c.customId || ''));
    const i = await this.click(userId, post, button.customId);
    const ballot = i.responses.find(m => m.ephemeralFor === userId);
    if (!ballot) this.fail(`${userId} Start Voting`, 'no ballot came back');
    return ballot;
  }

  /** Vote in a knockout matchup on a ballot. side: 1 or 2. */
  async voteMatchup(userId, ballot, matchupId, side) {
    return this.click(userId, ballot, `knockout_vote_${matchupId}_${side}`);
  }

  /**
   * Every voter opens a ballot and votes in every matchup on it.
   * pick(matchup, voterId) → 1 | 2 (default: the title added first wins)
   */
  async everyoneVotes(pick = favorite, voters = this.voters) {
    // Matchups opened from the admin buttons are posted one per message,
    // with the vote buttons on the post itself rather than a Start Voting
    if (!this.hasVotingPost()) {
      for (const v of voters) {
        for (const m of this.openMatchups()) {
          const post = this.channel.posted.filter(p => p.findComponent(`knockout_vote_${m.id}_1`)).pop();
          if (post) await this.voteMatchup(v, post, m.id, pick(m, v));
        }
      }
      return;
    }
    const post = this.votingPost();
    for (const v of voters) {
      const ballot = await this.openBallot(v, post);
      for (const m of this.openMatchups()) {
        if (ballot.findComponent(`knockout_vote_${m.id}_1`)) {
          await this.voteMatchup(v, ballot, m.id, pick(m, v));
        }
      }
    }
  }

  openMatchups() {
    const t = this.tournament();
    return (t.knockoutBracket || []).filter(m => m.status === 'voting').sort((a, b) => a.position - b.position);
  }

  /** Move the clock on, then let the scheduler do what it would. */
  async advance(ms) {
    clock.now += ms;
    const origError = console.error;
    const errors = [];
    console.error = (...a) => errors.push(a.map(String).join(' '));
    try {
      await mods.scheduler.checkVotingDeadlines(this.discord.client);
    } finally {
      console.error = origError;
    }
    const label = `${Math.round(ms / HOUR)}h pass; scheduler runs`;
    if (errors.length) this.fail(label, `scheduler logged errors:\n  ${errors.join('\n  ')}`);
    this.steps.push(label);
    this.checkInvariants(label);
  }

  /** Past every open deadline (and a minute more). */
  async passDeadlines() {
    const t = this.tournament();
    const deadlines = [
      ...(t.knockoutBracket || []).filter(m => m.status === 'voting').map(m => m.votingDeadline),
      ...Object.values(t.groups || {}).filter(g => g.votingOpen).map(g => g.votingDeadline),
      ...(t.tiebreakers || []).filter(tb => tb.status === 'active').map(tb => tb.deadline || tb.votingDeadline),
    ].filter(Boolean);
    const latest = deadlines.length ? Math.max(...deadlines) : clock.now;
    await this.advance(Math.max(0, latest - clock.now) + 60 * 1000);
  }

  // ── invariants ─────────────────────────────────────────────────────────

  checkInvariants(label) {
    const t = this.tournament();
    if (!t) return;
    const problems = [];

    // Knockout: per-matchup lists agree with each user's record
    for (const m of t.knockoutBracket || []) {
      const v1 = m.votes?.movie1 || [];
      const v2 = m.votes?.movie2 || [];
      const both = v1.filter(u => v2.includes(u));
      if (both.length) problems.push(`${where(m)}: ${both.join(', ')} counted for both titles`);
      for (const list of [v1, v2]) {
        const dupes = list.filter((u, i) => list.indexOf(u) !== i);
        if (dupes.length) problems.push(`${where(m)}: ${dupes.join(', ')} counted twice`);
      }
      for (const [uid, record] of Object.entries(t.votes || {})) {
        const choice = record?.[m.id];
        if (choice === 1 && !v1.includes(uid)) problems.push(`${where(m)}: ${uid}'s vote for title 1 isn't counted`);
        if (choice === 2 && !v2.includes(uid)) problems.push(`${where(m)}: ${uid}'s vote for title 2 isn't counted`);
      }
      if (m.status === 'closed' && !m.isBye && m.winner) {
        const ids = [m.movie1, m.movie2].filter(Boolean).map(key);
        if (!ids.includes(key(m.winner))) problems.push(`${where(m)}: winner ${m.winner.title} isn't one of its titles`);
      }
    }

    // A ballot holds 5 matchups
    const voting = (t.knockoutBracket || []).filter(m => m.status === 'voting');
    if (voting.length > MAX_BALLOT) problems.push(`${voting.length} matchups open at once; a ballot holds ${MAX_BALLOT}`);

    // Groups: no one counted twice, at most two picks, records agree
    for (const [gid, g] of Object.entries(t.groups || {})) {
      for (const movie of g.movies || []) {
        const dupes = (movie.votes || []).filter((u, i, a) => a.indexOf(u) !== i);
        if (dupes.length) problems.push(`Group ${gid} "${movie.title}": ${dupes.join(', ')} counted twice`);
      }
      for (const [uid, record] of Object.entries(t.votes || {})) {
        const picks = record?.[gid];
        if (!Array.isArray(picks)) continue;
        if (picks.length > 2) problems.push(`Group ${gid}: ${uid} has ${picks.length} picks`);
        for (const idx of picks) {
          if (!(g.movies[idx]?.votes || []).includes(uid)) problems.push(`Group ${gid}: ${uid}'s pick #${idx} isn't counted`);
        }
      }
    }

    // A finished tournament has one champion, and it won the final
    if (t.status === 'completed') {
      const final = (t.knockoutBracket || []).find(m => m.round === 'finals');
      if (!t.champion && !t.winner) problems.push('completed with no champion');
      else if (final?.winner && key(final.winner) !== key(t.champion || t.winner)) problems.push('champion is not the winner of the final');
    }

    // Someone's private ballot must never replace a message everyone sees
    for (const m of this.channel.posted) {
      if (/only you can see this/i.test(m.text)) problems.push(`a public message shows a private ballot: "${m.text.split('\n')[0]}"`);
    }

    if (problems.length) this.fail(label, problems.join('\n'));

    function where(m) { return `matchup ${m.round}#${m.position}`; }
  }

  // ── reading what happened ──────────────────────────────────────────────

  /** All text the channel shows, newest last. */
  channelText() {
    return this.channel.posted.map(m => m.text).join('\n---\n');
  }

  /** Write everything posted, in order, as an HTML page (SIM_REPORT=dir). */
  writeTranscript(name) {
    const dir = process.env.SIM_REPORT;
    if (!dir) return null;
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${name}.html`);
    fs.writeFileSync(file, transcriptHtml(name, this.discord.events));
    return file;
  }
}

/** The usual voter: the title added earliest (lowest index) wins. */
export function favorite(m) {
  return (m.movie1?.index ?? 0) <= (m.movie2?.index ?? 0) ? 1 : 2;
}

const key = (entry) => `${entry?.id ?? ''}|${entry?.title ?? ''}`;

function fmtOptions(options) {
  return Object.entries(options).map(([k, v]) => `${k}:${v}`).join(' ');
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function transcriptHtml(name, events) {
  const rows = events.map((e) => {
    const m = e.message;
    const embeds = m.embeds.map((em) => {
      const d = em.toJSON();
      return `<div class="embed"><b>${esc(d.title)}</b><div>${esc(d.description).replace(/\n/g, '<br>')}</div>${(d.fields || []).map(f => `<div class="field"><b>${esc(f.name)}</b><br>${esc(f.value).replace(/\n/g, '<br>')}</div>`).join('')}${d.footer ? `<small>${esc(d.footer.text)}</small>` : ''}</div>`;
    }).join('');
    const buttons = m.allComponents.map(c => `<span class="btn${c.disabled ? ' off' : ''}">${esc(c.label || c.placeholder || c.customId)}</span>`).join('');
    return `<div class="msg ${esc(e.kind)}"><div class="meta">${esc(e.kind)}${e.to ? ` → ${esc(e.to)}` : ''}${e.via ? ` · ${esc(e.via)}` : ''}</div>${m.content ? `<div>${esc(m.content).replace(/\n/g, '<br>')}</div>` : ''}${embeds}<div>${buttons}</div></div>`;
  }).join('\n');
  return `<!doctype html><meta charset="utf-8"><title>${esc(name)}</title><style>
body{font:14px system-ui;background:#313338;color:#dbdee1;max-width:760px;margin:2em auto;padding:0 16px}
.msg{background:#2b2d31;border-radius:6px;padding:10px;margin:8px 0}.ephemeral{border-left:3px solid #5865f2}
.meta{font-size:11px;color:#949ba4;margin-bottom:4px}.embed{border-left:4px solid #4ec5ed;padding:6px 10px;margin:6px 0;background:#232428}
.field{margin-top:6px}.btn{display:inline-block;background:#4e5058;border-radius:4px;padding:3px 8px;margin:4px 4px 0 0;font-size:12px}.off{opacity:.4}
</style><h1>${esc(name)}</h1>${rows}`;
}

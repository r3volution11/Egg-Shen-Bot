/**
 * Running knockout matchups one after another — the flow a live tournament
 * hit on 2026-10-01 — through the real /bracket command, button handler and
 * scheduler, with a fake Discord channel to see what gets posted.
 *
 *   - A knockout tie deleted its own tiebreaker (closeKnockoutMatchup saved a
 *     copy loaded before the tiebreaker existed), leaving the matchup stuck.
 *   - A tie closed by the deadline posted no tiebreaker vote at all.
 *   - Matchups opened by command never recorded their channel, so deadline
 *     warnings and results were never posted.
 *   - Opening the next matchup left earlier ones open: votes on them could
 *     keep changing. They now close first (Doug's call, 2026-10-01).
 *   - `matchup` had no suggestions; ballots and standings had no countdown.
 *
 * Run with: npm test -- tests/bracket-matchup-flow.test.js
 */

import { describe, test, expect, jest, beforeAll, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const GUILD_ID = 'bracket-matchup-flow-guild';
const CHANNEL_ID = 'tournament-channel';
const ADMIN = 'admin-1';

let execute;
let autocomplete;
let handleButtonInteraction;
let buildPublicKnockoutLeaderboard;
let bracketManager;
let scheduler;

beforeAll(async () => {
  ({ execute, autocomplete } = await import('../src/commands/bracket.js'));
  ({ handleButtonInteraction, buildPublicKnockoutLeaderboard } = await import('../src/handlers/buttonHandler.js'));
  bracketManager = await import('../src/utils/bracketManager.js');
  scheduler = await import('../src/utils/tournamentScheduler.js');
});

function tournamentFile() {
  const dir = process.env.GUILD_TOURNAMENTS_DIR || path.join(process.cwd(), 'guild_tournaments');
  return path.join(dir, `${GUILD_ID}.json`);
}
function cleanup() {
  if (fs.existsSync(tournamentFile())) fs.unlinkSync(tournamentFile());
}
beforeEach(cleanup);
afterEach(cleanup);

/** A guild whose one channel records what is sent to it. */
function fakeGuild() {
  const channel = {
    id: CHANNEL_ID,
    send: jest.fn().mockImplementation(async () => ({ id: `msg-${channel.send.mock.calls.length}` })),
    messages: { fetch: jest.fn().mockRejectedValue(new Error('none')) },
  };
  return { id: GUILD_ID, channel, channels: { fetch: jest.fn(async (id) => (id === CHANNEL_ID ? channel : null)) } };
}

function slash(subcommand, { strings = {}, integers = {}, guild } = {}) {
  return {
    guildId: GUILD_ID,
    guild,
    channelId: CHANNEL_ID,
    user: { id: ADMIN, username: 'admin' },
    member: { permissions: { has: (flag) => String(flag) === 'Administrator' || String(flag) === '8' } },
    options: {
      getSubcommand: () => subcommand,
      getString: (name) => (name in strings ? strings[name] : null),
      getInteger: (name) => (name in integers ? integers[name] : null),
      getAttachment: () => null,
      getBoolean: () => null,
    },
    deferred: false,
    replied: false,
    deferReply: jest.fn().mockImplementation(function () { this.deferred = true; return Promise.resolve(); }),
    editReply: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn().mockResolvedValue(undefined),
    followUp: jest.fn().mockResolvedValue(undefined),
  };
}

const movie = (i) => ({ id: i, title: `Film ${i}`, year: String(1970 + i), type: 'movie' });

/** A 16-title straight bracket in its round of 16 (8 matchups, 1A–4B). */
function roundOf16() {
  bracketManager.createTournament(GUILD_ID, 'Flow Cup', ADMIN, 16);
  for (let i = 1; i <= 16; i++) bracketManager.addTitle(GUILD_ID, 'A', 'movie', movie(i));
  bracketManager.generateKnockoutBracket(GUILD_ID);
  const t = bracketManager.loadTournament(GUILD_ID);
  return t.knockoutBracket.filter(m => m.round === t.phase).sort((a, b) => a.position - b.position);
}
const load = (id) => bracketManager.loadTournament(GUILD_ID).knockoutBracket.find(m => m.id === id);
const content = (i) => i.editReply.mock.calls.map(([p]) => (typeof p === 'string' ? p : p?.content || '')).join('\n');

describe('knockout ties keep their tiebreaker', () => {
  test('a tie creates a tiebreaker that exists, can be voted on, and decides the matchup', () => {
    const [a] = roundOf16();
    bracketManager.openKnockoutMatchups(GUILD_ID, [a.id], null);
    bracketManager.voteKnockout(GUILD_ID, 'u1', a.id, 1);
    bracketManager.voteKnockout(GUILD_ID, 'u2', a.id, 2);

    const closed = bracketManager.closeKnockoutMatchup(GUILD_ID, a.id);
    expect(closed.tiebreakerCreated).toBe(true);

    const t = bracketManager.loadTournament(GUILD_ID);
    const tb = t.tiebreakers.find(x => x.id === load(a.id).tiebreakerId);
    expect(tb).toMatchObject({ status: 'active', position: 'knockout' });

    expect(bracketManager.voteInTiebreaker(GUILD_ID, tb.id, 'u3', 1).success).toBe(true);
    bracketManager.closeTiebreaker(GUILD_ID, tb.id);
    expect(bracketManager.finalizeKnockoutMatchupAfterTiebreaker(GUILD_ID, tb.id).success).toBe(true);
    expect(load(a.id)).toMatchObject({ status: 'closed', winner: expect.objectContaining({ title: a.movie2.title }) });
  });

  test('a matchup stuck in "tiebreaker" with no tiebreaker gets a new one, posted', async () => {
    const [a] = roundOf16();
    bracketManager.openKnockoutMatchups(GUILD_ID, [a.id], null, CHANNEL_ID);
    // Recreate the lost state: matchup marked tiebreaker, tiebreaker gone
    const t = bracketManager.loadTournament(GUILD_ID);
    const m = t.knockoutBracket.find(x => x.id === a.id);
    m.status = 'tiebreaker';
    m.tiebreakerId = 'lost-one';
    bracketManager.saveTournament(GUILD_ID, t);

    const guild = fakeGuild();
    await scheduler.repairOrphanedKnockoutTiebreakers(guild, bracketManager.loadTournament(GUILD_ID));

    const after = bracketManager.loadTournament(GUILD_ID);
    const fixed = after.knockoutBracket.find(x => x.id === a.id);
    const tb = after.tiebreakers.find(x => x.id === fixed.tiebreakerId);
    expect(tb).toMatchObject({ status: 'active', messageChannelId: CHANNEL_ID });
    expect(tb.tiedOptions.map(o => o.title)).toEqual([a.movie1.title, a.movie2.title]);
    const posted = guild.channel.send.mock.calls[0][0];
    expect(posted.components[0].toJSON().components.map(b => b.custom_id)).toEqual([`tiebreaker_vote_${tb.id}_0`, `tiebreaker_vote_${tb.id}_1`]);
  });
});

describe('the scheduler repairs a stuck tiebreaker by itself', () => {
  test('one deadline pass gives a stuck matchup a tiebreaker and posts it', async () => {
    const [a] = roundOf16();
    bracketManager.openKnockoutMatchups(GUILD_ID, [a.id], Date.now() + 3600000, CHANNEL_ID);
    const t = bracketManager.loadTournament(GUILD_ID);
    const m = t.knockoutBracket.find(x => x.id === a.id);
    m.status = 'tiebreaker';
    m.tiebreakerId = 'lost-one';
    bracketManager.saveTournament(GUILD_ID, t);

    const guild = fakeGuild();
    const client = { guilds: { fetch: jest.fn(async (id) => (id === GUILD_ID ? guild : null)) } };
    await scheduler.checkVotingDeadlines(client);

    const after = bracketManager.loadTournament(GUILD_ID);
    const tb = after.tiebreakers.find(x => x.id === after.knockoutBracket.find(x => x.id === a.id).tiebreakerId);
    expect(tb).toMatchObject({ status: 'active' });
    expect(guild.channel.send).toHaveBeenCalled();
  });
});

describe('opening the next matchup closes earlier ones', () => {
  test('1A closes with its winner announced when 1B opens', async () => {
    const [a, b] = roundOf16();
    const guild = fakeGuild();
    await execute(slash('open-matchup', { strings: { matchup: '1A', duration: '1h' }, guild }));
    bracketManager.voteKnockout(GUILD_ID, 'u1', a.id, 1);
    bracketManager.voteKnockout(GUILD_ID, 'u2', a.id, 1);

    const next = slash('open-matchup', { strings: { matchup: '1B', duration: '1h' }, guild });
    await execute(next);

    expect(load(a.id)).toMatchObject({ status: 'closed', winner: expect.objectContaining({ title: a.movie1.title }) });
    expect(load(b.id).status).toBe('voting');
    expect(content(next)).toContain(`1A: **${a.movie1.title}** wins 2–0`);
    // Results were posted in the matchup's channel (it recorded one when opened)
    expect(guild.channel.send.mock.calls.some(([p]) => JSON.stringify(p.embeds?.[0]?.toJSON?.() || {}).includes('Results'))).toBe(true);
  });

  test('a tie at that moment opens and posts a tiebreaker', async () => {
    const [a] = roundOf16();
    const guild = fakeGuild();
    await execute(slash('open-matchup', { strings: { matchup: '1A', duration: '1h' }, guild }));
    bracketManager.voteKnockout(GUILD_ID, 'u1', a.id, 1);
    bracketManager.voteKnockout(GUILD_ID, 'u2', a.id, 2);

    const next = slash('open-matchup', { strings: { matchup: '1B', duration: '1h' }, guild });
    await execute(next);

    const t = bracketManager.loadTournament(GUILD_ID);
    expect(load(a.id).status).toBe('tiebreaker');
    expect(t.tiebreakers.find(x => x.id === load(a.id).tiebreakerId)).toBeDefined();
    expect(content(next)).toContain('1A: tied — tiebreaker vote posted');
    expect(guild.channel.send.mock.calls.some(([p]) => JSON.stringify(p.components?.[0]?.toJSON?.() || {}).includes('tiebreaker_vote_'))).toBe(true);
  });

  test('votes on a closed matchup are refused', async () => {
    const [a] = roundOf16();
    const guild = fakeGuild();
    await execute(slash('open-matchup', { strings: { matchup: '1A', duration: '1h' }, guild }));
    bracketManager.voteKnockout(GUILD_ID, 'u1', a.id, 1);
    await execute(slash('open-matchup', { strings: { matchup: '1B', duration: '1h' }, guild }));

    expect(bracketManager.voteKnockout(GUILD_ID, 'u1', a.id, 2).success).toBe(false);
  });

  test('re-opening matchups that are part of the new set keeps them open', async () => {
    const [a] = roundOf16();
    const guild = fakeGuild();
    await execute(slash('open-matchup', { strings: { matchup: '1A', duration: '1h' }, guild }));
    await execute(slash('open-matchup', { strings: { matchup: '1A,1B', duration: '1h' }, guild }));
    expect(load(a.id).status).toBe('voting');
  });
});

describe('opened matchups record their channel', () => {
  test('/bracket open and open-matchup both record where voting happens', async () => {
    bracketManager.createTournament(GUILD_ID, 'Small Cup', ADMIN, 4);
    for (let i = 1; i <= 4; i++) bracketManager.addTitle(GUILD_ID, 'A', 'movie', movie(i));
    await execute(slash('open', { strings: { duration: '1h' } }));
    const t = bracketManager.loadTournament(GUILD_ID);
    expect(t.knockoutBracket.filter(m => m.status === 'voting').every(m => m.messageChannelId === CHANNEL_ID)).toBe(true);
  });

  test('/bracket open in the group stage records each group\'s channel', async () => {
    bracketManager.createTournament(GUILD_ID, 'Group Cup', ADMIN, 36);
    bracketManager.resizeTournament(GUILD_ID, 4);
    for (const g of 'ABCD') for (let i = 0; i < 4; i++) bracketManager.addTitle(GUILD_ID, g, 'movie', movie(g.charCodeAt(0) * 10 + i));
    await execute(slash('open', { strings: { duration: '1h' } }));
    const t = bracketManager.loadTournament(GUILD_ID);
    expect(Object.values(t.groups).every(g => g.votingMessageChannelId === CHANNEL_ID)).toBe(true);
  });
});

describe('/bracket open matchups:N — one (or a few) at a time', () => {
  const voting = () => bracketManager.loadTournament(GUILD_ID).knockoutBracket.filter(m => m.status === 'voting');
  async function openNext(n = 1, guild = fakeGuild()) {
    const i = slash('open', { strings: { duration: '1h' }, guild });
    i.options.getInteger = (name) => (name === 'matchups' ? n : null);
    await execute(i);
    return i;
  }
  const embedText = (i) => JSON.stringify(i.editReply.mock.calls.at(-1)[0]?.embeds?.[0]?.toJSON?.() || {});

  test('a whole 8-title bracket runs one matchup at a time, from setup to champion', async () => {
    bracketManager.createTournament(GUILD_ID, 'One By One', ADMIN, 8);
    for (let i = 1; i <= 8; i++) bracketManager.addTitle(GUILD_ID, 'A', 'movie', movie(i));

    const seen = [];
    for (let step = 0; step < 7; step++) {
      const reply = await openNext(1);
      const open = voting();
      expect(open).toHaveLength(1); // never more than one at a time
      seen.push(`${open[0].round}:${open[0].position}`);
      bracketManager.voteKnockout(GUILD_ID, 'u1', open[0].id, 1); // first title always wins
      if (step === 0) expect(embedText(reply)).toContain('3 more in this round');
    }
    expect(seen).toEqual(['quarterfinals:0', 'quarterfinals:1', 'quarterfinals:2', 'quarterfinals:3', 'semifinals:0', 'semifinals:1', 'finals:0']);

    const last = await openNext(1);
    const t = bracketManager.loadTournament(GUILD_ID);
    expect(t.status).toBe('completed');
    // Random seeding shuffles the bracket, so check against the stored champion
    expect(last.editReply.mock.calls.at(-1)[0]).toContain(`Champion: **${t.champion.title}**`);
  });

  test('matchups:2 opens two in order and closes the previous pair', async () => {
    bracketManager.createTournament(GUILD_ID, 'Pairs', ADMIN, 8);
    for (let i = 1; i <= 8; i++) bracketManager.addTitle(GUILD_ID, 'A', 'movie', movie(i));
    await openNext(2);
    expect(voting().map(m => m.position)).toEqual([0, 1]);
    await openNext(2);
    expect(voting().map(m => m.position)).toEqual([2, 3]);
  });

  test('a tie at the end of a round waits for its tiebreaker instead of moving on', async () => {
    bracketManager.createTournament(GUILD_ID, 'Tie Wait', ADMIN, 4);
    for (let i = 1; i <= 4; i++) bracketManager.addTitle(GUILD_ID, 'A', 'movie', movie(i));
    await openNext(1);
    bracketManager.voteKnockout(GUILD_ID, 'u1', voting()[0].id, 1);
    await openNext(1);
    const second = voting()[0];
    bracketManager.voteKnockout(GUILD_ID, 'u1', second.id, 1);
    bracketManager.voteKnockout(GUILD_ID, 'u2', second.id, 2);

    const reply = await openNext(1);
    expect(reply.editReply.mock.calls.at(-1)[0]).toContain('Waiting on the tiebreaker for');
    expect(bracketManager.loadTournament(GUILD_ID).phase).toBe('semifinals');
  });
});

describe('a group stage too big for one ballot', () => {
  async function finishGroups(groupCount) {
    bracketManager.createTournament(GUILD_ID, 'Big Groups', ADMIN, 36);
    bracketManager.resizeTournament(GUILD_ID, groupCount);
    const letters = 'ABCDEFGHIJKL'.slice(0, groupCount).split('');
    for (const g of letters) for (let i = 0; i < 4; i++) bracketManager.addTitle(GUILD_ID, g, 'movie', movie(g.charCodeAt(0) * 10 + i));
    bracketManager.openGroupVoting(GUILD_ID, letters);
    for (const g of letters) {
      bracketManager.voteGroupStage(GUILD_ID, 'v1', g, [0, 1]);
      bracketManager.voteGroupStage(GUILD_ID, 'v2', g, [0, 1]);
      bracketManager.voteGroupStage(GUILD_ID, 'v3', g, [0, 2]);
    }
    bracketManager.closeGroupVoting(GUILD_ID, letters);
  }

  test('6 groups: /bracket open builds the 8-matchup knockout but opens none, and says how', async () => {
    await finishGroups(6);
    const open = slash('open', { strings: { duration: '1h' } });
    await execute(open);

    const t = bracketManager.loadTournament(GUILD_ID);
    expect(t.status).toBe('knockout');
    expect(t.knockoutBracket.filter(m => m.status === 'voting')).toHaveLength(0);
    expect(open.editReply.mock.calls.at(-1)[0]).toContain('/bracket open matchups:1');
  });

  test('6 groups: /bracket open matchups:3 builds it and opens the first three', async () => {
    await finishGroups(6);
    const open = slash('open', { strings: { duration: '1h' } });
    open.options.getInteger = (name) => (name === 'matchups' ? 3 : null);
    await execute(open);

    const t = bracketManager.loadTournament(GUILD_ID);
    expect(t.knockoutBracket.filter(m => m.status === 'voting').map(m => m.position)).toEqual([0, 1, 2]);
  });
});

describe('matchup suggestions', () => {
  function ask(subcommand, value) {
    const respond = jest.fn();
    return {
      guildId: GUILD_ID,
      options: { getFocused: () => ({ name: 'matchup', value }), getSubcommand: () => subcommand },
      respond,
    };
  }

  test('open-matchup suggests only matchups not yet voted on, with their titles', async () => {
    const [a, b] = roundOf16();
    bracketManager.openKnockoutMatchups(GUILD_ID, [a.id], null);
    const i = ask('open-matchup', '');
    await autocomplete(i);

    const choices = i.respond.mock.calls[0][0];
    expect(choices.map(c => c.value)).not.toContain('1A');
    expect(choices[0]).toEqual({ name: `1B · ${b.movie1.title} vs ${b.movie2.title}`, value: '1B' });
    expect(choices).toHaveLength(7);
  });

  test('close-matchup suggests only the open ones', async () => {
    const [a] = roundOf16();
    bracketManager.openKnockoutMatchups(GUILD_ID, [a.id], null);
    const i = ask('close-matchup', '');
    await autocomplete(i);
    expect(i.respond.mock.calls[0][0].map(c => c.value)).toEqual(['1A']);
  });

  test('a typed list is completed, not replaced, and filters by label or title', async () => {
    roundOf16();
    const i = ask('open-matchup', '1A, 2');
    await autocomplete(i);
    const values = i.respond.mock.calls[0][0].map(c => c.value);
    expect(values).toEqual(['1A,2A', '1A,2B']);

    const byTitle = ask('open-matchup', 'film 16');
    await autocomplete(byTitle);
    expect(byTitle.respond.mock.calls[0][0]).toHaveLength(1);
  });
});

describe('time left is always visible', () => {
  test('the standings show a live countdown per matchup', () => {
    const deadline = Date.now() + 2 * 60 * 60 * 1000;
    const matchups = [{
      id: 'm1', position: 0, round: 'round_of_16', status: 'voting', votingDeadline: deadline,
      movie1: { title: 'A' }, movie2: { title: 'B' }, votes: { movie1: [], movie2: [] },
    }];
    const { description } = buildPublicKnockoutLeaderboard({ votes: {}, statistics: {} }, 'round_of_16', matchups).toJSON();
    expect(description).toContain(`closes <t:${Math.floor(deadline / 1000)}:R>`);
  });

  test('the ballot says when voting closes', async () => {
    const [a] = roundOf16();
    const deadline = Date.now() + 60 * 60 * 1000;
    bracketManager.openKnockoutMatchups(GUILD_ID, [a.id], deadline);
    const t = bracketManager.loadTournament(GUILD_ID);

    const press = {
      customId: `start_knockout_voting_${t.phase}`,
      isButton: () => true,
      guildId: GUILD_ID,
      guild: { id: GUILD_ID },
      channelId: CHANNEL_ID,
      client: { user: { displayAvatarURL: () => null } },
      user: { id: 'member-1', username: 'member', displayAvatarURL: () => 'https://cdn.example/member-1.png' },
      member: { permissions: { has: () => false } },
      reply: jest.fn().mockResolvedValue({ id: 'ballot' }),
      followUp: jest.fn(),
      deferUpdate: jest.fn(),
      replied: false,
      deferred: false,
    };
    await handleButtonInteraction(press);

    const embed = press.reply.mock.calls[0][0].embeds[0].toJSON();
    expect(embed.description).toContain(`⏰ Voting closes <t:${Math.floor(deadline / 1000)}:R>`);
  });
});

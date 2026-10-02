/**
 * Voting, as a regular member experiences it — driven end to end through the
 * real /bracket command and the real button handler, with the buttons the
 * bot itself posted.
 *
 * Every bug here was live in a real tournament on 2026-09-30:
 *   - "Start Voting" refused everyone but admins and mods;
 *   - the group-stage "Start Voting" from /bracket open had a customId no
 *     handler matched, so it failed for everyone;
 *   - the ballot's two-button rows read as "4 titles versus 4 titles";
 *   - the live standings printed only the first title's votes, so votes for
 *     the second title looked lost;
 *   - /bracket my-votes showed literal "\n".
 *
 * Run with: npm test -- tests/bracket-voting-ballot.test.js
 */

import { describe, test, expect, jest, beforeAll, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const GUILD_ID = 'bracket-voting-ballot-guild';
const ADMIN = 'admin-1';
const MEMBER = 'member-1';

let execute;
let handleButtonInteraction;
let buildPublicKnockoutLeaderboard;
let bracketManager;

beforeAll(async () => {
  ({ execute } = await import('../src/commands/bracket.js'));
  ({ handleButtonInteraction, buildPublicKnockoutLeaderboard } = await import('../src/handlers/buttonHandler.js'));
  bracketManager = await import('../src/utils/bracketManager.js');
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

function member({ admin = false } = {}) {
  return { permissions: { has: (flag) => admin && (String(flag) === 'Administrator' || String(flag) === '8') } };
}

function slash(subcommand, { strings = {}, userId = ADMIN } = {}) {
  return {
    guildId: GUILD_ID,
    guild: { id: GUILD_ID },
    channelId: 'channel-1',
    user: { id: userId, username: userId },
    member: member({ admin: userId === ADMIN }),
    options: {
      getSubcommand: () => subcommand,
      getString: (name) => (name in strings ? strings[name] : null),
      getInteger: () => null,
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

function click(customId, userId = MEMBER) {
  return {
    customId,
    isButton: () => true,
    guildId: GUILD_ID,
    guild: { id: GUILD_ID },
    channelId: 'channel-1',
    channel: { messages: { fetch: jest.fn().mockRejectedValue(new Error('no message')) }, send: jest.fn().mockResolvedValue({ id: 'm' }) },
    client: { user: { displayAvatarURL: () => null } },
    user: { id: userId, username: userId },
    member: member({ admin: userId === ADMIN }),
    // The click comes from the voter's own (ephemeral) ballot; a vote from a
    // public post gets a new private ballot instead of an update
    message: { embeds: [], edit: jest.fn().mockResolvedValue(undefined), flags: { has: () => true } },
    deferUpdate: jest.fn().mockResolvedValue(undefined),
    deferReply: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn().mockResolvedValue({ id: 'ballot-1' }),
    update: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    followUp: jest.fn().mockResolvedValue(undefined),
    replied: false,
    deferred: false,
  };
}

const movie = (i) => ({ id: i, title: `Film ${i}`, year: String(1970 + i), type: 'movie' });

/** The buttons a reply/editReply carried, as plain JSON rows. */
function rowsOf(call) {
  return (call?.[0]?.components || []).map(r => (r.toJSON ? r.toJSON() : r).components);
}
function allSaid(i) {
  return [...i.reply.mock.calls, ...i.editReply.mock.calls, ...i.followUp.mock.calls]
    .map(([p]) => (typeof p === 'string' ? p : [p?.content || '', ...(p?.embeds || []).map(e => JSON.stringify(e.toJSON ? e.toJSON() : e))].join(' ')))
    .join('\n');
}

describe('knockout voting as a regular member', () => {
  async function openStraightBracket() {
    bracketManager.createTournament(GUILD_ID, 'Ballot Cup', ADMIN, 8);
    for (let i = 1; i <= 8; i++) bracketManager.addTitle(GUILD_ID, 'A', 'movie', movie(i));
    const open = slash('open', { strings: { duration: '1h' } });
    await execute(open);
    // The real Start Voting button /bracket open posted
    return rowsOf(open.editReply.mock.calls.at(-1))[0][0].custom_id;
  }

  test('the posted Start Voting opens a ballot for a member, one head-to-head per row', async () => {
    const startId = await openStraightBracket();
    expect(startId).toMatch(/^start_knockout_voting_/);

    const press = click(startId);
    await handleButtonInteraction(press);

    expect(allSaid(press)).not.toContain('Only administrators');
    const rows = rowsOf(press.reply.mock.calls[0]);
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row).toHaveLength(3);
      expect(row[1]).toMatchObject({ label: 'vs', disabled: true });
      expect(row[0].label).toMatch(/^\dA|^\d[A-D] · /);
    }
    expect(rows[0][0].label).toMatch(/ · Film \d$/);
  });

  test('voting redraws the ballot the same way, with the pick highlighted', async () => {
    const startId = await openStraightBracket();
    const press = click(startId);
    await handleButtonInteraction(press);
    const voteId = rowsOf(press.reply.mock.calls[0])[0][2].custom_id; // second title of the first matchup

    const vote = click(voteId);
    await handleButtonInteraction(vote);

    const rows = rowsOf(vote.update.mock.calls[0]);
    expect(rows[0]).toHaveLength(3);
    expect(rows[0][1].label).toBe('vs');
    expect(rows[0][2].style).toBe(1); // Primary = picked
    expect(rows[0][0].style).toBe(2);
  });
});

describe('group voting as a regular member', () => {
  test('the Start Voting that /bracket open posts actually opens a ballot', async () => {
    bracketManager.createTournament(GUILD_ID, 'Group Cup', ADMIN, 36);
    bracketManager.resizeTournament(GUILD_ID, 4);
    for (const g of 'ABCD') for (let i = 0; i < 4; i++) bracketManager.addTitle(GUILD_ID, g, 'movie', movie(`${g}${i}`.charCodeAt(0) * 10 + i));

    const open = slash('open', { strings: { duration: '1h' } });
    await execute(open);
    const startId = rowsOf(open.editReply.mock.calls.at(-1))[0][0].custom_id;
    expect(startId).toBe('start_group_voting_A,B,C,D');

    const press = click(startId);
    await handleButtonInteraction(press);

    expect(allSaid(press)).not.toContain('Only administrators');
    const reply = press.reply.mock.calls[0]?.[0] || press.followUp.mock.calls[0]?.[0];
    expect(reply?.components?.length).toBeGreaterThan(0);
  });
});

describe('live standings show both titles of every matchup', () => {
  test('a matchup voted 0–2 shows the 2 votes for the second title', () => {
    const matchups = [{
      id: 'm1', position: 1, round: 'round_of_32', status: 'voting',
      movie1: { title: 'Black Christmas' }, movie2: { title: 'Candyman' },
      votes: { movie1: [], movie2: ['u1', 'u2'] },
    }];
    const embed = buildPublicKnockoutLeaderboard({ votes: {}, statistics: {} }, 'round_of_32', matchups).toJSON();

    expect(embed.description).toContain('Black Christmas\n░░░░░░░░░░░░ 0 votes (0%)');
    expect(embed.description).toContain('vs\nCandyman 🔥\n████████████ 2 votes (100%)');
  });

  test('a tie shows both counts and one 🤝 on the matchup', () => {
    const matchups = [{
      id: 'm1', position: 0, round: 'round_of_32', status: 'voting',
      movie1: { title: 'Terrifier 2' }, movie2: { title: "Child's Play" },
      votes: { movie1: ['u1'], movie2: ['u2'] },
    }];
    const { description } = buildPublicKnockoutLeaderboard({ votes: {}, statistics: {} }, 'round_of_32', matchups).toJSON();

    expect(description).toContain('**1A** 🤝');
    expect(description.match(/1 vote \(50%\)/g)).toHaveLength(2);
  });
});

describe('/bracket my-votes', () => {
  test('shows real line breaks and a readable phase', async () => {
    bracketManager.createTournament(GUILD_ID, 'Status Cup', ADMIN, 4);
    for (let i = 1; i <= 4; i++) bracketManager.addTitle(GUILD_ID, 'A', 'movie', movie(i));
    await execute(slash('open', { strings: { duration: '1h' } }));

    const mine = slash('my-votes', { userId: MEMBER });
    await execute(mine);

    const said = allSaid(mine);
    expect(said).not.toContain('\\\\n');
    expect(said).toContain('Phase: Semifinals');
  });
});

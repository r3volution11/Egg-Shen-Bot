/**
 * The region and single-matchup "open" buttons, driven through the real
 * button handler against a real tournament. Both used to set whatever they
 * were given to voting: a decided matchup was reopened with its winner still
 * seated in the next round. They now go through
 * bracketManager.openKnockoutMatchups, like the slash commands.
 *
 * Run with: npm test -- tests/bracket-open-buttons.test.js
 */

import { describe, test, expect, jest, beforeAll, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const GUILD_ID = 'bracket-open-buttons-guild';

let handleButtonInteraction;
let bracketManager;

beforeAll(async () => {
  ({ handleButtonInteraction } = await import('../src/handlers/buttonHandler.js'));
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

function adminInteraction(customId) {
  return {
    customId,
    isButton: () => true,
    guildId: GUILD_ID,
    guild: { id: GUILD_ID },
    channelId: 'channel-1',
    channel: { send: jest.fn().mockResolvedValue({ id: 'msg-1' }) },
    user: { id: 'admin-1', username: 'admin' },
    member: { permissions: { has: (flag) => String(flag) === 'Administrator' || String(flag) === '8' } },
    message: { embeds: [], edit: jest.fn().mockResolvedValue(undefined) },
    deferUpdate: jest.fn().mockResolvedValue(undefined),
    deferReply: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    followUp: jest.fn().mockResolvedValue(undefined),
    replied: false,
    deferred: false,
  };
}

/** A 16-title straight bracket in its round of 16: 8 matchups, 2 per region. */
function roundOf16() {
  bracketManager.createTournament(GUILD_ID, 'Button Cup', 'admin-1', 16);
  for (let i = 0; i < 16; i++) {
    bracketManager.addTitle(GUILD_ID, 'A', 'movie', { id: i + 1, title: `M${i + 1}`, year: String(1970 + i), type: 'movie' });
  }
  bracketManager.generateKnockoutBracket(GUILD_ID);
  const t = bracketManager.loadTournament(GUILD_ID);
  return t.knockoutBracket.filter(m => m.round === t.phase).sort((a, b) => a.position - b.position);
}

function decide(matchupId) {
  bracketManager.voteKnockout(GUILD_ID, 'voter-1', matchupId, 1);
  bracketManager.closeKnockoutMatchup(GUILD_ID, matchupId);
}

const load = (id) => bracketManager.loadTournament(GUILD_ID).knockoutBracket.find(m => m.id === id);
const followUpText = (i) => i.followUp.mock.calls.map(c => c[0]?.content || '').join('\n');

describe('open_region_ button', () => {
  test('opens only the region\'s fresh matchups, leaving a decided one decided', async () => {
    const [first, second] = roundOf16();
    bracketManager.openKnockoutMatchups(GUILD_ID, [first.id], null);
    decide(first.id);
    const winner = load(first.id).winner;

    const click = adminInteraction('open_region_1_3600000');
    await handleButtonInteraction(click);

    expect(load(first.id)).toMatchObject({ status: 'closed', winner });
    expect(load(second.id).status).toBe('voting');
    // Only the newly opened matchup gets its own voting card
    const cards = click.channel.send.mock.calls.filter(c => c[0]?.components);
    expect(cards).toHaveLength(1);
  });

  test('a region with nothing left to open says so and changes nothing', async () => {
    const [first, second] = roundOf16();
    bracketManager.openKnockoutMatchups(GUILD_ID, [first.id, second.id], null);
    bracketManager.voteKnockout(GUILD_ID, 'voter-3', second.id, 2);
    decide(first.id);

    const click = adminInteraction('open_region_1_3600000');
    await handleButtonInteraction(click);

    expect(followUpText(click)).toContain('Nothing to open in Region 1');
    expect(load(second.id).votes.movie2).toEqual(['voter-3']);
    expect(click.channel.send).not.toHaveBeenCalled();
  });
});

describe('open_matchup_ button', () => {
  test('refuses a decided matchup', async () => {
    const [first] = roundOf16();
    bracketManager.openKnockoutMatchups(GUILD_ID, [first.id], null);
    decide(first.id);

    const click = adminInteraction(`open_matchup_${first.id}_3600000`);
    await handleButtonInteraction(click);

    expect(followUpText(click)).toContain('already been decided');
    expect(load(first.id).status).toBe('closed');
  });

  test('opens a fresh one', async () => {
    const [first] = roundOf16();
    const click = adminInteraction(`open_matchup_${first.id}_3600000`);
    await handleButtonInteraction(click);
    expect(load(first.id).status).toBe('voting');
  });
});

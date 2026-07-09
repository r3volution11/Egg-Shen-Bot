/**
 * Command-layer tests for /bracket close-groups and /bracket resolve-tiebreaker.
 *
 * Uses the real bracketManager (file-backed, like tiebreaker-flow.test.js) so
 * these tests exercise the actual command -> bracketManager -> disk wiring,
 * with only the discord.js Interaction mocked out. This is the layer that
 * shipped a real bug (finalizeGroupAfterTiebreaker not resetting votingOpen)
 * with no coverage, so the focus here is permission gating, error handling,
 * and the manual-override vs vote-tally resolution branches.
 *
 * Run with: npx jest tests/bracket-command.test.js --verbose
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { PermissionFlagsBits } from 'discord.js';
import * as bracketManager from '../src/utils/bracketManager.js';
import { execute } from '../src/commands/bracket.js';

const GUILD_ID = 'bracket-command-test-guild';
const TOURNAMENT_DIR = path.join(process.cwd(), 'guild_tournaments');

// ─── helpers ─────────────────────────────────────────────────────────────────

function cleanup() {
  const f = path.join(TOURNAMENT_DIR, `${GUILD_ID}.json`);
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

function makeEntry(id, title) {
  return { id, title, year: '2024', posterUrl: '' };
}

function setupGroupTournament() {
  bracketManager.createTournament(GUILD_ID, 'Command Test Cup', 'admin-1', 36);
  bracketManager.resizeTournament(GUILD_ID, 4);

  const groups = {
    A: ['Ring', 'Halloween', 'Psycho', 'Nosferatu'],
    B: ['Scream', 'The Witch', "Don't Look Now", 'Suspiria'],
    C: ['Hereditary', 'Midsommar', 'The Thing', 'Alien'],
    D: ['Jaws', 'Silence of the Lambs', 'Se7en', 'Misery'],
  };

  for (const [groupId, titles] of Object.entries(groups)) {
    for (let i = 0; i < titles.length; i++) {
      bracketManager.addGroupTitle(GUILD_ID, groupId, 'movie', makeEntry(`${groupId}-${i}`, titles[i]));
    }
  }

  return bracketManager.openGroupVoting(GUILD_ID, ['A', 'B', 'C', 'D'], Date.now() + 24 * 60 * 60 * 1000);
}

function castGroupVote(userId, groupId, idx1, idx2) {
  return bracketManager.voteGroupStage(GUILD_ID, userId, groupId, [idx1, idx2]);
}

/** Builds a mock ChatInputCommandInteraction sufficient for bracket.js's execute(). */
function createMockInteraction({ subcommand, strings = {}, integers = {}, isAdmin = true, isMod = false }) {
  const fetchedMessage = { edit: jest.fn().mockResolvedValue(undefined) };
  const fetchedChannel = { messages: { fetch: jest.fn().mockResolvedValue(fetchedMessage) } };

  return {
    guildId: GUILD_ID,
    channelId: 'channel-1',
    deferred: false,
    replied: false,
    options: {
      getSubcommand: () => subcommand,
      getString: (name) => (name in strings ? strings[name] : null),
      getInteger: (name) => (name in integers ? integers[name] : null),
    },
    member: {
      permissions: {
        has: (flag) => {
          if (flag === PermissionFlagsBits.Administrator) return isAdmin;
          if (flag === PermissionFlagsBits.ModerateMembers) return isMod;
          return false;
        },
      },
    },
    deferReply: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn().mockResolvedValue(undefined),
    followUp: jest.fn().mockResolvedValue({ id: 'tiebreaker-msg-1' }),
    client: {
      channels: { fetch: jest.fn().mockResolvedValue(fetchedChannel) },
    },
    _fetchedMessage: fetchedMessage,
    _fetchedChannel: fetchedChannel,
  };
}

// ─── setup / teardown ────────────────────────────────────────────────────────

beforeEach(cleanup);
afterEach(cleanup);

// ─── tests ───────────────────────────────────────────────────────────────────

describe('/bracket close-groups and resolve-tiebreaker — permission gating', () => {
  test('non-admin, non-mod is rejected before touching tournament state', async () => {
    setupGroupTournament();
    const interaction = createMockInteraction({
      subcommand: 'close-groups',
      strings: { groups: 'A' },
      isAdmin: false,
      isMod: false,
    });

    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('administrators and moderators') })
    );
    expect(interaction.deferReply).not.toHaveBeenCalled();
  });

  test('moderator (non-admin) is allowed to close groups', async () => {
    setupGroupTournament();
    const interaction = createMockInteraction({
      subcommand: 'close-groups',
      strings: { groups: 'B' },
      isAdmin: false,
      isMod: true,
    });

    await execute(interaction);

    expect(interaction.reply).not.toHaveBeenCalled();
    expect(interaction.deferReply).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalled();
  });
});

describe('/bracket close-groups', () => {
  test('closing a group with no tie posts final results, no tiebreaker created', async () => {
    setupGroupTournament();
    // Strictly decreasing tally so 1st, 2nd, and 3rd are all unambiguous:
    // Ring=3, Halloween=2, Psycho=1, Nosferatu=0.
    castGroupVote('user-1', 'A', 0, 1);
    castGroupVote('user-2', 'A', 0, 1);
    castGroupVote('user-3', 'A', 0, 2);

    const interaction = createMockInteraction({ subcommand: 'close-groups', strings: { groups: 'A' } });
    await execute(interaction);

    expect(interaction.followUp).not.toHaveBeenCalled();
    const replyArg = interaction.editReply.mock.calls.at(-1)[0];
    expect(replyArg.embeds[0].data.title).toContain('Results');

    const t = bracketManager.loadTournament(GUILD_ID);
    expect(t.groups['A'].status).toBe('closed');
    expect(t.groups['A'].votingOpen).toBe(false);
  });

  test('closing a tied group creates a tiebreaker, posts voting embed+buttons, and stores the message ref', async () => {
    setupGroupTournament();
    // Ring and Halloween both get 2 votes each -> 1st place tie.
    castGroupVote('user-1', 'A', 0, 1);
    castGroupVote('user-2', 'A', 0, 1);

    const interaction = createMockInteraction({ subcommand: 'close-groups', strings: { groups: 'A' } });
    await execute(interaction);

    // Summary embed via editReply, then one followUp per tiebreaker with buttons attached.
    expect(interaction.followUp).toHaveBeenCalledTimes(1);
    const followUpArg = interaction.followUp.mock.calls[0][0];
    expect(followUpArg.components.length).toBeGreaterThan(0);

    const t = bracketManager.loadTournament(GUILD_ID);
    expect(t.groups['A'].status).toBe('tiebreaker');
    const tb = t.tiebreakers.find((x) => x.groupId === 'A');
    expect(tb).toBeDefined();
    expect(tb.messageId).toBe('tiebreaker-msg-1');
    expect(tb.messageChannelId).toBe('channel-1');
  });

  test('partial votes (1 of 2 selections) are discarded and surfaced as a warning', async () => {
    setupGroupTournament();
    castGroupVote('user-1', 'A', 0, 1);
    // user-2 only selects one title — voteGroupStage allows 0-2 selections mid-voting.
    bracketManager.voteGroupStage(GUILD_ID, 'user-2', 'A', [2]);

    const interaction = createMockInteraction({ subcommand: 'close-groups', strings: { groups: 'A' } });
    await execute(interaction);

    const replyArg = interaction.editReply.mock.calls.at(-1)[0];
    const description = replyArg.embeds[0].data.description;
    expect(description).toContain('Partial votes discarded');
    expect(description).toContain('user-2');
  });

  test('invalid tiebreaker-duration format is rejected without mutating tournament state', async () => {
    setupGroupTournament();
    const interaction = createMockInteraction({
      subcommand: 'close-groups',
      strings: { groups: 'A', 'tiebreaker-duration': 'not-a-duration' },
    });

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('Invalid tiebreaker duration'));
    const t = bracketManager.loadTournament(GUILD_ID);
    expect(t.groups['A'].votingOpen).toBe(true); // untouched
  });
});

describe('/bracket resolve-tiebreaker', () => {
  function createTieInGroupA() {
    castGroupVote('user-1', 'A', 0, 1);
    castGroupVote('user-2', 'A', 0, 1);
    const closeResult = bracketManager.closeGroupVoting(GUILD_ID, ['A']);
    return closeResult.tiebreakersCreated[0].tiebreaker.id;
  }

  test('unknown tiebreaker-id is rejected with an error reply', async () => {
    setupGroupTournament();
    const interaction = createMockInteraction({
      subcommand: 'resolve-tiebreaker',
      strings: { 'tiebreaker-id': 'no-such-id' },
    });

    await execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('Tiebreaker not found'));
  });

  test('resolving without a winner tallies votes and finalizes the group with votingOpen=false', async () => {
    setupGroupTournament();
    const tbId = createTieInGroupA();
    bracketManager.voteInTiebreaker(GUILD_ID, tbId, 'voter-1', 0);
    bracketManager.voteInTiebreaker(GUILD_ID, tbId, 'voter-2', 0);

    const interaction = createMockInteraction({
      subcommand: 'resolve-tiebreaker',
      strings: { 'tiebreaker-id': tbId },
    });
    await execute(interaction);

    const embedArg = interaction.editReply.mock.calls.at(-1)[0];
    expect(embedArg.embeds[0].data.title).toBe('✅ Tiebreaker Resolved');
    const winnerField = embedArg.embeds[0].data.fields.find((f) => f.name.includes('Winner'));
    expect(winnerField.value).toBe('Ring');

    const t = bracketManager.loadTournament(GUILD_ID);
    expect(t.groups['A'].status).toBe('closed');
    expect(t.groups['A'].votingOpen).toBe(false); // regression coverage at the command layer
    expect(t.groupResults['A'].first.title).toBe('Ring');
  });

  test('resolving with a winner param is a manual override, independent of votes cast', async () => {
    setupGroupTournament();
    const tbId = createTieInGroupA();
    // Everyone votes for option 0 (Ring)...
    bracketManager.voteInTiebreaker(GUILD_ID, tbId, 'voter-1', 0);

    // ...but the admin manually overrides to option 1 (Halloween, winner=2 is 1-indexed).
    const interaction = createMockInteraction({
      subcommand: 'resolve-tiebreaker',
      strings: { 'tiebreaker-id': tbId },
      integers: { winner: 2 },
    });
    await execute(interaction);

    const embedArg = interaction.editReply.mock.calls.at(-1)[0];
    const methodField = embedArg.embeds[0].data.fields.find((f) => f.name.includes('Resolution Method'));
    expect(methodField.value).toBe('Manual (Admin Override)');
    const winnerField = embedArg.embeds[0].data.fields.find((f) => f.name.includes('Winner'));
    expect(winnerField.value).toBe('Halloween');

    const t = bracketManager.loadTournament(GUILD_ID);
    expect(t.groupResults['A'].first.title).toBe('Halloween');
    expect(t.groups['A'].votingOpen).toBe(false);
  });

  test('disables the original voting message buttons when a message reference exists', async () => {
    setupGroupTournament();
    const tbId = createTieInGroupA();
    bracketManager.storeTiebreakerMessage(GUILD_ID, tbId, 'channel-1', 'orig-msg-1');
    bracketManager.voteInTiebreaker(GUILD_ID, tbId, 'voter-1', 0);

    const interaction = createMockInteraction({
      subcommand: 'resolve-tiebreaker',
      strings: { 'tiebreaker-id': tbId },
    });
    await execute(interaction);

    expect(interaction.client.channels.fetch).toHaveBeenCalledWith('channel-1');
    expect(interaction._fetchedChannel.messages.fetch).toHaveBeenCalledWith('orig-msg-1');
    expect(interaction._fetchedMessage.edit).toHaveBeenCalled();
    const editArg = interaction._fetchedMessage.edit.mock.calls[0][0];
    expect(editArg.components[0].components[0].data.disabled).toBe(true);
  });
});

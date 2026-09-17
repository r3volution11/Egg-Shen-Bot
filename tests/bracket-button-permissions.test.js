/**
 * Regression test: tournament MANAGEMENT buttons never checked permissions.
 *
 * /bracket open-matchup, close-matchup, open-groups and advance-knockout are
 * all in bracket.js's requiresAdmin list, but the selectors they post are
 * PUBLIC messages (deferReply with no ephemeral flag). Discord shows those
 * buttons to everyone in the channel, and the button handlers re-ran none of
 * the command's permission checks — so any member could click them to open
 * matchups, start voting rounds, or close a matchup early to lock in a
 * result they preferred.
 *
 * The voting buttons (group_vote_, knockout_vote_, tiebreaker_vote_) are
 * deliberately NOT gated — those are meant for everyone.
 *
 * Run with: npm test -- tests/bracket-button-permissions.test.js
 */

import { describe, test, expect, jest, beforeAll, beforeEach } from '@jest/globals';

let handleButtonInteraction;

beforeAll(async () => {
  ({ handleButtonInteraction } = await import('../src/handlers/buttonHandler.js'));
});

/**
 * Mirrors tests/bracket-command-toggle.test.js's member mock: permissions.has
 * is called with PermissionFlagsBits (bigint) by the button guard and with
 * plain strings by guildConfig's isAdmin().
 */
function makeMember({ admin = false, mod = false } = {}) {
  return {
    permissions: {
      has: (flag) => {
        const f = String(flag);
        if (admin && (f === 'Administrator' || f === '8')) return true;
        // ModerateMembers = 1 << 40
        if (mod && (f === 'ModerateMembers' || f === String(1n << 40n))) return true;
        return false;
      },
    },
  };
}

function makeInteraction(customId, { admin = false, mod = false } = {}) {
  return {
    customId,
    isButton: () => true,
    guildId: 'guild-1',
    guild: { id: 'guild-1' },
    channelId: 'channel-1',
    user: { id: 'user-1', username: 'regular-member' },
    member: makeMember({ admin, mod }),
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

/** Did the handler refuse with the admin/mod message? */
function wasRefused(interaction) {
  return interaction.followUp.mock.calls.some(c =>
    typeof c[0]?.content === 'string' &&
    c[0].content.includes('Only administrators and moderators')
  );
}

const MANAGEMENT_BUTTONS = [
  ['open_matchup_abc123_3600000', 'open matchups'],
  ['close_matchup_abc123', 'close matchups'],
  ['open_region_1_3600000', 'open a whole region'],
  ['start_group_voting_A,B', 'start group voting'],
  ['start_knockout_voting_round_of_16', 'start knockout voting'],
];

describe('tournament management buttons reject non-managers', () => {
  test.each(MANAGEMENT_BUTTONS)('%s is refused for a regular member', async (customId) => {
    const interaction = makeInteraction(customId, { admin: false, mod: false });

    await handleButtonInteraction(interaction);

    expect(wasRefused(interaction)).toBe(true);
  });
});

describe('managers are not blocked', () => {
  test.each(MANAGEMENT_BUTTONS)('%s is allowed for an administrator', async (customId) => {
    const interaction = makeInteraction(customId, { admin: true });

    await handleButtonInteraction(interaction);

    // It may still fail later (no tournament exists in this test), but it must
    // NOT fail with the permission refusal.
    expect(wasRefused(interaction)).toBe(false);
  });

  test.each(MANAGEMENT_BUTTONS)('%s is allowed for a moderator', async (customId) => {
    const interaction = makeInteraction(customId, { mod: true });

    await handleButtonInteraction(interaction);

    expect(wasRefused(interaction)).toBe(false);
  });
});

describe('voting buttons stay open to everyone', () => {
  test.each([
    ['group_vote_A_0'],
    ['knockout_vote_abc123_movie1'],
    ['tiebreaker_vote_tb1_0'],
  ])('%s is not gated behind admin/mod', async (customId) => {
    const interaction = makeInteraction(customId, { admin: false, mod: false });

    await handleButtonInteraction(interaction);

    // Voting is the whole point of a tournament — a regular member clicking
    // one must never see the management refusal.
    expect(wasRefused(interaction)).toBe(false);
  });
});

/**
 * Tests for src/utils/pollManager.js's auto-expiry and close-and-announce
 * additions:
 *
 * - createPoll's new optional expiresInMinutes param
 * - getExpiredActivePolls (used by pollScheduler.js's auto-close sweep)
 * - createPollEmbed's new "Voting Ends" field for active polls with an
 *   expiresAt set
 * - closePollAndAnnounce, the shared close flow now used by both
 *   /survey close and the auto-expiry scheduler, so both behave identically
 *
 * Run with: npx jest tests/pollManager.test.js --verbose
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import {
  createPoll,
  getExpiredActivePolls,
  createPollEmbed,
  closePollAndAnnounce,
  getPoll,
  castSingleVote,
  toggleVote,
  buildSurveyButtons,
} from '../src/utils/pollManager.js';

const POLLS_DIR = path.join(process.cwd(), 'guild_polls');
const GUILD_A = 'poll-manager-test-guild-a';
const GUILD_B = 'poll-manager-test-guild-b';

function cleanup() {
  for (const guildId of [GUILD_A, GUILD_B]) {
    const file = path.join(POLLS_DIR, `${guildId}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}

beforeEach(cleanup);
afterEach(cleanup);

describe('createPoll — expiresAt', () => {
  test('leaves expiresAt null when no duration is given', () => {
    const poll = createPoll(GUILD_A, 'chan-1', 'msg-1', 'user-1', 'Q?', ['A', 'B']);
    expect(poll.expiresAt).toBeNull();
  });

  test('sets expiresAt to now + duration minutes when given', () => {
    const before = Date.now();
    const poll = createPoll(GUILD_A, 'chan-1', 'msg-1', 'user-1', 'Q?', ['A', 'B'], false, 60);
    const after = Date.now();

    const expiresAtMs = new Date(poll.expiresAt).getTime();
    expect(expiresAtMs).toBeGreaterThanOrEqual(before + 60 * 60 * 1000);
    expect(expiresAtMs).toBeLessThanOrEqual(after + 60 * 60 * 1000);
  });

  test('defaults votingMethod to buttons', () => {
    const poll = createPoll(GUILD_A, 'chan-1', 'msg-1', 'user-1', 'Q?', ['A', 'B']);
    expect(poll.votingMethod).toBe('buttons');
  });
});

describe('castSingleVote', () => {
  test('replaces the user\'s previous vote, matching addVote\'s single-select semantics', () => {
    const poll = createPoll(GUILD_A, 'chan-1', 'msg-1', 'user-1', 'Q?', ['A', 'B']);
    castSingleVote(GUILD_A, poll.pollId, 0, 'voter-1');
    castSingleVote(GUILD_A, poll.pollId, 1, 'voter-1');

    const persisted = getPoll(GUILD_A, poll.pollId);
    expect(persisted.options[0].votes).not.toContain('voter-1');
    expect(persisted.options[1].votes).toContain('voter-1');
  });
});

describe('toggleVote', () => {
  test('adds a vote and reports selected: true when the option was not previously selected', () => {
    const poll = createPoll(GUILD_A, 'chan-1', 'msg-1', 'user-1', 'Q?', ['A', 'B'], true);
    const result = toggleVote(GUILD_A, poll.pollId, 0, 'voter-1');

    expect(result.selected).toBe(true);
    expect(result.poll.options[0].votes).toContain('voter-1');
  });

  test('removes the vote and reports selected: false when clicked again', () => {
    const poll = createPoll(GUILD_A, 'chan-1', 'msg-1', 'user-1', 'Q?', ['A', 'B'], true);
    toggleVote(GUILD_A, poll.pollId, 0, 'voter-1');
    const result = toggleVote(GUILD_A, poll.pollId, 0, 'voter-1');

    expect(result.selected).toBe(false);
    expect(result.poll.options[0].votes).not.toContain('voter-1');
  });

  test('toggling one option leaves other selected options untouched (unlike addVote)', () => {
    const poll = createPoll(GUILD_A, 'chan-1', 'msg-1', 'user-1', 'Q?', ['A', 'B', 'C'], true);
    toggleVote(GUILD_A, poll.pollId, 0, 'voter-1');
    toggleVote(GUILD_A, poll.pollId, 1, 'voter-1');

    const persisted = getPoll(GUILD_A, poll.pollId);
    expect(persisted.options[0].votes).toContain('voter-1');
    expect(persisted.options[1].votes).toContain('voter-1');
  });

  test('throws for a closed poll', () => {
    const poll = createPoll(GUILD_A, 'chan-1', 'msg-1', 'user-1', 'Q?', ['A', 'B'], true);
    const polls = JSON.parse(fs.readFileSync(path.join(POLLS_DIR, `${GUILD_A}.json`), 'utf8'));
    polls.find(p => p.pollId === poll.pollId).status = 'closed';
    fs.writeFileSync(path.join(POLLS_DIR, `${GUILD_A}.json`), JSON.stringify(polls), 'utf8');

    expect(() => toggleVote(GUILD_A, poll.pollId, 0, 'voter-1')).toThrow('Poll is not active');
  });
});

describe('buildSurveyButtons', () => {
  test('builds one button per option', () => {
    const poll = createPoll(GUILD_A, 'chan-1', 'msg-1', 'user-1', 'Q?', ['A', 'B', 'C']);
    const rows = buildSurveyButtons(poll);
    const totalButtons = rows.reduce((sum, row) => sum + row.components.length, 0);
    expect(totalButtons).toBe(3);
  });

  test('chunks 10 options into 2 rows of 5, never exceeding Discord\'s per-row limit', () => {
    const options = Array.from({ length: 10 }, (_, i) => `Option ${i}`);
    const poll = createPoll(GUILD_A, 'chan-1', 'msg-1', 'user-1', 'Q?', options);
    const rows = buildSurveyButtons(poll);

    expect(rows).toHaveLength(2);
    expect(rows[0].components).toHaveLength(5);
    expect(rows[1].components).toHaveLength(5);
  });

  test('each button\'s customId encodes the pollId and option id for later parsing', () => {
    const poll = createPoll(GUILD_A, 'chan-1', 'msg-1', 'user-1', 'Q?', ['A', 'B']);
    const rows = buildSurveyButtons(poll);

    expect(rows[0].components[0].data.custom_id).toBe(`survey_vote_${poll.pollId}_0`);
    expect(rows[0].components[1].data.custom_id).toBe(`survey_vote_${poll.pollId}_1`);
  });

  test('truncates option labels longer than 80 characters (Discord button label limit)', () => {
    const longText = 'x'.repeat(100);
    const poll = createPoll(GUILD_A, 'chan-1', 'msg-1', 'user-1', 'Q?', [longText, 'B']);
    const rows = buildSurveyButtons(poll);

    expect(rows[0].components[0].data.label.length).toBeLessThanOrEqual(80);
    expect(rows[0].components[0].data.label.endsWith('...')).toBe(true);
  });
});

describe('getExpiredActivePolls', () => {
  test('returns polls whose expiresAt has passed and are still active', () => {
    // Directly seed an already-expired active poll (createPoll only accepts
    // a future duration, so write the fixture directly).
    fs.mkdirSync(POLLS_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(POLLS_DIR, `${GUILD_A}.json`),
      JSON.stringify([
        {
          pollId: 'expired-1',
          guildId: GUILD_A,
          channelId: 'chan-1',
          messageId: 'msg-1',
          creatorId: 'user-1',
          question: 'Expired?',
          options: [{ id: 0, text: 'Yes', emoji: '1️⃣', votes: [] }],
          allowMultipleVotes: false,
          status: 'active',
          createdAt: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
          expiresAt: new Date(Date.now() - 60 * 1000).toISOString(), // 1 min ago
          closedAt: null,
          closedBy: null,
        },
      ]),
      'utf8'
    );

    const expired = getExpiredActivePolls();
    expect(expired).toHaveLength(1);
    expect(expired[0].guildId).toBe(GUILD_A);
    expect(expired[0].poll.pollId).toBe('expired-1');
  });

  test('does not return active polls whose expiresAt is still in the future', () => {
    createPoll(GUILD_A, 'chan-1', 'msg-1', 'user-1', 'Q?', ['A', 'B'], false, 60);
    const expired = getExpiredActivePolls();
    expect(expired).toHaveLength(0);
  });

  test('does not return polls with no expiresAt set', () => {
    createPoll(GUILD_A, 'chan-1', 'msg-1', 'user-1', 'Q?', ['A', 'B']);
    const expired = getExpiredActivePolls();
    expect(expired).toHaveLength(0);
  });

  test('does not return already-closed polls even if expiresAt has passed', () => {
    fs.mkdirSync(POLLS_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(POLLS_DIR, `${GUILD_B}.json`),
      JSON.stringify([
        {
          pollId: 'closed-1',
          guildId: GUILD_B,
          channelId: 'chan-1',
          messageId: 'msg-1',
          creatorId: 'user-1',
          question: 'Closed?',
          options: [{ id: 0, text: 'Yes', emoji: '1️⃣', votes: [] }],
          allowMultipleVotes: false,
          status: 'closed',
          createdAt: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
          expiresAt: new Date(Date.now() - 60 * 1000).toISOString(),
          closedAt: new Date().toISOString(),
          closedBy: 'user-1',
        },
      ]),
      'utf8'
    );

    const expired = getExpiredActivePolls();
    expect(expired.find(e => e.poll.pollId === 'closed-1')).toBeUndefined();
  });
});

describe('createPollEmbed — Voting Ends field', () => {
  test('shows a "Voting Ends" field for an active poll with expiresAt set', () => {
    const poll = createPoll(GUILD_A, 'chan-1', 'msg-1', 'user-1', 'Q?', ['A', 'B'], false, 60);
    const embed = createPollEmbed(poll, false);

    const field = embed.data.fields.find(f => f.name === 'Voting Ends');
    expect(field).toBeDefined();
  });

  test('omits the field for an active poll with no expiresAt', () => {
    const poll = createPoll(GUILD_A, 'chan-1', 'msg-1', 'user-1', 'Q?', ['A', 'B']);
    const embed = createPollEmbed(poll, false);

    const field = embed.data.fields?.find(f => f.name === 'Voting Ends');
    expect(field).toBeUndefined();
  });

  test('shows "Closed" instead of "Voting Ends" once a poll is closed, even if it had an expiresAt', () => {
    const poll = createPoll(GUILD_A, 'chan-1', 'msg-1', 'user-1', 'Q?', ['A', 'B'], false, 60);
    poll.status = 'closed';
    poll.closedAt = new Date().toISOString();

    const embed = createPollEmbed(poll, true);

    expect(embed.data.fields.find(f => f.name === 'Closed')).toBeDefined();
    expect(embed.data.fields.find(f => f.name === 'Voting Ends')).toBeUndefined();
  });
});

describe('closePollAndAnnounce', () => {
  function makeMessage() {
    return {
      edit: jest.fn().mockResolvedValue(undefined),
      reactions: { removeAll: jest.fn().mockResolvedValue(undefined) },
    };
  }

  function makeClient(message) {
    const channel = {
      messages: { fetch: jest.fn().mockResolvedValue(message) },
      send: jest.fn().mockResolvedValue(undefined),
    };
    return {
      channels: { fetch: jest.fn().mockResolvedValue(channel) },
      channel,
    };
  }

  test('closes a button-based poll: edits the message with disabled buttons and posts results', async () => {
    const poll = createPoll(GUILD_A, 'chan-1', 'msg-1', 'user-1', 'Q?', ['A', 'B']); // votingMethod defaults to 'buttons'
    const message = makeMessage();
    const client = makeClient(message);

    const result = await closePollAndAnnounce(client, GUILD_A, poll.pollId, 'closer-1');

    expect(result.success).toBe(true);
    expect(result.poll.status).toBe('closed');
    expect(result.poll.closedBy).toBe('closer-1');
    expect(message.edit).toHaveBeenCalledTimes(1);
    expect(message.reactions.removeAll).not.toHaveBeenCalled(); // buttons, not reactions
    const editArgs = message.edit.mock.calls[0][0];
    expect(editArgs.components[0].components[0].data.disabled).toBe(true);
    expect(client.channel.send).toHaveBeenCalledTimes(1);

    const persisted = getPoll(GUILD_A, poll.pollId);
    expect(persisted.status).toBe('closed');
  });

  test('closes a legacy reaction-based poll: edits the message and removes reactions', async () => {
    const poll = createPoll(GUILD_A, 'chan-1', 'msg-1', 'user-1', 'Q?', ['A', 'B']);

    // Simulate a poll created before buttons existed by patching the field
    // directly on disk — createPoll always defaults to 'buttons' now.
    const polls = JSON.parse(fs.readFileSync(path.join(POLLS_DIR, `${GUILD_A}.json`), 'utf8'));
    polls.find(p => p.pollId === poll.pollId).votingMethod = 'reactions';
    fs.writeFileSync(path.join(POLLS_DIR, `${GUILD_A}.json`), JSON.stringify(polls), 'utf8');

    const message = makeMessage();
    const client = makeClient(message);

    const result = await closePollAndAnnounce(client, GUILD_A, poll.pollId, 'closer-1');

    expect(result.success).toBe(true);
    expect(message.edit).toHaveBeenCalledTimes(1);
    expect(message.edit.mock.calls[0][0].components).toBeUndefined(); // no buttons touched
    expect(message.reactions.removeAll).toHaveBeenCalledTimes(1);
  });

  test('fails without persisting anything if the poll does not exist', async () => {
    const client = makeClient(makeMessage());
    const result = await closePollAndAnnounce(client, GUILD_A, 'no-such-poll', 'closer-1');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Poll not found');
  });

  test('fails if the poll is already closed', async () => {
    const poll = createPoll(GUILD_A, 'chan-1', 'msg-1', 'user-1', 'Q?', ['A', 'B']);
    const client = makeClient(makeMessage());
    await closePollAndAnnounce(client, GUILD_A, poll.pollId, 'closer-1');

    const secondAttempt = await closePollAndAnnounce(client, GUILD_A, poll.pollId, 'closer-2');
    expect(secondAttempt.success).toBe(false);
    expect(secondAttempt.error).toBe('Poll already closed');
  });

  test('leaves the poll open (not persisted as closed) if fetching the message fails', async () => {
    const poll = createPoll(GUILD_A, 'chan-1', 'msg-1', 'user-1', 'Q?', ['A', 'B']);
    const client = {
      channels: { fetch: jest.fn().mockRejectedValue(new Error('Unknown Channel')) },
    };

    const result = await closePollAndAnnounce(client, GUILD_A, poll.pollId, 'closer-1');

    expect(result.success).toBe(false);
    const persisted = getPoll(GUILD_A, poll.pollId);
    expect(persisted.status).toBe('active'); // not left in a half-closed state
  });
});

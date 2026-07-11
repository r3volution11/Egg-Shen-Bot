/**
 * Tests for survey_vote_ button clicks, dispatched through the real
 * handleButtonInteraction() (src/handlers/buttonHandler.js) into the
 * private handleSurveyVote() it routes to.
 *
 * Surveys created after the button-voting rework use Discord buttons
 * instead of emoji reactions for casting votes — this avoids the old
 * reaction-count badge always showing +1 from the bot's own setup
 * reaction (Discord's native reaction UI counts every reactor including
 * the bot, which the embed's own "Total votes" text never included, but
 * looked like a real vote-count bug at a glance). Buttons don't require
 * the bot to add anything to the message, so there's no equivalent
 * artifact.
 *
 * Run with: npx jest tests/survey-vote-button.test.js --verbose
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { handleButtonInteraction } from '../src/handlers/buttonHandler.js';
import { createPoll, getPoll } from '../src/utils/pollManager.js';

const GUILD_ID = 'survey-vote-button-test-guild';
const POLL_FILE = path.join(process.cwd(), 'guild_polls', `${GUILD_ID}.json`);

function cleanup() {
  if (fs.existsSync(POLL_FILE)) fs.unlinkSync(POLL_FILE);
}

beforeEach(cleanup);
afterEach(cleanup);

function makeInteraction({ customId, userId = 'voter-1' }) {
  return {
    customId,
    user: { id: userId, tag: `${userId}#0000` },
    guild: { id: GUILD_ID },
    member: { permissions: { has: () => false } },
    deferUpdate: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    followUp: jest.fn().mockResolvedValue(undefined),
  };
}

describe('survey_vote_ button dispatch', () => {
  test('is routed to the survey vote handler, not the "unknown button" fallthrough', async () => {
    const poll = createPoll(GUILD_ID, 'chan-1', 'msg-1', 'creator-1', 'Q?', ['A', 'B']);
    const interaction = makeInteraction({ customId: `survey_vote_${poll.pollId}_0` });

    await handleButtonInteraction(interaction);

    expect(interaction.deferUpdate).toHaveBeenCalledTimes(1);
    expect(interaction.editReply).toHaveBeenCalledTimes(1);
    expect(interaction.followUp).toHaveBeenCalledTimes(1);
  });

  test('single-select: records the vote and confirms it privately', async () => {
    const poll = createPoll(GUILD_ID, 'chan-1', 'msg-1', 'creator-1', 'Pick one', ['Alpha', 'Beta']);
    const interaction = makeInteraction({ customId: `survey_vote_${poll.pollId}_1` });

    await handleButtonInteraction(interaction);

    const persisted = getPoll(GUILD_ID, poll.pollId);
    expect(persisted.options[1].votes).toContain('voter-1');
    expect(interaction.followUp.mock.calls[0][0].content).toContain('Beta');
  });

  test('single-select: voting for a different option replaces the previous vote', async () => {
    const poll = createPoll(GUILD_ID, 'chan-1', 'msg-1', 'creator-1', 'Pick one', ['Alpha', 'Beta']);

    await handleButtonInteraction(makeInteraction({ customId: `survey_vote_${poll.pollId}_0` }));
    await handleButtonInteraction(makeInteraction({ customId: `survey_vote_${poll.pollId}_1` }));

    const persisted = getPoll(GUILD_ID, poll.pollId);
    expect(persisted.options[0].votes).not.toContain('voter-1');
    expect(persisted.options[1].votes).toContain('voter-1');
  });

  test('multi-select: clicking two different options keeps both selected', async () => {
    const poll = createPoll(GUILD_ID, 'chan-1', 'msg-1', 'creator-1', 'Pick any', ['Alpha', 'Beta'], true);

    await handleButtonInteraction(makeInteraction({ customId: `survey_vote_${poll.pollId}_0` }));
    await handleButtonInteraction(makeInteraction({ customId: `survey_vote_${poll.pollId}_1` }));

    const persisted = getPoll(GUILD_ID, poll.pollId);
    expect(persisted.options[0].votes).toContain('voter-1');
    expect(persisted.options[1].votes).toContain('voter-1');
  });

  test('multi-select: clicking an already-selected option removes just that vote', async () => {
    const poll = createPoll(GUILD_ID, 'chan-1', 'msg-1', 'creator-1', 'Pick any', ['Alpha', 'Beta'], true);

    await handleButtonInteraction(makeInteraction({ customId: `survey_vote_${poll.pollId}_0` }));
    await handleButtonInteraction(makeInteraction({ customId: `survey_vote_${poll.pollId}_1` }));
    const interaction = makeInteraction({ customId: `survey_vote_${poll.pollId}_0` });
    await handleButtonInteraction(interaction); // toggle option 0 back off

    const persisted = getPoll(GUILD_ID, poll.pollId);
    expect(persisted.options[0].votes).not.toContain('voter-1');
    expect(persisted.options[1].votes).toContain('voter-1'); // untouched
    expect(interaction.followUp.mock.calls[0][0].content).toContain('Removed');
  });

  test('different voters do not affect each other', async () => {
    const poll = createPoll(GUILD_ID, 'chan-1', 'msg-1', 'creator-1', 'Q?', ['A', 'B']);

    await handleButtonInteraction(makeInteraction({ customId: `survey_vote_${poll.pollId}_0`, userId: 'voter-1' }));
    await handleButtonInteraction(makeInteraction({ customId: `survey_vote_${poll.pollId}_1`, userId: 'voter-2' }));

    const persisted = getPoll(GUILD_ID, poll.pollId);
    expect(persisted.options[0].votes).toEqual(['voter-1']);
    expect(persisted.options[1].votes).toEqual(['voter-2']);
  });

  test('rejects a vote on a poll that no longer exists', async () => {
    const interaction = makeInteraction({ customId: 'survey_vote_deadbeefdeadbeef_0' });

    await handleButtonInteraction(interaction);

    expect(interaction.editReply).not.toHaveBeenCalled();
    expect(interaction.followUp).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('no longer exists') })
    );
  });

  test('rejects a vote on a closed poll', async () => {
    const poll = createPoll(GUILD_ID, 'chan-1', 'msg-1', 'creator-1', 'Q?', ['A', 'B']);
    const polls = JSON.parse(fs.readFileSync(POLL_FILE, 'utf8'));
    polls.find(p => p.pollId === poll.pollId).status = 'closed';
    fs.writeFileSync(POLL_FILE, JSON.stringify(polls), 'utf8');

    const interaction = makeInteraction({ customId: `survey_vote_${poll.pollId}_0` });
    await handleButtonInteraction(interaction);

    expect(interaction.editReply).not.toHaveBeenCalled();
    expect(interaction.followUp).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('no longer active') })
    );
  });
});

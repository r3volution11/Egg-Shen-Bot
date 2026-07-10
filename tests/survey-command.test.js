/**
 * Regression test for createPollEmbed() in survey.js.
 *
 * createPollEmbed() is synchronous but used to call the async loadGuildConfig()
 * without awaiting it, then read `.emojis` off the resulting (always-pending)
 * Promise. The result (`undefined`) was silently swallowed by `?? {}`, and the
 * `emojis` variable was never actually used for anything — option emoji comes
 * from VOTE_EMOJIS via pollManager.js, not guild config. Fixed by deleting the
 * dead code rather than awaiting it.
 *
 * Run with: npx jest tests/survey-command.test.js --verbose
 */

import { describe, test, expect } from '@jest/globals';
import { createPollEmbed } from '../src/commands/survey.js';
import { VOTE_EMOJIS } from '../src/utils/pollManager.js';

function makePoll({ status = 'active', options = ['Alpha', 'Beta'], votes = [] } = {}) {
  return {
    pollId: 'test-poll-1',
    guildId: 'guild-1',
    channelId: 'channel-1',
    creatorId: 'creator-1',
    question: 'Best option?',
    options: options.map((text, index) => ({
      id: index,
      text,
      emoji: VOTE_EMOJIS[index],
      votes: votes[index] || [],
    })),
    allowMultipleVotes: false,
    status,
    createdAt: new Date().toISOString(),
    closedAt: status === 'closed' ? new Date().toISOString() : null,
  };
}

describe('createPollEmbed', () => {
  test('builds synchronously without needing to await guild config', () => {
    const poll = makePoll();
    const embed = createPollEmbed(poll, false);
    expect(embed.data.title).toContain('Best option?');
  });

  test('renders each option using VOTE_EMOJIS, not guild-config emojis', () => {
    const poll = makePoll();
    const embed = createPollEmbed(poll, false);

    expect(embed.data.description).toContain(`${VOTE_EMOJIS[0]} Alpha`);
    expect(embed.data.description).toContain(`${VOTE_EMOJIS[1]} Beta`);
  });

  test('shows vote counts and percentages when showResults is true', () => {
    const poll = makePoll({ votes: [['user-1', 'user-2'], ['user-3']] });
    const embed = createPollEmbed(poll, true);

    expect(embed.data.description).toContain('2 votes');
    expect(embed.data.description).toContain('1 vote');
    expect(embed.data.footer.text).toContain('Total votes: 3');
  });

  test('adds a Closed field for closed polls', () => {
    const poll = makePoll({ status: 'closed' });
    const embed = createPollEmbed(poll, true);

    expect(embed.data.fields.some(f => f.name === 'Closed')).toBe(true);
  });
});

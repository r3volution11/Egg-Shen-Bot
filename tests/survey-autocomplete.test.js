/**
 * Tests for the poll_id autocomplete on /survey results, close, and delete.
 *
 * - results: any survey (active or closed) matching the typed text, since
 *   viewing results is unrestricted
 * - close/delete: only surveys the invoking user can actually manage
 *   (creator, admin, or mod via canManagePoll), so picking a suggestion
 *   never leads to a permission-denied error afterward
 *
 * Run with: npx jest tests/survey-autocomplete.test.js --verbose
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { autocomplete } from '../src/commands/survey.js';
import { createPoll, closePoll } from '../src/utils/pollManager.js';

const GUILD = 'survey-autocomplete-test-guild';
const POLL_FILE = path.join(process.cwd(), 'guild_polls', `${GUILD}.json`);

function cleanup() {
  if (fs.existsSync(POLL_FILE)) fs.unlinkSync(POLL_FILE);
}

beforeEach(cleanup);
afterEach(cleanup);

function makeInteraction({ subcommand, focused = '', memberId = 'user-1', isAdmin = false }) {
  return {
    guildId: GUILD,
    member: {
      id: memberId,
      permissions: { has: (perm) => isAdmin && (perm === 'Administrator' || perm === 'ManageGuild') },
    },
    options: {
      getSubcommand: () => subcommand,
      getFocused: () => focused,
    },
    respond: jest.fn(),
  };
}

describe('/survey autocomplete', () => {
  test('results: suggests both active and closed surveys', async () => {
    createPoll(GUILD, 'chan-1', 'msg-1', 'creator-1', 'Active one', ['A', 'B']);
    const closedPoll = createPoll(GUILD, 'chan-1', 'msg-2', 'creator-1', 'Closed one', ['A', 'B']);
    closePoll(GUILD, closedPoll.pollId, 'creator-1');

    const interaction = makeInteraction({ subcommand: 'results', memberId: 'someone-else' });
    await autocomplete(interaction);

    const names = interaction.respond.mock.calls[0][0].map(c => c.name);
    expect(names.some(n => n.includes('Active one'))).toBe(true);
    expect(names.some(n => n.includes('Closed one'))).toBe(true);
  });

  test('filters suggestions by the text typed so far (case-insensitive)', async () => {
    createPoll(GUILD, 'chan-1', 'msg-1', 'creator-1', 'Movie night pick', ['A', 'B']);
    createPoll(GUILD, 'chan-1', 'msg-2', 'creator-1', 'Best snack', ['A', 'B']);

    const interaction = makeInteraction({ subcommand: 'results', focused: 'MOVIE' });
    await autocomplete(interaction);

    const choices = interaction.respond.mock.calls[0][0];
    expect(choices).toHaveLength(1);
    expect(choices[0].name).toContain('Movie night pick');
  });

  test('close: only suggests surveys the user created', async () => {
    createPoll(GUILD, 'chan-1', 'msg-1', 'creator-1', 'Mine', ['A', 'B']);
    createPoll(GUILD, 'chan-1', 'msg-2', 'someone-else', 'Not mine', ['A', 'B']);

    const interaction = makeInteraction({ subcommand: 'close', memberId: 'creator-1' });
    await autocomplete(interaction);

    const choices = interaction.respond.mock.calls[0][0];
    expect(choices).toHaveLength(1);
    expect(choices[0].name).toContain('Mine');
  });

  test('close: an admin sees every active survey, not just their own', async () => {
    createPoll(GUILD, 'chan-1', 'msg-1', 'creator-1', 'Someone else survey', ['A', 'B']);

    const interaction = makeInteraction({ subcommand: 'close', memberId: 'admin-1', isAdmin: true });
    await autocomplete(interaction);

    const choices = interaction.respond.mock.calls[0][0];
    expect(choices).toHaveLength(1);
  });

  test('close: does not suggest closed surveys', async () => {
    const poll = createPoll(GUILD, 'chan-1', 'msg-1', 'creator-1', 'Already closed', ['A', 'B']);
    closePoll(GUILD, poll.pollId, 'creator-1');

    const interaction = makeInteraction({ subcommand: 'close', memberId: 'creator-1' });
    await autocomplete(interaction);

    expect(interaction.respond).toHaveBeenCalledWith([]);
  });

  test('delete: same permission filtering as close', async () => {
    createPoll(GUILD, 'chan-1', 'msg-1', 'creator-1', 'Mine', ['A', 'B']);
    createPoll(GUILD, 'chan-1', 'msg-2', 'someone-else', 'Not mine', ['A', 'B']);

    const interaction = makeInteraction({ subcommand: 'delete', memberId: 'creator-1' });
    await autocomplete(interaction);

    const choices = interaction.respond.mock.calls[0][0];
    expect(choices).toHaveLength(1);
    expect(choices[0].name).toContain('Mine');
  });

  test('the suggested value is the pollId, not the question text', async () => {
    const poll = createPoll(GUILD, 'chan-1', 'msg-1', 'creator-1', 'Pick me', ['A', 'B']);

    const interaction = makeInteraction({ subcommand: 'results', memberId: 'creator-1' });
    await autocomplete(interaction);

    const choices = interaction.respond.mock.calls[0][0];
    expect(choices[0].value).toBe(poll.pollId);
  });

  test('caps suggestions at 25 (Discord autocomplete limit)', async () => {
    for (let i = 0; i < 30; i++) {
      createPoll(GUILD, 'chan-1', `msg-${i}`, 'creator-1', `Survey ${i}`, ['A', 'B']);
    }

    const interaction = makeInteraction({ subcommand: 'results', memberId: 'creator-1' });
    await autocomplete(interaction);

    expect(interaction.respond.mock.calls[0][0].length).toBeLessThanOrEqual(25);
  });

  test('returns an empty list (not throw) when there are no surveys at all', async () => {
    const interaction = makeInteraction({ subcommand: 'results' });
    await expect(autocomplete(interaction)).resolves.not.toThrow();
    expect(interaction.respond).toHaveBeenCalledWith([]);
  });
});

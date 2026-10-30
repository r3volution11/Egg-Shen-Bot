/**
 * Survey tie-breaks: a tie for first starts a runoff between the tied
 * options; a runoff that ties again is settled at random.
 *
 * Driven through the real closePollAndAnnounce (what /survey close and the
 * auto-close timer both call), and the runoff is voted on by clicking the
 * button the runoff card itself carries, through the real button handler.
 *
 * Run with: npm test -- tests/survey-tie-break.test.js
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { handleButtonInteraction } from '../src/handlers/buttonHandler.js';
import {
  createPoll, getPoll, castSingleVote, toggleVote, closePollAndAnnounce, RUNOFF_DEFAULT_MINUTES,
} from '../src/utils/pollManager.js';

const GUILD = 'survey-tie-break-guild';
const POLL_FILE = path.join(process.env.GUILD_POLLS_DIR || path.join(process.cwd(), 'guild_polls'), `${GUILD}.json`);

function cleanup() {
  if (fs.existsSync(POLL_FILE)) fs.unlinkSync(POLL_FILE);
}

beforeEach(cleanup);
afterEach(cleanup);

/** A channel holding a survey's card, and a client that can reach it. */
function makeWorld() {
  const messages = new Map();
  const posts = [];
  let n = 0;
  const channel = {
    id: 'chan-1',
    messages: { fetch: async (id) => messages.get(id) },
    send: jest.fn(async (payload) => {
      const msg = { id: `posted-${++n}`, payload, edit: jest.fn(async () => {}) };
      messages.set(msg.id, msg);
      posts.push(msg);
      return msg;
    }),
  };
  const card = { id: 'card-1', edit: jest.fn(async () => {}) };
  messages.set('card-1', card);
  const client = { channels: { fetch: async () => channel } };
  return { client, channel, card, posts };
}

/** Votes as {voter: optionIndex}. */
function vote(poll, votes) {
  for (const [voter, option] of Object.entries(votes)) castSingleVote(GUILD, poll.pollId, option, voter);
}

const embedOf = (payload) => (payload.embeds[0].toJSON ? payload.embeds[0].toJSON() : payload.embeds[0].data);

describe('a tie for first', () => {
  test('starts a runoff between only the tied options, posted last so people see it', async () => {
    const world = makeWorld();
    const poll = createPoll(GUILD, 'chan-1', 'card-1', 'creator', 'Movie night?', ['Alien', 'Jaws', 'Scream'], false, 120);
    vote(poll, { a: 0, b: 0, c: 1, d: 1, e: 2 });

    const result = await closePollAndAnnounce(world.client, GUILD, poll.pollId, 'mod');

    expect(result.success).toBe(true);
    const runoff = getPoll(GUILD, result.runoff.pollId);
    expect(runoff.options.map(o => o.text)).toEqual(['Alien', 'Jaws']);
    expect(runoff.allowMultipleVotes).toBe(false);
    expect(runoff).toMatchObject({ round: 2, runoffOf: poll.pollId, status: 'active' });
    // As long as the original ran
    expect(new Date(runoff.expiresAt) - new Date(runoff.createdAt)).toBe(120 * 60_000);

    // Results first, then the runoff as a new (notifying) message
    expect(world.posts).toHaveLength(2);
    const [results, runoffPost] = world.posts;
    expect(embedOf(results.payload).description).toContain('🤝 Tied: **Alien** and **Jaws** (2 votes each). Runoff below!');
    expect(runoffPost.payload.content).toContain("It's a tie between **Alien** and **Jaws**");
    expect(embedOf(runoffPost.payload).title).toBe('🔁 Runoff: Movie night?');
    // The runoff's card is the posted message
    expect(runoff.messageId).toBe(runoffPost.id);
    expect(getPoll(GUILD, poll.pollId)).toMatchObject({ runoffPollId: runoff.pollId, tiedOptionIds: [0, 1] });
  });

  test('the runoff card\'s own buttons take votes', async () => {
    const world = makeWorld();
    const poll = createPoll(GUILD, 'chan-1', 'card-1', 'creator', 'Snack?', ['Popcorn', 'Nachos'], false, 30);
    vote(poll, { a: 0, b: 1 });
    const { runoff } = await closePollAndAnnounce(world.client, GUILD, poll.pollId, 'mod');

    const runoffPost = world.posts[1];
    const button = runoffPost.payload.components[0].toJSON().components[1];
    expect(button.label).toBe('Nachos');
    await handleButtonInteraction({
      customId: button.custom_id,
      user: { id: 'voter-9', tag: 'voter-9#0000' },
      guild: { id: GUILD },
      member: { permissions: { has: () => false } },
      deferUpdate: jest.fn().mockResolvedValue(undefined),
      editReply: jest.fn().mockResolvedValue(undefined),
      followUp: jest.fn().mockResolvedValue(undefined),
    });
    expect(getPoll(GUILD, runoff.pollId).options[1].votes).toEqual(['voter-9']);
  });

  test('a survey with no timer gets a day-long runoff', async () => {
    const world = makeWorld();
    const poll = createPoll(GUILD, 'chan-1', 'card-1', 'creator', 'Q?', ['A', 'B']);
    vote(poll, { a: 0, b: 1 });
    const { runoff } = await closePollAndAnnounce(world.client, GUILD, poll.pollId, 'mod');
    expect(new Date(runoff.expiresAt) - new Date(runoff.createdAt)).toBe(RUNOFF_DEFAULT_MINUTES * 60_000);
  });

  test('a multiple-choice survey\'s runoff is single choice', async () => {
    const world = makeWorld();
    const poll = createPoll(GUILD, 'chan-1', 'card-1', 'creator', 'Q?', ['A', 'B', 'C'], true, 60);
    toggleVote(GUILD, poll.pollId, 0, 'x');
    toggleVote(GUILD, poll.pollId, 1, 'x');
    const { runoff } = await closePollAndAnnounce(world.client, GUILD, poll.pollId, 'mod');
    expect(runoff.allowMultipleVotes).toBe(false);
  });
});

describe('a runoff that ties again', () => {
  test('is settled at random, and says so', async () => {
    const world = makeWorld();
    const poll = createPoll(GUILD, 'chan-1', 'card-1', 'creator', 'Q?', ['A', 'B'], false, 60);
    vote(poll, { a: 0, b: 1 });
    const { runoff } = await closePollAndAnnounce(world.client, GUILD, poll.pollId, 'mod');
    vote(runoff, { c: 0, d: 1 });

    const second = await closePollAndAnnounce(world.client, GUILD, runoff.pollId, 'mod', { random: () => 1 });

    expect(second.runoff).toBeNull(); // no third round
    expect(getPoll(GUILD, runoff.pollId).randomWinnerId).toBe(1);
    const results = world.posts.at(-1);
    const embed = embedOf(results.payload);
    expect(embed.title).toBe('🏁 Runoff closed: Q?');
    expect(embed.description).toContain('🎲 Tied again, so the bot picked **B** at random.');
    expect(embed.description).toContain('🎲 2️⃣ **B**');
  });
});

describe('no runoff', () => {
  test('when the creator chose "None"', async () => {
    const world = makeWorld();
    const poll = createPoll(GUILD, 'chan-1', 'card-1', 'creator', 'Q?', ['A', 'B'], false, 60, { tieBreak: 'none' });
    vote(poll, { a: 0, b: 1 });
    const result = await closePollAndAnnounce(world.client, GUILD, poll.pollId, 'mod');
    expect(result.runoff).toBeNull();
    expect(world.posts).toHaveLength(1);
    expect(embedOf(world.posts[0].payload).description).not.toContain('Runoff');
  });

  test('when nobody voted', async () => {
    const world = makeWorld();
    const poll = createPoll(GUILD, 'chan-1', 'card-1', 'creator', 'Q?', ['A', 'B'], false, 60);
    const result = await closePollAndAnnounce(world.client, GUILD, poll.pollId, 'mod');
    expect(result.runoff).toBeNull();
    expect(world.posts).toHaveLength(1);
  });

  test('when only second place ties', async () => {
    const world = makeWorld();
    const poll = createPoll(GUILD, 'chan-1', 'card-1', 'creator', 'Q?', ['A', 'B', 'C'], false, 60);
    vote(poll, { a: 0, b: 0, c: 1, d: 2 });
    const result = await closePollAndAnnounce(world.client, GUILD, poll.pollId, 'mod');
    expect(result.runoff).toBeNull();
  });
});

test('/survey close and the timer closing together post one result and one runoff', async () => {
  const world = makeWorld();
  const poll = createPoll(GUILD, 'chan-1', 'card-1', 'creator', 'Q?', ['A', 'B'], false, 60);
  vote(poll, { a: 0, b: 1 });

  const both = await Promise.all([
    closePollAndAnnounce(world.client, GUILD, poll.pollId, 'mod'),
    closePollAndAnnounce(world.client, GUILD, poll.pollId, 'bot'),
  ]);

  expect(both.filter(r => r.success)).toHaveLength(1);
  expect(world.posts).toHaveLength(2); // results + runoff, once
  const surveys = JSON.parse(fs.readFileSync(POLL_FILE, 'utf8'));
  expect(surveys.filter(p => p.runoffOf === poll.pollId)).toHaveLength(1);
});

test('a survey from before tie-breaks existed gets a runoff', async () => {
  const world = makeWorld();
  const poll = createPoll(GUILD, 'chan-1', 'card-1', 'creator', 'Q?', ['A', 'B'], false, 60);
  // Stored before the fields existed
  const surveys = JSON.parse(fs.readFileSync(POLL_FILE, 'utf8'));
  for (const p of surveys) { delete p.tieBreak; delete p.round; delete p.runoffOf; delete p.durationMinutes; }
  fs.writeFileSync(POLL_FILE, JSON.stringify(surveys));
  vote(poll, { a: 0, b: 1 });

  const result = await closePollAndAnnounce(world.client, GUILD, poll.pollId, 'mod');
  expect(result.runoff).not.toBeNull();
  // Its length comes from its own start and end
  expect(new Date(result.runoff.expiresAt) - new Date(result.runoff.createdAt)).toBe(60 * 60_000);
});

describe('/survey create\'s tie-break option', () => {
  async function create(tieBreak) {
    const { execute } = await import('../src/commands/survey.js');
    const values = { question: 'Pick?', option1: 'A', option2: 'B', 'tie-break': tieBreak };
    const interaction = {
      guildId: GUILD,
      channelId: 'chan-1',
      user: { id: 'creator' },
      member: { permissions: { has: () => true } },
      options: {
        getSubcommand: () => 'create',
        getString: (n) => values[n] ?? null,
        getBoolean: () => null,
        getInteger: () => null,
      },
      deferReply: jest.fn(async () => {}),
      editReply: jest.fn(async () => ({ id: `msg-${tieBreak}` })),
      followUp: jest.fn(async () => {}),
      reply: jest.fn(async () => {}),
    };
    await execute(interaction);
    const stored = JSON.parse(fs.readFileSync(POLL_FILE, 'utf8')).find(p => p.messageId === `msg-${tieBreak}`);
    return { stored, note: interaction.followUp.mock.calls[0]?.[0]?.content || '' };
  }

  test('defaults to a runoff, and says so', async () => {
    const { stored, note } = await create(undefined);
    expect(stored.tieBreak).toBe('runoff');
    expect(note).toContain('a runoff vote between the tied options');
  });

  test('"None" is stored, and the creator is told the tie stands', async () => {
    const { stored, note } = await create('none');
    expect(stored.tieBreak).toBe('none');
    expect(note).toContain('the tie stands');
  });
});

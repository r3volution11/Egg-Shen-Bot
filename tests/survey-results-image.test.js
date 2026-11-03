/**
 * The "🏁 Survey Closed" message carries the drawn results chart
 * (cardImages.generateSurveyResultsImage) as survey-results.png, and posts
 * exactly as before, text only, when the chart can't be drawn or can't be
 * attached. The edited survey card keeps its text bars and gets no image.
 *
 * The chart itself is mocked here (its drawing is tests/card-images.test.js);
 * what's tested is the real closePollAndAnnounce around it.
 *
 * Run with: npm test -- tests/survey-results-image.test.js
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const generateSurveyResultsImage = jest.fn();
jest.unstable_mockModule('../src/utils/cardImages.js', () => ({
  generateSurveyResultsImage,
  generateMatchupResultImage: jest.fn(),
}));

const { createPoll, castSingleVote, closePollAndAnnounce, getPoll } = await import('../src/utils/pollManager.js');

const GUILD = 'survey-results-image-guild';
const POLL_FILE = path.join(process.env.GUILD_POLLS_DIR || path.join(process.cwd(), 'guild_polls'), `${GUILD}.json`);

function cleanup() {
  if (fs.existsSync(POLL_FILE)) fs.unlinkSync(POLL_FILE);
}

/** A channel with the survey's card in it; `sendFails(payload)` decides whether a send throws */
function world({ sendFails = () => false } = {}) {
  const posts = [];
  const card = { id: 'card-1', edit: jest.fn(async () => {}) };
  const channel = {
    id: 'chan-1',
    messages: { fetch: async (id) => (id === 'card-1' ? card : null) },
    send: jest.fn(async (payload) => {
      if (sendFails(payload)) throw Object.assign(new Error('Missing Permissions'), { code: 50013 });
      posts.push(payload);
      return { id: `posted-${posts.length}` };
    }),
  };
  return { client: { channels: { fetch: async () => channel } }, channel, card, posts };
}

function survey() {
  const poll = createPoll(GUILD, 'chan-1', 'card-1', 'creator', 'Friday double feature?', ['Alien', 'Jaws', 'Scream']);
  for (const [voter, option] of Object.entries({ a: 0, b: 0, c: 0, d: 1, e: 2 })) castSingleVote(GUILD, poll.pollId, option, voter);
  return poll;
}

const json = (embed) => (embed.toJSON ? embed.toJSON() : embed.data);
let warn;

beforeEach(() => {
  cleanup();
  generateSurveyResultsImage.mockReset();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  warn.mockRestore();
});

describe('the Survey Closed message', () => {
  test('carries the chart, drawn from the closed survey and its results', async () => {
    generateSurveyResultsImage.mockResolvedValue(Buffer.from('chart'));
    const { client, card, posts } = world();
    const poll = survey();

    expect((await closePollAndAnnounce(client, GUILD, poll.pollId, 'creator')).success).toBe(true);

    expect(posts).toHaveLength(1);
    const [results] = posts;
    const embed = json(results.embeds[0]);
    expect(embed.title).toBe('🏁 Survey Closed: Friday double feature?');
    expect(embed.image.url).toBe('attachment://survey-results.png');
    expect(results.files.map(f => f.name)).toEqual(['survey-results.png']);
    // Still the text card underneath, for anyone the image doesn't reach
    // With the chart, the text is just the winner: the bars would show twice
    expect(embed.description).toBe('🏆 1️⃣ **Alien** · `60%` · 3 votes');
    expect(embed.description).not.toMatch(/[🟨🟦⬜]/u);

    // Drawn from the survey as closed, with its results
    expect(generateSurveyResultsImage).toHaveBeenCalledTimes(1);
    const [drawnPoll, drawnResults] = generateSurveyResultsImage.mock.calls[0];
    expect(drawnPoll).toMatchObject({ pollId: poll.pollId, status: 'closed' });
    expect(drawnResults.totalVotes).toBe(5);
    expect(drawnResults.results.map(o => [o.text, o.voteCount])).toEqual([['Alien', 3], ['Jaws', 1], ['Scream', 1]]);

    // The edited card keeps its text bars, no image
    const edited = card.edit.mock.calls[0][0];
    expect(json(edited.embeds[0]).image).toBeUndefined();
    expect(edited.files).toBeUndefined();
  });

  test('a chart that fails or times out: the text-only message, as before', async () => {
    generateSurveyResultsImage.mockRejectedValue(new Error('Survey image took longer than 5000 ms'));
    const { client, posts } = world();
    const poll = survey();

    expect((await closePollAndAnnounce(client, GUILD, poll.pollId, 'creator')).success).toBe(true);

    expect(posts).toHaveLength(1);
    const embed = json(posts[0].embeds[0]);
    expect(embed.title).toBe('🏁 Survey Closed: Friday double feature?');
    expect(embed.image).toBeUndefined();
    expect(posts[0].files).toBeUndefined();
    expect(embed.description).toContain('`60%` · 3 votes');
    // Without it, the full text bars are back
    expect(embed.description).toMatch(/🟨/u);
    expect(embed.description).toContain('Jaws');
    expect(getPoll(GUILD, poll.pollId).status).toBe('closed');
  });

  test("a channel that won't take the attachment still gets the results, without it", async () => {
    generateSurveyResultsImage.mockResolvedValue(Buffer.from('chart'));
    const { client, channel, posts } = world({ sendFails: (payload) => Boolean(payload.files) });
    const poll = survey();

    expect((await closePollAndAnnounce(client, GUILD, poll.pollId, 'creator')).success).toBe(true);

    expect(channel.send).toHaveBeenCalledTimes(2);
    expect(posts).toHaveLength(1);
    const embed = json(posts[0].embeds[0]);
    expect(embed.title).toBe('🏁 Survey Closed: Friday double feature?');
    expect(embed.image).toBeUndefined();
    expect(posts[0].files).toBeUndefined();
  });
});

/**
 * /survey voting-post — the survey card again, as a new message, with its
 * buttons and the votes so far.
 *
 * Driven end to end through the fake Discord: the real /survey create posts
 * the card, real button clicks (the card's own customIds) vote through the
 * real handler, then voting-post, then close. What's checked is the counts
 * on the cards, which message each later edit lands on, and what's stored.
 *
 * The case that matters most: closing edits only the poll's stored message.
 * Without moving the poll to the new card, the repost kept live buttons
 * after the survey closed and never showed the final result.
 *
 * Run with: npm test -- tests/survey-voting-post.test.js
 */

import { describe, test, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { FakeDiscord } from './harness/fakeDiscord.js';
import { handleButtonInteraction } from '../src/handlers/buttonHandler.js';
import { getPoll, closePollAndAnnounce, createPoll } from '../src/utils/pollManager.js';

const GUILD = 'survey-voting-post-guild';
const POLL_FILE = path.join(process.env.GUILD_POLLS_DIR, `${GUILD}.json`);

let survey;
let discord;

beforeAll(async () => {
  survey = await import('../src/commands/survey.js');
});

beforeEach(() => {
  if (fs.existsSync(POLL_FILE)) fs.unlinkSync(POLL_FILE);
  survey.resetVotingPostCooldowns();
  discord = new FakeDiscord({ guildId: GUILD, channelId: 'general' });
  discord.addUser('creator');
  discord.addUser('sam');
  discord.addUser('alex');
  discord.addUser('kim');
  discord.addUser('admin', { admin: true });
});

async function run(userId, subcommand, options = {}) {
  const i = discord.command(userId, 'survey', { subcommand, options });
  await survey.execute(i);
  return i;
}

/** /survey create → the public card and its poll */
async function createSurvey(options = {}) {
  await run('creator', 'create', { question: 'Friday double feature?', option1: 'Slashers', option2: 'Creature features', option3: 'Giallo', ...options });
  const card = discord.channel.posted.at(-1);
  const pollId = card.embeds[0].footer.text.match(/Survey ID: (\w+)/)[1];
  return { card, pollId };
}

/** A real click on a button that is really on `message` */
async function vote(userId, message, optionIndex) {
  const customId = message.allComponents[optionIndex].customId;
  await handleButtonInteraction(discord.button(userId, message, customId));
}

describe('posting the card again', () => {
  test('a new message with the buttons and the votes so far; the old card greys out and points down', async () => {
    const { card, pollId } = await createSurvey();
    await vote('sam', card, 0);
    await vote('alex', card, 0);
    await vote('kim', card, 2);

    const i = await run('sam', 'voting-post');
    const repost = i.replyMessage;

    expect(repost).not.toBe(card);
    expect(repost.ephemeralFor).toBeNull();
    expect(discord.channel.posted.at(-1)).toBe(repost); // at the bottom of the channel
    expect(repost.text).toMatch(/🏆 1️⃣ \*\*Slashers\*\*\n.*66\.7% \(2 votes\)/); // the leader, crowned
    expect(repost.text).toMatch(/Giallo\n.*33\.3% \(1 vote\)/);
    expect(repost.text).toContain('Total votes: 3');
    expect(repost.allComponents.map(b => b.label)).toEqual(['Slashers', 'Creature features', 'Giallo']);
    expect(repost.allComponents.every(b => !b.disabled)).toBe(true);

    // The poll now lives on the new card
    expect(getPoll(GUILD, pollId).messageId).toBe(repost.id);

    // The old one: same counts, buttons off, a link to the new one
    expect(card.allComponents.every(b => b.disabled)).toBe(true);
    expect(card.text).toContain('Voting continues on the [newer post]');
    expect(card.text).toContain(`/${GUILD}/general/${repost.id}`);
    expect(card.text).toContain('Total votes: 3');
  });

  test('votes on the new card count and update that card', async () => {
    const { card } = await createSurvey();
    await vote('sam', card, 0);
    const repost = (await run('alex', 'voting-post')).replyMessage;

    await vote('alex', repost, 1);

    expect(repost.text).toMatch(/Creature features\n.*50% \(1 vote\)/);
    expect(repost.text).toContain('Total votes: 2');
  });

  test('closing edits the new card, not the old one', async () => {
    const { card, pollId } = await createSurvey();
    await vote('sam', card, 0);
    const repost = (await run('sam', 'voting-post')).replyMessage;
    const oldEdits = card.history.length;

    const result = await closePollAndAnnounce(discord.client, GUILD, pollId, 'creator');

    expect(result.success).toBe(true);
    expect(repost.allComponents.every(b => b.disabled)).toBe(true);
    expect(repost.text).toContain('Survey closed');
    expect(card.history.length).toBe(oldEdits); // left alone
    expect(discord.channel.posted.at(-1).embeds[0].title).toBe('🏁 Survey Closed: Friday double feature?');
  });

  test('a second repost moves it again, and the first repost is retired too', async () => {
    const { card } = await createSurvey();
    const first = (await run('creator', 'voting-post')).replyMessage;
    const second = (await run('creator', 'voting-post')).replyMessage; // the creator skips the cooldown

    expect(card.allComponents.every(b => b.disabled)).toBe(true);
    expect(first.allComponents.every(b => b.disabled)).toBe(true);
    expect(second.allComponents.every(b => !b.disabled)).toBe(true);
  });

  test('an old card deleted by hand doesn\'t stop the repost', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { card, pollId } = await createSurvey();
    await card.delete();

    const repost = (await run('sam', 'voting-post')).replyMessage;

    expect(repost.allComponents).toHaveLength(3);
    expect(getPoll(GUILD, pollId).messageId).toBe(repost.id);
    expect(discord.violations).toEqual([]);
    errorSpy.mockRestore();
  });
});

describe('which survey', () => {
  test('with one open, poll_id can be left out; with two, it asks', async () => {
    await createSurvey();
    expect((await run('sam', 'voting-post')).replyMessage.ephemeralFor).toBeNull();

    await createSurvey({ question: 'Snacks?' });
    const i = await run('sam', 'voting-post');
    expect(i.replyMessage.ephemeralFor).toBe('sam');
    expect(i.replyMessage.content).toBe('📊 2 surveys are open — pick one with the `poll_id` option.');
  });

  test('poll_id picks the one asked for', async () => {
    await createSurvey();
    const { pollId } = await createSurvey({ question: 'Snacks?', option1: 'Popcorn', option2: 'Nachos', option3: null });
    const repost = (await run('sam', 'voting-post', { poll_id: pollId })).replyMessage;
    expect(repost.embeds[0].title).toBe('📊 Snacks?');
  });

  test('closed, reaction-voted, unknown and none: a private note, nothing posted', async () => {
    const before = () => discord.channel.posted.length;

    let i = await run('sam', 'voting-post');
    expect(i.replyMessage.content).toContain('No survey is open');

    const { pollId } = await createSurvey();
    await closePollAndAnnounce(discord.client, GUILD, pollId, 'creator');
    let n = before();
    i = await run('sam', 'voting-post', { poll_id: pollId });
    expect(i.replyMessage.content).toContain('has closed');
    expect(before()).toBe(n);

    const legacy = createPoll(GUILD, 'general', 'old-msg', 'creator', 'Old one?', ['A', 'B']);
    const polls = JSON.parse(fs.readFileSync(POLL_FILE, 'utf8'));
    polls.find(p => p.pollId === legacy.pollId).votingMethod = 'reactions';
    fs.writeFileSync(POLL_FILE, JSON.stringify(polls));
    i = await run('sam', 'voting-post', { poll_id: legacy.pollId });
    expect(i.replyMessage.content).toContain('voted on with reactions');
    expect(getPoll(GUILD, legacy.pollId).messageId).toBe('old-msg');

    i = await run('sam', 'voting-post', { poll_id: 'nope' });
    expect(i.replyMessage.content).toContain('Survey not found');
    for (const r of [i]) expect(r.replyMessage.ephemeralFor).toBe('sam');
  });
});

describe('cooldown', () => {
  test('a member can repost once per 10 minutes; the creator and admins any time', async () => {
    await createSurvey();
    await run('sam', 'voting-post');

    const again = await run('alex', 'voting-post');
    expect(again.replyMessage.ephemeralFor).toBe('alex');
    expect(again.replyMessage.content).toMatch(/^⏳ This survey was posted here <t:\d+:R>/);

    expect((await run('admin', 'voting-post')).replyMessage.ephemeralFor).toBeNull();
    expect((await run('creator', 'voting-post')).replyMessage.ephemeralFor).toBeNull();

    const later = Date.now() + survey.VOTING_POST_COOLDOWN_MS + 1000;
    jest.spyOn(Date, 'now').mockReturnValue(later);
    expect((await run('alex', 'voting-post')).replyMessage.ephemeralFor).toBeNull();
    jest.restoreAllMocks();
  });
});

test('autocomplete offers only open surveys', async () => {
  const { pollId: open } = await createSurvey();
  const { pollId: closed } = await createSurvey({ question: 'Snacks?' });
  await closePollAndAnnounce(discord.client, GUILD, closed, 'creator');

  const ac = discord.autocomplete('sam', 'survey', { subcommand: 'voting-post', focused: { name: 'poll_id', value: '' } });
  await survey.autocomplete(ac);
  expect(ac.choices.map(c => c.value)).toEqual([open]);
});

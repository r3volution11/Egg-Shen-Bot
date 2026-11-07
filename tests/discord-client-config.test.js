/**
 * The bot's Discord client, read from the real src/index.js
 * (tests/harness/botEntry.js loads it without connecting): which gateway
 * events it asks for, and what happens when someone reacts to a survey.
 *
 * Surveys were once voted on with 1️⃣–🔟 reactions. Buttons replaced that,
 * but index.js kept its reaction handlers, and they never checked how a
 * survey was voted on: a number reaction on ANY survey, button ones
 * included, was counted as a vote (and in a single-choice survey removed
 * the member's other number reactions), the bot deleted every other
 * reaction on an open survey, and every reaction on a closed one. The
 * handlers are gone, and with them the reactions intent and the
 * Message/Reaction partials, which nothing else used.
 *
 * This file used to build its own Client with a copy of index.js's options,
 * so it could only ever check the copy. It now reads the client index.js
 * really created.
 *
 * Run with: npm test -- tests/discord-client-config.test.js
 */

import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { GatewayIntentBits } from 'discord.js';
import { loadBotEntry } from './harness/botEntry.js';
import { FakeDiscord } from './harness/fakeDiscord.js';

const GUILD = 'client-config-survey-guild';

let client;
let survey;
let pollManager;

beforeAll(async () => {
  client = await loadBotEntry();
  survey = await import('../src/commands/survey.js');
  pollManager = await import('../src/utils/pollManager.js');
});

afterAll(async () => {
  await client?.destroy();
});

describe('the client src/index.js creates', () => {
  test('asks for guilds and guild messages, and not for reactions', () => {
    const { intents } = client.options;
    expect(intents.has(GatewayIntentBits.Guilds)).toBe(true);
    // Kept so cached copies of the bot's own messages see updates and deletes
    expect(intents.has(GatewayIntentBits.GuildMessages)).toBe(true);
    expect(intents.has(GatewayIntentBits.GuildMessageReactions)).toBe(false);
  });

  test('registers no partials: they were only for reactions on uncached messages', () => {
    expect(client.options.partials).toEqual([]);
  });

  test('does NOT request privileged intents this bot has no use for (MessageContent, GuildMembers, GuildPresences)', () => {
    const { intents } = client.options;
    expect(intents.has(GatewayIntentBits.MessageContent)).toBe(false);
    expect(intents.has(GatewayIntentBits.GuildMembers)).toBe(false);
    expect(intents.has(GatewayIntentBits.GuildPresences)).toBe(false);
  });

  test('caps the message cache instead of accepting the unbounded default, since message content is never read', () => {
    // makeCache is a factory function; the real assertion is behavioral —
    // confirm it actually returns a size-limited collection for messages.
    const fakeManager = { name: 'MessageManager' };
    const cache = client.options.makeCache(class MessageManager {}, null, fakeManager);
    expect(cache.maxSize).toBe(50);
  });

  test('listens for interactions, and for no reaction events', () => {
    expect(client.listenerCount('interactionCreate')).toBe(1);
    expect(client.listenerCount('messageReactionAdd')).toBe(0);
    expect(client.listenerCount('messageReactionRemove')).toBe(0);
  });
});

describe('reacting to a survey message', () => {
  // A survey made with the real /survey create, then reactions on its
  // message delivered to the real client the way discord.js would
  async function createSurvey({ multiple = false } = {}) {
    const discord = new FakeDiscord({ guildId: GUILD });
    discord.addUser('host');
    const i = discord.command('host', 'survey', {
      subcommand: 'create',
      options: { question: 'Friday double feature?', option1: 'Alien', option2: 'Aliens', option3: 'Both', multiple },
    });
    await survey.execute(i);
    const message = i.replyMessage;
    const poll = pollManager.getPollByMessageId(GUILD, message.id);
    expect(poll).toBeTruthy(); // the survey exists, and is on this message
    return { message, poll };
  }

  function reactionOn(message, emoji) {
    const otherNumber = { emoji: { name: '2️⃣' }, users: { remove: jest.fn() } };
    return {
      partial: false,
      emoji: { name: emoji },
      users: { remove: jest.fn().mockResolvedValue(undefined) },
      message: {
        id: message.id,
        guildId: GUILD,
        partial: false,
        edit: jest.fn().mockResolvedValue(undefined),
        reactions: { cache: [otherNumber] },
      },
      otherNumber,
    };
  }

  const member = { id: 'reactor', bot: false };
  const votesOf = (pollId) => pollManager.getPoll(GUILD, pollId).options.map(o => o.votes.length);

  // The handlers were async; give one every chance to finish before checking
  const settle = () => new Promise(resolve => setTimeout(resolve, 100));

  beforeAll(() => {
    const dir = process.env.GUILD_POLLS_DIR;
    if (dir && fs.existsSync(dir)) {
      for (const name of fs.readdirSync(dir)) if (name.startsWith(GUILD)) fs.unlinkSync(path.join(dir, name));
    }
  });

  test('a number reaction on an open survey is not a vote, and nothing is edited or removed', async () => {
    const { message, poll } = await createSurvey();
    const r = reactionOn(message, '1️⃣');

    client.emit('messageReactionAdd', r, member);
    await settle();

    expect(votesOf(poll.pollId)).toEqual([0, 0, 0]);
    expect(r.users.remove).not.toHaveBeenCalled();
    expect(r.otherNumber.users.remove).not.toHaveBeenCalled();
    expect(r.message.edit).not.toHaveBeenCalled();
  });

  test('any other reaction on an open survey stays where it is', async () => {
    const { message, poll } = await createSurvey({ multiple: true });
    const r = reactionOn(message, '🍿');

    client.emit('messageReactionAdd', r, member);
    await settle();

    expect(r.users.remove).not.toHaveBeenCalled();
    expect(votesOf(poll.pollId)).toEqual([0, 0, 0]);
  });

  test('a reaction on a closed survey stays, and taking one off changes no votes', async () => {
    const { message, poll } = await createSurvey();
    // A button vote, the real way to vote, so there is something to lose
    pollManager.castSingleVote(GUILD, poll.pollId, 0, member.id);
    expect(votesOf(poll.pollId)).toEqual([1, 0, 0]);

    const off = reactionOn(message, '1️⃣');
    client.emit('messageReactionRemove', off, member);
    await settle();
    expect(votesOf(poll.pollId)).toEqual([1, 0, 0]);
    expect(off.message.edit).not.toHaveBeenCalled();

    pollManager.closePoll(GUILD, poll.pollId, 'host');
    const r = reactionOn(message, '🎃');
    client.emit('messageReactionAdd', r, member);
    await settle();
    expect(r.users.remove).not.toHaveBeenCalled();
  });
});

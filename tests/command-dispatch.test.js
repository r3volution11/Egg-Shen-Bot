/**
 * The path every command interaction takes in production
 * (src/handlers/commandDispatch.js): lookup, rate limit, command echo,
 * execute, error reply — for slash commands AND the right-click "Game card".
 *
 * That block used to sit inline in the interactionCreate handler in
 * src/index.js, which can't be loaded without logging a bot in, so none of it
 * had a test. Right-click commands share the path but differ in two ways that
 * are easy to get wrong: they have no subcommand, and they must not be
 * remembered for the "used </command:id>" echo (a context-menu command can't
 * be mentioned).
 *
 * Run with: npm test -- tests/command-dispatch.test.js
 */

import { describe, test, expect, jest, beforeAll, beforeEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { FakeDiscord } from './harness/fakeDiscord.js';
import { dispatchCommand, isCommandInteraction } from '../src/handlers/commandDispatch.js';
import { echoFor } from '../src/utils/commandEcho.js';
import { saveGuildConfig, loadGuildConfig } from '../src/utils/guildConfig.js';
import { recordPlay, deleteScores, resetPlayLimits, POINTS } from '../src/utils/gameScores.js';

const GUILD = 'dispatch-guild';
let discord;

async function freshGuild({ rateLimited = false } = {}) {
  const file = path.join(process.env.GUILD_CONFIGS_DIR, `${GUILD}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  const config = await loadGuildConfig(GUILD);
  // Off unless a test is about the limiter: one member right-clicking twice
  // inside the default 20s window would otherwise be refused
  config.rateLimits.enabled = rateLimited;
  await saveGuildConfig(GUILD, config);
  discord = new FakeDiscord({ guildId: GUILD });
  discord.addUser('sam', { nickname: 'Sam' });
  discord.addUser('kim', { nickname: 'Kim' });
}

beforeEach(async () => {
  jest.restoreAllMocks();
  // The logger prints every command it records
  jest.spyOn(console, 'log').mockImplementation(() => {});
  await freshGuild();
});

/** What the echo header would be for a later click on a message this interaction posted */
const echoAfter = (interaction) =>
  echoFor({
    isChatInputCommand: () => false,
    message: { interactionMetadata: { id: interaction.id } },
    user: interaction.user,
  });

describe('dispatchCommand with stub commands', () => {
  test('a right-click command reaches its execute, with the clicked member', async () => {
    const execute = jest.fn(async (i) => { await i.reply({ content: 'ok', ephemeral: true }); });
    const i = discord.userMenu('sam', 'Game card', 'kim');

    await dispatchCommand(i, new Map([['Game card', { execute }]]));

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][0]).toBe(i);
    expect(i.options.get('user').user.id).toBe('kim');
    expect(i.replyMessage.content).toBe('ok');
    expect(discord.violations).toEqual([]);
  });

  test('a right-click command is not remembered for the echo; a slash command is', async () => {
    const commands = new Map([
      ['Game card', { execute: async (i) => { await i.reply({ content: 'card' }); } }],
      ['lookup', { execute: async (i) => { await i.reply({ content: 'found' }); } }],
    ]);
    const menu = discord.userMenu('sam', 'Game card', 'kim');
    const slash = discord.command('sam', 'lookup', { options: { query: 'alien' } });
    slash.commandId = '123456789';

    await dispatchCommand(menu, commands);
    await dispatchCommand(slash, commands);

    // Nothing remembered for the menu: no header could be built from it
    expect(echoAfter(menu)).toBeNull();
    // The slash command, remembered with its option names and command id
    expect(echoAfter(slash)).toBe(`-# <@sam> used </lookup:123456789> \`query\``);
  });

  test('a slash command still dispatches, with a subcommand, to its own execute', async () => {
    const seen = [];
    const commands = new Map([['lookup', { execute: async (i) => { seen.push(i.options.getSubcommand()); await i.reply({ content: 'x' }); } }]]);
    await dispatchCommand(discord.command('sam', 'lookup', { subcommand: 'find' }), commands);
    expect(seen).toEqual(['find']);
  });

  test('an unknown command name is dropped without a reply or a throw', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const i = discord.userMenu('sam', 'Nothing here', 'kim');
    await dispatchCommand(i, new Map());
    expect(i.replied).toBe(false);
    expect(i.deferred).toBe(false);
  });

  test('a throwing right-click command gets the private error reply', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const i = discord.userMenu('sam', 'Game card', 'kim');

    await dispatchCommand(i, new Map([['Game card', { execute: async () => { throw new Error('boom'); } }]]));

    expect(i.replyMessage.content).toBe('There was an error executing this command!');
    expect(i.replyMessage.ephemeralFor).toBe('sam');
    expect(discord.violations).toEqual([]);
  });

  test('after the command already answered, the error goes out as a private follow-up', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const i = discord.userMenu('sam', 'Game card', 'kim');
    const commands = new Map([['Game card', { execute: async (x) => { await x.deferReply({ ephemeral: true }); throw new Error('late'); } }]]);

    await dispatchCommand(i, commands);

    const last = i.responses[i.responses.length - 1];
    expect(last.content).toBe('There was an error executing this command!');
    expect(last.ephemeralFor).toBe('sam');
    expect(discord.violations).toEqual([]);
  });
});

describe('which interactions are commands', () => {
  test('slash and right-click are; buttons, selects, modals and autocomplete are not', () => {
    expect(isCommandInteraction(discord.command('sam', 'lookup'))).toBe(true);
    expect(isCommandInteraction(discord.userMenu('sam', 'Game card', 'kim'))).toBe(true);
    expect(isCommandInteraction(discord.modalSubmit('sam', 'x'))).toBe(false);
    expect(isCommandInteraction(discord.autocomplete('sam', 'lookup', { focused: { name: 'q', value: '' } }))).toBe(false);
  });
});

describe('the rate limiter and a right-click command', () => {
  test('a second right-click inside the window is refused, naming the command without a slash', async () => {
    await freshGuild({ rateLimited: true });
    const execute = jest.fn(async (i) => { await i.reply({ content: 'card', ephemeral: true }); });
    const commands = new Map([['Game card', { execute }]]);

    await dispatchCommand(discord.userMenu('sam', 'Game card', 'kim'), commands);
    const second = discord.userMenu('sam', 'Game card', 'kim');
    await dispatchCommand(second, commands);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(second.replyMessage.ephemeralFor).toBe('sam');
    expect(second.replyMessage.content).toMatch(/before using \*\*Game card\*\* again/);
    expect(second.replyMessage.content).not.toContain('/Game card');
  });
});

describe('Game card, right-click to reply (the real command)', () => {
  let gameCard;
  beforeAll(async () => {
    gameCard = await import('../src/commands/game-card.js');
  });

  beforeEach(() => {
    resetPlayLimits();
    deleteScores(GUILD);
  });

  test('shows the CLICKED member\'s card, privately, with their points', async () => {
    // Kim scores a food fight hit; Sam, who will do the clicking, never plays
    const pts = POINTS.foodfight.hit[0];
    expect(pts).toBeGreaterThan(0);
    recordPlay(GUILD, {
      game: 'foodfight',
      actor: { id: 'kim', name: 'Kim' },
      target: { kind: 'member', pingUserIds: ['sam'], name: 'Sam' },
      outcome: 'hit',
    });
    // Sam is the target of that hit, so he has a score of his own; give the
    // test a clicker with none, so "names the target" can't pass by accident
    discord.addUser('lee', { nickname: 'Lee' });

    const i = discord.userMenu('lee', 'Game card', 'kim');
    await dispatchCommand(i, new Map([['Game card', gameCard]]));

    expect(i.replyMessage.ephemeralFor).toBe('lee');
    const embed = i.replyMessage.embeds[0];
    const text = JSON.stringify(embed);
    expect(embed.author.name).toBe('Kim');
    // however the card dresses the number (`3` points), it is Kim's total
    expect(text).toMatch(new RegExp(`\\b${pts}\\W+points`));
    expect(text).not.toContain('Lee');
    expect(discord.violations).toEqual([]);
  });

  test('a member who has not played gets a private "hasn\'t played", not an error', async () => {
    const i = discord.userMenu('sam', 'Game card', 'kim');
    await dispatchCommand(i, new Map([['Game card', gameCard]]));
    expect(i.replyMessage.ephemeralFor).toBe('sam');
    expect(JSON.stringify(i.replyMessage.embeds ?? [])).toContain('Kim');
    expect(i.replyMessage.content).not.toBe('There was an error executing this command!');
  });
});

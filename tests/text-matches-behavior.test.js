/**
 * Things the bot says about who can do what, checked against what it does.
 *
 * - /survey close and delete refused someone by saying "Only the survey
 *   creator, administrators, or moderators can…", but a moderator (Timeout,
 *   Kick or Ban Members) can't: pollManager.canManagePoll admits the creator,
 *   Administrator or Manage Server.
 * - /bracket resolve-tiebreaker's description said "Admin/Mod/Creator only";
 *   the subcommand's gate refuses a creator who isn't an admin or moderator.
 * - /similar's description left out books, which it searches, and its line
 *   in /eggshen-help said only "movies or TV shows".
 *
 * Run with: npm test -- tests/text-matches-behavior.test.js
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { FakeDiscord } from './harness/fakeDiscord.js';

const GUILD = 'text-matches-behavior-guild';

let survey;
let bracket;
let similar;
let pollManager;

beforeAll(async () => {
  survey = await import('../src/commands/survey.js');
  bracket = await import('../src/commands/bracket.js');
  similar = await import('../src/commands/similar.js');
  pollManager = await import('../src/utils/pollManager.js');
  const dir = process.env.GUILD_POLLS_DIR;
  if (dir && fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir)) if (name.startsWith(GUILD)) fs.unlinkSync(path.join(dir, name));
  }
});

const subcommand = (command, name) => command.data.toJSON().options.find(o => o.name === name);

describe('/survey close and delete: the refusal names who really can', () => {
  let discord;
  let pollId;

  beforeAll(async () => {
    discord = new FakeDiscord({ guildId: GUILD });
    discord.addUser('host');
    // Every moderator permission isAdmin() knows, and neither of the two that manage surveys
    discord.addUser('mod', { permissions: ['ModerateMembers', 'KickMembers', 'BanMembers'] });
    discord.addUser('manager', { permissions: ['ManageGuild'] });
    const i = discord.command('host', 'survey', { subcommand: 'create', options: { question: 'Creature feature?', option1: 'Them!', option2: 'Tremors' } });
    await survey.execute(i);
    pollId = pollManager.getPollByMessageId(GUILD, i.replyMessage.id).pollId;
  });

  async function run(userId, sub) {
    const i = discord.command(userId, 'survey', { subcommand: sub, options: { poll_id: pollId } });
    await survey.execute(i);
    return i.replyMessage.content;
  }

  test('a moderator is refused, told it takes the creator, Administrator or Manage Server', async () => {
    expect(await run('mod', 'close')).toBe('❌ You do not have permission to close this survey. Only the person who created it, or someone with Administrator or Manage Server, can close it.');
    expect(await run('mod', 'delete')).toBe('❌ You do not have permission to delete this survey. Only the person who created it, or someone with Administrator or Manage Server, can delete it.');
    expect(pollManager.getPoll(GUILD, pollId).status).toBe('active');
  });

  test('and what it says holds: Manage Server closes it, the creator deletes it', async () => {
    expect(await run('manager', 'close')).toContain('has been closed');
    expect(pollManager.getPoll(GUILD, pollId).status).toBe('closed');
    expect(await run('host', 'delete')).toBe('✅ Survey "Creature feature?" has been permanently deleted.');
    expect(pollManager.getPoll(GUILD, pollId)).toBeFalsy();
  });
});

describe('/bracket resolve-tiebreaker', () => {
  test('says admins and moderators only, which is who its gate lets in', async () => {
    expect(subcommand(bracket, 'resolve-tiebreaker').description).toBe('Manually resolve a tiebreaker (Admin/Mod only)');
    // Nothing in /bracket promises a tournament's creator anything
    for (const name of bracket.ADMIN_SUBCOMMANDS) {
      const sub = subcommand(bracket, name);
      if (sub) expect([name, sub.description]).not.toEqual([name, expect.stringMatching(/creator/i)]);
    }

    const discord = new FakeDiscord({ guildId: GUILD });
    discord.addUser('host'); // say, the person who set the tournament up, without a moderator role
    const i = discord.command('host', 'bracket', { subcommand: 'resolve-tiebreaker', options: { 'tiebreaker-id': 'tb-1', winner: 1 } });
    await bracket.execute(i);
    expect(i.replyMessage.content).toBe('❌ Only administrators and moderators can manage tournaments.');
  });
});

describe('/similar', () => {
  test('its description names every kind of title its type option offers, books included', () => {
    const json = similar.data.toJSON();
    const words = { movie: 'movies', tv: 'TV shows', game: 'games', boardgame: 'board games', book: 'books' };
    const choices = json.options.find(o => o.name === 'type').choices.map(c => c.value);
    expect(choices).toContain('book');
    for (const value of choices) expect([value, json.description]).toEqual([value, expect.stringContaining(words[value])]);
    expect(json.options.find(o => o.name === 'title').description).toContain('book');
  });

  test('and so does its line in /eggshen-help', async () => {
    const help = await import('../src/commands/help.js');
    const discord = new FakeDiscord({ guildId: GUILD });
    discord.addUser('member');
    const i = discord.command('member', 'eggshen-help');
    await help.execute(i);
    expect(discord.violations).toEqual([]);
    const line = i.replyMessage.text.split('\n').find(l => l.includes('/similar**'));

    const words = { movie: 'movies', tv: 'TV shows', game: 'games', boardgame: 'board games', book: 'books' };
    const choices = similar.data.toJSON().options.find(o => o.name === 'type').choices.map(c => c.value);
    expect(choices).toHaveLength(5);
    for (const value of choices) expect([value, line]).toEqual([value, expect.stringContaining(words[value])]);
  });
});

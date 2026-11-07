/**
 * The commands /survey create tells its creator to run must be commands that
 * actually run.
 *
 * The confirmation said "Use `/survey close <id>` to close or
 * `/survey delete <id>` to delete" — the id as a bare word. /survey close
 * and delete take it as an option, `poll_id:`, so the hint couldn't be typed
 * as written.
 *
 * Driven end to end through the fake Discord: the real /survey create, then
 * every `/survey …` in its reply is checked against the command's own schema
 * (a real subcommand, real option names, no bare words, its required options
 * given), and the close hint is run as written to show it closes the survey.
 *
 * Run with: npm test -- tests/survey-create-hints.test.js
 */

import { describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { FakeDiscord } from './harness/fakeDiscord.js';
import { getPoll } from '../src/utils/pollManager.js';

const GUILD = 'survey-create-hints-guild';
const POLL_FILE = path.join(process.env.GUILD_POLLS_DIR, `${GUILD}.json`);

let survey;
let discord;

beforeAll(async () => {
  survey = await import('../src/commands/survey.js');
});

beforeEach(() => {
  if (fs.existsSync(POLL_FILE)) fs.unlinkSync(POLL_FILE);
  discord = new FakeDiscord({ guildId: GUILD, channelId: 'general' });
  discord.addUser('creator');
});

/**
 * `/survey close poll_id:abc` → { sub: 'close', options: { poll_id: 'abc' }, bare: [] }.
 * A word with no `name:` is a bare (positional) argument, which slash
 * commands don't have.
 */
function parseHint(hint) {
  const [command, sub, ...rest] = hint.trim().split(/\s+/);
  const options = {};
  const bare = [];
  for (const word of rest) {
    const m = word.match(/^([a-z0-9_-]+):(.+)$/);
    if (m) options[m[1]] = m[2];
    else bare.push(word);
  }
  return { command, sub, options, bare };
}

/** What's wrong with a hint, judged against /survey's own registered schema */
function hintProblems(hint) {
  const { command, sub, options, bare } = parseHint(hint);
  const schema = survey.data.toJSON();
  if (command !== `/${schema.name}`) return [`${hint}: not /${schema.name}`];
  const subcommand = (schema.options || []).find(o => o.type === 1 && o.name === sub);
  if (!subcommand) return [`${hint}: /${schema.name} has no subcommand "${sub}"`];

  const problems = [];
  const known = (subcommand.options || []).map(o => o.name);
  for (const word of bare) problems.push(`${hint}: "${word}" is a bare word; slash commands only take name:value options`);
  for (const name of Object.keys(options)) {
    if (!known.includes(name)) problems.push(`${hint}: "${name}" is not an option of /${schema.name} ${sub} (has ${known.join(', ') || 'none'})`);
  }
  for (const o of subcommand.options || []) {
    // A hint naming no options at all is "run this" (e.g. voting-post);
    // one that names some must name every required one
    if (o.required && Object.keys(options).length + bare.length > 0 && !(o.name in options)) {
      problems.push(`${hint}: required option "${o.name}" missing`);
    }
  }
  return problems;
}

/** Every `/survey …` in a piece of text, as written between backticks */
const surveyHints = (text) => [...text.matchAll(/`(\/survey [^`]+)`/g)].map(m => m[1]);

describe('/survey create — the commands its reply suggests', () => {
  test('every /survey hint is a real subcommand with real options, and the close hint closes the survey', async () => {
    const create = discord.command('creator', 'survey', {
      subcommand: 'create',
      options: { question: 'Friday double feature?', option1: 'Slashers', option2: 'Creature features' },
    });
    await survey.execute(create);

    // The confirmation is the creator's ephemeral follow-up
    const confirmation = discord.ephemeral('creator').map(m => m.content).find(c => c.includes('Survey created'));
    expect(confirmation).toBeDefined();
    const pollId = confirmation.match(/\*\*Survey ID:\*\* `(\w+)`/)[1];

    const hints = surveyHints(confirmation);
    // close, delete and voting-post are all suggested
    expect(hints.map(h => parseHint(h).sub).sort()).toEqual(['close', 'delete', 'voting-post']);
    expect(hints.flatMap(hintProblems)).toEqual([]);

    // Exactly the syntax a person would type
    expect(confirmation).toContain(`\`/survey close poll_id:${pollId}\``);
    expect(confirmation).toContain(`\`/survey delete poll_id:${pollId}\``);

    // And typed as written, the close hint closes it
    const closeHint = parseHint(hints.find(h => parseHint(h).sub === 'close'));
    expect(getPoll(GUILD, pollId).status).toBe('active');
    await survey.execute(discord.command('creator', 'survey', { subcommand: 'close', options: closeHint.options }));
    expect(getPoll(GUILD, pollId).status).toBe('closed');
    expect(discord.violations).toEqual([]);
  });
});

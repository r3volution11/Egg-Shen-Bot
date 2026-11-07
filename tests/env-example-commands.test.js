/**
 * Every slash command .env.example names must exist, as written.
 *
 * Self-hosters set the bot up from this file's comments. DOCS_URL's said it
 * was shown in "/eggshen-bracket help" — the command is /bracket — and two
 * comments said "/bracket setup-link", which is /bracket-setup's subcommand.
 *
 * Checked against the registered commands themselves (each file's `data`
 * in src/commands/, as deploy-commands sends them): a `/name` must be a
 * command, and a word after a command that has subcommands must be one of
 * them. Web pages the file also names by path are listed below.
 *
 * Run with: npm test -- tests/env-example-commands.test.js
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const ENV_EXAMPLE = fs.readFileSync(path.join(process.cwd(), '.env.example'), 'utf8');

// Paths on the bot's own web server, not slash commands
const WEB_PAGES = new Set(['/quotes-admin']);

/** name → its subcommand and group names (empty for a command with none) */
let commands;

beforeAll(async () => {
  commands = new Map();
  const dir = path.join(process.cwd(), 'src/commands');
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
    const mod = await import(path.join(dir, file));
    if (!mod.data) continue;
    const json = mod.data.toJSON();
    // 1 = subcommand, 2 = subcommand group
    const subs = (json.options || []).filter(o => o.type === 1 || o.type === 2).map(o => o.name);
    commands.set(json.name, subs);
  }
});

/** `/name next` pairs: a slash at the start of a word, the word after it if any */
function mentions(text) {
  return [...text.matchAll(/(?:^|[\s`("'])\/([a-z][a-z0-9-]*)(?: ([a-z][a-z0-9-]*))?/gm)]
    .map(m => ({ name: m[1], next: m[2] || null, line: text.slice(0, m.index).split('\n').length }));
}

describe('.env.example', () => {
  test('names only commands and subcommands that exist', () => {
    const found = mentions(ENV_EXAMPLE);
    expect(found.length).toBeGreaterThan(0);

    const problems = [];
    for (const { name, next, line } of found) {
      if (WEB_PAGES.has(`/${name}`)) continue;
      if (!commands.has(name)) {
        problems.push(`line ${line}: /${name} is not a command`);
        continue;
      }
      const subs = commands.get(name);
      if (subs.length > 0 && next && !subs.includes(next)) {
        problems.push(`line ${line}: /${name} has no subcommand "${next}" (has ${subs.join(', ')})`);
      }
    }
    expect(problems).toEqual([]);
  });

  test('DOCS_URL\'s comment names /bracket help', () => {
    const comment = ENV_EXAMPLE.slice(0, ENV_EXAMPLE.indexOf('DOCS_URL=')).split('\n\n').pop();
    expect(comment).toContain('/bracket help');
    expect(commands.get('bracket')).toContain('help');
  });
});

/**
 * Every `/bracket <sub>` and `/bracket-setup <sub>` the bot itself tells
 * people to run — replies, footers, the setup page — names a subcommand that
 * command really has.
 *
 * Setup subcommands moved from /bracket to /bracket-setup in 2.62.0, and
 * ~50 messages named them. One missed would send an admin to a command
 * Discord rejects as outdated. docs-commands.test.js checks the docs; its
 * checker reads markdown and misreads JS strings, hence this narrower check.
 * (It found `/bracket image` in /bracket help, which never existed.)
 *
 * Run with: npm test -- tests/bracket-command-references.test.js
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
// Sentences, not subcommands: "the /bracket command", "use /bracket to run…",
// "/bracket and /bracket-setup commands"
const PROSE = new Set(['command', 'commands', 'and', 'to', 'in', 'is']);

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : sourceFiles(full);
    return /\.(js|html)$/.test(e.name) ? [full] : [];
  });
}

let subcommands;
beforeAll(async () => {
  subcommands = {};
  for (const name of ['bracket', 'bracket-setup']) {
    const { data } = await import(`../src/commands/${name}.js`);
    subcommands[name] = new Set(data.toJSON().options.map(o => o.name));
  }
});

function unknownMentions(text) {
  const wrong = [];
  for (const [, name, sub] of text.matchAll(/\/(bracket(?:-setup)?) ([a-z][a-z-]*)/g)) {
    if (!PROSE.has(sub) && !subcommands[name].has(sub)) wrong.push(`/${name} ${sub}`);
  }
  return wrong;
}

describe('tournament commands named in the bot\'s own text', () => {
  test('every one is a real subcommand of that command', () => {
    const wrong = [];
    for (const file of [...sourceFiles(path.join(ROOT, 'src')), ...sourceFiles(path.join(ROOT, 'public'))]) {
      const rel = path.relative(ROOT, file);
      // docsAnswer's comments describe a made-up command on purpose
      if (rel === path.join('src', 'utils', 'docsAnswer.js')) continue;
      for (const m of unknownMentions(fs.readFileSync(file, 'utf8'))) wrong.push(`${rel}: ${m}`);
    }
    expect(wrong).toEqual([]);
  });

  test('the check catches a subcommand on the wrong command', () => {
    // So a pass above means something
    expect(unknownMentions('Run `/bracket create name:Cup`')).toEqual(['/bracket create']);
    expect(unknownMentions('Run `/bracket-setup open`')).toEqual(['/bracket-setup open']);
    expect(unknownMentions('Run `/bracket-setup create` then `/bracket open`')).toEqual([]);
  });
});

/**
 * Every slash command the docs show must be one the bot really has — the
 * path, the option names, and values where the definition pins them down.
 *
 * The docs had drifted badly: Getting Started's first examples used
 * `/movie title:` (the option is `query`), and whole pages described
 * commands that never existed (`/notifications …`, `/cooldown add`,
 * `/leaderboard`). That misleads readers, and /eggshen-ask answers from
 * these pages — its search fallback shows them as written.
 *
 * Uses the same checker /eggshen-ask runs on AI answers (docsAnswer.js).
 * The changelog is history, so it's left out.
 *
 * Run with: npm test -- tests/docs-commands.test.js
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { buildCommandCatalog, checkCommands } from '../src/utils/docsAnswer.js';

const DOCS = path.join(process.cwd(), 'docs');

/**
 * Mentions that look like commands but aren't, per page. Keep this short:
 * each entry is a URL path or a syntax pattern, never a command.
 */
const NOT_COMMANDS = {
  'features/event-requests.md': [/^\/(public|callbacks?)\b/],
  'commands/configuration.md': [/^\/eggshen-config(-[a-z-]+)? <group> <subcommand>/],
  'commands/brackets/import.md': [/^\/tournament-setup \{/], // an nginx location block
};

function markdownFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name.startsWith('.') || e.name === 'public' ? [] : markdownFiles(full);
    return e.name.endsWith('.md') ? [full] : [];
  });
}

let catalog;
beforeAll(async () => {
  const commands = [];
  for (const f of fs.readdirSync(path.join(process.cwd(), 'src/commands')).filter(f => f.endsWith('.js'))) {
    const m = await import(`../src/commands/${f}`);
    if (m.data) commands.push(m);
  }
  catalog = buildCommandCatalog(commands);
});

describe('commands in the docs', () => {
  test('every one is real', () => {
    const wrong = [];
    for (const file of markdownFiles(DOCS)) {
      const rel = path.relative(DOCS, file);
      if (rel === 'changelog.md') continue;
      const allowed = NOT_COMMANDS[rel] || [];
      // Frontmatter `link: /getting-started` is a page, not a command
      const text = fs.readFileSync(file, 'utf8').replace(/^\s*link: \/\S*$/gm, '');
      for (const span of checkCommands(text, catalog).unknown) {
        if (!allowed.some(re => re.test(span))) wrong.push(`${rel}: ${span}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  test('the check catches a made-up command, option or value', () => {
    // So a pass above means something
    expect(checkCommands('```\n/movie title:Alien\n```', catalog).unknown).toHaveLength(1);
    expect(checkCommands('Run `/notifications follow`', catalog).unknown).toHaveLength(1);
    expect(checkCommands('Run `/bracket open matchups:9`', catalog).unknown).toHaveLength(1);
    expect(checkCommands('```\n/movie query:Alien\n```', catalog).unknown).toEqual([]);
  });
});

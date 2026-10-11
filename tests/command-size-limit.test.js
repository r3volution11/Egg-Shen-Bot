/**
 * Discord rejects any slash command whose serialized JSON exceeds 8000 bytes.
 *
 * That ceiling has been hit twice on /eggshen-config, each time only when a
 * deploy failed — forcing the command to be split after the fact. This test
 * makes the budget visible at test time instead, so an option that would break
 * a deploy fails here first.
 *
 * `npm run check:commands` reports the same figures interactively, with a
 * per-subcommand breakdown (--verbose) for deciding what to move.
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import { readdirSync } from 'fs';
import path from 'path';

const COMMAND_LIMIT = 8000;

/**
 * The point at which a command should be split rather than grown further.
 * Commands already above this are listed in KNOWN_LARGE below.
 */
const WARN_THRESHOLD = 0.75;

/**
 * Commands knowingly above the warning threshold. Adding to this list is a
 * deliberate decision to accept the risk — the limit itself is not negotiable.
 */
const KNOWN_LARGE = new Set(['bracket']);

const commandsPath = path.join(process.cwd(), 'src/commands');

let commands = [];

beforeAll(async () => {
  const files = readdirSync(commandsPath).filter(f => f.endsWith('.js'));

  for (const file of files) {
    const imported = await import(`file://${path.join(commandsPath, file)}`);
    if (!('data' in imported)) continue;

    const json = imported.data.toJSON();
    commands.push({
      name: json.name,
      file,
      bytes: Buffer.byteLength(JSON.stringify(json), 'utf8'),
    });
  }
});

describe('Discord slash command size limit', () => {
  test('at least one command was loaded', () => {
    // Guards against the loader silently finding nothing and the suite
    // passing vacuously.
    expect(commands.length).toBeGreaterThan(0);
  });

  test('every command is within the 8000-byte limit', () => {
    const over = commands.filter(c => c.bytes > COMMAND_LIMIT);

    expect(
      over.map(c => `${c.name} (${c.bytes} bytes, ${c.bytes - COMMAND_LIMIT} over)`)
    ).toEqual([]);
  });

  test('no unexpected command has crossed 75% of the budget', () => {
    const near = commands
      .filter(c => c.bytes > COMMAND_LIMIT * WARN_THRESHOLD)
      .filter(c => !KNOWN_LARGE.has(c.name));

    // A command crossing this line is close enough that the next option added
    // could break the deploy. Split it, or add it to KNOWN_LARGE deliberately.
    expect(
      near.map(c => `${c.name} (${c.bytes} bytes, ${Math.round((c.bytes / COMMAND_LIMIT) * 100)}%)`)
    ).toEqual([]);
  });

  test('commands listed as known-large still exist', () => {
    // Keeps the exemption list honest if a command is renamed or split.
    const names = new Set(commands.map(c => c.name));
    for (const known of KNOWN_LARGE) {
      expect(names.has(known)).toBe(true);
    }
  });

  test('/bracket and /bracket-setup have not grown since they were last measured', () => {
    // /bracket reached 7841 of 8000 bytes with 2.62.0's seeding options, so
    // 2.62.0 split it: setup subcommands (create, setup-link, manage-titles,
    // resize, edit-name, announce) moved to /bracket-setup. Both now have
    // room, but growth should still be a conscious decision, so pin each.
    // History: 7400 → 7432 (2.45.0 `open matchups:`), → 7404 (2.57.0 trimmed
    // descriptions to pay for `voting-post`), → 7841, then the split.
    const ceilings = { bracket: 4346, 'bracket-setup': 3586 };
    for (const [name, ceiling] of Object.entries(ceilings)) {
      const command = commands.find(c => c.name === name);
      expect(command).toBeDefined();
      expect(command.bytes).toBeLessThanOrEqual(ceiling);
    }
  });
});

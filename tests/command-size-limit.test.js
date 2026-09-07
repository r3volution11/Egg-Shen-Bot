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

  test('/bracket has not grown since it was last measured', () => {
    // /bracket sits at ~91% with only a few hundred bytes free. Anything added
    // to it should be a conscious decision, so pin the ceiling.
    const bracket = commands.find(c => c.name === 'bracket');
    expect(bracket).toBeDefined();
    expect(bracket.bytes).toBeLessThanOrEqual(7400);
  });
});

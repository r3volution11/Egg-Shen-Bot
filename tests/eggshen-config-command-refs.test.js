/**
 * Structural regression test: every `/eggshen-config[-suffix] <group>
 * <subcommand>` reference embedded in each eggshen-config-family command
 * file's own user-facing message strings must name a group+subcommand pair
 * that actually exists in THAT SAME command's real SlashCommandBuilder
 * schema.
 *
 * Originally caught ~13 stale references (e.g. `/eggshen-config rate-limit-toggle`,
 * `/eggshen-config moderation-toggle`, `/eggshen-config whitelist-add-role`)
 * that were missing their subcommand-group prefix or used the wrong
 * separator — copy/paste drift from before the command was reorganized into
 * subcommand groups. Rather than hardcoding the current fixed strings (which
 * would just bit-rot again), this derives the valid group/subcommand list
 * directly from each file's own `data.toJSON()` so any future rename is
 * caught automatically.
 *
 * `eggshen-config.js` was later split into 5 separate top-level commands
 * (`eggshen-config`, `eggshen-config-watch-party`, `eggshen-config-ai`,
 * `eggshen-config-moderation`, `eggshen-config-events`) once the original
 * single command's serialized size exceeded Discord's 8000-byte per-command
 * cap — this test now runs the same check against each of the 5 files
 * independently, since a reference in one file must match THAT file's own
 * schema (a group that moved to a different command is a real bug here,
 * not a false positive).
 *
 * Run with: npx jest tests/eggshen-config-command-refs.test.js --verbose
 */

import { describe, test, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const COMMAND_FILES = [
  { commandName: 'eggshen-config', relPath: 'src/commands/eggshen-config.js' },
  { commandName: 'eggshen-config-watch-party', relPath: 'src/commands/eggshen-config-watch-party.js' },
  { commandName: 'eggshen-config-ai', relPath: 'src/commands/eggshen-config-ai.js' },
  { commandName: 'eggshen-config-moderation', relPath: 'src/commands/eggshen-config-moderation.js' },
  { commandName: 'eggshen-config-events', relPath: 'src/commands/eggshen-config-events.js' },
];

// Find every `/<commandName> <word> <word>` reference, scoped to backtick-
// delimited spans only (how every real command reference in these files is
// written — plain-English mentions like "Use /eggshen-config-ai ai-images to
// adjust settings" without backticks are prose, not a command path, and must
// be excluded). The command name itself is escaped and matched exactly, so
// e.g. `/eggshen-config-events` matches only that command's own schema, not
// the base `/eggshen-config`'s.
const BACKTICK_SPAN_PATTERN = /`([^`]*)`/g;

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findAllReferences(text, commandName) {
  const referencePattern = new RegExp(`/${escapeRegExp(commandName)}(?:\\s+([a-z-]+))?(?:\\s+([a-z-]+))?`, 'g');
  const matches = [];
  let spanMatch;
  BACKTICK_SPAN_PATTERN.lastIndex = 0;
  while ((spanMatch = BACKTICK_SPAN_PATTERN.exec(text)) !== null) {
    const span = spanMatch[1];
    let refMatch;
    referencePattern.lastIndex = 0;
    while ((refMatch = referencePattern.exec(span)) !== null) {
      matches.push({ group: refMatch[1] || null, subcommand: refMatch[2] || null, index: spanMatch.index });
    }
  }
  return matches;
}

describe.each(COMMAND_FILES)('$commandName command references', ({ commandName, relPath }) => {
  let validGroups;
  let source;

  beforeAll(async () => {
    const { data } = await import(`../${relPath}`);
    const schema = data.toJSON();
    validGroups = new Map(
      schema.options
        .filter(opt => opt.type === 2) // SUB_COMMAND_GROUP
        .map(group => [group.name, new Set((group.options || []).map(sub => sub.name))])
    );
    source = fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
  });

  test('the schema actually has subcommand groups (sanity check the extraction worked)', () => {
    expect(validGroups.size).toBeGreaterThan(0);
  });

  test(`every /${commandName} <group> reference in the source names a real group`, () => {
    const references = findAllReferences(source, commandName);
    const badGroupRefs = references.filter(ref => ref.group && !validGroups.has(ref.group));

    expect(badGroupRefs).toEqual([]);
  });

  test(`every /${commandName} <group> <subcommand> reference names a real subcommand of that group`, () => {
    const references = findAllReferences(source, commandName);
    const badSubRefs = references.filter(ref => {
      if (!ref.group || !ref.subcommand) return false; // group-only reference (e.g. `/eggshen-config-ai ai-images`) is fine
      const subs = validGroups.get(ref.group);
      return subs && !subs.has(ref.subcommand);
    });

    expect(badSubRefs).toEqual([]);
  });
});

describe('cross-file references (a command referenced by name must actually point at itself)', () => {
  test('every file mentioning a DIFFERENT split-off command by name references a real group of that other command', async () => {
    // e.g. eggshen-config.js's "How to Configure" field points to
    // "/eggshen-config-ai ai-images view" — confirm "ai-images" really is
    // a group on eggshen-config-ai.js's own schema, not a stale/renamed one.
    const schemasByCommand = new Map();
    for (const { commandName, relPath } of COMMAND_FILES) {
      const { data } = await import(`../${relPath}`);
      const schema = data.toJSON();
      const groups = new Set(schema.options.filter(opt => opt.type === 2).map(g => g.name));
      schemasByCommand.set(commandName, groups);
    }

    const problems = [];
    for (const { commandName: sourceCommand, relPath } of COMMAND_FILES) {
      const source = fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');

      for (const { commandName: otherCommandName } of COMMAND_FILES) {
        if (otherCommandName === sourceCommand) continue;
        const otherGroups = schemasByCommand.get(otherCommandName);
        const refs = findAllReferences(source, otherCommandName);
        for (const ref of refs) {
          if (ref.group && !otherGroups.has(ref.group)) {
            problems.push(`${relPath}: references /${otherCommandName} ${ref.group}, but that group is not in ${otherCommandName}'s schema`);
          }
        }
      }
    }

    expect(problems).toEqual([]);
  });
});

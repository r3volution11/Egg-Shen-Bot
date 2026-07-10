/**
 * Structural regression test: every `/eggshen-config <group> <subcommand>`
 * reference embedded in eggshen-config.js's own user-facing message strings
 * must name a group+subcommand pair that actually exists in the command's
 * real SlashCommandBuilder schema.
 *
 * Found and fixed ~13 stale references (e.g. `/eggshen-config rate-limit-toggle`,
 * `/eggshen-config moderation-toggle`, `/eggshen-config whitelist-add-role`)
 * that were missing their subcommand-group prefix or used the wrong
 * separator — copy/paste drift from before the command was reorganized into
 * subcommand groups. Rather than hardcoding the current fixed strings (which
 * would just bit-rot again), this derives the valid group/subcommand list
 * directly from `data.toJSON()` so any future rename is caught automatically.
 *
 * Run with: npx jest tests/eggshen-config-command-refs.test.js --verbose
 */

import { describe, test, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { data } from '../src/commands/eggshen-config.js';

const SOURCE_PATH = path.join(process.cwd(), 'src/commands/eggshen-config.js');
const source = fs.readFileSync(SOURCE_PATH, 'utf8');

// Build the real group -> [subcommand names] map from the command's own schema.
const schema = data.toJSON();
const validGroups = new Map(
  schema.options
    .filter(opt => opt.type === 2) // SUB_COMMAND_GROUP
    .map(group => [group.name, new Set((group.options || []).map(sub => sub.name))])
);

// Find every `/eggshen-config <word> <word>` reference, scoped to backtick-
// delimited spans only (how every real command reference in this file is
// written — plain-English mentions like "Use /eggshen-config ai-images to
// adjust settings" are prose, not a command path, and must be excluded).
const BACKTICK_SPAN_PATTERN = /`([^`]*)`/g;
const REFERENCE_PATTERN = /\/eggshen-config ([a-z-]+)(?: ([a-z-]+))?/g;

function findAllReferences(text) {
  const matches = [];
  let spanMatch;
  while ((spanMatch = BACKTICK_SPAN_PATTERN.exec(text)) !== null) {
    const span = spanMatch[1];
    let refMatch;
    REFERENCE_PATTERN.lastIndex = 0;
    while ((refMatch = REFERENCE_PATTERN.exec(span)) !== null) {
      matches.push({ group: refMatch[1], subcommand: refMatch[2] || null, index: spanMatch.index });
    }
  }
  return matches;
}

describe('eggshen-config.js command references', () => {
  test('the schema actually has subcommand groups (sanity check the extraction worked)', () => {
    expect(validGroups.size).toBeGreaterThan(0);
    expect(validGroups.has('moderation')).toBe(true);
    expect(validGroups.has('rate-limit')).toBe(true);
  });

  test('every /eggshen-config <group> reference in the source names a real group', () => {
    const references = findAllReferences(source);
    const badGroupRefs = references.filter(ref => !validGroups.has(ref.group));

    expect(badGroupRefs).toEqual([]);
  });

  test('every /eggshen-config <group> <subcommand> reference names a real subcommand of that group', () => {
    const references = findAllReferences(source);
    const badSubRefs = references.filter(ref => {
      if (!ref.subcommand) return false; // group-only reference (e.g. `/eggshen-config ai-images`) is fine
      const subs = validGroups.get(ref.group);
      return subs && !subs.has(ref.subcommand);
    });

    expect(badSubRefs).toEqual([]);
  });
});

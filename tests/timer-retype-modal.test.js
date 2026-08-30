/**
 * Source-level tests for the "Search" modal submission handler
 * (timer_retype_modal_<theme>), which lives inline in index.js's
 * isModalSubmit() dispatcher alongside timer_extend_modal_/watched_modal_/
 * edit_event_modal_/deny_event_modal_ — same pattern as
 * timer-extend-modal.test.js uses, since index.js is wired directly to a
 * real discord.js Client and can't be imported/invoked directly in a unit
 * test.
 *
 * Run with: npx jest tests/timer-retype-modal.test.js --verbose
 */

import { describe, test, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const INDEX_SOURCE = fs.readFileSync(path.join(process.cwd(), 'src/index.js'), 'utf8');

function extractModalBranch(source, customIdPrefix) {
  const startIndex = source.indexOf(`customId.startsWith('${customIdPrefix}')`);
  expect(startIndex).toBeGreaterThan(-1);

  const rest = source.slice(startIndex);
  const nextBranch = rest.indexOf("} else if (interaction.customId.startsWith(", 10);
  return nextBranch === -1 ? rest : rest.slice(0, nextBranch);
}

describe('timer_retype_modal_ dispatch (source-level)', () => {
  const branch = extractModalBranch(INDEX_SOURCE, 'timer_retype_modal_');

  test('is registered as a branch in the isModalSubmit dispatcher', () => {
    expect(INDEX_SOURCE).toMatch(/customId\.startsWith\('timer_retype_modal_'\)/);
  });

  test('extracts theme from the customId', () => {
    expect(branch).toMatch(/customId\.replace\('timer_retype_modal_',\s*''\)/);
  });

  test('reads the retyped title from the modal', () => {
    expect(branch).toMatch(/getTextInputValue\('retypedTitle'\)/);
  });

  test('defers the reply before calling runTitleSearchAndDecide', () => {
    const deferIndex = branch.indexOf('deferReply');
    const callIndex = branch.indexOf('runTitleSearchAndDecide(interaction');
    expect(deferIndex).toBeGreaterThan(-1);
    expect(callIndex).toBeGreaterThan(-1);
    expect(deferIndex).toBeLessThan(callIndex);
  });

  test('reloads guildConfig fresh rather than threading it through the customId', () => {
    expect(branch).toMatch(/loadGuildConfig\(interaction\.guildId\)/);
  });

  test('calls runTitleSearchAndDecide with the retyped label and wasAutoDetected hardcoded true', () => {
    expect(branch).toMatch(/label:\s*retypedTitle/);
    expect(branch).toMatch(/wasAutoDetected:\s*true/);
  });

  test('recovers channelId/userId/username directly off the modal-submit interaction', () => {
    expect(branch).toMatch(/channelId:\s*interaction\.channelId/);
    expect(branch).toMatch(/userId:\s*interaction\.user\.id/);
    expect(branch).toMatch(/username:\s*interaction\.user\.username/);
  });
});

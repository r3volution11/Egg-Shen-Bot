/**
 * Source-level tests for the "Extend Timer" modal submission handler
 * (timer_extend_modal_<channelId>), which lives inline in index.js's
 * isModalSubmit() dispatcher alongside watched_modal_/edit_event_modal_/
 * deny_event_modal_ — same pattern as eventApprovalChannelSelect.test.js
 * uses, since index.js is wired directly to a real discord.js Client and
 * can't be imported/invoked directly in a unit test.
 *
 * Run with: npx jest tests/timer-extend-modal.test.js --verbose
 */

import { describe, test, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const INDEX_SOURCE = fs.readFileSync(path.join(process.cwd(), 'src/index.js'), 'utf8');

function extractModalBranch(source, customIdPrefix) {
  const startIndex = source.indexOf(`customId.startsWith('${customIdPrefix}')`);
  expect(startIndex).toBeGreaterThan(-1);

  // Grab a generous window of source after the branch opens, up to the next
  // "} else if (interaction.customId.startsWith(" or the closing of the
  // isModalSubmit() dispatcher, whichever comes first.
  const rest = source.slice(startIndex);
  const nextBranch = rest.indexOf("} else if (interaction.customId.startsWith(", 10);
  return nextBranch === -1 ? rest : rest.slice(0, nextBranch);
}

describe('timer_extend_modal_ dispatch (source-level)', () => {
  const branch = extractModalBranch(INDEX_SOURCE, 'timer_extend_modal_');

  test('is registered as a branch in the isModalSubmit dispatcher', () => {
    expect(INDEX_SOURCE).toMatch(/customId\.startsWith\('timer_extend_modal_'\)/);
  });

  test('extracts channelId from the customId', () => {
    expect(branch).toMatch(/customId\.replace\('timer_extend_modal_',\s*''\)/);
  });

  test('rejects if the timer no longer exists', () => {
    expect(branch).toMatch(/getTimerStatus\(channelId\)/);
    expect(branch).toMatch(/no longer active/);
  });

  test('gates submission to the timer starter or an admin/moderator', () => {
    expect(branch).toMatch(/timer\.userId !== interaction\.user\.id/);
    expect(branch).toMatch(/isAdmin\(interaction\.member\)/);
  });

  test('validates the minutes field as a positive integer', () => {
    expect(branch).toMatch(/getTextInputValue\('minutes'\)/);
    expect(branch).toMatch(/parseInt\(rawMinutes,\s*10\)/);
    expect(branch).toMatch(/Number\.isInteger\(additionalMinutes\)/);
    expect(branch).toMatch(/additionalMinutes <= 0/);
  });

  test('computes the new total as current duration plus additional minutes, then clamps it', () => {
    expect(branch).toMatch(/timer\.duration \|\| 0\)\s*\+\s*additionalMinutes/);
    expect(branch).toMatch(/clampTimerDuration\(requestedTotal, guildConfig\)/);
  });

  test('calls adjustTimerDuration with the clamped total', () => {
    expect(branch).toMatch(/adjustTimerDuration\(channelId, newTotal, interaction\.client\)/);
  });

  test('clears the scheduler warning after a successful extend', () => {
    expect(branch).toMatch(/clearWarning\(channelId\)/);
  });

  test('notes in the reply when the extension was clamped to the server cap', () => {
    expect(branch).toMatch(/wasClamped/);
    expect(branch).toMatch(/capped at this server's/);
  });
});

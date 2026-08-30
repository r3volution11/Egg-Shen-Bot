/**
 * Tests for the "▶️ Start Timer" button (timer_skip_noauto_<theme>) shown
 * only on the new zero-results auto-detect recovery screen. Starts the
 * timer with no duration — the same outcome as the existing select-menu
 * "Start Timer (No Duration)" option, just reached from this new screen.
 *
 * Uses the real (unmocked) timerManager.js, matching
 * tests/timer-select-runtime.test.js's pattern, since this handler's actual
 * job is to start a real timer and this test verifies that real state.
 *
 * Run with: npx jest tests/timer-skip-noauto-button.test.js --verbose
 */

import { describe, test, expect, jest, beforeAll, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';

jest.unstable_mockModule('../src/utils/guildConfig.js', () => ({
  loadGuildConfig: jest.fn().mockResolvedValue({}),
  isAdmin: jest.fn().mockReturnValue(false),
}));

let handleButtonInteraction;
let getTimerStatus, clearAllTimers;

const TIMERS_FILE = path.join(process.cwd(), 'active_timers.json');

function cleanupTimerFile() {
  if (fs.existsSync(TIMERS_FILE)) fs.unlinkSync(TIMERS_FILE);
}

beforeAll(async () => {
  ({ handleButtonInteraction } = await import('../src/handlers/buttonHandler.js'));
  ({ getTimerStatus, clearAllTimers } = await import('../src/utils/timerManager.js'));
});

function makeChannel() {
  const message = { edit: jest.fn().mockResolvedValue(undefined) };
  return { id: 'channel-1', send: jest.fn().mockResolvedValue(message) };
}

function createMockInteraction({ customId, embedTitle }) {
  return {
    customId,
    channelId: 'channel-1',
    guildId: 'guild-1',
    channel: makeChannel(),
    client: {},
    user: { id: 'user-1', username: 'tester' },
    guild: { id: 'guild-1' },
    member: { permissions: { has: () => false } },
    message: { embeds: [{ title: embedTitle }] },
    deferUpdate: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    followUp: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  clearAllTimers();
  cleanupTimerFile();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  clearAllTimers();
  cleanupTimerFile();
});

async function run(interaction) {
  const promise = handleButtonInteraction(interaction);
  await jest.advanceTimersByTimeAsync(15000);
  await promise;
}

describe('timer_skip_noauto_ button dispatch', () => {
  test('starts the timer with the server default fallback duration', async () => {
    const interaction = createMockInteraction({
      customId: 'timer_skip_noauto_modern',
      embedTitle: 'Couldn\'t find a match for "Garbled Event Name"',
    });

    await run(interaction);

    const status = getTimerStatus('channel-1');
    expect(status).not.toBeNull();
    expect(status.duration).toBe(360);
    expect(status.isFallbackDuration).toBe(true);
    expect(status.label).toBe('Garbled Event Name');
  });

  test('recovers the label from the embed title via regex', async () => {
    const interaction = createMockInteraction({
      customId: 'timer_skip_noauto_scary',
      embedTitle: 'Couldn\'t find a match for "Some Weird Title (2026)"',
    });

    await run(interaction);

    const status = getTimerStatus('channel-1');
    expect(status.label).toBe('Some Weird Title (2026)');
  });

  test('warns the user the same way the manually-typed zero-results path does', async () => {
    const interaction = createMockInteraction({
      customId: 'timer_skip_noauto_modern',
      embedTitle: 'Couldn\'t find a match for "Garbled Event Name"',
    });

    await run(interaction);

    expect(interaction.followUp).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Couldn\'t find a runtime for "Garbled Event Name"'),
        ephemeral: true,
      })
    );
  });
});

/**
 * Regression test for the event-request approval "please select a text
 * channel" bug when it clearly was selected.
 *
 * global.eventChannelSelections (which channel(s) a moderator picked while
 * approving an event request) was a plain in-memory Map with no disk
 * persistence, unlike global.eventRequests which is saved/restored via
 * pending_event_requests.json. If the bot restarted between a moderator
 * selecting a channel and clicking "Create Event" (a redeploy, PM2 restart,
 * crash — anything), the selection silently vanished from memory while the
 * underlying event request survived the restart intact. The confirm-button
 * handler then reported "Please select a text channel before creating the
 * event" even though the UI clearly showed one selected, because the actual
 * cause (the bot restarted) wasn't visible to the moderator.
 *
 * Fixed by giving eventChannelSelections the same save-on-write / restore-
 * on-startup treatment eventRequests already has.
 *
 * Run with: npx jest tests/eventChannelSelections-persistence.test.js --verbose
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import {
  saveEventChannelSelections,
  loadEventChannelSelections,
} from '../src/api/server.js';

const SELECTIONS_FILE = path.join(process.cwd(), 'pending_event_channel_selections.json');

function cleanup() {
  if (fs.existsSync(SELECTIONS_FILE)) fs.unlinkSync(SELECTIONS_FILE);
  delete global.eventChannelSelections;
}

beforeEach(cleanup);
afterEach(cleanup);

describe('event channel selection persistence', () => {
  test('a selection survives a simulated bot restart', async () => {
    global.eventChannelSelections = new Map();
    const key = 'guild-1_1234567890_abc123';
    global.eventChannelSelections.set(key, { textChannelId: 'channel-general', voiceChannelId: null });

    await saveEventChannelSelections();

    // Simulate a restart: wipe in-memory state, then reload from disk.
    delete global.eventChannelSelections;
    await loadEventChannelSelections();

    expect(global.eventChannelSelections.has(key)).toBe(true);
    expect(global.eventChannelSelections.get(key)).toEqual({
      textChannelId: 'channel-general',
      voiceChannelId: null,
    });
  });

  test('a voice channel selection is preserved alongside the text channel', async () => {
    global.eventChannelSelections = new Map();
    const key = 'guild-1_1234567890_abc123';
    global.eventChannelSelections.set(key, { textChannelId: 'channel-general', voiceChannelId: 'voice-1' });

    await saveEventChannelSelections();
    delete global.eventChannelSelections;
    await loadEventChannelSelections();

    expect(global.eventChannelSelections.get(key).voiceChannelId).toBe('voice-1');
  });

  test('loading with no saved file yet does not throw and leaves an empty map', async () => {
    delete global.eventChannelSelections;
    await expect(loadEventChannelSelections()).resolves.not.toThrow();
    expect(global.eventChannelSelections).toBeInstanceOf(Map);
    expect(global.eventChannelSelections.size).toBe(0);
  });

  test('multiple concurrent selections (different requests) are each preserved independently', async () => {
    global.eventChannelSelections = new Map();
    global.eventChannelSelections.set('guild-1_req-a', { textChannelId: 'channel-a', voiceChannelId: null });
    global.eventChannelSelections.set('guild-1_req-b', { textChannelId: 'channel-b', voiceChannelId: 'voice-b' });

    await saveEventChannelSelections();
    delete global.eventChannelSelections;
    await loadEventChannelSelections();

    expect(global.eventChannelSelections.get('guild-1_req-a').textChannelId).toBe('channel-a');
    expect(global.eventChannelSelections.get('guild-1_req-b').textChannelId).toBe('channel-b');
  });
});

/**
 * Regression test for "This interaction failed" when selecting a channel
 * during event-request approval.
 *
 * The text/voice channel pickers shown by the "approve_event_" button
 * (buttonHandler.js) are built with discord.js's ChannelSelectMenuBuilder,
 * a different component type from the StringSelectMenuBuilder used
 * everywhere else in the bot (search-result pickers, etc.). index.js's
 * interactionCreate dispatcher only checked `interaction.isStringSelectMenu()`
 * before routing to handleSelectInteraction() — a channel-select interaction
 * satisfies `interaction.isChannelSelectMenu()` instead, so it matched none
 * of the dispatcher's branches and was silently dropped. Discord then shows
 * the generic "This interaction failed" to the user after ~3 seconds with no
 * ack, and nothing was ever logged since the handler never ran.
 *
 * Two things are checked:
 * 1. index.js's dispatcher source actually branches on isChannelSelectMenu()
 *    (a source-level check, since interactionCreate is wired directly to a
 *    real discord.js Client — importing index.js has real connection side
 *    effects, so it can't be unit-tested by invoking it directly).
 * 2. handleSelectInteraction() itself correctly handles a channel-select-menu-
 *    shaped interaction object once it's actually reached.
 *
 * Run with: npx jest tests/eventApprovalChannelSelect.test.js --verbose
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { handleSelectInteraction } from '../src/handlers/selectHandler.js';

const INDEX_SOURCE = fs.readFileSync(path.join(process.cwd(), 'src/index.js'), 'utf8');
const SELECTIONS_FILE = path.join(process.cwd(), 'pending_event_channel_selections.json');

function cleanup() {
  if (fs.existsSync(SELECTIONS_FILE)) fs.unlinkSync(SELECTIONS_FILE);
  delete global.eventChannelSelections;
  delete global.eventRequests;
}

beforeEach(cleanup);
afterEach(cleanup);

describe('interactionCreate dispatcher (source-level)', () => {
  test('routes channel-select-menu interactions to the select handler, not just string-select-menu ones', () => {
    // Must check both types on the same branch that imports/calls handleSelectInteraction.
    const dispatchBlockMatch = INDEX_SOURCE.match(
      /else if \((.*isStringSelectMenu.*)\)\s*{\s*const \{ handleSelectInteraction \}/
    );

    expect(dispatchBlockMatch).not.toBeNull();
    expect(dispatchBlockMatch[1]).toMatch(/isChannelSelectMenu/);
  });
});

describe('handleSelectInteraction with a channel-select-menu interaction', () => {
  function makeChannelSelectInteraction({ customId, values }) {
    return {
      customId,
      guildId: 'guild-1',
      values,
      message: { components: [] },
      update: async () => {},
    };
  }

  test('stores a text channel selection and persists it', async () => {
    const interaction = makeChannelSelectInteraction({
      customId: 'select_text_channel_1234567890_abcdef',
      values: ['channel-general'],
    });

    await handleSelectInteraction(interaction);

    const key = 'guild-1_1234567890_abcdef';
    expect(global.eventChannelSelections.get(key)).toEqual(
      expect.objectContaining({ textChannelId: 'channel-general' })
    );
  });

  test('stores a voice channel selection alongside an existing text selection', async () => {
    const requestId = '1234567890_abcdef';
    global.eventChannelSelections = new Map([
      [`guild-1_${requestId}`, { textChannelId: 'channel-general' }],
    ]);

    const interaction = makeChannelSelectInteraction({
      customId: `select_voice_channel_${requestId}`,
      values: ['voice-1'],
    });

    await handleSelectInteraction(interaction);

    expect(global.eventChannelSelections.get(`guild-1_${requestId}`)).toEqual({
      textChannelId: 'channel-general',
      voiceChannelId: 'voice-1',
    });
  });

  test('an empty voice selection (deselecting) stores null, not undefined', async () => {
    const interaction = makeChannelSelectInteraction({
      customId: 'select_voice_channel_1234567890_abcdef',
      values: [],
    });

    await handleSelectInteraction(interaction);

    const key = 'guild-1_1234567890_abcdef';
    expect(global.eventChannelSelections.get(key).voiceChannelId).toBeNull();
  });
});

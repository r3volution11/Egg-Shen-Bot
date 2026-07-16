/**
 * Tests for src/utils/interactionResponse.js's deliverResult and the
 * private-flag encode/decode helpers.
 *
 * Search commands (/movie, /tv, /episode, etc.) always defer ephemeral so a
 * multi-result picker doesn't clutter the channel, but the final answer
 * should be visible to everyone unless the user explicitly asked to keep
 * it private (private:true). deliverResult is the single place that
 * decision is made, used by both a command's single-result fast path and
 * selectHandler.js's picker-selection branches.
 *
 * Run with: npx jest tests/services/interactionResponse.test.js --verbose
 */

import { describe, test, expect, jest } from '@jest/globals';
import { deliverResult, encodePrivateFlag, decodePrivateFlag } from '../../src/utils/interactionResponse.js';

describe('deliverResult — isPrivate: true', () => {
  test('edits the existing (ephemeral) reply in place, does not touch the channel', async () => {
    const interaction = {
      deferred: true,
      replied: false,
      editReply: jest.fn().mockResolvedValue(undefined),
      deleteReply: jest.fn(),
      channel: { send: jest.fn() },
    };

    await deliverResult(interaction, { content: 'hi' }, true);

    expect(interaction.editReply).toHaveBeenCalledWith({ content: 'hi' });
    expect(interaction.deleteReply).not.toHaveBeenCalled();
    expect(interaction.channel.send).not.toHaveBeenCalled();
  });
});

describe('deliverResult — isPrivate: false (default)', () => {
  test('deletes a deferred/replied ephemeral reply and posts publicly to the channel', async () => {
    const interaction = {
      deferred: true,
      replied: false,
      editReply: jest.fn(),
      deleteReply: jest.fn().mockResolvedValue(undefined),
      channel: { send: jest.fn().mockResolvedValue(undefined) },
    };

    await deliverResult(interaction, { content: 'hi' });

    expect(interaction.deleteReply).toHaveBeenCalledTimes(1);
    expect(interaction.editReply).not.toHaveBeenCalled();
    expect(interaction.channel.send).toHaveBeenCalledWith({ content: 'hi' });
  });

  test('deletes the ephemeral picker message for a select-menu interaction and posts publicly', async () => {
    const interaction = {
      deferred: false,
      replied: false,
      message: { delete: jest.fn().mockResolvedValue(undefined) },
      channel: { send: jest.fn().mockResolvedValue(undefined) },
    };

    await deliverResult(interaction, { content: 'hi' }, false);

    expect(interaction.message.delete).toHaveBeenCalledTimes(1);
    expect(interaction.channel.send).toHaveBeenCalledWith({ content: 'hi' });
  });

  test('a failed delete does not block posting the public result', async () => {
    const interaction = {
      deferred: true,
      replied: false,
      deleteReply: jest.fn().mockRejectedValue(new Error('Unknown Message')),
      channel: { send: jest.fn().mockResolvedValue(undefined) },
    };

    await expect(deliverResult(interaction, { content: 'hi' }, false)).resolves.not.toThrow();
    expect(interaction.channel.send).toHaveBeenCalledWith({ content: 'hi' });
  });

  test('defaults to public (isPrivate omitted)', async () => {
    const interaction = {
      deferred: true,
      replied: false,
      deleteReply: jest.fn().mockResolvedValue(undefined),
      channel: { send: jest.fn().mockResolvedValue(undefined) },
    };

    await deliverResult(interaction, { content: 'hi' });

    expect(interaction.channel.send).toHaveBeenCalled();
  });
});

describe('encodePrivateFlag / decodePrivateFlag', () => {
  test('round-trips a value with private:true', () => {
    const encoded = encodePrivateFlag('movie_12345', true);
    expect(decodePrivateFlag(encoded)).toEqual({ value: 'movie_12345', isPrivate: true });
  });

  test('round-trips a value with private:false', () => {
    const encoded = encodePrivateFlag('movie_12345', false);
    expect(decodePrivateFlag(encoded)).toEqual({ value: 'movie_12345', isPrivate: false });
  });

  test('round-trips a value that itself contains underscores', () => {
    const encoded = encodePrivateFlag('episode_98765_Some_Episode_Name', true);
    expect(decodePrivateFlag(encoded)).toEqual({ value: 'episode_98765_Some_Episode_Name', isPrivate: true });
  });
});
